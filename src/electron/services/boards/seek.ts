import { Locator, Page } from "playwright"
import {
  humanDelay,
  JobBoardAdapter,
  ScrapeContext,
  ScrapeError,
  sleep,
} from "./adapter.js"
import { extractMetadata } from "./metadata.js"

/**
 * Seek adapter.
 *
 * Deliberately shaped differently from linkedin.ts, because Seek is a different
 * kind of site and pretending otherwise costs reliability:
 *
 *   - LinkedIn is one long page whose detail pane swaps in place, so it is
 *     scraped by clicking cards and watching the pane change.
 *   - Seek renders a plain, addressable result list. Every card carries its
 *     posting id, and every posting has a standalone URL. So the list is *read*
 *     in one pass and each new posting is then fetched by URL.
 *
 * Reading the list first means a re-run does no navigation at all for postings
 * already stored — the id is on the card, so the skip happens before any page
 * load. It also sidesteps the result page's card links, which are invisible
 * overlay anchors carrying target="_blank"; clicking those opens tabs rather
 * than navigating, which is a fight worth not having.
 *
 * Seek and JobStreet are the same platform behind different domains, and both
 * redirect to the same place. Everything is built against the Seek domain.
 *
 * No sign-in is required for any of this.
 */

// ---------- constants ----------

const BASE_URL = "https://www.seek.com.au"
const DEFAULT_TIMEOUT_MS = 15_000
const DETAIL_TIMEOUT_MS = 12_000
const POLL_INTERVAL_MS = 150
const DEFAULT_MAX_PAGES = 20
const DEFAULT_MAX_JOBS = 300

/**
 * Every Seek-specific locator, verified against the live site.
 *
 * `card` matches on data-testid rather than data-automation because the
 * data-automation value varies with how the listing was bought — "normalJob"
 * for ordinary postings, "premiumJob" for promoted ones. Matching the
 * automation value would silently drop every promoted job on the page.
 */
const SELECTORS = {
  /** One result in the list. */
  card: 'article[data-testid="job-card"]',
  cardTitle: '[data-automation="jobTitle"]',
  cardCompany: '[data-automation="jobCompany"]',
  cardLocation: '[data-automation="jobLocation"]',
  cardSalary: '[data-automation="jobSalary"]',
  /** "33m ago", "21d ago", "Featured". */
  cardDate: '[data-automation="jobListingDate"]',

  /** On the standalone posting page. */
  detailBody: '[data-automation="jobAdDetails"]',
  detailTitle: '[data-automation="job-detail-title"]',
  detailCompany: '[data-automation="advertiser-name"]',
  detailLocation: '[data-automation="job-detail-location"]',
  detailWorkType: '[data-automation="job-detail-work-type"]',
  detailSalary: '[data-automation="job-detail-salary"]',

  /**
   * Seek's own "No matching search results" panel. Shown both for a search
   * that matches nothing and for a page number past the last result, and never
   * shown when there are results — so it is the authoritative end marker.
   */
  zeroResults: '[data-automation="search-zero-results"]',
}

/** The posting id, carried on the card itself. */
const JOB_ID_ATTRIBUTE = 'data-job-id'

/**
 * Seek's date filter, as days. These are the values behind the "Listed any
 * time" dropdown on the results page.
 */
const DATE_POSTED_CODE: Record<DatePosted, string> = {
  '24h': '1',
  'week': '7',
  'month': '31',
}

/**
 * The work-type path segment.
 *
 * Seek has no internship filter. Contract/Temp is the closest bucket that
 * actually holds them, which is what the app's "internship" maps to — the
 * keyword search is what narrows it the rest of the way.
 */
const JOB_TYPE_SEGMENT: Record<JobType, string> = {
  'full-time': 'full-time',
  'part-time': 'part-time',
  'internship': 'contract-temp',
}

// ---------- search URLs ----------

/**
 * Seek's own URL shape: /{keywords}-jobs/in-{location}/{work-type}.
 *
 * Words are hyphen-joined and anything that isn't a letter or digit is dropped,
 * which is how Seek writes these itself. The location does not have to be
 * exact — "Melbourne" is resolved server-side to Seek's own "All-Melbourne-VIC"
 * region — so a plain city name from the user works without a lookup table.
 */
function toSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildSearchUrls(params: SearchParams): string[] {
  const keywords = params.keywords.map(keyword => keyword.trim()).filter(Boolean)
  const locations = params.location.map(location => location.trim()).filter(Boolean)
  const targets: (string | null)[] = locations.length ? locations : [null]

  // Keywords go into one slug rather than one URL each: Seek treats the slug as
  // a phrase search, and separate runs per keyword would multiply the page
  // loads for the same result set.
  const keywordSlug = toSlug(keywords.join(' '))

  return targets.map(location => {
    const segments = [keywordSlug ? `${keywordSlug}-jobs` : 'jobs']

    if (location) segments.push(`in-${toSlug(location)}`)
    if (params.jobType) segments.push(JOB_TYPE_SEGMENT[params.jobType])

    const url = new URL(`/${segments.join('/')}`, BASE_URL)

    if (params.datePosted) {
      const code = DATE_POSTED_CODE[params.datePosted]
      if (code) url.searchParams.set('daterange', code)
    }

    return url.toString()
  })
}

/** Seek paginates by query string, so a page is addressable without clicking. */
function withPage(searchUrl: string, pageNumber: number): string {
  const url = new URL(searchUrl)
  if (pageNumber > 1) url.searchParams.set('page', String(pageNumber))
  return url.toString()
}

function jobUrl(jobId: string): string {
  return `${BASE_URL}/job/${jobId}`
}

// ---------- reading the result list ----------

/** First non-empty innerText for a selector, scoped to one card or the page. */
async function textOf(scope: Locator | Page, selector: string): Promise<string> {
  const target = scope.locator(selector).first()
  if (await target.count() === 0) return ''
  return (await target.innerText().catch(() => '')).trim()
}

/** What a card gives us before anything is opened. */
interface CardSummary {
  jobId: string
  title: string
  company: string
  location: string | null
  /** Card text used for date/salary parsing — more reliable than the body copy. */
  metaText: string
}

async function readCard(card: Locator): Promise<CardSummary | null> {
  const jobId = (await card.getAttribute(JOB_ID_ATTRIBUTE).catch(() => null))?.trim()
  if (!jobId) return null

  const [title, company, location, salary, date] = await Promise.all([
    textOf(card, SELECTORS.cardTitle),
    textOf(card, SELECTORS.cardCompany),
    textOf(card, SELECTORS.cardLocation),
    textOf(card, SELECTORS.cardSalary),
    textOf(card, SELECTORS.cardDate),
  ])

  return {
    jobId,
    title,
    company,
    location: location || null,
    metaText: [date, salary, location].filter(Boolean).join(' • '),
  }
}

/**
 * How a result page turned out.
 *
 * 'empty' and 'unreadable' both mean no cards, and keeping them apart is the
 * difference between "your search found nothing" and "we can no longer read
 * Seek". Guessing between those is how a working scan ends up reporting a bug
 * that isn't there, and a real breakage gets shrugged off as a quiet search.
 */
type PageOutcome =
  | { kind: 'results'; count: number }
  | { kind: 'empty' }
  | { kind: 'unreadable' }

/**
 * Waits for the result list to render, or for Seek to say there is nothing.
 *
 * Races the two rather than waiting on cards alone: an exhausted search would
 * otherwise sit out the full timeout on every run before the page could be
 * called empty. Polling rather than waiting once because the list is drawn
 * after the page shell, and a single check races it.
 */
async function waitForResults(page: Page): Promise<PageOutcome> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS

  while (Date.now() < deadline) {
    const count = await page.locator(SELECTORS.card).count().catch(() => 0)
    if (count > 0) return { kind: 'results', count }

    const empty = await page.locator(SELECTORS.zeroResults).count().catch(() => 0)
    if (empty > 0) return { kind: 'empty' }

    await sleep(POLL_INTERVAL_MS)
  }

  return { kind: 'unreadable' }
}

/** Diagnostic dump for when a page cannot be read. */
async function probeSelectors(page: Page): Promise<string> {
  const lines: string[] = [`url = ${page.url()}`]

  for (const [name, selector] of Object.entries(SELECTORS)) {
    const count = await page.locator(selector).count().catch(() => -1)
    lines.push(`  ${String(count).padStart(3)}  ${name}  →  ${selector}`)
  }

  return lines.join('\n')
}

// ---------- reading one posting ----------

/**
 * Opens a posting and returns it, or null if it could not be read.
 *
 * The description is polled for rather than awaited once because the body is
 * hydrated after the shell; a posting that never fills in is skipped rather
 * than failing the run, since one dead listing should not cost the other
 * ninety-nine.
 */
async function readJob(page: Page, card: CardSummary): Promise<Job | null> {
  await page.goto(jobUrl(card.jobId), { waitUntil: 'domcontentloaded' })

  const body = page.locator(SELECTORS.detailBody).first()
  const deadline = Date.now() + DETAIL_TIMEOUT_MS
  let aboutText = ''

  while (Date.now() < deadline) {
    if (await body.count() > 0) {
      aboutText = (await body.innerText().catch(() => '')).trim()
      if (aboutText) break
    }
    await sleep(POLL_INTERVAL_MS)
  }

  if (!aboutText) return null

  // The card is the better source for title and company — it is already read
  // and always populated — but a posting reached from a stale card can have
  // them missing, so the detail page backs them up.
  const title = card.title || await textOf(page, SELECTORS.detailTitle)
  const company = card.company || await textOf(page, SELECTORS.detailCompany)
  if (!title || !company) return null

  const location = card.location || (await textOf(page, SELECTORS.detailLocation)) || null

  // Seek states work type and salary as their own fields, so they are read
  // rather than guessed at out of prose. The text parser is the fallback for
  // postings that leave them off, and it is the only source for the posted
  // date, which Seek writes only on the card.
  const [workTypeText, salaryText] = await Promise.all([
    textOf(page, SELECTORS.detailWorkType),
    textOf(page, SELECTORS.detailSalary),
  ])

  const metadata = extractMetadata(
    [card.metaText, workTypeText, salaryText].filter(Boolean).join(' • '),
    aboutText
  )

  return {
    source: 'seek',
    jobId: card.jobId,
    url: jobUrl(card.jobId),
    title,
    company,
    location,
    aboutText,
    postedAt: metadata.postedAt,
    salary: salaryText || metadata.salary,
    workType: metadata.workType,
  }
}

// ---------- iteration ----------

/**
 * One result page: read every card, then fetch the ones we do not already have.
 *
 * Returns false when the page held no cards, which ends the run — Seek keeps
 * serving a valid page past the last result, so an empty page is the only
 * reliable end marker.
 */
async function scrapeResultPage(
  ctx: ScrapeContext,
  searchUrl: string,
  pageNumber: number,
  maxJobs: number
): Promise<boolean> {
  const { page, token, report, tally } = ctx
  const url = withPage(searchUrl, pageNumber)

  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const outcome = await waitForResults(page)

  if (outcome.kind === 'empty') {
    // Seek said so itself. On page 1 the search matched nothing; on any later
    // page the results simply ran out. Either way there is no more to read.
    console.log(`[seek] no results on page ${pageNumber}`)
    return false
  }

  if (outcome.kind === 'unreadable') {
    console.error(`[seek] result list unreadable\n${await probeSelectors(page)}`)
    throw new ScrapeError(
      "Seek's results page could not be read. This usually means they have changed their site, so the scan needs updating.",
      `neither cards nor the zero-results panel appeared; URL ${page.url()} — see the selector probe above`
    )
  }

  const cardCount = outcome.count
  console.log(`[seek] page ${pageNumber}: ${cardCount} card(s)`)

  // Read the whole list up front. The cards are re-rendered as soon as we
  // navigate away to a posting, so holding Locators across that would break;
  // holding plain data does not.
  const summaries: CardSummary[] = []
  const cards = page.locator(SELECTORS.card)

  for (let index = 0; index < cardCount; index++) {
    const summary = await readCard(cards.nth(index)).catch(() => null)
    if (summary) summaries.push(summary)
    else tally.failed++
  }

  for (const summary of summaries) {
    token.throwIfCancelled()
    if (tally.inserted >= maxJobs) return false

    // Skipped before any navigation — this is the whole speed-up on a re-run.
    if (ctx.isKnown(summary.jobId)) {
      tally.skipped++
      report({})
      continue
    }

    try {
      const job = await readJob(page, summary)
      if (!job) {
        tally.failed++
        continue
      }

      if (ctx.saveJob(job)) tally.inserted++
      else tally.skipped++

      report({ message: job.title })
      await humanDelay(350, 900)
    } catch (err) {
      if (token.isCancelled) throw err
      tally.failed++
      console.error(`[seek] skipped ${summary.jobId}:`, err instanceof Error ? err.message : err)
    }
  }

  return true
}

async function scrapeSearchUrl(ctx: ScrapeContext, searchUrl: string): Promise<void> {
  const { report, token, params, tally } = ctx
  const maxPages = Math.max(params.maxPages ?? DEFAULT_MAX_PAGES, 1)
  const maxJobs = Math.max(params.maxJobs ?? DEFAULT_MAX_JOBS, 1)

  report({ phase: 'searching', message: 'Searching Seek' })
  console.log(`[seek] requesting ${searchUrl}`)

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber++) {
    token.throwIfCancelled()
    report({ phase: 'scraping', page: pageNumber })

    const hadResults = await scrapeResultPage(ctx, searchUrl, pageNumber, maxJobs)
    if (!hadResults) return

    if (tally.inserted >= maxJobs) {
      report({ message: `Reached the ${maxJobs} job limit` })
      return
    }
  }
}

// ---------- adapter ----------

export const seekAdapter: JobBoardAdapter = {
  name: 'seek',

  buildSearchUrls,

  run: async (ctx: ScrapeContext) => {
    for (const url of buildSearchUrls(ctx.params)) {
      ctx.token.throwIfCancelled()
      await scrapeSearchUrl(ctx, url)
    }
  },
}

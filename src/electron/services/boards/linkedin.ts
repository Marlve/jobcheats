import { Locator, Page } from "playwright"
import { playwrightService } from "../playwrightService.js"
import {
  CancellationToken,
  humanDelay,
  JobBoardAdapter,
  ScrapeContext,
  ScrapeError,
  sleep,
} from "./adapter.js"
import { extractMetadata, JobMetadata } from "./metadata.js"
import { jobIdsFrom } from "./links.js"
import { buildSearchQuery } from "./query.js"

// ---------- constants ----------
const BASE_URL = "https://www.linkedin.com"
/**
 * LinkedIn's current search path. The older `/jobs/search/` still resolves, but
 * it redirects here, and an empty search under the old path does not reliably
 * render the recommendations block that `scrapeSimilarJobs` reads.
 *
 * Both paths contain "/jobs/search", which is what the post-login redirect
 * check below keys off — that check keeps working either way.
 */
const SEARCH_PATH = "/jobs/search-results/"
const DEFAULT_TIMEOUT_MS = 15_000
const DETAIL_TIMEOUT_MS = 12_000
const POLL_INTERVAL_MS = 150
/** How long we wait for a human to clear a login screen or challenge. */
const AUTH_TIMEOUT_MS = 2 * 60_000
const DEFAULT_MAX_PAGES = 20
const DEFAULT_MAX_JOBS = 300
/** Upper bound on loop turns per result page, in case the list never settles. */
const MAX_CARDS_PER_PAGE = 60
const CARD_KEY_PREFIX = "job-card-component-ref-"

/** LinkedIn's `f_JT` filter codes. */
const JOB_TYPE_CODE: Record<JobType, string> = {
  'full-time': 'F',
  'part-time': 'P',
  'internship': 'I',
}

/** LinkedIn's `f_TPR` filter codes, in seconds. */
const DATE_POSTED_CODE: Record<DatePosted, string> = {
  '24h': 'r86400',
  'week': 'r604800',
  'month': 'r2592000',
}

/**
 * Selects the search that reads the query as a sentence rather than as terms.
 *
 * Not decoration: this is what routes the request to the parser that
 * understands "in malaysia" as a place. Without it the location clause is just
 * more words to match against job text.
 */
const SEMANTIC_ORIGIN = 'SEMANTIC_SEARCH_LANDING_PAGE'

const NEXT_BUTTON_SELECTOR =
  '[data-testid^="pagination-controls-next-button-visible"], button[aria-label="View next page"]'

// ---------- layouts ----------

/**
 * LinkedIn serves more than one job-search DOM depending on account, locale and
 * A/B bucket. Rather than pin one set of selectors, describe each layout we know
 * about and detect which one rendered.
 */
interface CardLayout {
  name: string
  cardSelector: string
  detailSelector: string
  jobId(card: Locator): Promise<string | null>
  fields(card: Locator): Promise<{ title: string; company: string; location: string | null }>
}

/** First non-empty innerText among the candidate selectors. */
async function firstText(scope: Locator, selectors: string[]): Promise<string> {
  for (const selector of selectors) {
    const target = scope.locator(selector).first()
    if (await target.count() === 0) continue

    const text = (await target.innerText().catch(() => '')).trim()
    if (text) return text
  }
  return ''
}

const componentKeyLayout: CardLayout = {
  name: 'componentkey',
  cardSelector: `[componentkey^="${CARD_KEY_PREFIX}"][role="button"]`,
  detailSelector: '[id^="JobDetails_AboutTheJob_"]',

  jobId: async (card) => {
    const key = await card.getAttribute('componentkey').catch(() => null)
    if (!key?.startsWith(CARD_KEY_PREFIX)) return null
    const id = key.slice(CARD_KEY_PREFIX.length).trim()
    return id.length ? id : null
  },

  fields: async (card) => {
    const title = await firstText(card, ['span[aria-hidden="true"]'])
    const paragraphs = card.locator('p')
    const pCount = await paragraphs.count()

    const company = pCount > 1 ? (await paragraphs.nth(1).innerText().catch(() => '')).trim() : ''
    const location = pCount > 2 ? (await paragraphs.nth(2).innerText().catch(() => '')).trim() : ''

    return { title, company, location: location || null }
  },
}

const classicLayout: CardLayout = {
  name: 'classic',
  cardSelector: 'li.jobs-search-results__list-item, .job-card-container[data-job-id], [data-occludable-job-id]',
  detailSelector: '.jobs-description__content, #job-details, .jobs-box__html-content',

  jobId: async (card) => {
    for (const attr of ['data-job-id', 'data-occludable-job-id']) {
      const value = (await card.getAttribute(attr).catch(() => null))?.trim()
      if (value) return value
    }

    // Fall back to the posting link, e.g. /jobs/view/4448816646/
    const href = await card
      .locator('a[href*="/jobs/view/"]')
      .first()
      .getAttribute('href')
      .catch(() => null)

    return href?.match(/\/jobs\/view\/(\d+)/)?.[1] ?? null
  },

  fields: async (card) => {
    const title = await firstText(card, [
      '.job-card-list__title--link',
      '.job-card-list__title',
      'a.job-card-container__link',
      '.artdeco-entity-lockup__title',
    ])
    const company = await firstText(card, [
      '.artdeco-entity-lockup__subtitle',
      '.job-card-container__primary-description',
      '.job-card-container__company-name',
    ])
    const location = await firstText(card, [
      '.job-card-container__metadata-item',
      '.artdeco-entity-lockup__caption',
      '.job-card-container__metadata-wrapper li',
    ])

    return { title, company, location: location || null }
  },
}

const LAYOUTS: CardLayout[] = [componentKeyLayout, classicLayout]

async function detectLayout(page: Page): Promise<CardLayout | null> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS

  while (Date.now() < deadline) {
    for (const layout of LAYOUTS) {
      const count = await page.locator(layout.cardSelector).count().catch(() => 0)
      if (count > 0) {
        console.log(`[linkedin] layout "${layout.name}" matched with ${count} card(s) visible`)
        return layout
      }
    }
    await sleep(POLL_INTERVAL_MS)
  }

  return null
}

/** Diagnostic dump for when no layout matches. */
async function probeSelectors(page: Page): Promise<string> {
  const candidates: Record<string, string> = {
    'cards: componentkey + role=button': componentKeyLayout.cardSelector,
    'cards: componentkey (any)': `[componentkey^="${CARD_KEY_PREFIX}"]`,
    'cards: classic': classicLayout.cardSelector,
    'cards: base-card': '.base-card',
    'cards: any data-job-id': '[data-job-id]',
    'list: scaffold': '.scaffold-layout__list',
    'detail: AboutTheJob': componentKeyLayout.detailSelector,
    'detail: classic': classicLayout.detailSelector,
    'no results banner': '.jobs-search-no-results-banner',
  }

  const lines: string[] = [`url = ${page.url()}`]
  for (const [label, selector] of Object.entries(candidates)) {
    const count = await page.locator(selector).count().catch(() => -1)
    lines.push(`  ${String(count).padStart(3)}  ${label}  →  ${selector}`)
  }

  return lines.join('\n')
}

// ---------- auth ----------

/**
 * URL fragments that mean LinkedIn has stopped to ask for a human.
 *
 * PLACEHOLDER — these are the ones observed so far. Replace or extend with the
 * exact links you see; nothing else in this file hard-codes an auth URL.
 */
const AUTH_URL_PATTERNS = ['/login', '/authwall', '/checkpoint/', '/uas/']

/**
 * URL fragments that mean postings can be reached again — the signal that a
 * sign-in actually finished, rather than merely that the login page went away.
 *
 * PLACEHOLDER — same as above. Widen this if signing in drops you somewhere
 * that should also count as done.
 */
const JOB_URL_PATTERNS = ['/jobs/']

function matchesAny(url: string, fragments: string[]): boolean {
  return fragments.some(fragment => url.includes(fragment))
}

/** True while LinkedIn is showing a login screen or a challenge. */
function needsHuman(page: Page): boolean {
  return matchesAny(page.url(), AUTH_URL_PATTERNS)
}

/** True once the browser is back on a page that serves job links. */
function canReachJobs(page: Page): boolean {
  const url = page.url()
  return !matchesAny(url, AUTH_URL_PATTERNS) && matchesAny(url, JOB_URL_PATTERNS)
}

/**
 * Holds the scan while a human signs in, and hands the window back afterwards.
 *
 * The window sits off-screen for the whole scan except this. It comes back only
 * because there is something for the user to do, and is put aside again once
 * they have done it — an already-signed-in scan never surfaces at all.
 *
 * Waiting on the login screen disappearing is not the same as waiting on the
 * sign-in working: LinkedIn drops you on the feed as often as back where you
 * were. So once the auth wall clears, `returnTo` is re-requested and the wait
 * only ends when job links are actually reachable.
 */
async function ensureAuthenticated(
  page: Page,
  token: CancellationToken,
  report: ScrapeContext['report'],
  returnTo?: string
) {
  if (!needsHuman(page)) return

  // Logged so a window that fails to appear can be told apart from an auth wall
  // that was never noticed — they look identical from the app.
  console.log(`[linkedin] sign-in required, showing the browser: ${page.url()}`)
  report({ phase: 'authenticating', message: 'Waiting for you to sign in to LinkedIn' })
  await playwrightService.showWindow(page)

  const start = Date.now()
  while (needsHuman(page)) {
    token.throwIfCancelled()

    if (Date.now() - start > AUTH_TIMEOUT_MS) {
      throw new ScrapeError(
        `Sign-in was not finished within ${AUTH_TIMEOUT_MS / 60_000} minutes, so the scan stopped. Sign in to LinkedIn in the browser window, then run the scan again.`,
        `auth wall not cleared in time; last URL ${page.url()}`
      )
    }
    await sleep(1000)
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {})

  // Signing in commonly lands on the feed rather than back on the search.
  if (returnTo && !canReachJobs(page)) {
    console.log(`[linkedin] signed in at ${page.url()}, returning to ${returnTo}`)
    await page.goto(returnTo, { waitUntil: 'domcontentloaded' })
  }

  await playwrightService.parkWindow(page)
  report({ phase: 'scraping', message: 'Signed in' })
}

// ---------- search ----------

function buildSearchUrls(params: SearchParams): string[] {
  const locations = params.location.map(location => location.trim()).filter(Boolean)
  const targets: (string | null)[] = locations.length ? locations : [null]

  return targets.map(location => {
    const url = new URL(SEARCH_PATH, BASE_URL)

    url.searchParams.set('keywords', buildSearchQuery(params, location))
    url.searchParams.set('origin', SEMANTIC_ORIGIN)

    // The date and type are said in the query *and* sent as filters. The
    // sentence is what a parser makes of it; these are enforced. The 24-hour
    // window is a product rule the retention sweep depends on, so it is not
    // something to leave to interpretation.
    if (params.datePosted) url.searchParams.set('f_TPR', DATE_POSTED_CODE[params.datePosted])
    if (params.jobType) url.searchParams.set('f_JT', JOB_TYPE_CODE[params.jobType])
    url.searchParams.set('sortBy', 'DD')

    return url.toString()
  })
}

// ---------- job details ----------

/**
 * Waits for the detail pane to actually belong to `expectedJobId`.
 *
 * The URL's `currentJobId` is authoritative, so that is the primary signal. The
 * pane's element id / text confirm it re-rendered, which is what makes this
 * reliable when two consecutive postings share identical copy — the old
 * text-diff approach timed out on those.
 */
async function waitForJobDetail(
  page: Page,
  layout: CardLayout,
  expectedJobId: string,
  previous: { id: string | null; text: string }
): Promise<{ id: string | null; text: string }> {
  const detail = page.locator(layout.detailSelector).first()
  const start = Date.now()
  let fallback: { id: string | null; text: string } | null = null

  while (Date.now() - start < DETAIL_TIMEOUT_MS) {
    const currentJobId = new URL(page.url()).searchParams.get('currentJobId')

    if (currentJobId === expectedJobId && await detail.count() > 0) {
      const id = await detail.getAttribute('id').catch(() => null)
      const text = (await detail.innerText().catch(() => '')).trim()

      if (text.length > 0) {
        if (id !== previous.id || text !== previous.text) return { id, text }
        // Right job, but indistinguishable from the previous one. Keep polling
        // in case the pane is stale, and accept it if nothing changes.
        fallback = { id, text }
      }
    }

    await sleep(POLL_INTERVAL_MS)
  }

  if (fallback) return fallback
  throw new Error(`Timed out waiting for details of job ${expectedJobId}`)
}

function buildJob(
  jobId: string,
  title: string,
  company: string,
  location: string | null,
  aboutText: string,
  metadata: JobMetadata
): Job | null {
  if (!title || !company || !aboutText.trim()) return null

  return {
    source: 'linkedin',
    jobId,
    url: `${BASE_URL}/jobs/view/${jobId}/`,
    title,
    company,
    location,
    aboutText,
    postedAt: metadata.postedAt,
    salary: metadata.salary,
    workType: metadata.workType,
  }
}

// ---------- pagination ----------

async function firstCardKey(page: Page, layout: CardLayout): Promise<string | null> {
  const first = page.locator(layout.cardSelector).first()
  if (await first.count() === 0) return null
  return layout.jobId(first)
}

/**
 * Clicks through to the next result page.
 *
 * Returns false when there is no further page. The button is checked for
 * *enabled*, not just present — LinkedIn leaves a disabled next button in the
 * DOM on the last page, which a bare `count() > 0` check would loop on forever.
 */
async function goToNextPage(page: Page, layout: CardLayout, token: CancellationToken): Promise<boolean> {
  const nextButton = page.locator(NEXT_BUTTON_SELECTOR).first()

  if (await nextButton.count() === 0) return false
  if (!await nextButton.isEnabled().catch(() => false)) return false

  const previousKey = await firstCardKey(page, layout)
  await nextButton.click()

  // Wait for the list to actually swap out, otherwise the next iteration
  // re-reads the page we just finished.
  const start = Date.now()
  while (Date.now() - start < DEFAULT_TIMEOUT_MS) {
    token.throwIfCancelled()

    const currentKey = await firstCardKey(page, layout)
    if (currentKey && currentKey !== previousKey) return true

    await sleep(POLL_INTERVAL_MS)
  }

  throw new ScrapeError(
    'The next page of results did not load in time. Everything found before that was kept.',
    `next page did not replace the first card within ${DEFAULT_TIMEOUT_MS}ms; URL ${page.url()}`
  )
}

// ---------- iteration ----------

/**
 * The results list is virtualised: only the cards near the viewport exist in the
 * DOM. Scrolling the last one into view renders the next batch, so the count is
 * re-read every turn instead of being sampled once up front.
 */
async function growCardList(jobCards: Locator, knownCount: number): Promise<number> {
  if (knownCount > 0) {
    await jobCards.nth(knownCount - 1).scrollIntoViewIfNeeded().catch(() => {})
  }

  const deadline = Date.now() + 3000
  while (Date.now() < deadline) {
    await sleep(300)
    const count = await jobCards.count()
    if (count > knownCount) return count
  }

  return knownCount
}

async function scrapeResultPage(ctx: ScrapeContext, layout: CardLayout, maxJobs: number): Promise<void> {
  const { page, token, report, tally } = ctx
  const jobCards = page.locator(layout.cardSelector)

  let previousDetail: { id: string | null; text: string } = { id: null, text: '' }
  let cardCount = await jobCards.count()
  let index = 0

  while (index < MAX_CARDS_PER_PAGE) {
    token.throwIfCancelled()
    if (tally.inserted >= maxJobs) return

    if (index >= cardCount) {
      const grown = await growCardList(jobCards, cardCount)
      if (grown <= cardCount) break // list exhausted
      cardCount = grown
    }

    const jobCard = jobCards.nth(index)
    index++

    try {
      await jobCard.scrollIntoViewIfNeeded().catch(() => {})

      const jobId = await layout.jobId(jobCard)
      if (!jobId) {
        tally.failed++
        continue
      }

      // Skip before clicking — this is the bulk of the speed-up on re-runs.
      if (ctx.isKnown(jobId)) {
        tally.skipped++
        report({})
        continue
      }

      const { title, company, location } = await layout.fields(jobCard)
      const cardText = await jobCard.innerText().catch(() => '')

      await jobCard.click()
      // No returnTo: we are part-way through a result list, and re-requesting
      // the search would throw away the page we have scrolled to.
      await ensureAuthenticated(page, token, report)

      const detail = await waitForJobDetail(page, layout, jobId, previousDetail)
      previousDetail = detail

      const metadata = extractMetadata(cardText, detail.text)
      const job = buildJob(jobId, title, company, location, detail.text, metadata)
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
      console.error(`[linkedin] skipped card ${index - 1}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`[linkedin] finished page after ${index} card(s)`)
}

// ---------- similar jobs ----------

/**
 * What LinkedIn calls the recommendations it shows instead of results. The
 * wording varies by locale and A/B bucket, so all the phrasings we have seen
 * are accepted.
 */
const SIMILAR_HEADING = /similar jobs|jobs you may be interested|recommended for you|people also viewed/i

/**
 * Anything that might identify a posting in the recommendations block.
 *
 * Deliberately wider than either card layout. The block is not the results
 * list and does not have to share its markup — on the current search page the
 * suggestions render as component-key cards, on older ones as plain links — so
 * this asks for all of them and lets `jobIdsFrom` sort out what it got.
 */
const ID_ATTRIBUTES = ['href', 'data-job-id', 'data-occludable-job-id', 'componentkey']

const SIMILAR_CARD_SELECTOR = [
  'a[href*="/jobs/view/"]',
  '[data-job-id]',
  '[data-occludable-job-id]',
  `[componentkey^="${CARD_KEY_PREFIX}"]`,
].join(', ')

/** Where a posting's description lives on a standalone /jobs/view/ page. */
const VIEW_DETAIL_SELECTOR = [
  componentKeyLayout.detailSelector,
  classicLayout.detailSelector,
  '.show-more-less-html__markup',
  '.description__text',
].join(', ')

/**
 * Narrows to the recommendations block when its heading can be found.
 *
 * Falls back to the whole page rather than giving up: on a search that returned
 * nothing there are no result cards to confuse it with, so every posting linked
 * from the page is a recommendation of some kind. Anchoring to the heading is
 * only about not dragging in a "recently viewed" rail when one is present.
 */
async function similarJobsScope(page: Page): Promise<Locator> {
  const heading = page
    .locator('h1, h2, h3, span, strong')
    .filter({ hasText: SIMILAR_HEADING })
    .first()

  if (await heading.count().catch(() => 0) > 0) {
    for (const ancestor of ['xpath=ancestor::section[1]', 'xpath=ancestor::ul[1]']) {
      const scope = heading.locator(ancestor)
      if (await scope.count().catch(() => 0) > 0) {
        console.log('[linkedin] similar jobs: scoped to the section under its heading')
        return scope
      }
    }
  }

  console.log('[linkedin] similar jobs: no heading matched, reading job links page-wide')
  return page.locator('body')
}

/**
 * Opens one posting by URL and stores it.
 *
 * The search page's click-a-card-and-read-the-pane flow does not apply here —
 * there is no results list to click, and no `currentJobId` in the URL for
 * `waitForJobDetail` to key off. Navigating straight to the posting also means
 * the title, company and location come from the posting itself rather than
 * from a card, which is the more reliable source of the two.
 */
async function scrapeJobById(ctx: ScrapeContext, jobId: string): Promise<boolean> {
  const { page, token, report } = ctx

  const viewUrl = `${BASE_URL}/jobs/view/${jobId}/`
  await page.goto(viewUrl, { waitUntil: 'domcontentloaded' })
  await ensureAuthenticated(page, token, report, viewUrl)

  const detail = page.locator(VIEW_DETAIL_SELECTOR).first()
  await detail.waitFor({ timeout: DETAIL_TIMEOUT_MS }).catch(() => {})
  if (await detail.count() === 0) return false

  const aboutText = (await detail.innerText().catch(() => '')).trim()
  const body = page.locator('body')

  const title = await firstText(body, [
    '.job-details-jobs-unified-top-card__job-title',
    '.topcard__title',
    '.top-card-layout__title',
    'h1',
  ])
  const company = await firstText(body, [
    '.job-details-jobs-unified-top-card__company-name',
    '.topcard__org-name-link',
    'a[href*="/company/"]',
  ])
  const location = await firstText(body, [
    '.job-details-jobs-unified-top-card__primary-description-container',
    '.topcard__flavor--bullet',
    '.top-card-layout__second-subline',
  ])

  const job = buildJob(jobId, title, company, location || null, aboutText, extractMetadata('', aboutText))
  if (!job) return false

  const stored = ctx.saveJob(job)
  if (stored) report({ message: job.title })

  return stored
}

/**
 * Takes LinkedIn's recommendations when the search itself found nothing.
 *
 * A search with no results is not an error — LinkedIn answers it with a
 * "Similar jobs" block, and those postings are still scored against the resume
 * like any other. Ending a scan with nothing at all, when the page in front of
 * us is full of jobs, is the worse outcome.
 *
 * Returns how many postings were found, not how many were stored: finding ten
 * you already have still means the fallback worked, and the caller uses this
 * only to decide whether the page was genuinely unreadable.
 */
async function scrapeSimilarJobs(ctx: ScrapeContext, maxJobs: number): Promise<number> {
  const { page, token, report, tally } = ctx

  const remaining = Math.max(maxJobs - tally.inserted, 0)
  if (remaining === 0) return 0

  const scope = await similarJobsScope(page)
  const values = await scope
    .locator(SIMILAR_CARD_SELECTOR)
    .evaluateAll(nodes =>
      nodes.flatMap(node =>
        ID_ATTRIBUTES
          .map(attribute => node.getAttribute(attribute))
          .filter((value): value is string => value !== null)
      ),
      ID_ATTRIBUTES
    )
    .catch(() => [] as string[])

  // `currentJobId` last, so a real card always wins the first slot. On an empty
  // search LinkedIn still opens one of its suggestions in the detail pane, so
  // this alone is worth one job even when nothing else can be read.
  const currentJobId = new URL(page.url()).searchParams.get('currentJobId')
  if (currentJobId) values.push(currentJobId)

  const jobIds = jobIdsFrom(values, remaining)
  if (jobIds.length === 0) return 0

  console.log(`[linkedin] no search results; falling back to ${jobIds.length} similar job(s)`)
  report({
    phase: 'scraping',
    message: `No direct matches — reading ${jobIds.length} similar job${jobIds.length === 1 ? '' : 's'}`,
  })

  for (const jobId of jobIds) {
    token.throwIfCancelled()
    if (tally.inserted >= maxJobs) break

    if (ctx.isKnown(jobId)) {
      tally.skipped++
      report({})
      continue
    }

    try {
      if (await scrapeJobById(ctx, jobId)) tally.inserted++
      else tally.failed++
    } catch (err) {
      if (token.isCancelled) throw err
      tally.failed++
      console.error(`[linkedin] similar job ${jobId} failed:`, err instanceof Error ? err.message : err)
    }

    report({})
    await humanDelay(400, 1100)
  }

  return jobIds.length
}

async function scrapeSearchUrl(ctx: ScrapeContext, searchUrl: string): Promise<void> {
  const { page, token, report, params, tally } = ctx
  const maxPages = Math.max(params.maxPages ?? DEFAULT_MAX_PAGES, 1)
  const maxJobs = Math.max(params.maxJobs ?? DEFAULT_MAX_JOBS, 1)

  // The URL goes to the terminal, not the screen. The query is the readable
  // half of it, and now that it is a sentence it says what is being looked for
  // and where without any unpacking.
  const query = new URL(searchUrl).searchParams.get('keywords')
  report({ phase: 'searching', message: query ? `Searching for ${query}` : 'Searching LinkedIn' })
  console.log(`[linkedin] requesting ${searchUrl}`)
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
  await ensureAuthenticated(page, token, report, searchUrl)
  console.log(`[linkedin] landed on ${page.url()}`)

  // A challenge during login can drop us somewhere else; re-request the search.
  if (!page.url().includes('/jobs/search')) {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
    await ensureAuthenticated(page, token, report, searchUrl)
  }

  const layout = await detectLayout(page)
  if (!layout) {
    // Two very different situations look identical from here: a search that
    // matched nothing, and a DOM we no longer understand. Try the
    // recommendations first — if there are postings on the page we can read,
    // the search was simply empty. Only when that finds nothing either is this
    // a layout we have lost, and the probe is worth dumping.
    if (await scrapeSimilarJobs(ctx, maxJobs) > 0) return

    console.error(`[linkedin] no known layout matched\n${await probeSelectors(page)}`)
    throw new ScrapeError(
      "LinkedIn's results page could not be read. This usually means they have changed their site, so the scan needs updating.",
      `no known layout matched; URL ${page.url()} — see the selector probe above`
    )
  }

  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    token.throwIfCancelled()
    report({ phase: 'scraping', page: pageIndex })

    await scrapeResultPage(ctx, layout, maxJobs)

    if (tally.inserted >= maxJobs) {
      report({ message: `Reached the ${maxJobs} job limit` })
      return
    }
    if (!await goToNextPage(page, layout, token)) return
  }
}

// ---------- adapter ----------

export const linkedinAdapter: JobBoardAdapter = {
  name: 'linkedin',

  buildSearchUrls,

  run: async (ctx: ScrapeContext) => {
    const urls = buildSearchUrls(ctx.params)

    for (const url of urls) {
      ctx.token.throwIfCancelled()
      await scrapeSearchUrl(ctx, url)
    }
  },
}

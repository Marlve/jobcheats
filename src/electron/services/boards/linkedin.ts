import { Locator, Page } from "playwright"
import { playwrightService } from "../playwrightService.js"
import {
  CancellationToken,
  humanDelay,
  JobBoardAdapter,
  ScrapeContext,
  sleep,
} from "./adapter.js"
import { extractMetadata, JobMetadata } from "./metadata.js"

// ---------- constants ----------
const BASE_URL = "https://www.linkedin.com"
const DEFAULT_TIMEOUT_MS = 15_000
const DETAIL_TIMEOUT_MS = 12_000
const POLL_INTERVAL_MS = 150
/** How long we wait for a human to clear a login screen or challenge. */
const AUTH_TIMEOUT_MS = 5 * 60_000
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

/** URL fragments that mean LinkedIn wants a human before showing results. */
function needsHuman(page: Page): boolean {
  const url = page.url()
  return (
    url.includes('/login') ||
    url.includes('/authwall') ||
    url.includes('/checkpoint/') ||
    url.includes('/uas/')
  )
}

async function ensureAuthenticated(page: Page, token: CancellationToken, report: ScrapeContext['report']) {
  if (!needsHuman(page)) return

  report({ phase: 'authenticating', message: 'Waiting for sign-in or challenge to be cleared' })
  await playwrightService.showWindow(page)

  const start = Date.now()
  while (needsHuman(page)) {
    token.throwIfCancelled()

    if (Date.now() - start > AUTH_TIMEOUT_MS) {
      throw new Error(`Sign-in was not completed within ${AUTH_TIMEOUT_MS / 60_000} minutes. Last URL: ${page.url()}`)
    }
    await sleep(1000)
  }

  await page.waitForLoadState('domcontentloaded').catch(() => {})
  // NOTE: deliberately not minimising here. A minimised window is occluded, and
  // LinkedIn stops rendering the virtualised job list when it is.
  report({ phase: 'scraping', message: 'Signed in' })
}

// ---------- search ----------

function buildSearchUrls(params: SearchParams): string[] {
  const keywords = params.keywords.map(k => k.trim()).filter(Boolean)
  // Multiple keywords are alternatives, not a single phrase.
  const query = keywords.length > 1
    ? keywords.map(k => `"${k}"`).join(' OR ')
    : keywords[0] ?? ''

  const locations = params.location.map(l => l.trim()).filter(Boolean)
  const targets: (string | null)[] = locations.length ? locations : [null]

  return targets.map(location => {
    const url = new URL('/jobs/search/', BASE_URL)

    if (query) url.searchParams.set('keywords', query)
    if (location) url.searchParams.set('location', location)
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

  throw new Error('Timed out waiting for the next result page to load')
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

async function scrapeSearchUrl(ctx: ScrapeContext, searchUrl: string): Promise<void> {
  const { page, token, report, params, tally } = ctx
  const maxPages = Math.max(params.maxPages ?? DEFAULT_MAX_PAGES, 1)
  const maxJobs = Math.max(params.maxJobs ?? DEFAULT_MAX_JOBS, 1)

  report({ phase: 'searching', message: searchUrl })
  console.log(`[linkedin] requesting ${searchUrl}`)
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
  await ensureAuthenticated(page, token, report)
  console.log(`[linkedin] landed on ${page.url()}`)

  // A challenge during login can drop us somewhere else; re-request the search.
  if (!page.url().includes('/jobs/search')) {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' })
    await ensureAuthenticated(page, token, report)
  }

  const layout = await detectLayout(page)
  if (!layout) {
    console.error(`[linkedin] no known layout matched\n${await probeSelectors(page)}`)
    throw new Error(`No job cards found on this layout — see the probe in the terminal. URL: ${page.url()}`)
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

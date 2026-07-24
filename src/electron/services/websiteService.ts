import { Page, Locator } from "playwright"
import { playwrightService } from "../services/playwrightService.js"
import { insertJob } from "../db/db.js"

// ---------- constants ----------
const LOGIN_URL = "https://www.linkedin.com/login/"
const JOBS_URL = "https://www.linkedin.com/jobs/"
const SEARCH_QUERY = "internship posted in the past 24 hour"
const DEFAULT_TIMEOUT_MS = 10000
const POLL_INTERVAL_MS = 100

// ---------- selectors ----------
const SELECTORS = {
  jobSearchBox: '[componentkey="jobSearchBox"]',
  jobCard: '[componentkey^="job-card-component-ref-"][role="button"]',
  jobDetail: '[id^="JobDetails_AboutTheJob_"]',
  nextButton: '[data-testid^="pagination-controls-next-button-visible"]',
}

// ---------- auth / navigation ----------

async function checkForCaptcha(page: Page) {
  if (!page.url().includes('checkpoint/challenge')) return

  console.log('CAPTCHA detected — please solve manually')
  await playwrightService.showWindow(page)

  while (page.url().includes('checkpoint/challenge')) {
    await page.waitForTimeout(2000)
  }

  console.log('Resolved — resuming')
  await playwrightService.hideWindow(page)
}

async function login(page: Page) {
  await page.goto(LOGIN_URL)

  const result = await Promise.race([
    page.waitForURL('**checkpoint/challenge**', { timeout: 0 }).then(() => 'challenge' as const),
    page.waitForURL('**/feed/**', { timeout: 0 }).then(() => 'feed' as const),
  ]).catch(() => 'timeout' as const)

  if (result === 'timeout') {
    throw new Error(`Login did not reach feed or challenge in time. Current URL: ${page.url()}`)
  }
}

async function searchJobs(page: Page) {
  console.log("searching for jobs")
  await page.goto(JOBS_URL)

  const searchBox = page.locator(SELECTORS.jobSearchBox)
  await searchBox.first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })

  await searchBox.click()
  await searchBox.fill(SEARCH_QUERY)
  await searchBox.press('Enter')
}

// ---------- job extraction ----------

async function extractJobCardInfo(jobCard: Locator) {
  const title = await jobCard.locator('span[aria-hidden="true"]').first().innerText()

  const paragraphs = jobCard.locator('p')
  const pCount = await paragraphs.count()

  const company = pCount > 1 ? await paragraphs.nth(1).innerText() : null
  const location = pCount > 2 ? await paragraphs.nth(2).innerText() : null

  return { title, company, location }
}

function buildJob(
  jobId: string | null,
  title: string | null,
  company: string | null,
  location: string | null,
  aboutText: string
): Job | null {
  if (!jobId || !title || !company || !location) {
    console.log('Missing required field, skipping job')
    return null
  }
  return { jobId, title, company, location, aboutText }
}

async function waitForTextChange(jobDetail: Locator, previousText: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const current = await jobDetail.innerText().catch(() => '')
    if (current.trim().length > 0 && current.trim() !== previousText.trim()) {
      return current
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error('Timed out waiting for job detail text to change')
}

async function processJobCard(page: Page, jobCard: Locator, jobDetail: Locator) {
  const { title, company, location } = await extractJobCardInfo(jobCard)
  const previousText = await jobDetail.innerText().catch(() => '')

  await jobCard.click()

  const text = await waitForTextChange(jobDetail, previousText)

  const url = new URL(page.url())
  const jobId = url.searchParams.get('currentJobId')

  return buildJob(jobId, title, company, location, text)
}

async function iterateJobs(page: Page): Promise<void> {
  let hasNextPage = true

  while (hasNextPage) {
    const jobCards = page.locator(SELECTORS.jobCard)
    await jobCards.first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    const jobsCount = await jobCards.count()
    const jobDetail = page.locator(SELECTORS.jobDetail)

    for (let j = 0; j < jobsCount; j++) {
      try {
        const job = await processJobCard(page, jobCards.nth(j), jobDetail)
        if (job) insertJob(job)
      } catch (err: any) {
        console.log(`Skipped job ${j}:`, err?.message ?? err)
      }
    }

    const nextButton = page.locator(SELECTORS.nextButton)
    hasNextPage = await nextButton.count() > 0
    if (hasNextPage) await nextButton.click()
  }
}

// ---------- entry point ----------

export const linkedinService = {
  scrapeJobs: async () => {
    const { page, context } = await playwrightService.openBrowser()

    try {
      await login(page)
      await checkForCaptcha(page)
      await searchJobs(page)
      await iterateJobs(page)
    } finally {
      await context.close()
    }
  }
}

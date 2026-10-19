import { BrowserContext, Locator, Page } from "playwright"
import { fillPage, FillReport } from "./fillPage.js"

/**
 * Getting from a job listing to its application form: pressing Apply, and for
 * LinkedIn's Easy Apply popup, stepping through it.
 *
 * Buttons are found by their accessible name rather than by class — LinkedIn
 * serves one page in two layouts, one with readable class names and one with
 * scrambled ones, and an accessible name is the same in both. Playwright's
 * locators also see into the shadow roots LinkedIn puts the popup in.
 *
 * The only buttons pressed inside the popup are the two in STEP_BUTTONS. Submit
 * is not among them, so the application is only ever sent by a person.
 */

const STEP_BUTTONS = 'button[aria-label="Continue to next step"], button[aria-label="Review your application"]'
/** On the last page of the popup, where only this is left to press. */
const SUBMIT_BUTTON = 'button[aria-label="Submit application"]'
const POPUP = `${STEP_BUTTONS}, ${SUBMIT_BUTTON}`
/** What LinkedIn marks a rejected step with. */
const STEP_ERRORS = '.artdeco-inline-feedback--error, [aria-invalid="true"]'

const EASY_APPLY = /^easy apply\b(?!.*\bfilter\b)/i
/** "Apply", "Apply on company website" — but not the "Apply current filter" buttons a search page carries. */
const EXTERNAL_APPLY = /^apply\b(?!.*\bfilter\b)/i

const FIND_BUTTON_MS = 8_000
const POPUP_MS = 8_000
const NEW_TAB_MS = 10_000
const SETTLE_MS = 1_200
/** A long application has a handful of steps; more than this means it is not advancing. */
const MAX_STEPS = 8

export interface FlowReport extends FillReport {
  /** Where an Easy Apply run stopped: the last page (Submit is yours) or a step that needs an answer. */
  stoppedAt?: 'review' | 'questions'
}

export type ApplyButton = { kind: 'easy' | 'external'; button: Locator }

/** Waits briefly for an Apply button to render — listing pages fill in after they load. */
export async function findApplyButton(page: Page): Promise<ApplyButton | null> {
  const easy = page.getByRole('button', { name: EASY_APPLY }).first()
  const external = page.getByRole('button', { name: EXTERNAL_APPLY })
    .or(page.getByRole('link', { name: EXTERNAL_APPLY }))
    .first()

  await easy.or(external).waitFor({ state: 'visible', timeout: FIND_BUTTON_MS }).catch(() => {})

  if (await easy.isVisible().catch(() => false)) return { kind: 'easy', button: easy }
  if (await external.isVisible().catch(() => false)) return { kind: 'external', button: external }
  return null
}

export function isEasyApplyOpen(page: Page): Promise<boolean> {
  return page.locator(POPUP).first().isVisible().catch(() => false)
}

/** Presses Easy Apply and waits for the popup. */
export async function openEasyApply(page: Page, button: Locator): Promise<boolean> {
  await button.click({ timeout: FIND_BUTTON_MS })
  await page.locator(POPUP).first().waitFor({ state: 'visible', timeout: POPUP_MS }).catch(() => {})
  return isEasyApplyOpen(page)
}

/**
 * Fills the popup's current step, presses Next, and repeats until it reaches the
 * last page or a step it cannot finish. Both are left open for you.
 */
export async function runEasyApply(page: Page, profile: Profile, resumePath: string | null): Promise<FlowReport> {
  const total: FlowReport = { filled: [], needsYou: [], skipped: 0 }

  for (let step = 0; step < MAX_STEPS; step++) {
    const report = await fillPage(page, profile, resumePath, POPUP)
    total.filled.push(...report.filled)
    total.skipped += report.skipped
    total.needsYou = report.needsYou

    // Pressing Next with a known blank only earns an error message.
    if (report.needsYou.length > 0) return { ...total, stoppedAt: 'questions' }

    const next = page.locator(STEP_BUTTONS).first()
    if (!(await next.isVisible().catch(() => false))) return { ...total, stoppedAt: 'review' }

    await next.click({ timeout: FIND_BUTTON_MS })
    await page.waitForTimeout(SETTLE_MS)

    // A step LinkedIn rejected stays put with its errors showing.
    if (await page.locator(STEP_ERRORS).first().isVisible().catch(() => false)) {
      return { ...total, needsYou: ['The highlighted questions'], stoppedAt: 'questions' }
    }
  }

  return { ...total, stoppedAt: 'questions' }
}

/**
 * Presses a listing's own Apply button, which sends you to the company's site —
 * usually a new tab, sometimes the same one. Returns the page the form should
 * be on, or null when nothing happened.
 */
export async function followExternalApply(
  page: Page,
  context: BrowserContext,
  button: Locator,
): Promise<Page | null> {
  const before = page.url()
  const opened = context.waitForEvent('page', { timeout: NEW_TAB_MS }).catch(() => null)

  await button.click({ timeout: FIND_BUTTON_MS })
  const tab = await opened
  const target = tab ?? page

  if (!tab) await page.waitForURL(url => url.href !== before, { timeout: 3_000 }).catch(() => {})
  if (!tab && page.url() === before) return null

  await target.waitForLoadState('domcontentloaded').catch(() => {})
  // Application forms are drawn by script after the page loads.
  await target.waitForTimeout(1_500)
  return target
}

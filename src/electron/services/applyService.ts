import { BrowserContext, Page } from "playwright"
import { readStoredProfile, writeStoredProfile } from "../db/db.js"
import { validateProfile } from "../ipc/validate.js"
import { fillPage } from "./apply/fillPage.js"
import { findApplyButton, followExternalApply, isEasyApplyOpen, openEasyApply, runEasyApply } from "./apply/flow.js"
import { playwrightService } from "./playwrightService.js"
import { resumeService } from "./resumeService.js"
import { signInService } from "./signInService.js"

/**
 * Autofilling an application, with a person in charge.
 *
 * The first press opens the job in a visible browser and presses its Apply
 * button. LinkedIn's Easy Apply popup is filled and stepped through to its last
 * page; any other Apply button is followed to the company's own site and that
 * form is filled. Where it cannot go on — a sign-in, a question it has no answer
 * for — it stops, and pressing again fills whichever tab you are looking at,
 * carrying on with the popup if one is open. Submit is never pressed.
 */

const EMPTY_PROFILE: Profile = {
  firstName: '', lastName: '', email: '', phone: '', location: '',
  linkedin: '', github: '', website: '', salary: '',
  workAuthorized: '', needsSponsorship: '',
}

let applyContext: BrowserContext | null = null

export function readProfile(): Profile {
  const stored = readStoredProfile()
  if (stored === null) return EMPTY_PROFILE

  try {
    return validateProfile(stored)
  } catch (err) {
    console.warn('[autofill] ignoring the stored profile:', err instanceof Error ? err.message : err)
    return EMPTY_PROFILE
  }
}

export function saveProfile(profile: Profile): Profile {
  writeStoredProfile(profile)
  return profile
}

/** Nothing to type is not a state worth opening a browser for. */
function isEmpty(profile: Profile): boolean {
  return Object.values(profile).every(value => value === '')
}

/**
 * The tab you are looking at. In a window only the front tab reports itself
 * visible, so that is how it is told apart from the rest — including the tab an
 * Apply link opened in the background of your attention.
 */
async function frontPage(context: BrowserContext): Promise<Page | null> {
  const pages = context.pages()

  for (const page of [...pages].reverse()) {
    const visible = await page.evaluate(() => document.visibilityState === 'visible').catch(() => false)
    if (visible) return page
  }
  return pages.at(-1) ?? null
}

/**
 * Presses the listing's Apply button and fills what that leads to. Null means
 * there was nothing to press, or the Apply went nowhere.
 */
async function beginApplication(page: Page, context: BrowserContext, profile: Profile): Promise<AutofillResult | null> {
  const apply = await findApplyButton(page)
  if (!apply) return null

  const resume = resumeService.storedResumePath()

  if (apply.kind === 'easy') {
    if (!(await openEasyApply(page, apply.button))) return null
    return { ok: true, stage: 'filled', ...(await runEasyApply(page, profile, resume)) }
  }

  const form = await followExternalApply(page, context, apply.button)
  if (!form) return null
  return { ok: true, stage: 'filled', ...(await fillPage(form, profile, resume)) }
}

/** What a later press does to the tab in front: carry on with a popup, else fill the page, else press Apply. */
async function continueApplication(page: Page, context: BrowserContext, profile: Profile): Promise<AutofillResult> {
  const resume = resumeService.storedResumePath()

  if (await isEasyApplyOpen(page)) {
    return { ok: true, stage: 'filled', ...(await runEasyApply(page, profile, resume)) }
  }

  const report = await fillPage(page, profile, resume)
  const nothingToFill = report.filled.length === 0 && report.needsYou.length === 0
  const applied = nothingToFill ? await beginApplication(page, context, profile) : null

  return applied ?? { ok: true, stage: 'filled', ...report }
}

async function openJob(url: string, profile: Profile): Promise<AutofillResult> {
  if (signInService.isOpen) {
    return { ok: false, error: 'Close the sign-in window first — it is using the same browser profile.' }
  }
  if (playwrightService.isBusy) {
    return { ok: false, error: 'A scan is using the browser right now. Try again when it finishes.' }
  }

  const { page, context } = await playwrightService.openBrowser(true)
  applyContext = context
  context.once('close', () => {
    if (applyContext === context) applyContext = null
  })

  // The window is already open and useful if the page is slow or down, so a
  // failed load is not a failed open.
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(err => {
    console.warn('[autofill] job page did not load:', err instanceof Error ? err.message : err)
  })

  // The listing is open whatever happens next, so a button that will not press
  // leaves you in the window rather than failing the press.
  try {
    return (await beginApplication(page, context, profile)) ?? { ok: true, stage: 'opened' }
  } catch (err) {
    console.warn('[autofill] could not press Apply:', err instanceof Error ? err.message : err)
    return { ok: true, stage: 'opened' }
  }
}

export const applyService = {
  async autofill(url: string): Promise<AutofillResult> {
    const profile = readProfile()
    if (isEmpty(profile)) {
      return { ok: false, error: 'Your profile is empty. Fill it in on the Profile tab first.' }
    }

    try {
      if (!applyContext) return await openJob(url, profile)

      const page = await frontPage(applyContext)
      if (!page) return { ok: false, error: 'The application window has no page open.' }

      return await continueApplication(page, applyContext, profile)
    } catch (err) {
      console.error('[autofill] failed:', err)
      return { ok: false, error: 'The browser stopped responding. Close its window and try again.' }
    }
  },
}

import { BrowserContext, Page } from "playwright"
import { readStoredProfile, writeStoredProfile } from "../db/db.js"
import { validateProfile } from "../ipc/validate.js"
import { fillPage } from "./apply/fillPage.js"
import { playwrightService } from "./playwrightService.js"
import { resumeService } from "./resumeService.js"
import { signInService } from "./signInService.js"

/**
 * Autofilling an application, with a person in charge.
 *
 * The first press opens the job in a visible browser and stops there: getting
 * from a job listing to its application form means clicking Apply, often
 * through a sign-in or a redirect to some other company's site, and that is
 * left to you rather than scripted. Every press after that fills whichever tab
 * you are looking at. Nothing is ever submitted.
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

async function openJob(url: string): Promise<AutofillResult> {
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

  return { ok: true, stage: 'opened' }
}

export const applyService = {
  async autofill(url: string): Promise<AutofillResult> {
    const profile = readProfile()
    if (isEmpty(profile)) {
      return { ok: false, error: 'Your profile is empty. Fill it in on the Profile tab first.' }
    }

    try {
      if (!applyContext) return await openJob(url)

      const page = await frontPage(applyContext)
      if (!page) return { ok: false, error: 'The application window has no page open.' }

      const report = await fillPage(page, profile, resumeService.storedResumePath())
      return { ok: true, stage: 'filled', ...report }
    } catch (err) {
      console.error('[autofill] failed:', err)
      return { ok: false, error: 'The browser stopped responding. Close its window and try again.' }
    }
  },
}

import { BrowserContext, Page } from "playwright"
import { findJobByUrl, getResumeText, isCoverLetterEnabled, readStoredProfile, writeStoredProfile } from "../db/db.js"
import { validateProfile } from "../ipc/validate.js"
import { writeCoverLetter } from "./apply/coverLetter.js"
import { fillPage, FillContext, FillReport, learnTyped, LetterSource } from "./apply/fillPage.js"
import { findApplyButton, followExternalApply, isEasyApplyOpen, openEasyApply, runEasyApply, runForm } from "./apply/flow.js"
import { openAnswers } from "./answerService.js"
import { watchSubmitted } from "./apply/submitWatcher.js"
import { watchTyping } from "./apply/typingWatcher.js"
import { playwrightService } from "./playwrightService.js"
import { resumeService } from "./resumeService.js"
import { signInService } from "./signInService.js"

/**
 * Autofilling an application, with a person in charge.
 *
 * The first press opens the job in a visible browser and presses its Apply
 * button. LinkedIn's Easy Apply popup is filled and stepped through to its last
 * page; any other Apply button is followed to the company's own site and that
 * form is filled and stepped through with its Next/Continue buttons. Where it
 * cannot go on — a sign-in, a question it has no answer for — it stops, and
 * pressing again fills whichever tab you are looking at, carrying on with the
 * popup if one is open. Submit is never pressed.
 *
 * The window is put away when it is no longer needed: when a different job is
 * autofilled, a few seconds after a page says the application was sent, and
 * when the browser stops responding. It holds the browser lock, so left open it
 * would also stop the next scan.
 *
 * Questions are answered from the saved answers (answerService), which also
 * learn what you type into a form — as you leave each field, not only when
 * Autofill is pressed — and note the questions it could not answer.
 *
 * With cover letters switched on in Settings, a cover-letter box is filled with
 * a letter written by `claude -p` from the résumé and the listing.
 */

const EMPTY_PROFILE: Profile = {
  firstName: '', lastName: '', email: '', phone: '', location: '',
  linkedin: '', github: '', website: '', salary: '',
  workAuthorized: '', needsSponsorship: '',
}

/** A long application has a listing, maybe a company posting, then the form. */
const MAX_APPLY_HOPS = 3

let applyContext: BrowserContext | null = null
/** The listing the window was opened for — what a cover letter is written about. */
let applyJob: JobRow | null = null
let letterPromise: Promise<string | null> | null = null
/** Why the last press could not write a letter, for the note under the job. */
let letterError: string | null = null
/** Autofill's own typing fires the events the watcher listens for, and it saves the answers itself. */
let autofilling = false
let stopWatching: (() => void) | null = null
let stopWatchingSent: (() => void) | null = null
/** The listing the window was opened from, to tell "carry on" from "a different job". */
let applyUrl: string | null = null
/** Whether Autofill has filled anything here, so a page that merely mentions "application sent" is not taken for one. */
let filledSomething = false

/** How long the confirmation stays up before the window goes, so it can be read. */
const CLOSE_AFTER_SENT_MS = 5_000

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
 * The cover letter for the job in the application window, written at most once
 * however many steps and presses ask for it. A failed attempt is not kept, so
 * the next press tries again.
 */
function letterSource(profile: Profile): LetterSource | undefined {
  if (!isCoverLetterEnabled()) return undefined

  return () => {
    letterPromise ??= (async () => {
      const resume = getResumeText()
      if (!applyJob) throw new Error("This job's details are not stored, so there is nothing to write from.")
      if (!resume) throw new Error('Upload your resume first.')

      return writeCoverLetter(
        { title: applyJob.title, company: applyJob.company, location: applyJob.location, description: applyJob.aboutText },
        resume,
        [profile.firstName, profile.lastName].filter(Boolean).join(' '),
      )
    })().catch(err => {
      letterPromise = null
      letterError = err instanceof Error ? err.message : String(err)
      console.warn('[autofill] cover letter failed:', letterError)
      return null
    })
    return letterPromise
  }
}

/**
 * Presses the listing's Apply button and fills what that leads to. Null means
 * there was nothing to press, or the Apply went nowhere.
 *
 * Apply often lands on a page that is not the form yet — the company's own
 * posting, with a second Apply button. While a page has nothing to fill, that
 * button is pressed too, up to MAX_APPLY_HOPS pages in.
 */
async function beginApplication(page: Page, context: BrowserContext, ctx: FillContext): Promise<AutofillResult | null> {
  let current = page
  let report: FillReport | null = null

  for (let hop = 0; hop < MAX_APPLY_HOPS; hop++) {
    const apply = await findApplyButton(current)
    if (!apply) break

    if (apply.kind === 'easy') {
      if (!(await openEasyApply(current, apply.button))) break
      return { ok: true, stage: 'filled', ...(await runEasyApply(current, ctx)) }
    }

    const next = await followExternalApply(current, context, apply.button)
    if (!next) break

    current = next
    report = await fillPage(current, ctx)
    if (report.filled.length > 0 || report.needsYou.length > 0) {
      return { ok: true, stage: 'filled', ...(await runForm(current, ctx, report)) }
    }
  }

  return report && { ok: true, stage: 'filled', ...report }
}

/** What a later press does to the tab in front: carry on with a popup, else fill the form, else press Apply. */
async function continueApplication(page: Page, context: BrowserContext, ctx: FillContext): Promise<AutofillResult> {
  if (await isEasyApplyOpen(page)) {
    return { ok: true, stage: 'filled', ...(await runEasyApply(page, ctx)) }
  }

  const report = await fillPage(page, ctx)
  const hasForm = report.filled.length + report.needsYou.length + report.skipped > 0
  if (hasForm) return { ok: true, stage: 'filled', ...(await runForm(page, ctx, report)) }

  const applied = await beginApplication(page, context, ctx)
  return applied ?? { ok: true, stage: 'filled', ...report }
}

async function closeApplyWindow(): Promise<void> {
  await playwrightService.closeBrowser()
  applyContext = null
  applyJob = null
  applyUrl = null
  letterPromise = null
  filledSomething = false
  stopWatching?.()
  stopWatching = null
  stopWatchingSent?.()
  stopWatchingSent = null
}

/** Saves the answers typed in the window so far, without waiting for another press. */
async function learnFromWindow(context: BrowserContext): Promise<void> {
  if (autofilling || applyContext !== context) return

  const profile = readProfile()
  const { bank, save } = openAnswers()
  for (const page of context.pages()) await learnTyped(page, bank, profile).catch(() => {})
  save()
}

/** What a press hands back: the cover-letter problem, if any, added, and a note that something was filled. */
function finish(result: AutofillResult): AutofillResult {
  if (result.ok && result.stage === 'filled' && result.filled.length > 0) filledSomething = true

  return letterError && result.ok && result.stage === 'filled'
    ? { ...result, coverLetterError: letterError }
    : result
}

async function openJob(url: string, ctx: FillContext): Promise<AutofillResult> {
  if (signInService.isOpen) {
    return { ok: false, error: 'Close the sign-in window first — it is using the same browser profile.' }
  }
  if (playwrightService.isBusy) {
    return { ok: false, error: 'A scan is using the browser right now. Try again when it finishes.' }
  }

  const { page, context } = await playwrightService.openBrowser(true)
  applyContext = context
  applyJob = findJobByUrl(url)
  applyUrl = url
  letterPromise = null
  filledSomething = false
  context.once('close', () => {
    if (applyContext === context) {
      applyContext = null
      applyJob = null
      applyUrl = null
      letterPromise = null
      filledSomething = false
      stopWatching?.()
      stopWatching = null
      stopWatchingSent?.()
      stopWatchingSent = null
    }
  })

  stopWatchingSent = watchSubmitted(context, () => filledSomething, () => {
    setTimeout(() => { if (applyContext === context) void closeApplyWindow() }, CLOSE_AFTER_SENT_MS)
  })

  // Not being able to watch only means answers are learned on the next press instead.
  stopWatching = await watchTyping(context, () => learnFromWindow(context)).catch(err => {
    console.warn('[autofill] not watching what is typed:', err instanceof Error ? err.message : err)
    return null
  })

  // The window is already open and useful if the page is slow or down, so a
  // failed load is not a failed open.
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(err => {
    console.warn('[autofill] job page did not load:', err instanceof Error ? err.message : err)
  })

  // The listing is open whatever happens next, so a button that will not press
  // leaves you in the window rather than failing the press.
  try {
    return (await beginApplication(page, context, ctx)) ?? { ok: true, stage: 'opened' }
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

    letterError = null
    const { bank, save } = openAnswers()
    const ctx: FillContext = {
      profile,
      resumePath: resumeService.storedResumePath(),
      letter: letterSource(profile),
      answers: bank,
      // Shown as "Cover letter not written: …" under the job.
      letterOff: () => { letterError ??= 'Switched off. Turn on "Write cover letters with Claude" in Settings.' },
    }

    autofilling = true
    try {
      // A different job starts a fresh window; the same one carries on in the one that is open.
      if (applyContext && applyUrl !== url) await closeApplyWindow()
      if (!applyContext) return finish(await openJob(url, ctx))

      const page = await frontPage(applyContext)
      if (!page) return { ok: false, error: 'The application window has no page open.' }

      return finish(await continueApplication(page, applyContext, ctx))
    } catch (err) {
      console.error('[autofill] failed:', err)
      await closeApplyWindow()
      return { ok: false, error: 'The browser stopped responding, so its window was closed. Try again.' }
    } finally {
      // Whatever was learned before a failure is still worth keeping.
      save()
      autofilling = false
    }
  },
}

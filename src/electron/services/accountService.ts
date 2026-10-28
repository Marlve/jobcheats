import { BrowserContext } from "playwright"
import { readStoredAccounts, writeStoredAccounts } from "../db/db.js"
import { isSeekSignInUrl, linkedInIdentity, seekName, Identity } from "./accounts.js"
import { AUTH_URL_PATTERNS } from "./boards/linkedin.js"
import { playwrightService } from "./playwrightService.js"
import { signInService } from "./signInService.js"

/**
 * Which account each board is signed in as.
 *
 * Asking means opening the scanner's browser profile, off-screen, for a few
 * seconds — the session lives in that profile and nowhere else. So it runs
 * after a sign-in window closes and when asked, never on its own, and the last
 * answer is kept with its time for Settings to show in between.
 */

type CheckedBoard = 'linkedin' | 'seek'
const CHECKED_BOARDS: CheckedBoard[] = ['linkedin', 'seek']

const PAGE_TIMEOUT_MS = 20_000
/** How long a quiet Seek page gets to redirect to its login before it counts as signed in. */
const SETTLE_MS = 3_000

async function checkLinkedIn(context: BrowserContext): Promise<Identity | null> {
  const sessionCookies = () => context.cookies('https://www.linkedin.com')
  // No session cookie: signed out, and no request needed to know it.
  if (!(await sessionCookies()).some(cookie => cookie.name === 'li_at')) return null

  // The API wants a CSRF token: the JSESSIONID value without its quotes. That
  // cookie only lives as long as the browser, so a profile reopened after a
  // sign-in has li_at but no JSESSIONID. Opening the feed sets a fresh one, and
  // where it lands is the real test: a dead session ends on the login page.
  const page = await context.newPage()
  try {
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
    if (AUTH_URL_PATTERNS.some(fragment => page.url().includes(fragment))) return null
  } finally {
    await page.close().catch(() => {})
  }

  const csrf = (await sessionCookies()).find(cookie => cookie.name === 'JSESSIONID')?.value.replace(/"/g, '') ?? ''
  const response = await context.request.get('https://www.linkedin.com/voyager/api/me', {
    headers: { 'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0' },
    failOnStatusCode: false,
    timeout: PAGE_TIMEOUT_MS,
  })
  // The feed opened, so the session is good; a failed name lookup is "signed in" without a name.
  if (!response.ok()) {
    console.warn(`[accounts] linkedin /me answered ${response.status()}`)
    return { name: '' }
  }

  return linkedInIdentity(await response.json().catch(() => null)) ?? { name: '' }
}

async function checkSeek(context: BrowserContext): Promise<Identity | null> {
  const page = await context.newPage()
  try {
    // The profile page needs an account: a signed-out visit ends on the login
    // page. The redirect comes from the page's own script after it has loaded,
    // so wait for the page to go quiet, then give the redirect a little longer.
    const toSignIn = { timeout: PAGE_TIMEOUT_MS, predicate: (url: URL) => isSeekSignInUrl(url.href) }
    await page.goto('https://www.seek.com.au/profile/me', { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS })
    await Promise.race([
      page.waitForURL(toSignIn.predicate, { timeout: toSignIn.timeout }),
      page.waitForLoadState('networkidle', { timeout: PAGE_TIMEOUT_MS }),
    ]).catch(() => {})
    if (!isSeekSignInUrl(page.url())) {
      await page.waitForURL(toSignIn.predicate, { timeout: SETTLE_MS }).catch(() => {})
    }

    if (isSeekSignInUrl(page.url())) return null
    const heading = page.locator('h1').first()
    const name = seekName(await heading.innerText({ timeout: 2_000 }).catch(() => ''))
    return { name: name ?? '' }
  } finally {
    await page.close().catch(() => {})
  }
}

const CHECKS: Record<CheckedBoard, (context: BrowserContext) => Promise<Identity | null>> = {
  linkedin: checkLinkedIn,
  seek: checkSeek,
}

function stored(): AccountMap {
  const value = readStoredAccounts()
  return value && typeof value === 'object' ? (value as AccountMap) : {}
}

export const accountService = {
  /** The last answer per board, without opening anything. */
  list: (): AccountMap => stored(),

  /**
   * Asks the boards now. While a scan, an application window or a sign-in
   * window holds the profile, nothing is asked and the last answers stay.
   */
  async check(only?: BoardSource): Promise<{ accounts: AccountMap; error?: string }> {
    if (signInService.isOpen || playwrightService.isBusy) {
      return { accounts: stored(), error: 'The browser is busy with a scan or an application. Check again when it finishes.' }
    }

    const boards = CHECKED_BOARDS.filter(board => !only || board === only)
    const accounts = stored()

    let context: BrowserContext
    try {
      ({ context } = await playwrightService.openBrowser(false))
    } catch (err) {
      return { accounts, error: err instanceof Error ? err.message : 'The browser could not be started.' }
    }

    try {
      for (const board of boards) {
        const checkedAt = new Date().toISOString()
        try {
          const identity = await CHECKS[board](context)
          accounts[board] = identity
            ? { state: 'signed-in', name: identity.name || undefined, detail: identity.detail, checkedAt }
            : { state: 'signed-out', checkedAt }
        } catch (err) {
          console.warn(`[accounts] ${board} check failed:`, err instanceof Error ? err.message : err)
          accounts[board] = { state: 'unknown', checkedAt, error: 'The site did not answer.' }
        }
      }
    } finally {
      await playwrightService.closeBrowser()
    }

    writeStoredAccounts(accounts)
    return { accounts }
  },
}

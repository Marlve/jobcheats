import { BrowserContext, chromium, Page } from "playwright"
import path from 'path'
import { app, BrowserWindow } from "electron"

// ---------- constants ----------
export const USER_DATA_DIR = path.join(app.getPath('userData'), 'linkedin-profile')

/**
 * Where the browser window sits while a scan runs.
 *
 * Parked off-screen rather than minimised, and that distinction is the whole
 * point. A minimised window is occluded, and Chromium throttles rendering for
 * occluded windows. LinkedIn's result list is virtualised — only the cards near
 * the viewport exist in the DOM, and the next batch renders when the last one
 * is scrolled into view — so a minimised scan reads the first handful and then
 * finds nothing after it. Parked off-screen, Chromium still believes the window
 * is visible and keeps rendering, while nothing shows on any monitor.
 *
 * Negative coordinates are honoured on Windows and macOS; a platform that
 * clamps them would put the window at a screen corner rather than break the
 * scan, which is the right way for this to fail.
 */
const PARKED_BOUNDS = { left: -2400, top: -2400 }

/** Where it lands when it has to come back for a sign-in. */
const VISIBLE_BOUNDS = { left: 60, top: 40 }

// Chromium locks the profile directory, so only one context may exist at a time.
let activeContext: BrowserContext | null = null

// ---------- helpers ----------

async function getWindowId(page: Page) {
  const client = await page.context().newCDPSession(page)
  const { windowId } = await client.send('Browser.getWindowForTarget')
  return { client, windowId }
}

interface WindowBounds {
  left?: number
  top?: number
  windowState?: 'normal'
}

/**
 * Where the window is is cosmetic — a CDP failure (detached target, closed
 * page) should never abort a scrape.
 */
async function setWindowBounds(page: Page, bounds: WindowBounds) {
  try {
    const { client, windowId } = await getWindowId(page)
    await client.send('Browser.setWindowBounds', { windowId, bounds })
  } catch (err) {
    console.warn('[playwright] could not move the window:', err instanceof Error ? err.message : err)
  }
}

/**
 * Steps the app window out of the way so the browser can take the foreground.
 *
 * Moving a window on screen does not raise it. Windows in particular refuses to
 * let a background process pull a window in front of whichever app currently
 * holds focus — and that app is this one, since the scan started from a click
 * in it. Chromium asking politely is not enough; the app has to let go first.
 */
function yieldForeground() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.blur()
  }
}

/** Takes focus back once the browser has been put aside again. */
function reclaimForeground() {
  const [window] = BrowserWindow.getAllWindows()
  window?.focus()
}

// ---------- launching ----------

/**
 * The browsers a scan will drive, in the order they are tried.
 *
 * Both are Chromium, and both are ones the machine already has. Playwright
 * normally supplies its own Chromium build, but that is a 400 MB download it
 * expects `npx playwright install` to have fetched — there is no such step for
 * someone who downloaded a packaged app, so shipping it would mean quadrupling
 * the installer to carry a second browser the machine almost certainly already
 * has a copy of.
 *
 * Edge is the fallback rather than a second choice worth having: it is part of
 * Windows and cannot practically be removed, so between the two there is
 * somewhere to land on essentially any Windows machine. Which browser someone
 * *browses* with does not come into it — a scan runs in its own profile under
 * userData and never touches their windows, history or signed-in sessions. A
 * Firefox user is fine; their Edge is still sitting there unused.
 *
 * Firefox itself is not an option here even if someone would prefer it:
 * Playwright can only be pointed at an installed browser when that browser is
 * Chromium-based, and its Firefox support needs a patched build of its own —
 * which puts us straight back to the download this exists to avoid.
 */
const BROWSER_CHANNELS = ['chrome', 'msedge'] as const

function describeNoBrowser(): string {
  return 'A scan needs Google Chrome or Microsoft Edge, and neither could be started. Edge comes with Windows, so if both are missing the app may not have permission to launch them.'
}

/**
 * Opens the first of the channels above that will start.
 *
 * A channel that is not installed throws on launch, which is the only reliable
 * way to ask — Playwright has no "is this present" check that does not itself
 * try to run the thing.
 */
async function launchWithInstalledBrowser(visible: boolean): Promise<BrowserContext> {
  // A visible window is one a person is going to use, so it keeps the
  // browser's own size and position rather than the scanner's fixed viewport.
  const options = visible
    ? { viewport: null, headless: false }
    : {
      viewport: { width: 1440, height: 900 },
      headless: false,
      // Parked from the moment it opens. Moving it after launch would show the
      // window on screen for a frame or two at the start of every scan.
      args: [`--window-position=${PARKED_BOUNDS.left},${PARKED_BOUNDS.top}`],
    }

  for (const channel of BROWSER_CHANNELS) {
    try {
      return await chromium.launchPersistentContext(USER_DATA_DIR, { ...options, channel })
    } catch (err) {
      console.warn(`[playwright] ${channel} did not start:`, err instanceof Error ? err.message : err)
    }
  }

  throw new Error(describeNoBrowser())
}

// ---------- service ----------

export const playwrightService = {
  get isBusy() {
    return activeContext !== null
  },

  /**
   * `visible` is for the application window, which stays on screen for a person
   * to read and submit. It holds the same profile — and the same single-context
   * lock — as a scan, so the two can never run at once.
   */
  openBrowser: async (visible = false): Promise<{ page: Page, context: BrowserContext }> => {
    if (activeContext) {
      throw new Error('A browser session is already running')
    }

    const context = await launchWithInstalledBrowser(visible)
    activeContext = context
    context.once('close', () => {
      if (activeContext === context) activeContext = null
    })

    const page = context.pages()[0] ?? await context.newPage()

    // Belt and braces: the launch arg above does the real work, but a restored
    // profile can carry saved window bounds that override it.
    if (!visible) await setWindowBounds(page, PARKED_BOUNDS)

    return { page, context }
  },

  closeBrowser: async () => {
    const context = activeContext
    activeContext = null
    if (!context) return

    await context.close().catch(err => {
      console.warn('[playwright] close failed:', err instanceof Error ? err.message : err)
    })
  },

  /**
   * Puts the window aside. Not minimised — see PARKED_BOUNDS for why that
   * distinction is load-bearing.
   */
  parkWindow: async (page: Page) => {
    await setWindowBounds(page, PARKED_BOUNDS)
    reclaimForeground()
  },

  /**
   * Brings it back on screen and in front, for when LinkedIn wants a human.
   *
   * Three separate things, none of which implies the others: restore the window
   * state, because a window minimised by hand cannot be moved until it is
   * normal again; move it somewhere visible; then actually raise it, which is
   * the step that needs the app to surrender focus first. Putting it on screen
   * without that leaves it sitting behind the app, which looks exactly like
   * nothing happening.
   */
  showWindow: async (page: Page) => {
    await setWindowBounds(page, { windowState: 'normal' })
    await setWindowBounds(page, VISIBLE_BOUNDS)

    yieldForeground()

    await page.bringToFront().catch(() => { })
    // Belt and braces: bringToFront activates the tab, which does not always
    // carry the OS window with it.
    await page.evaluate(() => window.focus()).catch(() => { })
  },
}

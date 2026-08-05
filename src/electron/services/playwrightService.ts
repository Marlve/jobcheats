import { BrowserContext, chromium, Page } from "playwright"
import path from 'path'
import { app, BrowserWindow } from "electron"

// ---------- constants ----------
const USER_DATA_DIR = path.join(app.getPath('userData'), 'linkedin-profile')

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

// ---------- service ----------

export const playwrightService = {
  get isBusy() {
    return activeContext !== null
  },

  openBrowser: async (): Promise<{ page: Page, context: BrowserContext }> => {
    if (activeContext) {
      throw new Error('A browser session is already running')
    }

    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      viewport: { width: 1440, height: 900 },
      headless: false,
      // Parked from the moment it opens. Moving it after launch would show the
      // window on screen for a frame or two at the start of every scan.
      args: [`--window-position=${PARKED_BOUNDS.left},${PARKED_BOUNDS.top}`],
    })
    activeContext = context
    context.once('close', () => {
      if (activeContext === context) activeContext = null
    })

    const page = context.pages()[0] ?? await context.newPage()

    // Belt and braces: the launch arg above does the real work, but a restored
    // profile can carry saved window bounds that override it.
    await setWindowBounds(page, PARKED_BOUNDS)

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

    await page.bringToFront().catch(() => {})
    // Belt and braces: bringToFront activates the tab, which does not always
    // carry the OS window with it.
    await page.evaluate(() => window.focus()).catch(() => {})
  },
}

import { BrowserContext, chromium, Page } from "playwright"
import path from 'path'
import { app } from "electron"

// ---------- constants ----------
const USER_DATA_DIR = path.join(app.getPath('userData'), 'linkedin-profile')

// Chromium locks the profile directory, so only one context may exist at a time.
let activeContext: BrowserContext | null = null

// ---------- helpers ----------

async function getWindowId(page: Page) {
  const client = await page.context().newCDPSession(page)
  const { windowId } = await client.send('Browser.getWindowForTarget')
  return { client, windowId }
}

/**
 * Window state is cosmetic — a CDP failure (detached target, closed page)
 * should never abort a scrape.
 */
async function setWindowState(page: Page, windowState: 'minimized' | 'normal') {
  try {
    const { client, windowId } = await getWindowId(page)
    await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState } })
  } catch (err) {
    console.warn('[playwright] could not set window state:', err instanceof Error ? err.message : err)
  }
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
    })
    activeContext = context
    context.once('close', () => {
      if (activeContext === context) activeContext = null
    })

    const page = context.pages()[0] ?? await context.newPage()

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

  hideWindow: (page: Page) => setWindowState(page, 'minimized'),

  showWindow: async (page: Page) => {
    await setWindowState(page, 'normal')
    await page.bringToFront().catch(() => {})
  },
}

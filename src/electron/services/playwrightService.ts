import { BrowserContext, chromium, Page } from "playwright"
import path from 'path'
import { app } from "electron"

// ---------- constants ----------
const USER_DATA_DIR = path.join(app.getPath('userData'), 'linkedin-profile')

// ---------- helpers ----------

async function getWindowId(page: Page) {
  const client = await page.context().newCDPSession(page)
  const { windowId } = await client.send('Browser.getWindowForTarget')
  return { client, windowId }
}

// ---------- service ----------

export const playwrightService = {
  openBrowser: async (): Promise<{ page: Page, context: BrowserContext }> => {
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
      viewport: { width: 1440, height: 900 },
      headless: false,
    })
    const page = context.pages()[0] ?? await context.newPage()

    return { page, context }
  },

  hideWindow: async (page: Page) => {
    const { client, windowId } = await getWindowId(page)

    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: "minimized" }
    })
  },

  showWindow: async (page: Page) => {
    const { client, windowId } = await getWindowId(page)

    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal' }
    })

    await page.bringToFront()
  }
}

import {chromium, Page, Browser} from "playwright";

export const playwrightService = {
  scrape: async  <T>(
    storageState: StorageState,
    searchUrl: string,
    extract: (page: Page) => Promise<T>
  ): Promise<T> => {
    const browser = await chromium.launch()
    const context = await browser.newContext({storageState})
    const page = await context.newPage();

    await page.goto(searchUrl)

    const result = await extract(page);

    await browser.close();
    return result
  }
}

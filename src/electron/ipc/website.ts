import { ipcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { websiteService } from "../services/websiteService.js";
import { validateSearchParams, ValidationError } from "./validate.js";

export const SCRAPE_PROGRESS_CHANNEL = "scrape:progress"

/** Progress is fire-and-forget; a closed window must not break the scrape. */
function progressReporter(sender: WebContents) {
  return (progress: ScrapeProgress) => {
    if (sender.isDestroyed()) return
    sender.send(SCRAPE_PROGRESS_CHANNEL, progress)
  }
}

function parseParams(raw: unknown): { params: SearchParams } | { error: string } {
  try {
    return { params: validateSearchParams(raw) }
  } catch (err) {
    return { error: err instanceof ValidationError ? err.message : 'Invalid search parameters' }
  }
}

export function registerWebsiteIPC() {
  // Failures are returned, not thrown, so the renderer gets a usable result
  // instead of an "Error invoking remote method" string.
  ipcMain.handle("scrapeAll", async (event: IpcMainInvokeEvent, raw: unknown): Promise<ScrapeResult[]> => {
    const parsed = parseParams(raw)
    if ('error' in parsed) {
      return [{ ok: false, source: 'linkedin', runId: null, error: parsed.error }]
    }

    return websiteService.scrapeAll(parsed.params, progressReporter(event.sender))
  });

  ipcMain.handle("cancelScrape", (): boolean => websiteService.cancel());
}

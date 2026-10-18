import { ipcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { listBoards, setBoard, websiteService } from "../services/websiteService.js";
import { signInService } from "../services/signInService.js";
import {
  validateBoolean,
  validateJobSource,
  validateSearchParams,
  ValidationError,
} from "./validate.js";

export const SCRAPE_PROGRESS_CHANNEL = "scrape:progress"

/** Progress is fire-and-forget; a closed window must not break the scrape. */
export function progressReporter(sender: WebContents) {
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

  ipcMain.handle("listBoards", (): BoardPreference[] => listBoards());

  // Stays pending for as long as the sign-in window is open — the renderer is
  // waiting on the window being closed, not on anything being checked.
  ipcMain.handle("signIn", (_event, rawSource: unknown): Promise<SignInResult> => {
    return signInService.signIn(validateJobSource(rawSource))
  });

  // Returns the whole list, not a flag — setBoardEnabled refuses to turn off
  // the last board, and the renderer needs to see that it was refused.
  ipcMain.handle("setBoardEnabled", (_event, rawSource: unknown, rawEnabled: unknown): BoardPreference[] => {
    return setBoard(validateJobSource(rawSource), validateBoolean(rawEnabled, 'enabled'))
  });
}

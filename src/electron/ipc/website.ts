import { ipcMain, IpcMainInvokeEvent, WebContents } from "electron";
import { listBoards, setBoard, websiteService } from "../services/websiteService.js";
import { signInService } from "../services/signInService.js";
import { accountService } from "../services/accountService.js";
import { recordSearch } from "../services/searchHistory.js";
import {
  validateBoolean,
  validateBoardSource,
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

    // Recorded when it is run, not when it is typed, so the list holds searches
    // that were actually used. A scheduled run goes through another door.
    recordSearch(parsed.params)

    return websiteService.scrapeAll(parsed.params, progressReporter(event.sender))
  });

  ipcMain.handle("cancelScrape", (): boolean => websiteService.cancel());

  ipcMain.handle("listBoards", (): BoardPreference[] => listBoards());

  // Stays pending for as long as the sign-in window is open — the renderer is
  // waiting on the window being closed, not on anything being checked.
  ipcMain.handle("signIn", (_event, rawSource: unknown): Promise<SignInResult> => {
    return signInService.signIn(validateBoardSource(rawSource))
  });

  // The last known sign-in per board; opens nothing.
  ipcMain.handle("getAccounts", (): AccountMap => accountService.list());

  // Opens the scanner's browser off-screen for a few seconds to ask each board.
  ipcMain.handle("checkAccounts", (_event, rawSource: unknown): Promise<{ accounts: AccountMap; error?: string }> => {
    return accountService.check(rawSource === undefined ? undefined : validateBoardSource(rawSource))
  });

  // Returns the whole list, not a flag — setBoardEnabled refuses to turn off
  // the last board, and the renderer needs to see that it was refused.
  ipcMain.handle("setBoardEnabled", (_event, rawSource: unknown, rawEnabled: unknown): BoardPreference[] => {
    return setBoard(validateBoardSource(rawSource), validateBoolean(rawEnabled, 'enabled'))
  });
}

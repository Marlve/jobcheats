import { ipcMain } from "electron";
import { addToWatchlist, listWatchlist, removeFromWatchlist } from "../services/watchlistService.js";
import { validateCareersLink, validateCompanyId, ValidationError } from "./validate.js";

export function registerWatchlistIPC() {
  ipcMain.handle("listWatchlist", (): WatchedCompany[] => listWatchlist());

  // A refused link comes back as `error`, not a rejection, so the renderer has
  // a sentence to show instead of an "Error invoking remote method" string.
  ipcMain.handle("addToWatchlist", async (_event, raw: unknown): Promise<AddWatchResult> => {
    try {
      return await addToWatchlist(validateCareersLink(raw))
    } catch (err) {
      if (err instanceof ValidationError) return { ok: false, error: err.message }
      throw err
    }
  });

  ipcMain.handle("removeFromWatchlist", (_event, raw: unknown): WatchedCompany[] => {
    return removeFromWatchlist(validateCompanyId(raw))
  });
}

import { ipcMain } from "electron";
import { buildPipeline } from "../services/pipeline.js";
import { getPipelineRows } from "../db/db.js";
import { clearSearchHistory, listSearchHistory, removeSearch } from "../services/searchHistory.js";
import { validateTextId } from "./validate.js";

/** Search history and the pipeline diagram — both read what you have already done. */
export function registerHistoryIPC() {
  ipcMain.handle("getPipeline", (): PipelineGraph => buildPipeline(getPipelineRows()));

  ipcMain.handle("listSearchHistory", (): SearchHistoryEntry[] => listSearchHistory());

  ipcMain.handle("removeSearchHistory", (_event, raw: unknown): SearchHistoryEntry[] => {
    return removeSearch(validateTextId(raw))
  });

  ipcMain.handle("clearSearchHistory", (): SearchHistoryEntry[] => clearSearchHistory());
}

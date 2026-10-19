import { ipcMain } from "electron";
import { applyService, readProfile, saveProfile } from "../services/applyService.js";
import { validateProfile, validateWebUrl } from "./validate.js";

export function registerApplyIPC() {
  ipcMain.handle("getProfile", (): Profile => readProfile());

  ipcMain.handle("saveProfile", (_event, raw: unknown): Profile => saveProfile(validateProfile(raw)));

  // The URL comes from a scraped listing, so it is checked before a browser is
  // pointed at it — same rule as links opened from the job list.
  ipcMain.handle("autofill", (_event, raw: unknown): Promise<AutofillResult> => {
    return applyService.autofill(validateWebUrl(raw))
  });
}

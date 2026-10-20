import { ipcMain } from "electron";
import { isCoverLetterEnabled, setCoverLetterEnabled } from "../db/db.js";
import { answerService } from "../services/answerService.js";
import { applyService, readProfile, saveProfile } from "../services/applyService.js";
import { validateAnswer, validateBoolean, validateProfile, validateQuestion, validateWebUrl } from "./validate.js";

export function registerApplyIPC() {
  ipcMain.handle("getProfile", (): Profile => readProfile());

  ipcMain.handle("saveProfile", (_event, raw: unknown): Profile => saveProfile(validateProfile(raw)));

  ipcMain.handle("getCoverLetterEnabled", (): boolean => isCoverLetterEnabled());

  ipcMain.handle("setCoverLetterEnabled", (_event, raw: unknown): boolean => {
    setCoverLetterEnabled(validateBoolean(raw, 'enabled'));
    return isCoverLetterEnabled();
  });

  ipcMain.handle("listAnswers", (): SavedAnswer[] => answerService.list());

  ipcMain.handle("saveAnswer", (_event, question: unknown, answer: unknown): SavedAnswer[] => {
    return answerService.save(validateQuestion(question), validateAnswer(answer));
  });

  ipcMain.handle("deleteAnswer", (_event, question: unknown): SavedAnswer[] => {
    return answerService.remove(validateQuestion(question));
  });

  // The URL comes from a scraped listing, so it is checked before a browser is
  // pointed at it — same rule as links opened from the job list.
  ipcMain.handle("autofill", (_event, raw: unknown): Promise<AutofillResult> => {
    return applyService.autofill(validateWebUrl(raw))
  });

  ipcMain.handle("cancelAutofill", (): Promise<void> => applyService.cancel());
}

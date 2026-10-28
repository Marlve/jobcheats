import { ipcMain, shell } from "electron";
import {
  isCoverLetterEnabled,
  isTailorChooseEnabled,
  isTailorRewriteEnabled,
  setCoverLetterEnabled,
  setTailorChooseEnabled,
  setTailorRewriteEnabled,
} from "../db/db.js";
import { answerService } from "../services/answerService.js";
import { applyService, readProfile, saveProfile } from "../services/applyService.js";
import { existingTailoredPdf } from "../services/tailor/tailoredFiles.js";
import { validateAnswer, validateBoolean, validateId, validateProfile, validateQuestion, validateWebUrl } from "./validate.js";

export function registerApplyIPC() {
  ipcMain.handle("getProfile", (): Profile => readProfile());

  ipcMain.handle("saveProfile", (_event, raw: unknown): Profile => saveProfile(validateProfile(raw)));

  ipcMain.handle("getCoverLetterEnabled", (): boolean => isCoverLetterEnabled());

  ipcMain.handle("setCoverLetterEnabled", (_event, raw: unknown): boolean => {
    setCoverLetterEnabled(validateBoolean(raw, 'enabled'));
    return isCoverLetterEnabled();
  });

  ipcMain.handle("getTailorChooseEnabled", (): boolean => isTailorChooseEnabled());

  ipcMain.handle("setTailorChooseEnabled", (_event, raw: unknown): boolean => {
    setTailorChooseEnabled(validateBoolean(raw, 'enabled'));
    return isTailorChooseEnabled();
  });

  ipcMain.handle("getTailorRewriteEnabled", (): boolean => isTailorRewriteEnabled());

  ipcMain.handle("setTailorRewriteEnabled", (_event, raw: unknown): boolean => {
    setTailorRewriteEnabled(validateBoolean(raw, 'enabled'));
    return isTailorRewriteEnabled();
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

  // The renderer names a job, never a path, so only a tailored PDF can be opened this way.
  ipcMain.handle("openTailoredResume", async (_event, raw: unknown): Promise<boolean> => {
    const pdf = existingTailoredPdf(validateId(raw));
    return pdf !== null && (await shell.openPath(pdf)) === "";
  });
}

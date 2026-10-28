import { ipcMain } from "electron"
import { resumeService } from "../services/resumeService.js"
import { getInsights } from "../services/insightsService.js"
import { recomputeAll } from "../services/matchService.js"
import {
  addKeyword,
  listKeywords,
  removeKeyword,
  setKeywordEnabled,
  setKeywordWeight,
} from "../db/db.js"
import {
  validateBoolean,
  validateId,
  validateKeyword,
  validateResumePath,
  validateTexSource,
  validateWeight,
  ValidationError,
} from "./validate.js"

/**
 * Any keyword change invalidates every stored score, so each mutation
 * rescores before returning — a stale score is worse than none, since the whole
 * job list is sorted by it.
 */
function afterKeywordChange<T>(result: T): T {
  recomputeAll()
  return result
}

export function registerResumeIPC() {
  ipcMain.handle("pickResume", () => resumeService.pickResume())

  ipcMain.handle("uploadResume", async (_event, raw: unknown): Promise<UploadResumeResult> => {
    let filePath: string
    try {
      filePath = validateResumePath(raw)
    } catch (err) {
      const error = err instanceof ValidationError ? err.message : 'Invalid file path'
      return { ok: false, reason: 'unsupported-type', error }
    }

    return resumeService.uploadResume(filePath)
  })

  ipcMain.handle("getResume", (): ResumeMeta | null => resumeService.getResume())

  ipcMain.handle("deleteResume", (): boolean => resumeService.deleteResume())

  // ---------- LaTeX editor ----------

  ipcMain.handle("getResumeTex", (): string | null => resumeService.storedMasterTex()?.source ?? null)

  ipcMain.handle("previewResumeTex", (_event, raw: unknown): Promise<TexPreviewResult> =>
    resumeService.previewTex(validateTexSource(raw))
  )

  ipcMain.handle("saveResumeTex", (_event, raw: unknown): Promise<UploadResumeResult> =>
    resumeService.saveTex(validateTexSource(raw))
  )

  // ---------- keywords ----------

  ipcMain.handle("listKeywords", (): ResumeKeyword[] => listKeywords())

  ipcMain.handle("addKeyword", (_event, rawKeyword: unknown, rawWeight: unknown) => {
    const keyword = addKeyword(validateKeyword(rawKeyword), validateWeight(rawWeight))
    return afterKeywordChange(keyword)
  })

  ipcMain.handle("removeKeyword", (_event, rawId: unknown): boolean =>
    afterKeywordChange(removeKeyword(validateId(rawId)))
  )

  ipcMain.handle("setKeywordEnabled", (_event, rawId: unknown, rawEnabled: unknown): boolean =>
    afterKeywordChange(setKeywordEnabled(validateId(rawId), validateBoolean(rawEnabled, 'enabled')))
  )

  /** Your priority for a keyword, 1–5. Kept when the resume is re-read. */
  ipcMain.handle("setKeywordWeight", (_event, rawId: unknown, rawWeight: unknown): boolean =>
    afterKeywordChange(setKeywordWeight(validateId(rawId), validateWeight(rawWeight), true))
  )

  /** Drops your priority: an auto keyword goes back to what the resume says, a hand-added one to normal. */
  ipcMain.handle("resetKeywordWeight", async (_event, rawId: unknown): Promise<boolean> => {
    const id = validateId(rawId)
    const row = listKeywords().find(keyword => keyword.id === id)
    if (!row) return false

    const { extractKeywords, NORMAL_PRIORITY } = await import("../services/keywordService.js")
    const text = row.source === 'auto' ? resumeService.getResumeText() : null
    const auto = text ? extractKeywords(text).find(keyword => keyword.keyword === row.keyword)?.weight : undefined

    return afterKeywordChange(setKeywordWeight(id, auto ?? NORMAL_PRIORITY, false))
  })

  /** Re-derives auto keywords from the stored resume text. */
  ipcMain.handle("resetKeywords", async (): Promise<ResumeKeyword[]> => {
    const text = resumeService.getResumeText()
    if (!text) return listKeywords()

    const { extractKeywords } = await import("../services/keywordService.js")
    const { replaceAutoKeywords } = await import("../db/db.js")

    replaceAutoKeywords(extractKeywords(text))
    return afterKeywordChange(listKeywords())
  })

  // ---------- insights ----------

  ipcMain.handle("getInsights", (): ResumeInsights => getInsights())
}

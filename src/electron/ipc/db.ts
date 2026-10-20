import { ipcMain } from "electron"
import { appConfig } from "../config.js"
import {
  countJobs,
  deleteInboxJobs,
  getDbStats,
  listJobs,
  listRuns,
  pruneOldJobs,
  setJobNotes,
  updateJobStatus,
} from "../db/db.js"
import {
  validateId,
  validateJobStatus,
  validateLimit,
  validateListJobsOptions,
  validateNotes,
} from "./validate.js"

export function registerDbIPC() {
  ipcMain.handle("listJobs", (_event, raw: unknown): JobRow[] => {
    return listJobs(validateListJobsOptions(raw))
  })

  ipcMain.handle("countJobs", (_event, raw: unknown): number => {
    return countJobs(validateListJobsOptions(raw))
  })

  ipcMain.handle("updateJobStatus", (_event, rawId: unknown, rawStatus: unknown): boolean => {
    return updateJobStatus(validateId(rawId), validateJobStatus(rawStatus))
  })

  ipcMain.handle("setJobNotes", (_event, rawId: unknown, rawNotes: unknown): boolean => {
    return setJobNotes(validateId(rawId), validateNotes(rawNotes))
  })

  ipcMain.handle("getDbStats", (): DbStats => getDbStats())

  ipcMain.handle("pruneOldJobs", (): number => pruneOldJobs())

  ipcMain.handle("deleteInboxJobs", (): number => deleteInboxJobs())

  ipcMain.handle("getAppConfig", (): AppConfig => appConfig())

  ipcMain.handle("listRuns", (_event, raw: unknown): ScrapeRun[] => {
    return listRuns(validateLimit(raw, 20, 200))
  })
}

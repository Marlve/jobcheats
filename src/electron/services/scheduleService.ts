import { app } from "electron"
import { deleteStoredSchedule, readStoredSchedule, writeStoredSchedule } from "../db/db.js"
import { validateScheduleConfig } from "../ipc/validate.js"
import { ProgressReporter, websiteService } from "./websiteService.js"
import { registerTask, removeTask, taskExists } from "./scheduleTask.js"

/**
 * A daily scan that runs without the app being open.
 *
 * Two halves that only meet in the settings table. Saving a schedule stores the
 * search and registers a Windows task whose only job is to launch this app with
 * --scan; when that happens main.ts calls runScheduledScan, which reads the
 * search back and runs it. The task never knows what is being searched.
 */

function unsupportedReason(): string | null {
  if (process.platform !== 'win32') {
    return 'Scheduled scans use Windows Task Scheduler, so they are Windows-only for now.'
  }
  if (!app.isPackaged) {
    return 'Scheduled scans need the installed app. A development build has no fixed program for Windows to launch.'
  }
  return null
}

/**
 * What the task launches. A portable build unpacks itself into a temp folder on
 * every start, so process.execPath would name a place that is gone by tomorrow;
 * the launcher reports where the file you actually double-clicked lives.
 */
function launchTarget(): string {
  return process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
}

function readConfig(): ScheduleConfig | null {
  const stored = readStoredSchedule()
  if (stored === null) return null

  try {
    return validateScheduleConfig(stored)
  } catch (err) {
    console.warn('[schedule] ignoring the stored schedule:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function scheduleStatus(error: string | null = null): Promise<ScheduleStatus> {
  const reason = unsupportedReason()
  const config = readConfig()

  return {
    supported: reason === null,
    unsupportedReason: reason,
    config,
    // Asked of Windows rather than assumed from the stored row: deleting the
    // task by hand leaves a schedule that says it is on and never fires.
    taskInstalled: reason === null && config !== null ? await taskExists() : false,
    error,
  }
}

/**
 * The task is registered first and the search stored second, so a failure
 * leaves the previous schedule exactly as it was rather than a stored search
 * that nothing will ever run.
 */
export async function saveSchedule(config: ScheduleConfig): Promise<ScheduleStatus> {
  const reason = unsupportedReason()
  if (reason) return scheduleStatus(reason)

  try {
    await registerTask(launchTarget(), config.time)
  } catch (err) {
    console.error('[schedule] could not register the task:', err)
    return scheduleStatus('Windows would not create the scheduled task, so nothing was saved.')
  }

  writeStoredSchedule(config)
  return scheduleStatus()
}

export async function clearSchedule(): Promise<ScheduleStatus> {
  try {
    await removeTask()
  } catch (err) {
    console.error('[schedule] could not remove the task:', err)
    return scheduleStatus('Windows would not remove the scheduled task, so the schedule was kept.')
  }

  deleteStoredSchedule()
  return scheduleStatus()
}

/**
 * Points the task at the app as it is now. The task stores a path, and the app
 * can move out from under it — a portable exe dragged to another folder, or a
 * reinstall somewhere new — so each normal launch re-registers it. Quiet by
 * design: this is housekeeping, not something to report.
 */
export async function syncScheduleTask(): Promise<void> {
  const config = readConfig()
  if (!config || unsupportedReason()) return

  try {
    await registerTask(launchTarget(), config.time)
  } catch (err) {
    console.warn('[schedule] could not refresh the task:', err instanceof Error ? err.message : err)
  }
}

/**
 * The --scan entry point. Never throws: it runs with nobody watching, and the
 * caller's next step is to quit.
 *
 * A board that fails still leaves its error on the run record, which is where
 * the Daily scan tab shows it — so there is nothing to surface from here beyond
 * the terminal.
 */
export async function runScheduledScan(onProgress: ProgressReporter): Promise<void> {
  const config = readConfig()
  if (!config) {
    console.log('[schedule] --scan was given but no schedule is saved, nothing to run')
    return
  }

  try {
    const results = await websiteService.scrapeAll(config.search, onProgress, { unattended: true })
    for (const result of results) {
      console.log(`[schedule] ${result.source}: ${result.ok ? `${result.inserted} added` : result.error}`)
    }
  } catch (err) {
    console.error('[schedule] scheduled scan failed:', err)
  }
}

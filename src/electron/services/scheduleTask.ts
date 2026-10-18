import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { SCAN_FLAG, SCHEDULE_TASK_NAME } from "../config.js"

/**
 * The Windows Task Scheduler side of a schedule, kept free of Electron so it can
 * be exercised on its own.
 *
 * The task does one thing: launch the app with --scan. Everything about *what*
 * to scan lives in the settings table, so changing the search never touches the
 * task and changing the time never touches the search.
 */

const run = promisify(execFile)

/** 24-hour "HH:MM", the shape both the picker and the trigger agree on. */
export function isScheduleTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/** A PowerShell single-quoted literal — the only escape inside one is a doubled quote. */
function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

/**
 * Registers (or replaces) the daily task.
 *
 * Runs only while you are signed in to Windows, which is what a scan needs —
 * it drives a real browser window. StartWhenAvailable is the setting that makes
 * a daily task usable on a laptop: a machine asleep at the trigger time runs it
 * on waking instead of skipping the day. Battery settings are relaxed for the
 * same reason, and the time limit exists so a hung browser cannot hold the task
 * open indefinitely.
 */
export async function registerTask(exe: string, time: string): Promise<void> {
  const script = [
    `$action = New-ScheduledTaskAction -Execute ${quote(exe)} -Argument ${quote(SCAN_FLAG)}`,
    `$trigger = New-ScheduledTaskTrigger -Daily -At ([datetime]${quote(time)})`,
    '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)',
    `Register-ScheduledTask -TaskName ${quote(SCHEDULE_TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -Description 'Runs the saved JobCheats search once a day.' -Force | Out-Null`,
  ].join('; ')

  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
}

/** schtasks exits non-zero for a task that does not exist, which is the answer. */
export async function taskExists(): Promise<boolean> {
  try {
    await run('schtasks.exe', ['/Query', '/TN', SCHEDULE_TASK_NAME], { windowsHide: true })
    return true
  } catch {
    return false
  }
}

/** Removes the task. A task that is already gone counts as removed. */
export async function removeTask(): Promise<void> {
  if (!await taskExists()) return
  await run('schtasks.exe', ['/Delete', '/TN', SCHEDULE_TASK_NAME, '/F'], { windowsHide: true })
}

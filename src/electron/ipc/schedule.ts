import { ipcMain } from "electron";
import { clearSchedule, saveSchedule, scheduleStatus } from "../services/scheduleService.js";
import { validateScheduleConfig } from "./validate.js";

export function registerScheduleIPC() {
  ipcMain.handle("getSchedule", (): Promise<ScheduleStatus> => scheduleStatus());

  // A task Windows refuses to create comes back as `error` on the status, not
  // as a rejection — the renderer has a message to show and no stack to read.
  ipcMain.handle("saveSchedule", (_event, raw: unknown): Promise<ScheduleStatus> => {
    return saveSchedule(validateScheduleConfig(raw))
  });

  ipcMain.handle("clearSchedule", (): Promise<ScheduleStatus> => clearSchedule());
}

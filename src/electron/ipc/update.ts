import { ipcMain } from "electron"
import {
  checkForUpdates,
  dismissUpdate,
  setAutoCheck,
  updateStatus,
} from "../services/updateService.js"
import { validateBoolean, validateVersion } from "./validate.js"

/** Pushed when the launch check lands after the renderer has already asked. */
export const UPDATE_STATUS_CHANNEL = "update:status"

export function registerUpdateIPC() {
  ipcMain.handle("getUpdateStatus", (): UpdateStatus => updateStatus())

  // Ignores the interval that holds the launch check back — pressing the button
  // is a direct request for a fresh answer.
  ipcMain.handle("checkForUpdates", (): Promise<UpdateStatus> => checkForUpdates())

  ipcMain.handle("dismissUpdate", (_event, raw: unknown): UpdateStatus => {
    return dismissUpdate(validateVersion(raw))
  })

  ipcMain.handle("setUpdateAutoCheck", (_event, raw: unknown): UpdateStatus => {
    return setAutoCheck(validateBoolean(raw, 'enabled'))
  })
}

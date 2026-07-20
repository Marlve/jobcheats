import { ipcMain } from "electron";
import {linkedinService} from '../services/linkedinService.js'

export function registerLinkedInIPC () {
  ipcMain.handle("openLinkedIn", () => {
    return linkedinService.openLogin()
  })
}

import { ipcMain, } from "electron";
import { seekService } from "../services/seekService.js";

export function registerSeekIPC () {
  ipcMain.handle("openSeek", () => {
    return seekService.openLogin()
  })
}

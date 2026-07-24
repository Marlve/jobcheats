import { ipcMain } from "electron"


export function registerDbIPC() {
  ipcMain.handle("checkDB", () => {
    return 
  })
}

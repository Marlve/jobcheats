import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron"

/**
 * The window buttons are drawn by the renderer (see ui/components/WindowControls),
 * so the actions behind them have to cross IPC. Each one resolves the window
 * from the sender rather than closing over one, so a request can only ever move
 * the window it came from.
 */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowIPC(window: BrowserWindow) {
  ipcMain.handle("minimizeWindow", (event: IpcMainInvokeEvent): void => {
    senderWindow(event)?.minimize()
  })

  ipcMain.handle("toggleMaximizeWindow", (event: IpcMainInvokeEvent): boolean => {
    const win = senderWindow(event)
    if (!win) return false

    if (win.isMaximized()) win.unmaximize()
    else win.maximize()

    return win.isMaximized()
  })

  ipcMain.handle("closeWindow", (event: IpcMainInvokeEvent): void => {
    senderWindow(event)?.close()
  })

  ipcMain.handle("isWindowMaximized", (event: IpcMainInvokeEvent): boolean => {
    return senderWindow(event)?.isMaximized() ?? false
  })

  // The window can also be maximised by dragging it to the top edge or
  // double-clicking a drag region, so the button's icon follows the window
  // rather than the click that came through it.
  const emit = () => window.webContents.send("window:maximized", window.isMaximized())
  window.on("maximize", emit)
  window.on("unmaximize", emit)
}

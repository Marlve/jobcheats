import { BrowserWindow } from "electron";

export function openLogin(
  partition: string,
  loginUrl: string,
  successCheck: (url: String) => boolean
) {
    return new Promise<void>((resolve) => {
      const window = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          partition: `persist:${partition}}`
        }
      });

      window.loadURL(loginUrl);

      window.webContents.on("did-navigate", (_, url) => {
        if (successCheck(url)) {
          console.log("Logged In!");

          window.close();
          resolve();
        }
      })
    })
}

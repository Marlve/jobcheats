import {app, BrowserWindow} from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { registerWindowIPC } from './ipc/window.js';
import { registerWebsiteIPC } from './ipc/website.js';
import { registerDbIPC } from './ipc/db.js';
import { registerResumeIPC } from './ipc/resume.js';
import { websiteService } from './services/websiteService.js';
import { reconcileMatches } from './services/matchService.js';
import { closeDb, pruneOldJobs } from './db/db.js';

app.on("ready", () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    // The layout reflows down to the icon-rail sidebar; below this it just gets
    // cramped, so stop the window there rather than letting it be dragged smaller.
    minWidth: 720,
    minHeight: 560,
    // The app draws its own title bar: the sidebar and each screen header double
    // as the drag surface. On Windows and Linux the buttons are drawn by the
    // renderer too — the native overlay can't be given hover transitions or the
    // app's own shapes, which is the whole point of a custom title bar. macOS
    // keeps its traffic lights, which sit in the reserved strip above the
    // sidebar brand.
    titleBarStyle: 'hidden',
    // --bg-canvas, so the frame before first paint is the app's own colour
    // rather than white.
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });
  if (isDev()) {
    mainWindow.loadURL('http://localhost:5123');

    // Hiding the title bar hides the menu bar with it, so the shortcuts that
    // came from the default menu are re-bound here.
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return

      const devtools = input.key === 'F12' || (input.control && input.shift && input.key === 'I')
      if (devtools) mainWindow.webContents.toggleDevTools()
      else if (input.control && input.key === 'r') mainWindow.webContents.reload()
    });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), '/dist-react/index.html'));
  }

  registerWindowIPC(mainWindow)
  registerWebsiteIPC()
  registerDbIPC()
  registerResumeIPC()

  // Retention runs on launch as well as after each scan, so an app left closed
  // for a fortnight still opens onto a current inbox.
  pruneOldJobs()
  reconcileMatches()
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
});

// The scraper owns a Chromium process and a locked profile directory, so quitting
// has to wait for it to be torn down.
let shuttingDown = false
app.on('before-quit', (event) => {
  if (shuttingDown) return

  shuttingDown = true
  event.preventDefault()

  void websiteService.shutdown()
    .catch(err => console.error('[shutdown] failed:', err))
    .finally(() => {
      closeDb()
      app.quit()
    })
});

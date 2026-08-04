import {app, BrowserWindow} from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { registerWebsiteIPC } from './ipc/website.js';
import { registerDbIPC } from './ipc/db.js';
import { registerResumeIPC } from './ipc/resume.js';
import { websiteService } from './services/websiteService.js';
import { closeDb, pruneOldJobs } from './db/db.js';

app.on("ready", () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    // The layout reflows down to the icon-rail sidebar; below this it just gets
    // cramped, so stop the window there rather than letting it be dragged smaller.
    minWidth: 720,
    minHeight: 560,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });
  if (isDev()) {
    mainWindow.loadURL('http://localhost:5123');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), '/dist-react/index.html'));
  }

  registerWebsiteIPC()
  registerDbIPC()
  registerResumeIPC()

  // Retention runs on launch as well as after each scan, so an app left closed
  // for a fortnight still opens onto a current inbox.
  pruneOldJobs()
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

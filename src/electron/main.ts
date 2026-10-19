import {app, BrowserWindow, shell} from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { registerWindowIPC } from './ipc/window.js';
import { registerWebsiteIPC } from './ipc/website.js';
import { registerDbIPC } from './ipc/db.js';
import { registerResumeIPC } from './ipc/resume.js';
import { registerUpdateIPC, UPDATE_STATUS_CHANNEL } from './ipc/update.js';
import { registerScheduleIPC } from './ipc/schedule.js';
import { registerApplyIPC } from './ipc/apply.js';
import { registerHistoryIPC } from './ipc/history.js';
import { progressReporter } from './ipc/website.js';
import { websiteService } from './services/websiteService.js';
import { reconcileMatches } from './services/matchService.js';
import { reconcileVisa } from './services/visaService.js';
import { checkForUpdatesOnLaunch } from './services/updateService.js';
import { runScheduledScan, syncScheduleTask } from './services/scheduleService.js';
import { closeDb, pruneOldJobs } from './db/db.js';
import { SCAN_FLAG } from './config.js';

// A scheduled run is this same app launched with --scan: no window, one scan,
// then quit.
const scanOnly = process.argv.includes(SCAN_FLAG);

// One copy of the app at a time. The scanner owns a locked browser profile and
// a database, so a second copy could only ever fail — better that it hands its
// launch to the first one, which is what turns "the scheduled scan fired while
// the app was open" into a scan inside the open app.
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();

app.on("ready", () => {
  if (!isPrimary) return;

  const mainWindow = new BrowserWindow({
    // Created even for a scheduled run, just never shown: opening the app
    // mid-scan then only has to reveal it, and the IPC below needs a window to
    // attach to either way.
    show: !scanOnly,
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

  // Job links are scraped from third-party boards, so they are untrusted input:
  // hand them to the OS only if they are ordinary web URLs. Anything else
  // (file:, and the various scheme handlers Windows registers) is dropped.
  const openInDefaultBrowser = (url: string) => {
    let protocol: string
    try {
      protocol = new URL(url).protocol
    } catch {
      return
    }
    if (protocol === 'http:' || protocol === 'https:') void shell.openExternal(url)
  }

  // target="_blank" would otherwise spawn a second Electron window — Chromium
  // with none of the user's browser: no sign-in, no password manager, no
  // extensions. Applying to a job needs all three, so send it out to the
  // default browser instead.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInDefaultBrowser(url)
    return { action: 'deny' }
  })

  // Same treatment for links that navigate the current window: without this the
  // app frame itself would be replaced by the job board, with no way back.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === mainWindow.webContents.getURL()) return

    event.preventDefault()
    openInDefaultBrowser(url)
  })

  registerWindowIPC(mainWindow)
  registerWebsiteIPC()
  registerDbIPC()
  registerResumeIPC()
  registerUpdateIPC()
  registerScheduleIPC()
  registerApplyIPC()
  registerHistoryIPC()

  app.on('second-instance', (_event, argv) => {
    // The scheduled task fired while the app was already open: scan in this
    // window, with its progress showing, rather than starting a second app.
    if (argv.includes(SCAN_FLAG)) {
      void runScheduledScan(progressReporter(mainWindow.webContents))
      return
    }

    // Opened again — possibly mid-scan, with the window hidden. Reveal it.
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  // Retention runs on launch as well as after each scan, so an app left closed
  // for a fortnight still opens onto a current inbox.
  pruneOldJobs()
  reconcileMatches()
  reconcileVisa()

  if (scanOnly) {
    // Quits only if nobody opened the window while it ran; if they did, this
    // has quietly become the app and should stay up.
    void runScheduledScan(progressReporter(mainWindow.webContents)).then(() => {
      if (!mainWindow.isVisible()) app.quit()
    })
  } else {
    void syncScheduleTask()
  }

  // Deliberately not awaited. The window is already up, the renderer asks for
  // the stored answer on mount, and a slow or unreachable GitHub must not be
  // able to hold up a launch — the notice simply appears once it lands.
  void checkForUpdatesOnLaunch().then(status => {
    if (status && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(UPDATE_STATUS_CHANNEL, status)
    }
  })
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

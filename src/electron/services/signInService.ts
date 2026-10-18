import { ChildProcess, spawn } from "node:child_process"
import { SIGN_IN_URL } from "../config.js"
import { findInstalledBrowser } from "./installedBrowser.js"
import { playwrightService, USER_DATA_DIR } from "./playwrightService.js"

/**
 * Signing in to a board, outside a scan.
 *
 * The browser opened here is an ordinary one — started as a plain process, with
 * nothing attached to drive it. That is the whole point. Sites that offer
 * "Sign in with Google" ask Google to vouch for the browser, and Google refuses
 * ones it can tell are being automated ("This browser or app may not be
 * secure"). A window the scanner opened, or one Playwright is attached to,
 * gets refused; this one does not.
 *
 * It uses the scanner's own profile folder, so whatever session the sign-in
 * leaves behind is what the next scan opens with. The app never sees a
 * password or a cookie — it starts a browser and waits for it to be closed.
 */

/** Only one window at a time: Chromium locks the profile folder it is using. */
let signInBrowser: ChildProcess | null = null

export const signInService = {
  /** True while the window is open. A scan has to wait — it needs the same profile. */
  get isOpen() {
    return signInBrowser !== null
  },

  /** Resolves once the window has been closed, which is how "done" is known. */
  async signIn(source: BoardSource): Promise<SignInResult> {
    const url = SIGN_IN_URL[source]
    if (!url) return { ok: false, error: 'This board does not need a sign-in.' }

    if (process.platform !== 'win32') {
      return { ok: false, error: 'Signing in from here is Windows-only for now. A scan will still ask you to sign in when it needs to.' }
    }
    if (signInBrowser) return { ok: false, error: 'A sign-in window is already open.' }
    if (playwrightService.isBusy) {
      return { ok: false, error: 'A scan is using the browser right now. Try again when it finishes.' }
    }

    const exe = findInstalledBrowser()
    if (!exe) {
      return { ok: false, error: 'Google Chrome or Microsoft Edge is needed to sign in, and neither was found.' }
    }

    return new Promise<SignInResult>(resolve => {
      const child = spawn(
        exe,
        [`--user-data-dir=${USER_DATA_DIR}`, '--no-first-run', '--no-default-browser-check', url],
        { stdio: 'ignore' }
      )
      signInBrowser = child

      child.once('error', err => {
        console.error('[sign-in] could not start the browser:', err)
        if (signInBrowser === child) signInBrowser = null
        resolve({ ok: false, error: 'The browser could not be started.' })
      })

      child.once('exit', () => {
        if (signInBrowser === child) signInBrowser = null
        resolve({ ok: true })
      })
    })
  },

  /** For app shutdown — a window left open would keep the profile locked. */
  close() {
    signInBrowser?.kill()
  },
}

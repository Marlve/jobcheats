import { existsSync } from "node:fs"
import path from "node:path"

/**
 * Where Chrome and Edge live on Windows, Chrome first.
 *
 * The same order a scan tries them in (see BROWSER_CHANNELS in
 * playwrightService), and that is not incidental: a profile written by one
 * browser should not be opened by the other, so signing in has to use whichever
 * one the scanner will end up using.
 */
const CANDIDATES = [
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
]

export function findInstalledBrowser(): string | null {
  const roots = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LOCALAPPDATA']]
    .filter((root): root is string => Boolean(root))

  for (const parts of CANDIDATES) {
    for (const root of roots) {
      const candidate = path.join(root, ...parts)
      if (existsSync(candidate)) return candidate
    }
  }

  return null
}

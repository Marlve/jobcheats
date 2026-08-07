import { app } from "electron"
import {
  LATEST_RELEASE_URL,
  MAX_RELEASE_NOTES_CHARS,
  RELEASES_PAGE_URL,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_REQUEST_TIMEOUT_MS,
} from "../config.js"
import {
  isAutoCheckEnabled,
  readDismissedVersion,
  readUpdateCache,
  setAutoCheckEnabled,
  UpdateCache,
  writeDismissedVersion,
  writeUpdateCache,
} from "../db/db.js"
import { isNewerVersion, isVersion } from "./version.js"

/**
 * Telling you a new version exists, and nothing more.
 *
 * The app does not update itself: it asks GitHub what the newest published
 * release is, compares that to the version it is, and puts a notice up if it is
 * behind. Downloading and installing stays a thing you do, which is why there
 * is no code signing to maintain and no installer that can leave a half-applied
 * update behind.
 *
 * The request is a plain GET to a public URL. It sends no identifiers, no
 * resume, and nothing about your jobs — GitHub learns your IP address, the same
 * as opening the releases page in a browser would. Turning the check off in
 * Settings stops even that.
 */

/** The fields this app reads from a GitHub release. */
interface ReleasePayload {
  tag_name?: unknown
  html_url?: unknown
  body?: unknown
  draft?: unknown
  prerelease?: unknown
}

/** Failures worth wording differently, because they need different responses. */
function describeFailure(status: number): string {
  if (status === 404) {
    return 'No published releases were found. If the repository is private, a downloaded copy of the app cannot see its releases.'
  }
  if (status === 403 || status === 429) {
    return 'GitHub is limiting how often update checks can run. Try again in an hour.'
  }
  return `GitHub answered with an error (${status}). Try again later.`
}

function trimNotes(body: string): string {
  const cleaned = body.trim()
  if (cleaned.length <= MAX_RELEASE_NOTES_CHARS) return cleaned
  return `${cleaned.slice(0, MAX_RELEASE_NOTES_CHARS).trimEnd()}…`
}

/**
 * Asks GitHub for the newest release.
 *
 * /releases/latest already excludes drafts and pre-releases, so this will not
 * push a beta at anyone. The draft and prerelease fields are still checked, so
 * that stays true if the endpoint is ever swapped for the full release list.
 */
async function fetchLatestRelease(): Promise<UpdateCache> {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      // GitHub rejects API requests that do not identify themselves.
      'User-Agent': `jobcheats/${app.getVersion()}`,
    },
    signal: AbortSignal.timeout(UPDATE_REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(describeFailure(response.status))

  const release = await response.json() as ReleasePayload

  if (release.draft === true || release.prerelease === true) {
    throw new Error('The newest release is not published yet.')
  }

  const tag = typeof release.tag_name === 'string' ? release.tag_name : ''
  if (!isVersion(tag)) {
    throw new Error(`The newest release is tagged "${tag}", which is not a version this app can compare against.`)
  }

  return {
    latestVersion: tag.trim().replace(/^v/i, ''),
    releaseUrl: typeof release.html_url === 'string' ? release.html_url : RELEASES_PAGE_URL,
    releaseNotes: typeof release.body === 'string' ? trimNotes(release.body) : '',
    checkedAt: new Date().toISOString(),
  }
}

/** Anything thrown by fetch itself, worded for someone who is not debugging it. */
function describeThrown(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return 'GitHub did not answer in time. Try again later.'
  }

  const raw = err instanceof Error ? err.message : String(err)

  if (/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network/i.test(raw)) {
    return 'Could not reach GitHub. Check your internet connection.'
  }

  return raw
}

/** The last error, held in memory — a failed check is not worth a database row. */
let lastError: string | null = null
let lastFailedAt: string | null = null

/**
 * The current picture, from what is already stored. Never touches the network,
 * so the renderer can ask for this as often as it likes.
 */
export function updateStatus(): UpdateStatus {
  const currentVersion = app.getVersion()
  const cache = readUpdateCache()
  const dismissedVersion = readDismissedVersion()
  const autoCheck = isAutoCheckEnabled()

  if (!cache) {
    return {
      currentVersion,
      latestVersion: null,
      releaseUrl: RELEASES_PAGE_URL,
      releaseNotes: '',
      state: lastError ? 'failed' : 'unknown',
      checkedAt: lastFailedAt,
      error: lastError,
      autoCheck,
      dismissedVersion,
    }
  }

  const behind = isNewerVersion(cache.latestVersion, currentVersion)

  return {
    currentVersion,
    latestVersion: cache.latestVersion,
    releaseUrl: cache.releaseUrl || RELEASES_PAGE_URL,
    releaseNotes: cache.releaseNotes,
    // A failure after a successful check leaves the last known answer standing
    // rather than replacing it with an error — what it found is still true.
    state: lastError ? 'failed' : behind ? 'available' : 'current',
    checkedAt: lastFailedAt && lastFailedAt > cache.checkedAt ? lastFailedAt : cache.checkedAt,
    error: lastError,
    autoCheck,
    dismissedVersion,
  }
}

/** Whether enough time has passed to be worth asking again. */
function isCacheStale(): boolean {
  const cache = readUpdateCache()
  if (!cache) return true

  const age = Date.now() - new Date(cache.checkedAt).getTime()
  // A checkedAt that will not parse gives NaN, which fails every comparison —
  // treat that as stale rather than as permanently fresh.
  return !(age < UPDATE_CHECK_INTERVAL_MS)
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  try {
    writeUpdateCache(await fetchLatestRelease())
    lastError = null
    lastFailedAt = null
  } catch (err) {
    lastError = describeThrown(err)
    lastFailedAt = new Date().toISOString()
    console.error('[update] check failed:', err instanceof Error ? err.stack ?? err.message : err)
  }

  return updateStatus()
}

/**
 * The launch check. Skipped when turned off or when a recent answer is already
 * on hand, and it never throws — a failed update check must not be able to take
 * the app down with it.
 *
 * Resolves to null when no check ran, and to the new status when one did. The
 * caller pushes that to the window: this finishes after the renderer has
 * mounted and asked for the stored answer, so without the push a notice would
 * not appear until the next launch.
 */
export async function checkForUpdatesOnLaunch(): Promise<UpdateStatus | null> {
  if (!isAutoCheckEnabled()) return null
  if (!isCacheStale()) return null

  return checkForUpdates().catch(() => null)
}

/** Puts the notice down for this version. A newer one raises it again. */
export function dismissUpdate(version: string): UpdateStatus {
  writeDismissedVersion(version)
  return updateStatus()
}

export function setAutoCheck(enabled: boolean): UpdateStatus {
  setAutoCheckEnabled(enabled)
  return updateStatus()
}

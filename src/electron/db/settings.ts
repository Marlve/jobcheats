import { db } from "./schema.js"
import { boardEnabledFromStored, configuredSources, isLastEnabledBoard } from "../config.js"

/**
 * Stored preferences.
 *
 * Everything else the Settings screen shows is a product rule out of config.ts,
 * reported rather than offered. This file is for the few things that really are
 * yours to choose, and right now that is which job boards a scan runs.
 */

type SettingRecord = { value: string }

function readSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | SettingRecord
    | undefined

  return row?.value ?? null
}

function writeSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

// ---------- job boards ----------

const boardKey = (source: BoardSource) => `board.${source}.enabled`

export function isBoardEnabled(source: BoardSource): boolean {
  return boardEnabledFromStored(source, readSetting(boardKey(source)))
}

export function listBoardPreferences(): BoardPreference[] {
  return configuredSources().map(source => ({ source, enabled: isBoardEnabled(source) }))
}

/**
 * Turns a board on or off, and returns where every board ended up.
 *
 * The whole list rather than a success flag, because the request can be
 * declined: turning off the last enabled board is refused, and that board comes
 * back still on. Callers apply what they are given instead of assuming the
 * change took.
 *
 * The refusal lives here and not only in the UI because this is what the
 * scanner reads. A renderer that got the guard wrong should not be able to
 * leave the scanner with nothing to run.
 */
export function setBoardEnabled(source: BoardSource, enabled: boolean): BoardPreference[] {
  const stillOn = configuredSources().filter(other => isBoardEnabled(other))

  if (enabled || !isLastEnabledBoard(source, stillOn)) {
    writeSetting(boardKey(source), enabled ? '1' : '0')
  }

  return listBoardPreferences()
}

// ---------- scheduled scan ----------

const SCHEDULE_KEY = 'schedule.config'

/** A stored JSON row, or null when there is none or it does not parse. */
function readJson(key: string): unknown {
  const raw = readSetting(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * The saved schedule exactly as stored. Unvalidated on purpose: the shape check
 * belongs with the validators, and a half-written row should read as "no
 * schedule", not crash the scan that would have used it.
 */
export function readStoredSchedule(): unknown {
  return readJson(SCHEDULE_KEY)
}

export function writeStoredSchedule(config: ScheduleConfig): void {
  writeSetting(SCHEDULE_KEY, JSON.stringify(config))
}

export function deleteStoredSchedule(): void {
  db.prepare('DELETE FROM settings WHERE key = ?').run(SCHEDULE_KEY)
}

// ---------- autofill profile ----------

const PROFILE_KEY = 'profile.data'

/** Unvalidated, for the same reason as the schedule above. */
export function readStoredProfile(): unknown {
  return readJson(PROFILE_KEY)
}

export function writeStoredProfile(profile: Profile): void {
  writeSetting(PROFILE_KEY, JSON.stringify(profile))
}

// ---------- company watchlist ----------

const WATCHLIST_KEY = 'watchlist.companies'

/** Unvalidated, for the same reason as the schedule above. */
export function readStoredWatchlist(): unknown {
  return readJson(WATCHLIST_KEY)
}

export function writeStoredWatchlist(companies: WatchedCompany[]): void {
  writeSetting(WATCHLIST_KEY, JSON.stringify(companies))
}

// ---------- search history ----------

const SEARCH_HISTORY_KEY = 'search.history'

/** Unvalidated, for the same reason as the schedule above. */
export function readStoredSearchHistory(): unknown {
  return readJson(SEARCH_HISTORY_KEY)
}

export function writeStoredSearchHistory(entries: SearchHistoryEntry[]): void {
  writeSetting(SEARCH_HISTORY_KEY, JSON.stringify(entries))
}

// ---------- updates ----------

const UPDATE_CACHE_KEY = 'update.lastCheck'
const UPDATE_DISMISSED_KEY = 'update.dismissedVersion'
const UPDATE_AUTO_CHECK_KEY = 'update.autoCheck'

/** What the last successful check found, so a launch can answer without asking. */
export interface UpdateCache {
  latestVersion: string
  releaseUrl: string
  releaseNotes: string
  checkedAt: string
}

export function readUpdateCache(): UpdateCache | null {
  const raw = readSetting(UPDATE_CACHE_KEY)
  if (!raw) return null

  // The row is written by this app, but it is still parsed defensively — a
  // half-written or hand-edited row should cost a fresh check, not a crash on
  // launch before the window is even up.
  try {
    const parsed = JSON.parse(raw) as Partial<UpdateCache>
    if (typeof parsed.latestVersion !== 'string' || typeof parsed.checkedAt !== 'string') {
      return null
    }
    return {
      latestVersion: parsed.latestVersion,
      releaseUrl: typeof parsed.releaseUrl === 'string' ? parsed.releaseUrl : '',
      releaseNotes: typeof parsed.releaseNotes === 'string' ? parsed.releaseNotes : '',
      checkedAt: parsed.checkedAt,
    }
  } catch {
    return null
  }
}

export function writeUpdateCache(cache: UpdateCache): void {
  writeSetting(UPDATE_CACHE_KEY, JSON.stringify(cache))
}

/** The version whose notice was waved away. Null once a newer one appears. */
export function readDismissedVersion(): string | null {
  return readSetting(UPDATE_DISMISSED_KEY)
}

export function writeDismissedVersion(version: string): void {
  writeSetting(UPDATE_DISMISSED_KEY, version)
}

/**
 * Whether the app checks by itself on launch.
 *
 * On unless turned off. The app tells people it has no telemetry and sends
 * nothing anywhere, so the one request it does make had better be one they can
 * stop — see the About section, which says what the check sends.
 */
export function isAutoCheckEnabled(): boolean {
  return readSetting(UPDATE_AUTO_CHECK_KEY) !== '0'
}

export function setAutoCheckEnabled(enabled: boolean): void {
  writeSetting(UPDATE_AUTO_CHECK_KEY, enabled ? '1' : '0')
}

import { readStoredSearchHistory, writeStoredSearchHistory } from "../db/db.js"

/**
 * The searches run from the Daily scan screen, newest first.
 *
 * Running the same search again moves it to the top rather than adding a copy,
 * so the list stays a list of different searches and not a log of button presses.
 */

export const MAX_SEARCH_HISTORY = 12

const DATES: DatePosted[] = ['24h', 'week', 'month']
const JOB_TYPES: JobType[] = ['internship', 'full-time', 'part-time']

/** Two searches with the same id would return the same jobs. */
export function searchId(search: SearchParams): string {
  return JSON.stringify([
    search.keywords.map(word => word.trim().toLowerCase()),
    [...search.location].map(place => place.trim().toLowerCase()).sort(),
    search.datePosted ?? null,
    search.jobType,
    search.maxJobs ?? null,
  ])
}

function isEntry(value: unknown): value is SearchHistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const { id, search, lastRunAt } = value as Record<string, unknown>
  if (typeof id !== 'string' || typeof lastRunAt !== 'string') return false
  if (typeof search !== 'object' || search === null) return false

  const s = search as Record<string, unknown>
  const strings = (list: unknown) => Array.isArray(list) && list.every(item => typeof item === 'string')
  return strings(s.keywords) && strings(s.location) && JOB_TYPES.includes(s.jobType as JobType)
    && (s.datePosted === undefined || DATES.includes(s.datePosted as DatePosted))
}

/** Entries that no longer read as a search are dropped one by one, not the whole list. */
export function listSearchHistory(): SearchHistoryEntry[] {
  const stored = readStoredSearchHistory()
  return Array.isArray(stored) ? stored.filter(isEntry) : []
}

export function recordSearch(search: SearchParams): void {
  const id = searchId(search)
  const next = [
    { id, search, lastRunAt: new Date().toISOString() },
    ...listSearchHistory().filter(entry => entry.id !== id),
  ].slice(0, MAX_SEARCH_HISTORY)

  writeStoredSearchHistory(next)
}

export function removeSearch(id: string): SearchHistoryEntry[] {
  const next = listSearchHistory().filter(entry => entry.id !== id)
  writeStoredSearchHistory(next)
  return next
}

export function clearSearchHistory(): SearchHistoryEntry[] {
  writeStoredSearchHistory([])
  return []
}

/** Product rules that several layers need to agree on. */

/** Jobs are deleted this many days after they were first seen. */
export const RETENTION_DAYS = 7

/**
 * Statuses exempt from retention. Deleting a job you applied to would destroy
 * your application history, so acting on a job archives it permanently.
 */
export const ARCHIVED_STATUSES: JobStatus[] = ['saved', 'applied']
export const INBOX_STATUSES: JobStatus[] = ['new', 'rejected']

/** A job at or above this score counts as a strong match. */
export const MATCH_THRESHOLD = 60

/** Per-board cap for a single run. */
export const MAX_JOBS_PER_BOARD = 50

/** The app is a daily tool — anything older than this is noise. */
export const DEFAULT_DATE_POSTED: DatePosted = '24h'

/** How many keywords to auto-extract from a resume. */
export const AUTO_KEYWORD_COUNT = 20

export const MAX_RESUME_BYTES = 10 * 1024 * 1024

/**
 * Below this, an upload is treated as having no text layer. A scanned PDF looks
 * fine to the user but yields nothing, and silently accepting it produces zero
 * keywords and an all-zero match column.
 */
export const MIN_RESUME_TEXT_CHARS = 200

/**
 * The subset of these rules the renderer needs in order to describe them. The UI
 * must never keep its own copy of a number the main process enforces.
 */
export function appConfig(): AppConfig {
  return {
    retentionDays: RETENTION_DAYS,
    maxJobsPerBoard: MAX_JOBS_PER_BOARD,
    defaultDatePosted: DEFAULT_DATE_POSTED,
    matchThreshold: MATCH_THRESHOLD,
    maxResumeBytes: MAX_RESUME_BYTES,
  }
}

/** Labels match the Score Badge components in the design system. */
export const SCORE_BANDS: { label: string; min: number; max: number }[] = [
  { label: 'Strong', min: 80, max: 100 },
  { label: 'Good', min: 60, max: 79 },
  { label: 'Marginal', min: 40, max: 59 },
  { label: 'Weak', min: 0, max: 39 },
]

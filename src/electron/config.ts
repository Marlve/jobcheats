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

/**
 * Which boards a scan runs when you have never said otherwise.
 *
 * Being a Record over JobSource rather than a list is the point: adding a board
 * to the union will not compile until someone decides whether it starts on.
 *
 * Seek starts off. Its scraper is written but has never been run against the
 * live site, so leaving it on would put unproven selectors in front of every
 * scan before anyone has watched one work. Turn it on from Settings.
 */
export const BOARD_ENABLED_BY_DEFAULT: Record<JobSource, boolean> = {
  linkedin: true,
  seek: false,
}

/**
 * Where to send someone to sign in to a board, for the boards that need it.
 *
 * Partial rather than a Record because most boards need nothing: Seek reads
 * without an account, and a board with no entry simply has no Sign in button.
 */
export const SIGN_IN_URL: Partial<Record<JobSource, string>> = {
  linkedin: 'https://www.linkedin.com/login',
}

/** The configured boards, in the order they are declared above. */
export function configuredSources(): JobSource[] {
  return Object.keys(BOARD_ENABLED_BY_DEFAULT) as JobSource[]
}

/**
 * Whether a board is on, given whatever was stored against it.
 *
 * null means the preference has never been set, which is not the same as off:
 * an unanswered question falls back to the default rather than being read as a
 * "no". That is what lets a board be added to the app with a default here and
 * no row written anywhere.
 */
export function boardEnabledFromStored(source: JobSource, stored: string | null): boolean {
  if (stored === null) return BOARD_ENABLED_BY_DEFAULT[source] ?? false
  return stored === '1'
}

/**
 * Whether turning this board off would leave a scan with nothing to read.
 *
 * The caller refuses that, because "no boards" is not a configuration anyone
 * means to be in — it is a scan that silently does nothing, discovered at the
 * point where you had already committed to running it.
 */
export function isLastEnabledBoard(source: JobSource, enabled: JobSource[]): boolean {
  return enabled.length === 1 && enabled[0] === source
}

/** The app is a daily tool — anything older than this is noise. */
export const DEFAULT_DATE_POSTED: DatePosted = '24h'

// ---------- scheduled scan ----------

/** The launch argument that means "run the saved scan, then leave" — see main.ts. */
export const SCAN_FLAG = '--scan'

/** What a saved schedule is registered as in Windows Task Scheduler. */
export const SCHEDULE_TASK_NAME = 'JobCheats daily scan'

// ---------- updates ----------

/**
 * Where releases are published.
 *
 * The check is a plain unauthenticated GET, which means the repository and its
 * releases have to be public — a private one answers 404 to a downloaded copy
 * of the app, and the only way around that would be shipping a token to every
 * user, which is not a thing to do.
 */
export const RELEASES_OWNER = 'Marlve'
export const RELEASES_REPO = 'jobcheats'

export const LATEST_RELEASE_URL =
  `https://api.github.com/repos/${RELEASES_OWNER}/${RELEASES_REPO}/releases/latest`

export const RELEASES_PAGE_URL =
  `https://github.com/${RELEASES_OWNER}/${RELEASES_REPO}/releases`

/**
 * How long a check is good for. The launch check is skipped inside this window,
 * so opening the app six times in a morning still only asks GitHub once —
 * unauthenticated callers get 60 requests an hour from an address, and a shared
 * network should not burn through that.
 *
 * Pressing the button in Settings ignores this.
 */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** A check that has not answered by now is not worth holding onto. */
export const UPDATE_REQUEST_TIMEOUT_MS = 10_000

/** Release notes are a summary in the banner, not the whole changelog. */
export const MAX_RELEASE_NOTES_CHARS = 600

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

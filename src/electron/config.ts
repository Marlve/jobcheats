/** Product rules that several layers need to agree on. */

/** Jobs are deleted this many days after they were first seen. */
export const RETENTION_DAYS = 7

/**
 * Statuses exempt from retention. Deleting a job you applied to would destroy
 * your application history, so acting on a job archives it permanently.
 */
export const ARCHIVED_STATUSES: JobStatus[] = [
  'saved',
  'applied',
  'interview',
  'offer',
  'hired',
  'turned_down',
  'withdrawn',
]
/**
 * Only untouched jobs sit in the inbox and expire. 'rejected' (Not for me, or a
 * job removed from the archive) is in neither list: it is a hidden record that
 * stays so a later scan does not add the same job back.
 */
export const INBOX_STATUSES: JobStatus[] = ['new']
/** Hidden everywhere, never expires. */
export const HIDDEN_STATUS: JobStatus = 'rejected'

/** A job at or above this score counts as a strong match. */
export const MATCH_THRESHOLD = 60

/** Per-board cap for a single run, across all of its locations. */
export const MAX_JOBS_PER_BOARD = 100

/**
 * Which boards a scan runs when you have never said otherwise.
 *
 * Being a Record over BoardSource rather than a list is the point: adding a board
 * to the union will not compile until someone decides whether it starts on.
 *
 * Seek and Japan Dev start off. Seek's scraper is newer and drives a browser
 * through a site that changes; Japan Dev is only useful if you are looking at
 * jobs in Japan, and its first scan opens a page per matching posting. Turn
 * either on from Settings.
 */
export const BOARD_ENABLED_BY_DEFAULT: Record<BoardSource, boolean> = {
  linkedin: true,
  seek: false,
  japandev: false,
}

/**
 * Where to send someone to sign in to a board, for the boards that need it.
 *
 * Partial rather than a Record because some boards need nothing: Japan Dev
 * reads without an account, and a board with no entry simply has no Sign in
 * button. Seek reads without one too, but applying through it needs a session.
 */
export const SIGN_IN_URL: Partial<Record<BoardSource, string>> = {
  linkedin: 'https://www.linkedin.com/login',
  seek: 'https://www.seek.com.au/oauth/login/',
}

/** The configured boards, in the order they are declared above. */
export function configuredSources(): BoardSource[] {
  return Object.keys(BOARD_ENABLED_BY_DEFAULT) as BoardSource[]
}

/**
 * Whether a board is on, given whatever was stored against it.
 *
 * null means the preference has never been set, which is not the same as off:
 * an unanswered question falls back to the default rather than being read as a
 * "no". That is what lets a board be added to the app with a default here and
 * no row written anywhere.
 */
export function boardEnabledFromStored(source: BoardSource, stored: string | null): boolean {
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
export function isLastEnabledBoard(source: BoardSource, enabled: BoardSource[]): boolean {
  return enabled.length === 1 && enabled[0] === source
}

/** A feed or page read over plain HTTP that has not answered by now is not going to. */
export const FEED_REQUEST_TIMEOUT_MS = 30_000

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

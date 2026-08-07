interface Window {
  electron: {
    // ---- window ----

    /** Which platform's window controls the custom title bar sits beside. */
    platform: string;

    minimizeWindow: () => Promise<void>;

    /** Toggles maximised state and resolves to the state it landed in. */
    toggleMaximizeWindow: () => Promise<boolean>;

    closeWindow: () => Promise<void>;

    isWindowMaximized: () => Promise<boolean>;

    /** Fires when the window is maximised or restored by any means. */
    subscribeWindowMaximized: (callback: (maximized: boolean) => void) => () => void;

    // ---- scraping ----
    scrapeAll: (params: SearchParams) => Promise<ScrapeResult[]>;

    cancelScrape: () => Promise<boolean>;

    subscribeScrapeProgress: (callback: (progress: ScrapeProgress) => void) => () => void;

    listRuns: (limit?: number) => Promise<ScrapeRun[]>;

    // ---- job boards ----

    /** Every board the app can run, with whether a scan will use it. */
    listBoards: () => Promise<BoardPreference[]>;

    /**
     * Turns a board on or off. Resolves to where every board ended up — the
     * last enabled board cannot be turned off, so check the result rather than
     * assuming the change took.
     */
    setBoardEnabled: (source: JobSource, enabled: boolean) => Promise<BoardPreference[]>;

    // ---- updates ----

    /** The stored picture. Never hits the network, so call it freely. */
    getUpdateStatus: () => Promise<UpdateStatus>;

    /** Asks GitHub now, ignoring the interval the launch check obeys. */
    checkForUpdates: () => Promise<UpdateStatus>;

    /** Puts the notice down for this version; a newer one raises it again. */
    dismissUpdate: (version: string) => Promise<UpdateStatus>;

    setUpdateAutoCheck: (enabled: boolean) => Promise<UpdateStatus>;

    /** Fires when the launch check lands after the renderer has already asked. */
    subscribeUpdateStatus: (callback: (status: UpdateStatus) => void) => () => void;

    // ---- jobs ----
    listJobs: (options?: ListJobsOptions) => Promise<JobRow[]>;

    countJobs: (options?: ListJobsOptions) => Promise<number>;

    updateJobStatus: (id: number, status: JobStatus) => Promise<boolean>;

    setJobNotes: (id: number, notes: string) => Promise<boolean>;

    getDbStats: () => Promise<DbStats>;

    pruneOldJobs: () => Promise<number>;

    getAppConfig: () => Promise<AppConfig>;

    // ---- resume ----
    pickResume: () => Promise<PickedFile | null>;

    /** Resolves a dropped File to a disk path; '' when unavailable. */
    getPathForFile: (file: File) => string;

    uploadResume: (filePath: string) => Promise<UploadResumeResult>;

    getResume: () => Promise<ResumeMeta | null>;

    deleteResume: () => Promise<boolean>;

    // ---- keywords ----
    listKeywords: () => Promise<ResumeKeyword[]>;

    addKeyword: (keyword: string, weight?: number) => Promise<ResumeKeyword | null>;

    removeKeyword: (id: number) => Promise<boolean>;

    setKeywordEnabled: (id: number, enabled: boolean) => Promise<boolean>;

    resetKeywords: () => Promise<ResumeKeyword[]>;

    // ---- insights ----
    getInsights: () => Promise<ResumeInsights>;
  }
}

// ---------- jobs ----------

type JobSource = 'linkedin' | 'seek'

/** A board and whether a scan will run it. */
interface BoardPreference {
  source: JobSource;
  enabled: boolean;
}

// ---------- updates ----------

/**
 * How the last update check went.
 *
 * 'unknown' means no check has ever completed — a fresh install that has not
 * been online yet. It is kept apart from 'failed' so the About section can say
 * "not checked yet" rather than implying something went wrong.
 */
type UpdateState = 'unknown' | 'current' | 'available' | 'failed';

interface UpdateStatus {
  /** The version of the running app. */
  currentVersion: string;
  /** Newest published version, or null if no check has ever succeeded. */
  latestVersion: string | null;
  /** Release page for the newest version. Always safe to open. */
  releaseUrl: string;
  /** Release notes, trimmed to a summary. Empty when there are none. */
  releaseNotes: string;
  state: UpdateState;
  /** When the last check completed, successful or not. */
  checkedAt: string | null;
  /** Why the last check failed, in plain words. Null unless state is 'failed'. */
  error: string | null;
  /** Whether the app checks by itself on launch. */
  autoCheck: boolean;
  /** The version whose notice was dismissed, so the banner stays down. */
  dismissedVersion: string | null;
}

type JobStatus = 'new' | 'saved' | 'applied' | 'rejected'

type WorkType = 'remote' | 'hybrid' | 'onsite'

type DatePosted = '24h' | 'week' | 'month'

type JobType = 'internship' | 'full-time' | 'part-time'

/** Inbox jobs expire; archived jobs are kept forever. */
type JobView = 'inbox' | 'archive' | 'all'

interface SearchParams {
  keywords: string[];
  location: string[];
  datePosted?: DatePosted
  jobType: JobType
  /** Stop after this many result pages. Defaults to a per-board cap. */
  maxPages?: number;
  /** Stop after this many newly scraped jobs. Defaults to a per-board cap. */
  maxJobs?: number;
}

interface Job {
  source: JobSource,
  jobId: string,
  url: string | null,
  title: string,
  company: string,
  location: string | null,
  aboutText: string,
  postedAt: string | null,
  salary: string | null,
  workType: WorkType | null
}

interface JobRow extends Job {
  id: number,
  status: JobStatus,
  matchScore: number | null,
  matchedKeywords: string[],
  notes: string | null,
  runId: number | null,
  firstSeenAt: string,
  lastSeenAt: string
}

interface ListJobsOptions {
  limit?: number;
  offset?: number;
  source?: JobSource;
  status?: JobStatus;
  /** inbox = new/rejected, archive = saved/applied. Defaults to 'all'. */
  view?: JobView;
  minScore?: number;
  sortBy?: 'score' | 'date' | 'company';
  /** Case-insensitive substring match over title, company and description. */
  search?: string;
}

/**
 * Product rules the main process enforces, surfaced so the UI can describe them
 * without keeping its own copy of the numbers. These are facts, not preferences
 * — nothing in the renderer can change them.
 */
interface AppConfig {
  retentionDays: number;
  /** Hard ceiling on how many jobs a single run will scrape per board. */
  maxJobsPerBoard: number;
  defaultDatePosted: DatePosted;
  /** A job at or above this score counts as a strong match. */
  matchThreshold: number;
  maxResumeBytes: number;
}

interface DbStats {
  inboxCount: number;
  archiveCount: number;
  totalCount: number;
  oldestFirstSeenAt: string | null;
  nextExpiryAt: string | null;
  retentionDays: number;
  databaseBytes: number;
}

// ---------- scraping ----------

type ScrapePhase =
  | 'starting'
  | 'authenticating'
  | 'searching'
  | 'scraping'
  | 'done'
  | 'cancelled'
  | 'error'

interface ScrapeProgress {
  source: JobSource;
  phase: ScrapePhase;
  page: number;
  inserted: number;
  skipped: number;
  failed: number;
  /** 1-based position when several boards run in sequence. */
  boardIndex?: number;
  boardCount?: number;
  message?: string;
}

type ScrapeResult =
  | {
      ok: true;
      source: JobSource;
      runId: number;
      inserted: number;
      skipped: number;
      failed: number;
      cancelled: boolean;
    }
  | { ok: false; source: JobSource; runId: number | null; error: string }

interface ScrapeRun {
  id: number;
  source: JobSource;
  startedAt: string;
  finishedAt: string | null;
  inserted: number;
  skipped: number;
  failed: number;
  error: string | null;
}

// ---------- resume ----------

type KeywordSource = 'auto' | 'manual'

interface ResumeMeta {
  filename: string;
  mime: string;
  uploadedAt: string;
  textLength: number;
  bytes: number;
}

/** A file chosen in the picker but not yet parsed or stored. */
interface PickedFile {
  path: string;
  filename: string;
  bytes: number;
  extension: string;
}

interface ResumeKeyword {
  id: number;
  keyword: string;
  weight: number;
  source: KeywordSource;
  enabled: boolean;
}

type UploadResumeFailure =
  | 'unsupported-type'
  | 'too-large'
  | 'no-text-layer'
  | 'unreadable'

/** What the rejected file turned out to be — shown alongside the error. */
interface RejectedFile {
  filename: string;
  bytes: number;
  extension: string;
  pages?: number;
  characters?: number;
}

type UploadResumeResult =
  | { ok: true; resume: ResumeMeta; keywords: ResumeKeyword[] }
  | { ok: false; reason: UploadResumeFailure; error: string; file?: RejectedFile }

// ---------- insights ----------

interface ScoreBand {
  label: string;
  min: number;
  max: number;
  count: number;
}

interface KeywordHits {
  keyword: string;
  hits: number;
}

interface ResumeInsights {
  /** Percentage of scored jobs at or above the strong-match threshold. */
  headlineScore: number;
  threshold: number;
  totalJobs: number;
  scoredJobs: number;
  /** True when there are too few jobs for the numbers to mean much. */
  lowSample: boolean;
  distribution: ScoreBand[];
  strongestKeywords: KeywordHits[];
  deadKeywords: KeywordHits[];
  skillGaps: KeywordHits[];
}

// ---------- playwright ----------

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

interface StorageState {
  cookies: PlaywrightCookie[];
  origins: {
    origin: string;
    localStorage: {
      name: string;
      value: string
    }[]
  }[];
}

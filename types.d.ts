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
    setBoardEnabled: (source: BoardSource, enabled: boolean) => Promise<BoardPreference[]>;

    /**
     * Opens an ordinary browser at the board's sign-in page, using the profile
     * scans use. Resolves when that window is closed, which can be minutes.
     */
    signIn: (source: BoardSource) => Promise<SignInResult>;

    // ---- autofill ----
    getProfile: () => Promise<Profile>;

    saveProfile: (profile: Profile) => Promise<Profile>;

    /**
     * First call opens the job in a visible browser, presses Apply and fills what
     * that leads to (a LinkedIn Easy Apply popup, stepped through, or the
     * company's own form). Later calls carry on with an open popup, else fill
     * whatever form is in its front tab. Never presses Submit.
     */
    autofill: (url: string) => Promise<AutofillResult>;

    /** Gives up on an autofill that is stuck: closes its window and stops any cover letter being written. */
    cancelAutofill: () => Promise<void>;

    /** Whether Autofill writes cover letters with `claude -p`. Off until turned on. */
    getCoverLetterEnabled: () => Promise<boolean>;

    setCoverLetterEnabled: (enabled: boolean) => Promise<boolean>;

    /** Form questions with the answer to give each time they come up. Each call returns the whole list. */
    listAnswers: () => Promise<SavedAnswer[]>;

    /** Sets the answer to a question; an empty answer puts it back to waiting. */
    saveAnswer: (question: string, answer: string) => Promise<SavedAnswer[]>;

    deleteAnswer: (question: string) => Promise<SavedAnswer[]>;

    // ---- scheduled scan ----

    /** Where the saved schedule stands, including whether its Windows task exists. */
    getSchedule: () => Promise<ScheduleStatus>;

    /** Saves the schedule and registers the Windows task. Check `error` on the result. */
    saveSchedule: (config: ScheduleConfig) => Promise<ScheduleStatus>;

    clearSchedule: () => Promise<ScheduleStatus>;

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

    // ---- pipeline ----

    /** Where every saved or applied job ended up, as the flows of a Sankey diagram. */
    getPipeline: () => Promise<PipelineGraph>;

    // ---- search history ----
    listSearchHistory: () => Promise<SearchHistoryEntry[]>;

    removeSearchHistory: (id: string) => Promise<SearchHistoryEntry[]>;

    clearSearchHistory: () => Promise<SearchHistoryEntry[]>;

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

/** A job board a scan can read. These are the ones with a Settings toggle. */
type BoardSource = 'linkedin' | 'seek' | 'japandev'

/** Where a job came from. */
type JobSource = BoardSource

/** A board and whether a scan will run it. */
interface BoardPreference {
  source: BoardSource;
  enabled: boolean;
}

/** `ok` means the window was opened and has since been closed, not that anyone signed in. */
type SignInResult = { ok: true } | { ok: false; error: string }

// ---------- autofill ----------

type YesNo = 'yes' | 'no' | ''

/** What gets typed into application forms. An empty field is left for you. */
interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** As you would type it into a "Location" box. */
  location: string;
  linkedin: string;
  github: string;
  website: string;
  salary: string;
  /** '' is unanswered, and an unanswered question is never guessed. */
  workAuthorized: YesNo;
  needsSponsorship: YesNo;
}

/**
 * A form question and what to answer it. An empty `answer` is a question
 * Autofill met and could not answer — waiting for you to.
 */
interface SavedAnswer {
  /** As the form worded it. Two wordings that differ only in case or punctuation are the same question. */
  question: string;
  answer: string;
  /** The choices the form offered, when it was a dropdown or radio group; empty for a typed answer. */
  options: string[];
  /** Typed here, or copied from what you entered in a form. Typed answers are never overwritten by a form. */
  source: 'typed' | 'learned';
  seenAt: string;
}

type AutofillResult =
  | { ok: true; stage: 'opened' }
  | {
      ok: true;
      stage: 'filled';
      filled: string[];
      /** Required fields still empty after filling. */
      needsYou: string[];
      /** Other fields that were left alone. */
      skipped: number;
      /** Easy Apply only: on its last page (Submit is yours), or stuck on a step that needs you. */
      stoppedAt?: 'review' | 'questions';
      /** Cover letters are on but one could not be written; why, in a sentence. */
      coverLetterError?: string;
    }
  | { ok: false; error: string }

// ---------- search history ----------

/** A search that was run from the Daily scan screen. */
interface SearchHistoryEntry {
  /** Same search, same id — running it again moves it to the top instead of adding a copy. */
  id: string;
  search: SearchParams;
  lastRunAt: string;
}

// ---------- pipeline ----------

type PipelineTone = 'neutral' | 'info' | 'warn' | 'success' | 'danger' | 'muted'

interface PipelineNode {
  id: string;
  label: string;
  /** Column, left to right. */
  rank: number;
  tone: PipelineTone;
  value: number;
}

interface PipelineLink {
  source: string;
  target: string;
  value: number;
}

interface PipelineGraph {
  nodes: PipelineNode[];
  links: PipelineLink[];
  /** Jobs that were saved or applied to. Zero means there is nothing to draw. */
  total: number;
}

// ---------- scheduled scan ----------

/** A search to run by itself once a day. */
interface ScheduleConfig {
  /** 24-hour local time, "HH:MM". */
  time: string;
  search: SearchParams;
}

interface ScheduleStatus {
  /** False where no Windows task can be registered — see `unsupportedReason`. */
  supported: boolean;
  unsupportedReason: string | null;
  /** Null means nothing is scheduled. */
  config: ScheduleConfig | null;
  /** Whether the Windows task is really there. `config` outlives a task someone deleted. */
  taskInstalled: boolean;
  /** Why the last attempt to change the task failed, in plain words. */
  error: string | null;
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

/**
 * 'rejected' is you removing a job ("Not for me", or Remove in the archive). It
 * is hidden from every list and kept, so a later scan does not add it back. The
 * employer saying no is 'turned_down', a separate thing that belongs to the pipeline.
 */
type JobStatus =
  | 'new'
  | 'saved'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'hired'
  | 'turned_down'
  | 'withdrawn'
  | 'rejected'

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

/**
 * What a posting's wording says about work rights. 'none' means it is silent,
 * which is not the same as saying you would be sponsored — or refused.
 */
type VisaKind = 'sponsors' | 'restricted' | 'mixed' | 'none'

interface JobRow extends Job {
  id: number,
  status: JobStatus,
  matchScore: number | null,
  matchedKeywords: string[],
  visa: VisaKind,
  /** The phrases the verdict rests on, as written in the posting. */
  visaEvidence: string[],
  /** The title sounds senior (Senior, Lead, Principal, Manager…). */
  senior: boolean,
  /** The largest minimum years of experience the posting states; null when it names none. */
  minYears: number | null,
  /** The phrases the verdict rests on, as written in the posting. */
  experienceEvidence: string[],
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
  /** inbox = new, archive = saved/applied and later stages. Defaults to 'all' (removed jobs never show). */
  view?: JobView;
  minScore?: number;
  /** not-restricted hides jobs that say you need existing work rights. */
  visa?: 'not-restricted' | 'sponsors';
  /**
   * Hides jobs that want more experience than you have. Every option hides senior
   * titles; junior also hides a stated 3+ years, entry a stated 2+ years. A posting
   * that states no years is kept.
   */
  experience?: 'not-senior' | 'junior' | 'entry';
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

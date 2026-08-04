type Statistics = {
  cpuUsage: number,
  ramUsage: number,
  storageUsage: number,
};

type StaticData = {
  totalStorage: {
    total: number,

  },
  cpuModel: string,
  totalMemoryGB: number;
};

interface Window {
  electron: {
    subscribeStatistics: (callback: (statistics: Statistics) => void) => void;

    getStaticData: () => Promise<StaticData>;

    // ---- scraping ----
    scrapeLinkedIn: (params: SearchParams) => Promise<ScrapeResult>;

    scrapeAll: (params: SearchParams) => Promise<ScrapeResult[]>;

    cancelScrape: () => Promise<boolean>;

    subscribeScrapeProgress: (callback: (progress: ScrapeProgress) => void) => () => void;

    listRuns: (limit?: number) => Promise<ScrapeRun[]>;

    // ---- jobs ----
    listJobs: (options?: ListJobsOptions) => Promise<JobRow[]>;

    countJobs: (options?: ListJobsOptions) => Promise<number>;

    updateJobStatus: (id: number, status: JobStatus) => Promise<boolean>;

    setJobNotes: (id: number, notes: string) => Promise<boolean>;

    getDbStats: () => Promise<DbStats>;

    pruneOldJobs: () => Promise<number>;

    // ---- resume ----
    pickResume: () => Promise<string | null>;

    uploadResume: (filePath: string) => Promise<UploadResumeResult>;

    getResume: () => Promise<ResumeMeta | null>;

    deleteResume: () => Promise<boolean>;

    // ---- keywords ----
    listKeywords: () => Promise<ResumeKeyword[]>;

    addKeyword: (keyword: string, weight?: number) => Promise<ResumeKeyword | null>;

    removeKeyword: (id: number) => Promise<boolean>;

    setKeywordEnabled: (id: number, enabled: boolean) => Promise<boolean>;

    setKeywordWeight: (id: number, weight: number) => Promise<boolean>;

    resetKeywords: () => Promise<ResumeKeyword[]>;

    // ---- insights ----
    getInsights: () => Promise<ResumeInsights>;
  }
}

// ---------- jobs ----------

type JobSource = 'linkedin' | 'seek'

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

type UploadResumeResult =
  | { ok: true; resume: ResumeMeta; keywords: ResumeKeyword[] }
  | { ok: false; reason: UploadResumeFailure; error: string }

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

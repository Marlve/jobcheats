import fs from 'fs'
import { db, dbPath, withTransaction } from "./schema.js"
import { ARCHIVED_STATUSES, HIDDEN_STATUS, INBOX_STATUSES, RETENTION_DAYS } from "../config.js"
import { classifyVisa } from "../services/visa.js"
import { classifyExperience } from "../services/experience.js"

// ---------- statements ----------

const upsertJobStmt = db.prepare(`
  INSERT INTO jobs
    (source, job_id, url, title, company, location, about_text, posted_at, salary, work_type, run_id, visa, visa_evidence,
     senior, min_years, experience_evidence)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (source, job_id) DO UPDATE SET
    last_seen_at = CURRENT_TIMESTAMP,
    visa         = excluded.visa,
    visa_evidence = excluded.visa_evidence,
    senior       = excluded.senior,
    min_years    = excluded.min_years,
    experience_evidence = excluded.experience_evidence,
    url          = COALESCE(excluded.url, jobs.url),
    posted_at    = COALESCE(excluded.posted_at, jobs.posted_at),
    salary       = COALESCE(excluded.salary, jobs.salary),
    work_type    = COALESCE(excluded.work_type, jobs.work_type)
`)

const jobExistsStmt = db.prepare(
  'SELECT 1 AS hit FROM jobs WHERE source = ? AND job_id = ? LIMIT 1'
)

const updateStatusStmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?')
const insertEventStmt = db.prepare('INSERT INTO job_events (job_id, status) VALUES (?, ?)')
const jobStatusStmt = db.prepare('SELECT status FROM jobs WHERE id = ?')
const hasEventStmt = db.prepare('SELECT 1 AS hit FROM job_events WHERE job_id = ? LIMIT 1')
const updateNotesStmt = db.prepare('UPDATE jobs SET notes = ? WHERE id = ?')
const updateMatchStmt = db.prepare(
  'UPDATE jobs SET match_score = ?, matched_keywords = ? WHERE id = ?'
)
const updateVisaStmt = db.prepare('UPDATE jobs SET visa = ?, visa_evidence = ? WHERE id = ?')
const updateExperienceStmt = db.prepare(
  'UPDATE jobs SET senior = ?, min_years = ?, experience_evidence = ? WHERE id = ?'
)

// ---------- row mapping ----------

type JobRecord = {
  id: number
  source: string
  job_id: string
  url: string | null
  title: string
  company: string
  location: string | null
  about_text: string
  posted_at: string | null
  status: string
  match_score: number | null
  matched_keywords: string | null
  salary: string | null
  work_type: string | null
  run_id: number | null
  notes: string | null
  visa: string | null
  visa_evidence: string | null
  senior: number | null
  min_years: number | null
  experience_evidence: string | null
  first_seen_at: string
  last_seen_at: string
}

function parseKeywords(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.filter(k => typeof k === 'string') : []
  } catch {
    return []
  }
}

function toJobRow(record: JobRecord): JobRow {
  return {
    id: record.id,
    source: record.source as JobSource,
    jobId: record.job_id,
    url: record.url,
    title: record.title,
    company: record.company,
    location: record.location,
    aboutText: record.about_text,
    postedAt: record.posted_at,
    status: record.status as JobStatus,
    matchScore: record.match_score,
    matchedKeywords: parseKeywords(record.matched_keywords),
    salary: record.salary,
    workType: record.work_type as WorkType | null,
    runId: record.run_id,
    notes: record.notes,
    // A row not yet classified reads as "no signal" rather than as an error.
    visa: (record.visa ?? 'none') as VisaKind,
    visaEvidence: parseKeywords(record.visa_evidence),
    senior: record.senior === 1,
    minYears: record.min_years,
    experienceEvidence: parseKeywords(record.experience_evidence),
    firstSeenAt: record.first_seen_at,
    lastSeenAt: record.last_seen_at,
  }
}

/** SQL placeholder list, e.g. ?, ?, ? */
function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ')
}

// ---------- filtering ----------

const SORT_COLUMNS: Record<NonNullable<ListJobsOptions['sortBy']>, string> = {
  // NULL scores sort last so unscored jobs never crowd out real matches.
  score: 'match_score IS NULL, match_score DESC, first_seen_at DESC',
  date: 'first_seen_at DESC, id DESC',
  company: 'company COLLATE NOCASE ASC, match_score DESC',
}

/** Each experience filter hides senior titles; these also hide a stated minimum of this many years or more. */
const EXPERIENCE_YEARS_CAP: Record<NonNullable<ListJobsOptions['experience']>, number | undefined> = {
  'not-senior': undefined,
  junior: 3,
  entry: 2,
}

function buildFilter(options: ListJobsOptions) {
  const clauses: string[] = []
  const values: (string | number)[] = []

  if (options.source) {
    clauses.push('source = ?')
    values.push(options.source)
  }
  if (options.status) {
    clauses.push('status = ?')
    values.push(options.status)
  }
  if (options.view && options.view !== 'all') {
    const statuses = options.view === 'inbox' ? INBOX_STATUSES : ARCHIVED_STATUSES
    clauses.push(`status IN (${placeholders(statuses.length)})`)
    values.push(...statuses)
  } else {
    clauses.push('status != ?')
    values.push(HIDDEN_STATUS)
  }
  if (options.minScore !== undefined) {
    clauses.push('match_score >= ?')
    values.push(options.minScore)
  }
  // Unclassified rows (NULL) are not restricted — nothing says they are.
  if (options.visa === 'not-restricted') {
    clauses.push("(visa IS NULL OR visa != 'restricted')")
  } else if (options.visa === 'sponsors') {
    clauses.push("visa = 'sponsors'")
  }
  // Unclassified rows (NULL) and postings that state no years pass — silence is
  // not a requirement.
  if (options.experience) {
    clauses.push('(senior IS NULL OR senior = 0)')
    const yearsCap = EXPERIENCE_YEARS_CAP[options.experience]
    if (yearsCap !== undefined) {
      clauses.push('(min_years IS NULL OR min_years < ?)')
      values.push(yearsCap)
    }
  }
  if (options.search?.trim()) {
    clauses.push('(title LIKE ? OR company LIKE ? OR about_text LIKE ?)')
    const term = `%${options.search.trim()}%`
    values.push(term, term, term)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return { where, values }
}

// ---------- reads ----------

export function jobExists(source: JobSource, jobId: string): boolean {
  return jobExistsStmt.get(source, jobId) !== undefined
}

/** The listing a URL was scraped from, newest first if the same link was seen twice. */
export function findJobByUrl(url: string): JobRow | null {
  const record = db.prepare('SELECT * FROM jobs WHERE url = ? ORDER BY id DESC LIMIT 1').get(url) as
    | JobRecord
    | undefined

  return record ? toJobRow(record) : null
}

export function listJobs(options: ListJobsOptions = {}): JobRow[] {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500)
  const offset = Math.max(options.offset ?? 0, 0)
  const { where, values } = buildFilter(options)
  // Whitelisted lookup — never interpolate a caller-supplied sort key.
  const orderBy = SORT_COLUMNS[options.sortBy ?? 'score']

  const rows = db
    .prepare(`SELECT * FROM jobs ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as JobRecord[]

  return rows.map(toJobRow)
}

export function countJobs(options: ListJobsOptions = {}): number {
  const { where, values } = buildFilter(options)
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM jobs ${where}`)
    .get(...values) as { total: number } | undefined

  return row?.total ?? 0
}

/** Minimal shape needed for scoring — avoids loading every description twice. */
export interface ScorableJob {
  id: number
  title: string
  aboutText: string
}

/** Company is not selected — the scorer reads requirements, and a company name
 *  is not one. See the note in `scoreJob`. */
export function getScorableJobs(runId?: number): ScorableJob[] {
  const rows = runId === undefined
    ? db.prepare('SELECT id, title, about_text FROM jobs').all()
    : db.prepare('SELECT id, title, about_text FROM jobs WHERE run_id = ?').all(runId)

  return (rows as { id: number; title: string; about_text: string }[])
    .map(row => ({
      id: row.id,
      title: row.title,
      aboutText: row.about_text,
    }))
}

/** Non-null match scores, for the insights distribution. */
export function getMatchScores(): number[] {
  const rows = db
    .prepare('SELECT match_score FROM jobs WHERE match_score IS NOT NULL AND status != ?')
    .all(HIDDEN_STATUS) as { match_score: number }[]
  return rows.map(row => row.match_score)
}

/**
 * Which keywords hit on each scored job. Aggregating the stored JSON is far
 * cheaper than re-running every keyword against every description.
 */
export function getMatchedKeywordSets(): string[][] {
  const rows = db
    .prepare('SELECT matched_keywords FROM jobs WHERE matched_keywords IS NOT NULL AND status != ?')
    .all(HIDDEN_STATUS) as { matched_keywords: string }[]
  return rows.map(row => parseKeywords(row.matched_keywords))
}

/** All job text, used by insights to find terms missing from the resume. */
export function getJobCorpus(): string[] {
  const rows = db.prepare('SELECT title, about_text FROM jobs').all() as
    { title: string; about_text: string }[]
  return rows.map(row => `${row.title} ${row.about_text}`)
}

export function getDbStats(): DbStats {
  const count = (statuses: JobStatus[]) => {
    const row = db
      .prepare(`SELECT COUNT(*) AS total FROM jobs WHERE status IN (${placeholders(statuses.length)})`)
      .get(...statuses) as { total: number } | undefined
    return row?.total ?? 0
  }

  const oldest = db
    .prepare('SELECT MIN(first_seen_at) AS oldest FROM jobs')
    .get() as { oldest: string | null } | undefined

  // Next expiry is driven by the oldest *inbox* job — archived rows never expire.
  const nextExpiry = db
    .prepare(`
      SELECT datetime(MIN(first_seen_at), '+${RETENTION_DAYS} days') AS next
      FROM jobs WHERE status IN (${placeholders(INBOX_STATUSES.length)})
    `)
    .get(...INBOX_STATUSES) as { next: string | null } | undefined

  let databaseBytes = 0
  try {
    databaseBytes = fs.statSync(dbPath).size
  } catch {
    databaseBytes = 0
  }

  const inboxCount = count(INBOX_STATUSES)
  const archiveCount = count(ARCHIVED_STATUSES)

  return {
    inboxCount,
    archiveCount,
    totalCount: inboxCount + archiveCount,
    oldestFirstSeenAt: oldest?.oldest ?? null,
    nextExpiryAt: nextExpiry?.next ?? null,
    retentionDays: RETENTION_DAYS,
    databaseBytes,
  }
}

// ---------- writes ----------

/** Returns true when the job was new, false when it already existed. */
export function insertJob(job: Job, runId: number | null = null): boolean {
  const isNew = !jobExists(job.source, job.jobId)
  const visa = classifyVisa(job.aboutText)
  const experience = classifyExperience(job.title, job.aboutText)

  upsertJobStmt.run(
    job.source,
    job.jobId,
    job.url,
    job.title,
    job.company,
    job.location,
    job.aboutText,
    job.postedAt,
    job.salary,
    job.workType,
    runId,
    visa.kind,
    JSON.stringify(visa.evidence),
    experience.senior ? 1 : 0,
    experience.minYears,
    JSON.stringify(experience.evidence)
  )

  return isNew
}

/** Rewrites the visa verdict on stored jobs, after the wording rules change. */
export function setJobVisas(rows: { id: number; kind: VisaKind; evidence: string[] }[]) {
  withTransaction(() => {
    for (const row of rows) {
      updateVisaStmt.run(row.kind, JSON.stringify(row.evidence), row.id)
    }
  })
}

/** Rewrites the experience verdict on stored jobs, after the wording rules change. */
export function setJobExperiences(
  rows: { id: number; senior: boolean; minYears: number | null; evidence: string[] }[]
) {
  withTransaction(() => {
    for (const row of rows) {
      updateExperienceStmt.run(row.senior ? 1 : 0, row.minYears, JSON.stringify(row.evidence), row.id)
    }
  })
}

export function updateJobStatus(id: number, status: JobStatus): boolean {
  return withTransaction(() => {
    const before = jobStatusStmt.get(id) as { status: string } | undefined
    if (!before) return false

    // A job moved before the log existed has no history, so its starting point
    // is written down first — otherwise "applied, then withdrew" would read as
    // "never applied".
    if (!hasEventStmt.get(id)) insertEventStmt.run(id, before.status)

    updateStatusStmt.run(status, id)
    insertEventStmt.run(id, status)
    return true
  })
}

/** What the pipeline reads: where each saved or applied job is, and where it has been. */
export function getPipelineRows(): { status: JobStatus; reached: JobStatus[] }[] {
  const rows = db
    .prepare(`
      SELECT j.status AS status, GROUP_CONCAT(DISTINCT e.status) AS reached
      FROM jobs j LEFT JOIN job_events e ON e.job_id = j.id
      WHERE j.status IN (${placeholders(ARCHIVED_STATUSES.length)})
      GROUP BY j.id
    `)
    .all(...ARCHIVED_STATUSES) as { status: string; reached: string | null }[]

  return rows.map(row => ({
    status: row.status as JobStatus,
    reached: row.reached ? (row.reached.split(',') as JobStatus[]) : [],
  }))
}

export function setJobNotes(id: number, notes: string): boolean {
  const { changes } = updateNotesStmt.run(notes, id)
  return Number(changes) > 0
}

/**
 * A null score is stored as NULL, not 0 — the job could not be scored at all,
 * and a 0 would read as "no overlap with your resume" when the truth is that
 * the posting named nothing to compare against.
 */
export function setJobMatch(id: number, score: number | null, matchedKeywords: string[]) {
  updateMatchStmt.run(score, JSON.stringify(matchedKeywords), id)
}

export function setJobMatches(
  matches: { id: number; score: number | null; matchedKeywords: string[] }[]
) {
  withTransaction(() => {
    for (const match of matches) {
      setJobMatch(match.id, match.score, match.matchedKeywords)
    }
  })
}

export function clearAllMatches() {
  db.exec('UPDATE jobs SET match_score = NULL, matched_keywords = NULL')
}

/**
 * Deletes jobs past the retention window.
 *
 * Saved and applied jobs are exempt — acting on a job archives it permanently,
 * because losing your application history is worse than an unbounded table.
 */
export function pruneOldJobs(retentionDays = RETENTION_DAYS): number {
  const { changes } = db
    .prepare(`
      DELETE FROM jobs
      WHERE first_seen_at < datetime('now', ?)
        AND status IN (${placeholders(INBOX_STATUSES.length)})
    `)
    .run(`-${retentionDays} days`, ...INBOX_STATUSES)

  const deleted = Number(changes)
  if (deleted > 0) console.log(`[db] pruned ${deleted} job(s) older than ${retentionDays} days`)

  return deleted
}

/**
 * Empties the inbox now rather than waiting for retention. Only jobs nobody has
 * acted on go: saved and applied jobs are your history, and a job marked "Not
 * for me" stays so the next scan does not add it back.
 */
export function deleteInboxJobs(): number {
  const { changes } = db
    .prepare(`DELETE FROM jobs WHERE status IN (${placeholders(INBOX_STATUSES.length)})`)
    .run(...INBOX_STATUSES)

  const deleted = Number(changes)
  console.log(`[db] deleted ${deleted} inbox job(s) by request`)

  return deleted
}

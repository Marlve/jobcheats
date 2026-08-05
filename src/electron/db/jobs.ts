import fs from 'fs'
import { db, dbPath, withTransaction } from "./schema.js"
import { ARCHIVED_STATUSES, INBOX_STATUSES, RETENTION_DAYS } from "../config.js"

// ---------- statements ----------

const upsertJobStmt = db.prepare(`
  INSERT INTO jobs
    (source, job_id, url, title, company, location, about_text, posted_at, salary, work_type, run_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (source, job_id) DO UPDATE SET
    last_seen_at = CURRENT_TIMESTAMP,
    url          = COALESCE(excluded.url, jobs.url),
    posted_at    = COALESCE(excluded.posted_at, jobs.posted_at),
    salary       = COALESCE(excluded.salary, jobs.salary),
    work_type    = COALESCE(excluded.work_type, jobs.work_type)
`)

const jobExistsStmt = db.prepare(
  'SELECT 1 AS hit FROM jobs WHERE source = ? AND job_id = ? LIMIT 1'
)

const updateStatusStmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?')
const updateNotesStmt = db.prepare('UPDATE jobs SET notes = ? WHERE id = ?')
const updateMatchStmt = db.prepare(
  'UPDATE jobs SET match_score = ?, matched_keywords = ? WHERE id = ?'
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
  }
  if (options.minScore !== undefined) {
    clauses.push('match_score >= ?')
    values.push(options.minScore)
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
    .prepare('SELECT match_score FROM jobs WHERE match_score IS NOT NULL')
    .all() as { match_score: number }[]
  return rows.map(row => row.match_score)
}

/**
 * Which keywords hit on each scored job. Aggregating the stored JSON is far
 * cheaper than re-running every keyword against every description.
 */
export function getMatchedKeywordSets(): string[][] {
  const rows = db
    .prepare('SELECT matched_keywords FROM jobs WHERE matched_keywords IS NOT NULL')
    .all() as { matched_keywords: string }[]
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
    runId
  )

  return isNew
}

export function updateJobStatus(id: number, status: JobStatus): boolean {
  const { changes } = updateStatusStmt.run(status, id)
  return Number(changes) > 0
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

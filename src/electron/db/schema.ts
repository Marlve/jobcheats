import { DatabaseSync } from "node:sqlite";
import path from 'path';
import { app } from 'electron';

export const dbPath = path.join(app.getPath('userData'), 'jobs.db')
export const db = new DatabaseSync(dbPath)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

// ---------- helpers ----------

export function tableExists(name: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name)
  return row !== undefined
}

export function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]
  return rows.some(row => row.name === column)
}

export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

/** Adds a column only if it is missing, so this is safe to run on every launch. */
function addColumn(table: string, column: string, definition: string) {
  if (hasColumn(table, column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

// ---------- jobs ----------

const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    source        TEXT NOT NULL,
    job_id        TEXT NOT NULL,
    url           TEXT,
    title         TEXT NOT NULL,
    company       TEXT NOT NULL,
    location      TEXT,
    about_text    TEXT NOT NULL,
    posted_at     TEXT,
    status        TEXT NOT NULL DEFAULT 'new',
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source, job_id)
  )
`

/**
 * The original schema had no `source` column and a globally unique `job_id`,
 * which would collide once a second board is added. Rebuild it in place and
 * carry existing rows over as LinkedIn results.
 */
function migrateJobsTable() {
  const needsRebuild = tableExists('jobs') && !hasColumn('jobs', 'source')

  if (!needsRebuild) {
    db.exec(CREATE_JOBS_TABLE)
    return
  }

  withTransaction(() => {
    db.exec('ALTER TABLE jobs RENAME TO jobs_legacy')
    db.exec(CREATE_JOBS_TABLE)
    db.exec(`
      INSERT OR IGNORE INTO jobs
        (source, job_id, title, company, location, about_text, first_seen_at, last_seen_at)
      SELECT
        'linkedin',
        job_id,
        COALESCE(title, 'Unknown title'),
        COALESCE(company, 'Unknown company'),
        location,
        about_text,
        COALESCE(scraped_at, CURRENT_TIMESTAMP),
        COALESCE(scraped_at, CURRENT_TIMESTAMP)
      FROM jobs_legacy
    `)
    db.exec('DROP TABLE jobs_legacy')
  })
}

// ---------- resume / keywords / runs ----------

const CREATE_RESUME_TABLE = `
  CREATE TABLE IF NOT EXISTS resume (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    filename    TEXT NOT NULL,
    mime        TEXT NOT NULL,
    text        TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

const CREATE_KEYWORDS_TABLE = `
  CREATE TABLE IF NOT EXISTS resume_keywords (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL UNIQUE,
    weight  REAL NOT NULL DEFAULT 3,
    source  TEXT NOT NULL DEFAULT 'auto',
    enabled INTEGER NOT NULL DEFAULT 1
  )
`

/**
 * Preferences, one row per setting.
 *
 * Key-value rather than a column per preference: these are read by name, never
 * queried across, and a table that needs a migration for every new checkbox is
 * a table that discourages adding one. A missing row means "never set", which
 * is what lets a default live in config.ts instead of being seeded here.
 */
const CREATE_SETTINGS_TABLE = `
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`

const CREATE_RUNS_TABLE = `
  CREATE TABLE IF NOT EXISTS scrape_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    source      TEXT NOT NULL,
    started_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    inserted    INTEGER NOT NULL DEFAULT 0,
    skipped     INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    error       TEXT
  )
`

/**
 * Every status a job has been moved to, in order. The jobs table only says where
 * a job is now; this is what lets a job that was turned down after interviewing
 * stay on the interview path of the pipeline instead of looking like it was
 * turned down straight after applying.
 */
const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS job_events (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`

export function migrate() {
  migrateJobsTable()

  // Matching and provenance columns, added in place — no rebuild needed.
  addColumn('jobs', 'match_score', 'REAL')
  addColumn('jobs', 'matched_keywords', 'TEXT')
  addColumn('jobs', 'salary', 'TEXT')
  addColumn('jobs', 'work_type', 'TEXT')
  addColumn('jobs', 'run_id', 'INTEGER')
  addColumn('jobs', 'notes', 'TEXT')
  // What the posting's wording says about work rights. NULL until classified.
  addColumn('jobs', 'visa', 'TEXT')
  addColumn('jobs', 'visa_evidence', 'TEXT')
  // How experienced the posting wants you to be. NULL until classified.
  addColumn('jobs', 'senior', 'INTEGER')
  addColumn('jobs', 'min_years', 'INTEGER')
  addColumn('jobs', 'experience_evidence', 'TEXT')

  db.exec(CREATE_RESUME_TABLE)
  db.exec(CREATE_KEYWORDS_TABLE)
  db.exec(CREATE_RUNS_TABLE)
  db.exec(CREATE_SETTINGS_TABLE)
  db.exec(CREATE_EVENTS_TABLE)

  // File size, shown on the resume card.
  addColumn('resume', 'bytes', 'INTEGER NOT NULL DEFAULT 0')

  // Keyword weight used to be an occurrence count of 1–3 that scoring ignored;
  // it is now a priority of 1–5 where one occurrence is normal (3). Converted
  // once, in the same step that adds the "set by you" flag.
  if (!hasColumn('resume_keywords', 'weight_manual')) {
    withTransaction(() => {
      addColumn('resume_keywords', 'weight_manual', 'INTEGER NOT NULL DEFAULT 0')
      db.exec('UPDATE resume_keywords SET weight = MIN(5, MAX(1, ROUND(weight)) + 2)')
    })
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs (first_seen_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_match_score ON jobs (match_score DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events (job_id)')
}

migrate()

export function closeDb() {
  if (db.isOpen) db.close()
}

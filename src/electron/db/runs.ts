import { db } from "./schema.js"

type RunRecord = {
  id: number
  source: string
  started_at: string
  finished_at: string | null
  inserted: number
  skipped: number
  failed: number
  error: string | null
}

function toRun(record: RunRecord): ScrapeRun {
  return {
    id: record.id,
    source: record.source as JobSource,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    inserted: record.inserted,
    skipped: record.skipped,
    failed: record.failed,
    error: record.error,
  }
}

export function startRun(source: JobSource): number {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO scrape_runs (source, started_at) VALUES (?, CURRENT_TIMESTAMP)')
    .run(source)

  return Number(lastInsertRowid)
}

export function finishRun(
  id: number,
  tally: { inserted: number; skipped: number; failed: number },
  error: string | null = null
) {
  db.prepare(`
    UPDATE scrape_runs
    SET finished_at = CURRENT_TIMESTAMP, inserted = ?, skipped = ?, failed = ?, error = ?
    WHERE id = ?
  `).run(tally.inserted, tally.skipped, tally.failed, error, id)
}

export function listRuns(limit = 20): ScrapeRun[] {
  const rows = db
    .prepare('SELECT * FROM scrape_runs ORDER BY started_at DESC, id DESC LIMIT ?')
    .all(Math.min(Math.max(limit, 1), 200)) as RunRecord[]

  return rows.map(toRun)
}

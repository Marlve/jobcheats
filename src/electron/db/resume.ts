import { db, withTransaction } from "./schema.js"
import { NORMAL_PRIORITY } from "../services/keywordService.js"

// ---------- resume ----------

type ResumeRecord = {
  filename: string
  mime: string
  text: string
  uploaded_at: string
  bytes: number
}

/**
 * There is only ever one resume — the `CHECK (id = 1)` constraint on the table
 * makes that structural, so replacing is a plain upsert at id 1.
 */
export function saveResume(filename: string, mime: string, text: string, bytes: number) {
  db.prepare(`
    INSERT INTO resume (id, filename, mime, text, bytes, uploaded_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
      filename    = excluded.filename,
      mime        = excluded.mime,
      text        = excluded.text,
      bytes       = excluded.bytes,
      uploaded_at = CURRENT_TIMESTAMP
  `).run(filename, mime, text, bytes)
}

function getResumeRecord(): ResumeRecord | null {
  const row = db
    .prepare('SELECT filename, mime, text, uploaded_at, bytes FROM resume WHERE id = 1')
    .get() as ResumeRecord | undefined
  return row ?? null
}

/** Metadata only — the full text is large and the UI never needs it. */
export function getResumeMeta(): ResumeMeta | null {
  const record = getResumeRecord()
  if (!record) return null

  return {
    filename: record.filename,
    mime: record.mime,
    uploadedAt: record.uploaded_at,
    textLength: record.text.length,
    bytes: record.bytes,
  }
}

export function getResumeText(): string | null {
  return getResumeRecord()?.text ?? null
}

/** Cheap existence check — getResumeMeta() would pull the whole text with it. */
export function hasResume(): boolean {
  return db.prepare('SELECT 1 FROM resume WHERE id = 1').get() !== undefined
}

export function deleteResume(): boolean {
  const { changes } = db.prepare('DELETE FROM resume WHERE id = 1').run()
  return Number(changes) > 0
}

// ---------- keywords ----------

type KeywordRecord = {
  id: number
  keyword: string
  weight: number
  weight_manual: number
  source: string
  enabled: number
}

function toKeyword(record: KeywordRecord): ResumeKeyword {
  return {
    id: record.id,
    keyword: record.keyword,
    weight: record.weight,
    weightManual: record.weight_manual === 1,
    source: record.source as KeywordSource,
    enabled: record.enabled === 1,
  }
}

export function listKeywords(): ResumeKeyword[] {
  const rows = db
    .prepare(`
      SELECT id, keyword, weight, weight_manual, source, enabled FROM resume_keywords
      ORDER BY enabled DESC, weight DESC, keyword ASC
    `)
    .all() as KeywordRecord[]

  return rows.map(toKeyword)
}

export function listEnabledKeywords(): ResumeKeyword[] {
  return listKeywords().filter(keyword => keyword.enabled)
}

/** Returns null when the keyword already exists. */
export function addKeyword(
  keyword: string,
  weight = NORMAL_PRIORITY,
  source: KeywordSource = 'manual'
): ResumeKeyword | null {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized) return null

  const { changes } = db
    .prepare('INSERT OR IGNORE INTO resume_keywords (keyword, weight, source) VALUES (?, ?, ?)')
    .run(normalized, weight, source)

  if (Number(changes) === 0) return null

  const row = db
    .prepare('SELECT id, keyword, weight, weight_manual, source, enabled FROM resume_keywords WHERE keyword = ?')
    .get(normalized) as KeywordRecord | undefined

  return row ? toKeyword(row) : null
}

export function removeKeyword(id: number): boolean {
  const { changes } = db.prepare('DELETE FROM resume_keywords WHERE id = ?').run(id)
  return Number(changes) > 0
}

export function setKeywordEnabled(id: number, enabled: boolean): boolean {
  const { changes } = db
    .prepare('UPDATE resume_keywords SET enabled = ? WHERE id = ?')
    .run(enabled ? 1 : 0, id)
  return Number(changes) > 0
}

/** Sets a keyword's priority. `manual` marks it as set by you, so re-extracting keeps it. */
export function setKeywordWeight(id: number, weight: number, manual: boolean): boolean {
  const { changes } = db
    .prepare('UPDATE resume_keywords SET weight = ?, weight_manual = ? WHERE id = ?')
    .run(weight, manual ? 1 : 0, id)
  return Number(changes) > 0
}

/**
 * Replaces auto-extracted keywords, leaving manual ones alone — a re-upload
 * should not silently discard keywords the user added by hand. A priority you
 * set on an auto keyword is kept too, when the new resume still has that word.
 */
export function replaceAutoKeywords(keywords: { keyword: string; weight: number }[]) {
  withTransaction(() => {
    const pinned = new Map(
      (db
        .prepare(`SELECT keyword, weight FROM resume_keywords WHERE source = 'auto' AND weight_manual = 1`)
        .all() as { keyword: string; weight: number }[])
        .map(row => [row.keyword, row.weight])
    )

    db.exec(`DELETE FROM resume_keywords WHERE source = 'auto'`)

    const insert = db.prepare(
      `INSERT OR IGNORE INTO resume_keywords (keyword, weight, weight_manual, source) VALUES (?, ?, ?, 'auto')`
    )
    for (const { keyword, weight } of keywords) {
      const normalized = keyword.trim().toLowerCase()
      if (!normalized) continue
      const mine = pinned.get(normalized)
      insert.run(normalized, mine ?? weight, mine === undefined ? 0 : 1)
    }
  })
}

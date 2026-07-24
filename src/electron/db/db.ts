import { DatabaseSync } from "node:sqlite";
import path from 'path';
import {app} from 'electron';

const dbPath = path.join(app.getPath('userData'), 'jobs.db')
export const db = new DatabaseSync(dbPath)

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT UNIQUE NOT NULL,
    title TEXT,
    company TEXT,
    location TEXT,
    about_text TEXT NOT NULL,
    scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

export function insertJob(job: Job) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO jobs (job_id, title, company, location, about_text)
    VALUES (?, ?, ?, ?, ?)
  `);

  const {jobId, title, company, location, aboutText} = job

  stmt.run(jobId, title, company, location, aboutText);
}

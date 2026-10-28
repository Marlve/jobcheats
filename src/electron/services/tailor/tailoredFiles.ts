import fs from 'fs'
import path from 'path'
import { app } from 'electron'

/** One folder per job, named by its id, holding that job's last tailored PDF. */
const TAILORED_DIR = path.join(app.getPath('userData'), 'tailored')

/** Where to write a job's tailored PDF. The folder is emptied first, so the next Autofill replaces the last one. */
export function tailoredPdfPath(jobId: number, pdfName: string): string {
  const dir = path.join(TAILORED_DIR, String(jobId))
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    // Nearly always the last tailored PDF held open in a PDF viewer (EBUSY).
    console.warn('[tailor] could not replace the last tailored resume:', err instanceof Error ? err.message : err)
    throw new Error('Close the open tailored PDF, then press Autofill again.')
  }
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, pdfName)
}

export function existingTailoredPdf(jobId: number): string | null {
  const dir = path.join(TAILORED_DIR, String(jobId))
  try {
    const pdf = fs.readdirSync(dir).find(name => name.toLowerCase().endsWith('.pdf'))
    return pdf ? path.join(dir, pdf) : null
  } catch {
    return null
  }
}

/** Deletes the tailored PDFs of jobs that are gone. A file held open by a viewer is left for the next sweep. */
export function removeTailoredExcept(jobIds: Set<number>): void {
  let names: string[]
  try {
    names = fs.readdirSync(TAILORED_DIR)
  } catch {
    return
  }
  for (const name of names) {
    if (jobIds.has(Number(name))) continue
    try {
      fs.rmSync(path.join(TAILORED_DIR, name), { recursive: true, force: true })
    } catch (err) {
      console.warn('[tailor] could not remove an old tailored resume:', err instanceof Error ? err.message : err)
    }
  }
}

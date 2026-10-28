import fs from 'fs'
import { isTailorChooseEnabled, isTailorRewriteEnabled, listEnabledKeywords } from '../../db/db.js'
import { canonicalSkill, priorityOf } from '../keywordService.js'
import { resumeService } from '../resumeService.js'
import { removeCompiled, tailorTex } from './tailor.js'
import { tailoredPdfPath } from './tailoredFiles.js'
import { parseTex } from './texProjects.js'

const LIMIT_MS = 180_000
const TIMEOUT_ERROR = 'Tailoring took longer than three minutes, so your master resume was used.'

export interface TailorOutcome {
  /** The tailored PDF, or the master PDF on failure. */
  pdfPath: string | null
  /** Titles of the kept projects, master order; [] on failure. */
  kept: string[]
  chosenBy: 'tags' | 'claude'
  rewritten: boolean
  /** Shown under the job. */
  error?: string
}

/** Your enabled keywords as canonical skill → priority, the same reading job scoring uses. */
function keywordPriorities(): Map<string, number> {
  const priorities = new Map<string, number>()
  for (const { keyword, weight } of listEnabledKeywords()) {
    const skill = canonicalSkill(keyword)
    if (!priorities.has(skill)) priorities.set(skill, priorityOf(weight))
  }
  return priorities
}

/** Builds this job's resume from the stored LaTeX master. Never throws: a failure gives the master PDF and the reason. */
export async function tailorResume(job: JobRow, signal: AbortSignal): Promise<TailorOutcome> {
  const timeout = AbortSignal.timeout(LIMIT_MS)
  try {
    const master = resumeService.storedMasterTex()
    if (!master) throw new Error('Your stored resume is not a LaTeX file.')

    const result = await tailorTex(
      master.source,
      { title: job.title, company: job.company, location: job.location, description: job.aboutText },
      { choose: isTailorChooseEnabled(), rewrite: isTailorRewriteEnabled(), priorities: keywordPriorities() },
      AbortSignal.any([signal, timeout]),
    )
    let pdfPath: string
    try {
      pdfPath = tailoredPdfPath(job.id, master.pdfName)
      fs.copyFileSync(result.pdf, pdfPath)
    } finally {
      removeCompiled(result.pdf)
    }

    const titles = new Map(parseTex(master.source).projects.map(p => [p.id, p.title]))
    return {
      pdfPath,
      kept: result.kept.map(id => titles.get(id) ?? ''),
      chosenBy: result.chosenBy,
      rewritten: result.rewritten,
      ...(result.error && { error: result.error }),
    }
  } catch (err) {
    const error = timeout.aborted ? TIMEOUT_ERROR : err instanceof Error ? err.message : String(err)
    console.warn('[autofill] resume not tailored:', error)
    return { pdfPath: resumeService.storedResumePath(), kept: [], chosenBy: 'tags', rewritten: false, error }
  }
}

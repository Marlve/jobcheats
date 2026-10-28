import fs from 'fs'
import path from 'path'
import type { LetterJob } from '../apply/coverLetter.js'
import { chooseProjects, rewriteProjects } from './claudeTailor.js'
import { compileTex, LatexError, pdfPages } from './latex.js'
import { fitProjects, rankProjects } from './rankProjects.js'
import { buildTex, parseTex, type ParsedTex } from './texProjects.js'

const MAX_PAGES = 2

export interface TailorResult {
  /** The final PDF, in its own jc-tex-* temp folder: the caller copies it, then calls removeCompiled. */
  pdf: string
  /** Kept project ids, master order. */
  kept: number[]
  chosenBy: 'tags' | 'claude'
  rewritten: boolean
  /** A Claude step failed and tags or the original bullets were used instead. */
  error?: string
}

/** Removes the temp folder compileTex made for this PDF. A file still held open (EBUSY) is left behind. */
export function removeCompiled(pdf: string): void {
  // Only ever a folder compileTex made.
  if (!path.basename(path.dirname(pdf)).startsWith('jc-tex-')) return
  try {
    fs.rmSync(path.dirname(pdf), { recursive: true, force: true })
  } catch (err) {
    console.warn('[tailor] could not remove a temp folder:', err instanceof Error ? err.message : err)
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Lets only a LaTeX error through to its handler; a cancel or anything else goes on up. */
function onlyLatex(err: unknown, signal: AbortSignal): void {
  if (signal.aborted || !(err instanceof LatexError)) throw err
}

/** The PDF of `keep` if it fits the page limit, else null (and its folder removed). */
async function compileWithin(parsed: ParsedTex, keep: number[], replace: Map<number, string>, signal: AbortSignal): Promise<string | null> {
  const pdf = await compileTex(buildTex(parsed, keep, replace), signal)
  let pages = Infinity
  try {
    pages = await pdfPages(pdf)
  } finally {
    if (pages > MAX_PAGES) removeCompiled(pdf)
  }
  return pages <= MAX_PAGES ? pdf : null
}

/**
 * Compiles `kept` (rank order) with the rewritten blocks. A block that breaks the
 * compile goes back to its original (`broken`); rewording can make the page longer,
 * so the lowest-ranked project is dropped until it fits. `pdf` is null when no
 * rewritten version fits.
 */
export async function fitRewrite(
  parsed: ParsedTex,
  kept: number[],
  replace: Map<number, string>,
  signal: AbortSignal,
): Promise<{ pdf: string | null; kept: number[]; replace: Map<number, string>; broken: number[] }> {
  const trim = async (blocks: Map<number, string>) => {
    for (let n = kept.length; n > 0; n--) {
      const pdf = await compileWithin(parsed, kept.slice(0, n), blocks, signal)
      if (pdf) return { pdf, kept: kept.slice(0, n) }
    }
    return { pdf: null, kept }
  }

  try {
    return { ...(await trim(replace)), replace, broken: [] }
  } catch (err) {
    onlyLatex(err, signal)
  }

  // One compile per rewritten block finds the ones that break it.
  const good = new Map(replace)
  const broken: number[] = []
  for (const [id, block] of replace) {
    try {
      removeCompiled(await compileTex(buildTex(parsed, kept, new Map([[id, block]])), signal))
    } catch (err) {
      onlyLatex(err, signal)
      broken.push(id)
      good.delete(id)
    }
  }
  try {
    return { ...(good.size > 0 ? await trim(good) : { pdf: null, kept }), replace: good, broken }
  } catch (err) {
    // Blocks that compile alone but not together: keep every original.
    onlyLatex(err, signal)
    return { pdf: null, kept, replace: new Map(), broken: [...replace.keys()] }
  }
}

/** Picks, fits to two pages and optionally rewrites the master's projects for one job. */
export async function tailorTex(
  source: string,
  job: LetterJob,
  opts: { choose: boolean; rewrite: boolean; priorities?: Map<string, number> },
  signal: AbortSignal,
): Promise<TailorResult> {
  const parsed = parseTex(source)
  let error: string | undefined

  let chosenBy: TailorResult['chosenBy'] = 'tags'
  let ranked = rankProjects({ title: job.title, aboutText: job.description }, parsed.projects, opts.priorities)
  if (opts.choose) {
    try {
      ranked = await chooseProjects(job, parsed.projects, ranked, signal)
      chosenBy = 'claude'
    } catch (err) {
      if (signal.aborted) throw err
      error = `Claude could not choose the projects, so tags were used: ${message(err)}`
    }
  }

  // The search ends on the longest prefix that fit, so the last fitting PDF is that prefix's: kept, not compiled again.
  let fitted = null as string | null
  try {
    let kept = await fitProjects(ranked, async keep => {
      const pdf = await compileWithin(parsed, keep, new Map(), signal)
      if (!pdf) return Infinity
      if (fitted) removeCompiled(fitted)
      fitted = pdf
      return MAX_PAGES
    }, MAX_PAGES)
    if (!fitted) throw new Error('Even one project makes your resume longer than two pages.')

    let replace = new Map<number, string>()
    if (opts.rewrite) {
      try {
        replace = await rewriteProjects(job, parsed.projects.filter(p => kept.includes(p.id)), signal)
      } catch (err) {
        if (signal.aborted) throw err
        error ??= `Claude could not rewrite the bullets, so the originals were used: ${message(err)}`
      }
    }

    let pdf = fitted
    if (replace.size > 0) {
      const fit = await fitRewrite(parsed, kept, replace, signal)
      if (fit.broken.length > 0) {
        const titles = fit.broken.map(id => parsed.projects[id].title).join(', ')
        error ??= `The rewritten bullets of ${titles} did not compile, so their original bullets were used.`
      }
      replace = fit.pdf ? fit.replace : new Map()
      if (fit.pdf) {
        removeCompiled(fitted)
        pdf = fit.pdf
        kept = fit.kept
      }
    }

    return { pdf, kept: [...kept].sort((a, b) => a - b), chosenBy, rewritten: replace.size > 0, ...(error && { error }) }
  } catch (err) {
    if (fitted) removeCompiled(fitted)
    throw err
  }
}

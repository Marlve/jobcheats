import { playwrightService } from "./playwrightService.js"
import { finishRun, insertJob, jobExists, pruneOldJobs, startRun } from "../db/db.js"
import { scoreNewJobs } from "./matchService.js"
import { linkedinAdapter } from "./boards/linkedin.js"
import {
  CancellationToken,
  JobBoardAdapter,
  ScrapeCancelledError,
  ScrapeContext,
  ScrapeTally,
} from "./boards/adapter.js"
import { DEFAULT_DATE_POSTED, MAX_JOBS_PER_BOARD } from "../config.js"

const adapters: Partial<Record<JobSource, JobBoardAdapter>> = {
  linkedin: linkedinAdapter,
  // seek: seekAdapter — implement JobBoardAdapter and register it here.
}

/** Boards run in sequence, so one token covers the whole session. */
let activeToken: CancellationToken | null = null

export type ProgressReporter = (progress: ScrapeProgress) => void

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * The daily contract: last 24 hours, capped per board. Applied here rather than
 * at the call site so every entry point inherits it.
 */
function applyDailyDefaults(params: SearchParams): SearchParams {
  return {
    ...params,
    datePosted: DEFAULT_DATE_POSTED,
    maxJobs: Math.min(params.maxJobs ?? MAX_JOBS_PER_BOARD, MAX_JOBS_PER_BOARD),
  }
}

interface BoardPosition {
  index: number
  count: number
}

async function runBoard(
  source: JobSource,
  params: SearchParams,
  onProgress: ProgressReporter,
  token: CancellationToken,
  position: BoardPosition
): Promise<ScrapeResult> {
  const adapter = adapters[source]
  if (!adapter) {
    return { ok: false, source, runId: null, error: `No adapter registered for "${source}"` }
  }

  const tally: ScrapeTally = { inserted: 0, skipped: 0, failed: 0 }
  let currentPage = 0
  const runId = startRun(source)

  const report = (update: Partial<ScrapeProgress> = {}) => {
    if (update.page !== undefined) currentPage = update.page
    onProgress({
      source,
      phase: 'scraping',
      page: currentPage,
      inserted: tally.inserted,
      skipped: tally.skipped,
      failed: tally.failed,
      boardIndex: position.index,
      boardCount: position.count,
      ...update,
    })
  }

  report({ phase: 'starting' })

  try {
    const { page } = await playwrightService.openBrowser()

    const ctx: ScrapeContext = {
      page,
      params,
      token,
      tally,
      report,
      saveJob: (job: Job) => insertJob(job, runId),
      isKnown: (jobId: string) => jobExists(source, jobId),
    }

    await adapter.run(ctx)

    finishRun(runId, tally)
    scoreNewJobs(runId)
    report({ phase: 'done' })

    return { ok: true, source, runId, ...tally, cancelled: false }
  } catch (err) {
    if (err instanceof ScrapeCancelledError || token.isCancelled) {
      finishRun(runId, tally, 'cancelled')
      // Partial results are still worth scoring.
      scoreNewJobs(runId)
      report({ phase: 'cancelled' })
      return { ok: true, source, runId, ...tally, cancelled: true }
    }

    const message = errorMessage(err)
    console.error(`[${source}] scrape failed:`, message)
    finishRun(runId, tally, message)
    scoreNewJobs(runId)
    report({ phase: 'error', message })

    return { ok: false, source, runId, error: message }
  } finally {
    await playwrightService.closeBrowser()
  }
}

async function runScrape(
  source: JobSource,
  params: SearchParams,
  onProgress: ProgressReporter
): Promise<ScrapeResult> {
  const [result] = await runScrapeAll([source], params, onProgress)
  return result
}

/** Runs boards one at a time — they share a single browser profile. */
async function runScrapeAll(
  sources: JobSource[],
  params: SearchParams,
  onProgress: ProgressReporter
): Promise<ScrapeResult[]> {
  if (activeToken || playwrightService.isBusy) {
    return sources.map(source => ({
      ok: false as const,
      source,
      runId: null,
      error: 'A scrape is already running',
    }))
  }

  const token = new CancellationToken()
  activeToken = token

  const daily = applyDailyDefaults(params)
  const results: ScrapeResult[] = []

  try {
    for (const [index, source] of sources.entries()) {
      if (token.isCancelled) break
      results.push(
        await runBoard(source, daily, onProgress, token, {
          index: index + 1,
          count: sources.length,
        })
      )
    }
  } finally {
    activeToken = null
    pruneOldJobs()
  }

  return results
}

/** Every board with a registered adapter. */
export function registeredSources(): JobSource[] {
  return Object.keys(adapters) as JobSource[]
}

export const websiteService = {
  scrape: runScrape,

  scrapeAll: (params: SearchParams, onProgress: ProgressReporter) =>
    runScrapeAll(registeredSources(), params, onProgress),

  /** Returns true when a running scrape was signalled to stop. */
  cancel(): boolean {
    if (!activeToken) return false
    activeToken.cancel()
    return true
  },

  /** Best-effort teardown for app shutdown. */
  async shutdown() {
    activeToken?.cancel()
    await playwrightService.closeBrowser()
  },
}

export const linkedinService = {
  scrapeJobs: (params: SearchParams, onProgress: ProgressReporter) =>
    runScrape('linkedin', params, onProgress),
}

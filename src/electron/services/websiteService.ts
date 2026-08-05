import { playwrightService } from "./playwrightService.js"
import { finishRun, insertJob, jobExists, pruneOldJobs, startRun } from "../db/db.js"
import { scoreNewJobs } from "./matchService.js"
import { linkedinAdapter } from "./boards/linkedin.js"
import {
  CancellationToken,
  JobBoardAdapter,
  ScrapeCancelledError,
  ScrapeContext,
  ScrapeError,
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

/**
 * Splits a failure into what the scan screen says and what the terminal keeps.
 *
 * Most failures here are not ours: Playwright and Chromium raise things like
 * "net::ERR_NAME_NOT_RESOLVED at https://…" and "Target page, context or
 * browser has been closed", which are precise, useful, and no answer at all to
 * someone looking at a scan that stopped. An adapter that knows better says so
 * by throwing a ScrapeError; everything else is matched on here, and the
 * unrecognised remainder gets a message that is at least honest about what
 * happened to the jobs already found.
 *
 * The stack always reaches the console either way — nothing is being hidden,
 * only moved to where it is useful.
 */
function describeFailure(err: unknown): { message: string; detail: string } {
  const detail = err instanceof Error ? err.stack ?? err.message : String(err)

  if (err instanceof ScrapeError) return { message: err.userMessage, detail }

  const raw = err instanceof Error ? err.message : String(err)

  if (/net::|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/i.test(raw)) {
    return {
      message: 'Could not reach the job board. Check your internet connection and try again.',
      detail,
    }
  }

  if (/Target (page|context)|browser has been closed|Execution context was destroyed/i.test(raw)) {
    return {
      message: 'The browser window closed before the scan finished. Everything found before that was kept.',
      detail,
    }
  }

  if (/timeout|timed out/i.test(raw)) {
    return {
      message: 'The job board stopped responding, so the scan was cut short. Everything found before that was kept.',
      detail,
    }
  }

  return {
    message: 'Something went wrong while reading the job board. Everything found before that was kept.',
    detail,
  }
}

/**
 * The daily contract: last 24 hours, capped per board. Applied here rather than
 * at the call site so every entry point inherits it.
 *
 * The window is a default, not a ceiling — a caller that asks for a wider one
 * gets it. The job cap stays a hard ceiling, because it bounds how long a run
 * can hold the browser open.
 */
function applyDailyDefaults(params: SearchParams): SearchParams {
  return {
    ...params,
    datePosted: params.datePosted ?? DEFAULT_DATE_POSTED,
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
    console.error(`[${source}] no adapter registered — add one to the adapters map`)
    return { ok: false, source, runId: null, error: 'This job board is not supported yet.' }
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

    const { message, detail } = describeFailure(err)
    console.error(`[${source}] scrape failed: ${detail}`)
    finishRun(runId, tally, message)
    scoreNewJobs(runId)
    report({ phase: 'error', message })

    return { ok: false, source, runId, error: message }
  } finally {
    await playwrightService.closeBrowser()
  }
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
      error: 'A scan is already running.',
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

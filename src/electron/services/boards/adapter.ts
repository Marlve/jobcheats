import { Page } from "playwright"

export class ScrapeCancelledError extends Error {
  constructor() {
    super('Scrape cancelled')
    this.name = 'ScrapeCancelledError'
  }
}

/** Cooperative cancellation — checked between jobs and between pages. */
export class CancellationToken {
  private cancelled = false

  cancel() {
    this.cancelled = true
  }

  get isCancelled() {
    return this.cancelled
  }

  throwIfCancelled() {
    if (this.cancelled) throw new ScrapeCancelledError()
  }
}

export interface ScrapeTally {
  inserted: number
  skipped: number
  failed: number
}

export interface ScrapeContext {
  page: Page
  params: SearchParams
  token: CancellationToken
  /** Persist a job. Returns true when it was new. */
  saveJob: (job: Job) => boolean
  /** True when the job is already stored, so it can be skipped without opening it. */
  isKnown: (jobId: string) => boolean
  report: (update: Partial<ScrapeProgress>) => void
  tally: ScrapeTally
}

export interface JobBoardAdapter {
  readonly name: JobSource
  /** One URL per location — most boards only accept a single location per search. */
  buildSearchUrls(params: SearchParams): string[]
  run(ctx: ScrapeContext): Promise<void>
}

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/** Randomised pause so card clicks don't land on a fixed cadence. */
export function humanDelay(minMs: number, maxMs: number) {
  return sleep(minMs + Math.random() * (maxMs - minMs))
}

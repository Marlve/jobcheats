import { Page } from "playwright"

export class ScrapeCancelledError extends Error {
  constructor() {
    super('Scrape cancelled')
    this.name = 'ScrapeCancelledError'
  }
}

/**
 * A failure with two audiences.
 *
 * `userMessage` is what the scan screen shows: plain language, no selectors, no
 * URLs, and where possible what to do about it. `detail` is what the terminal
 * gets — the selector, the URL, the timeout that elapsed. Neither is much use
 * in the other's place, and collapsing them into one string is how a job board
 * ends up telling someone about a componentkey.
 */
export class ScrapeError extends Error {
  readonly userMessage: string

  constructor(userMessage: string, detail?: string) {
    super(detail ? `${userMessage} [${detail}]` : userMessage)
    this.name = 'ScrapeError'
    this.userMessage = userMessage
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
  /**
   * True for a scheduled run, where nobody is watching. An adapter must not
   * surface a window or wait for a person — it fails with a ScrapeError that
   * says what needs doing instead.
   */
  unattended: boolean
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

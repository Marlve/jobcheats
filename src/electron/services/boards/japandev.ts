import { FeedBoardAdapter, FeedContext, humanDelay, ScrapeError } from "./adapter.js"
import { FeedError, fetchText } from "../http.js"
import { inWindow, matchesSearch } from "./filter.js"
import { MAX_JOBS_PER_BOARD } from "../../config.js"
import { JAPAN_DEV_BASE, jobUrlFromId, listingFromHtml, ListingPage, parseJobPage } from "./japandevParse.js"

/**
 * Japan Dev adapter — English-speaking tech jobs in Japan.
 *
 * Read over plain HTTP rather than through a browser. The list page carries its
 * first 60 postings, dates included, in its own data, so one request says which
 * postings are new enough and match the search; only those are opened, one
 * request each, for the description. That is a lot gentler on the site than
 * driving a browser through its search, and nothing here depends on its layout.
 */

const DAY_MS = 86_400_000
const WINDOW_DAYS: Record<DatePosted, number> = { '24h': 1, week: 7, month: 30 }

async function readListing(): Promise<ListingPage> {
  let html: string
  try {
    html = await fetchText(`${JAPAN_DEV_BASE}/jobs`)
  } catch (err) {
    console.error('[japandev] could not read the job list:', err instanceof Error ? err.message : err)
    if (err instanceof FeedError && err.status === null) {
      throw new ScrapeError('Could not reach Japan Dev. Check your internet connection and try again.')
    }
    throw new ScrapeError(
      "Japan Dev's job list could not be read. This usually means they have changed their site, so the scan needs updating.",
      err instanceof Error ? err.message : String(err)
    )
  }

  const page = listingFromHtml(html)
  if (!page) {
    throw new ScrapeError(
      "Japan Dev's job list could not be read. This usually means they have changed their site, so the scan needs updating.",
      'the list page no longer carries its postings'
    )
  }
  return page
}

async function run(ctx: FeedContext): Promise<void> {
  const { params, token, tally, report, saveJob, isKnown } = ctx
  const maxJobs = Math.max(params.maxJobs ?? MAX_JOBS_PER_BOARD, 1)

  report({ phase: 'searching', message: 'Reading the Japan Dev job list' })
  const { listings, reachesBack } = await readListing()

  const now = new Date()
  const candidates = listings
    .filter(listing => matchesSearch(listing, params, now))
    .sort((a, b) => Date.parse(b.postedAt ?? '') - Date.parse(a.postedAt ?? ''))
  console.log(`[japandev] ${listings.length} listed, ${candidates.length} fit the search`)

  // The list holds only the 60 most recently refreshed postings, which today
  // reaches back about three weeks. A wider window is read as far as it goes.
  const windowStart = now.getTime() - WINDOW_DAYS[params.datePosted ?? 'month'] * DAY_MS
  const partial = Boolean(params.datePosted) && reachesBack !== null && reachesBack.getTime() > windowStart

  report({ phase: 'scraping' })

  for (const listing of candidates) {
    token.throwIfCancelled()

    if (isKnown(listing.jobId)) {
      tally.skipped++
      report({})
      continue
    }

    if (tally.inserted >= maxJobs) {
      report({ message: `Reached the ${maxJobs} job limit` })
      return
    }

    try {
      const job = parseJobPage(await fetchText(jobUrlFromId(listing.jobId)), listing.jobId)
      if (!job) {
        tally.failed++
      } else {
        // The list's timestamp is exact; the page's is a date.
        job.postedAt = listing.postedAt ?? job.postedAt
        if (inWindow(job.postedAt, params.datePosted, now)) {
          if (saveJob(job)) tally.inserted++
          else tally.skipped++
        }
      }
      report({ message: job?.title })
    } catch (err) {
      if (token.isCancelled) throw err
      tally.failed++
      console.warn(`[japandev] skipped ${listing.jobId}:`, err instanceof Error ? err.message : err)
    }

    await humanDelay(300, 700)
  }

  if (partial) console.log('[japandev] the search window reaches back further than the list does')
}

export const japanDevAdapter: FeedBoardAdapter = {
  name: 'japandev',
  run,
}

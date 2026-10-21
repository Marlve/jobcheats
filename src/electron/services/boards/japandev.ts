import { FeedBoardAdapter, FeedContext, humanDelay, ScrapeError } from "./adapter.js"
import { FeedError, fetchText } from "../http.js"
import { inWindow, matchesSearch } from "./filter.js"
import { MAX_JOBS_PER_BOARD } from "../../config.js"
import {
  JAPAN_DEV_BASE, jobIdsFromSitemap, jobUrlFromId, listingFromHtml, ListingPage, parseJobPage, sitemapLocations, titleFromJobId,
} from "./japandevParse.js"

/**
 * Japan Dev adapter — English-speaking tech jobs in Japan.
 *
 * Read over plain HTTP rather than through a browser. The list page carries its
 * first 60 postings, dates included, in its own data, so one request says which
 * of those are new enough and match the search. The site has several times that
 * many, so the sitemap, which names every posting, supplies the rest: those are
 * ruled out by the words in their address, and only the plausible ones opened.
 * Either way a posting is opened once, one request, for its description. That
 * is a lot gentler on the site than driving a browser through its search, and
 * nothing here depends on its layout.
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

/**
 * Every posting the site lists. Failing to read it is not failing the scan: the
 * list page's 60 are still searched.
 */
async function readSitemap(): Promise<string[]> {
  try {
    const index = await fetchText(`${JAPAN_DEV_BASE}/sitemap.xml`)
    const maps = sitemapLocations(index).filter(location => location.endsWith('.xml'))

    const ids = new Set(jobIdsFromSitemap(index))
    for (const map of maps) jobIdsFromSitemap(await fetchText(map)).forEach(id => ids.add(id))
    return [...ids]
  } catch (err) {
    console.warn('[japandev] could not read the sitemap:', err instanceof Error ? err.message : err)
    return []
  }
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

  // The list holds only the 60 most recently refreshed postings, which today
  // reaches back about three weeks. A posting it leaves out was refreshed, so
  // posted, before that: if the search window starts after the list's reach, the
  // list has everything in it and the sitemap has nothing more to offer.
  const windowStart = now.getTime() - WINDOW_DAYS[params.datePosted ?? 'month'] * DAY_MS
  const covered = Boolean(params.datePosted) && reachesBack !== null && reachesBack.getTime() <= windowStart

  // Postings the list page did not carry: all that is known of them is their address.
  const onList = new Set(listings.map(listing => listing.jobId))
  const sitemap = covered ? [] : await readSitemap()
  const unlisted = sitemap
    .filter(jobId => !onList.has(jobId))
    .map(jobId => ({ jobId, title: titleFromJobId(jobId), location: null, postedAt: null }))
    .filter(listing => matchesSearch(listing, params, now))
    .map(listing => ({ ...listing, fromSitemap: true }))

  const total = new Set([...onList, ...sitemap]).size
  console.log(`[japandev] ${total} read, ${candidates.length} listed and ${unlisted.length} unlisted fit the search`)

  report({ phase: 'scraping' })

  for (const listing of [...candidates.map(candidate => ({ ...candidate, fromSitemap: false })), ...unlisted]) {
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
        // The address only hinted at the title; the page says what it is, where and when.
        const fits = listing.fromSitemap ? matchesSearch(job, params, now) : inWindow(job.postedAt, params.datePosted, now)
        if (fits) {
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

  if (!covered && sitemap.length === 0) console.log('[japandev] the search window reaches back further than the list does')

  if (tally.inserted === 0) {
    report({
      message: `Nothing new from ${total} Japan Dev jobs${tally.skipped ? ` (${tally.skipped} already seen)` : ''}. A wider date range or fewer title words finds more.`,
    })
  }
}

export const japanDevAdapter: FeedBoardAdapter = {
  name: 'japandev',
  run,
}

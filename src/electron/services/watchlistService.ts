import { readStoredWatchlist, writeStoredWatchlist } from "../db/db.js"
import { MAX_JOBS_PER_BOARD, MAX_WATCHED_COMPANIES } from "../config.js"
import { ScrapeContext, ScrapeError } from "./boards/adapter.js"
import { FeedError, fetchJson } from "./http.js"
import { jobsFromFeed } from "./watchlist/feeds.js"
import { matchesSearch } from "./watchlist/filter.js"
import { ATS_LABEL, companyId, feedUrl, nameFromSlug, parseCareersLink, probeUrl } from "./watchlist/link.js"

/**
 * Companies whose public job feed is read on every scan.
 *
 * Greenhouse, Lever and Ashby each publish every open role as plain JSON with
 * no sign-in, so unlike a job board this needs no browser — one request per
 * company, and nothing for a bot wall to object to.
 */

const ATS_VALUES: WatchAts[] = ['greenhouse', 'lever', 'ashby']

/**
 * The saved list. Malformed entries are dropped one by one: a hand-edited row
 * should cost the entry it broke, not the whole list.
 */
export function listWatchlist(): WatchedCompany[] {
  const stored = readStoredWatchlist()
  if (!Array.isArray(stored)) return []

  return stored.flatMap((entry): WatchedCompany[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { id, ats, slug, name } = entry as Record<string, unknown>

    const valid = typeof id === 'string' && typeof slug === 'string' && typeof name === 'string'
      && ATS_VALUES.includes(ats as WatchAts)
    return valid ? [{ id, ats: ats as WatchAts, slug, name }] : []
  })
}

/** A feed failure worded for someone who is not debugging it. */
function describeFeedFailure(err: unknown, name: string): string {
  if (err instanceof FeedError) {
    if (err.status === 404) return `${name} no longer has a public job board here, so it was skipped.`
    if (err.status === 429) return `${name}'s job feed asked us to slow down. Try again in a few minutes.`
    if (err.status === null) {
      return /timeout|aborted/i.test(err.message)
        ? `${name}'s job feed did not answer in time.`
        : 'Could not reach the job feed. Check your internet connection and try again.'
    }
  }
  return `${name}'s job feed gave an answer this app could not read.`
}

export async function addToWatchlist(link: string): Promise<AddWatchResult> {
  const parsed = parseCareersLink(link)
  if (!parsed) {
    return {
      ok: false,
      error: 'That is not a Greenhouse, Lever or Ashby job board link. Paste an address like '
        + 'boards.greenhouse.io/company, jobs.lever.co/company or jobs.ashbyhq.com/company.',
    }
  }

  const companies = listWatchlist()
  const id = companyId(parsed)
  if (companies.some(company => company.id === id)) return { ok: true, companies }

  if (companies.length >= MAX_WATCHED_COMPANIES) {
    return { ok: false, error: `The watchlist holds at most ${MAX_WATCHED_COMPANIES} companies. Remove one first.` }
  }

  let name = nameFromSlug(parsed.slug)
  try {
    const probe = await fetchJson(probeUrl(parsed))
    // Greenhouse is the only one of the three whose board names its company.
    if (parsed.ats === 'greenhouse' && typeof probe === 'object' && probe !== null) {
      const named = (probe as { name?: unknown }).name
      if (typeof named === 'string' && named.trim()) name = named.trim()
    }
  } catch (err) {
    if (err instanceof FeedError && err.status === 404) {
      return { ok: false, error: `${ATS_LABEL[parsed.ats]} has no public job board called "${parsed.slug}". Check the link.` }
    }
    console.warn(`[watchlist] could not check ${id}:`, err instanceof Error ? err.message : err)
    return { ok: false, error: describeFeedFailure(err, nameFromSlug(parsed.slug)) }
  }

  const next = [...companies, { id, ats: parsed.ats, slug: parsed.slug, name }]
  writeStoredWatchlist(next)
  return { ok: true, companies: next }
}

export function removeFromWatchlist(id: string): WatchedCompany[] {
  const next = listWatchlist().filter(company => company.id !== id)
  writeStoredWatchlist(next)
  return next
}

type WatchlistRun = Pick<ScrapeContext, 'params' | 'token' | 'tally' | 'report' | 'saveJob' | 'isKnown'>

/**
 * Reads every watched company and stores the jobs that fit the search.
 *
 * Feeds are all read before anything is stored, so the per-run cap keeps the
 * newest postings across every company — stopping at the cap while still
 * walking companies in order would hand the whole allowance to the first one.
 *
 * One company failing is a skipped company, not a failed run: only when none
 * could be read does this throw.
 */
export async function runWatchlist(companies: WatchedCompany[], run: WatchlistRun): Promise<void> {
  const { params, token, tally, report, saveJob, isKnown } = run
  const candidates: Job[] = []
  let reached = 0
  let firstProblem = ''

  for (const company of companies) {
    token.throwIfCancelled()
    report({ phase: 'searching', message: company.name })

    try {
      const jobs = jobsFromFeed(await fetchJson(feedUrl(company)), company)
      candidates.push(...jobs.filter(job => matchesSearch(job, params)))
      reached++
    } catch (err) {
      tally.failed++
      firstProblem ||= describeFeedFailure(err, company.name)
      console.warn(`[watchlist] ${company.id}:`, err instanceof Error ? err.message : err)
      report({})
    }
  }

  if (!reached) throw new ScrapeError(firstProblem)

  const limit = params.maxJobs ?? MAX_JOBS_PER_BOARD
  const newestFirst = candidates.sort((a, b) =>
    (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0))

  report({ phase: 'scraping' })

  for (const job of newestFirst) {
    token.throwIfCancelled()

    if (isKnown(job.jobId)) {
      tally.skipped++
    } else if (tally.inserted < limit && saveJob(job)) {
      tally.inserted++
    }
    report({})
  }
}

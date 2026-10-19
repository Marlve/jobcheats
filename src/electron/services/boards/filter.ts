/**
 * Which of a company's open jobs belong in the inbox. Pure, so it can be unit
 * tested without a network.
 *
 * A job board answers a search; a feed like Japan Dev's answers nothing, it just
 * lists everything open. Without this it would put every role it has — from
 * sales to legal — into the inbox on the first poll.
 */

const WINDOW_MS: Record<DatePosted, number> = {
  '24h': 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
}

/** Every word of at least one keyword has to appear in the title, in any order. */
function titleMatches(title: string, keywords: string[]): boolean {
  const haystack = title.toLowerCase()
  return keywords.some(keyword => {
    const words = keyword.toLowerCase().split(/\s+/).filter(Boolean)
    return words.length > 0 && words.every(word => haystack.includes(word))
  })
}

/** Whether a posting date is inside the search's window. An unknown date passes. */
export function inWindow(postedAt: string | null, datePosted: DatePosted | undefined, now: Date = new Date()): boolean {
  if (!datePosted || !postedAt) return true
  return now.getTime() - new Date(postedAt).getTime() <= WINDOW_MS[datePosted]
}

/** What the check reads, so a listing entry can be tested before its page is opened. */
type Searchable = Pick<Job, 'title' | 'location' | 'postedAt'>

export function matchesSearch(job: Searchable, params: SearchParams, now: Date = new Date()): boolean {
  if (!titleMatches(job.title, params.keywords)) return false

  // The feeds have no job-type field, so an internship search has to look in
  // the title. Other types are not filtered: "full-time" is not written on most
  // postings, and requiring it would drop nearly all of them.
  if (params.jobType === 'internship' && !/\bintern(ship)?s?\b/i.test(job.title)) return false

  // A posting that names no place is kept — nothing says it is elsewhere.
  if (params.location.length && job.location) {
    const where = job.location.toLowerCase()
    if (!params.location.some(place => where.includes(place.toLowerCase()))) return false
  }

  return inWindow(job.postedAt, params.datePosted, now)
}

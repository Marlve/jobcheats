/**
 * Building the search query LinkedIn is asked. Pure, so it can be unit tested
 * without a browser.
 */

/** How the filters read when they have to be said rather than encoded. */
const DATE_POSTED_PHRASE: Record<DatePosted, string> = {
  '24h': 'posted in the past 24 hours',
  'week': 'posted in the past week',
  'month': 'posted in the past month',
}

const JOB_TYPE_PHRASE: Record<JobType, string> = {
  'full-time': 'full time',
  'part-time': 'part time',
  'internship': 'internship',
}

/**
 * The search phrased as a sentence, e.g.
 * "software engineer internship posted in the past 24 hours in malaysia".
 *
 * Location has to be said rather than filtered. The current search takes a
 * place only as a `geoId` — an id out of LinkedIn's own geography taxonomy,
 * which nothing outside LinkedIn can produce — and ignores a `location=` text
 * param entirely, which is why every location used to return the same jobs.
 * Saying it in the query hands the problem back to LinkedIn, which resolves the
 * place itself. It needs the semantic origin on the URL to be read this way.
 *
 * Note the cost: boolean syntax and a sentence do not mix, so several keywords
 * become "a or b" rather than `"a" OR "b"`. The quoted form is an exact-phrase
 * instruction to a term matcher, and a sentence parser reads it as punctuation.
 */
export function buildSearchQuery(params: SearchParams, location: string | null): string {
  const keywords = params.keywords.map(keyword => keyword.trim()).filter(Boolean)

  return [
    keywords.join(' or '),
    params.jobType ? JOB_TYPE_PHRASE[params.jobType] : '',
    params.datePosted ? DATE_POSTED_PHRASE[params.datePosted] : '',
    location ? `in ${location}` : '',
  ].filter(Boolean).join(' ')
}

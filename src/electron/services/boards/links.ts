/**
 * Parsing of job identifiers off a results page. Pure, so it can be unit tested
 * without a browser.
 */

/** Same prefix the componentkey card layout uses. */
const CARD_KEY_PATTERN = /job-card-component-ref-([\w-]+)/
const VIEW_PATH_PATTERN = /\/jobs\/view\/(\d+)/

/**
 * The posting id carried by one attribute value, whatever shape it arrived in.
 *
 * LinkedIn identifies the same posting three or four different ways depending
 * on which DOM rendered — a link to the posting, a bare id on the card, a
 * component key, or `currentJobId` in the address bar. Accepting all of them is
 * what lets the recommendations be read without knowing which layout is in
 * front of us.
 */
export function jobIdFromValue(value: string): string | null {
  const linked = value.match(VIEW_PATH_PATTERN)?.[1]
  if (linked) return linked

  const cardKey = value.match(CARD_KEY_PATTERN)?.[1]
  if (cardKey) return cardKey

  // A bare id, which is how data-job-id and currentJobId give it.
  const trimmed = value.trim()
  return /^\d+$/.test(trimmed) ? trimmed : null
}

/**
 * Posting ids in the order they were found, deduplicated.
 *
 * Order-preserving deduplication is the point: one card commonly yields the
 * same id several times over — a link on the title, another on the logo, plus
 * the id attribute itself — and the caller stops at `limit`. Counting those
 * repeats would spend a limit of five on two postings.
 */
export function jobIdsFrom(values: string[], limit: number): string[] {
  if (limit <= 0) return []

  const ids: string[] = []

  for (const value of values) {
    const id = jobIdFromValue(value)
    if (!id || ids.includes(id)) continue

    ids.push(id)
    if (ids.length >= limit) break
  }

  return ids
}

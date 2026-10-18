/**
 * Reading a pasted careers link. Pure, so it can be unit tested without a network.
 *
 * Only the three applicant-tracking systems that publish a public job feed are
 * recognised. A company's own careers page says nothing about which one sits
 * behind it, and guessing from the page would be a scrape, not a link parse.
 */

const SLUG = /^[a-z0-9][a-z0-9_.-]{0,99}$/i

export const ATS_LABEL: Record<WatchAts, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
}

/** The board's identifier on that system, e.g. "airbnb" in boards.greenhouse.io/airbnb. */
export interface ParsedLink {
  ats: WatchAts
  slug: string
}

function hostAts(host: string): WatchAts | null {
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') return 'greenhouse'
  if (host === 'jobs.lever.co') return 'lever'
  if (host === 'jobs.ashbyhq.com') return 'ashby'
  return null
}

export function parseCareersLink(raw: string): ParsedLink | null {
  const text = raw.trim()
  if (!text) return null

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }

  const ats = hostAts(url.hostname.toLowerCase())
  if (!ats) return null

  const segments = url.pathname.split('/').filter(Boolean)
  // Greenhouse's embedded board keeps the name in the query: /embed/job_board?for=airbnb
  const slug = ats === 'greenhouse' && segments[0] === 'embed'
    ? url.searchParams.get('for')
    : segments[0]

  return slug && SLUG.test(slug) ? { ats, slug } : null
}

export function companyId({ ats, slug }: ParsedLink): string {
  return `${ats}:${slug.toLowerCase()}`
}

/** "acme-robotics" → "Acme Robotics", for the systems whose feed does not name the company. */
export function nameFromSlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

/** The public feed that lists every open job, descriptions included. */
export function feedUrl({ ats, slug }: ParsedLink): string {
  const name = encodeURIComponent(slug)
  switch (ats) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${name}/jobs?content=true`
    case 'lever': return `https://api.lever.co/v0/postings/${name}?mode=json`
    case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${name}?includeCompensation=true`
  }
}

/** A lighter request than the feed, used only to check the board exists. */
export function probeUrl({ ats, slug }: ParsedLink): string {
  const name = encodeURIComponent(slug)
  switch (ats) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${name}`
    case 'lever': return `https://api.lever.co/v0/postings/${name}?mode=json&limit=1`
    case 'ashby': return feedUrl({ ats, slug })
  }
}

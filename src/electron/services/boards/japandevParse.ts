/**
 * Reading Japan Dev's pages. Pure, so it can be unit tested against saved HTML.
 *
 * Japan Dev lists English-speaking tech jobs in Japan. Two things are read:
 *
 *   - The job list page ships the first 60 postings it shows as data inside the
 *     page, for its own scripts to pick up. That has the posting dates, which
 *     nothing else on the site does, so it decides which postings are worth
 *     opening.
 *   - Each posting page carries schema.org JobPosting data for search engines,
 *     which holds the description. That is the stable thing to read — the
 *     visible markup is a client-rendered app whose class names are not.
 */

import { htmlToText } from "./text.js"
import { parseSalary, parseWorkType } from "./metadata.js"

export const JAPAN_DEV_BASE = 'https://japan-dev.com'

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function jobUrlFromId(jobId: string): string {
  return `${JAPAN_DEV_BASE}/jobs/${jobId}`
}

// ---------- the list page ----------

/** One posting as the list page shows it. */
export interface Listing {
  /** "company-slug/job-slug", the tail of the posting's address. */
  jobId: string
  title: string
  company: string
  location: string | null
  postedAt: string | null
}

export interface ListingPage {
  listings: Listing[]
  /**
   * How far back the list reaches. It is ordered by when a posting was last
   * refreshed, which is never earlier than when it was posted — so a search
   * window that starts after this moment is covered in full, and one that
   * starts before it may have postings the 60 do not include.
   */
  reachesBack: Date | null
}

/**
 * The page's data is serialised the way Nuxt does it: one flat array in which
 * every number inside an object or list is an index back into that array, and
 * a few two-element lists mark a wrapper around a value.
 */
const WRAPPERS = new Set(['Reactive', 'ShallowReactive', 'Ref', 'ShallowRef'])

function resolvePayload(items: unknown[]): unknown {
  const done = new Map<number, unknown>()

  const resolve = (index: number): unknown => {
    if (done.has(index)) return done.get(index)

    const value = items[index]
    if (typeof value !== 'object' || value === null) return value

    if (Array.isArray(value)) {
      if (typeof value[0] === 'string' && WRAPPERS.has(value[0]) && typeof value[1] === 'number') {
        const inner = resolve(value[1])
        done.set(index, inner)
        return inner
      }
      const list: unknown[] = []
      done.set(index, list)
      for (const entry of value) list.push(typeof entry === 'number' ? resolve(entry) : entry)
      return list
    }

    const object: Raw = {}
    done.set(index, object)
    for (const [key, entry] of Object.entries(value)) {
      object[key] = typeof entry === 'number' ? resolve(entry) : entry
    }
    return object
  }

  return resolve(0)
}

function dig(value: unknown, ...path: string[]): unknown {
  return path.reduce<unknown>((here, key) => (isRaw(here) ? here[key] : undefined), value)
}

/** The postings on the list page, or null when the page no longer holds them. */
export function listingFromHtml(html: string): ListingPage | null {
  const block = html.match(/<script type="application\/json"[^>]*data-nuxt-data[^>]*>([\s\S]*?)<\/script>/)
  if (!block) return null

  let items: unknown
  try {
    items = JSON.parse(block[1])
  } catch {
    return null
  }
  if (!Array.isArray(items)) return null

  const results = dig(resolvePayload(items), 'data', 'algolia-state-jobs:/jobs', 'Job_production', 'results')
  const hits = dig(Array.isArray(results) ? results[0] : results, 'hits')
  if (!Array.isArray(hits) || !hits.length) return null

  const listings: Listing[] = []
  let oldestRefresh = Infinity

  for (const hit of hits) {
    if (!isRaw(hit)) continue

    const slug = text(hit.slug)
    const company = isRaw(hit.company) ? hit.company : {}
    const companySlug = text(company.slug)
    const title = text(hit.title)
    const name = text(hit.company_name) || text(company.name)
    if (!slug || !companySlug || !title || !name) continue

    const refreshed = typeof hit.sort_at === 'number' ? hit.sort_at * 1000 : NaN
    if (refreshed < oldestRefresh) oldestRefresh = refreshed

    const place = text(hit.location)
    const posted = new Date(text(hit.published_at) || text(hit.created_at))

    listings.push({
      jobId: `${companySlug}/${slug}`,
      title,
      company: name,
      location: place ? `${place}, Japan` : 'Japan',
      postedAt: Number.isNaN(posted.getTime()) ? null : posted.toISOString(),
    })
  }

  if (!listings.length) return null
  return { listings, reachesBack: Number.isFinite(oldestRefresh) ? new Date(oldestRefresh) : null }
}

// ---------- one posting ----------

function jobPosting(html: string): Raw | null {
  for (const block of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const parsed: unknown = JSON.parse(block[1])
      if (isRaw(parsed) && parsed['@type'] === 'JobPosting') return parsed
    } catch {
      // A block that is not JSON is somebody else's markup, not this posting.
    }
  }
  return null
}

const CURRENCY_SYMBOL: Record<string, string> = { JPY: '¥', USD: '$', EUR: '€', GBP: '£' }

function formatSalary(raw: unknown): string | null {
  if (!isRaw(raw) || !isRaw(raw.value)) return null

  const { minValue, maxValue, unitText } = raw.value
  if (typeof minValue !== 'number' || minValue <= 0) return null

  const currency = text(raw.currency)
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `
  const money = (amount: number) => `${symbol}${amount.toLocaleString('en-US')}`
  const per = text(unitText).toLowerCase()

  // A posting with only a floor is sent with a maximum of 0, which is not a pay
  // range — it reads as "from this much".
  const range = typeof maxValue === 'number' && maxValue > minValue
    ? `${money(minValue)} – ${money(maxValue)}`
    : `${money(minValue)}+`

  return `${range}${per ? ` per ${per}` : ''}`
}

/**
 * What the page says about moving to Japan, per posting. This is the line that
 * separates a role open to someone abroad from one that wants you already
 * living there, and it is not in the structured data — only in the page body.
 * Passed through word for word so the visa flag reads the site's own wording.
 */
function relocationNote(html: string): string | null {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
  const marker = body.match(/\((Overseas visa sponsorship supported|No visa sponsorship from overseas)\)/i)
  return marker ? marker[1] : null
}

/** The posting on a page, or null when the page is not one this can read. */
export function parseJobPage(html: string, jobId: string): Job | null {
  const posting = jobPosting(html)
  if (!posting) return null

  const title = text(posting.title)
  const company = isRaw(posting.hiringOrganization) ? text(posting.hiringOrganization.name) : ''
  if (!title || !company) return null

  const address = isRaw(posting.jobLocation) && isRaw(posting.jobLocation.address)
    ? posting.jobLocation.address
    : {}
  const country = text(address.addressCountry) === 'JP' ? 'Japan' : text(address.addressCountry)
  const location = [...new Set([text(address.addressLocality), country].filter(Boolean))].join(', ')

  const note = relocationNote(html)
  const description = htmlToText(text(posting.description))
  const aboutText = note ? `${description}\n\nRelocation to Japan: ${note}` : description
  if (!aboutText) return null

  const posted = new Date(text(posting.datePosted))

  return {
    source: 'japandev',
    jobId,
    url: jobUrlFromId(jobId),
    title,
    company,
    location: location || null,
    aboutText,
    postedAt: Number.isNaN(posted.getTime()) ? null : posted.toISOString(),
    salary: formatSalary(posting.baseSalary) ?? parseSalary(aboutText),
    workType: parseWorkType(`${title} ${aboutText}`),
  }
}

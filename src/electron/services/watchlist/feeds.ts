/**
 * Turning each system's job feed into the app's own Job. Pure, so it can be
 * unit tested against saved responses.
 *
 * The feeds are third-party JSON, so nothing here assumes a field is present:
 * a posting missing its id or title is dropped rather than stored half-empty.
 */

import { parseSalary, parseWorkType } from "../boards/metadata.js"
import { decodeEntities, htmlToText } from "./text.js"

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const list = (value: unknown): Raw[] => (Array.isArray(value) ? value.filter(isRaw) : [])

function isoDate(value: unknown): string | null {
  const date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** The first hint that says how the job is worked. */
function workTypeFrom(...hints: string[]): WorkType | null {
  for (const hint of hints) {
    const found = parseWorkType(hint)
    if (found) return found
  }
  return null
}

interface Fields {
  id: string
  title: string
  url: string
  location: string
  about: string
  postedAt: string | null
  salary?: string
  workType?: WorkType | null
}

function build(company: WatchedCompany, fields: Fields, companyName: string = company.name): Job | null {
  if (!fields.id || !fields.title) return null

  return {
    source: 'watchlist',
    jobId: `${company.id}:${fields.id}`,
    url: fields.url || null,
    title: fields.title,
    company: companyName,
    location: fields.location || null,
    aboutText: fields.about,
    postedAt: fields.postedAt,
    salary: fields.salary || parseSalary(fields.about),
    workType: fields.workType ?? workTypeFrom(fields.location, fields.title),
  }
}

function greenhouse(raw: unknown, company: WatchedCompany): Job[] {
  const jobs = isRaw(raw) ? list(raw.jobs) : []

  return jobs.flatMap(job => {
    const workplace = list(job.metadata).find(entry => /workplace/i.test(text(entry.name)))
    const built = build(company, {
      id: String(job.id ?? ''),
      title: text(job.title),
      url: text(job.absolute_url),
      location: text(isRaw(job.location) ? job.location.name : ''),
      // The body arrives as escaped HTML — escaped once to travel as JSON text.
      about: htmlToText(decodeEntities(text(job.content))),
      postedAt: isoDate(job.first_published) ?? isoDate(job.updated_at),
      workType: workTypeFrom(text(workplace?.value)),
    }, text(job.company_name) || company.name)

    return built ? [built] : []
  })
}

function lever(raw: unknown, company: WatchedCompany): Job[] {
  const jobs = Array.isArray(raw) ? raw.filter(isRaw) : []

  return jobs.flatMap(job => {
    const categories = isRaw(job.categories) ? job.categories : {}
    const locations = Array.isArray(categories.allLocations)
      ? categories.allLocations.map(text).filter(Boolean)
      : []

    const about = [
      text(job.descriptionPlain),
      ...list(job.lists).map(section => `${text(section.text)}\n${htmlToText(text(section.content))}`),
      text(job.additionalPlain),
    ].filter(Boolean).join('\n\n')

    const built = build(company, {
      id: text(job.id),
      title: text(job.text),
      url: text(job.hostedUrl),
      location: locations.join(' · ') || text(categories.location),
      about,
      postedAt: isoDate(job.createdAt),
      workType: workTypeFrom(text(job.workplaceType)),
    })

    return built ? [built] : []
  })
}

function ashby(raw: unknown, company: WatchedCompany): Job[] {
  const jobs = isRaw(raw) ? list(raw.jobs) : []

  return jobs.flatMap(job => {
    if (job.isListed === false) return []

    const compensation = isRaw(job.compensation) ? job.compensation : {}
    const locations = [text(job.location), ...list(job.secondaryLocations).map(l => text(l.location))]
      .filter(Boolean)

    const built = build(company, {
      id: text(job.id),
      title: text(job.title),
      url: text(job.jobUrl),
      location: locations.join(' · '),
      about: text(job.descriptionPlain) || htmlToText(text(job.descriptionHtml)),
      postedAt: isoDate(job.publishedAt),
      salary: text(compensation.scrapeableCompensationSalarySummary),
      workType: workTypeFrom(text(job.workplaceType)),
    })

    return built ? [built] : []
  })
}

const READERS: Record<WatchAts, (raw: unknown, company: WatchedCompany) => Job[]> = {
  greenhouse,
  lever,
  ashby,
}

export function jobsFromFeed(raw: unknown, company: WatchedCompany): Job[] {
  return READERS[company.ats](raw, company)
}

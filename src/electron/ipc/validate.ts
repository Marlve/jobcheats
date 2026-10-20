/**
 * Renderer input crosses a trust boundary and ends up in URLs, file paths and
 * SQL bindings, so every field is checked before use.
 */

import { isScheduleTime } from "../services/scheduleTask.js"
import { isVersion } from "../services/version.js"

const JOB_TYPES: JobType[] = ['internship', 'full-time', 'part-time']
const DATES_POSTED: DatePosted[] = ['24h', 'week', 'month']
const BOARD_SOURCES: BoardSource[] = ['linkedin', 'seek', 'japandev']
const JOB_SOURCES: JobSource[] = [...BOARD_SOURCES]
const JOB_STATUSES: JobStatus[] = [
  'new',
  'saved',
  'applied',
  'interview',
  'offer',
  'hired',
  'turned_down',
  'withdrawn',
  'rejected',
]
const JOB_VIEWS: JobView[] = ['inbox', 'archive', 'all']
const SORT_KEYS: NonNullable<ListJobsOptions['sortBy']>[] = ['score', 'date', 'company']
const VISA_FILTERS: NonNullable<ListJobsOptions['visa']>[] = ['not-restricted', 'sponsors']
const EXPERIENCE_FILTERS: NonNullable<ListJobsOptions['experience']>[] = ['not-senior', 'junior', 'entry']

const MAX_TAGS = 20
const MAX_TAG_LENGTH = 100
const MAX_KEYWORD_LENGTH = 60
const MAX_NOTES_LENGTH = 5000

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new ValidationError(`${label} must be an array of strings`)
  if (value.length > MAX_TAGS) throw new ValidationError(`${label} accepts at most ${MAX_TAGS} entries`)

  return value.map(entry => {
    if (typeof entry !== 'string') throw new ValidationError(`${label} must contain only strings`)
    const trimmed = entry.trim()
    if (trimmed.length > MAX_TAG_LENGTH) {
      throw new ValidationError(`${label} entries must be ${MAX_TAG_LENGTH} characters or fewer`)
    }
    return trimmed
  }).filter(Boolean)
}

function asOneOf<T extends string>(value: unknown, allowed: T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} must be one of: ${allowed.join(', ')}`)
  }
  return value as T
}

function asPositiveInt(value: unknown, label: string, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${label} must be an integer between 1 and ${max}`)
  }
  return value
}

function asNumberInRange(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be a number between ${min} and ${max}`)
  }
  return value
}

export function validateSearchParams(raw: unknown): SearchParams {
  const input = asRecord(raw, 'Search params')

  const keywords = asStringArray(input.keywords, 'keywords')
  const location = asStringArray(input.location, 'location')

  if (!keywords.length) {
    throw new ValidationError('At least one keyword is required')
  }

  const params: SearchParams = {
    keywords,
    location,
    jobType: asOneOf(input.jobType, JOB_TYPES, 'jobType'),
  }

  if (input.datePosted !== undefined) {
    params.datePosted = asOneOf(input.datePosted, DATES_POSTED, 'datePosted')
  }
  if (input.maxPages !== undefined) {
    params.maxPages = asPositiveInt(input.maxPages, 'maxPages', 100)
  }
  if (input.maxJobs !== undefined) {
    params.maxJobs = asPositiveInt(input.maxJobs, 'maxJobs', 5000)
  }

  return params
}

export function validateScheduleConfig(raw: unknown): ScheduleConfig {
  const input = asRecord(raw, 'Schedule')

  if (!isScheduleTime(input.time)) {
    throw new ValidationError('time must be a 24-hour time like 08:00')
  }

  return { time: input.time, search: validateSearchParams(input.search) }
}

const MAX_PROFILE_LENGTH = 300

/** Missing fields read as empty, so a profile saved by an older version still loads. */
export function validateProfile(raw: unknown): Profile {
  const input = asRecord(raw, 'Profile')

  const text = (key: string): string => {
    const value = input[key] ?? ''
    if (typeof value !== 'string') throw new ValidationError(`${key} must be a string`)
    const trimmed = value.trim()
    if (trimmed.length > MAX_PROFILE_LENGTH) {
      throw new ValidationError(`${key} must be ${MAX_PROFILE_LENGTH} characters or fewer`)
    }
    return trimmed
  }

  const yesNo = (key: string): YesNo => asOneOf(input[key] ?? '', ['yes', 'no', ''], key)

  return {
    firstName: text('firstName'),
    lastName: text('lastName'),
    email: text('email'),
    phone: text('phone'),
    location: text('location'),
    linkedin: text('linkedin'),
    github: text('github'),
    website: text('website'),
    salary: text('salary'),
    workAuthorized: yesNo('workAuthorized'),
    needsSponsorship: yesNo('needsSponsorship'),
  }
}

/** A link on its way into a browser: ordinary web addresses only. */
export function validateWebUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('url must be a string')

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ValidationError('url is not a valid address')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('url must be an http or https address')
  }
  return url.toString()
}

export function validateListJobsOptions(raw: unknown): ListJobsOptions {
  if (raw === undefined || raw === null) return {}
  const input = asRecord(raw, 'List options')
  const options: ListJobsOptions = {}

  if (input.limit !== undefined) options.limit = asPositiveInt(input.limit, 'limit', 500)
  if (input.offset !== undefined) {
    if (typeof input.offset !== 'number' || !Number.isInteger(input.offset) || input.offset < 0) {
      throw new ValidationError('offset must be a non-negative integer')
    }
    options.offset = input.offset
  }
  if (input.source !== undefined) options.source = asOneOf(input.source, JOB_SOURCES, 'source')
  if (input.status !== undefined) options.status = asOneOf(input.status, JOB_STATUSES, 'status')
  if (input.view !== undefined) options.view = asOneOf(input.view, JOB_VIEWS, 'view')
  if (input.sortBy !== undefined) options.sortBy = asOneOf(input.sortBy, SORT_KEYS, 'sortBy')
  if (input.visa !== undefined) options.visa = asOneOf(input.visa, VISA_FILTERS, 'visa')
  if (input.minScore !== undefined) options.minScore = asNumberInRange(input.minScore, 'minScore', 0, 100)
  if (input.search !== undefined) {
  if (input.experience !== undefined) options.experience = asOneOf(input.experience, EXPERIENCE_FILTERS, 'experience')
    if (typeof input.search !== 'string') throw new ValidationError('search must be a string')
    options.search = input.search.slice(0, 200)
  }

  return options
}

export function validateJobStatus(raw: unknown): JobStatus {
  return asOneOf(raw, JOB_STATUSES, 'status')
}

export function validateBoardSource(raw: unknown): BoardSource {
  return asOneOf(raw, BOARD_SOURCES, 'source')
}

export function validateTextId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 200) throw new ValidationError('id must be a short piece of text')
  return raw
}

export function validateId(raw: unknown): number {
  return asPositiveInt(raw, 'id', Number.MAX_SAFE_INTEGER)
}

export function validateLimit(raw: unknown, fallback: number, max: number): number {
  if (raw === undefined || raw === null) return fallback
  return asPositiveInt(raw, 'limit', max)
}

export function validateKeyword(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('keyword must be a string')

  const keyword = raw.trim().toLowerCase()
  if (!keyword) throw new ValidationError('keyword cannot be empty')
  if (keyword.length > MAX_KEYWORD_LENGTH) {
    throw new ValidationError(`keyword must be ${MAX_KEYWORD_LENGTH} characters or fewer`)
  }

  return keyword
}

export function validateWeight(raw: unknown, fallback = 1): number {
  if (raw === undefined || raw === null) return fallback
  return asNumberInRange(raw, 'weight', 0.1, 10)
}

export function validateBoolean(raw: unknown, label: string): boolean {
  if (typeof raw !== 'boolean') throw new ValidationError(`${label} must be a boolean`)
  return raw
}

/**
 * A version string on its way to being stored as "dismissed".
 *
 * Checked against the same parser the comparison uses, so anything stored is
 * something that can later be compared — a dismissal of an unreadable string
 * would sit in the table silencing nothing.
 */
export function validateVersion(raw: unknown): string {
  if (typeof raw !== 'string' || !isVersion(raw)) {
    throw new ValidationError('version must be a version string like 1.2.0')
  }
  return raw.trim()
}

export function validateNotes(raw: unknown): string {
  if (typeof raw !== 'string') throw new ValidationError('notes must be a string')
  return raw.slice(0, MAX_NOTES_LENGTH)
}

/**
 * Only checks that a path was supplied. The extension whitelist lives in
 * resumeService, which can report *which* file was rejected and why — rejecting
 * here would throw that detail away before the UI could show it.
 */
export function validateResumePath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new ValidationError('A file path is required')
  }
  return raw
}

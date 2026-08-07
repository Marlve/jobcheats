/**
 * Renderer input crosses a trust boundary and ends up in URLs, file paths and
 * SQL bindings, so every field is checked before use.
 */

import { isVersion } from "../services/version.js"

const JOB_TYPES: JobType[] = ['internship', 'full-time', 'part-time']
const DATES_POSTED: DatePosted[] = ['24h', 'week', 'month']
const JOB_SOURCES: JobSource[] = ['linkedin', 'seek']
const JOB_STATUSES: JobStatus[] = ['new', 'saved', 'applied', 'rejected']
const JOB_VIEWS: JobView[] = ['inbox', 'archive', 'all']
const SORT_KEYS: NonNullable<ListJobsOptions['sortBy']>[] = ['score', 'date', 'company']

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
  if (input.minScore !== undefined) options.minScore = asNumberInRange(input.minScore, 'minScore', 0, 100)
  if (input.search !== undefined) {
    if (typeof input.search !== 'string') throw new ValidationError('search must be a string')
    options.search = input.search.slice(0, 200)
  }

  return options
}

export function validateJobStatus(raw: unknown): JobStatus {
  return asOneOf(raw, JOB_STATUSES, 'status')
}

export function validateJobSource(raw: unknown): JobSource {
  return asOneOf(raw, JOB_SOURCES, 'source')
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

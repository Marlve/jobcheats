/**
 * Best-effort extraction of posted date, salary and work type from job-card and
 * description text. Pure, so it can be unit tested without a browser.
 *
 * Every function returns null rather than guessing — a wrong salary is worse
 * than a missing one.
 */

const RELATIVE_DATE = /(\d+)\s*(minute|min|hour|hr|day|week|month)s?\s+ago/i

/**
 * The abbreviated form: "33m ago", "8h ago", "21d ago", "30d+ ago".
 *
 * Seek writes every card date this way, so without this every Seek job would
 * come back with no posted date at all. Tried only after the spelled-out form,
 * which keeps "3 minutes ago" reading as minutes rather than stopping at the m.
 * The trailing + on "30d+ ago" means "at least", and is treated as exactly 30 —
 * the posting is older than the retention window either way.
 */
const COMPACT_RELATIVE_DATE = /(\d+)\s*([mhdw])\+?\s+ago/i

const COMPACT_UNIT_MS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
}

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  min: 60_000,
  hour: 3_600_000,
  hr: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_592_000_000, // 30 days, good enough for "posted 2 months ago"
}

/**
 * Turns "3 hours ago" into an absolute ISO timestamp.
 *
 * Boards only ever render relative dates, so without this the 24-hour guarantee
 * rests entirely on their own filter with nothing stored to verify it against.
 */
export function parsePostedAt(text: string, now: Date = new Date()): string | null {
  if (!text) return null

  if (/\bjust\s+posted\b|\bjust\s+now\b|\btoday\b/i.test(text)) {
    return now.toISOString()
  }

  if (/\byesterday\b/i.test(text)) {
    return new Date(now.getTime() - UNIT_MS.day).toISOString()
  }

  const match = text.match(RELATIVE_DATE)
  if (match) {
    const amount = Number(match[1])
    const unit = UNIT_MS[match[2].toLowerCase()]
    if (!Number.isFinite(amount) || !unit) return null

    return new Date(now.getTime() - amount * unit).toISOString()
  }

  const compact = text.match(COMPACT_RELATIVE_DATE)
  if (compact) {
    const amount = Number(compact[1])
    const unit = COMPACT_UNIT_MS[compact[2].toLowerCase()]
    if (!Number.isFinite(amount) || !unit) return null

    return new Date(now.getTime() - amount * unit).toISOString()
  }

  return null
}

const CURRENCY = String.raw`(?:RM|MYR|SGD|AUD|USD|IDR|PHP|THB|VND|S\$|A\$|US\$|\$|£|€)`
const AMOUNT = String.raw`\d[\d,.]*\s*(?:k|K)?`
const SALARY = new RegExp(
  String.raw`${CURRENCY}\s?${AMOUNT}(?:\s*(?:-|–|—|to)\s*(?:${CURRENCY}\s?)?${AMOUNT})?` +
  String.raw`(?:\s*(?:per|/|a)\s*(?:year|yr|annum|month|mo|hour|hr|week))?`,
  'i'
)

export function parseSalary(text: string): string | null {
  if (!text) return null

  const match = text.match(SALARY)
  if (!match) return null

  const salary = match[0].trim().replace(/\s+/g, ' ')

  // A bare currency symbol with a tiny number is almost always something else
  // on the page (a count, a rating), not pay.
  const digits = salary.replace(/\D/g, '')
  if (digits.length < 3) return null

  return salary
}

export function parseWorkType(text: string): WorkType | null {
  if (!text) return null

  if (/\bhybrid\b/i.test(text)) return 'hybrid'
  if (/\bremote\b|\bwork\s+from\s+home\b|\bwfh\b/i.test(text)) return 'remote'
  if (/\bon[\s-]?site\b|\bin[\s-]?office\b/i.test(text)) return 'onsite'

  return null
}

export interface JobMetadata {
  postedAt: string | null
  salary: string | null
  workType: WorkType | null
}

/**
 * Card text is preferred over the description: a description often mentions
 * other dates and salaries that have nothing to do with this posting.
 */
export function extractMetadata(cardText: string, detailText: string): JobMetadata {
  return {
    postedAt: parsePostedAt(cardText) ?? parsePostedAt(detailText),
    salary: parseSalary(cardText) ?? parseSalary(detailText),
    workType: parseWorkType(cardText) ?? parseWorkType(detailText),
  }
}

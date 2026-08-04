/**
 * Pure matching logic — no database, no Electron, so it can be unit tested
 * directly.
 */

/** Extra points per matched keyword that also appears in the job title. */
const TITLE_BONUS = 5

export interface MatchInput {
  title: string
  company: string
  aboutText: string
}

export interface MatchOutcome {
  score: number
  matchedKeywords: string[]
  missingKeywords: string[]
  titleHits: string[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Matches a keyword as a whole term.
 *
 * Lookarounds are used instead of `\b` because keywords legitimately end in
 * non-word characters — `\bc\+\+\b` never matches "c++", since there is no word
 * boundary after the plus. Guarding on adjacent alphanumerics instead keeps
 * "c++" and "node.js" working while still preventing "r" from matching "react".
 */
export function keywordPattern(keyword: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(keyword.toLowerCase())}(?![a-z0-9])`, 'i')
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Scores a job against the enabled resume keywords.
 *
 *   coverage   = matched weight / total enabled weight
 *   titleBonus = TITLE_BONUS per matched keyword also in the title
 *   score      = clamp(coverage * 100 + titleBonus, 0, 100)
 *
 * Returns the matched and missing keywords alongside the number, because a bare
 * score is not something a user can sanity-check.
 */
export function scoreJob(job: MatchInput, keywords: ResumeKeyword[]): MatchOutcome {
  const enabled = keywords.filter(keyword => keyword.enabled)

  if (enabled.length === 0) {
    return { score: 0, matchedKeywords: [], missingKeywords: [], titleHits: [] }
  }

  const haystack = normalize(`${job.title} ${job.company} ${job.aboutText}`)
  const title = normalize(job.title)

  const matchedKeywords: string[] = []
  const missingKeywords: string[] = []
  const titleHits: string[] = []

  let matchedWeight = 0
  let totalWeight = 0

  for (const keyword of enabled) {
    const weight = keyword.weight > 0 ? keyword.weight : 1
    totalWeight += weight

    const pattern = keywordPattern(keyword.keyword)

    if (pattern.test(haystack)) {
      matchedKeywords.push(keyword.keyword)
      matchedWeight += weight
      if (pattern.test(title)) titleHits.push(keyword.keyword)
    } else {
      missingKeywords.push(keyword.keyword)
    }
  }

  const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0
  const score = Math.min(100, Math.max(0, Math.round(coverage * 100 + titleHits.length * TITLE_BONUS)))

  return { score, matchedKeywords, missingKeywords, titleHits }
}

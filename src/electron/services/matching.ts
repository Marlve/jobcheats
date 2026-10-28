/**
 * Pure matching logic — no database, no Electron, so it can be unit tested
 * directly.
 */

import { canonicalSkill, isKnownSkill, NORMAL_PRIORITY, priorityOf, termFrequencies } from "./keywordService.js"

/** Extra points per covered skill that also appears in the job title. */
const TITLE_BONUS = 5

/**
 * Repetition counts as emphasis, but only so far — a posting that says
 * "Kubernetes" nine times is not nine times as much about Kubernetes.
 */
const MAX_ASK_WEIGHT = 3

export interface MatchInput {
  title: string
  aboutText: string
}

export interface MatchOutcome {
  /**
   * Null means unscorable, not zero: either there are no enabled keywords, or
   * the posting names nothing recognisable to score against. The inbox renders
   * it as "—" and sorts those jobs last.
   */
  score: number | null
  /** The job's asks that your resume covers. */
  matchedKeywords: string[]
  /** The job's asks that it does not — the actual gaps for this job. */
  missingSkills: string[]
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

function countMatches(keyword: string, text: string): number {
  const pattern = new RegExp(keywordPattern(keyword).source, 'gi')
  return text.match(pattern)?.length ?? 0
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ')
}

/**
 * What a posting is asking for, and how heavily.
 *
 * Two sources, because neither alone is enough. Dictionary skills are the
 * backbone — job ads are mostly prose, and treating every frequent word as a
 * requirement would drown the real ones in "team", "delivery" and "culture".
 * But the dictionary cannot know about your niche, so any keyword you hold that
 * the posting also mentions is admitted as an ask too; without that, a keyword
 * added by hand for something the dictionary has never heard of could never
 * affect a score.
 *
 * Note that this reads the job alone. Nothing about the size of your keyword
 * list reaches the denominator, which is the whole point — see `scoreJob`.
 */
export function requiredSkills(text: string, resumeKeywords: string[] = []): Map<string, number> {
  const asks = new Map<string, number>()

  // Counts are merged before the cap, so an ad that says "React" twice and
  // "ReactJS" once is asking for React three times, not for two half-skills.
  const bump = (term: string, count: number) => {
    const skill = canonicalSkill(term)
    asks.set(skill, Math.min(MAX_ASK_WEIGHT, (asks.get(skill) ?? 0) + count))
  }

  for (const [term, count] of termFrequencies(text)) {
    if (isKnownSkill(term)) bump(term, count)
  }

  for (const keyword of resumeKeywords) {
    if (asks.has(canonicalSkill(keyword))) continue
    const count = countMatches(keyword, text)
    if (count > 0) bump(keyword, count)
  }

  // "spring boot" and "spring" are both dictionary skills, so a posting naming
  // the first registers both. Drop the halves: one requirement should count
  // once, and a resume that says "spring boot" should not be marked down for
  // missing "spring".
  for (const ask of [...asks.keys()]) {
    if (!ask.includes(' ')) continue
    for (const half of ask.split(' ')) asks.delete(half)
  }

  return asks
}

/**
 * Scores a job against the enabled resume keywords.
 *
 *   each ask   = how often the job asks for it × your priority for it
 *                (a skill you do not have counts at normal priority)
 *   coverage   = asks you cover / everything the job asks
 *   titleBonus = TITLE_BONUS per covered ask that is also in the job title
 *   score      = min(coverage * 100 + titleBonus, 100)
 *
 * The denominator comes from the job, never from the resume. Scoring the other
 * way round — what share of *your* keywords a posting mentions — punishes you
 * for knowing things: every keyword you add grows the denominator, so a broad
 * resume scores worse against the same job than a narrow one. Here a keyword
 * the job never mentions is simply inert, and adding keywords can only ever
 * raise a score.
 *
 * Returns the covered and missing skills alongside the number, because a bare
 * score is not something a user can sanity-check.
 */
export function scoreJob(job: MatchInput, keywords: ResumeKeyword[]): MatchOutcome {
  const enabled = keywords.filter(keyword => keyword.enabled)

  // Company is deliberately absent from the text: an employer called "Redis
  // Labs" is not a posting that asks for Redis.
  const haystack = normalize(`${job.title} ${job.aboutText}`)
  const asks = requiredSkills(haystack, enabled.map(keyword => keyword.keyword))

  // Nothing recognisable to score against — a two-line ad, or a role outside
  // what the skill dictionary covers. Guessing at a number here would be worse
  // than admitting there isn't one.
  if (enabled.length === 0 || asks.size === 0) {
    return { score: null, matchedKeywords: [], missingSkills: [...asks.keys()], titleHits: [] }
  }

  // Canonical skill → the wording you actually used, so a match is reported
  // back as your own keyword. Insights counts hits per keyword by name, and
  // would never see "reactjs" score if this handed it "react".
  const held = new Map<string, string>()
  const priority = new Map<string, number>()
  for (const { keyword, weight } of enabled) {
    const skill = canonicalSkill(keyword.toLowerCase())
    if (!held.has(skill)) {
      held.set(skill, keyword)
      priority.set(skill, priorityOf(weight))
    }
  }

  // Reading the title as its own posting is what makes the bonus survive
  // aliasing: a "ReactJS Developer" title still hits the canonical "react".
  const titleAsks = requiredSkills(normalize(job.title), [...held.values()])

  const matchedKeywords: string[] = []
  const missingSkills: string[] = []
  const titleHits: string[] = []

  let coveredWeight = 0
  let totalWeight = 0

  for (const [ask, weight] of asks) {
    const covered = held.get(ask)
    // Missing asks sit at normal priority. That keeps the denominator the
    // job's: adding a keyword at any priority can only raise a score.
    const weighted = weight * (priority.get(ask) ?? NORMAL_PRIORITY)
    totalWeight += weighted

    if (covered !== undefined) {
      matchedKeywords.push(covered)
      coveredWeight += weighted
      if (titleAsks.has(ask)) titleHits.push(ask)
    } else {
      missingSkills.push(ask)
    }
  }

  const coverage = coveredWeight / totalWeight
  const score = Math.min(100, Math.round(coverage * 100 + titleHits.length * TITLE_BONUS))

  return { score, matchedKeywords, missingSkills, titleHits }
}

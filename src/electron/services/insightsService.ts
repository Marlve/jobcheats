import { MATCH_THRESHOLD, SCORE_BANDS } from "../config.js"
import {
  countJobs,
  getJobCorpus,
  getMatchScores,
  getMatchedKeywordSets,
  listEnabledKeywords,
} from "../db/db.js"
import { documentFrequencies, isKnownSkill } from "./keywordService.js"

/** Below this many scored jobs the percentages are not worth trusting. */
const LOW_SAMPLE_THRESHOLD = 10

const TOP_KEYWORDS = 8
const TOP_GAPS = 10

/** A gap must appear in at least this share of jobs to be worth surfacing. */
const GAP_MIN_SHARE = 0.15

function buildDistribution(scores: number[]): ScoreBand[] {
  return SCORE_BANDS.map(band => ({
    ...band,
    count: scores.filter(score => score >= band.min && score <= band.max).length,
  }))
}

/**
 * Reads the job database back against the resume.
 *
 * The headline is the share of scored jobs at or above the strong-match
 * threshold, not an average — an average is dragged down by every irrelevant
 * posting the scraper picks up, which makes it a measure of the search query
 * rather than of the resume.
 */
export function getInsights(): ResumeInsights {
  const keywords = listEnabledKeywords()
  const scores = getMatchScores()
  const totalJobs = countJobs()
  const scoredJobs = scores.length

  const strongMatches = scores.filter(score => score >= MATCH_THRESHOLD).length
  const headlineScore = scoredJobs > 0 ? Math.round((strongMatches / scoredJobs) * 100) : 0

  // Seed every enabled keyword at zero so ones that never hit still show up —
  // those are exactly the ones worth removing.
  const hits = new Map<string, number>(keywords.map(keyword => [keyword.keyword, 0]))
  for (const matched of getMatchedKeywordSets()) {
    for (const keyword of matched) {
      hits.set(keyword, (hits.get(keyword) ?? 0) + 1)
    }
  }

  const ranked = [...hits.entries()]
    .map(([keyword, count]) => ({ keyword, hits: count }))
    .sort((a, b) => b.hits - a.hits || a.keyword.localeCompare(b.keyword))

  const strongestKeywords = ranked.filter(entry => entry.hits > 0).slice(0, TOP_KEYWORDS)
  const deadKeywords = [...ranked]
    .reverse()
    .filter(entry => entry.hits === 0 || (scoredJobs > 0 && entry.hits / scoredJobs < 0.05))
    .slice(0, TOP_KEYWORDS)

  // Skill gaps: dictionary skills that show up across job ads but are absent
  // from the resume keywords entirely.
  const known = new Set(keywords.map(keyword => keyword.keyword))
  const corpus = getJobCorpus()
  const frequencies = documentFrequencies(corpus)
  const minHits = Math.max(2, Math.ceil(corpus.length * GAP_MIN_SHARE))

  const skillGaps = [...frequencies.entries()]
    .filter(([term, count]) => isKnownSkill(term) && !known.has(term) && count >= minHits)
    .map(([term, count]) => ({ keyword: term, hits: count }))
    .sort((a, b) => b.hits - a.hits || a.keyword.localeCompare(b.keyword))
    .slice(0, TOP_GAPS)

  return {
    headlineScore,
    threshold: MATCH_THRESHOLD,
    totalJobs,
    scoredJobs,
    lowSample: scoredJobs < LOW_SAMPLE_THRESHOLD,
    distribution: buildDistribution(scores),
    strongestKeywords,
    deadKeywords,
    skillGaps,
  }
}

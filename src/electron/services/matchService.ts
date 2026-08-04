import {
  clearAllMatches,
  getScorableJobs,
  listEnabledKeywords,
  setJobMatches,
} from "../db/db.js"
import { scoreJob } from "./matching.js"

/**
 * Rescores every stored job. Call whenever the resume or its keywords change —
 * a stale score is worse than no score, since the whole list is sorted by it.
 */
export function recomputeAll(): number {
  const keywords = listEnabledKeywords()

  // No keywords means matching is impossible, not that everything scores zero.
  // NULL keeps that distinction visible to the UI.
  if (keywords.length === 0) {
    clearAllMatches()
    return 0
  }

  const jobs = getScorableJobs()
  const matches = jobs.map(job => {
    const { score, matchedKeywords } = scoreJob(job, keywords)
    return { id: job.id, score, matchedKeywords }
  })

  setJobMatches(matches)
  return matches.length
}

/** Scores only the jobs from one run — used at the end of a scrape. */
export function scoreNewJobs(runId: number): number {
  const keywords = listEnabledKeywords()
  if (keywords.length === 0) return 0

  const jobs = getScorableJobs(runId)
  if (jobs.length === 0) return 0

  const matches = jobs.map(job => {
    const { score, matchedKeywords } = scoreJob(job, keywords)
    return { id: job.id, score, matchedKeywords }
  })

  setJobMatches(matches)
  return matches.length
}

export { scoreJob } from "./matching.js"

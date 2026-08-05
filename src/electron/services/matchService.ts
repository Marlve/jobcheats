import {
  clearAllMatches,
  getScorableJobs,
  hasResume,
  listEnabledKeywords,
  setJobMatches,
} from "../db/db.js"
import { scoreJob } from "./matching.js"

/**
 * A score is a claim about the resume, so there has to be one.
 *
 * Deleting a resume drops its auto keywords but keeps the manual ones, and
 * those alone would happily keep producing scores — leaving the inbox sorted by
 * a resume that no longer exists. The scan screen already promises the opposite
 * ("nothing can be scored until you add one"), so this is what makes that true.
 */
function canScore(): boolean {
  return hasResume() && listEnabledKeywords().length > 0
}

/**
 * Rescores every stored job. Call whenever the resume or its keywords change —
 * a stale score is worse than no score, since the whole list is sorted by it.
 *
 * Returns rows written, not rows scored: a job whose posting named nothing to
 * score against comes back with a null score and is stored as such.
 */
export function recomputeAll(): number {
  // Unscorable is not the same as scoring zero. NULL keeps that distinction
  // visible to the UI, which shows "—" rather than a 0% badge.
  if (!canScore()) {
    clearAllMatches()
    return 0
  }

  const keywords = listEnabledKeywords()

  const jobs = getScorableJobs()
  const matches = jobs.map(job => {
    const { score, matchedKeywords } = scoreJob(job, keywords)
    return { id: job.id, score, matchedKeywords }
  })

  setJobMatches(matches)
  return matches.length
}

/**
 * Brings stored scores back in line with the current scorer. Run on launch.
 *
 * Scores live on the job rows, so anything that changes how they are computed —
 * a resume deleted by a build that kept scoring off the leftover manual
 * keywords, or a change to the scoring formula itself — leaves the inbox
 * sorted by numbers no code would produce today, and nothing would correct them
 * until the user happened to touch a keyword.
 *
 * Rescoring outright rather than tracking a formula version: retention caps the
 * table at a week of jobs, so this is a few hundred rows of regex work, and a
 * version counter is one more thing to forget to bump.
 */
export function reconcileMatches(): void {
  if (!canScore()) {
    clearAllMatches()
    return
  }

  recomputeAll()
}

/** Scores only the jobs from one run — used at the end of a scrape. */
export function scoreNewJobs(runId: number): number {
  if (!canScore()) return 0

  const keywords = listEnabledKeywords()
  const jobs = getScorableJobs(runId)
  if (jobs.length === 0) return 0

  const matches = jobs.map(job => {
    const { score, matchedKeywords } = scoreJob(job, keywords)
    return { id: job.id, score, matchedKeywords }
  })

  setJobMatches(matches)
  return matches.length
}

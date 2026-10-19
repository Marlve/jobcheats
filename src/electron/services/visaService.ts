import { getScorableJobs, setJobVisas } from "../db/db.js"
import { classifyVisa } from "./visa.js"

/**
 * Re-reads every stored job against the current wording rules. Run on launch.
 *
 * The verdict is stored on the row at scrape time, so a rule added later would
 * otherwise only ever apply to jobs found after it — and jobs stored before this
 * existed have no verdict at all. Redone outright rather than versioned, for the
 * same reason scores are: retention keeps the table to a week of jobs.
 */
export function reconcileVisa(): void {
  setJobVisas(getScorableJobs().map(job => {
    const { kind, evidence } = classifyVisa(job.aboutText)
    return { id: job.id, kind, evidence }
  }))
}

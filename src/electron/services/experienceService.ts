import { getScorableJobs, setJobExperiences } from "../db/db.js"
import { classifyExperience } from "./experience.js"

/**
 * Re-reads every stored job against the current experience rules. Run on launch.
 *
 * The verdict is stored on the row at scrape time, so jobs stored before this
 * existed have none, and a rule changed later would otherwise only apply to jobs
 * found after it. Same approach as `reconcileVisa`.
 */
export function reconcileExperience(): void {
  setJobExperiences(getScorableJobs().map(job => {
    const { senior, minYears, evidence } = classifyExperience(job.title, job.aboutText)
    return { id: job.id, senior, minYears, evidence }
  }))
}

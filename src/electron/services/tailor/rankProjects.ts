import { keywordPattern, requiredSkills } from "../matching.js"
import type { TexProject } from "./texProjects.js"
import { NORMAL_PRIORITY } from "../keywordService.js"

/**
 * All project ids, best match for the job first. Ties keep master order.
 * `priorities` (canonical skill → your keyword priority, 1–5) scales each ask;
 * a skill without one counts at normal priority.
 */
export function rankProjects(
  job: { title: string; aboutText: string },
  projects: TexProject[],
  priorities: Map<string, number> = new Map(),
): number[] {
  const tags = [...new Set(projects.flatMap((p) => p.tags))]
  const asks = [...requiredSkills(`${job.title}\n${job.aboutText}`, tags)]
  const score = (p: TexProject) =>
    asks.reduce((sum, [ask, weight]) => {
      const hit = p.tags.includes(ask) ? 3 : keywordPattern(ask).test(p.text) ? 1 : 0
      return sum + weight * (priorities.get(ask) ?? NORMAL_PRIORITY) * hit
    }, 0)
  return projects
    .map((p) => ({ id: p.id, score: score(p) }))
    .sort((a, b) => b.score - a.score)
    .map((p) => p.id)
}

/** Longest prefix of `ranked` that fits `maxPages`. Binary search: page count only grows with more projects. */
export async function fitProjects(
  ranked: number[],
  pagesFor: (keep: number[]) => Promise<number>,
  maxPages: number
): Promise<number[]> {
  let fit = 0 // 0 projects is assumed to fit
  let over = ranked.length + 1
  while (over - fit > 1) {
    const mid = (fit + over) >> 1
    if ((await pagesFor(ranked.slice(0, mid))) <= maxPages) fit = mid
    else over = mid
  }
  return ranked.slice(0, fit)
}

import { canonicalSkill, isKnownSkill, tokenize } from "../keywordService.js"
import { requiredSkills } from "../matching.js"
import { runClaude, MAX_JOB_CHARS, type LetterJob } from "../apply/coverLetter.js"
import { blockTitle, type TexProject } from "./texProjects.js"

const CHOOSE_SYSTEM = "You choose resume projects for a job. You never use tools."
const REWRITE_SYSTEM = "You edit LaTeX resume bullets. You never use tools."
const NO_LIST = "Claude did not return a project list."

/**
 * Reads `KEEP: 3, 0, 7`. Keeps valid ids once each, in reply order, then the ids
 * Claude left out in `ranked` order, so a short reply still fills the pages.
 */
export function parseChooseReply(reply: string, ranked: number[]): number[] {
  const line = /^\s*KEEP:(.*)$/im.exec(reply)
  const valid = new Set(ranked)
  const ids = [...new Set((line?.[1].match(/\d+/g) ?? []).map(Number))].filter((id) => valid.has(id))
  if (ids.length === 0) throw new Error(NO_LIST)
  return [...ids, ...ranked.filter((id) => !ids.includes(id))]
}

/** Sections start at `=== PROJECT <id> ===`. Each block is trimmed and ends with one "\n". */
export function parseRewriteReply(reply: string): Map<number, string> {
  const text = reply.replace(/^\s*```[a-z]*\s*$/gim, "")
  const parts = text.split(/^[ \t]*=== PROJECT (\d+) ===[ \t]*$/m)
  const out = new Map<number, string>()
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1].trim()
    if (body) out.set(Number(parts[i]), body + "\n")
  }
  return out
}

const NUMBER = /\d+(?:[.,]\d+)?%?/g
const COMMAND = /\\[a-zA-Z@]+/g
const FIRST_ITEM = /\\(?:item|resumeItem)(?![a-zA-Z])/

/** The block before its first bullet, spacing evened out. */
function heading(block: string): string {
  return block.split(FIRST_ITEM)[0].replace(/\s+/g, " ").trim()
}

function balanced(s: string): boolean {
  return (s.match(/(?<!\\)\{/g) ?? []).length === (s.match(/(?<!\\)\}/g) ?? []).length
}

/** True only when the rewrite changed wording and nothing else. */
export function acceptRewrite(original: TexProject, rewritten: string): boolean {
  if (rewritten.split(/\r?\n/)[0].trim() !== original.block.split(/\r?\n/)[0].trim()) return false
  if (blockTitle(rewritten) !== original.title) return false
  if (heading(rewritten) !== heading(original.block)) return false
  if (!balanced(rewritten)) return false

  // A new command could read a file into the PDF (\input{C:/...}): job text is untrusted.
  const commands = new Set(original.block.match(COMMAND) ?? [])
  if ((rewritten.match(COMMAND) ?? []).some((c) => !commands.has(c))) return false
  // ^^5c is a backslash to TeX, so it could spell any command.
  if (rewritten.includes("^^")) return false

  const numbers = new Set(original.block.match(NUMBER) ?? [])
  if ((rewritten.match(NUMBER) ?? []).some((n) => !numbers.has(n))) return false

  const skills = new Set(tokenize(original.block).map(canonicalSkill))
  if (!tokenize(rewritten).every((t) => !isKnownSkill(t) || skills.has(canonicalSkill(t)))) return false
  // Phrases such as "machine learning" are made of words that are no skill alone.
  const phrases = requiredSkills(original.block)
  return [...requiredSkills(rewritten).keys()].every((s) => phrases.has(s) || skills.has(s))
}

function jobText(job: LetterJob): string {
  return [
    `JOB: ${job.title} at ${job.company}${job.location ? `, ${job.location}` : ""}`,
    `JOB DESCRIPTION:\n${job.description.slice(0, MAX_JOB_CHARS)}`,
  ].join("\n\n")
}

/** `ranked` is the tag ranking: it orders the projects Claude leaves out. */
export async function chooseProjects(job: LetterJob, projects: TexProject[], ranked: number[], signal?: AbortSignal): Promise<number[]> {
  const list = projects
    .map((p) => `id: ${p.id}\ntitle: ${p.title}\ntags: ${p.tags.join(", ")}\ntext: ${p.text}`)
    .join("\n\n")
  const prompt = [
    "Choose the resume projects that fit the job below best. Put the best first.",
    "Reply with one line only, no other text: KEEP: <ids, best first>",
    jobText(job),
    `PROJECTS:\n${list}`,
  ].join("\n\n")
  return parseChooseReply(await runClaude(prompt, CHOOSE_SYSTEM, signal), ranked)
}

/** Blocks that fail acceptRewrite are left out; the caller keeps the original for those. */
export async function rewriteProjects(job: LetterJob, projects: TexProject[], signal?: AbortSignal): Promise<Map<number, string>> {
  const sections = projects.map((p) => `=== PROJECT ${p.id} ===\n${p.block.trim()}`).join("\n\n")
  const prompt = [
    "Reword the bullets of the LaTeX resume projects below so they use the job's own terms where that is true.",
    "Rules:",
    "- Keep the `% tags:` line and the heading lines unchanged.",
    "- Change only the wording of bullets.",
    "- Add no new facts, technologies, numbers, results or projects.",
    "- Escape LaTeX special characters.",
    "- Output only the sections, each starting with its `=== PROJECT <id> ===` line.",
    jobText(job),
    `PROJECTS:\n${sections}`,
  ].join("\n")
  const byId = new Map(projects.map((p) => [p.id, p]))
  const out = new Map<number, string>()
  for (const [id, block] of parseRewriteReply(await runClaude(prompt, REWRITE_SYSTEM, signal))) {
    const original = byId.get(id)
    if (original && acceptRewrite(original, block)) out.set(id, block)
  }
  return out
}

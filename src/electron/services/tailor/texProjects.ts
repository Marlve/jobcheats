import { canonicalSkill } from "../keywordService.js"

export interface TexProject {
  /** Position in the master, 0-based. Stable id for ranking and Claude replies. */
  id: number
  /** From the `% tags:` line, trimmed, lowercased, canonicalSkill() applied, empties dropped. */
  tags: string[]
  /** First \textbf{...} content in the block, else its first non-comment line, LaTeX stripped. */
  title: string
  /** The exact source from the `% tags:` line up to (not including) the next tag line or end marker. */
  block: string
  /** The block as plain words: comments, \commands and braces removed. Used for ranking. */
  text: string
}
export interface ParsedTex { head: string; projects: TexProject[]; tail: string }
export class TexFormatError extends Error {}

const TAG_LINE = /^[ \t]*%[ \t]*tags:(.*)$/gm
const END_LINE = /^[ \t]*%[ \t]*end-projects[ \t]*$/m

/** Drops comment lines, \commands and braces; keeps escaped characters like \&. */
function strip(s: string): string {
  return s
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\([&%$#_])/g, "$1")
    .replace(/\\[a-zA-Z]+\*?/g, " ")
    .replace(/\\\\/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function blockTitle(block: string): string {
  const bold = /\\textbf\{([^}]*)\}/.exec(block)
  if (bold) return strip(bold[1])
  const line = block.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith("%"))
  return strip(line ?? "")
}

export function parseTex(source: string): ParsedTex {
  const tags = [...source.matchAll(TAG_LINE)]
  if (tags.length === 0) return { head: source, projects: [], tail: "" }

  const last = tags[tags.length - 1]
  const end = END_LINE.exec(source.slice(last.index))
  if (!end) throw new TexFormatError('Add a "% end-projects" line after your last project.')
  const tailStart = last.index + end.index

  const projects = tags.map((m, id) => {
    const stop = id + 1 < tags.length ? tags[id + 1].index : tailStart
    const block = source.slice(m.index, stop)
    const tagList = m[1]
      .split(",")
      .map((t) => canonicalSkill(t.trim().toLowerCase()))
      .filter(Boolean)
    return { id, tags: tagList, title: blockTitle(block), block, text: strip(block) }
  })
  return { head: source.slice(0, tags[0].index), projects, tail: source.slice(tailStart) }
}

/** head + kept blocks in master (id) order + tail. `replace` swaps in rewritten blocks. */
export function buildTex(parsed: ParsedTex, keep: number[], replace?: Map<number, string>): string {
  const kept = new Set(keep)
  const body = parsed.projects
    .filter((p) => kept.has(p.id))
    .map((p) => replace?.get(p.id) ?? p.block)
    .join("")
  return parsed.head + body + parsed.tail
}

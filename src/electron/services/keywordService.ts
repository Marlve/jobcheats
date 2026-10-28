import { AUTO_KEYWORD_COUNT } from "../config.js"
import { SKILLS, SKILL_ALIASES, SKILL_PHRASES } from "./data/skills.js"
import { STOPWORDS } from "./data/stopwords.js"

/** How much harder a dictionary skill counts than a merely frequent word. */
const SKILL_BOOST = 10

/**
 * Single characters are excluded from automatic extraction. A one-letter
 * keyword like "r" matches far too loosely against job text and would inflate
 * every score; it can still be added by hand if you really want it.
 */
const MIN_TOKEN_LENGTH = 2

export interface ExtractedKeyword {
  keyword: string
  weight: number
}

/**
 * Splits text into comparable tokens.
 *
 * `+ # . / -` survive inside a token so that "c++", "c#", "node.js", "ci/cd"
 * and "scikit-learn" stay intact — stripping them would turn most of a
 * technical resume into noise.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\- ]+/g, ' ')
    .split(/\s+/)
    .map(token => token.replace(/^[-./]+|[-./]+$/g, ''))
    .filter(Boolean)
}

function isCandidate(token: string): boolean {
  return token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token) && !/^\d+$/.test(token)
}

/**
 * Term frequencies for one document: candidate unigrams, plus bigrams that are
 * known multi-word skills. Bigrams are restricted to the dictionary on purpose —
 * accepting any frequent pair yields things like "monash university".
 */
export function termFrequencies(text: string): Map<string, number> {
  const tokens = tokenize(text)
  const counts = new Map<string, number>()

  const bump = (term: string) => counts.set(term, (counts.get(term) ?? 0) + 1)

  for (const token of tokens) {
    if (isCandidate(token)) bump(token)
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`
    if (SKILL_PHRASES.has(bigram)) bump(bigram)
  }

  return counts
}

/** How many documents each term appears in. Used for skill-gap analysis. */
export function documentFrequencies(documents: string[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const document of documents) {
    for (const term of termFrequencies(document).keys()) {
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }

  return counts
}

/**
 * The one spelling of a skill that everything else compares against.
 *
 * Order matters. The alias table wins first, so a variant that also sits in
 * SKILLS — the dictionary lists "go" and "golang" both — still collapses.
 * A term the dictionary already knows is then left exactly as written, which
 * keeps the plural rules below from mangling "sass" into "sas" or "rails" into
 * "rail". Only after that is a trailing "s" worth trying, in both directions,
 * so "microservice" and "algorithms" need no entries of their own.
 *
 * Unrecognised terms come back unchanged. That is what lets a keyword you added
 * by hand, for something no dictionary has heard of, still be compared.
 */
export function canonicalSkill(term: string): string {
  const alias = SKILL_ALIASES.get(term)
  if (alias) return alias

  if (SKILLS.has(term)) return term

  const singular = term.endsWith('s') ? term.slice(0, -1) : null
  if (singular && SKILLS.has(singular)) return canonicalSkill(singular)

  if (SKILLS.has(`${term}s`)) return canonicalSkill(`${term}s`)

  return term
}

export function isKnownSkill(term: string): boolean {
  return SKILLS.has(canonicalSkill(term))
}

/**
 * A keyword's weight is its priority: 1 low, 3 normal, 5 high. Scoring
 * multiplies each covered ask by it, and a skill you do not have counts at
 * normal, so all-normal priorities score exactly as plain coverage would.
 */
export const MIN_PRIORITY = 1
export const NORMAL_PRIORITY = 3
export const MAX_PRIORITY = 5

/** The priority a keyword starts with: once in the resume is normal, each repeat one higher. */
export function autoPriority(frequency: number): number {
  return Math.min(MAX_PRIORITY, NORMAL_PRIORITY - 1 + Math.max(1, frequency))
}

/** A stored weight as a whole priority in range — older rows and hand-edited ones included. */
export function priorityOf(weight: number): number {
  return Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(weight)))
}

/**
 * Ranks the terms that best characterise a resume.
 *
 * Ranking and weight are deliberately different things. Dictionary skills are
 * boosted an order of magnitude so they win a place in the list at all, but the
 * weight is a starting priority from how often the term appears — something a
 * person can check against their own resume, and change by hand.
 */
export function extractKeywords(text: string, limit = AUTO_KEYWORD_COUNT): ExtractedKeyword[] {
  const frequencies = termFrequencies(text)

  const ranked = [...frequencies.entries()]
    .map(([keyword, frequency]) => ({
      keyword,
      frequency,
      score: frequency * (isKnownSkill(keyword) ? SKILL_BOOST : 1),
    }))
    .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword))

  return ranked
    .slice(0, Math.max(limit, 0))
    .map(({ keyword, frequency }) => ({
      keyword,
      weight: autoPriority(frequency),
    }))
}

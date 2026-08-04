import { AUTO_KEYWORD_COUNT } from "../config.js"
import { SKILLS, SKILL_PHRASES } from "./data/skills.js"
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

export function isKnownSkill(term: string): boolean {
  return SKILLS.has(term)
}

/**
 * Ranks the terms that best characterise a resume.
 *
 * Frequency alone surfaces filler, so dictionary skills are boosted an order of
 * magnitude. Weight 2 marks a recognised skill ("High" in the UI), 1 a term that
 * merely occurs often.
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
    .map(({ keyword }) => ({
      keyword,
      weight: isKnownSkill(keyword) ? 2 : 1,
    }))
}

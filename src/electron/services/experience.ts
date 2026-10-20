/**
 * Reads a posting for how experienced it wants you to be. Pure: title and text
 * in, verdict out, so every rule here can be checked on its own.
 *
 * Two independent signals. A senior-sounding title ("Senior", "Lead", "Staff
 * Engineer"), and a stated minimum of years. A posting that names neither is not
 * "entry level", just silent, so the filters built on this keep it.
 *
 * The years come from wording like "5+ years of experience" or "minimum 3 years".
 * When several are named the largest wins, since "2 years of AWS, 5 of Python"
 * still asks for five. English is the main set; the Japanese and Korean patterns
 * are short and have not been run against many real postings.
 */

export interface ExperienceSignal {
  senior: boolean
  /** Largest minimum stated, or null when the posting names none. */
  minYears: number | null
  /** The phrases that decided it, as written in the posting. */
  evidence: string[]
}

const MAX_EVIDENCE = 3
const MAX_EVIDENCE_LENGTH = 90
/** Anything above this is a company's age or a typo, not a requirement. */
const MAX_PLAUSIBLE_YEARS = 25

const SENIOR_TITLE: RegExp[] = [
  /\b(?:senior|sr\.?|lead|principal|head of|director|vp|vice president|chief|architect|manager)\b/i,
  /\bstaff\s+(?:\w+\s+)?(?:engineer|developer|scientist|designer)\b/i,
  /シニア|リード|マネージャー|部長|課長/,
  /시니어|팀장|책임|수석|리드/,
]

/** A title that says "junior" outranks a senior-looking word elsewhere in it ("Intern, Lead Generation"). */
const JUNIOR_TITLE = /\b(?:intern(?:ship)?s?|graduate|junior|jr\.?|entry[- ]level|trainee|apprentice)\b|インターン|新卒|ジュニア|신입|인턴/i

/**
 * Capture group 1 is the lower bound of the years; an upper bound is read past
 * and ignored. Searched in lowercased text with whitespace collapsed.
 */
const YEARS: RegExp[] = [
  // "5+ years of professional experience", "3-5 years' relevant experience"
  /\b(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:or more\s+)?(?:years?|yrs?)\b[^.;\n]{0,40}?\bexperience/g,
  // "minimum 3 years", "at least 2 years"
  /\b(?:minimum(?: of)?|min\.?|at least)\s+(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/g,
  // "experience: 3-5 years", "experience of 3+ years"
  /\bexperience\b[^.;\n]{0,30}?\b(\d{1,2})(?:\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b/g,
  // 経験3年以上, 3年以上の実務経験
  /(?:経験|実務経験)\s*(\d{1,2})\s*年\s*以上/g,
  /(\d{1,2})\s*年\s*以上の?(?:実務)?経験/g,
  // 경력 3년 이상, 3년 이상의 경력
  /경력\s*(\d{1,2})\s*년\s*이상/g,
  /(\d{1,2})\s*년\s*이상(?:의)?\s*경력/g,
]

/** A sentence about the company's own history rather than what it asks of you. */
const COMPANY_BOAST = /\b(?:we have|we've|our team|our company|the company|our founders?|founded|established|been in business|has over|have over)\b/

function normalise(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
}

/** The sentence a match sits in, from the previous full stop to the match's end. */
function sentenceBefore(text: string, matchStart: number): string {
  const lead = text.slice(0, matchStart)
  return lead.slice(Math.max(lead.lastIndexOf('.'), lead.lastIndexOf(';')) + 1)
}

function findYears(text: string): { years: number; phrase: string }[] {
  const found: { years: number; phrase: string }[] = []

  for (const pattern of YEARS) {
    for (const match of text.matchAll(pattern)) {
      const years = Number(match[1])
      if (years > MAX_PLAUSIBLE_YEARS) continue
      if (COMPANY_BOAST.test(sentenceBefore(text, match.index ?? 0))) continue

      found.push({ years, phrase: match[0].trim().slice(0, MAX_EVIDENCE_LENGTH) })
    }
  }

  return found
}

export function classifyExperience(title: string, aboutText: string): ExperienceSignal {
  const seniorTitle = !JUNIOR_TITLE.test(title) && SENIOR_TITLE.some(pattern => pattern.test(title))
  const years = findYears(normalise(aboutText))
  const strictest = years.reduce<{ years: number; phrase: string } | null>(
    (best, item) => (!best || item.years > best.years ? item : best), null)

  const evidence: string[] = []
  if (seniorTitle) evidence.push(title.slice(0, MAX_EVIDENCE_LENGTH))
  if (strictest) evidence.push(strictest.phrase)

  return {
    senior: seniorTitle,
    minYears: strictest ? strictest.years : null,
    evidence: evidence.slice(0, MAX_EVIDENCE),
  }
}

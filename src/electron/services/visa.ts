/**
 * Reads a posting's wording for what it says about work rights. Pure: text in,
 * verdict out, so every rule here can be checked on its own.
 *
 * This reports what the text says and shows the phrase it found — it does not
 * know whether a company would really sponsor you, and a posting that is silent
 * is "none", not "no". Restricted phrases are removed from the text before the
 * sponsorship phrases are looked for, because "we do not sponsor visas" contains
 * "sponsor visas" and would otherwise read as the opposite of what it says.
 *
 * English is the main set. The Japanese and Korean lists are short and have
 * not been run against many real postings.
 */

export interface VisaSignal {
  kind: VisaKind
  /** The phrases that decided it, as written in the posting. */
  evidence: string[]
}

const MAX_EVIDENCE = 3
const MAX_EVIDENCE_LENGTH = 90

/** Phrases that mean "you must already be allowed to work here". */
const RESTRICTED: RegExp[] = [
  /\b(?:australian|new zealand|nz|japanese|korean)\s+(?:citizen\w*|permanent resident\w*|nationals?)/g,
  /\b(?:citizens?|citizenship)\b\s*(?:,|\/|or|and)?\s*(?:permanent residen\w+|pr\b)/g,
  /\b(?:must|need to|required to|have to|should)\s+(?:be|have|hold)\b[^.;\n]{0,80}?\b(?:citizen\w*|permanent resid\w+|work rights|working rights|right to work|rights to work|work authori[sz]ation|work permit|work visa|valid visa)\b/g,
  /\b(?:full|unrestricted|existing|valid|current)\s+(?:and\s+\w+\s+)?(?:australian\s+)?(?:work rights|working rights|right to work|work authori[sz]ation|work visa)\b/g,
  /\b(?:no|not|without|unable to|cannot|can't|can not|won't|will not|do not|don't|does not|doesn't|not able to|not in a position to)\s+(?:(?:provide|offer|support|available|currently)\s+){0,2}(?:relocation\s+(?:or|and|\/)\s+)?(?:visa\s+)?sponsor\w*/g,
  /\bsponsorship\b[^.;\n]{0,25}\bnot\s+(?:available|offered|provided|possible|supported)/g,
  /\b(?:baseline|nv1|nv2|negative vetting|security)\s+clearance\b/g,
  /日本国籍|永住者/g,
  /내국인|대한민국\s*국적/g,
]

/** Phrases that mean they hire people who need a visa, or move them. */
const SPONSORS: RegExp[] = [
  /\bsponsor\w*\s+(?:work\s+|your\s+|a\s+|the\s+|employment\s+)?(?:visas?|work permits?)\b/g,
  /\b(?:visa|work permit|employment)\s+(?:sponsorship|support|assistance)\b/g,
  /\bsponsorship\s+(?:is\s+|may be\s+|can be\s+)?(?:available|provided|offered|possible)\b/g,
  /\b(?:can|will|may|able to|happy to|willing to)\s+(?:also\s+)?sponsor\s+(?:candidates?|applicants?|employees?|talent|exceptional|qualified|suitable|successful|eligible|international|overseas|the right)\b/g,
  /\beligible for (?:visa )?sponsorship\b/g,
  /\brelocation\s+(?:support|assistance|package|allowance|bonus|help)\b/g,
  /\bopen to (?:international|overseas|foreign) (?:candidates|applicants)\b/g,
  /ビザ(?:取得)?(?:サポート|支援|スポンサー)|就労ビザ(?:の)?(?:サポート|支援)|外国籍(?:の方)?(?:歓迎|可)/g,
  /비자\s*(?:지원|스폰서)|외국인\s*(?:지원\s*가능|채용|우대)/g,
]

function normalise(text: string): string {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ')
}

function collect(patterns: RegExp[], text: string): string[] {
  const found = new Set<string>()
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) found.add(match[0].trim().slice(0, MAX_EVIDENCE_LENGTH))
  }
  // "must hold full working rights" already says "full working rights".
  const all = [...found]
  return all.filter(phrase => !all.some(other => other !== phrase && other.includes(phrase)))
}

/** The text with every restricted phrase blanked out, so what is left cannot be negated. */
function withoutRestricted(text: string): string {
  return RESTRICTED.reduce((rest, pattern) => rest.replace(pattern, match => ' '.repeat(match.length)), text)
}

export function classifyVisa(rawText: string): VisaSignal {
  const text = normalise(rawText)
  const restricted = collect(RESTRICTED, text)
  const sponsors = collect(SPONSORS, withoutRestricted(text))

  const kind: VisaKind = restricted.length && sponsors.length ? 'mixed'
    : restricted.length ? 'restricted'
    : sponsors.length ? 'sponsors'
    : 'none'

  return { kind, evidence: [...restricted, ...sponsors].slice(0, MAX_EVIDENCE) }
}

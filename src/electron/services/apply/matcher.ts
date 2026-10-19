/**
 * Decides what, if anything, goes into a form field. Pure: no browser, no I/O.
 *
 * Rules, not guesses. A field is filled only when the page itself says what it
 * is — an autocomplete hint, or a label that matches a known pattern — and
 * anything else is left for a person. Filling the wrong thing into the wrong
 * box is worse than leaving a box empty, so every rule errs towards no match.
 */

export interface FormField {
  /** Stable handle for this read of the page, tagged onto the element as data-jc-field. */
  id: string
  tag: 'input' | 'textarea' | 'select'
  type: string
  label: string
  autocomplete: string
  required: boolean
  /** What is in it now. A select sitting on its placeholder reads as empty. */
  value: string
  options: string[]
}

export type FillAction =
  | { kind: 'text'; value: string }
  | { kind: 'option'; option: string }
  | { kind: 'file' }

type TextKey = Exclude<keyof Profile, 'workAuthorized' | 'needsSponsorship'> | 'fullName'
type YesNoKey = 'workAuthorized' | 'needsSponsorship'

interface TextRule {
  key: TextKey
  /** Standard autocomplete tokens — the most reliable signal a form can give. */
  autocomplete?: string[]
  label: RegExp
}

const TEXT_RULES: TextRule[] = [
  { key: 'firstName', autocomplete: ['given-name'], label: /\b(first|given) name\b|\bforename\b/ },
  { key: 'lastName', autocomplete: ['family-name'], label: /\b(last|family) name\b|\bsurname\b/ },
  { key: 'fullName', autocomplete: ['name'], label: /^(your |full |legal |full legal |candidate )?name$/ },
  { key: 'email', autocomplete: ['email'], label: /\be ?mail\b/ },
  { key: 'phone', autocomplete: ['tel', 'tel-national'], label: /\b(phone|mobile|cell)\b(?!.*\b(code|country|type|ext))/ },
  { key: 'linkedin', label: /linkedin/ },
  { key: 'github', label: /github/ },
  { key: 'website', autocomplete: ['url'], label: /\b(website|portfolio|personal (site|url|page))\b/ },
  { key: 'location', label: /^(current |your )?(location|city)\b|where are you (currently )?(located|based)/ },
  { key: 'salary', label: /(expected|desired) (salary|compensation|pay)|(salary|compensation|pay) (expectation|requirement)/ },
]

const YES_NO_RULES: { key: YesNoKey; label: RegExp }[] = [
  { key: 'workAuthorized', label: /(authori[sz]ed|eligible|right) to work/ },
  { key: 'needsSponsorship', label: /sponsor/ },
]

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'search', ''])

/**
 * Lower-cased, with the punctuation forms add around a label stripped away.
 * Forms mark required fields with more than "*" — Lever uses a heavy asterisk
 * (✱), which left "Full name✱" matching nothing.
 */
function normalise(label: string): string {
  return label
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\(\s*required\s*\)|[*✱∗＊:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function textValue(key: TextKey, profile: Profile): string {
  if (key === 'fullName') return [profile.firstName, profile.lastName].filter(Boolean).join(' ')
  return profile[key]
}

/** The option that says "Yes" or "No", whatever else the option's text adds to it. */
function pickYesNo(options: string[], answer: 'yes' | 'no'): string | null {
  const wanted = answer === 'yes' ? /^yes\b/i : /^no\b/i
  return options.find(option => wanted.test(option.trim())) ?? null
}

/** A label short enough to show: forms nest help text and widgets inside theirs. */
export function displayLabel(label: string): string {
  const text = label.replace(/[*✱∗＊]/g, '').replace(/\s+/g, ' ').trim() || '(unlabelled field)'
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

export function isResumeField(field: FormField): boolean {
  const label = normalise(field.label)
  return field.type === 'file' && /\b(resume|cv|curriculum vitae)\b/.test(label) && !/cover letter/.test(label)
}

/** Null means leave the field alone. */
export function decide(field: FormField, profile: Profile): FillAction | null {
  if (field.type === 'file') {
    return isResumeField(field) && !field.value ? { kind: 'file' } : null
  }

  const label = normalise(field.label)

  if (field.tag === 'select') {
    if (field.value) return null

    const rule = YES_NO_RULES.find(candidate => candidate.label.test(label))
    const answer = rule ? profile[rule.key] : ''
    if (!answer) return null

    const option = pickYesNo(field.options, answer)
    return option ? { kind: 'option', option } : null
  }

  // Long answers are not this tool's to write, and anything already typed in is
  // somebody's work — neither is touched.
  if (field.tag !== 'input' || !TEXT_INPUT_TYPES.has(field.type) || field.value) return null

  const hint = field.autocomplete.toLowerCase().split(/\s+/)
  const rule = TEXT_RULES.find(candidate =>
    candidate.autocomplete?.some(token => hint.includes(token)) || candidate.label.test(label)
  )
  if (!rule) return null

  const value = textValue(rule.key, profile)
  return value ? { kind: 'text', value } : null
}

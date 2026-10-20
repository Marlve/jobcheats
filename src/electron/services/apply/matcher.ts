import { sameChoice } from "./answers.js"

/**
 * Decides what, if anything, goes into a form field. Pure: no browser, no I/O.
 *
 * Rules, not guesses. A field is filled only when the page itself says what it
 * is — an autocomplete hint, or a label that matches a known pattern — and
 * anything else is left for a person. Filling the wrong thing into the wrong
 * box is worse than leaving a box empty, so every rule errs towards no match.
 *
 * The one thing beyond the rules is an answer the person saved for a question,
 * matched on its exact wording (answers.ts).
 */

export interface FormField {
  /** Stable handle for this read of the page, tagged onto the element as data-jc-field. */
  id: string
  /** A 'radio' is a whole group of radio buttons, its `options` the buttons' labels. */
  tag: 'input' | 'textarea' | 'select' | 'radio'
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
  /** The text box wants a cover letter; writing one is the caller's job. */
  | { kind: 'coverLetter' }

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

const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'search', 'number', ''])

const COVER_LETTER = /\bcover letter\b/
/** Seek asks first whether to write one, upload one, or leave it out. */
const WRITE_OPTION = /^write\b/i
const NO_LETTER_OPTION = /\b(don'?t|do not) include\b|\bnone\b|\bno cover letter\b/i

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

export function isCoverLetterField(field: FormField): boolean {
  return field.type !== 'file' && COVER_LETTER.test(normalise(field.label))
}

export interface DecideOptions {
  /** Whether cover letters are switched on: without it the "write a cover letter" choice is not made for you. */
  writeLetters?: boolean
  /** The saved answer to a question, if there is one. */
  savedAnswer?: (label: string) => string | undefined
}

function findTextRule(field: FormField): TextRule | undefined {
  const label = normalise(field.label)
  const hint = field.autocomplete.toLowerCase().split(/\s+/)
  return TEXT_RULES.find(candidate =>
    candidate.autocomplete?.some(token => hint.includes(token)) || candidate.label.test(label)
  )
}

function findYesNoRule(field: FormField) {
  const label = normalise(field.label)
  return YES_NO_RULES.find(candidate => candidate.label.test(label))
}

/**
 * Whether this is a short question a saved answer could settle: not something
 * the profile already has the answer to, and not an essay, upload or consent.
 * These are the fields worth learning from, and worth listing when unanswered.
 */
export function isSavableQuestion(field: FormField, profile: Profile): boolean {
  if (field.tag === 'textarea' || field.type === 'file' || isCoverLetterField(field)) return false

  if (field.tag === 'input') {
    if (!TEXT_INPUT_TYPES.has(field.type)) return false
    const rule = findTextRule(field)
    return !rule || textValue(rule.key, profile) === ''
  }

  // A Yes/No question is the profile's once the profile has an answer to give.
  const rule = findYesNoRule(field)
  const yesNo = pickYesNo(field.options, 'yes') !== null || pickYesNo(field.options, 'no') !== null
  return !(rule && yesNo && profile[rule.key] !== '')
}

/**
 * Null means leave the field alone.
 */
export function decide(field: FormField, profile: Profile, options: DecideOptions = {}): FillAction | null {
  if (field.type === 'file') {
    return isResumeField(field) && !field.value ? { kind: 'file' } : null
  }

  if (field.tag === 'radio' && options.writeLetters && isCoverLetterField(field)) {
    const write = field.options.find(option => WRITE_OPTION.test(option.trim()))
    // A choice already made is left alone, except the "leave it out" default.
    const open = !field.value || NO_LETTER_OPTION.test(field.value)
    return write && open ? { kind: 'option', option: write } : null
  }

  if (field.tag === 'textarea') {
    return isCoverLetterField(field) && !field.value ? { kind: 'coverLetter' } : null
  }

  if (field.tag === 'select' || field.tag === 'radio') {
    if (field.value) return null

    const rule = findYesNoRule(field)
    const answer = rule ? profile[rule.key] : ''
    const yesNo = answer ? pickYesNo(field.options, answer) : null
    if (yesNo) return { kind: 'option', option: yesNo }

    // "Which statement best describes your right to work?" is no Yes/No question,
    // whatever the rule thinks; only an answer you saved for it settles it.
    const saved = options.savedAnswer?.(field.label)
    const choice = saved ? field.options.find(option => sameChoice(option, saved)) : undefined
    return choice ? { kind: 'option', option: choice } : null
  }

  // Long answers other than a cover letter are not this tool's to write, and
  // anything already typed in is somebody's work — neither is touched.
  if (field.tag !== 'input' || !TEXT_INPUT_TYPES.has(field.type) || field.value) return null

  const rule = findTextRule(field)
  if (rule) {
    const value = textValue(rule.key, profile)
    return value ? { kind: 'text', value } : null
  }

  const saved = options.savedAnswer?.(field.label)
  return saved ? { kind: 'text', value: saved } : null
}

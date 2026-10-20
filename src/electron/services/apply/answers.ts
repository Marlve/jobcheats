/**
 * Answers to form questions, kept so a question asked twice is answered once.
 *
 * In memory and pure — the caller loads the saved list, hands it in, and writes
 * back what `list()` returns when `changed` is set. Questions are matched on
 * their wording alone (see `questionKey`): "Expected salary?" and a different
 * question that happens to share a word must never share an answer.
 */

const MAX_ANSWERS = 500
const MAX_ANSWER_LENGTH = 300
/** Shorter than this is "Age" or "Name" — too generic to carry between sites. */
const MIN_KEY_LENGTH = 6

/** Lower-cased, punctuation and required-markers dropped, so two wordings of one question compare equal. */
export function questionKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(\s*required\s*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether a stored answer names this option: same comparison as for questions. */
export function sameChoice(a: string, b: string): boolean {
  return questionKey(a) === questionKey(b)
}

/** What fillPage needs from the saved answers. */
export interface AnswerBank {
  /** The answer to give, or undefined if this question has none yet. */
  lookup(label: string): string | undefined
  /** Notes what the person entered in a form themselves. */
  learn(label: string, value: string, options: string[]): void
  /** Notes a question that could not be answered, for the person to answer. */
  waiting(label: string, options: string[]): void
}

export function createAnswerBank(saved: SavedAnswer[]) {
  const entries = new Map<string, SavedAnswer>()
  for (const entry of saved) {
    const key = questionKey(entry.question)
    if (key) entries.set(key, entry)
  }
  let changed = false

  const now = () => new Date().toISOString()

  /** Past the cap, the oldest answer the person did not type themselves goes first. */
  function trim() {
    if (entries.size <= MAX_ANSWERS) return
    const disposable = [...entries.entries()]
      .filter(([, entry]) => entry.source !== 'typed')
      .sort((a, b) => a[1].seenAt.localeCompare(b[1].seenAt))
    for (const [key] of disposable) {
      if (entries.size <= MAX_ANSWERS) break
      entries.delete(key)
    }
  }

  const bank: AnswerBank & {
    changed: boolean
    list(): SavedAnswer[]
    set(question: string, answer: string): void
    remove(question: string): void
  } = {
    get changed() { return changed },

    lookup(label) {
      return entries.get(questionKey(label))?.answer || undefined
    },

    learn(label, value, options) {
      const key = questionKey(label)
      const answer = value.trim()
      if (key.length < MIN_KEY_LENGTH || !answer || answer.length > MAX_ANSWER_LENGTH) return

      const existing = entries.get(key)
      if (existing?.source === 'typed') return
      if (existing?.answer === answer) return

      entries.set(key, { question: label.trim(), answer, options, source: 'learned', seenAt: now() })
      changed = true
      trim()
    },

    waiting(label, options) {
      const key = questionKey(label)
      if (key.length < MIN_KEY_LENGTH || entries.has(key)) return

      entries.set(key, { question: label.trim(), answer: '', options, source: 'learned', seenAt: now() })
      changed = true
      trim()
    },

    set(question, answer) {
      const key = questionKey(question)
      if (!key) return

      const existing = entries.get(key)
      const text = answer.trim().slice(0, MAX_ANSWER_LENGTH)
      entries.set(key, {
        question: existing?.question ?? question.trim(),
        answer: text,
        options: existing?.options ?? [],
        // Clearing an answer puts the question back to waiting, open to being learned again.
        source: text ? 'typed' : 'learned',
        seenAt: now(),
      })
      changed = true
    },

    remove(question) {
      changed = entries.delete(questionKey(question)) || changed
    },

    list() {
      return [...entries.values()]
    },
  }

  return bank
}

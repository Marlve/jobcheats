import { readStoredAnswers, writeStoredAnswers } from "../db/db.js"
import { createAnswerBank } from "./apply/answers.js"

/**
 * The saved answers on disk: form questions and what to answer them.
 *
 * Autofill opens the list once per press, fills from it, adds what it learns,
 * and writes it back once at the end. The Profile screen reads and edits the
 * same list through `answerService`.
 */

/** Rows from an older or hand-edited store are kept if they can be read, dropped if not. */
function parseAnswers(raw: unknown): SavedAnswer[] {
  if (!Array.isArray(raw)) return []

  return raw.flatMap((row): SavedAnswer[] => {
    if (typeof row !== 'object' || row === null) return []
    const { question, answer, options, source, seenAt } = row as Record<string, unknown>
    if (typeof question !== 'string' || typeof answer !== 'string') return []

    return [{
      question,
      answer,
      options: Array.isArray(options) ? options.filter((option): option is string => typeof option === 'string') : [],
      source: source === 'typed' ? 'typed' : 'learned',
      seenAt: typeof seenAt === 'string' ? seenAt : new Date(0).toISOString(),
    }]
  })
}

/** Waiting questions first, then the newest answers. */
function ordered(answers: SavedAnswer[]): SavedAnswer[] {
  return [...answers].sort((a, b) =>
    Number(a.answer !== '') - Number(b.answer !== '') || b.seenAt.localeCompare(a.seenAt)
  )
}

/** Loads the list for one press. Call `save` when done; it writes only if something changed. */
export function openAnswers() {
  const bank = createAnswerBank(parseAnswers(readStoredAnswers()))

  return {
    bank,
    save() {
      if (bank.changed) writeStoredAnswers(bank.list())
    },
  }
}

function edit(change: (bank: ReturnType<typeof createAnswerBank>) => void): SavedAnswer[] {
  const { bank, save } = openAnswers()
  change(bank)
  save()
  return ordered(bank.list())
}

export const answerService = {
  list: (): SavedAnswer[] => ordered(openAnswers().bank.list()),
  save: (question: string, answer: string) => edit(bank => bank.set(question, answer)),
  remove: (question: string) => edit(bank => bank.remove(question)),
}

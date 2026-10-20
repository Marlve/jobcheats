import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Select } from './Select';

/**
 * Form questions Autofill has met, and what to answer each.
 *
 * Questions it could not answer wait at the top for you; the rest it learned
 * from what you entered in a form, or you typed here. An answer is used only
 * when a form asks the same question in the same words (case and punctuation
 * aside), so a saved answer cannot leak into a different question.
 */

function AnswerRow({
  entry,
  onSave,
  onDelete,
}: {
  entry: SavedAnswer;
  onSave: (question: string, answer: string) => void;
  onDelete: (question: string) => void;
}) {
  const [draft, setDraft] = useState(entry.answer);
  const canSave = draft.trim() !== '' && draft !== entry.answer;

  return (
    <li className="answers__row">
      <p className="t-label answers__question">{entry.question}</p>

      <div className="answers__control">
        {entry.options.length > 0
          ? (
            <Select
              value={draft}
              label={`Answer to ${entry.question}`}
              options={[
                { value: '', label: 'Choose…' },
                ...entry.options.filter(Boolean).map((option) => ({ value: option, label: option })),
              ]}
              onChange={setDraft}
            />
          )
          : (
            <input
              className="input"
              value={draft}
              aria-label={`Answer to ${entry.question}`}
              placeholder="Your answer"
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
      </div>

      <div className="answers__actions">
        <Button size="sm" disabled={!canSave} onClick={() => onSave(entry.question, draft)}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(entry.question)}>Remove</Button>
      </div>
    </li>
  );
}

export function AnswersCard() {
  const [answers, setAnswers] = useState<SavedAnswer[] | null>(null);

  useEffect(() => {
    void window.electron.listAnswers().then(setAnswers);
  }, []);

  if (!answers) return null;

  const waiting = answers.filter((entry) => entry.answer === '');
  const saved = answers.filter((entry) => entry.answer !== '');

  async function save(question: string, answer: string) {
    setAnswers(await window.electron.saveAnswer(question, answer));
  }

  async function remove(question: string) {
    setAnswers(await window.electron.deleteAnswer(question));
  }

  const rows = (list: SavedAnswer[]) => (
    <ul className="answers__list">
      {list.map((entry) => (
        <AnswerRow key={entry.question} entry={entry} onSave={save} onDelete={remove} />
      ))}
    </ul>
  );

  return (
    <section className="card">
      <h2 className="t-body scan__title">Saved answers</h2>
      <p className="t-caption t-muted profile__copy">
        Autofill remembers the questions forms ask. When one stops it, answer it here, or answer it
        in the form and press Autofill again — it keeps what you entered and fills the same
        question next time. Only the exact same question gets the answer.
      </p>

      {waiting.length > 0 && (
        <>
          <h3 className="t-overline answers__heading">Waiting for your answer · {waiting.length}</h3>
          {rows(waiting)}
        </>
      )}

      {saved.length > 0 && (
        <>
          <h3 className="t-overline answers__heading">Saved · {saved.length}</h3>
          {rows(saved)}
        </>
      )}

      {answers.length === 0 && (
        <p className="t-caption t-muted profile__copy">Nothing yet. Questions appear here once Autofill meets them.</p>
      )}
    </section>
  );
}

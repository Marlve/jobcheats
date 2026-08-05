import { useState } from 'react';
import { Button } from './Button';
import { IconPlus } from './Icons';

/** Matches MAX_KEYWORD_LENGTH in the main process validator. */
const MAX_KEYWORD_LENGTH = 60;

interface KeywordInputProps {
  /** Returns an error message to show, or null when the keyword was added. */
  onAdd: (keyword: string) => Promise<string | null> | string | null;
  placeholder?: string;
  label?: string;
}

/**
 * Adding a keyword by hand. The main process lowercases and trims everything,
 * so the value shown back is not always what was typed — that normalising is
 * why the field clears rather than keeping the draft around.
 */
export function KeywordInput({ onAdd, placeholder = 'Add a keyword…', label }: KeywordInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const value = draft.trim();
    if (!value || busy) return;

    setBusy(true);
    const message = await onAdd(value);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }

    setDraft('');
    setError(null);
  }

  return (
    <div className="keyword-add">
      <div className="keyword-add__row">
        <label className="input-icon">
          {label && <span className="sr-only">{label}</span>}
          <input
            className="input"
            value={draft}
            maxLength={MAX_KEYWORD_LENGTH}
            placeholder={placeholder}
            aria-label={label ?? 'Add a keyword'}
            aria-invalid={error ? true : undefined}
            onChange={(event) => { setDraft(event.target.value); setError(null); }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void submit(); }
            }}
          />
        </label>

        <Button size="sm" disabled={!draft.trim() || busy} onClick={() => void submit()}>
          <IconPlus size={14} />
          Add
        </Button>
      </div>

      {error && <p className="t-caption keyword-add__error" role="alert">{error}</p>}
    </div>
  );
}

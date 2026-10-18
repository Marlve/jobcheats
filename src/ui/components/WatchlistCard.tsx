import { useState } from 'react';
import { Button } from './Button';

const ATS_LABEL: Record<WatchAts, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
};

interface WatchlistCardProps {
  companies: WatchedCompany[];
  onChange: (companies: WatchedCompany[]) => void;
}

/**
 * Companies whose own job feed is read on every scan, next to the boards.
 *
 * A job board only shows what its search surfaces; a company's feed lists every
 * open role, which is how a company that never ranks in a search still gets
 * seen. The search term, locations and date above still decide what is kept.
 */
export function WatchlistCard({ companies, onChange }: WatchlistCardProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const link = draft.trim();
    if (!link || busy) return;

    setBusy(true);
    setError(null);
    const result = await window.electron.addToWatchlist(link);
    setBusy(false);

    if (result.ok) {
      onChange(result.companies);
      setDraft('');
    } else {
      setError(result.error);
    }
  }

  async function remove(id: string) {
    setError(null);
    onChange(await window.electron.removeFromWatchlist(id));
  }

  return (
    <div className="card">
      <h2 className="t-body scan__title">Company watchlist</h2>
      <p className="t-body t-secondary schedule__copy">
        Paste a company’s job board link and every scan also reads its open roles, kept only if
        they fit the search above. Works with Greenhouse, Lever and Ashby links, needs no sign-in,
        and reaches companies that never show up on LinkedIn.
      </p>

      <div className="schedule__row">
        <span className="chip-input chip-input--wide">
          <input
            value={draft}
            placeholder="boards.greenhouse.io/company"
            aria-label="Company job board link"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void add(); }
            }}
          />
        </span>
        <Button size="sm" disabled={!draft.trim() || busy} onClick={() => void add()}>
          {busy ? 'Checking…' : 'Add company'}
        </Button>
      </div>

      {error && <p className="t-caption schedule__error">{error}</p>}

      {companies.length > 0 && (
        <div className="locations">
          {companies.map((company) => (
            <span key={company.id} className="chip chip--sm">
              {company.name}
              <span className="t-caption t-muted">{ATS_LABEL[company.ats]}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`Remove ${company.name}`}
                onClick={() => void remove(company.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

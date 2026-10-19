import { formatDateTime } from '../format';

const DATE_LABEL: Record<DatePosted, string> = {
  '24h': 'Last 24h',
  week: 'This week',
  month: 'This month',
};

const TYPE_LABEL: Record<JobType, string> = {
  internship: 'Internship',
  'full-time': 'Full-time',
  'part-time': 'Part-time',
};

function describe(search: SearchParams): string {
  return [
    search.location.length ? search.location.join(', ') : 'anywhere',
    DATE_LABEL[search.datePosted ?? '24h'],
    TYPE_LABEL[search.jobType],
  ].join(' · ');
}

interface SearchHistoryProps {
  entries: SearchHistoryEntry[];
  /** Fill the form with this search. */
  onUse: (entry: SearchHistoryEntry) => void;
  onChange: (entries: SearchHistoryEntry[]) => void;
}

/** The searches you have run, newest first. Pressing one puts it back in the form. */
export function SearchHistory({ entries, onUse, onChange }: SearchHistoryProps) {
  if (!entries.length) return null;

  return (
    <div className="card">
      <div className="history__head">
        <h2 className="t-body scan__title">Recent searches</h2>
        <button
          type="button"
          className="link-btn"
          onClick={() => void window.electron.clearSearchHistory().then(onChange)}
        >
          Clear
        </button>
      </div>

      <ul className="history">
        {entries.map((entry) => (
          <li key={entry.id} className="history__row">
            <button
              type="button"
              className="history__use"
              onClick={() => onUse(entry)}
              title="Fill the search above with this"
            >
              <span className="t-label">{entry.search.keywords[0]}</span>
              <span className="t-caption t-secondary">{describe(entry.search)}</span>
              <span className="t-caption t-muted history__when">{formatDateTime(entry.lastRunAt)}</span>
            </button>
            <button
              type="button"
              className="chip__remove"
              aria-label={`Remove ${entry.search.keywords[0]} from history`}
              onClick={() => void window.electron.removeSearchHistory(entry.id).then(onChange)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

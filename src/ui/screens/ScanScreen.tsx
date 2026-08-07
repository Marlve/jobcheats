import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import {
  IconArrowRight,
  IconCross,
  IconPin,
  IconScan,
  IconSearch,
  IconStop,
  IconWarning,
} from '../components/Icons';
import { Select } from '../components/Select';
import { SOURCE_LABEL } from '../components/StatusPill';
import { formatDateTime } from '../format';
import './scan.css';

/**
 * The app is a daily tool and the inbox only keeps jobs for 7 days, so a month
 * of postings would mostly be listings that expire before you act on them.
 * 'month' is still a valid DatePosted for the scraper — it just isn't offered.
 */
const DATE_POSTED: { value: DatePosted; label: string }[] = [
  { value: '24h', label: 'Last 24h' },
  { value: 'week', label: 'This week' },
];

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'internship', label: 'Internship' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
];

const MAX_JOBS = [10, 25, 50].map((n) => ({ value: n, label: `Up to ${n} jobs` }));

/** "LinkedIn and Seek" — read as a sentence rather than comma-spliced. */
function joinNames(names: string[]): string {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const PHASE_LABEL: Record<ScrapePhase, string> = {
  starting: 'Starting up',
  authenticating: 'Signing in',
  searching: 'Running the search',
  scraping: 'Reading job pages',
  done: 'Finished',
  cancelled: 'Cancelled',
  error: 'Failed',
};

/** Rough share of the run each phase represents, for the progress bar. */
const PHASE_PROGRESS: Record<ScrapePhase, number> = {
  starting: 0.05,
  authenticating: 0.15,
  searching: 0.35,
  scraping: 0.75,
  done: 1,
  cancelled: 1,
  error: 1,
};

export function ScanScreen() {
  // One term per run. Several terms would be OR-joined into a single LinkedIn
  // query, which widens the search rather than running separate ones — the
  // broadest term then dominates a result set already capped and sorted by
  // date. Resume keywords still drive scoring; they just don't drive the query.
  const [term, setTerm] = useState('');
  const [draft, setDraft] = useState('');

  const [locations, setLocations] = useState<string[]>([]);
  const [locationDraft, setLocationDraft] = useState('');
  const [datePosted, setDatePosted] = useState<DatePosted>('24h');
  const [jobType, setJobType] = useState<JobType>('full-time');
  const [maxJobs, setMaxJobs] = useState(50);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScrapeProgress | null>(null);
  const [results, setResults] = useState<ScrapeResult[] | null>(null);
  const [runs, setRuns] = useState<ScrapeRun[]>([]);
  const [hasResume, setHasResume] = useState(true);
  const [keywordCount, setKeywordCount] = useState(0);
  // null until read, so the header does not flash "no boards" on the way in.
  const [boards, setBoards] = useState<BoardPreference[] | null>(null);

  // Boards are read on mount rather than held anywhere shared: this screen is
  // unmounted while you are in Settings, so coming back re-reads them.
  useEffect(() => {
    void (async () => {
      const [words, resume, history, boardList] = await Promise.all([
        window.electron.listKeywords(),
        window.electron.getResume(),
        window.electron.listRuns(8),
        window.electron.listBoards(),
      ]);
      setKeywordCount(words.filter((word) => word.enabled).length);
      setHasResume(Boolean(resume));
      setRuns(history);
      setBoards(boardList);
    })();
  }, []);

  // Progress arrives on a main-process channel; the unsubscribe must run on
  // unmount or a second visit to the tab stacks a duplicate listener.
  const unsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => {
    unsubscribe.current = window.electron.subscribeScrapeProgress(setProgress);
    return () => unsubscribe.current?.();
  }, []);

  async function run() {
    setRunning(true);
    setResults(null);
    setProgress(null);

    const outcome = await window.electron.scrapeAll({
      keywords: [term],
      location: locations,
      datePosted,
      jobType,
      maxJobs,
    });

    setResults(outcome);
    setRunning(false);
    setRuns(await window.electron.listRuns(8));
  }

  async function cancel() {
    await window.electron.cancelScrape();
  }

  function commitTerm(value: string) {
    const next = value.trim();
    if (!next) return;
    setTerm(next);
    setDraft('');
  }

  function addLocation() {
    const value = locationDraft.trim();
    if (!value) return;
    if (!locations.some((l) => l.toLowerCase() === value.toLowerCase())) {
      setLocations([...locations, value]);
    }
    setLocationDraft('');
  }

  function reset() {
    setTerm('');
    setDraft('');
    setLocations([]);
    setLocationDraft('');
    setDatePosted('24h');
    setJobType('full-time');
    setMaxJobs(50);
  }

  const dirty = Boolean(term) || locations.length > 0 || datePosted !== '24h'
    || jobType !== 'full-time' || maxJobs !== 50;

  const enabledBoards = (boards ?? []).filter((board) => board.enabled);
  const boardNames = enabledBoards.map((board) => SOURCE_LABEL[board.source]);
  const noBoards = boards !== null && enabledBoards.length === 0;

  const canRun = Boolean(term) && enabledBoards.length > 0 && !running;
  const inserted = results?.reduce((sum, r) => sum + (r.ok ? r.inserted : 0), 0) ?? 0;

  // Locations are the one input that does fan out — buildSearchUrls emits a
  // URL per location, each carrying the same query.
  const searchCount = Math.max(1, locations.length);

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Daily scan</h1>
          <p className="t-body t-secondary">
            {boardNames.length
              ? `${joinNames(boardNames)}, scored against your resume as jobs come in`
              : 'Scored against your resume as jobs come in'}
          </p>
        </div>

        <div className="screen__actions">
          {running
            ? <Button variant="danger" onClick={cancel}><IconStop size={14} /> Stop scan</Button>
            : <Button variant="primary" disabled={!canRun} onClick={run}><IconScan size={14} /> Run scan</Button>}
        </div>
      </header>

      <div className="screen__body">
        {noBoards && (
          <div className="banner">
            <span className="banner__icon"><IconWarning size={16} /></span>
            <p className="t-body">
              Every job board is turned off, so there is nothing for a scan to read. Turn one back
              on under Settings › Job boards.
            </p>
          </div>
        )}

        {!hasResume && (
          <div className="banner">
            <span className="banner__icon"><IconWarning size={16} /></span>
            <p className="t-body">
              No resume uploaded yet. Scans still run, but nothing can be scored until you add one.
            </p>
          </div>
        )}

        {/* ---------- live run ---------- */}
        {(running || progress) && (
          <div className="card run">
            <div className="run__head">
              <div>
                <p className="t-label run__phase">
                  {progress ? PHASE_LABEL[progress.phase] : 'Starting up'}
                  {progress?.boardCount ? ` · board ${progress.boardIndex ?? 1} of ${progress.boardCount}` : ''}
                </p>
                <p className="t-caption t-muted">
                  {progress?.source ? <span className="run__source">{SOURCE_LABEL[progress.source]}</span> : 'Preparing'}
                  {progress?.page ? ` · page ${progress.page}` : ''}
                  {progress?.message ? ` · ${progress.message}` : ''}
                </p>
              </div>
              {running && <span className="run__spinner" aria-hidden="true" />}
            </div>

            <div className="progress" role="progressbar" aria-valuetext={progress ? PHASE_LABEL[progress.phase] : 'Starting'}>
              <span
                className="progress__fill"
                style={{ width: `${(PHASE_PROGRESS[progress?.phase ?? 'starting']) * 100}%` }}
              />
            </div>

            <dl className="tally">
              <div><dt className="t-overline">Added</dt><dd className="t-body">{progress?.inserted ?? 0}</dd></div>
              <div><dt className="t-overline">Already seen</dt><dd className="t-body">{progress?.skipped ?? 0}</dd></div>
              <div><dt className="t-overline">Failed</dt><dd className="t-body">{progress?.failed ?? 0}</dd></div>
            </dl>
          </div>
        )}

        {/* ---------- last result ---------- */}
        {results && !running && (
          <div className="card">
            <h2 className="t-body run__done">
              {inserted > 0 ? `${inserted} new job${inserted === 1 ? '' : 's'} added` : 'No new jobs this time'}
            </h2>
            <ul className="result-list">
              {results.map((result) => (
                <li key={result.source} className="result">
                  <span className="run__source t-label">{SOURCE_LABEL[result.source]}</span>
                  {result.ok
                    ? (
                      <span className="t-caption t-secondary">
                        {result.inserted} added · {result.skipped} already seen · {result.failed} failed
                        {result.cancelled && ' · stopped early'}
                      </span>
                    )
                    : <span className="t-caption result__error">{result.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ---------- search ---------- */}
        <div className="card">
          <div className="search-hero">
            <span className="search-hero__icon"><IconSearch size={18} /></span>
            <input
              className="search-hero__input"
              value={draft}
              placeholder={term ? 'Replace the search term…' : 'Search by job title…'}
              aria-label="Search term"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); commitTerm(draft); }
              }}
            />
            <button
              type="button"
              className="search-hero__go"
              disabled={!draft.trim()}
              aria-label="Set search term"
              onClick={() => commitTerm(draft)}
            >
              <IconArrowRight size={16} />
            </button>
          </div>

          {term
            ? (
              <div className="query">
                <span className="query__label t-caption t-muted">Searching for</span>
                <span className="chip chip--query">
                  {term}
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label="Clear search term"
                    onClick={() => setTerm('')}
                  >
                    ×
                  </button>
                </span>
                <span className="t-caption t-muted">
                  {searchCount === 1
                    ? 'one search'
                    : `${searchCount} searches — one per location`}
                </span>
              </div>
            )
            : (
              <p className="t-caption t-muted scan__hint">
                One term per run. Several would be OR-joined into a single query, which
                widens the search instead of running separate ones.
              </p>
            )}

          <div className="filter-row">
            <Select
              variant="pill"
              value={jobType}
              options={JOB_TYPES}
              onChange={setJobType}
              label="Job type"
            />

            <Select
              variant="pill"
              value={datePosted}
              options={DATE_POSTED}
              onChange={setDatePosted}
              label="Posted within"
            />

            <Select
              variant="pill"
              value={maxJobs}
              options={MAX_JOBS}
              onChange={setMaxJobs}
              label="Maximum jobs per board"
            />

            <span className="chip-input">
              <IconPin size={15} />
              <input
                value={locationDraft}
                placeholder="Add location"
                aria-label="Add location"
                onChange={(event) => setLocationDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); addLocation(); }
                }}
              />
            </span>

            {dirty && (
              <button type="button" className="link-btn" onClick={reset}>Clear all</button>
            )}
          </div>

          {locations.length > 0 && (
            <div className="locations">
              {locations.map((location) => (
                <span key={location} className="chip chip--sm">
                  <IconPin size={13} />
                  {location}
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label={`Remove ${location}`}
                    onClick={() => setLocations(locations.filter((l) => l !== location))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {keywordCount > 0 && (
            <p className="t-caption t-muted scan__scored">
              Whatever comes back is scored against all {keywordCount} of your resume keywords —
              those affect ranking, not what gets searched.
            </p>
          )}
        </div>

        {/* ---------- history ---------- */}
        {runs.length > 0 && (
          <div className="card">
            <h2 className="t-body scan__title">Recent runs</h2>
            <ul className="run-history">
              {runs.map((entry) => (
                <li key={entry.id} className="run-row">
                  <span className="run-row__board t-label">{SOURCE_LABEL[entry.source]}</span>
                  <span className="run-row__when t-caption t-muted">
                    {formatDateTime(entry.startedAt)}
                  </span>

                  {entry.error
                    ? (
                      <span className="run-row__outcome run-row__error t-caption">
                        <IconCross size={12} /> {entry.error}
                      </span>
                    )
                    : (
                      <span className="run-row__outcome run-row__counts">
                        {/* Green means "this run found you something" — a run
                            that added nothing should not read as a win. */}
                        <span className={`stat${entry.inserted > 0 ? ' stat--add' : ' stat--none'}`}>
                          +{entry.inserted}
                        </span>
                        <span className="t-caption t-muted">{entry.skipped} seen</span>
                        {/* A few job pages failing mid-run is routine, not an
                            alarm — only a failed run itself gets the red mark. */}
                        {entry.failed > 0 && (
                          <span className="t-caption t-muted">{entry.failed} failed</span>
                        )}
                        {!entry.finishedAt && (
                          <span className="t-caption t-muted">didn’t finish</span>
                        )}
                      </span>
                    )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

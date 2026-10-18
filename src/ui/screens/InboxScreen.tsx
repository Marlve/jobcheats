import { useEffect, useMemo, useRef, useState } from 'react';
import { AutofillNote } from '../components/AutofillNote';
import { Button } from '../components/Button';
import { ScoreBadge } from '../components/ScoreBadge';
import { SOURCE_LABEL, StatusPill } from '../components/StatusPill';
import {
  IconBookmark,
  IconCheck,
  IconChevron,
  IconCross,
  IconDocument,
  IconExternal,
  IconSearch,
} from '../components/Icons';
import { Select } from '../components/Select';
import { Tooltip } from '../components/Tooltip';
import { VisaChip } from '../components/VisaChip';
import { daysUntil, formatDate } from '../format';
import './inbox.css';

/**
 * Inbox and Archive are the same list over a different slice of the database:
 * inbox holds new/rejected and expires after 7 days, archive holds saved/applied
 * and is kept forever. Splitting them into two components would duplicate every
 * filter and row action, so the view is a prop.
 */
export type JobListView = Extract<JobView, 'inbox' | 'archive'>;

const SORTS: { value: NonNullable<ListJobsOptions['sortBy']>; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'date', label: 'Newest' },
  { value: 'company', label: 'Company' },
];

const SOURCES: { value: JobSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All boards' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'seek', label: 'Seek' },
  { value: 'japandev', label: 'Japan Dev' },
  { value: 'watchlist', label: 'Watchlist' },
];

/** Filters on what a posting's wording says. Silent postings pass the first one. */
const VISA_FILTERS: { value: NonNullable<ListJobsOptions['visa']> | 'all'; label: string }[] = [
  { value: 'all', label: 'Any visa wording' },
  { value: 'not-restricted', label: 'Hide “needs work rights”' },
  { value: 'sponsors', label: 'Sponsors visas only' },
];

const MIN_SCORES = [
  { value: 0, label: 'Any score' },
  { value: 40, label: '40+' },
  { value: 60, label: '60+ (match)' },
  { value: 80, label: '80+' },
];

export function InboxScreen({ view }: { view: JobListView }) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [source, setSource] = useState<JobSource | 'all'>('all');
  const [minScore, setMinScore] = useState(0);
  const [visa, setVisa] = useState<NonNullable<ListJobsOptions['visa']> | 'all'>('all');
  const [sortBy, setSortBy] = useState<NonNullable<ListJobsOptions['sortBy']>>('score');
  const [expanded, setExpanded] = useState<number | null>(null);

  // Debounced so typing in the search box does not fire a query per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  const options = useMemo<ListJobsOptions>(() => ({
    view,
    sortBy,
    minScore: minScore || undefined,
    visa: visa === 'all' ? undefined : visa,
    source: source === 'all' ? undefined : source,
    search: debouncedSearch.trim() || undefined,
    limit: 200,
  }), [view, sortBy, minScore, visa, source, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const [rows, dbStats] = await Promise.all([
        window.electron.listJobs(options),
        window.electron.getDbStats(),
      ]);
      if (cancelled) return;
      setJobs(rows);
      setStats(dbStats);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [options]);

  async function setStatus(job: JobRow, status: JobStatus) {
    const next = job.status === status ? 'new' : status;
    await window.electron.updateJobStatus(job.id, next);

    // Acting on a job can move it out of the current view (saving promotes it to
    // the archive), so drop it from the list rather than showing a stale row.
    const stillHere = view === 'inbox' ? next === 'new' || next === 'rejected'
      : next === 'saved' || next === 'applied';

    setJobs((current) => stillHere
      ? current.map((row) => (row.id === job.id ? { ...row, status: next } : row))
      : current.filter((row) => row.id !== job.id));

    setStats(await window.electron.getDbStats());
  }

  const expiresIn = daysUntil(stats?.nextExpiryAt ?? null);
  const filtered = Boolean(debouncedSearch.trim()) || minScore > 0 || source !== 'all' || visa !== 'all';

  const copy = view === 'inbox'
    ? { title: 'Inbox', subtitle: `Jobs from the last ${stats?.retentionDays ?? 7} days, sorted by match score` }
    : { title: 'Archive', subtitle: 'Jobs you saved or applied to — kept indefinitely' };

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">{copy.title}</h1>
          <p className="t-body t-secondary">{copy.subtitle}</p>
        </div>

        {stats && (
          <div className="screen__actions">
            <Tooltip content={view === 'inbox' ? 'Jobs waiting in your inbox.' : 'Jobs you saved or applied to.'}>
              <span className="count-chip">
                {view === 'inbox' ? stats.inboxCount : stats.archiveCount} jobs
              </span>
            </Tooltip>
          </div>
        )}
      </header>

      <div className="screen__body">
        <div className="card card--flush toolbar">
          <span className="input-icon">
            <IconSearch size={16} />
            <input
              className="input"
              type="search"
              placeholder="Search title, company or description"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search jobs"
            />
          </span>

          <Select
            value={source}
            options={SOURCES}
            onChange={setSource}
            label="Job board"
          />

          <Select
            value={minScore}
            options={MIN_SCORES}
            onChange={setMinScore}
            label="Minimum match score"
          />

          <Select
            value={visa}
            options={VISA_FILTERS}
            onChange={setVisa}
            label="Visa wording"
          />

          <div className="segmented" role="group" aria-label="Sort by">
            {SORTS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={sortBy === item.value}
                onClick={() => setSortBy(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Retention is destructive and silent, so the inbox says so up front. */}
        {view === 'inbox' && expiresIn !== null && jobs.length > 0 && (
          <p className="t-caption t-muted retention-note">
            Unsaved jobs are deleted {stats?.retentionDays ?? 7} days after they are first seen —
            the oldest {expiresIn === 0 ? 'expire today' : `expire in ${expiresIn} day${expiresIn === 1 ? '' : 's'}`}.
            Saving or applying keeps a job forever.
          </p>
        )}

        {loading && <p className="t-body t-muted">Loading…</p>}

        {!loading && jobs.length === 0 && (
          <div className="placeholder">
            <p className="t-title">{filtered ? 'No jobs match those filters' : `Nothing in your ${view}`}</p>
            <p className="t-body t-secondary">
              {filtered
                ? 'Widen the score range or clear the search to see more.'
                : view === 'inbox'
                  ? 'Run a daily scan to pull jobs from LinkedIn and Seek, scored against your resume.'
                  : 'Jobs you save or mark as applied are kept here permanently.'}
            </p>
          </div>
        )}

        {!loading && jobs.length > 0 && (
          <ul className="job-list">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                open={expanded === job.id}
                onToggle={() => setExpanded(expanded === job.id ? null : job.id)}
                onStatus={setStatus}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function JobCard({
  job,
  open,
  onToggle,
  onStatus,
}: {
  job: JobRow;
  open: boolean;
  onToggle: () => void;
  onStatus: (job: JobRow, status: JobStatus) => void;
}) {
  const [notes, setNotes] = useState(job.notes ?? '');
  const saveTimer = useRef<number | null>(null);
  const [filling, setFilling] = useState(false);
  const [autofill, setAutofill] = useState<AutofillResult | null>(null);

  async function runAutofill() {
    if (!job.url) return;
    setFilling(true);
    setAutofill(await window.electron.autofill(job.url));
    setFilling(false);
  }

  // Notes save on a debounce rather than behind a button — there is no draft
  // state worth losing, and an explicit save is one more thing to forget.
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  function onNotes(value: string) {
    setNotes(value);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void window.electron.setJobNotes(job.id, value);
    }, 500);
  }

  const meta = [job.company, job.location, job.workType].filter(Boolean).join(' · ');

  return (
    <li className={`card job${open ? ' job--open' : ''}`}>
      <div className="job__head">
        <ScoreBadge score={job.matchScore} size="lg" />

        <button type="button" className="job__main" onClick={onToggle} aria-expanded={open}>
          <p className="t-body job__title">{job.title}</p>
          <p className="t-caption t-secondary">{meta}</p>
        </button>

        <div className="job__side">
          <StatusPill status={job.status} />
          <span className={`job__chevron${open ? ' job__chevron--open' : ''}`} aria-hidden="true">
            <IconChevron size={16} />
          </span>
        </div>
      </div>

      <div className="job__facts t-caption t-muted">
        <span className="job__source">{SOURCE_LABEL[job.source]}</span>
        <VisaChip kind={job.visa} evidence={job.visaEvidence} />
        {job.salary && <span>{job.salary}</span>}
        {job.postedAt && <span>Posted {formatDate(job.postedAt)}</span>}
        <span>Seen {formatDate(job.firstSeenAt)}</span>
      </div>

      {job.matchedKeywords.length > 0 && (
        <div className="job__keywords">
          {job.matchedKeywords.slice(0, open ? undefined : 6).map((keyword) => (
            <span key={keyword} className="chip chip--sm">{keyword}</span>
          ))}
          {!open && job.matchedKeywords.length > 6 && (
            <span className="chip chip--sm chip--static">+{job.matchedKeywords.length - 6}</span>
          )}
        </div>
      )}

      {open && (
        <div className="job__body">
          {job.aboutText && <p className="t-body t-secondary job__about">{job.aboutText}</p>}

          <label className="field">
            <span className="t-overline">Your notes</span>
            <textarea
              className="textarea"
              value={notes}
              placeholder="Why this one — or why not."
              onChange={(event) => onNotes(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className="job__actions">
        <Button
          size="sm"
          variant={job.status === 'saved' ? 'primary' : 'secondary'}
          onClick={() => onStatus(job, 'saved')}
        >
          <IconBookmark size={14} />
          {job.status === 'saved' ? 'Saved' : 'Save'}
        </Button>

        <Button
          size="sm"
          variant={job.status === 'applied' ? 'primary' : 'secondary'}
          onClick={() => onStatus(job, 'applied')}
        >
          <IconCheck size={14} />
          {job.status === 'applied' ? 'Applied' : 'Mark applied'}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => onStatus(job, 'rejected')}
        >
          <IconCross size={14} />
          {job.status === 'rejected' ? 'Rejected' : 'Not for me'}
        </Button>

        {job.url && (
          <Button size="sm" disabled={filling} onClick={runAutofill}>
            <IconDocument size={14} />
            {filling ? 'Working…' : 'Autofill'}
          </Button>
        )}

        {job.url && (
          <a className="btn btn--ghost btn--sm job__open" href={job.url} target="_blank" rel="noreferrer">
            <IconExternal size={14} />
            Open
          </a>
        )}
      </div>

      {autofill && <AutofillNote result={autofill} />}
    </li>
  );
}

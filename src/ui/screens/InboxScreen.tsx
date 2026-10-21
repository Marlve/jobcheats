import { useEffect, useMemo, useRef, useState } from 'react';
import { AutofillNote } from '../components/AutofillNote';
import { BulkBar } from '../components/BulkBar';
import { Button } from '../components/Button';
import { ScoreBadge } from '../components/ScoreBadge';
import { SOURCE_LABEL, StatusPill } from '../components/StatusPill';
import {
  IconBookmark,
  IconCheck,
  IconCross,
  IconDocument,
  IconExternal,
  IconSearch,
} from '../components/Icons';
import { Select } from '../components/Select';
import { Tooltip } from '../components/Tooltip';
import { ExperienceChip } from '../components/ExperienceChip';
import { VisaChip } from '../components/VisaChip';
import { daysUntil, formatDate } from '../format';
import { applyQueue, useApplyQueue } from '../applyQueue';
import './inbox.css';

/**
 * Inbox and Archive are the same list over a different slice of the database:
 * inbox holds new jobs and expires after 7 days, archive holds saved/applied
 * and is kept forever. A removed job (Not for me) is in neither. Splitting them into two components would duplicate every
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
];

/**
 * How far along an application is. These are the stages after you apply, in the
 * order they usually happen; the pipeline diagram branches on them.
 */
const STAGES: { value: JobStatus; label: string }[] = [
  { value: 'applied', label: 'Applied' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'turned_down', label: 'Turned down' },
  { value: 'withdrawn', label: 'Withdrew' },
];

const IN_PIPELINE = new Set<JobStatus>(STAGES.map((stage) => stage.value));

/** The archive can be narrowed to one stage; the inbox has none. */
const STAGE_FILTERS: { value: JobStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All stages' },
  { value: 'saved', label: 'Saved' },
  ...STAGES,
];

/** Filters on what a posting's wording says. Silent postings pass the first one. */
const VISA_FILTERS: { value: NonNullable<ListJobsOptions['visa']> | 'all'; label: string }[] = [
  { value: 'all', label: 'Any visa wording' },
  { value: 'not-restricted', label: 'Hide “needs work rights”' },
  { value: 'sponsors', label: 'Sponsors visas only' },
];

type ExperienceFilter = NonNullable<ListJobsOptions['experience']> | 'all';

/** Filters on how senior a posting is. Postings that state no years pass all of them. */
const EXPERIENCE_FILTERS: { value: ExperienceFilter; label: string }[] = [
  { value: 'all', label: 'Any experience' },
  { value: 'not-senior', label: 'Hide senior titles' },
  { value: 'junior', label: 'Hide senior and 3+ years' },
  { value: 'entry', label: 'Entry level (hide 2+ years)' },
];

const EXPERIENCE_KEY = 'inbox.experience';

/** The last choice, so the filter does not have to be set again each time the inbox opens. */
function loadExperience(): ExperienceFilter {
  try {
    const saved = window.localStorage.getItem(EXPERIENCE_KEY);
    return EXPERIENCE_FILTERS.find((item) => item.value === saved)?.value ?? 'all';
  } catch {
    return 'all';
  }
}

/** Matched keywords shown on a card; the rest are counted. */
const MAX_KEYWORDS = 6;

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
  const [experience, setExperience] = useState<ExperienceFilter>(loadExperience);
  const [stage, setStage] = useState<JobStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<NonNullable<ListJobsOptions['sortBy']>>('score');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const lastPicked = useRef<number | null>(null);
  const queue = useApplyQueue();

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
    // Saved and applied jobs were picked by hand, so the archive is never trimmed.
    experience: view === 'inbox' && experience !== 'all' ? experience : undefined,
    source: source === 'all' ? undefined : source,
    status: view === 'archive' && stage !== 'all' ? stage : undefined,
    search: debouncedSearch.trim() || undefined,
    limit: 200,
  }), [view, sortBy, minScore, visa, experience, source, stage, debouncedSearch]);

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
    // the archive, "Not for me" hides it everywhere), so drop it from the list
    // rather than showing a stale row.
    const inInbox = next === 'new';
    const stillHere = next !== 'rejected'
      && (view === 'inbox' ? inInbox : !inInbox)
      && (view !== 'archive' || stage === 'all' || stage === next);

    setJobs((current) => stillHere
      ? current.map((row) => (row.id === job.id ? { ...row, status: next } : row))
      : current.filter((row) => row.id !== job.id));

    setStats(await window.electron.getDbStats());
  }

  // Jobs the queue marks applied leave the list, as they do when marked by hand.
  const appliedCount = queue?.applied.length ?? 0;
  useEffect(() => {
    if (appliedCount === 0 || view !== 'inbox') return;
    const done = new Set(queue?.applied);
    setJobs((current) => current.filter((row) => !done.has(row.id)));
    void window.electron.getDbStats().then(setStats);
  }, [appliedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only jobs on screen count: a ticked job that a filter then hides is never acted on.
  const selected = useMemo(() => jobs.filter((job) => picked.has(job.id)), [jobs, picked]);
  const appliable = selected.filter((job) => job.url);

  /** Shift-click ticks (or unticks) everything between this row and the last one clicked. */
  function pick(job: JobRow, range: boolean) {
    const on = !picked.has(job.id);
    const from = jobs.findIndex((row) => row.id === lastPicked.current);
    const to = jobs.findIndex((row) => row.id === job.id);
    const rows = range && from !== -1 ? jobs.slice(Math.min(from, to), Math.max(from, to) + 1) : [job];

    setPicked((current) => {
      const next = new Set(current);
      rows.forEach((row) => (on ? next.add(row.id) : next.delete(row.id)));
      return next;
    });
    lastPicked.current = job.id;
  }

  async function rejectSelected() {
    const ids = new Set(selected.map((job) => job.id));
    await Promise.all([...ids].map((id) => window.electron.updateJobStatus(id, 'rejected')));

    setJobs((current) => current.filter((row) => !ids.has(row.id)));
    setPicked(new Set());
    setStats(await window.electron.getDbStats());
  }

  function changeExperience(next: ExperienceFilter) {
    setExperience(next);
    try {
      window.localStorage.setItem(EXPERIENCE_KEY, next);
    } catch {
      // Not remembered, but the filter still applies for this session.
    }
  }

  const expiresIn = daysUntil(stats?.nextExpiryAt ?? null);
  const filtered = Boolean(debouncedSearch.trim()) || minScore > 0 || source !== 'all' || visa !== 'all' || (view === 'inbox' && experience !== 'all') || stage !== 'all';

  const copy = view === 'inbox'
    ? { title: 'Inbox', subtitle: `Jobs from the last ${stats?.retentionDays ?? 7} days, sorted by match score` }
    : { title: 'Archive', subtitle: 'Jobs you saved or applied to, and how each one went — kept indefinitely' };

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">{copy.title}</h1>
          <p className="t-body t-secondary">{copy.subtitle}</p>
        </div>

        {stats && (
          <div className="screen__actions">
            <Tooltip content={view === 'inbox' ? 'Jobs waiting in your inbox.' : 'Jobs you saved or are following up on.'}>
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

          {view === 'inbox' && (
            <Select
              value={experience}
              options={EXPERIENCE_FILTERS}
              onChange={changeExperience}
              label="Experience wanted"
            />
          )}

          {view === 'archive' && (
            <Select
              value={stage}
              options={STAGE_FILTERS}
              onChange={setStage}
              label="Stage"
            />
          )}

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

        {view === 'inbox' && !queue && jobs.length > 0 && (
          <BulkBar
            selected={selected.length}
            shown={jobs.length}
            appliable={appliable.length}
            onSelectAll={() => setPicked(new Set(jobs.map((job) => job.id)))}
            onClear={() => setPicked(new Set())}
            onReject={() => void rejectSelected()}
            onApply={() => { applyQueue.start(appliable); setPicked(new Set()); }}
          />
        )}

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
                ? 'Widen the score range, relax a filter or clear the search to see more.'
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
                onStatus={setStatus}
                ticked={view === 'inbox' ? picked.has(job.id) : undefined}
                onPick={pick}
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
  onStatus,
  ticked,
  onPick,
}: {
  job: JobRow;
  onStatus: (job: JobRow, status: JobStatus) => void;
  /** Whether the row is ticked; undefined where rows cannot be ticked (the archive). */
  ticked?: boolean;
  onPick: (job: JobRow, range: boolean) => void;
}) {
  const [filling, setFilling] = useState(false);
  const [autofill, setAutofill] = useState<AutofillResult | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function runAutofill() {
    if (!job.url) return;
    setFilling(true);
    setAutofill(await window.electron.autofill(job.url));
    setFilling(false);
  }

  const meta = [job.company, job.location, job.workType].filter(Boolean).join(' · ');
  const inPipeline = IN_PIPELINE.has(job.status);

  return (
    <li className={`card job${ticked !== undefined ? ' job--pickable' : ''}`}>
      <div className="job__head">
        {ticked !== undefined && (
          <input
            type="checkbox"
            className="job__pick"
            checked={ticked}
            onChange={() => {}}
            onClick={(event) => onPick(job, event.shiftKey)}
            aria-label={`Select ${job.title}`}
          />
        )}

        <ScoreBadge score={job.matchScore} size="lg" />

        <div className="job__main">
          <p className="t-body job__title">{job.title}</p>
          <p className="t-caption t-secondary">{meta}</p>
        </div>

        <StatusPill status={job.status} />
      </div>

      <div className="job__facts t-caption t-muted">
        <span>{SOURCE_LABEL[job.source] ?? job.source}</span>
        {job.salary && <span>{job.salary}</span>}
        {job.postedAt && <span>Posted {formatDate(job.postedAt)}</span>}
        <span>Seen {formatDate(job.firstSeenAt)}</span>
      </div>

      <div className="job__tags">
        <VisaChip kind={job.visa} evidence={job.visaEvidence} />
        <ExperienceChip senior={job.senior} minYears={job.minYears} evidence={job.experienceEvidence} />
        {job.matchedKeywords.slice(0, MAX_KEYWORDS).map((keyword) => (
          <span key={keyword} className="tag">{keyword}</span>
        ))}
        {job.matchedKeywords.length > MAX_KEYWORDS && (
          <span className="tag tag--more">+{job.matchedKeywords.length - MAX_KEYWORDS}</span>
        )}
      </div>

      <div className="job__actions">
        {/* Once you are past applying, the stage is the one thing to change. */}
        {!inPipeline && (
          <>
            <Button
              size="sm"
              variant={job.status === 'saved' ? 'primary' : 'secondary'}
              onClick={() => onStatus(job, 'saved')}
            >
              <IconBookmark size={14} />
              {job.status === 'saved' ? 'Saved' : 'Save'}
            </Button>

            <Button size="sm" variant="secondary" onClick={() => onStatus(job, 'applied')}>
              <IconCheck size={14} />
              Mark applied
            </Button>

            <Button size="sm" variant="ghost" onClick={() => onStatus(job, 'rejected')}>
              <IconCross size={14} />
              Not for me
            </Button>
          </>
        )}

        {inPipeline && (
          <Select
            variant="pill"
            value={job.status}
            options={STAGES}
            label="Stage"
            onChange={(next) => { if (next !== job.status) onStatus(job, next); }}
          />
        )}

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

        {/* An archived job is a record of something you did, so removing it takes a second press. */}
        {job.status !== 'new' && (
          <Button
            size="sm"
            variant={confirmingRemove ? 'danger-solid' : 'ghost'}
            onClick={() => (confirmingRemove ? onStatus(job, 'rejected') : setConfirmingRemove(true))}
            onBlur={() => setConfirmingRemove(false)}
          >
            <IconCross size={14} />
            {confirmingRemove ? 'Remove for good?' : 'Remove'}
          </Button>
        )}
      </div>

      {autofill && <AutofillNote result={autofill} />}
    </li>
  );
}

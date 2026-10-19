import { useEffect, useState } from 'react';
import { Button } from './Button';
import { Select } from './Select';

/** On the hour only — a daily scan has no use for finer than that. */
const HOURS = Array.from({ length: 24 }, (_, hour) => ({
  value: `${String(hour).padStart(2, '0')}:00`,
  label: new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
}));

const DEFAULT_TIME = '08:00';

function describeSearch(search: SearchParams): string {
  const where = search.location.length ? search.location.join(', ') : 'anywhere';
  return `${search.keywords.join(', ')} · ${where} · ${search.jobType}`;
}

interface ScheduleCardProps {
  /** What is on the Scan screen right now, or null while there is no search term. */
  search: SearchParams | null;
}

/**
 * Runs the search above by itself every day, via a Windows scheduled task.
 *
 * The saved schedule is a snapshot, not a link to the form: editing the search
 * afterwards changes nothing until "Use current search" is pressed. Following
 * the form live would mean a half-typed query could be what runs at 8am.
 */
export function ScheduleCard({ search }: ScheduleCardProps) {
  const [status, setStatus] = useState<ScheduleStatus | null>(null);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.electron.getSchedule().then((current) => {
      setStatus(current);
      if (current.config) setTime(current.config.time);
    });
  }, []);

  // The main process answers with where things ended up, including when Windows
  // refused — so the result is applied as-is rather than assumed.
  async function apply(request: Promise<ScheduleStatus>) {
    setBusy(true);
    const result = await request;
    setStatus(result);
    if (result.config) setTime(result.config.time);
    setBusy(false);
  }

  if (!status) return null;

  const { config } = status;
  const timeLabel = HOURS.find((hour) => hour.value === (config?.time ?? time))?.label ?? time;

  function changeTime(next: string) {
    setTime(next);
    if (config) void apply(window.electron.saveSchedule({ time: next, search: config.search }));
  }

  return (
    <div className="card">
      <h2 className="t-body scan__title">Scheduled scan</h2>

      {!status.supported && (
        <p className="t-caption t-muted schedule__copy">{status.unsupportedReason}</p>
      )}

      {status.supported && !config && (
        <>
          <p className="t-body t-secondary schedule__copy">
            Run this search by itself every day, even when JobCheats is closed. It only runs while
            you are signed in to Windows.
          </p>
          <div className="schedule__row">
            <Select variant="pill" value={time} options={HOURS} onChange={changeTime} label="Time of day" />
            <Button
              variant="primary"
              size="sm"
              disabled={!search || busy}
              onClick={() => search && void apply(window.electron.saveSchedule({ time, search }))}
            >
              Schedule this search
            </Button>
            {!search && <span className="t-caption t-muted">Set a search term first.</span>}
          </div>
        </>
      )}

      {status.supported && config && (
        <>
          <p className="t-body schedule__copy">
            Every day at {timeLabel} · <span className="t-secondary">{describeSearch(config.search)}</span>
          </p>

          {!status.taskInstalled && (
            <p className="t-caption schedule__error">
              Windows no longer has this task, so nothing will run.{' '}
              <button
                type="button"
                className="link-btn"
                disabled={busy}
                onClick={() => void apply(window.electron.saveSchedule(config))}
              >
                Put it back
              </button>
            </p>
          )}

          <div className="schedule__row">
            <Select variant="pill" value={time} options={HOURS} onChange={changeTime} label="Time of day" />
            <Button
              size="sm"
              disabled={!search || busy}
              onClick={() => search && void apply(window.electron.saveSchedule({ time: config.time, search }))}
            >
              Use current search
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void apply(window.electron.clearSchedule())}>
              Turn off
            </Button>
          </div>

          <p className="t-caption t-muted schedule__copy">
            If LinkedIn has signed you out, the scan stops and says so under Recent runs. Press
            Sign in under Settings › Job boards to fix it.
          </p>
        </>
      )}

      {status.error && <p className="t-caption schedule__error">{status.error}</p>}
    </div>
  );
}

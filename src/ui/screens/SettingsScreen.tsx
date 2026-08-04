import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { IconDocument, IconLock, IconWarning } from '../components/Icons';
import { daysUntil, formatBytes, formatDateTime } from '../format';
import './settings.css';

/**
 * The screen for everything that is about the app rather than about a job:
 * how much is stored, when it gets swept, and how to get your resume back off
 * this machine.
 *
 * Nothing here is a preference. Retention and the per-scan cap are product
 * decisions that several layers of the main process agree on (config.ts), so
 * they are reported as facts rather than offered as settings — a slider that
 * silently disagreed with the scraper would be worse than no slider.
 */
const DATE_POSTED_LABEL: Record<DatePosted, string> = {
  '24h': 'the last 24 hours',
  week: 'the last week',
  month: 'the last month',
};

export function SettingsScreen() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [keywordCount, setKeywordCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Outcome of the last action, shown until the next one replaces it. */
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      // The config never changes at runtime, so it is fetched once here rather
      // than on every refresh().
      setConfig(await window.electron.getAppConfig());
      await refresh();
      setLoading(false);
    })();
  }, []);

  async function refresh() {
    const [dbStats, meta, keywords] = await Promise.all([
      window.electron.getDbStats(),
      window.electron.getResume(),
      window.electron.listKeywords(),
    ]);
    setStats(dbStats);
    setResume(meta);
    setKeywordCount(keywords.length);
  }

  /**
   * The same sweep that runs on launch and after every scan. Exposed here
   * because retention is silent and destructive — being able to trigger it and
   * see the count makes it something you can verify rather than trust.
   */
  async function runCleanup() {
    setBusy(true);
    const deleted = await window.electron.pruneOldJobs();
    await refresh();
    setBusy(false);
    setNotice(
      deleted === 0
        ? 'Nothing was old enough to delete.'
        : `Deleted ${deleted} expired job${deleted === 1 ? '' : 's'}.`
    );
  }

  async function deleteResume() {
    setBusy(true);
    setConfirmingDelete(false);
    await window.electron.deleteResume();
    await refresh();
    setBusy(false);
    setNotice('Resume deleted. Auto-extracted keywords went with it; yours were kept.');
  }

  const expiresIn = daysUntil(stats?.nextExpiryAt ?? null);

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Settings</h1>
          <p className="t-body t-secondary">Retention, scan limits and database</p>
        </div>
      </header>

      <div className="screen__body">
        {loading && <p className="t-body t-muted">Loading…</p>}

        {!loading && stats && config && (
          <>
            {notice && <p className="t-body t-secondary notice" role="status">{notice}</p>}

            {/* ---------- storage ---------- */}
            <section className="card">
              <h2 className="t-body settings__title">What is stored</h2>
              <p className="t-caption t-muted">
                One SQLite file in your app data folder — nothing is sent anywhere.
              </p>

              <dl className="stat-grid">
                <div>
                  <dt className="t-overline">Inbox</dt>
                  <dd className="stat-grid__value">{stats.inboxCount}</dd>
                  <dd className="t-caption t-muted">expires after {stats.retentionDays} days</dd>
                </div>
                <div>
                  <dt className="t-overline">Archive</dt>
                  <dd className="stat-grid__value">{stats.archiveCount}</dd>
                  <dd className="t-caption t-muted">kept indefinitely</dd>
                </div>
                <div>
                  <dt className="t-overline">Total jobs</dt>
                  <dd className="stat-grid__value">{stats.totalCount}</dd>
                  <dd className="t-caption t-muted">
                    {stats.oldestFirstSeenAt
                      ? `oldest seen ${formatDateTime(stats.oldestFirstSeenAt)}`
                      : 'nothing scraped yet'}
                  </dd>
                </div>
                <div>
                  <dt className="t-overline">Database</dt>
                  <dd className="stat-grid__value">{formatBytes(stats.databaseBytes)}</dd>
                  <dd className="t-caption t-muted">on disk</dd>
                </div>
              </dl>
            </section>

            {/* ---------- retention ---------- */}
            <section className="card">
              <h2 className="t-body settings__title">Retention</h2>
              <p className="t-body t-secondary settings__copy">
                Jobs you have not acted on are deleted {stats.retentionDays} days after they are
                first seen. Saving a job or marking it applied moves it to the archive, which is
                exempt — losing your application history would be worse than an unbounded table.
              </p>

              <div className="settings__row">
                <p className="t-caption t-muted">
                  {expiresIn === null
                    ? 'Nothing is currently scheduled to expire.'
                    : expiresIn === 0
                      ? 'The oldest inbox jobs expire today.'
                      : `The oldest inbox jobs expire in ${expiresIn} day${expiresIn === 1 ? '' : 's'}.`}
                  {' '}The sweep also runs on launch and after every scan.
                </p>
                <Button size="sm" disabled={busy} onClick={runCleanup}>Run cleanup now</Button>
              </div>
            </section>

            {/* ---------- scan limits ---------- */}
            <section className="card">
              <h2 className="t-body settings__title">Scan limits</h2>
              <p className="t-body t-secondary settings__copy">
                A scan stops at {config.maxJobsPerBoard} jobs per board and defaults to postings
                from {DATE_POSTED_LABEL[config.defaultDatePosted]}. The cap bounds how long a run
                holds the browser open, so it is a ceiling rather than a preference — the per-run
                controls on the Daily scan tab can only go lower.
              </p>
              <p className="t-caption t-muted settings__copy">
                Jobs scoring {config.matchThreshold} or above count as strong matches. Resumes are
                accepted up to {formatBytes(config.maxResumeBytes)}.
              </p>
            </section>

            {/* ---------- your data ---------- */}
            <section className="card">
              <h2 className="t-body settings__title">Your data</h2>

              {resume
                ? (
                  <div className="settings__file">
                    <span className="settings__file-icon"><IconDocument size={16} /></span>
                    <div className="settings__file-main">
                      <p className="t-label">{resume.filename}</p>
                      <p className="t-caption t-muted">
                        {formatBytes(resume.bytes)} · uploaded {formatDateTime(resume.uploadedAt)} ·
                        {' '}{keywordCount} keyword{keywordCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Delete resume
                    </Button>
                  </div>
                )
                : (
                  <p className="t-body t-muted">
                    No resume stored. Upload one from the Resume tab to start scoring jobs.
                  </p>
                )}

              <p className="t-caption t-muted settings__privacy">
                <IconLock size={13} />
                Your resume, its text and your LinkedIn session live only on this device. There is
                no account and no telemetry.
              </p>
            </section>
          </>
        )}
      </div>

      {confirmingDelete && resume && (
        <div className="modal__scrim" role="presentation" onClick={() => setConfirmingDelete(false)}>
          <div
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-resume-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="settings__confirm-head">
              <span className="settings__warn"><IconWarning size={18} /></span>
              <div>
                <h2 id="delete-resume-title" className="t-title">Delete your resume?</h2>
                <p className="t-body settings__danger">This is permanent and cannot be undone.</p>
              </div>
            </div>

            <p className="t-body t-secondary settings__copy">
              <strong>{resume.filename}</strong> is removed from disk along with its extracted text
              and auto-extracted keywords. Keywords you added by hand are kept, and your stored jobs
              stay — but with no keywords left to match against, every score is cleared.
            </p>

            <div className="settings__confirm-actions">
              <Button onClick={() => setConfirmingDelete(false)}>Keep it</Button>
              <Button variant="danger-solid" onClick={deleteResume}>Delete resume</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

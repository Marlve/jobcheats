import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { IconDocument, IconLock, IconWarning } from '../components/Icons';
import { SOURCE_LABEL } from '../components/StatusPill';
import { Toggle } from '../components/Toggle';
import { daysUntil, formatBytes, formatDateTime } from '../format';
import './settings.css';

/**
 * The screen for everything that is about the app rather than about a job:
 * which boards it reads, how much it stores, when that gets swept, and how to
 * get your resume back off this machine.
 *
 * Only the board switches are a preference. Retention and the per-scan cap are
 * product decisions that several layers of the main process agree on
 * (config.ts), so they are reported as facts rather than offered as settings —
 * a slider that silently disagreed with the scraper would be worse than no
 * slider.
 */
const DATE_POSTED_LABEL: Record<DatePosted, string> = {
  '24h': 'the last 24 hours',
  week: 'the last week',
  month: 'the last month',
};

/**
 * The one line under the version number.
 *
 * "Never checked" is kept apart from "the check failed" — a fresh install that
 * has not been online yet has nothing wrong with it, and saying so would send
 * someone looking for a problem they do not have.
 */
function describeUpdate(update: UpdateStatus): string {
  const when = update.checkedAt ? ` · checked ${formatDateTime(update.checkedAt)}` : '';

  switch (update.state) {
    case 'available':
      return `Version ${update.latestVersion} is available${when}`;
    case 'current':
      return `Up to date${when}`;
    case 'failed':
      return update.error ?? 'The last check did not go through.';
    default:
      return update.autoCheck ? 'Not checked yet' : 'Checking on launch is turned off';
  }
}

/** What turning each board on actually gets you, and what it costs. */
const BOARD_NOTE: Record<BoardSource, string> = {
  linkedin: 'Signs in as you, in a browser window this app drives. The session stays on this device.',
  seek: 'Scans work without an account; sign in so Autofill can apply as you. Sign-in opens a normal browser window, Google sign-in included. Newly added, so expect rough edges.',
  japandev: 'English-speaking tech jobs in Japan, and each one says whether it sponsors a visa from overseas. Reads its 60 newest postings, about three weeks. No sign-in, no browser window.',
};

/**
 * Which boards have somewhere to sign in. A Record so a new board cannot be
 * added without deciding — the main process holds the actual URLs.
 */
const HAS_SIGN_IN: Record<BoardSource, boolean> = {
  linkedin: true,
  seek: true,
  japandev: false,
};

export function SettingsScreen() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [boards, setBoards] = useState<BoardPreference[]>([]);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [coverLetters, setCoverLetters] = useState(false);
  const [keywordCount, setKeywordCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Outcome of the last action, shown until the next one replaces it. */
  const [notice, setNotice] = useState<string | null>(null);
  /** The board whose sign-in window is open. The call stays pending until it closes. */
  const [signingIn, setSigningIn] = useState<BoardSource | null>(null);

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
    const [dbStats, meta, keywords, boardList, letters, updateStatus] = await Promise.all([
      window.electron.getDbStats(),
      window.electron.getResume(),
      window.electron.listKeywords(),
      window.electron.listBoards(),
      window.electron.getCoverLetterEnabled(),
      // The stored answer, not a fresh request — opening Settings should not
      // spend one of the hourly checks GitHub allows.
      window.electron.getUpdateStatus(),
    ]);
    setStats(dbStats);
    setResume(meta);
    setKeywordCount(keywords.length);
    setBoards(boardList);
    setCoverLetters(letters);
    setUpdate(updateStatus);
  }

  async function checkForUpdates() {
    setCheckingUpdate(true);
    setUpdate(await window.electron.checkForUpdates());
    setCheckingUpdate(false);
  }

  async function toggleCoverLetters(enabled: boolean) {
    setCoverLetters(await window.electron.setCoverLetterEnabled(enabled));
  }

  async function toggleAutoCheck(enabled: boolean) {
    setUpdate(await window.electron.setUpdateAutoCheck(enabled));
  }

  /**
   * The main process decides the outcome, not the click. It refuses to turn off
   * the last enabled board, so the list it returns is applied as-is rather than
   * the state being flipped optimistically and then corrected.
   */
  async function toggleBoard(source: BoardSource, enabled: boolean) {
    setBoards(await window.electron.setBoardEnabled(source, enabled));
    setNotice(null);
  }

  /**
   * "ok" only says the window was opened and has been closed — nothing here can
   * tell whether anyone actually signed in, so the notice does not claim it.
   */
  async function signIn(source: BoardSource) {
    setSigningIn(source);
    setNotice(null);
    const result = await window.electron.signIn(source);
    setSigningIn(null);
    setNotice(
      result.ok
        ? 'The sign-in window was closed. If you finished signing in, scans will use that session.'
        : result.error
    );
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

  async function clearInbox() {
    setBusy(true);
    setConfirmingClear(false);
    const deleted = await window.electron.deleteInboxJobs();
    await refresh();
    setBusy(false);
    setNotice(
      deleted === 0
        ? 'The inbox was already empty.'
        : `Deleted ${deleted} inbox job${deleted === 1 ? '' : 's'}. Saved and applied jobs were kept.`
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
  const enabledBoardCount = boards.filter((board) => board.enabled).length;

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Settings</h1>
          <p className="t-body t-secondary">Job boards, retention and storage</p>
        </div>
      </header>

      <div className="screen__body">
        {loading && <p className="t-body t-muted">Loading…</p>}

        {!loading && stats && config && (
          <>
            {notice && <p className="t-body t-secondary notice" role="status">{notice}</p>}

            {/* ---------- job boards ---------- */}
            <section className="card">
              <h2 className="t-body settings__title">Job boards</h2>
              <p className="t-body t-secondary settings__copy">
                A scan reads every board left on, one after another in a single browser session.
                Turning one off takes it out of future scans — jobs it already found stay in your
                inbox until they expire.
              </p>

              <ul className="board-list">
                {boards.map((board) => {
                  const isLastOn = board.enabled && enabledBoardCount === 1;

                  return (
                    <li key={board.source} className="board">
                      <div className="board__main">
                        <p className="t-label">{SOURCE_LABEL[board.source]}</p>
                        <p className="t-caption t-muted">
                          {signingIn === board.source
                            ? 'A browser window is open. Sign in there, Google sign-in included, then close the window.'
                            : BOARD_NOTE[board.source]}
                        </p>
                      </div>
                      {HAS_SIGN_IN[board.source] && window.electron.platform === 'win32' && (
                        <Button
                          size="sm"
                          disabled={signingIn !== null}
                          onClick={() => signIn(board.source)}
                        >
                          {signingIn === board.source ? 'Waiting…' : 'Sign in'}
                        </Button>
                      )}
                      <Toggle
                        checked={board.enabled}
                        label={`Scan ${SOURCE_LABEL[board.source]}`}
                        disabled={isLastOn}
                        disabledReason="The only board left on. Turn another one on first — a scan with no boards would do nothing."
                        onChange={(next) => toggleBoard(board.source, next)}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ---------- cover letters ---------- */}
            <section className="card">
              <h2 className="t-body settings__title">Cover letters</h2>
              <div className="settings__row">
                <p className="t-body t-secondary settings__copy">
                  When Autofill finds a cover letter box (Seek asks for one on most jobs), write a
                  letter for that job with Claude and type it in. You read and edit it before
                  anything is sent. Autofill runs <code>claude -p</code> on this computer, so
                  Claude Code must be installed and signed in.
                </p>
                <Toggle
                  checked={coverLetters}
                  label="Write cover letters with Claude"
                  onChange={toggleCoverLetters}
                />
              </div>
              <p className="t-caption t-muted settings__privacy">
                <IconWarning size={13} />
                Off by default. Turning it on sends your resume text and the job description to
                Anthropic, through your own Claude Code login, each time a letter is written.
              </p>
            </section>

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

              <div className="settings__row">
                <p className="t-caption t-muted">
                  Delete everything left in the inbox ({stats.inboxCount}) now. Saved and applied
                  jobs stay, and so do jobs you marked "Not for me", so a scan does not bring them back.
                </p>
                <Button
                  size="sm"
                  variant={confirmingClear ? 'danger-solid' : 'secondary'}
                  disabled={busy || stats.inboxCount === 0}
                  onClick={() => (confirmingClear ? void clearInbox() : setConfirmingClear(true))}
                  onBlur={() => setConfirmingClear(false)}
                >
                  {confirmingClear ? `Delete ${stats.inboxCount} for good?` : 'Delete inbox jobs'}
                </Button>
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
                Your resume, its text and your LinkedIn session live only on this device, except
                for cover letters if you turn them on. There is no account and no telemetry.
              </p>
            </section>

            {/* ---------- about ---------- */}
            {update && (
              <section className="card">
                <h2 className="t-body settings__title">About</h2>

                <div className="settings__version">
                  <div>
                    <p className="t-label">JobCheats {update.currentVersion}</p>
                    <p className="t-caption t-muted">{describeUpdate(update)}</p>
                  </div>
                  <Button size="sm" disabled={checkingUpdate} onClick={checkForUpdates}>
                    {checkingUpdate ? 'Checking…' : 'Check for updates'}
                  </Button>
                </div>

                {update.state === 'available' && update.latestVersion && (
                  <p className="t-caption settings__copy">
                    <a href={update.releaseUrl} target="_blank" rel="noreferrer">
                      Download {update.latestVersion} from the releases page
                    </a>
                    {' — '}the app does not install updates by itself.
                  </p>
                )}

                <div className="settings__row">
                  <p className="t-caption t-muted">
                    Check for a new version on launch. The check is a plain request to GitHub for
                    the newest release number — it sends nothing about you, your resume or your
                    jobs, though GitHub does see your IP address, the same as visiting the page in
                    a browser would.
                  </p>
                  <Toggle
                    checked={update.autoCheck}
                    label="Check for updates on launch"
                    onChange={toggleAutoCheck}
                  />
                </div>
              </section>
            )}
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

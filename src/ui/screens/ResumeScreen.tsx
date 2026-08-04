import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { KeywordChip, MoreChip } from '../components/KeywordChip';
import { KeywordInput } from '../components/KeywordInput';
import { InsightsPanel } from '../components/InsightsPanel';
import { Stepper, type Step } from '../components/Stepper';
import {
  IconCheck,
  IconCross,
  IconDocument,
  IconUpload,
  IconWarning,
} from '../components/Icons';
import { ReplaceResumeDialog } from '../components/ReplaceResumeDialog';
import { formatBytes, formatDateTime } from '../format';
import './resume.css';

const COLLAPSED_KEYWORDS = 10;

type Phase =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'parsing'; file: PickedFile }
  | { kind: 'ready' }
  | { kind: 'error'; reason: UploadResumeFailure; message: string; file?: RejectedFile };

const PARSE_STAGES = [
  'Extracting text',
  'Cleaning and tokenising',
  'Ranking keywords by importance',
];

/** Guidance shown under each rejection, keyed by why it failed. */
const RECOVERY: Record<UploadResumeFailure, { title: string; steps: string[] }> = {
  'no-text-layer': {
    title: 'Export a text-based version',
    steps: [
      'Open the original in Word, Google Docs or Pages — the app you actually wrote it in.',
      'Export straight to PDF from there (do not scan or photograph a printout).',
      'Or upload that source file as DOCX, which JobMatch reads directly.',
      'If a scan is all you have, run it through OCR first, then upload the OCR output.',
    ],
  },
  'unsupported-type': {
    title: 'Convert it first',
    steps: [
      'Open the file in the app that created it.',
      'Choose File → Export To → PDF.',
      'Upload the exported PDF here.',
    ],
  },
  'too-large': {
    title: 'Shrink it first',
    steps: [
      'Most oversized resumes are carrying full-resolution images.',
      'Re-export as PDF with image compression enabled, or upload the DOCX source.',
      'A text resume is almost always well under 1 MB.',
    ],
  },
  unreadable: {
    title: 'Try a different export',
    steps: [
      'Remove any password protection from the file.',
      'Re-export it from the original app rather than editing the PDF directly.',
      'Or upload the DOCX source instead.',
    ],
  },
};

const ERROR_HEADLINE: Record<UploadResumeFailure, (file?: RejectedFile) => string> = {
  'no-text-layer': () => 'This PDF has no text layer',
  'unsupported-type': (file) => `JobMatch can't read .${file?.extension ?? 'this'} files`,
  'too-large': () => 'That file is too large',
  unreadable: () => "That file couldn't be read",
};

const ERROR_BADGE: Record<UploadResumeFailure, string> = {
  'no-text-layer': 'No text layer',
  'unsupported-type': 'Unsupported type',
  'too-large': 'Too large',
  unreadable: 'Unreadable',
};

export function ResumeScreen() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [resume, setResume] = useState<ResumeMeta | null>(null);
  const [keywords, setKeywords] = useState<ResumeKeyword[]>([]);
  const [jobCount, setJobCount] = useState(0);
  const [insights, setInsights] = useState<ResumeInsights | null>(null);
  const [pendingReplace, setPendingReplace] = useState<PickedFile | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [stage, setStage] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stageTimer = useRef<number | null>(null);

  useEffect(() => {
    void refresh();
    return () => {
      if (stageTimer.current) window.clearInterval(stageTimer.current);
    };
  }, []);

  async function refresh() {
    const [meta, words, jobs, read] = await Promise.all([
      window.electron.getResume(),
      window.electron.listKeywords(),
      window.electron.countJobs(),
      window.electron.getInsights(),
    ]);
    setResume(meta);
    setKeywords(words);
    setJobCount(jobs);
    setInsights(read);
    setPhase(meta ? { kind: 'ready' } : { kind: 'empty' });
  }

  /** Every keyword edit changes scoring, so the read-back has to follow it. */
  async function syncKeywords() {
    const [words, read] = await Promise.all([
      window.electron.listKeywords(),
      window.electron.getInsights(),
    ]);
    setKeywords(words);
    setInsights(read);
  }

  async function beginUpload(file: PickedFile) {
    // The main process parses in one shot without streaming progress, so these
    // stages advance on a timer. They describe the real pipeline, but the
    // timings are indicative rather than measured.
    setStage(0);
    setPhase({ kind: 'parsing', file });
    stageTimer.current = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, PARSE_STAGES.length - 1));
    }, 700);

    const result = await window.electron.uploadResume(file.path);

    if (stageTimer.current) window.clearInterval(stageTimer.current);

    if (!result.ok) {
      setPhase({ kind: 'error', reason: result.reason, message: result.error, file: result.file });
      return;
    }

    setResume(result.resume);
    setKeywords(result.keywords);
    setExpanded(false);
    setPhase({ kind: 'ready' });
  }

  async function choose() {
    const file = await window.electron.pickResume();
    if (!file) return;

    // Replacing destroys the old file on disk, so it always goes through a
    // confirmation naming both files.
    if (resume) setPendingReplace(file);
    else void beginUpload(file);
  }

  async function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);

    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;

    const filePath = window.electron.getPathForFile(dropped);
    if (!filePath) return;

    const file: PickedFile = {
      path: filePath,
      filename: dropped.name,
      bytes: dropped.size,
      extension: dropped.name.split('.').pop()?.toLowerCase() ?? '',
    };

    if (resume) setPendingReplace(file);
    else void beginUpload(file);
  }

  async function toggleKeyword(keyword: ResumeKeyword) {
    await window.electron.setKeywordEnabled(keyword.id, !keyword.enabled);
    await syncKeywords();
  }

  async function removeKeyword(keyword: ResumeKeyword) {
    await window.electron.removeKeyword(keyword.id);
    await syncKeywords();
  }

  /** Insights name keywords by text; the delete needs the row id. */
  async function removeByName(name: string) {
    const match = keywords.find((keyword) => keyword.keyword === name);
    if (match) await removeKeyword(match);
  }

  async function addByName(name: string) {
    await window.electron.addKeyword(name);
    await syncKeywords();
  }

  async function reExtract() {
    await window.electron.resetKeywords();
    await syncKeywords();
  }

  /**
   * Manual keywords are stored with source 'manual', which is what makes them
   * survive a resume replacement. addKeyword returns null when the keyword is
   * already there — the main process lowercases before comparing, so "React"
   * and "react" are the same entry.
   */
  async function addKeyword(keyword: string): Promise<string | null> {
    try {
      const created = await window.electron.addKeyword(keyword);
      if (!created) return `“${keyword.toLowerCase()}” is already in your list.`;
      await syncKeywords();
      // A new keyword usually lands past the collapsed cut-off, so open the
      // list — adding something you cannot see reads as though it failed.
      setExpanded(true);
      return null;
    } catch {
      return 'That keyword could not be added.';
    }
  }

  const steps: Step[] = [
    { label: 'Upload resume', state: resume ? 'done' : 'active' },
    { label: 'Run your first scan', state: resume && jobCount > 0 ? 'done' : resume ? 'active' : 'todo' },
    { label: 'See your matches', state: jobCount > 0 ? 'active' : 'todo' },
  ];

  const visibleKeywords = expanded ? keywords : keywords.slice(0, COLLAPSED_KEYWORDS);
  const hiddenCount = keywords.length - visibleKeywords.length;

  // ---------- header ----------

  const header = (() => {
    if (phase.kind === 'parsing') {
      return { title: 'Reading your resume', subtitle: 'This usually takes a few seconds' };
    }
    if (phase.kind === 'error') {
      return { title: 'Upload resume', subtitle: 'PDF, DOCX or TXT · up to 10 MB' };
    }
    if (phase.kind === 'ready') {
      return { title: 'Resume', subtitle: 'One resume, ever — replacing deletes the old file' };
    }
    return { title: 'Welcome to JobMatch', subtitle: 'Three steps to your first daily match list' };
  })();

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">{header.title}</h1>
          <p className="t-body t-secondary">{header.subtitle}</p>
        </div>

        {phase.kind === 'ready' && (
          <div className="screen__actions">
            <Button onClick={reExtract}>Re-extract keywords</Button>
            <Button variant="danger" onClick={choose}>Replace resume</Button>
          </div>
        )}
      </header>

      <div className="screen__body">
        {phase.kind !== 'ready' && (
          <div className="card">
            <Stepper steps={steps} />
          </div>
        )}

        {phase.kind === 'loading' && <p className="t-body t-muted">Loading…</p>}

        {phase.kind === 'empty' && (
          <>
            <div className="intro">
              <h2 className="t-display">Start with your resume</h2>
              <p className="t-body t-secondary intro__copy">
                Everything else follows from it. JobMatch reads your resume once, pulls out the
                keywords that describe your career, and scores every job it finds against them.
              </p>
            </div>

            <div
              className={`dropzone${dragging ? ' dropzone--active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="dropzone__icon"><IconUpload size={20} /></span>
              <p className="t-title">Drop your resume here</p>
              <p className="t-body t-secondary">PDF, DOCX or TXT · up to 10 MB</p>
              <Button variant="primary" onClick={choose}>Choose file</Button>
              <p className="t-caption t-muted">
                Text-based files only — a scanned PDF has no text to read.
              </p>
            </div>

            <div className="banner">
              <span className="banner__icon"><IconWarning size={16} /></span>
              <p className="t-body">
                One resume, ever. Uploading a new one replaces the old and deletes it from disk — we
                will ask you to confirm first.
              </p>
            </div>
          </>
        )}

        {phase.kind === 'parsing' && (
          <div className="card">
            <div className="file-row">
              <span className="icon-tile"><IconDocument /></span>
              <div>
                <p className="t-title">{phase.file.filename}</p>
                <p className="t-caption t-muted">
                  {phase.file.extension.toUpperCase()} · {formatBytes(phase.file.bytes)}
                </p>
              </div>
            </div>

            <div className="progress" role="progressbar" aria-valuetext={PARSE_STAGES[stage]}>
              <span className="progress__fill" style={{ width: `${((stage + 1) / PARSE_STAGES.length) * 100}%` }} />
            </div>

            <ul className="stage-list">
              {PARSE_STAGES.map((label, index) => (
                <li key={label} className={index <= stage ? 'stage stage--done' : 'stage'}>
                  <span className="stage__dot">{index < stage && <IconCheck size={12} />}</span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase.kind === 'error' && (
          <>
            <div className="dropzone dropzone--error">
              <span className="dropzone__icon dropzone__icon--error">
                {phase.reason === 'unsupported-type' ? <IconCross size={20} /> : <IconDocument size={20} />}
              </span>
              <p className="t-title dropzone__error-title">{ERROR_HEADLINE[phase.reason](phase.file)}</p>
              <p className="t-body t-secondary dropzone__copy">
                {phase.message}
                {phase.reason === 'no-text-layer' && phase.file?.characters !== undefined && (
                  <> We extracted {phase.file.characters} characters and 0 keywords, which would
                  leave every job scoring 0.</>
                )}
              </p>
              <div className="dropzone__actions">
                <Button variant="primary" onClick={choose}>Choose another file</Button>
                {resume && (
                  <Button variant="ghost" onClick={() => setPhase({ kind: 'ready' })}>
                    Keep current resume
                  </Button>
                )}
              </div>
            </div>

            {phase.file && (
              <div className="card card--flush file-strip">
                <span className="file-strip__icon"><IconDocument size={16} /></span>
                <div>
                  <p className="t-label">{phase.file.filename}</p>
                  <p className="t-caption t-muted">
                    {phase.file.extension.toUpperCase()} · {formatBytes(phase.file.bytes)}
                    {phase.file.pages !== undefined && ` · ${phase.file.pages} pages`}
                    {phase.file.characters !== undefined && ` · ${phase.file.characters} characters extracted`}
                  </p>
                </div>
                <span className="badge">{ERROR_BADGE[phase.reason]}</span>
              </div>
            )}

            <div className="card">
              <h3 className="t-label recovery__title">{RECOVERY[phase.reason].title}</h3>
              <ol className="recovery">
                {RECOVERY[phase.reason].steps.map((step, index) => (
                  <li key={step}>
                    <span className="recovery__num">{index + 1}</span>
                    <span className="t-body t-secondary">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        {phase.kind === 'ready' && resume && (
          <>
            {insights && (
              <InsightsPanel
                insights={insights}
                onRemoveKeyword={removeByName}
                onAddKeyword={addByName}
              />
            )}

            <div className="card">
              <div className="file-row">
                <span className="icon-tile"><IconDocument /></span>
                <div className="file-row__main">
                  <p className="t-title">{resume.filename}</p>
                  <dl className="meta">
                    <div>
                      <dt className="t-overline">Uploaded</dt>
                      <dd className="t-body">{formatDateTime(resume.uploadedAt)}</dd>
                    </div>
                    <div>
                      <dt className="t-overline">Type</dt>
                      <dd className="t-body">{resume.filename.split('.').pop()?.toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt className="t-overline">Size</dt>
                      <dd className="t-body">{formatBytes(resume.bytes)}</dd>
                    </div>
                    <div>
                      <dt className="t-overline">Keywords</dt>
                      <dd className="t-body">{keywords.length} extracted</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="keywords__header">
                <h2 className="t-body keywords__title">
                  {keywords.filter((k) => k.enabled).length} keywords are driving your matching
                </h2>
                <p className="t-caption t-muted">Auto-extracted, ordered by importance</p>
              </div>

              {keywords.length === 0 ? (
                <p className="t-body t-muted">
                  No keywords yet — re-extract them, or add your own.
                </p>
              ) : (
                <div className="keywords">
                  {visibleKeywords.map((keyword) => (
                    <KeywordChip
                      key={keyword.id}
                      keyword={keyword}
                      onToggle={toggleKeyword}
                      onRemove={removeKeyword}
                    />
                  ))}
                  {hiddenCount > 0 && <MoreChip count={hiddenCount} onClick={() => setExpanded(true)} />}
                </div>
              )}

              <div className="keywords__actions">
                <KeywordInput
                  onAdd={addKeyword}
                  label="Add a keyword"
                  placeholder="Add a keyword…"
                />

                {keywords.length > COLLAPSED_KEYWORDS && (
                  <Button size="sm" onClick={() => setExpanded((value) => !value)}>
                    {expanded ? 'Show fewer' : `Show all ${keywords.length}`}
                  </Button>
                )}
              </div>

              <p className="t-caption t-muted keywords__note">
                Keywords you add by hand are kept when you replace your resume. Click any keyword to
                stop it counting towards matches.
              </p>
            </div>
          </>
        )}
      </div>

      {pendingReplace && resume && (
        <ReplaceResumeDialog
          current={resume}
          incoming={pendingReplace}
          autoKeywordCount={keywords.filter((k) => k.source === 'auto').length}
          manualKeywordCount={keywords.filter((k) => k.source === 'manual').length}
          jobCount={jobCount}
          onCancel={() => setPendingReplace(null)}
          onConfirm={() => {
            const file = pendingReplace;
            setPendingReplace(null);
            void beginUpload(file);
          }}
        />
      )}
    </>
  );
}

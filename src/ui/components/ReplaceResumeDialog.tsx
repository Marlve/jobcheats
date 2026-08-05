import { useEffect } from 'react';
import { Button } from './Button';
import { IconArrowRight, IconCheck, IconCross, IconWarning } from './Icons';
import { formatBytes, formatDate } from '../format';

interface ReplaceResumeDialogProps {
  current: ResumeMeta;
  incoming: PickedFile;
  autoKeywordCount: number;
  manualKeywordCount: number;
  jobCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Replacing deletes the old file from disk immediately, so the dialog spells out
 * both what is destroyed and what survives before the user commits.
 */
export function ReplaceResumeDialog({
  current,
  incoming,
  autoKeywordCount,
  manualKeywordCount,
  jobCount,
  onCancel,
  onConfirm,
}: ReplaceResumeDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const consequences: { kind: 'loss' | 'keep'; text: string }[] = [
    { kind: 'loss', text: `${current.filename} is deleted from disk immediately` },
    { kind: 'loss', text: `All ${autoKeywordCount} auto-extracted keywords are discarded and regenerated` },
    { kind: 'keep', text: `The ${manualKeywordCount} keyword${manualKeywordCount === 1 ? '' : 's'} you added by hand ${manualKeywordCount === 1 ? 'is' : 'are'} kept` },
    { kind: 'keep', text: `Your ${jobCount} stored job${jobCount === 1 ? '' : 's'} ${jobCount === 1 ? 'is' : 'are'} rescored against the new resume` },
  ];

  return (
    <div className="modal__scrim" role="presentation" onClick={onCancel}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="replace-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replace__head">
          <span className="replace__warn"><IconWarning size={18} /></span>
          <div>
            <h2 id="replace-title" className="t-title">Replace your resume?</h2>
            <p className="t-body replace__danger">This is permanent and cannot be undone.</p>
          </div>
        </div>

        <div className="replace__diff">
          <div className="replace__file replace__file--out">
            <p className="t-overline replace__out-label">Being deleted</p>
            <p className="t-body replace__strike">{current.filename}</p>
            <p className="t-caption t-muted">
              {current.filename.split('.').pop()?.toUpperCase()} · {formatBytes(current.bytes)} ·
              uploaded {formatDate(current.uploadedAt)}
            </p>
          </div>

          <span className="replace__arrow"><IconArrowRight size={18} /></span>

          <div className="replace__file replace__file--in">
            <p className="t-overline replace__in-label">Replacing it with</p>
            <p className="t-body">{incoming.filename}</p>
            <p className="t-caption t-muted">
              {incoming.extension.toUpperCase()} · {formatBytes(incoming.bytes)} · selected just now
            </p>
          </div>
        </div>

        <ul className="replace__list">
          {consequences.map(({ kind, text }) => (
            <li key={text} className={`replace__item replace__item--${kind}`}>
              <span className="replace__icon">
                {kind === 'loss' ? <IconCross size={13} /> : <IconCheck size={13} />}
              </span>
              <span className="t-body">{text}</span>
            </li>
          ))}
        </ul>

        <div className="replace__actions">
          <Button onClick={onCancel}>Keep current resume</Button>
          <Button variant="danger-solid" onClick={onConfirm}>Delete and replace</Button>
        </div>
      </div>
    </div>
  );
}

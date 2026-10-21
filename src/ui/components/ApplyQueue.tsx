import { applyQueue, finished, useApplyQueue } from '../applyQueue';
import { AutofillNote } from './AutofillNote';
import { Button } from './Button';
import './bulk.css';

/**
 * The apply queue's controls, docked to the corner of every screen so the queue
 * is in reach wherever you are. Each job opens filled in; you read it and press
 * Submit yourself. Pause is for a job that has stuck: it puts the window away
 * and holds the queue on that job until you resume.
 */
export function ApplyQueue() {
  const queue = useApplyQueue();
  if (!queue) return null;

  if (finished(queue)) {
    return (
      <div className="card queue" role="status">
        <p className="t-body">
          Finished {queue.jobs.length} job{queue.jobs.length === 1 ? '' : 's'}: {queue.applied.length} marked applied.
        </p>
        <div className="queue__actions">
          <Button size="sm" onClick={() => void applyQueue.stop()}>Close</Button>
        </div>
      </div>
    );
  }

  const job = queue.jobs[queue.index];
  const { phase } = queue;

  return (
    <div className="card queue">
      <p className="t-overline">
        Job {queue.index + 1} of {queue.jobs.length}{phase === 'paused' ? ' · paused' : ''}
      </p>
      <p className="t-body queue__title">{job.title}</p>
      <p className="t-caption t-secondary">{[job.company, job.location].filter(Boolean).join(' · ')}</p>

      {phase === 'working' && <p className="t-caption t-muted">Opening the form and filling it in…</p>}
      {phase === 'paused' && (
        <p className="t-caption t-muted">
          Held. The application window was put away; Resume opens this job again.
        </p>
      )}
      {queue.result && <AutofillNote result={queue.result} />}

      <div className="queue__actions">
        {phase === 'working' && (
          <Button size="sm" variant="primary" onClick={() => void applyQueue.pause()}>Pause</Button>
        )}

        {phase === 'review' && (
          <>
            <Button size="sm" variant="primary" onClick={() => void applyQueue.markApplied()}>
              I submitted it, next job
            </Button>
            <Button size="sm" onClick={applyQueue.refill}>Autofill again</Button>
          </>
        )}

        {phase === 'paused' && (
          <Button size="sm" variant="primary" onClick={applyQueue.resume}>Resume</Button>
        )}

        {phase !== 'working' && <Button size="sm" variant="ghost" onClick={applyQueue.skip}>Skip</Button>}
        <Button size="sm" variant="ghost" onClick={() => void applyQueue.stop()}>Stop</Button>
      </div>
    </div>
  );
}

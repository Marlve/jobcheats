/** Which resume was attached: the tailored one with an Open PDF button, or the master and why. */
function ResumeLine({ tailored }: { tailored: TailoredResume }) {
  if (tailored.kept.length === 0) {
    return <p><strong>Resume:</strong> master used. {tailored.error}</p>;
  }

  const how = `picked by ${tailored.chosenBy === 'claude' ? 'Claude' : 'tags'}${tailored.rewritten ? ', bullets rewritten' : ''}`;
  return (
    <p>
      <strong>Resume:</strong> tailored with {tailored.kept.join(', ')} ({how}){' '}
      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={() => void window.electron.openTailoredResume(tailored.jobId)}
      >
        Open PDF
      </button>
      {tailored.error && <span className="t-muted"> {tailored.error}</span>}
    </p>
  );
}

/** What an Autofill press did, in words — shown under the job it was pressed on. */
export function AutofillNote({ result }: { result: AutofillResult }) {
  if (!result.ok) {
    return <div className="job__autofill job__autofill--error t-caption" role="status">{result.error}</div>;
  }

  if (result.stage === 'opened') {
    return (
      <div className="job__autofill t-caption t-secondary" role="status">
        Opened in a new window, but there was no Apply button to press. Click Apply there and get
        to the application form, then press Autofill again.
      </div>
    );
  }

  const { filled, needsYou, skipped, stoppedAt, coverLetterError, tailored } = result;

  if (filled.length === 0 && needsYou.length === 0 && !stoppedAt && !coverLetterError) {
    return (
      <div className="job__autofill t-caption t-secondary" role="status">
        No form to fill in the front tab. Get to the application form, then press Autofill again.
      </div>
    );
  }

  return (
    <div className="job__autofill t-caption t-secondary" role="status">
      <p><strong>Filled {filled.length}:</strong> {filled.join(', ') || 'nothing'}</p>
      {needsYou.length > 0 && <p><strong>Still needs you:</strong> {needsYou.join(' · ')}</p>}
      {coverLetterError && <p><strong>Cover letter not written:</strong> {coverLetterError}</p>}
      {tailored && <ResumeLine tailored={tailored} />}
      {skipped > 0 && <p className="t-muted">{skipped} other field{skipped === 1 ? '' : 's'} left alone.</p>}
      {stoppedAt === 'review' && (
        <p className="t-muted">Stopped on the last page. Check your answers, then press Submit yourself.</p>
      )}
      {stoppedAt === 'questions' && (
        <p className="t-muted">Stopped on a step it cannot finish. Answer it in the window (or on the Saved answers tab), then press Autofill again.</p>
      )}
      {!stoppedAt && <p className="t-muted">Nothing was submitted. Check the form, then press Submit yourself.</p>}
    </div>
  );
}

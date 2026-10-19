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

  const { filled, needsYou, skipped, stoppedAt } = result;

  if (filled.length === 0 && needsYou.length === 0 && !stoppedAt) {
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
      {skipped > 0 && <p className="t-muted">{skipped} other field{skipped === 1 ? '' : 's'} left alone.</p>}
      {stoppedAt === 'review' && (
        <p className="t-muted">Stopped on the last page. Check your answers, then press Submit yourself.</p>
      )}
      {stoppedAt === 'questions' && (
        <p className="t-muted">Stopped on a step it cannot finish. Answer it in the window, then press Autofill again.</p>
      )}
      {!stoppedAt && <p className="t-muted">Nothing was submitted. Check the form, then press Submit yourself.</p>}
    </div>
  );
}

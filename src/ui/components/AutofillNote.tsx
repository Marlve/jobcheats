/** What an Autofill press did, in words — shown under the job it was pressed on. */
export function AutofillNote({ result }: { result: AutofillResult }) {
  if (!result.ok) {
    return <div className="job__autofill job__autofill--error t-caption" role="status">{result.error}</div>;
  }

  if (result.stage === 'opened') {
    return (
      <div className="job__autofill t-caption t-secondary" role="status">
        Opened in a new window. Click Apply there and get to the application form, then press
        Autofill again.
      </div>
    );
  }

  const { filled, needsYou, skipped } = result;

  if (filled.length === 0 && needsYou.length === 0) {
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
      <p className="t-muted">Nothing was submitted. Check the form, then press Submit yourself.</p>
    </div>
  );
}

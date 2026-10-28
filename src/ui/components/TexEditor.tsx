import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Button } from './Button';
import './texEditor.css';

GlobalWorkerOptions.workerSrc = workerUrl;

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; text: string }
  | { kind: 'ok'; text: string }
  | { kind: 'error'; text: string };

/**
 * Edits the stored `.tex` master. Preview compiles the text as it stands and
 * shows the PDF; Save stores it through the same checks as an upload. Only the
 * app's copy changes — the file it was uploaded from is left alone.
 */
export function TexEditor({
  filename,
  onClose,
  onSaved,
}: {
  filename: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState<Uint8Array | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const gutter = useRef<HTMLPreElement>(null);

  useEffect(() => {
    void window.electron.getResumeTex().then((text) => {
      setSource(text ?? '');
      setSaved(text ?? '');
    });
  }, []);

  const dirty = source !== null && source !== saved;
  const busy = status.kind === 'busy';

  async function runPreview() {
    if (source === null || busy) return;
    setStatus({ kind: 'busy', text: 'Compiling…' });
    const result = await window.electron.previewResumeTex(source);
    if (result.ok) {
      setPreview(result.pdf);
      setStatus({ kind: 'idle' });
    } else {
      // The last good preview stays, so the error reads against something.
      setStatus({ kind: 'error', text: result.error });
    }
  }

  async function save() {
    if (source === null || busy || !dirty) return;
    setStatus({ kind: 'busy', text: 'Saving…' });
    const result = await window.electron.saveResumeTex(source);
    if (result.ok) {
      setSaved(source);
      setStatus({ kind: 'ok', text: 'Saved. Keywords and job scores are updated.' });
      onSaved();
    } else {
      setStatus({ kind: 'error', text: `Not saved: ${result.error}` });
    }
  }

  // Ctrl+S saves wherever focus is, not only inside the text box.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function close() {
    if (dirty && !window.confirm('Close the editor and lose your unsaved changes?')) return;
    onClose();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const box = event.currentTarget;
      box.setRangeText('  ', box.selectionStart, box.selectionEnd, 'end');
      setSource(box.value);
    }
  }

  const lineCount = source === null ? 1 : source.split('\n').length;

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Edit {filename}</h1>
          <p className="t-body t-secondary">
            Changes apply to the app's copy only. Ctrl+S saves.
          </p>
        </div>
        <div className="screen__actions">
          <Button onClick={runPreview} disabled={busy || source === null}>Preview</Button>
          <Button variant="primary" onClick={save} disabled={busy || !dirty}>Save</Button>
          <Button variant="ghost" onClick={close}>Close</Button>
        </div>
      </header>

      <div className="tex-editor">
        {status.kind !== 'idle' && (
          <p
            className={`tex-editor__status t-caption tex-editor__status--${status.kind}`}
            role={status.kind === 'error' ? 'alert' : 'status'}
          >
            {status.text}
          </p>
        )}

        <div className="tex-editor__panes">
          <div className="tex-editor__code card card--flush">
            <pre ref={gutter} className="tex-editor__gutter" aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
            </pre>
            <textarea
              className="tex-editor__text"
              value={source ?? ''}
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={onKeyDown}
              onScroll={(event) => {
                if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
              }}
              spellCheck={false}
              wrap="off"
              disabled={source === null}
              aria-label="LaTeX source"
            />
          </div>

          <div className="tex-editor__preview card card--flush">
            {preview ? (
              <PdfPages data={preview} />
            ) : (
              <p className="t-body t-muted tex-editor__empty">
                Press Preview to see the PDF this LaTeX builds.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Draws each page of a PDF onto a canvas, with the PDF library the app already ships. */
function PdfPages({ data }: { data: Uint8Array }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // pdfjs takes ownership of the buffer it is given, so it gets a copy.
    const task = getDocument({ data: data.slice() });

    void (async () => {
      const document_ = await task.promise;
      const canvases: HTMLCanvasElement[] = [];
      for (let number = 1; number <= document_.numPages; number++) {
        const page = await document_.getPage(number);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'tex-editor__page';
        canvas.setAttribute('aria-label', `Page ${number}`);
        await page.render({ canvas, viewport }).promise;
        canvases.push(canvas);
      }
      if (!cancelled) host.current?.replaceChildren(...canvases);
    })().catch((err) => {
      if (!cancelled) console.error('[preview] could not draw the PDF:', err);
    });

    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [data]);

  return <div ref={host} className="tex-editor__pages" />;
}

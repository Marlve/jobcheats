import { useEffect, useState } from 'react';

/**
 * Minimise / maximise / close, drawn by the app.
 *
 * Windows and Linux only — macOS keeps its own traffic lights, which the app
 * leaves room for in the same strip (see --titlebar-h in App.css).
 *
 * The glyphs are 10px boxes on a 10px grid rather than the 1.75px stroke used
 * for the app's icons: caption glyphs are hairlines everywhere, and at this size
 * the app's weight reads as a smudge.
 */

const Glyph = ({ children }: { children: React.ReactNode }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
    {children}
  </svg>
);

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void window.electron.isWindowMaximized().then(setMaximized);
    // Dragging the window to the top edge or double-clicking a drag region
    // maximises it too, so the icon tracks the window, not this button.
    return window.electron.subscribeWindowMaximized(setMaximized);
  }, []);

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-controls__btn"
        onClick={() => void window.electron.minimizeWindow()}
        aria-label="Minimise"
        title="Minimise"
      >
        <Glyph><path d="M0 5h10" /></Glyph>
      </button>

      <button
        type="button"
        className="window-controls__btn"
        onClick={() => void window.electron.toggleMaximizeWindow().then(setMaximized)}
        aria-label={maximized ? 'Restore down' : 'Maximise'}
        title={maximized ? 'Restore down' : 'Maximise'}
      >
        {maximized
          ? <Glyph><path d="M2.5 2.5V0.5h7v7h-2" /><rect x="0.5" y="2.5" width="7" height="7" /></Glyph>
          : <Glyph><rect x="0.5" y="0.5" width="9" height="9" /></Glyph>}
      </button>

      <button
        type="button"
        className="window-controls__btn window-controls__btn--close"
        onClick={() => void window.electron.closeWindow()}
        aria-label="Close"
        title="Close"
      >
        <Glyph><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" /></Glyph>
      </button>
    </div>
  );
}

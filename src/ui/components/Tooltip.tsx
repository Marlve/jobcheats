import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A tooltip in the app's own palette.
 *
 * Replaces the `title` attribute, which the OS draws in its own font on its own
 * schedule — correct behaviour, wrong app. The delay before showing matches the
 * one people expect from `title`, so the tooltip still reads as a hint rather
 * than a popup that follows the cursor.
 *
 * The bubble is positioned against the viewport rather than the anchor's parent,
 * so it is never clipped by the scrolling screen body.
 */

const SHOW_DELAY_MS = 320;
const GAP = 8;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  /** Applied to the wrapper, for callers that need it to fill its parent. */
  className?: string;
}

export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ top: 0, left: 0, above: true, placed: false });

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Measured after the bubble renders, so its real size decides which side it
  // goes on. It renders hidden for that one frame rather than flickering.
  useEffect(() => {
    if (!open) return;

    const anchor = anchorRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!anchor || !bubble) return;

    const above = anchor.top - bubble.height - GAP >= 0;
    const left = Math.min(
      Math.max(GAP, anchor.left + anchor.width / 2 - bubble.width / 2),
      window.innerWidth - bubble.width - GAP
    );

    setPlacement({
      top: above ? anchor.top - bubble.height - GAP : anchor.bottom + GAP,
      left,
      above,
      placed: true,
    });
  }, [open]);

  // Anything that moves the anchor out from under the bubble hides it — there
  // is no sane place to put a tooltip whose anchor has scrolled away.
  useEffect(() => {
    if (!open) return;

    const hide = () => setOpen(false);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPlacement((current) => ({ ...current, placed: false }));
      setOpen(true);
    }, SHOW_DELAY_MS);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  return (
    <span
      ref={anchorRef}
      className={`tooltip__anchor ${className}`.trim()}
      aria-describedby={open ? id : undefined}
      onPointerEnter={show}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {children}

      {/* Rendered into the body rather than here. As a child of the anchor it
          counts as part of it for hit-testing, so appearing under the cursor
          made the anchor fire leave-then-enter and the tooltip flickered off
          the moment it opened. */}
      {open && createPortal(
        <span
          ref={bubbleRef}
          id={id}
          role="tooltip"
          className={[
            'tooltip',
            placement.above ? '' : 'tooltip--below',
            // Hidden for the single frame between rendering and measuring.
            placement.placed ? 'tooltip--placed' : '',
          ].filter(Boolean).join(' ')}
          style={{ top: placement.top, left: placement.left }}
        >
          {content}
        </span>,
        document.body
      )}
    </span>
  );
}

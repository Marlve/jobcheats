import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { IconCheck, IconChevron } from './Icons';

/**
 * A dropdown in the app's own palette.
 *
 * A native `<select>` can be styled shut but not open — the OS draws the option
 * list, so it arrives in the system font with system spacing and system
 * highlight colours no matter what the page says. This is the same control with
 * a list the app draws.
 *
 * Keyboard behaviour follows the native one: Up/Down and Home/End move through
 * the options, Enter or Space commits, Escape closes without changing anything.
 *
 * The list is positioned against the viewport, so the scrolling screen body
 * cannot clip it.
 */

const GAP = 6;
const MAX_LIST_HEIGHT = 280;

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name — these sit in toolbars with no visible label of their own. */
  label: string;
  /** `field` matches the inputs beside it; `pill` matches the scan chips. */
  variant?: 'field' | 'pill';
  className?: string;
}

export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  variant = 'field',
  className = '',
}: SelectProps<T>) {
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState({ top: 0, left: 0, minWidth: 0, placed: false });

  const selected = options.findIndex((option) => option.value === value);
  const current = options[selected] ?? options[0];

  function openList() {
    setActive(selected < 0 ? 0 : selected);
    setBox((prev) => ({ ...prev, placed: false }));
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  // Measured before paint so the list never appears in the wrong place first.
  useLayoutEffect(() => {
    if (!open) return;

    const anchor = buttonRef.current?.getBoundingClientRect();
    const list = listRef.current?.getBoundingClientRect();
    if (!anchor || !list) return;

    const below = anchor.bottom + GAP;
    const fitsBelow = below + list.height <= window.innerHeight - GAP;

    setBox({
      top: fitsBelow ? below : Math.max(GAP, anchor.top - list.height - GAP),
      left: Math.min(anchor.left, Math.max(GAP, window.innerWidth - list.width - GAP)),
      minWidth: anchor.width,
      placed: true,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  // Scrolling the page underneath an open list would leave it stranded next to
  // whatever moved into its place.
  useEffect(() => {
    if (!open) return;

    const dismiss = () => setOpen(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActive(0);
        break;
      case 'End':
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(active);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  }

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openList();
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`select-btn select-btn--${variant} ${className}`.trim()}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onButtonKeyDown}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        <span className="select-btn__value">{current?.label ?? ''}</span>
        <IconChevron size={16} />
      </button>

      {open && (
        <>
          {/* Catches the click that dismisses the list, so the click does not
              also land on whatever is behind it. */}
          <div className="select-backdrop" onPointerDown={() => setOpen(false)} />

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={`${listId}-${active}`}
            className={`select-list${box.placed ? ' select-list--placed' : ''}`}
            style={{ top: box.top, left: box.left, minWidth: box.minWidth, maxHeight: MAX_LIST_HEIGHT }}
            onKeyDown={onListKeyDown}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === selected}
                data-active={index === active}
                className={[
                  'select-option',
                  index === active ? 'select-option--active' : '',
                  index === selected ? 'select-option--selected' : '',
                ].filter(Boolean).join(' ')}
                onPointerEnter={() => setActive(index)}
                onPointerDown={(event) => {
                  // Pointer-down rather than click: the backdrop would otherwise
                  // close the list before the click landed.
                  event.preventDefault();
                  commit(index);
                }}
              >
                <span className="select-option__label">{option.label}</span>
                {index === selected && <IconCheck size={15} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

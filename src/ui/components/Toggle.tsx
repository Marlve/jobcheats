import { Tooltip } from './Tooltip';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Names the control for screen readers — the visible text is its row's. */
  label: string;
  disabled?: boolean;
  /** Shown on hover when disabled. A locked control with no reason is a bug. */
  disabledReason?: string;
}

/**
 * An on/off switch.
 *
 * A button with role="switch" rather than a styled checkbox: the two behave the
 * same to a keyboard and a screen reader, and this one has no hidden input whose
 * appearance has to be suppressed differently on every platform.
 */
export function Toggle({ checked, onChange, label, disabled, disabledReason }: ToggleProps) {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' switch--on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );

  if (!disabled || !disabledReason) return control;

  // The tooltip wraps rather than sits on the button, because a disabled button
  // fires no pointer events of its own and would never trigger it.
  return <Tooltip content={disabledReason}>{control}</Tooltip>;
}

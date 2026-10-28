import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Tooltip } from './Tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  children: ReactNode;
  /** Shown on hover when disabled. A locked control with no reason is a bug. */
  disabledReason?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  disabledReason,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size === 'sm' ? 'btn--sm' : '',
    className,
  ].filter(Boolean).join(' ');

  const button = (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );

  if (!rest.disabled || !disabledReason) return button;

  // The tooltip wraps rather than sits on the button, because a disabled button
  // fires no pointer events of its own and would never trigger it.
  return <Tooltip content={disabledReason}>{button}</Tooltip>;
}

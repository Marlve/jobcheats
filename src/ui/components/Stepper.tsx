import { Fragment } from 'react';

export interface Step {
  label: string;
  state: 'done' | 'active' | 'todo';
}

/** Onboarding progress: upload resume → run first scan → see matches. */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <div className="stepper">
      {steps.map((step, index) => (
        <Fragment key={step.label}>
          <span className={`step step--${step.state}`}>
            <span className="step__dot">{step.state === 'done' ? '✓' : index + 1}</span>
            <span className="step__label">{step.label}</span>
          </span>
          {index < steps.length - 1 && <span className="step__rule" />}
        </Fragment>
      ))}
    </div>
  );
}

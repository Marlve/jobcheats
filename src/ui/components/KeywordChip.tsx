import { Tooltip } from './Tooltip';

interface KeywordChipProps {
  keyword: ResumeKeyword;
  onToggle?: (keyword: ResumeKeyword) => void;
  onRemove?: (keyword: ResumeKeyword) => void;
}

/** Matches MAX_WEIGHT in the main process's keywordService. */
const MAX_WEIGHT = 3;

/**
 * Auto, Manual and Disabled variants from the design system.
 *
 * The dots are the keyword's weight — how often the term appears in the resume,
 * capped at three, which is also the multiplier it gets when a job is scored.
 * They are there to be compared across chips at a glance; the exact number and
 * what it does are spelled out in the tooltip, because a bare "x3" says neither.
 */
export function KeywordChip({ keyword, onToggle, onRemove }: KeywordChipProps) {
  const classes = [
    'chip',
    keyword.source === 'manual' ? 'chip--manual' : '',
    keyword.enabled ? '' : 'chip--disabled',
  ].filter(Boolean).join(' ');

  const weight = Math.max(1, Math.min(MAX_WEIGHT, Math.round(keyword.weight)));

  const tooltip = (
    <>
      <strong>{keyword.keyword}</strong> appears {weight === MAX_WEIGHT ? `${weight}+ times` : `${weight} time${weight === 1 ? '' : 's'}`} in your
      resume{weight > 1 ? `, so it pulls ${weight}× as hard on a match score as a keyword that appears once` : ''}.
      <br />
      {keyword.source === 'manual' ? 'You added this one.' : 'Found in your resume.'}{' '}
      {keyword.enabled ? 'Click to stop counting it.' : 'Not counting — click to bring it back.'}
    </>
  );

  return (
    <Tooltip content={tooltip}>
      <span className={classes}>
        <button
          type="button"
          className="chip__label"
          onClick={() => onToggle?.(keyword)}
          aria-pressed={keyword.enabled}
        >
          {keyword.keyword}
        </button>

        <span
          className="chip__weight"
          role="img"
          aria-label={`Weight ${weight} of ${MAX_WEIGHT}`}
        >
          {Array.from({ length: MAX_WEIGHT }, (_, index) => (
            <span
              key={index}
              className={`chip__dot${index < weight ? ' chip__dot--on' : ''}`}
            />
          ))}
        </span>

        {onRemove && (
          <button
            type="button"
            className="chip__remove"
            onClick={() => onRemove(keyword)}
            aria-label={`Remove ${keyword.keyword}`}
          >
            ×
          </button>
        )}
      </span>
    </Tooltip>
  );
}

/** The muted "+N more" chip used when the list is collapsed. */
export function MoreChip({ count, onClick }: { count: number; onClick?: () => void }) {
  return (
    <button type="button" className="chip chip--static" onClick={onClick}>
      +{count} more
    </button>
  );
}

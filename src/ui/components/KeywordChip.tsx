import { Tooltip } from './Tooltip';

interface KeywordChipProps {
  keyword: ResumeKeyword;
  onToggle?: (keyword: ResumeKeyword) => void;
  onRemove?: (keyword: ResumeKeyword) => void;
  onSetWeight?: (keyword: ResumeKeyword, weight: number) => void;
  onResetWeight?: (keyword: ResumeKeyword) => void;
}

/** Matches MAX_PRIORITY in the main process's keywordService. */
const MAX_PRIORITY = 5;
const PRIORITY_NAMES = ['', 'low', 'below normal', 'normal', 'above normal', 'high'];

/**
 * Auto, Manual and Disabled variants from the design system.
 *
 * The dots are the keyword's priority, 1 to 5. A job that asks for this skill
 * counts it that many times over, so high-priority skills lift a score more.
 * It starts from how often the resume mentions the word; clicking a dot sets
 * it by hand, which re-reading the resume then keeps.
 */
export function KeywordChip({ keyword, onToggle, onRemove, onSetWeight, onResetWeight }: KeywordChipProps) {
  const classes = [
    'chip',
    keyword.source === 'manual' ? 'chip--manual' : '',
    keyword.enabled ? '' : 'chip--disabled',
  ].filter(Boolean).join(' ');

  const weight = Math.max(1, Math.min(MAX_PRIORITY, Math.round(keyword.weight)));

  const tooltip = (
    <>
      <strong>{keyword.keyword}</strong>: {PRIORITY_NAMES[weight]} priority ({weight} of {MAX_PRIORITY}),{' '}
      {keyword.weightManual ? 'set by you' : 'from how often your resume mentions it'}. Jobs that ask
      for it score {weight > 3 ? 'higher' : weight < 3 ? 'lower' : 'as normal'}.
      <br />
      Click a dot to set the priority.{keyword.weightManual ? ' ↺ goes back to automatic.' : ''}{' '}
      {keyword.enabled ? 'Click the word to stop counting it.' : 'Not counting — click the word to bring it back.'}
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
          className={`chip__weight${keyword.weightManual ? ' chip__weight--manual' : ''}`}
          role="group"
          aria-label={`Priority ${weight} of ${MAX_PRIORITY}${keyword.weightManual ? ', set by you' : ''}`}
        >
          {Array.from({ length: MAX_PRIORITY }, (_, index) => (
            <button
              key={index}
              type="button"
              className="chip__dot-button"
              onClick={() => onSetWeight?.(keyword, index + 1)}
              disabled={!onSetWeight}
              aria-label={`Set ${keyword.keyword} priority to ${index + 1} (${PRIORITY_NAMES[index + 1]})`}
              aria-pressed={index + 1 === weight}
            >
              <span className={`chip__dot${index < weight ? ' chip__dot--on' : ''}`} />
            </button>
          ))}
        </span>

        {keyword.weightManual && onResetWeight && (
          <button
            type="button"
            className="chip__remove"
            onClick={() => onResetWeight(keyword)}
            aria-label={`Set ${keyword.keyword} priority back to automatic`}
          >
            ↺
          </button>
        )}

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

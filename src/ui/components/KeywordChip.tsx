interface KeywordChipProps {
  keyword: ResumeKeyword;
  onToggle?: (keyword: ResumeKeyword) => void;
  onRemove?: (keyword: ResumeKeyword) => void;
}

/**
 * Auto, Manual and Disabled variants from the design system.
 *
 * The count badge shows the keyword's weight — how often the term appears in the
 * resume, capped at 3. It is deliberately something you can verify by looking at
 * your own document.
 */
export function KeywordChip({ keyword, onToggle, onRemove }: KeywordChipProps) {
  const classes = [
    'chip',
    keyword.source === 'manual' ? 'chip--manual' : '',
    keyword.enabled ? '' : 'chip--disabled',
  ].filter(Boolean).join(' ');

  const title = [
    keyword.source === 'manual' ? 'Added by you' : 'Auto-extracted',
    keyword.enabled ? 'counting towards matches' : 'not counting towards matches',
  ].join(' · ');

  return (
    <span className={classes} title={title}>
      <button
        type="button"
        className="chip__label"
        onClick={() => onToggle?.(keyword)}
        aria-pressed={keyword.enabled}
      >
        {keyword.keyword}
      </button>

      <span className="chip__count">x{keyword.weight}</span>

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

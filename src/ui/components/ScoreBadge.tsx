/**
 * Match score, banded. The bands mirror SCORE_BANDS in the electron config —
 * Strong 80+, Good 60+, Marginal 40+, Weak below that — and 60 is the threshold
 * the insights headline counts as a strong match.
 */

export type Band = 'strong' | 'good' | 'marginal' | 'weak';

export function bandFor(score: number): Band {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'good';
  if (score >= 40) return 'marginal';
  return 'weak';
}

export const BAND_LABEL: Record<Band, string> = {
  strong: 'Strong',
  good: 'Good',
  marginal: 'Marginal',
  weak: 'Weak',
};

/** An unscored job shows a dash rather than a zero — they mean different things. */
export function ScoreBadge({ score, size = 'md' }: { score: number | null; size?: 'md' | 'lg' }) {
  if (score === null) {
    return (
      <span className={`score score--none${size === 'lg' ? ' score--lg' : ''}`} title="Not scored yet">
        —
      </span>
    );
  }

  const band = bandFor(score);

  return (
    <span
      className={`score score--${band}${size === 'lg' ? ' score--lg' : ''}`}
      title={`${BAND_LABEL[band]} match — ${score} of 100`}
    >
      {score}
    </span>
  );
}

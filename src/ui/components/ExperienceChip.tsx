/**
 * What a posting asks in experience, with the phrases it rests on in the tooltip.
 * Nothing is shown for a posting that names neither a senior title nor a number
 * of years — silence is not a verdict either way.
 */
export function ExperienceChip({ senior, minYears, evidence }: {
  senior: boolean;
  minYears: number | null;
  evidence: string[];
}) {
  const label = [senior && 'Senior title', minYears && `${minYears}+ yrs experience`].filter(Boolean).join(' · ');
  if (!label) return null;

  return (
    <span
      className="exp-chip"
      title={evidence.length ? `The posting says: ${evidence.map((phrase) => `"${phrase}"`).join(', ')}` : undefined}
    >
      {label}
    </span>
  );
}

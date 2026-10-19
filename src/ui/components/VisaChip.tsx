const LABEL: Record<Exclude<VisaKind, 'none'>, string> = {
  sponsors: 'Sponsors visas',
  restricted: 'Needs work rights',
  mixed: 'Check visa wording',
};

/**
 * What a posting's wording says about work rights, with the phrases it rests on
 * in the tooltip. Nothing is shown for a posting that says nothing — silence is
 * not a verdict either way.
 */
export function VisaChip({ kind, evidence }: { kind: VisaKind; evidence: string[] }) {
  if (kind === 'none') return null;

  return (
    <span
      className={`visa-chip visa-chip--${kind}`}
      title={evidence.length ? `The posting says: ${evidence.map((phrase) => `"${phrase}"`).join(', ')}` : undefined}
    >
      {LABEL[kind]}
    </span>
  );
}

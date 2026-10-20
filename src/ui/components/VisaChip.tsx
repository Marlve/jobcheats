const LABEL: Record<Exclude<VisaKind, 'none'>, string> = {
  sponsors: 'Sponsors visas',
  restricted: 'Needs work rights',
  mixed: 'Check visa wording',
};

const TONE: Record<Exclude<VisaKind, 'none'>, 'good' | 'bad' | 'warn'> = {
  sponsors: 'good',
  restricted: 'bad',
  mixed: 'warn',
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
      className={`tag tag--${TONE[kind]}`}
      title={evidence.length ? `The posting says: ${evidence.map((phrase) => `"${phrase}"`).join(', ')}` : undefined}
    >
      {LABEL[kind]}
    </span>
  );
}

import { IconCross, IconPlus, IconScan } from './Icons';
import { Tooltip } from './Tooltip';
import './insights.css';

/**
 * The insights side of the resume tab — reads the job database back against the
 * resume. Everything here comes from getInsights(); nothing is recomputed in the
 * renderer.
 */

const BAND_CLASS: Record<string, string> = {
  Strong: 'strong',
  Good: 'good',
  Marginal: 'marginal',
  Weak: 'weak',
};

interface InsightsPanelProps {
  insights: ResumeInsights;
  onRemoveKeyword: (keyword: string) => void;
  onAddKeyword: (keyword: string) => void;
}

export function InsightsPanel({ insights, onRemoveKeyword, onAddKeyword }: InsightsPanelProps) {
  const {
    headlineScore, threshold, totalJobs, scoredJobs, lowSample,
    distribution, strongestKeywords, deadKeywords, skillGaps,
  } = insights;

  // Nothing has been scraped yet, so there is nothing to read back.
  if (totalJobs === 0) {
    return (
      <div className="card insights insights--empty">
        <span className="insights__icon"><IconScan size={20} /></span>
        <div>
          <h2 className="t-body insights__title">No jobs to measure against yet</h2>
          <p className="t-body t-secondary">
            Run a daily scan and this becomes a read on your resume — which keywords are
            actually landing, and which are dead weight.
          </p>
        </div>
      </div>
    );
  }

  const atOrAbove = distribution
    .filter((band) => band.min >= threshold)
    .reduce((sum, band) => sum + band.count, 0);

  // Bars are scaled to the largest band, not to the total — with four bands and
  // a long tail, proportions of the whole collapse into slivers. The count is
  // labelled on every row, so nothing depends on reading the length precisely.
  const peak = Math.max(1, ...distribution.map((band) => band.count));

  return (
    <>
      <section className="card insights">
        <h2 className="t-body insights__title">How your resume is landing</h2>
        <p className="t-caption t-muted">
          Share of scored jobs at or above the {threshold} match mark
        </p>

        <p className="hero-figure">
          {headlineScore}<span className="hero-figure__unit">%</span>
        </p>

        <p className="t-body t-secondary insights__sub">
          {atOrAbove} of {scoredJobs} scored {scoredJobs === 1 ? 'job' : 'jobs'} clear {threshold}
          {totalJobs > scoredJobs && ` · ${totalJobs - scoredJobs} not scored yet`}
        </p>

        {lowSample && (
          <p className="t-caption insights__caveat">
            Only {scoredJobs} {scoredJobs === 1 ? 'job has' : 'jobs have'} been scored so far —
            treat this as a hint rather than a number.
          </p>
        )}

        <ul className="dist">
          {distribution.map((band) => (
            <li key={band.label} className="dist__row">
              <Tooltip content={`${band.count} of your ${scoredJobs} scored jobs land in ${band.label} (${band.min}–${band.max}).`}>
                <span className="dist__label t-caption">{band.label}</span>
              </Tooltip>
              <span className="dist__range t-caption t-muted">{band.min}–{band.max}</span>
              <span className="dist__track">
                <span
                  className={`dist__bar dist__bar--${BAND_CLASS[band.label] ?? 'weak'}`}
                  style={{ width: `${(band.count / peak) * 100}%` }}
                />
              </span>
              <span className="dist__count t-caption">{band.count}</span>
            </li>
          ))}
        </ul>
      </section>

      {(strongestKeywords.length > 0 || deadKeywords.length > 0 || skillGaps.length > 0) && (
        <section className="card insights">
          <h2 className="t-body insights__title">What your keywords are doing</h2>

          {strongestKeywords.length > 0 && (
            <div className="kwgroup">
              <p className="t-overline">Pulling their weight</p>
              <div className="kwgroup__items">
                {strongestKeywords.map(({ keyword, hits }) => (
                  <Tooltip key={keyword} content={`"${keyword}" was mentioned by ${hits} of the jobs you have scanned.`}>
                    <span className="chip chip--sm">
                      {keyword}
                      <span className="chip__count">{hits}</span>
                    </span>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          {deadKeywords.length > 0 && (
            <div className="kwgroup">
              <p className="t-overline">Not earning their place</p>
              <p className="t-caption t-muted kwgroup__hint">
                These barely matched anything. Removing them sharpens every score.
              </p>
              <div className="kwgroup__items">
                {deadKeywords.map(({ keyword, hits }) => (
                  <Tooltip
                    key={keyword}
                    content={`${hits === 0 ? 'No job you have scanned mentions' : `Only ${hits} job${hits === 1 ? '' : 's'} mention`} "${keyword}". Click to remove it.`}
                  >
                    <button
                      type="button"
                      className="chip chip--sm chip--action"
                      onClick={() => onRemoveKeyword(keyword)}
                    >
                      {keyword}
                      <IconCross size={12} />
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}

          {skillGaps.length > 0 && (
            <div className="kwgroup">
              <p className="t-overline">Showing up in jobs, missing from you</p>
              <p className="t-caption t-muted kwgroup__hint">
                Common in the jobs you are seeing and absent from your resume. Add one if it is
                genuinely yours — this does not change the resume itself.
              </p>
              <div className="kwgroup__items">
                {skillGaps.map(({ keyword, hits }) => (
                  <Tooltip
                    key={keyword}
                    content={`${hits} of the jobs you have scanned ask for "${keyword}" and your resume never says it. Click to add it as a keyword.`}
                  >
                    <button
                      type="button"
                      className="chip chip--sm chip--action"
                      onClick={() => onAddKeyword(keyword)}
                    >
                      <IconPlus size={12} />
                      {keyword}
                      <span className="chip__count">{hits}</span>
                    </button>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutSankey } from '../sankey';
import './pipeline.css';

/** Narrower than this and the labels have no room beside the boxes; the card scrolls instead. */
const MIN_WIDTH = 560;

/** What each end of the diagram reads as, for the stats above it. */
function rate(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

export function PipelineScreen() {
  const [graph, setGraph] = useState<PipelineGraph | null>(null);

  useEffect(() => {
    void window.electron.getPipeline().then(setGraph);
  }, []);

  // The diagram is laid out at the width it is shown at, so it fills the page
  // without stretching its text the way scaling a fixed drawing would.
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(700);
  const hasChart = Boolean(graph && graph.total > 0);

  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    // The card's inner width: its padding is not drawing room.
    const measure = () => {
      const style = getComputedStyle(el);
      const inner = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setChartWidth(Math.max(Math.round(inner), MIN_WIDTH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasChart]);

  const layout = useMemo(() => {
    if (!graph) return null;
    const height = Math.min(Math.max(Math.round(chartWidth * 0.38), 300), 480);
    return layoutSankey(graph, chartWidth, height);
  }, [graph, chartWidth]);

  const value = (id: string) => graph?.nodes.find((node) => node.id === id)?.value ?? 0;
  const applied = value('applied');
  const interviewed = value('interviewed');
  const offers = value('offer') + value('hired');

  return (
    <>
      <header className="screen__header">
        <div>
          <h1 className="t-title">Pipeline</h1>
          <p className="t-body t-secondary">
            Where the jobs you saved or applied to ended up
          </p>
        </div>
      </header>

      <div className="screen__body">
        {graph && graph.total === 0 && (
          <div className="placeholder">
            <p className="t-title">Nothing to draw yet</p>
            <p className="t-body t-secondary">
              Save a job or mark it applied, then move it along as you hear back — Interview,
              Offer, Hired, Turned down. The diagram branches off from what you record.
            </p>
          </div>
        )}

        {graph && graph.total > 0 && layout && (
          <>
            <div ref={chartRef} className="card pipeline__card">
              <dl className="pipeline__stats">
                <div><dt className="t-caption t-muted">Saved or applied</dt><dd className="t-body">{graph.total}</dd></div>
                <div><dt className="t-caption t-muted">Applied</dt><dd className="t-body">{applied}</dd></div>
                <div>
                  <dt className="t-caption t-muted">Reached interviews</dt>
                  <dd className="t-body">{interviewed} <span className="t-caption t-muted">{rate(interviewed, applied)}</span></dd>
                </div>
                <div>
                  <dt className="t-caption t-muted">Offers</dt>
                  <dd className="t-body">{offers} <span className="t-caption t-muted">{rate(offers, interviewed)}</span></dd>
                </div>
              </dl>

              <svg
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                className="pipeline__svg"
                role="img"
                aria-label={`${graph.total} jobs flowing from saved or applied to their outcomes`}
              >
                {/* Each ribbon fades from the colour of the box it leaves to the one it enters. */}
                <defs>
                  {layout.links.map((link, index) => {
                    const from = layout.nodes.find((node) => node.id === link.source);
                    const to = layout.nodes.find((node) => node.id === link.target);
                    if (!from || !to) return null;
                    return (
                      <linearGradient
                        key={index}
                        id={`pipeline-link-${index}`}
                        gradientUnits="userSpaceOnUse"
                        x1={from.x + from.width}
                        x2={to.x}
                        y1={0}
                        y2={0}
                      >
                        <stop offset="0" className={`pipeline__stop--${from.tone}`} />
                        <stop offset="1" className={`pipeline__stop--${to.tone}`} />
                      </linearGradient>
                    );
                  })}
                </defs>

                {layout.links.map((link, index) => {
                  const from = layout.nodes.find((node) => node.id === link.source);
                  const to = layout.nodes.find((node) => node.id === link.target);
                  return (
                    <path
                      key={`${link.source}-${link.target}`}
                      d={link.d}
                      className="pipeline__link"
                      fill={`url(#pipeline-link-${index})`}
                    >
                      <title>{`${link.value} · ${from?.label} → ${to?.label}`}</title>
                    </path>
                  );
                })}

                {layout.nodes.map((node) => {
                  const first = node.rank === 0;
                  return (
                    <g key={node.id}>
                      <title>{`${node.label}: ${node.value}`}</title>
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx={2}
                        className={`pipeline__node pipeline__node--${node.tone}`}
                      />
                      <text
                        x={first ? node.x - 10 : node.x + node.width + 10}
                        y={node.y + node.height / 2}
                        textAnchor={first ? 'end' : 'start'}
                        dominantBaseline="middle"
                        className="pipeline__label"
                      >
                        {node.label}
                        <tspan className="pipeline__count">{`  ${node.value}`}</tspan>
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <p className="t-caption t-muted pipeline__note">
              Move a job along from the Archive — each job sits on the branch of the furthest stage
              it reached, so one turned down after an interview stays on the interview path.
            </p>
          </>
        )}
      </div>
    </>
  );
}

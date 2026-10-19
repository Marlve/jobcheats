import { useEffect, useMemo, useState } from 'react';
import { layoutSankey } from '../sankey';
import './pipeline.css';

/** What each end of the diagram reads as, for the tiles above it. */
function rate(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

export function PipelineScreen() {
  const [graph, setGraph] = useState<PipelineGraph | null>(null);

  useEffect(() => {
    void window.electron.getPipeline().then(setGraph);
  }, []);

  const layout = useMemo(() => (graph ? layoutSankey(graph) : null), [graph]);

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
            <dl className="card pipeline__tiles">
              <div><dt className="t-overline">Saved or applied</dt><dd className="t-title">{graph.total}</dd></div>
              <div><dt className="t-overline">Applied</dt><dd className="t-title">{applied}</dd></div>
              <div>
                <dt className="t-overline">Reached interviews</dt>
                <dd className="t-title">{interviewed}<span className="t-caption t-muted"> {rate(interviewed, applied)} of applied</span></dd>
              </div>
              <div>
                <dt className="t-overline">Offers</dt>
                <dd className="t-title">{offers}<span className="t-caption t-muted"> {rate(offers, interviewed)} of interviewed</span></dd>
              </div>
            </dl>

            <div className="card pipeline__chart">
              <svg
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                className="pipeline__svg"
                role="img"
                aria-label={`${graph.total} jobs flowing from saved or applied to their outcomes`}
              >
                {layout.links.map((link) => {
                  const from = layout.nodes.find((node) => node.id === link.source);
                  const to = layout.nodes.find((node) => node.id === link.target);
                  return (
                    <path
                      key={`${link.source}-${link.target}`}
                      d={link.d}
                      className={`pipeline__link pipeline__link--${to?.tone ?? 'neutral'}`}
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
                        rx={3}
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

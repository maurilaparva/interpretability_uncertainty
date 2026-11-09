import * as d3 from 'd3';
import { useMemo, useState } from 'react';
import { flipToken, nearestAlphaIndex, pct, pushScale, pushTicks, rowOfLayer, tok, tokenRole } from '../lib/data';
import { useSize } from '../lib/hooks';
import type { Item, Stats } from '../lib/types';
import { Tip } from '../components/Tip';

interface Props {
  item: Item;
  stats: Stats;
  compact?: boolean;
}

/** P(answer) at the point where a layer's flip happens (linear interpolation on the grid). */
function pAt(row: number[], alphas: number[], a: number): number {
  const i = d3.bisectLeft(alphas, a);
  if (i <= 0) return row[0];
  if (i >= alphas.length) return row[row.length - 1];
  const t = (a - alphas[i - 1]) / (alphas[i] - alphas[i - 1]);
  return row[i - 1] * (1 - t) + row[i] * t;
}

export function R2FlipCurve({ item, stats, compact }: Props) {
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const mRow = rowOfLayer(stats, item.margin_layer);
  const flipTo = flipToken(item, stats);
  const ans = tok(item.answer_token);
  const alt = tok(item.alt_token);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8 }}>
      <div className="legend">
        <span><span className="sw sw-line" style={{ borderColor: 'var(--answer)' }} />P(“{ans}”), layer {item.margin_layer}{!compact && ' (most fragile)'}</span>
        <span><span className="sw sw-dash" style={{ borderColor: 'var(--alt)' }} />P(“{alt}”){!compact && ', same layer'}</span>
        <span><span className="sw sw-line" style={{ borderColor: '#d6d3d1' }} />{compact ? 'other layers' : `P(“${ans}”), other layers`}</span>
        {!compact && <span className="caption">Dots mark where each layer flips. Hover a line for details.</span>}
      </div>
      <LineChart item={item} stats={stats} compact={!!compact} hoverRow={hoverRow} setHoverRow={setHoverRow} mRow={mRow} flipTo={flipTo} />
      {!compact && (
        <div style={{ flex: '0 0 auto' }}>
          <div className="legend" style={{ marginBottom: 4 }}>
            <strong style={{ fontSize: 12, color: 'var(--ink)' }}>Which layers are fragile?</strong>
            <span><span className="sw sw-box" style={{ background: 'var(--answer)' }} />still says “{ans}”</span>
            <span><span className="sw sw-box" style={{ background: 'var(--alt)' }} />switched to “{alt}”</span>
            <span><span className="sw sw-box" style={{ background: 'var(--other)' }} />switched to another word</span>
          </div>
          <Heatmap item={item} stats={stats} hoverRow={hoverRow} setHoverRow={setHoverRow} mRow={mRow} />
        </div>
      )}
    </div>
  );
}

const MARGIN = { top: 26, right: 18, bottom: 40, left: 56 };

function LineChart({
  item, stats, compact, hoverRow, setHoverRow, mRow, flipTo,
}: Props & { compact: boolean; hoverRow: number | null; setHoverRow: (r: number | null) => void; mRow: number; flipTo: string | null }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; row: number; ai: number } | null>(null);
  const m = compact ? { top: 22, right: 12, bottom: 34, left: 44 } : MARGIN;
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);
  const { alphas } = stats;
  const x = pushScale(stats.maxAlpha, [0, iw]);
  const y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);
  const line = d3.line<number>().x((_, i) => x(alphas[i])).y((p) => y(p)).curve(d3.curveMonotoneX);

  const rows = item.curves.p_answer;
  const paths = useMemo(() => rows.map((r) => line(r) ?? ''), [rows, iw, ih]); // eslint-disable-line react-hooks/exhaustive-deps
  const altPath = line(item.curves.p_alt[mRow]) ?? '';
  const censored = item.censored || item.margin == null;
  const mx = censored ? null : x(item.margin!);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const a = x.invert(px);
    const ai = nearestAlphaIndex(alphas, a);
    let best = -1;
    let bestD = 18;
    rows.forEach((r, ri) => {
      const d = Math.abs(y(pAt(r, alphas, a)) - py);
      if (d < bestD || (d === bestD && ri === mRow)) { bestD = d; best = ri; }
    });
    if (best >= 0) {
      setHoverRow(best);
      setTip({ x: px + m.left, y: y(pAt(rows[best], alphas, a)) + m.top, row: best, ai });
    } else {
      setHoverRow(null);
      setTip(null);
    }
  };

  const yTicks = compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const xTicks = pushTicks(stats.maxAlpha, compact);
  const labelRight = mx != null && mx > iw - 150;
  const flipLabel = flipTo ? tok(flipTo) : tok(item.alt_token);

  return (
    <div ref={ref} className="chart-fill" style={{ minHeight: compact ? 110 : 170 }}>
      {width > 0 && height > 0 && (
        <svg width={width} height={height} role="img" aria-label="Flip curves: probability of the model's answer versus push strength, one line per layer">
          <g transform={`translate(${m.left},${m.top})`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line className="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
                <text className="tick-label" x={-8} y={y(t) + 4} textAnchor="end">{pct(t)}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} className="tick-label" x={x(t)} y={ih + 16} textAnchor="middle">{t}</text>
            ))}
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke="#d6d3d1" />
            <text className="axis-title" x={iw / 2} y={ih + (compact ? 30 : 34)} textAnchor="middle">Push strength → {!compact && <tspan className="annot-muted">(square-root scale)</tspan>}</text>
            <text className="axis-title" transform={`translate(${-m.left + 12},${ih / 2}) rotate(-90)`} textAnchor="middle">
              {compact ? 'P(answer)' : "Probability of model's answer"}
            </text>

            {/* other layers */}
            <g fill="none" strokeLinejoin="round">
              {paths.map((d, ri) =>
                ri === mRow ? null : (
                  <path
                    key={ri}
                    d={d}
                    stroke={hoverRow === ri ? '#44403c' : '#d6d3d1'}
                    strokeWidth={hoverRow === ri ? 2 : 1.25}
                    style={{ transition: 'stroke var(--t)' }}
                  />
                ),
              )}
              {/* hovered line on top */}
              {hoverRow != null && hoverRow !== mRow && <path d={paths[hoverRow]} stroke="#44403c" strokeWidth={2} />}
              <path d={altPath} stroke="var(--alt)" strokeWidth={2} strokeDasharray="5 4" />
              <path d={paths[mRow]} stroke="var(--answer)" strokeWidth={2.75} />
            </g>

            {/* flip-point dots */}
            {item.per_layer_margin.map((pm, ri) =>
              pm == null ? null : (
                <circle
                  key={ri}
                  cx={x(pm)}
                  cy={y(pAt(rows[ri], alphas, pm))}
                  r={ri === mRow ? 5 : hoverRow === ri ? 4 : 2.5}
                  fill={ri === mRow ? 'var(--answer)' : hoverRow === ri ? '#44403c' : '#a8a29e'}
                  stroke="#fff"
                  strokeWidth={ri === mRow ? 2 : 1}
                />
              ),
            )}

            {/* margin marker */}
            {mx != null ? (
              <g style={{ transform: `translateX(${mx}px)`, transition: 'transform var(--t) ease-out' }}>
                <line y1={-6} y2={ih} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="3 3" />
                <text className="annot halo" x={labelRight ? -6 : 6} y={-10} textAnchor={labelRight ? 'end' : 'start'}>
                  Flips to <tspan fontStyle="italic" fill="var(--alt)">{flipLabel}</tspan> here ({item.margin!.toFixed(2)})
                </text>
              </g>
            ) : (
              <text className="annot halo" x={iw} y={-10} textAnchor="end">
                Never flips within the tested range (≤ {stats.maxAlpha})
              </text>
            )}

            <rect
              width={iw}
              height={ih}
              fill="transparent"
              onMouseMove={onMove}
              onMouseLeave={() => { setHoverRow(null); setTip(null); }}
            />
          </g>
        </svg>
      )}
      {tip && (
        <Tip x={tip.x} y={tip.y} width={width}>
          <div className="t-head">
            Layer {stats.layers[tip.row]}
            {tip.row === mRow ? ' (most fragile)' : ''}:{' '}
            {item.per_layer_margin[tip.row] == null
              ? 'never flips'
              : `flips at ${item.per_layer_margin[tip.row]!.toFixed(2)}`}
          </div>
          <div className="t-muted">
            At push {stats.alphas[tip.ai].toFixed(2)}: P(“{tok(item.answer_token)}”) {pct(item.curves.p_answer[tip.row][tip.ai])},
            top word “{tok(item.curves.top1[tip.row][tip.ai])}”
          </div>
        </Tip>
      )}
    </div>
  );
}

function Heatmap({
  item, stats, hoverRow, setHoverRow, mRow,
}: { item: Item; stats: Stats; hoverRow: number | null; setHoverRow: (r: number | null) => void; mRow: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; row: number; ai: number } | null>(null);
  const nR = item.curves.top1.length;
  const nA = stats.alphas.length;
  const cellH = Math.max(4, Math.min(7, Math.floor(150 / nR)));
  const m = { top: 2, right: MARGIN.right, bottom: 18, left: MARGIN.left };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = nR * cellH;
  const height = ih + m.top + m.bottom;
  // Cells centred on alpha values (same sqrt scale as the chart) so columns line up.
  const xs = pushScale(stats.maxAlpha, [0, iw]);
  const px = stats.alphas.map((a) => xs(a));
  const edges = px.map((p, i) => (i === 0 ? 0 : (px[i - 1] + p) / 2));
  edges.push(iw);
  const cx = (ai: number) => edges[ai];
  const cw = (ai: number) => edges[ai + 1] - edges[ai];
  const ry = (ri: number) => ih - (ri + 1) * cellH; // layer 0 at the bottom
  const color = { answer: 'var(--answer)', alt: 'var(--alt)', other: 'var(--other)' };
  const layerTicks = stats.layers.filter((_, i) => i % 4 === 0 || i === nR - 1);

  return (
    <div ref={ref} style={{ position: 'relative', height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Heatmap of the top word for every layer and push strength" style={{ overflow: 'visible' }}>
          <g transform={`translate(${m.left},${m.top})`} onMouseLeave={() => { setTip(null); setHoverRow(null); }}>
            {item.curves.top1.map((row, ri) =>
              row.map((t, ai) => (
                <rect
                  key={`${ri}-${ai}`}
                  x={cx(ai) + (cw(ai) > 3 ? 0.5 : 0)}
                  y={ry(ri) + 0.5}
                  width={Math.max(0.6, cw(ai) - (cw(ai) > 3 ? 1 : 0))}
                  height={cellH - 1}
                  fill={color[tokenRole(item, t)]}
                  opacity={hoverRow == null || hoverRow === ri ? 0.92 : 0.55}
                  onMouseEnter={() => { setHoverRow(ri); setTip({ x: px[ai] + m.left, y: ry(ri) + m.top, row: ri, ai }); }}
                />
              )),
            )}
            <rect x={edges[0]} y={ry(mRow)} width={edges[nA] - edges[0]} height={cellH} fill="none" stroke="var(--ink)" strokeWidth={1.5} pointerEvents="none" />
            {layerTicks.map((l, i) => {
              const ri = stats.layers.indexOf(l);
              return (
                <text key={i} className="tick-label" x={edges[0] - 6} y={ry(ri) + cellH / 2 + 3.5} textAnchor="end" fontSize={10}>
                  {l}
                </text>
              );
            })}
            <text className="axis-title" x={-m.left + 4} y={ih / 2} fontSize={11}>Layer</text>
            <text className="annot-muted" x={edges[nA] + 4} y={ry(mRow) + cellH / 2 + 3.5} fontSize={10}>◀</text>
            {pushTicks(stats.maxAlpha).map((t) => (
              <text key={t} className="tick-label" x={xs(t)} y={ih + 13} textAnchor="middle" fontSize={10}>{t}</text>
            ))}
          </g>
        </svg>
      )}
      {tip && (
        <Tip x={tip.x} y={tip.y} width={width}>
          <div className="t-head">Layer {stats.layers[tip.row]}, push {stats.alphas[tip.ai].toFixed(2)}</div>
          <div className="t-muted">Model says “{tok(item.curves.top1[tip.row][tip.ai])}”</div>
        </Tip>
      )}
    </div>
  );
}

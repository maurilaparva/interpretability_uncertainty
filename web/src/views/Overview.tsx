import * as d3 from 'd3';
import { useState } from 'react';
import { fmtMargin, mval, pct, pushScale, pushTicks, quadrantOf, tok, type Quadrant } from '../lib/data';
import { useSize } from '../lib/hooks';
import type { Item, Stats } from '../lib/types';
import { Tip } from '../components/Tip';

interface Props {
  items: Item[];
  stats: Stats;
  selectedId: string;
  revealKey: boolean;
  onOpen: (id: string) => void;
}

const QLABEL: Record<Quadrant, string> = {
  'confident-robust': 'Confident & robust',
  'confident-fragile': 'Confident but fragile',
  'unsure-stable': 'Unsure but stable',
  'unsure-fragile': 'Unsure & fragile',
};

export function Overview({ items, stats, selectedId, revealKey, onOpen }: Props) {
  const cf = items.filter((it) => quadrantOf(it, stats) === 'confident-fragile');
  const cfWrong = cf.filter((it) => !it.correct).length;
  const n = items.length;
  const rho = spearman(items.map((it) => it.p_answer), items.map((it) => mval(it, stats)));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <p style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', textWrap: 'balance' }}>
            {cf.length > 0 ? (
              <>
                {cf.length} of {n} answers look <span style={{ color: 'var(--answer)' }}>confident</span> but are{' '}
                <span style={{ color: 'var(--alt)' }}>mechanistically fragile</span>.
              </>
            ) : (
              <>No answer here is both confident and fragile: the two signals agree on this set.</>
            )}
          </p>
          <p className="caption" style={{ marginTop: 4 }}>
            {revealKey && cf.length > 0 && <>{cfWrong} of those {cf.length} are wrong. </>}
            Rank correlation between confidence and robustness: ρ = {rho.toFixed(2)}
            {Math.abs(rho) < 0.5 ? ' (weak, so the margin adds information).' : ' (strong, so the signals largely overlap).'}{' '}
            Click a point to open its flip curve.
          </p>
        </div>
        <div className="legend">
          {revealKey ? (
            <>
              <span><Glyph correct /> Correct</span>
              <span><Glyph correct={false} /> Incorrect</span>
            </>
          ) : (
            <span className="caption">Turn on “Show answer key” to mark correct / incorrect answers.</span>
          )}
          <span><span className="sw sw-dash" style={{ borderColor: '#a8a29e' }} />medians</span>
        </div>
      </div>
      <div className="panel" style={{ flex: 1, minHeight: 0 }}>
        <Scatter items={items} stats={stats} selectedId={selectedId} revealKey={revealKey} onOpen={onOpen} />
      </div>
    </>
  );
}

function Glyph({ correct }: { correct: boolean }) {
  return (
    <svg width={14} height={14} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden>
      {correct ? (
        <circle cx={7} cy={7} r={5} fill="var(--correct)" />
      ) : (
        <path d="M3 3 L11 11 M11 3 L3 11" stroke="var(--incorrect)" strokeWidth={2.5} strokeLinecap="round" />
      )}
    </svg>
  );
}

function Scatter({ items, stats, selectedId, revealKey, onOpen }: Props) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<Item | null>(null);
  const m = { top: 16, right: 24, bottom: 48, left: 66 };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);

  const pExt = d3.extent(items, (it) => it.p_answer) as [number, number];
  const x = d3.scaleLinear().domain([Math.min(0, pExt[0]), 1]).range([0, iw]);
  const yMax = stats.cap + 0.08;
  const y = pushScale(yMax, [ih, 0]);
  const yCens = y(stats.cap);
  const mxp = x(stats.medP);
  const myp = y(stats.medM);

  const cornerPad = 10;
  const quadText: { q: Quadrant; x: number; y: number; anchor: 'start' | 'end' }[] = [
    { q: 'unsure-stable', x: cornerPad, y: y(stats.maxAlpha) + 16, anchor: 'start' },
    { q: 'confident-robust', x: iw - cornerPad, y: y(stats.maxAlpha) + 16, anchor: 'end' },
    { q: 'unsure-fragile', x: cornerPad, y: ih - 10, anchor: 'start' },
    { q: 'confident-fragile', x: iw - cornerPad, y: ih - 10, anchor: 'end' },
  ];

  const pos = (it: Item) => ({ cx: x(it.p_answer), cy: y(mval(it, stats)) });
  const yTicks = pushTicks(stats.maxAlpha);

  return (
    <div ref={ref} className="chart-fill" style={{ minHeight: 280 }}>
      {width > 0 && height > 0 && (
        <svg width={width} height={height} role="img" aria-label="Scatter plot of output confidence versus robustness margin">
          <g transform={`translate(${m.left},${m.top})`}>
            {/* highlight the key quadrant */}
            <rect x={mxp} y={myp} width={Math.max(0, iw - mxp)} height={Math.max(0, ih - myp)} fill="var(--alt-soft)" opacity={0.55} />
            {/* censored band */}
            <rect x={0} y={y(yMax)} width={iw} height={y(stats.maxAlpha) - y(yMax) - 4} fill="var(--accent-bg)" />
            <text className="annot-muted" x={-8} y={yCens + 4} textAnchor="end">&gt; {stats.maxAlpha}</text>
            <text className="annot-muted" x={iw / 2} y={y(yMax) + 11} textAnchor="middle" fontSize={10}>
              never flipped within tested pushes
            </text>

            {yTicks.map((t) => (
              <g key={t}>
                <line className="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
                <text className="tick-label" x={-8} y={y(t) + 4} textAnchor="end">{t}</text>
              </g>
            ))}
            {x.ticks(5).map((t) => (
              <text key={t} className="tick-label" x={x(t)} y={ih + 16} textAnchor="middle">{pct(t)}</text>
            ))}
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke="#d6d3d1" />
            <text className="axis-title" x={iw / 2} y={ih + 38} textAnchor="middle">
              Output confidence: probability of the model's answer →
            </text>
            <text className="axis-title" transform={`translate(${-m.left + 14},${ih / 2}) rotate(-90)`} textAnchor="middle">
              Robustness: push needed to flip it (√ scale) →
            </text>

            <line className="median-line" x1={mxp} x2={mxp} y1={y(yMax)} y2={ih} />
            <line className="median-line" x1={0} x2={iw} y1={myp} y2={myp} />

            {quadText.map(({ q, x: tx, y: ty, anchor }) => (
              <text
                key={q}
                x={tx}
                y={ty}
                textAnchor={anchor}
                className="halo"
                fontSize={q === 'confident-fragile' ? 13 : 12}
                fontWeight={q === 'confident-fragile' ? 700 : 500}
                fill={q === 'confident-fragile' ? 'var(--alt)' : 'var(--muted)'}
              >
                {QLABEL[q]}
              </text>
            ))}

            {/* points */}
            {items.map((it) => {
              const { cx, cy } = pos(it);
              const sel = it.id === selectedId;
              const hov = hover?.id === it.id;
              const r = hov || sel ? 7 : 5.5;
              return (
                <g
                  key={it.id}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: 'pointer', transition: 'transform var(--t)' }}
                  onMouseEnter={() => setHover(it)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onOpen(it.id)}
                  role="button"
                  aria-label={`${it.question} Answer ${it.answer_text}. Confidence ${pct(it.p_answer)}, robustness ${fmtMargin(it, stats)}`}
                >
                  <circle r={14} fill="transparent" />
                  {sel && <circle r={11} fill="none" stroke="var(--answer)" strokeWidth={2} />}
                  {!revealKey ? (
                    <circle r={r} fill="#57534e" stroke="#fff" strokeWidth={2} />
                  ) : it.correct ? (
                    <circle r={r} fill="var(--correct)" stroke="#fff" strokeWidth={2} />
                  ) : (
                    <g stroke="var(--incorrect)" strokeLinecap="round">
                      <path d={`M${-r} ${-r} L${r} ${r} M${r} ${-r} L${-r} ${r}`} stroke="#fff" strokeWidth={6} />
                      <path d={`M${-r} ${-r} L${r} ${r} M${r} ${-r} L${-r} ${r}`} strokeWidth={3} />
                    </g>
                  )}
                </g>
              );
            })}
            {/* selective direct labels: the key quadrant */}
            {items
              .filter((it) => quadrantOf(it, stats) === 'confident-fragile')
              .map((it) => {
                const { cx, cy } = pos(it);
                return (
                  <text key={`l${it.id}`} x={cx - 10} y={cy + 4} textAnchor="end" className="halo" fontSize={11} fill="var(--ink-2)" pointerEvents="none">
                    {it.answer_text || tok(it.answer_token)}
                  </text>
                );
              })}
          </g>
        </svg>
      )}
      {hover && (
        <Tip x={pos(hover).cx + m.left} y={pos(hover).cy + m.top - 8} width={width}>
          <div className="t-head">{hover.question}</div>
          <div>Model: <strong>{hover.answer_text}</strong>{revealKey && <> ({hover.correct ? '✓ correct' : `✕ correct is ${hover.gold}`})</>}</div>
          <div className="t-muted">
            Confidence {pct(hover.p_answer)} · Robustness {fmtMargin(hover, stats)}
            {!hover.censored && <> (layer {hover.margin_layer})</>}
          </div>
          <div className="t-muted">{QLABEL[quadrantOf(hover, stats)]} · click to open flip curve</div>
        </Tip>
      )}
    </div>
  );
}

function rank(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

function spearman(a: number[], b: number[]): number {
  const ra = rank(a);
  const rb = rank(b);
  const ma = d3.mean(ra)!;
  const mb = d3.mean(rb)!;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

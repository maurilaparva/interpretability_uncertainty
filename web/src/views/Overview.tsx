import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import { fmtMargin, mval, pct, pushScale, pushTicks, quadrantOf, spearman, tok, type Quadrant } from '../lib/data';
import { useSize } from '../lib/hooks';
import type { Item, Stats } from '../lib/types';
import { Tip } from '../components/Tip';

interface Props {
  items: Item[];
  stats: Stats;
  selectedId: string;
  revealKey: boolean;
  allowReveal?: boolean;
  onOpen: (id: string) => void;
  /** Explorer: clicking a point opens its flip curve. Study: it only selects the question, so no view is favoured. */
  clickOpensFlipCurve?: boolean;
  /** Stripped-down plot for first-time viewers: axes and dots, the selected question labelled, nothing else. */
  simple?: boolean;
}

// The quadrants split at the medians, so they say "easier / harder to flip than most". Fragile / Moderate / Robust
// are reserved for R1's thirds; reusing them here labelled some answers "fragile" that R1 calls Moderate.
const QLABEL: Record<Quadrant, string> = {
  'confident-robust': 'Confident · harder to flip',
  'confident-fragile': 'Confident but easier to flip',
  'unsure-stable': 'Unsure · harder to flip',
  'unsure-fragile': 'Unsure · easier to flip',
};

export function Overview({ items, stats, selectedId, revealKey, onOpen, allowReveal = true, simple = false, clickOpensFlipCurve = true }: Props) {
  if (simple) {
    return (
      <>
        <div>
          <p style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>All {items.length} questions at once</p>
          <p className="explain" style={{ marginTop: 4 }}>
            Each dot is one question: how sure the model's output is (left to right) and how hard its answer is to flip (bottom to top).
          </p>
        </div>
        <div className="panel" style={{ flex: 1, minHeight: 0 }}>
          <Scatter items={items} stats={stats} selectedId={selectedId} revealKey={false} onOpen={onOpen} simple />
        </div>
      </>
    );
  }
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
                {/* plain ink: blue and orange mean "the answer word" and "the word it is pushed toward" elsewhere */}
                {cf.length} of {n} answers look <strong>confident</strong> but are <strong>easier to flip than most</strong>.
              </>
            ) : (
              <>No answer here is both confident and easier to flip than most: the two signals agree on this set.</>
            )}
          </p>
          <p className="explain" style={{ marginTop: 4 }}>
            {revealKey && cf.length > 0 && (
              <>{cfWrong === 0 ? `None of those ${cf.length} is wrong` : `${cfWrong} of those ${cf.length} ${cfWrong === 1 ? 'is' : 'are'} wrong`}. </>
            )}
            Rank correlation between confidence and robustness: ρ = {rho.toFixed(2)}
            {Math.abs(rho) < 0.5 ? ' (weak, so the margin adds information).' : ' (strong, so the signals largely overlap).'}{' '}
            {clickOpensFlipCurve ? 'Click a point to open its flip curve.' : 'Click a point to select that question.'}
          </p>
        </div>
        <div className="legend">
          {revealKey ? (
            <>
              <span><Glyph correct /> Correct</span>
              <span><Glyph correct={false} /> Incorrect</span>
            </>
          ) : allowReveal ? (
            <span className="caption">Turn on “Show answer key” to mark correct / incorrect answers.</span>
          ) : null}
          <span><span className="sw sw-dash" style={{ borderColor: '#a8a29e' }} />medians</span>
        </div>
      </div>
      <div className="panel" style={{ flex: 1, minHeight: 0 }}>
        <Scatter items={items} stats={stats} selectedId={selectedId} revealKey={revealKey} onOpen={onOpen} clickOpensFlipCurve={clickOpensFlipCurve} />
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

function Scatter({ items, stats, selectedId, revealKey, onOpen, simple = false, clickOpensFlipCurve = true }: Props) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<Item | null>(null);
  // Opens on the middle half of the questions (by confidence), so the extremes are off-screen and found by exploring;
  // the mini-map below always shows all of them. The simple plot (study tour) always shows everything.
  const [zoom, setZoom] = useState<[number, number] | null>(() => (simple ? null : middleWindow(items)));
  const [pan, setPan] = useState<{ startX: number; start: [number, number] } | null>(null);
  const m = { top: 16, right: 24, bottom: 68, left: 92 };
  const iw = Math.max(10, width - m.left - m.right);
  const ih = Math.max(10, height - m.top - m.bottom);

  const pExt = d3.extent(items, (it) => it.p_answer) as [number, number];
  // Plain 0–100% axis, shown zoomed in on a confidence range (still evenly spaced). Dragging the chart moves that
  // range sideways, like the box in the mini-map below; the box's edges zoom, and "Show all" goes back to 0–100%.
  const full: [number, number] = [Math.min(0, pExt[0]), 1];
  const x = d3.scaleLinear().domain(zoom ?? full).range([0, iw]);
  const xTicks = x.ticks(zoom ? 8 : 5);
  const inView = (p: number) => p >= x.domain()[0] && p <= x.domain()[1];
  const hiddenLeft = items.filter((it) => it.p_answer < x.domain()[0]).length;
  const hiddenRight = items.filter((it) => it.p_answer > x.domain()[1]).length;
  const yMax = stats.displayMax;
  const yTop = stats.anyCensored ? stats.maxAlpha : yMax;
  const y = pushScale(yMax, [ih, 0]);
  const yCens = y(stats.cap);
  const mxp = x(stats.medP);
  const myp = y(stats.medM);

  const cornerPad = 10;
  const quadText: { q: Quadrant; x: number; y: number; anchor: 'start' | 'end' }[] = [
    { q: 'unsure-stable', x: cornerPad, y: y(yTop) + 16, anchor: 'start' },
    { q: 'confident-robust', x: iw - cornerPad, y: y(yTop) + 16, anchor: 'end' },
    { q: 'unsure-fragile', x: cornerPad, y: ih - 10, anchor: 'start' },
    { q: 'confident-fragile', x: iw - cornerPad, y: ih - 10, anchor: 'end' },
  ];

  const pos = (it: Item) => ({ cx: x(it.p_answer), cy: y(mval(it, stats)) });
  const yTicks = pushTicks(yTop);

  return (
    <>
    <div ref={ref} className="chart-fill" style={{ minHeight: 280 }}>
      {width > 0 && height > 0 && (
        <svg width={width} height={height} role="img" aria-label="Scatter plot of output confidence versus robustness margin">
          <g transform={`translate(${m.left},${m.top})`}>
            {/* highlight the key quadrant */}
            {!simple && <rect x={Math.max(0, Math.min(iw, mxp))} y={myp} width={Math.max(0, iw - Math.max(0, mxp))} height={Math.max(0, ih - myp)} fill="var(--band-fragile-soft)" />}
            {/* drag empty space to move the zoomed range; points sit above this, so clicks still reach them */}
            {!simple && zoom && <rect x={0} y={0} width={iw} height={ih} fill="transparent" style={{ cursor: pan ? 'grabbing' : 'grab', touchAction: 'none' }}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setPan({ startX: event.clientX, start: zoom }); }}
              onPointerMove={(event) => {
                if (!pan) return;
                const span = pan.start[1] - pan.start[0];
                const from = Math.max(full[0], Math.min(full[1] - span, pan.start[0] - ((event.clientX - pan.startX) / iw) * span));
                setZoom([from, from + span]);
              }}
              onPointerUp={() => setPan(null)} />}
            {/* censored band (only when some answer never flipped) */}
            {stats.anyCensored && (
              <>
                <rect x={0} y={y(yMax)} width={iw} height={y(stats.maxAlpha) - y(yMax) - 4} fill="var(--accent-bg)" />
                <text className="annot-muted" x={-8} y={yCens + 4} textAnchor="end">&gt; {stats.maxAlpha}</text>
                <text className="annot-muted" x={iw / 2} y={y(yMax) + 11} textAnchor="middle" fontSize={10}>
                  never flipped within tested pushes
                </text>
              </>
            )}

            {yTicks.map((t) => (
              <g key={t}>
                <line className="gridline" x1={0} x2={iw} y1={y(t)} y2={y(t)} />
                <text className="tick-label" x={-8} y={y(t) + 4} textAnchor="end">{t}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} className="tick-label" x={x(t)} y={ih + 16} textAnchor="middle">{pct(t)}</text>
            ))}
            <line x1={0} x2={iw} y1={ih} y2={ih} stroke="#d6d3d1" />
            {/* axis name on the first line, what it means on the second */}
            <text className="axis-title" x={iw / 2} y={ih + 40} textAnchor="middle" style={{ fontSize: 15, fontWeight: 600 }}>Output confidence →</text>
            <text className="axis-title" x={iw / 2} y={ih + 58} textAnchor="middle" style={{ fontSize: 13, fill: 'var(--muted)' }}>
              probability of the model's answer{zoom ? ' (zoomed in)' : ''}
            </text>
            <text className="axis-title" transform={`translate(${-m.left + 16},${ih / 2}) rotate(-90)`} textAnchor="middle" style={{ fontSize: 15, fontWeight: 600 }}>Robustness →</text>
            <text className="axis-title" transform={`translate(${-m.left + 34},${ih / 2}) rotate(-90)`} textAnchor="middle" style={{ fontSize: 13, fill: 'var(--muted)' }}>
              push needed to flip the answer (√ scale)
            </text>

            {!simple && inView(stats.medP) && <line className="median-line" x1={mxp} x2={mxp} y1={y(yMax)} y2={ih} />}
            {!simple && <line className="median-line" x1={0} x2={iw} y1={myp} y2={myp} />}

            {!simple && quadText.map(({ q, x: tx, y: ty, anchor }) => (
              <text
                key={q}
                x={tx}
                y={ty}
                textAnchor={anchor}
                className="halo"
                fontSize={q === 'confident-fragile' ? 13 : 12}
                fontWeight={q === 'confident-fragile' ? 700 : 500}
                fill={q === 'confident-fragile' ? 'var(--ink)' : 'var(--muted)'}
              >
                {QLABEL[q]}
              </text>
            ))}

            {/* points */}
            {items.filter((it) => inView(it.p_answer)).map((it) => {
              const { cx, cy } = pos(it);
              const sel = it.id === selectedId;
              const hov = hover?.id === it.id;
              const r = hov || sel ? 7 : 5.5;
              return (
                <g
                  key={it.id}
                  transform={`translate(${cx},${cy})`}
                  style={{ cursor: simple ? 'default' : 'pointer', transition: pan ? 'none' : 'transform var(--t)' }}
                  onMouseEnter={() => setHover(it)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onOpen(it.id)}
                  role={simple ? undefined : 'button'}
                  aria-label={`${it.question} Answer ${it.answer_text}. Confidence ${pct(it.p_answer)}, robustness ${fmtMargin(it, stats)}`}
                >
                  <circle r={14} fill="transparent" />
                  {sel && <circle r={11} fill="none" stroke="var(--ink)" strokeWidth={2} />}
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
              .filter((it) => inView(it.p_answer) && (simple ? it.id === selectedId : quadrantOf(it, stats) === 'confident-fragile'))
              .map((it) => {
                const { cx, cy } = pos(it);
                return (
                  <text key={`l${it.id}`} x={cx - 10} y={cy + 4} textAnchor="end" className="halo" fontSize={11} fill="var(--ink-2)" pointerEvents="none">
                    {it.answer_text || tok(it.answer_token)}
                  </text>
                );
              })}
            {/* questions outside the zoomed range */}
            {hiddenLeft > 0 && <text className="annot-muted halo" x={6} y={ih / 2} pointerEvents="none">◀ {hiddenLeft} more</text>}
            {hiddenRight > 0 && <text className="annot-muted halo" x={iw - 6} y={ih / 2} textAnchor="end" pointerEvents="none">{hiddenRight} more ▶</text>}
          </g>
        </svg>
      )}
      {width > 0 && !simple && (
        <div className="scatter-zoom" style={{ right: m.right }}>
          {zoom
            ? <><span className="caption">Drag the chart to move it</span> <button className="btn" onClick={() => setZoom(null)}>Show all (0–100%)</button></>
            : <span className="caption">Resize the box below to zoom in</span>}
        </div>
      )}
      {hover && (
        <Tip x={pos(hover).cx + m.left} y={pos(hover).cy + m.top - 8} width={width}>
          <div className="t-head">{hover.question}</div>
          <div>Model: <strong>{hover.answer_text}</strong>{revealKey && <> ({hover.correct ? '✓ correct' : `✕ correct is ${hover.gold}`})</>}</div>
          <div className="t-muted">
            Confidence {pct(hover.p_answer)} · Robustness {fmtMargin(hover, stats)}
            {!hover.censored && <> (layer {hover.margin_layer})</>}
          </div>
          {!simple && <div className="t-muted">{QLABEL[quadrantOf(hover, stats)]} · {clickOpensFlipCurve ? 'click to open flip curve' : 'click to select'}</div>}
        </Tip>
      )}
    </div>
    {!simple && <MiniMap items={items} stats={stats} selectedId={selectedId} full={full} window={zoom} onWindow={setZoom} left={m.left} right={m.right} />}
    </>
  );
}

/** Confidence range covering the middle half of the questions, with a little margin. */
function middleWindow(items: Item[]): [number, number] {
  const ps = items.map((it) => it.p_answer).sort(d3.ascending);
  return [Math.max(0, (d3.quantileSorted(ps, 0.25) ?? 0) - 0.03), Math.min(1, (d3.quantileSorted(ps, 0.75) ?? 1) + 0.03)];
}

/**
 * Overview + detail: every question on the full 0–100% range, with a box marking what the main plot shows.
 * Drag the box to move it, drag its edges to resize, click outside it to show everything.
 */
function MiniMap({ items, stats, selectedId, full, window, onWindow, left, right }: {
  items: Item[]; stats: Stats; selectedId: string; full: [number, number]; window: [number, number] | null;
  onWindow: (window: [number, number] | null) => void; left: number; right: number;
}) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const brushRef = useRef<SVGGElement>(null);
  const brushApi = useRef<{ brush: d3.BrushBehavior<unknown>; x: d3.ScaleLinear<number, number> } | null>(null);
  const fromBrush = useRef(false);
  const h = 46;
  const iw = Math.max(10, width - left - right);
  const x = d3.scaleLinear().domain(full).range([0, iw]);
  const y = pushScale(stats.displayMax, [h - 4, 4]);

  // Built once per size: rebuilding it on every render (e.g. while the box is being dragged) would cut the drag short.
  const lo = full[0];
  useEffect(() => {
    if (!brushRef.current || width === 0) return;
    const xs = d3.scaleLinear().domain([lo, 1]).range([0, iw]);
    const brush = d3.brushX().extent([[0, 0], [iw, h]]).on('brush end', (event: d3.D3BrushEvent<unknown>) => {
      if (!event.sourceEvent) return; // moved by code, not by the participant
      const s = event.selection as [number, number] | null;
      fromBrush.current = true;
      onWindow(s && s[1] - s[0] > 3 ? [xs.invert(s[0]), xs.invert(s[1])] : null);
    });
    d3.select(brushRef.current).call(brush);
    brushApi.current = { brush, x: xs };
    return () => { brush.on('brush end', null); };
  }, [width, iw, lo, onWindow]);

  // Follow changes made elsewhere (dragging the main plot, "Show all"); skip the ones the brush made itself.
  useEffect(() => {
    const api = brushApi.current;
    if (!api || !brushRef.current) return;
    if (fromBrush.current) { fromBrush.current = false; return; }
    d3.select(brushRef.current).call(api.brush.move, window ? [api.x(window[0]), api.x(window[1])] : null);
  }, [window, width]);

  return (
    <div ref={ref} className="minimap">
      <span className="caption" style={{ marginLeft: left }}>All questions · drag the box to move it, or its edges to resize</span>
      {width > 0 && (
        <svg width={width} height={h + 16} aria-hidden="true">
          <g transform={`translate(${left},0)`}>
            <rect x={0} y={0} width={iw} height={h} fill="var(--accent-bg)" rx={4} />
            {items.map((it) => (
              <circle key={it.id} cx={x(it.p_answer)} cy={y(mval(it, stats))} r={it.id === selectedId ? 3.5 : 2.5}
                fill={it.id === selectedId ? 'var(--ink)' : '#a8a29e'} />
            ))}
            {[0, 0.25, 0.5, 0.75, 1].filter((t) => t >= full[0]).map((t) => (
              <text key={t} className="tick-label" x={x(t)} y={h + 12} textAnchor="middle" fontSize={10}>{pct(t)}</text>
            ))}
            <g ref={brushRef} className="minimap-brush" />
          </g>
        </svg>
      )}
    </div>
  );
}

import { useState } from 'react';
import { bandOf, comparePhrase, fmtMargin, mval, pushScale, pushTicks } from '../lib/data';
import { useSize } from '../lib/hooks';
import type { Band, Item, Stats } from '../lib/types';
import { Tip } from '../components/Tip';
import { useGuidance } from '../components/GuidanceContext';

const BAND_FILL: Record<Band, string> = {
  Fragile: 'var(--band-fragile)',
  Moderate: 'var(--band-moderate)',
  Robust: 'var(--band-robust)',
};
const BAND_INK: Record<Band, string> = { Fragile: '#134e4a', Moderate: '#134e4a', Robust: '#ffffff' };

interface Props {
  item: Item;
  items: Item[];
  stats: Stats;
  compact?: boolean;
}

export function R1Score({ item, items, stats, compact }: Props) {
  const guided = useGuidance();
  const band = bandOf(item, stats);
  const censored = item.censored || item.margin == null;

  const sentence = censored
    ? `No push we tested (up to ${stats.maxAlpha}) changed this answer — among the most robust in the set.`
    : comparePhrase(item, stats, 'long');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 14, flex: compact ? 1 : undefined, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: compact ? 22 : 30, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
          Robustness {fmtMargin(item, stats)}
        </span>
        <span
          style={{
            fontSize: compact ? 13 : 15, fontWeight: 650, padding: '2px 10px', borderRadius: 999,
            background: BAND_FILL[band], color: BAND_INK[band],
          }}
        >
          {band}
        </span>
        {guided && <span className="caption">relative to this set</span>}
      </div>
      <Gauge item={item} items={items} stats={stats} height={compact ? 94 : 120} />
      <p className={compact ? 'caption' : 'lede'} style={compact ? { color: 'var(--ink-2)', fontSize: 13 } : undefined}>
        {sentence}
      </p>
      {!compact && (
        <p className="explain">
          Robustness = the smallest internal push (relative to the size of the model's internal state) that changes the
          answer. Bands are the lower, middle and upper thirds of the {items.length} questions in this set. Faint ticks
          show the other questions.
          {guided && ' High robustness does not mean the answer is correct.'}
        </p>
      )}
    </div>
  );
}

function Gauge({ item, items, stats, height }: { item: Item; items: Item[]; stats: Stats; height: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ it: Item; x: number } | null>(null);
  const m = { left: 8, right: 8 };
  const top = 30; // room for marker label
  const barH = 26;
  const x = pushScale(stats.displayMax, [m.left, Math.max(m.left + 10, width - m.right)]);
  const bands: { b: Band; from: number; to: number }[] = [
    { b: 'Fragile', from: 0, to: stats.t1 },
    { b: 'Moderate', from: stats.t1, to: stats.t2 },
    { b: 'Robust', from: stats.t2, to: stats.displayMax },
  ];
  const mx = x(mval(item, stats));
  const narrow = width < 560;
  const ticks = stats.anyCensored
    ? pushTicks(stats.maxAlpha, narrow).filter((t) => t < stats.maxAlpha)
    : pushTicks(stats.displayMax, narrow);
  const label = `${fmtMargin(item, stats)}`;

  return (
    <div ref={ref} style={{ position: 'relative', height, flexShrink: 0 }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Robustness gauge: ${label}, ${bandOf(item, stats)}`}>
          {bands.map(({ b, from, to }, i) =>
            to > from ? (
              <g key={b}>
                <rect
                  x={x(from) + (i ? 1 : 0)}
                  y={top}
                  width={Math.max(0, x(to) - x(from) - (i ? 1 : 0) - (i < 2 ? 1 : 0))}
                  height={barH}
                  rx={i === 0 || i === 2 ? 6 : 0}
                  fill={BAND_FILL[b]}
                />
                {x(to) - x(from) > 64 && (
                  <text
                    x={(x(from) + x(to)) / 2}
                    y={top + barH / 2 + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={600}
                    fill={BAND_INK[b]}
                  >
                    {b}
                  </text>
                )}
              </g>
            ) : null,
          )}
          {/* censored region marker */}
          {stats.anyCensored && (
            <line x1={x(stats.maxAlpha)} x2={x(stats.maxAlpha)} y1={top - 3} y2={top + barH + 3} stroke="#fff" strokeWidth={2} strokeDasharray="3 2" />
          )}
          {/* other items */}
          {items.map((o) =>
            o.id === item.id ? null : (
              <line
                key={o.id}
                x1={x(mval(o, stats))}
                x2={x(mval(o, stats))}
                y1={top + barH + 4}
                y2={top + barH + 11}
                stroke="#a8a29e"
                strokeWidth={1.5}
                onMouseEnter={() => setHover({ it: o, x: x(mval(o, stats)) })}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'default' }}
              />
            ),
          )}
          {/* hit areas for other-item ticks */}
          {items.map((o) =>
            o.id === item.id ? null : (
              <rect
                key={`h${o.id}`}
                x={x(mval(o, stats)) - 4}
                y={top + barH + 2}
                width={8}
                height={14}
                fill="transparent"
                onMouseEnter={() => setHover({ it: o, x: x(mval(o, stats)) })}
                onMouseLeave={() => setHover(null)}
              />
            ),
          )}
          {/* axis */}
          {ticks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={top + barH + 26}
              textAnchor={t === 0 ? 'start' : t === stats.displayMax ? 'end' : 'middle'}
              className="tick-label"
            >
              {t}
            </text>
          ))}
          {stats.anyCensored && (
            <text x={x(stats.cap)} y={top + barH + 26} textAnchor="end" className="tick-label">
              {stats.maxAlpha}+
            </text>
          )}
          {/* marker */}
          <g style={{ transform: `translateX(${mx}px)`, transition: 'transform var(--t) ease-out' }}>
            <line x1={0} x2={0} y1={top - 6} y2={top + barH + 2} stroke="var(--ink)" strokeWidth={2.5} />
            <path d="M -6 -12 L 6 -12 L 0 -4 Z" transform={`translate(0, ${top})`} fill="var(--ink)" />
          </g>
        </svg>
      )}
      {hover && (
        <Tip x={hover.x} y={top + barH + 4} width={width}>
          <div className="t-head">{hover.it.question}</div>
          <div className="t-muted">Robustness {fmtMargin(hover.it, stats)} · {bandOf(hover.it, stats)}</div>
        </Tip>
      )}
    </div>
  );
}

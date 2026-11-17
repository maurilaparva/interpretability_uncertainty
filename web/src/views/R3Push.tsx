import * as d3 from 'd3';
import { useEffect, useState } from 'react';
import { fmtPush, pct, rowOfLayer, tokenRole, wordFor } from '../lib/data';
import type { Item, Stats } from '../lib/types';

interface Props {
  item: Item;
  stats: Stats;
  compact?: boolean;
}

const STEP_MS = 160;

export function R3Push({ item, stats, compact }: Props) {
  const { alphas, layers } = stats;
  const nA = alphas.length;
  const [ai, setAi] = useState(0);
  const [row, setRow] = useState(() => rowOfLayer(stats, item.margin_layer));
  const [playing, setPlaying] = useState(false);

  const perLayer = item.per_layer_margin[row];
  // first grid index at which this layer's top-1 differs from the answer
  const flipIdx = item.curves.top1[row].findIndex((t) => tokenRole(item, t) !== 'answer');
  const playEnd = flipIdx >= 0 ? Math.min(nA - 1, flipIdx + 3) : nA - 1;

  // Auto-play: one grid step per tick; stops a few steps past this layer's flip.
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      const next = Math.min(ai + 1, playEnd);
      setAi(next);
      if (next >= playEnd) setPlaying(false);
    }, ai === 0 ? 400 : STEP_MS);
    return () => window.clearTimeout(id);
  }, [playing, ai, playEnd]);

  const play = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setAi(0);
    setPlaying(true);
  };

  const top = item.curves.top1[row][ai];
  const role = tokenRole(item, top);
  const pA = item.curves.p_answer[row][ai];
  const pB = item.curves.p_alt[row][ai];
  const a = alphas[ai];

  const flipPct = perLayer == null ? null : Math.max(0, d3.bisectLeft(alphas, perLayer) - 0.5) / (nA - 1);
  const word = wordFor(item, top);
  const big = (compact ? 30 : 44) * (word.length > 12 ? (compact ? 0.62 : 0.8) : 1);

  const controls = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 16, minWidth: 0 }}>
      <label style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <strong>Push strength</strong>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtPush(a)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={nA - 1}
          step={1}
          value={ai}
          onChange={(e) => { setPlaying(false); setAi(Number(e.target.value)); }}
          style={{ width: '100%', accentColor: 'var(--ink)' }}
          aria-valuetext={`push ${fmtPush(a)}`}
        />
        <div style={{ position: 'relative', height: 16, fontSize: 11, color: 'var(--muted)' }}>
          {flipPct != null ? (
            <span
              style={{
                position: 'absolute', whiteSpace: 'nowrap',
                left: `calc(8px + ${flipPct} * (100% - 16px))`,
                transform: flipPct > 0.7 ? 'translateX(-100%)' : 'translateX(-6px)',
                transition: 'left var(--t)',
              }}
            >
              {flipPct > 0.7 ? `flips at ${fmtPush(perLayer!)} ▲` : `▲ flips at ${fmtPush(perLayer!)}`}
            </span>
          ) : (
            <span>never flips on this layer (≤ {stats.maxAlpha})</span>
          )}
        </div>
      </label>
      <label style={{ display: 'block' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
          <strong>Layer</strong>
          <span>
            {layers[row]}
            {layers[row] === item.margin_layer && <span style={{ color: 'var(--muted)' }}> (most fragile)</span>}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={layers.length - 1}
          step={1}
          value={row}
          onChange={(e) => { setPlaying(false); setRow(Number(e.target.value)); }}
          style={{ width: '100%', accentColor: 'var(--ink)' }}
          aria-valuetext={`layer ${layers[row]}`}
        />
        {!compact && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
            <span>early</span>
            <span>late</span>
          </div>
        )}
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn primary" onClick={play}>{playing ? '■ Stop' : '▶ Auto-play'}</button>
        <button className="btn" onClick={() => { setPlaying(false); setAi(0); setRow(rowOfLayer(stats, item.margin_layer)); }}>
          Reset
        </button>
      </div>
    </div>
  );

  const result = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 12, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
        At push {fmtPush(a)} on layer {layers[row]}, the model would say:
      </div>
      <div style={{ height: (compact ? 30 : 44) * 1.25, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'flex-end' }}>
        <div
          key={`${top}-${row}`}
          className={`tok ${role} swap-in`}
          style={{ fontSize: big, lineHeight: 1.2, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={word}
        >
          {word}
          {role === 'other' && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--muted)' }}> (a third word)</span>}
          {role !== 'answer' && (
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginLeft: 10, verticalAlign: 'middle' }}>
              answer changed
            </span>
          )}
        </div>
      </div>
      <ProbBar label={`P(“${wordFor(item, item.answer_token)}”)`} p={pA} color="var(--answer)" />
      <ProbBar label={`P(“${wordFor(item, item.alt_token)}”)`} p={pB} color="var(--alt)" />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 10, flex: compact ? 1 : undefined, minHeight: 0 }}>
      <div
        className="push-layout"
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr 1.1fr' : 'minmax(260px, 380px) 1fr',
          gap: compact ? 18 : 40,
          alignItems: 'start',
        }}
      >
        {controls}
        {result}
      </div>
      <p className="caption" style={compact ? { fontSize: 11, marginTop: 'auto' } : undefined}>
        Values are precomputed; the slider snaps to tested strengths.
      </p>
    </div>
  );
}

function ProbBar({ label, p, color }: { label: string; p: number; color: string }) {
  return (
    <div className="bar-row" style={{ gridTemplateColumns: 'minmax(80px, 130px) 1fr 44px' }}>
      <span className="name" style={{ fontSize: 12 }}>{label}</span>
      <div className="hbar">
        <div className="fill" style={{ width: `${p * 100}%`, background: color }} />
      </div>
      <span className="val">{pct(p)}</span>
    </div>
  );
}

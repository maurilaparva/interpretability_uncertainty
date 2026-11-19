import { pct, tok, tokenRole } from '../lib/data';
import type { Item } from '../lib/types';
import { useGuidance } from '../components/GuidanceContext';

const ROLE_COLOR = { answer: 'var(--answer)', alt: 'var(--alt)', other: 'var(--other)' } as const;

/** Full R0 view: output confidence + top-5 next-word distribution. */
export function R0Baseline({ item }: { item: Item }) {
  const guided = useGuidance();
  return (
    <div>
      <div className="baseline-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1fr)', gap: 48 }}>
        <div>
          <div className="panel-title"><span className="name">Output confidence</span></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 44, fontWeight: 650, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{pct(item.p_answer)}</span>
            <span style={{ fontSize: 15, color: 'var(--muted)' }}>how likely the model rated “{tok(item.answer_token)}”</span>
          </div>
          <ConfidenceBar p={item.p_answer} height={34} />
        </div>
        <div>
          <div className="panel-title"><span className="name">Top 5 next {guided ? 'tokens' : 'words'}</span></div>
          <Top5 item={item} />
        </div>
      </div>
      {/* Full width under both charts: the text needs the room more than the charts do. */}
      <p className="explain" style={{ marginTop: 26, maxWidth: '46em', fontSize: 18 }}>
        Before answering, the model rates <strong>how likely</strong> each possible next word is. It picked
        “{tok(item.answer_token)}”, which it rated <strong>{pct(item.p_answer)} likely</strong>. This is the
        {' '}<strong>confidence number</strong> AI tools usually show. It does <em>not</em> tell you if the answer is
        right, or how easily the answer could change.
      </p>
    </div>
  );
}

export function ConfidenceBar({ p, height = 22 }: { p: number; height?: number }) {
  return (
    <div className="hbar" style={{ height }} role="img" aria-label={`Output confidence ${pct(p)}`}>
      <div className="fill" style={{ width: `${p * 100}%`, background: 'var(--answer)' }} />
    </div>
  );
}

export function Top5({ item, n = 5, large = true }: { item: Item; n?: number; large?: boolean }) {
  const max = Math.max(...item.top5.map((t) => t.p), 0.01);
  return (
    <div className={large ? 'top5' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: large ? 12 : 6 }}>
      {item.top5.slice(0, n).map((t, i) => {
        const role = tokenRole(item, t.token);
        return (
          <div className="bar-row" key={i}>
            <span className={`name tok ${role}`} title={JSON.stringify(t.token)}>
              {tok(t.token)}
              {role === 'alt' && <span className="caption" style={{ fontWeight: 400 }}> · runner-up</span>}
            </span>
            <div className="hbar">
              <div className="fill" style={{ width: `${(t.p / max) * 100}%`, background: ROLE_COLOR[role] }} />
            </div>
            <span className="val">{pct(t.p)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** R0 panel for Compare all: the confidence number, its bar, and the runner-up words. */
export function R0Compact({ item }: { item: Item }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 30, fontWeight: 650, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{pct(item.p_answer)}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>how likely the model rated “{tok(item.answer_token)}”</span>
      </div>
      <ConfidenceBar p={item.p_answer} height={16} />
      <div>
        <div className="caption" style={{ marginBottom: 6 }}>Top next words</div>
        <Top5 item={item} n={3} large={false} />
      </div>
    </div>
  );
}

/** Slim strip (kept for narrow layouts). */
export function R0Strip({ item }: { item: Item }) {
  const others = item.top5.filter((t) => tokenRole(item, t.token) !== 'answer').slice(0, 3);
  return (
    <div className="panel baseline-strip" style={{ padding: '8px 14px', flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <span className="panel-title" style={{ margin: 0, whiteSpace: 'nowrap' }}>
        <span className="name">R0 · Baseline</span> output confidence
      </span>
      <span style={{ fontWeight: 650, fontSize: 18, fontVariantNumeric: 'tabular-nums', minWidth: 46 }}>{pct(item.p_answer)}</span>
      <div style={{ flex: 1, minWidth: 120 }}>
        <ConfidenceBar p={item.p_answer} height={12} />
      </div>
      <span className="caption" style={{ whiteSpace: 'nowrap' }}>
        next most likely:{' '}
        {others.map((t, i) => (
          <span key={i}>
            <span className={`tok ${tokenRole(item, t.token)}`}>{tok(t.token)}</span> {pct(t.p)}
            {i < others.length - 1 ? ', ' : ''}
          </span>
        ))}
      </span>
    </div>
  );
}

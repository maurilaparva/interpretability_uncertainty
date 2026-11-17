import { pct, tok, tokenRole } from '../lib/data';
import type { Item } from '../lib/types';
import { useGuidance } from '../components/GuidanceContext';

const ROLE_COLOR = { answer: 'var(--answer)', alt: 'var(--alt)', other: 'var(--other)' } as const;

/** Full R0 view: output confidence + top-5 next-word distribution. */
export function R0Baseline({ item }: { item: Item }) {
  const guided = useGuidance();
  return (
    <div className="baseline-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 1fr) minmax(280px, 1fr)', gap: 36 }}>
      <div>
        <div className="panel-title"><span className="name">Output confidence</span></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 40, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{pct(item.p_answer)}</span>
          <span className="caption">probability the model gave to “{tok(item.answer_token)}”</span>
        </div>
        <ConfidenceBar p={item.p_answer} />
        <p className="caption" style={{ marginTop: 12, maxWidth: '52ch' }}>
          {guided
            ? 'Probability assigned to the chosen first token, not the probability that the answer is correct.'
            : "This is what products typically show today: how likely the model's chosen first word was, read from its output. It says nothing about how stable the internal computation is."}
        </p>
      </div>
      <div>
        <div className="panel-title"><span className="name">Top 5 next {guided ? 'tokens' : 'words'}</span></div>
        <Top5 item={item} />
      </div>
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

export function Top5({ item, n = 5 }: { item: Item; n?: number }) {
  const max = Math.max(...item.top5.map((t) => t.p), 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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

/** Slim strip for the Compare-all screen. */
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

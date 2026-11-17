import type { Item } from '../lib/types';

interface Props {
  item: Item;
  revealKey: boolean;
  onReveal: () => void;
  compact?: boolean;
  allowReveal?: boolean;
}

export function AnswerHeader({ item, revealKey, onReveal, compact, allowReveal = true }: Props) {
  return (
    <div className={`answer-header ${compact ? 'compact' : ''}`}>
      {compact ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', minWidth: 0 }}>
          <span className="q">{item.question}</span>
          <span className="label">Model's answer</span>
          <span className="ans">{item.answer_text || item.answer_token.trim()}</span>
        </div>
      ) : (
        <div>
          <div className="q">{item.question}</div>
          <div className="label">Model's answer</div>
          <div className="ans">{item.answer_text || item.answer_token.trim()}</div>
        </div>
      )}
      {allowReveal && <div className="key">
        {revealKey ? (
          <>
            <span>
              Correct answer: <strong>{item.gold}</strong>
            </span>
            <span className={`verdict ${item.correct ? 'ok' : 'bad'}`}>
              {item.correct ? '✓ Correct' : '✕ Incorrect'}
            </span>
            <button className="btn-link" onClick={onReveal}>Hide</button>
          </>
        ) : (
          <button className="btn" onClick={onReveal} title="Shortcut: K">
            Reveal answer key
          </button>
        )}
      </div>}
    </div>
  );
}

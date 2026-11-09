import { useEffect, useRef } from 'react';
import type { Item } from '../lib/types';

interface Props {
  items: Item[];
  selectedId: string;
  revealKey: boolean;
  onSelect: (id: string) => void;
}

export function ItemList({ items, selectedId, revealKey, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('.qcard.active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const nCorrect = items.filter((i) => i.correct).length;
  return (
    <aside className="rail" ref={listRef} aria-label="Questions">
      <div className="rail-head">
        <span>Questions</span>
        {revealKey && <span>{nCorrect}/{items.length} correct</span>}
      </div>
      {items.map((it) => (
        <button
          key={it.id}
          className={`qcard ${it.id === selectedId ? 'active' : ''}`}
          onClick={() => onSelect(it.id)}
          aria-current={it.id === selectedId}
        >
          <span className="qid">{it.id.replace(/^q0?/, '')}</span>
          <span className="qtext">{it.question}</span>
          <span
            className={`dot ${revealKey ? (it.correct ? 'ok' : 'bad') : ''}`}
            aria-label={revealKey ? (it.correct ? 'correct' : 'incorrect') : undefined}
            title={revealKey ? (it.correct ? 'Model answered correctly' : 'Model answered incorrectly') : undefined}
          >
            {revealKey ? (it.correct ? '✓' : '✕') : ''}
          </span>
        </button>
      ))}
    </aside>
  );
}

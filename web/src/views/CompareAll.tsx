import type { ReactNode } from 'react';
import type { Item, Stats } from '../lib/types';
import type { ViewKey } from '../lib/views';
import { R0Compact } from './R0Baseline';
import { R1Score } from './R1Score';
import { R2FlipCurve } from './R2FlipCurve';
import { R3Push } from './R3Push';
import { R4Counterfactual } from './R4Counterfactual';

interface Props {
  header: ReactNode;
  item: Item;
  items: Item[];
  stats: Stats;
  /** Opens a view's own tab from its panel title. */
  onOpenView?: (view: ViewKey) => void;
}

function Panel({ code, name, onOpen, children }: { code: string; name: string; onOpen?: () => void; children: ReactNode }) {
  const title = <><span>{code}</span><span className="name">{name}</span></>;
  return (
    // The whole panel opens its tab, except clicks on its own controls (R3's sliders and buttons).
    <section className={`panel cmp-${code.toLowerCase()}${onOpen ? ' panel-clickable' : ''}`} style={{ padding: '10px 14px' }}
      onClick={(event) => { if (onOpen && !(event.target as Element).closest('button, input, select, label, a, textarea')) onOpen(); }}>
      <h2 className="panel-title">
        {onOpen
          ? <button type="button" className="panel-open" onClick={onOpen} title={`Open the ${name} tab`}>{title}<span aria-hidden="true">↗</span></button>
          : title}
      </h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function CompareAll({ header, item, items, stats, onOpenView }: Props) {
  return (
    <div className="compare-all" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {header}
      {/* Every view gets a full panel (R0 used to be a one-line strip, which made it look less important).
          Top row: the lighter views, a third each. Bottom row: the chart and the controls, half each. Spans in index.css. */}
      <div className="compare-grid">
        <Panel code="R0" onOpen={onOpenView && (() => onOpenView('r0'))} name="Baseline confidence">
          <R0Compact item={item} />
        </Panel>
        <Panel code="R1" onOpen={onOpenView && (() => onOpenView('r1'))} name="Margin score">
          <R1Score item={item} items={items} stats={stats} compact />
        </Panel>
        <Panel code="R4" onOpen={onOpenView && (() => onOpenView('r4'))} name="Counterfactual">
          <R4Counterfactual item={item} stats={stats} compact />
        </Panel>
        <Panel code="R2" onOpen={onOpenView && (() => onOpenView('r2'))} name="Flip curve">
          <R2FlipCurve item={item} stats={stats} compact />
        </Panel>
        <Panel code="R3" onOpen={onOpenView && (() => onOpenView('r3'))} name="Push it yourself">
          <R3Push key={item.id} item={item} stats={stats} compact />
        </Panel>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import type { Item, Stats } from '../lib/types';
import { R0Strip } from './R0Baseline';
import { R1Score } from './R1Score';
import { R2FlipCurve } from './R2FlipCurve';
import { R3Push } from './R3Push';
import { R4Counterfactual } from './R4Counterfactual';

interface Props {
  header: ReactNode;
  item: Item;
  items: Item[];
  stats: Stats;
}

function Panel({ code, name, children }: { code: string; name: string; children: ReactNode }) {
  return (
    <section className="panel" style={{ padding: '10px 14px' }}>
      <h2 className="panel-title">
        <span>{code}</span>
        <span className="name">{name}</span>
      </h2>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function CompareAll({ header, item, items, stats }: Props) {
  return (
    <div className="compare-all" style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
      {header}
      <R0Strip item={item} />
      <div
        className="compare-grid"
        style={{
          flex: 1, minHeight: 0, display: 'grid', gap: 10,
          gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
        }}
      >
        <Panel code="R1" name="Margin score">
          <R1Score item={item} items={items} stats={stats} compact />
        </Panel>
        <Panel code="R2" name="Flip curve">
          <R2FlipCurve item={item} stats={stats} compact />
        </Panel>
        <Panel code="R3" name="Push it yourself">
          <R3Push key={item.id} item={item} stats={stats} compact />
        </Panel>
        <Panel code="R4" name="Counterfactual">
          <R4Counterfactual item={item} stats={stats} compact />
        </Panel>
      </div>
    </div>
  );
}

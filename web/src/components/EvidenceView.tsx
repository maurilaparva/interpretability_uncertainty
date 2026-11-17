import type { ReactNode } from 'react';
import type { Item, Stats } from '../lib/types';
import type { ViewKey } from '../lib/views';
import { Overview } from '../views/Overview';
import { R0Baseline } from '../views/R0Baseline';
import { R1Score } from '../views/R1Score';
import { R2FlipCurve } from '../views/R2FlipCurve';
import { R3Push } from '../views/R3Push';
import { R4Counterfactual } from '../views/R4Counterfactual';
import { CompareAll } from '../views/CompareAll';

interface Props {
  view: ViewKey;
  item: Item;
  items: Item[];
  stats: Stats;
  header: ReactNode;
  revealKey: boolean;
  onOpenItem: (id: string, view: ViewKey) => void;
  allowReveal?: boolean;
}

export function EvidenceView({ view, item, items, stats, header, revealKey, onOpenItem, allowReveal = true }: Props) {
  switch (view) {
    case 'overview':
      return <Overview items={items} stats={stats} selectedId={item.id} revealKey={revealKey} allowReveal={allowReveal} onOpen={(id) => onOpenItem(id, 'r2')} />;
    case 'compare':
      return <CompareAll header={header} item={item} items={items} stats={stats} />;
    case 'r0':
      return <>{header}<div className="panel"><R0Baseline item={item} /></div></>;
    case 'r1':
      return <>{header}<div className="panel"><R1Score item={item} items={items} stats={stats} /></div></>;
    case 'r2':
      return <>{header}<div className="panel" style={{ flex: 1 }}><R2FlipCurve item={item} stats={stats} /></div></>;
    case 'r3':
      return <>{header}<div className="panel"><R3Push key={item.id} item={item} stats={stats} /></div></>;
    case 'r4':
      return <>{header}<div className="panel"><R4Counterfactual item={item} stats={stats} /></div></>;
  }
}

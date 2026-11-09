import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeStats, loadDataset, type Loaded } from './lib/data';
import type { Item, Stats } from './lib/types';
import { AboutDrawer } from './components/AboutDrawer';
import { AnswerHeader } from './components/AnswerHeader';
import { ItemList } from './components/ItemList';
import { Overview } from './views/Overview';
import { R0Baseline } from './views/R0Baseline';
import { R1Score } from './views/R1Score';
import { R2FlipCurve } from './views/R2FlipCurve';
import { R3Push } from './views/R3Push';
import { R4Counterfactual } from './views/R4Counterfactual';
import { CompareAll } from './views/CompareAll';

export const VIEWS = [
  { key: 'overview', label: 'Overview' },
  { key: 'r0', label: 'R0 Baseline' },
  { key: 'r1', label: 'R1 Score' },
  { key: 'r2', label: 'R2 Flip curve' },
  { key: 'r3', label: 'R3 Push it' },
  { key: 'r4', label: 'R4 Counterfactual' },
  { key: 'compare', label: 'Compare all' },
] as const;
export type ViewKey = (typeof VIEWS)[number]['key'];

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return { view: p.get('view'), item: p.get('item') };
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDataset().then(setLoaded, (e) => setError(String(e)));
  }, []);

  if (error) return <div className="center-msg">Could not load any data: {error}</div>;
  if (!loaded) return <div className="center-msg">Loading…</div>;
  return <Shell loaded={loaded} />;
}

function Shell({ loaded }: { loaded: Loaded }) {
  const { data, isMock } = loaded;
  const items = data.items;
  const stats: Stats = useMemo(() => computeStats(data), [data]);

  const initial = readUrl();
  const [view, setView] = useState<ViewKey>(
    VIEWS.some((v) => v.key === initial.view) ? (initial.view as ViewKey) : 'compare',
  );
  const [itemId, setItemId] = useState<string>(
    items.some((it) => it.id === initial.item) ? initial.item! : items[0].id,
  );
  const [revealKey, setRevealKey] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const item: Item = items.find((it) => it.id === itemId) ?? items[0];

  // URL <- state
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('view', view);
    p.set('item', itemId);
    window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
  }, [view, itemId]);

  const step = useCallback(
    (d: number) => {
      const i = items.findIndex((it) => it.id === itemId);
      const n = items[(i + d + items.length) % items.length];
      setItemId(n.id);
    },
    [items, itemId],
  );

  // Keyboard: up/down = item, 1-7 = tab, k = answer key, Esc = close drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) {
        if ((t as HTMLInputElement).type === 'range' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          // ranges use left/right; let up/down still switch items
        } else if (!(e.key >= '1' && e.key <= '7')) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setAboutOpen(false);
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key >= '1' && e.key <= '7') setView(VIEWS[Number(e.key) - 1].key);
      else if (e.key === 'k' || e.key === 'K') setRevealKey((r) => !r);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const openItem = useCallback((id: string, v: ViewKey) => {
    setItemId(id);
    setView(v);
  }, []);

  const header = (compact = false) => (
    <AnswerHeader item={item} revealKey={revealKey} onReveal={() => setRevealKey((r) => !r)} compact={compact} />
  );

  let body: React.ReactNode;
  let fill = true;
  switch (view) {
    case 'overview':
      body = <Overview items={items} stats={stats} selectedId={itemId} revealKey={revealKey} onOpen={(id) => openItem(id, 'r2')} />;
      break;
    case 'r0':
      fill = false;
      body = <>{header()}<div className="panel"><R0Baseline item={item} /></div></>;
      break;
    case 'r1':
      fill = false;
      body = <>{header()}<div className="panel"><R1Score item={item} items={items} stats={stats} /></div></>;
      break;
    case 'r2':
      body = <>{header()}<div className="panel" style={{ flex: 1 }}><R2FlipCurve item={item} stats={stats} /></div></>;
      break;
    case 'r3':
      fill = false;
      body = <>{header()}<div className="panel"><R3Push key={item.id} item={item} stats={stats} /></div></>;
      break;
    case 'r4':
      fill = false;
      body = <>{header()}<div className="panel"><R4Counterfactual item={item} stats={stats} /></div></>;
      break;
    case 'compare':
      body = <CompareAll header={header(true)} item={item} items={items} stats={stats} />;
      break;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>How sure is the model, <em>inside</em>?</h1>
          <div className="subtitle">Prototype: mechanistic uncertainty representations</div>
        </div>
        {isMock && (
          <span className="badge-mock" title={loaded.fallbackReason ?? 'meta.is_mock = true'}>
            MOCK DATA
          </span>
        )}
        <div className="spacer" />
        <label className="switch" title="Shortcut: K">
          <input type="checkbox" checked={revealKey} onChange={(e) => setRevealKey(e.target.checked)} />
          <span className="track" />
          Show answer key
        </label>
      </header>

      <ItemList items={items} selectedId={itemId} revealKey={revealKey} onSelect={setItemId} />

      <main className="main">
        <nav className="tabs" role="tablist">
          {VIEWS.map((v, i) => (
            <button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              className={`tab ${view === v.key ? 'active' : ''}`}
              onClick={() => setView(v.key)}
            >
              {v.label}
              <kbd>{i + 1}</kbd>
            </button>
          ))}
        </nav>
        <section className={`view ${fill ? 'fill' : ''}`} key={view}>
          {body}
        </section>
      </main>

      <footer className="footer">
        <button className="btn" onClick={() => setAboutOpen(true)}>About this method</button>
        <span>Model: {data.meta.model}</span>
        <span>{items.length} questions</span>
        <div className="spacer" />
        <span>↑/↓ question · 1–7 views · K answer key</span>
      </footer>

      {aboutOpen && <AboutDrawer loaded={loaded} stats={stats} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

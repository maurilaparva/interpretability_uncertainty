import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeStats, loadDataset, type Loaded } from './lib/data';
import type { Item, Stats } from './lib/types';
import { AboutDrawer } from './components/AboutDrawer';
import { AnswerHeader } from './components/AnswerHeader';
import { ItemList } from './components/ItemList';
import { EvidenceView } from './components/EvidenceView';
import { QuickGuide } from './components/QuickGuide';
import { GuidanceContext } from './components/GuidanceContext';
import { VIEWS, type ViewKey } from './lib/views';
import { Study } from './study/Study';
import { buildStudySteps, studyDatasetKey, supportsStudyDataset } from './study/questionnaire';
import { loadSession, saveSession } from './study/storage';
import { GUIDE_VERSION, recordExplorerGuideExposure } from './study/guidance';

function readUrl() {
  const p = new URLSearchParams(window.location.search);
  return { view: p.get('view'), item: p.get('item') };
}

function hasLockedStudy(datasetKey: string): boolean {
  const session = loadSession(datasetKey);
  return !!session && !session.completedAt && !session.events.some((event) => event.type === 'answers_revealed');
}

export default function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState(() => new URLSearchParams(window.location.search).get('mode') === 'study');

  const setMode = (study: boolean) => {
    const url = new URL(window.location.href);
    if (study) url.searchParams.set('mode', 'study');
    else url.searchParams.delete('mode');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setStudyMode(study);
  };

  useEffect(() => {
    loadDataset().then(setLoaded, (e) => setError(String(e)));
  }, []);

  if (error) return <div className="center-msg">Could not load any data: {error}</div>;
  if (!loaded) return <div className="center-msg">Loading…</div>;
  if (studyMode && supportsStudyDataset(loaded.data)) return <Study loaded={loaded} onExit={() => setMode(false)} />;
  return <Shell loaded={loaded} onStartStudy={() => setMode(true)} />;
}

function Shell({ loaded, onStartStudy }: { loaded: Loaded; onStartStudy: () => void }) {
  const { data, isMock } = loaded;
  const items = data.items;
  const stats: Stats = useMemo(() => computeStats(data), [data]);
  const datasetKey = studyDatasetKey(data);
  const [answersLocked, setAnswersLocked] = useState(() => hasLockedStudy(datasetKey));
  const guidanceAllowed = useCallback(() => {
    const saved = loadSession(datasetKey);
    if (!saved || saved.completedAt || !supportsStudyDataset(data)) return true;
    const savedSteps = buildStudySteps(data, stats, saved.taskSet);
    return saved.stepIndex >= savedSteps.findIndex((candidate) => candidate.id === 'read-answer');
  }, [datasetKey, data, stats]);
  const [guidanceEnabled, setGuidanceEnabled] = useState(guidanceAllowed);

  const initial = readUrl();
  const [view, setView] = useState<ViewKey>(
    VIEWS.some((v) => v.key === initial.view) ? (initial.view as ViewKey) : 'compare',
  );
  const [itemId, setItemId] = useState<string>(
    items.some((it) => it.id === initial.item) ? initial.item! : items[0].id,
  );
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const revealKey = showAnswerKey && !answersLocked;
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const item: Item = items.find((it) => it.id === itemId) ?? items[0];

  const openGuide = () => {
    recordExplorerGuideExposure();
    const saved = loadSession(datasetKey);
    if (saved && !saved.completedAt) {
      const at = new Date().toISOString();
      saveSession({ ...saved, updatedAt: at, events: [...saved.events, {
        type: 'guide_opened', at, details: { version: GUIDE_VERSION, source: 'explorer' },
      }] });
    }
    setGuideOpen(true);
  };

  useEffect(() => {
    const refreshLock = () => {
      setAnswersLocked(hasLockedStudy(datasetKey));
      setGuidanceEnabled(guidanceAllowed());
    };
    refreshLock();
    window.addEventListener('storage', refreshLock);
    return () => window.removeEventListener('storage', refreshLock);
  }, [datasetKey, guidanceAllowed]);

  const toggleAnswerKey = useCallback(() => {
    if (!answersLocked) setShowAnswerKey((shown) => !shown);
  }, [answersLocked]);

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
      if (guideOpen) return;
      const t = e.target as HTMLElement;
      if (t && (t.matches('input, textarea, select') || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setAboutOpen(false);
      else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
      else if (e.key >= '1' && e.key <= '7') setView(VIEWS[Number(e.key) - 1].key);
      else if (e.key === 'k' || e.key === 'K') toggleAnswerKey();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, toggleAnswerKey, guideOpen]);

  const openItem = useCallback((id: string, v: ViewKey) => {
    setItemId(id);
    setView(v);
  }, []);

  const header = (compact = false) => (
    <AnswerHeader item={item} revealKey={revealKey} allowReveal={!answersLocked} onReveal={toggleAnswerKey} compact={compact} />
  );

  const fill = view === 'overview' || view === 'r2' || view === 'compare';

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
        {guidanceEnabled && <button className="btn guide-entry" onClick={openGuide}>Quick guide</button>}
        {supportsStudyDataset(data) && <button className="btn primary" onClick={onStartStudy}>Start study</button>}
        {answersLocked ? <span className="caption">Study answers locked</span> : <label className="switch" title="Shortcut: K">
          <input type="checkbox" checked={revealKey} onChange={toggleAnswerKey} />
          <span className="track" />
          Show answer key
        </label>}
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
          <GuidanceContext.Provider value={guidanceEnabled}>
          <EvidenceView view={view} item={item} items={items} stats={stats} header={header(view === 'compare')} revealKey={revealKey} allowReveal={!answersLocked} onOpenItem={openItem} />
          </GuidanceContext.Provider>
        </section>
      </main>

      <footer className="footer">
        <button className="btn" onClick={() => setAboutOpen(true)}>About this method</button>
        <span>Model: {data.meta.model}</span>
        <span>{items.length} questions</span>
        <div className="spacer" />
        <span>↑/↓ question · 1–7 views{!answersLocked && ' · K answer key'}</span>
      </footer>

      {aboutOpen && <AboutDrawer loaded={loaded} stats={stats} onClose={() => setAboutOpen(false)} />}
      {guideOpen && guidanceEnabled && <QuickGuide items={items} stats={stats} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

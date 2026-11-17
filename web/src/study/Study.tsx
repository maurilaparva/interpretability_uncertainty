import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AboutDrawer } from '../components/AboutDrawer';
import { AnswerHeader } from '../components/AnswerHeader';
import { EvidenceView } from '../components/EvidenceView';
import { computeStats, type Loaded } from '../lib/data';
import type { Item, Stats } from '../lib/types';
import { VIEWS, type ViewKey } from '../lib/views';
import { advanceSession, canGoBack, missingRequired, stepDuration } from './flow';
import { buildStudySteps, studyDatasetKey, type StudyStep } from './questionnaire';
import { clearSession, createSession, downloadSession, loadSession, saveSession, type StudyEvent, type StudySession } from './storage';
import { SurveyField } from './SurveyFields';
import './study.css';

type LogEvent = (event: Omit<StudyEvent, 'at'>) => void;

export function Study({ loaded, onExit }: { loaded: Loaded; onExit: () => void }) {
  const { data } = loaded;
  const datasetKey = studyDatasetKey(data);
  const stats = useMemo(() => computeStats(data), [data]);
  const [session, setSession] = useState<StudySession | null>(() => loadSession(datasetKey));
  const [active, setActive] = useState(false);
  const [saved, setSaved] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const steps = useMemo(() => buildStudySteps(data, stats, session?.taskSet ?? 'A'), [data, stats, session?.taskSet]);
  const index = Math.min(session?.stepIndex ?? 0, steps.length - 1);
  const step = steps[index];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const enteredAt = useRef(Date.now());
  const paused = useRef(false);
  const latest = useRef({ session, step });
  latest.current = { session, step };

  useEffect(() => {
    if (active && session) setSaved(saveSession(session));
  }, [session, active]);

  useEffect(() => {
    enteredAt.current = Date.now();
    paused.current = false;
    setInvalid([]);
    if (active) headingRef.current?.focus();
    formRef.current?.scrollTo({ top: 0 });
  }, [index, active]);

  const persistPause = useCallback((): StudySession | null => {
    const { session: current, step: currentStep } = latest.current;
    if (!current || current.completedAt || paused.current) return current;
    const at = new Date().toISOString();
    const nextSession = { ...current, updatedAt: at, events: [...current.events, {
      type: 'step_paused', at, stepId: currentStep.id, details: { durationMs: Date.now() - enteredAt.current },
    }] };
    if (!saveSession(nextSession)) return null;
    paused.current = true;
    return nextSession;
  }, []);

  useEffect(() => {
    if (!active || session?.completedAt) return;
    const onPageHide = () => { persistPause(); };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [active, session?.completedAt, persistPause]);

  const pauseAndExit = () => {
    const nextSession = persistPause();
    if (!nextSession) { setSaved(false); setResetting(false); return; }
    setSession(nextSession);
    onExit();
  };

  const log = useCallback<LogEvent>((event) => {
    const at = new Date().toISOString();
    setSession((current) => current && !current.completedAt ? {
      ...current, updatedAt: at, events: [...current.events, { ...event, at }],
    } : current);
  }, []);

  const begin = () => {
    const next = createSession(datasetKey);
    next.events = [
      { type: 'study_started', at: next.startedAt },
      { type: 'step_started', stepId: steps[0].id, at: next.startedAt },
    ];
    setSession(next);
    setResetting(false);
    setActive(true);
  };

  const answer = (id: string, value: StudySession['answers'][string]) => {
    setSession((current) => current && !current.completedAt ? {
      ...current, updatedAt: new Date().toISOString(), answers: { ...current.answers, [id]: value },
    } : current);
    setInvalid((current) => current.filter((questionId) => questionId !== id));
  };

  const next = (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;
    const missing = missingRequired(step, session.answers);
    setInvalid(missing);
    if (missing.length) {
      const field = document.getElementById(`field-${missing[0]}`);
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.querySelector<HTMLElement>('input, textarea, select')?.focus({ preventScroll: true });
      return;
    }
    setSession((current) => current && advanceSession(current, steps, stepDuration(current, step.id, Date.now() - enteredAt.current)));
  };

  const back = () => {
    if (!session || !canGoBack(steps, index)) return;
    const at = new Date().toISOString();
    setSession({ ...session, stepIndex: index - 1, updatedAt: at,
      events: [...session.events, { type: 'step_returned', stepId: steps[index - 1].id, at }],
    });
  };

  const completed = !!session?.completedAt;
  const progress = completed ? 100 : Math.round(index / steps.length * 100);
  const showStudy = active && session && !completed;
  const showEvidence = showStudy && !step.hideExplorer;

  return (
    <div className="study-app">
      <header className="study-topbar">
        <div className="study-brand"><span className="study-mark" aria-hidden="true">u</span><div><strong>Model confidence study</strong><span>UNCIRCUIT</span></div></div>
        {active && session && <span className={`study-save${saved ? '' : ' unsaved'}`} role="status">{saved ? 'Saved on this device' : 'Not saved — download a copy'}</span>}
        <button className="btn" onClick={showStudy ? pauseAndExit : onExit}>{showStudy ? 'Pause & exit' : 'Back to explorer'}</button>
      </header>

      {showStudy && <div className="study-progress" role="progressbar" aria-label="Study progress" aria-valuenow={index} aria-valuemin={0} aria-valuemax={steps.length}><span style={{ width: `${progress}%` }} /></div>}

      {!active ? (
        <main className="study-welcome-wrap">
          <div className="study-welcome">
            <div className="study-eyebrow">About 20 minutes</div>
            <h1>{session ? 'Welcome back.' : 'Explore the model.'}</h1>
            <p className="study-intro">Try the views, make predictions, and share your feedback.</p>
            <div className="study-journey" aria-label="Study overview">
              {[['01', 'Explore', 'Get a feel for the interface.'], ['02', 'Try a few tasks', 'Read, steer, and make predictions.'], ['03', 'Share your thoughts', 'Tell us what worked for you.']].map(([number, title, text]) => (
                <div key={number}><span>{number}</span><strong>{title}</strong><p>{text}</p></div>
              ))}
            </div>
            {session && !resetting ? (
              <div className="study-actions">
                <button className="study-primary" onClick={() => { setActive(true); if (!completed) log({ type: 'session_resumed', stepId: step.id }); }}>{completed ? 'View completed responses' : `Continue · step ${index + 1} of ${steps.length}`}<span aria-hidden="true">→</span></button>
                <button className="btn-link" onClick={() => setResetting(true)}>Start a new session</button>
              </div>
            ) : session && resetting ? (
              <div className="study-reset" role="alert">
                <p>A new session replaces your saved responses. Download them first to keep a copy.</p>
                <div className="study-actions"><button className="btn" onClick={() => downloadSession(session, 'json')}>Download saved session</button><button className="study-primary" onClick={begin}>Start new session</button><button className="btn-link" onClick={() => setResetting(false)}>Cancel</button></div>
              </div>
            ) : (
              <div className="study-actions"><button className="study-primary" onClick={begin}>Start study<span aria-hidden="true">→</span></button></div>
            )}
          </div>
        </main>
      ) : completed && session ? (
        <main className="study-welcome-wrap">
          <div className="study-welcome study-complete">
            <div className="study-done-mark" aria-hidden="true">✓</div>
            <div className="study-eyebrow">Session complete</div>
            <h1>Thanks for your feedback.</h1>
            <p className="study-intro">Download your responses and share the file with the research team.</p>
            <div className="study-downloads"><button className="study-primary" onClick={() => downloadSession(session, 'csv')}>Download responses · CSV<span aria-hidden="true">↓</span></button><button className="btn" onClick={() => downloadSession(session, 'json')}>Full session · JSON</button></div>
            {!saved && <p className="study-local-note">Not saved in this browser. Download a copy before closing.</p>}
            <button className="btn-link" onClick={() => { setActive(false); setResetting(true); }}>Start another session</button>
          </div>
        </main>
      ) : session && (
        <main className={`study-main${showEvidence ? ' with-evidence' : ''}`}>
          {showEvidence && (step.mode === 'reveal'
            ? <PredictionReview items={(step.itemIds ?? []).map((id) => data.items.find((item) => item.id === id)!)} answers={session.answers} />
            : <StudyWorkspace key={step.id} step={step} loaded={loaded} stats={stats} log={log} />)}
          <form className={`study-survey${showEvidence ? ' beside-evidence' : ''}`} ref={formRef} onSubmit={next} noValidate>
            <div className="study-survey-heading">
              <div className="study-step-label"><span>{step.section}</span><span>{index + 1} / {steps.length}</span></div>
              <h1 ref={headingRef} tabIndex={-1}>{step.title}</h1>
              {step.description && <p>{step.description}</p>}
              {step.mode === 'explore' && <ExploreClock />}
            </div>
            <div className="study-fields">
              {step.questions.map((question) => (
                <SurveyField key={question.id} question={question} value={session.answers[question.id]} invalid={invalid.includes(question.id)} onChange={(value) => answer(question.id, value)} />
              ))}
            </div>
            {invalid.length > 0 && <p className="study-validation" role="alert">Please answer the highlighted questions.</p>}
            <div className="study-navigation">
              {canGoBack(steps, index) && <button className="btn" type="button" onClick={back}>Back</button>}
              <button className="study-primary" type="submit">{index === steps.length - 1 ? 'Finish study' : step.id === 'predict-correctness' ? 'Lock predictions & reveal' : step.mode === 'explore' ? 'Share first impressions' : 'Continue'}<span aria-hidden="true">→</span></button>
            </div>
            <div className="study-survey-footer"><button type="button" className="btn-link" onClick={() => downloadSession(session, 'json')}>Download progress</button><button type="button" className="btn-link" onClick={() => setResetting(true)}>Leave study</button></div>
            {!saved && <p className="study-validation" role="alert">This browser could not save your progress. Download a copy before closing this page.</p>}
          </form>
        </main>
      )}

      {active && resetting && session && (
        <div className="study-modal-backdrop">
          <LeaveDialog onCancel={() => setResetting(false)} onKeep={pauseAndExit} onDiscard={() => {
            if (clearSession()) onExit();
            else setSaved(false);
          }} onDownload={() => downloadSession(session, 'json')} />
        </div>
      )}
    </div>
  );
}

function ExploreClock() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="study-explore-clock"><span className="study-clock-number">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span><span>{elapsed < 180 ? 'Take about 3 minutes. Continue when you’re ready.' : 'Ready when you are.'}</span></div>;
}

function StudyWorkspace({ step, loaded, stats, log }: { step: StudyStep; loaded: Loaded; stats: Stats; log: LogEvent }) {
  const allItems = loaded.data.items;
  const availableItems = step.itemIds ? step.itemIds.map((id) => allItems.find((item) => item.id === id)!) : allItems;
  const [itemId, setItemId] = useState(availableItems[0].id);
  const [view, setView] = useState<ViewKey>(step.initialView ?? 'compare');
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const item = availableItems.find((candidate) => candidate.id === itemId) ?? availableItems[0];
  const tabs = step.id.startsWith('rate-') ? VIEWS.filter((tab) => tab.key === step.initialView) : VIEWS.filter((tab) => !step.itemIds || tab.key !== 'overview');

  useEffect(() => { log({ type: 'view_opened', stepId: step.id, itemId: item.id, view }); }, [item.id, view, step.id, log]);

  const closeAbout = useCallback(() => { setAboutOpen(false); aboutRef.current?.focus(); }, []);
  useEffect(() => {
    if (!aboutOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAbout(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [aboutOpen, closeAbout]);

  return (
    <section className="study-workspace" aria-label="Interactive evidence">
      <div className="study-workspace-tools">
        {availableItems.length > 1 ? (
          <label className="study-question-select"><span>Question</span><select value={item.id} onChange={(e) => setItemId(e.target.value)}>{availableItems.map((candidate) => <option key={candidate.id} value={candidate.id}>{Number(candidate.id.slice(1))}. {candidate.question}</option>)}</select></label>
        ) : <span className="study-workspace-label">Interactive evidence</span>}
        <button className="btn" ref={aboutRef} onClick={() => { setAboutOpen(true); log({ type: 'about_opened', stepId: step.id, itemId: item.id, view }); }}>About this method</button>
      </div>
      {step.id === 'predict-correctness' && <div className="study-question-chips" aria-label="Questions to judge">{availableItems.map((candidate, i) => <button key={candidate.id} aria-pressed={candidate.id === item.id} className={candidate.id === item.id ? 'selected' : ''} onClick={() => setItemId(candidate.id)}><span>{i + 1}</span>{candidate.question}</button>)}</div>}
      <nav className="study-view-tabs" aria-label="Evidence views">{tabs.map((tab) => <button key={tab.key} aria-pressed={view === tab.key} className={view === tab.key ? 'selected' : ''} onClick={() => setView(tab.key)}>{tab.label}</button>)}</nav>
      <div className="study-evidence" onChangeCapture={(event) => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.type === 'range') {
          const isPush = input.labels?.[0]?.textContent?.includes('Push strength');
          log({ type: 'slider_changed', stepId: step.id, itemId: item.id, view, details: {
            control: isPush ? 'push' : 'layer', value: isPush ? stats.alphas[Number(input.value)] : stats.layers[Number(input.value)],
          } });
        }
      }} onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest('button');
        if (button && /Auto-play|Stop|Reset/.test(button.textContent ?? '')) log({ type: 'control_clicked', stepId: step.id, itemId: item.id, view, details: { control: button.textContent?.trim() ?? '' } });
      }}>
        <div className={`study-evidence-content evidence-${view}`}>
          <EvidenceView view={view} item={item} items={allItems} stats={stats}
            header={<AnswerHeader item={item} compact revealKey={false} allowReveal={false} onReveal={() => {}} />}
            revealKey={false} allowReveal={false} onOpenItem={(id, nextView) => { if (availableItems.some((candidate) => candidate.id === id)) { setItemId(id); setView(nextView); } }} />
        </div>
      </div>
      {aboutOpen && <AboutDrawer loaded={loaded} stats={stats} onClose={closeAbout} />}
    </section>
  );
}

function PredictionReview({ items, answers }: { items: Item[]; answers: StudySession['answers'] }) {
  return <section className="study-review" aria-label="Prediction results"><div className="study-eyebrow">Answer key</div><h2>Here’s how the model did.</h2><div className="study-review-cards">{items.map((item) => (
    <article key={item.id}><div className="study-review-top"><h3>{item.question}</h3><span className={`verdict ${item.correct ? 'ok' : 'bad'}`}>{item.correct ? '✓ Correct' : '✕ Incorrect'}</span></div><dl><div><dt>Model’s answer</dt><dd>{item.answer_text}</dd></div><div><dt>Correct answer</dt><dd>{item.gold}</dd></div><div><dt>Your prediction</dt><dd>{answers[`C13_${item.id}`]}</dd></div></dl></article>
  ))}</div></section>;
}

function LeaveDialog({ onCancel, onKeep, onDiscard, onDownload }: { onCancel: () => void; onKeep: () => void; onDiscard: () => void; onDownload: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);
  return <div className="study-leave-dialog" ref={ref} role="dialog" aria-modal="true" aria-labelledby="leave-title" onKeyDown={(event) => {
    if (event.key === 'Escape') onCancel();
    if (event.key === 'Tab') {
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }
  }}><h2 id="leave-title">Leave the study?</h2><p>You can keep your progress and return later, or delete this session from the browser.</p><div className="study-actions"><button className="study-primary" onClick={onCancel}>Keep going</button><button className="btn" onClick={onKeep}>Save & leave</button><button className="btn" onClick={onDownload}>Download progress</button><button className="btn-link" onClick={onDiscard}>Delete session & leave</button></div></div>;
}

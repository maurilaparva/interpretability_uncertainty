import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AboutDrawer } from '../components/AboutDrawer';
import { AnswerHeader } from '../components/AnswerHeader';
import { EvidenceView } from '../components/EvidenceView';
import { GuidanceContext } from '../components/GuidanceContext';
import { QuickGuide } from '../components/QuickGuide';
import { computeStats, type Loaded } from '../lib/data';
import type { Item, Stats } from '../lib/types';
import { VIEWS, type ViewKey } from '../lib/views';
import { advanceSession, canGoBack, missingRequired, stepDuration } from './flow';
import { canShowStudyGuide, getExplorerGuideExposure, GUIDE_VERSION } from './guidance';
import { buildStudySteps, studyDatasetKey, tourFor, type StudyStep, type TourStop, type TourStopInfo } from './questionnaire';
import { viewOrderFor } from './viewOrder';
import { APP_VERSION, clearSession, createSession, submissionId, downloadSession, loadSession, saveSession, sheetsEnabled, submitSession, type StudyEvent, type StudySession } from './storage';
import { SurveyField } from './SurveyFields';
import { LayersIntro, PushIntro, QuestionIntro, ScoresIntro } from './TourIntros';
import './study.css';

type LogEvent = (event: Omit<StudyEvent, 'at'>) => void;

export function Study({ loaded, autoStart = false }: { loaded: Loaded; autoStart?: boolean }) {
  const { data } = loaded;
  const datasetKey = studyDatasetKey(data);
  const stats = useMemo(() => computeStats(data), [data]);
  const [session, setSession] = useState<StudySession | null>(() => loadSession(datasetKey));
  const [active, setActive] = useState(false);
  const [saved, setSaved] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideOpenedAt = useRef<number | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const viewOrder = viewOrderFor(session?.viewOrder);
  const steps = useMemo(() => buildStudySteps(data, stats, session?.taskSet ?? 'A', viewOrder), [data, stats, session?.taskSet, viewOrder]);
  const index = Math.min(session?.stepIndex ?? 0, steps.length - 1);
  const step = steps[index];
  // Each tour step walks its own part: the fixed concepts, or the rotated views followed by Compare all.
  const tour = useMemo(() => tourFor(viewOrder).filter((stop) => (step?.tour === 'learn' ? stop.part === 'learn' : stop.part !== 'learn')), [viewOrder, step?.tour]);
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
    const guideDuration = guideOpenedAt.current == null ? 0 : Date.now() - guideOpenedAt.current;
    const nextSession = { ...current, updatedAt: at, events: [...current.events, {
      type: 'step_paused', at, stepId: currentStep.id, details: { durationMs: Math.max(0, Date.now() - enteredAt.current - guideDuration) },
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

  // Explore step: the participant walks the tour (concepts, then their rotated view order, then Compare all).
  // Free exploration: the views stay hidden until the participant has read the instructions and starts.
  const [exploreStartedStep, setExploreStartedStep] = useState<string | null>(null);
  const [tourViewState, setTourView] = useState<TourStop>('question');
  const [tourSeenState, setTourSeen] = useState<TourStop[]>([]);
  // Entering a tour step (or coming back to one) starts at its first stop.
  const tourView = tour.some((stop) => stop.view === tourViewState) ? tourViewState : tour[0].view;
  const tourSeen = tourSeenState.includes(tourView) ? tourSeenState : [...tourSeenState, tourView];
  // The question picked on All questions carries over into Explore the views.
  const [tourItemId, setTourItemId] = useState('q01');
  const showTourView = (view: TourStop) => {
    setTourView(view);
    setTourSeen((seen) => (seen.includes(view) ? seen : [...seen, view]));
  };

  const pauseAndExit = () => {
    const nextSession = persistPause();
    if (!nextSession) { setSaved(false); setResetting(false); return; }
    setSession(nextSession);
    // Participants never leave for the explorer: pausing returns to the welcome page ("Welcome back").
    setResetting(false);
    setActive(false);
  };

  const log = useCallback<LogEvent>((event) => {
    const at = new Date().toISOString();
    setSession((current) => current && !current.completedAt ? {
      ...current, updatedAt: at, events: [...current.events, { ...event, at }],
    } : current);
  }, []);

  const openGuide = useCallback(() => {
    guideOpenedAt.current = Date.now();
    setGuideOpen(true);
    log({ type: 'guide_opened', stepId: step.id, details: { version: GUIDE_VERSION } });
  }, [log, step.id]);


  const closeGuide = (completed: boolean) => {
    const durationMs = guideOpenedAt.current == null ? 0 : Date.now() - guideOpenedAt.current;
    // Keep time spent reading instructions separate from task time.
    enteredAt.current += durationMs;
    guideOpenedAt.current = null;
    setGuideOpen(false);
    log({ type: 'guide_closed', stepId: step.id, details: { version: GUIDE_VERSION, completed, durationMs } });
  };

  const begin = () => {
    const next = createSession(datasetKey);
    const priorGuide = getExplorerGuideExposure();
    next.events = [
      ...(priorGuide ? [priorGuide] : []),
      { type: 'study_started', at: next.startedAt, details: { appVersion: APP_VERSION } },
      { type: 'step_started', stepId: steps[0].id, at: next.startedAt },
    ];
    setSession(next);
    setUpload('idle');
    setResetting(false);
    setActive(true);
  };

  // Coming straight from the quick guide's "Start study" button: skip the welcome
  // screen, unless a saved session exists (then let the participant choose).
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    if (!session) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Upload a completed session to Google Sheets once; the download buttons stay as a fallback.
  const [upload, setUpload] = useState<'idle' | 'sending' | 'failed'>('idle');
  const uploading = useRef(false);
  const sendToSheets = useCallback(async (toSend: StudySession) => {
    if (uploading.current) return;
    uploading.current = true;
    setUpload('sending');
    const ok = await submitSession(toSend);
    uploading.current = false;
    if (ok) {
      const submittedAt = new Date().toISOString();
      setSession((current) => current && current.id === toSend.id ? { ...current, submittedAt } : current);
      setUpload('idle');
    } else {
      setUpload('failed');
    }
  }, []);

  useEffect(() => {
    if (active && sheetsEnabled && session?.completedAt && !session.submittedAt && upload === 'idle') void sendToSheets(session);
  }, [active, session, upload, sendToSheets]);

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
  const waitingToExplore = step?.mode === 'explore' && exploreStartedStep !== step.id;

  return (
    <div className="study-app">
      <header className="study-topbar">
        <div className="study-brand"><span className="study-mark" aria-hidden="true">u</span><div><strong>Model confidence study</strong><span>UNCIRCUIT</span></div></div>
        {active && session && <span className={`study-save${saved ? '' : ' unsaved'}`} role="status">{saved ? 'Saved on this device' : 'Not saved — download a copy'}</span>}
        {showStudy && <button className="btn" onClick={pauseAndExit}>Pause & exit</button>}
      </header>

      {showStudy && <div className="study-progress" role="progressbar" aria-label="Study progress" aria-valuenow={index} aria-valuemin={0} aria-valuemax={steps.length}><span style={{ width: `${progress}%` }} /></div>}

      {!active ? (
        <main className="study-welcome-wrap">
          <div className="study-welcome">
            <div className="study-eyebrow">Model confidence study · 20–30 minutes</div>
            <h1>{session ? 'Welcome back.' : 'How sure is an AI model of its answer?'}</h1>
            <p className="study-intro">
              A language model can give an answer that a small change inside the model would flip. We built views that
              show how fragile each answer is. In this study you will try them and tell us which ones help you judge
              when to trust an answer.
            </p>
            <ul className="study-facts">
              <li><strong>About 20–30 minutes.</strong> Participation is voluntary and your responses are anonymous.</li>
              <li><strong>You can pause and come back</strong> in this same browser: progress is saved on this device. We recommend finishing in one sitting.</li>
              <li><strong>At the end you get a submission ID.</strong> Keep it in case you want to share it with the research team for reference.</li>
            </ul>
            <div className="study-journey" aria-label="Study overview">
              {[['01', 'Explore', 'Get a feel for the interface.'], ['02', 'Try a few tasks', 'Read, steer, and make predictions.'], ['03', 'Share your thoughts', 'Tell us what worked for you.']].map(([number, title, text]) => (
                <div key={number}><span>{number}</span><strong>{title}</strong><p>{text}</p></div>
              ))}
            </div>
            {session && !resetting ? (
              <div className="study-actions">
                <button className="study-primary" onClick={() => { setActive(true); if (!completed) log({ type: 'session_resumed', stepId: step.id, details: { appVersion: APP_VERSION } }); }}>{completed ? 'View completed responses' : `Continue · step ${index + 1} of ${steps.length}`}<span aria-hidden="true">→</span></button>
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
            <SubmissionId session={session} />
            {!sheetsEnabled ? (
              <p className="study-intro">Download your responses and share the file with the research team.</p>
            ) : session.submittedAt ? (
              <p className="study-intro" role="status">Your responses were sent to the research team. You can also keep a copy below.</p>
            ) : upload === 'failed' ? (
              <div role="alert">
                <p className="study-intro">We couldn’t send your responses automatically. Please try again, or download the file and share it with the research team.</p>
                <div className="study-actions"><button className="btn" onClick={() => void sendToSheets(session)}>Try sending again</button></div>
              </div>
            ) : (
              <p className="study-intro" role="status">Sending your responses to the research team…</p>
            )}
            <div className="study-downloads"><button className="study-primary" onClick={() => downloadSession(session, 'csv')}>Download responses · CSV<span aria-hidden="true">↓</span></button><button className="btn" onClick={() => downloadSession(session, 'json')}>Full session · JSON</button></div>
            {!saved && <p className="study-local-note">Not saved in this browser. Download a copy before closing.</p>}
            <button className="btn-link" onClick={() => { setActive(false); setResetting(true); }}>Start another session</button>
          </div>
        </main>
      ) : session && (
        <main className={`study-main${showEvidence ? ' with-evidence' : ''}`}>
          <form className={`study-survey${showEvidence ? ' beside-evidence' : ''}`} ref={formRef} onSubmit={next} noValidate>
            <div className="study-survey-heading">
              <div className="study-step-label"><span>{step.section}</span><span>{step.mode === 'explore' && !waitingToExplore && <><ExploreClock /> · </>}{index + 1} / {steps.length}</span></div>
              <h1 ref={headingRef} tabIndex={-1}>{step.title}</h1>
              {step.description && <Description text={step.description} />}
              {step.outline && (
                <ol className="study-outline">
                  {step.outline.map((part, i) => (
                    <li key={part.title}>
                      <span className="study-outline-number" aria-hidden="true">{i + 1}</span>
                      <span><strong>{part.title}</strong> <span className="study-outline-time">· about {part.minutes} min</span><span className="study-outline-text">{part.text}</span></span>
                    </li>
                  ))}
                </ol>
              )}
              {step.mode === 'tour' && <ViewTour stops={tour} view={tourView} seen={tourSeen} onView={showTourView} finishLabel={tourFinishLabel(step)} />}
            </div>
            <div className="study-fields">
              {step.questions.map((question) => (
                <SurveyField key={question.id} question={question} value={session.answers[question.id]} invalid={invalid.includes(question.id)} onChange={(value) => answer(question.id, value)} />
              ))}
            </div>
            {invalid.length > 0 && <p className="study-validation" role="alert">Please answer the highlighted questions.</p>}
            <div className="study-navigation">
              {canGoBack(steps, index) && <button className="btn" type="button" onClick={back}>Back</button>}
              {waitingToExplore ? (
                <button key="explore-start" className="study-primary" type="button" onClick={() => {
                  setExploreStartedStep(step.id);
                  log({ type: 'exploration_started', stepId: step.id });
                }}>Start exploring<span aria-hidden="true">→</span></button>
              ) : step.mode === 'tour' && nextTourView(tour, tourView) ? (
                // Separate key: reusing the submit button's DOM node would submit the form on the last "Next" click.
                <button key="tour-next" className="study-primary" type="button" onClick={() => showTourView(nextTourView(tour, tourView)!.view)}>
                  Next: {nextTourView(tour, tourView)!.label}<span aria-hidden="true">→</span>
                </button>
              ) : <button key="submit" className="study-primary" type="submit">{index === steps.length - 1 ? 'Finish study' : step.id === 'predict-correctness' ? 'Lock predictions & reveal' : step.mode === 'explore' ? 'Share first impressions' : step.mode === 'tour' ? tourFinishLabel(step) : 'Continue'}<span aria-hidden="true">→</span></button>}
            </div>
            <div className="study-survey-footer"><button type="button" className="btn-link" onClick={() => downloadSession(session, 'json')}>Download progress</button><button type="button" className="btn-link" onClick={() => setResetting(true)}>Leave study</button></div>
            {!saved && <p className="study-validation" role="alert">This browser could not save your progress. Download a copy before closing this page.</p>}
          </form>
          {/* After the form, so the task reads first: the form sits left of the views (see .with-evidence). */}
          {showEvidence && waitingToExplore ? (
            <section className="study-workspace study-workspace-waiting" aria-label="Interactive evidence">
              <p>Click <strong>Start exploring</strong> to begin.</p>
            </section>
          ) : showEvidence && (step.mode === 'reveal'
            ? <PredictionReview items={(step.itemIds ?? []).map((id) => data.items.find((item) => item.id === id)!)} answers={session.answers} />
            : <StudyWorkspace key={step.id} step={step} loaded={loaded} stats={stats} log={log} onGuide={openGuide}
                tour={step.mode === 'tour' ? { stops: tour, view: tourView, seen: tourSeen, onView: showTourView, itemId: tourItemId, onItem: setTourItemId } : undefined} />)}
        </main>
      )}

      {guideOpen && <QuickGuide items={data.items} stats={stats} onClose={closeGuide}
        onStep={(guideStep) => log({ type: 'guide_step', stepId: step.id, details: { version: GUIDE_VERSION, step: guideStep + 1 } })} />}

      {active && resetting && session && (
        <div className="study-modal-backdrop">
          <LeaveDialog onCancel={() => setResetting(false)} onKeep={pauseAndExit} onDiscard={() => {
            if (clearSession()) { setSession(null); setResetting(false); setActive(false); }
            else setSaved(false);
          }} onDownload={() => downloadSession(session, 'json')} />
        </div>
      )}
    </div>
  );
}

/** Renders **word** as bold; everything else stays plain text. */
function withBold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

/** Step instructions: one paragraph per line, and consecutive "- " lines as a list. */
function Description({ text }: { text: string }) {
  const blocks: (string | string[])[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      const last = blocks.at(-1);
      if (Array.isArray(last)) last.push(line.slice(2)); else blocks.push([line.slice(2)]);
    } else if (line.trim()) blocks.push(line);
  }
  return <>{blocks.map((block, i) => (Array.isArray(block)
    ? <ul key={i} className="study-instructions">{block.map((item) => <li key={item}>{withBold(item)}</li>)}</ul>
    : <p key={i}>{withBold(block)}</p>))}</>;
}

function nextTourView(stops: TourStopInfo[], view: TourStop): TourStopInfo | undefined {
  return stops[stops.findIndex((stop) => stop.view === view) + 1];
}

const tourFinishLabel = (step: StudyStep) => (step.tour === 'learn' ? 'Explore the views' : 'Start the tasks');

function ViewTour({ stops, view, seen, onView, finishLabel }: { stops: TourStopInfo[]; view: TourStop; seen: TourStop[]; onView: (view: TourStop) => void; finishLabel: string }) {
  return (
    <ol className="study-tour" aria-label="Views to look at, in order">
      {stops.map((stop, i) => {
        const state = stop.view === view ? 'current' : seen.includes(stop.view) ? 'seen' : 'todo';
        const partEnd = i < stops.length - 1 && stops[i + 1].part !== stop.part;
        return (
          <Fragment key={stop.view}>
          <li className={`${state}${partEnd ? ' part-end' : ''}`}>
            <button type="button" onClick={() => onView(stop.view)} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="study-tour-mark" aria-hidden="true">{state === 'seen' ? '✓' : i + 1}</span>
              <span><strong>{stop.label}</strong>{state === 'current' && <span className="study-tour-hint">{stop.hint}</span>}</span>
            </button>
          </li>
          </Fragment>
        );
      })}
      {/* Finish line: submits the step once the last view is open (same as the main button). */}
      <li className={`finish${view === stops.at(-1)!.view ? ' ready' : ''}`}>
        <button type="submit" disabled={view !== stops.at(-1)!.view}>
          <span className="study-tour-mark" aria-hidden="true">
            <svg width="10" height="11" viewBox="0 0 10 11"><path d="M1.5 10.5V1M1.5 1.5h6l-1.5 2 1.5 2h-6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </span>
          <span><strong>{finishLabel}</strong></span>
        </button>
      </li>
    </ol>
  );
}

function ExploreClock() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Sits in the step label row; the step's description says how long to take.
  return <span className="study-clock" title="Time on this step">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>;
}

interface Tour { stops: TourStopInfo[]; view: TourStop; seen: TourStop[]; onView: (view: TourStop) => void; itemId: string; onItem: (id: string) => void }

function StudyWorkspace({ step, loaded, stats, log, onGuide, tour }: { step: StudyStep; loaded: Loaded; stats: Stats; log: LogEvent; onGuide: () => void; tour?: Tour }) {
  const allItems = loaded.data.items;
  const [ownView, setOwnView] = useState<ViewKey>(step.initialView ?? 'compare');
  const view: TourStop = tour?.view ?? ownView;
  // Learn the ideas stays on one question until All questions; from there on, participants may pick any question.
  const overviewAt = tour ? tour.stops.findIndex((stop) => stop.view === 'overview') : -1;
  const tourOpen = tour != null && tour.stops.findIndex((stop) => stop.view === view) >= overviewAt;
  const availableItems = step.itemIds && !tourOpen ? step.itemIds.map((id) => allItems.find((item) => item.id === id)!) : allItems;
  const [ownItemId, setOwnItemId] = useState(availableItems[0].id);
  const itemId = tour?.itemId ?? ownItemId;
  const setItemId = tour?.onItem ?? setOwnItemId;
  const setView = (next: TourStop) => (tour ? tour.onView(next) : setOwnView(next as ViewKey));
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLButtonElement>(null);
  const item = availableItems.find((candidate) => candidate.id === itemId) ?? availableItems[0];
  const tabs: { key: TourStop; label: string }[] = tour ? tour.stops.map((stop) => ({ key: stop.view, label: stop.label }))
    : step.id.startsWith('rate-') ? VIEWS.filter((tab) => tab.key === step.initialView) : VIEWS.filter((tab) => !step.itemIds || step.mode === 'explore' || tab.key !== 'overview');

  useEffect(() => { log({ type: 'view_opened', stepId: step.id, itemId: item.id, view }); }, [item.id, view, step.id, log]);

  const closeAbout = useCallback(() => { setAboutOpen(false); aboutRef.current?.focus(); }, []);
  useEffect(() => {
    if (!aboutOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAbout(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [aboutOpen, closeAbout]);

  return (
    <section className={`study-workspace${step.mode === 'explore' ? ' point-at-controls' : ''}`} aria-label="Interactive evidence">
      <div className="study-workspace-tools">
        {availableItems.length > 1 ? (
          <label className="study-question-select"><span>Question {availableItems.indexOf(item) + 1} of {availableItems.length}</span><select value={item.id} onChange={(e) => setItemId(e.target.value)}>{availableItems.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.question}</option>)}</select></label>
        ) : <span className="study-workspace-label">Interactive evidence</span>}
        <div className="study-help-actions">
          {canShowStudyGuide(step) && <button className="btn guide-entry" onClick={onGuide}>Quick guide</button>}
          <button className="btn" ref={aboutRef} onClick={() => { setAboutOpen(true); log({ type: 'about_opened', stepId: step.id, itemId: item.id, view }); }}>About this method</button>
        </div>
      </div>
      {step.id === 'predict-correctness' && <div className="study-question-chips" aria-label="Questions to judge">{availableItems.map((candidate, i) => <button key={candidate.id} aria-pressed={candidate.id === item.id} className={candidate.id === item.id ? 'selected' : ''} onClick={() => setItemId(candidate.id)}><span>{i + 1}</span>{candidate.question}</button>)}</div>}
      <nav className="study-view-tabs" aria-label="Evidence views">{tabs.map((tab, i) => <button key={tab.key} aria-pressed={view === tab.key} className={view === tab.key ? 'selected' : ''} onClick={() => setView(tab.key)}>{tour && <span className="study-tab-step" aria-hidden="true">{tour.seen.includes(tab.key) && view !== tab.key ? '✓' : i + 1}</span>}{tab.label}</button>)}</nav>
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
        if (button && /Auto-play|See it change|Show result|Stop|Reset/.test(button.textContent ?? '')) log({ type: 'control_clicked', stepId: step.id, itemId: item.id, view, details: { control: button.textContent?.trim() ?? '' } });
      }}>
        <div className={`study-evidence-content evidence-${view}`}>
          <GuidanceContext.Provider value={canShowStudyGuide(step)}>
          {view === 'question' ? <QuestionIntro item={item} />
            : view === 'layers' ? <LayersIntro item={item} nLayers={loaded.data.meta.n_layers} />
            : view === 'push' ? <PushIntro item={item} stats={stats} />
            : view === 'scores' ? <ScoresIntro item={item} stats={stats} />
            : <>{tour && view === 'overview' && <p className="study-tour-lead">So far you looked at <strong>one question</strong>. Now let’s look at <strong>all {allItems.length} questions</strong> together. Click a dot to pick one.</p>}<EvidenceView view={view} item={item} items={allItems} stats={stats}
            header={<AnswerHeader item={item} compact revealKey={false} allowReveal={false} onReveal={() => {}} />}
            revealKey={false} allowReveal={false} overviewOpensFlipCurve={false} overviewHideCorrelation={tour != null} onOpenItem={(id, nextView) => { if (availableItems.some((candidate) => candidate.id === id)) { setItemId(id); setView(nextView); } }} /></>}
          </GuidanceContext.Provider>
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

function SubmissionId({ session }: { session: StudySession }) {
  const id = submissionId(session);
  const [copied, setCopied] = useState(false);
  return (
    <div className="study-submission-id">
      <span>Your submission ID</span>
      <strong>{id}</strong>
      <button className="btn" onClick={() => {
        navigator.clipboard?.writeText(id).then(() => setCopied(true), () => setCopied(false));
      }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
  );
}

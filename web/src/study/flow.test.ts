/// <reference types="node" />
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { advanceSession, canGoBack, isAnswered, missingRequired, stepDuration } from './flow.ts';
import { canShowStudyGuide, getExplorerGuideExposure, GUIDE_VERSION, guideVersionFor, recordExplorerGuideExposure } from './guidance.ts';
import { APP_VERSION, clearSession, createSession, downloadSession, loadSession, saveSession, sessionToCsv, viewOrderText } from './storage.ts';
import { DEFAULT_VIEW_ORDER, VIEW_ORDERS, viewOrderFor } from './viewOrder.ts';
import type { StudyQuestion, StudyStep } from './questionnaire';
import type { StudySession } from './storage';

const NOW = '2026-11-16T15:00:00.000Z';
const LATER = '2026-11-16T15:01:00.000Z';
const choices = ['right', 'wrong', 'not-sure'].map((value) => ({ value, label: value }));

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    version: 1, id: 'test-participant', taskSet: 'A', datasetKey: 'test-data',
    startedAt: NOW, updatedAt: NOW, stepIndex: 0, answers: {}, events: [], ...overrides,
  };
}

function question(type: StudyQuestion['type'], overrides: Partial<StudyQuestion> = {}): StudyQuestion {
  return { id: 'response', prompt: 'Choose a response', type, required: true, options: choices, ...overrides };
}

function step(id: string, mode: StudyStep['mode'], questions: StudyQuestion[] = [], section = 'C'): StudyStep {
  return { id, title: id, mode, questions, section };
}

function replaceGlobal(t: TestContext, key: string, value: unknown): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  });
}

function mockStorage(t: TestContext, kind: 'localStorage' | 'sessionStorage' = 'localStorage'): Map<string, string> {
  const data = new Map<string, string>();
  replaceGlobal(t, kind, {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  return data;
}

test('required answers reject blank text, unknown options, and invalid scale values', () => {
  assert.equal(isAnswered(question('text'), '  \n'), false);
  assert.equal(isAnswered(question('text'), 'Not sure'), true);
  assert.equal(isAnswered(question('single'), 'right'), true);
  assert.equal(isAnswered(question('single'), 'unlisted'), false);
  assert.equal(isAnswered(question('single'), undefined), false);
  const rating = question('scale', { min: 1, max: 5 });
  for (const value of [0, 6, 2.5, NaN, Infinity, '3']) assert.equal(isAnswered(rating, value), false);
  assert.equal(isAnswered(rating, 1), true);
  assert.equal(isAnswered(rating, 5), true);
  assert.equal(isAnswered(question('multi'), []), false);
  assert.equal(isAnswered(question('multi'), ['right', 'unlisted']), false);
  assert.equal(isAnswered(question('multi'), ['right', 'not-sure']), true);

  const survey = step('survey', 'form', [
    question('text', { id: 'optional', required: false }),
    question('single', { id: 'choice' }),
    question('scale', { id: 'rating' }),
  ]);
  assert.deepEqual(missingRequired(survey, { choice: 'right', rating: 9 }), ['rating']);
  assert.deepEqual(missingRequired(survey, { choice: 'right', rating: 7 }), []);
});

test('ranking requires every view exactly once', () => {
  const ranking = question('ranking', {
    options: ['r0', 'r1', 'r2', 'r3', 'r4'].map((value) => ({ value, label: value })),
  });
  assert.equal(isAnswered(ranking, ['r3', 'r1', 'r4', 'r0', 'r2']), true);
  for (const value of [[], ['r0'], ['r0', 'r1', 'r2', 'r3', 'r3'], ['r0', 'r1', 'r2', 'r3', 'other']]) {
    assert.equal(isAnswered(ranking, value), false);
  }
});

test('predictions must be valid and complete before the answer-reveal step opens', () => {
  const steps = [
    step('predictions', 'task', [question('single', { id: 'C13_a' }), question('single', { id: 'C13_b' })]),
    step('answer-key', 'reveal'),
  ];
  const incomplete = session({ answers: { C13_a: 'right' } });
  assert.strictEqual(advanceSession(incomplete, steps, 20_000, LATER), incomplete);
  assert.deepEqual(incomplete.events, []);

  const invalid = session({ answers: { C13_a: 'right', C13_b: 'invalid' } });
  assert.strictEqual(advanceSession(invalid, steps, 20_000, LATER), invalid);

  const complete = session({ answers: { C13_a: 'right', C13_b: 'not-sure' } });
  const snapshot = structuredClone(complete);
  const advanced = advanceSession(complete, steps, 20_000, LATER);
  assert.equal(advanced.stepIndex, 1);
  assert.deepEqual(advanced.answers, complete.answers);
  assert.deepEqual(advanced.events, [
    { type: 'step_submitted', stepId: 'predictions', at: LATER, details: { durationMs: 20_000 } },
    { type: 'answers_revealed', stepId: 'answer-key', at: LATER },
  ]);
  assert.deepEqual(complete, snapshot, 'advancing must not mutate the saved predictions');
});

test('completion records one final event and completed sessions cannot advance again', () => {
  const steps = [step('last-feedback', 'form')];
  const completed = advanceSession(session(), steps, -10, LATER);
  assert.equal(completed.completedAt, LATER);
  assert.equal(completed.stepIndex, 0);
  assert.equal(completed.events[0].details?.durationMs, 0);
  assert.deepEqual(completed.events.at(-1), { type: 'study_completed', at: LATER });
  const snapshot = structuredClone(completed);
  Object.freeze(completed);
  assert.strictEqual(advanceSession(completed, steps, 1000, '2026-11-16T16:00:00.000Z'), completed);
  assert.deepEqual(completed, snapshot);
});

test('step timing accumulates paused segments and resets after that step was submitted', () => {
  const paused = session({ events: [
    { type: 'step_paused', stepId: 'survey', at: NOW, details: { durationMs: 3000 } },
    { type: 'step_paused', stepId: 'another-step', at: NOW, details: { durationMs: 50_000 } },
    { type: 'step_submitted', stepId: 'another-step', at: NOW, details: { durationMs: 50_000 } },
    { type: 'step_paused', stepId: 'survey', at: LATER, details: { durationMs: 7000 } },
  ] });
  assert.equal(stepDuration(paused, 'survey', 2000), 12_000);

  const revisited = session({ events: [
    ...paused.events,
    { type: 'step_submitted', stepId: 'survey', at: LATER, details: { durationMs: 12_000 } },
    { type: 'step_paused', stepId: 'survey', at: LATER, details: { durationMs: 4000 } },
  ] });
  assert.equal(stepDuration(revisited, 'survey', 500), 4500);
  assert.equal(stepDuration(session(), 'survey', -100), 0);
});

test('Back permits adjacent survey pages but never returns from reveal to predictions', () => {
  const steps = [
    step('predictions', 'task'), step('answer-key', 'reveal'),
    step('steering-ratings', 'form', [], 'D'), step('steering-feedback', 'form', [], 'D'),
    step('preferences', 'form', [], 'E'),
  ];
  assert.equal(canGoBack(steps, 0), false);
  assert.equal(canGoBack(steps, 1), false);
  assert.equal(canGoBack(steps, 2), false);
  assert.equal(canGoBack(steps, 3), true);
  assert.equal(canGoBack(steps, 4), false);
  assert.equal(canGoBack(steps, 99), false);
});

test('guidance stays unavailable during free exploration, first impressions, and understanding checks', () => {
  for (const current of [
    step('explore', 'explore', [], 'B'),
    step('first-impressions', 'form', [], 'B'),
    step('understanding-scores', 'form', [], 'F'),
    step('understanding-interventions', 'form', [], 'F'),
    step('reveal-answers', 'reveal'),
  ]) {
    assert.equal(canShowStudyGuide(current), false);
  }
  assert.equal(canShowStudyGuide(step('read-answer', 'task')), true);
  assert.equal(canShowStudyGuide(step('steer-answer', 'task')), true);
});

test('guide exposure uses the latest opened version and legacy sessions remain unchanged', (t) => {
  mockStorage(t);
  const legacy = session({ stepIndex: 7, answers: { A2: 'PhD' } });
  assert.equal(saveSession(legacy), true);
  assert.deepEqual(loadSession('test-data'), legacy);
  assert.equal(guideVersionFor(legacy.events), 'none');
  assert.ok(sessionToCsv(legacy).includes('"A2","PhD","none","","r1 r2 r3 r4"\r\n'));

  const exposed = session({ answers: { A2: 'PhD', A3: 4 }, events: [
    { type: 'guide_opened', at: NOW, details: { version: 'old-guide' } },
    { type: 'guide_opened', at: LATER, details: { version: GUIDE_VERSION } },
    { type: 'guide_step', at: LATER, details: { version: GUIDE_VERSION, step: 2 } },
    { type: 'guide_closed', at: LATER, details: { version: GUIDE_VERSION } },
  ] });
  assert.equal(guideVersionFor(exposed.events), GUIDE_VERSION);
  const rows = sessionToCsv(exposed).trimEnd().split('\r\n');
  assert.equal(rows.length, 3);
  assert.ok(rows.slice(1).every((row) => row.endsWith(`"${GUIDE_VERSION}","","r1 r2 r3 r4"`)));
  assert.equal(saveSession(exposed), true);
  assert.deepEqual(loadSession('test-data'), exposed);
});

test('explorer guide exposure survives storage reads with its original timestamp and version', (t) => {
  const data = mockStorage(t, 'sessionStorage');
  assert.equal(getExplorerGuideExposure(), null);
  recordExplorerGuideExposure();
  const stored = JSON.parse(data.get('uncircuit.guide.exposure.v1')!);
  assert.equal(stored.version, GUIDE_VERSION);
  assert.ok(Number.isFinite(Date.parse(stored.at)));
  assert.deepEqual(getExplorerGuideExposure(), {
    type: 'guide_opened', at: stored.at, details: { version: GUIDE_VERSION, source: 'explorer' },
  });
  data.set('uncircuit.guide.exposure.v1', JSON.stringify({ version: 'earlier-guide', at: NOW }));
  assert.deepEqual(getExplorerGuideExposure(), {
    type: 'guide_opened', at: NOW, details: { version: 'earlier-guide', source: 'explorer' },
  });
});

test('missing or malformed explorer exposure does not create a study event', (t) => {
  const data = mockStorage(t, 'sessionStorage');
  for (const value of ['{broken', 'null', '[]', '{}', JSON.stringify({ version: GUIDE_VERSION, at: 'invalid' }), JSON.stringify({ version: 1, at: NOW })]) {
    data.set('uncircuit.guide.exposure.v1', value);
    assert.equal(getExplorerGuideExposure(), null);
    assert.equal(data.get('uncircuit.guide.exposure.v1'), value);
  }
});

test('explorer guide remains usable when session storage is blocked', (t) => {
  replaceGlobal(t, 'sessionStorage', {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Storage blocked'); },
  });
  assert.doesNotThrow(() => recordExplorerGuideExposure());
  assert.equal(getExplorerGuideExposure(), null);
});

test('autosave preserves the entire session and prevents cross-dataset resume', (t) => {
  const data = mockStorage(t);
  const original = session({
    taskSet: 'B', stepIndex: 4,
    answers: { A2: 'PhD', A3: 4, B3: ['r0', 'r3'], C16: 'It changed twice.\nUnexpected.' },
    events: [{ type: 'slider_changed', at: NOW, stepId: 'steer-answer', itemId: 'q24', view: 'r3', details: { push: 0.005, layer: 23, playing: false } }],
  });
  assert.equal(saveSession(original), true);
  assert.deepEqual(loadSession('test-data'), original);
  assert.notStrictEqual(loadSession('test-data'), original);
  assert.deepEqual(JSON.parse([...data.values()][0]), original);
  assert.equal(loadSession('another-dataset'), null);
  assert.equal(data.size, 1, 'an incompatible session must not be silently deleted');
  assert.equal(clearSession(), true);
  assert.equal(loadSession('test-data'), null);
});

test('corrupt saves are ignored without deleting them', (t) => {
  const data = mockStorage(t);
  saveSession(session());
  const key = [...data.keys()][0];
  const corrupt = ['{unfinished', JSON.stringify(session({ stepIndex: -1 })), JSON.stringify({ ...session(), answers: { bad: {} } })];
  for (const stored of corrupt) {
    data.set(key, stored);
    assert.equal(loadSession('test-data'), null);
    assert.equal(data.get(key), stored);
  }
});

test('blocked browser storage reports failure without losing the in-memory response', (t) => {
  replaceGlobal(t, 'localStorage', {
    getItem() { throw new Error('Storage blocked'); },
    setItem() { throw new Error('Quota exceeded'); },
    removeItem() { throw new Error('Storage blocked'); },
  });
  const original = session({ answers: { B1: 'A saved thought' } });
  assert.equal(saveSession(original), false);
  assert.equal(loadSession('test-data'), null);
  assert.equal(clearSession(), false);
  assert.equal(original.answers.B1, 'A saved thought');
});

test('CSV preserves quoted/multiline responses and neutralizes spreadsheet formulas', () => {
  const csv = sessionToCsv(session({
    answers: { B1: 'Hello, "world"\nA second line', B3: ['r0', 'r3'], A3: 4, H4: '=HYPERLINK("bad")', H5: '\t=2+2', H6: '  @SUM(1,2)' },
  }));
  assert.ok(csv.startsWith('"participant_id","task_set","started_at","completed_at","question_id","response","guidance_version","app_version","view_order"\r\n'));
  assert.ok(csv.includes('"Hello, ""world""\nA second line"'));
  assert.ok(csv.includes('"[""r0"",""r3""]"'));
  assert.ok(csv.includes('"A3","4"'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\'\t=2+2"'));
  assert.ok(csv.includes('"\'  @SUM(1,2)"'));
  assert.ok(csv.endsWith('\r\n'));
});

test('JSON download contains answers, assignment, timings, and interaction events', async (t) => {
  let exported: Blob | undefined;
  let clicked = false;
  let removed = false;
  let revoked = false;
  const link = { href: '', download: '', click() { clicked = true; }, remove() { removed = true; } };
  replaceGlobal(t, 'document', { createElement: () => link, body: { append() {} } });
  replaceGlobal(t, 'window', { setTimeout: (callback: () => void) => callback() });
  t.mock.method(URL, 'createObjectURL', (blob: Blob) => { exported = blob; return 'blob:test-export'; });
  t.mock.method(URL, 'revokeObjectURL', () => { revoked = true; });
  const original = session({
    completedAt: LATER, answers: { C13_a: 'right' },
    events: [{ type: 'step_submitted', at: LATER, stepId: 'predictions', details: { durationMs: 10_000 } }],
  });
  downloadSession(original, 'json');
  assert.ok(exported);
  assert.deepEqual(JSON.parse(await exported.text()), original);
  assert.equal(link.download, 'uncircuit-test-participant.json');
  assert.equal(clicked && removed && revoked, true);
});

test('new sessions record the site release they started on', (t) => {
  mockStorage(t);
  const started = createSession('test-data');
  assert.equal(started.appVersion, APP_VERSION);
  started.answers = { A2: 'PhD' };
  assert.ok(sessionToCsv(started).includes(`"A2","PhD","none","${APP_VERSION}","${viewOrderText(started)}"\r\n`));
  assert.equal(saveSession(started), true);
  assert.deepEqual(loadSession('test-data'), started);
});

test('view orders form a balanced Latin square over R1–R4', () => {
  const views = [...DEFAULT_VIEW_ORDER].sort();
  for (let position = 0; position < views.length; position++) {
    assert.deepEqual(VIEW_ORDERS.map((order) => order[position]).sort(), views, `position ${position + 1}`);
  }
  const pairs = VIEW_ORDERS.flatMap((order) => order.slice(1).map((view, i) => `${order[i]}>${view}`));
  assert.equal(new Set(pairs).size, views.length * (views.length - 1), 'every view comes right before every other view once');
});

test('new sessions get a rotated view order; older sessions keep the original order', (t) => {
  mockStorage(t);
  const started = createSession('test-data');
  assert.ok(Number.isInteger(started.viewOrder) && started.viewOrder! >= 0 && started.viewOrder! < VIEW_ORDERS.length);
  assert.deepEqual(viewOrderFor(started.viewOrder), VIEW_ORDERS[started.viewOrder!]);
  assert.deepEqual(viewOrderFor(undefined), ['r1', 'r2', 'r3', 'r4']);
  assert.equal(saveSession({ ...started, viewOrder: 9 }), false, 'an out-of-range order is not a valid session');
});

test('new sessions have anonymous identifiers and an A/B assignment', () => {
  const first = createSession('test-data');
  const second = createSession('test-data');
  assert.notEqual(first.id, second.id);
  assert.ok(['A', 'B'].includes(first.taskSet));
  assert.equal(first.datasetKey, 'test-data');
  assert.deepEqual(first.answers, {});
  assert.deepEqual(first.events, []);
});

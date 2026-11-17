import type { StudyQuestion, StudyStep } from './questionnaire';
import type { StudySession } from './storage';

export function isAnswered(question: StudyQuestion, value: StudySession['answers'][string] | undefined): boolean {
  const validOption = (entry: string) => question.options?.some((option) => option.value === entry) ?? false;
  switch (question.type) {
    case 'text': return typeof value === 'string' && value.trim().length > 0;
    case 'single': return typeof value === 'string' && validOption(value);
    case 'scale': return typeof value === 'number' && Number.isInteger(value) && value >= (question.min ?? 1) && value <= (question.max ?? 7);
    case 'multi': return Array.isArray(value) && value.length > 0 && value.every(validOption);
    case 'ranking': return Array.isArray(value) && value.length === question.options?.length && new Set(value).size === value.length && value.every(validOption);
  }
}

export function missingRequired(step: StudyStep, answers: StudySession['answers']): string[] {
  return step.questions.filter((q) => q.required && !isAnswered(q, answers[q.id])).map((q) => q.id);
}

// Back is allowed only within a survey section, never across exploration or a reveal.
export function canGoBack(steps: StudyStep[], index: number): boolean {
  const previous = steps[index - 1];
  const current = steps[index];
  return !!previous && !!current && previous.mode === 'form' && current.mode === 'form' && previous.section === current.section;
}

export function stepDuration(session: StudySession, stepId: string, currentMs: number): number {
  const lastSubmission = session.events.findLastIndex((event) => event.type === 'step_submitted' && event.stepId === stepId);
  return session.events.slice(lastSubmission + 1).reduce((total, event) =>
    event.type === 'step_paused' && event.stepId === stepId
      ? total + Number(event.details?.durationMs ?? 0) : total,
  Math.max(0, currentMs));
}

export function advanceSession(session: StudySession, steps: StudyStep[], durationMs: number, at = new Date().toISOString()): StudySession {
  const step = steps[session.stepIndex];
  if (session.completedAt || !step || missingRequired(step, session.answers).length > 0) return session;
  const finished = session.stepIndex === steps.length - 1;
  const next = steps[session.stepIndex + 1];
  return {
    ...session,
    updatedAt: at,
    stepIndex: finished ? session.stepIndex : session.stepIndex + 1,
    ...(finished ? { completedAt: at } : {}),
    events: [
      ...session.events,
      { type: 'step_submitted', stepId: step.id, at, details: { durationMs: Math.max(0, durationMs) } },
      ...(next ? [{ type: next.mode === 'reveal' ? 'answers_revealed' : 'step_started', stepId: next.id, at }] : [{ type: 'study_completed', at }]),
    ],
  };
}

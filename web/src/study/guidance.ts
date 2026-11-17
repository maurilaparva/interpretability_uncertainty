import type { StudyStep } from './questionnaire';
import type { StudyEvent } from './storage';

export const GUIDE_VERSION = 'quick-guide-v1';
const EXPLORER_EXPOSURE_KEY = 'uncircuit.guide.exposure.v1';

export function recordExplorerGuideExposure(): void {
  try {
    sessionStorage.setItem(EXPLORER_EXPOSURE_KEY, JSON.stringify({ version: GUIDE_VERSION, at: new Date().toISOString() }));
  } catch {
    // The guide still works when browser storage is unavailable.
  }
}

export function getExplorerGuideExposure(): StudyEvent | null {
  try {
    const stored = sessionStorage.getItem(EXPLORER_EXPOSURE_KEY);
    if (!stored) return null;
    const exposure: unknown = JSON.parse(stored);
    if (!exposure || typeof exposure !== 'object' || Array.isArray(exposure)) return null;
    const { version, at } = exposure as Record<string, unknown>;
    if (typeof version !== 'string' || !version || typeof at !== 'string' || !Number.isFinite(Date.parse(at))) return null;
    return { type: 'guide_opened', at, details: { version, source: 'explorer' } };
  } catch {
    return null;
  }
}

export function canShowStudyGuide(step: Pick<StudyStep, 'id' | 'mode'>): boolean {
  return step.mode === 'task';
}

export function shouldAutoShowGuide(step: Pick<StudyStep, 'id' | 'mode'>, events: readonly StudyEvent[]): boolean {
  return canShowStudyGuide(step)
    && step.id === 'read-answer'
    && !events.some((event) => event.type === 'guide_closed' && event.details?.version === GUIDE_VERSION);
}

export function guideVersionFor(events: readonly StudyEvent[]): string {
  const opened = events.findLast((event) => event.type === 'guide_opened' && typeof event.details?.version === 'string');
  return typeof opened?.details?.version === 'string' ? opened.details.version : 'none';
}

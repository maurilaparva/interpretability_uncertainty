export interface StudyEvent {
  type: string;
  at: string;
  stepId?: string;
  itemId?: string;
  view?: string;
  details?: Record<string, string | number | boolean>;
}

export interface StudySession {
  version: 1;
  id: string;
  taskSet: 'A' | 'B';
  datasetKey: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Set once the Google Sheets endpoint confirmed receipt. */
  submittedAt?: string;
  stepIndex: number;
  answers: Record<string, string | string[] | number>;
  events: StudyEvent[];
}

const STORAGE_KEY = 'uncircuit.study.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isEvent(value: unknown): value is StudyEvent {
  if (!isRecord(value) || typeof value.type !== 'string' || !isDate(value.at)) return false;
  if (['stepId', 'itemId', 'view'].some((key) => value[key] !== undefined && typeof value[key] !== 'string')) return false;
  return value.details === undefined || (
    isRecord(value.details) && Object.values(value.details).every((detail) =>
      typeof detail === 'string' || typeof detail === 'boolean' || (typeof detail === 'number' && Number.isFinite(detail)),
    )
  );
}

function isSession(value: unknown): value is StudySession {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.id === 'string' && value.id.length > 0
    && (value.taskSet === 'A' || value.taskSet === 'B')
    && typeof value.datasetKey === 'string'
    && isDate(value.startedAt) && isDate(value.updatedAt)
    && (value.completedAt === undefined || isDate(value.completedAt))
    && (value.submittedAt === undefined || isDate(value.submittedAt))
    && Number.isInteger(value.stepIndex) && (value.stepIndex as number) >= 0
    && isRecord(value.answers)
    && Object.values(value.answers).every((answer) =>
      typeof answer === 'string'
      || (typeof answer === 'number' && Number.isFinite(answer))
      || (Array.isArray(answer) && answer.every((entry) => typeof entry === 'string')),
    )
    && Array.isArray(value.events) && value.events.every(isEvent);
}

export function createSession(datasetKey: string): StudySession {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.()
    ?? `participant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const random = globalThis.crypto?.getRandomValues(new Uint8Array(1))[0] ?? Math.floor(Math.random() * 256);
  return {
    version: 1,
    id,
    taskSet: random % 2 === 0 ? 'A' : 'B',
    datasetKey,
    startedAt: now,
    updatedAt: now,
    stepIndex: 0,
    answers: {},
    events: [],
  };
}

export function loadSession(datasetKey: string): StudySession | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const session: unknown = JSON.parse(stored);
    return isSession(session) && session.datasetKey === datasetKey ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StudySession): boolean {
  try {
    if (!isSession(session)) return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function csvCell(value: string): string {
  // Quoting handles commas/newlines; the apostrophe also prevents spreadsheet formulas.
  const safe = /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function sessionToCsv(session: StudySession): string {
  const rows: string[][] = [['participant_id', 'task_set', 'started_at', 'completed_at', 'question_id', 'response']];
  for (const [questionId, answer] of Object.entries(session.answers)) {
    rows.push([
      session.id,
      session.taskSet,
      session.startedAt,
      session.completedAt ?? '',
      questionId,
      Array.isArray(answer) ? JSON.stringify(answer) : String(answer),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Apps Script web app URL (…/exec). Set VITE_SHEETS_URL in web/.env.local; unset disables uploads. */
// `env` is undefined when the tests import this file under plain Node.
const SHEETS_URL = (import.meta.env?.VITE_SHEETS_URL as string | undefined)?.trim() || undefined;

export const sheetsEnabled = SHEETS_URL !== undefined;

/** POSTs the full session to the Google Sheets endpoint. Resolves true only when the script reports ok. */
export async function submitSession(session: StudySession): Promise<boolean> {
  if (!SHEETS_URL) return false;
  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      // text/plain keeps this a "simple" request: Apps Script cannot answer a CORS preflight.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(session),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return isRecord(result) && result.ok === true;
  } catch {
    return false;
  }
}

export function downloadSession(session: StudySession, format: 'csv' | 'json'): void {
  const content = format === 'csv' ? sessionToCsv(session) : `${JSON.stringify(session, null, 2)}\n`;
  const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `uncircuit-${session.id.replace(/[^a-zA-Z0-9_-]/g, '')}.${format}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

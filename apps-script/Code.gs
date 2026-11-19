/**
 * Receives finished study sessions from the web app and writes them to this spreadsheet.
 *
 * Deploy: Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 * After editing: Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy.
 * Health check: open the /exec URL in a browser; it should show {"ok":true,...}.
 *
 * Tabs (created automatically):
 *   Responses: one row per participant, one column per question id. Resubmitting overwrites the row.
 *   Events:    one row per interaction event. Written only on a participant's first submission.
 */

const RESP = 'Responses';
const EVENTS = 'Events';
const BASE_HEADERS = ['participant_id', 'task_set', 'app_version', 'started_at', 'completed_at', 'received_at'];
const EVENT_HEADERS = ['participant_id', 'at', 'type', 'step_id', 'item_id', 'view', 'details'];

function doGet() {
  return json({ ok: true, service: 'study-responses', time: new Date().toISOString() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json({ ok: false, error: 'busy, try again' });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('empty request body');
    const s = JSON.parse(e.postData.contents);
    if (!s || typeof s.id !== 'string' || !s.id || typeof s.answers !== 'object' || s.answers === null) {
      throw new Error('not a study session');
    }

    const ss = SpreadsheetApp.getActive();
    const resp = sheet(ss, RESP, BASE_HEADERS);
    const events = sheet(ss, EVENTS, EVENT_HEADERS);

    const firstSubmission = findRow(resp, s.id) < 0;
    writeResponses(resp, s);
    if (firstSubmission) writeEvents(events, s);

    return json({ ok: true, firstSubmission: firstSubmission });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Returns the named tab, creating it with a frozen header row if needed. */
function sheet(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 1-based row index of a participant in column A, or -1. */
function findRow(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(function (r) { return String(r[0]); });
  const i = ids.indexOf(id);
  return i < 0 ? -1 : i + 2;
}

// One row per participant, one column per question (new questions add columns).
function writeResponses(sh, s) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  // Sheets created before a base column existed (e.g. app_version) get it appended.
  BASE_HEADERS.concat(Object.keys(s.answers)).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); });
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  const vals = {
    participant_id: s.id,
    task_set: s.taskSet || '',
    app_version: s.appVersion || '',
    started_at: s.startedAt || '',
    completed_at: s.completedAt || '',
    received_at: new Date().toISOString(),
  };
  Object.keys(s.answers).forEach(function (k) {
    const v = s.answers[k];
    vals[k] = Array.isArray(v) ? JSON.stringify(v) : v;
  });
  const row = headers.map(function (h) { return safe(vals[h] === undefined || vals[h] === null ? '' : vals[h]); });

  // Overwrite if this participant already submitted (a retry), else append.
  const existing = findRow(sh, s.id);
  sh.getRange(existing > 0 ? existing : sh.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function writeEvents(sh, s) {
  const rows = (Array.isArray(s.events) ? s.events : []).map(function (ev) {
    return [s.id, ev.at || '', ev.type || '', ev.stepId || '', ev.itemId || '', ev.view || '',
      ev.details ? JSON.stringify(ev.details) : ''].map(safe);
  });
  if (rows.length) sh.getRange(sh.getLastRow() + 1, 1, rows.length, EVENT_HEADERS.length).setValues(rows);
}

// Stop free-text answers being run as formulas.
function safe(v) {
  return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

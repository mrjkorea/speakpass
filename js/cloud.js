import { APP_ID, APP_NAME } from './config.js';

function authApi() {
  return globalThis.MRJ_AUTH || null;
}

function scoresApi() {
  return globalThis.MRJ_SCORES || null;
}

/** Signed-in student id. Never a password. */
export function studentId() {
  const api = authApi();
  if (!api || typeof api.student !== 'function') return '';
  try {
    return String(api.student() || '').trim();
  } catch (err) {
    return '';
  }
}

export async function loadProgressPack() {
  const api = authApi();
  if (!api || typeof api.loadPack !== 'function') return { ok: false, error: 'no_auth' };
  const res = await api.loadPack(APP_ID);
  return res || { ok: false, error: 'pack_load_failed' };
}

export async function saveProgressPack(json) {
  const api = authApi();
  if (!api || typeof api.savePack !== 'function') return { ok: false, error: 'no_auth' };
  return api.savePack(APP_ID, json);
}

/**
 * Fields for one scored question.
 * The locked client sends program, itemId, scoreValue, and scoreMax.
 * app, item, score, and total are the same values under the names this app uses.
 */
export function noteScoreArgs(item, score, total) {
  const pct = total > 0 ? Math.round((Number(score) / Number(total)) * 100) : 0;
  return {
    app: APP_ID,
    item,
    score,
    total,
    program: APP_ID,
    itemId: item,
    scoreValue: score,
    scoreMax: total,
    scorePct: pct
  };
}

/** Plain student id. mrj-scores.js writes that id into student_email. */
export function scorePostArgs({ student, item, score, total, testTitle, testId, mode, type }) {
  const pct = total > 0 ? Math.round((Number(score) / Number(total)) * 100) : 0;
  return {
    student,
    program: APP_ID,
    appName: APP_NAME,
    source: APP_ID,
    bookTitle: testTitle || '',
    unitTitle: testId || '',
    itemId: item,
    itemType: type || 'speaking',
    scoreValue: score,
    scoreMax: total,
    scorePct: pct,
    completed: true,
    metadata: { mode: mode || '', testId: testId || '' }
  };
}

export function noteScoredItem(item, score, total) {
  const api = authApi();
  if (!api || typeof api.noteScore !== 'function') return Promise.resolve({ ok: false, error: 'no_auth' });
  return api.noteScore(noteScoreArgs(item, score, total));
}

export function postScoredItem(fields) {
  const api = scoresApi();
  if (!api || typeof api.post !== 'function') return Promise.resolve({ status: 'skipped' });
  return api.post(scorePostArgs(fields));
}

export async function reportScoredItems(items, meta) {
  const who = studentId();
  if (!who || !items || !items.length) return;
  await Promise.all(items.map(async (row) => {
    if (studentId() !== who) return;
    await Promise.all([
      noteScoredItem(row.item, row.score, row.total).catch(() => null),
      postScoredItem({
        student: who,
        item: row.item,
        score: row.score,
        total: row.total,
        testTitle: meta && meta.testTitle,
        testId: meta && meta.testId,
        mode: meta && meta.mode,
        type: row.type
      }).catch(() => null)
    ]);
  }));
}

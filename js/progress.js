/** Cloud progress pack for app id `speakpass`. No audio, no passwords. */

export const PACK_VERSION = 1;
export const MAX_ATTEMPTS = 40;
export const MAX_PACK_CHARS = 45000;

export function emptyPack() {
  return { v: PACK_VERSION, items: {}, attempts: [] };
}

export function itemKey(testId, q) {
  return `${testId}:${q}`;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turns a grade into score/total.
 * Numeric grades are kept. "coming soon" and other text count as finished (1/1)
 * when a recording exists, and 0/1 when it does not.
 */
export function coerceScore(grade, hasAudio) {
  if (typeof grade === 'number' && Number.isFinite(grade)) {
    return { score: grade, total: 100, graded: true };
  }
  const text = String(grade == null ? '' : grade).trim();
  const slash = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (slash) {
    const score = Number(slash[1]);
    const total = Number(slash[2]);
    if (total > 0) return { score, total, graded: true };
  }
  const pct = text.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) return { score: Number(pct[1]), total: 100, graded: true };
  return { score: hasAudio ? 1 : 0, total: 1, graded: false };
}

export function parsePack(json) {
  let data = json;
  if (typeof json === 'string') {
    const trimmed = json.trim();
    if (!trimmed) return emptyPack();
    try {
      data = JSON.parse(trimmed);
    } catch (err) {
      return emptyPack();
    }
  }
  if (!data || typeof data !== 'object') return emptyPack();
  const items = {};
  const rawItems = data.items && typeof data.items === 'object' ? data.items : {};
  for (const [key, value] of Object.entries(rawItems)) {
    if (!/^.+:\d+$/.test(key) || !value || typeof value !== 'object') continue;
    const score = finiteNumber(value.score);
    const total = finiteNumber(value.total);
    if (score == null || total == null || total <= 0) continue;
    const attempts = finiteNumber(value.attempts);
    items[key] = {
      score,
      total,
      graded: value.graded === true,
      attempts: attempts && attempts > 0 ? attempts : 1,
      at: String(value.at || ''),
      type: String(value.type || '')
    };
  }
  const attempts = [];
  const rawAttempts = Array.isArray(data.attempts) ? data.attempts : [];
  for (const attempt of rawAttempts.slice(-MAX_ATTEMPTS)) {
    if (!attempt || typeof attempt !== 'object') continue;
    const answers = [];
    for (const ans of Array.isArray(attempt.answers) ? attempt.answers : []) {
      const score = finiteNumber(ans && ans.score);
      const total = finiteNumber(ans && ans.total);
      const q = finiteNumber(ans && ans.q);
      if (score == null || total == null || total <= 0 || q == null) continue;
      answers.push({
        q,
        type: String((ans && ans.type) || ''),
        score,
        total
      });
    }
    attempts.push({
      id: String(attempt.id || ''),
      testId: String(attempt.testId || ''),
      testTitle: String(attempt.testTitle || ''),
      mode: String(attempt.mode || ''),
      startedAt: String(attempt.startedAt || ''),
      finishedAt: String(attempt.finishedAt || ''),
      complete: attempt.complete === true,
      answers
    });
  }
  return { v: PACK_VERSION, items, attempts };
}

function ratio(score, total) {
  return total > 0 ? score / total : 0;
}

function hasAudio(ans) {
  if (!ans) return false;
  if (ans.hasAudio != null) return !!ans.hasAudio;
  return !!(ans.blob && ans.blob.size > 0);
}

/**
 * Merges one finished attempt into a pack.
 * Keeps the better score per question. The returned `scored` rows are this attempt.
 */
export function applyAttempt(pack, attempt, gradeByQ) {
  const next = parsePack(JSON.stringify(parsePack(pack)));
  const scored = [];
  const answers = [];
  const grades = gradeByQ || {};
  for (const ans of (attempt && attempt.answers) || []) {
    if (!ans || ans.q == null || !attempt.testId) continue;
    const graded = coerceScore(grades[ans.q], hasAudio(ans));
    const key = itemKey(attempt.testId, ans.q);
    const prev = next.items[key];
    const prevRatio = prev ? ratio(prev.score, prev.total) : -1;
    const nextRatio = ratio(graded.score, graded.total);
    const keepPrev = !!prev && (
      (prev.graded === true && graded.graded !== true) ||
      (prev.graded === graded.graded && prevRatio > nextRatio)
    );
    next.items[key] = {
      score: keepPrev ? prev.score : graded.score,
      total: keepPrev ? prev.total : graded.total,
      graded: keepPrev ? prev.graded === true : graded.graded,
      attempts: (prev ? prev.attempts : 0) + 1,
      at: String((attempt && attempt.finishedAt) || ''),
      type: String(ans.type || (prev && prev.type) || '')
    };
    const row = {
      item: key,
      q: ans.q,
      type: String(ans.type || ''),
      score: graded.score,
      total: graded.total
    };
    scored.push(row);
    answers.push({ q: row.q, type: row.type, score: row.score, total: row.total });
  }
  if (answers.length) {
    next.attempts.push({
      id: String((attempt && attempt.id) || ''),
      testId: String(attempt.testId || ''),
      testTitle: String((attempt && attempt.testTitle) || ''),
      mode: String((attempt && attempt.mode) || ''),
      startedAt: String((attempt && attempt.startedAt) || ''),
      finishedAt: String((attempt && attempt.finishedAt) || ''),
      complete: !!(attempt && attempt.complete),
      answers
    });
  }
  if (next.attempts.length > MAX_ATTEMPTS) {
    next.attempts = next.attempts.slice(-MAX_ATTEMPTS);
  }
  return { pack: next, scored };
}

export function questionsForTest(pack, testId) {
  const prefix = `${testId}:`;
  return Object.entries((pack && pack.items) || {})
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => ({ q: Number(key.slice(prefix.length)), ...value }))
    .filter((row) => Number.isInteger(row.q))
    .sort((a, b) => a.q - b.q);
}

export function savedQuestion(pack, testId, q) {
  if (!pack || !pack.items) return null;
  return pack.items[itemKey(testId, q)] || null;
}

export function packJson(pack) {
  const body = parsePack(pack);
  let text = JSON.stringify(body);
  while (text.length > MAX_PACK_CHARS && body.attempts.length) {
    body.attempts = body.attempts.slice(1);
    text = JSON.stringify(body);
  }
  return text;
}

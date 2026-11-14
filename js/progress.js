/** Cloud progress pack for app id `speakpass`. No audio, no passwords. */

export const PACK_VERSION = 1;
export const MAX_ATTEMPTS = 40;
export const MAX_PACK_CHARS = 45000;

export function emptyPack() {
  return { v: PACK_VERSION, items: {}, attempts: [], tests: {}, voice: 'mixed', markLog: [] };
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
        total,
        graded: ans.graded === true || total > 1
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
  let tests = {};
  if (data.tests && typeof data.tests === 'object' && !Array.isArray(data.tests)) {
    try {
      tests = JSON.parse(JSON.stringify(data.tests));
    } catch (err) {
      tests = {};
    }
  }
  const voice = typeof data.voice === 'string' && /^[a-z]{2}-[mf]$/.test(data.voice) ? data.voice : 'mixed';
  return { v: PACK_VERSION, items, attempts, tests, voice, markLog: readMarkLog(data.markLog) };
}

/**
 * The mark log keeps every AI mark with the question and the student's words,
 * so the marking can be reviewed weeks later. Newest entry is last.
 */
export const MAX_MARK_LOG = 40;

function text(value, cap) {
  const out = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return out.length > cap ? out.slice(0, cap) : out;
}

function readMarkLog(raw) {
  const list = Array.isArray(raw) ? raw.slice(-MAX_MARK_LOG) : [];
  const out = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = {
      at: text(entry.at, 24),
      date: text(entry.date, 10),
      test: text(entry.test, 24),
      mode: text(entry.mode, 12),
      tin: finiteNumber(entry.tin) || 0,
      tout: finiteNumber(entry.tout) || 0
    };
    if (entry.err) row.err = text(entry.err, 24);
    const qs = Array.isArray(entry.qs) ? entry.qs : [];
    row.qs = [];
    for (const item of qs) {
      const q = finiteNumber(item && item.q);
      if (!Number.isInteger(q)) continue;
      row.qs.push({
        q,
        type: text(item.type, 24),
        question: text(item.question, 240),
        tx: text(item.tx, 700),
        band: finiteNumber(item.band) || 0,
        max: finiteNumber(item.max) || 0,
        comment: text(item.comment, 200),
        tip: text(item.tip, 160),
        corrected: text(item.corrected, 400)
      });
    }
    if (!row.qs.length && !row.err) continue;
    out.push(row);
  }
  return out;
}

/** Appends one finished mark call to the pack log, dropping the oldest entries to fit. */
export function addMarkEntry(pack, entry) {
  const next = parsePack(JSON.stringify(parsePack(pack)));
  if (!entry || typeof entry !== 'object') return next;
  const log = readMarkLog([...(next.markLog || []), entry]);
  next.markLog = log.slice(-MAX_MARK_LOG);
  return next;
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
    answers.push({
      q: row.q,
      type: row.type,
      score: row.score,
      total: row.total,
      graded: graded.graded === true
    });
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

/**
 * Writes marking bands onto an attempt already stored in the pack.
 * Does not add another try. Keeps the better saved score on each item.
 */
export function applyMarkScores(pack, attemptId, rows) {
  const next = parsePack(JSON.stringify(parsePack(pack)));
  const id = String(attemptId || '');
  const attempt = next.attempts.find((item) => item.id === id);
  for (const row of rows || []) {
    const q = Number(row && row.q);
    const score = finiteNumber(row && row.score);
    const total = finiteNumber(row && row.total);
    if (!Number.isInteger(q) || score == null || total == null || total <= 0) continue;
    if (attempt) {
      const answer = attempt.answers.find((item) => item.q === q);
      if (answer) {
        answer.score = score;
        answer.total = total;
        answer.graded = true;
      }
    }
    const testId = String((row && row.testId) || (attempt && attempt.testId) || '');
    if (!testId) continue;
    const key = itemKey(testId, q);
    const prev = next.items[key];
    const prevRatio = prev ? ratio(prev.score, prev.total) : -1;
    const nextRatio = ratio(score, total);
    const keepPrev = !!prev && prev.graded === true && prevRatio >= nextRatio;
    next.items[key] = {
      score: keepPrev ? prev.score : score,
      total: keepPrev ? prev.total : total,
      graded: true,
      attempts: prev ? prev.attempts : 1,
      at: String((attempt && attempt.finishedAt) || (prev && prev.at) || ''),
      type: String((row && row.type) || (prev && prev.type) || '')
    };
  }
  return { pack: next };
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
  let json = JSON.stringify(body);
  while (json.length > MAX_PACK_CHARS && body.markLog.length > 1) {
    body.markLog = body.markLog.slice(1);
    json = JSON.stringify(body);
  }
  while (json.length > MAX_PACK_CHARS && body.attempts.length) {
    body.attempts = body.attempts.slice(1);
    json = JSON.stringify(body);
  }
  return json;
}

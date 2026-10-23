const READ_ALOUD = new Set([1, 2]);

export function maxFor(q) {
  const n = Number(q);
  if (READ_ALOUD.has(n)) return 6;
  if (n >= 3 && n <= 10) return 3;
  if (n === 11) return 5;
  return 0;
}

export function clampInt(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

export function percent(value, max) {
  if (!max) return 0;
  return Math.round((value / max) * 100);
}

const BLOCKED = /deep\s*seek/i;

export function cleanComment(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw || BLOCKED.test(raw)) return "";
  return raw.slice(0, 160);
}

export function cleanCorrected(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw || BLOCKED.test(raw)) return "";
  return raw.slice(0, 700);
}

export function blankQuestion(q) {
  const max = maxFor(q);
  const row = {
    q,
    scoreValue: 0,
    scoreMax: max,
    scorePct: 0,
    band: 0,
    corrected: "",
    comment: "",
    tip: ""
  };
  if (READ_ALOUD.has(q)) {
    row.pronunciation = 0;
    row.intonation = 0;
  }
  return row;
}

function fromModel(q, item) {
  const row = blankQuestion(q);
  if (READ_ALOUD.has(q)) {
    row.pronunciation = clampInt(item && item.pronunciation, 3);
    row.intonation = clampInt(item && item.intonation, 3);
    row.scoreValue = row.pronunciation + row.intonation;
  } else {
    row.scoreValue = clampInt(item && item.score, maxFor(q));
  }
  row.scorePct = percent(row.scoreValue, row.scoreMax);
  row.band = row.scoreValue;
  row.corrected = cleanCorrected(item && item.corrected);
  row.comment = cleanComment(item && item.comment);
  row.tip = cleanComment(item && item.tip);
  return row;
}

/**
 * pending: questions sent to the model.
 * skipped: questions with no transcript, already scored 0.
 */
export function applyModel(pending, skipped, modelJson) {
  const byQ = new Map();
  const list = modelJson && Array.isArray(modelJson.questions) ? modelJson.questions : [];
  for (const item of list) {
    const q = Number(item && item.q);
    if (byQ.has(q)) continue;
    byQ.set(q, item);
  }
  const rows = [];
  for (const q of pending) {
    rows.push(fromModel(q, byQ.get(q)));
  }
  for (const q of skipped) rows.push(blankQuestion(q));
  rows.sort((a, b) => a.q - b.q);
  const scoreValue = rows.reduce((sum, row) => sum + row.scoreValue, 0);
  const scoreMax = rows.reduce((sum, row) => sum + row.scoreMax, 0);
  return {
    questions: rows,
    scoreValue,
    scoreMax,
    scorePct: percent(scoreValue, scoreMax),
    complete: rows.length === 11 && rows.every((row, index) => row.q === index + 1)
  };
}

export function publicGrade(test, scored) {
  return {
    ok: true,
    testId: test.id,
    title: test.title || "",
    complete: scored.complete,
    raw: scored.scoreValue,
    rawMax: scored.scoreMax,
    scoreValue: scored.scoreValue,
    scoreMax: scored.scoreMax,
    scorePct: scored.scorePct,
    questions: scored.questions
  };
}

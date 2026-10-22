/** Estimated 0–200 score. This is practice, not an official result. */

export const PART_WEIGHTS = Object.freeze({
  read_aloud: 35,
  describe_picture: 35,
  respond_questions: 50,
  info_questions: 50,
  opinion: 30
});

export const PART_QUESTIONS = Object.freeze({
  read_aloud: [1, 2],
  describe_picture: [3, 4],
  respond_questions: [5, 6, 7],
  info_questions: [8, 9, 10],
  opinion: [11]
});

export const PART_ORDER = Object.freeze([
  'read_aloud',
  'describe_picture',
  'respond_questions',
  'info_questions',
  'opinion'
]);

export function levelFor(score) {
  const s = Number(score);
  if (s >= 200) return 'AH';
  if (s >= 180) return 'AM';
  if (s >= 160) return 'AL';
  if (s >= 140) return 'IH';
  if (s >= 130) return 'IM3';
  if (s >= 120) return 'IM2';
  if (s >= 110) return 'IM1';
  if (s >= 90) return 'IL';
  if (s >= 60) return 'NH';
  if (s >= 40) return 'NM';
  return 'NL';
}

export function levelCanDo(level) {
  return `levels.${level}`;
}

function rowMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const q = Number(row && row.q);
    if (!Number.isInteger(q)) continue;
    map.set(q, row);
  }
  return map;
}

function gradedRatio(row) {
  if (!row || row.graded !== true) return null;
  const total = Number(row.total);
  const score = Number(row.score);
  if (!(total > 0) || !Number.isFinite(score)) return null;
  return Math.max(0, Math.min(1, score / total));
}

/**
 * rows: { q, score, total, graded }.
 * The 0–200 figure is shown only when every part has a real grade.
 */
export function estimateFromRows(rows) {
  const byQ = rowMap(rows);
  const parts = {};
  let complete = true;
  let exactTotal = 0;
  for (const part of PART_ORDER) {
    const found = PART_QUESTIONS[part].map((q) => byQ.get(q));
    const ratios = found.map(gradedRatio);
    const known = ratios.filter((ratio) => ratio != null);
    if (known.length !== ratios.length) complete = false;
    if (!known.length) {
      parts[part] = { points: null, max: PART_WEIGHTS[part], ratio: null };
      continue;
    }
    const ratio = known.reduce((sum, value) => sum + value, 0) / known.length;
    const exact = ratio * PART_WEIGHTS[part];
    exactTotal += exact;
    parts[part] = {
      points: Math.round(exact),
      max: PART_WEIGHTS[part],
      ratio
    };
  }
  let weakest = null;
  for (const part of PART_ORDER) {
    const row = parts[part];
    if (!row || row.ratio == null) continue;
    if (!weakest || row.ratio < weakest.ratio) weakest = { part, ratio: row.ratio };
  }
  if (!complete) {
    return { complete: false, parts, score: null, level: null, weakest };
  }
  const score = Math.max(0, Math.min(200, Math.round(exactTotal / 10) * 10));
  return {
    complete: true,
    parts,
    score,
    level: levelFor(score),
    weakest,
    raw: exactTotal
  };
}

export function starsOf(rows, questions) {
  const byQ = rowMap(rows);
  const present = questions.map((q) => byQ.get(q)).filter((row) => row);
  if (!present.length) return null;
  const values = present.map(gradedRatio);
  if (values.some((value) => value == null)) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(avg * 5);
}

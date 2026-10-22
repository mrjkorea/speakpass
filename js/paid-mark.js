/**
 * Saves a paid grade with the shared sign-in client.
 * Scores go through MRJ_SCORES.post, which already calls noteScore.
 * Progress goes through loadPack then savePack. The sheet columns stay as they are.
 * A partial grade does not replace the saved full-test score.
 */

export const PROGRAM = "speakpass";
export const APP_LABEL = "SpeakPass AI";

function scoresApi(deps) {
  return (deps && deps.scores) || globalThis.MRJ_SCORES;
}

function authApi(deps) {
  return (deps && deps.auth) || globalThis.MRJ_AUTH;
}

function postScore(scores, fields) {
  return scores.post({
    program: PROGRAM,
    appName: APP_LABEL,
    source: PROGRAM,
    bookTitle: fields.bookTitle || "",
    unitTitle: fields.unitTitle || "",
    itemId: fields.itemId,
    itemType: fields.itemType,
    scoreValue: fields.scoreValue,
    scoreMax: fields.scoreMax,
    scorePct: fields.scorePct,
    metadata: fields.metadata || {}
  });
}

function readPack(json) {
  if (!json) return { v: 1, tests: {}, items: {}, attempts: [] };
  const parsed = JSON.parse(String(json));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("pack");
  }
  const tests = parsed.tests && typeof parsed.tests === "object" && !Array.isArray(parsed.tests)
    ? parsed.tests
    : {};
  const items = parsed.items && typeof parsed.items === "object" && !Array.isArray(parsed.items)
    ? parsed.items
    : {};
  const attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
  return { v: 1, tests: { ...tests }, items, attempts };
}

export async function savePaidResult(grade, deps) {
  const scores = scoresApi(deps);
  const auth = authApi(deps);
  if (!scores || !scores.post || !auth || !auth.loadPack || !auth.savePack) {
    return { ok: false, error: "no_signin" };
  }
  if (!grade || !grade.testId || !Array.isArray(grade.questions)) {
    return { ok: false, error: "bad_grade" };
  }

  const jobs = [];
  if (grade.complete) {
    jobs.push(postScore(scores, {
      bookTitle: grade.title,
      itemId: grade.testId,
      itemType: "full_test",
      scoreValue: grade.scoreValue,
      scoreMax: grade.scoreMax,
      scorePct: grade.scorePct,
      metadata: { complete: true }
    }));
  }
  for (const row of grade.questions) {
    jobs.push(postScore(scores, {
      bookTitle: grade.title,
      unitTitle: grade.testId,
      itemId: `${grade.testId}:q${row.q}`,
      itemType: "question",
      scoreValue: row.scoreValue,
      scoreMax: row.scoreMax,
      scorePct: row.scorePct,
      metadata: { comment: row.comment || "" }
    }));
  }
  await Promise.all(jobs);

  const loaded = await auth.loadPack(PROGRAM);
  if (!loaded || !loaded.ok) {
    return { ok: false, error: (loaded && loaded.error) || "pack_load_failed", scoresSent: true };
  }
  let pack;
  try {
    pack = readPack(loaded.found ? loaded.progress_json : "");
  } catch {
    return { ok: false, error: "pack_unreadable", scoresSent: true };
  }
  const prev = pack.tests[grade.testId] && typeof pack.tests[grade.testId] === "object"
    ? pack.tests[grade.testId]
    : {};
  const at = scores.localDate ? scores.localDate() : "";
  const questions = { ...(prev.questions || {}) };
  for (const row of grade.questions) {
    questions[String(row.q)] = {
      raw: row.scoreValue,
      rawMax: row.scoreMax,
      pct: row.scorePct,
      at
    };
  }
  const next = {
    questions,
    full: prev.full || null
  };
  if (grade.complete) {
    next.full = {
      raw: grade.scoreValue,
      rawMax: grade.scoreMax,
      pct: grade.scorePct,
      at
    };
  }
  pack.tests[grade.testId] = next;
  const saved = await auth.savePack(PROGRAM, JSON.stringify(pack));
  if (!saved || !saved.ok) {
    return { ok: false, error: (saved && saved.error) || "save_failed", scoresSent: true };
  }
  return { ok: true };
}

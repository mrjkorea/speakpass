import { GRADE_WORKER_URL } from "./config.js";
import { savePaidResult } from "./paid-mark.js";

export function workerUrl(configured) {
  const value = configured == null ? GRADE_WORKER_URL : configured;
  return String(value || "").trim();
}

function answersToSend(attempt) {
  const list = attempt && Array.isArray(attempt.answers) ? attempt.answers : [];
  const out = [];
  for (const ans of list) {
    const q = Number(ans && ans.q);
    if (!Number.isInteger(q) || q < 1 || q > 11) continue;
    const transcript = String(ans && ans.transcript || "").trim();
    if (!transcript) continue;
    out.push({ q, transcript });
  }
  return out;
}

/**
 * Asks the Worker to mark questions 1 through 11, then saves with the shared score client.
 * An empty URL means the Worker is not deployed. No request is sent.
 */
export async function requestAiMark(attempt, deps) {
  const url = workerUrl(deps && deps.url);
  if (!url) return { ok: false, error: "not_deployed" };
  const auth = (deps && deps.auth) || globalThis.MRJ_AUTH;
  const id = auth && auth.student ? String(auth.student() || "").trim() : "";
  const token = auth && auth.token ? String(auth.token() || "").trim() : "";
  if (!id || !token) return { ok: false, error: "sign_in" };
  const answers = answersToSend(attempt);
  if (!answers.length) return { ok: false, error: "no_transcript" };
  const fetchImpl = (deps && deps.fetch) || fetch;
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testId: attempt.testId,
        studentId: id,
        token,
        answers
      })
    });
  } catch {
    return { ok: false, error: "not_deployed" };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || !data.ok) {
    const code = data && data.error ? String(data.error) : "";
    if (res.status === 404 || res.status === 503 || code === "not_ready") {
      return { ok: false, error: "not_deployed" };
    }
    if (code === "sign_in" || res.status === 401) return { ok: false, error: "sign_in" };
    if (code === "student_cap" || code === "slow_down" || code === "daily_cap") {
      return { ok: false, error: code };
    }
    return { ok: false, error: "grade_failed" };
  }
  const saved = await savePaidResult(data, deps);
  return {
    ok: true,
    grade: data,
    saved: !!(saved && saved.ok),
    saveError: saved && saved.ok ? "" : ((saved && saved.error) || "save_failed")
  };
}

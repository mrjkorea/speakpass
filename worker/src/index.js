import { getTest } from "./catalog.js";
import { gradeTranscripts } from "./model.js";
import { clearTokenCache, verifyPurchase } from "./play.js";
import { buildMessages, normalizeAnswers } from "./prompt.js";
import { applyModel, publicGrade } from "./score.js";

const BODY_CAP = 100000;

function json(status, payload, origin, allowOrigin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(payload), { status, headers });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return { ok: true, origin: "", allow: false };
  const list = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!list.includes(origin)) return { ok: false, origin, allow: false };
  return { ok: true, origin, allow: true };
}

export async function handle(request, env, deps) {
  const fetchImpl = (deps && deps.fetch) || fetch;
  const nowSeconds = (deps && deps.now) || Math.floor(Date.now() / 1000);
  const gate = allowedOrigin(request, env || {});
  if (!gate.ok) return json(403, { ok: false, error: "origin" }, gate.origin, false);
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": gate.origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin"
      }
    });
  }
  if (request.method === "GET") {
    return json(200, { ok: true, service: "speakpass-grade" }, gate.origin, gate.allow);
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method" }, gate.origin, gate.allow);
  }
  if (!env || !env.GRADE_API_KEY || !env.PLAY_SERVICE_ACCOUNT || !env.PACKAGE_NAME) {
    return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > BODY_CAP) {
      return json(400, { ok: false, error: "bad_request" }, gate.origin, gate.allow);
    }
    body = JSON.parse(text);
  } catch {
    return json(400, { ok: false, error: "bad_request" }, gate.origin, gate.allow);
  }

  const test = getTest(body && body.testId);
  const answers = normalizeAnswers(body && body.answers);
  if (!test || !answers.length) {
    return json(400, { ok: false, error: "bad_request" }, gate.origin, gate.allow);
  }

  let owned;
  try {
    owned = await verifyPurchase(env, body, fetchImpl, nowSeconds);
  } catch {
    return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
  }
  if (!owned.ok) {
    return json(403, { ok: false, error: "not_owned" }, gate.origin, gate.allow);
  }

  const built = buildMessages(test, answers);
  let modelJson = { questions: [] };
  if (built.pending.length) {
    try {
      const graded = await gradeTranscripts(env, built.messages, fetchImpl);
      modelJson = graded.parsed;
    } catch {
      return json(502, { ok: false, error: "grade_failed" }, gate.origin, gate.allow);
    }
  }
  const scored = applyModel(built.pending, built.skipped, modelJson);
  return json(200, publicGrade(test, scored), gate.origin, gate.allow);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  }
};

export { clearTokenCache };

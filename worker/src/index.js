import { getTest } from "./catalog.js";
import { reserveGrade } from "./limits.js";
import { gradeTranscripts } from "./model.js";
import { paymentMode } from "./mode.js";
import { clearTokenCache, idKey, verifyPurchase } from "./play.js";
import { buildMessages, normalizeAnswers } from "./prompt.js";
import { applyModel, publicGrade } from "./score.js";
import { verifySession } from "./session.js";

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

function limitStore(env, deps) {
  if (deps && deps.kv) return deps.kv;
  return env && env.GRADE_LIMITS ? env.GRADE_LIMITS : null;
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

  const mode = paymentMode(env);
  const kv = limitStore(env, deps);
  if (!env || !env.GRADE_API_KEY || !kv) {
    return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
  }
  if (mode === "play" && (!env.PLAY_SERVICE_ACCOUNT || !env.PACKAGE_NAME)) {
    return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
  }
  if (mode === "free" && !env.SIGNIN_ENDPOINT) {
    return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
  }

  const path = new URL(request.url).pathname.replace(/\/+$/, "");

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

  let studentId = "";
  if (mode === "play") {
    let owned;
    try {
      owned = await verifyPurchase(env, body, fetchImpl, nowSeconds);
    } catch {
      return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
    }
    if (!owned.ok) {
      return json(403, { ok: false, error: "not_owned" }, gate.origin, gate.allow);
    }
    studentId = idKey(body.studentId) || idKey(body.purchaseToken).slice(0, 40);
  } else {
    let session;
    try {
      session = await verifySession(env, body, fetchImpl);
    } catch {
      return json(503, { ok: false, error: "not_ready" }, gate.origin, gate.allow);
    }
    if (!session.ok) {
      return json(401, { ok: false, error: "sign_in" }, gate.origin, gate.allow);
    }
    studentId = session.studentId;
  }

  const slot = await reserveGrade(kv, studentId, nowSeconds);
  if (!slot.ok) {
    const status = slot.error === "not_ready" ? 503 : 429;
    return json(status, { ok: false, error: slot.error }, gate.origin, gate.allow);
  }

  const built = buildMessages(test, answers, body && body.lang);
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

import { idKey } from "./play.js";
import { dayStamp } from "./limits.js";
import { verifySession } from "./session.js";

/**
 * Speech-to-text for devices whose browser has no working speech recognition
 * (many phones, in-app browsers, Firefox, or when the recorder holds the mic).
 * Signed-in students only. Audio is sent to Workers AI Whisper and is not stored.
 */
export const TRANSCRIBE_CAPS = { studentPerDay: 80, dailyTotal: 4000 };
export const AUDIO_B64_CAP = 3500000;
const MODEL = "@cf/openai/whisper-large-v3-turbo";
const SESSION_TTL = 1800;

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Remembers a good sign-in for 30 minutes so nine clips do not hit the sign-in script nine times. */
export async function cachedSession(env, kv, body, fetchImpl) {
  const id = String(body && body.studentId || "").trim();
  const token = String(body && body.token || "").trim();
  if (!id || !token) return { ok: false, error: "sign_in" };
  const key = `sess:${await sha(idKey(id) + "|" + token)}`;
  try {
    const hit = await kv.get(key);
    if (hit) return { ok: true, studentId: hit };
  } catch { /* fall through to a live check */ }
  const session = await verifySession(env, body, fetchImpl);
  if (session.ok) {
    try { await kv.put(key, session.studentId, { expirationTtl: SESSION_TTL }); } catch { /* fine */ }
  }
  return session;
}

export async function reserveTranscribe(kv, studentId, nowSeconds) {
  const who = idKey(studentId);
  if (!who) return { ok: false, error: "sign_in" };
  const key = `stt:${dayStamp(nowSeconds)}`;
  let book = { total: 0, students: {} };
  try {
    const raw = await kv.get(key);
    if (raw) book = JSON.parse(raw);
  } catch { /* start fresh */ }
  if (!book.students || typeof book.students !== "object") book.students = {};
  const count = Number(book.students[who]) || 0;
  if (count >= TRANSCRIBE_CAPS.studentPerDay) return { ok: false, error: "student_cap" };
  if ((Number(book.total) || 0) >= TRANSCRIBE_CAPS.dailyTotal) return { ok: false, error: "daily_cap" };
  book.students[who] = count + 1;
  book.total = (Number(book.total) || 0) + 1;
  try { await kv.put(key, JSON.stringify(book), { expirationTtl: 172800 }); } catch { return { ok: false, error: "not_ready" }; }
  return { ok: true };
}

export async function runWhisper(env, audioB64) {
  const out = await env.AI.run(MODEL, { audio: audioB64, language: "en", task: "transcribe", vad_filter: true });
  return String((out && out.text) || "").replace(/\s+/g, " ").trim();
}

import { idKey } from "./play.js";

/** Caps for one UTC day. Chosen so a class can mark a test and retry, and a leaked key cannot run all day. */
export const CAPS = {
  studentPerDay: 3,
  minGapSeconds: 60,
  dailyTotal: 120
};

export function dayStamp(nowSeconds) {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 10);
}

export function memoryKv() {
  const map = new Map();
  return {
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async put(key, value) {
      map.set(key, String(value));
    }
  };
}

function emptyBook() {
  return { total: 0, students: {} };
}

function readBook(raw) {
  if (!raw) return emptyBook();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyBook();
    const students = parsed.students && typeof parsed.students === "object" ? parsed.students : {};
    return { total: Number(parsed.total) || 0, students };
  } catch {
    return emptyBook();
  }
}

/**
 * Counts this grade before the model is called.
 * A full store is required. If the store is missing, the caller must not grade.
 */
export async function reserveGrade(kv, studentId, nowSeconds) {
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return { ok: false, error: "not_ready" };
  }
  const who = idKey(studentId);
  if (!who) return { ok: false, error: "sign_in" };
  const key = `grades:${dayStamp(nowSeconds)}`;
  let raw = null;
  try {
    raw = await kv.get(key);
  } catch {
    return { ok: false, error: "not_ready" };
  }
  const book = readBook(raw);
  const row = book.students[who] && typeof book.students[who] === "object"
    ? book.students[who]
    : { count: 0, last: 0 };
  const count = Number(row.count) || 0;
  const last = Number(row.last) || 0;
  if (count >= CAPS.studentPerDay) return { ok: false, error: "student_cap" };
  if (last && nowSeconds - last < CAPS.minGapSeconds) return { ok: false, error: "slow_down" };
  if (book.total >= CAPS.dailyTotal) return { ok: false, error: "daily_cap" };
  book.students[who] = { count: count + 1, last: nowSeconds };
  book.total += 1;
  try {
    await kv.put(key, JSON.stringify(book));
  } catch {
    return { ok: false, error: "not_ready" };
  }
  return { ok: true };
}

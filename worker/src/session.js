import { idKey } from "./play.js";

/**
 * Checks a student session with the shared sign-in script.
 * Uses the existing progress action, which already requires id and token.
 * No new sheet and no new column.
 */
export async function verifySession(env, body, fetchImpl) {
  const id = String(body && body.studentId || "").trim();
  const token = String(body && body.token || "").trim();
  const endpoint = String(env && env.SIGNIN_ENDPOINT || "").trim();
  if (!id || !token || !endpoint) return { ok: false, error: "sign_in" };
  const res = await fetchImpl(endpoint, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "progress",
      id,
      token,
      program: "speakpass",
      offset: 0,
      limit: 1
    })
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data || !data.ok) {
    if (!res.ok) throw new Error("signin");
    return { ok: false, error: "sign_in" };
  }
  const returned = String(data.id || id);
  if (idKey(returned) !== idKey(id)) return { ok: false, error: "sign_in" };
  return { ok: true, studentId: returned };
}

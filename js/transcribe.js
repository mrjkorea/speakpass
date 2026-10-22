// Server speech-to-text fallback. Many phones and in-app browsers have no working
// on-device speech recognition (or it cannot share the microphone with the recorder),
// which left questions 3-11 with no transcript, so nothing could be scored or marked.
// Signed-in students only. The worker sends the audio to Whisper and keeps nothing.
import { GRADE_WORKER_URL } from './config.js';

const RATE = 16000;

async function toWavBase64(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const ctx = new Ctx();
  let decoded;
  try {
    decoded = await new Promise((resolve, reject) => {
      const p = ctx.decodeAudioData(buf.slice(0), resolve, reject);
      if (p && p.then) p.then(resolve, reject);
    });
  } finally {
    try { ctx.close(); } catch (err) { /* ignore */ }
  }
  const frames = Math.ceil(decoded.duration * RATE);
  const off = new OfflineAudioContext(1, Math.max(1, frames), RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(44 + out.length * 2);
  const v = new DataView(bytes.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + out.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i += 1) {
    const s = Math.max(-1, Math.min(1, out[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Fills ans.transcript from the server when the device heard nothing. Never throws. */
export async function fillTranscript(ans, deps) {
  if (!ans || Number(ans.q) < 3) return false;
  if (String(ans.transcript || '').trim()) return false;
  if (!ans.blob || !ans.blob.size) return false;
  if (ans.serverTranscriptTried) return false;
  const auth = (deps && deps.auth) || globalThis.MRJ_AUTH;
  const id = auth && auth.student ? String(auth.student() || '').trim() : '';
  const token = auth && auth.token ? String(auth.token() || '').trim() : '';
  if (!id || !token || !GRADE_WORKER_URL) return false;
  ans.serverTranscriptTried = true;
  try {
    const audio = await toWavBase64(ans.blob);
    const res = await fetch(`${GRADE_WORKER_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: id, token, audio })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      console.warn('transcribe failed', res.status, data && data.error);
      if (res.status >= 500) ans.serverTranscriptTried = false;
      return false;
    }
    const text = String(data.text || '').trim();
    if (text) ans.transcript = text;
    return !!text;
  } catch (err) {
    console.warn('transcribe error', err);
    ans.serverTranscriptTried = false;
    return false;
  }
}

/** Two at a time keeps phones responsive. */
export async function fillTranscripts(answers, deps) {
  const list = (answers || []).filter((a) => a && Number(a.q) >= 3);
  let i = 0;
  const lane = async () => { while (i < list.length) { const a = list[i]; i += 1; await fillTranscript(a, deps); } };
  await Promise.all([lane(), lane()]);
}

// Speech-to-text for questions 3-11: Whistle, on the student's device only.
// No cloud speech service and no browser SpeechRecognition. The audio never leaves the device.
const RATE = 16000;
let worker = null;
let seq = 0;
const waiting = new Map();
let loadedInfo = null;
let lastStats = null;

function statusEl() {
  if (typeof document === 'undefined') return null;
  let el = document.getElementById('stt-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stt-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999;background:#1f2937;color:#fff;padding:10px 16px;border-radius:10px;font:14px/1.3 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);display:none;max-width:90vw;text-align:center';
    document.body.appendChild(el);
  }
  return el;
}
function showStatus(text) {
  const el = statusEl();
  if (!el) return;
  el.textContent = text || '';
  el.style.display = text ? 'block' : 'none';
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./whistle-worker.js', import.meta.url));
  worker.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.type === 'progress') {
      const pct = Math.round((msg.loaded / msg.total) * 100);
      if (!loadedInfo) showStatus(`Downloading speech model… ${pct}% (${(msg.loaded / 1e6).toFixed(1)} / ${(msg.total / 1e6).toFixed(1)} MB)`);
    } else if (msg.type === 'loaded') {
      loadedInfo = msg.info;
    } else if (msg.id && waiting.has(msg.id)) {
      waiting.get(msg.id)(msg);
      waiting.delete(msg.id);
    } else if (msg.type === 'error') {
      console.warn('whistle', msg.error);
    }
  };
  worker.onerror = (e) => {
    console.warn('whistle worker error', e && e.message);
    for (const done of waiting.values()) done({ type: 'error', error: 'worker' });
    waiting.clear();
    worker = null;
  };
  return worker;
}

/** Start the one-time model download early (cheap when it is already on the device). */
export function preloadWhistle() {
  try { getWorker().postMessage({ type: 'load' }); } catch (err) { /* no workers */ }
}

async function toPcm16k(blob) {
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
  const frames = Math.max(1, Math.ceil(decoded.duration * RATE));
  const off = new OfflineAudioContext(1, frames, RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  return new Float32Array((await off.startRendering()).getChannelData(0));
}

function ask(pcm) {
  return new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, resolve);
    getWorker().postMessage({ type: 'transcribe', id, pcm: pcm.buffer }, [pcm.buffer]);
  });
}

/** Timing of the last transcription, for testing. */
export function whistleStats() { return { model: loadedInfo, last: lastStats }; }

/** Fills ans.transcript on the device. Never throws. */
export async function fillTranscript(ans) {
  if (!ans || Number(ans.q) < 3) return false;
  if (String(ans.transcript || '').trim()) return false;
  if (!ans.blob || !ans.blob.size) return false;
  if (ans.sttTried) return false;
  ans.sttTried = true;
  try {
    preloadWhistle();
    const pcm = await toPcm16k(ans.blob);
    if (loadedInfo) showStatus('Writing out your answer…');
    const samples = pcm.length;
    const keep = pcm.slice();
    const res = await ask(pcm);
    if (!res || res.type !== 'result') {
      console.warn('whistle failed', res && res.error);
      ans.sttTried = false;
      return false;
    }
    lastStats = { q: ans.q, ms: res.ms, parts: res.parts, seconds: Math.round(samples / RATE) };
    const text = String(res.text || '').trim();
    if (text) ans.transcript = text;
    // Whistle's own parts (cut at pauses, max 28 s) for the small pronunciation check.
    const parts = (res.ranges || []).filter((r) => r && r.text).map((r) => ({ pcm: keep.subarray(r.s, r.e), text: r.text }));
    Object.defineProperty(ans, 'sttParts', { value: parts, enumerable: false, configurable: true, writable: true });
    return !!text;
  } catch (err) {
    console.warn('whistle error', err);
    ans.sttTried = false;
    return false;
  } finally {
    if (!waiting.size) showStatus('');
  }
}

/** One at a time: the engine holds one model and is not thread-safe. */
export async function fillTranscripts(answers) {
  for (const a of (answers || [])) {
    if (a && Number(a.q) >= 3) await fillTranscript(a);
  }
}
if (typeof window !== 'undefined') window.__whistleStats = whistleStats;

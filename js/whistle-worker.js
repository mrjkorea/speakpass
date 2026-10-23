// Whistle (Cactus Compute, Apache-2.0) speech-to-text, run entirely on the student's device.
// Classic Web Worker so the page never freezes. The 16.9 MB model is downloaded once, in
// parts, and kept in Cache Storage; later visits load it from the device.
/* global createNeedle */
const BASE = new URL('../vendor/whistle/', self.location.href).href;
const PARTS = 5;
const MODEL_BYTES = 16919407;
const CACHE = 'whistle-model-v1';
const RATE = 16000;
const MAX_SEC = 28; // Whistle takes 30 s per pass; leave room
const OUT_CAP = 1 << 17;

let ready = null;
let M = null;

async function fetchPart(cache, url, onBytes) {
  let res = cache ? await cache.match(url) : null;
  const fromCache = !!res;
  if (!res) {
    res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`model download ${res.status}`);
    const buf = await res.arrayBuffer();
    if (cache) { try { await cache.put(url, new Response(buf)); } catch (e) { /* storage full: keep going */ } }
    onBytes(buf.byteLength);
    return { buf: new Uint8Array(buf), fromCache };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  onBytes(buf.byteLength);
  return { buf, fromCache };
}

async function load() {
  const t0 = performance.now();
  importScripts(`${BASE}needle.js`);
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { cache = null; }
  const wasm = await fetchPart(cache, `${BASE}needle.wasm`, () => {});
  M = await createNeedle({ wasmBinary: wasm.buf, locateFile: (p) => BASE + p });
  const all = new Uint8Array(MODEL_BYTES);
  let got = 0;
  let cached = true;
  const tick = (n) => { got += n; self.postMessage({ type: 'progress', loaded: got, total: MODEL_BYTES }); };
  for (let i = 0; i < PARTS; i += 1) {
    const part = await fetchPart(cache, `${BASE}whistle.cact.part${i}`, () => {});
    all.set(part.buf, got);
    tick(part.buf.byteLength);
    if (!part.fromCache) cached = false;
  }
  if (got !== MODEL_BYTES) throw new Error('model size mismatch');
  const t1 = performance.now();
  const p = M._malloc(MODEL_BYTES);
  M.HEAPU8.set(all, p);
  const rc = M._needle_load(p, BigInt(MODEL_BYTES));
  M._free(p);
  if (rc < 0) throw new Error(`needle_load ${rc}: ${M.UTF8ToString(M._needle_last_error())}`);
  const info = { downloadMs: Math.round(t1 - t0), initMs: Math.round(performance.now() - t1), fromCache: cached, bytes: MODEL_BYTES };
  self.postMessage({ type: 'loaded', info });
  return info;
}

function runPass(pcm) {
  const bytes = pcm.length * 4;
  const pp = M._malloc(bytes);
  const out = M._malloc(OUT_CAP);
  const lang = M._malloc(4);
  try {
    M.HEAPU8.set(new Uint8Array(pcm.buffer, pcm.byteOffset, bytes), pp);
    M.HEAPU8.set([101, 110, 0], lang); // "en"
    const rc = M._needle_transcribe(pp, pcm.length, lang, 0, 0, out, OUT_CAP);
    if (rc < 0) throw new Error(M.UTF8ToString(M._needle_last_error()));
    const json = JSON.parse(M.UTF8ToString(out) || '{}');
    return String(json.text || '').trim();
  } finally { M._free(pp); M._free(out); M._free(lang); }
}

/** Cut long answers at the quietest short stretch before 28 s, so no word is split. */

function cut(pcm) {
  const max = MAX_SEC * RATE;
  if (pcm.length <= max) return [pcm];
  const pieces = [];
  const frame = RATE / 50; // 20 ms
  let start = 0;
  while (pcm.length - start > max) {
    const lo = start + 18 * RATE;
    const hi = start + max;
    let best = hi;
    let bestE = Infinity;
    const win = 10; // 200 ms of frames
    for (let at = lo; at + win * frame <= hi; at += frame) {
      let e = 0;
      for (let i = at; i < at + win * frame; i += 4) e += pcm[i] * pcm[i];
      if (e < bestE) { bestE = e; best = at + (win * frame) / 2; }
    }
    pieces.push(pcm.subarray(start, best));
    start = best;
  }
  pieces.push(pcm.subarray(start));
  return pieces;
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (!ready) ready = load();
    const info = await ready;
    if (msg.type === 'load') return;
    if (msg.type === 'transcribe') {
      const t0 = performance.now();
      const pcm = new Float32Array(msg.pcm);
      const pieces = cut(pcm).map((sub) => ({ s: sub.byteOffset / 4, e: sub.byteOffset / 4 + sub.length, text: runPass(sub) }));
      const texts = pieces.map((x) => x.text).filter(Boolean);
      self.postMessage({ type: 'result', id: msg.id, text: texts.join(' ').replace(/\s+/g, ' ').trim(), parts: texts.length, ranges: pieces, ms: Math.round(performance.now() - t0), info });
    }
  } catch (err) {
    if (msg.type !== 'transcribe') ready = null;
    self.postMessage({ type: 'error', id: msg.id, error: String(err && err.message || err) });
  }
};

// Questions 1 and 2 use the shared pronunciation checker on the pronounce site.
// That loader downloads and caches one model for every MRJ app in this browser.
import { packGrade } from './pack.js';
import { PASS_AT } from './stars.js';
import { MODEL_FILE, SHARED_URL } from './model-ref.js';

export { PASS_AT };

const APP_ID = 'toeic';
// The shared checker keeps only 6.5 s of audio by default (built for one sentence).
// A TOEIC read-aloud is a whole 45 s passage, so the cut audio never matched the text and every
// answer came back 0/5 "Say it again". Keep the full answer.
const READ_MAX_MS = 60000;

let enginePromise = null;
let gradeChain = Promise.resolve();

function blank(status, save) {
  return {
    status,
    save,
    stars: 0,
    words: [],
    scorePct: 0,
    pass: false,
    scoreMs: 0,
    loadMs: 0,
    fromCache: false,
    modelBytes: 0,
    modelFile: MODEL_FILE
  };
}

export function warmChecker() {
  return ensureEngine().catch(() => null);
}

export function gradeReadAloud(text, blob) {
  const job = gradeChain.then(() => scoreOne(text, blob));
  gradeChain = job.then(() => {}, () => {});
  return job;
}

function ensureEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const t0 = performance.now();
      const api = await import(SHARED_URL);
      const boot = await api.bootShared();
      return {
        api,
        meta: {
          loadMs: performance.now() - t0,
          fromCache: !!(boot && boot.fromCache),
          modelBytes: Number(boot && boot.cachedBytes) || 0,
          modelFile: MODEL_FILE
        }
      };
    })().catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

async function scoreOne(text, blob) {
  if (!blob || !blob.size) return blank('empty', 'coming soon');
  const target = String(text || '').trim();
  if (!target) return blank('failed', 'coming soon');
  try {
    const { api, meta } = await ensureEngine();
    const t0 = performance.now();
    const graded = await api.grade(blob, target, APP_ID, { maxMs: READ_MAX_MS });
    const perf = graded && graded.perf ? graded.perf : {};
    const scoreMs = Number(perf.totalMs) || (performance.now() - t0);
    return packGrade(graded, scoreMs, meta);
  } catch (err) {
    console.error(err);
    return blank('failed', 'coming soon');
  }
}

/**
 * Small pronunciation check for Q3-Q11 (spoken answers, no fixed text).
 * Reference text = the Whistle transcript of each Whistle part (<= 28 s, cut at pauses),
 * so audio and text line up. Returns { pct, band, ms, parts } or null (neutral, no penalty).
 * A "door" / acoustic fail is never shown as "Say it again" here: that part is skipped.
 */
export const SPOKEN_MIN_WORDS = 5;
const SPOKEN_MAX_SAMPLES = 16000 * 32;
export function gradeSpoken(parts) {
  const job = gradeChain.then(() => scoreSpoken(parts));
  gradeChain = job.then(() => {}, () => {});
  return job;
}

async function scoreSpoken(parts) {
  const usable = (parts || []).filter((p) => p && p.pcm && p.pcm.length
    && String(p.text || '').trim().split(/\s+/).filter(Boolean).length >= SPOKEN_MIN_WORDS);
  if (!usable.length) return null;
  // Keep added time low: check at most ~32 s of speech (1-2 Whistle parts), a sample of the answer.
  let budget = SPOKEN_MAX_SAMPLES;
  const picked = [];
  for (const part of usable) {
    if (picked.length && budget - part.pcm.length < 0) break;
    picked.push(part);
    budget -= part.pcm.length;
  }
  usable.length = 0;
  usable.push(...picked);
  const t0 = performance.now();
  try {
    const { api } = await ensureEngine();
    let sum = 0;
    let weight = 0;
    for (const part of usable) {
      try {
        const graded = await api.grade(part.pcm, part.text, APP_ID, { maxMs: 30000 });
        const result = graded && graded.result ? graded.result : {};
        if (needsSkip(graded, result)) continue;
        const pct = Number(result.scorePct);
        if (!Number.isFinite(pct)) continue;
        const w = part.text.trim().split(/\s+/).length;
        sum += pct * w;
        weight += w;
      } catch (err) {
        console.warn('spoken pron part failed', err);
      }
    }
    if (!weight) return null;
    const pct = Math.round(sum / weight);
    return { pct, band: pct >= 75 ? 'green' : (pct >= 50 ? 'yellow' : 'red'), ms: Math.round(performance.now() - t0), parts: usable.length };
  } catch (err) {
    console.warn('spoken pron failed', err);
    return null;
  }
}

function needsSkip(graded, result) {
  if (result.doorFail || result.acousticFail) return true;
  return !!(graded && graded.door && graded.door.ok === false);
}

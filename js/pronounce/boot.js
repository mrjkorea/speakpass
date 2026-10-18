// TOEIC Read-Aloud (Q1-2): shared MRJ HuBERT phoneme checker from the pronounce site.
// https://mrjkorea.github.io/pronounce/src/shared.js loads models/hubert/manifest.json; the model is cached once per browser.
import { decodeAudioToMono, trimSilence } from './audio.js';
import { packGrade } from './pack.js';
import { PASS_AT } from './stars.js';
import { SHARED_URL } from './model-ref.js';

export { PASS_AT };

let enginePromise = null;
let gradeChain = Promise.resolve();

function blank(status, save) {
  return { status, save, stars: 0, words: [], scorePct: 0, scoreMs: 0, loadMs: 0, fromCache: false, modelBytes: 0, modelFile: 'hubert', overlap: 0 };
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
      return { api, meta: { loadMs: performance.now() - t0, fromCache: !!(boot && boot.fromCache), modelBytes: (boot && boot.cachedBytes) || 0, modelFile: 'hubert' } };
    })().catch((err) => { enginePromise = null; throw err; });
  }
  return enginePromise;
}

async function scoreOne(text, blob) {
  if (!blob || !blob.size) return blank('empty', 'coming soon');
  const target = String(text || '').trim();
  if (!target) return blank('failed', 'coming soon');
  try {
    const { api, meta } = await ensureEngine();
    const decoded = await decodeAudioToMono(blob, 16000);
    const samples = new Float32Array(trimSilence(decoded, 16000));
    const graded = await api.gradeTrialSamples(samples, target, PASS_AT, null, { appId: 'toeic' });
    const scoreMs = graded.perf && graded.perf.hubertMs ? graded.perf.hubertMs : 0;
    return packGrade(graded, scoreMs, meta);
  } catch (err) {
    console.error(err);
    return blank('failed', 'coming soon');
  }
}

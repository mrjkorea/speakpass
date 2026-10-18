// Questions 1 and 2 use the shared pronunciation checker on the pronounce site.
// That loader downloads and caches one model for every MRJ app in this browser.
import { packGrade } from './pack.js';
import { PASS_AT } from './stars.js';
import { MODEL_FILE, SHARED_URL } from './model-ref.js';

export { PASS_AT };

const APP_ID = 'toeic';

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
    const graded = await api.grade(blob, target, APP_ID);
    const perf = graded && graded.perf ? graded.perf : {};
    const scoreMs = Number(perf.totalMs) || (performance.now() - t0);
    return packGrade(graded, scoreMs, meta);
  } catch (err) {
    console.error(err);
    return blank('failed', 'coming soon');
  }
}

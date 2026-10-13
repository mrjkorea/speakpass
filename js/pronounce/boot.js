import { decodeAudioToMono, trimSilence } from './audio.js';
import { loadCheckerAssets } from './assets.js';
import { packGrade } from './pack.js';
import { bootSession } from './session.js';
import { PASS_AT } from './stars.js';

export { PASS_AT };

let enginePromise = null;
let gradeChain = Promise.resolve();
let seq = 0;

function blank(status, save) {
  return {
    status,
    save,
    stars: 0,
    words: [],
    scorePct: 0,
    scoreMs: 0,
    loadMs: 0,
    fromCache: false,
    modelBytes: 0,
    modelFile: 'model.int8.onnx',
    overlap: 0
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

async function scoreOne(text, blob) {
  if (!blob || !blob.size) return blank('empty', 'coming soon');
  const target = String(text || '').trim();
  if (!target) return blank('failed', 'coming soon');
  try {
    const engine = await ensureEngine();
    const decoded = await decodeAudioToMono(blob, 16000);
    const samples = new Float32Array(trimSilence(decoded, 16000));
    try {
      return await engine.grade(samples, target);
    } catch (err) {
      console.error(err);
      if (engine.isMain) return blank('failed', 'coming soon');
      if (engine.worker) {
        try { engine.worker.terminate(); } catch (stopErr) { /* already gone */ }
      }
      const main = await bootMain();
      enginePromise = Promise.resolve(main);
      return await main.grade(samples, target);
    }
  } catch (err) {
    console.error(err);
    return blank('failed', 'coming soon');
  }
}

function ensureEngine() {
  if (!enginePromise) {
    enginePromise = bootWorker().catch((err) => {
      console.error(err);
      return bootMain();
    }).catch((err) => {
      enginePromise = null;
      throw err;
    });
  }
  return enginePromise;
}

function bootWorker() {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL('./grade-worker.js', import.meta.url));
    } catch (err) {
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      try { worker.terminate(); } catch (err) { /* already gone */ }
      reject(new Error('load-timeout'));
    }, 180000);
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    const onError = () => {
      cleanup();
      try { worker.terminate(); } catch (err) { /* already gone */ }
      reject(new Error('worker-failed'));
    };
    const onMessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'init-error') {
        cleanup();
        try { worker.terminate(); } catch (err) { /* already gone */ }
        reject(new Error(msg.message || 'worker-failed'));
        return;
      }
      if (msg.type !== 'ready') return;
      cleanup();
      resolve({
        isMain: false,
        worker,
        grade(samples, text) {
          return gradeOnWorker(worker, samples, text);
        }
      });
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'init' });
  });
}

function gradeOnWorker(worker, samples, text) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('grade-timeout'));
    }, 90000);
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
    };
    const onMessage = (event) => {
      const msg = event.data || {};
      if (msg.id !== id) return;
      cleanup();
      if (msg.type === 'graded' && msg.payload) resolve(msg.payload);
      else reject(new Error('grade-failed'));
    };
    worker.addEventListener('message', onMessage);
    try {
      const copy = new Float32Array(samples);
      worker.postMessage({ type: 'grade', id, text, samples: copy }, [copy.buffer]);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

async function bootMain() {
  const t0 = performance.now();
  const assets = await loadCheckerAssets();
  const ort = await loadOrtOnMain(assets.ortJsText);
  await bootSession(ort, assets.modelBuf, assets.piecesText, assets.mjsBuf, assets.wasmBuf);
  const { gradeTrialSamples } = await import('./trial.js');
  const meta = {
    loadMs: performance.now() - t0,
    fromCache: assets.fromCache,
    modelBytes: assets.modelBytes,
    modelFile: assets.modelFile
  };
  return {
    isMain: true,
    worker: null,
    grade(samples, text) {
      return gradeTrialSamples(samples, text, PASS_AT).then((graded) => {
        const scoreMs = graded.perf && graded.perf.citrinetMs ? graded.perf.citrinetMs : 0;
        return packGrade(graded, scoreMs, meta);
      });
    }
  };
}

function loadOrtOnMain(ortJsText) {
  if (globalThis.ort && globalThis.ort.InferenceSession) return Promise.resolve(globalThis.ort);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([ortJsText], { type: 'text/javascript' }));
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => {
      URL.revokeObjectURL(url);
      if (globalThis.ort && globalThis.ort.InferenceSession) resolve(globalThis.ort);
      else reject(new Error('runtime-missing'));
    };
    script.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('runtime-missing'));
    };
    document.head.appendChild(script);
  });
}

// Scores a read-aloud take off the main thread so the page stays usable on a phone.

let gradeSamples = null;

self.onmessage = (event) => {
  const msg = event.data || {};
  if (msg.type === 'init') {
    start().then((meta) => {
      self.postMessage({ type: 'ready', ...meta });
    }).catch((err) => {
      self.postMessage({ type: 'init-error', message: String(err && err.message || err) });
    });
    return;
  }
  if (msg.type !== 'grade') return;
  if (!gradeSamples) {
    self.postMessage({ type: 'grade-error', id: msg.id, message: 'not-ready' });
    return;
  }
  gradeSamples(msg.samples, String(msg.text || '')).then((payload) => {
    self.postMessage({ type: 'graded', id: msg.id, payload });
  }).catch((err) => {
    self.postMessage({ type: 'grade-error', id: msg.id, message: String(err && err.message || err) });
  });
};

function installRuntime(ortJsText) {
  const ortUrl = URL.createObjectURL(new Blob([ortJsText], { type: 'text/javascript' }));
  try {
    importScripts(ortUrl);
  } catch (err) {
    /* Blob scripts are blocked in some browsers. The fallback runs the same file here. */
  }
  URL.revokeObjectURL(ortUrl);
  if (!self.ort || !self.ort.InferenceSession) {
    (0, eval)(ortJsText + '\nglobalThis.ort = ort;\n');
  }
  const ort = self.ort || globalThis.ort;
  if (!ort || !ort.InferenceSession) throw new Error('runtime-missing');
  return ort;
}

async function start() {
  const t0 = performance.now();
  const { loadCheckerAssets } = await import(new URL('./assets.js', self.location.href));
  const { bootSession } = await import(new URL('./session.js', self.location.href));
  const { gradeTrialSamples } = await import(new URL('./trial.js', self.location.href));
  const { packGrade } = await import(new URL('./pack.js', self.location.href));
  const { PASS_AT } = await import(new URL('./stars.js', self.location.href));
  const assets = await loadCheckerAssets();
  const ort = installRuntime(assets.ortJsText);
  await bootSession(ort, assets.modelBuf, assets.piecesText, assets.mjsBuf, assets.wasmBuf);
  const meta = {
    loadMs: performance.now() - t0,
    fromCache: assets.fromCache,
    modelBytes: assets.modelBytes,
    modelFile: assets.modelFile
  };
  if (assets.putErrors && assets.putErrors.length) console.error(assets.putErrors.join('; '));
  gradeSamples = async (samples, text) => {
    const graded = await gradeTrialSamples(samples, text, PASS_AT);
    const scoreMs = graded.perf && graded.perf.citrinetMs ? graded.perf.citrinetMs : 0;
    return packGrade(graded, scoreMs, meta);
  };
  return meta;
}

// One pronunciation model for every MRJ app.
// The pronounce site owns the file, the loader, and the browser cache.
// https://mrjkorea.github.io/pronounce/src/shared.js
// Cache name and assembled file must match that loader (src/trial.js).
export const MODEL_ORIGIN = 'https://mrjkorea.github.io/pronounce/';
export const SHARED_URL = MODEL_ORIGIN + 'src/shared.js';
export const MANIFEST_FILE = 'models/hubert/manifest.json';
export const MODEL_FILE = 'hubert-base-phoneme-en-int8.onnx';
export const MODEL_CACHE = 'mrj-hubert-phoneme-en-int8-v1';

export function modelUrls() {
  return { shared: SHARED_URL, manifest: MODEL_ORIGIN + MANIFEST_FILE };
}

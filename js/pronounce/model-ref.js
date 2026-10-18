// One pronunciation model for every MRJ app: the shared HuBERT phoneme checker on the pronounce site.
// The model is cached in this browser after the first load and reused by every MRJ app.
export const MODEL_ORIGIN = 'https://mrjkorea.github.io/pronounce/';
export const SHARED_URL = MODEL_ORIGIN + 'src/shared.js';
export const MANIFEST_FILE = 'models/hubert/manifest.json';

export function modelUrls() {
  return { shared: SHARED_URL, manifest: MODEL_ORIGIN + MANIFEST_FILE };
}

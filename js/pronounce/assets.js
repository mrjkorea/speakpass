import { cachedResponse } from './cache-get.js';
import { CACHE_NAME, modelFileName, modelUrls } from './model-ref.js';

let pending = null;

export function loadCheckerAssets() {
  if (!pending) {
    pending = readAssets().catch((err) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

async function readAssets() {
  const urls = modelUrls();
  const entries = await Promise.all(Object.entries(urls).map(async ([key, url]) => {
    const row = await cachedResponse(url, CACHE_NAME);
    return [key, row];
  }));
  const byKey = Object.fromEntries(entries);
  const modelBuf = await byKey.model.response.arrayBuffer();
  const piecesText = await byKey.pieces.response.text();
  const ortJsText = await byKey.ortJs.response.text();
  const mjsBuf = await byKey.ortMjs.response.arrayBuffer();
  const wasmBuf = await byKey.ortWasm.response.arrayBuffer();
  return {
    fromCache: entries.every(([, row]) => row.fromCache),
    putErrors: entries.filter(([, row]) => row.putError).map(([key, row]) => `${key}:${row.putError}`),
    modelBytes: modelBuf.byteLength,
    modelFile: modelFileName(),
    modelBuf,
    piecesText,
    ortJsText,
    mjsBuf,
    wasmBuf
  };
}

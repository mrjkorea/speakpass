// One pronunciation model for every MRJ app.
// The file lives with the shared pronunciation checker and is cached in this browser after the first load.

export const MODEL_ORIGIN = 'https://mrjkorea.github.io/pronounce/';
export const MODEL_FILE = 'models/citrinet/model.int8.onnx';
export const PIECES_FILE = 'models/citrinet/sp_pieces.json';
export const ORT_JS = 'vendor/ort/ort.wasm.min.js';
export const ORT_MJS = 'vendor/ort/ort-wasm-simd-threaded.asyncify.mjs';
export const ORT_WASM = 'vendor/ort/ort-wasm-simd-threaded.asyncify.wasm';
export const CACHE_NAME = 'mrj-citrinet-v1';

export function modelUrls() {
  return {
    model: MODEL_ORIGIN + MODEL_FILE,
    pieces: MODEL_ORIGIN + PIECES_FILE,
    ortJs: MODEL_ORIGIN + ORT_JS,
    ortMjs: MODEL_ORIGIN + ORT_MJS,
    ortWasm: MODEL_ORIGIN + ORT_WASM
  };
}

export function modelFileName() {
  return MODEL_FILE.split('/').pop();
}

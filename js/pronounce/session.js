import { bootTrialInPage } from './trial.js';

export async function bootSession(ort, modelBuf, piecesText, mjsBuf, wasmBuf) {
  const mjsUrl = URL.createObjectURL(new Blob([mjsBuf], { type: 'text/javascript' }));
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = { mjs: mjsUrl };
  ort.env.wasm.wasmBinary = wasmBuf;
  const fetchImpl = async (path) => {
    if (String(path).endsWith('.onnx')) return new Response(modelBuf);
    return new Response(piecesText, { headers: { 'Content-Type': 'application/json' } });
  };
  await bootTrialInPage({ ort, fetchImpl });
}

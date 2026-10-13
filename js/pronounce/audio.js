// Decode a recording to mono 16 kHz, then drop leading and trailing silence.
// The speaking timer records the full 45 seconds, so the quiet tail is not scored.

export async function decodeAudioToMono(blob, targetRate = 16000) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('no-audio');
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const channels = decoded.numberOfChannels || 1;
    const length = decoded.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += data[i];
    }
    if (channels > 1) {
      for (let i = 0; i < length; i++) mono[i] /= channels;
    }
    const srcRate = decoded.sampleRate;
    if (srcRate === targetRate) return mono;
    const ratio = srcRate / targetRate;
    const outLen = Math.max(0, Math.floor(length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.floor(pos);
      const i1 = Math.min(i0 + 1, length - 1);
      const frac = pos - i0;
      out[i] = mono[i0] * (1 - frac) + mono[i1] * frac;
    }
    return out;
  } finally {
    if (typeof ctx.close === 'function') ctx.close().catch(() => {});
  }
}

export function trimSilence(samples, sampleRate, threshold = 0.004, padMs = 120) {
  const n = samples.length;
  if (!n) return samples;
  const win = Math.max(16, Math.floor(sampleRate * 0.02));
  const pad = Math.floor(sampleRate * padMs / 1000);
  let start = 0;
  let end = n;
  for (let i = 0; i + win <= n; i += win) {
    let sum = 0;
    for (let j = i; j < i + win; j++) sum += samples[j] * samples[j];
    if (Math.sqrt(sum / win) > threshold) {
      start = Math.max(0, i - pad);
      break;
    }
  }
  for (let i = n - win; i >= 0; i -= win) {
    let sum = 0;
    const stop = Math.min(n, i + win);
    for (let j = i; j < stop; j++) sum += samples[j] * samples[j];
    if (Math.sqrt(sum / win) > threshold) {
      end = Math.min(n, i + win + pad);
      break;
    }
  }
  if (end <= start) return samples;
  return samples.slice(start, end);
}

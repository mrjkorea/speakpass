// Model readings for questions 1 and 2.
// The mp3 files are pre-baked with the same text-to-speech voices as the exam narration,
// one file for each voice key, so the student hears the model in the voice they chose.
import { MIXED_VOICE, getNarrationVoice } from './narration.js';

/** 'mixed' is a rotating cast; the model reading uses this key for it. */
export const MODEL_VOICE_FALLBACK = 'us-f';

export function modelVoice() {
  const voice = getNarrationVoice();
  return voice === MIXED_VOICE ? MODEL_VOICE_FALLBACK : voice;
}

export function modelClipFile(testId, q) {
  const test = String(testId || '').replace(/[^a-z0-9]/gi, '');
  const n = Number(q);
  if (!test || (n !== 1 && n !== 2)) return '';
  return `${test}-q${n}.mp3`;
}

export function modelClipUrl(testId, q) {
  const file = modelClipFile(testId, q);
  if (!file) return '';
  return new URL(`../audio/model/${modelVoice()}/${file}`, import.meta.url).href;
}

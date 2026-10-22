/**
 * Pre-recorded narration clips listed in audio/narration/manifest.json.
 * There is no browser voice and no second voice. A missing clip returns
 * played:false so the screen can show the script text and keep the timing.
 */

import { CUE_PREPARING, CUE_SPEAKING, EXAM_DIRECTIONS, EXAM_INTRO } from './exam-copy.js';

export const CUE_PREP_ID = 'cue.begin_preparing';
export const CUE_SPEAK_ID = 'cue.begin_speaking';
export const INTRO_CLIP_ID = 'directions.intro';

export const VOICE_KEYS = ['us-f', 'us-m', 'uk-f', 'uk-m', 'au-f', 'au-m', 'nz-f'];
export const MIXED_VOICE = 'mixed';

let manifest = null;
let voices = [];
let voice = MIXED_VOICE;

export function normalizeVoice(key) {
  return VOICE_KEYS.includes(key) ? key : MIXED_VOICE;
}

/** 'mixed' keeps the rotating exam cast. A voice key reads every line from audio/narration/<key>/. */
export function setNarrationVoice(key) {
  voice = normalizeVoice(key);
}

export function getNarrationVoice() {
  return voice;
}
let baseUrl = null;
let loading = null;
let current = null;

export function directionClipId(part) {
  return `directions.${part}`;
}

export function questionClipId(testId, q) {
  return `${testId}.q${q}`;
}

export function setIntroClipId(testId) {
  return `${testId}.set_intro`;
}

export function callerClipId(testId) {
  return `${testId}.caller_intro`;
}

/** How many times the question clip is heard. Question 10 is played twice. */
export function narrationPasses(q) {
  const n = Number(q);
  if (n < 5 || n > 11) return 0;
  return n === 10 ? 2 : 1;
}

export function clipFile(id) {
  return `${String(id).replace(/\./g, '-')}.mp3`;
}

export function dwellSeconds(text, cue) {
  if (cue) return 1.6;
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.min(36, Math.max(4, words / 2.3));
}

export function prepareNarration() {
  if (manifest) return Promise.resolve(manifest);
  if (loading) return loading;
  const url = new URL('../audio/narration/manifest.json', import.meta.url);
  baseUrl = url;
  loading = fetch(url)
    .then((res) => (res.ok ? res.json() : { clips: {} }))
    .then((data) => {
      manifest = data && data.clips && typeof data.clips === 'object' ? data.clips : {};
      voices = data && Array.isArray(data.voices) ? data.voices : [];
      return manifest;
    })
    .catch(() => {
      manifest = {};
      return manifest;
    });
  return loading;
}

export function stopNarration() {
  const playing = current;
  current = null;
  if (!playing) return;
  playing.settle({ played: false, id: playing.id });
}

/**
 * Play one clip. Resolves { played:false } when the file is not there yet.
 * stop() ends playback early.
 */
export function playNarration(id) {
  stopNarration();
  let settled = false;
  let resolveDone = () => {};
  const done = new Promise((resolve) => { resolveDone = resolve; });
  const entry = {
    id,
    audio: null,
    settle(result) {
      if (settled) return;
      settled = true;
      const audio = entry.audio;
      entry.audio = null;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        try { audio.pause(); } catch (err) { /* already stopped */ }
      }
      if (current === entry) current = null;
      resolveDone(result);
    }
  };
  current = entry;

  let file = manifest && manifest[id];
  if (file && voice !== MIXED_VOICE && voices.includes(voice)) file = `${voice}/${clipFile(id)}`;
  if (!file || typeof Audio === 'undefined') {
    entry.settle({ played: false, id });
    return { done, stop() { entry.settle({ played: false, id }); } };
  }

  const audio = new Audio();
  entry.audio = audio;
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.src = new URL(file, baseUrl).href;
  audio.onended = () => entry.settle({ played: true, id });
  audio.onerror = () => entry.settle({ played: false, id });
  audio.play().catch(() => entry.settle({ played: false, id }));
  return {
    done,
    stop() { entry.settle({ played: false, id }); }
  };
}

export function cueText(id) {
  if (id === CUE_PREP_ID) return CUE_PREPARING;
  if (id === CUE_SPEAK_ID) return CUE_SPEAKING;
  if (id === INTRO_CLIP_ID) return EXAM_INTRO;
  if (String(id).startsWith('directions.')) return EXAM_DIRECTIONS[id.slice('directions.'.length)] || '';
  return '';
}

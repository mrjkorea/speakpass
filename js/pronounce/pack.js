import { PASS_AT, bandFor, starsFromPct } from './stars.js';
import { MODEL_FILE } from './model-ref.js';

function againResult(base) {
  return {
    status: 'again',
    save: '0/5',
    stars: 0,
    words: [],
    scorePct: 0,
    pass: false,
    band: 'red',
    ...base
  };
}

function needsAgain(graded, result) {
  if (result.doorFail || result.acousticFail) return true;
  return !!(graded && graded.door && graded.door.ok === false);
}

function wordKey(word) {
  return String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The checker returns bare words. Show the printed sentence instead: every printed word keeps its
 * punctuation and capital letter, and takes the score of the word the checker matched to it.
 */
export function punctuateWords(target, words) {
  const printed = String(target || '').match(/\S+/g) || [];
  if (!printed.length) return words || [];
  const scored = (words || []).map((word) => ({ ...word, key: wordKey(word.word) }));
  const out = [];
  let at = 0;
  for (const token of printed) {
    const key = wordKey(token);
    let hit = null;
    if (key) {
      const end = Math.min(scored.length, at + 3);
      for (let i = at; i < end && !hit; i += 1) {
        if (scored[i].key && scored[i].key === key) hit = scored[i];
      }
      for (let i = at; i < end && !hit; i += 1) {
        const other = scored[i].key;
        if (other && (key.startsWith(other) || other.startsWith(key))) hit = scored[i];
      }
      if (hit) at = scored.indexOf(hit) + 1;
    }
    out.push(hit
      ? { word: token, score: hit.score, band: hit.band, weak: hit.weak != null ? hit.weak : hit.band === 'red' }
      : { word: token, score: 0, band: null, weak: false });
  }
  return out;
}

export function packGrade(graded, scoreMs, meta, target) {
  const result = graded && graded.result ? graded.result : {};
  const info = meta || {};
  const perf = graded && graded.perf ? graded.perf : {};
  const base = {
    scoreMs: Number(scoreMs) || 0,
    hubertMs: Number(perf.hubertMs) || 0,
    loadMs: Number(info.loadMs) || 0,
    fromCache: info.fromCache === true,
    modelBytes: Number(info.modelBytes) || 0,
    modelFile: info.modelFile || MODEL_FILE
  };
  if (needsAgain(graded, result)) return againResult(base);
  const scorePct = Number(result.scorePct) || 0;
  const stars = starsFromPct(scorePct);
  const words = (result.words || []).map((word) => {
    const score = Math.round(Number(word.score) || 0);
    const band = word.band === 'green' || word.band === 'yellow' || word.band === 'red'
      ? word.band
      : bandFor(score);
    return {
      word: String(word.word || ''),
      score,
      band,
      weak: band === 'red'
    };
  });
  const pass = typeof result.pass === 'boolean' ? result.pass : scorePct >= PASS_AT;
  return {
    status: 'scored',
    save: `${stars}/5`,
    stars,
    words: punctuateWords(target, words),
    band: result.band || bandFor(scorePct),
    pass,
    scorePct,
    ...base
  };
}

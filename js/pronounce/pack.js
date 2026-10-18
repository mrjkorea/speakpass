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

export function packGrade(graded, scoreMs, meta) {
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
    words,
    band: result.band || bandFor(scorePct),
    pass,
    scorePct,
    ...base
  };
}

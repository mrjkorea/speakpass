import { PASS_AT, bandFor, starsFromPct } from './stars.js';

export function packGrade(graded, scoreMs, meta) {
  const result = graded && graded.result ? graded.result : {};
  const info = meta || {};
  const base = {
    scoreMs: Number(scoreMs) || 0,
    loadMs: Number(info.loadMs) || 0,
    fromCache: info.fromCache === true,
    modelBytes: Number(info.modelBytes) || 0,
    modelFile: info.modelFile || 'hubert',
    overlap: graded && graded.door && typeof graded.door.overlap === 'number' ? graded.door.overlap : 0
  };
  if (result.doorFail) {
    return {
      status: 'again',
      save: '0/5',
      stars: 0,
      words: [],
      scorePct: 0,
      ...base
    };
  }
  const stars = starsFromPct(result.scorePct);
  const words = (result.words || []).map((word) => ({
    word: String(word.word || ''),
    score: Math.round(Number(word.score) || 0),
    band: bandFor(word.score),
    weak: bandFor(word.score) === 'red'
  }));
  return {
    status: 'scored',
    save: `${stars}/5`,
    stars,
    words,
    band: bandFor(result.scorePct),
    pass: (Number(result.scorePct) || 0) >= PASS_AT,
    scorePct: Number(result.scorePct) || 0,
    ...base
  };
}

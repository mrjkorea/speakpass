import { PASS_AT, starsFromPct } from './stars.js';

export function packGrade(graded, scoreMs, meta) {
  const result = graded && graded.result ? graded.result : {};
  const info = meta || {};
  const base = {
    scoreMs: Number(scoreMs) || 0,
    loadMs: Number(info.loadMs) || 0,
    fromCache: info.fromCache === true,
    modelBytes: Number(info.modelBytes) || 0,
    modelFile: info.modelFile || 'model.int8.onnx',
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
    weak: (Number(word.score) || 0) < PASS_AT
  }));
  return {
    status: 'scored',
    save: `${stars}/5`,
    stars,
    words,
    scorePct: Number(result.scorePct) || 0,
    ...base
  };
}

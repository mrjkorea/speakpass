// Pronunciation is a SMALL part of Q3-Q11: 12% of the app's stars and 0-200 estimate.
// Content (checklist / AI band) stays 88%. The AI band itself is never changed.
export const PRON_WEIGHT = 0.12;

export function usablePron(pron) {
  return !!(pron && Number.isFinite(Number(pron.pct)));
}

/** Returns the blended score on the same scale as `total` (one decimal). No pron = unchanged. */
export function blendScore(score, total, pron) {
  const s = Number(score) || 0;
  const tot = Number(total) || 0;
  // No content credit = no pronunciation credit (clear speech can't earn a star on its own).
  if (!usablePron(pron) || tot <= 0 || s <= 0) return s;
  const ratio = (1 - PRON_WEIGHT) * (s / tot) + PRON_WEIGHT * (Math.max(0, Math.min(100, Number(pron.pct))) / 100);
  return Math.round(ratio * tot * 10) / 10;
}

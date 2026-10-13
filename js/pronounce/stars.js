/** A word counts as said when its alignment score is at least this (0–100). */
export const PASS_AT = 60;

/**
 * Turns the average word score into 1–5 stars.
 * 90 and above is 5, 80 is 4, 70 is 3, 60 is 2, and anything lower is 1.
 */
export function starsFromPct(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < 60) return 1;
  if (n >= 90) return 5;
  if (n >= 80) return 4;
  if (n >= 70) return 3;
  return 2;
}

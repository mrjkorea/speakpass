/** Shared MRJ colours: green 75+, yellow 50-74, red under 50. */
export const THRESHOLDS = Object.freeze({ green: 75, yellow: 50 });
/** PASS = the line average is 60 or more (shared MRJ rule). */
export const PASS_AT = 60;

export function bandFor(pct) {
  const n = Number(pct) || 0;
  if (n >= THRESHOLDS.green) return 'green';
  if (n >= THRESHOLDS.yellow) return 'yellow';
  return 'red';
}

/**
 * Turns the average word score into 1–5 stars (placeholder until the new star design).
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

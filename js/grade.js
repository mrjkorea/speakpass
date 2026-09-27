/**
 * Grading hooks only.
 * Questions 1–4 will later receive free on-device stars.
 * Questions 5–11 will later receive paid server grading.
 * Neither function uploads audio. Both return "coming soon".
 */

export function gradeFree(q, audio) {
  void q;
  void audio;
  return Promise.resolve('coming soon');
}

export function gradePaid(attempt) {
  void attempt;
  return Promise.resolve('coming soon');
}

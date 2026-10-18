/**
 * Questions 1 and 2 are scored on the device with the shared pronunciation checker.
 * Questions 3 and 4 stay free and unscored for now.
 * Questions 5–11 will later receive paid server grading.
 * Nothing here uploads audio.
 */

export { gradeReadAloud, warmChecker } from './pronounce/boot.js';

export function gradeFree(q, audio) {
  void q;
  void audio;
  return Promise.resolve('coming soon');
}

export function gradePaid(attempt) {
  void attempt;
  return Promise.resolve('coming soon');
}

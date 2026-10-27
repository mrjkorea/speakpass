import { PART_ORDER, questionType } from './plan.js';
import { savedQuestion } from './progress.js';

export function isTeacherMode() {
  try {
    if (globalThis.MRJTeacherUnlock && globalThis.MRJTeacherUnlock.isMrjTeacher()) return true;
    const api = globalThis.MRJSignin || globalThis.MRJ_AUTH;
    return !!(api && typeof api.isTeacher === 'function' && api.isTeacher());
  } catch (err) {
    return false;
  }
}

function partsForTest(test) {
  const seen = new Set();
  const order = [];
  for (const part of PART_ORDER) {
    const has = (test.questions || []).some((q) => questionType(q) === part);
    if (has && !seen.has(part)) {
      seen.add(part);
      order.push(part);
    }
  }
  return order;
}

function partHasSaved(pack, testId, partId, test) {
  for (const q of test.questions || []) {
    if (questionType(q) !== partId) continue;
    if (savedQuestion(pack, testId, q.q)) return true;
  }
  return false;
}

/** Practice parts unlock in catalog order after at least one saved score in the prior part. */
export function practicePartUnlocked(pack, test, partId) {
  if (!test || !partId) return false;
  if (isTeacherMode()) return true;
  const order = partsForTest(test);
  const idx = order.indexOf(partId);
  if (idx <= 0) return true;
  return partHasSaved(pack, test.id, order[idx - 1], test);
}

export function practiceQuestionUnlocked(pack, test, qNumber) {
  if (!test) return false;
  const q = (test.questions || []).find((item) => item.q === qNumber);
  if (!q) return false;
  return practicePartUnlocked(pack, test, questionType(q));
}

/** Full exam microphone check (first screen on the exam path). */
export function examMicGateOpen() {
  return isTeacherMode();
}

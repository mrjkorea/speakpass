import { activeStream, beep, startRecorder } from './audio.js';
import { startCountdown } from './timer.js';

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyRecording() {
  return { blob: new Blob(), mimeType: '' };
}

/**
 * Runs a plan. Timers cannot be paused.
 * begin() shows the first directions step.
 * continue() leaves directions and runs until the next directions step or the end.
 * end() stops the current timer, keeps answers recorded so far, and resolves when the loop exits.
 */
export function createSession({ test, plan, mode, onView }) {
  let index = 0;
  let cancelled = false;
  let running = false;
  let started = false;
  let cancelTimer = () => {};
  const endWaiters = [];
  let endPromise = null;
  const answers = [];
  const attempt = {
    id: uid(),
    testId: test.id,
    testTitle: test.title,
    mode: mode || 'full',
    questionNumbers: plan.filter((step) => step.kind === 'question').map((step) => step.question.q),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    complete: false,
    answers
  };

  function emit(partial) {
    onView({ ...partial, attempt });
  }

  function flushEnd() {
    attempt.finishedAt = attempt.finishedAt || new Date().toISOString();
    const waiters = endWaiters.splice(0);
    for (const fn of waiters) fn(attempt);
  }

  async function proceed() {
    if (running || cancelled) return;
    running = true;
    try {
      while (!cancelled && index < plan.length) {
        const step = plan[index];
        if (step.kind === 'directions') {
          emit({ status: 'directions', step, stepIndex: index, phase: 'directions', remaining: 0, total: 0, recording: false });
          return;
        }
        if (step.kind === 'read_document') {
          const total = step.seconds;
          const timer = startCountdown(total, (left) => {
            emit({ status: 'running', step, stepIndex: index, phase: 'reading', remaining: left, total, recording: false });
          });
          cancelTimer = timer.cancel;
          const result = await timer.done;
          cancelTimer = () => {};
          if (cancelled || result.cancelled) return;
          beep('start');
          index += 1;
          continue;
        }
        if (step.kind === 'question') {
          const q = step.question;
          const prep = Number(q.prep_sec) || 0;
          const prepTimer = startCountdown(prep, (left) => {
            emit({ status: 'running', step, stepIndex: index, phase: 'prepare', remaining: left, total: prep, recording: false });
          });
          cancelTimer = prepTimer.cancel;
          const prepResult = await prepTimer.done;
          cancelTimer = () => {};
          if (cancelled || prepResult.cancelled) return;
          beep('start');
          if (cancelled) return;

          let recorder = null;
          try {
            const media = activeStream();
            if (media) recorder = startRecorder(media);
          } catch (err) {
            recorder = null;
          }
          const speak = Number(q.speak_sec) || 0;
          const speakTimer = startCountdown(speak, (left) => {
            emit({ status: 'running', step, stepIndex: index, phase: 'speak', remaining: left, total: speak, recording: !!recorder });
          });
          cancelTimer = speakTimer.cancel;
          const speakResult = await speakTimer.done;
          cancelTimer = () => {};
          let recorded = emptyRecording();
          if (recorder) {
            try { recorded = await recorder.stop(); } catch (err) { recorded = emptyRecording(); }
          }
          answers.push({
            q: q.q,
            type: q.type,
            mimeType: recorded.mimeType || (recorded.blob && recorded.blob.type) || '',
            blob: recorded.blob || new Blob(),
            speakSec: speak
          });
          if (cancelled || speakResult.cancelled) return;
          beep('end');
          index += 1;
          continue;
        }
        index += 1;
      }
      if (!cancelled) {
        attempt.complete = true;
        attempt.finishedAt = new Date().toISOString();
        emit({ status: 'done', step: null, stepIndex: index, phase: 'done', remaining: 0, total: 0, recording: false });
      }
    } catch (err) {
      cancelled = true;
      attempt.complete = false;
      attempt.finishedAt = new Date().toISOString();
      emit({ status: 'done', step: null, stepIndex: index, phase: 'done', remaining: 0, total: 0, recording: false });
    } finally {
      running = false;
      if (cancelled) flushEnd();
    }
  }

  return {
    plan,
    attempt,
    begin() {
      if (started) return;
      started = true;
      return proceed();
    },
    continue() {
      if (cancelled) return;
      const step = plan[index];
      if (!step || step.kind !== 'directions') return;
      index += 1;
      return proceed();
    },
    end() {
      if (endPromise) return endPromise;
      cancelled = true;
      try { cancelTimer(); } catch (err) { /* ignore */ }
      if (!running) {
        attempt.complete = false;
        attempt.finishedAt = new Date().toISOString();
        endPromise = Promise.resolve(attempt);
        return endPromise;
      }
      endPromise = new Promise((resolve) => { endWaiters.push(resolve); });
      return endPromise;
    }
  };
}

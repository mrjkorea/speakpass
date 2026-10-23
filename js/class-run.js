import { beep } from './audio.js';
import { beginCapture } from './capture.js';
import { startCountup } from './timer.js';
import {
  callerClipId,
  directionClipId,
  narrationPasses,
  playNarration,
  prepareNarration,
  questionClipId,
  setIntroClipId,
  stopNarration
} from './narration.js';

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Class mode. Preparation and speaking run until the student presses Done.
 * The clock counts up. The official target is only a guide.
 */
export function createClassRun({ test, plan, onView }) {
  let index = 0;
  let cancelled = false;
  let started = false;
  let phase = 'idle';
  let count = null;
  let capture = null;
  const endWaiters = [];
  let heardIntro = false;
  let heardCaller = false;
  let speakToken = 0;

  // Untimed practice reads the directions and the questions aloud, like the real test. The clock still waits for Done.
  async function narrate(ids) {
    const token = ++speakToken;
    try { await prepareNarration(); } catch (err) { return; }
    for (const id of ids) {
      if (cancelled || token !== speakToken) return;
      const playback = playNarration(id);
      await playback.done;
    }
  }

  function hush() {
    speakToken += 1;
    stopNarration();
  }
  let endPromise = null;
  const answers = [];
  const attempt = {
    id: uid(),
    testId: test.id,
    testTitle: test.title,
    mode: 'class',
    questionNumbers: plan.filter((step) => step.kind === 'question').map((step) => step.question.q),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    complete: false,
    answers
  };

  function emit(partial) {
    const elapsed = count ? count.elapsed() : 0;
    onView({
      status: 'running',
      phase,
      elapsed,
      target: 0,
      recording: false,
      step: plan[index] || null,
      stepIndex: index,
      answer: null,
      ...partial,
      attempt
    });
  }

  function stopClock() {
    const value = count ? count.stop() : 0;
    count = null;
    return value;
  }

  function flushEnd() {
    attempt.finishedAt = attempt.finishedAt || new Date().toISOString();
    const waiters = endWaiters.splice(0);
    for (const fn of waiters) fn(attempt);
  }

  function showCurrent() {
    if (cancelled || index >= plan.length) return;
    const step = plan[index];
    if (step.kind === 'directions') {
      phase = 'directions';
      emit({ status: 'directions', phase, target: 0, elapsed: 0, recording: false });
      narrate([directionClipId(step.part)]);
      return;
    }
    if (step.kind === 'read_document') {
      phase = 'reading';
      const target = Number(step.seconds) || 45;
      count = startCountup((elapsed) => {
        emit({ status: 'reading', phase: 'reading', elapsed, target, recording: false });
      });
      emit({ status: 'reading', phase: 'reading', elapsed: 0, target, recording: false });
      return;
    }
    if (step.kind === 'question') {
      phase = 'prepare';
      const target = Number(step.question.prep_sec) || 0;
      count = startCountup((elapsed) => {
        emit({ status: 'running', phase: 'prepare', elapsed, target, recording: false });
      });
      emit({ status: 'running', phase: 'prepare', elapsed: 0, target, recording: false });
      const q = step.question;
      const clips = [];
      if (q.type === 'respond_questions' && !heardIntro) { heardIntro = true; clips.push(setIntroClipId(test.id)); }
      if (q.type === 'info_questions' && !heardCaller) { heardCaller = true; clips.push(callerClipId(test.id)); }
      for (let pass = 0; pass < narrationPasses(q.q); pass += 1) clips.push(questionClipId(test.id, q.q));
      if (clips.length) narrate(clips);
    }
  }

  async function finishSpeak() {
    const used = stopClock();
    phase = 'saving';
    const step = plan[index];
    const q = step.question;
    let recorded = { blob: new Blob(), mimeType: '', transcript: '' };
    if (capture) {
      try { recorded = await capture.finish(); } catch (err) { recorded = recorded; }
    }
    capture = null;
    beep('end');
    const answer = {
      q: q.q,
      type: q.type,
      mimeType: recorded.mimeType || '',
      blob: recorded.blob || new Blob(),
      speakSec: Number(q.speak_sec) || 0,
      usedSec: Math.max(0, Math.round(used)),
      transcript: recorded.transcript || ''
    };
    answers.push(answer);
    phase = 'feedback';
    emit({
      status: 'feedback',
      phase: 'feedback',
      elapsed: used,
      target: Number(q.speak_sec) || 0,
      recording: false,
      answer
    });
  }

  return {
    plan,
    attempt,
    begin() {
      if (started) return;
      started = true;
      attempt.startedAt = new Date().toISOString();
      showCurrent();
    },
    /** Leave a directions or document screen. */
    continue() {
      if (cancelled) return;
      const step = plan[index];
      if (!step || (step.kind !== 'directions' && step.kind !== 'read_document')) return;
      hush();
      stopClock();
      index += 1;
      if (index >= plan.length) {
        attempt.complete = true;
        attempt.finishedAt = new Date().toISOString();
        emit({ status: 'done', phase: 'done', step: null, answer: null });
        return;
      }
      showCurrent();
    },
    /** End preparation, or end speaking. */
    async done() {
      if (cancelled) return;
      const step = plan[index];
      if (!step || step.kind !== 'question') return;
      if (phase === 'prepare') {
        hush();
        stopClock();
        beep('start');
        capture = beginCapture();
        phase = 'speak';
        const target = Number(step.question.speak_sec) || 0;
        count = startCountup((elapsed) => {
          emit({ status: 'running', phase: 'speak', elapsed, target, recording: true });
        });
        emit({ status: 'running', phase: 'speak', elapsed: 0, target, recording: true });
        return;
      }
      if (phase === 'speak') {
        phase = 'saving';
        await finishSpeak();
      }
    },
    next() {
      if (cancelled || phase !== 'feedback') return;
      index += 1;
      if (index >= plan.length) {
        attempt.complete = true;
        attempt.finishedAt = new Date().toISOString();
        emit({ status: 'done', phase: 'done', step: null, answer: null });
        return;
      }
      showCurrent();
    },
    end() {
      if (endPromise) return endPromise;
      cancelled = true;
      hush();
      stopClock();
      const pending = capture;
      capture = null;
      endPromise = (async () => {
        if (pending && phase === 'speak') {
          try { await pending.finish(); } catch (err) { /* keep answers already stored */ }
        }
        attempt.complete = false;
        attempt.finishedAt = new Date().toISOString();
        flushEnd();
        return attempt;
      })();
      return endPromise;
    }
  };
}

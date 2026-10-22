import { beep } from './audio.js';
import { beginCapture } from './capture.js';
import { EXAM_DIRECTIONS } from './exam-copy.js';
import {
  CUE_PREP_ID,
  CUE_SPEAK_ID,
  callerClipId,
  cueText,
  directionClipId,
  dwellSeconds,
  playNarration,
  narrationPasses,
  questionClipId,
  setIntroClipId,
  stopNarration
} from './narration.js';
import { startCountdown } from './timer.js';

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextSpeak(plan, fromIndex) {
  for (let i = fromIndex + 1; i < plan.length; i += 1) {
    if (plan[i].kind === 'question') return Number(plan[i].question.speak_sec) || 0;
  }
  return 0;
}

function upcomingTimes(plan, index) {
  const step = plan[index];
  if (!step) return { prep: 0, speak: 0 };
  if (step.kind === 'question') {
    return { prep: Number(step.question.prep_sec) || 0, speak: Number(step.question.speak_sec) || 0 };
  }
  if (step.kind === 'read_document') {
    return { prep: Number(step.seconds) || 0, speak: nextSpeak(plan, index) };
  }
  if (step.kind === 'directions') {
    const first = (step.questions && step.questions[0]) || null;
    return {
      prep: first ? Number(first.prep_sec) || 0 : 0,
      speak: first ? Number(first.speak_sec) || 0 : 0
    };
  }
  return { prep: 0, speak: 0 };
}

/**
 * Full exam. One begin() call runs every step. There is no skip and no pause.
 * Official preparation and response times are unchanged when a clip is missing:
 * the script text stays on screen for a reading interval, then the clock runs.
 */
export function createExamRun({ test, plan, onView }) {
  let index = 0;
  let cancelled = false;
  let running = false;
  let started = false;
  let cancelTimer = () => {};
  let playback = null;
  const endWaiters = [];
  let endPromise = null;
  const answers = [];
  const attempt = {
    id: uid(),
    testId: test.id,
    testTitle: test.title,
    mode: 'exam',
    questionNumbers: plan.filter((step) => step.kind === 'question').map((step) => step.question.q),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    complete: false,
    answers
  };
  let heardIntro = false;
  let heardCaller = false;

  function emit(partial) {
    onView({
      prepLeft: 0,
      prepTotal: 0,
      speakLeft: 0,
      speakTotal: 0,
      prepActive: false,
      speakActive: false,
      recording: false,
      showQuestionText: true,
      script: '',
      twice: false,
      step: plan[index] || null,
      stepIndex: index,
      ...partial,
      attempt
    });
  }

  function clockFor(stepIndex, extra) {
    const times = upcomingTimes(plan, stepIndex);
    return {
      prepLeft: times.prep,
      prepTotal: times.prep,
      speakLeft: times.speak,
      speakTotal: times.speak,
      prepActive: false,
      speakActive: false,
      ...extra
    };
  }

  function flushEnd() {
    attempt.finishedAt = attempt.finishedAt || new Date().toISOString();
    const waiters = endWaiters.splice(0);
    for (const fn of waiters) fn(attempt);
  }

  function wait(ms) {
    if (cancelled) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        cancelTimer = () => {};
        resolve(!cancelled);
      }, ms);
      cancelTimer = () => {
        clearTimeout(id);
        cancelTimer = () => {};
        resolve(false);
      };
    });
  }

  async function say(id, text, opts) {
    if (cancelled) return null;
    const options = opts || {};
    const cueLine = !!options.cue;
    const step = plan[index];
    const showQuestionText = options.showText != null ? !!options.showText : true;
    const base = {
      status: 'narration',
      phase: 'narration',
      ...clockFor(index),
      twice: !!options.twice,
      step,
      stepIndex: index
    };
    emit({
      ...base,
      showQuestionText,
      script: options.scriptDuring ? text : ''
    });
    playback = playNarration(id);
    let played = false;
    try {
      const result = await playback.done;
      played = !!(result && result.played) && !cancelled;
    } catch (err) {
      played = false;
    }
    playback = null;
    if (cancelled) return null;
    if (!played) {
      emit({
        ...base,
        showQuestionText: options.revealOnMissing ? true : showQuestionText,
        script: options.scriptIfMissing || options.scriptDuring ? text : ''
      });
      const ok = await wait(dwellSeconds(text, cueLine) * 1000);
      if (!ok) return null;
      return { played: false };
    }
    return { played: true };
  }

  async function countdown(seconds, phase, view) {
    if (cancelled) return false;
    const total = Math.max(0, Number(seconds) || 0);
    const timer = startCountdown(total, (left) => {
      const prepPhase = phase === 'prepare' || phase === 'reading';
      emit({
        status: 'running',
        phase,
        prepLeft: prepPhase ? left : 0,
        prepTotal: view.prepTotal,
        speakLeft: phase === 'speak' ? left : view.speakTotal,
        speakTotal: view.speakTotal,
        prepActive: prepPhase,
        speakActive: phase === 'speak',
        recording: phase === 'speak' && !!view.recording,
        showQuestionText: view.showQuestionText,
        cue: '',
        twice: false,
        step: view.step,
        stepIndex: index
      });
    });
    cancelTimer = timer.cancel;
    const result = await timer.done;
    cancelTimer = () => {};
    return !cancelled && !result.cancelled;
  }

  async function runQuestion(step) {
    const q = step.question;
    let showQuestionText = q.type !== 'info_questions';

    if (q.type === 'respond_questions' && !heardIntro) {
      heardIntro = true;
      const intro = await say(setIntroClipId(test.id), q.set_intro || '', { showText: true });
      if (!intro) return false;
    }
    if (q.type === 'info_questions' && !heardCaller) {
      heardCaller = true;
      const caller = await say(callerClipId(test.id), q.caller_intro || '', {
        showText: false,
        scriptIfMissing: true
      });
      if (!caller) return false;
    }
    if (q.q >= 5 && q.q <= 11) {
      const times = narrationPasses(q.q);
      let playedOnce = false;
      for (let pass = 0; pass < times; pass += 1) {
        const hideQuestion = q.type === 'info_questions' && (pass === 0 || playedOnce);
        const spoken = await say(questionClipId(test.id, q.q), q.question || '', {
          showText: !hideQuestion,
          revealOnMissing: q.type === 'info_questions',
          twice: q.q === 10
        });
        if (!spoken) return false;
        if (spoken.played) playedOnce = true;
      }
      if (q.type === 'info_questions') showQuestionText = !playedOnce;
    }

    const prep = Number(q.prep_sec) || 0;
    const speak = Number(q.speak_sec) || 0;
    const view = {
      step,
      prepTotal: prep,
      speakTotal: speak,
      showQuestionText,
      recording: false
    };
    if (prep > 0) {
      const cue = await say(CUE_PREP_ID, cueText(CUE_PREP_ID), {
        cue: true,
        showText: showQuestionText,
        scriptDuring: true
      });
      if (!cue) return false;
      const ok = await countdown(prep, 'prepare', view);
      if (!ok) return false;
    }
    const speakCue = await say(CUE_SPEAK_ID, cueText(CUE_SPEAK_ID), {
      cue: true,
      showText: showQuestionText,
      scriptDuring: true
    });
    if (!speakCue) return false;
    if (cancelled) return false;
    beep('start');
    const capture = beginCapture();
    view.recording = true;
    const spoke = await countdown(speak, 'speak', view);
    const recorded = await capture.finish();
    answers.push({
      q: q.q,
      type: q.type,
      mimeType: recorded.mimeType || '',
      blob: recorded.blob || new Blob(),
      speakSec: speak,
      usedSec: speak,
      transcript: recorded.transcript || ''
    });
    if (!spoke) return false;
    beep('end');
    return wait(350);
  }

  async function proceed() {
    if (running || cancelled) return;
    running = true;
    try {
      while (!cancelled && index < plan.length) {
        const step = plan[index];
        if (step.kind === 'directions') {
          const text = EXAM_DIRECTIONS[step.part] || '';
          const spoken = await say(directionClipId(step.part), text, { showText: true });
          if (!spoken) return;
          index += 1;
          continue;
        }
        if (step.kind === 'read_document') {
          const speak = nextSpeak(plan, index);
          const cue = await say(CUE_PREP_ID, cueText(CUE_PREP_ID), {
            cue: true,
            showText: false,
            scriptDuring: true
          });
          if (!cue) return;
          const ok = await countdown(step.seconds, 'reading', {
            step,
            prepTotal: step.seconds,
            speakTotal: speak,
            showQuestionText: false,
            recording: false
          });
          if (!ok) return;
          index += 1;
          continue;
        }
        if (step.kind === 'question') {
          const ok = await runQuestion(step);
          if (!ok) return;
          index += 1;
          continue;
        }
        index += 1;
      }
      if (!cancelled) {
        attempt.complete = true;
        attempt.finishedAt = new Date().toISOString();
        emit({ status: 'done', phase: 'done', step: null, stepIndex: index });
      }
    } catch (err) {
      cancelled = true;
      attempt.complete = false;
      attempt.finishedAt = new Date().toISOString();
      emit({ status: 'done', phase: 'done', step: null, stepIndex: index });
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
      attempt.startedAt = new Date().toISOString();
      return proceed();
    },
    end() {
      if (endPromise) return endPromise;
      cancelled = true;
      try { cancelTimer(); } catch (err) { /* ignore */ }
      if (playback) playback.stop();
      stopNarration();
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

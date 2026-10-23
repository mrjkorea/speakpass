import { reportScoredItems, loadProgressPack, saveProgressPack, studentId } from './cloud.js';
import { APP_NAME, LANGS } from './config.js';
import { requestAiMark, workerUrl } from './mark-client.js';
import { activeStream, beginArm, getAudioContext, hasStream, openLevelMeter, releaseMic, startRecorder } from './audio.js';
import { scoreChecklist, factHits } from './checklist.js';
import { createClassRun } from './class-run.js';
import { createExamRun } from './exam-run.js';
import { createSession } from './engine.js';
import { estimateFromRows, starsOf } from './estimate.js';
import { gradeFree, gradePaid, gradeReadAloud, warmChecker } from './grade.js';
import { escapeHtml, renderDocument } from './html.js';
import { detectLang, fill, loadDict, lookup } from './i18n.js';
import { classScreenHtml, estimateHtml, examIntroHtml, examMicHtml, examRunHtml } from './mode-view.js';
import { playNarration, prepareNarration, questionClipId, stopNarration, setNarrationVoice, getNarrationVoice, normalizeVoice, VOICE_KEYS, MIXED_VOICE } from './narration.js';
import { PART_ORDER, buildPlan, questionType, readSeconds } from './plan.js';
import { applyAttempt, applyMarkScores, emptyPack, packJson, parsePack, questionsForTest, savedQuestion } from './progress.js';
import { formatHMS } from './format.js';
import { fillTranscript, fillTranscripts } from './transcribe.js';
import { gradeSpoken } from './pronounce/boot.js';
import { blendScore, usablePron } from './pronounce/blend.js';

/** Small HuBERT pronunciation check for Q3-Q11 (after Whistle). Neutral (null) on any skip. */
function fillPron(ans) {
  if (!ans || ans.q < 3) return Promise.resolve(null);
  if (ans.pronPromise) return ans.pronPromise;
  const t0 = performance.now();
  ans.pronPromise = gradeSpoken(ans.sttParts).catch(() => null).then((pron) => {
    ans.pron = pron || null;
    (window.__pronStats = window.__pronStats || []).push({
      q: ans.q, ms: Math.round(performance.now() - t0), pct: pron ? pron.pct : null,
      parts: (ans.sttParts || []).length, hubertMs: pron ? pron.ms : null
    });
    return ans.pron;
  });
  return ans.pronPromise;
}

function blendChecklist(detail, pron) {
  if (!detail) return;
  if (detail.content3 == null) detail.content3 = detail.score3 != null ? detail.score3 : Math.round((Number(detail.stars) || 0) * 0.6);
  detail.pron = usablePron(pron) ? pron : null;
  detail.score = blendScore(detail.content3, 3, detail.pron);
  detail.max = 3;
  detail.stars = Math.max(0, Math.min(5, Math.round((detail.score / 3) * 5)));
}

function checkScore(detail) {
  if (!detail) return 0;
  if (detail.max === 3 && detail.score != null) return detail.score;
  if (detail.score3 != null) return detail.score3;
  return Math.round((Number(detail.score != null ? detail.score : detail.stars) || 0) * 0.6);
}

function pronLine(pron) {
  if (!usablePron(pron)) return '';
  return `<p class="score pron-line"><span class="score-name">${escapeHtml(t('results.pronunciation'))}</span> <span class="line-band band-${pron.band}">${pron.pct}%</span></p>`;
}
import { startCountdown } from './timer.js';

const RING = 2 * Math.PI * 52;

const state = {
  lang: 'en',
  dict: null,
  en: null,
  catalog: [],
  testId: '',
  screen: 'account',
  error: '',
  selection: null,
  session: null,
  view: null,
  micError: '',
  arming: false,
  dialog: false,
  review: null,
  playingQ: null,
  pack: emptyPack(),
  packStatus: 'idle',
  studentId: '',
  sessionOwner: '',
  examStage: 'mic',
  micBlob: null,
  micRecording: false,
  micLevel: 0,
  playingMic: false,
  classFeedback: null
};

let renderedScreen = '';
let viewKey = '';
let lastSpoken = '';
let presenting = false;
let audioEl = null;
let audioUrl = '';
let hydrateSeq = 0;
let reviewToken = 0;
let packEpoch = 0;
let saveChain = Promise.resolve();
let stopMeter = () => {};
let classToken = 0;

function t(key, vars) {
  const raw = lookup(state.dict, key) ?? lookup(state.en, key) ?? key;
  return fill(raw, vars);
}

function currentTest() {
  return state.catalog.find((item) => item.id === state.testId) || state.catalog[0] || null;
}

function applyDocumentChrome() {
  const meta = LANGS.find((lang) => lang.id === state.lang);
  document.documentElement.lang = state.lang;
  document.documentElement.dir = meta ? meta.dir : 'ltr';
  if (state.en) document.title = APP_NAME;
  const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (apple) apple.setAttribute('content', APP_NAME);
}

async function loadLanguage(lang) {
  if (!state.en) state.en = await loadDict('en');
  state.dict = lang === 'en' ? state.en : await loadDict(lang);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function loadCatalog() {
  const indexUrl = new URL('tests/index.json', document.baseURI);
  const index = await fetchJson(indexUrl);
  const tests = [];
  for (const item of index.tests || []) {
    const file = item.file || `${item.id}.json`;
    tests.push(await fetchJson(new URL(file, indexUrl)));
  }
  state.catalog = tests;
  if (!tests.some((item) => item.id === state.testId)) {
    state.testId = tests[0] ? tests[0].id : '';
  }
}

function micMessage(err) {
  const code = err && (err.code || err.name);
  if (code === 'insecure') return t('run.insecure');
  if (code === 'no-recorder') return t('run.noRecorder');
  if (code === 'no-mic' || code === 'NotFoundError' || code === 'NotReadableError') return t('run.micMissing');
  return t('run.micDenied');
}

function secsLeft(remaining) {
  return Math.max(0, Math.ceil(Number(remaining) - 1e-9));
}

function phaseLabel(phase) {
  if (phase === 'speak') return t('run.speak');
  if (phase === 'reading') return t('run.reading');
  if (phase === 'listen') return t('run.listen');
  return t('run.prepare');
}

function stopPlayback() {
  if (audioEl) {
    audioEl.onended = null;
    audioEl.pause();
    audioEl = null;
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    audioUrl = '';
  }
  state.playingQ = null;
  state.playingMic = false;
}

function goHome() {
  stopPlayback();
  stopNarration();
  stopMeter();
  stopMeter = () => {};
  releaseMic();
  reviewToken += 1;
  classToken += 1;
  state.session = null;
  state.view = null;
  state.dialog = false;
  state.review = null;
  state.classFeedback = null;
  state.micError = '';
  state.arming = false;
  state.micBlob = null;
  state.micRecording = false;
  state.playingMic = false;
  state.screen = 'home';
  viewKey = '';
  render();
}

function unsavedAnswers(attempt) {
  if (!attempt.savedQs) attempt.savedQs = new Set();
  return (attempt.answers || []).filter((ans) => !attempt.savedQs.has(ans.q));
}

function gradeByQuestion(attempt, grades) {
  const map = {};
  for (const ans of attempt.answers) {
    map[ans.q] = ans.q <= 4 ? grades.free[ans.q] : grades.paid;
  }
  return map;
}

function isReadAloudScore(ans) {
  return !!ans && (ans.q === 1 || ans.q === 2) && ans.type === 'read_aloud';
}

async function presentReview(attempt) {
  if (presenting) return;
  presenting = true;
  releaseMic();
  const token = ++reviewToken;
  const owner = state.sessionOwner || studentId();
  const grades = { free: {}, paid: null, read: {}, checklist: {} };
  const test = state.catalog.find((item) => item.id === attempt.testId);
  if (attempt.answers.some((a) => a && a.q >= 3 && a.blob && a.blob.size && !String(a.transcript || '').trim()) ) {
    state.screen = 'loading';
    state.loadingText = 'Scoring your answers…';
    render();
  }
  try { await fillTranscripts(attempt.answers); } catch (err) { /* keep going */ }
  state.loadingText = '';
  for (const ans of attempt.answers) {
    if (ans.localRead) {
      grades.read[ans.q] = ans.localRead;
      grades.free[ans.q] = ans.localRead.save || 'coming soon';
    } else if (ans.localChecklist) {
      grades.checklist[ans.q] = ans.localChecklist;
      grades.free[ans.q] = `${checkScore(ans.localChecklist)}/3`;
    } else if (isReadAloudScore(ans)) {
      const hasAudio = !!(ans.blob && ans.blob.size);
      grades.read[ans.q] = { status: hasAudio ? 'checking' : 'empty' };
      grades.free[ans.q] = hasAudio ? null : 'coming soon';
    } else if (ans.q === 3 || ans.q === 4 || ans.type === 'describe_picture') {
      const source = test && test.questions.find((item) => item.q === ans.q);
      const said = String(ans.transcript || '').trim();
      if (source && said) {
        const detail = scoreChecklist(source, said);
        grades.checklist[ans.q] = detail;
        ans.localChecklist = detail;
        grades.free[ans.q] = `${checkScore(detail)}/3`;
      } else {
        grades.free[ans.q] = await gradeFree(ans.q, ans.blob);
      }
    } else if (ans.q <= 4) {
      grades.free[ans.q] = await gradeFree(ans.q, ans.blob);
    }
  }
  if (attempt.answers.some((ans) => ans.q >= 5)) {
    grades.paid = await gradePaid(attempt);
  }
  state.review = {
    attempt,
    saved: null,
    grades,
    selection: state.selection,
    marks: {},
    markNote: '',
    marking: false
  };
  state.session = null;
  state.view = null;
  state.screen = 'review';
  state.dialog = false;
  state.micError = '';
  viewKey = '';
  presenting = false;
  render();
  if (attempt.answers.some((ans) => ans.q >= 5 && String(ans.transcript || '').trim())) askForMark();

  for (const ans of attempt.answers) {
    if (ans.localRead) continue;
    if (!isReadAloudScore(ans) || !(ans.blob && ans.blob.size)) continue;
    const source = test && test.questions.find((item) => item.q === ans.q);
    const detail = await gradeReadAloud((source && source.text) || '', ans.blob);
    grades.free[ans.q] = detail.save || 'coming soon';
    grades.read[ans.q] = detail;
    if (token === reviewToken && state.review && state.review.attempt === attempt && state.screen === 'review') {
      render();
    }
  }
  for (const ans of attempt.answers) {
    if (ans.q < 3 || !String(ans.transcript || '').trim()) continue;
    await fillPron(ans);
    const list = grades.checklist[ans.q];
    if (list) {
      blendChecklist(list, ans.pron);
      grades.free[ans.q] = `${checkScore(list)}/3`;
    }
    if (token === reviewToken && state.review && state.review.attempt === attempt && state.screen === 'review') render();
  }
  for (const ans of attempt.answers) {
    if (ans.q <= 4 && grades.free[ans.q] == null) grades.free[ans.q] = 'coming soon';
  }

  let saved = false;
  let scored = [];
  const pending = unsavedAnswers(attempt);
  if (owner && state.packStatus === 'ready' && (pending.length || (attempt.savedQs && attempt.savedQs.size))) {
    const run = saveChain.then(async () => {
      if (studentId() !== owner) return { saved: false, scored: [] };
      const pendingNow = unsavedAnswers(attempt);
      if (!pendingNow.length) return { saved: true, scored: [] };
      const subset = { ...attempt, answers: pendingNow };
      const gradesMap = gradeByQuestion(subset, grades);
      const applied = applyAttempt(state.pack, subset, gradesMap);
      let ok = false;
      try {
        const res = await saveProgressPack(packJson(applied.pack));
        ok = !!(res && res.ok);
      } catch (err) {
        ok = false;
      }
      if (studentId() !== owner) return { saved: false, scored: [] };
      if (ok) {
        state.pack = applied.pack;
        packEpoch += 1;
        for (const ans of pendingNow) attempt.savedQs.add(ans.q);
      }
      return { saved: ok, scored: applied.scored };
    }).catch(() => ({ saved: false, scored: [] }));
    saveChain = run.then(() => {});
    const result = await run;
    saved = result.saved;
    scored = result.scored;
  }
  if (!pending.length && attempt.savedQs && attempt.savedQs.size) saved = true;
  if (token === reviewToken && state.review && state.review.attempt === attempt) {
    state.review.saved = saved;
    if (state.screen === 'review') render();
  } else if (saved && (state.screen === 'home' || state.screen === 'practice')) {
    render();
  }
  if (scored.length && owner === studentId()) {
    reportScoredItems(scored, {
      testTitle: attempt.testTitle,
      testId: attempt.testId,
      mode: attempt.mode
    }).catch(() => {});
  }
}

function dialogFragment() {
  return state.dialog ? dialogHtml() : '';
}

function openExam() {
  if (state.packStatus !== 'ready') return;
  stopPlayback();
  stopNarration();
  releaseMic();
  state.sessionOwner = studentId();
  state.selection = { mode: 'exam' };
  state.session = null;
  state.view = null;
  state.review = null;
  state.classFeedback = null;
  state.micError = '';
  state.micBlob = null;
  state.micRecording = false;
  state.micLevel = 0;
  state.playingMic = false;
  state.examStage = 'mic';
  state.dialog = false;
  state.screen = 'exam';
  viewKey = '';
  render();
}

async function examRecord() {
  if (state.micRecording) return;
  stopPlayback();
  state.micRecording = true;
  state.micError = '';
  state.playingMic = false;
  render();
  try {
    await beginArm();
    const stream = activeStream();
    if (!stream) {
      const err = new Error('mic');
      err.code = 'no-mic';
      throw err;
    }
    const audio = getAudioContext();
    if (audio) await audio.resume().catch(() => {});
    stopMeter();
    stopMeter = openLevelMeter(stream, (level) => {
      state.micLevel = level;
      const fill = document.getElementById('mic-meter');
      const wrap = document.getElementById('mic-meter-wrap');
      if (fill) fill.style.width = `${Math.round(level * 100)}%`;
      if (wrap) wrap.setAttribute('aria-valuenow', String(Math.round(level * 100)));
    });
    const rec = startRecorder(stream);
    await new Promise((resolve) => {
      const timer = startCountdown(3, () => {});
      timer.done.then(resolve);
    });
    const recorded = await rec.stop();
    state.micBlob = recorded && recorded.blob && recorded.blob.size ? recorded.blob : null;
    if (!state.micBlob) state.micError = t('run.micMissing');
  } catch (err) {
    state.micBlob = null;
    state.micError = micMessage(err);
  } finally {
    stopMeter();
    stopMeter = () => {};
    state.micRecording = false;
    if (state.screen === 'exam') render({ focus: state.micError ? 'mic-error' : 'step-title' });
  }
}

function examPlayback() {
  if (!state.micBlob || !state.micBlob.size) return;
  if (state.playingMic) {
    stopPlayback();
    render();
    return;
  }
  stopPlayback();
  audioUrl = URL.createObjectURL(state.micBlob);
  audioEl = new Audio(audioUrl);
  audioEl.setAttribute('playsinline', '');
  state.playingMic = true;
  audioEl.onended = () => {
    state.playingMic = false;
    stopPlayback();
    if (state.screen === 'exam') render();
  };
  render();
  audioEl.play().catch(() => {
    state.playingMic = false;
    stopPlayback();
    render();
  });
}

async function examStart() {
  if (state.arming || !state.micBlob) return;
  const test = currentTest();
  if (!test) return;
  state.arming = true;
  state.micError = '';
  const button = document.querySelector('[data-action="exam-start"]');
  if (button) button.disabled = true;
  try {
    await prepareNarration();
    if (!hasStream()) await beginArm();
    const audio = getAudioContext();
    if (audio) await audio.resume().catch(() => {});
    if (!activeStream()) {
      state.micError = t('run.micMissing');
      state.examStage = 'mic';
      state.arming = false;
      render({ focus: 'mic-error' });
      return;
    }
    const plan = buildPlan(test, { mode: 'full' });
    state.sessionOwner = studentId();
    state.selection = { mode: 'exam' };
    viewKey = '';
    state.examStage = 'run';
    state.screen = 'exam';
    state.session = createExamRun({
      test,
      plan,
      onView: handleExamView
    });
    state.arming = false;
    state.session.begin();
  } catch (err) {
    state.arming = false;
    state.micError = micMessage(err);
    state.examStage = 'mic';
    render({ focus: 'mic-error' });
  }
}

function handleExamView(view) {
  state.view = view;
  if (view.status === 'done') {
    presentReview(view.attempt);
    return;
  }
  const key = [
    view.status,
    view.stepIndex,
    view.phase,
    view.showQuestionText ? 1 : 0,
    view.script || '',
    view.twice ? 1 : 0
  ].join('|');
  const structural = key !== viewKey;
  viewKey = key;
  if (structural || state.screen !== 'exam') render({ focus: 'step-title' });
  else updateExamClock(view);
}

function openClass() {
  if (state.packStatus !== 'ready') return;
  stopPlayback();
  releaseMic();
  state.session = null;
  state.view = null;
  state.review = null;
  state.classFeedback = null;
  state.micError = '';
  state.screen = 'class';
  render();
}

function startClass(selection) {
  const test = currentTest();
  if (!test || state.packStatus !== 'ready') return;
  stopPlayback();
  stopNarration();
  releaseMic();
  const plan = buildPlan(test, {
    mode: 'practice',
    scope: selection.scope,
    q: selection.q,
    part: selection.part
  });
  if (!plan.some((step) => step.kind === 'question')) return;
  state.sessionOwner = studentId();
  state.selection = { mode: 'class', scope: selection.scope, q: selection.q, part: selection.part };
  state.micError = '';
  state.dialog = false;
  state.review = null;
  state.classFeedback = null;
  viewKey = '';
  classToken += 1;
  state.session = createClassRun({
    test,
    plan,
    onView: handleClassView
  });
  state.screen = 'class-run';
  state.session.begin();
}

function handleClassView(view) {
  state.view = view;
  if (view.status === 'done') {
    presentReview(view.attempt);
    return;
  }
  if (view.status === 'feedback') {
    viewKey = `feedback|${view.stepIndex}`;
    gradeClassAnswer(view);
    return;
  }
  const key = `${view.status}|${view.stepIndex}|${view.phase}`;
  const structural = key !== viewKey;
  viewKey = key;
  if (structural || state.screen !== 'class-run') render({ focus: 'step-title' });
  else updateClassClock(view);
}

async function gradeClassAnswer(view) {
  const ans = view.answer;
  const attempt = view.attempt;
  if (!ans || !attempt) return;
  const token = ++classToken;
  const test = state.catalog.find((item) => item.id === attempt.testId);
  const grades = { free: {}, paid: null, read: {}, checklist: {} };
  const source = test && test.questions.find((item) => item.q === ans.q);
  if (ans.q >= 3 && !String(ans.transcript || '').trim()) {
    try { await fillTranscript(ans); } catch (err) { /* keep going */ }
    if (token !== classToken) return;
  }
  if (isReadAloudScore(ans)) {
    grades.read[ans.q] = { status: ans.blob && ans.blob.size ? 'checking' : 'empty' };
    grades.free[ans.q] = ans.blob && ans.blob.size ? null : 'coming soon';
  } else if (ans.q === 3 || ans.q === 4 || ans.type === 'describe_picture') {
    const said = String(ans.transcript || '').trim();
    if (source && said) {
      const detail = scoreChecklist(source, said);
      grades.checklist[ans.q] = detail;
      ans.localChecklist = detail;
      grades.free[ans.q] = `${checkScore(detail)}/3`;
    } else {
      grades.free[ans.q] = 'coming soon';
    }
  } else if (ans.q <= 4) {
    grades.free[ans.q] = 'coming soon';
  } else {
    grades.paid = 'coming soon';
  }
  state.classFeedback = { answer: ans, grades, source, marks: {}, markNote: '', marking: false, markTried: false };
  if (state.screen === 'class-run') render({ focus: 'step-title' });
  if (ans.q >= 5 && String(ans.transcript || '').trim()) askForMark();
  if (isReadAloudScore(ans) && ans.blob && ans.blob.size) {
    const detail = await gradeReadAloud((source && source.text) || '', ans.blob);
    if (token !== classToken) return;
    ans.localRead = detail;
    grades.read[ans.q] = detail;
    grades.free[ans.q] = detail.save || 'coming soon';
    if (state.screen === 'class-run') render();
  }
  if (token !== classToken) return;
  if (ans.q >= 3 && String(ans.transcript || '').trim()) {
    await fillPron(ans);
    if (token !== classToken) return;
    const list = grades.checklist[ans.q];
    if (list) {
      blendChecklist(list, ans.pron);
      grades.free[ans.q] = `${checkScore(list)}/3`;
    }
    if (state.screen === 'class-run') render();
  }
  await commitClassGrade(attempt, grades, ans);
}

async function commitClassGrade(attempt, grades, ans) {
  const owner = state.sessionOwner || studentId();
  if (!owner || state.packStatus !== 'ready') return;
  if (attempt.savedQs && attempt.savedQs.has(ans.q)) return;
  const subset = { ...attempt, id: `${attempt.id}:${ans.q}`, answers: [ans], complete: false };
  const gradesMap = gradeByQuestion(subset, grades);
  const run = saveChain.then(async () => {
    if (studentId() !== owner) return;
    const applied = applyAttempt(state.pack, subset, gradesMap);
    let ok = false;
    try {
      const res = await saveProgressPack(packJson(applied.pack));
      ok = !!(res && res.ok);
    } catch (err) {
      ok = false;
    }
    if (!ok || studentId() !== owner) return;
    state.pack = applied.pack;
    packEpoch += 1;
    if (!attempt.savedQs) attempt.savedQs = new Set();
    attempt.savedQs.add(ans.q);
    await reportScoredItems(applied.scored, {
      testTitle: attempt.testTitle,
      testId: attempt.testId,
      mode: attempt.mode
    });
  }).catch(() => {});
  saveChain = run.then(() => {});
  await run;
}

async function classContinue() {
  if (!state.session) return;
  if (!hasStream()) {
    state.arming = true;
    const button = document.querySelector('[data-action="class-continue"]');
    if (button) button.disabled = true;
    try {
      await beginArm();
    } catch (err) {
      state.arming = false;
      state.micError = micMessage(err);
      render({ focus: 'mic-error' });
      return;
    }
    state.arming = false;
    if (!activeStream()) {
      state.micError = t('run.micMissing');
      render({ focus: 'mic-error' });
      return;
    }
  }
  state.micError = '';
  state.session.continue();
}

async function classDone() {
  if (!state.session || !state.view || state.view.phase === 'saving' || state.view.phase === 'feedback') return;
  const button = document.querySelector('[data-action="class-done"]');
  if (button) button.disabled = true;
  if (!hasStream()) {
    try {
      await beginArm();
    } catch (err) {
      state.micError = micMessage(err);
      render({ focus: 'mic-error' });
      return;
    }
  }
  await state.session.done();
}

function classHear() {
  const step = state.view && state.view.step;
  const q = step && step.question;
  const test = currentTest();
  if (!q || !test) return;
  prepareNarration().then(() => playNarration(questionClipId(test.id, q.q)));
}

function handleView(view) {
  state.view = view;
  if (view.status === 'done') {
    presentReview(view.attempt);
    return;
  }
  const key = `${view.status}|${view.stepIndex}|${view.phase}`;
  const structural = key !== viewKey;
  viewKey = key;
  if (structural) render({ focus: 'step-title' });
  else updateTimer(view);
  maybeAnnounce(view, structural);
}

function startSession(selection) {
  const test = currentTest();
  if (!test || state.packStatus !== 'ready') return;
  stopPlayback();
  releaseMic();
  state.sessionOwner = studentId();
  const plan = buildPlan(test, selection);
  if (!plan.some((step) => step.kind === 'question')) return;
  state.selection = selection;
  state.micError = '';
  state.arming = false;
  state.dialog = false;
  state.review = null;
  viewKey = '';
  presenting = false;
  state.session = createSession({
    test,
    plan,
    mode: selection.mode,
    onView: handleView
  });
  state.screen = 'session';
  state.session.begin();
}

function stopSpeak() {
  if (!state.session || !state.view || state.view.phase !== 'speak') return;
  const button = document.querySelector('[data-action="stop-speak"]');
  if (button) button.disabled = true;
  confirmEnd();
}

function onBegin() {
  if (state.arming || !state.session) return;
  state.micError = '';
  const needMic = !hasStream();
  let arm = Promise.resolve();
  if (needMic) {
    state.arming = true;
    arm = beginArm();
    const button = document.querySelector('[data-action="begin"]');
    if (button) {
      button.disabled = true;
      button.textContent = t('home.loading');
    }
  }
  arm.then(() => {
    state.arming = false;
    if (!activeStream() && needMic) {
      state.micError = t('run.micMissing');
      render({ focus: 'mic-error' });
      return;
    }
    state.session.continue();
  }).catch((err) => {
    state.arming = false;
    state.micError = micMessage(err);
    render({ focus: 'mic-error' });
  });
}

async function confirmEnd() {
  state.dialog = false;
  const session = state.session;
  if (!session) {
    goHome();
    return;
  }
  const attempt = await session.end();
  releaseMic();
  if (!attempt.answers.length) {
    state.session = null;
    state.view = null;
    state.screen = 'home';
    viewKey = '';
    render();
    return;
  }
  await presentReview(attempt);
}

function togglePlay(qNumber) {
  const q = Number(qNumber);
  if (state.playingQ === q) {
    stopPlayback();
    render();
    return;
  }
  stopPlayback();
  let ans = state.review && state.review.attempt.answers.find((item) => item.q === q);
  if (!ans && state.classFeedback && state.classFeedback.answer && state.classFeedback.answer.q === q) ans = state.classFeedback.answer;
  if (!ans || !ans.blob || !ans.blob.size) return;
  audioUrl = URL.createObjectURL(ans.blob);
  audioEl = new Audio(audioUrl);
  audioEl.setAttribute('playsinline', '');
  audioEl.preload = 'auto';
  state.playingQ = q;
  audioEl.onended = () => {
    stopPlayback();
    render();
  };
  render();
  audioEl.play().catch(() => {
    stopPlayback();
    render();
  });
}

async function setLang(id) {
  if (!LANGS.some((lang) => lang.id === id)) return;
  state.lang = id;
  try { localStorage.setItem('app.lang', id); } catch (err) { /* ignore */ }
  try {
    await loadLanguage(id);
  } catch (err) {
    state.dict = state.en;
  }
  applyDocumentChrome();
  render();
  if (state.screen === 'session' && state.view) updateTimer(state.view);
}

function onClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'exam') openExam();
  else if (action === 'class') openClass();
  else if (action === 'exam-record') examRecord();
  else if (action === 'exam-playback') examPlayback();
  else if (action === 'exam-intro') {
    if (state.micBlob) {
      state.examStage = 'intro';
      state.micError = '';
      render();
    }
  }
  else if (action === 'exam-start') examStart();
  else if (action === 'class-q') startClass({ scope: 'question', q: Number(button.dataset.q) });
  else if (action === 'class-part') startClass({ scope: 'part', part: button.dataset.part });
  else if (action === 'class-continue') classContinue();
  else if (action === 'class-done') classDone();
  else if (action === 'class-hear') classHear();
  else if (action === 'class-next' && state.session) state.session.next();
  else if (action === 'practice') openClass();
  else if (action === 'try-untimed') startClass({ scope: 'question', q: Number(button.dataset.q) });
  else if (action === 'try-timed') startSession({ mode: 'practice', scope: 'question', q: Number(button.dataset.q) });
  else if (action === 'home' || action === 'back') goHome();
  else if (action === 'practice-q') {
    startSession({ mode: 'practice', scope: 'question', q: Number(button.dataset.q) });
  } else if (action === 'practice-part') {
    startSession({ mode: 'practice', scope: 'part', part: button.dataset.part });
  } else if (action === 'begin') onBegin();
  else if (action === 'stop-speak') stopSpeak();
  else if (action === 'ask-end') {
    state.dialog = true;
    render();
  } else if (action === 'cancel-end') {
    state.dialog = false;
    render();
  } else if (action === 'confirm-end') confirmEnd();
  else if (action === 'play') togglePlay(button.dataset.q);
  else if (action === 'retry' && state.review) {
    const sel = state.review.selection;
    if (sel && sel.mode === 'class') startClass(sel);
    else startSession(sel);
  }
  else if (action === 'mark') askForMark();
  else if (action === 'voice-preview') previewVoice();
  else if (action === 'reload') boot();
  else if (action === 'reload-progress') {
    const id = studentId() || state.studentId;
    if (id) hydrate(id);
  }
}

function markMessage(error) {
  if (error === 'not_deployed') return t('review.notDeployed');
  if (error === 'sign_in') return t('review.signIn');
  if (error === 'no_transcript') return t('review.noTranscript');
  if (error === 'student_cap') return t('review.studentCap');
  if (error === 'slow_down') return t('review.slowDown');
  if (error === 'daily_cap') return t('review.dailyCap');
  return t('review.markFailed');
}

async function askForMark() {
  const review = state.review || state.classFeedback;
  if (!review || review.marking) return;
  const liveAttempt = (state.view && state.view.attempt) || (state.review && state.review.attempt);
  const attempt = state.review
    ? state.review.attempt
    : {
      testId: liveAttempt && liveAttempt.testId,
      testTitle: liveAttempt && liveAttempt.testTitle,
      id: liveAttempt && liveAttempt.id,
      mode: 'class',
      answers: review.answer ? [review.answer] : []
    };
  if (!attempt || !attempt.testId || !attempt.answers || !attempt.answers.length) return;
  if (!workerUrl()) {
    review.markNote = t('review.notDeployed');
    render();
    return;
  }
  review.marking = true;
  review.markNote = '';
  render();
  let result;
  try {
    await saveChain;
    try { await fillTranscripts(attempt.answers); } catch (err) { /* keep going */ }
    result = await requestAiMark(attempt);
  } catch (err) {
    result = { ok: false, error: 'grade_failed' };
  }
  if (state.review && state.review !== review) return;
  if (!state.review && state.classFeedback !== review) return;
  review.marking = false;
  if (!result || !result.ok) {
    const code = result && result.error;
    review.markNote = code === 'sign_in' && review.markTried
      ? t('review.signInAgain')
      : markMessage(code);
    review.markTried = true;
    render();
    return;
  }
  review.markTried = true;
  const marks = {};
  for (const row of result.grade.questions || []) marks[row.q] = row;
  review.marks = marks;
  review.markNote = '';
  render();
  if (liveAttempt) storeMarks(liveAttempt, Object.values(marks)).catch(() => {});
}

async function storeMarks(attempt, marks) {
  const byQ = {};
  for (const ans of (attempt.answers || [])) byQ[ans.q] = ans;
  await Promise.all((marks || []).map((row) => fillPron(byQ[Number(row && row.q)])));
  const rows = (marks || []).filter((row) => row && Number(row.q) >= 5).map((row) => ({
    q: Number(row.q),
    testId: attempt.testId,
    type: ((attempt.answers || []).find((ans) => ans.q === Number(row.q)) || {}).type || '',
    score: blendScore(Number(row.band != null ? row.band : row.scoreValue) || 0,
      Number(row.scoreMax) || (Number(row.q) === 11 ? 5 : 3), (byQ[Number(row.q)] || {}).pron),
    total: Number(row.scoreMax) || (Number(row.q) === 11 ? 5 : 3)
  }));
  if (!rows.length || !attempt.testId) return;
  const owner = state.sessionOwner || studentId();
  if (!owner || state.packStatus !== 'ready') return;
  const run = saveChain.then(async () => {
    if (studentId() !== owner) return;
    let pack = state.pack;
    try {
      const loaded = await loadProgressPack();
      if (loaded && loaded.ok) pack = parsePack(loaded.progress_json);
    } catch (err) { /* keep the pack already on screen */ }
    if (attempt.mode === 'class') {
      for (const row of rows) {
        pack = applyMarkScores(pack, `${attempt.id}:${row.q}`, [row]).pack;
      }
    } else {
      pack = applyMarkScores(pack, attempt.id, rows).pack;
    }
    const res = await saveProgressPack(packJson(pack));
    if (res && res.ok && studentId() === owner) {
      state.pack = pack;
      packEpoch += 1;
      if (state.screen === 'review' || state.screen === 'home') render();
    }
    if (studentId() !== owner) return;
    await reportScoredItems(rows.map((row) => ({
      item: `${row.testId}:${row.q}`,
      q: row.q,
      type: row.type,
      score: row.score,
      total: row.total
    })), {
      testTitle: attempt.testTitle,
      testId: attempt.testId,
      mode: attempt.mode
    });
  }).catch(() => {});
  saveChain = run.then(() => {});
  await run;
}

function onChange(event) {
  if (event.target.id === 'lang' || event.target.hasAttribute('data-lang-select')) setLang(event.target.value);
  if (event.target.id === 'voice-select') chooseVoice(event.target.value);
  if (event.target.id === 'test-select') {
    state.testId = event.target.value;
    render();
  }
}

function onLeave(event) {
  if (state.screen === 'session' || state.screen === 'exam' || state.screen === 'class-run') {
    event.preventDefault();
    event.returnValue = '';
  }
}

function markSvg() {
  return `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="1.6"></circle><rect x="8" y="13" width="2.2" height="6" rx="1"></rect><rect x="12" y="10" width="2.2" height="12" rx="1"></rect><rect x="16" y="7" width="2.2" height="18" rx="1"></rect><rect x="20" y="11" width="2.2" height="10" rx="1"></rect></svg>`;
}

function shell(main, { showEnd = false } = {}) {
  const options = LANGS.map((lang) => {
    const selected = lang.id === state.lang ? ' selected' : '';
    return `<option value="${escapeHtml(lang.id)}"${selected}>${escapeHtml(lang.label)}</option>`;
  }).join('');
  const live = state.screen === 'session' && state.view && state.view.phase === 'speak' ? ' is-live' : '';
  const end = showEnd
    ? `<button type="button" class="text-btn" data-action="ask-end">${escapeHtml(t('run.end'))}</button>`
    : '';
  const dialog = state.dialog ? dialogHtml() : '';
  return `
    <div class="shell${live}">
      <header class="top">
        <div class="brand">${markSvg()}<span>${escapeHtml(t('appName'))}</span></div>
        <div class="top-actions">
          ${end}
          <label class="lang-label">
            <span class="sr-only">${escapeHtml(t('common.language'))}</span>
            <select id="lang" aria-label="${escapeHtml(t('common.language'))}">${options}</select>
          </label>
        </div>
      </header>
      <main id="main" tabindex="-1">${main}</main>
      ${dialog}
      <p id="live" class="sr-only" aria-live="polite"></p>
    </div>`;
}

function dialogHtml() {
  return `
    <dialog id="confirm" aria-labelledby="leave-title">
      <h2 id="leave-title">${escapeHtml(t('run.leaveTitle'))}</h2>
      <p>${escapeHtml(t('run.leaveBody'))}</p>
      <div class="dialog-actions">
        <button type="button" class="btn secondary" data-action="cancel-end">${escapeHtml(t('run.leaveNo'))}</button>
        <button type="button" class="btn danger" data-action="confirm-end">${escapeHtml(t('run.leaveYes'))}</button>
      </div>
    </dialog>`;
}

function legalHtml() {
  return `<p class="disclaimer">${escapeHtml(t('home.tagline'))} ${escapeHtml(t('home.disclaimer'))}</p>`;
}

function langOptions() {
  return LANGS.map((lang) => {
    const selected = lang.id === state.lang ? ' selected' : '';
    return `<option value="${escapeHtml(lang.id)}"${selected}>${escapeHtml(lang.label)}</option>`;
  }).join('');
}

/** Small language picker for screens with their own header (exam) or the sign-in overlay. */
function langMini(extraClass = '') {
  return `<label class="lang-mini ${extraClass}"><span aria-hidden="true">🌐</span><span class="sr-only">${escapeHtml(t('common.language'))}</span><select data-lang-select aria-label="${escapeHtml(t('common.language'))}">${langOptions()}</select></label>`;
}

function syncLangFloat() {
  let node = document.getElementById('lang-float');
  if (!node) {
    node = document.createElement('div');
    node.id = 'lang-float';
    document.body.appendChild(node);
  }
  const signedIn = !!studentId() && state.packStatus === 'ready';
  node.hidden = signedIn || !state.en;
  if (!node.hidden) node.innerHTML = langMini('float');
}

function tipFor(type) {
  const key = `tips.${type}`;
  const text = t(key);
  return text && text !== key ? text : '';
}

function renderHome() {
  const test = currentTest();
  if (!test) {
    return shell(`<h1>${escapeHtml(t('home.noTests'))}</h1>`);
  }
  const options = state.catalog.map((item) => {
    const selected = item.id === test.id ? ' selected' : '';
    return `<option value="${escapeHtml(item.id)}"${selected}>${escapeHtml(item.title)}</option>`;
  }).join('');
  return shell(`
    <h1 class="home-title">${escapeHtml(t('appName'))}</h1>
    <label class="field lang-big">
      <span>🌐 ${escapeHtml(t('common.language'))}</span>
      <select data-lang-select>${langOptions()}</select>
    </label>
    <div class="home-fields">
      <label class="field">
        <span>${escapeHtml(t('home.chooseTest'))}</span>
        <select id="test-select" lang="en" dir="ltr">${options}</select>
      </label>
      ${voiceHtml()}
    </div>
    <div class="mode-pick">
      <button type="button" class="btn primary mode-btn" data-action="exam"><strong>${escapeHtml(t('home.fullExam'))}</strong><small>${escapeHtml(t('home.fullExamLine'))}</small></button>
      <button type="button" class="btn primary mode-btn alt" data-action="practice"><strong>${escapeHtml(t('home.practiceMode'))}</strong><small>${escapeHtml(t('home.practiceLine'))}</small></button>
    </div>
    ${cloudHtml(test)}
    <div class="legal">${legalHtml()}</div>
  `);
}

function voiceHtml() {
  const current = getNarrationVoice();
  const opts = [MIXED_VOICE, ...VOICE_KEYS].map((key) => {
    const selected = key === current ? ' selected' : '';
    return `<option value="${escapeHtml(key)}"${selected}>${escapeHtml(t(`voice.${key}`))}</option>`;
  }).join('');
  return `
    <label class="field">
      <span>${escapeHtml(t('home.chooseVoice'))}</span>
      <select id="voice-select">${opts}</select>
    </label>
    <button type="button" class="btn secondary" data-action="voice-preview">🔊 ${escapeHtml(t('home.hearVoice'))}</button>`;
}

async function previewVoice() {
  stopNarration();
  try { await prepareNarration(); } catch (err) { return; }
  playNarration('cue.begin_preparing');
}

function chooseVoice(key) {
  const next = normalizeVoice(key);
  setNarrationVoice(next);
  previewVoice();
  if (state.pack) state.pack.voice = next;
  const owner = studentId();
  if (!owner || state.packStatus !== 'ready') return;
  const run = saveChain.then(async () => {
    if (studentId() !== owner) return;
    let pack = state.pack;
    try {
      const loaded = await loadProgressPack();
      if (loaded && loaded.ok) pack = parsePack(loaded.progress_json);
    } catch (err) { /* keep the pack already on screen */ }
    pack.voice = next;
    const res = await saveProgressPack(packJson(pack));
    if (res && res.ok && studentId() === owner) {
      state.pack = pack;
      packEpoch += 1;
    }
  }).catch(() => {});
  saveChain = run.then(() => {});
}

function savedLabel(row, q) {
  if (row.graded) return t('home.savedItem', { n: q, score: row.score, total: row.total });
  return t('home.savedDone', { n: q });
}

function cloudHtml(test) {
  const rows = questionsForTest(state.pack, test.id);
  const count = t('home.savedCount', { done: rows.length, total: test.questions.length });
  const list = rows.length
    ? `<ul>${rows.map((row) => `<li data-saved-q="${row.q}">${escapeHtml(savedLabel(row, row.q))}</li>`).join('')}</ul>`
    : `<p>${escapeHtml(t('home.savedNone'))}</p>`;
  return `
    <details class="cloud" id="saved-progress">
      <summary><span id="saved-title">${escapeHtml(t('home.savedTitle'))}: ${escapeHtml(count)}</span> <span class="details-link">${escapeHtml(t('home.details'))}</span></summary>
      ${list}
    </details>`;
}

function renderAccount() {
  const body = state.packStatus === 'error'
    ? `<p class="alert" role="alert">${escapeHtml(t('account.error'))}</p>
       <button type="button" class="btn primary" data-action="reload-progress">${escapeHtml(t('common.retry'))}</button>`
    : `<p>${escapeHtml(t('account.loading'))}</p>`;
  return shell(`
    <h1>${escapeHtml(t('appName'))}</h1>
    <div class="legal">${legalHtml()}</div>
    ${body}
  `);
}

function directionsHtml(step) {
  const part = step.part;
  const questions = step.questions || [];
  const oneKey = `parts.${part}.directionsOne`;
  const hasOne = lookup(state.dict, oneKey) || lookup(state.en, oneKey);
  const dir = questions.length === 1 && hasOne ? t(oneKey) : t(`parts.${part}.directions`);
  const lines = questions.map((q) => `<li>${escapeHtml(t('run.timeLine', {
    n: q.q,
    prep: q.prep_sec,
    speak: q.speak_sec
  }))}</li>`).join('');
  let extra = '';
  if (part === 'info_questions') {
    const sec = readSeconds(questions[0] || {});
    extra += `<p>${escapeHtml(t('run.readTime', { n: sec }))}</p>`;
  }
  if (part === 'respond_questions' && questions[0] && questions[0].set_intro) {
    extra += `<section class="context" lang="en" dir="ltr"><h2>${escapeHtml(t('run.scenario'))}</h2><p>${escapeHtml(questions[0].set_intro)}</p></section>`;
  }
  if (part === 'info_questions' && questions[0] && questions[0].caller_intro) {
    extra += `<section class="context" lang="en" dir="ltr"><h2>${escapeHtml(t('run.caller'))}</h2><p>${escapeHtml(questions[0].caller_intro)}</p></section>`;
  }
  const mic = state.micError
    ? `<p id="mic-error" class="alert" role="alert" tabindex="-1">${escapeHtml(state.micError)}</p>`
    : '';
  return `
    <h1 id="step-title" tabindex="-1">${escapeHtml(t(`parts.${part}.title`))}</h1>
    <p class="directions">${escapeHtml(dir)}</p>
    <ul class="times">${lines}</ul>
    ${extra}
    ${mic}
    <button type="button" class="btn primary dock" data-action="begin" ${state.arming ? 'disabled' : ''}>${escapeHtml(t('run.start'))}</button>
  `;
}

function timerBlock(view, hint, compact, extraClass = '') {
  const secs = secsLeft(view.remaining);
  const ratio = view.total > 0 ? Math.max(0, Math.min(1, view.remaining / view.total)) : 0;
  const offset = (RING * (1 - ratio)).toFixed(2);
  const label = phaseLabel(view.phase);
  const urgent = secs > 0 && secs <= 5 ? ' is-urgent' : '';
  const rec = view.phase === 'speak'
    ? `<p class="rec"><span class="dot" aria-hidden="true"></span>${escapeHtml(t('run.recording'))}</p>`
    : '';
  // Timed practice and the full exam end on the clock, as on the real test. No Stop button.
  const stop = '';
  return `
    <div class="timer-wrap phase-${escapeHtml(view.phase)}${compact ? ' compact' : ''}${extraClass ? ` ${extraClass}` : ''}">
      <div class="timer-face" role="timer" aria-label="${escapeHtml(t('a11y.timer', { phase: label, n: secs }))}">
        <svg class="ring-svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ring-track" cx="60" cy="60" r="52"></circle>
          <circle id="time-ring" class="ring-value" cx="60" cy="60" r="52" transform="rotate(-90 60 60)" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <div class="timer-center">
          <p id="phase-label" class="phase">${escapeHtml(label)}</p>
          <p id="time-num" class="time-num${urgent}">${secs}</p>
        </div>
      </div>
      ${rec}
      <p class="hint">${escapeHtml(hint)}</p>
      ${stop}
    </div>`;
}

function progressHtml() {
  const plan = (state.session && state.session.plan) || [];
  const questions = plan.filter((step) => step.kind === 'question');
  const total = questions.length || 1;
  const step = state.view && state.view.step;
  let index = 1;
  let current = null;
  if (step && step.kind === 'question') {
    index = step.index || 1;
    current = step.question.q;
  } else if (step && step.kind === 'read_document') {
    const match = questions.find((item) => item.question.q === step.question.q);
    index = match ? match.index : 1;
    current = step.question.q;
  }
  const done = new Set((state.view.attempt.answers || []).map((ans) => ans.q));
  const pips = questions.map((item) => {
    const cls = [
      'pip',
      item.question.q === current ? 'on' : '',
      done.has(item.question.q) ? 'done' : ''
    ].filter(Boolean).join(' ');
    return `<span class="${cls}"></span>`;
  }).join('');
  const label = t('a11y.progress', { index, total });
  return `
    <div class="progress">
      <p>${escapeHtml(label)}</p>
      <div class="pips" role="img" aria-label="${escapeHtml(label)}">${pips}</div>
    </div>`;
}

function placeholderMarkup(label) {
  return `
    <div class="frame is-missing" role="img" aria-label="${escapeHtml(label)}">
      <svg viewBox="0 0 80 64" aria-hidden="true">
        <rect x="2" y="2" width="76" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="2"></rect>
        <circle cx="24" cy="22" r="5"></circle>
        <path d="M8 52 L28 34 L42 46 L54 32 L72 52" fill="none" stroke="currentColor" stroke-width="2"></path>
      </svg>
      <p>${escapeHtml(t('run.imageMissing'))}</p>
    </div>`;
}

function questionBody(q) {
  if (q.type === 'read_aloud') {
    return `<article class="passage" lang="en" dir="ltr"><p>${escapeHtml(q.text || '')}</p></article>`;
  }
  if (q.type === 'describe_picture') {
    const label = t('run.pictureAlt', { n: q.q });
    if (!q.image) return placeholderMarkup(label);
    const src = new URL(q.image, document.baseURI).href;
    return `<div class="frame" data-frame><img class="scene" alt="${escapeHtml(label)}" src="${escapeHtml(src)}"></div>`;
  }
  if (q.type === 'respond_questions') {
    return `
      <section class="context" lang="en" dir="ltr"><h2>${escapeHtml(t('run.scenario'))}</h2><p>${escapeHtml(q.set_intro || '')}</p></section>
      <p class="ask" lang="en" dir="ltr">${escapeHtml(q.question || '')}</p>`;
  }
  if (q.type === 'info_questions') {
    return `
      <section class="context" lang="en" dir="ltr"><h2>${escapeHtml(t('run.caller'))}</h2><p>${escapeHtml(q.caller_intro || '')}</p></section>
      <p class="ask" lang="en" dir="ltr">${escapeHtml(q.question || '')}</p>
      ${renderDocument(q.document)}`;
  }
  return `<p class="ask" lang="en" dir="ltr">${escapeHtml(q.question || '')}</p>`;
}

function renderSession() {
  const view = state.view;
  const step = view && view.step;
  if (!step || step.kind === 'directions') {
    return shell(directionsHtml(step || { part: 'read_aloud', questions: [] }), { showEnd: true });
  }
  if (step.kind === 'read_document') {
    return shell(`
      ${progressHtml()}
      <h1 id="step-title" tabindex="-1">${escapeHtml(t('run.reading'))}</h1>
      ${timerBlock(view, t('run.readEnds'), false)}
      ${renderDocument(step.question.document)}
    `, { showEnd: true });
  }
  const q = step.question;
  const picture = q.type === 'describe_picture';
  const compact = picture || q.type === 'info_questions' || q.type === 'respond_questions';
  const hint = view.phase === 'speak' ? t('run.auto') : (view.phase === 'prepare' ? t('run.tone') : '');
  const body = questionBody(q);
  const timer = timerBlock(view, hint, compact, picture ? 'beside-picture' : '');
  return shell(`
    ${progressHtml()}
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('run.qLabel', { n: q.q }))}</h1>
    <p class="part-name">${escapeHtml(t(`parts.${q.type}.title`))}</p>
    ${picture ? body : ''}
    ${timer}
    ${picture ? '' : body}
    <p class="no-pause">${escapeHtml(t('run.noPause'))}</p>
  `, { showEnd: true });
}

function starMarks(n) {
  let html = '';
  for (let i = 1; i <= 5; i += 1) {
    html += `<span class="${i <= n ? 'on' : 'off'}">${i <= n ? '★' : '☆'}</span>`;
  }
  return html;
}

function readAloudScoreHtml(detail) {
  const name = t('review.deviceScore');
  if (!detail || detail.status === 'checking') {
    return `<p class="score checking" role="status">${escapeHtml(name)}: ${escapeHtml(t('review.checking'))}</p>`;
  }
  if (detail.status === 'again') {
    return `<p class="alert" role="status">${escapeHtml(t('review.sayAgain'))}</p>`;
  }
  if (detail.status === 'failed') {
    return `<p class="score">${escapeHtml(t('review.checkFailed'))}</p>`;
  }
  if (detail.status !== 'scored') return '';
  const n = detail.stars;
  const label = t('review.stars', { n });
  const lineBand = detail.band === 'yellow' || detail.band === 'red' ? detail.band : 'green';
  const words = (detail.words || []).map((word) => {
    const band = word.band === 'yellow' || word.band === 'red' ? word.band : 'green';
    if (band === 'red') return `<mark class="weak band-red">${escapeHtml(word.word)}</mark>`;
    return `<span class="band-${band}">${escapeHtml(word.word)}</span>`;
  }).join(' ');
  const weak = (detail.words || []).filter((word) => word.weak).map((word) => word.word);
  const weakLine = weak.length
    ? `<p class="weak-list">${escapeHtml(t('review.weak'))}: ${escapeHtml(weak.join(', '))}</p>`
    : '';
  return `
    <p class="score stars line-${lineBand}" role="img" aria-label="${escapeHtml(label)}">
      <span class="score-name">${escapeHtml(name)}</span>
      <span class="star-row" aria-hidden="true">${starMarks(n)}</span>
      <span class="line-band band-${lineBand}">${n}/5</span>
    </p>
    <p class="marked-line" lang="en" dir="ltr">${words}</p>
    ${weakLine}`;
}

function liveRows(attempt, grades, marks) {
  return (attempt.answers || []).map((ans) => {
    const read = grades.read && grades.read[ans.q];
    if (read && (read.status === 'scored' || read.status === 'again')) {
      return { q: ans.q, score: Number(read.stars) || 0, total: 5, graded: true };
    }
    const list = grades.checklist && grades.checklist[ans.q];
    if (list) return { q: ans.q, score: checkScore(list), total: 3, graded: true };
    const mark = marks && marks[ans.q];
    if (mark && ans.q >= 5) {
      const total = Number(mark.scoreMax) || (ans.q === 11 ? 5 : 3);
      return {
        q: ans.q,
        score: blendScore(Number(mark.band != null ? mark.band : mark.scoreValue) || 0, total, ans.pron),
        total,
        graded: true
      };
    }
    return { q: ans.q, score: 0, total: 1, graded: false };
  });
}

function historyPointsFor(testId) {
  const points = [];
  for (const attempt of (state.pack && state.pack.attempts) || []) {
    if (!attempt || attempt.testId !== testId) continue;
    const rows = (attempt.answers || []).map((ans) => ({
      q: ans.q,
      score: ans.score,
      total: ans.total,
      graded: ans.graded === true || Number(ans.total) > 1
    }));
    const estimate = estimateFromRows(rows);
    if (estimate.complete) points.push({ score: estimate.score });
  }
  return points.slice(-12);
}

function checklistBlock(detail, pictureHtml) {
  if (!detail) return '';
  const rows = (detail.rows || []).map((row) => {
    const cls = row.hit ? 'check hit' : 'check miss';
    const symbol = row.hit ? '✓' : '✗';
    return `<li class="${cls}"><span class="tick" aria-hidden="true">${symbol}</span> <span lang="en" dir="ltr">${escapeHtml(row.text)}</span></li>`;
  }).join('');
  const capped = detail.capped ? `<p class="note">${escapeHtml(t('results.capped'))}</p>` : '';
  return `
    ${bigScore(checkScore(detail), 3)}
    <div class="pic-checks">
      ${pictureHtml || ''}
      <section>
        <h3>${escapeHtml(t('results.checklist'))}</h3>
        <ul class="checks">${rows}</ul>
      </section>
    </div>
    ${capped}`;
}

function markBusy() {
  const review = state.review || state.classFeedback;
  return !!(review && review.marking);
}

function bigScore(score, max) {
  const shown = Number.isInteger(Number(score)) ? String(score) : Number(score).toFixed(1);
  return `<p class="big-score" role="img" aria-label="${escapeHtml(t('classMode.band', { score: shown, max }))}"><span class="big-score-label">Score</span> <strong>${escapeHtml(shown)}/${escapeHtml(String(max))}</strong></p>`;
}

function answerCard(ans, grades, source, marks, mode) {
  const picture = ans.type === 'describe_picture';
  const readDetail = isReadAloudScore(ans) ? (grades.read && grades.read[ans.q]) : null;
  const checklist = grades.checklist && grades.checklist[ans.q];
  const ai = marks && marks[ans.q];
  const hasAudio = ans.blob && ans.blob.size > 0;
  const playing = state.playingQ === ans.q;
  const canListen = mode !== 'exam' && hasAudio;
  const playText = playing ? t('review.stop') : t('review.listen');
  const playLabel = playing ? t('a11y.stop', { n: ans.q }) : t('a11y.play', { n: ans.q });
  let pictureHtml = '';
  if (picture && source && source.image) {
    const src = new URL(source.image, document.baseURI).href;
    pictureHtml = `<div class="frame" data-frame><img class="scene" alt="${escapeHtml(t('run.pictureAlt', { n: ans.q }))}" src="${escapeHtml(src)}"></div>`;
  }
  let scoreBlock = '';
  if (readDetail) scoreBlock = readAloudScoreHtml(readDetail);
  else if (checklist) scoreBlock = checklistBlock(checklist, pictureHtml);
  else if (ai && ans.q >= 5) {
    const score = ai.band != null ? ai.band : ai.scoreValue;
    const max = ai.scoreMax || (ans.q === 11 ? 5 : 3);
    scoreBlock = bigScore(score, max);
  } else if (ans.q >= 5) {
    const busy = markBusy();
    scoreBlock = `<p class="score marking-line">${escapeHtml(busy ? t('review.marking') : t('classMode.recorded'))}</p>`;
  } else {
    const value = grades.free ? grades.free[ans.q] : '';
    scoreBlock = `<p class="score">${escapeHtml(t('review.deviceScore'))}: ${escapeHtml(String(value || ''))}</p>`;
  }
  const comment = ai && ai.comment ? `<p class="note ai-comment">${escapeHtml(ai.comment)}</p>` : '';
  const partTip = tipFor(ans.type);
  const tips = (ai && ai.tip) || partTip ? `
    <section class="tips">
      <h3>💡 ${escapeHtml(t('results.tip'))}</h3>
      ${ai && ai.tip ? `<p>${escapeHtml(ai.tip)}</p>` : ''}
      ${partTip ? `<p class="note">${escapeHtml(partTip)}</p>` : ''}
    </section>` : '';
  const said = String(ans.transcript || '').trim();
  const compare = ans.q >= 5 && ai && ai.corrected ? `
    <section class="compare">
      <h3>${escapeHtml(t('classMode.corrected'))}</h3>
      <p lang="en" dir="ltr">${escapeHtml(ai.corrected)}</p>
    </section>` : '';
  const model = source && source.model_answer && ans.q >= 3
    ? `<section class="model-answer"><h3>${escapeHtml(t('classMode.model'))}</h3><p lang="en" dir="ltr">${escapeHtml(source.model_answer)}</p></section>`
    : '';
  let facts = '';
  if (source && ans.q >= 8 && ans.q <= 10) {
    const hits = factHits(source, said);
    if (hits.length) {
      facts = `<section class="facts"><h3>${escapeHtml(t('results.facts'))}</h3><ul class="checks">${hits.map((fact) => `
        <li class="check ${fact.hit ? 'hit' : 'miss'}"><span aria-hidden="true">${fact.hit ? '✓' : '–'}</span> ${escapeHtml(fact.text)}</li>
      `).join('')}</ul></section>`;
    }
  }
  const used = ans.usedSec != null
    ? `<p class="note">${escapeHtml(t('classMode.timeUsed', { used: ans.usedSec, target: ans.speakSec }))}</p>`
    : '';
  const showSnippet = ans.q <= 2 && (!readDetail || readDetail.status !== 'scored');
  const snippet = ans.type === 'read_aloud' ? (source && source.text) || '' : '';
  return `
    <article class="answer-card">
      <h2>${escapeHtml(t('run.qLabel', { n: ans.q }))}</h2>
      <p class="part-name">${escapeHtml(t(`parts.${ans.type}.title`))}</p>
      ${checklist ? '' : pictureHtml}
      ${showSnippet && snippet ? `<p class="snippet" lang="en" dir="ltr">${escapeHtml(snippet)}</p>` : ''}
      ${canListen ? `<button type="button" class="btn secondary" data-action="play" data-q="${ans.q}" aria-label="${escapeHtml(playLabel)}">🔊 ${escapeHtml(playText)}</button>` : ''}
      ${used}
      ${scoreBlock}
      ${ans.q >= 3 ? pronLine(ans.pron) : ''}
      ${comment}
      ${tips}
      ${compare}
      ${model}
      ${facts}
    </article>`;
}

function summaryFor(attempt, grades, marks) {
  if (!attempt || (attempt.mode !== 'exam' && attempt.mode !== 'class' && attempt.mode !== 'full')) return '';
  const rows = liveRows(attempt, grades, marks);
  const estimate = estimateFromRows(rows);
  return estimateHtml({
    t,
    estimate,
    pron: starsOf(rows, [1, 2]),
    picture: starsOf(rows, [3, 4]),
    historyPoints: historyPointsFor(attempt.testId)
  });
}

function renderReview() {
  const { attempt, saved, grades } = state.review;
  const test = state.catalog.find((item) => item.id === attempt.testId);
  const lead = attempt.mode === 'exam'
    ? t('results.examDone')
    : attempt.mode === 'class'
      ? t('results.classDone')
      : attempt.mode === 'full'
        ? t('review.fullDone')
        : t('review.practiceDone');
  const cards = attempt.answers.map((ans) => {
    const source = test && test.questions.find((item) => item.q === ans.q);
    return answerCard(ans, grades, source, state.review.marks, attempt.mode);
  }).join('');
  const sel = state.review.selection;
  const oneQ = sel && sel.scope === 'question' && sel.q;
  let retry = attempt.mode === 'practice' || attempt.mode === 'class'
    ? `<button type="button" class="btn secondary" data-action="retry">${escapeHtml(t('review.retry'))}</button>`
    : '';
  if (oneQ && attempt.mode === 'practice') {
    retry += `<button type="button" class="btn secondary" data-action="try-untimed" data-q="${oneQ}">${escapeHtml(t('practice.tryUntimed'))}</button>
      <button type="button" class="btn secondary" data-action="practice">${escapeHtml(t('practice.pickAnother'))}</button>`;
  }
  const mark = '';
  const note = state.review.markNote
    ? `<p class="alert" role="status">${escapeHtml(state.review.markNote)}</p>`
    : '';
  return shell(`
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('review.title'))}</h1>
    <p class="test-name" lang="en" dir="ltr">${escapeHtml(attempt.testTitle || '')}</p>
    <p>${escapeHtml(lead)}</p>
    <p class="saved">${escapeHtml(saved == null ? t('review.saving') : (saved ? t('review.saved') : t('review.notSaved')))}</p>
    ${summaryFor(attempt, grades, state.review.marks)}
    <div class="answers">${cards}</div>
    ${note}
    <div class="legal">${legalHtml()}</div>
    <div class="dock actions">
      ${mark}
      ${retry}
      <button type="button" class="btn secondary" data-action="home">${escapeHtml(t('review.home'))}</button>
    </div>
  `);
}

function renderError() {
  const message = state.error === 'empty' ? t('home.noTests') : t('home.loadError');
  return shell(`
    <h1>${escapeHtml(t('common.error'))}</h1>
    <p class="alert" role="alert">${escapeHtml(message)}</p>
    <button type="button" class="btn primary" data-action="reload">${escapeHtml(t('common.retry'))}</button>
  `);
}

function renderLoading() {
  return shell(`
    <h1>${escapeHtml(t('appName'))}</h1>
    <p>${escapeHtml(state.loadingText || t('home.loading'))}</p>
  `);
}

function renderClass() {
  const test = currentTest();
  if (!test) return renderHome();
  const groups = new Map();
  for (const q of [...test.questions].sort((a, b) => a.q - b.q)) {
    const type = questionType(q);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(q);
  }
  const cards = PART_ORDER.filter((id) => groups.has(id)).map((id) => {
    const qs = groups.get(id);
    const rows = id === 'info_questions' && qs.length > 1 ? `
      <li class="pick-row">
        <span class="pick-q">${escapeHtml(t('practice.qRange', { a: qs[0].q, b: qs[qs.length - 1].q }))}</span>
        <button type="button" class="btn secondary" data-action="class-part" data-part="${id}">${escapeHtml(t('practice.untimed'))}</button>
        <button type="button" class="btn primary" data-action="practice-part" data-part="${id}">${escapeHtml(t('practice.timed'))}</button>
      </li>` : qs.map((q) => `
      <li class="pick-row">
        <span class="pick-q">${escapeHtml(t('run.qLabel', { n: q.q }))}</span>
        <button type="button" class="btn secondary" data-action="class-q" data-q="${q.q}">${escapeHtml(t('practice.untimed'))}</button>
        <button type="button" class="btn primary" data-action="practice-q" data-q="${q.q}">${escapeHtml(t('practice.timed'))}</button>
      </li>`).join('');
    const tip = tipFor(id);
    return `
      <section class="part-card">
        <h2>${escapeHtml(t(`parts.${id}.title`))}</h2>
        ${tip ? `<p class="tip">💡 ${escapeHtml(tip)}</p>` : ''}
        <ul class="pick-list">${rows}</ul>
      </section>`;
  }).join('');
  return shell(`
    <h1>${escapeHtml(t('practice.title'))}</h1>
    <p>${escapeHtml(t('practice.pickHelp'))}</p>
    <div class="part-grid">${cards}</div>
    <button type="button" class="btn secondary dock" data-action="back">${escapeHtml(t('practice.back'))}</button>
  `);
}

function renderExam() {
  return renderExamInner().replace('</header>', `${langMini('exam-lang')}</header>`);
}

function renderExamInner() {
  const dialog = dialogFragment();
  if (state.examStage === 'run' && state.view) return examRunHtml({ t, view: state.view, dialog });
  if (state.examStage === 'intro') return examIntroHtml({ t, dialog });
  return examMicHtml({
    t,
    recording: state.micRecording,
    level: state.micLevel,
    hasTake: !!(state.micBlob && state.micBlob.size),
    playing: state.playingMic,
    error: state.micError,
    dialog
  });
}

function renderClassRun() {
  const view = state.view;
  if (view && view.status === 'feedback' && state.classFeedback) {
    const ans = state.classFeedback.answer;
    const test = currentTest();
    const source = state.classFeedback.source || (test && ans && test.questions.find((item) => item.q === ans.q));
    const card = ans ? answerCard(ans, state.classFeedback.grades, source, state.classFeedback.marks, 'class') : '';
    const note = state.classFeedback.markNote
      ? `<p class="alert" role="status">${escapeHtml(state.classFeedback.markNote)}</p>`
      : '';
    const mark = '';
    const last = view.stepIndex >= ((state.session && state.session.plan.length - 1) || 0);
    const single = state.selection && state.selection.scope === 'question';
    const again = ans ? `
        <button type="button" class="btn secondary" data-action="try-untimed" data-q="${ans.q}">${escapeHtml(t('practice.tryAgain'))}</button>
        <button type="button" class="btn primary" data-action="try-timed" data-q="${ans.q}">${escapeHtml(t('practice.tryTimed'))}</button>` : '';
    const next = single
      ? `<button type="button" class="btn secondary" data-action="practice">${escapeHtml(t('practice.pickAnother'))}</button>`
      : `<button type="button" class="btn secondary" data-action="class-next">${escapeHtml(last ? t('classMode.finish') : t('classMode.next'))}</button>`;
    return shell(`
      <h1 id="step-title" tabindex="-1">${escapeHtml(t('review.title'))}</h1>
      ${card}
      ${note}
      <div class="dock actions">
        ${mark}
        ${again}
        ${next}
      </div>
    `, { showEnd: true });
  }
  const err = state.micError
    ? `<p id="mic-error" class="alert" role="alert" tabindex="-1">${escapeHtml(state.micError)}</p>`
    : '';
  return shell(`${err}${classScreenHtml({ t, view: view || {} })}`, { showEnd: true });
}

function viewForScreen() {
  if (!state.en) {
    return `
      <main id="main" class="boot">
        <p class="tagline">English speaking practice with TOEIC-style questions. This is not a TOEIC test.</p>
        <p class="disclaimer">TOEIC is a registered trademark of ETS. This product is not endorsed or approved by ETS.</p>
      </main>`;
  }
  if (state.screen === 'loading') return renderLoading();
  if (state.screen === 'account') return renderAccount();
  if (state.screen === 'error') return renderError();
  if (state.screen === 'practice') return renderClass();
  if (state.screen === 'class') return renderClass();
  if (state.screen === 'exam') return renderExam();
  if (state.screen === 'class-run') return renderClassRun();
  if (state.screen === 'session') return renderSession();
  if (state.screen === 'review' && state.review) return renderReview();
  return renderHome();
}

function render(opts = {}) {
  const root = document.getElementById('app');
  if (!root) return;
  const prevFocus = document.activeElement && document.activeElement.id;
  const screenChanged = renderedScreen !== state.screen;
  renderedScreen = state.screen;
  root.innerHTML = viewForScreen();
  syncLangFloat();
  const skip = document.querySelector('.skip');
  if (skip && state.en) skip.textContent = t('a11y.skip');
  applyDocumentChrome();
  bindFrames();
  if (state.dialog) {
    const dialog = document.getElementById('confirm');
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      state.dialog = false;
      render();
    });
    return;
  }
  const focusId = opts.focus || (screenChanged ? 'main' : prevFocus);
  const focusEl = focusId && document.getElementById(focusId);
  if (focusEl && typeof focusEl.focus === 'function') focusEl.focus({ preventScroll: true });
}

function bindFrames() {
  document.querySelectorAll('[data-frame] img').forEach((img) => {
    const fail = () => {
      const frame = img.closest('[data-frame]');
      if (!frame || frame.dataset.failed) return;
      frame.dataset.failed = '1';
      frame.outerHTML = placeholderMarkup(img.alt || t('run.imageMissing'));
    };
    img.addEventListener('error', fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });
}

function updateExamClock(view) {
  const prep = document.getElementById('prep-digits');
  const speak = document.getElementById('speak-digits');
  if (prep) prep.textContent = formatHMS(view.prepActive ? view.prepLeft : (view.prepTotal || 0));
  if (speak) speak.textContent = formatHMS(view.speakActive ? view.speakLeft : (view.speakTotal || 0));
  const prepBox = document.querySelector('.clock-box.prep');
  const speakBox = document.querySelector('.clock-box.speak');
  if (prepBox) prepBox.classList.toggle('is-active', !!view.prepActive);
  if (speakBox) {
    speakBox.classList.toggle('is-active', !!view.speakActive);
    speakBox.classList.toggle('is-live', !!view.recording);
  }
}

function updateClassClock(view) {
  const over = view.target > 0 && view.elapsed > view.target;
  const box = document.querySelector('.countup');
  if (over && box && !box.classList.contains('is-over')) {
    render();
    return;
  }
  const num = document.getElementById('count-num');
  const target = document.getElementById('count-target');
  if (num) num.textContent = formatHMS(view.elapsed || 0);
  if (target) target.textContent = t('classMode.target', { time: formatHMS(view.target || 0) });
  if (box) box.classList.toggle('is-over', !!over);
}

function updateTimer(view) {
  if (!view || view.status === 'directions' || view.status === 'done') return;
  const secs = secsLeft(view.remaining);
  const num = document.getElementById('time-num');
  const ring = document.getElementById('time-ring');
  const face = document.querySelector('.timer-face');
  if (num) {
    num.textContent = String(secs);
    num.classList.toggle('is-urgent', secs > 0 && secs <= 5);
  }
  if (ring && view.total > 0) {
    const ratio = Math.max(0, Math.min(1, view.remaining / view.total));
    ring.setAttribute('stroke-dashoffset', (RING * (1 - ratio)).toFixed(2));
  }
  if (face) {
    face.setAttribute('aria-label', t('a11y.timer', { phase: phaseLabel(view.phase), n: secs }));
  }
}

function maybeAnnounce(view, structural) {
  if (!view || view.status === 'directions' || view.status === 'done') return;
  const secs = secsLeft(view.remaining);
  const interesting = structural || secs === 10 || secs === 5 || secs === 0;
  if (!interesting) return;
  const msg = t('a11y.timer', { phase: phaseLabel(view.phase), n: secs });
  if (msg === lastSpoken) return;
  lastSpoken = msg;
  const live = document.getElementById('live');
  if (live) live.textContent = msg;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const register = (options) => navigator.serviceWorker.register('./sw.js', options);
  register({ scope: './', updateViaCache: 'none' }).catch(() => register({ scope: './' }).catch(() => {}));
}

function showAfterCatalog() {
  if (!state.catalog.length) {
    state.screen = 'error';
    state.error = 'empty';
  } else if (state.packStatus === 'ready') {
    state.screen = 'home';
  } else {
    state.screen = 'account';
  }
  render();
}

async function hydrate(id) {
  const seq = ++hydrateSeq;
  const switched = state.studentId !== id;
  state.studentId = id;
  if (switched) state.pack = emptyPack();
  state.packStatus = 'loading';
  if (state.screen !== 'session' && state.screen !== 'review') {
    state.screen = 'account';
    render();
  }
  try { await saveChain; } catch (err) { /* keep going */ }
  if (seq !== hydrateSeq || studentId() !== id) return;
  const epoch = packEpoch;
  let res;
  try {
    res = await loadProgressPack();
  } catch (err) {
    res = { ok: false, error: 'network' };
  }
  if (seq !== hydrateSeq || studentId() !== id) return;
  if (!res || !res.ok) {
    state.packStatus = 'error';
    if (state.screen !== 'session' && state.screen !== 'review') state.screen = 'account';
    render();
    return;
  }
  if (epoch === packEpoch) state.pack = parsePack(res.progress_json);
  setNarrationVoice(state.pack && state.pack.voice);
  state.packStatus = 'ready';
  if (state.catalog.length && state.screen !== 'session' && state.screen !== 'review') {
    state.screen = 'home';
  }
  render();
  const scores = globalThis.MRJ_SCORES;
  if (scores && typeof scores.flush === 'function') scores.flush();
}

function onAuthReady(event) {
  const detail = event && event.detail ? event.detail : {};
  const id = String(detail.id != null ? detail.id : studentId()).trim();
  if (!id) return;
  if (id === state.studentId && state.packStatus === 'ready' && (state.screen === 'session' || state.screen === 'review')) {
    return;
  }
  hydrate(id);
}

function onSignedOut(event) {
  const button = event.target && event.target.closest && event.target.closest('.mrj-auth-signout');
  if (!button) return;
  hydrateSeq += 1;
  reviewToken += 1;
  state.studentId = '';
  state.sessionOwner = '';
  state.pack = emptyPack();
  state.packStatus = 'idle';
  state.review = null;
  if (state.screen !== 'session') {
    stopPlayback();
    state.screen = 'account';
    render();
  }
}

async function boot() {
  state.lang = detectLang();
  state.error = '';
  if (state.packStatus !== 'ready') state.screen = 'account';
  try {
    await loadLanguage(state.lang);
  } catch (err) {
    try {
      state.lang = 'en';
      await loadLanguage('en');
    } catch (inner) {
      state.en = null;
      render();
      return;
    }
  }
  applyDocumentChrome();
  render();
  try {
    await loadCatalog();
    showAfterCatalog();
  } catch (err) {
    state.screen = 'error';
    state.error = 'load';
    render();
  }
  registerServiceWorker();
  prepareNarration();
  exposeBench();
  warmChecker();
}

function exposeBench() {
  try {
    if (new URLSearchParams(location.search).get('bench') !== '1') return;
  } catch (err) {
    return;
  }
  globalThis.__speakpassBench = (blob, text) => gradeReadAloud(text, blob);
  globalThis.__speakpassPreview = (detail) => {
    const test = currentTest();
    state.review = {
      attempt: {
        testId: test ? test.id : '',
        testTitle: test ? test.title : '',
        mode: 'practice',
        answers: [{ q: 1, type: 'read_aloud', blob: new Blob(['x']), mimeType: 'audio/wav' }]
      },
      saved: false,
      grades: { free: { 1: detail && detail.save }, paid: null, read: { 1: detail } },
      selection: { mode: 'practice', scope: 'question', q: 1 }
    };
    state.screen = 'review';
    state.session = null;
    render();
  };
}

document.addEventListener('click', onClick);
document.addEventListener('click', onSignedOut);
document.addEventListener('change', onChange);
document.addEventListener('mrj-auth-ready', onAuthReady);
window.addEventListener('beforeunload', onLeave);
boot();

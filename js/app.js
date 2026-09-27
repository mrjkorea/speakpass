import { APP_NAME, LANGS } from './config.js';
import { saveAttempt } from './db.js';
import { activeStream, beginArm, hasStream, releaseMic } from './audio.js';
import { createSession } from './engine.js';
import { gradeFree, gradePaid } from './grade.js';
import { escapeHtml, renderDocument } from './html.js';
import { detectLang, fill, loadDict, lookup } from './i18n.js';
import { PART_ORDER, buildPlan, questionType, readSeconds } from './plan.js';

const RING = 2 * Math.PI * 52;

const state = {
  lang: 'en',
  dict: null,
  en: null,
  catalog: [],
  testId: '',
  screen: 'loading',
  error: '',
  selection: null,
  session: null,
  view: null,
  micError: '',
  arming: false,
  dialog: false,
  review: null,
  playingQ: null
};

let renderedScreen = '';
let viewKey = '';
let lastSpoken = '';
let presenting = false;
let audioEl = null;
let audioUrl = '';

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
}

function goHome() {
  stopPlayback();
  releaseMic();
  state.session = null;
  state.view = null;
  state.dialog = false;
  state.review = null;
  state.micError = '';
  state.arming = false;
  state.screen = 'home';
  viewKey = '';
  render();
}

async function presentReview(attempt) {
  if (presenting) return;
  presenting = true;
  releaseMic();
  let saved = true;
  try {
    await saveAttempt(attempt);
  } catch (err) {
    saved = false;
  }
  const grades = { free: {}, paid: null };
  for (const ans of attempt.answers) {
    if (ans.q <= 4) grades.free[ans.q] = await gradeFree(ans.q, ans.blob);
  }
  if (attempt.answers.some((ans) => ans.q >= 5)) {
    grades.paid = await gradePaid(attempt);
  }
  state.review = {
    attempt,
    saved,
    grades,
    selection: state.selection
  };
  state.session = null;
  state.view = null;
  state.screen = 'review';
  state.dialog = false;
  state.micError = '';
  viewKey = '';
  presenting = false;
  render();
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
  if (!test) return;
  stopPlayback();
  releaseMic();
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
  const ans = state.review && state.review.attempt.answers.find((item) => item.q === q);
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
  if (action === 'full') startSession({ mode: 'full' });
  else if (action === 'practice') {
    state.screen = 'practice';
    render();
  } else if (action === 'home' || action === 'back') goHome();
  else if (action === 'practice-q') {
    startSession({ mode: 'practice', scope: 'question', q: Number(button.dataset.q) });
  } else if (action === 'practice-part') {
    startSession({ mode: 'practice', scope: 'part', part: button.dataset.part });
  } else if (action === 'begin') onBegin();
  else if (action === 'ask-end') {
    state.dialog = true;
    render();
  } else if (action === 'cancel-end') {
    state.dialog = false;
    render();
  } else if (action === 'confirm-end') confirmEnd();
  else if (action === 'play') togglePlay(button.dataset.q);
  else if (action === 'retry' && state.review) startSession(state.review.selection);
  else if (action === 'reload') boot();
}

function onChange(event) {
  if (event.target.id === 'lang') setLang(event.target.value);
  if (event.target.id === 'test-select') {
    state.testId = event.target.value;
    render();
  }
}

function onLeave(event) {
  if (state.screen === 'session') {
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
  const enTag = lookup(state.en, 'home.tagline');
  const enDis = lookup(state.en, 'home.disclaimer');
  const parts = [];
  if (state.lang !== 'en') {
    parts.push(`<p class="tagline">${escapeHtml(t('home.tagline'))}</p>`);
    parts.push(`<p class="disclaimer">${escapeHtml(t('home.disclaimer'))}</p>`);
  }
  parts.push(`<p class="tagline" lang="en" dir="ltr">${escapeHtml(enTag)}</p>`);
  parts.push(`<p class="disclaimer" lang="en" dir="ltr">${escapeHtml(enDis)}</p>`);
  return parts.join('');
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
    <p class="eyebrow">${escapeHtml(t('home.eyebrow'))}</p>
    <h1>${escapeHtml(t('appName'))}</h1>
    <div class="legal">${legalHtml()}</div>
    <label class="field">
      <span>${escapeHtml(t('home.chooseTest'))}</span>
      <select id="test-select" lang="en" dir="ltr">${options}</select>
    </label>
    <p class="count">${escapeHtml(t('home.questionCount', { count: test.questions.length }))}</p>
    <p class="note">${escapeHtml(t('home.micNote'))}</p>
    <div class="dock actions">
      <button type="button" class="btn primary" data-action="full">${escapeHtml(t('home.fullTest'))}</button>
      <button type="button" class="btn secondary" data-action="practice">${escapeHtml(t('home.practice'))}</button>
    </div>
  `);
}

function renderPractice() {
  const test = currentTest();
  if (!test) return renderHome();
  const groups = new Map();
  for (const q of [...test.questions].sort((a, b) => a.q - b.q)) {
    const type = questionType(q);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(q);
  }
  const cards = PART_ORDER.filter((id) => groups.has(id)).map((id) => {
    const questions = groups.get(id);
    const buttons = questions.map((q) => `
      <button type="button" class="btn secondary" data-action="practice-q" data-q="${q.q}">${escapeHtml(t('run.qLabel', { n: q.q }))}</button>
    `).join('');
    return `
      <section class="part-card">
        <h2>${escapeHtml(t(`parts.${id}.title`))}</h2>
        <button type="button" class="btn primary" data-action="practice-part" data-part="${escapeHtml(id)}">${escapeHtml(t('practice.part'))}</button>
        <div class="q-row">${buttons}</div>
      </section>`;
  }).join('');
  return shell(`
    <h1>${escapeHtml(t('practice.title'))}</h1>
    <p>${escapeHtml(t('practice.help'))}</p>
    ${cards}
    <button type="button" class="btn secondary dock" data-action="back">${escapeHtml(t('practice.back'))}</button>
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

function timerBlock(view, hint, compact) {
  const secs = secsLeft(view.remaining);
  const ratio = view.total > 0 ? Math.max(0, Math.min(1, view.remaining / view.total)) : 0;
  const offset = (RING * (1 - ratio)).toFixed(2);
  const label = phaseLabel(view.phase);
  const urgent = secs > 0 && secs <= 5 ? ' is-urgent' : '';
  const rec = view.phase === 'speak'
    ? `<p class="rec"><span class="dot" aria-hidden="true"></span>${escapeHtml(t('run.recording'))}</p>`
    : '';
  return `
    <div class="timer-wrap phase-${escapeHtml(view.phase)}${compact ? ' compact' : ''}">
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
  const compact = q.type === 'info_questions' || q.type === 'respond_questions';
  const hint = view.phase === 'speak' ? t('run.auto') : (view.phase === 'prepare' ? t('run.tone') : '');
  return shell(`
    ${progressHtml()}
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('run.qLabel', { n: q.q }))}</h1>
    <p class="part-name">${escapeHtml(t(`parts.${q.type}.title`))}</p>
    ${timerBlock(view, hint, compact)}
    ${questionBody(q)}
    <p class="no-pause">${escapeHtml(t('run.noPause'))}</p>
  `, { showEnd: true });
}

function renderReview() {
  const { attempt, saved, grades } = state.review;
  const test = state.catalog.find((item) => item.id === attempt.testId);
  const lead = attempt.mode === 'full' ? t('review.fullDone') : t('review.practiceDone');
  const cards = attempt.answers.map((ans) => {
    const source = test && test.questions.find((item) => item.q === ans.q);
    const picture = ans.type === 'describe_picture';
    const snippet = picture
      ? t('review.snippetPicture')
      : (ans.type === 'read_aloud' ? (source && source.text) || '' : (source && source.question) || '');
    const lang = picture ? '' : ' lang="en" dir="ltr"';
    const hasAudio = ans.blob && ans.blob.size > 0;
    const playing = state.playingQ === ans.q;
    const playText = !hasAudio ? t('review.noAudio') : (playing ? t('review.stop') : t('review.play'));
    const playLabel = playing
      ? t('a11y.stop', { n: ans.q })
      : t('a11y.play', { n: ans.q });
    const scoreValue = ans.q <= 4 ? (grades.free[ans.q] || '') : (grades.paid || '');
    const scoreName = ans.q <= 4 ? t('review.deviceScore') : t('review.serverScore');
    return `
      <article class="answer-card">
        <h2>${escapeHtml(t('run.qLabel', { n: ans.q }))}</h2>
        <p class="part-name">${escapeHtml(t(`parts.${ans.type}.title`))}</p>
        <p class="snippet"${lang}>${escapeHtml(snippet)}</p>
        <button type="button" class="btn secondary" data-action="play" data-q="${ans.q}" ${hasAudio ? '' : 'disabled'} aria-label="${escapeHtml(playLabel)}">${escapeHtml(playText)}</button>
        <p class="score">${escapeHtml(scoreName)}: ${escapeHtml(scoreValue)}</p>
      </article>`;
  }).join('');
  const retry = attempt.mode === 'practice'
    ? `<button type="button" class="btn primary" data-action="retry">${escapeHtml(t('review.retry'))}</button>`
    : '';
  return shell(`
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('review.title'))}</h1>
    <p class="test-name" lang="en" dir="ltr">${escapeHtml(attempt.testTitle || '')}</p>
    <p>${escapeHtml(lead)}</p>
    <p class="saved">${escapeHtml(saved ? t('review.saved') : t('review.notSaved'))}</p>
    <div class="answers">${cards}</div>
    <div class="dock actions">
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
    <p>${escapeHtml(t('home.loading'))}</p>
  `);
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
  if (state.screen === 'error') return renderError();
  if (state.screen === 'practice') return renderPractice();
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

async function boot() {
  state.lang = detectLang();
  state.screen = 'loading';
  state.error = '';
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
    state.screen = state.catalog.length ? 'home' : 'error';
    if (!state.catalog.length) state.error = 'empty';
  } catch (err) {
    state.screen = 'error';
    state.error = 'load';
  }
  render();
  registerServiceWorker();
}

document.addEventListener('click', onClick);
document.addEventListener('change', onChange);
window.addEventListener('beforeunload', onLeave);
boot();

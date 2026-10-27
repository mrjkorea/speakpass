import { APP_NAME } from './config.js';
import { EXAM_DIRECTIONS, EXAM_INTRO, EXAM_TITLES, MIC_SENTENCE } from './exam-copy.js';
import { PART_ORDER } from './estimate.js';
import { formatHMS } from './format.js';
import { escapeHtml, renderDocument } from './html.js';

export function examCountLabel(step) {
  const info = !!step && (
    step.kind === 'read_document'
    || step.part === 'info_questions'
    || (step.question && step.question.type === 'info_questions')
  );
  if (info) return 'Questions 8-10 of 11';
  let n = 1;
  if (step && step.kind === 'directions') n = (step.questions && step.questions[0] && step.questions[0].q) || 1;
  else if (step && step.question) n = step.question.q;
  return `Question ${n} of 11`;
}

function clockBox(kind, label, value, active, live) {
  const cls = ['clock-box', kind, active ? 'is-active' : '', live ? 'is-live' : ''].filter(Boolean).join(' ');
  const dot = live ? '<span class="rec-dot" aria-hidden="true"></span>' : '';
  return `
    <div class="${cls}">
      <span>${escapeHtml(label)}</span>
      <strong id="${kind}-clock">${dot}<span id="${kind}-digits">${escapeHtml(value)}</span></strong>
    </div>`;
}

export function examTimers(view) {
  const prep = formatHMS(view && view.prepActive ? view.prepLeft : (view && view.prepTotal) || 0);
  const speak = formatHMS(view && view.speakActive ? view.speakLeft : (view && view.speakTotal) || 0);
  return `
    <footer class="exam-foot">
      ${clockBox('prep', 'PREPARATION TIME', prep, !!(view && view.prepActive), false)}
      ${clockBox('speak', 'RESPONSE TIME', speak, !!(view && view.speakActive), !!(view && view.recording))}
    </footer>`;
}

function examChrome(main, { count, leaveLabel, showLeave, footer = '', dialog = '' }) {
  const leave = showLeave
    ? `<button type="button" class="exam-leave" data-action="ask-end">${escapeHtml(leaveLabel)}</button>`
    : '';
  return `
    <div class="shell exam">
      <header class="exam-top">
        <div class="exam-brand"><span>${escapeHtml(APP_NAME)}</span><small>Speaking Practice</small></div>
        <div class="exam-count">${escapeHtml(count || '')}</div>
        ${leave}
      </header>
      <main id="main" tabindex="-1">${main}</main>
      ${footer}
      <p class="exam-notice" lang="en" dir="ltr">TOEIC is a registered trademark of ETS. This product is not endorsed or approved by ETS.</p>
      ${dialog}
      <p id="live" class="sr-only" aria-live="polite"></p>
    </div>`;
}

export function examMicHtml({ t, recording, level, hasTake, playing, error, teacherSkip = false, dialog = '' }) {
  const meter = Math.round((Number(level) || 0) * 100);
  const err = error
    ? `<p id="mic-error" class="alert" role="alert" tabindex="-1">${escapeHtml(error)}</p>`
    : '';
  const skip = teacherSkip
    ? `<button type="button" class="btn secondary" data-action="exam-skip-mic">${escapeHtml(t('exam.skipMicTeacher'))}</button>`
    : '';
  const play = hasTake
    ? `<button type="button" class="btn secondary" data-action="exam-playback">${escapeHtml(playing ? t('review.stop') : t('exam.playBack'))}</button>
       <button type="button" class="btn secondary" data-action="exam-record">${escapeHtml(t('exam.recordAgain'))}</button>
       <button type="button" class="btn primary" data-action="exam-intro">${escapeHtml(t('exam.continue'))}</button>`
    : `<button type="button" class="btn primary" data-action="exam-record" ${recording ? 'disabled' : ''}>${escapeHtml(recording ? t('exam.recording') : t('exam.record'))}</button>${skip}`;
  return examChrome(`
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('exam.micTitle'))}</h1>
    <p>${escapeHtml(t('exam.micHelp'))}</p>
    <p class="mic-sentence" lang="en" dir="ltr">${escapeHtml(MIC_SENTENCE)}</p>
    <div id="mic-meter-wrap" class="meter" role="meter" aria-label="${escapeHtml(t('exam.level'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${meter}">
      <span id="mic-meter" style="width:${meter}%"></span>
    </div>
    ${err}
    <div class="dock actions">${play}</div>
  `, { count: '', showLeave: false, dialog });
}

export function examIntroHtml({ t, dialog = '' }) {
  return examChrome(`
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('exam.start'))}</h1>
    <p class="directions" lang="en" dir="ltr">${escapeHtml(EXAM_INTRO)}</p>
    <p>${escapeHtml(t('exam.startHint'))}</p>
    <button type="button" class="btn primary dock" data-action="exam-start">${escapeHtml(t('exam.start'))}</button>
  `, { count: 'Question 1 of 11', showLeave: true, leaveLabel: t('exam.leave'), dialog });
}

function questionBody(q, { t, showQuestionText }) {
  if (!q) return '';
  if (q.type === 'read_aloud') {
    return `<article class="passage" lang="en" dir="ltr"><p>${escapeHtml(q.text || '')}</p></article>`;
  }
  if (q.type === 'describe_picture') {
    const label = t('run.pictureAlt', { n: q.q });
    if (!q.image) return '';
    const src = new URL(q.image, document.baseURI).href;
    return `<div class="frame" data-frame><img class="scene" alt="${escapeHtml(label)}" src="${escapeHtml(src)}"></div>`;
  }
  if (q.type === 'respond_questions') {
    return `
      <section class="context" lang="en" dir="ltr"><h2>${escapeHtml(t('run.scenario'))}</h2><p>${escapeHtml(q.set_intro || '')}</p></section>
      <p class="ask" lang="en" dir="ltr">${escapeHtml(q.question || '')}</p>`;
  }
  if (q.type === 'info_questions') {
    const ask = showQuestionText
      ? `<p class="ask" lang="en" dir="ltr">${escapeHtml(q.question || '')}</p>`
      : '';
    return `${ask}${renderDocument(q.document)}`;
  }
  return `<p class="ask" lang="en" dir="ltr">${escapeHtml(q.question || '')}</p>`;
}

export function examRunHtml({ t, view, dialog = '' }) {
  const step = view && view.step;
  const count = examCountLabel(step);
  let body = '';
  if (!step || step.kind === 'directions') {
    const part = (step && step.part) || 'read_aloud';
    body = `
      <h1 id="step-title" tabindex="-1" lang="en" dir="ltr">${escapeHtml(EXAM_TITLES[part] || '')}</h1>
      <p class="directions" lang="en" dir="ltr">${escapeHtml(EXAM_DIRECTIONS[part] || '')}</p>`;
  } else if (step.kind === 'read_document') {
    body = `
      <h1 id="step-title" tabindex="-1" lang="en" dir="ltr">Read the document</h1>
      ${renderDocument(step.question && step.question.document)}`;
  } else {
    const q = step.question;
    body = `
      <h1 id="step-title" class="sr-only" tabindex="-1">${escapeHtml(count)}</h1>
      ${questionBody(q, { t, showQuestionText: view.showQuestionText !== false })}`;
  }
  const script = view && view.script
    ? `<p class="exam-script" lang="en" dir="ltr">${escapeHtml(view.script)}</p>`
    : '';
  const twice = view && view.twice
    ? `<p class="hint" lang="en" dir="ltr">This question is played twice.</p>`
    : '';
  return examChrome(`
    ${script}
    ${twice}
    ${body}
  `, { count, showLeave: true, leaveLabel: t('exam.leave'), footer: examTimers(view), dialog });
}

function clockBlock(view, t) {
  const elapsed = formatHMS(view.elapsed || 0);
  const target = formatHMS(view.target || 0);
  const over = view.target > 0 && view.elapsed > view.target;
  return `
    <div class="countup${over ? ' is-over' : ''}${view.recording ? ' is-live' : ''}">
      <p id="count-num" class="count-num">${escapeHtml(elapsed)}</p>
      <p id="count-target" class="count-target">${escapeHtml(t('classMode.target', { time: target }))}</p>
      ${over ? `<p class="hint">${escapeHtml(t('classMode.over'))}</p>` : ''}
      ${view.recording ? `<p class="rec"><span class="dot" aria-hidden="true"></span>${escapeHtml(t('run.recording'))}</p>` : ''}
    </div>`;
}

export function classScreenHtml({ t, view }) {
  const step = view && view.step;
  if (!step || step.kind === 'directions') {
    const part = (step && step.part) || 'read_aloud';
    const questions = (step && step.questions) || [];
    const oneKey = `parts.${part}.directionsOne`;
    const dir = questions.length === 1 ? t(oneKey) : t(`parts.${part}.directions`);
    return `
      <h1 id="step-title" tabindex="-1">${escapeHtml(t(`parts.${part}.title`))}</h1>
      <p class="directions">${escapeHtml(dir)}</p>
      <button type="button" class="btn primary dock" data-action="class-continue">${escapeHtml(t('classMode.done'))}</button>`;
  }
  if (step.kind === 'read_document') {
    return `
      <h1 id="step-title" tabindex="-1">${escapeHtml(t('run.reading'))}</h1>
      ${clockBlock(view, t)}
      ${renderDocument(step.question && step.question.document)}
      <button type="button" class="btn primary dock" data-action="class-continue">${escapeHtml(t('classMode.done'))}</button>`;
  }
  const q = step.question;
  const hear = q && q.q >= 5 && q.q <= 11
    ? `<button type="button" class="btn secondary" data-action="class-hear">${escapeHtml(t('classMode.hear'))}</button>`
    : '';
  return `
    <h1 id="step-title" tabindex="-1">${escapeHtml(t('run.qLabel', { n: q.q }))}</h1>
    <p class="part-name">${escapeHtml(t(`parts.${q.type}.title`))}</p>
    ${questionBody(q, { t, showQuestionText: true })}
    ${clockBlock(view, t)}
    <div class="dock actions">
      ${hear}
      <button type="button" class="btn primary" data-action="class-done">${escapeHtml(t('classMode.done'))}</button>
    </div>`;
}

export function historyChart(points) {
  const rows = (points || []).filter((point) => Number.isFinite(point.score));
  if (!rows.length) return '';
  const w = 320;
  const h = 150;
  const pad = 22;
  const coords = rows.map((point, index) => {
    const x = rows.length === 1 ? w / 2 : pad + ((w - pad * 2) * index) / (rows.length - 1);
    const y = h - pad - ((h - pad * 2) * point.score) / 200;
    return { x, y, score: point.score };
  });
  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const dots = coords.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.5"></circle>`).join('');
  const last = coords[coords.length - 1];
  return `
    <svg class="history" viewBox="0 0 ${w} ${h}" role="img">
      <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}"></line>
      <polyline points="${line}"></polyline>
      ${dots}
      <text x="${last.x.toFixed(1)}" y="${Math.max(12, last.y - 8).toFixed(1)}" text-anchor="middle">${last.score}</text>
    </svg>`;
}

export function partBarsHtml({ t, estimate }) {
  if (!estimate) return '';
  const bars = PART_ORDER.map((part) => {
    const row = estimate.parts[part];
    const max = row ? row.max : 0;
    const known = row && row.points != null;
    const width = known && max ? Math.max(0, Math.min(100, (row.points / max) * 100)) : 0;
    const fix = estimate.weakest && estimate.weakest.part === part && estimate.complete;
    const value = known ? `${row.points}/${max}` : t('results.recorded');
    const note = fix ? `<p class="fix-note">${escapeHtml(t('results.fixFirst'))}</p>` : '';
    return `
      <div class="part-bar${fix ? ' is-fix' : ''}">
        <div class="part-bar-label"><span>${escapeHtml(t(`parts.${part}.title`))}</span><span>${escapeHtml(value)}</span></div>
        <div class="part-bar-track"><span style="width:${width}%"></span></div>
        ${note}
      </div>`;
  }).join('');
  return `<section class="part-bars"><h2>${escapeHtml(t('results.parts'))}</h2>${bars}</section>`;
}

export function estimateHtml({ t, estimate, pron, picture, historyPoints }) {
  const pronText = pron == null ? '–' : String(pron);
  const pictureText = picture == null ? '–' : String(picture);
  const lead = estimate && estimate.complete
    ? `
      <p class="estimate-flag">${escapeHtml(t('results.estimate'))}</p>
      <p class="estimate-score">${escapeHtml(t('results.score', { score: estimate.score }))}</p>
      <p class="estimate-level">${escapeHtml(t('results.level', { level: estimate.level }))}</p>
      <p class="can-do">${escapeHtml(t(`levels.${estimate.level}`))}</p>`
    : `
      <p class="estimate-flag">${escapeHtml(t('results.estimate'))}</p>
      <p>${escapeHtml(t('results.partial', { pron: pronText, picture: pictureText }))}</p>
      <p>${escapeHtml(t('results.needMark'))}</p>`;
  const chart = historyChart(historyPoints);
  return `
    <section class="estimate">
      ${lead}
      ${partBarsHtml({ t, estimate })}
      <section class="history-block">
        <h2>${escapeHtml(t('results.history'))}</h2>
        ${chart || `<p>${escapeHtml(t('results.historyEmpty'))}</p>`}
      </section>
    </section>`;
}

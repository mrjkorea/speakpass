import { readFileSync, readdirSync } from 'node:fs';
import { APP_NAME, LANGS } from '../js/config.js';
import { gradeFree, gradePaid } from '../js/grade.js';
import { MANIFEST_FILE, MODEL_ORIGIN, SHARED_URL, modelUrls } from '../js/pronounce/model-ref.js';
import { PASS_AT, THRESHOLDS, bandFor, starsFromPct } from '../js/pronounce/stars.js';
import { markdownLite, renderDocument } from '../js/html.js';
import { matchLang } from '../js/i18n.js';
import { buildPlan, readSeconds } from '../js/plan.js';

function flatten(obj, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) out.push(...flatten(value, next));
    else out.push(next);
  }
  return out.sort();
}

const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url), 'utf8'));
const enKeys = flatten(en);
const required = [
  'English speaking practice with TOEIC-style questions. This is not a TOEIC test.',
  'TOEIC is a registered trademark of ETS. This product is not endorsed or approved by ETS.'
];
if (en.home.tagline !== required[0] || en.home.disclaimer !== required[1]) {
  throw new Error('English legal copy drifted');
}

const files = readdirSync(new URL('../locales/', import.meta.url)).filter((name) => name.endsWith('.json')).sort();
const expected = LANGS.map((lang) => `${lang.id}.json`).sort();
if (files.join() !== expected.join()) {
  throw new Error(`locale files ${files} != ${expected}`);
}
for (const lang of LANGS) {
  const data = JSON.parse(readFileSync(new URL(`../locales/${lang.id}.json`, import.meta.url), 'utf8'));
  if (data.appName !== APP_NAME) throw new Error(`${lang.id} appName`);
  const keys = flatten(data);
  if (keys.join() !== enKeys.join()) {
    const missing = enKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !enKeys.includes(key));
    throw new Error(`${lang.id} keys differ missing=${missing} extra=${extra}`);
  }
  const blob = JSON.stringify(data);
  for (const token of ['{count}', '{n}', '{prep}', '{speak}', '{phase}', '{index}', '{total}']) {
    const enHas = JSON.stringify(en).includes(token);
    if (enHas && !blob.includes(token) && token !== '{count}') {
      /* checked per key below */
    }
  }
  function walk(a, b, path) {
    for (const [key, value] of Object.entries(a)) {
      const here = path ? `${path}.${key}` : key;
      if (value && typeof value === 'object') walk(value, b[key], here);
      else {
        const tokens = String(value).match(/\{(\w+)\}/g) || [];
        const other = String(b[key]).match(/\{(\w+)\}/g) || [];
        if (tokens.join() !== other.join()) throw new Error(`${lang.id} ${here} placeholders ${other} != ${tokens}`);
      }
    }
  }
  walk(en, data, '');
}

if (matchLang('ko-KR') !== 'ko') throw new Error('ko detect');
if (matchLang('zh-CN') !== 'zh-Hans') throw new Error('zh detect');
if (matchLang('pt-PT') !== 'pt-BR') throw new Error('pt detect');
if (matchLang('ar-SA') !== 'ar') throw new Error('ar detect');
if (matchLang('en-GB') !== 'en') throw new Error('en detect');

const index = JSON.parse(readFileSync(new URL('../tests/index.json', import.meta.url), 'utf8'));
if (!Array.isArray(index.tests) || index.tests.length !== 10) throw new Error('index count');
const timings = {
  1: [45, 45], 2: [45, 45], 3: [45, 30], 4: [45, 30],
  5: [3, 15], 6: [3, 15], 7: [3, 30],
  8: [3, 15], 9: [3, 15], 10: [3, 30],
  11: [45, 60]
};
const canonical = {
  1: 'read_aloud', 2: 'read_aloud', 3: 'describe_picture', 4: 'describe_picture',
  5: 'respond_questions', 6: 'respond_questions', 7: 'respond_questions',
  8: 'info_questions', 9: 'info_questions', 10: 'info_questions',
  11: 'opinion'
};
for (let n = 1; n <= 10; n += 1) {
  const id = `test${String(n).padStart(2, '0')}`;
  const entry = index.tests[n - 1];
  if (entry.id !== id || entry.file !== `${id}.json`) throw new Error(`index ${id}`);
  const test = JSON.parse(readFileSync(new URL(`../tests/${id}.json`, import.meta.url), 'utf8'));
  if (test.id !== id || test.questions.length !== 11) throw new Error(`${id} shape`);
  for (const q of test.questions) {
    const [prep, speak] = timings[q.q];
    if (q.prep_sec !== prep || q.speak_sec !== speak) throw new Error(`${id} timing q${q.q}`);
    const full = buildPlan(test, { mode: 'full' });
    const step = full.find((item) => item.kind === 'question' && item.question.q === q.q);
    if (!step || step.question.type !== canonical[q.q]) throw new Error(`${id} type q${q.q}`);
  }
  const full = buildPlan(test, { mode: 'full' });
  const qSteps = full.filter((step) => step.kind === 'question');
  const dirs = full.filter((step) => step.kind === 'directions');
  const reads = full.filter((step) => step.kind === 'read_document');
  if (qSteps.length !== 11 || dirs.length !== 5 || reads.length !== 1 || reads[0].seconds !== 45) {
    throw new Error(`${id} plan`);
  }
  const q8 = qSteps.find((step) => step.question.q === 8).question;
  const rendered = renderDocument(q8.document);
  const label = q8.document.rows[0].label || q8.document.rows[0][0];
  const value = q8.document.rows[0].value || q8.document.rows[1][0];
  if (!rendered.includes(String(label)) || !rendered.includes(String(value))) throw new Error(`${id} document`);
  if (rendered.includes('**')) throw new Error(`${id} raw markdown`);
  const only9 = buildPlan(test, { mode: 'practice', scope: 'question', q: 9 });
  if (only9.map((step) => step.kind).join() !== 'directions,read_document,question') throw new Error(`${id} practice q9`);
  const shared = structuredClone(test);
  shared.questions[5].set_intro = '';
  delete shared.questions[6].set_intro;
  delete shared.questions[8].document;
  delete shared.questions[8].caller_intro;
  delete shared.questions[9].document;
  shared.questions[9].caller_intro = '';
  const q7 = buildPlan(shared, { mode: 'practice', scope: 'question', q: 7 }).find((step) => step.kind === 'question');
  if (q7.question.set_intro !== test.questions[4].set_intro) throw new Error(`${id} shared intro`);
  const q10 = buildPlan(shared, { mode: 'practice', scope: 'question', q: 10 }).find((step) => step.kind === 'question');
  if (!q10.question.document || q10.question.caller_intro !== test.questions[7].caller_intro) {
    throw new Error(`${id} shared document`);
  }
  const moved = structuredClone(test);
  moved.questions[7].document = { ...moved.questions[7].document, read_sec: 45 };
  delete moved.questions[7].read_sec;
  if (readSeconds(moved.questions[7]) !== 45) throw new Error(`${id} read_sec`);
  for (const q of test.questions) {
    if (q.q !== 3 && q.q !== 4) continue;
    if (typeof q.image !== 'string' || !/^images\/test\d{2}_q[34]\.jpg$/.test(q.image)) {
      throw new Error(`${id} image path q${q.q}`);
    }
    if (q.image !== `images/${id}_q${q.q}.jpg`) throw new Error(`${id} image file q${q.q}`);
    readFileSync(new URL(`../${q.image}`, import.meta.url));
    const items = q.key_elements;
    if (!Array.isArray(items) || items.length < 10) throw new Error(`${id} checklist q${q.q}`);
    const ids = new Set();
    let mainW = 0;
    let detailN = 0;
    const categories = ['place', 'people', 'clothing', 'action', 'object', 'position'];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${id} item q${q.q}`);
      if (typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new Error(`${id} id q${q.q}`);
      ids.add(item.id);
      if (item.role !== 'main' && item.role !== 'detail') throw new Error(`${id} role ${item.id}`);
      if (item.role === 'main' && item.weight !== 2 && item.weight !== 3) throw new Error(`${id} weight ${item.id}`);
      if (item.role === 'detail' && item.weight !== 1) throw new Error(`${id} weight ${item.id}`);
      if (item.role === 'main') mainW += item.weight;
      else detailN += 1;
      if (!categories.includes(item.category)) throw new Error(`${id} category ${item.id}`);
      if (typeof item.text !== 'string' || item.text.length < 8) throw new Error(`${id} text ${item.id}`);
      if (!Array.isArray(item.accept) || item.accept.length < 3) throw new Error(`${id} accept ${item.id}`);
      if (item.accept.some((phrase) => typeof phrase !== 'string' || !phrase.trim())) {
        throw new Error(`${id} accept blank ${item.id}`);
      }
      const cons = item.contradict || [];
      if (!Array.isArray(cons)) throw new Error(`${id} contradict ${item.id}`);
      for (const entry of cons) {
        if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) throw new Error(`${id} contradict text`);
        if (!Number.isInteger(entry.cap) || entry.cap < 0 || entry.cap > 5) throw new Error(`${id} cap ${item.id}`);
        if (String(q.model_answer).toLowerCase().includes(entry.text.toLowerCase())) {
          throw new Error(`${id} q${q.q} model matches contradiction: ${entry.text}`);
        }
      }
    }
    if (mainW < 12 || detailN < 4) throw new Error(`${id} balance q${q.q}`);
    if (typeof q.model_answer !== 'string' || q.model_answer.length < 80) throw new Error(`${id} model q${q.q}`);
  }
}

const html = renderDocument({
  title: 'Demo',
  markdown: '# Title\n\nHello there.\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
});
if (!html.includes('<table') || !html.includes('Hello there') || html.includes('<script')) {
  throw new Error('markdown');
}
if (markdownLite('<img src=x onerror=alert(1)>').includes('<img')) throw new Error('escape');
const listed = markdownLite('- **Guest:** Luis Ortega');
if (!listed.includes('<ul>') || !listed.includes('<strong>Guest:</strong>') || !listed.includes('Luis Ortega')) {
  throw new Error('markdown list');
}

if (await gradeFree(1, null) !== 'coming soon') throw new Error('gradeFree');
if (await gradeFree(3, null) !== 'coming soon') throw new Error('gradeFree q3');
if (await gradePaid({ id: 'x' }) !== 'coming soon') throw new Error('gradePaid');

if (PASS_AT !== 60) throw new Error('pass at 60');
if (THRESHOLDS.green !== 75 || THRESHOLDS.yellow !== 50) throw new Error('thresholds 75/50');
if (bandFor(75) !== 'green' || bandFor(74) !== 'yellow' || bandFor(50) !== 'yellow' || bandFor(49) !== 'red') throw new Error('bands');
if (starsFromPct(100) !== 5 || starsFromPct(90) !== 5) throw new Error('5 stars');
if (starsFromPct(89.9) !== 4 || starsFromPct(80) !== 4) throw new Error('4 stars');
if (starsFromPct(79.9) !== 3 || starsFromPct(70) !== 3) throw new Error('3 stars');
if (starsFromPct(69.9) !== 2 || starsFromPct(60) !== 2) throw new Error('2 stars');
if (starsFromPct(59.9) !== 1 || starsFromPct(0) !== 1) throw new Error('1 star');

if (MANIFEST_FILE !== 'models/hubert/manifest.json') throw new Error('model manifest');
if (!MODEL_ORIGIN.startsWith('https://mrjkorea.github.io/pronounce/')) throw new Error('shared model');
if (SHARED_URL !== 'https://mrjkorea.github.io/pronounce/src/shared.js') throw new Error('shared engine');
const urls = modelUrls();
if (!urls.manifest.endsWith(MANIFEST_FILE)) throw new Error('model urls');

const banned = ['openai', 'nvidia', 'anthropic', 'whisper', 'wav2vec', 'citrinet', 'chatgpt', 'claude', 'gemini', 'onnx', 'espeak', 'whistle'];
for (const lang of LANGS) {
  const blob = readFileSync(new URL(`../locales/${lang.id}.json`, import.meta.url), 'utf8').toLowerCase();
  for (const word of banned) {
    if (blob.includes(word)) throw new Error(`${lang.id} names ${word}`);
  }
}
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8').toLowerCase();
for (const word of banned) {
  if (page.includes(word)) throw new Error(`page names ${word}`);
}

const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
if (manifest.name !== APP_NAME || manifest.short_name !== APP_NAME) {
  throw new Error('manifest name must match APP_NAME');
}
const pageHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
if (!pageHtml.includes(`<title>${APP_NAME}</title>`)) throw new Error('page title');
if (!pageHtml.includes(`apple-mobile-web-app-title" content="${APP_NAME}"`)) throw new Error('apple title');

const precache = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
  .match(/'([^']+)'/g)
  .map((item) => item.slice(1, -1))
  .filter((item) => item.startsWith('./'));
for (const rel of precache) {
  const file = new URL(`../${rel.slice(2)}`, import.meta.url);
  readFileSync(file);
}

console.log('check ok', APP_NAME, `${LANGS.length} languages`);

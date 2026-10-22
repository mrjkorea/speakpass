import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { APP_ID, APP_NAME } from '../js/config.js';
import { noteScoreArgs, scorePostArgs } from '../js/cloud.js';
import {
  applyAttempt,
  applyMarkScores,
  coerceScore,
  emptyPack,
  itemKey,
  packJson,
  parsePack,
  questionsForTest
} from '../js/progress.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(APP_ID === 'speakpass', 'app id');

const coming = coerceScore('coming soon', true);
assert(coming.score === 1 && coming.total === 1 && coming.graded === false, 'completion score');
assert(coerceScore('coming soon', false).score === 0, 'missing audio');
const slash = coerceScore('3/5', true);
assert(slash.score === 3 && slash.total === 5 && slash.graded === true, 'slash grade');
const pct = coerceScore('80%', false);
assert(pct.score === 80 && pct.total === 100 && pct.graded === true, 'percent grade');

const attempt = {
  id: 'a1',
  testId: 'test01',
  testTitle: 'Practice Test 1',
  mode: 'practice',
  startedAt: '2026-10-13T00:00:00.000Z',
  finishedAt: '2026-10-13T00:01:00.000Z',
  complete: true,
  answers: [{
    q: 5,
    type: 'respond_questions',
    blob: new Blob(['audio-bytes']),
    mimeType: 'audio/webm'
  }]
};
const first = applyAttempt(emptyPack(), attempt, { 5: 'coming soon' });
assert(first.scored.length === 1, 'one scored row');
assert(first.scored[0].item === 'test01:5', 'item id');
assert(first.scored[0].score === 1 && first.scored[0].total === 1, 'scored values');
const packed = JSON.parse(packJson(first.pack));
assert(packed.items['test01:5'].attempts === 1, 'attempt count');
assert(!JSON.stringify(packed).includes('audio-bytes'), 'pack has no audio');
assert(!JSON.stringify(packed).includes('password'), 'pack has no password');

const better = applyAttempt(first.pack, {
  ...attempt,
  id: 'a2',
  answers: [{ q: 5, type: 'respond_questions', hasAudio: true }]
}, { 5: '4/5' });
assert(better.pack.items['test01:5'].score === 4, 'keeps numeric grade');
assert(better.pack.items['test01:5'].total === 5, 'keeps total');
assert(better.pack.items['test01:5'].attempts === 2, 'counts both tries');
assert(better.scored[0].score === 4, 'this try is reported');

const worse = applyAttempt(better.pack, {
  ...attempt,
  id: 'a3',
  answers: [{ q: 5, type: 'respond_questions', hasAudio: false }]
}, { 5: '1/5' });
assert(worse.pack.items['test01:5'].score === 4, 'best score stays');
assert(worse.pack.items['test01:5'].attempts === 3, 'third try counted');
assert(worse.scored[0].score === 1, 'latest try still reported');

const roundTrip = parsePack(packJson(worse.pack));
assert(questionsForTest(roundTrip, 'test01').length === 1, 'reload questions');
assert(questionsForTest(roundTrip, 'test02').length === 0, 'other test empty');
assert(parsePack('').items && Object.keys(parsePack('').items).length === 0, 'empty pack');
assert(parsePack('not-json').v === 1, 'bad json');
assert(itemKey('test01', 11) === 'test01:11', 'key shape');

const withTests = parsePack(JSON.stringify({
  v: 1,
  items: { 'test01:1': { score: 4, total: 5, graded: true, attempts: 1, at: '', type: 'read_aloud' } },
  attempts: [],
  tests: { test01: { full: { raw: 20 } } }
}));
assert(withTests.tests.test01.full.raw === 20, 'paid tests stay in the pack');
const marked = applyMarkScores({
  v: 1,
  items: {},
  attempts: [{
    id: 'exam-1',
    testId: 'test01',
    testTitle: 'Practice Test 1',
    mode: 'exam',
    startedAt: '',
    finishedAt: '2026-10-22T00:00:00.000Z',
    complete: true,
    answers: [{ q: 5, type: 'respond_questions', score: 1, total: 1, graded: false }]
  }],
  tests: { test01: { full: { raw: 20 } } }
}, 'exam-1', [{ q: 5, testId: 'test01', type: 'respond_questions', score: 2, total: 3 }]);
assert(marked.pack.tests.test01.full.raw === 20, 'marking keeps paid tests');
assert(marked.pack.attempts[0].answers[0].score === 2, 'band is stored on the attempt');
assert(marked.pack.attempts[0].answers[0].total === 3, 'band total');
assert(marked.pack.items['test01:5'].score === 2, 'item takes the band');
assert(marked.pack.items['test01:5'].attempts === 1, 'marking does not add a try');

const note = noteScoreArgs('test01:5', 1, 1);
assert(note.app === 'speakpass' && note.item === 'test01:5' && note.score === 1 && note.total === 1, 'note aliases');
assert(note.program === 'speakpass' && note.itemId === 'test01:5', 'note wire fields');
assert(note.scoreValue === 1 && note.scoreMax === 1 && note.scorePct === 100, 'note numbers');

const post = scorePostArgs({
  student: 'zz_test_speakpass_demo',
  item: 'test01:5',
  score: 1,
  total: 1,
  testTitle: 'Practice Test 1',
  testId: 'test01',
  mode: 'practice',
  type: 'respond_questions'
});
assert(post.student === 'zz_test_speakpass_demo', 'plain student id');
assert(!post.student.includes('@'), 'student id is not an email');
assert(post.program === 'speakpass' && post.appName === APP_NAME, 'score program');

const jsDir = new URL('../js/', import.meta.url);
const sources = readdirSync(jsDir).filter((name) => name.endsWith('.js')).map((name) => ({
  name,
  text: readFileSync(new URL(name, jsDir), 'utf8')
}));
const all = sources.map((file) => file.text).join('\n');
assert(!all.includes('indexedDB'), 'no device attempt database');
assert(!all.includes('saveAttempt'), 'no local attempt save');
assert(!/localStorage\.(set|get)Item\(\s*[^)]*password/.test(all), 'passwords are not stored');
for (const file of sources) {
  if (!file.text.includes('localStorage')) continue;
  assert(file.name === 'i18n.js' || file.name === 'app.js', `${file.name} must not use localStorage`);
  assert(file.text.includes('app.lang'), `${file.name} storage is only the language preference`);
}

const scoresSrc = readFileSync(new URL('../mrj-scores.js', import.meta.url), 'utf8');
assert(scoresSrc.includes('AKfycbx677Fg8Q0GpH13Fcrw9aRqsKt7Eo5i29dZRh5goDbTM3KpyYfs6HMJiIMYRx3sjvVG4A'), 'score receiver');
const posts = [];
const sandbox = {
  window: {},
  fetch: (url, opts) => {
    posts.push({ url, body: JSON.parse(opts.body) });
    return Promise.resolve({
      json: () => Promise.resolve({ ok: true })
    });
  }
};
sandbox.window = sandbox;
vm.runInNewContext(scoresSrc, sandbox);
await sandbox.MRJ_SCORES.post({
  student: 'zz_test_speakpass_demo',
  program: 'speakpass',
  itemId: 'test01:5',
  scoreValue: 1,
  scoreMax: 1
});
assert(posts.length === 1, 'one score post');
assert(posts[0].body.student_email === 'zz_test_speakpass_demo', 'student_email is the plain id');
assert(posts[0].body.events[0].item_id === 'test01:5', 'score item');

console.log('progress tests ok');

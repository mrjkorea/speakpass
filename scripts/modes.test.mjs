import { readFileSync } from 'node:fs';
import { scoreChecklist, factHits } from '../js/checklist.js';
import { estimateFromRows, levelFor } from '../js/estimate.js';
import { formatHMS } from '../js/format.js';
import { narrationPasses } from '../js/narration.js';
import { clipEntries, renderManifest, renderScript } from './narration-build.mjs';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(formatHMS(45) === '00:00:45', '45 seconds');
assert(formatHMS(0) === '00:00:00', 'zero');
assert(formatHMS(3661) === '01:01:01', 'hours');
assert(narrationPasses(10) === 2, 'question 10 plays twice');
assert(narrationPasses(8) === 1, 'question 8 plays once');
assert(narrationPasses(4) === 0, 'picture is not narrated');
assert(narrationPasses(11) === 1, 'opinion is narrated');

const levels = [
  [200, 'AH'], [190, 'AM'], [180, 'AM'], [170, 'AL'], [160, 'AL'],
  [150, 'IH'], [140, 'IH'], [130, 'IM3'], [120, 'IM2'], [110, 'IM1'],
  [100, 'IL'], [90, 'IL'], [80, 'NH'], [60, 'NH'], [50, 'NM'], [40, 'NM'],
  [30, 'NL'], [0, 'NL']
];
for (const [score, level] of levels) assert(levelFor(score) === level, `${score} ${level}`);

const test = JSON.parse(readFileSync(new URL('../tests/test01.json', import.meta.url), 'utf8'));
const picture = test.questions.find((item) => item.q === 3);
const strong = scoreChecklist(picture, picture.model_answer);
assert(strong.stars >= 4, `model answer stars ${strong.stars}`);
assert(strong.rows.some((row) => row.hit && row.role === 'main'), 'a main item is ticked');
const missed = scoreChecklist(picture, 'There is a flower shop.');
assert(missed.rows.some((row) => row.role === 'main' && !row.hit), 'missed main items stay visible');
const capped = scoreChecklist(picture, 'This is a hospital with nobody in it.');
assert(capped.capped === true && capped.stars <= 1, 'contradiction caps the score');
const empty = scoreChecklist(picture, '');
assert(empty.stars === 0 && empty.rows.every((row) => !row.hit), 'blank answer');

const info = test.questions.find((item) => item.q === 8);
const facts = factHits(info, 'You can check in at 3 pm on March 14.');
assert(facts.length === 1 && facts[0].hit, 'document fact matches a spoken answer');

const full = estimateFromRows([
  { q: 1, score: 5, total: 5, graded: true },
  { q: 2, score: 5, total: 5, graded: true },
  { q: 3, score: 5, total: 5, graded: true },
  { q: 4, score: 5, total: 5, graded: true },
  { q: 5, score: 3, total: 3, graded: true },
  { q: 6, score: 3, total: 3, graded: true },
  { q: 7, score: 3, total: 3, graded: true },
  { q: 8, score: 3, total: 3, graded: true },
  { q: 9, score: 3, total: 3, graded: true },
  { q: 10, score: 3, total: 3, graded: true },
  { q: 11, score: 5, total: 5, graded: true }
]);
assert(full.complete && full.score === 200 && full.level === 'AH', 'perfect estimate');
const partial = estimateFromRows([
  { q: 1, score: 4, total: 5, graded: true },
  { q: 2, score: 4, total: 5, graded: true },
  { q: 3, score: 3, total: 5, graded: true },
  { q: 4, score: 3, total: 5, graded: true },
  { q: 5, score: 1, total: 1, graded: false }
]);
assert(partial.complete === false && partial.level == null, 'no level before the later questions are marked');

const entries = clipEntries();
const script = renderScript(entries);
const manifest = JSON.parse(renderManifest(entries));
assert(readFileSync(new URL('../NARRATION_SCRIPT.md', import.meta.url), 'utf8') === script, 'narration script matches the tests');
assert(readFileSync(new URL('../audio/narration/manifest.json', import.meta.url), 'utf8') === renderManifest(entries), 'manifest matches the tests');
for (let n = 1; n <= 10; n += 1) {
  const id = `test${String(n).padStart(2, '0')}`;
  const file = JSON.parse(readFileSync(new URL(`../tests/${id}.json`, import.meta.url), 'utf8'));
  for (const q of file.questions) {
    if (q.q < 5 || q.q > 10) continue;
    const clip = `${id}.q${q.q}`;
    assert(manifest.clips[clip], `manifest ${clip}`);
    assert(script.includes(`## ${clip}`), `heading ${clip}`);
    assert(script.includes(`Text: ${q.question}`), `text ${clip}`);
  }
}
assert(script.includes('Text: Begin preparing now.'), 'prep cue');
assert(script.includes('Text: Begin speaking now.'), 'speak cue');
assert(!/speechSynthesis|deepseek|openai|fish audio/i.test(script), 'script names no voice engine');

console.log('mode tests ok', entries.length);

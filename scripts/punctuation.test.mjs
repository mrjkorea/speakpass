// The scored read-aloud line keeps the punctuation and capitals of the printed text.
import { packGrade, punctuateWords } from '../js/pronounce/pack.js';
import { modelClipFile, modelClipUrl } from '../js/model-audio.js';

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const text = 'Maple Court Library will host a free book exchange on Saturday, April 18, at 10 a.m.';
const scored = [
  { word: 'maple', score: 80, band: 'green' },
  { word: 'court', score: 90, band: 'green' },
  { word: 'library', score: 20, band: 'red' },
  { word: 'will', score: 70, band: 'yellow' },
  { word: 'host', score: 85, band: 'green' },
  { word: 'a', score: 60, band: 'yellow' },
  { word: 'free', score: 88, band: 'green' },
  { word: 'book', score: 92, band: 'green' },
  { word: 'exchange', score: 40, band: 'red' },
  { word: 'on', score: 95, band: 'green' },
  { word: 'saturday', score: 75, band: 'green' },
  { word: 'april', score: 65, band: 'yellow' },
  { word: '18', score: 90, band: 'green' },
  { word: 'at', score: 95, band: 'green' },
  { word: '10', score: 91, band: 'green' },
  { word: 'a', score: 70, band: 'yellow' },
  { word: 'm', score: 72, band: 'yellow' }
];

const line = punctuateWords(text, scored);
const shown = line.map((word) => word.word);

assert(shown[0] === 'Maple', `keeps the capital: ${shown[0]}`);
assert(shown.includes('Saturday,'), 'keeps the comma after Saturday');
assert(shown.includes('18,'), 'keeps the comma after the day number');
assert(shown.includes('a.m.'), 'keeps the full stop in a.m.');
assert(shown[shown.length - 1] === 'a.m.', 'last printed token keeps its full stop');
assert(line[2].band === 'red' && line[2].weak === true, 'a red word stays red and weak');
assert(line[0].band === 'green', 'a green word stays green');
assert(JSON.stringify(shown).includes('Maple Court Library will host a free book exchange on Saturday, April 18, at 10 a.m.') === false,
  'sanity: the joined line is pieces, not one string');

const noMatch = punctuateWords('Hello there.', []);
assert(noMatch.length === 2 && noMatch[0].band === null, 'an unmatched printed word has no band');

const packed = packGrade(
  { result: { scorePct: 70, band: 'green', words: scored, pass: true }, perf: {}, door: { ok: true } },
  10,
  {},
  text
);
assert(packed.status === 'scored', 'packs a scored answer');
assert(packed.words.some((word) => word.word === 'Saturday,'), 'packGrade keeps the printed comma');

assert(modelClipFile('test03', 1) === 'test03-q1.mp3', 'model clip file name');
assert(modelClipFile('test03', 3) === '', 'no model clip for question 3');
assert(/\/audio\/model\/[a-z]{2}-[fm]\/test03-q2\.mp3$/.test(modelClipUrl('test03', 2)), 'model clip url');

console.log('punctuation test ok');

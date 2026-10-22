import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { CUE_PREPARING, CUE_SPEAKING, EXAM_DIRECTIONS, EXAM_INTRO } from '../js/exam-copy.js';
import {
  CUE_PREP_ID,
  CUE_SPEAK_ID,
  INTRO_CLIP_ID,
  callerClipId,
  clipFile,
  directionClipId,
  questionClipId,
  setIntroClipId
} from '../js/narration.js';

const PARTS = ['read_aloud', 'describe_picture', 'respond_questions', 'info_questions', 'opinion'];

export function clipEntries() {
  const entries = [
    [CUE_PREP_ID, CUE_PREPARING],
    [CUE_SPEAK_ID, CUE_SPEAKING],
    [INTRO_CLIP_ID, EXAM_INTRO]
  ];
  for (const part of PARTS) entries.push([directionClipId(part), EXAM_DIRECTIONS[part]]);
  const dir = new URL('../tests/', import.meta.url);
  const files = readdirSync(dir).filter((name) => /^test\d+\.json$/.test(name)).sort();
  for (const file of files) {
    const test = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const byQ = new Map(test.questions.map((q) => [q.q, q]));
    const q5 = byQ.get(5);
    const q8 = byQ.get(8);
    if (q5 && q5.set_intro) entries.push([setIntroClipId(test.id), q5.set_intro]);
    if (q8 && q8.caller_intro) entries.push([callerClipId(test.id), q8.caller_intro]);
    for (let q = 5; q <= 11; q += 1) {
      const item = byQ.get(q);
      if (!item) continue;
      entries.push([questionClipId(test.id, q), String(item.question || '')]);
    }
  }
  return entries;
}

export function renderScript(entries) {
  const lines = [
    '# Narration clips',
    '',
    'Each id is one pre-recorded clip. Put the mp3 at `audio/narration/` using the file name below.',
    'The app does not speak with a browser voice and does not use a second voice.',
    'Until that mp3 is in place, the screen shows the text and the official preparation and response times still run.',
    'Question 10 uses the same clip twice.',
    ''
  ];
  for (const [id, text] of entries) {
    lines.push(`## ${id}`);
    lines.push('');
    lines.push(`File: \`audio/narration/${clipFile(id)}\``);
    lines.push('');
    lines.push(`Text: ${String(text).replace(/\s+/g, ' ').trim()}`);
    lines.push('');
  }
  return `${lines.join('\n')}`;
}

export function renderManifest(entries) {
  const clips = {};
  for (const [id] of entries) clips[id] = clipFile(id);
  return `${JSON.stringify({ version: 1, clips }, null, 2)}\n`;
}

function main() {
  const entries = clipEntries();
  const root = new URL('../', import.meta.url);
  mkdirSync(new URL('audio/narration/', root), { recursive: true });
  writeFileSync(new URL('../NARRATION_SCRIPT.md', import.meta.url), renderScript(entries));
  writeFileSync(new URL('../audio/narration/manifest.json', import.meta.url), renderManifest(entries));
  console.log('narration clips', entries.length);
}

if (process.argv[1] && process.argv[1].endsWith('narration-build.mjs')) main();

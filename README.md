# SpeakPass AI

English speaking practice with TOEIC-style questions. This is not a TOEIC test.

TOEIC is a registered trademark of ETS. This product is not endorsed or approved by ETS.

SpeakPass AI runs a full 11-question speaking practice or a single question. It times preparation and speaking, records your voice, and lets you play the answers back. It does not grade yet.

The app name is the constant `APP_NAME` in `js/config.js`. The manifest (`name` and `short_name`), the page title, and `appName` in every file under `locales/` must stay the same as that constant.

## Run it

This is a static site: HTML, CSS, and JavaScript, with no build step. Serve the folder over HTTP. Opening the files directly will not work, because modules, the microphone, and the service worker need a page address.

```bash
python3 -m http.server 8741
```

Then open `http://127.0.0.1:8741/`.

Screenshots of the opening screen, a timer, and the review screen are in `docs/screenshots/`.

Use a current version of Chrome, Safari (iOS or macOS), Edge, or Firefox. Allow the microphone when the test asks. Timers do not pause.

The same files can be published on GitHub Pages (`.nojekyll` is included so every file is served). After the first load, the service worker keeps the app available offline. A later native wrapper can point at this folder unchanged.

## What you can do

- **Full test.** All 11 questions in order. Each part starts when you press Start. Preparation counts down, a tone plays, recording starts by itself, and recording stops when the speaking time ends.
- **Practice.** One question, or every question in a part. You can try again from the review screen.
- **Review.** Each answer is stored in IndexedDB on this device and can be played back.
- **Language.** The interface and the directions are available in 15 languages. The test itself stays in English. The language follows the browser the first time, and you can change it with the picker. Arabic uses a right-to-left layout.

Questions 3 and 4 show a picture. If the image file is missing, a neutral placeholder appears. Questions 8–10 show a document for 45 seconds, then the questions. The document stays on screen.

## Layout

```
index.html              App shell
manifest.webmanifest    Installable app metadata
sw.js                   Offline cache (bump CACHE after adding files)
css/styles.css
js/config.js            APP_NAME and the language list
js/app.js               Screens
js/engine.js            Timers and the question sequence
js/audio.js             Microphone, beeps, MediaRecorder
js/db.js                IndexedDB attempts
js/grade.js             gradeFree and gradePaid stubs
js/plan.js              Turns a test file into steps
js/i18n.js              Language detection and dictionaries
js/html.js              Escaping and document rendering
js/timer.js
locales/*.json          Interface and directions
tests/index.json        Catalog of tests
tests/testNN.json       One test
images/                 Pictures for questions 3 and 4
icons/                  Home-screen icons
scripts/check.mjs       Checks the tests and translations
```

Check the tests and the translation keys with:

```bash
node scripts/check.mjs
```

## Add a test

1. Copy `tests/test01.json` to `tests/test02.json` (and so on).
2. Set a new `id` and `title`. Write original English items. Do not copy published test questions.
3. Keep 11 questions, numbered 1 through 11, with these types and times:

| Questions | `type` | Prepare | Speak |
| --- | --- | --- | --- |
| 1–2 | `read_aloud` | 45 s | 45 s |
| 3–4 | `describe_picture` | 45 s | 30 s |
| 5–7 | `respond_questions` or `respond_to_questions` | 3 s | 15 s, 15 s, 30 s |
| 8–10 | `info_questions` or `respond_with_information` | 45 s to read the document once, then 3 s | 15 s, 15 s, 30 s |
| 11 | `opinion` | 45 s | 60 s |

4. Questions 1–2 need `text`, `sentences`, and `"phonemes_todo": true`.
5. Questions 3–4 need `image` (a path such as `images/test02_q3.jpg`, with no leading slash), `image_prompt`, `key_elements`, and `model_answer`. If that file is missing, the app shows a placeholder.
6. Questions 5–7 share the same `set_intro`. It can be repeated on each question, or only on the first; the others inherit it. Each has `question` and `model_answer`.
7. Questions 8–10 share the same `document` and `caller_intro`. Either may be repeated on each question or only on the first. Put `"read_sec": 45` on the question or on the document. `rows` may be a table (the first row is the header) or a list of `{ "label", "value" }` objects. `markdown` may use headings, paragraphs, bullet lists, `**bold**`, and tables. Each question has `question`, `answer_facts`, and `model_answer`.
8. Question 11 needs `question` and `model_answer`.
9. Add an entry to `tests/index.json`:

```json
{ "id": "test02", "title": "Practice Test 2", "file": "test02.json" }
```

10. Add every new file to `PRECACHE` in `sw.js` and change `CACHE` to a new name so returning visitors pick up the files.

Directions are written in the locale files, not in the test. The app supplies them.

## Recording

The microphone is requested in the tap on Start, which is what iOS Safari requires. The recorder uses WebM when the browser supports it, and MP4 on Safari. Each answer’s audio blob is saved with the attempt in IndexedDB and played on the review screen.

## Grading

`js/grade.js` only holds hooks:

- `gradeFree(q, audio)` for questions 1–4, later an on-device score
- `gradePaid(attempt)` for questions 5–11, later a server score

Both return `coming soon`. They do not upload audio.

## Install and offline

The manifest and service worker make the site installable (home screen, and a PWA package such as the Microsoft Store). After one online visit, a reload works offline.

A future Capacitor project for Android or iPhone can use this folder as the web assets without changing these files. The native project will still need a microphone usage description in its own platform config.

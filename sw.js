const CACHE = 'app-shell-v20';
// Same cache the shared pronunciation loader uses. One copy for every MRJ app.
const SHARED_MODEL_CACHE = 'mrj-hubert-phoneme-en-int8-v1';

const PRECACHE = [
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './js/config.js',
  './js/i18n.js',
  './js/html.js',
  './js/plan.js',
  './js/timer.js',
  './js/audio.js',
  './js/grade.js',
  './js/pronounce/model-ref.js',
  './js/pronounce/pack.js',
  './js/pronounce/stars.js',
  './js/pronounce/boot.js',
  './js/pronounce/blend.js',
  './js/progress.js',
  './js/cloud.js',
  './mrj-scores.js',
  './js/engine.js',
  './js/format.js',
  './js/exam-copy.js',
  './js/checklist.js',
  './js/estimate.js',
  './js/narration.js',
  './js/capture.js',
  './js/exam-run.js',
  './js/class-run.js',
  './js/mode-view.js',
  './js/app.js',
  './audio/narration/manifest.json',
  './js/paid-mark.js',
  './js/mark-client.js',
  './js/transcribe.js',
  './js/whistle-worker.js',
  './vendor/whistle/needle.js',
  './vendor/whistle/needle.wasm',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png',
  './tests/index.json',
  './tests/test01.json',
  './tests/test02.json',
  './tests/test03.json',
  './tests/test04.json',
  './tests/test05.json',
  './tests/test06.json',
  './tests/test07.json',
  './tests/test08.json',
  './tests/test09.json',
  './tests/test10.json',
  './images/test01_q3.jpg',
  './images/test01_q4.jpg',
  './images/test02_q3.jpg',
  './images/test02_q4.jpg',
  './images/test03_q3.jpg',
  './images/test03_q4.jpg',
  './images/test04_q3.jpg',
  './images/test04_q4.jpg',
  './images/test05_q3.jpg',
  './images/test05_q4.jpg',
  './images/test06_q3.jpg',
  './images/test06_q4.jpg',
  './images/test07_q3.jpg',
  './images/test07_q4.jpg',
  './images/test08_q3.jpg',
  './images/test08_q4.jpg',
  './images/test09_q3.jpg',
  './images/test09_q4.jpg',
  './images/test10_q3.jpg',
  './images/test10_q4.jpg',
  './locales/en.json',
  './locales/ko.json',
  './locales/zh-Hans.json',
  './locales/ja.json',
  './locales/es.json',
  './locales/hi.json',
  './locales/de.json',
  './locales/vi.json',
  './locales/pt-BR.json',
  './locales/id.json',
  './locales/fr.json',
  './locales/ar.json',
  './locales/tr.json',
  './locales/it.json',
  './locales/pl.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE && key !== SHARED_MODEL_CACHE && key !== 'whistle-model-v1')
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // The shared pronunciation model is cached by the pronounce checker itself; don't store a second copy.
  if (url.pathname.startsWith('/pronounce/models/')) return;
  // Whistle model parts live in their own cache (whistle-model-v1), filled by the worker.
  if (/whistle\.cact\.part\d$/.test(url.pathname)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = await caches.match('./index.html');
        if (home) return home;
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

import { LANGS } from './config.js';

const cache = new Map();

const ALIASES = {
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  'zh-tw': 'zh-Hans',
  'zh-hk': 'zh-Hans',
  'zh-hant': 'zh-Hans',
  pt: 'pt-BR',
  'pt-br': 'pt-BR'
};

export async function loadDict(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const url = new URL(`../locales/${lang}.json`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`locale ${lang}`);
  const data = await res.json();
  cache.set(lang, data);
  return data;
}

export function lookup(dict, key) {
  if (!dict) return undefined;
  let cur = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function fill(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (_, name) => (
    vars && vars[name] != null ? String(vars[name]) : ''
  ));
}

export function matchLang(raw) {
  const lower = String(raw || '').replace(/_/g, '-').toLowerCase();
  if (!lower) return null;
  if (ALIASES[lower]) return ALIASES[lower];
  const exact = LANGS.find((lang) => lang.id.toLowerCase() === lower);
  if (exact) return exact.id;
  const primary = lower.split('-')[0];
  if (ALIASES[primary]) return ALIASES[primary];
  const byPrimary = LANGS.find((lang) => lang.id.toLowerCase() === primary);
  return byPrimary ? byPrimary.id : null;
}

export function detectLang() {
  try {
    const saved = localStorage.getItem('app.lang');
    if (saved && LANGS.some((lang) => lang.id === saved)) return saved;
  } catch (err) {
    /* private mode may block storage */
  }
  const list = (navigator.languages && navigator.languages.length)
    ? navigator.languages
    : [navigator.language || 'en'];
  for (const item of list) {
    const match = matchLang(item);
    if (match) return match;
  }
  return 'en';
}

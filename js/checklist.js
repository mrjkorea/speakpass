/** Picture checklist (questions 3 and 4) and document fact ticks. */

const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'to', 'of', 'and', 'or',
  'in', 'on', 'at', 'for', 'with', 'that', 'this', 'it', 'you', 'your'
]);

export function normalizePhrase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padded(value) {
  const text = normalizePhrase(value);
  return text ? ` ${text} ` : ' ';
}

export function phraseHit(transcript, phrase) {
  const needle = normalizePhrase(phrase);
  if (!needle) return false;
  return padded(transcript).includes(` ${needle} `);
}

function looseFact(transcript, fact) {
  if (phraseHit(transcript, fact)) return true;
  const fold = (value) => normalizePhrase(value)
    .replace(/\b(\d+)\s+00\b/g, '$1')
    .replace(/\bp\s+m\b/g, 'pm')
    .replace(/\ba\s+m\b/g, 'am');
  const hay = fold(transcript);
  const words = fold(fact).split(' ').filter((word) => word.length > 2 && !STOP.has(word));
  if (!words.length) return false;
  const got = words.filter((word) => hay.includes(word)).length;
  return got / words.length >= 0.55;
}

/**
 * 0–5 stars from weighted checklist hits.
 * A matched contradiction caps the score. The lowest cap wins.
 * Omissions are not contradictions.
 */
export function scoreChecklist(question, transcript) {
  const items = Array.isArray(question && question.key_elements) ? question.key_elements : [];
  const text = String(transcript || '');
  let earned = 0;
  let possible = 0;
  let cap = 5;
  const rows = items.map((item) => {
    const weight = Number(item && item.weight) || 0;
    if (weight > 0) possible += weight;
    const phrases = [item && item.text, ...((item && item.accept) || [])].filter(Boolean);
    const hit = phrases.some((phrase) => phraseHit(text, phrase));
    if (hit && weight > 0) earned += weight;
    let contradicted = false;
    for (const entry of (item && item.contradict) || []) {
      if (!entry || !phraseHit(text, entry.text)) continue;
      contradicted = true;
      const nextCap = Number(entry.cap);
      if (Number.isFinite(nextCap)) cap = Math.min(cap, nextCap);
    }
    return {
      id: item && item.id,
      role: item && item.role,
      category: item && item.category,
      text: String((item && item.text) || ''),
      hit,
      contradicted
    };
  });
  let raw = possible > 0 ? (earned / possible) * 5 : 0;
  if (raw > cap) raw = cap;
  const stars = Math.max(0, Math.min(5, Math.round(raw)));
  return {
    stars,
    raw,
    cap,
    earned,
    possible,
    capped: cap < 5,
    rows
  };
}

export function factHits(question, transcript) {
  const facts = Array.isArray(question && question.answer_facts) ? question.answer_facts : [];
  return facts.map((fact) => ({
    text: String(fact || ''),
    hit: looseFact(transcript, fact)
  })).filter((row) => row.text);
}

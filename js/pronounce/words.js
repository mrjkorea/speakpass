// Word tokens for the shared pronunciation checker.
// Same split as the reference checker: letters and apostrophes, original spelling kept.

export function tokenizeWords(text) {
  const out = [];
  const re = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
  let match;
  while ((match = re.exec(text || '')) !== null) {
    out.push({
      display: match[0],
      lookup: match[0].toLowerCase(),
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return out;
}

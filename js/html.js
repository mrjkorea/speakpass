export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

export function renderDocument(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const title = doc.title
    ? `<h3 class="doc-title">${escapeHtml(doc.title)}</h3>`
    : '';
  let body = '';
  if (isMatrix(doc.rows)) body = rowsTable(doc.rows);
  else if (isPairs(doc.rows)) body = pairsTable(doc.rows);
  else if (typeof doc.markdown === 'string' && doc.markdown.trim()) {
    body = `<div class="sheet prose">${markdownLite(doc.markdown)}</div>`;
  }
  return `<section class="document" lang="en" dir="ltr">${title}${body}</section>`;
}

function isMatrix(rows) {
  return Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0]);
}

function isPairs(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.every((row) => (
    row && typeof row === 'object' && !Array.isArray(row) && ('label' in row || 'value' in row)
  ));
}

function rowsTable(rows) {
  const [head, ...rest] = rows;
  const hr = head.map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join('');
  const br = rest.map((row) => {
    const cells = (Array.isArray(row) ? row : []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<div class="sheet"><table class="grid"><thead><tr>${hr}</tr></thead><tbody>${br}</tbody></table></div>`;
}

function pairsTable(rows) {
  const body = rows.map((row) => (
    `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`
  )).join('');
  return `<div class="sheet"><table class="pairs"><tbody>${body}</tbody></table></div>`;
}

export function markdownLite(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        block.push(lines[i]);
        i += 1;
      }
      out.push(tableFromMarkdown(block));
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      out.push(`<h4>${inline(line.replace(/^#{1,3}\s+/, ''))}</h4>`);
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    const para = [line.trim()];
    i += 1;
    while (
      i < lines.length
      && lines[i].trim()
      && !lines[i].trim().startsWith('|')
      && !/^#{1,3}\s+/.test(lines[i])
      && !/^[-*]\s+/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('');
}

function inline(text) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function tableFromMarkdown(block) {
  const rows = block
    .map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  if (!rows.length) return '';
  return rowsTable(rows);
}

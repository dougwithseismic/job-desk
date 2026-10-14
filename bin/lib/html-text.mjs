// HTML to readable plain text, for job descriptions. Keeps paragraph breaks,
// writes list items as "- ", puts headings on their own line, decodes entities
// and collapses whitespace. No dependencies: job posts are simple HTML.

// Named entities worth knowing. Latin-1 (160-255) comes from one ordered list.
const LATIN1 = (
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro ' +
  'para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil ' +
  'Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave ' +
  'Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml ' +
  'igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute ' +
  'thorn yuml'
).split(' ');

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", AMP: '&', LT: '<', GT: '>', QUOT: '"',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  dagger: '†', Dagger: '‡', bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″', lsaquo: '‹',
  rsaquo: '›', euro: '€', trade: '™', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
  minus: '−', ne: '≠', le: '≤', ge: '≥', infin: '∞', ensp: ' ', emsp: ' ', thinsp: ' ',
  zwnj: '‌', zwj: '‍', check: '✓', hearts: '♥', star: '☆',
};
LATIN1.forEach((name, i) => {
  NAMED[name] = String.fromCharCode(160 + i);
});

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const ok = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return ok ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// Tags that start and end a paragraph (a blank line either side).
const PARAGRAPHS = new Set(['p', 'blockquote', 'table', 'figure', 'fieldset', 'details']);
// Tags that only need a line break.
const LINES = new Set([
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'form', 'tr', 'dt', 'dd', 'address',
  'figcaption', 'summary', 'caption',
]);

export function htmlToText(html) {
  if (html == null || html === '') return '';
  let s = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style|svg|noscript|template|head|iframe|object|canvas)\b[\s\S]*?<\/\1\s*>/gi, ' ');

  let buf = '';
  // Make sure the buffer ends with at least n newlines (a paragraph is 2, a line 1).
  const brk = (n) => {
    if (!buf || /(?:^|\n)(?: {2})*- $/.test(buf)) return; // never strand a bullet from its text
    buf = buf.replace(/[ \t]+$/, '');
    const have = /\n*$/.exec(buf)[0].length;
    if (have < n) buf += '\n'.repeat(n - have);
  };
  let pre = 0;
  let depth = 0; // list nesting
  let cells = 0; // cells so far in the current table row

  for (const part of s.split(/(<\/?[a-zA-Z][^>]*>)/)) {
    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(part);
    if (!tag) {
      const text = decodeEntities(part);
      buf += pre ? text : text.replace(/[ \t\r\n\f]+/g, ' ');
      continue;
    }
    const closing = tag[1] === '/';
    const name = tag[2].toLowerCase();
    if (name === 'br') buf += '\n';
    else if (name === 'hr') brk(2);
    else if (name === 'pre') {
      pre = Math.max(0, pre + (closing ? -1 : 1));
      brk(2);
    } else if (HEADINGS.has(name) || PARAGRAPHS.has(name)) brk(depth > 0 ? 1 : 2);
    else if (name === 'ul' || name === 'ol') {
      depth = Math.max(0, depth + (closing ? -1 : 1));
      brk(closing && depth === 0 ? 2 : 1);
    } else if (name === 'li') {
      if (!closing) {
        brk(1);
        buf += `${'  '.repeat(Math.max(0, depth - 1))}- `;
      }
    } else if (name === 'tr') {
      cells = 0;
      brk(1);
    } else if (name === 'td' || name === 'th') {
      if (!closing && cells++ > 0) buf += ' | ';
    } else if (LINES.has(name)) brk(1);
  }

  const lines = buf
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => {
      line = line.replace(/\s+$/, '');
      const bullet = /^((?: {2})*)- *(.*)$/.exec(line);
      if (bullet) return bullet[2] ? `${bullet[1]}- ${bullet[2]}` : '';
      return line.replace(/^\s+/, '').replace(/[ \t]{2,}/g, ' ');
    });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Pulls the readable part out of a whole web page: its title and the main
// content with navigation, headers, footers and forms removed.
export function pageText(html) {
  const source = String(html ?? '');
  const meta = (name) =>
    new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(source)?.[1] ??
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i').exec(source)?.[1];
  const title = decodeEntities(meta('og:title') ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  let body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(source)?.[1] ?? source;
  body = body.replace(/<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  const inner =
    /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(body)?.[1] ??
    /<[a-z]+[^>]*role=["']main["'][^>]*>([\s\S]*)/i.exec(body)?.[1] ??
    /<article\b[^>]*>([\s\S]*)<\/article>/i.exec(body)?.[1] ??
    body;
  return { title, text: htmlToText(inner) };
}

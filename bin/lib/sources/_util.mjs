// Small helpers every source shares: tidy strings, build a salary line, read a
// date, spot remote/hybrid, pick fields out of XML.

import { decodeEntities } from '../html-text.mjs';

// Text from an API: entities decoded, whitespace collapsed, empty becomes null.
export function clean(value) {
  if (value == null) return null;
  const text = decodeEntities(String(value)).replace(/[\s ]+/g, ' ').trim();
  return text || null;
}

export const unique = (list) => [...new Set(list.map((x) => clean(x)).filter(Boolean))];

// "trade-republic" -> "Trade Republic". Boards that never say the company's name get this.
export function prettySlug(slug) {
  return String(slug)
    .replace(/[-_.]+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

// workplace: only from explicit signals. `api` is the API's own flag, already
// mapped to remote | hybrid | onsite; otherwise the words Remote / Hybrid /
// On-site in the location or title. Anything else stays "unknown".
export function workplaceFrom({ api, text = [] } = {}) {
  if (api) return api;
  const t = text.filter(Boolean).join(' | ');
  const hybrid = /\bhybrid\b/i.test(t);
  const remote = /\bremote\b(?!\s+sensing)/i.test(t);
  const onsite = /\bon-?site\b/i.test(t);
  if (hybrid) return 'hybrid';
  if (remote && onsite) return 'unknown'; // "remote or on-site": the posting says both
  if (remote) return 'remote';
  if (onsite) return 'onsite';
  return 'unknown';
}

const SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };
const PERIODS = { year: 'a year', month: 'a month', week: 'a week', day: 'a day', hour: 'an hour' };
const positive = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null);

// A salary line built from the API's own min / max / currency / period fields.
// Zero means "not given" on several boards. Nothing here is ever guessed.
export function money({ min, max, currency, period } = {}) {
  const lo = positive(min);
  const hi = positive(max);
  if (!lo && !hi) return null;
  const code = currency ? String(currency).toUpperCase() : '';
  const prefix = code ? (SYMBOLS[code] ?? `${code} `) : '';
  const fmt = (n) => `${prefix}${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(n)}`;
  let line;
  if (lo && hi) line = lo === hi ? fmt(lo) : `${fmt(Math.min(lo, hi))}–${fmt(Math.max(lo, hi))}`;
  else line = lo ? `from ${fmt(lo)}` : `up to ${fmt(hi)}`;
  const unit = PERIODS[normalisePeriod(period)];
  return unit ? `${line} ${unit}` : line;
}

export function normalisePeriod(period) {
  const p = String(period ?? '').toLowerCase();
  if (/year|annual|yearly|annum/.test(p)) return 'year';
  if (/month/.test(p)) return 'month';
  if (/week/.test(p)) return 'week';
  if (/day|daily/.test(p)) return 'day';
  if (/hour/.test(p)) return 'hour';
  return null;
}

// Any date a job API hands out -> an ISO string, or null.
export function isoDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const date = new Date(value < 1e11 ? value * 1000 : value); // seconds or milliseconds
    return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('.000Z', 'Z');
  }
  let text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2} [\d:]+ UTC$/.test(text)) text = `${text.slice(0, 10)}T${text.slice(11, -4)}Z`;
  else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(text)) text += 'Z'; // no zone given: the feeds mean UTC
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().replace('.000Z', 'Z');
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// --- XML (Personio, Teamtailor): the feeds are flat enough for a few regexes ---
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function xmlAll(xml, tag) {
  const re = new RegExp(`<${esc(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(tag)}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

export function xmlOne(xml, tag) {
  return xmlAll(xml, tag)[0] ?? null;
}

// The text of an element: CDATA is taken as written, anything else is entity-decoded.
export function xmlText(inner) {
  if (inner == null) return null;
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(inner);
  return (cdata ? cdata[1] : decodeEntities(inner)).trim();
}

// The last step for every posting: tidy the strings, fill the blanks, drop a
// posting that has no title or no link (it can't be saved or opened).
export function finish(job) {
  const title = clean(job.title);
  const company = clean(job.company);
  const url = job.url ? String(job.url).trim() : null;
  if (!title || !url) return null;
  const apply = job.apply_url ? String(job.apply_url).trim() : null;
  return {
    title,
    company: company ?? 'Unknown company',
    company_domain: job.company_domain ?? null,
    location: clean(job.location)?.replace(/,(\s*,)+/g, ',').replace(/^[,;\s]+|[,;\s]+$/g, '') || null,
    workplace: job.workplace || 'unknown',
    url,
    apply_url: apply && apply !== url ? apply : null,
    source: job.source,
    source_id: job.source_id == null ? null : String(job.source_id),
    posted_at: job.posted_at ?? null,
    salary: clean(job.salary),
    description: job.description ? String(job.description).trim() || null : null,
  };
}

// Board ids found in a page's HTML: every capture group 1 of the (global) patterns.
export function scanSlugs(text, patterns, ignore = []) {
  const found = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      let slug = m[1];
      try {
        slug = decodeURIComponent(slug);
      } catch {
        // leave it as written
      }
      if (slug && !ignore.includes(slug.toLowerCase())) found.push(slug);
    }
  }
  return found;
}

export const enc = encodeURIComponent;

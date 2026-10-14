// The registry: every source the CLI knows, in the order `sources` lists them,
// plus the helpers that turn a URL or a page of HTML into a board.

import adzuna from './adzuna.mjs';
import arbeitnow from './arbeitnow.mjs';
import ashby from './ashby.mjs';
import greenhouse from './greenhouse.mjs';
import himalayas from './himalayas.mjs';
import hn from './hn.mjs';
import jobicy from './jobicy.mjs';
import lever from './lever.mjs';
import personio from './personio.mjs';
import recruitee from './recruitee.mjs';
import reed from './reed.mjs';
import remoteok from './remoteok.mjs';
import remotive from './remotive.mjs';
import smartrecruiters from './smartrecruiters.mjs';
import teamtailor from './teamtailor.mjs';
import workable from './workable.mjs';

export const SOURCES = [
  greenhouse, lever, ashby, workable, smartrecruiters, recruitee, personio, teamtailor,
  remotive, remoteok, arbeitnow, himalayas, jobicy, hn, adzuna, reed,
];
export const byName = new Map(SOURCES.map((s) => [s.name, s]));
export const BOARDS = SOURCES.filter((s) => s.type === 'company board');

// A posting or board URL on a system we know -> { src, slug, id }, else null.
// `boardsOnly` leaves out Hacker News links (detect wants companies, show wants both).
export function refFromUrl(href, { boardsOnly = false } = {}) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  for (const src of boardsOnly ? BOARDS : SOURCES) {
    const ref = src.fromUrl?.(u);
    if (ref) return { src, ...ref };
  }
  return null;
}

// Boards a page links to or embeds, most mentioned first.
export function boardsInHtml(html) {
  const found = new Map();
  for (const src of BOARDS) {
    for (const slug of src.scan(html)) {
      const key = `${src.name}/${src.name === 'smartrecruiters' ? slug : slug.toLowerCase()}`;
      const hit = found.get(key) ?? { src, slug, hits: 0 };
      hit.hits++;
      found.set(key, hit);
    }
  }
  return [...found.values()].sort((a, b) => b.hits - a.hits);
}

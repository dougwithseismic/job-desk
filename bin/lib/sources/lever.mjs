// Lever job boards: api.lever.co/v0/postings/<slug>, no key. Companies hosted
// in Lever's EU region live on api.eu.lever.co, so a 404 on the first is tried
// on the second. The API never names the company, so it comes from the slug.

import { htmlToText } from '../html-text.mjs';
import { HttpError } from './_http.mjs';
import { enc, finish, isoDate, money, prettySlug, scanSlugs, unique, workplaceFrom } from './_util.mjs';

const REGIONS = ['https://api.lever.co', 'https://api.eu.lever.co'];
const WORKPLACE = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite', 'on-site': 'onsite' };
const INTERVAL = { 'per-year-salary': 'year', 'per-month-salary': 'month', 'per-week-salary': 'week', 'per-day-wage': 'day', 'per-hour-wage': 'hour' };

function description(j) {
  const parts = [htmlToText(j.description ?? j.descriptionBody ?? '')];
  for (const list of j.lists ?? []) parts.push(`${list.text}\n${htmlToText(list.content)}`);
  parts.push(htmlToText(j.additional ?? ''));
  return parts.filter(Boolean).join('\n\n');
}

function normalise(j, slug) {
  const places = unique([j.categories?.location, ...(j.categories?.allLocations ?? [])]);
  const range = j.salaryRange;
  return finish({
    title: j.text,
    company: prettySlug(slug),
    location: places.join('; '),
    workplace: workplaceFrom({ api: WORKPLACE[String(j.workplaceType).toLowerCase()], text: [places.join(' '), j.text] }),
    url: j.hostedUrl,
    apply_url: j.applyUrl,
    source: 'lever',
    source_id: j.id,
    posted_at: isoDate(j.createdAt),
    salary: range ? money({ min: range.min, max: range.max, currency: range.currency, period: INTERVAL[range.interval] }) : null,
    description: description(j),
  });
}

// Tries the US region, then the EU one. Returns the first that knows the slug.
async function region(path, get) {
  let missing;
  for (const base of REGIONS) {
    try {
      return await get(`${base}/v0/postings/${path}`);
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 404) throw err;
      missing = err;
    }
  }
  throw missing;
}

export default {
  name: 'lever',
  type: 'company board',
  coverage: 'Lever boards (US and EU), any company',
  needs: [],
  slugHelp: 'the name in jobs.lever.co/<slug>',

  boardUrl: (slug) => `https://jobs.lever.co/${slug}`,

  fromUrl(u) {
    if (!/^jobs(?:\.eu)?\.lever\.co$/.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] ? { slug: parts[0], id: parts[1] ?? null } : null;
  },

  scan: (html) =>
    scanSlugs(html, [/jobs(?:\.eu)?\.lever\.co\/([\w.-]+)/g, /api(?:\.eu)?\.lever\.co\/v0\/postings\/([\w.-]+)/g], ['embed']),

  async list({ slug, get }) {
    const data = await region(`${enc(slug)}?mode=json`, get);
    return { jobs: (Array.isArray(data) ? data : []).map((j) => normalise(j, slug)).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    return normalise(await region(`${enc(slug)}/${enc(id)}`, get), slug);
  },
};

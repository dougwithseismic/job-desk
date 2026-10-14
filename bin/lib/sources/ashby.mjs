// Ashby job boards: api.ashbyhq.com/posting-api/job-board/<slug>, no key.
// includeCompensation=true adds pay where the company publishes it. The API
// does not name the company, so that comes from the slug.

import { htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, money, normalisePeriod, prettySlug, scanSlugs, unique, workplaceFrom } from './_util.mjs';

const API = 'https://api.ashbyhq.com/posting-api/job-board';
const WORKPLACE = { remote: 'remote', hybrid: 'hybrid', onsite: 'onsite' };

// Ashby's own one-line summary when it has one ("$131K - $191K"), else the
// salary component's min / max / currency / interval.
function pay(comp) {
  if (!comp) return null;
  if (comp.scrapeableCompensationSalarySummary) return comp.scrapeableCompensationSalarySummary;
  const salary = (comp.summaryComponents ?? []).find((c) => c.compensationType === 'Salary');
  return salary ? money({ min: salary.minValue, max: salary.maxValue, currency: salary.currencyCode, period: normalisePeriod(salary.interval) }) : null;
}

function normalise(j, slug) {
  const places = unique([j.location, ...(j.secondaryLocations ?? []).map((l) => l.location)]);
  const api = WORKPLACE[String(j.workplaceType ?? '').toLowerCase()] ?? (j.isRemote === true ? 'remote' : undefined);
  return finish({
    title: j.title,
    company: prettySlug(slug),
    location: places.join('; '),
    workplace: workplaceFrom({ api, text: [places.join(' '), j.title] }),
    url: j.jobUrl,
    apply_url: j.applyUrl,
    source: 'ashby',
    source_id: j.id,
    posted_at: isoDate(j.publishedAt),
    salary: pay(j.compensation),
    description: htmlToText(j.descriptionHtml ?? j.descriptionPlain ?? ''),
  });
}

async function board(slug, get) {
  const data = await get(`${API}/${enc(slug)}?includeCompensation=true`);
  return (data.jobs ?? []).filter((j) => j.isListed !== false);
}

export default {
  name: 'ashby',
  type: 'company board',
  coverage: 'Ashby boards, any company; pay shown',
  needs: [],
  slugHelp: 'the name in jobs.ashbyhq.com/<slug>',

  boardUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,

  fromUrl(u) {
    if (u.hostname !== 'jobs.ashbyhq.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] && parts[0] !== 'embed' ? { slug: parts[0], id: parts[1] ?? null } : null;
  },

  scan: (html) =>
    scanSlugs(html, [/jobs\.ashbyhq\.com\/([\w.%-]+)/g, /api\.ashbyhq\.com\/posting-api\/job-board\/([\w.%-]+)/g], ['embed', 'api']),

  async list({ slug, get }) {
    return { jobs: (await board(slug, get)).map((j) => normalise(j, slug)).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    const found = (await board(slug, get)).find((j) => j.id === id);
    if (!found) throw new Error(`Posting ${id} is not on the ${slug} board any more. It may have closed.`);
    return normalise(found, slug);
  },
};

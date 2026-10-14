// SmartRecruiters: api.smartrecruiters.com/v1/companies/<slug>/postings, no key.
// The list has no description or pay, only the basics, so the full text comes
// from the one-posting call: show uses it, and so does enrich() for the few
// postings being saved. The slug is case-sensitive (BoschGroup).

import { htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, scanSlugs, workplaceFrom } from './_util.mjs';

const API = 'https://api.smartrecruiters.com/v1/companies';
const PAGE = 100;

const link = (company, id) => `https://jobs.smartrecruiters.com/${company}/${id}`;

function normalise(j, slug) {
  const loc = j.location ?? {};
  return finish({
    title: j.name,
    company: j.company?.name,
    location: loc.fullLocation || [loc.city, loc.region, loc.country?.toUpperCase()].filter(Boolean).join(', '),
    workplace: workplaceFrom({ api: loc.remote === true ? 'remote' : loc.hybrid === true ? 'hybrid' : undefined, text: [j.name] }),
    url: link(j.company?.identifier ?? slug, j.id),
    source: 'smartrecruiters',
    source_id: j.id,
    posted_at: isoDate(j.releasedDate),
    salary: null,
    description: null,
  });
}

function fullText(detail) {
  const sections = detail.jobAd?.sections ?? {};
  return ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
    .map((key) => sections[key])
    .filter((s) => s?.text)
    .map((s) => `${s.title ?? ''}\n${htmlToText(s.text)}`.trim())
    .join('\n\n');
}

async function detail(slug, id, get) {
  const j = await get(`${API}/${enc(slug)}/postings/${enc(id)}`);
  const job = normalise(j, slug);
  job.description = fullText(j) || null;
  if (j.applyUrl) job.apply_url = j.applyUrl;
  return job;
}

export default {
  name: 'smartrecruiters',
  type: 'company board',
  coverage: 'SmartRecruiters boards; full text on save',
  needs: [],
  enriches: 'description', // what enrich() adds to a posting the list left bare
  slugHelp: 'the name in careers.smartrecruiters.com/<Slug>, capitals as written',

  boardUrl: (slug) => `https://careers.smartrecruiters.com/${slug}`,

  fromUrl(u) {
    if (!/^(?:jobs|careers)\.smartrecruiters\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] ? { slug: parts[0], id: /^\d+/.exec(parts[1] ?? '')?.[0] ?? null } : null;
  },

  scan: (html) =>
    scanSlugs(html, [/(?:jobs|careers)\.smartrecruiters\.com\/([\w.-]+)/g, /api\.smartrecruiters\.com\/v1\/companies\/([\w.-]+)/g], [
      'oneclick-ui',
      'static',
      'embed',
    ]),

  // Big companies have thousands of postings: search server-side with --q when
  // given (the API searches the whole posting, our title filter then narrows),
  // and read at most 5 pages of 100 per search.
  async list({ slug, q = [], pages, get }) {
    const searches = q.length ? q : [null];
    const maxPages = pages ?? 5;
    const byId = new Map();
    const notes = [];
    let total = null; // every posting on the board, when the whole board was asked for
    await Promise.all(
      searches.map(async (term) => {
        for (let page = 0; page < maxPages; page++) {
          const url = `${API}/${enc(slug)}/postings?limit=${PAGE}&offset=${page * PAGE}${term ? `&q=${enc(term)}` : ''}`;
          const data = await get(url);
          for (const j of data.content ?? []) byId.set(j.id, j);
          const found = data.totalFound ?? 0;
          if (!term) total = found;
          if ((page + 1) * PAGE >= found || !data.content?.length) return;
          if (page === maxPages - 1) notes.push(`${term ? `"${term}": ` : ''}read the newest ${maxPages * PAGE} of ${found} postings; narrow with --q or raise --pages`);
        }
      }),
    );
    return { jobs: [...byId.values()].map((j) => normalise(j, slug)).filter(Boolean), notes, total };
  },

  one: ({ slug, id }, { get }) => detail(slug, id, get),

  // Fills in the description (the list has none).
  async enrich(job, { slug, get }) {
    if (job.description || !job.source_id) return;
    try {
      const full = await detail(slug ?? job.url.split('/')[3], job.source_id, get);
      job.description = full.description;
      job.apply_url = full.apply_url ?? job.apply_url;
    } catch {
      // closed since the list: keep what we have
    }
  },
};

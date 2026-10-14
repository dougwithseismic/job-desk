// Greenhouse job boards: boards-api.greenhouse.io, no key. The slug is the
// board token (boards.greenhouse.io/<slug>). The list has the full posting but
// no pay; the single-job call has pay_input_ranges, so enrich() adds it.

import { decodeEntities, htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, money, scanSlugs, workplaceFrom } from './_util.mjs';

const API = 'https://boards-api.greenhouse.io/v1/boards';
const HOSTS = /^(?:job-)?boards(?:\.eu)?\.greenhouse\.io$/;

// pay_input_ranges: amounts in cents, the period only in the range's own title.
function pay(ranges) {
  if (!Array.isArray(ranges) || !ranges.length) return null;
  const lines = ranges
    .map((r) => {
      const title = String(r.title ?? '');
      const line = money({
        min: r.min_cents / 100,
        max: r.max_cents / 100,
        currency: r.currency_type,
        period: /annual|year/i.test(title) ? 'year' : /month/i.test(title) ? 'month' : /hour/i.test(title) ? 'hour' : null,
      });
      return line && ranges.length > 1 && title ? `${title}: ${line}` : line;
    })
    .filter(Boolean);
  return lines.join('; ') || null;
}

function normalise(j) {
  const raw = j.content ?? '';
  // The API sends the HTML escaped (&lt;p&gt;), so it is decoded once before reading it as HTML.
  const html = raw.includes('<') ? raw : decodeEntities(raw);
  return finish({
    title: j.title,
    company: j.company_name,
    location: j.location?.name,
    workplace: workplaceFrom({ text: [j.location?.name, j.title] }),
    url: j.absolute_url,
    source: 'greenhouse',
    source_id: j.id,
    posted_at: isoDate(j.first_published ?? j.updated_at),
    salary: pay(j.pay_input_ranges),
    description: htmlToText(html),
  });
}

export default {
  name: 'greenhouse',
  type: 'company board',
  coverage: 'Greenhouse boards, any company',
  needs: [],
  enriches: 'salary', // what enrich() adds to a posting the list left bare
  slugHelp: 'the board token in boards.greenhouse.io/<slug>',

  boardUrl: (slug) => `https://boards.greenhouse.io/${slug}`,

  fromUrl(u) {
    if (!HOSTS.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'embed') return u.searchParams.get('for') ? { slug: u.searchParams.get('for'), id: u.searchParams.get('token') } : null;
    if (!parts[0]) return null;
    return { slug: parts[0], id: parts[1] === 'jobs' ? parts[2] : null };
  },

  scan: (html) =>
    scanSlugs(
      html,
      [
        /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([\w-]+)/g,
        /boards-api\.greenhouse\.io\/v1\/boards\/([\w-]+)/g,
        /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([\w-]+)/g,
      ],
      ['embed', 'v1', 'api'],
    ),

  async list({ slug, get }) {
    const data = await get(`${API}/${enc(slug)}/jobs?content=true`);
    return { jobs: (data.jobs ?? []).map(normalise).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    const j = await get(`${API}/${enc(slug)}/jobs/${enc(id)}?pay_transparency=true`);
    return normalise(j);
  },

  // Pay lives only on the single-job call.
  async enrich(job, { slug, get }) {
    if (job.salary || !slug || !job.source_id) return;
    try {
      const j = await get(`${API}/${enc(slug)}/jobs/${enc(job.source_id)}?pay_transparency=true`);
      job.salary = pay(j.pay_input_ranges);
    } catch {
      // the posting may have closed since the list: keep what we have
    }
  },
};

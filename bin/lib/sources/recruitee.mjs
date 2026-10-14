// Recruitee: <slug>.recruitee.com/api/offers/, no key. Full posting, and pay
// when the company fills it in.

import { htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, money, scanSlugs, unique, workplaceFrom } from './_util.mjs';

const base = (slug) => `https://${enc(slug)}.recruitee.com/api/offers`;

function normalise(o) {
  const places = unique((o.locations?.length ? o.locations : [o]).map((l) => unique([l.city, l.country]).join(', ') || l.location));
  const api = o.remote === true ? 'remote' : o.hybrid === true ? 'hybrid' : o.on_site === true ? 'onsite' : undefined;
  return finish({
    title: o.title,
    company: o.company_name,
    location: places.join('; '),
    workplace: workplaceFrom({ api, text: [places.join(' '), o.title] }),
    url: o.careers_url,
    apply_url: o.careers_apply_url,
    source: 'recruitee',
    source_id: o.id,
    posted_at: isoDate(o.published_at ?? o.created_at),
    salary: o.salary ? money({ min: o.salary.min, max: o.salary.max, currency: o.salary.currency, period: o.salary.period }) : null,
    description: [htmlToText(o.description ?? ''), htmlToText(o.requirements ?? '')].filter(Boolean).join('\n\n'),
  });
}

export default {
  name: 'recruitee',
  type: 'company board',
  coverage: 'Recruitee boards, any company',
  needs: [],
  slugHelp: 'the subdomain in <slug>.recruitee.com',

  boardUrl: (slug) => `https://${slug}.recruitee.com`,

  fromUrl(u) {
    const m = /^([a-z0-9-]+)\.recruitee\.com$/.exec(u.hostname);
    if (!m || ['www', 'api', 'app'].includes(m[1])) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return { slug: m[1], id: parts[0] === 'o' ? parts[1] : null };
  },

  scan: (html) =>
    scanSlugs(html, [/([a-z0-9-]+)\.recruitee\.com/g], ['www', 'api', 'app', 'support', 'help', 'status', 'blog', 'docs', 'careers']),

  async list({ slug, get }) {
    const data = await get(`${base(slug)}/`);
    return { jobs: (data.offers ?? []).filter((o) => o.status === undefined || o.status === 'published').map(normalise).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    const data = await get(`${base(slug)}/${enc(id)}`);
    return normalise(data.offer);
  },
};

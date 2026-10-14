// Workable job boards: apply.workable.com's public widget feed, no key.
// details=true adds each posting's description. Pay is not in this feed.

import { htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, prettySlug, scanSlugs, unique, workplaceFrom } from './_util.mjs';

const API = 'https://apply.workable.com/api/v1/widget/accounts';

function normalise(j, slug, company) {
  const places = unique(
    (j.locations?.length ? j.locations : [j]).map((l) => unique([l.city, l.region ?? l.state, l.country]).join(', ')),
  );
  return finish({
    title: j.title,
    company: company ?? prettySlug(slug),
    location: places.join('; '),
    workplace: workplaceFrom({ api: j.telecommuting === true ? 'remote' : undefined, text: [places.join(' '), j.title] }),
    url: `https://apply.workable.com/${slug}/j/${j.shortcode}`,
    apply_url: j.application_url,
    source: 'workable',
    source_id: j.shortcode,
    posted_at: isoDate(j.published_on ?? j.created_at),
    salary: null,
    description: htmlToText(j.description ?? ''),
  });
}

async function board(slug, get) {
  return get(`${API}/${enc(slug)}?details=true`);
}

export default {
  name: 'workable',
  type: 'company board',
  coverage: 'Workable boards, any company',
  needs: [],
  slugHelp: 'the name in apply.workable.com/<slug>',

  boardUrl: (slug) => `https://apply.workable.com/${slug}/`,

  fromUrl(u) {
    if (u.hostname !== 'apply.workable.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'j') return { slug: null, id: parts[1] ?? null }; // short link: the slug comes from its redirect
    if (!parts[0] || ['api', 'embed'].includes(parts[0])) return null;
    return { slug: parts[0], id: parts[1] === 'j' ? parts[2] : null };
  },

  scan: (html) =>
    scanSlugs(html, [/apply\.workable\.com\/(?:api\/v\d\/(?:widget\/)?accounts\/)?([\w.-]+)/g], ['j', 'api', 'embed', 'static']),

  async list({ slug, get }) {
    const data = await board(slug, get);
    return { jobs: (data.jobs ?? []).map((j) => normalise(j, slug, data.name)).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    const data = await board(slug, get);
    const found = (data.jobs ?? []).find((j) => j.shortcode === id);
    if (!found) throw new Error(`Posting ${id} is not on the ${slug} board any more. It may have closed.`);
    return normalise(found, slug, data.name);
  },
};

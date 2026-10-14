// Teamtailor: <slug>.teamtailor.com/jobs.rss, a public RSS feed that needs no
// key. Full description, department and locations; no pay.

import { htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, scanSlugs, unique, workplaceFrom, xmlAll, xmlOne, xmlText } from './_util.mjs';

const REMOTE = { fully: 'remote', hybrid: 'hybrid' }; // "none" and "temporary" say nothing firm, so they stay unknown

async function feed(slug, get) {
  const xml = await get(`https://${enc(slug)}.teamtailor.com/jobs.rss`, { as: 'xml' });
  if (!xml.includes('<rss')) throw new Error(`${slug}.teamtailor.com did not return a job feed. Check the slug.`);
  return xml;
}

function normalise(item, company) {
  const places = unique(
    xmlAll(item, 'tt:location').map((l) => unique([xmlText(xmlOne(l, 'tt:city')) || xmlText(xmlOne(l, 'tt:name')), xmlText(xmlOne(l, 'tt:country'))]).join(', ')),
  );
  const title = xmlText(xmlOne(item, 'title'));
  const link = xmlText(xmlOne(item, 'link'));
  return finish({
    title,
    company,
    location: places.join('; '),
    workplace: workplaceFrom({ api: REMOTE[xmlText(xmlOne(item, 'remoteStatus'))], text: [places.join(' '), title] }),
    url: link,
    source: 'teamtailor',
    source_id: /\/jobs\/(\d+)/.exec(link ?? '')?.[1] ?? xmlText(xmlOne(item, 'guid')),
    posted_at: isoDate(xmlText(xmlOne(item, 'pubDate'))),
    salary: null,
    description: htmlToText(xmlText(xmlOne(item, 'description')) ?? ''),
  });
}

const company = (xml) => xmlText(xmlOne(xml.slice(0, xml.indexOf('<item>') > 0 ? xml.indexOf('<item>') : undefined), 'title'));

export default {
  name: 'teamtailor',
  type: 'company board',
  coverage: 'Teamtailor boards; Nordics and Europe',
  needs: [],
  slugHelp: 'the subdomain in <slug>.teamtailor.com',

  boardUrl: (slug) => `https://${slug}.teamtailor.com/jobs`,

  fromUrl(u) {
    const m = /^([a-z0-9-]+)\.teamtailor\.com$/.exec(u.hostname);
    if (!m || ['www', 'app', 'api', 'support', 'help', 'docs', 'status', 'partner', 'partners', 'blog', 'login'].includes(m[1])) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return { slug: m[1], id: parts[0] === 'jobs' ? /^\d+/.exec(parts[1] ?? '')?.[0] ?? null : null };
  },

  scan: (html) =>
    scanSlugs(html, [/([a-z0-9-]+)\.teamtailor\.com/g], ['www', 'app', 'api', 'support', 'help', 'docs', 'status', 'partner', 'partners', 'blog', 'login', 'cdn', 'assets']),

  async list({ slug, get }) {
    const xml = await feed(slug, get);
    const name = company(xml);
    return { jobs: xmlAll(xml, 'item').map((item) => normalise(item, name)).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    const xml = await feed(slug, get);
    const item = xmlAll(xml, 'item').find((i) => (xmlText(xmlOne(i, 'link')) ?? '').includes(`/jobs/${id}`));
    if (!item) throw new Error(`Posting ${id} is not on the ${slug} board any more. It may have closed.`);
    return normalise(item, company(xml));
  },
};

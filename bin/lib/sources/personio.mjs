// Personio: <slug>.jobs.personio.de/xml (or .com), no key. A flat XML feed
// with the full description in sections. No pay, no link to the posting, so
// the link is built: <slug>.jobs.personio.<tld>/job/<id>.

import { htmlToText } from '../html-text.mjs';
import { HttpError } from './_http.mjs';
import { enc, finish, isoDate, prettySlug, scanSlugs, unique, workplaceFrom, xmlAll, xmlOne, xmlText } from './_util.mjs';

const TLDS = ['de', 'com'];

async function feed(slug, get) {
  let missing;
  for (const tld of TLDS) {
    try {
      const xml = await get(`https://${enc(slug)}.jobs.personio.${tld}/xml`, { as: 'xml' });
      if (!xml.includes('<workzag-jobs')) throw new HttpError(404, `https://${slug}.jobs.personio.${tld}/xml`, 'not a Personio feed');
      return { xml, tld };
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 404) throw err;
      missing = err;
    }
  }
  throw missing;
}

function normalise(block, slug, tld) {
  const id = xmlText(xmlOne(block, 'id'));
  const name = xmlText(xmlOne(block, 'name'));
  const offices = unique([xmlText(xmlOne(block, 'office')), ...xmlAll(xmlOne(block, 'additionalOffices') ?? '', 'office').map(xmlText)]);
  const sections = xmlAll(block, 'jobDescription').map((s) => {
    const heading = xmlText(xmlOne(s, 'name'));
    const body = htmlToText(xmlText(xmlOne(s, 'value')) ?? '');
    return heading && body ? `${heading}\n${body}` : body;
  });
  return finish({
    title: name,
    company: prettySlug(slug),
    location: offices.join('; '),
    workplace: workplaceFrom({ text: [offices.join(' '), name] }),
    url: `https://${slug}.jobs.personio.${tld}/job/${id}`,
    source: 'personio',
    source_id: id,
    posted_at: isoDate(xmlText(xmlOne(block, 'createdAt'))),
    salary: null,
    description: sections.filter(Boolean).join('\n\n'),
  });
}

export default {
  name: 'personio',
  type: 'company board',
  coverage: 'Personio boards; German-speaking Europe',
  needs: [],
  slugHelp: 'the subdomain in <slug>.jobs.personio.de',

  boardUrl: (slug) => `https://${slug}.jobs.personio.de`,

  fromUrl(u) {
    const m = /^([a-z0-9-]+)\.jobs\.personio\.(?:de|com)$/.exec(u.hostname);
    if (!m) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return { slug: m[1], id: parts[0] === 'job' ? parts[1] : null };
  },

  scan: (html) => scanSlugs(html, [/([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/g], ['www', 'api']),

  async list({ slug, get }) {
    const { xml, tld } = await feed(slug, get);
    return { jobs: xmlAll(xml, 'position').map((b) => normalise(b, slug, tld)).filter(Boolean) };
  },

  async one({ slug, id }, { get }) {
    const { xml, tld } = await feed(slug, get);
    const block = xmlAll(xml, 'position').find((b) => xmlText(xmlOne(b, 'id')) === String(id));
    if (!block) throw new Error(`Posting ${id} is not on the ${slug} board any more. It may have closed.`);
    return normalise(block, slug, tld);
  },
};

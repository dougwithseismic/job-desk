// Any other posting page, best effort (used by `show` and `detect`, not a
// source you can fetch). Reads schema.org JobPosting data when the page has it,
// which many careers pages do, otherwise the page's main text.

import { decodeEntities, htmlToText, pageText } from '../html-text.mjs';
import { getFull } from './_http.mjs';
import { clean, finish, hostOf, isoDate, money, normalisePeriod, unique, workplaceFrom } from './_util.mjs';

export async function fetchPage(url, { fresh } = {}) {
  const { body, finalUrl } = await getFull(url, { source: 'page', as: 'text', fresh });
  return { html: body, finalUrl };
}

const asList = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function findPosting(node) {
  if (Array.isArray(node)) return node.map(findPosting).find(Boolean) ?? null;
  if (!node || typeof node !== 'object') return null;
  if (asList(node['@type']).includes('JobPosting')) return node;
  return findPosting(node['@graph']);
}

function place(l) {
  const a = l?.address ?? l;
  const country = typeof a?.addressCountry === 'object' ? a.addressCountry?.name : a?.addressCountry;
  return unique([a?.addressLocality, a?.addressRegion, country]).join(', ');
}

function fromJsonLd(p, url) {
  const org = typeof p.hiringOrganization === 'string' ? { name: p.hiringOrganization } : (p.hiringOrganization ?? {});
  const places = unique(asList(p.jobLocation).map(place));
  const telecommute = String(p.jobLocationType ?? '').toUpperCase() === 'TELECOMMUTE';
  const base = p.baseSalary?.value ?? p.baseSalary;
  const raw = String(p.description ?? '');
  const salary = base
    ? money({ min: base.minValue ?? base.value, max: base.maxValue ?? base.value, currency: p.baseSalary?.currency ?? base.currency, period: normalisePeriod(base.unitText) })
    : null;
  return finish({
    title: decodeEntities(p.title ?? p.name ?? ''),
    company: decodeEntities(org.name ?? ''),
    company_domain: hostOf(org.sameAs ?? org.url ?? ''),
    location: places.join('; '),
    workplace: workplaceFrom({ api: telecommute ? 'remote' : undefined, text: [places.join(' '), p.title] }),
    url,
    source: 'page',
    source_id: null,
    posted_at: isoDate(p.datePosted),
    salary,
    description: htmlToText(raw.includes('<') ? raw : decodeEntities(raw)),
  });
}

// -> { job, thin }. thin: the page had little or no readable text, which
// usually means it is built in the browser and has to be opened there.
export async function readPage(url, { fresh } = {}) {
  const { html, finalUrl } = await fetchPage(url, { fresh });
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const posting = findPosting(JSON.parse(m[1].trim()));
      const job = posting && fromJsonLd(posting, finalUrl);
      if (job?.description) return { job, thin: false };
    } catch {
      // not valid JSON: try the next block
    }
  }
  const { title, text } = pageText(html);
  const job = {
    title: clean(title) ?? hostOf(finalUrl) ?? finalUrl,
    company: hostOf(finalUrl) ?? 'Unknown company',
    company_domain: null,
    location: null,
    workplace: 'unknown',
    url: finalUrl,
    apply_url: null,
    source: 'page',
    source_id: null,
    posted_at: null,
    salary: null,
    description: text || null,
  };
  return { job, thin: text.length < 300 };
}

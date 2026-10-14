// Hacker News "Ask HN: Who is hiring?": the latest monthly thread by the
// whoishiring account, read through hn.algolia.com. No key. Each top-level
// comment is one employer's post. The first line is usually
// "Company | Role | Location | ...", read here best-effort: the title is a
// guess, so --q searches the whole comment, not just the title. url is the
// comment's own HN link.

import { htmlToText } from '../html-text.mjs';
import { clean, finish, hostOf, isoDate, unique, workplaceFrom } from './_util.mjs';

const SEARCH = 'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=10';

const ROLE = /\b(engineers?|engineering|developers?|designers?|design|managers?|leads?|directors?|heads?|scientists?|analysts?|architects?|specialists?|consultants?|researchers?|writers?|marketing|sales|recruiters?|operations|product|devops|sre|interns?|founding|principal|staff|senior|junior|cto|vp|support|success|accounts?|executives?|associates?|programmers?|administrators?|officers?|strategists?|producers?|editors?|artists?|technicians?|roles?|positions?|hiring|data|ml|ai|frontend|backend|full[- ]?stack|ios|android|qa|growth|ops)\b/i;
const NOT_A_ROLE = /^(full|part)[- ]?time\b|^contract\b|^freelance\b|^intern(ship)?s?\b|^permanent\b|^visa\b|^relocation\b|^apply\b|^we('| a)re hiring|^equity\b|^\d+\s*(day|hour)/i;
const WORKPLACE = /\b(remote|hybrid|on-?site|in[- ]office)\b/i;
const PLACE = /\b(london|uk|united kingdom|england|scotland|berlin|germany|munich|paris|france|amsterdam|netherlands|dublin|ireland|europe|eu|emea|nyc|new york|san francisco|sf|bay area|boston|seattle|austin|chicago|los angeles|la|toronto|canada|usa|us|united states|india|worldwide|global|anywhere|zurich|switzerland|barcelona|madrid|spain|lisbon|portugal|poland|warsaw|singapore|sydney|australia|tel aviv|israel|brazil|latam|apac)\b/i;
const MONEY = /[$£€]\s?\d|\b\d[\d,.]*\s?[kK]?\s?(?:USD|EUR|GBP|CHF|CAD|AUD)\b|\b(?:USD|EUR|GBP|CHF|CAD|AUD)\s?\d/;
const URL_RE = /https?:\/\/[^\s)|,]+|\bwww\.[^\s)|,]+/gi;
// Links that tell us nothing about the employer's own domain.
const SKIP_DOMAINS = /(^|\.)(news\.ycombinator\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|recruitee\.com|personio\.(?:de|com)|teamtailor\.com|linkedin\.com|github\.com|twitter\.com|x\.com|notion\.site|google\.com|forms\.gle|bit\.ly)$/i;

export function parseFirstLine(line) {
  const urls = [...line.matchAll(URL_RE)].map((m) => m[0]);
  const pipes = line.includes('|');
  const parts = (pipes ? line.split(/\s*\|\s*/) : line.split(/\s+[—–•·]\s+|\s+-\s+/)).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  // The company is the first part, without links or a trailing "(Remote US)".
  let company = parts[0].replace(URL_RE, '').replace(/\(\s*\)/g, '').trim();
  const places = [];
  const paren = /\(([^)]*)\)\s*$/.exec(company);
  if (paren && (WORKPLACE.test(paren[1]) || PLACE.test(paren[1]))) {
    places.push(paren[1]);
    company = company.slice(0, paren.index).trim();
  }
  if (company.length > 60) company = company.slice(0, 60).replace(/\s+\S*$/, '').replace(/[-–—,:;]+$/, '').trim();

  let salary = null;
  const roles = [];
  const signals = [company, paren?.[1]].filter(Boolean);
  for (const raw of parts.slice(1)) {
    const part = raw.replace(URL_RE, '').trim();
    if (!part || part.length > 90) continue; // empty, or prose rather than a field
    if (WORKPLACE.test(part)) signals.push(part);
    if (MONEY.test(part)) salary ??= part;
    else if (NOT_A_ROLE.test(part)) continue;
    else {
      const isRole = ROLE.test(part);
      const isPlace = WORKPLACE.test(part) || PLACE.test(part) || /,\s*[A-Z][A-Za-z]/.test(part);
      if (isRole) roles.push(part);
      const bare = /^(remote|hybrid|on-?site|in[- ]office)\b[\s+]*$/i.test(part); // says how, not where
      if (isPlace && !bare && (!isRole || WORKPLACE.test(part))) places.push(part);
    }
  }
  const place = unique(places).join('; ');
  const workplace = workplaceFrom({ text: signals.filter((x) => WORKPLACE.test(x)).map((x) => x.replace(/\bin[- ]office\b/i, 'onsite')) });
  const domain = urls.map((u) => hostOf(u.startsWith('http') ? u : `https://${u}`)).find((h) => h && !SKIP_DOMAINS.test(h)) ?? null;
  return { company, title: unique(roles).slice(0, 3).join(' / ').slice(0, 120) || null, location: place || null, workplace, salary, domain };
}

async function latestThread(get) {
  const search = await get(SEARCH);
  const hit = (search.hits ?? []).find((h) => /^Ask HN: Who is hiring\?/i.test(h.title ?? ''));
  if (!hit) throw new Error('Could not find the latest "Who is hiring?" thread on hn.algolia.com.');
  return get(`https://hn.algolia.com/api/v1/items/${hit.objectID}`);
}

function normalise(comment) {
  if (!comment.text || comment.author == null) return null; // deleted or dead
  const text = htmlToText(comment.text);
  const first = parseFirstLine(text.split('\n')[0] ?? '');
  if (!first?.company) return null;
  // Meta replies ("there used to be 800+ posts here") have no role, place or pay.
  if (!first.title && !first.location && !first.salary && text.length < 200) return null;
  return finish({
    title: first.title ?? `Open roles at ${clean(first.company)}`,
    company: clean(first.company),
    company_domain: first.domain,
    location: first.location,
    workplace: first.workplace,
    url: `https://news.ycombinator.com/item?id=${comment.id}`,
    source: 'hn',
    source_id: comment.id,
    posted_at: isoDate(comment.created_at),
    salary: first.salary,
    description: text,
  });
}

export default {
  name: 'hn',
  type: 'job board',
  coverage: 'HN "Who is hiring?", latest month',
  needs: [],
  queryInText: true, // titles are a guess, so --q matches the whole post

  async list({ get }) {
    const thread = await latestThread(get);
    const jobs = (thread.children ?? []).map(normalise).filter(Boolean);
    return { jobs, notes: [`thread: ${thread.title}`] };
  },

  async one({ id }, { get }) {
    const comment = await get(`https://hn.algolia.com/api/v1/items/${id}`);
    const job = normalise(comment);
    if (!job) throw new Error(`HN item ${id} is not a job post.`);
    return job;
  },

  fromUrl(u) {
    if (u.hostname !== 'news.ycombinator.com' || u.pathname !== '/item') return null;
    const id = u.searchParams.get('id');
    return id ? { slug: null, id } : null;
  },
};

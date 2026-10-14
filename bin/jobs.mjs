#!/usr/bin/env node
// The job source fetcher. Pulls postings from public job APIs, normalises them
// to the jobs table's shape, filters them and optionally saves them to the desk.
//
//   node bin/jobs.mjs sources                              every source, and whether its key is set
//   node bin/jobs.mjs fetch greenhouse monzo --q "designer" --where "london|remote" --since 14d
//   node bin/jobs.mjs fetch remoteok --q "product designer|ux designer" --save
//   node bin/jobs.mjs watch --q "designer" --since 14d --save   every company with watch = 1
//   node bin/jobs.mjs detect https://monzo.com/careers --watch "Monzo"
//   node bin/jobs.mjs show <posting url>                   the full text of one posting
//
// Filters (fetch and watch): --q "a|b" title phrases (--anywhere: description too),
// --exclude "intern|junior", --where "london|remote", --since 14d (h, d, w),
// --limit N (default 50 shown). --json prints JSON; --with-description keeps the
// text in it; --fresh skips the six hour cache; --save inserts new jobs as
// stage 'found'. Per source: --country (adzuna, himalayas, jobicy), --pages N,
// --company "Name" (for boards that don't name the company).

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { ROOT } from './lib/paths.mjs';
import { formatTable, openDb } from './lib/sqlite.mjs';
import { HttpError, bindGet, envKey, redirectTarget } from './lib/sources/_http.mjs';
import { SOURCES, boardsInHtml, byName, refFromUrl } from './lib/sources/index.mjs';
import { fetchPage, readPage } from './lib/sources/page.mjs';

const DEFAULT_LIMIT = 50;
const ENRICH_MAX = 60; // most postings we make an extra request for (pay, full text)
const UNFILTERED_SAVE_MAX = 100;
// Boards that forbid automated reading: the agent opens these in the candidate's own browser.
const BROWSER_ONLY = /(^|\.)(linkedin\.com|indeed\.[a-z.]+|glassdoor\.[a-z.]+|welcometothejungle\.com|otta\.com|jobs\.cz|startupjobs\.cz)$/i;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      q: { type: 'string' },
      exclude: { type: 'string' },
      where: { type: 'string' },
      since: { type: 'string' },
      limit: { type: 'string' },
      anywhere: { type: 'boolean' },
      json: { type: 'boolean' },
      'with-description': { type: 'boolean' },
      save: { type: 'boolean' },
      fresh: { type: 'boolean' },
      country: { type: 'string' },
      pages: { type: 'string' },
      company: { type: 'string' },
      watch: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (err) {
  console.error(`Error: ${err.message}\nRun: node bin/jobs.mjs help`);
  process.exit(1);
}
const { values: f, positionals } = args;
const [command, ...rest] = positionals;

// Which source and slug each job came from, for the extra requests (pay, full text).
const origin = new WeakMap();

class UsageError extends Error {}

// ---------- filters ----------

const alternatives = (text) => (text ?? '').split('|').map((s) => s.trim()).filter(Boolean);

// A phrase matches at the start of a word ("design" finds "Designer"). Phrases
// of three letters or fewer, and every --exclude, must be whole words, so "ai"
// doesn't find "Airflow" and "intern" doesn't drop "International". A trailing
// * opens the end of a phrase ("intern*").
function phrase(text, { whole = false } = {}) {
  const open = text.endsWith('*');
  const bare = open ? text.slice(0, -1) : text;
  const body = bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const closed = !open && (whole || [...bare].length <= 3);
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}${closed ? '(?![\\p{L}\\p{N}])' : ''}`, 'iu');
}

function parseFilters() {
  const since = f.since?.match(/^(\d+)\s*([hdw])$/i);
  if (f.since && !since) throw new UsageError('--since needs a number and h, d or w: 48h, 14d, 2w.');
  const unit = { h: 36e5, d: 864e5, w: 6048e5 };
  const limit = f.limit === undefined ? DEFAULT_LIMIT : Number.parseInt(f.limit, 10);
  if (!(limit >= 1)) throw new UsageError('--limit needs a number of 1 or more.');
  if (f.pages !== undefined && !(Number.parseInt(f.pages, 10) >= 1)) throw new UsageError('--pages needs a number of 1 or more.');
  const q = alternatives(f.q);
  const where = alternatives(f.where);
  return {
    q,
    exclude: alternatives(f.exclude),
    where,
    anywhere: Boolean(f.anywhere),
    sinceMs: since ? Date.now() - Number(since[1]) * unit[since[2].toLowerCase()] : null,
    limit,
    limitGiven: f.limit !== undefined,
    qMatchers: q.map((p) => phrase(p)),
    excludeMatchers: alternatives(f.exclude).map((p) => phrase(p, { whole: true })),
    whereMatchers: where.map((p) => ({ remote: p.toLowerCase() === 'remote', re: phrase(p) })),
  };
}

function keep(job, flt) {
  const inText = flt.anywhere || origin.get(job)?.src.queryInText;
  if (flt.qMatchers.length) {
    const hay = inText ? `${job.title}\n${job.description ?? ''}` : job.title;
    if (!flt.qMatchers.some((re) => re.test(hay))) return false;
  }
  if (flt.excludeMatchers.some((re) => re.test(job.title))) return false;
  if (flt.whereMatchers.length) {
    const here = flt.whereMatchers.some((w) => (w.remote && job.workplace === 'remote') || w.re.test(job.location ?? ''));
    if (!here) return false;
  }
  if (flt.sinceMs && job.posted_at && Date.parse(job.posted_at) < flt.sinceMs) return false;
  return true; // no posted_at: kept, and shown as "?"
}

const when = (job) => (job.posted_at ? Date.parse(job.posted_at) : Number.NEGATIVE_INFINITY);
const newestFirst = (a, b) => (when(b) > when(a)) - (when(b) < when(a));

// ---------- fetching ----------

function needKeys(src) {
  const missing = (src.needs ?? []).filter((name) => !envKey(name));
  if (!missing.length) return;
  throw new UsageError(
    `${src.name} needs ${missing.join(' and ')}. ${src.keyHelp}. Set ${missing.length > 1 ? 'them' : 'it'} in the environment, ` +
      `or as ${missing[0]}=... in ${ROOT}/.env (one line each; the values are never printed).`,
  );
}

function explain(err, src, slug) {
  if (err instanceof HttpError) {
    if (err.status === 404 && src.type === 'company board') {
      return new Error(`${src.name} has no board called "${slug}" (404). Check the slug: node bin/jobs.mjs detect <the company's careers page>`);
    }
    if ((err.status === 401 || err.status === 403) && src.needs?.length) {
      return new Error(`${src.name} rejected the key (HTTP ${err.status}). Check ${src.needs.join(' and ')}. ${src.keyHelp}.`);
    }
  }
  return err;
}

// One source (and one board) -> { jobs, notes }.
async function collect(src, slug, flt) {
  needKeys(src);
  const get = bindGet(src.name, f.fresh);
  let result;
  try {
    result = await src.list({
      slug,
      q: flt.q,
      where: flt.where,
      anywhere: flt.anywhere,
      since: flt.sinceMs,
      country: f.country,
      pages: f.pages ? Number.parseInt(f.pages, 10) : undefined,
      get,
    });
  } catch (err) {
    throw explain(err, src, slug);
  }
  for (const job of result.jobs) {
    origin.set(job, { src, slug, get });
    if (f.company && src.type === 'company board') job.company = f.company;
  }
  return { jobs: result.jobs, notes: result.notes ?? [] };
}

// Extra requests for the postings that will be shown or saved: pay on
// Greenhouse, the full text on SmartRecruiters and Reed.
async function enrich(jobs, notes) {
  const wantText = f.save || f['with-description'];
  const todo = jobs.filter((job) => {
    const o = origin.get(job);
    return o?.src.enrich && (o.src.enriches === 'salary' || wantText);
  });
  if (!todo.length) return;
  if (todo.length > ENRICH_MAX) {
    notes.push(`pay or full text not fetched for ${todo.length} postings (more than ${ENRICH_MAX}); narrow the filters`);
    return;
  }
  await Promise.all(todo.map((job) => origin.get(job).src.enrich(job, { slug: origin.get(job).slug, get: origin.get(job).get })));
}

// ---------- the desk ----------

// Splits jobs into new ones and ones the desk already has: the same url, or the
// same company and title (the same role found elsewhere). Two postings of one
// role at one company from one source in different places are both kept.
function plan(db, jobs) {
  const urls = new Set(db.prepare('SELECT url FROM jobs').all().map((r) => r.url));
  const roles = new Map();
  const key = (j) => `${j.company.toLowerCase()}\u0000${j.title.toLowerCase()}`;
  const remember = (j) => roles.set(key(j), [...(roles.get(key(j)) ?? []), j]);
  for (const row of db.prepare('SELECT company, title, source, location FROM jobs').all()) remember(row);
  const fresh = [];
  for (const job of jobs) {
    if (urls.has(job.url)) continue;
    const same = roles.get(key(job)) ?? [];
    const duplicate = same.some(
      (r) => r.source !== job.source || !r.location || !job.location || r.location.toLowerCase() === job.location.toLowerCase(),
    );
    if (duplicate) continue;
    fresh.push(job);
    urls.add(job.url);
    remember(job);
  }
  return fresh;
}

function insert(db, jobs) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO jobs
       (title, company, company_domain, location, workplace, url, apply_url, source, source_id, posted_at, salary, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let saved = 0;
  db.exec('BEGIN');
  try {
    for (const j of jobs) {
      const row = [j.title, j.company, j.company_domain, j.location, j.workplace, j.url, j.apply_url, j.source, j.source_id, j.posted_at, j.salary, j.description];
      saved += Number(stmt.run(...row.map((v) => v ?? null)).changes);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return saved;
}

// ---------- output ----------

const cut = (text, n) => (text == null ? '' : text.length > n ? `${text.slice(0, n - 1)}…` : text);
const count = (n) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

function rows(jobs) {
  return jobs.map((j) => ({
    title: cut(j.title, 60),
    company: cut(j.company, 26),
    location: cut(j.location, 34),
    workplace: j.workplace,
    posted: j.posted_at ? j.posted_at.slice(0, 10) : '?',
    salary: cut(j.salary, 32),
    url: j.url,
  }));
}

// Filters, sorts, enriches, saves and prints one batch of jobs.
async function deliver(all, flt, { label, total, notes = [], failures = [] }) {
  const kept = all.filter((job) => keep(job, flt)).sort(newestFirst);
  const shown = kept.slice(0, flt.limit);
  // The log goes to stderr with --json, so stdout stays parseable.
  const say = f.json ? (text) => console.error(text) : (text) => console.log(text);

  let fresh = [];
  let db;
  if (f.save) {
    if (!flt.q.length && !flt.limitGiven && kept.length > UNFILTERED_SAVE_MAX) {
      throw new UsageError(`That would save ${kept.length} jobs with no --q to narrow them. Add --q "…", or pass --limit N to save the newest N.`);
    }
    db = openDb();
    fresh = plan(db, flt.limitGiven ? shown : kept);
  }

  await enrich([...new Set([...shown, ...fresh])], notes);

  let line = `${count(kept.length)} (${total} before filters) from ${label}`;
  if (shown.length < kept.length) line += `; showing the newest ${shown.length}`;
  say(line);
  for (const note of notes) say(`note: ${note}`);
  if (f.json) {
    const out = shown.map((job) => {
      const { description, ...bare } = job;
      return f['with-description'] ? job : bare;
    });
    console.log(JSON.stringify(out, null, 2));
  } else if (shown.length) {
    console.log(formatTable(rows(shown)));
  }
  if (db) {
    const considered = flt.limitGiven ? shown.length : kept.length;
    const saved = insert(db, fresh);
    say(`Saved ${saved} new; ${considered - saved} already on the desk`);
  }
  for (const failure of failures) say(failure);
}

// ---------- commands ----------

async function fetchCommand() {
  const [name, slug] = rest;
  if (!name) throw new UsageError('fetch needs a source: node bin/jobs.mjs fetch greenhouse monzo   (list them: node bin/jobs.mjs sources)');
  const src = byName.get(name);
  if (!src) throw new UsageError(`No source called "${name}". Sources: ${SOURCES.map((s) => s.name).join(', ')}.`);
  if (src.type === 'company board' && !slug) {
    throw new UsageError(`${src.name} needs a company slug, ${src.slugHelp}: node bin/jobs.mjs fetch ${src.name} <slug>   (find it: node bin/jobs.mjs detect <careers page>)`);
  }
  const flt = parseFilters();
  if (f.save) openDb().close(); // no desk yet? say so before fetching anything
  const { jobs, notes } = await collect(src, slug, flt);
  await deliver(jobs, flt, { label: slug ? `${src.name}/${slug}` : src.name, total: jobs.length, notes });
}

async function watchCommand() {
  const flt = parseFilters();
  const db = openDb();
  const watched = db.prepare('SELECT name, domain, ats, ats_slug, never_apply FROM companies WHERE watch = 1 ORDER BY name').all();
  const boards = watched.filter((c) => c.ats && c.ats_slug && !c.never_apply);
  const notes = [];
  const skipped = watched.filter((c) => c.never_apply).map((c) => c.name);
  if (skipped.length) notes.push(`not checked, never_apply is set: ${skipped.join(', ')}`);
  const unset = watched.filter((c) => !c.never_apply && !(c.ats && c.ats_slug)).map((c) => c.name);
  if (unset.length) notes.push(`no ats or slug yet, so not checked: ${unset.join(', ')} (node bin/jobs.mjs detect <careers url> --watch "Name")`);
  if (!boards.length) {
    console.log('No watched company has an ats and ats_slug. Add one: node bin/jobs.mjs detect <careers url> --watch "Company name"');
    for (const note of notes) console.log(`note: ${note}`);
    return;
  }

  const touch = db.prepare("UPDATE companies SET updated_at = datetime('now') WHERE name = ?");
  const all = [];
  const failures = [];
  let ok = 0;
  await Promise.all(
    boards.map(async (c) => {
      const src = byName.get(c.ats);
      try {
        if (src?.type !== 'company board') throw new Error(`"${c.ats}" is not a company board system`);
        const { jobs } = await collect(src, c.ats_slug, flt);
        for (const job of jobs) {
          job.company = c.name; // the desk's own name for the employer
          job.company_domain ??= c.domain ?? null;
        }
        all.push(...jobs);
        touch.run(c.name);
        ok++;
      } catch (err) {
        failures.push(`Failed: ${c.name} (${c.ats}/${c.ats_slug}): ${err.message}`);
      }
    }),
  );
  await deliver(all, flt, { label: `watch (${ok} of ${boards.length} boards)`, total: all.length, notes, failures: failures.sort() });
  if (!ok) process.exitCode = 1;
}

// Where on a company's own site to look for its board, for a bare domain.
function pagesToTry(url) {
  if (url.pathname !== '/' && url.pathname !== '') return [url.href];
  const bare = url.hostname.replace(/^(www|careers|jobs)\./, '');
  return [...new Set([`https://${url.hostname}/careers`, `https://${url.hostname}/jobs`, url.href, `https://careers.${bare}/`, `https://jobs.${bare}/`])];
}

async function detectCommand() {
  const input = rest[0];
  if (!input) throw new UsageError('detect needs a careers page or domain: node bin/jobs.mjs detect https://monzo.com/careers');
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new UsageError(`"${input}" is not a URL or domain.`);
  }

  const found = new Map(); // "ats/slug" -> { src, slug, hits }
  const add = (hit, hits = hit.hits ?? 1) => {
    const key = `${hit.src.name}/${hit.slug}`;
    const known = found.get(key);
    if (known) known.hits += hits;
    else found.set(key, { src: hit.src, slug: hit.slug, hits });
  };
  const direct = refFromUrl(url.href, { boardsOnly: true });
  const tried = [];
  const refused = [];
  const hints = new Set();
  let foundOn = null; // the page of the company's own site that showed the board
  if (direct?.slug) add(direct, 10);
  else {
    for (const page of pagesToTry(url)) {
      tried.push(page);
      try {
        const { html, finalUrl } = await fetchPage(page, { fresh: f.fresh });
        const landed = refFromUrl(finalUrl, { boardsOnly: true }); // the careers page may redirect straight to a board
        if (landed?.slug) add(landed, 10);
        for (const hit of boardsInHtml(html)) add(hit);
        // Links like ?gh_jid=123 mean Greenhouse, but they don't give the board's name.
        if (/[?&;]gh_jid=/.test(html)) hints.add('greenhouse');
        if (/[?&;]ashby_jid=/.test(html)) hints.add('ashby');
      } catch (err) {
        refused.push(`${page}: ${err.message}`);
      }
      if (found.size) {
        foundOn = page;
        break;
      }
    }
  }

  // Count the open jobs on each candidate; that also proves the slug is real.
  const verified = [];
  const dead = [];
  for (const hit of [...found.values()].sort((a, b) => b.hits - a.hits).slice(0, 6)) {
    try {
      const { jobs, total } = await hit.src.list({ slug: hit.slug, pages: 1, get: bindGet(hit.src.name, f.fresh) });
      verified.push({ ...hit, open: total ?? jobs.length });
    } catch (err) {
      dead.push(`${hit.src.name}/${hit.slug}: ${err.message}`);
    }
  }

  if (!verified.length) {
    console.log(`No job board found for ${input}.`);
    if (dead.length) console.log(`Found links, but their feeds failed:\n  ${dead.join('\n  ')}`);
    else console.log(`Looked at: ${tried.join(', ') || input}${refused.length ? `\n  ${refused.join('\n  ')}` : ''}`);
    for (const ats of hints) {
      console.log(`The page links to ${ats} postings but never names the board. The slug is often the company name in lower case: node bin/jobs.mjs fetch ${ats} <slug> (check the company on the first rows).`);
    }
    console.log(
      'The page may build its jobs list in the browser, or use a system this tool cannot read (Workday, iCIMS, Taleo, BambooHR, Breezy...). ' +
        'Open the careers page in the browser, find the link to the job board, and run detect on that URL.',
    );
    process.exitCode = 1;
    return;
  }

  const best = verified[0];
  for (const v of verified) {
    console.log(`${v === best ? 'ats' : 'also'}: ${v.src.name}   slug: ${v.slug}   open jobs: ${v.open}   board: ${v.src.boardUrl(v.slug)}`);
  }
  console.log(`fetch: node bin/jobs.mjs fetch ${best.src.name} ${best.slug}`);
  if (dead.length) console.log(`also linked, but not readable: ${dead.join('; ')}`);

  if (f.watch) {
    const db = openDb();
    const fromBoard = Boolean(direct?.slug);
    const domain = fromBoard ? null : url.hostname.replace(/^(www|careers|jobs)\./, '');
    db.prepare(
      `INSERT INTO companies (name, domain, ats, ats_slug, careers_url, watch, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         domain = coalesce(excluded.domain, domain), ats = excluded.ats, ats_slug = excluded.ats_slug,
         careers_url = coalesce(excluded.careers_url, careers_url), watch = 1, updated_at = datetime('now')`,
    ).run(f.watch, domain, best.src.name, best.slug, fromBoard ? best.src.boardUrl(best.slug) : (foundOn ?? url.href));
    console.log(`Watching ${f.watch} (${best.src.name}/${best.slug}). \`node bin/jobs.mjs watch\` will check it every round.`);
  }
}

function printJob(job) {
  const where = [job.location, job.workplace !== 'unknown' ? job.workplace : null].filter(Boolean).join(', ');
  const lines = [job.title, [job.company, where].filter(Boolean).join(' - ')];
  if (job.salary) lines.push(`Salary: ${job.salary}`);
  lines.push(`Posted: ${job.posted_at ? job.posted_at.slice(0, 10) : 'not given'}   Source: ${job.source}`);
  lines.push(`Posting: ${job.url}`);
  if (job.apply_url) lines.push(`Apply: ${job.apply_url}`);
  console.log(`${lines.join('\n')}\n\n${job.description ?? '(no description)'}`);
}

async function showCommand() {
  const input = rest[0];
  if (!input) throw new UsageError('show needs a posting URL: node bin/jobs.mjs show https://job-boards.greenhouse.io/monzo/jobs/8143930');
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new UsageError(`"${input}" is not a URL.`);
  }
  if (BROWSER_ONLY.test(url.hostname)) {
    console.log(`${url.hostname} does not allow automated reading. Open ${input} in the candidate's own browser and read it there.`);
    process.exitCode = 1;
    return;
  }

  let ref = refFromUrl(url.href);
  if (ref?.src.name === 'workable' && !ref.slug && ref.id) {
    // apply.workable.com/j/<code> redirects to /<slug>/j/<code>
    const target = await redirectTarget(url.href);
    ref = target ? refFromUrl(target) : ref;
  }
  let job;
  let thin = false;
  if (ref?.id && ref.src.one) {
    try {
      job = await ref.src.one(ref, { get: bindGet(ref.src.name, f.fresh) });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        console.log(`${input} is not on ${ref.src.name} any more (404). The posting has probably closed.`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  } else if (ref?.slug && !ref.id) {
    throw new UsageError(`That is ${ref.src.name}'s board for "${ref.slug}", not one posting. List it: node bin/jobs.mjs fetch ${ref.src.name} ${ref.slug}`);
  } else {
    try {
      ({ job, thin } = await readPage(url.href, { fresh: f.fresh }));
    } catch (err) {
      if (err instanceof HttpError && [401, 403, 429, 451, 999].includes(err.status)) {
        console.log(`${url.hostname} refused an automated read (HTTP ${err.status}). Open ${input} in the browser instead.`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
  }

  if (f.json) console.log(JSON.stringify(job, null, 2));
  else printJob(job);
  if (thin) {
    console.error(
      '\nThis page returned almost no readable text. It is probably built in the browser with JavaScript, or sits behind a login. ' +
        `Open ${input} in the browser instead.`,
    );
    process.exitCode = 1;
  }
}

function sourcesCommand() {
  const table = SOURCES.map((s) => ({
    source: s.name,
    type: s.type,
    coverage: s.coverage,
    key: s.needs?.length ? s.needs.join(' + ') : 'none',
    'key set': s.needs?.length ? (s.needs.every((n) => envKey(n)) ? 'yes' : 'NO') : '-',
  }));
  console.log(formatTable(table, { width: 110 }));
  console.log('\nCompany boards need a slug: fetch greenhouse monzo. Find it with: detect <careers page>.');
  console.log('Job boards search across employers: fetch remoteok --q "product designer".');
}

function helpCommand() {
  const header = fs.readFileSync(import.meta.filename, 'utf8').split('\n').slice(1);
  const end = header.findIndex((line) => !line.startsWith('//'));
  console.log(header.slice(0, end).join('\n').replace(/^\/\/ ?/gm, ''));
}

try {
  if (f.help || !command || command === 'help') helpCommand();
  else if (command === 'sources') sourcesCommand();
  else if (command === 'fetch') await fetchCommand();
  else if (command === 'watch') await watchCommand();
  else if (command === 'detect') await detectCommand();
  else if (command === 'show') await showCommand();
  else throw new UsageError(`Unknown command "${command}". Commands: sources, fetch, watch, detect, show.`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
}

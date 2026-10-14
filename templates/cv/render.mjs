// Turns a cv.json (see .claude/skills/cv/format.md) into one self-contained
// HTML page, and a letter into one in the same design. bin/cv.mjs prints
// either to PDF with Chrome.
//
// Reading order in the HTML is the order a person or an ATS should read:
// name, headline, contact, summary, then each section, and in each entry the
// title, the employer, the dates and then the detail. The layout lifts the
// dates into a left column, but the text order never depends on it.

import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(path.join(import.meta.dirname, 'cv.css'), 'utf8');

const DEFAULT_ORDER = ['experience', 'projects', 'education', 'skills', 'certifications', 'languages', 'sections'];
const DEFAULT_HEADINGS = {
  experience: 'Experience',
  projects: 'Projects',
  education: 'Education',
  skills: 'Skills',
  certifications: 'Certifications',
  languages: 'Languages',
};

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// **bold**, *italic* and [text](https://…) inside bullets and summaries.
export function inline(s) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

const prettyUrl = (u) => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(value, meta) {
  if (!value) return meta.present ?? 'Present';
  const [y, m] = String(value).split('-');
  if (!m) return y;
  const locale = meta.locale ?? 'en-GB';
  const month = locale.startsWith('en')
    ? EN_MONTHS[+m - 1] // Intl gives "Sept" for en-GB; three letters line up better
    : new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(Date.UTC(+y, +m - 1, 15))).replace(/\.$/, '');
  return `${month} ${y}`;
}

// A period: "Mar 2022 – Present", "Jan – Aug 2021", or just "2019" when only
// an end date is known (a degree, a certificate).
function range(start, end, meta) {
  if (!start && !end) return '';
  if (!start) return dateLabel(end, meta);
  const a = dateLabel(start, meta);
  const b = dateLabel(end, meta);
  const [ay, am] = String(start).split('-');
  const [by, bm] = String(end ?? '').split('-');
  if (end && am && bm && ay === by) return `${a.replace(` ${ay}`, '')} – ${b}`;
  return `${a} – ${b}`;
}

const bullets = (list) =>
  list?.length ? `<ul class="bullets">${list.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>` : '';

const linked = (text, url) => (url ? `<a href="${esc(url)}">${esc(text)}</a>` : esc(text));

// One entry: a grid row. DOM order is title, employer, dates, detail; CSS puts
// the dates (.when) in the left column beside them.
function entry({ title, org, when, where, about, body, long = false }) {
  return `<article class="entry${long ? ' entry-long' : ''}">
    <h3 class="title">${title}</h3>
    ${org ? `<p class="org">${org}</p>` : ''}
    ${when || where ? `<p class="when">${when ? `<span>${esc(when)}</span>` : ''}${where ? `<span class="where">${esc(where)}</span>` : ''}</p>` : ''}
    ${about ? `<p class="about">${inline(about)}</p>` : ''}
    ${body ?? ''}
  </article>`;
}

function experienceEntry(x, meta) {
  if (x.roles?.length) {
    // Several roles at one employer: the employer once, then each role with its own dates.
    const first = x.roles[0];
    const last = x.roles[x.roles.length - 1];
    const roles = x.roles
      .map(
        (r) => `<div class="role">
          <div class="role-head"><h4 class="role-title">${esc(r.title)}</h4><p class="role-when">${esc(range(r.start, r.end, meta))}</p></div>
          ${bullets(r.bullets)}
        </div>`,
      )
      .join('');
    return entry({
      title: linked(x.company, x.url),
      when: range(last.start, first.end, meta),
      where: x.location,
      about: x.about,
      body: roles,
      long: true,
    });
  }
  return entry({
    title: esc(x.title),
    org: linked(x.company, x.url),
    when: range(x.start, x.end, meta),
    where: x.location,
    about: x.about,
    body: bullets(x.bullets),
    long: (x.bullets?.length ?? 0) > 5,
  });
}

const SECTIONS = {
  experience: (items, meta) => items.map((x) => experienceEntry(x, meta)).join(''),

  projects: (items, meta) =>
    items
      .map((p) =>
        entry({
          title: linked(p.name, p.url),
          org: p.role ? esc(p.role) : '',
          when: range(p.start, p.end, meta),
          about: p.summary,
          body: bullets(p.bullets),
        }),
      )
      .join(''),

  education: (items, meta) =>
    items
      .map((e) =>
        entry({
          title: esc(e.degree),
          org: esc(e.school),
          when: range(e.start, e.end, meta),
          where: e.location,
          body: bullets(e.notes),
        }),
      )
      .join(''),

  certifications: (items, meta) =>
    items
      .map((c) => entry({ title: linked(c.name, c.url), org: c.issuer ? esc(c.issuer) : '', when: c.date ? dateLabel(c.date, meta) : '' }))
      .join(''),

  // Label rows: the group in the left column, the list beside it.
  skills: (groups) =>
    groups
      .map((g) => `<div class="pair"><p class="pair-label">${esc(g.group)}</p><p class="pair-text">${g.items.map(esc).join(', ')}</p></div>`)
      .join(''),

  languages: (items) =>
    `<div class="pair pair-inline"><ul class="langs">${items
      .map((l) => `<li><span class="lang">${esc(l.language)}</span>${l.level ? ` <span class="level">${esc(l.level)}</span>` : ''}</li>`)
      .join('')}</ul></div>`,
};

function section(key, heading, html) {
  return `<section class="section section-${key}" aria-label="${esc(heading)}"><h2 class="kicker">${esc(heading)}</h2><div class="rows">${html}</div></section>`;
}

// Extra sections the candidate wants (volunteering, publications, awards):
// { heading, entries: [{ title, org, location, start, end, about, bullets }] } or { heading, items: ["…"] }
function customSection(s, i, meta) {
  const html = s.items
    ? `<div class="pair pair-inline"><ul class="plain">${s.items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul></div>`
    : s.entries
        .map((e) =>
          entry({
            title: esc(e.title),
            org: e.org ? esc(e.org) : '',
            when: range(e.start, e.end, meta),
            where: e.location,
            about: e.about,
            body: bullets(e.bullets),
          }),
        )
        .join('');
  return section(`custom-${i}`, s.heading, html);
}

function contactList(b) {
  const items = [];
  if (b.email) items.push(`<li><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`);
  if (b.phone) items.push(`<li><a href="tel:${esc(b.phone.replace(/[^\d+]/g, ''))}">${esc(b.phone)}</a></li>`);
  if (b.location) items.push(`<li>${esc(b.location)}</li>`);
  for (const l of b.links ?? []) items.push(`<li><a href="${esc(l.url)}">${esc(l.label ?? prettyUrl(l.url))}</a></li>`);
  if (b.workRights) items.push(`<li>${esc(b.workRights)}</li>`);
  return `<ul class="contact" aria-label="Contact">${items.join('')}</ul>`;
}

function masthead(b) {
  return `<header class="masthead">
    <div class="identity">
      <h1 class="name">${esc(b.name)}</h1>
      ${b.headline ? `<p class="headline">${esc(b.headline)}</p>` : ''}
    </div>
    ${contactList(b)}
  </header>`;
}

const cssString = (s) => `"${String(s).replace(/["\\]/g, '\\$&')}"`;

function documentShell({ title, body, fontsCss, meta, runningHead, kind }) {
  const attrs = [
    `data-accent="${esc(meta.accent ?? 'cobalt')}"`,
    `data-density="${esc(meta.density ?? 'normal')}"`,
    `data-paper="${String(meta.paper ?? 'A4').toLowerCase() === 'letter' ? 'letter' : 'a4'}"`,
  ].join(' ');
  // From page two on: the name and the document's name at the top, the folio at the foot.
  const pages = runningHead
    ? `<style>@page { @top-left { content: ${cssString(runningHead.left)}; } @top-right { content: ${cssString(runningHead.right)}; } @bottom-right { content: counter(page, decimal-leading-zero) " / " counter(pages, decimal-leading-zero); } } @page :first { @top-left { content: none; } @top-right { content: none; } @bottom-right { content: none; } }</style>`
    : '';
  return `<!doctype html>
<html lang="${esc((meta.locale ?? 'en-GB').split('-')[0])}" ${attrs}>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>${fontsCss}</style>
<style>${CSS}</style>
${pages}
</head>
<body class="${kind}">
${body}
</body>
</html>`;
}

// runningHead: pass { left, right } to print it on pages after the first
// (bin/cv.mjs does when a document runs to more than one page).
export function renderCv(cv, { fontsCss = '', runningHead = null } = {}) {
  const meta = cv.meta ?? {};
  const b = cv.basics ?? {};
  const headings = { ...DEFAULT_HEADINGS, ...(meta.headings ?? {}) };
  const order = meta.order ?? DEFAULT_ORDER;
  const sections = order
    .map((key) => {
      if (key === 'sections') return (cv.sections ?? []).map((s, i) => customSection(s, i, meta)).join('');
      if (!SECTIONS[key] || !cv[key]?.length) return '';
      return section(key, headings[key], SECTIONS[key](cv[key], meta));
    })
    .join('');
  const summary = b.summary
    ? `<div class="summary">${String(b.summary)
        .split(/\n{2,}/)
        .map((p) => `<p>${inline(p)}</p>`)
        .join('')}</div>`
    : '';
  const body = `<main class="page">
  ${masthead(b)}
  ${summary}
  ${sections}
</main>`;
  return documentShell({ title: `${b.name ?? 'CV'}: CV`, body, fontsCss, meta, runningHead, kind: 'cv' });
}

// A letter in the CV's design. letter = { date, to: ["Hiring team", "Company", …],
// subject, greeting, body (paragraphs separated by blank lines), closing, signature }
export function renderLetter(letter, cv, { fontsCss = '', runningHead = null } = {}) {
  const meta = { ...(cv.meta ?? {}), ...(letter.meta ?? {}) };
  const b = cv.basics ?? {};
  const paragraphs = String(letter.body ?? '')
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`)
    .join('');
  const body = `<main class="page">
  ${masthead(b)}
  <section class="letter">
    ${letter.subject ? `<h2 class="kicker">${esc(letter.subject)}</h2>` : ''}
    <div class="letter-grid">
      <div class="letter-meta">
        ${letter.date ? `<p class="letter-date">${esc(letter.date)}</p>` : ''}
        ${letter.to?.length ? `<address class="letter-to">${letter.to.map(esc).join('<br>')}</address>` : ''}
      </div>
      <div class="letter-body">
        ${letter.greeting ? `<p class="letter-greeting">${esc(letter.greeting)}</p>` : ''}
        ${paragraphs}
        <p class="letter-closing">${esc(letter.closing ?? 'Best regards,')}</p>
        <p class="letter-signature">${esc(letter.signature ?? b.name)}</p>
      </div>
    </div>
  </section>
</main>`;
  return documentShell({ title: `${b.name ?? ''}: letter`, body, fontsCss, meta, runningHead, kind: 'letter-doc' });
}

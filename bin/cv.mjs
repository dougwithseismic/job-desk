#!/usr/bin/env node
// CVs and letters: cv.json in, HTML and PDF out, printed by the candidate's own Chrome.
//
//   node bin/cv.mjs render <cv.json> [--out <dir>] [--name cv] [--png]
//   node bin/cv.mjs letter <letter.md> --cv <cv.json> [--out <dir>] [--name letter] [--png]
//   node bin/cv.mjs text <file.pdf>                         the text an ATS would read
//   node bin/cv.mjs check <file.pdf> [--keywords "a, b, c"]  pages, reading order, keywords
//
// render and letter report the page count, how full the pages are, and
// anything wider than the page. --png also writes <name>-p1.png, -p2.png … so
// an agent that can't read PDFs can still look at the result.

import fs from 'node:fs';
import path from 'node:path';
import { renderCv, renderLetter } from '../templates/cv/render.mjs';
import { fontFaceCss } from './lib/fonts.mjs';
import { toRoot } from './lib/paths.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);
const VALUED = new Set(['--out', '--name', '--cv', '--keywords']);
const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));

const MM = 96 / 25.4; // CSS px per mm
// Must match the @page margins in templates/cv/cv.css: [top, sides, bottom] in mm.
const PAPER = { a4: { w: 210, h: 297, margin: [14, 15, 15] }, letter: { w: 215.9, h: 279.4, margin: [13, 15, 14] } };

async function launch() {
  const { chromium } = await import('playwright-core');
  const tries = [
    process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH },
    { channel: 'chrome' },
    { channel: 'msedge' },
    {}, // a Chromium installed with `npx playwright install chromium`
  ].filter(Boolean);
  for (const t of tries) {
    try {
      return await chromium.launch({ ...t, headless: true });
    } catch {}
  }
  throw new Error(
    'No Chrome found. Install Google Chrome, or set CHROME_PATH to a Chrome/Chromium binary, or run: npx playwright install chromium',
  );
}

async function pdfInfo(buffer) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(doc, { mergePages: false });
  return { pages: doc.numPages, text, doc };
}

async function writePngs(buffer, outBase) {
  try {
    const { renderPageAsImage, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(buffer));
    const files = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const png = await renderPageAsImage(new Uint8Array(buffer), p, { canvasImport: () => import('@napi-rs/canvas'), scale: 2 });
      const file = `${outBase}-p${p}.png`;
      fs.writeFileSync(file, Buffer.from(png));
      files.push(toRoot(file));
    }
    return files;
  } catch (err) {
    return [`(no PNG: ${err.message})`];
  }
}

// Prints html to PDF and measures it. Returns { pdf, pages, fill, overflow, text }.
async function print(browser, html, paper) {
  const page = await browser.newPage();
  const size = PAPER[paper];
  const [top, side, bottom] = size.margin;
  await page.setViewportSize({ width: Math.round((size.w - 2 * side) * MM), height: 1200 });
  await page.emulateMedia({ media: 'print' });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const measure = await page.evaluate(() => {
    const main = document.querySelector('.page');
    const wide = [];
    for (const el of main.querySelectorAll('*')) {
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') wide.push(el.textContent.trim().slice(0, 60));
      const r = el.getBoundingClientRect();
      if (r.right > main.getBoundingClientRect().right + 1) wide.push(el.textContent.trim().slice(0, 60));
    }
    const line = parseFloat(getComputedStyle(document.body).lineHeight);
    return { height: main.scrollHeight, line, wide: [...new Set(wide)].slice(0, 5) };
  });
  const printable = (size.h - top - bottom) * MM;
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.close();
  const info = await pdfInfo(pdf);
  return {
    pdf,
    pages: info.pages,
    text: info.text,
    fill: measure.height / printable,
    overflowLines: Math.max(0, Math.ceil((measure.height - printable * Math.floor(measure.height / printable || 1)) / measure.line)),
    lineHeight: measure.line,
    printable,
    height: measure.height,
    wide: measure.wide,
  };
}

function report({ label, files, result, maxPages, name }) {
  const lines = [`${label}: ${result.pages} page${result.pages === 1 ? '' : 's'} (content ≈ ${result.fill.toFixed(2)} pages)`];
  for (const f of files) lines.push(`  ${f}`);
  const spare = result.printable * maxPages - result.height;
  if (maxPages && result.pages > maxPages) {
    const over = Math.ceil(-spare / result.lineHeight);
    lines.push(`  ✗ Over the ${maxPages}-page limit by about ${Math.max(1, over)} lines. Cut or merge bullets, or set meta.density to "compact".`);
  } else if (result.pages > 1) {
    const last = result.fill - Math.floor(result.fill);
    if (last > 0 && last < 0.2) lines.push(`  ! Page ${result.pages} holds only ${Math.round(last * 100)}% of a page. Trim about ${Math.ceil((last * result.printable) / result.lineHeight)} lines to save a page, or add substance.`);
  } else if (spare > 0) {
    lines.push(`  ✓ Fits, with about ${Math.floor(spare / result.lineHeight)} lines to spare.`);
  }
  if (result.wide.length) lines.push(`  ✗ Wider than the page: ${result.wide.map((t) => `"${t}"`).join(', ')}`);
  const first = (result.text[0] ?? '').trim().split('\n')[0];
  if (name && !first.includes(name)) lines.push(`  ! The text layer doesn't start with "${name}": check reading order with \`node bin/cv.mjs text\`.`);
  console.log(lines.join('\n'));
}

async function renderDoc({ html, outDir, base, paper, maxPages, runningHead, label, png, name }) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launch();
  try {
    let result = await print(browser, html(null), paper);
    // The running head and folio only when there's more than one page.
    if (result.pages > 1 && runningHead) result = await print(browser, html(runningHead), paper);
    const htmlFile = path.join(outDir, `${base}.html`);
    const pdfFile = path.join(outDir, `${base}.pdf`);
    fs.writeFileSync(htmlFile, html(result.pages > 1 ? runningHead : null));
    fs.writeFileSync(pdfFile, result.pdf);
    fs.writeFileSync(path.join(outDir, `${base}.txt`), result.text.join('\n\n— page break —\n\n'));
    const files = [toRoot(pdfFile), toRoot(htmlFile)];
    if (png) files.push(...(await writePngs(result.pdf, path.join(outDir, base))));
    report({ label, files, result, maxPages, name });
  } finally {
    await browser.close();
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Can't read ${file}: ${err.message}`);
  }
}

// letter.md: a front block of "key: value" lines between --- fences, then the body.
// to: lines are joined with " | " ("Hiring team | Monzo | London").
function readLetter(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  const letter = { body: m ? m[2] : raw };
  for (const line of (m?.[1] ?? '').split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) letter[kv[1]] = kv[1] === 'to' ? kv[2].split('|').map((s) => s.trim()).filter(Boolean) : kv[2].trim();
  }
  return letter;
}

async function main() {
  const [cmd, file] = positional;
  if (cmd === 'render' && file) {
    const cv = readJson(file);
    const meta = cv.meta ?? {};
    const paper = String(meta.paper ?? 'A4').toLowerCase() === 'letter' ? 'letter' : 'a4';
    const fontsCss = fontFaceCss();
    await renderDoc({
      html: (runningHead) => renderCv(cv, { fontsCss, runningHead }),
      outDir: path.resolve(opt('out', path.dirname(path.resolve(file)))),
      base: opt('name', path.basename(file, '.json')),
      paper,
      maxPages: meta.maxPages ?? 2,
      runningHead: { left: (cv.basics?.name ?? '').toUpperCase(), right: (meta.runningTitle ?? 'Curriculum vitae').toUpperCase() },
      label: 'CV',
      png: has('png'),
      name: cv.basics?.name,
    });
  } else if (cmd === 'letter' && file) {
    const cvFile = opt('cv');
    if (!cvFile) throw new Error('letter needs --cv <cv.json> for the masthead');
    const cv = readJson(cvFile);
    const letter = readLetter(file);
    const meta = { ...(cv.meta ?? {}), ...(letter.meta ?? {}) };
    const paper = String(meta.paper ?? 'A4').toLowerCase() === 'letter' ? 'letter' : 'a4';
    const fontsCss = fontFaceCss();
    await renderDoc({
      html: (runningHead) => renderLetter(letter, cv, { fontsCss, runningHead }),
      outDir: path.resolve(opt('out', path.dirname(path.resolve(file)))),
      base: opt('name', path.basename(file, path.extname(file))),
      paper,
      maxPages: 1,
      runningHead: { left: (cv.basics?.name ?? '').toUpperCase(), right: 'LETTER' },
      label: 'Letter',
      png: has('png'),
      name: cv.basics?.name,
    });
  } else if (cmd === 'text' && file) {
    const { text } = await pdfInfo(fs.readFileSync(file));
    console.log(text.join('\n\n— page break —\n\n'));
  } else if (cmd === 'check' && file) {
    const { pages, text } = await pdfInfo(fs.readFileSync(file));
    const all = text.join('\n');
    console.log(`${toRoot(path.resolve(file))}: ${pages} page${pages === 1 ? '' : 's'}, ${all.split(/\s+/).length} words`);
    console.log(`Reads first: ${all.trim().split('\n').slice(0, 3).join(' / ')}`);
    const keywords = (opt('keywords', '') ?? '').split(',').map((k) => k.trim()).filter(Boolean);
    if (keywords.length) {
      const flat = all.toLowerCase().replace(/\s+/g, ' ');
      const found = keywords.filter((k) => flat.includes(k.toLowerCase()));
      const missing = keywords.filter((k) => !found.includes(k));
      console.log(`Keywords found (${found.length}/${keywords.length}): ${found.join(', ') || 'none'}`);
      if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
    }
  } else {
    console.log(fs.readFileSync(import.meta.filename, 'utf8').split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, ''));
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

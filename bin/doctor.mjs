#!/usr/bin/env node
// Checks everything the desk needs, in plain words, and fixes what it can.
//
//   node bin/doctor.mjs         check
//   node bin/doctor.mjs --fix   check, install what's missing, create the desk

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, DB_PATH, ROOT } from './lib/paths.mjs';

const fix = process.argv.includes('--fix');
const results = [];
const ok = (what) => results.push(['ok', what]);
const bad = (what, how) => results.push(['no', what, how]);

const has = (cmd) => {
  try {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// 1. Node
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 13)) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} is too old`, 'Install the current LTS from https://nodejs.org (22.13 or newer), then run this again.');

// 2. Packages
const installed = () => fs.existsSync(path.join(ROOT, 'node_modules', 'playwright-core'));
if (!installed() && fix) {
  const cmd = has('pnpm') ? 'pnpm install' : 'npm install';
  console.log(`Installing packages (${cmd})…`);
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch {}
}
if (installed()) ok('Packages installed');
else bad('Packages not installed', 'Run: npm install');

// 3. Git (for updates)
if (has('git')) ok('Git');
else bad('Git missing', 'Updates need git: https://git-scm.com/downloads');

// 4. Chrome, for printing CVs to PDF
if (installed()) {
  try {
    const { chromium } = await import('playwright-core');
    let browser = null;
    for (const opts of [process.env.CHROME_PATH && { executablePath: process.env.CHROME_PATH }, { channel: 'chrome' }, { channel: 'msedge' }, {}].filter(Boolean)) {
      try {
        browser = await chromium.launch({ ...opts, headless: true });
        break;
      } catch {}
    }
    if (browser) {
      ok(`A browser to print PDFs with (${browser.version()})`);
      await browser.close();
    } else bad('No Chrome found to print PDFs', 'Install Google Chrome (https://www.google.com/chrome), or run: npx playwright install chromium');
  } catch (err) {
    bad('Could not start the PDF printer', err.message);
  }
}

// 5. The desk
if (!fs.existsSync(DB_PATH) && fix && installed()) {
  execSync('node bin/db.mjs init', { cwd: ROOT, stdio: 'inherit' });
}
if (fs.existsSync(DB_PATH)) ok('The desk (data/desk.sqlite)');
else bad('No desk yet', 'Run: node bin/db.mjs init');

// 6. The candidate's profile
const profile = path.join(DATA, 'profile');
if (fs.existsSync(path.join(profile, 'cv.json'))) ok('Your CV (data/profile/cv.json)');
else bad('No CV yet', 'In the chat: "here\'s my CV", then drop the file in.');
const prefs = path.join(profile, 'preferences.md');
if (fs.existsSync(prefs) && !/Titles I want: *\n/.test(fs.readFileSync(prefs, 'utf8'))) ok('What you\'re looking for (data/profile/preferences.md)');
else bad('Preferences not filled in yet', 'The agent asks you a few questions and fills them in.');

// 7. Optional job-board keys
const env = fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '';
const keys = ['ADZUNA_APP_ID', 'REED_API_KEY'].filter((k) => process.env[k] || new RegExp(`^${k}=.+`, 'm').test(env));
results.push(['--', `Optional job-board keys: ${keys.length ? keys.join(', ') : 'none (fine: every other source needs no key)'}`]);

for (const [state, what, how] of results) {
  console.log(`${state === 'ok' ? '✓' : state === 'no' ? '✗' : '·'} ${what}${how ? `\n    ${how}` : ''}`);
}
const missing = results.filter(([s]) => s === 'no').length;
console.log(missing ? `\n${missing} thing${missing === 1 ? '' : 's'} to sort out.` : '\nAll set.');

#!/usr/bin/env node
// The desk's SQL runner. Every read and write the agent makes goes through it.
//
//   node bin/db.mjs init                       create data/ and the schema (safe to re-run)
//   node bin/db.mjs "SELECT * FROM pipeline"   run SQL (several statements are fine)
//   node bin/db.mjs - <<'SQL' … SQL            run SQL from stdin (no shell quoting to fight)
//   node bin/db.mjs export [file.csv]          every job as CSV, for a spreadsheet
//
// Flags: --json prints rows as JSON; --full prints every column in full.
// readfile('data/…') reads a file into a value, so long text needs no escaping.

import fs from 'node:fs';
import path from 'node:path';
import { DATA, DB_PATH, ROOT, SCHEMA, toRoot } from './lib/paths.mjs';
import { formatTable, openDb, runScript } from './lib/sqlite.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const rest = args.filter((a) => !a.startsWith('--'));

// Schema changes that CREATE … IF NOT EXISTS can't make, in order. Each runs
// once; PRAGMA user_version records how far a desk has got.
const MIGRATIONS = [
  // 1: the first schema, created by schema.sql itself
  () => {},
];

function init() {
  for (const dir of ['profile/originals', 'jobs', 'exports', 'bodies']) {
    fs.mkdirSync(path.join(DATA, dir), { recursive: true });
  }
  // The candidate's own files start from templates and are never overwritten.
  for (const f of ['preferences.md', 'answers.md']) {
    const to = path.join(DATA, 'profile', f);
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(ROOT, 'templates', 'profile', f), to);
  }
  const fresh = !fs.existsSync(DB_PATH);
  if (fresh) fs.writeFileSync(DB_PATH, '');
  const db = openDb();
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  let version = db.prepare('PRAGMA user_version').get().user_version;
  for (; version < MIGRATIONS.length; version++) {
    MIGRATIONS[version](db);
    db.exec(`PRAGMA user_version = ${version + 1}`);
  }
  const jobs = db.prepare('SELECT count(*) AS n FROM jobs').get().n;
  console.log(`${fresh ? 'Created' : 'Checked'} ${toRoot(DB_PATH)} (schema v${version}, ${jobs} jobs)`);
}

const CSV_COLUMNS = `
  j.id, j.stage, j.company, j.title, j.location, j.workplace, j.salary, j.fit,
  j.url, j.source, j.posted_at,
  (SELECT min(at) FROM log WHERE job_id = j.id AND kind = 'applied') AS applied_at,
  (SELECT max(at) FROM log WHERE job_id = j.id AND kind = 'email-in') AS last_reply_at,
  (SELECT count(*) FROM interviews WHERE job_id = j.id) AS interviews,
  j.fit_notes, j.found_at, j.updated_at`;

function exportCsv(file) {
  const db = openDb({ readOnly: true });
  const rows = db.prepare(`SELECT ${CSV_COLUMNS} FROM jobs j ORDER BY j.updated_at DESC`).all();
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const q = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n');
  const out = file ?? path.join(DATA, 'exports', `jobs-${new Date().toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(out, `${csv}\n`);
  console.log(`Wrote ${rows.length} jobs to ${toRoot(path.resolve(out))}`);
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

try {
  if (rest[0] === 'init') init();
  else if (rest[0] === 'export') exportCsv(rest[1]);
  else {
    const sql = rest[0] === '-' || (!rest.length && !process.stdin.isTTY) ? readStdin() : rest.join(' ');
    if (!sql.trim()) {
      console.log(fs.readFileSync(import.meta.filename, 'utf8').split('\n').slice(1, 12).join('\n').replace(/^\/\/ ?/gm, ''));
      process.exit(0);
    }
    const db = openDb({ readOnly: false });
    const results = runScript(db, sql);
    if (flags.has('--json')) {
      const data = results.map((r) => r.rows ?? { changes: r.changes, id: r.lastId });
      console.log(JSON.stringify(data.length === 1 ? data[0] : data, null, 2));
    } else {
      for (const r of results) {
        if (results.length > 1) console.log(`\n▸ ${r.sql.split('\n')[0].slice(0, 100)}`);
        console.log(r.rows ? formatTable(r.rows, { full: flags.has('--full') }) : `ok: ${r.changes} changed, last id ${r.lastId}`);
      }
    }
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

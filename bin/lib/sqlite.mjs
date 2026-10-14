import fs from 'node:fs';
import { DB_PATH, fromRoot } from './paths.mjs';

// node:sqlite is marked experimental and prints a warning on load. It is the
// whole reason this repo needs no native modules, so hide that one warning.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const text = typeof warning === 'string' ? warning : warning?.message;
  if (text?.includes('SQLite')) return;
  return emitWarning.call(process, warning, ...rest);
};
const { DatabaseSync } = await import('node:sqlite');

export function openDb({ readOnly = false, path = DB_PATH } = {}) {
  if (!fs.existsSync(path)) {
    throw new Error(`No desk at ${path}. Run: node bin/db.mjs init`);
  }
  const db = new DatabaseSync(path, { readOnly });
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  // readfile('data/jobs/12-monzo/letter.md') keeps quotes, newlines and £ intact
  // without shell escaping, the same as the sqlite3 shell's readfile().
  db.function('readfile', { deterministic: false }, (p) => fs.readFileSync(fromRoot(String(p)), 'utf8'));
  return db;
}

// Splits a script into statements, respecting quotes, comments and
// CREATE TRIGGER … END blocks, so each statement's rows can be printed.
export function splitSql(sql) {
  const out = [];
  let start = 0;
  let i = 0;
  let depth = 0; // inside BEGIN … END of a trigger
  const n = sql.length;
  const word = (at) => {
    const m = /^[A-Za-z_]+/.exec(sql.slice(at));
    return m ? m[0].toUpperCase() : '';
  };
  while (i < n) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i++;
      while (i < n) {
        if (sql[i] === q) {
          if (sql[i + 1] === q) i += 2;
          else break;
        } else i++;
      }
      i++;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
    } else if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (/[A-Za-z_]/.test(c) && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? ' ')) {
      const w = word(i);
      const stmt = sql.slice(start, i).trim().toUpperCase();
      if (w === 'BEGIN' && /^CREATE\s+(TEMP\w*\s+)?TRIGGER/.test(stmt)) depth++;
      else if (w === 'END' && depth > 0) depth--;
      i += w.length;
    } else if (c === ';' && depth === 0) {
      const s = sql.slice(start, i).trim();
      if (s) out.push(s);
      start = ++i;
    } else i++;
  }
  const tail = sql.slice(start).trim();
  if (tail && !/^(--[^\n]*\n?|\s)*$/.test(tail)) out.push(tail);
  return out;
}

const READS = /^\s*(SELECT|WITH|PRAGMA|VALUES|EXPLAIN)\b/i;

// Runs each statement; returns [{ sql, rows, columns, changes, lastId }].
export function runScript(db, sql) {
  const results = [];
  for (const statement of splitSql(sql)) {
    const stmt = db.prepare(statement);
    const rows = stmt.all();
    if (rows.length || READS.test(statement)) {
      results.push({ sql: statement, rows, columns: rows.length ? Object.keys(rows[0]) : [] });
    } else {
      const { changes, id } = db.prepare('SELECT changes() AS changes, last_insert_rowid() AS id').get();
      results.push({ sql: statement, changes, lastId: id });
    }
  }
  return results;
}

export function formatTable(rows, { full = false, width = 160 } = {}) {
  if (!rows.length) return '(no rows)';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (!full) {
      s = s.replace(/\s*\n\s*/g, ' ⏎ ');
      if (s.length > width) s = `${s.slice(0, width - 1)}…`;
    }
    return s;
  };
  if (full) {
    // One block per row, so long text stays readable.
    return rows
      .map((r, i) => [`── row ${i + 1}`, ...cols.map((c) => `${c}: ${cell(r[c])}`)].join('\n'))
      .join('\n');
  }
  const grid = [cols, ...rows.map((r) => cols.map((c) => cell(r[c])))];
  const w = cols.map((_, i) => Math.min(width, Math.max(...grid.map((row) => row[i].length))));
  const line = (row) => row.map((v, i) => v.padEnd(w[i])).join(' │ ').trimEnd();
  return [line(grid[0]), w.map((x) => '─'.repeat(x)).join('─┼─'), ...grid.slice(1).map(line)].join('\n');
}

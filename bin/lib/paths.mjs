import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const DATA = process.env.JOB_DESK_DATA
  ? path.resolve(process.env.JOB_DESK_DATA)
  : path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA, 'desk.sqlite');
export const SCHEMA = path.join(ROOT, 'db', 'schema.sql');

// Paths the agent passes around are relative to the repo root ("data/jobs/…").
export const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
export const toRoot = (p) => {
  const rel = path.relative(ROOT, p);
  return rel.startsWith('..') ? p : rel.split(path.sep).join('/');
};

// The one place that talks to job sites. Every source goes through get(), so
// the manners are the same everywhere: an honest User-Agent, a 20 second
// timeout, one retry on 429/5xx, at most 4 requests in flight, and a six hour
// cache so repeated rounds don't hammer anyone's board.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA, ROOT } from '../paths.mjs';

export const USER_AGENT = 'job-desk/0.1 (personal job search)';
const TIMEOUT_MS = 20_000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_IN_FLIGHT = 4;

export class HttpError extends Error {
  constructor(status, url, detail) {
    super(`HTTP ${status} from ${redact(url)}${detail ? ` (${detail})` : ''}`);
    this.status = status;
  }
}

// Keys travel in some query strings (Adzuna). They never reach a message.
export function redact(url) {
  return String(url).replace(/([?&](?:app_key|app_id|api_key|apikey|key|token)=)[^&]+/gi, '$1***');
}

// --- at most 4 requests at once, across everything running in this process ---
let active = 0;
const waiting = [];
async function takeSlot() {
  if (active < MAX_IN_FLIGHT) {
    active++;
    return;
  }
  await new Promise((resolve) => waiting.push(resolve)); // the slot is handed over, active stays
}
function giveSlot() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { as, headers, redirect }) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    let retryable = false;
    let retryAfter = 0;
    await takeSlot();
    try {
      const res = await fetch(url, {
        redirect,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
          Accept: as === 'json' ? 'application/json' : 'text/html, application/xml, text/xml, */*',
          ...headers,
        },
      });
      if (redirect === 'manual' && res.status >= 300 && res.status < 400) {
        return { status: res.status, location: res.headers.get('location'), finalUrl: url, body: null };
      }
      if (res.ok) {
        const text = await res.text();
        if (as !== 'json') return { status: res.status, finalUrl: res.url || url, body: text };
        try {
          return { status: res.status, finalUrl: res.url || url, body: JSON.parse(text) };
        } catch {
          throw new HttpError(res.status, url, 'the reply was not JSON');
        }
      }
      lastError = new HttpError(res.status, url);
      retryable = res.status === 429 || res.status >= 500;
      const seconds = Number(res.headers.get('retry-after'));
      retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 10) * 1000 : 0;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const why = err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : (err.cause?.code ?? err.message);
      lastError = new Error(`request to ${redact(url)} failed: ${why}`);
      retryable = true;
    } finally {
      giveSlot();
    }
    if (!retryable) break;
    if (attempt === 0) await sleep(retryAfter || 1500);
  }
  throw lastError;
}

const cacheFile = (source, url) =>
  path.join(DATA, 'cache', `${source}-${crypto.createHash('sha1').update(url).digest('hex')}.json`);

function readCache(file) {
  try {
    const hit = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Date.now() - Date.parse(hit.fetchedAt) < CACHE_MS) return hit;
  } catch {
    // no cache, or a half-written one: fetch again
  }
  return null;
}

function writeCache(file, url, finalUrl, body) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ url: redact(url), finalUrl: redact(finalUrl), fetchedAt: new Date().toISOString(), body }));
    fs.renameSync(tmp, file);
  } catch {
    // a cache that can't be written costs a second request, nothing more
  }
}

// get(url, { source, as: 'json' | 'xml' | 'text', fresh, headers }) -> body.
// 'page' returns { body, finalUrl } so callers can see where a redirect ended.
export async function getFull(url, { source = 'http', as = 'json', fresh = false, headers = {} } = {}) {
  const file = cacheFile(source, url);
  if (!fresh) {
    const hit = readCache(file);
    if (hit) return { body: hit.body, finalUrl: hit.finalUrl ?? url, cached: true };
  }
  const { body, finalUrl } = await request(url, { as, headers, redirect: 'follow' });
  writeCache(file, url, finalUrl, body);
  return { body, finalUrl, cached: false };
}

export async function get(url, options) {
  return (await getFull(url, options)).body;
}

// Where does this URL redirect to? (Workable's short links, for one.)
export async function redirectTarget(url) {
  const res = await request(url, { as: 'text', headers: {}, redirect: 'manual' });
  return res.location ? new URL(res.location, url).href : null;
}

// A get() with the source name and --fresh already filled in.
export function bindGet(source, fresh) {
  return (url, options = {}) => get(url, { source, fresh, ...options });
}

// --- API keys: environment first, then a .env file at the repo root ---
let dotenv;
function readDotenv() {
  if (dotenv) return dotenv;
  dotenv = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      let value = m[2];
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
      else value = value.replace(/\s+#.*$/, '');
      dotenv[m[1]] = value;
    }
  } catch {
    // no .env file: only the environment counts
  }
  return dotenv;
}

export const envKey = (name) => process.env[name] || readDotenv()[name] || null;

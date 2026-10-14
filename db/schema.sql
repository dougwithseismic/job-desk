-- The desk's memory: one SQLite file in data/desk.sqlite, on the candidate's
-- own computer. Every session reads it first and writes to it as it works, so
-- the next session picks up where this one stopped, and the board shows it.
--
--   node bin/db.mjs init          # creates data/ and this schema; safe to re-run
--   node bin/db.mjs "SELECT …"    # run SQL; see AGENTS.md
--
-- Dates are ISO 8601 in UTC (datetime('now')); due dates are YYYY-MM-DD.
-- Nothing is ever deleted: change a status instead.

PRAGMA journal_mode = WAL;

-- Every job the desk has seen, from any source, so nothing is suggested twice.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  company_domain TEXT,            -- e.g. monzo.com
  location TEXT,                  -- as the posting words it
  workplace TEXT,                 -- remote | hybrid | onsite | unknown
  url TEXT NOT NULL UNIQUE,       -- the posting
  apply_url TEXT,                 -- the application form, when it isn't the posting
  source TEXT NOT NULL,           -- greenhouse | lever | ashby | … | linkedin | recruiter | referral | manual
  source_id TEXT,                 -- the source's own id for the posting
  posted_at TEXT,
  closes_at TEXT,                 -- YYYY-MM-DD, when the posting gives one
  salary TEXT,                    -- exactly as the posting words it; never inferred
  description TEXT,               -- plain-text copy of the posting, kept in case it comes down
  stage TEXT NOT NULL DEFAULT 'found',
    -- found        seen, not yet judged
    -- shortlisted  fits; worth applying
    -- preparing    CV, letter and answers being written
    -- ready        package done, waiting for the candidate's go (an outbox row)
    -- applied      submitted
    -- interviewing at least one interview booked or done
    -- offer        an offer is on the table
    -- accepted     the candidate took it
    -- rejected     they said no
    -- withdrawn    the candidate pulled out
    -- skipped      judged and not worth applying (say why in fit_notes)
    -- expired      the posting closed before we applied
  fit INTEGER,                    -- 0-100, from playbooks/triage.md
  fit_notes TEXT,                 -- what matches, what's missing, why skipped
  folder TEXT,                    -- data/jobs/<id>-<slug>, once preparing
  found_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS jobs_stage ON jobs(stage, fit);
CREATE INDEX IF NOT EXISTS jobs_company ON jobs(company COLLATE NOCASE, title COLLATE NOCASE);

-- Employers worth watching. A watched company's own job board is checked
-- every round (bin/jobs.mjs watch).
CREATE TABLE IF NOT EXISTS companies (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  domain TEXT,
  ats TEXT,                       -- greenhouse | lever | ashby | workable | smartrecruiters | recruitee | personio
  ats_slug TEXT,                  -- the board's id on that system, e.g. "monzo"
  careers_url TEXT,
  watch INTEGER NOT NULL DEFAULT 0,
  never_apply INTEGER NOT NULL DEFAULT 0, -- e.g. the current employer
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Searches the candidate wants run every round.
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,             -- "Senior product designer, London or remote UK"
  query TEXT NOT NULL,            -- keywords, e.g. "product designer"
  location TEXT,                  -- e.g. "London|remote"
  sources TEXT,                   -- comma-separated source names, or NULL for the usual set
  notes TEXT,                     -- anything for the boards searched in the browser
  active INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The timeline. Every status change, email, application, interview and
-- decision, one row each.
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  job_id INTEGER REFERENCES jobs(id),
  kind TEXT NOT NULL,
    -- status | applied | email-in | email-out | interview | note | decision
  summary TEXT NOT NULL,          -- one or two plain sentences
  ref TEXT,                       -- Gmail message id, outbox id, URL or file path
  by TEXT NOT NULL DEFAULT 'agent' -- agent | candidate
);
CREATE INDEX IF NOT EXISTS log_job ON log(job_id, at);

-- Everything that goes out in the candidate's name: applications, emails,
-- LinkedIn messages. Nothing leaves without a row here (playbooks/outbox.md).
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  job_id INTEGER REFERENCES jobs(id),
  kind TEXT NOT NULL,             -- application | follow-up | thank-you | reply | intro-ask | money | decision
  channel TEXT NOT NULL,          -- form | gmail | linkedin
  to_addrs TEXT,                  -- comma-separated, for gmail
  reply_to TEXT,                  -- Gmail message or thread id being answered
  subject TEXT,
  body TEXT NOT NULL,             -- the email or message as it goes out; for an application, the cover note
  files TEXT,                     -- attachments, comma-separated paths under data/
  answers TEXT,                   -- for an application: the form's questions and our answers (markdown)
  why_candidate TEXT,             -- why it waits for the candidate; NULL = it may go once its kind is trusted
  spot_check INTEGER NOT NULL DEFAULT 0, -- 1 = trusted kind, shown in full anyway
  edited INTEGER NOT NULL DEFAULT 0,     -- 1 = the candidate changed something before it went
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting | approved | sent | rejected | failed
  note TEXT,                      -- the candidate's words when they change or turn it down
  decided_at TEXT,
  sent_at TEXT,
  sent_ref TEXT                   -- Gmail message id, confirmation number or screenshot path
);
CREATE INDEX IF NOT EXISTS outbox_status ON outbox(status, id);

-- Earned trust, per kind. clean = approvals in a row sent unchanged.
-- trusted flips to 1 at 5 clean; an edit or a rejection resets both to 0.
-- since_check counts trusted sends since the last spot check.
CREATE TABLE IF NOT EXISTS trust (
  kind TEXT PRIMARY KEY,
  clean INTEGER NOT NULL DEFAULT 0,
  trusted INTEGER NOT NULL DEFAULT 0,
  since_check INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What the candidate changed or turned down, and why. Read the lessons for a
-- kind before writing one.
CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,             -- an outbox kind, or cv | letter | search | triage
  job_id INTEGER,
  outbox_id INTEGER,
  lesson TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  what TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'agent', -- agent: the desk does it | candidate: only they can
  due TEXT,                       -- YYYY-MM-DD; NULL = as soon as possible
  status TEXT NOT NULL DEFAULT 'open', -- open | done | dropped
  outcome TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT
);
CREATE INDEX IF NOT EXISTS todos_open ON todos(status, owner, due);

-- Recruiters, hiring managers, referrers.
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  name TEXT,
  email TEXT,
  company TEXT,
  role TEXT,                      -- recruiter | hiring manager | referrer | agency | other
  linkedin TEXT,
  job_id INTEGER REFERENCES jobs(id),
  do_not_contact INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interviews (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  at TEXT,                        -- local time as given, with its offset: 2026-10-20T14:00+01:00
  kind TEXT,                      -- screen | technical | task | panel | final | other
  with_whom TEXT,
  place TEXT,                     -- video link or address
  prep TEXT,                      -- path to the prep pack under data/
  status TEXT NOT NULL DEFAULT 'booked', -- booked | done | cancelled
  notes TEXT,                     -- the candidate's debrief
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Inbound emails already dealt with, so the next round skips them.
CREATE TABLE IF NOT EXISTS handled (
  message TEXT PRIMARY KEY,       -- "gmail:<message id>"
  job_id INTEGER,
  outcome TEXT NOT NULL,          -- "logged", "outbox 12", "todo 7", "ignored: newsletter"
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Open items waiting on the candidate: outbox rows and their own to-dos.
CREATE VIEW IF NOT EXISTS needs_candidate AS
  SELECT 'outbox' AS what, o.id, o.kind, j.company, j.title,
         coalesce(o.why_candidate, CASE WHEN o.spot_check = 1 THEN 'spot check' WHEN o.kind = 'application' THEN 'needs your go' ELSE 'not trusted yet' END) AS why,
         NULL AS due
    FROM outbox o LEFT JOIN jobs j ON j.id = o.job_id
   WHERE o.status = 'waiting'
  UNION ALL
  SELECT 'todo', t.id, NULL, j.company, j.title, t.what, t.due
    FROM todos t LEFT JOIN jobs j ON j.id = t.job_id
   WHERE t.status = 'open' AND t.owner = 'candidate';

-- Applications and conversations where the candidate spoke last: candidates
-- for a follow-up (playbooks/follow-ups.md).
CREATE VIEW IF NOT EXISTS quiet AS
  SELECT j.id, j.company, j.title, j.stage,
         max(l.at) FILTER (WHERE l.kind IN ('applied', 'email-out')) AS last_out,
         max(l.at) FILTER (WHERE l.kind = 'email-in') AS last_in,
         count(*) FILTER (WHERE l.kind = 'email-out' AND l.summary LIKE 'follow-up%') AS follow_ups,
         CAST(julianday('now') - julianday(max(l.at) FILTER (WHERE l.kind IN ('applied', 'email-out'))) AS INTEGER) AS days_quiet
    FROM jobs j JOIN log l ON l.job_id = j.id
   WHERE j.stage IN ('applied', 'interviewing')
   GROUP BY j.id
  HAVING last_out IS NOT NULL AND (last_in IS NULL OR last_out > last_in);

-- What went out today, checked against the daily limits in playbooks/outbox.md.
CREATE VIEW IF NOT EXISTS sent_today AS
  SELECT count(*) AS sent,
         count(*) FILTER (WHERE kind = 'application') AS applications,
         count(*) FILTER (WHERE channel = 'gmail') AS emails
    FROM outbox
   WHERE status = 'sent' AND date(sent_at) = date('now');

-- The pipeline at a glance.
CREATE VIEW IF NOT EXISTS pipeline AS
  SELECT stage, count(*) AS jobs FROM jobs GROUP BY stage;

# Job sources

Read this to choose where to look for jobs. `node bin/jobs.mjs` pulls postings from public APIs
and normalises them to the `jobs` table. Everything else (LinkedIn, Indeed...) you read in the
candidate's own browser. "Verified" below means fetched live on 2026-10-14.

## The two kinds of source

- **Company boards** (`greenhouse`, `lever`, `ashby`, `workable`, `smartrecruiters`, `recruitee`,
  `personio`, `teamtailor`): one employer's own job board. Complete and current, no key, but
  you must know the company's slug. The best source: every posting is first-hand, with the
  apply link. Build the candidate's watch list from these.
- **Job boards** (`remotive`, `remoteok`, `arbeitnow`, `himalayas`, `jobicy`, `hn`, `adzuna`,
  `reed`): many employers in one feed. Good for discovering companies you hadn't thought of;
  noisier, and they give you a link to the aggregator's page, not the employer's.

A round: `watch` first (cheap, cached), then one or two job boards with the saved search from the
`searches` table, then the browser boards. `node bin/jobs.mjs sources` shows what is available
and which keys are set.

## Commands

```
node bin/jobs.mjs sources
node bin/jobs.mjs fetch greenhouse monzo --q "product designer|ux designer" --where "london|remote" --since 14d
node bin/jobs.mjs fetch remoteok --q "product designer" --exclude "intern|junior" --save
node bin/jobs.mjs watch --q "designer" --since 7d --save
node bin/jobs.mjs detect https://ramp.com/careers --watch "Ramp"
node bin/jobs.mjs show https://jobs.lever.co/spotify/7cf725bb-99c8-4717-b7e5-4f4708fa4169
```

- `fetch <source> [slug]`: company boards need the slug (`greenhouse monzo`); job boards take `--q`.
- `watch`: every `companies` row with `watch = 1` and `ats` + `ats_slug`. A board that fails
  (wrong slug) is listed at the end and the rest still run. Rows with `never_apply = 1` are skipped.
- `detect <careers url | domain>`: reads the page for an ATS link, checks the board is real, prints
  `ats`, `slug` and the open-job count. `--watch "Name"` also adds the company to the watch list.
- `show <url>`: the full text of one posting, for a known ATS URL or any page (best effort).
- Filters: `--q "a|b"` matches titles (a phrase matches at the start of a word, so `design` finds
  `Designer`; three letters or fewer must be whole words, so `ai` skips `Airflow`). `--anywhere` also
  searches the description. `--exclude "intern|junior"` drops whole words (`intern*` for a prefix).
  `--where "london|remote"` keeps matching locations, plus remote jobs when `remote` is listed.
  `--since 14d` (h, d, w); jobs with no date are kept and show `?`. `--limit N` shows N (default 50).
- `--json` for machine reading, `--with-description` to include the text, `--fresh` to skip the
  6 hour cache, `--pages N`, `--country` (adzuna, himalayas, jobicy), `--company "Name"` (boards that
  never name the company: lever, ashby, workable, personio use the slug otherwise).
- `--save` inserts new jobs at stage `found`. A job is skipped if its url is on the desk or the
  same company and title is (the same role from another source). It saves every job that passes
  the filters; with no `--q` and over 100 jobs it refuses, so add `--q` or `--limit`. Greenhouse
  pay and SmartRecruiters/Reed full text are fetched for the postings kept, up to 60 at a time.

## The sources

**Company boards (no key; slug from the board URL, see `detect`)**
- `greenhouse`: `boards.greenhouse.io/<slug>`. Full text. Pay appears only through a second call per
  posting, which `fetch` makes for up to 60 shown or saved jobs. Verified: monzo, airbnb, stripe.
- `lever`: `jobs.lever.co/<slug>` (tries the EU region too). Full text; pay when the company fills it
  in. The EU fallback is written but unverified (no EU board found to test). Verified: spotify, gopuff, palantir.
- `ashby`: `jobs.ashbyhq.com/<slug>`. Full text; salary summary when published. Verified: ramp, linear, notion.
- `workable`: `apply.workable.com/<slug>`. Full text, no pay. Verified: huggingface.
- `smartrecruiters`: `careers.smartrecruiters.com/<Slug>` (case matters). The list has no text, so
  large boards show the newest 500 (use `--q` to search server side); text is added when saving
  or with `--with-description`. Verified: BoschGroup.
- `recruitee`: `<slug>.recruitee.com`. Full text; pay when filled in. Verified: bunq.
- `personio`: `<slug>.jobs.personio.de`. Full text, no pay, often German. Verified: ottonova, clark, helpling.
- `teamtailor`: `<slug>.teamtailor.com`, via its public RSS feed. Full text, no pay. Verified: career.

**Job boards**
- `remoteok`: remote only, tech-heavy, latest 100 per `--q` tag. Their terms: link back to the posting
  on Remote OK and name them as the source (the url we keep is theirs). Verified.
- `himalayas`: remote only; `--country GB` keeps roles open to a country; pay where given. Terms:
  link back and credit Himalayas; refreshes daily; no more than 20 jobs a request. Verified.
- `jobicy`: remote only; `--country uk|usa|europe` is its region filter; pay where given. Terms:
  credit Jobicy; applications go to the posting url. Verified.
- `remotive`: remote only. Its free API currently returns the same 15 delayed jobs whatever you
  search, so treat it as a small sample. Terms: link back, no more than ~4 calls a day. Verified.
- `arbeitnow`: Germany and nearby Europe, mostly German-language, a minority remote; no
  search, so filter locally (newest 600 read). Link back to them. Verified.
- `hn`: the latest "Ask HN: Who is hiring?" thread. Titles and locations are read from the free-form
  first line, best effort; `--q` searches the whole post. The url is the comment, so read it before
  trusting a field. Verified: 257 posts in October 2026.
- `adzuna` (UK default, `--country de|fr|nl|us|...`): aggregator with 500 character snippets, and
  pay only when it is not Adzuna's estimate. Needs `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` (free:
  https://developer.adzuna.com/signup). **Not verified live**: no key was available; the 401 for a bad
  key was confirmed and the rest was run against the documented response shape.
- `reed` (UK only): needs `REED_API_KEY` (free: https://www.reed.co.uk/developers/jobseeker). Snippets
  in search; full text is fetched for saved postings. **Not verified live**, same as adzuna.

Keys go in the environment or a `.env` file at the repo root (`ADZUNA_APP_ID=...`). Never print them.

## Finding companies worth watching

1. Search the boards' own domains, one search at a time:
   `site:jobs.ashbyhq.com "product designer" london`, then `site:boards.greenhouse.io`,
   `site:jobs.lever.co`, `site:apply.workable.com`, `site:jobs.smartrecruiters.com`,
   `site:jobs.personio.de`. Every result URL is a board: run `detect` on it.
2. Ask the candidate for 5 to 10 employers they admire, find each careers page, run `detect <url>`
   (or just `detect company.com`), and add `--watch "Company"` when it finds a board.
3. Lists the candidate trusts (LinkedIn "companies hiring", a funding round roundup, a salary site):
   read them in the browser, then `detect` each name's careers page.
4. If `detect` finds nothing the page probably builds its list in the browser, or the company uses
   Workday, iCIMS, Taleo or BambooHR. Open the page, find the link to the job board, run `detect`
   on that URL. For those systems, read them in the browser like any other site.
5. A board that shows `gh_jid` links but no name: try `fetch greenhouse <company in lower case>` and
   check the company on the first rows before watching it.

## Boards with no API: read them in the candidate's own Chrome

LinkedIn, Indeed, Glassdoor, Welcome to the Jungle, Otta, and local boards such as jobs.cz or
startupjobs.cz have no usable public API.

- Open them in the candidate's own logged-in Chrome, at a human pace, **one search at a time**, with
  pauses between pages. Never bulk-scrape, never loop over result pages, never run searches in parallel.
- **Never automate LinkedIn** (no scripted clicks, searches, connection requests or messages). It breaks
  LinkedIn's terms and puts the candidate's account at risk. Read what is on the screen; that's all.
- `bin/jobs.mjs show` refuses these sites on purpose.
- Save a posting that is worth a look with a manual insert. Check first that it is not already there:

```
node bin/db.mjs "SELECT id, stage FROM jobs WHERE url = 'https://www.linkedin.com/jobs/view/4012345678' OR (company = 'Monzo' COLLATE NOCASE AND title = 'Senior Product Designer' COLLATE NOCASE)"
node bin/db.mjs - <<'SQL'
INSERT OR IGNORE INTO jobs (title, company, company_domain, location, workplace, url, source, source_id, posted_at, salary, description)
VALUES ('Senior Product Designer', 'Monzo', 'monzo.com', 'London', 'hybrid',
        'https://www.linkedin.com/jobs/view/4012345678', 'linkedin', '4012345678', '2026-10-12',
        '£80,000 - £95,000', 'The posting text, copied as plain text.');
SQL
```

`source` is the board's name in lower case (`linkedin`, `indeed`, `welcometothejungle`, `jobs-cz`). Keep
`url` to the posting itself, `salary` exactly as worded (or leave it out), `workplace` only when the posting
says remote, hybrid or on-site (otherwise `unknown`), and copy the text into `description` in case it comes down.
Nothing goes in `log`; the stage starts at `found` like every other job.

## Manners

Every request carries `User-Agent: job-desk/0.1 (personal job search)`, times out at 20 seconds, retries
once on 429 or 5xx, runs at most 4 at a time and is cached in `data/cache/` for 6 hours. Don't
use `--fresh` in a loop. Don't republish what you fetch; the postings are for the candidate's own search.

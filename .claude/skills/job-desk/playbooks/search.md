# A search round

Goal: every new job that might suit them is on the desk, judged, with the best few shown to them. Read `../sources.md` for the sources and commands.

1. **Their watch list** (cheapest, most reliable, first-hand):
   ```sh
   node bin/jobs.mjs watch --q "<their titles, | separated>" --exclude "<titles to skip>" --since 14d --save
   ```
2. **Saved searches**: for each active row in `searches`, run its query on one or two job boards that suit it (remote-only boards for remote searches, `arbeitnow` for Germany, `adzuna` or `reed` for the UK if keys are set, `hn` for startups), with `--save`. Then `UPDATE searches SET last_run_at = datetime('now') WHERE id = …`.
3. **Find new companies.** Web searches such as `site:jobs.ashbyhq.com "<title>" <city>`, `site:boards.greenhouse.io "<title>"` or `site:jobs.lever.co "<title>" remote` turn up companies whose boards you can `detect` and add to the watch list (ask them first if it's more than five).
4. **Browser boards** (LinkedIn Jobs, Indeed, Welcome to the Jungle, local boards): in their Chrome, one search per board with their filters, read the first page or two at a human pace, and insert the promising ones by hand:
   ```sql
   INSERT OR IGNORE INTO jobs (title, company, location, workplace, url, source, salary, description)
   VALUES ('…', '…', '…', 'hybrid', '<posting url>', 'linkedin', '<as written, or NULL>', readfile('data/bodies/posting.txt'));
   ```
   Prefer the employer's own posting URL over the board's when you can find it.
5. **Triage** everything with stage `found` (`triage.md`).

Stop early rather than flooding them: 3 to 8 strong matches a round is a good round.

# Job desk

A job-hunt assistant that runs in Claude (or Codex) on your own computer. It finds jobs, checks each one against what you want, tailors your CV and a cover letter for every application, fills in the forms, reads your email for replies and interviews, follows up when companies go quiet, and preps you for interviews.

You stay in charge. Everything that goes out in your name, it shows you first. Once you've approved five of one kind (follow-up emails, say) without changing them, it sends those itself and still shows you one now and then. Applications always wait for your go.

![The CV design](docs/example-cv.png)

## Get started

You need: [Claude](https://claude.ai/download) (a paid plan, with the desktop app) or Codex, [Google Chrome](https://www.google.com/chrome), and [Node.js](https://nodejs.org) (the LTS version).

1. Make an empty folder, for example `Documents/job-search`.
2. Open it in Claude: the desktop app's **Code** tab, then choose that folder.
3. Paste this and press Enter:

   > Set up my job desk: clone https://github.com/dougwithseismic/job-desk into this folder, then read SETUP.md and go through it with me step by step.

It installs everything, connects your Gmail and Chrome and tests them, asks for your CV, and asks what you're looking for. About 20 minutes.

## Using it

Just talk to it:

- **"Find me jobs"**: searches company job boards, job sites and LinkedIn, and shows you the best matches with the reasons.
- **"Apply to 2 and 5"**: tailors your CV and a letter, fills in the form, shows you everything, and submits when you say go.
- **"What's waiting?"**: anything that needs you.
- **"Check my email"**: logs confirmations, rejections and interview invites, and drafts replies.
- **"Prep me for the Monzo interview"**: a prep pack and a practice run.
- **"How's my search going?"** or **"export"**: where everything stands, or a spreadsheet of every job.

## Your data

Everything (your CV, the jobs, every email and decision) lives in the `data/` folder on your computer. It's never uploaded or shared, and never part of the code. To get updates, say "update the job desk".

## What's inside

| Path | What |
| --- | --- |
| `AGENTS.md`, `CLAUDE.md`, `SETUP.md` | Instructions for the agent |
| `.claude/skills/` (also `.agents/skills/`) | The skills: `job-desk` (the daily work), `cv` (CVs and letters), `setup` |
| `db/schema.sql` | The desk's SQLite tables |
| `bin/db.mjs` | Reads and writes the desk; `export` makes a CSV |
| `bin/jobs.mjs` | Pulls jobs from Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio, Teamtailor, Remote OK, Himalayas, Jobicy, Arbeitnow, Hacker News "Who is hiring", Adzuna and Reed |
| `bin/cv.mjs` | Renders CVs and letters to PDF with your Chrome, and checks what an ATS reads |
| `templates/cv/` | The CV and letter design |
| `assets/fonts/` | Sofia Sans, Geist and Geist Mono (SIL Open Font License) |

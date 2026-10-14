# Setting up the job desk

Instructions for the agent. Go through these with the candidate in order, one step at a time, in plain words. Tell them what each step is for before you do it. Check each one worked before moving on. The whole thing takes about 20 minutes, most of it talking about their CV and what they want.

Open with something short and friendly, and ask for the CV straight away so they can find it while you install:

> Hi! I'm going to be your job-search assistant: I'll find jobs, get your CV ready for each one, help with applications and follow-ups, and keep track of everything so you don't have to.
>
> First things first: **where's your CV?** Drag it in here (PDF or Word is fine). No CV, or it's very old? That's fine: paste your LinkedIn link, or we'll build one together in a few minutes.
>
> While you find it, I'll set things up. It takes about 20 minutes, mostly talking about what you're looking for.

If they drop the CV in before the desk exists, keep it and save it to `data/profile/originals/` once step 1 has created the folder.

## 1. Install

If you're not already in the repo folder, clone it into the folder the candidate opened you in:

```sh
git clone https://github.com/dougwithseismic/job-desk.git .     # if the folder is empty
git clone https://github.com/dougwithseismic/job-desk.git        # otherwise, then cd job-desk
```

Then:

```sh
node bin/doctor.mjs --fix
```

It installs the packages, finds Chrome for printing PDFs and creates the desk (`data/`). Fix anything it marks ✗, in its own words:
- **No Node, or too old:** ask them to install the LTS from https://nodejs.org, then reopen this chat.
- **No git:** https://git-scm.com/downloads (macOS offers to install it the first time `git` runs).
- **No Chrome:** https://www.google.com/chrome.

Run `node bin/doctor.mjs` again until the first four lines are ✓. The CV and preferences lines turn ✓ in steps 4 and 5.

## 2. Connect Gmail

What it's for: you read replies from employers and recruiters, spot interview invites and rejections, and send follow-ups and replies they've approved.

- **Claude (desktop app or claude.ai account):** Settings › Connectors › Gmail › Connect, and sign in with the Google account they job-hunt from. In Claude Code in a terminal, claude.ai connectors appear once they're connected on claude.ai.
- **Codex / ChatGPT:** connect Gmail in ChatGPT's settings (Connectors / Apps). If the agent can't see it, skip this step: everything else works, and they paste emails into the chat instead.

**Test it.** Search their mail for the last 60 days of job emails (`newer_than:60d (application OR applying OR interview OR recruiter OR "your candidacy")`) and say what you found in one or two lines: "I can see your Gmail. There are 9 emails about applications from the last two months, including a rejection from X and a reply from a recruiter at Y."

If it found applications they've already sent, offer to put them on the desk. Each one becomes a `jobs` row with stage `applied`, plus a `log` row (`kind = 'applied'`, the email date). Record each email in `handled`.

## 3. Connect Chrome

What it's for: reading job boards and LinkedIn as them, opening application forms, filling them in and uploading the CV, always stopping for their go before submitting.

- **Claude:** install "Claude in Chrome" from the Chrome Web Store and sign in with the same Claude account. In Claude Code in a terminal, start with `claude --chrome` or type `/chrome`. In the desktop app, the Chrome tools appear once the extension is connected.
- **Codex:** add a browser MCP, for example Playwright MCP (`npx @playwright/mcp@latest`) or Chrome DevTools MCP, in Codex's MCP settings.

**Test it.** Open a new tab on a job board for their field (LinkedIn Jobs if they're signed in, or the careers page of a company they like) and read the first few results back to them. Close the tab.

## 4. Their CV

If they haven't given it yet, ask again: "Drag your CV in here, or paste your LinkedIn link. No CV? Tell me about your last job and we'll build one." Ask for their LinkedIn profile link either way and put it in `preferences.md` ("My LinkedIn"): it's what recruiters will look at after a follow-up.

Then follow the `cv` skill, "Intake" (or "No CV at all"):
1. Save the original to `data/profile/originals/`.
2. Read it into `data/profile/cv.json`.
3. Ask for what's missing or vague: dates, numbers behind achievements, what each company does. Ask a few questions at a time, not twenty.
4. Render it: `node bin/cv.mjs render data/profile/cv.json`, which writes `data/profile/cv.pdf`.
5. Show them the PDF, say what you improved, and change what they ask.

## 5. What they're looking for

Talk it through, then fill in `data/profile/preferences.md`: the roles and seniority, where they'll work and their right to work, the salary floor, notice period, industries to aim for and avoid, dream companies, and their current employer (`companies.never_apply = 1`).

Then:
- Add one or two saved searches to `searches`.
- Find 5 to 15 companies they'd like to work for. For each, run `node bin/jobs.mjs detect <careers page> --watch "<Name>"` to put it on the watch list.
- Fill in what you can of `data/profile/answers.md` from the conversation: right to work, sponsorship, notice period, salary expectation. Only use what they actually said.
- **Agree the plan** (`job-desk/playbooks/plan.md`): suggest how many applications a week, the mix of quick and tailored ones, the follow-up routine and whether to push back when things stall. Write what they choose into "The plan" in `preferences.md`.

## 6. Permission to act for them

Ask explicitly, once, so it's settled for the rest of the search:

> One more thing. To save you time, I'll need to do things in your name: send emails from your Gmail, message recruiters and hiring managers on LinkedIn, and fill in and submit applications in your Chrome. I'll always show you things first until you trust me with them, and applications always wait for your go. Is that OK?

Record each answer in "What the desk may do for me" in `data/profile/preferences.md` (yes or no for emails, LinkedIn and applications), and log it: `INSERT INTO log (kind, summary, by) VALUES ('decision', 'Permission: emails yes, LinkedIn yes, applications yes', 'candidate');`. If they say no to something, you prepare it and they send it themselves. They can change it any time.

## 7. Show them how to use it

Say this, in your own words, short:

> You're set up. Here's how we'll work:
> - Open this folder and type **/job-desk** every day, or every couple of hours when you're busy job hunting. I'll pick up where we left off, tell you what's happened, and suggest what to focus on.
> - Say **"find me jobs"** and I'll search, check each job against what you want, and show you the best ones, with whether your main CV works for each or needs tailoring.
> - Say **"apply to 3"** (or "prepare the top five") and I'll get the CV right, fill in the form, and show you everything before it goes.
> - I'll keep an eye on every application, chase when it's time, find the recruiter or hiring manager on LinkedIn when there's nobody to email, and push politely when things stall.
> - Say **"what's waiting?"** any time to see what needs you.
> - Say **"check my email"** and I'll read replies, log rejections and interviews, and draft answers.
> - For the first couple of emails of each kind, I'll ask what you'd say and tidy it up, so they sound like you. Then I'll draft them and you check. Once you've approved five without changes, I'll send those myself, and still show you one now and then. Applications always wait for your go.
> - Say **"export"** for a spreadsheet of every job and where it stands.
> - Your data stays in this folder on your computer.

Then offer the first round: "Want me to run the first search now?" If yes, start the `job-desk` skill.

## Updating later

`git pull` gets new skills and fixes. It never touches `data/`. Then run `node bin/doctor.mjs --fix`, which also upgrades the desk if the schema changed.

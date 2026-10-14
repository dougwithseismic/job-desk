# Judging a job

For each job with stage `found`, oldest first. Read the posting (`description`, or `node bin/jobs.mjs show <url>`), `data/profile/preferences.md` and their CV.

## Hard filters: any one fails, it's skipped

- Location and workplace they can't do; right to work they don't have and no sponsorship offered.
- A title or seniority they said to skip.
- Salary stated and clearly below their floor.
- An industry or company they avoid, or `companies.never_apply = 1`.
- Closed, or closing before you could apply.

Skipped: `stage = 'skipped'`, with `fit_notes` saying why in a few words ("Below salary floor: £45k").

## The fit score (0 to 100)

- **Must-haves** (half the score): the posting's essential requirements, each met, partly met or missing, from evidence in their CV.
- **Nice-to-haves** (a quarter): the posting's desirable requirements.
- **What they want** (a quarter): how well it matches their preferences: role, company, pay, workplace.

Write `fit_notes` in two or three lines: what matches (with the CV evidence), what's missing, anything to ask them. Then:

- 70 or more: `stage = 'shortlisted'`.
- 50 to 69: `shortlisted` only if they asked for a wide net; otherwise `skipped` with the reason.
- Under 50: `skipped`.

Always record `fit`, `fit_notes` and `updated_at`.

## Which CV

For every shortlisted job, decide which CV it needs, so they can apply quickly where the main one already works:

- **`master`**: their main CV already leads with what this posting asks for. Apply with it as it is. The fastest route; use it whenever it's honest.
- **`tailor`**: the right experience is there but buried or in other words. A tailored copy: headline, summary, bullet order and the posting's terms (`cv` skill, "Tailoring"). About ten minutes of your work, none of theirs.
- **`rework`**: the job leans on experience the main CV barely shows (a career change, a side of their work it skips). Tell them what you'd need to know ("Have you run budgets? The CV doesn't say"), then add it to the master and tailor from there.

`UPDATE jobs SET cv = '<master | tailor | rework>' WHERE id = …;`

## Showing them

The new shortlist, best first, one line each: `#id Company, Role, place, pay as written, fit 84, main CV works: the reason in a few words` (or "tailor the CV", or "CV needs work: <what's missing>"). Then give a recommendation and ask which to prepare: "I'd send 12, 14 and 15 today with your main CV, and tailor for 9. All of those, or pick?" ("all", "1 3 5", "none"). Read the lessons for `triage`: if they keep saying no to a kind of job, tighten the filters and update `preferences.md` (tell them).

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

## Showing them

The new shortlist, best first, one line each: `#id Company, Role, place, pay as written, fit 84: the reason in a few words`. Then ask which to prepare ("all", "1 3 5", "none"). Read the lessons for `triage`: if they keep saying no to a kind of job, tighten the filters and update `preferences.md` (tell them).

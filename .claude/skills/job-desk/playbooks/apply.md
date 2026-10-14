# Applying

## Preparing a package

For each job they pick (stage `shortlisted`):

1. **Folder:** `data/jobs/<id>-<company>-<role>/` (lowercase, hyphens). Set `jobs.folder`, `stage = 'preparing'`.
2. **The posting:** save its text to `posting.md` in the folder (it may come down later).
3. **Where they apply:** open the posting in their browser and find the application form (`apply_url`). Note what it asks for: CV, letter, questions, and whether it needs an account. Don't submit anything.
4. **The CV:** tailor it (`cv` skill, "Tailoring") into `<folder>/cv.json` and render `cv.pdf`.
5. **A letter**, if the form takes one or the posting asks for one (`../voice.md`): `<folder>/letter.md`, rendered with `node bin/cv.mjs letter <folder>/letter.md --cv <folder>/cv.json`.
6. **Form answers:** every question on the form, with its answer, in `<folder>/answers.md`. Answers come only from `data/profile/answers.md`, their CV and preferences. A question with no answer there gets `ASK` and goes in `why_candidate`. Diversity questions are "Prefer not to say" unless `answers.md` says otherwise.
7. **The outbox row:**
   ```sql
   INSERT INTO outbox (job_id, kind, channel, subject, body, files, answers, why_candidate)
   VALUES (<id>, 'application', 'form', '<role> at <company>', readfile('<folder>/letter.md'),
           '<folder>/cv.pdf, <folder>/letter.pdf', readfile('<folder>/answers.md'), <reasons or NULL>);
   ```
   Use an empty body (`''`) when there's no letter. Then `stage = 'ready'`, plus a `log` note.
8. **Show it** (`../outbox.md`, "Showing what's waiting").

When they answer an `ASK` question, add the answer to `data/profile/answers.md` so they're never asked twice.

## Submitting

Only after their go for this application (`status = 'approved'`).

1. Open `apply_url` in their Chrome.
2. If it needs an account or a sign-in, stop and ask them to sign in or create it themselves. You never type passwords or create accounts. Carry on when they say.
3. Fill each field from the approved `answers`. Upload `cv.pdf` (and `letter.pdf`) with the browser's file upload tool. If the form parses the CV into fields, check what it filled and correct it from `cv.json`.
4. CAPTCHA: ask them to do it.
5. Before the final button, check every field against the approved package. Anything new or different (a question you hadn't seen, a changed answer) means stop and show them.
6. Submit, then read the confirmation. Save its text or a screenshot path as `sent_ref`.
7. Record it (`../outbox.md`, "Sending"): `log` kind `applied`, `stage = 'applied'`, and a to-do to check for a reply in 7 days.

If anything fails (the form errors, the posting closed), set `status = 'failed'` with the reason in `note`, tell them, and set `stage = 'expired'` if the job has gone.

## Applying by email

When the posting says "send your CV to …": the outbox row is `kind = 'application'`, `channel = 'gmail'`, `to_addrs` = that address, the letter as the body (shortened to an email), and the PDFs as files.

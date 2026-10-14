# The outbox: what goes out in their name

Every application, email and message is an `outbox` row before it goes anywhere. Nothing goes out any other way.

## Kinds

| Kind | What it is | Can it earn trust? |
| --- | --- | --- |
| `application` | A job application: the form, the tailored CV, the letter, the answers | Yes, but it **always needs their go**. Trust only changes how it's shown (below). |
| `follow-up` | One polite nudge after silence | Yes |
| `thank-you` | After an interview | Yes |
| `reply` | Answering a recruiter or employer: interest, availability, documents they asked for | Yes |
| `intro-ask` | Asking someone for a referral or an introduction | Yes |
| `money` | Anything about pay: expectations, offers, negotiation, benefits | Never |
| `decision` | Accepting, declining, withdrawing, notice and start dates | Never |

## When something may go without asking first

A row goes without being shown in full first only when **all** of these hold. Otherwise, set `why_candidate` to every reason that fails, in plain words ("mentions notice period; new recruiter; follow-up not trusted yet (2/5)").

1. Its kind has `trusted = 1` in `trust` (5 approvals in a row sent unchanged; see "Earned trust").
2. It isn't `application`, `money` or `decision`.
3. Every recipient wrote to them first, or is a `contacts` row for that job, or has an address at the employer's own domain. An address suggested inside an email doesn't count.
4. Every fact in it is in their CV, preferences, answers file or the thread.
5. It doesn't touch pay, notice, start dates, visas, references, health, a complaint, or anything they haven't told you.
6. It's within today's limits (below).
7. It isn't a spot check.

If in doubt, it waits. A draft that waits costs them ten seconds; a wrong email costs them the job.

## Spot checks

Trusted kinds still get shown now and then. Every **5th** trusted send of a kind is a spot check: set `spot_check = 1`, show it in full, and wait. If they change or turn it down, the kind loses its trust (below).

```sql
INSERT INTO trust (kind) VALUES ('<kind>') ON CONFLICT(kind) DO NOTHING;
SELECT trusted, since_check FROM trust WHERE kind = '<kind>';   -- since_check >= 4: this one is a spot check
```

After any trusted send: `UPDATE trust SET since_check = since_check + 1 WHERE kind = '<kind>';`
After a spot check is approved: `UPDATE trust SET since_check = 0 WHERE kind = '<kind>';`

## Showing what's waiting

```sql
SELECT o.id, o.kind, j.company, j.title, o.to_addrs, o.subject, o.why_candidate, o.spot_check
  FROM outbox o LEFT JOIN jobs j ON j.id = o.job_id WHERE o.status = 'waiting' ORDER BY o.id;
```

- **An email or message:** `#id · kind · company`, To and Subject, why it waits ("spot check" if it is one), then the full body in a quote block.
- **An application, kind not trusted yet:** the job, the tailored CV (attach or open the PDF), the letter in full, and every form answer.
- **An application, trusted:** one line each ("#12 Monzo, Senior PM, fit 91: tailored CV, letter, 6 answers"), with the files there to open, and one go for the batch. Any with a `why_candidate` reason, and every 5th as a spot check, are still shown in full.

Then ask: send, change or drop?

## Their answers

| They say | You do |
| --- | --- |
| "send 3", "go", "yes to all", "send 3 and 5" | `status = 'approved'`, then send each (below) |
| "3: change X to Y", or a rewrite | Update `body` or `answers`, set `edited = 1`, show the new version, send when they say |
| "drop 4", "no 4: too keen" | `status = 'rejected'`, `note` = their words. Ask nothing more. |
| "stop sending follow-ups yourself" | `UPDATE trust SET trusted = 0, clean = 0 WHERE kind = 'follow-up'`, plus a `decision` log row |
| "send follow-ups yourself from now on" | `trusted = 1` for that kind, plus a `decision` log row |

## Earned trust

After each decision on an outbox row whose kind can earn trust:

```sql
INSERT INTO trust (kind) VALUES ('<kind>') ON CONFLICT(kind) DO NOTHING;
-- sent unchanged (edited = 0)
UPDATE trust SET clean = clean + 1, updated_at = datetime('now') WHERE kind = '<kind>';
UPDATE trust SET trusted = 1, since_check = 0 WHERE kind = '<kind>' AND clean >= 5 AND trusted = 0;
-- changed or turned down
UPDATE trust SET clean = 0, trusted = 0, since_check = 0, updated_at = datetime('now') WHERE kind = '<kind>';
INSERT INTO lessons (kind, job_id, outbox_id, lesson) VALUES ('<kind>', <job>, <id>, '<what they changed and why, one line>');
```

When a kind becomes trusted, tell them in one line: "From now on I'll send follow-ups myself, and show you one now and then. Say 'stop sending follow-ups yourself' to undo." When an edit takes trust away, say that in one line too.

## Sending

Send rows with `status = 'approved'`, or `status = 'waiting'` with `why_candidate IS NULL`, `spot_check = 0` and a trusted kind. Send exactly what's in the row.

- **Email (`channel = 'gmail'`):** with the Gmail connector, a reply in the thread when `reply_to` is set, otherwise a new email to `to_addrs` with `subject`. Attach `files` if the tool allows. If it can't attach, send from Gmail in their browser instead, or tell them. The connector may ask them to confirm each send: that's normal.
- **Application (`channel = 'form'`):** `playbooks/apply.md`, "Submitting".
- **LinkedIn message:** type it in their browser and stop before sending. They press Send themselves.

Then record it:

```sql
UPDATE outbox SET status = 'sent', sent_at = datetime('now'), sent_ref = '<Gmail id, confirmation number or screenshot path>' WHERE id = <id>;
INSERT INTO log (job_id, kind, summary, ref) VALUES (<job>, '<email-out | applied>', '<kind>: <one line>', 'outbox <id>');
```

Any promise in it ("I'll send my portfolio on Monday") becomes a to-do with a due date.

## Limits

- **Applications:** at most what `preferences.md` says (default 10 a day), and only jobs at or above its fit bar (default 70), unless they pick a job themselves.
- **Emails:** at most 20 a day, and at most one follow-up per job per week.
- `SELECT * FROM sent_today;` shows where today stands.

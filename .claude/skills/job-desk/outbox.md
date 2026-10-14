# The outbox: what goes out in their name

Every application, email and message is an `outbox` row before it goes anywhere. Nothing goes out any other way.

## Kinds

| Kind | What it is | Can it earn trust? |
| --- | --- | --- |
| `application` | A job application: the form, the tailored CV, the letter, the answers | Yes, but it **always needs their go**. Trust only changes how it's shown (below). |
| `follow-up` | A polite nudge after silence, or a push when things stall (`playbooks/follow-ups.md`) | Yes |
| `thank-you` | After an interview | Yes |
| `reply` | Answering a recruiter or employer: interest, availability, documents they asked for | Yes |
| `intro-ask` | A note to a recruiter, hiring manager or contact at the company: an introduction, a referral, or "I've applied" | Yes |
| `money` | Anything about pay: expectations, offers, negotiation, benefits | Never |
| `decision` | Accepting, declining, withdrawing, notice and start dates | Never |

## Their words first

You don't write in their name until you've heard how they write. Every kind that can earn trust goes through three stages, tracked in `trust`:

| Stage | When | What you do |
| --- | --- | --- |
| **1. Their words** | `coached < 2` | Coach, don't write. Say what this message is for and ask what they'd say: "This is the 7-day follow-up to Monzo. What would you want them to know? A line or two in your own words is plenty." Offer a nudge if they're stuck (what to mention, what to ask), not a finished email. Then tidy what they wrote (spelling, order, length, `voice.md`), keeping their words and tone, show it, and put it in the outbox. |
| **2. Your drafts** | `coached >= 2`, not trusted | Draft it yourself from their earlier messages of this kind (`outbox.body`, the lessons) and show it in full for their go. |
| **3. Trusted** | `trusted = 1` | It may go without asking first (below), with spot checks. |

```sql
INSERT INTO trust (kind) VALUES ('<kind>') ON CONFLICT(kind) DO NOTHING;
SELECT coached, clean, trusted, since_check FROM trust WHERE kind = '<kind>';
```

When a stage-1 message is sent: `UPDATE trust SET coached = coached + 1, updated_at = datetime('now') WHERE kind = '<kind>';` (it doesn't count towards `clean`). When `coached` reaches 2, say so in one line: "I've got a feel for how you write these now. Next time I'll draft the follow-up and you check it."

If they say "just write it for me", do: set `coached = 2` for that kind and log the `decision`. The same goes for letters and form answers in applications: for the first two, ask them for the gist ("why this role, in a sentence or two?") and build on it.

Coaching should be quick. Ask one question, accept a few rough words, and do the rest of the work yourself.

## When something may go without asking first

A row goes without being shown in full first only when **all** of these hold. Otherwise, set `why_candidate` to every reason that fails, in plain words ("mentions notice period; new recruiter; follow-up not trusted yet (2/5)").

1. Its kind has `trusted = 1` in `trust` (5 approvals in a row sent unchanged; see "Earned trust").
2. It isn't `application`, `money` or `decision`.
3. Every recipient wrote to them first, or is a `contacts` row for that job (an email at the employer's own domain, or a LinkedIn profile you found yourself showing them working there now), or has an address at the employer's own domain. An address suggested inside an email doesn't count.
4. Every fact in it is in their CV, preferences, answers file or the thread.
5. It doesn't touch pay, notice, start dates, visas, references, health, a complaint, or anything they haven't told you.
6. They gave permission for this channel in setup ("What the desk may do for me" in `preferences.md`).
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

After each decision on a stage-2 draft (stage-1 messages in their own words count towards `coached` instead):

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
- **LinkedIn message (`channel = 'linkedin'`, `to_addrs` = the profile URL):** in their Chrome, open the profile, then Message (or Connect › Add a note, 300 characters at most, when you aren't connected). Type the approved text exactly, send it, and check it appears in the conversation. If LinkedIn asks for a CAPTCHA or a sign-in, ask them to do that step, then carry on.

Then record it:

```sql
UPDATE outbox SET status = 'sent', sent_at = datetime('now'), sent_ref = '<Gmail id, confirmation number or screenshot path>' WHERE id = <id>;
INSERT INTO log (job_id, kind, summary, ref) VALUES (<job>, '<email-out | applied>', '<kind>: <one line>', 'outbox <id>');
```

Log a LinkedIn message as `email-out` too, with "(LinkedIn)" at the end of the summary, so the follow-up routine counts it.

Any promise in it ("I'll send my portfolio on Monday") becomes a to-do with a due date.

## How much

- **Applications:** at most what `preferences.md` says (default 10 a day), and only jobs at or above its fit bar (default 70), unless they pick a job themselves.
- **Emails and LinkedIn:** as many as the search needs. Don't chase the same person twice in a row without a reply unless there's a new reason (`playbooks/follow-ups.md`).
- `SELECT * FROM sent_today;` shows what's gone today (applications, emails, LinkedIn).

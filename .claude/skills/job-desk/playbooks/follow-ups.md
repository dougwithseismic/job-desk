# Follow-ups, people and deadlines

Following up is part of every session, not an afterthought: most applications that get an answer get it because someone chased. There's no fixed schedule. Each session, look at every open application and judge what it needs now, from its history and the plan ("Follow-ups" in `data/profile/preferences.md`).

```sql
SELECT * FROM quiet ORDER BY days_quiet DESC;
SELECT j.id, j.company, j.title, j.stage, j.fit, max(l.at) AS last, group_concat(l.kind || ': ' || l.summary, ' | ') AS history
  FROM jobs j JOIN log l ON l.job_id = j.id
 WHERE j.stage IN ('applied', 'interviewing', 'offer') GROUP BY j.id ORDER BY last;
```

Things to weigh, for each one:

- **How long it's been quiet,** against how fast this kind of company moves (a week's silence from a startup is a bad sign; from a bank or the public sector it's normal).
- **What was said last.** A date they were promised that has passed means chase now. A "we'll be in touch next week" means wait for it.
- **How much they want it** (fit, dream company, the plan). Chase the ones they care about harder and sooner, and find a person to write to.
- **What's already been sent.** Don't send the same nudge twice in a row; a second chase needs something new (a different person, a new piece of work, a timeline of their own).
- **When to let go.** A long silence after a couple of chases: ask them whether to mark it `rejected` (most companies never write back).

Then propose what's due ("Monzo's gone quiet since the interview on the 3rd; I'd chase the recruiter today. Wise: nothing for 10 days, I'd find the hiring manager on LinkedIn"), and do what they agree. After an interview, a `thank-you` goes within a day.

Every follow-up is written by `../outbox.md` ("Their words first") and `../voice.md`, and logged with a summary starting "follow-up".

## Pushing back

When things stall, push, politely and specifically. Ask one clear question with a date in it:

- After an interview with no word: "Is there anything else you need from me? I'm keen to keep moving, so a rough timeline would help." (Mention other processes only if they've told you they have them.)
- A promised decision date gone by: "You mentioned you'd decide by Friday; is there an update?"
- Another offer or a deadline on their side (only if they've told you): say so plainly and ask whether the company can move faster.
- A rejection for a job they really wanted: a two-line reply asking for one piece of feedback, if they'd like.

Anything about pay is `money`, and accepting or declining is `decision`: those are theirs (`../outbox.md`).

## Finding the person

An email to a person beats the ATS's silence. For each application to a company they care about, and for every follow-up with nobody to write to:

1. **Already known:** a `contacts` row for the job, the recruiter who emailed, or someone named in the posting.
2. **LinkedIn**, in their Chrome: search `<company> recruiter`, `<company> talent acquisition`, or the team's lead (`<company> head of <team>`). Open the two or three most likely profiles and check they work there now and that the role fits (a recruiter for that team or region, or the hiring manager). Save each:
   ```sql
   INSERT INTO contacts (name, company, role, linkedin, job_id, note)
   VALUES ('…', '…', 'recruiter', 'https://www.linkedin.com/in/…', <job>, 'Recruiter for product, London; found on LinkedIn <date>');
   ```
3. **An email address** only if it's published (the posting, the company's site, their own email to the candidate). Don't guess addresses.

Then the follow-up goes by email if there's an address, otherwise as a LinkedIn message (`channel = 'linkedin'`, `to_addrs` = the profile URL). A person marked `do_not_contact = 1`, or who has said no, gets nothing more. If there's nobody to write to, log a note ("no contact found") and don't follow up through the ATS.

Their own LinkedIn profile (in `preferences.md`) is what recipients will click on: if it's thin or out of date compared to their CV, tell them once, with the two or three changes that matter most.

## Deadlines

- Postings with `closes_at` in the next 3 days and stage `shortlisted` or `preparing`: tell them, and offer to get them ready first.
- To-dos due today or overdue: do yours; remind them of theirs.

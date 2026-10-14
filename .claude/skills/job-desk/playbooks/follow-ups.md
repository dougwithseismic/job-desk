# Follow-ups, people and deadlines

Following up is routine, not an afterthought: most applications that get an answer get it because someone chased. The routine is in "The plan" in `data/profile/preferences.md`; if it's empty, use the default below and tell them.

## The routine (default)

| When | What |
| --- | --- |
| On applying, for jobs they really want | Find the person (below) and, if the plan says so, a short `intro-ask`: "I've just applied for X; one line of why". |
| 7 days quiet | First `follow-up`: the role, when they applied, one line of fit, a light question. |
| 14 days quiet | Second `follow-up`, shorter, to the same person or a second one. |
| 30 days quiet | Ask them whether to mark it `rejected` (most companies never write back). |
| A date they were promised passes | A `follow-up` the next working day asking for an update. |
| After an interview | A `thank-you` within a day; a `follow-up` if the timeline they gave passes. |

```sql
SELECT * FROM quiet WHERE (days_quiet >= 7 AND follow_ups = 0) OR (days_quiet >= 14 AND follow_ups = 1);
SELECT j.id, j.company, j.title, max(l.at) AS applied_at FROM jobs j JOIN log l ON l.job_id = j.id AND l.kind = 'applied'
 WHERE j.stage = 'applied' GROUP BY j.id HAVING julianday('now') - julianday(applied_at) >= 30;
```

Every follow-up is written by `../outbox.md` ("Their words first") and `../voice.md`, and logged with a summary starting "follow-up".

## Pushing back

When things stall, push, politely and specifically. Ask one clear question with a date in it:

- After an interview with no word: "Is there anything else you need from me? I'm keen to keep moving, and I'm in other processes, so a rough timeline would help."
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

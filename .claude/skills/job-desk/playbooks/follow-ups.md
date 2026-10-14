# Follow-ups and deadlines

## Quiet applications

```sql
SELECT * FROM quiet WHERE days_quiet >= 7 AND follow_ups = 0;
```

For each, check for a real person to write to: a `contacts` row, the recruiter who emailed, or a hiring manager or recruiter named in the posting with an address at the company's domain. A no-reply address or an ATS isn't a person: no follow-up (log a note instead).

Draft a `follow-up` (`../voice.md`): the role, when they applied, one line of fit, and a light question. One follow-up per application, then a second only after 14 more days and only if they say so. After that, leave it.

## After an interview

Within a day of an `interviews` row passing (`status = 'booked'`, time in the past): ask them how it went (`notes`, then `status = 'done'`), and draft a `thank-you` to whoever interviewed them, mentioning one real thing from the conversation they told you about.

## Deadlines

- Postings with `closes_at` in the next 3 days and stage `shortlisted` or `preparing`: tell them.
- To-dos due today or overdue: do yours; remind them of theirs.
- 30 days in `applied` with no reply and no follow-up possible: ask whether to mark it `rejected` (most companies never write back).

---
name: cv
description: The candidate's CV and cover letters. Reads any CV (PDF, Word, pasted text, LinkedIn) into a structured master CV, improves it with them, tailors a copy for each job without inventing anything, writes letters, and renders both to a clean, ATS-friendly A4 or Letter PDF with the bundled design. Use for "here's my CV", "improve my CV", "update my CV", "tailor my CV for …", "write a cover letter", "make it one page", "change the colour", "export my CV", or whenever the job-desk skill needs a CV or letter.
---

# The CV

The **master CV** is `data/profile/cv.json`: everything true about their career. Every tailored CV is a copy of it, cut and reordered for one job. Nothing appears in a tailored CV that isn't in the master.

| File | What's in it |
| --- | --- |
| `format.md` | The cv.json format and the design options (`meta`) |
| `writing.md` | How to write each part, and international conventions |
| `templates/cv/example.json` | A complete example (a fictional person) |
| `docs/example-cv.pdf` | What the design looks like |

## Intake: their existing CV into the master

1. Copy whatever they give you into `data/profile/originals/`.
2. Read it:
   - **PDF:** read it directly, or `node bin/cv.mjs text <file.pdf>`.
   - **Word:** on macOS, `textutil -convert txt -stdout <file.docx>`. Otherwise ask them to save it as PDF.
   - **LinkedIn:** open their profile in their browser and read it, or ask them to use LinkedIn's "Save to PDF".
3. Write `data/profile/cv.json` (`format.md`), keeping their facts exactly: titles, employers, dates, degrees.
4. Improve the wording with `writing.md`. Then ask, a few at a time, for what would make it stronger: numbers behind achievements, what each employer does, missing dates, the tools they use. Never fill a gap with a guess.
5. Render it and show them:
   ```sh
   node bin/cv.mjs render data/profile/cv.json --png
   ```
   Fix whatever the report flags (pages over `maxPages`, a mostly empty last page, anything wider than the page), then show the PDF, or the PNGs if you can't read PDFs. Say in two or three lines what you changed and why.

**No CV at all:** build the master from a conversation. Ask about one job at a time, most recent first: the title, the employer and what it does, the dates, and two or three things they did or changed there (with numbers if they have them). Then education, languages and the tools they use. Ten minutes of chat is enough for a first version; render it and improve it together.

When they tell you something new about their career, add it to the master and re-render.

## Tailoring for a job

Into the job's folder (`job-desk/playbooks/apply.md`):

1. List the posting's must-haves and nice-to-haves, and the words it uses for them.
2. Copy the master to `<folder>/cv.json` and set `meta.job` to the job id.
3. **Headline and summary:** aim them at this role, from facts in the master.
4. **Order:** the most relevant bullets first in each role; cut what doesn't help this application (older roles can shrink to one or two bullets).
5. **Words:** where they truthfully did the thing, use the posting's term for it ("stakeholder management" if they say that and the candidate did it). Never add a skill, tool or achievement that isn't in the master.
6. **Skills:** reorder groups and items so the posting's needs come first; drop the irrelevant.
7. **Length:** one page for under about ten years' experience, two at most (`meta.maxPages`).
8. Render, then check the text an ATS will read:
   ```sh
   node bin/cv.mjs render <folder>/cv.json
   node bin/cv.mjs check <folder>/cv.pdf --keywords "<the posting's key terms, comma-separated>"
   ```
   A missing keyword they genuinely have: work it in. One they don't have: leave it out and mention the gap in the fit notes.

A change they ask for in a tailored CV that's really a fact about them ("I also did X") goes into the master first.

## Letters

`<folder>/letter.md`, written by `../job-desk/voice.md`:

```
---
date: 14 October 2026
to: Hiring team | Monzo | London
subject: Senior Product Manager, Disputes
greeting: Dear hiring team,
closing: Best regards,
---
First paragraph…

Second paragraph…
```

Render: `node bin/cv.mjs letter <folder>/letter.md --cv <folder>/cv.json`. It uses the CV's masthead, so the two match.

## Design

One design, clean and international: A4 (or Letter), no photo, real text throughout so any ATS reads it in order, and fonts bundled in `assets/fonts`. They can change:

- **Accent** (`meta.accent`): `cobalt` (default), `ink`, `plum`, `green`, `red`.
- **Density** (`meta.density`): `normal`, `compact` (fits more on a page), `roomy`.
- **Paper** (`meta.paper`): `A4`, or `Letter` for the US and Canada.
- **Section order and names** (`meta.order`, `meta.headings`), for example a CV in another language.

Never edit `templates/cv/cv.css` for one person: use `meta`.

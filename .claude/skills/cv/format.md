# cv.json

`templates/cv/example.json` is a complete example. Every field except `basics.name` is optional; leave out what doesn't apply rather than writing empty values.

```jsonc
{
  "basics": {
    "name": "Priya Raman",
    "headline": "Senior product manager, payments and risk",   // under the name: the role they want
    "email": "priya.raman@example.com",
    "phone": "+44 7700 900417",                                 // with the country code
    "location": "London, UK",                                   // city and country
    "links": [{ "label": "linkedin.com/in/priya-raman", "url": "https://www.linkedin.com/in/priya-raman" }],
    "workRights": "UK and EU work rights",                      // optional, for international applications
    "summary": "Two to four sentences. A blank line starts a new paragraph."
  },
  "experience": [
    {
      "title": "Senior Product Manager, Card Payments",
      "company": "Northwind Pay",
      "url": "https://…",                 // optional: makes the employer's name a link
      "location": "London",
      "start": "2022-03",                 // "YYYY-MM" or "YYYY"
      "end": null,                        // null = present
      "about": "What the employer does, in one line (optional)",
      "bullets": ["Achievements. **Bold** marks the number that matters."]
    },
    {
      "company": "Lumen Health",          // several roles at one employer: roles instead of title/bullets
      "location": "London",
      "roles": [
        { "title": "Product Manager", "start": "2020-01", "end": "2022-02", "bullets": ["…"] },
        { "title": "Associate Product Manager", "start": "2018-06", "end": "2019-12", "bullets": ["…"] }
      ]                                   // newest first
    }
  ],
  "projects": [{ "name": "…", "url": "…", "role": "…", "start": "…", "end": "…", "summary": "…", "bullets": ["…"] }],
  "education": [{ "degree": "BSc Economics, First Class", "school": "University of Manchester", "location": "…", "start": "2013", "end": "2016", "notes": ["…"] }],
  "skills": [{ "group": "Payments", "items": ["Card issuing", "3-D Secure"] }],
  "certifications": [{ "name": "…", "issuer": "…", "date": "2019", "url": "…" }],
  "languages": [{ "language": "English", "level": "native" }, { "language": "Spanish", "level": "conversational (B1)" }],
  "sections": [
    { "heading": "Volunteering", "entries": [{ "title": "…", "org": "…", "start": "…", "end": "…", "bullets": ["…"] }] },
    { "heading": "Awards", "items": ["One line each"] }
  ],
  "meta": {
    "paper": "A4",                        // or "Letter"
    "accent": "cobalt",                   // ink | cobalt | plum | green | red
    "density": "normal",                  // compact | normal | roomy
    "maxPages": 2,                        // the renderer warns past this
    "locale": "en-GB",                    // month names; "present" sets the word for an ongoing role
    "order": ["experience", "projects", "education", "skills", "certifications", "languages", "sections"],
    "headings": { "experience": "Experience" },   // rename any section
    "job": 12                             // on a tailored copy: the job it was tailored for
  }
}
```

Inside bullets, summaries and `about`: `**bold**`, `*italic*` and `[text](https://…)` work. Nothing else is formatted.

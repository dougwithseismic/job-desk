// Reed: reed.co.uk/api/1.0, UK only, needs a free key (REED_API_KEY from
// reed.co.uk/developers/jobseeker). Search results carry a short description
// and pay as min / max with no period; the one-job call has the full text,
// which enrich() fetches for the few postings being saved or shown in full.
// Terms: link to the posting on Reed (the url we keep).

import { htmlToText } from '../html-text.mjs';
import { envKey } from './_http.mjs';
import { enc, finish, isoDate, money, workplaceFrom } from './_util.mjs';

const API = 'https://www.reed.co.uk/api/1.0';
const headers = () => ({ Authorization: `Basic ${Buffer.from(`${envKey('REED_API_KEY')}:`).toString('base64')}` });

// Reed dates are dd/mm/yyyy.
function ukDate(text) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(text ?? ''));
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : isoDate(text);
}

export default {
  name: 'reed',
  type: 'job board',
  coverage: 'UK only; big UK board; snippets',
  needs: ['REED_API_KEY'],
  enriches: 'description', // what enrich() adds to a posting the search left short
  keyHelp: 'Free key at https://www.reed.co.uk/developers/jobseeker',

  async list({ q = [], where = [], pages, get }) {
    const places = where.filter((w) => w.toLowerCase() !== 'remote');
    const searches = [];
    for (const term of q.length ? q : [null]) for (const place of places.length ? places : [null]) searches.push({ term, place });
    const byId = new Map();
    await Promise.all(
      searches.slice(0, 8).map(async ({ term, place }) => {
        for (let page = 0; page < (pages ?? 1); page++) {
          const params = new URLSearchParams({ resultsToTake: '100', resultsToSkip: String(page * 100) });
          if (term) params.set('keywords', term);
          if (place) {
            params.set('locationName', place);
            params.set('distanceFromLocation', '15');
          }
          const data = await get(`${API}/search?${params}`, { headers: headers() });
          for (const j of data.results ?? []) byId.set(j.jobId, j);
          if ((data.results ?? []).length < 100) break;
        }
      }),
    );
    const jobs = [...byId.values()].map((j) =>
      finish({
        title: j.jobTitle,
        company: j.employerName,
        location: j.locationName,
        workplace: workplaceFrom({ text: [j.locationName, j.jobTitle] }),
        url: j.jobUrl,
        source: 'reed',
        source_id: j.jobId,
        posted_at: ukDate(j.date),
        salary: money({ min: j.minimumSalary, max: j.maximumSalary, currency: j.currency ?? 'GBP' }),
        description: htmlToText(j.jobDescription ?? ''),
      }),
    );
    return { jobs: jobs.filter(Boolean) };
  },

  // Swaps the search snippet for the full description.
  async enrich(job, { get }) {
    if (!job.source_id) return;
    try {
      const j = await get(`${API}/jobs/${enc(job.source_id)}`, { headers: headers() });
      if (j.jobDescription) job.description = htmlToText(j.jobDescription);
    } catch {
      // closed since the search: keep the snippet
    }
  },
};

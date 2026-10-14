// Arbeitnow: arbeitnow.com/api/job-board-api, no key. Mostly Germany and
// nearby Europe, many postings in German, a "remote" flag on each. 300 a page,
// newest first; the API has no search, so filtering happens here. Terms: link
// back to Arbeitnow (the url we keep is theirs) and don't abuse the API.

import { htmlToText } from '../html-text.mjs';
import { finish, isoDate } from './_util.mjs';

export default {
  name: 'arbeitnow',
  type: 'job board',
  coverage: 'Germany and Europe, often German; no search',
  needs: [],

  async list({ since, pages, get }) {
    const maxPages = pages ?? 2;
    const jobs = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await get(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of data.data ?? []) {
        jobs.push(
          finish({
            title: j.title,
            company: j.company_name,
            location: j.location,
            workplace: j.remote === true ? 'remote' : 'unknown',
            url: j.url,
            source: 'arbeitnow',
            source_id: j.slug,
            posted_at: isoDate(j.created_at),
            salary: null,
            description: htmlToText(j.description ?? ''),
          }),
        );
      }
      const oldest = Math.min(...(data.data ?? []).map((j) => j.created_at * 1000));
      if (!data.links?.next || !data.data?.length || (since && oldest < since)) break; // newest first: nothing newer is left
    }
    return { jobs: jobs.filter(Boolean) };
  },
};

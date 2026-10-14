// Remotive: remotive.com/api/remote-jobs, no key. Remote-only. As of this
// writing the free API returns the same 15 delayed postings whatever search or
// category it is given, so it is a small sample, not a search. Terms: link back
// to the posting and name Remotive as the source (the url we keep does that),
// don't republish, and ask no more than ~4 times a day (the 6 hour cache keeps
// us there).

import { htmlToText } from '../html-text.mjs';
import { finish, isoDate } from './_util.mjs';

export default {
  name: 'remotive',
  type: 'job board',
  coverage: 'Remote only; free API gives just 15 jobs',
  needs: [],

  async list({ get }) {
    const data = await get('https://remotive.com/api/remote-jobs');
    const jobs = (data.jobs ?? []).map((j) =>
      finish({
        title: j.title,
        company: j.company_name,
        location: j.candidate_required_location,
        workplace: 'remote', // a remote-only board
        url: j.url,
        source: 'remotive',
        source_id: j.id,
        posted_at: isoDate(j.publication_date),
        salary: j.salary,
        description: htmlToText(j.description ?? ''),
      }),
    );
    return { jobs: jobs.filter(Boolean) };
  },
};

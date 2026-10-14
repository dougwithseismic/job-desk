// Jobicy: jobicy.com/api/v2/remote-jobs, no key. Remote-only. --q is a keyword
// search ("tag"); --country is Jobicy's geo slug (uk, usa, europe, anywhere...).
// Terms: credit Jobicy with a direct link and send applications to the
// original posting url (the url we keep). The feed refreshes hourly.

import { htmlToText } from '../html-text.mjs';
import { finish, isoDate, money, normalisePeriod } from './_util.mjs';

export default {
  name: 'jobicy',
  type: 'job board',
  coverage: 'Remote only; --country region; pay',
  needs: [],

  async list({ q = [], country, get }) {
    const searches = q.length ? q : [null];
    const feeds = await Promise.all(
      searches.map((term) => {
        const params = new URLSearchParams({ count: '50' });
        if (term) params.set('tag', term);
        if (country) params.set('geo', country.toLowerCase());
        return get(`https://jobicy.com/api/v2/remote-jobs?${params}`);
      }),
    );
    const byId = new Map();
    for (const feed of feeds) for (const j of feed.jobs ?? []) byId.set(j.id, j);
    const jobs = [...byId.values()].map((j) =>
      finish({
        title: j.jobTitle,
        company: j.companyName,
        location: j.jobGeo,
        workplace: 'remote', // a remote-only board
        url: j.url,
        source: 'jobicy',
        source_id: j.id,
        posted_at: isoDate(j.pubDate),
        salary: money({ min: j.salaryMin, max: j.salaryMax, currency: j.salaryCurrency, period: normalisePeriod(j.salaryPeriod) }),
        description: htmlToText(j.jobDescription ?? ''),
      }),
    );
    return { jobs: jobs.filter(Boolean) };
  },
};

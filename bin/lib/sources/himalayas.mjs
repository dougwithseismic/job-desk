// Himalayas: himalayas.app/jobs/api, no key. Remote-only, worldwide, with pay
// where the company gives it. 20 a page. --q uses their search endpoint;
// --country (a name or code such as GB) keeps roles open to that country.
// Terms: link back to Himalayas (the url we keep is theirs) and credit it.

import { htmlToText } from '../html-text.mjs';
import { finish, isoDate, money, normalisePeriod } from './_util.mjs';

const API = 'https://himalayas.app/jobs/api';

function normalise(j) {
  return finish({
    title: j.title,
    company: j.companyName,
    location: (j.locationRestrictions ?? []).join(', '),
    workplace: 'remote', // a remote-only board
    url: j.applicationLink ?? j.guid,
    source: 'himalayas',
    source_id: j.guid ?? j.applicationLink,
    posted_at: isoDate(j.pubDate),
    salary: money({ min: j.minSalary, max: j.maxSalary, currency: j.currency, period: normalisePeriod(j.salaryPeriod) }),
    description: htmlToText(j.description ?? ''),
  });
}

export default {
  name: 'himalayas',
  type: 'job board',
  coverage: 'Remote only, worldwide; --country; pay',
  needs: [],

  async list({ q = [], country, pages, get }) {
    const maxPages = pages ?? 3;
    const byId = new Map();
    const searches = q.length ? q : [null];
    await Promise.all(
      searches.map(async (term) => {
        let cursor = null;
        for (let page = 1; page <= maxPages; page++) {
          const params = new URLSearchParams();
          let url;
          if (term) {
            params.set('q', term);
            params.set('sort', 'recent');
            params.set('page', String(page));
            if (country) params.set('country', country);
            url = `${API}/search?${params}`;
          } else {
            if (cursor) params.set('cursor', cursor);
            url = `${API}${cursor ? `?${params}` : ''}`;
          }
          const data = await get(url);
          for (const j of data.jobs ?? []) byId.set(j.guid ?? j.applicationLink, j);
          cursor = data.nextCursor;
          if (!data.jobs?.length || (!term && !cursor)) return;
        }
      }),
    );
    return { jobs: [...byId.values()].map(normalise).filter(Boolean) };
  },
};

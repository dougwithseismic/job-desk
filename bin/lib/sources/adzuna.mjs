// Adzuna: api.adzuna.com, needs a free key (ADZUNA_APP_ID + ADZUNA_APP_KEY from
// developer.adzuna.com). An aggregator over many boards in 19 countries.
// --country gb|de|fr|nl|... (default gb). Descriptions are Adzuna's ~500
// character snippet. Pay is used only when Adzuna says it is not its own
// estimate (salary_is_predicted). Terms: link to Adzuna's page (the url we keep).

import { htmlToText } from '../html-text.mjs';
import { envKey } from './_http.mjs';
import { enc, finish, isoDate, money, workplaceFrom } from './_util.mjs';

// Adzuna quotes pay in each market's own currency, yearly.
const CURRENCY = {
  gb: 'GBP', us: 'USD', at: 'EUR', be: 'EUR', de: 'EUR', es: 'EUR', fr: 'EUR', it: 'EUR', nl: 'EUR',
  au: 'AUD', br: 'BRL', ca: 'CAD', ch: 'CHF', in: 'INR', mx: 'MXN', nz: 'NZD', pl: 'PLN', sg: 'SGD', za: 'ZAR',
};
const MAX_SEARCHES = 8;

export default {
  name: 'adzuna',
  type: 'job board',
  coverage: 'Aggregator, UK default; --country; snippets',
  needs: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  keyHelp: 'Free key at https://developer.adzuna.com/signup',
  countries: Object.keys(CURRENCY),

  async list({ q = [], where = [], anywhere, since, country = 'gb', pages, get }) {
    const market = country.toLowerCase();
    if (!CURRENCY[market]) throw new Error(`Adzuna has no market "${country}". Use one of: ${Object.keys(CURRENCY).join(', ')}.`);
    const auth = { app_id: envKey('ADZUNA_APP_ID'), app_key: envKey('ADZUNA_APP_KEY') };
    // One search per phrase and place; "remote" is not a place Adzuna can search.
    const places = where.filter((w) => w.toLowerCase() !== 'remote');
    const searches = [];
    for (const term of q.length ? q : [null]) for (const place of places.length ? places : [null]) searches.push({ term, place });
    const used = searches.slice(0, MAX_SEARCHES);
    const notes = searches.length > used.length ? [`ran ${MAX_SEARCHES} of ${searches.length} phrase and place combinations`] : [];

    const byId = new Map();
    await Promise.all(
      used.map(async ({ term, place }) => {
        for (let page = 1; page <= (pages ?? 1); page++) {
          const params = new URLSearchParams({ ...auth, results_per_page: '50', sort_by: 'date', 'content-type': 'application/json' });
          if (term) params.set(anywhere ? 'what' : 'title_only', term);
          if (place) params.set('where', place);
          if (since) params.set('max_days_old', String(Math.max(1, Math.ceil((Date.now() - since) / 864e5))));
          const data = await get(`https://api.adzuna.com/v1/api/jobs/${enc(market)}/search/${page}?${params}`);
          for (const j of data.results ?? []) byId.set(j.id, j);
          if ((data.results ?? []).length < 50) break;
        }
      }),
    );

    const jobs = [...byId.values()].map((j) => {
      const link = new URL(j.redirect_url);
      link.search = ''; // the tracking query changes on every call; the path alone identifies the ad
      return finish({
        title: htmlToText(j.title ?? ''), // Adzuna wraps the words you searched for in <strong>
        company: j.company?.display_name,
        location: j.location?.display_name,
        workplace: workplaceFrom({ text: [j.location?.display_name, j.title] }),
        url: link.href,
        source: 'adzuna',
        source_id: j.id,
        posted_at: isoDate(j.created),
        salary: String(j.salary_is_predicted) === '1' ? null : money({ min: j.salary_min, max: j.salary_max, currency: CURRENCY[market], period: 'year' }),
        description: htmlToText(j.description ?? ''),
      });
    });
    return { jobs: jobs.filter(Boolean), notes };
  },
};

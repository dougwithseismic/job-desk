// Remote OK: remoteok.com/api, no key. Remote-only. The feed is the latest 100
// postings; ?tag= reaches deeper into one topic. Terms: link back to the
// posting on Remote OK (with follow) and name Remote OK as the source. The url
// we keep is theirs, so that holds. Their salary fields are USD.

import { htmlToText } from '../html-text.mjs';
import { enc, finish, isoDate, money } from './_util.mjs';

export default {
  name: 'remoteok',
  type: 'job board',
  coverage: 'Remote only, mostly tech; 100 per tag',
  needs: [],

  // Each --q alternative becomes a tag ("product designer" -> product-designer).
  async list({ q = [], get }) {
    const urls = q.length
      ? q.map((term) => `https://remoteok.com/api?tag=${enc(term.toLowerCase().replace(/\s+/g, '-'))}`)
      : ['https://remoteok.com/api'];
    const feeds = await Promise.all(urls.map((url) => get(url)));
    const seen = new Map();
    for (const feed of feeds) for (const j of feed) if (j.position && j.id) seen.set(j.id, j); // the first element is the legal notice
    const jobs = [...seen.values()].map((j) => {
      const url = j.url ? new URL(j.url).href : null; // lower-cases the host
      return finish({
        title: j.position,
        company: j.company,
        location: j.location,
        workplace: 'remote', // a remote-only board
        url,
        apply_url: j.apply_url ? new URL(j.apply_url).href : null,
        source: 'remoteok',
        source_id: j.id,
        posted_at: isoDate(j.date ?? j.epoch),
        salary: money({ min: j.salary_min, max: j.salary_max, currency: 'USD', period: 'year' }),
        description: htmlToText(j.description ?? ''),
      });
    });
    return { jobs: jobs.filter(Boolean) };
  },
};

// The news radar and the news-explainer format.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-radar-test-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const R = await import('../src/pipeline/trend-radar.js');
const S = await import('../src/pipeline/docu-script.js');
const SC = await import('../src/pipeline/script.js');

const RSS = `<?xml version="1.0"?><rss><channel><title>Daily Search Trends</title>
<item><title>pneumonic plague</title><ht:approx_traffic>200,000+</ht:approx_traffic><pubDate>Mon, 5 Oct 2026 08:30:00 -0700</pubDate>
<ht:news_item><ht:news_item_title>Russian lab worker dies of suspected plague &amp; 200 watched</ht:news_item_title><ht:news_item_url>https://example.org/a</ht:news_item_url><ht:news_item_source>Al Jazeera</ht:news_item_source></ht:news_item>
</item><item><title>lions vs panthers</title><ht:approx_traffic>500+</ht:approx_traffic><pubDate>x</pubDate></item></channel></rss>`;

test('radar: the trending RSS is read with its traffic and headlines', () => {
  const items = R.parseTrendingRss(RSS);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'pneumonic plague');
  assert.equal(items[0].trafficN, 200000);
  assert.equal(items[0].news[0].title, 'Russian lab worker dies of suspected plague & 200 watched');
  assert.equal(items[0].news[0].source, 'Al Jazeera');
});

test('radar: the benchmark leads every interest comparison; a refusal from Google is null, never a crash', async () => {
  assert.equal(R.DEFAULT_BENCHMARK.term, 'Nepal flood');
  const refused = await R.compareInterest(['plague'], { fetchFn: async () => ({ ok: false, headers: { getSetCookie: () => [] }, text: async () => '' }) });
  assert.equal(refused, null);
});

test('news explainer: its own plan flag, bible and chapter rules, and web research', () => {
  const plan = S.docuPlan({ durationPreset: 'uzunformat', language: 'en', docuFormat: 'news' });
  assert.equal(plan.news, true);
  assert.ok(!S.docuPlan({ durationPreset: 'uzunformat', language: 'en' }).news);
  const bible = S.newsBibleRules().join('\n');
  assert.match(bible, /doğrulanmamış hiçbir şeyi olgu gibi söyleme/);
  assert.match(bible, /haber görüntüsü ASLA/);
  assert.match(S.newsChapterRules({ i: 0, n: 6 })[0], /SOĞUK AÇILIŞ/);
  assert.match(S.newsChapterRules({ i: 5, n: 6 })[0], /SON BÖLÜM/);
  const research = SC.newsResearchLines({ durationPreset: 'uzunformat' }, 10).join('\n');
  assert.match(research, /web araması/);
  assert.match(research, /DOĞRULANMAMIŞ/);
});

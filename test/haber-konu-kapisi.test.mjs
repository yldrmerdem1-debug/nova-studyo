// HABER KONU KAPISI (27 Ekim 2026, Behind the Headline'ın kendi sayıları): YouTube yeni videoyu birkaç yüz
// kişiye gösterip tıklanmazsa kesiyor. France sokağa çıkma yasağı 3.527 gösterim / 607 izlenme, Panama 7,7
// depremi %4,9 tıklama / 7:11 ortalama — büyüyen ya da süren, İngilizce dünyada dev, açık bir "neden" sorusu
// olan olaylar. Lula'nın dördüncü dönemi ilk gün 92 gösterim: tek seferlik sonuç; "lula wins fourth term"
// aramasında CNN, Bloomberg x3, ABC, France 24, AFP 11-23 saat içinde. El Niño ve Kızıldeniz kabloları
// (soyut, %1,2) 342 gösterimde durdu. Kullanıcı: "France gibi olay yakalamalıyız".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-news-gate-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const R = await import('../src/pipeline/trend-radar.js');
const P = await import('../src/pipeline/docu-package.js');

const FRANCE = { title: 'France Under Curfew: What Really Set Off the Riots?', bigness: 5, confusion: 4, explainerGap: 4, arc: 'escalating', ageHours: 20 };
const PANAMA = { title: "Panama's 7.7 Earthquake: Why Wasn't It Worse?", bigness: 4, confusion: 4, explainerGap: 4, arc: 'unfolding', ageHours: 18 };
const LULA = { title: 'Lula Wins Fourth Term: From 2.3M Behind to 4.4M Ahead', bigness: 4, confusion: 2, explainerGap: 2, arc: 'one-off', ageHours: 14 };
const ELNINO = { title: 'Super El Niño 2026: Is It Really Off the Charts?', bigness: 3, confusion: 3, explainerGap: 3, arc: 'unfolding', ageHours: 30 };

test('France ve Panama kapıdan geçer, Lula ve El Niño geçmez', () => {
  for (const p of [FRANCE, PANAMA]) assert.equal(R.newsGate(p).pass, true, p.title);
  const lula = R.newsGate(LULA);
  assert.equal(lula.pass, false);
  assert.match(lula.fails.join(' | '), /tek seferlik sonuç/);
  assert.match(lula.fails.join(' | '), /açıklama boşluğu 2\/5/);
  assert.match(R.newsGate(ELNINO).fails.join(' | '), /yeterince büyük değil/);
});

test('tek seferlik sonuç ancak herkes kafası karışıkken ve kimse açıklamamışken geçer', () => {
  assert.equal(R.newsGate({ ...LULA, confusion: 4, explainerGap: 4 }).pass, true);
  assert.equal(R.newsGate({ ...LULA, confusion: 4, explainerGap: 3 }).pass, false);
});

test('eski haber ve sönen ilgi kapıda kalır; ölçüm yoksa bu kural atlanır', () => {
  assert.match(R.newsGate({ ...FRANCE, ageHours: 72 }).fails.join(' '), /72 saat önce çıktı/);
  assert.match(R.newsGate({ ...FRANCE, interest: 100, interestLast: 20, rising: false }).fails.join(' '), /ilgi sönüyor/);
  assert.equal(R.newsGate({ ...FRANCE, interest: 100, interestLast: 20, rising: true }).pass, true, 'yeniden yükselen ilgi sönmüş sayılmaz');
  assert.equal(R.newsGate({ ...FRANCE, interest: 100, interestLast: 60, rising: false }).pass, true);
});

test('sıralama: geçenler önce, sonra puan; büyüyen olay sürenin, ölçülen büyüklük ölçülmeyenin önünde', () => {
  const list = R.rankByGate([{ ...LULA }, { ...PANAMA }, { ...FRANCE }, { ...ELNINO }]);
  assert.equal(list[0].title, FRANCE.title);
  assert.equal(list[1].title, PANAMA.title);
  assert.ok(list.slice(2).every((p) => !p.gate.pass));
  const measured = R.rankByGate([{ ...PANAMA, title: 'a?' }, { ...PANAMA, title: 'b?', vsBenchmark: 0.8 }]);
  assert.equal(measured[0].title, 'b?');
});

test('büyüklük YouTube aramasında ölçülebilir (Trends gprop=youtube); varsayılan web araması', async () => {
  const sent = [];
  const fetchFn = async (url) => {
    sent.push(String(url));
    if (url.includes('/api/explore')) return { ok: true, text: async () => `)]}'\n${JSON.stringify({ widgets: [{ id: 'TIMESERIES', token: 't', request: {} }] })}` };
    if (url.includes('/multiline')) return { ok: true, text: async () => `)]}',\n${JSON.stringify({ default: { timelineData: [{ value: [100, 10] }, { value: [40, 20] }, { value: [5, 30] }, { value: [1, 57] }] } })}` };
    return { ok: true, headers: { getSetCookie: () => [] }, text: async () => '' };
  };
  const yt = await R.compareInterest(['pentagon'], { property: 'youtube', fetchFn });
  assert.match(decodeURIComponent(sent.find((u) => u.includes('/api/explore'))), /"property":"youtube"/);
  assert.deepEqual(yt[1], { term: 'pentagon', peak: 57, last: 57, vsBenchmark: 0.57, rising: true });
  sent.length = 0;
  await R.compareInterest(['pentagon'], { fetchFn });
  assert.match(decodeURIComponent(sent.find((u) => u.includes('/api/explore'))), /"property":""/);
});

test('haber başlığı soru sorar; sonuç özeti reddedilir', () => {
  for (const t of [FRANCE.title, PANAMA.title, 'Hormuz: Iran Says Two Tankers Hit Mines. Proof?', 'How Lula Lost Round One and Still Won Brazil']) assert.deepEqual(R.newsTitleErrors(t), [], t);
  for (const t of [LULA.title, "Hitler's Eagle's Nest Survived WWII. Then It Burned"]) assert.match(R.newsTitleErrors(t)[0], /sonucun özeti/, t);
  assert.ok(R.newsGate(LULA).titleErrors.length, 'radar önerisinin başlığı da işaretlenir');
});

test('paket: haber videosunda 5 başlıktan en az 4\'ü soru; geri kalan videolar etkilenmez', () => {
  const thumbs = [
    { hero: 'c1', layout: 'hero', text: 'Brazil Flipped', titleIndex: 0 },
    { hero: 'c2', layout: 'number', number: '4.4M', text: 'Votes', titleIndex: 1 },
    { hero: 'c1', layout: 'document', text: 'Round Two', titleIndex: 2 },
  ];
  const recaps = ['Lula Wins Fourth Term: From 2.3M Behind to 4.4M Ahead', 'Lula Wins Brazil Again: The 2026 Runoff', 'Lula Beats Flávio Bolsonaro by 4.4 Million Votes', 'Lula 2026: How He Turned 2.3M Behind Into a Win', 'Brazil 2026: Why Lula Won the Runoff'];
  const plan = (titles) => ({ titles: titles.map((text) => ({ text, angle: 'x' })), thumbnails: thumbs });
  const e = P.planErrors(plan(recaps), { ids: ['c1', 'c2'], news: true });
  assert.ok(e.some((x) => /en az 4'ü soru sormalı/.test(x) && /Lula Wins Fourth Term/.test(x)), e.join(' | '));
  assert.ok(!P.planErrors(plan(recaps), { ids: ['c1', 'c2'] }).some((x) => /soru sormalı/.test(x)), 'haber değilse kural yok');
  const fixed = ['Lula 2026: How He Turned 2.3M Behind Into a Win', 'Brazil 2026: Why Lula Won the Runoff', 'Brazil Runoff 2026: How Did Lula Flip the Count?', "Goiás 59.66%: Why Flávio's Best State Wasn't Enough", 'Lula Wins Fourth Term: From 2.3M Behind to 4.4M Ahead'];
  assert.ok(!P.planErrors(plan(fixed), { ids: ['c1', 'c2'], news: true }).some((x) => /soru sormalı/.test(x)), 'bir sonuç özeti tolere edilir');
  assert.match(P.newsPackageLines().join('\n'), /Panama's 7\.7 Earthquake: Why Wasn't It Worse\?/);
});

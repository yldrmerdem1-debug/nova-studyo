// 1.16.16 — KAMERA ARKASI YOK (16 Ekim 2026, kanalın 1.16.15 videolarının Studio verisi + transkriptleri): Super El Niño
// anlatıcısı izleyiciye "These figures were not in our original research file. They were flagged for checking before
// broadcast." okudu (ortalama izleme 22,5 sn); Suudi–Husi'de cümlelerin %12'si kaynak atfıydı (patlayanlarda en çok
// %6,6); okunuş: "$109.29" → "$1929", "21 m" metre. Panama (%45 izlenme) temiz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const L = await import('../src/pipeline/growth-lessons.js');
const E = await import('../docu-engine/lib/edit-scorecard.mjs');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const LEAKS = [
  '[firmly] These figures were not in our original research file. They were flagged for checking before broadcast.',
  'The brief also names three kinds of deal: power contracts, nuclear restarts and gas turbines.',
  'The brief for this video names a 2026 Hormuz shock.',
  '[firmly] Our research file could not verify what happened there, or when.',
  'In the public sources we could check, that is not confirmed.',
  '[curious] Which side of Mayyun do the cables pass? Our sources still cannot say.',
];
const CLEAN = [
  "The IMF's own April report had already flagged growing reliance on circular financing.",
  'Later datasets have not confirmed it.',
  'The research shows the cables were cut by a dragging anchor.',
  'He gave a brief statement to reporters.',
  'Saudi Arabia says the strike came from Yemen. The Houthis deny it.',
];

test('kamera arkası: El Niño ve Kızıldeniz satırlarının hepsi yakalanır, dünyayı anlatan satırlar değil', () => {
  assert.equal(L.backstageLines(LEAKS.map((say) => ({ say }))).length, LEAKS.length);
  assert.deepEqual(L.backstageLines(CLEAN.map((say) => ({ say }))), []);
});

test('yeni bölüm denetimi: kamera arkası bölümü geçirmez, okunuş düzeltmesi yalnızca yeni bölümde ve sayaçta değil', () => {
  const src = read('../src/pipeline/docu-script.js');
  assert.ok(src.includes('const backstage = backstageLines(scenes);') && src.includes('anlatım kamera arkasını anlatıyor'));
  assert.ok(src.includes('s.say = spokenFix(s.say)') && src.includes('!["counter", "stat", "bars", "chart", "scale"].includes(s.type)'));
  // denetim yalnızca yeni yazılan bölümde: önbellekteki bölüm (store.chapter) denetlenmez — ödenmiş sesler değişmez
  const call = src.slice(src.indexOf('const callChapter = async'), src.indexOf('// 3) UZATMA'));
  assert.ok(call.includes('let ch = store.chapter(i, bibleKey);') && call.indexOf('spokenFix') < call.indexOf('store.chapter('));
});

test('okunuş: kuruşlu para, kısaltılmış birim ve milyar/milyon yazıyla; büyük ondalıklı para ve tutarlar aynen', () => {
  assert.equal(L.spokenFix('Brent hit $109.29 a barrel.'), 'Brent hit 109 dollars and 29 cents a barrel.');
  assert.equal(L.spokenFix('Gas costs $4.41 a gallon.'), 'Gas costs 4 dollars and 41 cents a gallon.');
  assert.equal(L.spokenFix('The strait is 21 mi wide, the lane 2 mi.'), 'The strait is 21 miles wide, the lane 2 miles.');
  assert.equal(L.spokenFix('A $2bn deal and $300m more.'), 'A $2 billion deal and $300 million more.');
  assert.equal(L.spokenFix('Microsoft spent $44.48 billion.'), 'Microsoft spent $44.48 billion.');
  assert.equal(L.spokenFix('It flew at 500 kph.'), 'It flew at 500 kilometers per hour.');
  assert.equal(L.spokenFix('They paid $1,000 for it.'), 'They paid $1,000 for it.');
});

test('yazar kuralları: kamera arkası yasağı, ölçülü atıf, gündemde kısa tarih; gündem kuralı artık "her iddia atfedilir" demiyor', () => {
  const h = L.honestyLines().join('\n');
  for (const s of ['KAMERA ARKASI YOK', 'research file', 'bölümde en çok 2 kez', 'OKUNUŞ', "'21 miles'"]) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('GÜNDEMDE TARİH'));
  assert.ok(L.honestyLines({ news: true }).join('\n').includes('60-90 saniye'));
  const src = read('../src/pipeline/docu-script.js');
  assert.equal(src.split('...honestyLines({ news: !!plan.news })').length - 1, 2, 'kutsal kitap + her bölüm');
  assert.ok(!src.includes('Her iddia atfedilir'));
  assert.ok(!src.includes('Bu bölümdeki her iddia kaynağıyla'));
  assert.ok(src.includes('en çok BİR emsal, 60-90 sn'));
  assert.ok(!L.voiceGrowthLines({ style: 'news' }).join('\n').includes('her iddianın dayanağı'));
  assert.ok(L.shortHookLines().join('\n').includes('Kamera arkası da yok'));
});

test('karne: kaynak atfı ≤%7 ve kamera arkası 0; Panama temiz, El Niño ve Suudi hedef dışı', () => {
  const mk = (lines) => ({ scenes: lines.map((say) => ({ type: 'photo', say, dur: 4 })) });
  const elnino = E.editScorecard(mk([...LEAKS, ...CLEAN, 'The ocean warmed by more than two degrees in a single season.']));
  assert.ok(elnino.style.backstage >= 6 && elnino.misses.some((m) => /kamera arkasını/.test(m)));
  const saudi = E.editScorecard(mk(['According to Axios, the strike hit at dawn.', 'CNN reported two more launches that night.', 'Reuters reported that talks began in Oman.', 'The airport stayed closed for three days while crews cleared the runway.', 'Riyadh asked Washington for more interceptors and a faster delivery schedule.']));
  assert.ok(saudi.style.attr > E.STYLE_TARGETS.attr && saudi.misses.some((m) => /kaynak atfı/.test(m)));
  const panama = E.editScorecard(mk(['Two months ago, a 7.4 earthquake in Colombia killed more than a hundred people.', 'On Friday, a stronger 7.7 hit Panama, and so far nobody has died.', 'There are three reasons for that: where it struck, when it struck, and how the ground moved.']));
  assert.ok(!panama.misses.some((m) => /kaynak atfı|kamera arkasını/.test(m)), panama.misses.join('; '));
});

test('tarih az ve ilk cümlede tarih yok: Bakker/El Niño hedef dışı, Panama ve akan anlatım temiz; "we may" tarih sayılmaz', () => {
  const mk = (lines, dur = 4) => ({ scenes: lines.map((say) => ({ type: 'photo', say, dur })) });
  const bakker = E.editScorecard(mk(['October fifth, 1989. In Charlotte, North Carolina, a jury reads its verdict.', 'He was born in 1940 in Muskegon.', 'In 1961 he married Tammy Faye.', 'In 1966 he joined Pat Robertson.', 'In 1973 he co-founded a network.', 'In 1974 he started PTL.']));
  assert.ok(bakker.style.firstDate && bakker.style.dpm > E.STYLE_TARGETS.dpm);
  assert.ok(bakker.misses.some((m) => /ilk cümle tarihle/.test(m)) && bakker.misses.some((m) => /tarih \(hedef/.test(m)));
  const panama = E.editScorecard(mk(['Two months ago, a magnitude 7.4 earthquake in Colombia killed more than a hundred people.', 'On Friday, a stronger 7.7 hit Panama, and so far nobody has died.', 'There are three reasons for that: where it struck, when it struck, and how the ground moved.']));
  assert.ok(!panama.style.firstDate && !panama.misses.some((m) => /tarih/.test(m)), panama.misses.join('; '));
  const saudi = E.narrationStyle([{ say: 'In October, he said we may.' }, { say: 'Riyadh asked for more interceptors, and the pumps kept burning through the night.' }], 1);
  assert.equal(saudi.dpm, 1, '"October" sayılır, "we may" sayılmaz');
});

test('yazar: ilk cümlede tarih yok, biyografi dökümü yok, tarih az, bilinmeyen = gizem, tarihte dramatik kesinlik; gündem "saat saat" demiyor', () => {
  const hook = L.hookGrowthLines().join('\n');
  assert.ok(hook.includes('İLK CÜMLEDE TARİH YOK') && hook.includes('BİYOGRAFİ VE ARKA PLAN DÖKÜMÜ YOK') && hook.includes('30. saniyeden önce'));
  const h = L.honestyLines().join('\n');
  assert.ok(h.includes('TARİH AZ, BAĞLAÇ ÇOK') && h.includes('BİLİNMEYEN = GİZEM') && h.includes('quarantine two hundred people'));
  const story = L.voiceGrowthLines({ style: 'story' }).join('\n');
  assert.ok(story.includes('DRAMATİK KESİNLİK') && story.includes('videoda en çok BİR kez'));
  assert.ok(!L.voiceGrowthLines({ style: 'news' }).join('\n').includes('DRAMATİK KESİNLİK'));
  const src = read('../src/pipeline/docu-script.js');
  assert.ok(!src.includes('2) ne oldu, saat saat;') && src.includes('takvim yaprağı çevirme'));
});

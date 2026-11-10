// SEO SAYI DENETİMİ YAZIYLA YAZILAN SAYIYI DA GÖRÜR.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 2009 denizaltı çarpışması 20261024-373aaf, 05:48:39-05:49:03): iki onarım turundan
// sonra "SEO tamamlanamadı: JSON yanıtı 3 denemede doğrulanamadı … Başlık/kapak sayısı senaryoda yok: 12" ve SEO
// {incomplete:true} ile kaldı. Senaryo "Twelve days separated the impact from Britain's first word." diyor; 12
// destekli. Denetim yalnızca rakamları sayıyordu (senaryodaki rakamlar: 3, 4, 2009, 45, 5, 4,000, 7,400, …), anlatım
// ise sayıyı seslendirme için yazıyla yazar. Aynı ret 15 iş günlüğünde (40, 3, 2, 12, 1, 8, 5, 10, 11 …).
//
// DÜZELTME (engagement.js spelledNumbers): İngilizce sayı sözcükleri değere çevrilir ("thirty-two" → 32,
// "fifty million" → 50000000 ve 50), binlik ayırıcı karşılaştırmada düşer ("4,000" = "4000"). Senaryoda olmayan
// sayı eskisi gibi reddedilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-seo-sayi-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const { validateSeoGrounding, publicationAudit, spelledNumbers } = await import('../src/pipeline/engagement.js');

// 373aaf script.json'dan, olduğu gibi (bölüm 0 sahne 8, bölüm 4 sahne 13, bölüm 1 sahne 10, bölüm 5 sahne 13).
const SCRIPT = {
  sections: [
    { title: 'Two Hulls', segments: [{ text: 'Between them, those two hulls carried thirty-two ballistic missiles.' }] },
    { title: 'Range', segments: [{ text: 'A Trident can fly about 4,000 nautical miles, roughly 7,400 kilometres.' }] },
    { title: 'Silence', segments: [{ text: "Twelve days separated the impact from Britain's first word." }] },
    { title: 'Cost', segments: [{ text: 'Then the Daily Telegraph reported a repair estimate for both boats: up to fifty million pounds.' }] },
  ],
};
const quote = (titleIndex, segId, text) => ({ titleIndex, segId, quote: text });
const numberErrors = (seo) => validateSeoGrounding(seo, SCRIPT).filter((e) => e.includes('sayısı'));

test('spelled-out numbers in the narration support the same digits in titles (the 373aaf rejection)', () => {
  const seo = {
    titles: ['12 Days of Silence', '32 Missiles, One Ocean'],
    thumbnailText: '12 DAYS',
    evidence: [quote(0, 's2g0', "Twelve days separated the impact from Britain's first word."), quote(1, 's0g0', 'those two hulls carried thirty-two ballistic missiles.')],
  };
  assert.deepEqual(validateSeoGrounding(seo, SCRIPT), []);
});

test('a number the script never says is still rejected, spelled or not', () => {
  const seo = { titles: ['13 Days of Silence'], thumbnailText: '', evidence: [quote(0, 's2g0', "Twelve days separated the impact from Britain's first word.")] };
  assert.deepEqual(numberErrors(seo), ['Başlık/kapak sayısı senaryoda yok: 13']);
  assert.deepEqual(numberErrors({ ...seo, titles: ['A Repair Bill of 60 Million'] }), ['Başlık/kapak sayısı senaryoda yok: 60']);
  assert.ok(publicationAudit(SCRIPT, { ...seo, pinnedComment: 'Which detail surprised you?' }).warnings.some((w) => w.code === 'unsupported-number'));
});

test('scale words: "fifty million" supports both "$50 Million" and "50,000,000"', () => {
  const ev = [quote(0, 's3g0', 'up to fifty million pounds.')];
  assert.deepEqual(numberErrors({ titles: ['The $50 Million Repair Bill'], evidence: ev }), []);
  assert.deepEqual(numberErrors({ titles: ['A 50,000,000 Pound Collision'], evidence: ev }), []);
});

test('thousands separators compare as the same number, decimals stay exact', () => {
  const ev = [quote(0, 's1g0', 'A Trident can fly about 4,000 nautical miles')];
  assert.deepEqual(numberErrors({ titles: ['4000 Miles of Silence'], evidence: ev }), []);
  assert.deepEqual(numberErrors({ titles: ['7,400 Kilometres Away'], evidence: ev }), []);
  assert.deepEqual(numberErrors({ titles: ['4.5 Miles Away'], evidence: ev }), ['Başlık/kapak sayısı senaryoda yok: 4.5']);
});

test('number words become values without inventing sums or matching inside other words', () => {
  assert.deepEqual(spelledNumbers('Twelve days'), [12]);
  assert.deepEqual(spelledNumbers('thirty-two missiles'), [32]);
  assert.deepEqual(spelledNumbers('one hundred and twelve men'), [112]);
  assert.deepEqual(spelledNumbers('two hundred thousand'), [200, 200000]);
  assert.deepEqual(spelledNumbers('a hundred years'), [100]);
  // İki ayrı sayı toplanmaz: "two three" 5 değil, "nineteen fifty-six" 75 değil.
  assert.deepEqual(spelledNumbers('two three'), [2, 3]);
  assert.deepEqual(spelledNumbers('nineteen fifty-six'), [19, 56]);
  assert.deepEqual(spelledNumbers('Often the tone in Tennessee was none of it.'), []);
});

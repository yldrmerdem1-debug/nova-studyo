// Ranking (countdown) category: plan, structure rules, rank cards, per-item era, package.
import test from 'node:test';
import assert from 'node:assert/strict';

test('ranking plan: intro + N items from N to 1, number one the longest, words add up', async () => {
  const S = await import('../src/pipeline/docu-script.js');
  assert.equal(S.rankingItems(5), 5);
  assert.equal(S.rankingItems(8), 7);
  assert.equal(S.rankingItems(12), 10);
  const p = S.docuPlan({ durationPreset: 'detayli', language: 'en', docuFormat: 'ranking' });
  assert.equal(p.ranking, true);
  assert.equal(p.items, 10);
  assert.equal(p.chapters, 11);
  assert.equal(p.chapterWords.length, 11);
  const [intro, ...items] = p.chapterWords;
  assert.ok(intro < items[0], 'the intro is short');
  assert.ok(items.at(-1) > items[0] * 1.4, 'number one is the longest');
  assert.ok(Math.abs(p.chapterWords.reduce((a, b) => a + b, 0) - p.words) <= 11, 'nothing lost to rounding');
  const plain = S.docuPlan({ durationPreset: 'detayli', language: 'en' });
  assert.equal(plain.ranking, undefined);
  // 22 Ekim 2026 açılış bütçesi (openingBudget): soğuk açılış ~55 sn; geri kalan bölümler eşit (yuvarlama ±1), toplam aynı.
  const [opening, ...rest] = plain.chapterWords;
  assert.equal(opening, S.OPENING_WORDS, 'the opening chapter gets the ~55 s budget');
  assert.ok(opening < plain.wordsPerChapter, 'the opening is shorter than an even share');
  assert.ok(Math.max(...rest) - Math.min(...rest) <= 1, `a documentary keeps the other chapters equal: ${rest.join(', ')}`);
  assert.ok(Math.abs(plain.chapterWords.reduce((a, b) => a + b, 0) - plain.words) <= plain.chapters, 'nothing lost to the move');
});

test('ranking bible: ranks forced to intro 0 then N..1; rules promise number one without revealing it', async () => {
  const S = await import('../src/pipeline/docu-script.js');
  const plan = S.docuPlan({ durationPreset: 'standart', language: 'en', docuFormat: 'ranking' });
  const b = { chapters: Array.from({ length: plan.chapters }, (_, i) => ({ rank: 99, year: 1900 + i })) };
  S.fixRanking(b, plan);
  assert.deepEqual(b.chapters.map((c) => c.rank), [0, 7, 6, 5, 4, 3, 2, 1]);
  assert.equal(b.chapters[0].year, 0);
  const rules = S.rankingBibleRules(plan).join('\n');
  assert.match(rules, /#1 ASLA açıklanmaz/);
  assert.match(rules, /criterion/);
  const bible = { criterion: 'by how little we still know', chapters: b.chapters.map((c, i) => ({ ...c, item: `Item ${i}`, whyHere: 'w' })) };
  assert.match(S.rankingChapterRules({ i: 0, n: 8, ch: bible.chapters[0], bible }).join(' '), /how little we still know/);
  assert.match(S.rankingChapterRules({ i: 3, n: 8, ch: bible.chapters[3], bible }).join(' '), /KÖPRÜ.*#4/);
  assert.match(S.rankingChapterRules({ i: 7, n: 8, ch: bible.chapters[7], bible }).join(' '), /BİR NUMARA/);
});

test('rank cards: the engine opens every item on its card (number one longer); a documentary keeps chapter cards', async () => {
  const { insertChapterCards } = await import('../docu-engine/lib/produce.mjs');
  const sc = (chapter) => ({ type: 'photo', chapter, dur: 4, image: `c${chapter}.jpg`, say: 'x' });
  const ranked = {
    locale: 'en-US', format: 'ranking', chapters: ['Intro', '#3 Alpha', '#2 Beta', '#1 Gamma'],
    ranking: { total: 3, items: [{ chapter: 1, rank: 3, item: 'Alpha', place: 'Here', year: 1959 }, { chapter: 2, rank: 2, item: 'Beta', place: '', year: -480 }, { chapter: 3, rank: 1, item: 'Gamma', place: 'There', year: 1912 }] },
    scenes: [sc(0), sc(1), sc(1), sc(2), sc(3)],
  };
  assert.equal(insertChapterCards(ranked), 3);
  const cards = ranked.scenes.filter((s) => s.chapterCard);
  assert.deepEqual(cards.map((c) => c.rankCard.rank), [3, 2, 1]);
  assert.equal(cards[0].rankCard.item, 'Alpha');
  assert.equal(cards[0].rankCard.total, 3);
  assert.equal(cards[0].image, 'c1.jpg', "the card shows the item's own picture");
  assert.ok(cards[2].dur > cards[0].dur, 'number one gets more time');
  const plain = { locale: 'en-US', chapters: ['A', 'B'], scenes: [sc(0), sc(1)] };
  insertChapterCards(plain);
  assert.equal(plain.scenes.find((s) => s.chapterCard).rankCard, undefined);
});

test('ranking package: the count in the titles, number one sold but never named', async () => {
  const P = await import('../src/pipeline/docu-package.js');
  const lines = P.rankingPackageLines({ ranking: { total: 10, criterion: 'c', items: [{ rank: 1, item: 'The Dyatlov Pass' }] } }).join('\n');
  assert.match(lines, /10 …/);
  assert.match(lines, /Never reveal number one in a title/);
  assert.match(lines, /"#1"/);
});

test('ranking research asks for a pool larger than the list, with where/when for each candidate', async () => {
  const R = await import('../src/pipeline/script.js');
  const lines = R.docuResearchLines({ durationPreset: 'detayli', language: 'en', docuFormat: 'ranking', topic: 't' }).join('\n');
  assert.match(lines, /EN AZ 16 aday/);
  assert.match(lines, /YER, KESİN TARİH/);
  assert.match(lines, /SIRALAMA ÖLÇÜTÜ/);
});

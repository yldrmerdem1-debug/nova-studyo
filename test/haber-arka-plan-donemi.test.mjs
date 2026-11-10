// HABERDE YILSIZ SATIR BUGÜNDÜR — tarihî yılı yalnızca planın arka plan bölümü miras alır.
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730, haber formatı): docu/engine-script.json
// 7. bölümün (indeks 6) yılsız satırlarına era=1952 verdi, çünkü bölüm 1945/1952'yi anıyordu. Sahne 116 "The history
// itself was told elsewhere." Dokumentation Obersalzberg'i (1999'da açıldı) arıyordu; docu-era-fixes.json scenes.116
// merkezin doğru fotoğrafını "modern glass and metal visitor building" diye reddetti. Sahne 122 ("Nobody has said what
// survived", 2026 satırı) modern bilgi panolu fotoğrafı reddetti; log 01:36:50 asansör adayını "1952 dönemine uymuyor"
// diye attı. Plan editörü (docu-plan-review.json) yalnızca plan bölümü 5'i (= sahne bölümü 4) arka plan işaretlemişti.
// Artık sceneEras planın arka plan bölümlerini (backgroundChapters, docu-bible.json) alır. Ağ, ffmpeg, model YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-arka-plan-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const A = await import('../src/pipeline/docu-archive.js');

// Kartal senaryosundan (docu-script.json) kısaltılmış: 4 = arka plan (1937-1939), 6 = 1952'ye dönen bugünkü bölüm.
const scenes = [
  { chapter: 0, type: 'photo', say: 'On Friday night, 23 October 2026, the Eagle\'s Nest burned.' },
  { chapter: 0, type: 'photo', say: 'By Saturday it was almost gone.' },
  { chapter: 4, type: 'photo', say: 'Its car was lined with polished brass, and it rose straight into the house.', search: 'Kehlsteinhaus brass elevator interior' },
  { chapter: 4, type: 'photo', say: 'Martin Bormann ordered it in the summer of 1937, and the Nazi party paid for it.' },
  { chapter: 4, type: 'words', say: 'The deadline was Hitler\'s 50th birthday, 20 April 1939.' },
  { chapter: 4, type: 'photo', say: 'Which is why the road had to come first.', search: 'Kehlsteinstrasse mountain road Berchtesgaden' },
  { chapter: 4, type: 'photo', say: 'The house on top was finished in just 13 months.', search: 'Kehlstein construction 1938 workers Obersalzberg' },
  { chapter: 6, type: 'photo', say: 'The house that burned on Friday had been open to the public since 1952.' },
  { chapter: 6, type: 'words', say: 'The Kehlsteinhaus was spared from Allied bombing in 1945.' },
  { chapter: 6, type: 'counter', to: 1952, say: 'Then, in 1952, the Kehlstein opened to the public.' },
  { chapter: 6, type: 'photo', say: 'The history itself was told elsewhere.', search: 'Dokumentation Obersalzberg building Berchtesgaden' },
  { chapter: 6, type: 'photo', say: 'Inside that ruin were the brass elevator and the marble fireplace. Nobody has said what survived.', search: 'Kehlsteinhaus brass elevator interior' },
  { chapter: 6, type: 'photo', say: 'Any rebuilding would mean putting a Nazi-era building back on that peak on purpose.' },
];
const eraOf = (r, say) => r.scenes.find((s) => s.say.startsWith(say)).era;

test('haber: yılsız satır arka plan dışındaki bölümde bugündür, arka plan bölümünde tarihî yılını alır (Kartal 116, 122)', () => {
  const r = A.sceneEras({ scenes }, { news: true, now: 2026, background: [4] });
  assert.equal(eraOf(r, 'The history itself was told elsewhere.'), '2026', 'Dokumentation Obersalzberg 1999\'da açıldı: 1952 değil');
  assert.equal(eraOf(r, 'Inside that ruin'), '2026', '"Nobody has said what survived" bugünün satırı');
  assert.equal(eraOf(r, 'Any rebuilding'), '2026');
  // Rakamla yıl taşıyan satır her yerde kendi yılını alır.
  assert.equal(eraOf(r, 'Then, in 1952'), '1952');
  assert.equal(eraOf(r, 'The Kehlsteinhaus was spared'), '1945');
  assert.equal(eraOf(r, 'The house that burned on Friday'), '1952');
  // Arka plan bölümünün yılsız satırları bölümün dönemini alır (asansör 1938'in asansörü).
  assert.equal(eraOf(r, 'Its car was lined with polished brass'), '1938');
  assert.equal(eraOf(r, 'Which is why the road'), '1938');
  assert.equal(eraOf(r, 'Martin Bormann'), '1937');
  assert.equal(eraOf(r, 'By Saturday'), '2026');
});

test('arka plan bilinmiyorsa (eski iş, hazır senaryo, haber dışı) davranış eskisi gibi', () => {
  const eski = A.sceneEras({ scenes }, { news: true, now: 2026 });
  assert.equal(eraOf(eski, 'The history itself was told elsewhere.'), '1952', 'plan bilgisi yokken bölüm dönemi (eski davranış)');
  assert.deepEqual(A.sceneEras({ scenes }, { news: true, now: 2026, background: null }).scenes.map((s) => s.era), eski.scenes.map((s) => s.era));
  // Haber değilse arka plan listesi yok sayılır: yüzyıllara yayılan hikâye bölüm dönemiyle yargılanır.
  const genis = [{ chapter: 0, say: 'Caffa.', search: 'siege of Caffa 1346' }, { chapter: 0, say: 'The ships came.' }, { chapter: 1, say: 'This October a technician died in 2026.' }];
  assert.deepEqual(A.sceneEras({ scenes: genis }, { now: 2026, background: [] }).scenes.map((s) => s.era), ['1346', '1346', '2026']);
  // Elle verilmiş era ve senaryonun kendi era'sı dokunulmaz.
  const elle = [{ chapter: 6, say: 'The history itself was told elsewhere.', era: '1999' }];
  assert.equal(A.sceneEras({ scenes: elle }, { news: true, now: 2026, background: [4] }).scenes[0].era, '1999');
  // Arka plan bölümünde hiç yıl yoksa o bölüm de bugündür (boş dönem yazılmaz).
  assert.equal(A.sceneEras({ scenes: [{ chapter: 2, say: 'Long before.' }] }, { news: true, now: 2026, background: [2] }).scenes[0].era, '2026');
});

test('backgroundChapters: haber planının arka plan bölümleri; plan senaryoya uymuyorsa ya da haber planı değilse null', () => {
  // Kartal docu-bible.json: 8 bölüm, yalnızca 5. (indeks 4) background:true (plan editörü "chapter 5 background true").
  const bible = { chapters: Array.from({ length: 8 }, (_, i) => ({ title: `B${i}`, background: i === 4 })) };
  assert.deepEqual(A.backgroundChapters(bible, { chapters: bible.chapters.map((c) => c.title) }), [4]);
  assert.deepEqual(A.backgroundChapters({ chapters: [{ background: false }, { background: false }] }), [], 'arka plansız haber planı: hepsi bugün');
  assert.equal(A.backgroundChapters({ chapters: [{ title: 'a' }, { title: 'b' }] }), null, 'haber dışı plan: alan yok');
  assert.equal(A.backgroundChapters(bible, { chapters: ['a', 'b'] }), null, 'bölüm sayısı uymayan (eski) plan');
  assert.equal(A.backgroundChapters(null), null);
});

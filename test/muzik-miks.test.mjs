// MÜZİK ANLATICININ ALTINDA KALMALI, DUYGUYU TAŞIMALI; CİDDİ SATIRDA HİÇBİR "TRAILER" SESİ ÇALMAMALI.
//
// Kullanıcı (27 Ekim 2026): "Ciddi konularda saçma bir şey çalmamalı, müzik izleyiciye duyguyu hissettirmeli,
// ses mükemmel olmalı."
// ÖLÇÜLEN KUSURLAR (27 Ekim 2026, ses denetimi; Çernobil 20261026-24122a, Fransa 20261020-37f9d2, Kartal Yuvası
// 20261024-950730, Lula 20261026-29db03):
//   - Yatak anlatımın yalnız ~13,5 dB altındaydı (kural >= 18 dB): her duyguda aynı 0.28 (-11 dB) ördek.
//   - 1,2 sn'lik her duraklamada yatak tam 11 dB yükseliyordu (Çernobil 7, Fransa 9 kez; kural +5 dB).
//   - "The work killed twelve" (hüzün) üstüne vuruş 1.0 + müzik 0,1 sn'de geri; ölüm bilançosuna karartma vuruşu.
//   - Her bölüm kartı yükseltici + vuruş; Çernobil'de 12 yükseltici, 7'si bir öncekine 60 sn'den yakın.
//   - Filmin sonu iki kez kısılıyordu (zarf + renderScore); master seviyesi kodlamadan sonra düzeltilmiyordu.
// DÜZELTME: docu-engine/src/timeline.js (duygu başına ördek, 2 sn birleştirme, kısa duraklamada en çok +5 dB,
// müzik pencereleri, alıntı/yas dalışı, ağır satırda efekt ölçülülüğü, yükseltici aralığı/tavanı, vuruştan sonra
// 1,5 sn müzik yok, tek son kısma) ve docu-engine/lib/produce.mjs (master düzeltmesi, otobüs kompresörü,
// kanal başına müzik geçmişi). Ağ, ffmpeg, render yok.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TL = await import('../docu-engine/src/timeline.js');
const P = await import('../docu-engine/lib/produce.mjs');

const fps = 30;
const base = 0.55;
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const dB = (x) => 20 * Math.log10(x);
/** A narrated scene: voice from its first frame. */
const line = (o = {}) => ({ type: 'photo', mood: 'curious', chapter: 0, say: 'A line.', voice: 'v.wav', voiceDur: 3, dur: 3.4, ...o });
/** Placed slots from scene lengths in seconds (no beats), like placeTimeline. */
const place = (scenes) => TL.placeTimeline(scenes, fps, []);
const envOf = (scenes, o = {}) => TL.musicEnvelope({ placed: place(scenes), scenes, fps, base, ...o });
const maxIn = (env, a, b) => Math.max(...env.slice(a, b));
const sfxOf = (scenes, { genre = 'documentary', marks, transitions } = {}) =>
  TL.planSfx({ placed: place(scenes).map((p, i) => ({ ...p, transition: transitions?.[i] ?? scenes[i].transition ?? 'cut' })), scenes, fps, genre, marks: marks ?? scenes.map(() => ({})) });

/* ================================================================ ducking */

test('ördek duyguya göre: hüzün/sakin 0.14, merak 0.17, gerilim/korku 0.2, ifşa/zafer 0.22; yatak sesin ~15-19 dB altında', () => {
  assert.deepEqual(TL.DUCK_BY_MOOD, { sad: 0.14, calm: 0.14, curious: 0.17, tension: 0.2, dread: 0.2, reveal: 0.22, triumph: 0.22 });
  assert.equal(TL.MIX.duck, 0.17, 'bilinmeyen duygu: merak derinliği');
  for (const [mood, d] of Object.entries(TL.DUCK_BY_MOOD)) {
    const env = envOf([line({ mood, voiceDur: 9.5, dur: 10 })]);
    assert.ok(near(env[150], base * d, 1e-6), `${mood}: ${env[150]} vs ${base * d}`);
  }
  const plain = envOf([line({ mood: undefined, voiceDur: 9.5, dur: 10 })]);
  assert.ok(near(plain[150], base * 0.17, 1e-6));
  // Puan -16 LUFS, anlatım -19 LUFS: yatak - ses = -16 + 20·log10(taban·ördek) + 19.
  const under = (d) => -16 + dB(base * d) + 19;
  assert.ok(under(TL.DUCK_BY_MOOD.curious) <= -17.5, `merak ${under(0.17).toFixed(1)} dB`);
  assert.ok(under(TL.DUCK_BY_MOOD.sad) <= -19, `hüzün ${under(0.14).toFixed(1)} dB`);
  for (const d of Object.values(TL.DUCK_BY_MOOD)) assert.ok(under(d) <= -15, `her duygu eski 0.28'den (-13.3 dB) en az 2 dB derin: ${under(d).toFixed(1)}`);
  // Bir pasajın içinde duygu değişince derinlik basamak değil, ~0.7 sn'de kayar.
  const env = envOf([line({ mood: 'sad', voiceDur: 5, dur: 5.3 }), line({ mood: 'reveal', voiceDur: 5, dur: 5.4 })]);
  const cut = Math.round(5.3 * fps);
  for (let f = cut - 15; f < cut + 15; f++) assert.ok(Math.abs(dB(env[f + 1] / env[f])) < 0.5, `kayma ${f}: ${dB(env[f + 1] / env[f]).toFixed(2)} dB/kare`);
});

test('2 sn altındaki aralık tek pasaj: yatak nefeste hiç kalkmıyor', () => {
  assert.equal(TL.MIX.mergeGap, 60);
  // 1.9 sn'lik boşluk (57 kare)
  const env = envOf([line({ voiceDur: 3.5, dur: 5.4 }), line({ voiceDur: 3, dur: 3.4 })]);
  const a = Math.round(3.5 * fps);
  const b = Math.round(5.4 * fps);
  assert.ok(maxIn(env, a, b) <= base * 0.17 + 1e-6, `boşlukta en çok ${maxIn(env, a, b)}`);
});

test('4 sn altı duraklama en çok +5 dB (ördek x1.78), ~25 karede, tam açılma yok', () => {
  for (const mood of ['curious', 'sad', 'reveal']) {
    // 2.5 sn'lik boşluk (75 kare)
    const scenes = [line({ mood, voiceDur: 3.5, dur: 6 }), line({ mood, voiceDur: 3.5, dur: 3.9 })];
    const env = envOf(scenes);
    const d = TL.DUCK_BY_MOOD[mood];
    const a = Math.round(3.5 * fps);
    const b = Math.round(6 * fps);
    const cap = base * d * 1.78;
    assert.ok(maxIn(env, a, b) <= cap + 1e-6, `${mood}: ${maxIn(env, a, b)} > ${cap}`);
    assert.ok(dB(maxIn(env, a, b) / (base * d)) <= 5.01, '+5 dB tavanı');
    assert.ok(env[a + 25] >= cap * 0.99, `${mood}: tavana 25 karede (${env[a + 25]} / ${cap})`);
    assert.ok(env[a + 10] < cap * 0.9, 'sıçramıyor, yükseliyor');
    assert.ok(env[b] <= base * d * 1.0001, 'sonraki ilk kelimede yine ördekte');
    const { pauses } = TL.bedCurve({ placed: place(scenes), scenes, fps });
    assert.equal(pauses[0].open, false);
  }
});

test('4 sn ve üstü duraklama, bölüm kartı ve kapanış tam açılır (30-36 karede)', () => {
  // 4.5 sn'lik boşluk
  let env = envOf([line({ voiceDur: 3.5, dur: 8 }), line({ voiceDur: 3, dur: 3.4 })]);
  let a = Math.round(3.5 * fps);
  assert.ok(env[a + 15] < base * 0.9, 'bir anda değil');
  assert.ok(near(env[a + 36], base), `36 karede tam (${env[a + 36]})`);
  assert.ok(env[Math.round(8 * fps)] <= base * 0.17 * 1.0001, 'ilk kelimede ördekte');
  // Bölüm kartı 3.2 sn'lik bir boşlukta: kart açar.
  const scenes = [line({ voiceDur: 3, dur: 3.4 }), { type: 'title', chapterCard: true, title: 'II', chapter: 1, dur: 2.8, mood: 'tension' }, line({ chapter: 1, mood: 'tension' })];
  env = envOf(scenes);
  a = Math.round(3 * fps);
  assert.ok(near(maxIn(env, a, Math.round(6.2 * fps)), base), 'kartta tam açık');
  // Kapanış: son satırdan sonra yatak tam açık kalır, kendi kısması yok (tek kısma renderScore'da).
  env = envOf([line({ voiceDur: 3, dur: 8 })]);
  assert.ok(near(env[env.length - 1], base), `son karede ${env[env.length - 1]}: zarfta ikinci kısma yok`);
  // Kütüphane puanında zarf kısmaz (endFade varsayılan kapalı); yalnız bestelenmiş puanda Engine açar (aşağıdaki test).
});

test('müzik penceresi: duygusal doruk satırından sonra 3 sn+ duraklama tam açılır, ~90 sn\'de bir', () => {
  const pause = 3.3; // 99 kare: 4 sn kuralına göre kısa
  const peak = (o) => line({ mood: 'reveal', voiceDur: 3, dur: 3 + pause, ...o });
  const fill = (s) => line({ voiceDur: s, dur: s + 0.4 });
  const scenes = [peak(), fill(25), peak(), fill(60), fill(10), peak(), fill(5)];
  const placed = place(scenes);
  const { pauses } = TL.bedCurve({ placed, scenes, fps });
  const env = envOf(scenes);
  const shorts = pauses.filter((p) => !(p.b === env.length));
  assert.equal(shorts.length, 3, JSON.stringify(pauses));
  assert.deepEqual(shorts.map((p) => p.window), [true, false, true], 'ikincisi 30 sn sonra: bütçe dışı; üçüncüsü 90 sn sonra');
  assert.ok(near(maxIn(env, shorts[0].a, shorts[0].b), base), 'pencere tam açık');
  assert.ok(maxIn(env, shorts[1].a, shorts[1].b) <= base * 0.22 * 1.78 + 1e-6, 'bütçe dışı duraklama +5 dB tavanında');
  // Doruk olmayan satır (merak, enerji 3) aynı duraklamada açılmaz.
  const calmScenes = [line({ voiceDur: 3, dur: 3 + pause }), fill(5)];
  assert.equal(TL.bedCurve({ placed: place(calmScenes), scenes: calmScenes, fps }).pauses[0].window, false);
  // Enerji 5 ya da bölümün son satırı da doruktur.
  const e5 = [line({ voiceDur: 3, dur: 3 + pause, energy: 5 }), fill(5)];
  assert.equal(TL.bedCurve({ placed: place(e5), scenes: e5, fps }).pauses[0].window, true);
  const lastOfChapter = [line({ voiceDur: 3, dur: 3 + pause }), line({ chapter: 1 })];
  assert.equal(TL.bedCurve({ placed: place(lastOfChapter), scenes: lastOfChapter, fps }).pauses[0].window, true);
});

/* ======================================================= quotes and grief */

test('yas cümlesi: kelimeler gerçek ölüm söylüyor; sıfır/olumsuz bilanço yas değil', () => {
  assert.equal(TL.griefText('But the speed had a price. The work killed twelve.'), true);
  assert.equal(TL.griefText('[serious] Thirty deaths, and none of them were the men from the basement.'), true);
  assert.equal(TL.griefText('Afterwards, the Prime Minister said: no one was killed, and that is a miracle.'), false);
  assert.equal(TL.griefText('Nobody died that night. Two days later, thirty died.'), true, 'cümle cümle bakılır');
  assert.equal(TL.griefText('Three men lost their lives; two never came home.'), true);
  assert.equal(TL.griefText('The searchlight picked out one pipe among the rest.'), false);
  assert.equal(TL.isGrief({ say: 'He signed the papers.', grief: true }), true, 'boru hattının işareti');
  assert.equal(TL.isGrief({ say: 'The merger killed the deal.', grief: false }), false, 'açık false kelimeyi ezer');
});

test('alıntı ve yas satırı: ilk kelimeden 10 kare önce yas 0.14 / alıntı 0.12 düzeyine iner, 36 karede geri; duygusal alıntıda müzik durur', () => {
  const words = (t0) => [{ word: '[serious]', t: 0 }, { word: 'But', t: t0 }, { word: 'twelve.', t: 3 }];
  const scenes = [
    line({ mood: 'dread', voiceDur: 3, dur: 3.4 }),
    line({ mood: 'dread', voiceDur: 3.5, dur: 3.9, say: '[serious] But the speed had a price. The work killed twelve.', wordTimes: words(0.3) }),
    line({ mood: 'dread', voiceDur: 6, dur: 6.4 }),
  ];
  const placed = place(scenes);
  const env = envOf(scenes);
  const w0 = placed[1].from + 9;
  const end = placed[1].from + Math.round(3.5 * fps);
  const d = base * 0.2;
  const g = base * TL.MIX.griefDuck;
  assert.equal(TL.MIX.griefDuck, 0.14);
  assert.equal(TL.MIX.quoteDuck, 0.12);
  assert.ok(near(env[w0 - 11], d), `dalış ilk kelimeden 10 kare önce başlar (${env[w0 - 11]})`);
  assert.ok(near(env[w0], g), `ilk kelimede yas düzeyi (${env[w0]} vs ${g})`);
  for (let f = w0; f < end; f++) assert.ok(env[f] <= g + 1e-6, `satır boyunca alçak (${f})`);
  assert.ok(env[end + 18] > g && env[end + 18] < d, 'yavaş dönüyor');
  assert.ok(near(env[end + 36], d), `36 karede geri (${env[end + 36]})`);

  // "no one was killed" yas değil: dalış yok.
  const neg = [line({ mood: 'dread', voiceDur: 4, dur: 4.4, say: 'Afterwards, the Prime Minister said: no one was killed, and that is a miracle.' })];
  assert.ok(near(envOf(neg)[60], d), 'olumsuz bilanço: düz ördek');

  // Zaten hüzün ördeğindeki yas satırı bir daha dalmaz (27 Ekim 2026: x0.4 + seçicinin -3 dB'i ölüm satırını ~31 dB gömdü).
  const sadLine = [line({ mood: 'sad', voiceDur: 4, dur: 4.4, say: 'Borys Baranov died of a heart attack.' })];
  assert.ok(near(envOf(sadLine)[60], base * 0.14), 'hüzünlü yas satırı: düz hüzün ördeği');

  // Alıntı (gerilim): 0.12 düzeyi. Duygusal alıntı (hüzün ya da ifşa, enerji <= 2): müzik yok, oda sesi kalır.
  const q = (o) => [line({ voiceDur: 3, dur: 3.4 }), line({ type: 'quote', quote: 'I was ordered to go there, so I went.', who: 'Ananenko', voiceDur: 4, dur: 4.4, ...o }), line({ voiceDur: 5, dur: 5.4 })];
  const mid = (scenes) => place(scenes)[1].from + 60;
  let s = q({ mood: 'tension', energy: 4 });
  assert.ok(near(envOf(s)[mid(s)], base * 0.12), 'alıntı 0.12 düzeyinde');
  s = q({ mood: 'reveal', energy: 1, say: '"I\'m no hero."' });
  assert.equal(envOf(s)[mid(s)], 0, 'duygusal alıntıda müzik durur');
  s = q({ mood: 'sad', energy: 2 });
  assert.equal(envOf(s)[mid(s)], 0);
  s = q({ mood: 'reveal' }); // enerji yok = 3
  assert.ok(envOf(s)[mid(s)] > 0, 'enerjisi 3 olan ifşa alıntısı yalnız dalar');
  const amb = TL.ambienceEnvelope({ placed: place(q({ mood: 'sad', energy: 2 })), scenes: q({ mood: 'sad', energy: 2 }), fps });
  assert.ok(amb[mid(s)] > 0.5, 'ortam yatağı alıntıda da çalar');
});

/* ================================================================== hits */

test('vuruştan sonra müzik 1,5 sn yok, sonra 1,5 sn\'de döner; kart ve karartma vuruşları da (sfx)', () => {
  const scenes = [
    line({ mood: 'tension', voiceDur: 3, dur: 4 }),
    line({ type: 'slam', mood: 'tension', word: 'X', dur: 4, say: 'Gone.', voiceDur: 1, wordTimes: [{ word: 'Gone.', t: 1 }] }),
    line({ mood: 'tension', voiceDur: 6, dur: 6.4 }),
  ];
  const placed = place(scenes);
  const hits = [{ scene: 1, f: 30 }];
  const env = envOf(scenes, { hits });
  const plain = envOf(scenes);
  const at = placed[1].from + 30;
  for (let f = at - 30; f < at + 45; f++) assert.equal(env[f], 0, `müzik yok ${f - at}`);
  assert.ok(env[at + 45 + 10] > 0 && env[at + 45 + 10] < plain[at + 45 + 10], 'yavaş dönüyor');
  assert.ok(near(env[at + 90], plain[at + 90]), 'üç saniyede sesin izin verdiği yerde');
  // planSfx'in kart vuruşu (gerilime giren bölüm) da müziği 1,5 sn dışarıda tutar.
  const withCard = [line({ voiceDur: 3, dur: 3.4 }), { type: 'title', chapterCard: true, title: 'II', chapter: 1, dur: 2.8, mood: 'tension' }, line({ chapter: 1, mood: 'tension', voiceDur: 6, dur: 6.4 })];
  const cues = sfxOf(withCard);
  const card = cues.find((c) => c.key === 'ch1');
  assert.ok(card && card.kind === 'hit');
  const e2 = envOf(withCard, { sfx: cues });
  for (let f = card.at; f < card.at + 45; f++) assert.equal(e2[f], 0, `kart vuruşundan sonra ${f - card.at}`);
  assert.ok(e2[card.at + 90] > 0);
});

/* =================================================================== sfx */

test('ağır satır: "The work killed twelve." vuruş almaz — alçak thud 0.35, stinger yok, yükseltici yok', () => {
  const slam = (o) => line({ type: 'slam', word: 'twelve', dur: 4.3, voiceDur: 3.4, riser: true, ...o });
  for (const mood of ['sad', 'dread']) {
    const scenes = [line({ voiceDur: 30, dur: 30.4 }), slam({ mood, say: '[serious] But the speed had a price. The work killed twelve.' }), line({ voiceDur: 30, dur: 30.4 })];
    const cues = sfxOf(scenes, { genre: 'crime', marks: [{}, { slam: 90 }, {}] });
    const mine = cues.filter((c) => /^(s|st|r)1$/.test(c.key));
    assert.deepEqual(mine.map((c) => [c.key, c.kind, c.gain]), [['s1', 'thud', 0.35]], `${mood}: ${JSON.stringify(mine)}`);
    assert.ok(!cues.some((c) => ['hit', 'stinger', 'riser'].includes(c.kind)), JSON.stringify(cues));
  }
  // Ölüm sonraki iki satırdaysa da ağır: "The record says otherwise." -> "Thirty deaths..."
  const ahead = [line({ voiceDur: 30, dur: 30.4 }), slam({ mood: 'reveal', say: 'The record says otherwise.' }), line({ say: 'The acute toll was two killed in the explosion.' }), line({ voiceDur: 30, dur: 30.4 })];
  assert.equal(sfxOf(ahead, { marks: [{}, { slam: 60 }, {}, {}] }).find((c) => c.key === 's1')?.kind, 'thud');
  // Kontrol: nötr gerilim satırı korkuda (suç türü) vuruş + stinger alır.
  const neutral = [line({ voiceDur: 30, dur: 30.4 }), slam({ mood: 'dread', say: 'Police stopped a man on a motorcycle.' }), line({ voiceDur: 30, dur: 30.4 })];
  const nc = sfxOf(neutral, { genre: 'crime', marks: [{}, { slam: 60 }, {}] });
  assert.equal(nc.find((c) => c.key === 's1')?.kind, 'hit');
  assert.equal(nc.find((c) => c.key === 'st1')?.kind, 'stinger');
  assert.equal(nc.find((c) => c.key === 'r1')?.kind, 'riser');
  // Ağır bir montaj kancası da thud.
  const mont = [line({ voiceDur: 30, dur: 30.4 }), line({ type: 'montage', mood: 'sad', riser: true, dur: 5, say: 'They buried them in lead.' })];
  const mc = sfxOf(mont, { marks: [{}, { hook: 100, cuts: [] }] });
  assert.equal(mc.find((c) => c.key === 'mh1')?.kind, 'thud');
  assert.ok(!mc.some((c) => c.kind === 'riser'));
});

test('bölüm kartı gireceği bölümün duygusuyla: gerilim/korku yükseltici + vuruş 0.4, ifşa yalnız vuruş, merak/zafer hiçbir şey, hüzün/sakin yumuşak swell', () => {
  const card = (mood, next = {}) => [
    line({ voiceDur: 70, dur: 72 }),
    { type: 'title', chapterCard: true, title: 'II', chapter: 1, dur: 2.8, mood },
    line({ chapter: 1, mood, voiceDur: 30, dur: 30.4, ...next }),
  ];
  const at = (scenes, key) => sfxOf(scenes).filter((c) => c.key === key).map((c) => [c.kind, +c.gain.toFixed(2)]);
  for (const mood of ['tension', 'dread']) {
    assert.deepEqual(at(card(mood), 'ch1'), [['hit', 0.4]], mood);
    assert.deepEqual(at(card(mood), 'cr1'), [['riser', 0.55]], mood);
  }
  assert.deepEqual(at(card('reveal'), 'ch1'), [['hit', 0.4]]);
  assert.deepEqual(at(card('reveal'), 'cr1'), []);
  for (const mood of ['curious', 'triumph']) {
    const cues = sfxOf(card(mood));
    assert.ok(!cues.some((c) => ['hit', 'riser', 'stinger'].includes(c.kind)), `${mood}: ${JSON.stringify(cues)}`);
  }
  for (const mood of ['sad', 'calm']) {
    const cues = sfxOf(card(mood));
    assert.ok(!cues.some((c) => ['hit', 'riser', 'stinger', 'whoosh'].includes(c.kind)), `${mood}: ${JSON.stringify(cues)}`);
    assert.deepEqual(at(card(mood), 'cs1'), [['swell', 0.2]], `${mood}: yumuşak swell`);
  }
  // Ölümü söyleyen bir bölüme giren kart: hiçbir şey (kartın geçişinin hışırtısı da yok).
  const grief = card('tension', { say: 'Thirty men died in the first week.' });
  const gc = sfxOf(grief, { transitions: ['cut', 'flash', 'cut'] });
  assert.ok(!gc.some((c) => Math.abs(c.at - place(grief)[1].from) < 15), JSON.stringify(gc));
});

test('karartma: ölüm bilançosuna giren karartma vuruş değil thud (en çok 0.4); yoksa vuruş 0.85', () => {
  const scenes = (say) => [line({ voiceDur: 40, dur: 40.4, mood: 'tension' }), line({ mood: 'reveal', say: 'The record says otherwise.', voiceDur: 2, dur: 2.4 }), line({ mood: 'reveal', say }), line({ voiceDur: 10, dur: 10.4 })];
  const g = scenes("Chernobyl's acute toll was two killed in the explosion.");
  const gc = sfxOf(g, { transitions: ['cut', 'blackout', 'cut', 'cut'] }).filter((c) => c.key === 'b1');
  assert.equal(gc.length, 1);
  assert.equal(gc[0].kind, 'thud');
  assert.ok(gc[0].gain <= 0.4);
  const n = sfxOf(scenes('Then the searchlight picked out one pipe.'), { transitions: ['cut', 'blackout', 'cut', 'cut'] }).find((c) => c.key === 'b1');
  assert.deepEqual([n.kind, n.gain], ['hit', 0.85]);
});

test('yükselticiler en az 60 sn arayla, filmde en çok 6; önce vurgu kelimeleri, sonra kartlar film sırasıyla', () => {
  // 8 vurgu kelimesi (her biri yükselticili) 70 sn arayla, aralarında gerilime giren kartlar.
  const scenes = [];
  for (let k = 0; k < 8; k++) {
    scenes.push(line({ type: 'slam', mood: 'tension', riser: true, word: 'X', chapter: k, voiceDur: 1, dur: 2 }));
    scenes.push(line({ chapter: k, mood: 'tension', voiceDur: 30, dur: 30.4 }));
    scenes.push({ type: 'title', chapterCard: true, title: 'C', chapter: k + 1, dur: 2.8, mood: 'tension' });
    scenes.push(line({ chapter: k + 1, mood: 'tension', voiceDur: 34, dur: 34.4 }));
  }
  const marks = scenes.map((s) => (s.type === 'slam' ? { slam: 30 } : {}));
  const cues = sfxOf(scenes, { marks });
  const risers = cues.filter((c) => c.kind === 'riser').sort((a, b) => a.at - b.at);
  assert.ok(risers.length <= 6, `${risers.length} yükseltici`);
  for (let k = 1; k < risers.length; k++) assert.ok(risers[k].at - risers[k - 1].at >= 60 * fps, `${risers[k - 1].key} -> ${risers[k].key}`);
  assert.ok(risers.every((r) => /^r\d+$/.test(r.key)), `önce vurgu kelimeleri: ${risers.map((r) => r.key)}`);
  assert.equal(risers.length, 6);
  // Yalnız kartlar: film sırasıyla, 60 sn arayla, en çok 6.
  const cardsOnly = scenes.map((s) => (s.type === 'slam' ? { ...s, riser: false } : s));
  const cr = sfxOf(cardsOnly, { marks }).filter((c) => c.kind === 'riser');
  assert.ok(cr.length <= 6 && cr.length >= 5, `${cr.length}`);
  assert.equal(cr[0].key, 'cr2', 'ilk kart ilk alır');
  for (let k = 1; k < cr.length; k++) assert.ok(cr[k].at - cr[k - 1].at >= 60 * fps);
  assert.match(fs.readFileSync(new URL('../docu-engine/src/timeline.js', import.meta.url), 'utf8'), /storyHitGap: 20/, 'hikâye vuruşu aralığı aynen');
});

test('zincirin tamamı: ölüm satırının yas müziği sesin 18-23 dB altında (duyulur, gömülmez)', async () => {
  // Seçici (audio-director MOOD_GAIN_DB sad -1.5, enerji 1 → -0.8) + taban 0.55 + hüzün ördeği/yas düzeyi 0.14.
  const AD = await import('../docu-engine/lib/audio-director.mjs');
  const plan = AD.planScore({ script: { scenes: [{ say: 'Borys Baranov died of a heart attack.', mood: 'sad', energy: 1, dur: 40 }] }, lib: { music: [] }, root: '.' });
  assert.ok(plan); // boş kitaplık: yalnız modülün yüklendiğini görür
  const src = fs.readFileSync(new URL('../docu-engine/lib/audio-director.mjs', import.meta.url), 'utf8');
  const sad = Number(src.match(/const MOOD_GAIN_DB = \{[^}]*sad: (-?[\d.]+)/)[1]);
  assert.equal(sad, -1.5);
  const env = envOf([line({ mood: 'sad', voiceDur: 4, dur: 4.4, say: 'Borys Baranov died of a heart attack.' })])[60];
  const bed = -16 + sad - 0.8 + dB(env);
  const under = -19 - bed;
  assert.ok(under >= 18 && under <= 23, `yas satırında müzik sesin ${under.toFixed(1)} dB altında`);
});

test('bestelenmiş (ElevenLabs) puanın son kısması zarfta; kütüphane puanında yok (renderScore yapar); Engine bağlar', () => {
  const scenes = [line({ voiceDur: 9.5, dur: 10 })];
  const lib = envOf(scenes);
  const comp = envOf(scenes, { endFade: true });
  const n = lib.length;
  assert.equal(TL.MIX.endFade, 105, '3,5 sn = SCORE_FADE_OUT');
  assert.ok(lib[n - 1] > 0.05, 'kütüphane: zarf sonda kısmaz');
  assert.ok(comp[n - 1] < 0.01 * base, 'beste: son karede sessiz');
  assert.ok(near(comp[n - 106], lib[n - 106]), 'kısma yalnız son 3,5 sn');
  const eng = fs.readFileSync(new URL('../docu-engine/src/Engine.tsx', import.meta.url), 'utf8');
  assert.ok(eng.includes('hits, sfx: cues, logo: !!script.logo?.file, endFade: !script.musicCues?.length });'), 'Engine bölüm kartı/karartma vuruşlarını ve beste kısmasını geçirir');
  assert.match(eng, /musicEnvelope\(o: \{[^)]*sfx\?: \{ kind: string; at: number \}\[\];[^)]*endFade\?: boolean \}\)/);
});

/* ================================================================ master */

test('master: kompresör sınırlayıcıdan önce, tavan 0.75; |I-hedef| > 0.4 LU ise kazanç düzeltilip bir kez daha kodlanır', () => {
  const chain = P.masterChain(4.8);
  assert.equal(chain, 'volume=4.80dB,acompressor=threshold=0.1:ratio=1.5:attack=20:release=250,aresample=192000,alimiter=limit=0.750:attack=1:release=50:level=false:latency=1,aresample=48000');
  assert.ok(chain.indexOf('acompressor') < chain.indexOf('alimiter'));
  // 0.82 denendi: AAC ~1 dB taşırıyor, tepe bekçisi neredeyse her videoda ikinci kodlamayı açıyordu.
  assert.equal(P.MASTER.ceiling, 0.75);
  assert.ok(near(dB(0.1), -20, 1e-9), 'eşik -20 dBFS');
  // Lula 20261026-29db03: -14.6 LUFS'ta bitti.
  let fix = P.masterCorrection({ I: -14.6, TP: -1.8 }, { target: -14, gain: 4.7, ceiling: 0.82 });
  assert.deepEqual([fix.redo, fix.why, +fix.gain.toFixed(2), fix.ceiling], [true, ['i'], 5.3, 0.82]);
  fix = P.masterCorrection({ I: -14.3, TP: -1.6 }, { target: -14, gain: 4.7, ceiling: 0.82 });
  assert.equal(fix.redo, false, '0.4 LU içinde: bir daha kodlanmaz');
  fix = P.masterCorrection({ I: -13.5, TP: -1.6 }, { target: -14, gain: 4.7 });
  assert.deepEqual([fix.redo, +fix.gain.toFixed(2)], [true, 4.2], 'fazla yüksek de düzeltilir');
  // Tepe -0.6 dBTP: tavan aşımı + 0.2 kadar iner (hedef ~-1.5 dBTP); seviye doğruysa kazanç aynı.
  fix = P.masterCorrection({ I: -14.1, TP: -0.6 }, { target: -14, gain: 4.7, ceiling: 0.82 });
  assert.deepEqual(fix.why, ['tp']);
  assert.ok(near(dB(0.82 / fix.ceiling), 1.1, 1e-6), `${dB(0.82 / fix.ceiling)}`);
  assert.equal(fix.gain, 4.7);
  fix = P.masterCorrection({ I: -14.7, TP: -0.8 }, { target: -14, gain: 4.7, ceiling: 0.82 });
  assert.deepEqual(fix.why, ['tp', 'i'], 'ikisi tek kodlamada');
  assert.equal(P.masterCorrection({ I: null, TP: null }, { target: -14, gain: 0 }).redo, false, 'ölçüm yoksa (sahte ffmpeg) ek kodlama yok');
  // LRA da okunur ve günlüğe yazılır.
  const sum = '[Parsed_ebur128_0] t: 1 M: -14\nSummary:\n  Integrated loudness:\n    I:         -14.0 LUFS\n  Loudness range:\n    LRA:         5.3 LU\n  True peak:\n    Peak:       -1.6 dBFS\n';
  assert.deepEqual(P.eburSummary(sum), { I: -14, LRA: 5.3, TP: -1.6 });
  const src = fs.readFileSync(new URL('../docu-engine/lib/produce.mjs', import.meta.url), 'utf8');
  const fn = src.match(/export function masterAudio[\s\S]*?\n}\n/)[0];
  assert.match(fn, /masterCorrection\(res, \{ target, gain, ceiling \}\)/);
  assert.match(fn, /LRA \$\{res\.LRA/);
  assert.equal(fn.match(/= encode\(\)/g).length, 2, 'bir kodlama + en çok bir ek kodlama');
});

test('müzik geçmişi kanal başına: script.musicChannel (hattın yazdığı), sonra script.channel, yoksa biçim/türden; kayıt kanalı taşır', () => {
  assert.equal(P.musicChannelOf({ musicChannel: 'history', channel: 'Behind the Headline', genre: 'crime' }), 'history', 'hattın kanal anahtarı (sesinden) türü ezer');
  assert.equal(P.musicChannelOf({ musicChannel: 'finance', format: 'news' }), 'finance');
  assert.equal(P.musicChannelOf({ musicChannel: 'Then What', genre: 'epic' }), 'history', 'tanınmayan değer yok sayılır');
  assert.equal(P.musicChannelOf({ channel: 'news', genre: 'epic' }), 'news');
  assert.equal(P.musicChannelOf({ format: 'news', genre: 'crime' }), 'news');
  assert.equal(P.musicChannelOf({ genre: 'finance' }), 'finance');
  assert.equal(P.musicChannelOf({ genre: 'epic' }), 'history');
  assert.equal(P.musicChannelOf({ genre: 'crime' }), 'docu');
  assert.equal(P.musicChannelOf({ channel: 'History Uncovered', genre: 'epic' }), 'history', 'köşe damgasının görünen adı kanal anahtarı değil');
  assert.equal(P.musicChannelOf({}), 'docu');
  const src = fs.readFileSync(new URL('../docu-engine/lib/produce.mjs', import.meta.url), 'utf8');
  assert.match(src, /musicHistoryFor\(readMusicHistory\(MUSIC_HISTORY\), id, \{ channel: MUSIC_CHANNEL \}\)/);
  assert.match(src, /recordMusicHistory\(MUSIC_HISTORY, \{ key: id, title: script\.title, genre: script\.genre, channel: MUSIC_CHANNEL,/);
  // Planın uyarıları iş günlüğüne gider; boş ciddi havuz ücretli besteye sessizce geçmez, işi durdurur.
  assert.match(src, /selector: MUSIC_SELECTOR, log \}\);/);
  assert.match(src, /ücretli besteye geçilmedi/);
  assert.doesNotMatch(src, /müzik ElevenLabs ile bestelenecek \(ek kredi\)/);
  // Görüntünün kurgu dili müziğin ağırlığıyla değişmez (editGravity, eski kural).
  assert.match(src, /applyEditGrammar\(script, \{ gravity: editGravity\(script, script\.genre\) \}\)/);
});

/* ============================================================ real films */

const JOBS = 'D:\\Nova Studyo\\data\\jobs';
function realFilm(id) {
  const f = `${JOBS}\\${id}\\docu\\${id}.props.json`;
  if (!fs.existsSync(f)) return null;
  const s = JSON.parse(fs.readFileSync(f, 'utf8')).script;
  const scenes = s.scenes;
  const placed = TL.placeTimeline(scenes, fps, s.beats ?? []).map((p, i) => ({ ...p, transition: scenes[i].transition ?? 'cut' }));
  const key = (w) => String(w ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const marks = scenes.map((sc) => {
    if (sc.type !== 'slam') return {};
    const w = (sc.wordTimes ?? []).find((x) => key(x.word) === key(sc.word));
    return { slam: Math.round((w ? w.t : 1) * fps) };
  });
  const hits = marks.map((m, i) => (m.slam !== undefined ? { scene: i, f: m.slam } : null)).filter(Boolean);
  const cues = TL.planSfx({ placed, scenes, fps, genre: s.genre, marks });
  const env = TL.musicEnvelope({ placed, scenes, fps, base, hits, sfx: cues });
  return { s, scenes, placed, cues, env };
}

test('gerçek filmler (Kartal Yuvası, Çernobil, Fransa): ağır satırda vuruş yok, yükseltici <= 6 ve 60 sn arayla, ses altında yatak derin', (t) => {
  let ran = 0;
  for (const id of ['20261024-950730', '20261026-24122a', '20261020-37f9d2']) {
    const film = realFilm(id);
    if (!film) continue;
    ran++;
    const { scenes, placed, cues, env } = film;
    const risers = cues.filter((c) => c.kind === 'riser').sort((a, b) => a.at - b.at);
    assert.ok(risers.length <= 6, `${id}: ${risers.length} yükseltici`);
    for (let k = 1; k < risers.length; k++) assert.ok(risers[k].at - risers[k - 1].at >= 60 * fps, `${id}: ${risers[k - 1].key} -> ${risers[k].key}`);
    scenes.forEach((sc, i) => {
      const card = sc.type === 'title' && sc.chapterCard;
      if (!TL.graveAt(scenes, i, card ? scenes[i + 1]?.mood ?? sc.mood : sc.mood)) return;
      const loud = cues.filter((c) => [`s${i}`, `st${i}`, `ch${i}`, `b${i}`, `cr${i}`, `r${i}`].includes(c.key) && ['hit', 'stinger', 'riser'].includes(c.kind));
      assert.deepEqual(loud, [], `${id} sahne ${i} (${sc.mood}): ${(sc.say ?? '').slice(0, 60)}`);
    });
    // Ses altında yatak en çok ifşa ördeği (0.22); kısa duraklamada en çok +5 dB.
    for (const [a, b] of TL.voiceRanges(placed, scenes, fps)) for (let f = a; f < b; f++) assert.ok(env[f] <= base * 0.22 + 1e-6, `${id}: ${f} karede ${env[f]}`);
    for (const p of TL.bedCurve({ placed, scenes, fps }).pauses) if (!p.open) assert.ok(maxIn(env, p.a, p.b) <= base * p.level + 1e-6, `${id}: kısa duraklama ${p.a}`);
    if (id === '20261024-950730') {
      const twelve = scenes.findIndex((x) => /killed twelve/.test(x.say ?? ''));
      assert.deepEqual(cues.filter((c) => c.key === `s${twelve}`).map((c) => [c.kind, c.gain]), [['thud', 0.35]], '"The work killed twelve." alçak thud');
    }
    if (id === '20261026-24122a') {
      const record = scenes.findIndex((x) => /The record says otherwise/.test(x.say ?? ''));
      assert.ok(!cues.some((c) => c.key === `b${record}` && c.kind === 'hit'), 'ölüm bilançosuna karartma vuruşu yok');
    }
  }
  if (!ran) t.skip('iş verisi yok');
});

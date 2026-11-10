// GÖRÜNÜŞ — RENK POLİTİKASI (konu kimliği + sanat yönetmeni + görünüm kataloğu).
// Gimli 20261028-9ff721 / Kartal Yuvası 950730 ve son 7 video, 29 Ekim 2026 (ffmpeg signalstats): ortalama parlaklık
// 52-75, doygunluk 2,5-7,5, karelerin %21-39'u luma < 40 — sahibi: "her video siyah, karanlık, aynı; anlık efektler
// doğal değil". En iyi video Panama ('color') 88 / 10,2. Kilitlenen kurallar:
//   - bölüm tabanı renk ailesinden; soldurucu ton yalnızca TEK vurgu bölümünde (bölüm 0 asla), resimlerin en çok %15'i;
//   - konu motiflerinin tabanı renkli, soldurucu öneri accentGrade'e taşınır;
//   - kanal genelinde taban önceki videodan farklı, 3 videodan biri açık varyant, açık zemin payı;
//   - efekt anlatım vuruşunda: vignette-pulse vuruş/yumuşak efekt değil, en çok 2; slam vuruşsuz kalabilir; taban %12.
// Ağ, ffmpeg ve model çağrısı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { os.setPriority(process.pid, 10); } catch {}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-renk-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A = await import('../src/pipeline/docu-art-director.js');
const T = await import('../src/pipeline/docu-topic-bible.js');

const tmp = (name) => path.join(home, `${name}-${Math.random().toString(36).slice(2)}.json`);
const noLog = () => {};
const run = (script, o = {}) => A.artDirect(script, { llm: false, historyFile: o.historyFile || tmp('hist'), logFn: noLog, ...o });
const longEn = (g) => JSON.parse(fs.readFileSync(path.join(ROOT, 'docu-engine/videos/long-en', `${g}.json`), 'utf8'));
const QUIET = 'The road runs along the coast toward the harbour.';

const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'tension', 'curious', 'triumph', 'dread'];
function fixture({ id = 'renk-a', genre = 'crime', era = '1971', n = 72 } = {}) {
  const scenes = Array.from({ length: n }, (_, i) => {
    const mood = MOODS[(i * 7 + Math.floor(i / 5)) % MOODS.length];
    const chapter = Math.min(3, Math.floor(i / (n / 4)));
    const say = i % 4 === 2 ? QUIET : `Scene ${i} narration about the case, line ${i}.`;
    const k = i % 9;
    if (i === 0) return { type: 'montage', mood: 'tension', say, dur: 5, text: 'Night Rain Stairs', imagePrompts: ['a', 'b', 'c'], chapter };
    if (k === 1) return { type: 'words', mood, say, dur: 5, text: `Words ${i}`, keyword: 'case', chapter, ...(i % 2 ? { bg: 'prev' } : {}) };
    if (k === 3) return { type: 'words', mood, say, dur: 5, text: `Plain words ${i}`, chapter };
    if (k === 5) return { type: 'slam', mood, say, dur: 4, word: 'GONE', chapter, ...(i % 4 === 1 ? { imagePrompt: 'dark sky' } : {}) };
    if (k === 7) return { type: 'counter', mood, say, dur: 5, to: 200000, prefix: '$', chapter };
    return { type: 'photo', mood, say, dur: 6, source: i % 3 ? 'ai' : 'stock', imagePrompt: `Wide shot ${i}`, chapter };
  });
  return { id, seedKey: id, title: 'Renk testi', genre, era, locale: 'en-US', chapters: ['One', 'Two', 'Three', 'Four'], scenes };
}
const accentChapters = (script) => {
  const es = A.eraRange(script.era)?.start ?? null;
  return new Set(script.scenes.filter((x) => A.isGradeScene(x) && x.grade && A.accentGradeOf(x.grade, es)).map((x) => x.chapter ?? 0));
};

/* ---------------------------------------------------------------- konu kimliği */

test('motif kartları: taban renkli (spesifikasyon), soldurucu ton yalnızca accentGrade; hepsi GRADES listesinde', () => {
  const want = { telegraph: 'warm', ticker: 'color', electric: 'teal-orange', 'case-file': 'cool', expedition: 'cool', siege: 'warm', cipher: 'color', telemetry: 'cool' };
  for (const [m, g] of Object.entries(want)) {
    const spec = T.MOTIF_SPECS[m];
    assert.equal(spec.grade, g, m);
    assert.ok(A.COLOUR_GRADES.includes(spec.grade), `${m}: taban renk ailesinden`);
    assert.ok(A.DESAT_GRADES.has(spec.accentGrade), `${m}: vurgu soldurucu (${spec.accentGrade})`);
    assert.ok(A.GRADES.includes(spec.accentGrade));
  }
  assert.deepEqual(Object.keys(want).sort(), [...T.MOTIF_IDS].sort());
});

test('topicGrades: soldurucu taban vurguya taşınır; renk öncesi hikâyede sepya taban olur; geçersiz dize reddedilir', () => {
  const spec = T.MOTIF_SPECS.ticker;
  assert.deepEqual(T.topicGrades({ grade: 'selective' }, spec, 1929), { grade: 'color', accentGrade: 'selective' });
  assert.deepEqual(T.topicGrades({ grade: 'mono' }, T.MOTIF_SPECS.cipher, 1990), { grade: 'color', accentGrade: 'mono' });
  assert.deepEqual(T.topicGrades({ grade: 'bleach', accentGrade: 'mono' }, T.MOTIF_SPECS.siege, 1453), { grade: 'warm', accentGrade: 'bleach' });
  assert.deepEqual(T.topicGrades({ grade: 'sepia' }, T.MOTIF_SPECS.siege, 1453), { grade: 'sepia', accentGrade: 'selective' }, '1453: arşiv zaten tek renk');
  assert.deepEqual(T.topicGrades({ grade: 'sepia' }, T.MOTIF_SPECS.siege, 1990), { grade: 'warm', accentGrade: 'sepia' });
  assert.equal(T.topicGrades({ grade: 'not-a-grade' }, spec, 1990).grade, 'color');
  assert.equal(T.topicGrades({ grade: 'vhs' }, T.MOTIF_SPECS['case-file'], 1985).grade, 'cool', 'vhs taban değil');
  assert.equal(T.topicGrades({ grade: 'kodachrome', accentGrade: 'kodachrome' }, spec, 1965).accentGrade, 'selective', 'vurgu tabanla aynı olamaz');
});

test('konu incili: modelin selective tabanı vurguya iner; kayıttan gelen eski incil de onarılır; yedek incil renkli', async () => {
  const s = longEn('documentary');
  const b = T.normalizeBible({ motif: 'telegraph', grade: 'selective', keepHue: 30, presentation: { photo: 'lightbox', map: 'paper' }, typography: { headline: 'oldstandard', textStyles: ['typewriter', 'serif', 'underline'] }, palette: { accent: '#ffb547', accent2: '#e2563b' }, explainers: [], scenes: [] }, s);
  assert.equal(b.grade, 'warm');
  assert.equal(b.accentGrade, 'selective');
  // eski önbellek: taban 'selective' — topicIdentity yeni model çağrısı olmadan onarır
  const id = T.topicIdentity({ ...b, grade: 'selective', accentGrade: undefined }, s);
  assert.ok(A.COLOUR_GRADES.includes(id.grade), id.grade);
  assert.equal(id.accentGrade, 'selective');
  for (const g of ['documentary', 'finance', 'crime', 'horror', 'epic', 'science', 'inspire']) {
    const sc = longEn(g);
    const fb = T.fallbackBible(sc);
    assert.ok(A.baseGradeOk(fb.grade, A.eraRange(sc.era)?.start), `${g}: yedek taban ${fb.grade}`);
    const { script } = await T.topicBible(sc, { llm: false });
    assert.ok(A.baseGradeOk(script.topic.grade, A.eraRange(sc.era)?.start), `${g}: script.topic.grade ${script.topic.grade}`);
    assert.ok(!script.topic.accentGrade || A.GRADES.includes(script.topic.accentGrade));
  }
  // şema: taban/vurgu GRADES listesiyle sınırlı, istem renkli tabanı söyler
  const sch = T.bibleSchema();
  assert.deepEqual(sch.properties.grade.enum, A.GRADES);
  assert.deepEqual(sch.properties.accentGrade.enum, A.GRADES);
  assert.match(T.biblePrompt(s).system, /always a COLOUR grade/);
});

/* ---------------------------------------------------------------- sanat yönetmeni: renk */

test('yedek plan: bölüm tabanları renkli, soldurucu vurgu en çok bir bölümde (kanca değil) ve resimlerin en çok %15i', async () => {
  for (const [genre, era] of [['crime', '1971'], ['horror', '1959'], ['finance', '1929'], ['epic', '1453'], ['science', '1986'], ['documentary', '1912'], ['inspire', '1960']]) {
    for (const id of ['r1', 'r2']) {
      const s = fixture({ id: `${genre}-${id}`, genre, era });
      const res = await run(s);
      assert.deepEqual(res.violations, [], `${genre}/${id}`);
      const es = A.eraRange(era).start;
      for (const c of res.script.chapterLooks) assert.ok(A.baseGradeOk(c.grade, es), `${genre}/${id}: taban ${c.grade}`);
      assert.ok(A.baseGradeOk(res.plan.grading.base, es));
      const acc = accentChapters(res.script);
      assert.ok(acc.size <= 1 && !acc.has(0), `${genre}/${id}: vurgu bölümleri ${[...acc]}`);
      const pics = res.script.scenes.filter(A.isGradeScene);
      const nAcc = pics.filter((x) => A.accentGradeOf(x.grade, es)).length;
      assert.ok(nAcc <= A.accentGradeCap(pics.length), `${genre}/${id}: ${nAcc}/${pics.length} soldurucu sahne`);
      // renkli sahneler çoğunlukta
      assert.ok(pics.filter((x) => A.COLOUR_GRADES.includes(x.grade) || (x.grade === 'sepia' && es < 1940)).length / pics.length >= 0.8, `${genre}/${id}: renk payı`);
    }
  }
  // gerçek senaryolar + konu kimliği
  for (const g of ['crime', 'documentary', 'finance', 'horror', 'science']) {
    const { script } = await T.topicBible(longEn(g), { llm: false });
    const res = await run(script);
    assert.deepEqual(res.violations, [], g);
    assert.ok(res.script.chapterLooks.every((c) => A.baseGradeOk(c.grade, A.eraRange(script.era)?.start)), g);
    const acc = accentChapters(res.script);
    assert.ok(acc.size <= 1 && !acc.has(0), `${g}: ${[...acc]}`);
  }
});

test('katalog: suç/korku/finans renk tonlarını alabilir; derecelendirme ailesi kayıtlı; seçici renk yalnızca konu vurgusu', async () => {
  const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'docu-engine/looks-catalog.json'), 'utf8'));
  const byId = Object.fromEntries(L.grades.map((g) => [g.id, g]));
  for (const g of ['color', 'warm', 'cool', 'teal-orange', 'kodachrome']) {
    assert.equal(byId[g].genres, 'all', `${g} tür kapısında silinmez`);
    assert.equal(byId[g].family, 'colour');
  }
  for (const g of A.DESAT_GRADES) assert.equal(byId[g].family, 'accent', g);
  assert.match(byId.selective.description, /ACCENT only/);
  for (const genre of ['crime', 'horror', 'finance']) {
    let enumCh = null;
    const llm = async ({ schema }) => { enumCh = schema.properties.chapterLooks.items.properties.grade.enum; return { variant: '', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] }; };
    await A.artDirect(fixture({ id: `cat-${genre}`, genre, era: '1975' }), { llm, settings: { anthropicKey: 'x' }, historyFile: tmp('hist'), logFn: noLog, recordHistory: false });
    for (const g of ['color', 'cool', 'warm']) assert.ok(enumCh.includes(g), `${genre}: ${g}`);
    assert.ok(!enumCh.includes('selective'), `${genre}: kimliksiz videoda seçici renk yok`);
  }
});

test('model önerisi: soldurucu taban ve iki vurgu bölümü onarılır; checkPlan yakalar', async () => {
  const s = fixture({ id: 'llm-renk' });
  const pics = s.scenes.map((x, i) => (A.isGradeScene(x) ? i : -1)).filter((i) => i >= 0);
  const llm = async () => ({
    variant: 'red-thread', textStyles: [], transitions: [], accents: [],
    chapterLooks: [1, 2, 3, 4].map((c) => ({ chapter: c, accent: '#334455', grade: 'mono', backdrop: { kind: 'paper' } })),
    scenes: s.scenes.map((x, i) => ({ scene: i, transition: 'cut', ...(pics.includes(i) ? { grade: 'bleach' } : {}) })),
  });
  const res = await A.artDirect(s, { llm, historyFile: tmp('hist'), logFn: noLog });
  assert.equal(res.mode, 'llm');
  assert.deepEqual(res.violations, []);
  assert.ok(res.script.chapterLooks.every((c) => A.COLOUR_GRADES.includes(c.grade)), 'mono taban renkliye döner');
  const acc = accentChapters(res.script);
  assert.ok(acc.size <= 1 && !acc.has(0));
  const nAcc = res.script.scenes.filter((x) => A.isGradeScene(x) && A.accentGradeOf(x.grade, 1971)).length;
  assert.ok(nAcc <= A.accentGradeCap(pics.length));
  // checkPlan: soldurucu taban, iki vurgu bölümü, kanca bölümünde vurgu, %15 aşımı
  const S = res.script.scenes.map((x) => ({ ...x }));
  const bad = { ...res.script, chapterLooks: res.script.chapterLooks.map((c, k) => (k === 1 ? { ...c, grade: 'mono' } : c)), scenes: S.map((x) => (A.isGradeScene(x) && (x.chapter === 0 || x.chapter === 2) ? { ...x, grade: 'bleach' } : x)) };
  const v = A.checkPlan(bad).join('\n');
  assert.match(v, /bölüm 2: taban grade mono renk ailesinden değil/);
  assert.match(v, /soldurucu vurgu grade [2-4] bölümde \(en çok 1\)/);
  assert.match(v, /soldurucu vurgu grade kanca bölümünde/);
  assert.match(v, /soldurucu vurgu grade \d+\/\d+ resimli sahnede \(tavan %15/);
});

test('kayıtlı eski plan (renk politikası öncesi, mono taban) model çağrılmadan onarılır', async () => {
  const s = fixture({ id: 'cache-renk' });
  const cache = tmp('cache');
  await run(s, { cacheFile: cache, recordHistory: false });
  const c = JSON.parse(fs.readFileSync(cache, 'utf8'));
  delete c.plan.grading;
  c.plan.chapterLooks = c.plan.chapterLooks.map((x) => ({ ...x, grade: 'mono' }));
  c.plan.scenes = c.plan.scenes.map((e) => (e.grade ? { ...e, grade: 'mono' } : e));
  fs.writeFileSync(cache, JSON.stringify(c));
  const logs = [];
  const res = await A.artDirect(s, { llm: async () => { throw new Error('model çağrılmamalı'); }, settings: { anthropicKey: 'x' }, cacheFile: cache, historyFile: tmp('hist'), logFn: (m) => logs.push(m), recordHistory: false });
  assert.equal(res.cached, true);
  assert.deepEqual(res.violations, []);
  assert.ok(res.plan.grading && res.script.chapterLooks.every((x) => A.COLOUR_GRADES.includes(x.grade)));
  assert.ok(accentChapters(res.script).size <= 1);
  assert.ok(logs.some((l) => /renk politikasına göre onarıldı/.test(l)));
  assert.ok(JSON.parse(fs.readFileSync(cache, 'utf8')).plan.grading, 'onarılan plan kayda yazılır');
});

/* ---------------------------------------------------------------- kanal geneli çeşitlilik */

test('geçmiş: taban önceki videodan farklı; son iki video koyuysa açık varyant; kayıt taban/vurgu/açık/zemin payını taşır', async () => {
  const s = fixture({ id: 'kanal-1', genre: 'finance', era: '1985' });
  const free = await run(s, { recordHistory: false });
  const base0 = free.plan.grading.base;
  // önceki video aynı tabanla bitti → bu video başka bir taban
  const hist = tmp('hist');
  A.recordHistory(hist, { id: 'old-a', genre: 'crime', variant: 'cold-blue-case', textStyles: [], transitions: [], baseGrade: base0, isLight: true, at: '2026-10-27' });
  const r1 = await run(s, { historyFile: hist, recordHistory: false });
  assert.notEqual(r1.plan.grading.base, base0, 'taban önceki videonunkiyle aynı');
  assert.deepEqual(r1.violations, []);
  // son iki video koyu → açık varyant (modelin koyu önerisi reddedilir, şema yalnızca açıkları sunar)
  const hist2 = tmp('hist');
  A.recordHistory(hist2, { id: 'old-b', genre: 'crime', variant: 'cold-blue-case', textStyles: [], transitions: [], baseGrade: 'cool', isLight: false, at: '2026-10-26' });
  A.recordHistory(hist2, { id: 'old-c', genre: 'epic', variant: 'bronze-gold', textStyles: [], transitions: [], at: '2026-10-27' }); // eski kayıt (alan yok) koyu sayılır
  assert.equal(A.needsLightLook(A.readHistory(hist2), 'kanal-1'), true);
  let offered = null;
  const llm = async ({ schema }) => { offered = schema.properties.variant.enum; return { variant: 'terminal-green', textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] }; };
  const r2 = await A.artDirect(s, { llm, settings: { anthropicKey: 'x' }, historyFile: hist2, logFn: noLog });
  const looks = A.loadCatalogs().looks;
  assert.ok(offered.every((id) => looks.find((l) => l.id === id).isLight), `yalnızca açık varyantlar: ${offered}`);
  assert.equal(looks.find((l) => l.id === r2.plan.look.variant).isLight, true, r2.plan.look.variant);
  assert.ok(r2.plan.notes.some((n) => /son iki videosu koyu/.test(n)));
  assert.deepEqual(r2.violations, []);
  const e = A.readHistory(hist2).find((x) => x.id === 'kanal-1');
  assert.equal(e.isLight, true);
  assert.ok(A.COLOUR_GRADES.includes(e.baseGrade));
  assert.ok('accentGrade' in e && typeof e.lightShare === 'number');
  assert.notEqual(e.baseGrade, 'cool', 'önceki videonun tabanından farklı');
  // art arda 6 video (tür dönüşümlü): her ardışık üçlüde açık varyant (tür açık varyant sunabildikçe), taban ardışık farklı
  const h3 = tmp('hist');
  const seq = [];
  for (const [k, genre] of ['crime', 'finance', 'documentary', 'crime', 'finance', 'documentary'].entries()) {
    const sc = fixture({ id: `seq-${k}`, genre, era: '1975' });
    const before = A.readHistory(h3);
    const { open, needLight } = A.openLooks(sc, A.loadCatalogs(), before);
    const r = await run(sc, { historyFile: h3 });
    assert.deepEqual(r.violations, [], `seq-${k}`);
    if (A.needsLightLook(before, sc.id) && open.some((l) => l.isLight)) assert.ok(needLight && r.plan.grading.isLight, `seq-${k}: açık varyant gerekirdi`);
    seq.push(r.plan.grading);
  }
  seq.forEach((g, k) => { if (k) assert.notEqual(g.base, seq[k - 1].base, `video ${k}: taban öncekiyle aynı (${g.base})`); });
  assert.ok(seq.some((g) => g.isLight), 'en az bir açık varyant');
});

test('açık zemin payı: açık varyantta %40-60, koyu varyantta en az ~%20 (eski "en az 3" kuralının yerine)', async () => {
  const looks = A.loadCatalogs().looks;
  let lightSeen = 0;
  let darkSeen = 0;
  for (const [genre, variant] of [['finance', 'clean-white-editorial'], ['finance', 'salmon-paper'], ['crime', 'newsprint-paper'], ['crime', 'cold-blue-case'], ['documentary', 'magazine-colour']]) {
    const s = fixture({ id: `bd-${variant}`, genre, era: '1975', n: 90 });
    const llm = async () => ({ variant, textStyles: [], transitions: [], accents: [], chapterLooks: [], scenes: [] });
    const res = await A.artDirect(s, { llm, settings: { anthropicKey: 'x' }, historyFile: tmp('hist'), logFn: noLog });
    assert.equal(res.plan.look.variant, variant);
    assert.deepEqual(res.violations, [], variant);
    const isLight = looks.find((l) => l.id === variant).isLight;
    const bd = res.script.scenes.filter((x) => x.backdrop);
    const share = bd.filter((x) => A.isLightBackdrop(x.backdrop)).length / bd.length;
    if (isLight) { lightSeen++; assert.ok(share >= 0.38 && share <= 0.62, `${variant}: açık zemin %${Math.round(share * 100)}`); }
    else { darkSeen++; assert.ok(share >= 0.18, `${variant}: açık zemin %${Math.round(share * 100)}`); }
    assert.equal(res.plan.grading.isLight, isLight);
  }
  assert.ok(lightSeen >= 2 && darkSeen >= 2);
  assert.ok(!('lightBackdropsMin' in A.RULES), 'sabit "en az 3" kuralı kalktı');
});

/* ---------------------------------------------------------------- efektler anlatım vuruşunda */

test('anlatım vuruşu: sayı/ad/dönüş sözcüğü/slam puan alır, sakin bilgi satırı 0', () => {
  assert.equal(A.narrationBeat({ type: 'photo', say: QUIET }), 0);
  assert.ok(A.narrationBeat({ type: 'photo', say: 'By 1929 the market had tripled.' }) > 0);
  assert.ok(A.narrationBeat({ type: 'photo', say: 'The plane landed in Seattle at night.' }) > 0, 'özel ad');
  assert.ok(A.narrationBeat({ type: 'photo', say: 'It worked. But nobody believed it.' }) > 0, 'dönüş sözcüğü');
  assert.ok(A.narrationBeat({ type: 'slam', say: 'gone' }) >= 1);
  assert.equal(A.narrationBeat({ type: 'title', chapterCard: true, say: 'One' }), 0);
  assert.equal(A.RULES.minPictureFxShare, 0.12);
  assert.ok(A.RULES.fxTieBreak <= 0.1);
});

test('yedek plan: sakin bilgi çekimi temiz; vignette-pulse en çok 2 ve yalnızca dread/tension vuruşunda; yüksek sesli efekt yalnızca vuruş/zirvede; slam vuruşsuz kalabilir', async () => {
  for (const id of ['fx1', 'fx2', 'fx3', 'fx4']) {
    const s = fixture({ id, n: 90 });
    const res = await run(s);
    assert.deepEqual(res.violations, [], id);
    const S = res.script.scenes;
    for (const x of S) {
      if (x.type === 'photo' && x.say === QUIET && x.energy < 4) assert.ok(!(x.fx || []).length, `${id}: sakin çekimde efekt ${x.fx}`);
      for (const k of x.fx || []) if (A.LOUD_FX.has(k)) assert.ok(A.isImpactScene(x) || x.energy >= 4, `${id}: ${k} enerji ${x.energy}`);
    }
    const pulses = S.filter((x) => (x.fx || []).includes('vignette-pulse'));
    assert.ok(pulses.length <= A.VIGNETTE_PULSE_MAX);
    for (const x of pulses) assert.ok(A.isImpactScene(x) && ['dread', 'tension'].includes(x.mood));
    const pics = S.filter(A.isGradeScene);
    assert.ok(pics.filter((x) => x.fx?.length).length / pics.length >= A.RULES.minPictureFxShare);
    assert.ok(pics.filter((x) => x.fx?.length).length / pics.length <= 0.3, `${id}: efekt serpiştirilmiş`);
  }
  assert.ok(!A.HIT_FX.includes('vignette-pulse'), 'vignette-pulse vuruş efekti değil');
  // checkPlan: vignette-pulse sakin/hüzünlü sahnede ve üçüncü kez; yüksek sesli efekt sıradan sahnede; slam efektsiz serbest
  const res = await run(fixture({ id: 'fx-chk', n: 90 }));
  const S = res.script.scenes.map((x) => ({ ...x }));
  // sakin/hüzünlü resim sahnesi (yoksa bir resim sahnesi hüzünlü yapılır)
  let sadPic = S.findIndex((x) => x.type === 'photo' && x.mood === 'sad');
  if (sadPic < 0) sadPic = S.findIndex((x, i) => i > 5 && x.type === 'photo');
  S[sadPic] = { ...S[sadPic], mood: 'sad', fx: ['vignette-pulse'] };
  const plainPic = S.findIndex((x, i) => i > 10 && x.type === 'photo' && x.energy === 3 && !['sad', 'calm'].includes(x.mood) && i !== sadPic);
  S[plainPic] = { ...S[plainPic], fx: ['zoom-blur'] };
  const slams = S.map((x, i) => (x.type === 'slam' ? i : -1)).filter((i) => i >= 0);
  for (const i of slams) delete S[i].fx;
  const v = A.checkPlan({ ...res.script, scenes: S }).join('\n');
  assert.match(v, /vignette-pulse yalnızca dread\/tension vuruşunda/);
  assert.match(v, /yüksek sesli efekt zoom-blur vuruş\/zirve dışında/);
  assert.doesNotMatch(v, /slam vuruş efekti yok/, 'efektsiz slam serbest');
  const S2 = res.script.scenes.map((x) => ({ ...x }));
  const imp = S2.map((x, i) => (x.type === 'slam' && ['dread', 'tension'].includes(x.mood) ? i : -1)).filter((i) => i >= 0).slice(0, 3);
  for (const i of imp) S2[i] = { ...S2[i], fx: ['vignette-pulse'] };
  assert.equal(imp.length, 3);
  assert.match(A.checkPlan({ ...res.script, scenes: S2 }).join('\n'), /vignette-pulse 3 > 2/);
});

test('istem: sanat yönetmeni renkli tabanı, tek vurgu bölümünü ve vuruşa bağlı efekti anlatır; kanal geçmişi görünür', () => {
  const s = fixture({ id: 'ist-1' });
  const looks = A.loadCatalogs().looks.filter((l) => l.genres.includes('crime'));
  const history = [{ id: 'h1', genre: 'crime', variant: 'cold-blue-case', baseGrade: 'cool', isLight: false }, { id: 'h2', genre: 'epic', variant: 'bronze-gold', baseGrade: 'warm', isLight: false }];
  const { system, user } = A.artPrompt(s, { looks, allowed: { textStyle: A.REGULAR_TEXT, transition: A.TRANSITIONS, grade: A.GRADES, fx: A.FX_KINDS, counterStyle: A.COUNTER_STYLES }, recent: [], history });
  assert.match(system, /COLOUR FIRST/);
  assert.match(system, /at most ONE chapter/);
  assert.match(system, /never a flash on every slam/);
  assert.match(system, /narration beat/);
  assert.doesNotMatch(system, /shake\/flare\/vignette-pulse/);
  assert.match(user, /base grade warm/);
  assert.match(user, /must use a LIGHT look/);
});

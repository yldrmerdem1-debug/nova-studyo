// Kurgu yönetmeni: modelin önerileri kodla doğrulanır (uydurma alıntı, senaryoda olmayan
// yıl, yanlış fromScene, yakın/aynı tip cihaz reddedilir), anlatım/sıra/süre değişmez,
// plan önbellekten okunur ve kredi yokken iş durmaz. Ağ ve ücretli çağrı YOK: LLM sahte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-director-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');

const D = await import('../src/pipeline/docu-edit-director.js');
const { globalizeRefs } = await import('../src/pipeline/docu-script.js');
const { validateSchema } = await import('../src/structured-output.js');

/* ---------------------------------------------------------------- senaryo */

const filler = (i) => ({ type: 'photo', mood: 'tension', say: `[quietly] Gece boyunca yağmur yağdı, sahne ${i} sessizdi.`, dur: 6, imagePrompt: `Wide shot of rain on a runway, variation ${i}`, source: 'ai', chapter: i < 30 ? 0 : 1 });
function fixture() {
  const scenes = Array.from({ length: 60 }, (_, i) => filler(i));
  scenes[0] = { type: 'montage', mood: 'tension', say: '[whispers] Gece... Yağmur... Açık bir merdiven.', dur: 6, imagePrompts: ['a', 'b', 'c', 'd'], text: 'Gece Yağmur Merdiven', chapter: 0 };
  scenes[1] = { type: 'title', mood: 'tension', say: 'Çözülemeyen tek uçak kaçırma vakası.', dur: 6, title: 'Karanlığa Atlayan Adam', imagePrompt: 'jet', chapter: 0 };
  scenes[2] = { type: 'photo', mood: 'tension', say: 'Kendine Dan Cooper diyen adam bilet aldı.', dur: 6, source: 'archive', search: 'DB Cooper FBI sketch 1971', imagePrompt: 'sketch', name: 'Dan Cooper', role: 'Yolcu', chapter: 0 };
  scenes[4] = { type: 'photo', mood: 'tension', say: 'Beş ay sonra Richard McCoy aynı şeyi denedi.', dur: 6, source: 'archive', search: 'Richard McCoy 1972 portrait', imagePrompt: 'portrait', chapter: 0 };
  scenes[10] = { type: 'words', mood: 'tension', say: '[serious] FBI iki adamı yan yana koydu: Cooper ve McCoy.', dur: 6, text: 'Cooper ve McCoy', keyword: 'McCoy', bg: 'prev', chapter: 0 };
  scenes[14] = { type: 'photo', mood: 'curious', say: "Dava, ajan Ralph Himmelsbach'a verildi.", dur: 6, source: 'archive', search: 'Ralph Himmelsbach FBI agent', imagePrompt: 'agent', chapter: 0 };
  scenes[16] = { type: 'photo', mood: 'curious', say: 'Raporuna şunu yazdı: "Bu adam paraşütçü değildi."', dur: 6, source: 'ai', imagePrompt: 'report on desk', chapter: 0 };
  scenes[17] = { type: 'photo', mood: 'curious', say: 'Yıllar geçti, kimse konuşmadı.', dur: 6, source: 'ai', imagePrompt: 'empty office', chapter: 0 };
  scenes[22] = { type: 'photo', mood: 'curious', say: 'Bin dokuz yüz yetmiş birde kaçırma, bin dokuz yüz seksende kumdaki para, iki bin on altıda dosya kapandı.', dur: 6, source: 'ai', imagePrompt: 'calendar', chapter: 0 };
  scenes[28] = { type: 'photo', mood: 'reveal', say: 'Kumdaki paranın seri numaraları fidye listesiyle eşleşti.', dur: 6, source: 'archive', search: 'Tena Bar money 1980', imagePrompt: 'money in sand', chapter: 0 };
  scenes[34] = { type: 'photo', mood: 'curious', say: "Uçak Seattle'dan Reno'ya doğru uçtu.", dur: 6, source: 'stock', search: 'jet over mountains night', imagePrompt: 'jet', chapter: 1 };
  scenes[40] = { type: 'photo', mood: 'curious', say: 'Bu fotoğraftaki adam, pilot William Rataczak.', dur: 6, source: 'archive', search: 'William Rataczak pilot 1971', imagePrompt: 'pilot', chapter: 1 };
  scenes[46] = { type: 'photo', mood: 'curious', say: 'Soruşturma yıllarca sürdü.', dur: 6, source: 'ai', imagePrompt: 'files', chapter: 1 };
  scenes[52] = { type: 'photo', mood: 'curious', say: 'İki şüpheli, tek bir gece.', dur: 6, source: 'ai', imagePrompt: 'two chairs', chapter: 1 };
  return { id: 't', title: 'D.B. Cooper', genre: 'crime', locale: 'tr-TR', era: '1971', chapters: ['Gece', 'Av'], scenes };
}

const PATCHES = [
  { scene: 10, device: 'board', priority: 1, reason: 'iki şüpheli', items: [{ fromScene: 2, label: 'Dan Cooper' }, { fromScene: 4, label: 'Richard McCoy' }], links: [[0, 1]] },
  { scene: 12, device: 'split', priority: 2, reason: 'çok yakın', left: { fromScene: 2, label: 'Cooper' }, right: { fromScene: 4, label: 'McCoy' } },
  { scene: 16, device: 'quote', priority: 1, reason: 'gerçek alıntı', quote: 'Bu adam paraşütçü değildi', who: 'Ralph Himmelsbach' },
  { scene: 17, device: 'quote', priority: 1, reason: 'uydurma', quote: 'Cooper hâlâ hayatta', who: 'Ralph Himmelsbach' },
  { scene: 22, device: 'timeline', priority: 1, reason: 'yıllar', events: [{ year: 1971, label: 'kaçırma' }, { year: 1980, label: 'kumdaki para' }, { year: 2016, label: 'dosya kapandı' }] },
  { scene: 28, device: 'document', priority: 1, reason: 'kanıt', doc: { kind: 'report', heading: 'FBI', lines: ['Seri numaraları fidye listesiyle eşleşti'] }, highlight: 'fidye listesiyle', stamp: 'GİZLİ' },
  { scene: 34, device: 'map', priority: 1, reason: 'rota', region: 'pacific-northwest', places: [{ label: 'Seattle', lat: 47.45, lon: -122.3 }, { label: 'Reno', lat: 39.5, lon: -119.8 }], route: [0, 1] },
  { scene: 40, device: 'annotate', priority: 2, reason: 'bu adam', label: 'William Rataczak', target: 'the pilot in uniform', atWord: 'pilot' },
  { scene: 46, device: 'timeline', priority: 2, reason: 'uydurma yıl', events: [{ year: 1971, label: 'kaçırma' }, { year: 1975, label: 'yeni ipucu' }, { year: 2016, label: 'dosya kapandı' }] },
  { scene: 2, device: 'quote', priority: 1, reason: 'isim kartı', quote: 'Dan Cooper diyen adam', who: 'Dan Cooper' },
  { scene: 3, device: 'board', priority: 2, reason: 'ileri referans', items: [{ fromScene: 5, label: 'Cooper' }, { label: 'McCoy' }] },
  { scene: 52, device: 'split', priority: 3, reason: 'yanlış kişi', left: { fromScene: 2, label: 'Richard McCoy' }, right: { fromScene: 4, label: 'Richard McCoy' } },
  { scene: 1, device: 'board', priority: 1, reason: 'başlık', items: [{ label: 'Cooper' }, { label: 'McCoy' }] },
];

const mockLlm = (patches, calls) => async (opts) => {
  calls.push(opts);
  assert.equal(opts.model, 'claude-opus-5-5');
  assert.ok(opts.schema === D.PLAN_SCHEMA);
  assert.match(opts.user, /#10 \[b1 01:00\] words/);
  return { patches: structuredClone(patches) };
};

/* ---------------------------------------------------------------- testler */

test('map regions mirror docu-engine/src/geo.ts boxes (projection stays in sync with the renderer)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docu-engine', 'src', 'geo.ts'), 'utf8');
  const boxes = [...src.matchAll(/box:\s*\[([^\]]+)\]/g)].map((m) => m[1].split(',').map(Number));
  const ids = { PNW: 'pacific-northwest', BOSPHORUS: 'bosphorus', ATLANTIC: 'north-atlantic', URALS: 'urals' };
  for (const [konst, id] of Object.entries(ids)) {
    const at = src.indexOf(`const ${konst}`);
    assert.ok(at >= 0, konst);
    const box = src.slice(at).match(/box:\s*\[([^\]]+)\]/)[1].split(',').map(Number);
    assert.deepEqual(D.MAP_REGIONS[id].box, box, id);
  }
  assert.ok(boxes.length >= 6);
  const p = D.regionXY('pacific-northwest', 47.45, -122.3);
  assert.ok(p.x > 0.4 && p.x < 0.45 && p.y > 0.1 && p.y < 0.2, JSON.stringify(p));
});

test('years are read from digits, Turkish words and English words', () => {
  const y = D.yearsIn('[serious] Nisan, bin dört yüz elli iki. Bin dokuz yüz yetmiş birde; iki bin on altıda; 1929 yılında; nineteen seventy-one; eighteen eighty-four');
  for (const v of [1452, 1971, 2016, 1929, 1884]) assert.ok(y.has(v), String(v));
  assert.ok(!D.yearsIn('Belinde iki yüz bin dolar vardı. Yüzde elli.').size, 'amounts are not years');
});

test('director: every proposal is validated in code; say/order/count/chapter/dur never change', async () => {
  const script = fixture();
  const before = structuredClone(script);
  const calls = [];
  const logs = [];
  const r = await D.directEdit(script, { settings: { anthropicKey: 'k' }, usage: {}, logFn: (m) => logs.push(m), llm: mockLlm(PATCHES, calls) });
  assert.equal(calls.length, 1);
  assert.deepEqual(script, before, 'input is not mutated');
  const out = r.script.scenes;
  assert.equal(out.length, before.scenes.length);
  out.forEach((s, i) => {
    assert.equal(s.say, before.scenes[i].say, `say ${i}`);
    assert.equal(s.chapter, before.scenes[i].chapter, `chapter ${i}`);
    assert.equal(s.dur, before.scenes[i].dur, `dur ${i}`);
    assert.equal(s.mood, before.scenes[i].mood, `mood ${i}`);
  });
  const acc = Object.fromEntries(r.changes.map((c) => [c.scene, c.device]));
  assert.deepEqual(acc, { 10: 'board', 16: 'quote', 22: 'timeline', 28: 'document', 34: 'map', 40: 'annotate' });
  const why = Object.fromEntries(r.rejected.map((x) => [x.scene, x.why]));
  assert.match(why[12], /yakın/);
  assert.match(why[17], /aynen geçmiyor/);
  assert.match(why[46], /1975/);
  assert.match(why[2], /isim kartı/);
  assert.match(why[3], /fromScene/);
  assert.match(why[52], /geçersiz/);
  assert.match(why[1], /title/);

  // pano: görseli yok, referansları doğru; eski words alanları atıldı
  assert.deepEqual(out[10].items, [{ label: 'Dan Cooper', fromScene: 2 }, { label: 'Richard McCoy', fromScene: 4 }]);
  for (const k of ['text', 'keyword', 'bg', 'imagePrompt', 'search', 'source']) assert.equal(out[10][k], undefined, k);
  // alıntı: kendi resmini (imagePrompt) korur
  assert.equal(out[16].type, 'quote');
  assert.equal(out[16].imagePrompt, 'report on desk');
  // zaman çizelgesi sıralı, belge vurgusu satırda, harita karede
  assert.deepEqual(out[22].events.map((e) => e.year), [1971, 1980, 2016]);
  assert.equal(out[28].highlight, 'fidye listesiyle');
  assert.equal(out[28].search, undefined, 'a typed document needs no archive search');
  assert.equal(out[34].region, 'pacific-northwest');
  assert.equal(out[34].points.length, 2);
  for (const q of out[34].points) assert.ok(q.x > 0 && q.x < 1 && q.y > 0 && q.y < 1);
  assert.deepEqual(out[34].route, [0, 1]);
  // işaret: foto kalır, hedef yerleşim için saklanır
  assert.equal(out[40].type, 'photo');
  assert.equal(out[40].search, 'William Rataczak pilot 1971');
  assert.equal(out[40].annotate.label, 'William Rataczak');
  assert.equal(out[40].annotate.target, 'the pilot in uniform');
  assert.ok(out[40].annotate.at >= 0);
  assert.ok(logs.some((l) => /Kurgu yönetmeni: 13 öneri, 6 kabul/.test(l)), logs.join('\n'));
});

test('director: spacing, same-type-in-a-row and the per-video budget are enforced', () => {
  const script = fixture();
  // aynı tip art arda: iki alıntı arasında başka cihaz yok
  script.scenes[30] = { ...script.scenes[30], say: 'Himmelsbach bir kez daha yazdı: "Bu adam hayatta kalamazdı."' };
  const r = D.applyPatches(script, [
    { scene: 16, device: 'quote', quote: 'Bu adam paraşütçü değildi', who: 'Ralph Himmelsbach' },
    { scene: 30, device: 'quote', quote: 'Bu adam hayatta kalamazdı', who: 'Himmelsbach' },
  ]);
  assert.deepEqual(r.accepted.map((c) => c.scene), [16]);
  assert.match(r.rejected[0].why, /art arda/);

  // tavan: 60 x 6 sn = 6 dk → en fazla 10 cihaz; 35 sn aralık da ayrıca sınırlar
  assert.equal(D.deviceBudget(360), 10);
  assert.equal(D.deviceBudget(12 * 60), 20);
  const many = [];
  for (let i = 5; i < 60; i += 1) many.push({ scene: i, device: i % 2 ? 'quote' : 'timeline', quote: 'Gece boyunca yağmur yağdı', who: 'Ralph Himmelsbach', events: [{ year: 1971, label: 'kaçırma' }, { year: 1980, label: 'kumdaki para' }, { year: 2016, label: 'dosya kapandı' }] });
  const m = D.applyPatches(script, many);
  assert.ok(m.accepted.length <= 10);
  const t = D.sceneTimes(script).starts;
  const at = m.accepted.map((c) => t[c.scene]).sort((a, b) => a - b);
  for (let k = 1; k < at.length; k++) assert.ok(at[k] - at[k - 1] >= 35, `gap ${at[k] - at[k - 1]}`);
  for (let k = 1; k < m.accepted.length; k++) assert.notEqual(m.accepted[k].device, m.accepted[k - 1].device);
});

test('director: the plan is cached per script hash (never paid twice) and re-applied deterministically', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-director-cache-'));
  const cacheFile = path.join(dir, 'docu-edit-director.json');
  const calls = [];
  const a = await D.directEdit(fixture(), { settings: { anthropicKey: 'k' }, llm: mockLlm(PATCHES, calls), cacheFile });
  const b = await D.directEdit(fixture(), { settings: { anthropicKey: 'k' }, llm: async () => { throw Error('must not be called'); }, cacheFile });
  assert.equal(calls.length, 1);
  assert.ok(b.cached);
  assert.deepEqual(b.script, a.script);
  // senaryo değişince yeni plan istenir
  const changed = fixture();
  changed.scenes[20].say = 'Yeni bir cümle.';
  const c2 = [];
  await D.directEdit(changed, { settings: { anthropicKey: 'k' }, llm: mockLlm([], c2), cacheFile });
  assert.equal(c2.length, 1);
});

test('director: no credit / no key → the job continues with the unchanged script and nothing is cached', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-director-fail-'));
  const cacheFile = path.join(dir, 'docu-edit-director.json');
  const logs = [];
  const script = fixture();
  const r = await D.directEdit(script, {
    settings: { anthropicKey: 'k' }, cacheFile, logFn: (m) => logs.push(m),
    llm: async () => { const e = Error('400 {"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API."}}'); e.status = 400; throw e; },
  });
  assert.equal(r.skipped, 'no-credit');
  assert.deepEqual(r.script, script);
  assert.ok(!fs.existsSync(cacheFile));
  assert.ok(logs.some((l) => /Kurgu yönetmeni atlandı \(Anthropic kredisi yok\)/.test(l)));
  // anahtar yok: gerçek callJSON çağrılmaz (ağ yasak), iş sürer
  const n = await D.directEdit(script, { settings: {}, cacheFile });
  assert.equal(n.skipped, 'no-key');
  // iptal ise yutulmaz
  await assert.rejects(D.directEdit(script, { settings: { anthropicKey: 'k' }, llm: async () => { throw Error('cancelled'); } }), /cancelled/);
});

test('plan schema accepts the documented patch shape (structured output contract)', () => {
  assert.deepEqual(validateSchema({ patches: PATCHES.map((p) => ({ ...p })) }, D.PLAN_SCHEMA), []);
  assert.ok(validateSchema({ patches: [{ scene: 1, device: 'hologram', priority: 1, reason: '' }] }, D.PLAN_SCHEMA).length);
});

test("writer devices: chapter-local fromScene becomes global; a writer map's lat/lon becomes frame x/y; an invented quote falls back to a photo", () => {
  const g = globalizeRefs({ type: 'board', items: [{ label: 'A', fromScene: 1 }, { label: 'B', fromScene: 5 }] }, 40, 3);
  assert.deepEqual(g.items, [{ label: 'A', fromScene: 41 }, { label: 'B' }]);
  assert.deepEqual(globalizeRefs({ type: 'photo', fromScene: 1 }, 40, 3), { type: 'photo', fromScene: 1 }, 'non-device scenes untouched');

  const script = fixture();
  script.scenes[34] = { ...script.scenes[34], type: 'map', region: 'pacific-northwest', places: [{ label: 'Seattle', lat: 47.45, lon: -122.3 }, { label: 'Reno', lat: 39.5, lon: -119.8 }], route: [0, 1] };
  script.scenes[17] = { ...script.scenes[17], type: 'quote', quote: 'Cooper hâlâ hayatta', who: 'Ralph Himmelsbach' };
  script.scenes[40] = { ...script.scenes[40], annotate: { label: 'Rataczak', target: 'the pilot' } };
  const logs = [];
  const r = D.sanitizeDevices(script, { logFn: (m) => logs.push(m) });
  const s = r.script.scenes;
  assert.equal(s[34].type, 'map');
  assert.equal(s[34].places, undefined);
  assert.equal(s[34].points.length, 2);
  assert.equal(s[34].imagePrompt, undefined, 'a map needs no generated picture');
  assert.equal(s[17].type, 'photo');
  assert.equal(s[17].quote, undefined);
  assert.equal(s[17].imagePrompt, 'empty office');
  assert.equal(s[40].annotate.target, 'the pilot');
  assert.equal(r.fixed.length, 1);
  assert.ok(logs.some((l) => /quote cihazı geçersiz/.test(l)));
});

test('hand-written seed scripts pass through unchanged (their headline/map scenes stay as authored)', () => {
  const dir = path.join(ROOT, 'docu-engine', 'videos', 'long');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const r = D.sanitizeDevices(s);
    assert.equal(r.fixed.length, 0, f);
    assert.deepEqual(r.script.scenes.map((x) => x.type), s.scenes.map((x) => x.type), f);
  }
});

/* ------------------------------------------------------------ infografikler */

/** Tek sahnelik yama: 6 sn'lik dolgu sahnelerinin arasında aralık ve tavan kuralı sorun çıkarmaz. */
function infoScript(say, { locale = 'tr-TR', at = 20, prev = null } = {}) {
  const s = fixture();
  s.locale = locale;
  s.scenes[at] = { ...s.scenes[at], say };
  if (prev) s.scenes[at - 1] = { ...s.scenes[at - 1], say: prev };
  return s;
}
const one = (script, patch, at = 20) => D.applyPatches(script, [{ scene: at, priority: 1, reason: 'veri', ...patch }]);

test('numbers are read from digits, multipliers and spoken words (en + tr)', () => {
  const en = D.numbersIn('They found $5,800 of a $200,000 ransom; nine out of ten died; 13.8 billion; two hundred thousand dollars; up 38%.', 'en');
  for (const v of [5800, 200000, 9, 10, 13.8, 13.8e9, 38]) assert.ok(D.spokenHas(en, v), String(v));
  assert.ok(!D.spokenHas(D.numbersIn('He waited on the shore.', 'en'), 10), '"on" is not ten in English');
  const tr = D.numbersIn('Onda dokuzu öldü. Yüzde elli. İki yüz bin dolar. 13,8 milyar; 5.800 dolar bulundu.', 'tr');
  for (const v of [10, 9, 50, 200000, 13.8, 13.8e9, 5800]) assert.ok(D.spokenHas(tr, v), String(v));
  assert.ok(!D.spokenHas(tr, 100), '"yüzde" is a percent sign, not a hundred');
  assert.ok(!D.spokenHas(D.numbersIn('Uçak kalktı, altında bekleyenler vardı.', 'tr'), 3), '"uçak" is not "üç"');
});

test('infographics: every device type is offered to the model and in the schema', async () => {
  for (const t of ['bars', 'donut', 'icons', 'scale', 'flow', 'stat']) {
    assert.ok(D.DEVICES.includes(t), t);
    assert.ok(D.PLAN_SCHEMA.properties.patches.items.properties.device.enum.includes(t), t);
  }
  const patches = [
    { scene: 20, device: 'bars', priority: 1, reason: 'r', items: [{ label: 'Fidye', value: 200000 }, { label: 'Bulunan', value: 5800 }], unit: '$', highlightIndex: 0, sort: true, title: 'Para' },
    { scene: 21, device: 'donut', priority: 1, reason: 'r', slices: [{ label: 'Ölen', value: 1517 }, { label: 'Kurtulan', value: 706 }], highlightIndex: 0, centerLabel: '2.223' },
    { scene: 22, device: 'icons', priority: 1, reason: 'r', total: 10, filled: 9, icon: 'person', label: 'yolcu' },
    { scene: 23, device: 'scale', priority: 1, reason: 'r', a: { label: 'bulunan', value: 5800 }, b: { label: 'fidye', value: 200000 }, unit: '$' },
    { scene: 24, device: 'flow', priority: 1, reason: 'r', nodes: [{ id: 'a', label: 'Banka' }, { id: 'b', label: 'Cooper' }, { id: 'c', label: 'Nehir' }], edges: [['a', 'b', '$200,000'], ['b', 'c']] },
    { scene: 25, device: 'stat', priority: 1, reason: 'r', value: '$5,800', label: 'bulundu', sub: 'geri kalanı yok', trend: 'down' },
  ];
  assert.deepEqual(validateSchema({ patches }, D.PLAN_SCHEMA), []);
  assert.ok(validateSchema({ patches: [{ ...patches[2], icon: 'dragon' }] }, D.PLAN_SCHEMA).length, 'unknown icon rejected by the schema');
  // The menu the model reads names every type with its fields; a number moment is flagged in the listing.
  let seen = null;
  const s = fixture();
  s.scenes[20] = { ...s.scenes[20], say: 'Fidye 200.000 dolardı; bulunan 5.800 dolar.' };
  await D.directEdit(s, { settings: { anthropicKey: 'k' }, llm: async (o) => { seen = o; return { patches: [] }; } });
  for (const k of ['- bars:', '- donut:', '- icons:', '- scale:', '- flow:', '- stat:', 'highlightIndex', 'centerLabel', 'edges[[from, to, label?]]', 'UYDURMA']) assert.ok(seen.system.includes(k), k);
  assert.match(seen.user, /#20 [^\n]*\{[^}]*sayı[^}]*\}/);
});

test('infographics: bars built from the narration (exact field format, picture fields dropped)', () => {
  const script = infoScript('Fidye 200.000 dolardı; nehir kıyısında yalnızca 5.800 dolar bulundu, ödül ise 25.000 dolardı.');
  const r = one(script, { device: 'bars', items: [{ label: 'Fidye', value: 200000 }, { label: 'Nehir kıyısında bulunan', value: 5800 }, { label: 'Ödül', value: 25000, color: '#ff0000' }], unit: '$', highlightIndex: 1, sort: true, title: 'Para izi' });
  assert.deepEqual(r.accepted.map((c) => c.device), ['bars'], JSON.stringify(r.rejected));
  const s = r.scenes[20];
  assert.equal(s.type, 'bars');
  assert.deepEqual(s.items, [{ label: 'Fidye', value: 200000 }, { label: 'Nehir kıyısında bulunan', value: 5800 }, { label: 'Ödül', value: 25000, color: '#ff0000' }]);
  assert.equal(s.unit, '$');
  assert.equal(s.highlight, 1);
  assert.equal(s.sort, true);
  assert.equal(s.title, 'Para izi');
  assert.equal(s.highlightIndex, undefined, 'the patch name never reaches the scene');
  for (const k of ['imagePrompt', 'source', 'search']) assert.equal(s[k], undefined, k);
  assert.equal(s.say, script.scenes[20].say);
  assert.equal(s.dur, script.scenes[20].dur);
});

test('infographics: invented numbers and labels are rejected', () => {
  const script = infoScript('Fidye 200.000 dolardı; nehir kıyısında yalnızca 5.800 dolar bulundu.');
  const why = (patch) => one(script, patch).rejected[0]?.why ?? 'KABUL';
  assert.match(why({ device: 'bars', items: [{ label: 'Fidye', value: 200000 }, { label: 'Bulunan', value: 6000 }] }), /6000.*uydurma/);
  assert.match(why({ device: 'bars', items: [{ label: 'Fidye', value: 200000 }, { label: 'Vergi kaçağı', value: 5800 }] }), /Vergi kaçağı/);
  assert.match(why({ device: 'scale', a: { label: 'bulunan', value: 5800 }, b: { label: 'fidye', value: 250000 } }), /250000/);
  assert.match(why({ device: 'stat', value: '$7,500', label: 'bulundu' }), /uydurma/);
  assert.match(why({ device: 'icons', total: 10, filled: 3, icon: 'coin', label: 'bulundu' }), /uydurma/);
  assert.match(why({ device: 'donut', slices: [{ label: 'Fidye', value: 200000 }, { label: 'Bulunan', value: 1234 }, { label: 'Nehir', value: 999 }] }), /uydurma/);
  assert.match(why({ device: 'stat', value: '$5,800', label: 'bulundu', sub: 'Bankada 12 milyon dolar vardı' }), /alt satır/);
  assert.match(why({ device: 'bars', items: [{ label: 'Fidye', value: 200000 }, { label: 'Bulunan', value: 5800 }], title: '1971 soygunu' }), /başlıktaki sayı/);
  assert.match(why({ device: 'icons', total: 10, filled: 9, icon: 'dragon', label: 'bulundu' }), /icon/);
  assert.equal(why({ device: 'stat', value: '$5,800', label: 'nehir kıyısında bulundu', trend: 'down' }), 'KABUL');
});

test('infographics: shares, pictograms, scale and flow — spoken forms, complements, structure', () => {
  // donut: one unspoken slice allowed only as the rest of a spoken total (2.223 − 1.517 = 706).
  const d = infoScript('Gemideki 2.223 kişiden 1.517 kişi öldü; kalanlar kurtuldu.');
  let r = one(d, { device: 'donut', slices: [{ label: 'Öldü', value: 1517 }, { label: 'Kurtuldu', value: 706 }], highlightIndex: 0, centerLabel: '2.223 kişi' });
  assert.deepEqual(r.accepted.map((c) => c.device), ['donut'], JSON.stringify(r.rejected));
  assert.deepEqual(r.scenes[20].slices, [{ label: 'Öldü', value: 1517 }, { label: 'Kurtuldu', value: 706 }]);
  assert.equal(r.scenes[20].centerLabel, '2.223 kişi');
  assert.equal(r.scenes[20].highlight, 0);

  // icons: English words ("nine out of ten") and a percentage ("90 percent" -> 9 of 10).
  const en = infoScript('Nine out of ten passengers in third class never came home.', { locale: 'en-US' });
  r = one(en, { device: 'icons', total: 10, filled: 9, icon: 'person', label: 'passengers never came home' });
  assert.deepEqual(r.scenes[20].type === 'icons' && [r.scenes[20].total, r.scenes[20].filled, r.scenes[20].icon, r.scenes[20].label], [10, 9, 'person', 'passengers never came home']);
  const pct = infoScript('About 90 percent of the passengers in third class never came home.', { locale: 'en-US' });
  assert.equal(one(pct, { device: 'icons', total: 10, filled: 9, icon: 'person', label: 'passengers never came home' }).accepted.length, 1);
  assert.equal(one(pct, { device: 'icons', total: 30, filled: 27, icon: 'person', label: 'passengers never came home' }).accepted.length, 0, '90% is 9 of 10, not an invented 27 of 30');

  // scale: needs a real difference.
  const sc = infoScript('Fidye 200.000 dolardı; bulunan yalnızca 5.800 dolar. Ödül 150.000 dolardı.');
  assert.equal(one(sc, { device: 'scale', a: { label: 'bulunan', value: 5800 }, b: { label: 'fidye', value: 200000 }, unit: '$' }).scenes[20].type, 'scale');
  assert.match(one(sc, { device: 'scale', a: { label: 'ödül', value: 150000 }, b: { label: 'fidye', value: 200000 } }).rejected[0].why, /ölçek farkı/);

  // flow: ids, edges, labels from the narration; unknown ids and dangling nodes rejected.
  const fl = infoScript('Havayolu parayı bankaya yolladı, banka 200.000 doları Cooper\'a verdi, Cooper nehir üzerinde atladı.');
  const nodes = [{ id: 'h', label: 'Havayolu' }, { id: 'b', label: 'Banka' }, { id: 'c', label: 'Cooper' }, { id: 'n', label: 'Nehir' }];
  r = one(fl, { device: 'flow', nodes, edges: [['h', 'b'], ['b', 'c', '$200,000'], ['c', 'n', 'atladı']], title: 'Para izi' });
  assert.deepEqual(r.scenes[20].edges, [['h', 'b'], ['b', 'c', '$200,000'], ['c', 'n', 'atladı']], JSON.stringify(r.rejected));
  assert.deepEqual(r.scenes[20].nodes, nodes);
  assert.match(one(fl, { device: 'flow', nodes, edges: [['h', 'b'], ['b', 'x']] }).rejected[0].why, /kenarı geçersiz/);
  assert.match(one(fl, { device: 'flow', nodes, edges: [['h', 'b'], ['b', 'c']] }).rejected[0].why, /bağlantısız/);
  assert.match(one(fl, { device: 'flow', nodes, edges: [['h', 'b'], ['b', 'c', '$300,000'], ['c', 'n']] }).rejected[0].why, /ok etiketi/);
});

test('infographics: numbers may come from the neighbouring line; a writer\'s invented infographic falls back', () => {
  const s = infoScript('Ve sonuçta yalnızca bu kadarı bulundu.', { prev: 'Fidye 200.000 dolardı, nehirde 5.800 dolar çıktı.' });
  assert.equal(one(s, { device: 'stat', value: '$5,800', label: 'bulundu' }).accepted.length, 1);
  // sanitizeDevices: the writer's own infographic scenes are validated the same way.
  const w = fixture();
  w.scenes[20] = { ...w.scenes[20], type: 'stat', value: '$9,999', label: 'bulundu', say: 'Nehirde 5.800 dolar bulundu.' };
  w.scenes[26] = { ...w.scenes[26], type: 'bars', items: [{ label: 'Fidye', value: 200000 }, { label: 'Bulunan', value: 5800 }], unit: '$', highlight: 1, say: 'Fidye 200.000 dolardı, bulunan 5.800.' };
  const logs = [];
  const out = D.sanitizeDevices(w, { logFn: (m) => logs.push(m) });
  assert.equal(out.script.scenes[20].type, 'photo', 'invented stat -> the scene keeps its picture');
  assert.equal(out.script.scenes[20].value, undefined);
  assert.equal(out.script.scenes[26].type, 'bars');
  assert.equal(out.script.scenes[26].highlight, 1, 'an index highlight survives the round trip');
  assert.ok(logs.some((l) => /stat cihazı geçersiz/.test(l)));
});

test('infographics count as devices: spacing and same-type rules apply', () => {
  const s = fixture();
  s.scenes[20] = { ...s.scenes[20], say: 'Fidye 200.000 dolardı; bulunan 5.800 dolar.' };
  s.scenes[21] = { ...s.scenes[21], say: 'Ödül 25.000, maaş 13.500 dolardı.' };
  s.scenes[40] = { ...s.scenes[40], say: 'Bir başka fidye 50.000 dolardı; bulunan 1.000 dolar.' };
  const r = D.applyPatches(s, [
    { scene: 20, device: 'bars', items: [{ label: 'Fidye', value: 200000 }, { label: 'Bulunan', value: 5800 }] },
    { scene: 21, device: 'bars', items: [{ label: 'Ödül', value: 25000 }, { label: 'Maaş', value: 13500 }] },
    { scene: 40, device: 'stat', value: '$50,000', label: 'fidye' },
  ]);
  assert.deepEqual(r.accepted.map((c) => c.scene), [20, 40]);
  assert.match(r.rejected[0].why, /yakın/);
  assert.equal(D.deviceOf({ type: 'donut' }), 'donut');
});

test('annotate marks are located on the chosen archive photo (mocked vision), cached, and dropped when not found or not real', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-annotate-'));
  const pub = path.join(dir, 'public');
  fs.mkdirSync(path.join(pub, 'build'), { recursive: true });
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1600x1000', '-frames:v', '1', path.join(pub, 'build', 'a.jpg')]);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'smptebars=size=1200x800', '-frames:v', '1', path.join(pub, 'build', 'b.jpg')]);
  const script = {
    id: 't', scenes: [
      { type: 'photo', say: 'Bu adam pilot.', image: 'build/a.jpg', archived: true, annotate: { label: 'pilot', target: 'the pilot' } },
      { type: 'photo', say: 'Bu da yardımcı pilot.', image: 'build/b.jpg', archived: true, annotate: { label: 'yardımcı pilot', target: 'the co-pilot' } },
      { type: 'photo', say: 'AI sahnesi.', imagePrompt: 'x', annotate: { label: 'adam', target: 'the man' } },
    ],
  };
  const calls = [];
  const vision = async (o) => {
    calls.push(o);
    assert.equal(o.images.length, 2);
    assert.equal(o.model, 'claude-sonnet-5-5');
    return { marks: [{ n: 1, found: true, x: 0.4, y: 0.3, r: 0.1 }, { n: 2, found: false, x: 0, y: 0, r: 0 }] };
  };
  const cacheFile = path.join(dir, 'ann.json');
  const r = await D.placeAnnotations(script, { publicDir: pub, cacheFile, settings: { ffmpegPath: FFMPEG }, llm: vision, ffmpeg: FFMPEG });
  assert.equal(calls.length, 1);
  assert.deepEqual(r.script.scenes[0].annotate, { label: 'pilot', x: 0.4, y: 0.3, r: 0.1 });
  assert.deepEqual(r.script.scenes[0].focus, [0.4, 0.3]);
  assert.equal(r.script.scenes[1].annotate, undefined, 'not found → no blind circle');
  assert.equal(r.script.scenes[2].annotate, undefined, 'AI picture → no annotation');
  const again = await D.placeAnnotations(script, { publicDir: pub, cacheFile, settings: {}, llm: async () => { throw Error('no second call'); }, ffmpeg: FFMPEG });
  assert.deepEqual(again.script.scenes[0].annotate, r.script.scenes[0].annotate);
  // görme çağrısı başarısız: işaretler kaldırılır, hata fırlatılmaz
  const fresh = await D.placeAnnotations(script, { publicDir: pub, settings: { ffmpegPath: FFMPEG }, llm: async () => { throw Error('credit balance is too low'); }, ffmpeg: FFMPEG });
  assert.ok(fresh.script.scenes.every((s) => !s.annotate));
});

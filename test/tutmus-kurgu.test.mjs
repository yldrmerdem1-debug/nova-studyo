// 1.16.16 — TUTMUŞ KANALLARIN KURGUSU (14 Ekim 2026): 21 tutmuş videonun ilk dakikası kare kare ve 38 transkript.
// Dünya haritası (her ülke, Natural Earth), harita güvencesi, anlatım temposu (uzun duraklar + en çok 1.15x),
// sesten uzun sahnelerin kısalması, bilgisiz yankı yazısının seyrekleşmesi, kurgu karnesi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = await import('../docu-engine/lib/world-map.mjs');
const P = await import('../docu-engine/lib/pace.mjs');
const G = await import('../docu-engine/lib/edit-grammar.mjs');
const E = await import('../docu-engine/lib/edit-scorecard.mjs');
const D = await import('../src/pipeline/docu-edit-director.js');
const L = await import('../src/pipeline/growth-lessons.js');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('dünya haritası: çerçeve 16:9 gerçek şekil, yerler içeride; kıyı, sınır ve boyalı ülke kutuya kırpılır', () => {
  const box = W.worldBox([{ lat: 15.35, lon: 44.2 }, { lat: 24.7, lon: 46.7 }]);
  const [w, s, e, n] = box;
  const c = Math.cos((((s + n) / 2) * Math.PI) / 180);
  assert.ok(Math.abs(((e - w) * c) / (n - s) - 16 / 9) < 0.02, 'gerçek şekil 16:9');
  for (const [lat, lon] of [[15.35, 44.2], [24.7, 46.7]]) {
    const p = W.worldXY(box, lat, lon);
    assert.ok(p.x > 0.1 && p.x < 0.9 && p.y > 0.1 && p.y < 0.9, JSON.stringify(p));
  }
  const g = W.worldGeometry(box, { highlight: ['Yemen', 'Saudi Arabia', 'Atlantis'] });
  assert.ok(g.land.length > 3 && g.borders.length > 3);
  assert.ok(g.fills.length >= 2, 'iki ülke boyandı, bilinmeyen ad atlandı');
  assert.deepEqual(g.labels.map((l) => l.text).sort(), ['SAUDI ARABIA', 'YEMEN']);
  const pad = (e - w) * 0.05;
  for (const ring of g.land) for (const [x, y] of ring) assert.ok(x >= w - pad && x <= e + pad && y >= s - 2 && y <= n + 2, 'kırpılmış');
  // küçük kutu (Hastings): 10m veri, yine de hafif
  const g2 = W.worldGeometry(W.worldBox([{ lat: 50.91, lon: 0.49 }]), { highlight: ['England'] });
  assert.ok(g2.fills.length >= 1 && JSON.stringify(g2).length < 400_000);
});

test('dünya haritası: tarih çizgisini geçen ülke (Rusya) doğru merkez; kutu 180°yi aşınca kopya dünya çizilir', () => {
  const c = W.countryCenter('Russia');
  assert.ok(c.lon > 60 && c.lon < 140, JSON.stringify(c));
  const box = W.worldBox([{ lat: 0, lon: 170 }, { lat: 0, lon: -170 }]);
  assert.ok(box[2] - box[0] < 120, 'tarih çizgisi üzerinden ölçülür');
  assert.ok(W.worldGeometry(box).land.length > 0);
});

test('ülke adları: yalnızca özel ad olarak; ad/kelime tuzağı yok', () => {
  const f = (t) => W.countriesIn(t).map((x) => x.country);
  assert.deepEqual(f('The Houthis in Yemen fired at Saudi Arabia and the UK sent ships.'), ['Yemen', 'Saudi Arabia', 'United Kingdom']);
  assert.deepEqual(f('Michael Jordan ate turkey with Chad.'), []);
  assert.deepEqual(f('Budapest, Hungary. The Soviet Union sent tanks.'), ['Hungary', 'Russia']);
  assert.deepEqual(f('LET US GO'), []);
  assert.deepEqual(f('the US Navy'), ['United States of America']);
  assert.deepEqual(f('South Sudan, not Sudan'), ['S. Sudan', 'Sudan']);
});

test('harita etiketi pinin üstüne binmez (Macaristan: HUN◉HUNGARY)', () => {
  const box = W.worldBox([{ lat: 47.16, lon: 19.49 }]);
  const pt = { label: 'Hungary', ...W.worldXY(box, 47.16, 19.49) };
  const s = W.attachWorldMaps({ scenes: [{ type: 'map', region: 'world', box, points: [pt], countries: ['Hungary'] }] }).scenes[0];
  assert.ok(s.geo.fills.length >= 1);
  assert.equal(s.geo.labels.length, 0);
  assert.ok(s.geo.graticule > 0);
});

const sc = (type, say, o = {}) => ({ type, say, chapter: 0, dur: 4, mood: 'curious', imagePrompt: 'a picture', ...o });

test('yazarın haritası: bölgesiz ya da sığmayan yerler dünya haritası olur; anlatımda geçmeyen yer düşer, harita kalır', () => {
  const script = {
    locale: 'en-US',
    scenes: [
      sc('photo', 'It began at night.'),
      sc('photo', 'The strikes hit Sanaa airport.'),
      sc('map', 'Missiles flew from Sanaa toward Jizan.', { places: [{ label: 'Sanaa', lat: 15.37, lon: 44.19 }, { label: 'Jizan', lat: 16.89, lon: 42.55 }, { label: 'Hodeidah', lat: 14.8, lon: 42.95 }], route: [0, 1], focus: 1, countries: ['Yemen', 'Narnia'] }),
      sc('map', 'Old map in the Bosphorus region at Istanbul.', { region: 'bosphorus', places: [{ label: 'Istanbul', lat: 41.01, lon: 28.98 }] }),
    ],
  };
  const out = D.sanitizeDevices(script).script.scenes;
  const m = out[2];
  assert.equal(m.type, 'map');
  assert.equal(m.region, 'world');
  assert.equal(m.box.length, 4);
  assert.deepEqual(m.points.map((p) => p.label), ['Sanaa', 'Jizan'], 'Hodeidah anlatımda yok: düştü');
  assert.deepEqual(m.route, [0, 1]);
  assert.equal(m.focus, 1);
  assert.equal(m.countries, undefined, 'anlatımda geçmeyen ülke boyanmaz');
  assert.equal(out[3].type, 'map');
});

test('harita güvencesi: harita yoksa ülke adı geçen sade sahne dünya haritasına döner; kanca ve isim kartı değil', () => {
  const scenes = [sc('photo', 'Hungary, 1956. A whole country held its breath.')];
  for (let i = 0; i < 40; i++) scenes.push(sc('photo', `Line ${i} about students and the radio building downtown.`, { dur: 5 }));
  scenes[6] = sc('photo', 'Imre Nagy spoke for Hungary that night.', { name: 'Imre Nagy' });
  scenes[8] = sc('photo', 'Soviet troops still stood in Hungary, by treaty.', { dur: 5 });
  scenes[30] = sc('words', 'Two hundred thousand people fled to Austria.', { text: 'fled to Austria' });
  const r = D.ensureMaps({ locale: 'en-US', scenes });
  assert.equal(r.script.scenes[0].type, 'photo', 'kanca dokunulmaz');
  assert.equal(r.script.scenes[6].type, 'photo', 'isim kartı dokunulmaz');
  const maps = r.script.scenes.filter((s) => s.type === 'map');
  assert.ok(maps.length >= 2, JSON.stringify(r.added));
  const hu = r.script.scenes[8];
  assert.equal(hu.type, 'map');
  assert.equal(hu.region, 'world');
  assert.deepEqual(hu.countries, ['Hungary']);
  assert.equal(hu.imagePrompt, undefined, 'görsel alanları atıldı');
  // iki harita zaten varsa dokunmaz
  const again = D.ensureMaps(r.script);
  assert.equal(again.added.length, 0);
});

test('tempo planı: uzun durak kısalır, baş/son sessizlik kırpılır, yavaş okuma en çok 1.15x; yavaş yönlendirme hızlanmaz', () => {
  const silences = P.parseSilences('[silencedetect] silence_start: 0\n[silencedetect] silence_end: 0.3\nsilence_start: 2.1\nsilence_end: 3.0\nsilence_start: 5.6', 6.0);
  assert.deepEqual(silences, [[0, 0.3], [2.1, 3.0], [5.6, 6.0]]);
  const text = 'Celeste Saulo, in Geneva on 3 September. She even added: literally.';
  const plan = P.pacePlan({ silences, dur: 6.0, text });
  assert.equal(plan.cuts.length, 3);
  const removed = plan.cuts.reduce((n, [a, b]) => n + (b - a), 0);
  assert.ok(Math.abs(removed - (0.25 + 0.6 + 0.32)) < 0.02, String(removed));
  assert.ok(plan.tempo > 1 && plan.tempo <= 1.15);
  assert.ok(plan.wpmAfter > plan.wpmBefore);
  // kelime zamanları sesle kayar
  const words = [{ word: 'Celeste', t: 0.3 }, { word: 'She', t: 3.0 }];
  const moved = P.paceWords(plan, words);
  assert.ok(Math.abs(moved[0].t - 0.05 / plan.tempo) < 0.01);
  assert.ok(Math.abs(moved[1].t - (3.0 - 0.25 - 0.6) / plan.tempo) < 0.01);
  assert.match(P.paceFilter(plan), /^aselect='not\(between\(t,[\d.]+,[\d.]+\)(\+between\(t,[\d.]+,[\d.]+\))*\)',asetpts=N\/SR\/TB,atempo=1\.\d+$/);
  // yavaş yönlendirme: durak 0.6 sn kalır, hız yok
  const slow = P.pacePlan({ silences, dur: 6.0, text: '[slowly, with weight] ' + text });
  assert.equal(slow.tempo, 1);
  // zaten hızlı satır: değişmez
  const fast = P.pacePlan({ silences: [], dur: 2.5, text: 'One two three four five six seven eight nine ten' });
  assert.ok(P.paceIdentity(fast));
});

test('ölü süre: sade sahne sesiyle biter; tutulan çekim, sayaç ve nefes kendi süresinde', () => {
  const s = [
    { type: 'photo', dur: 6, voiceDur: 3 },
    { type: 'photo', dur: 6, voiceDur: 3, pace: 'hold' },
    { type: 'counter', dur: 6, voiceDur: 3 },
    { type: 'words', dur: 2, voiceDur: 3 },
  ];
  const r = G.tightenToVoice({ scenes: s });
  assert.equal(r.scenes, 1);
  assert.equal(s[0].dur, 3.4);
  assert.equal(s[1].dur, 6);
  assert.equal(s[2].dur, 6);
  assert.equal(s[3].dur, 2);
  assert.equal(G.breathAfter({ type: 'photo', chapter: 0 }, { type: 'photo', chapter: 1 }), 1.4, 'bölüm sonu nefesi kalır');
  assert.equal(G.breathAfter({ type: 'counter', chapter: 0 }, { type: 'photo', chapter: 0 }), 0.7);
});

test('kurgu karnesi: eski El Niño ölçüleri hedef dışı, tutmuş ölçüler temiz', () => {
  const old = { scenes: [] };
  for (let i = 0; i < 30; i++) old.scenes.push({ type: i % 3 ? 'photo' : 'words', say: 'one two three four five six seven', dur: 4, voiceDur: 3, fit: i % 5 ? 'cover' : 'contain' });
  const a = E.editScorecard(old);
  assert.ok(a.wpm < 140 && a.maps === 0 && a.text > 0.15);
  assert.match(E.scorecardLine(a), /hedef dışı: tempo .* harita 0 .* yazı kartı/);
  const good = { scenes: [] };
  // 1.16.16 narration voice: outlier-like sentences (13 words) that talk to the viewer.
  for (let i = 0; i < 30; i++) good.scenes.push({ type: i % 10 === 0 ? 'map' : 'photo', say: 'If you know these ships, you know they were never meant to be heroes.', dur: 4.6, voiceDur: 4.2, fit: 'cover' });
  assert.match(E.scorecardLine(E.editScorecard(good)), /tutmuş kanalların ölçülerinde/);
});

test('yazar, yönetmen ve motor 1.16.16 kurallarını taşır', () => {
  const lines = L.editGrowthLines().join('\n');
  for (const k of ['HARİTA', 'EKRAN YAZISI BİLGİDİR', 'TEK GRAFİKTE', 'BÖLÜM BAŞLIĞI SOMUT', '165']) assert.ok(lines.includes(k), k);
  const script = read('src', 'pipeline', 'docu-script.js');
  assert.match(script, /WRITER_MAP_REGIONS = \["world"/);
  assert.ok(D.MAP_CHOICES.includes('world'));
  const produce = read('docu-engine', 'lib', 'produce.mjs');
  for (const k of ['attachWorldMaps(script', 'paceOf(l, meta)', 'tightenToVoice(script)', 'scorecardLine(editScorecard(']) assert.ok(produce.includes(k), k);
  assert.match(read('src', 'pipeline', 'docu.js'), /ensureMaps\(directed/);
  // "Haritalı anlatım" Epik Tarih'in sekmesi (kanal sahibi: "sadece haritalı videolar tuhaf olabilir"): harita
  // baskısı ve harita güvencesi yalnızca o sekmede; diğer videolarda harita yalnızca yer hikâyenin parçasıysa.
  assert.ok(L.editGrowthLines({ maps: true }).join('\n').includes('İlk 90 saniyede'));
  assert.ok(!L.editGrowthLines().join('\n').includes('İlk 90 saniyede'));
  assert.match(read('src', 'pipeline', 'docu.js'), /if \(job\.docuMapMode === "haritali"\) directed = ensureMaps/);
  assert.match(read('src', 'pipeline', 'index.js'), /body\.docuMapMode === "haritali"\) job\.docuMapMode = "haritali"/);
  assert.match(script, /job\.docuMapMode === "haritali" \? \{ maps: true \}/);
  assert.match(script, /editGrowthLines\(\{ maps: !!plan\.maps \}\)/);
  const app = read('public', 'app.js');
  assert.match(app, /stilSecili\("epic"\) \? seg\("Tarih sekmesi"/);
  assert.match(app, /SON GÜNCELLEME/);
  assert.match(read('public', 'production-modes.js'), /'docuMapMode'/);
  assert.match(read('docu-engine', 'src', 'geo.ts'), /export function regionOf/);
  assert.match(read('docu-engine', 'src', 'map.tsx'), /regionOf\(scene\)/);
  assert.ok(fs.existsSync(path.join(ROOT, 'docu-engine', 'lib', 'data', 'countries-50m.json')));
  assert.ok(fs.existsSync(path.join(ROOT, 'docu-engine', 'lib', 'data', 'countries-10m.json')));
});

test("Shorts etiketleri: yalnızca bu Short'un adları (El Niño Short'u veba videosunun #dnasequencing #blackdeath etiketiyle çıktı)", () => {
  const tags = L.shortHashtags({ tags: ["ElNino", "dnasequencing", "#WMO", "blackdeath"], title: "Super El Niño: Why Off the Charts", description: "The WMO calls this El Niño off the charts.", niche: "news" });
  assert.deepEqual(tags, ["#shorts", "#news", "#ElNino", "#WMO"]);
  for (const f of ["docu-shorts.js", "docu-shorts-pictures.js"]) assert.ok(read("src", "pipeline", f).includes('hashtags: { type: "array"'), f);
  assert.ok(read("src", "pipeline", "docu-shorts.js").includes("hashtags: tags, description: [plan.description, credits, tags.join"));
});

test("kendi kanal verimiz paket istemine girer; 14 dakikayı aşan film karnede hedef dışı", () => {
  const line = L.ownDataLines()[0];
  assert.ok(line.includes("Panama") && line.includes("4.9%") && line.includes("0.8%"));
  assert.ok(read("src", "pipeline", "docu-package.js").includes("${ownDataLines()[0]}"));
  const long = { scenes: Array.from({ length: 200 }, () => ({ type: "photo", say: "one two three four five six seven eight nine ten eleven", dur: 5, voiceDur: 4.6 })) };
  assert.ok(E.scorecardLine(E.editScorecard(long)).includes("dk (hedef 11-14)"));
});

test('kapak: konu tek başına anlaşılır + tek merak; şifreli parça yasak (Suudi: "NO. THEN: WE MAY" 14 izlenme, "IRAN–USA WAR / WHY SAUDI?" 172k)', () => {
  const pkg = read('src', 'pipeline', 'docu-package.js');
  assert.ok(pkg.includes('make the SUBJECT recognisable on their own AND add one curiosity'));
  assert.ok(pkg.includes('never cryptic fragments'));
  assert.ok(pkg.includes('SMALL-CHANNEL BREAKOUTS'));
  assert.ok(!pkg.includes("never repeat the title's words"));
});

test('kapak sahneleri: tarif kutuya yazılır, kutudaki 01/02 sahnesi kapak adayı olur, OpenAI kredisi varsa hemen çizilir', async () => {
  const S = await import('../src/pipeline/thumb-scenes.js');
  const P = await import('../src/pipeline/docu-package.js');
  const os = await import('node:os');
  const job = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-scene-'));
  const pub = path.join(job, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  // tarif yazımı
  const list = S.writeSceneInbox(job, ['A sealed WW2 bunker door in a forest, one explorer with a torch', 'An Avro Vulcan bomber over a dark South Atlantic'], { title: 'Black Buck' });
  assert.ok(fs.readFileSync(list, 'utf8').includes('01: A sealed WW2 bunker door'));
  assert.equal(S.scenePrompts(job).length, 2);
  assert.deepEqual(S.sceneCandidates({ jobDir: job, publicDir: pub, sizeOf: P.imageSize }), [], 'görsel yokken aday yok');
  // OpenAI ile hemen çizim (sahte sağlayıcı, 1x1 jpeg)
  const tiny = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const made = await S.autoScenes({ jobDir: job, prompts: S.scenePrompts(job), settings: { openaiKey: 'x' }, textToImage: async () => 'data:image/jpeg;base64,' + tiny.toString('base64') });
  assert.equal(made, 2);
  assert.equal(S.sceneFiles(job).length, 2);
  assert.equal(await S.autoScenes({ jobDir: job, prompts: ['x'], settings: {}, textToImage: async () => '' }), 0, 'anahtarsız çizim yok');
  // paket istemi ve şeması sahne ister; aday türü tanınır
  const pkg = read('src', 'pipeline', 'docu-package.js');
  assert.ok(pkg.includes('scenes = ONE prompt per thumbnail'));
  assert.ok(pkg.includes('sceneCandidates({ jobDir, publicDir, sizeOf: imageSize })'));
  assert.ok(pkg.includes('THUMBNAIL SCENE'));
  assert.ok(read('server.js').includes('app.post("/api/jobs/:id/package"'));
  assert.ok(read('public', 'app.js').includes('data-repkg'));
});

test('tek render: ön izleme kapısından geçen video render sonrası yeniden render edilmez (Hürmüz: 3 render)', () => {
  const d = read('src', 'pipeline', 'docu.js');
  assert.ok(d.includes('const gatePassed = !!readPv();'));
  assert.ok(d.includes('const autoFix = qaOn && settings.docuAutoFix === "always";'));
  assert.ok(d.includes('render sonrası kalite denetimi yalnızca raporlayacak'));
});

test('kendi verimiz (Hürmüz): fiyat + neden Short dersi ve şifreli kapak dersi istemlerde', () => {
  assert.ok(L.shortGrowthLines().join('\n').includes('FİYAT + NEDEN'));
  const own = L.ownDataLines()[0];
  assert.ok(own.includes('$10 Million to Cross Once') && own.includes('1.8%'));
  assert.ok(L.OWN_DATA.bestRetention.some(([t]) => /^Hormuz/.test(t)));
});

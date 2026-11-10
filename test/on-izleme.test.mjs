// 1.16.16 — ÖN İZLEME KAPISI (17 Ekim 2026, Ebola gündem videosu): 75 dakikalık render'dan sonra kalite denetimi 25
// sorun buldu (Kongo'suz açılış haritası, arka planda başka haber akan TV, "COVID" yazan aşı şişeleri, "9,144 CONFIRMED
// CASES AND", neredeyse siyah kart) ve düzeltme bir saatlik ikinci render istedi. Kullanıcı: "görsel seçimi falan
// herşey önceden belli olsun, render kısmında bunlar fark edilmesin". Artık render'dan önce her sahnenin karesi
// çizilip aynı denetimle bakılıyor ve düzeltiliyor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const P = await import('../src/pipeline/docu-preview.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('her sahneden bir kare: son kelimeden ~0,5 sn sonra (yazı tam görünmüş), kelimesiz sahnede %70, bölüm kartında 2,2 sn', () => {
  const scenes = [
    { type: 'words', say: 'a', wordTimes: [{ t: 0.2 }, { t: 1.0 }] },
    { type: 'photo', say: 'b' },
    { type: 'title', chapterCard: true, title: 'BÖLÜM 2' },
    { type: 'counter', say: 'c', wordTimes: [{ t: 9 }] },
  ];
  const placed = [{ from: 0, frames: 90 }, { from: 90, frames: 100 }, { from: 190, frames: 120 }, { from: 310, frames: 60 }];
  const m = P.previewMoments(scenes, placed);
  // Sahnenin sonunu aşan an (sayaç: son kelime 9 sn, sahne 2 sn) son kareye değil, yazının söndüğü son 10 kareden önceye
  // kısılır (kapi-kare-ani: denizaltı işinin geçiş kareleri).
  assert.deepEqual(m.map((x) => x.frame), [44, 160, 256, 359], 'an sahnenin oturmuş, tam görünen aralığında kalır');
});

test('düzeltme planı: arşiv → yeniden seç, AI görseli → anlatımla yeniden üret, taşan yazı → sadeleştir; düşük önemli GÖRSEL uyuşmazlık da düzeltilir (tek render, Ekim 2026), sayaç taşması ve düşük önemli yazı notu plana girmez', () => {
  const scenes = [
    { type: 'photo', say: 'Ekranda başka haber', archived: true, image: 'cnn.jpg' },
    { type: 'photo', say: 'Mines pull in workers and traders, like a busy bus station.', imagePrompt: 'alpine village, snow' },
    { type: 'words', say: "Congo knows this disease. This is the country's seventeenth Ebola outbreak.", text: "the country's seventeenth Ebola outbreak", imagePrompt: 'p' },
    { type: 'slam', say: 'It reached its first thousand.', word: 'thousand' },
    { type: 'counter', say: 'Do the math', to: 48 },
    { type: 'photo', say: 'x', archived: true },
  ];
  const issues = [
    { scene: 0, kind: 'mismatch', severity: 'high', detail: 'CNN ekranında Suudi haberi', fix: 'repick' },
    { scene: 1, kind: 'mismatch', severity: 'high', detail: 'Alp köyü', fix: 'review' },
    { scene: 2, kind: 'text_overflow', severity: 'medium', detail: "THE COUNTRY'S'te yarım kalıyor", fix: 'edit-text' },
    { scene: 3, kind: 'text_overflow', severity: 'medium', detail: 'FOUR yarım', fix: 'edit-text' },
    { scene: 4, kind: 'text_overflow', severity: 'high', detail: 'sayaç etiketi kesik', fix: 'edit-text' },
    { scene: 5, kind: 'mismatch', severity: 'low', detail: 'küçük', fix: 'repick' },
    { scene: 2, kind: 'text_overflow', severity: 'low', detail: 'hafif sıkışık', fix: 'edit-text' },
  ];
  const plan = P.previewFixPlan(issues, scenes, { fp: (s) => `fp:${s.say.slice(0, 6)}` });
  assert.deepEqual(plan.repick.map((f) => f.scene), [0, 5]);
  assert.deepEqual(plan.ai.map((f) => f.scene), [1]);
  assert.match(plan.ai[0].note, /busy bus station/);
  assert.deepEqual(plan.patches.map((p) => [p.scene, p.fix]), [[2, 'key-only'], [3, 'other-style']]);
});

test('AI notu istemine bir kez yazılır (görsel yeniden üretilir); arşiv sahnesine yazılmaz', () => {
  const scenes = [{ type: 'photo', imagePrompt: 'alpine village' }, { type: 'photo', archived: true, imagePrompt: 'x' }];
  const ai = { 0: 'it must plainly show what the narration says: eastern Congo mining town', 1: 'n' };
  assert.equal(P.applyPreviewAiNotes(scenes, ai), 1);
  assert.equal(P.applyPreviewAiNotes(scenes, ai), 0, 'ikinci kez eklenmez');
  assert.match(scenes[0].imagePrompt, /^alpine village — it must plainly show/);
  assert.equal(scenes[1].imagePrompt, 'x');
});

test('kapı: kareleri çizer, sırayla numaralar, denetler, planı ve raporu yazar; çizilemeyen kare atlanır', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-preview-'));
  const props = { scenes: [{ type: 'photo', say: 'a', archived: true }, { type: 'title', chapterCard: true }, { type: 'photo', say: 'b', imagePrompt: 'p' }] };
  const placeTimeline = (sc) => sc.map((_, i) => ({ from: i * 90, frames: 90 }));
  const render = async (items) => {
    for (const it of items.slice(0, 2).concat(items.slice(3))) fs.writeFileSync(it.out, 'jpg');
    return { files: items.filter((_, k) => k !== 2).map((it) => it.out) };
  };
  let seen = null;
  const judge = async (o) => {
    seen = o;
    return { issues: [{ scene: 0, kind: 'mismatch', severity: 'high', detail: 'COVID şişeleri', fix: 'repick' }], vision: { calls: 1, frames: o.got.length, skipped: null } };
  };
  const res = await P.previewGate({ props, scenes: [{ type: 'photo', say: 'a', archived: true }, { type: 'photo', say: 'b', imagePrompt: 'p' }], render, placeTimeline, dir, judge, fp: () => 'x' });
  assert.equal(res.frames, 2, 'üçüncü kare çizilemedi, atlandı');
  assert.ok(seen.preRender && seen.got.length === 2 && fs.existsSync(path.join(dir, 'on-izleme', 'f_0002.jpg')));
  assert.equal(seen.got[1].row.s.type, 'title', 'kareler sahnelerle eşleşik kalır');
  assert.deepEqual(res.plan.repick.map((f) => f.scene), [0]);
  assert.ok(fs.existsSync(path.join(dir, 'on-izleme', 'rapor-tur-1.json')));
});

test('akış: ön izleme render\'dan önce, motorun hazırlık modu + kare çizimi + aynı görme denetimi; düzeltmeler render\'dan önce, tek son hazırlık her yolda', () => {
  const docu = read('../src/pipeline/docu.js');
  const pre = docu.indexOf('if (settings.docuPreview !== false && !patching && !job.docuPrepareOnly)');
  const motor = docu.indexOf('// 6) MOTOR');
  assert.ok(pre > 0 && motor > pre, 'ön izleme motor/render adımından önce');
  const block = docu.slice(pre, motor);
  for (const s of ['prepareOnly: true', 'const props = stillScript(prepared, engineDocu);', 'previewGate({', 'props: { script: props }', 'forgetArchivePicks(dir, directed','finishEngineDocu(again.engineDocu, credits, { fresh: true })']) assert.ok(block.includes(s), s);
  assert.ok(docu.includes('prep2.engineDocu = await finishEngineDocu(prep2.engineDocu, prep2.credits, { fresh: true });'), 'render sonrası düzeltme de aynı son hazırlıktan geçer');
  assert.ok(docu.includes('applyPreviewAiNotes(ed.scenes, readPv()?.ai)'), 'AI notları arşivden sonra senaryoya yazılır');
  const qa = read('../src/pipeline/docu-qa.js');
  assert.ok(qa.includes('export async function judgeFrames(') && qa.includes('const seen = await judgeFrames({ tmp, got, script'), 'render sonrası denetim ve ön izleme aynı görme denetimi');
  assert.ok(read('../docu-engine/lib/thumbnail.mjs').includes('const inputProps = it.props ?? shared;'), 'senaryo kare başına değil bir kez gönderilir');
});

test('kök sebepler: Kongo haritası, yarım sayaç etiketi, karedeki yazıyı okuyan arşiv seçici', async () => {
  const W = await import('../docu-engine/lib/world-map.mjs');
  assert.deepEqual(W.countriesIn("That one journey crossed two borders: Congo, Uganda, then Kenya's capital, Nairobi.").map((c) => c.country), ['Dem. Rep. Congo', 'Uganda', 'Kenya']);
  assert.deepEqual(W.countriesIn('The Republic of the Congo, capital Brazzaville.').map((c) => c.country), ['Congo']);
  assert.equal(W.findCountry('Congo').name, 'Dem. Rep. Congo');
  assert.equal(W.findCountry('Republic of the Congo').name, 'Congo');
  const T = await import('../docu-engine/src/infographics/timing.js');
  const wt = (s) => s.split(' ').map((w, k) => ({ word: w, t: +(k * 0.4).toFixed(2) }));
  assert.deepEqual(T.tallyItems(wt('Do the math with 9,144 confirmed cases and 4,410 deaths, and you get roughly forty-eight percent.')).map((x) => [x.text, x.label]), [['9,144', 'confirmed cases'], ['4,410', 'deaths'], ['48', 'percent']]);
  assert.deepEqual(T.tallyItems(wt('Between 5 and 10 percent of cases.')), [], 'aralık tek sayı kalır');
  const A = await import('../src/pipeline/docu-archive.js');
  assert.ok(A.SCENE_TRUTH_LINES.join(' ').includes('COVID') && A.SCENE_TRUTH_LINES.join(' ').includes('Alp köyü'));
  assert.equal(read('../src/pipeline/docu-archive.js').split('SCENE_TRUTH_LINES').length - 1, 3, 'tanım + stok + arşiv seçici');
});

test('harita: yazarın tam ülke adı denetimden sonra kısalır, DR Kongo düşmez (Ebola açılışı Kongosuz çıktı)', async () => {
  const D = await import('../src/pipeline/docu-edit-director.js');
  const say = 'This is the far east of the Democratic Republic of the Congo: Ituri and North Kivu, beside Uganda.';
  const scenes = [{ type: 'photo', say: 'Intro line here.', imagePrompt: 'p' }, { type: 'map', region: 'world', say, places: [{ label: 'Ituri', lat: 1.5, lon: 29.9 }, { label: 'North Kivu', lat: -0.8, lon: 29.2 }], countries: ['Democratic Republic of the Congo', 'Uganda'] }, { type: 'photo', say: 'Next line.', imagePrompt: 'p' }];
  const r = D.sanitizeDevices({ title: 't', locale: 'en-US', scenes });
  assert.deepEqual(r.script.scenes[1].countries, ['DR Congo', 'Uganda']);
  const W = await import('../docu-engine/lib/world-map.mjs');
  assert.equal(W.findCountry('DR Congo').name, 'Dem. Rep. Congo');
  const G = await import('../src/pipeline/docu-design-gate.js');
  assert.ok(fs.readFileSync(new URL('../src/pipeline/docu-design-gate.js', import.meta.url), 'utf8').includes('assets[`flags/${f}`]'), 'ön izleme karelerine bayraklar gider');
  assert.equal(typeof G.sceneFp, 'function');
});

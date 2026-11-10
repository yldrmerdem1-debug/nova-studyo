// ÖN İZLEME YAMALARI SAHNE BAŞINA BİRİKİR — cihazı fotoğrafa döndüren yedek sonraki turun yamasıyla geri alınmaz.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası 20261024-950730 + 1. tur inceleme G'nin altı turluk benzetimi): docu.js ön
// izleme yamalarını anlatım parmak izi başına TEK kayıtla tutuyordu (`allPatches.set(p.say, p)`) ve her tur yamaları
// yönetmenin senaryosuna baştan uyguluyordu. İçeriği yanlış bölünmüş ekran "device-fallback" ile fotoğrafa döndü; fotoğraf
// kancada 6 sn durunca 2. tur "cutaway" verdi, o da yedeğin yerine geçti → bölünmüş ekran geri geldi, yine bulundu, yine
// döndü: 1-6. turlar sırayla (her biri bir hazırlık + ücretli görme turu) ve render'a ara planlı YANLIŞ cihaz gitti. Yedek
// yazı kartının yazı yaması ("key-only") da cihazı aynı yoldan geri getiriyordu. İşin gerçek kaydında da bir sahne iki
// yama aldı: on-izleme/rapor-tur-1.json sahne 87 "key-only", rapor-tur-2.json aynı sahne "clean-picture" — eski kayıt
// ilkini sildi. Ağ, ücretli çağrı ve ffmpeg YOK: taslak kapı turları (docu.js'nin kuralı tek başına, kapı zincir yazmasa da)
// ve gerçek previewGate + görme bulgusu kuralı (visionIssue) + zaman çizelgesi eleştirmeni; görme modeli ve motorun
// hazırlığı taslak.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-yama-birikir-home-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const D = await import('../src/pipeline/docu.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');
const docuSrc = fs.readFileSync(new URL('../src/pipeline/docu.js', import.meta.url), 'utf8');

const fp = G.sceneFp;
const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };

// Bölünmüş ekran (icerigi-yanlis-cihaz.test.mjs, Kartal sahne 98'in kısaltılmışı): kancada, 6 sn, kendi arşiv resmiyle.
const SPLIT_SAY = "Hitler's actual home was the Berghof, on the Obersalzberg below, a separate building entirely.";
const SPLIT_MISMATCH = { kind: 'mismatch', severity: 'medium', detail: "Bölünmüş ekranda 'BERGHOF: HIS HOME' etiketli sol yarıda Berghof yok; yalnızca ağaçlar ve bir patika görünüyor." };
const splitScript = () => ({ title: 'Eagle\'s Nest', scenes: [
  { type: 'photo', say: 'This is the Kehlsteinhaus.', image: 'build/j/a.jpg', archived: true, source: 'archive', search: 'Kehlsteinhaus', dur: 3, voiceDur: 2.6 },
  { type: 'photo', say: 'Hitler never lived here.', image: 'build/j/b.jpg', archived: true, source: 'archive', search: 'Kehlsteinhaus terrace', dur: 4, voiceDur: 3.6 },
  { type: 'split', say: SPLIT_SAY, source: 'archive', search: 'Entrance to the Berghof 1930s', image: 'build/j/cm-87fe4189.jpg', archived: true, left: { label: 'BERGHOF: HIS HOME', own: true }, right: { fromScene: 0 }, mode: 'versus', dur: 6, voiceDur: 5.6 },
  { type: 'photo', say: 'It burned on Friday night.', image: 'build/j/d.jpg', archived: true, source: 'archive', search: 'fire', dur: 3, voiceDur: 2.6 },
] });
// Resimsiz alıntı cihazı: yedeği önceki karenin üstünde yazı (fallbackScene); yazı taşınca "key-only" alır.
const QUOTE_SAY = 'The mayor told reporters: we will not let this mountain burn again.';
const quoteScript = () => ({ title: 'Eagle\'s Nest', scenes: [
  { type: 'photo', say: 'This is the Kehlsteinhaus.', image: 'build/j/a.jpg', video: 'build/j/src/a.mp4', archived: true, dur: 3, voiceDur: 2.6 },
  { type: 'quote', say: QUOTE_SAY, quote: 'We will not let this mountain burn again.', who: 'The mayor', dur: 3, voiceDur: 2.6 },
  { type: 'photo', say: 'By Saturday it was gone.', image: 'build/j/c.jpg', video: 'build/j/src/c.mp4', archived: true, dur: 3, voiceDur: 2.6 },
] });

// Motorun hazırlığı (taslak): ara planlı işaretli fotoğrafa motor ara plan keser (lib/inserts.mjs) — eleştirmen onu görür.
const drawn = (ed) => ({ ...ed, scenes: ed.scenes.map((s) => (s.cutaway && !s.noInserts && s.type === 'photo' ? { ...s, inserts: [{ src: 'build/j/ins.jpg', at: 2.6 }] } : s)) });
const vision = (raw) => async (o) => ({ issues: o.got.flatMap((g, k) => raw(g.row.s).map((it) => Q.visionIssue({ frame: k + 1, ...it }, g))).filter(Boolean), vision: { calls: 1, frames: o.got.length, skipped: null } });

// docu.js'nin kapı döngüsü (5d): tur → plan → yamalar birleşir → yönetmenin senaryosuna BAŞTAN uygulanır → sonraki tur.
const OLD = {
  merge: (before, patches) => { const m = new Map((before || []).map((p) => [p.say, p])); for (const p of patches) m.set(p.say, p); return [...m.values()]; },
  apply: (ed, patches) => G.applyGatePatches(ed, patches),
};
const NEW = { merge: D.mergePreviewPatches, apply: D.applyPreviewPatches };
async function gateRounds(directed, gate, rules) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-yama-birikir-'));
  let pv = null;
  let engine = rules.apply(structuredClone(directed), []);
  const plans = [];
  for (let round = 1; round <= P.PREVIEW_ROUNDS; round++) {
    const only = round > P.FULL_ROUNDS && pv ? new Set(pv.changed || []) : null;
    if (only && !only.size) break;
    const { repick, ai, patches } = await gate(engine, { round, only, dir });
    plans.push(patches.map((p) => `${p.scene}:${p.fix}`).join(' '));
    const changed = [...new Set([...repick, ...ai, ...patches].map((f) => f.scene))];
    pv = { round, patches: rules.merge(pv?.patches || [], patches), changed };
    if (!changed.length) break;
    engine = rules.apply(structuredClone(directed), pv.patches);
  }
  return { engine, plans, pv };
}
// Taslak kapı: zincirsiz yamalar (kapının kendi kuralları, sahne başına tur başına bir yama) — docu.js'nin kuralı tek başına.
const patch = (engine, scene, fix) => ({ repick: [], ai: [], patches: [{ say: fp(engine.scenes[scene]), fix, scene }] });
const NONE = { repick: [], ai: [], patches: [] };
const stubSplit = async (e) => { const s = e.scenes[2]; return s.type === 'split' ? patch(e, 2, 'device-fallback') : s.type === 'photo' && !s.cutaway && !s.noInserts ? patch(e, 2, 'cutaway') : NONE; };
const stubQuote = async (e) => { const s = e.scenes[1]; return s.type === 'quote' ? patch(e, 1, 'device-fallback') : s.type === 'words' && s.textMode !== 'key' ? patch(e, 1, 'key-only') : NONE; };
// Gerçek kapı: previewGate (görme modeli taslak, kural visionIssue; eleştirmen ve ara plan kuralı gerçek).
const realGate = (judge) => async (engine, { round, only, dir }) => (await P.previewGate({ props: drawn(engine), scenes: engine.scenes, render, placeTimeline, dir, judge, fp, round, only, ffmpeg: path.join(dir, 'ffmpeg-yok.exe') })).plan;
const stepsOf = (pv) => pv.patches.flatMap((p) => p.fix.split('+'));

test('birleştirme: bir sahnenin farklı düzeltmeleri yan yana kalır; aynı düzeltmenin yenisi eskisinin yerini alıp sona geçer', () => {
  const a = 'aaaaaaaaaa', b = 'bbbbbbbbbb';
  const before = [{ say: a, fix: 'device-fallback', reasons: 'tur 1', scene: 2 }];
  const r2 = D.mergePreviewPatches(before, [{ say: a, fix: 'cutaway', scene: 2 }, { say: b, fix: 'key-only', scene: 5 }]);
  assert.deepEqual(r2.map((p) => `${p.say}:${p.fix}`), [`${a}:device-fallback`, `${a}:cutaway`, `${b}:key-only`], 'cutaway yedeğin yerine geçmez');
  const r3 = D.mergePreviewPatches(r2, [{ say: a, fix: 'no-inserts', scene: 2 }, { say: b, fix: 'key-only', reasons: 'tur 3', scene: 5 }]);
  assert.deepEqual(r3.map((p) => `${p.say}:${p.fix}`), [`${a}:device-fallback`, `${a}:cutaway`, `${a}:no-inserts`, `${b}:key-only`]);
  assert.equal(r3.at(-1).reasons, 'tur 3', 'aynı düzeltmenin yenisi');
  assert.equal(r3.filter((p) => p.say === b).length, 1, 'aynı düzeltme iki kez durmaz');
  const r4 = D.mergePreviewPatches(r3, [{ say: a, fix: 'cutaway', reasons: 'tur 4', scene: 2 }]);
  assert.deepEqual(r4.map((p) => p.fix), ['device-fallback', 'no-inserts', 'key-only', 'cutaway'], 'yenisi sona: öncekilerin üstüne planlandı');
  // Kaç tur geçerse geçsin yedek kayıtta kalır; giriş değişmez; sıra her çalıştırmada aynı.
  let acc = before;
  for (const fix of ['cutaway', 'no-inserts', 'key-only', 'clean-picture', 'other-style', 'cutaway']) acc = D.mergePreviewPatches(acc, [{ say: a, fix }]);
  assert.equal(acc.filter((p) => p.fix === 'device-fallback').length, 1);
  assert.deepEqual(before, [{ say: a, fix: 'device-fallback', reasons: 'tur 1', scene: 2 }]);
  assert.equal(JSON.stringify(D.mergePreviewPatches(r3, r2)), JSON.stringify(D.mergePreviewPatches(r3, r2)));
  assert.deepEqual(D.mergePreviewPatches(undefined, [{ fix: 'cutaway' }, null]), [], 'parmak izi olmayan yama yok sayılır');
  // Zincir (tek kayıtta sırayla birkaç adım, önceki turun yaması önde) baştaki adımlarının yenisidir: adımlar iki kez uygulanmaz.
  assert.deepEqual(D.mergePreviewPatches(before, [{ say: a, fix: 'device-fallback+cutaway' }]).map((p) => p.fix), ['device-fallback+cutaway']);
  assert.deepEqual(D.mergePreviewPatches(r2, [{ say: a, fix: 'cutaway+no-inserts' }]).map((p) => `${p.say}:${p.fix}`), [`${a}:device-fallback`, `${b}:key-only`, `${a}:cutaway+no-inserts`]);
  assert.deepEqual(D.mergePreviewPatches([{ say: b, fix: 'other-style' }], [{ say: b, fix: 'other-style+cutaway' }]).map((p) => p.fix), ['other-style+cutaway'], '"other-style" iki kez stili geri çevirirdi');
  assert.deepEqual(D.mergePreviewPatches([{ say: a, fix: 'device-fallback+cutaway' }], [{ say: a, fix: 'cutaway' }]).map((p) => p.fix), ['device-fallback+cutaway', 'cutaway'], 'zincirin bir parçası onu silmez');
  assert.deepEqual(D.mergePreviewPatches([{ say: a, fix: 'device-fallback' }], [{ say: b, fix: 'device-fallback+cutaway' }]).length, 2, 'başka sahnenin zinciri');
});

test('uygulama: bir sahnenin bütün yamaları kayıt sırasıyla; sahne başına tek yama eskisiyle aynı sonuç ve günlük', () => {
  const sc = splitScript();
  const both = D.applyPreviewPatches(sc, [{ say: fp(sc.scenes[2]), fix: 'device-fallback' }, { say: fp(sc.scenes[2]), fix: 'cutaway' }]).scenes[2];
  assert.deepEqual([both.type, both.cutaway, both.image, both.left, both.mode], ['photo', true, 'build/j/cm-87fe4189.jpg', undefined, undefined]);
  const rev = D.applyPreviewPatches(sc, [{ say: fp(sc.scenes[2]), fix: 'cutaway' }, { say: fp(sc.scenes[2]), fix: 'device-fallback' }]).scenes[2];
  assert.deepEqual([rev.type, rev.cutaway], ['photo', true]);
  const q = quoteScript();
  const card = D.applyPreviewPatches(q, [{ say: fp(q.scenes[1]), fix: 'device-fallback' }, { say: fp(q.scenes[1]), fix: 'key-only' }]).scenes[1];
  assert.deepEqual([card.type, card.textMode, card.bg, card.quote], ['words', 'key', 'prev', undefined]);
  // Zincir birleştirmede "device-fallback"in yerine geçer: uygulamada adımlarına ayrılmazsa (applyFix tek düzeltme okur)
  // hiçbir şey yapmaz, bölünmüş ekran geri gelirdi.
  const chained = D.mergePreviewPatches([{ say: fp(sc.scenes[2]), fix: 'device-fallback' }], [{ say: fp(sc.scenes[2]), fix: 'device-fallback+cutaway' }]);
  const ch = D.applyPreviewPatches(sc, chained).scenes[2];
  assert.deepEqual([ch.type, ch.cutaway, ch.left], ['photo', true, undefined], 'zincirin adımları sırayla');
  // Normal durum: sahne başına tek yama → applyGatePatches'in aynısı; günlükte "Ön izleme".
  const one = [{ say: fp(sc.scenes[2]), fix: 'device-fallback' }, { say: fp(sc.scenes[1]), fix: 'cutaway' }];
  const logs = [];
  assert.deepEqual(D.applyPreviewPatches(sc, one, { logFn: (m) => logs.push(m) }), G.applyGatePatches(sc, one));
  assert.deepEqual(logs, ['Ön izleme: 2 sahne başka uygulamaya geçti (device-fallback, cutaway)']);
  assert.equal(D.applyPreviewPatches(sc, []), sc);
  assert.equal(sc.scenes[2].type, 'split', 'girdi değişmez');
});

test('turlar (taslak kapı): kancadaki bölünmüş ekran yedeğe döner, sonra ara plan alır — cihaz geri gelmez, kapı 3. turda biter', async () => {
  const now = await gateRounds(splitScript(), stubSplit, NEW);
  assert.deepEqual(now.plans, ['2:device-fallback', '2:cutaway', '']);
  assert.deepEqual(now.pv.patches.map((p) => p.fix), ['device-fallback', 'cutaway']);
  assert.deepEqual([now.engine.scenes[2].type, now.engine.scenes[2].cutaway], ['photo', true], "render'a fotoğraf + ara plan");
  // Kontrol — eski kural (parmak izi başına tek yama) aynı turlarda: altı tur sırayla, render'a ara planlı YANLIŞ cihaz.
  const old = await gateRounds(splitScript(), stubSplit, OLD);
  assert.deepEqual(old.plans, ['2:device-fallback', '2:cutaway', '2:device-fallback', '2:cutaway', '2:device-fallback', '2:cutaway']);
  assert.deepEqual([old.engine.scenes[2].type, old.engine.scenes[2].cutaway], ['split', true]);
});

test('turlar (taslak kapı): yedek yazı kartının yazı yaması ("key-only") cihazı geri getirmez', async () => {
  const now = await gateRounds(quoteScript(), stubQuote, NEW);
  assert.deepEqual(now.plans, ['1:device-fallback', '1:key-only', '']);
  assert.deepEqual([now.engine.scenes[1].type, now.engine.scenes[1].textMode], ['words', 'key']);
  const old = await gateRounds(quoteScript(), stubQuote, OLD);
  assert.equal(old.plans.length, P.PREVIEW_ROUNDS, 'eski kural: altı tur');
  assert.equal(old.engine.scenes[1].type, 'quote', "eski kural: render'a yanlış alıntı");
});

test('turlar (gerçek kapı): iki senaryo da en çok 3 turda biter; yedek kayıtta kalır, hiçbir adım iki kez uygulanmaz', async () => {
  const split = await gateRounds(splitScript(), realGate(vision((s) => (s.type === 'split' ? [SPLIT_MISMATCH] : []))), NEW);
  assert.ok(split.plans.length <= 3 && split.plans.at(-1) === '', split.plans.join(' | '));
  assert.deepEqual([split.engine.scenes[2].type, split.engine.scenes[2].cutaway], ['photo', true]);
  assert.deepEqual(stepsOf(split.pv), ['device-fallback', 'cutaway'], 'zincirli de olsa ("device-fallback+cutaway") zincirsiz de olsa aynı adımlar, birer kez');
  const quote = await gateRounds(quoteScript(), realGate(vision((s) => (s.type === 'quote' ? [{ kind: 'mismatch', severity: 'medium', detail: 'alıntı başka birine ait' }]
    : s.type === 'words' && s.textMode !== 'key' ? [{ kind: 'text_overflow', severity: 'medium', detail: 'yazı kartın dışına taşıyor' }] : []))), NEW);
  assert.ok(quote.plans.length <= 3 && quote.plans.at(-1) === '', quote.plans.join(' | '));
  assert.deepEqual([quote.engine.scenes[1].type, quote.engine.scenes[1].textMode], ['words', 'key']);
  assert.deepEqual(stepsOf(quote.pv), ['device-fallback', 'key-only']);
});

test('docu.js: kapı yamaları birleştirir (dizi), her son hazırlık hepsini uygular', () => {
  const pre = docuSrc.indexOf('if (settings.docuPreview !== false && !patching && !job.docuPrepareOnly)');
  const block = docuSrc.slice(pre, docuSrc.indexOf('// 6) MOTOR'));
  assert.ok(block.includes('const allPatches = mergePreviewPatches(before.patches, patches);'));
  assert.ok(block.includes('patches: allPatches, changed,'));
  assert.ok(!docuSrc.includes('allPatches.set(p.say, p)'), 'parmak izi başına tek yama kalmadı');
  assert.ok(docuSrc.includes('if (pv?.patches?.length) ed = applyPreviewPatches(ed, pv.patches, { logFn: say });'));
  assert.ok(!/applyGatePatches\(ed, pv\.patches/.test(docuSrc), 'ön izleme kaydı tek-yama okuyucusuna gitmez');
});

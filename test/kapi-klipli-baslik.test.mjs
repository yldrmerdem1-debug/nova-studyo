// KLİPLİ BAŞLIK — kapı motorun yok sayacağı satırı işaretlemez; klibi düşmüş arşiv başlığı başka düzeltme alır.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 1. tur incelemesi, Kartal Yuvası iş 20261024-950730'in kanca başlığıyla): docu-preview.js
// cuttable() bölüm kartı olmayan başlığı "s.image || s.video" ile kabul ediyordu, motorun insertable()'ı ise klipli ve
// derinlik katmanlı satırı reddeder (PlainTitle klibi oynatır). Kapı böyle satıra "cutaway" verir, motor işareti yok sayar,
// kare yine bekler. Kural: kapı, motorun ara plan seçtiği hazırlanmış satırda (çizilen satır) klip ya da katman varsa
// işaretlemez; senaryoda klibi olup motorun klibi kullanamadığı (çizilen satır durağan) arşiv başlığı ara plan değil arşivden
// yeniden seçim alır (bozuk klibin düzeltmesi). Klipsiz resimli başlık eskisi gibi kesilir. Ağ, ücretli çağrı, ffmpeg YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-klipli-baslik-home-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');
const C = await import('../src/pipeline/docu-critic.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const I = await import('../docu-engine/lib/inserts.mjs');

const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
const judge = async (o) => ({ issues: [], vision: { calls: 1, frames: o.got.length, skipped: null } });
const TITLE_SAY = "By the end, you'll know what happened on the mountain on Friday night, and what was truly lost.";
const TITLE = { type: 'title', say: TITLE_SAY, title: 'It Burned Down in One Night', image: 'build/j/arch-15e5efeaa971.jpg', textStyle: 'typewriter', dur: 6, voiceDur: 5.76 };

test('kapı ile motor aynı satırı keser: çizilen satırda klip ya da derinlik katmanı varsa işaret yok', () => {
  // Önceki kareyi taşıyan (bg prev) satır önceki fotoğrafın çekimine katılır; kendi klibi/katmanı motorda ara planı engeller.
  const cuts = (row) => {
    const script = { scenes: [{ type: 'photo', say: 'a', image: 'a.jpg', dur: 3, voiceDur: 2.6 }, { say: 'b', dur: 6.2, voiceDur: 5.8, ...row }] };
    const rows = Q.sceneRows(script, null);
    const sh = C.stillShots(rows)[0];
    assert.ok(sh.rows.some((r) => r.scene === 1), JSON.stringify(row));
    return P.holdCuts([{ kind: 'hook_slow', time: +sh.start.toFixed(2), severity: 'medium' }], rows, script.scenes);
  };
  const clipTitle = { type: 'title', title: 'It Burned', image: 't.jpg', video: 'v.mp4', bg: 'prev' };
  assert.deepEqual(cuts(clipTitle), [0], 'klipli başlık işaretlenmez (önceki fotoğraf kesilir)');
  assert.equal(I.insertable({ ...clipTitle, voiceDur: 5.8, cutaway: true }), false, 'motor da kesmez');
  const layered = { type: 'words', textMode: 'key', text: 'b', bg: 'prev', image: 'a.jpg', layers: { fg: 'l.png' } };
  assert.deepEqual(cuts(layered), [0], 'derinlik katmanlı satır işaretlenmez');
  assert.equal(I.insertable({ ...layered, voiceDur: 5.8, cutaway: true }), false);
  const key = { type: 'words', textMode: 'key', text: 'b', bg: 'prev', image: 'a.jpg' };
  assert.deepEqual(cuts(key), [0, 1], 'normal durum: önceki kareyi taşıyan anahtar kelime kartı da kesilir');
  assert.equal(I.insertable({ ...key, voiceDur: 5.8, cutaway: true }), true);
});

test('klibi motorda düşmüş arşiv başlığı kancada beklerse arşivi yeniden seçilir, ara plan almaz', async () => {
  // Senaryoda başlığın arşiv klibi var; hazırlıkta motor klibi kullanamadı ("arşiv klibi kullanılamıyor — durağan karesiyle").
  const scenes = [
    { type: 'photo', say: 'This is the Kehlsteinhaus.', image: 'build/j/a.jpg', archived: true, source: 'archive', search: 'Kehlsteinhaus', dur: 3 },
    { ...TITLE, voiceDur: undefined, video: 'build/j/clip-15e5.mp4', archived: true, source: 'stock', search: 'smoke mountain fog' },
    { type: 'photo', say: 'And within hours, police had detained a man near the site.', image: 'build/j/c.jpg', dur: 3.875 },
  ];
  const props = { scenes: [{ ...scenes[0], voiceDur: 2.6 }, { ...TITLE, archived: true, source: 'stock', search: 'smoke mountain fog' }, { ...scenes[2], voiceDur: 3.475 }] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-klipli-baslik-'));
  const res = await P.previewGate({ props, scenes, render, placeTimeline, dir, judge, fp: G.sceneFp, ffmpeg: path.join(dir, 'ffmpeg-yok.exe') });
  assert.ok(res.issues.some((x) => x.kind === 'hook_slow' && x.scene === 1), 'yavaş kanca bulunur');
  assert.deepEqual(res.plan.repick.map((f) => [f.scene, f.kind]), [[1, 'hook_slow']]);
  assert.deepEqual(res.plan.patches, [], 'ölü klibin karesine ara plan kesilmez');
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-1.json'), 'utf8'));
  assert.deepEqual(rep.plan.repick, [1]);
  // Normal durum: klipsiz arşiv başlığı (ve arşivden olmayan klibi düşmüş başlık: motor yine durağan karesine döner) kesilir.
  for (const title of [{ ...scenes[1], video: undefined }, { ...scenes[1], archived: undefined, source: 'ai' }]) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-klipli-baslik-'));
    const r = await P.previewGate({ props, scenes: [scenes[0], title, scenes[2]], render, placeTimeline, dir: d, judge, fp: G.sceneFp, ffmpeg: path.join(d, 'ffmpeg-yok.exe') });
    assert.deepEqual([r.plan.repick.length, r.plan.patches.map((p) => [p.scene, p.fix])], [0, [[1, 'cutaway']]], JSON.stringify(title));
  }
});

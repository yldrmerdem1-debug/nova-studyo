// KANCADA BEKLEYEN BAŞLIK KARTI — kapı raporlamakla kalmaz, keser.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): on-izleme/rapor-tur-1..4.json'un dördünde de
// sahne 6 (indeks 5) "Kancada aynı kare 6,2 sn kesilmeden duruyor" diye yazılı. 1. tur yalnızca 1-3. sahnelere ara plan
// koydu, 3. ve 4. turun planı boş (patches []); render sonrası qa.json yine 18,67. saniyede hook_slow, qualityWarnings
// "QA 0:18 sahne 6: yavaş kanca". Sahne bölüm kartı olmayan bir 'title' ("It Burned Down in One Night", 6 sn, arşiv
// resmi üstünde): eleştirmen onu durağan kare sayıyor (doğru), ama holdCuts yalnızca fotoğraf ve anahtar kelime kartını
// kesebiliyordu ve motorun başlık bileşeni ara plan çizmiyordu. Artık böyle satır "cutaway" alır: başlık yerinde
// kalır, motor altına ara plan keser (scenes.tsx PlainTitle, lib/inserts.mjs insertable). Ağ ve ücretli çağrı YOK, ffmpeg çalıştırılmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kanca-baslik-home-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');
const C = await import('../src/pipeline/docu-critic.js');

const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
const TITLE_SAY = "By the end, you'll know what happened on the mountain on Friday night, and what was truly lost.";
// Motorun hazırlık modundaki senaryo (docu/20261024-950730.props.json, ilk 7 sahne; 3. turdan sonraki hali: 1-3 işaretli).
const PROPS = {
  scenes: [
    { type: 'photo', say: 'This is the Kehlsteinhaus.', image: 'build/j/src/src-84d564d9c6.jpg', video: 'build/j/src/src-84d564d9c6.mp4', dur: 3, voiceDur: 2.713 },
    { type: 'photo', say: 'Hitler never lived here.', image: 'build/j/cm-c119d5e0f7f7.jpg', cutaway: true, inserts: [{ src: 'build/j/ins-1.jpg', at: 2.08 }], dur: 4.371, voiceDur: 3.671 },
    { type: 'words', say: 'It burned.', textMode: 'key', bg: 'prev', image: 'build/j/cm-c119d5e0f7f7.jpg', cutaway: true, dur: 2.299, voiceDur: 1.899 },
    { type: 'photo', say: 'On Friday night, flames came through the roof.', image: 'build/j/arch-c24386c18a8a.lift.jpg', cutaway: true, inserts: [{ src: 'build/j/ins-2.jpg', at: 1.16 }], dur: 5.256, voiceDur: 4.556 },
    { type: 'photo', say: 'By Saturday, it was almost completely destroyed.', image: 'build/j/img-fc626bd66b4a.jpg', pace: 'hold', energy: 1, dur: 3.642, voiceDur: 2.942 },
    { type: 'title', say: TITLE_SAY, title: 'It Burned Down in One Night', image: 'build/j/arch-15e5efeaa971.jpg', textStyle: 'typewriter', dur: 6, voiceDur: 5.76 },
    { type: 'photo', say: '[serious] And within hours, police had detained a man near the site.', image: 'build/j/img-e6e606e46429.lift.jpg', dur: 3.875, voiceDur: 3.475 },
  ],
};
// Motora giden senaryo (engine-script.json): görseli henüz çözülmemiş sahnede resim yok; başlığın arşiv resmi var.
const SCENES = PROPS.scenes.map((s, i) => {
  const { inserts, voiceDur, ...rest } = s;
  if (i === 4 || i === 6) delete rest.image;
  return i === 5 ? { ...rest, source: 'stock', search: 'smoke mountain fog', archived: true } : rest;
});

test('eleştirmen başlık kartını kancada 6,2 sn bekleyen kare sayar; holdCuts artık onu da keser (eskiden boş dönüyordu)', () => {
  const placed = placeTimeline(PROPS.scenes);
  const critic = C.critiqueTimeline(PROPS, placed);
  const slow = critic.filter((x) => x.kind === 'hook_slow');
  assert.deepEqual(slow.map((x) => [x.scene, x.time]), [[5, 18.67]], 'iş kaydındaki 18,67 sn');
  assert.match(slow[0].detail, /6,2 sn/);
  assert.deepEqual(P.holdCuts(critic, Q.sceneRows(PROPS, placed), SCENES), [5]);
});

test('kapı: kancadaki başlık kartı "cutaway" yaması alır; zaten işaretli satırlar yeniden işaretlenmez', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kanca-baslik-'));
  const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
  const judge = async (o) => ({ issues: [], vision: { calls: 1, frames: o.got.length, skipped: null } });
  const res = await P.previewGate({ props: PROPS, scenes: SCENES, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), round: 3 });
  assert.deepEqual(res.plan.patches.map((p) => [p.scene, p.fix, p.say]), [[5, 'cutaway', TITLE_SAY]]);
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-3.json'), 'utf8'));
  assert.deepEqual(rep.plan.patches, [{ scene: 5, fix: 'cutaway' }], '3. tur artık boş plan değil');
});

test('kural resimli düz başlık için; işaretli başlık tur döndürmez', () => {
  // Başlık satırının içinde durduğu çekim kancada yavaş: kesilecek satırlar arasında başlık (sahne 1) var mı?
  const cutsTitle = (title, { scene = {}, kind = 'hook_slow', photoDur = 3 } = {}) => {
    const script = { scenes: [{ type: 'photo', say: 'a', image: 'a.jpg', dur: photoDur }, { type: 'title', say: 'b', dur: 6.2, ...title }] };
    const rows = Q.sceneRows(script, null);
    const sh = C.stillShots(rows).find((h) => h.rows.some((r) => r.scene === 1));
    return P.holdCuts([{ kind, time: +(sh?.start ?? rows[1].start).toFixed(2), severity: 'medium' }], rows, script.scenes.map((s) => ({ ...s, ...scene }))).includes(1);
  };
  assert.equal(cutsTitle({ title: 'It Burned', image: 't.jpg' }), true);
  assert.equal(cutsTitle({ title: 'It Burned', image: 't.jpg' }, { scene: { cutaway: true } }), false, 'işaretli satır (cutaway) yeniden işaretlenmez');
  assert.equal(cutsTitle({ title: 'It Burned', image: 't.jpg', video: 'v.mp4' }), false, 'klip zaten hareket eder');
  assert.equal(cutsTitle({ title: 'It Burned' }), false, 'resimsiz başlık (önceki fotoğrafın çekimi kesilir, başlık değil)');
  assert.equal(cutsTitle({ image: 't.jpg' }), true, 'başlık yazısı şart değil: yazı değişmez, yalnızca altındaki resim');
  // Başlık artık söz kartına dönmüyor (tasarımı kalıyor): kanca dışındaki uzun bekleyen başlık da aynı ara planı alır.
  assert.equal(cutsTitle({ title: 'Later', image: 't.jpg', dur: 16 }, { kind: 'long_hold', photoDur: 40 }), true);
  assert.equal(cutsTitle({ title: 'Later', image: 't.jpg', dur: 16 }, { kind: 'hook_slow', photoDur: 40 }), true);
});

test('ara planı reddedilmiş başlık yeniden işaretlenmez: "cutaway" ile "no-inserts" turlar boyunca birbirini silmez', async () => {
  const G = await import('../src/pipeline/docu-design-gate.js');
  // Sonraki turda başlığın ara planı yanlış bulundu: "no-inserts" aynı parmak izindeki "cutaway"in yerine geçti (docu.js
  // tur başına yamaları anlatım parmak iziyle birleştirir). Eskiden kapı satırı yine keserdi → ara plan geri → yine ret…
  const scenes = G.applyGatePatches({ scenes: SCENES }, [{ say: G.sceneFp(SCENES[5]), fix: 'no-inserts' }]).scenes;
  assert.deepEqual([scenes[5].noInserts, scenes[5].cutaway], [true, undefined]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kanca-baslik-ret-'));
  const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
  const judge = async (o) => ({ issues: [], vision: { calls: 1, frames: o.got.length, skipped: null } });
  const res = await P.previewGate({ props: PROPS, scenes, render, placeTimeline, dir, judge, fp: G.sceneFp, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), round: 5 });
  assert.ok(res.issues.some((x) => x.kind === 'hook_slow' && x.scene === 5), 'yavaş kanca yine raporlanır');
  assert.deepEqual(res.plan.patches, [], 'kesilemeyen satır bir daha işaretlenmez: kapı biter');
});

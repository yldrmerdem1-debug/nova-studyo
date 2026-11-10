// KAPININ KESTİĞİ BAŞLIK GERÇEKTEN KESİLİR — kapının "cutaway" yaması, tasarım kapısı ve motor aynı satırı tanır.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): kancadaki bölüm kartı olmayan başlık ("It
// Burned Down in One Night", 6 sn, arşiv resmi üstünde) on-izleme/rapor-tur-1..4.json'un dördünde de "Kancada aynı kare
// 6,2 sn kesilmeden duruyor"; 3. ve 4. turun planı boş, render sonrası qa.json yine 18,67. saniyede hook_slow. Kapı
// başlığı kesemiyordu (holdCuts yalnızca fotoğraf/anahtar kelime kartı), motor da başlığa ara plan çizmiyordu. İlk çözüm
// başlığı anahtar söz kartına çeviriyordu ("title-to-key"); ama söz kartının karesi anlatımın hizalamasından gelir ve
// başlık söylenmez. Artık motor başlığın altına ara plan çiziyor (PlainTitle, insertable): kapı satıra fotoğraftaki aynı
// "cutaway" yamasını verir, başlık yerinde kalır. Kural: kapının kestiği her başlığı motor da keser; kesilen başlık bir
// daha işaretlenmez. Ağ ve ücretli çağrı YOK, ffmpeg çalıştırılmaz, render yok.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapi-baslik-home-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');
const C = await import('../src/pipeline/docu-critic.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const I = await import('../docu-engine/lib/inserts.mjs');

const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
const TITLE_SAY = "By the end, you'll know what happened on the mountain on Friday night, and what was truly lost.";
const TITLE_WORDS = [
  ['By', 0.1], ['the', 0.25], ['end,', 0.4], ["you'll", 0.7], ['know', 0.95], ['what', 1.2], ['happened', 1.45], ['on', 1.9], ['the', 2.0],
  ['mountain', 2.2], ['on', 2.75], ['Friday', 2.9], ['night,', 3.35], ['and', 3.9], ['what', 4.1], ['was', 4.3], ['truly', 4.5], ['lost.', 5.0],
].map(([word, t]) => ({ word, t }));
// Motorun hazırlık senaryosu (docu/20261024-950730.props.json, ilk 7 sahne; 3. turdan sonraki hali: 1-3 işaretli ve kesik).
const PROPS = {
  scenes: [
    { type: 'photo', say: 'This is the Kehlsteinhaus.', image: 'build/j/src/src-84d564d9c6.jpg', video: 'build/j/src/src-84d564d9c6.mp4', dur: 3, voiceDur: 2.713 },
    { type: 'photo', say: 'Hitler never lived here.', image: 'build/j/cm-c119d5e0f7f7.jpg', cutaway: true, inserts: [{ src: 'build/j/ins-1.jpg', at: 2.08 }], dur: 4.371, voiceDur: 3.671 },
    { type: 'words', say: 'It burned.', textMode: 'key', bg: 'prev', image: 'build/j/cm-c119d5e0f7f7.jpg', cutaway: true, dur: 2.299, voiceDur: 1.899 },
    { type: 'photo', say: 'On Friday night, flames came through the roof.', image: 'build/j/arch-c24386c18a8a.lift.jpg', cutaway: true, inserts: [{ src: 'build/j/ins-2.jpg', at: 1.16 }], dur: 5.256, voiceDur: 4.556 },
    { type: 'photo', say: 'By Saturday, it was almost completely destroyed.', image: 'build/j/img-fc626bd66b4a.jpg', pace: 'hold', energy: 1, dur: 3.642, voiceDur: 2.942 },
    { type: 'title', say: TITLE_SAY, title: 'It Burned Down in One Night', image: 'build/j/arch-15e5efeaa971.jpg', textStyle: 'typewriter', source: 'stock', search: 'smoke mountain fog', archived: true, dur: 6, voiceDur: 5.76, wordTimes: TITLE_WORDS },
    { type: 'photo', say: '[serious] And within hours, police had detained a man near the site.', image: 'build/j/img-e6e606e46429.lift.jpg', dur: 3.875, voiceDur: 3.475 },
  ],
};
// Motora giden senaryo (engine-script.json): ses ve ara plan motorda; başlığın arşiv resmi ve stok araması burada da var.
const SCENES = PROPS.scenes.map(({ inserts, voiceDur, wordTimes, ...rest }) => rest);
const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
const judge = async (o) => ({ issues: [], vision: { calls: 1, frames: o.got.length, skipped: null } });
const gate = (props, scenes, round) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapi-baslik-'));
  return P.previewGate({ props, scenes, render, placeTimeline, dir, judge, fp: G.sceneFp, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), round });
};

test('kapı → tasarım kapısı → motor: başlık "cutaway" alır, başlık olarak kalır ve motor altına ara plan keser', async () => {
  const res = await gate(PROPS, SCENES, 3);
  assert.deepEqual(res.plan.patches.map((p) => [p.scene, p.fix]), [[5, 'cutaway']], 'anahtar söz kartına çevirme ("title-to-key") yok');
  // docu.js'in yolu: kayıtlı yama senaryoya anlatım parmak iziyle uygulanır.
  const fixed = G.applyGatePatches({ scenes: SCENES }, res.plan.patches).scenes[5];
  assert.deepEqual([fixed.type, fixed.title, fixed.textStyle, fixed.cutaway], ['title', 'It Burned Down in One Night', 'typewriter', true], 'başlığın tasarımı kalır');
  // Motor: işaretli başlık seçilir, kesim konuşulan bir sözde, resim tarifi satırın kendi aramasından.
  const voiced = { ...fixed, voiceDur: 5.76, wordTimes: TITLE_WORDS };
  assert.equal(I.insertable(voiced), true);
  const plan = I.planInserts({ scenes: SCENES.map((s, i) => (i === 5 ? voiced : { ...s, voiceDur: PROPS.scenes[i].voiceDur })) });
  const cut = plan.find((p) => p.i === 5);
  assert.ok(cut && cut.at.length >= 1 && cut.prompts.every((t) => t.startsWith('smoke mountain fog. ')), JSON.stringify(plan));
  // Kesilen başlıkla eleştirmen kancada bekleyen kare bulmaz; işaretli satır bir daha yama almaz (tur dönmez).
  const after = { scenes: PROPS.scenes.map((s, i) => (i === 5 ? { ...voiced, inserts: cut.at.map((at, k) => ({ src: `build/j/ins-t${k}.jpg`, at })) } : s)) };
  assert.deepEqual(C.critiqueTimeline(after, placeTimeline(after.scenes)).filter((x) => x.kind === 'hook_slow'), []);
  const again = await gate(PROPS, SCENES.map((s, i) => (i === 5 ? fixed : s)), 4);
  assert.deepEqual(again.plan.patches, [], 'işaretli başlık yeniden işaretlenmez');
});

test('kapının kestiği başlığı motor da keser: bölüm/sıralama kartı, resimsiz ve klipli başlık ikisinde de kesilmez', () => {
  const variants = {
    düz: { title: 'It Burned', image: 't.jpg', search: 'smoke mountain fog' },
    'bölüm kartı': { title: 'CHAPTER 2', image: 't.jpg', chapterCard: true },
    'sıralama kartı': { title: 'No. 3', image: 't.jpg', rankCard: { rank: 3, total: 10, item: 'x' } },
    resimsiz: { title: 'It Burned' },
    klipli: { title: 'It Burned', image: 't.jpg', video: 'v.mp4' },
  };
  for (const [name, v] of Object.entries(variants)) {
    const title = { type: 'title', say: TITLE_SAY, dur: 6.2, voiceDur: 5.76, ...v };
    const script = { scenes: [{ type: 'photo', say: 'a', image: 'a.jpg', dur: 3 }, title] };
    const rows = Q.sceneRows(script, null);
    const sh = C.stillShots(rows).find((h) => h.rows.some((r) => r.scene === 1)) || C.stillShots(rows)[0];
    const byGate = P.holdCuts([{ kind: 'hook_slow', time: +sh.start.toFixed(2), severity: 'medium' }], rows, script.scenes).includes(1);
    const byEngine = I.insertable({ ...title, cutaway: true });
    assert.equal(byGate, byEngine, `${name}: kapı ${byGate}, motor ${byEngine}`);
    assert.equal(byGate, name === 'düz', name);
  }
});

test('normal durum değişmedi: fotoğraf ve anahtar kelime kartı aynı "cutaway" yamasını alır', async () => {
  const words = (say, dur) => say.split(' ').map((word, k, w) => ({ word, t: +((k * dur) / w.length).toFixed(2) }));
  const scenes = [
    { type: 'photo', say: 'This is Paris on Saturday night in the worst unrest for years', archived: true, image: 'a.jpg', pace: 'hold', energy: 1, voiceDur: 6.2 },
    { type: 'words', textMode: 'key', bg: 'prev', say: 'exactly what the curfews cover', image: 'a.jpg', voiceDur: 3.3 },
  ];
  const props = { scenes: scenes.map((s) => ({ ...s, wordTimes: words(s.say, s.voiceDur) })) };
  const res = await gate(props, scenes, 1);
  assert.deepEqual(res.plan.patches.map((p) => [p.scene, p.fix]), [[0, 'cutaway'], [1, 'cutaway']]);
});

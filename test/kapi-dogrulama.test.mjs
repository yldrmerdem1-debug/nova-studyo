// 1.16.20 — KAPI KENDİ DÜZELTMESİNE BAKAR (France, 20 Ekim 2026; kanal sahibi: "en kral mimari derken sen bunu yapmadın
// mı zaten"). Ön izleme kapısı iki tur baktı ama 2. turun 10 yeniden seçimi ve 5 AI görseli hiç görülmeden render'a
// gitti (yeni seçimler yine yabancı polis: Filipin → NYPD), "BURNING CITY H" yarım başlığı için düzeltme yolu yoktu ve
// "kancada 6-7 sn aynı kare" yalnızca render'dan sonra bulunuyordu. Render sonrası denetim 26 sorun saydı.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const I = await import('../docu-engine/lib/inserts.mjs');
const { wordCut } = await import('../src/pipeline/docu-topic-bible.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const words = (say, dur) => {
  const w = say.split(' ');
  return w.map((word, k) => ({ word, t: +((k * dur) / w.length).toFixed(2) }));
};
const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(((s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };

test('doğrulama turu yalnızca değişen sahnelerin karesini çizer ve onlara bakar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapi-'));
  const scenes = [0, 1, 2, 3].map((i) => ({ type: 'photo', say: `line ${i}`, archived: true, image: `p${i}.jpg`, voiceDur: 3 }));
  const props = { scenes: scenes.map((s) => ({ ...s })) };
  let drawn = null;
  const render = async (items) => { drawn = items.length; for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
  let judged = null;
  const judge = async (o) => { judged = o.got.map((g) => g.row.scene); return { issues: [], vision: { calls: 1, frames: o.got.length, skipped: null } }; };
  const res = await P.previewGate({ props, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say, round: 2, only: new Set([1, 3]) });
  assert.equal(drawn, 2);
  assert.deepEqual(judged, [1, 3]);
  assert.equal(res.plan.repick.length + res.plan.ai.length + res.plan.patches.length, 0);
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-2.json'), 'utf8'));
  assert.deepEqual(rep.only, [1, 3]);
});

test('kancada 6 sn bekleyen kare render\'dan ÖNCE bulunur ve ara plan ister (yönetmenin "hold" temposu engel değil)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapi-'));
  const say0 = 'This is Paris on Saturday night in the worst unrest for years';
  const say1 = 'exactly what the curfews cover';
  const scenes = [
    { type: 'photo', say: say0, archived: true, image: 'a.jpg', pace: 'hold', energy: 1, voiceDur: 6.2 },
    { type: 'words', textMode: 'key', bg: 'prev', say: say1, image: 'a.jpg', voiceDur: 3.3 },
    { type: 'quote', say: 'no one was killed', archived: true, image: 'q.jpg', voiceDur: 5.4 },
  ];
  const props = { scenes: scenes.map((s) => ({ ...s, wordTimes: words(s.say, s.voiceDur) })) };
  const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
  const judge = async () => ({ issues: [], vision: { calls: 0, frames: 0, skipped: null } });
  const res = await P.previewGate({ props, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say });
  const cuts = res.plan.patches.filter((p) => p.fix === 'cutaway');
  assert.deepEqual(cuts.map((p) => p.scene), [0, 1], 'çekimdeki iki satır (önceki kareyi taşıyan anahtar kelime kartı dahil); alıntı kartı kesilmez');
  assert.ok(res.issues.some((x) => x.kind === 'hook_slow' && x.source === 'timeline'));
  // Zaten işaretliyse yeniden işaretlenmez: kesilemeyen satır turu döndürmez.
  const marked = scenes.map((s, i) => (i < 2 ? { ...s, cutaway: true } : s));
  const again = await P.previewGate({ props, scenes: marked, render, placeTimeline, dir, judge, fp: (s) => s.say, round: 2 });
  assert.equal(again.plan.patches.filter((p) => p.fix === 'cutaway').length, 0);
});

test('motor: işaretli satıra hold temposunda da ara plan keser; işaretsiz hold satırına kesmez', () => {
  const say = 'This is Paris on Saturday night in the worst unrest for years';
  const base = { type: 'photo', say, image: 'a.jpg', search: 'Paris riot night street', pace: 'hold', energy: 1, voiceDur: 6.2, caption: 'Paris, 17 October', wordTimes: words(say, 6.2) };
  assert.equal(I.insertable(base), false);
  assert.equal(I.insertable({ ...base, cutaway: true }), true, 'yer/tarih yazısı aynı anın yakın planında da doğru');
  assert.equal(I.insertable({ ...base, cutaway: true, name: 'Laurent Nuñez' }), false, 'isim kartı başkasının resmine binmez');
  const plan = I.planInserts({ scenes: [{ ...base, cutaway: true }, { ...base }] });
  assert.deepEqual(plan.map((p) => p.i), [0]);
  assert.ok(plan[0].at.length >= 1 && plan[0].at.every((t) => t > 0.7 && t < 6.2 - 0.5));
  const short = 'and which numbers can be trusted';
  assert.ok(I.insertMoments({ say: short, voiceDur: 2.7, cutaway: true, wordTimes: words(short, 2.7) }, 1).length === 1, '2,7 sn satırda da bir kesme');
});

test('şema/kart başlığı taşarsa başlık kalkar (eskiden düzeltme yolu yoktu); yazısız/anahtar kelime kartı denetçiye doğru anlatılır', () => {
  const scenes = [{ type: 'explainer', kind: 'sequence', say: 'And then the heat', title: 'FROM A HOT CLASSROOM TO A BURNING CITY H', steps: [{ label: 'Forty degrees' }] }];
  const plan = P.previewFixPlan([{ scene: 0, kind: 'text_overflow', severity: 'medium', detail: "Şema başlığı 'BURNING CITY H' kesik" }], scenes, { fp: (s) => s.say });
  assert.deepEqual(plan.patches.map((p) => p.fix), ['drop-title']);
  const fixed = G.applyFix(scenes[0], 'drop-title');
  assert.equal(fixed.title, undefined);
  assert.equal(fixed.steps.length, 1);
  assert.equal(G.applyFix({ type: 'title', title: 'X' }, 'drop-title').title, 'X', 'başlık sahnesinin kendisi silinmez');
  const qa = read('../src/pipeline/docu-qa.js');
  assert.ok(qa.includes('yazısız görüntü (anlatım resimle taşınır; yazı yok, kasıtlı)'));
});

test('model yarım kelime bıraktıysa (…BURNING CITY H) tek harf ve sarkan bağlaç düşer; "A" ve "I" kalır', () => {
  assert.equal(wordCut('FROM A HOT CLASSROOM TO A BURNING CITY H', 56), 'FROM A HOT CLASSROOM TO A BURNING CITY');
  assert.equal(wordCut('ROAD TO H', 56), 'ROAD');
  assert.equal(wordCut('PLAN A', 56), 'PLAN A');
  assert.equal(wordCut('WHAT AM I', 56), 'WHAT AM I');
});

test('arşiv aynı sahnede iki kez yanlış kare verirse sahne AI görseline düşer ve bir daha aranmaz', () => {
  assert.equal(Q.PICK_AI_AFTER, 2);
  const fixes = { scenes: { 37: { rejected: ['a', 'b'], tries: 2, ai: true }, 50: { rejected: ['c'], tries: 1 } } };
  assert.deepEqual(Q.qaAiOnly(fixes), [37]);
  const docu = { scenes: [] };
  docu.scenes[37] = { type: 'photo', archived: true, image: 'new-wrong.jpg', imgW: 1, imgH: 1 };
  docu.scenes[50] = { type: 'photo', archived: true, image: 'fresh.jpg' };
  const credits = { 'scene-37': { file: 'https://x/new-wrong.jpg' }, 'scene-50': { file: 'https://x/fresh.jpg' } };
  assert.equal(Q.applyQaRejections(docu, credits, fixes), 1);
  assert.equal(docu.scenes[37].archived, undefined, 'yeni (bakılmamış) seçim de olsa AI\'a düşer');
  assert.equal(docu.scenes[50].archived, true, 'ilk ret: yeni seçim kalır, doğrulama turunda bakılır');
});

test('akış: doğrulama turları, son turda AI\'a düşüş, temiz/bakılamadı kaydı, AI sahneleri arşivde aranmaz', () => {
  assert.equal(P.PREVIEW_ROUNDS, 6);
  assert.equal(P.FULL_ROUNDS, 1);
  const docu = read('../src/pipeline/docu.js');
  for (const s of [
    'const only = round > FULL_ROUNDS && prevPv ? new Set(prevPv.changed || []) : null;',
    'fp: sceneFp, round, only,',
    'const ai = lastRound || tries >= PICK_AI_AFTER;',
    'clean: !changed.length',
    'unverified: changed',
    'aiOnly: [...eraAiOnly(readEra(), era), ...qaAiOnly(readFixes())],',
    'Tek render: ön izleme kapısı temiz',
  ]) assert.ok(docu.includes(s), s);
});

test('kapı her ara planı ve uzun sahnenin ortasını da görür; ara plandaki sorun o ara planı kaldırır (Kartal Yuvası: 13→2 bulgu, render sonrası 21)', async () => {
  const scenes = [
    { type: 'photo', say: 'a', wordTimes: [{ t: 0.2 }, { t: 5 }], inserts: [{ src: 'img-1.jpg', at: 1.2 }, { src: 'img-2.jpg', at: 3.0 }] },
    { type: 'photo', say: 'b', wordTimes: [{ t: 9.5 }] },
    { type: 'photo', say: 'c', wordTimes: [{ t: 2 }] },
  ];
  const placed = [{ from: 0, frames: 180 }, { from: 180, frames: 330 }, { from: 510, frames: 90 }];
  const m = P.previewMoments(scenes, placed);
  assert.equal(m.filter((x) => x.r === 0).length, 3, 'sahnenin kendi karesi + 2 ara plan');
  assert.deepEqual(m.filter((x) => x.ins !== undefined).map((x) => x.ins), [0, 1]);
  assert.equal(m.filter((x) => x.r === 1).length, 2, '11 sn ara plansız sahnenin ortası da');
  assert.equal(m.filter((x) => x.r === 2).length, 1);
  const plan = P.previewFixPlan([{ scene: 0, kind: 'mismatch', severity: 'medium', detail: 'Hint plakalı motosiklet', insert: true }], [{ type: 'photo', say: 'a', archived: true }], { fp: (s) => s.say });
  assert.deepEqual(plan.patches.map((p) => p.fix), ['no-inserts']);
  assert.equal(plan.repick.length, 0, 'sahnenin gerçek fotoğrafı yeniden seçilmez');
  assert.equal(G.applyFix({ type: 'photo', cutaway: true }, 'no-inserts').noInserts, true);
  assert.equal(I.insertable({ type: 'photo', image: 'a.jpg', voiceDur: 6, noInserts: true, cutaway: true }), false);
  assert.ok(read('../src/pipeline/docu-qa.js').includes('[ara plan: AI görseli]'), 'denetçiye ara planın AI olduğu söylenir');
  assert.ok(read('../src/pipeline/docu-preview.js').includes('x.insert = true'));
});

test('bitiş ekranı sessiz kalmaz: sondaki 3 sn\'den uzun planlı sessizlik son parçayla dolar (Kartal Yuvası: 7,8 sn sessizlik)', async () => {
  const A = await import('../docu-engine/lib/audio-director.mjs');
  assert.equal(A.END_SILENCE_MAX, 3);
  const src = read('../docu-engine/lib/audio-director.mjs');
  assert.ok(src.includes('lastCue.toSec - lastCue.fromSec > END_SILENCE_MAX') && src.includes('lastMusic.tail = true'));
});

test('son okuma izleyici çağrısını silemez (25 Ekim 2026: üç videoda kancadaki beğen-abone-yorum üçlüsü "meta" diye silindi)', async () => {
  const E = await import('../src/pipeline/docu-editor-pass.js');
  const scenes = [
    { type: 'photo', say: 'France said its submarine had struck an object.' },
    { type: 'photo', say: 'It was a British nuclear submarine.' },
    { type: 'photo', say: 'Like and subscribe for the answer, and leave your guess in the comments.' },
    { type: 'photo', say: 'Both carried missiles.' },
    { type: 'photo', say: 'If you are watching in its first week, tap Hype.' },
    { type: 'photo', say: 'x' }, { type: 'photo', say: 'y' }, { type: 'photo', say: 'z' },
  ];
  const r = E.applyEditorEdits(scenes, [
    { scene: 2, action: 'drop', kind: 'meta', reason: 'hikâyeyi frenliyor' },
    { scene: 4, action: 'rewrite', kind: 'meta', say: 'Both boats went home.' },
  ]);
  assert.equal(r.applied.length, 0);
  assert.equal(r.rejected.length, 2);
  assert.match(scenes[2].say, /subscribe/);
  assert.match(scenes[4].say, /Hype/);
});

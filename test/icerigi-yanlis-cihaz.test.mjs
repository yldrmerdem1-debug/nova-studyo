// İÇERİĞİ YANLIŞ CİHAZ — kapı ve render sonrası denetim görme modelinin bulgusunu atmaz.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): ön izleme kapısının görme denetimi iki
// turda da sahne 17'deki haritayı buldu ("Berchtesgaden, Obersalzberg ve Kehlstein Almanya'da olduğu halde Avusturya
// bayrağı alanının içine yerleştirilmiş") ve sahne 98'in bölünmüş ekranını ("'BERGHOF: HIS HOME' etiketli sol yarıda
// Berghof yok"). rapor-tur-1.json'da ikisi de yoktu (13 bulgu), hiçbiri düzeltilmedi. Render sonrası docu-qa-vision.json
// haritayı 72-74. karelerde HIGH, uydurma "CNN" gazetesini (kare 46, ai_look) ve bölünmüş ekranı yine buldu; qa.json
// yalnızca haritanın etiket taşmasını tuttu, qualityWarnings'e hiçbiri girmedi. Sebep: judgeFrames'te "stilize cihazda
// yalnızca taşma ve bozukluk" süzgeci — harita/bölünmüş ekran/manşetin İÇERİK hatasını da atıyordu; previewFixPlan'ın
// da cihaz sahnesi için düzeltmesi yoktu. Artık: içerik taşıyan cihazda uyuşmazlık, yanlış yüz ve AI görünümü kalır
// (fix "device-fallback": sahne sade görsele döner), tekrar bildirilir ama düzeltilmez (bölünmüş ekranın fromScene
// paneli bilerek önceki resmi taşır); kırpma/dönem/jenerik ve sayaç gibi cihazlar eskisi gibi süzülür. Ağ ve ücretli
// çağrı YOK, ffmpeg çalıştırılmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-cihaz-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const Q = await import('../src/pipeline/docu-qa.js');
const P = await import('../src/pipeline/docu-preview.js');

// Motora giden senaryodan (docu/engine-script.json) kısaltılmış sahneler: 4, 17 (harita), 98 (bölünmüş ekran), 11 (CNN manşeti), 8 (sayaç).
const SCENES = [
  { type: 'photo', say: 'By Saturday, it was almost completely destroyed.', source: 'archive', search: 'Kehlsteinhaus destroyed fire ruins', image: 'build/j/img-fc626bd66b4a.jpg', voiceDur: 2.9 },
  { type: 'map', say: 'The route runs from Berchtesgaden, past the Obersalzberg, up toward the Kehlstein, close to the Austrian border near Salzburg.', region: 'world', box: [3.597, 44.24, 22.102, 51.24], points: [{ label: 'Traunstein', x: 0.4889, y: 0.4816 }, { label: 'Salzburg', x: 0.5111, y: 0.4901 }, { label: 'Berchtesgaden', x: 0.5083, y: 0.5155 }, { label: 'Obersalzberg', x: 0.5105, y: 0.5158 }, { label: 'Kehlstein', x: 0.5104, y: 0.5183 }], countries: ['Austria'], route: [2, 3, 4], line: 'route', focus: 4, mapName: 'Austria', dur: 7, voiceDur: 6.6 },
  { type: 'split', say: "Hitler's actual home was the Berghof, on the Obersalzberg below, a separate building entirely.", source: 'archive', search: 'Entrance to the Berghof 1930s', commons: 'File:Entrance to the Berghof (242-EB-3-14D).jpg', left: { label: 'BERGHOF: HIS HOME', own: true }, right: { fromScene: 85 }, mode: 'versus', image: 'build/j/cm-87fe4189.jpg', archived: true, dur: 6, voiceDur: 5.6 },
  { type: 'headline', say: "Headlines around the world called it Hitler's mountain retreat.", paper: 'CNN', headline: "Fire engulfs Hitler's 'Eagle's Nest' mountain retreat", date: 'October 24, 2026', imagePrompt: 'Close detail of a news website on a laptop screen in a dark room', dur: 4, voiceDur: 3.5 },
  { type: 'counter', say: 'The house stood at 1,834 meters,', from: 0, to: 1834, label: 'METERS ABOVE SEA LEVEL', counterStyle: 'photo', backdrop: { kind: 'related', tone: 'dark' }, dur: 3, voiceDur: 2.8 },
];
const row = (i, t) => ({ t, row: { r: i, scene: i, start: t - 1, end: t + 2, s: SCENES[i] }, mid: true });
// Modelin ham bulguları (iki kapı turunun ve render sonrası denetimin docu-*-vision.json kayıtlarından).
const MAP_MISMATCH = { kind: 'mismatch', severity: 'high', detail: "Harita 'AUSTRIA' başlıklı ve Avusturya bayrağıyla dolu; Berchtesgaden, Obersalzberg ve Kehlstein Avusturya içindeymiş gibi gösteriliyor. Bu yerler Almanya'da (Bavyera)." };
const SPLIT_MISMATCH = { kind: 'mismatch', severity: 'medium', detail: "Bölünmüş ekranda 'BERGHOF: HIS HOME' etiketli sol yarıda Berghof yok; yalnızca ağaçlar ve bir patika görünüyor." };
const SPLIT_REPEAT = { kind: 'repeat', severity: 'low', detail: "Sağ paneldeki Kehlsteinhaus fotoğrafı #234–#235'te kullanılan görüntünün aynısı." };
const CNN = { kind: 'ai_look', severity: 'low', detail: "Gazete başlığında 'CNN' yazıyor, oysa CNN bir televizyon kanalı, gazetesi yok." };
const COUNTER_REPEAT = { kind: 'repeat', severity: 'medium', detail: "#8'deki şömineli iç mekân görseli sayacın arka planı olarak hemen yeniden kullanılmış." };

test('görme bulgusu: içerik taşıyan cihazda uyuşmazlık / yanlış yüz / AI görünümü kalır ve "device-fallback" alır (eskiden atılıyordu)', () => {
  const map = Q.visionIssue({ frame: 73, ...MAP_MISMATCH }, row(1, 72.4));
  assert.ok(map, 'Avusturya haritası artık atılmıyor');
  assert.deepEqual([map.scene, map.kind, map.severity, map.fix, map.device, map.source], [1, 'mismatch', 'high', 'device-fallback', true, 'vision']);
  assert.equal(Q.visionIssue({ frame: 104, ...SPLIT_MISMATCH }, row(2, 251)).fix, 'device-fallback', 'arşiv resimli bölünmüş ekran yeniden seçilmez (repick değil): sorun panelde');
  assert.equal(Q.visionIssue({ frame: 46, ...CNN }, row(3, 46)).fix, 'device-fallback', 'uydurma CNN gazetesi');
  assert.equal(Q.visionIssue({ frame: 9, kind: 'wrong_face', severity: 'high', detail: 'x' }, row(2, 9)).fix, 'device-fallback');
  // Tekrar: bildirilir, düzeltilmez — bölünmüş ekranın fromScene paneli önceki sahnenin resmini bilerek taşır.
  const rep = Q.visionIssue({ frame: 251, ...SPLIT_REPEAT }, row(2, 251));
  assert.deepEqual([rep.kind, rep.fix, rep.device], ['repeat', 'review', true]);
});

test('görme bulgusu: kırpma / dönem / jenerik cihazda yine anlamsız; sayaç ve bölüm kartı eskisi gibi yalnızca taşma ve bozukluk; fotoğraf değişmedi', () => {
  for (const kind of ['bad_crop', 'anachronism', 'generic']) assert.equal(Q.visionIssue({ frame: 1, kind, severity: 'high', detail: 'x' }, row(1, 72)), null, kind);
  assert.equal(Q.visionIssue({ frame: 9, ...COUNTER_REPEAT }, row(4, 30)), null, 'sayacın "related" arka planı bilerek tekrar eder');
  assert.equal(Q.visionIssue({ frame: 9, kind: 'mismatch', severity: 'high', detail: 'x' }, row(4, 30)), null);
  assert.equal(Q.visionIssue({ frame: 9, kind: 'text_overflow', severity: 'low', detail: "'12 HOURS' altı okunmuyor" }, row(4, 30)).fix, 'edit-text');
  assert.equal(Q.visionIssue({ frame: 72, kind: 'text_overflow', severity: 'low', detail: 'etiketler üst üste' }, row(1, 72)).device, undefined, 'haritanın etiket taşması eskisi gibi');
  const card = { t: 5, row: { r: 0, scene: null, start: 4, end: 7, s: { type: 'title', chapterCard: true, title: 'BÖLÜM 2' } }, mid: true };
  assert.equal(Q.visionIssue({ frame: 1, kind: 'mismatch', severity: 'high', detail: 'x' }, card), null);
  const photo = Q.visionIssue({ frame: 1, kind: 'mismatch', severity: 'medium', detail: 'x' }, { t: 2, row: { r: 0, scene: 0, start: 0, end: 3, s: { type: 'photo', archived: true, image: 'a.jpg' } }, mid: true });
  assert.deepEqual([photo.fix, photo.device], ['repick', undefined]);
  assert.equal(Q.visionIssue({ frame: 1, kind: 'blurry', severity: 'high', detail: 'x' }, row(1, 72)), null, 'şemada olmayan tür');
  assert.equal(Q.visionIssue({ frame: 99, ...MAP_MISMATCH }, undefined), null, 'kare yok');
  assert.ok(fs.readFileSync(new URL('../src/pipeline/docu-qa.js', import.meta.url), 'utf8').includes('const x = visionIssue(it, got[it.frame - 1]);'), 'judgeFrames (kapı + render sonrası) aynı kuralı kullanır');
});

test('düzeltme planı: orta/yüksek önemli cihaz bulgusu "device-fallback" yaması olur; düşük önemli cihaz notu yalnızca bildirilir; tekrar ve cihazı kalmamış sahne yama almaz', () => {
  const issues = [
    Q.visionIssue({ frame: 2, ...MAP_MISMATCH, severity: 'medium' }, row(1, 12)),
    Q.visionIssue({ frame: 3, ...SPLIT_MISMATCH }, row(2, 20)),
    Q.visionIssue({ frame: 4, ...CNN, severity: 'medium' }, row(3, 26)),
    Q.visionIssue({ frame: 3, ...SPLIT_REPEAT, severity: 'medium' }, row(2, 20)),
  ];
  // 1. tur incelemesi (25 Ekim 2026): düşük önemli tek not (işin CNN bulgusu low) bilinçli manşeti düz resme çeviriyordu.
  // Cihazın düzeltmesi en az orta önemde; düşük önemli fotoğraf uyuşmazlığı eskisi gibi düzeltilir (tek render).
  const lowCnn = P.previewFixPlan([Q.visionIssue({ frame: 4, ...CNN }, row(3, 26))], SCENES, { fp: (s) => s.say });
  assert.equal(lowCnn.patches.length + lowCnn.repick.length + lowCnn.ai.length, 0, 'düşük önemli CNN notu manşeti dönüştürmez');
  const lowPhoto = P.previewFixPlan([{ scene: 0, kind: 'mismatch', severity: 'low', detail: 'x', fix: 'review' }], SCENES.map((s, i) => (i === 0 ? { ...s, imagePrompt: 'ruins' } : s)), { fp: (s) => s.say });
  assert.deepEqual(lowPhoto.ai.map((a) => a.scene), [0], 'fotoğrafta düşük önemli uyuşmazlık yine düzeltilir');
  const plan = P.previewFixPlan(issues, SCENES, { fp: (s) => s.say.slice(0, 12) });
  assert.deepEqual(plan.patches.map((p) => [p.scene, p.fix]), [[1, 'device-fallback'], [2, 'device-fallback'], [3, 'device-fallback']]);
  assert.equal(plan.patches[0].say, SCENES[1].say.slice(0, 12), 'yama sahneyi anlatımın parmak iziyle bulur');
  assert.equal(plan.repick.length + plan.ai.length, 0, 'arşiv resimli bölünmüş ekranın arşiv seçimi geçersiz sayılmaz');
  const onlyRepeat = P.previewFixPlan([issues[3]], SCENES, { fp: (s) => s.say });
  assert.equal(onlyRepeat.patches.length + onlyRepeat.repick.length + onlyRepeat.ai.length, 0, 'fromScene paneli bozulmaz');
  // Önceki turda sade görsele dönmüş sahne (artık fotoğraf) yeniden yama almaz: tur dönmez.
  const fixed = SCENES.map((s, i) => (i === 1 ? { type: 'words', say: s.say, text: 'near Salzburg', bg: 'prev' } : s));
  assert.equal(P.previewFixPlan([issues[0]], fixed, { fp: (s) => s.say }).patches.length, 0);
  assert.equal(P.previewFixPlan([issues[0]], SCENES).patches.length, 0, 'parmak izi yoksa yama yok (diğer yamalar gibi)');
});

test('kapı: görme denetiminin cihaz bulguları rapora ve plana girer (Kartal Yuvası rapor-tur-1: harita ve bölünmüş ekran yoktu)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-cihaz-kapi-'));
  const props = { scenes: SCENES.map((s) => ({ ...s })) };
  const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
  const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
  // judgeFrames'in yaptığı gibi: modelin kare numaralı ham bulguları aynı kuraldan geçer.
  const raw = [{ frame: 2, ...MAP_MISMATCH, severity: 'medium' }, { frame: 3, ...SPLIT_MISMATCH }, { frame: 4, ...CNN, severity: 'medium' }, { frame: 5, ...COUNTER_REPEAT }];
  const judge = async (o) => ({ issues: raw.map((it) => Q.visionIssue(it, o.got[it.frame - 1])).filter(Boolean), vision: { calls: 1, frames: o.got.length, skipped: null } });
  const logs = [];
  const res = await P.previewGate({ props, scenes: SCENES, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), logFn: (m) => logs.push(m) });
  assert.deepEqual(res.plan.patches.map((p) => [p.scene, p.fix]), [[1, 'device-fallback'], [2, 'device-fallback'], [3, 'device-fallback']]);
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-1.json'), 'utf8'));
  assert.ok(rep.issues.some((x) => x.scene === 1 && x.kind === 'mismatch' && /Avusturya/.test(x.detail)), 'harita bulgusu raporda');
  assert.ok(rep.issues.some((x) => x.scene === 2 && /BERGHOF/.test(x.detail)), 'bölünmüş ekran bulgusu raporda');
  assert.ok(!rep.issues.some((x) => x.scene === 4), 'sayacın arka plan tekrarı süzüldü');
  assert.ok(logs.some((m) => m.includes('3 cihaz sade görsele dönecek') && m.includes('0 yazı sadeleşecek')), logs.join('\n'));
});

test('render sonrası: cihaz bulgusu qa uyarılarına girer (eskiden qualityWarnings\'te yoktu)', () => {
  const issues = [Q.visionIssue({ frame: 73, ...MAP_MISMATCH }, row(1, 72.4))];
  const w = Q.qaWarnings({ issues, vision: { skipped: null } });
  assert.match(w[0], /1 anlatımla uyuşmayan görsel \(sahne 2\)/);
  assert.match(w[1], /^QA 1:12 sahne 2: anlatımla uyuşmayan görsel — Harita 'AUSTRIA'.*\(öneri: device-fallback\)$/);
});

test('cihazın yalnızca bildirilen tekrarı, cihazın kendi resminin senaryodaki tekrarını (repick) ezmez', async () => {
  // Arşiv resimli bölünmüş ekranın KENDİ resmi 40 sn önce de ekrandaydı (uzak tekrar → yeniden seçim); model aynı sahnede
  // fromScene panelinin tekrarını da bildirdi. Cihaz bulgusu "review" olduğu için senaryonun repick'ini silmemeli.
  const own = 'build/j/cm-87fe4189.jpg';
  const scenes = [
    { type: 'photo', say: 'This is the Berghof entrance.', image: own, archived: true, source: 'archive', search: 'Berghof', dur: 4, voiceDur: 3.5 },
    ...Array.from({ length: 10 }, (_, k) => ({ type: 'photo', say: `Filler line ${k}.`, image: `build/j/f${k}.jpg`, dur: 4, voiceDur: 3.5 })),
    { ...SCENES[2], image: own },
    { type: 'photo', say: 'The end.', image: 'build/j/z.jpg', dur: 4, voiceDur: 3.5 },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-cihaz-tekrar-'));
  const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
  const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
  const judge = async (o) => {
    const k = o.got.findIndex((g) => g.row.scene === 11);
    return { issues: [Q.visionIssue({ frame: k + 1, ...SPLIT_REPEAT, severity: 'medium' }, o.got[k])], vision: { calls: 1, frames: o.got.length, skipped: null } };
  };
  const res = await P.previewGate({ props: { scenes }, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe') });
  assert.deepEqual(res.plan.repick.map((f) => f.scene), [11], 'senaryodaki uzak tekrar yeniden seçilir (eskiden olduğu gibi)');
  assert.deepEqual(res.plan.patches, [], 'cihaz sade görsele dönmez: sorun tekrar, içerik değil');
  // Render sonrası denetim de aynı: senaryo/dHash tekrarı önce eklenir, cihazın "review" tekrarı onu ezmez.
  assert.ok(fs.readFileSync(new URL('../src/pipeline/docu-qa.js', import.meta.url), 'utf8').includes('if (!(x.device && x.kind === "repeat" && issues.some((i) => i.scene === x.scene && i.kind === "repeat"))) add(x);'));
});

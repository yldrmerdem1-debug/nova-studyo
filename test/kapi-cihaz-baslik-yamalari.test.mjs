// KAPININ CİHAZ YAMASI SAHNEYİ GERÇEKTEN DEĞİŞTİRİR — "device-fallback" (docu-design-gate applyFix); "title-to-key" emekli.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): ön izleme kapısı sahne 17'nin haritasını
// (Almanya'daki yerler Avusturya bayrağının içinde), sahne 98'in bölünmüş ekranını (Berghof'suz "BERGHOF: HIS HOME"
// paneli) ve uydurma "CNN" gazetesini buldu; kancadaki başlık kartı ("It Burned Down in One Night", 6,2 sn) dört
// turun dördünde de yavaş kanca diye yazıldı. Kapı artık bunlara "device-fallback" ve "title-to-key" yaması veriyor
// (docu-preview.js), ama applyFix bu adları tanımıyordu: default dalı sahneyi olduğu gibi bırakır, docu.js sahneyi
// değişti sayar ve her doğrulama turu aynı bulguyu PREVIEW_ROUNDS'a (6) kadar yeniden işaretlerdi. Artık iki yama da
// sahneye uygulanır ve ikinci uygulamada bir şey değişmez (tur dönmez). Ağ ve ücretli çağrı YOK, ffmpeg çalıştırılmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapi-yama-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const G = await import('../src/pipeline/docu-design-gate.js');
const I = await import('../docu-engine/lib/inserts.mjs');

// Motora giden senaryodan (docu/engine-script.json) kısaltılmış sahneler: 17 (harita), 98 (bölünmüş ekran), 11 (CNN manşeti).
const MAP17 = { type: 'map', chapter: 1, say: 'The route runs from Berchtesgaden, past the Obersalzberg, up toward the Kehlstein, close to the Austrian border near Salzburg.', region: 'world', box: [3.597, 44.24, 22.102, 51.24], points: [{ label: 'Traunstein', x: 0.4889, y: 0.4816 }, { label: 'Salzburg', x: 0.5111, y: 0.4901 }, { label: 'Berchtesgaden', x: 0.5083, y: 0.5155 }, { label: 'Obersalzberg', x: 0.5105, y: 0.5158 }, { label: 'Kehlstein', x: 0.5104, y: 0.5183 }], countries: ['Austria'], route: [2, 3, 4], line: 'route', focus: 4, mapName: 'Austria', dur: 7, voiceDur: 6.6 };
const SPLIT98 = { type: 'split', chapter: 4, say: "Hitler's actual home was the Berghof, on the Obersalzberg below, a separate building entirely.", source: 'archive', search: 'Entrance to the Berghof 1930s', commons: 'File:Entrance to the Berghof (242-EB-3-14D).jpg', left: { label: 'BERGHOF: HIS HOME', own: true }, right: { fromScene: 85 }, mode: 'versus', image: 'build/j/cm-87fe4189.jpg', archived: true, dur: 6, voiceDur: 5.6 };
const CNN11 = { type: 'headline', chapter: 0, say: "Headlines around the world called it Hitler's mountain retreat.", paper: 'CNN', headline: "Fire engulfs Hitler's 'Eagle's Nest' mountain retreat", date: 'October 24, 2026', imagePrompt: 'Close detail of a news website on a laptop screen in a dark room', dur: 4, voiceDur: 3.5 };
// Motorun hazırlık senaryosundaki kanca başlığı (sahne 6, indeks 5).
const TITLE_SAY = "By the end, you'll know what happened on the mountain on Friday night, and what was truly lost.";
const TITLE5 = { type: 'title', say: TITLE_SAY, title: 'It Burned Down in One Night', image: 'build/j/arch-15e5efeaa971.jpg', textStyle: 'typewriter', archived: true, dur: 6 };

test('device-fallback: işin haritası sade görsele döner (resim kaynağı yok → önceki karenin üstünde yazı)', () => {
  const out = G.applyFix(MAP17, 'device-fallback');
  assert.equal(out.type, 'words');
  assert.equal(out.bg, 'prev');
  for (const k of ['countries', 'points', 'focus', 'mapName', 'box', 'route', 'region']) assert.ok(!(k in out), `${k} kalktı`);
  assert.equal(out.say, MAP17.say, 'anlatım değişmez (yama sahneyi parmak iziyle bulur)');
  assert.equal(MAP17.type, 'map', 'girdi sahnesi bozulmaz');
});

test('device-fallback: arşiv resimli bölünmüş ekran ve CNN manşeti kendi resmiyle fotoğraf olur', () => {
  const split = G.applyFix(SPLIT98, 'device-fallback');
  assert.equal(split.type, 'photo');
  assert.equal(split.image, SPLIT98.image, 'arşiv resmi kalır');
  assert.equal(split.archived, true);
  for (const k of ['left', 'right', 'mode']) assert.ok(!(k in split), `${k} kalktı`);
  const cnn = G.applyFix(CNN11, 'device-fallback');
  assert.equal(cnn.type, 'photo');
  assert.equal(cnn.imagePrompt, CNN11.imagePrompt);
  assert.ok(!cnn.paper && !cnn.headline, 'uydurma gazete ekrandan kalkar');
});

test('device-fallback: içerik taşımayan cihaza ve dönmüş sahneye dokunmaz (tur dönmez)', () => {
  const counter = { type: 'counter', say: 'The house stood at 1,834 meters,', from: 0, to: 1834, label: 'METERS ABOVE SEA LEVEL', dur: 3 };
  assert.deepEqual(G.applyFix(counter, 'device-fallback'), counter);
  const photo = { type: 'photo', say: 'a', image: 'a.jpg' };
  assert.deepEqual(G.applyFix(photo, 'device-fallback'), photo);
  const once = G.applyFix(MAP17, 'device-fallback');
  assert.deepEqual(G.applyFix(once, 'device-fallback'), once, 'ikinci uygulama aynı sahne');
});

// "title-to-key" EMEKLİ (1. tur incelemesi, 25 Ekim 2026): kapı kancadaki başlığa artık fotoğraftaki aynı "cutaway"
// yamasını veriyor (başlık yerinde kalır, PlainTitle altına ara plan çizer: kapi-baslik-ara-plani, kesilen-baslik-ara-plani);
// söz kartına çevirme yanlıştı (söz karesi anlatımın hizalamasından gelir, başlık söylenmez). Hiçbir şey bu adı üretmiyor:
// applyFix'teki ölü dal kalktı. Kayıtlı eski bir "title-to-key" yaması sahneyi değiştirmez (bilinmeyen düzeltme).
test('title-to-key artık düzeltme değil: başlık başlık olarak kalır; kapı ve tasarım kapısı bu adı üretmez', () => {
  assert.deepEqual(G.applyFix(TITLE5, 'title-to-key'), TITLE5, 'söz kartına çevrilmez');
  const card = { type: 'title', chapterCard: true, title: 'CHAPTER 2', say: 'x' };
  assert.deepEqual(G.applyFix(card, 'title-to-key'), card);
  for (const f of ['../src/pipeline/docu-preview.js', '../src/pipeline/docu-design-gate.js']) {
    assert.ok(!fs.readFileSync(new URL(f, import.meta.url), 'utf8').includes('title-to-key'), f);
  }
  // Kapının yolu: "cutaway" başlığı motorun kestiği satır yapar.
  const cut = G.applyFix(TITLE5, 'cutaway');
  assert.deepEqual([cut.type, cut.title, cut.cutaway], ['title', 'It Burned Down in One Night', true]);
  assert.equal(I.insertable({ ...cut, voiceDur: 5.76 }), true);
});

test('kayıtlı ön izleme yamaları senaryoya docu.js\'in yolundan (applyGatePatches) uygulanır', () => {
  const card = { type: 'title', chapterCard: true, title: 'CHAPTER 1', say: TITLE_SAY };
  const script = { scenes: [MAP17, TITLE5, SPLIT98, card] };
  const patches = [
    { say: G.sceneFp(MAP17), fix: 'device-fallback' },
    { say: G.sceneFp(TITLE5), fix: 'cutaway' },
    { say: G.sceneFp(SPLIT98), fix: 'device-fallback' },
  ];
  const logs = [];
  const out = G.applyGatePatches(script, patches, { logFn: (m) => logs.push(m) });
  assert.deepEqual(out.scenes.map((s) => s.type), ['words', 'title', 'photo', 'title']);
  assert.equal(out.scenes[1].cutaway, true);
  assert.equal(out.scenes[3], card, 'aynı anlatımlı bölüm kartı yama almaz');
  assert.ok(logs.some((m) => m.includes('3 sahne') && m.includes('device-fallback') && m.includes('cutaway')), logs.join('\n'));
  // Normal durum değişmedi: bilinmeyen düzeltme sahneyi olduğu gibi bırakır.
  assert.deepEqual(G.applyFix(MAP17, 'unknown-fix'), MAP17);
});

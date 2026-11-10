// UZAK TEKRAR: AYNI FOTOĞRAF BAŞKA DOSYA ADIYLA DA TEKRARDIR (künyenin kalıcı adresiyle).
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): docu-archive-done.json scene-12 (wikimedia,
// cm-1f2c309dc85c.jpg, url thumb.wikimedia.org) ile scene-79 (openverse, arch-*.jpg, upload.wikimedia.org/…/
// Kehlsteinhaus_zep%C5%99edu.jpg) aynı fotoğraftı; aynı kare videoda iki kez ekrana geldi. Kalite denetiminin uzak tekrar
// kuralı (docu-qa.js farRepeats) yalnızca resim DOSYA YOLUNA bakıyordu: iki ayrı dosya adı iki ayrı resim sayıldı, tekrar
// raporlanmadı. Künye verilirse resmin dosyasıyla eşleşen künyenin photoKey'i de anahtar. Ağ, ffmpeg ve görme modeli YOK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-uzak-tekrar-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Q = await import('../src/pipeline/docu-qa.js');

const UPLOAD = 'https://upload.wikimedia.org/wikipedia/commons/3/32/Kehlsteinhaus_zep%C5%99edu.jpg';
const THUMB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Kehlsteinhaus_zep%C5%99edu.jpg/3840px-Kehlsteinhaus_zep%C5%99edu.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail';
const SAYFA = 'https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_zep%C5%99edu.jpg';
const B = 'build/kartal';

const row = (i, image, start, extra = {}) => ({ s: { type: 'photo', image, archived: true, ...extra }, start, end: start + 6, scene: i, r: i });
// Kartal'ın biçimi: açılışta adıyla alınan dosya (0:48), dakikalar sonra aramadaki kopyası (6:42), araya başka resimler.
const kartal = () => [
  row(0, `${B}/arch-a1.jpg`, 3), row(1, `${B}/cm-1f2c309dc85c.jpg`, 48), row(2, `${B}/arch-b2.jpg`, 120),
  row(3, `${B}/arch-c3.jpg`, 250), row(4, `${B}/arch-d4.jpg`, 402), row(5, `${B}/arch-e5.jpg`, 500),
];
const CREDITS = {
  'scene-0': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/a/aa/Obersalzberg.jpg', file: `${B}/arch-a1.jpg` },
  'scene-1': { provider: 'wikimedia', url: THUMB, sayfa: SAYFA, file: `${B}/cm-1f2c309dc85c.jpg` },
  'scene-2': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Kehlsteinstrasse.jpg', file: `${B}/arch-b2.jpg` },
  'scene-3': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Berghof.jpg', file: `${B}/arch-c3.jpg` },
  'scene-4': { provider: 'openverse', url: UPLOAD, sayfa: 'https://www.flickr.com/photos/someone/123456/', file: `${B}/arch-d4.jpg` },
  'scene-5': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/e/ee/Fire.jpg', file: `${B}/arch-e5.jpg` },
};

test('Kartal: cm-*.jpg (thumb adresi) ve arch-*.jpg (upload adresi) aynı fotoğraf — künyeyle tekrar bulunur, künyesiz eski davranış', () => {
  assert.deepEqual(Q.farRepeats(kartal()), [], 'künye verilmezse yalnızca dosya yolu (eski davranış)');
  const far = Q.farRepeats(kartal(), { credits: CREDITS });
  assert.deepEqual(far.map((x) => [x.row.scene, x.first.scene, x.count]), [[4, 1, 2]]);
});

test('künye dosyadan bulunur: kayan scene-N sırası ve motorun açtığı .lift.jpg resim de eşleşir', () => {
  // Ses klibi araya girince (source-clips.js) künye anahtarları eski sırada kalır: sıra değil dosya belirleyici.
  const kaymis = Object.fromEntries(Object.entries(CREDITS).map(([k, c]) => [`scene-${Number(k.slice(6)) + 7}`, c]));
  assert.deepEqual(Q.farRepeats(kartal(), { credits: kaymis }).map((x) => x.row.scene), [4]);
  const rows = kartal();
  rows[4].s.image = `${B}/arch-d4.lift.jpg`;
  assert.deepEqual(Q.farRepeats(rows, { credits: CREDITS }).map((x) => x.row.scene), [4], 'karanlık resmin açılmış hali aynı künye');
  // Commons dosya sayfası tek fotoğraftır: adresi başka biçimde olan kopya sayfasıyla tanınır.
  const sayfali = { ...CREDITS, 'scene-4': { provider: 'openverse', url: 'https://api.openverse.org/v1/images/9f1c/thumb/', sayfa: SAYFA, file: `${B}/arch-d4.jpg` } };
  assert.deepEqual(Q.farRepeats(kartal(), { credits: sayfali }).map((x) => x.row.scene), [4]);
});

test('aynı sayfa ≠ aynı fotoğraf: müze sayfasının iki görünüşü ve aynı YouTube videosunun iki anı tekrar değil', () => {
  const muze = 'https://www.si.edu/object/naval-mine:nmah_123';
  const rows = [row(0, `${B}/arch-m1.jpg`, 10), row(1, `${B}/arch-x.jpg`, 60), row(2, `${B}/arch-m2.jpg`, 200)];
  const c = {
    'scene-0': { provider: 'smithsonian', url: 'https://ids.si.edu/ids/deliveryService?id=NMAH-1', sayfa: muze, file: `${B}/arch-m1.jpg` },
    'scene-1': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/x/xx/X.jpg', file: `${B}/arch-x.jpg` },
    'scene-2': { provider: 'smithsonian', url: 'https://ids.si.edu/ids/deliveryService?id=NMAH-2', sayfa: muze, file: `${B}/arch-m2.jpg` },
  };
  assert.deepEqual(Q.farRepeats(rows, { credits: c }), [], 'müze sayfası birden çok görünüş taşır');
  // Kaynak klipleri: künye klibin dosyasını ve videonun adresini taşır; iki sahne aynı videonun başka anları.
  const yt = 'https://www.youtube.com/watch?v=abcdefghijk';
  const klip = (n) => ({ provider: 'youtube', url: yt, sayfa: yt, file: `${B}/src-${n}.mp4`, type: 'video' });
  const clips = [row(0, `${B}/src-1.jpg`, 10, { video: `${B}/src-1.mp4` }), row(1, `${B}/arch-x.jpg`, 60), row(2, `${B}/src-2.jpg`, 200, { video: `${B}/src-2.mp4` })];
  assert.deepEqual(Q.farRepeats(clips, { credits: { 'scene-0': klip(1), 'scene-1': c['scene-1'], 'scene-2': klip(2) } }), []);
});

test('tek fotoğraflık stok sayfası: aynı Pixabay fotoğrafının iki imzalı adresi tekrar; kapanışta açılışa dönüş serbest', () => {
  const SAYFA_PX = 'https://pixabay.com/photos/cargo-ship-seagoing-vessel-7240023/';
  const jeton = (j) => `https://pixabay.com/get/g${j}5b1c6e972e4789650d90b94f113809593e2f7a57a2d0a0a2a43f5e4_1280.jpg`;
  const rows = [row(0, `${B}/arch-p1.jpg`, 20), row(1, `${B}/arch-y.jpg`, 90), row(2, `${B}/arch-p2.jpg`, 260), row(3, `${B}/arch-z.jpg`, 400)];
  const c = {
    'scene-0': { provider: 'pixabay', url: jeton('a1'), sayfa: SAYFA_PX, file: `${B}/arch-p1.jpg` },
    'scene-1': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/y/yy/Y.jpg', file: `${B}/arch-y.jpg` },
    'scene-2': { provider: 'pixabay', url: jeton('b2'), sayfa: SAYFA_PX, file: `${B}/arch-p2.jpg` },
    'scene-3': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/z/zz/Z.jpg', file: `${B}/arch-z.jpg` },
  };
  assert.deepEqual(Q.farRepeats(rows, { credits: c }).map((x) => [x.row.scene, x.count]), [[2, 2]]);
  // Son sahne açılışın (ilk dakika) fotoğrafına başka dosya adıyla döner: bilinçli kapanış, sayılmaz.
  const kapanis = [row(0, `${B}/cm-1f2c309dc85c.jpg`, 5), row(1, `${B}/arch-y.jpg`, 90), row(2, `${B}/arch-d4.jpg`, 600)];
  assert.deepEqual(Q.farRepeats(kapanis, { credits: { a: CREDITS['scene-1'], b: c['scene-1'], d: CREDITS['scene-4'] } }), []);
});

test('render sonrası denetim künyeyi uzak tekrar kuralına geçirir (qaVideo credits)', () => {
  const qa = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu-qa.js'), 'utf8');
  assert.ok(qa.includes('extraIssues = [], credits = null } = {}) {'), 'qaVideo isteğe bağlı credits alır');
  assert.ok(qa.includes('for (const x of farRepeats(rows, { credits })) add({'), 'farRepeats künyeyle çağrılır');
});

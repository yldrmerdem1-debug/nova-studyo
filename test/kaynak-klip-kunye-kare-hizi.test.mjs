// KAYNAK KLİP: kare hızı, dikey fotoğraf, künye kaydı, kredi kesintisi (src/pipeline/source-clips.js).
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, 20261024-373aaf denizaltı): kanca klibi "Royal Navy Submarine - HMS Vanguard" ffprobe'da
// 480x348, 10 fps, 3.6 sn. Boyut kuralı bu klibi artık tutuyor, ama probe() kare hızını hiç okumuyordu: 720p'lik bir
// 10 fps klip 30 fps grafiklerin arasında takılarak oynardı. "≥1280 px gerçek fotoğraf" kuralı da yalnızca genişliğe
// bakıyordu; 1080x1920 dikey portre "küçük fotoğraf" sayılıp 540p klibe yerini bırakırdı.
// ÖLÇÜLEN KUSUR (24 Ekim 2026, 20261024-950730 Kartal Yuvası, 20261024-48ae2d Fransa): klibin künye kaydında kanal
// yalnızca `kanal` alanındaydı (sahip yok), lisans Türkçe "YouTube — kısa alıntı (kaynak belirtilerek)" idi; İngilizce
// açıklamada klipler "public domain" cümlesine düştü, sosyal medya klibine de "YouTube" yazıldı.
// KOD OKUMASI (ölçülmedi): görme denetimi kredi/anahtar bitince her adayı "uymuyor" sayardı; docu-source-clips.json'a
// "klip yok" yazılır, kredi yüklendikten sonra o anlatım için bir daha arama yapılmazdı.
// Ağ YOK, ffmpeg YOK: model, görme ve yt-dlp sahte; ffmpeg çıktısı metin olarak verilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-src-kunye-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const S = await import('../src/pipeline/source-clips.js');
const { kunyeUret, ATIF_ISTER } = await import('../src/pipeline/kunye.js');

// 20261024-373aaf src-e7a2790403.mp4'ün `ffmpeg -i` çıktısı (kısaltılarak).
const DENIZALTI = [
  "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'src-e7a2790403.mp4':",
  '  Duration: 00:00:03.60, start: 0.000000, bitrate: 312 kb/s',
  '  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 480x348 [SAR 1:1 DAR 120:87], 180 kb/s, 10 fps, 10 tbr, 10240 tbn (default)',
  '  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)',
].join('\n');

const aiScene = () => ({ title: 'Collision', scenes: [{ type: 'photo', say: 'The two boats met in the dark Atlantic.', dur: 4, imagePrompt: 'two submarines underwater' }] });
const pick = { scene: 0, kind: 'event', video: 'build/x/src/src-a.mp4', image: 'build/x/src/src-a.jpg', dur: 4, w: 1280, h: 720, id: 'njx4pTsW1Ws', title: 'Royal Navy Submarine - HMS Vanguard', channel: 'Richard Handler', url: 'https://www.youtube.com/watch?v=njx4pTsW1Ws', uploadDate: '20110226', label: 'Video: Richard Handler · Feb 2011' };

test('denizaltı: probe kare hızını okur; 12 fps altı klip alınmaz, kare hızı bilinmeyen eski kayıtta kural yok', () => {
  assert.deepEqual(S.parseProbe(DENIZALTI), { dur: 3.6, w: 480, h: 348, fps: 10, audio: true });
  assert.equal(S.parseProbe(DENIZALTI.replace('10 fps, 10 tbr', '29.97 fps, 29.97 tbr')).fps, 29.97);
  assert.equal(S.parseProbe(DENIZALTI.replace('10 fps, ', '')).fps, 0, 'yazmıyorsa bilinmiyor');
  assert.equal(S.parseProbe('').fps, 0);
  // Taban 12 (20 değil): 12-15 fps güvenlik kamerası / tanık / eski haber görüntüsü girer (test/kaynak-klip-kayit-kosulu-isaret).
  assert.equal(S.CLIP_MIN_FPS, 12);
  assert.equal(S.clipVeto({}, { w: 1280, h: 720, fps: 10 }), '10 fps, takılarak oynar');
  for (const fps of [12, 15, 20, 25, 29.97, 60, 0, undefined]) assert.equal(S.clipVeto({}, { w: 1280, h: 720, fps }), '', String(fps));
  // Önce boyut: ölçülen klip "çok küçük" diye düşer (eski log satırı aynı).
  assert.equal(S.clipVeto({}, { w: 480, h: 348, fps: 10 }), '480x348, çok küçük');
  // Kayıttan gelen seçim de aynı kuralla düşer; fetchClip kare hızını seçime yazar.
  const log = [];
  assert.equal(S.applySourcePicks(aiScene(), {}, [{ ...pick, fps: 10 }], { logFn: (l) => log.push(l) }).added.length, 0);
  assert.ok(log.some((l) => l.startsWith('Kaynak video: sahne 1 klibi alınmadı (10 fps, takılarak oynar)')), log.join('\n'));
  assert.equal(S.applySourcePicks(aiScene(), {}, [{ ...pick, fps: 25 }]).added.length, 1);
  assert.equal(S.applySourcePicks(aiScene(), {}, [pick]).added.length, 1, 'eski kayıt (fps yok) değişmedi');
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'source-clips.js'), 'utf8');
  assert.match(src, /return parseProbe\(r\.stderr/, 'probe ayrıştırıcıyı kullanıyor');
  assert.match(src, /h: p\.h, \.\.\.\(p\.fps \? \{ fps: p\.fps \} : \{\}\) \}/, 'fetchClip kare hızını döndürüyor');
});

test('dikey portre: uzun kenarı ≥1280 px gerçek fotoğrafın yerine 720p altı klip geçmez', () => {
  const portrait = () => ({ scenes: [{ type: 'photo', say: 'Captain of the boat that night.', image: 'build/x/img/portrait.jpg', archived: true, imgW: 1080, imgH: 1920, caption: 'HMS VANGUARD · 2009' }] });
  const log = [];
  const r = S.applySourcePicks(portrait(), {}, [{ ...pick, w: 960, h: 540 }], { logFn: (l) => log.push(l) });
  assert.equal(r.added.length, 0);
  assert.equal(r.script.scenes[0].image, 'build/x/img/portrait.jpg', 'fotoğraf kaldı');
  assert.ok(log.some((l) => l.includes('960x540, sahnenin 1080x1920 gerçek fotoğrafından zayıf')), log.join('\n'));
  assert.equal(S.applySourcePicks(portrait(), {}, [pick]).added.length, 1, '720p klip girer');
  // Küçük fotoğrafta (900x1200) 540p klip yine girer.
  assert.equal(S.applySourcePicks({ scenes: [{ ...portrait().scenes[0], imgW: 900, imgH: 1200 }] }, {}, [{ ...pick, w: 960, h: 540 }]).added.length, 1);
});

test('Kartal / Fransa: klip künyesi kanalı sahip olarak taşır, lisansı İngilizce; kamu malı ya da CC BY sayılmaz', () => {
  const script = { title: "Eagle's Nest", scenes: [
    { type: 'photo', say: "This is the Kehlsteinhaus. The Eagle's Nest.", dur: 3.5, imagePrompt: 'p' },
    { type: 'photo', say: 'The crowd gathered outside the town hall in Paris.', dur: 4, imagePrompt: 'p' },
    { type: 'photo', say: 'He said the house was never his.', dur: 4 },
  ] };
  const picks = [
    { scene: 0, kind: 'event', video: 'build/k/src/src-84d564d9c6.mp4', image: 'build/k/src/src-84d564d9c6.jpg', dur: 3, w: 1280, h: 720, id: 'nOmymsR6H9c', title: "Kehlsteinhaus - Eagle's Nest from above || Drone", channel: 'Billy Cosgrave', url: 'https://www.youtube.com/watch?v=nOmymsR6H9c', label: 'Video: Billy Cosgrave · Oct 2019' },
    { scene: 1, kind: 'event', video: 'build/k/src/src-1111111111.mp4', image: 'build/k/src/src-1111111111.jpg', dur: 4, w: 720, h: 1280, id: '5d1c0a9e2b', title: 'Paris tonight', channel: '@paris_live on TikTok', url: 'https://www.tiktok.com/@paris_live/video/7562210012345678901', label: 'Video: @paris_live on TikTok · Oct 2026' },
    { scene: 2, kind: 'voice', video: 'build/k/src/src-2222222222.mp4', wav: 'build/k/src/src-2222222222.wav', dur: 5, w: 1280, h: 720, id: 'abcdefghijk', title: 'Interview', channel: 'Obersalzberg Archive', url: 'https://www.youtube.com/watch?v=abcdefghijk', quoteText: 'the house was never mine', label: 'X, via Obersalzberg Archive · Jan 2020' },
  ];
  const credits = {};
  S.applySourcePicks(script, credits, picks);
  const yt = credits['scene-0'], tt = credits['scene-1'], vo = credits['source-abcdefghijk'];
  assert.deepEqual([yt.provider, yt.kanal, yt.sahip], ['youtube', 'Billy Cosgrave', 'Billy Cosgrave']);
  assert.deepEqual([tt.provider, tt.sahip], ['social', '@paris_live on TikTok']);
  assert.equal(vo.sahip, 'Obersalzberg Archive', 'kişinin kendi sesi klibi de');
  for (const c of [yt, tt, vo]) {
    assert.equal(c.lisans, 'Short excerpt for commentary, source credited');
    assert.doesNotMatch(c.lisans, /[çğıöşüİ]|kısa alıntı|YouTube/i, 'İngilizce ve platformdan bağımsız');
    assert.equal(ATIF_ISTER.test(c.lisans), false, '"by" yok: CC BY sanılmaz');
    assert.doesNotMatch(c.lisans, /public\s*domain|\bCC0\b|\bPDM\b/i);
  }
  // kunye.js: kanal adlarıyla anılır, "public domain" cümlesine düşmez.
  const k = kunyeUret(credits, { dil: 'en', grouped: true }).metin;
  assert.match(k, /Billy Cosgrave on YouTube/);
  assert.match(k, /@paris_live on TikTok/);
  assert.doesNotMatch(k, /public domain/i, k);
  // Aynı başlıklı iki kanalın klibi tek eser sayılmaz (yazar anahtarı eskiden her klipte "author unspecified" idi).
  const twin = {};
  S.applySourcePicks(script, twin, [picks[0], { ...picks[1], title: picks[0].title, channel: 'Alpine Walks', url: 'https://www.youtube.com/watch?v=2QRL9su0Zxo', id: '2QRL9su0Zxo' }]);
  const t = kunyeUret(twin, { dil: 'en', grouped: true }).metin;
  assert.match(t, /Billy Cosgrave on YouTube/);
  assert.match(t, /Alpine Walks on YouTube/, t);
});

test('kredi/anahtar/bütçe bitince klip denetimi adımı durdurur ("klip yok" kaydedilmez); başka hata klibi almaz', async () => {
  const jpg = path.join(home, 'frame.jpg');
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const clip = { jpgAbs: jpg, say: 'The two boats met in the dark Atlantic.', kind: 'event' };
  const gone = [
    ['400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}', 'Anthropic kredisi yok'],
    ['Anthropic API anahtarı eksik. Ayarlar sayfasından ekleyin (veya Demo modunu açın).', 'API anahtarı yok'],
    ['Tahmini model bütçesi doldu. Devam etmek için iş bütçesini artırın.', 'işin model bütçesi doldu'],
  ];
  for (const [msg, why] of gone) {
    const log = [];
    await assert.rejects(S.looksRight(clip, { visionLlm: async () => { throw new Error(msg); }, logFn: (l) => log.push(l) }), (e) => e.message === msg);
    assert.ok(log.some((l) => l.startsWith(`Kaynak video denetimi durdu (${why}) — kayıt yazılmadı`)), log.join('\n'));
  }
  // Klibin kendisine ait (ya da geçici) hata: klip alınmaz, adım sürer.
  const log = [];
  assert.equal(await S.looksRight(clip, { visionLlm: async () => { throw new Error('JSON yanıtı 3 denemede doğrulanamadı. Could not process image'); }, logFn: (l) => log.push(l) }), false);
  assert.ok(log.some((l) => l.startsWith('Kaynak video denetlenemedi, alınmadı')), log.join('\n'));
  // Akış: attachSourceClips looksRight'ı try içine almaz, kayıt döngüden sonra yazılır; docu.js hatayı "Kaynak video
  // atlandı" diye yazıp klipsiz sürer.
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'source-clips.js'), 'utf8');
  const body = src.slice(src.indexOf('export async function attachSourceClips'), src.indexOf('export function applySourcePicks'));
  assert.ok(body.indexOf('await looksRight(') > 0 && body.indexOf('await looksRight(') < body.indexOf('writeJson(cacheFile'));
  assert.doesNotMatch(body, /try\s*\{[^}]*await looksRight/, 'looksRight hatası yutulmuyor');
  const d = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu.js'), 'utf8');
  assert.match(d, /log2\(`Kaynak video atlandı: \$\{String\(e\?\.message \|\| e\)/);
});

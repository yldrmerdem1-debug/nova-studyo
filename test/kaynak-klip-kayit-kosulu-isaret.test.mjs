// KAYNAK KLİP: kare hızı tabanı 12; plan/arama/denetim kredisiz ya da bağlantısız düşünce kayıt yazılmaz; klip, yerine
// geçtiği fotoğrafın işaretini taşımaz (src/pipeline/source-clips.js).
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, 20261024-373aaf denizaltı): kancaya giren klip 480x348, 10 fps idi; onu 640 px kuralı
// zaten tutuyor. Aynı gün eklenen 20 fps tabanı ise 12-15 fps güvenlik kamerası, tanık telefonu ve eski haber
// görüntüsünü de atıyordu (1. tur gözden geçirmesi C) — haber kanalının asıl klipleri. Taban 12: 10 fps düşer, 15 girer.
// KOD OKUMASI (ölçülmedi, 1. tur gözden geçirmesi C): planSourceMoments kredi/anahtar hatasını yutup [] dönüyordu;
// attachSourceClips docu-source-clips.json'a picks:[] yazıyor, kredi yüklendikten sonra o anlatım bir daha aranmıyordu.
// Sosyal medya araması aynı hatayı "gönderi yok", klip denetimi kopan bağlantıyı "klip uymuyor" sayıyordu.
// Gözden geçirme: geçersiz anahtar (HTTP 401) ve fiyatı girilmemiş model ("HATA: Bütçe denetlenemiyor", 20261006-aafc1b
// job.log) da hesap hatasıdır, yine "an yok" kaydediliyordu; ayar düzelince o anlatım aranmazdı.
// KOD OKUMASI (ölçülmedi): placeAnnotations kaynak klipten ÖNCE çalışır. 20261015-23e041'in kanca satırı ("a Houthi
// missile hit a cargo ship called the Rubymar", 1328x748 gerçek fotoğraf) "Rubymar" işaretini x 0.55, y 0.5, r 0.4'te
// taşıyor (docu-annotate.json); 720p klip o fotoğrafın yerine geçince işaret eski fotoğrafın koordinatında kalırdı.
// Ağ YOK, ffmpeg YOK: yt-dlp, plan, görme ve web araması sahte; indirme isteği başarısız döner (klip üretilmez).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-src-kayit-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const S = await import('../src/pipeline/source-clips.js');

const jobDir = () => {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  return { dir, pub, cache: path.join(dir, 'docu-source-clips.json') };
};
const noYt = () => ({ status: 1, stdout: '' });
const counting = (fn) => { const f = async (o) => { f.n++; return fn(o); }; f.n = 0; return f; };

// 20261015-23e041 docu-archive-done.json sahne 1; işaret docu-annotate.json'daki yerinde (placeAnnotations odak da yazar).
const rubymar = () => ({ title: 'Red Sea', scenes: [
  { chapter: 0, type: 'photo', mood: 'tense', say: 'The Red Sea is the fastest route between Asia and Europe.', dur: 4, imagePrompt: 'p' },
  { chapter: 0, type: 'photo', mood: 'curious', say: 'In 2024, a Houthi missile hit a cargo ship called the Rubymar.', dur: 4, source: 'archive', search: 'Rubymar ship Red Sea 2024', caption: 'Hit: 18 February 2024', era: '2024', annotate: { label: 'Rubymar', arrow: true, at: 4.39, x: 0.55, y: 0.5, r: 0.4 }, focus: [0.55, 0.5], image: 'build/20261015-23e041/arch-f52e24aea07e.jpg', archived: true, imgW: 1328, imgH: 748 },
] });
const clip = { scene: 1, kind: 'event', hook: true, year: 2024, video: 'build/x/src/src-1111111111.mp4', image: 'build/x/src/src-1111111111.jpg', dur: 4, w: 1280, h: 720, id: 'rubymarSink', title: 'Rubymar sinking Red Sea drone footage', channel: 'Gulf Watcher', url: 'https://www.youtube.com/watch?v=rubymarSink', uploadDate: '20240302', label: 'Video: Gulf Watcher · Mar 2024' };

test('kare hızı tabanı 12: 10 fps düşer; 12-15 fps güvenlik kamerası / tanık klibi girer (aramada ve kayıttan)', () => {
  assert.equal(S.CLIP_MIN_FPS, 12);
  assert.equal(S.clipVeto({}, { w: 1280, h: 720, fps: 10 }), '10 fps, takılarak oynar');
  assert.equal(S.clipVeto({}, { w: 1280, h: 720, fps: 11.99 }), '11.99 fps, takılarak oynar');
  for (const fps of [12, 12.5, 15, 24, 29.97]) assert.equal(S.clipVeto({}, { w: 1280, h: 720, fps }), '', String(fps));
  // Ölçülen denizaltı klibi yine düşer (önce boyut).
  assert.equal(S.clipVeto({}, { w: 480, h: 348, fps: 10 }), '480x348, çok küçük');
  // `ffmpeg -i` satırından: 15 fps güvenlik kamerası klibi.
  const cctv = S.parseProbe('  Duration: 00:00:06.00, start: 0.000000, bitrate: 900 kb/s\n  Stream #0:0[0x1](und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p(tv, progressive), 1280x720 [SAR 1:1 DAR 16:9], 850 kb/s, 15 fps, 15 tbr, 15360 tbn (default)');
  assert.deepEqual([cctv.w, cctv.h, cctv.fps], [1280, 720, 15]);
  assert.equal(S.clipVeto({}, cctv), '');
  const ai = () => ({ scenes: [{ type: 'photo', say: 'Security cameras caught the blast at the port.', dur: 4, imagePrompt: 'p' }] });
  const pick = { ...clip, scene: 0, hook: undefined, year: undefined };
  assert.equal(S.applySourcePicks(ai(), {}, [{ ...pick, fps: 15 }]).added.length, 1, '15 fps kayıttan girer');
  const log = [];
  assert.equal(S.applySourcePicks(ai(), {}, [{ ...pick, fps: 10 }], { logFn: (l) => log.push(l) }).added.length, 0);
  assert.ok(log.some((l) => l.startsWith('Kaynak video: sahne 1 klibi alınmadı (10 fps, takılarak oynar)')), log.join('\n'));
});

// llm.js'nin kendi denemelerinden (5 sn, 20 sn, model zinciri) sonra da düşen istekler.
const ACCOUNT = [
  [new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'), 'Anthropic kredisi yok'],
  [new Error('Anthropic API anahtarı eksik. Ayarlar sayfasından ekleyin (veya Demo modunu açın).'), 'API anahtarı yok'],
  // Anahtar iptal edildi / değişti: eski anahtarla düşen plan "an yok" sayılsaydı yenisiyle aranmazdı.
  [Object.assign(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'), { status: 401 }), 'API anahtarı geçersiz'],
  [new Error('Tahmini model bütçesi doldu. Devam etmek için iş bütçesini artırın.'), 'işin model bütçesi doldu'],
  // 20261006-aafc1b job.log: "HATA: Bütçe denetlenemiyor" — fiyatı girilmemiş model; fiyat girilince geçer.
  [new Error('Bütçe denetlenemiyor: model/araç fiyatı eksik. Ayarlarda model fiyatlarını tamamlayın veya tahmini bütçe sınırını kaldırın.'), 'model fiyatı eksik'],
];
const NET = [
  [new Error('terminated'), 'bağlantı koptu ya da servis yoğun'],
  [Object.assign(new Error('Connection error.'), { cause: new TypeError('fetch failed') }), 'bağlantı koptu ya da servis yoğun'],
  [Object.assign(new Error('529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'), { status: 529 }), 'bağlantı koptu ya da servis yoğun'],
];
const FAILS = [...ACCOUNT, ...NET];

test('plan kredi/anahtar/bütçe/bağlantı yüzünden düşerse "an yok" kaydedilmez; kredi gelince aynı anlatım yeniden planlanır', async () => {
  for (const [err, why] of FAILS) {
    const { dir, pub, cache } = jobDir();
    const log = [];
    const opts = { dir, publicDir: pub, buildPrefix: 'build/x', settings: {}, ytdlp: noYt, visionLlm: counting(() => ({})), textLlm: counting(() => '') };
    await assert.rejects(S.attachSourceClips(rubymar(), { ...opts, llm: async () => { throw err; }, logFn: (l) => log.push(l) }), (e) => e === err, why);
    assert.equal(fs.existsSync(cache), false, `${why}: kayıt yazılmadı`);
    assert.ok(log.includes(`Kaynak video planı yazılamadı (${why}) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır`), log.join('\n'));
    // Kredi yüklendi: plan yeniden çağrılır. "An yok" bir karardır: kaydedilir, sonraki çalıştırma planlamaz.
    const plan = counting(() => ({ moments: [] }));
    await S.attachSourceClips(rubymar(), { ...opts, llm: plan });
    assert.equal(plan.n, 1, `${why}: yeniden planlandı`);
    assert.deepEqual(JSON.parse(fs.readFileSync(cache, 'utf8')).picks, []);
    const again = counting(() => ({ moments: [] }));
    await S.attachSourceClips(rubymar(), { ...opts, llm: again });
    assert.equal(again.n, 0, 'kayıttan');
  }
  // Planın kendisine ait hata (şema doğrulanamadı) bir sonuçtur: adım sürer, eskisi gibi "an yok".
  const log = [];
  const m = await S.planSourceMoments(rubymar(), { llm: async () => { throw new Error('JSON yanıtı 3 denemede doğrulanamadı. İsteği kısaltıp yeniden deneyin. JSON şema doğrulaması: moments: eksik'); }, logFn: (l) => log.push(l) });
  assert.deepEqual(m, []);
  assert.ok(log.some((l) => l.startsWith('Kaynak video planı yazılamadı (JSON yanıtı 3 denemede')), log.join('\n'));
  assert.ok(!log.some((l) => l.includes('kayıt yazılmadı')));
});

test('sosyal medya araması kredisiz/bağlantısız düşerse adım durur, "gönderi yok" kaydedilmez; başka hata gönderisiz sürer', async () => {
  const ytdlp = (args) => (args.includes('--flat-playlist') ? { status: 0, stdout: JSON.stringify({ entries: [] }) } : { status: 1, stdout: '' });
  const plan = async () => ({ moments: [{ scene: 1, kind: 'event', query: 'Rubymar sinking Red Sea footage', who: '', quote: '', why: '', year: 2024 }] });
  for (const [err, why] of [ACCOUNT[0], NET[0]]) {
    const { dir, pub, cache } = jobDir();
    const log = [];
    await assert.rejects(S.attachSourceClips(rubymar(), { dir, publicDir: pub, buildPrefix: 'build/x', settings: {}, ytdlp, llm: plan, visionLlm: counting(() => ({})), textLlm: async () => { throw err; }, logFn: (l) => log.push(l) }), (e) => e === err);
    assert.equal(fs.existsSync(cache), false, `${why}: kayıt yazılmadı`);
    assert.ok(log.includes(`Sosyal medya araması durdu (${why}) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır`), log.join('\n'));
  }
  const log = [];
  assert.deepEqual(await S.searchSocial('Rubymar', { textLlm: async () => { throw new Error('Model bu isteği güvenlik nedeniyle reddetti.'); }, logFn: (l) => log.push(l) }), []);
  assert.ok(log.some((l) => l.startsWith('Sosyal medya araması yapılamadı (Model bu isteği')), log.join('\n'));
});

test('klip denetimi bağlantı koptuğu için düşerse de adım durur (kayıt yazılmaz); klibin kendi hatası klibi almaz', async () => {
  const jpg = path.join(home, 'frame.jpg');
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const frame = { jpgAbs: jpg, say: 'In 2024, a Houthi missile hit a cargo ship called the Rubymar.', kind: 'event', year: 2024 };
  for (const [err, why] of NET) {
    const log = [];
    await assert.rejects(S.looksRight(frame, { visionLlm: async () => { throw err; }, logFn: (l) => log.push(l) }), (e) => e === err);
    assert.ok(log.includes(`Kaynak video denetimi durdu (${why}) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır`), log.join('\n'));
  }
  assert.equal(await S.looksRight(frame, { visionLlm: async () => { throw Object.assign(new Error('400 Could not process image'), { status: 400 }); } }), false);
});

test('Rubymar: klip işaretli fotoğrafın yerine geçince eski fotoğraftaki işaret ve odak klipte kalmaz', () => {
  const r = S.applySourcePicks(rubymar(), {}, [clip]);
  assert.equal(r.added.length, 1, '1328x748 fotoğrafın yerine 720p klip girer');
  const s = r.script.scenes[1];
  assert.equal(s.video, clip.video);
  assert.equal(s.annotate, undefined, 'x 0.55 / y 0.5 / r 0.4 eski fotoğrafın');
  assert.equal(s.focus, undefined);
  assert.equal(s.caption, undefined);
  assert.deepEqual([s.imgW, s.imgH], [1280, 720]);
  assert.equal(s.say, 'In 2024, a Houthi missile hit a cargo ship called the Rubymar.', 'anlatım aynen');
  // Klip girmezse (reddedilmiş / zayıf) fotoğraf işaretiyle kalır.
  const kept = S.applySourcePicks(rubymar(), {}, [clip], { rejected: [clip.url] }).script.scenes[1];
  assert.deepEqual(kept.annotate, { label: 'Rubymar', arrow: true, at: 4.39, x: 0.55, y: 0.5, r: 0.4 });
  assert.deepEqual(kept.focus, [0.55, 0.5]);
  const weak = S.applySourcePicks(rubymar(), {}, [{ ...clip, w: 960, h: 540 }]).script.scenes[1];
  assert.equal(weak.annotate.x, 0.55, '540p klip ≥1280 px fotoğrafın yerine geçmez, işaret kalır');
});

// KAYNAK VİDEO SINIRLARI (src/pipeline/source-clips.js): reddedilen klip geri gelmez, olaydan önce yüklenmiş klip
// girmez, küçük klip gerçek fotoğrafın yerine geçmez ve onun yazısını taşımaz, denetlenemeyen klip alınmaz.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 20261024-950730 Kartal Yuvası): ön izleme kapısı kanca sahnesini 4 tur "generic" buldu
// ("This is the Kehlsteinhaus" üstünde yalnızca kaya ve çalı); docu-qa-fixes.json sahne 0: rejected
// [youtube nOmymsR6H9c], tries 4, ai true. Yine de her turda log "Kaynak video: sahne 1 olay görüntüsü — Video: Billy
// Cosgrave · Oct 2019": kayıtlı seçim ret listesine bakılmadan yeniden kondu; render son düzeltmeye bakılmadan başladı.
// ÖLÇÜLEN KUSUR (24 Ekim 2026, 20261024-373aaf denizaltı): kancada 2560x1920 müze fotoğrafının yerine 480x348, 10 fps
// "Royal Navy Submarine - HMS Vanguard" klibi girdi; fotoğrafın "LE TRIOMPHANT · FRENCH NAVY" yazısı ve imgW/imgH
// klipte kaldı. Sahne 81'de Wiki4All'ın Vikipedi slayt gösterisi "kaynak video" oldu.
// ÖLÇÜLEN KUSUR (20 Ekim 2026, 20261020-37f9d2 Fransa): 2026 sonbaharı eylemleri anlatılırken Nisan 2018 "loi Vidal"
// öğrenci eyleminin klibi girdi (pankartlar 2018'in); yükleme tarihi yalnızca köşe etiketine yazılıyordu.
// ÖLÇÜLEN KUSUR (Kartal Yuvası + Fransa job.log): klip denetimi 300 token sınırına 13 kez takıldı (her biri ikinci,
// ücretli istek); denetim düşseydi klip denetlenmeden alınacaktı.
// KOD OKUMASI (ölçülmedi): why'a kodda doğrulanan bir uzunluk sınırı konsaydı uzun gerekçe aynı ücretli tekrarı açardı;
// poster karesi çıkmayan klip görmeye hiç gösterilmeden giriyordu; Fransa satırı yıl söylemiyor ("This autumn"), plana
// bugünün tarihi verilmiyordu.
// Ağ YOK, ffmpeg YOK: yt-dlp, plan, görme ve web araması sahte; indirme isteği başarısız döner (klip üretilmez).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-src-ret-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const S = await import('../src/pipeline/source-clips.js');
const { validateSchema } = await import('../src/structured-output.js');
const today = new Date().toISOString().slice(0, 10);

const jobDir = () => {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  return { dir, pub };
};
const noLlm = async () => { throw new Error('model çağrılmamalı'); };

// Kartal Yuvası işinin docu-source-clips.json kaydından (20261024-950730).
const KANCA = { scene: 0, kind: 'event', hook: true, query: "Kehlsteinhaus Eagle's Nest Berchtesgaden aerial footage", who: '', quote: '', video: 'build/20261024-950730/src/src-84d564d9c6.mp4', image: 'build/20261024-950730/src/src-84d564d9c6.jpg', wav: 'build/20261024-950730/src/src-84d564d9c6.wav', dur: 3, w: 1280, h: 720, id: 'nOmymsR6H9c', title: "Kehlsteinhaus - Eagle's Nest from above || Drone", channel: 'Billy Cosgrave', url: 'https://www.youtube.com/watch?v=nOmymsR6H9c', uploadDate: '20191007', label: 'Video: Billy Cosgrave · Oct 2019' };
const YOL = { scene: 1, kind: 'event', query: "Kehlsteinstraße road drive Eagle's Nest tunnels hairpin", who: '', quote: '', video: 'build/20261024-950730/src/src-45c043a5ba.mp4', image: 'build/20261024-950730/src/src-45c043a5ba.jpg', dur: 4.04, w: 1280, h: 720, id: '2QRL9su0Zxo', title: "Fahrt auf der Kehlsteinstrasse zum Kehlsteinhaus (Eagle's Nest) !!!", channel: 'Christian Moos', url: 'https://www.youtube.com/watch?v=2QRL9su0Zxo', uploadDate: '20190829', label: 'Video: Christian Moos · Aug 2019' };
const kartal = () => ({ title: "Eagle's Nest", scenes: [
  { type: 'photo', say: "[awe] This is the Kehlsteinhaus. The Eagle's Nest.", dur: 3.5, imagePrompt: 'The Kehlsteinhaus stone house on the summit', commons: 'File:Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg' },
  { type: 'photo', say: 'The road climbs seven hundred metres through five tunnels.', dur: 4, imagePrompt: 'mountain road' },
] });

test('Kartal Yuvası: reddedilen kanca klibi kayıttan yeniden konmaz; sahne kendi görselinde kalır, öteki klip girer', () => {
  const credits = {};
  const log = [];
  const r = S.applySourcePicks(kartal(), credits, [KANCA, YOL], { rejected: ['https://www.youtube.com/watch?v=nOmymsR6H9c'], logFn: (l) => log.push(l) });
  const s0 = r.script.scenes[0];
  assert.equal(s0.video, undefined, 'reddedilen klip girmedi');
  assert.equal(s0.archived, undefined);
  assert.equal(s0.imagePrompt, 'The Kehlsteinhaus stone house on the summit', 'AI istemi duruyor');
  assert.equal(s0.commons, 'File:Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg');
  assert.equal(credits['scene-0'], undefined, 'künyesi de yazılmadı');
  assert.deepEqual(r.added.map((a) => a.scene), [1], 'reddedilmeyen klip girdi');
  assert.ok(log.some((l) => l.startsWith('Kaynak video: sahne 1 reddedilmiş klip atlandı')), log.join('\n'));
  assert.ok(!log.some((l) => l.startsWith('Kaynak video: sahne 1 olay görüntüsü')), 'eski log satırı yok');
  // Ret listesi adresle eşleşir, adres biçimi fark etmez (sahne numarası ses eklemeleriyle kayar).
  for (const u of ['https://youtu.be/nOmymsR6H9c', 'https://www.youtube.com/shorts/nOmymsR6H9c', 'https://m.youtube.com/watch?feature=share&v=nOmymsR6H9c']) {
    assert.equal(S.applySourcePicks(kartal(), {}, [KANCA], { rejected: [u] }).added.length, 0, u);
  }
  assert.equal(S.clipKey('https://www.tiktok.com/@paris_live/video/7562210012345678901?is_from_webapp=1'), S.clipKey('https://tiktok.com/@paris_live/video/7562210012345678901/'));
  // Ret listesi yoksa davranış aynı.
  assert.equal(S.applySourcePicks(kartal(), {}, [KANCA, YOL]).added.length, 2);
});

test('Kartal Yuvası uçtan uca: kayıtlı seçim ret listesiyle uygulanır; yeniden arama, indirme, ödeme yok', async () => {
  const { dir, pub } = jobDir();
  const script = kartal();
  // Kayıt anahtarı: anlatımın kendisi (source-clips.js attachSourceClips).
  const key = crypto.createHash('sha1').update(['', ...script.scenes.map((s) => s.say || '')].join('|')).digest('hex').slice(0, 10);
  fs.writeFileSync(path.join(dir, 'docu-source-clips.json'), JSON.stringify({ key, picks: [KANCA, YOL] }));
  const calls = [];
  const log = [];
  const r = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/20261024-950730', credits: {}, settings: {}, logFn: (l) => log.push(l),
    llm: noLlm, visionLlm: noLlm, textLlm: noLlm, ytdlp: (a) => { calls.push(a); return { status: 1 }; },
    rejected: ['https://www.youtube.com/watch?v=nOmymsR6H9c'] });
  assert.equal(calls.length, 0, 'kayıttan');
  assert.equal(r.script.scenes[0].video, undefined);
  assert.equal(r.script.scenes[0].imagePrompt, 'The Kehlsteinhaus stone house on the summit');
  assert.equal(r.script.scenes[1].video, YOL.video);
  assert.ok(log.some((l) => l.includes('reddedilmiş klip atlandı')));
});

test('yeni aramada reddedilen video aday olmaz: sıradaki aday denenir', async () => {
  const { dir, pub } = jobDir();
  const info = [];
  const downloads = [];
  const ytdlp = (args) => {
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries: [
      { id: 'nOmymsR6H9c', title: "Kehlsteinhaus Eagle's Nest from above drone", channel: 'Billy Cosgrave', duration: 180 },
      { id: 'otherVideo1', title: "Kehlsteinhaus Eagle's Nest house terrace", channel: 'Alpine Walks', duration: 240 },
    ] }) };
    if (args[0] === '-J') { info.push(args.at(-1)); return { status: 0, stdout: JSON.stringify({ id: args.at(-1), duration: 200, upload_date: '20220601' }) }; }
    if (args.includes('--download-sections')) downloads.push(args.at(-1));
    return { status: 1, stdout: '' };
  };
  await S.attachSourceClips(kartal(), { dir, publicDir: pub, buildPrefix: 'build/k', settings: { docuSourceSocial: false }, ytdlp, ffmpeg: 'ffmpeg',
    llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: "Kehlsteinhaus Eagle's Nest", who: '', quote: '', why: '', year: 0 }] }),
    visionLlm: noLlm, textLlm: noLlm, rejected: ['https://www.youtube.com/watch?v=nOmymsR6H9c'] });
  assert.ok(!info.includes('nOmymsR6H9c'), 'reddedilen videonun bilgisi bile alınmadı');
  assert.deepEqual(downloads, ['otherVideo1'], 'sıradaki aday denendi');
});

test('Fransa: olaydan önce yüklenmiş klip indirilmez (YouTube ve sosyal medya); plan olayın yılını verir', async () => {
  const { dir, pub } = jobDir();
  const script = { title: 'France', scenes: [{ type: 'photo', say: 'This autumn the fight spilled into the streets of Marseille, students first.', dur: 5, imagePrompt: 'p' }] };
  const tt = 'https://www.tiktok.com/@marseille_live/video/7412345678901234567';
  const infos = {
    a2018vidal1: { id: 'a2018vidal1', duration: 90, upload_date: '20180419', title: 'Marseille students protest contre la loi Vidal' },
    b2026autumn: { id: 'b2026autumn', duration: 90, upload_date: '20261018', title: 'Marseille students protest October' },
    [tt]: { id: '741', duration: 20, upload_date: '20180420', uploader: 'marseille_live', webpage_url: tt },
  };
  const downloads = [];
  const ytdlp = (args) => {
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries: [
      { id: 'a2018vidal1', title: 'Marseille students protest contre la loi Vidal', channel: 'Marseille Etudiants', duration: 90 },
      { id: 'b2026autumn', title: 'Marseille students protest October', channel: 'Street Witness', duration: 90 },
    ] }) };
    if (args[0] === '-J') return infos[args.at(-1)] ? { status: 0, stdout: JSON.stringify(infos[args.at(-1)]) } : { status: 1 };
    if (args.includes('--download-sections')) downloads.push(args.at(-1));
    return { status: 1, stdout: '' };
  };
  let schema = null, prompt = '';
  const log = [];
  await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/fr', settings: {}, ytdlp, ffmpeg: 'ffmpeg', logFn: (l) => log.push(l),
    llm: async (o) => { schema = o.schema; prompt = o.user; return { moments: [{ scene: 0, kind: 'event', query: 'Marseille students protest', who: '', quote: '', why: '', year: 2026 }] }; },
    textLlm: async () => tt, visionLlm: noLlm });
  assert.ok(schema.properties.moments.items.required.includes('year'), 'plan olayın yılını yazmak zorunda');
  assert.ok(prompt.includes(`today is ${today}`), '"This autumn" yılı bugünün tarihinden bulunur');
  assert.ok(log.some((l) => l.startsWith('Kaynak video atlandı (yükleme 20180419, olay 2026)')), log.join('\n'));
  assert.ok(log.some((l) => l.includes('sosyal medya atlandı (yükleme 20180420, olay 2026)')), log.join('\n'));
  assert.deepEqual(downloads, ['b2026autumn'], '2018 klibi indirilmedi, 2026 klibi denendi');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'docu-source-clips.json'), 'utf8')).picks, []);
  // Eski kayıttaki seçim de aynı kuralla düşer; yılı bilinmeyen (0) anda kural yok.
  const pick = { scene: 0, kind: 'event', year: 2026, video: 'v.mp4', image: 'v.jpg', w: 1280, h: 720, dur: 5, uploadDate: '20180419', label: 'Video: La Provence · Apr 2018', url: 'https://www.youtube.com/watch?v=a2018vidal1', id: 'a2018vidal1' };
  assert.equal(S.applySourcePicks(script, {}, [pick]).added.length, 0);
  assert.equal(S.applySourcePicks(script, {}, [{ ...pick, year: undefined }]).added.length, 1);
  assert.equal(S.predatesEvent('20261018', 2026), false);
  assert.equal(S.predatesEvent('20180419', 0), false);
  const m = await S.planSourceMoments(script, { llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: 'q', who: '', quote: '', why: '', year: 0 }] }) });
  assert.equal(m[0].year, undefined, 'bilinmeyen yıl taşınmaz');
  // Gelecekteki yıl her klibi düşürürdü: an kalır, yıl taşınmaz.
  const future = await S.planSourceMoments(script, { llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: 'q', who: '', quote: '', why: '', year: +today.slice(0, 4) + 1 }] }) });
  assert.equal(future.length, 1);
  assert.equal(future[0].year, undefined);
});

test('denizaltı: 480x348 klip 2560 px fotoğrafın yerine geçmez; giren klip fotoğrafın yazısını/künyesini/boyutunu taşımaz', () => {
  const still = () => ({ title: 'Collision', scenes: [{ type: 'photo', say: '[grave] France said its nuclear submarine had struck a submerged object.', dur: 3.5, image: 'build/20261024-373aaf/img/le-triomphant.jpg', archived: true, imgW: 2560, imgH: 1920, focus: [0.5, 0.3], caption: 'LE TRIOMPHANT · FRENCH NAVY', credit: 'Musée de la Marine' }] });
  // 20261024-373aaf docu-source-clips.json kaydı (ffprobe: 480x348, 10 fps, 3.6 sn).
  const pick = { scene: 0, kind: 'event', hook: true, video: 'build/20261024-373aaf/src/src-e7a2790403.mp4', image: 'build/20261024-373aaf/src/src-e7a2790403.jpg', dur: 3.6, w: 480, h: 348, id: 'njx4pTsW1Ws', title: 'Royal Navy Submarine - HMS Vanguard', channel: 'Richard Handler', url: 'https://www.youtube.com/watch?v=njx4pTsW1Ws', uploadDate: '20110226', label: 'Video: Richard Handler · Feb 2011' };
  const log = [];
  let r = S.applySourcePicks(still(), {}, [pick], { logFn: (l) => log.push(l) });
  assert.equal(r.added.length, 0);
  assert.equal(r.script.scenes[0].image, 'build/20261024-373aaf/img/le-triomphant.jpg', 'fotoğraf kaldı');
  assert.equal(r.script.scenes[0].caption, 'LE TRIOMPHANT · FRENCH NAVY', 'fotoğrafın yazısı fotoğrafla kaldı');
  assert.ok(log.some((l) => l.includes('klibi alınmadı (480x348, çok küçük)')), log.join('\n'));
  // 720p altı klip ≥1280 px gerçek fotoğrafın yerine geçmez; AI sahnesinde girer.
  assert.equal(S.applySourcePicks(still(), {}, [{ ...pick, w: 960, h: 540 }]).added.length, 0);
  assert.equal(S.applySourcePicks({ scenes: [{ type: 'photo', say: 'x', imagePrompt: 'p' }] }, {}, [{ ...pick, w: 960, h: 540 }]).added.length, 1);
  // Giren klip: fotoğrafa ait alanlar silinir, boyut klibin karesinin.
  r = S.applySourcePicks(still(), {}, [{ ...pick, w: 1280, h: 720 }]);
  const s = r.script.scenes[0];
  assert.equal(s.video, pick.video);
  assert.equal(s.image, pick.image, 'poster karesi');
  for (const k of ['caption', 'credit', 'focus']) assert.equal(s[k], undefined, k);
  assert.deepEqual([s.imgW, s.imgH, s.videoW, s.videoH], [1280, 720, 1280, 720], 'eski 2560x1920 kalmadı');
  // İsim kartı sahnesi plana girmez; eski kayıttan gelse de kişinin kartı silinmez.
  const named = { scenes: [{ type: 'photo', say: 'Captain Jones commanded HMS Vanguard.', image: 'a.jpg', archived: true, imgW: 1600, imgH: 1200, name: 'Captain Jones', role: 'Commander' }] };
  r = S.applySourcePicks(named, {}, [{ ...pick, w: 1920, h: 1080 }]);
  assert.equal(r.added.length, 0);
  assert.equal(r.script.scenes[0].name, 'Captain Jones');
  // Dikey telefon klibi (720x1280) küçük sayılmaz.
  assert.equal(S.clipVeto({}, { w: 720, h: 1280 }), '');
  assert.equal(S.clipVeto({}, { w: 480, h: 348 }), '480x348, çok küçük');
});

test('Wiki4All: Vikipedi slayt gösterisi kanalları ve "audio article" videoları aday olmaz', () => {
  const r = S.rankSearch([
    { id: 'w', title: 'HMS Vanguard And Le Triomphant Submarine Collision', channel: 'Wiki4All', duration: 120 },
    { id: 'a', title: 'HMS Vanguard Le Triomphant collision | Wikipedia audio article', channel: 'wikipedia tts', duration: 300 },
    { id: 'b', title: 'HMS Vanguard Le Triomphant collision audio article', channel: 'Audiopedia', duration: 300 },
    { id: 'c', title: 'HMS Vanguard Le Triomphant collision Faslane return', channel: 'Clyde Ship Spotter', duration: 90 },
    { id: 'l', title: 'HMS Vanguard Le Triomphant collision statement', channel: 'WikiLeaks', duration: 120 },
  ], 'HMS Vanguard Le Triomphant collision');
  assert.deepEqual(r.map((x) => x.id), ['c', 'l'], 'WikiLeaks slayt kanalı değil');
});

test('görme denetimi: 800 token ve kısa "why"; olayın yılı istemde; denetim düşerse klip ALINMAZ', async () => {
  const jpg = path.join(home, 'frame.jpg');
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  let seen = null;
  const ok = await S.looksRight({ jpgAbs: jpg, say: 'This autumn the fight spilled into the streets.', kind: 'event', year: 2026 }, {
    visionLlm: async (o) => { seen = o; return { fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: false, why: 'street protest' }; } });
  assert.equal(ok, true);
  assert.ok(seen.maxTokens >= 600, `maxTokens ${seen.maxTokens}`);
  assert.match(seen.schema.properties.why.description, /one short sentence/, 'why kısa istenir');
  // Ama kodda sınır yok: why okunmuyor, uzun gerekçe doğrulamadan düşüp ikinci ücretli isteği açmaz.
  assert.deepEqual(validateSchema({ fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: false, textCover: 0, aiMade: false, reenactment: false, why: 'The frame shows a street protest. '.repeat(30) }, seen.schema), []);
  assert.match(seen.user, /The event is from 2026/);
  await S.looksRight({ jpgAbs: jpg, say: 'x', kind: 'event' }, { visionLlm: async (o) => { seen = o; return { fits: true }; } });
  assert.doesNotMatch(seen.user, /The event is from/, 'yıl bilinmiyorsa istemde yok');
  const log = [];
  const failed = await S.looksRight({ jpgAbs: jpg, say: 'x', kind: 'event' }, { visionLlm: async () => { throw new Error('JSON yanıtı doğrulanamadı: Yanıt token sınırına takıldı'); }, logFn: (l) => log.push(l) });
  assert.equal(failed, false, 'denetlenemeyen klip alınmadı');
  assert.ok(log.some((l) => l.startsWith('Kaynak video denetlenemedi, alınmadı')), log.join('\n'));
  // Poster karesi çıkmadıysa: görmeye gösterilecek kare yok, klip denetlenmeden girmez.
  const log2 = [];
  const noFrame = await S.looksRight({ jpgAbs: path.join(home, 'yok.jpg'), say: 'x', kind: 'event' }, { visionLlm: noLlm, logFn: (l) => log2.push(l) });
  assert.equal(noFrame, false);
  assert.ok(log2.some((l) => l === 'Kaynak video denetlenemedi, alınmadı (poster karesi çıkarılamadı)'), log2.join('\n'));
});

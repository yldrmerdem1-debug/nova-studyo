// KLİP ELEME NEDENLERİ (src/pipeline/source-clips.js): görme denetimi NEDEN reddettiğini söyler; köşe logosu, filigran,
// isim kartı ve tek satır altyazı klibi düşürmez; yalnızca o kareye ait bir ret (stüdyo, büyük yazı, uymuyor) aynı
// videonun başka anına baktırır; an başına 5 aday, en çok 8 kare denetimi.
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, 20261024-950730 Kartal Yuvası): 12 an arandı, 5'i yerleşti. Yangının videoları
// ("KEHLSTEINHAUS IN FLAMMEN! Verdächtiger festgenommen", "The Night the Eagle's Nest Burned – Berchtesgaden 2026",
// "Kehlsteinhaus komplett niedergebrannt") reddedildi; 2011/2013/2019 turist videoları girdi. Her ret aynı satırdı:
// "Kaynak video reddedildi (anlatıma uymuyor ya da reklama uygun değil)". Diskte kalan poster kareleri: isim kartlı bir
// polis sözcüsü ("Lisa Maier, Polizei Oberbayern Süd"), "MARTIN BORMANN" başlık kartı, altyazılı AI itfaiye karesi
// ("Freitagabend: Alarm am Obersalzberg!") — video tek karesiyle yargılanıp atılıyordu.
// ÖLÇÜLEN KUSUR (26 Ekim 2026, 20261026-29db03 Lula): 10 an arandı, 2'si yerleşti. "Lula ends campaign in São Paulo…"
// (Record'un miting görüntüsü; köşede küçük "JR" logosu ve "#JornalDaRecord") reddedildi.
// Kural (kanal sahibi, hukuk): kaynağın logosu/filigranı ASLA kesilmez, bulanıklaştırılmaz, kapatılmaz — küçükse klip girer,
// görünür kalır.
// Ağ YOK, model YOK: yt-dlp, plan ve görme sahte; klip ffmpeg-static ile BİR kez üretilir (640x360, 2 sn, sessiz) ve
// her "indirmede" kopyalanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-klip-eleme-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');
const S = await import('../src/pipeline/source-clips.js');
const { validateSchema } = await import('../src/structured-output.js');

const BASE = path.join(home, 'base.mp4');
execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=2:r=25', '-pix_fmt', 'yuv420p', '-an', BASE]);
const JPG = path.join(home, 'frame.jpg');
fs.writeFileSync(JPG, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

const OK = { fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: false, why: '' };
const noLlm = async () => { throw new Error('model çağrılmamalı'); };
const jobDir = () => {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  return { dir, pub, cache: path.join(dir, 'docu-source-clips.json') };
};
/** Sahte yt-dlp: arama → entries, -J → infos[id], indirme → hazır klip kopyalanır; indirilen (id, pencere) kaydedilir. */
const fakeYt = (entries, infos, { failDownload = false } = {}) => {
  const downloads = [];
  const run = (args) => {
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries }) };
    if (args[0] === '-J') { const i = infos[args.at(-1)]; return i ? { status: 0, stdout: JSON.stringify(i) } : { status: 1, stdout: '' }; }
    if (args.includes('--download-sections')) {
      downloads.push({ id: args.at(-1), win: args[args.indexOf('--download-sections') + 1] });
      if (failDownload) return { status: 1, stdout: '' };
      fs.copyFileSync(BASE, args[args.indexOf('-o') + 1]);
      return { status: 0, stdout: '' };
    }
    return { status: 1, stdout: '' };
  };
  run.downloads = downloads;
  return run;
};
/** Sırayla yanıt veren sahte görme modeli. */
const visionSeq = (...answers) => {
  const f = async (o) => { f.calls.push(o); return answers[Math.min(f.calls.length - 1, answers.length - 1)]; };
  f.calls = [];
  return f;
};
const kartal = () => ({ title: "Eagle's Nest fire", scenes: [{ type: 'photo', say: "[grave] On Friday night, 23 October 2026, the Eagle's Nest burned.", dur: 5, imagePrompt: 'p' }] });
const plan = (o = {}) => async () => ({ moments: [{ scene: 0, kind: 'event', query: 'Kehlsteinhaus Flammen Brand 2026', who: '', quote: '', why: '', year: 2026, ...o }] });

test('görme kararı nedenini söyler: kareye ait ret yeniden denenebilir, videonun kendisine ait ret denenmez; looksRight yine boolean', async () => {
  const say = "On Friday night, 23 October 2026, the Eagle's Nest burned.";
  const v = (res, o = {}) => S.lookVerdict({ jpgAbs: JPG, say, kind: 'event', year: 2026, ...o }, { visionLlm: async () => res });
  // Küçük şeyler klibi düşürmez: isim kartı / tek satır altyazı / köşe logosu (Lula: Record'un "JR" logosu).
  assert.deepEqual(await v({ ...OK, textCover: 6, why: 'fire on the mountain' }), { ok: true, reason: '', retry: false, why: 'fire on the mountain' });
  assert.equal((await v({ ...OK, textCover: 0 })).ok, true, 'köşe logosu 0 sayılır');
  assert.equal((await v({ ...OK, bigBakedText: true, textCover: 6 })).ok, true, 'yazının payı verilmişse karar odur');
  // Büyük başlık bandı düşürür, ama o kareye ait: aynı videonun başka anı denenebilir.
  assert.deepEqual(await v({ ...OK, textCover: 30 }), { ok: false, reason: 'büyük ekran yazısı (%30)', retry: true, why: '' });
  // 0-1 arası değer: model büyük yazı dediyse oran (0.3 → %30), demediyse yüzde birin altı (inceleme, 27 Ekim 2026: 0.5'lik
  // minik filigran %50 sayılıp her penceresiyle bütün videoyu düşürürdü).
  assert.equal((await v({ ...OK, bigBakedText: true, textCover: 0.3 })).reason, 'büyük ekran yazısı (%30)', 'büyük yazı + kesir: oran');
  assert.deepEqual(await v({ ...OK, textCover: 0.5 }), { ok: true, reason: '', retry: false, why: '' }, 'küçük yazı + kesir: yüzde birin altı');
  assert.equal((await v({ ...OK, textCover: 0.3 })).ok, true);
  assert.equal((await v({ ...OK, textCover: S.LOOK_TEXT_MAX })).ok, false, 'sınırda düşer');
  assert.equal((await v({ ...OK, textCover: S.LOOK_TEXT_MAX - 1 })).ok, true);
  assert.deepEqual(await v({ ...OK, bigBakedText: true }), { ok: false, reason: 'büyük ekran yazısı', retry: true, why: '' }, 'pay yazılmamışsa eski bayrak');
  assert.deepEqual(await v({ ...OK, fits: false, anchorOrStudio: true }), { ok: false, reason: 'stüdyo spikeri, anlatıma uymuyor', retry: true, why: '' });
  assert.deepEqual(await v({ ...OK, fits: false }), { ok: false, reason: 'anlatıma uymuyor', retry: true, why: '' });
  // Videonun kendisine ait ret: başka anı denenmez.
  assert.deepEqual(await v({ ...OK, agencyLabel: true }), { ok: false, reason: 'ajans etiketi', retry: false, why: '' });
  assert.deepEqual(await v({ ...OK, graphic: true }), { ok: false, reason: 'sert görüntü (reklama uygun değil)', retry: false, why: '' });
  assert.deepEqual(await v({ ...OK, aiMade: true }), { ok: false, reason: 'yapay zekâ görüntüsü', retry: false, why: '' });
  assert.deepEqual(await v({ ...OK, fits: false, otherYear: true }), { ok: false, reason: 'farklı yıl, anlatıma uymuyor', retry: false, why: '' });
  assert.deepEqual(await v({ ...OK, fits: false, otherYear: true }, { year: 0 }), { ok: false, reason: 'anlatıma uymuyor', retry: true, why: '' }, 'yıl bilinmiyorsa farklı yıl yok');
  assert.equal((await v({ ...OK, fits: false, agencyLabel: true, textCover: 40 })).reason, 'ajans etiketi, büyük ekran yazısı (%40), anlatıma uymuyor', 'bütün nedenler');
  assert.equal((await v({ ...OK, fits: false }, { kind: 'voice', who: 'Lula' })).reason, 'kişi konuşurken görünmüyor');
  // Uzun gerekçe log için kısaltılır (şemada sınır yok: ikinci ücretli istek açmaz).
  assert.ok((await v({ ...OK, fits: false, why: 'The frame shows a TV studio. '.repeat(20) })).why.length <= 90);
  // Denetlenemeyen kare: alınmaz, yeniden de denenmez.
  assert.deepEqual(await S.lookVerdict({ jpgAbs: path.join(home, 'yok.jpg'), say, kind: 'event' }, { visionLlm: noLlm }), { ok: false, reason: 'denetlenemedi', retry: false, why: '' });
  assert.deepEqual(await S.lookVerdict({ jpgAbs: JPG, say, kind: 'event' }, { visionLlm: async () => { throw new Error('400 Could not process image'); } }), { ok: false, reason: 'denetlenemedi', retry: false, why: '' });
  assert.equal((await S.lookVerdict({ jpgAbs: JPG, say, kind: 'event' }, {})).ok, true, 'görme yoksa eskisi gibi denetimsiz');
  // looksRight sözleşmesi değişmedi (boolean); onVerdict nedeni verir.
  let seen = null;
  assert.equal(await S.looksRight({ jpgAbs: JPG, say, kind: 'event' }, { visionLlm: async () => ({ ...OK, anchorOrStudio: true }), onVerdict: (x) => { seen = x; } }), false);
  assert.equal(seen.reason, 'stüdyo spikeri');
  assert.equal(await S.looksRight({ jpgAbs: JPG, say, kind: 'event' }, { visionLlm: async () => ({ fits: true }) }), true);
});

test('istem: logo/filigran/isim kartı/tek satır altyazı serbest ve görünür kalır; yazının payı sorulur; eski beş bayrak şemaya yine uyar', async () => {
  let seen = null;
  await S.lookVerdict({ jpgAbs: JPG, say: 'The fire spread to the roof.', kind: 'event', year: 2026 }, { visionLlm: async (o) => { seen = o; return OK; } });
  assert.match(seen.user, /textCover = percent of the picture/);
  assert.match(seen.user, /a corner logo or watermark counts 0/);
  assert.match(seen.user, /small name strap \(lower third\) about 3-8/);
  assert.match(seen.user, new RegExp(`bigBakedText=true only if textCover is ${S.LOOK_TEXT_MAX} or more`));
  assert.match(seen.user, /they stay visible, we never crop or cover them/);
  assert.match(seen.user, /a TV channel's own corner logo or watermark is not an agency label/);
  assert.match(seen.user, /The event is from 2026: .* otherYear true/);
  // aiMade "yalnızca eminsen" değil ve sinematik ışık AI işaretidir (inceleme, 27 Ekim 2026: Kartal'ın yapay itfaiye
  // karesi sahne 16'nın satırına uyuyor, tek satır altyazısı artık düşürmüyor).
  assert.match(seen.user, /aiMade=true if the picture looks AI-generated or computer-rendered rather than filmed by a real camera/);
  assert.match(seen.user, /glossy too-perfect cinematic lighting/);
  assert.match(seen.user, /Ordinary phone, CCTV, TV or drone camera footage is not aiMade, even when color-graded/);
  assert.doesNotMatch(seen.user, /only if you are sure|cinematic or color-graded camera footage is not aiMade/);
  assert.equal(S.LOOK_TEXT_MAX, 15);
  // Şema: textCover ve aiMade ZORUNLU (inceleme, 27 Ekim 2026: isteğe bağlıyken model aiMade'i atlayabiliyordu, atlanan
  // alan "AI değil" okunuyordu); otherYear isteğe bağlı. Alanları yazmayan eski yanıt kodda yine eski bayraklarla okunur.
  assert.deepEqual(seen.schema.required, ['fits', 'anchorOrStudio', 'agencyLabel', 'bigBakedText', 'graphic', 'textCover', 'aiMade', 'reenactment', 'why']);
  assert.equal(seen.schema.properties.textCover.type, 'number');
  assert.equal(seen.schema.properties.otherYear.type, 'boolean');
  assert.ok(validateSchema({ ...OK, why: 'x' }, seen.schema).length > 0, 'eski beş bayraklı yanıt şemayı geçmez');
  assert.deepEqual(validateSchema({ ...OK, textCover: 6, aiMade: false, reenactment: false, why: 'x' }, seen.schema), []);
  assert.deepEqual(validateSchema({ ...OK, textCover: 6, otherYear: false, aiMade: false, reenactment: false, why: 'x' }, seen.schema), []);
  assert.ok(seen.maxTokens >= 600);
});

test('aynı videonun pencereleri: ilki en çok izlenen an, sonra öteki tepeler ya da videonun ilerisi; binmez, video içinde, en çok 8 sn', () => {
  const hm = (s, v) => ({ start_time: s, end_time: s + 3, value: v });
  const info = { duration: 300, heatmap: [hm(3, 1.5), hm(40, 1), hm(43, 0.95), hm(150, 0.7), hm(220, 0.6), hm(290, 2)] };
  const w = S.eventWindows(info, { want: 6, n: 3 });
  assert.deepEqual(w[0], S.eventWindow(info, { want: 6 }), 'ilk pencere eskisiyle aynı');
  assert.deepEqual(w, [{ start: 40, end: 46 }, { start: 150, end: 156 }, { start: 220, end: 226 }], 'giriş/bitiş ekranı ve aynı tepenin komşusu yok');
  // Heatmap yoksa: %12, sonra %35 ve %60.
  assert.deepEqual(S.eventWindows({ duration: 200 }, { want: 6 }), [{ start: 24, end: 30 }, { start: 70, end: 76 }, { start: 120, end: 126 }]);
  // Kısa videoda binmeyen ikinci an yoksa tek pencere.
  assert.equal(S.eventWindows({ duration: 12 }, { want: 6 }).length, 1);
  assert.deepEqual(S.eventWindows({ duration: 0 }), []);
  for (const dur of [20, 45, 90, 600, 2400]) {
    const ws = S.eventWindows({ duration: dur }, { want: 20, n: 3 });
    for (const x of ws) assert.ok(x.end - x.start <= S.SOURCE_LIMITS.maxClipSec && x.start >= 0 && x.end <= dur, `${dur}: ${JSON.stringify(x)}`);
    for (let i = 1; i < ws.length; i++) assert.ok(ws.slice(0, i).every((p) => Math.abs(p.start - ws[i].start) >= p.end - p.start), `${dur}: binmez`);
  }
});

test('Kartal Yuvası: yangın videosunun karesi isim kartlı polis sözcüsüne düşerse aynı videonun başka anı denenir; nedeni log\'da', async () => {
  const { dir, pub, cache } = jobDir();
  const run = fakeYt(
    [{ id: 'flammen0001', title: 'KEHLSTEINHAUS IN FLAMMEN! Verdächtiger festgenommen — Brandstiftung', channel: 'Berchtesgaden Aktuell', duration: 180 }],
    { flammen0001: { id: 'flammen0001', duration: 180, upload_date: '20261024', heatmap: [{ start_time: 30, end_time: 32, value: 1 }, { start_time: 100, end_time: 102, value: 0.8 }] } },
  );
  const vision = visionSeq(
    { ...OK, fits: false, anchorOrStudio: true, textCover: 5, why: 'police spokesperson with a name strap' },
    { ...OK, textCover: 2, why: 'house burning at night, small channel logo' },
  );
  const log = [];
  const r = await S.attachSourceClips(kartal(), { dir, publicDir: pub, buildPrefix: 'build/k', settings: { docuSourceSocial: false }, ytdlp: run, ffmpeg: FFMPEG, llm: plan(), visionLlm: vision, textLlm: noLlm, logFn: (l) => log.push(l) });
  assert.equal(r.added.length, 1, log.join('\n'));
  assert.deepEqual(run.downloads.map((d) => d.win), ['*30-35', '*100-105'], 'ilk an, sonra öteki tepe');
  assert.equal(vision.calls.length, 2);
  assert.ok(log.some((l) => l.startsWith('Kaynak video reddedildi (stüdyo spikeri, anlatıma uymuyor — "police spokesperson with a name strap") [30. sn], aynı videonun başka anına bakılıyor: "KEHLSTEINHAUS IN FLAMMEN!')), log.join('\n'));
  assert.ok(log.some((l) => l.startsWith('Kaynak video: aynı videonun 2. anı uydu [100. sn]')), log.join('\n'));
  assert.ok(!log.some((l) => l.includes('anlatıma uymuyor ya da reklama uygun değil')), 'birleşik eski neden yok');
  const pick = JSON.parse(fs.readFileSync(cache, 'utf8')).picks[0];
  assert.equal(pick.id, 'flammen0001');
  assert.equal(pick.label, 'Video: Berchtesgaden Aktuell · Oct 2026', 'kaynak etiketi');
  // fetchClip dosya adı: sha1(id|başlangıç|bitiş) — ikinci anın (100-105) klibi.
  assert.equal(pick.video, `build/k/src/src-${crypto.createHash('sha1').update('flammen0001|100|105').digest('hex').slice(0, 10)}.mp4`, 'ikinci anın klibi');
  assert.equal(r.script.scenes[0].video, pick.video);
});

test('videonun kendisine ait ret (ajans etiketi, sert görüntü, yapay zekâ, farklı yıl) başka anına baktırmaz: sıradaki aday', async () => {
  for (const [flag, reason] of [['agencyLabel', 'ajans etiketi'], ['graphic', 'sert görüntü (reklama uygun değil)'], ['aiMade', 'yapay zekâ görüntüsü'], ['otherYear', 'farklı yıl']]) {
    const { dir, pub } = jobDir();
    const info = (id) => ({ id, duration: 200, upload_date: '20261024' });
    const run = fakeYt(
      [{ id: 'nachtbrand01', title: 'Kehlsteinhaus Flammen Brand 2026 – The Night the Eagle\'s Nest Burned', channel: 'Alpen Kanal', duration: 200 },
        { id: 'brandvideo2', title: 'Kehlsteinhaus Flammen Löscharbeiten', channel: 'Feuerwehr Fan', duration: 200 }],
      { nachtbrand01: info('nachtbrand01'), brandvideo2: info('brandvideo2') },
    );
    const vision = visionSeq({ ...OK, [flag]: true }, OK);
    const log = [];
    const r = await S.attachSourceClips(kartal(), { dir, publicDir: pub, buildPrefix: 'build/h', settings: { docuSourceSocial: false }, ytdlp: run, ffmpeg: FFMPEG, llm: plan(), visionLlm: vision, textLlm: noLlm, logFn: (l) => log.push(l) });
    assert.deepEqual(run.downloads.map((d) => d.id), ['nachtbrand01', 'brandvideo2'], `${flag}: aynı videonun başka anı indirilmedi`);
    assert.equal(r.added.length, 1, flag);
    assert.ok(log.some((l) => l.startsWith(`Kaynak video reddedildi (${reason}) [24. sn]: "Kehlsteinhaus Flammen Brand 2026`)), `${flag}\n${log.join('\n')}`);
    assert.ok(!log.some((l) => l.includes('başka anına bakılıyor')), flag);
  }
});

test('an başına 5 aday, en çok 8 kare: her aday en az bir kez bakılır, artan pay aynı videonun başka anına', async () => {
  assert.deepEqual(S.LOOK_LIMITS, { candidates: 5, windows: 3, perMoment: 8 });
  const { dir, pub, cache } = jobDir();
  const ids = ['lulacamp001', 'lulacamp002', 'lulacamp003', 'lulacamp004', 'lulacamp005', 'lulacamp006'];
  const run = fakeYt(
    ids.map((id, i) => ({ id, title: `Lula ends campaign in São Paulo rally ${i + 1}`, channel: `Rua Brasil ${i + 1}`, duration: 200 })),
    Object.fromEntries(ids.map((id) => [id, { id, duration: 200, upload_date: '20261025' }])),
  );
  const vision = visionSeq({ ...OK, fits: false, why: 'empty street' });
  const log = [];
  const script = { title: 'Lula', scenes: [{ type: 'photo', say: 'Lula ended his campaign in São Paulo.', dur: 5, imagePrompt: 'p' }] };
  const r = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/l', settings: { docuSourceSocial: false }, ytdlp: run, ffmpeg: FFMPEG,
    llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: 'Lula ends campaign São Paulo rally', who: '', quote: '', why: '', year: 2026 }] }), visionLlm: vision, textLlm: noLlm, logFn: (l) => log.push(l) });
  assert.equal(r.added.length, 0);
  assert.equal(vision.calls.length, S.LOOK_LIMITS.perMoment, 'kare denetimi tavanı');
  const per = ids.map((id) => run.downloads.filter((d) => d.id === id).length);
  assert.deepEqual(per, [3, 2, 1, 1, 1, 0], 'beş aday da bakıldı (eskiden 3), altıncıya geçilmedi');
  assert.equal(log.filter((l) => l.startsWith('Kaynak video reddedildi (anlatıma uymuyor — "empty street")')).length, 8);
  assert.deepEqual(JSON.parse(fs.readFileSync(cache, 'utf8')).picks, [], '"klip yok" bir karardır, kaydedilir');
});

test('inmeyen video başka anıyla yeniden indirilmez; hesap/bağlantı hatası pencere döngüsünde de adımı durdurur, kayıt yazılmaz', async () => {
  const entries = [{ id: 'flammen0001', title: 'Kehlsteinhaus Flammen Brand', channel: 'Alpen Kanal', duration: 200 }, { id: 'flammen0002', title: 'Kehlsteinhaus Flammen Feuer', channel: 'Berg TV Fan', duration: 200 }];
  const infos = { flammen0001: { id: 'flammen0001', duration: 200, upload_date: '20261024' }, flammen0002: { id: 'flammen0002', duration: 200, upload_date: '20261024' } };
  {
    const { dir, pub } = jobDir();
    const run = fakeYt(entries, infos, { failDownload: true });
    const vision = visionSeq(OK);
    await S.attachSourceClips(kartal(), { dir, publicDir: pub, buildPrefix: 'build/d', settings: { docuSourceSocial: false }, ytdlp: run, ffmpeg: FFMPEG, llm: plan(), visionLlm: vision, textLlm: noLlm });
    assert.deepEqual(run.downloads.map((d) => d.id), ['flammen0001', 'flammen0002'], 'aday başına tek indirme denemesi');
    assert.equal(vision.calls.length, 0);
  }
  {
    const { dir, pub, cache } = jobDir();
    const run = fakeYt(entries, infos);
    const err = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');
    let n = 0;
    const vision = async () => { if (++n === 2) throw err; return { ...OK, anchorOrStudio: true }; };
    const log = [];
    await assert.rejects(S.attachSourceClips(kartal(), { dir, publicDir: pub, buildPrefix: 'build/e', settings: { docuSourceSocial: false }, ytdlp: run, ffmpeg: FFMPEG, llm: plan(), visionLlm: vision, textLlm: noLlm, logFn: (l) => log.push(l) }), (e) => e === err);
    assert.equal(fs.existsSync(cache), false, 'kayıt yazılmadı: kredi gelince yeniden aranır');
    assert.ok(log.includes('Kaynak video denetimi durdu (Anthropic kredisi yok) — kayıt yazılmadı, sonraki çalıştırmada yeniden aranır'), log.join('\n'));
  }
});

test('sosyal medya klibinin ret nedeni de yazılır; gönderi başına tek pencere (sosyal medya bütçesi değişmedi)', async () => {
  const { dir, pub } = jobDir();
  const tt = 'https://www.tiktok.com/@berchtesgaden_live/video/7565550012345678901';
  const run = fakeYt([], { [tt]: { id: '7565', duration: 60, upload_date: '20261024', uploader: 'berchtesgaden_live', webpage_url: tt } });
  const vision = visionSeq({ ...OK, fits: false, textCover: 35, why: 'a headline card over a photo' });
  const log = [];
  const r = await S.attachSourceClips(kartal(), { dir, publicDir: pub, buildPrefix: 'build/s', settings: {}, ytdlp: run, ffmpeg: FFMPEG, llm: plan(), visionLlm: vision, textLlm: async () => tt, logFn: (l) => log.push(l) });
  assert.equal(r.added.length, 0);
  assert.equal(run.downloads.length, 1);
  assert.ok(log.includes(`Sosyal medya klibi reddedildi (büyük ekran yazısı (%35), anlatıma uymuyor — "a headline card over a photo"): ${tt.slice(0, 70)}`), log.join('\n'));
});

// İnceleme, 27 Ekim 2026: küçük TV logosu artık klibi düşürmediği için yayıncının KENDİ hesabı adından elenir. Lula
// 20261026-29db03'te Record'un miting görüntüsü vardı; sıradaki video İsrail 2026 seçimi. Kısa adlar (TIME, Band, Record,
// Kan) yalnızca kanal adının tamamıysa: sıradan kanal adı tutmaz.
test('yayıncı listesi: Brezilya ve İsrail TV kanalları elenir; sıradan kanal adları (Real Time History, Big Band) geçer', () => {
  const tv = ['TV Globo TV Globo', 'GloboNews', 'RecordTV', 'Jornal da Record', 'SBT News', 'BandNews TV', 'CNN Brasil', 'Jovem Pan News', 'TIME TIME', 'TIME ', 'Record', 'Band',
    'Kan News', 'KAN - Israeli Public Broadcasting', 'N12 News', 'Channel 12', 'Channel 13 News', 'i24NEWS English', 'The Times of Israel', 'כאן חדשות', 'חדשות 12'];
  for (const c of tv) assert.ok(S.BROADCASTERS.test(c), c);
  const own = ['Real Time History', 'TimeGhost History', 'Big Band Swing', 'Band of Brothers Fan', 'Guinness World Records', 'Record Breakers', 'Recording Studio Tips', 'Kansas City Star', 'SBTV Music', 'Globetrotter Joe', 'Brasil Paralelo', 'TIME Travel Vlog'];
  for (const c of own) assert.ok(!S.BROADCASTERS.test(c), c);
  // Kaynak metninde maliyet/süre notu düzeltildi: en kötü durumda ~75 kare, ~30-40 dk daha.
  const src = fs.readFileSync(new URL('../src/pipeline/source-clips.js', import.meta.url), 'utf8');
  assert.match(src, /en kötü durumda ~75 kare denetimi DAHA/);
  assert.match(src, /~30-40 dk daha/);
});

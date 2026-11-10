// 1.16.21 — GERÇEK GÖRÜNTÜ (22 Ekim 2026, kanal sahibi: "anlattığı şeyin videosu çıksa insanlar daha çok izler… gündem
// kanalına tam oturur… başa koymak iyi olabilir"; "videolar gözükürken ekran titremesin"; "nerden bulacak?"; "bazı
// yerlerde insanların yüzü sararıyor"). Haber kanalında klip payı ~%33, kanca klibi, klibin kendi sesi, reklama uygun
// olmayan kare reddi, TikTok/X/Telegram araması, gerçek görüntüye kamera oyunu yok, seçici renkte ten renksiz.
// Ağ YOK: yt-dlp, model, web araması ve görme sahte; klip ffmpeg ile üretilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gercek-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');
const S = await import('../src/pipeline/source-clips.js');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('haber kanalı daha çok klip alır (%33, 14 olay); kanca klibi pay sınırına takılmaz', () => {
  assert.equal(S.limitsFor({ news: true }).shareMax, 0.33);
  assert.equal(S.limitsFor({ news: true }).events, 14);
  assert.equal(S.limitsFor().shareMax, 0.18);
  const moments = Array.from({ length: 20 }, (_, i) => ({ scene: i, kind: 'event', ...(i === 17 ? { hook: true } : {}) }));
  const doc = S.withinShare(moments, 600);
  const news = S.withinShare(moments, 600, 6, { news: true });
  assert.ok(news.length > doc.length, 'haberde daha çok');
  assert.equal(doc[0].scene, 17, 'kanca önce');
});

test('plan: ilk satırlardaki olay anı kanca klibi olur; istem reklam güvenliğini ve kancayı ister', async () => {
  let prompt = '';
  const llm = async (o) => { prompt = o.user; return { moments: [
    { scene: 1, kind: 'event', query: 'Paris curfew riot night', who: '', quote: '', why: '' },
    { scene: 6, kind: 'event', query: 'Limoges city hall fire', who: '', quote: '', why: '' },
  ] }; };
  const script = { title: 'France', scenes: Array.from({ length: 8 }, (_, i) => ({ type: 'photo', say: `line ${i} about the riots` })) };
  const m = await S.planSourceMoments(script, { llm, news: true });
  assert.equal(m.find((x) => x.scene === 1).hook, true);
  assert.equal(m.find((x) => x.scene === 6).hook, undefined);
  assert.match(prompt, /HOOK/);
  assert.match(prompt, /AD-SAFE/);
  assert.match(prompt, /never a moment whose footage would show blood/);
  assert.match(prompt, /at most 14 EVENT/);
});

test('sosyal medya adresleri: gönderiler alınır, arama/etiket sayfaları alınmaz', () => {
  const text = `Here: https://www.tiktok.com/@paris_live/video/7562210012345678901, https://x.com/witness/status/1981234567890123456.
  Also https://www.tiktok.com/tag/paris and https://x.com/search?q=paris and https://t.me/parisnow/4521 and https://www.instagram.com/reel/DAbc123xyz/`;
  assert.deepEqual(S.socialUrls(text), [
    'https://www.tiktok.com/@paris_live/video/7562210012345678901',
    'https://x.com/witness/status/1981234567890123456',
    'https://t.me/parisnow/4521',
    'https://www.instagram.com/reel/DAbc123xyz/',
  ]);
});

const fakeClip = (o) => execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=720x1280:d=5', '-f', 'lavfi', '-i', 'sine=d=5', '-shortest', o]);

test('YouTube\'da yoksa TikTok\'tan: web aramasıyla bulunur, yalnızca pencere indirilir, etikette hesap adı; klibin kendi sesi doğal ses olur', async () => {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  const script = { title: 'France', scenes: [{ type: 'photo', say: 'Crowds ran from the tear gas on Saturday night.', dur: 5, imagePrompt: 'p' }] };
  const tt = 'https://www.tiktok.com/@paris_live/video/7562210012345678901';
  const ytdlp = (args) => {
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries: [] }) };
    if (args[0] === '-J') return { status: 0, stdout: JSON.stringify({ id: '756', duration: 14, upload_date: '20261018', uploader: 'paris_live', webpage_url: tt }) };
    assert.ok(args.includes('--download-sections'), 'yalnızca pencere');
    fakeClip(args[args.indexOf('-o') + 1]);
    return { status: 0, stdout: '' };
  };
  const r = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/fr', settings: {}, ytdlp, ffmpeg: FFMPEG, news: true,
    llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: 'Paris tear gas crowd night', who: '', quote: '', why: '' }] }),
    textLlm: async (o) => { assert.equal(o.webSearch, true); return `${tt}\nhttps://x.com/search?q=paris`; },
    visionLlm: async () => ({ fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: false, why: '' }) });
  assert.equal(r.added.length, 1);
  const s = r.script.scenes[0];
  assert.match(s.sourceLabel, /^Video: @paris_live on TikTok · Oct 2026$/);
  // 1.16.25: klibin kendi sesi varsayılan olarak anlatımın altına girmez (konuşma/müzik üst üste biniyordu).
  assert.ok(!s.natSound, 'klibin kendi sesi varsayılan olarak yok');
  assert.equal(r.credits['scene-0'].provider, 'social');
});

test('reklama uygun olmayan kare (kan, yaralı, dövülen biri) girmez', async () => {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  const script = { title: 'F', scenes: [{ type: 'photo', say: 'Police charged the crowd.', dur: 5 }] };
  const ytdlp = (args) => {
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries: [{ id: 'v', title: 'Police charged the crowd Paris', channel: 'Eyewitness Paris', duration: 60 }] }) };
    if (args[0] === '-J') return { status: 0, stdout: JSON.stringify({ id: 'v', duration: 60, upload_date: '20261018' }) };
    fakeClip(args[args.indexOf('-o') + 1]);
    return { status: 0, stdout: '' };
  };
  const r = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/g', settings: { docuSourceSocial: false }, ytdlp, ffmpeg: FFMPEG,
    llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: 'police charged crowd Paris', who: '', quote: '', why: '' }] }),
    visionLlm: async () => ({ fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: true, why: 'blood on the ground' }) });
  assert.equal(r.added.length, 0);
});

test('motor: gerçek görüntü kendi hâlinde oynar (sallantı, sarsıntı, itme, yakınlaştırma, yavaş çekim yok); doğal ses anlatımın altında', () => {
  const fx = read('docu-engine', 'src', 'fx.tsx');
  assert.ok(fx.includes('export function steadyFootage('));
  assert.ok(fx.includes('return !!o?.video && !!(o.archived || o.sourceLabel || o.sourceVoice);'));
  for (const s of ['if (cam?.camera && !steady)', "sfx?.fx.has('speed-ramp') && !clip.steady", 'holding && !clip.steady', 'const base = steady ? 1 :', 'const passed = steady ? 0 :']) assert.ok(fx.includes(s), s);
  const eng = read('docu-engine', 'src', 'Engine.tsx');
  assert.ok(eng.includes('if (steadyShot || d < 0 || d > 10) continue;') && eng.includes('if (mood.unease > 0 && !steadyShot)'));
  assert.ok(read('docu-engine', 'src', 'scenes.tsx').includes('if (steadyFootage(scene)) return NO_REFRAME;'));
  const prod = read('docu-engine', 'lib', 'produce.mjs');
  assert.ok(prod.includes('const NAT_LUFS = -30;') && prod.includes('script.eventCues = [...(script.eventCues ?? []), ...script._natCues];'));
  assert.ok(read('src', 'pipeline', 'docu.js').includes('news: job.docuFormat === "news" });'));
});

test('seçici renk: ten rengi maskenin altında kalır, güçlü kırmızı (ateş, siren) renkli kalır', () => {
  const src = read('docu-engine', 'src', 'topic', 'index.tsx');
  // Kartal Yuvası 950730, 29 Ekim 2026 (gorunus-motor): the mask row reads the SELECTIVE_MASK constant (a softer colour-pop); skin stays safe.
  assert.ok(src.includes('values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${SELECTIVE_MASK}`} result="mask"'), 'maske satırı sabiti okur');
  const m = /export const SELECTIVE_MASK = '([-\d.]+) ([-\d.]+) ([-\d.]+) 0 ([-\d.]+)';/.exec(src);
  assert.ok(m, 'maske satırı');
  const [r, g, b, o] = m.slice(1).map(Number);
  const alpha = ([R, G, B]) => r * R + g * G + b * B + o;
  for (const skin of [[0.95, 0.65, 0.55], [0.9, 0.65, 0.55], [0.6, 0.4, 0.3], [0.8, 0.55, 0.45]]) assert.ok(alpha(skin) <= 0.05, `ten ${skin}: ${alpha(skin)}`);
  for (const hot of [[1, 0, 0], [1, 0.55, 0.1], [0.9, 0.15, 0.1]]) assert.ok(alpha(hot) >= 1, `kırmızı ${hot}: ${alpha(hot)}`);
});

test('yükseklik/ölçü sayacı yıl sayılmaz (Kartal Yuvası: "1,834 meters" hikâyeyi 1834/1939 dönemine itti, 25 gerçek fotoğraf reddedildi)', async () => {
  const A = await import('../src/pipeline/docu-archive.js');
  const c = (o) => A.counterYear({ type: 'counter', ...o });
  assert.equal(c({ to: 1834, label: 'METERS ABOVE SEA LEVEL', say: 'The house stood at 1,834 meters,' }), null);
  assert.equal(c({ to: 1834, say: 'climbing to 1834 meters' }), null);
  assert.equal(c({ to: 1938, say: 'It opened in 1938.' }), 1938);
  assert.equal(c({ to: 2009, year: true }), 2009);
  const s = A.sceneEras({ scenes: [
    { chapter: 0, type: 'counter', to: 1834, label: 'METERS ABOVE SEA LEVEL', say: 'The house stood at 1,834 meters,' },
    { chapter: 0, type: 'photo', say: 'On Friday night, 23 October 2026, it burned.' },
    { chapter: 0, type: 'photo', say: 'By Saturday it was almost gone.' },
  ] }, { news: true, now: 2026 });
  assert.ok(s.scenes.every((x) => x.era !== '1834'), s.scenes.map((x) => x.era).join(','));
  assert.equal(A.hikayeDonemi({ scenes: [{ type: 'counter', to: 1834, label: 'METERS', say: '1,834 meters' }, { type: 'photo', say: 'in 2026' }] }), '2026');
});

test('Avrupa yayıncıları ve ajanslar da elenir (Fransa borcu, 24 Ekim 2026: Le Parisien ve "CLPRESS / Agence de presse" klipleri girmişti)', () => {
  for (const c of ['Le Parisien', 'CLPRESS / Agence de presse', 'BFMTV', 'franceinfo', 'Bayerischer Rundfunk', 'BR24', 'DER SPIEGEL', 'La Provence']) assert.ok(S.BROADCASTERS.test(c), c);
  for (const c of ['Billy Cosgrave', 'obersalzberggeist', 'Christian Moos']) assert.ok(!S.BROADCASTERS.test(c), c);
});

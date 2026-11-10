// 1.16.19 — KAYNAK VİDEO (src/pipeline/source-clips.js): olayın gerçek görüntüsü ve kişinin kendi sesi, küçük kanal
// patlamalarının yaptığı gibi (Base Central: Mickey Rourke'un kendi videosu + KTLA klipleri, köşe etiketleri).
// Ağ YOK: yt-dlp, model ve görme sahte; klip ffmpeg ile üretilir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-src-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');
const S = await import('../src/pipeline/source-clips.js');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

test('arama: büyük TV/ajans kanalları elenir, sorguya yakın ve kısa (tanık) videolar önde', () => {
  const r = S.rankSearch([
    { id: 'a', title: 'Tanker fire Strait of Hormuz eyewitness footage', channel: 'Gulf Watcher', duration: 95 },
    { id: 'b', title: 'Tanker fire in Hormuz: live coverage', channel: 'Sky News', duration: 300 },
    { id: 'c', title: 'Cooking pasta at home', channel: 'Chef', duration: 200 },
    { id: 'd', title: 'Hormuz tanker fire full documentary', channel: 'Doc Hub', duration: 3000 },
  ], 'tanker fire Strait of Hormuz footage');
  assert.deepEqual(r.map((x) => x.id), ['a'], 'TV kanalı, alakasız ve 40 dk üstü elendi');
  assert.ok(S.rankSearch([{ id: 'b', title: 'Tanker fire Hormuz', channel: 'Sky News', duration: 300 }], 'tanker fire Hormuz', { broadcast: true }).length === 1, 'ayarla TV açılır');
});

test('olay penceresi en çok tekrar izlenen an (giriş ve bitiş ekranı hariç); ses penceresi altyazıda sözün geçtiği yer', () => {
  const info = { duration: 120, heatmap: [{ start_time: 0, end_time: 3, value: 1 }, { start_time: 40, end_time: 44, value: 0.9 }, { start_time: 70, end_time: 74, value: 0.5 }] };
  assert.deepEqual(S.eventWindow(info, { want: 6 }), { start: 40, end: 46 });
  assert.deepEqual(S.eventWindow({ duration: 50 }, { want: 6 }), { start: 6, end: 12 }, 'heatmap yoksa %12');
  const cues = [
    { t: 0, d: 2, text: 'Hi everyone thanks for the support' },
    { t: 10, d: 2.5, text: "somebody set up a fund for me" },
    { t: 12.5, d: 2.5, text: "and that's not me, okay?" },
    { t: 15, d: 2, text: "I wouldn't ask for money" },
  ];
  const v = S.voiceWindow(cues, "Somebody set up a fund for me, and that's not me. I wouldn't ask for money.");
  assert.ok(v && v.start === 10 && v.end <= 18, JSON.stringify(v));
  assert.equal(S.voiceWindow(cues, 'The stock market crashed in Tokyo today'), null, 'zayıf örtüşme reddedilir');
});

test('köşe etiketi: kaynak + ay yıl; kişinin sesi "kim, via kanal"', () => {
  assert.equal(S.sourceLabel({ channel: 'Gulf Watcher', uploadDate: '20261018' }), 'Video: Gulf Watcher · Oct 2026');
  assert.equal(S.sourceLabel({ channel: 'mickeyrourke', uploadDate: '20260112', who: 'Mickey Rourke' }), 'Mickey Rourke, via mickeyrourke · Jan 2026');
});

test('seçimler senaryoya: olay klibi sahnenin görüntüsü (anlatım üstünde), ses klibi satırın ardına kendi sahnesi; künye yazılır', () => {
  const script = { title: 'T', scenes: [
    { type: 'photo', say: 'Two tankers burned in the strait.', imagePrompt: 'x', dur: 4 },
    { type: 'photo', say: 'He said: somebody set up a fund for me.', dur: 4 },
    { type: 'photo', say: 'The end.', dur: 3 },
  ] };
  const picks = [
    { kind: 'event', scene: 0, video: 'build/x/src/src-a.mp4', image: 'build/x/src/src-a.jpg', dur: 6, w: 1280, h: 720, label: 'Video: Gulf Watcher · Oct 2026', title: 'Tanker fire', channel: 'Gulf Watcher', url: 'https://www.youtube.com/watch?v=a', id: 'a' },
    { kind: 'voice', scene: 1, video: 'build/x/src/src-b.mp4', wav: 'build/x/src/src-b.wav', image: 'build/x/src/src-b.jpg', dur: 5, w: 1080, h: 1920, label: 'Mickey Rourke, via mr · Jan 2026', quoteText: "somebody set up a fund for me and that's not me", title: 'MR', channel: 'mr', url: 'https://www.youtube.com/watch?v=b', id: 'b' },
  ];
  const credits = {};
  const r = S.applySourcePicks(script, credits, picks);
  const sc = r.script.scenes;
  assert.equal(sc.length, 4);
  assert.equal(sc[0].video, 'build/x/src/src-a.mp4');
  assert.equal(sc[0].sourceLabel, 'Video: Gulf Watcher · Oct 2026');
  assert.equal(sc[0].imagePrompt, undefined);
  assert.equal(sc[0].say, 'Two tankers burned in the strait.', 'anlatım aynen');
  assert.equal(sc[2].sourceVoice.file, 'build/x/src/src-b.wav', 'ses sahnesi satırın ardında');
  assert.equal(sc[2].say, "somebody set up a fund for me and that's not me");
  assert.equal(sc[3].say, 'The end.');
  assert.equal(credits['scene-0'].provider, 'youtube');
  assert.ok(credits['source-b'].url.endsWith('=b'));
});

test('uçtan uca (sahte yt-dlp/model/görme): plan → arama → pencere → indirme → denetim → sahne; ikinci çalıştırma kayıttan, aramasız', async () => {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  const script = { title: 'Hormuz', scenes: [
    { type: 'photo', say: 'Iran says two tankers hit mines in the Strait of Hormuz.', dur: 5, imagePrompt: 'p' },
    { type: 'photo', say: 'Insurers raised war-risk rates.', dur: 4 },
  ] };
  const calls = [];
  const ytdlp = (args) => {
    calls.push(args.join(' '));
    if (args[0] === '--version') return { status: 0, stdout: '2026.08.19' };
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries: [{ id: 'vid1', title: 'Tanker hit mine Strait of Hormuz footage', channel: 'Gulf Watcher', duration: 80 }, { id: 'tv', title: 'Tanker mine Hormuz live', channel: 'CNN', duration: 300 }] }) };
    if (args[0] === '-J') return { status: 0, stdout: JSON.stringify({ id: 'vid1', duration: 80, upload_date: '20261018', heatmap: [{ start_time: 20, end_time: 24, value: 1 }] }) };
    const o = args[args.indexOf('-o') + 1];
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=5', '-f', 'lavfi', '-i', 'sine=d=5', '-shortest', o]);
    return { status: 0, stdout: '' };
  };
  const llm = async () => ({ moments: [{ scene: 0, kind: 'event', query: 'tanker mine Strait of Hormuz footage', who: '', quote: '', why: 'the event' }, { scene: 9, kind: 'event', query: 'x', who: '', quote: '', why: 'out of range' }] });
  const vision = async () => ({ fits: true, anchorOrStudio: false, why: 'tanker' });
  const credits = {};
  const r = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/j1', credits, settings: {}, llm, visionLlm: vision, ytdlp, ffmpeg: FFMPEG });
  assert.equal(r.added.length, 1);
  const s0 = r.script.scenes[0];
  assert.match(s0.video, /^build\/j1\/src\/src-[0-9a-f]{10}\.mp4$/);
  assert.ok(fs.existsSync(path.join(pub, s0.video)));
  assert.ok(fs.existsSync(path.join(pub, s0.image)), 'poster karesi');
  assert.equal(s0.sourceLabel, 'Video: Gulf Watcher · Oct 2026');
  assert.ok(calls.some((c) => c.includes('*20-25')), 'yalnızca en çok izlenen pencere indirildi');
  assert.ok(!calls.some((c) => c.endsWith('-- tv')), 'TV kanalının videosuna bakılmadı');
  // kayıttan
  const calls2 = [];
  const r2 = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/j1', credits: {}, settings: {}, llm: async () => { throw new Error('should not plan'); }, visionLlm: vision, ytdlp: (a) => { calls2.push(a); return { status: 1 }; }, ffmpeg: FFMPEG });
  assert.equal(calls2.length, 0);
  assert.equal(r2.script.scenes[0].video, s0.video);
  // kapalı
  const off = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/j1', settings: { docuSourceClips: false } });
  assert.equal(off.added.length, 0);
});

test('Nova ve motor bağlantıları: iş akışında en sonda, kişinin sesi TTS değil, etiket ve altyazı çizilir', () => {
  const d = read('src', 'pipeline', 'docu.js');
  assert.ok(d.includes('await attachSourceClips(ed,'));
  assert.ok(d.indexOf('await attachSourceClips(ed,') > d.indexOf('applyTopicPlan(ed, topicPlan'), 'sahne sırasına bağlı kararlardan sonra');
  const p = read('docu-engine', 'lib', 'produce.mjs');
  assert.ok(p.includes('script.scenes.filter((s) => s.say && !s.sourceVoice)'));
  assert.ok(p.includes('sc.voice = publishAs(wavRel'));
  const e = read('docu-engine', 'src', 'scenes.tsx');
  assert.ok(e.includes('{scene.sourceLabel}'));
  assert.ok(e.includes('scene.sourceVoice && scene.say'));
});

test('NewsX dersi (Hürmüz denemesi): Reuters görüntüsünü yeniden yükleyen TV kanalı elenir; ajans etiketi ya da dev gömülü başlık görmede reddedilir', async () => {
  assert.equal(S.rankSearch([{ id: 'n', title: 'Tanker struck naval mine Hormuz', channel: 'NewsX Live', duration: 120 }], 'tanker naval mine Hormuz').length, 0);
  assert.ok(S.BROADCASTERS.test('Some News Live') && !S.BROADCASTERS.test('Ada Monzon'));
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(pub, { recursive: true });
  const script = { title: 'H', scenes: [{ type: 'photo', say: 'A tanker struck a naval mine near Hormuz.', dur: 5 }] };
  const ytdlp = (args) => {
    if (args.includes('--flat-playlist')) return { status: 0, stdout: JSON.stringify({ entries: [{ id: 'v', title: 'Tanker struck naval mine Hormuz', channel: 'Gulf Watcher', duration: 60 }] }) };
    if (args[0] === '-J') return { status: 0, stdout: JSON.stringify({ id: 'v', duration: 60, upload_date: '20261018' }) };
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:d=4', args[args.indexOf('-o') + 1]]);
    return { status: 0, stdout: '' };
  };
  const r = await S.attachSourceClips(script, { dir, publicDir: pub, buildPrefix: 'build/n', settings: {}, ytdlp, ffmpeg: FFMPEG,
    llm: async () => ({ moments: [{ scene: 0, kind: 'event', query: 'tanker naval mine Hormuz', who: '', quote: '', why: '' }] }),
    // Sosyal medya araması da sahte (gönderi yok): gerçek callText anahtarsız düşer, o da artık adımı durdurur.
    textLlm: async () => '',
    visionLlm: async () => ({ fits: true, anchorOrStudio: false, agencyLabel: true, bigBakedText: true, why: 'Source: Reuters + headline' }) });
  assert.equal(r.added.length, 0, 'ajans etiketli klip girmedi');
});

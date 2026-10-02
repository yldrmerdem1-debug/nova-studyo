// Video duman testi: sahnelere klip (OffthreadVideo) takılınca motorun doğru oynattığını doğrular.
//   node scripts/video-smoke.mjs <çıktı klasörü> [stiller] [--no-mp4] [--no-stills]
// Ücretli API çağırmaz. ffmpeg ile sentetik klipler üretir (testsrc zaman sayacı + hareketli
// sarı kare + kırmızı çerçeve: kırpma, oynatma hızı ve donma gözle görülür):
//   A 640x480 4:3 8 sn (arşiv: yumuşak plaka üstünde bütün gösterilir)
//   B 1920x1080 10 sn (tam kadraj, kesme-yakın planlar açık)
//   C 1280x720 2 sn (kısa: 0.75x yavaşlar, sonra son oynayan karede donar, yavaşça yaklaşır)
//   D/E/F yalnız MP4 testinde: 1920x1080, 960x540, 1080x1350 dikey
// (a) Her stil için montaj/başlık/bölüm kartı/slam/foto/kolaj/kelime sahnelerinin riskli
//     karelerini PNG olarak yazar + stil başına kontak sayfası (vsheet-<stil>.jpg).
// (b) 6 klipli ~30 sn'lik tek bir MP4'ü produce.mjs ile aynı ayarlarla render eder
//     (concurrency 4, gl angle, 120 sn zaman aşımı) ve süresini ölçer; MP4'ten saniyede bir
//     kare çekip kontak sayfası yapar (mp4-sheet.jpg).
// Ayrıca: dosyası olmayan ve bozuk bir klip — render durmamalı, durağan kareye düşmeli.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR, ensureBundle } from '../lib/produce.mjs';
import { placeTimeline } from '../src/timeline.js';

const args = process.argv.slice(2);
const noMp4 = args.includes('--no-mp4');
const noStills = args.includes('--no-stills');
const [outDir, genreArg = 'documentary,crime,epic,science,inspire,finance,horror'] = args.filter((a) => !a.startsWith('--'));
if (!outDir) {
  console.error('kullanım: node scripts/video-smoke.mjs <çıktı klasörü> [stiller] [--no-mp4] [--no-stills]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const FPS = 30;
const require = createRequire(join(ENGINE_DIR, '..', 'package.json'));
const ff = require('ffmpeg-static');

/* ------------------------------------------------------------ test media */

const site = join(os.tmpdir(), 'docu-video-smoke-site');
rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, 'public', 'img'), { recursive: true });
mkdirSync(join(site, 'public', 'clips'), { recursive: true });

function run(argv, what) {
  const r = spawnSync(ff, ['-y', '-hide_banner', '-v', 'error', ...argv], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`ffmpeg ${what}: ${r.stderr}`);
}

/**
 * A clip whose every frame tells what it is: testsrc's running timestamp, a
 * yellow square swinging left-right (motion), a red border (is the edge
 * cropped?) and a hue per clip. H.264, yuv420p, 30 fps, no audio — the
 * pipeline's contract.
 */
const FONT = 'C\\:/Windows/Fonts/arialbd.ttf';
function makeClip(name, w, h, dur, hue) {
  const out = join(site, 'public', 'clips', name);
  const sq = Math.round(Math.min(w, h) * 0.16);
  const t = Math.max(6, Math.round(w / 80));
  const letter = name[0].toUpperCase();
  // Burnt-in "<clip> <file time>": shows which clip and which moment of it is on screen.
  const tc = `drawtext=fontfile='${FONT}':text='${letter} %{pts\\:hms}':fontsize=${Math.round(h * 0.09)}:fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=8:x=(w-tw)/2:y=h*0.6`;
  const fc = (withText) =>
    [
      `testsrc=s=${w}x${h}:r=30:d=${dur},hue=h=${hue}[a]`,
      `color=c=yellow:s=${sq}x${sq}:r=30:d=${dur}[b]`,
      `[a][b]overlay=x='(W-w)*(0.5+0.45*sin(t*2.2))':y='H*0.22',drawbox=x=0:y=0:w=iw:h=ih:color=red@1:t=${t}${withText ? `,${tc}` : ''}[v]`,
    ].join(';');
  const enc = ['-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', out];
  try {
    run(['-filter_complex', fc(true), ...enc], name);
  } catch {
    run(['-filter_complex', fc(false), ...enc], name); // no drawtext/font on this machine
  }
  return `clips/${name}`;
}
/** The still `image` of a clip: its frame at `at` seconds (what the pipeline hands over). */
function stillOf(clip, at, name) {
  run(['-ss', String(at), '-i', join(site, 'public', clip), '-frames:v', '1', '-q:v', '3', join(site, 'public', 'img', name)], name);
  return `img/${name}`;
}
function makeImage(name, w, h, hue) {
  const out = join(site, 'public', 'img', name);
  run(['-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:d=1`, '-frames:v', '1', '-vf', `hue=h=${hue},drawbox=x=0:y=0:w=iw:h=ih:color=red@1:t=8`, '-q:v', '3', out], name);
  return `img/${name}`;
}

const t0 = Date.now();
const A = { video: makeClip('a-640x480.mp4', 640, 480, 8, 40), videoW: 640, videoH: 480, videoDur: 8 };
const B = { video: makeClip('b-1920x1080.mp4', 1920, 1080, 10, 200), videoW: 1920, videoH: 1080, videoDur: 10 };
const C = { video: makeClip('c-1280x720-short.mp4', 1280, 720, 2, 300), videoW: 1280, videoH: 720, videoDur: 2 };
const D = { video: makeClip('d-1920x1080.mp4', 1920, 1080, 6, 120), videoW: 1920, videoH: 1080, videoDur: 6 };
const E = { video: makeClip('e-960x540.mp4', 960, 540, 5, 0), videoW: 960, videoH: 540, videoDur: 5 };
const F = { video: makeClip('f-1080x1350.mp4', 1080, 1350, 5, 260), videoW: 1080, videoH: 1350, videoDur: 5 };
/** A clip reference starting at `start` seconds, with its still frame. */
const at = (c, start, tag) => ({ ...c, videoStart: start, image: stillOf(c.video, start, `${tag}-${start}.jpg`) });
const LAND = makeImage('land.jpg', 1536, 1024, 20);
const PORTRAIT = makeImage('portrait.jpg', 600, 900, 90);
// Broken footage: a file that is not there and one that is not a video. Both must fall back to the still.
writeFileSync(join(site, 'public', 'clips', 'corrupt.mp4'), Buffer.alloc(4096, 7));
const MISSING = { video: 'clips/missing.mp4', videoStart: 0, videoDur: 5, videoW: 1920, videoH: 1080, image: LAND, imgW: 1536, imgH: 1024 };
const CORRUPT = { video: 'clips/corrupt.mp4', videoStart: 0, videoDur: 5, videoW: 1920, videoH: 1080, image: LAND, imgW: 1536, imgH: 1024 };
console.log(`klipler hazır (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);

/* ----------------------------------------------------------- the script */

function said(text, lead = 0.3, step = 0.32) {
  const words = text.split(/\s+/).filter(Boolean);
  return { say: text, wordTimes: words.map((word, i) => ({ word, t: +(lead + i * step).toFixed(2) })), voiceDur: +(lead + words.length * step + 0.2).toFixed(2) };
}
const refOf = (c) => ({ video: c.video, videoStart: c.videoStart, videoDur: c.videoDur, videoW: c.videoW, videoH: c.videoH, image: c.image });

function stillsScript(genre) {
  const a0 = at(A, 0.5, 'a');
  const a4 = at(A, 4, 'a');
  const b1 = at(B, 1, 'b');
  const b6 = at(B, 6, 'b');
  const c0 = at(C, 0, 'c');
  const cuts = [a0, b1, c0, b6, a4];
  const scenes = [
    { type: 'montage', mood: 'tension', images: cuts.map((c) => c.image), clips: cuts.map(refOf), text: 'Bir gecede her şey DEĞİŞTİ', dur: 3.5, ...said('Bir gecede her şey değişti.') },
    { type: 'title', mood: 'curious', kicker: 'Arşiv · 1969', title: 'Görüntülerin Anlattığı Hikâye', ...b1, dur: 4, ...said('Bu, görüntülerin anlattığı bir hikâye.') },
    { type: 'title', chapterCard: true, chapterNo: 2, title: 'ARŞİVDEKİ FİLM', ...a0, dur: 2.8, chapter: 1 },
    // C is 2 s: a 4 s slam slows it to 0.75x, then freezes on its last played frame with a push-in.
    { type: 'slam', mood: 'dread', word: 'KAYBOLDU', sub: 'tek bir kare kaldı', ...c0, dur: 4, ...said('Ve sonra her şey kayboldu.') },
    { type: 'photo', mood: 'reveal', fullBleed: true, ...b1, focus: [0.5, 0.3], name: 'Test Kişisi', role: 'Tam kadraj 1920 klip', dur: 6, ...said('Tam kadraj bir klip, yakın planlarla birlikte oynuyor ve kamera nefes alıyor.') },
    { type: 'photo', mood: 'calm', ...a4, images: [c0.image, PORTRAIT], clips: [refOf(c0), null], caption: 'Panoda oynayan bir film', dur: 5.5, ...said('Panoda üç kart: iki film ve bir fotoğraf.') },
    { type: 'words', mood: 'curious', text: 'Eski film kareleri bulanık bir plakanın üstünde', keyword: 'film', ...a0, dur: 4.5, ...said('Eski film kareleri bulanık bir plakanın üstünde.') },
    { type: 'photo', mood: 'sad', natural: false, fullBleed: true, ...c0, dur: 5, ...said('Kısa klip bitince durağan kareye yumuşakça geçer.') },
    { type: 'words', mood: 'curious', text: 'Klipsiz sahne eskisi gibi çalışır', keyword: 'Klipsiz', image: LAND, imgW: 1536, imgH: 1024, dur: 3.5, ...said('Klipsiz sahne eskisi gibi çalışır.') },
    { type: 'photo', mood: 'calm', fullBleed: true, ...MISSING, dur: 3, ...said('Dosyası olmayan klip.') },
    { type: 'photo', mood: 'calm', fullBleed: true, ...CORRUPT, dur: 3, ...said('Bozuk klip.') },
  ];
  return { id: `vsmoke-${genre}`, title: 'Video duman testi', genre, locale: 'tr-TR', chapters: ['Giriş', 'Arşiv'], scenes };
}

/** Frames to look at: early, middle, late; for short clips also around the crossfade into the still. */
function framesFor(sc, p) {
  const end = p.from + p.frames - 3;
  const sec = (s) => p.from + Math.min(p.frames - 2, Math.round(s * FPS));
  const list = [sec(0.4), p.from + Math.round(p.frames / 2), end];
  if (sc.type === 'montage') list.splice(0, 3, sec(0.2), sec(1.0), sec(1.8), end);
  if (sc.video === C.video) {
    // 2 s of footage at 0.75x = 78 frames, then the last played frame is held (freeze + push-in).
    list.push(p.from + 60, p.from + 70, p.from + 80);
  }
  return [...new Set(list)].sort((a, b) => a - b);
}

/* ------------------------------------------------------------- render */

const bundle = await ensureBundle((m) => console.log('›', m));
for (const f of readdirSync(bundle)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundle, f), join(site, f), { recursive: true });
for (const d of ['fx', 'sfx']) if (existsSync(join(ENGINE_DIR, 'public', d))) cpSync(join(ENGINE_DIR, 'public', d), join(site, 'public', d), { recursive: true });

const chromiumOptions = { gl: 'angle' };
const browser = await openBrowser('chrome', { chromiumOptions });
const report = [];
try {
  if (!noStills) {
    for (const genre of genreArg.split(',')) {
      const s = stillsScript(genre);
      const placed = placeTimeline(s.scenes, FPS, []);
      const props = { script: s };
      const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser, chromiumOptions });
      const shots = [];
      const g0 = Date.now();
      for (const [i, sc] of s.scenes.entries()) {
        for (const f of framesFor(sc, placed[i])) {
          const kind = sc.chapterCard ? 'chapter' : sc.type;
          const tag = sc.video ? sc.video.split('/').pop().split('-')[0].replace('.mp4', '') : 'img';
          const name = `${genre}-${String(i).padStart(2, '0')}-${kind}-${tag}-${String(f).padStart(5, '0')}.png`;
          await renderStill({ composition, serveUrl: site, inputProps: props, frame: f, output: join(outDir, name), imageFormat: 'png', puppeteerInstance: browser, chromiumOptions, timeoutInMilliseconds: 120_000 });
          shots.push(join(outDir, name));
        }
      }
      const cols = 5;
      const rows = Math.ceil(shots.length / cols);
      const list = join(outDir, `.list-${genre}.txt`);
      writeFileSync(list, shots.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
      run(['-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=384:216,tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, `vsheet-${genre}.jpg`)], 'sheet');
      rmSync(list, { force: true });
      const secs = (Date.now() - g0) / 1000;
      report.push(`${genre}: ${shots.length} kare, ${secs.toFixed(1)} sn`);
      console.log(`stil hazır: ${genre} (${shots.length} kare, ${secs.toFixed(1)} sn)`);
    }
  }

  if (!noMp4) {
    // ~30 s, 6 different clips, documentary (collage + every picture scene type).
    const d1 = at(D, 0.5, 'd');
    const e1 = at(E, 1, 'e');
    const f1 = at(F, 0.5, 'f');
    const a0 = at(A, 0.5, 'a');
    const b2 = at(B, 2, 'b');
    const c0 = at(C, 0, 'c');
    const cuts = [d1, b2, e1, at(D, 3, 'd'), a0, f1];
    const scenes = [
      { type: 'montage', mood: 'tension', images: cuts.map((c) => c.image), clips: cuts.map(refOf), text: 'Altı klip tek bir FİLM', dur: 3.5, ...said('Altı klip, tek bir film.') },
      { type: 'title', mood: 'curious', kicker: 'Duman testi', title: 'Oynayan Görüntüler', ...b2, dur: 3.5 },
      { type: 'photo', mood: 'reveal', fullBleed: true, ...d1, name: 'Tam kadraj', role: '1920x1080 · 6 sn', dur: 5, ...said('Tam kadraj bir klip beş saniye boyunca oynar ve kamera çok az yaklaşır.') },
      { type: 'photo', mood: 'calm', ...e1, images: [f1.image, c0.image], clips: [refOf(f1), refOf(c0)], caption: 'Panoda üç film', dur: 5.5, ...said('Panoda üç film aynı anda oynuyor, her biri kendi kartında.') },
      { type: 'title', chapterCard: true, chapterNo: 2, title: 'ARŞİV', ...a0, dur: 2.8, chapter: 1 },
      { type: 'slam', mood: 'dread', word: 'DURDU', sub: 'kısa klip, uzun sahne', ...c0, dur: 4, ...said('Ve sonra zaman durdu.') },
      { type: 'words', mood: 'curious', text: 'Dikey bir klip bulanık plakasının önünde', keyword: 'Dikey', ...f1, dur: 3.5, ...said('Dikey bir klip bulanık plakasının önünde.') },
      { type: 'words', mood: 'curious', text: 'Dört üçlük arşiv filmi', keyword: 'arşiv', ...at(A, 3, 'a'), dur: 3, ...said('Dört üçlük arşiv filmi.') },
    ];
    const s = { id: 'vsmoke-mp4', title: 'Video duman testi', genre: 'documentary', locale: 'tr-TR', chapters: ['Giriş', 'Arşiv'], scenes };
    const props = { script: s };
    const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser, chromiumOptions });
    const out = join(outDir, 'video-smoke.mp4');
    const m0 = Date.now();
    let lastP = -1;
    await renderMedia({
      composition,
      serveUrl: site,
      inputProps: props,
      codec: 'h264',
      crf: 18,
      x264Preset: 'veryfast',
      pixelFormat: 'yuv420p',
      muted: true,
      concurrency: 4,
      timeoutInMilliseconds: 120_000,
      chromiumOptions,
      puppeteerInstance: browser,
      outputLocation: out,
      overwrite: true,
      logLevel: 'error',
      onProgress: ({ progress }) => {
        const p = Math.round(progress * 100);
        if (p % 10 === 0 && p !== lastP) console.log(`mp4 %${(lastP = p)}`);
      },
    });
    const secs = (Date.now() - m0) / 1000;
    const n = composition.durationInFrames;
    report.push(`mp4: ${n} kare (${(n / FPS).toFixed(1)} sn video), render ${secs.toFixed(1)} sn = ${Math.round((secs * 1000) / n)} ms/kare → ${out}`);
    console.log(report.at(-1));
    // Contact sheet of the MP4 itself: two frames per second, so motion between neighbours is visible.
    run(['-i', out, '-vf', `fps=2,scale=384:216,tile=6x${Math.ceil((n / FPS) * 2 / 6)}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, 'mp4-sheet.jpg')], 'mp4 sheet');
  }
} finally {
  await browser.close({ silent: true });
}
console.log('\n' + report.join('\n'));


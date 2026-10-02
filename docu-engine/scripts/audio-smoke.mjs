// Ses duman testi: ~40 sn'lik bir Titanik parçasını produce() ile uçtan uca üretir ve sesi ölçer.
//   node scripts/audio-smoke.mjs <çıktı klasörü> [--no-render]
// Ücretli API ÇAĞIRMAZ: anlatım, önbellekte zaten ödenmiş ElevenLabs satırlarından gelir
// (data/docu-cache/voice), görseller ffmpeg ile üretilir, müzik/efekt/ortam yerel kütüphaneden.
// Ölçer ve rapor yazar (report.json + ekrana):
//   - anlatım: eski zincir (yalnız seviye + sınırlayıcı) ve yeni yayın zinciri — I / LRA / TP
//   - miks: sesli ve sessiz (müzik+efekt+ortam) sadece-ses render'ları; slam öncesi sessizlik
//   - master: çıkan MP4'ün I / LRA / TP değerleri
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { join } from 'node:path';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { DEFAULT_VOICE, ENGINE_DIR, ensureBundle, placeScenes, produce } from '../lib/produce.mjs';
import { measure, processVoice } from '../lib/sound-craft.mjs';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--'));
if (!outDir) {
  console.error('kullanım: node scripts/audio-smoke.mjs <çıktı klasörü> [--no-render]');
  process.exit(2);
}
const noRender = args.includes('--no-render');
mkdirSync(outDir, { recursive: true });
const require = createRequire(join(ENGINE_DIR, '..', 'package.json'));
const FF = require('ffmpeg-static');
const NOVA = join(ENGINE_DIR, '..', '..', '..');
const VOICE_CACHE = join(NOVA, 'data', 'docu-cache', 'voice');
const LIB = join(NOVA, 'data', 'audio-library');
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const ff = (argv) => {
  const r = spawnSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...argv], { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
};

/* ------------------------------------------------------------ the job */

const work = join(os.tmpdir(), 'docu-audio-smoke');
rmSync(work, { recursive: true, force: true });
const PUBLIC = join(work, 'public');
const CACHE = join(work, 'cache');
mkdirSync(join(PUBLIC, 'img'), { recursive: true });
mkdirSync(join(CACHE, 'voice'), { recursive: true });

function image(name, hue, src = 'testsrc2') {
  const out = join(PUBLIC, 'img', name);
  ff(['-f', 'lavfi', '-i', `${src}=s=1536x1024`, '-frames:v', '1', '-vf', `hue=h=${hue}:s=0.5,eq=brightness=-0.05`, '-q:v', '3', out]);
  return `img/${name}`;
}

/*
 * A cached narration line as a scene's `say`: its own words (performance tag
 * included) so produce() computes the same cache key and finds the paid take.
 */
const VOICE = DEFAULT_VOICE;
const MODEL = 'eleven_v3';
const SETTINGS = { stability: 0.5 };
const lines = [];
function line(key) {
  const meta = JSON.parse(readFileSync(join(VOICE_CACHE, `${key}.json`), 'utf8'));
  const say = meta.words.map((w) => w.word).join(' ');
  const k = hash(`${VOICE}|${MODEL}|${JSON.stringify(SETTINGS)}|${say}`);
  copyFileSync(join(VOICE_CACHE, `${key}.mp3`), join(CACHE, 'voice', `${k}.mp3`));
  writeFileSync(join(CACHE, 'voice', `${k}.json`), JSON.stringify({ dur: meta.dur, words: meta.words, audio: `voice/${k}.mp3` }));
  lines.push(join(VOICE_CACHE, `${key}.mp3`));
  return say;
}

const deck = 'open sea at night, cold wind across the deck';
const script = {
  id: 'audio-smoke',
  title: 'Titanik',
  genre: 'documentary',
  locale: 'tr-TR',
  chapters: ['Yolculuk', 'Gece'],
  scenes: [
    { type: 'title', kicker: '1912', title: 'TİTANİK', mood: 'curious', chapter: 0, dur: 4.5, image: image('a.jpg', 200), say: line('78fbe00851ca'), sound: deck },
    { type: 'headline', paper: 'THE NEW YORK TIMES', date: 'APRIL 16, 1912', headline: 'TITANIC SINKS FOUR HOURS AFTER HITTING ICEBERG', mood: 'curious', chapter: 0, dur: 4.5, image: image('b.jpg', 30), say: line('092bc91690a7') },
    { type: 'photo', mood: 'curious', chapter: 0, dur: 4.5, image: image('c.jpg', 120), images: [image('c2.jpg', 160), image('c3.jpg', 260)], caption: 'Southampton, 1912', say: line('e6c3dbe6342a'), sound: deck },
    {
      type: 'map', region: 'north-atlantic', mood: 'tension', chapter: 0, dur: 5, transition: 'whip', title: 'NİSAN 1912',
      points: [{ label: 'Southampton', x: 0.86, y: 0.3 }, { label: 'Buzdağı', x: 0.42, y: 0.42 }, { label: 'New York', x: 0.12, y: 0.46 }], route: [0, 1],
      say: line('58fef1a1a26b'), sound: deck,
    },
    { type: 'photo', mood: 'dread', chapter: 1, dur: 6, image: image('d.jpg', 300, 'mandelbrot'), say: line('0487094801be'), sound: 'ship deck at night, cold wind, distant shouting' },
    // A literal event ("patlamayla") in the open: the explosion gets the open-air slap and may pre-lap.
    { type: 'photo', mood: 'tension', chapter: 1, dur: 5.6, image: image('h.jpg', 20, 'mandelbrot'), say: line('65d30013d009'), sound: 'mountain valley, open air, distant rumble' },
    { type: 'photo', mood: 'tension', chapter: 1, dur: 3.4, image: image('e.jpg', 90), say: line('268fce2d9a2f'), transition: 'whip' },
    { type: 'slam', word: 'BATTI', sub: '2 saat 40 dakika', mood: 'dread', chapter: 1, dur: 4, image: image('f.jpg', 0), say: line('43f5c8470813') },
    { type: 'photo', mood: 'sad', chapter: 1, dur: 7, image: image('g.jpg', 240), say: line('2ae8d3030612'), sound: 'calm sea at dawn, gentle waves' },
  ],
};

const log = (m) => console.log('›', m);
const t0 = Date.now();
const OUT = join(outDir, 'audio-smoke.mp4');
const res = await produce(script, {
  workDir: work, publicDir: PUBLIC, buildPrefix: 'build/audio-smoke', cacheDir: CACHE, output: OUT,
  keys: { eleven: 'offline-smoke-no-calls' }, ffmpeg: FF, audioLibrary: LIB, maxGeneratedSfx: 0,
  planOnly: noRender, log, progress: () => {},
});
console.log(`produce: ${((Date.now() - t0) / 1000).toFixed(0)} sn`);
const final = JSON.parse(readFileSync(res.props, 'utf8')).script;

/* ------------------------------------------------------------ narration A/B */

const concat = (files, out) => {
  const list = join(work, `${Math.random().toString(36).slice(2)}.txt`);
  writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out]);
  return out;
};
const oldDir = join(work, 'voice-old');
const newDir = join(work, 'voice-new');
mkdirSync(oldDir, { recursive: true });
mkdirSync(newDir, { recursive: true });
const perLine = [];
const olds = [];
const news = [];
lines.forEach((src, i) => {
  const b = measure(FF, src);
  const gain = Math.max(-12, Math.min(20, -19 - b.I));
  const o = join(oldDir, `${i}.wav`);
  ff(['-i', src, '-af', `aresample=48000,volume=${gain.toFixed(2)}dB,alimiter=limit=${Math.pow(10, -1.5 / 20).toFixed(4)}:attack=2:release=60:level=false:latency=1`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', o]);
  const n = join(newDir, `${i}.wav`);
  processVoice({ bin: FF, src, dst: n, target: -19 });
  olds.push(o);
  news.push(n);
  perLine.push({ line: i, raw: b, old: measure(FF, o), chain: measure(FF, n) });
});
const narration = { old: measure(FF, concat(olds, join(work, 'narr-old.wav'))), chain: measure(FF, concat(news, join(work, 'narr-new.wav'))) };

/* ------------------------------------------------------------ mix stems */

let stems = null;
let master = null;
if (!noRender) {
  master = measure(FF, OUT);
  const bundle = await ensureBundle(log);
  // Like produce's render: the bundle's code plus this job's assets as its public/.
  const site = join(work, 'stem-site');
  mkdirSync(site, { recursive: true });
  for (const f of readdirSync(bundle)) if (f !== 'public') cpSync(join(bundle, f), join(site, f), { recursive: true });
  symlinkSync(PUBLIC, join(site, 'public'), 'junction');
  const render = async (s, file) => {
    const inputProps = { script: s };
    const opts = { chromiumOptions: { gl: 'angle' }, timeoutInMilliseconds: 120000, logLevel: 'error' };
    const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps, ...opts });
    await renderMedia({ composition, serveUrl: site, codec: 'wav', outputLocation: file, inputProps, ...opts });
    return file;
  };
  const withPublic = (fn) => fn();
  stems = await withPublic(async () => {
    const mixFile = await render(final, join(work, 'mix.wav'));
    const noVoice = structuredClone(final);
    for (const sc of noVoice.scenes) delete sc.voice;
    const bedFile = await render(noVoice, join(work, 'music-fx.wav'));
    return { mix: mixFile, bed: bedFile };
  }).catch((e) => {
    console.log(`sadece-ses render'ı yapılamadı: ${e.message}`);
    return null;
  });
}

/* ------------------------------------------------------------ the slam hole */

const placed = placeScenes(final);
const slamIdx = final.scenes.findIndex((s) => s.type === 'slam');
const slam = final.scenes[slamIdx];
const norm = (w) => String(w).toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
const wordT = slam?.wordTimes?.find((w) => norm(w.word) === norm(slam.word))?.t ?? slam?.wordTimes?.at(-1)?.t;
const hitSec = slam ? placed[slamIdx].from / 30 + (wordT ?? 1) : null;
function rms(file, a, b) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28, windowsHide: true });
  const x = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 1);
  let e = 0;
  const i0 = Math.max(0, Math.floor(a * 8000));
  const i1 = Math.min(x.length, Math.floor(b * 8000));
  for (let i = i0; i < i1; i++) e += (x[i] / 32768) ** 2;
  return +(10 * Math.log10(1e-12 + e / Math.max(1, i1 - i0))).toFixed(1);
}
const hole = stems?.bed && hitSec
  ? { hitSec: +hitSec.toFixed(2), before: rms(stems.bed, hitSec - 2.4, hitSec - 1.4), hole: rms(stems.bed, hitSec - 0.95, hitSec - 0.05), after: rms(stems.bed, hitSec + 0.05, hitSec + 1.0) }
  : null;

const report = {
  durationSec: res.durationSec ?? null,
  narration,
  perLine: perLine.map((p) => ({ line: p.line, rawI: p.raw.I, rawLRA: p.raw.LRA, oldI: p.old.I, oldLRA: p.old.LRA, oldTP: p.old.TP, chainI: p.chain.I, chainLRA: p.chain.LRA, chainTP: p.chain.TP })),
  mix: stems ? { withVoice: measure(FF, stems.mix), musicFxOnly: measure(FF, stems.bed) } : null,
  slamHole: hole,
  master,
  sound: {
    foley: Object.fromEntries(Object.entries(final.foleyFiles ?? {}).map(([k, v]) => [k, v.length])),
    logo: final.logo?.file ?? null,
    pannedWhooshes: Object.keys(final.sfxPan ?? {}).length,
    beds: (final.ambienceCues ?? []).map((c) => ({ file: c.file, from: c.fromScene, to: c.toScene })),
    events: (final.eventCues ?? []).map((c) => ({ file: c.file, scene: c.scene, at: c.at, space: c.space ?? null, prelap: !!c.prelap })),
    musicCues: final.musicCues ?? [],
  },
};
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 1));
const f = (m) => (m ? `I ${m.I?.toFixed(1)} LUFS · LRA ${m.LRA?.toFixed(1)} LU · TP ${m.TP?.toFixed(1)} dBTP` : '—');
console.log('\n=== ses raporu ===');
console.log(`anlatım (eski: seviye+sınırlayıcı) ${f(narration.old)}`);
console.log(`anlatım (yeni yayın zinciri)       ${f(narration.chain)}`);
if (report.mix) console.log(`miks (sesli)  ${f(report.mix.withVoice)}\nmiks (müzik+efekt+ortam) ${f(report.mix.musicFxOnly)}`);
if (hole) console.log(`slam deliği @${hole.hitSec}s: önce ${hole.before} dB, delik ${hole.hole} dB, vuruş sonrası ${hole.after} dB`);
if (master) console.log(`master MP4   ${f(master)}`);
console.log(`rapor: ${join(outDir, 'report.json')}`);

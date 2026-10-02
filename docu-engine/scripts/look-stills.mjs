// Look stills: renders a compact set of frames for every look variant (src/looks/variants.ts)
// and every text style, and writes contact sheets. No paid API calls; ffmpeg test pictures
// (plus any real photos passed with --photos) and fake word timings.
//
//   node scripts/look-stills.mjs <out dir> [--src <src dir>] [--genres crime,finance] [--variants a,b]
//        [--styles] [--style-variants a,b] [--photos <dir with jpgs>] [--locale en-US] [--quick]
//
//   (default)  every genre x every variant: title, words over a photo, words on the ground, slam,
//              counter, chart, photo + name super, quote, timeline, chapter card -> sheet-<variant>.jpg
//   --styles   every text style on words (photo + ground), slam, title and montage hook, across a few
//              variants -> style-<style>.jpg
//   --src      bundle the composition from this folder (a staging copy) instead of the engine's src.
// Runs at below-normal priority, one browser, one frame at a time (the machine is shared with renders).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR, ensureBundle } from '../lib/produce.mjs';
import { placeTimeline } from '../src/timeline.js';

try {
  os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch {}

const args = process.argv.slice(2);
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const FLAGS_WITH_VALUE = ['--src', '--genres', '--variants', '--style-variants', '--photos', '--locale', '--styles-list', '--variant'];
const [outDir] = args.filter((a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUE.includes(args[i - 1]));
if (!outDir) {
  console.error('usage: node scripts/look-stills.mjs <out dir> [--src dir] [--genres ..] [--variants ..] [--styles] [--photos dir]');
  process.exit(2);
}
const STYLES_MODE = args.includes('--styles');
const QUICK = args.includes('--quick');
const LOCALE = flag('--locale') ?? 'en-US';
mkdirSync(outDir, { recursive: true });
const FPS = 30;
const require = createRequire(join(ENGINE_DIR, '..', 'package.json'));
const ff = require('ffmpeg-static');

/* ------------------------------------------------------------- pictures */

const site = join(os.tmpdir(), `docu-look-site-${process.pid}`);
rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, 'public', 'img'), { recursive: true });

function makeImage(name, w, h, hue) {
  const out = join(site, 'public', 'img', name);
  const vf = [`hue=h=${hue}`, `drawgrid=w=iw/6:h=ih/6:t=2:c=white@0.25`].join(',');
  const r = spawnSync(ff, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:d=1`, '-frames:v', '1', '-vf', vf, '-q:v', '3', out]);
  if (r.status !== 0) throw new Error(`ffmpeg ${name}: ${r.stderr}`);
  return `img/${name}`;
}
let PHOTOS = [];
const photoDir = flag('--photos');
if (photoDir && existsSync(photoDir)) {
  for (const f of readdirSync(photoDir).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort().slice(0, 6)) {
    cpSync(join(photoDir, f), join(site, 'public', 'img', f));
    PHOTOS.push(`img/${f}`);
  }
}
if (PHOTOS.length < 3) PHOTOS = [makeImage('a.jpg', 1536, 1024, 20), makeImage('b.jpg', 1536, 1024, 200), makeImage('c.jpg', 1536, 1024, 90)];
const [P1, P2, P3] = PHOTOS;
const P4 = PHOTOS[3] ?? P1;

function said(text, lead = 0.3, step = 0.3) {
  const words = text.split(/\s+/).filter(Boolean);
  return { say: text, wordTimes: words.map((word, i) => ({ word, t: +(lead + i * step).toFixed(2) })), voiceDur: +(lead + words.length * step + 0.2).toFixed(2) };
}
const img = (src) => ({ image: src, imgW: 1536, imgH: 1024 });

/* --------------------------------------------------------------- scenes */

/** One frame per scene: the end state, with every animation settled (landing frames for slams). */
function sceneSet(extra = {}) {
  return [
    { type: 'title', kicker: 'Seattle · 1971', title: 'The Man Who Vanished', ...img(P1), dur: 3.5, chapter: 0, ...extra },
    { type: 'words', mood: 'curious', text: 'Nobody knew where the hijacker went that night', keyword: 'hijacker', ...img(P2), dur: 4, chapter: 0, ...said('Nobody knew where the hijacker went that night'), ...extra },
    { type: 'words', mood: 'tension', text: 'Two hundred thousand dollars disappeared into the rain', keyword: 'disappeared', dur: 4, chapter: 0, ...said('Two hundred thousand dollars disappeared into the rain'), ...extra },
    { type: 'slam', mood: 'dread', word: 'VANISHED', sub: 'Never seen again', ...img(P3), dur: 3.2, chapter: 0, ...said('And then he simply vanished.'), ...extra },
    { type: 'counter', mood: 'tension', to: 200000, prefix: '$', label: 'IN TWENTY-DOLLAR BILLS', dur: 3, chapter: 0, ...said('Two hundred thousand dollars.'), ...extra },
    { type: 'chart', mood: 'dread', points: [90, 84, 70, 40, 22, 12], prefix: '$', title: 'Airline shares in a single year', from: 'Jan 1971', to: 'Dec 1971', dur: 3.5, chapter: 0, ...said('Airline shares fell all year.'), ...extra },
    { type: 'photo', mood: 'calm', ...img(P4), focus: [0.5, 0.35], name: 'Florence Schaffner', role: 'Flight attendant · Northwest Orient', dur: 3.5, chapter: 0, fullBleed: true, ...said('Florence Schaffner was in the jump seat.'), ...extra },
    { type: 'quote', mood: 'reveal', quote: 'Miss, you better look at that note. I have a bomb.', who: 'Dan Cooper', when: 'November 24, 1971', dur: 4, chapter: 0, ...said('He said: Miss, you better look at that note. I have a bomb.', 0.2, 0.26), ...extra },
    { type: 'timeline', mood: 'curious', events: [{ year: 1971, label: 'The hijacking' }, { year: 1980, label: 'Money found on the Columbia' }, { year: 2016, label: 'FBI closes the case' }], dur: 3.5, chapter: 0, ...said('Forty-five years later the case was closed.'), ...extra },
    { type: 'title', chapterCard: true, chapterNo: 2, kicker: 'CHAPTER 2', title: 'THE LONG NIGHT', ...img(P2), dur: 2.8, chapter: 1 },
  ];
}

function framesFor(sc, p) {
  // Clear of the outgoing transition into the next scene.
  const end = p.from + p.frames - 14;
  const at = (s) => p.from + Math.min(p.frames - 2, Math.round(s * FPS));
  if (sc.type === 'slam') return [at(sc.wordTimes.at(-1).t) + 18];
  if (sc.type === 'title' && sc.chapterCard) return [at(2.2)];
  if (sc.type === 'montage') return [end];
  if (sc.type === 'words') return [Math.min(end, at(sc.wordTimes.at(-1).t) + 16)];
  return [end];
}

/* --------------------------------------------------------------- bundle */

async function devBundle(dir) {
  const h = createHash('sha1');
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(dir, p)).update(readFileSync(p));
    }
  };
  walk(dir);
  const out = join(os.tmpdir(), `docu-look-bundle-${h.digest('hex').slice(0, 12)}`);
  if (existsSync(join(out, 'index.html'))) return out;
  console.log('› bundling', dir);
  const { bundle } = await import('@remotion/bundler');
  const emptyPublic = join(os.tmpdir(), 'docu-look-empty-public');
  mkdirSync(emptyPublic, { recursive: true });
  await bundle({ entryPoint: join(dir, 'index.ts'), outDir: out, publicDir: emptyPublic });
  return out;
}
const srcArg = flag('--src');
const bundleDir = srcArg ? await devBundle(resolve(srcArg)) : await ensureBundle((m) => console.log('›', m));
for (const f of readdirSync(bundleDir)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundleDir, f), join(site, f), { recursive: true });
for (const d of ['fx', 'sfx', 'fonts']) if (existsSync(join(ENGINE_DIR, 'public', d))) cpSync(join(ENGINE_DIR, 'public', d), join(site, 'public', d), { recursive: true });

/* --------------------------------------------------------------- render */

// The variant list comes from the staged (or live) source: read it as text, no TS loader needed.
const variantsSrc = readFileSync(join(srcArg ? resolve(srcArg) : join(ENGINE_DIR, 'src'), 'looks', 'variants.ts'), 'utf8');
const VARIANTS = [...variantsSrc.matchAll(/id: '([a-z0-9-]+)', genre: '([a-z]+)'/g)].map((m) => ({ id: m[1], genre: m[2] }));
const STYLES = ['box', 'underline', 'marker', 'outline', 'stack', 'serif', 'typewriter', 'cutout', 'glitch', 'lower-third', 'neon', 'stamp', 'lyric', 'kinetic'];

const PORT = 3400 + Math.floor(Math.random() * 500);
const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } });
const sheet = (shots, name, cols = 5) => {
  const rows = Math.ceil(shots.length / cols);
  const list = join(outDir, `.list-${name}.txt`);
  writeFileSync(list, shots.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  spawnSync(ff, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:270,tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, `${name}.jpg`)]);
  rmSync(list, { force: true });
};

async function renderScript(s, tag) {
  const placed = placeTimeline(s.scenes, FPS, []);
  const props = { script: s };
  const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser, timeoutInMilliseconds: 240000, port: PORT });
  const shots = [];
  for (const [i, sc] of s.scenes.entries()) {
    for (const f of QUICK ? framesFor(sc, placed[i]).slice(-1) : framesFor(sc, placed[i])) {
      const out = join(outDir, `${tag}-${String(i).padStart(2, '0')}-${sc.chapterCard ? 'chapter' : sc.type}.jpg`);
      // A busy machine (a production render next door) can drop a local connection: one retry.
      for (let attempt = 0; ; attempt++) {
        try {
          await renderStill({ composition, serveUrl: site, inputProps: props, frame: f, output: out, imageFormat: 'jpeg', jpegQuality: 88, puppeteerInstance: browser, timeoutInMilliseconds: 240000, port: PORT });
          break;
        } catch (e) {
          if (attempt >= 2) throw e;
          console.warn('retry', String(e?.message ?? e).slice(0, 120));
        }
      }
      shots.push(out);
    }
  }
  return shots;
}

try {
  if (args.includes('--chapter-demo')) {
    // One video, three chapters, each shifting accent / grade / ground (script.chapterLooks).
    const byCh = (ch) => [
      { type: 'title', chapterCard: true, chapterNo: ch + 1, kicker: `CHAPTER ${ch + 1}`, title: ['The Hijacking', 'The Long Night', 'The Search'][ch], ...img([P1, P2, P3][ch]), dur: 2.8, chapter: ch },
      { type: 'words', text: 'Nobody knew where the hijacker went that night', keyword: 'hijacker', ...img(P4), dur: 4, chapter: ch, ...said('Nobody knew where the hijacker went that night') },
      { type: 'words', text: 'Two hundred thousand dollars disappeared into the rain', keyword: 'disappeared', dur: 4, chapter: ch, ...said('Two hundred thousand dollars disappeared into the rain') },
      { type: 'counter', to: 200000, prefix: '$', label: 'IN TWENTY-DOLLAR BILLS', dur: 3, chapter: ch },
    ];
    const s = {
      id: 'chapter-demo', title: 'Chapter looks', genre: 'crime', look: { variant: flag('--variant') ?? 'cold-blue-case' }, locale: LOCALE,
      chapters: ['The Hijacking', 'The Long Night', 'The Search'],
      chapterLooks: [null, { accent: '#ff4d4d', grade: 'mono', backdrop: { kind: 'paper' } }, { accent: '#ffc857', grade: 'teal-orange', backdrop: { kind: 'gradient', color: '#3a2a10', color2: '#07111c' } }],
      scenes: [0, 1, 2].flatMap(byCh),
    };
    sheet(await renderScript(s, 'chapters'), 'sheet-chapter-looks', 4);
    console.log('chapter demo ready');
  } else if (!STYLES_MODE) {
    const genres = flag('--genres')?.split(',');
    const only = flag('--variants')?.split(',');
    for (const v of VARIANTS) {
      if (genres && !genres.includes(v.genre)) continue;
      if (only && !only.includes(v.id)) continue;
      const s = { id: `look-${v.id}`, title: 'Look test', genre: v.genre, look: { variant: v.id }, locale: LOCALE, chapters: ['The Hijacking', 'The Long Night'], scenes: sceneSet() };
      const shots = await renderScript(s, v.id);
      sheet(shots, `sheet-${v.genre}-${v.id}`);
      console.log(`variant ready: ${v.genre}/${v.id} (${shots.length})`);
    }
  } else {
    const styleVariants = (flag('--style-variants') ?? 'evidence-yellow,swiss-editorial,wall-street-gold').split(',');
    const styles = flag('--styles-list')?.split(',') ?? STYLES;
    for (const st of styles) {
      if (args.includes('--resume') && existsSync(join(outDir, `style-${st}.jpg`))) continue;
      const shots = [];
      for (const vid of styleVariants) {
        const v = VARIANTS.find((x) => x.id === vid);
        if (!v) continue;
        const scenes = [
          { type: 'words', mood: 'curious', text: 'Nobody knew where the hijacker went that night', keyword: 'hijacker', ...img(P2), dur: 4, textStyle: st, ...said('Nobody knew where the hijacker went that night') },
          { type: 'words', mood: 'tension', text: 'Two hundred thousand dollars disappeared into the rain', keyword: 'disappeared', dur: 4, textStyle: st, ...said('Two hundred thousand dollars disappeared into the rain') },
          { type: 'slam', mood: 'dread', word: 'VANISHED', sub: 'Never seen again', ...img(P3), dur: 3.2, textStyle: st, ...said('And then he simply vanished.') },
          { type: 'title', kicker: 'Seattle · 1971', title: 'The Hijacking of Flight 305: The Man Who Vanished', ...img(P1), dur: 3.5, textStyle: st },
          { type: 'montage', mood: 'tension', images: [P1, P2, P3], text: 'One night the Airline lost EVERYTHING', dur: 3.2, textStyle: st, ...said('One night the airline lost everything.') },
        ];
        const s = { id: `style-${st}-${vid}`, title: 'Style test', genre: v.genre, look: { variant: vid }, locale: LOCALE, chapters: ['The Hijacking'], scenes };
        shots.push(...(await renderScript(s, `style-${st}-${vid}`)));
      }
      sheet(shots, `style-${st}`);
      console.log(`style ready: ${st} (${shots.length})`);
    }
  }
} finally {
  await browser.close({ silent: true });
  rmSync(site, { recursive: true, force: true });
}

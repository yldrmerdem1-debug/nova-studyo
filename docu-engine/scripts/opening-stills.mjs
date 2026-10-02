// Opening treatments (src/opening, script.opening.kind): stills and short test renders of a REAL
// video's opening — its own pictures, voice timings and music — under each kind. No paid API calls.
//
//   node scripts/opening-stills.mjs <out dir> --job <job dir> [--kinds headlines,timestamps,...]
//        [--src <src dir>] [--variant <look id>] [--video] [--seconds 40] [--force]
//   node scripts/opening-stills.mjs <out dir> --script <script.json> --borrow <job dir> ...
//
//   --job     a Nova job (data/jobs/<id>): docu/<id>.props.json is the rendered script, docu/public its assets
//   --script  a plain script (no pictures yet): its opening borrows the pictures of --borrow's opening
//   --kinds   default: every kind the script is eligible for (an ineligible kind renders today's opening)
//   --video   also renders the first --seconds (default 40) as an mp4 with sound
//   --force   renders a kind even when the script is not eligible for it (to see the fallback)
// Below-normal priority, one browser, one frame at a time, concurrency 1 (the machine is shared with renders).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR, ensureBundle } from '../lib/produce.mjs';
import { placeTimeline } from '../src/timeline.js';

try {
  os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
} catch {}

const args = process.argv.slice(2);
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const WITH_VALUE = ['--fake-quote', '--browser', '--job', '--script', '--borrow', '--kinds', '--src', '--variant', '--seconds', '--locale'];
const [outDir] = args.filter((a, i) => !a.startsWith('--') && !WITH_VALUE.includes(args[i - 1]));
if (!outDir || (!flag('--job') && !flag('--script'))) {
  console.error('usage: node scripts/opening-stills.mjs <out dir> --job <job dir> | --script <json> --borrow <job dir> [--kinds a,b] [--video]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const srcDir = flag('--src') ? resolve(flag('--src')) : join(ENGINE_DIR, 'src');
const P = await import(pathToFileURL(join(srcDir, 'opening', 'plan.js')).href);
const require = createRequire(join(ENGINE_DIR, '..', 'package.json'));
const ff = require('ffmpeg-static');
const FPS = 30;

/* ---------------------------------------------------------------- script */

const propsOf = (job) => {
  const id = basename(resolve(job));
  const p = JSON.parse(readFileSync(join(job, 'docu', `${id}.props.json`), 'utf8'));
  return { script: p.script ?? p, pub: join(resolve(job), 'docu', 'public') };
};
let script;
let pub;
if (flag('--job')) ({ script, pub } = propsOf(flag('--job')));
else {
  script = JSON.parse(readFileSync(flag('--script'), 'utf8'));
  const lend = propsOf(flag('--borrow'));
  pub = lend.pub;
  // The donor's opening pictures, in order, fill this script's opening (stills only; no voice).
  const donor = lend.script.scenes.slice(0, 16).flatMap((s) => [s.image, ...(s.images ?? [])]).filter((x) => x && !/\.mp4$/i.test(x));
  let k = 0;
  const next = () => donor[k++ % donor.length];
  script.scenes = script.scenes.map((s) => {
    if (s.type === 'montage') return { ...s, images: (s.imagePrompts ?? [1, 2, 3, 4, 5, 6]).map(() => next()) };
    if (['photo', 'words', 'title', 'slam'].includes(s.type) && (s.imagePrompt || s.search) && !s.bg) return { ...s, image: next(), imgW: 1600, imgH: 1000 };
    if (s.bg === 'prev') return { ...s, image: donor[(k + donor.length - 1) % donor.length], imgW: 1600, imgH: 1000 };
    return s;
  });
}
// A prepared (not yet rendered) job still points at its audio library outside public/: those sounds are dropped here.
for (const k of ['sfxFiles', 'foleyFiles', 'ambienceCues', 'eventCues', 'sfxPan']) if (JSON.stringify(script[k] ?? '').includes('../')) delete script[k];
if (flag('--variant')) script.look = { variant: flag('--variant') };
if (flag('--locale')) script.locale = flag('--locale');
// TEST ONLY: --fake-quote <beat> puts that beat's own narration in quotation marks (no script has a quote in its opening yet).
if (flag('--fake-quote') !== undefined) {
  const k = Number(flag('--fake-quote'));
  const sp = P.openingSpan(script.scenes);
  const i = sp?.beats[k];
  if (i !== undefined) {
    const s = script.scenes[i];
    const m = String(s.say).match(/^((?:\s*\[[^\]]*\]\s*)*)(.*)$/s);
    script.scenes[i] = { ...s, say: `${m[1]}“${m[2].trim()}”` };
    console.log(`fake quote on scene ${i}: ${script.scenes[i].say}`);
  }
}
const span = P.openingSpan(script.scenes);
if (!span) throw new Error('no opening in this script');
// The opening and the scenes after it that a rewind caption may read.
const cut = Math.min(script.scenes.length, span.end + 10);
// The story's map scenes (map-dive reads them) stay, moved to the end of the cut.
const maps = script.scenes.slice(cut).filter((s) => s.type === 'map');
script = { ...script, scenes: [...script.scenes.slice(0, cut), ...maps] };
const elig = P.openingEligibility(script);
const kinds = (flag('--kinds')?.split(',') ?? P.OPENING_KINDS).filter((k) => args.includes('--force') || elig[k]?.ok);
console.log(`opening: beats ${span.beats.join(',')} title ${span.title}`);
for (const [k, v] of Object.entries(elig)) console.log(`  ${v.ok ? 'OK ' : '-- '} ${k.padEnd(11)} ${v.why}`);

/* --------------------------------------------------------------- bundle + site */

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
  const out = join(os.tmpdir(), `docu-opening-bundle-${h.digest('hex').slice(0, 12)}`);
  if (existsSync(join(out, 'index.html'))) return out;
  console.log('› bundling', dir);
  const { bundle } = await import('@remotion/bundler');
  const emptyPublic = join(os.tmpdir(), 'docu-opening-empty-public');
  mkdirSync(emptyPublic, { recursive: true });
  await bundle({ entryPoint: join(dir, 'index.ts'), outDir: out, publicDir: emptyPublic });
  return out;
}
const bundleDir = flag('--src') ? await devBundle(srcDir) : await ensureBundle((m) => console.log('›', m));
const site = join(os.tmpdir(), `docu-opening-site-${createHash('sha1').update(pub + bundleDir).digest('hex').slice(0, 8)}`);
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const f of readdirSync(bundleDir)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundleDir, f), join(site, f), { recursive: true });
symlinkSync(pub, join(site, 'public'), 'junction');

/* --------------------------------------------------------------- frames */

const placed = placeTimeline(script.scenes, FPS, script.beats ?? []);
const tag = (flag('--job') ? basename(resolve(flag('--job'))) : basename(flag('--script'), '.json')).replace(/^\d+-/, '');

/** The frames that show a kind at work: each beat early and late, the title, and the kind's own moments. */
function framesFor(kind) {
  const out = [];
  const add = (i, f, what) => {
    const p = placed[i];
    if (!p) return;
    out.push({ at: p.from + Math.max(0, Math.min(p.frames - 1, Math.round(f))), what: `${i}-${what}` });
  };
  // The hook: every half second of the first 6 s.
  for (let t = 0.5; t <= 6; t += 0.5) out.push({ at: Math.round(t * FPS), what: `hook${t}` });
  span.beats.forEach((i) => {
    const n = placed[i].frames;
    add(i, n * 0.35, 'a');
    add(i, n * 0.85, 'b');
  });
  if (span.title >= 0) {
    add(span.title, 10, 'title-in');
    add(span.title, placed[span.title].frames * 0.6, 'title');
  }
  if (kind === 'map-dive') {
    add(span.beats[0], 8, 'dive0');
    add(span.beats[0], Math.min(placed[span.beats[0]].frames * 0.55, 96) - 14, 'dive1');
  }
  if (kind === 'timestamps') span.beats.forEach((i) => add(i, 40, 'typed'));
  if (kind === 'quote') add(span.beats[0], 3, 'q0');
  return out.sort((a, b) => a.at - b.at).filter((x, k, a) => !k || x.at !== a[k - 1].at);
}


// The renderer's own headless shell (Nova keeps it under data/docu-runtime), else Remotion's default.
const SHELL = [flag('--browser'), process.env.DOCU_BROWSER, join(os.homedir(), 'Videos', 'Nova Studyo', 'data', 'docu-runtime', 'node_modules', '.remotion', 'chrome-headless-shell', 'win64', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')].find((p) => p && existsSync(p));
const browser = await openBrowser('chrome', { browserExecutable: SHELL ?? null, chromiumOptions: { gl: 'angle' } });
const sheet = (shots, name, cols = 4) => {
  const rows = Math.ceil(shots.length / cols);
  const list = join(outDir, `.list-${name}.txt`);
  writeFileSync(list, shots.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  spawnSync(ff, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:270,tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, `${name}.jpg`)]);
  rmSync(list, { force: true });
};

try {
  for (const kind of kinds) {
    const s = { ...script, opening: { kind } };
    const props = { script: s };
    const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser, timeoutInMilliseconds: 240000 });
    const shots = [];
    for (const fr of framesFor(kind)) {
      const out = join(outDir, `${tag}-${kind}-${String(fr.at).padStart(5, '0')}-${fr.what}.jpg`);
      for (let attempt = 0; ; attempt++) {
        try {
          await renderStill({ composition, serveUrl: site, inputProps: props, frame: fr.at, output: out, imageFormat: 'jpeg', jpegQuality: 86, puppeteerInstance: browser, timeoutInMilliseconds: 240000 });
          break;
        } catch (e) {
          if (attempt >= 2) throw e;
          console.warn('retry', String(e?.message ?? e).slice(0, 160));
        }
      }
      shots.push(out);
    }
    sheet(shots, `sheet-${tag}-${kind}`);
    console.log(`✓ ${kind}: ${shots.length} frames -> sheet-${tag}-${kind}.jpg`);
    if (args.includes('--video')) {
      const sec = Number(flag('--seconds') ?? 40);
      const end = Math.min(composition.durationInFrames - 1, Math.round(sec * FPS) - 1);
      const out = join(outDir, `${tag}-${kind}.mp4`);
      await renderMedia({
        composition,
        serveUrl: site,
        inputProps: props,
        codec: 'h264',
        crf: 23,
        frameRange: [0, end],
        concurrency: 1,
        outputLocation: out,
        puppeteerInstance: browser,
        timeoutInMilliseconds: 240000,

        browserExecutable: SHELL ?? null,
        chromiumOptions: { gl: 'angle' },
      });
      console.log(`✓ ${kind}: ${out}`);
    }
  }
} finally {
  await browser.close({ silent: true }).catch(() => {});
}

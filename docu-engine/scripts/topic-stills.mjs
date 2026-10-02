// Topic stills: renders chosen frames of small test scripts (one per topic identity) and a
// contact sheet per script — the visual check for src/topic (motif chapter cards, textures,
// icon layer, photo presentation, explainers, UI cards, wipes). No paid API calls.
//
//   node scripts/topic-stills.mjs <out dir> --spec <spec.json> [--src <src dir>] [--only tag1,tag2]
//
// spec.json: [{ "tag": "titanic", "script": {...}, "shots": [{ "scene": 3, "at": 2.2 } | { "scene": 3, "frame": 40 }] }]
// Pictures in the scripts may be absolute paths: they are copied into the render's public dir.
// Runs at below-normal priority, one browser, one frame at a time (renders share the machine).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
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
const outDir = args[0];
const specFile = flag('--spec');
if (!outDir || !specFile) {
  console.error('usage: node scripts/topic-stills.mjs <out dir> --spec <spec.json> [--src dir] [--only tags]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const FPS = 30;
const require = createRequire(join(ENGINE_DIR, '..', 'package.json'));
const ff = require('ffmpeg-static');
const only = flag('--only')?.split(',');
const specs = JSON.parse(readFileSync(specFile, 'utf8')).filter((s) => !only || only.includes(s.tag));

const site = join(os.tmpdir(), `docu-topic-site-${process.pid}`);
rmSync(site, { recursive: true, force: true });
mkdirSync(join(site, 'public', 'img'), { recursive: true });

/** Absolute picture paths -> img/<hash>-<name> in the site. */
const copied = new Map();
function localize(v) {
  if (typeof v !== 'string' || !isAbsolute(v) || !existsSync(v)) return v;
  if (!copied.has(v)) {
    const name = `${createHash('sha1').update(v).digest('hex').slice(0, 8)}-${basename(v)}`;
    cpSync(v, join(site, 'public', 'img', name));
    copied.set(v, `img/${name}`);
  }
  return copied.get(v);
}
function walk(o) {
  if (Array.isArray(o)) return o.map(walk);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ['image', 'video'].includes(k) ? localize(v) : walk(v)]));
  return o;
}

async function devBundle(dir) {
  const h = createHash('sha1');
  const w = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) w(p);
      else h.update(relative(dir, p)).update(readFileSync(p));
    }
  };
  w(dir);
  const out = join(os.tmpdir(), `docu-topic-bundle-${h.digest('hex').slice(0, 12)}`);
  if (existsSync(join(out, 'index.html'))) return out;
  console.log('› bundling', dir);
  const { bundle } = await import('@remotion/bundler');
  const emptyPublic = join(os.tmpdir(), 'docu-topic-empty-public');
  mkdirSync(emptyPublic, { recursive: true });
  await bundle({ entryPoint: join(dir, 'index.ts'), outDir: out, publicDir: emptyPublic });
  return out;
}
const srcArg = flag('--src');
const bundleDir = srcArg ? await devBundle(resolve(srcArg)) : await ensureBundle((m) => console.log('›', m));
for (const f of readdirSync(bundleDir)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundleDir, f), join(site, f), { recursive: true });
for (const d of ['fx', 'sfx', 'fonts']) if (existsSync(join(ENGINE_DIR, 'public', d))) cpSync(join(ENGINE_DIR, 'public', d), join(site, 'public', d), { recursive: true });

const PORT = 3900 + Math.floor(Math.random() * 400);
// Nova's runtime keeps the headless shell under data/docu-runtime (the engine folder may have none).
const runtimeShell = join(ENGINE_DIR, '..', '..', '..', 'data', 'docu-runtime', 'node_modules', '.remotion', 'chrome-headless-shell', 'win64', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const browserExecutable = process.env.DOCU_CHROME || (existsSync(runtimeShell) ? runtimeShell : null);
const browser = await openBrowser('chrome', { browserExecutable, chromiumOptions: { gl: 'angle' } });
const sheet = (shots, name, cols = 4) => {
  if (!shots.length) return;
  const rows = Math.ceil(shots.length / cols);
  const list = join(outDir, `.list-${name}.txt`);
  writeFileSync(list, shots.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
  spawnSync(ff, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=640:360,tile=${cols}x${rows}:padding=4:color=gray`, '-frames:v', '1', '-q:v', '3', join(outDir, `sheet-${name}.jpg`)]);
  rmSync(list, { force: true });
};

try {
  for (const spec of specs) {
    const script = walk(spec.script);
    const placed = placeTimeline(script.scenes, FPS, []);
    const props = { script };
    const composition = await selectComposition({ browserExecutable, serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser, timeoutInMilliseconds: 240000 });
    const shots = [];
    for (const [k, shot] of spec.shots.entries()) {
      const p = placed[shot.scene];
      if (!p) continue;
      const local = Number.isFinite(shot.frame) ? shot.frame : Math.round((shot.at ?? 1) * FPS);
      const frame = p.from + Math.max(0, Math.min(p.frames - 1, local < 0 ? p.frames + local : local));
      const out = join(outDir, `${spec.tag}-${String(k).padStart(2, '0')}-${shot.name ?? script.scenes[shot.scene].type}.jpg`);
      for (let attempt = 0; ; attempt++) {
        try {
          await renderStill({ browserExecutable, composition, serveUrl: site, inputProps: props, frame, output: out, imageFormat: 'jpeg', jpegQuality: 90, puppeteerInstance: browser, timeoutInMilliseconds: 240000 });
          break;
        } catch (e) {
          if (attempt >= 2) throw e;
          console.warn('retry', String(e?.message ?? e).slice(0, 160));
        }
      }
      shots.push(out);
    }
    sheet(shots, spec.tag);
    console.log(`ready: ${spec.tag} (${shots.length})`);
  }
} finally {
  await browser.close({ silent: true });
  rmSync(site, { recursive: true, force: true });
}

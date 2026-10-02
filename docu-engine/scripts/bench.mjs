// Render hız ölçümü:
//   node scripts/bench.mjs <video public/ klasörü> <props.json> [kareAralığı=0-359]
// BENCH_VARIANTS=base,grain,dust,... — her biri bir efekti kapatır (Script.perfOff).
// Güncel kaynaktan paket kurar, videonun varlıklarını yanına koyar, aynı kesiti
// her ayarla render edip kare başına süreyi yazar.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR, ensureBundle } from '../lib/produce.mjs';

const [publicDir, propsFile, range = '0-359'] = process.argv.slice(2);
const base = JSON.parse(readFileSync(propsFile, 'utf8'));
const [a, b] = range.split('-').map(Number);

const bundle = await ensureBundle((m) => console.log('›', m));
const site = join(os.tmpdir(), 'docu-bench-site');
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const f of readdirSync(bundle)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundle, f), join(site, f), { recursive: true });
cpSync(publicDir, join(site, 'public'), { recursive: true });
for (const d of ['fx', 'fonts']) if (!existsSync(join(site, 'public', d))) cpSync(join(ENGINE_DIR, 'public', d), join(site, 'public', d), { recursive: true });

const withOff = (off, natural = false) => {
  const p = structuredClone(base);
  p.script.perfOff = off;
  if (natural) p.script.scenes.forEach((s) => { s.natural = true; });
  return p;
};
const ALL = ['grain', 'dust', 'vignette', 'grade', 'ca', 'flicker'];
const catalog = {
  base: { name: 'hepsi açık', props: base },
  grain: { name: 'gren kapalı', props: withOff(['grain']) },
  dust: { name: 'toz kapalı', props: withOff(['dust']) },
  grade: { name: 'renk derecelendirme kapalı', props: withOff(['grade']) },
  duo: { name: 'duotone kapalı', props: withOff([], true) },
  none: { name: 'tüm efektler kapalı', props: withOff(ALL, true) },
};
const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: base, logLevel: 'error' });
for (const k of (process.env.BENCH_VARIANTS ?? 'base').split(',')) {
  const v = catalog[k];
  const t = Date.now();
  await renderMedia({
    composition, serveUrl: site, codec: 'h264', inputProps: v.props, frameRange: [a, b],
    outputLocation: join(os.tmpdir(), `bench-${Date.now()}.mp4`),
    concurrency: Number(process.env.BENCH_CONC ?? 6), chromiumOptions: { gl: 'angle' }, logLevel: 'error',
    ...(process.env.BENCH_PRESET ? { x264Preset: process.env.BENCH_PRESET } : {}),
  });
  const s = (Date.now() - t) / 1000;
  console.log(`${v.name}: ${s.toFixed(1)} sn, ${((s / (b - a + 1)) * 1000).toFixed(0)} ms/kare`);
}

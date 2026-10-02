// Stil önizleme: aynı videonun belli karelerini her kurgu stiliyle render eder.
//   node scripts/genre-preview.mjs <video public/ klasörü> <props.json> <çıktı klasörü> [stiller] [kareler]
// Görsel üretmez — yalnızca renk, font, geçiş ve yazı dilini karşılaştırmak için.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { ENGINE_DIR, ensureBundle } from '../lib/produce.mjs';

const [publicDir, propsFile, outDir, genres = 'crime,epic,science,inspire', frames = '285,360,510,660,780,930,1860'] = process.argv.slice(2);
const base = JSON.parse(readFileSync(propsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });

const bundle = await ensureBundle((m) => console.log('›', m));
const site = join(os.tmpdir(), 'docu-genre-site');
rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });
for (const f of readdirSync(bundle)) if (f !== 'public' && !f.startsWith('.')) cpSync(join(bundle, f), join(site, f), { recursive: true });
cpSync(publicDir, join(site, 'public'), { recursive: true });
for (const d of ['fx', 'fonts']) cpSync(join(ENGINE_DIR, 'public', d), join(site, 'public', d), { recursive: true });

const browser = await openBrowser('chrome', { chromiumOptions: { gl: 'angle' } });
for (const genre of genres.split(',')) {
  const props = structuredClone(base);
  props.script.genre = genre;
  delete props.script.palette;
  const composition = await selectComposition({ serveUrl: site, id: 'video', inputProps: props, puppeteerInstance: browser });
  for (const f of frames.split(',').map(Number)) {
    await renderStill({ composition, serveUrl: site, inputProps: props, frame: f, output: join(outDir, `${genre}-${String(f).padStart(5, '0')}.jpg`), imageFormat: 'jpeg', puppeteerInstance: browser });
  }
  console.log('stil hazır:', genre);
}
await browser.close({ silent: true });

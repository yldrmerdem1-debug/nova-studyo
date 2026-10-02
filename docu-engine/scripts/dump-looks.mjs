// Writes docu-engine/looks-catalog.json: every look variant (per genre), text style, backdrop
// and grade with its description and where it fits — for the pipeline's art director and any
// tool that does not import TypeScript. Source of truth: src/looks/index.ts (pure data).
//   node scripts/dump-looks.mjs [--src <src dir>] [--out <file>]
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { build } from 'esbuild';
import { ENGINE_DIR } from '../lib/produce.mjs';

const args = process.argv.slice(2);
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const src = resolve(flag('--src') ?? join(ENGINE_DIR, 'src'));
const out = resolve(flag('--out') ?? join(ENGINE_DIR, 'looks-catalog.json'));

const tmp = mkdtempSync(join(os.tmpdir(), 'docu-looks-'));
try {
  const file = join(tmp, 'looks.mjs');
  await build({ entryPoints: [join(src, 'looks', 'index.ts')], bundle: true, format: 'esm', platform: 'node', outfile: file, logLevel: 'error' });
  const { LOOK_CATALOG } = await import(pathToFileURL(file).href);
  writeFileSync(out, `${JSON.stringify(LOOK_CATALOG, null, 2)}\n`);
  const n = Object.values(LOOK_CATALOG.variants).reduce((a, v) => a + v.length, 0);
  console.log(`looks catalog: ${n} variants, ${LOOK_CATALOG.textStyles.length} text styles, ${LOOK_CATALOG.counterStyles.length} counter styles, ${LOOK_CATALOG.backdrops.length} backdrops, ${LOOK_CATALOG.grades.length} grades -> ${out}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

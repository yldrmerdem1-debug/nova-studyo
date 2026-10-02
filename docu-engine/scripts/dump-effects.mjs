// Writes docu-engine/effects-catalog.json: the effect/transition/camera vocabulary the
// pipeline's art director chooses from (src/effects/catalog.ts is the source).
//   node scripts/dump-effects.mjs
import { writeFileSync, readFileSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAMERA_CATALOG, ENERGY_CATALOG, FIT_CATALOG, FX_CATALOG, PACE_CATALOG, TRANSITION_CATALOG } from '../src/effects/catalog.ts';
import { COLLAGE_GENRES } from '../src/effects/variety.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// The variety pass and genres.ts must agree on which genres lay photos out as prints.
const genres = readFileSync(join(ROOT, 'src', 'genres.ts'), 'utf8');
for (const m of genres.matchAll(/\n  (\w+): \{\n    id: '\w+',[\s\S]*?collage: (true|false)/g)) {
  if ((m[2] === 'true') !== COLLAGE_GENRES.has(m[1])) throw new Error(`COLLAGE_GENRES disagrees with genres.ts for ${m[1]}`);
}
const out = {
  version: 1,
  about:
    'Per-scene fields: fx (list of effect ids; when ANY scene has fx the engine derives none), camera, fit, energy (1-5), pace, transition (the cut INTO the scene). Script fields: transitionPalette (3-4 kinds + rare accents, repetition = weight), fxPalette, fxDensity (<= 0.35). Rules the engine also follows: effects on <= ~35% of scenes, never the same effect on consecutive scenes, heavy transitions only on story/mood turns, match cuts only between two pictures.',
  scene: {
    fx: Object.values(FX_CATALOG),
    camera: Object.values(CAMERA_CATALOG),
    fit: Object.entries(FIT_CATALOG).map(([id, desc]) => ({ id, desc })),
    energy: ENERGY_CATALOG,
    pace: PACE_CATALOG,
  },
  transitions: Object.values(TRANSITION_CATALOG),
};
const file = join(ROOT, 'effects-catalog.json');
writeFileSync(`${file}.tmp`, JSON.stringify(out, null, 2) + '\n');
renameSync(`${file}.tmp`, file);
console.log(`effects catalog: ${out.scene.fx.length} effects, ${out.transitions.length} transitions, ${out.scene.camera.length} camera moves -> ${file}`);

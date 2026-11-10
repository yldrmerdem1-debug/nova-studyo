// Görünüş düzeltmesi — gözden geçirme boşlukları (29 Ekim 2026). Gimli 20261028-9ff721 / Kartal Yuvası 950730:
// luma 52-56, doygunluk 2,5-6. Beş uygulayıcının bıraktığı küçük boşluklar: kaynak metni okunur (projenin .tsx deseni),
// ağ / ffmpeg / model çağrısı yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('catalog.ts mirrors looks-catalog.json grades (dump-looks.mjs must not undo the genre gate)', () => {
  const src = read('docu-engine/src/looks/catalog.ts');
  const json = JSON.parse(read('docu-engine/looks-catalog.json'));
  for (const g of json.grades) {
    const line = src.split('\n').find((l) => l.includes(`{ id: '${g.id}'`));
    assert.ok(line, `${g.id} in catalog.ts`);
    if (g.genres === 'all') assert.match(line, /genres: ALL/, `${g.id} genres all`);
    assert.match(line, new RegExp(`family: '${g.family}'`), `${g.id} family ${g.family}`);
  }
  for (const id of ['color', 'warm', 'cool', 'teal-orange', 'kodachrome']) assert.equal(json.grades.find((g) => g.id === id).genres, 'all');
  assert.match(read('docu-engine/src/looks/index.ts'), /COLOUR FIRST/);
});

test("engine 'cool' grade is a colour base: saturation >= 0.95", () => {
  const src = read('docu-engine/src/looks/grades.tsx');
  const m = src.match(/<filter id="nv-g-cool"[^>]*>\s*<feColorMatrix type="saturate" values="([\d.]+)"/);
  assert.ok(m, 'cool saturate step');
  assert.ok(Number(m[1]) >= 0.95, `cool saturate ${m[1]}`);
});

test('plain chapter card follows CARD_PLATE (no near-black plate, ring <= 0.3, light veil on light looks)', () => {
  const src = read('docu-engine/src/scenes.tsx');
  const card = src.slice(src.indexOf('const ChapterCard'), src.indexOf('/* ======', src.indexOf('const ChapterCard')));
  assert.match(card, /const light = genre\.light === true \|\| isLightVariant\(genre\.variant\)/);
  assert.match(card, /dim=\{1 - CARD_PLATE\.dim\}/);
  assert.match(card, /opacity: CARD_PLATE\.opacity/);
  assert.match(card, /light \? CARD_PLATE\.lightRing : CARD_PLATE\.ring/);
  assert.doesNotMatch(card, /rgba\(0,0,0,0\.72\)/);
  assert.doesNotMatch(card, /dim=\{look === 'label' \? 0\.42 : 0\.3\}/);
});

test('hit-timed fx skip without a real hit: no seeded glitch bursts, no speed ramp at 45%', () => {
  const fxStack = read('docu-engine/src/effects/index.tsx');
  assert.match(fxStack, /const bursts = hits\.slice\(0, 3\);/);
  assert.doesNotMatch(fxStack, /\[0\.3, 0\.72\]/);
  const fx = read('docu-engine/src/fx.tsx');
  assert.match(fx, /rampPlay > 8 && rampHit !== null \? speedRampMap\(rampPlay, rampHit\) : null/);
});

test('engine types carry the new pipeline fields', () => {
  const t = read('docu-engine/src/types.ts');
  for (const re of [/archived\?: boolean;/, /monoSource\?: boolean;/, /accentGrade\?: Grade;/, /letterbox\?: boolean;/]) assert.match(t, re);
});

test('standalone Short: no silhouette, B&W only from its own measured archive, cache key unchanged', () => {
  const src = read('src/pipeline/docu-short-standalone.js');
  assert.match(src, /seen from behind or at a distance, no recognisable face/);
  assert.match(src, /hash\(keyPrompt\)/, 'cache key on the old wording (no re-billing)');
  assert.match(src, /archiveIsMono\(real, \{ measure: \(a\) => meanChroma\(ff, a\.abs\) \}\)/);
  assert.match(src, /newPictureStyle\(plan\.year \|\| null, plan\.genre, \{ mono \}\)/);
  // The only 'silhouette' left is the legacy cache-key string.
  assert.equal((src.match(/in silhouette/g) || []).length, 1);
});

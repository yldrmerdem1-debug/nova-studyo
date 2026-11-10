// The picture's own year (Houthi–Saudi news, 28 Oct 2026): a still of 1960s soldiers in a 2026 scene was asked
// "Set in 2026". A year or decade the prompt names wins over the scene's era (period.mjs promptYear, produce.mjs safeImage).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { promptYear, periodNegative } = await import('../docu-engine/lib/period.mjs');
const { styleFor } = await import('../docu-engine/lib/produce.mjs');

test('promptYear: a decade or year the prompt names', () => {
  assert.equal(promptYear('Grainy wide shot of soldiers walking through rugged mountain terrain in the 1960s, seen from behind'), 1965);
  assert.equal(promptYear('A crowded harbour in 1962, ships at anchor'), 1962);
  assert.equal(promptYear('Wide shot of a desert column of armoured vehicles, dust trailing'), null);
  assert.equal(promptYear('A tanker at a jetty, 1536x1024, 35mm lens'), null, 'sizes and lenses are not years');
  assert.equal(promptYear('Desert column of the 1990s, later a 2026 parade'), 1995, 'the first one named counts');
});

test('the 1960s still is no longer asked "Set in 2026"', () => {
  const year = promptYear('Soldiers walking through mountains in the 1960s') ?? 2026;
  const style = styleFor('Contemporary photojournalistic documentary photograph, no modern objects.', year);
  assert.doesNotMatch(style, /Set in 2026/);
  assert.equal(periodNegative(year), '', '1965 has no pre-1900 negatives');
  assert.match(styleFor('Photo.', 2026), /Set in 2026/, 'a present-day still keeps its year');
});

test('safeImage takes the prompt year before the scene era', () => {
  const src = fs.readFileSync(new URL('../docu-engine/lib/produce.mjs', import.meta.url), 'utf8');
  assert.match(src, /const year = promptYear\(prompt\) \?\? yearOfEra\(script\.scenes\[i\]\?\.era \?\? script\.era\);/);
});

// 1.16.16 — from/to TÜRÜNE GÖRE (16 Ekim 2026, Ebola gündem videosu): yazar chart'ın from/to'suna eksen etiketi
// yazdı (kurallar öyle diyor), şema sayı istiyordu; "$.scenes[16].from: beklenen tür number, gelen string" üç denemede
// de tekrarlandı ve iş senaryoda durdu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { sceneEnds } = await import('../src/pipeline/docu-script.js');
const { validateSchema, coerceNumbers } = await import('../src/structured-output.js');

test('chart etiketi metin kalır, counter sayısı sayıya çevrilir; sayı olmayan counter hata verir', () => {
  const scenes = [
    { type: 'chart', points: [120, 900, 4400], from: 'Aug', to: 2026 },
    { type: 'counter', from: '0', to: '9,144' },
    { type: 'counter', to: '~4,400+' },
    { type: 'counter', to: 'about four thousand' },
    { type: 'photo', say: 'x' },
  ];
  const errors = sceneEnds(scenes);
  assert.deepEqual([scenes[0].from, scenes[0].to], ['Aug', '2026']);
  assert.deepEqual([scenes[1].from, scenes[1].to, scenes[2].to], [0, 9144, 4400]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sahne 4: counter to yalnızca sayı/);
});

test('şema: from/to metin de olabilir; bölüm doğrulaması sceneEnds ile başlar', () => {
  const src = fs.readFileSync(new URL('../src/pipeline/docu-script.js', import.meta.url), 'utf8');
  assert.ok(src.includes('from: { type: ["number", "string"]') && src.includes('to: { type: ["number", "string"]'));
  assert.ok(src.includes('const errors = [...sceneEnds(scenes), ...validateScenes({ scenes }, ctxOf(i))];'));
  const schema = { type: 'object', properties: { from: { type: ['number', 'string'] } } };
  assert.deepEqual(validateSchema(coerceNumbers({ from: 'Aug' }, schema), schema), []);
  assert.deepEqual(validateSchema(coerceNumbers({ from: 3 }, schema), schema), []);
});

// FİLMİN GÖRSEL DİLİ KONU TAŞIMAMALI.
//
// ÖLÇÜLEN KUSUR (26 Ekim 2026, 2009 denizaltı çarpışması, 20261024-373aaf):
// visualStyle "Authentic late-2000s naval documentary photograph of North
// Atlantic nuclear submarines and their bases, cold steel-grey sea light…" idi.
// Bu cümle her AI isteğine eklendiği için "Whitehall'da taş bir hükümet binası"
// istemi bir denizaltı üssü çizdi; video "WHITEHALL · 17 FEBRUARY 2009"
// etiketini bir denizaltının üstünde gösterdi, AI kareleri birbirine benzedi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lookOnly } from '../src/pipeline/docu-script.js';

test('"photograph of <konu>" cümleden atılır, görünüm kalır', () => {
  const s = lookOnly('Authentic late-2000s naval documentary photograph of North Atlantic nuclear submarines and their bases, cold steel-grey sea light graded with bronze-gold highlights, long telephoto lens, high contrast with deep shadows, subtle film grain, archival press-print texture.');
  assert.doesNotMatch(s, /submarine|bases|North Atlantic/i, s);
  assert.match(s, /^Authentic late-2000s naval documentary photograph, cold steel-grey sea light/);
  assert.match(s, /long telephoto lens, high contrast with deep shadows, subtle film grain, archival press-print texture\.$/);
});

test('konusuz görsel dil olduğu gibi kalır', () => {
  const ok = 'Authentic 1970s documentary photograph, grainy Kodak Tri-X black and white film, natural available light, candid, archival print texture.';
  assert.equal(lookOnly(ok), ok);
  assert.equal(lookOnly(''), '');
  assert.equal(lookOnly(undefined), '');
  assert.equal(lookOnly('Grainy 16mm footage showing the Berlin Wall at night, sodium light'), 'Grainy 16mm footage, sodium light');
});

test('senaryo görsel dili lookOnly ile yazılıyor; şema konu yazmayı yasaklıyor', () => {
  const src = fs.readFileSync(new URL('../src/pipeline/docu-script.js', import.meta.url), 'utf8');
  assert.match(src, /visualStyle:\s*lookOnly\(bible\.visualStyle\)/);
  assert.match(src, /KONU YAZMA/);
  assert.doesNotMatch(src, /Authentic 1970s Istanbul documentary photograph/, 'örnek cümle yer adı taşımamalı');
});

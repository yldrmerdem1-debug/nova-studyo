// Punch-line variety and the single viewer call (docu-rhetoric.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const R = await import('../src/pipeline/docu-rhetoric.js');

test('rhetoric: a large catalog of distinct punch devices and viewer calls', () => {
  assert.ok(R.PUNCHES.length >= 60, String(R.PUNCHES.length));
  assert.ok(R.CTAS.length >= 50, String(R.CTAS.length));
  assert.equal(new Set(R.PUNCHES.map((p) => p.id)).size, R.PUNCHES.length);
  assert.equal(new Set(R.CTAS.map((c) => c.id)).size, R.CTAS.length);
  for (const c of R.CTAS) assert.ok(['early', 'end'].includes(c.place), c.id);
});

test('rhetoric: every chapter gets two different devices, all different across the video', () => {
  const p = R.rhetoricPlan({ topic: 'strait of hormuz', chapters: 6 });
  assert.equal(p.perChapter.length, 6);
  const all = p.perChapter.flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(p.perChapter.every((c) => c.length === 2));
});

test('rhetoric: the viewer is asked exactly once, in one chapter; every other chapter is told not to ask', () => {
  const p = R.rhetoricPlan({ topic: 'strait of hormuz', chapters: 6 });
  const asks = Array.from({ length: 6 }, (_, i) => R.rhetoricLines(p, i, 6).join('\n'));
  assert.equal(asks.filter((t) => /İZLEYİCİ ÇAĞRISI/.test(t)).length, 1);
  assert.equal(asks.filter((t) => /beğeni\/abone\/yorum isteme/.test(t)).length, 5);
  assert.ok(/İZLEYİCİ ÇAĞRISI/.test(asks[p.ctaChapter]));
});

test('rhetoric: placement alternates and recent calls and devices are not repeated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-rhet-'));
  const first = R.rhetoricPlan({ topic: 'a', chapters: 5, history: R.readRhetoricHistory(dir) });
  R.recordRhetoric(dir, { topic: 'a', punches: first.perChapter.flat(), cta: first.cta, ctaPlace: first.ctaPlace });
  const second = R.rhetoricPlan({ topic: 'a', chapters: 5, history: R.readRhetoricHistory(dir) });
  assert.notEqual(second.ctaPlace, first.ctaPlace);
  assert.notEqual(second.cta, first.cta);
  const reused = second.perChapter.flat().filter((id) => first.perChapter.flat().includes(id));
  assert.equal(reused.length, 0, reused.join(','));
});

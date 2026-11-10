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
  for (const c of R.CTAS) assert.ok(['hook', 'early', 'end'].includes(c.place), c.id);
});

test('rhetoric: every chapter gets one device, all different across the video (less pounding, Oct 2026)', () => {
  const p = R.rhetoricPlan({ topic: 'strait of hormuz', chapters: 6 });
  assert.equal(p.perChapter.length, 6);
  const all = p.perChapter.flat();
  assert.equal(new Set(all).size, all.length);
  assert.ok(p.perChapter.every((c) => c.length === 1));
});

test('rhetoric: the viewer is asked exactly once, right after the hook, for like + subscribe + comment; the closing chapter keeps one debate question', () => {
  const p = R.rhetoricPlan({ topic: 'strait of hormuz', chapters: 6 });
  const asks = Array.from({ length: 6 }, (_, i) => R.rhetoricLines(p, i, 6).join('\n'));
  assert.equal(asks.filter((t) => /İZLEYİCİ ÇAĞRISI/.test(t)).length, 1);
  assert.equal(p.ctaPlace, 'hook');
  assert.equal(p.ctaChapter, 0);
  assert.ok(/ÜÇLÜ/.test(asks[0]) && /15-45\. saniyesinde/.test(asks[0]) && /like, subscribe ve comments/.test(asks[0]));
  assert.ok(/KAPANIŞ SORUSU/.test(asks[5]) && !/İZLEYİCİ ÇAĞRISI/.test(asks[5]));
  assert.equal(asks.filter((t) => /KAPANIŞ SORUSU/.test(t)).length, 1);
  assert.equal(asks.filter((t) => /beğeni\/abone\/yorum isteme/.test(t)).length, 4);
  assert.equal(R.ctaById(p.cta).place, 'hook');
});

test('rhetoric: every trio call says all three words, so all three buttons pop on screen', () => {
  const trio = R.CTAS.filter((c) => c.place === 'hook');
  assert.ok(trio.length >= 5);
  for (const c of trio) {
    assert.ok(/\blike\b/i.test(c.example) && /\bsubscrib/i.test(c.example) && /\bcomments\b/i.test(c.example), c.id);
    assert.ok(c.example.split(/\s+/).length <= 22, c.id);
    // The marker gives the line cta:'like'; the engine reads like, subscribe and comment from it.
    const sc = [{ say: c.example }];
    R.markCtaScenes(sc);
    assert.equal(sc[0].cta, 'like', c.id);
  }
  // The ask lands in the opening chapter for any film length; a sensitive film still has none.
  for (const n of [2, 3, 5, 9]) assert.equal(R.rhetoricPlan({ topic: 'x' + n, chapters: n }).ctaChapter, 0);
  assert.equal(R.rhetoricPlan({ topic: 'Ebola', chapters: 8, sensitive: true }).cta, null);
  // The engine shows the third button on "comments" of that line.
  const src = fs.readFileSync(new URL('../docu-engine/src/cta.tsx', import.meta.url), 'utf8');
  assert.match(src, /scene\.cta === 'like'\) return \{ like: .*subscribe: .*comment: at\(/);
});

test('rhetoric: recent calls and devices are not repeated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-rhet-'));
  const first = R.rhetoricPlan({ topic: 'a', chapters: 5, history: R.readRhetoricHistory(dir) });
  R.recordRhetoric(dir, { topic: 'a', punches: first.perChapter.flat(), cta: first.cta, ctaPlace: first.ctaPlace });
  const second = R.rhetoricPlan({ topic: 'a', chapters: 5, history: R.readRhetoricHistory(dir) });
  assert.equal(second.ctaPlace, 'hook');
  assert.notEqual(second.cta, first.cta);
  const reused = second.perChapter.flat().filter((id) => first.perChapter.flat().includes(id));
  assert.equal(reused.length, 0, reused.join(','));
});

test('rhetoric: the one like-ask and the one comment-ask are marked for the on-screen button; "looked like" is not an ask', () => {
  const sc = [
    { say: 'The PTL Club looked like a late-night talk show.' },
    { say: "[warm] If this is helping you make sense of Friday's quake, a like helps it reach more people." },
    { say: 'If you enjoyed this, like and subscribe.' },
    { say: 'So was Panama simply lucky? Tell us what you think in the comments.' },
  ];
  assert.equal(R.markCtaScenes(sc), 2);
  assert.deepEqual(sc.map((s) => s.cta || null), [null, 'like', null, 'comment']);
  const tr = [{ say: 'Faydalı olduysa bir beğeni bırakın.' }, { say: 'Sizce şans mıydı? Yorumlarda yazın.' }];
  assert.equal(R.markCtaScenes(tr), 2);
});

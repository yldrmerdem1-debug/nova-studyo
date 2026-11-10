// GÖRÜNÜŞ — EFEKT (29 Ekim 2026, Gimli 20261028-9ff721 / Kartal Yuvası 950730: luma 52-56, doygunluk 2,5-6, %21-39 kare
// luma < 40; kanal sahibi "her video siyah, karanlık, aynı; anlık efektler doğal değil"). Effects belong to the narration:
// vignette-pulse at most twice, only on a dread/tension impact, a real pulse (rest <= 0.1, ±20 frames round the hit, never
// over a strong global vignette); a rejected transition at a turn is a cut, not a blackout; fxDensity is derived from the
// kept fx; the dust overlay no longer flickers the whole frame; hit-timed fx skip when there is no real impact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const G = await import('../docu-engine/lib/edit-grammar.mjs');
const V = await import('../docu-engine/src/effects/variety.js');
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const scene = (o) => ({ type: 'photo', say: 'x', mood: 'tension', energy: 3, chapter: 1, ...o });

test('grammar: vignette-pulse at most twice, only on a dread/tension impact', () => {
  const scenes = [
    scene({ mood: 'calm', energy: 2, fx: ['vignette-pulse'] }), // a calm chart line
    scene({ mood: 'sad', energy: 4, fx: ['vignette-pulse'] }), // grief is quiet, never an impact
    scene({ mood: 'tension', energy: 3, fx: ['vignette-pulse', 'dust'] }), // no impact
    scene({ mood: 'reveal', energy: 5, fx: ['vignette-pulse'] }), // impact, wrong mood
    scene({ mood: 'dread', energy: 5, fx: ['vignette-pulse'] }),
    scene({ mood: 'tension', type: 'slam', fx: ['vignette-pulse'] }),
    scene({ mood: 'dread', energy: 5, fx: ['vignette-pulse'] }), // third: over the cap
  ];
  const r = G.applyEditGrammar({ scenes }, { gravity: 'grave' });
  assert.deepEqual(scenes.map((s) => s.fx), [[], [], ['dust'], [], ['vignette-pulse'], ['vignette-pulse'], []]);
  assert.equal(G.VIGNETTE_PULSE_CAP, 2);
  assert.equal(r.fx, 5);
  // The cap holds in an open story too.
  const open = Array.from({ length: 4 }, () => scene({ mood: 'dread', energy: 5, fx: ['vignette-pulse'] }));
  G.applyEditGrammar({ scenes: open }, { gravity: 'open' });
  assert.equal(open.filter((s) => s.fx.includes('vignette-pulse')).length, 2);
});

test('grammar: a text montage in dread is an impact line for the pulse (the art director places it there)', () => {
  const scenes = [scene({ type: 'montage', text: 'GONE', mood: 'dread', energy: 3, fx: ['vignette-pulse'] })];
  G.applyEditGrammar({ scenes }, { gravity: 'grave' });
  assert.deepEqual(scenes[0].fx, ['vignette-pulse']);
});

test('grammar: glitch and chroma skip a line with no beat; they stay on an impact or a keyword', () => {
  const scenes = [
    scene({ energy: 3, mood: 'tension', fx: ['glitch'] }),
    scene({ energy: 3, mood: 'tension', fx: ['chroma'], keyword: 'SOLD' }),
    scene({ energy: 4, mood: 'tension', fx: ['glitch', 'chroma'] }),
  ];
  G.applyEditGrammar({ scenes }, { gravity: 'open' });
  assert.deepEqual(scenes.map((s) => s.fx), [[], ['chroma'], ['glitch', 'chroma']]);
});

test('grammar: a rejected transition at a turn is a cut, never a blackout; a chosen blackout or dip-color stays', () => {
  const footage = { video: 'build/x/src-1.mp4', archived: true };
  const scenes = [
    scene({ transition: 'leak', chapter: 0 }), // the film's first beat
    scene({ transition: 'blackout', chapter: 0, mood: 'sad', energy: 1 }), // the plan's own quiet fade: allowed
    scene({ transition: 'split-wipe', chapter: 1, energy: 2 }), // banned in a grave story, at a chapter turn
    scene({ transition: 'zoom', chapter: 2, mood: 'sad', energy: 1 }), // quiet beat at a turn
    scene({ transition: 'flash', chapter: 3, ...footage }), // into real footage at a turn
    scene({ transition: 'dip-color', chapter: 4 }),
    scene({ transition: 'iris', chapter: 5 }),
    scene({ transition: 'iris', chapter: 6 }),
    scene({ transition: 'iris', chapter: 7 }), // third iris (T_RARE 2) at a turn
  ];
  G.applyEditGrammar({ scenes }, { gravity: 'grave' });
  assert.deepEqual(scenes.map((s) => s.transition), ['cut', 'blackout', 'cut', 'cut', 'cut', 'dip-color', 'iris', 'iris', 'cut']);
  assert.equal(G.TURN_FALLBACK, 'cut');
  assert.doesNotMatch(src('../docu-engine/lib/edit-grammar.mjs'), /want = turn[^;]*'blackout'/, 'no fallback writes a blackout');
});

test('grammar: fxDensity is recomputed from the kept fx; without explicit fx the grave clamp stays', () => {
  const script = {
    fxDensity: 0.5,
    scenes: [
      scene({ energy: 5, mood: 'dread', fx: ['flash-frame'] }),
      scene({ energy: 2, fx: ['flash-frame'] }), // dropped: not an impact
      scene({ energy: 2, mood: 'calm', fx: ['vignette-pulse'] }), // dropped
      scene({ energy: 3, fx: [] }),
    ],
  };
  G.applyEditGrammar(script, { gravity: 'grave' });
  assert.equal(script.fxDensity, 0.25, '1 of 4 scenes still carries an effect');
  assert.equal(G.keptFxShare(script.scenes), 0.25);
  const open = { fxDensity: 0.3, scenes: [scene({ energy: 5, mood: 'dread', fx: ['shake'] }), scene({ energy: 3 }), scene({ energy: 3 })] };
  G.applyEditGrammar(open, { gravity: 'open' });
  assert.equal(open.fxDensity, 0.33);
  const engine = { fxDensity: 0.4, scenes: [scene({}), scene({})] };
  G.applyEditGrammar(engine, { gravity: 'grave' });
  assert.equal(engine.fxDensity, 0.25, 'engine-derived effects: the grave clamp');
  const none = { scenes: [scene({ fx: ['dust'] })] };
  G.applyEditGrammar(none, { gravity: 'open' });
  assert.equal(none.fxDensity, undefined, 'a script without fxDensity gets none');
});

test('engine: the vignette pulse rests at <= 0.1, tightens only ±20 frames round a hit and never stacks over a strong vignette', () => {
  const o = src('../docu-engine/src/effects/overlays.tsx');
  const num = (name) => Number(o.match(new RegExp(`export const ${name} = ([0-9.]+);`))?.[1]);
  assert.ok(num('PULSE_REST') > 0 && num('PULSE_REST') <= 0.1, `rest ${num('PULSE_REST')}`);
  assert.equal(num('PULSE_WINDOW'), 20);
  assert.equal(num('PULSE_GLOBAL_MAX'), 0.35);
  assert.ok(num('PULSE_REST') + num('PULSE_PEAK') * 1.3 <= 0.45, 'the peak stays a pulse, not a black ring');
  const body = o.slice(o.indexOf('export const VignettePulseFx'), o.indexOf('/* ------------------------------------------------------------- scan lines'));
  assert.match(body, /genre\?\.vignette\) \|\| 0\) >= PULSE_GLOBAL_MAX\) return null/);
  assert.match(body, /\[-PULSE_WINDOW, 0, PULSE_WINDOW\]/);
  assert.match(body, /k \* PULSE_REST \+ spike \* PULSE_PEAK/);
  assert.doesNotMatch(body, /0\.34 \+ 0\.24 \* spike/, 'the old 0.34 resting ring is gone');
});

test('engine: the dust overlay has no full-frame breathe flicker; specks, hair and scratch stay', () => {
  const o = src('../docu-engine/src/effects/overlays.tsx');
  const dust = o.slice(o.indexOf('export const DustFx'), o.indexOf('/* ------------------------------------------------------------ flash frame'));
  assert.doesNotMatch(dust, /breathe\s*[=>]/);
  assert.doesNotMatch(dust, /background: breathe/);
  assert.match(dust, /\{specks\}/);
  assert.match(dust, /hair \?/);
  assert.match(dust, /scratch \?/);
});

test('engine: hit-timed effects skip a line without a real impact; the detail-punch camera may still land on the stressed word', () => {
  const t = src('../docu-engine/src/effects/timing.ts');
  assert.match(t, /export const REAL_IMPACT = 0\.3;/);
  assert.match(t, /return o\.wordFallback \? emphasisFrame\(wordTimes, durFrames, fps\) : null;/, 'no word fallback by default');
  assert.match(t, /mainHit\(o\.impacts, o\.wordTimes, durFrames, fps, \{ wordFallback: true \}\)/, 'the punch camera keeps its word');
  // effects/index.tsx calls mainHit with four arguments: the strict default.
  assert.match(src('../docu-engine/src/effects/index.tsx'), /const hit = mainHit\(impacts, scene\.wordTimes, durFrames, fps\);/);
  const o = src('../docu-engine/src/effects/overlays.tsx');
  assert.match(o, /const bloom = hit === null \? 0 :/, 'a flare blooms only on a real hit');
  assert.doesNotMatch(o, /hit \?\? Math\.round\(dur \* 0\.4\)/);
});

test('engine variety: effects sit on narration beats, the seed is only a tie-break, quiet informative lines stay clean', () => {
  assert.equal(V.narrationBeat({ type: 'photo', mood: 'curious', energy: 3, say: 'the river ran past the old mill' }), 0);
  assert.ok(V.narrationBeat({ type: 'photo', mood: 'tension', energy: 3, say: 'By noon, 324 aircraft were gone.' }) >= V.FX_BEAT_MIN, 'a spoken number');
  assert.ok(V.narrationBeat({ type: 'photo', mood: 'tension', energy: 3, say: 'It held, but the hull cracked.' }) >= V.FX_BEAT_MIN, 'a turn word');
  assert.ok(V.narrationBeat({ type: 'slam', mood: 'tension', say: 'Gone.' }) >= 1.2);
  assert.equal(V.narrationBeat({ type: 'title', chapterCard: true, say: 'But 1940' }), 0);
  assert.ok(V.FX_TIE_BREAK <= 0.1);
  const quiet = (i) => ({ type: 'photo', image: `q${i}.jpg`, mood: 'curious', energy: 3, say: 'the river ran past the old mill and the fields' });
  const beat = (i) => ({ type: 'photo', image: `b${i}.jpg`, mood: 'tension', energy: 5, say: `Then 30${i} ships were sunk, but the convoy sailed on.` });
  const scenes = Array.from({ length: 40 }, (_, i) => (i % 8 === 3 ? beat(i) : quiet(i)));
  for (const seedKey of ['a', 'b', 'c', 'd']) {
    const st = V.deriveStyle({ seedKey, genre: 'horror', fxDensity: 0.35, scenes }, {});
    st.fx.forEach((list, i) => {
      if (scenes[i].say.startsWith('the river')) assert.deepEqual(list, [], `seed ${seedKey}: quiet line ${i} stays clean`);
    });
    assert.ok(st.fx.filter((l) => l.includes('vignette-pulse')).length <= V.VIGNETTE_PULSE_CAP);
    assert.ok(st.fx.filter((l) => l.includes('dolly-zoom')).length <= 1, 'the engine picks obey the loud caps too');
    assert.ok(st.fx.some((l) => l.length), `seed ${seedKey}: the beats still get effects`);
  }
  const src0 = src('../docu-engine/src/effects/variety.js');
  assert.doesNotMatch(src0, /seeded\(`\$\{seed\}sc\$\{i\}`\) \* 1\.2/, 'the old x1.2 random placement is gone');
  assert.match(src0, /'vignette-pulse': \['tension', 'dread'\]/);
});

test('engine variety: loud devices and the pulse are never derived onto a calm or non-impact line', () => {
  const calm = { type: 'photo', image: 'c.jpg', mood: 'dread', energy: 3, say: 'Then 300 men waited, but nothing came.', keyword: 'WAITED' };
  const scenes = Array.from({ length: 12 }, (_, i) => ({ ...calm, image: `c${i}.jpg` }));
  const st = V.deriveStyle({ seedKey: 'x', genre: 'horror', fxDensity: 0.35, fxPalette: ['vignette-pulse', 'shake', 'flash-frame', 'dolly-zoom', 'dust'], scenes }, {});
  const all = st.fx.flat();
  assert.ok(all.length > 0, 'beats still get an effect');
  for (const k of ['vignette-pulse', 'shake', 'flash-frame', 'dolly-zoom']) assert.equal(all.includes(k), false, `${k} needs an impact`);
  assert.equal(V.isImpactScene({ mood: 'sad', energy: 5 }), false);
  assert.equal(V.isImpactScene({ mood: 'dread', energy: 4 }), true);
});

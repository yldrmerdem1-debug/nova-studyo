// Edit grammar + music gravity (docu-engine/lib/edit-grammar.mjs, audio-director.mjs storyGravity/fitsGravity):
// a grave story gets a restrained cut and a grave score; loud devices land only on impacts.
import test from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../docu-engine/lib/edit-grammar.mjs');
const A = await import('../docu-engine/lib/audio-director.mjs');

const scene = (o) => ({ type: 'photo', say: 'x', mood: 'tension', energy: 3, chapter: 1, ...o });

test('gravity: war, crashes and crime are grave; a science story is open; the script can override', () => {
  assert.equal(A.storyGravity({ scenes: [] }, 'epic'), 'grave');
  const crash = { title: '1929', scenes: Array.from({ length: 10 }, () => ({ say: 'The market crashed and banks collapsed; men were ruined.' })) };
  assert.equal(A.storyGravity(crash, 'finance'), 'grave');
  assert.equal(A.storyGravity({ title: 'Webb', scenes: [{ say: 'Light fell toward us for billions of years.' }] }, 'science'), 'open');
  assert.equal(A.storyGravity({ musicGravity: 'open', scenes: [] }, 'epic'), 'open');
});

test('gravity: a grave story hears only grave or dramatic, serious, non-game tracks', () => {
  const t = (register, seriousness = 0.9, gameLike = false) => ({ tags: { register, seriousness, gameLike } });
  assert.equal(A.fitsGravity(t('grave'), 'grave'), true);
  assert.equal(A.fitsGravity(t('dramatic'), 'grave'), true);
  assert.equal(A.fitsGravity(t('heroic'), 'grave'), false, 'soaring adventure (Taking Flight) is out');
  assert.equal(A.fitsGravity(t('light'), 'grave'), false);
  assert.equal(A.fitsGravity(t('dramatic', 0.3), 'grave'), false);
  assert.equal(A.fitsGravity(t('dramatic', 0.9, true), 'grave'), false, 'game-like');
  assert.equal(A.fitsGravity(t('heroic'), 'open'), true);
  assert.equal(A.fitsGravity({ tags: {} }, 'grave'), true, 'untoned libraries still work');
});

test('grammar: banned devices go, accents only on impacts and chapter turns, once per chapter in a grave story', () => {
  const script = {
    transitionPalette: ['leak', 'ink', 'whip'],
    fxPalette: ['light-leak', 'dust', 'flash-frame'],
    fxDensity: 0.4,
    scenes: [
      scene({ transition: 'leak' }),
      scene({ transition: 'whip', energy: 5 }),
      scene({ transition: 'zoom', energy: 5 }),
      scene({ transition: 'whip', energy: 2 }),
      scene({ transition: 'ink', mood: 'sad', energy: 1 }),
      scene({ transition: 'zoom', mood: 'sad', energy: 1, chapter: 2 }),
    ],
  };
  const r = G.applyEditGrammar(script, { gravity: 'grave' });
  // the film's first beat is a turn too: a banned device there becomes a fade up from black
  assert.deepEqual(script.scenes.map((s) => s.transition), ['blackout', 'whip', 'cut', 'cut', 'ink', 'blackout']);
  assert.equal(r.transitions, 4);
  assert.deepEqual(script.transitionPalette, ['ink', 'whip']);
  assert.deepEqual(script.fxPalette, ['dust'], 'loud devices are never the engine default in a grave story');
  assert.equal(script.fxDensity, 0.25);
});

test('grammar: loud effects only on impacts, capped per film; dolly-zoom once, on dread; quiet beats hold still', () => {
  const scenes = [
    scene({ energy: 5, mood: 'dread', fx: ['dolly-zoom', 'flash-frame'] }),
    scene({ energy: 5, mood: 'dread', fx: ['dolly-zoom'] }),
    scene({ energy: 2, fx: ['flash-frame', 'dust'] }),
    scene({ energy: 5, fx: ['light-leak', 'shake'], camera: 'handheld' }),
    scene({ mood: 'sad', energy: 1, fx: ['zoom-blur'], camera: 'detail-punch' }),
    scene({ energy: 2, camera: 'handheld' }),
  ];
  G.applyEditGrammar({ scenes }, { gravity: 'grave' });
  assert.deepEqual(scenes.map((s) => s.fx), [['dolly-zoom', 'flash-frame'], [], ['dust'], ['shake'], [], undefined]);
  assert.equal(scenes[4].camera, 'push-in');
  assert.equal(scenes[5].camera, 'drift', 'a handheld jolt belongs to action');
  assert.equal(scenes[3].camera, 'handheld');
});

test('grammar: an open story keeps its colour devices but still caps the gimmicks', () => {
  const scenes = [scene({ transition: 'leak', energy: 4, fx: ['light-leak', 'dolly-zoom'], mood: 'reveal' }), scene({ energy: 5, mood: 'reveal', fx: ['dolly-zoom'] })];
  G.applyEditGrammar({ scenes }, { gravity: 'open' });
  assert.equal(scenes[0].transition, 'leak');
  assert.deepEqual(scenes.map((s) => s.fx), [['light-leak', 'dolly-zoom'], []]);
});

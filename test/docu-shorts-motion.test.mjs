// Shorts motion (Replicate image-to-video) and the long video's atmosphere footage rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-motion-test-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const M = await import('../src/pipeline/docu-shorts-motion.js');
const V = await import('../src/pipeline/replicate-video.js');
const A = await import('../src/pipeline/docu-archive.js');

const seg = (o) => ({ kind: 'still', abs: `/p/${Math.random()}.jpg`, dur: 3, ...o });

test('motion: the opening first, a real person\'s photo and a document never, an archive picture only with a motion line', () => {
  const segs = [
    seg({ generated: true }), seg({ generated: true }), seg({ archive: true, person: true }),
    seg({ archive: true, motion: 'waves roll' }), seg({ archive: true }), seg({ generated: true }), seg({ generated: true }),
  ];
  assert.ok(!M.motionOk(segs[2]), 'a person is never animated');
  assert.ok(!M.motionOk(segs[4]), 'an archive picture without a motion line stays still');
  assert.deepEqual(M.pickMotion(segs, { opening: 3, max: 10 }), [0, 1, 3, 5, 6]);
  // the cap keeps the opening and the earliest of the rest
  assert.deepEqual(M.pickMotion(segs, { opening: 3, max: 3 }), [0, 1, 3]);
  // the same picture twice is one clip
  const same = seg({ generated: true });
  assert.deepEqual(M.pickMotion([same, { ...same }, seg({ generated: true })], { max: 10 }), [0, 2]);
});

test('motion: off without a Replicate key or when switched off — the Short renders as stills', async () => {
  const segs = [seg({ generated: true })];
  assert.equal(await M.animateSegments(segs, { settings: {} }), segs);
  assert.equal(await M.animateSegments(segs, { settings: { replicateKey: 'x', shortsMotion: false } }), segs);
});

test('replicate video: each model gets its own input names; Kling 5 or 10 s', () => {
  const i = { image: 'u', prompt: 'p', negative: 'n', duration: 6 };
  assert.deepEqual(V.videoInput('kwaivgi/kling-v2.5-turbo-pro', i), { start_image: 'u', prompt: 'p', duration: 5, negative_prompt: 'n' });
  assert.equal(V.videoInput('kwaivgi/kling-v2.5-turbo-pro', { ...i, duration: 8 }).duration, 10);
  assert.equal(V.videoInput('kwaivgi/kling-v2.1', i).mode, 'pro');
  assert.equal(V.videoInput('minimax/hailuo-02', i).first_frame_image, 'u');
  assert.equal(V.videoInput('google/veo-3-fast', i).generate_audio, false);
  assert.match(V.motionPrompt({ motion: 'fog rolls', opening: true }), /^fog rolls\. a slow, deliberate cinematic push-in/);
  assert.match(V.motionPrompt({ picture: 'A lone ship' }), /A lone ship; natural subtle movement/);
});

test('atmosphere footage: nature subjects try stock clips first; people, cast and modern subjects in an old story never', () => {
  const script = {
    era: '1872',
    scenes: [
      { type: 'photo', source: 'ai', imagePrompt: 'Empty horizon of the Atlantic, 1872, a faint wake' },
      { type: 'photo', source: 'ai', imagePrompt: 'Extreme close-up of a cockpit instrument panel, the ocean below' },
      { type: 'photo', source: 'ai', imagePrompt: 'A sailor at the rail looking at the sea' },
      { type: 'photo', source: 'ai', imagePrompt: 'Wide shot of a city street at night' },
      { type: 'photo', source: 'archive', search: 'Azores sea 1872', imagePrompt: 'Wide shot of the sea near the Azores' },
      { type: 'photo', source: 'ai', cast: ['briggs'], imagePrompt: 'Storm over the sea' },
      { type: 'slam', source: 'ai', imagePrompt: 'Fog over the sea' },
    ],
  };
  assert.equal(A.atmosphereFootage(script), 2);
  const [a, b, c, d, e, f, g] = script.scenes;
  assert.equal(a.source, 'stock');
  assert.equal(a.media, 'video');
  assert.equal(a.videoOnly, true, 'no clip → back to the AI picture, never a stock photo');
  assert.equal(a.search, 'horizon');
  assert.ok(!b.media, 'the subject is the cockpit, not the ocean');
  assert.ok(!c.media, 'a person in an old story is never stock footage');
  assert.ok(!d.media, 'a modern street in 1872 is a period error');
  assert.equal(e.media, 'video');
  assert.equal(e.source, 'archive', 'an archive scene keeps its photo fallback');
  assert.ok(!e.videoOnly);
  assert.ok(!f.media && !g.media);
});

test('opening motion (long video): at most two moving AI stills of the first chapter, never a person, a clip or an archive photo', () => {
  const s = {
    scenes: [
      { type: 'title', chapter: 0, imagePrompt: 'storm over the sea' },
      { type: 'photo', chapter: 0, imagePrompt: 'A ship in a storm at night, waves breaking' },
      { type: 'photo', chapter: 0, archived: true, imagePrompt: 'Fire in the harbour' },
      { type: 'photo', chapter: 0, cast: ['a'], imagePrompt: 'A crowd on the quay' },
      { type: 'photo', chapter: 0, imagePrompt: 'An empty office desk' },
      { type: 'photo', chapter: 0, imagePrompt: 'Steam train leaving the station in fog' },
      { type: 'photo', chapter: 0, imagePrompt: 'Smoke over the city' },
    ],
  };
  assert.equal(A.openingMotionTargets(s), 2);
  // The title's backdrop is the film's first picture: it moves first (Backdrop plays the clip).
  assert.deepEqual(s.scenes.map((x) => !!x.aiMotion), [true, true, false, false, false, false, false]);
  const forms = { scenes: [{ type: 'photo', chapter: 0, imagePrompt: 'grey institute in snowy Siberia at dusk' }, { type: 'photo', chapter: 0, imagePrompt: 'a glass test tube cracks on a steel bench' }] };
  assert.equal(A.openingMotionTargets(forms), 2, 'word forms: snowy, cracks');
  const later = { scenes: [{ type: 'photo', chapter: 1, imagePrompt: 'A ship in a storm' }] };
  assert.equal(A.openingMotionTargets(later), 0, 'only the opening chapter');
});

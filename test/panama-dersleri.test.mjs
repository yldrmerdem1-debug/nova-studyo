// Lessons of the Panama earthquake video (Oct 2026), now Nova rules: foreign-country stock clips are rejected,
// long same-picture holds are flagged before render, low-res real footage in the hook is shown full frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const A = await import('../src/pipeline/docu-archive.js');

test('a stock clip naming a country the story never mentions is rejected; the story\'s own places pass', () => {
  const g = A.storyPlaceGroups("Panama's 7.7 Earthquake. Two months ago, a 7.4 shook Colombia. In Panama City towers swayed.");
  assert.equal(A.foreignPlaceConflict(g, 'indian festival ganesha festival'), true, 'Indian flags under a Panama line');
  assert.equal(A.foreignPlaceConflict(g, 'bustling waikiki street scene with pedestrians'), true);
  assert.equal(A.foreignPlaceConflict(g, 'aerial view of lush alajuela landscape in daylight'), true, 'Costa Rica is not Panama');
  assert.equal(A.foreignPlaceConflict(g, 'aerial view of panama city skyline'), false);
  assert.equal(A.foreignPlaceConflict(g, 'colombian street after the earthquake'), false, 'Colombia is in the story');
  assert.equal(A.foreignPlaceConflict(g, 'debris from a torn down building'), false, 'no place named');
  // Two-word names match only whole: "new", "san", "south" alone are not places.
  assert.equal(A.foreignPlaceConflict(g, 'a new building on san street, south side'), false);
  assert.equal(A.foreignPlaceConflict(g, 'new york traffic at night'), true);
});

test('long holds: a bg-prev chain or the same file over 3 scenes or more than 15 s is flagged; cards break it', () => {
  const p = (image, extra = {}) => ({ type: 'photo', image, say: 'One two three four five six seven eight nine ten.', ...extra });
  const scenes = [
    p('street.mp4'), { type: 'words', bg: 'prev', say: 'Seven words of narration go right here.' }, { type: 'counter', bg: 'prev', say: 'Nine.' },
    p('map.jpg'), { type: 'flow', say: 'A card.' }, p('map.jpg'),
    p('a.jpg'), p('b.jpg'),
  ];
  const h = A.longHolds(scenes);
  assert.equal(h.length, 1, JSON.stringify(h));
  assert.equal(h[0].file, 'street.mp4');
  assert.deepEqual(h[0].scenes, [0, 1, 2]);
  assert.equal(A.longHolds([p('x.jpg', { dur: 9 }), p('x.jpg', { dur: 9 })]).length, 1, 'two long scenes on one file = 18 s');
});

test('hook fill: low-res real footage before the title is a target; portrait, tiny, AI and post-title footage are not', () => {
  const v = (w, h, extra = {}) => ({ type: 'words', video: `hand/v${w}x${h}.mp4`, videoW: w, videoH: h, archived: true, say: 'Short line here.', ...extra });
  const scenes = [v(792, 720), v(1920, 1080), v(480, 360), v(720, 1280), v(800, 600, { archived: false }), { type: 'title', say: 'Title.' }, v(792, 720)];
  assert.deepEqual(A.hookFillTargets(scenes), [0]);
});

test('hook fill rewrites the scene to a 1920x1080 copy (ffmpeg mocked)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hookfill-'));
  fs.mkdirSync(path.join(dir, 'hand'));
  fs.writeFileSync(path.join(dir, 'hand', 'real.mp4'), 'x');
  const calls = [];
  const runner = async (_ff, args) => { calls.push(args); fs.writeFileSync(args.at(-1), 'y'); };
  const scenes = [{ type: 'words', video: 'hand/real.mp4', videoW: 792, videoH: 720, archived: true, say: 'Two months ago.' }];
  const n = await A.fillHookFootage(scenes, { publicDir: dir, runner });
  assert.equal(n, 1);
  assert.equal(scenes[0].video, 'hand/real-fill.mp4');
  assert.equal(scenes[0].videoW, 1920);
  assert.equal(scenes[0].fit, 'cover');
  assert.ok(calls[0].join(' ').includes('crop=792:446'), calls[0].join(' '));
});

test('a multiplier or "+" stat becomes a rolling counter (a stat card sat empty until its number was said)', async () => {
  const E = await import('../src/pipeline/docu-edit-director.js');
  assert.deepEqual(E.statAsCounter({ value: '45×', label: 'more energy' }), { type: 'counter', from: 0, to: 45, suffix: '×', label: 'more energy' });
  assert.equal(E.statAsCounter({ value: '45x', label: 'L' }).suffix, '×');
  assert.equal(E.statAsCounter({ value: '80+', label: 'L' }).suffix, '+');
  assert.equal(E.statAsCounter({ value: '1 in 3', label: 'L' }), null, 'a ratio stays a stat');
});

test('a counter on a long line never stands on a light paper ground', async () => {
  const D = await import('../src/pipeline/docu-art-director.js');
  assert.equal(D.longNumberLine({ type: 'counter', say: 'So the quake released about three times the energy, and about forty-five times more than its own aftershock.' }), true);
  assert.equal(D.longNumberLine({ type: 'counter', say: 'A 7.7.' }), false);
});

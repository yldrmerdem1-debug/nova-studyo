// The same picture far apart in a film is flagged before render (Yom Kippur review, Oct 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
const { duplicatePictures } = await import('../src/pipeline/docu-archive.js');

test('same still in distant scenes is flagged; neighbours, held backgrounds and the closing callback are not', () => {
  const s = (image, extra = {}) => ({ type: 'photo', image, ...extra });
  const scenes = [s('a.jpg'), s('b.jpg'), s('b.jpg'), s('c.jpg'), s('a.jpg'), s('d.jpg', { bg: 'prev' }), s('e.jpg'), s('f.jpg'), s('c.jpg'), s('g.jpg'), s('h.jpg'), s('e.jpg')];
  const d = duplicatePictures(scenes);
  assert.deepEqual(d.map((x) => x.file).sort(), ['a.jpg', 'c.jpg']);
  assert.deepEqual(d.find((x) => x.file === 'a.jpg').scenes, [0, 4]);
});

test('clips count by their video file', () => {
  const v = (video) => ({ type: 'photo', video, image: video.replace('.mp4', '.jpg') });
  assert.equal(duplicatePictures([v('x.mp4'), v('y.mp4'), v('x.mp4'), v('z.mp4'), v('w.mp4'), v('u.mp4')]).length, 1);
});

// ChatGPT image inbox: the engine lists the stills it needs, takes the ones dropped in by number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const I = await import('../docu-engine/lib/image-inbox.mjs');

test('inbox: needs are numbered once per still, listed with a ready ChatGPT message, taken when dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-inbox-'));
  assert.equal(I.addNeed(dir, { file: 'build/x/img-aaa.jpg', prompt: 'A snowy taiga at blue hour' }), 1);
  assert.equal(I.addNeed(dir, { file: 'build/x/img-bbb.jpg', prompt: 'An empty corridor' }), 2);
  assert.equal(I.addNeed(dir, { file: 'build/x/img-aaa.jpg', prompt: 'A snowy taiga at blue hour' }), 1, 'same still, same number');
  assert.equal(I.writeList(dir), 2);
  const list = fs.readFileSync(path.join(dir, 'LISTE.txt'), 'utf8');
  assert.match(list, /01\) A snowy taiga/);
  // One still per ChatGPT message (28 Oct 2026: every 4-item message came back as one 2x2 collage).
  assert.equal((list.match(/--- ChatGPT mesajı \d+ \(yapıştır\) ---/g) || []).length, 2);
  assert.match(list, /--- ChatGPT mesajı 1 \(yapıştır\) ---\nCreate ONE single image[^\n]*\nA snowy taiga at blue hour/);
  assert.doesNotMatch(list, /SEPARATE images/);
  I.writeList(dir, { batch: 2 });
  assert.match(fs.readFileSync(path.join(dir, 'LISTE.txt'), 'utf8'), /Create 2 SEPARATE images/, 'a larger batch can still be asked for');
  assert.equal(I.inboxFileFor(dir, 'build/x/img-aaa.jpg'), null);
  fs.writeFileSync(path.join(dir, '01.png'), 'png');
  assert.equal(path.basename(I.inboxFileFor(dir, 'build/x/img-aaa.jpg')), '01.png');
  assert.equal(I.writeList(dir), 1, 'a dropped still leaves the list');
});

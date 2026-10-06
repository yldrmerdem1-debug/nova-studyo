// The v4 voice director: how each narration line is performed.
import test from 'node:test';
import assert from 'node:assert/strict';

const V = await import('../docu-engine/lib/voice-director.mjs');

test('voice director: the writer\'s own direction always wins', () => {
  const d = V.directLine({ say: '[whispers] No body. No luggage.', mood: 'dread' }, { model: 'eleven_v4' });
  assert.equal(d.text, '[whispers] No body. No luggage.');
  assert.equal(d.tag, '[whispers]');
});

test('voice director: opening low and steady, punch lines firm, questions curious, chapter ends soft, reveals hold their breath', () => {
  const scenes = [
    { say: 'In September 1890, a man stepped onto a train in Dijon.', mood: 'tension', chapter: 0 },
    { say: 'He never arrived.', mood: 'dread', chapter: 0 },
    { say: 'So where did he go?', mood: 'curious', chapter: 0 },
    { say: 'Investigators searched the line for weeks, and found nothing at all.', mood: 'reveal', chapter: 0 },
    { say: 'The family never stopped waiting for him to come home.', mood: 'sad', chapter: 0 },
    { say: 'A new chapter starts here with a calm line.', mood: 'calm', chapter: 1 },
  ];
  const d = V.directLines(scenes, { model: 'eleven_v4' });
  assert.match(d[0].text, /^\[low, steady voice\] In September/);
  assert.match(d[1].text, /^\[firmly\] He never arrived\.$/);
  assert.ok(d[1].stability > d[0].stability, 'a punch line is steadier');
  assert.match(d[2].text, /^\[curious\] So where/);
  assert.match(d[3].text, /searched the line for weeks\.\.\. and found nothing at all\./, 'the reveal holds its breath before its last clause');
  assert.match(d[4].text, /^\[softly, slower\] The family/, 'the last line of a chapter lands softer');
  for (const x of d) assert.ok(x.stability >= 0.35 && x.stability <= 0.6, 'never below 0.35 (drift), never robotic');
});

test('voice director: the same colour twice in a row is said once (no tag on every line)', () => {
  const d = V.directLines([
    { say: 'The first line of the scene goes here, low and steady.', mood: 'curious' },
    { say: 'The second line in the very same curiosity goes here.', mood: 'curious' },
    { say: 'A third curious line keeps going in the same way.', mood: 'curious' },
  ], { model: 'eleven_v4' });
  assert.match(d[1].text, /^\[curious\]/);
  assert.match(d[2].text, /^A third/, 'repeated colour drops its tag');
});

test('voice director: v3 keeps single tags, v2 gets no tags; Shorts keep every word (tags only)', () => {
  assert.match(V.directLine({ say: 'A slow and quiet line about the sea and the night.', mood: 'dread' }, { model: 'eleven_v3' }).text, /^\[whispers\]/);
  assert.equal(V.directLine({ say: '[whispers] Hello there.', mood: 'dread' }, { model: 'eleven_multilingual_v2' }).text, 'Hello there.');
  const s = V.directLines([{ say: 'He searched the coast for weeks, and found nothing.', mood: 'reveal' }, { say: 'Nothing.', mood: 'reveal' }], { model: 'eleven_v4', punctuation: false });
  assert.equal(V.stripTags(s.map((x) => x.text).join(' ')), 'He searched the coast for weeks, and found nothing. Nothing.');
});

test('alignment without tags: offsets match the plain text again', () => {
  const text = '[low, steady voice] He left. [firmly] Gone.';
  const chars = [...text];
  const a = { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10), character_end_times_seconds: chars.map((_, i) => (i + 1) / 10) };
  const u = V.untagAlignment(a);
  assert.equal(u.characters.join(''), 'He left. Gone.');
  assert.equal(u.character_start_times_seconds[0], text.indexOf('He') / 10);
});

test('quiet budget: a hushed voice is an effect — at most 15% of lines, never two in a row, one whisper per film; the rest read clear', async () => {
  const { directLines, QUIET_SHARE } = await import('../docu-engine/lib/voice-director.mjs');
  const scenes = Array.from({ length: 40 }, (_, i) => ({ chapter: Math.floor(i / 10), mood: i % 7 === 3 ? 'reveal' : 'tension', say: `${i % 3 === 0 ? '[whispers]' : '[quietly]'} Line number ${i} of the story goes on here.` }));
  const out = directLines(scenes, { model: 'eleven_v4' });
  const Q = /quiet|hush|whisper|soft|low|slow/i;
  const quiet = out.map((d) => Q.test((d.text.match(/^\[[^\]]*\]/) || [''])[0]));
  assert.ok(quiet.filter(Boolean).length <= Math.max(2, Math.round(40 * QUIET_SHARE)));
  assert.ok(quiet[0], 'the film still opens low');
  assert.ok(!quiet.some((q, i) => q && quiet[i + 1]), 'never two quiet lines in a row');
  assert.equal(out.filter((d) => /^\[whispers\]/.test(d.text)).length, 1);
  assert.ok(out.filter((d) => !/^\[/.test(d.text)).length >= 30, 'most lines in the clear narrator voice');
});

// Shorts (src/pipeline/docu-shorts.js): SRT okuma, pencere seçimi, Claude seçiminin sınırları, ASS altyazı.
import test from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../src/pipeline/docu-shorts.js');

const srt = (cues) => cues.map((c, i) => {
  const f = (t) => `00:${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')},${String(Math.round((t % 1) * 1000)).padStart(3, '0')}`;
  return `${i + 1}\n${f(c[0])} --> ${f(c[1])}\n${c[2]}`;
}).join('\n\n');
// 30 cues of 4 s, every third ends a sentence.
const CUES = Array.from({ length: 30 }, (_, i) => [i * 4, i * 4 + 3.8, i % 3 === 2 ? `Line ${i} ends here.` : `line ${i} goes on`]);

test('parseSrt reads cues with times and text', () => {
  const c = S.parseSrt(srt(CUES));
  assert.equal(c.length, 30);
  assert.deepEqual(c[1], { s: 4, e: 7.8, t: 'line 1 goes on' });
});

test('fallback window: from the opening, ends on a sentence, within 40-58 s', () => {
  const w = S.fallbackWindow(S.parseSrt(srt(CUES)));
  assert.equal(w.start, 0);
  assert.ok(w.end - w.start >= S.SHORT_MIN && w.end - w.start <= S.SHORT_MAX, `${w.end - w.start}`);
  assert.match(S.parseSrt(srt(CUES))[w.to].t, /\.$/);
});

test('pickShortWindow: a model pick inside the bounds is used; an out-of-bounds pick or a failure falls back', async () => {
  const cues = S.parseSrt(srt(CUES));
  const ok = await S.pickShortWindow({ cues, llm: async () => ({ startLine: 6, endLine: 17, hook: 'NOT EVERYONE LOST', title: 't', description: 'd', why: 'w' }) });
  assert.equal(ok.mode, 'llm');
  assert.equal(ok.start, 24);
  assert.equal(ok.hook, 'NOT EVERYONE LOST');
  const tooLong = await S.pickShortWindow({ cues, llm: async () => ({ startLine: 0, endLine: 29, hook: '', title: '', description: '', why: '' }) });
  assert.equal(tooLong.mode, 'fallback');
  const down = await S.pickShortWindow({ cues, llm: async () => { throw new Error('credit balance is too low'); } });
  assert.equal(down.mode, 'fallback');
});

test('buildShortAss: hook label, chunked captions timed from the Short start, end card', () => {
  const cues = S.parseSrt(srt(CUES));
  const ass = S.buildShortAss({ cues, start: 24, end: 72, hook: 'Not everyone lost' });
  assert.match(ass, /Style: Hook,Impact/);
  assert.match(ass, /,Hook,,0,0,0,,\{\\fad\(120,200\)\}NOT EVERYONE LOST/);
  assert.match(ass, /0:00:00\.\d\d,0:00:0\d\.\d\d,Cap,,0,0,0,,.*LINE 6/);
  assert.ok(!/LINE 5 /.test(ass), 'nothing from before the Short');
  assert.match(ass, /,End,,0,0,0,,.*FULL DOCUMENTARY ON THE CHANNEL/);
});

test('teaser: beats map to word times, each beat shows its own moment, the last beat runs to the voice end', () => {
  const cues = S.parseSrt(srt(CUES));
  const beats = [{ say: 'In one day it vanished.', line: 2 }, { say: 'Then the banks fell.', line: 20 }, { say: 'Watch the full story.', line: 28 }];
  const text = beats.map((b) => b.say).join(' ');
  let at = 0;
  const words = text.split(' ').map((w, i) => { const x = { w, s: i * 0.4, e: i * 0.4 + 0.35, at }; at += w.length + 1; return x; });
  const seg = S.teaserSegments({ beats, words, cues, videoDur: 120 });
  assert.equal(seg.length, 3);
  assert.equal(seg[0].src, cues[2].s + 0.2);
  assert.ok(Math.abs(seg[0].dur - 5 * 0.4) < 1e-9, 'beat 1 lasts until beat 2 starts (word 5)');
  assert.ok(Math.abs(seg[2].dur - (words.at(-1).e + 0.45 - words[9].s)) < 1e-9);
  const ass = S.buildTeaserAss({ words, hook: 'The day it vanished', voiceEnd: 4.5, total: 7 });
  assert.match(ass, /,Hook,,.*THE DAY IT VANISHED/);
  assert.match(ass, /,Cap,,.*IN \{\\c&H00D4FF&\}ONE\{\\c&HFFFFFF&\} DAY/, 'spoken numbers are highlighted');
  for (const [w, prev, key] of [['fourteen', 'x', true], ['billion', 'x', true], ['$205', 'x', true], ['Fisher', 'x', true], ['Then', 'fell.', false], ['the', 'x', false]]) assert.equal(S.isKeyWord(w, prev), key, w);
  assert.match(ass, /,End,,.*FULL DOCUMENTARY ON THE CHANNEL/);
});

test('teaser opening: three slam words land one by one before the hook label', () => {
  const words = [{ w: 'In', s: 0, e: 0.2, at: 0 }, { w: 'one', s: 0.25, e: 0.5, at: 3 }, { w: 'day.', s: 0.55, e: 0.9, at: 7 }];
  const ass = S.buildTeaserAss({ words, hook: 'The crash', slams: ['CRASH', 'GREED', 'WAR'], voiceEnd: 1.2, total: 4 });
  assert.match(ass, /Dialogue: 3,0:00:00\.00,0:00:00\.50,Slam,,0,0,0,,\{\\fscx150\\fscy150\\t\(0,90,\\fscx100\\fscy100\)\}CRASH/);
  assert.match(ass, /Dialogue: 3,0:00:01\.00,0:00:01\.50,Slam,.*WAR/);
  assert.match(ass, /Dialogue: 1,0:00:01\.50,.*Hook/);
});

test('teaser screens: each subtitle line is told what the long video shows (portrait name, counter, headline)', () => {
  assert.equal(S.screenOf({ type: 'photo', name: 'Roger Babson', search: 'Roger Babson portrait 1929' }), 'portrait of Roger Babson — Roger Babson portrait 1929');
  assert.equal(S.screenOf({ type: 'counter', to: 89, suffix: '%', label: 'Dow Jones loss' }), 'counter 89% Dow Jones loss');
  assert.equal(S.screenOf({ type: 'headline', headline: 'STOCKS COLLAPSE' }), 'newspaper headline: STOCKS COLLAPSE');
});

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
  assert.equal(seg.length, 3, 'one picture per sentence');
  assert.equal(seg[0].src, cues[2].s + 0.25, 'starts inside its scene, past the transition');
  assert.equal(seg[0].speed, 1);
  assert.ok(Math.abs(seg[0].dur - 5 * 0.4) < 1e-9, 'beat 1 lasts until beat 2 starts (word 5)');
  assert.ok(Math.abs(seg[2].dur - (words.at(-1).e + 0.45 - words[9].s)) < 1e-9);
  const ass = S.buildTeaserAss({ words, hook: 'The day it vanished', voiceEnd: 4.5, total: 7 });
  assert.match(ass, /,Hook,,.*THE DAY IT VANISHED/);
  assert.match(ass, /,Cap,,.*IN \{\\c&H00D4FF&\}ONE\{\\c&HFFFFFF&\} DAY/, 'spoken numbers are highlighted');
  for (const [w, prev, key] of [['fourteen', 'x', true], ['billion', 'x', true], ['$205', 'x', true], ['Fisher', 'x', true], ['Then', 'fell.', false], ['the', 'x', false]]) assert.equal(S.isKeyWord(w, prev), key, w);
  assert.match(ass, /,End,,.*FULL DOCUMENTARY ON THE CHANNEL/);
});

test('teaser pacing: a sentence keeps its picture, stays inside its scene, slows a short scene, cuts to "more" only past that', () => {
  const cues = S.parseSrt(srt(CUES));
  // Lines 4-6 are one scene in the long video (16-28 s); line 10 is a scene of its own (40-44 s).
  const idx = cues.map((_, i) => (i >= 4 && i <= 6 ? 100 : i));
  const windows = S.sceneWindows(cues, idx);
  assert.deepEqual(windows[5], { s: 16, e: 28 });
  const say = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ') + '.';
  const beats = [{ say: say(10), line: 5 }, { say: say(12), line: 10 }, { say: say(25), line: 10, more: [20] }];
  const text = beats.map((b) => b.say).join(' ');
  let at = 0;
  const words = text.split(' ').map((w, i) => { const x = { w, s: i * 0.5, e: i * 0.5 + 0.45, at }; at += w.length + 1; return x; });
  const seg = S.teaserSegments({ beats, words, cues, videoDur: 120, windows });
  // Beat 1 (5 s) fits its 12 s scene: one shot, normal speed, starting just before the line.
  assert.deepEqual([seg[0].beat, seg[0].dur, seg[0].speed, seg[0].src], [0, 5, 1, 20 - 0.3]);
  // Beat 2 (6 s) on a 3.5 s scene: one shot, slowed to cover the sentence, never past the scene.
  assert.equal(seg[1].beat, 1);
  assert.equal(seg[1].dur, 6);
  assert.equal(seg[1].speed, 1.6);
  assert.ok(seg[1].src >= 40.25 && seg[1].src + seg[1].dur / seg[1].speed <= 44.5);
  // Beat 3 (12.5 s + tail): the first scene holds 3.5 s x 1.6, then the "more" line takes the rest.
  const third = seg.filter((g) => g.beat === 2);
  assert.deepEqual(third.map((g) => g.line), [10, 20]);
  assert.ok(Math.abs(third[0].dur - 5.6) < 1e-9);
});

test('teaser opening: three spoken fragments, each word slammed the moment the narrator says it, then the hook label', () => {
  const opening = { say: 'Seventy ships. One hill. And one night that ended an empire.', words: ['ships', 'HILL', 'dawn'], lines: [4, 9, 20] };
  const lead = S.openingBeats(opening);
  assert.deepEqual(lead.map((b) => [b.say, b.line, b.slam]), [
    ['Seventy ships.', 4, 'SHIPS'],
    ['One hill.', 9, 'HILL'],
    ['And one night that ended an empire.', 20, 'EMPIRE'], // 'dawn' is not spoken: fall back to a real word of the fragment
  ]);
  assert.equal(S.openingBeats({ say: 'Just one sentence here.', words: [], lines: [3] }).length, 1, 'not three fragments: one plain beat, no slams');

  const beats = [...lead, { say: 'Then the walls fell.', line: 2 }];
  const text = beats.map((b) => b.say).join(' ');
  let at = 0;
  const words = text.split(' ').map((w, i) => { const x = { w, s: i * 0.4, e: i * 0.4 + 0.35, at }; at += w.length + 1; return x; });
  const slams = S.slamTimes(beats, words);
  // "ships" is word 1 (0.4 s) and holds until "One" (word 2, 0.8 s); "hill" is word 3; "empire" word 10
  assert.deepEqual(slams.map((m) => [m.text, +m.s.toFixed(2), +m.e.toFixed(2)]), [['SHIPS', 0.36, 0.8], ['HILL', 1.16, 1.6], ['EMPIRE', 3.96, 4.4]]);

  const ass = S.buildTeaserAss({ words, hook: 'The night an empire fell', slams, voiceEnd: 6, total: 9 });
  assert.match(ass, /Dialogue: 3,0:00:00.36,0:00:00.80,Slam,.*SHIPS/);
  assert.match(ass, /Dialogue: 1,0:00:04.40,.*Hook.*THE NIGHT AN EMPIRE FELL/);
  assert.ok(!/,Cap,.*SEVENTY/.test(ass), 'no caption echo under the slams');
  assert.match(ass, /,Cap,.*THEN/, 'captions start after the opening');
});

test('teaser screens: each subtitle line is told what the long video shows (portrait name, counter, headline)', () => {
  assert.equal(S.screenOf({ type: 'photo', name: 'Roger Babson', search: 'Roger Babson portrait 1929' }), 'portrait of Roger Babson — Roger Babson portrait 1929');
  assert.equal(S.screenOf({ type: 'counter', to: 89, suffix: '%', label: 'Dow Jones loss' }), 'counter 89% Dow Jones loss');
  assert.equal(S.screenOf({ type: 'headline', headline: 'STOCKS COLLAPSE' }), 'newspaper headline: STOCKS COLLAPSE');
});

test('teaser slams sit on a picture of the thing: a slam whose screen does not show it moves to the nearest line that does', () => {
  const screens = ['walls at dawn', 'an iron chain across the harbor', 'moon', 'chains on the dock'];
  const fixed = S.fixSlamLines([{ slam: 'CHAIN', line: 0 }, { slam: 'WALLS', line: 0 }, { line: 2 }, { slam: 'CHAINS', line: 3 }], screens);
  assert.deepEqual(fixed.map((b) => b.line), [1, 0, 2, 3]);
  // a generated picture is described by its prompt, not by the archive query it replaced
  assert.equal(S.screenOf({ type: 'photo', image: 'build/x/img-7acf38d23976.jpg', imagePrompt: 'walls by a harbor', search: 'chain' }), 'walls by a harbor');
  assert.equal(S.screenOf({ type: 'photo', image: 'build/x/arch-1.jpg', search: 'harbor chain', imagePrompt: 'x' }), 'harbor chain');
});

test('teaser shots never run into the next scene: placed inside the span that shows the picture, else slowed, then the last frame holds', () => {
  const seg = { src: 461.48, dur: 2.96, speed: 1 };
  assert.deepEqual(S.fitShotToSpan(seg, { s: 459.9, e: 464.3 }), { ...seg, src: 461.26, speed: 1, hold: 0 });
  const short = S.fitShotToSpan(seg, { s: 461.0, e: 462.5 });
  assert.equal(short.speed, 2);
  assert.ok(short.hold > 0 && Math.abs((short.dur - short.hold) / short.speed - (462.5 - 0.08 - 461.05)) < 1e-6);
  assert.deepEqual(S.fitShotToSpan(seg, null), seg, 'no measurement: unchanged');
});

test('picture Short: a 9:16 window around the subject, never outside the picture', async () => {
  const P = await import('../src/pipeline/docu-shorts-pictures.js');
  const land = P.verticalCrop(1536, 1024, { x: 0.4, y: 0.2, w: 0.3, h: 0.5 });
  assert.deepEqual([land.w, land.h], [576, 1024]);
  assert.ok(land.x >= 0 && land.x + land.w <= 1536);
  assert.ok(Math.abs(land.x + land.w / 2 - 0.55 * 1536) < 2, 'centred on the subject');
  const edge = P.verticalCrop(1536, 1024, { x: 0.95, y: 0, w: 0.05, h: 1 });
  assert.equal(edge.x + edge.w, 1536, 'a subject at the edge clamps the window inside');
  const tall = P.verticalCrop(2134, 2880, { x: 0.16, y: 0.2, w: 0.7, h: 0.6 });
  assert.ok(tall.w <= 2134 && tall.h <= 2880 && Math.abs(tall.w / tall.h - 9 / 16) < 0.01);
});

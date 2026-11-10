// Shorts (src/pipeline/docu-shorts.js): SRT okuma, pencere seçimi, Claude seçiminin sınırları, ASS altyazı.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const S = await import('../src/pipeline/docu-shorts.js');

const seconds = t => t.split(':').reduce((sum, n) => sum * 60 + Number(n), 0);
const captionEvents = ass => ass.split('\n').filter(l => l.startsWith('Dialogue:') && l.split(',')[3] === 'Cap').map(l => {
  const cols = l.split(',');
  return { s: seconds(cols[1]), e: seconds(cols[2]), text: cols.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/g, ' '), raw: l };
});
const constantinopleWords = JSON.parse(fs.readFileSync(new URL('./fixtures/1453-short-words.json', import.meta.url), 'utf8'));
const constantinopleOptions = {
  words: constantinopleWords, hook: 'SHIPS THAT CROSSED A HILL', hookFor: 3.5,
  slams: [{text:'CHAIN',s:0.2,e:0.96},{text:'CANNON',s:1.811,e:2.62},{text:'TWENTY-ONE',s:4.006,e:4.92}],
  figures: [{text:'4,773',s:14.928,e:16.728},{text:'60 OXEN',s:21.98,e:23.78}],
  voiceEnd: 54.05, total: 56.65,
};

test('1453 teaser captions remain steady without replaying the pop on each phrase', () => {
  const captions = captionEvents(S.buildTeaserAss(constantinopleOptions));
  assert.ok(captions.every(c => !/\\(?:fsc[xy]|t\()/.test(c.raw)), 'normal captions must not restart the 116% pop');
});

test('1453 teaser captions follow readable phrases and never mix adjacent sentences', () => {
  const captions = captionEvents(S.buildTeaserAss(constantinopleOptions));
  assert.ok(captions.length <= 34, `too many switches: ${captions.length}`);
  assert.ok(captions.filter(c => c.e - c.s < 1).length <= 2, 'avoid bursts of sub-second cues');
  assert.ok(captions.every(c => !/[.!?] [A-Z]/.test(c.text)), 'a sentence end must end its cue');
  assert.ok(captions.every(c => c.text.length <= 32), 'keep the existing 118px font readable on at most two lines');
  for (let i = 0; i < captions.length; i++) {
    assert.ok(captions[i].s >= 4.92 && captions[i].e > captions[i].s);
    if (i) assert.ok(captions[i-1].e <= captions[i].s, 'captions never overlap');
  }
  assert.equal(captions.map(c => c.text).join(' '), constantinopleWords.filter(w => w.s >= 4.92).map(w => w.w.toUpperCase()).join(' '), 'every spoken word is retained in order');
});

test('caption repair preserves Claude styles and the intentional hook, slam, figure and end animations', () => {
  const ass = S.buildTeaserAss(constantinopleOptions);
  // The default look is the channel's punch (Impact, the yellow printed boxes): docu-shorts-looks.js styles.
  assert.deepEqual(ass.split('\n').filter(l => l.startsWith('Style:')).map(l => l.split(',')[0]), ['Style: Cap', 'Style: Hook', 'Style: Slam', 'Style: Open', 'Style: Fig', 'Style: End', 'Style: Like']);
  assert.ok(ass.includes('Style: Slam,Impact,150,&H00111111,&H00111111,&H0000D4FF'), 'punch slam: yellow printed box');
  const events = ass.split('\n').filter(l => l.startsWith('Dialogue:') && l.split(',')[3] !== 'Cap');
  assert.deepEqual(events, [
    'Dialogue: 3,0:00:00.20,0:00:00.96,Slam,,0,0,0,,{\\fscx150\\fscy150\\t(0,90,\\fscx100\\fscy100)\\fad(0,80)}CHAIN',
    'Dialogue: 3,0:00:01.81,0:00:02.62,Slam,,0,0,0,,{\\fscx150\\fscy150\\t(0,90,\\fscx100\\fscy100)\\fad(0,80)}CANNON',
    'Dialogue: 3,0:00:04.01,0:00:04.92,Slam,,0,0,0,,{\\fscx150\\fscy150\\t(0,90,\\fscx100\\fscy100)\\fad(0,80)}TWENTY-ONE',
    'Dialogue: 1,0:00:04.92,0:00:08.42,Hook,,0,0,0,,{\\fad(160,250)}SHIPS THAT CROSSED A HILL',
    'Dialogue: 3,0:00:14.93,0:00:16.73,Fig,,0,0,0,,{\\q2\\an5\\pos(540,1230)\\fscx160\\fscy160\\t(0,110,\\fscx100\\fscy100)\\fad(0,150)}4,773',
    'Dialogue: 3,0:00:21.98,0:00:23.78,Fig,,0,0,0,,{\\q2\\an5\\pos(540,1230)\\fscx160\\fscy160\\t(0,110,\\fscx100\\fscy100)\\fad(0,150)}60 OXEN',
    'Dialogue: 2,0:00:54.35,0:00:56.65,End,,0,0,0,,{\\q2\\fscx125\\fscy125\\t(0,160,\\fscx100\\fscy100)}FULL DOCUMENTARY\\NON THE CHANNEL',
    'Dialogue: 2,0:00:54.75,0:00:56.65,Like,,0,0,0,,{\\fscx55\\fscy55\\t(0,140,\\fscx112\\fscy112)\\t(140,260,\\fscx100\\fscy100)}LIKE  •  SUBSCRIBE',
  ]);
});

test('teaser captions start after the final slam even with TTS boundary tolerance', () => {
  const words = [{w:'The',s:0.97,e:1.1},{w:'walls',s:1.12,e:1.4},{w:'fell.',s:1.42,e:2}];
  const captions = captionEvents(S.buildTeaserAss({words,slams:[{text:'NIGHT',s:0,e:1}],voiceEnd:2.45,total:5}));
  assert.deepEqual(captions.map(c => [c.s,c.e,c.text]), [[1,2.3,'THE WALLS FELL.']]);
  assert.equal(captionEvents(S.buildTeaserAss({words:[],voiceEnd:0,total:3})).length, 0);
});

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
  assert.match(ass, /,Cap,,.*IN \{\\c&H0000D4FF&\}ONE\{\\c&H00FFFFFF&\} DAY/, 'spoken numbers are highlighted');
  for (const [w, prev, key] of [['fourteen', 'x', true], ['billion', 'x', true], ['$205', 'x', true], ['Fisher', 'x', true], ['Then', 'fell.', false], ['the', 'x', false]]) assert.equal(S.isKeyWord(w, prev), key, w);
  assert.match(ass, /,End,,.*FULL DOCUMENTARY\\NON THE CHANNEL/);
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

test('picture Short: a small subject in a big picture is cut closer, never past 1400 px (Kremlin, Oct 2026)', async () => {
  const P = await import('../src/pipeline/docu-shorts-pictures.js');
  // 6000x4000 night shot, the Kremlin along the bottom: the full-height cut was two thirds empty sky.
  const k = P.verticalCrop(6000, 4000, { x: 0.3, y: 0.55, w: 0.5, h: 0.4 });
  assert.equal(k.h, 2240, 'cut to the subject with a margin');
  assert.ok(k.y <= 0.55 * 4000 && k.y + k.h >= 0.95 * 4000, 'the subject is inside the cut');
  assert.ok(Math.abs(k.w / k.h - 9 / 16) < 0.01);
  // A tiny box never cuts under 1400 px: the frame would be blown up and soft.
  const tiny = P.verticalCrop(6000, 4000, { x: 0.5, y: 0.5, w: 0.05, h: 0.05 });
  assert.equal(tiny.h, P.ZOOM_MIN_H);
  // A picture already under 1400 px tall keeps its full height.
  const small = P.verticalCrop(1536, 1024, { x: 0.4, y: 0.6, w: 0.2, h: 0.2 });
  assert.equal(small.h, 1024);
});

test('picture Short planner (1929 Short): no present-day pictures in a period story, real people get their archive portrait, never an AI likeness', async () => {
  const P = await import('../src/pipeline/docu-shorts-pictures.js');
  const S = await import('../src/pipeline/docu-shorts.js');
  const pic = (id, what, extra = {}) => ({ id, rel: `${id}.jpg`, kind: 'still', quality: 4, what, ...extra });
  const catalog = [
    pic('p1', 'Black-and-white photo of a huge crowd on Wall Street, 1929'),
    pic('p2', 'Modern color low-angle view of the New York Stock Exchange facade'),
    pic('p3', 'Aerial modern color footage of an arid desert plateau'),
    pic('p4', 'Vintage press photo portrait of mustached man in suit, captioned Roger Babson'),
    pic('p5', 'Elderly bespectacled goateed man in a tweed suit, 1920s photo', { say: 'Irving Fisher, the most famous economist in America, said stocks had reached a plateau' }),
    pic('p6', 'Bank run crowd, 1930s photo'),
    pic('p7', 'Breadline of men in overcoats, 1930s photo'),
    pic('p8', 'Wildflowers in a meadow', { modern: true }),
  ];
  assert.equal(P.periodFit(catalog[1], 1929), false, 'modern colour photo');
  assert.equal(P.periodFit(catalog[7], 1929), false, 'vision flagged modern');
  assert.equal(P.periodFit(catalog[0], 1929), true);
  assert.equal(P.periodFit(catalog[1], 2008), true, 'a present-day story may use present-day pictures');
  assert.equal(P.portraitFor('Irving Fisher', catalog).id, 'p5', 'found by the narration over it');
  assert.equal(P.portraitFor('Roger Babson', catalog).id, 'p4', 'found by its caption');

  let seen = '';
  const llm = async ({ user }) => {
    seen = user;
    return {
      hook: 'THE CRASH', title: 't', description: 'd',
      opening: { say: 'One bell. One prophet. And a crash.', words: ['bell', 'prophet', 'crash'], pictures: ['p1', 'p4', 'p2'] },
      beats: [
        { say: 'Roger Babson warned a crash was coming.', picture: 'p4', newPrompt: '', person: 'Roger Babson', figure: '', figureWord: '' },
        { say: 'Irving Fisher said stocks had reached a permanently high plateau.', picture: 'new', newPrompt: 'Irving Fisher at a lectern', person: 'Irving Fisher', figure: '', figureWord: '' },
        { say: 'Babson was laughed at.', picture: 'p4', newPrompt: '', person: 'Roger Babson', figure: '', figureWord: '' },
        { say: 'The hero was led away in handcuffs.', picture: 'new', newPrompt: 'Richard Whitney in handcuffs led by police', person: 'Richard Whitney', figure: '', figureWord: '' },
      ],
    };
  };
  const plan = await P.planPictureTeaser({ cues: [{ t: 'story' }], catalog, year: 1929, llm });
  assert.ok(!/p2 ·|p3 ·|p8 ·/.test(seen), 'present-day pictures never reach the planner');
  assert.ok(/narration over it/.test(seen) && /figure of speech/.test(seen) && /never a likeness/.test(seen));
  const [o1, o2, o3, babson, fisher, babson2, whitney] = plan.beats;
  assert.equal(o1.asset.id, 'p1');
  assert.equal(o3.asset, undefined, 'a modern pick is dropped');
  assert.equal(babson.asset.id, 'p4', 'the portrait comes back for the person');
  assert.equal(fisher.asset.id, 'p5', '"new" for a real person becomes their archive portrait');
  assert.equal(babson2.asset, undefined, 'a portrait is used at most twice');
  assert.ok(!/Whitney/.test(whitney.newPrompt) && /anonymous/.test(whitney.newPrompt), 'no likeness of a real person');
  // 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, doygunluk 2,5-6): siyah-beyaz yalnızca Short'un gerçek
  // arşivi siyah-beyazsa (archiveIsMono), yıl aralığına göre değil; yoksa dönemin doğal renkli fotoğrafı.
  assert.match(S.newPictureStyle(1929, "", { mono: true }), /black-and-white/);
  assert.match(S.newPictureStyle(1929), /natural colour photograph/);
  assert.doesNotMatch(S.newPictureStyle(1929), /black-and-white/);
  assert.equal(S.newPictureStyle(2015), '');
});

test('picture Short figures land when the whole number is said, unit included (say then show)', async () => {
  const S = await import('../src/pipeline/docu-shorts.js');
  const ws = (t) => t.split(' ').map((w, k) => ({ w, s: k, e: k + 0.9 }));
  const a = ws('Whitney bids two hundred and five dollars for U.S. Steel');
  assert.equal(a[S.numberEnd(a, 2)].w, 'dollars');
  const b = ws('the Dow crashes twelve point eight percent. No savior comes.');
  assert.equal(b[S.numberEnd(b, 3)].w, 'percent.');
  const c = ws('six million jobless turn to one voice');
  assert.equal(c[S.numberEnd(c, 0)].w, 'million', 'a noun after the number is not part of it');
  const d = ws('By 1933, Adolf Hitler');
  assert.equal(d[S.numberEnd(d, 1)].w, '1933,', 'the sentence break ends it');
  const e = ws('Over nine thousand banks fail');
  assert.equal(e[S.numberEnd(e, 1)].w, 'thousand');
});

test('a quantity is never split across captions: "half | a dozen hospitals" would read as twelve', () => {
  const text = 'So why are nearly two hundred people under watch, and half a dozen hospitals sealed?';
  let t = 0;
  const words = text.split(' ').map((w) => { const s = t; t += 0.32; return { w, s, e: s + 0.28 }; });
  const captions = captionEvents(S.buildTeaserAss({ words, voiceEnd: t, total: t + 2 }));
  const lines = captions.map((c) => c.text.toLowerCase());
  assert.ok(lines.some((l) => /half a dozen/.test(l)), lines.join(' | '));
  assert.ok(lines.some((l) => /two hundred/.test(l)), lines.join(' | '));
});

test('Shorts punch-in: a long still is cut in two, the second closer on its subject; small pictures, clips and short beats stay one shot; time is unchanged', async () => {
  const P = await import('../src/pipeline/docu-shorts-pictures.js');
  const big = { kind: 'still', abs: 'a.jpg', dur: 4, srcW: 6000, srcH: 4000, box: { x: 0.3, y: 0.2, w: 0.4, h: 0.6 } };
  const small = { kind: 'still', abs: 'b.jpg', dur: 4, srcW: 1600, srcH: 1000, box: { x: 0.3, y: 0.2, w: 0.4, h: 0.6 } };
  const clip = { kind: 'clip', abs: 'c.mp4', dur: 4, srcW: 720, srcH: 1280 };
  const short = { ...big, abs: 'd.jpg', dur: 2 };
  const out = P.punchInSegments([big, small, clip, short]);
  assert.equal(out.length, 5);
  assert.equal(out[1].punch, true);
  assert.ok(Math.abs(out[0].dur + out[1].dur - 4) < 1e-6);
  const c1 = P.verticalCrop(big.srcW, big.srcH, out[0].box);
  const c2 = P.verticalCrop(big.srcW, big.srcH, out[1].box);
  assert.ok(c2.h < c1.h * 0.85 && c2.h >= P.ZOOM_MIN_H, 'closer but still sharp');
  assert.deepEqual(out.slice(2).map((g) => g.abs), ['b.jpg', 'c.mp4', 'd.jpg']);
  assert.equal(P.punchInSegments(out).length, 5, 'never punched twice');
});

test('teaser end card: a LIKE • SUBSCRIBE plate pops a beat after the card, only when the card shows', async () => {
  const S = await import('../src/pipeline/docu-shorts.js');
  const ass = S.buildTeaserAss({ words: [], voiceEnd: 40, total: 43.5 });
  assert.match(ass, /Style: Like,/);
  assert.match(ass, /Dialogue: 2,0:00:40\.70,0:00:43\.50,Like,.*LIKE {2}• {2}SUBSCRIBE/);
  assert.doesNotMatch(S.buildTeaserAss({ words: [], voiceEnd: 40, total: 43.5, endCard: '' }), /,Like,/, 'no end card, no plate');
});

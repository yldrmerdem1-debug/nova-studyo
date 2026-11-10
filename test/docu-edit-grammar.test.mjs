// Edit grammar + music gravity (docu-engine/lib/edit-grammar.mjs, audio-director.mjs storyGravity/fitsGravity):
// a grave story gets a restrained cut and a grave score; loud devices land only on impacts.
import test from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../docu-engine/lib/edit-grammar.mjs');
const A = await import('../docu-engine/lib/audio-director.mjs');

const scene = (o) => ({ type: 'photo', say: 'x', mood: 'tension', energy: 3, chapter: 1, ...o });

test('gravity: war, crashes and crime are grave; any other story is serious, open only on request', () => {
  assert.equal(A.storyGravity({ scenes: [] }, 'epic'), 'grave');
  const crash = { title: '1929', scenes: Array.from({ length: 10 }, () => ({ say: 'The market crashed and banks collapsed; men were ruined.' })) };
  assert.equal(A.storyGravity(crash, 'finance'), 'grave');
  // KURAL DEĞİŞTİ (27 Ekim 2026): kanalların hepsi ciddi (haber, tarih, finans); 'open' yalnız istenince.
  // Eskiden bu bilim hikâyesi 'open' çıkıyordu ve 'open' yalnız oyun müziğini dışarıda tutuyordu: Hormuz
  // mayın haberinin altında hafif synth-pop (Videodrome), Lula seçiminin altında hafif latin parça çaldı.
  assert.equal(A.storyGravity({ title: 'Webb', scenes: [{ say: 'Light fell toward us for billions of years.' }] }, 'science'), 'serious');
  assert.equal(A.storyGravity({ musicGravity: 'serious', scenes: [] }, 'epic'), 'grave', "'serious' is a floor: an epic is still grave");
  assert.equal(A.storyGravity({ musicGravity: 'open', scenes: [] }, 'epic'), 'open');
  // Mines, an attack, a blast: grave words now (Hormuz 8a1eca had 2.93 per 1000 words, under the old 3.0).
  const mines = { title: 'Tankers hit mines', scenes: [{ say: 'Two tankers hit mines. An explosion, then a fire. The attack left two wounded. ' + 'The strait was quiet for hours that day. '.repeat(30) }] };
  assert.equal(A.storyGravity(mines, 'documentary'), 'grave');
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
  // KURAL DEĞİŞTİ (27 Ekim 2026): etiketsiz parça artık geçmiyor (fail closed). "Dusty Road Magic"in ton
  // etiketi yoktu ve bu yüzden her ağır havuzdaydı (sıcak Americana gitar).
  assert.equal(A.fitsGravity({ tags: {} }, 'grave'), false, 'an untoned track never plays under a serious story');
  assert.equal(A.fitsGravity({ tags: {} }, 'serious'), false);
  assert.equal(A.fitsGravity(t('dramatic'), 'serious'), true, 'serious gates like grave');
  assert.equal(A.fitsGravity(t('light'), 'serious'), false);
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
  // KURAL DEĞİŞTİ (29 Ekim 2026, Gimli 20261028-9ff721 / Kartal Yuvası 950730: %21-39 kare luma < 40): a banned device at
  // a turn (the film's first beat, a new chapter) used to become a fade to black; it is a plain cut now.
  assert.deepEqual(script.scenes.map((s) => s.transition), ['cut', 'whip', 'cut', 'cut', 'ink', 'cut']);
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

test('battle music only under a battle (Napoleon: war horns under the storm and the wait in Moscow)', async () => {
  const A = await import('../docu-engine/lib/audio-director.mjs');
  const tr = (tags) => ({ tags: { energy: 3, tempo: 'medium', ...tags } });
  assert.equal(A.battleTrack(tr({ energy: 5, tempo: 'fast', description: 'War horns, choir and pounding percussion' })), true);
  assert.equal(A.battleTrack(tr({ energy: 4, description: 'full battle, the final assault on the walls' })), true);
  assert.equal(A.battleTrack(tr({ energy: 4, description: 'A brooding orchestral piece with a steady build of tension' })), false);
  assert.equal(A.battleTrack(tr({ energy: 5, tempo: 'medium', description: 'swelling hymn' })), false);
  // The real library: the planner no longer puts the battle track under Napoleon's non-battle stretches.
  const root = 'C:/Users/erdem/Videos/Nova Studyo/data/audio-library';
  const fs = await import('node:fs');
  if (!fs.existsSync(`${root}/library.json`)) return;
  const lib = A.loadLibrary(root);
  const scenes = [
    { type: 'photo', mood: 'dread', energy: 3, say: 'A violent storm. Ten thousand horses dead before a single battle. War, death, the army.', dur: 40 },
    { type: 'photo', mood: 'tension', energy: 3, say: 'In burnt Moscow the army waited; the Tsar never wrote back. War and ruin.', dur: 60 },
  ];
  const plan = A.planScore({ script: { genre: 'history', scenes, era: '1812' }, sceneSeconds: scenes.map((s) => s.dur), lib, root, genre: 'history', seed: 't' });
  for (const c of plan.cues.filter((c) => c.trackId)) assert.equal(A.battleTrack(lib.music.find((m) => m.id === c.trackId)), false, c.title);
});

test('echo captions become key words; short dates and labels stay', async () => {
  const G = await import('../docu-engine/lib/edit-grammar.mjs');
  const echo = { type: 'words', say: '[serious] More than forty-seven French generals were killed or wounded.', text: 'More than forty-seven French generals were killed or wounded.' };
  const date = { type: 'words', say: 'Midsummer, 1812. A river in Lithuania.', text: 'Midsummer, 1812' };
  const own = { type: 'words', say: 'He waited for a reply that never came.', text: 'The letter that never came, waiting in the Kremlin for weeks' };
  assert.equal(G.echoesLine(echo), true);
  assert.equal(G.echoesLine(date), false, 'six words or fewer is a label, not an echo');
  assert.equal(G.echoesLine(own), false, 'its own words, not the narration');
  const script = { scenes: [echo, date, { ...own }] };
  G.applyEditGrammar(script, { gravity: 'grave' });
  assert.equal(echo.textMode, 'key');
  assert.equal(date.textMode, undefined);
});

test('breath: a chapter end, a toll, a slam or a quiet line lands before the cut; asides do not', async () => {
  const G = await import('../docu-engine/lib/edit-grammar.mjs');
  const a = (o) => ({ type: 'photo', mood: 'tension', energy: 3, chapter: 0, dur: 3, voiceDur: 4, ...o });
  const scenes = [a({}), a({ type: 'counter' }), a({ mood: 'sad' }), a({}), a({ chapter: 1 })];
  assert.equal(G.breathAfter(scenes[0], scenes[1]), 0, 'a plain line keeps the old 0.4 s');
  assert.equal(G.breathAfter(scenes[1], scenes[2]), 0.7);
  assert.equal(G.breathAfter(scenes[2], scenes[3]), 0.7);
  assert.equal(G.breathAfter(scenes[3], scenes[4]), 1.4, 'the last line of a chapter');
  assert.equal(G.breathAfter(scenes[4], undefined), 0);
  const r = G.applyBreath({ scenes });
  assert.equal(r.scenes, 3);
  assert.equal(scenes[1].dur, 4.7);
  assert.equal(scenes[0].dur, 3, 'untouched');
});

test('cutaways: only climax picture lines, cut on spoken content words, never on a person or a held still', async () => {
  const I = await import('../docu-engine/lib/inserts.mjs');
  const wt = (text, step = 0.4) => text.split(' ').map((word, k) => ({ word, t: +(k * step).toFixed(2) }));
  const guns = { type: 'photo', image: 'a.jpg', imagePrompt: 'Cannons firing across a field', energy: 5, pace: 'rapid', mood: 'tension', say: 'Then the guns opened, and for fourteen hours they hardly stopped.', voiceDur: 4.6, wordTimes: wt('Then the guns opened, and for fourteen hours they hardly stopped.') };
  const chart = { type: 'photo', image: 'b.jpg', imagePrompt: 'A long chart on a wall', energy: 4, pace: 'quick', mood: 'tension', say: 'At its far end, a thin black thread. What does it mean?', voiceDur: 4.6, wordTimes: wt('At its far end, a thin black thread. What does it mean?') };
  const person = { ...guns, name: 'Bagration' };
  const held = { ...guns, pace: 'hold' };
  const card = { ...guns, type: 'words', textMode: 'key' };
  const full = { ...guns, type: 'words' };
  assert.equal(I.insertable(guns) && I.climaxLine(guns), true);
  assert.equal(I.climaxLine(chart), false, 'a chart line is not action');
  assert.equal(I.insertable(person), false, 'a name card would sit on someone else');
  assert.equal(I.insertable(held), false, 'a deliberate hold stays one picture');
  assert.equal(I.insertable(card), true, 'a key-word card keeps its word over the new picture');
  assert.equal(I.insertable(full), false, 'never under a full sentence card');
  const at = I.insertMoments(guns, 1);
  assert.equal(at.length, 1);
  const w = guns.wordTimes.find((x) => Math.abs(x.t - at[0] - 0.04) < 1e-6);
  assert.ok(w && w.word.replace(/\W/g, '').length >= 4, `cuts on a content word (${w?.word})`);
  assert.ok(at[0] >= 1.06 && at[0] <= guns.voiceDur - 1);
  // In the hook (first 45 s) every picture line of 3.5 s+ gets a cutaway; later only the climax lines do.
  const plan = I.planInserts({ scenes: [chart, guns, person] });
  assert.deepEqual(plan.map((p) => p.i), [0, 1]);
  assert.match(plan[1].prompts[0], /same moment/);
  const late = I.planInserts({ scenes: [{ type: 'photo', dur: 60, say: 'x' }, chart, guns, person] });
  assert.deepEqual(late.map((p) => p.i), [2], 'after the hook a calm line keeps one picture');
});

// Ses yönetmeni (docu-engine/lib/audio-director.mjs): müziği, efekt havuzlarını, ortam
// yataklarını ve olay seslerini profesyonel bir kurgucu gibi seçiyor mu?
// Gerçek kütüphaneye dokunmaz: ffmpeg ile kısa sinüs/gürültü dosyalarından geçici bir
// kütüphane üretir. Ağ yok, ücretli API yok.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const FF = createRequire(import.meta.url)('ffmpeg-static');
const AD = await import('../docu-engine/lib/audio-director.mjs');
const { loadLibrary, planScore, renderScore, pickSfxPools, planAmbience, planEvents, sfxMeta, wordMatch, _internals } = AD;

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-audio-lib-'));
process.on('exit', () => fs.rmSync(ROOT, { recursive: true, force: true }));

function ff(args) {
  const r = spawnSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}
/* A mono 22.05 kHz file from an aevalsrc expression (t = seconds). */
function synth(rel, expr, dur) {
  const out = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff(['-f', 'lavfi', '-i', `aevalsrc=exprs=${expr}:s=22050:d=${dur}`, '-ac', '1', '-c:a', 'pcm_s16le', out]);
  return rel;
}
/* The library's 1-second energy curve (dB under the loudest second) for an amplitude envelope. */
const curve = (dur, env) => {
  const v = Array.from({ length: Math.floor(dur) }, (_, s) => env(s + 0.5));
  const top = Math.max(...v);
  return v.map((x) => Math.round(Math.max(-60, 20 * Math.log10(Math.max(1e-6, x) / top))));
};
const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];
const GENRES = ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror'];
const fit = (o, base = 0.1) => Object.fromEntries(MOODS.map((m) => [m, o[m] ?? base]));
const gfit = (o, base = 0.6) => Object.fromEntries(GENRES.map((g) => [g, o[g] ?? base]));

/*
 * Music: a sine per track, each with its own frequency, level and shape. Shapes:
 * flat, rise (quiet first half, then a build), swell (loud peak in the middle).
 */
const SHAPES = {
  flat: () => 1,
  rise: (t, d) => (t < d / 2 ? 0.12 : 0.12 + 0.88 * Math.min(1, (t - d / 2) / (d / 4))),
  hit: (t) => (t < 1 ? 1 : 0.6),
};
function track(id, { dur = 80, freq = 220, amp = 0.4, shape = 'flat', mood = {}, genre = {}, energy = 3, culture = 'western orchestral', vocals = 'none', usable = true }) {
  const shapeExpr = shape === 'rise'
    ? `if(lt(t\\,${dur / 2})\\,0.12\\,0.12+0.88*min(1\\,(t-${dur / 2})/${dur / 4}))`
    : shape === 'hit' ? 'if(lt(t\\,1)\\,1\\,0.6)' : '1';
  const file = synth(`music/${id}.wav`, `${amp}*${shapeExpr}*sin(2*PI*${freq}*t)`, dur);
  return {
    id, file, title: `Parça ${id}`, artist: 'Test', license: 'test', duration: dur, lufs: null,
    energy: curve(dur, (t) => SHAPES[shape](t, dur)),
    tags: { description: id, instruments: ['strings'], vocals, energy, tempo: 'medium', culture, moodFit: fit(mood), genreFit: gfit(genre), documentaryUsable: usable, bestUse: '' },
  };
}

const music = [
  track('strike', { dur: 70, freq: 110, shape: 'hit', energy: 5, mood: { tension: 1, reveal: 1, dread: 0.8 }, genre: { documentary: 0.9 } }),
  track('lyrics', { freq: 300, mood: fit({}, 1), genre: gfit({}, 1), vocals: 'lyrics' }),
  track('cheesy', { freq: 310, mood: fit({}, 1), genre: gfit({}, 1), usable: false }),
  track('oud', { freq: 330, mood: { curious: 1, calm: 0.6 }, genre: { epic: 0.2, documentary: 0.3 }, culture: 'middle-eastern' }),
  track('rise', { dur: 90, freq: 200, shape: 'rise', energy: 4, mood: { tension: 0.95, dread: 0.7 }, genre: { documentary: 0.3 } }),
  ...['c1', 'c2', 'c3', 'c4'].map((id, k) => track(id, { freq: 240 + 10 * k, energy: 2, mood: { curious: 0.9 - 0.05 * k, calm: 0.6 }, genre: { epic: 0.8 } })),
  ...['t1', 't2', 't3', 't4'].map((id, k) => track(id, { freq: 400 + 10 * k, energy: 4, mood: { tension: 0.9 - 0.05 * k, dread: 0.6 } })),
  ...['d1', 'd2'].map((id, k) => track(id, { freq: 500 + 10 * k, energy: 3, mood: { dread: 0.9 - 0.05 * k, tension: 0.5 } })),
  ...['s1', 's2'].map((id, k) => track(id, { freq: 600 + 10 * k, energy: 2, mood: { sad: 0.9 - 0.05 * k, calm: 0.5 } })),
  ...['r1', 'r2'].map((id, k) => track(id, { freq: 700 + 10 * k, energy: 5, mood: { reveal: 0.9 - 0.05 * k, triumph: 0.7 } })),
  ...['w1', 'w2'].map((id, k) => track(id, { freq: 800 + 10 * k, energy: 4, mood: { triumph: 0.9 - 0.05 * k, reveal: 0.6 } })),
  // Two very different levels of the same kind of cue: the render must bring them together.
  track('quiet', { dur: 40, freq: 250, amp: 0.08, mood: { calm: 0.2 } }),
  track('loud', { dur: 40, freq: 260, amp: 0.8, mood: { calm: 0.2 } }),
];

/* Short effects: noise hits with a fast decay, sweeps, beds of filtered noise. */
const noiseHit = (rel, decay = 8, amp = 0.8, dur = 1.5) => synth(rel, `${amp}*(random(0)*2-1)*exp(-t*${decay})`, dur);
const sweep = (rel, dur = 2) => synth(rel, `0.5*(t/${dur})*sin(2*PI*(200+300*t)*t)`, dur);
const bed = (rel, amp = 0.05, dur = 12) => synth(rel, `${amp}*(random(0)*2-1)`, dur);
const ANY_MOOD = MOODS;
function sfx(o) {
  return {
    sourceId: `test:${o.id}`, file: o.file, source: 'test', license: 'test', duration: o.duration ?? 1.5, lufs: null, title: o.title ?? o.id, slug: o.slug ?? o.id,
    role: o.role ?? 'transition', kind: o.kind, intensity: o.intensity ?? 3, keywords: o.keywords ?? [], genres: o.genres ?? GENRES, moods: o.moods ?? ANY_MOOD,
    scene_types: o.types ?? ['photo', 'words', 'title', 'slam', 'montage', 'chart', 'counter'], era: o.era ?? 'any', literal_only: !!o.literal,
    max_per_video: o.max ?? 10, min_gap_sec: o.gap ?? 10, gain_db: o.gain ?? -14,
  };
}
const sfxList = [
  sfx({ id: 'hit-a', kind: 'hit', file: noiseHit('sfx/hit-a.wav'), intensity: 4, role: 'impact' }),
  sfx({ id: 'hit-b', kind: 'hit', file: noiseHit('sfx/hit-b.wav', 5, 0.3), intensity: 4, role: 'impact', genres: ['documentary', 'crime', 'horror', 'epic'] }),
  sfx({ id: 'hit-soft', kind: 'hit', file: noiseHit('sfx/hit-soft.wav', 12, 0.2), intensity: 2, role: 'impact', slug: 'hit-small-sub-thump' }),
  sfx({ id: 'whoosh-a', kind: 'whoosh', file: sweep('sfx/whoosh-a.wav', 1.2), intensity: 2 }),
  sfx({ id: 'whoosh-b', kind: 'whoosh', file: sweep('sfx/whoosh-b.wav', 1.6), intensity: 2 }),
  sfx({ id: 'riser-a', kind: 'riser', file: sweep('sfx/riser-a.wav', 3), intensity: 3, role: 'riser' }),
  sfx({ id: 'stinger-a', kind: 'stinger', file: noiseHit('sfx/stinger-a.wav', 3), intensity: 4, role: 'stinger', genres: ['horror', 'crime'], moods: ['dread', 'reveal'] }),
  sfx({ id: 'glitch-a', kind: 'glitch', file: noiseHit('sfx/glitch-a.wav', 20, 0.5, 0.5), intensity: 2, era: 'modern', genres: ['science', 'finance', 'crime', 'documentary'] }),
  // A literal-only radio stinger: never a transition, only when the narration names the radio.
  sfx({ id: 'radio', kind: 'stinger', file: noiseHit('sfx/radio.wav', 2), literal: true, role: 'stinger', genres: ['horror', 'crime', 'science'], keywords: ['telsiz', 'radio', 'radyo', 'signal lost', 'sinyal kesildi'] }),

  // Beds (gain_db = level under the narration).
  sfx({ id: 'bed-rain', kind: 'bed', role: 'ambience', slug: 'bed-rain-light', file: bed('sfx/bed-rain.wav'), duration: 12, gain: -26, max: 6,
    keywords: ['rain', 'yağmur', 'drizzle', 'rainy', 'yağmurlu', 'rain on the window', 'funeral', 'cenaze'] }),
  sfx({ id: 'bed-office', kind: 'bed', role: 'ambience', slug: 'bed-office-newsroom', file: bed('sfx/bed-office.wav', 0.03), duration: 12, gain: -28, era: 'modern',
    keywords: ['office', 'ofis', 'newsroom', 'typewriter', 'police station', 'karakol'] }),
  sfx({ id: 'bed-traffic', kind: 'bed', role: 'ambience', slug: 'bed-city-traffic', file: bed('sfx/bed-traffic.wav'), duration: 12, gain: -27, era: 'modern',
    keywords: ['traffic', 'trafik', 'cars', 'city street', 'street'] }),
  sfx({ id: 'bed-market', kind: 'bed', role: 'ambience', slug: 'bed-crowd-market', file: bed('sfx/bed-market.wav'), duration: 12, gain: -28,
    keywords: ['crowd', 'kalabalık', 'market', 'pazar', 'bazaar', 'çarşı', 'hall'] }),
  sfx({ id: 'bed-camp', kind: 'bed', role: 'ambience', slug: 'bed-campfire-night', file: bed('sfx/bed-camp.wav'), duration: 12, gain: -26, genres: ['epic', 'documentary', 'horror'],
    keywords: ['campfire', 'fire', 'ateş', 'camp', 'tent', 'çadır'] }),

  // Literal one-shots.
  sfx({ id: 'explosion', kind: 'event', role: 'one_shot', slug: 'event-explosion', file: noiseHit('sfx/explosion.wav', 2, 0.9, 3), duration: 3, literal: true, intensity: 4, gain: -12,
    max: 2, gap: 30, genres: ['documentary', 'epic', 'crime', 'science', 'inspire'], moods: ['tension', 'dread', 'reveal'],
    keywords: ['explosion', 'patlama', 'patladı', 'exploded', 'infilak', 'bomb', 'bomba', 'dinamit'] }),
  sfx({ id: 'siren', kind: 'event', role: 'one_shot', slug: 'event-police-siren', file: sweep('sfx/siren.wav', 4), duration: 4, literal: true, era: 'modern', intensity: 3, gain: -18,
    max: 2, gap: 60, genres: ['crime', 'documentary'], moods: ['tension', 'dread', 'reveal'],
    keywords: ['siren', 'police', 'polis', 'police car', 'polis arabası', 'olay yeri', 'crime scene'] }),
  sfx({ id: 'gunshot', kind: 'event', role: 'one_shot', slug: 'event-gunshot-single', file: noiseHit('sfx/gunshot.wav', 25, 0.9, 1), duration: 1, literal: true, era: 'industrial', intensity: 4, gain: -10,
    max: 3, gap: 30, genres: ['crime', 'documentary'], moods: ['tension', 'dread', 'reveal'],
    keywords: ['gunshot', 'silah sesi', 'kurşun', 'vurdu', 'pistol', 'tabanca'] }),
  sfx({ id: 'applause', kind: 'event', role: 'one_shot', slug: 'event-audience-applause', file: bed('sfx/applause.wav', 0.2, 5), duration: 5, literal: true, intensity: 2, gain: -18,
    max: 2, gap: 60, genres: ['inspire', 'science', 'documentary'], moods: ['curious', 'reveal', 'triumph'], keywords: ['applause', 'alkış', 'alkışladı'] }),
];

fs.writeFileSync(path.join(ROOT, 'library.json'), JSON.stringify({
  version: 1, music, sfx: sfxList,
  sfxRules: 'Genre default beds: documentary bed-rain; crime bed-office.\nNo bed is always better than a wrong bed.',
}));
const lib = loadLibrary(ROOT);

/* ------------------------------------------------------------ helpers */

const scene = (o = {}) => ({ type: 'photo', dur: 5, mood: 'curious', chapter: 0, say: 'Bir sahne.', ...o });
const byId = new Map(music.map((m) => [m.id, m]));
const musicCues = (plan) => plan.cues.filter((c) => c.trackId);
const bounds = (plan) => plan.cues.map((c) => c.fromSec);

/** Chapters of `n` scenes each, with the mood pattern repeated inside. */
function chapters(moodsPerChapter, { dur = 5 } = {}) {
  const scenes = [];
  moodsPerChapter.forEach((ms, ch) => ms.forEach((mood) => scenes.push(scene({ chapter: ch, mood, dur }))));
  return { id: 'test', genre: 'documentary', scenes };
}

/* Mono 8 kHz PCM of a rendered file, for levels and length. */
function pcm(file) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28, windowsHide: true });
  const b = r.stdout;
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
const rmsDb = (x, a, b) => {
  const i0 = Math.max(0, Math.floor(a * 8000));
  const i1 = Math.min(x.length, Math.floor(b * 8000));
  let e = 0;
  for (let i = i0; i < i1; i++) e += (x[i] / 32768) ** 2;
  return 10 * Math.log10(1e-12 + e / Math.max(1, i1 - i0));
};
/* Exact length of a 16-bit WAV from its header. */
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  let p = 12;
  let rate = 0;
  let ch = 0;
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4);
    const size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(p + 10); rate = b.readUInt32LE(p + 12); }
    if (id === 'data') return size / (rate * ch * 2);
    p += 8 + size + (size & 1);
  }
  throw new Error('no data chunk');
}

/* ------------------------------------------------------------ library */

test('loadLibrary: null when missing or empty, drops entries whose audio is not on disk', () => {
  assert.equal(loadLibrary(path.join(ROOT, 'nope')), null);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-audio-empty-'));
  fs.writeFileSync(path.join(empty, 'library.json'), JSON.stringify({ music: [], sfx: [] }));
  assert.equal(loadLibrary(empty), null);
  fs.writeFileSync(path.join(empty, 'library.json'), JSON.stringify({ music: [{ ...music[4], file: 'music/missing.wav' }], sfx: [] }));
  assert.equal(loadLibrary(empty), null, 'a half-downloaded library with no files is no library');
  fs.rmSync(empty, { recursive: true, force: true });
  assert.equal(lib.music.length, music.length);
  assert.equal(lib.sfx.length, sfxList.length);
});

test('Turkish keyword morphology: roots with inflections, never a different word', () => {
  const yes = [['patladı', 'patlama'], ['patlamayla', 'patlama'], ['sirenler', 'siren'], ['kurşunlar', 'kurşun'], ['toplar', 'top'], ['sesleri', 'sesi'], ['alkışlarla', 'alkış']];
  const no = [['kurs', 'kurşun'], ['toplum', 'top'], ['çantasında', 'çan'], ['sessiz', 'sesi'], ['karar', 'kar']];
  for (const [t, k] of yes) assert.ok(wordMatch(t, k), `${t} ~ ${k}`);
  for (const [t, k] of no) assert.ok(!wordMatch(t, k), `${t} !~ ${k}`);
  assert.ok(!wordMatch('window', 'wind', false), 'English: wind is not window');
  assert.ok(wordMatch('explosions', 'explosion', false));
});

/* ------------------------------------------------------------ music plan */

test('music: one cue per chapter, short mood swings stay inside the cue, the cue changes at the chapter', () => {
  // 4 chapters x 60 s; inside each, the mood flips every 10 s (the writer's "emotion swings").
  const swing = ['curious', 'curious', 'tension', 'tension', 'curious', 'curious', 'tension', 'tension', 'curious', 'curious', 'tension', 'tension'];
  const script = chapters([swing, swing, swing, swing]);
  const plan = planScore({ script, lib, genre: 'documentary', seed: 'v1' });
  const chapterStarts = [0, 60, 120, 180];
  assert.deepEqual(bounds(plan), chapterStarts, 'a new cue exactly at each chapter, none in between');
  assert.equal(plan.cues.at(-1).toSec, 240);
  for (const c of plan.cues) assert.ok(c.trackId, 'every chapter has music');
});

test('music: a mood family held >= 20 s is a story turn and earns a new cue on its first scene', () => {
  const ch0 = [...Array(6).fill('curious'), ...Array(6).fill('dread')]; // 30 s curious, then 30 s dread
  const plan = planScore({ script: chapters([ch0]), lib, genre: 'documentary', seed: 'turn' });
  assert.deepEqual(bounds(plan), [0, 30]);
  assert.equal(plan.cues[1].mood, 'dread');
  assert.ok((byId.get(plan.cues[1].trackId).tags.moodFit.dread ?? 0) >= 0.6, 'the dread cue gets a dark track');
  // A 15 s swing is not a turn.
  const short = [...Array(9).fill('curious'), ...Array(3).fill('dread')];
  assert.equal(planScore({ script: chapters([short]), lib, genre: 'documentary', seed: 'turn' }).cues.length, 1);
});

test('music: a palette, not a playlist — never the same track twice in a row, never lyrics or an unusable track; rotates across videos', () => {
  const moods = ['curious', 'tension', 'dread', 'sad', 'reveal', 'triumph', 'calm', 'curious', 'tension', 'dread'];
  const script = chapters(moods.map((m) => Array(8).fill(m))); // 10 chapters x 40 s
  const plan = planScore({ script, lib, genre: 'documentary', seed: 'reuse' });
  const ids = musicCues(plan).filter((c) => !c.resume).map((c) => c.trackId);
  assert.equal(ids.length, 10);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `the same track in two cues in a row: ${ids}`);
  assert.ok(new Set(ids).size >= 4 && new Set(ids).size < ids.length, `a palette of recurring cues: ${ids}`);
  assert.ok(!ids.includes('lyrics') && !ids.includes('cheesy'));
  const scores = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((seed) => musicCues(planScore({ script, lib, genre: 'documentary', seed })).map((c) => c.trackId).join()));
  assert.ok(scores.size >= 2, 'different videos rotate between equally good tracks');
  assert.deepEqual(planScore({ script, lib, genre: 'documentary', seed: 'reuse' }), plan, 'deterministic by seed');
  // The original planner is kept for jobs already cut to its beats: a fresh track per cue.
  const v1 = musicCues(planScore({ script, lib, genre: 'documentary', seed: 'reuse', selector: 'v1' })).filter((c) => !c.resume).map((c) => c.trackId);
  assert.equal(new Set(v1).size, v1.length, `v1 never reuses: ${v1}`);
});

test('music: the cold open gets the most striking track; silence scenes are silence', () => {
  const script = {
    id: 'cold', genre: 'documentary', scenes: [
      scene({ type: 'montage', mood: 'tension', dur: 6 }),
      scene({ type: 'title', title: 'Başlık', mood: 'curious', dur: 5 }),
      ...Array(6).fill(0).map(() => scene({ mood: 'curious' })),
      scene({ mood: 'tension', silence: true, dur: 3 }),
      ...Array(6).fill(0).map(() => scene({ mood: 'curious' })),
    ],
  };
  const plan = planScore({ script, lib, genre: 'documentary', seed: 'cold' });
  assert.ok(plan.cues[0].coldOpen);
  assert.equal(plan.cues[0].trackId, 'strike');
  assert.equal(plan.cues[0].toSec, 6, 'the cold open ends on the title card');
  const sil = plan.cues.find((c) => c.mood === 'silence');
  assert.ok(sil && sil.trackId === null && sil.fromSec === 41 && sil.toSec === 44);
});

test('music: the entry point follows the cue — tension starts on the build, calm below it', () => {
  const t = lib.music.find((m) => m.id === 'rise');
  const tense = _internals.bestStart(t, { from: 0, to: 20, mood: 'tension' });
  assert.ok(tense.s >= 30 && tense.s <= 50, `tension starts at the build (${tense.s})`);
  const calm = _internals.bestStart(t, { from: 0, to: 20, mood: 'calm' });
  assert.ok(calm.s <= 25, `calm stays in the quiet half (${calm.s})`);
});

test('music: a cue longer than any track chains a second, similar track on a scene cut', () => {
  const script = chapters([Array(40).fill('tension')]); // 200 s, tracks are <= 90 s
  const plan = planScore({ script, lib, genre: 'documentary', seed: 'chain' });
  const cues = musicCues(plan);
  assert.ok(cues.length >= 2, 'chained');
  assert.ok(cues.slice(1).every((c) => c.chained));
  assert.equal(new Set(cues.map((c) => c.trackId)).size, cues.length);
  for (const c of cues.slice(1)) assert.equal(c.fromSec % 5, 0, 'the switch lands on a cut');
  for (const c of cues) assert.ok((byId.get(c.trackId).tags.moodFit.tension ?? 0) >= 0.5, 'every link fits the mood');
});

test('music: the topic picks the culture (an Ottoman epic gets the oud), and only when asked', () => {
  const base = chapters([Array(8).fill('curious')]);
  const plain = planScore({ script: { ...base, genre: 'epic' }, lib, genre: 'epic', seed: 'x' });
  assert.notEqual(plain.cues[0].trackId, 'oud', 'no exotic colour without a reason');
  const ottoman = planScore({ script: { ...base, genre: 'epic', musicHint: 'Osmanlı sarayı, 1453' }, lib, genre: 'epic', seed: 'x' });
  assert.equal(ottoman.cues[0].trackId, 'oud');
});

/* ------------------------------------------------------- music v2: era, theme, energy, history */

/*
 * A second, style-rich library (same audio generator): period instrumentation,
 * synths and beats, jazz, drones, a quirky ukulele. Tags say what each one IS;
 * the planner must pick by era/topic, not only by mood.
 */
function styled(id, o) {
  const t = track(id, { dur: 150, ...o });
  t.tags = { ...t.tags, instruments: o.instruments ?? t.tags.instruments, culture: o.culture ?? t.tags.culture, description: o.description ?? id };
  return t;
}
const styleMusic = [
  styled('synthbeat', { freq: 210, energy: 4, culture: 'electronic', instruments: ['synth', 'drums', 'bass'], description: 'dark electronic track with heavy beats', mood: { tension: 0.95, dread: 0.7, curious: 0.5 } }),
  styled('synthbeat2', { freq: 215, energy: 4, culture: 'electronic', instruments: ['synths', 'drums', 'bass'], description: 'pulsing synth beats building tension', mood: { tension: 0.9, dread: 0.6, reveal: 0.5 } }),
  styled('synthpad', { freq: 220, energy: 2, culture: 'electronic', instruments: ['synth pads', 'ambient textures'], description: 'spacious evolving ambient synth pads', mood: { curious: 0.9, calm: 0.8, reveal: 0.5, sad: 0.4 } }),
  styled('drone', { freq: 225, energy: 2, culture: 'ambient', instruments: ['synth drone'], description: 'cold dark drone, ominous swells', mood: { dread: 0.9, tension: 0.7, sad: 0.4 } }),
  styled('orch', { freq: 230, energy: 4, shape: 'rise', culture: 'western orchestral', instruments: ['strings', 'brass', 'percussion'], description: 'orchestral strings build to a climax', mood: { tension: 0.85, reveal: 0.8, triumph: 0.7, dread: 0.5 } }),
  styled('orch2', { freq: 235, energy: 3, culture: 'western orchestral', instruments: ['strings', 'woodwinds'], description: 'tense strings, slowly swelling', mood: { tension: 0.8, dread: 0.7, curious: 0.5 } }),
  styled('piano', { freq: 240, energy: 2, culture: 'piano', instruments: ['piano'], description: 'solo piano, reflective, swells softly', mood: { sad: 0.9, calm: 0.8, curious: 0.6 } }),
  styled('strings', { freq: 245, energy: 2, culture: 'western orchestral', instruments: ['strings', 'piano'], description: 'gentle strings and piano, emotive', mood: { sad: 0.85, calm: 0.7, reveal: 0.5, curious: 0.55 } }),
  styled('jazz', { freq: 250, energy: 3, culture: 'other', instruments: ['upright bass', 'piano', 'saxophone', 'brushed drums'], description: 'a contemplative jazz piece with a moody groove', mood: { curious: 0.85, tension: 0.6, calm: 0.6 } }),
  styled('ukulele', { freq: 255, energy: 3, culture: 'americana', instruments: ['ukulele', 'whistling'], description: 'a quirky, playful upbeat tune', mood: { curious: 1, calm: 0.9, triumph: 0.6 } }),
  styled('triumph', { freq: 260, energy: 4, culture: 'western orchestral', instruments: ['strings', 'brass'], description: 'soaring orchestral triumph', mood: { triumph: 0.9, reveal: 0.8 } }),
  styled('pad2', { freq: 265, energy: 2, culture: 'electronic', instruments: ['synth pads'], description: 'ethereal ambient pads', mood: { calm: 0.85, curious: 0.7, sad: 0.6 } }),
];
const styleLib = { version: 1, music: styleMusic, sfx: [], sfxRules: null, root: ROOT };
const styleById = new Map(styleMusic.map((m) => [m.id, m]));
const ARC = ['curious', 'tension', 'sad', 'dread', 'reveal', 'curious', 'tension', 'sad', 'tension', 'reveal', 'sad'];
const arcScript = (o = {}) => ({ ...chapters(ARC.map((m) => Array(8).fill(m))), ...o }); // 11 chapters x 40 s
const share = (plan, pred) => {
  let on = 0;
  let all = 0;
  for (const c of musicCues(plan)) {
    all += c.toSec - c.fromSec;
    if (pred(styleById.get(c.trackId))) on += c.toSec - c.fromSec;
  }
  return all ? on / all : 0;
};
const isSynth = (t) => AD.trackFeatures(t).synth;

test('music v2: the era and topic pick the instruments — 1912 strings/piano, 1977 space synths, 1929 jazz; never the ukulele', () => {
  const titanic = planScore({ script: arcScript({ era: '1912 (Titanic)', title: 'Titanic: the ship that sank' }), lib: styleLib, root: ROOT, genre: 'documentary', seed: 'era' });
  const voyager = planScore({ script: arcScript({ era: '1977-1990', title: 'Voyager: a probe to the planets' }), lib: styleLib, root: ROOT, genre: 'science', seed: 'era' });
  const crash = planScore({ script: arcScript({ era: '1929-1933', title: '1929: the Wall Street crash' }), lib: styleLib, root: ROOT, genre: 'finance', seed: 'era' });
  assert.equal(titanic.profile.year, 1912);
  assert.ok(titanic.profile.topics.includes('maritime') && voyager.profile.topics.includes('space') && crash.profile.topics.includes('crash'));
  assert.ok(share(titanic, isSynth) <= 0.15, `1912: almost no synths (${share(titanic, isSynth).toFixed(2)})`);
  assert.ok(share(titanic, (t) => AD.trackFeatures(t).beat) === 0, '1912: never a modern beat');
  assert.ok(share(voyager, isSynth) >= 0.4, `1977 space: synths and pads lead (${share(voyager, isSynth).toFixed(2)})`);
  assert.ok(share(voyager, isSynth) > share(titanic, isSynth) + 0.3);
  assert.ok(musicCues(crash).some((c) => c.trackId === 'jazz'), '1929: the jazz colour is heard');
  for (const p of [titanic, voyager, crash]) assert.ok(!musicCues(p).some((c) => c.trackId === 'ukulele'), 'no quirky ukulele in a serious film');
  // The topic bible speaks too: a music "avoid" rules the instrument out.
  const noPiano = planScore({ script: arcScript({ era: '1912', title: 'Titanic', topic: { music: { avoid: ['solo piano'] } } }), lib: styleLib, root: ROOT, genre: 'documentary', seed: 'era' });
  assert.ok(share(noPiano, (t) => AD.trackFeatures(t).piano) < share(titanic, (t) => AD.trackFeatures(t).piano), 'topic.music.avoid pushes piano away');
});

test('music v2: a main theme stated early, called back mid-film and in the finale; 4-7 supporting cues, each reuse from another passage', () => {
  const plan = planScore({ script: arcScript({ era: '1912', title: 'Titanic' }), lib: styleLib, root: ROOT, genre: 'documentary', seed: 'theme' });
  const cues = musicCues(plan);
  assert.ok(plan.theme, 'a theme was chosen');
  const themed = cues.filter((c) => c.trackId === plan.theme.id);
  assert.ok(themed.length >= 2 && themed.length <= 4, `theme ${themed.length}x`);
  assert.ok(themed.every((c) => c.theme), 'theme cues are marked');
  assert.ok(themed[0].fromSec <= 0.3 * 440, 'stated in the first third');
  assert.equal(cues.at(-1).trackId, plan.theme.id, 'the finale calls the theme back');
  const support = new Set(cues.map((c) => c.trackId).filter((id) => id !== plan.theme.id));
  assert.ok(support.size >= 3 && support.size <= 8, `supporting cues: ${[...support]}`);
  const ids = cues.filter((c) => !c.resume).map((c) => c.trackId);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], `never twice in a row: ${ids}`);
  // A track that comes back plays another passage of itself.
  const by = new Map();
  for (const c of cues) by.set(c.trackId, [...(by.get(c.trackId) ?? []), c]);
  for (const [id, cs] of by) {
    if (cs.length < 2) continue;
    const spans = cs.map((c) => [c.startAt, c.startAt + c.toSec - c.fromSec]);
    let same = 0;
    for (let a = 0; a < spans.length; a++) for (let b = a + 1; b < spans.length; b++) if (Math.abs(spans[a][0] - spans[b][0]) < 2) same++;
    assert.ok(same === 0, `${id} replays the same entry point: ${spans.map((s) => s[0])}`);
  }
});

test('music v2: energy — a peak gets a breath of silence after it, louder cues for high energy, the swell lands on the reveal', () => {
  const E = (mood, energy, n, chapter = 0) => Array(n).fill(0).map(() => scene({ mood, energy, chapter }));
  const script = { id: 'energy', genre: 'documentary', era: '1912', title: 'Titanic', scenes: [
    ...E('curious', 1, 6), ...E('tension', 3, 3), ...E('tension', 4, 3), ...E('reveal', 5, 5), ...E('sad', 1, 6), ...E('curious', 2, 6), ...E('tension', 3, 6),
  ] };
  const plan = planScore({ script, lib: styleLib, root: ROOT, genre: 'documentary', seed: 'energy' });
  const breath = plan.cues.find((c) => c.breath);
  assert.ok(breath && breath.trackId === null, `a breath after the peak: ${JSON.stringify(plan.cues.map((c) => [c.fromSec, c.mood]))}`);
  assert.equal(breath.fromSec, 85, 'it opens where the reveal ends');
  assert.ok(breath.toSec - breath.fromSec >= 1.6 && breath.toSec - breath.fromSec <= 2.6);
  const peak = plan.cues.find((c) => c.mood === 'reveal');
  const calm = plan.cues.find((c) => c.mood === 'sad');
  assert.ok(peak.gainDb > calm.gainDb + 1.5, `energy sets the level (${peak.gainDb} vs ${calm.gainDb})`);
  // Internals: the tension run that climbs into the peak is a build-up; the reveal knows where its swell lands.
  const units = _internals.timeline(script.scenes, script.scenes.map((s) => s.dur));
  const runs = _internals.planRuns(units);
  _internals.annotateEnergy(runs, script.scenes);
  const pre = runs.find((r) => r.mood === 'tension');
  assert.ok(pre.rising, 'the run before the peak climbs');
  // Same script without energy: no breath unless the mood itself peaks (a reveal still does).
  const flat = planScore({ script: { ...script, scenes: script.scenes.map(({ energy, ...s }) => s) }, lib: styleLib, root: ROOT, genre: 'documentary', seed: 'energy' });
  assert.ok(flat.cues.some((c) => c.breath), 'a reveal is a peak even without energy marks');
});

test('music v2: cross-video history — last videos\' tracks are avoided, the theme never repeats back to back; re-runs keep their music', () => {
  const script = arcScript({ era: '1912', title: 'Titanic' });
  const a = planScore({ script, lib: styleLib, root: ROOT, genre: 'documentary', seed: 'h1' });
  const aIds = new Set(musicCues(a).map((c) => c.trackId));
  const fresh = planScore({ script, lib: styleLib, root: ROOT, genre: 'documentary', seed: 'h2' });
  const b = planScore({ script, lib: styleLib, root: ROOT, genre: 'documentary', seed: 'h2', history: [{ key: 'A', main: a.theme.id, tracks: [...aIds] }] });
  const overlap = (p) => musicCues(p).filter((c) => aIds.has(c.trackId)).reduce((s, c) => s + c.toSec - c.fromSec, 0);
  assert.notEqual(b.theme.id, a.theme.id, 'no two consecutive videos share their main theme');
  assert.ok(overlap(b) < overlap(fresh), `history pushes last video's tracks away (${overlap(b)} < ${overlap(fresh)} s)`);

  // The file: atomic, updated in place, and a re-run plans against the history it first saw.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-music-hist-'));
  const file = path.join(dir, 'docu-music-history.json');
  assert.deepEqual(AD.readMusicHistory(file), []);
  assert.ok(AD.recordMusicHistory(file, { key: 'A', title: 'A', main: a.theme.id, tracks: [...aIds], prior: [] }));
  const priorB = AD.musicHistoryFor(AD.readMusicHistory(file), 'B');
  assert.deepEqual(priorB.map((e) => e.key), ['A']);
  AD.recordMusicHistory(file, { key: 'B', main: b.theme.id, tracks: musicCues(b).map((c) => c.trackId), prior: priorB });
  AD.recordMusicHistory(file, { key: 'C', main: 'x', tracks: ['x'], prior: AD.musicHistoryFor(AD.readMusicHistory(file), 'C') });
  // B re-runs after C was made: it still sees only A, so its plan (and beat grid) is unchanged.
  assert.deepEqual(AD.musicHistoryFor(AD.readMusicHistory(file), 'B').map((e) => e.key), ['A']);
  AD.recordMusicHistory(file, { key: 'B', main: b.theme.id, tracks: ['changed'], prior: [] });
  const list = AD.readMusicHistory(file);
  assert.deepEqual(list.map((e) => e.key), ['A', 'B', 'C'], 'updated in place, order kept');
  assert.deepEqual(list[1].tracks, ['changed']);
  assert.deepEqual(list[1].prior.map((e) => e.key), ['A'], 'the first prior is kept');
  assert.ok(!fs.readdirSync(dir).some((f) => /\.tmp/.test(f)), 'no temp file left');
  // Only the last HISTORY_N other videos count.
  for (let i = 0; i < 8; i++) AD.recordMusicHistory(file, { key: `v${i}`, main: null, tracks: [] });
  assert.equal(AD.musicHistoryFor(AD.readMusicHistory(file), 'new').length, AD.HISTORY_N);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('music v2: story year from script.era — ranges, single years, wide spans', () => {
  assert.equal(AD.storyYear({ era: '1971 (the night of the hijacking; investigation 1970s-80s)' }), 1971);
  assert.equal(AD.storyYear({ era: '1929-1933 (Büyük Buhran)' }), 1931);
  assert.equal(AD.storyYear({ era: '1880-1943 (Tesla dönemi)' }), 1895, 'a life story: its early-middle years');
  assert.equal(AD.storyYear({ era: '1453 (Bizans ve Osmanlı, 15. yüzyıl)' }), 1453);
  assert.equal(AD.storyYear({ scenes: [scene({ say: 'In 1959 nine hikers set out.' })] }), 1959);
});

/* ------------------------------------------------------------ render */

test('renderScore: one file exactly totalSec long, cues levelled, silence is silence, fade-out at the end', () => {
  const plan = { cues: [
    { fromSec: 0, toSec: 10, mood: 'calm', trackId: 'quiet', startAt: 0, gainDb: 0 },
    { fromSec: 10, toSec: 14, mood: 'silence', trackId: null, startAt: 0, gainDb: null },
    { fromSec: 14, toSec: 24, mood: 'calm', trackId: 'loud', startAt: 0, gainDb: 0 },
    { fromSec: 24, toSec: 33.37, mood: 'calm', trackId: 'c1', startAt: 5, gainDb: 0 },
  ] };
  const outFile = path.join(ROOT, 'out', 'score.wav');
  const r = renderScore({ plan, lib, root: ROOT, outFile, ff: FF, totalSec: 33.37 });
  assert.equal(r.file, outFile);
  assert.ok(Math.abs(wavSeconds(outFile) - 33.37) <= 0.05, `length ${wavSeconds(outFile)}`);
  const x = pcm(outFile);
  const quiet = rmsDb(x, 2, 8);
  const loud = rmsDb(x, 16, 21);
  assert.ok(Math.abs(quiet - loud) <= 3, `cues levelled: ${quiet.toFixed(1)} vs ${loud.toFixed(1)} dB (source differs by 20 dB)`);
  assert.ok(rmsDb(x, 11, 13) < -50, 'the silence scene is silent');
  assert.ok(rmsDb(x, 23.5, 24.5) > quiet - 10, 'music -> music crossfades without a hole');
  assert.ok(rmsDb(x, 33.37 - 0.25, 33.37) < rmsDb(x, 28, 29) - 12, 'fades out at the end');
  assert.deepEqual(r.musicCues.map((m) => m.title), ['Parça quiet', 'Parça loud', 'Parça c1']);
  assert.ok(r.musicCues.every((m) => m.license === 'test' && m.artist === 'Test'));
});

test('renderScore: a planned score renders end to end (chained, cold open, silence)', () => {
  const script = {
    id: 'e2e', genre: 'documentary', scenes: [
      scene({ type: 'montage', mood: 'tension', dur: 5 }),
      scene({ type: 'title', title: 'X', dur: 4 }),
      ...Array(20).fill(0).map((_, k) => scene({ mood: k < 10 ? 'curious' : 'dread', chapter: k < 10 ? 0 : 1 })),
      scene({ mood: 'sad', chapter: 1, silence: true, dur: 3 }),
    ],
  };
  const plan = planScore({ script, lib, genre: 'documentary', seed: 'e2e' });
  const total = 5 + 4 + 100 + 3;
  const outFile = path.join(ROOT, 'out', 'e2e.wav');
  renderScore({ plan, lib, root: ROOT, outFile, ff: FF, totalSec: total });
  assert.ok(Math.abs(wavSeconds(outFile) - total) <= 0.05);
});

/* ------------------------------------------------------------ SFX pools */

test('pickSfxPools: per-style pools of loudness-normalised copies; no stinger in inspire, one in horror', () => {
  const cacheDir = path.join(ROOT, 'norm-cache');
  const inspire = pickSfxPools({ lib, root: ROOT, genre: 'inspire', seed: 's', ff: FF, cacheDir });
  const horror = pickSfxPools({ lib, root: ROOT, genre: 'horror', seed: 's', ff: FF, cacheDir });
  assert.ok(!inspire.stinger, 'a biography never gets a jump-scare');
  assert.ok(!inspire.glitch, 'nor a glitch');
  assert.ok(horror.stinger?.length, 'horror has its stinger');
  for (const pools of [inspire, horror]) {
    for (const [kind, files] of Object.entries(pools)) {
      for (const f of files) {
        assert.ok(path.isAbsolute(f) && fs.existsSync(f), `${kind}: ${f}`);
        assert.ok(f.startsWith(cacheDir), 'normalised copies, never the originals');
        assert.ok(!/radio|explosion|siren|gunshot|applause|bed-/.test(path.basename(f)), `no literal one-shot or bed in a pool: ${f}`);
      }
    }
  }
  // The two hits differ by ~9 dB at source; normalised, they land within 2 dB of each other.
  const metas = horror.hit.map(sfxMeta);
  assert.ok(metas.every((m) => m && m.kind === 'hit' && Number.isFinite(m.peakAt) && m.dur > 0));
  const lv = metas.map((m) => m.lufsMax);
  assert.ok(Math.max(...lv) - Math.min(...lv) <= 2.5, `hits levelled: ${lv}`);
  assert.ok(horror.thud?.every((f) => /hit-soft/.test(f)), 'a thud is the soft hit, not a big impact');
  assert.deepEqual(pickSfxPools({ lib, root: ROOT, genre: 'horror', seed: 's', ff: FF, cacheDir }), horror, 'deterministic, cached');
});

/* ------------------------------------------------------------ ambience */

test('ambience: consecutive scenes in one place share ONE bed, across a counter card', () => {
  const rain = 'heavy rain on the window, distant thunder';
  const script = { id: 'amb', genre: 'crime', scenes: [
    scene({ sound: rain, mood: 'tension' }),
    scene({ sound: rain, mood: 'tension' }),
    scene({ type: 'counter', mood: 'tension' }),
    scene({ sound: rain, mood: 'dread' }),
    scene({ sound: 'clinking glasses at a gala, string quartet', mood: 'calm' }),
    scene({ sound: 'clinking glasses at a gala, string quartet', mood: 'calm' }),
  ] };
  const cues = planAmbience({ script, lib, root: ROOT, genre: 'crime', seed: 'a', measure: false });
  assert.equal(cues.length, 1, JSON.stringify(cues));
  assert.equal(path.basename(cues[0].file), 'bed-rain.wav');
  assert.ok(path.isAbsolute(cues[0].file));
  assert.deepEqual([cues[0].fromScene, cues[0].toScene], [0, 3]);
  const db = 20 * Math.log10(cues[0].gain);
  assert.ok(db <= -20 && db >= -30, `bed sits low under the narration (${db.toFixed(1)} dB)`);
});

test('ambience: the bed carries a chapter change, but stops for a chapter card and before a slam', () => {
  const rain = 'rain on the window';
  const run = (mid) => planAmbience({ script: { id: 'amb4', genre: 'crime', scenes: [
    scene({ sound: rain, mood: 'tension', chapter: 0 }), scene({ sound: rain, mood: 'tension', chapter: 0 }),
    ...mid,
    scene({ sound: rain, mood: 'tension', chapter: 1 }), scene({ sound: rain, mood: 'tension', chapter: 1 }),
  ] }, lib, root: ROOT, genre: 'crime', seed: 'c', measure: false }).map((c) => [c.fromScene, c.toScene]);
  assert.deepEqual(run([]), [[0, 3]], 'same place across the chapter change: one bed');
  assert.deepEqual(run([scene({ type: 'title', chapterCard: true, title: 'Bölüm 2', chapter: 1 })]), [[0, 1], [3, 4]]);
  assert.deepEqual(run([scene({ type: 'slam', mood: 'dread', chapter: 0, dur: 3 })]), [[0, 1], [3, 4]]);
});

test('ambience: below the threshold no bed (no default filler); era, weather and "empty" are respected', () => {
  const s = (sound, say = 'Bir sahne.', extra = {}) => ({ id: 'amb2', genre: 'documentary', scenes: [scene({ sound, say, ...extra }), scene({ sound, say, ...extra })] });
  const none = (script) => planAmbience({ script, lib, root: ROOT, genre: 'documentary', seed: 'b', measure: false });
  assert.deepEqual(none(s('clinking glasses at a gala')), [], 'nothing matches: silence, not the genre default');
  assert.deepEqual(none({ ...s('busy city street, traffic'), title: '1453 kuşatması' }), [], 'no traffic in 1453');
  assert.equal(none(s('busy city street, traffic', '1974 yazı.')).length, 1, 'traffic is fine in 1974');
  assert.deepEqual(none(s('quiet cemetery, birds', 'Cenaze sessizce kalktı.')), [], 'a funeral is not rain');
  assert.deepEqual(none(s('empty stone hall at night')), [], 'an empty hall gets no crowd');
  assert.deepEqual(none(s('distant cannon fire, shouting')), [], 'cannon fire is not a campfire');
  // The narration alone never overrides a different soundscape the writer asked for.
  assert.deepEqual(none(s('quiet library, pages turning', 'Pazar yeri kalabalık, çarşı kalabalık, herkes pazarda.')), []);
  // Without any sound text, the narration may decide.
  const say = { id: 'amb3', genre: 'documentary', scenes: [scene({ say: 'Yağmur bütün gece yağdı, yağmurlu bir sabah geldi.', mood: 'sad' })] };
  assert.equal(none(say).length, 1);
});

/* ------------------------------------------------------------ events */

const ev = (scenes, genre = 'documentary', seed = 'e') => planEvents({ script: { id: 'ev', genre, scenes }, lib, root: ROOT, genre, seed, measure: false });

test('events: no literal one-shot without a literal mention', () => {
  const scenes = [
    scene({ mood: 'tension', say: 'Şirketin hisseleri bir gecede eridi.', sound: 'busy office, phones ringing' }),
    scene({ mood: 'dread', say: 'Kimse ne olacağını bilmiyordu.' }),
    scene({ mood: 'tension', say: 'Haber bomba gibi düştü.' }),
    scene({ mood: 'tension', say: 'Piyasa patladı, fiyatlar patlama yaptı.' }),
    scene({ mood: 'tension', say: 'Bomba patlamadı.' }),
    scene({ mood: 'tension', say: 'Bomba patlayabilirdi.' }),
    scene({ mood: 'dread', say: 'Hanımefendi, bende bomba var.' }),
    scene({ mood: 'tension', say: 'Polis dosyayı kapattı.', sound: 'quiet police station' }),
  ];
  assert.deepEqual(ev(scenes), []);
});

test('events: a literal mention lands on the spoken word (object + verb lands on the verb)', () => {
  const wordTimes = [{ word: 'Saat', t: 0.1 }, { word: 'dokuzda', t: 0.4 }, { word: 'bomba', t: 1.0 }, { word: 'patladı.', t: 1.6 }];
  const cues = ev([scene({ mood: 'dread', say: 'Saat dokuzda bomba patladı.', wordTimes, dur: 4 })]);
  assert.equal(cues.length, 1);
  assert.equal(path.basename(cues[0].file), 'explosion.wav');
  assert.equal(cues[0].scene, 0);
  assert.ok(Math.abs(cues[0].at - 1.6) <= 0.15, `on "patladı" (${cues[0].at})`);
  assert.ok(cues[0].gain > 0 && cues[0].gain <= 1 && cues[0].dur > 0);
  const sirens = ev([scene({ mood: 'tension', say: 'Uzaktan sirenler yaklaşıyordu.', wordTimes: [{ word: 'Uzaktan', t: 0 }, { word: 'sirenler', t: 0.9 }, { word: 'yaklaşıyordu.', t: 1.5 }] })], 'crime');
  assert.equal(path.basename(sirens[0].file), 'siren.wav');
  assert.ok(sirens[0].at < 0.9, 'a siren leads in before its word');
});

test('events: never an explosion under calm narration unless the narrator says it; never violence in inspire', () => {
  assert.deepEqual(ev([scene({ mood: 'calm', say: 'Kasaba sessizdi.', sound: 'distant explosion, birds' })]), [], 'a calm scene never gets a described explosion');
  assert.deepEqual(ev([scene({ mood: 'sad', say: 'Onu çok özlediler.', sound: 'distant explosions' })]), []);
  assert.equal(ev([scene({ mood: 'calm', say: 'Sonra cephanelik patladı.' })]).length, 1, 'literal in the narration: yes');
  assert.deepEqual(ev([scene({ mood: 'tension', say: 'Sonra cephanelik patladı.' })], 'inspire'), [], 'a biography never gets an explosion');
  assert.equal(ev([scene({ mood: 'triumph', say: 'Salon onu ayakta alkışladı.' })], 'inspire').length, 1, 'applause is fine in inspire');
  assert.deepEqual(ev([scene({ mood: 'dread', say: 'Telsizden son mesaj geldi.' })], 'inspire'), [], 'a literal-only stinger stays in its styles');
  assert.equal(ev([scene({ mood: 'dread', say: 'Telsizden son mesaj geldi.' })], 'crime').length, 1);
});

test('events: caps per video, gaps, one per scene, real killings get silence', () => {
  // Five literal explosions 40 s apart: max_per_video 2.
  const five = Array(5).fill(0).map(() => [scene({ mood: 'tension', say: 'Bir bomba daha patladı.', dur: 5 }), ...Array(7).fill(0).map(() => scene({ mood: 'tension' }))]).flat();
  assert.equal(ev(five).length, 2);
  // Two mentions 10 s apart: min_gap 30 s.
  const close = [scene({ mood: 'tension', say: 'Bomba patladı.' }), scene({ mood: 'tension' }), scene({ mood: 'tension', say: 'Bir bomba daha patladı.' })];
  assert.equal(ev(close).length, 1);
  // A scene that names a siren AND an explosion gets one sound, not two.
  const both = ev([scene({ mood: 'dread', say: 'Sirenler çalarken bomba patladı.' })], 'crime');
  assert.equal(both.length, 1);
  assert.ok(new Set(both.map((c) => c.scene)).size === both.length);
  // Gunshots: yes for shots heard; silence when a real person is killed (rulebook).
  assert.equal(ev([scene({ mood: 'tension', say: 'Gece yarısı silah sesleri duyuldu.' })], 'crime').length, 1);
  assert.deepEqual(ev([scene({ mood: 'dread', say: 'Silah sesleri... ve McCoy ölüyor.' })], 'crime'), []);
  assert.deepEqual(ev([scene({ mood: 'dread', say: 'Onu tabancayla vurdu.' })], 'crime'), []);
  // Era: no police siren in 1453.
  assert.deepEqual(planEvents({ script: { id: 'x', genre: 'crime', title: '1453', scenes: [scene({ mood: 'tension', say: 'Sirenler yükseldi.' })] }, lib, root: ROOT, genre: 'crime', seed: 'e', measure: false }), []);
});

test('ambience and events are deterministic by seed and use absolute paths', () => {
  const script = { id: 'det', genre: 'crime', scenes: [
    scene({ sound: 'rain on the window', mood: 'tension' }),
    scene({ sound: 'rain on the window', mood: 'tension', say: 'Uzaktan bir siren sesi geldi.' }),
    scene({ sound: 'busy office, typewriter', mood: 'curious', say: '1971 yılı.' }),
  ] };
  const a1 = planAmbience({ script, lib, root: ROOT, genre: 'crime', seed: 'q', measure: false });
  const a2 = planAmbience({ script, lib, root: ROOT, genre: 'crime', seed: 'q', measure: false });
  assert.deepEqual(a1, a2);
  const e1 = planEvents({ script, lib, root: ROOT, genre: 'crime', seed: 'q', measure: false });
  assert.deepEqual(e1, planEvents({ script, lib, root: ROOT, genre: 'crime', seed: 'q', measure: false }));
  for (const c of [...a1, ...e1]) assert.ok(path.isAbsolute(c.file) && fs.existsSync(c.file));
  // Measured (the default): levels come from the files themselves and stay in range.
  const measured = planAmbience({ script, lib, root: ROOT, genre: 'crime', seed: 'q', ff: FF });
  assert.equal(measured.length, a1.length);
  for (const c of measured) assert.ok(c.gain > 0 && c.gain <= 1);
});

/* ======================================================= sound craft (mix) */

const TL = await import('../docu-engine/src/timeline.js');
const SC = await import('../docu-engine/lib/sound-craft.mjs');

/** Placed slots from scene lengths in seconds (no beats), like placeTimeline. */
const slots = (secs, fps = 30) => {
  let at = 0;
  return secs.map((s) => {
    const p = { from: at, frames: Math.round(s * fps) };
    at += p.frames;
    return p;
  });
};
/* RMS (dB) of one channel of a file between a and b seconds. */
function chDb(file, c, a, b) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', file, '-af', `pan=mono|c0=c${c}`, '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28, windowsHide: true });
  return rmsDb(new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 1), a, b);
}

test('J/L cuts: the next place is heard 0.5-0.8 s before its cut, the old one lingers ~0.5 s, equal power', () => {
  const fps = 30;
  const scenes = [scene({ mood: 'tension' }), scene({ mood: 'tension' }), scene({ mood: 'tension' }), scene({ mood: 'sad', chapter: 1 }), scene({ mood: 'sad', chapter: 1 })];
  const placed = slots([5, 5, 5, 5, 5]);
  const beds = [{ fromScene: 0, toScene: 1 }, { fromScene: 2, toScene: 2 }, { fromScene: 4, toScene: 4 }];
  const [a, b, c] = TL.bedWindows({ placed, scenes, beds, fps });
  // a -> b meet on the cut at 10 s: one shared window, J before and L after the cut.
  const cut = placed[2].from;
  assert.equal(a.outA, b.inA);
  assert.equal(a.outB, b.inB);
  const J = (cut - b.inA) / fps;
  const L = (b.inB - cut) / fps;
  assert.ok(J >= 0.5 && J <= 0.8, `J-cut lead ${J}`);
  assert.ok(Math.abs(L - 0.5) < 0.05, `L-cut tail ${L}`);
  for (let f = b.inA; f < b.inB; f++) {
    const p = TL.bedGainAt(a, f) ** 2 + TL.bedGainAt(b, f) ** 2;
    assert.ok(Math.abs(p - 1) < 0.02, `equal power at ${f}: ${p}`);
  }
  assert.ok(TL.bedGainAt(b, cut - 3) > 0 && TL.bedGainAt(a, cut + 3) > 0, 'both rooms are heard across the cut');
  // A bed after a gap (b ends at 15 s, c starts at 20 s): c starts before its cut, b tails after its end.
  assert.ok(c.inA < placed[4].from, 'isolated bed: J-cut in');
  assert.ok(b.outB > placed[3].from && b.outB - placed[3].from <= Math.round(0.5 * fps) + 1, 'isolated bed: L-cut out');
  assert.equal(TL.bedGainAt(c, c.inA - 1), 0);
  assert.equal(placed[4].from - c.inA, Math.round(0.65 * fps), 'plain cut: 0.65 s lead');
  // A chapter / mood turn gets the longer lead.
  const turn = TL.bedWindows({ placed, scenes, beds: [{ fromScene: 3, toScene: 3 }], fps })[0];
  assert.equal(placed[3].from - turn.inA, Math.round(0.8 * fps), 'chapter + mood turn: 0.8 s lead');
  // Never more than half the shot before the cut.
  const short = TL.bedWindows({ placed: slots([0.6, 5]), scenes: [scene(), scene({ mood: 'dread' })], beds: [{ fromScene: 1, toScene: 1 }], fps })[0];
  assert.ok(short.cutIn - short.inA <= 9, 'lead capped by a short previous shot');
});

test('stop-down: ~1 s of true silence before a slam word, the swell comes back on the hit; beds drop out too', () => {
  const fps = 30;
  const scenes = [
    scene({ mood: 'tension', voiceDur: 3, dur: 4 }),
    scene({ type: 'slam', mood: 'dread', word: 'X', dur: 4, say: 'Kayboldu.', voiceDur: 1, wordTimes: [{ word: 'Kayboldu.', t: 1 }] }),
    scene({ mood: 'dread', dur: 5, say: undefined }),
  ];
  const placed = slots([4, 4, 5]);
  const hits = [{ scene: 1, f: 30 }];
  const env = TL.musicEnvelope({ placed, scenes, fps, hits });
  const hit = placed[1].from + 30;
  for (let f = hit - 30; f < hit; f++) assert.equal(env[f], 0, `true silence at ${f - hit}`);
  assert.ok(env[hit - 36] > 0, 'the stop starts ~1.2 s before the word, not earlier');
  assert.ok(env[hit + 5] >= 0.45, `swell on the hit (${env[hit + 5]})`);
  const amb = TL.ambienceEnvelope({ placed, scenes, fps, hits });
  for (let f = hit - 28; f < hit + 12; f++) assert.equal(amb[f], 0, 'the room is empty around the slam');
  assert.ok(amb[hit + 12 + 45] > 0.9 * TL.MIX.ambienceDuck, 'beds are back 1.5 s after the hit');
  // The slam's own hit starts right at its peak (no 1 s trailer build filling the hole).
  const sfxCues = TL.planSfx({ placed: placed.map((p) => ({ ...p, transition: 'cut' })), scenes, fps, genre: 'documentary', marks: [{}, { slam: 30 }, {}] });
  assert.ok(sfxCues.find((c) => c.key === 's1')?.tight, 'slam hit is tight');
  // The logo: the score starts under it at half level and opens up.
  const withLogo = TL.musicEnvelope({ placed, scenes, fps, hits, logo: true });
  const plain = TL.musicEnvelope({ placed, scenes, fps, hits });
  assert.ok(withLogo[0] <= plain[0] * 0.55 && Math.abs(withLogo[60] - plain[60]) < 1e-6);
});

test('foley: at most one moment per 1.2 s, none in a slam hole or on a hit, same-kind spacing', () => {
  const fps = 30;
  const scenes = Array(8).fill(0).map((_, i) => scene({ type: i === 4 ? 'slam' : 'photo', mood: 'tension', dur: 3, say: 'Söz.', voiceDur: 1.5 }));
  const placed = slots(Array(8).fill(3));
  const wants = [];
  // Every scene asks for a card landing (shutter + pin) at 0.23 s and paper at 0.6 s; a pen draws in scene 2.
  placed.forEach((_, i) => {
    wants.push({ scene: i, f: 7, kind: 'shutter', align: 'peak', group: 'c' }, { scene: i, f: 12, kind: 'pin', align: 'peak', group: 'c' });
    wants.push({ scene: i, f: 18, kind: 'paper' });
  });
  wants.push({ scene: 2, f: 40, kind: 'pen', dur: 30 });
  const hits = [{ scene: 4, f: 30 }];
  const sfxCues = [{ kind: 'hit', at: placed[6].from + 7 }];
  const cues = TL.planFoley({ placed, scenes, fps, wants, hits, sfx: sfxCues });
  assert.ok(cues.length > 3, JSON.stringify(cues));
  // A shutter and its pin are one moment; moments keep 1.2 s apart.
  const starts = cues.filter((c) => c.kind !== 'pin').map((c) => c.at).sort((x, y) => x - y);
  for (let k = 1; k < starts.length; k++) assert.ok(starts[k] - starts[k - 1] >= 36, `moments ${starts[k - 1]} -> ${starts[k]}`);
  for (const c of cues.filter((x) => x.kind === 'pin')) assert.ok(cues.some((s) => s.kind === 'shutter' && s.at === c.at - 5), 'a pin only with its card');
  const hole = [placed[4].from + 30 - 35 - 6, placed[4].from + 30 + 12 + 18];
  for (const c of cues) assert.ok(c.at < hole[0] || c.at >= hole[1], `no foley in the slam hole (${c.kind} at ${c.at})`);
  for (const c of cues) assert.ok(Math.abs(c.at - sfxCues[0].at) >= 9, 'no foley on a hit');
  const shutters = cues.filter((c) => c.kind === 'shutter').map((c) => c.at);
  for (let k = 1; k < shutters.length; k++) assert.ok(shutters[k] - shutters[k - 1] >= 150, 'a shutter at most every 5 s');
  const pen = cues.find((c) => c.kind === 'pen');
  if (pen) assert.equal(pen.dur, 30, 'the pen runs as long as the route draws');
  assert.deepEqual(TL.planFoley({ placed, scenes, fps, wants, hits, sfx: sfxCues }), cues, 'deterministic');
});

test('whooshes travel with their transition: a whip passes right to left, a zoom stays centred', () => {
  assert.equal(TL.whooshPan('whip', 3), 'rl');
  assert.equal(TL.whooshPan('zoom', 3), undefined);
  assert.ok(['lr', 'rl'].includes(TL.whooshPan('flash', 3, 's')));
  const scenes = [scene(), scene({ mood: 'dread', transition: 'whip' }), scene({ mood: 'curious' })];
  const placed = slots([5, 5, 5]).map((p, i) => ({ ...p, transition: ['cut', 'whip', 'cut'][i] }));
  const cues = TL.planSfx({ placed, scenes, fps: 30, genre: 'documentary', marks: [{}, {}, {}] });
  assert.equal(cues.find((c) => c.kind === 'whoosh')?.pan, 'rl');
});

test('music: a chapter card is a button — the old cue stops ON the cut, the new one enters after the hit', () => {
  const script = { id: 'btn', genre: 'documentary', scenes: [
    ...Array(6).fill(0).map(() => scene({ mood: 'curious', chapter: 0 })),
    scene({ type: 'title', chapterCard: true, title: 'Bölüm 2', chapter: 1, dur: 3, say: undefined }),
    ...Array(6).fill(0).map(() => scene({ mood: 'tension', chapter: 1 })),
  ] };
  const plan = planScore({ script, lib, genre: 'documentary', seed: 'btn' });
  const card = plan.cues.find((c) => c.fromSec === 30);
  assert.ok(card?.button, `the cue at the card is a button: ${JSON.stringify(plan.cues)}`);
  assert.ok(!plan.cues[0].button);
  const outFile = path.join(ROOT, 'out', 'button.wav');
  renderScore({ plan, lib, root: ROOT, outFile, ff: FF, totalSec: 63 });
  const x = pcm(outFile);
  const before = rmsDb(x, 28, 29.6);
  assert.ok(rmsDb(x, 30.15, 30.4) < before - 20, `stopped on the cut (${rmsDb(x, 30.15, 30.4).toFixed(1)} vs ${before.toFixed(1)})`);
  assert.ok(rmsDb(x, 31.5, 33) > before - 6, 'the new chapter music is in by 1.5 s');
});

test('renderScore: cue changes move onto the picture cuts, each track keeps its clock', () => {
  const plan = { cues: [
    { fromSec: 0, toSec: 20, mood: 'calm', trackId: 'c1', startAt: 4, gainDb: 0 },
    { fromSec: 20, toSec: 40, mood: 'calm', trackId: 'c2', startAt: 10, gainDb: 0 },
  ] };
  const plain = renderScore({ plan, lib, root: ROOT, outFile: path.join(ROOT, 'out', 'cut0.wav'), ff: FF, totalSec: 40 });
  const moved = renderScore({ plan, lib, root: ROOT, outFile: path.join(ROOT, 'out', 'cut1.wav'), ff: FF, totalSec: 40, cuts: [9.9, 20.3, 31] });
  assert.equal(moved.cues[1].fromSec, 20.3, 'the change lands on the cut 0.3 s later');
  assert.equal(moved.cues[0].toSec, 20.3);
  // Same moment of the track at the same video time: the entry point moved with the boundary.
  assert.ok(Math.abs(moved.cues[1].startAt - (plain.cues[1].startAt + 0.3)) < 0.01, `${plain.cues[1].startAt} -> ${moved.cues[1].startAt}`);
  assert.equal(plan.cues[1].fromSec, 20, 'the plan itself is not changed');
  // A cut too far away (1 s) is not a reason to move.
  const far = renderScore({ plan, lib, root: ROOT, outFile: path.join(ROOT, 'out', 'cut2.wav'), ff: FF, totalSec: 40, cuts: [21] });
  assert.equal(far.cues[1].fromSec, 20);
});

test('music: a chain never switches tracks mid-word — outside a line, else in a pause', () => {
  const { speechMap, quietPoint } = _internals;
  const w = (list) => list.map(([word, t]) => ({ word, t }));
  const scenes = [
    scene({ dur: 10, voiceDur: 9, say: 'a b c d', wordTimes: w([['Bir', 0.2], ['iki', 0.6], ['üç', 4.0], ['dört', 4.4]]) }),
    scene({ dur: 10, voiceDur: 3, say: 'x', wordTimes: w([['Son', 0.3]]) }),
  ];
  const sp = speechMap(scenes, [10, 10]);
  assert.deepEqual(sp.busy, [[0.2, 9], [10.3, 13]]);
  const q = quietPoint(sp, 12, 18);
  assert.ok(q >= 13.1 && q <= 18, `after the line (${q})`);
  const p = quietPoint(sp, 1, 3.5);
  assert.ok(p > 0.81 && p < 4.0, `in the pause between "iki" and "üç" (${p})`);
});

test('events: a word right after a cut pre-laps its sound; never back into a slam; the place gives the space', () => {
  const wt = [{ word: 'Sirenler', t: 0.05 }, { word: 'yükseldi.', t: 0.6 }];
  const cues = ev([scene({ mood: 'tension', say: 'Önce sessizlik.', dur: 4 }), scene({ mood: 'tension', say: 'Sirenler yükseldi.', wordTimes: wt, sound: 'a dark tunnel under the city' })], 'crime');
  assert.equal(cues.length, 1);
  assert.ok(cues[0].at < 0 && cues[0].at >= -0.8 && cues[0].prelap, `pre-lap across the cut (${cues[0].at})`);
  assert.equal(cues[0].space, 'cave', 'a tunnel is a cave-like space');
  const afterSlam = ev([scene({ type: 'slam', word: 'X', mood: 'dread', dur: 4 }), scene({ mood: 'tension', say: 'Sirenler yükseldi.', wordTimes: wt })], 'crime');
  assert.ok(afterSlam[0].at >= 0, 'nothing leaks back into a slam');
  assert.equal(SC.spaceOfText('Geminin ambarında'), 'ship');
  assert.equal(SC.spaceOfText('Topkapı Sarayında bir gece'), 'hall');
  assert.equal(SC.spaceOfText('dağıtım şirketi'), null, 'a word that only starts like a place is not one');
});

test('foley + sonic logo: synthesized once into the library, levelled far under the voice, era and style gated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-foley-lib-'));
  fs.mkdirSync(path.join(root, 'sfx'), { recursive: true });
  const shutterFile = noiseHit('sfx/snap-vintage-shutter.wav', 40, 0.6, 0.4);
  fs.copyFileSync(path.join(ROOT, shutterFile), path.join(root, shutterFile));
  const own = sfx({ id: 'shutter', kind: 'snap', slug: 'snap-vintage-shutter', title: 'Vintage camera shutter', file: shutterFile, keywords: ['photo', 'shutter'] });
  fs.writeFileSync(path.join(root, 'library.json'), JSON.stringify({ version: 1, music: [], sfx: [own] }));
  const cacheDir = path.join(root, '.cache');
  const r = AD.ensureFoley({ lib: loadLibrary(root), root, genre: 'crime', year: 1971, ff: FF, cacheDir });
  for (const k of ['paper', 'pen', 'shutter', 'pin', 'type', 'page']) assert.ok(r.pools[k]?.length >= 3, `${k}: ${r.pools[k]?.length}`);
  assert.ok(r.pools.shutter.some((f) => /snap-vintage-shutter/.test(f)), 'the library\'s real shutter is used first');
  for (const [k, files] of Object.entries(r.pools)) {
    for (const f of files) {
      const m = sfxMeta(f);
      assert.ok(m && m.dur > 0 && Number.isFinite(m.peakAt), f);
      assert.ok(m.lufsMax <= -35 && m.lufsMax >= -48, `${k} sits ~20-26 dB under the voice peaks (${m.lufsMax})`);
      assert.ok(f.startsWith(cacheDir));
    }
  }
  assert.ok(r.logo && fs.existsSync(r.logo.file) && Math.abs(r.logo.dur - 2.2) < 0.1, 'a ~2 s sonic logo');
  const disk = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));
  const made = disk.sfx.filter((s) => String(s.sourceId).startsWith('nova-synth:'));
  assert.equal(made.length, 6 * 3 + 1, 'every synthesized sound is saved into the library');
  assert.ok(made.every((s) => (s.kind === 'foley' || s.kind === 'logo') && s.keywords.length === 0 && s.literal_only === false));
  // Idempotent: nothing is made twice.
  AD.ensureFoley({ lib: loadLibrary(root), root, genre: 'crime', year: 1971, ff: FF, cacheDir });
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8')).sfx.length, disk.sfx.length);
  // Era and style gates.
  assert.ok(!AD.ensureFoley({ lib: loadLibrary(root), root, genre: 'epic', year: 1453, ff: FF, cacheDir }).pools.shutter, 'no shutter in 1453');
  assert.ok(!AD.ensureFoley({ lib: loadLibrary(root), root, genre: 'epic', year: 1950, ff: FF, cacheDir }).pools.type, 'no typewriter in an epic');
  // Foley entries are never literal events or transition sounds.
  const withFoley = loadLibrary(root);
  assert.deepEqual(planEvents({ script: { id: 'k', genre: 'crime', scenes: [scene({ mood: 'tension', say: 'Kâğıt hışırdadı, kalem yazdı, sayfa çevrildi.' })] }, lib: withFoley, root, genre: 'crime', seed: 'k', measure: false }), []);
  const pools = pickSfxPools({ lib: withFoley, root, genre: 'crime', seed: 'k', ff: FF, cacheDir: path.join(root, '.pools') });
  for (const files of Object.values(pools)) for (const f of files) assert.ok(!/foley|logo/.test(path.basename(f)), f);
  fs.rmSync(root, { recursive: true, force: true });
});

test('sound craft: narration chain on -19 LUFS under -1 dBTP with light compression; pan, width and space keep level', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-craft-'));
  // A speech-like test line: syllables of a buzzy 140 Hz voice, loud and soft words, gaps.
  const line = path.join(dir, 'line.wav');
  ff(['-f', 'lavfi', '-i', 'aevalsrc=exprs=(0.25+0.2*gt(sin(2*PI*0.7*t)\\,0))*gt(sin(2*PI*3.1*t)\\,-0.3)*(sin(2*PI*140*t)+0.5*sin(2*PI*280*t)+0.3*sin(2*PI*2900*t)+0.1*(random(0)*2-1)):s=44100:d=6', '-ac', '1', line]);
  const out = path.join(dir, 'line-v.wav');
  const r = SC.processVoice({ bin: FF, src: line, dst: out, target: -19 });
  const m = SC.measure(FF, out);
  assert.ok(Math.abs(m.I - -19) <= 0.6, `-19 LUFS (${m.I})`);
  assert.ok(m.TP <= -1.0, `true peak ${m.TP}`);
  const noComp = SC.voiceChain().split(',').filter((x) => !x.startsWith('acompressor')).join(',');
  const pre = (-19 - r.before.I).toFixed(2);
  const gr = SC.measure(FF, line, `aresample=48000,volume=${pre}dB,${noComp}`).I - SC.measure(FF, line, `aresample=48000,volume=${pre}dB,${SC.voiceChain()}`).I;
  assert.ok(gr >= 0.3 && gr <= 4, `bus-style compression, not squashing (${gr.toFixed(2)} dB)`);
  assert.ok(m.LRA === null || r.before.LRA === null || m.LRA <= r.before.LRA + 0.5, 'the chain never widens the loudness range');
  const produceSrc = fs.readFileSync(new URL('../docu-engine/lib/produce.mjs', import.meta.url), 'utf8');
  assert.match(produceSrc, /const VOICE_NORM = `n2\$\{VOICE_CHAIN_VERSION\}`/, 'the chain version is part of the cached voice tag');

  // A whoosh-like burst panned left to right: left louder before its peak, right louder after.
  const wsrc = path.join(dir, 'w.wav');
  ff(['-f', 'lavfi', '-i', 'aevalsrc=exprs=0.5*(random(0)*2-1)*exp(-((t-0.5)/0.25)^2):s=48000:d=1', '-ac', '2', wsrc]);
  const lr = SC.panVariant({ bin: FF, src: wsrc, dir: 'lr', peakAt: 0.5, outDir: dir });
  assert.ok(chDb(lr, 0, 0.2, 0.4) > chDb(lr, 1, 0.2, 0.4) + 3 && chDb(lr, 1, 0.6, 0.8) > chDb(lr, 0, 0.6, 0.8) + 3, 'travels left to right');
  assert.ok(Math.abs(SC.measure(FF, lr).I - SC.measure(FF, wsrc).I) < 1.5, 'same loudness as the centred file');

  // A mono bed widened: same loudness, a real side signal, and it folds back to mono cleanly.
  const bsrc = path.join(dir, 'bed.wav');
  ff(['-f', 'lavfi', '-i', 'aevalsrc=exprs=0.1*(random(0)*2-1):s=48000:d=6', '-ac', '2', bsrc]);
  const wide = SC.widenBed({ bin: FF, src: bsrc, outDir: dir });
  assert.ok(Math.abs(SC.measure(FF, wide).I - SC.measure(FF, bsrc).I) < 0.6, 'level-matched');
  const side = SC.measure(FF, wide, 'pan=mono|c0=0.5*c0-0.5*c1').I;
  const mid = SC.measure(FF, wide, 'pan=mono|c0=0.5*c0+0.5*c1').I;
  assert.ok(side !== null && side < mid - 6 && side > mid - 20, `gentle width (side ${side} vs mid ${mid})`);
  assert.ok(Math.abs(mid - SC.measure(FF, bsrc, 'pan=mono|c0=0.5*c0+0.5*c1').I) < 1, 'mono-compatible');

  // An event in a cave: a longer tail, the same loudest moment.
  const esrc = path.join(dir, 'boom.wav');
  ff(['-f', 'lavfi', '-i', 'aevalsrc=exprs=0.8*(random(0)*2-1)*exp(-t*9):s=48000:d=1', '-ac', '2', esrc]);
  const sp = SC.applySpace({ bin: FF, src: esrc, space: 'cave', outDir: dir });
  assert.ok(sp && wavSeconds(sp.file) >= 1 + SC.SPACES.cave.tail - 0.05, 'the tail is kept');
  assert.ok(Math.abs(SC.measure(FF, sp.file).maxM - SC.measure(FF, esrc).maxM) < 1, 'level-matched to the dry hit');
  assert.ok(rmsDb(pcm(sp.file), 1.2, 1.6) > -65, `the cave rings on after the hit (${rmsDb(pcm(sp.file), 1.2, 1.6).toFixed(1)} dB)`);
  assert.equal(SC.applySpace({ bin: FF, src: esrc, space: 'cave', outDir: dir }).file, sp.file, 'cached');
  fs.rmSync(dir, { recursive: true, force: true });
});

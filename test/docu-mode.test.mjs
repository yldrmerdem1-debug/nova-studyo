// Sinematik Belgesel modu: form ↔ iş ↔ motor sözleşmesi.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { newJobFromRequest, renderPolicyVersions } = await import('../src/pipeline/index.js');
const { productionMode, isDocu, isGenerated, selectProductionMode, aiAllowance } = await import('../public/production-modes.js');
const { novaView, cleanScene, stripTags, docuPlan } = await import('../src/pipeline/docu-script.js');
const { runDocuEngine, docuMissingKeys, DOCU_ENGINE_VERSION } = await import('../src/pipeline/docu.js');
const { validScript } = await import('../src/pipeline/checkpoints.js');
const { ProcKiller } = await import('../src/util.js');

const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'docu-engine/videos/belgesel.json'), 'utf8'));

test('docu is its own production mode and never borrows AI budgets or collage costs', () => {
  const form = { visualStyle: 'kolaj', mediaKind: 'mixed', aiButce: 7 };
  selectProductionMode(form, 'docu');
  assert.equal(productionMode(form), 'docu');
  assert.ok(isDocu(form));
  assert.ok(!isGenerated(form));
  assert.equal(form.visualStyle, 'editorial', 'leaving kolaj restores a stock visual style');
  assert.equal(aiAllowance(form), 0);
  selectProductionMode(form, 'mixed');
  assert.equal(productionMode(form), 'mixed');
});

test('a docu job keeps its mode, and its render key carries the engine version', () => {
  const job = newJobFromRequest({ topic: 'Bir tarifin hikâyesi', mediaKind: 'docu', visualStyle: 'hareket' });
  assert.equal(job.mediaKind, 'docu', 'hareket must not force docu into image mode');
  assert.ok(renderPolicyVersions(job).includes(DOCU_ENGINE_VERSION));
  assert.ok(!renderPolicyVersions({ mediaKind: 'mixed' }).includes(DOCU_ENGINE_VERSION));
});

test('a ready-made docu script (the sample video) seeds the job instead of being rewritten', () => {
  const job = newJobFromRequest({ topic: '', mediaKind: 'docu', docuScript: SAMPLE });
  assert.equal(job.docuSeed.scenes.length, SAMPLE.scenes.length);
  assert.equal(job.docuSeed.id, undefined, 'the job id replaces the source id');
  assert.equal(job.docuSeed.seedKey, 'belgesel', 'but the source id stays the image/SFX seed, so the sample looks the same');
  assert.ok(job.topic, 'topic falls back to the script title');
  const plain = newJobFromRequest({ topic: 'x', mediaKind: 'mixed', docuScript: SAMPLE });
  assert.equal(plain.docuSeed, undefined, 'only docu jobs accept a docu script');
});

test('the Nova view of a docu script passes the resume/SEO contract and hides performance tags', () => {
  const view = novaView({ ...SAMPLE, chapters: ['Giriş'], scenes: SAMPLE.scenes.map((s) => ({ ...s, chapter: 0 })) });
  assert.ok(validScript(view));
  const texts = view.sections.flatMap((s) => s.segments.map((g) => g.text));
  assert.equal(texts.length, SAMPLE.scenes.filter((s) => s.say).length);
  assert.ok(texts.every((t) => !/\[|\]/.test(t)), 'no [whispers] in subtitles/SEO text');
  assert.equal(stripTags('[whispers] Bir tarif... [dramatic] Ve bir ihanet.'), 'Bir tarif... Ve bir ihanet.');
});

test('model output is cleaned: empty strings and false flags never reach the engine', () => {
  const s = cleanScene({ type: 'photo', mood: 'sad', say: 'x', dur: 99, imagePrompt: 'p', kicker: '', depth: false, silence: true, transition: '', imagePrompts: [{ prompt: 'a', cast: [] }, { prompt: 'b', cast: ['hasan'] }] }, 2);
  assert.equal(s.chapter, 2);
  assert.equal(s.dur, 12, 'scene length is clamped');
  assert.ok(!('kicker' in s) && !('depth' in s) && !('transition' in s));
  assert.equal(s.silence, true);
  assert.deepEqual(s.imagePrompts, ['a', { prompt: 'b', cast: ['hasan'] }]);
});

test('scene budget scales with length: a 10 minute video is ~130 scenes over ~6 chapters, words planned with 7% headroom', () => {
  const p = docuPlan({ durationPreset: 'uzunformat', language: 'tr' });
  assert.equal(p.words, 1284, '10 min × 120 wpm × 1.07 — the 10 dk preset must land above 10:00, not on it');
  assert.ok(p.scenes >= 120 && p.scenes <= 140, String(p.scenes));
  assert.ok(p.chapters >= 5 && p.chapters <= 8, String(p.chapters));
  assert.ok(p.scenesRange[0] < p.scenesPerChapter && p.scenesRange[1] > p.scenesPerChapter, 'scenes are a range, words the hard target');
  assert.equal(docuPlan({ durationPreset: 'test', language: 'tr' }).chapters, 1);
});

test('missing keys are named, so the user knows exactly what to add', () => {
  assert.deepEqual(docuMissingKeys({ anthropicKey: 'a', elevenKey: '', replicateKey: '' }), ['ElevenLabs', 'OpenAI (GPT Image) veya Replicate']);
  assert.deepEqual(docuMissingKeys({ anthropicKey: 'a', elevenKey: 'e', openaiKey: 'o' }), [], 'GPT Image alone is enough for pictures');
  assert.deepEqual(docuMissingKeys({ anthropicKey: 'a', elevenKey: 'e', replicateKey: 'r' }), []);
  assert.deepEqual(docuMissingKeys({ elevenKey: 'e', replicateKey: 'r' }, { seeded: true }), [], 'a ready script needs no script writer');
});

/* The engine runs as a child process speaking JSON lines. A fake engine proves
 * the protocol: logs and progress stream through, non-JSON lines are kept as
 * logs, keys travel only in the environment, and a failure surfaces its message. */
function fakeEngine(body) {
  const res = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-res-'));
  fs.mkdirSync(path.join(res, 'docu-engine', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(res, 'docu-engine', 'bin', 'nova-run.mjs'), body);
  return res;
}

test('engine protocol: events stream through, keys stay out of the spec file', async () => {
  const res = fakeEngine(`
    import fs from 'node:fs';
    const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const say = (o) => console.log(JSON.stringify(o));
    say({ type: 'log', msg: 'görsel: test' });
    console.log('Downloading from: https://example');
    say({ type: 'progress', stage: 'images', pct: 20 });
    say({ type: 'progress', stage: 'render', pct: 80 });
    fs.writeFileSync(spec.output, 'mp4');
    say({ type: 'done', output: spec.output, durationSec: 12.5, keysSeen: [process.env.NOVA_ELEVEN_KEY, process.env.NOVA_REPLICATE_KEY], specHasKey: JSON.stringify(spec).includes('secret') });
  `);
  const prev = process.resourcesPath;
  process.resourcesPath = res;
  try {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-work-'));
    const logs = [];
    const progress = [];
    const done = await runDocuEngine({
      scriptPath: path.join(work, 's.json'), workDir: work, output: path.join(work, 'out.mp4'),
      settings: { elevenKey: 'secret-e', replicateKey: 'secret-r', ffmpegPath: 'ffmpeg', concurrency: 2 },
      killer: new ProcKiller(), onLog: (m) => logs.push(m), onProgress: (s, p) => progress.push([s, p]),
    });
    assert.equal(done.durationSec, 12.5);
    assert.deepEqual(done.keysSeen, ['secret-e', 'secret-r']);
    assert.equal(done.specHasKey, false, 'API keys must never be written to disk');
    assert.ok(logs.includes('görsel: test'));
    assert.ok(logs.some((l) => l.startsWith('Downloading from')), 'non-JSON lines are logged, not dropped');
    assert.deepEqual(progress, [['images', 20], ['render', 80]]);
  } finally {
    process.resourcesPath = prev;
  }
});

test('engine protocol: an engine error becomes the job error', async () => {
  const res = fakeEngine(`console.log(JSON.stringify({ type: 'error', msg: 'Replicate 402: bakiye yetersiz' })); process.exit(1);`);
  const prev = process.resourcesPath;
  process.resourcesPath = res;
  try {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-work-'));
    await assert.rejects(
      runDocuEngine({ scriptPath: 'x', workDir: work, output: path.join(work, 'o.mp4'), settings: { elevenKey: 'e', replicateKey: 'r' }, killer: new ProcKiller() }),
      /Replicate 402: bakiye yetersiz/,
    );
  } finally {
    process.resourcesPath = prev;
  }
});

test('subtitle/chapter timeline mirrors the composition (Engine.place uses the shared timeline.js)', async () => {
  const engineSrc = fs.readFileSync(path.join(ROOT, 'docu-engine/src/Engine.tsx'), 'utf8');
  const placeSrc = engineSrc.slice(engineSrc.indexOf('export function place'), engineSrc.indexOf('export function totalFrames'));
  assert.ok(placeSrc.includes('placeTimeline'), 'Engine.place must take its timing from src/timeline.js, the module Node shares');
  const { placeTimeline, TIMING } = await import('../docu-engine/src/timeline.js');
  assert.equal(TIMING.tail, 0.4, 'docu-script.js SCENE_PAD estimates the same breath after each line');
  const { placeScenes, buildSrt, chapterTimes } = await import('../docu-engine/lib/produce.mjs');
  const script = {
    title: 'T', chapters: ['A', 'B'], beats: [3.2, 6.0],
    scenes: [
      { dur: 3, voiceDur: 2.5, chapter: 0, wordTimes: [{ word: '[whispers]', t: 0 }, { word: 'Bir', t: 0.1 }, { word: 'tarif...', t: 0.5 }, { word: 'Ve', t: 1.2 }, { word: 'ihanet.', t: 1.6 }] },
      { dur: 2, voiceDur: 1.0, chapter: 1, wordTimes: [{ word: 'Son.', t: 0.2 }] },
    ],
  };
  const placed = placeScenes(script);
  assert.deepEqual(placed, placeTimeline(script.scenes, 30, script.beats), 'subtitles (Node) and picture (composition) place scenes identically');
  assert.deepEqual(placed[0], { from: 0, frames: 96 }, 'first boundary snaps from 3.0s onto the 3.2s beat');
  assert.equal(placed[1].from, 96);
  const srt = buildSrt(script, placed);
  assert.ok(!srt.includes('whispers'));
  assert.match(srt, /00:00:00,100 --> 00:00:01,200\nBir tarif…/);
  assert.match(srt, /00:00:03,400 --> /, 'second scene cue starts at its placed frame');
  assert.deepEqual(chapterTimes(script, placed), [{ start: 0, title: 'A' }, { start: 3.2, title: 'B' }]);
});

test('every edit style Claude may pick is fully defined in the engine (look, fonts, transitions, music, SFX flavour)', async () => {
  const { DOCU_GENRES } = await import('../src/pipeline/docu-script.js');
  const genresSrc = fs.readFileSync(path.join(ROOT, 'docu-engine/src/genres.ts'), 'utf8');
  const engineSrc = fs.readFileSync(path.join(ROOT, 'docu-engine/src/Engine.tsx'), 'utf8');
  const produceSrc = fs.readFileSync(path.join(ROOT, 'docu-engine/lib/produce.mjs'), 'utf8');
  const fontsSrc = fs.readFileSync(path.join(ROOT, 'docu-engine/src/fonts.ts'), 'utf8');
  assert.equal(DOCU_GENRES.length, 7);
  for (const { id } of DOCU_GENRES) {
    const block = genresSrc.slice(genresSrc.indexOf(`  ${id}: {`));
    assert.ok(genresSrc.includes(`  ${id}: {`), `genres.ts: ${id}`);
    assert.match(block, /look: '(label|glow|terminal)'/, `${id}: look`);
    const own = block.slice(0, block.indexOf('\n  },') + 5);
    for (const k of ['hit', 'whoosh', 'riser', 'ticks', 'glitch', 'swell', 'snap']) assert.ok(own.includes(`      ${k}: '`), `${id}: sfx ${k}`);
    const headline = own.match(/headline: '(\w+)'/)[1];
    const body = own.match(/body: '(\w+)'/)[1];
    for (const f of [headline, body]) {
      assert.ok(fontsSrc.includes(`\n  ${f}: load`), `${id}: font ${f} loaded`);
      assert.ok(fontsSrc.includes(`\n  ${f}: 0.`), `${id}: font ${f} has a measured cap width`);
    }
    assert.ok(engineSrc.includes(`\n  ${id}: [`), `Engine TRANSITION_SET: ${id}`);
    assert.equal(produceSrc.split(`\n    ${id}: [`).length - 1, 2, `${id}: both music styles and SFX flavours`);
  }
});

test('archive picker never accepts another numbered mission/event, and falls back to a simpler query', async () => {
  const { numberedNameConflict, simplerQuery } = await import('../src/pipeline/docu-archive.js');
  // Measured on the Apollo 13 test: the vision model picked "The Apollo 17 Command Module" for the Apollo 13 splashdown.
  assert.equal(numberedNameConflict('Apollo 13 splashdown parachutes', 'The Apollo 17 Command Module (CM), with astronauts'), true);
  assert.equal(numberedNameConflict('Apollo 13 launch Saturn V 1970', 'Apollo 11 launch 1969'), true);
  assert.equal(numberedNameConflict('Apollo 13 splashdown parachutes', 'Apollo 13 splashdown, April 17 1970'), false);
  assert.equal(numberedNameConflict('Gene Kranz flight director Apollo 13', 'Apollo 13 Mission Control with Fred Haise and Gene Kranz'), false);
  assert.equal(numberedNameConflict('Topkapi Palace treasury', 'Apollo 11'), false, 'no numbered name in the search, no rule');
  assert.equal(simplerQuery('Gene Kranz flight director Apollo 13'), 'Gene Kranz Apollo');
  assert.equal(simplerQuery('Apollo 13 CO2 scrubber mailbox adapter'), 'Apollo CO2 scrubber');
  assert.equal(simplerQuery('Titanic'), null, 'nothing simpler than one word');
});

test('docu jobs are always 16:9 with the engine-made SRT, and a missing title or real name on an AI scene is rejected', async () => {
  const job = newJobFromRequest({ topic: 'x', mediaKind: 'docu', ratio: '9:16', subtitleMode: 'word' });
  assert.equal(job.ratio, '16:9');
  assert.equal(job.subtitleMode, 'none', 'the engine burns its own text and writes subs.srt');
  const other = newJobFromRequest({ topic: 'x', mediaKind: 'mixed', ratio: '9:16' });
  assert.equal(other.ratio, '9:16', 'other modes keep their ratio');
  const { sourceRule } = await import('../src/pipeline/docu-script.js');
  assert.match(sourceRule({ docuSource: 'archive' }), /isim kartı/);
  assert.doesNotMatch(sourceRule({ docuSource: 'ai' }), /search =/);
});

test('kunye says "all visuals AI" only when no archive photo was used', async () => {
  const { kunyeUret } = await import('../src/pipeline/kunye.js');
  assert.match(kunyeUret({ ai: { provider: 'ai', file: 'ai', all: true } }).metin, /Tüm görseller yapay zekâ/);
  assert.match(kunyeUret({ ai: { provider: 'ai', file: 'ai' } }).metin, /Bazı sahneler yapay zekâ/);
});

/* ======================================================================
 * Long-form writer: normalization, quotas, length, persistence, credits.
 * No network: the script writer gets a fake model (opts.llm) that behaves
 * like llm.js structuredRequest (validate → up to 3 attempts → throw).
 * ==================================================================== */

const DS = await import('../src/pipeline/docu-script.js');

const say = (n, tag = '[serious]') => `${tag} ${Array.from({ length: n }, (_, k) => `kelime${k}`).join(' ')}.`;

test('code-fixable writer mistakes are fixed in code, not sent back for a full rewrite', () => {
  const scenes = [
    { type: 'photo', mood: 'tension', say: '[quietly] Kapı kilitliydi.', dur: 3, imagePrompt: 'door', source: 'ai', name: 'Gene Kranz', role: 'Uçuş direktörü', cast: ['hasan', 'ghost'], imagePrompts: [{ prompt: 'x', cast: ['ghost', 'hasan'] }] },
    { type: 'photo', mood: 'tension', say: '[serious] Arşiv fotoğrafı.', dur: 3, imagePrompt: 'p', source: 'archive', search: '  ' },
    { type: 'montage', mood: 'tension', say: '[whispers] Bir anahtar... bir dolap.', dur: 4, imagePrompts: [{ prompt: 'm1', cast: [] }, { prompt: 'm2', cast: [] }, { prompt: 'm3', cast: [] }, { prompt: 'm4', cast: [] }] },
    { type: 'title', mood: 'tension', say: '[curious] İkinci başlık.', dur: 3, title: 'X', imagePrompt: 't' },
  ];
  const errors = DS.validateScenes({ scenes }, { castKeys: ['hasan'], archive: true, first: false, genre: 'documentary' });
  assert.deepEqual(errors, []);
  assert.ok(!('name' in scenes[0]) && !('role' in scenes[0]), 'no real name under an AI face in archive mode');
  assert.deepEqual(scenes[0].cast, ['hasan']);
  assert.deepEqual(scenes[0].imagePrompts[0].cast, ['hasan'], 'unknown cast keys are filtered, not rejected');
  assert.equal(scenes[1].source, 'ai', 'archive without a search falls back to AI');
  assert.equal(scenes[2].type, 'photo', 'a montage that is not the cold open becomes a photo');
  assert.equal(scenes[2].imagePrompt, 'm1');
  assert.equal(scenes[3].type, 'photo', 'only the first chapter has the video title; the engine adds chapter cards');
});

test('sync contracts: slam word is a whole spoken token (Turkish suffixes), words text follows the voice, montage text is spoken', () => {
  const s = [
    { type: 'slam', mood: 'reveal', say: '[dramatic] Ve bu bir ihanete dönüştü.', dur: 3, imagePrompt: 'i', word: 'ihanet' },
    { type: 'slam', mood: 'reveal', say: "[dramatic] Enron'un sonu geldi.", dur: 3, imagePrompt: 'i', word: 'Enron' },
    { type: 'slam', mood: 'reveal', say: '[dramatic] Her şey bitti.', dur: 3, imagePrompt: 'i', word: 'Çöküş' },
    { type: 'photo', mood: 'reveal', say: '[slowly] Ara.', dur: 3, imagePrompt: 'p' },
    { type: 'words', mood: 'reveal', say: '[slowly] Kimse bunu fark etmedi.', dur: 3, imagePrompt: 'w', text: 'Herkes fark etti', keyword: 'Herkes' },
    { type: 'photo', mood: 'reveal', say: '[slowly] Ara.', dur: 3, imagePrompt: 'p' },
    { type: 'words', mood: 'reveal', say: '[slowly] Tarif bir gece çalındı.', dur: 3, imagePrompt: 'w', text: 'Tarif çalındı', keyword: 'çalın' },
  ];
  DS.normalizeScenes(s, { genre: 'documentary' });
  assert.equal(s[0].word, 'ihanete', 'the engine matches whole tokens; the suffixed spoken form is used');
  assert.equal(s[1].word, "Enron'un");
  assert.equal(s[2].type, 'words', 'a slam word never spoken becomes a words scene instead of a mistimed hit');
  assert.equal(s[2].keyword, 'bitti');
  assert.equal(s[4].text, 'Kimse bunu fark etmedi.', 'on-screen words must be the spoken words in order');
  assert.ok(!('keyword' in s[4]), 'a keyword that is not on screen is dropped');
  assert.equal(s[6].text, 'Tarif çalındı', 'an in-order key phrase of the line is fine');
  assert.equal(s[6].keyword, 'çalındı', 'keyword prefix is resolved to the displayed token');
  const run = [1, 2, 3].map((k) => ({ type: 'words', mood: 'calm', say: '[warmly] Bir iki üç.', dur: 3, imagePrompt: 'w' + k, text: 'Bir iki üç' }));
  DS.normalizeScenes(run, {});
  assert.deepEqual(run.map((x) => x.type), ['words', 'photo', 'words'], 'never three full-sentence words scenes in a row');
  const m = [{ type: 'montage', mood: 'tension', say: '[whispers] Bir tarif... Bir sokak... [dramatic] Ve bir ihanet.', dur: 4, imagePrompts: [1, 2, 3, 4].map((k) => ({ prompt: `m${k}`, cast: [] })), text: 'Tarif Sokak Hainlik' }];
  DS.normalizeScenes(m, { first: true, genre: 'documentary' });
  const spoken = DS.stripTags(m[0].say).split(/\s+/).map(DS.norm);
  assert.ok(m[0].text.split(' ').every((w) => spoken.includes(DS.norm(w))), m[0].text);
});

test('genre grammar: moods foreign to the style are remapped, and each style has its own cold open', () => {
  const horror = [{ type: 'words', mood: 'triumph', say: '[whispers] Kapı açıldı.', dur: 3, imagePrompt: 'x', text: 'Kapı açıldı' }];
  DS.normalizeScenes(horror, { genre: 'horror' });
  assert.equal(horror[0].mood, 'reveal');
  const crime = () => [{ type: 'photo', mood: 'triumph', say: '[quietly] Dosya kapandı.', dur: 3, imagePrompt: 'x' }];
  const mid = crime(); DS.normalizeScenes(mid, { genre: 'crime' });
  const end = crime(); DS.normalizeScenes(end, { genre: 'crime', last: true });
  assert.equal(mid[0].mood, 'reveal', 'crime: no triumph before the resolution');
  assert.equal(end[0].mood, 'triumph', 'crime: the resolution may triumph');
  const opening = (type, genre) => [
    { type, mood: 'dread', say: '[whispers] Şubat bin dokuz yüz elli dokuz.', dur: 4, imagePrompt: 'x', text: 'Şubat', to: 1959, imagePrompts: [1, 2, 3, 4].map((k) => ({ prompt: `m${k}`, cast: [] })) },
    { type: 'title', mood: 'dread', say: '[whispers] Dyatlov Geçidi.', dur: 3, title: 'Dyatlov', imagePrompt: 't' },
  ];
  const open = (type, genre) => DS.validateScenes({ scenes: opening(type, genre) }, { first: true, genre });
  assert.deepEqual(open('words', 'horror'), []);
  const hm = opening('montage', 'horror');
  assert.deepEqual(DS.validateScenes({ scenes: hm }, { first: true, genre: 'horror' }), [], 'a montage cold open in horror is fixed in code, not rewritten');
  assert.equal(hm[0].type, 'photo', 'horror never opens on a fast montage: its first shot becomes the opening photo');
  assert.equal(hm[0].imagePrompt, 'x');
  assert.match(open('counter', 'horror').join(), /ilk sahnesi words veya photo/, 'an opener that cannot be fixed in code is still an error');
  assert.deepEqual(open('counter', 'finance'), []);
  for (const g of DS.DOCU_GENRES) {
    assert.ok(g.write?.openers?.length && g.write.coldOpen && g.write.stance && g.write.tags.length, `${g.id}: writing brief`);
    assert.ok(DS.genreBrief(g.id).includes(g.ad), `${g.id}: brief names the style`);
  }
});

test('mood is the music cue: runs shorter than 20 s merge, silence and the cold open stay', () => {
  const moods = ['tension', 'curious', 'tension', 'reveal', 'sad', 'tension', 'curious', 'reveal', 'tension', 'sad', 'curious', 'tension'];
  const scenes = moods.map((mood, i) => ({ type: 'photo', mood, say: say(8), dur: 3, imagePrompt: `p${i}`, ...(i === 9 ? { silence: true } : {}) }));
  DS.mergeMoodRuns(scenes, { locked: (s, i) => !!s.silence || i === 0 });
  const runs = [];
  scenes.forEach((s) => { if (!runs.length || runs.at(-1).mood !== s.mood) runs.push({ mood: s.mood, n: 0 }); runs.at(-1).n++; });
  assert.ok(runs.length - 1 <= 4, `at most 4 mood changes per chapter, got ${runs.map((r) => r.mood).join('>')}`);
  assert.equal(scenes[9].mood, 'sad', 'a silence beat keeps its mood');
  assert.equal(scenes[0].mood, 'tension', 'the cold open keeps its mood');
});

test('only engine-breaking problems are hard errors; a say-less scene is accepted only as a chapter card', () => {
  const e = DS.validateScenes({ scenes: [
    { type: 'photo', mood: 'calm', say: '[warmly]   ', dur: 3, imagePrompt: 'x' },
    { type: 'counter', mood: 'calm', say: '[warmly] Sayı.', dur: 3 },
    { type: 'chart', mood: 'calm', say: '[warmly] Seri.', dur: 3, points: [1, 2] },
    { type: 'words', mood: 'calm', say: '[warmly] Yazı.', dur: 3 },
    { type: 'title', mood: 'calm', dur: 2.8, title: 'Bölüm', chapterCard: true },
    { type: 'title', mood: 'calm', dur: 2.8, title: 'Bölüm', chapterCard: 'yes' },
  ] }, { first: false });
  const joined = e.join(' | ');
  assert.match(joined, /scenes\[0\]\.say boş/);
  assert.match(joined, /scenes\[1\]: counter için to/);
  assert.match(joined, /scenes\[2\]: chart için en az 3 nokta/);
  assert.doesNotMatch(joined, /scenes\[3\]: words için imagePrompt/, 'a missing imagePrompt is filled from a neighbour, not sent back to the model');
  assert.doesNotMatch(joined, /scenes\[4\]/, 'chapterCard:true needs no narration');
  assert.match(joined, /scenes\[5\]\.say boş/, 'only chapterCard === true is exempt');
  const card = { type: 'title', chapterCard: true, chapterNo: 2, kicker: 'BÖLÜM 2', title: 'B', dur: 2.8, chapter: 1 };
  const docu = { title: 'T', chapters: ['A', 'B'], scenes: [{ type: 'photo', say: 'bir', dur: 3, chapter: 0 }, card, { type: 'photo', say: 'iki', dur: 3, chapter: 1 }] };
  assert.equal(DS.stripChapterCards(docu).scenes.length, 2, 'cards are inserted by the engine, never stored in the script file');
  assert.equal(DS.novaView(docu).sections.length, 2);
  assert.ok(Math.abs(DS.estimateDocuSeconds(DS.stripChapterCards(docu)) - (3 + 3 + DS.CHAPTER_CARD_SEC)) < 1e-9, 'length estimate counts the card at each chapter change');
});

test('video-wide quotas: silence, slams, repeated counters and name cards', () => {
  const scenes = [];
  for (let c = 0; c < 6; c++) {
    for (let k = 0; k < 20; k++) {
      const i = scenes.length;
      scenes.push({ chapter: c, type: k % 5 === 2 ? 'slam' : 'photo', mood: k === 10 ? 'sad' : 'tension', say: say(9), dur: 3, imagePrompt: `shot ${i}`, ...(k % 5 === 2 ? { word: 'kelime3' } : {}), ...(k === 10 ? { silence: true } : {}) });
    }
  }
  scenes.push({ chapter: 5, type: 'counter', mood: 'reveal', say: say(4), dur: 3, to: 2224, label: 'kişi' });
  scenes.push({ chapter: 5, type: 'counter', mood: 'reveal', say: say(4), dur: 3, to: 2224, label: 'kişi' });
  scenes[3].name = 'Gene Kranz'; scenes[50].name = 'gene  kranz'; scenes[50].role = 'direktör';
  const notes = DS.enforceGlobalQuotas(scenes, { minutes: 10, intensity: [1, 2, 3, 4, 5, 3] });
  assert.ok(notes.length);
  assert.ok(scenes.filter((s) => s.silence).length <= 2, 'silence at most twice per video');
  let t = 0; const slamAt = [];
  scenes.forEach((s, i) => { if (i && s.chapter !== scenes[i - 1].chapter) t += DS.CHAPTER_CARD_SEC; if (s.type === 'slam') slamAt.push(t); t += DS.estSceneSeconds(s); });
  assert.ok(slamAt.length <= Math.ceil(10 / 1.5), `slams capped: ${slamAt.length}`);
  for (let k = 1; k < slamAt.length; k++) assert.ok(slamAt[k] - slamAt[k - 1] >= 45, 'slams at least 45 s apart');
  assert.ok(scenes.some((s) => s.type === 'words' && s.keyword === 'kelime3'), 'extra slams become words scenes with the slam word highlighted');
  assert.equal(scenes.filter((s) => s.type === 'counter').length, 1, 'the same number is counted once');
  assert.ok(scenes.at(-1).imagePrompt, 'a demoted counter borrows a (varied) picture');
  assert.equal(scenes[3].name, 'Gene Kranz');
  assert.ok(!scenes[50].name && !scenes[50].role, 'a person gets one name card per video');
});

test('final pass: AI-mode name cards say depiction, years are years, an outro leaves room for the end screen, repeated prompts vary', () => {
  const plan = DS.docuPlan({ durationPreset: 'uzunformat', language: 'tr' });
  const scenes = [
    { chapter: 0, type: 'photo', mood: 'tension', say: say(8), dur: 3, imagePrompt: 'empty office at night, one desk lamp', name: 'Kenneth Lay', role: 'CEO' },
    { chapter: 0, type: 'counter', mood: 'tension', say: '[serious] Bin dört yüz elli üç yılında.', dur: 3, to: 1453, label: 'Yıl' },
    { chapter: 0, type: 'counter', mood: 'tension', say: say(4), dur: 3, to: 1178, label: 'filika yeri' },
    { chapter: 1, type: 'photo', mood: 'tension', say: say(8), dur: 3, imagePrompt: 'empty office at night, one desk lamp' },
    { chapter: 1, type: 'words', mood: 'sad', say: say(6), dur: 3, imagePrompt: 'closing shot', text: 'x' },
  ];
  const notes = DS.finalizeScenes(scenes, { job: { docuSource: 'ai', language: 'tr' }, plan });
  assert.equal(scenes[0].role, 'CEO — canlandırma', 'an AI face under a real name is labelled as a depiction');
  assert.equal(scenes[1].year, true, '1453 renders as a year, not 1.453');
  assert.ok(!scenes[2].year, 'a count of 1178 seats stays a number');
  assert.notEqual(scenes[3].imagePrompt, scenes[0].imagePrompt, 'the same prompt would reuse the same cached still');
  const outro = scenes.at(-1);
  assert.ok(outro.outro && !outro.say && outro.dur >= 12, 'a quiet closing shot is appended for the end screen');
  assert.ok(notes.some((n) => /kapanış/.test(n)));
  const arch = [1, 2, 3, 4].map(() => ({ type: 'photo', source: 'archive', search: 'Apollo 13 crew 1970', name: 'X' }));
  assert.equal(DS.collapseArchiveSearches(arch), 2, 'a repeated archive search keeps two hits, the rest become AI');
  assert.ok(!arch[3].name, 'and loses its real-name card');
});

test('ElevenLabs credit need counts tags, and music/ambience/SFX only when the library cannot supply them', () => {
  const docu = { locale: 'tr-TR', scenes: [{ type: 'photo', mood: 'dread', say: 'Kapı açıldı.', dur: 3, sound: 'wind' }, { type: 'photo', mood: 'calm', say: '[warmly] Sabah oldu.', dur: 3 }] };
  const lib = DS.docuElevenNeed(docu, { musicSource: 'library', libraryReady: true });
  assert.equal(lib.voice, '[whispers] Kapı açıldı.'.length + '[warmly] Sabah oldu.'.length, 'the engine adds the mood tag, and tags cost credits');
  assert.equal(lib.music + lib.ambience + lib.sfx, 0);
  assert.ok(DS.docuElevenNeed(docu, { musicSource: 'eleven', libraryReady: true }).music > 0);
  const none = DS.docuElevenNeed(docu, { libraryReady: false });
  assert.ok(none.music > 0 && none.ambience > 0 && none.sfx > 0, 'without the library the engine falls back to generated audio');
  assert.equal(DS.docuElevenNeed(docu, { voiceCachedFraction: 1 }).voice, 0, 'cached lines are not paid again on a re-render');
  const est12 = DS.docuElevenEstimate(12, 'tr', { musicSource: 'eleven' });
  assert.ok(est12.music > est12.voice, 'a 12 min ElevenLabs score costs more than the narration');
});

test('the form (public/app.js) shows the same ElevenLabs estimate as the server', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
  const start = src.indexOf('function docuElevenEstimate(');
  assert.ok(start > 0);
  let depth = 0, end = src.indexOf(') {', start) + 2; // body brace, not the destructured options
  for (let i = end; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i + 1; break; } }
  const uiEstimate = new Function(`${src.slice(start, end)}; return docuElevenEstimate;`)();
  for (const minutes of [1, 3, 8, 10, 12, 20]) for (const lang of ['tr', 'en']) for (const musicSource of ['library', 'eleven']) for (const libraryReady of [true, false]) {
    assert.deepEqual(uiEstimate(minutes, lang, { musicSource, libraryReady }), DS.docuElevenEstimate(minutes, lang, { musicSource, libraryReady }), `${minutes} ${lang} ${musicSource} ${libraryReady}`);
  }
});

test('writers get the whole research (hook material lives past 9k chars); the machine-readable source block is dropped', () => {
  const body = 'A'.repeat(12000) + '\n## 3) Az bilinen detaylar\nHOOK-MARKER';
  const research = `${body}\n\n\n## Kaynak kayıtları\n${JSON.stringify([{ url: 'https://x.org/a', title: 'Kaynak A' }, { url: 'https://x.org/b', title: 'Kaynak A' }], null, 2)}`;
  const out = DS.researchForWriters(research);
  assert.ok(out.includes('HOOK-MARKER'));
  assert.ok(!out.includes('https://x.org/a'), 'the JSON provenance block is not prompt material');
  assert.match(out, /## Kaynaklar\n- Kaynak A$/);
});

/** A fake model with llm.js semantics: validate may fix in place; errors → retry; 3 strikes → throw. */
function fakeModel({ chapterWords = () => 214, onCall = () => {}, failChapter = -1 } = {}) {
  const calls = [];
  const llm = async (opts) => {
    calls.push(opts);
    onCall(opts, calls.length);
    let lastErrors = [];
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (opts.isCancelled?.()) throw new Error('cancelled');
      const isScenes = !!opts.schema?.properties?.scenes;
      const parsed = isScenes ? fakeChapter(opts, attempt, chapterWords, failChapter) : fakeBible(opts);
      const errors = opts.validate?.(parsed) || [];
      if (!errors.length) return parsed;
      lastErrors = errors;
      opts.errorsSeen = [...(opts.errorsSeen || []), ...errors];
    }
    throw new Error('JSON yanıtı 3 denemede doğrulanamadı. ' + lastErrors.join('; '));
  };
  return { llm, calls };
}
function fakeBible(opts) {
  const n = Number(opts.user.match(/TAM (\d+) bölüm/)[1]);
  const genre = opts.user.match(/genre MUTLAKA "(\w+)"/)?.[1] || 'documentary';
  return {
    title: 'Sahte Belgesel', genre, visualStyle: 'Grainy 1970s film photograph.',
    centralQuestion: 'Neden?', stakes: 'Her şey.', promise: 'Cevabı göreceğiz.', hookWord: 'anahtar',
    openLoops: [{ text: 'Kim?', setupChapter: 1, payoffChapter: n }, { text: 'Nasıl?', setupChapter: 2, payoffChapter: n }, { text: 'Hatalı', setupChapter: 3, payoffChapter: 2 }],
    cast: [{ key: 'Hasan Usta', description: 'a man in his 40s' }],
    chapters: Array.from({ length: n }, (_, i) => ({ title: `Bölüm ${i + 1}`, goal: 'g', covers: [`olgu ${i}`], hookIn: 'h', turn: 't', cliffhanger: 'c', intensity: i === 0 ? 5 : 2, midpoint: true })),
  };
}
function fakeChapter(opts, attempt, chapterWords, failChapter) {
  const i = Number(opts.user.match(/BÖLÜM (\d+)\/\d+/)[1]) - 1;
  if (i === failChapter) throw Object.assign(new Error('Anthropic 529 overloaded'), { status: 529 });
  const extending = /UZAT: en az (\d+) kelime/.test(opts.user);
  const words = extending ? Number(/toplam ~(\d+) kelime\)/.exec(opts.user)[1]) + 5 : chapterWords(i, attempt);
  const genre = opts.system?.[0]?.text?.match(/KURGU STİLİ: .*?\((\w+)\)/)?.[1] || 'documentary';
  const scenes = [];
  if (i === 0) {
    const opener = { documentary: 'montage', crime: 'photo', epic: 'photo', science: 'words', inspire: 'photo', finance: 'words', horror: 'words' }[genre];
    scenes.push(opener === 'montage'
      ? { type: 'montage', mood: 'tension', say: '[whispers] Bir anahtar... bir dolap.', dur: 4, imagePrompts: [1, 2, 3, 4, 5].map((k) => ({ prompt: `macro ${k}`, cast: [] })), text: 'anahtar dolap', source: 'ai' }
      : { type: opener, mood: 'tension', say: '[whispers] Bir anahtar... bir dolap.', dur: 4, imagePrompt: 'a key on a table', text: 'Bir anahtar bir dolap', source: 'ai' });
    scenes.push({ type: 'title', mood: 'tension', say: '[curious] Kilitli dolabın hikâyesi.', dur: 3, title: 'Kilitli Dolap', kicker: 'Bir', imagePrompt: 'the man at the door', cast: ['hasan_usta'], source: 'ai' });
  }
  let left = words - scenes.reduce((n, s) => n + DS.countWords(s.say), 0);
  let k = 0;
  while (left > 0) {
    const n = Math.min(10, left);
    const line = say(n);
    scenes.push({ type: k % 3 === 1 ? 'words' : 'photo', mood: 'tension', say: line, dur: 3, imagePrompt: `chapter ${i} unique shot number ${k} variant ${attempt}`, source: 'ai', ...(k % 3 === 1 ? { text: DS.stripTags(line) } : {}) });
    left -= n; k++;
  }
  return { scenes };
}

const longJob = (extra = {}) => ({ id: 'j1', topic: 'Kilitli dolap', durationPreset: 'uzunformat', language: 'tr', docuSource: 'ai', theme: 'vox', ...extra });

test('the writer: long-form bible, genre brief, full research, cached prefix, continuity, no hidden Vox theme', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-w-'));
  const { llm, calls } = fakeModel();
  const research = 'R'.repeat(15000) + ' HOOK-MARKER';
  const script = await DS.runDocuScript(longJob({ docuGenre: 'horror' }), research, {}, () => {}, { dir, llm });
  const plan = DS.docuPlan(longJob());
  const [bibleCall, ...chapterCalls] = calls;
  assert.match(bibleCall.user, /centralQuestion/);
  assert.match(bibleCall.user, /10 dk; bölüm başı ~100 sn/);
  assert.equal(chapterCalls.length, plan.chapters, 'chapters are written one by one');
  const sys = chapterCalls[0].system;
  assert.ok(Array.isArray(sys) && sys[1].cache_control?.type === 'ephemeral', 'research + plan are a cached prefix');
  assert.ok(sys[1].text.includes('HOOK-MARKER'), 'no 9,000 character cut');
  assert.ok(sys[0].text.includes('HIZLI MONTAJ YOK'), 'the horror writing brief reaches the writer');
  assert.ok(!JSON.stringify(sys).includes('Şunu fark ettiniz mi'), 'the hidden Vox theme is gone');
  assert.ok(chapterCalls.every((c) => JSON.stringify(c.system) === JSON.stringify(sys)), 'every chapter shares the same cacheable system prefix');
  assert.match(chapterCalls[1].user, /ÖNCEKİ BÖLÜMÜN SON SATIRLARI/, "chapter 2 continues from chapter 1's real last lines");
  assert.match(chapterCalls.at(-1).user, /SON BÖLÜM: merkez soruyu/);
  assert.match(chapterCalls.at(-1).user, /Soğuk açılış \(bölüm 1\) böyleydi/, 'the last chapter can bookend the cold open');
  assert.match(chapterCalls[2].user, /Bu bölümde silence YOK; slam en fazla 1/);
  assert.equal(script.genre, 'horror');
  assert.deepEqual(Object.keys(script.cast), ['hasan_usta'], 'cast keys are normalised');
  assert.ok(script.story.openLoops.every((l) => l.setupChapter < l.payoffChapter), 'a loop cannot pay off before it is set up');
  assert.ok(script.stats.actualWords >= plan.words * 0.97 && script.stats.estMinutes >= 10.2, JSON.stringify(script.stats));
  assert.ok(script.stats.estElevenCredits > 0);
  assert.ok(script.scenes.every((s) => Number.isInteger(s.chapter)));
});

test('a short chapter is sent back with "N kelime daha ekle"; if it stays short the extension pass lengthens it with its JSON', async () => {
  const seen = [];
  const { llm, calls } = fakeModel({ chapterWords: (i) => (i === 1 ? 120 : 214), onCall: (o) => seen.push(o) });
  const script = await DS.runDocuScript(longJob(), 'araştırma', {}, () => {}, { llm });
  const ch2 = seen.find((o) => /BÖLÜM 2\/\d+/.test(o.user) && !/UZAT/.test(o.user));
  assert.match(ch2.errorsSeen.join(), /bölüm 2: 120\/214 kelime — 94 kelime daha ekle/);
  const ext = calls.filter((c) => /UZAT/.test(c.user));
  assert.ok(ext.length >= 1, 'the extension pass ran');
  assert.match(ext[0].user, /MEVCUT BÖLÜM JSON/);
  assert.ok(script.stats.actualWords >= DS.docuPlan(longJob()).words * 0.97, JSON.stringify(script.stats));
});

test('chapters persist and resume: a failure keeps written chapters, a resumed run pays only for the rest', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-r-'));
  const first = fakeModel({ failChapter: 3 });
  await assert.rejects(DS.runDocuScript(longJob(), 'araştırma', {}, () => {}, { dir, llm: first.llm }), /529/);
  assert.ok(fs.existsSync(path.join(dir, 'docu-bible.json')));
  for (const i of [0, 1, 2]) assert.ok(fs.existsSync(path.join(dir, `docu-ch-${i}.json`)), `chapter ${i} kept`);
  assert.ok(!fs.existsSync(path.join(dir, 'docu-ch-3.json')));
  const second = fakeModel();
  const script = await DS.runDocuScript(longJob(), 'araştırma', {}, () => {}, { dir, llm: second.llm });
  const n = DS.docuPlan(longJob()).chapters;
  assert.equal(second.calls.length, n - 3, 'bible and chapters 1-3 come from disk');
  assert.equal(script.chapters.length, n);
  const third = fakeModel();
  await DS.runDocuScript(longJob(), 'araştırma', {}, () => {}, { dir, llm: third.llm });
  assert.equal(third.calls.length, 0, 'a finished script is rebuilt for free');
  const changed = fakeModel();
  await DS.runDocuScript(longJob({ guidance: 'başka bir odak' }), 'araştırma', {}, () => {}, { dir, llm: changed.llm });
  assert.equal(changed.calls.length, 1 + n, 'a changed job never reuses stale chapters');
});

test('cancel stops the writer between chapters', async () => {
  let stop = false;
  const { llm, calls } = fakeModel({ onCall: (o, k) => { if (k === 3) stop = true; } });
  await assert.rejects(DS.runDocuScript(longJob(), 'araştırma', {}, () => {}, { llm, isCancelled: () => stop }), /cancelled/);
  assert.ok(calls.length <= 3, `no chapter starts after cancel (${calls.length} calls)`);
});

test('length gate: a script estimated under the target stops before any paid step', async () => {
  const { assertLongEnough } = await import('../src/pipeline/docu.js');
  const mk = (words) => ({ locale: 'tr-TR', stats: { plannedWords: 1284 }, scenes: Array.from({ length: Math.ceil(words / 10) }, () => ({ type: 'photo', say: say(10), dur: 3, chapter: 0 })) });
  assert.throws(() => assertLongEnough(mk(1000), { durationPreset: 'uzunformat', language: 'tr' }), /Senaryo kısa: ~\d+(,\d)? dk \(hedef ≥ 10 dk/);
  const st = assertLongEnough(mk(1260), { durationPreset: 'uzunformat', language: 'tr' });
  assert.ok(st.estMinutes >= 10.2);
});

test('engine child gets the audio library and music source, a minimum length, and UTF-8 survives split chunks', async () => {
  const res = fakeEngine(`
    import fs from 'node:fs';
    const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const line = Buffer.from(JSON.stringify({ type: 'log', msg: 'şğıöçü İstanbul' }) + '\\n');
    process.stdout.write(line.subarray(0, 22));
    await new Promise((r) => setTimeout(r, 60));
    process.stdout.write(line.subarray(22));
    console.log(JSON.stringify({ type: 'done', durationSec: 1, lib: process.env.NOVA_AUDIO_LIB, music: process.env.NOVA_MUSIC_SOURCE, minSeconds: spec.minSeconds }));
  `);
  const prev = process.resourcesPath;
  process.resourcesPath = res;
  try {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-work-'));
    const logs = [];
    const done = await runDocuEngine({ scriptPath: 'x', workDir: work, output: path.join(work, 'o.mp4'), minSeconds: 570, settings: { elevenKey: 'e', audioLibraryDir: 'D:/lib', docuMusicSource: 'eleven' }, killer: new ProcKiller(), onLog: (m) => logs.push(m) });
    assert.equal(done.lib, 'D:/lib');
    assert.equal(done.music, 'eleven');
    assert.equal(done.minSeconds, 570);
    assert.ok(logs.includes('şğıöçü İstanbul'), logs.join('|'));
    const def = await runDocuEngine({ scriptPath: 'x', workDir: work, output: path.join(work, 'o.mp4'), settings: { elevenKey: 'e' }, killer: new ProcKiller() });
    assert.equal(def.music, 'library', 'the library is the default music source');
    assert.equal(def.lib, path.join(home, 'data', 'audio-library'));
  } finally {
    process.resourcesPath = prev;
  }
});

test('a silent (hung) engine is killed by the watchdog with a resumable message', async () => {
  const res = fakeEngine(`console.log(JSON.stringify({ type: 'log', msg: 'başladı' })); setTimeout(() => {}, 20000);`);
  const prev = process.resourcesPath;
  process.resourcesPath = res;
  try {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docu-work-'));
    const t0 = Date.now();
    await assert.rejects(
      runDocuEngine({ scriptPath: 'x', workDir: work, output: path.join(work, 'o.mp4'), settings: { elevenKey: 'e' }, killer: new ProcKiller(), stallMs: 400 }),
      /yanıt vermedi.*Kaldığı yerden devam et/,
    );
    assert.ok(Date.now() - t0 < 10000);
  } finally {
    process.resourcesPath = prev;
  }
});

test('engine warnings become quality warnings; asset gaps mark the render degraded', async () => {
  const { engineWarnings } = await import('../src/pipeline/docu.js');
  const a = engineWarnings({ fallbackImages: [4, 9], missingAmbience: 0, musicPromptFallback: false });
  assert.equal(a.degraded, true);
  assert.deepEqual(a.messages, ['2 sahnede görsel üretilemedi, yedek kare kullanıldı (sahne 5, 10)']);
  const b = engineWarnings({ slamFallback: [1] });
  assert.equal(b.degraded, false, 'a sync miss is reported but a re-render would not fix it');
  assert.deepEqual(engineWarnings(undefined), { messages: [], degraded: false });
});

test('the render key follows the engine code and the audio library', async () => {
  const { docuEngineFingerprint } = await import('../src/pipeline/docu.js');
  const eng = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-eng-'));
  fs.mkdirSync(path.join(eng, 'lib')); fs.mkdirSync(path.join(eng, 'src'));
  fs.writeFileSync(path.join(eng, 'lib', 'produce.mjs'), 'a');
  fs.writeFileSync(path.join(eng, 'src', 'Engine.tsx'), 'b');
  const f1 = docuEngineFingerprint(eng);
  assert.match(f1, /^[0-9a-f]{16}$/);
  fs.writeFileSync(path.join(eng, 'src', 'Engine.tsx'), 'c');
  assert.notEqual(docuEngineFingerprint(eng), f1, 'an engine fix re-renders instead of returning the old video');
  assert.match(docuEngineFingerprint(), /^[0-9a-f]{16}$/, 'the real engine folder hashes');
  const { audioLibraryInfo } = await import('../src/config.js');
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-lib-'));
  assert.equal(audioLibraryInfo({ audioLibraryDir: lib }).ready, false);
  fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ music: [{ id: 'm1', file: 'music/m1.mp3', title: 'T' }], sfx: [] }));
  const v1 = audioLibraryInfo({ audioLibraryDir: lib });
  assert.equal(v1.ready, true); assert.equal(v1.tracks, 1);
  fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ music: [{ id: 'm1', file: 'music/m1.mp3', title: 'T' }, { id: 'm2', file: 'music/m2.mp3', title: 'U' }], sfx: [] }));
  assert.notEqual(audioLibraryInfo({ audioLibraryDir: lib }).version, v1.version, 'a new library version re-renders');
});

test('settings accept the music source and library folder; docu jobs never carry the Vox theme', async () => {
  const { settingsPatch } = await import('../src/settings-input.js');
  assert.deepEqual(settingsPatch({ docuMusicSource: 'eleven', audioLibraryDir: ' D:/lib ' }), { docuMusicSource: 'eleven', audioLibraryDir: 'D:/lib' });
  assert.throws(() => settingsPatch({ docuMusicSource: 'spotify' }), /Geçersiz ayar/);
  const job = newJobFromRequest({ topic: 'x', mediaKind: 'docu', theme: 'vox' });
  assert.equal(job.theme, 'belgesel');
  assert.equal(newJobFromRequest({ topic: 'x', mediaKind: 'mixed', theme: 'vox' }).theme, 'vox', 'other modes keep their theme');
  const { docuResearchLines } = await import('../src/pipeline/script.js');
  const lines = docuResearchLines({ topic: 'Kara Perşembe borsa çöküşü', durationPreset: 'derin', mediaKind: 'docu' }).join('\n');
  assert.match(lines, /En çarpıcı 52\+ olgu/, '13 chapters × 4 facts');
  assert.match(lines, /KESİN TARİHLİ kronoloji/);
  assert.match(lines, /2-4 GERÇEK veri serisi/);
});

test('"Yeniden render / eksikleri tamamla" clears only the docu render checkpoint and queues the job', async () => {
  const store = await import('../src/store.js');
  const { rerenderJob } = await import('../src/pipeline/index.js');
  const { writeJson, readJson } = await import('../src/util.js');
  const job = newJobFromRequest({ topic: 'Rerender', mediaKind: 'docu' });
  job.status = 'done';
  store.createJob(job);
  const dir = store.jobDir(job.id);
  writeJson(path.join(dir, 'script.json'), { title: 'T', sections: [{ title: 'A', segments: [{ text: 'bir' }] }] });
  writeJson(path.join(dir, 'checkpoints.json'), { render: { key: 'k', value: { dir: 'x' } }, script: { key: 's', value: {} } });
  rerenderJob(job.id);
  const cp = readJson(path.join(dir, 'checkpoints.json'));
  assert.ok(!cp.render, 'render checkpoint cleared');
  assert.ok(cp.script, 'other checkpoints kept');
  for (let i = 0; i < 100 && ['queued', 'running'].includes(store.getJob(job.id).status); i++) await new Promise((r) => setTimeout(r, 10));
  assert.match(store.getJob(job.id).message || '', /anahtar eksik/, 'the queued run reached the docu pipeline (and stopped on missing keys, no network)');
});

test('review hints: numbers missing from the research and phrases repeated across chapters are reported, not silently kept', () => {
  const research = 'Titanik 2.224 kişi taşıyordu; filikalarda 1178 yer vardı. Evren 13,8 milyar yaşında. Seri: 1929 381, 1930 294, 1931 164, 1932 41.';
  const scenes = [
    { type: 'counter', to: 2224, say: 'x' }, { type: 'counter', to: 1178, say: 'x' }, { type: 'counter', to: 13800000000, say: 'x' },
    { type: 'counter', to: 9999, say: 'x' }, { type: 'chart', title: 'DJIA', points: [381, 294, 164, 41], say: 'x' }, { type: 'chart', title: 'Uydurma', points: [5, 6, 7, 8], say: 'x' },
  ];
  assert.deepEqual(DS.unverifiedNumbers(scenes, research), ['sahne 4: sayaç 9999', 'sahne 6: grafik "Uydurma"']);
  const rep = [0, 1, 2].flatMap((c) => [{ chapter: c, say: 'Ama asıl soru hâlâ cevapsız duruyordu burada' }]);
  assert.ok(DS.crossChapterRepeats(rep).length >= 3, 'the same stock line in three chapters is flagged');
  assert.deepEqual(DS.crossChapterRepeats([{ chapter: 0, say: 'bir iki üç dört beş' }, { chapter: 1, say: 'altı yedi sekiz dokuz on' }]), []);
});

test('one video title only, and a yearly figure is not mistaken for a year', () => {
  const ch = [
    { type: 'montage', mood: 'tension', say: '[whispers] Bir anahtar.', dur: 4, imagePrompts: [1, 2, 3, 4].map((k) => ({ prompt: `m${k}`, cast: [] })) },
    { type: 'title', mood: 'tension', say: '[curious] Başlık.', dur: 3, title: 'A', imagePrompt: 't1' },
    { type: 'title', mood: 'tension', say: '[curious] Yine başlık.', dur: 3, title: 'B', imagePrompt: 't2' },
  ];
  assert.deepEqual(DS.validateScenes({ scenes: ch }, { first: true }), []);
  assert.deepEqual(ch.map((s) => s.type), ['montage', 'title', 'photo']);
  const c = [{ type: 'counter', to: 1500, label: 'Yıllık ciro', say: 'x', chapter: 0 }, { type: 'counter', to: 1923, label: 'Kuruluş yılı', say: 'x', chapter: 0 }];
  DS.finalizeScenes(c, { job: { language: 'tr' }, plan: DS.docuPlan({ durationPreset: 'test' }) });
  assert.ok(!c[0].year);
  assert.equal(c[1].year, true);
});

test('first-30-seconds contract is reported: late title, long cold open, promise never said', () => {
  const bible = { promise: 'Bir anahtarın bütün şirketi nasıl batırdığını göreceğiz' };
  const good = [
    { type: 'montage', say: '[whispers] Bir anahtar... bir dolap.', dur: 4, imagePrompts: [1, 2, 3, 4] },
    { type: 'title', say: '[curious] Kilitli dolap.', dur: 3 },
    { type: 'photo', say: '[serious] Bu anahtar bütün şirketi batırdı, nasıl olduğunu göreceğiz.', dur: 3 },
  ];
  assert.deepEqual(DS.hookWarnings(good, bible), []);
  const bad = [{ type: 'photo', say: say(30), dur: 3 }, ...Array.from({ length: 6 }, () => ({ type: 'photo', say: say(10), dur: 3 })), { type: 'title', say: '[curious] Başlık.', dur: 3 }];
  const w = DS.hookWarnings(bad, bible).join(' | ');
  assert.match(w, /Soğuk açılış uzun/);
  assert.match(w, /başlığı geç geliyor/);
  assert.match(w, /Vaat ilk 30 saniyede/);
});

test('a missing or very late video title is placed in the cold open in code instead of rewriting chapter 1', () => {
  const montage = { type: 'montage', mood: 'tension', say: '[whispers] Bir anahtar... bir dolap.', dur: 4, imagePrompts: [1, 2, 3, 4].map((k) => ({ prompt: `m${k}`, cast: [] })) };
  const photo = (k, n = 6) => ({ type: 'photo', mood: 'tension', say: say(n), dur: 3, imagePrompt: `p${k}` });
  const none = [montage, photo(1), photo(2), { ...photo(3), name: 'Gene Kranz', source: 'archive', search: 'x' }];
  assert.deepEqual(DS.validateScenes({ scenes: none }, { first: true, videoTitle: 'Kilitli Dolap' }), []);
  assert.equal(none[1].type, 'title');
  assert.equal(none[1].title, 'Kilitli Dolap');
  assert.equal(none[1].say, say(6), 'the narration is kept; only the card changes');
  const noTitle = [structuredClone(montage), photo(1), photo(2)];
  assert.match(DS.validateScenes({ scenes: noTitle }, { first: true }).join(), /title/, 'without a known title it is still an error');
  const late = [structuredClone(montage), ...[1, 2, 3, 4, 5].map((k) => photo(k, 14)), { type: 'title', mood: 'tension', say: '[curious] Kilitli dolabın hikâyesi.', dur: 3, title: 'Kilitli Dolap', kicker: 'Bir sır', imagePrompt: 't' }];
  assert.deepEqual(DS.validateScenes({ scenes: late }, { first: true, videoTitle: 'Başka' }), []);
  assert.equal(late[1].type, 'title');
  assert.equal(late[1].title, 'Kilitli Dolap', "the writer's own title text and kicker move forward");
  assert.equal(late[1].kicker, 'Bir sır');
  assert.equal(late[6].type, 'photo', 'the late title becomes a plain shot: one video title only');
  const slightly = [structuredClone(montage), photo(1, 4), photo(2, 4), photo(3, 4), { type: 'title', mood: 'tension', say: '[curious] Başlık.', dur: 3, title: 'T', imagePrompt: 't' }];
  assert.deepEqual(DS.validateScenes({ scenes: slightly }, { first: true, videoTitle: 'X' }), []);
  assert.equal(slightly[4].type, 'title', 'a title at ~15 s is on time and stays where the writer put it');
});

test('long photo runs get a words beat with a spoken key phrase; named people keep their photo', () => {
  const line = '[serious] Fabrika o yıl kapandı, bütün işçiler sokakta kaldı.';
  const run = Array.from({ length: 8 }, (_, k) => ({ type: 'photo', mood: 'tension', say: line, dur: 3, imagePrompt: `p${k}`, imagePrompts: [{ prompt: 'doc', cast: [] }] }));
  run[3].name = 'Hasan Usta'; run[3].source = 'archive'; run[3].search = 'x';
  DS.normalizeScenes(run, { genre: 'documentary' });
  assert.deepEqual(run.map((s) => s.type), ['photo', 'photo', 'photo', 'photo', 'words', 'photo', 'photo', 'photo']);
  const w = run[4];
  assert.equal(w.text, 'bütün işçiler sokakta kaldı.', 'a key phrase, not the whole sentence');
  const spoken = DS.stripTags(line).split(/\s+/).map(DS.norm);
  const shown = w.text.split(/\s+/).map(DS.norm);
  assert.ok(shown.every((t, k) => spoken.indexOf(t) >= 0 && (k === 0 || spoken.indexOf(t) > spoken.indexOf(shown[k - 1]))), 'shown words are spoken, in order');
  assert.ok(shown.includes(DS.norm(w.keyword)), 'the keyword is on screen');
  assert.ok(!w.imagePrompts, 'no unseen extra card is paid for');
  assert.equal(run[3].name, 'Hasan Usta');
});

test('re-hook gaps over ~100 s are reported for review', () => {
  const flat = Array.from({ length: 30 }, (_, k) => ({ chapter: 0, type: 'photo', mood: 'tension', say: say(10), dur: 3, imagePrompt: `p${k}` }));
  const gaps = DS.rehookGaps(flat);
  assert.equal(gaps.length, 1);
  assert.ok(gaps[0].gap > 100);
  const hooked = flat.map((s, k) => (k === 15 ? { ...s, type: 'counter', to: 1178 } : s));
  assert.deepEqual(DS.rehookGaps(hooked), [], 'a counter mid-way re-hooks');
  const carded = flat.map((s, k) => ({ ...s, chapter: k < 15 ? 0 : 1 }));
  assert.deepEqual(DS.rehookGaps(carded), [], 'a chapter card is a re-hook');
});

/* ------------------------------------------------ borrowed pictures (Cooper QA) */

test('borrow: the donor is the scene about the same thing, never one on screen within 60 s, never lent twice', async () => {
  const { planBorrows } = await import('../docu-engine/lib/produce.mjs');
  const pad = (n) => Array.from({ length: n }, (_, k) => ({ type: 'photo', say: `Filler line number ${k} about nothing in particular.`, dur: 6, image: `f${n}-${k}.jpg`, chapter: 0 }));
  const stair = { type: 'photo', say: 'The Boeing 727 had a rear airstair that opened in flight.', search: 'Boeing 727 aft airstair', dur: 6, image: 'stair.jpg', chapter: 0 };
  const vane = { type: 'photo', say: 'Airlines add a lock to the Boeing 727 airstair: the Cooper vane.', search: 'Cooper vane Boeing 727', dur: 6, chapter: 0, capped: true };
  const scenes = [
    stair,
    ...pad(14),
    { type: 'photo', say: 'A typewriter clatters in the newsroom.', search: 'vintage typewriter keys', dur: 6, image: 'typewriter.jpg', chapter: 0 },
    vane,
    { type: 'photo', say: 'Engineers test the new Boeing 727 airstair lock.', search: 'Boeing 727 airstair lock test', dur: 6, chapter: 0, capped: true },
  ];
  const own = scenes.map((s) => s.image ?? null);
  const i = scenes.length - 2;
  const { decisions } = planBorrows(scenes, { own, need: [i, i + 1] });
  assert.equal(decisions[0].kind, 'donor');
  assert.equal(decisions[0].from, 0, 'the airstair picture 90 s back, not the typewriter next door');
  assert.ok(!(decisions[1].kind === 'donor' && decisions[1].from === 0), 'a picture is lent once');
  assert.ok(!(decisions[1].from >= 0 && own[decisions[1].from] === 'typewriter.jpg'), 'never the unrelated neighbour');
  // Within 60 s: the same picture is not lent even when it fits.
  const near = [stair, ...pad(3), { ...vane }];
  const d2 = planBorrows(near, { own: near.map((s) => s.image ?? null), need: [near.length - 1] }).decisions[0];
  assert.ok(!(d2.kind === 'donor' && d2.from === 0), 'on screen 24 s earlier: never lent');
});

test('borrow: no fitting donor -> hold the previous shot when it fits the line, else AI over the cap (at most +8)', async () => {
  const { planBorrows } = await import('../docu-engine/lib/produce.mjs');
  const cap = new Map();
  const scenes = [
    { type: 'photo', say: 'Tena Bar, a sandy beach on the Columbia River.', search: 'sandy riverbank', dur: 5, image: 'beach.jpg' },
    { type: 'photo', say: 'Brian Ingram is camping on the sandy Columbia River beach at Tena Bar.', search: 'Brian Ingram 1980', dur: 5, capped: true },
    { type: 'photo', say: 'A geologist named Leonard Palmer reads the layers.', search: 'Leonard Palmer geologist', dur: 5, capped: true },
    ...Array.from({ length: 10 }, (_, k) => ({ type: 'photo', say: `Suspect ${['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'][k]} was never charged.`, dur: 5, capped: true })),
  ];
  scenes.forEach((s, k) => k > 0 && cap.set(s, `prompt ${k}`));
  const own = scenes.map((s) => s.image ?? null);
  const need = scenes.map((_, k) => k).filter((k) => k > 0);
  const { decisions, loose } = planBorrows(scenes, { own, need, capPrompt: (s) => cap.get(s) });
  assert.equal(decisions[0].kind, 'hold', 'camping on the beach holds the beach shot');
  assert.equal(decisions[1].kind, 'ai', 'nothing fits the geologist: his own picture after all');
  assert.equal(decisions.filter((d) => d.kind === 'ai').length, 8, 'the cap gives way by at most 8');
  assert.ok(decisions.slice(9).every((d) => d.kind === 'loose'), 'past +8: any far, unused picture (or none)');
  assert.equal(typeof loose, 'function');
});

test('borrow: footage donors lend another stretch of the clip; held lines continue their clip instead of its opening still', async () => {
  const { freeClipWindow, finalizeClipWindows, clipEnd } = await import('../docu-engine/lib/produce.mjs');
  assert.deepEqual(freeClipWindow(40, [[0, 8]], 6), { start: 8.4, end: 40 });
  assert.equal(freeClipWindow(10, [[0, 8]], 6), null, '1.6 s left cannot carry 6 s even at 0.6x');
  assert.equal(clipEnd({ videoStart: 5, videoDur: 3 }), 8, 'a videoDur not past the start is a length');
  assert.equal(clipEnd({ videoStart: 2, videoDur: 3 }), 3, 'otherwise it is the end time in the file');
  const donor = { type: 'photo', video: 'c.mp4', videoStart: 0, videoDur: 40, videoW: 1280, videoH: 720, image: 'c.jpg' };
  const held = { type: 'words', bg: 'prev', heldBg: true, image: 'c.jpg', text: 'x' };
  const held2 = { type: 'photo', bg: 'prev', heldBg: true, image: 'c.jpg' };
  const borrower = { type: 'photo', borrowed: true, image: 'c.jpg', video: 'c.mp4', videoStart: 0, videoDur: 40, videoW: 1280, videoH: 720 };
  const pre = { type: 'slam', bg: 'next', heldBg: true, image: 'd.jpg' };
  const d2 = { type: 'photo', video: 'd.mp4', videoStart: 9, videoDur: 30, image: 'd.jpg' };
  const scenes = [donor, held, held2, { type: 'photo', image: 'x.jpg' }, borrower, pre, d2];
  const secs = [6, 4, 3, 5, 6, 3, 5];
  const heldMap = new WeakMap([[held, { src: donor, pre: false }], [held2, { src: held, pre: false }], [pre, { src: d2, pre: true }]]);
  const r = finalizeClipWindows(scenes, secs, { held: heldMap, borrowed: new WeakMap([[borrower, donor]]) });
  assert.deepEqual([held.video, held.videoStart], ['c.mp4', 6], 'the held line rolls on from where the shot left it');
  assert.equal(held2.videoStart, 10, 'a second held line continues after the first');
  assert.ok(borrower.videoStart >= 13, `the borrower plays footage nobody else plays (${borrower.videoStart})`);
  assert.deepEqual([pre.videoStart, pre.videoDur], [6, 9], 'a pre-lap plays the moment just before its shot');
  assert.deepEqual(r, { continued: 3, borrowed: 1, cropped: 0 });
});

test('clip start: a clip that opens on a still stretch starts where it moves; a slow clip keeps its start', async () => {
  const { parseFreezes, motionStart } = await import('../docu-engine/lib/produce.mjs');
  const out = '[freezedetect @ 0] lavfi.freezedetect.freeze_start: 0\n[freezedetect @ 0] lavfi.freezedetect.freeze_duration: 6\n[freezedetect @ 0] lavfi.freezedetect.freeze_end: 6\n[freezedetect @ 0] lavfi.freezedetect.freeze_start: 8.5\n';
  const fr = parseFreezes(out);
  assert.deepEqual(fr, [{ start: 0, end: 6 }, { start: 8.5, end: Infinity }]);
  // Cooper, scene 138 (1-based): 6 s of a dark street, then the lights move.
  assert.equal(motionStart(fr, { start: 0, end: 12, need: 6 }), 6);
  assert.equal(motionStart(fr, { start: 0, end: 12, need: 12 }), 0, 'not enough footage after the still part: keep');
  assert.equal(motionStart([{ start: 0, end: 5.5 }, { start: 5.5, end: 8.5 }, { start: 8.5, end: 11 }, { start: 11.2, end: Infinity }], { start: 0, end: 20, need: 5 }), 0, 'slow all the way (rain on glass): keep');
  assert.equal(motionStart([{ start: 2, end: 6 }], { start: 0, end: 20, need: 5 }), 6, 'a still card inside the window (an archive title card): jump past it');
  assert.equal(motionStart([{ start: 2, end: 8 }], { start: 2, end: 40, need: 4.4 }), 10, '1929 gold standard: "SEEING LONDON" card 4-10 s into the clip (scan starts at videoStart 2)');
  assert.equal(motionStart([{ start: 7, end: 9 }], { start: 0, end: 20, need: 5 }), 0, 'still part after the window: keep');
  assert.equal(motionStart([{ start: 2, end: 3 }], { start: 0, end: 20, need: 5 }), 0, 'a short pause is not a card: keep');
  assert.equal(motionStart([], { start: 3, end: 20, need: 5 }), 3);
  assert.equal(motionStart([{ start: 0, end: 3 }, { start: 3.3, end: 6 }, { start: 9, end: 10 }], { start: 2, end: 30, need: 8 }), 8, 'still stretches closer than 0.6 s are one; the start is relative to videoStart');
});

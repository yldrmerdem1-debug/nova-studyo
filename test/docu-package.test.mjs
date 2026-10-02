// YouTube paketi (docu-package.js): adaylar, başlık/kapak kuralları, sahte model ve sahte
// çizici ile uçtan uca paket, okunurluk düzeltmesi, kayıttan yeniden kullanım ve kredisiz
// belirleyici yedek. Ağ ve ücretli çağrı YOK; motor (Remotion) çalıştırılmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-pkg-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');

const P = await import('../src/pipeline/docu-package.js');

/* ---------------------------------------------------------------- sahte iş */
function makeJob({ cover = false } = {}) {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const id = path.basename(dir);
  const pub = path.join(dir, 'docu', 'public');
  const b = path.join(pub, 'build', id);
  fs.mkdirSync(b, { recursive: true });
  const img = (name, w, h) => execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}`, '-frames:v', '1', path.join(b, name)]);
  img('arch-face.jpg', 600, 800); // gerçek arşiv portresi
  img('arch-money.jpg', 1400, 920); // gerçek arşiv nesnesi
  img('arch-stock.jpg', 1920, 1080); // stok (pexels)
  img('arch-tiny.jpg', 300, 200); // çok küçük
  img('clip-sky.jpg', 1280, 720); // stok klip karesi
  for (let i = 0; i < 6; i++) img(`img-ai${i}.jpg`, 1536, 1024); // AI kareleri
  const rel = (f) => `build/${id}/${f}`;
  const scenes = [
    { type: 'title', title: 'The Man Who Jumped', image: rel('arch-money.jpg'), archived: true, say: 'The only unsolved hijacking.' },
    { type: 'photo', search: 'FBI composite sketch portrait', image: rel('arch-face.jpg'), archived: true, say: '[whispers] No body. No parachute.', mood: 'dread' },
    { type: 'photo', image: rel('arch-stock.jpg'), archived: true, say: 'A stormy night.' },
    { type: 'photo', image: rel('arch-tiny.jpg'), archived: true, say: 'A tiny print.' },
    { type: 'words', text: 'Rain', image: rel('clip-sky.jpg'), video: rel('clip-sky.mp4'), archived: true, say: 'Rain everywhere.' },
    ...[0, 1, 2, 3, 4, 5].map((i) => ({ type: 'photo', image: rel(`img-ai${i}.jpg`), imagePrompt: `AI scene ${i}`, say: `Line ${i}.`, mood: i === 2 ? 'reveal' : 'tension' })),
    { type: 'board', items: [{ label: 'Money', image: rel('arch-money.jpg') }], say: 'The evidence board.' },
    { type: 'title', chapterCard: true, title: 'Chapter 2' },
  ];
  fs.writeFileSync(path.join(dir, 'docu', 'engine-script.json'), JSON.stringify({ id, title: 'D.B. Cooper: The Man Who Jumped Into the Dark', genre: 'crime', locale: 'en', era: '1971', chapters: ['The Night', 'The Hunt'], scenes: scenes.filter((s) => !s.chapterCard) }));
  fs.writeFileSync(path.join(dir, 'docu', `${id}.props.json`), JSON.stringify({ script: { id, title: 'D.B. Cooper', genre: 'crime', locale: 'en', scenes } }));
  const credits = {
    'scene-0': { provider: 'wikimedia', eser: 'Money stolen by D. B. Cooper', file: rel('arch-money.jpg'), imgW: 1400, imgH: 920 },
    'scene-1': { provider: 'wikipedia', eser: 'CompositeB-FBI-1973.jpg', file: rel('arch-face.jpg') },
    'scene-2': { provider: 'pexels', eser: 'storm', file: rel('arch-stock.jpg') },
    'scene-3': { provider: 'wikimedia', eser: 'tiny', file: rel('arch-tiny.jpg') },
    'scene-4': { provider: 'pixabay', eser: 'sky', file: rel('clip-sky.mp4'), type: 'video' },
  };
  fs.writeFileSync(path.join(dir, 'docu-archive-done.json'), JSON.stringify({ key: 'k', credits }));
  fs.writeFileSync(path.join(dir, 'seo.json'), JSON.stringify({ titles: ['D.B. Cooper: The Man Who Jumped Into the Dark', 'D.B. Cooper: Did He Survive the Jump?'], thumbnailText: 'DEAD OR HOME?', description: 'Did he die?\n\n{BOLUMLER}', tags: ['DB Cooper'], pinnedComment: 'Which theory?' }));
  fs.writeFileSync(path.join(dir, 'seo.md'), '# t\n\n## Açıklama (kopyala-yapıştır)\n```\nDid he die?\n\n00:00 The Night\n```\n\n## Etiketler\n');
  fs.writeFileSync(path.join(dir, 'thumbnail.jpg'), 'frame-grab');
  if (cover) fs.writeFileSync(path.join(dir, 'cover.json'), JSON.stringify({ selected: 'thumb_b.jpg' }));
  return { dir, id };
}

/** Sahte çizici: her kapak için gerçek bir jpg yazar, çağrıları kaydeder. */
function fakeRender(calls) {
  return async ({ items, assets }) => {
    calls.push({ items: items.map((x) => ({ out: x.out, thumb: structuredClone(x.props.thumb), brand: x.props.brand })), assets: { ...assets } });
    for (const it of items) execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=1280x720', '-frames:v', '1', it.out]);
    return { files: items.map((x) => x.out), failed: [] };
  };
}

const PLAN = {
  titles: [
    { text: 'D.B. Cooper: The Night He Vanished Into the Rain', angle: 'mystery' },
    { text: 'WHAT THE FBI FOUND IN THE SAND', angle: 'detail' },
    { text: 'The $200,000 Question Nobody Answered', angle: 'number' },
    { text: 'D.B. Cooper: Did He Survive the Jump?', angle: 'question' },
    { text: 'He Asked for Four Parachutes. Why?', angle: 'detail' },
  ],
  thumbnails: [
    { hero: 'c1', layout: 'hero', text: 'He Never Landed', highlight: 1, tag: '1971', number: '', second: '', labels: [], accent: 'accent', grade: 'warm', side: 'left', zoom: 1.1, emotion: 'mystery', titleIndex: 0, why: 'face' },
    { hero: 'c2', layout: 'circle', text: 'Why Here?', highlight: 1, tag: '', number: '', second: '', labels: [], accent: 'red', grade: 'natural', side: 'left', zoom: 1, emotion: 'curiosity', titleIndex: 1, why: 'detail' },
    { hero: 'c2', layout: 'number', text: 'Never Spent', highlight: 1, tag: '', number: '$200,000', second: '', labels: [], accent: 'accent', grade: 'natural', side: 'right', zoom: 1, emotion: 'awe', titleIndex: 2, why: 'number' },
  ],
  recommended: 0,
};

function fakeVision(log, { failSecond = true } = {}) {
  return async (o) => {
    log.push({ kind: o.schema?.properties?.candidates ? 'rank' : 'verify', model: o.model, images: o.images.length });
    if (o.schema?.properties?.candidates) {
      o.usage && (o.usage.byModel ||= {}, o.usage.byModel[o.model] = { requests: 1, inputTokens: 3000, outputTokens: 800 });
      const ids = o.images.map((im) => im.etiket.split(' ')[0]);
      return { candidates: ids.map((id, i) => ({ id, score: 9 - i * 0.5, subject: i === 0 ? 'face' : 'object', emotion: 'mystery', box: { x: 20, y: 10, w: 60, h: 70 }, hasDetail: i === 1, detail: { x: 0.4, y: 0.1, w: 0.15, h: 0.4 }, description: `pic ${id}`, issues: [] })) };
    }
    return { thumbnails: o.images.map((im, i) => ({ n: +im.etiket.slice(1), readText: failSecond && i === 1 ? 'wh' : ['HE NEVER LANDED', 'WHY HERE?', '$200,000 NEVER SPENT'][i], readable: !(failSecond && i === 1), subjectClear: true, score: failSecond && i === 1 ? 4 : 8, fixes: failSecond && i === 1 ? ['bigger_text', 'fewer_words'] : [], note: '' })) };
  };
}

/* ---------------------------------------------------------------- birimler */

test('image headers give pixel sizes without decoding (JPEG, PNG)', () => {
  const d = fs.mkdtempSync(path.join(home, 'img-'));
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=334x222', '-frames:v', '1', path.join(d, 'a.jpg')]);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=64x48', '-frames:v', '1', path.join(d, 'b.png')]);
  assert.deepEqual(P.imageSize(path.join(d, 'a.jpg')), { w: 334, h: 222 });
  assert.deepEqual(P.imageSize(path.join(d, 'b.png')), { w: 64, h: 48 });
  assert.equal(P.imageSize(path.join(d, 'none.jpg')), null);
});

test('candidates come from the video itself: real archive first, stock/AI/clip classified, tiny pictures sink, chapter cards skipped', () => {
  const { dir, id } = makeJob();
  const script = JSON.parse(fs.readFileSync(path.join(dir, 'docu', `${id}.props.json`), 'utf8')).script;
  const credits = JSON.parse(fs.readFileSync(path.join(dir, 'docu-archive-done.json'), 'utf8')).credits;
  const all = P.collectCandidates({ script, credits, publicDir: path.join(dir, 'docu', 'public') });
  const kind = Object.fromEntries(all.map((c) => [path.basename(c.rel), c.kind]));
  assert.equal(kind['arch-face.jpg'], 'archive');
  assert.equal(kind['arch-stock.jpg'], 'stock');
  assert.equal(kind['clip-sky.jpg'], 'stock-clip', 'a clip poster maps to its .mp4 credit');
  assert.equal(kind['img-ai0.jpg'], 'ai');
  assert.equal(path.basename(all[0].rel), 'arch-face.jpg', 'a real portrait ranks first');
  const at = (f) => all.findIndex((c) => c.rel.endsWith(f));
  assert.ok(at('arch-tiny.jpg') > Math.max(...all.filter((c) => c.kind === 'ai').map((c) => all.indexOf(c))), 'a 300px print ranks below every AI still');
  assert.equal(all.filter((c) => c.rel.endsWith('arch-money.jpg')).length, 1, 'a picture used twice is one candidate');
  const short = P.shortlist(all, 8);
  assert.ok(short.filter((c) => c.kind === 'ai').length <= 4);
  assert.deepEqual(short.map((c) => c.id).slice(0, 3), ['c1', 'c2', 'c3']);
});

test('titles: ALL CAPS is fixed, > 60 characters dropped, duplicates removed, topped up from seo.json to five', () => {
  assert.ok(P.isAllCaps('WHAT THE FBI FOUND IN THE SAND'));
  assert.ok(!P.isAllCaps('What the FBI Found in the Sand'));
  const t = P.sanitizeTitles([{ text: 'WHAT THE FBI FOUND IN THE SAND' }, { text: 'x'.repeat(61) }, { text: 'Same Title.' }, { text: 'same title' }], ['Seo One', 'Seo Two', 'Seo Three']);
  assert.equal(t[0].text, 'What The FBI Found In The Sand', 'acronyms survive the repair');
  assert.equal(t[1].text, 'Same Title', 'trailing period dropped');
  assert.equal(t.length, 5);
  assert.deepEqual(t.slice(2).map((x) => x.from), ['seo', 'seo', 'seo']);
  assert.ok(t.every((x) => x.chars <= P.TITLE_MAX));
});

test('plan rules the model must meet: five short titles, three different templates, 1-4 words, known pictures', () => {
  const ids = ['c1', 'c2', 'c3'];
  assert.deepEqual(P.planErrors(PLAN, { ids }), ['titles[1] BÜYÜK HARF olmamalı'], 'ALL CAPS goes back to the model for repair');
  const bad = structuredClone(PLAN);
  bad.titles[0].text = 'A'.repeat(70);
  bad.thumbnails[0].text = 'one two three four five';
  bad.thumbnails[1].hero = 'c9';
  bad.thumbnails[2].layout = 'hero';
  bad.thumbnails[1].layout = 'hero';
  const e = P.planErrors(bad, { ids }).join(' | ');
  assert.match(e, /titles\[0\] 70 karakter/);
  assert.match(e, /yazı 5 kelime/);
  assert.match(e, /hero geçersiz/);
  assert.match(e, /farklı şablon/);
  const numBad = structuredClone(PLAN);
  numBad.thumbnails[2].text = 'Never Ever Spent Anywhere';
  assert.match(P.planErrors(numBad, { ids }).join(' '), /yazı 5 kelime/, 'the figure counts as a word');
});

test('legibility fixes are deterministic: bigger text, darker ground, a dropped filler word (the highlight stays)', () => {
  const s = P.fixSpec({ text: 'He Never Really Landed', highlight: 3, zoom: 1 }, { readable: false, subjectClear: true, fixes: ['fewer_words'] });
  assert.equal(s.text, 'Never Really Landed');
  assert.equal(s.highlight, 2);
  assert.equal(s.textScale, 1.2);
  assert.equal(s.scrim, 0.5);
  const t = P.fixSpec({ text: 'Why Here?', highlight: 1, zoom: 1, side: 'left' }, { readable: true, subjectClear: false, fixes: ['flip_side'] });
  assert.equal(t.zoom, 1.2);
  assert.equal(t.side, 'right');
  assert.equal(t.textScale, undefined);
  assert.ok(P.textMatches('$200,000 Never Spent', '$200,000 NEVER SPENT'));
  assert.ok(!P.textMatches('Why Here?', 'wh'));
});

/* ---------------------------------------------------------------- uçtan uca */

test('full package with mocked models: 3 thumbnails, 5 titles, a failed 320x180 check re-renders only that thumbnail, UI copies, then the saved plan is reused for free', async () => {
  const { dir, id } = makeJob();
  const calls = [];
  const vlog = [];
  const plans = [];
  const llm = async (o) => {
    plans.push(o);
    assert.equal(o.model, 'claude-opus-5-5');
    assert.match(o.user, /c1: REAL archive photo "CompositeB-FBI-1973.jpg"/);
    assert.equal(o.validate(PLAN).length, 1, 'the ALL CAPS title would be sent back');
    o.usage.byModel['claude-opus-5-5'] = { requests: 1, inputTokens: 6000, outputTokens: 3000 };
    return structuredClone(PLAN);
  };
  const usage = {};
  const logs = [];
  const res = await P.runDocuPackage({ jobDir: dir, job: { id, language: 'en' }, settings: {}, usage, logFn: (m) => logs.push(m), llm, visionLlm: fakeVision(vlog), render: fakeRender(calls), ffmpeg: FFMPEG });

  assert.equal(res.mode, 'llm');
  assert.equal(plans.length, 1, 'one Opus call');
  assert.deepEqual(vlog.map((x) => x.kind), ['rank', 'verify'], 'one ranking call, one legibility call');
  assert.ok(vlog.every((x) => x.model === 'claude-sonnet-5-5'));
  assert.ok(vlog[0].images >= 8 && vlog[0].images <= 12);
  assert.equal(vlog[1].images, 3);
  // Çizim: önce 3, sonra yalnızca okunamayan #2 düzeltilmiş hâliyle.
  assert.equal(calls.length, 2);
  assert.equal(calls[0].items.length, 3);
  assert.equal(calls[1].items.length, 1);
  assert.ok(calls[1].items[0].out.endsWith('thumb-2.jpg'));
  assert.equal(calls[1].items[0].thumb.textScale, 1.2);
  assert.equal(calls[1].items[0].thumb.scrim, 0.5);
  assert.equal(calls[0].items[0].brand.genre, 'crime');
  // Özne kutusu 0-100 ölçeğinden normalize edildi; kahraman görseli çizim klasörüne varlık olarak verildi.
  assert.deepEqual(calls[0].items[0].thumb.hero.box, { x: 0.2, y: 0.1, w: 0.6, h: 0.7 });
  assert.ok(Object.keys(calls[0].assets).length >= 2);
  assert.equal(calls[0].items[2].thumb.number, '$200,000');
  assert.equal(calls[0].items[1].thumb.accentRole, 'red');

  for (const n of [1, 2, 3]) {
    assert.ok(fs.existsSync(path.join(dir, 'thumbnails', `thumb-${n}.jpg`)));
    assert.deepEqual(P.imageSize(path.join(dir, 'thumbnails', `thumb-${n}-small.jpg`)), { w: 320, h: 180 });
  }
  const tj = JSON.parse(fs.readFileSync(path.join(dir, 'titles.json'), 'utf8'));
  assert.equal(tj.titles.length, 5);
  assert.equal(tj.titles[1].text, 'What The FBI Found In The Sand', 'ALL CAPS title repaired');
  assert.equal(tj.thumbnails.length, 3);
  assert.equal(tj.thumbnails[1].legibility.pass, false);
  assert.equal(tj.thumbnails[1].legibility.fixed, true);
  assert.equal(tj.recommended.thumbnail, 'thumbnails/thumb-1.jpg');
  assert.equal(tj.recommended.title, PLAN.titles[0].text);
  const md = fs.readFileSync(path.join(dir, 'package.md'), 'utf8');
  assert.match(md, /## Başlıklar/);
  assert.match(md, /00:00 The Night/, 'the description comes from seo.md (chapters included)');
  assert.deepEqual(res.outputs.thumbs, ['thumb_a.jpg', 'thumb_b.jpg', 'thumb_c.jpg']);
  assert.match(res.outputs.thumbLabels['thumb_c.jpg'], /Sayı: \$200,000 Never Spent/);
  assert.notEqual(fs.readFileSync(path.join(dir, 'thumbnail.jpg'), 'utf8'), 'frame-grab', 'the recommended thumbnail becomes the default');
  assert.ok(res.cost.usd > 0 && res.cost.usd < 0.6, `cost ${res.cost.usd}`);
  assert.equal(usage.byModel['claude-opus-5-5'].requests, 1, 'package usage is added to the job usage');

  // İkinci çalıştırma: kayıtlı plan, sıralama ve okunurluk — model çağrısı yok.
  const calls2 = [];
  const vlog2 = [];
  const res2 = await P.runDocuPackage({ jobDir: dir, job: { id, language: 'en' }, settings: {}, logFn: () => {}, llm: async () => { throw new Error('should not be called'); }, visionLlm: fakeVision(vlog2), render: fakeRender(calls2), ffmpeg: FFMPEG });
  assert.equal(vlog2.length, 0);
  assert.equal(res2.mode, 'llm');
  assert.equal(calls2.length, 1);
  assert.equal(calls2[0].items[1].thumb.textScale, 1.2, 'the fixed spec is what gets redrawn');
});

test('no Anthropic credit: deterministic fallback — best real photo, title from seo.json, one thumbnail, no further calls', async () => {
  const { dir, id } = makeJob({ cover: true });
  const calls = [];
  let tried = 0;
  const broke = async () => { tried++; throw new Error('400 {"error":{"message":"Your credit balance is too low to access the Anthropic API."}}'); };
  const logs = [];
  const res = await P.runDocuPackage({ jobDir: dir, job: { id, language: 'en' }, settings: {}, logFn: (m) => logs.push(m), llm: broke, visionLlm: broke, render: fakeRender(calls), ffmpeg: FFMPEG });
  assert.equal(res.mode, 'fallback');
  assert.equal(tried, 1, 'after the first credit error no other model call is tried');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].items.length, 1);
  const th = calls[0].items[0].thumb;
  assert.equal(th.layout, 'hero');
  assert.equal(th.text, 'DEAD OR HOME?');
  assert.ok(th.hero.src.startsWith('pk/'));
  const tj = JSON.parse(fs.readFileSync(path.join(dir, 'titles.json'), 'utf8'));
  assert.equal(tj.titles[0].text, 'D.B. Cooper: The Man Who Jumped Into the Dark');
  assert.equal(tj.thumbnails[0].heroFile.endsWith('arch-face.jpg'), true, 'the real portrait, not an AI still');
  assert.ok(tj.notes.some((n) => /kredisi yok/.test(n)));
  assert.equal(fs.readFileSync(path.join(dir, 'thumbnail.jpg'), 'utf8'), 'frame-grab', 'a cover the user chose is never replaced');
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'docu-package.json'), 'utf8'));
  assert.equal(saved.plan, null, 'a fallback plan is not cached: the next run tries the models again');
  assert.ok(logs.some((m) => /belirleyici yedek/.test(m)));
});

test('a renderer failure never breaks the package: titles and package.md are still written', async () => {
  const { dir, id } = makeJob();
  const res = await P.runDocuPackage({
    jobDir: dir, job: { id, language: 'en' }, settings: {}, logFn: () => {}, llm: async () => structuredClone(PLAN), visionLlm: fakeVision([], { failSecond: false }),
    render: async ({ items }) => ({ files: [], failed: items.map((x) => ({ out: x.out, error: 'no composition' })) }), ffmpeg: FFMPEG,
  });
  assert.equal(res.thumbs.length, 0);
  assert.deepEqual(res.outputs.thumbs, []);
  assert.ok(fs.existsSync(path.join(dir, 'package.md')));
  assert.ok(res.notes.some((n) => /çizilemedi/.test(n)));
});

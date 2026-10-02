// Render öncesi dönem denetimi (docu-era-audit.js): aday seçimi (stok/AI/montaj; kurum
// arşivi düşük risk), etiketli kontak sayfaları + yakından onay (sahte model), karar
// önbelleği (ikinci geçiş ücretsiz), uygulama (ret listesi + arşiv kaydı silme; AI dosyası
// silme + aiFix), motora giden senaryoda AI'a düşme, arşiv adımında reddedilen adresin
// aday listesinden düşmesi, kredi yokken temiz duruş. Ağ ve ücretli çağrı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-era-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');

const E = await import('../src/pipeline/docu-era-audit.js');
const Q = await import('../src/pipeline/docu-qa.js');
const arch = await import('../src/pipeline/docu-archive.js');

/* ---------------------------------------------------------------- sentetik iş */
const BUILD = 'build/t';
function makeJob(era = '1929-1933') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-era-job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(path.join(pub, BUILD), { recursive: true });
  const img = (name, src) => { execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${src}=size=640x360`, '-frames:v', '1', path.join(pub, BUILD, name)]); return `${BUILD}/${name}`; };
  const clip = (name, src) => { execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `${src}=size=640x360:rate=30:duration=6`, '-pix_fmt', 'yuv420p', path.join(pub, BUILD, name)]); return `${BUILD}/${name}`; };
  const files = {
    stockClip: clip('clip-aaa.mp4', 'testsrc2'), stockStill: img('clip-aaa.jpg', 'testsrc2'),
    loc: img('arch-bbb.jpg', 'smptebars'),
    ai: img('img-0123456789ab.jpg', 'mandelbrot'),
    pexels: img('arch-ccc.jpg', 'cellauto'),
    monAi: img('img-abcdef012345.jpg', 'rgbtestsrc'),
    monStock: img('arch-ddd.jpg', 'yuvtestsrc'),
  };
  const scenes = [
    { type: 'photo', source: 'stock', search: 'city street shoeshine', say: 'A shoeshine boy on the street.', dur: 4, media: 'video', archived: true, image: files.stockStill, video: files.stockClip, videoStart: 0, videoDur: 6, imagePrompt: 'p0' },
    { type: 'photo', source: 'archive', search: 'Herbert Hoover portrait', say: 'Hoover promised prosperity.', dur: 4, archived: true, image: files.loc, imagePrompt: 'p1' },
    { type: 'photo', source: 'ai', say: 'Brokers stared at the ticker.', dur: 4, imagePrompt: 'brokers around a ticker machine' },
    { type: 'words', source: 'stock', search: 'gold bars', say: 'Gold fled the country.', dur: 4, archived: true, image: files.pexels, imagePrompt: 'p3' },
    { type: 'montage', say: 'The bell rang.', dur: 3, imagePrompts: ['a closing bell', { prompt: 'Federal Hall', search: 'federal hall new york', source: 'stock', image: files.monStock }] },
    { type: 'photo', bg: 'prev', say: 'And then silence.', dur: 3 },
  ];
  const script = { id: 't', title: 'Crash', era, scenes };
  const credits = {
    'scene-0': { provider: 'pexels', url: 'https://videos.pexels.com/video-files/1/1-hd.mp4', sayfa: 'https://www.pexels.com/video/shoeshine-1/', type: 'video' },
    'scene-1': { provider: 'loc', url: 'https://tile.loc.gov/hoover.jpg' },
    'scene-3': { provider: 'pixabay', url: 'https://pixabay.com/get/gSIGNED123', sayfa: 'https://pixabay.com/photos/gold-bars-42/' },
    'scene-4-m1': { provider: 'pexels', url: 'https://images.pexels.com/photos/9/federal.jpg', sayfa: 'https://www.pexels.com/photo/federal-9/' },
  };
  // Motorun son çizdiği senaryo: bölüm kartı + AI görselleri (sahne 3 ve montajın ilk karesi).
  const props = { script: { scenes: [
    { type: 'title', chapterCard: true },
    scenes[0], scenes[1],
    { ...scenes[2], image: files.ai },
    scenes[3],
    { ...scenes[4], images: [files.monAi, files.monStock] },
    { ...scenes[5], image: files.loc, heldBg: true },
  ] } };
  fs.writeFileSync(path.join(dir, 'docu', 't.props.json'), JSON.stringify(props));
  return { dir, pub, script, credits, files };
}

/** Sahte görme modeli: istekleri kaydeder; ilk tarama ve yakından onay yanıtları verilir. */
function fakeLlm({ scan, confirm }) {
  const calls = [];
  const fn = async (o) => {
    calls.push(o);
    if (o.schema?.properties?.flags) return { flags: scan };
    return { items: confirm };
  };
  fn.calls = calls;
  return fn;
}

/* ---------------------------------------------------------------- testler */

test('era gate: a story from 1995 on is not audited (no model call)', async () => {
  const { dir, pub, script, credits } = makeJob('2003');
  const llm = fakeLlm({ scan: [], confirm: [] });
  const r = await E.auditEra({ script, credits, dir, publicDir: pub, settings: { ffmpegPath: FFMPEG }, llm, ffmpeg: FFMPEG });
  assert.equal(r.skipped, 'era');
  assert.equal(llm.calls.length, 0);
});

test('eraItems: stock clip (3 frames), archive photo (low risk, 1 frame), AI image from the engine props, montage AI + stock frames; borrowed/bg scenes skipped', () => {
  const { pub, script, credits, files } = makeJob();
  const items = E.eraItems(script, credits, { publicDir: pub, propsFile: path.join(path.dirname(pub), 't.props.json') });
  const by = Object.fromEntries(items.map((x) => [x.label, x]));
  assert.deepEqual(Object.keys(by).sort(), ['1', '2', '3', '4', '5m1', '5m2'].sort());
  assert.equal(by['1'].kind, 'archive'); assert.equal(by['1'].risk, 0); assert.equal(by['1'].times.length, 3); assert.equal(by['1'].page, 'https://www.pexels.com/video/shoeshine-1/');
  assert.equal(by['2'].risk, 2, 'LoC is low risk');
  assert.equal(by['3'].kind, 'ai'); assert.equal(by['3'].file, files.ai);
  assert.equal(by['5m1'].kind, 'ai'); assert.equal(by['5m1'].id, '4-m0');
  assert.equal(by['5m2'].kind, 'archive'); assert.equal(by['5m2'].provider, 'pexels');
  assert.equal(E.idOfLabel('#5m2'), '4-m1');
  assert.equal(E.idOfLabel('12 a'), 11);
  // Bütçe: önce stok + AI, sonra karışık, en son kurum arşivi.
  const sel = E.selectWithinBudget(items, 7);
  assert.ok(!sel.chosen.some((x) => x.label === '2'), 'the low-risk archive photo is the one left out');
});

test('auditEra: labelled sheets → scan flags → close-up confirmation; only confirmed + cached; second run pays nothing', async () => {
  const { dir, pub, script, credits } = makeJob();
  const llm = fakeLlm({
    scan: [
      { id: '1', what: 'modern city bus behind the man', confidence: 'high' },
      { id: '3', what: 'modern computer monitor', confidence: 'high' },
      { id: '4', what: 'glossy modern gold bars', confidence: 'medium' },   // stok: medium da onaya gider
      { id: '2', what: 'maybe modern glasses', confidence: 'medium' },      // arşiv + medium: dokunulmaz
      { id: '99', what: 'unknown label', confidence: 'high' },
    ],
    confirm: [
      { id: '1', modern: true, what: 'modern city bus' },
      { id: '3', modern: false, what: 'it is a chair back' },
      { id: '4', modern: true, what: 'glossy CGI gold bars' },
    ],
  });
  const logs = [];
  const r = await E.auditEra({ script, credits, dir, publicDir: pub, settings: { ffmpegPath: FFMPEG }, llm, ffmpeg: FFMPEG, logFn: (m) => logs.push(m), apply: false });
  assert.equal(llm.calls.length, 2, 'one sheet call + one confirmation call');
  const [scan, conf] = llm.calls;
  assert.equal(scan.model, 'claude-sonnet-5-5');
  assert.ok(scan.images.length >= 1 && scan.images[0].etiket.includes('1a'), 'sheet label lists the tiles');
  assert.match(scan.user, /HİKÂYENİN DÖNEMİ: 1929-1933/);
  assert.match(scan.user, /Charging Bull/);
  assert.match(scan.user, /A shoeshine boy on the street/);
  assert.equal(conf.images.length, 3, 'scan flags 1 (high), 3 (high, AI) and 4 (medium, stock) go to close-up; 2 (medium, archive) does not');
  assert.deepEqual(r.flagged.map((f) => f.label).sort(), ['1', '4']);
  assert.ok(r.doubts.some((d) => d.label === '3') && r.doubts.some((d) => d.label === '2'));
  assert.equal(r.flagged.find((f) => f.label === '1').page, 'https://www.pexels.com/video/shoeshine-1/');
  assert.match(logs.join('\n'), /Dönem denetimi \(1929-1933\): .*2 dönem dışı/);
  // İkinci geçiş: hepsi önbellekten, model çağrılmaz.
  const llm2 = fakeLlm({ scan: [], confirm: [] });
  const r2 = await E.auditEra({ script, credits, dir, publicDir: pub, settings: { ffmpegPath: FFMPEG }, llm: llm2, ffmpeg: FFMPEG, apply: false });
  assert.equal(llm2.calls.length, 0);
  assert.deepEqual(r2.flagged.map((f) => f.label).sort(), ['1', '4']);
  assert.equal(r2.cached, r2.flagged.length + r2.doubts.length + (E.eraItems(script, credits, { publicDir: pub, propsFile: path.join(dir, 'docu', 't.props.json') }).length - 4));
});

test('apply: archive flags → rejection list (url + page) + archive cache invalidated; AI flag → file deleted + aiFix once', async () => {
  const { dir, pub, script, credits, files } = makeJob();
  // Arşiv önbelleği: sahne 0 (klip), 3, montaj karesi 4-m1.
  const keys = Q.archiveKeys(script);
  const cache = {};
  for (const k of keys) { cache[k.key] = { file: 'x', url: 'u' }; cache[k.vkey] = { video: 'v', url: 'u' }; }
  fs.writeFileSync(path.join(dir, 'docu-archive.json'), JSON.stringify(cache));
  fs.writeFileSync(path.join(dir, 'docu-archive-done.json'), '{}');
  fs.copyFileSync(path.join(pub, files.ai), path.join(pub, files.ai.replace(/\.jpg$/, '.lift.jpg')));
  const llm = fakeLlm({
    scan: [{ id: '1', what: 'modern bus', confidence: 'high' }, { id: '3', what: 'modern monitor', confidence: 'high' }, { id: '5m2', what: 'tourists in modern clothes', confidence: 'high' }],
    confirm: [{ id: '1', modern: true, what: 'modern bus' }, { id: '3', modern: true, what: 'flat-screen monitor' }, { id: '5m2', modern: true, what: 'tourists in modern clothes' }],
  });
  const r = await E.auditEra({ script, credits, dir, publicDir: pub, settings: { ffmpegPath: FFMPEG }, llm, ffmpeg: FFMPEG, docKey: 'K' });
  assert.deepEqual(r.applied.ids.sort(), [0, '4-m1'].sort());
  assert.equal(r.applied.aiRegen, 1);
  const fixes = E.readEraFixes(dir);
  assert.equal(fixes.docKey, 'K');
  assert.deepEqual(fixes.scenes['0'].rejected, ['https://videos.pexels.com/video-files/1/1-hd.mp4', 'https://www.pexels.com/video/shoeshine-1/']);
  assert.match(fixes.aiFix['2'], /^Strictly period-accurate for 1929-1933, no modern objects \(avoid: flat-screen monitor\)\.$/);
  const left = JSON.parse(fs.readFileSync(path.join(dir, 'docu-archive.json'), 'utf8'));
  for (const k of keys) {
    const gone = k.i === 0 || k.i === '4-m1';
    assert.equal(k.key in left, !gone, `scene ${k.i} key`);
  }
  assert.ok(!fs.existsSync(path.join(dir, 'docu-archive-done.json')));
  assert.ok(!fs.existsSync(path.join(pub, files.ai)) && !fs.existsSync(path.join(pub, files.ai.replace(/\.jpg$/, '.lift.jpg'))), 'AI file and its lifted copy deleted');
  // Not taşıyan AI görseli yine işaretlenirse bir kez daha silinmez.
  const again = E.applyEraFlags({ dir, flagged: [{ id: 2, label: '3', kind: 'ai', file: files.ai, reason: 'x' }], keyScript: script, publicDir: pub, era: '1929-1933', docKey: 'K' });
  assert.equal(again.aiRegen, 0); assert.equal(again.aiRepeat, 1);
  assert.equal(E.eraRejectedUrls(fixes, '1929-1933').length, 4, 'scene 0 and frame 4-m1: url + page each');
  assert.deepEqual(E.eraRejectedUrls(fixes, '1912'), [], 'another era: no global rejections');
});

test('applyEraRejections: re-picked rejected source (url or page) → AI; montage frame → AI; aiFix on AI scene and string frame', () => {
  const { script, credits } = makeJob();
  const fixes = {
    scenes: {
      0: { rejected: ['https://other/url.mp4', 'https://www.pexels.com/video/shoeshine-1/'] },  // sayfa eşleşir (imzalı adres değişmiş)
      3: { rejected: ['https://pixabay.com/get/gSIGNED123'] },
      '4-m1': { rejected: ['https://images.pexels.com/photos/9/federal.jpg?w=1200'] },         // boyut parametresi farkı
      1: { rejected: ['https://not-this-one'] },
    },
    aiFix: { 2: 'Strictly period-accurate for 1929, no modern objects.', '4-m0': 'Strictly period-accurate for 1929, no modern objects.' },
  };
  const docu = structuredClone(script);
  const cr = structuredClone(credits);
  const r = E.applyEraRejections(docu, cr, fixes);
  assert.equal(r.toAi, 3);
  assert.ok(!docu.scenes[0].archived && !docu.scenes[0].video && !cr['scene-0']);
  assert.ok(!docu.scenes[3].archived && !cr['scene-3']);
  assert.ok(docu.scenes[1].archived && cr['scene-1'], 'a different source stays');
  assert.ok(!docu.scenes[4].imagePrompts[1].image && !cr['scene-4-m1']);
  assert.equal(r.aiFix, 2);
  assert.equal(docu.scenes[2].aiFix, fixes.aiFix[2]);
  assert.deepEqual(docu.scenes[4].imagePrompts[0], { prompt: 'a closing bell', aiFix: fixes.aiFix['4-m0'] });
});

test('no credit: the audit stops cleanly, nothing is cached, nothing applied', async () => {
  const { dir, pub, script, credits } = makeJob();
  const llm = async () => { throw new Error('400 Your credit balance is too low to access the Anthropic API.'); };
  const logs = [];
  const r = await E.auditEra({ script, credits, dir, publicDir: pub, settings: { ffmpegPath: FFMPEG }, llm, ffmpeg: FFMPEG, logFn: (m) => logs.push(m) });
  assert.equal(r.skipped, 'no-credit');
  assert.equal(r.flagged.length, 0);
  assert.equal(r.applied, null);
  assert.match(logs.join('\n'), /kredisi yok/);
  const cf = path.join(dir, 'docu-era-audit.json');
  assert.ok(!fs.existsSync(cf) || Object.keys(JSON.parse(fs.readFileSync(cf, 'utf8')).items).length === 0, 'no verdict cached');
  // Anahtar yoksa (gerçek model) hiç çağrı yok.
  const r2 = await E.auditEra({ script, credits, dir, publicDir: pub, settings: { ffmpegPath: FFMPEG }, ffmpeg: FFMPEG });
  assert.equal(r2.skipped, 'no-key');
});

test('resolveArchive(rejected): a rejected url/page never comes back as a candidate; a cached rejected pick is re-searched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-era-arch-'));
  const IMG = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-era-img-'));
  const files = {};
  for (const [n, src] of Object.entries({ a: 'testsrc2=size=1600x1000', b: 'smptebars=size=1600x1000' })) {
    files[n] = path.join(IMG, `${n}.png`);
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-frames:v', '1', files[n]]);
  }
  const cand = (n, page) => ({ provider: 'pixabay', type: 'image', url: `https://pixabay.com/get/g${n}${Math.random().toString(16).slice(2)}`, sayfa: page, width: 1600, height: 1000, eser: n, lisans: 'Pixabay' });
  const docu = { id: 't', era: '1929', scenes: [{ type: 'photo', source: 'stock', search: 'gold bars', say: 'Gold fled.', dur: 4, imagePrompt: 'x' }] };
  const seen = [];
  const run = (rejected) => arch.resolveArchive(docu, {
    dir, publicDir: path.join(dir, 'public'), buildPrefix: 'build/t', settings: { ffmpegPath: FFMPEG }, usage: {}, logFn: () => {}, rejected,
    deps: {
      search: async () => [cand('a', 'https://pixabay.com/photos/gold-a-1/'), cand('b', 'https://pixabay.com/photos/gold-b-2/')],
      pick: async (s, thumbs, { titles }) => { seen.push([...titles]); return { choice: 1, reason: 't', namedPersonIsMainSubject: true }; },
      download: async (url, dest) => { const n = url.split('/').pop()[1]; fs.copyFileSync(files[n], dest); return fs.statSync(dest).size; },
    },
  });
  const r1 = await run(null);
  assert.equal(r1.credits['scene-0'].eser, 'a');
  // Seçim imzalı adresle kayıtlı; yeniden aramada adres değişir — sayfa adresi reddedilir.
  const r2 = await run(['https://pixabay.com/photos/gold-a-1/']);
  assert.deepEqual(seen.at(-1), ['b'], 'the rejected photo is not even shown to the picker');
  assert.equal(r2.credits['scene-0'].eser, 'b');
});

test('engine hook: produce.mjs appends aiFix to the prompt only when present and drops the field', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docu-engine', 'lib', 'produce.mjs'), 'utf8');
  assert.match(src, /if \(sc\.aiFix && sc\.imagePrompt\) sc\.imagePrompt = `\$\{sc\.imagePrompt\}\. \$\{sc\.aiFix\}`;/);
  assert.match(src, /delete sc\.aiFix;/);
  assert.match(src, /if \(p\.aiFix && p\.prompt\) p\.prompt = `\$\{p\.prompt\}\. \$\{p\.aiFix\}`;/);
  // Hook, AI görsel tavanı ve üretimden ÖNCE.
  assert.ok(src.indexOf('delete sc.aiFix;') < src.indexOf('const AI_CAP ='));
  // Nova tarafı: docu.js denetimi arşivden sonra, motordan önce çağırır ve kapatılabilir.
  const docu = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu.js'), 'utf8');
  assert.match(docu, /settings\.docuEraAudit !== false/);
  assert.ok(docu.indexOf('await auditEra(') > docu.indexOf('const prep = await prepareEngineDocu()'));
  assert.ok(docu.indexOf('await auditEra(') < docu.indexOf('if (job.docuPrepareOnly)'));
  assert.match(docu, /rejected: eraRejectedUrls\(/);
});

test('second era rejection of the same scene: no more archive search, the scene becomes AI with the period note', async () => {
  const { dir, pub, script, credits } = makeJob();
  const flag = (url, page, reason) => ({ id: 3, label: '4', kind: 'archive', provider: 'pixabay', url, page, reason });
  const logs = [];
  const a1 = E.applyEraFlags({ dir, flagged: [flag('https://pixabay.com/get/g1', 'https://pixabay.com/photos/gold-1/', 'shiny modern gold bars')], keyScript: script, publicDir: pub, era: '1929-1933', docKey: 'K', logFn: (m) => logs.push(m) });
  assert.deepEqual(a1.toAi, [], 'first rejection: re-pick from the archive');
  assert.deepEqual(E.eraAiOnly(E.readEraFixes(dir), '1929-1933'), []);
  const a2 = E.applyEraFlags({ dir, flagged: [flag('https://pixabay.com/get/g2', 'https://pixabay.com/photos/gold-2/', 'modern minted ingots')], keyScript: script, publicDir: pub, era: '1929-1933', docKey: 'K', logFn: (m) => logs.push(m) });
  assert.deepEqual(a2.toAi, [3]);
  const fixes = E.readEraFixes(dir);
  assert.equal(fixes.scenes['3'].n, 2);
  assert.equal(fixes.scenes['3'].toAi, true);
  assert.match(fixes.aiFix['3'], /^Strictly period-accurate for 1929-1933, no modern objects \(avoid: modern minted ingots\)\.$/);
  assert.ok(logs.some((l) => /Sahne 4: 2\. kez dönem dışı bulundu — arşivde yeniden aranmayacak/.test(l)), logs.join('\n'));
  assert.deepEqual(E.eraAiOnly(fixes, '1929-1933'), [3]);
  assert.deepEqual(E.eraAiOnly(fixes, '1912'), [], 'another era: not applied');

  // Motora giden senaryo: kaynak bu kez reddedilmemiş olsa da sahne AI'a düşer, istemine not eklenir.
  const docu = structuredClone(script);
  const cr = { ...structuredClone(credits), 'scene-3': { provider: 'pixabay', url: 'https://pixabay.com/get/g3', sayfa: 'https://pixabay.com/photos/gold-3/' } };
  const r = E.applyEraRejections(docu, cr, fixes);
  assert.equal(r.toAi, 1);
  assert.ok(!docu.scenes[3].archived && !docu.scenes[3].image && !cr['scene-3']);
  assert.equal(docu.scenes[3].aiFix, fixes.aiFix['3']);
  assert.equal(docu.scenes[3].imagePrompt, 'p3', 'its own AI prompt; the engine appends aiFix');
  assert.ok(docu.scenes[0].archived && docu.scenes[1].archived, 'other scenes untouched');

  // Sayaçsız eski kayıt (1929 işi): her ret adres + sayfa iki satırdı → 4 satır = 2 ret → AI, not o an yazılır.
  const legacy = { era: '1929-1933', scenes: { '4-m1': { rejected: ['u1', 'p1', 'u2', 'p2'], what: 'modern facade lights' } }, aiFix: {} };
  assert.equal(E.eraRejectionCount(legacy.scenes['4-m1']), 2);
  const d2 = structuredClone(script);
  const c2 = structuredClone(credits);
  assert.equal(E.applyEraRejections(d2, c2, legacy).toAi, 1);
  assert.ok(!d2.scenes[4].imagePrompts[1].image && !c2['scene-4-m1']);
  assert.match(d2.scenes[4].imagePrompts[1].aiFix, /avoid: modern facade lights/);
});

test('resolveArchive(aiOnly): a scene the era audit rejected twice is not searched or paid for; its cached pick is freed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-era-aionly-'));
  const IMG = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-era-img-'));
  const src = path.join(IMG, 'a.png');
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1600x1000', '-frames:v', '1', src]);
  const docu = { id: 't', era: '1929', scenes: [
    { type: 'photo', source: 'stock', search: 'banquet hall', say: 'They dined.', name: 'Somebody', dur: 4, imagePrompt: 'a 1929 banquet' },
    { type: 'photo', source: 'stock', search: 'ticker tape', say: 'Tape ran.', dur: 4, imagePrompt: 'ticker' },
  ] };
  const searched = [];
  const picks = [];
  const logs = [];
  const r = await arch.resolveArchive(docu, {
    dir, publicDir: path.join(dir, 'public'), buildPrefix: 'build/t', settings: { ffmpegPath: FFMPEG }, usage: {}, logFn: (m) => logs.push(m), aiOnly: [0],
    deps: {
      search: async (q) => { searched.push(q); return [{ provider: 'pixabay', type: 'image', url: `https://pixabay.com/get/${q.replace(/\W/g, '')}.jpg`, width: 1600, height: 1000, eser: q, lisans: 'Pixabay' }]; },
      pick: async (s) => { picks.push(s.search); return { choice: 1, reason: 't', namedPersonIsMainSubject: true }; },
      download: async (url, dest) => { fs.copyFileSync(src, dest); return fs.statSync(dest).size; },
    },
  });
  assert.ok(!searched.some((q) => /banquet/.test(q)), 'no search for the AI-only scene');
  assert.deepEqual(picks, ['ticker tape']);
  assert.ok(!r.script.scenes[0].archived && !r.script.scenes[0].image);
  assert.equal(r.script.scenes[0].name, undefined, 'no real name card on an AI picture');
  assert.ok(r.script.scenes[1].archived);
  assert.ok(logs.some((l) => /1 sahne\/kare dönem denetiminde iki kez reddedildiği için aranmadı/.test(l)), logs.join('\n'));
});

test('era prompts: a 1453 story is audited with pre-industrial rules (photos of people, cruise ships, replicas); 1929 keeps period photos free', async () => {
  const era = await import('../src/pipeline/docu-era-audit.js');
  const p1453 = era.eraPrompt({ title: 'The Fall of Constantinople', era: '1453 (Bizans ve Osmanlı)', year: 1453, lines: [] });
  for (const k of ['SANAYİ VE FOTOĞRAF ÖNCESİ', 'cruise', 'FOTOĞRAF dönem fotoğrafı değildir']) assert.ok(p1453.includes(k), k);
  const c1453 = era.confirmPrompt({ era: '1453', year: 1453, lines: [] });
  assert.ok(c1453.includes('SANAYİ VE FOTOĞRAF ÖNCESİ'));
  const p1929 = era.eraPrompt({ title: '1929', era: '1929', year: 1929, lines: [] });
  assert.ok(!p1929.includes('SANAYİ VE FOTOĞRAF ÖNCESİ'));
  assert.ok(p1929.includes('siyah-beyaz ya da sepya dönem fotoğrafları'));
});

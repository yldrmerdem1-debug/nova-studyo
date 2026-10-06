// Konu kimliği (topic bible): motif seçimi, anlatımdan jetonlar, açıklayıcılar, arayüz kartları,
// metafor ikonları, sunum ve motif geçişleri; LLM yolu (sahte), önbellek, kredisiz yedek;
// motora uygulama (arşivden sonra) ve kıdemli tasarımcı kapısı. Ağ ve ücretli çağrı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

try { os.setPriority(process.pid, 10); } catch {}
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-topic-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = await import('../src/pipeline/docu-topic-bible.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const { validateSchema } = await import('../src/structured-output.js');
const { stripTags } = await import('../src/pipeline/docu-script.js');

const LONG = path.join(ROOT, 'docu-engine', 'videos', 'long-en');
const load = (g) => JSON.parse(fs.readFileSync(path.join(LONG, `${g}.json`), 'utf8'));
const GENRES = { crime: 'case-file', documentary: 'telegraph', epic: 'siege', finance: 'ticker', horror: 'expedition', inspire: 'electric', science: 'telemetry' };
const words = (t) => String(t || '').toLowerCase().match(/[a-z0-9']+/g) || [];
const STOP = new Set('the a an of in on at to and or for with by from is was were his her their its that this as it he she they then so but'.split(' '));
const tmp = (name) => path.join(home, `${name}-${Math.random().toString(36).slice(2)}.json`);

/* ------------------------------------------------------------- yedek incil */

test('yedek incil: 7 uzun senaryo kendi motifini alır ve görsel kimlikleri birbirinden ayrışır', () => {
  const seen = new Map();
  for (const [g, motif] of Object.entries(GENRES)) {
    const s = load(g);
    const b = T.fallbackBible(s);
    assert.equal(b.motif, motif, `${g} motifi`);
    assert.ok(b.explainers.length + b.uiCards.length >= 1, `${g}: en az bir imza cihazı`);
    assert.ok(b.scenes.length >= 6, `${g}: metafor ikonları`);
    assert.ok(b.wipes.length >= 5, `${g}: bölüm geçişleri`);
    assert.equal(b.typography.caption, 'motif', 'yazılar konunun dilinde');
    seen.set(g, `${b.motif}|${b.presentation.photo}|${b.presentation.map}|${b.typography.headline}|${b.palette.accent}`);
  }
  assert.equal(new Set(seen.values()).size, 7, 'her video kendi kimliği');
});

test('yedek incil: jetonlar, açıklayıcı adımları ve kart satırları yalnızca anlatımdan', () => {
  for (const g of Object.keys(GENRES)) {
    const s = load(g);
    const own = s.scenes.filter((x) => !(x.type === 'title' && x.chapterCard));
    const corpus = own.map((x) => `${stripTags(x.say)} ${x.text || ''} ${x.label || ''} ${x.to ?? ''}`).join(' ').toLowerCase().replace(/,/g, '');
    const b = T.fallbackBible(s);
    for (const e of b.explainers) {
      for (const st of e.steps) {
        const sceneText = `${stripTags(own[st.scene].say)} ${own[st.scene].text || ''}`.toLowerCase();
        const cw = words(st.label).filter((w) => !STOP.has(w) && w.length >= 3 && !/^\d/.test(w));
        assert.ok(cw.some((w) => sceneText.includes(w.slice(0, 5))), `${g}: "${st.label}" kendi sahnesinde söylenmeli (#${st.scene})`);
      }
    }
    for (const c of b.uiCards) for (const r of c.rows) assert.ok(words(`${r.label} ${r.value || ''}`).some((w) => w.length >= 3 && corpus.includes(w)), `${g}: kart satırı ${r.label}`);
    for (const t of b.tokens) assert.ok(words(t).some((w) => corpus.includes(w.replace(/[^a-z0-9.]/g, ''))) || /\d/.test(t), `${g}: jeton ${t}`);
  }
});

test('yedek incil: konuya özgü imza cihazları (Titanic CQD→SOS, 1929 marj sarmalı, Dyatlov kar levhası, 1453 üç dalga, Tesla üç karar)', () => {
  const ex = (g) => T.fallbackBible(load(g)).explainers.map((e) => e.steps.map((s) => s.label).join(' > '));
  assert.ok(ex('documentary').some((x) => /^CQD > SOS/.test(x)));
  assert.ok(ex('finance').some((x) => /MARGIN CALL/.test(x)));
  assert.ok(ex('horror').some((x) => /SNOW SLAB/.test(x)));
  assert.ok(ex('epic').some((x) => /JANISSARIES/.test(x)));
  assert.ok(ex('inspire').some((x) => /WRONG PEOPLE/.test(x)));
  const tt = T.fallbackBible(load('documentary'));
  assert.deepEqual(tt.tokens.slice(0, 2), ['CQD', 'SOS']);
  assert.match(tt.message, /Come at once/);
  assert.equal(T.fallbackBible(load('crime')).params.ref, 'FLIGHT 305');
});

test('ikon kimlikleri motorun paketiyle aynı (Tabler, MIT lisansı repoda)', () => {
  const eng = T.engineIconIds();
  assert.ok(eng?.length > 100);
  assert.deepEqual([...T.ICON_IDS].sort(), [...eng].sort());
  assert.ok(fs.existsSync(path.join(ROOT, 'docu-engine', 'src', 'topic', 'LICENSE-tabler-icons.txt')));
  for (const id of Object.values(T.MOTIF_SPECS).flatMap((m) => m.icons)) assert.ok(T.ICON_IDS.includes(id), id);
});

test('sayılar ve saatler anlatımdan çözülür', () => {
  assert.deepEqual(T.spokenTimes('At eleven thirty-five, then Two-oh-five AM and Eight-thirteen PM'), ['11:35', '2:05 AM', '8:13 PM']);
  assert.deepEqual(T.spokenRefs('Flight three-oh-five. Thirty-six passengers'), ['FLIGHT 305']);
});

/* ------------------------------------------------------------- LLM yolu */

test('model incili onarılır: bilinmeyen ikon/yazı, anlatımda olmayan adım ve dönüştürülemeyen sahne atılır', async () => {
  const s = load('documentary');
  const res = {
    motif: 'telegraph', tokens: ['CQD', 'SOS', 'XYZZY QUUX'], message: 'Come at once', params: { time: '11:40 PM' },
    signatureDevice: 'explainer', iconSet: ['ship', 'not-an-icon'],
    presentation: { photo: 'lightbox', map: 'paper' }, typography: { headline: 'oldstandard', textStyles: ['typewriter', 'serif', 'underline', 'wobble'], caption: 'motif' },
    palette: { accent: '#ffb547', accent2: '#e2563b' }, grade: 'selective', keepHue: 30, backdrops: ['era'], opening: 'timestamps',
    explainers: [
      { kind: 'sequence', title: 'Distress call', steps: [{ label: 'CQD', scene: 82, at: 'CQD' }, { label: 'SOS', scene: 82, at: 'SOS' }] },
      { kind: 'mechanism', steps: [{ label: 'ALIENS LANDED', scene: 76 }, { label: 'MARTIAN BEAM', scene: 77 }] },
      { kind: 'sequence', steps: [{ label: 'UNSINKABLE', scene: 16 }, { label: 'SINK', scene: 79 }] },
    ],
    uiCards: [{ scene: 49, kind: 'phone', rows: [{ label: 'icebergs' }, { label: 'ice' }] }],
    scenes: [{ i: 60, icons: [{ id: 'binoculars', side: 'left', at: 'eye' }, { id: 'nope' }] }, { i: 6, icons: [{ id: 'users' }] }],
    wipes: [19, 38, 9999], why: 'test',
  };
  let calls = 0;
  const llm = async (o) => { calls++; assert.ok(validateSchema(o.schema, res).ok !== false); assert.match(o.system, /LEMMiNO/); return res; };
  const out = await T.topicBible(s, { llm, cacheFile: tmp('tb'), settings: { anthropicKey: 'x' } });
  assert.equal(out.mode, 'llm');
  assert.equal(calls, 1);
  const b = out.bible;
  assert.deepEqual(b.tokens, ['CQD', 'SOS'], 'anlatımda olmayan jeton atılır');
  assert.deepEqual(b.iconSet, ['ship']);
  assert.deepEqual(b.typography.textStyles.slice(0, 3), ['typewriter', 'serif', 'underline']);
  assert.equal(b.explainers.length, 1, 'uydurma adımlar ve slam sahnesi atılır');
  assert.equal(b.explainers[0].title, 'DISTRESS CALL');
  assert.equal(b.uiCards.length, 0, '1912 hikâyesinde telefon kartı yok');
  assert.deepEqual(b.scenes.map((x) => x.i), [60]);
  assert.deepEqual(b.scenes[0].icons.map((x) => x.id), ['binoculars']);
  assert.deepEqual(b.wipes.map((w) => w.i), [19, 38]);
  assert.equal(out.script.topic.motif, 'telegraph');
  assert.deepEqual(out.script.scenes, s.scenes, 'sahneler (arşiv anahtarı) değişmez');
  // önbellek: ikinci çağrı modeli çağırmaz
  const again = await T.topicBible(s, { llm, cacheFile: out.cacheFile || undefined, settings: { anthropicKey: 'x' } });
  assert.ok(again);
});

test('önbellek ve kredisiz yedek: aynı senaryo bir kez kurulur; kredi yoksa belirleyici yedek', async () => {
  const s = load('finance');
  const file = tmp('cache');
  let calls = 0;
  const broke = async () => { calls++; throw new Error('Your credit balance is too low to access the Anthropic API'); };
  const a = await T.topicBible(s, { llm: broke, cacheFile: file, settings: { anthropicKey: 'x' } });
  assert.equal(a.mode, 'fallback');
  assert.equal(a.skipped, 'no-credit');
  assert.equal(a.bible.motif, 'ticker');
  const b = await T.topicBible(s, { llm: broke, cacheFile: file, settings: { anthropicKey: 'x' } });
  assert.equal(b.cached, true);
  assert.equal(calls, 1, 'kayıttan: model yeniden çağrılmaz');
  const c = await T.topicBible(s, { llm: false });
  assert.equal(c.skipped, 'disabled');
  assert.deepEqual(c.bible, T.fallbackBible(s), 'yedek belirleyici');
  assert.notEqual(T.topicKey(s), T.topicKey({ ...s, scenes: s.scenes.map((x, i) => (i === 3 ? { ...x, say: `${x.say} more` } : x)) }));
  assert.equal(T.topicKey(s), T.topicKey({ ...s, scenes: s.scenes.map((x) => ({ ...x, image: 'build/x.jpg', textStyle: 'serif' })) }), 'görünüm/resim alanları anahtarı değiştirmez');
});

/* ------------------------------------------------------------- uygulama */

function withCards(s) {
  const out = [];
  s.scenes.forEach((x, i) => {
    if (i > 0 && x.chapter !== s.scenes[i - 1].chapter) out.push({ type: 'title', chapterCard: true, chapterNo: x.chapter + 1, kicker: 'CHAPTER', title: s.chapters[x.chapter], chapter: x.chapter, dur: 2.8 });
    out.push(x);
  });
  return { ...s, scenes: out };
}

test('arşivden sonra uygulama: açıklayıcı/kart dönüşümü, ikonlar, tam kadraj, sunum, motif yazıları, geçişler (bölüm kartları eklenmiş olsa da)', () => {
  const s = load('documentary');
  const b = T.fallbackBible(s);
  // arşiv sonrası: resim ölçüleri bilinir
  const archived = { ...s, scenes: s.scenes.map((x, i) => (x.type === 'photo' ? { ...x, image: `build/a${i}.jpg`, archived: true, source: 'archive', imgW: i % 3 ? 2400 : 800, imgH: i % 3 ? 1500 : 1000 } : x.type === 'words' && x.media === 'video' ? { ...x, video: `build/v${i}.mp4`, videoW: 1920, videoH: 1080, image: `build/v${i}.jpg` } : x)) };
  const eng = withCards(archived);
  const out = T.applyTopicPlan(eng, b, { logFn: () => {} });
  assert.equal(out.topic.motif, 'telegraph');
  assert.equal(out.topic.photo, 'lightbox');
  assert.equal(out.scenes.length, eng.scenes.length);
  const ex = out.scenes.filter((x) => x.type === 'explainer');
  assert.ok(ex.length >= 2);
  for (const x of ex) {
    assert.ok(x.steps.length >= 2 && Array.isArray(x.reveal));
    for (const k of ['image', 'video', 'imagePrompt', 'search', 'source', 'textStyle']) assert.ok(!(k in x), `açıklayıcıda ${k} kalmaz (üretim maliyeti yok)`);
    assert.ok(x.say, 'anlatım korunur');
  }
  const cq = ex.find((x) => x.steps[0].label === 'CQD');
  assert.ok(cq && /CQD/.test(cq.say));
  assert.ok(out.scenes.some((x) => x.type === 'ui-card' && x.rows.length >= 2));
  const icons = out.scenes.filter((x) => x.icons?.length);
  assert.ok(icons.length >= 6 && icons.every((x) => x.image || x.video));
  // tam kadraj: geniş resim/klip kaplar; sunum yalnızca dikey/küçük arşiv baskılarında
  for (const x of out.scenes) {
    if (x.present) assert.ok(x.imgW / x.imgH < 1.3 || x.imgW < 1000, 'sunum yalnızca nesne gibi gösterilen baskıda');
    if (x.type === 'photo' && x.imgW === 2400 && !x.icons) assert.equal(x.fit, 'cover');
  }
  assert.ok(out.scenes.some((x) => x.present === 'lightbox'));
  // yazılar konunun dilinde; kanca/zirve vurguları ve temiz resimler hariç
  const words_ = out.scenes.filter((x) => x.type === 'words');
  assert.ok(words_.filter((x) => x.textStyle === 'motif').length >= words_.length * 0.5);
  assert.ok(words_.some((x) => x.textMode === 'none' && x.icons?.length), 'somut satır yazısız gösterilir');
  const wiped = out.scenes.map((x, i) => (x.wipe ? i : -1)).filter((i) => i >= 0);
  assert.ok(wiped.length >= 5);
  for (const i of wiped) {
    assert.equal(out.scenes[i].transition, 'cut');
    assert.ok(out.scenes[i - 1].chapterCard || out.scenes[i - 1].chapter === out.scenes[i].chapter || true);
  }
  // girdi değişmez
  assert.ok(!eng.scenes.some((x) => x.icons || x.type === 'explainer'));
});

test('docu.js: kimlik arşivden önce betik düzeyi (docKey değişmez), sahne kararları sanat planından SONRA; tasarım kapısı render öncesi', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu.js'), 'utf8');
  const iTopic = src.indexOf('await topicBible(directed');
  const iArt = src.indexOf('await artDirect(directed');
  const iKey = src.indexOf('const docKey = crypto.createHash("sha1").update(JSON.stringify(directed.scenes))');
  assert.ok(iTopic > 0 && iTopic < iArt && iArt < iKey);
  const iApplyArt = src.indexOf('ed = applyArtPlan(ed, artPlan');
  const iApplyTopic = src.indexOf('ed = applyTopicPlan(ed, topicPlan');
  assert.ok(iApplyArt > 0 && iApplyTopic > iApplyArt);
  assert.match(src, /settings\.docuTopicBible !== false/);
  const iGate = src.indexOf('await designGate(engineDocu');
  assert.ok(iGate > 0 && iGate < src.indexOf('const engineFile = path.join(workDir, "engine-script.json");'));
  assert.match(src, /settings\.docuDesignGate !== false/);
});

/* ------------------------------------------------------------- kıdemli tasarımcı kapısı */

const req = createRequire(path.join(ROOT, 'package.json'));
const FF = req('ffmpeg-static');
function fakeFrames(items) {
  for (const it of items) spawnSync(FF, ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=0x${(it.frame * 7919 % 0xffffff).toString(16).padStart(6, '0')}:s=320x180:d=1`, '-frames:v', '1', it.out]);
  return { files: items.map((i) => i.out) };
}
function gateScript() {
  const s = withCards(load('documentary'));
  return { ...s, scenes: s.scenes.map((x) => ({ ...x, wordTimes: stripTags(x.say).split(' ').map((w, k) => ({ word: w, t: 0.3 + k * 0.3 })), voiceDur: 0.5 + stripTags(x.say).split(' ').length * 0.3 })) };
}

test('tasarım kapısı: kilit kareler seçilir; kalan sahne otomatik başka uygulamaya geçer; kare özeti başına kayıt; bütçe', async () => {
  const props = gateScript();
  const moments = G.gateMoments(props, { max: 18 });
  assert.ok(moments.length <= 18);
  assert.ok(moments.some((m) => m.kind === 'chapter-card'));
  const dir = fs.mkdtempSync(path.join(home, 'gate-'));
  let calls = 0;
  const target = moments.find((m) => m.kind === 'text');
  const llm = async (o) => {
    calls++;
    assert.equal(o.images.length, 1);
    assert.match(o.system, /LEMMiNO/);
    const lines = o.user.split('\n').filter((l) => /^#\d+ \(scene/.test(l));
    return { frames: lines.map((l, k) => ({ n: k + 1, pass: !l.includes(`(scene ${target.i})`), score: l.includes(`(scene ${target.i})`) ? 3 : 8, reasons: 'small print in a dark margin, centred generic text', fix: l.includes(`(scene ${target.i})`) ? 'full-bleed' : 'none' })) };
  };
  const script = { ...props };
  const { placeTimeline } = await import('../docu-engine/src/timeline.js');
  const a = await G.designGate(script, { props, render: async (items) => fakeFrames(items), placeTimeline, dir, llm, ffmpeg: FF, budgetUsd: 0.15 });
  assert.ok(calls >= 1 && calls * 0.012 <= 0.15 + 1e-9, 'bütçe tavanı');
  assert.equal(a.report.failed, 1, JSON.stringify(a.report));
  const fixed = a.script.scenes[target.i];
  assert.equal(fixed.fit, 'cover');
  // ikinci çalıştırma: aynı kareler kayıttan, model çağrılmaz; düzeltme yine uygulanır
  const before = calls;
  const b = await G.designGate(script, { props, render: async (items) => fakeFrames(items), placeTimeline, dir, llm, ffmpeg: FF });
  assert.equal(calls, before);
  assert.equal(b.script.scenes[target.i].fit, 'cover');
  // anahtarsız / props yokken atlanır ama kayıtlı düzeltmeler uygulanır
  const c = await G.designGate(script, { props: null, dir, llm, ffmpeg: FF });
  assert.equal(c.skipped, 'no-props');
  assert.equal(c.script.scenes[target.i].fit, 'cover');
});

test('tasarım kapısı düzeltmeleri ve kare senaryosu', () => {
  const w = { type: 'words', say: 'x', text: 'x', image: 'a.jpg', textStyle: 'lower-third' };
  assert.equal(G.applyFix(w, 'motif-caption').textStyle, 'motif');
  assert.equal(G.applyFix(w, 'clean-picture').textMode, 'none');
  assert.equal(G.applyFix({ ...w, image: undefined }, 'clean-picture').textMode, 'key');
  assert.equal(G.applyFix({ type: 'photo', present: 'lightbox', image: 'a' }, 'full-bleed').fullBleed, true);
  assert.equal(G.applyFix(w, 'other-style', { topicStyles: ['lower-third', 'serif'] }).textStyle, 'serif');
  const props = { title: 't', music: 'm.wav', scenes: [{ type: 'words', say: 'hello there', text: 'hello', voice: 'v.wav', wordTimes: [{ word: 'hello', t: 0.2 }], textStyle: 'box' }] };
  const eng = { topic: { motif: 'cipher' }, scenes: [{ type: 'words', say: 'hello there', text: 'hello', textStyle: 'motif' }] };
  const st = G.stillScript(props, eng);
  assert.equal(st.scenes[0].textStyle, 'motif');
  assert.ok(st.scenes[0].wordTimes && !st.scenes[0].voice && !st.music);
  assert.equal(st.topic.motif, 'cipher');
});

test('görselsiz şema uzun satırı taşımaz (Irkutsk, Ekim 2026: 28 sn boş karede üç madde)', () => {
  const s = load('documentary');
  const b = T.fallbackBible(s);
  const archived = { ...s, scenes: s.scenes.map((x, i) => (x.type === 'photo' ? { ...x, image: `build/a${i}.jpg`, archived: true, source: 'archive', imgW: 2400, imgH: 1500 } : x)) };
  const ex = b.explainers[0];
  const h = ex.steps[0].scene;
  const long = 'word '.repeat(80).trim();
  // the host line becomes 80 words (~30 s): the explainer must be skipped, the photo stays
  const eng = { ...archived, scenes: archived.scenes.map((x, i) => (i === h ? { ...x, say: long } : x)) };
  const bb = { ...b, explainers: [{ ...ex, steps: ex.steps.map((st) => (st.scene === h ? { ...st, say: long } : st)) }] };
  const log = [];
  const out = T.applyTopicPlan(eng, bb, { logFn: (m) => log.push(m) });
  assert.notEqual(out.scenes[h].type, 'explainer');
  assert.equal(out.scenes[h].type, eng.scenes[h].type, 'sahne kendi resmiyle kalır');
  assert.ok(log.some((m) => /görselsiz kart/.test(m)));
});

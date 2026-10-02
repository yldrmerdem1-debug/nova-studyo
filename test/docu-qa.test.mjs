// Otomatik kalite denetimi: ffmpeg ölçümleri (siyah, donma, sessizlik, ses yüksekliği),
// dHash ile yakın tekrar, kontak sayfalarıyla toplu görme denetimi (sahte model) ve
// otomatik düzeltmenin arşiv tarafı (önbellek anahtarı, yalnızca işaretli sahne yeniden
// seçilir, reddedilen kaynak geri gelirse AI'a düşer). Ağ ve ücretli çağrı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-test-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FFMPEG = createRequire(import.meta.url)('ffmpeg-static');

const Q = await import('../src/pipeline/docu-qa.js');
const arch = await import('../src/pipeline/docu-archive.js');
const { qaScriptOf } = await import('../src/pipeline/docu.js');

/* ---------------------------------------------------------------- sentetik video */
// 0-8 hareketli · 8-10 siyah · 10-20 durağan renk çubukları · 20-26 hareketli ·
// 26-32 hareketli (farklı) · 32-38 aynı renk çubukları (yakın tekrar). Ses: 0-12 ton,
// 12-17 sessiz, 17-38 ton.
const VID = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-vid-')), 'v.mp4');
execFileSync(FFMPEG, [
  '-v', 'error', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=8',
  '-f', 'lavfi', '-i', 'color=black:s=640x360:r=30:d=2',
  '-f', 'lavfi', '-i', 'smptebars=s=640x360:r=30:d=10',
  '-f', 'lavfi', '-i', 'testsrc=s=640x360:r=30:d=6',
  '-f', 'lavfi', '-i', 'mandelbrot=s=640x360:r=30',
  '-f', 'lavfi', '-i', 'smptebars=s=640x360:r=30:d=6',
  '-f', 'lavfi', '-i', 'sine=f=440:d=12:sample_rate=48000',
  '-f', 'lavfi', '-i', 'aevalsrc=0:d=5:s=48000',
  '-f', 'lavfi', '-i', 'sine=f=330:d=21:sample_rate=48000',
  '-filter_complex', '[4:v]trim=duration=6,setpts=PTS-STARTPTS[m];[0:v][1:v][2:v][3:v][m][5:v]concat=n=6:v=1:a=0,format=yuv420p[v];[6:a][7:a][8:a]concat=n=3:v=0:a=1[a]',
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', VID,
]);

const SCRIPT = {
  id: 't', title: 'Test', era: '1971',
  scenes: [
    { type: 'photo', say: 'Hareketli açılış.', archived: true, image: 'build/a.jpg' },
    { type: 'photo', say: 'Burada resim yok.', imagePrompt: 'x' },
    { type: 'words', say: 'Renk çubukları uzun süre.', text: 'Renk çubukları', imagePrompt: 'y' },
    { type: 'photo', say: 'Pilot William Rataczak.', archived: true, image: 'build/d.jpg' },
    { type: 'title', chapterCard: true, title: 'Bölüm 2', kicker: 'BÖLÜM 2' },
    { type: 'photo', say: 'Aynı çubuklar yeniden.', archived: true, image: 'build/f.jpg' },
  ],
};
const PLACED = [[0, 8], [8, 10], [10, 20], [20, 26], [26, 32], [32, 38]].map(([a, b]) => ({ from: a * 30, frames: (b - a) * 30 }));

test('scene rows map render order (with chapter cards) back to script scene numbers; samples hit every scene middle', () => {
  const rows = Q.sceneRows(SCRIPT, PLACED);
  assert.deepEqual(rows.map((r) => r.scene), [0, 1, 2, 3, null, 4]);
  const t = Q.sampleTimes(rows, 38);
  assert.deepEqual(t.map((x) => x.t), [4, 9, 15, 23, 29, 35]);
  const long = Q.sampleTimes([{ r: 0, scene: 0, start: 0, end: 100, s: {} }], 100);
  assert.deepEqual(long.map((x) => x.t), [10, 30, 50, 70, 90], 'a long scene gets extra frames every ~20 s');
});

test('parseDetect reads blackdetect / freezedetect / silencedetect / ebur128 output', () => {
  const text = [
    '[blackdetect @ 0x1] black_start:8 black_end:10 black_duration:2',
    '[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 10.03',
    '[freezedetect @ 0x2] lavfi.freezedetect.freeze_duration: 9.9',
    '[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 19.93',
    '[silencedetect @ 0x3] silence_start: 12.001',
    '[silencedetect @ 0x3] silence_end: 17.0 | silence_duration: 4.999',
    '[Parsed_ebur128_1 @ 0x4] Summary:', '  Integrated loudness:', '    I:         -14.6 LUFS', '    Threshold: -24.7 LUFS',
    '  True peak:', '    Peak:       -1.2 dBFS',
  ].join('\n');
  const d = Q.parseDetect(text);
  assert.deepEqual(d.black, [{ start: 8, end: 10, dur: 2 }]);
  assert.equal(d.freeze[0].start, 10.03);
  assert.equal(d.silence[0].dur, 4.999);
  assert.equal(d.integrated, -14.6);
  assert.equal(d.truePeak, -1.2);
});

test('qaVideo: free ffmpeg checks + dHash repeat + one batched vision call (mocked) → qa.json with fixes', async () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-out-')), 'qa.json');
  const calls = [];
  const logs = [];
  const vision = async (o) => {
    calls.push(o);
    assert.equal(o.model, 'claude-sonnet-5-5');
    assert.equal(o.images.length, 1, 'six frames fit one 4x3 contact sheet');
    assert.match(o.user, /#4 0:23 sahne 4 · fotoğraf\/görüntü \[arşiv fotoğrafı\] — "Pilot William Rataczak\."/);
    assert.match(o.user, /#5 0:29 sahne - · BÖLÜM KARTI/);
    assert.match(o.user, /dönemi: 1971/);
    return { issues: [
      { frame: 4, kind: 'mismatch', severity: 'high', detail: 'Karede pilot değil bir kadın var' },
      { frame: 5, kind: 'mismatch', severity: 'high', detail: 'stilize kart — yok sayılmalı' },
      { frame: 1, kind: 'bad_crop', severity: 'low', detail: 'hafif kırpık' },
      { frame: 99, kind: 'broken', severity: 'high', detail: 'olmayan kare' },
    ] };
  };
  const qa = await Q.qaVideo({ video: VID, script: SCRIPT, placed: PLACED, settings: { ffmpegPath: FFMPEG }, ffmpeg: FFMPEG, llm: vision, outFile: out, logFn: (m) => logs.push(m), durationSec: 38 });
  assert.equal(calls.length, 1);
  const kinds = (k) => qa.issues.filter((x) => x.kind === k);
  assert.equal(kinds('black')[0]?.scene, 1, JSON.stringify(qa.issues));
  assert.equal(kinds('black')[0].fix, 'rerender');
  assert.ok(kinds('freeze').some((x) => x.scene === 2));
  assert.ok(kinds('silence').some((x) => x.scene === 2 && x.time >= 11.5 && x.time <= 12.5));
  const mm = kinds('mismatch');
  assert.equal(mm.length, 1, 'mismatch on a chapter card is ignored');
  assert.deepEqual([mm[0].scene, mm[0].fix, mm[0].severity], [3, 'repick', 'high']);
  assert.ok(kinds('repeat').some((x) => x.scene === 4 && x.fix === 'repick'), JSON.stringify(qa.issues));
  assert.equal(kinds('bad_crop')[0].severity, 'low');
  assert.ok(Number.isFinite(qa.loudness.integrated));
  assert.ok(kinds('loudness').length, 'a raw sine test tone is far from -14 LUFS');
  assert.deepEqual(qa.fixable.map((f) => f.scene).sort(), [3, 4]);
  assert.match(qa.summary, /^Otomatik kalite denetimi: \d+ sorun — /);
  assert.ok(qa.warnings.length >= 2 && qa.warnings.every((w) => typeof w === 'string'));
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')).issues, qa.issues);
  for (const x of qa.issues) for (const k of ['scene', 'time', 'kind', 'detail', 'fix']) assert.ok(k in x, k);
});

test('qaVideo: no credit → vision stops cleanly, ffmpeg findings are still reported; no key → no network call', async () => {
  const logs = [];
  const qa = await Q.qaVideo({
    video: VID, script: SCRIPT, placed: PLACED, settings: { ffmpegPath: FFMPEG }, ffmpeg: FFMPEG, logFn: (m) => logs.push(m), durationSec: 38,
    llm: async () => { throw Error('Your credit balance is too low to access the Anthropic API.'); },
  });
  assert.equal(qa.vision.skipped, 'no-credit');
  assert.ok(qa.issues.some((x) => x.kind === 'black'));
  assert.ok(logs.some((l) => /Görsel kalite denetimi durdu \(Anthropic kredisi yok\)/.test(l)));
  assert.match(qa.summary, /görsel denetim yapılmadı: Anthropic kredisi yok/);
  const nk = await Q.qaVideo({ video: VID, script: SCRIPT, placed: PLACED, settings: { ffmpegPath: FFMPEG }, ffmpeg: FFMPEG, durationSec: 38 });
  assert.equal(nk.vision.skipped, 'no-key');
  assert.equal(nk.vision.calls, 0);
});

test('qaVideo: vision verdicts are cached per input (same video re-checked = no new call); a budget skip makes no call and says why', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-memo-'));
  const cacheFile = path.join(dir, 'docu-qa-vision.json');
  let calls = 0;
  const vision = async () => { calls++; return { issues: [{ frame: 4, kind: 'mismatch', severity: 'high', detail: 'yanlış kişi' }] }; };
  const opts = { video: VID, script: SCRIPT, placed: PLACED, settings: { ffmpegPath: FFMPEG }, ffmpeg: FFMPEG, llm: vision, durationSec: 38, cacheFile };
  const a = await Q.qaVideo(opts);
  assert.equal(calls, 1);
  assert.equal(a.vision.calls, 1);
  // Aynı video yeniden denetlenir (çökme sonrası devam, qa.json kayıp): görme kararı kayıttan, ücretsiz.
  const b = await Q.qaVideo(opts);
  assert.equal(calls, 1, 'no second paid call for the same contact sheets');
  assert.equal(b.vision.cached, 1);
  assert.deepEqual(b.issues.filter((x) => x.source === 'vision'), a.issues.filter((x) => x.source === 'vision'));
  // Claude tavanı doldu: görme modeli hiç çağrılmaz, ffmpeg ölçümleri yine raporlanır.
  const c = await Q.qaVideo({ ...opts, cacheFile: null, skipVision: 'budget' });
  assert.equal(calls, 1);
  assert.equal(c.vision.skipped, 'budget');
  assert.ok(c.issues.some((x) => x.kind === 'black'));
  assert.match(c.summary, /görsel denetim yapılmadı: bu videonun Claude harcama tavanı doldu/);
});

test('Claude spend guard: job usage priced per model (list prices or settings.modelRates); over the cap optional steps are skipped once, with a log line', async () => {
  const { claudeSpendUsd } = await import('../src/llm.js');
  const { claudeGuard, DOCU_MAX_CLAUDE_USD } = await import('../src/pipeline/docu.js');
  // 1929 belgeselinin gerçek sayaçları (20260930-70cef2): ~11,1 $.
  const usage = { byModel: {
    'claude-sonnet-5-5': { requests: 1044, inputTokens: 3780790, uncachedInputTokens: 3780790, outputTokens: 208456, cacheReadTokens: 0, cacheWriteTokens: 0 },
    'claude-opus-5-5': { requests: 6, inputTokens: 70446, uncachedInputTokens: 70446, outputTokens: 57951 },
    'claude-haiku-4-5-20251001': { requests: 6, inputTokens: 12355, uncachedInputTokens: 12355, outputTokens: 574 },
  } };
  assert.ok(Math.abs(claudeSpendUsd(usage) - 11.1) < 0.05, String(claudeSpendUsd(usage)));
  assert.ok(Math.abs(claudeSpendUsd(usage, { 'claude-sonnet-5-5': { input: 3, output: 15 } }) - 15.93) < 0.05, 'settings.modelRates win');
  assert.equal(claudeSpendUsd(null), 0);
  assert.equal(claudeSpendUsd({ byModel: { 'gpt-6-sol': { inputTokens: 1e6, outputTokens: 1e6 } } }), 0, 'only Claude counts');

  assert.equal(DOCU_MAX_CLAUDE_USD, 4);
  const logs = [];
  const g = claudeGuard(usage, {}, (m) => logs.push(m));
  assert.equal(g.max, 4);
  assert.equal(g.skip('dönem denetiminin 2. turu'), true);
  assert.equal(g.skip('dönem denetiminin 2. turu'), true);
  assert.equal(logs.length, 1, 'said once per step');
  assert.match(logs[0], /Claude harcama tavanı doldu \(bu video ~\$11\.\d\d \/ tavan \$4\.00\): dönem denetiminin 2\. turu atlandı/);
  assert.equal(claudeGuard(usage, { docuMaxClaudeUsd: 0 }).skip('x'), false, '0 = no cap');
  assert.equal(claudeGuard(usage, { docuMaxClaudeUsd: 20 }).skip('x'), false);
  const small = { byModel: { 'claude-sonnet-5-5': { uncachedInputTokens: 300000, outputTokens: 20000 } } };
  assert.equal(claudeGuard(small, {}).skip('x'), false, 'a normal video (~$0.80) is far below the cap');
  // Ayar doğrulaması: sayı, 0..1000 arası.
  const { settingsPatch } = await import('../src/settings-input.js');
  assert.deepEqual(settingsPatch({ docuMaxClaudeUsd: '6.5' }), { docuMaxClaudeUsd: 6.5 });
  assert.deepEqual(settingsPatch({ docuMaxClaudeUsd: -3 }), { docuMaxClaudeUsd: 0 });
});

test('qaScriptOf merges the engine props (chapter cards, voice) with pipeline fields (archived)', () => {
  const ed = { title: 'T', era: '1971', scenes: [{ type: 'photo', say: 'a', archived: true }, { type: 'photo', say: 'b' }] };
  const props = { scenes: [{ type: 'photo', say: 'a', voiceDur: 2 }, { type: 'title', chapterCard: true }, { type: 'photo', say: 'b', voiceDur: 3 }] };
  const q = qaScriptOf(props, ed, '');
  assert.equal(q.scenes.length, 3);
  assert.equal(q.scenes[0].archived, true);
  assert.equal(q.scenes[0].voiceDur, 2);
  assert.equal(q.era, '1971');
  assert.equal(qaScriptOf({ scenes: [{}] }, ed, 'x').scenes, ed.scenes, 'count mismatch → pipeline script');
});

/* ---------------------------------------------------------------- otomatik düzeltme: arşiv tarafı */

test('the archive-type list and cache-key derivation mirror docu-archive.js', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu-archive.js'), 'utf8');
  const m = src.match(/const ARCHIVE_TYPES = new Set\(\[([^\]]+)\]\)/);
  assert.deepEqual(new Set(m[1].split(',').map((x) => x.trim().replace(/"/g, ''))), Q.ARCHIVE_TYPES);
  assert.match(src, /const temel = hash\(`\$\{t\.s\.search\}\|\$\{stripTags\(t\.s\.say\)\}`\);/);
  assert.match(src, /const key = n \? hash\(`\$\{temel\}#\$\{n\}`\) : temel;/);
  assert.match(src, /vkey: `v-\$\{key\}`/);
});

test('auto-fix: only the flagged scene is re-picked; a re-picked rejected source falls back to AI', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-fix-'));
  const IMG = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-qa-img-'));
  const files = {};
  for (const [n, src] of Object.entries({ a: 'testsrc2=size=1600x1000', b: 'smptebars=size=1600x1000', c: 'mandelbrot=size=1600x1000', d: 'cellauto=size=1600x1000:seed=7' })) {
    files[n] = path.join(IMG, `${n}.png`);
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-frames:v', '1', files[n]]);
  }
  const URL = (n) => `https://upload.wikimedia.org/wikipedia/commons/${n}/${n}${n}/${n}.jpg`;
  const cand = (n) => ({ provider: 'wikimedia', type: 'image', url: URL(n), width: 1600, height: 1000, eser: `${n}.jpg`, lisans: 'Public domain', sayfa: `https://commons.wikimedia.org/wiki/File:${n}.jpg` });
  const lists = { 'Dan Cooper sketch': [cand('a')], 'McCoy portrait': [cand('b'), cand('c')], 'Rataczak pilot': [cand('d')] };
  const docu = { id: 't', scenes: [
    { type: 'photo', source: 'archive', search: 'Dan Cooper sketch', say: '[quietly] Adam bilet aldı.', dur: 4, imagePrompt: 'x' },
    { type: 'photo', source: 'archive', search: 'McCoy portrait', say: 'McCoy da denedi.', dur: 4, imagePrompt: 'y' },
    { type: 'quote', source: 'archive', search: 'Rataczak pilot', say: 'Pilot dedi ki: "Hiçbir şey görmedik."', quote: 'Hiçbir şey görmedik', who: 'Rataczak', dur: 4, imagePrompt: 'z' },
  ] };
  const picks = [];
  const run = () => arch.resolveArchive(docu, {
    dir, publicDir: path.join(dir, 'public'), buildPrefix: 'build/t', settings: { ffmpegPath: FFMPEG }, usage: {}, logFn: () => {},
    deps: {
      search: async (q) => structuredClone(lists[q] || []),
      pick: async (s) => { picks.push(s.search); return { choice: 1, reason: 't', namedPersonIsMainSubject: true }; },
      download: async (url, dest) => { const n = url.split('/').pop()[0]; fs.copyFileSync(files[n], dest); return fs.statSync(dest).size; },
    },
  });
  const r1 = await run();
  assert.deepEqual(picks.sort(), ['Dan Cooper sketch', 'McCoy portrait', 'Rataczak pilot'], 'the quote card carries its own archive search');
  assert.ok(r1.script.scenes.every((s) => s.archived));
  const cache = JSON.parse(fs.readFileSync(path.join(dir, 'docu-archive.json'), 'utf8'));
  const keys = Q.archiveKeys(docu);
  for (const k of keys) assert.ok(cache[k.key]?.file, `cache key ${k.key} for scene ${k.i}`);
  const expect0 = crypto.createHash('sha1').update('Dan Cooper sketch|Adam bilet aldı.').digest('hex').slice(0, 12);
  assert.equal(keys[0].key, expect0);

  // QA scene 1'i reddetti: yalnızca onun kaydı silinir; yeniden seçim yalnızca onu arar.
  fs.writeFileSync(path.join(dir, 'docu-archive-done.json'), '{}');
  const rejected = [r1.credits['scene-1'].url];
  assert.equal(Q.invalidateArchivePicks(dir, docu, [1]), 1);
  assert.ok(!fs.existsSync(path.join(dir, 'docu-archive-done.json')), 'the completed-archive shortcut is dropped too');
  picks.length = 0;
  const r2 = await run();
  assert.deepEqual(picks, ['McCoy portrait']);
  // Reddedilen kaynak o sahnenin "uygun değil" listesinde: yeniden seçim ona dönmez, sıradaki adayı
  // alır (eskiden sahte seçici yine 1. adayı, yani reddedileni seçiyordu ve sahne AI'a düşüyordu).
  assert.notEqual(r2.credits['scene-1'].url, rejected[0]);
  assert.equal(r2.credits['scene-1'].url, URL('c'));
  assert.equal(Q.applyQaRejections(structuredClone(r2.script), { ...r2.credits }, { scenes: { 1: { rejected } } }), 0);
  // Emniyet ağı: reddedilen kaynak yine de gelirse sahne AI'a düşer, künyesi silinir.
  const ed = structuredClone(r1.script);
  const credits = { ...r1.credits };
  const logs = [];
  const n = Q.applyQaRejections(ed, credits, { scenes: { 1: { rejected } } }, (m) => logs.push(m));
  assert.equal(n, 1);
  assert.equal(ed.scenes[1].archived, undefined);
  assert.equal(ed.scenes[1].image, undefined);
  assert.equal(ed.scenes[1].imagePrompt, 'y', 'falls back to its own AI prompt');
  assert.equal(credits['scene-1'], undefined);
  assert.ok(ed.scenes[0].archived && ed.scenes[2].archived);
  // Başka bir kaynak seçilseydi dokunulmazdı.
  const ed2 = structuredClone(r1.script);
  assert.equal(Q.applyQaRejections(ed2, { ...r1.credits }, { scenes: { 1: { rejected: ['https://example.org/other.jpg'] } } }), 0);
  assert.ok(ed2.scenes[1].archived);
});

test('fix plan: only medium/high "repick" issues, one per scene, at most 12', () => {
  const issues = [
    { scene: 1, kind: 'mismatch', severity: 'high', fix: 'repick' },
    { scene: 1, kind: 'repeat', severity: 'medium', fix: 'repick' },
    { scene: 2, kind: 'bad_crop', severity: 'low', fix: 'repick' },
    { scene: 3, kind: 'black', severity: 'high', fix: 'rerender' },
    { scene: null, kind: 'loudness', severity: 'high', fix: 'remaster' },
    ...Array.from({ length: 20 }, (_, i) => ({ scene: 10 + i, kind: 'mismatch', severity: 'medium', fix: 'repick' })),
  ];
  const plan = Q.qaFixPlan({ issues });
  assert.equal(plan.length, 12);
  assert.deepEqual(plan.slice(0, 2).map((p) => p.scene), [1, 10]);
});

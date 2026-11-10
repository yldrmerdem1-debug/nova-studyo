// GÖRÜNÜŞ ÖLÇÜMÜ (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: luma 52-56, doygunluk 2,5-6; son 7 videoda
// karelerin %21-39'u luma < 40 — kanal sahibi: "her video siyah, karanlık, birbirinin aynı"). En iyi video Panama ('color'
// notu) luma 88, doygunluk 10,2. Render sonrası denetim ve ön izleme kapısı çıkardıkları karelerin parlaklığını,
// doygunluğunu ve karanlık kare payını ölçer (hedef ≥75 / ≥8 / ≤%15); tasarım kapısı karanlık / siyah-beyaz / son
// videolarla aynı görünüşü kusur sayar. Ağ, ffmpeg ve model çağrısı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gorunus-'));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const Q = await import('../src/pipeline/docu-qa.js');
const P = await import('../src/pipeline/docu-preview.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

// Gimli benzeri: koyu ve renksiz (10 kareden 4'ü luma < 40).
const GIMLI = [
  ...Array.from({ length: 4 }, (_, k) => ({ yavg: 28, satavg: 1.5, scene: k < 3 ? 5 : 2 })),
  ...Array.from({ length: 6 }, () => ({ yavg: 68, satavg: 3.5, scene: 1 })),
];
// Panama benzeri: parlak, renkli.
const PANAMA = Array.from({ length: 10 }, (_, k) => ({ yavg: 84 + k, satavg: 10.2, scene: k }));

test('lookStats: Gimli benzeri video hedefin altında — parlaklık, doygunluk ve karanlık kare payının üçü de', () => {
  const s = Q.lookStats(GIMLI);
  assert.equal(s.frames, 10);
  assert.equal(s.luma, 52);
  assert.equal(s.sat, 2.7);
  assert.equal(s.darkShare, 0.4);
  assert.equal(s.ok, false);
  assert.deepEqual(s.low, ['luma', 'sat', 'dark']);
  assert.equal(s.line, 'Görünüş: parlaklık 52, doygunluk 2,7, karanlık kare %40 — hedef ≥75/≥8/≤%15');
  assert.deepEqual(s.darkScenes, [5, 2], 'en çok koyu karesi olan sahne önce (0 tabanlı)');
  assert.deepEqual(s.greyScenes, [1, 5, 2]);
});

test('lookStats: Panama benzeri video hedefte; satır yine yazılır', () => {
  const s = Q.lookStats(PANAMA);
  assert.equal(s.ok, true);
  assert.deepEqual(s.low, []);
  assert.equal(s.darkShare, 0);
  assert.equal(s.line, 'Görünüş: parlaklık 89, doygunluk 10,2, karanlık kare %0 — hedef ≥75/≥8/≤%15');
});

test('lookStats: sınırlar — tam hedef geçer, karanlık eşik luma < 40, ölçülemeyen kare sayılmaz', () => {
  const edge = Q.lookStats([{ yavg: 75, satavg: 8 }, { yavg: 75, satavg: 8 }]);
  assert.equal(edge.ok, true);
  const dark = Q.lookStats([{ yavg: 39.9, satavg: 9 }, ...Array.from({ length: 5 }, () => ({ yavg: 100, satavg: 9 }))]);
  assert.equal(dark.darkShare, +(1 / 6).toFixed(3));
  assert.deepEqual(dark.low, ['dark'], '%17 karanlık kare: ortalama parlak olsa da uyarı');
  const mixed = Q.lookStats([{ yavg: null, satavg: null }, { yavg: 90, satavg: 12 }, {}]);
  assert.equal(mixed.frames, 1);
  const none = Q.lookStats([]);
  assert.equal(none.ok, null);
  assert.equal(none.frames, 0);
  assert.match(none.line, /ölçülemedi/);
  assert.deepEqual(Q.LOOK_TARGET, { luma: 75, sat: 8, darkShare: 0.15, darkLuma: 40 });
});

test('lookFindings: too_dark ve desaturated, videonun tamamına ait, somut öneriyle', () => {
  const f = Q.lookFindings(Q.lookStats(GIMLI));
  assert.deepEqual(f.map((x) => x.kind), ['too_dark', 'desaturated']);
  for (const x of f) {
    assert.equal(x.scene, null, 'sahne düzeltme planına girmez');
    assert.equal(x.fix, 'review');
    assert.equal(x.source, 'look');
    assert.equal(x.severity, 'high');
    assert.match(x.detail, /öneri: /);
  }
  assert.match(f[0].detail, /parlaklık 52 \(hedef ≥75\)/);
  assert.match(f[0].detail, /karanlık kare %40 \(hedef ≤%15\)/);
  assert.match(f[0].detail, /sahne 6, 3/);
  assert.match(f[0].detail, /color\/warm\/cool\/teal-orange\/kodachrome/);
  assert.match(f[0].detail, /vinyet ≤0,35/);
  assert.match(f[0].detail, /letterbox kapalı/);
  assert.match(f[1].detail, /doygunluk 2,7 \(hedef ≥8\)/);
  assert.match(f[1].detail, /yalnızca bir vurgu bölümünde/);
  assert.deepEqual(Q.lookFindings(Q.lookStats(PANAMA)), []);
  assert.deepEqual(Q.lookFindings(Q.lookStats([])), []);
  // Yalnızca soluk (parlaklık yerinde): tek bulgu, orta ağırlık.
  const grey = Q.lookFindings(Q.lookStats(Array.from({ length: 4 }, () => ({ yavg: 90, satavg: 6 }))));
  assert.deepEqual(grey.map((x) => [x.kind, x.severity]), [['desaturated', 'medium']]);
});

test('qaWarnings: hedefin altındaki görünüş sorun listesi boş olsa da kalite uyarısıdır; hedefteyse uyarı yok', () => {
  const bad = Q.qaWarnings({ issues: [], vision: { skipped: null }, look: Q.lookStats(GIMLI) });
  assert.equal(bad.length, 1);
  assert.ok(bad[0].startsWith('Görünüş: parlaklık 52, doygunluk 2,7, karanlık kare %40 — hedef ≥75/≥8/≤%15'), bad[0]);
  assert.match(bad[0], /öneri: /);
  assert.deepEqual(Q.qaWarnings({ issues: [], vision: { skipped: null }, look: Q.lookStats(PANAMA) }), []);
  assert.deepEqual(Q.qaWarnings({ issues: [], vision: { skipped: null }, look: null }), []);
  const withIssues = Q.qaWarnings({ issues: [{ scene: 1, time: 4, kind: 'black', severity: 'high', detail: 'siyah', fix: 'rerender' }], vision: { skipped: null }, look: Q.lookStats(GIMLI) });
  assert.match(withIssues[0], /^Otomatik kalite denetimi: 1 sorun/);
  assert.match(withIssues.at(-1), /^Görünüş: /);
  assert.equal(Q.lookWarning(Q.lookStats(PANAMA)), null);
});

test('render sonrası denetim: aynı karelerden ölçer, satırı her zaman günlüğe yazar, qa.json\'a koyar', () => {
  const src = read('../src/pipeline/docu-qa.js');
  const qa = src.slice(src.indexOf('export async function qaVideo('), src.indexOf('export const CONTENT_DEVICES'));
  assert.ok(qa.includes('await frameLook(tmp, got.length, ff)'), 'çıkarılan f_%04d.jpg kareleri');
  assert.ok(qa.includes('logFn(look.line)'), 'ölçüm satırı her zaman');
  assert.ok(qa.includes('finishQa({ issues, extraIssues, duration, loudness, look,'));
  assert.ok(src.includes('    look,\n') || src.includes('    look,\r\n'), 'qa.json görünüşü taşır');
  // signalstats ölçeği: JPEG tam aralığı → TV aralığı, kroma büyüklüğü.
  assert.ok(src.includes('in_range=full:out_range=tv,format=yuv444p'));
  assert.ok(src.includes('Math.sqrt(u * u + v * v)'));
});

const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(((s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
const scenes4 = () => [0, 1, 2, 3].map((i) => ({ type: 'photo', say: `line ${i}`, archived: true, image: `p${i}.jpg`, voiceDur: 3 }));
const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
const judge = async (o) => ({ issues: [], vision: { calls: 0, frames: o.got.length, skipped: null } });

test('ön izleme kapısı: karanlık ve renksiz kareler too_dark / desaturated bulgusu olur, rapora ve günlüğe girer', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gorunus-kapi-'));
  const scenes = scenes4();
  const logs = [];
  const measure = async (_dir, n) => Array.from({ length: n }, (_, k) => (k % 2 ? { yavg: 30, satavg: 2 } : { yavg: 60, satavg: 3 }));
  const res = await P.previewGate({ props: { scenes: scenes.map((s) => ({ ...s })) }, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), measure, logFn: (m) => logs.push(m) });
  assert.deepEqual(res.issues.filter((x) => x.source === 'look').map((x) => x.kind), ['too_dark', 'desaturated']);
  assert.equal(res.plan.repick.length + res.plan.ai.length + res.plan.patches.length, 0, 'sahne planına girmez');
  assert.ok(logs.some((l) => /Ön izleme \(tur 1\) — Görünüş: parlaklık 45, doygunluk 2,5, karanlık kare %50 — hedef ≥75\/≥8\/≤%15/.test(l)), logs.join('\n'));
  const rep = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-1.json'), 'utf8'));
  assert.equal(rep.look.ok, false);
  assert.equal(rep.look.luma, 45);
  assert.deepEqual(rep.issues.filter((x) => ['too_dark', 'desaturated'].includes(x.kind)).map((x) => [x.scene, x.severity]), [[null, 'high'], [null, 'high']]);
  assert.equal(res.look.darkShare, 0.5);
});

test('ön izleme kapısı: parlak video bulgu vermez ama satırı yazar; doğrulama turu ölçmez; ölçüm hatası işi durdurmaz', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gorunus-kapi-'));
  const scenes = scenes4();
  const logs = [];
  const bright = async (_d, n) => Array.from({ length: n }, () => ({ yavg: 90, satavg: 11 }));
  const ok = await P.previewGate({ props: { scenes: scenes.map((s) => ({ ...s })) }, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), measure: bright, logFn: (m) => logs.push(m) });
  assert.equal(ok.issues.filter((x) => x.source === 'look').length, 0);
  assert.ok(logs.some((l) => l.includes('Görünüş: parlaklık 90, doygunluk 11,0, karanlık kare %0')));
  let called = 0;
  const counting = async (_d, n) => { called++; return Array.from({ length: n }, () => ({ yavg: 20, satavg: 1 })); };
  const v = await P.previewGate({ props: { scenes: scenes.map((s) => ({ ...s })) }, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), measure: counting, round: 2, only: new Set([1]) });
  assert.equal(called, 0, 'doğrulama turu birkaç sahne çizer: videonun görünüşü değildir');
  assert.equal(v.look, null);
  const logs2 = [];
  const broken = async () => { throw new Error('ffmpeg yok'); };
  const b = await P.previewGate({ props: { scenes: scenes.map((s) => ({ ...s })) }, scenes, render, placeTimeline, dir, judge, fp: (s) => s.say, ffmpeg: path.join(dir, 'ffmpeg-yok.exe'), measure: broken, logFn: (m) => logs2.push(m) });
  assert.equal(b.look, null);
  assert.ok(logs2.some((l) => l.includes('görünüş ölçülemedi (ffmpeg yok)')));
  // Varsayılan ölçü gerçek frameLook (aynı çıkarılmış kareler).
  assert.ok(read('../src/pipeline/docu-preview.js').includes('measure = frameLook'));
});

test('tasarım kapısı: karanlık, siyah-beyaz ve son videolarla aynı görünüş kusur', () => {
  const { user } = G.gatePrompt({ title: 't', look: { variant: 'noir-dossier', baseGrade: 'warm' } }, ['#1 (scene 0) text']);
  assert.match(user, /TOO DARK/);
  assert.match(user, /BLACK-AND-WHITE/);
  assert.match(user, /SAME LOOK AS RECENT VIDEOS/);
  assert.match(user, /"too dark", "black-and-white", "same look as recent videos"/);
  assert.match(user, /bright, well-exposed, natural-colour/);
  assert.match(user, /look variant noir-dossier, grade warm/);
  assert.doesNotMatch(user, /Recent videos/, 'geçmiş verilmediyse satır yok');
  const withRecent = G.gatePrompt({ title: 't' }, [], { recent: [{ variant: 'cold-case', baseGrade: 'selective', isLight: false }, { variant: 'ledger', grade: 'mono' }] }).user;
  assert.match(withRecent, /Recent videos on this channel looked like: \[variant cold-case, grade selective, dark grounds\] \[variant ledger, grade mono\]\./);
  // Eski kurallar yerinde (yüzdeki yazı → text-low).
  assert.match(user, /text-low[^\n]*face/);
});

test('tasarım kapısı: son görünüşler görünüm geçmişinden okunur (bu video hariç, en yeni önce, en çok 3)', () => {
  const file = path.join(home, 'data', 'docu-look-history.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify([
    { id: 'a', variant: 'v1', baseGrade: 'color' }, { id: 'b', variant: 'v2' }, { id: 'c', variant: 'v3', baseGrade: 'warm' },
    { id: 'd', variant: 'v4' }, { id: 'me', variant: 'v5' }, { variant: 7 },
  ]));
  assert.deepEqual(G.recentLooks({ id: 'me' }, file).map((e) => e.id), ['d', 'c', 'b']);
  assert.deepEqual(G.recentLooks({ id: 'me' }).map((e) => e.id), ['d', 'c', 'b'], 'varsayılan <NOVA_HOME>/data/docu-look-history.json');
  assert.deepEqual(G.recentLooks({}, path.join(home, 'yok.json')), []);
  assert.equal(G.recentLooksLine([]), '');
  const src = read('../src/pipeline/docu-design-gate.js');
  assert.ok(src.includes('gatePrompt(props, lines, { recent })'));
});

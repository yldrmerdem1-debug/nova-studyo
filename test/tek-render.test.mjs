// Tek render (19 Ekim 2026, kanal sahibi: "sürekli rendere girmesin, tekte mükemmel çıkarmalı"). Hürmüz videosu ön
// izlemeden geçtiği halde iki kez render'a girdi: ön izleme düşük önemli görsel uyuşmazlıkları (Bitcoin jetonu, ev
// sigortası belgesi, adı okunan tanker) bırakıyor ve tekrar eden kareyi hiç kontrol etmiyordu; render sonrası denetim
// bunları bulup ikinci render açtı. Artık ön izleme bunları render'dan önce düzeltir, render sonrası denetim ise ön
// izlemeden geçmiş videoda yalnızca YÜKSEK önemli sorunda yeniden render ister. Ağ ve ücretli çağrı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-tek-render-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');

const scenes = [
  { type: 'photo', say: 'Bottom mines can settle into soft mud, like a coin dropped in sand.', archived: true, image: 'a.jpg', imagePrompt: 'mine in mud' },
  { type: 'photo', say: 'Some are built to notice a ship\'s magnetic field.', image: 'img-x.jpg', imagePrompt: 'underwater hull' },
  { type: 'photo', say: 'Insurers didn\'t wait for an answer.', archived: true, image: 'b.jpg', imagePrompt: 'policy papers' },
  { type: 'words', say: 'how a US \'mines cleared\' statement…', bg: 'prev', textMode: 'key', text: 'x' },
];

test('preview fixes low-severity picture mismatches and repeats before the render (not left for a second render)', () => {
  const issues = [
    { scene: 0, kind: 'mismatch', severity: 'low', detail: 'Bitcoin coin for a coin in sand', fix: 'repick' },
    { scene: 1, kind: 'repeat', severity: 'low', detail: 'same AI hull as the scene before', fix: 'review' },
    { scene: 2, kind: 'mismatch', severity: 'low', detail: 'HOME INSURANCE POLICY', fix: 'repick' },
    // A low text note is not a picture problem: it stays a note.
    { scene: 3, kind: 'text_overflow', severity: 'low', detail: 'slightly tight', fix: 'edit-text' },
  ];
  const plan = P.previewFixPlan(issues, scenes, { fp: (s) => s.say.slice(0, 10) });
  assert.deepEqual(plan.repick.map((f) => f.scene).sort(), [0, 2]);
  assert.deepEqual(plan.ai.map((f) => f.scene), [1]);
  assert.equal(plan.patches.length, 0);
  // A medium one keeps working as before.
  const med = P.previewFixPlan([{ scene: 3, kind: 'text_overflow', severity: 'high', detail: "CLEARED'", fix: 'edit-text' }], scenes, { fp: (s) => 'k' });
  assert.equal(med.patches[0].fix, 'clean-picture');
});

test('the near-repeat rule is one function shared by the preview gate and the post-render check', () => {
  assert.equal(typeof Q.nearRepeats, 'function');
  assert.equal(typeof Q.frameHashes, 'function');
  const row = (r, scene, image, s = {}) => ({ r, scene, s: { type: 'photo', image, archived: true, ...s } });
  const h = (hash) => ({ hash, luma: 100 });
  const got = [
    { t: 10, row: row(0, 0, 'clip-a.jpg', { video: 'a.mp4' }), mid: true },
    { t: 20, row: row(1, 1, 'b.jpg'), mid: true },
    { t: 29, row: row(2, 2, 'clip-c.jpg', { video: 'c.mp4' }), mid: true },
    { t: 80, row: row(3, 3, 'd.jpg'), mid: true },
  ];
  const same = '3b31307874707014';
  const out = Q.nearRepeats(got, [h(same), h('c4cecf878b8f8feb'), h(same), h(same)]);
  assert.deepEqual(out.map((x) => x.scene), [2], 'the second showing within 30 s; the one 70 s later is the far-repeat rule\'s job');
  assert.equal(out[0].fix, 'repick');
  const preview = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu-preview.js'), 'utf8');
  assert.ok(preview.includes('farRepeats(rows)') && preview.includes('nearRepeats(got, await frameHashes(out, got.length, ffmpeg))'));
  const qa = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu-qa.js'), 'utf8');
  assert.ok(qa.includes('for (const x of nearRepeats(got, hashes)) add(x);'));
});

test('after a previewed script the post-render check only reports (no second render)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu.js'), 'utf8');
  assert.ok(src.includes('const autoFix = qaOn && settings.docuAutoFix === "always";'), 'no automatic second render, gate or not');
  assert.ok(src.includes('let gateRetries = 1;') && src.includes('kapı bir kez daha deneniyor'), 'a technical gate failure is retried once');
  assert.ok(src.includes('const gatePassed = !!readPv();'));
});

test('deep study (20 Oct): a MOMENT may open the film (date inside an event), a dry date heading may not; news voice gets the honesty frame', async () => {
  const E = await import('../docu-engine/lib/edit-scorecard.mjs');
  const mk = (first) => ({ scenes: [first, 'Then the water kept moving downstream for hours.', 'Nobody was watching the mountain that morning.'].map((say) => ({ type: 'photo', say, dur: 4 })) });
  assert.equal(E.editScorecard(mk('At 37 minutes past 8 in the morning on the 26th of August, a mountain on the border between Nepal and Tibet came apart.')).style.firstDate, false);
  assert.equal(E.editScorecard(mk("February 2026, the United States kills Iran's supreme leader.")).style.firstDate, false);
  assert.equal(E.editScorecard(mk('October fifth, 1989.')).style.firstDate, true);
  assert.equal(E.editScorecard(mk('October 29th, 1929, 10:00.')).style.firstDate, true);
  const L = await import('../src/pipeline/growth-lessons.js');
  const hook = L.hookGrowthLines().join('\n');
  assert.ok(hook.includes('İLK CÜMLEDE TARİH YOK') && hook.includes('İSTİSNA: saatiyle bir AN'));
  const news = L.voiceGrowthLines({ style: 'news' }).join('\n');
  assert.ok(news.includes('DÜRÜSTLÜK ÇERÇEVESİ') && news.includes("İLK DAKİKADA YOK"));
  assert.ok(!L.voiceGrowthLines({ style: 'story' }).join('\n').includes('DÜRÜSTLÜK ÇERÇEVESİ'));
});

// KALİTE DENETİMİNİN KUSURLU BULDUĞU RESİM KAPAĞA GİRMEZ.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını 20261024-950730): qa.json sahne 87 ai_look — "Arşiv fotoğrafı
// diye verilen Hitler görüntüsü bozuk ve yapay görünüyor: gözlük, kırmızı noktalar ve plastik yüz dokusu var."
// (çerçeveli portrenin camındaki yansıma). engine-script sahne 87 = cm-d878fca9856d.jpg = künye "Hitler Portrait from
// Berchtesgaden (Hitler's Eagle's Nest) (10470850625).jpg". package.md'de thumb-2 bu resim; thumb_b.jpg'de ikinci,
// hayalet bir yüz (gözlük, burunda ışık lekesi) görünüyor. docu-package.js qa.json'u hiç okumuyordu.
//
// DÜZELTME: adaylar shortlist'ten önce qa.json'un ve ön izlemenin son turunun (docu-preview-fixes.json `last`)
// resim kusurlarıyla (ai_look, broken, mismatch, wrong_face, anachronism) süzülür; `scene` engine-script indeksidir
// (props'taki bölüm kartları kaymaz). Denetimin gördüğü resim props'takidir: motorun render'da çizdiği AI resmi yalnızca
// orada, o da elenir; tutulan/ödünç kare (heldBg) komşunun resmini elemez. Son turdan sonra değişen sahne sayılmaz;
// hepsi kusurluysa süzülmemiş liste.
// Ağ, model, ffmpeg ve motor YOK: resimler yalnızca JPEG başlığı (imageSize başlıktan okur).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kapak-kusur-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const P = await import('../src/pipeline/docu-package.js');

const ID = '20261024-950730';
const rel = (f) => `build/${ID}/${f}`;
// 950730 engine-script sahneleri 84-87 ve künyeleri, olduğu gibi (kısaltılmış alanlar).
const REAL = {
  84: { type: 'words', say: '[quietly] The party built its leader a house in the clouds. But the records show he rarely went up.', text: 'But the records show he rarely went up.', search: 'Kehlsteinhaus seen from distance clouds', image: rel('arch-417448a86022.jpg'), archived: true, imgW: 2560, imgH: 1706 },
  85: { type: 'photo', say: "Most headlines this weekend call it Hitler's mountain retreat, but there wasn't a single bed in the building.", search: 'Kehlsteinhaus front view Bavaria', image: rel('arch-28a13e53cace.jpg'), archived: true, imgW: 2560, imgH: 1920 },
  86: { type: 'photo', say: '[curious] This is where we came in. But was this really where Hitler lived, as those headlines suggest?', search: 'Kehlsteinhaus seen from Brettgabel', image: rel('arch-9fdf9f586daa.jpg'), archived: true, imgW: 1838, imgH: 1082 },
  87: { type: 'words', say: 'Hitler visited the house on at least 14 documented occasions.', text: 'at least 14 documented occasions', keyword: '14', search: "Hitler portrait Eagle's Nest Berchtesgaden", image: rel('cm-d878fca9856d.jpg'), archived: true, imgW: 1920, imgH: 2880 },
};
const CREDITS = {
  'scene-84': { provider: 'openverse', eser: 'View of Kehlstein and Kehlsteinhaus from Almbachklamm Trail b', file: rel('arch-417448a86022.jpg') },
  'scene-85': { provider: 'wikimedia', eser: 'Kehlsteinhaus zezadu', file: rel('arch-28a13e53cace.jpg') },
  'scene-86': { provider: 'wikimedia', eser: 'Kehlsteinhaus gesehen von der Brettgabel', file: rel('arch-9fdf9f586daa.jpg') },
  'scene-87': { provider: 'wikimedia', eser: "Hitler Portrait from Berchtesgaden (Hitler's Eagle's Nest) (10470850625).jpg", file: rel('cm-d878fca9856d.jpg') },
};
// 950730 qa.json bulguları, olduğu gibi: yalnızca 87 resmin kendisini suçluyor.
const QA_ISSUES = [
  { scene: 0, kind: 'cta', severity: 'low', detail: 'Beğeni/abone çağrısı yok', fix: 'review' },
  { scene: 33, kind: 'text_overflow', severity: 'low', detail: 'Fotoğrafın solunda soluk, küçük yazı okunamıyor ve fotoğrafın arkasında kısmen kayboluyor.', fix: 'edit-text' },
  { scene: 87, kind: 'ai_look', severity: 'medium', detail: 'Arşiv fotoğrafı diye verilen Hitler görüntüsü bozuk ve yapay görünüyor: gözlük, kırmızı noktalar ve plastik yüz dokusu var.', fix: 'review' },
  { scene: null, kind: 'loudness', severity: 'medium', detail: 'Ses yüksekliği -16.2 LUFS (hedef -14)' },
];

/** Yalnızca SOF0 başlığı olan JPEG: imageSize w/h okur. */
const jpegHeader = (w, h) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03]), Buffer.alloc(32)]);

/**
 * 88 sahnelik engine-script (84-87 gerçek, kalanı görselsiz); props'ta 5 bölüm kartı: engine 87 → props 92.
 * propsOf: motorun props'ta değiştirdiği sahneler (engine-script indeksiyle); files: [rel, w, h] fazladan resim.
 */
function makeJob({ qa = null, preview = null, engineOf = {}, propsOf = {}, files = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(home, 'job-'));
  const pub = path.join(dir, 'docu', 'public');
  fs.mkdirSync(path.join(pub, 'build', ID), { recursive: true });
  for (const s of Object.values(REAL)) fs.writeFileSync(path.join(pub, s.image), jpegHeader(s.imgW, s.imgH));
  for (const [f, w, h] of files) fs.writeFileSync(path.join(pub, f), jpegHeader(w, h));
  const scenes = Array.from({ length: 88 }, (_, i) => REAL[i] || engineOf[i] || { type: 'photo', say: `Line ${i}.` });
  const props = [];
  scenes.forEach((s, i) => { if ([15, 35, 55, 70, 85].includes(i)) props.push({ type: 'title', chapterCard: true, title: `Chapter ${props.length}` }); props.push(propsOf[i] || s); });
  fs.writeFileSync(path.join(dir, 'docu', 'engine-script.json'), JSON.stringify({ id: ID, title: "Hitler's Eagle's Nest", scenes }));
  fs.writeFileSync(path.join(dir, 'docu', `${ID}.props.json`), JSON.stringify({ script: { id: ID, scenes: props } }));
  if (qa) fs.writeFileSync(path.join(dir, 'qa.json'), JSON.stringify(qa));
  if (preview) fs.writeFileSync(path.join(dir, 'docu-preview-fixes.json'), JSON.stringify(preview));
  return { dir, pub, props: { scenes: props }, engine: { scenes } };
}
const candidatesOf = (job, logFn) => P.packageCandidates({ jobDir: job.dir, script: job.props, engineScript: job.engine, credits: CREDITS, publicDir: job.pub, logFn });

test('qaFlaggedFiles: only picture flaws flag a file, by engine-script index', () => {
  const scenes = Array.from({ length: 88 }, (_, i) => REAL[i] || { type: 'photo' });
  assert.deepEqual([...P.qaFlaggedFiles({ issues: QA_ISSUES }, scenes)], [rel('cm-d878fca9856d.jpg')]);
  for (const kind of ['text_on_face', 'text_overflow', 'repeat', 'bad_crop', 'hook_slow', 'long_hold', 'silence']) {
    assert.equal(P.qaFlaggedFiles({ issues: [{ scene: 85, kind }] }, scenes).size, 0, kind);
  }
  for (const kind of ['ai_look', 'broken', 'mismatch', 'wrong_face', 'anachronism']) {
    assert.deepEqual([...P.qaFlaggedFiles({ issues: [{ scene: 85, kind }] }, scenes)], [rel('arch-28a13e53cace.jpg')], kind);
  }
  assert.equal(P.qaFlaggedFiles({ issues: [{ scene: 85, kind: 'mismatch' }] }, scenes, { except: [85] }).size, 0);
  // Props'taki "kaldırılmış" kopya (.lift.jpg) aday olmaz; asıl dosya işaretlenir.
  assert.deepEqual([...P.qaFlaggedFiles({ issues: [{ scene: 0, kind: 'mismatch' }] }, [{ image: rel('arch-c24386c18a8a.lift.jpg') }])], [rel('arch-c24386c18a8a.jpg')]);
  assert.equal(P.qaFlaggedFiles(null, scenes).size, 0);
});

test('without the QA verdict the fake-looking portrait leads the candidates (the 950730 defect reproduces)', () => {
  const cands = candidatesOf(makeJob());
  assert.equal(cands.length, 4);
  assert.equal(cands[0].rel, rel('cm-d878fca9856d.jpg'));
});

test('the portrait QA called ai_look never reaches the shortlist; the others stay', () => {
  const logs = [];
  const cands = candidatesOf(makeJob({ qa: { version: 'docu-qa-2', issues: QA_ISSUES } }), (m) => logs.push(m));
  const short = P.shortlist(cands);
  assert.ok(!short.some((c) => c.rel === rel('cm-d878fca9856d.jpg')));
  assert.deepEqual(short.map((c) => c.rel).sort(), [rel('arch-28a13e53cace.jpg'), rel('arch-417448a86022.jpg'), rel('arch-9fdf9f586daa.jpg')]);
  assert.ok(logs.some((m) => /kusurlu bulduğu 1 görsel çıkarıldı \(cm-d878fca9856d\.jpg\)/.test(m)), logs.join('\n'));
});

test("the preview gate's last round counts, except scenes it changed after that report", () => {
  const preview = { round: 2, changed: [85], last: { round: 2, issues: [{ scene: 86, kind: 'wrong_face' }, { scene: 85, kind: 'mismatch' }, { scene: 87, kind: 'text_on_face' }] } };
  const rels = candidatesOf(makeJob({ preview })).map((c) => c.rel);
  assert.ok(!rels.includes(rel('arch-9fdf9f586daa.jpg')), 'wrong_face picture is out');
  assert.ok(rels.includes(rel('arch-28a13e53cace.jpg')), 'scene 85 got a new picture after the report');
  assert.ok(rels.includes(rel('cm-d878fca9856d.jpg')), 'text over a face is an edit fault, not a picture fault');
});

test('an AI picture the engine drew (props only) is flagged too; a held neighbour picture is not', () => {
  // Motor AI resmini render'da çizer: engine-script sahnesinde yalnızca istem var, dosya props'ta (qaScriptOf'un gördüğü).
  const ai = rel('img-5f2c0a9e41d7.jpg');
  const engineOf = { 40: { type: 'photo', say: 'Workers blasted the road into the rock face in 1937.', imagePrompt: 'Workers blasting a mountain road, 1937' } };
  const propsOf = {
    40: { ...engineOf[40], image: ai, imgW: 1536, imgH: 1024 },
    // Sahne 41 kendi resmi olmadan 85'in fotoğrafını tutuyor: "anlatımla uyuşmuyor" bulgusu o fotoğrafı elemez.
    41: { type: 'words', say: 'The road took thirteen months.', text: 'thirteen months', image: rel('arch-28a13e53cace.jpg'), heldBg: true },
  };
  const qa = { issues: [{ scene: 40, kind: 'ai_look', severity: 'medium' }, { scene: 41, kind: 'mismatch', severity: 'medium' }] };
  const job = makeJob({ qa, engineOf, propsOf, files: [[ai, 1536, 1024]] });
  assert.ok(candidatesOf(makeJob({ engineOf, propsOf, files: [[ai, 1536, 1024]] })).some((c) => c.rel === ai), 'the AI picture is a candidate without QA');
  const rels = candidatesOf(job).map((c) => c.rel);
  assert.ok(!rels.includes(ai), 'ai_look on the engine-drawn picture');
  assert.ok(rels.includes(rel('arch-28a13e53cace.jpg')), 'held picture belongs to scene 85');
});

test('when every picture is flagged the package still gets the unfiltered list', () => {
  const qa = { issues: [84, 85, 86, 87].map((scene) => ({ scene, kind: 'mismatch' })) };
  assert.equal(candidatesOf(makeJob({ qa })).length, 4);
});

test('runDocuPackage builds its candidates through the QA filter', () => {
  const src = fs.readFileSync(new URL('../src/pipeline/docu-package.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export async function runDocuPackage'));
  assert.match(body, /const all = packageCandidates\(\{ jobDir, script, engineScript, credits, publicDir, logFn \}\);\s*\n\s*if \(!all\.length\)/);
  assert.match(body, /let cands = shortlist\(all\);/);
});

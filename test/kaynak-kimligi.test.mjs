// Kaynak kimliği ve işe yarayan düzeltmeler (18 Ekim 2026, Hürmüz mayınları gündem videosu — yeni mimarinin ilk işi).
//   1) Pixabay dosya adresi imzalıdır ve her aramada değişir: ön izleme ve render sonrası denetim "gemi adı açıklanmadı"
//      sahnesindeki EUROCHAMPION adlı tankeri iki kez reddetti, iki ret de başka jetona yazıldığı için üçüncü jetonla
//      yeniden seçildi ve ikinci bir render gerekti. Ret artık tek fotoğraflık stok sayfasını (kalıcı kimlik) da taşır.
//   2) Ön izlemenin "temiz resim" düzeltmesi önceki karenin üstündeki yazıda (bg prev) hiçbir şey yapmıyordu.
//   3) Kenardaki tek tırnak bir alıntı işaretidir: "'mines cleared'" kancada "CLEARED'" diye çakıldı.
// Ağ ve ücretli çağrı YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kaynak-test-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const media = await import('../src/pipeline/media.js');
const arch = await import('../src/pipeline/docu-archive.js');
const Q = await import('../src/pipeline/docu-qa.js');
const gate = await import('../src/pipeline/docu-design-gate.js');

const SAYFA = 'https://pixabay.com/photos/cargo-ship-seagoing-vessel-7240023/';
const jeton = (j) => `https://pixabay.com/get/g${j}5b1c6e972e4789650d90b94f113809593e2f7a57a2d0a0a2a43f5e4_1280.jpg`;

test('stable refs: a one-photo stock page is part of the identity, a museum/archive page is not', () => {
  assert.deepEqual(media.stablePhotoRefs({ url: jeton('a1'), sayfa: SAYFA }), [jeton('a1'), SAYFA]);
  assert.deepEqual(media.stablePhotoRefs({ url: 'https://images.pexels.com/photos/26559000/p.jpeg?w=940', sayfa: 'https://www.pexels.com/photo/tanker-26559000/' }).length, 2);
  // Müze nesnesi sayfası birden çok görünüş taşır: yalnızca dosya.
  assert.deepEqual(media.stablePhotoRefs({ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Mine.jpg', sayfa: 'https://www.si.edu/object/naval-mine:nmah_123' }), ['https://upload.wikimedia.org/wikipedia/commons/a/ab/Mine.jpg']);
  assert.deepEqual(media.stablePhotoRefs(null), []);
  // İki jeton aynı dosya anahtarını vermez — sayfa olmadan aynı fotoğraf tanınamazdı.
  assert.notEqual(media.photoKey(jeton('a1')), media.photoKey(jeton('b2')));
});

test('a rejected Pixabay pick is remembered by its page: a new signed URL of the same photo stays rejected', () => {
  const cache = { abc: { url: jeton('a1'), sayfa: SAYFA, provider: 'pixabay', file: 'build/x/arch-1.jpg' } };
  assert.equal(arch.forgetCachedPick(cache, 'abc', 1000), true);
  const bad = Object.keys(cache['m-abc'].bad);
  assert.ok(bad.some((k) => k.startsWith('sayfa:') && k.includes('7240023')), JSON.stringify(bad));
  // Müze fotoğrafında sayfa listeye girmez (aynı sayfadaki başka görünüş seçilebilir).
  const c2 = { k: { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Mine.jpg', sayfa: 'https://www.si.edu/object/x' } };
  arch.forgetCachedPick(c2, 'k', 1000);
  assert.ok(!Object.keys(c2['m-k'].bad).some((k) => k.startsWith('sayfa:')));
});

test('QA rejection matches the same photo under another signed URL (scene falls back to AI)', () => {
  const docu = { scenes: [{ type: 'photo', say: 'No ship names were released.', archived: true, image: 'build/x/arch-1.jpg', imgW: 1280, imgH: 852 }] };
  const credits = { 'scene-0': { url: jeton('c3'), sayfa: SAYFA, provider: 'pixabay' } };
  // Ön izleme ve render sonrası ret: iki eski jeton + sayfa (docu.js artık stablePhotoRefs yazar).
  const fixes = { scenes: { 0: { rejected: [jeton('a1'), SAYFA, jeton('b2')] } } };
  assert.equal(Q.applyQaRejections(docu, credits, fixes), 1);
  assert.equal(docu.scenes[0].image, undefined);
  assert.equal(credits['scene-0'], undefined);
  // Eski kayıt (yalnızca başka jeton, sayfa yok) eskisi gibi eşleşmez — yanlış pozitif yok.
  const d2 = { scenes: [{ type: 'photo', archived: true, image: 'x.jpg' }] };
  const c2 = { 'scene-0': { url: jeton('c3'), sayfa: 'https://pixabay.com/photos/other-ship-111/' } };
  assert.equal(Q.applyQaRejections(d2, c2, { scenes: { 0: { rejected: [jeton('a1'), SAYFA] } } }), 0);
});

test('clean-picture on a line over the previous picture really removes the text', () => {
  const prev = { type: 'words', say: "how a US 'mines cleared' statement…", text: "'mines cleared' statement", keyword: 'cleared', bg: 'prev', textMode: 'key' };
  assert.equal(gate.applyFix(prev, 'clean-picture').textMode, 'none');
  assert.equal(gate.applyFix({ ...prev, bg: 'next' }, 'clean-picture').textMode, 'none');
  assert.equal(gate.applyFix({ ...prev, bg: undefined, image: 'a.jpg' }, 'clean-picture').textMode, 'none');
  // Hiç resmi olmayan kart: yazı kalır, yalnızca anahtar kelime.
  assert.equal(gate.applyFix({ type: 'words', text: 'x y z', textMode: 'full' }, 'clean-picture').textMode, 'key');
});

test('slammed words drop quotation marks at their edges, keep apostrophes inside', () => {
  const src = fs.readFileSync(path.join(ROOT, 'docu-engine', 'src', 'scenes.tsx'), 'utf8');
  const m = src.match(/const displayWord = \(w: string\) => (w\.replace\(.+\));\n/);
  assert.ok(m, 'displayWord found');
  const displayWord = new Function('w', `return ${m[1]};`);
  assert.equal(displayWord("cleared'"), 'cleared');
  assert.equal(displayWord("'mines"), 'mines');
  assert.equal(displayWord('‘strike’'), 'strike');
  assert.equal(displayWord("Enron'un"), "Enron'un");
  assert.equal(displayWord("Iran's"), "Iran's");
  assert.equal(displayWord('7.6,'), '7.6');
  assert.equal(displayWord('—now'), 'now');
});

test('cover text: a " / " line separator is not a word and is never printed (the highlight follows its word)', async () => {
  const P = await import('../src/pipeline/docu-package.js');
  const plan = {
    titles: ['Hormuz: Two Tankers', 'No Names Yet', 'What Is Confirmed', 'The Mine Claim', 'Oil And Insurance'].map((text) => ({ text, angle: 'x' })),
    thumbnails: [
      { hero: 'c1', layout: 'hero', text: 'IRAN–USA WAR / WHY SAUDI?', highlight: 4, number: '' },
      { hero: 'c2', layout: 'number', text: 'SHIPS. / ONE HILL', highlight: -1, number: '70' },
      { hero: 'c3', layout: 'circle', text: 'NO NAMES — NO PROOF?', highlight: 3, number: '' },
    ],
  };
  const e = P.planErrors(plan, { ids: ['c1', 'c2', 'c3'] });
  assert.ok(!e.some((x) => /kelime/.test(x)), e.join(' | '));
  // A real fifth word is still sent back for repair.
  assert.match(P.planErrors({ ...plan, thumbnails: [{ ...plan.thumbnails[0], text: 'IRAN USA WAR / WHY SAUDI?' }, ...plan.thumbnails.slice(1)] }, { ids: ['c1', 'c2', 'c3'] }).join(' '), /yazı 5 kelime/);
  const byId = new Map(['c1', 'c2', 'c3'].map((id) => [id, { id, rel: `x/${id}.jpg`, w: 1280, h: 720 }]));
  const { spec: s } = P.specFromPlan(plan.thumbnails[0], byId, 0);
  assert.equal(s.text, 'IRAN–USA WAR WHY SAUDI?');
  assert.equal(s.highlight, 3, 'SAUDI? stays the highlighted word');
  assert.equal(P.specFromPlan(plan.thumbnails[2], byId, 2).spec.text, 'NO NAMES NO PROOF?');
});

test('a patch or re-render never runs the old design gate over a script the preview gate already checked', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu.js'), 'utf8');
  const iGate = src.indexOf('await designGate(engineDocu');
  const cond = src.lastIndexOf('if (settings.docuDesignGate !== false', iGate);
  assert.ok(cond > 0 && iGate - cond < 600, 'the gate sits under its condition');
  assert.match(src.slice(cond, src.indexOf('\n', cond)), /&& !readPv\(\)/, 'skipped when docu-preview-fixes.json belongs to this script');
  // readPv is defined before the gate (same docKey check).
  assert.ok(src.indexOf('const readPv = () =>') > 0 && src.indexOf('const readPv = () =>') < cond);
});

test('news voice addresses the viewer in measure (~0.5 "you" per 100 words), only where the story touches them', async () => {
  const L = await import('../src/pipeline/growth-lessons.js');
  const news = L.voiceGrowthLines({ style: 'news' }).join('\n');
  assert.ok(news.includes('İZLEYİCİYE HİTAP') && /100 kelimede yaklaşık yarım/.test(news), 'the rule is in the news voice');
  assert.ok(news.includes("If you filled up a car this week"), 'with an example that carries information');
  assert.ok(!/'you' az/.test(news), 'the old "little you" line is gone');
  // Story (history) and host voices keep their own rules.
  assert.ok(!L.voiceGrowthLines({ style: 'story' }).join('\n').includes('İZLEYİCİYE HİTAP'));
  assert.ok(!L.voiceGrowthLines({ style: 'host' }).join('\n').includes('İZLEYİCİYE HİTAP'));
});

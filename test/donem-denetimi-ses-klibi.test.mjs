// SES KLİBİNDEN SONRAKİ SAHNENİN DÖNEM DÜZELTMESİ KENDİ SAHNESİNE YAZILIR (docu-era-audit.js).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 2. tur kod incelemesi): docu.js dönem denetimini auditEra({ script: engineDocu,
// keyScript: directed }) ile çağırır. Denetim sahneleri MOTORUN senaryosuyla sayar; ses klipleri (source-clips.js
// sourceVoice) oraya yeni sahne olarak girer. Künyeler (scene-N), docu-era-fixes.json (applyEraRejections, eraAiOnly →
// arşiv seçicisinin aiOnly'si), AI notları ve arşiv seçiminin silinmesi (invalidateArchivePicks) ise YÖNETMENİN
// senaryosuyla okunur. Klipten sonraki sahnenin künyesi bir sonraki sahnenindi (AI sahnesinin ardındaki arşiv sahnesi hiç
// denetlenmiyordu), ret/AI notu bir SONRAKİ sahneye yazılıyor, onun arşiv seçimi siliniyordu. Artık her işaret yönetmenin
// sahnesine (fixId) yazılır; araya giren klibin işareti yalnızca klibin adresini reddeder (docu.js fixSceneKey anahtarı).
// Ağ YOK, ffmpeg YOK, görme modeli YOK: kararlar önbellekten (docu-era-audit.json), dosyalar boş yer tutucular.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-donem-klip-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const E = await import('../src/pipeline/docu-era-audit.js');
const Q = await import('../src/pipeline/docu-qa.js');
const D = await import('../src/pipeline/docu.js');
const { applySourcePicks } = await import('../src/pipeline/source-clips.js');

const ERA = '1929-1933';
const B = 'build/t';
const AI = `${B}/img-0123456789ab.jpg`;
// Yönetmenin senaryosu (arşivden sonra): 2, 4-m1 ve 5 dönem dışı stok; 3 dönem dışı AI görseli.
const directed = () => ({ id: 't', title: 'Crash', era: ERA, scenes: [
  { type: 'photo', source: 'archive', search: 'herbert hoover portrait', say: 'Hoover promised prosperity.', dur: 4, archived: true, image: `${B}/arch-a.jpg` },
  { type: 'photo', source: 'stock', search: 'trading floor', say: 'Then the floor went quiet.', dur: 4, archived: true, image: `${B}/arch-b.jpg` },
  { type: 'photo', source: 'stock', search: 'gold bars', say: 'Gold fled the country.', dur: 4, archived: true, image: `${B}/arch-c.jpg` },
  { type: 'photo', source: 'ai', say: 'Brokers stared at the ticker.', dur: 4, imagePrompt: 'brokers around a ticker machine' },
  { type: 'montage', say: 'The bell rang.', dur: 3, imagePrompts: ['a closing bell', { prompt: 'Federal Hall', search: 'federal hall new york', source: 'stock', image: `${B}/arch-d.jpg` }] },
  { type: 'photo', source: 'stock', search: 'bread line', say: 'Lines formed for bread.', dur: 4, archived: true, image: `${B}/arch-e.jpg` },
] });
const U = {
  a: 'https://tile.loc.gov/hoover.jpg',
  b: 'https://images.pexels.com/photos/2/floor.jpg',
  c: 'https://pixabay.com/get/gGOLD', cPage: 'https://pixabay.com/photos/gold-bars-42/',
  d: 'https://images.pexels.com/photos/9/federal.jpg', dPage: 'https://www.pexels.com/photo/federal-9/',
  e: 'https://pixabay.com/get/gBREAD', ePage: 'https://pixabay.com/photos/bread-line-7/',
};
const credits0 = () => ({
  'scene-0': { provider: 'loc', url: U.a, file: `${B}/arch-a.jpg` },
  'scene-1': { provider: 'pexels', url: U.b, file: `${B}/arch-b.jpg` },
  'scene-2': { provider: 'pixabay', url: U.c, sayfa: U.cPage, file: `${B}/arch-c.jpg` },
  'scene-4-m1': { provider: 'pexels', url: U.d, sayfa: U.dPage, file: `${B}/arch-d.jpg` },
  'scene-5': { provider: 'pixabay', url: U.e, sayfa: U.ePage, file: `${B}/arch-e.jpg` },
});
// Ses klipleri: sahne 1'in ve sahne 4'ün ardına.
const voice = (scene, id) => ({ scene, kind: 'voice', id, url: `https://www.youtube.com/watch?v=${id}`, title: 'Newsreel', channel: 'Archive TV', label: 'Video: Archive TV', video: `${B}/src/${id}.mp4`, wav: `${B}/src/${id}.wav`, dur: 3, w: 1280, h: 720, quote: `We will not panic ${id}.` });
const V1 = voice(1, 'vvvvvvvvvvv');
const V2 = voice(4, 'wwwwwwwwwww');

/** Motora giden senaryo + iş klasörü: yer tutucu dosyalar, motorun props'u (AI görseli), arşiv önbelleği, kararlar. */
function makeJob(clips, modern) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-donem-klip-job-'));
  const pub = path.join(dir, 'docu', 'public');
  const credits = credits0();
  const { script: engine } = applySourcePicks(directed(), credits, clips);
  const aiAt = engine.scenes.findIndex((s) => s.imagePrompt === 'brokers around a ticker machine');
  const props = { script: { scenes: engine.scenes.map((s, i) => (i === aiAt ? { ...s, image: AI } : s)) } };
  for (const f of [...Object.values(credits).map((c) => c.file), AI]) {
    fs.mkdirSync(path.dirname(path.join(pub, f)), { recursive: true });
    fs.writeFileSync(path.join(pub, f), 'x');
  }
  const propsFile = path.join(dir, 'docu', 't.props.json');
  fs.writeFileSync(propsFile, JSON.stringify(props));
  // Arşiv önbelleği yönetmenin senaryosunun anahtarlarıyla (docu.js resolveArchive(directed)).
  const keys = Q.archiveKeys(directed());
  const cache = {};
  for (const k of keys) { cache[k.key] = { file: 'x', url: 'u' }; cache[k.vkey] = { video: 'v', url: 'u' }; }
  fs.writeFileSync(path.join(dir, 'docu-archive.json'), JSON.stringify(cache));
  // Görme modelinin kararları önbellekte: dönem dışı olanlar adresleriyle (sıradan bağımsız), gerisi temiz.
  const items = {};
  for (const x of E.eraItems(engine, credits, { publicDir: pub, propsFile, keyScript: directed() })) {
    const bad = modern.some((m) => x.ident === m);
    items[E.eraKey(ERA, x.ident)] = bad ? { v: 'flag', what: 'modern thing', conf: 'high' } : { v: 'ok' };
  }
  fs.writeFileSync(path.join(dir, 'docu-era-audit.json'), JSON.stringify({ version: E.ERA_AUDIT_VERSION, items }));
  return { dir, pub, propsFile, engine, credits, keys };
}

const MODERN = [`a|${U.c}|`, `a|${U.d}|`, `a|${U.e}|`, `i|${path.basename(AI)}`];
const noModel = async () => { throw Error('no vision call expected: every verdict is cached'); };

test('directedOrder: docu.js directedIndexes ile aynı eşleme (bir ve iki ses klibi, klipsiz)', () => {
  for (const clips of [[V1], [V1, V2], []]) {
    const { script: engine } = applySourcePicks(directed(), credits0(), clips);
    assert.deepEqual(E.directedOrder(directed().scenes, engine.scenes), D.directedIndexes(directed().scenes, engine.scenes), `${clips.length} klip`);
  }
  const { script: two } = applySourcePicks(directed(), credits0(), [V1, V2]);
  assert.deepEqual(E.directedOrder(directed().scenes, two.scenes), [0, 1, -1, 2, 3, 4, -1, 5]);
});

for (const clips of [[V1], [V1, V2]]) {
  test(`auditEra (${clips.length} ses klibi): künye, ret, AI notu ve arşiv seçiminin silinmesi yönetmenin sahnesine; klip yalnızca adresiyle`, async () => {
    const { dir, pub, propsFile, engine, credits, keys } = makeJob(clips, [...MODERN, ...clips.map((v) => `a|${v.url}|0`)]);
    const clipScenes = engine.scenes.filter((s) => s.sourceVoice);
    assert.equal(clipScenes.length, clips.length);
    const logs = [];
    const r = await E.auditEra({ script: engine, credits, dir, publicDir: pub, propsFile, keyScript: directed(), docKey: 'K', settings: {}, llm: noModel, ffmpeg: 'ffmpeg-not-used', logFn: (m) => logs.push(m) });
    assert.equal(r.calls, 0);
    const klipKeys = clipScenes.map((s) => D.fixSceneKey(-1, s));
    assert.deepEqual(r.applied.ids.map(String).sort(), ['2', '4-m1', '5', ...klipKeys].sort());
    assert.equal(r.applied.aiRegen, 1);
    const fixes = E.readEraFixes(dir);
    // Kendi sahnesinin adresi (eskiden: bir sonraki sahnenin künyesi ya da hiç denetlenmeyen sahne).
    assert.deepEqual(fixes.scenes['2'].rejected, [U.c, U.cPage]);
    assert.deepEqual(fixes.scenes['4-m1'].rejected, [U.d, U.dPage]);
    assert.deepEqual(fixes.scenes['5'].rejected, [U.e, U.ePage]);
    for (const k of ['0', '1', '3', '4', '6', '7', '5-m1', '6-m1']) assert.equal(fixes.scenes[k], undefined, `scene ${k} untouched`);
    assert.deepEqual(Object.keys(fixes.aiFix), ['3']);
    assert.match(fixes.aiFix['3'], /^Strictly period-accurate for 1929-1933/);
    assert.ok(!fs.existsSync(path.join(pub, AI)), 'the AI picture is deleted for one regeneration');
    // Ses klibi: yalnızca adresi (kaynak video adımı onu bir daha koymaz); AI'a düşen sahne, arşiv kaydı silinmesi yok.
    clips.forEach((v, n) => assert.deepEqual(fixes.scenes[klipKeys[n]].rejected, [v.url]));
    assert.deepEqual(E.eraAiOnly(fixes, ERA), []);
    for (const v of clips) assert.ok(E.eraRejectedUrls(fixes, ERA).includes(v.url));
    // Sonraki hazırlıkta kaynak video adımı reddedilen klibi kayıttan yeniden koymaz (docu.js: rejected = eraRejectedUrls).
    const yine = applySourcePicks(directed(), credits0(), clips, { rejected: E.eraRejectedUrls(fixes, ERA) });
    assert.equal(yine.script.scenes.filter((s) => s.sourceVoice).length, 0, 'the rejected voice clip is not inserted again');
    const left = JSON.parse(fs.readFileSync(path.join(dir, 'docu-archive.json'), 'utf8'));
    for (const k of keys) assert.equal(k.key in left, !['2', '4-m1', '5'].includes(String(k.i)), `archive pick ${k.i}`);
    assert.ok(logs.some((l) => /ses klibi dönem dışı — adresi reddedildi/.test(l)), logs.join('\n'));

    // Sonraki hazırlık (docu.js prepareEngineDocu: applyEraRejections, kaynak videodan ÖNCE, yönetmenin sırası): arşiv
    // aynı kötü seçimleri yeniden verdi → o sahneler/kare AI'a düşer; not yönetmenin AI sahnesine yazılır.
    const ed = directed();
    const c2 = credits0();
    const back = E.applyEraRejections(ed, c2, fixes);
    assert.equal(back.toAi, 3);
    assert.ok(ed.scenes[0].archived && ed.scenes[1].archived, 'scenes before the clip keep their pictures');
    assert.ok(!ed.scenes[2].archived && !ed.scenes[5].archived && !ed.scenes[4].imagePrompts[1].image);
    assert.match(ed.scenes[3].aiFix, /^Strictly period-accurate/);
    assert.equal(ed.scenes[4].aiFix, undefined);
  });
}

test('eraItems: ses klibinden sonraki sahne kendi künyesiyle denetlenir; klip kendi künyesiyle (dosyasıyla)', () => {
  const { pub, propsFile, engine, credits } = makeJob([V1, V2], []);
  const items = E.eraItems(engine, credits, { publicDir: pub, propsFile, keyScript: directed() });
  const by = Object.fromEntries(items.map((x) => [String(x.id), x]));
  // Motor: 0 1 V1 2 3 4 V2 5 → yönetmen 0 1 - 2 3 4 - 5.
  assert.equal(by['3'].url, U.c); assert.equal(by['3'].fixId, 2);
  assert.equal(by['4'].kind, 'ai'); assert.equal(by['4'].fixId, 3);
  assert.equal(by['5-m1'].url, U.d); assert.equal(by['5-m1'].fixId, '4-m1');
  assert.equal(by['7'].url, U.e); assert.equal(by['7'].fixId, 5);
  assert.equal(by['2'].url, V1.url); assert.equal(by['2'].fixId, D.fixSceneKey(-1, engine.scenes[2]));
  assert.equal(by['6'].url, V2.url); assert.equal(by['6'].fixId, D.fixSceneKey(-1, engine.scenes[6]));
  // Klipsiz (ya da keyScript verilmeden): sıra aynen, eski davranış.
  const { script: plain } = applySourcePicks(directed(), credits0(), []);
  const same = E.eraItems(plain, credits0(), { publicDir: pub, propsFile: null });
  assert.deepEqual(same.map((x) => [x.id, x.fixId, x.url]), [[0, 0, U.a], [1, 1, U.b], [2, 2, U.c], ['4-m1', '4-m1', U.d], [5, 5, U.e]]);
});

// KAPININ KARESİ GEÇİŞİN İÇİNDEN ALINMAZ — ön izleme her anı sahnenin oturmuş, tam görünen aralığından alır.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması, iş 20261024-373aaf): rapor-tur-1'de üç yüksek önemli "broken" —
// sahne 29 "neredeyse tamamen beyaz/krem", 74 "boş bej vinyet", 131 "tamamen boş bej vinyet zemin" — resimlerin değil
// karenin kusuruydu (arch-17ae2f543544.jpg, arch-05772a976686.jpg ve harita sağlam). previewMoments sahnenin karesini
// "oturma" anında alıyordu (son kelime + 14 kare); bu üç sahnede an sahnenin sonunu aşıyor ve sahnenin EN SON karesine
// kısılıyordu: 29 → 187/188, 74 → 159/160, 131 → 138/139 (iki üstteki sayılar işin props.json'u + placeTimeline). Orası çıkan
// geçişin içi: motorun senaryosunda (engine-script) 30 ve 75'e film-burn ile, 132'ye dip-color ile giriliyor — film-burn
// çıkan çekimi beyaz-sıcak filme yakar, epik türün dip-color'ı bej #f1dcaa'ya batırır, yazı/ikon son 10 karede söner.
// Kurtulan tek harita (sahne 4) 152/183'te, geçişten uzaktı. Kural: an, giren geçiş/silme/başlangıç efekti bittikten sonra,
// çıkan geçiş/silme/yazının sönmesi başlamadan önce (motorun kendi pencere uzunluklarıyla); flaş karesine düşmez; sahne
// yetmiyorsa ortası ("edge"). Motorun kaynakları yalnızca okunur; render, ffmpeg, ağ YOK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const P = await import('../src/pipeline/docu-preview.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const W = (pairs) => pairs.map(([word, t]) => ({ word, t }));

// İşin props.json'undan (docu/20261024-373aaf.props.json, placeTimeline(props.scenes, 30, props.beats)): props sırası, from,
// frames ve son sözcükler gerçek. Geçişler engine-script'ten (rapor-tur-1'in çizildiği senaryo): 30 ← film-burn, 75 ←
// film-burn, 132 ← dip-color; 4 ve çevresi kesme.
const JOB = {
  4: { // sahne 4, harita — kurtulan (kıyısız ama yıkanmamış) kare
    scenes: [
      { type: 'title', transition: 'match', say: 'Both boats were nuclear missile submarines, and their navies were allies.' },
      { type: 'map', transition: 'cut', say: 'They collided underwater in the Atlantic, on the night of 3 to 4 February 2009.', wordTimes: W([['They', 0], ['Atlantic,', 1.608], ['February', 3.904], ['2009.', 4.593]]) },
      { type: 'photo', transition: 'cut', fx: ['vignette-pulse'], say: 'Two of the quietest machines ever built found each other.' },
    ],
    placed: [{ from: 274, frames: 158 }, { from: 432, frames: 183 }, { from: 615, frames: 117 }],
  },
  29: { // sahne 29, arşiv fotoğrafı (fx zoom-blur + flash-frame) → 30: slam, film-burn ile
    scenes: [
      { type: 'photo', transition: 'spin-blur', say: '[slowly, with weight] And the part of Le Triomphant that broke was her bow.' },
      { type: 'photo', transition: 'cut', fx: ['zoom-blur', 'flash-frame'], image: 'build/j/arch-17ae2f543544.jpg', archived: true, say: "A sonar dome is a submarine's ears, the window through which she hears the sea around her.", wordTimes: W([['A', 0], ['ears,', 2.08], ['window', 3.28], ['hears', 4.28], ['the', 4.64], ['sea', 4.92], ['around', 5.12], ['her.', 5.84]]) },
      { type: 'slam', transition: 'film-burn', say: 'The part built to hear danger was the part the danger broke.' },
    ],
    placed: [{ from: 3904, frames: 152 }, { from: 4056, frames: 188 }, { from: 4244, frames: 130 }],
  },
  74: { // sahne 74, harita → 75: fotoğraf, film-burn ile
    scenes: [
      { type: 'words', transition: 'spin-blur', say: 'Vanguard faced a longer passage north, toward Faslane on the Clyde.' },
      { type: 'map', transition: 'cut', say: 'Between Brest and Faslane lay open ocean, and Vanguard was still out in it.', wordTimes: W([['Between', 0], ['Vanguard', 3.28], ['out', 4.32], ['in', 4.56], ['it.', 4.92]]) },
      { type: 'photo', transition: 'film-burn', fx: ['vignette-pulse', 'dolly-zoom'], say: 'In London, the Ministry of Defence would not even confirm that anything had happened.' },
    ],
    placed: [{ from: 10640, frames: 137 }, { from: 10777, frames: 160 }, { from: 10937, frames: 156 }],
  },
  131: { // sahne 131, arşiv fotoğrafı → 132: yazı kartı, dip-color ile
    scenes: [
      { type: 'ui-card', transition: 'cut', say: 'MPs had asked about repair costs, the sonar, the marine environment and France.' },
      { type: 'photo', transition: 'cut', image: 'build/j/arch-05772a976686.jpg', archived: true, fullBleed: true, say: 'The replies read like a bank statement blacked out except for the balance.', wordTimes: W([['The', 0], ['statement', 1.6], ['except', 3.04], ['the', 3.52], ['balance.', 4.12]]) },
      { type: 'words', transition: 'dip-color', say: '[firmly] The Nuclear Information Service and the Ground Zero Center asked for the report itself.' },
    ],
    placed: [{ from: 19533, frames: 192 }, { from: 19725, frames: 139 }, { from: 19864, frames: 211 }],
  },
};
const own = (k) => P.previewMoments(JOB[k].scenes, JOB[k].placed).filter((m) => m.r === 1);
const local = (k) => own(k)[0].frame - JOB[k].placed[1].from;

test('iş 20261024-373aaf: 29, 74 ve 131\'in karesi artık son karede (çıkan geçişin içinde) değil, temiz aralıkta; 4 aynı', () => {
  // Çıkan çift geçiş kesmeden önceki `a` kareyi örter (Engine.tsx PairWindow; film-burn 9, dip-color 7), yazı son 10 karede söner.
  const OUT = { 29: 9, 74: 9, 131: 7 };
  for (const k of [29, 74, 131]) {
    const { scenes, placed } = JOB[k];
    const frames = placed[1].frames;
    const settled = Math.round(scenes[1].wordTimes.at(-1).t * 30) + 14;
    assert.ok(settled >= frames - 1, `sahne ${k}: oturma anı (${settled}) sahnenin sonunda/ötesinde — eski kod son kareyi (${frames - 1}) alırdı`);
    assert.equal(own(k).length, 1);
    assert.notEqual(local(k), frames - 1, `sahne ${k}: son kare değil`);
    assert.ok(local(k) < frames - Math.max(OUT[k], 10), `sahne ${k}: an (${local(k)}) çıkan geçişin ve yazının sönmesinin önünde`);
    assert.ok(!own(k)[0].edge, 'sahne yetiyor: geçiş karesi değil');
    assert.equal(P.TRANSITION_WINDOW[scenes[2].transition][0], OUT[k], 'kapının bildiği pencere motorunki');
  }
  assert.equal(local(74), 160 - 11, 'harita: yazının sönmesinden hemen önce');
  assert.equal(local(131), 139 - 11);
  // 29'da flaş karesi var (flash-frame). Vuruşu motor seçer (işin sahnesinde 90. kare, uzun duraktan sonraki "the"), kapı
  // bilemez: her sözcük olası vuruş. 177, "her." (175) vuruş olsaydı flaşın içinde kalırdı → sözcüğün hemen öncesi.
  assert.equal(local(29), 174);
  assert.equal(local(4), Math.round(4.593 * 30) + 14, 'geçişten uzak an değişmez (152/183)');
  assert.equal(local(4), 152);
});

test('kesme bugünkü props gibi "cut" olsa da an son karede değil: yazı/ikon son 10 karede söner', () => {
  for (const k of [29, 74]) {
    const scenes = JOB[k].scenes.map((s, i) => (i === 2 ? { ...s, transition: 'cut' } : s));
    const m = P.previewMoments(scenes, JOB[k].placed).find((x) => x.r === 1);
    const at = m.frame - JOB[k].placed[1].from;
    assert.ok(at <= JOB[k].placed[1].frames - 1 - 10, `sahne ${k}: ${at}`);
  }
});

test('giren örtüler: çift geçiş, konu silmesi ve başlangıç efekti bitmeden alınmaz; yazılmamış geçişte en uzun pencere', () => {
  const placed = [{ from: 0, frames: 120 }, { from: 120, frames: 90 }, { from: 210, frames: 120 }];
  const one = (cur, { next = {} } = {}) => P.previewMoments([{ type: 'photo', transition: 'cut' }, { type: 'slam', say: 'Silence.', wordTimes: W([['Silence.', 0.05]]), ...cur }, { type: 'photo', transition: 'cut', ...next }], placed).find((m) => m.r === 1).frame - 120;
  const span = (cur, next = {}) => P.cleanSpan([{ type: 'photo', transition: 'cut' }, { type: 'slam', ...cur }, { type: 'photo', transition: 'cut', ...next }], placed, 1);
  assert.equal(one({ transition: 'cut', fx: ['film-burn'] }), 33, 'başlangıç yanığı (1,1 sn, kareyi yakar) bitince');
  assert.equal(one({ transition: 'cut' }), 2 + 14, 'kısa slam: oturma anı (sözcük + 14 kare)');
  assert.deepEqual([span({ transition: 'film-burn' })[0], span({ transition: 'ink' })[0], span({ transition: 'flash' })[0], span({ transition: 'cut', wipe: true })[0]], [10, 12, 4, 12]);
  assert.equal(one({ transition: 'film-burn' }), 16, 'oturma anı giren geçişten zaten sonra: değişmez');
  assert.equal(span({ transition: 'cut', fx: ['zoom-blur'] })[0], 12);
  assert.equal(span({ transition: undefined })[0], 12, 'yazılmamış geçiş: motor seçer (pickTransitions), en uzunu varsayılır');
  assert.equal(span({ transition: 'cut' }, { transition: undefined })[1], 90 - 1 - 10);
  // Çıkışta: çift geçiş (film-burn 9 kare), sonraki sahnenin konu silmesi (10) ve yazının sönmesi (10) — en uzunu.
  const late = { wordTimes: W([['x', 0], ['y', 2.9]]), say: 'x y' };
  assert.equal(one({ transition: 'cut', ...late }, { next: { transition: 'film-burn' } }), 90 - 11);
  assert.equal(one({ transition: 'cut', ...late }, { next: { transition: 'cut', wipe: true } }), 90 - 11);
});

test('çift geçiş iki çekimin üçte birini geçmez (pairFrames); sahne temiz aralığa yetmiyorsa ortası, "edge"', () => {
  const scenes = [{ type: 'photo', transition: 'cut' }, { type: 'photo', transition: 'film-burn', say: 'z' }, { type: 'photo', transition: 'film-burn' }];
  const short = [{ from: 0, frames: 120 }, { from: 120, frames: 15 }, { from: 135, frames: 120 }];
  const m = P.previewMoments(scenes, short).filter((x) => x.r === 1);
  assert.deepEqual(m.map((x) => [x.frame - 120, x.edge]), [[7, true]], 'ortası, geçiş karesi diye işaretli');
  assert.ok(P.previewMoments(scenes, short).filter((x) => x.r !== 1).every((x) => !x.edge));
  const [lo, hi] = P.cleanSpan(scenes, short, 1);
  assert.ok(lo > hi, '15 kare: temiz aralık yok');
  assert.deepEqual(P.cleanSpan(scenes, [{ from: 0, frames: 120 }, { from: 120, frames: 24 }, { from: 144, frames: 120 }], 1), [8, 13], '24 kare: giren 10 → 8 (üçte bir), çıkan 9 → 8; yazı sönmesi 10');
});

test('ara plan: +0,7 sn anı çıkışa taşarsa temiz aralığın sonuna kısılır; çıkış penceresinde başlayan ara plan çizilmez', () => {
  const scenes = [
    { type: 'photo', transition: 'cut', say: 'a', wordTimes: W([['a', 0.2], ['b', 1.5]]), inserts: [{ src: 'i1.jpg', at: 0.5 }, { src: 'i2.jpg', at: 3.3 }, { src: 'i3.jpg', at: 3.75 }] },
    { type: 'photo', transition: 'dip-color', say: 'c' },
  ];
  const placed = [{ from: 0, frames: 120 }, { from: 120, frames: 120 }];
  const ins = P.previewMoments(scenes, placed).filter((m) => m.ins !== undefined);
  // i1: 36 (temiz); i2: 99. karede kesilir, +0,7 sn = 120 → 109'a kısılır (ara plan 99'dan beri ekranda; eskiden hiç
  // görülmüyordu); i3: 113. karede başlar, temiz aralık 109'da biter — yalnızca yazının sönmesinde ve dip-color'da görünür.
  assert.deepEqual(ins.map((m) => [m.ins, m.frame]), [[0, 36], [1, 109]]);
});

test('pencereler motorun kendisinden: geçiş kataloğu, çift geçiş kuralı, silme, yazının sönmesi, flaş ve başlangıç efektleri', async () => {
  const { TRANSITION_CATALOG } = await import('../docu-engine/src/effects/catalog.ts');
  assert.ok(P.TRANSITION_WINDOW && P.SCENE_COVER, 'kapı motorun geçiş ve örtü pencerelerini bilir');
  assert.deepEqual(Object.keys(P.TRANSITION_WINDOW).sort(), Object.keys(TRANSITION_CATALOG).sort());
  for (const [k, info] of Object.entries(TRANSITION_CATALOG)) assert.deepEqual(P.TRANSITION_WINDOW[k], info.frames, k);
  const dump = JSON.parse(read('../docu-engine/effects-catalog.json'));
  for (const t of dump.transitions) assert.deepEqual(P.TRANSITION_WINDOW[t.id], t.frames, `effects-catalog.json ${t.id}`);
  // Çift geçiş = kesmeden önce de çizen tür (transitions.tsx PAIR_KINDS); tek taraflının girişi fx.tsx TRANSITION_FRAMES.
  const tr = read('../docu-engine/src/effects/transitions.tsx');
  const pair = tr.match(/export const PAIR_KINDS = new Set<TransitionKind>\(\[([^\]]+)\]\)/)[1].match(/'[^']+'/g).map((x) => x.slice(1, -1)).sort();
  assert.deepEqual(Object.keys(P.TRANSITION_WINDOW).filter((k) => P.TRANSITION_WINDOW[k][0] > 0).sort(), pair);
  assert.ok(tr.includes('return [Math.max(2, Math.min(a, Math.floor(prevFrames / 3))), Math.max(2, Math.min(b, Math.floor(curFrames / 3)))];'), 'pairFrames');
  const fx = read('../docu-engine/src/fx.tsx');
  const block = fx.slice(fx.indexOf('export const TRANSITION_FRAMES'), fx.indexOf('};', fx.indexOf('export const TRANSITION_FRAMES')));
  for (const [k, [, b]] of Object.entries(P.TRANSITION_WINDOW)) assert.match(block, new RegExp(`\\n\\s*'?${k}'?: ${b},`), `TRANSITION_FRAMES ${k}`);
  const engine = read('../docu-engine/src/Engine.tsx');
  assert.ok(engine.includes('<Sequence key={`tw${i}`} from={p.from - a} durationInFrames={a + b}>'), 'çift geçiş penceresi kesmenin önünde a, ardında b kare');
  assert.ok(read('../docu-engine/src/timeline.js').includes('if (scenes[i].transition) plan.push({ fixed: scenes[i].transition });'), 'yazılmış geçiş aynen kullanılır');
  const motifs = read('../docu-engine/src/topic/motifs.tsx');
  assert.ok(motifs.includes(`export const WIPE_IN = ${P.SCENE_COVER.wipeIn};`) && motifs.includes(`export const WIPE_OUT = ${P.SCENE_COVER.wipeOut};`));
  // Yazı, alt yazı ve ikon sahnenin sonunda söner: en uzunu 10 kare.
  assert.ok(read('../docu-engine/src/looks/text.tsx').includes('interpolate(f, [durFrames - 10, durFrames - 1], [1, 0], clamp)'));
  assert.ok(read('../docu-engine/src/topic/caption.tsx').includes('interpolate(f, [durFrames - 8, durFrames], [1, 0], clamp)'));
  assert.ok(read('../docu-engine/src/topic/icons.tsx').includes('interpolate(f, [durFrames - 9, durFrames - 1], [1, 0], clamp)'));
  assert.equal(P.SCENE_COVER.exitFade, 10);
  const ov = read('../docu-engine/src/effects/overlays.tsx');
  assert.equal(ov.match(/const o = \[([^\]]+)\]\[d\] \?\? 0;/)[1].split(',').length, P.SCENE_COVER.flash, 'FlashFx: vuruştan 4 kare');
  assert.ok(ov.includes('const len = Math.round(1.1 * fps);') && P.SCENE_COVER.startFx['film-burn'] === Math.round(1.1 * 30), 'BurnFx 1,1 sn');
  assert.ok(read('../docu-engine/src/effects/index.tsx').includes('Math.pow(Math.max(0, 1 - f / 12), 1.4)') && P.SCENE_COVER.startFx['zoom-blur'] === 12, 'zoom-blur 12 kare');
});

// MÜZİK GEÇİŞLERİ PÜRÜZSÜZ, OLAY SESLERİ YALNIZ GERÇEKTEN OLANA.
//
// Kullanıcı (27 Ekim 2026): "Ciddi konularda saçma hiçbir şey çalmasın, müzik duyguyu hissettirsin, ses mükemmel olsun."
// ÖLÇÜLEN KUSURLAR (27 Ekim 2026, müzik/ses denetimi):
//   - Geçişlerde 4-8 dB basamak: Çernobil (20261026-24122a) 3:41.9 Survival Mode -> Highway Nocturne -13,4 -> -22 LUFS
//     (2 sn delik), 8:35.1 -> Last Sunrise -16,3 -> -11,8 (finalin en yüksek anı); 2,5 sn doğrusal çapraz geçiş.
//   - Sessiz kayıtlar +14 dB'e kadar yükseltiliyordu (Sad Trio -36,4 LUFS: Black Buck, Bakker, Kartal Yuvası).
//   - Filmin sonu iki kez kısılıyordu (renderScore 2,5 sn + zarf 2,5 sn = yarı yolda -12 dB).
//   - Olay sesi olmayan olaya: Çernobil'in 5 patlamasından 4'ü ("ten days after the explosion", "said nothing about
//     the explosion", "meant a steam explosion", "had feared never came"); denizaltı 373aaf "warheads do not detonate";
//     Black Buck cd55b5 "bomb should hit"; Lula 29db03 oy grafiğinin altında patlama ve siren.
//   - Titanik (20260930-24969b) "çığlık atan kalabalık" yatağı "deniz cam gibi dümdüzdü" sahnelerinde çaldı.
// Kurallar: docu-engine/lib/audio-director.mjs (cueGainDb, musicTooQuiet, seamOffsetDb/seamOffsetAt/seamVolume,
// energyDip, scoreBus, clauseBlock, planEvents, planAmbience). Ücretli API yok; ffmpeg yalnız iki kısa sentetik
// render için (ffmpeg-static); gerçek kütüphane ve işler yalnız okunur, yoksa ilgili test atlanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };

const FF = createRequire(import.meta.url)('ffmpeg-static');
const AD = await import('../docu-engine/lib/audio-director.mjs');
const { cueGainDb, musicTooQuiet, seamOffsetDb, seamOffsetAt, seamVolume, energyDip, scoreBus, clauseBlock, planEvents, planAmbience, renderScore, loadLibrary, PRESENCE_DIP, SCORE_FADE_OUT, _internals } = AD;

const LIB = 'D:/Nova Studyo/data/audio-library';
const JOBS = 'D:/Nova Studyo/data/jobs';
const hasLib = fs.existsSync(`${LIB}/library.json`);
const propsOf = (id) => {
  const f = `${JOBS}/${id}/docu/${id}.props.json`;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')).script;
  } catch {
    return null;
  }
};

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gecis-efekt-'));
process.on('exit', () => fs.rmSync(ROOT, { recursive: true, force: true }));

/* ================================================================ seviye kuralları (saf) */

test('kazanç: yükseltme en çok +8 dB, tepe sınırı korunur, kısma serbest', () => {
  assert.equal(_internals.GAIN_UP_MAX, 8);
  // Sad Trio (-36,4 LUFS, tepe -17,1): eskiden +14'e dayanıyordu, şimdi +8.
  assert.equal(cueGainDb(-36.4, -17.1, 0), 8);
  // Somnia (-26,1): +10,1 gerekirdi.
  assert.equal(cueGainDb(-26.1, -12, 0), 8);
  assert.ok(Math.abs(cueGainDb(-20, -6, -3) - 1) < 1e-9, 'normal parça: -16 hedefi + duygu kazancı');
  assert.ok(Math.abs(cueGainDb(-22, -10, 1) - 7) < 1e-9);
  assert.equal(cueGainDb(-24, -2, 0), 3, 'örnek tepesi +1 dBFS üstüne çıkmaz');
  assert.ok(Math.abs(cueGainDb(-5, -0.5, 0) - -11) < 1e-9, 'yüksek parça kısılır');
  assert.equal(cueGainDb(-60, -40, 0), 8, 'çok sessiz bölüm de +8 ile sınırlı');
  assert.equal(cueGainDb(null, null, 0), 0, 'ölçüm yoksa dokunma');
});

test('çok sessiz kayıt (lufs < -30) normalize işareti yoksa kullanılmaz', () => {
  assert.equal(_internals.QUIET_LUFS, -30);
  assert.equal(musicTooQuiet({ lufs: -36.4 }), true);
  assert.equal(musicTooQuiet({ lufs: -36.4, normalised: true }), false);
  assert.equal(musicTooQuiet({ lufs: -36.4, tags: { normalized: true } }), false);
  assert.equal(musicTooQuiet({ lufs: -29.9 }), false);
  assert.equal(musicTooQuiet({ lufs: null }), false, 'ölçülmemiş parça burada dışlanmaz');
  assert.equal(musicTooQuiet(null), false);
});

test('gerçek kütüphane: yalnız Sad Trio çok sessiz', { skip: !hasLib && 'kütüphane yok' }, () => {
  const lib = JSON.parse(fs.readFileSync(`${LIB}/library.json`, 'utf8'));
  assert.deepEqual(lib.music.filter(musicTooQuiet).map((t) => t.title), ['Sad Trio']);
});

test('çapraz geçiş 1,5 sn eşit güç; filmin TEK son kısması 3,5 sn qsin; sabit varlık çukuru', () => {
  assert.equal(_internals.XFADE, 1.5);
  assert.equal(_internals.FADE_OUT, 3.5);
  assert.equal(SCORE_FADE_OUT, 3.5);
  assert.equal(PRESENCE_DIP, 'equalizer=f=2500:t=q:w=1.2:g=-3');
  const bus = scoreBus(100);
  assert.equal(bus.match(/afade=t=out/g)?.length, 1, 'otobüste tek kısma');
  assert.match(bus, /afade=t=out:st=96\.500:d=3\.500:curve=qsin/);
  assert.ok(bus.indexOf(PRESENCE_DIP) === 0 && bus.indexOf(PRESENCE_DIP) < bus.indexOf('alimiter'), 'çukur sınırlayıcıdan önce');
  assert.match(scoreBus(2), /afade=t=out:st=0\.000:d=2\.000:curve=qsin/, 'kısa puan: kısma boyu süreyi geçmez');
  // renderScore'un kendi grafiğinde başka son kısma yok: otobüs scoreBus'tan gelir.
  const src = fs.readFileSync(new URL('../docu-engine/lib/audio-director.mjs', import.meta.url), 'utf8');
  const body = src.match(/export function renderScore[\s\S]*?\n}\n/)[0];
  assert.ok(body.includes('scoreBus(T)'), 'renderScore otobüsü scoreBus ile kurar');
  assert.ok(!/T - FADE_OUT/.test(body), 'renderScore içinde ikinci bir son kısma yok');
  assert.ok(!/curve=(?!qsin)/.test(body), 'her geçiş qsin (eşit güç)');
});

/* ================================================================ geçiş eşleme (saf) */

test('geçiş basamağı: gelen parça giden kuyruğun ±2 LU yakınında başlar', () => {
  assert.equal(_internals.SEAM_TOL, 2);
  assert.ok(_internals.SEAM_RAMP >= 6 && _internals.SEAM_RAMP <= 8, 'rampa 6-8 sn');
  assert.equal(_internals.SEAM_MEASURE, 4);
  // Çernobil'in ölçülen üç geçişi
  assert.ok(Math.abs(seamOffsetDb(-13.4, -22) - 6.6) < 1e-9, '3:41.9 delik: +6,6 dB ile başla');
  assert.ok(Math.abs(seamOffsetDb(-16.3, -11.8) - -2.5) < 1e-9, '8:35.1 sıçrama: -2,5 dB ile başla');
  assert.ok(Math.abs(seamOffsetDb(-10.1, -18.5) - 6.4) < 1e-9, '11:16.6');
  assert.equal(seamOffsetDb(-16, -17.5), 0, 'zaten yakın: dokunma');
  assert.equal(seamOffsetDb(-16, -14.01), 0);
  assert.equal(seamOffsetDb(-10, -30), 10, 'en çok 10 dB');
  assert.equal(seamOffsetDb(null, -16), 0);
  for (const [tail, head] of [[-13.4, -22], [-16.3, -11.8], [-20, -12], [-15, -24]]) {
    const o = seamOffsetDb(tail, head);
    assert.ok(Math.abs(head + o - tail) <= 2 + 1e-9, `${tail}/${head}: ${head + o}`);
  }
});

test('geçiş rampası: sınırda tam fark, 6-8 sn içinde kosinüsle kendi kazancına', () => {
  const off = 6.6;
  assert.equal(seamOffsetAt(off, 0, 0.75, 7), off, 'giriş geçişi boyunca tam');
  assert.equal(seamOffsetAt(off, 0.75, 0.75, 7), off);
  assert.ok(Math.abs(seamOffsetAt(off, 0.75 + 3.5, 0.75, 7) - off / 2) < 1e-9, 'yarıda yarısı');
  assert.ok(Math.abs(seamOffsetAt(off, 7.75, 0.75, 7)) < 1e-9, 'rampa sonunda 0');
  assert.equal(seamOffsetAt(off, 30, 0.75, 7), 0);
  let prev = Infinity;
  for (let t = 0; t <= 9; t += 0.25) {
    const v = seamOffsetAt(off, t, 0.75, 7);
    assert.ok(v <= prev + 1e-12, 'tekdüze iner');
    prev = v;
  }
  // ffmpeg ifadesi aynı eğriyi verir (doğrusal çarpan).
  const vol = seamVolume(-4.2, off, 0.75, 7);
  assert.match(vol, /^volume='.*':eval=frame$/);
  const expr = vol.match(/^volume='(.*)':eval=frame$/)[1];
  const js = new Function('t', `const pow = Math.pow, cos = Math.cos, min = Math.min, max = Math.max, PI = Math.PI; return ${expr};`);
  for (const t of [0, 0.75, 2, 4.25, 7.75, 12]) {
    const want = Math.pow(10, (-4.2 + seamOffsetAt(off, t, 0.75, 7)) / 20);
    assert.ok(Math.abs(js(t) - want) < 1e-3 * want, `t=${t}: ${js(t)} vs ${want}`);
  }
});

test('giden parçanın nefesi: ±1,5 sn içindeki en yakın enerji çukuru, yoksa null', () => {
  // saniye başına dB (0 = en yüksek); 19. saniye 9 dB çukur
  const E = Array.from({ length: 40 }, (_, s) => (s === 19 ? -9 : s === 20 ? -3 : 0));
  assert.equal(energyDip(E, 20.75), 19.5, 'çukur 1,25 sn önce');
  assert.equal(energyDip(E, 19.5), 19.5);
  assert.equal(energyDip(E, 22.5), null, '3 sn uzak: yok');
  assert.equal(energyDip(E, 20.75, { lo: -0.5, hi: 1.5 }), null, 'izin verilen aralığın dışında');
  assert.equal(energyDip(Array(40).fill(0), 20), null, 'düz eğri: yok');
  assert.equal(energyDip(Array.from({ length: 40 }, (_, s) => (s === 20 ? -2 : 0)), 20.5), null, '2 dB sığ: yok');
  // eşit uzaklıkta iki çukur: derin olan
  const two = Array.from({ length: 40 }, (_, s) => (s === 18 ? -5 : s === 22 ? -12 : 0));
  assert.equal(energyDip(two, 20.5, { lo: -2.5, hi: 2.5 }), 22.5);
  assert.equal(energyDip(null, 3), null);
});

/* ================================================================ render (iki kısa sentetik dosya) */

function ff(args) {
  const r = spawnSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}
function synth(rel, expr, dur) {
  const out = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  ff(['-f', 'lavfi', '-i', `aevalsrc=exprs=${expr}:s=22050:d=${dur}`, '-ac', '1', '-c:a', 'pcm_s16le', out]);
  return rel;
}
function pcm(file) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { encoding: 'buffer', maxBuffer: 1 << 28, windowsHide: true });
  return new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 1);
}
const rmsDb = (x, a, b) => {
  const i0 = Math.max(0, Math.floor(a * 8000));
  const i1 = Math.min(x.length, Math.floor(b * 8000));
  let e = 0;
  for (let i = i0; i < i1; i++) e += (x[i] / 32768) ** 2;
  return 10 * Math.log10(1e-12 + e / Math.max(1, i1 - i0));
};
const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];
const tags = { description: 'test', instruments: ['strings'], vocals: 'none', energy: 3, tempo: 'medium', culture: 'western orchestral',
  moodFit: Object.fromEntries(MOODS.map((m) => [m, 0.6])), documentaryUsable: true, bestUse: '', register: 'dramatic', seriousness: 0.9, gameLike: false };
const renderLib = () => {
  const dir = path.join(ROOT, 'render');
  if (fs.existsSync(path.join(dir, 'library.json'))) return dir;
  fs.mkdirSync(dir, { recursive: true });
  const mk = (rel, expr, dur) => {
    synth(path.join('render', rel), expr, dur);
    return rel;
  };
  const music = [
    // düz, kararlı giden parça
    { id: 'flat', file: mk('music/flat.wav', '0.3*sin(2*PI*220*t)', 40), duration: 40, energy: Array(40).fill(0) },
    // gelen parça: ilk 16 sn alçak (0.25), sonra yüksek (0.8) — ipucu ikisini de kapsar, başı ~7 dB düşük girer
    { id: 'rise', file: mk('music/rise.wav', 'if(lt(t\\,16)\\,0.25\\,0.8)*sin(2*PI*330*t)', 60), duration: 60, energy: Array.from({ length: 60 }, (_, s) => (s < 16 ? -10 : 0)) },
    // aynı düz parça, 19. saniyesinde kütüphane eğrisine göre bir nefes
    { id: 'breath', file: mk('music/breath.wav', '0.3*sin(2*PI*247*t)', 40), duration: 40, energy: Array.from({ length: 40 }, (_, s) => (s === 19 ? -9 : 0)) },
    { id: 'flat2', file: mk('music/flat2.wav', '0.3*sin(2*PI*262*t)', 60), duration: 60, energy: Array(60).fill(0) },
  ].map((m) => ({ ...m, title: `Parça ${m.id}`, artist: 'Test', license: 'test', lufs: null, tags }));
  fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify({ version: 1, music, sfx: [] }));
  return dir;
};

test('render: düşük giren parça giden kuyruğa eşlenir, sonra 7 sn içinde kendi seviyesine iner', () => {
  const root = renderLib();
  const lib = loadLibrary(root);
  const plan = { cues: [
    { fromSec: 0, toSec: 20, mood: 'tension', trackId: 'flat', startAt: 0, gainDb: 0 },
    { fromSec: 20, toSec: 40, mood: 'tension', trackId: 'rise', startAt: 5, gainDb: 0 },
  ] };
  const logs = [];
  const r = renderScore({ plan, lib, root, outFile: path.join(root, 'out', 'seam.wav'), ff: FF, totalSec: 40, log: (m) => logs.push(m) });
  const seam = r.cues[1];
  assert.ok(seam.seamDb >= 3.5 && seam.seamDb <= 8, `başlangıç farkı ${seam.seamDb} (${logs.join(' | ')})`);
  assert.ok(logs.some((m) => /geçişi .* LU basamaktı; gelen \+/.test(m)), logs.join(' | '));
  assert.equal(r.cues[0].seamDb, undefined, 'ilk ipucunda geçiş yok');
  const x = pcm(r.file);
  const tail = rmsDb(x, 16, 19);
  const head = rmsDb(x, 20.8, 21.8);
  assert.ok(Math.abs(head - tail) <= 3, `sınırda basamak ${(head - tail).toFixed(1)} dB (eşlemesiz ~-7)`);
  // rampa (sınır + 7 sn = 27 sn) bitince gelen parça kendi kazancında: hâlâ alçak bölümünde (video 31 sn'ye kadar)
  const after = rmsDb(x, 28, 30.5);
  assert.ok(after < head - 3.5, `rampa sonrası kendi seviyesi: ${after.toFixed(1)} vs baş ${head.toFixed(1)}`);
  assert.ok(rmsDb(x, 33, 36) > after + 6, 'yüksek bölümü kendi seviyesinde (eşleme yalnız sınırda)');
});

test('render: giden parçanın sönüşü kendi nefesine kayar; gelen parça eşit güç için onunla birlikte öne alınır', () => {
  const root = renderLib();
  const lib = loadLibrary(root);
  const plan = { cues: [
    { fromSec: 0, toSec: 20, mood: 'calm', trackId: 'breath', startAt: 0, gainDb: 0 },
    { fromSec: 20, toSec: 40, mood: 'calm', trackId: 'flat2', startAt: 10, gainDb: 0 },
  ] };
  const logs = [];
  const r = renderScore({ plan, lib, root, outFile: path.join(root, 'out', 'dip.wav'), ff: FF, totalSec: 40, log: (m) => logs.push(m) });
  const msg = logs.find((m) => /kendi nefesine kaydı/.test(m));
  assert.ok(msg && /\(-1\.25 sn\)/.test(msg), `sönüş 20,75'ten 19,5'e: ${logs.join(' | ')}`);
  // aynı saat: gelen parçanın sınırdaki anı değişmedi
  assert.ok(Math.abs(r.cues[1].startAt - 10) < 0.01, `giriş noktası ${r.cues[1].startAt}`);
  const x = pcm(r.file);
  // delik yok: geçiş boyunca seviye ~3 dB'den fazla düşmez (eşit güç)
  const level = rmsDb(x, 15, 17);
  for (let t = 17.5; t < 21; t += 0.25) assert.ok(rmsDb(x, t, t + 0.25) > level - 4, `${t} sn: ${rmsDb(x, t, t + 0.25).toFixed(1)} vs ${level.toFixed(1)}`);
});

/* ================================================================ olay sesleri */

/* Gerçek kütüphanenin olay girdileri (anahtar sözcükler aynen); dosyalar sahte, measure:false ses okumaz. */
const evRoot = path.join(ROOT, 'events');
fs.mkdirSync(path.join(evRoot, 'sfx'), { recursive: true });
const ev = (id, o) => {
  fs.writeFileSync(path.join(evRoot, 'sfx', `${id}.wav`), 'x');
  return { sourceId: `test:${id}`, file: `sfx/${id}.wav`, title: id, slug: id, role: 'one_shot', kind: 'event', literal_only: true, era: 'any',
    genres: ['epic', 'documentary', 'crime', 'science'], moods: ['tension', 'dread', 'reveal'], scene_types: 'any', max_per_video: 4, min_gap_sec: 30, gain_db: -12, duration: 3, lufs: -20, lufsMax: -12, ...o };
};
const bedOf = (id, keywords, o = {}) => {
  fs.writeFileSync(path.join(evRoot, 'sfx', `${id}.wav`), 'x');
  return { sourceId: `gen:${id}`, file: `sfx/${id}.wav`, kind: 'bed', role: 'ambience', intensity: 2, keywords, genres: 'any', moods: 'any', scene_types: 'any', era: 'any', gain_db: -26, duration: 12, lufs: -30, max_per_video: 6, ...o };
};
fs.writeFileSync(path.join(evRoot, 'library.json'), JSON.stringify({ version: 1, music: [], sfx: [
  ev('event-explosion-distant-1690', { intensity: 4, keywords: ['explosion', 'patlama', 'exploded', 'patladı', 'blast', 'infilak', 'bomb', 'bomba', 'shelling', 'bombardıman', 'dynamite', 'dinamit', 'charges', 'lağım', 'far off', 'uzaktan'] }),
  ev('event-explosion-massive-close-2777', { intensity: 5, max_per_video: 2, min_gap_sec: 90, keywords: ['massive explosion', 'büyük patlama', 'blew up', 'havaya uçtu', 'detonation', 'infilak', 'explosion', 'patlama'] }),
  ev('event-police-siren-1641', { intensity: 3, era: 'modern', genres: ['crime', 'documentary'], max_per_video: 2, min_gap_sec: 90, keywords: ['police', 'polis', 'siren', 'police arrived', 'police car', 'patrol', 'emergency', 'crime scene'] }),
  ev('event-gunshot-single-1682', { intensity: 4, era: 'industrial', genres: ['crime', 'documentary', 'horror'], max_per_video: 3, keywords: ['gunshot', 'silah sesi', 'shot', 'ateş etti', 'shot dead', 'vurularak', 'fired', 'vurdu', 'pistol', 'tabanca', 'revolver', 'rövolver', 'bullet', 'kurşun'] }),
  ev('event-audience-applause-476', { intensity: 2, genres: ['documentary', 'science'], moods: ['curious', 'reveal', 'triumph'], keywords: ['applause', 'alkış', 'applauded', 'audience', 'standing ovation'] }),
  // yataklar: adı olmayan üretilmiş yataklar (anahtar sözcükleri yazarın metninden)
  bedOf('gen-bed-618b8601fb', ['crowd', 'screaming', 'away', 'across', 'calm', 'water', 'night']),
  bedOf('gen-bed-5799b7883d', ['dead', 'calm', 'ocean', 'night', 'wind', 'engine']),
  bedOf('gen-bed-b31f99f00c', ['empty', 'square', 'night', 'siren', 'wind']),
  bedOf('gen-bed-a6b0dfc6bf', ['empty', 'plaza', 'dusk', 'traffic', 'wind']),
] }));
const evLib = loadLibrary(evRoot);
const sc = (o) => ({ type: 'photo', dur: 6, mood: 'tension', chapter: 0, say: 'A line.', ...o });
const events = (scenes, genre = 'epic', id = 'ev') => planEvents({ script: { id, genre, locale: 'en-US', scenes }, lib: evLib, root: evRoot, genre, seed: 's', measure: false });
const one = (o, genre) => events([sc(o)], genre);
const fileOf = (c) => path.basename(c.file);

test('Çernobil: olmayan dört patlama sessiz, gerçek olanı ("The blast threw...") çalar', () => {
  assert.deepEqual(one({ type: 'map', mood: 'reveal', say: 'Chernobyl, northern Ukraine, May 1986, ten days after the explosion.' }), [], '1:01.7 ten days after');
  assert.deepEqual(one({ type: 'words', say: '[serious] Until 21:02 on 28 April, Moscow television said nothing about the explosion at all.', sound: 'quiet Soviet apartment, faint television hum, clock ticking' }), [], '2:51.6 said nothing about');
  assert.deepEqual(one({ type: 'explainer', mood: 'dread', say: 'Twenty million litres meeting molten fuel meant a steam explosion under an already broken reactor.' }), [], '5:35.7 meant (korkulan sonuç)');
  assert.deepEqual(one({ say: 'The steam explosion the commission had feared never came.', sound: 'wind over empty rooftops, distant crows' }), [], '10:00.9 had feared never came');
  const real = one({ say: "The blast threw about a quarter of the reactor's graphite out into the night.", sound: 'distant wind over a ruined industrial site, faint crackle of fire' });
  assert.equal(real.length, 1, '1:47.1 gerçek patlama');
  assert.match(fileOf(real[0]), /event-explosion/);
});

test('denizaltı, Black Buck, Lula: olumsuz, varsayım ve grafik satırı olay almaz', () => {
  assert.deepEqual(one({ mood: 'reveal', say: 'The popular fear was a nuclear blast, but warheads do not detonate in a collision.', sound: 'deep underwater hum, faint creak of steel' }), [], '373aaf 11:15.4');
  assert.deepEqual(one({ type: 'explainer', say: 'Dropped at an angle, at least one bomb should hit the strip.', sound: 'wind rushing past an open bomb bay, engine roar' }), [], 'cd55b5 1:07.7');
  assert.deepEqual(one({ type: 'bars', mood: 'reveal', say: 'In the runoff, Lula took it, 50.39 to 49.61.', sound: 'night square, cheering crowd, firecrackers far off' }, 'documentary'), [], '29db03 6:17.8 oy sonucu');
  assert.deepEqual(one({ type: 'icons', mood: 'reveal', say: 'Historic, then, does not mean comfortable: about 48 of every 100 valid votes went the other way.', sound: 'city at night, wet tires on asphalt, distant siren' }, 'documentary'), [], '29db03 9:47.4 oy payı');
  assert.deepEqual(one({ type: 'bars', mood: 'curious', say: '[curious] Between 4 October and 25 October, Lula went from about 53.8 million votes to about 64.2 million.', sound: 'large hall murmur, distant applause' }, 'documentary'), [], 'sayı grafiğinde alkış yok');
  // fotoğraf sahnesi ama satır bir sayı okuyor: yalnız ses metninde anlatılan siren gelmez
  assert.deepEqual(one({ mood: 'reveal', say: 'Lula took 50.39 percent of the valid votes.', sound: 'city at night, distant siren' }, 'documentary'), []);
  // "firecrackers" bir 'fire' fiili değildir
  assert.equal(_internals.verbForm('firecrackers', 'fire'), false);
  assert.equal(_internals.verbForm('fireworks', 'fire'), false);
  assert.equal(_internals.verbForm('fired', 'fire'), true);
  assert.equal(_internals.verbForm('slammed', 'slam'), true);
  assert.equal(_internals.verbForm('exploded', 'explod'), true);
  assert.equal(_internals.verbForm('patladi', 'patla'), true, 'Türkçe kök ekleriyle');
});

test('olumsuzluk -4..+5, varsayım/korku/aktarma, önceki olay (past perfect), "after/since the X" atfı', () => {
  const none = (say, extra = {}) => assert.deepEqual(one({ say, ...extra }, 'crime'), [], say);
  const fires = (say, extra = {}) => assert.equal(one({ say, ...extra }, 'crime').length, 1, say);
  none('The bomb never exploded.');
  none("The bomb didn't explode.");
  none("The bomb didn't explode.", { wordTimes: [{ word: 'The', t: 0.1 }, { word: 'bomb', t: 0.4 }, { word: "didn't", t: 0.8 }, { word: 'explode.', t: 1.2 }] });
  none('No siren sounded that night.');
  none('There was no explosion.');
  none('The bomb may explode at any moment.');
  none('Engineers warned of an explosion.');
  none('If the charges went off, the dam would fail.');
  none('Police said a siren had sounded.');
  none('According to the report, an explosion followed.');
  none('Two years earlier, an explosion had destroyed the plant.');
  none('Since the explosion, the town has been empty.');
  none('Nobody heard an explosion.');
  none('Whether there was an explosion is still disputed.');
  none('Engineers issued a warning of an explosion.');
  none('[softly] Through all of it, no one has shown a shot fired at a cable.', { type: 'words' });
  // gerçekten olanlar
  fires('Then the bomb exploded.');
  fires('On 6 May the bomb exploded over the square.');
  fires('In May the explosion tore the roof off.');
  fires('A siren began to wail across the city.');
  fires('They could hear the sirens.');
  fires('The explosion at reactor No. 4 shook the town.');
  fires('One officer fired warning shots with his pistol at men rushing a boat.');
  // başka cümledeki olumsuzluk bu cümleyi bağlamaz
  fires('It was not over. Then the blast came.');
});

test('clauseBlock: neden döner; cümle sınırını aşmaz', () => {
  const toks = (s) => _internals.sayTokens(s);
  const at = (s, w) => {
    const { toks: t, sent } = toks(s);
    const j = t.indexOf(w);
    return clauseBlock(t, j, j, sent);
  };
  assert.equal(at('Moscow television said nothing about the explosion at all.', 'explosion'), 'never');
  assert.equal(at('The steam explosion the commission had feared never came.', 'explosion'), 'never');
  assert.equal(at('Ten days after the explosion.', 'explosion'), 'reference');
  assert.equal(at('Warheads do not detonate in a collision.', 'detonate'), 'negated');
  assert.equal(at('At least one bomb should hit the strip.', 'bomb'), 'hypothetical');
  assert.equal(at('Witnesses reported an explosion.', 'explosion'), 'reported');
  assert.equal(at('An explosion had destroyed it.', 'explosion'), 'backstory');
  assert.equal(at('They had to run from the explosion.', 'explosion'), null, '"had to" geçmiş zaman değildir');
  assert.equal(at('It was not over. Then the explosion came.', 'explosion'), null);
  assert.equal(at('The blast threw about a quarter of the graphite out.', 'blast'), null);
});

test('yas satırına (GRIEF) gerçek bir çarpma sesi konmaz; NOT_GRIEF satırı yas sayılmaz', () => {
  assert.deepEqual(one({ say: 'Thirty deaths followed the blast.' }), [], 'deaths');
  assert.deepEqual(one({ say: 'The blast left a death toll of thirty.' }), []);
  assert.deepEqual(one({ say: 'The blast tore through the hall. Twelve victims were never found.' }), [], 'aynı sahnede yas cümlesi');
  assert.deepEqual(one({ say: 'Then the blast tore through the hall.', grief: true }), [], 'scene.grief işareti');
  // vurulan bir insan: silah sesi yok (D.B. Cooper 08f5fc sahne 138)
  assert.deepEqual(one({ type: 'words', say: 'The agent who fired: When I shot McCoy... I shot D.B. Cooper.' }, 'crime'), []);
  assert.deepEqual(one({ say: 'He shot him twice in the hallway.' }, 'crime'), []);
  assert.equal(one({ say: 'At the helm: Harold Lowe, the officer who fired his pistol.' }, 'crime').length, 1, 'tabancasını ateşleyen: bir insan vurulmadı');
  assert.equal(one({ say: 'No one was hurt when the blast tore through the hall.' }).length, 1, 'kimse ölmedi: yas değil, patlama gerçek');
  // yas satırından sonraki sahnenin sesi o satıra geri sızmaz (pre-lap yok)
  const after = events([sc({ say: 'He died that night.', dur: 4 }), sc({ say: 'Sirens rose over the city.', wordTimes: [{ word: 'Sirens', t: 0.05 }, { word: 'rose', t: 0.5 }] })], 'crime');
  assert.equal(after.length, 1);
  assert.ok(after[0].at >= 0 && !after[0].prelap, `ölüm satırına geri sızmaz (${after[0].at})`);
});

test('ortam: olay olan yatak (çığlık, siren) yalnız o ses adıyla geçtiğinde; "no sirens" o yatağı getirmez', () => {
  const beds = (sound, say = 'A line.') => planAmbience({ script: { id: 'amb', genre: 'documentary', locale: 'en-US', scenes: [sc({ sound, say, mood: 'calm' }), sc({ sound, say, mood: 'calm' })] }, lib: evLib, root: evRoot, genre: 'documentary', seed: 'a', measure: false }).map(fileOf);
  // Titanik 54-56: "dead calm ocean at night" — eskiden 'calm' + 'night' ile çığlık yatağı
  const calm = beds('dead calm ocean at night, faint wind, distant engine hum', 'There was no moon that night. The sea was flat as glass.');
  assert.ok(!calm.includes('gen-bed-618b8601fb.wav'), `sakin denize çığlık yok: ${calm}`);
  assert.deepEqual(calm, ['gen-bed-5799b7883d.wav']);
  // Titanik 138: yazar çığlığı adıyla istedi
  assert.deepEqual(beds('crowd screaming far away across calm water at night', 'Over fifteen hundred people thrashed in the black water.'), ['gen-bed-618b8601fb.wav']);
  // Fransa 12: siren adı yok, trafik var
  assert.ok(!beds('empty square at night, distant traffic, wind').includes('gen-bed-b31f99f00c.wav'));
  // siren adıyla: evet; "no sirens": hayır
  assert.deepEqual(beds('empty square at night, distant siren, wind'), ['gen-bed-b31f99f00c.wav']);
  assert.ok(!beds('empty square at night, no sirens, wind').includes('gen-bed-b31f99f00c.wav'));
  // yalnız anlatımdan: olumsuz ve yas satırı siren yatağı getirmez
  assert.ok(!beds(undefined, 'No siren sounded in the empty square that night.').includes('gen-bed-b31f99f00c.wav'));
  assert.ok(!beds(undefined, 'He died in the empty square at night, a siren far away.').includes('gen-bed-b31f99f00c.wav'));
});

/* ================================================================ gerçek işler (yalnız okunur) */

const REAL = [
  ['20261026-24122a', 'Çernobil', (cues) => assert.deepEqual(cues.map((c) => c.scene), [23], 'yalnız "The blast threw" (sahne 23)')],
  ['20261024-373aaf', 'denizaltı', (cues) => assert.ok(!cues.some((c) => c.scene === 140), '"warheads do not detonate"')],
  ['20261015-cd55b5', 'Black Buck', (cues) => assert.ok(!cues.some((c) => c.scene === 15), '"bomb should hit"')],
  ['20261026-29db03', 'Lula', (cues) => assert.ok(!cues.some((c) => [51, 67, 106].includes(c.scene)), 'oy grafikleri sessiz')],
];
for (const [id, name, check] of REAL) {
  const script = hasLib ? propsOf(id) : null;
  test(`gerçek iş ${name} (${id}): olay sesleri yalnız gerçekten olana`, { skip: !script && 'iş veya kütüphane bu makinede yok' }, () => {
    const lib = loadLibrary(LIB);
    const cues = planEvents({ script, lib, root: LIB, genre: script.genre, seed: script.id, measure: false });
    check(cues);
    for (const c of cues) {
      const s = script.scenes[c.scene];
      assert.ok(!AD.griefScene(s), `yas satırında olay: ${s.say}`);
      assert.ok(!_internals.NO_EVENT_SCENES.has(s.type), `grafikte olay: ${s.type}`);
    }
  });
}

const titanic = hasLib ? propsOf('20260930-24969b') : null;
test('gerçek iş Titanik (20260930-24969b): sakin gece sahnelerinde çığlık yatağı yok', { skip: !titanic && 'iş veya kütüphane bu makinede yok' }, () => {
  const lib = loadLibrary(LIB);
  const cues = planAmbience({ script: titanic, lib, root: LIB, genre: titanic.genre, seed: titanic.id, measure: false });
  const scream = cues.filter((c) => /gen-bed-618b8601fb/.test(c.file));
  for (const c of scream) {
    for (let i = c.fromScene; i <= c.toScene; i++) {
      const s = titanic.scenes[i];
      assert.ok(!s.sound || /scream/i.test(s.sound), `sahne ${i} "${s.sound}" çığlık istemiyor`);
    }
  }
  assert.ok(scream.some((c) => c.fromScene <= 138 && c.toScene >= 138), 'yazarın çığlık istediği yerde çalar');
});

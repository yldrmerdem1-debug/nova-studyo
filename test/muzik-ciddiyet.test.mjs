// CİDDİ KONUDA SAÇMA HİÇBİR ŞEY ÇALMAZ; MÜZİK DUYGUYU TAŞIR.
//
// ÖLÇÜLEN KUSUR (27 Ekim 2026, müzik denetimi — 5 denetçi, 11 video, 233 parça):
//   - Haber/finans hikâyeleri 'open' sayılıyordu; 'open' yalnız oyun müziğini dışarıda tutuyordu. Hormuz mayın
//     haberinde (20261018-8a1eca) hafif synth-pop "Videodrome" (92 sn) ve ana tema bir uyku parçası ("Somnia
//     Variation 1 relax and sleep"); Lula seçiminde (20261026-29db03) başlıktaki "Brazil" yüzünden hafif latin
//     "Pienso Viento" ve "Across Seas And Lands".
//   - Dönem yanlış okunuyordu: "RBMK-1000" = 1000 yılı, "Soviet" = 1965 ("in 1986"yı eziyordu) → Çernobil
//     (20261026-24122a) 1976 sayıldı; "claimed hits" ve "al-Nazili" = Hitler/Nazi = 1942 → Kartal Yuvası yangını
//     haberi (20261024-950730) 1942 hikâyesi sayıldı, dönem cazı imza rengi oldu, smooth noir saksafon ANA TEMA.
//   - Geçmiş cezası (0,3/kullanım) uyumu eziyordu: Çernobil'in açılış zirvesine reveal uyumu 0,6 olan Highway
//     Nocturne, 0,9 olan The Challenger'ın önüne geçti. Palet 3 yuvaydı, bir parça 4 kez, aynı pasajı tekrar çaldı.
//   - Ölüm cümleleri gerilim/sürükleyici parçaların altındaydı (Çernobil 9:28 "Borys Baranov died").
// İNCELEME TURU (27 Ekim 2026, 16 gerçek işin yeniden planı + kod incelemesi):
//   - Çok sessiz kayıt (Sad Trio, -36,4 LUFS) planlanıyor, renderScore çalmıyordu: ölüm satırlarında 27-40 sn delik.
//   - Geçmiş script.channel'a (köşe damgasının adı) göre süzülüyordu: kanal adı varken bütün geçmiş yok sayıldı.
//   - "Nobody was hurt" satırlarında yaslı tema (denizaltı); 1066'da synth pad'li tema; 1453'te imparatorun ölümü
//     The Challenger'ın (sad 0,1) altında; Çernobil ve Lula'da tema bir kez ya da hiç duyulmuyordu.
//   - Doğrulanmamış parçalar (Marvel taklidi) 1812'nin açılışında.
// Kurallar: docu-engine/lib/audio-director.mjs (seriousClass, storyGravity, fitsGravity, storyYear, yearsIn,
// styleProfile, culturePrefs, pickSlot/choosePalette/pickTheme, themeSpots, griefScene, müzik geçmişi).
// Ücretli API yok, ffmpeg yok, render yok; gerçek veriler yalnız okunur, yoksa ilgili test atlanır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const A = await import('../docu-engine/lib/audio-director.mjs');
const { planScore, seriousClass, fitsGravity, storyGravity, storyYear, yearsIn, styleProfile, MUSIC_BANNED, VERIFY_LIST, _internals } = A;

const LIB = 'D:/Nova Studyo/data/audio-library';
const JOBS = 'D:/Nova Studyo/data/jobs';
const hasLib = fs.existsSync(`${LIB}/library.json`);
const realLib = hasLib ? JSON.parse(fs.readFileSync(`${LIB}/library.json`, 'utf8')) : null;

/* Sözleşmedeki yedek yas düzeni (tüketiciler kendisi de uygular). */
const GRIEF = /\b(died|dies|dying|killed|kills|dead|deaths?|death toll|funeral|buried|burial|mourn\w*|victims?|perished|executed|suicide|lost (?:his|her|their) li(?:fe|ves)|never (?:came|come) home)\b/i;
const NOT_GRIEF = /\b(no|not|never|nobody|no one|none|without|zero)\b[^.!?]{0,40}\b(killed|died|dead|deaths?|injur\w*|casualt\w*|victims?)\b/i;
const griefLine = (sc) => A.griefScene(sc);
const griefOk = (t) => (t.tags.moodFit?.sad ?? 0) >= 0.5 && (Number(t.tags.energy) || 3) <= 3;
const LOUNGE_OR_JAZZ = /smooth|lounge|laid.?back|groov|\bsax|saxophone|swing|ragtime|big.?band|jazz/i;
const EXOTIC = ['middle-eastern', 'east-asian', 'indian', 'latin', 'americana'];

/* ------------------------------------------------------------ an in-memory library (no audio files needed) */

const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];
const GENRES = ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror'];
const fit = (o, base = 0.1) => Object.fromEntries(MOODS.map((m) => [m, o[m] ?? base]));
const flat = (dur) => Array.from({ length: dur }, () => 0);
function tr(id, { mood = {}, energy = 3, culture = 'western orchestral', instruments = ['strings', 'piano'], register = 'dramatic', seriousness = 0.9, description = 'a sombre orchestral piece', toneNote = 'weighty and restrained', dur = 200, title, artist = 'Test', gameLike = false } = {}) {
  return {
    id, file: `music/${id}.mp3`, title: title ?? `Parça ${id}`, artist, duration: dur, lufs: -16, energy: flat(dur),
    tags: { description, toneNote, bestUse: 'investigation', instruments, vocals: 'none', energy, tempo: 'medium', culture, moodFit: fit(mood), genreFit: Object.fromEntries(GENRES.map((g) => [g, 0.6])), documentaryUsable: true, register, seriousness, gameLike },
  };
}
const scene = (o = {}) => ({ type: 'photo', dur: 10, mood: 'curious', chapter: 0, say: 'The river was quiet that morning.', ...o });

/* ------------------------------------------------------------ library: seriousness class */

test('seriousClass: R1-R11 kuralları — tonsuz/sözlü/oyun/hafif/neşeli asla; ağır+ciddi güvenli; koşullu sınıflar', () => {
  assert.equal(seriousClass({ tags: null }), 'never', 'etiket yok: fail closed');
  assert.equal(seriousClass(tr('a', { register: null })), 'never', 'ton etiketi yok');
  assert.equal(seriousClass(tr('b', { gameLike: true })), 'never');
  assert.equal(seriousClass(tr('c', { register: 'light' })), 'never');
  assert.equal(seriousClass(tr('d', { description: 'a smooth noir saxophone at night' })), 'never', 'Night on the Docks – Sax');
  assert.equal(seriousClass(tr('e', { toneNote: 'playful, quirky strings' })), 'never', 'tonNote da okunur');
  assert.equal(seriousClass(tr('f', { toneNote: 'weighty orchestral tension, no uplifting themes, not upbeat' })), 'safe', 'olumsuz cümle sayılmaz');
  assert.equal(seriousClass(tr('g', { title: 'Game Over' })), 'safe', 'başlık okunmaz');
  assert.equal(seriousClass(tr('h', { culture: 'jazz' })), 'never');
  assert.equal(seriousClass(tr('i', { culture: 'latin' })), 'never');
  assert.equal(seriousClass(tr('j', { register: 'heroic', seriousness: 0.6, mood: { sad: 0.7 } })), 'safe', 'For the Fallen: anma parçası');
  assert.equal(seriousClass(tr('k', { register: 'heroic', seriousness: 0.9, mood: { sad: 0.2 } })), 'never', 'kahramanlık macerası');
  assert.equal(seriousClass(tr('l', { culture: 'middle-eastern' })), 'cond:culture');
  assert.equal(seriousClass(tr('m', { culture: 'americana', instruments: ['acoustic guitar'] })), 'cond:americana');
  assert.equal(seriousClass(tr('n', { energy: 5, description: 'full battle, the final assault' })), 'cond:battle');
  assert.equal(seriousClass(tr('o', { seriousness: 0.6 })), 'cond:ser');
  assert.equal(seriousClass(tr('p', { seriousness: 0.4 })), 'never');
});

test('gerçek kütüphane: ~83 güvenli / 16 koşullu / 134 asla; uyku, ninni, çocuk parçaları hiç yüklenmez', { skip: !hasLib && 'kütüphane yok' }, () => {
  const n = { safe: 0, cond: 0, never: 0 };
  for (const t of realLib.music) n[seriousClass(t).split(':')[0]]++;
  assert.ok(Math.abs(n.safe - 83) <= 3 && Math.abs(n.cond - 16) <= 3 && Math.abs(n.never - 134) <= 4, JSON.stringify(n));
  // The Oct 26 classes, by name.
  const cls = (title) => seriousClass(realLib.music.find((t) => t.title === title));
  for (const title of ['Night on the Docks – Sax', 'Videodrome', 'Pienso Viento', 'Across Seas And Lands', 'Bazaar Ballad', 'Mystic mirage', 'Flicker In The Night']) {
    if (realLib.music.some((t) => t.title === title)) assert.equal(cls(title), 'never', title);
  }
  const L = _internals.prep(realLib, LIB);
  assert.ok(!L.music.some((t) => MUSIC_BANNED.test(`${t.title} ${t.file}`)), 'banned tracks never load');
  assert.ok(!L.music.some((t) => /relax and sleep/i.test(t.title)), 'Somnia … relax and sleep (Hormuz theme) is gone');
  assert.ok(L.music.every((t) => typeof t.serious === 'string'), 'every track carries its class from load');
  assert.equal(_internals.musicPool(L, 'serious', {}).filter((t) => seriousClass(t) !== 'safe').length, 0, 'no context: only safe tracks');
});

/* ------------------------------------------------------------ story: gravity, year, era words */

test('ağırlık: her hikâye en az ciddi; açık yalnız istenince; uzatılmış ağır kelimeler', () => {
  assert.equal(storyGravity({ scenes: [{ say: 'The election was close.' }] }, 'documentary'), 'serious');
  assert.equal(storyGravity({ scenes: [] }, 'finance'), 'grave');
  assert.equal(storyGravity({ musicGravity: 'open', scenes: [] }, 'documentary'), 'open');
  assert.equal(storyGravity({ musicGravity: 'grave', scenes: [] }, 'science'), 'grave');
  const riot = { title: 'Curfew in Paris', scenes: [{ say: 'Riots spread. Police made arrests after a fire and an attack on a station. ' + 'The city waited. '.repeat(40) }] };
  assert.equal(storyGravity(riot, 'documentary'), 'grave');
  // fitsGravity: koşullu parçalar yalnız bağlamları tutunca.
  const oud = tr('oud', { culture: 'middle-eastern' });
  const story = { cultures: new Set(['middle-eastern']), hinted: new Set(), oldWorld: true };
  assert.equal(fitsGravity(oud, 'serious', story), true, '1453: oud');
  assert.equal(fitsGravity(oud, 'serious', { ...story, oldWorld: false }), false, '2026 Iran haberi: oud yok');
  assert.equal(fitsGravity(oud, 'serious', { ...story, format: 'news' }), false, 'haberde egzotik renk asla');
  assert.equal(fitsGravity(oud, 'serious', { ...story, role: 'grief' }), false, 'yas cümlesinde renk yok');
  assert.equal(fitsGravity(oud, 'serious', { ...story, role: 'theme' }), false, 'renk ana tema olmaz');
  const battle = tr('battle', { energy: 5, description: 'full battle, the final assault' });
  assert.equal(fitsGravity(battle, 'grave', { war: true, cue: { energy: 5 } }), true);
  assert.equal(fitsGravity(battle, 'grave', { war: true, cue: { energy: 3 } }), false, 'savaş müziği yalnız savaşın zirvesinde');
  assert.equal(fitsGravity(battle, 'grave', { war: false }), false);
  assert.equal(fitsGravity(tr('ser', { seriousness: 0.6 }), 'serious', {}), false, 'cond:ser yalnız açık hikâyede');
  const guitar = tr('am', { culture: 'americana', instruments: ['acoustic guitar'] });
  assert.equal(fitsGravity(guitar, 'serious', { americana: true, role: 'reflection' }), true);
  assert.equal(fitsGravity(guitar, 'serious', { americana: true, role: 'tension' }), false);
  // Caz çağı: 1929 borsa çöküşünde ağırbaşlı caz, lounge asla.
  const iron = tr('iron', { culture: 'jazz', instruments: ['piano', 'vinyl crackle'], description: 'Dark plodding silent-film piano with crackle — ominous 1920s', register: 'grave', seriousness: 0.7 });
  const lounge = tr('docks', { culture: 'jazz', instruments: ['saxophone'], description: 'Sad smooth noir saxophone', register: 'grave', seriousness: 0.8 });
  assert.equal(fitsGravity(iron, 'grave', { jazzAge: true, year: 1929 }), true);
  assert.equal(fitsGravity(iron, 'grave', { jazzAge: false, year: 1929 }), false);
  assert.equal(fitsGravity(iron, 'grave', { jazzAge: true, year: 1945 }), false, 'çatırtılı plak sesi 1940 sonrası değil');
  assert.equal(fitsGravity(lounge, 'grave', { jazzAge: true, year: 1929 }), false, 'smooth = lounge');
});

test('yıl: model numarası, "hits", "al-Nazili" yıl değil; rakamlı yıl dönem kelimesini yener', () => {
  assert.deepEqual(yearsIn('RBMK-1000'), []);
  assert.deepEqual(yearsIn('The Houthis claimed hits'), []);
  assert.deepEqual(yearsIn('a statement from al-Nazili'), []);
  assert.deepEqual(yearsIn('the Soviet press in 1986'), [1986]);
  assert.deepEqual(yearsIn('a 1000 MW reactor'), []);
  assert.deepEqual(yearsIn('in the mid-1980s'), [1980]);
  assert.deepEqual(yearsIn('the war of 1914–1918'), [1914, 1918]);
  assert.deepEqual(yearsIn('the Nazis came'), [1942]);
  assert.deepEqual(yearsIn('osmanlılar geldi'), [1550], 'Türkçe ekler hâlâ tanınır');
  // storyYear: script.era > haber = bugün > sahne dönemleri (süreyle) > anlatım; başlıktaki rakamlı yıl uyuşmayan damgayı yener.
  const now = new Date().getUTCFullYear();
  assert.equal(storyYear({ era: '1986', format: 'news', scenes: [] }), 1986);
  assert.equal(storyYear({ format: 'news', scenes: [{ say: 'Hitler had it built in 1938.', era: '1938' }] }), now);
  assert.equal(storyYear({ scenes: [{ era: '1986', dur: 30 }, { era: '2026', dur: 10 }, { era: '1000', dur: 2 }] }), 1986);
  assert.equal(storyYear({ title: '1066: The 19 Days', scenes: [{ era: '2026', dur: 50 }, { era: '1066', dur: 30 }] }), 1066);
  assert.equal(storyYear({ scenes: [{ say: 'The reactor, an RBMK-1000, was the Soviet pride in 1986.' }] }), 1986);
});

test('dönem/konu: 1942 ve haberde caz yok; 1929 çöküşünde caz rengi; "crash" yalnız borsa; noir yalnız kendi çağında', () => {
  const wwii = styleProfile({ era: '1942', title: 'The fire at the Eagle\'s Nest', scenes: [{ say: 'Hitler visited it in 1938.' }] }, 'crime');
  assert.ok(!((wwii.w.jazz ?? 0) > 0) && !wwii.signature.includes('jazz'), JSON.stringify(wwii));
  const crash = styleProfile({ era: '1929-1933', title: '1929: the Wall Street crash', scenes: [] }, 'finance');
  assert.ok(crash.jazzAge && crash.w.jazz > 0 && crash.signature.includes('jazz'), JSON.stringify(crash));
  const plane = styleProfile({ era: '1930', title: 'The plane crash that changed aviation', scenes: [] }, 'documentary');
  assert.ok(!plane.topics.includes('crash') && !plane.jazzAge, 'uçak kazası borsa çöküşü değil');
  const murder = styleProfile({ era: '2026', title: 'The murder suspect who vanished', scenes: [] }, 'crime');
  assert.ok(murder.topics.includes('noir') && !((murder.w.jazz ?? 0) > 0) && !murder.signature.includes('jazz'), JSON.stringify(murder));
  const bubble = styleProfile({ era: '2026', title: 'The AI bubble: banks, stocks and a depression ahead', scenes: [] }, 'finance');
  assert.ok(!bubble.topics.includes('crash'), 'AI balonu (3c14ff) 1920 sessiz film piyanosu almaz');
  // Kültür: başlıktaki ülke adı modern hikâyeye egzotik renk vermez; haber hiç almaz; açık istek ve 1920 öncesi alır.
  const pref = (s) => [..._internals.culturePrefs(s, 'documentary').strong];
  assert.ok(!pref({ format: 'news', title: 'Lula won: how Brazil really voted', scenes: [] }).includes('latin'));
  assert.ok(!pref({ title: 'Strait of Hormuz: Iran says two tankers hit mines', era: '2026', scenes: [] }).includes('middle-eastern'));
  assert.ok(pref({ title: 'Constantinople', musicHint: 'Ottoman court, 1453', scenes: [] }).includes('middle-eastern'));
  assert.ok(pref({ title: 'The fall of Constantinople', era: '1453', scenes: [] }).includes('middle-eastern'));
});

test('yas: ölüm cümlesi (olumsuz değilse) yas sahnesi; "no one was killed" değil', () => {
  assert.equal(A.griefScene({ say: 'Borys Baranov died of a heart attack in 2005.' }), true);
  assert.equal(A.griefScene({ say: '[serious] No one was killed, and two sailors were injured.' }), false);
  assert.equal(A.griefScene({ say: 'The ship sailed on.', grief: true }), true, 'boru hattının işareti');
  assert.equal(A.griefScene({ say: 'He lost his job that winter.' }), false);
  assert.equal(A.griefScene({ say: 'Twelve workers lost their lives.' }), true);
});

test('geçmiş: kanal başına 12 video, ceza en çok 0,15; eşitler arasında karar verir, uyumu ezmez', () => {
  const recent = Array.from({ length: 12 }, (_, i) => ({ key: `v${i}`, main: 'x', tracks: ['x'] }));
  assert.ok(_internals.historyPenalty({ id: 'x' }, recent) <= 0.15 + 1e-9);
  // Fit 0.9 + geçmiş, fit 0.6'yı (geçmişsiz) hâlâ yener.
  const lib = { music: [tr('best', { mood: { dread: 0.9 } }), tr('mid', { mood: { dread: 0.6 } }), tr('mid2', { mood: { dread: 0.6 } })], sfx: [] };
  const script = { scenes: Array.from({ length: 6 }, () => scene({ mood: 'dread' })) };
  const hist = [{ key: 'A', main: 'best', tracks: ['best'] }, { key: 'B', main: 'best', tracks: ['best'] }];
  const p = planScore({ script, lib, root: '.', genre: 'documentary', seed: 'h', history: hist });
  assert.equal(p.cues.find((c) => c.trackId).trackId, 'best');
  // Eşit uyanlar arasında geçen videonun parçası geri çekilir.
  const twins = { music: [tr('t1', { mood: { dread: 0.9 } }), tr('t2', { mood: { dread: 0.9 } })], sfx: [] };
  const free = planScore({ script, lib: twins, root: '.', genre: 'documentary', seed: 'h' }).cues.find((c) => c.trackId).trackId;
  const other = free === 't1' ? 't2' : 't1';
  assert.equal(planScore({ script, lib: twins, root: '.', genre: 'documentary', seed: 'h', history: [{ key: 'A', main: null, tracks: [free] }] }).cues.find((c) => c.trackId).trackId, other);
  // Başka kanalın geçmişi sayılmaz (planScore da süzer) — anahtar script.musicChannel.
  assert.equal(planScore({ script: { ...script, musicChannel: 'news' }, lib: twins, root: '.', genre: 'documentary', seed: 'h', history: [{ key: 'A', main: null, tracks: [free], channel: 'history' }] }).cues.find((c) => c.trackId).trackId, free);
  // Köşe damgasının görünen adı (script.channel) geçmişi gizlemez: "History Lens" bütün kanallı girdileri düşürüyordu.
  assert.equal(planScore({ script: { ...script, channel: 'History Lens', musicChannel: 'history' }, lib: twins, root: '.', genre: 'documentary', seed: 'h', history: [{ key: 'A', main: null, tracks: [free], channel: 'history' }] }).cues.find((c) => c.trackId).trackId, other);
  assert.equal(planScore({ script: { ...script, channel: 'History Lens' }, lib: twins, root: '.', genre: 'documentary', seed: 'h', history: [{ key: 'A', main: null, tracks: [free], channel: 'history' }] }).cues.find((c) => c.trackId).trackId, other);
});

test('plan: yas koşusu yas parçası alır; sakin sahnede sürükleyici parça yok; doğrulanmamış parça ≤ 2 ipucu, asla tema; ses seviyeleri', () => {
  const lib = { music: [
    tr('drive', { mood: { tension: 0.95, dread: 0.7 }, energy: 4, description: 'A tense, driving orchestral piece with urgency' }),
    tr('pulse', { mood: { tension: 0.85, dread: 0.6 }, energy: 3 }),
    tr('mourn', { mood: { sad: 0.9, calm: 0.6, tension: 0.4 }, energy: 2 }),
    tr('mourn2', { mood: { sad: 0.8, calm: 0.7 }, energy: 2 }),
    tr('nocturne', { mood: { curious: 0.95, calm: 0.9, sad: 0.9, reveal: 0.9, tension: 0.9, dread: 0.9, triumph: 0.9 }, title: 'Highway Nocturne', energy: 3 }),
    tr('cur', { mood: { curious: 0.8, calm: 0.6 }, energy: 2 }),
    tr('cur2', { mood: { curious: 0.75, calm: 0.5 }, energy: 2 }),
    tr('rev', { mood: { reveal: 0.85, dread: 0.6, sad: 0.5 }, energy: 3 }),
  ], sfx: [] };
  const ch = (chapter, mood, n, o = {}) => Array.from({ length: n }, () => scene({ chapter, mood, energy: 2.5, ...o }));
  const scenes = [
    ...ch(0, 'curious', 5), ...ch(1, 'tension', 5), ...ch(2, 'tension', 4), ...ch(2, 'tension', 1, { say: 'Two of the divers died within months.' }),
    ...ch(3, 'reveal', 5), ...ch(4, 'curious', 5), ...ch(5, 'tension', 5), ...ch(6, 'sad', 5), ...ch(7, 'curious', 5), ...ch(8, 'reveal', 5), ...ch(9, 'calm', 5),
  ];
  const script = { title: 'The divers', genre: 'epic', scenes };
  const plan = planScore({ script, lib, root: '.', genre: 'epic', seed: 'g' });
  const byId = new Map(lib.music.map((t) => [t.id, t]));
  const mc = plan.cues.filter((c) => c.trackId);
  const grief = mc.filter((c) => c.grief);
  assert.ok(grief.length >= 1, 'the death line marks its cue');
  for (const c of grief) assert.ok(griefOk(byId.get(c.trackId)), `grief under ${c.trackId}`);
  for (const c of mc) assert.notEqual(c.trackId, 'drive', 'a driving energy-4 track never plays under energy-2.5 scenes in a grave story');
  assert.ok(mc.filter((c) => c.trackId === 'nocturne').length <= 2, 'unverified: at most two cues');
  assert.notEqual(plan.theme?.id, 'nocturne', 'unverified: never the theme');
  for (const c of mc) if (c.mood === 'sad' || c.mood === 'calm') assert.ok(c.gainDb <= -1.5 + 1e-9 && c.gainDb >= -2.5, `${c.mood} ${c.gainDb}`);
  for (const c of mc) if (c.mood === 'reveal' || c.mood === 'triumph') assert.ok(c.gainDb <= 0.8 + 1e-9, `grave ${c.mood} is not pushed (${c.gainDb})`);
  const per = new Map();
  for (const c of mc) per.set(c.trackId, (per.get(c.trackId) ?? 0) + 1);
  for (const [id, n] of per) assert.ok(n <= 3, `${id} ×${n}`);
});

test('plan: tema ilk kez ancak uyduğu bir koşuda (≥ 0,5) söylenir', () => {
  const lib = { music: [
    tr('theme', { mood: { sad: 0.95, calm: 0.9, tension: 0.2, curious: 0.3 }, energy: 2, dur: 240 }),
    tr('ten', { mood: { tension: 0.9, dread: 0.7 }, energy: 3 }), tr('ten2', { mood: { tension: 0.85, dread: 0.6 }, energy: 3 }),
    tr('cur', { mood: { curious: 0.9, calm: 0.5 }, energy: 2 }), tr('sad2', { mood: { sad: 0.7, calm: 0.6 }, energy: 2 }),
  ], sfx: [] };
  const moods = ['tension', 'tension', 'curious', 'tension', 'sad', 'tension', 'curious', 'tension', 'calm', 'sad'];
  const scenes = moods.flatMap((m, ch) => Array.from({ length: 5 }, () => scene({ chapter: ch, mood: m })));
  const plan = planScore({ script: { title: 'x', scenes }, lib, root: '.', genre: 'documentary', seed: 't' });
  const byId = new Map(lib.music.map((t) => [t.id, t]));
  for (const c of plan.cues.filter((c) => c.theme && !c.resume)) {
    assert.ok(_internals.fitFor(byId.get(c.trackId), c, { gravity: plan.gravity }) >= 0.5, `theme on a ${c.mood} run at ${c.fromSec}`);
  }
});

/* ------------------------------------------------------------ real jobs (read-only) */

const REAL = [
  ['20261026-24122a', 'Chernobyl'], ['20261026-29db03', 'Lula'], ['20261018-8a1eca', 'Hormuz'],
  ['20261024-950730', "Eagle's Nest"], ['20261011-3c27b1', 'Saudi'], ['20261010-989df5', 'Hastings'],
  ['20260930-24969b', 'Titanic'], ['20261002-508aca', '1453'], ['20261002-427298', '1812'], ['20261024-373aaf', 'Submarine'],
  ['20261020-37f9d2', 'France'], ['20261006-af567d', 'Bakker'],
];
const D = await import('../src/pipeline/docu.js').catch(() => null);
const AR = await import('../src/pipeline/docu-archive.js').catch(() => null);
const propsOf = (id) => `${JOBS}/${id}/docu/${id}.props.json`;
let placeTimeline = null;
try {
  ({ placeTimeline } = await import('../docu-engine/src/timeline.js'));
} catch { /* the engine's own lengths are used */ }

for (const [id, name] of REAL) {
  const ok = hasLib && fs.existsSync(propsOf(id));
  test(`gerçek iş ${name} (${id}): ciddi ağırlıkta saçma parça yok, yas cümleleri yas parçasında, tema uyduğu yerde`, { skip: !ok && 'iş dosyaları bu makinede yok' }, () => {
    const script = JSON.parse(fs.readFileSync(propsOf(id), 'utf8')).script;
    const job = fs.existsSync(`${JOBS}/${id}/job.json`) ? JSON.parse(fs.readFileSync(`${JOBS}/${id}/job.json`, 'utf8')) : {};
    // The pipeline contract (27 Ekim 2026): musicMeta writes musicEra / format / musicChannel / musicGravity; the
    // corner bug's display name sits in script.channel.
    if (D && AR) {
      const mm = D.musicMeta(job, {}, { era: AR.hikayeDonemi(script), explicit: script.era, scenes: script.scenes, format: script.format, genre: script.genre });
      for (const [k, v] of Object.entries(mm)) if (script[k] == null || script[k] === '') script[k] = v;
    }
    script.musicGravity = 'serious';
    if (job.docuFormat === 'news') script.format = 'news';
    script.channel = 'Display Name';
    const secs = placeTimeline ? placeTimeline(script.scenes, 30, []).map((p) => p.frames / 30) : undefined;
    const plan = planScore({ script, sceneSeconds: secs, lib: realLib, root: LIB, genre: script.genre, seed: id, history: [], selector: 'v2' });
    const byId = new Map(realLib.music.map((t) => [t.id, t]));
    const mc = plan.cues.filter((c) => c.trackId);
    assert.ok(mc.length >= 6, `${mc.length} cues`);
    assert.ok(plan.gravity === 'serious' || plan.gravity === 'grave');
    const news = script.format === 'news';
    for (const c of mc) {
      const t = byId.get(c.trackId);
      const cls = seriousClass(t);
      const g = t.tags;
      assert.notEqual(cls, 'never', `${c.title} is never on a serious story`);
      assert.ok(!MUSIC_BANNED.test(`${t.title} ${t.file}`), `${c.title} is banned`);
      assert.notEqual(g.register, 'light', c.title);
      if (!plan.profile.signature.includes('jazz')) assert.ok(g.culture !== 'jazz' && !LOUNGE_OR_JAZZ.test(`${g.description} ${g.toneNote}`), `no jazz/lounge: ${c.title}`);
      if (news) assert.ok(!EXOTIC.includes(g.culture) && cls !== 'cond:culture', `no exotic colour in news: ${c.title} (${g.culture})`);
    }
    if (id === '20261026-24122a') {
      assert.equal(plan.profile.year, 1986, 'Chernobyl is 1986 (scene eras, no script.era yet)');
      assert.equal(storyYear(script, secs), 1986);
    }
    if (news) assert.equal(plan.profile.year, new Date().getUTCFullYear(), 'a news video is set now: no 1942 jazz');
    // Grief: every music cue under a death line is mournful and restrained.
    const sec = secs ?? script.scenes.map((s) => Math.max(Number(s.dur) || 0, (Number(s.voiceDur) || 0) + 0.4));
    let at = 0;
    script.scenes.forEach((sc, i) => {
      const mid = at + sec[i] / 2;
      at += sec[i];
      if (!griefLine(sc)) return;
      const c = plan.cues.find((x) => x.fromSec <= mid && x.toSec > mid);
      if (!c?.trackId) return;
      assert.ok(griefOk(byId.get(c.trackId)), `scene ${i} "${String(sc.say).slice(0, 60)}" under ${c.title}`);
    });
    // Theme: safe, verified, never on a run it does not fit.
    if (plan.theme) {
      const th = byId.get(plan.theme.id);
      assert.equal(seriousClass(th), 'safe');
      assert.ok(!VERIFY_LIST.test(`${th.title} ${th.file}`), `unverified theme ${th.title}`);
      for (const c of mc.filter((x) => x.theme && !x.resume)) assert.ok(_internals.fitFor(th, c, { gravity: plan.gravity }) >= 0.5, `theme on a ${c.mood} run at ${c.fromSec}`);
    }
    // Unverified tracks: none in a serious story. Every track at most three statements (a resume after its drop-out is
    // the same statement). No silent hole: never a too-quiet master. No 6-11 s chained stub.
    const per = new Map();
    for (const c of mc) if (!c.resume) per.set(c.trackId, (per.get(c.trackId) ?? 0) + 1);
    for (const [tid, n] of per) {
      const t = byId.get(tid);
      assert.ok(!VERIFY_LIST.test(`${t.title} ${t.file}`), `unverified ${t.title} in a serious story`);
      assert.ok(n <= 3, `${t.title} ×${n}`);
      assert.ok(!A.musicTooQuiet(t), `${t.title} is too quiet to play: a silent hole`);
    }
    for (const c of mc) if (c.chained) assert.ok(c.toSec - c.fromSec >= 12 - 1e-6, `chained stub ${c.title} ${c.fromSec}-${c.toSec}`);
    // A theme is a theme: stated at least twice.
    if (plan.theme) assert.ok(mc.filter((c) => c.theme && !c.resume && !c.chained).length >= 2, 'theme heard twice');
    // Before 1950 (R13): a period-safe theme, and at least 90 % of the music period-safe.
    if (plan.profile.year < 1950) {
      if (plan.theme) assert.ok(A.periodSafe(byId.get(plan.theme.id)), `period theme ${plan.theme.title}`);
      const all = mc.reduce((a, c) => a + c.toSec - c.fromSec, 0);
      const off = mc.filter((c) => !A.periodSafe(byId.get(c.trackId))).reduce((a, c) => a + c.toSec - c.fromSec, 0);
      assert.ok(off <= 0.1 * all, `${Math.round(off)} of ${Math.round(all)} s modern under ${plan.profile.year}`);
    }
    // Relief lines ("Nobody was hurt", "both boats came home"): never a mournful track (sad >= 0.7).
    {
      let t0 = 0;
      script.scenes.forEach((sc, i) => {
        const mid = t0 + sec[i] / 2;
        t0 += sec[i];
        if (!A.reliefScene(sc)) return;
        const c = plan.cues.find((x) => x.fromSec <= mid && x.toSec > mid);
        if (c?.trackId) assert.ok((byId.get(c.trackId).tags.moodFit?.sad ?? 0) < 0.7, `relief scene ${i} "${String(sc.say).slice(0, 60)}" under ${c.title}`);
      });
    }
    const minutes = plan.cues.at(-1).toSec / 60;
    assert.ok((mc.length - 1) / minutes <= 1.0, `${((mc.length - 1) / minutes).toFixed(2)} cue changes a minute`);
  });
}

/* ------------------------------------------------------------ 27 Ekim review: units */

test('çok sessiz kayıt hiç planlanmaz (renderScore onu sessizliğe çevirirdi)', () => {
  const quiet = { ...tr('q', { mood: { sad: 0.95, calm: 0.9 }, energy: 2 }), lufs: -36.4 };
  const lib = { music: [quiet, tr('m1', { mood: { sad: 0.7, calm: 0.6 }, energy: 2 }), tr('m2', { mood: { sad: 0.6, calm: 0.5 }, energy: 2 }), tr('t', { mood: { tension: 0.8 } })], sfx: [] };
  const scenes = Array.from({ length: 12 }, (_, i) => scene({ chapter: Math.floor(i / 3), mood: 'sad', say: 'He died that night.' }));
  const plan = planScore({ script: { title: 'x', scenes, musicGravity: 'grave' }, lib, root: '.', genre: 'documentary', seed: 'q' });
  assert.ok(plan.cues.some((c) => c.trackId));
  assert.ok(!plan.cues.some((c) => c.trackId === 'q'), 'Sad Trio-like track never planned');
  assert.equal(A.musicTooQuiet({ ...quiet, normalised: true }), false, 'normalised offline: playable');
});

test('yas sözleşmesi: soru, koşul, efsane yas değil; "kimse kurtulamadı" yas; üç kopya aynı', async () => {
  const TL = await import('../docu-engine/src/timeline.js');
  const DS = await import('../src/pipeline/docu-script.js');
  const cases = [
    ['Borys Baranov died of a heart attack.', true],
    ['[softly] Not one of the eight musicians survived.', true],
    ['If your bank dies, your money dies with it.', false],
    ['But was anyone actually killed?', false],
    ['The legend calls them suicide divers.', false],
    ['No one was killed, and that is a miracle.', false],
    ['The Guard survived the retreat.', false],
  ];
  for (const [say, want] of cases) {
    assert.equal(A.griefScene({ say }), want, `audio-director: ${say}`);
    assert.equal(TL.griefText(say), want, `timeline: ${say}`);
    assert.equal(DS.griefLine(say), want, `docu-script: ${say}`);
  }
  assert.equal(String(A.GRIEF_UNREAL), String(DS.GRIEF_UNREAL));
  assert.equal(String(A.NO_SURVIVOR), String(DS.NO_SURVIVOR));
  // Relief: a zero toll or people safe — not bare "survived" or "walked away".
  assert.equal(A.reliefScene({ say: 'Nobody was hurt, and no radiation leak was reported.' }), true);
  assert.equal(A.reliefScene({ say: 'Both boats came home.' }), true);
  assert.equal(A.reliefScene({ say: 'But the Russian army walked away intact.' }), false);
  assert.equal(A.reliefScene({ say: 'The group survived more strikes.' }), false);
  assert.equal(A.reliefScene({ say: 'Not one of the eight musicians survived.' }), false, 'a death line is never relief');
});

test('rahatlama satırında yaslı parça çalmaz, yerine uyan biri varsa', () => {
  const lib = { music: [
    tr('mourn', { mood: { tension: 0.8, sad: 0.9, dread: 0.7 }, energy: 3 }),
    tr('ten', { mood: { tension: 0.75, dread: 0.6, sad: 0.2 }, energy: 3 }),
    tr('ten2', { mood: { tension: 0.7, dread: 0.5, sad: 0.3 }, energy: 3 }),
  ], sfx: [] };
  const scenes = Array.from({ length: 6 }, () => scene({ mood: 'tension', say: 'Nobody was hurt, and both boats came home.' }));
  const plan = planScore({ script: { title: 'x', scenes, musicGravity: 'serious' }, lib, root: '.', genre: 'documentary', seed: 'r' });
  for (const c of plan.cues.filter((x) => x.trackId)) assert.notEqual(c.trackId, 'mourn');
});

test('1950 öncesi: tema ve müzik döneme uygun (synth/pad/electronic yok, ikisi kaldıkça)', () => {
  const lib = { music: [
    tr('synth', { mood: { tension: 0.95, dread: 0.8, sad: 0.6, calm: 0.6 }, energy: 3, instruments: ['strings', 'synth pad'], dur: 260 }),
    tr('amb', { mood: { tension: 0.9, dread: 0.8 }, energy: 3, culture: 'ambient', instruments: ['drones'] }),
    tr('orch1', { mood: { tension: 0.8, dread: 0.7, sad: 0.6, calm: 0.6 }, energy: 3, dur: 260 }),
    tr('orch2', { mood: { tension: 0.75, dread: 0.6 }, energy: 3 }),
    tr('orch3', { mood: { sad: 0.8, calm: 0.7 }, energy: 2, dur: 260 }),
    tr('orch4', { mood: { tension: 0.7, dread: 0.7 }, energy: 3 }),
    tr('orch5', { mood: { dread: 0.75, tension: 0.6 }, energy: 3 }),
  ], sfx: [] };
  const moods = ['tension', 'tension', 'sad', 'tension', 'dread', 'tension', 'sad', 'tension', 'calm', 'sad'];
  const scenes = moods.flatMap((m, ch) => Array.from({ length: 5 }, () => scene({ chapter: ch, mood: m })));
  const plan = planScore({ script: { title: 'Hastings 1066', musicEra: '1066', scenes, musicGravity: 'grave' }, lib, root: '.', genre: 'epic', seed: 'p' });
  assert.equal(plan.profile.year, 1066, 'script.musicEra is read first');
  for (const c of plan.cues.filter((x) => x.trackId)) assert.ok(!['synth', 'amb'].includes(c.trackId), `${c.trackId} at ${c.fromSec}`);
  if (plan.theme) assert.ok(!['synth', 'amb'].includes(plan.theme.id));
  assert.equal(A.periodSafe(lib.music[0]), false);
  assert.equal(A.periodSafe(lib.music[2]), true);
});

test('kanal geçmişi: son 3 videonun parçası, uyan iki başkası varken oturur', () => {
  const lib = { music: ['a', 'b', 'c'].map((id) => tr(id, { mood: { dread: 0.9 } })), sfx: [] };
  const script = { title: 'x', musicChannel: 'news', scenes: Array.from({ length: 6 }, () => scene({ mood: 'dread' })) };
  const first = planScore({ script, lib, root: '.', genre: 'documentary', seed: 'h' }).cues.find((c) => c.trackId).trackId;
  const hist = [{ key: 'A', main: null, tracks: [first], channel: 'news' }];
  for (let i = 0; i < 4; i++) {
    const p = planScore({ script: { ...script, id: `v${i}` }, lib, root: '.', genre: 'documentary', seed: `h${i}`, history: hist });
    assert.ok(!p.cues.some((c) => c.trackId === first), `seed ${i}: last video's track came back`);
  }
});

test('görüntünün kurgu ağırlığı müzik kuralından ayrı: eski videoların grameri değişmez', { skip: !fs.existsSync(JOBS) && 'iş yok' }, () => {
  assert.equal(A.editGravity({ title: 'x', scenes: [{ say: 'A calm line.' }] }, 'finance'), 'open', 'finance is not grave for the picture');
  assert.equal(A.storyGravity({ title: 'x', scenes: [{ say: 'A calm line.' }] }, 'finance'), 'grave', 'it is for the music');
  assert.equal(A.editGravity({ musicGravity: 'serious', scenes: [] }, 'epic'), 'grave');
  for (const id of ['20260930-24969b', '20260930-2efe04', '20261015-23e041', '20261018-8a1eca', '20261024-48ae2d']) {
    const pf = `${JOBS}/${id}/docu/${id}.props.json`;
    if (!fs.existsSync(pf)) continue;
    const sc = JSON.parse(fs.readFileSync(pf, 'utf8')).script;
    const was = sc.editGrammar?.gravity;
    if (!was) continue;
    assert.equal(A.editGravity({ ...sc, musicGravity: 'serious' }, sc.genre), was, `${id} keeps its ${was} edit grammar`);
  }
});

test('müzik pencereleri: yas/doruk satırından sonra ~3,3 sn hava, 150 sn arayla, girişte ve kart yanında değil; karışım pencereyi açar', async () => {
  const EG = await import('../docu-engine/lib/edit-grammar.mjs');
  const TL = await import('../docu-engine/src/timeline.js');
  const mk = (o) => ({ type: 'photo', mood: 'curious', chapter: 0, say: 'A line.', voice: 'v.wav', voiceDur: 9.6, dur: 10, ...o });
  const scenes = Array.from({ length: 60 }, (_, i) => mk({ chapter: Math.floor(i / 20) }));
  scenes[3] = mk({ grief: true, mood: 'sad', say: 'He died.' }); // 30 s: inside the hook
  scenes[12] = mk({ grief: true, mood: 'sad', say: 'Borys Baranov died of a heart attack.' }); // 120 s
  scenes[14] = mk({ energy: 5, mood: 'reveal' }); // 140 s: too close to the first window
  scenes[19] = mk({ energy: 5, mood: 'reveal' }); // last line before chapter 1: the card/turn opens anyway
  scenes[20] = { type: 'title', chapterCard: true, chapter: 1, dur: 3 };
  scenes[40] = { type: 'title', chapterCard: true, chapter: 2, dur: 3 };
  scenes[35] = mk({ chapter: 1, energy: 5, mood: 'reveal' }); // ~350 s
  const r = EG.applyBreath({ scenes });
  const win = scenes.map((s, i) => (s.musicWindow ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(win, [12, 35]);
  assert.equal(r.windows, 2);
  assert.ok(Math.abs(scenes[12].dur - (9.6 + EG.WINDOW_BREATH)) < 1e-6);
  // The mix opens a window in that pause.
  const placed = TL.placeTimeline(scenes, 30, []);
  const { pauses } = TL.bedCurve({ placed, scenes, fps: 30 });
  const end12 = placed[12].from + Math.round(9.6 * 30);
  assert.ok(pauses.some((p) => p.a === end12 && p.window && p.level === 1), 'music window opens fully after the death line');
});

// Ses yönetmeni — müziği, geçiş efektlerini, ortam seslerini ve olay seslerini
// ses kütüphanesinden (data/audio-library, scripts/audio-library.mjs) profesyonel
// bir kurgucu gibi seçer. Ücretli API çağırmaz; ElevenLabs kredisi harcamaz.
//
//   loadLibrary(root)                                    -> lib | null
//   planScore({ script, sceneSeconds, lib, genre, seed, history, selector, log }) -> { cues, theme, palette, profile, notes }
//   readMusicHistory(file) / musicHistoryFor(list, key, { channel }) / recordMusicHistory(file, entry)  cross-video variety
//   seriousClass(track) -> 'safe' | 'cond:*' | 'never'   (ciddi hikâyede çalabilir mi; MUSIC_BANNED hiç yüklenmez)
//   renderScore({ plan, lib, root, outFile, ff, totalSec }) -> { file, musicCues }
//   musicTooQuiet(track) -> bool   (lufs < -30 ve normalize işareti yok: +8 dB'lik yükseltme yetmez, çalınmaz)
//   clauseBlock(tokens, i, j, sent) -> neden | null   (İngilizce: olumsuz/varsayım/aktarma/önceki olay/atıf)
//   pickSfxPools({ lib, root, genre, seed })             -> { hit: [abs], whoosh: [abs], ... }
//   planAmbience({ script, lib, root, genre, sceneSeconds, seed }) -> AmbienceCue[]
//   planEvents({ script, lib, root, genre, seed })       -> EventCue[]
//   sfxMeta(poolFile)                                    -> { peakAt, dur, gainDb, moods, ... } | null
//
// Bir kurgucunun kuralları, kodda:
//  - Müzik sahne sahne değil İPUCU (cue) olarak döşenir. Parça yalnızca bölüm
//    geçişinde ve gerçek bir hikâye dönemecinde (en az ~20 sn süren duygu ailesi
//    değişimi) değişir; bir ipucu boyunca tek parça tutulur. Sessizlik sahneleri
//    bilinçli durgu olarak işlenir.
//  - v2: bir ana tema (girişte, ortada, finalde; yalnız uyduğu koşuda) + 5-8 destek ipucu, parça başına en çok
//    3 ipucu; aynı parça art arda iki ipucunda çalmaz, her dönüşte parçanın başka bir bölümü. Önce ciddiyet
//    kapısı (seriousClass), sonra uyum, dönem/konu enstrümanı; aynı kanalın son 12 videosu yalnız eşitler
//    arasında karar verir, son 5 videonun teması tema olmaz (docu-music-history.json). selector 'v1' = eski planlayıcı.
//  - Parçanın içinden, ipucunun duygusuna uyan bölüm seçilir (gerilim -> yükselen
//    kısım, sakin -> alçak kısım) ve bir cümle başına oturtulur.
//  - Her ipucu aynı ses yüksekliğine getirilir (en çok +8 dB yükseltme), sonra 1,5 sn eşit güçlü çapraz geçişle,
//    giden parçanın kendi nefesinde bağlanır; gelen parça giden parçanın ±2 LU yakınında başlar, 6-8 sn'de kendi
//    seviyesine iner/çıkar. Filmin sonunda tek bir 3,5 sn kısma vardır.
//  - Ortam sesi yalnızca metin gerçekten o mekânı anlatıyorsa gelir; yanlış bir
//    ortam sesindense sessizlik iyidir. Olay sesi (patlama, siren, silah) yalnızca
//    anlatı onu sözcük olarak söylüyorsa, o sözcüğün üstüne konur; mecaz, olumsuz
//    ve varsayım cümleleri ("bomba gibi haber", "patlamadı", "patlayabilirdi") ses almaz.
//    Bir nesne adı tek başına olay değildir ("bende bomba var"); onu seslendiren bir
//    fiil gerekir ("bomba patladı", "toplar gürledi") ve ses o fiilin üstüne düşer.
//    Anlatılan bir ölümün üstüne silah ya da patlama sesi konmaz.
//    İngilizce anlatımda da aynı (27 Ekim 2026, clauseBlock): olumsuz ("never came", "didn't"), varsayım/korku/
//    aktarma ("should", "feared", "said nothing about"), önceki olay ("had destroyed"), atıf ("ten days after the
//    explosion"); sayı/grafik/alıntı kartında ve yas cümlesinde (GRIEF) çarpma sesi yok. Olay olan yatak (çığlık,
//    siren, top) ancak o ses adıyla anıldığında gelir.
//
// Kütüphane şeması (library.json):
//   music: [{ id, file, title, artist, license, duration, lufs, energy: [dB/sn, 0 = en yüksek],
//             tags: { energy 1-5, vocals, culture, moodFit{7 duygu}, genreFit{7 stil}, documentaryUsable, ... } }]
//   sfx:   [{ file, sourceId, title, role, kind (whoosh|hit|riser|swell|snap|ticks|glitch|stinger|bed|event),
//             intensity 1-5, keywords [EN+TR], genres, moods, scene_types, era (any|pre-industrial|industrial|modern),
//             literal_only, max_per_video, min_gap_sec, gain_db, duration, lufs, lufsMax?, onset? }]
//   sfxRules: kurgucunun kural kitabı (düz yazı). Oradan uygulananlar: gain_db = anlatıya göre
//             seviye (dB), dönem kapısı, hava yatakları yalnızca hava adıyla, stilin varsayılan
//             yatakları yalnızca eşitlikte (kanıtsız yatak asla), slam öncesi yatak kesilir,
//             olaylar yalnızca gerçekten olduğunda, siren/çan/alkış 0,5 sn erken, varsayılan olay
//             aralığı 60 sn, ilham stilinde şiddet sesi yok, intihar asla seslendirilmez.
//             Nesne olarak da verilebilir: { bedThreshold, eventMinGapSec, maxEventsPerVideo,
//             eventsPerMinute, genres: { <stil>: { kinds: { <tür>: bool }, events, beds, defaultBeds } } }
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRELAP_MAX } from '../src/timeline.js';
import { FOLEY_LEN, renderSynth, spaceOfText, synthFoley, synthLogo } from './sound-craft.mjs';

export const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];
export const GENRES = ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror'];
export const SFX_KINDS = ['hit', 'whoosh', 'riser', 'ticks', 'glitch', 'swell', 'snap', 'stinger', 'thud'];
/**
 * Library sounds that never play, whatever their tags say. The mechanical counter tick (pixabay
 * 1053, "çık çık" under 1453's counters) sounded cheap; the user banned it outright.
 */
export const SFX_BANNED = /mechanical[-_ ]?counter/i;
/**
 * Music that never loads, whatever its tags say (title + file). "Somnia Variation 1 relax and sleep" was the main
 * theme of the Hormuz tanker-mines news (20261018-8a1eca); a sleep, spa or kids record has no place on a news,
 * history or finance channel (owner, 27 Ekim 2026: "ciddi konularda saçma hiçbir şey çalmasın").
 */
export const MUSIC_BANNED = /relax(?:ing)?\s*(?:and|&)\s*sleep|sleep music|meditat|lullab|ukulele|\bkids?\b|children|nursery|\bspa\b|yoga|lo-?fi/i;
/**
 * Tracks nobody has listened to all the way through (the tagger heard 40 s of each): never the main theme and at
 * most VERIFY_MAX cues a video until someone does. Highway Nocturne carried 194 s of Chernobyl and the 1066 theme
 * (13:19-15:07) with a steady ~100-bpm pulse the tags never mention; Marble Cinematic University is a Marvel
 * pastiche (3 cues in Lula); Survival Mode's artist has only game-like tracks besides it (5 Chernobyl cues).
 * 27 Ekim 2026 replay: Ezra Lipp's TV-pastiche album (Perfect Strangers Things, How To Train Your Dragnet) landed in
 * 6-7 of 12 replanned videos, the Chernobyl cold open among them; In The Bushes Creepin' and jazz bassist John
 * Patitucci's Surface of the Moon / Hear The Bells (the Highway Nocturne failure mode) under death lines.
 */
export const VERIFY_LIST = /highway nocturne|marble cinematic university|survival mode|perfect strangers things|how to train your dragnet|in the bushes creepin|surface of the moon|hear the bells/i;
const VERIFY_MAX = 2;

/* Loudness frame of reference (pre-master). Narration lines sit around -19 LUFS; their momentary peaks ~4 dB above. */
const NARRATION_LUFS = -19;
const NARRATION_PEAK = NARRATION_LUFS + 4;
/* Every music cue is normalised to this before mixing; the engine's fader does the rest. */
const SCORE_LUFS = -16;
/* A mood change has to be HELD this long before it earns a new music cue (v1 planner). */
const MIN_HOLD = 20;
/*
 * v2: 35 s (27 Ekim 2026). With 20 s the 11 audited videos changed cue 0.94-1.42 times a minute over a 5-8 track
 * palette — an audible A-B-A-C rotation (Chernobyl 20261026-24122a: Survival Mode at 0:00, 0:42, 2:44, 7:44).
 * Cues now change at the chapter cards first and inside a chapter only for a turn held 35 s, and a film is held
 * to about CHANGES_PER_MIN cue changes a minute (the shortest in-chapter turns fold away first).
 */
const MIN_HOLD_V2 = 35;
const CHANGES_PER_MIN = 0.9;
/* No cue shorter than this except the cold open and deliberate silences. */
const MIN_CUE = 12;
/*
 * Track -> track crossfade (s), equal power (qsin in, qsin out). 27 Ekim 2026: 2.5 s -> 1.5 s. The brief asks for
 * 1-2 s crossfades on phrase ends; with no key or tempo data on any of the 233 tracks, a 2.5 s overlap of two unrelated
 * keys is heard as a smear (Chernobyl 20261026-24122a seams at 3:41.9, 8:35.1, 11:16.6).
 */
const XFADE = 1.5;
/*
 * The film's ONE music fade-out (s, qsin), owned here: timeline.js musicEnvelope no longer fades the end. The old
 * 2.5 s linear fade times the envelope's own 2.5 s fade was -12 dB at the halfway point, so Chernobyl's closing
 * Last Sunrise (12:32-12:45) dropped away about 1 s early under the sonic logo (audit 27 Ekim 2026). Rulebook: ~3 s.
 */
const FADE_OUT = 3.5;
export const SCORE_FADE_OUT = FADE_OUT;
/** A planned silence at the very end longer than this (s) is filled by the last track (no silent end screen). */
export const END_SILENCE_MAX = 3;
/* The title card must land this early for the part before it to count as a cold open. */
const COLD_OPEN_MAX = 75;
/* A silence this short between two passages of the same feeling is a drop-out: the music keeps time underneath. */
const RESUME_MAX_SILENCE = 8;

/* Mood families: the level at which a music editor thinks. Curious->calm is a nuance of one cue, not a new track. */
const FAMILY = { curious: 'light', calm: 'light', tension: 'dark', dread: 'dark', reveal: 'peak', sad: 'sad', triumph: 'bright' };
const COMPAT = {
  'light|sad': 0.6, 'light|dark': 0.4, 'dark|peak': 0.9, 'light|bright': 0.5, 'sad|bright': 0.4,
  'dark|sad': 0.4, 'bright|peak': 0.8, 'light|peak': 0.5, 'dark|bright': 0.3, 'sad|peak': 0.3,
};
const compat = (a, b) => (a === b ? 1 : COMPAT[`${a}|${b}`] ?? COMPAT[`${b}|${a}`] ?? 0.2);
/* How hard each mood should drive (track tag energy 1-5). */
const TARGET_ENERGY = { calm: 1.8, sad: 1.8, curious: 2.6, dread: 2.8, tension: 3.8, reveal: 4.5, triumph: 4.4 };
/*
 * Mix intent on top of the common level: beds under calm narration sit lower, peaks a touch higher.
 * Grief and calm stay at -1.5 dB: the intimate cue that came out as loud as a driving one (Sad Trio +14 dB under Black
 * Buck, Bakker and Eagle's Nest) is fixed by the +8 dB lift cap and the too-quiet ban, and the mix's per-mood duck
 * (0.14 for sad/calm) and grief dip already set them lower under the voice — with -3 dB on top a death line's
 * mournful track sat ~31 dB under the narration (27 Ekim 2026 review). In a grave story a reveal or a "victory" is
 * not louder (planScoreV2). v1 keeps its old levels: its jobs are already cut and mixed to them.
 */
const MOOD_GAIN_DB = { calm: -1.5, sad: -1.5, curious: -1, dread: -1, tension: 0, reveal: 1, triumph: 1 };
const MOOD_GAIN_V1 = { calm: -1.5, sad: -1.5, curious: -1, dread: -1, tension: 0, reveal: 1, triumph: 1 };
/* The moods each style lives in (docu plan, A5). */
const GENRE_MOODS = {
  documentary: ['curious', 'tension', 'reveal', 'calm'],
  crime: ['tension', 'dread', 'reveal'],
  epic: ['tension', 'triumph', 'sad'],
  science: ['curious', 'calm', 'reveal', 'triumph'],
  inspire: ['sad', 'triumph', 'calm'],
  finance: ['tension', 'reveal', 'dread'],
  horror: ['dread', 'tension', 'sad'],
};
/* How much a cold open is about sheer impact: horror builds in silence, a biography opens intimately. */
const STRIKE_ENERGY = { horror: 0.15, inspire: 0.1 };

/* ------------------------------------------------------------------ basics */

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const r3 = (x) => Math.round(x * 1000) / 1000;
const dbToLin = (db) => Math.pow(10, db / 20);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const sd = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) * (v - m))));
};
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const hash = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

/** Deterministic PRNG (mulberry32) keyed by any string: same seed, same choices. */
function rngFor(...parts) {
  let a = createHash('sha1').update(parts.map(String).join('|')).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted pick. Candidates close to the best are all "right"; the seed rotates between them. */
function pickNear(scored, rng, margin = 0.04, maxN = 4) {
  if (!scored.length) return null;
  const sorted = [...scored].sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));
  const top = sorted.filter((c) => c.score >= sorted[0].score - margin).slice(0, maxN);
  const w = top.map((c) => c.score - (sorted[0].score - margin) + 0.01);
  let r = rng() * w.reduce((s, v) => s + v, 0);
  for (let i = 0; i < top.length; i++) {
    r -= w[i];
    if (r <= 0) return top[i];
  }
  return top.at(-1);
}

/* ---------------------------------------------------------- Turkish text */

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u', é: 'e', è: 'e', ê: 'e', ë: 'e', ä: 'a', à: 'a', á: 'a', ô: 'o', ó: 'o', í: 'i', ñ: 'n' };
/*
 * Turkish lower case (I -> ı, İ -> i). Hand-rolled on purpose: toLocaleLowerCase('tr-TR')
 * costs microseconds per call, and keyword matching calls it millions of times on a
 * 15-minute script — a planAmbience that took 37 s now takes milliseconds.
 */
const lowerTr = (s) => String(s ?? '').replace(/[Iİ]/g, (c) => (c === 'I' ? 'ı' : 'i')).toLowerCase();
/* The (English) sound text: 'Interior' must stay 'interior', not 'ınterior'. */
const lowerEn = (s) => String(s ?? '').replace(/İ/g, 'i').toLowerCase();
/** ASCII-folded lower case — only for our own word lists (negation, figures of speech, eras). */
export const fold = (s) => lowerTr(s).replace(/[çğıöşüâîûéèêëäàáôóíñ]/g, (c) => FOLD[c]);
export const stripTags = (s) => String(s ?? '').replace(/\[[^\]]*\]/g, ' ');
const words = (s) => fold(stripTags(s)).split(/[^a-z0-9]+/).filter(Boolean);
/*
 * Library keywords are matched WITHOUT folding Turkish letters: folded, 'kış'
 * (winter) becomes 'kis' ~ 'kişi' (person) and 'çan' (bell) becomes 'can' (life).
 */
const toks = (s) => lowerTr(stripTags(s)).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const toksEn = (s) => lowerEn(stripTags(s)).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/* Inflections that may follow a Turkish root (checked folded). A chain of them is still "the same word". */
const TR_SUFFIX = new Set([
  'lar', 'ler', 'lari', 'leri', 'larin', 'lerin', 'larina', 'lerine', 'larini', 'lerini', 'larinda', 'lerinde', 'larindan', 'lerinden',
  'si', 'su', 'sin', 'sun', 'sini', 'sunu', 'sina', 'sune', 'sinda', 'sunde', 'sindan', 'sunden', 'i', 'u', 'in', 'un', 'nin', 'nun',
  'ni', 'nu', 'na', 'ne', 'a', 'e', 'ya', 'ye', 'yi', 'yu', 'da', 'de', 'ta', 'te', 'dan', 'den', 'tan', 'ten', 'la', 'le', 'yla', 'yle',
  'ki', 'di', 'ti', 'du', 'tu', 'mis', 'mus', 'iyor', 'uyor', 'yor', 'acak', 'ecek', 'ir', 'ur', 'ar', 'er', 'ma', 'me', 'masi', 'mesi',
  'mak', 'mek', 'dir', 'tir', 'dur', 'tur', 'im', 'um', 'ik', 'uk', 'iz', 'uz', 'n', 's', 'y', 'ca', 'ce', 'li', 'lu', 'yan', 'yen',
  'an', 'en', 'ken', 'dik', 'duk', 'tik', 'tuk', 'mistir', 'mustur', 'irken', 'arak', 'erek', 'il', 'ul', 'in', 'un', 'tir', 'dir',
]);
/* Case, possessive and plural endings only: what a SHORT root may carry ('toplar', not 'toplum'; 'kara' is a word of its own). */
const NOMINAL = new Set(['lar', 'ler', 'lari', 'leri', 'larin', 'lerin', 'i', 'u', 'in', 'un', 'nin', 'nun', 'ni', 'nu', 'da', 'de', 'ta', 'te',
  'dan', 'den', 'tan', 'ten', 'la', 'le', 'yla', 'yle', 'si', 'su', 'sin', 'sun', 'ya', 'ye', 'yi', 'yu', 'na', 'ne', 'ki', 'daki', 'deki', 'n', 's', 'y']);
/* How a keyword may be written in its dictionary form: 'patlama', 'silah sesi', 'patladı'. */
const KW_ENDINGS = new Set(['i', 'u', 'si', 'su', 'ma', 'me', 'masi', 'mesi', 'mak', 'mek', 'di', 'ti', 'du', 'tu', 'mis', 'mus', 'yor', 'iyor', 'uyor', 'ler', 'lar', 'leri', 'lari']);
const EN_SUFFIX = new Set(['', 's', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'y']);
/* Consonant softening: kitap -> kitabı, tüfek -> tüfeği, ağaç -> ağacı. */
const SOFT = { p: 'b', t: 'd', k: 'ğ', ç: 'c' };
/* Too ambiguous in narration to ever trigger a sound on their own: ay (moon/month), at (horse/throw), "bu sefer" (this time)... */
const TR_DROP = new Set(['ay', 'at', 'ev', 'on', 'can', 'yüz', 'sefer', 'alay', 'bin', 'dal', 'gül', 'ben', 'yol', 'hal', 'iş']);
/* English function words that collide with short Turkish keywords in the (English) sound text. */
const EN_STOP = new Set(['at', 'top', 'on', 'in', 'a', 'an', 'the', 'of', 'to', 'and', 'or', 'by', 'for', 'with', 'from', 'as', 'is', 'it', 'ay', 'ev', 'can', 'bin', 'yol', 'ben', 'far', 'off', 'hal']);

const chainMemo = new Map();
function isChain(rest, set = TR_SUFFIX, depth = 0) {
  if (rest === '') return true;
  if (depth > 3) return false;
  const key = `${set === NOMINAL ? 'n' : 't'}|${rest}|${depth}`;
  if (chainMemo.has(key)) return chainMemo.get(key);
  let ok = false;
  for (let k = Math.min(9, rest.length); k >= 1 && !ok; k--) {
    if (set.has(rest.slice(0, k)) && isChain(rest.slice(k), set, depth + 1)) ok = true;
  }
  chainMemo.set(key, ok);
  return ok;
}

/**
 * Does token `t` say keyword word `k`? English: plain inflections only
 * ('wind' never matches 'window'). Turkish: a shared root with inflections on
 * either side ('patlama' ~ 'patladı' ~ 'patlamanın', 'sesi' ~ 'sesleri'); a
 * short root ('top', 'kar') only with case/plural endings, so it never catches
 * 'toplum' or 'karar'.
 */
export function wordMatch(t, k, tr = true) {
  if (!t || !k) return false;
  return wm(lowerTr(t), lowerTr(k), tr);
}

/* Match results, keyed by the pair: a long script asks the same token/keyword question thousands of times. */
const WM = new Map();
/** wordMatch on already lower-cased words (what toks()/words() produce). */
function wm(t, k, tr) {
  if (t === k) return true;
  // Every match shares at least the first letter (TR: a 3-letter root; EN: the keyword itself).
  if (!t || !k || t[0] !== k[0]) return false;
  const key = `${tr ? 1 : 0}${t}\u0001${k}`;
  let v = WM.get(key);
  if (v === undefined) {
    v = wmSlow(t, k, tr);
    if (WM.size > 200_000) WM.clear();
    WM.set(key, v);
  }
  return v;
}

function wmSlow(t, k, tr) {
  if (!tr) {
    if (t.startsWith(k) && EN_SUFFIX.has(t.slice(k.length))) return true;
    if (k.endsWith('e') && t === `${k.slice(0, -1)}ing`) return true;
    if (k.endsWith('y') && t === `${k.slice(0, -1)}ies`) return true;
    return false;
  }
  let p = 0;
  while (p < t.length && p < k.length && t[p] === k[p]) p++;
  let kr = fold(k.slice(p));
  let tr_ = fold(t.slice(p));
  if (p === k.length - 1 && p >= 3 && SOFT[k[p]] && SOFT[k[p]] === t[p]) {
    kr = '';
    tr_ = fold(t.slice(p + 1));
    p += 1;
  }
  // "-sız/-siz" turns the noun into its opposite: 'silahsız', 'sessiz'.
  if (/^s[iu]z/.test(tr_)) return false;
  if (p < 3) return false;
  // Consonant harmony: after p/ç/t/k/s/ş/h/f a suffix starts with t ('topta', 'sesten'),
  // otherwise with d ('patladı'). 'çan' + 'tasında' is 'çanta' (a bag), not a bell.
  const hard = 'pçtksşhf'.includes(t[p - 1]);
  if ((tr_[0] === 't' && !hard) || (tr_[0] === 'd' && hard)) return false;
  // The keyword is inflected ('patlama', 'sesi'); the token must be inflected too
  // ('patladı', 'sesleri'), otherwise 'kurşun' would match 'kurs'.
  if (kr !== '' && (!KW_ENDINGS.has(kr) || tr_ === '')) return false;
  if (p < 4 || k.length <= 3) return isChain(tr_, NOMINAL);
  return isChain(tr_) || (p >= 5 && tr_.length <= 4);
}

/**
 * Find a (possibly multi-word) keyword in a token list, from index `from`. Returns
 * its first word's index, or -1. `list` must be lower-cased (toks()/words() output).
 */
export function findKeyword(list, kwWords, tr = true, from = 0) {
  if (!kwWords.length) return -1;
  const kw = kwWords.map(lowerTr);
  if (kw.length === 1 && (tr ? TR_DROP : EN_STOP).has(kw[0])) return -1;
  for (let i = from; i + kw.length <= list.length; i++) {
    let ok = true;
    for (let j = 0; j < kw.length && ok; j++) ok = wm(list[i + j], kw[j], tr);
    if (ok) return i;
  }
  return -1;
}

/* "patlamadı", "patlamamış", "ateş etmedi", "... değil": the narration says it did NOT happen. */
const NEG = /(madi|medi|mami|memi|mamis|memis|maz|mez|mayacak|meyecek|mayan|meyen|madan|meden)/;
const NEG_VERB = /^(et|ol|duy|yasa|gel|at|acil|basla|gerceklesme|kop|patla)/;
function negated(list, last, kwFold) {
  const t = fold(list[last] ?? '');
  const m = t.search(NEG);
  if (m >= 4 && !kwFold.includes(t.slice(m, m + 4))) return true;
  const nx = fold(list[last + 1] ?? '');
  if (/^(degil|yok)/.test(nx)) return true;
  return !!nx && nx.length <= 13 && NEG.test(nx) && NEG_VERB.test(nx);
}
/* "patlayabilirdi", "patlasaydı", "neredeyse patlayacaktı", "patlama tehlikesi": it could have, it didn't. */
const HYPO_SUFFIX = /(ysa|yse|sayd|seyd|abil|ebil|acakt|ecekt|mali|meli)/;
const HYPO_WORDS = ['eger', 'belki', 'olabilir', 'olsaydi', 'ihtimal', 'olasi', 'tehlike', 'tehdit', 'risk', 'neredeyse', 'kalsin', 'korkusu', 'endise', 'planla', 'hazirla'];
/* English ones whole-word only: as prefixes 'if' would catch 'ifade' (statement) and 'iflas'. */
const HYPO_EN = new Set(['if', 'could', 'would', 'might', 'almost', 'threat', 'threatened', 'nearly']);
function hypothetical(list, first, last, kwFold) {
  const t = fold(list[last] ?? '');
  const m = t.search(HYPO_SUFFIX);
  if (m >= 3 && !kwFold.includes(t.slice(m, m + 4))) return true;
  for (let i = Math.max(0, first - 3); i <= Math.min(list.length - 1, last + 3); i++) {
    if (i >= first && i <= last) continue;
    const w = fold(list[i]);
    if (w === 'could' && PERCEIVE.test(fold(list[i + 1] ?? ''))) continue;
    if (HYPO_EN.has(w) || HYPO_WORDS.some((h) => w.startsWith(h))) return true;
  }
  return false;
}
/* "could hear the screams", "could see the flash": perception, a fact, not a hypothetical (Titanic 24969b, scene 143). */
const PERCEIVE = /^(hear|heard|see|seen|smell|feel|felt|make)$/;

/*
 * English clause gate (27 Ekim 2026). The checks above read Turkish suffixes; English narration went through almost
 * unchecked. Chernobyl 20261026-24122a: 4 of its 5 explosion one-shots fired where nothing exploded — 1:01.7 "ten
 * days after the explosion", 2:51.6 "Moscow television said nothing about the explosion at all" (massive-close
 * 2777, a sub boom under the words), 5:35.7 "meant a steam explosion" (a feared outcome), 10:00.9 "The steam
 * explosion the commission had feared never came"; only 1:47.1 "The blast threw..." was real. Same fault in the
 * submarine 373aaf ("warheads do not detonate") and Black Buck cd55b5 ("at least one bomb should hit"). Rulebook:
 * "Metaphor, negation and hypotheticals never fire an event." So within the keyword's OWN sentence, tokens -4..+5
 * around it: a negation, a hypothetical/feared/reported word or a past perfect ("had feared": the backstory of a
 * different event) blocks it, and so does a time/topic reference ("after/since/before/about the explosion").
 * Silence is the safe side: a missed boom is never noticed, a boom on "nothing happened" always is.
 */
const EN_WIN = [-4, 5];
const NEG_EN = new Set(['no', 'not', 'never', 'nothing', 'none', 'without', 'neither', 'nor', 'nobody', 'cannot']);
const NT_BASE = '(?:did|was|were|do|does|wo|is|are|had|has|have|could|would|should|ca|must|need|ai)';
/* "didn't": one token when spoken (wordTimes join "didn" + "t"), two in plain text. */
const NT_JOINED = new RegExp(`^${NT_BASE}nt$`);
const NT_SPLIT = new RegExp(`^${NT_BASE}n$`);
const HYPO_EN_CLAUSE = new Set(['if', 'whether', 'unless', 'should', 'might', 'could', 'would', 'will', 'shall',
  'fear', 'fears', 'feared', 'fearing', 'afraid', 'risk', 'risks', 'risked', 'danger', 'dangers', 'threat', 'threats', 'threatened',
  'warn', 'warned', 'predict', 'predicted', 'prediction', 'expect', 'expected', 'meant', 'means',
  'possible', 'possibly', 'potential', 'imagine', 'imagined', 'scenario', 'plan', 'plans', 'planned', 'planning', 'almost', 'nearly']);
const REPORTED_EN = new Set(['said', 'says', 'say', 'claim', 'claims', 'claimed', 'report', 'reports', 'reported', 'announced',
  'told', 'wrote', 'recalled', 'remembered', 'rumour', 'rumours', 'rumor', 'rumors', 'alleged', 'allegedly']);
/* "after the explosion", "since the blast", "in the explosion": the event as a time or topic anchor, not happening. */
const REF_PREP = new Set(['after', 'since', 'before', 'until', 'till', 'following', 'about', 'amid', 'despite', 'regarding', 'in']);
const REF_DET = new Set(['the', 'a', 'an', 'that', 'this', 'these', 'those', 'its', 'his', 'her', 'their', 'our', 'first', 'second', 'last', 'same', 'whole']);
/*
 * Whole-sentence phrases that say it never happened ("said nothing about" sits 4+ words from its keyword), and
 * "nobody has shown ..." whose negation reaches further than -4: Houthi internet 20261015-23e041 put a gunshot under
 * "no one has shown a shot fired at a cable".
 */
const NEVER_HAPPENED = /\b(?:never (?:came|come|happened|happen|exploded|detonated|went off|fired|sounded|arrived)|said nothing about|nothing about|failed to (?:explode|detonate|go off|fire)|(?:no one|nobody|no evidence|no sign|no trace|no record)\b.*\b(?:shown|showed|seen|saw|heard|found|proved|proven|confirmed|recorded|reported))\b/;
const MAY_MONTH_BEFORE = new Set(['in', 'of', 'since', 'until', 'till', 'early', 'late', 'mid', 'by', 'on', 'from', 'through', 'last', 'next', 'during']);
/** Is token i an English negation? ("no" before a number is "No. 4", the reactor's name). */
function negEnAt(list, i) {
  const t = fold(list[i] ?? '');
  if (t === 'no' && /^\d/.test(list[i + 1] ?? '')) return false;
  if (NEG_EN.has(t) || NT_JOINED.test(t)) return true;
  if (NT_SPLIT.test(t) && fold(list[i + 1] ?? '') === 't') return true;
  return t === 't' && NT_SPLIT.test(fold(list[i - 1] ?? ''));
}
/** The keyword's sentence as a token range [a, b] (`sent`: sentence id per token; null = one sentence). */
function sentenceOf(list, first, last, sent) {
  if (!sent) return [0, list.length - 1];
  let a = first;
  let b = last;
  while (a > 0 && sent[a - 1] === sent[first]) a--;
  while (b < list.length - 1 && sent[b + 1] === sent[first]) b++;
  return [a, b];
}
/**
 * Why an English clause keeps a named event from happening on tokens first..last: 'never' | 'negated' |
 * 'hypothetical' | 'reported' | 'backstory' | 'reference', or null when it happens there.
 */
export function clauseBlock(list, first, last = first, sent = null) {
  const [a, b] = sentenceOf(list, first, last, sent);
  const w = (i) => fold(list[i] ?? '');
  if (NEVER_HAPPENED.test(list.slice(a, b + 1).map(fold).join(' '))) return 'never';
  for (let i = Math.max(a, first + EN_WIN[0]); i <= Math.min(b, last + EN_WIN[1]); i++) {
    if (i >= first && i <= last) continue;
    const t = w(i);
    if (negEnAt(list, i)) return 'negated';
    // "may" is a modal, except as the month ("6 May 1986", "in May").
    if (t === 'may' ? !(/^\d/.test(list[i + 1] ?? '') || /^\d/.test(list[i - 1] ?? '') || MAY_MONTH_BEFORE.has(w(i - 1))) : HYPO_EN_CLAUSE.has(t) && !(t === 'could' && PERCEIVE.test(w(i + 1)))) return 'hypothetical';
    // "a warning of an explosion" is feared; "warning shots" (Titanic 20260930-24969b, scene 112) were fired.
    if (/^warnings?$/.test(t) && /^(of|that|about)$/.test(w(i + 1))) return 'hypothetical';
    if (REPORTED_EN.has(t) || (t === 'according' && w(i + 1) === 'to')) return 'reported';
    if (t === 'had' && w(i + 1) !== 'to') return 'backstory';
  }
  const p1 = first - 1 >= a ? w(first - 1) : '';
  const p2 = first - 2 >= a ? w(first - 2) : '';
  const p3 = first - 3 >= a ? w(first - 3) : '';
  if ((REF_PREP.has(p1) && p1 !== 'in') || (REF_PREP.has(p2) && REF_DET.has(p1)) || (REF_PREP.has(p3) && REF_DET.has(p2))) return 'reference';
  return null;
}
/** Narration tokens and the sentence of each; with word timings token k is spoken word k. */
function sayTokens(say, wt = null) {
  const out = [];
  const sent = [];
  if (wt) {
    let s = 0;
    for (const x of wt) {
      out.push(toks(x.word).join(''));
      sent.push(s);
      if (/[.!?…]["'”’)\]]*$/.test(String(x.word ?? '').trim())) s++;
    }
    return { toks: out, sent };
  }
  stripTags(say).split(/(?<=[.!?…])\s+/).forEach((part, n) => {
    for (const t of toks(part)) {
      out.push(t);
      sent.push(n);
    }
  });
  return { toks: out, sent };
}
/* Words that turn "patladı" into a figure of speech: bubbles, scandals, prices, laughter, "bomba gibi". */
const FIGURATIVE = ['balon', 'kriz', 'skandal', 'kahkaha', 'ofke', 'borsa', 'piyasa', 'fiyat', 'satis', 'haber', 'tartisma', 'alkis',
  'gibi', 'sanki', 'adeta', 'kalbi', 'kalp', 'nufus', 'talep', 'enflasyon', 'popul', 'hisse', 'reklam', 'fikir', 'duygu', 'gozyas',
  'dedikodu', 'bubble', 'market', 'price', 'scandal', 'like'];
/*
 * A sound-text word that names a DIFFERENT thing than the library file: a
 * "distress rocket" is a flare, not a Saturn V; a "ship bell" is not a church
 * bell tolling for a funeral; "thunderous crack" is steel, not a storm.
 */
const OTHER_BEFORE = {
  rocket: /^(distress|signal|flare|flares|emergency|warning|firework|fireworks)$/,
  rockets: /^(distress|signal|flare|flares|emergency|warning|firework|fireworks)$/,
  bell: /^(ship|ships|door|bicycle|bike|school|hand|dinner|alarm|brass|small|shop|tram|cow|sleigh|telephone|phone|ship's)$/,
  bells: /^(ship|ships|door|bicycle|bike|school|hand|dinner|alarm|brass|small|shop|tram|cow|sleigh|telephone|phone|ship's)$/,
};
function otherThing(list, j, k) {
  const k0 = String(k.wEn?.[0] ?? '').toLowerCase();
  if (OTHER_BEFORE[k0]?.test(list[j - 1] ?? '')) return true;
  // An adjective made of the word ("thunderous", "explosive") describes, it does not happen.
  const tok = String(list[j] ?? '');
  return /(ous|ive)$/.test(tok) && !/(ous|ive)$/.test(k0);
}

function figurative(list, first, last) {
  for (let i = Math.max(0, first - 2); i <= Math.min(list.length - 1, last + 2); i++) {
    if (i >= first && i <= last) continue;
    const w = fold(list[i]);
    if (FIGURATIVE.some((f) => w.startsWith(f))) return true;
  }
  return false;
}

/**
 * Index of a verb within three words of a keyword that makes it SOUND ("toplar
 * gürledi", "bomba patladı"), or -1. A negated or hypothetical verb ("patlamadı",
 * "ateşlenebilirdi") does not count. The event lands on the verb: the sound is the action.
 */
function actedAt(list, first, last, verbs, sent = null) {
  if (!verbs?.length) return -1;
  for (let i = Math.max(0, first - 3); i <= Math.min(list.length - 1, last + 3); i++) {
    if (i >= first && i <= last) continue;
    if (sent && sent[i] !== sent[first]) continue;
    const w = fold(list[i]);
    const w2 = `${w} ${fold(list[i + 1] ?? '')}`;
    const v = verbs.find((x) => (x.includes(' ') ? w2.startsWith(x) : w.startsWith(x) && verbForm(w, x)));
    if (!v) continue;
    const vEnd = v.includes(' ') ? i + 1 : i;
    if (negated(list, vEnd, '') || hypothetical(list, i, vEnd, '') || clauseBlock(list, i, vEnd, sent)) continue;
    return i;
  }
  return -1;
}
/*
 * English verbs take English endings only: Lula 20261026-29db03's "firecrackers far off" read as 'fire' + "far off"
 * and put a distant explosion (1690) under the runoff result (6:17.8). Turkish stems keep their suffix chains.
 */
const EN_VERBS = new Set(['fire', 'firing', 'shot', 'shoot', 'bang', 'roar', 'boom', 'thunder', 'pound', 'bombard', 'explod', 'blew', 'detonat',
  'blast', 'wail', 'blare', 'sound', 'rang', 'ring', 'toll', 'peal', 'chime', 'march', 'advanc', 'charg', 'stormed', 'gallop', 'rode', 'ride',
  'strike', 'struck', 'crack', 'broke', 'lift', 'launch', 'slam', 'locked', 'applaud', 'cheer']);
const EN_VERB_REST = /^(?:s|es|ed|d|ing|e|er|ers|ion|ions)?$/;
function verbForm(w, x) {
  if (!EN_VERBS.has(x)) return true;
  const rest = w.slice(x.length);
  // a doubled last consonant: "slammed", "popped"
  return EN_VERB_REST.test(rest) || (rest[0] === x.at(-1) && EN_VERB_REST.test(rest.slice(1)));
}

/* Never sonify a suicide; a real killing gets silence rather than a literal gunshot (rulebook). */
const SUICIDE = /(intihar|suicide|canina kiy|kendini (vur|as|oldur))/;
const KILLING = /(olduruldu|oldurdu|katledildi|katletti|infaz|idam|vurularak|hayatini kaybetti|cinayet|murder|killed|shot dead|was killed|died)/;
/*
 * Death in Turkish, checked on the UNFOLDED text: folded, 'öldü' (died) is 'oldu'
 * (happened) and 'ölüyor' is 'oluyor' — every other sentence would count as a killing.
 */
const DEATH_TR = /(^|[^\p{L}])(öl(dü|dür|üyor|ecek|müş|en\b|mek|meden|dükten)|can(ını)? verdi|hayatını kaybetti|cansız bedeni|cesedi bulundu|vur(du|dum|duğ|an\b|ul|arak|mak))/u;
/*
 * Context words the curator lists so an event CAN fire ("polis" for a siren), but
 * which the narration uses all the time without the sound happening ("polis dosyayı
 * kapattı"). Object nouns belong here too: "bende bomba var" (I have a bomb) is not
 * an explosion, "bir top dökümcüsü" (a cannon founder) is not a cannon shot. Alone
 * they are not enough: they need a second context word or a verb that makes the
 * thing sound ("toplar gürledi", "bomba patladı", "çanlar çalmaya başladı").
 */
const WEAK = new Set(['police', 'polis', 'emergency', 'acil', 'crime scene', 'olay yeri', 'patrol', 'devriye', 'mission control', 'görev kontrol',
  'audience', 'seyirci', 'dinleyici', 'speech', 'konuşma', 'lecture', 'konferans', 'presentation', 'sunum', 'award', 'ödül', 'nobel',
  'funeral', 'cenaze', 'midnight', 'gece yarısı', 'radio', 'radyo', 'transmission', 'yayın', 'apollo', 'voyager', 'saturn v', 'titan', 'challenger',
  'launch', 'fırlatma', 'siege', 'kuşatma', 'campaign', 'regiment', 'messenger', 'ulak', 'knight', 'şövalye', 'cathedral', 'katedral',
  'hagia sophia', 'ayasofya', 'prison', 'hapishane', 'cezaevi', 'cell', 'hücre', 'jail', 'army', 'ordu', 'soldiers', 'askerler', 'troops',
  'birlikler', 'landing', 'iniş', 'conquest', 'fetih', 'far off', 'uzaktan', 'charges', 'struck', 'çarptı', 'fired', 'shot', 'storm',
  'fırtına', 'orban', 'orban topu', 'bombard', 'static', 'parazit', 'alarm', 'shelter', 'sığınak', 'wwii', 'ikinci dünya savaşı', 'advanced', 'ilerledi',
  'rider', 'atlı', 'charge', 'hücum', 'victory', 'zafer', 'celebrated', 'kutladı', 'celebration', 'kutlama', 'demonstration', 'gösteri',
  // Objects: present in the story long before (or without) the sound.
  'bomb', 'bomba', 'dynamite', 'dinamit', 'lağım', 'cannon', 'top', 'artillery', 'topçu', 'cannonball', 'gülle', 'pistol', 'tabanca',
  'revolver', 'rövolver', 'bullet', 'police car', 'polis arabası', 'bell', 'çan', 'church bell', 'kilise çanı', 'horse', 'cavalry', 'süvari',
  'sipahi', 'akıncı', 'rocket', 'roket', 'shuttle', 'mekik', 'march', 'marched', 'yürüdü', 'yürüyüş', 'legion', 'lejyon', 'janissaries', 'yeniçeri',
  'toll', 'matem', 'lightning', 'şimşek', 'yıldırım', 'arrested', 'tutuklandı']);
/*
 * The weak words that are THINGS (and names of things): two of them together are still
 * no event — "Orban, topunun surları yıkabileceğini söyledi", "Voyager'ın önünde: Titan".
 * They count only with a verb that makes them sound. Context words ("polis" + "olay yeri")
 * may pair up.
 */
const OBJECTS = new Set(['bomb', 'bomba', 'dynamite', 'dinamit', 'lağım', 'charges', 'cannon', 'top', 'artillery', 'topçu', 'cannonball', 'gülle',
  'orban', 'orban topu', 'bombard', 'pistol', 'tabanca', 'revolver', 'rövolver', 'bullet', 'police car', 'polis arabası', 'bell', 'çan',
  'church bell', 'kilise çanı', 'cathedral', 'katedral', 'hagia sophia', 'ayasofya', 'horse', 'rocket', 'roket', 'shuttle', 'mekik',
  'apollo', 'voyager', 'saturn v', 'titan', 'challenger', 'radio', 'radyo', 'cell', 'hücre', 'prison', 'hapishane', 'cezaevi', 'jail']);

/*
 * Verbs that make an object SOUND, per family (folded prefixes; "a b" spans two
 * words). A family's verbs only count for its own sounds: 'çaldı' rings a bell but
 * never fires a pistol ("tabancayı çaldı" = he stole the pistol).
 */
const ACTION_VERBS = [
  [/\b(gun|silah|kursun|tabanca|pistol|revolver|rovolver|bullet|shot)/, ['ates et', 'ates ed', 'ates ac', 'atesle', 'vurdu', 'vurul', 'vuruldu', 'patla', 'tetig', 'fire', 'firing', 'shot', 'shoot', 'went off', 'bang']],
  [/\b(cannon|top\b|topcu|artiller|gulle|bombard|orban)/, ['atesle', 'ates ac', 'gurle', 'gumbur', 'patla', 'dovdu', 'dovmeye', 'dovuyor', 'yagdi', 'yagmaya', 'fire', 'firing', 'roar', 'boom', 'thunder', 'pound', 'bombard']],
  [/\b(explo|patla|bomb|dinamit|dynamite|blast|infilak|lagim|charges|detonat)/, ['patla', 'infilak', 'havaya uc', 'dustu', 'yagdi', 'yagmaya', 'isabet', 'explod', 'blew', 'went off', 'detonat', 'blast']],
  [/\b(siren|police|polis|alarm|air raid|hava saldiri|civil defense)/, ['ottu', 'otmeye', 'otuyor', 'calmaya', 'caldi', 'caliyor', 'uluy', 'inle', 'wail', 'blare', 'sound', 'went off', 'rang', 'ring']],
  [/\b(bell|can\b|cathedral|katedral|kilise|toll|matem)/, ['calmaya', 'caldi', 'caliyor', 'calin', 'cinla', 'rang', 'ring', 'toll', 'peal', 'chime']],
  [/\b(army|ordu|soldier|asker|troop|birlik|march|yuru|legion|lejyon|janissar|yenicer)/, ['yuru', 'ilerle', 'hucum', 'saldir', 'akin', 'march', 'advanc', 'charg', 'stormed']],
  [/\b(horse|cavalry|suvari|atli|sipahi|akinci|gallop|dortnala|rider)/, ['dortnala', 'hucum', 'surdu', 'surerek', 'kostur', 'gallop', 'charg', 'rode', 'ride']],
  [/\b(thunder|lightning|simsek|yildirim|gok gurultu|storm|firtina)/, ['cakti', 'cakiyor', 'cakan', 'gurle', 'koptu', 'kopar', 'patla', 'strike', 'struck', 'crack', 'broke', 'boom']],
  [/\b(rocket|roket|launch|firlat|shuttle|mekik|saturn|titan)/, ['firlatil', 'havalan', 'kalkti', 'kalkis', 'atesle', 'lift', 'launch', 'blast']],
  [/\b(prison|hapis|cezaevi|cell|jail|hucre|arrest|tutukla|sentenc|mahkum|muebbet)/, ['kapan', 'kilitle', 'hapsed', 'atildi', 'slam', 'locked']],
  [/\b(applause|alkis|audience|seyirci|dinleyici|victory|zafer|celebrat|kutla|cheer|tezahurat)/, ['alkisla', 'ayaga kalk', 'ayakta', 'cosku', 'applaud', 'cheer', 'roar']],
];

/* --------------------------------------------------------------- eras */

const PRESENT = new Date().getUTCFullYear();
const N1 = { bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9 };
const N10 = { on: 10, yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90 };
const NUM_SFX = new Set(['', 'de', 'da', 'te', 'ta', 'den', 'dan', 'ten', 'tan', 'e', 'a', 'ye', 'ya', 'i', 'u', 'in', 'un', 'nin', 'nun',
  'ler', 'lar', 'lerde', 'larda', 'lerin', 'larin', 'li', 'lu', 'deki', 'daki', 'teki', 'taki', 'inci', 'nci', 'uncu', 'ncu']);
function numWord(tok, table) {
  for (const [w, v] of Object.entries(table)) if (tok.startsWith(w) && NUM_SFX.has(tok.slice(w.length))) return v;
  return null;
}
function ordWord(tok, table) {
  for (const [w, v] of Object.entries(table)) if (tok.startsWith(w) && /^(inci|nci|uncu|ncu)$/.test(tok.slice(w.length))) return v;
  return null;
}

/* Words that date a scene without a number. */
const ERA_WORDS = [
  [['antik', 'ancient', 'firavun', 'pharaoh', 'roma imparator', 'roman empire', 'sezar', 'caesar', 'sparta', 'babil', 'babylon', 'mezopotamya', 'piramit', 'pyramid', 'truva', 'troy', 'hitit'], -300],
  [['ortacag', 'medieval', 'middle ages', 'bizans', 'byzantine', 'byzantium', 'hacli', 'crusade', 'selcuklu', 'seljuk', 'viking', 'samuray', 'samurai', 'sovalye', 'knight', 'cengiz', 'genghis'], 1200],
  [['osmanli', 'ottoman', 'padisah', 'ronesans', 'renaissance', 'korsan', 'pirate'], 1550],
  [['viktorya', 'victorian', 'sanayi devrimi', 'industrial revolution', 'buharli', 'steam engine'], 1870],
  [['birinci dunya savasi', 'world war i', 'great war', 'wwi', 'ww1'], 1916],
  [['ikinci dunya savasi', 'world war ii', 'wwii', 'ww2', 'nazi', 'hitler'], 1942],
  [['soguk savas', 'cold war', 'sovyet', 'soviet'], 1965],
  [['internet', 'bitcoin', 'kripto', 'crypto', 'akilli telefon', 'smartphone', 'sosyal medya', 'social media', 'yapay zeka'], 2015],
  [['bugun', 'gunumuz', 'gunumuzde', 'today', 'nowadays'], PRESENT],
];
/*
 * The Turkish era words keep the Turkish suffix matcher ('osmanlılar', 'sovyetler'); every other one is a whole
 * word with at most a plural (27 Ekim 2026): through the suffix matcher "The Houthis claimed hits" (Saudi news
 * 20261011-3c27b1) and "al-Nazili" were Hitler/Nazi = 1942, the Eagle's Nest fire news (20261024-950730) was planned
 * as a 1942 story and got a smooth-sax noir theme.
 */
const ERA_TR = new Set(['antik', 'firavun', 'roma imparator', 'sezar', 'babil', 'mezopotamya', 'piramit', 'truva', 'hitit', 'ortacag', 'bizans', 'hacli',
  'selcuklu', 'samuray', 'sovalye', 'cengiz', 'osmanli', 'padisah', 'ronesans', 'korsan', 'viktorya', 'sanayi devrimi', 'buharli', 'birinci dunya savasi',
  'ikinci dunya savasi', 'soguk savas', 'sovyet', 'kripto', 'akilli telefon', 'sosyal medya', 'yapay zeka', 'bugun', 'gunumuz', 'gunumuzde']);
function eraWordIn(t, w) {
  const ws = words(w);
  if (ERA_TR.has(w)) return findKeyword(t, ws, true) >= 0;
  outer: for (let i = 0; i + ws.length <= t.length; i++) {
    for (let j = 0; j < ws.length; j++) {
      const tok = t[i + j];
      if (tok !== ws[j] && !(j === ws.length - 1 && (tok === `${ws[j]}s` || tok === `${ws[j]}es`))) continue outer;
    }
    return true;
  }
  return false;
}

/* A quantity, not a year: "1000 MW", "1200 t", "1500 km", "2000%". */
const YEAR_UNIT = /^\s?(?:[mgk]w\b|t\b|tons?\b|tonnes?\b|km\b|%|°|kg\b|mph\b|metres?\b|meters?\b)/i;
/* "mid-1986", "pre-1914" are years; "RBMK-1000" is a model number. */
const YEAR_PREFIX = /(?:^|[^\p{L}])(?:mid|pre|post|early|late|circa|c)[-–]$/iu;
/** Digit years only: "1453", "the 1970s", "1929-1933" — never a model number, a quantity or a decimal. */
function digitYears(raw) {
  const at = [];
  // A range is two years ("1914–1918", "1929-33"): both ends count.
  const rest = raw.replace(/(?<![\p{L}\d.,\-–])(1\d{3}|20\d{2})\s?[-–]\s?(1\d{3}|20\d{2}|\d{2})(?![\d\p{L}]|[.,]\d)/gu, (all, a, b, i) => {
    const y1 = Number(a);
    const y2 = b.length === 2 ? Math.floor(y1 / 100) * 100 + Number(b) : Number(b);
    if (!(y2 > y1 && y2 - y1 <= 200)) return all;
    at.push([i, y1], [i + 1, y2]);
    return ' '.repeat(all.length);
  });
  // A year may end a clause ("February 2009, two boats…", "in 2009."): only a digit after it, or a separator
  // followed by a digit ("2,009", "2009.5"), makes it a number. The old (?![\d.,]) missed every such year, so the
  // 2009 submarine film (20261024-373aaf) planned its music with no period at all ("dönem ?").
  // Nor is it a year when glued to a word or a number before it ("RBMK-1000" read as year 1000 and dated 16
  // Chernobyl scenes, 20261026-24122a) or followed by "-digit" or a unit ("1000 MW").
  for (const m of rest.matchAll(/(?<![\p{L}\d.,])(1\d{3}|20\d{2})(?!\d|[.,]\d|[-–]\d)/gu)) {
    const before = rest.slice(Math.max(0, m.index - 8), m.index);
    if (/[-–]$/.test(before) && !YEAR_PREFIX.test(before)) continue;
    if (YEAR_UNIT.test(rest.slice(m.index + 4, m.index + 12))) continue;
    at.push([m.index, Number(m[1])]);
  }
  return at.sort((a, b) => a[0] - b[0]).map(([, y]) => y);
}

/**
 * Years a text names: digits (1453, 1970s), spelled Turkish ("bin dokuz yüz yetmiş dört"), centuries — and only
 * when none of these is there, era words. A named year wins: "the Soviet press in 1986" is 1986, not the Soviet
 * era's 1965 (Chernobyl 20261026-24122a was planned as a 1976 story).
 */
export function yearsIn(text) {
  const raw = String(text ?? '');
  const out = digitYears(raw);
  for (const m of raw.matchAll(/(\d{1,2})(?:st|nd|rd|th)[\s-]+century/gi)) out.push((Number(m[1]) - 1) * 100 + 50);
  for (const m of raw.matchAll(/(\d{1,2})\.\s*y[üu]zy[ıi]l/gi)) out.push((Number(m[1]) - 1) * 100 + 50);
  const t = words(raw);
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 'bin') {
      let base = 1000;
      const pv = t[i - 1] ?? '';
      if (numWord(pv, { iki: 2 }) === 2) base = 2000;
      else if (numWord(pv, N1) || numWord(pv, N10) || pv.startsWith('yuz')) continue; // "on bin", "üç bin": a count
      let y = base;
      let j = i + 1;
      const h = numWord(t[j] ?? '', N1);
      if (h && (t[j + 1] ?? '').startsWith('yuz')) { y += h * 100; j += 2; }
      else if (numWord(t[j] ?? '', { yuz: 100 })) { y += 100; j += 1; }
      const tn = numWord(t[j] ?? '', N10);
      if (tn) { y += tn; j++; }
      const on = numWord(t[j] ?? '', N1);
      if (on) y += on;
      if (y !== base && y >= 1000 && y <= 2100) out.push(y);
    }
    if (t[i].startsWith('yuzyil')) {
      let n = ordWord(t[i - 1] ?? '', { ...N1, ...N10 });
      if (n !== null && n < 10 && numWord(t[i - 2] ?? '', N10)) n += numWord(t[i - 2], N10);
      if (n) out.push((n - 1) * 100 + 50);
    }
  }
  if (out.length) return out;
  // Era words: 'osmanlılar' dates a scene, 'nazik' (kind), 'hits' and 'al-Nazili' do not.
  for (const [ws, y] of ERA_WORDS) if (ws.some((w) => eraWordIn(t, w))) out.push(y);
  return out;
}

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** The story year of each scene: the latest year named so far, else the script's own centre. */
export function sceneYears(script) {
  const scenes = script?.scenes ?? [];
  const per = scenes.map((sc) => {
    const ys = yearsIn([sc.say, sc.sound, sc.text, sc.title, sc.kicker].filter(Boolean).join(' '));
    if (sc.type === 'counter' && sc.year && Number.isFinite(sc.to)) ys.push(sc.to);
    return ys;
  });
  const meta = yearsIn([script?.title, script?.musicHint, script?.year, ...(script?.chapters ?? [])].filter(Boolean).join(' '));
  let cur = median(meta.length ? meta : per.flat());
  return per.map((ys) => {
    if (ys.length) cur = ys.at(-1);
    return cur;
  });
}

/* Era tags on a sound -> year ranges it belongs to (null = timeless). Rulebook: modern never before 1900,
   industrial never before 1800, pre-industrial for stories before ~1850 unless literally named. */
function parseEra(era) {
  const items = (Array.isArray(era) ? era : era == null ? [] : [era]).map((e) => fold(e).trim()).filter(Boolean);
  if (!items.length) return null;
  const R = [];
  for (const e of items) {
    if (/^(any|all|timeless|universal|nature|natural|none|generic|every)/.test(e)) return null;
    let m;
    if ((m = e.match(/^(\d{3,4})\s*[-–]\s*(\d{3,4})$/))) R.push([+m[1], +m[2]]);
    else if ((m = e.match(/^(\d{3})0'?s$/))) R.push([+m[1] * 10, +m[1] * 10 + 9]);
    else if ((m = e.match(/^(\d{1,2})(st|nd|rd|th)/))) R.push([(+m[1] - 1) * 100, (+m[1] - 1) * 100 + 99]);
    else if (/pre.?industrial|premodern|pre.?modern/.test(e)) R.push([-3000, 1850]);
    else if (/ancient|antik|classical|antiquity/.test(e)) R.push([-3000, 600]);
    else if (/medieval|middle ages|ortacag/.test(e)) R.push([500, 1500]);
    else if (/early.?modern|renaissance|ottoman|osmanli/.test(e)) R.push([1400, 1850]);
    else if (/industrial|victorian/.test(e)) R.push([1800, 3000]);
    else if (/contemporary|present|today|current|guncel/.test(e)) R.push([1980, 3000]);
    else if (/modern|20th|21st/.test(e)) R.push([1900, 3000]);
    else if (/future|sci.?fi|space|uzay/.test(e)) R.push([1957, 3000]);
    else if (/histor|period|old|tarihi/.test(e)) R.push([-3000, 1880]);
  }
  return R.length ? R : null;
}

/* Sounds that cannot exist before a date — traffic, a siren or a typewriter under 1453 is a howler. */
const ANACHRONISM = [
  [1860, ['car', 'cars', 'traffic', 'engine', 'motor', 'siren', 'phone', 'telephone', 'radio', 'tv', 'television', 'electric', 'electricity', 'fluorescent',
    'computer', 'office', 'keyboard', 'printer', 'air conditioner', 'helicopter', 'airplane', 'aircraft', 'plane', 'jet', 'train', 'tram', 'subway',
    'metro', 'highway', 'typewriter', 'factory', 'machinery', 'neon', 'glitch', 'static', 'shutter', 'camera', 'trafik', 'araba', 'otomobil', 'korna',
    'telefon', 'radyo', 'televizyon', 'bilgisayar', 'ofis', 'klavye', 'helikopter', 'ucak', 'tren', 'tramvay', 'otoyol', 'daktilo', 'fabrika',
    'makine', 'klima', 'elektrik', 'parazit', 'polis']],
  [1925, ['traffic', 'siren', 'radio', 'tv', 'television', 'helicopter', 'jet', 'subway', 'highway', 'computer', 'fluorescent', 'neon', 'keyboard',
    'printer', 'air conditioner', 'trafik', 'radyo', 'televizyon', 'helikopter', 'otoyol', 'bilgisayar', 'klavye', 'klima']],
  [1985, ['computer', 'keyboard', 'smartphone', 'notification', 'server', 'data center', 'bilgisayar', 'klavye', 'akilli telefon', 'bildirim', 'sunucu']],
];
const SPACE = /\b(space|spaceship|spacecraft|sci ?fi|futuristic|laser|alien|uzay)\b/;
const WEATHER = /\b(rain\w*|storm\w*|blizzard|snow\w*|thunder\w*|drizzle|downpour|lightning|yagmur\w*|firtina\w*|tipi|kar|saganak|ciseleme|simsek|gok gurultu\w*|yildirim)\b/;
const TEXTURE = /\b(heartbeat|kalp atisi|ticking|tick tock)\b/;

/**
 * Does a sound belong to the story's year? `literal` = the scene's own sound text
 * names this very thing: an old sound (a horse) may play in a later story then,
 * but a modern one (traffic) never plays in an older story.
 */
function eraConflict(s, year, soundText, literal) {
  if (year == null) return false;
  if (s.eraR && !s.eraR.some(([a, b]) => year >= a - 10 && year <= b + 10)) {
    const older = s.eraR.every(([, b]) => b < year);
    if (!(older && literal)) return true;
  }
  for (const [before, list] of ANACHRONISM) {
    if (year >= before) continue;
    for (const w of list) if (s.text.includes(` ${w} `) && !soundText.includes(` ${w}`)) return true;
  }
  return false;
}

/* ------------------------------------------------------------- library */

const list = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;|]/) : []).map((x) => String(x).trim()).filter(Boolean);
const KIND_OF = [
  ['bed', /bed|ambien|room.?tone|atmos|backdrop/],
  ['stinger', /sting|jump.?scare|scare/],
  ['thud', /thud|low.?hit|sub.?drop|body.?blow/],
  ['riser', /riser|rise|build.?up|uplift/],
  ['whoosh', /whoosh|swoosh|swish|swipe|pass.?by/],
  ['swell', /swell|reverse/],
  ['snap', /snap|shutter|click/],
  ['ticks', /tick|clock/],
  ['glitch', /glitch|static|digital/],
  ['hit', /hit|impact|boom|braam|slam|punch/],
  ['event', /event|one.?shot|foley|literal/],
];
const INTENSITY_WORD = { subtle: 1, soft: 1.5, low: 1.5, light: 1.5, gentle: 1.5, medium: 3, mid: 3, moderate: 3, normal: 3, high: 4.5, hard: 4.5, strong: 4.5, heavy: 4.5, extreme: 5, max: 5 };

function normSfx(s, idx, abs, scale) {
  const k = fold(s.kind ?? '').trim();
  // 'foley' and 'logo' are the engine's own synthesized sounds: never a transition, a bed or a literal event.
  const kind = SFX_KINDS.includes(k) || ['bed', 'event', 'foley', 'logo'].includes(k) ? k : KIND_OF.find(([, re]) => re.test(`${k} ${fold(s.role ?? '')}`))?.[0] ?? 'event';
  let intensity = s.intensity;
  if (typeof intensity === 'string') intensity = INTENSITY_WORD[fold(intensity).trim()] ?? (Number(intensity) || 3);
  else if (typeof intensity === 'number') intensity *= scale;
  else intensity = 3;
  intensity = clamp(intensity, 0, 5);
  const kw = list(s.keywords).map((raw) => {
    const low = lowerTr(raw).trim();
    return { raw, w: toks(raw), wEn: toksEn(raw), f: fold(raw), weak: WEAK.has(low) || OBJECTS.has(low), object: OBJECTS.has(low) };
  }).filter((x) => x.w.length);
  const anyOf = (v) => {
    const l = list(v).map((x) => fold(x));
    return l.some((x) => /^(all|any|every|hepsi)$/.test(x)) ? [] : l;
  };
  const text = ` ${words([s.role, s.title, s.slug, ...list(s.keywords), basename(String(s.file))].filter(Boolean).join(' ')).join(' ')} `;
  /*
   * What the sound IS: the curator's slug and keywords. Not the role ('one_shot'
   * would make every event a "shot") and not the store title ("Gun explosion with
   * long echo" is a cannon, "Shot light explosion" a pistol).
   */
  const what = ` ${words([s.slug || s.title, ...list(s.keywords)].filter(Boolean).join(' ')).join(' ')} `;
  const own = ` ${words([s.slug || s.title].filter(Boolean).join(' ')).join(' ')} `;
  return {
    ...s, idx, kind, kw, text, abs: abs(s.file), intensity,
    genresN: anyOf(s.genres), moodsN: anyOf(s.moods), typesN: anyOf(s.scene_types),
    eraR: parseEra(s.era),
    literal: s.literal_only === true || s.literal_only === 'true',
    violent: /\b(explo\w*|patla\w*|bomb\w*|cannon\w*|gunshot\w*|gunfire|silah\w*|kursun\w*|shot|shots|artiller\w*|topcu\w*|blast\w*|grenade\w*|ates ac\w*|top ates\w*|kilic\w*|sword\w*|scream\w*|ciglik\w*|thunder\w*|siren\w*)\b/.test(what) || intensity >= 4.5,
    gunshot: /\b(gunshot\w*|gunfire|silah sesi|pistol|tabanca\w*|revolver|rovolver)\b/.test(what),
    weather: WEATHER.test(own) || (s.kind === 'bed' && WEATHER.test(text) && !/room|interior|office|crowd|city/.test(own)),
    texture: TEXTURE.test(own),
    ownW: new Set(own.trim().split(' ').filter(Boolean)),
    crowdy: /\b(crowd\w*|walla|people|market|bazaar|traffic|city|street|cheer\w*|applause)\b/.test(own),
    // 'can' is the folded 'çan' (bell) — whole word, or 'cannon' would lead in like a siren instead of landing on the word.
    preroll: /\b(siren\w*|bell\w*|can|canlar\w*|applause|alkis\w*|cheer\w*|crowd|tezahurat\w*|clapping)\b/.test(own) ? 0.5 : 0,
    verbs: [...new Set(ACTION_VERBS.filter(([re]) => re.test(what)).flatMap(([, v]) => v))],
  };
}

/* The rulebook's "Genre default beds: crime 2678 (night) or 1173 (interior); horror 2482; ..." line, as ids per style. */
function parseDefaultBeds(text) {
  const m = String(text ?? '').match(/genre default beds?:([^\n]*)/i);
  if (!m) return {};
  const out = {};
  for (const part of m[1].split(';')) {
    const g = GENRES.find((x) => new RegExp(`\\b${x}\\b`, 'i').test(part));
    if (!g) continue;
    out[g] = [...part.matchAll(/(after|before|since)?\s*\b(\d{2,5})\b/gi)].filter((x) => !x[1]).map((x) => x[2]);
  }
  return out;
}

const PREP = new WeakMap();
function prep(lib, root) {
  const base = root ?? lib?.root ?? '.';
  if (!lib) return { music: [], sfx: [], rules: {}, ruleText: '', defaults: {}, byId: new Map(), root: base, kindRef: {} };
  const hit = PREP.get(lib);
  if (hit && hit.root === base) return hit;
  const abs = (f) => (isAbsolute(String(f)) ? String(f) : join(base, String(f)));
  // Banned music never reaches a pool; every track carries its seriousness class (seriousClass, R1-R11). A master too
  // quiet to lift (musicTooQuiet: Sad Trio, -36.4 LUFS) never reaches it either: renderScore plays silence for it, and
  // as the best grief track it was planned onto death lines (Hastings 12:45, Saudi 15:51: 27-40 s holes, 27 Ekim 2026).
  const music = (lib.music ?? []).filter((m) => m && m.file && m.id && !MUSIC_BANNED.test(`${m.title ?? ''} ${m.file}`) && !musicTooQuiet(m))
    .map((m) => ({ ...m, abs: abs(m.file), energy: Array.isArray(m.energy) ? m.energy : [], serious: seriousClass(m), verify: VERIFY_LIST.test(`${m.title ?? ''} ${m.file}`) }));
  const ints = (lib.sfx ?? []).map((s) => s?.intensity).filter((v) => typeof v === 'number');
  const top = ints.length ? Math.max(...ints) : 5;
  const scale = top <= 1 ? 5 : top <= 3 ? 5 / 3 : top <= 5 ? 1 : 5 / top;
  const sfx = (lib.sfx ?? []).filter((s) => s && s.file && !SFX_BANNED.test(`${s.file} ${s.id ?? ''}`)).map((s, i) => normSfx(s, i, abs, scale));
  const obj = lib.sfxRules && typeof lib.sfxRules === 'object' && !Array.isArray(lib.sfxRules) ? lib.sfxRules : {};
  const ruleText = typeof lib.sfxRules === 'string' ? lib.sfxRules : Array.isArray(lib.sfxRules) ? lib.sfxRules.join('\n') : '';
  const defaults = { ...parseDefaultBeds(ruleText) };
  for (const g of GENRES) if (Array.isArray(obj.genres?.[g]?.defaultBeds)) defaults[g] = obj.genres[g].defaultBeds.map(String);
  // Each kind's typical curator level: a file's own gain_db is read relative to it.
  const kindRef = {};
  for (const k of SFX_KINDS) kindRef[k] = median(sfx.filter((s) => s.kind === k && typeof s.gain_db === 'number').map((s) => s.gain_db));
  const p = { music, sfx, rules: obj, ruleText, defaults, byId: new Map(music.map((m) => [m.id, m])), root: base, kindRef };
  PREP.set(lib, p);
  return p;
}

const fileOk = (f) => {
  try {
    return statSync(f).size > 0;
  } catch {
    return false;
  }
};

/**
 * Read the library index. Entries whose audio is missing (a download still in
 * progress, a deleted file) are dropped here, so nothing downstream can pick
 * a sound that is not on disk. Null when there is nothing usable.
 */
export function loadLibrary(root) {
  if (!root) return null;
  const index = join(root, 'library.json');
  if (!existsSync(index)) return null;
  let lib;
  try {
    lib = JSON.parse(readFileSync(index, 'utf8'));
  } catch {
    return null;
  }
  const ok = (e) => e && typeof e.file === 'string' && fileOk(isAbsolute(e.file) ? e.file : join(root, e.file));
  const music = (Array.isArray(lib.music) ? lib.music : []).filter(ok);
  const sfx = (Array.isArray(lib.sfx) ? lib.sfx : []).filter(ok);
  if (!music.length && !sfx.length) return null;
  return { version: lib.version ?? 1, music, sfx, sfxRules: lib.sfxRules ?? null, root };
}

/** Where the library lives: option > NOVA_AUDIO_LIB > <NOVA_HOME>/data/audio-library. */
export function libraryRoot(o = {}) {
  if (o.audioLibrary) return o.audioLibrary;
  if (process.env.NOVA_AUDIO_LIB) return process.env.NOVA_AUDIO_LIB;
  const home = process.env.NOVA_HOME || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  return join(home, 'data', 'audio-library');
}

function ffmpegPath(ff) {
  if (typeof ff === 'string' && ff) return ff;
  if (process.env.NOVA_FFMPEG) return process.env.NOVA_FFMPEG;
  try {
    return createRequire(import.meta.url)('ffmpeg-static') || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
}

/*
 * A deadline on every ffmpeg: a hung one blocked the engine until Nova's 25-minute stall watchdog (submarine job
 * 373aaf, Oct 2026). 180 s for a track, an effect or a bed; the score mix gets one that grows with its length.
 */
const FF_TIMEOUT_MS = 180_000;
function run(bin, args, opts = {}) {
  const timeout = opts.timeout ?? FF_TIMEOUT_MS;
  const r = spawnSync(bin, ['-nostdin', ...args], { encoding: opts.encoding ?? 'utf8', maxBuffer: 1 << 28, windowsHide: true, ...opts, timeout });
  if (r.error?.code === 'ETIMEDOUT') r.error.message = `ffmpeg ${Math.round(timeout / 1000)} sn içinde bitmedi, durduruldu (${r.error.message})`;
  return r;
}

/**
 * Integrated loudness, max momentary loudness and sample peak (ebur128 prints on stderr even on success).
 * A run killed at its deadline throws: its frames so far would be read (and cached) as the whole file's.
 */
function loudness(bin, file, { ss = 0, dur = null, loop = false, chain = null, momentary = false } = {}) {
  const af = [chain, momentary ? 'apad=pad_dur=0.5' : null, `ebur128=peak=sample${momentary ? ':framelog=info' : ''}`].filter(Boolean).join(',');
  const r = run(bin, ['-hide_banner', '-nostats', ...(loop ? ['-stream_loop', '-1'] : []), ...(ss ? ['-ss', ss.toFixed(3)] : []), ...(dur ? ['-t', dur.toFixed(3)] : []), '-i', file, '-af', af, '-f', 'null', '-']);
  if (r.error?.code === 'ETIMEDOUT') throw r.error;
  const text = String(r.stderr ?? '');
  const sum = text.slice(Math.max(0, text.lastIndexOf('Summary:')));
  const I = Number((sum.match(/I:\s+(-?[\d.]+) LUFS/) ?? [])[1]);
  const P = Number((sum.match(/Peak:\s+(-?[\d.]+) dBFS/) ?? [])[1]);
  let maxM = -Infinity;
  if (momentary) {
    for (const m of text.matchAll(/M:\s*(-?[\d.]+)/g)) {
      const v = Number(m[1]);
      if (v > -70 && v > maxM) maxM = v;
    }
  }
  return { I: Number.isFinite(I) && I > -70 ? I : null, peak: Number.isFinite(P) ? P : null, maxM: Number.isFinite(maxM) ? maxM : null };
}

/**
 * The loudness of a bed or event. From the library when it was measured at
 * ingest; otherwise measured once with ffmpeg and remembered next to the
 * library (older ingests stored lufs: null). Pass `measure: false` for a
 * strictly pure call — levels then fall back to typical values.
 */
function levelsOf(L, s, o) {
  if (Number.isFinite(s.lufs) && (Number.isFinite(s.lufsMax) || s.kind === 'bed')) return { lufs: s.lufs, lufsMax: s.lufsMax ?? s.lufs + 6, onset: num(s.onset, 0) };
  if (o.measure === false) return { lufs: num(s.lufs, null), lufsMax: num(s.lufsMax, null), onset: num(s.onset, 0) };
  const cacheFile = join(o.cacheDir ?? join(L.root, '.norm'), 'levels.json');
  L.levelCache ??= (() => {
    try {
      return JSON.parse(readFileSync(cacheFile, 'utf8'));
    } catch {
      return {};
    }
  })();
  let st;
  try {
    st = statSync(s.abs);
  } catch {
    return { lufs: null, lufsMax: null, onset: 0 };
  }
  const key = `${s.abs}|${st.size}|${Math.round(st.mtimeMs)}`;
  if (!L.levelCache[key]) {
    const bin = ffmpegPath(o.ff);
    const m = loudness(bin, s.abs, { dur: 60, momentary: true });
    const env = envelopeInfo(bin, s.abs, 60);
    L.levelCache[key] = { lufs: m.I, lufsMax: m.maxM, onset: env.onset };
    try {
      mkdirSync(dirname(cacheFile), { recursive: true });
      writeFileSync(`${cacheFile}.tmp`, JSON.stringify(L.levelCache));
      renameSync(`${cacheFile}.tmp`, cacheFile);
    } catch {}
  }
  const c = L.levelCache[key];
  return { lufs: num(s.lufs, c.lufs), lufsMax: num(s.lufsMax, c.lufsMax), onset: num(s.onset, num(c.onset, 0)) };
}

/**
 * Where the loudest 10 ms sits, where the sound starts (within 30 dB of it) and how long it is.
 * A run killed at its deadline throws: its zeros would be cached (levels.json, an effect's sidecar) as the file's.
 */
function envelopeInfo(bin, file, maxSec = null) {
  const SR = 8000;
  const r = run(bin, ['-hide_banner', '-loglevel', 'error', ...(maxSec ? ['-t', String(maxSec)] : []), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { encoding: 'buffer' });
  if (r.error?.code === 'ETIMEDOUT') throw r.error;
  if (r.status !== 0 || !r.stdout?.length) return { peakAt: 0, onset: 0, dur: 0 };
  const x = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 1);
  const hop = SR / 100;
  const env = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) e += x[j] * x[j];
    env.push(e);
  }
  const top = env.length ? Math.max(...env) : 0;
  return { peakAt: r3(Math.max(0, env.indexOf(top)) / 100), onset: r3(Math.max(0, env.findIndex((e) => e >= top * 1e-3)) / 100), dur: r3(x.length / SR) };
}

/* ---------------------------------------------------------- timeline */

function sceneSecondsOf(script, sceneSeconds) {
  const sc = script?.scenes ?? [];
  if (Array.isArray(sceneSeconds) && sceneSeconds.length === sc.length) return sceneSeconds.map((v) => Math.max(0, Number(v) || 0));
  // Same rule as the engine: a scene is at least its written length and never shorter than its voice + breath.
  return sc.map((s) => Math.max(Number(s.dur) || 0, (Number(s.voiceDur) || 0) + 0.4));
}

function timeline(scenes, secs) {
  let at = 0;
  let chapter = 0;
  const out = [];
  scenes.forEach((sc, i) => {
    if (Number.isInteger(sc.chapter)) chapter = sc.chapter;
    const mood = MOODS.includes(sc.mood) ? sc.mood : 'curious';
    const len = secs[i];
    if (len > 0) {
      out.push({
        i, from: at, to: at + len, len, mood, fam: FAMILY[mood], chapter, silence: !!sc.silence, type: sc.type,
        mainTitle: sc.type === 'title' && !sc.chapterCard, card: sc.type === 'title' && !!sc.chapterCard,
      });
    }
    at += len;
  });
  return out;
}

/* ------------------------------------------------------------ music plan */

function mkRun(units, extra = {}) {
  const wm = {};
  const wf = {};
  for (const u of units) {
    wm[u.mood] = (wm[u.mood] ?? 0) + u.len;
    wf[u.fam] = (wf[u.fam] ?? 0) + u.len;
  }
  // Ties go to the earlier-listed mood so the result never depends on object order.
  const mood = MOODS.reduce((b, m) => ((wm[m] ?? 0) > (wm[b] ?? 0) ? m : b), units[0].mood);
  let fam = FAMILY[mood];
  for (const f of Object.keys(wf)) if (wf[f] > (wf[fam] ?? 0)) fam = f;
  return { units, from: units[0].from, to: units.at(-1).to, len: units.at(-1).to - units[0].from, mood, fam, weights: wm, chapter: units[0].chapter, ...extra };
}

function mergeInto(runs, k, into) {
  const [a, b] = into < k ? [runs[into], runs[k]] : [runs[k], runs[into]];
  runs.splice(Math.min(k, into), 2, mkRun([...a.units, ...b.units], { cold: !!(a.cold && b.cold), silence: false }));
}

/** Mood runs inside one block (one chapter, no silence), with every short swing folded away. */
function familyRuns(units, hold = MIN_HOLD) {
  const runs = [];
  for (const u of units) {
    const last = runs.at(-1);
    if (last && last.fam === u.fam) last.units.push(u);
    else runs.push({ fam: u.fam, units: [u] });
  }
  const rs = runs.map((r) => mkRun(r.units));
  for (;;) {
    if (rs.length < 2) break;
    let k = -1;
    for (let j = 0; j < rs.length; j++) if (rs[j].len < hold && (k < 0 || rs[j].len < rs[k].len)) k = j;
    if (k < 0) break;
    const a = rs[k - 1];
    const b = rs[k + 1];
    let into;
    if (!a) into = k + 1;
    else if (!b) into = k - 1;
    // A reveal is the turn itself: it opens the next cue when the story changes after it,
    // and belongs to the build-up when the same feeling carries on.
    else if (rs[k].fam === 'peak') into = b.fam !== a.fam ? k + 1 : k - 1;
    else into = compat(rs[k].fam, a.fam) + a.len / 600 >= compat(rs[k].fam, b.fam) + b.len / 600 ? k - 1 : k + 1;
    mergeInto(rs, k, into);
    // Neighbours that now feel the same are one cue.
    for (let j = rs.length - 1; j > 0; j--) if (rs[j].fam === rs[j - 1].fam) mergeInto(rs, j, j - 1);
  }
  return rs;
}

/**
 * Where the music changes. Hard boundaries: chapter changes (the chapter card
 * is where a new cue enters), silence scenes and the end of the cold open.
 * Inside a chapter only a mood FAMILY held for `hold` seconds earns a new cue
 * (v1 20 s, v2 35 s); with `maxRate` the film is held to that many cue
 * changes a minute by folding the shortest in-chapter turns into a neighbour
 * of the same chapter (a chapter card is never folded away).
 */
function planRuns(units, { hold = MIN_HOLD, maxRate = null } = {}) {
  const t0 = units.findIndex((u) => u.mainTitle);
  const coldAt = t0 > 0 && units[t0].from >= 3 && units[t0].from <= COLD_OPEN_MAX && units.slice(0, t0).every((u) => u.chapter === units[0].chapter) ? units[t0].i : null;
  const blocks = [];
  for (const u of units) {
    const kind = u.silence ? 'silence' : 'music';
    const cold = coldAt !== null && u.i < coldAt;
    const last = blocks.at(-1);
    const brk = !last || last.kind !== kind || (kind === 'music' && (u.chapter !== last.chapter || last.cold !== cold));
    if (brk) blocks.push({ kind, cold, chapter: u.chapter, units: [u] });
    else last.units.push(u);
  }
  let runs = [];
  for (const b of blocks) {
    if (b.kind === 'silence') runs.push(mkRun(b.units, { silence: true, cold: b.cold }));
    else if (b.cold) runs.push(mkRun(b.units, { cold: true }));
    else runs.push(...familyRuns(b.units, hold));
  }
  // A chapter too short to carry its own cue rides on its neighbour's.
  for (;;) {
    const k = runs.findIndex((r) => !r.silence && !r.cold && !r.keepShort && r.len < MIN_CUE);
    if (k < 0) break;
    const a = runs[k - 1] && !runs[k - 1].silence && !runs[k - 1].cold ? runs[k - 1] : null;
    const b = runs[k + 1] && !runs[k + 1].silence ? runs[k + 1] : null;
    if (!a && !b) {
      // Boxed in by silences: it stays a short cue of its own.
      runs[k].keepShort = true;
      continue;
    }
    const into = !b ? k - 1 : !a ? k + 1 : compat(runs[k].fam, a.fam) >= compat(runs[k].fam, b.fam) ? k - 1 : k + 1;
    mergeInto(runs, k, into);
  }
  if (maxRate > 0 && units.length) {
    const cap = Math.max(1, Math.floor((maxRate * (units.at(-1).to - units[0].from)) / 60));
    const mate = (k, j) => runs[j] && !runs[j].silence && !runs[j].cold && runs[j].chapter === runs[k].chapter;
    for (;;) {
      if (runs.filter((r) => !r.silence).length - 1 <= cap) break;
      let k = -1;
      for (let j = 0; j < runs.length; j++) if (!runs[j].silence && !runs[j].cold && (mate(j, j - 1) || mate(j, j + 1)) && (k < 0 || runs[j].len < runs[k].len)) k = j;
      if (k < 0) break;
      const a = mate(k, k - 1) ? runs[k - 1] : null;
      const b = mate(k, k + 1) ? runs[k + 1] : null;
      const into = !b ? k - 1 : !a ? k + 1 : compat(runs[k].fam, a.fam) + a.len / 600 >= compat(runs[k].fam, b.fam) + b.len / 600 ? k - 1 : k + 1;
      mergeInto(runs, k, into);
    }
  }
  runs = runs.map((r) => ({ ...r, bounds: r.units.slice(1).map((u) => u.from) }));
  const lastMusic = runs.map((r) => !r.silence).lastIndexOf(true);
  runs.forEach((r, k) => {
    r.final = k === lastMusic;
    const s = runs[k - 1];
    const p = runs[k - 2];
    if (!r.silence && s?.silence && s.len <= RESUME_MAX_SILENCE && p && !p.silence && p.fam === r.fam && p.chapter === r.chapter) r.resume = true;
  });
  return runs;
}

/**
 * Where the narrator speaks, in video seconds: one busy span per voiced scene
 * (first word to the end of the line) and the pauses inside it (a gap of
 * 0.45 s or more between two words, after the first word has had time to end).
 */
function speechMap(scenes, secs) {
  const busy = [];
  const pauses = [];
  let at = 0;
  scenes.forEach((sc, i) => {
    const wt = (Array.isArray(sc.wordTimes) ? sc.wordTimes : []).filter((w) => w && Number.isFinite(w.t) && !/^\[.*\]$/.test(String(w.word).trim()));
    const dur = Number(sc.voiceDur) || 0;
    if (sc.say && dur > 0) {
      busy.push([at + (wt[0]?.t ?? 0), at + dur]);
      for (let k = 0; k + 1 < wt.length; k++) {
        const end = wt[k].t + Math.min(0.6, 0.07 * String(wt[k].word).length);
        if (wt[k + 1].t - end >= 0.45) pauses.push(at + (end + wt[k + 1].t) / 2);
      }
    }
    at += secs[i] ?? 0;
  });
  return { busy, pauses };
}

/** The latest moment in [lo, hi] where no word is being said: outside every line, else a pause inside one, else `hi`. */
function quietPoint(speech, lo, hi) {
  if (!speech || !(hi > lo)) return hi;
  const free = (t) => !speech.busy.some(([a, b]) => t > a - 0.1 && t < b + 0.1);
  for (let t = hi; t >= lo; t -= 0.1) if (free(t)) return r3(t);
  const p = speech.pauses.filter((t) => t >= lo && t <= hi);
  return p.length ? r3(p.at(-1)) : hi;
}

/* Where a track's music actually starts and whether it ends on its own (not a hard stop). */
const leadIn = (E) => Math.max(0, E.findIndex((v) => v > -30));
function endsNaturally(E) {
  if (E.length < 20) return false;
  return mean(E.slice(-5)) < -15 && mean(E.slice(-15, -7)) > -12;
}
function contrast(E) {
  if (E.length < 6) return 0.3;
  const mid = [...E.slice(leadIn(E), Math.max(leadIn(E) + 3, E.length - 6))].sort((a, b) => a - b);
  return clamp((mid[Math.floor(mid.length * 0.9)] - mid[Math.floor(mid.length * 0.1)]) / 20, 0, 1);
}
function striking(t, genre) {
  const f = t.tags.moodFit ?? {};
  const we = STRIKE_ENERGY[genre] ?? 0.5;
  const drive = genre === 'horror' ? f.dread ?? 0 : genre === 'inspire' ? Math.max(f.sad ?? 0, f.triumph ?? 0) : Math.max(f.tension ?? 0, f.reveal ?? 0, f.dread ?? 0, f.triumph ?? 0);
  return we * ((Number(t.tags.energy) || 3) / 5) + 0.25 * contrast(t.energy) + (0.75 - we) * drive;
}

/**
 * How well a stretch of a track fits the cue: tension wants a rise, calm an
 * even stretch below the climax, a peak the loud part, a cold open a hit that
 * arrives early. Silence inside the stretch is always bad.
 */
function windowFit(E, s, len, cue) {
  const w = E.slice(s, s + Math.max(1, Math.round(len)));
  if (!w.length) return -1;
  const m = mean(w);
  const third = Math.max(1, Math.floor(w.length / 3));
  const a = mean(w.slice(0, third));
  const b = mean(w.slice(-third));
  const mx = Math.max(...w);
  const mn = Math.min(...w);
  let f = -1.2 * (w.filter((v) => v < -30).length / w.length);
  if ((E[s] ?? -60) < -30) f -= 0.3;
  if (cue.cold) {
    const head = w.slice(0, Math.max(2, Math.ceil(w.length * 0.4)));
    const hm = Math.max(...head);
    f += (hm >= -2 ? 0.5 : 0) + clamp((hm - w[0]) / 12, 0, 1) * 0.3 + clamp((m + 12) / 12, 0, 1) * 0.2;
  } else if (cue.mood === 'tension' || cue.mood === 'dread') {
    f += clamp((b - a) / 10, -1, 1) * 0.5 + (a < -2 ? 0.15 : 0) - clamp(sd(w) / 12, 0, 1) * 0.1;
  } else if (cue.mood === 'reveal' || cue.mood === 'triumph') {
    f += clamp((m + 10) / 10, 0, 1) * 0.5 + (mx >= -1 ? 0.25 : 0);
  } else {
    const climax = mx >= -1 && mx - mn > 8;
    f += (climax ? -0.3 : 0.1) - clamp(sd(w) / 8, 0, 1) * 0.3 + clamp(-m / 12, 0, 1) * 0.15 - clamp(Math.abs(b - a) / 10, 0, 1) * 0.1;
  }
  return f;
}

/**
 * The entry point inside the track. Candidates are phrase starts: the first
 * second of music, every jump in energy (a new section) and a 4 s grid from
 * the top. The final cue is back-timed when the track has a real ending, so
 * the music finishes WITH the film instead of being faded mid-phrase.
 */
function bestStart(t, cue) {
  const E = t.energy ?? [];
  const D = Number(t.duration) || E.length;
  if (!E.length) return { s: 0, fit: 0 };
  const lead = leadIn(E);
  const len = cue.to - cue.from;
  if (cue.final && D - lead >= len + 1 && endsNaturally(E)) return { s: Math.max(lead, Math.floor(D - len - 0.5)), fit: 0.6, backTimed: true };
  const maxS = Math.floor(D - len - 1.5);
  if (maxS <= lead) {
    // Longer than the track: start at its first phrase so the chain gets the most music.
    return { s: lead, fit: windowFit(E, lead, len, cue) - 0.2 };
  }
  let best = { s: lead, fit: -Infinity };
  for (let s = lead; s <= maxS; s++) {
    const jump = s > 0 ? E[s] - E[s - 1] : 0;
    let bonus;
    if (s === lead) bonus = 0.06;
    else if (jump >= 3 && E[s] > -30) bonus = 0.08;
    else if ((s - lead) % 4 === 0) bonus = 0;
    else continue;
    const f = windowFit(E, s, len, cue) + bonus;
    if (f > best.fit + 1e-9) best = { s, fit: f };
  }
  return best;
}

/*
 * Culture of the score. Each topic names its colour first and a partner second
 * (an Ottoman epic: middle-eastern colour, orchestral weight for the battles).
 */
const CULTURE_HINTS = [
  [/osmanl|ottoman|sultan|padisah|fatih|istanbul|konstantin|constantinople|bizans|byzant|selcuk|seljuk|\barap|\barab|\bpers\b|persia|\biran\b|misir|egypt|endulus|andalus|hacli|crusade|orta ?dogu|middle.?east|\bney\b|\boud\b|\bud\b|darbuka|anadolu|anatolia|mehter|kudus|jerusalem|bagdat|baghdad|\bsam\b|damascus|firavun|pharaoh/, ['middle-eastern', 'western orchestral']],
  // Period libraries (Kevin MacLeod, CC BY): medieval chant/lute for sieges and crusades, jazz/ragtime for 1920s-40s stories.
  [/medieval|orta ?cag|ortacag|bizans|byzant|konstantin|constantinople|crusade|hacli|kusatma|siege|castle|kale|sovalye|knight|monastery|manastir|cathedral|katedral|1453/, ['medieval', 'western orchestral']],
  [/1920|1929|1930s|roaring|caz|jazz|ragtime|prohibition|speakeasy|wall street|great depression|buyuk buhran|buhran|gangster|capone|noir|1940s/, ['jazz']],
  [/japon|japan|samuray|samurai|\bcin\b|china|chinese|kore|korea|mogol|mongol|\basya\b|\basia\b|tokyo|pekin|beijing|cengiz|genghis/, ['east-asian']],
  [/\bhint|india|bengal|mughal|babur|gandhi/, ['indian']],
  [/\blatin|meksika|mexic|brezilya|brazil|arjantin|argentin|\bkuba\b|cuba|kolombiya|colombia|escobar|ispanya|spain|aztek|aztec|\bmaya\b|\binka\b|inca/, ['latin']],
  [/uzay|\bspace\b|nasa|galaksi|galaxy|evren|universe|kozmos|cosmos|voyager|apollo|\bmars\b|roket|rocket|kuantum|quantum|yapay zeka|artificial intelligence|bilgisayar|computer|internet|kripto|crypto|bitcoin/, ['electronic', 'ambient']],
];
/* Americana (banjo, slide guitar) only when asked for explicitly: "Amerika" in a Titanic title is not a request for a banjo. */
const AMERICANA = /americana|kovboy|cowboy|vahsi bati|wild west|teksas|texas|country|blues|appalach|nashville|dust bowl|banjo/;
const GENRE_CULTURE = { epic: ['western orchestral'], science: ['electronic', 'ambient'], horror: ['ambient'], crime: ['electronic', 'ambient'], finance: ['electronic'], inspire: ['piano', 'western orchestral'], documentary: [] };
const EXOTIC = ['middle-eastern', 'east-asian', 'indian', 'latin', 'americana'];

/**
 * Which musical cultures the topic asks for. The explicit hint (musicHint /
 * musicPrompt), the title and the chapter names decide on one mention. The
 * narration decides only when it keeps naming that world (an Ottoman epic says
 * "sultan" and "Osmanlı" dozens of times; one passing "Mısır" is not a request),
 * and for the old-world colours only when the story is set before ~1920 — a
 * modern Borsa İstanbul story gets no bazaar music.
 * The old-world gate covers the title and chapters too (27 Ekim 2026): "Iran"
 * in the Hormuz mines title (20261018-8a1eca, 2026) gave the news a middle-eastern
 * groove (Mystic mirage, 3 cues) and "Brazil" gave the Lula election (20261026-29db03)
 * a light latin track (Pienso Viento) under the vote counts. A news video never
 * gets an exotic colour; an older story gets one from an explicit musicHint, or
 * when it is set before 1920. `hinted`: the cultures the musicHint itself asks for.
 */
function culturePrefs(script, genre, year = storyYear(script)) {
  const hint = fold([script?.musicHint, script?.musicPrompt].filter(Boolean).join(' '));
  const head = fold([script?.musicHint, script?.musicPrompt, script?.title, ...(script?.chapters ?? [])].filter(Boolean).join(' '));
  const body = fold((script?.scenes ?? []).map((s) => stripTags(s.say)).join(' '));
  const news = script?.format === 'news';
  const old = year !== null && year !== undefined && year < 1920;
  const strong = new Set();
  const partner = new Set();
  const hinted = new Set();
  for (const [re, cs] of CULTURE_HINTS) {
    const inBody = (body.match(new RegExp(re.source, 'g')) ?? []).length;
    const asked = !!hint && re.test(hint);
    if (asked) hinted.add(cs[0]);
    const named = re.test(head) || inBody >= 4;
    const ok = EXOTIC.includes(cs[0]) ? !news && (asked || (old && named)) : named;
    if (ok) {
      strong.add(cs[0]);
      cs.slice(1).forEach((c) => partner.add(c));
    }
  }
  if (AMERICANA.test(hint) && !news) {
    strong.add('americana');
    hinted.add('americana');
  }
  return { strong, partner, hinted, genre: new Set(GENRE_CULTURE[genre] ?? []) };
}
function cultureBonus(culture, pref) {
  const c = fold(culture ?? '');
  if (pref.strong.has(c)) return 0.15;
  if (EXOTIC.includes(c)) return -0.2;
  if (pref.partner?.has(c) || pref.genre.has(c)) return 0.05;
  return 0;
}

/*
 * GRAVITY — a siege, a crash, a murder, an execution: the score stays grave even in a "victory"
 * chapter. moodFit cannot tell a sombre triumph from a soaring adventure cue (user, 1453 at 3:30:
 * "bu ciddi bir konu, böyle müzikler çalmamalı"), so tracks carry their register (scripts/
 * audio-library.mjs tone) and a grave story only hears grave and dramatic ones.
 */
const GRAVE_GENRES = new Set(['epic', 'crime', 'horror', 'finance']);
/*
 * Extended 27 Ekim 2026: the Hormuz tanker-mines news (20261018-8a1eca) had 6 hits in 2,048 words (2.93 per 1000,
 * just under the old 3.0) because mines, explosions, attacks, missiles, fires and riots were not grave words.
 */
const GRAVE_WORDS = /\b(war|wars|siege|besieged|battle|killed|kill|killing|death|deaths|dead|died|dying|murder|murdered|massacre|executed|execution|slaughter|genocide|famine|plague|collapse|collapsed|crash|crashed|ruin|ruined|suicide|bankrupt\w*|depression|conquest|conquered|fell|fall|fallen|invasion|invaded|bombed|bombing|hijack|hijacking|prison|prisoners|handcuffs|blood|corpse|grave|graves|explosion|exploded|blast|fire|burned|attack(?:ed)?|mines?|missile|strike|wounded|injured|casualt\w*|victims?|riot\w*|curfew|arrest\w*|fraud)\b/g;
const isSerious = (g) => g === 'serious' || g === 'grave';

/**
 * 'grave' (war, death, collapse, crime, money lost), 'serious' (everything else on the owner's news, history and
 * finance channels) or 'open' — the last only when script.musicGravity asks for it. Until 27 Ekim 2026 a story
 * without enough grave words was 'open', and 'open' only kept game-like tracks out: light synth-pop played under
 * the Hormuz sea-mine explainer (Videodrome, 92 s), a light latin track under the Lula vote counts (Pienso
 * Viento), a "bouncy, carefree" one in the El Niño news (Flicker In The Night).
 * musicGravity 'serious' (the pipeline's default) is a floor: the story can still turn out grave.
 */
/*
 * The PICTURE's gravity (edit-grammar.mjs: transitions, fx, camera, echo text) keeps the rule it had before the
 * music audit: 'grave' for epic/crime/horror or >= 6 grave words at >= 3 per 1000, else 'open'. The music's own
 * gravity (storyGravity) got finance, a lower bar and a 'serious' floor on 27 Ekim 2026 — that must not re-cut the
 * picture of five old videos (24969b, 2efe04, 23e041, 8a1eca, 48ae2d went open -> grave in the review).
 */
const EDIT_GRAVE_GENRES = new Set(['epic', 'crime', 'horror']);
const EDIT_GRAVE_WORDS = /\b(war|wars|siege|besieged|battle|killed|kill|killing|death|deaths|dead|died|dying|murder|murdered|massacre|executed|execution|slaughter|genocide|famine|plague|collapse|collapsed|crash|crashed|ruin|ruined|suicide|bankrupt|bankruptcy|depression|conquest|conquered|fell|fall|fallen|invasion|invaded|bombed|bombing|hijack|hijacking|prison|prisoners|handcuffs|blood|corpse|grave|graves)\b/g;
export function editGravity(script, genre) {
  const set = String(script?.editGravity ?? script?.musicGravity ?? '').toLowerCase();
  if (set === 'grave' || set === 'open') return set;
  if (EDIT_GRAVE_GENRES.has(genre)) return 'grave';
  const text = [script?.title, ...(script?.scenes ?? []).map((x) => x?.say)].filter(Boolean).join(' ').toLowerCase();
  const hits = (text.match(EDIT_GRAVE_WORDS) ?? []).length;
  const words = Math.max(1, text.split(/\s+/).length);
  return hits >= 6 && hits / words >= 0.003 ? 'grave' : 'open';
}

export function storyGravity(script, genre) {
  const set = String(script?.musicGravity ?? '').toLowerCase();
  if (set === 'open') return 'open';
  if (set === 'grave') return 'grave';
  if (GRAVE_GENRES.has(genre)) return 'grave';
  const text = [script?.title, ...(script?.scenes ?? []).map((s) => stripTags(s?.say))].filter(Boolean).join(' ').toLowerCase();
  const hits = (text.match(GRAVE_WORDS) ?? []).length;
  const words = Math.max(1, text.split(/\s+/).length);
  // A news story about mines and an attack is grave; one passing "fell" in a science film is serious, never open.
  return hits >= 4 && (hits / words) * 1000 >= 1.5 ? 'grave' : 'serious';
}

/*
 * SERIOUSNESS CLASS of a track (27 Ekim 2026, library audit rules R0-R11 over the 233 tracks of Oct 26:
 * SAFE 83 / CONDITIONAL 16 / NEVER 134). The register alone let ~25 wrong tracks into grave pools: jazz and smooth
 * sax tagged 'grave' (Night on the Docks – Sax became the Eagle's Nest main theme, 20261024-950730), untoned
 * Americana guitar (Dusty Road Magic), mandolin folk, "easygoing" grooves. The toneNote — the tagger's most honest
 * line — is read too, after negated clauses are cut ("no uplift" is not "uplift"). Titles are not read ("Game
 * Over" is a serious track). Fail closed: no tags or no register -> never.
 */
const NEGATED = /\b(no|not|without|lacks?|lacking|never|nor)\b[\s\w,'-]{0,40}?(?=[.;,|]|$)/gi;
const SILLY = /quirk|playful|whimsic|carefree|bouncy|bouncing|cheerful|happy|upbeat|\bfun\b|lullab|party|groov|laid.?back|\bchill|breezy|jazz|swing|ragtime|big.?band|smooth|lounge|lo.?fi|mellow|easygoing|light.?hearted|twang|western|cowboy|banjo|fiddle|mandolin|whistl|ukulele|tropical|\bdanc|\bpop\b|corporate|motivational|circus|carnival|\bsax|saxophone|trumpet|upright bass|brushed|vinyl crackle|silent.?film|fantasy|adventur|trailer|superhero|video.?game|action game|game soundtrack|boss.?fight|cartoon|\bkids?\b|children|romantic|holiday|christmas|exotic|sweet/i;
/* The jazz idiom itself (instruments, period sound): what a 1929 crash story is ALLOWED to hear. */
const JAZZ_IDIOM = /jazz\w*|ragtime|big.?band|\bsax\w*|saxophone|trumpet|upright bass|double bass|brushed(?: drums)?|clarinet|vinyl crackle|crackle|silent.?film|noir/gi;
/* Lounge never, not even in 1929: the smooth / laid-back / sly side of jazz. */
const LOUNGE = /smooth|laid.?back|groov|chill|lounge|swing|sly|bouncy/i;
const OLD_RECORD = /distress|crackle|ragtime|silent.?film/i;
const SER_CULTURES = new Set(['middle-eastern', 'indian', 'medieval', 'east-asian']);
const BATTLE_DESC = /\b(battle (music|climax|reenactment|sequence)|full battle|final assault|war horns|cannons)\b/i;
const toneText = (g) => [g.description, g.toneNote, g.bestUse, (Array.isArray(g.instruments) ? g.instruments : []).join(', ')].filter(Boolean).join(' | ').replace(NEGATED, ' ');
const cultureOfTrack = (t) => {
  const c = fold(t?.tags?.culture ?? '');
  return !SER_CULTURES.has(c) && /patrikios/i.test(t?.artist ?? '') ? 'middle-eastern' : c;
};

const SERIOUS = new WeakMap();
/**
 * 'safe' | 'cond:culture' | 'cond:americana' | 'cond:battle' | 'cond:ser' | 'never' (rules R1-R11, in order).
 * cond:culture = a period/world colour (oud, raga, chant) for its own world before 1920 or on request;
 * cond:americana = reflection/hope in modern US stories; cond:battle = only a battle peak; cond:ser = seriousness
 * 0.55-0.7, open stories only.
 */
export function seriousClass(t) {
  const g = t?.tags;
  if (!g || typeof g !== 'object' || !g.register) return 'never'; // R1
  const hit = SERIOUS.get(g);
  if (hit) return hit;
  const c = classifySerious(t, g);
  SERIOUS.set(g, c);
  return c;
}
function classifySerious(t, g) {
  if (fold(g.vocals) === 'lyrics' || g.documentaryUsable === false) return 'never'; // R2
  if (g.gameLike === true) return 'never'; // R3
  if (g.register === 'light') return 'never'; // R4
  if (SILLY.test(toneText(g))) return 'never'; // R5
  const cul = fold(g.culture ?? '');
  if (cul === 'jazz' || cul === 'latin') return 'never'; // R6
  const ser = num(g.seriousness, 0);
  const sad = num(g.moodFit?.sad, 0);
  // R7: heroic only as a memorial (For the Fallen: sad 0.7, seriousness 0.6), never as a soaring adventure.
  if (g.register === 'heroic' && !(ser >= 0.55 && sad >= 0.5)) return 'never';
  if (SER_CULTURES.has(cul) || /patrikios/i.test(t?.artist ?? '')) return 'cond:culture'; // R8
  if (cul === 'americana') return g.register === 'grave' && sad >= 0.7 ? 'safe' : 'cond:americana'; // R9
  const e = num(Number(g.energy), 3);
  if ((e >= 5 && fold(g.tempo) === 'fast') || (e >= 4 && BATTLE_DESC.test(`${g.description ?? ''} ${g.bestUse ?? ''}`))) return 'cond:battle'; // R10
  if (g.register === 'heroic') return 'safe';
  if (g.register !== 'grave' && g.register !== 'dramatic') return 'never';
  return ser >= 0.7 ? 'safe' : ser >= 0.55 ? 'cond:ser' : 'never'; // R11
}

/**
 * The one jazz exception: a jazz-culture track that is sombre jazz (no lounge, nothing else silly) may colour a
 * story set 1915-1960 whose head is a crash, noir or prohibition story (the 1929 Wall Street crash).
 */
export function jazzAgeTrack(t) {
  const g = t?.tags;
  if (!g?.register || fold(g.vocals) === 'lyrics' || g.documentaryUsable === false || g.gameLike === true) return false;
  if ((g.register !== 'grave' && g.register !== 'dramatic') || num(g.seriousness, 0) < 0.55) return false;
  if (fold(g.culture ?? '') !== 'jazz') return false;
  const txt = toneText(g);
  return !LOUNGE.test(txt) && !SILLY.test(txt.replace(JAZZ_IDIOM, ' '));
}

/**
 * Can this track play under a story of this gravity? Open: anything but game-like. Serious and grave: only
 * seriousClass 'safe', plus a conditional track whose context holds — `ctx` is the story (gate context of
 * planScoreV2: format, year, cultures, americana, war, jazzAge) and, at cue level, the cue and its role.
 */
export function fitsGravity(t, gravity, ctx = {}) {
  if (!isSerious(gravity)) return !t.tags?.gameLike;
  const c = seriousClass(t);
  if (c === 'safe') return true;
  const role = ctx.role;
  if (c === 'never') {
    if (!ctx.jazzAge || role === 'grief' || role === 'theme' || !jazzAgeTrack(t)) return false;
    return !(OLD_RECORD.test(toneText(t.tags)) && num(ctx.year, 0) >= 1940);
  }
  if (c === 'cond:culture') {
    const cul = cultureOfTrack(t);
    return ctx.format !== 'news' && !!ctx.cultures?.has(cul) && (!!ctx.oldWorld || !!ctx.hinted?.has(cul)) && role !== 'grief' && role !== 'theme';
  }
  if (c === 'cond:americana') return !!ctx.americana && (role === undefined || role === 'reflection' || role === 'hope');
  if (c === 'cond:battle') return !!ctx.war && (!ctx.cue || Number(ctx.cue.energy) >= 4.5);
  return false; // cond:ser: open stories only
}

/**
 * The pool. Serious and grave stories: a HARD filter, no fallback to the base pool (until 27 Ekim 2026 a library
 * with fewer than 24 fitting tracks fell back to everything). A thin pool is reported in `notes`, never padded.
 */
function musicPool(L, gravity = 'open', ctx = {}) {
  const base = L.music.filter((t) => t.tags && t.tags.documentaryUsable === true && fold(t.tags.vocals) !== 'lyrics' && (Number(t.duration) || 0) >= 25);
  // Unverified tracks (VERIFY_LIST) stay out of serious and grave stories until someone has listened to them: the
  // replay still put The Marble Cinematic University (a Marvel pastiche) on the 1812 cold open and Survival Mode
  // under its retreat (owner: "ciddi konuda saçma sapan şeyler çalmasın"). Open stories keep them, capped.
  if (isSerious(gravity)) return base.filter((t) => fitsGravity(t, gravity, ctx) && !isVerify(t));
  const fit = base.filter((t) => fitsGravity(t, gravity));
  // An open story on a small library keeps working: then the register only orders the pool.
  return fit.length >= 24 ? fit : base;
}

/** Soft side of the rule for an open story: a light or game-like track is pushed back. */
function gravityPenalty(t, gravity) {
  if (isSerious(gravity) || fitsGravity(t, gravity)) return 0;
  return 0.6;
}

/*
 * In a serious or grave story the scene moods ask for different music (27 Ekim 2026): a "triumph" is a sober,
 * mourning victory (8 Chernobyl triumph scenes got The Challenger, "powerful, climactic peak", over scene energy
 * 2.2), a reveal is a turn into dread or grief rather than a swell, curiosity is an investigation with an edge.
 */
const GRAVE_REMAP = {
  triumph: { triumph: 0.4, sad: 0.4, reveal: 0.2 },
  reveal: { reveal: 0.5, dread: 0.3, sad: 0.2 },
  curious: { curious: 0.6, dread: 0.2, calm: 0.2 },
};
function remapWeights(w) {
  const out = {};
  for (const [m, v] of Object.entries(w ?? {})) for (const [k, x] of Object.entries(GRAVE_REMAP[m] ?? { [m]: 1 })) out[k] = (out[k] ?? 0) + (v || 0) * x;
  return out;
}
/** How well a track fits a cue's own mood (remapped in serious/grave stories): the "mood fit" every gate reads. */
function fitFor(t, cue, ctx) {
  const fit = t.tags?.moodFit ?? {};
  if (!isSerious(ctx?.gravity)) return fit[cue.mood] ?? 0;
  return Object.entries(GRAVE_REMAP[cue.mood] ?? { [cue.mood]: 1 }).reduce((s, [m, x]) => s + x * (fit[m] ?? 0), 0);
}
/** The style fit the gates read: a grave story without battles also counts the documentary fit. */
function genreFitOf(t, ctx) {
  const own = num(t.tags?.genreFit?.[ctx.genre], 0.4);
  return ctx.gravity === 'grave' && !ctx.war ? Math.max(own, num(t.tags?.genreFit?.documentary, 0.4)) : own;
}

function trackScore(t, cue, ctx) {
  const fit = t.tags.moodFit ?? {};
  const sv = isSerious(ctx.gravity);
  const W = sv ? remapWeights(cue.weights) : cue.weights;
  let ws = 0;
  let wsum = 0;
  for (const m of MOODS) {
    const w = W?.[m] ?? 0;
    ws += w * (fit[m] ?? 0);
    wsum += w;
  }
  const moodS = 0.6 * (wsum ? ws / wsum : 0) + 0.4 * (sv ? fitFor(t, cue, ctx) : fit[cue.mood] ?? 0);
  // The tagger scores "epic" as battles; a bazaar oud track IS epic for an Ottoman story.
  const strongC = ctx.pref.strong.has(fold(t.tags.culture ?? '')) ? 0.6 : 0;
  let genreS = Math.max(num(t.tags.genreFit?.[ctx.genre], 0.4), strongC);
  let gw = 0.25;
  // A grave story without battles (a disaster, a crime): 'epic' (war-trailer) is not the measure — Survival Mode had
  // epic 0.8 against Last Sunrise's 0.2 under Chernobyl.
  if (ctx.gravity === 'grave' && !ctx.war) {
    genreS = Math.max(genreFitOf(t, ctx), strongC);
    gw = 0.12;
  }
  // Energy: the art director's scene energy leads, the mood's target follows (Chernobyl: energy-4 "driving" tracks
  // over tension scenes at 2.4-2.8 for 282 of 757 s). A sober triumph never asks for more than 3.5.
  let target = TARGET_ENERGY[cue.mood];
  let ew = 0.1;
  if (Number.isFinite(cue.energy)) {
    target = 0.75 * cue.energy + 0.25 * target;
    ew = 0.16;
  }
  if (sv && cue.mood === 'triumph') target = Math.min(target, 3.5);
  const energyS = 1 - Math.min(1, Math.abs((Number(t.tags.energy) || 3) - target) / 3);
  let s = 0.5 * moodS + gw * genreS + ew * energyS + cultureBonus(t.tags.culture, ctx.pref);
  if (fold(t.tags.vocals) === 'wordless' && ctx.genre !== 'epic' && ctx.genre !== 'horror') s -= 0.05;
  // One track should carry the whole cue; a chain is the fallback, not the plan.
  const usable = (Number(t.duration) || 0) - leadIn(t.energy ?? []) - 2;
  const len = cue.to - cue.from;
  if (usable < len) s -= 0.12 * Math.min(1, (len - usable) / len);
  if (cue.cold) s += 0.3 * striking(t, ctx.genre);
  return s;
}

function similarity(a, b) {
  const fa = a.tags.moodFit ?? {};
  const fb = b.tags.moodFit ?? {};
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const m of MOODS) {
    dot += (fa[m] ?? 0) * (fb[m] ?? 0);
    na += (fa[m] ?? 0) ** 2;
    nb += (fb[m] ?? 0) ** 2;
  }
  const cos = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const ia = new Set((a.tags.instruments ?? []).map(fold));
  const shared = (b.tags.instruments ?? []).filter((x) => ia.has(fold(x))).length;
  return cos + (fold(a.tags.culture) === fold(b.tags.culture) ? 0.15 : 0) - 0.05 * Math.abs((Number(a.tags.energy) || 3) - (Number(b.tags.energy) || 3)) + Math.min(0.12, 0.03 * shared);
}

/** Choose a track (and entry point) for one cue; split it into a chain when no track is long enough. */
function pickFor(cue, ctx, prev) {
  const fresh = ctx.pool.filter((t) => !ctx.used.has(t.id));
  // Soft gates: stay inside the mood and the style when the library allows it.
  const gated = fresh.filter((t) => (t.tags.moodFit?.[cue.mood] ?? 0) >= 0.35 && num(t.tags.genreFit?.[ctx.genre], 0.4) >= 0.2);
  let cands = gated.length >= 2 ? gated : fresh;
  let reused = false;
  if (!cands.length) {
    // Library exhausted: reuse the least used track rather than leave the cue bare.
    cands = [...ctx.pool].sort((a, b) => (ctx.uses.get(a.id) ?? 0) - (ctx.uses.get(b.id) ?? 0));
    reused = true;
  }
  if (!cands.length) return [{ ...cue, noTrack: true }];
  let scored = cands.map((t) => ({ t, key: t.id, score: trackScore(t, cue, ctx) + (prev ? 0.4 * similarity(prev, t) : 0) }));
  scored.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  scored = scored.slice(0, 8).map((c) => {
    const st = bestStart(c.t, cue);
    return { ...c, st, score: c.score + 0.1 * clamp(st.fit, -1, 1) };
  });
  const rng = rngFor(ctx.seed, 'music', ctx.genre, Math.round(cue.from * 10), prev?.id ?? '');
  const choice = pickNear(scored, rng, 0.05, 5);
  const t = choice.t;
  ctx.used.add(t.id);
  ctx.uses.set(t.id, (ctx.uses.get(t.id) ?? 0) + 1);
  const st = choice.st;
  const len = cue.to - cue.from;
  const avail = (Number(t.duration) || 0) - st.s - 0.5;
  const part = { ...cue, track: t, startAt: st.s, backTimed: !!st.backTimed, reused, chained: !!prev };
  if (avail >= len + XFADE / 2 || len - avail < 4) return [part];
  /*
   * Switch tracks on a cut, as late as the first track allows. With no cut
   * far enough in, any cut will do; with none at all, a breath in the
   * narration — never the middle of a word.
   */
  const latest = cue.from + avail - XFADE / 2 - 0.5;
  const cands2 = (cue.bounds ?? []).filter((b) => b >= cue.from + MIN_CUE && b <= latest);
  const anyCut = (cue.bounds ?? []).filter((b) => b >= cue.from + 3 && b <= latest);
  const cut = cands2.length ? cands2.at(-1) : anyCut.length ? anyCut.at(-1) : quietPoint(ctx.speech, Math.max(cue.from + 5, latest - 6), Math.max(cue.from + 5, latest));
  const first = { ...part, to: cut, final: false, bounds: (cue.bounds ?? []).filter((b) => b < cut) };
  const rest = { ...cue, from: cut, cold: false, bounds: (cue.bounds ?? []).filter((b) => b > cut) };
  return [first, ...pickFor(rest, ctx, t)];
}

/**
 * v1 planner (until 2026-10): a fresh track for every mood run. Kept as is for
 * jobs whose picture is already cut to its beats (selector 'v1').
 * Pure and deterministic: same script, seed and
 * library -> same plan. Each cue: { fromSec, toSec, mood, trackId, startAt,
 * gainDb } plus bookkeeping (kind, chapter, title, coldOpen, resume, chained,
 * backTimed). Silence cues have mood 'silence' and trackId null.
 */
function planScoreV1({ script, sceneSeconds, lib, genre, seed, root } = {}) {
  const L = prep(lib, root);
  const g = GENRES.includes(genre) ? genre : GENRES.includes(script?.genre) ? script.genre : 'documentary';
  const units = timeline(script?.scenes ?? [], sceneSecondsOf(script, sceneSeconds));
  if (!units.length) return { cues: [] };
  const pool = musicPool(L);
  if (!pool.length) return { cues: [], reason: 'kütüphanede belgesele uygun müzik yok' };
  const runs = planRuns(units);
  const secs = sceneSecondsOf(script, sceneSeconds);
  const ctx = {
    pool, genre: g, seed: seed ?? script?.seedKey ?? script?.id ?? 'nova', pref: culturePrefs(script, g), used: new Set(), uses: new Map(),
    speech: speechMap(script?.scenes ?? [], secs),
  };

  // Priority: the cold open gets the most striking track, the finale the best ending, then the longest cues.
  // Drop-outs come last, once the cue they resume has its track.
  const music = runs.map((r, k) => ({ r, k })).filter(({ r }) => !r.silence);
  const order = [
    ...music.filter(({ r }) => r.cold),
    ...music.filter(({ r }) => r.final && !r.cold && !r.resume),
    ...music.filter(({ r }) => !r.cold && !r.final && !r.resume).sort((a, b) => b.r.len - a.r.len || a.k - b.k),
    ...music.filter(({ r }) => r.resume && !r.cold),
  ];
  const parts = new Map();
  for (const { r, k } of order) {
    if (r.resume) {
      // The drop-out: the same track picks up where it would have been had it kept playing.
      const src = parts.get(k - 2)?.at(-1);
      if (src?.track) {
        const at = src.startAt + (r.from - src.from);
        if (at + r.len <= (Number(src.track.duration) || 0) - 1) {
          parts.set(k, [{ ...r, track: src.track, startAt: at, resume: true }]);
          continue;
        }
      }
    }
    parts.set(k, pickFor({ ...r, resume: false }, ctx, null));
  }
  const cues = [];
  const silence = (a, b, chapter) => cues.push({ fromSec: r3(a), toSec: r3(b), mood: 'silence', trackId: null, startAt: 0, gainDb: null, kind: 'silence', chapter });
  runs.forEach((r, k) => {
    if (r.silence) return silence(r.from, r.to, r.chapter);
    /*
     * A chapter card is a full stop in the music: the outgoing cue resolves ON
     * the card's cut (a "button", not a 2.5 s fade across it) and the new
     * chapter's cue enters a beat later, after the card's hit has spoken.
     */
    const button = !!r.units[0]?.card && k > 0 && !runs[k - 1].silence;
    for (const [n, p] of (parts.get(k) ?? []).entries()) {
      if (p.noTrack) {
        silence(p.from, p.to, p.chapter);
        continue;
      }
      cues.push({
        fromSec: r3(p.from), toSec: r3(p.to), mood: p.mood, trackId: p.track.id, startAt: r3(p.startAt),
        gainDb: clamp((MOOD_GAIN_V1[p.mood] ?? 0) + (p.cold ? 1 : 0), -6, 3),
        kind: 'music', chapter: p.chapter, title: p.track.title,
        ...(p.cold ? { coldOpen: true } : {}), ...(p.resume ? { resume: true } : {}), ...(p.chained ? { chained: true } : {}),
        ...(p.backTimed ? { backTimed: true } : {}), ...(p.reused ? { reused: true } : {}),
        ...(button && n === 0 ? { button: true } : {}),
      });
    }
  });
  return { cues };
}

/* ============================================================ score v2 */
/*
 * v2 (2026-10): the score is a PALETTE, not a playlist. The v1 planner gave
 * every mood run a brand-new track (~20 tracks in a 13-minute film, no
 * identity) and knew nothing about the period: a 1912 Titanic got 85%
 * electronic beats. A film composer works differently, and so does this:
 *
 *  - Era & topic: the story's year (script.era) and topic (title, chapters,
 *    musicHint, the topic bible script.topic) weigh instrumentation — period
 *    piano/strings for 1912, jazz for 1929, analog synth/ambient for 1977
 *    space, cold drones for 1959 Urals, choir/percussion/oud for 1453.
 *  - One MAIN THEME stated after the title, called back mid-film and in the
 *    finale (the motif), plus 5-8 supporting cues reused across the film,
 *    each time from a different section of the track; never the same track
 *    in two consecutive cues.
 *  - Energy curve: the art director's scene energy (1-5) steers track energy
 *    and level; a run that climbs into a peak is cut from a rising section,
 *    a reveal lands on the track's swell, and after a peak the music takes a
 *    breath (true silence) before the next feeling enters.
 *  - Quality: dynamics and arc (builds, swells) are preferred; quirky,
 *    upbeat, loop-y background music is pushed away from serious films.
 *  - Cross-video: tracks used in the channel's last 12 videos lose ties to
 *    equally fitting ones (never a better fit) and the channel's last 5 main
 *    themes are never the theme (history passed in by the caller; see
 *    readMusicHistory / musicHistoryFor / recordMusicHistory).
 * Pure and deterministic like v1: same script, seed, library and history ->
 * same plan. selector 'v1' keeps the old planner (its 20 s hold, levels and
 * open pool); since 27 Ekim 2026 only MUSIC_BANNED, the year reading and the
 * old-world culture gate reach it too.
 */
export const MUSIC_SELECTOR = 'v2';
/*
 * Palette 5-8 (+ theme, cold open, colours), each track at most 3 cues (27 Ekim 2026). The old 4-7 minus the cold
 * open gave Chernobyl 3 slots for 4 mood families and MAX_USES 4 let Highway Nocturne fill a tension run it was never
 * picked for (4 uses, 194 s, the last one replaying a passage at 0.62 overlap). A reuse now has to fit the cue.
 */
const PALETTE_MIN = 5;
const PALETTE_MAX = 8;
const PALETTE_HARD_MAX = 12;
const THEME_MIN_RUNS = 4;
const MAX_USES = 3;
const THEME_MAX_USES = 3;
const REUSE_FIT = 0.55;
const REUSE_ENERGY = 1.2;
const REUSE_OVERLAP = 0.3;
const BREATH_MIN = 1.6;
const BREATH_MAX = 2.6;
/*
 * History per channel (27 Ekim 2026): 12 videos of the same channel, and no main theme of that channel's last 5
 * videos. One mixed list of 5 hid Black Buck from Chernobyl's history: Last Sunrise was the history channel's main
 * theme twice in 11 days, and The Challenger played in 3 of its 4 videos.
 */
export const HISTORY_N = 12;
/** The music-history channel keys (script.musicChannel, written by the pipeline). */
export const MUSIC_CHANNELS = ['news', 'history', 'finance', 'docu'];
const THEME_BAN_N = 5;
const HISTORY_CAP = 0.15;

const FEATS = new WeakMap();
/** What a track sounds like, in the words the era/topic rules speak: instrumentation and style flags from its tags. */
export function trackFeatures(t) {
  const hit = FEATS.get(t);
  if (hit) return hit;
  const tg = t?.tags ?? {};
  const insList = (tg.instruments ?? []).map((x) => fold(x));
  const ins = insList.join(' | ');
  const cul = fold(tg.culture ?? '');
  const desc = fold([tg.description, tg.bestUse].filter(Boolean).join(' '));
  const all = `${ins} | ${desc}`;
  const e = Number(tg.energy) || 3;
  const synth = cul === 'electronic' || /synth|electronic|drum machine|sound design/.test(ins);
  const orchestral = cul === 'western orchestral' || /orchestr/.test(all) || (/string|violin|cello/.test(ins) && /brass|woodwind|horn/.test(ins));
  const strings = /string|violin|cello|viola/.test(ins);
  const piano = /piano/.test(ins);
  const ambient = cul === 'ambient' || /ambient|drone|atmospher|ethereal|spacious|textur/.test(all);
  const jazz = /jazz|\bsax|trumpet|upright bass|double bass|brushed|swing|ragtime|clarinet|big band|noir/.test(all);
  const f = {
    synth, orchestral, strings, piano, ambient, jazz,
    soloPiano: piano && insList.every((x) => /piano|subtle|soft strings/.test(x)),
    pads: /pad|drone|ambient textures/.test(ins),
    drone: /drone/.test(all) || (ambient && e <= 2 && !piano),
    // A modern beat: drums under synths, or a track that calls itself beat-driven. A jazz rhythm section is not one.
    beat: !jazz && cul !== 'western orchestral' && ((synth && /\bdrums\b|drum machine|electronic drums|electronic percussion/.test(ins)) || /\bbeats?\b|\bdrop\b|trap|hip.?hop/.test(desc)),
    brass: /brass|trumpet|horn|trombone/.test(ins),
    choir: fold(tg.vocals) === 'wordless' || /choir|choral|chant/.test(all),
    mideast: cul === 'middle-eastern' || /\boud\b|middle.?eastern|darbuka|\bney\b|duduk|bazaar|souk/.test(all),
    epicPerc: /percussion|drums|taiko|timpani/.test(ins) && (orchestral || /brass/.test(ins)) && e >= 4,
    guitar: cul === 'americana' || /guitar|banjo|fiddle|mandolin/.test(ins),
    eguitar: !jazz && (/electric guitar/.test(ins) || /\brock\b|bluesy|twang/.test(desc)),
    mallet: /marimba|bells|glockenspiel|celesta|xylophone/.test(ins),
    quirky: /quirky|playful|whimsical|carefree|bouncy|bouncing|cheerful|happy|\bfun\b|upbeat|whistl|ukulele|lighthearted|light-hearted/.test(all),
    groove: !jazz && /laid.?back|groov|looping|mellow beat|smooth|chill|lo.?fi|\bvibe/.test(desc),
    build: /build|swell|climax|crescendo|evolv|cinematic|soar|emotive|haunting|grows|intensif/.test(desc),
  };
  f.melodic = piano || strings || orchestral || f.guitar || f.choir || f.jazz || /melod|motif|theme/.test(desc);
  FEATS.set(t, f);
  return f;
}

/* Period instrumentation, by the story's year (weights per feature, roughly -1.6..+1.2). */
const ERA_STYLE = [
  [-9999, 1699, { orchestral: 1, strings: 0.6, choir: 1, epicPerc: 0.8, drone: 0.4, ambient: 0.2, piano: -0.4, synth: -1, pads: -0.2, beat: -1.6, guitar: -1, eguitar: -1.6, jazz: -1.6, mallet: -0.6, groove: -1 }],
  [1700, 1899, { orchestral: 1, strings: 0.8, piano: 0.7, soloPiano: 0.3, synth: -1, beat: -1.6, eguitar: -1.6, jazz: -1, guitar: -0.5, groove: -1 }],
  [1900, 1914, { orchestral: 0.8, strings: 0.9, piano: 0.8, soloPiano: 0.3, jazz: 0.2, synth: -0.9, beat: -1.4, eguitar: -1.4, guitar: -0.4, groove: -1 }],
  // Jazz 0.3 / 0 / 0 (was 1.2 / 0.5 / 0.4, 27 Ekim 2026): a WWII fire or a 1986 reactor is not a jazz story. The
  // era alone made jazz the signature colour of the Eagle's Nest news (year read as 1942) and its sax the theme.
  [1915, 1945, { orchestral: 0.6, strings: 0.6, piano: 0.8, jazz: 0.3, synth: -0.8, epicPerc: -0.3, beat: -1.3, eguitar: -1.2, guitar: -0.3, groove: -0.6 }],
  [1946, 1969, { strings: 0.6, piano: 0.5, ambient: 0.5, drone: 0.3, orchestral: 0.4, synth: -0.2, beat: -1, eguitar: -0.5, groove: -0.6 }],
  [1970, 1989, { synth: 0.3, pads: 0.3, ambient: 0.4, strings: 0.4, piano: 0.3, orchestral: 0.2, beat: -0.4, groove: -0.4 }],
  [1990, 9999, { beat: -0.2, groove: -0.3 }],
];
/* Topic colours, on top of the era (title, chapters, era note, musicHint, topic bible; narration only when it keeps naming it). */
const TOPIC_STYLE = [
  ['space', /\b(space|spacecraft|voyager|nasa|cosmos|cosmic|planet\w*|galax\w*|orbit\w*|rocket\w*|astronaut\w*|apollo|interstellar|solar system|uzay|gezegen\w*)\b/,
    { ambient: 1, pads: 0.8, synth: 1, drone: 0.4, orchestral: 0.3, beat: -0.6, guitar: -0.8, jazz: -0.6, eguitar: -0.8 }, ['ambient']],
  // Under the sea, on patrol: low drones and pads under strings (sonar, the closed hull), never a beat or a guitar.
  ['naval', /\b(submarines?|submarine's|sonar|hydrophone\w*|torpedo\w*|navy|naval|warships?|destroyers?|frigates?|ssbn|nuclear sub\w*|denizalti\w*|donanma\w*|sonar\w*)\b/,
    { drone: 0.8, ambient: 0.6, pads: 0.5, strings: 0.4, orchestral: 0.3, synth: 0.2, beat: -0.9, jazz: -0.9, guitar: -1, eguitar: -1, mallet: -0.4 }, ['drone']],
  ['maritime', /\b(titanic|ship|ships|steamship|ocean liner|liner|iceberg\w*|maritime|lifeboat\w*|sank|sinking|transatlantic|gemi\w*|okyanus\w*)\b/,
    { strings: 0.6, orchestral: 0.4, soloPiano: 0.5, synth: -0.5, beat: -0.8 }, ['soloPiano']],
  // A MARKET crash only (27 Ekim 2026): /crash|stock|depression|banks/ caught plane crashes, mental depression and
  // river banks, and gave the 2026 AI-bubble video (3c14ff) 184 s of 1920s silent-film piano.
  ['crash', /\b(stock market|market crash|wall street|bank run|great depression|financial crisis|borsa|buhran)\b/, { jazz: 0.8, piano: 0.4 }, ['jazz']],
  ['noir', /\b(hijack\w*|heist|fbi|detective\w*|murder\w*|manhunt|suspects?|ransom|gangster\w*|mafia|kidnap\w*|outlaw\w*)\b/,
    { jazz: 0.8, strings: 0.3, ambient: 0.3, drone: 0.2, pads: 0.2, guitar: -0.4 }, ['jazz']],
  ['electric', /\b(tesla|electric\w*|inventor|invent\w*|lightning|edison|alternating current|laborator\w*|wireless|elektrik\w*|mucit)\b/,
    { pads: 0.6, synth: 1.3, ambient: 0.3, orchestral: 0.5, piano: 0.4, beat: -0.6 }, ['pads']],
  ['siege', /\b(siege|conquest|conquer\w*|empire|sultan|ottoman\w*|byzant\w*|constantinople|crusade\w*|armies|battle\w*|kusatma|fetih|osmanli\w*|bizans)\b/,
    { epicPerc: 1, choir: 1, orchestral: 0.6, mideast: 0.6, drone: 0.3 }, ['choir', 'mideast']],
  ['cold', /\b(dyatlov|urals?|snow\w*|winter|frozen|blizzard|mountain pass|siberia\w*|avalanche|frostbite|hypotherm\w*|tipi)\b/,
    { drone: 1, ambient: 1, pads: 0.4, strings: 0.4, piano: 0.3, beat: -1, guitar: -1, jazz: -1, brass: -0.3, epicPerc: -0.4 }, ['drone']],
];
const GENRE_STYLE = {
  horror: { drone: 0.6, ambient: 0.5 }, inspire: { piano: 0.4, strings: 0.4, orchestral: 0.2 }, epic: { orchestral: 0.5, epicPerc: 0.3 },
  science: { ambient: 0.3, pads: 0.2 }, crime: { ambient: 0.2, drone: 0.2 }, finance: { piano: 0.2 }, documentary: { strings: 0.2, piano: 0.2 },
};
/* Free words (musicHint, topic bible) -> features. */
const WORD_FEAT = [
  [/synth|electronic|edm|analog/, 'synth'], [/\bbeats?\b|trap|drum machine|hip.?hop|dubstep/, 'beat'], [/orchestr|symphon/, 'orchestral'],
  [/string|violin|cello/, 'strings'], [/piano/, 'piano'], [/solo piano/, 'soloPiano'], [/jazz|\bsax|swing|ragtime|big band|trumpet|clarinet|noir/, 'jazz'],
  [/choir|choral|chant/, 'choir'], [/\boud\b|\bney\b|middle.?eastern|darbuka|duduk|mehter/, 'mideast'], [/drone/, 'drone'], [/ambient|atmospher/, 'ambient'],
  [/percussion|taiko|war drum|timpani/, 'epicPerc'], [/guitar|banjo|country|americana|folk/, 'guitar'], [/\brock\b|electric guitar/, 'eguitar'],
  [/ukulele|quirky|playful|upbeat|corporate/, 'quirky'], [/\bpads?\b/, 'pads'],
];
const GENRE_THEME = {
  documentary: { sad: 0.35, curious: 0.25, reveal: 0.2, calm: 0.2 }, crime: { dread: 0.4, tension: 0.3, sad: 0.3 },
  epic: { triumph: 0.3, sad: 0.35, tension: 0.35 }, science: { curious: 0.3, reveal: 0.3, calm: 0.2, triumph: 0.2 },
  inspire: { sad: 0.35, triumph: 0.35, calm: 0.3 }, finance: { tension: 0.3, sad: 0.4, dread: 0.3 }, horror: { dread: 0.6, sad: 0.4 },
};

/* Topic-bible keys that describe how the film LOOKS (src/topic): never read as what it is about. */
const VISUAL_KEYS = /^(variants?|typography|headline|body|caption|textstyles|iconset|icons?|palette|accent2?|grade|keephue|backdrops?|eratexture|presentation|opening|signaturedevice|motif|look|looks|font|fonts)$/;

/** Every string inside the topic bible, and which of them talk about the music (wanted) or rule it out (avoided). */
function topicTexts(topic) {
  const all = [];
  const want = [];
  const avoid = [];
  const AVOID = /avoid|never|\bnot\b|forbid|\bban|dont|kacin|yasak/;
  const walk = (v, key, musicCtx, avoidCtx, depth) => {
    if (depth > 5 || v == null) return;
    const k = fold(String(key ?? ''));
    // The bible's LOOK is not its topic: a look variant "deep-space-cyan" / "retro-nasa", a "rocket" icon or the
    // Space Grotesk font made the 2009 submarine film a "space" story (ambient/synth, a galaxy-named theme).
    if (VISUAL_KEYS.test(k)) return;
    const mus = musicCtx || /music|score|sound|instrument|audio|muzik/.test(k);
    const avo = avoidCtx || AVOID.test(k);
    if (typeof v === 'string') {
      all.push(v);
      if (mus) (avo ? avoid : want).push(v);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key, mus, avo, depth + 1));
    if (typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, kk, mus, avo, depth + 1);
  };
  if (typeof topic === 'string') all.push(topic);
  else walk(topic, '', false, false, 0);
  return { all: all.join(' '), want: want.join(' '), avoid: avoid.join(' ') };
}

/** Duration-weighted median of the scenes' own era stamps (docu.js sceneEras), or null. */
function sceneEraYear(script, secs) {
  const scenes = script?.scenes ?? [];
  const d = sceneSecondsOf(script, secs);
  const ys = [];
  scenes.forEach((sc, i) => {
    const m = String(sc?.era ?? '').match(/(?<!\d)(1\d{3}|20\d{2})(?!\d)/);
    if (m && d[i] > 0) ys.push([Number(m[1]), d[i]]);
  });
  if (!ys.length) return null;
  ys.sort((a, b) => a[0] - b[0]);
  const half = ys.reduce((s, [, w]) => s + w, 0) / 2;
  let acc = 0;
  for (const [y, w] of ys) {
    acc += w;
    if (acc >= half) return y;
  }
  return ys.at(-1)[0];
}

/**
 * The story year: script.musicEra / script.era first ("1971 (...)", "1880-1943", "1453"); a news video with no era is set now; then
 * the scenes' own era stamps (scene.era, by screen time); then the narration's centre. 27 Ekim 2026: Chernobyl
 * (20261026-24122a) had no script.era, the narration median gave 1976 ("RBMK-1000" = year 1000 over 16 scenes,
 * "Soviet" = 1965 overriding "in 1986") while 73 of its 146 scenes were stamped 1986. A digit year in the title
 * outranks scene stamps that disagree by more than 40 years: Hastings (20261010-989df5, "1066: The 19 Days…") has
 * 2026 stamped on 514 s of its 1066 battle narration.
 */
export function storyYear(script, secs) {
  // script.musicEra: the pipeline's music-only year (docu.js musicMeta) — script.era also drives visuals and QA.
  const era = String(script?.musicEra ?? script?.era ?? script?.topic?.era ?? '');
  const m = era.match(/(?<!\d)(1\d{3}|20\d{2})(?:\s*[-–]\s*(1\d{3}|20\d{2}))?(?!\d)/);
  if (m) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    return b - a <= 15 ? Math.round((a + b) / 2) : a + 15;
  }
  const ys = yearsIn(era);
  if (ys.length) return ys[0];
  if (script?.format === 'news') return PRESENT;
  const se = sceneEraYear(script, secs);
  if (se !== null) {
    const ty = [...new Set(digitYears(String(script?.title ?? '')))];
    return ty.length === 1 && Math.abs(ty[0] - se) > 40 ? ty[0] : se;
  }
  return median(sceneYears(script).filter((y) => y !== null));
}

/* The jazz age, by topic: a market crash, a noir/crime story or prohibition, named in the title, chapters or musicHint. */
const PROHIBITION = /\b(prohibition|speakeasy|speakeasies|bootleg\w*|capone|roaring (?:twenties|20s))\b/;
const topicRe = (name) => TOPIC_STYLE.find(([n]) => n === name)[1];

/**
 * The film's musical brief: feature weights from era, topic, style and the topic bible. In a serious or grave story
 * no era/topic weight may ask for jazz, groove, quirky or guitar (27 Ekim 2026) — except jazz in the jazz age
 * (1915-1960 and a crash/noir/prohibition head, never news). Signature colours come only from the topics the
 * title/chapters name or what the musicHint asks for, never from an era weight.
 */
export function styleProfile(script, genre, { gravity = storyGravity(script, genre), secs } = {}) {
  const year = storyYear(script, secs);
  const w = {};
  const add = (o, k = 1) => {
    for (const [f, v] of Object.entries(o)) w[f] = (w[f] ?? 0) + v * k;
  };
  if (year !== null && year !== undefined) add(ERA_STYLE.find(([a, b]) => year >= a && year <= b)?.[2] ?? {});
  add(GENRE_STYLE[genre] ?? {});
  const tt = topicTexts(script?.topic);
  const head = fold([script?.title, script?.era, script?.musicHint, script?.musicPrompt, ...(script?.chapters ?? []), tt.all].filter(Boolean).join(' '));
  const sigHead = fold([script?.title, script?.musicHint, script?.musicPrompt, ...(script?.chapters ?? [])].filter(Boolean).join(' '));
  const hintText = fold([script?.musicHint, script?.musicPrompt].filter(Boolean).join(' '));
  const body = fold((script?.scenes ?? []).map((s) => stripTags(s.say)).join(' '));
  const inRange = (a, b) => year !== null && year !== undefined && year >= a && year <= b;
  const topics = [];
  const hits = [];
  for (const [name, re, o0, colours0 = []] of TOPIC_STYLE) {
    // Noir is jazz only in its own era (1920-1960): a 2026 murder hears drones and pads.
    const noirOff = name === 'noir' && !inRange(1920, 1960);
    const o = noirOff ? { ...o0, jazz: 0, drone: (o0.drone ?? 0) + 0.3, ambient: (o0.ambient ?? 0) + 0.2 } : o0;
    const colours = noirOff ? ['drone'] : colours0;
    const inBody = (body.match(new RegExp(re.source, 'g')) ?? []).length;
    if (re.test(head)) {
      topics.push(name);
      add(o);
      // The topic the film keeps talking about leads the colours (1453 mentions ships, but it is a siege).
      if (re.test(sigHead)) hits.push({ colours, n: 3 * (head.match(new RegExp(re.source, 'g')) ?? []).length + inBody });
    } else if (inBody >= 6) {
      topics.push(`${name}~`);
      add(o, 0.5);
    }
  }
  const words = (s, k) => {
    const f = fold(s ?? '');
    if (!f.trim()) return;
    for (const [re, feat] of WORD_FEAT) if (re.test(f)) w[feat] = (w[feat] ?? 0) + k;
  };
  words([script?.musicHint, script?.musicPrompt, tt.want].filter(Boolean).join(' '), 0.6);
  words(tt.avoid, -1.4);
  const jazzAge = inRange(1915, 1960) && script?.format !== 'news' && (topicRe('crash').test(sigHead) || topicRe('noir').test(sigHead) || PROHIBITION.test(sigHead));
  if (isSerious(gravity)) for (const f of ['jazz', 'groove', 'quirky', 'guitar', 'eguitar']) if ((w[f] ?? 0) > 0 && !(f === 'jazz' && jazzAge)) w[f] = 0;
  // Signature colours: the leading topic's own, then what the musicHint asks for — each gets a palette slot when the library has one.
  const sig = hits.sort((a, b) => b.n - a.n).flatMap((h) => h.colours);
  if (hintText.trim()) for (const [re, feat] of WORD_FEAT) if (re.test(hintText)) sig.push(feat);
  const signature = [...new Set(sig)].filter((f) => (w[f] ?? 0) > 0).slice(0, 2);
  return { year: year ?? null, w, topics, signature, jazzAge };
}

/**
 * Era/topic fit of a track, about -0.27..+0.27. The strongest wish a track
 * answers counts fully, the others at a third (an orchestra that also has
 * strings and piano is one answer, not three); every unwanted trait counts.
 */
function styleScore(t, prof) {
  const f = trackFeatures(t);
  const pos = [];
  let neg = 0;
  for (const [k, v] of Object.entries(prof.w)) if (f[k]) (v > 0 ? pos.push(v) : (neg += v));
  pos.sort((a, b) => b - a);
  const s = (pos[0] ?? 0) + 0.35 * pos.slice(1).reduce((a, v) => a + v, 0) + neg;
  return 0.11 * clamp(s, -2.5, 2.5);
}

/** Production value: dynamics and an arc are worth something; quirky/loop-y background music is not, in a serious film. */
function qualityOf(t) {
  const f = trackFeatures(t);
  const dyn = contrast(t.energy ?? []);
  let q = 0.08 * dyn + (f.build ? 0.04 : 0) + (f.melodic ? 0.02 : 0);
  if (f.quirky) q -= 0.18;
  if (f.groove) q -= 0.06;
  if (Number(t.lufs) > -10 && dyn < 0.25) q -= 0.03;
  return q;
}

/**
 * History, newest first: [{ key, main, tracks }]. A TIE-BREAK among tracks that already fit (27 Ekim 2026): 0.08 per
 * recent use and 0.06 for a main theme, the newest most, capped at 0.15. At 0.3 per use it outweighed the mood:
 * Chernobyl's reveal slot went to Highway Nocturne (reveal fit 0.6) over The Challenger (0.9, used once before).
 */
function historyPenalty(t, recent) {
  let p = 0;
  recent.forEach((e, i) => {
    const k = Math.max(0.3, 1 - 0.06 * i);
    if (e.tracks?.includes(t.id)) p += 0.08 * k;
    if (e.main === t.id) p += 0.06 * k;
  });
  return Math.min(HISTORY_CAP, p);
}

/**
 * GRIEF: a scene that states a real death or loss (scene.grief from the pipeline, else this fallback). Checked per
 * sentence, negations first ("no one was killed" is not grief). Chernobyl 9:28 "Borys Baranov died" sat under an
 * urgent energy-4 cue; Hastings' "William is dead" under Defying Gravity (triumph 0.6, sad 0).
 */
export const GRIEF = /\b(died|dies|dying|killed|kills|dead|deaths?|death toll|funeral|buried|burial|mourn\w*|victims?|perished|executed|suicide|lost (?:his|her|their) li(?:fe|ves)|never (?:came|come) home)\b/i;
export const NOT_GRIEF = /\b(no|not|never|nobody|no one|none|without|zero)\b[^.!?]{0,40}\b(killed|died|dead|deaths?|injur\w*|casualt\w*|victims?)\b/i;
/*
 * Not a death that happened (27 Ekim 2026 review): a question ("was anyone actually killed?"), a condition ("If your
 * bank dies, your money dies with it"), a legend or a claim ("The legend calls them suicide divers", "invented death
 * tolls" — 7 of Chernobyl's 11 grief hits sat in its myth-busting hook). Same list in timeline.js and docu-script.js.
 */
export const GRIEF_UNREAL = /\?\s*$|\b(if|unless|whether|legend\w*|myths?|mythical|rumou?r\w*|hoax|invented|fabricated|supposedly|claimed|alleged\w*)\b/i;
/* "Not one of the eight musicians survived" (Titanic 9:06) is a death line, not a relief line. Same in timeline.js / docu-script.js. */
export const NO_SURVIVOR = /\b(not one|none|no one|nobody|did not|didn't|never|not a single)\b[^.!?]{0,40}\bsurviv\w*/i;
export const griefSentence = (s) => ((GRIEF.test(s) && !NOT_GRIEF.test(s)) || NO_SURVIVOR.test(s)) && !GRIEF_UNREAL.test(s);
export function griefScene(sc) {
  if (!sc) return false;
  if (sc.grief === true) return true;
  if (sc.grief === false) return false;
  return stripTags(sc.say ?? '').split(/(?<=[.!?])\s+/).some(griefSentence);
}
/*
 * RELIEF: a line that says nobody died or somebody lived ("Nobody was hurt, and no radiation leak was reported",
 * "both boats came home"). The submarine film (20261024-373aaf) put its mournful theme Paulseante on three of them:
 * the music grieved while the narrator said everyone survived.
 */
// Not bare "survived" or "walked away": "the group survived more strikes" (Saudi), "the Guard survived" the 1812 retreat,
// "the Russian army walked away intact" (Borodino) are no relief.
const RELIEF = /\b(unharmed|unhurt|uninjured|rescued|came (?:back )?home|escaped alive|no one was hurt|nobody was hurt|survived without)\b/i;
export function reliefScene(sc) {
  if (!sc || griefScene(sc)) return false;
  return stripTags(sc.say ?? '').split(/(?<=[.!?])\s+/).some((s) => NOT_GRIEF.test(s) || RELIEF.test(s));
}
/* A track too mournful for a relief line. */
const mournful = (t) => num(t?.tags?.moodFit?.sad, 0) >= 0.7;
/*
 * Period-safe (audit R13): a story before PERIOD_YEAR hears no electronic/ambient culture and no synth, pad, drum
 * machine or sound design. Titanic 1912 got Perfect Strangers Things and Moving In The Shadows; the 1066 theme was
 * Last Sunrise (piano, strings, synth pad) — both passed the old style-score gate at +0.03/+0.06.
 */
const PERIOD_YEAR = 1950;
const MODERN_INSTR = /synth|\bpad\b|drum machine|electronic|sound design/i;
export function periodSafe(t) {
  const g = t?.tags ?? {};
  return !/electronic|ambient/.test(fold(g.culture ?? '')) && !MODERN_INSTR.test((Array.isArray(g.instruments) ? g.instruments : [g.instruments ?? '']).join(' '));
}
const periodStory = (ctx) => Number.isFinite(ctx?.profile?.year) && ctx.profile.year < PERIOD_YEAR;
/* A track that can carry a death line: mournful and restrained. */
const griefOk = (t) => num(t.tags?.moodFit?.sad, 0) >= 0.5 && (Number(t.tags?.energy) || 3) <= 3;
/* What a cue asks of a track, for the conditional tracks (americana: reflection/hope; culture: never grief/theme). */
const roleOf = (cue) => (cue.grief ? 'grief' : cue.mood === 'calm' || cue.mood === 'sad' ? 'reflection' : cue.mood === 'triumph' ? 'hope' : cue.mood);
const isVerify = (t) => t.verify ?? VERIFY_LIST.test(`${t.title ?? ''} ${t.file ?? ''}`);
/** Cue-level gate: the gravity rule for this cue's role and energy, and the per-video caps. */
function cueGate(t, cue, ctx, role = roleOf(cue)) {
  const u = ctx.uses?.get(t.id) ?? 0;
  if (isVerify(t) && u >= VERIFY_MAX) return false;
  if (!isSerious(ctx.gravity)) return true;
  return fitsGravity(t, ctx.gravity, { ...ctx.gctx, role, cue });
}
/** Grief first: on a death line keep only the mournful tracks, when there are any. Relief: no mourning, when it can. */
function griefFilter(cands, cue) {
  if (cue.relief) {
    const ok = cands.filter((t) => !mournful(t));
    return ok.length ? ok : cands;
  }
  if (!cue.grief) return cands;
  const ok = cands.filter(griefOk);
  return ok.length ? ok : cands;
}
/*
 * The period comes before the fit band: a track the era/topic rules push away (a synth drone under 1912, a guitar
 * under a submarine) is dropped while at least two period-right ones remain — otherwise a 0.2 better mood tag would
 * put synths under the Titanic.
 */
function eraGate(cands, ctx) {
  const ok = cands.filter((t) => (ctx.style?.get(t.id) ?? 0) > -0.05);
  // Before 1950 the R13 rule is hard while two period-safe tracks remain.
  if (periodStory(ctx)) {
    const safe = ok.filter(periodSafe);
    if (safe.length >= 2) return safe;
  }
  return ok.length >= 2 ? ok : cands;
}
/*
 * Across videos: a track this channel used in its last RECENT_BAN videos sits out while two others in the fit band
 * remain. As a tie-break only (0.08 a use), 19 of 35 tracks came back in 3+ of 12 replanned videos (Laniakea in 7).
 */
const RECENT_BAN = 3;
function freshGate(cands, ctx) {
  if (!ctx.recentIds?.size) return cands;
  const ok = cands.filter((t) => !ctx.recentIds.has(t.id));
  return ok.length >= 2 ? ok : cands;
}
/** Fit before anything else: keep the tracks within 0.15 of the best fit, and at least REUSE_FIT when one reaches it. */
function fitBand(cands, fitOf) {
  if (cands.length < 2) return cands;
  const fits = new Map(cands.map((t) => [t, fitOf(t)]));
  const best = Math.max(...fits.values());
  const band = cands.filter((t) => fits.get(t) >= Math.max(REUSE_FIT, best - 0.15) - 1e-9);
  return band.length ? band : cands.filter((t) => fits.get(t) >= best - 0.15 - 1e-9);
}

/** Scene energy (art director, 1-5) per run: level, peak, where the peak lands and whether the run climbs. */
function annotateEnergy(runs, scenes) {
  runs.forEach((r, k) => {
    if (r.silence) return;
    const es = r.units.map((u) => ({ u, e: Number(scenes[u.i]?.energy) })).filter((x) => Number.isFinite(x.e) && x.e >= 1 && x.e <= 5);
    if (es.length) {
      let s = 0;
      let w = 0;
      for (const { u, e } of es) {
        s += e * u.len;
        w += u.len;
      }
      r.energy = w ? s / w : undefined;
      r.energyPeak = Math.max(...es.map((x) => x.e));
      const third = Math.max(1, Math.floor(es.length / 3));
      if (es.length >= 3 && mean(es.slice(-third).map((x) => x.e)) - mean(es.slice(0, third).map((x) => x.e)) >= 1.2) r.rising = true;
    }
    // The swell lands on the reveal: the first scene at full energy (or a reveal) that is not the run's first.
    const pk = r.units.find((u, j) => j > 0 && (Number(scenes[u.i]?.energy) >= 5 || u.mood === 'reveal'));
    if (pk) r.peakAt = pk.from - r.from;
    // A dark or light run that hands over to a peak is a build-up into it.
    const n = runs[k + 1];
    if (n && !n.silence && n.fam === 'peak' && n.chapter === r.chapter && (r.fam === 'dark' || r.fam === 'light')) r.rising = true;
  });
}
const isPeakRun = (r) => r.fam === 'peak' || (r.energyPeak ?? 0) >= 5;

/**
 * After a peak the music breathes: a short true silence before the next feeling enters (same chapter only).
 * First choice: the next run is a different feeling. A film still gets about one breath per four minutes
 * (BREATH_EVERY): the 13.9-min submarine film (20261024-373aaf) had 11 full-energy scenes and NO breath,
 * because every peak sat in a tension run followed by more tension — the strongest of those peaks then
 * breathe too, spaced BREATH_GAP apart.
 */
const BREATH_EVERY = 240;
const BREATH_GAP = 90;
function addBreaths(runs) {
  const open = (r, n) => n && !r.silence && !n.silence && !r.cold && !n.resume && !n.cold && n.chapter === r.chapter
    && !n.units[0]?.card && isPeakRun(r) && n.fam !== 'peak' && n.len >= MIN_CUE + 4;
  const at = new Set();
  runs.forEach((r, k) => { if (open(r, runs[k + 1]) && runs[k + 1].fam !== r.fam) at.add(k); });
  const total = runs.length ? runs.at(-1).to - runs[0].from : 0;
  const want = Math.floor(total / BREATH_EVERY);
  // A peak that ends its chapter breathes INTO the chapter card: the card's own hit speaks in the silence and the
  // next chapter's cue enters after it (instead of the ~0.7 s button) — the film's turns land, like an edit suite's.
  const intoCard = (r, n) => n && !r.silence && !n.silence && !r.cold && !n.resume && !n.cold && !!n.units[0]?.card
    && (r.fam === 'peak' || (r.energyPeak ?? 0) >= 5) && n.len >= MIN_CUE + 4;
  if (at.size < want) {
    const far = (k) => [...at].every((j) => Math.abs(runs[j].to - runs[k].to) >= BREATH_GAP);
    const more = runs.map((r, k) => ({ r, k })).filter(({ r, k }) => !at.has(k) && (r.energyPeak ?? 0) >= 5 && (open(r, runs[k + 1]) || intoCard(r, runs[k + 1])))
      .sort((a, b) => (b.r.energyPeak ?? 0) - (a.r.energyPeak ?? 0) || (b.r.energy ?? 0) - (a.r.energy ?? 0) || a.k - b.k);
    for (const { k } of more) if (at.size < want && far(k)) at.add(k);
  }
  const out = [];
  for (let k = 0; k < runs.length; k++) {
    const r = runs[k];
    out.push(r);
    if (!at.has(k)) continue;
    const n = runs[k + 1];
    const b = r3(clamp(0.06 * n.len, BREATH_MIN, BREATH_MAX));
    out.push({ units: [], from: n.from, to: n.from + b, len: b, silence: true, breath: true, chapter: n.chapter, fam: null, mood: 'silence', bounds: [] });
    n.from = r3(n.from + b);
    n.len = r3(n.to - n.from);
    n.bounds = (n.bounds ?? []).filter((x) => x > n.from + 0.5);
  }
  return out;
}

function normW(o) {
  const s = Object.values(o).reduce((a, v) => a + (v || 0), 0);
  return s ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v || 0) / s])) : {};
}
const moodMix = (t, w) => MOODS.reduce((s, m) => s + (w[m] ?? 0) * (t.tags.moodFit?.[m] ?? 0), 0);

/* Driving music (Survival Mode "tense, driving… urgency", In Battery) under a quiet scene is a trailer, not a film. */
const DRIVE = /driving|urgen|pounding|relentless|action/i;
function trackScore2(t, cue, ctx) {
  // Scene energy is weighed inside trackScore now (0.16, blended with the mood's target).
  let s = trackScore(t, cue, ctx);
  const sv = isSerious(ctx.gravity);
  const te = Number(t.tags.energy) || 3;
  if (sv && Number.isFinite(cue.energy) && te - cue.energy >= 1.5) s -= 0.25;
  // In a grave story, grief and calm want a mournful, restrained track, not a percussive tension cue.
  if (ctx.gravity === 'grave' && (cue.mood === 'sad' || cue.mood === 'calm') && t.tags.register) {
    if (t.tags.register === 'grave') s += 0.14;
    if (te >= 4) s -= 0.12;
  }
  // Battle music is for the battle: war horns and pounding drums under a storm, dying horses or the
  // wait in burnt Moscow (Napoleon, 4.5 min of "Clash Defiant") turn a grave story into a trailer.
  // So does a driving track under a quiet scene (energy < 3.5).
  if (sv && ((battleTrack(t) && !(Number(cue.energy) >= 4.5)) || (Number(cue.energy) < 3.5 && DRIVE.test(t.tags.description ?? '')))) s -= 0.3;
  // A death line under anything but a mournful, restrained track (when the pool has none).
  if (cue.grief && !griefOk(t)) s -= 0.5;
  // Nobody died here: no mourning under it.
  if (cue.relief && mournful(t)) s -= 0.3;
  return s;
}

/** A full-battle track: energy 5 and fast, or described as a battle / assault / war horns. */
export function battleTrack(t) {
  const g = t?.tags ?? {};
  const said = `${g.description ?? ''} ${g.bestUse ?? ''}`;
  return ((Number(g.energy) || 3) >= 5 && fold(g.tempo ?? '') === 'fast') || /\b(battle|assault|war horns|charge)\b/i.test(said);
}

function windowFit2(E, s, len, cue) {
  const c = cue.rising && !cue.cold ? { ...cue, mood: 'tension' } : cue;
  let f = windowFit(E, s, len, c);
  if (Number.isFinite(cue.peakAt) && cue.peakAt > 2) {
    const w = E.slice(s, s + Math.max(1, Math.round(len)));
    if (w.length) {
      const mx = Math.max(...w);
      f += 0.25 * (1 - Math.min(1, Math.abs(w.indexOf(mx) - cue.peakAt) / 6)) * (mx >= -3 ? 1 : 0.4);
    }
  }
  return f;
}

/** bestStart, energy-aware, and away from the stretches of this track the film has already played. */
function bestStart2(t, cue, used = []) {
  const E = t.energy ?? [];
  const D = Number(t.duration) || E.length;
  if (!E.length) return { s: 0, fit: 0 };
  const lead = leadIn(E);
  const len = cue.to - cue.from;
  const overlap = (s) => {
    let o = 0;
    for (const [a, b] of used) o += Math.max(0, Math.min(b, s + len) - Math.max(a, s));
    return Math.min(1, o / Math.max(1, len));
  };
  const back = Math.max(lead, Math.floor(D - len - 0.5));
  if (cue.final && D - lead >= len + 1 && endsNaturally(E) && overlap(back) < 0.5) return { s: back, fit: 0.6, backTimed: true };
  const maxS = Math.floor(D - len - 1.5);
  if (maxS <= lead) return { s: lead, fit: windowFit2(E, lead, len, cue) - 0.2 - overlap(lead), ov: overlap(lead) };
  let best = { s: lead, fit: -Infinity, ov: 0 };
  for (let s = lead; s <= maxS; s++) {
    const jump = s > 0 ? E[s] - E[s - 1] : 0;
    let bonus;
    if (s === lead) bonus = 0.06;
    else if (jump >= 3 && E[s] > -30) bonus = 0.08;
    else if ((s - lead) % 4 === 0) bonus = 0;
    else continue;
    const ov = overlap(s);
    const f = windowFit2(E, s, len, cue) + bonus - ov;
    if (f > best.fit + 1e-9) best = { s, fit: f, ov };
  }
  return best;
}

/** A free slot of the palette: the best fresh track for a cue (mood, style, era, quality, history), away from the palette's look-alikes. */
function pickSlot(ctx, cue, avoid, tag, { eraStrict = false } = {}) {
  const inPal = new Set(ctx.palette.map((t) => t.id));
  const fresh = ctx.pool.filter((t) => !inPal.has(t.id) && !avoid.has(t.id) && cueGate(t, cue, ctx));
  if (!fresh.length) return null;
  const fitOf = (t) => fitFor(t, cue, ctx);
  const gated = fresh.filter((t) => fitOf(t) >= 0.35 && genreFitOf(t, ctx) >= 0.2 && !trackFeatures(t).quirky);
  // Fit first, then the grief rule, then everything else (history only breaks ties, capped at HISTORY_CAP).
  const cands = freshGate(fitBand(eraGate(griefFilter(gated.length >= 2 ? gated : fresh, cue), ctx), fitOf), ctx);
  // A palette slot is optional: it never brings in a track that breaks the period (the runs it would carry choose later).
  if (eraStrict && cands.every((t) => (ctx.style?.get(t.id) ?? 0) <= -0.05 || (periodStory(ctx) && !periodSafe(t)))) return null;
  const scored = cands.map((t) => {
    const sim = ctx.palette.length ? Math.max(...ctx.palette.map((p) => similarity(p, t))) : 0;
    // A cold open is about impact (striking() already weighs contrast): no separate dynamics bonus there.
    const dyn = cue.cold ? 0.08 * contrast(t.energy ?? []) : 0;
    return { t, key: t.id, score: trackScore2(t, cue, ctx) + ctx.static.get(t.id) - ctx.hist.get(t.id) - dyn - 0.15 * Math.max(0, sim - 0.8) };
  });
  return pickNear(scored, rngFor(ctx.seed, 'slot', ctx.genre, tag, ctx.palette.length), 0.03, 4)?.t ?? null;
}

/**
 * The main theme: melodic, long enough to be heard three times, in the film's emotional core and its finale's mood.
 * Never one of this channel's last THEME_BAN_N themes, never a conditional or unverified track (27 Ekim 2026).
 */
function pickTheme(ctx, music, g) {
  const share = {};
  for (const { r } of music) for (const [m, v] of Object.entries(r.weights ?? {})) share[m] = (share[m] ?? 0) + v;
  const fin = music.at(-1)?.r?.weights ?? {};
  const gw = normW(GENRE_THEME[g] ?? GENRE_THEME.documentary);
  const sw = normW(share);
  const fw = normW(fin);
  let w = Object.fromEntries(MOODS.map((m) => [m, 0.4 * (gw[m] ?? 0) + 0.3 * (sw[m] ?? 0) + 0.3 * (fw[m] ?? 0)]));
  if (isSerious(ctx.gravity)) w = remapWeights(w);
  const banned = new Set(ctx.recent.slice(0, THEME_BAN_N).map((e) => e.main).filter(Boolean));
  // Before 1950 the theme is period-safe, with no fallback: no theme beats a synth-pad theme under 1066.
  const ok = ctx.pool.filter((t) => !banned.has(t.id) && !isVerify(t) && (!isSerious(ctx.gravity) || seriousClass(t) === 'safe') && !trackFeatures(t).quirky && (!periodStory(ctx) || periodSafe(t)));
  const long = ok.filter((t) => (Number(t.duration) || 0) - leadIn(t.energy ?? []) >= 60);
  // A theme is heard at least twice: only tracks that fit two of the runs themeSpots may give them (Chernobyl's and
  // Lula's themes fitted one run or none, so the film had no theme at all).
  const base = long.length ? long : ok;
  const total = music.at(-1)?.r?.to ?? 0;
  const stated = (t) => [...themeSpots(music, total, t, ctx)].filter((k) => {
    const r = music.find((m) => m.k === k)?.r;
    return r && fitFor(t, r, ctx) >= 0.5 && (!r.grief || griefOk(t)) && !(r.relief && mournful(t));
  }).length;
  const twice = base.filter((t) => stated(t) >= 2);
  const pool = freshGate(fitBand(eraGate(twice.length ? twice : base, ctx), (t) => moodMix(t, w)), ctx);
  if (!pool.length) return null;
  const scored = pool.map((t) => {
    const f = trackFeatures(t);
    let s = 0.5 * moodMix(t, w) + ctx.static.get(t.id) - ctx.hist.get(t.id) + 0.2 * genreFitOf(t, ctx) + cultureBonus(t.tags.culture, ctx.pref);
    s += ((Number(t.duration) || 0) >= 150 ? 0.05 : 0) + (f.melodic ? 0.04 : -0.06) + (f.beat ? -0.05 : 0);
    if (fold(t.tags.vocals) === 'wordless' && g !== 'epic' && g !== 'horror') s -= 0.05;
    // The theme comes back on the grief and the finale: in a grave story it is a melody that can mourn,
    // not a wall of drums (1453: "Clash Defiant" under the emperor's death).
    if (ctx.gravity === 'grave' && t.tags.register) {
      s += 0.15 * num(t.tags.moodFit?.sad, 0) + (t.tags.register === 'grave' ? 0.05 : 0);
      if ((Number(t.tags.energy) || 3) >= 5) s -= 0.12;
    }
    return { t, key: t.id, score: s };
  });
  return pickNear(scored, rngFor(ctx.seed, 'theme', g), 0.03, 4)?.t ?? null;
}

/**
 * Where the theme speaks: its statement after the title, one callback mid-film, and the finale. The statement only
 * on a run in the first 35% the theme fits (>= 0.5): in 6 of 11 audited videos it sat under a tension hook with a fit
 * of 0.30-0.40 (Chernobyl's gentle piano Last Sunrise on a tension run at 0:04). Else mid-film and finale only.
 */
function themeSpots(music, total, theme = null, ctx = null) {
  const plain = music.filter(({ r }) => !r.resume);
  const idx = new Map(plain.map((m, j) => [m.k, j]));
  const spots = new Set();
  const fits = (r) => !theme || !ctx || (fitFor(theme, r, ctx) >= 0.5 && (!r.grief || griefOk(theme)) && !(r.relief && mournful(theme)));
  const first = plain.find(({ r }) => !r.cold && r.len >= MIN_CUE && r.from <= 0.35 * total && fits(r));
  if (first) spots.add(first.k);
  const fin = plain.at(-1);
  if (fin && !fin.r.cold) spots.add(fin.k);
  const near = (k) => [...spots].some((s) => Math.abs(idx.get(s) - idx.get(k)) <= 1);
  if (plain.length >= 8) {
    const pref = { sad: 1, peak: 0.8, bright: 0.7, light: 0.6 };
    const mid = plain
      .filter(({ r, k }) => !r.cold && r.len >= 18 && pref[r.fam] && r.from >= 0.4 * total && r.from <= 0.75 * total && !spots.has(k) && !near(k) && fits(r))
      .map((m) => ({ ...m, s: pref[m.r.fam] - 2 * Math.abs(m.r.from / total - 0.6) + Math.min(0.2, m.r.len / 300) }))
      .sort((a, b) => b.s - a.s || a.k - b.k)[0];
    if (mid) spots.add(mid.k);
  }
  return spots;
}

/**
 * Choose a palette track for a cue. A palette track comes back only when it fits this cue (mood fit >= 0.55, its
 * energy within 1.2 of the scene's, at most 0.3 of the stretch already played) — else a fresh track joins the
 * palette (27 Ekim 2026: "any palette track with fit >= 0.35" put the reveal track Highway Nocturne on a 98 s
 * tension run and replayed its passage).
 */
function choosePalette(cue, ctx, avoid) {
  const fitOf = (t) => fitFor(t, cue, ctx);
  const eOk = (t) => !Number.isFinite(cue.energy) || Math.abs((Number(t.tags.energy) || 3) - cue.energy) <= REUSE_ENERGY;
  const cands = ctx.palette.filter((t) => !avoid.has(t.id) && t.id !== ctx.theme?.id && (ctx.uses.get(t.id) ?? 0) < MAX_USES
    && cueGate(t, cue, ctx) && fitOf(t) >= REUSE_FIT && eOk(t));
  const starts = new Map(cands.map((t) => [t.id, bestStart2(t, cue, ctx.ranges.get(t.id))]));
  const fresh0 = cands.filter((t) => (starts.get(t.id).ov ?? 0) <= REUSE_OVERLAP);
  const scored = fitBand(eraGate(griefFilter(fresh0, cue), ctx), fitOf).map((t) => {
    const st = starts.get(t.id);
    const u = ctx.uses.get(t.id) ?? 0;
    const colour = ctx.colour.has(t.id) ? (u ? 0.02 : 0.06) : 0;
    // Coming back is fine; replaying the same passage is not.
    return { t, key: t.id, st, score: trackScore2(t, cue, ctx) + ctx.static.get(t.id) - ctx.hist.get(t.id) - 0.04 * u + colour + 0.1 * clamp(st.fit, -1, 1) - 0.12 * (st.ov ?? 0) };
  });
  const best = pickNear(scored, rngFor(ctx.seed, 'cue', ctx.genre, Math.round(cue.from * 10)), 0.02, 3);
  const eraBad = (t) => (ctx.style?.get(t.id) ?? 0) <= -0.05 || (periodStory(ctx) && !periodSafe(t));
  const take = (t) => {
    ctx.palette.push(t);
    return t;
  };
  const passOk = (t) => (bestStart2(t, cue, ctx.ranges.get(t.id)).ov ?? 0) <= REUSE_OVERLAP;
  const capOf = (t) => (t.id === ctx.theme?.id ? THEME_MAX_USES : MAX_USES);
  const byFit = (a, b) => fitOf(b) - fitOf(a) || a.id.localeCompare(b.id);
  // The best palette track, when it carries the line: mournful on a death line, of the period before 1950.
  if (best && !(cue.grief && !griefOk(best.t)) && !eraBad(best.t)) return best.t;
  /*
   * A death line in a loud run (1453 12:37, the emperor's death in the energy-4.5 fall of the city; 1812 13:34): the
   * energy match kept every mournful palette track out and the full palette kept a fresh one out — The Challenger
   * (sad 0.1, triumph 0.7) played. Grief outranks both: a mournful palette track that fits, else a fresh one (past the
   * palette cap), else any mournful palette track — the theme too: the theme returning on a death line.
   */
  if (cue.grief) {
    const mourn = (minFit, withTheme) => ctx.palette.filter((t) => !avoid.has(t.id) && (withTheme || t.id !== ctx.theme?.id) && griefOk(t)
      && (ctx.uses.get(t.id) ?? 0) < capOf(t) && cueGate(t, cue, ctx) && !eraBad(t) && fitOf(t) >= minFit && passOk(t)).sort(byFit)[0];
    const m = mourn(0.45, false);
    if (m) return m;
    const f = pickSlot(ctx, cue, avoid, `grief${Math.round(cue.from)}`);
    if (f && griefOk(f) && !eraBad(f)) return take(f);
    const any = mourn(0, true);
    if (any) return any;
  }
  const fresh = ctx.palette.length < PALETTE_HARD_MAX ? pickSlot(ctx, cue, avoid, `fill${Math.round(cue.from)}`) : null;
  if (fresh && !eraBad(fresh) && (!best || eraBad(best.t) || griefOk(fresh) || fitOf(fresh) > fitOf(best.t))) return take(fresh);
  if (best && !eraBad(best.t)) return best.t;
  // The period outranks the reuse threshold: a period-right palette track that still fits comes back before a track
  // that breaks the era (a synth under 1912) plays (energy and passage rules kept).
  const back = (minFit) => ctx.palette.filter((t) => !avoid.has(t.id) && t.id !== ctx.theme?.id && (ctx.uses.get(t.id) ?? 0) < MAX_USES && cueGate(t, cue, ctx)
    && !eraBad(t) && fitOf(t) >= minFit && eOk(t) && (!cue.grief || griefOk(t)) && passOk(t)).sort(byFit)[0];
  const right = back(0.45) ?? back(0.3);
  if (right) return right;
  if (best) return best.t;
  if (fresh) return take(fresh);
  // Palette full or nothing fits: the best period-right palette track the gate allows, then any pool track.
  const order = (a, b) => Number(eraBad(a)) - Number(eraBad(b)) || fitOf(b) - fitOf(a) || trackScore2(b, cue, ctx) - trackScore2(a, cue, ctx) || a.id.localeCompare(b.id);
  const pal = ctx.palette.filter((t) => !avoid.has(t.id) && (ctx.uses.get(t.id) ?? 0) < (t.id === ctx.theme?.id ? THEME_MAX_USES : MAX_USES) && cueGate(t, cue, ctx)).sort(order);
  if (pal.length) return pal[0];
  const any = ctx.pool.filter((t) => !avoid.has(t.id) && cueGate(t, cue, ctx)).sort((a, b) => (ctx.uses.get(a.id) ?? 0) - (ctx.uses.get(b.id) ?? 0) || order(a, b));
  return any[0] ?? null;
}

/**
 * A forced track (cold open, theme spot, colour) still has to suit the run (fit >= 0.4; the theme >= 0.5, the same
 * bar as its first statement): else the palette chooses.
 */
function forcedFits(t, cue, ctx, role) {
  if (fitFor(t, cue, ctx) < (t.id === ctx.theme?.id ? 0.5 : 0.4) && !cue.cold) return false;
  if (cue.grief && !griefOk(t)) return false;
  if (cue.relief && mournful(t)) return false;
  const cap = t.id === ctx.theme?.id ? THEME_MAX_USES : MAX_USES;
  return (ctx.uses.get(t.id) ?? 0) < cap && cueGate(t, cue, ctx, role);
}

/** One run -> parts: the chosen (or forced) track from its best unused stretch; a chain onto another palette track when it runs out. */
function assignRun(cue, ctx, avoid, forced = null, chained = false) {
  const role = forced && forced.id === ctx.theme?.id && !cue.grief ? 'theme' : roleOf(cue);
  const t = forced && !avoid.has(forced.id) && forcedFits(forced, cue, ctx, role) ? forced : choosePalette(cue, ctx, avoid);
  if (!t) return [{ ...cue, noTrack: true }];
  const st = bestStart2(t, cue, ctx.ranges.get(t.id));
  ctx.uses.set(t.id, (ctx.uses.get(t.id) ?? 0) + 1);
  const len = cue.to - cue.from;
  const avail = (Number(t.duration) || 0) - st.s - 0.5;
  const part = { ...cue, track: t, startAt: st.s, backTimed: !!st.backTimed, chained, theme: !!ctx.theme && t.id === ctx.theme.id };
  const mark = (to) => ctx.ranges.set(t.id, [...(ctx.ranges.get(t.id) ?? []), [st.s, st.s + (to - cue.from)]]);
  if (avail >= len + XFADE / 2 || len - avail < 4) {
    mark(cue.to);
    return [part];
  }
  const latest = cue.from + avail - XFADE / 2 - 0.5;
  // The chained remainder is a cue too: never a 6-11 s stub between two crossfades (Lula 9:52, Hormuz 4:55).
  const roomy = (b) => cue.to - b >= MIN_CUE;
  const cands2 = (cue.bounds ?? []).filter((b) => b >= cue.from + MIN_CUE && b <= latest);
  const anyCut = (cue.bounds ?? []).filter((b) => b >= cue.from + 3 && b <= latest);
  const pick = (xs) => xs.filter(roomy).at(-1) ?? null;
  const early = Math.min(latest, cue.to - MIN_CUE);
  const cut = pick(cands2) ?? pick(anyCut) ?? (early >= cue.from + 5 ? quietPoint(ctx.speech, Math.max(cue.from + 5, early - 6), early)
    : cands2.length ? cands2.at(-1) : anyCut.length ? anyCut.at(-1) : quietPoint(ctx.speech, Math.max(cue.from + 5, latest - 6), Math.max(cue.from + 5, latest)));
  mark(cut);
  const first = { ...part, to: cut, final: false, bounds: (cue.bounds ?? []).filter((b) => b < cut) };
  const rest = { ...cue, from: cut, cold: false, peakAt: Number.isFinite(cue.peakAt) && cue.peakAt > cut - cue.from ? cue.peakAt - (cut - cue.from) : undefined, bounds: (cue.bounds ?? []).filter((b) => b > cut) };
  return [first, ...assignRun(rest, ctx, new Set([...avoid, t.id]), null, true)];
}

/* A war story (cond:battle tracks may play its battle peaks; 'epic' genre fit counts as war music there). */
const WAR_WORDS = /\b(war|wars|battle\w*|siege|besieged|invasion|invaded|army|armies|troops|soldiers|shield wall|front line|offensive|artillery)\b/g;
/* A US story, for the Americana reflection tracks (never "Amerika" in a Titanic title alone: it needs the year too). */
const US_STORY = /\b(america|american|americans|united states|usa|texas|california|new york|chicago|nashville|appalach\w*|dust bowl|wild west|tennessee|kentucky|oklahoma|alabama|mississippi)\b/;
/* Fewer serious tracks than this: the plan says so (the pool is never padded with light ones). */
const THIN_POOL = 24;

function planScoreV2({ script, sceneSeconds, lib, genre, seed, root, history = [], log = () => {} } = {}) {
  const L = prep(lib, root);
  const g = GENRES.includes(genre) ? genre : GENRES.includes(script?.genre) ? script.genre : 'documentary';
  const scenes = script?.scenes ?? [];
  const secs = sceneSecondsOf(script, sceneSeconds);
  const units = timeline(scenes, secs);
  if (!units.length) return { cues: [] };
  const notes = [];
  const note = (m) => {
    notes.push(m);
    log(m);
  };
  const gravity = storyGravity(script, g);
  const profile = styleProfile(script, g, { gravity, secs });
  const year = profile.year;
  const pref = culturePrefs(script, g, year);
  // The story as the gate sees it: news or not, its year, the worlds it names, a US or war story, the jazz age.
  const head = fold([script?.title, script?.musicHint, script?.musicPrompt, ...(script?.chapters ?? [])].filter(Boolean).join(' '));
  const body = fold(scenes.map((s) => stripTags(s.say)).join(' '));
  const news = script?.format === 'news';
  const war = new RegExp(WAR_WORDS.source).test(head) || (body.match(WAR_WORDS) ?? []).length >= 6;
  const gctx = {
    format: news ? 'news' : undefined, year, oldWorld: year !== null && year < 1920, cultures: pref.strong, hinted: pref.hinted,
    americana: !news && (pref.hinted.has('americana') || (year !== null && year >= 1900 && US_STORY.test(head))), war, jazzAge: !!profile.jazzAge,
  };
  const pool = musicPool(L, gravity, gctx);
  if (!pool.length) {
    note(`müzik: ${gravity} hikâyeye uygun parça yok (kütüphanede ciddiyet etiketi eksik olabilir) — hafif parçayla doldurulmadı`);
    return { cues: [], reason: 'kütüphanede belgesele uygun müzik yok', gravity, notes };
  }
  if (isSerious(gravity) && pool.length < THIN_POOL) note(`müzik havuzu ince: ${gravity} hikâyeye uygun yalnız ${pool.length} parça — hafif parça eklenmedi, tekrar artabilir`);
  let runs = planRuns(units, { hold: MIN_HOLD_V2, maxRate: CHANGES_PER_MIN });
  annotateEnergy(runs, scenes);
  runs = addBreaths(runs);
  for (const r of runs) {
    if (r.silence) continue;
    if (r.units.some((u) => griefScene(scenes[u.i]))) r.grief = true;
    else if (r.units.some((u) => reliefScene(scenes[u.i]))) r.relief = true;
  }
  // This channel's videos only (entries recorded before 27 Ekim 2026 carry no channel: they count everywhere). The key
  // is script.musicChannel: script.channel is the corner logo's display name ("History Lens" dropped every tagged entry).
  const ch = MUSIC_CHANNELS.includes(script?.musicChannel) ? script.musicChannel : null;
  const recent = (Array.isArray(history) ? history : []).filter((e) => e && Array.isArray(e.tracks) && (!ch || !e.channel || e.channel === ch)).slice(-HISTORY_N).reverse();
  const ctx = {
    pool, genre: g, seed: seed ?? script?.seedKey ?? script?.id ?? 'nova', pref, speech: speechMap(scenes, secs),
    profile, recent, uses: new Map(), ranges: new Map(), palette: [], static: new Map(), style: new Map(), hist: new Map(), theme: null, colour: new Set(), gravity, gctx, war,
    recentIds: new Set(recent.slice(0, RECENT_BAN).flatMap((e) => e.tracks ?? [])),
  };
  for (const t of pool) {
    ctx.style.set(t.id, styleScore(t, profile));
    ctx.static.set(t.id, ctx.style.get(t.id) + qualityOf(t) - gravityPenalty(t, gravity));
    ctx.hist.set(t.id, historyPenalty(t, recent));
  }
  const total = units.at(-1).to;
  const music = runs.map((r, k) => ({ r, k })).filter(({ r }) => !r.silence);
  const plain = music.filter(({ r }) => !r.resume);
  const cueOf = (r) => ({ ...r, resume: false });

  // 1. The palette: theme, the cold open's striking cue, then one or two cues per feeling, by screen time.
  if (plain.length >= THEME_MIN_RUNS) ctx.theme = pickTheme(ctx, music, g);
  if (ctx.theme) ctx.palette.push(ctx.theme);
  const coldRun = plain.find(({ r }) => r.cold);
  const coldTrack = coldRun ? pickSlot(ctx, cueOf(coldRun.r), new Set(), 'cold') : null;
  if (coldTrack) ctx.palette.push(coldTrack);
  const famRuns = {};
  for (const { r } of plain) if (!r.cold) (famRuns[r.fam] ??= []).push(r);
  const fams = Object.entries(famRuns).map(([f, rs]) => [f, rs, rs.reduce((s, r) => s + r.len, 0)]).sort((a, b) => b[2] - a[2] || a[0].localeCompare(b[0]));
  let slots = clamp(Math.round(plain.length / 2.5), PALETTE_MIN, PALETTE_MAX);
  const alloc = Object.fromEntries(fams.map(([f]) => [f, 0]));
  for (const [f] of fams) if (slots > 0) { alloc[f]++; slots--; }
  while (slots > 0) {
    const open = fams.filter(([f, rs]) => alloc[f] < Math.min(3, rs.length));
    if (!open.length) break;
    const [f] = open.sort((a, b) => b[2] / (alloc[b[0]] + 1) - a[2] / (alloc[a[0]] + 1) || a[0].localeCompare(b[0]))[0];
    alloc[f]++;
    slots--;
  }
  for (const [f, rs] of fams) {
    for (let n = 0; n < alloc[f]; n++) {
      const wsum = {};
      for (const r of rs) for (const [m, v] of Object.entries(r.weights ?? {})) wsum[m] = (wsum[m] ?? 0) + v;
      const mood = MOODS.reduce((b, m) => ((wsum[m] ?? 0) > (wsum[b] ?? 0) ? m : b), rs[0].mood);
      const es = rs.filter((r) => Number.isFinite(r.energy));
      const rep = { from: 0, to: Math.max(...rs.map((r) => r.len)), mood, weights: wsum, fam: f, energy: es.length ? mean(es.map((r) => r.energy)) : undefined };
      const t = pickSlot(ctx, rep, new Set(), `${f}${n}`, { eraStrict: true });
      if (t) ctx.palette.push(t);
    }
  }

  // Signature colours (jazz for 1929, choir/oud for 1453, a synth pad for Tesla...): one track each, when it fits a feeling of the film.
  const reps = fams.map(([f, rs]) => {
    const wsum = {};
    for (const r of rs) for (const [m, v] of Object.entries(r.weights ?? {})) wsum[m] = (wsum[m] ?? 0) + v;
    return { from: 0, to: Math.max(...rs.map((r) => r.len)), mood: MOODS.reduce((b, m) => ((wsum[m] ?? 0) > (wsum[b] ?? 0) ? m : b), rs[0].mood), weights: wsum, fam: f };
  });
  const cultures = [...ctx.pref.strong].filter((c) => EXOTIC.includes(c));
  const colourOf = [...profile.signature.map((f) => ['f', f]), ...cultures.slice(0, 1).map((c) => ['c', c])];
  for (const [kind, x] of colourOf) {
    if (ctx.palette.length >= PALETTE_HARD_MAX) break;
    const hasIt = (t) => (kind === 'f' ? trackFeatures(t)[x] : fold(t.tags.culture ?? '') === x);
    if (ctx.palette.some(hasIt)) continue;
    const inPal = new Set(ctx.palette.map((t) => t.id));
    // A colour must pass the gate for the feeling it would carry, and fit it (>= 0.5, was 0.35).
    const scored = ctx.pool
      .filter((t) => hasIt(t) && !inPal.has(t.id) && !trackFeatures(t).quirky && !(trackFeatures(t).beat && (profile.w.beat ?? 0) < 0))
      .map((t) => {
        const best = reps.filter((rep) => fitFor(t, rep, ctx) >= 0.5 && cueGate(t, rep, ctx)).map((rep) => ({ rep, s: trackScore2(t, rep, ctx) })).sort((a, b) => b.s - a.s)[0];
        return best ? { t, key: t.id, score: best.s + ctx.static.get(t.id) - ctx.hist.get(t.id) } : null;
      })
      .filter(Boolean);
    const c = pickNear(scored, rngFor(ctx.seed, 'colour', x), 0.03, 3)?.t;
    if (c) {
      ctx.palette.push(c);
      ctx.colour.add(c.id);
    }
  }

  // 2. Fixed spots first (cold open, the theme's three appearances), then every other run in film order.
  const spots = ctx.theme ? themeSpots(music, total, ctx.theme, ctx) : new Set();
  const parts = new Map();
  const neighbours = (k) => {
    const avoid = new Set();
    // An unassigned drop-out will resume its source's track: that is its neighbour.
    const at = (j, end) => {
      const p = parts.get(j);
      if (p) return (end ? p.at(-1) : p[0]).track?.id;
      return runs[j].resume ? parts.get(j - 2)?.at(-1)?.track?.id : undefined;
    };
    for (let j = k - 1; j >= 0; j--) if (!runs[j].silence) { avoid.add(at(j, true)); break; }
    for (let j = k + 1; j < runs.length; j++) if (!runs[j].silence) { avoid.add(at(j, false)); break; }
    avoid.delete(undefined);
    return avoid;
  };
  if (coldRun) parts.set(coldRun.k, assignRun(cueOf(coldRun.r), ctx, new Set(), coldTrack));
  for (const k of [...spots].sort((a, b) => a - b)) parts.set(k, assignRun(cueOf(runs[k]), ctx, neighbours(k), ctx.theme));
  // Each colour track is heard: it takes the run it suits best (and may come back later on merit).
  for (const c of ctx.palette.filter((t) => ctx.colour.has(t.id))) {
    const best = plain
      .filter(({ r, k }) => !parts.has(k) && r.len >= 15 && fitFor(c, r, ctx) >= 0.5 && (!r.grief || griefOk(c)) && !(r.relief && mournful(c)) && cueGate(c, cueOf(r), ctx) && !neighbours(k).has(c.id))
      .map(({ r, k }) => ({ k, r, s: trackScore2(c, cueOf(r), ctx) }))
      .sort((a, b) => b.s - a.s || a.k - b.k)[0];
    if (best) parts.set(best.k, assignRun(cueOf(best.r), ctx, neighbours(best.k), c));
  }
  for (const { r, k } of plain) if (!parts.has(k)) parts.set(k, assignRun(cueOf(r), ctx, neighbours(k)));
  for (const { r, k } of music.filter(({ r }) => r.resume)) {
    const src = parts.get(k - 2)?.at(-1);
    const t = src?.track;
    // A drop-out picks its track up again — unless the line after the drop is a death the track cannot carry, or
    // an unverified track has had its cues.
    // A resume is the same statement after its drop-out, not a new use (it never pushed a track past its cap).
    if (t && !(r.grief && !griefOk(t)) && !(r.relief && mournful(t)) && !(isVerify(t) && (ctx.uses.get(t.id) ?? 0) >= VERIFY_MAX)) {
      const at = src.startAt + (r.from - src.from);
      if (at + r.len <= (Number(t.duration) || 0) - 1) {
        parts.set(k, [{ ...r, track: t, startAt: at, resume: true, theme: !!src.theme }]);
        continue;
      }
    }
    parts.set(k, assignRun(cueOf(r), ctx, neighbours(k)));
  }
  const griefMiss = [...parts.values()].flat().filter((p) => p.grief && p.track && !griefOk(p.track)).length;
  if (griefMiss) note(`müzik: ${griefMiss} ölüm/kayıp ipucunda havuzda yas parçası (sad ≥ 0,5, enerji ≤ 3) kalmadı — en yakını çalıyor`);

  // 3. Cues, as v1 writes them (+ theme / breath / energy-aware level).
  const cues = [];
  const silence = (a, b, chapter, breath) => cues.push({ fromSec: r3(a), toSec: r3(b), mood: 'silence', trackId: null, startAt: 0, gainDb: null, kind: 'silence', chapter, ...(breath ? { breath: true } : {}) });
  runs.forEach((r, k) => {
    if (r.silence) return silence(r.from, r.to, r.chapter, r.breath);
    const button = !!r.units[0]?.card && k > 0 && !runs[k - 1].silence;
    for (const [n, p] of (parts.get(k) ?? []).entries()) {
      if (p.noTrack) {
        silence(p.from, p.to, p.chapter);
        continue;
      }
      const eAdj = Number.isFinite(p.energy) ? clamp((p.energy - 3) * 0.4, -0.8, 0.8) : 0;
      // A grave story's reveal or "victory" is not pushed louder than its tension.
      const moodGain = gravity === 'grave' && (p.mood === 'reveal' || p.mood === 'triumph') ? 0 : MOOD_GAIN_DB[p.mood] ?? 0;
      cues.push({
        fromSec: r3(p.from), toSec: r3(p.to), mood: p.mood, trackId: p.track.id, startAt: r3(p.startAt),
        gainDb: r3(clamp(moodGain + (p.cold ? 1 : 0) + eAdj, -6, 3)),
        kind: 'music', chapter: p.chapter, title: p.track.title,
        ...(p.cold ? { coldOpen: true } : {}), ...(p.resume ? { resume: true } : {}), ...(p.chained ? { chained: true } : {}),
        ...(p.backTimed ? { backTimed: true } : {}), ...(p.theme ? { theme: true } : {}),
        ...(button && n === 0 ? { button: true } : {}), ...(p.grief ? { grief: true } : {}),
      });
    }
  });
  /*
   * NO SILENT END SCREEN (Eagle's Nest, Oct 2026): the last line ended ~3 s into a 13 s closing hold and the plan put
   * a silence cue under the rest — 7.8 s of nothing on the end screen; it plays as a broken file. A trailing silence
   * longer than END_SILENCE_MAX becomes the previous track carrying on (renderScore shifts or loops it and fades out
   * on the last frame).
   */
  const lastCue = cues.at(-1);
  const lastMusic = [...cues].reverse().find((c) => c.trackId);
  if (lastCue && !lastCue.trackId && lastMusic && lastCue.toSec - lastCue.fromSec > END_SILENCE_MAX) {
    const end = lastCue.toSec;
    cues.splice(cues.indexOf(lastMusic) + 1);
    lastMusic.toSec = end;
    lastMusic.tail = true;
  }
  const usedIds = [...new Set(cues.filter((c) => c.trackId).map((c) => c.trackId))];
  // A theme heard once is not this film's theme (Chernobyl's only statement was the finale): it is not recorded as
  // 'main', so it is not banned from the next videos either.
  const statements = cues.filter((c) => c.theme && !c.resume && !c.chained).length;
  if (ctx.theme && statements < 2) note(`müzik: ana tema yalnız ${statements} kez duyuluyor — tema sayılmadı`);
  return {
    cues,
    selector: 'v2',
    gravity,
    theme: ctx.theme && usedIds.includes(ctx.theme.id) && statements >= 2 ? { id: ctx.theme.id, title: ctx.theme.title } : null,
    palette: usedIds,
    profile: { year: profile.year, topics: profile.topics, signature: profile.signature, prefer: Object.entries(profile.w).filter(([, v]) => v > 0.25).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k), avoid: Object.entries(profile.w).filter(([, v]) => v < -0.25).sort((a, b) => a[1] - b[1]).slice(0, 5).map(([k]) => k) },
    pool: pool.length,
    notes,
  };
}

/**
 * Plan the score as cues. Pure and deterministic: same script, seed, library
 * (and history) -> same plan. Each cue: { fromSec, toSec, mood, trackId,
 * startAt, gainDb } plus bookkeeping (kind, chapter, title, coldOpen, resume,
 * chained, backTimed, theme, button). Silence cues have mood 'silence' and
 * trackId null (breath: true for the breath after a peak).
 * `selector`: 'v2' (default, palette + era + energy + history) or 'v1' (the
 * original planner, for jobs whose picture was already cut to its beats).
 * `history`: earlier videos, oldest first: [{ key, main, tracks }].
 */
export function planScore(o = {}) {
  return String(o.selector ?? MUSIC_SELECTOR).toLowerCase() === 'v1' ? planScoreV1(o) : planScoreV2(o);
}

/* ------------------------------------------------------- music history */

/** <NOVA_HOME>/data/docu-music-history.json: { version, videos: [{ key, title, genre, channel, at, main, tracks, prior }] }, oldest first. */
export function readMusicHistory(file) {
  if (!file) return [];
  try {
    const h = JSON.parse(readFileSync(file, 'utf8'));
    const list = Array.isArray(h) ? h : Array.isArray(h?.videos) ? h.videos : [];
    return list.filter((e) => e && typeof e.key === 'string' && Array.isArray(e.tracks));
  } catch {
    return [];
  }
}
/**
 * The history a video plans against. A video that is already in the file
 * plans against the SAME history it first saw (its `prior`), so a re-run
 * never changes its music (and with it the beat grid and every rendered
 * chunk) just because other videos were made since. Delete its entry to
 * re-pick. A new video sees the last HISTORY_N other videos — of its own
 * channel when `channel` is given (27 Ekim 2026: one mixed list hid the
 * history channel's own themes). Entries recorded before channels were kept
 * have none and count for every channel.
 */
export function musicHistoryFor(list, key, { channel } = {}) {
  const own = (list ?? []).find((e) => e.key === key);
  if (own && Array.isArray(own.prior)) return own.prior;
  return (list ?? []).filter((e) => e.key !== key && (!channel || !e.channel || e.channel === channel)).slice(-HISTORY_N)
    .map(({ key: k, main, tracks, channel: c }) => ({ key: k, main: main ?? null, tracks, ...(c ? { channel: c } : {}) }));
}
/** Record (or update in place) a video's music; atomic write. Never throws. */
export function recordMusicHistory(file, entry) {
  if (!file || !entry?.key) return false;
  try {
    const list = readMusicHistory(file);
    const i = list.findIndex((e) => e.key === entry.key);
    const old = i >= 0 ? list[i] : null;
    const channel = entry.channel ?? old?.channel;
    const e = {
      key: entry.key, title: entry.title ?? old?.title, genre: entry.genre ?? old?.genre, ...(channel ? { channel } : {}), main: entry.main ?? null, tracks: [...new Set(entry.tracks ?? [])],
      at: old?.at ?? new Date().toISOString(), updated: new Date().toISOString(),
      prior: Array.isArray(old?.prior) ? old.prior : (entry.prior ?? []).map(({ key, main, tracks, channel: c }) => ({ key, main: main ?? null, tracks, ...(c ? { channel: c } : {}) })),
    };
    if (i >= 0) list[i] = e;
    else list.push(e);
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp${process.pid}`;
    writeFileSync(tmp, JSON.stringify({ version: 1, videos: list.slice(-200) }, null, 1));
    renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

/* ----------------------------------------------------------- rendering */

/**
 * Nudge an entry point onto the nearest real onset (a downbeat, a new chord)
 * within ±0.6s. The plan works on a 1-second energy curve; this is where the
 * cut lands on the music instead of mid-note.
 */
function refineOnset(bin, file, s) {
  const from = Math.max(0, s - 0.7);
  const SR = 11025;
  const r = run(bin, ['-hide_banner', '-loglevel', 'error', '-ss', from.toFixed(3), '-t', '1.4', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 's16le', '-'], { encoding: 'buffer' });
  if (r.status !== 0 || !r.stdout?.length) return s;
  const x = new Int16Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength >> 1);
  const hop = Math.round(SR / 100);
  const le = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let e = 0;
    for (let j = i; j < i + hop; j++) e += x[j] * x[j];
    le.push(Math.log(1e-3 + e / hop));
  }
  let best = null;
  for (let f = 4; f < le.length; f++) {
    const shift = from + f / 100 - s;
    if (Math.abs(shift) > 0.6) continue;
    const strength = le[f] - Math.max(le[f - 1], le[f - 2], le[f - 3]);
    const score = strength * (1 - (0.5 * Math.abs(shift)) / 0.6);
    if (strength >= 0.92 && (!best || score > best.score)) best = { score, t: from + f / 100 - 0.01 };
  }
  return best ? Math.max(0, best.t) : s;
}

/* A cue boundary moves onto the nearest picture cut within this (the beat snap moves cuts up to 0.35 s). */
const CUT_SNAP = 0.6;
/*
 * The chapter button (seconds): the outgoing cue fades over `stop` ending
 * `ring` after the card's cut (a stop, not a 2.5 s crossfade); the new cue
 * enters `late` after the cut over `fadeIn`, once the card's hit has spoken.
 */
const BUTTON = { stop: 0.28, ring: 0.1, late: 0.45, fadeIn: 0.6 };

const CODEC = {
  '.wav': ['-c:a', 'pcm_s16le', '-f', 'wav'],
  '.flac': ['-c:a', 'flac', '-f', 'flac'],
  '.m4a': ['-c:a', 'aac', '-b:a', '256k', '-f', 'ipod'],
  '.aac': ['-c:a', 'aac', '-b:a', '256k', '-f', 'adts'],
  '.mp3': ['-c:a', 'libmp3lame', '-b:a', '256k', '-f', 'mp3'],
};

/*
 * Level rules of the score (27 Ekim 2026, music audit). renderScore lifted every cue toward SCORE_LUFS by up to
 * +14 dB: Sad Trio (library -36.4 LUFS) got +14 in Black Buck, Bakker and Eagle's Nest, Somnia +14/+10.5/+10.5 —
 * 9 segments in 6 videos at +8 dB or more, a quiet intimate recording pushed up to the level of a driving cue with
 * its noise floor. Now a cue is lifted at most GAIN_UP_MAX, and a master quieter than QUIET_LUFS is not used at all
 * unless it was normalised offline (track.normalised === true).
 */
const GAIN_UP_MAX = 8;
const QUIET_LUFS = -30;
/** Is this library track too quiet a master to be lifted to the score's level? (only a whole-track measurement counts) */
export function musicTooQuiet(t) {
  if (!t || t.normalised === true || t.normalized === true || t.tags?.normalised === true || t.tags?.normalized === true) return false;
  return Number.isFinite(t.lufs) && t.lufs < QUIET_LUFS;
}
/** A cue's gain (dB): to SCORE_LUFS plus its mood gain, never more than +GAIN_UP_MAX, never past 1 dBFS sample peak. */
export function cueGainDb(I, peak, gainDb = 0) {
  let g = (Number.isFinite(I) ? SCORE_LUFS - I : 0) + (Number(gainDb) || 0);
  g = clamp(g, -24, GAIN_UP_MAX);
  if (Number.isFinite(peak)) g = Math.min(g, 1 - peak); // the final limiter takes the last dB or two
  return g;
}

/*
 * Seams (27 Ekim 2026). One gain per cue from up to 120 s of it never matched the seam itself: in the Chernobyl
 * stem (20261026-24122a) Survival Mode -> Highway Nocturne fell from -13.4 to -22 LUFS at 3:41.9 and stayed in the
 * hole for 2 s; Survival Mode -> Last Sunrise jumped -16.3 -> -11.8 at 8:35.1 (the loudest moment of the final mix);
 * The Challenger -> Highway Nocturne fell -10.1 -> -18.5 at 11:16.6. Now SEAM_MEASURE s of the outgoing tail and the
 * incoming head are measured, the incoming cue starts within SEAM_TOL LU of the tail and eases to its own gain over
 * SEAM_RAMP s; the outgoing fade ends in the track's own breath (an energy dip) within DIP_WIN s when it has one.
 */
const SEAM_MEASURE = 4;
const SEAM_TOL = 2;
const SEAM_MAX = 10;
const SEAM_RAMP = 7;
const DIP_WIN = 1.5;
const DIP_DEPTH = 3;
/** Offset (dB) to start the incoming cue with, so its head lands within `tol` LU of the outgoing tail (0 = already close). */
export function seamOffsetDb(tailLu, headLu, { tol = SEAM_TOL, max = SEAM_MAX } = {}) {
  if (!Number.isFinite(tailLu) || !Number.isFinite(headLu)) return 0;
  const step = headLu - tailLu;
  if (Math.abs(step) <= tol) return 0;
  return clamp(-(step - Math.sign(step) * tol), -max, max);
}
/** The seam offset left at segment time t (s): full until t0 (the boundary), a cosine ease to 0 over `ramp` seconds. */
export function seamOffsetAt(offsetDb, t, t0, ramp = SEAM_RAMP) {
  const x = clamp((t - t0) / Math.max(1e-6, ramp), 0, 1);
  return offsetDb * 0.5 * (1 + Math.cos(Math.PI * x));
}
/** The same curve as an ffmpeg volume expression (linear factor), evaluated per audio frame. */
export function seamVolume(gainDb, offsetDb, t0, ramp = SEAM_RAMP) {
  const f = (x) => Number(x).toFixed(3);
  return `volume='pow(10,(${f(gainDb)}+(${f(offsetDb)})*0.5*(1+cos(PI*min(1,max(0,(t-${f(t0)})/${f(Math.max(1e-3, ramp))})))))/20)':eval=frame`;
}
/**
 * The nearest energy dip of a track (its own breath, a phrase end) to track time `at`, within [lo, hi] seconds of it:
 * a second quieter than the one before it, no louder than the one after, and `depth` dB under the loudest second
 * around it. Returns the dip's track time (the middle of that second), or null when the music has none there.
 */
export function energyDip(energy, at, { lo = -DIP_WIN, hi = DIP_WIN, depth = DIP_DEPTH } = {}) {
  const E = Array.isArray(energy) ? energy.map(Number) : [];
  let best = null;
  for (let s = 1; s < E.length - 1; s++) {
    const mid = s + 0.5;
    const d = mid - at;
    if (d < lo - 1e-9 || d > hi + 1e-9) continue;
    const v = E[s];
    if (!(v < E[s - 1] && v <= E[s + 1])) continue;
    if (Math.max(...E.slice(Math.max(0, s - 2), s + 3)) - v < depth) continue;
    if (!best || Math.abs(d) < Math.abs(best.d) - 1e-9 || (Math.abs(Math.abs(d) - Math.abs(best.d)) <= 1e-9 && v < best.v)) best = { d, v, mid };
  }
  return best ? best.mid : null;
}
/* A static presence dip on the whole score: the bed spends ~95% of a film under the voice, whose 1-4 kHz it masked. */
export const PRESENCE_DIP = 'equalizer=f=2500:t=q:w=1.2:g=-3';
/** The score bus after the mix: presence dip, limiter, exact length, the film's single qsin fade-out. */
export function scoreBus(T) {
  return `${PRESENCE_DIP},alimiter=limit=0.891:attack=5:release=80:level=false:latency=1,apad=whole_dur=${T.toFixed(3)},atrim=0:${T.toFixed(3)},` +
    `afade=t=out:st=${Math.max(0, T - FADE_OUT).toFixed(3)}:d=${Math.min(FADE_OUT, T).toFixed(3)}:curve=qsin,aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo`;
}

/**
 * Cut the planned score into ONE audio file exactly `totalSec` long.
 * Every cue is measured and brought to the same loudness first (lifted at most
 * +8 dB), so a quiet piano cue and a loud drum cue meet level. Music -> music:
 * a 1.5 s equal-power crossfade whose incoming phrase lands on the boundary,
 * the outgoing fade ending in its own breath, the incoming cue starting at the
 * outgoing level. Music -> silence: a short stop-down. Silence -> music: the
 * phrase re-enters cleanly. The file ends with the film's single 3.5 s qsin
 * fade-out. `ff` is the ffmpeg binary.
 */
export function renderScore({ plan, lib, root, outFile, ff, totalSec, cuts = null, log = () => {} } = {}) {
  if (!outFile) throw new Error('renderScore: outFile gerekli');
  const L = prep(lib, root);
  const bin = ffmpegPath(ff);
  const input = [...(plan?.cues ?? [])].filter((c) => c && c.toSec > c.fromSec).sort((a, b) => a.fromSec - b.fromSec);
  const T = r3(Number(totalSec) > 0 ? Number(totalSec) : input.at(-1)?.toSec ?? 0);
  if (!(T > 0)) throw new Error('renderScore: toplam süre yok');

  let cues = [];
  for (const c of input) {
    if (c.fromSec >= T) break;
    let track = c.trackId ? L.byId.get(c.trackId) : null;
    if (c.trackId && !track) log(`müzik parçası kütüphanede yok, sessiz geçiliyor: ${c.trackId}`);
    // A master under QUIET_LUFS would need more than +GAIN_UP_MAX: not played (the planner's pool should skip it too).
    if (track && musicTooQuiet(track)) {
      log(`müzik: "${track.title}" çok sessiz kayıt (${track.lufs} LUFS < ${QUIET_LUFS}), çalınmıyor; parça önce normalize edilmeli`);
      track = null;
    }
    cues.push({ ...c, fromSec: Math.max(0, c.fromSec), toSec: Math.min(T, c.toSec), track, music: !!track });
  }
  if (cues.length) cues.at(-1).toSec = T;
  // A cue that simply continues the previous one (same track, same clock) is one stretch of audio.
  cues = cues.reduce((acc, c) => {
    const p = acc.at(-1);
    if (p?.music && c.music && p.trackId === c.trackId && Math.abs(p.toSec - c.fromSec) < 0.01 && Math.abs(p.startAt + (c.fromSec - p.fromSec) - c.startAt) < 0.05) p.toSec = c.toSec;
    else acc.push(c);
    return acc;
  }, []);

  /*
   * Entry points onto real onsets first — from the PLAN's entry points, so the
   * planned-length cut (the one the beat grid is heard from) and the final cut
   * map every second of video to the same moment of each track.
   */
  cues.forEach((c, k) => {
    if (c.music && !(c.backTimed && k === cues.length - 1)) c.startAt = refineOnset(bin, c.track.abs, Math.max(0, Number(c.startAt) || 0));
  });
  /*
   * Then every change lands ON a picture cut: the plan works on the planned
   * scene lengths, the picture's cuts moved onto beats (±0.35 s). The track's
   * clock is kept (entry shifted with the boundary), so the beats found in
   * the planned cut stay true; only where the crossfade sits moves.
   */
  if (Array.isArray(cuts) && cuts.length) {
    const grid = [...cuts].filter(Number.isFinite).sort((a, b) => a - b);
    for (let k = 1; k < cues.length; k++) {
      const B = cues[k].fromSec;
      let best = null;
      for (const x of grid) if (Math.abs(x - B) <= CUT_SNAP && (best === null || Math.abs(x - B) < Math.abs(best - B))) best = x;
      if (best === null || Math.abs(best - B) < 1e-3) continue;
      const d = best - B;
      const c = cues[k];
      if (best <= cues[k - 1].fromSec + 0.5 || best >= c.toSec - 0.5) continue;
      if (c.music && (Number(c.startAt) || 0) + d < 0) continue;
      cues[k - 1].toSec = r3(best);
      c.fromSec = r3(best);
      if (c.music) c.startAt = (Number(c.startAt) || 0) + d;
    }
  }

  const segs = [];
  cues.forEach((c, k) => {
    if (!c.music) return;
    const prev = cues[k - 1];
    const next = cues[k + 1];
    const len = c.toSec - c.fromSec;
    const D = Number(c.track.duration) || 0;
    let startAt = Math.max(0, Number(c.startAt) || 0);
    if (c.backTimed && !next) startAt = Math.max(0, D - len - 0.3);
    const prevLen = prev ? prev.toSec - prev.fromSec : 0;
    const nextLen = next ? next.toSec - next.fromSec : 0;
    // The chapter "button": the old cue stops ON the card's cut, the new one enters a beat after it.
    const btnIn = !!c.button && !!prev?.music;
    const btnOut = !!next?.button && !!next?.music;
    const xin = prev?.music && !btnIn ? Math.min(XFADE, 0.4 * len, 0.4 * prevLen) : 0;
    const xout = next?.music && !btnOut ? Math.min(XFADE, 0.4 * len, 0.4 * nextLen) : 0;
    const stopTail = next && !next.music ? Math.min(0.8, 0.5 * nextLen) : 0;
    const late = btnIn ? Math.min(BUTTON.late, 0.25 * len) : 0;
    const pre = btnIn ? -late : prev?.music ? Math.min(xin / 2, startAt, c.fromSec) : 0;
    const fin = btnIn ? BUTTON.fadeIn : prev?.music ? pre + xin / 2 : prev ? (c.resume ? 0.03 : 0.35) : 0.03;
    const ts = c.fromSec - pre;
    const te = btnOut ? c.toSec + BUTTON.ring : next?.music ? c.toSec + xout / 2 : next ? c.toSec + stopTail : T;
    const fout = btnOut ? BUTTON.stop : next?.music ? xout : next ? 0.5 + stopTail : 0;
    const need = te - ts;
    let ss = startAt - pre;
    let loop = false;
    if (D && ss + need > D - 0.05) {
      const shift = ss + need - (D - 0.05);
      if (ss - shift >= 0) {
        ss -= shift;
        log(`müzik: "${c.track.title}" giriş noktası ${shift.toFixed(1)} sn öne alındı (parça bitiyordu)`);
      } else {
        loop = true;
        log(`müzik: "${c.track.title}" ipucundan kısa, döngüye alındı`);
      }
    }
    const { I, peak } = loudness(bin, c.track.abs, { ss, dur: Math.min(need, 120), loop });
    const gain = cueGainDb(I, peak, c.gainDb);
    if (I !== null && SCORE_LUFS - I + (Number(c.gainDb) || 0) > GAIN_UP_MAX + 0.05) log(`müzik: "${c.track.title}" sessiz bölüm, yükseltme +${GAIN_UP_MAX} dB ile sınırlı (${(SCORE_LUFS - I).toFixed(1)} dB gerekirdi)`);
    segs.push({ c, k, ss, need, ts: Math.max(0, ts), fin: Math.min(fin, need / 2), fout: Math.min(fout, need / 2), gain, peak, loop, xin, xout, D, seam: null });
  });

  /*
   * Music -> music seams (not the chapter buttons): first the outgoing fade moves onto the track's own breath (an
   * energy dip within DIP_WIN s of where it would end), the incoming fade moving with it when that is earlier so the
   * pair stays equal power; then the incoming cue starts within SEAM_TOL LU of the outgoing tail and eases to its
   * own gain over SEAM_RAMP s (measured: SEAM_MEASURE s each side).
   */
  for (let j = 1; j < segs.length; j++) {
    const A = segs[j - 1];
    const B = segs[j];
    if (B.k !== A.k + 1 || !(A.xout > 0) || !(B.xin > 0)) continue;
    const seam = B.c.fromSec;
    const endA = A.ts + A.need;
    if (!A.loop && Array.isArray(A.c.track.energy) && A.c.track.energy.length) {
      const srcEnd = A.ss + A.need;
      // Later: A has the audio, and its fade starts before B is fully in.
      const hi = Math.min(DIP_WIN, A.D ? A.D - 0.05 - srcEnd : DIP_WIN, B.ts + B.fin - (endA - A.fout));
      // Earlier: A keeps room for its own fades; B can start as early as A's fade (it has audio before its entry).
      const room = B.loop ? 0 : Math.max(0, Math.min(B.ss, B.ts - (A.ts + A.fin)));
      const lo = Math.max(-DIP_WIN, -(A.need - A.fin - A.fout - 0.5), B.ts - room - (endA - A.fout));
      const dip = lo < hi ? energyDip(A.c.track.energy, srcEnd, { lo, hi }) : null;
      const shift = dip === null ? 0 : dip - srcEnd;
      if (Math.abs(shift) >= 0.1) {
        A.need += shift;
        A.fout = Math.min(A.fout, A.need / 2);
        const early = B.ts - (A.ts + A.need - A.fout);
        if (early > 0) {
          B.ts -= early;
          B.ss -= early;
          B.need += early;
        }
        log(`müzik: "${A.c.track.title}" geçişi kendi nefesine kaydı (${shift > 0 ? '+' : ''}${shift.toFixed(2)} sn)`);
      }
    }
    // Tail: the last SEAM_MEASURE s of A before its fade; head: the first SEAM_MEASURE s of B at full level from the boundary.
    const tailEnd = A.ts + A.need - A.fout;
    const tailStart = Math.max(A.ts + A.fin, tailEnd - SEAM_MEASURE);
    const headStart = Math.max(seam, B.ts + B.fin);
    const headEnd = Math.min(headStart + SEAM_MEASURE, B.ts + B.need - B.fout);
    if (tailEnd - tailStart < 1.5 || headEnd - headStart < 1.5) continue;
    const tail = loudness(bin, A.c.track.abs, { ss: A.ss + (tailStart - A.ts), dur: tailEnd - tailStart, loop: A.loop }).I;
    const head = loudness(bin, B.c.track.abs, { ss: B.ss + (headStart - B.ts), dur: headEnd - headStart, loop: B.loop }).I;
    if (tail === null || head === null) continue;
    let off = seamOffsetDb(tail + A.gain, head + B.gain);
    if (off > 0) off = Math.min(off, GAIN_UP_MAX - B.gain, Number.isFinite(B.peak) ? 1 - B.peak - B.gain : off);
    const t0 = seam - B.ts;
    const ramp = Math.min(SEAM_RAMP, B.need - B.fout - t0);
    if (Math.abs(off) < 0.5 || ramp < 1.5) continue;
    B.seam = { off, t0, ramp };
    log(`müzik: "${A.c.track.title}" -> "${B.c.track.title}" geçişi ${(head + B.gain - tail - A.gain).toFixed(1)} LU basamaktı; gelen ${off > 0 ? '+' : ''}${off.toFixed(1)} dB ile başlıyor, ${ramp.toFixed(1)} sn'de kendi seviyesine`);
  }

  const tmp = `${outFile}.tmp${extname(outFile) || '.wav'}`;
  const codec = CODEC[extname(outFile).toLowerCase()] ?? CODEC['.wav'];
  mkdirSync(dirname(outFile), { recursive: true });
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  let graph;
  if (!segs.length) {
    args.push('-f', 'lavfi', '-t', T.toFixed(3), '-i', 'anullsrc=r=48000:cl=stereo');
    graph = `[0:a]apad=whole_dur=${T.toFixed(3)},atrim=0:${T.toFixed(3)},aformat=sample_fmts=s16:sample_rates=48000:channel_layouts=stereo[out]`;
  } else {
    const parts = [];
    segs.forEach((s, j) => {
      args.push(...(s.loop ? ['-stream_loop', '-1'] : []), '-ss', s.ss.toFixed(3), '-t', s.need.toFixed(3), '-i', s.c.track.abs);
      // A matched seam: the cue enters at the outgoing level and eases to its own gain (seamVolume); else a static gain.
      const vol = s.seam ? seamVolume(s.gain, s.seam.off, s.seam.t0, Math.max(0.5, Math.min(s.seam.ramp, s.need - s.fout - s.seam.t0))) : `volume=${s.gain.toFixed(2)}dB`;
      let f = `[${j}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,atrim=0:${s.need.toFixed(3)},asetpts=PTS-STARTPTS,${vol}`;
      if (s.fin > 0.001) f += `,afade=t=in:st=0:d=${s.fin.toFixed(3)}:curve=qsin`;
      if (s.fout > 0.001) f += `,afade=t=out:st=${(s.need - s.fout).toFixed(3)}:d=${s.fout.toFixed(3)}:curve=qsin`;
      f += `,adelay=delays=${Math.round(s.ts * 48000)}S:all=1[m${j}]`;
      parts.push(f);
    });
    parts.push(`${segs.map((_, j) => `[m${j}]`).join('')}amix=inputs=${segs.length}:normalize=0:dropout_transition=0:duration=longest,${scoreBus(T)}[out]`);
    graph = parts.join(';');
  }
  let scriptFile = null;
  if (graph.length > 6000) {
    // Windows caps a command line at 32k characters; a 15-minute score can get close.
    scriptFile = `${outFile}.graph.txt`;
    writeFileSync(scriptFile, graph);
    args.push('-filter_complex_script', scriptFile);
  } else args.push('-filter_complex', graph);
  args.push('-map', '[out]', '-ar', '48000', '-ac', '2', ...codec, tmp);
  // The whole score in one pass: 180 s plus its length, never more than 20 minutes (inside the watchdog).
  const r = run(bin, args, { timeout: Math.ceil(Math.min(20 * 60_000, FF_TIMEOUT_MS + T * 1000)) });
  if (scriptFile) rmSync(scriptFile, { force: true });
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    throw new Error(`müzik miksi başarısız: ${String(r.stderr || r.error?.message || '').slice(-400)}`);
  }
  renameSync(tmp, outFile);

  const musicCues = [];
  for (const s of segs) {
    const p = musicCues.at(-1);
    const t = s.c.track;
    if (p && p.trackId === t.id && Math.abs(p.toSec - s.c.fromSec) < RESUME_MAX_SILENCE + 0.5) p.toSec = r3(s.c.toSec);
    else musicCues.push({ trackId: t.id, fromSec: r3(s.c.fromSec), toSec: r3(s.c.toSec), title: t.title, artist: t.artist || undefined, license: t.license || undefined });
  }
  return {
    file: outFile,
    musicCues: musicCues.map(({ trackId, ...m }) => m),
    cues: segs.map((s) => ({ fromSec: r3(s.c.fromSec), toSec: r3(s.c.toSec), trackId: s.c.trackId, startAt: r3(s.ss + (s.c.fromSec - s.ts)), gainDb: r3(s.gain), ...(s.seam ? { seamDb: r3(s.seam.off) } : {}) })),
  };
}

/* ------------------------------------------------------------ SFX pools */

/* Max-momentary loudness targets per kind (audit: the impact must be the loudest thing). */
const SFX_TARGET = { hit: -12, stinger: -13, thud: -20, riser: -20, whoosh: -22, swell: -22, snap: -22, glitch: -24, ticks: -26 };
/*
 * Longest useful length per kind. Risers and swells are cut from the FRONT so
 * their build still ends on the impact (the rulebook runs swells under the last
 * 8-12 s before a reveal); everything else keeps its head and loses the tail.
 */
const SFX_MAX = { hit: 4, stinger: 5, thud: 2.5, riser: 4, whoosh: 4, swell: 12, snap: 0.8, ticks: 2.5, glitch: 1.5 };
const FROM_END = new Set(['riser', 'swell']);
const POOL_SIZE = { hit: 8, whoosh: 10, riser: 5, ticks: 3, glitch: 5, swell: 6, snap: 8, stinger: 5, thud: 6 };
/* Kinds a style never gets, whatever the files say: no jump-scares outside horror/crime, no glitch or swell in a biography. */
const GENRE_KINDS = {
  documentary: { stinger: false },
  crime: {},
  epic: { stinger: false, glitch: false },
  science: { stinger: false },
  inspire: { stinger: false, glitch: false, swell: false },
  finance: { stinger: false },
  horror: {},
};
/* Only for sounds that do not name their styles: how hard a generic sound may hit in each style. */
const GENERIC_MAX_INTENSITY = { documentary: 4, crime: 5, epic: 5, science: 4, inspire: 3, finance: 4, horror: 5 };

function genreRules(rules, g) {
  const r = rules.genres?.[g] ?? rules[g] ?? {};
  return r && typeof r === 'object' ? r : {};
}

function genreKinds(rules, g) {
  const kinds = Object.fromEntries(SFX_KINDS.map((k) => [k, true]));
  Object.assign(kinds, GENRE_KINDS[g] ?? {});
  for (const [k, v] of Object.entries(genreRules(rules, g).kinds ?? {})) if (k in kinds) kinds[k] = !!v;
  if (Array.isArray(rules.stingerGenres)) kinds.stinger = rules.stingerGenres.includes(g);
  // A biography never gets a jump-scare, whatever a rule file says.
  if (g === 'inspire') kinds.stinger = false;
  return kinds;
}

/**
 * Candidates for one pool slot. The curator's style list is trusted as is
 * ("Inspire uses only 546"); a style with no file for the slot gets nothing —
 * never a sound borrowed from another style (rulebook).
 */
function kindCandidates(L, kind, g) {
  const fits = (s) => (s.genresN.length ? s.genresN.includes(g) : s.intensity <= (GENERIC_MAX_INTENSITY[g] ?? 4));
  const ok = (s) => !s.literal && s.kind !== 'bed' && s.kind !== 'event' && fits(s);
  let base;
  if (kind === 'thud') {
    // A quiet body blow: by its own name or a low intensity — not a big hit whose keywords mention a 'body' (ceset).
    const soft = (s) => s.intensity <= 2.5 || [...s.ownW].some((w) => /^(thud|thump|low|soft|sub|muffled)$/.test(w));
    base = L.sfx.filter((s) => ok(s) && (s.kind === 'thud' || (s.kind === 'hit' && soft(s) && s.intensity < 4)));
  } else if (kind === 'hit') {
    // The story punch. One real impact beats padding the pool with a thump (inspire: "only 546").
    const hits = L.sfx.filter((s) => ok(s) && s.kind === 'hit');
    const strong = hits.filter((s) => s.intensity >= 2.5);
    base = strong.length ? strong : hits;
  } else base = L.sfx.filter((s) => ok(s) && s.kind === kind);
  const moods = GENRE_MOODS[g] ?? [];
  return base.map((s) => ({ s, w: (s.genresN.includes(g) ? 2 : 1) * (s.moodsN.length && !s.moodsN.some((m) => moods.includes(m)) ? 0.3 : 1) }));
}

function weightedSample(items, n, rng) {
  const pool = [...items].sort((a, b) => a.s.idx - b.s.idx);
  const out = [];
  while (out.length < n && pool.length) {
    const tot = pool.reduce((s, x) => s + x.w, 0);
    let r = rng() * tot;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i].w;
      if (r <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/**
 * A pool file, loudness-normalised per kind: leading silence trimmed (a hit
 * must hit on its frame), risers and swells trimmed at the END so they finish
 * on the impact, length capped, peak kept under -1 dBFS. The curator's own
 * balance inside a kind (gain_db against the kind's typical value) is kept,
 * within ±4 dB. Cached by source+recipe; a sidecar JSON keeps placement data.
 */
function normaliseSfx({ s, kind, bin, outDir, rate = 1, kindRef, log }) {
  const src = s.abs;
  const max = SFX_MAX[kind] ?? 3;
  const rel = typeof s.gain_db === 'number' && Number.isFinite(kindRef) ? clamp(s.gain_db - kindRef, -4, 4) : 0;
  const target = (SFX_TARGET[kind] ?? -20) + rel;
  let st;
  try {
    st = statSync(src);
  } catch {
    return null;
  }
  const key = hash(`v2|${src}|${st.size}|${Math.round(st.mtimeMs)}|${kind}|${rate}|${target}|${max}`);
  const out = join(outDir, kind, `${basename(src, extname(src)).slice(0, 40)}-${key}.wav`);
  if (fileOk(out) && existsSync(`${out}.json`)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const speed = rate !== 1 ? `,asetrate=${Math.round(48000 * rate)},aresample=48000` : '';
  const trim = FROM_END.has(kind)
    ? `areverse,silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${max},afade=t=out:st=${(max - 0.3).toFixed(2)}:d=0.3,areverse`
    : `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${max},afade=t=out:st=${Math.max(0, max - 0.3).toFixed(2)}:d=0.3`;
  const chain = `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo${speed},${trim}`;
  const m = loudness(bin, src, { chain, momentary: true });
  if (m.maxM === null) {
    log?.(`efekt ölçülemedi, atlandı: ${basename(src)}`);
    return null;
  }
  let gain = clamp(target - m.maxM, -30, 30);
  if (m.peak !== null) gain = Math.min(gain, -1 - m.peak);
  const tmp = `${out}.tmp.wav`;
  const r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', `${chain},volume=${gain.toFixed(2)}dB`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    log?.(`efekt işlenemedi, atlandı: ${basename(src)}`);
    return null;
  }
  renameSync(tmp, out);
  const env = envelopeInfo(bin, out);
  writeFileSync(`${out}.json`, JSON.stringify({
    src, sourceId: s.sourceId ?? null, title: s.title ?? null, kind, rate, gainDb: r3(gain), lufsMax: r3(m.maxM + gain),
    peakAt: env.peakAt, dur: env.dur, intensity: s.intensity, moods: s.moodsN, sceneTypes: s.typesN,
    curatorGainDb: s.gain_db ?? null, maxPerVideo: s.max_per_video ?? null, minGapSec: s.min_gap_sec ?? null,
  }));
  return out;
}

/**
 * Placement data for a pool file: where its peak sits and how long it is (a
 * whoosh is started `peakAt` before the cut), plus the curator's moods, scene
 * types, max_per_video and gain_db, so the engine can keep, say, the heavy
 * chapter whoosh off calm scenes.
 */
export function sfxMeta(file) {
  try {
    const j = JSON.parse(readFileSync(`${file}.json`, 'utf8'));
    return { ...j, peakAt: num(j.peakAt, 0), dur: num(j.dur, 0) };
  } catch {
    return null;
  }
}

/**
 * Transition/punch pools per engine kind, from the library: filtered by the
 * style (inspire never gets a stinger; horror and crime do), never a literal
 * one-shot (a gunshot is not a transition), never borrowed from another
 * style. A seeded subset per video when a kind has many files. Returns
 * absolute paths to loudness-normalised WAV copies (cached under <root>/.norm).
 */
export function pickSfxPools({ lib, root, genre, seed, ff, cacheDir, log } = {}) {
  const L = prep(lib, root);
  const g = GENRES.includes(genre) ? genre : 'documentary';
  const kinds = genreKinds(L.rules, g);
  const bin = ffmpegPath(ff);
  const outDir = cacheDir ?? join(L.root, '.norm');
  const pools = {};
  for (const kind of SFX_KINDS) {
    if (!kinds[kind]) continue;
    const cands = kindCandidates(L, kind, g);
    if (!cands.length) continue;
    const picked = weightedSample(cands, POOL_SIZE[kind], rngFor(seed ?? 'nova', g, 'pool', kind));
    const ref = L.kindRef[kind] ?? (kind === 'thud' ? L.kindRef.hit : null);
    const files = picked.map((c) => normaliseSfx({ s: c.s, kind, bin, outDir, kindRef: ref, log })).filter(Boolean);
    // Few sources: tape-speed copies keep the rotation from audibly looping. Never risers/swells — their length lands on the impact.
    if (files.length && files.length < 4 && !FROM_END.has(kind)) {
      for (const rate of [0.94, 1.06]) for (const c of picked) {
        const v = normaliseSfx({ s: c.s, kind, bin, outDir, rate, kindRef: ref, log });
        if (v) files.push(v);
      }
    }
    if (files.length) pools[kind] = files;
  }
  return pools;
}

/* ---------------------------------------------------------------- foley */

/*
 * Foley levels: the loudest momentary value of each kind (LUFS), ~20-26 dB
 * under the narrator's momentary peaks (-19 LUFS lines peak around -15).
 * Heard in the gaps, felt under the words, never competing with them.
 */
const FOLEY_TARGET = { paper: -37, pen: -40, shutter: -36, pin: -38, type: -40, page: -36 };
/* A click is loud for its loudness: no foley transient above this (dBFS, before the master's ~+5 dB). */
const FOLEY_PEAK = -16;
/* The sonic logo: quiet, a signature and not a sting. */
const LOGO_TARGET = -27;
/* Synthesized variants per foley kind, so a long video never repeats one. */
const FOLEY_VARIANTS = 3;
/* Recipe of the synthesized library sounds; a new recipe adds new files, the old stay valid. */
const SYNTH_VERSION = 'nv1';
/* Era gates (story year): no shutter before photography, no typewriter before 1870. */
const FOLEY_SINCE = { shutter: 1840, type: 1870 };
/* A typewriter is period colour for crime, history and finance; epic, science and a biography get none (rulebook). */
const FOLEY_NOT_IN = { type: ['epic', 'science', 'inspire'] };
export const FOLEY_KINDS = ['paper', 'pen', 'shutter', 'pin', 'type', 'page'];

/** Add entries to library.json, re-reading it right before the write (another job may have added to it). */
function appendLibrary(root, entries) {
  const index = join(root, 'library.json');
  let disk;
  try {
    disk = JSON.parse(readFileSync(index, 'utf8'));
  } catch {
    return false;
  }
  disk.sfx = Array.isArray(disk.sfx) ? disk.sfx : [];
  const have = new Set(disk.sfx.map((s) => s?.sourceId));
  const add = entries.filter((e) => !have.has(e.sourceId));
  if (!add.length) return true;
  disk.sfx.push(...add);
  const tmp = `${index}.tmp${process.pid}`;
  writeFileSync(tmp, JSON.stringify(disk, null, 1));
  renameSync(tmp, index);
  return true;
}

/** A copy levelled so its loudest moment is `target` LUFS (sample peak kept under `peakMax` dBFS), with a placement sidecar. */
function levelTo({ bin, src, outDir, sub, target, peakMax = -3, extra = {} }) {
  let st;
  try {
    st = statSync(src);
  } catch {
    return null;
  }
  const out = join(outDir, sub, `${basename(src, extname(src)).slice(0, 40)}-${hash(`lv1|${src}|${st.size}|${Math.round(st.mtimeMs)}|${target}|${peakMax}`)}.wav`);
  if (fileOk(out) && existsSync(`${out}.json`)) return out;
  mkdirSync(dirname(out), { recursive: true });
  const chain = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  const m = loudness(bin, src, { chain, momentary: true });
  if (m.maxM === null) return null;
  let gain = clamp(target - m.maxM, -40, 30);
  if (m.peak !== null) gain = Math.min(gain, peakMax - m.peak);
  const tmp = `${out}.tmp.wav`;
  const r = run(bin, ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-af', `${chain},volume=${gain.toFixed(2)}dB`, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]);
  if (r.status !== 0 || !fileOk(tmp)) {
    rmSync(tmp, { force: true });
    return null;
  }
  renameSync(tmp, out);
  const env = envelopeInfo(bin, out);
  writeFileSync(`${out}.json`, JSON.stringify({ src, gainDb: r3(gain), lufsMax: r3(m.maxM + gain), peakAt: env.peakAt, dur: env.dur, ...extra }));
  return out;
}

/**
 * Foley pools and the sonic logo. Library sounds first (a curated `foley`
 * entry, or for the shutter the library's real camera shutter); every kind is
 * topped up with synthesized variants (lib/sound-craft.mjs) that are written
 * INTO the library once — file plus library.json entry, like a generated
 * effect — so no video makes them twice. Each file is levelled per kind
 * (FOLEY_TARGET) into `cacheDir`. Kinds the story's era or style rules out
 * are left empty (no shutter in 1453, no typewriter in an epic).
 *
 * @returns {{pools: Record<string,string[]>, logo: {file:string, dur:number}|null}} absolute paths
 */
export function ensureFoley({ lib, root, genre, year = null, ff, cacheDir, log = () => {}, write = true } = {}) {
  const L = prep(lib, root);
  const base = root ?? lib?.root;
  const bin = ffmpegPath(ff);
  const outDir = cacheDir ?? join(L.root, '.norm');
  const g = GENRES.includes(genre) ? genre : 'documentary';
  const made = [];
  const synth = (id, file, render, extra) => {
    const abs = join(base, file);
    if (!fileOk(abs)) {
      try {
        render(abs);
      } catch (e) {
        log(`ses sentezi olmadı (${id}): ${String(e.message).slice(0, 120)}`);
        return null;
      }
    }
    made.push({
      sourceId: `nova-synth:${id}`, file, source: 'nova-synth', license: 'Nova Studyo — kendi sentezimiz (JS + ffmpeg), telif yok',
      title: extra.title, slug: id, role: extra.role, kind: extra.kind, ...(extra.foley ? { foley: extra.foley } : {}),
      intensity: 1, keywords: [], genres: GENRES, moods: MOODS, scene_types: ['any'], era: 'any', literal_only: false,
      max_per_video: 999, min_gap_sec: 1, gain_db: -24, duration: extra.duration,
    });
    return abs;
  };
  const pools = {};
  if (base) {
    for (const kind of FOLEY_KINDS) {
      if ((FOLEY_NOT_IN[kind] ?? []).includes(g)) continue;
      if (FOLEY_SINCE[kind] && year !== null && year < FOLEY_SINCE[kind]) continue;
      const own = L.sfx.filter((s) => s.kind === 'foley' && fold(s.foley ?? '') === kind && !String(s.sourceId ?? '').startsWith('nova-synth:')).map((s) => s.abs);
      if (kind === 'shutter') own.push(...L.sfx.filter((s) => s.kind === 'snap' && /\bshutter\b/.test(s.text)).map((s) => s.abs));
      const synthFiles = [];
      for (let v = 1; v <= FOLEY_VARIANTS; v++) {
        const id = `foley-${kind}-${v}-${SYNTH_VERSION}`;
        const f = synth(id, `sfx/${id}.wav`, (abs) => renderSynth({ bin, pcm: synthFoley(kind, v), out: abs, len: FOLEY_LEN[kind] }), {
          title: `Foley ${kind} ${v} (synth)`, role: 'foley', kind: 'foley', foley: kind, duration: FOLEY_LEN[kind],
        });
        if (f) synthFiles.push(f);
      }
      const files = [...new Set([...own, ...synthFiles])].map((src) => levelTo({ bin, src, outDir, sub: `foley/${kind}`, target: FOLEY_TARGET[kind], peakMax: FOLEY_PEAK, extra: { kind, foley: true } })).filter(Boolean);
      if (files.length) pools[kind] = files;
    }
  }
  let logo = null;
  if (base) {
    const id = `nova-logo-${SYNTH_VERSION}`;
    const src = L.sfx.find((s) => s.kind === 'logo' && !String(s.sourceId ?? '').startsWith('nova-synth:'))?.abs
      ?? synth(id, `sfx/${id}.wav`, (abs) => renderSynth({ bin, pcm: synthLogo(), out: abs, room: 'hall', len: 2.2 }), { title: 'Nova sonic logo (synth)', role: 'logo', kind: 'logo', duration: 2.2 });
    const lv = src ? levelTo({ bin, src, outDir, sub: 'logo', target: LOGO_TARGET, peakMax: -8, extra: { kind: 'logo' } }) : null;
    if (lv) logo = { file: lv, dur: sfxMeta(lv)?.dur || 2.2 };
  }
  if (made.length && write && base) {
    const known = new Set((lib?.sfx ?? []).map((s) => s?.sourceId));
    const fresh = made.filter((e) => !known.has(e.sourceId));
    if (fresh.length && appendLibrary(base, fresh)) {
      lib?.sfx?.push?.(...fresh);
      log(`kütüphaneye ${fresh.length} sentez ses eklendi (foley/imza)`);
    }
  }
  return { pools, logo };
}

/* ------------------------------------------------------------- ambience */

/* Match a sound's keywords against the scene's English sound text and Turkish narration. */
/*
 * A bed keyword that the word before (or after) turns into something else:
 * "cannon fire" is gunfire, not a campfire; "ateş açtılar" is shooting.
 */
const NOT_BEFORE = { fire: /^(cannon|gun|guns|rifle|rifles|musket|muskets|artillery|machine|cease|sniper|mortar|enemy|return)$/, ateş: /^(top|silah|tüfek|makineli|topçu|düşman)/u };
const NOT_AFTER = { ateş: /^(aç|et|ed)/u, fire: /^(at|on)$/ };
// "quiet suburban street" is not traffic either; the check is per phrase, so "quiet hall, murmuring voices" still gets its voices.
const EMPTY = /^(empty|deserted|abandoned|lonely|desolate|quiet|silent|boş|ıssız|terk|sessiz)/u;
function findPlace(list, kwWords, tr) {
  for (let from = 0; ;) {
    const j = findKeyword(list, kwWords, tr, from);
    if (j < 0) return -1;
    const k0 = lowerTr(kwWords[0]);
    const kl = lowerTr(kwWords.at(-1));
    const bad = (NOT_BEFORE[k0] && NOT_BEFORE[k0].test(list[j - 1] ?? '')) || (NOT_AFTER[kl] && NOT_AFTER[kl].test(list[j + kwWords.length] ?? ''));
    if (!bad) return j;
    from = j + 1;
  }
}

/*
 * A bed that IS a literal event: screams, sirens, gunfire, cannon, battle (folded words). Read from the bed's own
 * name, or from its keywords when it has none (the generated beds): not normSfx's `violent`, whose explo\w* catches
 * the wooden ship bed's 'explorer', nor the wind bed's context keyword 'battlefield'. Weather beds have their own rule.
 */
const BED_EVENT = /\b(explosions?|explod\w*|patla\w*|bomb|bombs|bombing|cannon\w*|guns?|gunfire|gunshots?|gunmen|gunman|silah\w*|kursun\w*|shot|shots|shooting|artillery|topcu\w*|blasts?|grenades?|shell|shells|shelling|shellfire|kilic\w*|swords?|scream\w*|ciglik\w*|thunder|siren\w*|alarms?|battle|battles|savas|clash\w*|riots?|rioting|firefight\w*|sniper\w*|mortars?|rockets?)\b/;
const EVENT_BED = new WeakMap();
function eventBed(s) {
  if (!EVENT_BED.has(s)) {
    const own = [...(s.ownW ?? [])].join(' ');
    EVENT_BED.set(s, !s.weather && BED_EVENT.test(` ${own || s.kw.map((k) => k.f).join(' ')} `));
  }
  return EVENT_BED.get(s);
}
/*
 * Match a bed's keywords against the scene's sound text (split into phrases: the
 * first names the place, the rest its details and distant sounds) and the Turkish
 * narration. Evidence is counted per matched WORD, so 'rain' and 'heavy rain' on
 * "heavy rain" are one piece of evidence, not two.
 */
function textMatch(s, soundPhrases, sayToks, sayBlocked = null) {
  /*
   * A bed that IS an event needs that event named, like weather (27 Ekim 2026): Titanic 20260930-24969b played
   * "crowd screaming far away" (gen-bed-618b8601fb) under "There was no moon that night. The sea was flat as glass."
   * (scenes 54-56) and under "Rescue was right in front of them... fast asleep." (102-107), carried there by its
   * context words 'calm', 'water', 'night'. Screams, sirens, cannon or battle play only where that sound is named;
   * the place words then count as before.
   */
  const evBed = eventBed(s);
  let evNamed = false;
  let sound = 0;
  let say = 0;
  const soundAt = new Set();
  const sayAt = new Set();
  let weather = false;
  for (const k of s.kw) {
    // Weather beds need the weather itself named; "funeral" or "that night" is not rain (rulebook).
    if (s.weather && !WEATHER.test(` ${k.f} `)) continue;
    const evWord = evBed && BED_EVENT.test(` ${k.f} `);
    let inSound = false;
    soundPhrases.forEach((p, n) => {
      // "empty stone hall": a crowd or traffic bed is the one thing that place is not.
      if (s.crowdy && p.toks.some((t) => EMPTY.test(t))) return;
      let j = findPlace(p.toks, k.wEn, false);
      if (j < 0) j = findPlace(p.toks, k.w, true);
      if (j < 0) return;
      // "no traffic", "without wind": the phrase names what the place does NOT have (27 Ekim 2026).
      if (p.toks.some((_, i) => i !== j && negEnAt(p.toks, i))) return;
      inSound = true;
      soundAt.add(`${n}:${j}`);
      // The place itself (first phrase) is full evidence; a detail or a distant sound less so.
      // So is a word naming what the bed IS ('wind' for a wind bed) against a context word
      // the curator added ('tent' for a campfire bed).
      const own = k.wEn.some((w) => s.ownW.has(fold(w)));
      /*
       * A context word alone ("tent" for a campfire, "sand" for desert wind,
       * "forest" for morning birds) stays under the threshold: it needs a
       * second matched word. At 0.9 it passed on its own, so the Dyatlov tent
       * in a blizzard got a crackling campfire and a river bank a desert.
       */
      sound = Math.max(sound, (p.head ? 1 : 0.85) * (own ? 1 : 0.62));
    });
    let j = findPlace(sayToks, k.w, true);
    // The narration names the event without it being there: negated, feared, reported, a reference back (clauseBlock).
    if (j >= 0 && evWord && sayBlocked?.(j, j + k.w.length - 1, k)) j = -1;
    if (j >= 0) {
      sayAt.add(j);
      say = 0.7;
    }
    if ((inSound || j >= 0) && WEATHER.test(` ${k.f} `)) weather = true;
    if (evWord && (inSound || j >= 0)) evNamed = true;
  }
  if (evBed && !evNamed) return { sound: 0, say: 0, weather: false, extra: 0 };
  return { sound, say, weather, extra: Math.min(0.4, 0.2 * Math.max(0, soundAt.size - 1) + 0.15 * Math.max(0, sayAt.size - 1)) };
}

/*
 * Time of day in the bed's own name against the writer's sound text: daytime
 * traffic or a dawn chorus never plays under "at night", a night bed never
 * under "morning". Only when the text says one and not the other.
 */
const NIGHT_T = /\b(night\w*|midnight|gece\w*|dark|karanlik\w*)\b/;
const DAY_T = /\b(day|daytime|morning|noon|afternoon|dawn|sunrise|sunny|sabah\w*|gunduz\w*|ogle\w*|safak\w*)\b/;
function timeConflict(b, soundFold) {
  const own = ` ${[...b.ownW].join(' ')} `;
  const night = NIGHT_T.test(soundFold);
  const day = DAY_T.test(soundFold);
  if (night && !day && /\b(day|morning|dawn|birds)\b/.test(own)) return true;
  if (day && !night && /\bnight\b/.test(own)) return true;
  return false;
}

/* The sound text as phrases ("heavy rain at night, distant jet engine rumble"): the first of each text is the place. */
function soundPhrases(texts) {
  const out = [];
  for (const t of texts) {
    String(t).split(/[,;.]+/).map((x) => toksEn(x)).filter((x) => x.length).forEach((toks, n) => out.push({ toks, head: n === 0 }));
  }
  return out;
}

/*
 * gain_db in the library is the sound's level relative to the narration (the
 * rulebook: beds -24..-30, literal events -8..-20). With the file's loudness
 * known, that becomes an exact linear gain; the result is kept inside a safe
 * window whatever the tag says.
 */
function relGain(fileLevel, relDb, ref, lo, hi) {
  const rel = clamp(relDb, lo, hi);
  if (fileLevel === null || !Number.isFinite(fileLevel)) return dbToLin(rel);
  return dbToLin(ref + rel - fileLevel);
}

/**
 * Room tone under RUNS of scenes. Consecutive scenes that share a place
 * (same `place`, else the same `sound` text — the writer repeats it while the
 * location holds) are one bed, bridged across up to two counters, charts or
 * words cards that interrupt them. A slam is never bridged: the bed drops out
 * before the hit (rulebook). The bed is chosen from the library by keywords,
 * era and style; below the threshold there is NO bed — silence is better than
 * a wrong bed. The rulebook's genre default beds only win ties, they never
 * play without evidence in the text.
 */
export function planAmbience({ script, lib, root, genre, sceneSeconds, seed, ff, measure } = {}) {
  const L = prep(lib, root);
  const g = GENRES.includes(genre) ? genre : GENRES.includes(script?.genre) ? script.genre : 'documentary';
  const rules = L.rules;
  if (genreRules(rules, g).beds === false) return [];
  const beds = L.sfx.filter((s) => s.kind === 'bed');
  const scenes = script?.scenes ?? [];
  if (!beds.length || !scenes.length) return [];
  const secs = sceneSecondsOf(script, sceneSeconds);
  const years = sceneYears(script);
  const thr = num(rules.bedThreshold, 0.65);
  // Beds sit well under the narration whatever a tag says (brief: about -24..-20 dB; rulebook: -24..-30).
  const lo = -30;
  const hi = -20;
  const sayT = scenes.map((sc) => sayTokens(sc.say));
  const sayToks = sayT.map((x) => x.toks);
  const griefAt = scenes.map((sc) => griefScene(sc));
  /*
   * The event word of a bed that IS a literal event (screams, sirens, cannon fire, battle: eventBed) needs the same
   * proof from the narration as a one-shot (27 Ekim 2026): "no siren sounded", "the shelling they feared", "since the
   * battle" put nothing in the room, and a death line never brings one in. Its place words ('night', 'water') and
   * every place bed (rain, a cockpit, a ship) keep the old evidence rules: "in the black water" is where, not when.
   */
  const sayBlocked = (i) => (j, last, k) => !!(griefAt[i] || negated(sayToks[i], last, k.f) || hypothetical(sayToks[i], j, last, k.f)
    || clauseBlock(sayToks[i], j, last, sayT[i].sent));

  // Beds stay out of chapter cards, and out of the cold-open montage unless its sound text names a place.
  const never = (sc) => (sc.type === 'montage' && !sc.sound && !sc.place) || (sc.type === 'title' && sc.chapterCard);
  const bridge = (sc) => ['counter', 'chart', 'words'].includes(sc.type) && !sc.sound && !sc.place;
  const keyOf = (sc) => (sc.place ? `p:${lowerTr(sc.place).trim()}` : sc.sound ? `s:${lowerEn(sc.sound).replace(/\s+/g, ' ').trim()}` : null);
  /*
   * Scenes between two runs that a bed may carry straight through: at most two graphic
   * cards. A chapter change alone does not stop the rain — the place carries the cut
   * while the music changes; a chapter CARD does (never() above).
   */
  const bridgeable = (from, to) => {
    const gap = scenes.slice(from, to);
    return gap.length <= 2 && gap.every((sc) => bridge(sc) && !never(sc));
  };

  // Places: runs of the same key, bridging up to two unkeyed graphic scenes if the same place resumes.
  const groups = [];
  for (let i = 0; i < scenes.length; i++) {
    const k = keyOf(scenes[i]);
    if (!k || never(scenes[i])) continue;
    const last = groups.at(-1);
    if (last && last.key === k && bridgeable(last.to + 1, i)) {
      last.to = i;
      last.members.push(i);
      continue;
    }
    groups.push({ key: k, from: i, to: i, members: [i] });
  }
  // Scripts without any sound/place text: fall back to the narration itself, scene by scene.
  if (!groups.length) {
    scenes.forEach((sc, i) => {
      if (!never(sc) && sc.type !== 'slam' && !bridge(sc) && sc.say) groups.push({ key: `say:${i}`, from: i, to: i, members: [i] });
    });
  }

  const byId = new Map(beds.map((b) => [String(b.sourceId ?? '').replace(/^.*:/, ''), b]));
  const defaults = new Set((L.defaults[g] ?? []).map((id) => byId.get(String(id))).filter(Boolean));
  const uses = new Map();
  const picked = [];
  for (const grp of groups) {
    const idx = grp.members;
    const soundTexts = [...new Set(idx.map((i) => scenes[i].place || scenes[i].sound).filter(Boolean))];
    const phrases = soundPhrases(soundTexts);
    const soundFold = ` ${words(soundTexts.join(' . ')).join(' ')} `;
    const moodSec = {};
    for (const i of idx) moodSec[scenes[i].mood ?? 'curious'] = (moodSec[scenes[i].mood ?? 'curious'] ?? 0) + secs[i];
    const mood = MOODS.reduce((b, m) => ((moodSec[m] ?? 0) > (moodSec[b] ?? 0) ? m : b), 'curious');
    const year = years[grp.from];
    const span = secs.slice(grp.from, grp.to + 1).reduce((a, v) => a + v, 0);
    const prev = picked.at(-1);
    const continues = (b) => !!prev && prev.b === b && (prev.toScene + 1 === grp.from || bridgeable(prev.toScene + 1, grp.from));
    const gates = (b, literal) => {
      if (eraConflict(b, year, soundFold, literal)) return false;
      if (timeConflict(b, soundFold)) return false;
      // "quiet snowy taiga", "quiet city street ... footsteps on snow": a blizzard or a storm is the one thing it is not.
      if (Number(b.intensity) >= 3 && /\b(quiet|calm|gentle|soft|still|faint|peaceful|sessiz|sakin)\b/.test(soundFold)) return false;
      if (SPACE.test(b.text) && g !== 'science' && !SPACE.test(soundFold)) return false;
      // A texture (heartbeat) never runs longer than 45 s (rulebook), counting the run it would extend.
      if (b.texture && span + (continues(b) ? prev.span : 0) > 45) return false;
      // Continuing the same bed across a cut is not another use of it.
      if (!continues(b) && (uses.get(b.idx) ?? 0) >= num(b.max_per_video, Infinity)) return false;
      return true;
    };
    const scored = [];
    for (const b of beds) {
      let best = 0;
      let evidence = 0;
      let literal = false;
      for (const i of idx) {
        const m = textMatch(b, phrases, sayToks[i], sayBlocked(i));
        // The writer described a different soundscape: the narration alone can never put a bed
        // there (capped under any threshold). Without any sound text the narration decides.
        const sc = m.sound ? m.sound + m.extra + (m.say ? 0.2 : 0) : phrases.length ? Math.min(0.5, m.say + m.extra) : m.say + m.extra;
        if (sc > 0) evidence++;
        if (m.sound) literal = true;
        best = Math.max(best, sc);
      }
      if (!best || !gates(b, literal)) continue;
      let s = best + Math.min(0.15, 0.05 * (evidence - 1));
      // The curator's style list for a bed is a judgement ("desert wind" is not for a
      // Seattle hijacking): outside it only strong evidence (two matched words) survives.
      if (b.genresN.length && !b.genresN.includes(g)) s *= 0.6;
      if (b.moodsN.length && !b.moodsN.includes(mood)) s *= 0.85;
      if (b.typesN.length && !idx.some((i) => b.typesN.includes(fold(scenes[i].type)))) s *= 0.9;
      // The style's own bed wins a tie; it never plays on its own say-so.
      if (defaults.has(b)) s += 0.04;
      // Keeping the bed that is already running beats restarting a similar one at the cut.
      if (continues(b)) s += 0.1;
      else s -= 0.1 * (uses.get(b.idx) ?? 0);
      scored.push({ key: b.idx, b, score: s });
    }
    const choice = pickNear(scored.filter((x) => x.score >= thr), rngFor(seed ?? 'nova', g, 'bed', grp.from), 0.03, 3);
    if (!choice) continue;
    const b = choice.b;
    // Two runs that land on the same bed ("rain on the window", then "rain, distant thunder")
    // are one continuous bed, not a restart at the cut.
    if (continues(b)) {
      prev.toScene = grp.to;
      prev.span += span;
      continue;
    }
    uses.set(b.idx, (uses.get(b.idx) ?? 0) + 1);
    picked.push({ b, fromScene: grp.from, toScene: grp.to, span });
  }

  const cues = [];
  for (const p of picked) {
    // Under 3 s a bed is only a fade in and out: better nothing.
    if (secs.slice(p.fromScene, p.toScene + 1).reduce((a, v) => a + v, 0) < 3) continue;
    const b = p.b;
    const dur = Number(b.duration) || 0;
    const offset = dur > 6 ? Math.floor(rngFor(seed ?? 'nova', 'bedoff', p.fromScene, b.idx)() * (dur - 4) * 10) / 10 : 0;
    const lv = levelsOf(L, b, { ff, measure });
    const rel = typeof b.gain_db === 'number' ? b.gain_db : -26;
    cues.push({
      file: b.abs,
      fromScene: p.fromScene,
      toScene: p.toScene,
      gain: r3(clamp(relGain(lv.lufs, rel, NARRATION_LUFS, lo, hi), 0.001, 1)),
      offset,
    });
  }
  return cues;
}

/* --------------------------------------------------------------- events */

/*
 * Scenes that are read, not lived (27 Ekim 2026): a number, a chart, a quote, a headline. Lula 20261026-29db03 put
 * a distant explosion under the bars "Lula took it, 50.39 to 49.61" (6:17.8) and a police siren under the icons
 * "48 of every 100 valid votes" (9:47.4). No literal event plays on these at all.
 */
const NO_EVENT_SCENES = new Set(['counter', 'chart', 'bars', 'icons', 'stat', 'donut', 'scale', 'ui-card', 'board', 'quote', 'document', 'headline']);
/* Graphic scenes: the narration may still name an event there, but a sound only DESCRIBED in the sound text never fires. */
const GRAPHIC_SCENES = new Set([...NO_EVENT_SCENES, 'map', 'timeline', 'words', 'explainer', 'flow', 'title']);
/* A line that reads out a share, a percentage or a score: a described sound never lands under it. */
const NUMBER_LINE = /\b\d+(?:[.,]\d+)?\s*(?:%|percent\b|per ?cent\b)|\bof every \d|\b\d+(?:[.,]\d+)? to \d+(?:[.,]\d+)?\b|\bvotes?\b|\bshare of\b/i;
/** Sound-text tokens and the phrase of each ("night square, cheering crowd, firecrackers far off": three phrases). */
function soundTokens(text) {
  const out = [];
  const sent = [];
  String(text ?? '').split(/[,;.]+/).forEach((part, n) => {
    for (const t of toksEn(part)) {
      out.push(t);
      sent.push(n);
    }
  });
  return { toks: out, sent };
}
/** A negation inside the keyword's own phrase: "no sirens", "quiet street without traffic". */
function phraseNegated(list, sent, j) {
  for (let i = 0; i < list.length; i++) if (sent[i] === sent[j] && i !== j && negEnAt(list, i)) return true;
  return false;
}
/*
 * A person shot is a killing or a wounding, not a sound effect (rulebook: a real killing gets silence). D.B. Cooper
 * 20260930-08f5fc put a gunshot under the agent's "When I shot McCoy... I shot D.B. Cooper." (scene 138), the line
 * after "the FBI kills him". Case-sensitive on purpose: a capital is a name ("shot McCoy"), "shot dead" is in KILLING.
 */
const SHOT_PERSON = /\b(?:shot|shoots|shooting|gunned down)\s+(?:him|her|them|me|us|himself|herself|[A-Z][\p{L}'.-]+)/u;
/* A literal impact (explosion, shot, cannon, siren, thunder, anything rated 4+): never on a grief line. */
const impactSfx = (e) => e.violent || e.gunshot || num(e.intensity, 0) >= 4;

/**
 * Literal one-shots: only when the narration (or the scene's sound text)
 * names the event and it actually happens there, landed on the spoken word.
 * Never decorative: never two in one scene, capped per sound and per video,
 * spaced out, and never a violent sound under calm or sad narration unless the
 * narrator literally says it (and never in a biography at all). Never when the
 * sentence negates it, fears it, reports it or only refers back to it
 * (clauseBlock), never on a number/chart/quote card, never an impact on a grief line.
 */
export function planEvents({ script, lib, root, genre, seed, sceneSeconds, ff, measure } = {}) {
  const L = prep(lib, root);
  const g = GENRES.includes(genre) ? genre : GENRES.includes(script?.genre) ? script.genre : 'documentary';
  const rules = L.rules;
  if (genreRules(rules, g).events === false) return [];
  const events = L.sfx.filter((s) => (s.kind === 'event' || s.literal) && s.kw.length);
  const scenes = script?.scenes ?? [];
  if (!events.length || !scenes.length) return [];
  const secs = sceneSecondsOf(script, sceneSeconds);
  const starts = [];
  secs.reduce((at, v, i) => ((starts[i] = at), at + v), 0);
  const total = secs.reduce((a, v) => a + v, 0);
  const years = sceneYears(script);
  const globalGap = num(rules.eventMinGapSec, 8);
  const cap = num(rules.maxEventsPerVideo, Math.max(2, Math.ceil((total / 60) * num(rules.eventsPerMinute, 1))));
  const maxSec = num(rules.eventMaxSec, 6);

  const placed = [];
  const uses = new Map();
  let prevSound = null;
  // How far a sound may start before its scene's cut: half the shot before it, at most PRELAP_MAX.
  const prelapFloor = (i) => {
    const p = scenes[i - 1];
    if (!p || p.type === 'slam' || (p.type === 'title' && p.chapterCard)) return 0;
    // Nothing leaks back into a death line either (27 Ekim 2026).
    if (griefScene(p)) return 0;
    return -Math.min(PRELAP_MAX, (secs[i - 1] ?? 0) / 2);
  };
  scenes.forEach((sc, i) => {
    const soundKey = sc.sound ? lowerTr(sc.sound).trim() : null;
    // The ambience text repeats while a place holds; only its first scene may trigger a described event.
    const soundIsNew = soundKey && soundKey !== prevSound;
    prevSound = soundKey;
    if (placed.length >= cap) return;
    if (sc.type === 'title' && sc.chapterCard) return;
    // A number, a chart, a quote or a headline is read, not lived: no literal event on it (Lula 6:17.8, 9:47.4).
    const type = fold(sc.type ?? '');
    if (NO_EVENT_SCENES.has(type)) return;
    const sayFold = words(sc.say).join(' ');
    if (SUICIDE.test(sayFold)) return;
    const killing = KILLING.test(sayFold) || DEATH_TR.test(lowerTr(stripTags(sc.say))) || SHOT_PERSON.test(stripTags(sc.say));
    // GRIEF (the shared contract: scene.grief, else GRIEF/NOT_GRIEF per sentence): no literal impact on a death line.
    const grief = griefScene(sc);
    const mood = MOODS.includes(sc.mood) ? sc.mood : 'curious';
    const wt = Array.isArray(sc.wordTimes) && sc.wordTimes.length ? sc.wordTimes.filter((w) => !/^\[.*\]$/.test(String(w.word).trim())) : null;
    // With word timings, token k IS spoken word k, so a match lands on its own timestamp.
    const { toks: sayToks, sent: saySent } = sayTokens(sc.say, wt);
    /*
     * A sound the writer only DESCRIBED never fires on a graphic or a number line: Lula's "firecrackers far off"
     * under the bars "50.39 to 49.61" became an explosion, its "distant siren" a police siren under "48 of every
     * 100 valid votes" (icons).
     */
    const soundOk = soundIsNew && !GRAPHIC_SCENES.has(type) && !NUMBER_LINE.test(stripTags(sc.say));
    const { toks: soundToks, sent: soundSent } = soundOk ? soundTokens(sc.sound) : { toks: [], sent: [] };
    const soundFold = ` ${words(soundIsNew ? sc.sound : '').join(' ')} `;
    const cands = [];
    for (const e of events) {
      if (e.genresN.length && !e.genresN.includes(g)) continue;
      if (e.typesN.length && !e.typesN.includes(fold(sc.type))) continue;
      if (g === 'inspire' && e.violent) continue;
      // A space-age sound ("Space rocket full power") in a story before the space age: Titanic's distress rockets were flares.
      if (SPACE.test(e.text) && years[i] != null && years[i] < 1950) continue;
      // A narrated death gets silence, not a sonified gunshot or blast (rulebook: "prefer silence").
      if (killing && (e.gunshot || e.violent)) continue;
      if (grief && impactSfx(e)) continue;
      if ((uses.get(e.idx) ?? 0) >= num(e.max_per_video, Infinity)) continue;
      const hits = [];
      for (const k of e.kw) {
        for (let from = 0; ;) {
          const j = findKeyword(sayToks, k.w, true, from);
          if (j < 0) break;
          const last = j + k.w.length - 1;
          from = j + 1;
          if (negated(sayToks, last, k.f) || figurative(sayToks, j, last) || hypothetical(sayToks, j, last, k.f) || clauseBlock(sayToks, j, last, saySent)) continue;
          // An object noun ("top", "bomba") counts when a verb makes it sound; the cue then lands on that verb.
          const v = k.weak ? actedAt(sayToks, j, last, e.verbs, saySent) : -1;
          hits.push({ src: 'say', j: v >= 0 ? v : j, word: j, k, acted: v >= 0 });
          break;
        }
        if (soundToks.length) {
          let j = findKeyword(soundToks, k.wEn, false);
          if (j < 0) j = findKeyword(soundToks, k.w, true);
          // "no sirens", "without gunfire": negated inside its own phrase of the sound text.
          if (j >= 0 && !otherThing(soundToks, j, k) && !phraseNegated(soundToks, soundSent, j)) {
            hits.push({ src: 'sound', j, k, acted: k.weak && actedAt(soundToks, j, j + k.w.length - 1, e.verbs, soundSent) >= 0 });
          }
        }
      }
      // One sound word ("siren", "patladı") or an object that sounds ("toplar gürledi") is enough.
      // Context words need a second one IN THE NARRATION, on a different word: "polis" plus the
      // sound text's "police station", or 'bomb' and 'bomba' both matching "bombayı", are one
      // idea in two languages, not two pieces of evidence.
      const strong = hits.filter((h) => !h.k.weak || h.acted);
      const sayWeak = new Set(hits.filter((h) => h.src === 'say' && h.k.weak && !h.k.object).map((h) => h.word));
      if (!strong.length && sayWeak.size < 2) continue;
      const hit = strong.find((h) => h.src === 'say') ?? strong[0] ?? hits.find((h) => h.src === 'say');
      if (!hit) continue;
      if (eraConflict(e, years[i], soundFold, hit.src === 'sound')) continue;
      // Mood: a violent sound under calm or grief only when the narrator says it; anything
      // else keeps to the curator's moods, and a sound only DESCRIBED must fit the scene too.
      if (!(e.violent && hit.src === 'say')) {
        if (e.moodsN.length && !e.moodsN.includes(mood)) continue;
        if (hit.src !== 'say' && e.violent && (mood === 'calm' || mood === 'sad')) continue;
      }
      let score = hit.src === 'say' ? 1 : 0.8;
      if (strong.length) score += 0.1;
      if (e.genresN.includes(g)) score += 0.05;
      score -= 0.15 * (uses.get(e.idx) ?? 0);
      cands.push({ key: e.idx, e, hit, score });
    }
    if (!cands.length) return;
    const ordered = [...cands].sort((a, b) => b.score - a.score || a.key - b.key);
    const first = pickNear(ordered, rngFor(seed ?? 'nova', g, 'event', i), 0.05, 3);
    for (const c of [first, ...ordered.filter((x) => x !== first)]) {
      const e = c.e;
      const lv = levelsOf(L, e, { ff, measure });
      let at;
      if (c.hit.src === 'say') {
        at = wt ? Number(wt[c.hit.j]?.t) || 0 : 0.25 + c.hit.j * 0.42;
        // Explosions, shots and doors land ON the word; sirens, bells and applause lead in (rulebook).
        // A word right after the cut may pull its sound back across it (pre-lap), never into a slam or a card.
        at = Math.max(prelapFloor(i), at - lv.onset - e.preroll + 0.02);
      } else {
        // Described in the sound text only: drop it into the first breath of the narration, not on a word.
        at = 0.3;
        if (wt) {
          for (let k = 1; k < wt.length; k++) if (wt[k].t - wt[k - 1].t >= 0.6 && wt[k - 1].t >= 0.4) { at = wt[k - 1].t + 0.35; break; }
        }
        at = Math.max(0, at - lv.onset);
      }
      if (at >= secs[i]) at = Math.max(0, secs[i] - 0.3);
      const abs = starts[i] + at;
      // Sounds of one family (three explosion files) share the spacing rule; a generic role does not make a family.
      const role = fold(e.role ?? '').trim();
      const family = role && !/^(event|one.?shot|foley|sfx|literal|sound|transition)$/.test(role) ? role : e.kw[0]?.f || String(e.idx);
      const gapOf = (x) => num(x.min_gap_sec, 60);
      const clash = placed.some((p) => Math.abs(p.abs - abs) < globalGap
        || ((p.e.idx === e.idx || p.family === family) && Math.abs(p.abs - abs) < Math.max(gapOf(e), gapOf(p.e))));
      if (clash) continue;
      const dur = Math.min(Number(e.duration) || 4, e.preroll ? Math.max(maxSec, 8) : maxSec);
      // Short one-shots are levelled by their peak loudness, long ones (a siren) by their average.
      const short = (Number(e.duration) || 0) <= 6;
      const level = short ? lv.lufsMax : lv.lufs;
      const ref = short ? NARRATION_PEAK : NARRATION_LUFS;
      let gain = relGain(level, typeof e.gain_db === 'number' ? e.gain_db : e.intensity >= 4 ? -10 : -16, ref, -24, -4);
      if (sc.type === 'slam') gain *= dbToLin(-3); // the slam already has its own hit on this word
      // The room the event happens in (writer's place/sound text first): the pipeline adds that space's tail.
      const space = spaceOfText(sc.place, sc.sound, sc.say);
      placed.push({
        e, family, abs,
        cue: {
          file: e.abs, scene: i, at: r3(at), gain: r3(clamp(gain, 0.01, 1)), dur: r3(dur),
          ...(e.intensity >= 5 ? { replacesHit: true } : {}), ...(space ? { space } : {}), ...(at < 0 ? { prelap: true } : {}),
        },
      });
      uses.set(e.idx, (uses.get(e.idx) ?? 0) + 1);
      break;
    }
  });
  return placed.map((p) => p.cue);
}

/* Internals for tests and tooling. */
export const _internals = { musicPoolFor: musicPool, planRuns, timeline, bestStart, windowFit, culturePrefs, musicPool, prep, parseDefaultBeds, speechMap, quietPoint, SCORE_LUFS, NARRATION_LUFS, SFX_TARGET, XFADE, MIN_HOLD,
  bestStart2, styleScore, qualityOf, historyPenalty, annotateEnergy, addBreaths, themeSpots, PALETTE_MIN, PALETTE_MAX, MAX_USES,
  MIN_HOLD_V2, CHANGES_PER_MIN, VERIFY_MAX, THEME_MAX_USES, fitFor, remapWeights, digitYears, sceneEraYear, griefOk,
  FADE_OUT, GAIN_UP_MAX, QUIET_LUFS, SEAM_MEASURE, SEAM_TOL, SEAM_RAMP, DIP_WIN, DIP_DEPTH, sayTokens, soundTokens, verbForm, NO_EVENT_SCENES, GRAPHIC_SCENES };

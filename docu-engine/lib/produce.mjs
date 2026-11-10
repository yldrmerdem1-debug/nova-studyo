// Sinematik belgesel üretim hattı — kütüphane.
//
// Aynı kod iki yerden çalışır:
//   - komut satırı:  node scripts/produce.mjs videos/<ad>.json
//   - Nova Studyo:   bin/nova-run.mjs (alt süreç, JSON satırlarıyla ilerleme bildirir)
//
//   1. images        consistent stills: one reference portrait per cast member,
//                    every shot of that person derived from it, everything
//                    sharing one visual style; 2.5D depth layers
//   2. chapter cards a 2.8s "BÖLÜM 3" card at every chapter change (no voice),
//                    reusing that chapter's first picture
//   3. narration     ElevenLabs v3 with performance tags + word timestamps;
//                    a credit check first, every line levelled to one loudness
//   4. music         cut from the licensed sound library by the audio director
//                    (lib/audio-director.mjs): cues per chapter and story turn,
//                    levelled, crossfaded, one file exactly as long as the video.
//                    ElevenLabs Music composition only without a library or when
//                    the user chose musicSource 'eleven'
//   5. beats         a beat grid per music cue, found in the assembled score
//   6. SFX pool      library transition sounds, loudness-normalised per kind;
//                    cached ElevenLabs pools only fill kinds the library lacks
//   7. ambience      library room-tone beds spanning runs of scenes, and literal
//                    one-shots landed on the spoken word ("toplar gürledi")
//   8. render        Remotion (prebuilt bundle, this video's assets as its public/),
//                    in chunks per chapter: each chunk cached by what it shows, so
//                    a crash resumes where it stopped and a fixed picture re-renders
//                    only its own chapter; audio rendered alongside, joined once
//   9. master        measured gain + oversampled limiter: -14 LUFS, -1.5 dBTP, 48 kHz
//
// Everything paid for is cached by content hash in a cache shared by every job
// (voice lines, music, SFX, ambience): tweak one line of narration and only
// that line is regenerated, re-cut the same script in another style and the
// narration is free.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync, cpSync, existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, statfsSync, statSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse as parsePath, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureFoley, libraryRoot, loadLibrary, musicHistoryFor, pickSfxPools, planAmbience, planEvents, planScore, readMusicHistory, recordMusicHistory, renderScore, editGravity, sceneYears, sfxMeta } from './audio-director.mjs';
import { applyBreath, applyEditGrammar, tightenToVoice } from './edit-grammar.mjs';
import { planInserts, insertPicturesAhead } from './inserts.mjs';
import { periodNegative, promptYear, yearOfEra } from './period.mjs';
import { directLines, isV4, untagAlignment } from './voice-director.mjs';
import { klingImageToVideo, KLING_CHEAP_MODEL } from './kling.mjs';
import { VOICE_CHAIN_VERSION, applySpace, panVariant, processVoice, widenBed } from './sound-craft.mjs';
import { placeTimeline } from '../src/timeline.js';
import { openingEnd } from '../src/opening/plan.js';
import { attachWorldMaps } from './world-map.mjs';
import { SLOW_DIRECTION, VOICE_SPEED, detectSilences, paceFilter, paceIdentity, pacePlan, paceWords } from './pace.mjs';
import { editScorecard, scorecardLine } from './edit-scorecard.mjs';
import { COLLAGE_GENRES, deriveStyle, isLowResStill } from '../src/effects/variety.js';
import { addNeed, inboxFileFor, pad as padNo, writeList } from './image-inbox.mjs';

export const ENGINE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const dbToLin = (db) => Math.pow(10, db / 20);
const stripTags = (s) => String(s ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const fmtN = (n) => Math.round(n).toLocaleString('tr-TR');
// Round to whole seconds first: 599.6 s is "10 dk 0 sn", never "9 dk 60 sn" (same slip as docu-script clock).
const fmtMin = (s) => { const t = Math.round(s); return `${Math.floor(t / 60)} dk ${t % 60} sn`; };
const toPosix = (p) => p.split(sep).join('/');

/** A cache hit is a file with content: a killed write can leave a 0-byte file behind. */
const fileOk = (f) => {
  try {
    return statSync(f).size > 0;
  } catch {
    return false;
  }
};
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
/** Write next to the target and rename: a cancelled job never leaves a truncated file that later reads as cached. */
function writeAtomic(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}
/** Same volume: a hard link costs no disk (a 12-minute job's audio would otherwise exist 2-3 times). */
function linkOrCopy(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  const tmp = `${dst}.tmp${process.pid}`;
  rmSync(tmp, { force: true });
  try {
    linkSync(src, tmp);
  } catch {
    copyFileSync(src, tmp);
  }
  renameSync(tmp, dst);
}

/*
 * A deadline on every ffmpeg the engine waits on. spawnSync/execFileSync block the whole engine, and a hung
 * ffmpeg sat there until Nova's 25-minute stall watchdog killed the job with no word of what hung (hang
 * analysis of the submarine job 20261024-373aaf, 25 Oct 2026). A probe gets 60 s, a still or a short file
 * 180 s, a pass over a long file 180 s plus its own length, never more than 20 minutes (inside the watchdog).
 * -nostdin: ffmpeg never waits on the console. A killed run fails through its usual error path; a probe or a
 * measurement (ffText) throws, since its callers would read the killed run's partial output as a result.
 */
export const FF_PROBE_MS = 60_000;
export const FF_SHORT_MS = 180_000;
const FF_MAX_MS = 20 * 60_000;
/** Deadline of an ffmpeg pass over `seconds` of media (length unknown: the longest). */
// Node wants a whole number of ms: 22,960 frames / 30 = 765.33 s gave 945333.33 and killed the Chernobyl job after its full render.
export const ffDeadline = (seconds) => (Number(seconds) > 0 ? Math.ceil(Math.min(FF_MAX_MS, FF_SHORT_MS + Number(seconds) * 1000)) : FF_MAX_MS);
/** Node's own "spawnSync <long ffmpeg path> ETIMEDOUT" is cut off in the logs: a run killed at its deadline says so first. */
function deadlineNote(e, ms) {
  if (e?.code === 'ETIMEDOUT') e.message = `ffmpeg ${Math.round(ms / 1000)} sn içinde bitmedi, durduruldu (${e.message})`;
  return e;
}
/** spawnSync for ffmpeg: -nostdin, no window, a deadline. */
function ffSync(bin, args, { timeout = FF_SHORT_MS, ...opts } = {}) {
  const r = spawnSync(bin, ['-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, ...opts, timeout });
  deadlineNote(r.error, timeout);
  return r;
}
/** stderr + stdout of an ffmpeg probe or measurement; a run killed at its deadline throws (no partial result). */
function ffText(bin, args, timeout = FF_SHORT_MS) {
  const r = ffSync(bin, args, { timeout });
  if (r.error?.code === 'ETIMEDOUT') throw r.error;
  return (r.stderr ?? '') + (r.stdout ?? '');
}

/**
 * Run `fn` over `items` with at most `n` in flight; results keep their order.
 * On the first error no new item starts, but the ones already in flight are
 * allowed to finish: their requests are paid for, so their results must reach
 * the cache before the error is rethrown.
 */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  let failed = null;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch (e) {
        failed ??= e;
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw failed;
  return out;
}

/* ------------------------------------------------------------- network */

/* Error codes of a connection that broke, not of a request that was refused. */
const NET_CODES = /^(ECONNRESET|ECONNREFUSED|ECONNABORTED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EPIPE|ENETUNREACH|ENETDOWN|EHOSTUNREACH|UND_ERR_\w+)$/;
/** A thrown fetch error worth retrying: undici's "fetch failed" with a socket/DNS cause, or a timeout. */
function transientNet(e) {
  if (!e || e.cancelled) return false;
  const code = e.cause?.code ?? e.code;
  if (code && NET_CODES.test(code)) return true;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true;
  return e instanceof TypeError && /fetch failed|terminated|socket|network/i.test(`${e.message} ${e.cause?.message ?? ''}`);
}
const netWhy = (e) => e?.cause?.code ?? e?.code ?? e?.name ?? 'ağ';
/* Statuses that mean "not now", never "no": the same request may succeed later. */
const TRANSIENT_STATUS = (s) => s === 408 || s === 429 || s >= 500;
/* An empty balance also arrives as 429 (OpenAI insufficient_quota): never retried. */
const QUOTA_BODY = /insufficient_quota|quota_exceeded|billing_hard_limit|billing_not_active|payment_required|insufficient.credit/i;
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

/**
 * fetch for paid and free provider calls alike. A dropped connection, DNS
 * failure, reset or timeout — and, unless `retryHttp` is false, 408/429/5xx —
 * is retried with jittered exponential backoff (the server's Retry-After
 * wins) for up to `tries` attempts / `maxWaitMs`. The body is read INSIDE the
 * retry loop and handed back buffered: a connection that dies halfway through
 * a 3 MB image is retried too, and the caller's `r.json()` can no longer throw
 * a network error. An empty balance is never retried. No short AbortSignal is
 * put on paid calls here — an aborted image generation is still billed.
 * @returns {Promise<Response>} the first response that is not transient (or the last one)
 */
export async function fetchRetry(url, init = {}, { tries = 11, maxWaitMs = 600_000, retryHttp = true, label = 'istek', log = () => {}, guard = () => {}, baseMs = 2000 } = {}) {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    guard();
    let r;
    let buf;
    try {
      r = await fetch(url, typeof init === 'function' ? init() : init);
      buf = NULL_BODY.has(r.status) ? null : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (e?.cancelled || !transientNet(e)) throw e;
      if (attempt >= tries || Date.now() - started > maxWaitMs) {
        throw Object.assign(new Error(`${label}: bağlantı kurulamadı (${netWhy(e)}), ${attempt} deneme`), { network: true, cause: e });
      }
      const wait = Math.min(90_000, baseMs * 2 ** (attempt - 1)) + Math.random() * Math.min(1500, baseMs);
      log(`${label}: bağlantı hatası (${netWhy(e)}), ${attempt}. deneme — ${Math.round(wait / 1000)} sn bekleniyor`);
      await sleep(wait);
      continue;
    }
    const res = new Response(buf, { status: r.status, statusText: r.statusText, headers: r.headers });
    if (!retryHttp || !TRANSIENT_STATUS(r.status) || attempt >= tries || Date.now() - started > maxWaitMs) return res;
    const text = buf ? buf.toString('utf8') : '';
    if (QUOTA_BODY.test(text)) return res;
    const after = Number(r.headers.get('retry-after')) || Number(text.match(/"retry_after"\s*:\s*([\d.]+)/)?.[1]);
    const wait = Math.min(90_000, after > 0 ? after * 1000 : baseMs * 2 ** (attempt - 1)) + Math.random() * Math.min(1500, baseMs);
    log(`${label}: ${r.status}, ${attempt}. deneme — ${Math.round(wait / 1000)} sn bekleniyor`);
    await sleep(wait);
  }
}

/* --------------------------------------------------------- image helpers */

/* Provider refusals: a moderation/safety block is about THIS prompt, never about the account. */
const MODERATION_BODY = /moderation_blocked|safety system|safety_violations|content_policy|content policy|sensitive|nsfw|flagged|\bE005\b/i;

/**
 * Why an image failure means the whole image stage is broken — not just this
 * one picture — or null. A dead key (401), a model the account may not use
 * (403, e.g. an unverified OpenAI organisation), a wrong model name (404), a
 * malformed request (400/422 that is not a moderation refusal), a network
 * that stays down and a provider that stays busy all fail EVERY picture the
 * same way; they must stop the job instead of filling a paid video with
 * borrowed frames.
 */
export function systemicReason(e) {
  if (!e || e.moderation || e.cancelled || e.quota) return null;
  if (e.network) return 'net';
  if (e.rateLimited || e.timeout) return 'busy';
  const s = e.status;
  if (s === 401) return 'auth';
  if (s === 403) return 'forbidden';
  if (s === 404) return 'model';
  if (s === 400 || s === 422) return 'request';
  if (s === 408 || s === 429 || s >= 500) return 'busy';
  return null;
}
const SYSTEMIC_TR = {
  net: 'görsel sağlayıcısına ulaşılamıyor — internet bağlantısını kontrol edin',
  busy: 'görsel sağlayıcısı uzun süre yanıt vermedi (hız sınırı ya da sunucu hatası) — biraz sonra yeniden deneyin',
  auth: 'görsel API anahtarı geçersiz (401) — Ayarlar\'dan OpenAI/Replicate anahtarını kontrol edin',
  forbidden: 'hesabın bu görsel modeline erişimi yok (403; OpenAI\'da kuruluş doğrulaması gerekebilir) — Ayarlar\'ı kontrol edin',
  model: 'görsel modeli bulunamadı (404) — Ayarlar\'daki model adını kontrol edin',
  request: 'görsel isteği reddedildi (400) — model ve boyut ayarını kontrol edin',
};

/*
 * Softening a refused prompt: graphic nouns out, "implied, not shown" in.
 * Crime and horror legitimately get refusals ("the body was found..."); the
 * documentary way is shadows, aftermath objects and police tape anyway.
 */
/* A determiner in front of a replaced noun goes with it ("the dead body" → "a covered shape", not "the a covered shape"). */
const DET = String.raw`(?:\b(?:a|an|the|his|her|their|its|some|two|three|several)\s+)?`;
const GRAPHIC = [
  [new RegExp(`${DET}\\b(dead|lifeless|murdered|mutilated|dismembered|decapitated|headless|bloody|bloodied|bleeding|burned|charred)\\s+(bod(y|ies)|corpses?|m[ae]n|wom[ae]n|victims?|child(ren)?|soldiers?|people|person|hikers?)\\b`, 'gi'), 'a covered shape'],
  [new RegExp(`${DET}\\b(corpses?|cadavers?|bodies|dead body|body bags?|remains)\\b`, 'gi'), 'a covered shape'],
  [/\b(bloody|bloodied|blood-soaked|blood-stained|bloodstained)\s+/gi, ''],
  [/\b(blood|bloodstains?|gore|gory|guts|entrails|wounds?|wounded|injur(y|ies|ed)|bruis(e|es|ed)|severed|mutilat\w*|dismember\w*|decapitat\w*|torture\w*|suicide|hanged|hanging body|noose|strangl\w*)\b/gi, ''],
  [/\b(murdered|killed|slaughtered|massacred|executed|shot dead|stabbed)\b/gi, ''],
  [new RegExp(`${DET}\\b(murders?|killings?|slaughter|massacres?|executions?|gunshots?|shootings?|stabbings?)\\b`, 'gi'), 'the aftermath'],
  [new RegExp(`${DET}\\b(guns?|pistols?|revolvers?|rifles?|shotguns?|firearms?|handguns?|bullets?|ammunition|knives|knife|blades?|daggers?|machetes?|weapons?|bombs?|explosives?)\\b`, 'gi'), 'an object'],
  [/\b(naked|nude|nudity|explicit|sexual|topless)\b/gi, ''],
  [/\b(graphic|gruesome|grisly|brutal|violent|violence|horrific|terrifying|screaming in agony)\b/gi, 'somber'],
];
export function softenPrompt(prompt) {
  let p = String(prompt ?? '');
  for (const [re, to] of GRAPHIC) p = p.replace(re, to);
  p = p
    .replace(/\ban (?=an object|a covered|the aftermath)/gi, '')
    .replace(/\b(an object)(\s*(,|and|or)\s*an object)+/gi, '$1')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,.;:])\s*[,.;:]+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:]+|[\s,.;:]+$/g, '');
  return `Tasteful, non-graphic documentary reconstruction, implied not shown: ${p}. Implied and off-screen, no blood, no injuries, no weapons in view, calm and respectful`;
}

/* Framings in which a face cannot be seen: real people are shown only like this in AI shots. */
const FACE_HIDDEN = /silhouett|from behind|back to (the )?camera|seen from the back|from the back|over[- ]the[- ]shoulder|close-up of (his|her|their|the|a|an) hands?|hands only|only (his|her|their) hands|extreme(ly)? wide|aerial|far away|in the distance|distant (figure|silhouette)|tiny figure|face (is )?(not visible|hidden|obscured|turned away|in shadow)|backlit|no face|faceless|feet only|shadow of/i;
/* Shots with nobody's face in them: a reference portrait would only pull the composition toward a head-and-shoulders. */
const FACELESS = /silhouett|from behind|back to (the )?camera|seen from the back|close-up of (his|her|their|the|a|an) hands?|hands only|aerial view|extreme(ly)? wide|empty (room|street|office|corridor|hall|house|desk|chair)|no people|nobody|face (is )?(not visible|hidden|turned away)|faceless/i;

/*
 * A FACE FRAMING IS NOT HIDDEN BY A SUFFIX (2009 submarine collision, Oct 2026): "Formal portrait of the man ...,
 * steady direct gaze, plain dark background, seen from behind or in silhouette, face not visible" — the writer's own
 * framing stayed in front of the suffix, and the admiral's shot came back as a submarine with nobody in it. The
 * framings that ask for a face are turned to the back before the suffix.
 */
const FACE_FRAMING = [
  [/\b(?:(?:formal|official|studio|head-and-shoulders)\s+)*portrait of\b/gi, 'back view of'],
  // "close-up of the man's face" is the back of his head; "close-up of the man's hands" shows no face and stays as asked.
  [/\b(?:extreme\s+)?close-up of (?:the |a |an )?(man|woman|person)['’]s face\b/gi, "the back of the $1's head"],
  [/\b(?:extreme\s+)?close-up of (?:the |a |an )?(man|woman|person)\b(?!['’])/gi, 'view from behind of the $1'],
  [/\b(?:extreme\s+)?close-up of (his|her|their) face\b/gi, 'the back of $1 head'],
  // "her gaze fixed on the horizon": the whole phrase goes, never the word alone ("her fixed on the horizon").
  [/,?\s*\b(?:his|her|their)\s+(?:(?:steady|direct|intense|calm|piercing|stern|level)\s+)*gaze\b[^,;.]*/gi, ''],
  [/,?\s*(?:with\s+)?(?:an?\s+)?(?:(?:steady|direct|intense|calm|piercing|stern|level)\s+)*gaze\b(?:\s+(?:into|at)\s+the\s+(?:camera|lens|viewer))?/gi, ''],
  [/,?\s*(?:looking (?:straight )?(?:at|into)|facing) the (?:camera|lens|viewer)/gi, ''],
  [/,?\s*(?:with\s+)?(?:an?\s+)?(?:composed|calm|stern|serious|neutral|warm)\s+expression|,?\s*(?:with\s+)?(?:an?\s+)?half-smile/gi, ''],
  /*
   * Madoff (26 Ekim 2026, 20261026-27b4d8, gorsel-kutusu #4 ve #6): "composed faint smile" ve "serious faces" gizlenen
   * istemde kaldı — "face not visible" dedikten sonra yine yüz isteniyordu. Yüzü anlatan kısa ifade de düşer.
   */
  [/,?\s*(?:with\s+)?(?:(?:serious|grim|tense|anxious|worried|stern|solemn|tired|weary|drawn|pale|composed|calm|blank|stony|determined|focused|somber|sombre|shocked|stunned|tearful|smiling|joyful|exhausted|lined|weathered)\s+)+faces?\b/gi, ''],
  [/,?\s*\bfaces? (?:lit|glowing|illuminated)\b[^,;.]*/gi, ''],
  [/,?\s*(?:with\s+)?(?:an?\s+)?(?:(?:composed|faint|slight|tight|thin|warm|wry|knowing|confident|nervous|forced|broad)\s+)*smile\b/gi, ''],
];

/**
 * A real, photographed person must not get an invented AI face that is cut
 * against their real photos: AI shots of them hide the face. The framing is
 * appended only when the prompt does not already hide it.
 * NOT A SILHOUETTE (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: mean luma 52-56, 21-39 % of frames
 * under 40): "in silhouette" turned every real person's shot into a black figure against a bright window. The face
 * is hidden by the back or the distance, in the scene's own light.
 */
export const HIDDEN_FACE = 'seen from behind or at a distance, face not visible';
export function hideRealFace(prompt, realInShot) {
  if (!realInShot?.length || FACE_HIDDEN.test(prompt)) return prompt;
  const asked = String(prompt);
  let p = asked;
  for (const [re, to] of FACE_FRAMING) p = p.replace(re, to);
  if (p !== asked) p = p.replace(/^[\s,;]+/, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  return `${p.replace(/[.\s]+$/, '')}, ${HIDDEN_FACE}`;
}

/* What a face is made of: a real person's cast text loses these parts in AI shots. */
const FACE_PART = /\b(face|faced|facial|gaze|eyes|eyed|hair|haired|beard|bearded|moustache|mustache|clean-shaven|stubble|smile|smiling|expression|portrait|jaw|jawline|brows?|eyebrows|lips|cheekbones|complexion|wrinkles|freckles|glasses|spectacles|bald|balding)\b/i;

/**
 * A real person's cast text for a shot that hides the face: build, age,
 * clothes and setting stay, every part about the face goes ("clean-shaven,
 * lined face with a steady direct gaze" sat right after "face not visible").
 */
export function bodyOnly(desc) {
  // "A tall man in his sixties with a grey beard": the "with" phrase goes, the man stays.
  const parts = String(desc ?? '').split(/[,;]/)
    .map((x) => x.split(/\s+(?=with\b)/i).filter((y) => !FACE_PART.test(y)).join(' ').replace(/[.\s]+$/, '').trim())
    .filter(Boolean);
  return [...parts, 'face not shown'].join(', ');
}

/*
 * GERÇEK KİŞİ CAST'TA OLMASA DA YÜZSÜZ (Madoff, 26 Ekim 2026, 20261026-27b4d8): "[quietly] On December 10, 2008, Madoff
 * told his sons, Mark and Andrew, the truth." satırının ardındaki arşiv sahnesi ("Mark Madoff Andrew Madoff 2008")
 * fotoğraf bulamayıp AI'a düştü; "Medium shot of two men in their forties in business suits ... serious faces" istemi
 * yüz gizlenmeden ChatGPT görsel kutusuna gitti (needed.json #6). hideRealFace yalnızca sahnenin cast'ındaki gerçek
 * kişiye bakıyordu; iki gerçek oğul hiçbir cast listesinde yoktu. Lula'da (20261026-29db03) cast boştu: Lula ve
 * Bolsonaro'lar anlatılırken AI benzemeyen adamlar çizdi (ön izleme bir karede Justin Trudeau gördü).
 * Kural: sahnenin anlatımı, ekran yazısı, arşiv araması, isim kartı ya da istemi gerçek bir kişinin adını taşıyorsa —
 * ya da ad bir önceki satırda geçti ve bu satır onu "he / his / the son" diye sürdürüyorsa — ve istem birini
 * gösteriyorsa, AI karesi yüzü gizler (hideRealFace). Kimsenin adının geçmediği sahne, adsız kalabalık ve "an anonymous
 * examiner" olduğu gibi kalır (önbellek anahtarı da).
 * Gerçek adlar (realPeople): script.realCast (docu-script.js realCastOf yazar; aynı kurallar), arşive düşen ya da
 * aramada adıyla geçen cast anahtarları, isim kartları, alıntı sahibi, unvanla ("Senator Flávio Bolsonaro") ya da
 * akrabalıkla ("his sons, Mark and Andrew", "Jair Bolsonaro's eldest son") anılan adlar ve portre araması ("Harry
 * Markopolos 2009 portrait"). Bu adlardan birini taşıyan arama da adı taşır ("Mark Madoff Andrew Madoff 2008" → Madoff).
 */
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}+/gu, '');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* A name word: capitalised, with a small letter after it — an acronym (SEC, FBI, PT) is never a person. */
const NAME_WORD = String.raw`\p{Lu}(?:['’]\p{Lu})?[\p{L}-]*\p{Ll}[\p{L}-]*`;
const PARTICLE = String.raw`(?:da|de|do|dos|das|del|della|di|du|van|von|der|den|ter|le|la|bin|ibn|al|el)`;
/* "Luiz Inácio Lula da Silva": up to four name words, particles between them. */
const NAME_RUN = String.raw`${NAME_WORD}(?:\s+(?:${PARTICLE}\s+)?${NAME_WORD}){0,3}`;
const EDGE_L = String.raw`(?<![\p{L}\p{N}])`;
const EDGE_R = String.raw`(?![\p{L}\p{N}])`;
/* A title in front of a name. The common political ones also lowercase ("former president Jair Bolsonaro"). */
const TITLE_UPPER = ['Vice President', 'Prime Minister', 'Senator', 'Sen', 'President', 'Minister', 'Governor', 'Mayor', 'Judge', 'Justice', 'Chancellor', 'King', 'Queen', 'Prince', 'Princess', 'Emperor', 'Empress', 'Tsar', 'Czar', 'Pope', 'Cardinal', 'Archbishop', 'Bishop', 'General', 'Admiral', 'Colonel', 'Col', 'Captain', 'Capt', 'Lieutenant', 'Lt', 'Sergeant', 'Sgt', 'Commander', 'Marshal', 'Sheriff', 'Detective', 'Dr', 'Doctor', 'Professor', 'Prof', 'Rev', 'Reverend', 'Mr', 'Mrs', 'Ms', 'Sir', 'Dame', 'Lord', 'Lady', 'Ayatollah', 'Sheikh', 'Sultan', 'Rabbi', 'Imam'];
const TITLE_LOWER = ['vice president', 'prime minister', 'senator', 'president', 'minister', 'governor', 'mayor', 'judge', 'chancellor'];
/* Only an abbreviation takes a full stop: "Dr. Legasov", never "Justice. Words the conquerors brought" (Hastings). */
const TITLE_ABBR = new Set(['Sen', 'Col', 'Capt', 'Lt', 'Sgt', 'Dr', 'Prof', 'Rev', 'Mr', 'Mrs', 'Ms']);
const TITLE = String.raw`(?:${[...TITLE_UPPER, ...TITLE_LOWER].map((t) => `${escapeRe(t)}${TITLE_ABBR.has(t) ? String.raw`\.?` : ''}`).join('|')})`;
/*
 * A country or its people is never a person's name word (review, 27 Ekim 2026, before the Israel 2026 election video):
 * "Defense Minister Israel Katz" made "Israel" a name token, so every AI person shot of every scene saying "Israel" hid its
 * face; "Israel's sons and daughters", "Gaza's children", "America's sons" made the place a person. Katz stays a person by
 * "Katz". Not words that are often surnames or first names too (Jordan, Georgia, Paris, Washington, French, English,
 * German, Christian). Mirrored in src/pipeline/docu-script.js PLACE_WORDS and src/pipeline/docu-archive.js YER_ADI.
 */
const PLACE_NAMES = 'israel israeli israelis gaza palestine palestinian palestinians iran iranian iranians iraq iraqi syria syrian lebanon lebanese egypt egyptian yemen yemeni saudi saudis arabia arab arabs qatar qatari oman turkey turkiye turkish russia russian russians ukraine ukrainian ukrainians belarus china chinese taiwan japan japanese korea korean india pakistan pakistani afghanistan afghan america american americans britain british england scotland ireland irish france germany italy italian spain spanish portugal europe european africa african asia brazil brazilian argentina mexico mexican canada canadian venezuela venezuelan cuba cuban hungary hungarian poland polish soviet jewish muslim houthi houthis idf jerusalem tel aviv moscow beijing tehran kyiv kiev hamas hezbollah kremlin'.split(' ');
const PLACE = new Set(PLACE_NAMES);
/* Words that are never a person's name, even capitalised: titles, small words, months, places and bodies in names. */
const NAME_STOP = new Set([
  ...PLACE_NAMES,
  ...TITLE_UPPER.flatMap((t) => t.toLowerCase().split(' ')),
  ...'the a an and or but so then now yet still in on at of for from by with to into after before when while during since until as his her their its our my your this that these those there here what who whom why how where which it he she they we you mr mrs ms sir dame lord lady saint st jr sr ii iii iv remember meanwhile however today tonight yesterday tomorrow later earlier'.split(' '),
  ...'january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday'.split(' '),
  ...'court house senate congress parliament assembly building tower palace square street avenue road bridge river lake mountain station airport hospital university college school church cathedral museum bank exchange market office department ministry committee council commission agency bureau police army navy force party group company corporation inc ltd llc fund foundation institute center centre hall plant reactor unit prison jail federal national supreme state city county republic kingdom union united states new old north south east west central great royal international world global times post journal news daily magazine tribune herald press gazette globe portrait motors electric staff will hope grace faith joy bill'.split(' '),
]);
/* A narrated link to a named person: "his sons, Mark and Andrew" / "Jair Bolsonaro's eldest son". */
const KIN = String.raw`(?:sons?|daughters?|wife|husband|widow|brothers?|sisters?|father|mother|parents|children|nephew|niece|grandson|granddaughter|cousin|lawyer|attorney|deputy|aide|assistant|partner|accountant|secretary)`;
/*
 * The possessive form takes FAMILY words only (review, 27 Ekim 2026, before the Israel 2026 election video): a work word
 * after "'s" names an office, not a person's relative — "Israel's attorney general", "Brazil's deputy foreign minister",
 * "Apple's lawyer" made a country or a company a "real person", and every AI person shot of a scene naming it hid its
 * face. "Madoff's sons" (20261026-27b4d8) still names Madoff. "his lawyer, Ira Sorkin" (KIN_NAMED) keeps the work words:
 * there the name after the word is the person. Mirrored in src/pipeline/docu-script.js NAME_CUES.
 */
const FAMILY = String.raw`(?:sons?|daughters?|wife|wives|husband|widow|widower|brothers?|sisters?|father|mother|parents|children|nephews?|nieces?|grandsons?|granddaughters?|grandchildren|cousins?|stepsons?|stepdaughters?)`;
const KIN_OF = new RegExp(String.raw`${EDGE_L}(${NAME_RUN})['’]s\s+(?:\p{Ll}+\s+){0,2}${FAMILY}${EDGE_R}`, 'gu');
const KIN_NAMED = new RegExp(String.raw`${EDGE_L}(?:[Hh]is|[Hh]er|[Tt]heir)\s+(?:\p{Ll}+\s+){0,2}${KIN},?\s+(${NAME_RUN})(?:\s*(?:,|and|&)\s*(${NAME_RUN}))?`, 'gu');
const TITLED = new RegExp(String.raw`${EDGE_L}${TITLE}\s+(?:Sir\s+)?(${NAME_RUN})`, 'gu');
/* "Harry Markopolos 2009 portrait": the search's first two name words are the sitter. */
const PORTRAIT = new RegExp(String.raw`^\s*(?:${TITLE}\s+)?(${NAME_WORD}\s+(?:${PARTICLE}\s+)?${NAME_WORD})${EDGE_R}(?=.*\bportrait\b)`, 'u');
/* A name card / quote author is a person only when it reads like one: name words, particles, initials. */
const PERSONLIKE = new RegExp(String.raw`^(?:${TITLE}\s+)?(?:${NAME_WORD}|\p{Lu}\.|${PARTICLE})(?:\s+(?:${NAME_WORD}|\p{Lu}\.|${PARTICLE})){0,5}$`, 'u');
/* Cast keys like "ananenko_young", "worker_1938", "crs_officer": only the words that can be a name count. */
const KEY_GENERIC = /^(?:young|younger|old|older|elder|early|late|jr|sr|senior|junior|child|children|teen|adult|middle|aged?|man|men|woman|women|boy|girl|\d+s?|student|officer|crs|police|policeman|guard|soldier|worker|firefighter|fireman|nurse|doctor|farmer|priest|monk|knight|ceo|lawyer|judge|investor|trader|banker|clerk|driver|pilot|diver|engineer|miner|sailor|survivor|witness|victim|mother|father|son|daughter|wife|husband|protester|rioter|villager|peasant|merchant|agent|detective|reporter|journalist|official|minister|president|general|admiral|captain|narrator|host|crowd|operator|scientist|analyst|examiner|regulator|executive)$/;

const nameWords = (name) => (fold(name).match(new RegExp(NAME_WORD, 'gu')) ?? []).filter((w) => w.length >= 3 && !NAME_STOP.has(w.toLowerCase()));
/* A body or a place is not a person: "World Health Organization", "International Energy Agency" (quote authors), "King Fahd Airport". */
const ORG_WORD = /\b(?:agency|organi[sz]ation|association|institute|committee|council|commission|ministry|department|office|bureau|service|authority|administration|court|bank|fund|group|company|corporation|foundation|university|airport|party|police|army|navy|union|network|news|times|post|journal|press|international|national|federal|world)\b/i;
const personName = (n) => nameWords(n).length > 0 && !ORG_WORD.test(fold(n));
/** A cast key's word as written in text: "madoff" → Madoff, "mcdonald" → McDonald too. */
const keyWordRe = (w) => new RegExp(`${EDGE_L}${w[0].toUpperCase()}${[...w.slice(1)].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : escapeRe(c))).join('')}${EDGE_R}`, 'u');
const wordRe = (w) => new RegExp(`${EDGE_L}${escapeRe(w)}${EDGE_R}`, 'u');
/** Everything a scene says or searches about who is in it (folded: "Flavio" finds "Flávio"). */
const sceneText = (sc) => fold([stripTags(sc?.say), sc?.text, sc?.caption, sc?.search, sc?.commons, sc?.name, sc?.who, sc?.quote, sc?.imagePrompt].filter((x) => typeof x === 'string' && x).join(' \n '));

/** People named by a title or a family/working link in one line of narration. */
export function cuedNames(text) {
  const t = String(text ?? '');
  const out = [];
  for (const re of [TITLED, KIN_OF, KIN_NAMED]) for (const m of t.matchAll(re)) out.push(...m.slice(1).filter(Boolean));
  return out.filter(personName);
}

/**
 * The real people of a script: `keys` — cast keys that are real people (their AI shots hide the face and their
 * description loses its face, bodyOnly); `names` — real people named anywhere, in cast or not; `tokens` — the
 * name words a scene is searched for (namedAt).
 */
export function realPeople(script) {
  const cast = script?.cast ?? {};
  const scenes = script?.scenes ?? [];
  const listed = (Array.isArray(script?.realCast) ? script.realCast : []).map(String);
  const names = new Set(listed.filter((n) => !cast[n] && personName(n)));
  for (const sc of scenes) {
    for (const v of [sc.name, sc.who]) {
      const n = String(v ?? '').split(/[,(]/)[0].trim();
      if (n && PERSONLIKE.test(n) && personName(n)) names.add(n);
    }
    for (const t of [stripTags(sc.say), sc.text, sc.caption]) for (const n of cuedNames(t)) names.add(n);
    const sitter = typeof sc.search === 'string' ? sc.search.match(PORTRAIT)?.[1] : null;
    if (sitter && personName(sitter) && nameWords(sitter).length === 2) names.add(sitter);
  }
  // A cast member is real when listed, cast on an archive scene, or searched/carded by name ("Harry Markopolos 2009 portrait").
  const evidence = fold([...scenes.flatMap((sc) => [sc.search, sc.commons]), ...names].filter((x) => typeof x === 'string').join(' \n '));
  // A place or its people in a key is not a name (review, 27 Ekim 2026): "israeli_voter", "tel_aviv_protester" and
  // "idf_soldier" were real people, because "Israeli", "Tel Aviv" and "IDF" are in the searches (PLACE_NAMES).
  const keyWords = (k) => k.split('_').filter((w) => w.length >= 3 && !KEY_GENERIC.test(w) && !PLACE.has(w));
  const keys = new Set([...listed, ...scenes.filter((s) => s.archived || s.source === 'archive').flatMap((s) => s.cast ?? [])].filter((n) => cast[n]));
  for (const k of Object.keys(cast)) if (keyWords(k).some((w) => keyWordRe(w).test(evidence))) keys.add(k);
  // A search that names someone by a known name word ("Mark Madoff Andrew Madoff 2008" → Madoff) is found by
  // that word; a full name nobody titles, cards or links stays unknown — "Brazil Lula rally" must not make Brazil a person.
  const tokens = new Map();
  for (const n of names) for (const w of nameWords(n)) tokens.set(w, wordRe(w));
  for (const k of keys) for (const w of keyWords(k)) tokens.set(w[0].toUpperCase() + w.slice(1), keyWordRe(w));
  return { keys: [...keys], names: [...names], tokens: [...tokens].map(([word, re]) => ({ word, re })) };
}

/* "He won it" / "His sons…" / "the father in 2022, the son in 2026": the line goes on about someone named before it. */
const REFERS = /^[\s"“'‘]*(?:(?:and|but|then|so|yet|later|now|still|instead|soon|there|here),?\s+)?(?:he|she|his|her|him)\b|\bthe (?:father|sons?|mother|daughters?|brothers?|sisters?|widow|wife|husband)\b/i;

/**
 * The real people a scene names: its own words, else — when the line refers back ("he", "the son") — those of the
 * spoken lines before it (chapter cards and silent devices skipped, at most three lines back).
 */
export function namedAt(scenes, i, people) {
  if (!people?.tokens?.length) return [];
  for (let k = i, hop = 0; k >= 0 && hop <= 3; hop++) {
    const sc = scenes[k];
    const text = sceneText(sc);
    const found = people.tokens.filter((t) => t.re.test(text)).map((t) => t.word);
    if (found.length) return found;
    if (!REFERS.test(stripTags(sc?.say))) return [];
    do k--; while (k >= 0 && !stripTags(scenes[k]?.say));
  }
  return [];
}

/*
 * ANLATIM RESMİN TARİFİ DEĞİLDİR (inceleme, 27 Ekim 2026, 24 eski işin istemleri): kesme kareleri (lib/inserts.mjs)
 * satırı tırnakla taşır — `The moment: "We'll rebuild that night minute by minute..."` — ve ön izleme kapısı istemin
 * sonuna " — it must plainly show what the narration says: …" ekler (docu-preview.js aiNote). Tırnak "okunur yazı
 * istendi" sayılınca 21 kesme karesinin satırı siliniyordu ("The moment, any writing blurred and unreadable": D.B.
 * Cooper 20260930-08f5fc #5, Banco Master 20261011-b48aac #3); Lula'da (20261026-29db03 #132) anlatımdaki "But he will
 * govern" seçmen kuyruğunu "kişi gösteren kare" yapıyordu. Yazı, gazete, kişi ve adsızlık kararları yalnızca resmin
 * kendi tarifine bakar; anlatım kelimesi kelimesine kalır, yalnızca gazete adı "a newspaper" olur.
 */
const NARRATION_NOTE = /\s+[—–]\s+(?:a clear, well-exposed picture\b[^—–]*[—–]\s+)?it must plainly show what the narration says:|\.\s+The moment:\s*["“]/i;
/** [the picture's own words, the narration the prompt carries after them ('' when none)]. */
export function pictureAndNote(prompt) {
  const p = String(prompt ?? '');
  const m = p.match(NARRATION_NOTE);
  return m ? [p.slice(0, m.index), p.slice(m.index)] : [p, ''];
}

/* Somebody the writer made anonymous on purpose stays as asked. */
const ANONYMOUS = /\b(?:anonymous|unidentified|unnamed|nameless|faceless)\b/i;
const CROWD = /\b(?:crowds?|crowded|throngs?|masses|audiences?|spectators|onlookers|passers-?by|commuters|shoppers|supporters|protesters|demonstrators|voters|mourners|rows of|lines? of|queues?|queuing|lined up)\b/i;
/*
 * A person word in front of a thing names the thing: "Official patent documents" (Tesla, 20260930-25116f #53), "an
 * official government case form" and "a cluttered analyst desk" (Madoff #2, #51), "the Lehman Brothers headquarters".
 */
const OF_A_THING = String.raw`(?!\s+(?:government\s+)?(?:desks?|chairs?|tables?|offices?|rooms?|cars?|badges?|documents?|forms?|papers?|files?|folders?|notebooks?|ledgers?|letters?|seals?|stamps?|records?|reports?|statements?|photos?|photographs?|lighting|headquarters|buildings?|towers?|logos?|signs?|patents?|mortgages?|case)\b)`;
// "A judge's empty high-backed leather chair" (Bakker, 20261006-af567d) shows nobody: an owner's 's is not a person.
const SOMEONE = new RegExp(String.raw`\b(?:man|woman|person|figure|boy|girl|gentleman|lady|he|she|him)\b(?!['’]s)|\b(?:a|an|the|elderly|older|young)\s+couple\b(?!\s+of)|\b(?:two|three|four|both)\s+(?:[\w-]+\s+){0,3}?(?:men|women|people|brothers|sons|sisters|daughters|figures)\b${OF_A_THING}|\bthe\s+(?:[\w-]+\s+){0,2}?(?:men|women|brothers|sons|sisters|daughters)\b(?!['’]s?)${OF_A_THING}`, 'i');
const PERSON_NOUN = new RegExp(String.raw`\b(?:senators?|presidents?|ministers?|governors?|mayors?|lawyers?|attorneys?|judges?|bankers?|financiers?|officials?|politicians?|engineers?|officers?|admirals?|soldiers?|divers?|scientists?|doctors?|investigators?|examiners?|trustees?|leaders?|kings?|queens?|emperors?|popes?|priests?|chancellors?|candidates?|defendants?|prisoners?|businessm[ae]n|businesswom[ae]n|analysts?|reporters?|journalists?|pilots?|captains?|commanders?|liquidators?|firefighters?|workers?|sons?|daughters?|fathers?|mothers?|wife|wives|husbands?|widows?|brothers?|sisters?|supervisors?|men|women)\b(?!['’])${OF_A_THING}`, 'i');
/** The shot shows a person (or two), not only a crowd, a place or a thing — by the picture's own words, never the narration's. */
export function showsPerson(prompt) {
  const [p] = pictureAndNote(prompt);
  return SOMEONE.test(p) || (PERSON_NOUN.test(p) && !CROWD.test(p));
}

/** A shot of a scene that names real people hides the face of whoever it shows (hideRealFace). */
export function hideNamedFaces(prompt, named) {
  if (!named?.length || ANONYMOUS.test(pictureAndNote(prompt)[0]) || !showsPerson(prompt)) return prompt;
  return hideRealFace(prompt, named);
}

/*
 * AI GAZETESİ YOK (Çernobil, 26 Ekim 2026, 20261026-24122a): "On 2 May, the New York Post announced a mass grave for
 * fifteen thousand." satırının istemi "Close-up of a 1980s tabloid front page on a newsstand, bold black headline type
 * blurred" idi; 3:45'te anlamsız manşetli ("NTD THE BLENS") bulanık bir AI gazete çıktı — gerçek bir gazetenin sahte
 * nüshası, uydurma belge. Gerçek gazete arşivden ya da headline cihazından gelir (o cihaza dokunulmaz). AI karesinde ön
 * sayfa, manşet, dergi kapağı ya da yayın adı katlanmış, baskısı odak dışı bir gazete yığınına döner; okunur yazı
 * istenen belge, afiş ya da tabela yazısız kalır. Böyle bir istem yoksa istem (ve önbellek anahtarı) aynen kalır.
 */
const PUBLICATION = /(?:\b[Tt]he\s+)?\b(?:New York (?:Times|Post|Daily News)|Washington Post|Wall Street Journal|Los Angeles Times|Chicago Tribune|USA Today|Boston Globe|Daily (?:Mail|Mirror|Telegraph|Express)|Evening Standard|Financial Times|The (?:Guardian|Times|Economist|Observer|Independent)(?!\s+Square)|Le Monde|Le Figaro|Der Spiegel|Die Zeit|Bild-Zeitung|Pravda|Izvestia|Folha de S\.? ?Paulo|O Globo|Estad[aã]o|Newsweek|TIME magazine|Time magazine|Life magazine|Rolling Stone|H[uü]rriyet|Cumhuriyet|Milliyet)\b/;
// "Folded tabloid newspapers" are newspapers, not a front page (2009 submarine, 20261024-373aaf #83).
const PAPER_FACE = /\b(?:front[- ]pages?|headlines?|mastheads?|magazine covers?|covers? of (?:a |an |the )?(?:[\w-]+\s+){0,2}magazines?|(?:tabloids?|broadsheets?)(?!\s+(?:news)?papers?)|(?:newspaper|press) clippings?)\b/i;
/* The printed thing itself, as the subject of a clause: "a 1980s tabloid front page" → "a stack of folded 1980s newspapers". */
const PAPER_NOUN = /(?:\b(?:a|an|the)\s+)?((?:\b(?!(?:a|an|the|of|on|in|at|with|and|from|by)\b)[\w-]+\s+){0,3}?)(?:(?:tabloid|newspaper|broadsheet|magazine|paper)\s+)?\b(?:front[- ]pages?|magazine covers?|covers?|mastheads?|headlines?|(?:tabloids?|broadsheets?)(?!\s+(?:news)?papers?)|(?:newspaper|press) clippings?)\b/i;
/*
 * A headline the writer already keeps unreadable asks for no record: "a rack of 1972 newspapers…, headlines blurred and
 * unreadable" (D.B. Cooper #99), "a bundle of newspapers…, headlines unreadable" (Bakker #71), "the headline too blurred
 * to read" (Tesla #140) were rewritten anyway — same picture, new cache key, paid again on a re-render. A front page,
 * masthead, cover or tabloid page is a record even blurred (Çernobil #44: "bold black headline type blurred").
 */
const PRINT_HIDDEN = /\b(?:blurr(?:ed|y)|unreadable|illegible|out of focus|not readable|too (?:blurred|small|far away|far) to read)\b/i;
const RECORD_FACE = /\b(?:front[- ]pages?|mastheads?|magazine covers?|covers? of|(?:tabloids?|broadsheets?)(?!\s+(?:news)?papers?)|clippings?)\b/i;
const asksPrintedFace = (picture) => picture.split(/,\s*/).some((c) => PAPER_FACE.test(c) && (RECORD_FACE.test(c) || !PRINT_HIDDEN.test(c)));
const PRINT_WORDS = /\b(?:headlines?|mastheads?|type|typeface|lettering|letters|text|print|printed|words|titles?|captions?|logos?|fonts?|columns?|readable|legible)\b/i;
/*
 * Readable writing asked for: quoted words, "that reads", "with the words", "legible". A negation is not a request:
 * "no readable text", "unreadable", "no screens readable" (2009 submarine, 20261024-373aaf #12).
 */
const NOT_ASKED = String.raw`(?<!\b(?:no|not|non|never|nothing|without)\b[^,;.]{0,30})`;
const READABLE = new RegExp(String.raw`["“][^"“”]{2,}["”]|‘[^‘’]{2,}’|\b(?:reading|titled|headlined|captioned|labell?ed|stamped|inscribed|emblazoned)\s+(?:with\s+)?['"“‘]|\b(?:that|which)\s+(?:reads|says)\b|\bwith the (?:words?|headline|title|slogan|caption|name)\b|${NOT_ASKED}\b(?:legible|readable)\b|${NOT_ASKED}\bclearly visible (?:text|words|writing|lettering)\b`, 'i');
const WRITTEN_THING = /\b(?:documents?|letters?|memos?|telegrams?|forms?|reports?|files?|dossiers?|certificates?|contracts?|ledgers?|pages?|signs?|notes?|placards?|banners?|posters?|billboards?|leaflets?|pamphlets?|flyers?|plaques?|screens?|statements?|cheques?|checks?|envelopes?|labels?|newspapers?|magazines?|books?|cards?)\b/i;
const ERA_WORD = /^(?:\d{2,4}s?|\d{4}-era|old|older|yellowed|vintage|faded|crumpled|period|wartime|soviet|american|british|french|german|russian|brazilian|ukrainian|local)$/i;
const tidy = (p) => p.replace(/\s+([,.;:])/g, '$1').replace(/([,;:])\s*[,;:]+/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s,;:]+|[\s,;:.]+$/g, '').replace(/^\p{Ll}/u, (c) => c.toUpperCase());

/** An AI still never fakes a printed record: no newspaper front page, headline, magazine cover or readable document. */
export function noPrintedRecord(prompt) {
  // The narration (pictureAndNote) stays word for word but for a publication's name: its masthead is never asked for.
  const [asked, note] = pictureAndNote(prompt);
  const told = note.replace(new RegExp(PUBLICATION.source, 'g'), 'a newspaper');
  if (asksPrintedFace(asked) || PUBLICATION.test(asked)) {
    const named = asked
      .replace(new RegExp(PUBLICATION.source, 'g'), 'a newspaper')
      .replace(/\b(?:a|an|the)\s+(?:front[- ]pages?|covers?)\s+of\s+(?:a|an|the)\s+(?:[\w-]+\s+){0,2}?(?:newspapers?|papers?|tabloids?|magazines?)\b/gi, 'a stack of folded newspapers');
    const stack = (c) => c.replace(PAPER_NOUN, (m, adj) => `a stack of folded ${adj.split(/\s+/).filter((w) => ERA_WORD.test(w)).map((w) => `${w} `).join('')}newspapers`);
    const [head, ...rest] = named.split(/,\s*/);
    // The subject keeps its framing and place; a clause about the print itself ("bold black headline type blurred") goes.
    const subject = stack(head.replace(/\s*\b(?:with|showing|bearing)\s+(?:(?:a|an|the)\s+)?(?:[\w-]+\s+){0,3}?(?:headlines?|mastheads?|titles?|text|lettering)\b/gi, ''));
    const kept = rest.filter((c) => !PRINT_WORDS.test(c)).map(stack);
    return `${tidy(`${[subject, ...kept].join(', ')}, the print out of focus, no readable text, no masthead, no headline, no logo`)}${told}`;
  }
  // A line about the papers ("the New York Post announced…", "the headlines called him a hero") asks for a page: any
  // page the picture brings in stays unreadable.
  const unreadable = /\b(?:no readable|unreadable|illegible)\b|\b(?:headlines?|print|text|type|writing)\b[^,;.]{0,25}\b(?:blurr(?:ed|y)|out of focus)\b/i.test(asked);
  const papered = note && !unreadable && (PAPER_FACE.test(note) || told !== note);
  const withPapers = (s) => (papered ? `${s.replace(/[.\s]+$/, '')}, any printed page out of focus, no readable text, no masthead` : s);
  if (READABLE.test(asked) && WRITTEN_THING.test(asked)) {
    const quiet = asked
      .replace(/\s*(?:\b(?:reading|that reads|which reads|that says|which says|titled|headlined|captioned|labell?ed|stamped|inscribed|emblazoned)\s+)?(?:with\s+)?(?:["“][^"“”]*["”]|‘[^‘’]*’)/gi, '')
      .replace(/\s*\b(?:reading|titled|headlined|captioned|labell?ed|stamped|inscribed|emblazoned)\s+(?:with\s+)?'[^']*'/gi, '')
      .replace(/\s*\b(?:that|which)\s+(?:reads|says)\b[^,;.]*/gi, '')
      .replace(/\s*\bwith the (?:words?|headline|title|slogan|caption|name)\b[^,;.]*/gi, '')
      .replace(/\s*\bclearly visible (?:text|words|writing|lettering)\b/gi, '')
      .replace(new RegExp(String.raw`${NOT_ASKED}\b(?:legible|readable)\b`, 'gi'), 'blurred');
    return withPapers(`${tidy(`${tidy(quiet)}, any writing blurred and unreadable`)}${told}`);
  }
  return withPapers(`${asked}${told}`);
}

/**
 * The prompt an AI still is asked with — the same for OpenAI, FLUX and the ChatGPT inbox (sceneImage writes the
 * inbox from it): no printed record (a headline device keeps its own page), and the faces of named real people hidden.
 */
export function stillPrompt(prompt, { scene, named = [] } = {}) {
  const p = scene?.type === 'headline' ? String(prompt ?? '') : noPrintedRecord(prompt);
  return hideNamedFaces(p, named);
}

/*
 * A BRIGHT, EXPOSED STILL (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: the last 7 videos measured mean
 * luma 52-75, saturation 2.5-7.5, 21-39 % of frames under luma 40; the best one, Panama, 88 / 10.2 in natural colour).
 * The writer's visualStyle rode on every request with "deep shadows", "low-key", "noir", "moody", "harsh flash against
 * black", "green-black". The REQUEST TEXT drops every clause that carries one and asks for exposure; the cache keys keep
 * the raw STYLE, so stills already made are not asked (and paid) again. A black-and-white style (an archive before
 * colour film) is asked bright with clear midtones, not in colour.
 */
const DARK_LOOK = [/\bdeep\s+(?:black\s+)?shadows?\b/i, /\blow[- ]key\b/i, /\bnoir\b/i, /\bmood(?:y|ily)\b/i, /\bharsh\b[^,.;]*\bagainst\b[^,.;]*\bblack\b/i, /\bgreen[- ]black\b/i, /\bcrushed\s+blacks?\b/i, /\bunder-?exposed\b/i];
const DARK_ADJ = /\s*\b(?:mood(?:y|ily)|noir|low[- ]key|green[- ]black|under-?exposed)\b\s*/gi;
const MONO_LOOK = /\b(?:black[- ]and[- ]white|black & white|b&w|monochrome|sepia|gr[ae]yscale|tintype|daguerreotype|cyanotype|tri-x)\b/i;
export const EXPOSURE = 'Bright, well-exposed, natural colour.';
export const EXPOSURE_MONO = 'Bright, well-exposed, clear midtones.';
export function exposedStyle(style) {
  const s = String(style ?? '').trim();
  if (!s) return s;
  const bad = (c) => DARK_LOOK.some((re) => re.test(c));
  const clean = !bad(s)
    ? s
    : s
        .split(/(?<=\.)\s+/)
        .map((sentence, si) => {
          const end = /\.$/.test(sentence) ? '.' : '';
          const clauses = (end ? sentence.slice(0, -1) : sentence).split(/\s*[,;]\s*/);
          // The head clause names the medium ("Moody noir documentary photograph"): it loses the words, not the clause.
          const kept = clauses.map((c, ci) => (si === 0 && ci === 0 && bad(c) ? c.replace(DARK_ADJ, ' ').replace(/\s{2,}/g, ' ').trim() : c)).filter((c) => c && !bad(c));
          if (kept.length && si === 0) kept[0] = kept[0].replace(/^\p{Ll}/u, (ch) => ch.toUpperCase());
          return kept.length ? `${kept.join(', ')}${end}` : '';
        })
        .filter(Boolean)
        .join(' ');
  if (/\bwell[- ]exposed\b/i.test(clean)) return clean;
  return `${clean} ${MONO_LOOK.test(clean) ? EXPOSURE_MONO : EXPOSURE}`.trim();
}

/*
 * TODAY'S THINGS IN A STORY OF TODAY (Eagle's Nest fire, Oct 2026): "no modern objects" rode on every still, the
 * 2026 police roadblocks and fire engines too — the preview gate found torch-lit riders for "police had detained a
 * man" and a 1980s American patrol car on a Bavarian road. A scene from PRESENT_FROM on asks for the things of its
 * own year instead. Request text only: every cache key keeps the plain style, so pictures already made stay theirs.
 * Every year's request is also exposed (exposedStyle).
 */
export const PRESENT_FROM = 1990;
export function styleFor(style, year) {
  const s = exposedStyle(style);
  if (year == null || !Number.isFinite(year) || year < PRESENT_FROM) return s;
  return `${s.replace(/,?\s*\bno modern objects\b/gi, '').replace(/\.\s*\./g, '.')} Set in ${year}: vehicles, uniforms and equipment as they look in ${year}.`.trim();
}

/*
 * The mean luma under which a still is lifted (liftIfDark). Was 62: Gimli 20261028-9ff721 / Kartal Yuvası 950730
 * (29 Oct 2026) measured 52-56 across the whole video, so a still at 62 still sank under the grade. The target mid
 * luma is ~88 (Panama, the channel's best-looking video); 85 opens everything below it.
 */
export const LIFT_FLOOR = 85;
/** The gamma a still of mean luma `yavg` is opened with (1 = untouched), at most 1.9. */
export function liftGamma(yavg, floor = LIFT_FLOOR) {
  if (!Number.isFinite(yavg) || yavg >= floor) return 1;
  return Number(Math.min(1.9, 1 + (floor - yavg) / 55).toFixed(2));
}

/*
 * SİYAH-BEYAZ KAYNAK (scene.monoSource; looks/resolve.ts sceneGrade). Gimli 9ff721 önce/sonra, 29 Ekim 2026: hattın
 * hiçbir adımı bayrağı yazmıyordu. Uygulama (src/pipeline/media.js isMonochrome, aynı eşikler) arşiv adımında ölçer;
 * motor yalnızca bayrağı olmayan eski bir işin gerçek arşiv resmini, diskteki dosyanın 96 px kopyasında ffmpeg
 * signalstats ile ölçer. Gerçekten gri: SATAVG < 4, SATHIGH < 10, SATMAX < 48 (gri pistte küçük kırmızı uçak renkli
 * kalır). Ölçülemezse bayrak konmaz: renkli sayılır (yanlış "mono" renkli fotoğrafı griye boyardı).
 */
export const MONO_SAT_MAX = 4;
export const MONO_SAT_HIGH_MAX = 10;
export const MONO_SAT_PEAK_MAX = 48;
/** signalstats çıktısı → true (siyah-beyaz), false (renkli), null (ölçüm yok). */
export function monoFromSignalstats(text) {
  const num = (k) => {
    const m = String(text ?? '').match(new RegExp('lavfi\\.signalstats\\.' + k + '=([0-9.]+)'));
    return m ? Number(m[1]) : NaN;
  };
  const avg = num('SATAVG');
  if (!Number.isFinite(avg)) return null;
  const high = num('SATHIGH');
  const peak = num('SATMAX');
  return avg < MONO_SAT_MAX && (!Number.isFinite(high) || high < MONO_SAT_HIGH_MAX) && (!Number.isFinite(peak) || peak < MONO_SAT_PEAK_MAX);
}

/**
 * Pixel size from the file header (JPEG SOF / PNG IHDR / WebP), no process
 * spawned; null when the header is unknown.
 */
export function imageSize(buf) {
  if (!buf || buf.length < 30) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) };
    }
    return null;
  }
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const m = buf[i + 1];
    if (m === 0xff) {
      i++;
      continue;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) {
      i += 2;
      continue;
    }
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC): height, then width.
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/* Voice defaults: Musa — warm Turkish narrator. */
export const DEFAULT_VOICE = 'JKJ5z8hs4F7XP8fr2Y5U';

/*
 * The narrator's loudness. The audio director levels every bed and event
 * relative to a -19 LUFS voice (NARRATION_LUFS there), so every line is
 * brought to exactly that; the master then lifts the whole mix to -14.
 */
const VOICE_LUFS = -19;
/** A real clip's own sound under the narration (natSound): ~11 LU below the voice — heard, never fighting it. */
const NAT_LUFS = -30;
/*
 * Recipe tag of the levelled narration files: bump it when levelVoice changes.
 * n2 = the broadcast chain (lib/sound-craft.mjs voiceChain); its own version
 * is in the tag too, so a chain change re-processes every cached line (from
 * the cached MP3 — never a new ElevenLabs request).
 */
const VOICE_NORM = `n2${VOICE_CHAIN_VERSION}`;
/* ElevenLabs Music price assumed until measured (the same figure docu-script.js plans with). */
const MUSIC_CREDITS_PER_MIN = 2500;
/* One looped room-tone bed per place when there is no library (seconds; 40 credits a second). */
const BED_SECONDS = 12;

/**
 * Scenes that never carry a picture of their own: maps, and the edit devices
 * that draw theirs (board, split, timeline, a typed document, a quote shown
 * on an earlier scene's portrait). A scanned document (no `doc`), a quote
 * without `fromScene` and a headline keep their picture as usual.
 */
export function noOwnPicture(sc) {
  if (!sc) return false;
  // The topic's signature devices (src/topic) draw their own ground: never a picture to fetch or generate.
  // A split side without `fromScene` shows the scene's OWN picture (`own`): that one is fetched/generated as usual.
  if (sc.type === 'split') return !(sc.left?.own || sc.right?.own);
  if (['board', 'timeline', 'map', 'explainer', 'ui-card'].includes(sc.type)) return true;
  if (sc.type === 'document') return !!sc.doc?.lines?.length;
  if (sc.type === 'quote') return Number.isInteger(sc.fromScene);
  return false;
}

/**
 * Chapter cards: at every chapter change (c > 0) a 2.8s card — "BÖLÜM 3" and
 * the chapter title — with no narration. The music breathes, a 10+ minute
 * video gets a visible structure, and YouTube's chapter marks land on the
 * card. They are inserted here, never written into the script file (docu.js
 * strips any it finds), so a re-run cannot double them. The card reuses the
 * picture of the scene it introduces (scenes.tsx blurs and darkens it); no
 * new image is generated for it.
 * @returns {number} how many cards were inserted
 */
export function insertChapterCards(script) {
  const titles = script.chapters ?? [];
  const src = (script.scenes ?? []).filter((s) => !(s?.type === 'title' && s.chapterCard));
  const en = /^en/i.test(script.locale ?? '');
  const out = [];
  let prev = null;
  let n = 0;
  src.forEach((sc, i) => {
    const c = Number.isInteger(sc.chapter) ? sc.chapter : prev ?? 0;
    if (prev !== null && c !== prev && c > 0) {
      const t = titles[c];
      const title = typeof t === 'string' ? t : t?.title;
      if (title) {
        // The introduced scene's picture; a counter or chart has none, so the chapter's next one.
        let image = sc.image;
        for (let j = i + 1; !image && j < src.length && (src[j].chapter ?? c) === c; j++) image = src[j].image;
        // A countdown's item opens on its rank card (src/ranking): the big number lands, then the name, where and when.
        const item = (script.ranking?.items ?? []).find((x) => x.chapter === c);
        out.push(item
          ? {
              type: 'title', chapterCard: true, chapterNo: c + 1, kicker: `#${item.rank}`, title: item.item,
              rankCard: { rank: item.rank, total: script.ranking.total ?? script.ranking.items.length, item: item.item, place: item.place || '', year: item.year ?? null },
              dur: item.rank === 1 ? 4.2 : 3.4, chapter: c, riser: true, mood: sc.mood ?? 'curious', ...(image ? { image } : {}),
            }
          : {
              type: 'title', chapterCard: true, chapterNo: c + 1, kicker: `${en ? 'CHAPTER' : 'BÖLÜM'} ${c + 1}`, title,
              dur: 2.8, chapter: c, riser: true, mood: sc.mood ?? 'curious', ...(image ? { image } : {}),
            });
        n++;
      }
    }
    out.push(sc);
    prev = c;
  });
  script.scenes = out;
  return n;
}

/* ------------------------------------------------------------ beat grid */

const BEAT_SR = 22050;
const BEAT_HOP = 256;
/* Version of the beat finder below: bump it when it changes, so cached beat grids are found again. */
const BEAT_RECIPE = 'b2';
/* Under this the autocorrelation peak is not a pulse (pads, drones, sleep music measured 0.07-0.24). */
const MIN_PULSE = 0.25;

/** Positive log-energy flux per 11.6 ms hop, over a trailing 46 ms window: the attacks in the music. */
function onsetEnvelope(x) {
  const nb = Math.floor(x.length / BEAT_HOP);
  const e = new Float64Array(nb);
  for (let b = 0; b < nb; b++) {
    let s = 0;
    for (let j = b * BEAT_HOP; j < (b + 1) * BEAT_HOP; j++) s += x[j] * x[j];
    e[b] = s;
  }
  const on = new Float32Array(nb);
  let S = 0;
  let prev = null;
  for (let b = 0; b < nb; b++) {
    S += e[b] - (b >= 4 ? e[b - 4] : 0);
    const v = Math.log(1 + Math.max(0, S) / (4 * BEAT_HOP));
    on[b] = prev === null ? 0 : Math.max(0, v - prev);
    prev = v;
  }
  return on;
}

/**
 * The beat grid of one stretch of music, or null when it has no clear pulse.
 * Tempo from the onset autocorrelation (a prior around 110 BPM settles
 * double/half ambiguity), then refined at 4, 16 and 64 beats' lag — the old
 * whole-hop period drifted off real beats within seconds (measured: 256 ms
 * off after 10 minutes at 117 BPM; this stays within ~10 ms).
 */
function beatGrid(on, from, to) {
  const rate = BEAT_SR / BEAT_HOP;
  const i0 = Math.max(1, Math.ceil(from * rate));
  const i1 = Math.min(on.length, Math.floor(to * rate));
  const N = i1 - i0;
  if (N < rate * 4) return null;
  let m = 0;
  for (let i = i0; i < i1; i++) m += on[i];
  m /= N;
  const d = new Float64Array(N);
  let v0 = 0;
  for (let k = 0; k < N; k++) {
    d[k] = on[i0 + k] - m;
    v0 += d[k] * d[k];
  }
  v0 /= N;
  // A steady tone has a near-constant envelope whose tiny ripple autocorrelates perfectly: not a beat.
  if (Math.sqrt(v0) < 0.05) return null;
  const ac = (L) => {
    let t = 0;
    for (let k = L; k < N; k++) t += d[k] * d[k - L];
    return t / (N - L) / v0;
  };
  const lo = Math.floor((60 / 180) * rate);
  const hi = Math.ceil((60 / 66) * rate);
  const r = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) r[L] = ac(L);
  let best = -1;
  let bs = -Infinity;
  for (let L = lo; L <= hi; L++) {
    if (r[L] < r[L - 1] || r[L] < r[L + 1]) continue;
    const w = Math.exp(-Math.pow(Math.log2((60 * rate) / L / 110), 2) / 0.5);
    if (r[L] * w > bs) {
      bs = r[L] * w;
      best = L;
    }
  }
  if (best < 0 || r[best] < MIN_PULSE) return null;
  const parabola = (a, b, c) => {
    const den = a - 2 * b + c;
    return den < 0 ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0;
  };
  let P = best + parabola(r[best - 1], r[best], r[best + 1]);
  for (const M of [4, 16, 64]) {
    if (M * P > N * 0.6) break;
    const L0 = Math.round(M * P);
    const vals = {};
    let bl = L0 - 4;
    for (let L = L0 - 4; L <= L0 + 4; L++) {
      vals[L] = ac(L);
      if (vals[L] > vals[bl]) bl = L;
    }
    // The peak must sit inside the search range; at its edge the estimate is not trustworthy.
    if (bl === L0 - 4 || bl === L0 + 4) break;
    P = (bl + parabola(vals[bl - 1], vals[bl], vals[bl + 1])) / M;
  }
  let phase = 0;
  let ps = -Infinity;
  for (let q = 0; q < P; q += 0.25) {
    let s = 0;
    for (let t = q; t < N; t += P) s += d[Math.round(t)] ?? 0;
    if (s > ps) {
      ps = s;
      phase = q;
    }
  }
  const beats = [];
  // +half a hop: an attack shows up in the hop that contains it.
  for (let t = phase; t < N; t += P) beats.push(+((i0 + t + 0.5) / rate).toFixed(3));
  return { bpm: +((60 * rate) / P).toFixed(2), strength: +r[best].toFixed(3), beats };
}

/**
 * Beats of the assembled score, found PER MUSIC CUE: a library score is ~20
 * different tracks, each with its own tempo, so one global grid (the old
 * method) was right only for the first cue. Each window is analysed on its
 * own, away from its crossfades (a window that touches its neighbour loses
 * `margin` at that side; the start of the score and a re-entry after a
 * silence keep their first beats — the cold-open montage cuts on them). A
 * window without a clear pulse gets no beats rather than a guessed grid that
 * would drag cuts around.
 * @param {string} file  the score
 * @param {{from:number,to:number}[]} windows  seconds
 * @returns {{beats:number[], segments:{from:number,to:number,bpm:number|null,strength:number|null,beats:number[]}[]}}
 */
export function scoreBeats(file, windows, { ff = 'ffmpeg', margin = 1.3 } = {}) {
  // The whole score is decoded: its deadline grows with its length.
  const timeout = ffDeadline(Math.max(0, ...windows.map((w) => w.to)));
  let raw;
  try {
    raw = execFileSync(ff, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(BEAT_SR), '-f', 's16le', '-'], {
      maxBuffer: 1 << 30,
      windowsHide: true,
      timeout,
    });
  } catch (e) {
    throw deadlineNote(e, timeout);
  }
  const buf = raw.byteOffset % 2 ? Buffer.from(raw) : raw;
  const on = onsetEnvelope(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1));
  const segments = [];
  const all = [];
  const sorted = [...windows].sort((a, b) => a.from - b.from);
  sorted.forEach((w, k) => {
    const touches = (x) => !!x && x.from - 0.05 <= w.to && w.from <= x.to + 0.05;
    const g = beatGrid(on, w.from + (touches(sorted[k - 1]) ? margin : 0.4), w.to - (touches(sorted[k + 1]) ? margin : 0.4));
    segments.push({ from: w.from, to: w.to, bpm: g?.bpm ?? null, strength: g?.strength ?? null, beats: g?.beats ?? [] });
    if (g) all.push(...g.beats);
  });
  all.sort((a, b) => a - b);
  const beats = all.filter((b, k) => !k || b - all[k - 1] > 0.1);
  return { beats, segments };
}

/**
 * @param {object} scriptIn  docu script (see src/types.ts `Script`)
 * @param {object} o
 * @param {string} o.workDir      where generated assets and outputs go
 * @param {string} [o.publicDir]  asset root the composition reads (default <workDir>/public)
 * @param {string} [o.buildPrefix] sub-folder of publicDir for this video's own assets
 * @param {string} [o.cacheDir]   cache shared by every video: voice, music, SFX, ambience (default <engine>/public)
 * @param {string} [o.output]     final mp4 path (default <workDir>/out/<id>.mp4)
 * @param {{eleven:string, replicate?:string, openai?:string}} o.keys
 * @param {string} [o.ffmpeg]     ffmpeg binary (default "ffmpeg" on PATH)
 * @param {string} [o.voiceId]
 * @param {string} [o.audioLibrary]  sound library root (default NOVA_AUDIO_LIB, else <NOVA_HOME>/data/audio-library)
 * @param {'library'|'eleven'} [o.musicSource]  'eleven' composes the score with ElevenLabs Music even when a library exists
 * @param {number} [o.minSeconds]  stop before music when the voiced video is shorter (a 10-minute order must not render 8)
 * @param {boolean} [o.planOnly]  stop after the sound plan and write the props, no render (QA, tests)
 * @param {(msg:string)=>void} [o.log]
 * @param {(stage:string, pct:number)=>void} [o.progress]  pct 0..100 overall
 * @param {() => boolean} [o.cancelled]
 * @param {number} [o.concurrency]  parallel image/voice requests (default 4)
 * @param {number} [o.renderConcurrency]
 * @param {string} [o.chunkDir]    render chunk cache (default <workDir>/chunks)
 * @param {boolean} [o.keepChunks] keep the chunks after a clean render (default: only when warnings say a re-render is due)
 * @param {string} [o.bundleDir]   a prebuilt composition bundle to use as-is (QA, tests)
 */
export async function produce(scriptIn, o) {
  const script = structuredClone(scriptIn);
  const id = script.id ?? 'video';
  // An unknown style would give empty SFX prompts here and crash the composition later.
  const KNOWN_GENRES = ['documentary', 'finance', 'horror', 'crime', 'epic', 'science', 'inspire'];
  if (!KNOWN_GENRES.includes(script.genre)) script.genre = 'documentary';
  const log = o.log ?? ((m) => console.log('›', m));
  // Transitions, effects and camera obey the story's gravity and each beat's meaning (edit-grammar.mjs).
  // The picture keeps its own gravity rule (editGravity): the music's stricter one must not re-cut old videos.
  for (const n of applyEditGrammar(script, { gravity: editGravity(script, script.genre) }).notes) log(n);
  // World maps: the coast, borders and tinted countries each map box shows (world-map.mjs, Natural Earth).
  script.scenes = attachWorldMaps(script, { log }).scenes ?? script.scenes;
  const progress = o.progress ?? (() => {});
  const cancelled = o.cancelled ?? (() => false);
  const guard = () => {
    if (cancelled()) throw Object.assign(new Error('iptal edildi'), { cancelled: true });
  };
  const FFMPEG = o.ffmpeg ?? 'ffmpeg';
  const EL_KEY = o.keys?.eleven;
  const RP_KEY = o.keys?.replicate;
  const KL_KEY = o.keys?.kling;
  const OA_KEY = o.keys?.openai;
  if (!EL_KEY) throw new Error('ElevenLabs anahtarı yok');
  /*
   * Image provider. OpenAI GPT Image by default when its key is there
   * (measured on the Kaşıkçı shots: richer composition, same face kept from a
   * reference portrait, $0.042 per image, $0.054 with a reference); Replicate
   * FLUX otherwise. Depth layers (cutout + eraser) stay on Replicate — they
   * are skipped when there is no Replicate key.
   */
  const IMG = o.imageProvider ?? (OA_KEY ? 'openai' : 'replicate');
  const OA_MODEL = o.openaiImageModel ?? 'gpt-image-2';
  if (IMG === 'openai' && !OA_KEY) throw new Error('OpenAI anahtarı yok — GPT Image için gerekli');
  const CONC = o.concurrency ?? 4;

  const WORK = o.workDir;
  const PUBLIC = o.publicDir ?? join(WORK, 'public');
  /*
   * CHATGPT IMAGE INBOX (image-inbox.mjs): imageProvider "manual" — or an OpenAI "no balance" answer —
   * lists the stills still missing in <job>/gorsel-kutusu/LISTE.txt and stops after the image stage;
   * stills dropped there (01.png …) are taken on the next run. Same cache keys as OpenAI stills.
   */
  const INBOX = join(WORK, '..', 'gorsel-kutusu');
  const MANUAL = IMG === 'manual';
  const OAI_KEYS = IMG === 'openai' || MANUAL;
  let imgQuota = false;
  let manualImages = 0;
  const BUILD = o.buildPrefix ?? `build/${id}`;
  const CACHE = o.cacheDir ?? join(ENGINE_DIR, 'public');
  const OUT = o.output ?? join(WORK, 'out', `${id}.mp4`);
  mkdirSync(join(PUBLIC, BUILD), { recursive: true });
  mkdirSync(dirname(OUT), { recursive: true });
  const MOODS = JSON.parse(readFileSync(join(ENGINE_DIR, 'src/moods.json'), 'utf8'));

  /*
   * What went wrong without stopping the video. docu.js turns these into
   * quality warnings and marks the render "incomplete", so a re-render can
   * retry exactly what is missing instead of the video quietly shipping with
   * a borrowed picture. Scene numbers refer to the script as given (no cards).
   * softenedImages: pictures made from a softened prompt after a moderation
   * refusal (or by the FLUX fallback) — informative, not degraded.
   */
  const warnings = { fallbackImages: [], borrowed: [], depthSkipped: [], refRefused: [], softenedImages: [], missingAmbience: 0, musicPromptFallback: false };

  /*
   * The sound library (licensed music + transition/room-tone/event sounds).
   * With it no music, SFX or ambience is generated with ElevenLabs; the user
   * may still ask for a composed score (musicSource 'eleven').
   */
  const LIB_ROOT = libraryRoot({ audioLibrary: o.audioLibrary });
  const LIB = loadLibrary(LIB_ROOT);
  const MUSIC_SOURCE = o.musicSource === 'eleven' ? 'eleven' : 'library';
  if (LIB) log(`ses kütüphanesi: ${LIB.music.length} parça, ${LIB.sfx.length} efekt · müzik: ${MUSIC_SOURCE === 'eleven' ? 'ElevenLabs bestesi' : 'kütüphane'}`);
  else log(`ses kütüphanesi yok (${LIB_ROOT}) — müzik, efekt ve ortam sesleri ElevenLabs ile üretilecek`);
  /*
   * Cross-video music variety: <NOVA_HOME>/data/docu-music-history.json (next to
   * the shared docu-cache). Tracks of the last ~5 videos are avoided and the
   * main theme never repeats back to back. A video already in the file plans
   * against the history it first saw, so a re-run keeps its music (and its
   * beat grid).
   * Planner: script.musicSelector / NOVA_MUSIC_SELECTOR ('v1' | 'v2') when
   * given; else the one this job was planned with (music-plan.json in its
   * build folder); else a job that already has a score/beat grid from before
   * v2 (its picture is cut to those beats) keeps 'v1'; new jobs get 'v2'.
   */
  const MUSIC_HISTORY = o.musicHistory ?? process.env.NOVA_MUSIC_HISTORY ?? (o.cacheDir && basename(o.cacheDir) === 'docu-cache' ? join(dirname(o.cacheDir), 'docu-music-history.json') : null);
  // Variety is per channel (27 Ekim 2026): a news video avoids the last news videos' music, not the history channel's.
  const MUSIC_CHANNEL = musicChannelOf(script);
  const MUSIC_PRIOR = MUSIC_HISTORY ? musicHistoryFor(readMusicHistory(MUSIC_HISTORY), id, { channel: MUSIC_CHANNEL }) : [];
  const MUSIC_MARK = join(PUBLIC, BUILD, 'music-plan.json');
  const MUSIC_SELECTOR = script.musicSelector ?? process.env.NOVA_MUSIC_SELECTOR ?? readJson(MUSIC_MARK)?.selector
    ?? (readdirSafe(join(PUBLIC, BUILD)).some((f) => /^(beats-[0-9a-f]+\.json|score-[0-9a-f]+\.wav\.json)$/.test(f)) ? 'v1' : 'v2');

  /** Make a cached shared file visible to the composition under the same relative path. */
  const publish = (rel) => publishAs(rel, rel);
  /** Same, under another name inside this video's public dir. */
  function publishAs(cacheRel, pubRel) {
    if (CACHE === PUBLIC) return cacheRel;
    const src = join(CACHE, cacheRel);
    const dst = join(PUBLIC, pubRel);
    if (!fileOk(dst) || statSync(dst).size !== statSync(src).size) linkOrCopy(src, dst);
    return pubRel;
  }
  /**
   * The only ElevenLabs sound effects a library-backed video may make: a few
   * (o.maxGeneratedSfx, default 4) for gaps the library cannot fill. Each is
   * saved INTO the library (file + library.json entry), so it is paid once.
   */
  const genBudget = { left: LIB ? Math.max(0, o.maxGeneratedSfx ?? 4) : 0 };
  async function generateIntoLibrary({ kind, role, text, seconds, loop = false, genres, keywords, gainDb }) {
    if (genBudget.left <= 0 || !LIB) return null;
    genBudget.left--;
    const key = hash(`${kind}|${text}|${seconds}`).slice(0, 10);
    const rel = `sfx/gen-${kind}-${key}.mp3`;
    const abs = join(LIB_ROOT, rel);
    try {
      if (!fileOk(abs)) {
        log(`kütüphanede yok, ElevenLabs'tan efekt çekiliyor (${kind}): ${text.slice(0, 70)}`);
        const buf = await el('/v1/sound-generation', { text, duration_seconds: seconds, prompt_influence: 0.45, ...(loop ? { loop: true } : {}) }, { json: false });
        writeAtomic(abs, buf);
      }
      const entry = {
        sourceId: `eleven:${key}`, file: rel, source: 'elevenlabs', license: 'ElevenLabs — kendi üretimimiz', role, kind,
        intensity: kind === 'bed' ? 2 : 3, keywords, genres, moods: ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'],
        scene_types: ['any'], era: 'any', literal_only: false, max_per_video: kind === 'bed' ? 6 : 12, min_gap_sec: kind === 'bed' ? 0 : 8,
        gain_db: gainDb, duration: seconds, lufs: loudnessOf(abs).I,
      };
      // Re-read the index right before writing: another job may have added to it meanwhile.
      const index = join(LIB_ROOT, 'library.json');
      const disk = JSON.parse(readFileSync(index, 'utf8'));
      if (!disk.sfx.some((s) => s.sourceId === entry.sourceId)) {
        disk.sfx.push(entry);
        writeAtomic(index, JSON.stringify(disk, null, 1));
      }
      if (!LIB.sfx.some((s) => s.sourceId === entry.sourceId)) LIB.sfx.push(entry);
      return abs;
    } catch (e) {
      if (e.cancelled || e.quota || e.status === 401) throw e;
      log(`efekt üretilemedi, onsuz devam: ${String(e.message).slice(0, 120)}`);
      return null;
    }
  }
  /** A library file (absolute path) as a composition asset. */
  function publishLib(abs) {
    const r = relative(LIB_ROOT, abs);
    const rel = !r.startsWith('..') && !isAbsolute(r) ? `audiolib/${toPosix(r)}` : `audiolib/ext/${hash(abs)}-${basename(abs)}`;
    const dst = join(PUBLIC, rel);
    if (!fileOk(dst) || statSync(dst).size !== statSync(abs).size) linkOrCopy(abs, dst);
    return rel;
  }
  // Static engine assets: the synth fallback SFX kit, the film-grain tiles and (when vendored) the fonts.
  // Re-copied when the engine's file changed size, so an updated grain tile reaches old jobs too.
  for (const [dir, ext] of [['sfx', /\.wav$/], ['fx', /\.png$/], ['fonts', /\.(woff2?|ttf|otf)$/i]]) {
    for (const f of readdirSafe(join(ENGINE_DIR, 'public', dir)).filter((f) => ext.test(f))) {
      const src = join(ENGINE_DIR, 'public', dir, f);
      const dst = join(PUBLIC, dir, f);
      if (!fileOk(dst) || statSync(dst).size !== statSync(src).size) {
        mkdirSync(dirname(dst), { recursive: true });
        copyFileSync(src, dst);
      }
    }
  }
  // Map flags (1.16.16, src/map.tsx): only the ones this film's world maps draw.
  for (const code of new Set(script.scenes.flatMap((s) => (s?.geo?.flagFills ?? []).map((f) => f.flag)))) {
    const src = join(ENGINE_DIR, 'public', 'flags', `${code}.svg`);
    const dst = join(PUBLIC, 'flags', `${code}.svg`);
    if (/^[a-z]{2}(-[a-z]+)?$/.test(code) && fileOk(src) && !fileOk(dst)) {
      mkdirSync(dirname(dst), { recursive: true });
      copyFileSync(src, dst);
    }
  }

  /* Genre prompts live in src/genres.ts; read them without a TS toolchain. */
  function genrePrompts(genreId) {
    const src = readFileSync(join(ENGINE_DIR, 'src/genres.ts'), 'utf8');
    const block = src.slice(src.indexOf(`${genreId}: {`));
    const grab = (key) => {
      const m = block.match(new RegExp(`${key}:\\s*\\n?\\s*((?:'[^']*'\\s*\\+?\\s*)+)`));
      return m ? m[1].split(/'\s*\+\s*'/).join('').replace(/^'|'\s*$/g, '').trim() : '';
    };
    const sfx = {};
    for (const k of ['hit', 'whoosh', 'riser', 'ticks', 'glitch', 'swell', 'snap', 'stinger', 'thud']) sfx[k] = grab(`      ${k}`);
    // Collage genres show photos as paper cards on a board, where depth layers are never drawn.
    const end = block.search(/\n {2}\w+: \{/);
    return { music: grab('musicPrompt'), sfx, collage: /\bcollage:\s*true\b/.test(end > 0 ? block.slice(0, end) : block) };
  }

  /*
   * ElevenLabs calls. Transient failures — a dropped connection, a DNS
   * hiccup, a timeout, 408/429/5xx — are retried with jittered backoff (the
   * server's Retry-After wins). An empty balance is never retried and never
   * shown as raw provider JSON: it becomes one clear Turkish sentence, and the
   * ambience/SFX steps rethrow it instead of skipping scene after scene.
   */
  async function el(path, body, { json = true, timeoutMs = 180_000 } = {}) {
    // Network drops on home connections last minutes, not seconds: ~10 min of patience
    // (2s, 4s … capped at 90s) before asking the user to resume by hand.
    const TRIES = 11;
    for (let attempt = 1; ; attempt++) {
      guard();
      let r;
      try {
        r = await fetch(`https://api.elevenlabs.io${path}`, {
          method: 'POST',
          headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (r.ok) return json ? await r.json() : Buffer.from(await r.arrayBuffer());
      } catch (e) {
        if (e.cancelled) throw e;
        const why = e.cause?.code ?? e.name ?? 'ağ';
        if (attempt >= TRIES) throw new Error(`ElevenLabs'e ulaşılamadı (${why}) — ${TRIES} deneme; internet bağlantısını kontrol edip "Kaldığı yerden devam et"`);
        const wait = Math.min(90_000, 2000 * 2 ** (attempt - 1)) + Math.random() * 1500;
        log(`ElevenLabs bağlantı hatası (${why}), ${attempt}. deneme — ${Math.round(wait / 1000)} sn bekleniyor`);
        await sleep(wait);
        continue;
      }
      const text = await r.text().catch(() => '');
      if (/output_format/i.test(text) && /[?&]output_format=/.test(path)) {
        throw Object.assign(new Error(`ElevenLabs çıkış biçimi reddedildi (${r.status})`), { status: r.status, formatRejected: true });
      }
      if (r.status === 402 || ([401, 403, 429].includes(r.status) && /quota_exceeded|insufficient|credits?\b|payment_required/i.test(text))) {
        throw Object.assign(new Error('ElevenLabs kredisi bitti — kredi yükleyip "Kaldığı yerden devam et"; üretilen görsel ve sesler korunur, yeniden ödenmez.'), { status: r.status, quota: true });
      }
      if (r.status === 401) throw Object.assign(new Error('ElevenLabs anahtarı geçersiz ya da yetkisiz (401) — Ayarlar\'dan anahtarı kontrol edin.'), { status: 401 });
      // 409 already_running: the same library voice is being added to the account by a parallel request — transient.
      if ((r.status === 408 || r.status === 429 || r.status >= 500 || (r.status === 409 && /already_running/.test(text))) && attempt < TRIES) {
        const after = Number(r.headers.get('retry-after'));
        const wait = Math.min(90_000, after > 0 ? after * 1000 : 3000 * 2 ** (attempt - 1)) + Math.random() * 1500;
        log(`ElevenLabs ${r.status}, ${attempt}. deneme — ${Math.round(wait / 1000)} sn bekleniyor`);
        await sleep(wait);
        continue;
      }
      throw Object.assign(new Error(`ElevenLabs ${path.split('?')[0]} ${r.status}: ${text.slice(0, 300)}`), { status: r.status });
    }
  }

  /** Free: what is left of this billing period's credits. */
  async function elevenRemaining() {
    const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': EL_KEY }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = await r.json();
    return Math.max(0, (s.character_limit ?? 0) - (s.character_count ?? 0));
  }

  const ff = (args, opts = {}) => {
    const timeout = opts.timeout ?? FF_SHORT_MS;
    try {
      return execFileSync(FFMPEG, ['-nostdin', ...args], { maxBuffer: 512 * 1024 * 1024, windowsHide: true, ...opts, timeout });
    } catch (e) {
      throw deadlineNote(e, timeout);
    }
  };
  const ffOut = (args, timeout = FF_SHORT_MS) => ffText(FFMPEG, args, timeout);
  /** Integrated loudness, range and true peak (EBU R128), after an optional filter chain. */
  function loudnessOf(file, chain = null) {
    const out = ffOut(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', [chain, 'ebur128=peak=true'].filter(Boolean).join(','), '-f', 'null', '-']);
    const sum = out.slice(Math.max(0, out.lastIndexOf('Summary:')));
    const num = (re) => {
      const v = Number(sum.match(re)?.[1]);
      return Number.isFinite(v) ? v : null;
    };
    const I = num(/I:\s+(-?[\d.]+) LUFS/);
    return { I: I !== null && I > -70 ? I : null, LRA: num(/LRA:\s+(-?[\d.]+) LU\b/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
  }

  /* ================================================================ 1. images */

  async function replicate(model, inputObj) {
    if (!RP_KEY) throw new Error('Replicate anahtarı yok — görsel üretimi için gerekli');
    // "owner/name" runs the latest version; a bare 64-char hash runs that pinned version.
    const pinned = /^[0-9a-f]{64}$/.test(model);
    const endpoint = pinned ? 'https://api.replicate.com/v1/predictions' : `https://api.replicate.com/v1/models/${model}/predictions`;
    for (let round = 1; round <= 3; round++) {
      /*
       * Rate limits. Accounts under $5 of credit are throttled to ~6 predictions
       * a minute; with four parallel image jobs the old 6-try / 63-second backoff
       * gave up and four scenes silently borrowed a neighbour's picture (measured
       * on the Kaşıkçı video). Now: wait exactly as long as Replicate says
       * (retry_after / Retry-After), jittered, for up to ~6 minutes per image.
       */
      let p;
      const deadline = Date.now() + 6 * 60_000;
      const short = model.split('/').pop().slice(0, 24);
      for (let attempt = 1; Date.now() < deadline; attempt++) {
        guard();
        // A dropped connection is retried inside fetchRetry; statuses stay here, paced by Replicate's own retry_after.
        const r = await fetchRetry(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${RP_KEY}`, 'Content-Type': 'application/json', Prefer: 'wait=55' },
          body: JSON.stringify(pinned ? { version: model, input: inputObj } : { input: inputObj }),
        }, { retryHttp: false, label: `Replicate ${short}`, log, guard });
        if (r.status === 429 || r.status >= 500) {
          const body = await r.text();
          let wait = Number(r.headers.get('retry-after')) || Number(body.match(/"retry_after"\s*:\s*([\d.]+)/)?.[1]) || Math.min(30, 3 * attempt);
          wait = Math.min(60, wait) * 1000 + Math.random() * 1500;
          if (attempt === 1 || attempt % 5 === 0) log(`Replicate ${r.status === 429 ? 'hız sınırı' : `hata ${r.status}`}, ${Math.round(wait / 1000)} sn bekleniyor (${short})`);
          await sleep(wait);
          continue;
        }
        if (r.status === 402) throw Object.assign(new Error('Replicate bakiyesi yetersiz (402) — replicate.com/account/billing üzerinden kredi yükleyin'), { status: 402, quota: true });
        if (!r.ok) {
          const body = await r.text();
          throw Object.assign(new Error(`Replicate ${model} ${r.status}: ${body.slice(0, 300)}`), { status: r.status, moderation: MODERATION_BODY.test(body) });
        }
        p = await r.json();
        break;
      }
      if (!p) throw Object.assign(new Error(`Replicate ${model}: 6 dakika boyunca istek kabul edilmedi (hız sınırı)`), { rateLimited: true });
      const started = Date.now();
      while (p.status === 'starting' || p.status === 'processing') {
        guard();
        if (Date.now() - started > 300_000) throw Object.assign(new Error(`Replicate ${model}: zaman aşımı`), { timeout: true });
        await sleep(2500);
        const r = await fetchRetry(p.urls.get, { headers: { Authorization: `Bearer ${RP_KEY}` } }, { label: `Replicate ${short} durum`, log, guard });
        if (!r.ok) throw Object.assign(new Error(`Replicate ${model} durum sorgusu ${r.status}`), { status: r.status });
        p = await r.json();
      }
      if (p.status === 'succeeded') {
        const url = Array.isArray(p.output) ? p.output[0] : p.output;
        const r = await fetchRetry(url, {}, { label: `Replicate ${short} indirme`, log, guard });
        if (!r.ok) throw Object.assign(new Error(`Replicate ${model}: çıktı indirilemedi (${r.status})`), { status: r.status });
        return Buffer.from(await r.arrayBuffer());
      }
      // Transient model failures are common on busy days; a moderation flag is not transient.
      const msg = `${p.error ?? ''}`;
      if (MODERATION_BODY.test(msg)) throw Object.assign(new Error(`Replicate ${model}: içerik filtresi reddetti (${msg.slice(0, 120)})`), { moderation: true });
      if (round === 3) throw new Error(`Replicate ${model}: ${p.status} ${msg}`);
      log(`Replicate ${model} başarısız (${msg.slice(0, 80)}), tekrar deneniyor`);
    }
    throw new Error(`Replicate ${model}: olmadı`);
  }

  /*
   * Appended to every image: generated stills otherwise sprout gibberish
   * lettering and anachronisms (a modern spiral notebook in a 1974 kitchen),
   * and either one breaks the archive illusion instantly. Part of every image
   * key; every request is asked with styleFor(STYLE, year): its dark-look words dropped and exposure asked
   * (exposedStyle), and from PRESENT_FROM on the things of its own year. The keys keep this raw STYLE.
   */
  const STYLE = `${script.visualStyle ?? ''} No readable text or lettering anywhere, no logos, no modern objects.`.trim();
  /* One seed per script keeps grain, palette and lens character consistent. */
  // `seedKey` lets a copied script (e.g. the sample, re-run as a Nova job with a new id) keep its original look.
  const SEED_KEY = script.seedKey ?? id;
  const SEED = parseInt(hash(SEED_KEY).slice(0, 6), 16) % 1_000_000;

  /* ------------------------------------------------------ OpenAI GPT Image */

  const toJpg = (buf) => {
    // GPT Image returns PNG (~3 MB at 1536×1024); the composition wants light JPEGs.
    return ff(['-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-i', 'pipe:0', '-q:v', '2', '-f', 'image2', '-vcodec', 'mjpeg', 'pipe:1'], { input: buf });
  };
  /*
   * `moderation: 'low'` on generations: GPT Image's default filter refuses a
   * lot of ordinary true-crime and war imagery. The edits endpoint (shots
   * with a reference portrait) does not take the parameter (OpenAI's API
   * reference lists it for generations only), so it is never sent there; if
   * a model ever rejects it on generations too, it is dropped for the run.
   */
  let oaModeration = true;
  /*
   * ONE FRAME. A visualStyle that describes the edit ("intercut with authentic archival prints:
   * manuscripts, glass-plate photographs, film stills") rides on every prompt, and GPT Image read it
   * as "make a collage": 17 of the Black Death video's stills came out as grids of invented archive
   * photos with invented faces. Sent with every request, outside the cache key (good stills of old
   * projects stay cached).
   */
  const ONE_FRAME = ' One single continuous photograph of one scene: never a collage, grid, mosaic, split frame, contact sheet or several pictures; no photos pinned or laid out on a surface unless the scene itself is about them.';
  async function openaiImage({ prompt: asked, size, refs = [] }) {
    const prompt = `${asked}${ONE_FRAME}`;
    const deadline = Date.now() + 8 * 60_000;
    for (let attempt = 1; ; attempt++) {
      guard();
      let r;
      // Network drops are retried inside fetchRetry; 429/5xx pacing stays here (8-minute window, Tier-1 accounts).
      const net = { retryHttp: false, label: 'OpenAI görsel', log, guard };
      if (refs.length) {
        const fd = new FormData();
        fd.append('model', OA_MODEL);
        fd.append('prompt', prompt);
        fd.append('size', size);
        fd.append('quality', 'medium');
        refs.forEach((b, i) => fd.append('image[]', new Blob([b], { type: 'image/jpeg' }), `ref${i}.jpg`));
        r = await fetchRetry('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${OA_KEY}` }, body: fd }, net);
      } else {
        r = await fetchRetry('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${OA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: OA_MODEL, prompt, size, quality: 'medium', ...(oaModeration ? { moderation: 'low' } : {}) }),
        }, net);
      }
      if (r.ok) {
        const j = await r.json();
        return toJpg(Buffer.from(j.data[0].b64_json, 'base64'));
      }
      const body = await r.text();
      // OpenAI empty balance also arrives as HTTP 429 (code insufficient_quota): check it BEFORE
      // treating 429 as a rate limit, or the job waits the whole 8-minute deadline for nothing.
      if (/insufficient_quota|billing_hard_limit|billing_not_active/i.test(body)) {
        throw Object.assign(new Error('OpenAI bakiyesi yetersiz (402) — platform.openai.com üzerinden kredi yükleyin; üretilen görseller korunur, yeniden ödenmez.'), { status: 402, quota: true });
      }
      if (!refs.length && oaModeration && r.status === 400 && /moderation/i.test(body) && /unknown|unrecognized|unsupported|not supported|invalid/i.test(body) && !/moderation_blocked|safety/i.test(body)) {
        oaModeration = false;
        log('OpenAI bu modelde "moderation" ayarını kabul etmedi; varsayılan filtreyle devam');
        continue;
      }
      if (MODERATION_BODY.test(body)) {
        throw Object.assign(new Error(`OpenAI güvenlik filtresi görseli reddetti: ${body.match(/"message"\s*:\s*"([^"]{0,160})/)?.[1] ?? body.slice(0, 160)}`), { status: r.status, moderation: true });
      }
      if ((r.status === 429 || r.status >= 500) && Date.now() < deadline) {
        let wait = Number(r.headers.get('retry-after')) || Math.min(30, 4 * attempt);
        wait = Math.min(60, wait) * 1000 + Math.random() * 1500;
        if (attempt === 1 || attempt % 5 === 0) log(`OpenAI ${r.status === 429 ? 'hız sınırı' : `hata ${r.status}`}, ${Math.round(wait / 1000)} sn bekleniyor`);
        await sleep(wait);
        continue;
      }
      throw Object.assign(new Error(`OpenAI görsel ${r.status}: ${body.slice(0, 300)}`), { status: r.status, ...(r.status === 429 ? { rateLimited: true } : {}) });
    }
  }

  /*
   * Real people. A cast member who also appears in real (archive) photos must
   * not get an invented AI face cut against those photos: AI shots of them
   * hide the face (hideRealFace). Real = listed in `script.realCast`, cast
   * on a scene the writer sourced from the archive, or searched/carded by
   * name (realPeople). PEOPLE also holds the real people outside the cast:
   * a shot of a scene that names one hides the face too (stillPrompt).
   */
  const PEOPLE = realPeople(script);
  const REAL = new Set(PEOPLE.keys);
  if (REAL.size || PEOPLE.names.length) log(`gerçek kişiler (AI karelerinde yüzleri gösterilmez): ${[...REAL, ...PEOPLE.names].join(', ')}`);
  /** Scene i's AI prompt as it is asked (stillPrompt): no printed record, no face of a real person the scene names. */
  const stillPromptAt = (prompt, i) => stillPrompt(prompt, { scene: script.scenes[i], named: namedAt(script.scenes, i, PEOPLE) });

  /*
   * One reference portrait per cast member. A failed portrait is not
   * remembered: the next shot asks again. After a second failure (or a
   * moderation refusal) that person's shots are generated WITHOUT the
   * reference — described in words instead — rather than every one of them
   * failing and borrowing a neighbour's picture.
   */
  const refs = new Map();
  const refFails = new Map();
  const noRef = new Set();
  /*
   * Failures that fail the scene itself (they would fail its own generation
   * the same way) and never give up on the face: a dead key, no model access,
   * a network or provider that is down or busy. Giving up the reference over
   * a passing 429/5xx would put an invented face into a video that keeps
   * the real one everywhere else; the next shot of that person asks again.
   * A malformed-request refusal (400) is about this portrait's prompt and
   * counts toward giving it up.
   */
  const hardFailure = (e) => e.cancelled || e.quota || ['net', 'busy', 'auth', 'forbidden', 'model'].includes(systemicReason(e));
  function castReference(name) {
    if (!refs.has(name)) {
      const p = makeCastReference(name);
      refs.set(name, p);
      // One handler per portrait request (not per waiting shot): it runs before any waiter's catch.
      p.catch((e) => {
        refs.delete(name);
        if (hardFailure(e)) return;
        refFails.set(name, (refFails.get(name) ?? 0) + 1);
        if (e.moderation || refFails.get(name) >= 2) {
          noRef.add(name);
          log(`karakter referansı üretilemedi (${name}): ${e.message.slice(0, 120)} — bu kişinin sahneleri referanssız, tarifle üretilecek`);
        }
      });
    }
    return refs.get(name);
  }
  /** The reference file, or null when this person is generated without one. */
  async function refFor(name) {
    while (!noRef.has(name)) {
      try {
        return await castReference(name);
      } catch (e) {
        if (hardFailure(e)) throw e;
      }
    }
    return null;
  }
  async function makeCastReference(name) {
    const desc = script.cast?.[name];
    if (!desc) throw new Error(`cast'ta "${name}" yok`);
    const key = hash(`ref|${IMG}|${name}|${desc}|${STYLE}`);
    const file = `${BUILD}/cast-${name}-${key}.jpg`;
    // The year of the person's first scene (styleFor): a 2026 firefighter's portrait is not asked for "no modern objects".
    const style = styleFor(STYLE, yearOfEra(script.scenes.find((s) => s.cast?.includes(name))?.era ?? script.era));
    if (!fileOk(join(PUBLIC, file)) && IMG === 'openai') {
      log(`karakter referansı: ${name}`);
      // A refused portrait is remembered like a refused shot: the next run goes straight to the no-reference shots.
      await generate(file, () => openaiImage({
        prompt: `Portrait of ${desc}. Head and shoulders, facing the camera, neutral expression, clear face. ${style}`,
        size: '1024x1536',
      }));
    }
    if (!fileOk(join(PUBLIC, file))) {
      log(`karakter referansı: ${name}`);
      const buf = await replicate('black-forest-labs/flux-1.1-pro', {
        prompt: `Portrait photograph of ${desc}. Head and shoulders, facing the camera, neutral expression, clear face. ${style}`,
        aspect_ratio: '3:4',
        output_format: 'jpg',
        output_quality: 92,
        safety_tolerance: 2,
        seed: SEED,
      });
      writeAtomic(join(PUBLIC, file), buf);
    }
    return file;
  }

  /** A cast member in words; a real person's face is never described (bodyOnly): their AI shots hide it. */
  const castText = (n) => (REAL.has(n) ? bodyOnly(script.cast[n]) : script.cast[n]);
  /** People in the shot in words, for shots that carry no reference portrait. */
  const describe = (names) => (names.length ? ` ${names.length > 1 ? 'People in the shot' : 'The person in the shot'}: ${names.map(castText).join('; ')}.` : '');

  /*
   * A refusal is remembered next to the image (`.refused`), so a re-run goes
   * straight to the softened prompt instead of asking again for a picture
   * the provider already refused.
   */
  const refusedError = (file) => Object.assign(new Error(`görsel daha önce güvenlik filtresine takılmıştı (${basename(file)})`), { moderation: true, remembered: true });
  async function generate(file, make) {
    const mark = join(PUBLIC, `${file}.refused`);
    if (fileOk(mark)) throw refusedError(file);
    let buf;
    try {
      buf = await make();
    } catch (e) {
      if (e.moderation) writeAtomic(mark, e.message);
      throw e;
    }
    writeAtomic(join(PUBLIC, file), buf);
    return file;
  }

  // `style`: STYLE as this scene's year asks for it (styleFor) — request text only; every key below keeps STYLE.
  async function sceneImage(prompt, cast = [], period = '', style = STYLE) {
    cast = cast.filter((n) => script.cast?.[n]);
    const people = cast.map((n) => `${n}: ${script.cast?.[n] ?? ''}`).join('; ');
    // Replicate keeps its historical cache key, so FLUX videos made before GPT Image still hit their cache.
    const baseKey = hash(`${OAI_KEYS ? 'oai|' : ''}img|${prompt}|${people}|${STYLE}`);
    const base = `${BUILD}/img-${baseKey}.jpg`;
    if (fileOk(join(PUBLIC, base))) return base;
    /*
     * A shot with nobody's face in it (a silhouette, hands, an empty room)
     * takes no reference portrait: it only pulls the composition toward a
     * head-and-shoulders and costs more. Otherwise every cast member in the
     * shot contributes one, so faces stay theirs across the video.
     */
    const faceless = FACELESS.test(prompt);
    const withRef = [];
    const refFiles = [];
    if (!faceless) {
      for (const n of MANUAL ? [] : IMG === 'openai' ? cast : cast.slice(0, 1)) {
        const f = await refFor(n);
        if (f) {
          withRef.push(n);
          refFiles.push(f);
        }
      }
    }
    // A shot that lost a reference it should have had gets its own key: a later re-render retries it WITH the face.
    const lost = faceless ? [] : (IMG === 'openai' ? cast : cast.slice(0, 1)).filter((n) => !withRef.includes(n));
    const file = lost.length ? `${BUILD}/img-${hash(`${baseKey}|noref:${lost.join(',')}`)}.jpg` : base;
    if (fileOk(join(PUBLIC, file))) return file;
    const dropped = inboxFileFor(INBOX, file);
    if (dropped) {
      writeAtomic(join(PUBLIC, file), toJpg(readFileSync(dropped)));
      log(`görsel kutusundan alındı: ${basename(dropped)} → ${basename(file)}`);
      return file;
    }
    const waitInbox = () => {
      const n = addNeed(INBOX, { file, prompt: `${prompt}.${describe(cast)} ${style}${period} Wide 16:9 cinematic documentary still.` });
      manualImages++;
      return Object.assign(new Error(`görsel ${padNo(n)} ChatGPT görsel kutusunda bekleniyor`), { manualImage: true });
    };
    if (MANUAL || imgQuota) throw waitInbox();
    const inWords = cast.filter((n) => !withRef.includes(n));
    log(`görsel: ${prompt.slice(0, 70)}${cast.length ? `  [${cast.join(', ')}]` : ''}${lost.length ? ` (referanssız: ${lost.join(', ')})` : ''}`);
    // No balance: this still and every later one go to the ChatGPT inbox instead of stopping the video.
    const generated = (make) => generate(file, make).catch((e) => {
      if (e.quota && IMG === 'openai') { imgQuota = true; throw waitInbox(); }
      throw e;
    });
    return generated(async () => {
      if (IMG === 'openai') {
        const hold = withRef.length ? ` Keep exactly the same face, age, hair and build as the ${withRef.length > 1 ? 'people' : 'person'} in the reference image${withRef.length > 1 ? 's' : ''}.` : '';
        return openaiImage({
          prompt: `${prompt}.${hold}${describe(inWords)} ${style}${period} Wide 16:9 cinematic documentary still.`,
          size: '1536x1024',
          refs: refFiles.map((f) => readFileSync(join(PUBLIC, f))),
        });
      }
      if (withRef.length) {
        // The first cast member's reference photo carries the face; others are described.
        const refUri = 'data:image/jpeg;base64,' + readFileSync(join(PUBLIC, refFiles[0])).toString('base64');
        const others = cast.slice(1).map((n) => `Also in the shot: ${castText(n)}.`).join(' ');
        return replicate('black-forest-labs/flux-kontext-pro', {
          prompt:
            `${prompt}. The man or woman from the reference photo appears in this scene: keep exactly the same face, ` +
            `age, hairstyle and build. ${others} ${style}${period} Wide 16:9 cinematic documentary still.`,
          input_image: refUri,
          aspect_ratio: '16:9',
          output_format: 'jpg',
          safety_tolerance: 2,
          seed: SEED,
        });
      }
      return replicate('black-forest-labs/flux-1.1-pro', {
        prompt: `${prompt}.${describe(inWords)} ${style}${period} Wide 16:9 cinematic documentary still.`,
        aspect_ratio: '16:9',
        output_format: 'jpg',
        output_quality: 92,
        safety_tolerance: 2,
        seed: SEED,
      });
    });
  }

  /**
   * Last resort after GPT Image refused even the softened prompt: FLUX, text
   * only (no reference portrait), with its safety tolerance one notch more
   * permissive than the default — the prompt is already non-graphic.
   */
  async function fluxFallback(prompt, cast = [], period = '', style = STYLE) {
    cast = cast.filter((n) => script.cast?.[n]);
    const file = `${BUILD}/img-${hash(`flux-fallback|${prompt}|${cast.map((n) => `${n}: ${script.cast[n]}`).join('; ')}|${STYLE}`)}.jpg`;
    if (fileOk(join(PUBLIC, file))) return file;
    log(`görsel (FLUX yedeği): ${prompt.slice(0, 70)}`);
    return generate(file, () => replicate('black-forest-labs/flux-1.1-pro', {
      prompt: `${prompt}.${describe(cast)} ${style}${period} Wide 16:9 cinematic documentary still.`,
      aspect_ratio: '16:9',
      output_format: 'jpg',
      output_quality: 92,
      safety_tolerance: 4,
      seed: SEED,
    }));
  }

  /**
   * Night scenes come back from the model very dark, and the duotone's contrast
   * curve then crushes them to black — the kitchen before "ÇALINDI" read as an
   * empty screen. Measure average luma and lift the midtones of anything that
   * would not survive the grade. Blacks stay black; only the midtones open up.
   * Floor 62 -> LIFT_FLOOR 85 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: mean luma 52-56).
   */
  /** Gamma each lifted file was opened with: a lifted footage still's clip gets the same lift in the engine (fx.tsx clipOf). */
  const liftedGamma = new Map();
  function liftIfDark(file) {
    // Only JPEG stills (a .png would be overwritten by the .lift.jpg name).
    if (!/\.jpe?g$/i.test(file)) return file;
    const out = ffOut(['-hide_banner', '-i', join(PUBLIC, file), '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
    const m = out.match(/YAVG=([\d.]+)/);
    const yavg = m ? Number(m[1]) : 128;
    if (yavg >= LIFT_FLOOR || liftGamma(yavg) < 1.02) return file;
    const lifted = file.replace(/\.jpe?g$/i, '.lift.jpg');
    const gamma = liftGamma(yavg).toFixed(2);
    liftedGamma.set(lifted, Number(gamma));
    if (!fileOk(join(PUBLIC, lifted))) {
      log(`karanlık görsel açılıyor (Y=${yavg.toFixed(0)}, gamma ${gamma}): ${basename(file)}`);
      const tmp = join(PUBLIC, `${lifted}.tmp.jpg`);
      ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', join(PUBLIC, file), '-vf', `eq=gamma=${gamma}:contrast=1.05`, '-q:v', '2', '-f', 'image2', tmp]);
      renameSync(tmp, join(PUBLIC, lifted));
    }
    return lifted;
  }

  /*
   * 2.5D depth: cut the person out (background remover), then erase them from
   * the frame for the clean plate that shows behind them when the layers drift
   * apart. The subject's bounding box comes from the cutout's alpha and tells
   * the edit where the free space for type is.
   */
  const BG_REMOVER = 'a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc';

  function alphaBox(file) {
    const W = 64;
    const H = 36;
    const raw = ff(['-hide_banner', '-loglevel', 'error', '-i', join(PUBLIC, file), '-vf', `alphaextract,scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (raw[y * W + x] > 128) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) return null;
    return [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H].map((v) => +v.toFixed(3));
  }

  /*
   * OPENING MOTION (Nova marks at most two opening scenes `aiMotion`: an AI still of something that
   * moves — sea, fire, crowds, steam — that found no real footage). The still becomes a 5 s image-to-
   * video clip and the scene plays it as footage; the settled part is used (the first ~0.6 s barely
   * moves). With a Kling key: Kling 3.0 1080p straight from Kling's API (the opening is where the
   * viewer stays or leaves); otherwise Replicate (Kling 2.5 Turbo Pro by default). Paid once per
   * picture + prompt + model.
   */
  const VIDEO_MODEL = KL_KEY ? (o.klingOpeningModel || 'kling-3.0') : (o.videoModel || 'kwaivgi/kling-v2.5-turbo-pro');
  const NEGATIVE = 'text, captions, watermark, morphing, warping faces, distorted hands, flicker, fast camera shake, cartoon, modern objects';
  async function openingMotion(scene) {
    const what = String(scene.motion || scene.imagePrompt || '').trim().replace(/\.$/, '');
    const prompt = `${what}; natural movement in the scene (water, smoke, fire, cloth, crowds, light). One slow, deliberate cinematic camera push. Realistic physics, photographic, period-accurate, same lighting and grade as the first frame, no new objects or people appear, faces stay stable.`;
    // A climax shot (Nova's climaxMotionTargets) uses the cheap model: the opening is where Kling 3.0 pays off.
    const climax = scene.aiMotion === 'climax' && KL_KEY;
    const model = climax ? KLING_CHEAP_MODEL : VIDEO_MODEL;
    const key = hash(`i2v|${model}|${scene.image}|${prompt}`);
    const rel = `${BUILD}/i2v-${key}.mp4`;
    const abs = join(PUBLIC, rel);
    if (!fileOk(abs)) {
      log(`${climax ? 'doruk' : 'açılış'} hareketi: ${basename(scene.image)} → ${model.split('/').pop()}`);
      const uri = 'data:image/jpeg;base64,' + readFileSync(join(PUBLIC, scene.image)).toString('base64');
      if (KL_KEY) {
        writeAtomic(abs, await klingImageToVideo({ key: KL_KEY, image: uri, prompt, negative: NEGATIVE, duration: 5, resolution: climax ? (o.klingResolution || '720p') : (o.klingOpeningResolution || '1080p'), model, taskId: `nova-op-${key}`, logFn: log, isCancelled: cancelled }));
      } else {
        const input = /kling/.test(VIDEO_MODEL)
          ? { start_image: uri, prompt, duration: 5, negative_prompt: NEGATIVE }
          : { image: uri, prompt };
        writeAtomic(abs, await replicate(VIDEO_MODEL, input));
      }
    }
    const info = ffText(FFMPEG, ['-hide_banner', '-i', abs], FF_PROBE_MS);
    const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(info);
    const z = /, (\d{2,5})x(\d{2,5})[, ]/.exec(info);
    const dur = d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0;
    if (!dur || !z) throw new Error('açılış klibi okunamadı');
    const start = Math.min(0.6, Math.max(0, dur - 2));
    return { video: rel, videoStart: start, videoDur: +(dur - start).toFixed(2), videoW: +z[1], videoH: +z[2], aiVideo: true };
  }

  async function depthLayers(image) {
    const key = hash(`layers|${image}`);
    const fg = `${BUILD}/fg-${key}.png`;
    const bg = `${BUILD}/erase-${key}.png`;
    const uri = 'data:image/jpeg;base64,' + readFileSync(join(PUBLIC, image)).toString('base64');
    if (!fileOk(join(PUBLIC, fg))) {
      log(`derinlik: kişi kesiliyor ${basename(image)}`);
      writeAtomic(join(PUBLIC, fg), await replicate(BG_REMOVER, { image: uri, format: 'png', background_type: 'rgba' }));
    }
    if (!fileOk(join(PUBLIC, bg))) {
      /*
       * Clean plate by mask erasing, not by asking an editing model to "remove
       * the person": kontext often hands the frame back unchanged, and a plate
       * that still contains the subject shows up as a ghost twin once the layers
       * drift apart. The mask is the cutout's alpha, grown so no rim is left.
       */
      log(`derinlik: arka plan dolduruluyor ${basename(image)}`);
      const mask = ff([
        '-hide_banner', '-loglevel', 'error', '-i', join(PUBLIC, fg),
        '-vf', "alphaextract,scale=iw/8:ih/8,dilation,dilation,dilation,scale=iw*8:ih*8,geq=lum='if(gt(lum(X,Y),12),255,0)'",
        '-f', 'image2pipe', '-vcodec', 'png', '-',
      ]);
      // bria/eraser is a true remover: it fills from the surroundings and never
      // invents a new person there (flux-fill does, whatever the prompt says).
      const buf = await replicate('bria/eraser', {
        image: uri,
        mask: 'data:image/png;base64,' + mask.toString('base64'),
        preserve_alpha: false,
      });
      writeAtomic(join(PUBLIC, bg), buf);
    }
    const box = alphaBox(fg);
    // A failed cutout (nothing, or the whole frame) is worse than no depth at all.
    if (!box) return undefined;
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    if (area < 0.03 || area > 0.85) {
      log(`derinlik atlandı (kişi alanı ${(area * 100).toFixed(0)}%): ${basename(image)}`);
      return undefined;
    }
    return { bg, fg, box };
  }

  /*
   * Image failures are sorted, not swallowed.
   *  - A moderation refusal is about one prompt: it is retried once with a
   *    softened prompt, then (GPT Image only) with FLUX, and only then does the
   *    scene borrow a picture. It never stops the job — crime and horror get
   *    many refusals legitimately.
   *  - A systemic failure (dead key, no model access, wrong model, network or
   *    provider down: systemicReason) fails every picture the same way. Three
   *    in a row, or more than 10% of the pictures, stop the job with a clear
   *    message before any voice is paid for. Pictures made so far are cached,
   *    so "Kaldığı yerden devam et" pays for nothing twice.
   */
  const img = { calls: 0, systemic: 0, streak: 0, last: null };
  const stageError = (why, e, what) =>
    Object.assign(
      new Error(`Görsel üretimi durduruldu: ${what} üretilemedi — ${SYSTEMIC_TR[why]}. Son hata: ${String(e?.message ?? e).slice(0, 180)}. Üretilen görseller kaydedildi, "Kaldığı yerden devam et" onları yeniden ödemez.`),
      { systemic: why, status: e?.status },
    );
  function noteFailure(e, where) {
    const why = systemicReason(e);
    log(`görsel üretilemedi${where}: ${String(e.message).slice(0, 160)}`);
    if (!why) return;
    img.systemic++;
    img.streak++;
    img.last = { why, e };
    if (img.streak >= 3) throw stageError(why, e, 'art arda 3 görsel');
  }
  const softened = new Set();
  // Most scenes carry real archive photos/footage: AI images only fill gaps.
  const archiveLed = script.scenes.filter((s) => s.archived).length >= script.scenes.length * 0.4;

  async function safeImage(prompt, cast, i) {
    img.calls++;
    // Every AI still — scene, montage frame, cutaway — is asked through here, and sceneImage writes the ChatGPT inbox
    // (gorsel-kutusu/LISTE.txt, needed.json) from the same prompt: the API and the inbox never get different pictures.
    prompt = stillPromptAt(prompt, i);
    // What did not exist yet in this scene's year (lib/period.mjs), and from PRESENT_FROM on the things of its own year
    // (styleFor): request text only, the cache key is unchanged. A year the prompt itself names wins (period.mjs promptYear).
    const year = promptYear(prompt) ?? yearOfEra(script.scenes[i]?.era ?? script.era);
    const period = periodNegative(year);
    const style = styleFor(STYLE, year);
    const where = ` (sahne ${i + 1})`;
    // Real, photographed people: AI shots of them never show an invented face.
    const shown = hideRealFace(prompt, cast.filter((n) => REAL.has(n)));
    try {
      const f = liftIfDark(await sceneImage(shown, cast, period, style));
      img.streak = 0;
      return f;
    } catch (e) {
      if (e.manualImage) return null;
      // No credit is not a per-image problem: stop instead of filling a whole video with fallbacks.
      // Except in an archive-led video, where AI pictures are seasoning: the scene borrows a real frame.
      if (e.quota && archiveLed) {
        if (!warnings.aiQuota) log(`UYARI: ${String(e.message).split(' — ')[0]} — arşiv ağırlıklı video: AI isteyen sahneler gerçek/ödünç kareyle sürüyor`);
        warnings.aiQuota = true;
        return null;
      }
      if (e.cancelled || e.quota) throw e;
      if (!e.moderation) {
        noteFailure(e, where);
        return null;
      }
      if (!e.remembered) log(`görsel güvenlik filtresine takıldı${where}, yumuşatılmış istemle deneniyor: ${String(e.message).slice(0, 120)}`);
    }
    const soft = softenPrompt(shown);
    const tries = [() => sceneImage(soft, cast, period, style)];
    if (IMG === 'openai' && RP_KEY) tries.push(() => fluxFallback(soft, cast, period, style));
    for (const make of tries) {
      try {
        const f = liftIfDark(await make());
        img.streak = 0;
        softened.add(i);
        return f;
      } catch (e) {
        if (e.cancelled || (e.quota && !archiveLed)) throw e;
        if (!e.moderation) {
          noteFailure(e, where);
          return null;
        }
      }
    }
    log(`görsel${where} yumuşatılmış istemle de reddedildi; sahne başka bir sahnenin görselini kullanacak`);
    return null;
  }

  /*
   * Archive/stock footage (docu-archive.js, `media: "video"` scenes): `video` is
   * an H.264 file under the public dir, `image` a still of it. The clip must be
   * where the composition reads it (the archive step writes into this video's
   * public dir; a shared cache is checked too), its length and size known, and
   * a still must exist — the still is what collage boards, chapter cards, the
   * borrow pass and the thumbnail use, and a scene with a picture is never sent
   * to the image model. A clip that cannot be found falls back to its still (or
   * to the normal picture path when there is none); the clip itself is never
   * lifted, re-encoded or deleted here.
   */
  prepareSceneVideos(script, { PUBLIC, CACHE, BUILD, ff, ffOut, log });

  /*
   * Era audit fix (Nova docu-era-audit.js): an AI picture found to show modern
   * things carries `aiFix`, a note appended to its prompt only when present —
   * the prompt (and so the image key) changes and the picture is made once more.
   * Folded in here and dropped, so it never reaches the sound or chunk keys.
   */
  for (const sc of script.scenes) {
    if (sc.aiFix && sc.imagePrompt) sc.imagePrompt = `${sc.imagePrompt}. ${sc.aiFix}`;
    delete sc.aiFix;
    for (const p of sc.imagePrompts ?? []) {
      if (!p || typeof p !== 'object' || !('aiFix' in p)) continue;
      if (p.aiFix && p.prompt) p.prompt = `${p.prompt}. ${p.aiFix}`;
      delete p.aiFix;
    }
  }

  const GENRE_LOOK = genrePrompts(script.genre);
  /*
   * AI is the exception, not the default: real photos (archive/stock) first,
   * text scenes over the previous photo (bg:'prev'). If a script still asks for
   * more generated pictures than the cap (archive misses fall back to AI too),
   * the cheapest-to-lose ones give theirs up first — text/slam backgrounds sit
   * on the previous photo; photo/title scenes get the picture of a scene about
   * the same thing (the borrow pass below: far away, another stretch of its
   * footage or another crop of its still), or their own AI picture after all
   * when nothing fits. Cuts are spread evenly over the video (every k-th
   * candidate), not all taken from its end.
   */
  /*
   * Edit devices that draw their own picture — board, split, timeline, a
   * typed document (`doc`), a quote on an earlier scene's portrait
   * (`fromScene`) — and maps never get a picture of their own: no AI prompt,
   * no bg:'prev'/'next' hold, not counted by the cap, never borrowed for.
   */
  for (const sc of script.scenes) {
    if (!noOwnPicture(sc)) continue;
    delete sc.imagePrompt;
    if (sc.bg === 'prev' || sc.bg === 'next') delete sc.bg;
  }
  const AI_CAP = Math.max(0, o.maxAiImages ?? 22);
  /** The prompt a photo/title scene gave up to the cap (never serialized). */
  const capPrompt = new WeakMap();
  /** Already paid for (same key as sceneImage): counts toward the cap but is never the one cut — a re-render costs nothing. */
  const aiCached = (asked, cast = [], i = -1) => {
    // The prompt safeImage asks with (stillPromptAt, then a real cast member's face hidden): its key is the cached one.
    const prompt = hideRealFace(stillPromptAt(asked, i), cast.filter((n) => REAL.has(n)));
    const people = cast.filter((n) => script.cast?.[n]).map((n) => `${n}: ${script.cast?.[n] ?? ''}`).join('; ');
    return fileOk(join(PUBLIC, `${BUILD}/img-${hash(`${OAI_KEYS ? 'oai|' : ''}img|${prompt}|${people}|${STYLE}`)}.jpg`));
  };
  const aiWanted = () => script.scenes.reduce((n, sc) => n + (sc.imagePrompt && !sc.image && !sc.bg ? 1 : 0)
    + (sc.imagePrompts ?? []).filter((p) => !(typeof p === 'object' && p?.image)).length, 0);
  if (aiWanted() > AI_CAP) {
    const before = aiWanted();
    // Photo scenes are never cut: a borrowed picture under a photo line was the Napoleon QA's
    // mismatch list (Smolensk's walls for "the golden domes of Moscow", a letter for the Berezina).
    for (const kinds of [['words', 'slam'], ['title']]) {
      const cands = script.scenes.map((sc, i) => ({ sc, i }))
        // The first and the last picture are the film's frame (Napoleon ended 13 s on a borrowed letter).
        .filter(({ sc, i }) => i > 0 && i < script.scenes.length - 1 && kinds.includes(sc.type) && !sc.image && sc.imagePrompt && !sc.bg && !aiCached(sc.imagePrompt, sc.cast ?? [], i) && !(sc.cast?.length && sc.type === 'photo'));
      const need = Math.min(cands.length, aiWanted() - AI_CAP);
      if (need <= 0) continue;
      // Evenly spaced picks across the video: keeps AI pictures in every chapter.
      const pick = new Set(Array.from({ length: need }, (_, k) => Math.floor(((k + 0.5) * cands.length) / need)));
      for (const k of pick) {
        const { sc } = cands[k];
        // Kept: when no other scene's picture fits this one, the cap gives way for it (borrow pass).
        capPrompt.set(sc, sc.imagePrompt);
        delete sc.imagePrompt;
        if (sc.type === 'words' || sc.type === 'slam') sc.bg = 'prev';
        else sc.capped = true; // photo/title: a fitting picture from another scene, or AI over the cap (below)
      }
    }
    log(`AI görsel tavanı ${AI_CAP}: ${before} → ${aiWanted()} (yazı sahneleri önceki fotoğrafta; fotoğraf sahneleri anlatıma uyan başka bir karede, uyan yoksa tavan üstü AI)`);
  }
  const jobsImg = script.scenes.map((scene, i) => ({ scene, i }));
  let doneImg = 0;
  await pool(jobsImg, CONC, async ({ scene, i }) => {
    let failed = false;
    if (scene.imagePrompt && !scene.image && !scene.bg) {
      scene.image = (await safeImage(scene.imagePrompt, scene.cast ?? [], i)) ?? undefined;
      if (!scene.image) failed = true;
    }
    // Real archive photos get the same dark-image lift as generated ones (before depth, so layers are cut from it).
    // A footage scene's still is lifted too (it stands in for the clip on boards and cards), and the clip
    // gets the same gamma on screen (scene.liftGamma -> fx.tsx clipOf): dark stock never plays near-black.
    if (scene.archived && scene.image) {
      try {
        // A re-run sees the lifted name: measure the original again for the clip's gamma.
        const orig = scene.image.replace(/\.lift\.jpg$/, '.jpg');
        if (orig === scene.image || (scene.video && fileOk(join(PUBLIC, orig)))) scene.image = liftIfDark(orig);
        if (scene.video && liftedGamma.has(scene.image)) scene.liftGamma = liftedGamma.get(scene.image);
      } catch (e) {
        log(`arşiv görseli açılamadı, olduğu gibi kullanılıyor: ${e.message.slice(0, 100)}`);
      }
      // Arşiv adımı bayrağı yazmadıysa (eski iş): gerçek resim burada, diskte ölçülür; renkliyse bayrak konmaz.
      if (scene.monoSource === undefined) {
        try {
          const orig = scene.image.replace(/\.lift\.jpg$/, '.jpg');
          const src = fileOk(join(PUBLIC, orig)) ? orig : scene.image;
          const out = ffOut(['-hide_banner', '-i', join(PUBLIC, src), '-frames:v', '1', '-an', '-vf', 'scale=96:-2,signalstats,metadata=mode=print', '-f', 'null', '-']);
          if (monoFromSignalstats(out) === true) {
            scene.monoSource = true;
            log(`siyah-beyaz arşiv kaynağı: ${basename(src)}`);
          }
        } catch {
          // ölçülemedi: renkli sayılır
        }
      }
    }
    if (scene.imagePrompts?.length) {
      const imgs = [];
      // clips[k] plays over images[k] (null: the picture stays a still) — kept in lockstep with imgs.
      const clips = [];
      for (const p of scene.imagePrompts) {
        const { prompt, cast = [], image: found } = typeof p === 'string' ? { prompt: p } : p;
        // A montage shot the archive/stock search already found: the real photo (or footage and its still), no AI.
        if (found && fileOk(join(PUBLIC, found))) {
          imgs.push(found);
          clips.push(clipOf(p, found));
          continue;
        }
        const f = await safeImage(prompt, cast, i);
        if (f) {
          imgs.push(f);
          clips.push(null);
        } else failed = true;
      }
      scene.images = imgs;
      if (clips.some(Boolean)) scene.clips = clips;
      else delete scene.clips;
    }
    if (failed) warnings.fallbackImages.push(i);
    // A collage board shows photos as paper cards and never draws depth layers: no paid cutout for them.
    const onBoard = scene.type === 'photo' && GENRE_LOOK.collage && !scene.natural && !scene.fullBleed;
    if (scene.aiMotion && scene.image && (KL_KEY || RP_KEY) && !scene.video) {
      try {
        Object.assign(scene, await openingMotion(scene));
      } catch (e) {
        if (e.cancelled) throw e;
        log(`açılış hareketi yapılamadı, durağan resimle devam: ${String(e.message).slice(0, 120)}`);
      }
    }
    // Footage moves by itself: no paid cutout of its still. Depth layers are optional (o.depthLayers: Nova's setting, paid per scene).
    if (scene.depth && scene.image && RP_KEY && o.depthLayers !== false && !onBoard && !scene.video) {
      try {
        scene.layers = await depthLayers(scene.image);
      } catch (e) {
        if (e.cancelled) throw e;
        warnings.depthSkipped.push(i);
        log(`derinlik katmanı yapılamadı, düz fotoğrafla devam: ${e.message.slice(0, 120)}`);
      }
    }
    doneImg++;
    progress('images', (doneImg / jobsImg.length) * 35);
  });
  if (img.systemic >= 2 && img.systemic > img.calls * 0.1) throw stageError(img.last.why, img.last.e, `${img.systemic}/${img.calls} görsel`);

  /*
   * A scene whose picture could not be made (over the AI cap, or its picture
   * failed) gets one from another scene — chosen by what it SHOWS, not by how
   * near it is (planBorrows, below the main function): the scene whose
   * narration and search share its names and nouns (same chapter preferred),
   * never a picture on screen within ±60 s, never one lent twice; footage
   * first (another stretch of the clip reads as a new shot), else a still as a
   * different, tighter region of itself. With no fitting donor the scene
   * holds the previous picture as a text-less continuation when that picture
   * fits its line; else the AI cap gives way (at most +8 pictures); only then
   * any far, unused picture. The old pass took the scene two back — a
   * typewriter under "RCAF test pilot", 21 near-repeats in the Cooper QA.
   * Runs BEFORE the holds below, so a held scene holds the picture that is
   * really in front of it (the old order skipped a not-yet-borrowed neighbour
   * and held the picture two scenes back).
   */
  const own = script.scenes.map((sc) => sc.image ?? null);
  const needsPicture = (sc) => !sc.image && !sc.bg && !noOwnPicture(sc) && (!!sc.imagePrompt || sc.type === 'photo' || !!sc.capped);
  /** Scene → the donor scene whose clip it plays another stretch of (windows set once durations are final). */
  const clipBorrow = new WeakMap();
  /** Scene → { src, pre } for a held picture (bg 'prev'/'next'): a held clip continues its source's footage. */
  const heldFrom = new WeakMap();
  const need = script.scenes.map((sc, i) => (needsPicture(sc) ? i : -1)).filter((i) => i >= 0);
  const plan = planBorrows(script.scenes, { own, need, capPrompt: (sc) => capPrompt.get(sc) });
  let apply;
  {
    apply = (i, d) => {
      const sc = script.scenes[i];
      const donor = script.scenes[d.from];
      sc.image = own[d.from];
      sc.borrowed = true;
      delete sc.layers;
      delete sc.capped;
      // A caption names THIS scene's own picture ("Mehmed enters the city · Benjamin-Constant"):
      // on another scene's picture it mislabels it. A name card stays only on the same person.
      delete sc.caption;
      delete sc.credit;
      if (sc.name && sc.name !== donor.name) {
        delete sc.name;
        delete sc.role;
      }
      for (const k of VIDEO_FIELDS) delete sc[k];
      if (d.clip && donor.video) {
        for (const k of VIDEO_FIELDS) if (donor[k] !== undefined) sc[k] = donor[k];
        if (donor.archived) sc.archived = true;
        // Klibin siyah-beyaz bayrağı klibin başka bölümüyle gider (Gimli 9ff721, 29 Ekim 2026).
        if (donor.monoSource === true) sc.monoSource = true;
        else delete sc.monoSource;
        clipBorrow.set(sc, donor);
      } else borrowCrop(sc, donor);
      // A collage genre would pin the same print again: a borrowed photo is always full frame.
      if (sc.type === 'photo') sc.fullBleed = true;
      if (!warnings.borrowed.includes(i)) warnings.borrowed.push(i);
    };
    const toWords = (i) => {
      const sc = script.scenes[i];
      if (sc.type === 'photo') {
        sc.type = 'words';
        sc.text = sc.caption ?? sc.name ?? '';
      }
    };
    const said = (d) => `sahne ${d.i + 1}`;
    const extra = [];
    for (const d of plan.decisions) {
      const sc = script.scenes[d.i];
      if (d.kind === 'donor') {
        apply(d.i, d);
        log(`ödünç görsel: ${said(d)} ← sahne ${d.from + 1} (${d.clip ? 'klibin başka bir bölümü' : 'farklı kırpım'}; anlatım benzerliği ${d.aff.toFixed(2)})`);
      } else if (d.kind === 'hold') {
        // A text-less continuation of the shot in front of it: no caption or name card on someone else's picture.
        sc.bg = 'prev';
        delete sc.capped;
        delete sc.caption;
        delete sc.name;
        delete sc.role;
        log(`ödünç görsel: ${said(d)} uyan bir kare yok — önceki kare yazısız sürüyor (benzerlik ${d.aff.toFixed(2)})`);
      } else if (d.kind === 'ai') extra.push(d);
      else if (d.kind === 'loose' && d.from >= 0) {
        apply(d.i, d);
        log(`ödünç görsel: ${said(d)} ← sahne ${d.from + 1} (uyan kare yok, AI payı doldu; en az tekrar eden uzak kare, ${d.clip ? 'klibin başka bölümü' : 'farklı kırpım'})`);
      } else {
        toWords(d.i);
        log(`ödünç görsel: ${said(d)} için kullanılabilir kare yok — yazı sahnesine döndü`);
      }
    }
    // Over the cap, only for scenes no other picture fits (at most BORROW.extraAi).
    if (extra.length) {
      log(`AI görsel tavanı aşılıyor: ${extra.length} sahneye hiçbir kare uymuyor, kendi görseli üretiliyor (${extra.map((d) => d.i + 1).join(', ')})`);
      // These pictures are optional (a borrowed frame still fits the scene): an empty
      // balance here falls back to borrowing instead of failing an otherwise finished video.
      let noCredit = false;
      await pool(extra, CONC, async (d) => {
        const sc = script.scenes[d.i];
        if (noCredit) return;
        sc.imagePrompt = capPrompt.get(sc);
        try {
          sc.image = (await safeImage(sc.imagePrompt, sc.cast ?? [], d.i)) ?? undefined;
        } catch (e) {
          if (!e.quota) throw e;
          if (!noCredit) log(`tavan üstü AI görselleri durdu (bakiye yok); kalan sahneler ödünç kareyle sürüyor`);
          noCredit = true;
          sc.image = undefined;
        }
        if (sc.image) delete sc.capped;
      });
      for (const d of extra) {
        const sc = script.scenes[d.i];
        if (sc.image) continue;
        const l = plan.loose(d.i);
        if (l.from >= 0) {
          apply(d.i, l);
          log(`ödünç görsel: ${said(d)} ← sahne ${l.from + 1} (tavan üstü AI da üretilemedi)`);
        } else toWords(d.i);
      }
    }
  }
  /*
   * bg:'next' — the text arrives on the photo that comes next (a pre-lap),
   * where holding the previous photo again would freeze the picture too long.
   */
  script.scenes.forEach((sc, i) => {
    if (sc.bg !== 'next' || sc.image) return;
    for (let j = i + 1; j < script.scenes.length; j++) {
      const p = script.scenes[j];
      if (p.bg || !p.image) continue;
      sc.image = p.image;
      if (p.focus) sc.focus = p.focus;
      if (p.crop) sc.crop = p.crop;
      sc.heldBg = true;
      heldFrom.set(sc, { src: p, pre: true });
      return;
    }
    sc.bg = 'prev'; // nothing ahead (the closing scenes): hold the previous photo
  });
  /*
   * bg:'prev' — the text sits on the picture the viewer just saw (darkened by
   * the scene itself), the way a pro holds a shot under a key sentence instead
   * of cutting to a new picture for every line. Footage keeps rolling: the
   * held scene plays the clip on from where the scene before left it (set
   * once durations are final), never its opening still again.
   */
  script.scenes.forEach((sc, i) => {
    if (sc.bg !== 'prev' || sc.image) return;
    for (let j = i - 1; j >= 0; j--) {
      const p = script.scenes[j];
      const pic = p.image ?? (p.type === 'montage' ? p.images?.at(-1) : null);
      if (!pic) continue;
      sc.image = pic;
      if (p.focus) sc.focus = p.focus;
      if (p.crop && pic === p.image) sc.crop = p.crop;
      sc.heldBg = true;
      if (pic === p.image) heldFrom.set(sc, { src: p, pre: false });
      break;
    }
  });
  // A photo that asked to hold a picture with none in front of it (the opening scenes): a far, unused one.
  script.scenes.forEach((sc, i) => {
    if (sc.image || !sc.bg || sc.type !== 'photo' || noOwnPicture(sc)) return;
    delete sc.bg;
    const l = plan.loose(i);
    if (l.from >= 0) {
      apply(i, l);
      log(`ödünç görsel: sahne ${i + 1} ← sahne ${l.from + 1} (önünde tutulacak kare yoktu)`);
    } else {
      sc.type = 'words';
      sc.text = sc.caption ?? sc.name ?? '';
    }
  });
  const ownAll = script.scenes.map((sc) => sc.image ?? null);
  // A cold-open montage needs at least two pictures to cut between: fill it from the nearest scenes.
  script.scenes.forEach((sc, i) => {
    if (sc.type !== 'montage' || !sc.imagePrompts?.length || (sc.images?.length ?? 0) >= 2) return;
    const imgs = [...(sc.images ?? [])];
    // Pictures of the montage's own neighbours only as a last resort: they are on screen right before/after it.
    const near = new Set([ownAll[i - 1], ownAll[i + 1]].filter(Boolean));
    for (const allowNear of [false, true]) {
      for (let d = 1; d < ownAll.length && imgs.length < 2; d++) {
        for (const j of [i + d, i - d]) if (imgs.length < 2 && ownAll[j] && !imgs.includes(ownAll[j]) && (allowNear || !near.has(ownAll[j]))) imgs.push(ownAll[j]);
      }
    }
    if (imgs.length < 2) {
      if (img.last) throw stageError(img.last.why, img.last.e, 'açılış montajı için görsel');
      throw new Error('Açılış montajı için en az iki görsel gerekli, hiçbiri üretilemedi — senaryodaki görsel tariflerini kontrol edip "Kaldığı yerden devam et".');
    }
    sc.images = imgs;
    // Borrowed fill-ins are stills: clips[] stays aligned with images[].
    if (sc.clips) while (sc.clips.length < imgs.length) sc.clips.push(null);
    if (!warnings.borrowed.includes(i)) warnings.borrowed.push(i);
  });
  warnings.fallbackImages.sort((a, b) => a - b);
  warnings.borrowed.sort((a, b) => a - b);
  warnings.depthSkipped.sort((a, b) => a - b);
  warnings.refRefused = [...noRef];
  warnings.softenedImages = [...softened].sort((a, b) => a - b);
  guard();

  /* ========================================================= 2. chapter cards */

  const cards = insertChapterCards(script);
  if (cards) log(`bölüm kartları: ${cards}`);

  /*
   * Pixel size of every picture on screen (AI, archive, lifted, borrowed and
   * the chapter cards' reused ones): the composition picks contain vs cover,
   * caps the upscale and sizes a photo card from it.
   */
  const sizeOf = (file) => {
    try {
      const d = imageSize(readFileSync(file));
      if (d?.w > 0 && d?.h > 0) return d;
      // Unknown header (a format the parser does not read): ffmpeg reports the stream size.
      const m = ffOut(['-hide_banner', '-i', file], FF_PROBE_MS).match(/Video: .*?(\d{2,5})x(\d{2,5})/);
      return m ? { w: +m[1], h: +m[2] } : null;
    } catch {
      return null;
    }
  };
  const dims = new Map();
  for (const sc of script.scenes) {
    if (!sc.image) continue;
    if (!dims.has(sc.image)) dims.set(sc.image, sizeOf(join(PUBLIC, sc.image)));
    const d = dims.get(sc.image);
    if (d) {
      sc.imgW = d.w;
      sc.imgH = d.h;
    }
  }

  /* ============================================================= 3. narration */

  const VOICE = o.voiceId ?? script.voiceId ?? DEFAULT_VOICE;
  /*
   * eleven_v3 by default: it takes performance direction inline — [whispers],
   * [sighs], [dramatic] — and reads "..." as a real pause and CAPS as stress,
   * so a line can hold its breath before the reveal instead of being read flat.
   * Timestamps still come back (tags get timings too, but are silent and never
   * match a script word, so text sync is unaffected). v2 remains available via
   * "voiceModel" for a steadier read; tags are stripped for it.
   */
  const MODEL = o.voiceModel ?? script.voiceModel ?? 'eleven_v3';
  // v4 takes the same inline direction (tags, "...") plus continuous stability; the voice director
  // (voice-director.mjs) performs each line. v3 keeps its old reads (and its cached takes).
  const V4 = isV4(MODEL);
  const V3 = MODEL.startsWith('eleven_v3') || V4;
  /* A line with no direction of its own gets its scene's mood as a tag. */
  const MOOD_TAG = {
    curious: '[curious]',
    calm: '[warmly]',
    tension: '[quietly]',
    dread: '[whispers]',
    reveal: '[dramatic]',
    sad: '[sad]',
    triumph: '[confident]',
  };
  /*
   * v3 stability has three settings: 0 creative, 0.5 natural, 1 robust. Every
   * line is "natural" now: tension/dread/reveal used 0, which ElevenLabs itself
   * calls prone to hallucination, and the performance tag carries the emotion.
   */
  const V3_STABILITY = 0.5;

  function performance(scene) {
    const mood = scene.mood ?? 'curious';
    if (!V3) return scene.say.replace(/\[[^\]]*\]\s*/g, '').trim();
    return /^\s*\[/.test(scene.say) ? scene.say : `${MOOD_TAG[mood] ?? ''} ${scene.say}`.trim();
  }

  function wordsFromAlignment(a) {
    const out = [];
    let cur = '';
    let start = null;
    a.characters.forEach((ch, i) => {
      if (/\s/.test(ch)) {
        if (cur) out.push({ word: cur, t: start });
        cur = '';
        start = null;
      } else {
        if (start === null) start = a.character_start_times_seconds[i];
        cur += ch;
      }
    });
    if (cur) out.push({ word: cur, t: start });
    return out;
  }

  /*
   * Every line is its own request. Request stitching (previous_text /
   * next_text) keeps prosody continuous across requests, but ElevenLabs'
   * docs say it "is not available for the eleven_v3 model" — so only v2-style
   * models get their neighbours as context. `scene.take` (1, 2, ...) re-rolls
   * a bad read deterministically: it becomes the request seed and part of the
   * cache key; without it the key stays what it always was, so lines already
   * paid for stay cached.
   */
  // A source-voice scene (src/pipeline/source-clips.js) carries the person's OWN voice from the clip: no TTS for it.
  const voiced = script.scenes.filter((s) => s.say && !s.sourceVoice);
  // v4: the voice director performs every line knowing its neighbours (opening, punch lines, questions, chapter ends, reveals).
  // ChatGPT stills: the cutaways the film will need (lib/inserts.mjs) join this same list, on estimated voice
  // lengths — planned only after the voice, they were queued and skipped (Hastings hook: three 5-7 s holds).
  if (MANUAL && o.inserts !== false) {
    for (const p of insertPicturesAhead(script)) for (const pr of p.prompts) await safeImage(pr, [], p.i);
  }
  // Stills waiting in the ChatGPT inbox: stop here with the list (voice and render would be wasted).
  if (manualImages) {
    const left = writeList(INBOX);
    throw Object.assign(new Error(`${left} görsel ChatGPT'den bekleniyor — ${join(INBOX, 'LISTE.txt')} içindeki tarifleri ChatGPT'de üret, aynı klasöre numarasıyla (01.png, 02.png …) kaydet ve "Kaldığı yerden devam et". Yapılan her şey korunur.`), { manualImages: left });
  }
  const directed = V4 ? directLines(voiced, { model: MODEL }) : null;
  const lines = voiced.map((scene, k) => {
    const mood = MOODS[scene.mood ?? 'curious'] ?? MOODS.curious;
    const settings = V4
      ? { stability: directed[k].stability, similarity_boost: 0.8 }
      : V3
        ? { stability: V3_STABILITY }
        : { stability: mood.voice.stability, similarity_boost: 0.82, style: mood.voice.style, use_speaker_boost: true };
    const text = V4 ? directed[k].text : performance(scene);
    const take = Number.isInteger(scene.take) && scene.take > 0 ? scene.take : 0;
    // Request stitching keeps prosody continuous across lines (v4 and v2; v3 did not support it).
    const ctx = V3 && !V4 ? null : { previous_text: k > 0 ? stripTags(voiced[k - 1].say) : '', next_text: k < voiced.length - 1 ? stripTags(voiced[k + 1].say) : '' };
    const key = hash(`${VOICE}|${MODEL}|${JSON.stringify(settings)}|${text}${take ? `|take:${take}` : ''}${ctx ? `|ctx:${ctx.previous_text}|${ctx.next_text}` : ''}`);
    return { scene, text, settings, take, ctx, key };
  });
  const VOICE_DIR = 'voice';
  /** The cached take of a line, from the shared cache or (older jobs) this job's own folder. */
  function voiceMeta(key) {
    const meta = readJson(join(CACHE, `${VOICE_DIR}/${key}.json`));
    if (meta?.audio && fileOk(join(CACHE, meta.audio))) return meta;
    const legacy = readJson(join(PUBLIC, `${BUILD}/voice-${key}.json`));
    const mp3 = join(PUBLIC, `${BUILD}/voice-${key}.mp3`);
    if (legacy?.words && !legacy.audio && fileOk(mp3)) {
      // Paid for by an earlier run of this job: move it into the shared cache.
      const audio = `${VOICE_DIR}/${key}.mp3`;
      linkOrCopy(mp3, join(CACHE, audio));
      const m = { dur: legacy.dur, words: legacy.words, audio };
      writeAtomic(join(CACHE, `${VOICE_DIR}/${key}.json`), JSON.stringify(m));
      return m;
    }
    return null;
  }

  /*
   * Which paths will spend ElevenLabs credits in this run. With a library the
   * score is cut from licensed tracks; without one — or when the library has
   * nothing usable for documentaries — ElevenLabs composes it.
   */
  let libScore = !!LIB && MUSIC_SOURCE === 'library' && LIB.music.length > 0;
  /*
   * A library that has music but no track this story may hear (the serious pool is a hard filter that fails closed:
   * untagged tracks never pass) stops the job: it is NEVER silently composed on paid ElevenLabs credit (owner's rule:
   * ElevenLabs is for narration; spending needs approval). Composition only when the music source says 'eleven'.
   */
  if (libScore) {
    const probe = planScore({ script, lib: LIB, root: LIB_ROOT, genre: script.genre, seed: SEED_KEY, history: MUSIC_PRIOR, selector: MUSIC_SELECTOR });
    if (!probe.cues?.some((c) => c.trackId)) {
      for (const n of probe.notes ?? []) log(n);
      throw new Error(`müzik: kütüphanede bu hikâyeye (${probe.gravity ?? '?'}) uygun parça yok${probe.reason ? ` (${probe.reason})` : ''} — ücretli besteye geçilmedi; kütüphaneyi etiketleyin ya da müzik kaynağını açıkça 'eleven' yapın`);
    }
  }

  /*
   * Credit preflight, right before the first paid voice line. docu.js checks
   * the whole video before images; this is the last gate before ElevenLabs
   * spends, counted on exactly the lines that are not cached yet (tags are
   * billed too), so a resumed job is not stopped by lines it already paid for.
   * When nothing is left to pay for, the check is skipped.
   */
  {
    const need = { voice: 0, music: 0, ambience: 0, sfx: 0 };
    for (const l of lines) if (!voiceMeta(l.key)) need.voice += l.text.length;
    if (!libScore && !readdirSafe(join(PUBLIC, BUILD)).some((f) => /^music-/.test(f))) {
      const perWord = /^en/i.test(script.locale ?? '') ? 0.41 : 0.47;
      const sec = script.scenes.reduce((a, s) => a + Math.max(s.dur ?? 0, (s.voiceDur ?? stripTags(s.say).split(' ').filter(Boolean).length * perWord) + 0.4), 0);
      need.music = Math.round(((sec + 3 + 2 * Math.floor(sec / 240)) / 60) * MUSIC_CREDITS_PER_MIN);
    }
    if (!LIB) {
      for (const text of new Set(script.scenes.map((s) => bedPrompt(s)).filter(Boolean))) if (!fileOk(join(CACHE, bedFile(text)))) need.ambience += BED_SECONDS * 40;
      if (readdirSafe(join(CACHE, 'sfx', script.genre), true).length < 10) need.sfx = 1300;
    }
    const total = need.voice + need.music + need.ambience + need.sfx;
    if (total > 0) {
      let left = null;
      try {
        left = await elevenRemaining();
      } catch (e) {
        log(`ElevenLabs kredisi okunamadı (${e.message}); ön denetim atlandı`);
      }
      if (left !== null) {
        const names = { voice: 'ses', music: 'müzik', ambience: 'ortam', sfx: 'efekt' };
        const detail = Object.entries(need).filter(([, v]) => v > 0).map(([k, v]) => `${names[k]} ${fmtN(v)}`).join(' + ');
        log(`ElevenLabs: ~${fmtN(total)} kredi gerekli (${detail}), ${fmtN(left)} kalan`);
        if (left < total) {
          throw Object.assign(
            new Error(`ElevenLabs kredisi yetmiyor: ~${fmtN(total)} gerekli (${detail}), ${fmtN(left)} kalan — kredi yükleyip "Kaldığı yerden devam et". Görseller kaydedildi, yeniden ödenmez.`),
            { quota: true },
          );
        }
      }
    }
  }

  /*
   * A take that reads far too fast or too slow (v3 sometimes rushes a line or
   * stretches it with invented pauses) is re-rolled once with another seed —
   * at most 5% of lines, so a strange script cannot turn into a re-roll storm.
   * The better of the two takes is kept and cached.
   */
  const spokenLen = (text) => stripTags(text).length;
  const cps = (l, m) => spokenLen(l.text) / Math.max(0.1, m.dur);
  const badTake = (l, m) => spokenLen(l.text) >= 25 && (cps(l, m) < 8 || cps(l, m) > 22);
  const maxRerolls = Math.max(1, Math.floor(lines.length * 0.05));
  let rerolls = 0;
  let hiFi = true;
  /*
   * THE NARRATION'S LANGUAGE IS ENFORCED (Panama, Oct 2026: "ses arada İspanyolcaya kayıyor"). The multilingual model
   * guesses each line's language on its own; a line full of Spanish place names (Penonomé, Chitré, Los Santos, Coclé)
   * was read as Spanish. The script's locale goes with every line; a model that rejects language enforcement gets
   * the line again without it, once, and the rest of the run skips it.
   */
  let langCode = (/^([a-z]{2})\b/i.exec(script.locale ?? '') || [])[1]?.toLowerCase() || null;
  const ttsCall = async (path, body) => {
    try {
      return await el(path, langCode ? { ...body, language_code: langCode } : body, { timeoutMs: 120_000 });
    } catch (e) {
      if (!langCode || e.formatRejected || e.quota || !(e.status >= 400 && e.status < 500) || !/language/i.test(String(e.message))) throw e;
      log(`ElevenLabs ${MODEL} dil zorlamasını kabul etmedi (${langCode}); dil kodsuz devam`);
      langCode = null;
      return el(path, body, { timeoutMs: 120_000 });
    }
  };
  /*
   * READ SPEED (1.16.16): our narrators read ~115-125 wpm; pace.mjs alone reaches ~135 (El Niño) and the
   * outliers speak ~157-165. New takes are asked at ElevenLabs' own speed (1.1x reads naturally; atempo then has
   * less to do). Not part of the cache key: takes already paid for stay cached and pace.mjs still tightens them.
   * A slow or hushed direction keeps 1.0. o.voiceSpeed (0.9-1.2) overrides; 1 turns it off. A model that rejects
   * the setting gets the line again without it, once, and the rest of the run skips it.
   */
  let voiceSpeed = Number.isFinite(Number(o.voiceSpeed)) && o.voiceSpeed !== null && o.voiceSpeed !== '' ? Math.min(1.2, Math.max(0.9, Number(o.voiceSpeed))) : VOICE_SPEED;
  const speedOf = (l) => (voiceSpeed !== 1 && !SLOW_DIRECTION.test(l.text) ? voiceSpeed : 1);
  async function speak(l, rel, seed) {
    const sp = speedOf(l);
    const body = { text: l.text, model_id: MODEL, voice_settings: sp !== 1 ? { ...l.settings, speed: sp } : l.settings };
    const unspeed = (e) => {
      if (sp === 1 || e.quota || !(e.status >= 400 && e.status < 500) || !/speed/i.test(String(e.message))) return false;
      log(`ElevenLabs ${MODEL} okuma hızını kabul etmedi (${sp}x); hız ayarsız devam`);
      voiceSpeed = 1;
      body.voice_settings = l.settings;
      return true;
    };
    if (seed !== undefined) body.seed = seed;
    if (l.ctx?.previous_text) body.previous_text = l.ctx.previous_text;
    if (l.ctx?.next_text) body.next_text = l.ctx.next_text;
    let j;
    try {
      // 192 kbps instead of the 128 kbps default: the narration is transcoded twice more before YouTube.
      j = await ttsCall(`/v1/text-to-speech/${VOICE}/with-timestamps${hiFi ? '?output_format=mp3_44100_192' : ''}`, body);
    } catch (e) {
      if (unspeed(e)) j = await ttsCall(`/v1/text-to-speech/${VOICE}/with-timestamps${hiFi ? '?output_format=mp3_44100_192' : ''}`, body);
      else if (!e.formatRejected) throw e;
      else {
        hiFi = false;
        log('192 kbps ses bu abonelikte yok; varsayılan biçimle devam');
        j = await ttsCall(`/v1/text-to-speech/${VOICE}/with-timestamps`, body);
      }
    }
    writeAtomic(join(CACHE, rel), Buffer.from(j.audio_base64, 'base64'));
    const a = j.alignment;
    // v4's descriptive tags are several words ("[low, hushed voice]"): their characters are dropped
    // from the word timings so a tag word can never be taken for a script word ("Last voice, 01:19").
    return { dur: a.character_end_times_seconds.at(-1), words: wordsFromAlignment(V4 ? untagAlignment(a) : a), audio: rel, ...(seed !== undefined ? { seed } : {}) };
  }
  const seedOf = (n) => (SEED * 7919 + n * 104729) % 4294967295;

  /*
   * Levelled narration: v3 tags swing a line from -16 LUFS ([warmly]) to
   * -22.7 ([quietly]) — a 6.7 dB jump between neighbouring scenes. Every line
   * is measured and brought to the narrator level, with small intended
   * offsets (a whisper stays a little quieter, a reveal a little prouder),
   * then run through the broadcast chain (sound-craft.mjs processVoice:
   * 70 Hz high-pass, low-mid cleanup, presence, de-esser, ~2-3 dB bus
   * compression), trimmed back onto the target, soft-limited at -1.5 dBFS
   * and written as 48 kHz WAV.
   */
  const voiceOffset = (l) => (/\[(whispers?|quietly|softly)\]/i.test(l.text) ? -1.5 : /\[(dramatic|shouts?|excited)\]/i.test(l.text) || l.scene.mood === 'reveal' ? 1 : 0);
  const levelled = [];
  function levelVoice(src, dst, target, edit = '') {
    const r = processVoice({ bin: FFMPEG, src, dst, target, edit });
    if (r.before.I !== null) levelled.push(r.before.I);
  }

  /*
   * NARRATION PACE (pace.mjs, 1.16.16): the outliers speak ~165 wpm, our takes read 123-146. Silences are
   * found once per take (cached next to it); o.pace === false keeps every take as it was.
   */
  const PACE_OPTS = o.pace === false ? null : { ...(o.paceTargetWpm > 0 ? { targetWpm: o.paceTargetWpm } : {}), ...(o.paceMaxTempo >= 1 ? { maxTempo: Math.min(1.25, o.paceMaxTempo) } : {}) };
  const paced = [];
  function paceOf(l, meta) {
    if (!PACE_OPTS || ['montage', 'title'].includes(l.scene.type) || !(meta.dur > 0)) return null;
    const silFile = join(CACHE, `${meta.audio}.sil.json`);
    let sil = null;
    try {
      sil = JSON.parse(readFileSync(silFile, 'utf8'));
    } catch {}
    if (!Array.isArray(sil)) {
      try {
        sil = detectSilences(FFMPEG, join(CACHE, meta.audio), meta.dur);
        try {
          writeAtomic(silFile, JSON.stringify(sil));
        } catch {}
      } catch (e) {
        // A scan killed at its deadline: this run re-times the line by tempo only, and nothing is cached (the next run scans again).
        log(`sessizlik taraması yapılamadı, satır yalnız tempoyla (${String(e?.message ?? e).slice(0, 80)}): "${l.text.slice(0, 50)}"`);
        sil = [];
      }
    }
    const plan = pacePlan({ silences: sil, dur: meta.dur, text: l.text, opts: PACE_OPTS });
    return paceIdentity(plan) ? null : plan;
  }
  let doneVoice = 0;
  await pool(lines, Math.min(CONC, 3), async (l) => {
    let meta = voiceMeta(l.key);
    if (!meta) {
      log(`seslendirme (${MODEL}): "${l.text.slice(0, 70)}"`);
      meta = await speak(l, `${VOICE_DIR}/${l.key}.mp3`, l.take ? seedOf(l.take) : undefined);
      writeAtomic(join(CACHE, `${VOICE_DIR}/${l.key}.json`), JSON.stringify(meta));
      if (badTake(l, meta) && rerolls < maxRerolls) {
        rerolls++;
        try {
          const alt = await speak(l, `${VOICE_DIR}/${l.key}-r1.mp3`, seedOf(l.take + 1));
          const better = Math.abs(cps(l, alt) - 14) < Math.abs(cps(l, meta) - 14);
          log(`seslendirme yeniden alındı (${cps(l, meta).toFixed(1)} → ${cps(l, alt).toFixed(1)} harf/sn, ${better ? 'yenisi' : 'ilki'} kullanılıyor): "${l.text.slice(0, 50)}"`);
          if (better) {
            meta = { ...alt, reroll: 1 };
            writeAtomic(join(CACHE, `${VOICE_DIR}/${l.key}.json`), JSON.stringify(meta));
          }
        } catch (e) {
          if (e.cancelled || e.quota) throw e;
          log(`seslendirme yeniden alınamadı, ilk okuma kullanılıyor: ${e.message.slice(0, 120)}`);
        }
      }
    }
    // Pace (pace.mjs): long pauses inside the take shortened, a slow read played up to 1.15x — word times follow.
    const pace = paceOf(l, meta);
    const edit = paceFilter(pace);
    const tag = `${VOICE_NORM}-${hash(`${meta.audio}|${voiceOffset(l)}${edit ? `|${edit}` : ''}`).slice(0, 6)}`;
    const wav = `${VOICE_DIR}/${l.key}-${tag}.wav`;
    if (!fileOk(join(CACHE, wav))) levelVoice(join(CACHE, meta.audio), join(CACHE, wav), VOICE_LUFS + voiceOffset(l), edit);
    l.scene.voice = publishAs(wav, `${BUILD}/voice-${l.key}-${tag}.wav`);
    // docu.js counts these to know how much narration a re-render gets for free.
    if (CACHE !== PUBLIC) publishAs(`${VOICE_DIR}/${l.key}.json`, `${BUILD}/voice-${l.key}.json`);
    l.scene.voiceDur = paceIdentity(pace) ? meta.dur : pace.dur;
    l.scene.wordTimes = paceWords(pace, meta.words);
    if (!paceIdentity(pace)) paced.push([meta.dur, pace.dur]);
    doneVoice++;
    progress('voice', 35 + (doneVoice / Math.max(1, lines.length)) * 10);
  });
  guard();
  /*
   * SOURCE VOICE (1.16.19, source-clips.js): the person's own words from a real clip (Base Central opened on Mickey
   * Rourke's own video). The clip's audio is levelled like a narration line and plays as this scene's voice; the
   * quote's words are spread over its length for the captions and the subtitle.
   */
  for (const sc of script.scenes) {
    if (!sc.sourceVoice?.file) continue;
    const src = join(PUBLIC, sc.sourceVoice.file);
    if (!fileOk(src)) {
      log(`kaynak ses bulunamadı, sahne sessiz anlatımsız kalır: ${sc.sourceVoice.file}`);
      delete sc.sourceVoice;
      continue;
    }
    const tag = hash(`${sc.sourceVoice.file}|src|${VOICE_NORM}`).slice(0, 8);
    const wavRel = `${VOICE_DIR}/src-${tag}.wav`;
    if (!fileOk(join(CACHE, wavRel))) levelVoice(src, join(CACHE, wavRel), VOICE_LUFS);
    sc.voice = publishAs(wavRel, `${BUILD}/voice-src-${tag}.wav`);
    sc.voiceDur = Math.max(0.5, Number(sc.sourceVoice.dur) || 4);
    const ws = String(sc.say || '').split(/\s+/).filter(Boolean);
    sc.wordTimes = ws.map((word, k) => ({ word, t: +((k / Math.max(1, ws.length)) * sc.voiceDur * 0.95).toFixed(3) }));
    log(`kaynak ses: "${String(sc.say).slice(0, 60)}" (${sc.voiceDur.toFixed(1)} sn, kişinin kendi sesi)`);
  }
  /*
   * NATURAL SOUND (1.16.21, channel owner: "orada gibi"): a real event clip keeps its own sound — the crowd, the
   * siren, the glass — levelled well under the narration (NAT_LUFS) and played from the scene's start for as long as
   * the clip runs. Added to the event cues once the sound design has placed its own (script._natCues).
   */
  script._natCues = [];
  script.scenes.forEach((sc, i) => {
    if (!sc.natSound?.file) return;
    const src = join(PUBLIC, sc.natSound.file);
    if (!fileOk(src)) return;
    const tag = hash(`${sc.natSound.file}|nat|${NAT_LUFS}`).slice(0, 8);
    const rel = `${VOICE_DIR}/nat-${tag}.wav`;
    try {
      if (!fileOk(join(CACHE, rel))) processVoice({ bin: FFMPEG, src, dst: join(CACHE, rel), target: NAT_LUFS });
    } catch {}
    if (!fileOk(join(CACHE, rel))) return;
    const dur = Math.min(Number(sc.natSound.dur) || 6, (Number(sc.voiceDur) || Number(sc.dur) || 4) + 0.4);
    script._natCues.push({ scene: i, at: 0, file: publishAs(rel, `${BUILD}/nat-${tag}.wav`), dur: +dur.toFixed(2), gain: 1, nat: true });
  });
  if (script._natCues.length) log(`doğal ses: ${script._natCues.length} gerçek klibin kendi sesi anlatımın altında`);
  if (paced.length) {
    const a = paced.reduce((n, [x]) => n + x, 0);
    const b = paced.reduce((n, [, y]) => n + y, 0);
    log(`anlatım temposu: ${paced.length} satır sıkılaştı (${a.toFixed(0)} → ${b.toFixed(0)} sn; uzun duraklar kısaldı, yavaş okuma en çok ${PACE_OPTS?.maxTempo ?? 1.15}x)`);
  }
  if (levelled.length > 1) log(`anlatım seviyesi: ${levelled.length} satır ${Math.min(...levelled).toFixed(1)}…${Math.max(...levelled).toFixed(1)} LUFS → ${VOICE_LUFS} LUFS`);

  /*
   * Cutaways on the climax lines (lib/inserts.mjs): now that the words have times, a new
   * full-frame picture of the same moment cuts in on a spoken word. AI pictures, cached by prompt
   * like every other, so a re-render pays nothing; a picture that fails just leaves the line as it was.
   */
  if (o.inserts !== false) {
    const plan = planInserts(script);
    let made = 0;
    // A collage genre shows a small or odd-shaped still as a print on a board, where cutaways are never drawn:
    // no new pictures for those (they would be paid for and never seen). Irkutsk remake, Oct 2026.
    const boardOnly = (sc) => COLLAGE_GENRES.has(script.genre) && isLowResStill(sc.imgW, sc.imgH);
    await pool(plan.filter((p) => !boardOnly(script.scenes[p.i])), CONC, async (p) => {
      const sc = script.scenes[p.i];
      const ins = [];
      for (let k = 0; k < p.at.length; k++) {
        let file = null;
        try {
          file = await safeImage(p.prompts[k], [], p.i);
        } catch (e) {
          if (e?.cancelled) throw e;
        }
        // ChatGPT inbox: the line's every cutaway is listed now — breaking after the first missing one asked for the
        // second only on the NEXT resume (Saudi–Houthi news, Oct 2026: two stops for one line). Paid providers
        // still stop at the first failure.
        if (!file) { if (MANUAL) continue; break; }
        const d = sizeOf(join(PUBLIC, file));
        ins.push({ src: file, at: p.at[k], ...(d ? { imgW: d.w, imgH: d.h } : {}) });
      }
      if (ins.length) {
        sc.inserts = ins;
        made += ins.length;
      }
    });
    guard();
    if (made) log(`ara planlar: ${plan.length} doruk satırına ${made} yeni kare (anahtar kelimede kesme)`);
    // A cutaway the voice made necessary that the estimate did not foresee: the render waits for it too (the voice
    // is cached, the resume costs nothing) — never a silent skip.
    if (MANUAL && manualImages) {
      const left = writeList(INBOX);
      throw Object.assign(new Error(`${left} ara plan görseli ChatGPT'den bekleniyor — ${join(INBOX, 'LISTE.txt')} içindeki tarifleri ChatGPT'de üret, aynı klasöre numarasıyla kaydet ve "Kaldığı yerden devam et". Seslendirme kayıtlı, yeniden ödenmez.`), { manualImages: left });
    }
  }
  // A plain line ends with its voice (no dead air after the narration), then a line that must land keeps a breath.
  {
    const tv = tightenToVoice(script);
    if (tv.scenes) log(`tempo: ${tv.scenes} sahne sesine göre kısaldı (−${tv.saved} sn ölü süre)`);
    const br = applyBreath(script);
    if (br.scenes) log(`nefes: ${br.scenes} satırdan sonra ek sessizlik (+${br.added} sn)${br.windows ? `, ${br.windows} müzik penceresi` : ''}`);
  }

  for (const sc of script.scenes) {
    if (sc.type === 'montage') sc.dur = Math.max(sc.dur, (sc.imagePrompts?.length ?? 0) * 0.42 + 1.2);
  }
  const sceneSeconds = script.scenes.map((sc) => Math.max(sc.dur, (sc.voiceDur ?? 0) + 0.4));
  const estSeconds = sceneSeconds.reduce((a, b) => a + b, 0);
  log(`tahmini süre: ${estSeconds.toFixed(1)} sn`);
  // The last free gate: the script gate before any payment is an estimate, this one uses the real voice.
  if (o.minSeconds > 0 && estSeconds < o.minSeconds) {
    throw new Error(
      `Seslendirilmiş video kısa: ${fmtMin(estSeconds)} (hedef ≥ ${fmtMin(o.minSeconds)}). Sesler kaydedildi, yeniden ödenmez — senaryoyu uzatıp "Kaldığı yerden devam et". Müzik ve render adımına geçilmedi.`,
    );
  }

  /* ================================================================= 4. music */

  const GLOBAL_STYLES = {
    documentary: ['cinematic documentary score', 'hybrid orchestral', 'modern pulsing synths', 'high-end production', 'emotional'],
    finance: ['dark financial thriller score', 'electronic', 'deep synth bass', 'tense', 'high-end production'],
    horror: ['horror documentary underscore', 'atmospheric', 'dissonant', 'dread', 'high-end production'],
    crime: ['true crime documentary score', 'dark ambient', 'pulsing', 'investigative', 'high-end production'],
    epic: ['epic historical score', 'orchestral', 'war drums', 'choir', 'high-end production'],
    science: ['space documentary score', 'ambient electronic', 'awe', 'expansive', 'high-end production'],
    inspire: ['inspirational biography score', 'piano and strings', 'hopeful', 'emotional', 'high-end production'],
  };
  const CHAPTER_MS = 240_000;
  const XFADE = 2;

  /**
   * The score as composition plans: consecutive scenes with the same mood
   * become one section, sized to those scenes. Sections under 3s are merged
   * into their neighbour (the API floor); `silence` scenes get a near-silent
   * section so the music itself drops out, not just the fader. A long video is
   * cut into chapters of at most four minutes — each one its own generation,
   * each with a 2s tail that the crossfade into the next chapter consumes, so
   * the joined score is exactly as long as the plan.
   */
  function compositionPlans() {
    const sections = [];
    script.scenes.forEach((sc, i) => {
      const mood = sc.silence ? 'silence' : sc.mood ?? 'curious';
      const ms = Math.round(sceneSeconds[i] * 1000);
      const last = sections.at(-1);
      if (last && last.mood === mood && last.ms + ms <= 110_000) last.ms += ms;
      else sections.push({ mood, ms });
    });
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].ms < 3000 && sections.length > 1) {
        const into = i > 0 ? i - 1 : i + 1;
        sections[into].ms += sections[i].ms;
        sections.splice(i, 1);
        i--;
      }
    }
    sections.at(-1).ms += 3000; // tail so the last scene never runs out of music
    const chapters = [[]];
    let acc = 0;
    for (const s of sections) {
      if (acc + s.ms > CHAPTER_MS && chapters.at(-1).length) {
        chapters.push([]);
        acc = 0;
      }
      chapters.at(-1).push(s);
      acc += s.ms;
    }
    return chapters.map((secs, ci) => {
      if (ci < chapters.length - 1) secs.at(-1).ms += XFADE * 1000;
      return {
        positive_global_styles: GLOBAL_STYLES[script.genre] ?? GLOBAL_STYLES.documentary,
        negative_global_styles: ['vocals', 'singing', 'lyrics', 'upbeat pop', 'cheesy', 'comedy'],
        sections: secs.map((s, i) => ({
          // Single-chapter names match the original engine so its music cache stays valid.
          section_name: chapters.length === 1 ? `${i + 1} ${s.mood}` : `${ci + 1}.${i + 1} ${s.mood}`,
          positive_local_styles:
            s.mood === 'silence'
              ? ['near silence', 'one sustained low tone', 'extremely sparse', 'holding breath']
              : MOODS[s.mood]?.music ?? MOODS.curious.music,
          negative_local_styles: ['vocals', 'singing'],
          duration_ms: Math.min(120_000, s.ms),
          lines: [],
        })),
      };
    });
  }

  /** ElevenLabs Music: one generation per four-minute part, cached in the shared cache. */
  async function composeScore() {
    const plans = compositionPlans();
    const parts = [];
    for (const [ci, plan] of plans.entries()) {
      guard();
      const key = hash(JSON.stringify(plan) + (script.musicPrompt ?? ''));
      const rel = `music/music-${key}.mp3`;
      const legacy = join(PUBLIC, `${BUILD}/music-${key}.mp3`);
      if (!fileOk(join(CACHE, rel)) && fileOk(legacy)) linkOrCopy(legacy, join(CACHE, rel));
      const secs = plan.sections.reduce((a, s) => a + s.duration_ms, 0) / 1000;
      if (!fileOk(join(CACHE, rel))) {
        log(`müzik ${ci + 1}/${plans.length} (${secs.toFixed(0)} sn): ${plan.sections.map((s) => s.section_name).join(' → ')}`);
        // 192 kbps when the subscription allows it; a refused format is not a refused composition plan.
        const music = async (body) => {
          try {
            return await el(`/v1/music${hiFi ? '?output_format=mp3_44100_192' : ''}`, body, { json: false, timeoutMs: 600_000 });
          } catch (e) {
            if (!e.formatRejected) throw e;
            hiFi = false;
            return el('/v1/music', body, { json: false, timeoutMs: 600_000 });
          }
        };
        let buf;
        try {
          buf = await music({ composition_plan: plan, respect_sections_durations: true });
        } catch (e) {
          if (e.status !== 422 && e.status !== 400) throw e;
          log('bölüm planlı müzik reddedildi, tek prompt ile deneniyor');
          warnings.musicPromptFallback = true;
          const prompts = genrePrompts(script.genre);
          buf = await music({ prompt: script.musicPrompt ?? prompts.music, music_length_ms: Math.ceil(secs) * 1000 });
        }
        writeAtomic(join(CACHE, rel), buf);
      }
      parts.push({ file: publishAs(rel, `${BUILD}/music-${key}.mp3`), secs });
      progress('music', 45 + ((ci + 1) / plans.length) * 10);
    }
    // Beat analysis windows: each part on its own, offset by the parts before minus their crossfades.
    const windows = [];
    let at = 0;
    for (const p of parts) {
      windows.push({ from: at, to: at + p.secs });
      at += p.secs - XFADE;
    }
    if (parts.length === 1) return { file: parts[0].file, windows };
    /*
     * Parts are separate generations with their own loudness (measured: -15.7
     * vs -14.6 LUFS, LRA 11.8 vs 4.1). Each is brought to one level before the
     * crossfade, so the seam is a change of music, not a jump in volume.
     */
    const gains = parts.map((p) => {
      const I = loudnessOf(join(PUBLIC, p.file)).I;
      return I === null ? 0 : clamp(-16 - I, -12, 12);
    });
    const file = `${BUILD}/music-joined-${hash(parts.map((p) => p.file).join('|') + `|lvl:${gains.map((g) => g.toFixed(1)).join(',')}`)}.wav`;
    if (!fileOk(join(PUBLIC, file))) {
      const inputs = parts.flatMap((p) => ['-i', join(PUBLIC, p.file)]);
      let chain = parts.map((_, k) => `[${k}:a]volume=${gains[k].toFixed(2)}dB[v${k}];`).join('');
      let prev = '[v0]';
      for (let k = 1; k < parts.length; k++) {
        const outLabel = k === parts.length - 1 ? '[m]' : `[x${k}]`;
        chain += `${prev}[v${k}]acrossfade=d=${XFADE}:c1=tri:c2=tri${outLabel};`;
        prev = outLabel;
      }
      const tmp = join(PUBLIC, `${file}.tmp.wav`);
      ff(['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', chain.replace(/;$/, ''), '-map', '[m]', '-f', 'wav', tmp], { timeout: ffDeadline(windows.at(-1).to) });
      renameSync(tmp, join(PUBLIC, file));
    }
    return { file, windows };
  }

  /*
   * The library score: the audio director plans cues (one per chapter and
   * real story turn) against the planned scene lengths and cuts them into ONE
   * file exactly as long as the video. Rendering is ffmpeg only — free — so
   * the file lives with the job and is rebuilt whenever the plan changes.
   */
  const DIRECTOR = hash(readFileSync(join(ENGINE_DIR, 'lib/audio-director.mjs')));
  /** `cuts`: the picture's cut times (s); cue changes then land on them (renderScore keeps each track's clock). */
  function libraryScore(plan, totalSec, cuts = null) {
    const rel = `${BUILD}/score-${hash(`${DIRECTOR}|${totalSec.toFixed(3)}|${JSON.stringify(plan.cues)}${cuts ? `|cuts:${cuts.map((c) => c.toFixed(3)).join(',')}` : ''}`)}.wav`;
    const side = join(PUBLIC, `${rel}.json`);
    const cached = readJson(side);
    if (cached && fileOk(join(PUBLIC, rel))) return { rel, ...cached };
    const r = renderScore({ plan, lib: LIB, root: LIB_ROOT, outFile: join(PUBLIC, rel), ff: FFMPEG, totalSec, cuts, log });
    writeAtomic(side, JSON.stringify({ musicCues: r.musicCues, cues: r.cues }));
    return { rel, musicCues: r.musicCues, cues: r.cues };
  }
  /** Credits for the tracks used (YouTube Audio Library tracks may require attribution); kunye.js prints them. */
  function creditsOf(musicCues) {
    return musicCues.map((c) => {
      const t = LIB.music.find((m) => m.title === c.title && (m.artist || undefined) === c.artist);
      const extra = t ? { file: basename(t.file), source: t.source, sourceUrl: t.sourceUrl ?? t.url, licenseUrl: t.licenseUrl } : {};
      return Object.fromEntries(Object.entries({ ...c, ...extra }).filter(([, v]) => v !== undefined && v !== null));
    });
  }

  /* The planned length, before beats: exactly the composition's length when there are none. */
  const frames = (placed) => placed.reduce((n, p) => n + p.frames, 0);
  const plannedSec = frames(placeTimeline(script.scenes, FPS, [])) / FPS;
  let musicFile;
  let windows;
  let libPlan = null;
  let score = null;
  /*
   * The beat grid of a library score depends only on the plan and its planned
   * length, so it is kept beside the job: a re-run (a new picture, a re-render)
   * finds it and never cuts the planned-length score again just to listen to it.
   */
  let beatsSide = null;
  let found = null;
  if (libScore) {
    // log: the plan's own warnings (thin pool, a death line with no mournful track left, a theme heard once).
    libPlan = planScore({ script, sceneSeconds, lib: LIB, root: LIB_ROOT, genre: script.genre, seed: SEED_KEY, history: MUSIC_PRIOR, selector: MUSIC_SELECTOR, log });
    const used = libPlan.cues.filter((c) => c.trackId);
    log(`müzik (kütüphane): ${used.length} ipucu, ${new Set(used.map((c) => c.trackId)).size} parça — ${used.slice(0, 6).map((c) => `${c.title} (${Math.round(c.toSec - c.fromSec)} sn)`).join(' · ')}${used.length > 6 ? ' …' : ''}`);
    if (readJson(MUSIC_MARK)?.selector !== (libPlan.selector ?? 'v1')) writeAtomic(MUSIC_MARK, JSON.stringify({ selector: libPlan.selector ?? 'v1' }));
    if (libPlan.selector !== 'v2') log(`müzik planı: eski seçici (v1) — bu işin resmi eski vuruş ızgarasına göre kesilmiş; yeni seçici için NOVA_MUSIC_SELECTOR=v2`);
    else {
      const pf = libPlan.profile ?? {};
      log(`müzik planı: tema "${libPlan.theme?.title ?? '—'}" (${used.filter((c) => c.theme).length}×) · dönem ${pf.year ?? '?'}${pf.topics?.length ? ` · konu ${pf.topics.join('+')}` : ''} · tercih ${(pf.prefer ?? []).join('/') || '—'} · kaçın ${(pf.avoid ?? []).join('/') || '—'} · nefes ${libPlan.cues.filter((c) => c.breath).length} · geçmiş ${MUSIC_PRIOR.length} video`);
    }
    progress('music', 48);
    beatsSide = join(PUBLIC, `${BUILD}/beats-${hash(`${BEAT_RECIPE}|${DIRECTOR}|${plannedSec.toFixed(3)}|${JSON.stringify(libPlan.cues)}`)}.json`);
    found = readJson(beatsSide);
    if (!Array.isArray(found?.beats) || !Array.isArray(found?.segments)) {
      found = null;
      score = libraryScore(libPlan, plannedSec);
      musicFile = score.rel;
      windows = score.cues.map((c) => ({ from: c.fromSec, to: c.toSec }));
    }
    progress('music', 55);
  } else {
    ({ file: musicFile, windows } = await composeScore());
  }

  /* ================================================================= 5. beats */

  if (!found) {
    found = scoreBeats(join(PUBLIC, musicFile), windows, { ff: FFMPEG });
    if (beatsSide) writeAtomic(beatsSide, JSON.stringify({ beats: found.beats, segments: found.segments }));
  }
  const { beats, segments } = found;
  script.beats = beats;
  const pulsed = segments.filter((s) => s.bpm);
  const bpm = pulsed.length ? pulsed.reduce((a, s) => (s.to - s.from > a.to - a.from ? s : a)).bpm : null;
  log(`vuruş ızgarası: ${pulsed.length}/${segments.length} ipucunda nabız var${pulsed.length ? ` (${Math.min(...pulsed.map((s) => s.bpm)).toFixed(0)}-${Math.max(...pulsed.map((s) => s.bpm)).toFixed(0)} BPM)` : ''}, ${beats.length} vuruş`);
  // The composition's exact placement (the same function Engine.place uses).
  let placed = placeTimeline(script.scenes, FPS, beats);
  const totalSec = frames(placed) / FPS;
  if (libPlan) {
    // The final cut: exactly the video's length (the fade-out ends on the last frame), and every cue
    // change moved onto the picture cut the beat snap chose — the track clocks are kept, so the
    // beats found above stay valid; only where each crossfade or chapter button sits moves.
    score = libraryScore(libPlan, totalSec, placed.slice(1).map((p) => p.from / FPS));
    musicFile = score.rel;
  }
  if (libPlan) {
    // A 12-minute score is ~140 MB of WAV: only the one this video plays stays (the planned-length
    // cut was only listened to; its beats are kept in the sidecar above).
    const keep = basename(musicFile);
    for (const f of readdirSafe(join(PUBLIC, BUILD))) {
      const m = f.match(/^(score-[0-9a-f]+\.wav)(\.json)?$/);
      if (m && m[1] !== keep) rmSync(join(PUBLIC, BUILD, f), { force: true });
    }
  }
  script.music = musicFile;
  if (score) script.musicCues = creditsOf(score.musicCues);
  if (libPlan && MUSIC_HISTORY) {
    const counts = new Map();
    for (const c of libPlan.cues) if (c.trackId) counts.set(c.trackId, (counts.get(c.trackId) ?? 0) + (c.toSec - c.fromSec));
    const main = libPlan.theme?.id ?? [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (!recordMusicHistory(MUSIC_HISTORY, { key: id, title: script.title, genre: script.genre, channel: MUSIC_CHANNEL, main, tracks: [...counts.keys()], prior: MUSIC_PRIOR })) log(`müzik geçmişi yazılamadı: ${MUSIC_HISTORY}`);
  }
  const placedSec = placed.map((p) => p.frames / FPS);

  // Footage windows on the final lengths: held lines continue their clip, borrowed clips play an unused stretch.
  {
    const r = finalizeClipWindows(script.scenes, placedSec, { held: heldFrom, borrowed: clipBorrow, log });
    if (r.continued || r.borrowed || r.cropped) log(`klip pencereleri: ${r.continued} tutulan sahne klibi sürdürüyor, ${r.borrowed} ödünç sahne klibin başka bölümünde${r.cropped ? `, ${r.cropped} ödünç sahne durağan kırpıma döndü` : ''}`);
  }

  /*
   * Emphasis budget. Scripts put a highlighted keyword on every words scene
   * (~60 per 12-minute video, a big boxed word every ~12 s): the emphasis stops
   * meaning anything and the edit reads as shouting. An editor keeps the
   * boxed word for about one moment in 45 s (slams count), sets the other
   * sentences plainly, and lets a sentence that follows another text card
   * within 15 s play as a clean picture with no text at all.
   */
  /*
   * The art director decided each words scene's caption (textMode: full / key /
   * none — src/pipeline/docu-art-director.js captionDecision): its decision
   * stands. A 'none' line becomes a clean picture shot; on a held STILL (no
   * footage) it keeps its key word instead — without text it would be the
   * previous shot again with its camera restarted (Cooper QA).
   */
  const captionsDecided = script.scenes.some((sc) => sc.type === 'words' && sc.textMode);
  if (captionsDecided) {
    let clean = 0;
    for (const sc of script.scenes) {
      if (sc.type !== 'words' || sc.textMode !== 'none') continue;
      if ((sc.image || sc.video) && !(sc.heldBg && !sc.video)) {
        sc.type = 'photo';
        delete sc.text;
        delete sc.keyword;
        delete sc.textMode;
        delete sc.kicker;
        delete sc.textStyle;
        sc.fullBleed = true;
        clean++;
      } else sc.textMode = sc.keyword ? 'key' : 'full';
    }
    if (clean) log(`ekran yazısı: ${clean} dolgu satırı yazısız temiz görüntüye döndü (sanat yönetmeni kararı)`);
  } else {
    const EMPH_GAP = o.emphasisGapSec ?? 45;
    const TEXT_GAP = o.textGapSec ?? 15;
    let t = 0;
    let lastEmph = -Infinity;
    let lastText = -Infinity;
    let dropped = 0;
    let plain = 0;
    script.scenes.forEach((sc, i) => {
      const at = t;
      t += placedSec[i] ?? 0;
      if (sc.type === 'slam') { lastEmph = at; lastText = at; return; }
      if (sc.type !== 'words') return;
      if (sc.keyword && at - lastEmph >= EMPH_GAP) { lastEmph = at; lastText = at; return; }
      // Never a plain, unemphasised sentence under the picture (it read as an amateur subtitle):
      // a long line between emphasis moments shrinks to its key word instead.
      if (sc.keyword && String(sc.text ?? '').split(/\s+/).filter(Boolean).length > 6) { sc.textMode = 'key'; dropped++; }
      // A second text card right after another one: the picture carries the line, the voice says it.
      // Not on a held STILL: without its text it is the previous shot again with its camera restarted
      // (Cooper QA: a typewriter under "RCAF test pilot"). Held footage rolls on, so it may go plain.
      if (at - lastText < TEXT_GAP && (sc.image || sc.video) && !(sc.heldBg && !sc.video)) {
        sc.type = 'photo';
        delete sc.text;
        sc.fullBleed = true;
        plain++;
        return;
      }
      lastText = at;
    });
    if (dropped || plain) log(`vurgu dengesi: ${dropped} uzun satır anahtar kelimesine indi, ${plain} yazı sahnesi yazısız görüntüye döndü`);
  }

  /*
   * Montage timing. Pictures cut on beats; the LAST picture arrives with the
   * hook word, so image, word and hit all land together. Slow music is cut on
   * the half-beat (a ballad at 86 BPM is too lazy for a cold open), fast music
   * on every other beat — under 0.38s a picture reads as flicker, not a shot.
   * A cold open over music with no pulse cuts on an even grid instead.
   */
  // Same token rule as scenes.tsx norm() (the script's case rules: tr-TR for Turkish, en-US otherwise), so this hook time and the engine's hook frame agree.
  const caseLoc = /^tr/i.test(script.locale ?? 'tr') ? 'tr-TR' : 'en-US';
  const normWord = (w) => String(w ?? '').normalize('NFC').toLocaleLowerCase(caseLoc).replace(/[^\p{L}\p{N}]/gu, '');
  function hookTime(sc) {
    if (!sc.text || !sc.wordTimes?.length) return null;
    let j = 0;
    let t = null;
    for (const w of sc.text.split(/\s+/).filter(Boolean)) {
      for (let k = j; k < sc.wordTimes.length; k++) {
        if (normWord(sc.wordTimes[k].word) === normWord(w)) { j = k + 1; t = sc.wordTimes[k].t; break; }
      }
    }
    return t;
  }
  script.scenes.forEach((sc, i) => {
    if (sc.type !== 'montage' || !(sc.images?.length > 1)) return;
    const at = placed[i].from / FPS;
    const len = placedSec[i];
    const hook = hookTime(sc) ?? len - 0.8;
    const seg = segments.find((s) => s.bpm && s.from <= at + 0.5 && s.to > at);
    const period = seg ? 60 / seg.bpm : null;
    const step = period && period < 0.38 ? 2 : 1;
    const grid = period && period > 0.6 ? seg.beats.flatMap((b) => [b, +(b + period / 2).toFixed(3)]) : seg?.beats ?? [];
    const local = grid.map((b) => b - at).filter((b) => b > 0.25 && b < hook - 0.3);
    let beatPool = local.filter((_, k) => k % step === 0);
    const need = sc.images.length - 2;
    if (beatPool.length < Math.min(need, 3)) {
      const n = Math.max(0, Math.min(need, Math.floor((hook - 0.55) / 0.45)));
      beatPool = Array.from({ length: n }, (_, k) => 0.25 + ((k + 1) * (hook - 0.55)) / (n + 1));
    }
    let chosen = beatPool;
    if (beatPool.length > need) chosen = Array.from({ length: need }, (_, k) => beatPool[Math.floor((k * beatPool.length) / need)]);
    // Too few beats for every picture: keep the first ones and the hook picture.
    sc.images = [...sc.images.slice(0, chosen.length + 1), sc.images.at(-1)];
    sc.cuts = [0, ...chosen.map((t) => +t.toFixed(3)), +hook.toFixed(3)];
    log(`montaj: ${sc.cuts.length} kesme, kanca ${hook.toFixed(2)} sn${seg ? '' : ' (nabızsız müzik: eşit aralık)'}`);
  });
  guard();

  /* ============================================================== 6. SFX pool */

  /*
   * Generated variants per kind, then two tape-speed variants of each (±8%,
   * pitch and length together) for free. Risers are exempt: their length is
   * load-bearing — they must end exactly on the impact. Only used when there
   * is no sound library.
   */
  const VARIANTS = { hit: 5, whoosh: 6, riser: 4, ticks: 2, glitch: 3, swell: 4, snap: 5, thud: 3, stinger: 3 };
  const LENGTH = { hit: 2.5, whoosh: 1.0, riser: 1.6, ticks: 1.0, glitch: 0.6, swell: 1.4, snap: 0.5, thud: 1.2, stinger: 2.0 };
  const PITCH = [0.92, 1.08];
  const prompts = genrePrompts(script.genre);

  /*
   * Every video gets its own sonic material. The transition sounds (hit,
   * whoosh, swell, snap) are generated from this video's "flavour" — old paper
   * and projectors for one, rain and glass for the next — so two videos from
   * this engine never share a signature sound. Risers, ticks and glitches are
   * functional and stay shared per genre.
   */
  const FLAVORS = {
    documentary: [
      'old paper, film reels and a clattering projector',
      'vintage reel-to-reel tape, brass and felt',
      'a wooden desk, a typewriter carriage and ink',
      'wind, distant thunder and old window glass',
      'steam trains, iron and rail',
      'camera shutters, flash bulbs and darkroom water',
    ],
    finance: ['cash counters, coins and vault doors', 'server fans, data and glass', 'stock exchange bells and paper tape', 'carbon fibre, air and sub bass'],
    horror: ['old wood, rusty hinges and breath', 'wind in an empty house and cracking ice', 'church bells, chains and stone', 'radio static, tape hiss and whispers'],
    crime: ['typewriters, file drawers and rain on glass', 'police radio, sirens far away and metal doors', 'cassette recorders, tape hiss and ticking clocks', 'cold wind, camera flashes and handcuffs'],
    epic: ['war drums, steel and horse hooves', 'fire, cannon smoke and banners in wind', 'stone halls, chains and bronze gongs', 'arrows, leather and thunder'],
    science: ['radio telescopes, static and deep space hum', 'glass lab instruments and humming machines', 'solar wind, plasma and crystalline chimes', 'rocket engines far away and control room beeps'],
    inspire: ['piano felt, pages and warm air', 'old film cameras and projector hum', 'applause far away and stadium air', 'wind chimes, birds and morning light'],
  };
  const flavorList = FLAVORS[script.genre] ?? FLAVORS.documentary;
  const flavor = script.sfxFlavor ?? flavorList[parseInt(hash(SEED_KEY).slice(0, 8), 16) % flavorList.length];
  const FLAVORED = new Set(['hit', 'whoosh', 'swell', 'snap']);
  const STINGER_GENRES = new Set(['horror', 'crime']);

  /** ElevenLabs pool files already in the cache, per kind (earlier videos paid for them). */
  function cachedElevenPool(flavorDir) {
    const out = {};
    const add = (dir, kinds) => {
      for (const f of readdirSafe(join(CACHE, dir))) {
        const kind = f.match(/^([a-z]+)-\d+(?:-p\d)?\.(?:mp3|wav)$/)?.[1];
        if (kind && kinds.has(kind) && fileOk(join(CACHE, dir, f))) (out[kind] ??= []).push(`${dir}/${f}`);
      }
    };
    add(`sfx/${script.genre}`, new Set(Object.keys(VARIANTS).filter((k) => !FLAVORED.has(k))));
    if (flavorDir) add(flavorDir, FLAVORED);
    return out;
  }
  /**
   * Loudness-normalise ElevenLabs pool files exactly like library sounds (the
   * cached pool measured hits from -20 to -28.5 LUFS and risers clipping at
   * +1.8 dBFS): through the audio director, as a small ad-hoc library.
   */
  function normalisePool(byKind) {
    const sfx = Object.entries(byKind).flatMap(([kind, files]) => files.map((rel) => ({ file: rel, sourceId: `eleven:${rel}`, kind, slug: kind, intensity: 3, genres: [script.genre], keywords: [] })));
    if (!sfx.length) return {};
    return pickSfxPools({ lib: { music: [], sfx, sfxRules: null, root: CACHE }, root: CACHE, genre: script.genre, seed: SEED_KEY, ff: FFMPEG, cacheDir: join(CACHE, 'sfx-norm'), log });
  }

  script.sfxFiles = {};
  script.sfxMeta = {};
  const sfxSources = new Set();
  const addPool = (kind, files) => {
    for (const abs of files) {
      const rel = toPosix(relative(CACHE, abs));
      const pub = publish(rel);
      (script.sfxFiles[kind] ??= []).push(pub);
      const m = sfxMeta(abs);
      if (m) {
        script.sfxMeta[pub] = { peakAt: m.peakAt, dur: m.dur };
        if (m.src) sfxSources.add(m.src);
      }
    }
  };
  if (LIB) {
    const pools = pickSfxPools({ lib: LIB, root: LIB_ROOT, genre: script.genre, seed: SEED_KEY, ff: FFMPEG, cacheDir: join(CACHE, 'sfx-lib'), log });
    for (const [kind, files] of Object.entries(pools)) addPool(kind, files);
    /*
     * Kinds the library cannot fill take the ElevenLabs pools earlier videos of
     * this genre already paid for — never a new generation (docu.js plans no
     * SFX credits when a library exists). Kinds the style never uses stay
     * empty: the director's style rules apply to these files too.
     */
    const flavorDirs = readdirSafe(join(CACHE, 'sfx', script.genre)).filter((d) => /^[0-9a-f]{8}$/.test(d)).sort();
    const own = `sfx/${script.genre}/${hash(flavor).slice(0, 8)}`;
    const flavorDir = flavorDirs.includes(own.split('/').pop()) ? own : flavorDirs.length ? `sfx/${script.genre}/${flavorDirs[SEED % flavorDirs.length]}` : null;
    const missing = Object.fromEntries(Object.entries(cachedElevenPool(flavorDir)).filter(([k]) => !pools[k]?.length));
    if (Object.keys(missing).length) {
      const extra = normalisePool(missing);
      for (const [kind, files] of Object.entries(extra)) addPool(kind, files);
      if (Object.keys(extra).length) log(`kütüphanede olmayan efektler önbellekten: ${Object.keys(extra).join(', ')}`);
    }
    /*
     * Still-empty kinds (e.g. no 'thud' in the library): the rare exception
     * where ElevenLabs makes one — at most GEN_BUDGET sounds per video, and
     * each one goes INTO the library so no later video pays for it again.
     */
    for (const kind of ['thud', 'hit', 'whoosh', 'riser', 'swell', 'snap', 'ticks', 'glitch', 'stinger']) {
      if (script.sfxFiles[kind]?.length || genBudget.left <= 0) continue;
      if (kind === 'stinger' && !STINGER_GENRES.has(script.genre)) continue;
      const abs = await generateIntoLibrary({
        kind, role: kind === 'hit' || kind === 'thud' ? 'impact' : kind === 'riser' || kind === 'swell' ? 'riser' : kind === 'stinger' ? 'stinger' : 'transition',
        text: `${prompts.sfx[kind] ?? kind}. Clean, cinematic documentary sound design, no music, no voices.`,
        seconds: LENGTH[kind] ?? 1.5, genres: [script.genre], keywords: [kind], gainDb: kind === 'thud' ? -18 : -12,
      });
      if (abs) addPool(kind, Object.values(normalisePool({ [kind]: [abs] }))[0] ?? [abs]);
    }
  } else {
    /*
     * No library: generate the pool with ElevenLabs. A new video reuses a
     * flavour this genre already has in the cache rather than paying ~1.3k
     * credits for a new one (unless the script pins its own flavour).
     */
    const flavorDirs = readdirSafe(join(CACHE, 'sfx', script.genre)).filter((d) => /^[0-9a-f]{8}$/.test(d) && readdirSafe(join(CACHE, 'sfx', script.genre, d)).length).sort();
    let flavorHash = hash(flavor).slice(0, 8);
    let reuseOnly = false;
    if (!script.sfxFlavor && !flavorDirs.includes(flavorHash) && flavorDirs.length) {
      flavorHash = flavorDirs[SEED % flavorDirs.length];
      reuseOnly = true;
      log(`ses dokusu: önbellekteki ${flavorHash} havuzu kullanılıyor`);
    } else log(`ses dokusu: ${flavor}`);
    for (const [kind, n] of Object.entries(VARIANTS)) {
      guard();
      if (kind === 'stinger' && !STINGER_GENRES.has(script.genre)) continue;
      const flavored = FLAVORED.has(kind);
      if (flavored && reuseOnly) continue;
      const sfxDir = flavored ? `sfx/${script.genre}/${flavorHash}` : `sfx/${script.genre}`;
      mkdirSync(join(CACHE, sfxDir), { recursive: true });
      for (let v = 1; v <= (flavored ? Math.min(n, 4) : n); v++) {
        const file = `${sfxDir}/${kind}-${v}.mp3`;
        if (!fileOk(join(CACHE, file))) {
          log(`efekt: ${sfxDir}/${kind}-${v}`);
          const text = flavored
            ? `${prompts.sfx[kind]}, sound-designed from ${flavor}. Variation ${v}, distinct from the others.`
            : `${prompts.sfx[kind]}. Variation ${v}, distinct from the others.`;
          const buf = await el('/v1/sound-generation', { text, duration_seconds: LENGTH[kind], prompt_influence: 0.5 }, { json: false });
          writeAtomic(join(CACHE, file), buf);
        }
        if (kind === 'riser') continue;
        for (const [pi, rate] of PITCH.entries()) {
          const varFile = `${sfxDir}/${kind}-${v}-p${pi + 1}.wav`;
          if (!fileOk(join(CACHE, varFile))) {
            const tmp = join(CACHE, `${varFile}.tmp.wav`);
            ff(['-y', '-hide_banner', '-loglevel', 'error', '-i', join(CACHE, file), '-af', `asetrate=44100*${rate},aresample=44100`, '-f', 'wav', tmp]);
            renameSync(tmp, join(CACHE, varFile));
          }
        }
      }
    }
    for (const [kind, files] of Object.entries(normalisePool(cachedElevenPool(`sfx/${script.genre}/${flavorHash}`)))) addPool(kind, files);
  }
  log(`efekt havuzu: ${Object.entries(script.sfxFiles).map(([k, v]) => `${k} ${v.length}`).join(', ') || 'yok (motorun yedek sesleri)'}`);

  /*
   * Stereo movement: each whoosh gets two panned copies (left→right and
   * right→left, equal power, crossing centre on its own peak). The engine
   * picks the one that follows the transition (timeline.js whooshPan).
   */
  script.sfxPan = {};
  for (const pub of script.sfxFiles.whoosh ?? []) {
    const abs = join(PUBLIC, pub);
    const src = fileOk(abs) ? abs : join(CACHE, pub);
    const pair = {};
    for (const dir of ['lr', 'rl']) {
      try {
        const out = panVariant({ bin: FFMPEG, src, dir, peakAt: script.sfxMeta[pub]?.peakAt ?? 0.2, outDir: join(CACHE, 'sfx-pan') });
        if (out) pair[dir] = publish(toPosix(relative(CACHE, out)));
      } catch (e) {
        log(`stereo geçiş kopyası yapılamadı: ${String(e.message).slice(0, 100)}`);
      }
    }
    if (pair.lr || pair.rl) script.sfxPan[pub] = pair;
  }

  /*
   * Foley (paper, pen, shutter, pin, typewriter, page turn) and the sonic
   * logo: library sounds first, topped up with free synthesized ones that are
   * saved INTO the library once. The story's year keeps a shutter out of 1453.
   */
  {
    const years = sceneYears(script).filter((y) => y !== null).sort((a, b) => a - b);
    const year = years.length ? years[Math.floor(years.length / 2)] : null;
    try {
      const fo = ensureFoley({ lib: LIB, root: LIB ? LIB_ROOT : join(CACHE, 'synth-lib'), genre: script.genre, year, ff: FFMPEG, cacheDir: join(CACHE, 'foley-lib'), log });
      script.foleyFiles = {};
      for (const [kind, files] of Object.entries(fo.pools)) {
        for (const abs of files) {
          const pub = publish(toPosix(relative(CACHE, abs)));
          (script.foleyFiles[kind] ??= []).push(pub);
          const m = sfxMeta(abs);
          if (m) script.sfxMeta[pub] = { peakAt: m.peakAt, dur: m.dur };
        }
      }
      if (fo.logo) script.logo = { file: publish(toPosix(relative(CACHE, fo.logo.file))), gain: 1, dur: fo.logo.dur };
      log(`foley: ${Object.entries(script.foleyFiles).map(([k, v]) => `${k} ${v.length}`).join(', ') || 'yok'}${fo.logo ? ' · ses imzası' : ''}`);
    } catch (e) {
      log(`foley hazırlanamadı, onsuz devam: ${String(e.message).slice(0, 120)}`);
    }
  }
  progress('sfx', 60);

  /* ============================================ 7. ambience and literal events */

  if (LIB) {
    /*
     * Room tone from the library: one bed per RUN of scenes set in the same
     * place, continuing across cuts; only where the text really describes
     * that place (a wrong bed is worse than silence). No ElevenLabs credits.
     */
    let beds = planAmbience({ script, lib: LIB, root: LIB_ROOT, genre: script.genre, sceneSeconds: placedSec, seed: SEED_KEY, ff: FFMPEG });
    /*
     * A place the script describes that the library has no bed for (a train,
     * a river): the rare ElevenLabs exception again, longest uncovered place
     * first, within the same per-video budget. The new bed is saved into the
     * library with the place's own words as keywords, then matched normally.
     */
    if (genBudget.left > 0) {
      const covered = new Set(beds.flatMap((c) => Array.from({ length: c.toScene - c.fromScene + 1 }, (_, k) => c.fromScene + k)));
      const need = new Map();
      script.scenes.forEach((sc, i) => {
        const text = bedPrompt(sc);
        if (!text || covered.has(i) || sc.type === 'slam') return;
        need.set(text, (need.get(text) ?? 0) + (placedSec[i] ?? 0));
      });
      const wanted = [...need.entries()].filter(([, s]) => s >= 8).sort((a, b) => b[1] - a[1]).slice(0, genBudget.left);
      let added = 0;
      for (const [text] of wanted) {
        const words = [...new Set(text.toLowerCase().split(/[^a-zçğıöşü]+/i).filter((w) => w.length >= 4 && !BED_STOP.has(w)))];
        const abs = await generateIntoLibrary({ kind: 'bed', role: 'ambience', text: `${text}. Realistic ambient field recording, natural and subtle, no music, no speech, no voices.`, seconds: BED_SECONDS, loop: true, genres: [script.genre], keywords: words, gainDb: -26 });
        if (abs) added++;
      }
      if (added) beds = planAmbience({ script, lib: LIB, root: LIB_ROOT, genre: script.genre, sceneSeconds: placedSec, seed: SEED_KEY, ff: FFMPEG });
    }
    // Gentle, mono-compatible width on every bed (level-matched, cached); the original when that fails.
    script.ambienceCues = beds.map((c) => {
      let wide = null;
      try {
        wide = widenBed({ bin: FFMPEG, src: c.file, outDir: join(CACHE, 'amb-wide') });
      } catch {}
      return { ...c, file: wide ? publish(toPosix(relative(CACHE, wide))) : publishLib(c.file) };
    });
    for (const c of beds) sfxSources.add(c.file);
    const covered = beds.reduce((a, c) => a + placedSec.slice(c.fromScene, c.toScene + 1).reduce((x, y) => x + y, 0), 0);
    log(`ortam sesi: ${beds.length} yatak, sürenin %${Math.round((100 * covered) / Math.max(1, totalSec))}'i`);
    // Literal one-shots on the spoken word ("toplar gürledi"): word timings exist now.
    const events = planEvents({ script, lib: LIB, root: LIB_ROOT, genre: script.genre, seed: SEED_KEY, sceneSeconds: placedSec, ff: FFMPEG });
    /*
     * Each event sits in the room it happens in (cave, hall, ship, open air —
     * from the scene's place words): a low convolution tail, level-matched and
     * cached. The cue plays that much longer so the tail is heard.
     */
    script.eventCues = events.map((c) => {
      let spaced = null;
      if (c.space) {
        try {
          spaced = applySpace({ bin: FFMPEG, src: c.file, space: c.space, outDir: join(CACHE, 'event-space'), log });
        } catch {}
      }
      if (!spaced) return { ...c, file: publishLib(c.file), ...(c.space ? { space: undefined } : {}) };
      return { ...c, file: publish(toPosix(relative(CACHE, spaced.file))), ...(c.dur ? { dur: +(c.dur + spaced.tail).toFixed(3) } : {}) };
    });
    for (const c of events) sfxSources.add(c.file);
    if (events.length) log(`olay sesleri: ${events.length}${events.some((c) => c.space) ? ` (mekân: ${[...new Set(events.map((c) => c.space).filter(Boolean))].join(', ')})` : ''}${events.some((c) => c.prelap) ? ', kesmeden önce başlayan var' : ''}`);
  } else {
    script.ambienceCues = await elevenBeds();
  }
  if (script._natCues?.length) script.eventCues = [...(script.eventCues ?? []), ...script._natCues];
  delete script._natCues;
  progress('ambience', 63);
  guard();

  /**
   * No library: one looped 12s bed per PLACE (the old engine generated a clip
   * per scene, keyed on its length — ~26k credits for a 12-minute video; this
   * is a few thousand). Consecutive scenes with the same place/sound share one
   * bed that the engine loops across them.
   */
  async function elevenBeds() {
    const runs = [];
    let cur = null;
    script.scenes.forEach((sc, i) => {
      const text = bedPrompt(sc);
      if ((sc.type === 'title' && sc.chapterCard) || sc.type === 'slam') {
        cur = null;
        return;
      }
      if (!text) {
        if (cur && i - cur.toScene > 2) cur = null;
        return;
      }
      if (cur && cur.text === text) cur.toScene = i;
      else runs.push((cur = { text, fromScene: i, toScene: i }));
    });
    const made = new Map();
    await pool([...new Set(runs.map((r) => r.text))], Math.min(CONC, 3), async (text) => {
      const rel = bedFile(text);
      if (!fileOk(join(CACHE, rel))) {
        log(`ambiyans: ${text.slice(0, 60)}`);
        try {
          const buf = await el('/v1/sound-generation', {
            text: `${text}. Realistic ambient field recording, natural and subtle, no music, no speech, no voices.`,
            duration_seconds: BED_SECONDS, prompt_influence: 0.45, loop: true, model_id: 'eleven_text_to_sound_v2',
          }, { json: false });
          writeAtomic(join(CACHE, rel), buf);
        } catch (e) {
          // Out of credits is not a per-scene problem: stop instead of failing every remaining bed.
          if (e.cancelled || e.quota || e.status === 401) throw e;
          warnings.missingAmbience++;
          log(`ambiyans üretilemedi, sahneler onsuz: ${e.message.slice(0, 120)}`);
          return;
        }
      }
      // Beds sit ~26 dB under the -19 LUFS narrator, like the library's.
      const I = loudnessOf(join(CACHE, rel)).I;
      made.set(text, { file: publish(rel), gain: +clamp(I === null ? 0.1 : dbToLin(VOICE_LUFS - 26 - I), 0.001, 1).toFixed(3) });
    });
    return runs.filter((r) => made.has(r.text) && placedSec.slice(r.fromScene, r.toScene + 1).reduce((a, b) => a + b, 0) >= 3)
      .map((r) => ({ file: made.get(r.text).file, fromScene: r.fromScene, toScene: r.toScene, gain: made.get(r.text).gain }));
  }

  /* ================================================================ 8. render */

  const propsFile = join(WORK, `${id}.props.json`);
  writeAtomic(propsFile, JSON.stringify({ script }, null, 1));
  const sfxCredits = LIB ? sfxCreditsOf(LIB, LIB_ROOT, sfxSources) : [];
  const result = { props: propsFile, script, bpm, warnings, musicCues: script.musicCues ?? [], sfxCredits };
  if (o.planOnly) return { ...result, durationSec: totalSec };
  rmSync(join(WORK, `${id}.raw.mp4`), { force: true }); // the single-pass render's leftover (older engine)
  // ON-SCREEN NUMBERS, before the hour of rendering (El Niño, Oct 2026: "9 OCTOBER / 3.4 AVERAGE OF 2970" was only seen
  // after the render): every counter's number and every tally as it will print, in the log, for review and QA.
  try {
    const { tallyItems: tally } = await import('../src/infographics/timing.js');
    const shown = script.scenes.map((s, i) => {
      if (s.type !== 'counter') return null;
      const t = tally(s.wordTimes, { to: s.to });
      return `sahne ${i}: ${t.length >= 2 ? t.map((x) => `${x.text} ${x.label}`.trim()).join(' · ') : `${s.prefix ?? ''}${s.to}${s.suffix ?? ''}`}`;
    }).filter(Boolean);
    if (shown.length) log(`ekrandaki sayılar: ${shown.join(' | ')}`);
  } catch {}
  // The outlier measures (edit-scorecard.mjs): tempo, maps, text cards, small photos — in the log before the render.
  try {
    log(scorecardLine(editScorecard(script, FPS, placeTimeline(script.scenes, FPS, script.beats ?? []))));
  } catch {}
  log('render başlıyor');
  const rendered = await render({
    script, publicDir: PUBLIC, workDir: WORK, chunkDir: o.chunkDir ?? join(WORK, 'chunks'), id, ffmpeg: FFMPEG, bundleDir: o.bundleDir,
    log, progress, cancelled, concurrency: o.renderConcurrency, patchScenes: o.patchScenes ?? null,
  });
  guard();

  /* ================================================================ 9. master */

  progress('master', 97);
  log('mastering: ses ölçülüyor');
  const m = masterAudio({ video: rendered.video, audio: rendered.audio, out: OUT, ffmpeg: FFMPEG, log, seconds: totalSec });
  // Off target by more than 1 LU: the mix itself is unbalanced (e.g. hits far louder than the voice) — reported, not hidden.
  if (m.outputI !== null && Math.abs(m.outputI + 14) > 1) warnings.masterLoudness = m.outputI;
  rendered.cleanup();
  /*
   * The chunks stay only while they can still save time: after a failure
   * (this code is not reached) and after a render with degraded assets, whose
   * re-render retries just those scenes. A clean video drops them — at ~20
   * Mbps a 12-minute video's chunks are ~2 GB per job.
   */
  const degraded = ['fallbackImages', 'borrowed', 'depthSkipped', 'refRefused'].some((k) => warnings[k]?.length) || warnings.missingAmbience > 0 || warnings.musicPromptFallback;
  // Kept by default since Oct 2026 (patch render needs last render's chunks); keepChunks:false drops them.
  if (o.keepChunks !== false || degraded) rendered.prune();
  else rendered.drop();

  /* =========================================== 10. subtitles, chapters, cover */

  placed = placeScenes(script);
  const durationSec = frames(placed) / FPS;
  const srtFile = o.srt ?? OUT.replace(/\.mp4$/, '.srt');
  writeFileSync(srtFile, buildSrt(script, placed), 'utf8');
  const sectionTimes = chapterTimes(script, placed);
  const thumbnail = o.thumbnail ?? join(dirname(OUT), 'thumbnail.jpg');
  try {
    ff(['-y', '-hide_banner', '-loglevel', 'error', '-ss', coverTime(script, placed).toFixed(2), '-i', OUT, '-frames:v', '1', '-vf', 'scale=1280:720', '-q:v', '2', thumbnail]);
  } catch (e) {
    log(`kapak karesi alınamadı: ${e.message.slice(0, 100)}`);
  }
  progress('master', 100);
  log(`hazır: ${OUT}  (kaynak ${m.inputI ?? '?'} LUFS -> ${m.outputI ?? '?'} LUFS, ${durationSec.toFixed(1)} sn)`);
  return { ...result, output: OUT, durationSec, srt: srtFile, thumbnail: existsSync(thumbnail) ? thumbnail : null, sectionTimes };
}

/* ------------------------------------------------------------- helpers */

function readdirSafe(dir, recursive = false) {
  try {
    return readdirSync(dir, recursive ? { recursive: true } : undefined).map(String);
  } catch {
    return [];
  }
}

/** Words that say nothing about a place — never library keywords for a generated bed. */
const BED_STOP = new Set(['with', 'from', 'into', 'over', 'under', 'near', 'distant', 'faint', 'soft', 'light', 'heavy', 'some', 'very', 'and', 'the', 'natural', 'subtle', 'quiet', 'occasional']);

/** The text a no-library room-tone bed is generated from: the writer's place, else the scene's sound. */
function bedPrompt(sc) {
  if (sc.type === 'title' && sc.chapterCard) return null;
  return String(sc.place || sc.sound || '').trim() || null;
}
/** Keyed on the text only (the old key included the scene's seconds, so every scene paid again). */
function bedFile(text) {
  return `amb/bed-${hash(`loop|${BED_SECONDS}|${text.toLocaleLowerCase('tr-TR')}`)}.mp3`;
}

/** Library sounds used in this video, with their licences, for the credits block. */
function sfxCreditsOf(lib, root, sources) {
  const byAbs = new Map(lib.sfx.map((s) => [isAbsolute(s.file) ? s.file : join(root, s.file), s]));
  const out = [];
  for (const src of sources) {
    const s = byAbs.get(src);
    if (!s) continue;
    out.push(Object.fromEntries(Object.entries({ title: s.title, file: basename(s.file), source: s.source, sourceId: s.sourceId, license: s.license, sourceUrl: s.sourceUrl ?? s.url, licenseUrl: s.licenseUrl }).filter(([, v]) => v !== undefined && v !== null)));
  }
  return out.sort((a, b) => String(a.file).localeCompare(String(b.file)));
}

/** The music history's channels: a video plans against its own channel's last videos. */
export const MUSIC_CHANNELS = ['news', 'history', 'finance', 'docu'];
/**
 * Which channel's music history a video belongs to: script.musicChannel, then script.channel when it is one of MUSIC_CHANNELS
 * (the same field also carries the corner bug's display name, which is not), else from the format and
 * the genre — news -> news, finance -> finance, epic -> history, anything else -> docu.
 */
export function musicChannelOf(script) {
  // script.musicChannel: what the pipeline writes (docu.js musicMeta, from the format, genre and the channel's voice).
  if (MUSIC_CHANNELS.includes(script?.musicChannel)) return script.musicChannel;
  if (MUSIC_CHANNELS.includes(script?.channel)) return script.channel;
  if (script?.format === 'news') return 'news';
  if (script?.genre === 'finance') return 'finance';
  if (script?.genre === 'epic') return 'history';
  return 'docu';
}

/**
 * Master constants.
 * MEASURED (27 Ekim 2026, ses denetimi): the integrated level was never corrected after the AAC encode (Lula
 * 20261026-29db03 ended at -14.6 LUFS; the warning only fired above 1 dB), and with the ceiling at 0.75
 * (-2.5 dBFS) the loudest transients of a pre-master chunk peaking at -0.9 dBFS took ~6 dB of limiting after
 * +4.8 dB of gain. Now: a gentle 1.5:1 bus compressor ahead of the same ceiling (the limiter does less),
 * the TP re-encode guard still aiming at about -1.5 dBTP, and one more encode when I misses by > 0.4 LU.
 */
export const MASTER = {
  /**
   * Limiter ceiling, linear (~-2.5 dBFS). 0.82 (-1.7) was tried: the AAC encode overshoots ~1 dB, so the TP guard
   * fired on nearly every video and its second encode aimed at ~0.73 anyway (27 Ekim 2026 review). The bus
   * compressor ahead of it is what takes the load off the limiter.
   */
  ceiling: 0.75,
  /** Bus compressor before the limiter: threshold 0.1 = -20 dBFS, 1.5:1, 20 ms / 250 ms. */
  comp: 'acompressor=threshold=0.1:ratio=1.5:attack=20:release=250',
  /** After the encode: |I - target| above this is corrected and encoded once more. */
  tolI: 0.4,
  /** After the encode: a true peak above this pulls the ceiling down (aiming at `tpAim`) for that encode. */
  maxTP: -1.0,
  tpAim: -1.5,
};

/** The master chain: linear gain, the bus compressor, a 4x-oversampled limiter (≈ true peak), back to 48 kHz. */
export function masterChain(gainDb, ceiling = MASTER.ceiling) {
  return `volume=${gainDb.toFixed(2)}dB,${MASTER.comp},aresample=192000,alimiter=limit=${ceiling.toFixed(3)}:attack=1:release=50:level=false:latency=1,aresample=48000`;
}

/**
 * What one more encode must change after the measured encode `res` ({I, TP}), or nothing.
 *  - TP above MASTER.maxTP: the ceiling comes down by the overshoot (and a little), aiming at MASTER.tpAim.
 *  - |I - target| above MASTER.tolI: the gain moves by the miss.
 * @returns {{redo:boolean, gain:number, ceiling:number, why:('tp'|'i')[]}}
 */
export function masterCorrection(res, { target = -14, gain, ceiling = MASTER.ceiling }) {
  const why = [];
  let g = gain;
  let c = ceiling;
  if (res?.TP !== null && res?.TP !== undefined && res.TP > MASTER.maxTP) {
    c = Math.max(0.5, c * Math.pow(10, -(res.TP - MASTER.tpAim + 0.2) / 20));
    why.push('tp');
  }
  if (res?.I !== null && res?.I !== undefined && Math.abs(res.I - target) > MASTER.tolI) {
    g = clamp(g + (target - res.I), -20, 27);
    why.push('i');
  }
  return { redo: why.length > 0, gain: g, ceiling: c, why };
}

/** I, LRA and true peak from an ebur128 summary (null when absent). */
export function eburSummary(txt) {
  const sum = String(txt ?? '').slice(Math.max(0, String(txt ?? '').lastIndexOf('Summary:')));
  const num = (re) => {
    const v = Number(sum.match(re)?.[1]);
    return Number.isFinite(v) ? v : null;
  };
  const I = num(/I:\s+(-?[\d.]+) LUFS/);
  return { I: I !== null && I > -70 ? I : null, LRA: num(/LRA:\s+(-?[\d.]+) LU\b/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

/**
 * Master to YouTube's level. Pass 1 measures the mix. The gain is then applied
 * LINEARLY and peaks are caught by a 4x-oversampled limiter (≈ true peak):
 * loudnorm's "linear" mode silently fell back to dynamic mode on this mix
 * (v3 narration alone has LRA 13; risers peaked at +1.8 dBFS), which squeezed
 * the dynamics, landed at -15 LUFS and resampled the output to 96 kHz. A
 * dry run through the same chain tells how much the limiter took, and the
 * gain is corrected once before the real encode; the encode is measured and,
 * if its level or true peak missed (masterCorrection), encoded once more.
 * Output is always 48 kHz.
 *
 * Either `raw` (one file with picture and sound) or the chunked render's
 * `video` (an mp4, or an ffconcat list of the muted chunks, stream-copied)
 * plus its `audio` (the one WAV mix) — then nothing is re-encoded but the sound.
 * `seconds` (the video's length) sets every pass's ffmpeg deadline; unknown: the longest.
 * @returns {{inputI:number|null, outputI:number|null, outputTP:number|null, outputLRA:number|null, gainDb:number}}
 */
export function masterAudio({ raw, video, audio, out, ffmpeg = 'ffmpeg', log = () => {}, target = -14, seconds = null }) {
  const timeout = ffDeadline(seconds);
  const run = (args) => ffText(ffmpeg, args, timeout);
  const measure = (file, chain) => eburSummary(run(['-hide_banner', '-nostats', '-i', file, '-vn', '-af', [chain, 'ebur128=peak=true'].filter(Boolean).join(','), '-f', 'null', '-']));
  // The AAC encode overshoots the limiter by ~1 dB (1453: -1.5 dB in, -0.2 dBTP out), so the encode is
  // measured and corrected once (masterCorrection: true peak about -1.5 dBTP, level within 0.4 LU).
  let ceiling = MASTER.ceiling;
  const chainFor = (g) => masterChain(g, ceiling);
  const sound = audio ?? raw;
  const input = measure(sound);
  let gain = input.I === null ? 0 : clamp(target - input.I, -20, 24);
  log('mastering: tepe sınırlayıcı deneniyor');
  const dry = measure(sound, chainFor(gain));
  if (dry.I !== null && input.I !== null) gain = clamp(gain + clamp(target - dry.I, -1, 3), -20, 27);
  const inputs = audio
    ? [...(/\.(txt|ffconcat)$/i.test(video) ? ['-f', 'concat', '-safe', '0', '-i', video] : ['-i', video]), '-i', audio, '-map', '0:v:0', '-map', '1:a:0']
    : ['-i', raw];
  const tmp = `${out}.tmp.mp4`;
  const encode = () => {
    const r = ffSync(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-af', chainFor(gain), '-ar', '48000',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', '-f', 'mp4', tmp,
    ], { timeout });
    if (r.status !== 0 || !fileOk(tmp)) {
      rmSync(tmp, { force: true });
      throw new Error(`mastering başarısız: ${String(r.stderr || r.error?.message || '').slice(-300)}`);
    }
    renameSync(tmp, out);
    return measure(out);
  };
  log('mastering: son kodlama');
  let res = encode();
  const fix = masterCorrection(res, { target, gain, ceiling });
  if (fix.redo) {
    // Still hot, or off the level after the encode: correct the ceiling and/or the gain and encode once more.
    if (fix.why.includes('tp')) log(`mastering: tepe ${res.TP.toFixed(1)} dBTP, sınırlayıcı ${fix.ceiling.toFixed(2)} ile yeniden kodlanıyor`);
    if (fix.why.includes('i')) log(`mastering: seviye ${res.I.toFixed(1)} LUFS (hedef ${target}), kazanç ${fix.gain - gain >= 0 ? '+' : ''}${(fix.gain - gain).toFixed(1)} dB düzeltilip yeniden kodlanıyor`);
    ceiling = fix.ceiling;
    gain = fix.gain;
    res = encode();
  }
  log(`mastering: ${input.I?.toFixed(1) ?? '?'} LUFS → ${res.I?.toFixed(1) ?? '?'} LUFS (kazanç ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB), tepe ${res.TP?.toFixed(1) ?? '?'} dBTP, LRA ${res.LRA?.toFixed(1) ?? '?'} LU, 48 kHz`);
  if (res.I !== null && Math.abs(res.I - target) > MASTER.tolI) log(`uyarı: master seviyesi hedeften ${Math.abs(res.I - target).toFixed(1)} dB uzakta`);
  return { inputI: input.I === null ? null : +input.I.toFixed(1), outputI: res.I === null ? null : +res.I.toFixed(1), outputTP: res.TP, outputLRA: res.LRA, gainDb: +gain.toFixed(2) };
}

/* ------------------------------------------------ timeline (Engine mirror) */

const FPS = 30;

/**
 * The exact scene placement the composition uses: src/timeline.js
 * `placeTimeline`, the same function Engine.place calls (a scene is
 * max(dur, voice + 0.4s); boundaries move onto the music's beats within
 * ±0.35s with error diffusion against the plan, never cutting the voice).
 * Subtitles and chapter marks must land on the same frames as the picture.
 */
export function placeScenes(script, fps = FPS) {
  return placeTimeline(script.scenes, fps, script.beats ?? []);
}

const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

/*
 * NO ORPHAN WORD (Eagle's Nest fire, Oct 2026): "On Friday night, 23 October 2026, it" (4 s), then "burned." alone for
 * 0.4 s — the hook's payoff word; 23 cues under 0.7 s in that video, 25 in the France debt one, almost all one or two
 * words cut off a sentence's end. A seven-word cue takes the one or two words left of its sentence (up to SRT_MAX_WORDS),
 * and a short cue stays up to SRT_MIN_SEC while the scene and the next cue leave room.
 */
export const SRT_MAX_WORDS = 9;
export const SRT_MIN_SEC = 0.8;
const SENTENCE_END = /[.!?…]$/;

/**
 * Subtitles from the narration's own word timings: cues of at most seven
 * words (nine when only one or two of the sentence would be left), broken
 * early at sentence ends, each shown until the next begins.
 * Performance tags ([whispers]) have timings too but are never shown.
 */
export function buildSrt(script, placed, fps = FPS) {
  const cues = [];
  script.scenes.forEach((sc, i) => {
    if (!sc.wordTimes?.length) return;
    const base = placed[i].from / fps;
    const sceneEnd = (placed[i].from + (placed[i].frames ?? 0)) / fps;
    const words = sc.wordTimes.filter((w) => !/^\[.*\]$/.test(w.word) && !/^[—–-]+$/.test(w.word));
    // Words after k up to the end of its sentence (or of the line).
    const leftOf = (k) => {
      let n = 0;
      for (let j = k + 1; j < words.length; j++) {
        n++;
        if (SENTENCE_END.test(words[j].word)) break;
      }
      return n;
    };
    let cur = [];
    const flush = (end) => {
      if (!cur.length) return;
      cues.push({ start: base + cur[0].t, end, sceneEnd, text: cur.map((w) => w.word).join(' ').replace(/\s*\.\.\.\s*/g, '… ').trim() });
      cur = [];
    };
    words.forEach((w, k) => {
      cur.push(w);
      const next = words[k + 1];
      const sentenceEnd = SENTENCE_END.test(w.word);
      const left = leftOf(k);
      const full = cur.length >= 7 && !(left <= 2 && cur.length + left <= SRT_MAX_WORDS);
      if (full || sentenceEnd || !next) flush(next ? base + next.t : base + (sc.voiceDur ?? w.t + 0.6));
    });
  });
  cues.forEach((c, n) => {
    if (c.end - c.start >= SRT_MIN_SEC - 1e-6) return;
    const room = Math.min(cues[n + 1]?.start ?? Infinity, c.start + 1.0, c.sceneEnd > c.start ? c.sceneEnd : Infinity);
    if (room > c.end) c.end = room;
  });
  return cues
    .map((c, n) => `${n + 1}\n${srtTime(c.start)} --> ${srtTime(Math.max(c.end, c.start + 0.4))}\n${c.text}\n`)
    .join('\n');
}

/** YouTube chapter marks: where each chapter's first scene starts (its chapter card, when there is one). */
export function chapterTimes(script, placed, fps = FPS) {
  const titles = script.chapters ?? [];
  if (!titles.length) return [{ start: 0, title: script.title ?? 'Giriş' }];
  const out = [];
  script.scenes.forEach((sc, i) => {
    const c = sc.chapter ?? 0;
    const t = titles[c];
    if (!out.some((x) => x.index === c)) out.push({ index: c, start: i === 0 ? 0 : placed[i].from / fps, title: (typeof t === 'string' ? t : t?.title) ?? `Bölüm ${c + 1}` });
  });
  return out.map(({ start, title }) => ({ start, title }));
}

/** The cover frame: the title card fully built, else the first person shot. Never a chapter card. */
function coverTime(script, placed, fps = FPS) {
  let i = script.scenes.findIndex((s) => s.type === 'title' && !s.chapterCard);
  if (i < 0) i = script.scenes.findIndex((s) => s.type === 'photo');
  if (i < 0) i = 0;
  return (placed[i].from + placed[i].frames * 0.7) / fps;
}

/* ----------------------------------------------------------- render step */

const BUNDLE_DIR = join(ENGINE_DIR, 'build/bundle');

function srcHash() {
  const h = createHash('sha1');
  const walk = (d) => {
    for (const f of readdirSync(d).sort()) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else h.update(relative(ENGINE_DIR, p)).update(readFileSync(p));
    }
  };
  walk(join(ENGINE_DIR, 'src'));
  return h.digest('hex').slice(0, 16);
}

/**
 * The composition, pre-bundled. A packaged app ships `build/bundle` and never
 * runs webpack; in development the bundle is rebuilt whenever src/ changes.
 */
export async function ensureBundle(log = () => {}) {
  const stamp = join(BUNDLE_DIR, '.srchash');
  const srcDir = join(ENGINE_DIR, 'src');
  const hasSrc = existsSync(srcDir);
  const current = hasSrc ? srcHash() : null;
  if (existsSync(join(BUNDLE_DIR, 'index.html')) && (!hasSrc || (existsSync(stamp) && readFileSync(stamp, 'utf8') === current))) return BUNDLE_DIR;
  log('kompozisyon paketleniyor (bir kez)');
  const { bundle } = await import('@remotion/bundler');
  const emptyPublic = join(ENGINE_DIR, 'build/.empty-public');
  mkdirSync(emptyPublic, { recursive: true });
  /*
   * Built beside the live bundle and swapped in with renames: a render that
   * reads build/bundle (another job, a chunk starting its browser) never sees
   * a half-written or deleted bundle. The old one is removed only after the
   * swap; a rename a busy file blocks is retried, and if it still fails this
   * run renders from the fresh copy while the next one swaps it in.
   */
  const stampNow = Date.now().toString(36);
  const fresh = `${BUNDLE_DIR}.new-${process.pid}-${stampNow}`;
  const old = `${BUNDLE_DIR}.old-${process.pid}-${stampNow}`;
  rmSync(fresh, { recursive: true, force: true });
  await bundle({ entryPoint: join(ENGINE_DIR, 'src/index.ts'), outDir: fresh, publicDir: emptyPublic });
  writeFileSync(join(fresh, '.srchash'), current ?? '');
  const retry = async (fn) => {
    for (let k = 0; ; k++) {
      try {
        return fn();
      } catch (e) {
        if (k >= 8 || !/EPERM|EBUSY|EACCES|ENOTEMPTY/.test(String(e?.code ?? e?.message))) throw e;
        await sleep(250 * (k + 1));
      }
    }
  };
  try {
    if (existsSync(BUNDLE_DIR)) await retry(() => renameSync(BUNDLE_DIR, old));
    await retry(() => renameSync(fresh, BUNDLE_DIR));
  } catch (e) {
    // Put the old bundle back if it was moved away; this run uses the fresh copy.
    if (!existsSync(BUNDLE_DIR) && existsSync(old)) {
      try {
        renameSync(old, BUNDLE_DIR);
      } catch {}
    }
    log(`paket yerine konamadı (${String(e?.code ?? e?.message).slice(0, 40)}), bu çalıştırma yeni kopyayı kullanıyor`);
    return fresh;
  }
  // Leftovers of earlier swaps go now, best effort: replaced bundles, and fresh copies over an hour old
  // (a younger one may be another job's build in progress).
  for (const f of readdirSafe(dirname(BUNDLE_DIR))) {
    const p = join(dirname(BUNDLE_DIR), f);
    let stale = /^bundle\.old-/.test(f);
    if (!stale && /^bundle\.new-/.test(f)) {
      try {
        stale = Date.now() - statSync(p).mtimeMs > 3600_000;
      } catch {}
    }
    if (!stale) continue;
    try {
      rmSync(p, { recursive: true, force: true });
    } catch {}
  }
  return BUNDLE_DIR;
}

/**
 * Remove a directory link without touching what it points to. A junction is
 * removed with rmdir (unlinking the link only); never `rmSync(recursive)`,
 * which could walk through it and delete the job's real assets. A directory
 * that resolves somewhere else than where it stands is a link too, whatever
 * lstat says about it.
 */
export function removeLink(p) {
  let st;
  try {
    st = lstatSync(p);
  } catch {
    return;
  }
  let linked = st.isSymbolicLink();
  if (!linked && st.isDirectory()) {
    try {
      linked = realpathSync(p).toLowerCase() !== join(realpathSync(dirname(p)), basename(p)).toLowerCase();
    } catch {
      linked = true;
    }
  }
  if (linked) {
    try {
      rmdirSync(p);
    } catch {
      unlinkSync(p);
    }
  } else rmSync(p, { recursive: true, force: true });
}

/* ------------------------------------------------------- chunked render */

/*
 * The encode of every chunk. Identical settings are what let the chunks be
 * joined by stream copy (concat demuxer, -c copy) with no re-encode; the
 * recipe is part of each chunk's key, so a change here re-renders them all.
 */
const VIDEO_RECIPE = { v: 1, codec: 'h264', crf: 18, x264Preset: 'veryfast', pixelFormat: 'yuv420p', fps: FPS, w: 1920, h: 1080 };
const AUDIO_RECIPE = { v: 1, codec: 'pcm-16', sampleRate: 48000 };
/* A chapter longer than this is split at scene boundaries: a crash then loses at most ~3 minutes of picture. */
const CHUNK_MAX_SEC = 180;
/* Shorter chunks are merged into their neighbour: every chunk pays a browser start (~3-5 s). */
const CHUNK_MIN_SEC = 6;
/* Measured 17-27 Mbps (the grain changes every frame): bytes per frame, with headroom. */
const BYTES_PER_FRAME = 125_000;

const key16 = (s) => createHash('sha1').update(s).digest('hex').slice(0, 16);
/* Scene fields only the sound uses: a new voice take or bed must not re-render the picture. */
const SOUND_ONLY = new Set(['voice', 'ambience', 'take', 'sound', 'place', 'foley']);
/* Scene fields only the picture uses: a new image must not re-render the sound. */
const PICTURE_ONLY = new Set(['imgW', 'imgH', 'focus', 'crop', 'fit', 'borrowed','imagePrompt', 'cast', 'archived', 'search', 'credit', 'media', 'video', 'videoStart', 'videoDur', 'videoW', 'videoH', 'clips', 'icons', 'present', 'inserts']);

/** What of a scene can change its pictures. */
export function visualScene(sc) {
  return Object.fromEntries(Object.entries(sc).filter(([k]) => !SOUND_ONLY.has(k)));
}
/** What of a scene can change its sound: which image it shows does not, only whether and how many. */
export function audioScene(sc) {
  const out = Object.fromEntries(Object.entries(sc).filter(([k]) => !PICTURE_ONLY.has(k) && !['image', 'images', 'layers', 'imagePrompts'].includes(k)));
  return { ...out, image: !!sc.image, images: sc.images?.length ?? 0, layers: !!sc.layers, imagePrompts: sc.imagePrompts?.length ?? 0 };
}
/**
 * Everything the choice of transitions reads (timeline.js pickTransitions):
 * it balances the genre's hard-cut share over the WHOLE video, so one mood
 * change anywhere can change a later cut. Structural edits invalidate every
 * chunk; a new picture or line of text does not.
 */
export function transitionContext(scenes) {
  // (Picture presence: a match cut is only chosen between two pictures.)
  return key16(JSON.stringify(scenes.map((s) => [s.type, s.mood ?? null, s.chapter ?? null, !!s.chapterCard, s.transition ?? null, !!(s.image || s.video || s.layers)])));
}
/* Every file a scene shows (the footage clip too: a clip replaced under the same name re-renders its chunk). */
const sceneImages = (sc) => [sc.image, sc.video, ...(sc.images ?? []), ...(sc.inserts ?? []).map((x) => x.src), ...(sc.clips ?? []).map((c) => c?.video), sc.layers?.fg, sc.layers?.bg].filter(Boolean);

/* ------------------------------------------------------- borrowed pictures */

/**
 * The borrow pass's knobs. `good`: the narration/picture affinity (0..1) at
 * which another scene's picture fits (calibrated on the Cooper script: the
 * matches QA would accept scored 0.13-0.46, the typewriter-under-a-pilot kind
 * 0.00-0.08). `gapSec`: a lent picture is never on screen within this of its
 * other showings. `extraAi`: how far the AI cap gives way for scenes nothing
 * fits. `crop`: base zoom of a borrowed still. `minRate`: slowest footage
 * playback (the engine's CLIP_MIN_RATE).
 */
// extraAi 8 -> 30: Napoleon (archive rate-limited, 91 scenes to AI) put 24 random far pictures on screen.
export const BORROW = { good: 0.12, gapSec: 60, extraAi: 30, crop: 1.5, minRate: 0.6 };

const BORROW_STOP = new Set(`a an the and or but nor of in on at to for from with by as is was were be been being are am it its this that these those he she his her him hers they them their theirs we us our you your i me my not no so then than there here what who whom whose which when where why how into onto over under after before just only even very also some any all every each more most much many still now ever never would could should can will shall may might must has have had do does did done up out down off about again like back last first later soon once twice yet too well really almost nothing something anything everything someone anyone everyone nobody one two three four five six seven eight nine ten hundred thousand million
bir bu şu ve ile de da ki mi mı mu mü ne için gibi daha çok en her hiç sonra önce ama fakat ise olarak olan oldu değil kadar
photo photograph picture image shot view seen close closeup wide cinematic dramatic moody atmosphere atmospheric lighting light lit dark darkness shadow shadows vintage archival archive style film footage grain grainy texture detail scene background foreground distance distant soft sharp focus frame framed black white monochrome sepia color colour old era period 1960s 1970s 1980s readable text visible faces face camera angle low high top`.split(/\s+/).filter(Boolean));

const stemWord = (w) => {
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
};

/** Content words of some text → Map(word → weight): names (capitalised mid-sentence) and years weigh double. */
export function contentWords(text, base = 1, into = new Map()) {
  const toks = String(text ?? '').replace(/\[[^\]]*\]/g, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  toks.forEach((raw, k) => {
    const w0 = raw.replace(/['’]s$/i, '').replace(/['’-]+$/, '');
    const lower = w0.toLocaleLowerCase('en-US');
    if (lower.length < 3 || BORROW_STOP.has(lower)) return;
    const name = /^\p{Lu}/u.test(w0) && k > 0 && !/[.!?…]$/.test(toks[k - 1] ?? '');
    const w = /^\d+$/.test(lower) ? lower : stemWord(lower);
    const wt = base * (name || /^\d{3,4}$/.test(w) ? 2 : 1);
    into.set(w, Math.max(into.get(w) ?? 0, wt));
  });
  return into;
}

/** Estimated on-screen seconds of a scene before its voice exists (the planned dur, or the words at ~2.6/s). */
export function estSeconds(sc) {
  const n = stripTags(sc?.say).split(/\s+/).filter(Boolean).length;
  return Math.max(Number(sc?.dur) || 0, Number(sc?.voiceDur) || 0, n ? n / 2.6 + 0.3 : 0);
}

/**
 * How well scene j's picture fits scene i (0..1). What i needs: its narration,
 * search and prompt. What j shows: its search/prompt/caption/name (weighted
 * 0.65) and what it narrates (0.35; the picture was chosen for that line).
 * Rarer words weigh more (idf over the script): "Cooper" in every search
 * matches nothing, "Merwin" or "727" matches a lot.
 */
export function pictureAffinity(scenes, prompts = () => undefined) {
  const need = scenes.map((s) => {
    const m = new Map();
    for (const t of [s?.say, s?.text, s?.caption, s?.title, s?.name, s?.search]) contentWords(t, 1, m);
    contentWords(s?.imagePrompt ?? prompts(s), 0.75, m);
    return m;
  });
  const pic = scenes.map((s) => {
    const m = new Map();
    for (const t of [s?.search, s?.caption, s?.name]) contentWords(t, 1, m);
    contentWords(s?.imagePrompt ?? prompts(s), 0.75, m);
    return m;
  });
  const said = scenes.map((s) => contentWords(s?.text, 1, contentWords(s?.say)));
  const df = new Map();
  for (const m of need) for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
  const N = Math.max(1, scenes.length);
  const idf = (w) => Math.log(1 + N / (df.get(w) ?? 1));
  const cos = (a, b) => {
    let d = 0;
    let na = 0;
    let nb = 0;
    for (const [w, x] of a) {
      const k = x * idf(w);
      na += k * k;
      const y = b.get(w);
      if (y) d += k * y * idf(w);
    }
    for (const [w, y] of b) nb += (y * idf(w)) ** 2;
    return na && nb ? d / Math.sqrt(na * nb) : 0;
  };
  /*
   * And the donor must share at least one word with what scene i SAYS (or its
   * name/caption): shared search jargon alone ("FBI evidence") put a money
   * photo under "only two of the four parachutes".
   */
  const spoken = scenes.map((s) => {
    const m = new Map();
    for (const t of [s?.say, s?.text, s?.caption, s?.name, s?.title]) contentWords(t, 1, m);
    return m;
  });
  const talksAbout = (i, j) => {
    for (const w of spoken[i].keys()) if (pic[j].has(w) || said[j].has(w)) return true;
    return false;
  };
  return (i, j) => (talksAbout(i, j) ? 0.65 * cos(need[i], pic[j]) + 0.35 * cos(need[i], said[j]) : 0);
}

/** A clip's usable end in the file (videoDur is an END time; a value not past the start is a length). */
export function clipEnd(sc) {
  const s = Number(sc?.videoStart) || 0;
  const d = Number(sc?.videoDur);
  if (!(d > 0)) return s;
  return d > s + 0.25 ? d : s + d;
}

/**
 * The largest stretch of a clip [0, end) not used by another scene (`used`:
 * [a, b] seconds, a margin kept around each) that can carry `need` seconds at
 * >= minRate; a stretch that plays at full speed wins. null when none does.
 */
export function freeClipWindow(end, used, need, { minRate = BORROW.minRate, margin = 0.4 } = {}) {
  const cuts = [...used].map(([a, b]) => [Math.max(0, a - margin), Math.min(end, b + margin)]).sort((x, y) => x[0] - y[0]);
  const gaps = [];
  let at = 0;
  for (const [a, b] of cuts) {
    if (a > at) gaps.push([at, a]);
    at = Math.max(at, b);
  }
  if (end > at) gaps.push([at, end]);
  const ok = gaps.filter(([a, b]) => b - a >= Math.max(1, need * minRate));
  if (!ok.length) return null;
  ok.sort((x, y) => (y[1] - y[0] >= need) - (x[1] - x[0] >= need) || y[1] - y[0] - (x[1] - x[0]));
  return { start: +ok[0][0].toFixed(2), end: +ok[0][1].toFixed(2) };
}

/**
 * A borrowed still shown as a tight shot of itself (the donor shows it wide):
 * 1.5x around the donor's own focus, nudged sideways. Aiming at the far side
 * of the frame instead cut the subject out (a jet's nose off the edge).
 */
export function borrowCrop(sc, donor) {
  const [fx = 0.5, fy = 0.35] = donor?.focus ?? [];
  sc.focus = [clamp(fx + (fx <= 0.5 ? 0.1 : -0.1), 0.2, 0.8), clamp(fy + 0.08, 0.25, 0.65)];
  sc.crop = BORROW.crop;
}

/**
 * Where each scene that needs a picture gets one (see the borrow pass in
 * produce()). `own[j]`: the picture scene j shows of its own; `need`: indices
 * to decide, in order. Returns decisions {i, kind: 'donor'|'hold'|'ai'|'loose',
 * from, clip, aff} and loose(i) for a scene whose extra AI picture failed.
 */
export function planBorrows(scenes, { own, need, capPrompt = () => undefined, good = BORROW.good, gapSec = BORROW.gapSec, extraAi = BORROW.extraAi, minRate = BORROW.minRate } = {}) {
  const aff = pictureAffinity(scenes, capPrompt);
  const secs = scenes.map(estSeconds);
  const at = [];
  secs.reduce((t, s, i) => ((at[i] = t), t + s), 0);
  const shows = new Map();
  const show = (pic, t) => {
    if (!shows.has(pic)) shows.set(pic, []);
    shows.get(pic).push(t);
  };
  own.forEach((p, j) => p && show(p, at[j]));
  const lent = new Set();
  const decided = new Map();
  // Footage left for another stretch: outside what the donor (and a held line after it) plays.
  const spare = (j, i) => {
    const d = scenes[j];
    if (!d?.video) return false;
    const s0 = Number(d.videoStart) || 0;
    const used = [[s0, s0 + secs[j] * 1.6]];
    return !!freeClipWindow(clipEnd({ ...d, videoStart: 0 }) || clipEnd(d), used, secs[i], { minRate });
  };
  const donors = (i, { gap, reuse }) => {
    const out = [];
    const near = new Set([own[i - 1], own[i + 1], decided.get(i - 1)].filter(Boolean));
    own.forEach((pic, j) => {
      const d = scenes[j];
      if (!pic || j === i || !d || d.bg || d.type === 'montage' || noOwnPicture(d) || near.has(pic)) return;
      if (!reuse && lent.has(pic)) return;
      if ((shows.get(pic) ?? []).some((t) => Math.abs(t - at[i]) < gap)) return;
      const a = aff(i, j);
      const clip = spare(j, i);
      const rank = a + (Number.isInteger(d.chapter) && d.chapter === scenes[i].chapter ? 0.03 : 0) + (clip ? 0.04 : 0);
      out.push({ from: j, aff: a, clip, rank });
    });
    return out.sort((x, y) => y.rank - x.rank);
  };
  const take = (i, c) => {
    lent.add(own[c.from]);
    show(own[c.from], at[i]);
    decided.set(i, own[c.from]);
  };
  const decisions = [];
  let ai = 0;
  for (const i of need) {
    const sc = scenes[i];
    const best = donors(i, { gap: gapSec, reuse: false }).find((c) => c.aff >= good);
    if (best) {
      take(i, best);
      decisions.push({ i, kind: 'donor', ...best });
      continue;
    }
    // The shot in front of it: its owner (a held run points back to it) must fit this line.
    let o = i - 1;
    while (o >= 0 && !own[o] && !decided.has(o) && scenes[o]?.bg === 'prev') o--;
    const prevPic = o >= 0 ? own[o] ?? decided.get(o) : null;
    const prevDev = i > 0 && noOwnPicture(scenes[i - 1]);
    const pa = prevPic && !prevDev ? Math.max(aff(i, o), aff(i, i - 1)) : 0;
    if (pa >= good) {
      decided.set(i, prevPic);
      decisions.push({ i, kind: 'hold', aff: pa });
      continue;
    }
    if (capPrompt(sc) && ai < extraAi) {
      ai++;
      decisions.push({ i, kind: 'ai' });
      continue;
    }
    decisions.push({ i, kind: 'loose', ...loose(i) });
  }
  function loose(i) {
    for (const o of [{ gap: gapSec, reuse: false }, { gap: gapSec / 2, reuse: false }, { gap: gapSec / 2, reuse: true }, { gap: 12, reuse: true }]) {
      const c = donors(i, o)[0];
      if (c) {
        take(i, c);
        return c;
      }
    }
    return { from: -1, aff: 0, clip: false };
  }
  return { decisions, loose };
}

/**
 * Footage windows once scene lengths are final (`secs`, aligned with scenes):
 *  1. a scene's own clip plays from videoStart (its held lines after it are
 *     reserved behind it);
 *  2. a borrowed clip (`borrowed`: scene → donor) plays the largest stretch
 *     nobody else plays; without one it falls back to a crop of the still;
 *  3. a held scene (`held`: scene → {src, pre}) continues its source's
 *     footage — after it (bg 'prev'), or the moment just before it (a 'next'
 *     pre-lap) — instead of showing the clip's opening still again.
 * @returns {{continued:number, borrowed:number, cropped:number}}
 */
export function finalizeClipWindows(scenes, secs, { held = new WeakMap(), borrowed = new WeakMap(), minRate = BORROW.minRate, log = () => {} } = {}) {
  const idx = new Map(scenes.map((s, i) => [s, i]));
  const used = new Map();
  const mark = (v, a, b) => {
    if (!used.has(v)) used.set(v, []);
    used.get(v).push([a, b]);
  };
  // The shot a held line really continues: through a run of held lines back to the first one's source.
  const rootOf = (sc) => {
    let r = sc;
    for (let n = 0; n < scenes.length && held.get(r) && !held.get(r).pre; n++) r = held.get(r).src;
    return r;
  };
  const followers = (src) => {
    let t = 0;
    for (let k = (idx.get(src) ?? -1) + 1; k < scenes.length && held.get(scenes[k]) && !held.get(scenes[k]).pre && rootOf(scenes[k]) === src; k++) t += secs[k] ?? 0;
    return t;
  };
  const setClip = (sc, src, start, end) => {
    for (const k of VIDEO_FIELDS) if (src[k] !== undefined) sc[k] = src[k];
    sc.videoStart = +start.toFixed(2);
    sc.videoDur = +end.toFixed(2);
  };
  const out = { continued: 0, borrowed: 0, cropped: 0 };
  scenes.forEach((sc, i) => {
    if (!sc.video || held.has(sc) || borrowed.has(sc)) return;
    const a = Number(sc.videoStart) || 0;
    mark(sc.video, a, Math.min(clipEnd(sc), a + (secs[i] ?? 0) + followers(sc)));
  });
  scenes.forEach((sc, i) => {
    const donor = borrowed.get(sc);
    if (!donor || !sc.video) return;
    const end = clipEnd({ ...donor, videoStart: 0 }) || clipEnd(donor);
    const w = freeClipWindow(end, used.get(sc.video) ?? [], secs[i] ?? 0, { minRate });
    if (w) {
      setClip(sc, donor, w.start, w.end);
      mark(sc.video, w.start, Math.min(w.end, w.start + (secs[i] ?? 0) + followers(sc)));
      out.borrowed++;
      log(`ödünç klip: sahne ${i + 1}, sahne ${idx.get(donor) + 1} klibinin ${w.start}-${w.end} sn bölümü`);
    } else {
      for (const k of VIDEO_FIELDS) delete sc[k];
      borrowCrop(sc, donor);
      out.cropped++;
      log(`ödünç klip: sahne ${i + 1} için klipte boş bölüm kalmadı — durağan karenin farklı kırpımı`);
    }
  });
  const cursor = new Map();
  scenes.forEach((sc, i) => {
    const h = held.get(sc);
    if (!h || sc.video) return;
    const root = h.pre ? h.src : rootOf(sc);
    if (!root?.video) {
      // A borrowed clip that fell back to a crop of its still: the held line shows the same crop.
      if (root?.crop && sc.image === root.image) {
        sc.crop = root.crop;
        sc.focus = root.focus;
      }
      return;
    }
    const need = secs[i] ?? 0;
    const end = clipEnd(root);
    const s0 = Number(root.videoStart) || 0;
    if (h.pre) {
      // A pre-lap plays the moment just before its shot: the cut into it continues the motion.
      if (s0 < Math.max(0.5, need * minRate)) return;
      setClip(sc, root, Math.max(0, s0 - need), s0);
      out.continued++;
      return;
    }
    const from = cursor.get(root) ?? Math.min(end, s0 + (secs[idx.get(root)] ?? 0));
    // Footage used up: the engine holds the last frame with a push — the frame the shot ended on, not its opening still.
    const start = Math.min(from, Math.max(s0, end - 0.1));
    setClip(sc, root, start, end);
    cursor.set(root, Math.min(end, start + need));
    out.continued++;
  });
  return out;
}

/* ------------------------------------------------------------ scene footage */

/** The fields docu-archive.js writes on a scene that shows a footage clip. */
export const VIDEO_FIELDS = ['video', 'videoStart', 'videoDur', 'videoW', 'videoH'];

/** `ffmpeg -i` output → duration (s) and display size (anamorphic SAR applied). */
export function parseVideoInfo(text) {
  const t = String(text ?? '');
  const d = t.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const v = t.match(/Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b(?:\s*\[SAR (\d+):(\d+))?/);
  const dur = d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0;
  let w = v ? +v[1] : 0;
  const h = v ? +v[2] : 0;
  if (v?.[3] && v?.[4] && +v[3] > 0 && +v[4] > 0) w = Math.round((w * +v[3]) / +v[4]);
  return { dur: Number.isFinite(dur) ? dur : 0, w, h };
}

/**
 * Make every footage scene renderable: the clip in the public dir (linked from
 * the shared cache when only it has it), videoDur/videoW/videoH probed when
 * missing, videoStart inside the clip, and a still in `image` (extracted from
 * the clip when the archive step left none). A clip that cannot be used is
 * dropped from the scene — it keeps its still, or goes through the normal
 * picture path. Nothing here re-encodes, lifts or deletes a clip. A scene's
 * clip that opens on a static stretch starts where it moves (motionStart).
 * @returns {number} scenes that keep their clip
 */
export function prepareSceneVideos(script, { PUBLIC, CACHE, BUILD, ff, ffOut, log = () => {}, motion = true }) {
  let kept = 0;
  // Stillness scans are kept beside the video: a re-render never decodes the clips again.
  const motionFile = PUBLIC && BUILD ? join(PUBLIC, BUILD, 'clip-motion.json') : null;
  let motionCache = {};
  try {
    if (motionFile && existsSync(motionFile)) motionCache = JSON.parse(readFileSync(motionFile, 'utf8')) ?? {};
  } catch {
    motionCache = {};
  }
  let motionDirty = false;
  const moveStart = (sc, i, abs) => {
    const need = estSeconds(sc);
    const start = Number(sc.videoStart) || 0;
    const end = clipEnd(sc);
    const span = Math.min(end - start, need + 15);
    if (!(span > 2.5)) return;
    const key = `${sc.video}|${start}|${span.toFixed(1)}|${MOTION_RECIPE}`;
    let fr = motionCache[key];
    if (!Array.isArray(fr)) {
      const out = ffOut(['-hide_banner', '-nostats', '-ss', start.toFixed(2), '-t', span.toFixed(2), '-i', abs, '-an', '-sn', '-dn', '-vf', MOTION_VF, '-f', 'null', '-'], ffDeadline(span));
      fr = parseFreezes(out).map((x) => [x.start, Number.isFinite(x.end) ? x.end : null]);
      motionCache[key] = fr;
      motionDirty = true;
    }
    const at = motionStart(fr.map(([s, e]) => ({ start: s, end: e ?? Infinity })), { start, end, need });
    if (at > start) {
      log(`sahne ${i + 1}: klibin ilk ${(at - start).toFixed(1)} sn'si durağan (donmuş görünürdü) — sahne hareketin başladığı ${at} sn'den açılıyor`);
      sc.videoStart = at;
    }
  };
  const one = (sc, i, frame = false) => {
    if (!sc?.video) return;
    const abs = join(PUBLIC, sc.video);
    if (!fileOk(abs) && CACHE && CACHE !== PUBLIC && fileOk(join(CACHE, sc.video))) {
      try {
        mkdirSync(dirname(abs), { recursive: true });
        linkOrCopy(join(CACHE, sc.video), abs);
      } catch {}
    }
    const drop = (why) => {
      for (const k of VIDEO_FIELDS) delete sc[k];
      if (sc.image && !fileOk(join(PUBLIC, sc.image))) delete sc.image;
      log(`sahne ${i + 1}: arşiv klibi kullanılamıyor (${why}) — ${sc.image ? 'durağan karesiyle' : 'görsel yoluyla'} devam`);
    };
    if (!fileOk(abs)) return drop(`dosya yok: ${sc.video}`);
    if (!(sc.videoDur > 0 && sc.videoW > 0 && sc.videoH > 0)) {
      const p = parseVideoInfo(ffOut(['-hide_banner', '-i', abs], FF_PROBE_MS));
      if (!(sc.videoDur > 0) && p.dur > 0) sc.videoDur = +p.dur.toFixed(2);
      if (!(sc.videoW > 0 && sc.videoH > 0) && p.w > 0 && p.h > 0) {
        sc.videoW = p.w;
        sc.videoH = p.h;
      }
    }
    if (!(sc.videoDur > 0)) return drop('süresi okunamadı');
    sc.videoStart = +clamp(Number(sc.videoStart) || 0, 0, Math.max(0, sc.videoDur - 0.5)).toFixed(2);
    // Montage cuts are fractions of a second: only a scene's own shot is scanned.
    if (motion && !frame) {
      try {
        moveStart(sc, i, abs);
      } catch (e) {
        log(`sahne ${i + 1}: klip hareket taraması yapılamadı (${String(e?.message ?? e).slice(0, 80)}) — başlangıç aynı`);
      }
    }
    if (!sc.image || !fileOk(join(PUBLIC, sc.image))) {
      const still = `${BUILD}/vstill-${hash(`${sc.video}|${sc.videoStart}`)}.jpg`;
      const out = join(PUBLIC, still);
      if (!fileOk(out)) {
        const tmp = `${out}.tmp.jpg`;
        try {
          mkdirSync(dirname(out), { recursive: true });
          const at = Math.min(sc.videoStart + 0.4, Math.max(0, sc.videoDur - 0.1));
          ff(['-y', '-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', abs, '-frames:v', '1', '-q:v', '2', '-f', 'image2', tmp]);
          renameSync(tmp, out);
        } catch (e) {
          rmSync(tmp, { force: true });
          return drop(`durağan kare çıkarılamadı: ${String(e?.message ?? e).slice(0, 80)}`);
        }
      }
      sc.image = still;
    }
    kept++;
  };
  (script.scenes ?? []).forEach((sc, i) => {
    one(sc, i, sc?.type === 'montage');
    // Montage/collage frames (imagePrompts objects) found as footage: same contract, per frame.
    for (const p of sc?.imagePrompts ?? []) if (p && typeof p === 'object' && p.video) one(p, i, true);
  });
  if (motionDirty && motionFile) {
    try {
      writeAtomic(motionFile, JSON.stringify(motionCache));
    } catch {}
  }
  if (kept) log(`hareketli görüntü: ${kept} klip (sahne ve montaj kareleri) arşiv/stok görüntüsüyle`);
  return kept;
}

/*
 * Stillness scan of a clip: frames 0.5 s apart (slow drift still registers as
 * change over half a second, a held frame does not), small, compared with
 * freezedetect. Bump the recipe when the filter changes.
 */
const MOTION_VF = 'fps=2,scale=320:-2,freezedetect=n=0.01:d=1.5';
const MOTION_RECIPE = 'm1';

/** freezedetect log → [{start, end}] seconds (end = Infinity when the stillness runs to the end). */
export function parseFreezes(text) {
  const out = [];
  let s = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const a = line.match(/freeze_start:\s*([\d.]+)/);
    if (a) s = +a[1];
    const e = line.match(/freeze_end:\s*([\d.]+)/);
    if (e && s !== null) {
      out.push({ start: s, end: +e[1] });
      s = null;
    }
  }
  if (s !== null) out.push({ start: s, end: Infinity });
  return out;
}

/**
 * Where a scene's clip should start so it does not open on a still frame.
 * Stock and archive clips often open on a held, dark or empty frame (Cooper:
 * 4.8 s of a dark street before the lights move — the QA saw a 5 s freeze).
 * `freezes` are relative to `start`; stretches closer than 0.6 s merge. When
 * the clip opens with >= 1.5 s of stillness, then moves for >= 1.5 s, and
 * enough footage is left to cover `need` at >= minRate, the start moves to
 * where it moves. A clip that is slow all the way through keeps its start.
 */
export function motionStart(freezes, { start = 0, end, need = 0, minRate = BORROW.minRate } = {}) {
  const f = [];
  for (const x of [...(freezes ?? [])].sort((a, b) => a.start - b.start)) {
    const last = f.at(-1);
    if (last && x.start - last.end < 0.6) last.end = Math.max(last.end, x.end);
    else f.push({ ...x });
  }
  let at = start;
  const lead = f[0];
  if (lead && lead.start <= 0.5 && Number.isFinite(lead.end) && lead.end >= 1.5) {
    const a = start + lead.end;
    const moving = (f[1] ? start + f[1].start : end) - a;
    if (!(moving < 1.5 || end - a < Math.max(1.5, need * minRate))) at = a;
  }
  /*
   * A still stretch INSIDE the scene's window is an archive film's own title card
   * ("SEEING LONDON · Part Three" under 1929's gold-standard line): the scene
   * jumps past it when the clip moves on long enough after it.
   */
  for (const x of f) {
    const xs = start + x.start;
    const xe = start + x.end;
    if (xe <= at + 0.05) continue;
    if (xs >= at + need * minRate) break;
    if (!Number.isFinite(x.end) || x.end - x.start < 1.5) continue;
    if (end - xe < Math.max(1.5, need * minRate)) break;
    at = xe;
  }
  return at > start ? +at.toFixed(2) : start;
}

/** The clip entry the composition plays for one picture of a scene's images[] (null = a still). */
export function clipOf(p, image) {
  if (!p || typeof p !== 'object' || !p.video || !image) return null;
  return { video: p.video, videoStart: p.videoStart ?? 0, videoDur: p.videoDur, videoW: p.videoW, videoH: p.videoH, image };
}

/**
 * Render chunks: one per chapter (a chapter card starts one), long chapters
 * split near-evenly at scene boundaries, tiny ones merged into the previous.
 * Frame ranges are inclusive and cover the whole timeline without gaps.
 * @returns {{a:number, b:number, start:number, end:number}[]}  a/b = first/last scene
 */
export function planChunks(scenes, placed, { maxFrames = CHUNK_MAX_SEC * FPS, minFrames = CHUNK_MIN_SEC * FPS } = {}) {
  if (!scenes.length) return [];
  const groups = [];
  let prev = null;
  scenes.forEach((sc, i) => {
    const c = Number.isInteger(sc.chapter) ? sc.chapter : prev ?? 0;
    if (i === 0 || sc.chapterCard || c !== prev) groups.push([i]);
    else groups.at(-1).push(i);
    prev = c;
  });
  const len = (i) => placed[i].frames;
  let parts = [];
  for (const g of groups) {
    const total = g.reduce((n, i) => n + len(i), 0);
    const n = Math.max(1, Math.ceil(total / maxFrames));
    const target = total / n;
    let cur = [];
    let acc = 0;
    let made = 0;
    for (const i of g) {
      if (cur.length && made < n - 1 && acc + len(i) / 2 > target) {
        parts.push(cur);
        cur = [];
        acc = 0;
        made++;
      }
      cur.push(i);
      acc += len(i);
    }
    parts.push(cur);
  }
  const size = (p) => p.reduce((n, i) => n + len(i), 0);
  for (let k = 0; k < parts.length && parts.length > 1; k++) {
    if (size(parts[k]) >= minFrames) continue;
    if (k > 0) parts[k - 1].push(...parts[k]);
    else parts[1].unshift(...parts[0]);
    parts.splice(k, 1);
    k--;
  }
  const total = placed.at(-1).from + placed.at(-1).frames;
  parts = parts.map((p) => ({ a: p[0], b: p.at(-1), start: placed[p[0]].from }));
  return parts.map((p, k) => ({ ...p, end: (k < parts.length - 1 ? parts[k + 1].start : total) - 1 }));
}

/**
 * A chunk's cache key: everything that can change a pixel inside its frame
 * range. Its own scenes and one on each side (flicker masks and the entrance
 * of the next shot read across the cut) with their exact placement; the
 * image files' sizes (a replaced picture under the same name); the absolute
 * frame range (grain, dust and flicker are seeded by the absolute frame, so a
 * length change earlier re-renders every later chunk); the beats around it;
 * the style (genre, palette, locale, seed) and the whole video's transition
 * context; the bundle (composition code) and the encode recipe.
 */
export function chunkKey({ script, placed, chunk, bundle, tctx = transitionContext(script.scenes), sig = () => null, style = styleOf(script) }) {
  const scenes = script.scenes;
  const around = [];
  for (let i = Math.max(0, chunk.a - 1); i <= Math.min(scenes.length - 1, chunk.b + 1); i++) {
    /*
     * The neighbours' pictures count too: a pair transition (effects/transitions.tsx)
     * draws the next shot's first frame and the last shot's last frame across the cut.
     * Each scene's derived camera, fit and effects (effects/variety.js) run over the
     * whole video, so they are keyed as computed, not as written.
     */
    around.push({
      i,
      from: placed[i].from,
      frames: placed[i].frames,
      s: visualScene(scenes[i]),
      files: sceneImages(scenes[i]).map((f) => [f, sig(f)]),
      st: [style.camera[i] ?? null, style.fit[i] ?? null, style.fx[i] ?? []],
    });
  }
  const t0 = chunk.start / FPS - 1;
  const t1 = (chunk.end + 1) / FPS + 1;
  return key16(JSON.stringify({
    r: VIDEO_RECIPE,
    bundle,
    look: { genre: script.genre, palette: script.palette ?? null, locale: script.locale ?? null, perfOff: script.perfOff ?? null, seed: script.seedKey ?? script.id ?? null, tr: script.transitionPalette ?? null, fxv: script.fxPalette ?? null, fxd: script.fxDensity ?? null },
    // The topic identity (src/topic) dresses chapter cards, grounds and wipes everywhere; keyed only when present (old keys unchanged).
    ...(script.topic ? { topic: script.topic } : {}),
    // The channel's corner name (src/ChannelBug.tsx) rides over picture scenes; keyed only when present.
    ...(script.channel ? { ch: script.channel } : {}),
    tctx,
    range: [chunk.start, chunk.end],
    around,
    // The opening treatment (script.opening) draws over the scenes up to the main title: only those chunks carry it.
    ...(chunk.a <= openingEnd(script) ? { op: script.opening } : {}),
    beats: (script.beats ?? []).filter((b) => b >= t0 && b <= t1),
  }));
}

/** The derived per-scene style (camera, fit, effects) of a script, as the composition computes it. */
export function styleOf(script) {
  return deriveStyle(script, { collage: COLLAGE_GENRES.has(script.genre) });
}

/**
 * The sound's key: the SFX picker, the music envelope and the ducking all run
 * over the whole video, so any change to what is heard re-renders all sound
 * — but a new picture does not (audioScene). Asset sizes catch a file
 * replaced under the same name (a library sound re-downloaded).
 */
export function audioKey({ script, bundle, sig = () => null }) {
  const { visualStyle, palette, cast, perfOff, realCast, stats, story, ...rest } = script;
  const files = new Set(['sfx/hit.wav', 'sfx/whoosh.wav', 'sfx/riser.wav', 'sfx/ticks.wav', 'sfx/glitch.wav', 'sfx/drone.wav']);
  for (const sc of script.scenes) for (const f of [sc.voice, sc.ambience]) if (f) files.add(f);
  if (script.music) files.add(script.music);
  for (const list of Object.values(script.sfxFiles ?? {})) for (const f of list) files.add(f);
  for (const c of [...(script.ambienceCues ?? []), ...(script.eventCues ?? [])]) if (c.file) files.add(c.file);
  for (const list of Object.values(script.foleyFiles ?? {})) for (const f of list) files.add(f);
  for (const pair of Object.values(script.sfxPan ?? {})) for (const f of Object.values(pair)) if (f) files.add(f);
  if (script.logo?.file) files.add(script.logo.file);
  return key16(JSON.stringify({ r: AUDIO_RECIPE, bundle, script: { ...rest, scenes: script.scenes.map(audioScene) }, files: [...files].sort().map((f) => [f, sig(f)]) }));
}

/** The bundle's identity: the src hash it was built from, else (a packaged bundle without one) its code. */
function bundleFingerprint(dir) {
  let stamp = '';
  try {
    stamp = readFileSync(join(dir, '.srchash'), 'utf8').trim();
  } catch {}
  if (stamp) return stamp;
  const h = createHash('sha1');
  for (const f of readdirSafe(dir).filter((f) => /\.(js|html)$/.test(f)).sort()) h.update(f).update(readFileSync(join(dir, f)));
  return h.digest('hex').slice(0, 16);
}

/*
 * Remotion keeps each render's sound assets (every one padded to the whole
 * range as WAV) in %TEMP%/remotion-v<ver>-assets<id> and removes them when the
 * render ends — but not when the job is killed (Nova's cancel, a crash, a
 * closed laptop), and a long video's leftovers run to gigabytes. Leftovers
 * older than this are swept before a render; a render in progress keeps
 * touching its folder, and every chunk is far shorter.
 */
const STALE_TEMP_MS = 6 * 3600_000;
export function sweepRemotionTemp({ root = tmpdir(), now = Date.now(), log = () => {} } = {}) {
  let n = 0;
  for (const f of readdirSafe(root)) {
    if (!/^remotion-v[\d.]+-assets\w+$/.test(f)) continue;
    const p = join(root, f);
    try {
      const st = lstatSync(p);
      if (!st.isDirectory() || st.isSymbolicLink() || now - st.mtimeMs < STALE_TEMP_MS) continue;
      rmSync(p, { recursive: true, force: true });
      n++;
    } catch {}
  }
  if (n) log(`eski render geçici klasörleri silindi: ${n}`);
  return n;
}

function freeBytes(dir) {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}
const gb = (b) => (b / 1e9).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

/**
 * Bring a rendered sound chunk to exactly its frames' length (frames / fps at
 * the file's own sample rate). Remotion's WAV of a range can run a few samples
 * long (measured: +16 samples on the range that starts at frame 0, from an
 * ambience bed's rounding). Joined as-is, every later chunk slid by that much
 * and repeated a 0.3 ms sliver of sound at the seam — a tick under loud music,
 * and a drift against the picture that grows with every chunk. Longer is cut,
 * shorter padded with silence; the format chunk is kept byte for byte.
 * @returns {boolean} whether the file had to be rewritten
 */
export function fitWav(file, frames, fps = FPS) {
  const buf = readFileSync(file);
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`WAV değil: ${basename(file)}`);
  let fmt = null;
  let data = null;
  for (let p = 12; p + 8 <= buf.length; ) {
    const id = buf.toString('ascii', p, p + 4);
    let size = buf.readUInt32LE(p + 4);
    if (id === 'data') {
      // A streamed WAV leaves the size unset (0 or 0xFFFFFFFF): the data runs to the end of the file.
      if (!size || p + 8 + size > buf.length) size = buf.length - p - 8;
      data = buf.subarray(p + 8, p + 8 + size);
      break;
    }
    if (id === 'fmt ') fmt = buf.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  if (!fmt || fmt.length < 16 || !data) throw new Error(`WAV okunamadı: ${basename(file)}`);
  const channels = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4);
  const block = channels * (fmt.readUInt16LE(14) / 8);
  const want = Math.round((frames * rate) / fps) * block;
  if (data.length === want) return false;
  const fmtPad = fmt.length & 1;
  const head = 12 + 8 + fmt.length + fmtPad + 8;
  const out = Buffer.alloc(head + want);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(out.length - 8, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(fmt.length, 16);
  fmt.copy(out, 20);
  out.write('data', head - 8, 'ascii');
  out.writeUInt32LE(want, head - 4);
  data.copy(out, head, 0, Math.min(data.length, want));
  writeAtomic(file, out);
  return true;
}

/**
 * Render the composition in chunks.
 *
 * Each chunk is rendered muted with its frame range, its sound written
 * beside it in the same pass (separateAudioTo, no extra frame walk), and both
 * are cached under keys of what they show and play (chunkKey, audioKey): a
 * crash or a killed job resumes at the first missing chunk, and a re-render
 * after a fixed picture re-renders only that picture's chapter. When only the
 * sound changed, cached picture chunks get an audio-only pass (~4x faster than
 * frames). The chunks are joined by the concat demuxer with stream copy
 * (identical x264 settings), the sound chunks into one WAV; the master step
 * muxes and levels them. Remotion's per-render temp audio stays chunk-sized.
 * @returns {Promise<{video:string, audio:string, chunks:number, reused:number, cleanup:()=>void, prune:()=>void, drop:()=>void}>}
 */
export async function render({ script, publicDir, workDir, chunkDir, id = 'video', ffmpeg = 'ffmpeg', bundleDir: givenBundle, log, progress, cancelled, concurrency, patchScenes = null }) {
  const cancelledError = () => Object.assign(new Error('iptal edildi'), { cancelled: true });
  const bundleDir = givenBundle ?? (await ensureBundle(log));
  let remotionVersion = 'unknown';
  try {
    remotionVersion = (await import('remotion/version')).VERSION;
  } catch {}
  const sig = (rel) => {
    try {
      return statSync(join(publicDir, rel)).size;
    } catch {
      return null;
    }
  };
  // The film-grain tiles are drawn on every frame: part of every chunk's identity. So are vendored fonts
  // (public/fonts, when the engine ships them): a new font file must not leave old chunks in the old type.
  const fx = readdirSafe(join(publicDir, 'fx')).sort().map((f) => [f, sig(`fx/${f}`)]);
  const fonts = readdirSafe(join(publicDir, 'fonts')).sort().map((f) => [f, sig(`fonts/${f}`)]);
  // Software GL draws blurs and blends a little differently from ANGLE: chunks of the two must not be mixed in one video.
  const gl = process.env.DOCU_GL === 'software' ? '|gl software' : '';
  const bundle = `${bundleFingerprint(bundleDir)}|remotion ${remotionVersion}|${JSON.stringify(fx)}${fonts.length ? `|${JSON.stringify(fonts)}` : ''}${gl}`;

  const placed = placeScenes(script);
  const total = placed.reduce((n, p) => n + p.frames, 0);
  mkdirSync(chunkDir, { recursive: true });
  // A killed render's half-written chunk: never mistaken for a finished one (those are renamed into place).
  for (const f of readdirSafe(chunkDir)) if (/\.tmp\d*\./.test(f)) rmSync(join(chunkDir, f), { force: true });
  const tctx = transitionContext(script.scenes);
  const style = styleOf(script);
  const aBase = audioKey({ script, bundle, sig });
  // Content-only keys (the same inputs without the engine code): a patch render finds last render's chunks by them.
  const aPatch = audioKey({ script, bundle: 'patch', sig });
  const named = (c) => ({
    ...c,
    video: join(chunkDir, `v-${chunkKey({ script, placed, chunk: c, bundle, tctx, sig, style })}.mp4`),
    audio: join(chunkDir, `a-${key16(`${aBase}|${c.start}|${c.end}`)}.wav`),
    vb: chunkKey({ script, placed, chunk: c, bundle: 'patch', tctx, sig, style }),
    ab: key16(`${aPatch}|${c.start}|${c.end}`),
  });
  let chunks = planChunks(script.scenes, placed).map(named);
  /*
   * PATCH RENDER (El Niño news, Oct 2026: one wrong number card at 3:36, and an engine fix that changed the bundle
   * would have re-rendered all 8 chunks — two hours — for nine seconds). With patchScenes, a chunk that does not hold
   * (or touch) a patched scene reuses last render's file for the same content, whatever engine drew it; its sound too.
   */
  const MANIFEST = join(chunkDir, 'last-render.json');
  if (Array.isArray(patchScenes) && patchScenes.length) {
    const last = readJson(MANIFEST);
    let kept = 0;
    for (const c of chunks) {
      const touched = patchScenes.some((i) => i >= c.a - 1 && i <= c.b + 1);
      const ov = last?.chunks?.find((o) => o.vb === c.vb);
      if (!touched && ov && fileOk(ov.video) && !fileOk(c.video)) { c.video = ov.video; kept++; }
      const oa = last?.chunks?.find((o) => o.ab === c.ab);
      if (oa && fileOk(oa.audio) && !fileOk(c.audio)) c.audio = oa.audio;
    }
    log(`yama render: sahne ${patchScenes.join(', ')} — ${kept}/${chunks.length} parça son render'dan aynen alındı`);
  }

  // Per-video site: the bundle's code plus this video's assets as its public/.
  const site = join(workDir, 'site');
  mkdirSync(site, { recursive: true });
  for (const f of readdirSync(bundleDir)) {
    // Source maps too: the renderer opens bundle.js.map to symbolicate errors.
    if (f === 'public' || f.startsWith('.')) continue;
    cpSync(join(bundleDir, f), join(site, f), { recursive: true });
  }
  /*
   * public/ is a directory junction to the job's assets, not a copy: a long
   * video's public dir holds gigabytes (the score, every voice line), and the
   * copy was never deleted. Remotion's file server follows a junction in the
   * middle of a path. Falls back to copying where links are not allowed.
   */
  const sitePublic = join(site, 'public');
  const linked = publicDir !== sitePublic;
  if (linked) {
    removeLink(sitePublic);
    try {
      symlinkSync(publicDir, sitePublic, 'junction');
    } catch (e) {
      log(`public klasörü bağlanamadı (${e.code ?? e.message}); kopyalanıyor`);
      cpSync(publicDir, sitePublic, { recursive: true });
    }
  }
  let ok = false;
  try {
    const renderer = await import('@remotion/renderer');
    const { selectComposition, renderMedia, ensureBrowser, makeCancelSignal } = renderer;
    // selectComposition and every renderMedia open their own Chrome with Remotion's fixed 25 s connect wait, under
    // the same thermal guard as the cover drawer: the same 90 s wait (thumbnail.mjs, loaded here: it imports this file).
    const { raiseBrowserConnectTimeout } = await import('./thumbnail.mjs');
    raiseBrowserConnectTimeout(renderer);
    await ensureBrowser({ onBrowserDownload: () => {
      log('render tarayıcısı indiriliyor (ilk seferde bir kez, ~100 MB)');
      return { version: null, onProgress: () => {} };
    } });
    const serveUrl = site;
    const inputProps = { script };
    // GPU compositing (ANGLE/D3D11). Measured on the i5 + RTX 4050 laptop: 742 → 458 ms per
    // frame on the same range; the whole 41s sample went from ~15 min to 4.6 min.
    const chromiumOptions = { gl: process.env.DOCU_GL === 'software' ? null : 'angle' };
    const composition = await selectComposition({ serveUrl, id: 'video', inputProps, logLevel: 'error', chromiumOptions });
    if (composition.durationInFrames !== total) {
      // The keys describe the Node-side timeline; if the composition disagrees they would describe the wrong frames.
      log(`uyarı: kompozisyon ${composition.durationInFrames} kare, zaman çizelgesi ${total} kare — bu render önbelleksiz tek parça`);
      const once = `once-${Date.now().toString(36)}`;
      chunks = [{ a: 0, b: script.scenes.length - 1, start: 0, end: composition.durationInFrames - 1, video: join(chunkDir, `v-${once}.mp4`), audio: join(chunkDir, `a-${once}.wav`) }];
    }
    const frameCount = chunks.at(-1).end + 1;

    const need = chunks.map((c) => ({ v: !fileOk(c.video), a: !fileOk(c.audio), n: c.end - c.start + 1 }));
    // Relative cost per frame: picture+sound 1, picture only ~0.95, sound only ~0.25 (no screenshots).
    const weight = need.map((x) => x.n * ((x.v ? (x.a ? 1 : 0.95) : 0) + (!x.v && x.a ? 0.25 : 0)));
    const totalW = weight.reduce((a, b) => a + b, 0) || 1;
    const reused = need.filter((x) => !x.v && !x.a).length;
    log(`render: ${chunks.length} parça, ${fmtN(frameCount)} kare (${fmtMin(frameCount / FPS)})${reused ? `, ${reused} parça önbellekten` : ''}`);

    /*
     * Free space, before an hour of rendering: the new chunks, the joined
     * sound, the final file; Remotion's temp audio goes to the system temp
     * (where a killed render's leftovers are swept first).
     */
    sweepRemotionTemp({ log });
    const newFrames = need.reduce((a, x) => a + (x.v ? x.n : 0), 0);
    const needWork = newFrames * BYTES_PER_FRAME + frameCount * (BYTES_PER_FRAME + 2 * 6400) + 0.5e9;
    const needTmp = 1.5e9;
    const sameVolume = parsePath(chunkDir).root.toLowerCase() === parsePath(tmpdir()).root.toLowerCase();
    const freeWork = freeBytes(chunkDir);
    const freeTmp = sameVolume ? freeWork : freeBytes(tmpdir());
    if (freeWork !== null && freeWork < needWork + (sameVolume ? needTmp : 0)) {
      throw new Error(`Diskte yer yetmiyor: render için ~${gb(needWork + (sameVolume ? needTmp : 0))} GB gerekli, ${gb(freeWork)} GB boş (${parsePath(chunkDir).root}). Yer açıp "Kaldığı yerden devam et"; görsel, ses ve bitmiş render parçaları korunur.`);
    }
    if (!sameVolume && freeTmp !== null && freeTmp < needTmp) {
      throw new Error(`Geçici klasörün diskinde yer yetmiyor: ~${gb(needTmp)} GB gerekli, ${gb(freeTmp)} GB boş (${tmpdir()}). Yer açıp "Kaldığı yerden devam et".`);
    }

    /* One renderMedia call, retried once: a GPU process crash or a stalled tab must not end an hour-long job. */
    async function renderRange(opts, label, onP, temps) {
      for (let attempt = 1; ; attempt++) {
        if (cancelled()) throw cancelledError();
        const { cancelSignal, cancel } = makeCancelSignal();
        const timer = setInterval(() => cancelled() && cancel(), 1000);
        try {
          return await renderMedia({
            composition,
            serveUrl,
            inputProps,
            // More than 4 tabs bought nothing on the 8-core laptop (134 vs 138 ms/frame) and costs RAM.
            concurrency: concurrency ?? 4,
            logLevel: 'error',
            cancelSignal,
            timeoutInMilliseconds: 120_000,
            chromiumOptions,
            overwrite: true,
            onProgress: ({ progress: p }) => onP(p),
            ...opts,
          });
        } catch (e) {
          for (const f of temps) if (f) rmSync(f, { force: true });
          if (cancelled()) throw cancelledError();
          const msg = String(e?.message ?? e).slice(0, 300);
          if (attempt >= 2) throw Object.assign(new Error(`render ${label} başarısız: ${msg}`), { stack: `render ${label}: ${e?.stack ?? msg}` });
          log(`render ${label} hata verdi, bir kez daha deneniyor: ${msg.slice(0, 200)}`);
        } finally {
          clearInterval(timer);
        }
      }
    }

    /*
     * A long render must not look like a hang: a first estimate from the
     * measured cost (~140 ms a frame with picture and sound on the i5 + RTX
     * 4050 laptop), then after every chunk one from this machine's own pace.
     */
    const tStart = Date.now();
    if (totalW > 0 && weight.some(Boolean)) log(`render tahmini süresi: ~${fmtMin((totalW * 0.14))} (makineye göre değişir)`);
    let doneW = 0;
    for (const [k, c] of chunks.entries()) {
      if (cancelled()) throw cancelledError();
      const label = `${k + 1}/${chunks.length}`;
      const x = need[k];
      if (!weight[k]) continue;
      const t0 = Date.now();
      const onP = (p) => progress('render', 63 + ((doneW + weight[k] * clamp(p, 0, 1)) / totalW) * 34);
      log(`render ${label}: ${fmtN(x.n)} kare (${fmtMin(x.n / FPS)})${x.v ? '' : ', yalnız ses — görüntü önbellekten'}`);
      const tmpA = x.a ? c.audio.replace(/\.wav$/, `.tmp${process.pid}.wav`) : null;
      if (x.v) {
        const tmpV = c.video.replace(/\.mp4$/, `.tmp${process.pid}.mp4`);
        await renderRange({
          codec: VIDEO_RECIPE.codec,
          crf: VIDEO_RECIPE.crf,
          // Measured: medium 178 → veryfast 134 ms/frame at the same CRF. The master step
          // only copies this stream and YouTube re-encodes anyway.
          x264Preset: VIDEO_RECIPE.x264Preset,
          pixelFormat: VIDEO_RECIPE.pixelFormat,
          frameRange: [c.start, c.end],
          outputLocation: tmpV,
          ...(tmpA ? { separateAudioTo: tmpA } : { muted: true }),
        }, label, onP, [tmpV, tmpA]);
        if (!fileOk(tmpV) || (tmpA && !fileOk(tmpA))) throw new Error(`render ${label}: çıktı dosyası oluşmadı`);
        if (tmpA) renameSync(tmpA, c.audio);
        renameSync(tmpV, c.video);
      } else {
        await renderRange({ codec: 'wav', frameRange: [c.start, c.end], outputLocation: tmpA }, label, onP, [tmpA]);
        if (!fileOk(tmpA)) throw new Error(`render ${label}: ses dosyası oluşmadı`);
        renameSync(tmpA, c.audio);
      }
      doneW += weight[k];
      progress('render', 63 + (doneW / totalW) * 34);
      const left = doneW < totalW ? ((Date.now() - tStart) / doneW) * (totalW - doneW) : 0;
      log(`render ${label} bitti (${Math.round((Date.now() - t0) / 1000)} sn)${left > 0 ? `, kalan ~${fmtMin(left / 1000)}` : ''}`);
    }

    // Join: the picture by stream copy at master time (a list, no intermediate file), the sound into one WAV —
    // every sound chunk first cut to exactly its frames, so no seam shifts or repeats a sliver of sound.
    let fitted = 0;
    for (const c of chunks) if (fitWav(c.audio, c.end - c.start + 1)) fitted++;
    if (fitted) log(`render: ${fitted} ses parçası kare süresine denkleştirildi`);
    const list =(files) => files.map((f) => `file '${toPosix(f).replace(/'/g, "'\\''")}'`).join('\n') + '\n';
    const videoList = join(chunkDir, `${id}.video.txt`);
    const audioList = join(chunkDir, `${id}.audio.txt`);
    writeAtomic(videoList, list(chunks.map((c) => c.video)));
    writeAtomic(audioList, list(chunks.map((c) => c.audio)));
    const audio = join(workDir, `${id}.mix.wav`);
    const tmp = `${audio}.tmp.wav`;
    const r = ffSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', audioList, '-c', 'copy', '-f', 'wav', tmp], { maxBuffer: 16 * 1024 * 1024, timeout: ffDeadline(frameCount / FPS) });
    if (r.status !== 0 || !fileOk(tmp)) {
      rmSync(tmp, { force: true });
      throw new Error(`ses parçaları birleştirilemedi: ${String(r.stderr || r.error?.message || '').slice(-300)}`);
    }
    renameSync(tmp, audio);
    ok = true;
    writeAtomic(MANIFEST, JSON.stringify({ at: new Date().toISOString(), chunks: chunks.map(({ a, b, start, end, vb, ab, video, audio }) => ({ a, b, start, end, vb, ab, video, audio })) }));

    const current = new Set(chunks.flatMap((c) => [basename(c.video), basename(c.audio)]));
    return {
      video: videoList,
      audio,
      chunks: chunks.length,
      reused,
      cleanup: () => {
        for (const f of [videoList, audioList, audio]) rmSync(f, { force: true });
      },
      /** Keep this render's chunks, drop older ones (bounded disk: one render's worth per job). */
      prune: () => {
        for (const f of readdirSafe(chunkDir)) if (/^[va]-[\w-]+\.(mp4|wav)$/.test(f) && !current.has(f)) rmSync(join(chunkDir, f), { force: true });
      },
      drop: () => {
        for (const f of readdirSafe(chunkDir)) if (/^[va]-[\w-]+\.(mp4|wav)$/.test(f)) rmSync(join(chunkDir, f), { force: true });
        try {
          rmdirSync(chunkDir);
        } catch {}
      },
    };
  } finally {
    // The junction goes whether or not the render finished: nothing may later walk through it into the assets.
    if (linked) {
      try {
        removeLink(sitePublic);
        if (ok && !existsSync(sitePublic)) rmSync(site, { recursive: true, force: true });
      } catch (e) {
        log(`render klasörü temizlenemedi: ${e.message.slice(0, 100)}`);
      }
    }
  }
}

// Per-video style decisions, as pure data: how each picture is FITTED to the
// frame, which CAMERA move each shot gets, which EFFECTS a scene carries, and
// the video's transition PALETTE. Every choice the script leaves open is
// derived deterministically from its seed and genre, so two videos never cut
// or move alike, and a re-render is the same edit.
//
// Plain ESM (no React, no TS) for the same reason as timeline.js: the
// composition (src/Engine.tsx) draws these choices and Node (lib/produce.mjs)
// puts them in the render cache keys, so they must be computed by ONE function.

import { seeded } from '../timeline.js';

const W = 1920;
const H = 1080;
const FRAME_AR = W / H;

/** Genres whose photos are prints on a board (genres.ts `collage: true`; scripts/dump-effects.mjs checks they agree). */
export const COLLAGE_GENRES = new Set(['documentary', 'crime', 'inspire']);

/* ===================================================================== fit */

/**
 * FULL-BLEED RULE (the one place it lives; fx.tsx isLowRes / isLowResClip use
 * the same numbers): a LANDSCAPE picture or clip (1.25:1 .. 2.4:1) always
 * fills the frame, unless covering 1920x1080 would blow it up past ~1.9x its
 * own pixels (footage, watched in motion: 2.05x) — that one is shown whole,
 * framed on a soft plate of itself, instead of as an upscaled blur. Portrait,
 * square and panorama pictures are shown whole.
 */
export const BLEED_MIN_AR = 1.25;
export const BLEED_MAX_AR = 2.4;
export const coverUpscale = (w, h) => Math.max(W / w, H / h);
/*
 * BIG PORTRAIT AND SQUARE STILLS FILL TOO (1.16.16): measured on our last three films (Red Sea cables, AI bubble,
 * Black Buck), 16-23 photo scenes per film were small cards on a blurred plate, and most of them were not small at
 * all: 2160x2880, 2468x2880, 2560x2528 portraits and squares, shown whole only for their shape. The outliers show such
 * a picture full-bleed, cropped round its subject. A portrait or square still whose 16:9 cover crop needs at most
 * 1.35x its own pixels (≥ ~1420 px wide) now fills the frame round its focus (heads sit at the default focus); smaller
 * ones, panoramas, portrait footage (phone video) and marked documents/scans stay whole.
 */
export const PORTRAIT_BLEED_MAX_UP = 1.35;
export function fullBleedOK(w, h, video = false) {
  if (!w || !h || w <= 0 || h <= 0) return true;
  const a = w / h;
  if (a < BLEED_MIN_AR) return !video && coverUpscale(w, h) <= PORTRAIT_BLEED_MAX_UP;
  return a <= BLEED_MAX_AR && coverUpscale(w, h) <= (video ? 2.05 : 1.9);
}
export function isLowResStill(w, h) {
  if (!w || !h || w <= 0 || h <= 0) return false;
  return !fullBleedOK(w, h, false);
}
export function isLowResFootage(w, h) {
  if (!w || !h || w <= 0 || h <= 0) return false;
  return !fullBleedOK(w, h, true);
}

/** Pixel size of the scene's main picture (footage wins), or null when unknown. */
export function pictureSize(s) {
  const w = s?.video ? s.videoW ?? s.imgW : s?.imgW;
  const h = s?.video ? s.videoH ?? s.imgH : s?.imgH;
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Default focal point: where heads sit in a portrait crop. */
export const DEFAULT_FOCUS = [0.5, 0.3];

/**
 * FIT (smart): whole picture visible vs. cover-cropped to 16:9.
 *
 *  - explicit `fit` wins ('cover' | 'contain');
 *  - unknown size: cover (the old behaviour);
 *  - small / portrait / narrow scans and footage: contain (never blown up);
 *  - panoramas (> 2.1:1): contain — cover would cut more than ~15%;
 *  - otherwise cover unless the crop would cut into a safe band around the
 *    focus (faces, the subject) or throw away more than ~28% of the picture.
 *
 * @returns {'cover'|'contain'}
 */
export function resolveFit(s) {
  const size = pictureSize(s);
  // Too small / portrait / panorama: shown whole — even when the script asked for 'cover' (a 640x480 clip at 3x is a blur).
  if (size && (s.video ? isLowResFootage(size.w, size.h) : isLowResStill(size.w, size.h))) return 'contain';
  // A scan the pipeline marked as a document keeps its explicit 'contain'.
  if (s?.fit === 'contain' && (s.document || s.scan)) return 'contain';
  // Every landscape picture that holds up is FULL-BLEED, cover-cropped round its focus — whatever the script or bible asked.
  return 'cover';
}

/* ================================================================== camera */

export const CAMERA_KINDS = ['static', 'drift', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'detail-punch', 'parallax', 'handheld', 'rack-focus'];
/** Near-static holds for the hold quota. */
const HOLDS = new Set(['static', 'drift']);

/** Types whose full-frame picture the camera drives (collage prints and boards have their own camera). */
export function isPictureScene(s, collage) {
  if (!s || s.annotate) return false;
  const pic = !!(s.image || s.video || s.layers);
  if (s.type === 'photo') return !!s.image && !(collage && !s.natural && !s.fullBleed);
  if (s.type === 'words') return pic;
  if (s.type === 'title') return !s.chapterCard && pic;
  if (s.type === 'slam') return pic;
  return false;
}

const moodOf = (s) => s?.mood ?? 'curious';

function weightedPick(weights, r) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((n, [, w]) => n + w, 0);
  if (!total) return null;
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x < 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** The weights a scene's camera is drawn from (before the hold quota and the no-three-in-a-row rule). */
function cameraWeights(s, fit, size) {
  const mood = moodOf(s);
  const ar = size ? size.w / size.h : FRAME_AR;
  const video = !!s.video;
  const still = !video && !s.layers;
  const text = s.type === 'title' || s.type === 'slam';
  const fc = Array.isArray(s.focus) ? s.focus : DEFAULT_FOCUS;
  const panDir = fc[0] > 0.55 ? 'pan-right' : fc[0] < 0.45 ? 'pan-left' : null;
  const tiltDir = fc[1] < 0.45 ? 'tilt-up' : fc[1] > 0.55 ? 'tilt-down' : null;
  const w = {};
  // Moves only: holds (static, drift) are chosen by the hold quota in deriveStyle.
  if (fit === 'contain') {
    Object.assign(w, { 'push-in': 3, 'pull-out': 1.2 });
  } else if (ar > 1.9) {
    // Wide: pan across towards the subject.
    Object.assign(w, { [panDir ?? 'pan-right']: 6, ...(panDir ? {} : { 'pan-left': 6 }), 'push-in': 1 });
  } else if (ar < 1.7 && !text) {
    // Taller than the frame: tilt onto the focus (sometimes a slow lateral pan instead).
    Object.assign(w, { [tiltDir ?? 'tilt-up']: 3, 'push-in': 2.5, 'detail-punch': 1.5, parallax: still ? 1.2 : 0, 'pull-out': 1, [panDir ?? (fc[0] >= 0.5 ? 'pan-right' : 'pan-left')]: 0.8, 'rack-focus': still ? 0.6 : 0 });
  } else {
    Object.assign(w, { 'push-in': 3, 'pull-out': 1.5, 'detail-punch': 2, parallax: still ? 2 : 0, 'rack-focus': still ? 1 : 0 });
    if (panDir) w[panDir] = 1.2;
    if (tiltDir) w[tiltDir] = 0.8;
  }
  if (text) {
    delete w['detail-punch'];
    delete w['rack-focus'];
    delete w.parallax;
  }
  // Mood: calm and sad slow down and hold; tension and dread go handheld; a reveal punches in.
  if (mood === 'tension' || mood === 'dread') {
    w.handheld = (w.handheld ?? 0) + (fit === 'contain' ? 0 : 2.5);
    if (w['push-in']) w['push-in'] *= 1.4;
  }
  if (mood === 'calm' || mood === 'sad') {
    delete w.handheld;
    if (w['detail-punch']) w['detail-punch'] *= 0.4;
  }
  if (mood === 'reveal') {
    if (w['detail-punch']) w['detail-punch'] *= 1.6;
    if (w['rack-focus']) w['rack-focus'] *= 2;
    if (w['push-in']) w['push-in'] *= 1.3;
  }
  // Cut-ins need something to cut in on and time to do it.
  if (!(s.wordTimes?.length || s.keyword) || (s.dur ?? 0) < 3) delete w['detail-punch'];
  // Footage of unknown or small size is never cut into.
  if (video && !(size && size.w >= 1280)) delete w['detail-punch'];
  // Energy (the art director's 1-5): low energy holds, high energy pushes and punches.
  const e = energyOf(s);
  if (e >= 4) {
    for (const k of ['push-in', 'detail-punch', 'handheld']) if (w[k]) w[k] *= e === 5 ? 2 : 1.4;
    if (e === 5) delete w['pull-out'];
  }
  if (e && e <= 2) {
    for (const k of ['handheld', 'detail-punch']) delete w[k];
  }
  return w;
}

/** A scene's energy 1-5, or 0 when the script did not set one. */
export function energyOf(s) {
  const e = Math.round(Number(s?.energy));
  return e >= 1 && e <= 5 ? e : 0;
}
/** Camera speed multiplier for a DERIVED camera at each energy (3 = the mood alone). */
export const ENERGY_CAMERA = [1, 0.22, 0.6, 1, 1.45, 1.95];
/** Effect intensity multiplier at each energy. */
export const ENERGY_FX = [1, 0.55, 0.78, 1, 1.15, 1.3];

/** Why a scene wants to HOLD: small scans, text over the picture, a sad or calm beat. */
function holdBias(s, fit) {
  let b = 0;
  if (fit === 'contain') b += 0.35;
  const m = moodOf(s);
  if (m === 'sad' || m === 'calm') b += 0.3;
  if (s.type === 'words' && String(s.text ?? '').length > 70) b += 0.2;
  if (s.type === 'title' || s.type === 'slam') b += 0.15;
  if (m === 'tension' || m === 'reveal') b -= 0.15;
  const e = energyOf(s);
  if (e) b += [0, 0.9, 0.35, 0, -0.35, -2][e];
  if (s.pace === 'hold') b += 0.5;
  if (s.pace === 'quick' || s.pace === 'rapid') b -= 0.3;
  return b;
}

/* ================================================================= effects */

/**
 * Each genre's effect vocabulary, weighted. A video draws 5-7 of these as its
 * own set (so two crime videos do not share a look), then spends them on at
 * most ~35% of scenes. Picture camera moves are the camera's job, not here.
 */
const GENRE_FX = {
  documentary: { 'light-leak': 3, 'film-burn': 2, halftone: 3, dust: 3, 'flash-frame': 3, 'zoom-blur': 2, 'vignette-pulse': 1, chroma: 1, shake: 1, flare: 1, vhs: 1, bokeh: 1, 'dolly-zoom': 1, 'speed-ramp': 2 },
  finance: { glitch: 3, chroma: 3, 'scan-lines': 3, 'flash-frame': 2, 'zoom-blur': 2, halftone: 2, vhs: 1, shake: 1, 'vignette-pulse': 1, 'dolly-zoom': 1, 'speed-ramp': 2 },
  horror: { 'vignette-pulse': 1, dust: 3, vhs: 2, chroma: 2, 'flash-frame': 2, shake: 2, glitch: 1, 'film-burn': 1, 'dolly-zoom': 2, 'zoom-blur': 1, 'speed-ramp': 1 },
  crime: { vhs: 2, 'vignette-pulse': 1, chroma: 2, 'flash-frame': 3, 'scan-lines': 2, halftone: 2, glitch: 1, shake: 2, dust: 1, 'dolly-zoom': 1, 'zoom-blur': 1, 'speed-ramp': 2 },
  epic: { flare: 3, 'light-leak': 2, 'film-burn': 2, dust: 3, 'zoom-blur': 2, shake: 2, 'flash-frame': 2, bokeh: 1, 'vignette-pulse': 1, 'dolly-zoom': 1, 'speed-ramp': 2 },
  science: { flare: 3, bokeh: 3, 'scan-lines': 2, chroma: 2, 'light-leak': 1, 'zoom-blur': 2, glitch: 1, 'flash-frame': 2, 'speed-ramp': 2 },
  inspire: { 'light-leak': 3, bokeh: 3, 'film-burn': 2, flare: 2, dust: 1, halftone: 1, 'flash-frame': 1, 'zoom-blur': 1, 'speed-ramp': 2 },
};

/** Which moods each effect serves (mirrors catalog.ts; kept here so Node needs no TS). */
const FX_MOODS = {
  'light-leak': ['calm', 'sad', 'triumph', 'reveal', 'curious'],
  'film-burn': ['reveal', 'triumph', 'sad', 'curious'],
  flare: ['triumph', 'reveal', 'calm', 'curious'],
  chroma: ['tension', 'dread', 'reveal'],
  glitch: ['tension', 'dread', 'reveal'],
  'zoom-blur': ['reveal', 'tension', 'triumph', 'dread'],
  parallax: ['curious', 'calm', 'sad', 'reveal', 'triumph'],
  'speed-ramp': ['reveal', 'tension', 'triumph', 'dread'],
  halftone: ['curious', 'calm', 'sad', 'tension'],
  vhs: ['dread', 'tension', 'sad', 'curious'],
  dust: ['sad', 'calm', 'curious', 'dread'],
  'flash-frame': ['reveal', 'tension', 'dread', 'triumph'],
  'rack-focus': ['reveal', 'curious', 'sad', 'tension'],
  shake: ['tension', 'dread', 'reveal'],
  // Not on a sad beat any more: it blackened grieving lines (Gimli 20261028-9ff721, 29 Ekim 2026).
  'vignette-pulse': ['tension', 'dread'],
  'scan-lines': ['curious', 'tension', 'calm', 'dread'],
  bokeh: ['calm', 'triumph', 'sad', 'curious'],
  'push-in': ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'],
  'dolly-zoom': ['dread', 'tension', 'reveal'],
  'tilt-reveal': ['reveal', 'curious', 'triumph', 'calm'],
};
/** Needs a hit (keyword, slam, a spoken word) to land on. */
const HIT_FX = new Set(['flash-frame', 'chroma', 'glitch', 'flare', 'vignette-pulse', 'speed-ramp']);
/** Needs the scene's full-frame picture. */
const PICTURE_FX = new Set(['parallax', 'speed-ramp', 'rack-focus', 'push-in', 'dolly-zoom', 'tilt-reveal']);
/** Effects that only make sense layered over a photograph (not over type on a plain background). */
const OVER_PICTURE = new Set(['halftone', 'vhs', 'film-burn', 'dust']);
/** Texture looks: one per scene at most (a VHS halftone is noise). */
const TEXTURE = new Set(['halftone', 'vhs', 'dust', 'scan-lines']);
/** Scene types that draw their own camera and type work: overlays only, and fewer. */
const SELF_DRIVEN = new Set(['map', 'headline', 'board', 'document', 'timeline', 'split', 'quote', 'chart']);
/** Loud devices (edit-grammar.mjs FX_LOUD): only on an impact. */
const LOUD_FX = new Set(['flash-frame', 'shake', 'zoom-blur', 'speed-ramp', 'dolly-zoom']);
/** Hit-timed devices that need a real beat (impact, slam, keyword) — never "the stressed word" of a quiet line. */
const BEAT_FX = new Set(['chroma', 'glitch', 'vignette-pulse']);
/** vignette-pulse per film (edit-grammar.mjs VIGNETTE_PULSE_CAP). */
export const VIGNETTE_PULSE_CAP = 2;
/** Per-film caps for the engine's own picks: the pulse, and the loud devices at edit-grammar.mjs FX_CAP.open. */
const DERIVED_CAP = { 'vignette-pulse': VIGNETTE_PULSE_CAP, 'flash-frame': 3, shake: 1, 'zoom-blur': 2, 'speed-ramp': 2, 'dolly-zoom': 1 };

/** An impact (edit-grammar.mjs isImpact): energy 4-5, a slam, a reveal at energy 3+; never a quiet beat. */
export function isImpactScene(s) {
  const e = energyOf(s) || 3;
  const quiet = moodOf(s) === 'sad' || moodOf(s) === 'calm' || e <= 1 || s?.pace === 'hold' || s?.type === 'quote';
  return !quiet && (e >= 4 || s?.type === 'slam' || (moodOf(s) === 'reveal' && e >= 3));
}

/*
 * NARRATION BEAT (29 Ekim 2026, Gimli 20261028-9ff721 / Kartal Yuvası 950730; kanal sahibi "anlık efektler doğal
 * değil"): effects were sprinkled — the score was mostly a seeded random (x1.2), so quiet informative shots took a pulse
 * or a flash while real beats went clean. An effect now earns its place from what the narrator says: a spoken number,
 * a named entity (a capital not at a sentence start), a turn word (but / yet / then / suddenly / never ...), an impact,
 * a slam or the scene's keyword. Same idea as docu-art-director.js narrationBeat. 0 = a quiet informative shot.
 */
const TURN_WORDS = /\b(but|yet|then|suddenly|never|until|instead|however|except)\b/i;
const NUMBER_WORDS = /\b(hundreds?|thousands?|millions?|billions?|trillions?|dozens?|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/i;
const NOT_NAMES = new Set(['I', 'A', 'An', 'The', 'And', 'But', 'Or', 'It', 'He', 'She', 'They', 'We', 'You', 'His', 'Her', 'Their', 'This', 'That', 'In', 'On', 'At', 'Of']);
export function narrationBeat(s) {
  if (!s || (s.type === 'title' && s.chapterCard)) return 0;
  const say = String(s.say ?? (s.wordTimes ?? []).map((w) => w?.word ?? '').join(' ')).replace(/\[[^\]]*\]/g, ' ');
  let b = 0;
  if (s.type === 'slam') b += 1.2;
  else if (isImpactScene(s)) b += 0.9;
  if (s.keyword) b += 0.6;
  if (/\d/.test(say) || NUMBER_WORDS.test(say)) b += 0.5;
  const toks = say.split(/\s+/).filter(Boolean);
  const bare = (w) => w.replace(/[^\p{L}\p{N}'-]/gu, '');
  if (toks.some((w, i) => i > 0 && !/[.!?:…]["')\]]*$/.test(toks[i - 1]) && /^\p{Lu}/u.test(bare(w)) && bare(w).length >= 2 && !NOT_NAMES.has(bare(w)))) b += 0.4;
  if (TURN_WORDS.test(say)) b += 0.5;
  return +b.toFixed(2);
}
/** A scene below this beat stays clean, whatever the density asks. */
export const FX_BEAT_MIN = 0.5;
/** The seeded share of a placement score: a tie-break only. */
export const FX_TIE_BREAK = 0.1;

function fxFits(fx, s, collage) {
  const mood = moodOf(s);
  if (!(FX_MOODS[fx] ?? []).includes(mood)) return false;
  const pic = isPictureScene(s, collage);
  const hasPic = !!(s.image || s.video || s.layers);
  if (PICTURE_FX.has(fx) && !pic) return false;
  if (fx === 'speed-ramp' && !s.video) return false;
  if (fx === 'dolly-zoom' && (s.video || s.layers)) return false;
  if (OVER_PICTURE.has(fx) && !hasPic) return false;
  if (HIT_FX.has(fx) && !(s.keyword || s.type === 'slam' || s.wordTimes?.length || s.say)) return false;
  // Loud devices on impacts only; beat devices on a real beat; the pulse only on a dread/tension impact (29 Ekim 2026).
  const impact = isImpactScene(s);
  if (LOUD_FX.has(fx) && !impact) return false;
  if (BEAT_FX.has(fx) && !(impact || s.keyword || s.type === 'slam')) return false;
  if (fx === 'vignette-pulse' && !impact) return false;
  if (SELF_DRIVEN.has(s.type) && !['light-leak', 'dust', 'scan-lines', 'bokeh', 'flash-frame'].includes(fx)) return false;
  if (s.type === 'title' && s.chapterCard) return false;
  if (s.type === 'montage' && !['flash-frame', 'chroma', 'glitch', 'vhs', 'dust', 'halftone'].includes(fx)) return false;
  return true;
}

/* ============================================================= transitions */

/**
 * Transition candidates per genre (weights) and which of them may be the
 * chapter signature. A video keeps 3-4 as its palette plus 1-2 rare accents.
 */
const GENRE_TR = {
  documentary: { core: { flash: 3, whip: 2, 'film-burn': 2, 'light-sweep': 2, slide: 1.5, match: 2, zoom: 1.5, leak: 1.5, 'split-wipe': 1 }, accents: ['paper-tear', 'iris', 'dip-color', 'spin-blur', 'ink'], sig: ['flash', 'film-burn', 'light-sweep', 'dip-color', 'leak'] },
  finance: { core: { glitch: 3, whip: 2, pixel: 2, slide: 2, 'split-wipe': 2, flash: 1.5, 'light-sweep': 1, match: 1.5, zoom: 1 }, accents: ['spin-blur', 'dip-color', 'iris'], sig: ['glitch', 'pixel', 'split-wipe', 'light-sweep'] },
  horror: { core: { blackout: 3, flash: 1.5, zoom: 1.5, ink: 2, 'film-burn': 1, match: 2, 'dip-color': 1 }, accents: ['iris', 'glitch', 'spin-blur'], sig: ['blackout', 'ink', 'dip-color', 'iris'] },
  crime: { core: { blackout: 2.5, glitch: 2, whip: 2, flash: 1.5, slide: 1.5, 'split-wipe': 2, match: 2, pixel: 1 }, accents: ['iris', 'paper-tear', 'dip-color', 'ink'], sig: ['blackout', 'split-wipe', 'iris', 'glitch'] },
  epic: { core: { zoom: 2.5, 'film-burn': 2, 'light-sweep': 2, flash: 1.5, whip: 1.5, match: 2, leak: 1.5, 'dip-color': 1 }, accents: ['spin-blur', 'ink', 'iris'], sig: ['zoom', 'film-burn', 'light-sweep', 'dip-color'] },
  science: { core: { leak: 2, 'light-sweep': 2.5, zoom: 2, match: 2, flash: 1.5, pixel: 1, slide: 1.5, 'dip-color': 1 }, accents: ['iris', 'spin-blur', 'split-wipe'], sig: ['leak', 'light-sweep', 'dip-color', 'zoom'] },
  inspire: { core: { leak: 2.5, 'film-burn': 2, 'light-sweep': 2, match: 2, flash: 1, zoom: 1, 'dip-color': 1.5, ink: 1 }, accents: ['iris', 'slide', 'paper-tear'], sig: ['leak', 'film-burn', 'light-sweep', 'dip-color'] },
};

/** Statement transitions (timeline.js HEAVY): only ever on a story or mood turn. */
const HEAVY_TR = new Set(['blackout', 'iris', 'dip-color', 'ink', 'paper-tear']);

/** Picks `n` distinct keys by weight, seeded. */
function drawDistinct(weights, n, seed) {
  const left = { ...weights };
  const out = [];
  for (let k = 0; k < n && Object.keys(left).length; k++) {
    const pick = weightedPick(left, seeded(`${seed}${k}`));
    if (!pick) break;
    out.push(pick);
    delete left[pick];
  }
  return out;
}

/**
 * The video's transition vocabulary: a weighted pool for timeline.js
 * pickTransitions (repetition = weight), the chapter signature, and a small
 * per-video jitter on the genre's hard-cut share (pacing differs too).
 *
 * @param {object} script
 * @param {{genre:string, legacyPool?:string[], signature?:string}} o
 */
export function transitionStyle(script, { genre, legacyPool = [], signature }) {
  const seed = `${script.seedKey ?? script.id ?? ''}|tr`;
  const g = GENRE_TR[genre] ?? GENRE_TR.documentary;
  const jitter = (seeded(`${seed}cs`) - 0.5) * 0.14;
  if (Array.isArray(script.transitionPalette) && script.transitionPalette.length) {
    const pool = script.transitionPalette.filter((k) => k && k !== 'cut');
    return { pool: pool.length ? pool : legacyPool, signature: signature ?? pool[0], cutShareJitter: jitter, palette: [...new Set(pool)], accents: [] };
  }
  // The genre's identity kind (its legacy signature) stays in the palette most of the time.
  const n = 3 + (seeded(`${seed}n`) < 0.5 ? 1 : 0);
  const core = { ...g.core };
  if (signature && core[signature]) core[signature] *= 1.8;
  const palette = drawDistinct(core, n, `${seed}p`);
  // Plain cuts inside a run may only use light kinds: keep at least two in the palette, or the accents would fill in.
  const light = (k) => !HEAVY_TR.has(k);
  const lightCore = Object.fromEntries(Object.entries(core).filter(([k]) => light(k) && !palette.includes(k)));
  for (let k = 0; palette.filter(light).length < 2 && Object.keys(lightCore).length; k++) {
    const add = weightedPick(lightCore, seeded(`${seed}lt${k}`));
    palette.push(add);
    delete lightCore[add];
  }
  const accents = drawDistinct(Object.fromEntries(g.accents.filter((a) => !palette.includes(a)).map((a) => [a, 1])), seeded(`${seed}na`) < 0.4 ? 2 : 1, `${seed}a`);
  // Weights: the first palette kind leads, the rest follow; accents appear once.
  const pool = [];
  palette.forEach((k, i) => {
    for (let r = 0; r < (i === 0 ? 5 : 4); r++) pool.push(k);
  });
  pool.push(...accents);
  const sigList = g.sig.filter((k) => k !== 'match');
  const sig = seeded(`${seed}sig`) < 0.4 && signature ? signature : sigList[Math.floor(seeded(`${seed}sg`) * sigList.length)] ?? signature;
  return { pool, signature: sig, cutShareJitter: jitter, palette, accents };
}

/* ============================================================ the whole edit */

/**
 * Decide every open choice of a script's scenes: camera and fit for each
 * picture scene, effects for ~12-18% of scenes (never over 35%, only on a
 * narration beat, never the same effect on consecutive scenes), in a
 * video-specific vocabulary.
 *
 * Explicit script fields always win: `camera`/`fit` per scene; if ANY scene
 * has `fx`, no effects are derived (the art director decided, and "none" is a
 * decision too).
 *
 * @param {object} script
 * @param {{collage?: boolean}} o  collage = the genre lays photos out as prints on a board
 * @returns {{camera:(string|null)[], fit:(('cover'|'contain')|null)[], fx:string[][], vocab:string[], density:number}}
 */
export function deriveStyle(script, { collage = false } = {}) {
  const scenes = script.scenes ?? [];
  const seed = `${script.seedKey ?? script.id ?? ''}|st`;
  const genre = script.genre ?? 'documentary';
  const n = scenes.length;

  /* ---- fit + camera ---- */
  const fit = scenes.map((s) => (isPictureScene(s, collage) ? resolveFit(s) : null));
  const camera = new Array(n).fill(null);
  const picIdx = [];
  scenes.forEach((s, i) => {
    if (fit[i]) picIdx.push(i);
  });
  /*
   * Holds: ~32% of picture scenes are static or a slow drift. Energy 1 and
   * pace 'hold' always hold, energy 5 never; the rest of the quota goes to the
   * scenes that want it most (small scans, sad/calm beats, text over the
   * picture), with a seeded tie-break so the pattern is never regular.
   */
  const HOLD_SHARE = 0.32;
  const free = picIdx.filter((i) => !CAMERA_KINDS.includes(scenes[i].camera));
  const forced = new Set(free.filter((i) => energyOf(scenes[i]) === 1 || scenes[i].pace === 'hold'));
  const quota = Math.max(0, Math.round(HOLD_SHARE * picIdx.length) - forced.size);
  const holdSet = new Set(forced);
  free
    .filter((i) => !forced.has(i) && energyOf(scenes[i]) !== 5)
    .map((i) => ({ i, score: seeded(`${seed}ht${i}`) + holdBias(scenes[i], fit[i]) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, quota)
    .forEach(({ i }) => holdSet.add(i));
  let run = [];
  for (const i of picIdx) {
    const s = scenes[i];
    const size = pictureSize(s);
    let cam = CAMERA_KINDS.includes(s.camera) ? s.camera : null;
    if (!cam) {
      const weights = cameraWeights(s, fit[i], size);
      const e = energyOf(s);
      if (holdSet.has(i)) {
        // A still beat: hold, or drift slowly (never a drift on a contained scan at energy 1).
        cam = e === 1 || moodOf(s) === 'sad' || seeded(`${seed}hk${i}`) < 0.55 ? 'static' : 'drift';
      } else {
        cam = weightedPick(weights, seeded(`${seed}cam${i}`)) ?? 'push-in';
      }
      // Never the same move on three picture scenes in a row.
      if (run.length >= 2 && run[run.length - 1] === cam && run[run.length - 2] === cam) {
        const rest = holdSet.has(i) ? { static: 1, drift: 1 } : { ...weights };
        delete rest[cam];
        cam = weightedPick(rest, seeded(`${seed}cam${i}b`)) ?? (cam === 'push-in' ? 'pull-out' : 'push-in');
      }
    }
    camera[i] = cam;
    run.push(cam);
  }

  /* ---- effects ---- */
  const explicit = scenes.some((s) => Array.isArray(s.fx));
  // Default share lowered with the art director's minPictureFxShare (.22 -> .12, 29 Ekim 2026): fewer, earned effects.
  const density = Math.min(0.35, Math.max(0, Number.isFinite(script.fxDensity) ? script.fxDensity : 0.12 + seeded(`${seed}den`) * 0.06));
  const vocabBase = GENRE_FX[genre] ?? GENRE_FX.documentary;
  let vocab = Array.isArray(script.fxPalette) && script.fxPalette.length ? [...new Set(script.fxPalette)] : drawDistinct(vocabBase, 5 + Math.floor(seeded(`${seed}vn`) * 3), `${seed}v`);
  if (!vocab.length) vocab = Object.keys(vocabBase);
  const fx = scenes.map((s) => (Array.isArray(s.fx) ? [...s.fx] : []));
  if (!explicit && n) {
    const want = Math.floor(density * n);
    // Where an effect earns its place: the narration's beat (narrationBeat), a mood turn and energy a little; the seed only
    // breaks ties (<= FX_TIE_BREAK). A scene without a beat stays clean (FX_BEAT_MIN), even if the density is not reached.
    const score = scenes.map((s, i) => {
      if (s.type === 'title' && s.chapterCard) return -1;
      const beat = narrationBeat(s);
      if (beat < FX_BEAT_MIN) return -1;
      let p = beat + seeded(`${seed}sc${i}`) * FX_TIE_BREAK;
      const prev = scenes[i - 1];
      if (prev && moodOf(prev) !== moodOf(s)) p += 0.3;
      if (SELF_DRIVEN.has(s.type)) p -= 0.4;
      const e = energyOf(s);
      if (e) p += (e - 3) * 0.2;
      return p;
    });
    const order = scenes.map((_, i) => i).filter((i) => score[i] >= 0).sort((a, b) => score[b] - score[a] || a - b);
    const chosen = new Set();
    for (const i of order) {
      if (chosen.size >= want) break;
      // Never three effect scenes in a row: the look must breathe.
      if (chosen.has(i - 1) && chosen.has(i - 2)) continue;
      if (chosen.has(i + 1) && chosen.has(i + 2)) continue;
      if (chosen.has(i - 1) && chosen.has(i + 1)) continue;
      chosen.add(i);
    }
    const used = {};
    for (let i = 0; i < n; i++) {
      if (!chosen.has(i)) continue;
      const s = scenes[i];
      const ban = new Set([...(fx[i - 1] ?? []), ...(fx[i + 1] ?? [])]);
      const cands = vocab.filter((k) => !ban.has(k) && fxFits(k, s, collage) && (used[k] ?? 0) < (DERIVED_CAP[k] ?? Infinity));
      if (!cands.length) continue;
      // Rotate: an effect used recently weighs less, so the vocabulary is spent evenly.
      const weights = Object.fromEntries(cands.map((k) => [k, (vocabBase[k] ?? 1) / (1 + (used[k] ?? 0) * 0.8)]));
      const first = weightedPick(weights, seeded(`${seed}fx${i}`));
      const list = [first];
      // Sometimes a second, different-kind layer (a texture under a hit, a light over a camera move).
      // Only on an impact: a quiet beat never carries two devices (29 Ekim 2026).
      if (isImpactScene(s) && seeded(`${seed}fx2${i}`) < 0.22) {
        const second = cands.filter((k) => k !== first && !(TEXTURE.has(k) && TEXTURE.has(first)) && HIT_FX.has(k) !== HIT_FX.has(first));
        if (second.length) list.push(second[Math.floor(seeded(`${seed}fx2k${i}`) * second.length)]);
      }
      for (const k of list) used[k] = (used[k] ?? 0) + 1;
      fx[i] = list;
    }
  }
  return { camera, fit, fx, vocab, density };
}

/**
 * The explicit picture fx that are really camera moves: when a scene asks for
 * them and has no `camera`, they become its camera.
 */
export const FX_AS_CAMERA = { 'push-in': 'push-in', 'tilt-reveal': 'tilt-down', parallax: 'parallax', 'rack-focus': 'rack-focus' };

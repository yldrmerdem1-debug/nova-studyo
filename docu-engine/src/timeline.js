// The edit decision list of a docu video, as pure data: where every scene sits,
// how each cut is made, which sound effects fire, and how loud the music bed is
// on every frame.
//
// Plain ESM JavaScript with no React and no Remotion import, because two worlds
// need the SAME numbers:
//   - the composition (src/Engine.tsx, through the Remotion bundle) draws them;
//   - Node (lib/produce.mjs, tests, QA) writes subtitles, chapter marks and
//     checks budgets against them.
// If the two ever computed placement separately, subtitles would drift off the
// picture — that is exactly the bug this module exists to prevent.

// Infographic sound beats (plain JS as well: the same key frames the scenes draw from).
import { infoSfx } from './infographics/timing.js';

/* ================================================================ placement */

/**
 * Timing constants (seconds). The breath after a line is at least `floor`, and
 * a boundary may move at most `window` to land on a beat.
 */
export const TIMING = { tail: 0.4, floor: 0.3, window: 0.35 };

/** Index of the first value >= x in an ascending array. */
function lowerBound(arr, x) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Lay scenes on the timeline.
 *
 * A scene is planned at max(dur, voice + 0.4s). If the music's beats are
 * known, each boundary then moves onto a beat within ±0.35s, never earlier
 * than voice + 0.3s (a word is never cut off).
 *
 * ERROR DIFFUSION: the beat is chosen against the PLANNED end — the running
 * sum of unsnapped scene lengths — not against "this scene's start + its
 * length". Snapping each scene locally made the nudges add up as a random walk
 * (±2-3 s over 160 cuts), so the score's mood sections, which are sized from
 * the plan, slid away from their scenes. Aiming at the plan keeps every
 * boundary within one window of where the music expects it.
 *
 * @param {{dur:number, voiceDur?:number}[]} scenes
 * @param {number} fps
 * @param {number[]} beats  beat times in SECONDS (script.beats)
 * @returns {{from:number, frames:number}[]}
 */
export function placeTimeline(scenes, fps = 30, beats = []) {
  const grid = (beats ?? []).map((b) => Math.round(b * fps)).sort((a, b) => a - b);
  const window = Math.round(TIMING.window * fps);
  const last = scenes.length - 1;
  let at = 0;
  let planned = 0;
  return scenes.map((scene, index) => {
    const voice = scene.voiceDur ?? 0;
    const minFrames = Math.round(Math.max(scene.dur ?? 0, voice + TIMING.tail) * fps);
    planned += minFrames;
    let end = at + minFrames;
    if (grid.length && index < last) {
      const floor = at + Math.round((voice + TIMING.floor) * fps);
      // Unsnapped fallback also aims at the plan, so a stretch with no beat
      // (the tail, a beatless part) pays back earlier drift instead of keeping it.
      end = Math.max(planned, floor);
      let best = null;
      for (let k = lowerBound(grid, Math.max(floor, planned - window)); k < grid.length && grid[k] <= planned + window; k++) {
        const b = grid[k];
        if (best === null || Math.abs(b - planned) < Math.abs(best - planned)) best = b;
      }
      if (best !== null) end = best;
    }
    const out = { from: at, frames: Math.max(1, end - at) };
    at = at + out.frames;
    return out;
  });
}

/* =============================================================== seeded rng */

/** Deterministic 0..1 from a string (FNV-1a + murmur finaliser). Same seed, same edit. */
export function seeded(key) {
  let h = 2166136261 >>> 0;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/* ============================================================== transitions */

const moodOf = (s) => s?.mood ?? 'curious';
const chapterOf = (s) => s?.chapter ?? 0;
/** Scene types that are a beat of their own: the cut INTO them is made, not hidden. */
const STORY_TYPES = new Set(['slam', 'counter', 'chart', 'title']);
/**
 * A blackout is a full stop. It is spent on context boundaries only, never on
 * a plain cut; so are the other statement transitions (iris, a dip through a
 * colour, ink, a paper tear).
 */
const HEAVY = new Set(['blackout', 'iris', 'dip-color', 'ink', 'paper-tear']);
/** A match cut carries a focal point from picture to picture: both sides must be full-frame pictures. */
const MATCHABLE = (s) => !!s && (s.type === 'photo' || s.type === 'words' || (s.type === 'title' && !s.chapterCard)) && !!(s.image || s.video || s.layers);
export const canMatch = (prev, cur) => MATCHABLE(prev) && MATCHABLE(cur);
/** Which way a directional transition travels (slide, light sweep, spin): the picture and its whoosh pan agree. */
export function transitionDir(kind, index, seed = '') {
  return seeded(`${seed}dir${kind}${index}`) < 0.5 ? 1 : -1;
}

/**
 * Why a boundary exists, from the story's point of view.
 *  - chapter: a chapter card, or a chapter change without one
 *  - story:   into a slam / counter / chart / title, or out of the cold open
 *  - mood:    the emotion (and so the music section) changes
 *  - settle:  the first shot after a chapter card (a hard cut reads as "begin")
 * Anything else is a cut INSIDE a run of the same chapter and mood.
 */
export function boundaryContext(prev, cur) {
  const chapter = !!cur.chapterCard || (!prev.chapterCard && chapterOf(cur) !== chapterOf(prev));
  const mood = moodOf(cur) !== moodOf(prev);
  const story = !chapter && (STORY_TYPES.has(cur.type) || prev.type === 'montage');
  const settle = !!prev.chapterCard && !story && !mood;
  return { chapter, story, mood, settle, into: moodOf(cur) };
}

/**
 * Pick how every cut is made. Editors hide most cuts (hard cuts inside a
 * scene run) and spend stylized transitions where the story turns: a chapter
 * card gets the genre's signature, a mood change or a cut into a slam /
 * counter / chart / title gets a stylized one, and the plain cuts inside a
 * run are stylized only as often as the genre's hard-cut share allows. The
 * same stylized kind never comes twice in a row. Seeded, so re-renders match.
 *
 * @param {object[]} scenes
 * @param {{pool: string[], signature: string, cutShare: number, seed?: string}} o
 *   pool = weighted stylized kinds for this genre; cutShare = target share of hard cuts
 * @returns {string[]} one TransitionKind per scene (scene 0 is always 'cut')
 */
export function pickTransitions(scenes, { pool, signature, cutShare = 0.5, seed = '' }) {
  const n = scenes.length;
  const ctx = scenes.map((s, i) => (i ? boundaryContext(scenes[i - 1], s) : null));
  let forced = 0;
  let free = 0;
  for (let i = 1; i < n; i++) {
    const c = ctx[i];
    const own = scenes[i].transition;
    if (own) forced += own === 'cut' ? 0 : 1;
    else if (c.chapter || c.story || c.mood) forced++;
    else if (!c.settle) free++;
  }
  // How many free cuts may be stylized so the whole video lands on the genre's hard-cut share.
  const target = Math.round((1 - cutShare) * Math.max(0, n - 1));
  const pFree = free ? Math.min(0.9, Math.max(0, (target - forced) / free)) : 0;

  /*
   * First decide WHICH cuts are stylized: a fixed kind (the writer's own, or
   * the chapter signature), 'draw' (any kind), 'light' (no blackout), or a
   * hard cut. Free cuts use error diffusion with a jittered threshold, so the
   * share is exact over the video but the spacing is irregular — no metronome
   * of flashes.
   */
  const plan = n ? ['cut'] : [];
  let acc = seeded(`${seed}tr-acc`) * 0.5;
  for (let i = 1; i < n; i++) {
    const c = ctx[i];
    if (scenes[i].transition) plan.push({ fixed: scenes[i].transition });
    else if (c.chapter) plan.push({ fixed: signature });
    else if (c.story || c.mood) plan.push('draw');
    else if (c.settle) plan.push('cut');
    else {
      acc += pFree;
      const thr = 0.4 + seeded(`${seed}tj${i}`) * 0.6;
      if (acc >= thr) {
        acc -= 1;
        plan.push('light');
      } else plan.push('cut');
    }
  }
  /*
   * Then pick the kinds in order. A drawn kind differs from the stylized cut
   * before it AND from a fixed one right after it (a chapter signature), so
   * the same stylized kind never plays twice in a row.
   */
  const out = [];
  let last = null;
  for (let i = 0; i < n; i++) {
    const d = plan[i];
    let k;
    if (d === 'cut') k = 'cut';
    else if (typeof d === 'object') k = d.fixed;
    else {
      let nextFixed = null;
      for (let j = i + 1; j < n; j++) {
        if (plan[j] === 'cut') continue;
        if (typeof plan[j] === 'object') nextFixed = plan[j].fixed;
        break;
      }
      const ok = (x) => x !== 'cut' && (d === 'draw' || !HEAVY.has(x)) && (x !== 'match' || canMatch(scenes[i - 1], scenes[i]));
      let list = pool.filter((x) => ok(x) && x !== last && x !== nextFixed);
      if (!list.length) list = pool.filter((x) => ok(x) && x !== last);
      if (!list.length) list = pool.filter(ok);
      k = list.length ? list[Math.floor(seeded(`${seed}tr${i}`) * list.length)] : signature;
    }
    if (k !== 'cut') last = k;
    out.push(k);
  }
  return out;
}

/* ============================================================ voice ranges */

/** Absolute [start, end) frames of each scene's narration. */
export function voiceRanges(placed, scenes, fps) {
  const out = [];
  placed.forEach((p, i) => {
    const s = scenes[i];
    if (s.voice && s.voiceDur) out.push([p.from, p.from + Math.round(s.voiceDur * fps)]);
  });
  return out;
}

/**
 * Merge ranges whose gap is under `gap` frames. Continuous narration is one
 * range, so the bed stays down between lines instead of pumping up for 0.3s
 * after every sentence (~160 times in 12 minutes before this).
 */
export function mergeRanges(ranges, gap) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const prev = out[out.length - 1];
    if (prev && a - prev[1] < gap) prev[1] = Math.max(prev[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * A 0..1 gain curve that dips to `depth` inside the ranges: `attack` frames
 * before each range starts, `release` frames after it ends.
 */
export function duckCurve(ranges, total, { depth, attack, release }) {
  const out = new Float32Array(Math.max(0, total)).fill(1);
  for (const [a, b] of ranges) {
    for (let f = Math.max(0, a - attack); f < Math.min(total, b + release); f++) {
      let g = depth;
      if (f < a) g = 1 - ((f - (a - attack)) / attack) * (1 - depth);
      else if (f >= b) g = depth + ((f - b) / release) * (1 - depth);
      if (g < out[f]) out[f] = g;
    }
  }
  return out;
}

/* ============================================================== music bed */

/**
 * Bed depth under narration by the scene's mood, relative to the base.
 * MEASURED (27 Ekim 2026, ses denetimi; Çernobil 20261026-24122a, Fransa 20261020-37f9d2): one depth for every
 * mood (0.28 = -11 dB) left the bed only ~13.5 dB under the voice (loudest tenth ~11.5 dB); the rulebook and the
 * research ask >= 18 dB for dense narration. With base 0.55 (-5.2 dB), the score at -16 LUFS and the voice at
 * -19 these put the bed ~19.3 dB (sad/calm), ~17.6 dB (curious), ~16.2 dB (tension/dread) and ~15.3 dB
 * (reveal/triumph) under the voice: grief and calm lines get the most room, tension and reveal a little body.
 */
export const DUCK_BY_MOOD = { sad: 0.14, calm: 0.14, curious: 0.17, tension: 0.2, dread: 0.2, reveal: 0.22, triumph: 0.22 };

/** Music mix constants (frames at 30 fps unless noted). */
export const MIX = {
  /** Bed level under narration for a scene without a known mood (DUCK_BY_MOOD otherwise): ~ -15.4 dB. */
  duck: 0.17,
  /** Into a passage from a short-pause lift (~5 dB down) ... */
  attack: 5,
  /** ... and from a fully open bed (~15-17 dB down): 0.4 s, back under the voice just before the first word. */
  openAttack: 12,
  /** Ambience beds (ambienceEnvelope) release this fast after a passage. */
  release: 20,
  /**
   * Lines closer than this (2 s) are one continuous passage. At 1.2 s the bed rose 7 times in Chernobyl and
   * 9 times in France inside ordinary breaths (measured 27 Ekim 2026); hold through gaps < 1.5-2 s.
   */
  mergeGap: 60,
  /**
   * A pause shorter than `openGap` (4 s) may lift the bed at most +5 dB (x1.78 of its duck), reached over
   * `liftRise` frames and held — never a full release. Measured: in 1.2-4 s pauses the bed climbed the full
   * 11 dB to speech level (France 7:31.7: -26 -> -15 dBFS in ~1 s). Rulebook: "beds may rise at most +5 dB".
   */
  liftMax: 1.78,
  liftRise: 25,
  openGap: 120,
  /** Pauses >= 4 s, chapter cards, music windows and the closing hold open to full over this. */
  openRise: 36,
  /**
   * Music windows: after an emotional peak line (energy 5, mood reveal/sad/triumph, the last line of a
   * chapter) a pause of at least `windowMin` (3 s) opens fully even under 4 s — the score speaks after the
   * line has landed (Murch). About one per `windowEvery` (90 s); measured, music was up front only 4-5% of
   * the runtime and never after the emotional lines.
   */
  windowMin: 90,
  windowEvery: 2700,
  /**
   * Quotes and grief lines (scene.grief, or GRIEF in the narration): the bed comes down TO a level, not by a
   * fixed factor — `griefDuck` (0.14, the sad duck: ~20-21 dB under the voice) on a death line, `quoteDuck`
   * (0.12) under a quote — `griefIn` frames before the first word, recovering over `griefOut` after the line.
   * A line already at that depth (a sad scene) does not dip again. An emotional quote (mood sad/reveal,
   * energy <= 2) stops the music (the ambience stays). Measured 27 Ekim 2026: the bed played at full duck under
   * "The work killed twelve" (Kartal Yuvası 20261024-950730); the first fix (duck x0.4 on top of the sad duck
   * and the selector's -3 dB) put a death line's mournful track ~31 dB under the voice — inaudible, not felt.
   */
  griefDuck: 0.14,
  quoteDuck: 0.12,
  griefIn: 10,
  griefOut: 36,
  /**
   * Stop-down: the bed ramps out over [hit-35, hit-30] (a ~150 ms ramp, the
   * rulebook's slam protocol) and is TRULY silent for the last second before
   * the slam word — the word and the hit land in a hole the viewer can hear.
   * (It used to dip to 5% for ~0.3 s: measured, it read as a small dip, not a stop.)
   */
  stopLevel: 0,
  stopFrom: 35,
  stopTo: 30,
  /**
   * ... and stays out while the hit's tail rings (`hitTail`, 1.5 s), then returns over `hitReturn` (1.5 s)
   * to whatever the voice allows. It used to swell back ON the hit (+10 dB in 0.1 s, held 1.2 s): measured
   * 27 Ekim 2026 the music re-entered ~0.1 s after the hit, against the rulebook's "the tail rings, then
   * music returns over 1.5 s" — on "The work killed twelve" that stack was the loudest moment of the stretch.
   */
  hitTail: 45,
  hitReturn: 45,
  /** A `silence` scene: out over 6 frames, back over 36 (not a 4-frame jump mid-phrase). */
  silenceOut: 6,
  silenceIn: 36,
  /** The composed (non-library) score's end fade, = audio-director SCORE_FADE_OUT (3.5 s). */
  endFade: 105,
  /*
   * No end fade here: renderScore (audio-director.mjs) owns the single final fade (3.5 s, equal power).
   * Both fading made it quadratic (-12 dB at half way instead of -6; measured 27 Ekim 2026, the closing
   * music dropped away ~1 s early under the sonic logo).
   */
  /** Ambience beds sit ~4 dB lower under narration. */
  ambienceDuck: 0.63,
  /** Beds come back this long after a slam hit (its tail rings alone first), over `bedReturn` frames. */
  bedBack: 12,
  bedReturn: 45,
  /** Under the opening sonic logo the score starts at this share and opens up over `logoRamp` frames. */
  logoFloor: 0.5,
  logoRamp: 40,
};

const isTag = (w) => /^\[.*\]$/.test(w) || /^[—–-]+$/.test(w);

/* ------------------------------------------------------- grief and gravity */

/*
 * GRIEF: the narration states a real death or loss — the shared contract with the pipeline (scene.grief) and
 * the audio director; copied here because this file is bundled for the browser (no Node imports). A negated
 * or zero toll ("no one was killed") is checked first, per sentence.
 */
const GRIEF = /\b(died|dies|dying|killed|kills|dead|deaths?|death toll|funeral|buried|burial|mourn\w*|victims?|perished|executed|suicide|lost (?:his|her|their) li(?:fe|ves)|never (?:came|come) home)\b/i;
const NOT_GRIEF = /\b(no|not|never|nobody|no one|none|without|zero)\b[^.!?]{0,40}\b(killed|died|dead|deaths?|injur\w*|casualt\w*|victims?)\b/i;
/* Not a death that happened: a question, a condition, a legend or a claim (= audio-director GRIEF_UNREAL). */
const GRIEF_UNREAL = /\?\s*$|\b(if|unless|whether|legend\w*|myths?|mythical|rumou?r\w*|hoax|invented|fabricated|supposedly|claimed|alleged\w*)\b/i;
/* "Not one of the eight musicians survived": a death line (= audio-director NO_SURVIVOR). */
const NO_SURVIVOR = /\b(not one|none|no one|nobody|did not|didn't|never|not a single)\b[^.!?]{0,40}\bsurviv\w*/i;

/** True when a sentence of `text` (voice tags ignored) states a death or loss. */
export function griefText(text) {
  return String(text ?? '')
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .some((s) => ((GRIEF.test(s) && !NOT_GRIEF.test(s)) || NO_SURVIVOR.test(s)) && !GRIEF_UNREAL.test(s.trim()));
}
/** A grief line: the pipeline's flag (an explicit false wins over the words), else the fallback regex. */
export const isGrief = (s) => !!s && (s.grief === true || (s.grief !== false && griefText(s.say)));
/**
 * A grave moment: the scene's mood is sad or calm, or this or one of the next two lines states a death.
 * Rulebook: "There are no hits under calm or sad moods"; never a stinger under deaths or victims.
 * @param {string} [mood]  the mood that decides (a chapter card passes its incoming chapter's)
 */
export function graveAt(scenes, i, mood = scenes[i]?.mood) {
  if (mood === 'sad' || mood === 'calm') return true;
  for (let j = i; j <= i + 2 && j < scenes.length; j++) if (isGrief(scenes[j])) return true;
  return false;
}

/* ------------------------------------------------------------ bed curve */

/** Scene-local frame of the first spoken word (voice tags skipped), 0 when unknown. */
function firstWordAt(scene, fps) {
  for (const w of scene.wordTimes ?? []) if (!isTag(w.word)) return Math.max(0, Math.round(w.t * fps));
  return 0;
}

/** dB-linear (geometric) step from g0 to g1 at t in 0..1: a duck that moves evenly to the ear. */
const glide = (g0, g1, t) => (g0 > 0 && g1 > 0 ? g0 * Math.pow(g1 / g0, Math.min(1, Math.max(0, t))) : g0 + (g1 - g0) * Math.min(1, Math.max(0, t)));

/** An emotional peak line: the music may speak in the pause after it. */
const peakLine = (scenes, i) => {
  const s = scenes[i];
  if (!s) return false;
  if (s.energy === 5 || s.mood === 'reveal' || s.mood === 'sad' || s.mood === 'triumph') return true;
  // The last line of a chapter: no later line in the same chapter.
  for (let j = i + 1; j < scenes.length; j++) {
    if (scenes[j].chapterCard || chapterOf(scenes[j]) !== chapterOf(s)) return true;
    if (scenes[j].voice && scenes[j].voiceDur) return false;
  }
  return true;
};

/**
 * The bed under the narration, before stops and dips (0..1, base not applied):
 *  - inside a passage: the mood's duck depth (DUCK_BY_MOOD), gliding over ~0.7 s where the mood changes;
 *  - a pause < 4 s: lifts at most +5 dB (depth x1.78) over 25 frames and holds;
 *  - a pause >= 4 s, one holding a chapter card, a music window, the closing hold: opens to full over 36;
 *  - before the first line: full, down under the voice over 0.4 s.
 * @returns {{env: Float32Array, depth: Float32Array, pauses: {a:number, b:number, level:number, open:boolean, window:boolean}[]}}
 */
export function bedCurve({ placed, scenes, fps }) {
  const total = placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].frames : 0;
  const k = fps / 30;
  const fr = (n) => Math.max(1, Math.round(n * k));
  // Per-frame depth from the scene on screen, smoothed (moving average) so a mood change mid-passage glides.
  const raw = new Float32Array(total).fill(MIX.duck);
  placed.forEach((p, i) => {
    const d = DUCK_BY_MOOD[scenes[i]?.mood] ?? MIX.duck;
    for (let f = Math.max(0, p.from); f < Math.min(total, p.from + p.frames); f++) raw[f] = d;
  });
  const depth = new Float32Array(total);
  const half = fr(10);
  let sum = 0;
  let lo = 0;
  let hi = -1;
  for (let f = 0; f < total; f++) {
    while (hi < Math.min(total - 1, f + half)) sum += raw[++hi];
    while (lo < f - half) sum -= raw[lo++];
    depth[f] = sum / (hi - lo + 1);
  }

  // Passages: lines closer than mergeGap are one; each remembers the line that ends it.
  const lines = [];
  placed.forEach((p, i) => {
    const s = scenes[i];
    if (s?.voice && s.voiceDur) lines.push({ a: p.from, b: Math.min(total, p.from + Math.round(s.voiceDur * fps)), i });
  });
  lines.sort((x, y) => x.a - y.a);
  const gap = fr(MIX.mergeGap);
  const passages = [];
  for (const l of lines) {
    const prev = passages[passages.length - 1];
    if (prev && l.a - prev.b < gap) {
      if (l.b >= prev.b) prev.last = l.i;
      prev.b = Math.max(prev.b, l.b);
    } else passages.push({ a: l.a, b: l.b, last: l.i });
  }

  const env = new Float32Array(total).fill(1);
  if (!passages.length) return { env, depth, pauses: [] };
  const cards = placed.filter((p, i) => scenes[i]?.chapterCard).map((p) => [p.from, p.from + p.frames]);
  const pauses = [];
  let lastWindow = -Infinity;
  for (let n = 0; n < passages.length; n++) {
    const { a, b, last } = passages[n];
    for (let f = Math.max(0, a); f < Math.min(total, b); f++) env[f] = depth[f];
    const next = passages[n + 1]?.a ?? total;
    const len = next - b;
    if (len <= 0) continue;
    const closing = n === passages.length - 1;
    const card = cards.some(([x, y]) => x < next && y > b);
    const peak = !closing && peakLine(scenes, last);
    const long = closing || card || len >= fr(MIX.openGap);
    // A window: a peak line's pause long enough to hold one, about 90 s from the last. A long pause after a
    // peak line opens anyway, and spends the budget like one.
    const spaced = b - lastWindow >= fr(MIX.windowEvery);
    const window = !long && peak && spaced && len >= fr(MIX.windowMin);
    if (peak && spaced && (window || long)) lastWindow = b;
    const open = long || window;
    const from = depth[Math.max(0, b - 1)];
    const to = closing ? 1 : depth[Math.min(total - 1, next)];
    const level = open ? 1 : Math.min(1, from * MIX.liftMax);
    const rise = fr(open ? MIX.openRise : MIX.liftRise);
    const fall = closing ? 0 : fr(open ? MIX.openAttack : MIX.attack);
    for (let f = Math.max(0, b); f < Math.min(total, next); f++) {
      // Up from the line's end, down into the next line's first word; a pause too short for both meets halfway.
      const up = glide(from, level, (f - b) / rise);
      env[f] = fall ? Math.min(up, glide(level, to, (f - (next - fall)) / fall)) : up;
    }
    pauses.push({ a: b, b: next, level, open, window });
  }
  // Before the first line: full, then down under the voice.
  const a0 = passages[0].a;
  const fall0 = fr(MIX.openAttack);
  for (let f = Math.max(0, a0 - fall0); f < Math.min(total, a0); f++) env[f] = glide(1, depth[Math.min(total - 1, a0)], (f - (a0 - fall0)) / fall0);
  return { env, depth, pauses };
}

/**
 * The music bed's gain on every frame, precomputed once (was evaluated per
 * frame with a scan over every line).
 *
 * @param {{placed:{from:number,frames:number}[], scenes:object[], fps:number, base?:number,
 *          hits?: {scene:number, f:number}[], sfx?: {kind:string, at:number}[]}} o
 *   hits = punch frames (scene-local): slam landings and the montage hook
 *   sfx  = the planSfx cues (absolute frames): every other hit or stinger (a chapter card, a blackout)
 *          also keeps the music out while its tail rings
 *   logo = true when the sonic logo opens the video: the score starts under it at
 *          MIX.logoFloor and opens up over MIX.logoRamp, so the two never fight
 * @returns {Float32Array} absolute gain per frame (base already applied)
 */
export function musicEnvelope({ placed, scenes, fps, base = 0.55, hits = [], sfx = [], logo = false, endFade = false }) {
  const total = placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].frames : 0;
  const k = fps / 30;
  const fr = (n) => Math.round(n * k);
  const { env } = bedCurve({ placed, scenes, fps });

  /*
   * Quotes and grief lines: the bed comes down to MIX.quoteDuck / griefDuck just before the first word and
   * recovers after the line; an emotional quote (mood sad/reveal, energy <= 2) stops it — the room tone carries the words.
   */
  const dip = new Float32Array(total).fill(1);
  placed.forEach((p, i) => {
    const s = scenes[i];
    if (!s?.voice || !s.voiceDur) return;
    const quote = s.type === 'quote';
    if (!quote && !isGrief(s)) return;
    const own = DUCK_BY_MOOD[s.mood] ?? MIX.duck;
    const to = quote && (s.mood === 'sad' || s.mood === 'reveal') && (s.energy ?? 3) <= 2 ? 0 : Math.min(1, (quote ? MIX.quoteDuck : MIX.griefDuck) / own);
    if (to >= 1) return;
    const w0 = p.from + firstWordAt(s, fps);
    const end = p.from + Math.round(s.voiceDur * fps);
    const din = Math.max(1, fr(MIX.griefIn));
    const dout = Math.max(1, fr(MIX.griefOut));
    for (let f = Math.max(0, w0 - din); f < Math.min(total, end + dout); f++) {
      let g = to;
      if (f < w0) g = 1 - ((f - (w0 - din)) / din) * (1 - to);
      else if (f >= end) g = to + (1 - to) * Math.sin((Math.PI / 2) * ((f - end) / dout));
      if (g < dip[f]) dip[f] = g;
    }
  });
  for (let f = 0; f < total; f++) env[f] *= dip[f];

  // Silence scenes: the held breath. Out quickly, back slowly onto whatever level the voice allows.
  const sil = new Float32Array(total).fill(1);
  placed.forEach((p, i) => {
    if (!scenes[i].silence) return;
    const a = p.from;
    const b = p.from + p.frames;
    const out = fr(MIX.silenceOut);
    const back = fr(MIX.silenceIn);
    for (let f = Math.max(0, a - out); f < Math.min(total, b + back); f++) {
      let g = 0;
      if (f < a) g = 1 - (f - (a - out)) / out;
      else if (f >= b) g = (f - b) / back;
      if (g < sil[f]) sil[f] = g;
    }
  });
  for (let f = 0; f < total; f++) env[f] *= sil[f];

  /*
   * Stop-down before a punch: the bed drops out ~1 s before the slam word and
   * the word and the hit land in the hole. The hit's tail then rings alone for
   * 1.5 s and the music returns over 1.5 s, onto whatever level the voice
   * allows (no swell on the hit: see MIX.hitTail).
   */
  const hole = new Float32Array(total).fill(1);
  const tail = fr(MIX.hitTail);
  const back = Math.max(1, fr(MIX.hitReturn));
  const after = (at) => {
    for (let f = Math.max(0, at); f < Math.min(total, at + tail + back); f++) {
      const g = f < at + tail ? 0 : Math.sin((Math.PI / 2) * ((f - at - tail) / back));
      if (g < hole[f]) hole[f] = g;
    }
  };
  const punches = [];
  for (const h of hits) {
    const p = placed[h.scene];
    if (!p) continue;
    const at = p.from + h.f;
    punches.push(at);
    const a0 = at - fr(MIX.stopFrom);
    const a1 = at - fr(MIX.stopTo);
    for (let f = Math.max(0, a0); f < Math.min(total, at); f++) {
      const t = f < a1 ? (f - a0) / Math.max(1, a1 - a0) : 1;
      const g = 1 - t * (1 - MIX.stopLevel);
      if (g < hole[f]) hole[f] = g;
    }
    after(at);
  }
  // Every other hit (a chapter card's, a blackout's): out over 4 frames onto the hit, then the same tail and return.
  for (const c of sfx) {
    if ((c.kind !== 'hit' && c.kind !== 'stinger') || punches.some((x) => Math.abs(x - c.at) <= fr(3))) continue;
    const pre = Math.max(1, fr(4));
    for (let f = Math.max(0, c.at - pre); f < Math.min(total, c.at); f++) {
      const g = 1 - (f - (c.at - pre)) / pre;
      if (g < hole[f]) hole[f] = g;
    }
    after(c.at);
  }
  for (let f = 0; f < total; f++) env[f] *= hole[f];

  if (logo) {
    const ramp = fr(MIX.logoRamp);
    for (let f = 0; f < Math.min(total, ramp); f++) env[f] *= MIX.logoFloor + (1 - MIX.logoFloor) * Math.sin((Math.PI / 2) * (f / ramp));
  }
  // No end fade for a library score: renderScore's single 3.5 s equal-power fade ends it (see MIX). A composed
  // (ElevenLabs) score has no fade of its own (composeScore joins its parts with no afade): `endFade` gives it the
  // same 3.5 s equal-power fade here, or it is cut off on the last frame.
  if (endFade) {
    const n = Math.min(total, fr(MIX.endFade));
    for (let j = 0; j < n; j++) env[total - 1 - j] *= Math.sin((Math.PI / 2) * (j / n));
  }
  for (let f = 0; f < total; f++) env[f] *= base;
  return env;
}

/**
 * Where the room must be empty: the second before every slam word (the
 * stop-down hole) and the first moments of the hit's own tail. Absolute
 * frames [from, to). Beds drop out here (rulebook: "beds drop to silence
 * before a slam") and foley never plays inside.
 *
 * @param {{placed:{from:number}[], hits:{scene:number,f:number}[], fps:number}} o
 */
export function slamHoles({ placed, hits = [], fps }) {
  const k = fps / 30;
  const out = [];
  for (const h of hits) {
    const p = placed[h.scene];
    if (!p) continue;
    const at = p.from + h.f;
    out.push([Math.max(0, at - Math.round(MIX.stopFrom * k)), at + Math.round(MIX.bedBack * k)]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * The ambience beds' shared gain per frame: ~4 dB down under narration, and
 * out through every slam hole — a 5-frame ramp into it, then back over 1.5 s
 * once the hit has rung (rulebook: "beds and music return with a 1.5 s fade-in").
 */
export function ambienceEnvelope({ placed, scenes, fps, hits = [] }) {
  const total = placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].frames : 0;
  const k = fps / 30;
  const voiced = mergeRanges(voiceRanges(placed, scenes, fps), Math.round(MIX.mergeGap * k));
  const env = duckCurve(voiced, total, { depth: MIX.ambienceDuck, attack: Math.round(MIX.attack * k), release: Math.round(MIX.release * k) });
  const ramp = Math.max(1, Math.round((MIX.stopFrom - MIX.stopTo) * k));
  const back = Math.max(1, Math.round(MIX.bedReturn * k));
  for (const [a, b] of slamHoles({ placed, hits, fps })) {
    for (let f = Math.max(0, a); f < Math.min(total, b + back); f++) {
      let g = 0;
      if (f < a + ramp) g = 1 - (f - a) / ramp;
      else if (f >= b) g = Math.sin((Math.PI / 2) * ((f - b) / back));
      env[f] *= Math.max(0, g);
    }
  }
  return env;
}

/* ============================================================ J / L cuts */

/**
 * How ambience beds meet the picture cut (seconds). A place is HEARD before it
 * is seen: the next bed starts `jLead` before the cut (longer on a chapter or
 * mood turn), and the old room lingers `lTail` after it. Two beds meeting on a
 * cut cross with an equal-power fade over [cut - jLead, cut + lTail].
 */
export const BED_XF = { jLead: 0.65, jLeadTurn: 0.8, jMin: 0.5, lTail: 0.5, settleIn: 0.6, settleOut: 0.5 };

/**
 * Frame windows of every ambience bed, J/L-cut against the picture.
 *
 * @param {{placed:{from:number,frames:number}[], scenes:object[], beds:{fromScene:number,toScene:number}[], fps:number, total?:number}} o
 * @returns {{start:number, end:number, inA:number, inB:number, outA:number, outB:number, cutIn:number, cutOut:number}[]}
 *   start/end = the bed's audible span; [inA,inB] its fade-in, [outA,outB] its fade-out (equal power)
 */
export function bedWindows({ placed, scenes, beds, fps, total }) {
  const T = total ?? (placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].frames : 0);
  const sec = (s) => Math.round(s * fps);
  const edgeOf = (i) => (i >= placed.length ? T : placed[i].from);
  const lead = (i) => {
    // The lead never reaches back more than half of the shot before the cut.
    if (i <= 0 || !placed[i - 1]) return 0;
    const c = boundaryContext(scenes[i - 1] ?? {}, scenes[i] ?? {});
    const want = sec(c.chapter || c.mood ? BED_XF.jLeadTurn : BED_XF.jLead);
    return Math.max(Math.min(sec(BED_XF.jMin), Math.floor(placed[i - 1].frames / 2)), Math.min(want, Math.floor(placed[i - 1].frames / 2)));
  };
  const tail = (i) => Math.min(sec(BED_XF.lTail), placed[i] ? Math.floor(placed[i].frames / 2) : 0);
  const list = beds.map((b) => ({ a: Math.max(0, b.fromScene), z: Math.min(placed.length - 1, b.toScene) }));
  return list.map(({ a, z }, k) => {
    const cutIn = edgeOf(a);
    const cutOut = edgeOf(z + 1);
    const prev = list[k - 1];
    const next = list[k + 1];
    const joinedIn = !!prev && prev.z + 1 === a;
    const joinedOut = !!next && next.a === z + 1;
    const jIn = lead(a);
    const lOut = tail(z + 1);
    // A meeting cut: both sides use the same window, so their gains are cos/sin of one ramp.
    const inA = Math.max(0, cutIn - jIn);
    const inB = joinedIn ? Math.min(T, cutIn + tail(a)) : Math.min(T, cutIn + sec(BED_XF.settleIn));
    const outA = joinedOut ? Math.max(0, cutOut - lead(z + 1)) : Math.max(0, cutOut - sec(BED_XF.settleOut));
    const outB = Math.min(T, cutOut + lOut);
    return { start: inA, end: Math.max(inA + 1, outB), inA, inB: Math.max(inA + 1, inB), outA: Math.max(inB, outA), outB: Math.max(outA + 1, outB), cutIn, cutOut };
  });
}

/** Equal-power gain of a bed window at absolute frame f: sin up through the fade-in, cos down through the fade-out. */
export function bedGainAt(w, f) {
  if (f < w.inA || f >= w.outB) return 0;
  let g = 1;
  if (f < w.inB) g *= Math.sin((Math.PI / 2) * ((f - w.inA) / Math.max(1, w.inB - w.inA)));
  if (f >= w.outA) g *= Math.cos((Math.PI / 2) * ((f - w.outA) / Math.max(1, w.outB - w.outA)));
  return Math.max(0, Math.min(1, g));
}

/**
 * A literal one-shot whose word lands right after a cut may start before it
 * (pre-lap): the sound leads the picture into the scene. At most this long,
 * and never back into a slam or a chapter card.
 */
export const PRELAP_MAX = 0.8;

/* =========================================================== sound design */

/** Budget rules for sound effects (seconds). */
export const SFX_RULES = {
  /** Seconds between two story hits (chapter card, slam, montage hook): closer ones are dropped. */
  storyHitGap: 20,
  /** A decorative cue stands down when anything else sounds within this. */
  decorGap: 0.9,
  /** At most this many decorative cues (whoosh, glitch, swell, thud) in any 30 s. */
  decorPer30: 3,
  /** Whooshes on their own: at most 2 per 30 s (~1 per 15 s). */
  whooshPer30: 2,
  /** A non-slam, non-chapter hit is dropped when another hit fired within this. */
  hitGap: 20,
  /** Horror / crime transition hits are rarer still. */
  darkHitGap: 45,
  /**
   * Risers: at least this far apart, and at most `riserMax` per film (slams first, then chapter cards in
   * film order, then the writer's other risers). Measured 27 Ekim 2026: Chernobyl had 12 risers, 7 of them
   * within 60 s of the one before (0:29.2 -> 0:43.7); rulebook "3-6 per 10-15 min, none within 60 s".
   */
  riserGap: 60,
  riserMax: 6,
  /**
   * A chapter card's sound by the mood of the chapter it opens: tension/dread a riser + a hit, reveal a hit
   * only, curious/triumph none, sad/calm (grave) a soft swell or nothing. Every card used to get riser 0.55 +
   * hit 0.6 — the same trailer treatment 7 times in Chernobyl, the triumph card included.
   */
  cardHit: 0.4,
  cardSwell: 0.2,
  /** A slam on a grave line (sad/calm, or a death in it or the next two lines): a low thud, no hit, no stinger, no riser. */
  graveThud: 0.35,
  /** A blackout into a reveal/dread on a grave line: a thud at most this loud instead of the 0.85 hit. */
  graveBlackout: 0.4,
};

const DECOR = new Set(['whoosh', 'glitch', 'swell', 'thud']);
const WHOOSHY = new Set(['flash', 'zoom', 'whip', 'slide', 'light-sweep', 'spin-blur', 'split-wipe', 'paper-tear']);
/**
 * The sound under each newer transition, from the existing pools: a burn, an
 * ink bleed, a dip and a match cut swell; a pixel break glitches; an iris is
 * a lens shutter. (The whooshy ones above; blackout and glitch keep their rules.)
 */
export const TRANSITION_SFX = { 'film-burn': 'swell', ink: 'swell', 'dip-color': 'swell', match: 'swell', pixel: 'glitch', iris: 'snap' };

/**
 * Which way a transition's whoosh travels across the stereo field. A whip
 * slides the new shot in from the right (fx.tsx entranceStyle: x 900 -> 0),
 * so its air moves right to left; a zoom punches straight at the viewer and
 * stays centred; a flash is a pass-by, alternating sides by seed.
 * @returns {'lr'|'rl'|undefined}
 */
export function whooshPan(transition, index, seed = '', dirSeed = null) {
  if (transition === 'whip') return 'rl';
  if (transition === 'flash') return seeded(`${seed}pan${index}`) < 0.5 ? 'lr' : 'rl';
  // Pair transitions travel the way their picture moves (effects/transitions.tsx uses the same direction).
  if (dirSeed !== null && dirSeed !== undefined) {
    const d = transitionDir(transition, index, dirSeed);
    if (transition === 'slide') return d > 0 ? 'rl' : 'lr';
    if (transition === 'light-sweep' || transition === 'spin-blur') return d > 0 ? 'lr' : 'rl';
  }
  return undefined;
}

/** True when a cue at `t` keeps every `win`-frame window at or under `max` cues. */
function windowOk(list, t, win, max) {
  const near = list.filter((x) => Math.abs(x - t) < win);
  near.push(t);
  near.sort((a, b) => a - b);
  for (let a = 0, b = 0; b < near.length; b++) {
    while (near[b] - near[a] >= win) a++;
    if (b - a + 1 > max) return false;
  }
  return true;
}

/**
 * Plan every sound effect cue. Pure data: the composition resolves files and
 * placement (each file's own peak), tests count budgets.
 *
 * Rules an editor follows by hand:
 *  - story beats always sound: slam hits, the montage hook, chapter cards
 *    (by the incoming chapter's mood: tension/dread riser + hit, reveal a hit,
 *    curious/triumph nothing), risers the writer asked for, counter ticks,
 *    montage shutters
 *  - grave lines (mood sad/calm, or a death stated in this or the next two
 *    lines) get no hit, no stinger and no riser: a slam lands on a low thud,
 *    a chapter card on a soft swell (nothing when a death is near), a blackout
 *    on a thud
 *  - risers at least 60 s apart, at most 6 per film
 *  - a blackout gets a real hit only into a chapter card or on a mood change
 *    into dread/reveal, and only if no other hit fired within ~20 s (45 s in
 *    horror/crime); every other blackout gets a quiet thud, as decoration
 *  - dread slams in horror/crime get a stinger layered on the hit
 *  - decoration (whoosh, glitch, swell, thud) yields: 0.9 s from anything
 *    else, at most 3 per 30 s, whooshes at most 2 per 30 s; turning points are
 *    served first, then plain stylized cuts, keyword swells last
 *  - decoration and risers play lower while the narrator speaks
 *
 * @param {object} o
 * @param {{from:number,frames:number,transition:string}[]} o.placed
 * @param {object[]} o.scenes
 * @param {number} o.fps
 * @param {string} o.genre  genre id
 * @param {{slam?:number, hook?:number, cuts?:number[], keyword?:number, press?:number, count?:number}[]} o.marks  scene-local frames
 * @param {number[]} [o.events]  absolute frames of literal event cues (decoration keeps clear of them)
 * @returns {{key:string, kind:string, at:number, align:'onset'|'peak'|'end', gain:number, pan?:'lr'|'rl', tight?:boolean}[]}
 *   `at` = the frame the sound's peak (or, for 'end', its end) must land on; `tight` = start at most ~0.12 s before that peak
 */
export function planSfx({ placed, scenes, fps, genre, marks, events = [], seed = null }) {
  const cues = [];
  const all = [...events];
  const decor = [];
  const whooshes = [];
  const hitsAt = [];
  const dark = genre === 'horror' || genre === 'crime';
  const voiced = voiceRanges(placed, scenes, fps);
  const underVoice = (t) => voiced.some(([a, b]) => t >= a - 3 && t < b);
  const sec = (s) => Math.round(s * fps);

  /*
   * LESS POUNDING (user, Oct 2026: "heryere vuruculuğu kesip tam uyumlu editler koymamız lazım"): story hits stay at
   * least SFX_RULES.storyHitGap apart — a hit that would land closer to the last one is simply not placed.
   */
  let lastPlaced = false;
  const story = (key, kind, at, gain, align = 'onset') => {
    lastPlaced = !(kind === 'hit' && hitsAt.some((h) => Math.abs(h - at) < sec(SFX_RULES.storyHitGap)));
    if (!lastPlaced) return false;
    cues.push({ key, kind, at, align, gain });
    all.push(at);
    if (kind === 'hit') hitsAt.push(at);
    return true;
  };
  /*
   * GRAVE LINES (27 Ekim 2026, ses denetimi): a hit 1.0 landed on "The work killed twelve" (mood sad, Kartal
   * Yuvası 20261024-950730) as the loudest moment of its stretch, a sub-heavy blackout hit went into the
   * Chernobyl death toll, a stinger on "was anyone actually killed?" (France). A chapter card takes the mood
   * of the chapter it opens.
   */
  const cardInto = (i) => scenes[i + 1]?.mood ?? scenes[i]?.mood ?? 'curious';
  const isCard = (s) => s?.type === 'title' && !!s.chapterCard;
  const grave = scenes.map((s, i) => graveAt(scenes, i, isCard(s) ? cardInto(i) : s?.mood));
  const griefNear = (i) => [i, i + 1, i + 2].some((j) => isGrief(scenes[j]));

  /*
   * Which risers play: slams (and the montage hook) first, then chapter cards in film order, then the
   * writer's other risers — each SFX_RULES.riserGap from every other, at most SFX_RULES.riserMax. None on a
   * grave line ("risers and impacts" are forbidden under grief).
   */
  const riserWants = [];
  placed.forEach((p, i) => {
    const s = scenes[i];
    const m = marks[i] ?? {};
    if (grave[i]) return;
    if (isCard(s)) {
      if (cardInto(i) === 'tension' || cardInto(i) === 'dread') riserWants.push({ pri: 1, key: `cr${i}`, at: p.from });
    } else if (s.type === 'slam') {
      if (s.riser) riserWants.push({ pri: 0, key: `r${i}`, at: p.from + (m.slam ?? sec(1)) });
    } else if (s.type === 'montage') {
      if (s.riser && m.hook !== undefined) riserWants.push({ pri: 0, key: `mr${i}`, at: p.from + m.hook });
    } else if (s.riser) riserWants.push({ pri: 2, key: `r${i}`, at: p.from });
  });
  const risers = new Set();
  const riserAt = [];
  for (const w of riserWants.sort((a, b) => a.pri - b.pri || a.at - b.at)) {
    if (riserAt.length >= SFX_RULES.riserMax || riserAt.some((t) => Math.abs(t - w.at) < sec(SFX_RULES.riserGap))) continue;
    risers.add(w.key);
    riserAt.push(w.at);
  }
  const riser = (key, at, gain) => risers.has(key) && story(key, 'riser', at, underVoice(at - sec(0.8)) ? gain * 0.7 : gain, 'end');
  /*
   * A punch that lands in the stop-down hole starts at most ~0.12 s before its
   * peak (`tight`): a trailer hit whose build sits 1 s ahead of its peak would
   * otherwise fill the second of silence the music just made for it.
   */
  const tight = () => {
    if (lastPlaced) cues[cues.length - 1].tight = true;
  };

  // An infographic's decorative whoosh (the scale's pull-out) waits for pass 2's budget.
  const infoWants = [];
  // A grave chapter card's soft swell: decoration, served before the transitions' own sounds.
  const cardWants = [];
  // Pass 1 — the story beats. Always placed.
  placed.forEach((p, i) => {
    const s = scenes[i];
    const m = marks[i] ?? {};
    if (isCard(s)) {
      const into = cardInto(i);
      if (grave[i]) {
        // A sad/calm chapter opens on a soft swell; one that opens on a death, on nothing.
        if (!griefNear(i)) cardWants.push({ pri: 0, key: `cs${i}`, kind: 'swell', at: p.from, gain: SFX_RULES.cardSwell, align: 'peak' });
      } else if (into === 'tension' || into === 'dread') {
        riser(`cr${i}`, p.from, 0.55);
        story(`ch${i}`, 'hit', p.from, SFX_RULES.cardHit);
      } else if (into === 'reveal') {
        story(`ch${i}`, 'hit', p.from, SFX_RULES.cardHit);
      }
      // curious / triumph: no riser, no hit — the music's own turn carries the card.
    } else if (s.type === 'slam') {
      const hit = p.from + (m.slam ?? sec(1));
      if (grave[i]) {
        // The word lands on a low body blow: no hit, no stinger, no riser (and the music does not swell).
        story(`s${i}`, 'thud', hit, SFX_RULES.graveThud);
        tight();
      } else {
        const sting = dark && s.mood === 'dread';
        story(`s${i}`, 'hit', hit, sting ? 0.85 : 1);
        tight();
        if (sting) {
          story(`st${i}`, 'stinger', hit, 0.7);
          tight();
        }
        if (s.riser) riser(`r${i}`, hit, 0.6);
      }
    } else if (s.riser && s.type !== 'montage') {
      riser(`r${i}`, p.from, 0.6);
    }
    // A counter counts in silence under the music: a mechanical tick bed under the roll sounded
    // cheap ("çık çık", 1453 0:33) — its weight comes from the landing and the narration.
    // Infographics ask for their own beats (src/infographics/timing.js): ticks under a count, a snap on a landing.
    infoSfx(s, p.frames, fps).forEach((c, k) => {
      if (c.kind === 'whoosh') infoWants.push({ pri: 1, key: `iw${i}_${k}`, kind: 'whoosh', at: p.from + c.f, gain: c.gain, align: c.align ?? 'peak' });
      else story(`i${i}_${k}`, c.kind, p.from + c.f, c.gain);
    });
    // A newspaper headline landing on the page (Engine marks it as `press`).
    if (m.press !== undefined) story(`n${i}`, 'snap', p.from + m.press, 0.5);
    if (s.type === 'montage') {
      (m.cuts ?? []).forEach((c, k) => story(`m${i}_${k}`, 'snap', p.from + c, k ? 0.55 : 0.8));
      if (m.hook !== undefined) {
        // A montage hook on a grave line punches like a grave slam: a thud, no riser.
        story(`mh${i}`, grave[i] ? 'thud' : 'hit', p.from + m.hook, grave[i] ? SFX_RULES.graveThud : 1);
        tight();
        if (s.riser) riser(`mr${i}`, p.from + m.hook, 0.55);
      }
    }
  });

  // Pass 2 — decoration, served in priority order: turning points first.
  const wants = [...cardWants, ...infoWants];
  placed.forEach((p, i) => {
    if (!i) return;
    const s = scenes[i];
    const t = p.transition;
    const c = boundaryContext(scenes[i - 1], s);
    const turning = c.chapter || c.mood || c.story;
    // A grave chapter card is heard as its soft swell or not at all: no whoosh or glitch on its transition.
    if (isCard(s) && grave[i]) return;
    if (t === 'blackout') {
      if (isCard(s)) return; // its hit (or its silence) is already decided
      if (s.type === 'slam') {
        // The word's own hit is the payoff; the black before it only needs body if the word comes late.
        if ((marks[i]?.slam ?? 0) > sec(1.5)) wants.push({ pri: 0, key: `b${i}`, kind: 'thud', at: p.from, gain: 0.28 });
        return;
      }
      const gap = sec(dark ? SFX_RULES.darkHitGap : SFX_RULES.hitGap);
      if (c.mood && (c.into === 'dread' || c.into === 'reveal')) {
        // Into a death toll the black falls on a thud, never on the 0.85 trailer hit.
        if (grave[i]) {
          wants.push({ pri: 0, key: `b${i}`, kind: 'thud', at: p.from, gain: SFX_RULES.graveBlackout });
          return;
        }
        if (!hitsAt.some((h) => Math.abs(h - p.from) < gap)) {
          story(`b${i}`, 'hit', p.from, 0.85);
          return;
        }
      }
      wants.push({ pri: 0, key: `b${i}`, kind: 'thud', at: p.from, gain: 0.28 });
      return;
    }
    if (WHOOSHY.has(t)) wants.push({ pri: turning ? 0 : 1, key: `w${i}`, kind: 'whoosh', at: p.from, gain: t === 'split-wipe' ? 0.38 : 0.45, align: 'peak', pan: whooshPan(t, i, genre, seed) });
    if (t === 'glitch') wants.push({ pri: turning ? 0 : 1, key: `g${i}`, kind: 'glitch', at: p.from, gain: 0.45 });
    const own = TRANSITION_SFX[t];
    if (own === 'swell') wants.push({ pri: turning ? 0 : 1, key: `x${i}`, kind: 'swell', at: p.from, gain: t === 'match' ? 0.24 : 0.34, align: 'peak' });
    else if (own) wants.push({ pri: turning ? 0 : 1, key: `x${i}`, kind: own, at: p.from, gain: own === 'snap' ? 0.4 : 0.42 });
  });
  // A heard transition sells the cut; a keyword swell only underlines a word, so it gets what is left.
  placed.forEach((p, i) => {
    const kw = marks[i]?.keyword;
    if (kw !== undefined) wants.push({ pri: 2, key: `k${i}`, kind: 'swell', at: p.from + kw, gain: 0.3, align: 'peak' });
  });
  wants.sort((a, b) => a.pri - b.pri || a.at - b.at);
  const W = sec(30);
  for (const w of wants) {
    if (all.some((t) => Math.abs(t - w.at) < sec(SFX_RULES.decorGap))) continue;
    if (!windowOk(decor, w.at, W, SFX_RULES.decorPer30)) continue;
    if (w.kind === 'whoosh' && !windowOk(whooshes, w.at, W, SFX_RULES.whooshPer30)) continue;
    const gain = underVoice(w.at) ? w.gain * 0.6 : w.gain;
    cues.push({ key: w.key, kind: w.kind, at: w.at, align: w.align ?? 'onset', gain, ...(w.pan ? { pan: w.pan } : {}) });
    all.push(w.at);
    decor.push(w.at);
    if (w.kind === 'whoosh') whooshes.push(w.at);
  }
  return cues.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

/** True for the kinds the budget treats as decoration. */
export const isDecorative = (kind) => DECOR.has(kind);

/* ================================================================== foley */

/** Small on-screen action sounds, all mixed well under the narrator (~-20..-26 dB). */
export const FOLEY_KINDS = ['paper', 'pen', 'shutter', 'pin', 'type', 'page'];

/** Foley budget (seconds). */
export const FOLEY_RULES = {
  /** At most one foley moment (a shutter + its pin is one moment) per this long. */
  gap: 1.2,
  /** The same sound again only after this long: a shutter on every card of a board reads as a machine gun. */
  sameGap: { shutter: 5, type: 3, paper: 3, pen: 2, pin: 2, page: 0 },
  /** A hit or stinger keeps this clear on either side: foley under an impact is only mud. */
  clearOfHits: 0.3,
  /** Around a slam the hole stays empty a little longer than the beds' own hole. */
  slamPre: 0.2,
  slamPost: 0.6,
};
/* When two moments compete, the chapter's page turn wins, then a card landing, then paper, pen and type. */
const FOLEY_PRI = { page: 0, shutter: 1, pin: 1, paper: 2, pen: 3, type: 4 };

/**
 * Plan the foley: paper when a front page appears, a pen scratching along a
 * map route, a shutter and a pin when a print lands on the board, typewriter
 * ticks under typed text, a page turn out of a chapter card. The composition
 * says WHERE each action happens (scene-local frames); this decides which of
 * them are heard under the density budget.
 *
 * @param {object} o
 * @param {{from:number,frames:number}[]} o.placed
 * @param {object[]} o.scenes
 * @param {number} o.fps
 * @param {{scene:number, f:number, kind:string, align?:'onset'|'peak', dur?:number, group?:string}[]} o.wants
 *   f = scene-local frame (may be negative: a pre-lap), dur = frames to play (pen/type run with the action)
 * @param {{scene:number, f:number}[]} [o.hits]  slam / hook punches (scene-local): no foley in their hole
 * @param {{kind:string, at:number}[]} [o.sfx]  the planSfx cues: hits and stingers keep clear
 * @returns {{key:string, kind:string, at:number, align:'onset'|'peak', gain:number, dur?:number}[]}
 */
export function planFoley({ placed, scenes, fps, wants = [], hits = [], sfx = [] }) {
  const total = placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].frames : 0;
  const sec = (s) => Math.round(s * fps);
  const holes = slamHoles({ placed, hits, fps }).map(([a, b]) => [a - sec(FOLEY_RULES.slamPre), b + sec(FOLEY_RULES.slamPost)]);
  const loud = sfx.filter((c) => c.kind === 'hit' || c.kind === 'stinger').map((c) => c.at);
  const voiced = voiceRanges(placed, scenes, fps);
  const underVoice = (t) => voiced.some(([a, b]) => t >= a - 3 && t < b);

  const groups = new Map();
  wants.forEach((w, n) => {
    const p = placed[w.scene];
    if (!p || !FOLEY_KINDS.includes(w.kind) || !Number.isFinite(w.f)) return;
    const at = p.from + Math.round(w.f);
    if (at < 0 || at >= total) return;
    const id = `${w.scene}:${w.group ?? `${w.kind}${n}`}`;
    const g = groups.get(id) ?? { id, scene: w.scene, members: [], at: Infinity, pri: 9 };
    g.members.push({ ...w, at });
    g.at = Math.min(g.at, at);
    g.pri = Math.min(g.pri, FOLEY_PRI[w.kind] ?? 5);
    groups.set(id, g);
  });
  const order = [...groups.values()].sort((a, b) => a.pri - b.pri || a.at - b.at || a.id.localeCompare(b.id));
  const taken = [];
  const byKind = {};
  const cues = [];
  for (const g of order) {
    const span = g.members.map((m) => [m.at, m.at + Math.max(0, m.dur ?? 0)]);
    const inHole = span.some(([a, b]) => holes.some(([x, y]) => a < y && Math.max(a + 1, b) > x));
    if (inHole) continue;
    if (g.members.some((m) => loud.some((h) => Math.abs(h - m.at) < sec(FOLEY_RULES.clearOfHits)))) continue;
    if (taken.some((t) => Math.abs(t - g.at) < sec(FOLEY_RULES.gap))) continue;
    if (g.members.some((m) => (byKind[m.kind] ?? []).some((t) => Math.abs(t - m.at) < sec(FOLEY_RULES.sameGap[m.kind] ?? 0)))) continue;
    taken.push(g.at);
    g.members.forEach((m, k) => {
      (byKind[m.kind] ??= []).push(m.at);
      cues.push({
        key: `fo${g.scene}_${m.kind}${k}_${m.at}`,
        kind: m.kind,
        at: m.at,
        align: m.align ?? 'onset',
        gain: underVoice(m.at) ? 0.85 : 1,
        ...(m.dur ? { dur: Math.max(2, Math.round(m.dur)) } : {}),
      });
    });
  }
  return cues.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}

/* ================================================================= flicker */

/**
 * Flicker strength per frame: only where the mood is uneasy (dread full,
 * tension partial), and never within ±6 frames of a punch — a dip on a slam
 * or keyword frame reads as a glitch and hides the text.
 *
 * @param {{placed:{from:number,frames:number}[], scenes:object[], impacts:number[][]}} o
 *   impacts = scene-local punch frames per scene
 */
export function flickerCurve({ placed, scenes, impacts }) {
  const total = placed.length ? placed[placed.length - 1].from + placed[placed.length - 1].frames : 0;
  const out = new Float32Array(total);
  placed.forEach((p, i) => {
    const mood = moodOf(scenes[i]);
    const v = mood === 'dread' ? 1 : mood === 'tension' ? 0.6 : 0;
    if (!v) return;
    for (let f = p.from; f < Math.min(total, p.from + p.frames); f++) out[f] = v;
  });
  placed.forEach((p, i) => {
    for (const imp of impacts[i] ?? []) {
      const c = p.from + imp;
      for (let f = Math.max(0, c - 6); f <= Math.min(total - 1, c + 6); f++) out[f] = 0;
    }
  });
  return out;
}

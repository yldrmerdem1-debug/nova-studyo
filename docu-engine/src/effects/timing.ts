/**
 * When effects happen: the scene's word hits. No React, no imports from
 * scenes.tsx (scenes.tsx imports this for the detail-punch camera).
 */

type WordTime = { word: string; t: number };

const isTag = (w: string) => /^\[.*\]$/.test(w) || /^[—–-]+$/.test(w) || !/[\p{L}\p{N}]/u.test(w);

/**
 * The narrator's stressed word when nothing marks one: the word after the
 * longest pause (a breath before a word is how a line leans on it), inside the
 * middle of the scene; failing that, the longest word there. Scene-local frame.
 */
export function emphasisFrame(wordTimes: WordTime[] | undefined, durFrames: number, fps: number): number | null {
  const words = (wordTimes ?? []).filter((w) => w && Number.isFinite(w.t) && !isTag(String(w.word)));
  if (words.length < 2) return null;
  const lo = Math.max(0.6 * fps, durFrames * 0.2);
  const hi = durFrames * 0.9;
  let best: { f: number; gap: number } | null = null;
  for (let i = 1; i < words.length; i++) {
    const f = Math.round(words[i].t * fps);
    if (f < lo || f > hi) continue;
    const gap = words[i].t - words[i - 1].t;
    if (!best || gap > best.gap) best = { f, gap };
  }
  if (best && best.gap >= 0.38) return best.f;
  let long: { f: number; n: number } | null = null;
  for (const w of words) {
    const f = Math.round(w.t * fps);
    if (f < lo || f > hi) continue;
    const n = String(w.word).replace(/[^\p{L}\p{N}]/gu, '').length;
    if (!long || n > long.n) long = { f, n };
  }
  return long && long.n >= 6 ? long.f : best?.f ?? null;
}

/** An impact strong enough for a hit-timed effect to land on (the seeded 0.2 "keep it alive" push is not one). */
export const REAL_IMPACT = 0.3;

/** The scene's strongest real impact (keyword, slam, hook, counter land), or null when the line has none. */
export function impactHit(impacts: { f: number; strength: number }[], durFrames: number): number | null {
  const strong = impacts.filter((i) => i.strength >= REAL_IMPACT && i.f >= 0 && i.f < durFrames).sort((a, b) => b.strength - a.strength || a.f - b.f);
  return strong.length ? strong[0].f : null;
}

/*
 * The scene's main hit for EFFECTS: its strongest real impact, and nothing when there is none. It used to fall back to
 * the stressed word of any line (emphasisFrame), so a flash, a flare bloom or a vignette tightening fired on quiet
 * informative shots with no beat at all — "anlık efektler doğal değil" (kanal sahibi, Gimli 20261028-9ff721 / Kartal
 * Yuvası 950730, 29 Ekim 2026). A hit-timed effect without a real impact now skips. Camera moves (detail-punch) may
 * still land on the stressed word: `wordFallback: true`.
 */
export function mainHit(
  impacts: { f: number; strength: number }[],
  wordTimes: WordTime[] | undefined,
  durFrames: number,
  fps: number,
  o: { wordFallback?: boolean } = {},
): number | null {
  const hit = impactHit(impacts, durFrames);
  if (hit !== null) return hit;
  return o.wordFallback ? emphasisFrame(wordTimes, durFrames, fps) : null;
}

/**
 * The detail-punch camera: hold wide, cut in on the focus AT the hit word,
 * hold ~1.4-2 s, cut back out (and once more on a long shot). Same shape as
 * scenes.tsx ReframePlan (odd frames cut in, even ones out).
 */
export function punchPlan(
  o: { wordTimes?: WordTime[]; durFrames: number; fps: number; impacts: { f: number; strength: number }[]; seed: number; cap: number },
): { frames: number[]; tight: number; aims: [number, number][] } {
  const { durFrames, fps } = o;
  const tight = Math.min(o.cap, 1.2 + o.seed * 0.16);
  if (tight < 1.08 || durFrames < 2.4 * fps) return { frames: [], tight: 1, aims: [] };
  let at = mainHit(o.impacts, o.wordTimes, durFrames, fps, { wordFallback: true }) ?? Math.round(durFrames * 0.42);
  at = Math.max(Math.round(0.7 * fps), Math.min(at, durFrames - Math.round(1.2 * fps)));
  const frames = [at];
  const back = at + Math.round((1.4 + o.seed * 0.6) * fps);
  if (back < durFrames - Math.round(0.7 * fps)) {
    frames.push(back);
    const again = back + Math.round(1.8 * fps);
    if (again < durFrames - Math.round(1.6 * fps)) frames.push(again);
  }
  const aims = frames.map((_, k): [number, number] => (k === 0 ? [0, 0] : [o.seed < 0.5 ? -0.12 : 0.12, 0.05]));
  return { frames, tight, aims };
}

/**
 * Pace cut-ins (scene `pace`): quick = 1-2 cut-ins, rapid = 3-4 short ones,
 * each on a spoken word (the strong hits first), alternating crops around the
 * focus: face, a side, the other side, lower. Odd frames cut in, even ones
 * back out (the ReframePlan shape).
 */
export function pacePlan(
  o: { wordTimes?: WordTime[]; durFrames: number; fps: number; impacts: { f: number; strength: number }[]; seed: number; cap: number; rapid: boolean },
): { frames: number[]; tight: number; aims: [number, number][] } {
  const { durFrames, fps, rapid } = o;
  const tight = Math.min(o.cap, rapid ? 1.24 + o.seed * 0.1 : 1.2 + o.seed * 0.14);
  if (tight < 1.08) return { frames: [], tight: 1, aims: [] };
  const want = rapid ? (durFrames > 4.5 * fps ? 4 : 3) : durFrames > 4 * fps ? 2 : 1;
  const hold = Math.round((rapid ? 0.55 : 1.1) * fps);
  const gap = Math.round((rapid ? 0.3 : 0.6) * fps);
  const lo = Math.round(0.5 * fps);
  const hi = durFrames - Math.round(0.45 * fps);
  // Candidate landings: strong impacts, then every spoken word, in time order.
  const words = (o.wordTimes ?? []).filter((w) => w && Number.isFinite(w.t) && !isTag(String(w.word))).map((w) => Math.round(w.t * fps));
  const strong = o.impacts.filter((i) => i.strength >= 0.3).map((i) => i.f);
  const cands = [...new Set([...strong, ...words])].filter((f) => f >= lo && f <= hi - hold).sort((a, b) => a - b);
  // Even spread when the voice gives nothing to land on.
  if (cands.length < want) for (let k = 0; k < want; k++) cands.push(Math.round(lo + ((hi - hold - lo) * (k + 0.5)) / want));
  cands.sort((a, b) => a - b);
  const frames: number[] = [];
  let next = lo;
  // Aim at evenly spaced targets through the scene, snapping to the nearest candidate at or after it.
  for (let k = 0; k < want; k++) {
    const target = lo + ((hi - hold - lo) * k) / Math.max(1, want - (rapid ? 0.6 : 0.4));
    const c = cands.find((x) => x >= Math.max(next, target - gap));
    if (c === undefined || c > hi - hold) break;
    const out = Math.min(hi, c + hold);
    frames.push(c, out);
    next = out + gap;
  }
  // A rapid run may stay tight on its last cut-in instead of returning wide at the very end.
  if (rapid && frames.length && frames[frames.length - 1] >= hi - 2) frames.pop();
  const AIMS: [number, number][] = [
    [0, 0],
    [-0.14, 0.04],
    [0.14, 0.06],
    [0, 0.2],
  ];
  const rot = Math.floor(o.seed * 4);
  const aims = frames.map((_, k): [number, number] => AIMS[(Math.floor(k / 2) + rot) % AIMS.length]);
  return { frames, tight, aims };
}

/**
 * Speed ramp as a time remap over `len` frames: a touch fast, easing into
 * slow motion (~0.35x) around the hit, then recovering. Normalised so the
 * clip uses exactly the same footage as without the ramp (it never asks for a
 * frame past the usable end). Returns the source frame for each output frame.
 */
export function speedRampMap(len: number, hit: number | null): Float64Array {
  const out = new Float64Array(Math.max(1, len));
  if (len < 8) {
    for (let i = 0; i < len; i++) out[i] = i;
    return out;
  }
  const h = Math.max(4, Math.min(len - 4, hit ?? Math.round(len * 0.45)));
  const rate = (f: number) => {
    const d = f - h;
    if (d < -14) return 1.45;
    if (d < -4) return 1.45 - ((d + 14) / 10) * (1.45 - 0.32);
    if (d < 26) return 0.32;
    if (d < 40) return 0.32 + ((d - 26) / 14) * (1.1 - 0.32);
    return 1.1;
  };
  let acc = 0;
  for (let i = 0; i < len; i++) {
    out[i] = acc;
    acc += rate(i);
  }
  const k = (len - 1) / Math.max(1e-6, out[len - 1]);
  for (let i = 0; i < len; i++) out[i] = Math.min(len - 1, out[i] * k);
  return out;
}

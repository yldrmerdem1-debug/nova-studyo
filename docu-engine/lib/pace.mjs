/*
 * NARRATION PACE (1.16.16). The outlier channels in our niches speak 140-195
 * words a minute, ~165 typical (38 transcripts, Oct 2026); our narrators read
 * 123-146 wpm while speaking and our videos ran 106-124 wpm overall — a third
 * slower, the viewer waits on every line. Each line is tightened after the
 * voice is known (cached takes too, nothing is paid again):
 *
 *  1. pauses inside a line longer than `cutOver` keep only `keep` seconds,
 *     the head and the tail of the take are trimmed to a breath;
 *  2. a line still under `targetWpm` plays faster, at most `maxTempo`
 *     (ffmpeg atempo keeps the pitch: 1.15x is not heard as sped up).
 *
 * A line directed slow or hushed ([slowly], [whispers], "with weight"…) is an
 * effect: its pauses keep up to `slowKeep` and it is never sped up. The word
 * times move with the audio, so captions, counters and cuts stay on the word.
 */
import { spawnSync } from 'node:child_process';

/** ElevenLabs read speed for new takes (produce.mjs speak); slow/hushed directions stay at 1. */
export const VOICE_SPEED = 1.1;

export const PACE = { targetWpm: 158, maxTempo: 1.15, cutOver: 0.42, keep: 0.3, slowKeep: 0.6, lead: 0.05, tail: 0.08, noiseDb: -38 };

/** v4/v3 directions that ask for a slow or hushed read (the pause is the performance). */
export const SLOW_DIRECTION = /\[[^\]]*\b(slow|slowly|whisper|whispers|whispering|quiet|quietly|soft|softly|hushed|weight|sorrow|grave|pause|pauses|sombre|somber)\b[^\]]*\]/i;

export const spokenWords = (text) =>
  String(text || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** ffmpeg silencedetect output -> [[start, end], …] (a silence running to the end gets `dur`). */
export function parseSilences(stderr, dur) {
  const out = [];
  let open = null;
  for (const line of String(stderr || '').split(/\r?\n/)) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line);
    if (s) open = Math.max(0, Number(s[1]));
    const e = /silence_end:\s*([\d.]+)/.exec(line);
    if (e && open !== null) {
      out.push([open, Number(e[1])]);
      open = null;
    }
  }
  if (open !== null && Number.isFinite(dur) && dur > open) out.push([open, dur]);
  return out;
}

/** A take is seconds long: a hung ffmpeg is killed after this instead of blocking the engine (373aaf, Oct 2026). */
export const SILENCE_TIMEOUT_MS = 180_000;

/**
 * Silences of a take (ffmpeg silencedetect). Empty on any failure: the line is then only re-timed by tempo.
 * A run killed at its deadline throws instead: its empty answer would be cached as the take's (produce.mjs paceOf).
 */
export function detectSilences(ffmpeg, file, dur, { noiseDb = PACE.noiseDb, min = 0.2 } = {}) {
  let r;
  try {
    r = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-nostats', '-i', file, '-af', `silencedetect=noise=${noiseDb}dB:d=${min}`, '-f', 'null', '-'], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 << 20, timeout: SILENCE_TIMEOUT_MS });
  } catch {
    return [];
  }
  if (r.error?.code === 'ETIMEDOUT') throw Object.assign(new Error(`ffmpeg ${SILENCE_TIMEOUT_MS / 1000} sn içinde bitmedi, durduruldu (${r.error.message})`), { code: 'ETIMEDOUT' });
  if (r.status !== 0) return [];
  return parseSilences(r.stderr, dur);
}

/**
 * The cut list and tempo for one line. `silences` from detectSilences, `dur`
 * the take's length (s), `text` the line as sent (directions included).
 * Returns { cuts: [[a, b]…] removed from the take, tempo, dur (new), slow, wpmBefore, wpmAfter }.
 */
export function pacePlan({ silences = [], dur, text, opts = {} }) {
  const P = { ...PACE, ...opts };
  const words = spokenWords(text);
  const slow = SLOW_DIRECTION.test(String(text || ''));
  const keep = slow ? P.slowKeep : P.keep;
  const cuts = [];
  const eps = 0.02;
  for (const [a0, b0] of silences) {
    const a = Math.max(0, a0);
    const b = Math.min(dur, b0);
    if (!(b > a)) continue;
    if (a <= eps) {
      // The breath before the first word.
      if (b - a > P.lead + 0.04) cuts.push([0, +(b - P.lead).toFixed(3)]);
    } else if (b >= dur - 0.15) {
      // The silence after the last word (a take often ends on a few ms of room noise).
      if (b - a > P.tail + 0.04) cuts.push([+(a + P.tail).toFixed(3), +dur.toFixed(3)]);
    } else if (b - a > P.cutOver && b - a > keep + 0.04) {
      const mid = (a + b) / 2;
      cuts.push([+(mid - (b - a - keep) / 2).toFixed(3), +(mid + (b - a - keep) / 2).toFixed(3)]);
    }
  }
  const removed = cuts.reduce((n, [a, b]) => n + (b - a), 0);
  const left = Math.max(0.1, dur - removed);
  const wpmBefore = words / (dur / 60);
  const wpmCut = words / (left / 60);
  let tempo = 1;
  // Short lines (a slam, a name) carry no measurable pace: only their pauses are tightened.
  if (!slow && words >= 5 && wpmCut < P.targetWpm) tempo = Math.min(P.maxTempo, P.targetWpm / wpmCut);
  if (tempo < 1.02) tempo = 1;
  tempo = +tempo.toFixed(3);
  const newDur = +(left / tempo).toFixed(3);
  return { cuts, tempo, dur: newDur, slow, wpmBefore: +wpmBefore.toFixed(1), wpmAfter: +(words / (newDur / 60)).toFixed(1) };
}

/** True when the plan changes nothing (the original take is used as it is). */
export const paceIdentity = (plan) => !plan || (!plan.cuts.length && plan.tempo === 1);

/** ffmpeg audio filters that apply the plan (put before the voice chain). */
export function paceFilter(plan) {
  if (paceIdentity(plan)) return '';
  const parts = [];
  if (plan.cuts.length) {
    const expr = plan.cuts.map(([a, b]) => `between(t,${a},${b})`).join('+');
    parts.push(`aselect='not(${expr})'`, 'asetpts=N/SR/TB');
  }
  if (plan.tempo !== 1) parts.push(`atempo=${plan.tempo}`);
  return parts.join(',');
}

/** A time in the original take -> the same moment in the paced audio. */
export function paceTime(plan, t) {
  if (paceIdentity(plan)) return t;
  let shift = 0;
  for (const [a, b] of plan.cuts) {
    if (t >= b) shift += b - a;
    else if (t > a) shift += t - a;
  }
  return Math.max(0, (t - shift) / plan.tempo);
}

/** Word times moved onto the paced audio. */
export function paceWords(plan, words) {
  if (paceIdentity(plan) || !Array.isArray(words)) return words;
  return words.map((w) => (Number.isFinite(w?.t) ? { ...w, t: +paceTime(plan, w.t).toFixed(3) } : w));
}

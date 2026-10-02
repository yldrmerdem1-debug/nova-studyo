import React, { useContext } from 'react';
import type { Genre, MotifId, TopicIdentity } from '../types';
// @ts-ignore -- plain ESM shared with Node; typed in timing.d.ts.
import { spokenOf, labelIndex } from '../infographics/timing.js';

/*
 * The video's topic identity (script.topic), provided once by the Engine.
 * Outside the Engine (demos, tests) or for a script without a topic it is
 * null and every topic component draws nothing: the look stays exactly as
 * before.
 */

export const MOTIFS: MotifId[] = ['cipher', 'telegraph', 'ticker', 'telemetry', 'electric', 'case-file', 'expedition', 'siege'];
export const isMotif = (m: unknown): m is MotifId => MOTIFS.includes(m as MotifId);

export interface TopicCtx {
  topic: TopicIdentity;
  motif: MotifId;
  /** Seed for every seeded mark (the script's seedKey/id). */
  seed: string;
  locale: string;
  /** The story's first year (script.era), when known. */
  eraStart?: number;
  /** Per scene: does it start with the motif wipe (set by the Engine). */
  wipes?: boolean[];
}

export const TopicContext = React.createContext<TopicCtx | null>(null);
export const useTopic = (): TopicCtx | null => useContext(TopicContext);

/** The script's topic when it is usable (a known motif), else null. */
export function topicOf(script: { topic?: TopicIdentity; seedKey?: string; id?: string; locale?: string; era?: string }): TopicCtx | null {
  const t = script?.topic;
  if (!t || !isMotif(t.motif)) return null;
  const ys = [...String(script.era ?? '').matchAll(/\b(1[0-9]\d\d|20\d\d)\b/g)].map((m) => +m[1]);
  return { topic: t, motif: t.motif, seed: script.seedKey ?? script.id ?? 'topic', locale: script.locale ?? 'en-US', eraStart: ys.length ? Math.min(...ys) : undefined };
}

/** Motif colours over the scene's look: the topic's own accents when it set them. */
export function motifColors(t: TopicCtx | null, g: Genre): { accent: string; accent2: string } {
  const hex = (v?: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);
  return { accent: hex(t?.topic.accent) ?? g.accent, accent2: hex(t?.topic.accent2) ?? g.accent2 };
}

/**
 * Frames (scene-local) on which a list of cues is spoken: each cue's `at` word,
 * else its label's words, searched in order through the narration. Cues not
 * found are spread evenly between their found neighbours (or over the first
 * ~75% of the scene). Always increasing, never closer than `gap` frames.
 */
export function cueFrames(
  cues: { label?: string; at?: string }[],
  wordTimes: { word: string; t: number }[] | undefined,
  durFrames: number,
  fps: number,
  { lead = 0.5, tail = 0.25, gap = 8 }: { lead?: number; tail?: number; gap?: number } = {},
): number[] {
  const n = cues.length;
  if (!n) return [];
  const sp = spokenOf(wordTimes ?? []) as { t: number }[];
  const found: (number | null)[] = [];
  let from = 0;
  for (const c of cues) {
    let hit = -1;
    for (const key of [c.at, c.label].filter(Boolean) as string[]) {
      hit = labelIndex(key, sp as never, from);
      if (hit >= 0) break;
    }
    if (hit >= 0) {
      found.push(Math.round(sp[hit].t * fps));
      from = hit + 1;
    } else found.push(null);
  }
  const a = Math.round(lead * fps);
  const b = Math.max(a + n, Math.round(durFrames * (1 - tail)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if (found[i] !== null) {
      out.push(found[i] as number);
      continue;
    }
    // Between the previous placed frame and the next found one.
    let j = i + 1;
    while (j < n && found[j] === null) j++;
    const prev = i ? out[i - 1] : a - gap;
    const next = j < n ? (found[j] as number) : b + gap;
    out.push(Math.round(prev + (next - prev) / (j - i + 1)));
  }
  for (let i = 0; i < n; i++) {
    const min = i ? out[i - 1] + gap : Math.round(0.25 * fps);
    out[i] = Math.max(min, out[i]);
  }
  // Squeeze back inside the scene if the gaps pushed past it.
  const last = durFrames - Math.round(0.6 * fps);
  if (out[n - 1] > last) {
    const k = last / out[n - 1];
    for (let i = 0; i < n; i++) out[i] = Math.round(out[i] * k);
  }
  return out;
}

/** A small deterministic hash 0..1. */
export function h01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** A seeded generator (mulberry32). */
export function rng(seed: string): () => number {
  let a = Math.floor(h01(seed) * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** International Morse for letters, digits and a few signs. */
const MORSE: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--',
  N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', '/': '-..-.', '-': '-....-',
};
/** Text in Morse: letters split by spaces, words by " / ". */
export function morse(text: string): string {
  return String(text ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [...w].map((c) => MORSE[c] ?? '').filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' / ');
}

/** Roman numerals (chapter numbers in the siege motif). */
export function roman(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let v = Math.max(1, Math.floor(n));
  for (const [k, s] of t) while (v >= k) {
    out += s;
    v -= k;
  }
  return out;
}

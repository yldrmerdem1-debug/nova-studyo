import { getInputProps } from 'remotion';
import { loadLocalFont } from '../localFonts';
import { FONT, textLocale, textWidth } from '../fonts';
import type { FontKey } from '../types';

/*
 * Type for the edit devices. Two faces of their own — Caveat (handwriting:
 * board labels, marks, ledger entries) and Special Elite (a worn typewriter:
 * letters, crime statements) — plus the period faces the devices use in every
 * genre (Courier Prime, Old Standard, Playfair/Crimson italics for quotes).
 * src/fonts.ts only loads a genre's own faces, so these are loaded here (public/fonts), and
 * only when the script has a device scene (or there is no script: Studio).
 */

const SUBSETS = ['latin', 'latin-ext'] as const;
const caveatFamily = 'Caveat';
const eliteFamily = 'Special Elite';
const DEVICE_TYPES = new Set(['board', 'document', 'timeline', 'split', 'quote']);

function wanted(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const s = (getInputProps() as { script?: { scenes?: { type?: string; annotate?: unknown }[] } })?.script;
    if (!Array.isArray(s?.scenes)) return true;
    return s.scenes.some((x) => DEVICE_TYPES.has(String(x?.type)) || !!x?.annotate);
  } catch {
    return true;
  }
}

const WANT = wanted();
if (WANT) {
  loadLocalFont(caveatFamily, 'normal', { weights: ['500', '700'], subsets: [...SUBSETS] });
  loadLocalFont(eliteFamily, 'normal', { weights: ['400'], subsets: [...SUBSETS] });
  loadLocalFont('Courier Prime', 'normal', { weights: ['400', '700'], subsets: [...SUBSETS] });
  loadLocalFont('Old Standard TT', 'normal', { weights: ['400', '700'], subsets: [...SUBSETS] });
  loadLocalFont('Playfair Display', 'italic', { weights: ['500', '700'], subsets: [...SUBSETS] });
  loadLocalFont('Playfair Display', 'normal', { weights: ['600', '800'], subsets: [...SUBSETS] });
  loadLocalFont('Crimson Pro', 'italic', { weights: ['400', '600'], subsets: [...SUBSETS] });
  // Rubber stamps.
  loadLocalFont('Oswald', 'normal', { weights: ['500', '700'], subsets: [...SUBSETS] });
}

/** A face the devices can set: an engine face, or one of the two device-only faces. */
export type DevFont = FontKey | 'hand' | 'elite';

export const DFONT: Record<DevFont, string> = {
  ...FONT,
  hand: `${caveatFamily}, 'Segoe Print', cursive`,
  elite: `${eliteFamily}, 'Courier New', monospace`,
};

/** Advance of one character in em for the device-only faces (a hair generous, like fonts.ts). */
function devEm(ch: string, font: 'hand' | 'elite'): number {
  if (font === 'elite') return 0.58;
  if (ch === ' ') return 0.2;
  if (ch >= '0' && ch <= '9') return 0.46;
  if ('.,:;!|\'’‘`'.includes(ch)) return 0.2;
  if ('—…'.includes(ch)) return 0.8;
  if ('mwMW'.includes(ch)) return 0.66;
  const lo = ch.toLocaleLowerCase(textLocale());
  const up = ch.toLocaleUpperCase(textLocale());
  if (lo !== up && ch === up) return 0.52;
  return 0.4;
}

export interface Track {
  trackEm?: number;
  upper?: boolean;
}

/** Rendered width in px of one line. */
export function measure(text: string, font: DevFont, size: number, o: Track = {}): number {
  if (font === 'hand' || font === 'elite') {
    const t = o.upper ? text.toLocaleUpperCase(textLocale()) : text;
    let w = 0;
    for (const ch of t) w += devEm(ch, font) + (o.trackEm ?? 0);
    return w * size;
  }
  return textWidth(text, font, size, { trackEm: o.trackEm, upper: o.upper });
}

/** Greedy word wrap at `maxW`; a word wider than a line is broken by characters. */
export function wrap(text: string, font: DevFont, size: number, maxW: number, o: Track = {}): string[] {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => measure(s, font, size, o) <= maxW;
  for (let w of words) {
    const tryLine = cur ? `${cur} ${w}` : w;
    if (fits(tryLine)) {
      cur = tryLine;
      continue;
    }
    if (cur) lines.push(cur);
    cur = '';
    while (!fits(w) && w.length > 1) {
      let k = w.length - 1;
      while (k > 1 && !fits(`${w.slice(0, k)}-`)) k--;
      lines.push(`${w.slice(0, k)}-`);
      w = w.slice(k);
    }
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

export interface Fit {
  size: number;
  lines: string[];
}

/**
 * Largest size (<= cap) at which `text` wraps into at most `maxLines` lines
 * of `maxW` and `lines * size * lineH <= maxH`. At `min` it still overflowing
 * is cut with an ellipsis — the block never leaves its box. With `balance`,
 * lines are evened out (no one-word last line on a quote).
 */
export function fitWrap(
  text: string,
  font: DevFont,
  o: Track & { maxW: number; maxH: number; lineH: number; cap: number; min: number; maxLines?: number; balance?: boolean; balanceMin?: number },
): Fit {
  const ok = (s: number) => {
    const ls = wrap(text, font, s, o.maxW, o);
    return ls.length <= (o.maxLines ?? 99) && ls.length * s * o.lineH <= o.maxH ? ls : null;
  };
  let lo = o.min;
  let hi = Math.max(o.min, o.cap);
  if (ok(hi)) lo = hi;
  else {
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (ok(mid)) lo = mid;
      else hi = mid;
    }
  }
  const size = lo;
  let lines = ok(size);
  if (!lines) {
    // Still too long at the minimum: keep what fits and end on an ellipsis.
    const all = wrap(text, font, size, o.maxW, o);
    const n = Math.max(1, Math.min(o.maxLines ?? 99, Math.floor(o.maxH / (size * o.lineH))));
    lines = all.slice(0, n);
    let last = lines[n - 1] ?? '';
    while (last.length > 1 && measure(`${last}…`, font, size, o) > o.maxW) last = last.slice(0, -1);
    lines[n - 1] = `${last.replace(/[\s,.;:]+$/, '')}…`;
    return { size, lines };
  }
  if (o.balance && lines.length > 1) {
    // Narrowest width that still gives the same number of lines.
    let a = o.maxW * (o.balanceMin ?? 0.5);
    let b = o.maxW;
    for (let k = 0; k < 12; k++) {
      const m = (a + b) / 2;
      if (wrap(text, font, size, m, o).length <= lines.length) b = m;
      else a = m;
    }
    lines = wrap(text, font, size, b, o);
  }
  return { size, lines };
}

/** Largest size at which one line stays inside `maxW`. */
export function fitLine(text: string, font: DevFont, o: Track & { maxW: number; cap: number; min?: number }): number {
  const w1 = measure(text, font, 100, o) / 100;
  if (w1 <= 0) return o.cap;
  return Math.max(o.min ?? 8, Math.floor(Math.min(o.cap, o.maxW / 1.03 / w1)));
}

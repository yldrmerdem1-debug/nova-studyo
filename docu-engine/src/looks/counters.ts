import type { CounterStyle, Genre, GenreId, Scene, Script } from '../types';
import { COUNTER_STYLES, isCounterStyle } from './catalog';

/*
 * Which treatment each counter scene gets (pure; the Engine resolves it once
 * per render in src/looks/resolve.ts). A video used to draw every counter in
 * the same box — eight "$8.5 BILLION" cards that differ only in the figure.
 * Now each look has a palette of treatments (its signature first), the story's
 * era removes what did not exist yet (no ticker tape before 1867), and the
 * counters of a video walk through the palette: the least-used treatment next,
 * each chapter starting somewhere else, never the same one twice in a row.
 * `scene.counterStyle` (the art director's pick) wins.
 */

type Years = { start: number; end: number };

/** "1929-1933 (Great Depression)" -> {1929, 1933}; "15th century" -> {1400, 1499}; unreadable -> null. */
export function eraRange(era?: string | null): Years | null {
  const s = String(era ?? '');
  const ys = [...s.matchAll(/\b(1[0-9]\d\d|20\d\d)\b/g)].map((m) => +m[1]);
  if (!ys.length) {
    const c = s.match(/\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*(?:century|yüzyıl)/i);
    if (c) {
      const start = (+c[1] - 1) * 100;
      return { start, end: start + 99 };
    }
    return null;
  }
  return { start: Math.min(...ys), end: Math.max(...ys) };
}

/** The story's own span: its first year and at most 30 years on ("1912 (wreck found 1985)" is not an 80s story). */
export function storyYears(era?: string | null): Years | null {
  const r = eraRange(era);
  return r && { start: r.start, end: Math.min(r.end, r.start + 30) };
}

type LookLike = Pick<Genre, 'id' | 'look'> & { light?: boolean };

/** Treatments a look prefers, its signature first. */
const FAMILY: Record<string, CounterStyle[]> = {
  terminal: ['ticker', 'odometer', 'bare', 'box', 'outline', 'photo'],
  'label-light': ['bare', 'newsprint', 'outline', 'photo', 'box', 'odometer', 'ticker'],
  label: ['box', 'bare', 'outline', 'photo', 'odometer', 'newsprint', 'ticker'],
  glow: ['outline', 'bare', 'box', 'photo', 'odometer', 'newsprint'],
};

/** The counter palette of a look (genre + family + light), minus what the story's era rules out. */
export function counterPalette(g: LookLike, years: Years | null = null): CounterStyle[] {
  const fam = g.look === 'label' && g.light ? 'label-light' : g.look;
  const base = FAMILY[fam] ?? FAMILY.label;
  const out = base.filter((id) => {
    const e = COUNTER_STYLES.find((c) => c.id === id);
    if (!e) return false;
    if (e.genres !== 'all' && !e.genres.includes(g.id as GenreId)) return false;
    if (e.fromYear && years && years.end < e.fromYear) return false;
    return true;
  });
  return out.length ? out : ['box'];
}

type Pictured = { type: string; image?: string; images?: string[]; video?: string; videoStart?: number; videoDur?: number; videoW?: number; videoH?: number; layers?: { bg: string } };

/**
 * The picture a 'photo' counter sits on: its OWN picture or clip when the script gave it one, else one of the two
 * scenes before it. (Panama, Oct 2026: "Panama was hit by something stronger. A 7.7." carried a Panama City clip,
 * but the count was drawn over the previous scene's Colombian rubble.)
 */
export function counterPicture(scenes: Scene[], i: number): { image?: string; video?: string; videoStart?: number; videoDur?: number; videoW?: number; videoH?: number } | undefined {
  for (let k = i; k >= Math.max(0, i - 2); k--) {
    const s = scenes[k] as unknown as Pictured;
    if (!s || (k !== i && s.type === 'counter')) continue;
    const image = s.image ?? s.images?.[0] ?? s.layers?.bg;
    if (image || s.video) return { image, video: s.video, videoStart: s.videoStart, videoDur: s.videoDur, videoW: s.videoW, videoH: s.videoH };
  }
  return undefined;
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/** Each scene's counter treatment (undefined for non-counters). */
export function counterStyles(script: Pick<Script, 'scenes' | 'era' | 'seedKey' | 'id'>, g: LookLike): (CounterStyle | undefined)[] {
  const scenes = script.scenes ?? [];
  const pal = counterPalette(g, storyYears(script.era));
  const seed = script.seedKey ?? script.id ?? 'counter';
  // The signature leads; the rest in this video's own order.
  const order = [pal[0], ...pal.slice(1).sort((a, b) => hash01(`${seed}|cs|${a}`) - hash01(`${seed}|cs|${b}`))];
  const used = new Map<CounterStyle, number>();
  const inChapter = new Map<number, number>();
  let prev: CounterStyle | undefined;
  return scenes.map((s, i) => {
    if (s.type !== 'counter') return undefined;
    const ch = Number.isInteger(s.chapter) ? (s.chapter as number) : 0;
    const k = inChapter.get(ch) ?? 0;
    inChapter.set(ch, k + 1);
    const pic = !!counterPicture(scenes, i);
    let st: CounterStyle | undefined = isCounterStyle(s.counterStyle) && (s.counterStyle !== 'photo' || pic) ? s.counterStyle : undefined;
    if (!st) {
      const start = (ch + k) % order.length;
      const ring = [...order.slice(start), ...order.slice(0, start)];
      const cands = ring.filter((c) => c !== prev && (c !== 'photo' || pic));
      const pool = cands.length ? cands : ring;
      st = pool.reduce((best, c) => ((used.get(c) ?? 0) < (used.get(best) ?? 0) ? c : best), pool[0]);
    }
    used.set(st, (used.get(st) ?? 0) + 1);
    prev = st;
    return st;
  });
}

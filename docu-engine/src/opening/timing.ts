import { spokenNumbers, spokenOf, tallyItems, valueIndex, type Spoken } from '../infographics/timing.js';
import type { Scene } from '../types';
import type { Stamp } from './plan.js';

/*
 * WHEN an opening element lands: always on the spoken word that says it
 * (wordTimes). A date stamp types in as the date is said, its time when the
 * time is said; a counter starts counting on the number's first word; a
 * rewind caption appears on "rewind" / the date it rewinds to. An element
 * the narration never says (a caption field) keeps the scene's own timing.
 */

const MONTHS = /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec|ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)$/;
const HOURS = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/;
const NUMWORD = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|oh|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth)$/;
const TIME_MARK = /^(am|pm|oclock|night|morning|evening|afternoon|dawn)$/;
const TIME_WORD = /^(noon|midnight|dawn|dusk|saat)$/;
const YEAR_HEAD = /^(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|two)$/;

const fr = (t: number, fps: number) => Math.max(0, Math.round(t * fps));
const tokens = (scene: Scene): Spoken[] => spokenOf((scene as { wordTimes?: { word: string; t: number }[] }).wordTimes);

/** The frame the date part of a stamp is said (its first word), or null. */
function dateFrame(sp: Spoken[], fps: number): number | null {
  const m = sp.findIndex((s) => MONTHS.test(s.n));
  if (m >= 0) return fr(sp[m].t, fps);
  // No month: the year — four digits, or "nineteen seventy-one".
  const y = sp.findIndex((s, i) => /^\d{4}$/.test(s.n) || (YEAR_HEAD.test(s.n) && NUMWORD.test(sp[i + 1]?.n ?? '')));
  return y >= 0 ? fr(sp[y].t, fps) : null;
}

/** The frame the time part is said: "8:13", "eight thirteen PM", "ten o'clock", "noon", "saat ...". */
function timeFrame(sp: Spoken[], fps: number): number | null {
  for (let i = 0; i < sp.length; i++) {
    const s = sp[i];
    if (/^\d{1,2}[:.]\d{2}/.test(s.raw) || TIME_WORD.test(s.n)) return fr(s.t, fps);
    if (HOURS.test(s.n) && sp.slice(i + 1, i + 4).some((x) => TIME_MARK.test(x.n))) return fr(s.t, fps);
  }
  return null;
}

/** When each part of a beat's stamp lands (scene-local frames). A stamp read from a field lands with the scene. */
export function stampTiming(scene: Scene, stamp: Stamp, fps: number, fallback = 6): { dateAt: number | null; timeAt: number | null; at: number } {
  if (!stamp.fromSay) return { dateAt: stamp.date ? fallback : null, timeAt: stamp.time ? fallback : null, at: fallback };
  const sp = tokens(scene);
  if (!sp.length) return { dateAt: stamp.date ? fallback : null, timeAt: stamp.time ? fallback : null, at: fallback };
  const d = stamp.date ? dateFrame(sp, fps) ?? fallback : null;
  const t = stamp.time ? timeFrame(sp, fps) ?? d ?? fallback : null;
  const at = Math.min(...[d, t].filter((x): x is number => x !== null));
  return { dateAt: d, timeAt: t, at };
}

/**
 * The frame a counter's number is first said ("two hundred thousand",
 * "nineteen seventy-one"), or null when the narration never says it.
 */
export function counterSpokenAt(scene: Scene, fps: number): number | null {
  if (scene.type !== 'counter') return null;
  const sp = tokens(scene);
  if (!sp.length) return null;
  // A tally starts on its FIRST spoken number (each later one lands on its own word inside the scene).
  const tally = tallyItems((scene as { wordTimes?: { word: string; t: number }[] }).wordTimes, { to: (scene as { to?: number }).to });
  if (tally.length >= 2) return fr(tally[0].t, fps);
  const k = valueIndex(scene.to, sp);
  if (k >= 0) return fr(sp[k].t, fps);
  if (scene.to >= 1000 && scene.to <= 2099) {
    const y = sp.findIndex((s, i) => s.n === String(scene.to) || (YEAR_HEAD.test(s.n) && NUMWORD.test(sp[i + 1]?.n ?? '')));
    if (y >= 0) return fr(sp[y].t, fps);
  }
  return null;
}

/**
 * The frame (counted from the count's own start) the count lands on: as long as the narrator takes to
 * say the number — "four thousand, seven hundred and seventy-three" lands on "seventy-three", not
 * 0.9 s into it — never shorter than the classic 0.9 s, never longer than 3.5 s.
 */
export function counterCountEnd(scene: Scene, fps: number): number {
  const base = Math.round(0.9 * fps);
  if (scene.type !== 'counter') return base;
  const sp = tokens(scene);
  if (!sp.length) return base;
  const nums = spokenNumbers(sp);
  const k = valueIndex(scene.to, sp, nums);
  const n = k >= 0 ? nums.find((x) => x.i === k) : undefined;
  if (!n) return base;
  return Math.max(base, Math.min(Math.round(3.5 * fps), 3 + Math.round((n.tEnd - n.t + 0.3) * fps)));
}

/** The frame a rewind is said: its date or number, else the word "rewind" / "earlier"; null without narration. */
export function rewindSpokenAt(scene: Scene, fps: number): number | null {
  const sp = tokens(scene);
  if (!sp.length) return null;
  const d = dateFrame(sp, fps);
  if (d !== null) return d;
  const UNIT = /^(years?|months?|days?|hours?|weeks?|decades?|yil|ay|gun|saat)$/;
  const n = sp.findIndex((s, i) => (/^\d/.test(s.raw) || NUMWORD.test(s.n)) && (UNIT.test(sp[i + 1]?.n ?? '') || UNIT.test(sp[i + 2]?.n ?? '')));
  if (n >= 0) return fr(sp[n].t, fps);
  const c = sp.findIndex((s) => /^(rewind|earlier|began|begins|started|back|geri|once)$/.test(s.n));
  return c >= 0 ? fr(sp[c].t, fps) : null;
}

/** The frame a given word of the scene's narration is said (first match), or null. */
export function wordSpokenAt(scene: Scene, word: string, fps: number): number | null {
  const sp = tokens(scene);
  const w = String(word ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^\p{L}\p{N}]/gu, '');
  if (!w || !sp.length) return null;
  const k = sp.findIndex((s) => s.n === w || (w.length >= 4 && (s.n.startsWith(w) || w.startsWith(s.n)) && s.n.length >= 3));
  return k >= 0 ? fr(sp[k].t, fps) : null;
}

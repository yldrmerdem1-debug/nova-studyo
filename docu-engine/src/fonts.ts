import { getInputProps } from 'remotion';
import { GENRES } from './genres';
import { loadLocalFont } from './localFonts';
import { lookFontKeys } from './looks/variants';
import { topicFontKeys } from './topic/fontkeys';
import type { FontKey, GenreId } from './types';

/*
 * Case rules follow the script's language (script.locale): Turkish maps i <-> İ and
 * ı <-> I, every other language the standard way ("Airline" -> "AIRLINE", not "AİRLİNE").
 * One composition renders one script, so the Engine sets this once per render
 * (setTextLocale) and measurement / word matching read it. Default: Turkish.
 */
export const caseLocale = (locale?: string) => (String(locale ?? 'tr').toLowerCase().startsWith('tr') ? 'tr-TR' : 'en-US');
let TEXT_LOCALE = 'tr-TR';
export function setTextLocale(locale?: string): void {
  TEXT_LOCALE = caseLocale(locale);
}
export const textLocale = () => TEXT_LOCALE;

/*
 * latin-ext on every face: scripts will be written in Turkish, and ş ğ ı İ are
 * not in the plain latin subset — without it they fall back to a system font
 * mid-word, which looks like a rendering bug on a headline.
 */
const SUBSETS = ['latin', 'latin-ext'] as const;

/* Family names exactly as Google Fonts registers them (src/localFonts.ts loads the vendored files): every CSS stack is unchanged. */
const antonFamily = 'Anton';
const cinzelFamily = 'Cinzel';
const crimsonFamily = 'Crimson Pro';
const interFamily = 'Inter';
const oswaldFamily = 'Oswald';
const plexMonoFamily = 'IBM Plex Mono';
const bebasFamily = 'Bebas Neue';
const courierFamily = 'Courier Prime';
const exoFamily = 'Exo Two';
const playfairFamily = 'Playfair Display';
const loraFamily = 'Lora';
const oldStandardFamily = 'Old Standard TT';
const frakturFamily = 'UnifrakturMaguntia';
const dmSerifFamily = 'DM Serif Display';
const spaceGroteskFamily = 'Space Grotesk';
const archivoFamily = 'Archivo Black';
const jetbrainsFamily = 'JetBrains Mono';

/*
 * Only the fonts this render uses get loaded (from public/fonts, see src/localFonts.ts). Every render tab used to pull
 * all 11 families (~50 woff2 files) under a 60s delayRender although a genre
 * uses two of them — each extra request is one more way for a 10-minute
 * render to die on a flaky connection. The pipeline passes the script as
 * input props, so the genre is known before anything draws. With no genre
 * (Studio, demo compositions) everything loads, as before. A palette override
 * can recolour a genre but never swap its fonts, so headline + body + the
 * mono HUD/chart face is the complete set.
 */
type ScriptProps = { genre?: string; look?: { variant?: string }; scenes?: { type?: string; textStyle?: string }[] };
function scriptProps(): ScriptProps | null {
  try {
    if (typeof window === 'undefined') return null;
    return (getInputProps() as { script?: ScriptProps })?.script ?? null;
  } catch {
    return null;
  }
}
const SCRIPT = scriptProps();
/**
 * Newspaper and map faces (Old Standard, blackletter) and Oswald's Cyrillic
 * are fetched only for a script with headline or map scenes — or with no
 * script at all (Studio, demos), when everything loads.
 */
const PRINT = !Array.isArray(SCRIPT?.scenes) || SCRIPT.scenes.some((s) => s?.type === 'headline' || s?.type === 'map');
function wantedFonts(): Set<FontKey> | null {
  const genre = SCRIPT?.genre ? GENRES[SCRIPT.genre as GenreId] : undefined;
  if (!genre) return null;
  // Anton: the YouTube thumbnail's punch face (src/thumbnail), whatever the look.
  const keys = new Set<FontKey>([genre.headline, genre.body, 'plexMono', 'anton']);
  if (PRINT) for (const k of ['oldstandard', 'fraktur', 'oswald'] as FontKey[]) keys.add(k);
  // A counter may be drawn as a newspaper clipping (src/counterStyles.tsx): its serif.
  if (SCRIPT?.scenes?.some((s) => s?.type === 'counter')) keys.add('oldstandard');
  // A look variant swaps faces, and some text styles set their own (src/looks).
  for (const k of lookFontKeys(SCRIPT)) keys.add(k);
  // The topic identity's faces (src/topic): its motif's mono + display, its headline/body.
  for (const k of topicFontKeys(SCRIPT as never)) keys.add(k);
  return keys;
}
const WANTED = wantedFonts();
/*
 * A same-category fallback after every face. Bebas Neue has no ₺ glyph, so a
 * "₺2.400.000" counter in crime drew the lira sign in the browser default —
 * Times, a serif Ł next to condensed sans figures. The fallback keeps a missing
 * glyph in the same family of shapes (Arial and Georgia both carry ₺ on Windows).
 */
const SERIF = new Set<FontKey>(['cinzel', 'crimson', 'playfair', 'lora', 'oldstandard', 'fraktur', 'dmserif']);
const MONO_FACE = new Set<FontKey>(['plexMono', 'courier', 'jetbrains']);
const fallback = (key: FontKey) => (MONO_FACE.has(key) ? "'Courier New', monospace" : SERIF.has(key) ? 'Georgia, serif' : 'Arial, sans-serif');
const load = (key: FontKey, family: string, fetchFont: () => { fontFamily: string }): string =>
  `${WANTED && !WANTED.has(key) ? family : fetchFont().fontFamily}, ${fallback(key)}`;

export const FONT: Record<FontKey, string> = {
  anton: load('anton', antonFamily, () => loadLocalFont(antonFamily, 'normal', { weights: ['400'], subsets: [...SUBSETS] })),
  inter: load('inter', interFamily, () => loadLocalFont(interFamily, 'normal', { weights: ['400', '600', '800'], subsets: [...SUBSETS] })),
  // Plus Cyrillic when a newspaper may need it: a Soviet front page sets its headline in Oswald.
  oswald: load('oswald', oswaldFamily, () => loadLocalFont(oswaldFamily, 'normal', { weights: ['500', '700'], subsets: PRINT ? [...SUBSETS, 'cyrillic'] : [...SUBSETS] })),
  plexMono: load('plexMono', plexMonoFamily, () => loadLocalFont(plexMonoFamily, 'normal', { weights: ['400', '600'], subsets: [...SUBSETS] })),
  cinzel: load('cinzel', cinzelFamily, () => loadLocalFont(cinzelFamily, 'normal', { weights: ['600', '800'], subsets: [...SUBSETS] })),
  crimson: load('crimson', crimsonFamily, () => loadLocalFont(crimsonFamily, 'normal', { weights: ['400', '600'], subsets: [...SUBSETS] })),
  bebas: load('bebas', bebasFamily, () => loadLocalFont(bebasFamily, 'normal', { weights: ['400'], subsets: [...SUBSETS] })),
  courier: load('courier', courierFamily, () => loadLocalFont(courierFamily, 'normal', { weights: ['400', '700'], subsets: [...SUBSETS] })),
  exo: load('exo', exoFamily, () => loadLocalFont(exoFamily, 'normal', { weights: ['400', '700', '800'], subsets: [...SUBSETS] })),
  playfair: load('playfair', playfairFamily, () => loadLocalFont(playfairFamily, 'normal', { weights: ['600', '800'], subsets: [...SUBSETS] })),
  lora: load('lora', loraFamily, () => loadLocalFont(loraFamily, 'normal', { weights: ['400', '600'], subsets: [...SUBSETS] })),
  oldstandard: load('oldstandard', oldStandardFamily, () =>
    loadLocalFont(oldStandardFamily, 'normal', { weights: ['400', '700'], subsets: [...SUBSETS, 'cyrillic'] }),
  ),
  // Blackletter has no Turkish or Cyrillic glyphs: only plain-ASCII mastheads use it.
  fraktur: load('fraktur', frakturFamily, () => loadLocalFont(frakturFamily, 'normal', { weights: ['400'], subsets: ['latin'] })),
  dmserif: load('dmserif', dmSerifFamily, () => loadLocalFont(dmSerifFamily, 'normal', { weights: ['400'], subsets: [...SUBSETS] })),
  spacegrotesk: load('spacegrotesk', spaceGroteskFamily, () => loadLocalFont(spaceGroteskFamily, 'normal', { weights: ['400', '500', '700'], subsets: [...SUBSETS] })),
  archivo: load('archivo', archivoFamily, () => loadLocalFont(archivoFamily, 'normal', { weights: ['400'], subsets: [...SUBSETS] })),
  jetbrains: load('jetbrains', jetbrainsFamily, () => loadLocalFont(jetbrainsFamily, 'normal', { weights: ['400', '700'], subsets: [...SUBSETS] })),
};

/**
 * Average uppercase glyph width per font, in em (measured on Turkish caps with
 * ÇĞİŞÜ). Anything that sizes type to fit a gap needs it: Cinzel is 60% wider
 * than Anton, and the first split title in Cinzel ran off the left edge.
 */
export const CAP_WIDTH: Record<FontKey, number> = {
  anton: 0.47,
  bebas: 0.42,
  oswald: 0.52,
  inter: 0.68,
  plexMono: 0.6,
  courier: 0.6,
  cinzel: 0.78,
  crimson: 0.62,
  exo: 0.66,
  playfair: 0.7,
  lora: 0.66,
  oldstandard: 0.72,
  fraktur: 0.8,
  dmserif: 0.68,
  spacegrotesk: 0.66,
  archivo: 0.82,
  jetbrains: 0.6,
};

/**
 * Figure width per font, in em, rounded UP. Counters set tabular figures, so
 * every digit is as wide as the widest one; condensed faces (Anton, Bebas)
 * have far narrower figures than their caps suggest would be safe to assume,
 * wide faces (Cinzel) slightly narrower than their caps.
 */
const DIGIT_WIDTH: Record<FontKey, number> = {
  anton: 0.52,
  bebas: 0.46,
  oswald: 0.56,
  inter: 0.66,
  plexMono: 0.6,
  courier: 0.6,
  cinzel: 0.72,
  crimson: 0.56,
  exo: 0.63,
  playfair: 0.64,
  lora: 0.62,
  oldstandard: 0.56,
  fraktur: 0.54,
  dmserif: 0.58,
  spacegrotesk: 0.62,
  archivo: 0.72,
  jetbrains: 0.6,
};

const MONO = new Set<FontKey>(['plexMono', 'courier', 'jetbrains']);
const CONDENSED = new Set<FontKey>(['anton', 'bebas', 'oswald']);

/** Advance width of one character in em. Deliberately a hair generous: overflow is the failure, a few px of air is not. */
function charEm(ch: string, font: FontKey): number {
  if (MONO.has(font)) return 0.6;
  const cap = CAP_WIDTH[font];
  const digit = DIGIT_WIDTH[font];
  if (ch === ' ' || ch === ' ') return CONDENSED.has(font) ? 0.24 : 0.28;
  if (ch >= '0' && ch <= '9') return digit;
  // Cyrillic capitals run wider than the Latin average (Ш Щ Ж Ы Ю М Ф most of all): a Soviet headline sized on Latin widths ran off the page.
  if (/[Ѐ-ӿ]/.test(ch)) {
    const wide = 'ЖШЩЫЮМФжшщыюмф'.includes(ch) ? 1.42 : 1.12;
    return ch !== ch.toLocaleUpperCase('ru-RU') ? cap * 0.9 * wide : cap * wide;
  }
  if ('.,:;!|\'’‘`´'.includes(ch)) return 0.3;
  if ('()[]{}'.includes(ch)) return 0.36;
  if (ch === '?' || ch === '/' || ch === '\\') return 0.55;
  if (ch === '-' || ch === '‐') return 0.4;
  if (ch === '–') return 0.56;
  if (ch === '—' || ch === '…') return 0.95;
  if (ch === '%') return Math.max(0.78, cap * 1.25);
  if ('$₺€£¥₿#'.includes(ch)) return Math.max(digit, 0.58);
  if ('+=×<>~'.includes(ch)) return Math.max(digit, 0.58);
  if (ch === '&' || ch === '@') return cap * 1.3;
  // CAP_WIDTH is an average over real Turkish caps; only the clear outliers get their own width.
  if (ch === 'M' || ch === 'W') return cap * 1.15;
  if (ch === 'I' || ch === 'İ' || ch === 'J') return cap * 0.75;
  const lower = ch.toLocaleLowerCase(TEXT_LOCALE);
  const upper = ch.toLocaleUpperCase(TEXT_LOCALE);
  if (lower !== upper && ch === lower) return cap * 0.86;
  return cap;
}

export interface TypeOpts {
  /** Letter-spacing in em (scales with the size) and/or fixed px. */
  trackEm?: number;
  trackPx?: number;
  /** The text is rendered with text-transform: uppercase (the script's case rules: Turkish i -> İ). */
  upper?: boolean;
}

/** Glyph advances of a string, in em, before tracking. */
function emWidth(text: string, font: FontKey, upper: boolean): number {
  const t = upper ? text.toLocaleUpperCase(TEXT_LOCALE) : text;
  let w = 0;
  for (const ch of t) w += charEm(ch, font);
  return w;
}

/**
 * Rendered width in px of a single line. CSS letter-spacing is added after
 * EVERY character, the last one included, so it counts `len` times.
 */
export function textWidth(text: string, font: FontKey, size: number, o: TypeOpts = {}): number {
  const n = [...text].length;
  return size * (emWidth(text, font, !!o.upper) + n * (o.trackEm ?? 0)) + n * (o.trackPx ?? 0);
}

/**
 * The font size at which one line of `text` stays inside `maxW` px even when
 * the whole block is scaled by `scaleMax` (camera cut-ins, the landing
 * overshoot, the engine's impact punch). Solved exactly for the width model
 * above instead of the old `track/260` guess, with 3% of air on top:
 *
 *   size * (glyphs + len*trackEm) + len*trackPx <= maxW / scaleMax / 1.03
 */
export function fitFont(
  text: string,
  font: FontKey,
  o: TypeOpts & { maxW: number; cap: number; scaleMax?: number; min?: number },
): number {
  const n = [...text].length;
  if (!n) return o.cap;
  const room = o.maxW / (o.scaleMax ?? 1) / 1.03 - n * (o.trackPx ?? 0);
  const perPx = emWidth(text, font, !!o.upper) + n * (o.trackEm ?? 0);
  const size = perPx > 0 ? room / perPx : o.cap;
  return Math.max(o.min ?? 8, Math.floor(Math.min(o.cap, size)));
}

import { GENRES } from '../genres';
import type { GenreId } from '../types';
import { BACKDROPS, COUNTER_STYLES, GRADES, TEXT_STYLES } from './catalog';
import { counterPalette } from './counters';
import { VARIANTS } from './variants';

/*
 * The look vocabulary for an art director (the pipeline's, or a person
 * writing a script): variant ids per genre, text styles, counter treatments,
 * grounds and grades, each with a one-line description. Pure data —
 * scripts/dump-looks.mjs writes it to docu-engine/looks-catalog.json for tools
 * that do not import TypeScript.
 *
 * How a script uses it:
 *   script.look = { variant: '<id of its genre>' }            the video's identity
 *   script.chapterLooks[chapter] = { accent, grade, backdrop }   per-chapter shift
 *   scene.textStyle / scene.backdrop / scene.grade             per-scene override
 *   scene.counterStyle                                         counter treatment
 */

export { TEXT_STYLES, BACKDROPS, GRADES, COUNTER_STYLES } from './catalog';

export interface LookVariantInfo {
  id: string;
  name: string;
  description: string;
  light: boolean;
  colour: boolean;
  grade: string;
  backdrop?: string;
  textStyles: string[];
  /** Counter treatments this look rotates through (its signature first), before the story's era filters them. */
  counterStyles: string[];
  palette: { bg?: string; ink?: string; accent?: string; accent2?: string };
  fonts: { headline?: string; body?: string };
  suits: string;
  /** The genre's original look (what a script without `look` gets). */
  original: boolean;
}

/** Variants per genre, the original first. */
export const LOOK_VARIANTS: Record<GenreId, LookVariantInfo[]> = VARIANTS.reduce(
  (acc, v) => {
    (acc[v.genre] ??= []).push({
      id: v.id,
      name: v.name,
      description: v.description,
      light: !!v.light,
      colour: !!v.colour,
      grade: v.grade,
      backdrop: v.backdrop?.kind,
      textStyles: v.textStyles,
      counterStyles: counterPalette({ id: v.genre, look: v.set.look ?? GENRES[v.genre].look, light: !!v.light }),
      palette: { bg: v.set.bg, ink: v.set.ink, accent: v.set.accent, accent2: v.set.accent2 },
      fonts: { headline: v.set.headline, body: v.set.body },
      suits: v.suits,
      original: Object.keys(v.set).length === 0,
    });
    return acc;
  },
  {} as Record<GenreId, LookVariantInfo[]>,
);

export const LOOK_CATALOG = {
  version: 1,
  usage: {
    variant: "script.look = { variant: '<id>' } — one per video, from its own genre; unknown/absent = the original look.",
    chapterLooks: 'script.chapterLooks = [ { accent?: "#hex", grade?: Grade, backdrop?: Backdrop } | null, ... ] indexed by scene.chapter.',
    textStyle: "scene.textStyle on words / slam / title / montage. Unset: the variant palette (its first entry leads, rotated per chapter). Accent styles (lyric, kinetic): at most 3 per video, on hooks, quotes and climaxes. lower-third is the editorial info caption: only on lines that carry a name, place, date/time or number (others get another style). words.textMode: 'full' (default) | 'key' (only the keyword, big, on its spoken frame) | 'none' (no text: a clean picture shot); words.kicker sets an info caption's small-caps kicker.",
    counterStyle: "scene.counterStyle on counter scenes, from the variant's counterStyles (era permitting: fromYear). Never the same treatment on two consecutive counters; 'photo' needs a picture in one of the two scenes before. Unset: rotated per video and chapter.",
    backdrop: "scene.backdrop = { kind, color?, color2?, variant?, tone? } for text scenes not over a picture (words, slam, title without image; counter, chart, quote, timeline). Big text (words, slam, title, counter, quote) always sits on 'related' — the nearest related picture/clip, darkened and drifting (tone light: washed into paper) — or an 'era' texture when no picture fits; an explicit paper/texture/blueprint/halftone/split-color/blur choice only sets that ground's tone. 'solid'/'gradient' are kept only on silence beats (energy 1, at most 2 per video).",
    grade: 'scene.grade on photo / video scenes (also chapter and variant defaults). photo.natural still wins.',
    era: 'script.era ("1929-1933 ...") gates era-bound furniture: no camcorder/terminal HUD on photos before 1980 (a newsreel film gate instead), counter treatments by fromYear.',
  },
  variants: LOOK_VARIANTS,
  textStyles: TEXT_STYLES,
  counterStyles: COUNTER_STYLES,
  backdrops: BACKDROPS,
  grades: GRADES,
};

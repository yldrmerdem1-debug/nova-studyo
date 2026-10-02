/*
 * YouTube thumbnail (1280x720 still) — the contract between the pipeline's
 * packaging step (src/pipeline/docu-package.js in Nova) and the composition.
 * Everything is data: the pipeline picks the picture, the crop, the words and
 * the template; the composition only draws.
 */

/** Normalised box on the SOURCE image (0..1 of its width/height). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ThumbPic {
  /** Path under the site's public/ (staticFile). */
  src: string;
  /** Pixel size of the source. */
  w: number;
  h: number;
  /** The focal subject (face, object). Absent = the middle of the picture. */
  box?: Box;
  /** A detail worth circling (circle template); absent = the subject. */
  detail?: Box;
}

export type ThumbLayout = 'hero' | 'split' | 'circle' | 'number' | 'document';
export type ThumbGrade = 'natural' | 'mono' | 'cold' | 'warm' | 'duo';

export interface ThumbSpec {
  layout: ThumbLayout;
  /** 2-4 big words. */
  text: string;
  /** Word index drawn in the accent (-1 = none). */
  highlight?: number;
  /** Small chip (a year, "FBI FILE"): at most 3 words. */
  tag?: string;
  /** The number template's figure ("$200,000", "52 YEARS"). */
  number?: string;
  /** Accent colour (#rrggbb); wins over accentRole. */
  accent?: string;
  /** The look's colour for the highlighted word and chips: signature accent, alarm red or label colour. */
  accentRole?: 'accent' | 'red' | 'label';
  grade?: ThumbGrade;
  hero: ThumbPic;
  /** Split template: the other side. */
  second?: ThumbPic;
  /** Split template labels (left, right). */
  labels?: [string, string];
  /** Which side the words sit on (hero, number, document). */
  side?: 'left' | 'right';
  /** Subject size multiplier (1 = the template's default crop). */
  zoom?: number;
  /** Legibility fixes: text size multiplier and extra darkness behind the words (0..1). */
  textScale?: number;
  scrim?: number;
}

export interface ThumbBrand {
  genre?: string;
  variant?: string;
  locale?: string;
}

export interface ThumbProps {
  thumb: ThumbSpec;
  brand?: ThumbBrand;
  /** Passed so fonts.ts fetches only the look's faces (no scenes: no newspaper faces). */
  script?: { genre?: string; look?: { variant?: string }; locale?: string; scenes: never[] };
}

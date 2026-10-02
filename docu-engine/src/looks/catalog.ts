import type { BackdropKind, CounterStyle, GenreId, Grade, TextStyle } from '../types';

/*
 * The look vocabulary, as data: what an art director (the pipeline's, or a
 * person) may put on a scene — `textStyle`, `backdrop`, `grade` — with a
 * one-line description each and where it fits. Pure data (no React), so
 * scripts/dump-looks.mjs can bundle it into looks-catalog.json.
 */

export interface CatalogEntry<T extends string> {
  id: T;
  description: string;
  /** Genres it reads well in (all = every genre). */
  genres: GenreId[] | 'all';
  /** Scene types it applies to. */
  scenes?: string[];
  /** An accent, not a base style: spend it on hooks, quotes and climaxes only. */
  accent?: boolean;
  /** Use at most this many times per video. */
  maxPerVideo?: number;
}

const ALL = 'all' as const;
const TEXT_SCENES = ['words', 'slam', 'title', 'montage'];

export const TEXT_STYLES: CatalogEntry<TextStyle>[] = [
  { id: 'box', description: "The genre's original treatment: a printed label box (label looks), a glowing word (glow looks) or a data underline (terminal).", genres: ALL, scenes: TEXT_SCENES },
  { id: 'underline', description: 'Printed label punch: the line in a confident bold face, the keyword slammed onto a solid label block (the genre label colour, slightly tilted) on its spoken frame. No underline bars.', genres: ALL, scenes: TEXT_SCENES },
  { id: 'marker', description: 'Hand-drawn highlighter: a rough, slightly skewed marker stroke sweeps behind the word in two passes.', genres: ['documentary', 'crime', 'inspire', 'finance', 'science'], scenes: TEXT_SCENES },
  { id: 'outline', description: 'Stroked letters that fill with colour left to right, with a stack of outlined echoes behind the slam word.', genres: ALL, scenes: TEXT_SCENES },
  { id: 'stack', description: 'Kinetic typography: the line is broken into stacked rows of different sizes, all justified to one width; the keyword row is the biggest.', genres: ['documentary', 'finance', 'science', 'epic', 'inspire'], scenes: TEXT_SCENES },
  { id: 'serif', description: 'Big editorial italic serif (DM Serif / Playfair), the keyword in the accent colour; quiet, magazine-like.', genres: ['documentary', 'inspire', 'epic', 'horror', 'finance'], scenes: TEXT_SCENES },
  { id: 'typewriter', description: 'Typed on a paper slip letter by letter with a cursor (worn typewriter face), keyword in red ink.', genres: ['crime', 'documentary', 'horror', 'epic', 'inspire'], scenes: TEXT_SCENES },
  { id: 'cutout', description: 'Ransom-note: every letter of the keyword / slam word on its own torn scrap in a different face and colour.', genres: ['crime', 'horror', 'inspire', 'documentary'], scenes: TEXT_SCENES },
  { id: 'glitch', description: 'RGB-split word with sliced horizontal displacement on landing and small digital relapses.', genres: ['finance', 'horror', 'crime', 'science'], scenes: TEXT_SCENES },
  { id: 'lower-third', description: 'Editorial info caption (Netflix/HBO documentary): a small-caps kicker with wide tracking ("NORTH ATLANTIC · APRIL 15, 1912"), a hairline rule and the line in a refined serif at the lower left, on a barely visible scrim. ONLY for lines that carry a name, place, date/time or number.', genres: ALL, scenes: TEXT_SCENES },
  { id: 'neon', description: 'Glowing gas-tube letters that flicker on, with a thin tube frame on slams. Best on dark grounds.', genres: ['horror', 'science', 'finance', 'crime'], scenes: TEXT_SCENES },
  { id: 'stamp', description: 'Rubber stamp: the word slams down in a double-bordered, worn-ink box, rotated.', genres: ['crime', 'epic', 'horror', 'finance', 'documentary'], scenes: TEXT_SCENES },
  { id: 'motif', description: "The topic identity's own caption language (telegraph log paper with Morse, ticker tape, telemetry readout, patent annotation, teletype, field note, parchment cartouche, cipher cells), placed in the picture's negative space. Set by the topic bible only, never chosen freely.", genres: ALL, scenes: ['words'] },
  {
    id: 'lyric',
    description: 'ACCENT. Lyric-video kinetic typography: the whole narration line fills the screen word by word on the voice, mixed sizes and weights, keyword biggest in the accent colour; finished lines drift up and fade as the next arrives.',
    genres: ALL,
    scenes: TEXT_SCENES,
    accent: true,
    maxPerVideo: 3,
  },
  {
    id: 'kinetic',
    description: 'ACCENT. The punchy lyric: each word slams in on its spoken frame with motion blur and a slight rotation, the keyword shakes; finished lines whip out upward.',
    genres: ALL,
    scenes: TEXT_SCENES,
    accent: true,
    maxPerVideo: 3,
  },
];

const GROUND_SCENES = ['words', 'slam', 'title', 'counter', 'chart', 'quote', 'timeline'];

export const BACKDROPS: CatalogEntry<BackdropKind>[] = [
  { id: 'related', description: "DEFAULT under big text: the nearest related picture or clip (a neighbouring scene, or one whose narration shares names/nouns with the line), heavily darkened and graded, drifting with slow parallax and depth blur; a clip plays slowed. tone 'light' washes it into paper instead.", genres: ALL, scenes: GROUND_SCENES },
  { id: 'era', description: 'A period texture where no picture fits: variant newsprint (columns, headline rules), film (a projector gate with sprockets, flicker and dust) or ledger (ruled accounting paper).', genres: ALL, scenes: GROUND_SCENES },
  { id: 'solid', description: 'SILENCE BEATS ONLY (energy 1, at most 2 per video): one flat colour with a soft light falloff (color).', genres: ALL, scenes: GROUND_SCENES, maxPerVideo: 2 },
  { id: 'gradient', description: 'SILENCE BEATS ONLY (energy 1, at most 2 per video): a slow-drifting two-colour gradient (color -> color2).', genres: ALL, scenes: GROUND_SCENES, maxPerVideo: 2 },
  { id: 'paper', description: 'Fibrous paper stock with darkened edges (color = paper tone). A light ground: text turns to dark ink.', genres: ALL, scenes: GROUND_SCENES },
  { id: 'blueprint', description: 'Blueprint blue with a fine and a coarse white grid, drifting.', genres: ['science', 'finance', 'documentary', 'epic'], scenes: GROUND_SCENES },
  { id: 'halftone', description: 'Print halftone: dots in color2 fading across a color ground.', genres: ALL, scenes: GROUND_SCENES },
  { id: 'blur', description: "The previous scene's picture, heavily blurred, in colour (big text: drawn as 'related').", genres: ALL, scenes: GROUND_SCENES },
  { id: 'split-color', description: 'Two colour fields split on a hard diagonal (color | color2).', genres: ['documentary', 'finance', 'science', 'inspire'], scenes: GROUND_SCENES },
  { id: 'texture', description: 'A tactile material (concrete / card) tinted with color, with a moving light.', genres: ALL, scenes: GROUND_SCENES },
];

export const GRADES: CatalogEntry<Grade>[] = [
  { id: 'duotone', description: "The look's two-colour duotone (shadow -> highlight): every picture inside the palette.", genres: ALL, scenes: ['photo', 'montage', 'words', 'slam', 'title', 'quote', 'split', 'board', 'document'] },
  { id: 'mono', description: 'Contrasty black and white.', genres: ALL },
  { id: 'color', description: 'Natural colour, lightly punched (contrast + saturation).', genres: ALL },
  { id: 'warm', description: 'Golden, warm highlights; nostalgic and hopeful.', genres: ['inspire', 'documentary', 'epic', 'finance'] },
  { id: 'cool', description: 'Cold steel-blue cast, lowered saturation.', genres: ['crime', 'horror', 'science', 'finance'] },
  { id: 'teal-orange', description: 'Blockbuster split-tone: teal shadows, orange skin and highlights.', genres: ['crime', 'epic', 'documentary', 'science'] },
  { id: 'sepia', description: 'Brown-toned antique print.', genres: ['epic', 'inspire', 'horror', 'documentary', 'crime'] },
  { id: 'cyanotype', description: 'Prussian-blue photographic print.', genres: ['science', 'horror', 'epic'] },
  { id: 'bleach', description: 'Bleach bypass: desaturated, hard contrast, silvery — war-film grit.', genres: ['epic', 'crime', 'horror'] },
  { id: 'kodachrome', description: 'Saturated vintage slide film: rich reds, deep blues.', genres: ['inspire', 'science', 'epic', 'documentary'] },
  { id: 'vhs', description: 'Washed-out tape colour with lifted blacks and a slight red smear.', genres: ['horror', 'crime', 'finance'] },
  { id: 'selective', description: 'Black and white with ONE hue kept in colour (script.topic.keepHue): the topic bible accent object. Set by the topic bible only, never chosen freely.', genres: ALL },
];

export interface CounterEntry extends CatalogEntry<CounterStyle> {
  /** Earliest story year it fits (the object it imitates did not exist before). */
  fromYear?: number;
  /** Needs a picture in one of the two scenes before the counter. */
  needsPicture?: boolean;
}

/**
 * Counter treatments. A video rotates them (src/looks/counters.ts): never the
 * same one on two counters in a row, each chapter leading with a different one.
 */
export const COUNTER_STYLES: CounterEntry[] = [
  { id: 'box', description: "The genre's original: the figure in a printed label box (label looks), a glowing frame (glow) or a terminal box.", genres: ALL, scenes: ['counter'] },
  { id: 'bare', description: 'Editorial: a huge bare numeral, flush left, a thin accent rule drawing in beside it and a small-caps label. Calm, confident.', genres: ALL, scenes: ['counter'] },
  { id: 'odometer', description: 'Mechanical counter: every digit on its own drum rolling into place, the low digits spinning fastest. Money piling up, tallies, dates.', genres: ALL, scenes: ['counter'], fromYear: 1900 },
  { id: 'photo', description: "The figure over the previous scene's picture, darkened and slowly pushing in: the number lands on the place it is about.", genres: ALL, scenes: ['counter'], needsPicture: true },
  { id: 'ticker', description: 'Stock-ticker paper tape sliding across the frame, the figure printed on it in mono type. Markets, prices, volumes.', genres: ['finance'], scenes: ['counter'], fromYear: 1867 },
  { id: 'newsprint', description: 'A newspaper clipping: rules, a serif figure set as a headline, column text below, tilted on the ground. Historic stakes, "the papers said".', genres: ['documentary', 'finance', 'crime', 'epic', 'inspire', 'horror'], scenes: ['counter'], fromYear: 1800 },
  { id: 'outline', description: 'A giant outlined numeral filling the frame, flooding with colour from the bottom as it counts; label tracked wide below. Big reveals.', genres: ALL, scenes: ['counter'] },
];

export const isCounterStyle = (v: unknown): v is CounterStyle => COUNTER_STYLES.some((t) => t.id === v);
export const isTextStyle = (v: unknown): v is TextStyle => TEXT_STYLES.some((t) => t.id === v);
export const isGrade = (v: unknown): v is Grade => GRADES.some((t) => t.id === v);
export const isBackdropKind = (v: unknown): v is BackdropKind => BACKDROPS.some((t) => t.id === v);

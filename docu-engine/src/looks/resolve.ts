import type { Backdrop, ChapterLook, CounterStyle, EraTexture, Genre, GenreId, Grade, Scene, Script, TextStyle } from '../types';
import { isBackdropKind, isGrade, isTextStyle } from './catalog';
import { contrast, isLight, lum, mix, readable } from './color';
import { counterPicture, counterStyles, storyYears } from './counters';

/*
 * Per-scene look: which colours, grade, ground and text style one scene is
 * drawn with. Precedence, most specific first:
 *   scene.textStyle / .grade / .backdrop
 *   script.chapterLooks[scene.chapter]   (accent, grade, backdrop)
 *   the variant's defaults (genre.grade / .backdrop / .textStyles)
 *   the genre's original look ('box', its pattern ground); photos fall back to 'color' (sceneGrade)
 * A scene over a picture always gets a dark ink surface (light type over a
 * scrim), even in a light variant; a text scene on a light ground (a light
 * variant, or a 'paper' backdrop in a dark one) gets dark ink and readable
 * accents. Pure: the Engine computes it once per render.
 */

export type Surface = 'light' | 'dark';

export interface SceneLook {
  genre: Genre;
  grade: Grade;
  /** Resolved ground (colours filled in), or undefined = the genre's pattern. */
  backdrop?: Backdrop;
  textStyle: TextStyle;
  surface: Surface;
  /** The picture a 'blur' ground blurs (the nearest earlier scene's) or a 'related' ground shows (the nearest related one). */
  blurSrc?: { image?: string; video?: string; videoStart?: number; videoDur?: number; videoW?: number; videoH?: number };
  /** Chapter title (lower-third kicker). */
  chapterName?: string;
  /** Scene index in the edit (seeds). */
  index: number;
  /** Counter scenes: the treatment (src/looks/counters.ts). */
  counterStyle?: CounterStyle;
  /** A 'photo' counter's picture. */
  picture?: SceneLook['blurSrc'];
  /** First year of the story (script.era), when known. */
  eraStart?: number;
}

/** Kept for callers: the old broadcast plate's minimum line (the editorial caption needs info instead). */
export const LOWER_THIRD_MIN_WORDS = 4;

/*
 * INFO in a line: what an editorial super is for (Netflix/HBO docs set a name,
 * a place, a date or a figure small at the lower left — never a phrase the
 * narrator is saying). The same small classifier as the pipeline's art
 * director (src/pipeline/docu-art-director.js captionFacts), so an old or
 * hand-written script that puts 'lower-third' on a plain phrase gets another
 * style here.
 */
const MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/i;
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|percent|dozen|dollars?|cents?|pounds?|francs?|marks|lira|euros?|guineas?|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|yüzde)\b/i;
const TIME_WORDS = /(\b\d{1,2}[:.]\d{2}\b|\b[ap]\.m\.|\bo'clock\b|\bmidnight\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi)\b)/i;
/** Capitalised words that are not names when they open a clause (or at all). */
export const NOT_NAMES = new Set(['I', 'A', 'An', 'The', 'And', 'But', 'Or', 'So', 'Then', 'Now', 'It', 'He', 'She', 'They', 'We', 'You', 'His', 'Her', 'Their', 'Its', 'This', 'That', 'These', 'Those', 'In', 'On', 'At', 'By', 'For', 'Of', 'To', 'With', 'From', 'When', 'Where', 'Why', 'How', 'What', 'Who', 'If', 'As', 'No', 'Not', 'One', 'Every', 'All', 'Most', 'Some', 'Even', 'Only', 'Just', 'Still', 'Yet', 'Miss', 'Mr', 'Mrs', 'Bu', 'Şu', 'O', 'Ve', 'Ama', 'Bir', 'Her', 'Hiç']);

/** Does a line carry information beyond the voice (a number, date/time, proper name)? */
export function lineHasInfo(text?: string): boolean {
  const s = String(text ?? '');
  if (!s.trim()) return false;
  if (/\d/.test(s) || MONTHS.test(s) || NUMBER_WORDS.test(s) || TIME_WORDS.test(s)) return true;
  // A proper name: a capitalised word that does not open a sentence and is not a function word.
  const toks = s.split(/\s+/);
  for (let i = 1; i < toks.length; i++) {
    const w = toks[i].replace(/^[^\p{L}]+|[^\p{L}']+$/gu, '').replace(/'s$/, '');
    if (w.length < 2 || !/^\p{Lu}/u.test(w) || NOT_NAMES.has(w)) continue;
    if (/[.!?:…]$/.test(toks[i - 1])) continue;
    return true;
  }
  return false;
}

/** Scene types whose ground a backdrop may replace by default (a chapter's or the variant's). */
const GROUND_TYPES = new Set(['words', 'slam', 'title', 'counter', 'chart', 'quote', 'timeline']);
/** Always drawn on their ground (the picture, if any, only takes part of the frame). */
const ALWAYS_GROUND = new Set(['counter', 'chart', 'quote', 'timeline']);
/** Scene types that draw words in a text style. */
const TEXT_TYPES = new Set(['words', 'slam', 'title', 'montage']);
/** BIG type on its ground: never on an empty one — a related picture behind (or a period texture). */
export const BIG_TEXT_TYPES = new Set(['words', 'slam', 'title', 'counter', 'quote']);
/** Flat grounds survive under big text only on deliberate silence beats (energy 1), this many per video. */
export const SILENCE_GROUNDS = new Set(['solid', 'gradient']);
export const SILENCE_BEATS_MAX = 2;

type Pictured = Scene & { image?: string; images?: string[] };

export function isPictured(s: Scene): boolean {
  const p = s as Pictured;
  return !!(p.image || p.video || p.layers || (s.type === 'montage' && (p.images?.length || s.clips?.length)));
}

/* -------------------------------------------------------- related picture */

const STOP = new Set(
  'the a an and or but of in on at to for by with from as is was were are be been being it its this that these those there their they them he she his her him we our you your i me my not no so then than into onto over under after before about just only even still very more most much many some any every all one two three what when where why how who which while again also would could should will can may might had has have did does do said says say like back down up out off now here yet ever never once each other same such own last first next new old across through until upon among against between because'.split(' '),
);
function sceneWords(s: Scene): string {
  const x = s as unknown as Record<string, unknown>;
  return [x.say, x.text, x.word, x.label, x.title, x.kicker, x.sub, x.quote, x.who, x.name, x.search, x.imagePrompt, x.caption]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\[[^\]]*\]/g, ' ');
}
/** Names (capitalised, weight 2) and content nouns (4+ letters, weight 1) of a scene. */
function keyTerms(s: Scene): Map<string, number> {
  const m = new Map<string, number>();
  const toks = sceneWords(s).split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  toks.forEach((w, i) => {
    const lo = w.toLowerCase().replace(/'s$/, '');
    if (lo.length < 4 || STOP.has(lo) || /^\d+$/.test(lo)) return;
    const name = /^\p{Lu}/u.test(w) && i > 0 && !NOT_NAMES.has(w);
    m.set(lo, Math.max(m.get(lo) ?? 0, name ? 2 : 1));
  });
  return m;
}
type Pic = NonNullable<SceneLook['blurSrc']>;
function pictureOf(s: Scene | undefined): Pic | undefined {
  if (!s) return undefined;
  const p = s as Pictured;
  const image = p.image ?? p.images?.[0] ?? p.layers?.bg;
  if (!image && !p.video) return undefined;
  return { image, video: p.video, videoStart: p.videoStart, videoDur: p.videoDur, videoW: p.videoW, videoH: p.videoH };
}
/** How far (scenes) a related picture is looked for, and how near a neighbour may be without shared words. */
export const RELATED_REACH = 8;
export const RELATED_NEAR = 3;
/**
 * The picture a big-text scene stands on: the scene within reach whose
 * narration shares the most names/nouns with the line (names count double;
 * nearer and same-chapter scenes win ties, the previous over the next), else
 * the nearest picture within RELATED_NEAR in the same chapter. Undefined when
 * no picture fits — the caller lays a period texture instead. `own`: the
 * scene's own picture first (a quote's portrait).
 */
export function relatedSource(scenes: Scene[], i: number, own = false): (Pic & { from: number }) | undefined {
  const s = scenes[i];
  if (!s) return undefined;
  if (own) {
    const p = pictureOf(s);
    if (p) return { ...p, from: i };
  }
  const mine = keyTerms(s);
  const ch = s.chapter ?? 0;
  let best: { k: number; sc: number } | undefined;
  for (let k = Math.max(0, i - RELATED_REACH); k <= Math.min(scenes.length - 1, i + RELATED_REACH); k++) {
    if (k === i) continue;
    const o = scenes[k];
    if (!pictureOf(o)) continue;
    let shared = 0;
    for (const [w, wt] of keyTerms(o)) if (mine.has(w)) shared += Math.max(wt, mine.get(w) ?? 1);
    const d = Math.abs(k - i);
    const sameCh = (o.chapter ?? 0) === ch;
    if (!shared && !(d <= RELATED_NEAR && sameCh)) continue;
    const sc = shared * 1.2 - d * 0.18 + (k < i ? 0.12 : 0) + (sameCh ? 0.35 : -0.6) + (o.type === 'montage' ? -0.3 : 0);
    if (!best || sc > best.sc) best = { k, sc };
  }
  if (!best) return undefined;
  return { ...(pictureOf(scenes[best.k]) as Pic), from: best.k };
}

/** Devices that lay the related picture soft behind themselves (topic explainer / UI card: topic/cards.tsx DevicePlate). */
export const DEVICE_PLATE_TYPES = new Set(['explainer', 'ui-card']);
/**
 * The picture a device or chapter card with none of its own stands on (Gimli 9ff721 önce/sonra, 29 Ekim 2026: şema ve
 * bölüm kartı zemini neredeyse siyah): the nearest related one (relatedSource), undefined when the scene has its own
 * picture, is another type, or nothing fits.
 */
export function devicePlateSource(scenes: Scene[], i: number): Pic | undefined {
  const s = scenes[i];
  if (!s || isPictured(s)) return undefined;
  const chapterCard = s.type === 'title' && (s as { chapterCard?: boolean }).chapterCard === true;
  if (!DEVICE_PLATE_TYPES.has(s.type) && !chapterCard) return undefined;
  const r = relatedSource(scenes, i);
  if (!r) return undefined;
  const { from: _from, ...pic } = r;
  return pic;
}

/** The period texture for a story: a film gate on a dark ground; ledger paper (money) or newsprint on a light one. */
export function eraTexture(genre: GenreId, tone: 'light' | 'dark'): EraTexture {
  if (tone === 'dark') return 'film';
  return genre === 'finance' ? 'ledger' : 'newsprint';
}

function blurSource(scenes: Scene[], i: number): SceneLook['blurSrc'] {
  for (let k = i - 1; k >= 0; k--) {
    const s = scenes[k] as Pictured;
    const image = s.image ?? s.images?.[0] ?? s.layers?.bg;
    if (image || s.video) return { image, video: s.video, videoStart: s.videoStart, videoDur: s.videoDur, videoW: s.videoW, videoH: s.videoH };
  }
  for (let k = i + 1; k < scenes.length; k++) {
    const s = scenes[k] as Pictured;
    const image = s.image ?? s.images?.[0] ?? s.layers?.bg;
    if (image) return { image };
  }
  return undefined;
}

/** A ground with its colours filled in from the look. */
export function fillBackdrop(b: Backdrop, g: Genre): Backdrop {
  const bg = g.bg;
  switch (b.kind) {
    case 'solid':
      return { kind: 'solid', color: b.color ?? bg };
    case 'gradient':
      return { kind: 'gradient', color: b.color ?? mix(bg, g.accent, 0.28), color2: b.color2 ?? mix(bg, '#000000', 0.35) };
    case 'paper':
      return { kind: 'paper', color: b.color ?? (isLight(bg) ? bg : g.paper || '#efe8da') };
    case 'blueprint':
      return { kind: 'blueprint', color: b.color ?? '#0d3b73', color2: b.color2 ?? '#ffffff' };
    case 'halftone':
      return { kind: 'halftone', color: b.color ?? bg, color2: b.color2 ?? g.accent };
    case 'split-color':
      return { kind: 'split-color', color: b.color ?? g.accent, color2: b.color2 ?? bg };
    case 'texture':
      return { kind: 'texture', color: b.color ?? mix(bg, '#808080', 0.12) };
    case 'blur':
      return { kind: 'blur', color: b.color };
    case 'related': {
      const tone = b.tone ?? (b.color ? (isLight(b.color) ? 'light' : 'dark') : g.light ? 'light' : 'dark');
      return { kind: 'related', tone, color: b.color ?? (tone === 'light' ? (isLight(bg) ? bg : g.paper || '#efe8da') : isLight(bg) ? '#121110' : bg) };
    }
    case 'era': {
      const tone = b.tone ?? (b.variant === 'film' ? 'dark' : b.variant ? 'light' : b.color ? (isLight(b.color) ? 'light' : 'dark') : g.light ? 'light' : 'dark');
      const variant = b.variant ?? eraTexture(g.id, tone);
      const paperish = variant !== 'film';
      const color = b.color && isLight(b.color) === paperish ? b.color : variant === 'film' ? '#0e0d0c' : variant === 'ledger' ? '#efeddc' : '#e8e1cf';
      return { kind: 'era', variant, tone: paperish ? 'light' : 'dark', color };
    }
    default:
      return b;
  }
}

/** The colour type sits on for a ground (split-colour: the darker half's is irrelevant — type sits over the left field). */
function groundColor(b: Backdrop): string | undefined {
  if (b.kind === 'blur') return '#202020';
  if (b.kind === 'related') return b.tone === 'light' ? b.color : '#151515';
  if (b.kind === 'split-color') return b.color2;
  return b.color;
}

/** Colours for type on a LIGHT ground. */
export function onLight(g: Genre, ground: string): Genre {
  const ink = g.light && contrast(g.ink, ground) >= 4.5 ? g.ink : '#15120e';
  const accent = readable(g.accent, ground, 3);
  const accent2 = readable(g.accent2, ground, 3);
  const titleInk = g.titleInk && contrast(g.titleInk, ground) >= 3 ? g.titleInk : undefined;
  return { ...g, ink, accent, accent2, titleInk, bg: ground, light: true };
}

/** Colours for type on a DARK ground (over a picture, or a dark backdrop in a light variant). */
export function onDark(g: Genre, ground = '#101010'): Genre {
  if (!g.light && contrast(g.ink, ground) >= 4.5) return g;
  const ink = contrast(g.ink, ground) >= 4.5 ? g.ink : isLight(g.paper) ? g.paper : '#f4f1ea';
  const accent = readable(g.accent, ground, 3);
  const accent2 = readable(g.accent2, ground, 3);
  const titleInk = g.titleInk && contrast(g.titleInk, ground) >= 3 ? g.titleInk : undefined;
  return { ...g, ink, accent, accent2, titleInk, bg: g.light ? mix(g.ink, '#000000', 0.4) : g.bg, light: false };
}

/** A chapter's accent: the label colour follows it when the look's label WAS its accent. */
function withAccent(g: Genre, accent: string): Genre {
  const out: Genre = { ...g, accent };
  if (g.labelBg.toLowerCase() === g.accent.toLowerCase()) {
    out.labelBg = accent;
    out.labelInk = lum(accent) > 0.4 ? mix(g.bg, '#000000', 0.5) : '#ffffff';
  }
  return out;
}

/**
 * Which text style a scene gets from the variant's palette: each chapter has
 * its own dominant style (the palette rotated by the chapter number), and
 * about a third of the scenes take one of the others, seeded per scene.
 */
function paletteStyle(palette: TextStyle[], chapter: number, index: number, seed: string): TextStyle {
  if (!palette.length) return 'box';
  const n = palette.length;
  const lead = palette[((chapter % n) + n) % n];
  const r = hash01(`${seed}|ts|${index}`);
  if (n === 1 || r < 0.64) return lead;
  const others = palette.filter((t) => t !== lead);
  return others[Math.floor(hash01(`${seed}|tso|${index}`) * others.length) % others.length];
}

function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/* ------------------------------------------------------------ the grade */

/*
 * COLOUR IS THE DEFAULT. Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: the last seven videos measured
 * mean luma 52-75 and saturation 2,5-7,5 (ffmpeg signalstats), 21-39% of frames under luma 40 — "her video siyah,
 * karanlık, birbirinin aynı". The best one, Panama (grade 'color'), measured luma 88 / saturation 10,2. Desaturating
 * grades are accents (the art director spends at most one chapter on one); the engine never falls back to one.
 */

/** Grades that take the colour out of a picture: accents only, never a base or a fallback. */
export const DESATURATING_GRADES: ReadonlySet<Grade> = new Set<Grade>(['selective', 'mono', 'duotone', 'sepia', 'cyanotype', 'bleach']);

/** What a picture is drawn with when nothing (scene, chapter, variant) names a usable grade. Never 'duotone'. */
export const FALLBACK_GRADE: Grade = 'color';

/** Before colour film the archive is monochrome anyway: a sepia variant base is allowed for such a story. */
export const PRE_COLOUR_YEAR = 1940;

/** A real archive photo or source clip (docu-archive.js / source-clips.js / inbox-commons.js mark them). */
export function isArchivePicture(s: Scene | undefined | null): boolean {
  const x = (s ?? {}) as { archived?: boolean; sourceLabel?: string };
  return !!(x.archived || x.sourceLabel);
}

/**
 * A scene's photo grade. The scene's own grade (the plan chose it for THIS shot) always wins; then the chapter's,
 * then the variant's default, then 'color'. A real archive photo/clip never INHERITS a desaturating grade
 * (Kartal Yuvası 950730: colour Commons photos printed grey by the chapter's 'selective') unless the pipeline marked
 * the source itself monochrome (scene.monoSource). A variant's desaturating default is no base either (swiss-editorial
 * 'mono', the originals' 'duotone' greyed whole videos) — except sepia for a story set before colour film.
 */
export function sceneGrade(s: Scene, cl: ChapterLook | null | undefined, genre: Pick<Genre, 'grade'>, eraStart?: number): Grade {
  if (isGrade(s.grade)) return s.grade;
  const preColour = eraStart !== undefined && eraStart < PRE_COLOUR_YEAR;
  let inherited: Grade = FALLBACK_GRADE;
  if (cl && isGrade(cl.grade)) inherited = cl.grade;
  else if (isGrade(genre.grade) && (!DESATURATING_GRADES.has(genre.grade) || (preColour && genre.grade === 'sepia'))) inherited = genre.grade;
  if (DESATURATING_GRADES.has(inherited) && isArchivePicture(s) && (s as { monoSource?: boolean }).monoSource !== true) return FALLBACK_GRADE;
  return inherited;
}

/* ------------------------------------------------------- global frame look */

/*
 * The whole-film overlays. Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: variants drew a 0,6-0,9 black
 * vignette over every frame and crime/epic/horror a constant 22% of black bars — two more reasons every video read as
 * black. The vignette is capped; the bars are opt-in (script.letterbox === true); a cold open still draws its own.
 */
export const VIGNETTE_MAX = 0.35;

/** The global vignette's strength for a look: its own, never above VIGNETTE_MAX. */
export function globalVignette(strength: number | undefined): number {
  const v = Number(strength);
  return Number.isFinite(v) ? Math.max(0, Math.min(VIGNETTE_MAX, v)) : 0;
}

/** Constant cinema bars over the whole edit only when the script asks for them. */
export function wantsLetterbox(script: { letterbox?: unknown } | null | undefined): boolean {
  return script?.letterbox === true;
}

/**
 * The chapter-card transition: the video's own transition palette leads (its first kind that is not a hard cut or a
 * blackout); the genre's fixed kind only without one. Kartal Yuvası 950730: every crime/horror chapter opened on a
 * 'blackout' — one more black beat per chapter, the same in every video.
 */
export function chapterSignature(palette: readonly string[] | null | undefined, fallback: string): string {
  const own = (palette ?? []).find((k) => typeof k === 'string' && k !== '' && k !== 'cut' && k !== 'blackout');
  return own ?? fallback;
}

/** A mood's colour shift as a CSS filter for the PICTURE layer only ('' when neutral; type and devices keep theirs). */
export function moodFilter(g: { saturate?: number; brightness?: number; hue?: number } | null | undefined): string {
  if (!g) return '';
  const parts: string[] = [];
  if (g.saturate != null && g.saturate !== 1) parts.push(`saturate(${g.saturate})`);
  if (g.brightness != null && g.brightness !== 1) parts.push(`brightness(${g.brightness})`);
  if (g.hue) parts.push(`hue-rotate(${g.hue}deg)`);
  return parts.join(' ');
}

export function sceneLooks(script: Script, genre: Genre): SceneLook[] {
  const scenes = script.scenes ?? [];
  const seed = script.seedKey ?? script.id ?? 'look';
  const counters = counterStyles(script, genre);
  const eraStart = storyYears(script.era)?.start;
  let prevText: TextStyle | undefined;
  let silence = 0;
  return scenes.map((s, index) => {
    const ch = Number.isInteger(s.chapter) ? (s.chapter as number) : 0;
    const cl: ChapterLook = (script.chapterLooks?.[ch] as ChapterLook | null | undefined) ?? {};
    let g = cl.accent ? withAccent(genre, cl.accent) : genre;

    // Colour unless the plan chose otherwise; a real archive picture keeps its colour (sceneGrade).
    const grade: Grade = sceneGrade(s, cl, genre, eraStart);

    const pictured = isPictured(s);
    // Counter treatment; a 'photo' counter stands on the picture before it (dark ink, no ground).
    const counterStyle = s.type === 'counter' ? counters[index] : undefined;
    const picture = counterStyle === 'photo' ? counterPicture(scenes, index) : undefined;
    /*
     * Gimli 9ff721 önce/sonra, 29 Ekim 2026: şema ve bölüm kartı zemini neredeyse siyah — the topic explainer / UI card
     * and a chapter card with no picture of their own stood on a bare ground. They get the nearest RELATED picture
     * (topic/motifs.tsx devicePicture -> DevicePlate, soft, brightness >= 0.8). Only the look's `picture` carries it:
     * surface, ink and backdrop of these device scenes stay as they were.
     */
    const devicePic = devicePlateSource(scenes, index);
    const groundOk = ALWAYS_GROUND.has(s.type) || (GROUND_TYPES.has(s.type) && !pictured);
    let raw = picture ? undefined : s.backdrop && isBackdropKind(s.backdrop.kind) ? s.backdrop : groundOk ? (cl.backdrop ?? genre.backdrop) : undefined;
    /*
     * Big type never stands on an empty ground (viewers: "huge text with
     * nothing behind it"). It gets the nearest RELATED picture, darkened and
     * drifting — or a period texture when none fits. A chosen paper/texture/
     * gradient only sets that ground's tone (a light look stays light); flat
     * solid/gradient grounds survive only as deliberate silence beats.
     */
    let relSrc: (Pic & { from: number }) | undefined;
    if (!picture && groundOk && BIG_TEXT_TYPES.has(s.type) && !(s.type === 'title' && (s as { chapterCard?: boolean }).chapterCard)) {
      const kind = raw?.kind;
      // A silence beat is chosen on the scene itself (not a chapter/variant default), held (energy 1) and quiet (calm/sad or a music drop).
      const hush = s.silence === true || s.mood === 'calm' || s.mood === 'sad';
      if (kind && SILENCE_GROUNDS.has(kind) && s.backdrop?.kind === kind && s.energy === 1 && hush && silence < SILENCE_BEATS_MAX) silence++;
      else if (kind !== 'era') {
        const filled = raw && isBackdropKind(raw.kind) ? fillBackdrop(raw, g) : undefined;
        const gc = filled && filled.kind !== 'blur' ? groundColor(filled) : undefined;
        const lightGround = raw?.tone ? raw.tone === 'light' : filled?.kind === 'paper' || (!!gc && isLight(gc));
        const tone: 'light' | 'dark' = lightGround || (!raw && g.light) ? 'light' : 'dark';
        relSrc = relatedSource(scenes, index, ALWAYS_GROUND.has(s.type) && pictured);
        raw = relSrc
          ? { kind: 'related', tone, ...(gc && isLight(gc) === (tone === 'light') && filled?.kind !== 'related' ? { color: gc } : filled?.kind === 'related' && filled.color ? { color: filled.color } : {}) }
          : { kind: 'era', tone, variant: eraTexture(g.id, tone) };
      }
    }
    const backdrop = raw && isBackdropKind(raw.kind) ? fillBackdrop(raw, g) : undefined;

    let textStyle: TextStyle = 'box';
    if (isTextStyle(s.textStyle)) textStyle = s.textStyle;
    else if (TEXT_TYPES.has(s.type) && genre.textStyles?.length) textStyle = paletteStyle(genre.textStyles, ch, index, seed);
    // The editorial info caption is for names, places, dates and figures: a plain phrase takes another style of the look.
    if (textStyle === 'lower-third' && s.type === 'words' && !lineHasInfo(`${s.text ?? ''} ${(s as { kicker?: string }).kicker ?? ''}`)) {
      const alts = (genre.textStyles ?? []).filter((t) => t !== 'lower-third' && t !== prevText);
      textStyle = alts[0] ?? (prevText === 'underline' ? 'serif' : 'underline');
    }
    if (TEXT_TYPES.has(s.type)) prevText = textStyle;


    // The surface type sits on decides the ink.
    let surface: Surface;
    const ground = backdrop ? groundColor(backdrop) : undefined;
    const overPicture = (pictured && !ALWAYS_GROUND.has(s.type)) || !!picture;
    if (overPicture) surface = 'dark';
    else if (ground) surface = isLight(ground) ? 'light' : 'dark';
    else surface = g.light ? 'light' : 'dark';
    // Devices and print scenes (board, document, map, headline, split) keep the variant's own colours.
    const own = !TEXT_TYPES.has(s.type) && !ALWAYS_GROUND.has(s.type) && s.type !== 'photo';
    // A photo keeps the variant's ground (a light variant's collage board stays paper); only its supers turn light.
    if (s.type === 'photo') g = { ...onDark(g), bg: g.bg, light: g.light };
    else if (!own) g = surface === 'light' ? onLight(g, ground ?? g.bg) : onDark(g, ground && !isLight(ground) ? ground : '#101010');

    // Type crosses both halves of a split ground: an accent that vanishes on the coloured field gives way.
    if (!own && backdrop?.kind === 'split-color' && backdrop.color && backdrop.color2) {
      const field = mix(backdrop.color, backdrop.color2, 0.32);
      if (contrast(g.accent, field) < 2.2) {
        const alt = contrast(g.accent2, field) >= 2.2 && contrast(g.accent2, backdrop.color2) >= 2.2 ? g.accent2 : g.ink;
        g = { ...g, accent: alt };
      }
    }

    return {
      genre: g,
      grade,
      backdrop,
      textStyle,
      // Devices draw their own paper and cards: their type is never stripped of its shadows.
      surface: own ? 'dark' : surface,
      blurSrc: backdrop?.kind === 'blur' ? blurSource(scenes, index) : backdrop?.kind === 'related' ? (relSrc ?? relatedSource(scenes, index, ALWAYS_GROUND.has(s.type) && pictured)) : undefined,
      chapterName: script.chapters?.[ch],
      index,
      counterStyle,
      picture: picture ?? devicePic,
      eraStart,
    };
  });
}

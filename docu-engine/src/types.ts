export type GenreId = 'documentary' | 'finance' | 'horror' | 'crime' | 'epic' | 'science' | 'inspire';
export type FontKey =
  | 'anton'
  | 'inter'
  | 'oswald'
  | 'plexMono'
  | 'cinzel'
  | 'crimson'
  | 'bebas'
  | 'courier'
  | 'exo'
  | 'playfair'
  | 'lora'
  /** Newspaper and map faces: fetched only when a script has headline/map scenes. */
  | 'oldstandard'
  | 'fraktur'
  /** Look-variant faces (src/looks): fetched only when the script's variant or a text style uses them. */
  | 'dmserif'
  | 'spacegrotesk'
  | 'archivo'
  | 'jetbrains';
export type TransitionKind =
  | 'cut'
  | 'flash'
  | 'zoom'
  | 'glitch'
  | 'blackout'
  | 'whip'
  | 'leak'
  /* Pair transitions (src/effects/transitions.tsx): both shots on screen across the cut. */
  | 'film-burn'
  | 'ink'
  | 'paper-tear'
  | 'slide'
  | 'iris'
  | 'match'
  | 'pixel'
  | 'light-sweep'
  | 'dip-color'
  | 'spin-blur'
  | 'split-wipe';
/**
 * Scene effects (src/effects, catalogued in src/effects/catalog.ts): overlays
 * and camera modifiers a scene can carry in `fx`. Picture-level ones
 * (parallax, rack-focus, dolly-zoom, tilt-reveal, push-in, speed-ramp) act on a
 * full-frame picture only.
 */
export type FxKind =
  | 'light-leak'
  | 'film-burn'
  | 'flare'
  | 'chroma'
  | 'glitch'
  | 'zoom-blur'
  | 'parallax'
  | 'speed-ramp'
  | 'halftone'
  | 'vhs'
  | 'dust'
  | 'flash-frame'
  | 'rack-focus'
  | 'shake'
  | 'vignette-pulse'
  | 'scan-lines'
  | 'bokeh'
  | 'push-in'
  | 'dolly-zoom'
  | 'tilt-reveal';
/**
 * How the camera moves on a full-frame picture (src/effects/photo.tsx). Derived
 * per shot when omitted (src/effects/variety.js): ~1/3 holds, wide pictures
 * pan and tall ones tilt towards the subject, moves end on `focus`.
 */
export type CameraKind =
  | 'static'
  | 'drift'
  | 'push-in'
  | 'pull-out'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'detail-punch'
  | 'parallax'
  | 'handheld'
  | 'rack-focus';
/** `smart` (default): the whole picture on a soft extension when a cover crop would cut its subject or >~15% of it. */
export type FitKind = 'cover' | 'contain' | 'smart';
export type Pattern = 'dots' | 'grid' | 'scan' | 'none';

/* ------------------------------------------------ looks (src/looks/*) */

/**
 * How on-screen words are set (words / slam / title / montage text and the
 * keyword emphasis). 'box' is the genre's original treatment. Descriptions:
 * src/looks/catalog.ts TEXT_STYLES.
 */
export type TextStyle =
  | 'box'
  | 'underline'
  | 'marker'
  | 'outline'
  | 'stack'
  | 'serif'
  | 'typewriter'
  | 'cutout'
  | 'glitch'
  | 'lower-third'
  | 'neon'
  | 'stamp'
  /** Accents (hooks, quotes, climaxes; at most ~3 per video): full-screen kinetic typography on the voice. */
  | 'lyric'
  | 'kinetic'
  /** The topic identity's own caption language (src/topic/caption.tsx): set by the topic bible only. */
  | 'motif';

/** Colour grade of photos and footage (cheap SVG/CSS colour filters). 'duotone' is the genre's original. */
export type Grade = 'duotone' | 'mono' | 'color' | 'warm' | 'cool' | 'teal-orange' | 'sepia' | 'cyanotype' | 'bleach' | 'kodachrome' | 'vhs'
  /** Black and white with ONE hue kept in colour (script.topic.keepHue): the topic's accent object. Set by the topic bible only. */
  | 'selective';

/**
 * 'related' (the default under big text): the nearest related picture or clip
 * — a neighbouring scene, or one whose narration shares names/nouns with the
 * line — darkened, graded, drifting with depth blur; a clip plays slowed.
 * 'era': a period texture (newsprint, film gate, ledger paper) where no
 * picture fits. Plain 'solid' / 'gradient' are for deliberate silence beats.
 */
export type BackdropKind = 'solid' | 'gradient' | 'paper' | 'blueprint' | 'halftone' | 'blur' | 'split-color' | 'texture' | 'related' | 'era';

/** Era textures for the 'era' ground (src/looks/backdrops.tsx). */
export type EraTexture = 'newsprint' | 'film' | 'ledger';

/**
 * How a counter scene draws its figure (src/looks/catalog.ts COUNTER_STYLES).
 * 'box' is the genre's original (printed label / glow / terminal box). Unset:
 * rotated per video and chapter from the variant's palette (src/looks/counters.ts),
 * never the same treatment on two counters in a row.
 */
export type CounterStyle = 'box' | 'bare' | 'odometer' | 'photo' | 'ticker' | 'newsprint' | 'outline';

/**
 * The ground under a text / counter / chart / quote / timeline scene when it
 * is not over a picture. Colours default to the look's own; 'blur' is the
 * previous scene's picture, heavily blurred, in colour.
 */
export interface Backdrop {
  kind: BackdropKind;
  color?: string;
  color2?: string;
  /** 'era' (and 'related' without a picture): which period texture. */
  variant?: EraTexture;
  /** 'related' / 'era': a light (paper-washed) or dark (night) treatment; default from the colour / look. */
  tone?: 'light' | 'dark';
}

/** A per-chapter shift of the look (Script.chapterLooks, indexed by chapter number). */
export interface ChapterLook {
  accent?: string;
  grade?: Grade;
  backdrop?: Backdrop;
}

export interface Genre {
  id: GenreId;
  /**
   * Typographic family: `label` = printed labels and marker highlights
   * (documentary, crime, biography), `glow` = wide-tracked glowing type
   * (horror, epic, space), `terminal` = data/ticker type (finance).
   */
  look: 'label' | 'glow' | 'terminal';
  /** Title colour when it should differ from the look default (epic: gold, not bone). */
  titleInk?: string;
  bg: string;
  ink: string;
  accent: string;
  accent2: string;
  duoShadow: string;
  duoHighlight: string;
  headline: FontKey;
  body: FontKey;
  grain: number;
  vignette: number;
  flicker: boolean;
  /** Film dust and scratches. */
  dust: boolean;
  /** Cinematic bars on image scenes. */
  letterbox: boolean;
  /** Ambient light-leak strength, 0..1. */
  leak: number;
  transition: TransitionKind;
  pattern: Pattern;
  /** Photo scenes become tilted paper cards on a textured board. */
  collage: boolean;
  paper: string;
  labelBg: string;
  labelInk: string;
  /* ---- set by a look variant (src/looks/variants.ts); absent = the genre's original look ---- */
  /** Variant id this genre was resolved with. */
  variant?: string;
  /** Light theme: dark ink on a light (paper) ground. */
  light?: boolean;
  /** The variant's default photo grade. */
  grade?: Grade;
  /** The variant's default ground for text scenes. */
  backdrop?: Backdrop;
  /** The variant's text-style palette; the first is its signature. */
  textStyles?: TextStyle[];
  /** The topic identity's map look (src/topic): satellite night, period paper or a lit grid. */
  mapStyle?: MapStyle;
  /** Prompt fragments used to generate this genre's music and SFX. */
  musicPrompt: string;
  sfxPrompts: Record<SfxKind, string>;
}

/**
 * Transition/punch cue slots. `stinger` = dread hit (horror/crime only),
 * `thud` = a quiet low body blow for ordinary blackouts (not a story beat).
 */
export type SfxKind = 'hit' | 'whoosh' | 'riser' | 'ticks' | 'glitch' | 'swell' | 'snap' | 'stinger' | 'thud';

/**
 * A room tone laid under a RUN of scenes set in the same place, so the bed
 * continues across cuts instead of restarting every scene. Chosen by the
 * audio director from the sound library (lib/audio-director.mjs).
 */
export interface AmbienceCue {
  file: string;
  /** First and last scene index (inclusive) the bed spans. */
  fromScene: number;
  toScene: number;
  /** Linear gain 0..1 at full level (the engine fades 0.5s in/out). */
  gain: number;
  /** Seconds into the file where the bed starts (so reused beds differ). */
  offset?: number;
}

/**
 * A literal one-shot the narration itself describes ("the cannon fired",
 * "a siren"), placed on the spoken word. Never decorative.
 */
export interface EventCue {
  file: string;
  scene: number;
  /** Seconds from the scene's start (usually the spoken word's time). */
  at: number;
  /** Linear gain 0..1. */
  gain: number;
  /** Max seconds to play (cut with a short fade); the whole file if omitted. */
  dur?: number;
  /** The acoustic space the pipeline gave the file (a reverb tag matched to the scene's place): cave, hall, ship, open. */
  space?: string;
  /** `at` is negative: the sound starts before the cut (its word lands right after it). */
  prelap?: boolean;
}

/**
 * A photo split into depth layers by the pipeline: the person cut out, and a
 * clean plate of the scene with them removed. The two move independently
 * (2.5D parallax), and type can sit BETWEEN them — behind the person.
 */
export interface Layers {
  bg: string;
  fg: string;
  /** Subject bounding box, 0..1: [x0, y0, x1, y1]. Drives where text goes. */
  box: [number, number, number, number];
}

/**
 * The emotion a scene should carry. Drives the music section under it, the
 * narrator's delivery, the colour grade and how fast the camera moves.
 */
export type Mood = 'curious' | 'calm' | 'tension' | 'dread' | 'reveal' | 'sad' | 'triumph';

/**
 * One clip for one picture slot — the same fields a scene carries for its main
 * picture, used where a scene holds several pictures (montage cuts, extra
 * collage cards). `image` is the clip's still frame.
 */
export interface VideoRef {
  video: string;
  videoStart?: number;
  videoDur?: number;
  videoW?: number;
  videoH?: number;
  image?: string;
  /** Gamma the pipeline opened this clip's dark still with (lib/produce.mjs liftIfDark): the clip gets the same lift. */
  liftGamma?: number;
}

/** Everything in a script is in SECONDS; the engine converts to frames. */
interface SceneBase {
  /** Minimum length. When the scene has voiceover it stretches to fit it. */
  dur: number;
  mood?: Mood;
  /** Describe the picture instead of supplying a file; the pipeline generates it in the script's visual style. */
  imagePrompt?: string;
  /** Cast members visible in this shot — their reference portrait keeps the face consistent. */
  cast?: string[];
  transition?: TransitionKind;
  /**
   * Effects on this shot (src/effects/catalog.ts). When NO scene of a script has
   * `fx`, the engine derives a varied set itself (src/effects/variety.js); once
   * any scene has it (the art director ran), scenes without it get none.
   */
  fx?: FxKind[];
  /** Camera move on the picture; derived when omitted. */
  camera?: CameraKind;
  /** How the picture meets the 16:9 frame (default `smart`). */
  fit?: FitKind;
  /**
   * How much the shot moves, 1 (still) .. 5 (fast push / punch): scales a
   * derived camera's speed and amplitude and the intensity of its effects.
   * Absent = 3 (the mood alone decides).
   */
  energy?: 1 | 2 | 3 | 4 | 5;
  /** Cut-ins inside the shot: hold (one continuous shot), normal, quick (1-2), rapid (3-4 on word hits). */
  pace?: 'hold' | 'normal' | 'quick' | 'rapid';
  /** Duck the music out for this scene — the held breath before a reveal. */
  silence?: boolean;
  /** A rising swell INTO this scene, ending exactly on its first frame. */
  riser?: boolean;
  /** Narration for this scene, generated with ElevenLabs by the pipeline. */
  say?: string;
  /** Split the image into depth layers (needs a person in the shot). */
  depth?: boolean;
  /** What this place SOUNDS like ("tram bell, distant vendors, footsteps on cobbles"). Generated as an ambient bed under the scene. */
  sound?: string;
  /** Which chapter of the video this scene belongs to (index into Script.chapters). */
  chapter?: number;
  /** 'prev': no new picture — the text sits on the previous scene's photo. */
  bg?: 'prev' | 'next';
  /** Where the picture comes from: a real archive photo, a free stock photo, or AI (imagePrompt). */
  source?: 'archive' | 'stock' | 'ai';
  /** English search query for archive/stock. */
  search?: string;
  /* ---- filled in by the pipeline, never written by hand ---- */
  /** Pixel size of the scene's main image (archive scans can be small/portrait). */
  imgW?: number;
  imgH?: number;
  /**
   * Footage for this shot, found by the pipeline: an H.264 MP4 (no audio,
   * 30 fps, <= 1920 wide) relative to the public dir. Every picture the scene
   * shows (full bleed, collage card, backdrop, chapter plate) plays it instead
   * of `image`, which stays set as a still frame of the clip — the fallback
   * when the file fails. A scene longer than the footage slows it (>= 0.6x),
   * then freezes on its last played frame with a push-in.
   */
  video?: string;
  /** Seconds into the file where the shot starts. */
  videoStart?: number;
  /** Seconds of usable footage in the file (the file's usable END time; the scene uses videoStart..videoDur). */
  videoDur?: number;
  /** Pixel size of the clip (small or 4:3 archive footage is shown whole on a soft plate). */
  videoW?: number;
  videoH?: number;
  /** The picture was held over from the previous scene (bg:'prev'); a held clip continues where that scene left it. */
  heldBg?: boolean;
  /** The picture is another scene's (the pipeline's borrow pass). */
  borrowed?: boolean;
  /** Base zoom around `focus` for a borrowed still (1.3-1.8): a different, tighter region of the same picture. */
  crop?: number;
  layers?: Layers;
  /** Ambient bed generated from this scene's picture: rain, street, a humming bulb. */
  ambience?: string;
  voice?: string;
  voiceDur?: number;
  /** Start time of each spoken word, seconds from scene start. */
  wordTimes?: { word: string; t: number }[];
  /**
   * Foley a scene asks for (new scene types, a pipeline pass): scene-local
   * seconds of an on-screen action. The engine plays them under its density
   * budget (timeline.js planFoley); built-in scene types need none.
   */
  foley?: FoleyHint[];
  /* ---- look (src/looks): unset = the chapter's, then the variant's default ---- */
  /** How this scene's words are set (words / slam / title / montage). */
  textStyle?: TextStyle;
  /** Ground under a text scene that is not over a picture. */
  backdrop?: Backdrop;
  /** Colour grade of this scene's photos and footage. */
  grade?: Grade;
  /* ---- topic identity (src/topic): set by the pipeline's topic bible; absent = none ---- */
  /** Glowing line icons beside the subject, each on its spoken word (a metaphor layer on concrete lines). */
  icons?: TopicIcon[];
  /** How this archive still is presented (the video's one presentation, script.topic.photo). */
  present?: PhotoPresent;
  /** Enter through the topic motif's own wipe (the outgoing scene's last frames carry the panel in). */
  wipe?: boolean;
}

export interface TitleScene extends SceneBase {
  type: 'title';
  kicker?: string;
  title: string;
  image?: string;
  /**
   * A chapter card inserted by the pipeline at each chapter change (no
   * narration): "BÖLÜM 3" + the chapter title. A breath for the music and a
   * structure mark for long videos.
   */
  chapterCard?: boolean;
  /** 1-based chapter number shown on a chapter card. */
  chapterNo?: number;
}

export interface SlamScene extends SceneBase {
  type: 'slam';
  word: string;
  sub?: string;
  image?: string;
  /** Seconds of "air" before the word lands. Reference: ~1.0s. With a voice
   *  track, the pipeline moves this onto the spoken word itself. */
  at?: number;
}

export interface CounterScene extends SceneBase {
  type: 'counter';
  from?: number;
  to: number;
  label?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  /** The number is a year (1453): no thousands separator, counts from a nearby year. */
  year?: boolean;
  /** Treatment (src/looks/catalog.ts COUNTER_STYLES); unset = rotated per video/chapter. */
  counterStyle?: CounterStyle;
}

export interface PhotoScene extends SceneBase {
  type: 'photo';
  image: string;
  /** Extra images: in collage genres they land as more cards, staggered. */
  images?: string[];
  /** Footage for the extra cards, aligned with `images` (null = that card is a still). */
  clips?: (VideoRef | null)[];
  /** Prompts for extra cards, generated like `imagePrompt`. */
  imagePrompts?: string[];
  /** Focal point 0..1 the camera pushes towards — put it on the face. */
  focus?: [number, number];
  name?: string;
  role?: string;
  caption?: string;
  natural?: boolean;
  /** Full-screen even in a collage genre — for shots that need the whole frame. */
  fullBleed?: boolean;
  /** Freeze & mark: the shot freezes and a hand-drawn circle + arrow + label point at a detail. */
  annotate?: Annotate;
}

export interface WordsScene extends SceneBase {
  type: 'words';
  text: string;
  keyword?: string;
  /**
   * What of the line is set on screen (the art director's caption decision):
   * 'full' (default) the line with its keyword emphasis; 'key' only the
   * keyword / key phrase, big, landing on its spoken frame; 'none' no text —
   * a clean picture shot (the narration carries the line).
   */
  textMode?: 'full' | 'key' | 'none';
  /** Small-caps kicker of an editorial info caption (lower-third): "NORTH ATLANTIC · APRIL 15, 1912". */
  kicker?: string;
  image?: string;
  focus?: [number, number];
}

export interface ChartScene extends SceneBase {
  type: 'chart';
  points: number[];
  title?: string;
  prefix?: string;
  suffix?: string;
  /** Labels under the first and last point, e.g. years. */
  from?: string;
  to?: string;
}

/**
 * Rapid cuts through several images, one per beat — the cold-open device.
 * Optional `text` lands word by word as the narrator says each word; the
 * last word is the hook and hits hardest.
 */
export interface MontageScene extends SceneBase {
  type: 'montage';
  images?: string[];
  /**
   * Footage per cut, aligned with `images` (null = that cut is a still). When
   * absent but the scene itself has `video`, the cuts walk through that one
   * clip at successive offsets.
   */
  clips?: (VideoRef | null)[];
  /** A prompt, or a prompt plus the cast visible in that shot. */
  imagePrompts?: (string | { prompt: string; cast?: string[]; source?: 'archive' | 'stock'; search?: string; image?: string })[];
  /** Cut times in seconds from scene start, placed on the music's beats by the pipeline. */
  cuts?: number[];
  /** Seconds per cut; the pipeline sets it to the music's beat. */
  per?: number;
  text?: string;
}

/**
 * A period newspaper front page: an aged sheet with a masthead, a date line
 * and columns of text; the headline typesets itself in big period type while
 * the camera tilts down from the masthead and pushes across it. `image` (or
 * the still of `video`) is printed as the front-page photo in halftone —
 * `bg: 'prev'` prints the photo the viewer just saw. The paper's look follows
 * the genre (finance: a restrained financial daily; horror: a Soviet paper
 * with a red masthead when `paper` is Cyrillic).
 */
export interface HeadlineScene extends SceneBase {
  type: 'headline';
  /** Masthead, the newspaper's name: "THE OREGONIAN", "ЛЕНИНСКИЙ ПУТЬ". Cyrillic switches the page to Soviet furniture. */
  paper: string;
  /** Date line under the masthead, as printed: "APRIL 16, 1912", "16 EKİM 1929". */
  date?: string;
  /** The headline itself, 2-8 words, in the paper's language. Sized to fit any length. */
  headline: string;
  /** Optional deck under the headline (one line, two at most). */
  sub?: string;
  /** Turkish translation, shown as a caption strip once the headline has landed (for a foreign-language paper). */
  translation?: string;
  /** Front-page photo (filled like any picture: bg:'prev', archive, imagePrompt). */
  image?: string;
  /** Caption printed under the front-page photo. */
  caption?: string;
  /** Focal point of the photo, 0..1. */
  focus?: [number, number];
}

/** The maps the engine can draw (hand-drawn in src/geo.ts, no tiles). */
export type MapRegion = 'pacific-northwest' | 'bosphorus' | 'north-atlantic' | 'urals' | 'wall-street' | 'solar-system';

export interface MapPoint {
  /** Label as shown (Turkish). */
  label: string;
  /** Position in the region's normalized frame: 0..1 left→right, top→bottom (src/geo.ts `regionXY` converts lat/lon). */
  x: number;
  y: number;
}

/**
 * An animated map. The camera starts on the whole region and moves in on the
 * `focus` point (or frames the route, or all points); `route` draws an
 * animated dashed line through the listed point indices with a moving
 * marker. Labels are placed so they never leave the frame or cover each other.
 */
export interface MapScene extends SceneBase {
  type: 'map';
  region: MapRegion;
  points: MapPoint[];
  /** Point indices joined, in order, by an animated dashed line with a moving marker. */
  route?: number[];
  /** `barrier`: the line is a boom/chain across the water (drawn link by link, no marker) instead of a journey. */
  line?: 'route' | 'barrier';
  /** Index of the point the camera zooms in on. */
  focus?: number;
  /** Caption in the map's cartouche under the region name ("NİSAN 1912"). */
  title?: string;
}

/* ================================================================ EDIT DEVICES
 * Documentary edit devices (src/devices/*). Every picture reference can point
 * at an EARLIER scene (`fromScene`, its index in script.scenes) instead of a
 * file: the pipeline copies that scene's still into `image` before render, and
 * the engine resolves it itself when `image` is still missing.
 */

/**
 * Freeze & mark on a photo (or footage) scene: at `at` seconds the shot
 * freezes, darkens, a hand-drawn circle draws around (x, y) and an arrow +
 * label type in, in the genre's accent colour.
 */
export interface Annotate {
  /** Seconds into the scene; default 40% of the scene. */
  at?: number;
  /** Point to circle, 0..1 of the PICTURE (not the frame): 0,0 = its top-left. */
  x: number;
  y: number;
  /** Circle radius as a fraction of the picture's WIDTH; default 0.08. */
  r?: number;
  label: string;
  /** The direction the arrow POINTS (onto the circle); the label sits on the opposite side. Auto when omitted. */
  arrow?: 'left' | 'right' | 'up' | 'down';
}

/** A picture slot filled from a file or from an earlier scene's still. */
export interface DeviceRef {
  /**
   * Index of an earlier scene whose picture (or footage still) to use — in
   * the script AS WRITTEN, before the pipeline inserts chapter cards (the
   * engine skips `chapterCard` scenes when it resolves this).
   */
  fromScene?: number;
  image?: string;
  /* filled by the pipeline when known */
  imgW?: number;
  imgH?: number;
}

export interface BoardItem extends DeviceRef {
  /** Handwritten label under the print. */
  label: string;
  /** Optional note on a small card pinned beside the print. */
  note?: string;
}

/**
 * EVIDENCE BOARD: prints pinned one by one on a cork (or dark) board, red
 * string between them, handwritten labels; the camera ends on `focus`.
 */
export interface BoardScene extends SceneBase {
  type: 'board';
  items: BoardItem[];
  /** Item index pairs joined by red string. */
  links?: [number, number][];
  /** Item the camera ends on. */
  focus?: number;
  title?: string;
}

export type DocKind = 'fbi-teletype' | 'letter' | 'report' | 'telegram' | 'ledger';

/**
 * DOCUMENT ZOOM: a scanned document (`image`) or a generated period document
 * (`doc`); the camera pushes into the line holding `highlight` while a marker
 * sweeps over it, `redact` substrings get black bars, `stamp` slams on.
 */
export interface DocumentScene extends SceneBase {
  type: 'document';
  /** A scan of the real document (shown whole on the desk). */
  image?: string;
  fromScene?: number;
  imgW?: number;
  imgH?: number;
  doc?: {
    kind: DocKind;
    heading?: string;
    /** One entry per typed line (long ones wrap). Ledger: columns split by "|" or a tab. */
    lines: string[];
  };
  /** Substring that gets a marker highlight as the camera arrives on its line. */
  highlight?: string;
  /** Substrings covered by black bars. */
  redact?: string[];
  /** Rubber stamp text ("CONFIDENTIAL"); `true` = the locale's default (GİZLİ / CONFIDENTIAL). */
  stamp?: string | boolean;
}

export interface TimelineEvent {
  year: string | number;
  label: string;
}

/**
 * TIMELINE: a time axis (horizontal; vertical for long lists) whose events
 * appear as the camera travels to `focus`; earlier events dim.
 */
export interface TimelineScene extends SceneBase {
  type: 'timeline';
  events: TimelineEvent[];
  /** Event the camera settles on (default: the last). */
  focus?: number;
  /** Axis extent, drawn as end caps ([1900, 2000]). */
  span?: [string | number, string | number];
  title?: string;
  /** Force an orientation; auto = vertical when there are more than 6 events. */
  orient?: 'horizontal' | 'vertical';
}

export interface SplitSide extends DeviceRef {
  label?: string;
  /** Focal point of the picture, 0..1. */
  focus?: [number, number];
}

/** SPLIT SCREEN: two pictures side by side (`versus`) or a before/after wipe. */
export interface SplitScene extends SceneBase {
  type: 'split';
  left: SplitSide;
  right: SplitSide;
  mode?: 'versus' | 'before-after';
}

/**
 * QUOTE CARD: the words appear as the narrator says them (when `say` contains
 * the quote), attribution below, an optional duotone portrait beside it.
 */
export interface QuoteScene extends SceneBase {
  type: 'quote';
  quote: string;
  who: string;
  when?: string;
  fromScene?: number;
  image?: string;
  imgW?: number;
  imgH?: number;
  focus?: [number, number];
}

/* ================================================================ INFOGRAPHICS
 * Animated data scenes (src/infographics/*). Every number and label comes
 * from the narration (`say`): each item is revealed as the narrator says its
 * label or value (wordTimes), at a reading pace otherwise. Numbers are set in
 * the script's locale (en-US 5,800 · tr-TR 5.800).
 */

/** Unit of a value: '$', '€', '₺', '£' go before the number, '%' before it in Turkish (%38) and after in English, words (' people', ' tons') after it, smaller. */
export type InfoUnit = string;

export interface BarItem {
  label: string;
  value: number;
  /** Bar colour override (hex); the genre's palette otherwise. */
  color?: string;
}

/** COMPARISON BARS: bars grow together, values count up, the highlighted bar lights in the accent colour. */
export interface BarsScene extends SceneBase {
  type: 'bars';
  items: BarItem[];
  unit?: InfoUnit;
  title?: string;
  /** Index of the bar to light up (the point of the comparison). */
  highlight?: number;
  /** Largest first. */
  sort?: boolean;
}

/** SHARE OF A WHOLE: a ring that sweeps slice by slice; the highlighted slice pulls out. */
export interface DonutScene extends SceneBase {
  type: 'donut';
  slices: { label: string; value: number }[];
  title?: string;
  highlight?: number;
  /** Text in the ring's hole ("1,517 lost"); the highlighted slice's share otherwise. */
  centerLabel?: string;
}

export type InfoIcon = 'person' | 'ship' | 'plane' | 'coin' | 'house' | 'soldier' | 'bill' | 'building';

/** ICON ARRAY / PICTOGRAM: "9 of 10 died" — `total` icons (<= 100), `filled` light up one by one. */
export interface IconsScene extends SceneBase {
  type: 'icons';
  total: number;
  filled: number;
  icon: InfoIcon;
  /** What the filled ones are ("died", "passengers survived"). */
  label: string;
}

/**
 * SIZE COMPARISON: two discs sized by AREA; the camera starts on the smaller
 * one and pulls out to reveal the bigger ("$5,800 found vs $200,000 ransom").
 */
export interface ScaleScene extends SceneBase {
  type: 'scale';
  a: { label: string; value: number };
  b: { label: string; value: number };
  unit?: InfoUnit;
  title?: string;
}

/** PROCESS / NETWORK FLOW: nodes appear one by one, joined by arrows that draw themselves (a money trail, a chain of events). */
export interface FlowScene extends SceneBase {
  type: 'flow';
  nodes: { id: string; label: string }[];
  /** [from id, to id, optional label on the arrow]. */
  edges: [string, string, string?][];
  title?: string;
}

/** BIG-NUMBER STAT CARD: the number rolls in (or types in), with a trend arrow and sparkline. */
export interface StatScene extends SceneBase {
  type: 'stat';
  /** As spoken: "$5,800", "38%", "1 in 3". A single number is re-set in the locale's format. */
  value: string;
  label: string;
  sub?: string;
  trend?: 'up' | 'down';
}

export type InfoScene = BarsScene | DonutScene | IconsScene | ScaleScene | FlowScene | StatScene;

/* ================================================================ TOPIC IDENTITY
 * The video's own visual language (src/topic), chosen per topic by the
 * pipeline's topic bible (src/pipeline/docu-topic-bible.js): a motif that
 * dresses chapter cards, wipes, a texture under text scenes and the
 * signature devices; one way of presenting archive photos; glowing line
 * icons on concrete lines. Absent = the look exactly as before.
 */

export type MotifId = 'cipher' | 'telegraph' | 'ticker' | 'telemetry' | 'electric' | 'case-file' | 'expedition' | 'siege';
export type PhotoPresent = 'lightbox' | 'print' | 'film-frame' | 'framed';
export type MapStyle = 'satellite' | 'paper' | 'grid';

export interface TopicIdentity {
  motif: MotifId;
  /** Words / codes / figures the motif animates, all from the narration: "CQD", "SOS", "U.S. STEEL 205", "22.5 HOURS". */
  tokens?: string[];
  /** A short message the motif spells out (telegraph Morse, cipher plaintext) — narration words. */
  message?: string;
  /** Free motif parameters from the narration: { time: '11:40 PM', date: 'APRIL 14, 1912', ref: 'FLIGHT 305' }. */
  params?: Record<string, string>;
  /** How archive stills are presented across the whole video (the scenes carry `present`). */
  photo?: PhotoPresent | 'clean';
  /** The map look of the whole video. */
  map?: MapStyle;
  /** The topic's type faces (over the look variant's). */
  headline?: FontKey;
  body?: FontKey;
  /** Motif colours (glows, icons, motif marks); the look's accents otherwise. */
  accent?: string;
  accent2?: string;
  /** Hue (degrees) the 'selective' grade keeps in colour. */
  keepHue?: number;
  /** Strength of the persistent motif texture under text scenes, 0..1 (default 1). */
  texture?: number;
}

export interface TopicIcon {
  /** Icon id (src/topic/icons-data.ts, Tabler Icons). */
  id: string;
  /** Beside the subject on the left / right, or circling it. */
  side?: 'left' | 'right' | 'orbit';
  glow?: boolean;
  /** The narration word it lands on; ~25% into the scene otherwise. */
  at?: string;
  /** A brush-stroke name tag under the icon (an organisation as a character: "WHITE STAR LINE"). */
  label?: string;
  /** A thin glowing line from the subject to the icon. */
  tether?: boolean;
}

export interface ExplainerStep {
  label: string;
  detail?: string;
  /** The narration word the step lights on (its label's words otherwise). */
  at?: string;
  /** The thing the step shows (an icon id, src/topic/icons-data.ts); read from its words otherwise. */
  icon?: string;
}

/**
 * EXPLAINER: the mechanism the narrator describes, drawn step by step in the
 * topic motif's language (cipher rows, a Morse message being sent, a ticker
 * cascade, a signal path...). Steps light on their spoken words. Spanning
 * several scenes: each carries the same steps and `reveal` = the steps it adds.
 */
export interface ExplainerScene extends SceneBase {
  type: 'explainer';
  kind: 'sequence' | 'cycle' | 'compare' | 'mechanism';
  title?: string;
  steps: ExplainerStep[];
  /** Steps [from, to) this scene reveals; earlier ones stand lit already. Default: all. */
  reveal?: [number, number];
}

export interface UiCardRow {
  label: string;
  value?: string;
}

/**
 * UI CARD: a real-world interface recreated as a clean card tilted in 3D —
 * a ranking list, a terminal, a form, a ledger, a phone — with a pointer
 * arrow on the highlighted row. Every row comes from the narration.
 */
export interface UiCardScene extends SceneBase {
  type: 'ui-card';
  kind: 'ranking' | 'terminal' | 'form' | 'ledger' | 'phone';
  title?: string;
  sub?: string;
  rows: UiCardRow[];
  highlight?: number;
}

export type Scene =
  | TitleScene
  | SlamScene
  | CounterScene
  | PhotoScene
  | WordsScene
  | ChartScene
  | MontageScene
  | HeadlineScene
  | MapScene
  | BoardScene
  | DocumentScene
  | TimelineScene
  | SplitScene
  | QuoteScene
  | InfoScene
  | ExplainerScene
  | UiCardScene;

export interface Script {
  id: string;
  title?: string;
  /** Chapter titles, for YouTube chapter marks. */
  chapters?: string[];
  /** Seed source for image generation and SFX flavour; defaults to `id`. Keeps a copied script looking the same. */
  seedKey?: string;
  /** Benchmark only: effects to switch off (grain, dust, vignette, grade, ca, flicker). */
  perfOff?: string[];
  /** ElevenLabs model; eleven_v3 unless set. */
  voiceModel?: string;
  genre: GenreId;
  /**
   * The video's visual identity within its genre: a variant id from
   * src/looks/variants.ts (looks-catalog.json). Unknown or absent = the
   * genre's original look. `palette` still overrides single colours on top.
   */
  look?: { variant?: string };
  /**
   * How the video opens (src/opening): a treatment applied to the scenes
   * before the main title — 'headlines' | 'timestamps' | 'cold-open' |
   * 'evidence' | 'map-dive' | 'quote'. It never changes narration, timing,
   * order or sources. Absent, unknown or ineligible = today's opening.
   */
  opening?: { kind?: 'headlines' | 'timestamps' | 'cold-open' | 'evidence' | 'map-dive' | 'quote'; hook?: 'impact' | 'cinematic' | 'quiet' };
  /** Per-chapter accent / grade / backdrop shifts, indexed by scene.chapter. */
  chapterLooks?: (ChapterLook | null)[];
  palette?: Partial<Pick<Genre, 'accent' | 'accent2' | 'duoShadow' | 'duoHighlight' | 'bg' | 'labelBg' | 'labelInk' | 'paper'>>;
  /**
   * When the story happens ("1929-1933 (Great Depression)", "15th century").
   * Gates era-bound furniture: no camcorder/terminal HUD before ~1980, no
   * ticker tape before 1867 (src/looks/counters.ts eraRange).
   */
  era?: string;
  locale?: string;
  /** ElevenLabs voice id for narration. */
  voiceId?: string;
  /** Describe the music you want; the genre's prompt is used otherwise. */
  musicPrompt?: string;
  /**
   * One sentence that every generated image shares — era, film stock, light.
   * This is what makes a set of generated stills look like one archive.
   */
  visualStyle?: string;
  /** Recurring people: name -> physical description. Each gets one reference portrait. */
  cast?: Record<string, string>;
  /**
   * The sonic material this video's transitions are made of ("old paper and
   * tape", "rain and glass"). Every video gets its own set so no two videos
   * share a whoosh. Derived from the video id when omitted.
   */
  sfxFlavor?: string;
  /**
   * This video's transition vocabulary (3-4 kinds + rare accents), chosen by the
   * art director; weighted by repetition. Derived from the seed and genre when
   * omitted, so no two videos cut alike.
   */
  transitionPalette?: TransitionKind[];
  /** The effects the engine's variety pass may draw from when no scene has `fx`. */
  fxPalette?: FxKind[];
  /** Share of scenes (0..0.35) the variety pass gives an effect; seeded 0.22-0.32 when omitted. */
  fxDensity?: number;
  /** The topic's own visual identity (src/topic); absent = none. */
  topic?: TopicIdentity;
  scenes: Scene[];

  /* ---- filled in by the pipeline ---- */
  music?: string;
  musicVolume?: number;
  /** Beat times in seconds, detected from the music. */
  beats?: number[];
  /** Generated SFX variants per kind, rotated so no sound repeats back to back. */
  sfxFiles?: Partial<Record<SfxKind, string[]>>;
  /** Room-tone beds spanning runs of scenes (library sounds). */
  ambienceCues?: AmbienceCue[];
  /** Literal one-shots the narration describes, placed on the spoken word. */
  eventCues?: EventCue[];
  /** Which library tracks the score was cut from, per span — for credits and review. */
  musicCues?: { fromSec: number; toSec: number; title: string; artist?: string; license?: string }[];
  /** Foley one-shots per kind (library or synthesized, levelled well under the voice). */
  foleyFiles?: Partial<Record<FoleyKind, string[]>>;
  /** Where each SFX/foley file's loudest point sits and how long it is (seconds), keyed by file. */
  sfxMeta?: Record<string, { peakAt: number; dur: number }>;
  /** Panned copies of a whoosh (`lr` travels left to right, `rl` right to left), keyed by the pool file. */
  sfxPan?: Record<string, { lr?: string; rl?: string }>;
  /** The channel's short sonic logo, played at the very start and ending on the last frame. */
  logo?: { file: string; gain: number; dur: number };
}

/** Foley: small sounds of on-screen actions. */
export type FoleyKind = 'paper' | 'pen' | 'shutter' | 'pin' | 'type' | 'page';

/** A foley request in scene-local seconds (`dur`: how long the action runs, for pen and type). */
export interface FoleyHint {
  kind: FoleyKind;
  at: number;
  dur?: number;
}

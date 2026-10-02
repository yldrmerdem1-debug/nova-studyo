/**
 * The engine's effect and transition vocabulary, as data: what each one is,
 * where it belongs (genres, moods), how loud it is visually, and which sound
 * the mix plays under a transition. The pipeline's art director reads the
 * JSON dump of this file (scripts/dump-effects.mjs -> effects-catalog.json)
 * to choose per-scene `fx` and a per-video `transitionPalette`; the engine's
 * own variety pass (variety.ts) reads it when a script chooses nothing.
 *
 * No runtime imports: Node loads this file directly (type stripping).
 */
import type { CameraKind, FitKind, FxKind, GenreId, Mood, SfxKind, TransitionKind } from '../types';

export type Intensity = 1 | 2 | 3;

/** Where an effect works: `picture` needs a full-frame picture (photo/words/title backdrop), `frame` works on any scene. */
export type FxLayer = 'picture' | 'frame';

export interface FxInfo {
  id: FxKind;
  desc: string;
  /** 1 = barely noticed, 2 = a felt accent, 3 = a statement (spend sparingly). */
  intensity: Intensity;
  layer: FxLayer;
  genres: GenreId[];
  moods: Mood[];
  /** When it happens: over the whole scene, at the start, or on the scene's word hit (keyword / slam / stressed word). */
  timing: 'scene' | 'start' | 'hit';
  /** Footage only (a still gets nothing). */
  videoOnly?: boolean;
}

export interface TransitionInfo {
  id: TransitionKind;
  desc: string;
  intensity: Intensity;
  genres: GenreId[];
  moods: Mood[];
  /** The sound the mix lays under it (an existing SFX pool); none = a silent cut. */
  sfx: SfxKind | 'none';
  /** A heavy transition is only used on a story/mood turn, never on a plain cut inside a run. */
  heavy?: boolean;
  /** Frames drawn before / after the cut. Pair transitions show both shots at once. */
  frames: [number, number];
  /** Needs a picture on both sides (match cut). */
  needsPictures?: boolean;
}

const ALL: GenreId[] = ['documentary', 'finance', 'horror', 'crime', 'epic', 'science', 'inspire'];
const ANY: Mood[] = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];

export const FX_CATALOG: Record<FxKind, FxInfo> = {
  'light-leak': {
    id: 'light-leak',
    desc: 'Warm organic film light leak blooming in from one edge and drifting across, then settling low.',
    intensity: 1,
    layer: 'frame',
    genres: ['documentary', 'epic', 'inspire', 'science'],
    moods: ['calm', 'sad', 'triumph', 'reveal', 'curious'],
    timing: 'scene',
  },
  'film-burn': {
    id: 'film-burn',
    desc: 'A brief hot orange film burn flares from a corner as the shot starts, like the head of a reel.',
    intensity: 2,
    layer: 'frame',
    genres: ['documentary', 'epic', 'inspire', 'horror'],
    moods: ['reveal', 'triumph', 'sad', 'curious'],
    timing: 'start',
  },
  flare: {
    id: 'flare',
    desc: 'Anamorphic lens flare: a thin horizontal streak with a soft core that drifts through the frame and blooms on the hit.',
    intensity: 2,
    layer: 'frame',
    genres: ['epic', 'science', 'inspire', 'documentary'],
    moods: ['triumph', 'reveal', 'calm', 'curious'],
    timing: 'hit',
  },
  chroma: {
    id: 'chroma',
    desc: 'The lens splits its colour channels for a few frames on the narration hits (chromatic aberration spikes).',
    intensity: 2,
    layer: 'frame',
    genres: ['finance', 'crime', 'horror', 'science', 'documentary'],
    moods: ['tension', 'dread', 'reveal'],
    timing: 'hit',
  },
  glitch: {
    id: 'glitch',
    desc: 'Two or three short digital glitch bursts on word hits: displaced slices, colour split, a jolt.',
    intensity: 3,
    layer: 'frame',
    genres: ['finance', 'crime', 'horror', 'science'],
    moods: ['tension', 'dread', 'reveal'],
    timing: 'hit',
  },
  'zoom-blur': {
    id: 'zoom-blur',
    desc: 'A radial zoom-blur punch into the shot: stacked motion trails collapse onto the picture on the first frames.',
    intensity: 2,
    layer: 'frame',
    genres: ALL,
    moods: ['reveal', 'tension', 'triumph', 'dread'],
    timing: 'start',
  },
  parallax: {
    id: 'parallax',
    desc: '2.5D depth on a still: the focus region lifts off the background and drifts against it (feathered mask, no cut-out).',
    intensity: 1,
    layer: 'picture',
    genres: ALL,
    moods: ['curious', 'calm', 'sad', 'reveal', 'triumph'],
    timing: 'scene',
  },
  'speed-ramp': {
    id: 'speed-ramp',
    desc: 'Footage speeds up then eases into slow motion on the scene\'s hit and recovers (time remap, same footage length).',
    intensity: 2,
    layer: 'picture',
    genres: ALL,
    moods: ['reveal', 'tension', 'triumph', 'dread'],
    timing: 'hit',
    videoOnly: true,
  },
  halftone: {
    id: 'halftone',
    desc: 'Printed-page texture: a fine halftone dot screen and a slightly crushed, inked tone, like a magazine reproduction.',
    intensity: 2,
    layer: 'frame',
    genres: ['documentary', 'finance', 'crime', 'inspire'],
    moods: ['curious', 'calm', 'sad', 'tension'],
    timing: 'scene',
  },
  vhs: {
    id: 'vhs',
    desc: 'Camcorder tape: soft colour bleed, scan lines, a slow tracking band and head-switching noise at the bottom edge.',
    intensity: 3,
    layer: 'frame',
    genres: ['crime', 'horror', 'documentary', 'finance'],
    moods: ['dread', 'tension', 'sad', 'curious'],
    timing: 'scene',
  },
  dust: {
    id: 'dust',
    desc: 'Heavier archival reel damage: dust, a stray hair, gate weave and a faint exposure breathing.',
    intensity: 1,
    layer: 'frame',
    genres: ['documentary', 'horror', 'epic', 'crime', 'inspire'],
    moods: ['sad', 'calm', 'curious', 'dread'],
    timing: 'scene',
  },
  'flash-frame': {
    id: 'flash-frame',
    desc: 'A one-frame photographic flash with a fast exposure fall-off, exactly on the keyword.',
    intensity: 2,
    layer: 'frame',
    genres: ALL,
    moods: ['reveal', 'tension', 'dread', 'triumph'],
    timing: 'hit',
  },
  'rack-focus': {
    id: 'rack-focus',
    desc: 'Focus pulls from the background onto the subject on the hit: the focus region sharpens as the rest falls soft.',
    intensity: 2,
    layer: 'picture',
    genres: ALL,
    moods: ['reveal', 'curious', 'sad', 'tension'],
    timing: 'hit',
  },
  shake: {
    id: 'shake',
    desc: 'Handheld camera: smooth low-frequency drift and roll, with a jolt on the hit.',
    intensity: 2,
    layer: 'frame',
    genres: ['horror', 'crime', 'epic', 'finance', 'documentary'],
    moods: ['tension', 'dread', 'reveal'],
    timing: 'scene',
  },
  'vignette-pulse': {
    id: 'vignette-pulse',
    desc: 'A steady dark vignette that tightens once on each hit (no continuous pulsing: it flickered on charts).',
    intensity: 1,
    layer: 'frame',
    genres: ['horror', 'crime', 'epic', 'documentary', 'finance'],
    moods: ['tension', 'dread', 'sad'],
    timing: 'hit',
  },
  'scan-lines': {
    id: 'scan-lines',
    desc: 'Seen on a monitor: fine scan lines, an aperture-grille sheen and a slow refresh bar.',
    intensity: 1,
    layer: 'frame',
    genres: ['finance', 'science', 'crime'],
    moods: ['curious', 'tension', 'calm', 'dread'],
    timing: 'scene',
  },
  bokeh: {
    id: 'bokeh',
    desc: 'Soft out-of-focus light orbs drifting in front of the lens, in the genre\'s warm or cool light.',
    intensity: 1,
    layer: 'frame',
    genres: ['inspire', 'science', 'epic', 'documentary'],
    moods: ['calm', 'triumph', 'sad', 'curious'],
    timing: 'scene',
  },
  'push-in': {
    id: 'push-in',
    desc: 'A deliberate, eased dolly push onto the focal point (much stronger than the ambient creep).',
    intensity: 1,
    layer: 'picture',
    genres: ALL,
    moods: ANY,
    timing: 'scene',
  },
  'dolly-zoom': {
    id: 'dolly-zoom',
    desc: 'Vertigo: the subject holds its size while the background swells behind it — unease made visible.',
    intensity: 3,
    layer: 'picture',
    genres: ['horror', 'crime', 'epic', 'documentary', 'finance'],
    moods: ['dread', 'tension', 'reveal'],
    timing: 'scene',
  },
  'tilt-reveal': {
    id: 'tilt-reveal',
    desc: 'The camera starts high on the picture and tilts down onto the subject, revealing it.',
    intensity: 2,
    layer: 'picture',
    genres: ALL,
    moods: ['reveal', 'curious', 'triumph', 'calm'],
    timing: 'start',
  },
};

export const TRANSITION_CATALOG: Record<TransitionKind, TransitionInfo> = {
  cut: { id: 'cut', desc: 'Hard cut.', intensity: 1, genres: ALL, moods: ANY, sfx: 'none', frames: [0, 0] },
  flash: { id: 'flash', desc: 'Three frames of overexposure in the accent colour over the cut.', intensity: 2, genres: ALL, moods: ANY, sfx: 'whoosh', frames: [0, 4] },
  zoom: { id: 'zoom', desc: 'The new shot punches in from 1.55x with a zoom blur.', intensity: 2, genres: ALL, moods: ['reveal', 'tension', 'triumph', 'dread'], sfx: 'whoosh', frames: [0, 7] },
  glitch: { id: 'glitch', desc: 'Digital glitch bars and a jitter on the first frames.', intensity: 2, genres: ['finance', 'crime', 'science', 'horror'], moods: ['tension', 'dread', 'reveal'], sfx: 'glitch', frames: [0, 5] },
  blackout: { id: 'blackout', desc: 'A full stop: a few frames of black, then the shot fades up.', intensity: 3, genres: ['horror', 'crime', 'epic', 'documentary'], moods: ['dread', 'sad', 'reveal', 'tension'], sfx: 'thud', heavy: true, frames: [0, 8] },
  whip: { id: 'whip', desc: 'Whip pan: the new shot slides in fast with a motion blur.', intensity: 2, genres: ALL, moods: ['tension', 'curious', 'reveal', 'triumph'], sfx: 'whoosh', frames: [0, 7] },
  leak: { id: 'leak', desc: 'A bright light leak sweeps across the cut.', intensity: 1, genres: ['documentary', 'science', 'inspire', 'epic'], moods: ['calm', 'curious', 'triumph', 'sad'], sfx: 'none', frames: [0, 12] },
  'film-burn': {
    id: 'film-burn',
    desc: 'The outgoing shot burns out from an edge into white-hot film, the new shot emerges as the burn recedes.',
    intensity: 2,
    genres: ['documentary', 'epic', 'inspire', 'horror'],
    moods: ['reveal', 'triumph', 'sad', 'calm'],
    sfx: 'swell',
    frames: [9, 10],
  },
  ink: {
    id: 'ink',
    desc: 'The new shot bleeds in through spreading ink blots with a dark wet edge.',
    intensity: 3,
    genres: ['horror', 'inspire', 'epic', 'documentary', 'crime'],
    moods: ['dread', 'sad', 'calm', 'reveal'],
    sfx: 'swell',
    heavy: true,
    frames: [5, 12],
  },
  'paper-tear': {
    id: 'paper-tear',
    desc: 'The outgoing shot is torn in two along a ragged paper edge and pulled away, revealing the new one.',
    intensity: 3,
    genres: ['documentary', 'crime', 'inspire'],
    moods: ['reveal', 'tension', 'curious'],
    sfx: 'whoosh',
    heavy: true,
    frames: [5, 9],
  },
  slide: {
    id: 'slide',
    desc: 'Push: the new shot shoves the old one out of frame with a fast eased move and motion blur.',
    intensity: 2,
    genres: ['finance', 'documentary', 'science', 'crime', 'inspire'],
    moods: ['curious', 'tension', 'triumph'],
    sfx: 'whoosh',
    frames: [4, 6],
  },
  iris: {
    id: 'iris',
    desc: 'A soft iris closes on the old shot\'s focal point and opens on the new one\'s.',
    intensity: 3,
    genres: ['horror', 'epic', 'inspire', 'documentary', 'crime', 'science'],
    moods: ['dread', 'sad', 'reveal', 'calm'],
    sfx: 'snap',
    heavy: true,
    frames: [8, 9],
  },
  match: {
    id: 'match',
    desc: 'Match cut: the camera dives into the old focal point and surfaces from the new one at the same place on screen.',
    intensity: 1,
    genres: ALL,
    moods: ANY,
    sfx: 'swell',
    needsPictures: true,
    frames: [7, 9],
  },
  pixel: {
    id: 'pixel',
    desc: 'The picture breaks into growing blocks, swaps, and resolves back to full resolution.',
    intensity: 2,
    genres: ['finance', 'science', 'crime'],
    moods: ['tension', 'curious', 'reveal'],
    sfx: 'glitch',
    frames: [6, 6],
  },
  'light-sweep': {
    id: 'light-sweep',
    desc: 'A diagonal band of light sweeps across the frame and wipes the new shot in behind it.',
    intensity: 2,
    genres: ['epic', 'science', 'inspire', 'documentary', 'finance'],
    moods: ['triumph', 'reveal', 'curious', 'calm'],
    sfx: 'whoosh',
    frames: [6, 7],
  },
  'dip-color': {
    id: 'dip-color',
    desc: 'Dip to a colour: the old shot washes out into the genre\'s tone, holds a beat, and the new one fades up out of it.',
    intensity: 2,
    genres: ALL,
    moods: ['sad', 'dread', 'reveal', 'calm', 'triumph'],
    sfx: 'swell',
    heavy: true,
    frames: [7, 9],
  },
  'spin-blur': {
    id: 'spin-blur',
    desc: 'A fast roll: the old shot spins away blurred, the new one spins in and locks.',
    intensity: 3,
    genres: ['finance', 'epic', 'science', 'documentary'],
    moods: ['tension', 'triumph', 'reveal'],
    sfx: 'whoosh',
    frames: [4, 6],
  },
  'split-wipe': {
    id: 'split-wipe',
    desc: 'Three panels of the new shot slide in one after another, with a thin accent line on their leading edge.',
    intensity: 2,
    genres: ['finance', 'crime', 'documentary', 'science'],
    moods: ['curious', 'tension', 'reveal'],
    sfx: 'whoosh',
    frames: [5, 7],
  },
};

export const FX_KINDS = Object.keys(FX_CATALOG) as FxKind[];
export const TRANSITION_KINDS = Object.keys(TRANSITION_CATALOG) as TransitionKind[];

/* ---------------------------------------------------------------- camera */

export interface CameraInfo {
  id: CameraKind;
  desc: string;
  /** What the variety pass gives it to: picture shapes and moods. */
  suits: string;
  intensity: Intensity;
}

export const CAMERA_CATALOG: Record<CameraKind, CameraInfo> = {
  static: { id: 'static', desc: 'A locked-off hold (barely perceptible creep). Lets a document, a face or a sad beat breathe.', suits: 'documents, text-heavy pictures, small scans, sad/calm beats, energy 1', intensity: 1 },
  drift: { id: 'drift', desc: 'A slow lateral slide: a hold that is still alive; keeps the old cut-ins on a long hold.', suits: 'calm narration over any picture', intensity: 1 },
  'push-in': { id: 'push-in', desc: 'An eased dolly push that ends on the focus (lands on the key word when it falls in the back half).', suits: 'most pictures, tension, reveal', intensity: 1 },
  'pull-out': { id: 'pull-out', desc: 'Starts tight on the focus and widens to reveal the context.', suits: 'establishing a place after a detail, a reveal of scale', intensity: 1 },
  'pan-left': { id: 'pan-left', desc: 'The camera travels left across the picture and ends on the subject.', suits: 'wide pictures (> 1.9:1) with the subject on the left', intensity: 2 },
  'pan-right': { id: 'pan-right', desc: 'The camera travels right across the picture and ends on the subject.', suits: 'wide pictures (> 1.9:1) with the subject on the right', intensity: 2 },
  'tilt-up': { id: 'tilt-up', desc: 'The camera rises up the picture onto a high subject (a face, a tower).', suits: 'pictures taller than 16:9 (3:2, 4:3) with the focus in the upper half', intensity: 2 },
  'tilt-down': { id: 'tilt-down', desc: 'The camera starts high and tilts down onto the subject, revealing it.', suits: 'tall pictures with the focus low; reveals', intensity: 2 },
  'detail-punch': { id: 'detail-punch', desc: 'Holds wide, cuts in on the focus exactly on the hit word, cuts back out ~1.5 s later.', suits: 'voiced scenes with a keyword or a stressed word, sharp sources', intensity: 2 },
  parallax: { id: 'parallax', desc: '2.5D: the focus region lifts off the background and drifts against it (feathered mask, no cut-out).', suits: 'stills with a clear subject; curious, calm, triumph', intensity: 1 },
  handheld: { id: 'handheld', desc: 'A living handheld operator: smooth drift and roll, never a jitter.', suits: 'tension and dread', intensity: 2 },
  'rack-focus': { id: 'rack-focus', desc: 'Focus pulls from the background onto the subject on the hit.', suits: 'stills with depth; reveal, curious', intensity: 2 },
};

export const FIT_CATALOG: Record<FitKind, string> = {
  smart:
    "Default. Cover-crop to 16:9 unless the crop would cut the subject's safe band around `focus` or lose more than ~15% (portraits, small archive scans, documents, panoramas over 2.1:1): then the whole picture on a soft, dimmed, moving copy of itself (a paper print in collage genres). Camera moves stay inside the picture.",
  cover: 'Always fill the frame (crop to 16:9 around `focus`).',
  contain: 'Always show the whole picture (documents, text, anything that must not be cropped).',
};

export const ENERGY_CATALOG = {
  field: 'energy',
  values: [1, 2, 3, 4, 5],
  desc: "How much the shot moves. Scales a DERIVED camera (1 = still/hold, 3 = the mood alone, 5 = fast push or punch that lands early) and the intensity of the scene's effects (x0.55 .. x1.3). An explicit `camera` keeps its speed. Absent = 3.",
};

export const PACE_CATALOG = {
  field: 'pace',
  values: ['hold', 'normal', 'quick', 'rapid'],
  desc: 'Cut-ins inside a picture scene: hold = one continuous shot (camera static/drift at most), normal = the camera decides, quick = 1-2 cut-ins, rapid = 3-4 short cut-ins; each lands on a narration word and alternates crops around the focus. Never on a contained picture. Absent = normal.',
};

import React, { useMemo } from 'react';
import { RankBadges } from './ranking/RankBadge';
import { AbsoluteFill, Audio, Freeze, Sequence, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  ChromaticDefs,
  DuotoneDefs,
  Dust,
  Flicker,
  Grain,
  Letterbox,
  TransitionOverlay,
  Vignette,
  entranceStyle,
} from './fx';
import { setTextLocale } from './fonts';
import { GENRES } from './genres';
import MOODS from './moods.json';
import { CHAPTER_LAND, Chart, Counter, Montage, PhotoScn, Slam, Title, Words, montageCuts, montageWords, sceneImpacts, slamFrame } from './scenes';
import { Headline, headlineLand } from './headline';
import { MapScn, mapPlan } from './map';
import { DeviceScn } from './devices';
import { FxStack, PairTransition, isPairKind, pairFrames, styledScenes, transitionStyle } from './effects';
import { LookContext, type LookCtx } from './looks/context';
import { GradeDefs } from './looks/grades';
import { GroundFill } from './looks/backdrops';
import { sceneLooks, type SceneLook } from './looks/resolve';
import { applyVariant, variantFor } from './looks/variants';
import { SelectiveDefs, TopicContext, TopicSceneLayer, TopicWipe, topicGenre, topicOf, wipeFlags, type TopicCtx } from './topic';
import './looks/fonts';
import {
  OpeningContext,
  OpeningOverlay,
  openingBody,
  openingCountAt,
  openingDelayed,
  spokenDelayed,
  openingFilter,
  openingHits,
  openingImpacts,
  openingFoley,
  openingGenre,
  openingModel,
  openingMusicScenes,
  openingSfx,
  openingStyled,
  openingTransitions,
  resolveOpening,
  sceneCtx,
  type OpeningModel,
} from './opening';
// @ts-ignore -- plain ESM shared with Node (lib/produce.mjs, tests); typed by the facade below.
import * as timelineJs from './timeline.js';
import type { FoleyHint, FoleyKind, Genre, GenreId, Mood, Scene, Script, SfxKind, TransitionKind } from './types';

export const FPS = 30;

type MoodSpec = (typeof MOODS)['curious'];
const moodOf = (s: Scene): MoodSpec => MOODS[(s.mood ?? 'curious') as Mood] ?? MOODS.curious;

/* ------------------------------------------------ shared timeline (typed) */

type Slot = { from: number; frames: number };
type Range = [number, number];
type Mark = { slam?: number; hook?: number; cuts?: number[]; keyword?: number; press?: number; count?: number };
type SfxCue = { key: string; kind: SfxKind; at: number; align: 'onset' | 'peak' | 'end'; gain: number; pan?: 'lr' | 'rl'; tight?: boolean };
type FoleyWant = { scene: number; f: number; kind: FoleyKind; align?: 'onset' | 'peak'; dur?: number; group?: string };
type FoleyCue = { key: string; kind: FoleyKind; at: number; align: 'onset' | 'peak'; gain: number; dur?: number };
type BedWindow = { start: number; end: number; inA: number; inB: number; outA: number; outB: number; cutIn: number; cutOut: number };

/**
 * src/timeline.js is plain JavaScript so Node can import it too (subtitles,
 * chapter marks, budget tests). This facade gives it types on the TS side.
 */
const TL = timelineJs as unknown as {
  placeTimeline(scenes: Scene[], fps: number, beats: number[]): Slot[];
  pickTransitions(
    scenes: Scene[],
    o: { pool: TransitionKind[]; signature: TransitionKind; cutShare: number; seed?: string },
  ): TransitionKind[];
  voiceRanges(placed: Slot[], scenes: Scene[], fps: number): Range[];
  mergeRanges(ranges: Range[], gap: number): Range[];
  duckCurve(ranges: Range[], total: number, o: { depth: number; attack: number; release: number }): Float32Array;
  musicEnvelope(o: { placed: Slot[]; scenes: Scene[]; fps: number; base?: number; hits?: { scene: number; f: number }[]; logo?: boolean }): Float32Array;
  planSfx(o: { placed: (Slot & { transition: TransitionKind })[]; scenes: Scene[]; fps: number; genre: GenreId; marks: Mark[]; events?: number[]; seed?: string }): SfxCue[];
  planFoley(o: { placed: Slot[]; scenes: Scene[]; fps: number; wants: FoleyWant[]; hits?: { scene: number; f: number }[]; sfx?: SfxCue[] }): FoleyCue[];
  ambienceEnvelope(o: { placed: Slot[]; scenes: Scene[]; fps: number; hits?: { scene: number; f: number }[] }): Float32Array;
  bedWindows(o: { placed: Slot[]; scenes: Scene[]; beds: { fromScene: number; toScene: number }[]; fps: number; total?: number }): BedWindow[];
  bedGainAt(w: BedWindow, f: number): number;
  flickerCurve(o: { placed: Slot[]; scenes: Scene[]; impacts: number[][] }): Float32Array;
  MIX: { mergeGap: number; attack: number; release: number; ambienceDuck: number };
};

/**
 * Each genre's stylized-transition vocabulary, weighted by repetition. Most
 * cuts are HARD cuts (see HARD_CUT_SHARE); these are spent where the story
 * turns. A blackout is only ever used on a turning point, never on a plain cut.
 */
const TRANSITION_SET: Record<Genre['id'], TransitionKind[]> = {
  documentary: ['flash', 'whip', 'flash', 'zoom', 'leak'],
  finance: ['glitch', 'whip', 'glitch', 'flash'],
  horror: ['blackout', 'flash', 'blackout', 'zoom'],
  crime: ['blackout', 'glitch', 'whip', 'flash'],
  epic: ['zoom', 'leak', 'flash', 'whip'],
  science: ['leak', 'zoom', 'flash', 'leak'],
  inspire: ['leak', 'flash', 'leak', 'zoom'],
};

/**
 * Target share of hard cuts per genre. Documentary keeps the MagnatesMedia
 * energy (most cuts covered by light); crime and horror live on hard cuts and
 * silence, where a stylized transition is an event.
 */
const HARD_CUT_SHARE: Record<GenreId, number> = {
  documentary: 0.4,
  finance: 0.6,
  horror: 0.7,
  crime: 0.65,
  epic: 0.6,
  science: 0.65,
  inspire: 0.65,
};

export function resolveGenre(script: Script): Genre {
  // The video's look variant (src/looks/variants.ts) re-dresses the genre; `palette` still wins over single colours.
  const base = GENRES[script.genre] ?? GENRES.documentary;
  // The topic identity (src/topic) sets its own faces on top.
  return topicGenre({ ...applyVariant(base, variantFor(base.id, script.look?.variant)), ...(script.palette ?? {}) }, script);
}

export interface Placed {
  scene: Scene;
  index: number;
  from: number;
  frames: number;
  transition: TransitionKind;
}

/**
 * Lay scenes on the timeline and decide how each cut is made.
 *
 * Timing comes from src/timeline.js `placeTimeline` — the SAME function
 * lib/produce.mjs uses for subtitles and chapter marks, so they can never
 * drift from the picture. A scene is at least its written `dur` and never
 * shorter than its narration plus a breath; boundaries move onto the music's
 * beats with error diffusion against the planned timeline.
 *
 * Transitions are chosen by context (`pickTransitions`): hard cuts inside a
 * chapter + mood run, the genre's signature on chapter cards, stylized ones on
 * mood changes and into slams / counters / charts / titles. Seeded, so a
 * re-render is the same edit.
 */
export function place(script: Script, fps = FPS): Placed[] {
  // Case rules for word matching and measuring follow the script's language (fonts.ts).
  setTextLocale(script.locale);
  const genre = resolveGenre(script);
  const slots = TL.placeTimeline(script.scenes, fps, script.beats ?? []);
  /*
   * Per-video variety (src/effects/variety.js): this video's own transition
   * palette (3-4 kinds + rare accents, or the art director's), its chapter
   * signature and pacing; each scene's camera, fit and effects. Seeded, so
   * the same script is the same edit and two scripts never cut alike.
   */
  const tr = transitionStyle(script, { genre: genre.id, legacyPool: TRANSITION_SET[genre.id] ?? TRANSITION_SET.documentary, signature: genre.transition });
  const picked = TL.pickTransitions(script.scenes, {
    pool: tr.pool,
    signature: tr.signature,
    cutShare: Math.min(0.85, Math.max(0.25, (HARD_CUT_SHARE[genre.id] ?? 0.5) + tr.cutShareJitter)),
    seed: script.seedKey ?? script.id,
  });
  // The opening treatment (script.opening, src/opening) may ask for hard cuts — never for other timing.
  const kinds = openingTransitions(resolveOpening(script), script.scenes, picked);
  // The opening's title goes full frame when its source holds it (src/opening).
  const scenes = openingStyled(resolveOpening(script), styledScenes(script, genre.collage));
  return slots.map((s, index) => ({ scene: scenes[index], index, from: s.from, frames: s.frames, transition: kinds[index] ?? 'cut' }));
}

export function totalFrames(script: Script, fps = FPS): number {
  const p = place(script, fps);
  return p.reduce((n, s) => n + s.frames, 0);
}

/* ------------------------------------------------------------ one scene */

const SceneFrame: React.FC<{ p: Placed; genre: Genre; locale: string; off: Set<string>; ownAmbience: boolean; look?: SceneLook; opening?: OpeningModel | null; scenes?: Scene[] }> = ({
  p,
  genre,
  locale,
  off,
  ownAmbience,
  look,
  opening,
  scenes,
}) => {
  /* The scene's look (src/looks): grade, ground, text style — read by fx.tsx and scenes.tsx through context. */
  const lookCtx = useMemo<LookCtx | null>(
    () =>
      look
        ? {
            grade: look.grade,
            textStyle: look.textStyle,
            surface: look.surface,
            backdrop: look.backdrop,
            ground: look.backdrop ? <GroundFill backdrop={look.backdrop} genre={look.genre} blurSrc={look.blurSrc} seed={`bd${p.index}`} durFrames={p.frames} /> : undefined,
            chapterName: look.chapterName,
            index: p.index,
            counterStyle: look.counterStyle,
            picture: look.picture,
            eraStart: look.eraStart,
          }
        : null,
    [look, p.index],
  );
  if (lookCtx) {
    return (
      <LookContext.Provider value={lookCtx}>
        <SceneFrameBody p={p} genre={genre} locale={locale} off={off} ownAmbience={ownAmbience} light={lookCtx.surface === 'light'} opening={opening} scenes={scenes} />
      </LookContext.Provider>
    );
  }
  return <SceneFrameBody p={p} genre={genre} locale={locale} off={off} ownAmbience={ownAmbience} opening={opening} scenes={scenes} />;
};

const SceneFrameBody: React.FC<{ p: Placed; genre: Genre; locale: string; off: Set<string>; ownAmbience: boolean; light?: boolean; opening?: OpeningModel | null; scenes?: Scene[] }> = ({
  p,
  genre: baseGenre,
  locale,
  off,
  ownAmbience,
  light,
  opening = null,
  scenes = [],
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // The opening treatment (src/opening): a cold-open beat is laid out clear of its 2.35 bars.
  const genre = useMemo(() => openingGenre(opening, p.index, baseGenre), [opening, p.index, baseGenre]);
  /*
   * Footage wins over depth layers: a cut-out made from one still frame
   * cannot follow a moving shot, so a video scene is laid out as a flat
   * picture (text in its normal place, not tucked behind a person).
   */
  const s = useMemo(() => (p.scene.video && p.scene.layers ? ({ ...p.scene, layers: undefined } as Scene) : p.scene), [p.scene]);
  const mood = moodOf(s);
  const common = { genre, durFrames: p.frames, locale, speed: mood.push, index: p.index };

  /*
   * The frame reacts to every impact inside the scene: a scale punch, a short
   * decaying shake and a lens split. Strength scales all three, so a slam
   * hits hard and a keyword only nudges.
   */
  let punch = 1;
  let shakeX = 0;
  let shakeY = 0;
  let ca = 0;
  // The opening treatment moves a waiting counter's punch onto its spoken number and adds the hook's (src/opening).
  for (const imp of openingImpacts(opening, p.index, sceneImpacts(s, p.frames, fps, genre))) {
    const d = f - imp.f;
    if (d < 0 || d > 10) continue;
    punch += interpolate(d, [0, 2, 10], [0, 0.05, 0], { extrapolateRight: 'clamp' }) * imp.strength;
    const decay = Math.max(0, 1 - d / 7);
    shakeX += (random(`sx${p.index}${f}`) - 0.5) * 26 * decay * imp.strength;
    shakeY += (random(`sy${p.index}${f}`) - 0.5) * 18 * decay * imp.strength;
    ca = Math.max(ca, 14 * decay * imp.strength);
  }
  // Transitions split the lens too, briefly.
  // (A pair transition carries its own motion: no lens flinch on its frozen first frame.)
  if (p.transition !== 'cut' && !isPairKind(p.transition) && f < 5) ca = Math.max(ca, (5 - f) * 3);
  /*
   * Unease: a slow, low-frequency handheld sway on tense and dreadful scenes.
   * Not a shake — the viewer should feel it before they notice it.
   */
  if (mood.unease > 0) {
    shakeX += Math.sin(f / 11 + p.index) * 7 * mood.unease + Math.sin(f / 4.3) * 1.5 * mood.unease;
    shakeY += Math.cos(f / 13 + p.index) * 5 * mood.unease;
  }
  const g = mood.grade;
  const grade = `saturate(${g.saturate}) brightness(${g.brightness})${g.hue ? ` hue-rotate(${g.hue}deg)` : ''}`;

  const opCtx = useMemo(() => sceneCtx(opening, p.index, s, p.frames, genre, locale, fps), [opening, p.index, s, p.frames, genre, locale, fps]);
  const opBody = useMemo(() => openingBody(opening, p.index, s, p.frames, genre, locale), [opening, p.index, s, p.frames, genre, locale]);
  const opFilter = openingFilter(opening, p.index);

  let body: React.ReactNode = null;
  if (opBody) body = opBody;
  else if (s.type === 'title') body = <Title {...common} scene={s} />;
  else if (s.type === 'slam') body = <Slam {...common} scene={s} />;
  else if (s.type === 'counter') body = openingDelayed(opening, p.index, p.frames, (d) => <Counter {...common} durFrames={d} scene={s} />) ?? spokenDelayed(scenes, p.index, p.frames, fps, (d) => <Counter {...common} durFrames={d} scene={s} />) ?? <Counter {...common} scene={s} />;
  else if (s.type === 'photo') body = <PhotoScn {...common} scene={s} />;
  else if (s.type === 'words') body = <Words {...common} scene={s} />;
  else if (s.type === 'chart') body = <Chart {...common} scene={s} />;
  else if (s.type === 'montage') body = <Montage {...common} scene={s} />;
  else if (s.type === 'headline') body = <Headline {...common} scene={s} />;
  else if (s.type === 'map') body = <MapScn {...common} scene={s} />;
  else body = <DeviceScn {...common} scene={s} />;

  const caId = `ca-${p.index}`;
  return (
    <AbsoluteFill className={light ? 'nv-light-surface' : undefined} style={{ overflow: 'hidden', background: genre.bg }}>
      {ca > 0.3 && !off.has('ca') ? <ChromaticDefs id={caId} amount={ca} /> : null}
      <AbsoluteFill
        style={{
          ...entranceStyle(p.transition, f),
          filter: [entranceStyle(p.transition, f).filter, ca > 0.3 && !off.has('ca') ? `url(#${caId})` : ''].filter(Boolean).join(' ') || undefined,
        }}
      >
        <AbsoluteFill style={{ transform: `translate(${shakeX}px, ${shakeY}px) scale(${punch})`, filter: [off.has('grade') ? '' : grade, opFilter ?? ''].filter(Boolean).join(' ') || undefined }}>
          <FxStack scene={s} durFrames={p.frames} index={p.index} genre={genre}>
            {opCtx ? <OpeningContext.Provider value={opCtx}>{body}</OpeningContext.Provider> : body}
          </FxStack>
          {/* The topic's metaphor icons (src/topic): part of the picture, so inside the camera shake. */}
          <TopicSceneLayer scene={s} genre={genre} durFrames={p.frames} />
        </AbsoluteFill>
        {opening && opCtx ? <OpeningOverlay m={opening} index={p.index} scene={s} scenes={scenes} durFrames={p.frames} genre={genre} locale={locale} /> : null}
      </AbsoluteFill>
      <TransitionOverlay kind={p.transition} genre={genre} f={f} />
      <TopicWipe index={p.index} durFrames={p.frames} genre={genre} />
      {/* Silent inside a pair-transition window: the voice plays from the scene's own sequence. */}
      {!React.useContext(SilentScene) && s.voice ? <Audio src={staticFile(s.voice)} /> : null}
      {/*
       * Legacy per-scene room tone (older scripts): fades in and out with the
       * scene. Scenes covered by an ambience bed (script.ambienceCues) skip it.
       */}
      {s.ambience && ownAmbience ? (
        <Audio
          src={staticFile(s.ambience)}
          volume={(t) => 0.32 * interpolate(t, [0, 10, p.frames - 10, p.frames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/* ---------------------------------------------------------- sound design */

const FALLBACK: Record<SfxKind, string | null> = {
  hit: 'sfx/hit.wav',
  whoosh: 'sfx/whoosh.wav',
  riser: 'sfx/riser.wav',
  ticks: 'sfx/ticks.wav',
  glitch: 'sfx/glitch.wav',
  swell: 'sfx/riser.wav',
  snap: 'sfx/hit.wav',
  // A stinger only exists when the pool has one: layering the synth hit twice is not a stinger.
  stinger: null,
  thud: 'sfx/hit.wav',
};

/** Kinds that can borrow another pool when their own is empty (older pools have no thud). */
const BORROW: Partial<Record<SfxKind, SfxKind>> = { thud: 'hit' };

/**
 * Picks SFX so a long video never sounds looped: each kind is walked in a
 * seeded shuffled order, and a file cannot come back until most of its pool
 * has played since. With the pipeline's pitch variants a pool is ~9-18 files,
 * so the same whoosh returns at the earliest after 5-10 other whooshes.
 */
function makePicker(script: Script) {
  const recent: Record<string, string[]> = {};
  const cursor: Record<string, number> = {};
  return (kind: SfxKind): string | null => {
    let from: SfxKind = kind;
    let pool = script.sfxFiles?.[kind];
    if (!pool?.length && BORROW[kind] && script.sfxFiles?.[BORROW[kind]!]?.length) {
      from = BORROW[kind]!;
      pool = script.sfxFiles[from];
    }
    if (!pool?.length) return FALLBACK[kind];
    const order = [...pool].sort((a, b) => random(`${script.id}${from}${a}`) - random(`${script.id}${from}${b}`));
    const cool = Math.max(1, Math.floor(pool.length * 0.6));
    const used = (recent[from] ??= []);
    let i = cursor[from] ?? 0;
    for (let tries = 0; tries < order.length; tries++, i++) {
      const pick = order[i % order.length];
      if (!used.slice(-cool).includes(pick)) {
        cursor[from] = i + 1;
        used.push(pick);
        return pick;
      }
    }
    cursor[from] = i + 1;
    return order[i % order.length];
  };
}

/**
 * Where each kind's energy sits in the file, in seconds, when the pipeline
 * did not measure it (script.sfxMeta). `peak` is placed ON the target frame;
 * a riser is end-aligned (its peak is its end).
 */
const SHAPE: Record<SfxKind, { peak: number; len: number }> = {
  hit: { peak: 0, len: 2.4 },
  stinger: { peak: 0, len: 2.4 },
  thud: { peak: 0, len: 1.5 },
  whoosh: { peak: 0.2, len: 1.0 },
  riser: { peak: 1.6, len: 1.6 },
  ticks: { peak: 0, len: 0.9 },
  glitch: { peak: 0, len: 0.5 },
  swell: { peak: 0.5, len: 2.4 },
  snap: { peak: 0, len: 0.6 },
};

/** Per-file envelope measured by the pipeline: seconds to the loudest point, and length. */
type SfxMeta = Record<string, { peakAt: number; dur: number }>;

/**
 * Renders the cue plan from timeline.js `planSfx` (which owns every budget
 * rule). Here only the file and its exact placement are resolved: the file's
 * measured peak lands on the target frame, a riser is trimmed just after its
 * peak, and every cue ends on a short fade instead of a hard stop.
 */
const SoundDesign: React.FC<{ cues: SfxCue[]; script: Script }> = ({ cues, script }) => {
  const { fps } = useVideoConfig();
  const pick = makePicker(script);
  const meta: SfxMeta = script.sfxMeta ?? {};
  const out: React.ReactNode[] = [];
  for (const c of cues) {
    const base = pick(c.kind);
    if (!base) continue;
    const m = meta[base];
    /*
     * A whoosh travels with its transition (timeline.js whooshPan): the
     * pipeline pre-renders equal-power pans of each pool file, same timing,
     * same loudness. Without them the file plays centred as before.
     */
    const file = (c.pan ? script.sfxPan?.[base]?.[c.pan] : undefined) ?? base;
    const shape = SHAPE[c.kind];
    const peak = Math.round((m ? m.peakAt : shape.peak) * fps);
    let len = Math.max(1, Math.round((m ? m.dur : shape.len) * fps));
    if (c.kind === 'riser' && m) len = peak + 2; // what follows the peak would smear the impact
    // A tight punch (slam, hook) skips the file's build: it lands in the stop-down hole, which must stay silent.
    const lead = c.tight ? Math.min(peak, Math.round(0.12 * fps)) : peak;
    const skip = peak - lead;
    const from = c.align === 'end' && !m ? c.at - len : c.at - lead;
    const fade = Math.min(c.kind === 'riser' ? 2 : 5, Math.floor(len / 2));
    const trim = (from < 0 ? -from : 0) + skip;
    const dur = len - trim;
    if (dur <= 0) continue;
    const gain = c.gain;
    const rise = skip > 0 ? Math.max(1, Math.min(2, lead)) : 0;
    out.push(
      <Sequence key={c.key} from={Math.max(0, from)} durationInFrames={dur}>
        <Audio
          src={staticFile(file)}
          trimBefore={trim || undefined}
          volume={(t) => (fade > 0 && t > dur - fade ? (gain * Math.max(0, dur - t)) / fade : rise && t < rise ? (gain * (t + 1)) / (rise + 1) : gain)}
        />
      </Sequence>,
    );
  }
  return <>{out}</>;
};

/**
 * Room tone beds chosen by the audio director (script.ambienceCues): ONE
 * sound per run of scenes, so the room continues across cuts instead of
 * restarting every 4 seconds. J/L cuts (timeline.js bedWindows): the next
 * place is heard ~0.65 s BEFORE its picture (0.8 s on a chapter or mood
 * turn), the old room lingers ~0.5 s after the cut, and two beds meeting on
 * a cut cross with an equal-power fade. Each bed sits ~4 dB lower while the
 * narrator speaks and drops out through every slam hole (ambienceEnvelope).
 */
const AmbienceBeds: React.FC<{ script: Script; windows: BedWindow[]; duck: Float32Array }> = ({ script, windows, duck }) => {
  const { fps } = useVideoConfig();
  const beds = script.ambienceCues ?? [];
  return (
    <>
      {beds.map((c, k) => {
        const w = windows[k];
        if (!w || !c.file) return null;
        const len = w.end - w.start;
        if (len <= 1) return null;
        return (
          <Sequence key={`amb${k}`} from={w.start} durationInFrames={len}>
            <Audio
              src={staticFile(c.file)}
              loop
              loopVolumeCurveBehavior="extend"
              trimBefore={c.offset ? Math.round(c.offset * fps) : undefined}
              volume={(t) => c.gain * TL.bedGainAt(w, w.start + t) * (duck[w.start + t] ?? 1)}
            />
          </Sequence>
        );
      })}
    </>
  );
};

/**
 * Literal one-shots the narration describes (script.eventCues): the cannon on
 * "ateş", the siren on "siren". Placed on the spoken word by the audio
 * director; played whole unless `dur` cuts them (with a short fade). A
 * negative `at` pre-laps the cut: the sound leads the picture in.
 */
const EventSounds: React.FC<{ script: Script; placed: Placed[] }> = ({ script, placed }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {(script.eventCues ?? []).map((c, k) => {
        const p = placed[c.scene];
        if (!p || !c.file) return null;
        const at = p.from + Math.round(c.at * fps);
        const trim = at < 0 ? -at : 0;
        const full = c.dur ? Math.max(2, Math.round(c.dur * fps)) : undefined;
        const len = full !== undefined ? full - trim : undefined;
        if (len !== undefined && len <= 1) return null;
        const fade = 4;
        return (
          <Sequence key={`ev${k}`} from={Math.max(0, at)} durationInFrames={len}>
            <Audio
              src={staticFile(c.file)}
              trimBefore={trim || undefined}
              volume={len ? (t) => (t > len - fade ? (c.gain * Math.max(0, len - t)) / fade : c.gain) : c.gain}
            />
          </Sequence>
        );
      })}
    </>
  );
};

/** Where each foley kind's energy sits when the pipeline did not measure the file. */
const FOLEY_SHAPE: Record<FoleyKind, { peak: number; len: number }> = {
  paper: { peak: 0.12, len: 0.8 },
  pen: { peak: 0.2, len: 3.2 },
  shutter: { peak: 0.02, len: 0.4 },
  pin: { peak: 0.01, len: 0.25 },
  type: { peak: 0.05, len: 3.2 },
  page: { peak: 0.4, len: 0.9 },
};

/**
 * Foley for what the picture does (timeline.js planFoley decides which ones
 * are heard): files rotate per kind like the SFX pools; a pen or a typewriter
 * runs as long as its action (`dur`) and closes on a short fade.
 */
const FoleySounds: React.FC<{ cues: FoleyCue[]; script: Script }> = ({ cues, script }) => {
  const { fps } = useVideoConfig();
  const meta: SfxMeta = script.sfxMeta ?? {};
  const cursor: Partial<Record<FoleyKind, number>> = {};
  const out: React.ReactNode[] = [];
  for (const c of cues) {
    const pool = script.foleyFiles?.[c.kind];
    if (!pool?.length) continue;
    const order = [...pool].sort((a, b) => random(`${script.id}fo${a}`) - random(`${script.id}fo${b}`));
    const i = cursor[c.kind] ?? 0;
    cursor[c.kind] = i + 1;
    const file = order[i % order.length];
    const m = meta[file];
    const shape = FOLEY_SHAPE[c.kind];
    const peak = c.align === 'peak' ? Math.round((m ? m.peakAt : shape.peak) * fps) : 0;
    const own = Math.max(2, Math.round((m ? m.dur : shape.len) * fps));
    const from = c.at - peak;
    const trim = from < 0 ? -from : 0;
    const len = Math.min(own, c.dur ?? own) - trim;
    if (len <= 1) continue;
    const fade = Math.min(c.dur ? 6 : 3, Math.floor(len / 2));
    const gain = c.gain;
    out.push(
      <Sequence key={c.key} from={Math.max(0, from)} durationInFrames={len}>
        <Audio src={staticFile(file)} trimBefore={trim || undefined} volume={(t) => (fade > 0 && t > len - fade ? (gain * Math.max(0, len - t)) / fade : gain)} />
      </Sequence>,
    );
  }
  return <>{out}</>;
};

/**
 * The channel's sonic signature (script.logo, ~2 s): on the first frame, and
 * again ending on the last one under the music's fade. The score opens up
 * under the first one (musicEnvelope `logo`).
 */
const SonicLogo: React.FC<{ script: Script; total: number }> = ({ script, total }) => {
  const { fps } = useVideoConfig();
  const logo = script.logo;
  if (!logo?.file) return null;
  const len = Math.max(2, Math.round(logo.dur * fps));
  const fade = 6;
  const vol = (t: number) => (t > len - fade ? (logo.gain * Math.max(0, len - t)) / fade : logo.gain);
  return (
    <>
      <Sequence key="logo-in" from={0} durationInFrames={Math.min(len, total)}>
        <Audio src={staticFile(logo.file)} volume={vol} />
      </Sequence>
      {total > 3 * len ? (
        <Sequence key="logo-out" from={total - len} durationInFrames={len}>
          <Audio src={staticFile(logo.file)} volume={vol} />
        </Sequence>
      ) : null}
    </>
  );
};

/**
 * Where the picture does something that makes a sound, in scene-local
 * frames: the same helpers the scenes animate with, so the sound lands on
 * the movement. Planned (and thinned) by timeline.js planFoley.
 */
const WIPE_FOLEY: Partial<Record<string, FoleyKind>> = { telegraph: 'type', ticker: 'type', cipher: 'type', 'case-file': 'paper', siege: 'paper', expedition: 'page' };

function foleyWants(placed: Placed[], genre: Genre, fps: number, locale: string, motif?: string): FoleyWant[] {
  const out: FoleyWant[] = [];
  placed.forEach((p, i) => {
    const s = p.scene;
    // A front page slides in: the paper rustles as it arrives.
    if (s.type === 'headline') out.push({ scene: i, f: 1, kind: 'paper' });
    // A paper-tear transition rips on the cut.
    if (p.transition === 'paper-tear') out.push({ scene: i, f: 0, kind: 'paper' });
    // A route draws itself: the pen scratches for as long as the line grows.
    if (s.type === 'map') {
      const plan = mapPlan(s, p.frames, fps);
      if (plan.curve.length && plan.r1 > plan.r0) out.push({ scene: i, f: plan.r0, kind: 'pen', dur: plan.r1 - plan.r0 });
    }
    // A print lands on the board (overshoot peak 7 frames after it enters, settled at 12): shutter, then the pin.
    if (s.type === 'photo' && genre.collage && !s.natural && !s.fullBleed) {
      const enters = [0, ...(s.images ?? []).map((_, k) => Math.round((0.55 + k * 0.5) * fps))];
      enters.forEach((e, k) => {
        out.push({ scene: i, f: e + 7, kind: 'shutter', align: 'peak', group: `card${k}` });
        out.push({ scene: i, f: e + 12, kind: 'pin', align: 'peak', group: `card${k}` });
      });
    }
    // The topic motif's wipe: a paper / key sound under the panel crossing the cut.
    if (s.wipe && motif && WIPE_FOLEY[motif]) out.push({ scene: i, f: 0, kind: WIPE_FOLEY[motif]!, align: 'peak' });
    if (s.type === 'title' && s.chapterCard) {
      // The page turns out of the chapter card into the chapter.
      out.push({ scene: i, f: p.frames, kind: 'page', align: 'peak' });
      // The terminal look types "[ BÖLÜM 03 ]" in, 1.3 frames a letter.
      if (genre.look === 'terminal') {
        const word = String(s.kicker ?? '').replace(/\d+/g, '').replace(/[.:#–—-]+/g, ' ').trim() || (locale.toLowerCase().startsWith('tr') ? 'BÖLÜM' : 'CHAPTER');
        out.push({ scene: i, f: Math.round(CHAPTER_LAND * fps) - 2, kind: 'type', dur: Math.round((word.length + 7) * 1.3) });
      }
    }
    // Scene types that know their own actions ask for them (types.ts FoleyHint).
    for (const h of (s as { foley?: FoleyHint[] }).foley ?? []) {
      if (h && Number.isFinite(h.at)) out.push({ scene: i, f: Math.round(h.at * fps), kind: h.kind, ...(h.dur ? { dur: Math.round(h.dur * fps) } : {}) });
    }
  });
  return out;
}

/* ------------------------------------------------------------- the edit */

/**
 * Everything that depends only on the script, computed once per render tab
 * (not per frame): placement, the SFX cue plan, the music and ambience gain
 * curves and the flicker mask. Exported so QA tooling can inspect the exact
 * edit the composition will draw.
 */
export function buildPlan(script: Script, fps: number = FPS) {
  setTextLocale(script.locale);
  const genre = resolveGenre(script);
  const placed = place(script, fps);
  const scenes = script.scenes;
  const total = placed.reduce((n, p) => n + p.frames, 0);

  // The opening treatment (src/opening): its hook, the counters that wait for their spoken number, its sounds.
  const opening = openingModel(resolveOpening(script), scenes, placed, fps, script.locale ?? 'tr-TR');

  // Punch frames inside each scene, from the same helpers the picture uses.
  const marks: Mark[] = placed.map((p, i) => {
    const s = p.scene;
    const m: Mark = {};
    const count = openingCountAt(opening, i);
    if (count !== undefined) m.count = count;
    if (s.type === 'slam') m.slam = slamFrame(s, fps);
    if (s.type === 'montage') {
      m.cuts = montageCuts(s, p.frames, fps);
      const hook = montageWords(s, p.frames, fps).at(-1);
      if (hook) m.hook = hook.f;
    }
    // The front page's last headline letter: a press/shutter snap.
    if (s.type === 'headline') m.press = headlineLand(s, fps);
    if (s.type === 'words' && s.keyword) {
      // The keyword impact is the strong one; the weak one is only a mid-scene push.
      const imp = sceneImpacts(s, p.frames, fps, genre).find((i) => i.strength >= 0.5);
      if (imp) m.keyword = imp.f;
    }
    return m;
  });
  const hits: { scene: number; f: number }[] = [];
  marks.forEach((m, i) => {
    if (m.slam !== undefined) hits.push({ scene: i, f: m.slam });
    if (m.hook !== undefined) hits.push({ scene: i, f: m.hook });
  });
  hits.push(...openingHits(opening));

  const events = (script.eventCues ?? []).filter((c) => placed[c.scene]).map((c) => placed[c.scene].from + Math.round(c.at * fps));
  // The opening treatment's own sounds and music breath (src/opening; none without script.opening).
  const op = opening?.op ?? null;
  const cues = [...TL.planSfx({ placed, scenes, fps, genre: genre.id, marks, events, seed: script.seedKey ?? script.id }), ...openingSfx(opening, scenes, placed, fps)].sort(
    (a, b) => a.at - b.at || a.key.localeCompare(b.key),
  );
  const music = TL.musicEnvelope({ placed, scenes: openingMusicScenes(op, scenes), fps, base: script.musicVolume ?? 0.55, hits, logo: !!script.logo?.file });
  const foley = script.foleyFiles
    ? TL.planFoley({ placed, scenes, fps, wants: [...foleyWants(placed, genre, fps, script.locale ?? 'tr-TR', script.topic?.motif), ...openingFoley(opening, scenes, placed, fps)], hits, sfx: cues })
    : [];

  // Beds: ~4 dB under the voice, out through every slam hole; J/L-cut windows against the picture.
  const ambDuck = TL.ambienceEnvelope({ placed, scenes, fps, hits });
  const bedWins = TL.bedWindows({ placed, scenes, beds: script.ambienceCues ?? [], fps, total });

  const flicker = TL.flickerCurve({ placed, scenes, impacts: placed.map((p, i) => openingImpacts(opening, i, sceneImpacts(p.scene, p.frames, fps, genre)).map((x) => x.f)) });

  // Scenes an ambience bed already covers do not also play their own legacy clip.
  const covered = new Set<number>();
  for (const c of script.ambienceCues ?? []) for (let i = c.fromScene; i <= c.toScene; i++) covered.add(i);

  return { genre, placed, total, cues, foley, music, ambDuck, bedWins, flicker, covered, opening };
}

/** True while a scene is drawn inside a pair-transition window (no second voice). */
const SilentScene = React.createContext(false);

/**
 * One pair transition's window: the outgoing scene plays live until the cut
 * and then holds its last frame; the incoming one holds its first frame until
 * the cut and then plays (a <Freeze> of 2-10 frames, hidden by the move).
 */
const PairWindow: React.FC<{ prev: Placed; cur: Placed; a: number; b: number; genre: Genre; seed: string; draw: (p: Placed) => React.ReactNode }> = ({
  prev,
  cur,
  a,
  b,
  genre,
  seed,
  draw,
}) => {
  const w = useCurrentFrame();
  const focusOf = (s: Scene): [number, number] => {
    const fc = (s as { focus?: unknown }).focus;
    return Array.isArray(fc) && fc.length === 2 ? (fc as [number, number]) : [0.5, 0.4];
  };
  const outgoing = (
    <Freeze frame={a - 1} active={w >= a}>
      <Sequence from={a - prev.frames} durationInFrames={prev.frames}>
        {draw(prev)}
      </Sequence>
    </Freeze>
  );
  const incoming = (
    <Freeze frame={a} active={w < a}>
      <Sequence from={a} durationInFrames={cur.frames}>
        {draw(cur)}
      </Sequence>
    </Freeze>
  );
  return (
    <PairTransition
      kind={cur.transition}
      w={w}
      a={a}
      b={b}
      outgoing={outgoing}
      incoming={incoming}
      fromFocus={focusOf(prev.scene)}
      toFocus={focusOf(cur.scene)}
      genre={genre}
      index={cur.index}
      seed={seed}
    />
  );
};

export const Engine: React.FC<{ script: Script }> = ({ script }) => {
  const { fps } = useVideoConfig();
  setTextLocale(script.locale);
  const { genre, placed, total, cues, foley, music, ambDuck, bedWins, flicker, covered, opening } = useMemo(() => buildPlan(script, fps), [script, fps]);
  // Per-scene look: chapter accents, grades, grounds, text styles (src/looks/resolve.ts).
  const looks = useMemo(() => sceneLooks(script, genre), [script, genre]);
  const locale = script.locale ?? 'tr-TR';
  // The topic identity (src/topic): motif, presentation, icons, wipes. Null = none.
  const topic = useMemo<TopicCtx | null>(() => {
    const t = topicOf(script);
    return t ? { ...t, wipes: wipeFlags(script.scenes) } : null;
  }, [script]);
  /* Render-cost probe: named effects can be switched off (scripts/bench.mjs). Never set in production. */
  const off = new Set(script.perfOff ?? []);

  /*
   * Music bed (timeline.js musicEnvelope): ducks ~11 dB under narration and
   * stays down through continuous speech, stops down before a slam word and
   * swells back on the hit, breathes on chapter cards and silences, and fades
   * out over the last 2.5 s.
   */
  const musicVolume = (f: number) => music[Math.min(Math.max(0, f), music.length - 1)] ?? 0;

  return (
    /* `lang` makes CSS uppercase "bir" as "BİR", not "BIR". Load-bearing. */
    <TopicContext.Provider value={topic}>
    <AbsoluteFill lang={locale.split('-')[0]} style={{ background: genre.bg }}>
      <DuotoneDefs id="duo" shadow={genre.duoShadow} highlight={genre.duoHighlight} />
      <GradeDefs />
      <SelectiveDefs hue={script.topic?.keepHue} />
      {/* Type on a light ground (a light look variant, a paper backdrop): dark shadows would smudge dark ink. */}
      <style>{'.nv-light-surface * { text-shadow: none !important; }'}</style>
      {placed.map((p) => (
        <Sequence key={p.index} from={p.from} durationInFrames={p.frames}>
          <SceneFrame p={p} genre={looks[p.index]?.genre ?? genre} locale={locale} off={off} ownAmbience={!covered.has(p.index)} look={looks[p.index]} opening={opening} scenes={script.scenes} />
        </Sequence>
      ))}
      {/* Pair transitions (src/effects/transitions.tsx): both shots across the cut, drawn over the two scenes, silent. */}
      {placed.map((p, i) => {
        if (!i || !isPairKind(p.transition)) return null;
        const prev = placed[i - 1];
        const [a, b] = pairFrames(p.transition, prev.frames, p.frames);
        const draw = (q: Placed) => (
          <SilentScene.Provider value>
            <SceneFrame p={q} genre={looks[q.index]?.genre ?? genre} locale={locale} off={off} ownAmbience={false} look={looks[q.index]} opening={opening} scenes={script.scenes} />
          </SilentScene.Provider>
        );
        return (
          <Sequence key={`tw${i}`} from={p.from - a} durationInFrames={a + b}>
            <PairWindow prev={prev} cur={p} a={a} b={b} genre={looks[i]?.genre ?? genre} seed={script.seedKey ?? script.id} draw={draw} />
          </Sequence>
        );
      })}

      {/* Flicker only where the mood is uneasy, and never on a punch frame. */}
      {genre.flicker && !off.has('flicker') ? <Flicker strength={(f: number) => flicker[f] ?? 0} /> : null}
      {genre.dust && !off.has('dust') ? <Dust /> : null}
      {off.has('vignette') ? null : <Vignette strength={genre.vignette} />}
      {/* One constant pair of bars for the whole film; per-scene bars pumped in and out on every cut. */}
      {genre.letterbox && !off.has('letterbox') ? <Letterbox animate={false} /> : null}
      {/* A countdown's corner label: which item is running (src/ranking/RankBadge.tsx). */}
      {script.format === 'ranking' ? <RankBadges placed={placed} ranking={script.ranking} genre={genre} /> : null}
      {off.has('grain') ? null : <Grain strength={genre.grain} />}

      {script.music ? <Audio src={staticFile(script.music)} volume={musicVolume} /> : null}
      {!script.music && genre.id === 'horror' ? (
        <Audio src={staticFile('sfx/drone.wav')} volume={musicVolume} loop loopVolumeCurveBehavior="extend" />
      ) : null}
      <AmbienceBeds script={script} windows={bedWins} duck={ambDuck} />
      <EventSounds script={script} placed={placed} />
      <SoundDesign cues={cues} script={script} />
      <FoleySounds cues={foley} script={script} />
      <SonicLogo script={script} total={total} />
    </AbsoluteFill>
    </TopicContext.Provider>
  );
};

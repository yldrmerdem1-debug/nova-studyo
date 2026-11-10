import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { Genre, Scene, Script } from '../types';
import { isFontKey } from './fontkeys';
export { topicFontKeys, topicWantsTyped } from './fontkeys';
import { useTopic, type TopicCtx } from './context';
import { IconLayer } from './icons';
import { MotifWipe, WIPE_IN, WIPE_OUT, motifPalette } from './motifs';

/*
 * TOPIC IDENTITY — entry points the engine calls (Engine.tsx, scenes.tsx,
 * fx.tsx, devices/index.tsx). Everything is keyed on script.topic; without it
 * nothing here draws and the look is exactly the old one.
 */

export { TopicContext, topicOf, useTopic, isMotif, MOTIFS } from './context';
export type { TopicCtx } from './context';
export { MotifTexture } from './motifs';
export { MotifChapterCard } from './cards';
export { ExplainerScn } from './explainer';
export { UiCardScn } from './uicard';
export { PresentedPhoto } from './presentation';
export { ICON_IDS } from './icons-data';

export const TOPIC_TYPES = ['explainer', 'ui-card'] as const;

/** The genre re-dressed by the topic: its faces (colours stay the look's). */
export function topicGenre(g: Genre, script: Pick<Script, 'topic'>): Genre {
  const t = script?.topic;
  if (!t) return g;
  const map = t.map === 'satellite' || t.map === 'paper' || t.map === 'grid' ? t.map : undefined;
  return { ...g, ...(isFontKey(t.headline) ? { headline: t.headline } : {}), ...(isFontKey(t.body) ? { body: t.body } : {}), ...(map ? { mapStyle: map } : {}) };
}

/**
 * Per-scene topic furniture drawn over the scene: the metaphor icons (inside
 * the camera shake, they belong to the picture) — see TopicWipe for the wipe.
 */
export const TopicSceneLayer: React.FC<{ scene: Scene; genre: Genre; durFrames: number }> = ({ scene, genre, durFrames }) => {
  const t = useTopic();
  if (!t || !scene.icons?.length) return null;
  return <IconLayer t={t} scene={scene} genre={genre} durFrames={durFrames} />;
};

/** The motif wipe over a scene's first frames (it starts with one) and its last (the next one does). */
export const TopicWipe: React.FC<{ index: number; durFrames: number; genre: Genre }> = ({ index, durFrames, genre }) => {
  const t = useTopic();
  const f = useCurrentFrame();
  const wipes = t?.wipes ?? [];
  if (!t) return null;
  const wipeIn = !!wipes[index] && f < WIPE_IN;
  const wipeOut = !!wipes[index + 1] && f >= durFrames - WIPE_OUT;
  if (!wipeIn && !wipeOut) return null;
  // The look decides the wipe's palette (motifPalette -> isLightLook): a paper look's wipe is paper, a dark one mid-dark
  // slate / umber, never the old near-black panel (Gimli 9ff721 önce/sonra, 29 Ekim 2026).
  const P = motifPalette(t, genre);
  const phase = wipeIn ? f / WIPE_IN : -(durFrames - f) / WIPE_OUT;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <MotifWipe t={t as TopicCtx} P={P} phase={phase} />
    </AbsoluteFill>
  );
};

/**
 * The 'selective' grade (looks/grades.tsx gradeFilter -> url(#nv-g-selective)):
 * black and white, with ONE hue kept in colour — the topic's accent object
 * (the flare in the night, the ticker's red, the FBI yellow). A redness mask
 * is computed on a hue-rotated copy so any hue can be the kept one; colour-only
 * filter primitives, no blur.
 *
 * Kartal Yuvası 950730 / Gimli 20261028-9ff721, 29 Ekim 2026: the 12R-6G-6B-4.8 mask kept almost nothing — the
 * 'selective' chapters read as plain black and white (saturation 2,5). Softer now so the kept hue POPS: typical and
 * darker skin still fall under the threshold (the -2.8 offset; the spec's -2.4 left pale skin 0.95/0.65/0.55 at 40%
 * colour — gercek-goruntu skin test), a flare / siren / flag stays.
 * The grey's mids are lifted (0.30 -> 0.34) so the accent chapter is not also the darkest one.
 */
export const SELECTIVE_MASK = '8 -4 -4 0 -2.8';
export const SELECTIVE_GREY = '0.02 0.1 0.34 0.58 0.8 0.95 1';

export const SelectiveDefs: React.FC<{ hue?: number }> = ({ hue = 0 }) => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <filter id="nv-g-selective" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="grey0" />
      <feComponentTransfer in="grey0" result="grey">
        <feFuncR type="table" tableValues={SELECTIVE_GREY} />
        <feFuncG type="table" tableValues={SELECTIVE_GREY} />
        <feFuncB type="table" tableValues="0.025 0.105 0.345 0.58 0.795 0.945 0.995" />
      </feComponentTransfer>
      <feColorMatrix in="SourceGraphic" type="hueRotate" values={String(-(((hue % 360) + 360) % 360))} result="rot" />
      {/*
        Only a strong, saturated kept hue survives (fire, a siren, a flag): skin sits in the same red-orange range but is
        paler, so it falls under the threshold and faces stay black and white. The old mask (8R-4G-4B-1.6) kept skin
        half-coloured — France, Oct 2026: "bazı yerlerde insanların yüzü sararıyor". The -2.8 offset keeps skin out.
      */}
      <feColorMatrix in="rot" type="matrix" values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${SELECTIVE_MASK}`} result="mask" />
      <feColorMatrix in="SourceGraphic" type="saturate" values="1.25" result="vivid" />
      <feComposite in="vivid" in2="mask" operator="in" result="kept" />
      <feMerge>
        <feMergeNode in="grey" />
        <feMergeNode in="kept" />
      </feMerge>
    </filter>
  </svg>
);

/** Which scenes start with the motif wipe (for TopicWipe). */
export const wipeFlags = (scenes: Scene[]) => scenes.map((s) => !!s.wipe);

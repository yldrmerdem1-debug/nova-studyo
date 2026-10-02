import React, { useMemo } from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { ChromaticDefs } from '../fx';
import { sceneImpacts } from '../scenes';
import type { CameraKind, FxKind, Genre, Scene, Script, TransitionKind } from '../types';
import { SceneFxContext } from './context';
import type { SceneFxState } from './context';
import { BokehFx, BurnFx, DustFx, FlareFx, FlashFx, HalftoneDefs, HalftoneFx, LeakFx, ScanFx, VhsFx, VignettePulseFx, spikeAt } from './overlays';
import type { OverlayProps } from './overlays';
import { smoothNoise } from './photo';
import { mainHit } from './timing';
import { Preload } from './transitions';
// @ts-ignore -- plain ESM shared with Node (lib/produce.mjs puts these choices in the render cache keys).
import * as varietyJs from './variety.js';

export { PairTransition, isPairKind, pairFrames } from './transitions';
export { FX_CATALOG, TRANSITION_CATALOG } from './catalog';

/* ------------------------------------------------------ the style facade */

const V = varietyJs as unknown as {
  deriveStyle(script: Script, o: { collage?: boolean }): { camera: (CameraKind | null)[]; fit: ('cover' | 'contain' | null)[]; fx: FxKind[][]; vocab: FxKind[]; density: number };
  transitionStyle(
    script: Script,
    o: { genre: string; legacyPool?: TransitionKind[]; signature?: TransitionKind },
  ): { pool: TransitionKind[]; signature: TransitionKind; cutShareJitter: number; palette: TransitionKind[]; accents: TransitionKind[] };
  isPictureScene(s: Scene, collage: boolean): boolean;
  energyOf(s: Scene): number;
  ENERGY_CAMERA: number[];
  ENERGY_FX: number[];
  resolveFit(s: Scene): 'cover' | 'contain';
  FX_AS_CAMERA: Record<string, CameraKind>;
};
export const deriveStyle = V.deriveStyle;
export const transitionStyle = V.transitionStyle;

/**
 * The scene as the engine draws it: the script's scene plus the derived
 * camera, fit and effects (explicit fields always win). A picture fx that is
 * really a camera move (push-in, tilt-reveal, parallax, rack-focus) becomes
 * the camera when none is set.
 */
export function styledScenes(script: Script, collage: boolean): Scene[] {
  const st = V.deriveStyle(script, { collage });
  return script.scenes.map((s, i) => {
    const fx = (st.fx[i] ?? []) as FxKind[];
    let camera = st.camera[i] ?? undefined;
    if (!s.camera && camera) {
      const asCam = fx.map((k) => V.FX_AS_CAMERA[k]).find(Boolean);
      if (asCam) camera = asCam;
    }
    const fit = st.fit[i] ?? undefined;
    if (!camera && !fit && !fx.length && !s.fx) return s;
    // cameraAuto: the camera was derived, so the scene's energy may scale it.
    return { ...s, ...(camera ? { camera } : {}), ...(camera && !s.camera ? { cameraAuto: true } : {}), ...(fit ? { fit } : {}), fx } as Scene;
  });
}

/* ------------------------------------------------------------ the stack */

const OVERLAYS: Partial<Record<FxKind, React.FC<OverlayProps>>> = {
  'light-leak': LeakFx,
  'film-burn': BurnFx,
  flare: FlareFx,
  halftone: HalftoneFx,
  vhs: VhsFx,
  dust: DustFx,
  'flash-frame': FlashFx,
  'vignette-pulse': VignettePulseFx,
  'scan-lines': ScanFx,
  bokeh: BokehFx,
};
/** Overlays that sit UNDER the scene's type would need the scene split in two; all sit over it, lightly. Order = paint order. */
const ORDER: FxKind[] = ['halftone', 'dust', 'vhs', 'scan-lines', 'bokeh', 'light-leak', 'film-burn', 'flare', 'vignette-pulse', 'flash-frame'];

/**
 * A scene's effects around its body: the body-level ones (camera shake,
 * zoom-blur trails, glitch slices, lens split, texture grades) and the
 * overlays, plus the context the picture reads (camera, fit, speed ramp).
 */
export const FxStack: React.FC<{ scene: Scene; durFrames: number; index: number; genre: Genre; children: React.ReactNode }> = ({ scene, durFrames, index, genre, children }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fxList = (scene.fx ?? []) as FxKind[];
  const plan = useMemo(() => {
    const impacts = sceneImpacts(scene, durFrames, fps, genre);
    const hit = mainHit(impacts, scene.wordTimes, durFrames, fps);
    let hits = impacts.filter((i) => i.strength >= 0.3).map((i) => i.f).sort((a, b) => a - b);
    if (!hits.length && hit !== null) hits = [hit];
    const seed = `${index}|${scene.type}|${(scene.say ?? '').slice(0, 40)}`;
    // Glitch bursts: on up to three hits, else at two seeded moments.
    const bursts = hits.length ? hits.slice(0, 3) : [0.3, 0.72].map((k) => Math.round(durFrames * (k + (random(`${seed}gb${k}`) - 0.5) * 0.1)));
    const pic = V.isPictureScene(scene, genre.collage);
    const energy = V.energyOf(scene);
    const auto = !!(scene as { cameraAuto?: boolean }).cameraAuto;
    const state: SceneFxState = {
      energy,
      camGain: auto ? V.ENERGY_CAMERA[energy] ?? 1 : 1,
      fxGain: V.ENERGY_FX[energy] ?? 1,
      fx: new Set(fxList),
      camera: pic ? scene.camera ?? null : null,
      // resolveFit owns the full-bleed rule (an explicit 'cover' on a too-small picture still becomes 'contain').
      fit: pic ? V.resolveFit(scene) : null,
      durFrames,
      hit,
      hits,
      seed,
      index,
      genre,
    };
    return { state, bursts };
    // fxList derives from `scene`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, durFrames, fps, genre, index]);
  const { state, bursts } = plan;
  const has = (k: FxKind) => state.fx.has(k);
  const focus: [number, number] = ((scene as { focus?: unknown }).focus as [number, number]) ?? [0.5, 0.4];
  const g = state.fxGain;
  const op: OverlayProps = { f, dur: durFrames, fps, hit: state.hit, hits: state.hits, seed: state.seed, genre, focus, gain: g };

  /* ---- body-level ---- */
  let tx = 0;
  let ty = 0;
  let rot = 0;
  let scale = 1;
  let ca = 0;
  const filters: string[] = [];
  if (has('shake')) {
    const jolt = spikeAt(f, state.hits, 10);
    tx += (smoothNoise(f, `${state.seed}sx`) * 7 + (random(`${state.seed}jx${f}`) - 0.5) * 22 * jolt) * g;
    ty += (smoothNoise(f + 31, `${state.seed}sy`) * 5 + (random(`${state.seed}jy${f}`) - 0.5) * 14 * jolt) * g;
    rot += smoothNoise(f + 57, `${state.seed}sr`) * 0.28 * g;
    scale *= 1.025;
  }
  if (has('dust')) ty += (random(`${state.seed}weave${f}`) - 0.5) * 2.2;
  if (has('chroma')) ca = Math.max(ca, 11 * g * spikeAt(f, state.hits, 9), f < 4 ? (4 - f) * 2.2 * g : 0);
  let glitchOn = -1;
  if (has('glitch')) {
    bursts.forEach((b, k) => {
      if (f >= b - 1 && f < b + 4) glitchOn = k * 100 + (f - b);
    });
    if (glitchOn >= 0) {
      ca = Math.max(ca, 9 * g);
      tx += (random(`${state.seed}gj${f}`) - 0.5) * 36 * g;
    }
  }
  if (has('vhs')) {
    ca = Math.max(ca, 2.4);
    filters.push('saturate(1.22) contrast(1.06) blur(0.5px)');
  }
  const htId = `fxht-${index}`;
  if (has('halftone')) filters.push(`contrast(1.08) saturate(0.82) url(#${htId})`);
  if (has('scan-lines')) filters.push('contrast(1.05) brightness(1.04)');
  if (has('flash-frame') && state.hit !== null) {
    const d = f - state.hit;
    if (d === 0) filters.push('brightness(1.45) contrast(0.92)');
    else if (d === 1) filters.push('brightness(1.15)');
    if (d >= 0 && d < 8) scale *= 1 + 0.025 * (1 - d / 8);
  }
  // Zoom blur: trails collapse onto the picture over the first ~10 frames.
  const zb = has('zoom-blur') ? Math.pow(Math.max(0, 1 - f / 12), 1.4) * Math.min(1.25, g) : 0;
  if (zb > 0) scale *= 1 + 0.09 * zb;
  const caId = `fxca-${index}`;
  if (ca > 0.3) filters.push(`url(#${caId})`);
  const origin = `${focus[0] * 100}% ${focus[1] * 100}%`;
  const bodyStyle: React.CSSProperties = {
    transform: tx || ty || rot || scale !== 1 ? `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${scale.toFixed(4)})` : undefined,
    transformOrigin: origin,
    filter: filters.length ? filters.join(' ') : undefined,
  };

  const trails =
    zb > 0.05
      ? [1, 2].map((k) => (
          <AbsoluteFill key={`zb${k}`} style={{ transformOrigin: origin, transform: `scale(${(scale * (1 + 0.11 * k * zb)).toFixed(4)})`, opacity: Math.min(0.6, (0.55 / k) * zb), filter: `blur(${(3 * k * zb).toFixed(2)}px) brightness(1.1)` }}>
            {children}
          </AbsoluteFill>
        ))
      : null;
  const slices =
    glitchOn >= 0
      ? [0, 1, 2].map((k) => {
          const top = random(`${state.seed}gs${glitchOn}${k}`) * 85;
          const h = 3 + random(`${state.seed}gh${glitchOn}${k}`) * 11;
          const dx = (random(`${state.seed}gd${glitchOn}${k}`) - 0.5) * 220;
          return (
            <AbsoluteFill
              key={`gl${k}`}
              style={{
                clipPath: `inset(${top.toFixed(2)}% 0 ${(100 - top - h).toFixed(2)}% 0)`,
                transform: `translateX(${dx.toFixed(1)}px)`,
                filter: k === 1 ? 'hue-rotate(160deg) saturate(1.6)' : k === 2 ? 'brightness(1.4) contrast(1.3)' : undefined,
              }}
            >
              {children}
            </AbsoluteFill>
          );
        })
      : null;

  const textures = ['film-burn', 'light-leak'].some((k) => has(k as FxKind)) ? ['fx/cloud.png'] : [];
  return (
    <SceneFxContext.Provider value={state}>
      {ca > 0.3 ? <ChromaticDefs id={caId} amount={ca} /> : null}
      {has('halftone') ? <HalftoneDefs id={htId} ink={Math.min(0.75, 0.6 * g)} /> : null}
      <AbsoluteFill style={bodyStyle}>{children}</AbsoluteFill>
      {trails}
      {slices}
      {glitchOn >= 0 ? <GlitchBars f={f} seed={state.seed} genre={genre} /> : null}
      {textures.length ? <Preload files={textures} /> : null}
      {ORDER.filter(has).map((k) => {
        const C = OVERLAYS[k];
        if (!C) return null;
        // Low energy: every overlay quieter (high energy is handled inside each one).
        return g < 1 ? (
          <AbsoluteFill key={k} style={{ opacity: g }}>
            <C {...op} />
          </AbsoluteFill>
        ) : (
          <C key={k} {...op} />
        );
      })}
    </SceneFxContext.Provider>
  );
};

const GlitchBars: React.FC<{ f: number; seed: string; genre: Genre }> = ({ f, seed, genre }) => (
  <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
    {Array.from({ length: 5 }, (_, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${random(`${seed}bl${f}${i}`) * 40}%`,
          width: `${30 + random(`${seed}bw${f}${i}`) * 70}%`,
          top: `${random(`${seed}bt${f}${i}`) * 100}%`,
          height: 2 + random(`${seed}bh${f}${i}`) * 9,
          background: i % 2 ? genre.accent : genre.accent2,
          opacity: 0.35,
        }}
      />
    ))}
  </AbsoluteFill>
);

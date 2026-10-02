import { createContext, useContext } from 'react';
import type { CameraKind, FxKind, Genre } from '../types';

/**
 * What a scene's picture needs to know about its effects: the engine's
 * SceneFrame provides it (effects/index.tsx FxStack), fx.tsx Photo and
 * ClipMedia read it. `durFrames` identifies the scene's own full-length
 * picture: a montage cut or a collage print is a shorter or `fill` picture
 * and keeps the old behaviour.
 */
export interface SceneFxState {
  fx: ReadonlySet<FxKind>;
  /** null = the legacy camera (annotated photos, collage boards, non-picture scenes). */
  camera: CameraKind | null;
  fit: 'cover' | 'contain' | null;
  durFrames: number;
  /** Scene-local frame of the scene's main word hit (keyword, slam, stressed word), or null. */
  hit: number | null;
  /** Every strong hit (for spikes). */
  hits: number[];
  seed: string;
  index: number;
  genre: Genre;
  /** Scene energy (1-5) as multipliers: the derived camera's speed, and the effects' intensity (1 = as designed). */
  camGain: number;
  fxGain: number;
  /** The scene's energy, 0 when unset. */
  energy: number;
}

export const SceneFxContext = createContext<SceneFxState | null>(null);

/** The scene's fx state when `durFrames` is the scene's own full-frame picture, else null. */
export function useSceneFx(durFrames: number, fill?: boolean): SceneFxState | null {
  const ctx = useContext(SceneFxContext);
  if (!ctx || fill || ctx.durFrames !== durFrames) return null;
  return ctx;
}

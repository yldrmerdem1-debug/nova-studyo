import React, { useContext } from 'react';
import type { OpeningKind } from './plan.js';

/**
 * What the opening treatment (src/opening) asks of a scene it touches. Read
 * by Montage / Words / Slam (scenes.tsx); null outside the opening, so every
 * other scene draws exactly as before.
 */
export interface OpeningSceneCtx {
  kind: OpeningKind;
  /** Position in the opening's beats; -1 on the main title. */
  beat: number;
  /** The treatment sets this scene's words itself (headlines, evidence): the scene draws its picture only. */
  hideText?: boolean;
  /** Montage corner words keep off this edge (a time stamp lives there). */
  clearEdge?: 'top';
  /** Montage: this word (index) is the opening's hook — set centred and big, with the flash, like the final hook word. */
  heroWord?: number;
  /** Montage: this word is set by the opening's hook layer instead (a cinematic or quiet hook): the montage leaves it out. */
  skipWord?: number;
  /** Montage: drawn over its pictures (under its words) until `until` (map-dive). */
  intro?: { until: number; node: React.ReactNode };
}

export const OpeningContext = React.createContext<OpeningSceneCtx | null>(null);
export const useOpening = (): OpeningSceneCtx | null => useContext(OpeningContext);

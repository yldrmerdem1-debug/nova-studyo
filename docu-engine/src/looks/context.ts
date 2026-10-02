import React, { useContext } from 'react';
import type { Backdrop, CounterStyle, Grade, TextStyle } from '../types';

/**
 * The current scene's look, provided by the Engine around each scene (src/looks/resolve.ts).
 * The default is the original look, so a component rendered outside the
 * Engine (demos, tests) draws exactly as before.
 */
export interface LookCtx {
  grade: Grade;
  textStyle: TextStyle;
  surface: 'light' | 'dark';
  backdrop?: Backdrop;
  /** The drawn ground, rendered by PatternBg in place of the genre pattern. */
  ground?: React.ReactNode;
  chapterName?: string;
  index: number;
  /** Counter scenes: the treatment (src/looks/counters.ts); undefined = 'box'. */
  counterStyle?: CounterStyle;
  /** A 'photo' counter's picture (one of the two scenes before it). */
  picture?: { image?: string; video?: string; videoStart?: number; videoDur?: number; videoW?: number; videoH?: number };
  /** First year of the story (script.era), when known: era-bound furniture reads it. */
  eraStart?: number;
}

export const DEFAULT_LOOK: LookCtx = { grade: 'duotone', textStyle: 'box', surface: 'dark', index: 0 };

export const LookContext = React.createContext<LookCtx>(DEFAULT_LOOK);

export const useLook = (): LookCtx => useContext(LookContext);

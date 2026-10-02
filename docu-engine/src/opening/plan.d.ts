/* Types for plan.js (plain JS, shared with Node and Nova's art director). */
import type { MapRegion, Scene, Script } from '../types';

export type OpeningKind = 'headlines' | 'timestamps' | 'cold-open' | 'evidence' | 'map-dive' | 'quote' | 'montage';
export declare const OPENING_KINDS: readonly OpeningKind[];
export declare const MAP_REGIONS: readonly MapRegion[];

export interface OpeningSpan {
  /** Scene indices of the cold-open beats (before the main title). */
  beats: number[];
  /** The main title's index, -1 when the opening has none. */
  title: number;
  /** Last opening index (the title when there is one). */
  end: number;
}
export interface Stamp {
  text: string;
  date: string;
  time: string;
  precision: 'time' | 'day' | 'month' | 'year';
  /** Spoken in the narration (it lands on the spoken word) rather than only read from a field. */
  fromSay: boolean;
}
export interface OpeningFacts {
  span: OpeningSpan;
  /** Per beat (aligned with span.beats): its own stamp or null. */
  stamps: (Stamp | null)[];
  quote: { beat: number; scene: number; text: string } | null;
  map: { region: MapRegion; point: { label: string; x: number; y: number } } | null;
  /** The scene after the title that rewinds the story, and its caption ("JAN 1959", "86 YEARS EARLIER"). */
  rewind: { scene: number; text: string } | null;
  pictures: number;
  headlines: number;
}
export interface Opening extends OpeningFacts {
  kind: OpeningKind;
  /** How hard the hook lands. */
  hook: HookStyle;
}

export declare function openingSpan(scenes: Scene[]): OpeningSpan | null;
export declare function stampOf(scene: Scene, locale?: string): Stamp | null;
export declare function quoteOf(scene: Scene, locale?: string): string | null;
export declare function mapTarget(scenes: Scene[], span: OpeningSpan | null): OpeningFacts['map'];
export declare function rewindCaption(scenes: Scene[], span: OpeningSpan | null, locale?: string): { scene: number; text: string } | null;
export declare function headlineItems(scene: Scene): string[];
export declare function openingFacts(script: Script): OpeningFacts | null;
export declare function openingEligibility(script: Script, facts?: OpeningFacts | null): Record<OpeningKind, { ok: boolean; why: string }>;
export declare function resolveOpening(script: Script): Opening | null;
export declare function openingEnd(script: Script): number;

export type HookStyle = 'impact' | 'cinematic' | 'quiet';
export declare const HOOK_STYLES: readonly HookStyle[];
export declare function hookStyle(script: Script): HookStyle;

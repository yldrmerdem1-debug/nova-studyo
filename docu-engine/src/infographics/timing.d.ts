/* Types for timing.js (plain JS, shared with timeline.js and Node). */

export declare const INFO_TYPES: readonly ['bars', 'donut', 'icons', 'scale', 'flow', 'stat'];
export type InfoType = (typeof INFO_TYPES)[number];
export declare function isInfoType(t: unknown): t is InfoType;

export interface Spoken {
  raw: string;
  n: string;
  t: number;
}
export declare function fold(s: string): string;
export declare function normWord(w: string): string;
export declare function spokenOf(wordTimes?: { word: string; t: number }[]): Spoken[];
export declare function stemMatch(a: string, b: string): boolean;
export declare function contentWords(text: string): string[];
export declare function labelIndex(label: string, sp: Spoken[], from?: number): number;
export declare function digitValues(raw: string): number[];
export declare function spokenNumbers(sp: Spoken[]): { i: number; e: number; t: number; tEnd: number; values: number[] }[];
export declare function sameNumber(v: number, values: number[]): boolean;
export declare function valueIndex(v: number, sp: Spoken[], nums?: { i: number; t: number; values: number[] }[]): number;

export interface StatParts {
  num: number;
  decimals: number;
  pre: string;
  suf: string;
  groups: number;
  text: string;
}
export declare function parseStat(value: string): StatParts;

export interface BarsPlan {
  kind: 'bars';
  lead: number;
  grow: number;
  growDur: number;
  hl: number | null;
  hits: (number | null)[];
}
export interface DonutPlan {
  kind: 'donut';
  lead: number;
  starts: number[];
  durs: number[];
  drawn: number;
  hl: number | null;
  hits: (number | null)[];
}
export interface IconsPlan {
  kind: 'icons';
  lead: number;
  grid: number;
  fill: number;
  step: number;
  done: number;
  total: number;
  filled: number;
}
export interface ScalePlan {
  kind: 'scale';
  lead: number;
  smallIn: number;
  zoom: number;
  zoomDur: number;
  land: number;
  smallIsA: boolean;
}
export interface FlowPlan {
  kind: 'flow';
  lead: number;
  at: number[];
  hits: (number | null)[];
}
export interface StatPlan {
  kind: 'stat';
  lead: number;
  start: number;
  land: number;
  labelAt: number;
  subAt: number;
}
export type InfoPlan = BarsPlan | DonutPlan | IconsPlan | ScalePlan | FlowPlan | StatPlan;

export declare function infoPlan(scene: unknown, durFrames: number, fps: number): InfoPlan | null;
export declare function infoImpacts(scene: unknown, durFrames: number, fps: number): { f: number; strength: number }[];
export declare function infoSfx(
  scene: unknown,
  durFrames: number,
  fps: number,
): { f: number; kind: 'ticks' | 'snap' | 'whoosh'; gain: number; align?: 'onset' | 'peak' }[];
export declare const TALLY_MAX: number;
export declare function tallyText(n: { i: number; e: number; values: number[] }, sp: Spoken[]): string;
export declare function tallyItems(wordTimes: { word: string; t: number }[] | undefined, o?: { to?: number | null }): { t: number; text: string; label: string }[];
export declare function cueIndexFrom(sp: Spoken[], nums: { i: number; values: number[] }[], o?: { label?: string; value?: number }, from?: number): number;

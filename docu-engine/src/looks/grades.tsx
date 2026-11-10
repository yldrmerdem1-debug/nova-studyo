import React from 'react';
import type { Grade } from '../types';

/*
 * Photo / footage grades. Every picture in the engine is drawn with
 * `filter: url(#duo)` (the genre duotone, fx.tsx DuotoneDefs); a scene with
 * another grade has that reference swapped for its own filter (fx.tsx Media
 * and LayeredPhoto call applyGrade). All grades are colour-only filters
 * (feColorMatrix / feComponentTransfer, like the duotone), which Chrome folds
 * into one colour pass — no blur, no noise, nothing per-pixel-neighbourhood;
 * only 'vhs' adds a small channel offset.
 *
 * Since 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730: saturation 2,5-7,5) the duotone is only drawn
 * when a scene or chapter asks for it: the fallback grade is 'color' (looks/resolve.ts sceneGrade) and a picture
 * with no grade at all gets NO_GRADE_FILTER.
 */

const T = (v: number[]) => v.map((x) => x.toFixed(3)).join(' ');

/** A saturation step, then per-channel tone curves (piecewise-linear tables). */
const Curve: React.FC<{ id: string; sat?: number; r: number[]; g: number[]; b: number[]; children?: React.ReactNode }> = ({ id, sat, r, g, b, children }) => (
  <filter id={id} colorInterpolationFilters="sRGB">
    {sat != null ? <feColorMatrix type="saturate" values={String(sat)} /> : null}
    <feComponentTransfer>
      <feFuncR type="table" tableValues={T(r)} />
      <feFuncG type="table" tableValues={T(g)} />
      <feFuncB type="table" tableValues={T(b)} />
    </feComponentTransfer>
    {children}
  </filter>
);

/** Rendered once at the root of the composition (next to the duotone). */
export const GradeDefs: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <Curve id="nv-g-mono" sat={0} r={[0.02, 0.09, 0.28, 0.54, 0.78, 0.93, 1]} g={[0.02, 0.09, 0.28, 0.54, 0.78, 0.93, 1]} b={[0.025, 0.095, 0.285, 0.54, 0.775, 0.925, 0.995]} />
    <filter id="nv-g-warm" colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="1.08 0.05 0 0 0.02  0.02 1.0 0.02 0 0.008  0 0.03 0.82 0 -0.012  0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0.02 0.2 0.48 0.76 0.98" />
        <feFuncG type="table" tableValues="0.015 0.18 0.45 0.72 0.94" />
        <feFuncB type="table" tableValues="0.01 0.15 0.39 0.63 0.84" />
      </feComponentTransfer>
    </filter>
    {/* Cool is a colour BASE grade now (catalog family colour): natural saturation, only a blue cast. Gimli 20261028-9ff721 /
        Kartal Yuvası 950730, 29 Ekim 2026: doygunluk 2,5-6 — was saturate 0.78. */}
    <filter id="nv-g-cool" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0.96" />
      <feColorMatrix type="matrix" values="0.88 0.02 0 0 0  0 0.97 0.05 0 0.012  0.02 0.07 1.08 0 0.04  0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues="0 0.16 0.44 0.74 0.95" />
        <feFuncG type="table" tableValues="0.01 0.18 0.47 0.77 0.97" />
        <feFuncB type="table" tableValues="0.04 0.24 0.53 0.82 1" />
      </feComponentTransfer>
    </filter>
    <Curve id="nv-g-teal-orange" sat={1.18} r={[0, 0.07, 0.29, 0.6, 0.86, 1]} g={[0.035, 0.16, 0.38, 0.6, 0.8, 0.94]} b={[0.09, 0.24, 0.41, 0.53, 0.64, 0.74]} />
    <Curve id="nv-g-sepia" sat={0} r={[0.08, 0.31, 0.61, 0.86, 1]} g={[0.05, 0.23, 0.51, 0.76, 0.93]} b={[0.03, 0.14, 0.35, 0.57, 0.76]} />
    <Curve id="nv-g-cyanotype" sat={0} r={[0.02, 0.07, 0.28, 0.6, 0.9]} g={[0.09, 0.23, 0.48, 0.76, 0.96]} b={[0.24, 0.45, 0.71, 0.9, 1]} />
    <Curve id="nv-g-bleach" sat={0.32} r={[0, 0.03, 0.17, 0.48, 0.8, 0.95, 1]} g={[0, 0.03, 0.17, 0.48, 0.8, 0.95, 1]} b={[0.01, 0.04, 0.18, 0.48, 0.79, 0.94, 0.99]} />
    <Curve id="nv-g-kodachrome" sat={1.42} r={[0.02, 0.11, 0.42, 0.78, 0.98]} g={[0.01, 0.09, 0.37, 0.71, 0.93]} b={[0.03, 0.11, 0.35, 0.66, 0.86]} />
    <filter id="nv-g-vhs" x="-2%" y="0%" width="104%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0.72" />
      <feComponentTransfer result="toned">
        <feFuncR type="table" tableValues="0.1 0.4 0.73 0.96" />
        <feFuncG type="table" tableValues="0.07 0.35 0.67 0.9" />
        <feFuncB type="table" tableValues="0.13 0.38 0.66 0.92" />
      </feComponentTransfer>
      {/* Red smear: the red channel slips a few pixels right, like a worn tape. */}
      <feColorMatrix in="toned" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
      <feOffset in="red" dx={5} dy={0} result="redShift" />
      <feColorMatrix in="toned" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb" />
      <feComposite in="redShift" in2="gb" operator="arithmetic" k1={0} k2={1} k3={1} k4={0} />
    </filter>
  </svg>
);

/**
 * A picture with no grade at all (no look context: demos, stills, a component outside the Engine) is drawn in natural
 * colour, never through the duotone. Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: every 'no grade'
 * path ended in url(#duo) and the videos measured saturation 2,5-7,5.
 */
export const NO_GRADE_FILTER = 'contrast(1.06) saturate(1.05)';

/** The CSS filter that draws a picture in `grade` (undefined = no grade: natural colour). */
export function gradeFilter(grade: Grade | undefined): string {
  switch (grade) {
    case undefined:
      return NO_GRADE_FILTER;
    case 'duotone':
      return 'url(#duo)';
    case 'color':
      return 'contrast(1.06) saturate(1.1)';
    default:
      return `url(#nv-g-${grade})`;
  }
}

/** A picture's filter with the duotone swapped for the scene's grade (anything else in it — blur, brightness — stays). */
export function applyGrade(filter: string | undefined, grade: Grade | undefined): string | undefined {
  if (!filter || grade === 'duotone' || !filter.includes('url(#duo)')) return filter;
  return filter.replace('url(#duo)', gradeFilter(grade));
}

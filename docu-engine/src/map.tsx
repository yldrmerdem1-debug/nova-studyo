import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, caseLocale, textWidth } from './fonts';
import { LETTERBOX } from './fx';
import { ORBITS, REGIONS, SUN, kmPerWidth, labelText, project, regionName } from './geo';
import type { Pt, RegionDef } from './geo';
import { paperTexture, seededRng } from './paper';
import { GENRES } from './genres';
import { contrast, isLight, mix, readable } from './looks/color';
import { labelIndex, spokenOf } from './infographics/timing.js';
import type { FontKey, Genre, MapScene } from './types';

/*
 * MAP — a hand-drawn map in the genre's ink. The documentary family gets a
 * vintage engraved chart (paper land, rippled coastlines, hachured
 * mountains); crime, horror, finance and science a dark chart with glowing
 * coasts. The base map lives under a camera (one SVG group); the route,
 * points and labels are drawn in screen space on top, so type stays one
 * size and one weight however far the camera moves in.
 */

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

interface MapTheme {
  vintage: boolean;
  sea: string;
  land: string;
  coast: string;
  ripple: string;
  tint: string;
  river: string;
  border: string;
  relief: string;
  forest: string;
  grid: string;
  street: string;
  building: string;
  ink: string;
  mute: string;
  halo: string;
  route: string;
  point: string;
  focus: string;
  labelFont: FontKey;
  labelWeight: number;
  titleFont: FontKey;
  glow: boolean;
}

/** Minimum contrast of map type against every colour of the chart it can sit on (WCAG AA body text). */
export const MAP_TEXT_CONTRAST = 4.5;
/** Points, routes and river lines: graphics, AA for non-text (3:1). */
export const MAP_MARK_CONTRAST = 3;

/** The worst contrast of `c` against any of `grounds`. */
export function worstContrast(c: string, grounds: string[]): number {
  return Math.min(...grounds.map((g) => contrast(c, g)));
}

/**
 * `c`, pushed towards white or black (whichever reads better on these grounds)
 * until it reaches `min`:1 against every one of them — or as far as it can.
 */
export function readableOn(c: string, grounds: string[], min: number): string {
  if (worstContrast(c, grounds) >= min) return c;
  // The smallest push that reads, in either direction; failing that, the most readable one.
  let reach: { t: number; c: string } | null = null;
  let best = c;
  let bestScore = worstContrast(c, grounds);
  for (const to of ['#ffffff', '#000000']) {
    for (let t = 0.05; t <= 1.001; t += 0.05) {
      const m = mix(c, to, t);
      const s = worstContrast(m, grounds);
      if (s > bestScore) {
        best = m;
        bestScore = s;
      }
      if (s >= min) {
        if (!reach || t < reach.t) reach = { t, c: m };
        break;
      }
    }
  }
  return reach ? reach.c : best;
}

/** The chart's look for a genre and its look variant, with every label and mark readable on it. */
export function mapTheme(g: Genre): MapTheme {
  const T = baseTheme(g);
  // Labels sit on land, sea, streets and building blocks alike: they must read on all of them.
  const grounds = [T.land, T.sea, T.street, T.building];
  const text = (c: string) => readableOn(c, grounds, MAP_TEXT_CONTRAST);
  const mark = (c: string) => readableOn(c, [T.land, T.sea], MAP_MARK_CONTRAST);
  return {
    ...T,
    ink: text(T.ink),
    mute: text(T.mute),
    river: mark(T.river),
    route: mark(T.route),
    point: mark(T.point),
    focus: mark(T.focus),
  };
}

function baseTheme(g: Genre): MapTheme {
  const T = styledTheme(g);
  if (T) return T;
  return lookTheme(g);
}

/**
 * The topic identity's map look (src/topic, script.topic.map), the same in every
 * map of the video: 'satellite' a dark relief at night with crisp mono labels
 * (LEMMiNO), 'paper' a period chart, 'grid' a lit world grid (MagnatesMedia).
 */
function styledTheme(g: Genre): MapTheme | null {
  if (!g.mapStyle) return null;
  const base = lookTheme({ ...g, light: false });
  if (g.mapStyle === 'paper') {
    const v = lookTheme({ ...g, id: 'documentary', light: false, bg: GENRES.documentary.bg });
    return { ...v, vintage: true, route: g.accent2, point: g.accent2, focus: g.accent, labelFont: 'oldstandard', titleFont: g.headline, glow: false };
  }
  if (g.mapStyle === 'satellite')
    return { ...base, vintage: false, sea: '#06131d', land: '#1b231b', coast: '#a9b9ad', ripple: '#3e5a68', tint: '#5d6f55', river: '#3a6f8c', border: '#6b786c', relief: '#8e9a7c', forest: '#33452e', grid: '#a9b9ad', street: '#242c23', building: '#303a2e', ink: '#f3f4ef', mute: '#a7b3aa', halo: '#000000', route: g.accent, point: g.accent, focus: g.accent2, labelFont: 'plexMono', labelWeight: 600, titleFont: g.headline, glow: false };
  return { ...base, vintage: false, sea: '#04070c', land: '#0c131b', coast: g.accent, ripple: g.accent, grid: g.accent, relief: g.accent, forest: g.accent, river: '#2c6f8f', street: '#111b25', building: '#16222e', ink: '#eef3f7', mute: '#8fa1b0', halo: '#000000', route: g.accent, point: g.accent, focus: g.accent2, labelFont: 'plexMono', labelWeight: 600, titleFont: g.headline, glow: true };
}

function lookTheme(g: Genre): MapTheme {
  const vintage = (base: Partial<MapTheme>): MapTheme => ({
    vintage: true,
    sea: '#a9b4a2',
    land: '#ecdfbd',
    coast: '#4a3520',
    ripple: '#5b4329',
    tint: '#8a6a3f',
    river: '#4f6f7c',
    border: '#8a3b2b',
    relief: '#6d5236',
    forest: '#5c6a40',
    grid: '#5b4329',
    street: '#f4ead2',
    building: '#b89f78',
    ink: '#2b1d10',
    mute: '#6b5236',
    halo: '#efe3c4',
    route: g.accent2,
    point: g.accent2,
    focus: g.accent2,
    labelFont: 'oldstandard',
    labelWeight: 700,
    titleFont: g.headline,
    glow: false,
    ...base,
  });
  const dark = (base: Partial<MapTheme>): MapTheme => ({
    vintage: false,
    sea: '#070b10',
    land: '#141c24',
    coast: g.ink,
    ripple: g.ink,
    tint: g.accent,
    river: '#3e6c88',
    border: '#6b7d8b',
    relief: g.ink,
    forest: g.ink,
    grid: g.ink,
    street: '#1d2731',
    building: '#2a3440',
    ink: g.ink,
    mute: '#8a98a6',
    halo: '#000000',
    route: g.accent,
    point: g.accent,
    focus: g.accent2,
    labelFont: g.body,
    labelWeight: 700,
    titleFont: g.headline,
    glow: true,
    ...base,
  });
  /*
   * A LIGHT look variant (salmon paper, Swiss editorial, marble ivory...) gets
   * its chart printed in its own palette — a dark terminal map in the middle
   * of a paper video read as a different film.
   */
  if (g.light) {
    const land = isLight(g.paper) ? g.paper : mix(g.bg, '#ffffff', 0.45);
    const sea = mix(g.bg, g.accent, 0.16);
    return vintage({
      sea,
      land,
      coast: g.ink,
      ripple: mix(g.ink, sea, 0.35),
      tint: g.accent,
      river: mix(g.accent, g.ink, 0.25),
      border: g.accent2,
      relief: mix(g.ink, land, 0.35),
      forest: mix(g.accent, g.ink, 0.4),
      grid: mix(g.ink, land, 0.45),
      street: mix(land, '#ffffff', 0.5),
      building: mix(land, g.ink, 0.14),
      ink: g.ink,
      mute: mix(g.ink, land, 0.25),
      halo: land,
      route: g.accent2,
      point: g.accent2,
      focus: g.accent,
      labelFont: g.body,
      titleFont: g.headline,
    });
  }
  /*
   * A dark variant re-dressing a dark-chart genre (money red, Wall Street gold,
   * cold blue case...) keeps the glowing chart but in its own ground, not the
   * original genre's green / steel.
   */
  const original = GENRES[g.id];
  const redressed = !!original && g.bg.toLowerCase() !== original.bg.toLowerCase();
  const own = (o: Partial<MapTheme>): Partial<MapTheme> =>
    redressed
      ? {
          ...o,
          sea: mix(g.bg, '#000000', 0.35),
          land: mix(g.bg, g.ink, 0.07),
          street: mix(g.bg, g.ink, 0.12),
          building: mix(g.bg, g.ink, 0.17),
          mute: mix(g.ink, g.bg, 0.3),
          coast: o.coast === undefined || o.coast === g.accent ? g.accent : mix(g.ink, g.bg, 0.25),
          ripple: o.ripple === undefined || o.ripple === g.accent ? g.accent : mix(g.ink, g.bg, 0.25),
        }
      : o;
  switch (g.id) {
    case 'inspire':
      return vintage({ sea: '#b4b9a2', land: '#f3e5c6', coast: '#5e4128', halo: '#f6ead0', ink: '#3a2414', river: '#5f7f8a' });
    case 'epic':
      return vintage({ sea: '#9b9d80', land: '#e0c995', coast: '#3f2b14', ripple: '#4a3418', halo: '#e6d3a6', ink: '#2e1f0c', labelFont: 'cinzel', route: g.accent2, focus: g.accent2, building: '#b99b62', street: '#ead8ae' });
    case 'crime':
      return dark(own({ sea: '#0a0f15', land: '#17202a', coast: '#a9bccb', ripple: '#a9bccb', river: '#3f6f8f', route: g.accent, point: g.accent2, focus: g.accent2, labelFont: 'courier', mute: '#8aa0b0', street: '#212c37' }));
    case 'horror':
      return dark(own({ sea: '#060404', land: '#1b1410', coast: '#bdb4a1', ripple: '#bdb4a1', river: '#4d5d68', border: '#6b5f55', route: g.accent, point: g.accent, focus: g.accent, labelFont: 'crimson', mute: '#9a8f80', street: '#1e1713', building: '#2a211b' }));
    case 'finance':
      return dark(own({ sea: '#020a06', land: '#07170f', coast: g.accent, ripple: g.accent, river: '#1f7a55', border: '#2f6b4f', relief: g.accent, forest: g.accent, grid: g.accent, route: g.accent, point: g.accent, focus: g.accent2, labelFont: 'plexMono', labelWeight: 600, mute: '#6fbf95', street: '#0c2418', building: '#123524' }));
    case 'science':
      return dark(own({ sea: '#030814', land: '#0a1628', coast: g.accent, ripple: g.accent, river: '#2a7fa8', border: '#2d5575', relief: g.accent, forest: g.accent, grid: g.accent, route: g.accent2, point: g.accent, focus: g.accent2, labelFont: 'inter', mute: '#8fb6cf', street: '#0f1f36', building: '#15294a' }));
    default:
      return vintage({});
  }
}

/* ------------------------------------------------------------ geometry */

const px = (r: RegionDef, p: Pt): Pt => {
  const [x, y] = project(r, p);
  return [x * W, y * H];
};

/** A smooth path through points (quadratic midpoints); straight when `sharp`. */
function pathD(pts: Pt[], closed: boolean, sharp = false): string {
  if (pts.length < 2) return '';
  if (sharp || pts.length < 3) return `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}${closed ? ' Z' : ''}`;
  const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const n = pts.length;
  if (closed) {
    let d = `M${mid(pts[n - 1], pts[0]).map((v) => v.toFixed(1)).join(' ')}`;
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i], pts[(i + 1) % n]);
      d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
    }
    return `${d} Z`;
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < n - 1; i++) {
    const m = mid(pts[i], pts[i + 1]);
    d += ` Q${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
  }
  return `${d} L${pts[n - 1][0].toFixed(1)} ${pts[n - 1][1].toFixed(1)}`;
}

/** Evenly spaced samples along a polyline (px). */
function resample(pts: Pt[], step: number): { p: Pt; a: number }[] {
  const out: { p: Pt; a: number }[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    let t = carry;
    while (t < len) {
      out.push({ p: [x0 + ((x1 - x0) * t) / len, y0 + ((y1 - y0) * t) / len], a });
      t += step;
    }
    carry = t - len;
  }
  return out;
}

function distToPolyline(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t)));
  }
  return best;
}

/** The route as a dense polyline: a gentle arc for two points, a Catmull-Rom curve through more, straight links for a barrier. */
function routeCurve(pts: Pt[], barrier: boolean): Pt[] {
  if (pts.length < 2) return pts;
  if (barrier) return resample(pts, 4).map((s) => s.p).concat([pts[pts.length - 1]]);
  if (pts.length === 2) {
    const [a, b] = pts;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Bend towards the top of the frame (north), like a course on a chart.
    let nx = -(b[1] - a[1]) / (len || 1);
    let ny = (b[0] - a[0]) / (len || 1);
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const c: Pt = [(a[0] + b[0]) / 2 + nx * len * 0.16, (a[1] + b[1]) / 2 + ny * len * 0.16];
    return Array.from({ length: 81 }, (_, i) => {
      const t = i / 80;
      const u = 1 - t;
      return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as Pt;
    });
  }
  const out: Pt[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < 30; k++) {
      const t = k / 30;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arcTable(pts: Pt[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return acc;
}

/** Point, heading and index at fraction `p` of the curve's length. */
function along(pts: Pt[], acc: number[], p: number): { p: Pt; a: number; i: number } {
  const total = acc[acc.length - 1] || 1;
  const d = Math.max(0, Math.min(1, p)) * total;
  let i = 1;
  while (i < acc.length - 1 && acc[i] < d) i++;
  const seg = acc[i] - acc[i - 1] || 1;
  const t = (d - acc[i - 1]) / seg;
  const a = pts[i - 1];
  const b = pts[i] ?? a;
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], a: Math.atan2(b[1] - a[1], b[0] - a[0]), i };
}

/* -------------------------------------------------------------- timing */

export interface MapPlan {
  region: RegionDef;
  pts: Pt[];
  route: number[];
  curve: Pt[];
  acc: number[];
  /** Route drawing window, frames. */
  r0: number;
  r1: number;
  /** Frame each point appears. */
  appear: number[];
  cam0: { cx: number; cy: number; z: number };
  cam1: { cx: number; cy: number; z: number };
  move0: number;
  move1: number;
  focus: number;
}

function clampCam(cx: number, cy: number, z: number) {
  const hw = W / (2 * z);
  const hh = H / (2 * z);
  return { cx: Math.max(hw, Math.min(W - hw, cx)), cy: Math.max(hh, Math.min(H - hh, cy)), z };
}

/** `edgeY`: px hidden at the top and bottom (letterbox bars) that the final framing must keep points out of. */
export function mapPlan(scene: MapScene, durFrames: number, fps: number, edgeY = 0): MapPlan {
  const region = REGIONS[scene.region] ?? REGIONS['north-atlantic'];
  const pts: Pt[] = (scene.points ?? []).map((p) => [Math.max(0, Math.min(1, Number(p.x) || 0)) * W, Math.max(0, Math.min(1, Number(p.y) || 0)) * H]);
  const route = (scene.route ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < pts.length);
  const barrier = scene.line === 'barrier';
  const curve = route.length >= 2 ? routeCurve(route.map((i) => pts[i]), barrier) : [];
  const acc = arcTable(curve);
  const focus = Number.isInteger(scene.focus) && scene.focus! >= 0 && scene.focus! < pts.length ? scene.focus! : -1;

  const move0 = Math.round(0.2 * fps);
  const move1 = move0 + Math.round(Math.max(1.1, Math.min(2.4, (durFrames / fps) * 0.5)) * fps);
  const r0 = Math.round(0.55 * fps);
  const r1 = Math.min(Math.max(r0 + 6, durFrames - Math.round(0.7 * fps)), r0 + Math.round(Math.max(1.2, Math.min(3.2, 0.9 + 0.5 * (route.length - 1))) * fps));

  // Where the camera ends: the focus point, else the route, else every point.
  const fit = (list: Pt[], zMax: number) => {
    if (!list.length) return { cx: W / 2, cy: H / 2, z: 1 };
    const xs = list.map((p) => p[0]);
    const ys = list.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const bw = Math.max(120, x1 - x0) * 1.3 + 520;
    const bh = Math.max(80, y1 - y0) * 1.3 + 300;
    const z = Math.max(1, Math.min(zMax, W / bw, (H - 2 * edgeY) / bh));
    return clampCam((x0 + x1) / 2, (y0 + y1) / 2, z);
  };
  let cam1: MapPlan['cam1'];
  if (focus >= 0) {
    /*
     * The focus point with its context: the route (or the other points)
     * framed, then leaned onto the focus and tightened a little. A focus
     * alone (or only one point) gets the region's close-up zoom.
     */
    const ctx = curve.length ? route.map((i) => pts[i]) : pts;
    const [fx, fy] = pts[focus];
    if (ctx.length > 1) {
      const c = fit(ctx.concat([pts[focus]]), region.focusZoom);
      // Lean onto the focus and tighten — but never so far that a stop of the route leaves the frame.
      const inFrame = (cam: { cx: number; cy: number; z: number }) =>
        ctx.every(([x, y]) => Math.abs((x - cam.cx) * cam.z) < W / 2 - 150 && Math.abs((y - cam.cy) * cam.z) < H / 2 - 110 - edgeY);
      cam1 = c;
      for (const [lean, tight] of [
        [0.35, 1.2],
        [0.25, 1.1],
        [0.15, 1.0],
      ]) {
        const cand = clampCam(c.cx + (fx - c.cx) * lean, c.cy + (fy - c.cy) * lean, Math.min(region.focusZoom, c.z * tight));
        if (inFrame(cand)) {
          cam1 = cand;
          break;
        }
      }
    } else cam1 = clampCam(fx, fy, region.focusZoom);
  } else if (curve.length) {
    cam1 = fit(curve, 2.6);
  } else {
    cam1 = fit(pts, pts.length > 1 ? 2.2 : region.focusZoom);
  }
  const cam0 = clampCam(W / 2 + (cam1.cx - W / 2) * 0.15, H / 2 + (cam1.cy - H / 2) * 0.15, 1.02);

  const sp = spokenOf(scene.wordTimes ?? []) as { t: number }[];
  const appear = pts.map((_, i) => {
    const k = route.indexOf(i);
    if (k >= 0 && curve.length) {
      if (k === 0) return r0 - 4;
      // The moment the drawn line reaches this stop.
      const target = pts[i];
      let best = 0;
      let bd = Infinity;
      curve.forEach((c, j) => {
        const d = Math.hypot(c[0] - target[0], c[1] - target[1]);
        if (d < bd) {
          bd = d;
          best = j;
        }
      });
      const frac = acc[best] / (acc[acc.length - 1] || 1);
      return Math.round(r0 + (r1 - r0) * easeRoute(frac, true));
    }
    // A place the narration names lands on its word (never labelled before it is said).
    const base = Math.round(0.3 * fps) + i * Math.round(0.22 * fps);
    const label = scene.points?.[i]?.label;
    const said = label ? labelIndex(String(label), sp as never) : -1;
    return said >= 0 ? Math.max(base, Math.round(sp[said].t * fps)) : base;
  });
  return { region, pts, route, curve, acc, r0, r1, appear, cam0, cam1, move0, move1, focus };
}

/** Route progress easing (and its inverse, to know when the line reaches a stop). */
function easeRoute(x: number, inverse = false): number {
  const e = Easing.inOut(Easing.quad);
  if (!inverse) return e(Math.max(0, Math.min(1, x)));
  // Invert numerically: the time at which eased progress equals x.
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    if (e(m) < x) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

function camAt(plan: MapPlan, f: number, durFrames: number, speed: number) {
  const m = interpolate(f, [plan.move0, plan.move1], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const { cam0: a, cam1: b } = plan;
  const z = a.z * Math.pow(b.z / a.z, m) * (1 + 0.045 * speed * interpolate(f, [plan.move1, durFrames], [0, 1], clamp));
  // Pan so the target point travels in a straight line on screen while the zoom changes.
  const k = b.z === a.z ? m : (1 / a.z - 1 / (a.z * Math.pow(b.z / a.z, m))) / (1 / a.z - 1 / b.z);
  const t = Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : m;
  return clampCam(a.cx + (b.cx - a.cx) * t, a.cy + (b.cy - a.cy) * t, z);
}

/** The impact frame of a map scene: the route's arrival (a gentle one). */
export function mapImpacts(scene: MapScene, durFrames: number, fps: number): { f: number; strength: number }[] {
  const plan = mapPlan(scene, durFrames, fps);
  if (plan.curve.length && scene.line !== 'barrier') return [{ f: plan.r1, strength: 0.18 }];
  return [];
}

/* ---------------------------------------------------------- base map */

/** Signed-area magnitude of a polygon (px²): small islets get no ripples (they read as targets). */
function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a / 2);
}

const BaseMap: React.FC<{ region: RegionDef; theme: MapTheme; seed: string; uid: string; zEnd: number }> = ({ region: r, theme: T, seed, uid, zEnd }) => {
  const rings = r.land.map((ring) => ring.map((p) => px(r, p)));
  const land = rings.map((ring) => pathD(ring, true));
  const landAll = land.join(' ');
  // Ripples only around shapes big enough to carry them, and spaced for the final framing.
  const bigAll = rings.filter((ring) => area(ring) * zEnd * zEnd > 9000).map((ring) => pathD(ring, true)).join(' ');
  const k = 1 / zEnd;
  const NS = { vectorEffect: 'non-scaling-stroke' as const };
  const out: React.ReactNode[] = [];

  if (r.kind === 'space') {
    const rnd = seededRng(`stars${seed}`);
    const sun = [SUN[0] * W, SUN[1] * H] as Pt;
    if (!T.vintage) {
      out.push(
        <g key="stars">
          {Array.from({ length: 260 }, (_, i) => {
            const s = rnd() < 0.08 ? 1.9 : 0.6 + rnd() * 1.1;
            return <circle key={i} cx={rnd() * W} cy={rnd() * H} r={s} fill="#ffffff" opacity={0.25 + rnd() * 0.55} />;
          })}
        </g>,
      );
    }
    out.push(
      <g key="belt" opacity={T.vintage ? 0.55 : 0.4}>
        {Array.from({ length: 220 }, (_, i) => {
          const a = rnd() * Math.PI * 2;
          const rr = 196 + (rnd() - 0.5) * 34;
          return <circle key={i} cx={sun[0] + Math.cos(a) * rr} cy={sun[1] + Math.sin(a) * rr} r={0.7 + rnd() * 1.1} fill={T.vintage ? T.ink : T.mute} />;
        })}
      </g>,
    );
    out.push(
      <g key="sun">
        <circle cx={sun[0]} cy={sun[1]} r={120} fill={`url(#sunglow${uid})`} />
        <circle cx={sun[0]} cy={sun[1]} r={26} fill={T.vintage ? '#d9902a' : '#ffd27a'} stroke={T.vintage ? T.ink : 'none'} strokeWidth={1.5} {...NS} />
      </g>,
    );
    return <>{out}</>;
  }

  // Graticule.
  if (r.kind === 'geo' && r.graticule) {
    const [w, s, e, n] = r.box;
    const g = r.graticule;
    const lines: React.ReactNode[] = [];
    for (let lon = Math.ceil(w / g) * g; lon <= e; lon += g) {
      const [x] = px(r, [lon, s]);
      lines.push(<line key={`o${lon}`} x1={x} x2={x} y1={0} y2={H} />);
    }
    for (let lat = Math.ceil(s / g) * g; lat <= n; lat += g) {
      const [, y] = px(r, [w, lat]);
      lines.push(<line key={`a${lat}`} x1={0} x2={W} y1={y} y2={y} />);
    }
    out.push(
      <g key="grat" stroke={T.grid} strokeWidth={1} opacity={T.vintage ? 0.22 : 0.12} {...NS} strokeDasharray={T.vintage ? undefined : '3 7'}>
        {lines}
      </g>,
    );
  }

  if (r.kind === 'city') {
    out.push(<rect key="blocks" x={-W} y={-H} width={3 * W} height={3 * H} fill={T.land} />);
    out.push(<rect key="hatch" x={-W} y={-H} width={3 * W} height={3 * H} fill={`url(#lots${uid})`} opacity={T.vintage ? 0.55 : 0.35} />);
    for (const [k, wpoly] of (r.water ?? []).entries()) {
      const pts = wpoly.map((p) => px(r, p));
      const d = pathD(pts, true, true);
      out.push(<path key={`w${k}`} d={d} fill={T.sea} stroke={T.coast} strokeWidth={2} {...NS} />);
      // Engraved water lines parallel to the quay.
      for (let j = 1; j <= 3; j++) {
        const shore = pts.slice(3).concat([pts[0]]).map((p) => [p[0] + j * 16, p[1]] as Pt);
        out.push(<path key={`wl${k}${j}`} d={pathD(shore, false, true)} fill="none" stroke={T.ripple} strokeWidth={1} opacity={0.4 - j * 0.08} {...NS} />);
      }
    }
    for (const [k, s] of (r.streets ?? []).entries()) {
      const d = pathD(s.pts.map((p) => px(r, p)), false, true);
      out.push(<path key={`se${k}`} d={d} fill="none" stroke={T.coast} strokeOpacity={0.55} strokeWidth={s.w + 4} strokeLinecap="butt" />);
    }
    for (const [k, s] of (r.streets ?? []).entries()) {
      const d = pathD(s.pts.map((p) => px(r, p)), false, true);
      out.push(<path key={`sf${k}`} d={d} fill="none" stroke={T.street} strokeWidth={s.w} strokeLinecap="square" />);
    }
    for (const [k, b] of (r.buildings ?? []).entries()) {
      const pts = b.pts.map((p) => px(r, p));
      const [x0, y0] = pts[0];
      const [x1, y1] = pts[2];
      out.push(<path key={`b${k}`} d={pathD(pts, true, true)} fill={T.building} stroke={T.coast} strokeWidth={2} {...NS} />);
      if (b.kind === 'columns') {
        const n = 6;
        // Columns on the long street front (the right edge of a tall block, the bottom of a wide one).
        const tall = y1 - y0 > x1 - x0;
        out.push(
          <g key={`bc${k}`} stroke={T.coast} strokeWidth={2.5} {...NS}>
            {Array.from({ length: n }, (_, i) => {
              if (tall) {
                const y = y0 + ((i + 0.5) * (y1 - y0)) / n;
                return <line key={i} x1={x1 - 14} x2={x1 - 2} y1={y} y2={y} />;
              }
              const x = x0 + ((i + 0.5) * (x1 - x0)) / n;
              return <line key={i} x1={x} x2={x} y1={y1 - 14} y2={y1 - 2} />;
            })}
          </g>,
        );
      }
      if (b.kind === 'church') {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        out.push(
          <g key={`bx${k}`} stroke={T.coast} strokeWidth={3} {...NS}>
            <line x1={cx} x2={cx} y1={cy - 18} y2={cy + 18} />
            <line x1={cx - 11} x2={cx + 11} y1={cy - 6} y2={cy - 6} />
          </g>,
        );
      }
    }
  }

  if (r.kind === 'geo') {
    if (land.length) {
      // Coast ripples: bands of sea colour cut into rings of line colour, outermost (faintest) first.
      if (bigAll) {
        for (const [d, o] of [
          [26, 0.16],
          [16, 0.26],
          [8, 0.38],
        ] as const) {
          const dd = d * k;
          out.push(<path key={`ro${d}`} d={bigAll} fill="none" stroke={T.ripple} strokeOpacity={T.vintage ? o : o * 0.55} strokeWidth={2 * dd + 1.2 * k} strokeLinejoin="round" />);
          out.push(<path key={`ri${d}`} d={bigAll} fill="none" stroke={T.sea} strokeWidth={2 * dd - 1.2 * k} strokeLinejoin="round" />);
        }
      }
      out.push(<path key="land" d={landAll} fill={T.land} />);
      // A hand-coloured band just inside every coast.
      out.push(
        <g key="tint" clipPath={`url(#landclip${uid})`}>
          <path d={landAll} fill="none" stroke={T.tint} strokeOpacity={T.vintage ? 0.3 : 0.12} strokeWidth={24 * k} strokeLinejoin="round" />
        </g>,
      );
    } else {
      out.push(<rect key="land" x={-W} y={-H} width={3 * W} height={3 * H} fill={T.land} />);
    }
    for (const [k, l] of (r.lakes ?? []).entries()) {
      out.push(<path key={`lk${k}`} d={pathD(l.map((p) => px(r, p)), true)} fill={T.sea} stroke={T.coast} strokeWidth={1.2} {...NS} />);
    }
    // Relief: contour rings around summits and hachures along the chains.
    const rnd = seededRng(`relief${r.id}`);
    for (const [k, pk] of (r.peaks ?? []).entries()) {
      const [cx, cy] = px(r, pk.p);
      const h = pk.h ?? 1;
      if (r.forest) {
        out.push(
          <g key={`ct${k}`} fill="none" stroke={T.relief} strokeOpacity={T.vintage ? 0.45 : 0.28} strokeWidth={1} {...NS}>
            {[1, 2, 3, 4].map((ring) => {
              const base = 11 * ring * (0.6 + h * 0.6);
              const n = 16;
              const ring0 = Array.from({ length: n }, (_, i) => {
                const a = (i / n) * Math.PI * 2;
                const rr = base * (0.78 + rnd() * 0.44) * (i % 2 ? 1.25 : 1);
                return [cx + Math.cos(a) * rr * 0.8, cy + Math.sin(a) * rr * 1.25] as Pt;
              });
              return <path key={ring} d={pathD(ring0, true)} />;
            })}
          </g>,
        );
      }
      const s = 11 * h;
      out.push(
        <path
          key={`pk${k}`}
          d={`M${cx - s} ${cy + s * 0.7} L${cx} ${cy - s * 0.9} L${cx + s} ${cy + s * 0.7} Z`}
          fill={T.vintage ? T.relief : T.land}
          fillOpacity={T.vintage ? 0.55 : 1}
          stroke={T.relief}
          strokeOpacity={T.vintage ? 0.9 : 0.6}
          strokeWidth={1.2}
          {...NS}
        />,
      );
    }
    for (const [k, ridge] of (r.ridges ?? []).entries()) {
      const samples = resample(ridge.map((p) => px(r, p)), 9);
      const ticks = samples.map((s, i) => {
        const nx = -Math.sin(s.a);
        const ny = Math.cos(s.a);
        const l1 = 8 + rnd() * 16;
        const l2 = 6 + rnd() * 12;
        return (
          <g key={i}>
            <line x1={s.p[0]} y1={s.p[1]} x2={s.p[0] + nx * l1} y2={s.p[1] + ny * l1} />
            <line x1={s.p[0]} y1={s.p[1]} x2={s.p[0] - nx * l2} y2={s.p[1] - ny * l2} />
          </g>
        );
      });
      out.push(
        <g key={`rg${k}`} stroke={T.relief} strokeOpacity={T.vintage ? 0.5 : 0.3} strokeWidth={1.1} {...NS}>
          {ticks}
        </g>,
      );
    }
    if (r.forest) {
      const ridges = (r.ridges ?? []).map((rg) => rg.map((p) => px(r, p)));
      const rivers = (r.rivers ?? []).map((rv) => rv.pts.map((p) => px(r, p)));
      const trees: React.ReactNode[] = [];
      const rt = seededRng(`trees${r.id}`);
      for (let i = 0; trees.length < 520 && i < 3000; i++) {
        const p: Pt = [rt() * W, rt() * H];
        if (ridges.some((rg) => distToPolyline(p, rg) < 46)) continue;
        if (rivers.some((rv) => distToPolyline(p, rv) < 9)) continue;
        const s = 0.8 + rt() * 0.5;
        trees.push(
          <path
            key={i}
            transform={`translate(${p[0].toFixed(1)} ${p[1].toFixed(1)}) scale(${s.toFixed(2)})`}
            d="M0 -8 L4 -1 L-4 -1 Z M0 -4 L5.5 4 L-5.5 4 Z M-0.8 4 L0.8 4 L0.8 7 L-0.8 7 Z"
          />,
        );
      }
      out.push(
        <g key="forest" fill={T.forest} opacity={T.vintage ? 0.42 : 0.2}>
          {trees}
        </g>,
      );
    }
    for (const [k, rv] of (r.rivers ?? []).entries()) {
      out.push(
        <path key={`rv${k}`} d={pathD(rv.pts.map((p) => px(r, p)), false)} fill="none" stroke={T.river} strokeWidth={(rv.w ?? 2) * 0.9} strokeLinecap="round" strokeLinejoin="round" {...NS} />,
      );
    }
    for (const [k, b] of (r.borders ?? []).entries()) {
      out.push(
        <path key={`bd${k}`} d={pathD(b.map((p) => px(r, p)), false, true)} fill="none" stroke={T.border} strokeOpacity={T.vintage ? 0.75 : 0.55} strokeWidth={1.4} strokeDasharray="7 4 2 4" {...NS} />,
      );
    }
    if (land.length) out.push(<path key="coast" d={landAll} fill="none" stroke={T.coast} strokeWidth={T.vintage ? 1.8 : 1.4} strokeLinejoin="round" {...NS} />);
    for (const [j, tw] of (r.towns ?? []).entries()) {
      out.push(<path key={`tn${j}`} d={pathD(tw.map((p) => px(r, p)), true, true)} fill={T.vintage ? T.relief : T.coast} fillOpacity={T.vintage ? 0.22 : 0.12} />);
      out.push(<path key={`th${j}`} d={pathD(tw.map((p) => px(r, p)), true, true)} fill={`url(#lots${uid})`} opacity={0.7} />);
    }
    for (const [j, wl] of (r.walls ?? []).entries()) {
      const pts = wl.map((p) => px(r, p));
      const towers = resample(pts, 30 * k);
      const t = 8 * k;
      out.push(
        <g key={`wl${j}`}>
          <path d={pathD(pts, false, true)} fill="none" stroke={T.coast} strokeWidth={4} strokeLinejoin="round" {...NS} />
          {towers.map((tw, i) => (
            <rect
              key={i}
              x={tw.p[0] - t / 2}
              y={tw.p[1] - t / 2}
              width={t}
              height={t}
              transform={`rotate(${((tw.a * 180) / Math.PI).toFixed(1)} ${tw.p[0].toFixed(2)} ${tw.p[1].toFixed(2)})`}
              fill={T.coast}
            />
          ))}
        </g>,
      );
    }
  }
  return <>{out}</>;
};

/** Region labels (seas, states, rivers): part of the chart, they grow only a little with the zoom. */
const RegionLabels: React.FC<{ region: RegionDef; theme: MapTheme; z: number; locale?: string }> = ({ region: r, theme: T, z, locale }) => {
  const k = 1 / Math.pow(z, 0.7);
  const out: React.ReactNode[] = [];
  for (const [i, l] of r.labels.entries()) {
    const [x, y] = px(r, l.p);
    const sea = l.kind === 'sea';
    out.push(
      <text
        key={`l${i}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={l.rotate ? `rotate(${l.rotate} ${x} ${y})` : undefined}
        fontFamily={FONT[T.labelFont]}
        fontStyle={sea && T.vintage ? 'italic' : undefined}
        fontWeight={sea ? 400 : 700}
        fontSize={l.size * k}
        letterSpacing={`${sea ? 0.3 : 0.18}em`}
        fill={sea ? (T.vintage ? T.river : T.mute) : T.mute}
        opacity={T.vintage ? 0.92 : 0.9}
      >
        {labelText(l, locale)}
      </text>,
    );
  }
  for (const [i, rv] of (r.rivers ?? []).entries()) {
    if (!rv.label) continue;
    const pts = rv.pts.map((p) => px(r, p));
    const acc = arcTable(pts);
    const at = along(pts, acc, rv.at ?? 0.5);
    let a = (at.a * 180) / Math.PI;
    if (a > 90) a -= 180;
    if (a < -90) a += 180;
    out.push(
      <text
        key={`r${i}`}
        x={at.p[0]}
        y={at.p[1] - 7 * k}
        textAnchor="middle"
        transform={`rotate(${a.toFixed(1)} ${at.p[0]} ${at.p[1]})`}
        fontFamily={FONT[T.labelFont]}
        fontStyle="italic"
        fontSize={17 * k}
        letterSpacing="0.08em"
        fill={T.river}
        style={{ paintOrder: 'stroke', stroke: T.vintage ? T.land : T.sea, strokeWidth: 4 * k }}
      >
        {rv.label}
      </text>,
    );
  }
  for (const [i, s] of (r.streets ?? []).entries()) {
    if (!s.name) continue;
    const pts = s.pts.map((p) => px(r, p));
    const at = along(pts, arcTable(pts), s.at ?? 0.5);
    let a = (at.a * 180) / Math.PI;
    if (a > 90) a -= 180;
    if (a < -90) a += 180;
    const size = Math.min(s.w * 0.62, 20) * Math.pow(z, 0.25);
    out.push(
      <text
        key={`s${i}`}
        x={at.p[0]}
        y={at.p[1]}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(${a.toFixed(1)} ${at.p[0]} ${at.p[1]})`}
        fontFamily={FONT[T.labelFont]}
        fontWeight={700}
        fontSize={size / z}
        letterSpacing="0.14em"
        fill={T.mute}
      >
        {s.name}
      </text>,
    );
  }
  if (r.kind === 'space') {
    const [x, y] = [SUN[0] * W, SUN[1] * H];
    out.push(
      <text key="sun" x={x} y={y + 52 * k} textAnchor="middle" fontFamily={FONT[T.labelFont]} fontWeight={700} fontSize={20 * k} letterSpacing="0.3em" fill={T.mute}>
        {isTrLoc(locale) ? 'GÜNEŞ' : 'SUN'}
      </text>,
    );
  }
  return <>{out}</>;
};

/* ------------------------------------------------------------- labels */

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

interface Placed {
  anchor: 'start' | 'end' | 'middle';
  dx: number;
  dy: number;
  hidden?: boolean;
}

/**
 * Label sides, chosen ONCE from the final framing (a label that jumped sides
 * mid-move would read as a glitch): the first side that stays inside the safe
 * frame and clear of other labels, dots and the corner furniture.
 */
function placeLabels(
  pts: Pt[],
  labels: string[],
  sizes: number[],
  font: FontKey,
  cam: { cx: number; cy: number; z: number },
  safe: Box,
  keepOut: Box[],
): Placed[] {
  const scr = pts.map(([x, y]) => [(x - cam.cx) * cam.z + W / 2, (y - cam.cy) * cam.z + H / 2] as Pt);
  const taken: Box[] = [...keepOut, ...scr.map(([x, y]) => ({ x0: x - 12, y0: y - 12, x1: x + 12, y1: y + 12 }))];
  return scr.map(([x, y], i) => {
    const s = sizes[i];
    const w = textWidth(labels[i], font, s, { trackEm: 0.08 }) + 10;
    const cands: (Placed & { box: Box })[] = [
      { anchor: 'start', dx: 20, dy: s * 0.36, box: { x0: x + 16, y0: y - s * 0.6, x1: x + 24 + w, y1: y + s * 0.6 } },
      { anchor: 'end', dx: -20, dy: s * 0.36, box: { x0: x - 24 - w, y0: y - s * 0.6, x1: x - 16, y1: y + s * 0.6 } },
      { anchor: 'middle', dx: 0, dy: -24, box: { x0: x - w / 2, y0: y - 26 - s, x1: x + w / 2, y1: y - 18 } },
      { anchor: 'middle', dx: 0, dy: 26 + s * 0.8, box: { x0: x - w / 2, y0: y + 18, x1: x + w / 2, y1: y + 30 + s } },
    ];
    const inside = (b: Box) => b.x0 >= safe.x0 && b.x1 <= safe.x1 && b.y0 >= safe.y0 && b.y1 <= safe.y1;
    const own = (b: Box) => taken.filter((t, k) => !(k === keepOut.length + i)).every((t) => !overlaps(b, t));
    const pick = cands.find((c) => inside(c.box) && own(c.box)) ?? cands.find((c) => inside(c.box));
    if (!pick) return { anchor: 'start', dx: 0, dy: 0, hidden: true };
    taken.push(pick.box);
    return { anchor: pick.anchor, dx: pick.dx, dy: pick.dy };
  });
}

/* ------------------------------------------------------ corner furniture */

const Compass: React.FC<{ theme: MapTheme; x: number; y: number; o: number; locale?: string }> = ({ theme: T, x, y, o, locale }) => (
  <g transform={`translate(${x} ${y})`} opacity={o}>
    <circle r={34} fill="none" stroke={T.vintage ? T.coast : T.mute} strokeWidth={1.2} opacity={0.7} />
    <circle r={27} fill="none" stroke={T.vintage ? T.coast : T.mute} strokeWidth={0.8} opacity={0.5} />
    <path d="M0 -44 L7 0 L0 8 L-7 0 Z" fill={T.vintage ? T.coast : T.ink} opacity={0.9} />
    <path d="M0 44 L7 0 L0 -8 L-7 0 Z" fill="none" stroke={T.vintage ? T.coast : T.ink} strokeWidth={1.2} opacity={0.7} />
    <path d="M-40 0 L0 5 L40 0 L0 -5 Z" fill="none" stroke={T.vintage ? T.coast : T.mute} strokeWidth={1} opacity={0.6} />
    <text y={-52} textAnchor="middle" fontFamily={FONT[T.labelFont]} fontWeight={700} fontSize={20} fill={T.vintage ? T.ink : T.ink}>
      {isTrLoc(locale) ? 'K' : 'N'}
    </text>
  </g>
);

function niceKm(target: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [1, 2, 5, 10]) if (m * p >= target) return m * p;
  return 10 * p;
}

/* ================================================================ SCENE */

/** Turkish scripts keep Turkish case rules and labels; every other locale gets English. */
const isTrLoc = (locale?: string) => String(locale ?? 'tr').toLowerCase().startsWith('tr');

export const MapScn: React.FC<{ scene: MapScene; genre: Genre; durFrames: number; speed: number; index?: number; locale?: string }> = ({ scene, genre, durFrames, speed, index, locale }) => {
  // SVG ids are document-wide: keep each map scene's own.
  const uid = `m${index ?? 0}`;
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = useMemo(() => mapTheme(genre), [genre]);
  const edgeY = genre.letterbox ? Math.round(H * LETTERBOX) : 0;
  const plan = useMemo(() => mapPlan(scene, durFrames, fps, edgeY), [scene, durFrames, fps, edgeY]);
  const r = plan.region;
  const rName = regionName(r, locale);
  const base = useMemo(() => <BaseMap region={r} theme={T} seed={scene.region} uid={uid} zEnd={plan.cam1.z} />, [r, T, scene.region, uid, plan.cam1.z]);
  const tex = useMemo(() => (T.vintage ? paperTexture(`map${genre.id}${genre.light ? T.land : ''}`, { tone: genre.light ? mix(T.land, '#d9d1bf', 0.35) : '#d9d1bf', w: 960, h: 540, age: genre.light ? 0.35 : 0.8, rings: false }) : ''), [T.vintage, T.land, genre.id, genre.light]);
  const cam = camAt(plan, f, durFrames, speed);
  const bar = genre.letterbox ? Math.round(H * LETTERBOX) : 0;
  const safeTop = Math.max(44, bar + 28);
  const safeBottom = H - Math.max(44, bar + 28);

  const labels = (scene.points ?? []).map((p) => String(p.label ?? '').toLocaleUpperCase(caseLocale(locale)));
  const sizes = labels.map((_, i) => (i === plan.focus ? 38 : 31));
  // Keep point labels clear of the cartouche, measured the way it is set.
  const cartW =
    72 +
    40 +
    (genre.look === 'glow'
      ? textWidth(rName, genre.headline, 34, { trackEm: 0.22 })
      : genre.look === 'terminal'
        ? textWidth(`[ ${isTrLoc(locale) ? 'HARİTA' : 'MAP'} ] ${rName}`, 'plexMono', 30, { trackEm: 0.1 })
        : textWidth(rName, genre.headline, 40, { trackEm: 0.04 }) + 44);
  const placed = useMemo(
    () =>
      placeLabels(plan.pts, labels, sizes, T.labelFont, camAt(plan, durFrames - 1, durFrames, speed), { x0: 24, y0: safeTop, x1: W - 24, y1: safeBottom }, [
        { x0: 0, y0: 0, x1: cartW, y1: safeTop + 120 },
        { x0: W - 170, y0: safeBottom - 150, x1: W, y1: H },
        { x0: W - 470, y0: safeBottom - 60, x1: W, y1: H },
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan, T.labelFont, durFrames, speed, safeTop, safeBottom, labels.join('|')],
  );

  const toScr = (p: Pt): Pt => [(p[0] - cam.cx) * cam.z + W / 2, (p[1] - cam.cy) * cam.z + H / 2];

  /* ---- route ---- */
  let routeEl: React.ReactNode = null;
  if (plan.curve.length >= 2) {
    const barrier = scene.line === 'barrier';
    const prog = easeRoute(interpolate(f, [plan.r0, plan.r1], [0, 1], clamp));
    if (prog > 0) {
      const head = along(plan.curve, plan.acc, prog);
      const drawn = plan.curve.slice(0, head.i).concat([head.p]).map(toScr);
      const d = pathD(drawn, false, true);
      const full = plan.curve.map(toScr);
      const hp = toScr(head.p);
      const ang = (head.a * 180) / Math.PI;
      const done = prog >= 0.999;
      if (barrier) {
        const links = resample(drawn, 13);
        routeEl = (
          <g>
            <path d={d} fill="none" stroke={T.vintage ? T.halo : '#000'} strokeOpacity={0.7} strokeWidth={9} strokeLinecap="round" />
            <path d={d} fill="none" stroke={T.route} strokeWidth={3} strokeLinecap="round" />
            {links.map((l, i) => (
              <ellipse
                key={i}
                cx={l.p[0]}
                cy={l.p[1]}
                rx={i % 2 ? 6.5 : 5}
                ry={i % 2 ? 3 : 4.2}
                transform={`rotate(${((l.a * 180) / Math.PI).toFixed(1)} ${l.p[0].toFixed(1)} ${l.p[1].toFixed(1)})`}
                fill="none"
                stroke={T.route}
                strokeWidth={2.2}
              />
            ))}
            {links
              .filter((_, i) => i % 6 === 3)
              .map((l, i) => (
                <circle key={`b${i}`} cx={l.p[0]} cy={l.p[1]} r={5.5} fill={T.vintage ? T.land : T.sea} stroke={T.route} strokeWidth={2} />
              ))}
          </g>
        );
      } else {
        routeEl = (
          <g>
            {/* The whole course, faint, ahead of the line: the viewer sees where it is going. */}
            <path d={pathD(full, false, true)} fill="none" stroke={T.route} strokeOpacity={0.16} strokeWidth={2} strokeDasharray="2 9" />
            <path d={d} fill="none" stroke={T.vintage ? T.halo : '#000'} strokeOpacity={T.vintage ? 0.8 : 0.6} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={d}
              fill="none"
              stroke={T.route}
              strokeWidth={4.5}
              strokeDasharray="16 10"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={T.glow ? { filter: `drop-shadow(0 0 6px ${T.route})` } : undefined}
            />
            {!done || f < plan.r1 + 12 ? (
              <g transform={`translate(${hp[0].toFixed(1)} ${hp[1].toFixed(1)}) rotate(${ang.toFixed(1)})`} opacity={done ? interpolate(f, [plan.r1, plan.r1 + 12], [1, 0], clamp) : 1}>
                <circle r={18} fill={T.route} opacity={0.18} />
                <path d="M13 0 L-8 -9 L-3 0 L-8 9 Z" fill={T.route} stroke={T.vintage ? T.ink : '#000'} strokeOpacity={0.5} strokeWidth={1.2} />
              </g>
            ) : null}
          </g>
        );
      }
    }
  }

  /* ---- points ---- */
  const pointsEl = plan.pts.map((p, i) => {
    const at = plan.appear[i];
    const t = f - at;
    if (t < 0) return null;
    const s = toScr(p);
    if (s[0] < -40 || s[0] > W + 40 || s[1] < -40 || s[1] > H + 40) return null;
    const pop = interpolate(t, [0, 5, 9], [0, 1.35, 1], clamp);
    const ring = interpolate(t, [0, 16], [0, 1], clamp);
    const lab = interpolate(t, [4, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const isFocus = i === plan.focus;
    const color = isFocus ? T.focus : T.point;
    const pl = placed[i];
    const planet = r.kind === 'space' ? ORBITS.find((o) => o.keys.includes(String(scene.points[i].label ?? '').toLocaleLowerCase(caseLocale(locale)).trim())) : undefined;
    const pulse = isFocus ? (Math.sin((t / fps) * Math.PI * 1.6) + 1) / 2 : 0;
    const psize = planet ? planet.size * Math.pow(cam.z, 0.55) : 0;
    return (
      <g key={i}>
        {ring < 1 ? <circle cx={s[0]} cy={s[1]} r={10 + ring * 34} fill="none" stroke={color} strokeWidth={2.5 * (1 - ring)} opacity={1 - ring} /> : null}
        {isFocus && t > 16 ? <circle cx={s[0]} cy={s[1]} r={16 + pulse * 12} fill="none" stroke={color} strokeWidth={2} opacity={0.75 - pulse * 0.55} /> : null}
        {planet ? (
          <g transform={`translate(${s[0]} ${s[1]}) scale(${pop})`}>
            {planet.ring ? <ellipse rx={psize * 2.1} ry={psize * 0.6} fill="none" stroke={T.vintage ? T.ink : planet.color} strokeWidth={2} opacity={0.85} transform="rotate(-18)" /> : null}
            <circle r={psize} fill={T.vintage ? T.halo : planet.color} stroke={T.vintage ? T.ink : 'rgba(0,0,0,0.5)'} strokeWidth={1.6} />
            {T.vintage ? <circle r={psize * 0.62} fill="none" stroke={T.ink} strokeOpacity={0.35} strokeWidth={1} /> : <circle r={psize} fill={`url(#planetshade${uid})`} />}
          </g>
        ) : (
          <g transform={`translate(${s[0]} ${s[1]}) scale(${pop})`}>
            <circle r={11} fill={T.vintage ? T.halo : '#000'} opacity={0.85} />
            <circle r={7} fill={color} style={T.glow ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined} />
          </g>
        )}
        {lab > 0 && !pl.hidden ? (
          <text
            x={s[0] + pl.dx + (planet && pl.anchor !== 'middle' ? (pl.anchor === 'start' ? psize : -psize) : 0)}
            y={s[1] + pl.dy + (planet && pl.anchor === 'middle' ? Math.sign(pl.dy) * psize : 0)}
            textAnchor={pl.anchor}
            fontFamily={FONT[T.labelFont]}
            fontWeight={T.labelWeight}
            fontSize={sizes[i]}
            letterSpacing="0.08em"
            fill={isFocus ? (T.vintage ? T.ink : T.ink) : T.ink}
            opacity={lab}
            style={{ paintOrder: 'stroke', stroke: T.halo, strokeWidth: T.vintage ? 7 : 8, strokeOpacity: T.vintage ? 0.9 : 0.75, strokeLinejoin: 'round' }}
          >
            {labels[i]}
          </text>
        ) : null}
      </g>
    );
  });

  /* ---- orbits through the named planets (space map) ---- */
  let orbitsEl: React.ReactNode = null;
  if (r.kind === 'space') {
    const sun: Pt = [SUN[0] * W, SUN[1] * H];
    const named = new Set<number>();
    const own = (scene.points ?? []).map((p, i) => {
      const o = ORBITS.find((x) => x.keys.includes(String(p.label ?? '').toLocaleLowerCase(caseLocale(locale)).trim()));
      if (o) named.add(ORBITS.indexOf(o));
      return o ? Math.hypot(plan.pts[i][0] - sun[0], plan.pts[i][1] - sun[1]) : 0;
    });
    orbitsEl = (
      <g fill="none" stroke={T.vintage ? T.coast : T.mute}>
        {ORBITS.map((o, k) => (named.has(k) ? null : <circle key={`d${k}`} cx={sun[0]} cy={sun[1]} r={o.r} strokeOpacity={0.22} strokeWidth={1} strokeDasharray="2 6" vectorEffect="non-scaling-stroke" />))}
        {own.map((rr, i) => (rr > 0 ? <circle key={`o${i}`} cx={sun[0]} cy={sun[1]} r={rr} strokeOpacity={T.vintage ? 0.6 : 0.45} strokeWidth={1.3} vectorEffect="non-scaling-stroke" /> : null))}
      </g>
    );
  }

  /* ---- furniture ---- */
  const furn = interpolate(f, [4, 16], [0, 1], clamp);
  let scaleEl: React.ReactNode = null;
  if (r.kind === 'geo' && r.scaleKm) {
    const kmW = kmPerWidth(r);
    const pxPerKm = (W * cam.z) / kmW;
    const km = niceKm(150 / ((W * plan.cam1.z) / kmW));
    const len = Math.min(420, km * pxPerKm);
    const x1 = W - 200;
    const x0 = x1 - len;
    const y = safeBottom - 24;
    scaleEl = (
      <g opacity={furn * 0.9}>
        <rect x={x0} y={y - 5} width={len} height={6} fill={T.vintage ? T.halo : '#000'} stroke={T.vintage ? T.coast : T.mute} strokeWidth={1.2} />
        <rect x={x0} y={y - 5} width={len / 2} height={6} fill={T.vintage ? T.coast : T.mute} />
        <text x={x0 + len / 2} y={y - 14} textAnchor="middle" fontFamily={FONT[T.labelFont]} fontWeight={700} fontSize={18} letterSpacing="0.1em" fill={T.vintage ? T.ink : T.mute}>
          {`${km.toLocaleString(isTrLoc(locale) ? 'tr-TR' : 'en-US')} KM`}
        </text>
      </g>
    );
  }

  const look = genre.look;
  // The cartouche reads on the chart under it (the sea fills the frame behind the top-left corner).
  const cartInk = readable(genre.labelInk, genre.labelBg, MAP_TEXT_CONTRAST);
  const cartTerm = readableOn(genre.accent, [T.sea, T.land], MAP_TEXT_CONTRAST);
  const cartTitle = readableOn(T.vintage ? T.ink : genre.titleInk ?? genre.ink, [T.sea, T.land], MAP_TEXT_CONTRAST);
  const cartSub = readableOn(T.vintage ? T.ink : genre.ink, [T.sea, T.land], MAP_TEXT_CONTRAST);
  const cart = interpolate(f, [3, 15], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const title = String(scene.title ?? '').trim();
  const cartouche = (
    <div
      style={{
        position: 'absolute',
        left: 72,
        top: safeTop,
        opacity: cart,
        transform: `translateY(${(1 - cart) * -16}px)`,
      }}
    >
      {look === 'label' ? (
        <div style={{ display: 'inline-block', background: genre.labelBg, padding: '8px 22px 6px', transform: `rotate(${genre.collage ? -1.5 : 0}deg)`, boxShadow: `0 7px 0 ${genre.accent2}` }}>
          <div style={{ fontFamily: FONT[genre.headline], fontWeight: 800, fontSize: 40, lineHeight: 1.05, letterSpacing: '0.04em', color: cartInk, whiteSpace: 'nowrap' }}>{rName}</div>
        </div>
      ) : look === 'terminal' ? (
        <div style={{ fontFamily: FONT.plexMono, fontWeight: 600, fontSize: 30, letterSpacing: '0.1em', color: cartTerm, textShadow: `0 0 14px ${cartTerm}88`, whiteSpace: 'nowrap' }}>
          {`[ ${isTrLoc(locale) ? 'HARİTA' : 'MAP'} ] ${rName}`}
        </div>
      ) : (
        <div style={{ borderLeft: `3px solid ${genre.accent}`, paddingLeft: 18 }}>
          <div
            style={{
              fontFamily: FONT[genre.headline],
              fontWeight: 700,
              fontSize: 34,
              letterSpacing: '0.22em',
              // On a paper chart (epic) the glow title is inked, not lit.
              color: cartTitle,
              textShadow: T.vintage ? `0 0 10px ${T.halo}` : `0 0 20px ${genre.accent}88, 0 2px 8px #000`,
              whiteSpace: 'nowrap',
            }}
          >
            {rName}
          </div>
        </div>
      )}
      {title ? (
        <div
          style={{
            marginTop: look === 'label' ? 18 : 8,
            marginLeft: look === 'glow' ? 21 : 2,
            fontFamily: FONT[genre.body],
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: '0.16em',
            color: cartSub,
            textShadow: T.vintage ? `0 0 8px ${T.halo}, 0 0 2px ${T.halo}` : '0 2px 10px rgba(0,0,0,0.85)',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: r.kind === 'space' && T.vintage ? T.land : T.sea, overflow: 'hidden' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <clipPath id={`landclip${uid}`}>
            <path d={r.land.map((ring) => pathD(ring.map((p) => px(r, p)), true)).join(' ')} />
          </clipPath>
          <pattern id={`lots${uid}`} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={14} stroke={T.coast} strokeOpacity={0.25} strokeWidth={1} />
          </pattern>
          <radialGradient id={`sunglow${uid}`}>
            <stop offset="0%" stopColor={T.vintage ? '#d9902a' : '#ffd27a'} stopOpacity={0.55} />
            <stop offset="100%" stopColor={T.vintage ? '#d9902a' : '#ffb347'} stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`planetshade${uid}`} cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.25} />
            <stop offset="60%" stopColor="#000000" stopOpacity={0} />
            <stop offset="100%" stopColor="#000000" stopOpacity={0.55} />
          </radialGradient>
        </defs>
        <g transform={`translate(${W / 2} ${H / 2}) scale(${cam.z}) translate(${-cam.cx} ${-cam.cy})`}>
          {base}
          {orbitsEl}
          <RegionLabels region={r} theme={T} z={cam.z} locale={locale} />
        </g>
        {routeEl}
        {pointsEl}
        {r.kind === 'space' ? null : <Compass theme={T} x={W - 108} y={safeBottom - 96} o={furn * 0.85} locale={locale} />}
        {scaleEl}
      </svg>
      {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: 0.45 }} /> : null}
      <AbsoluteFill
        style={{
          background: T.vintage
            ? 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(80,50,20,0) 55%, rgba(60,35,12,0.45) 100%)'
            : `radial-gradient(ellipse 80% 75% at 50% 45%, ${genre.accent}10 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)`,
          pointerEvents: 'none',
        }}
      />
      {cartouche}
    </AbsoluteFill>
  );
};

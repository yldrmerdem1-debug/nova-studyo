/*
 * Hand-drawn map data for the `map` scene: simplified coastlines, rivers,
 * borders, walls and relief for the handful of places the stories need. No
 * tiles, no network — every shape is a short list of points, drawn in the
 * genre's ink by src/map.tsx.
 *
 * Geographic regions are plate carrée boxes whose width is scaled by
 * cos(latitude), so a 16:9 frame shows the real shapes; a scene's points are
 * given in the box's normalized 0..1 frame (`regionXY` converts lat/lon). The
 * city schematic (wall-street) and the space map (solar-system) are drawn
 * directly in normalized coordinates.
 *
 * Pure data + two small functions, no React: Node scripts can import it too.
 */
import type { MapRegion, MapScene } from './types';

/** [lon, lat] for geographic regions, [x, y] 0..1 for the city and space maps. */
export type Pt = [number, number];

export interface RiverDef {
  pts: Pt[];
  /** Stroke weight at 1x, px. */
  w?: number;
  label?: string;
  /** Where along the river the label sits, 0..1. */
  at?: number;
}
export interface LabelDef {
  text: string;
  p: Pt;
  /** px at 1x. */
  size: number;
  /** Degrees. */
  rotate?: number;
  kind: 'sea' | 'land' | 'river';
  /** English text (script.locale en-*); falls back to `text`. */
  en?: string;
}
export interface StreetDef {
  pts: Pt[];
  /** Width at 1x, px. */
  w: number;
  name?: string;
  /** Where along the street its name sits, 0..1. */
  at?: number;
}
export interface BuildingDef {
  pts: Pt[];
  kind: 'columns' | 'plain' | 'church';
}
export interface PeakDef {
  p: Pt;
  /** Relative size, 1 = a big volcano / summit. */
  h?: number;
}
export interface RegionDef {
  id: MapRegion;
  /** Cartouche title (Turkish). */
  name: string;
  /** Cartouche title in English (script.locale en-*). */
  nameEn?: string;
  kind: 'geo' | 'city' | 'space';
  /** Geographic box [west, south, east, north]; [0,0,1,1] for normalized maps. */
  box: [number, number, number, number];
  /** Land polygons (geo), drawn with coast ripples. A region with no sea leaves this empty. */
  land: Pt[][];
  /** Water polygons drawn over land (city: the river). */
  water?: Pt[][];
  lakes?: Pt[][];
  rivers?: RiverDef[];
  /** Dashed political borders. */
  borders?: Pt[][];
  /** Highlighted countries (world map), tinted in the focus colour. */
  fills?: Pt[][];
  /** Highlighted countries drawn with their own flag (modern stories, lib/world-map.mjs flagsFit). */
  flagFills?: { flag: string; rings: Pt[][] }[];
  /** Fortification lines, drawn with square towers. */
  walls?: Pt[][];
  /** Walled towns: a hatched, tinted area (their wall goes in `walls`). */
  towns?: Pt[][];
  /** Mountain chains drawn as hachures along the axis. */
  ridges?: Pt[][];
  peaks?: PeakDef[];
  /** Scatter tree glyphs over the land (taiga), clear of ridge crests. */
  forest?: boolean;
  labels: LabelDef[];
  /** Graticule step in degrees (geo only). */
  graticule?: number;
  /** Scale bar length in km (geo only). */
  scaleKm?: number;
  streets?: StreetDef[];
  buildings?: BuildingDef[];
  /** Default camera zoom on a focus point. */
  focusZoom: number;
}

/* ------------------------------------------------------------ helpers */

/** An ellipse as a polygon (lakes, islets). rx/ry in the region's own units. */
function ellipse(cx: number, cy: number, rx: number, ry: number, n = 14, tilt = 0): Pt[] {
  const c = Math.cos(tilt);
  const s = Math.sin(tilt);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return [cx + x * c - y * s, cy + x * s + y * c] as Pt;
  });
}

/* ================================================== US Pacific Northwest */

const PNW: RegionDef = {
  id: 'pacific-northwest',
  name: 'KUZEYBATI PASİFİK',
  nameEn: 'PACIFIC NORTHWEST',
  kind: 'geo',
  box: [-135.3, 37.2, -104.8, 49.6],
  land: [
    [
      [-126.0, 51.0], [-125.0, 50.3], [-124.2, 49.8], [-123.5, 49.4], [-123.2, 49.1], [-122.75, 49.0], [-122.6, 48.8],
      [-122.5, 48.6], [-122.55, 48.35], [-122.3, 48.05], [-122.4, 47.75], [-122.38, 47.55], [-122.45, 47.3], [-122.6, 47.15],
      [-122.9, 47.05], [-123.0, 47.2], [-122.85, 47.35], [-122.7, 47.5], [-122.65, 47.75], [-122.75, 47.95], [-122.8, 48.1],
      [-123.1, 48.12], [-123.5, 48.13], [-124.0, 48.2], [-124.4, 48.3], [-124.72, 48.38], [-124.68, 48.1], [-124.55, 47.85],
      [-124.35, 47.5], [-124.18, 47.15], [-124.1, 46.9], [-124.05, 46.6], [-124.05, 46.3], [-123.95, 46.2], [-123.95, 45.9],
      [-123.97, 45.5], [-124.0, 45.1], [-124.07, 44.6], [-124.12, 44.1], [-124.2, 43.7], [-124.35, 43.35], [-124.52, 42.85],
      [-124.42, 42.45], [-124.22, 42.0], [-124.12, 41.6], [-124.1, 41.1], [-124.25, 40.75], [-124.41, 40.44], [-124.1, 40.1],
      [-123.85, 39.7], [-123.8, 39.3], [-123.7, 38.95], [-123.4, 38.6], [-123.1, 38.3], [-122.97, 38.0], [-122.6, 37.9],
      [-122.5, 37.7], [-122.5, 37.4], [-122.4, 37.2], [-122.0, 36.95], [-121.9, 36.6], [-121.5, 36.0], [-120.7, 35.2],
      [-120.5, 34.5], [-118.5, 34.0], [-100, 30], [-100, 55], [-127, 55],
    ],
    [
      [-123.35, 48.3], [-123.7, 48.35], [-124.1, 48.5], [-124.7, 48.6], [-125.2, 48.85], [-125.9, 49.15], [-126.5, 49.45],
      [-127.2, 49.9], [-127.9, 50.3], [-128.4, 50.8], [-127.5, 50.9], [-126.3, 50.5], [-125.4, 50.1], [-124.9, 49.7],
      [-124.3, 49.4], [-123.9, 49.1], [-123.5, 48.7], [-123.35, 48.45],
    ],
  ],
  lakes: [
    ellipse(-120.04, 39.09, 0.07, 0.19),
    ellipse(-119.55, 40.0, 0.06, 0.17, 12, 0.2),
    ellipse(-112.55, 41.1, 0.32, 0.45, 14, -0.5),
    ellipse(-121.85, 42.4, 0.08, 0.14, 10, 0.4),
  ],
  rivers: [
    {
      pts: [
        [-124.0, 46.25], [-123.6, 46.2], [-123.3, 46.15], [-122.95, 46.1], [-122.8, 45.85], [-122.75, 45.62], [-122.4, 45.57],
        [-122.0, 45.62], [-121.5, 45.7], [-121.2, 45.62], [-120.7, 45.7], [-120.2, 45.72], [-119.6, 45.9], [-119.2, 45.95],
        [-119.05, 46.2], [-119.3, 46.4], [-119.5, 46.7], [-119.9, 46.95], [-120.0, 47.3], [-120.1, 47.6], [-119.8, 47.9],
        [-119.2, 47.95], [-118.6, 47.9], [-118.2, 48.3], [-118.0, 48.7], [-117.6, 49.0], [-117.6, 49.5],
      ],
      w: 3,
      label: 'Columbia',
      at: 0.37,
    },
    {
      pts: [
        [-119.05, 46.23], [-118.6, 46.35], [-118.0, 46.55], [-117.05, 46.42], [-116.95, 46.0], [-116.7, 45.5], [-116.9, 44.9],
        [-117.2, 44.4], [-117.0, 43.8], [-116.4, 43.3], [-115.7, 42.95], [-114.9, 42.75], [-114.4, 42.6], [-113.5, 42.65],
        [-112.8, 42.9], [-112.4, 43.2], [-111.8, 43.6], [-111.0, 43.9],
      ],
      w: 2.2,
      label: 'Snake',
      at: 0.62,
    },
    { pts: [[-122.77, 45.62], [-122.65, 45.35], [-122.85, 45.2], [-123.05, 44.95], [-123.2, 44.6], [-123.1, 44.2], [-122.95, 43.9]], w: 1.6 },
    { pts: [[-122.4, 41.0], [-122.3, 40.6], [-122.2, 40.1], [-122.0, 39.6], [-121.8, 39.2], [-121.6, 38.8], [-121.5, 38.55], [-121.7, 38.1]], w: 1.8 },
  ],
  borders: [
    [[-122.75, 49.0], [-104, 49.0]],
    [[-117.04, 49.0], [-117.04, 46.42]],
    [[-118.98, 46.0], [-116.92, 46.0]],
    [[-117.03, 43.8], [-117.03, 42.0]],
    [[-124.21, 42.0], [-111.05, 42.0]],
    [[-120.0, 42.0], [-120.0, 39.0], [-114.63, 35.0]],
    [[-114.05, 42.0], [-114.05, 37.0]],
    [[-111.05, 42.0], [-111.05, 45.0], [-111.4, 44.7], [-112.8, 44.4], [-113.8, 45.5], [-114.5, 45.6], [-114.4, 46.6], [-115.3, 47.3], [-116.0, 47.9], [-116.05, 49.0]],
    [[-111.05, 41.0], [-109.05, 41.0], [-109.05, 37.0]],
    [[-111.05, 45.0], [-104.05, 45.0]],
  ],
  ridges: [
    [[-121.3, 49.0], [-121.6, 48.2], [-121.5, 47.4], [-121.6, 46.6], [-121.8, 45.8], [-121.8, 45.0], [-121.9, 44.2], [-122.1, 43.2], [-122.2, 42.3], [-122.0, 41.5], [-121.6, 40.6]],
    [[-121.3, 40.2], [-120.6, 39.5], [-120.2, 38.9], [-119.6, 38.2], [-119.0, 37.4]],
    [[-115.8, 48.8], [-115.2, 47.6], [-114.6, 46.5], [-114.3, 45.5], [-113.6, 44.6]],
    [[-111.6, 42.2], [-111.7, 41.2], [-111.6, 40.2], [-111.5, 39.2]],
  ],
  peaks: [
    { p: [-121.76, 46.85], h: 1 },
    { p: [-122.19, 46.19], h: 0.8 },
    { p: [-121.49, 46.2], h: 0.8 },
    { p: [-121.7, 45.37], h: 0.9 },
    { p: [-121.8, 44.67], h: 0.7 },
    { p: [-121.77, 44.1], h: 0.7 },
    { p: [-122.19, 41.41], h: 1 },
    { p: [-121.5, 40.49], h: 0.7 },
    { p: [-121.81, 48.78], h: 0.8 },
  ],
  labels: [
    { text: 'PASİFİK OKYANUSU', en: 'PACIFIC OCEAN', p: [-128.7, 43.6], size: 30, kind: 'sea' },
    { text: 'WASHINGTON', p: [-119.3, 47.25], size: 24, kind: 'land' },
    { text: 'OREGON', p: [-119.9, 44.2], size: 24, kind: 'land' },
    { text: 'KALİFORNİYA', en: 'CALIFORNIA', p: [-122.6, 39.35], size: 22, kind: 'land' },
    { text: 'NEVADA', p: [-117.3, 40.3], size: 24, kind: 'land' },
    { text: 'IDAHO', p: [-114.6, 44.1], size: 24, kind: 'land' },
    { text: 'UTAH', p: [-111.2, 39.3], size: 22, kind: 'land' },
  ],
  graticule: 4,
  scaleKm: 200,
  focusZoom: 2.2,
};

/* ============================================ Constantinople & Bosphorus */

const BOSPHORUS: RegionDef = {
  id: 'bosphorus',
  name: 'KONSTANTİNOPOLİS VE BOĞAZ',
  nameEn: 'CONSTANTINOPLE AND THE BOSPHORUS',
  kind: 'geo',
  box: [28.86, 40.985, 29.143, 41.105],
  land: [
    [
      [28.8, 40.97], [28.86, 40.972], [28.89, 40.982], [28.905, 40.988], [28.922, 40.9925], [28.935, 40.9965], [28.95, 41.0],
      [28.962, 41.0035], [28.972, 41.0045], [28.98, 41.0055], [28.985, 41.0085], [28.9875, 41.012], [28.987, 41.0155],
      [28.983, 41.0175], [28.977, 41.0172], [28.971, 41.0172], [28.966, 41.0198], [28.9605, 41.0232], [28.955, 41.0272],
      [28.9495, 41.0312], [28.9445, 41.0352], [28.9395, 41.0402], [28.9355, 41.0445], [28.9335, 41.0485], [28.9345, 41.053],
      [28.938, 41.058], [28.944, 41.063], [28.952, 41.068], [28.957, 41.0665], [28.951, 41.061], [28.9455, 41.0555],
      [28.9445, 41.0505], [28.9475, 41.0455], [28.952, 41.0415], [28.957, 41.0375], [28.9625, 41.0345], [28.9675, 41.0305],
      [28.972, 41.0265], [28.9755, 41.0232], [28.978, 41.0212], [28.9825, 41.0245], [28.987, 41.0288], [28.9915, 41.0335],
      [28.9975, 41.0375], [29.005, 41.0405], [29.013, 41.0435], [29.021, 41.0455], [29.027, 41.0475], [29.031, 41.052],
      [29.0345, 41.058], [29.038, 41.063], [29.042, 41.068], [29.0435, 41.0735], [29.0445, 41.078], [29.049, 41.0815],
      [29.055, 41.0845], [29.0575, 41.089], [29.0595, 41.095], [29.062, 41.105], [29.06, 41.13], [28.8, 41.13],
    ],
    [
      [29.03, 40.96], [29.03, 40.975], [29.026, 40.98], [29.022, 40.9855], [29.019, 40.991], [29.0185, 40.996], [29.015, 41.0],
      [29.0115, 41.005], [29.0085, 41.0105], [29.0085, 41.0165], [29.0105, 41.0225], [29.0135, 41.0265], [29.019, 41.029],
      [29.0255, 41.0325], [29.0315, 41.0365], [29.0375, 41.041], [29.0425, 41.0455], [29.047, 41.049], [29.051, 41.0535],
      [29.0545, 41.059], [29.0565, 41.0645], [29.058, 41.0705], [29.061, 41.076], [29.0655, 41.0815], [29.068, 41.0875],
      [29.07, 41.095], [29.072, 41.105], [29.075, 41.13], [29.2, 41.13], [29.2, 40.96],
    ],
  ],
  rivers: [{ pts: [[28.952, 41.068], [28.958, 41.075], [28.963, 41.083], [28.965, 41.095], [28.968, 41.105]], w: 1.4 }],
  walls: [
    [[28.9215, 40.9935], [28.9225, 41.0], [28.9235, 41.007], [28.9245, 41.014], [28.926, 41.021], [28.929, 41.028], [28.932, 41.033], [28.934, 41.036], [28.938, 41.04], [28.9405, 41.0425]],
    [[28.978, 41.0215], [28.9725, 41.0262], [28.9735, 41.0285], [28.9765, 41.0283], [28.982, 41.0246]],
  ],
  towns: [
    [[28.978, 41.0215], [28.9755, 41.0232], [28.9725, 41.0262], [28.9735, 41.0285], [28.9765, 41.0283], [28.982, 41.0246]],
    // The walled city inside the land walls, sea walls and the Horn.
    [
      [28.9215, 40.9935], [28.935, 40.9965], [28.95, 41.0], [28.962, 41.0035], [28.972, 41.0045], [28.98, 41.0055], [28.985, 41.0085],
      [28.9875, 41.012], [28.987, 41.0155], [28.983, 41.0175], [28.977, 41.0172], [28.971, 41.0172], [28.966, 41.0198], [28.9605, 41.0232],
      [28.955, 41.0272], [28.9495, 41.0312], [28.9445, 41.0352], [28.9405, 41.0425], [28.938, 41.04], [28.934, 41.036], [28.932, 41.033],
      [28.929, 41.028], [28.926, 41.021], [28.9245, 41.014], [28.9235, 41.007], [28.9225, 41.0],
    ],
  ],
  labels: [
    { text: 'MARMARA DENİZİ', en: 'SEA OF MARMARA', p: [28.992, 40.9905], size: 22, kind: 'sea' },
    { text: 'BOĞAZİÇİ', en: 'BOSPHORUS', p: [29.0425, 41.0575], size: 20, rotate: -54, kind: 'sea' },
    { text: 'HALİÇ', en: 'GOLDEN HORN', p: [28.9585, 41.0305], size: 17, rotate: 45, kind: 'sea' },
  ],
  scaleKm: 1,
  focusZoom: 2.9,
};

/* ====================================================== North Atlantic */

const ATLANTIC: RegionDef = {
  id: 'north-atlantic',
  name: 'KUZEY ATLANTİK',
  nameEn: 'NORTH ATLANTIC',
  kind: 'geo',
  box: [-80, 32.7, 12, 66.3],
  land: [
    [
      [-78.0, 33.9], [-77.0, 34.6], [-76.5, 34.9], [-75.5, 35.2], [-75.6, 36.0], [-75.9, 36.9], [-75.6, 37.9], [-75.1, 38.6],
      [-74.9, 38.95], [-74.4, 39.4], [-74.05, 40.1], [-74.0, 40.5], [-73.95, 40.7], [-73.8, 40.85], [-72.9, 41.2], [-71.9, 41.35],
      [-71.2, 41.5], [-70.7, 41.55], [-70.0, 41.65], [-69.95, 41.95], [-70.2, 42.05], [-70.6, 42.2], [-70.9, 42.6], [-70.7, 43.1],
      [-70.2, 43.6], [-69.5, 43.9], [-68.5, 44.3], [-67.5, 44.5], [-67.0, 44.9], [-66.1, 45.3], [-65.0, 45.6], [-64.4, 45.8],
      [-64.9, 45.35], [-65.8, 44.7], [-66.2, 44.2], [-65.7, 43.5], [-64.6, 44.1], [-63.6, 44.6], [-62.5, 44.9], [-61.2, 45.3],
      [-60.2, 45.6], [-59.9, 46.0], [-60.4, 46.9], [-61.0, 46.6], [-61.5, 45.9], [-62.5, 45.7], [-63.5, 45.9], [-64.6, 46.3],
      [-64.8, 47.0], [-65.2, 47.9], [-64.5, 48.4], [-65.5, 49.2], [-66.5, 49.1], [-68.0, 48.6], [-69.5, 47.8], [-70.5, 47.2],
      [-69.8, 48.0], [-68.5, 49.2], [-67.2, 49.6], [-65.0, 50.2], [-62.0, 50.25], [-60.0, 50.2], [-58.0, 51.2], [-57.1, 51.5],
      [-55.8, 52.2], [-56.0, 53.5], [-57.5, 54.5], [-59.0, 55.2], [-60.5, 55.8], [-61.5, 56.7], [-62.0, 57.6], [-63.0, 58.5],
      [-64.2, 59.5], [-64.8, 60.3], [-65.5, 60.0], [-67.5, 58.5], [-69.3, 59.0], [-70.0, 60.5], [-73.0, 62.2], [-77.5, 62.5],
      [-78.5, 61.0], [-80.5, 60.0], [-86, 60], [-86, 33.8],
    ],
    [
      [-59.4, 47.6], [-58.5, 48.5], [-58.8, 49.0], [-57.9, 49.9], [-57.3, 50.6], [-56.0, 51.6], [-55.4, 51.5], [-55.9, 50.8],
      [-55.5, 50.0], [-54.5, 49.6], [-53.5, 49.3], [-53.1, 48.6], [-53.6, 48.1], [-52.8, 47.7], [-52.65, 47.3], [-53.1, 46.65],
      [-53.6, 46.7], [-54.0, 47.6], [-54.6, 47.4], [-55.3, 46.9], [-55.8, 47.0], [-56.1, 47.6], [-57.7, 47.6],
    ],
    [
      [-43.9, 59.8], [-45.2, 60.2], [-47.5, 60.8], [-49.0, 61.6], [-50.3, 62.8], [-51.5, 64.0], [-52.2, 65.2], [-53.5, 66.5],
      [-54, 70], [-20, 70], [-22, 68], [-26, 68.2], [-32, 68.2], [-34.5, 66.3], [-37.5, 65.6], [-40.1, 65.0], [-41.0, 63.5],
      [-42.5, 61.9], [-43.2, 60.7],
    ],
    [
      [-22.7, 63.8], [-21.0, 63.85], [-19.0, 63.45], [-17.0, 63.8], [-15.0, 64.3], [-13.6, 65.1], [-14.6, 65.8], [-15.5, 66.45],
      [-17.5, 66.1], [-19.2, 66.1], [-21.0, 66.2], [-22.4, 66.4], [-23.6, 66.1], [-24.4, 65.5], [-22.5, 65.4], [-24.0, 64.9],
      [-22.3, 64.4],
    ],
    [
      [-5.7, 50.05], [-5.05, 50.0], [-4.2, 50.35], [-3.5, 50.5], [-2.4, 50.62], [-1.9, 50.7], [-1.4, 50.83], [-0.8, 50.78],
      [0.3, 50.75], [1.0, 50.95], [1.4, 51.15], [1.4, 51.38], [0.8, 51.55], [1.3, 51.9], [1.7, 52.5], [1.6, 52.9], [0.2, 52.9],
      [0.3, 53.4], [0.1, 53.6], [-0.4, 54.2], [-1.2, 54.6], [-1.6, 55.4], [-2.0, 55.8], [-2.6, 56.05], [-2.6, 56.3], [-2.8, 56.6],
      [-2.0, 57.1], [-1.8, 57.6], [-3.3, 57.7], [-3.0, 58.6], [-4.5, 58.6], [-5.0, 58.6], [-5.3, 58.2], [-5.7, 57.5], [-5.6, 56.8],
      [-6.1, 56.3], [-5.6, 55.8], [-5.1, 55.3], [-4.8, 54.8], [-3.6, 54.9], [-3.3, 54.4], [-3.0, 53.8], [-3.1, 53.4], [-4.1, 53.3],
      [-4.6, 52.8], [-4.1, 52.4], [-4.3, 52.0], [-5.2, 51.8], [-4.6, 51.6], [-3.3, 51.4], [-3.0, 51.2], [-4.2, 51.2], [-4.7, 50.95],
      [-5.2, 50.6],
    ],
    [
      [-6.0, 52.2], [-6.4, 52.18], [-7.0, 52.1], [-7.6, 51.9], [-8.3, 51.8], [-9.0, 51.55], [-9.8, 51.45], [-10.3, 51.9],
      [-9.9, 52.5], [-9.5, 52.6], [-9.9, 53.4], [-10.1, 53.9], [-9.6, 54.3], [-8.5, 54.3], [-8.7, 54.7], [-8.2, 55.1],
      [-7.3, 55.35], [-6.1, 55.2], [-5.7, 54.7], [-5.9, 54.2], [-6.1, 53.5], [-6.2, 53.0],
    ],
    [
      [16, 56], [12.6, 56.0], [10.6, 56.3], [10.4, 57.0], [10.6, 57.7], [9.6, 57.3], [8.6, 57.1], [8.1, 56.6], [8.2, 55.6], [8.6, 55.0],
      [8.9, 54.6], [8.6, 53.9], [8.2, 53.6], [6.9, 53.5], [5.0, 53.4], [4.8, 52.9], [4.5, 52.2], [4.0, 51.9], [3.4, 51.4], [2.5, 51.08], [1.6, 50.9], [1.55, 50.2], [0.2, 49.7],
      [0.1, 49.45], [-0.3, 49.3], [-1.1, 49.35], [-1.3, 49.7], [-1.62, 49.66], [-1.9, 49.7], [-1.6, 48.8], [-1.4, 48.65],
      [-2.3, 48.6], [-3.0, 48.8], [-4.0, 48.7], [-4.8, 48.4], [-4.3, 48.1], [-4.4, 47.8], [-3.3, 47.7], [-2.5, 47.3], [-2.1, 46.9],
      [-1.8, 46.5], [-1.2, 46.1], [-1.2, 45.6], [-1.2, 44.6], [-1.45, 43.6], [-1.8, 43.35], [-3.0, 43.4], [-4.5, 43.4], [-6.0, 43.6],
      [-7.5, 43.75], [-8.3, 43.4], [-9.3, 43.0], [-8.9, 42.0], [-8.8, 41.2], [-9.0, 40.2], [-9.4, 39.4], [-9.5, 38.75], [-8.9, 38.5],
      [-8.8, 37.9], [-9.0, 37.0], [-8.0, 37.0], [-7.4, 37.2], [-6.4, 36.8], [-6.1, 36.3], [-5.6, 36.0], [-5.3, 36.15], [-4.4, 36.7],
      [-2.0, 36.7], [-0.7, 37.6], [0.2, 38.7], [-0.3, 39.4], [0.9, 40.8], [3.2, 41.9], [3.1, 42.5], [4.0, 43.5], [5.3, 43.3],
      [6.6, 43.1], [7.5, 43.8], [8.8, 44.4], [10.2, 43.9], [10.5, 42.9], [11.2, 42.4], [12.3, 41.7], [14, 41], [16, 40],
    ],
    [
      [-10, 30], [-9.8, 31.5], [-9.3, 32.5], [-8.5, 33.3], [-7.5, 33.7], [-6.8, 34.1], [-6.2, 35.2], [-5.9, 35.8], [-5.3, 35.9],
      [-4.4, 35.2], [-2.0, 35.1], [-0.6, 35.7], [1.0, 36.5], [3.0, 36.8], [6.0, 36.9], [8.6, 36.9], [10.3, 37.2], [11.0, 36.8], [10.5, 36.0], [11.1, 35.2], [16, 34], [16, 30],
    ],
    [
      [4.9, 60.5], [5.0, 59.3], [5.6, 58.8], [6.8, 58.1], [8.2, 58.1], [9.5, 58.9], [10.6, 59.1], [11.2, 59.1], [11.9, 57.7],
      [12.9, 55.5], [16, 55.5], [16, 64], [12, 64], [10, 63.5], [8, 63], [6, 62.5], [5, 61.5],
    ],
    ellipse(9.1, 42.1, 0.35, 0.5, 12),
    ellipse(9.0, 40.0, 0.45, 0.75, 12),
    ellipse(-25.6, 37.8, 0.45, 0.12, 10),
    ellipse(-28.3, 38.5, 0.3, 0.1, 10),
    ellipse(-27.2, 38.7, 0.25, 0.08, 10),
    ellipse(-31.1, 39.45, 0.12, 0.1, 8),
  ],
  labels: [
    { text: 'KUZEY ATLANTİK OKYANUSU', en: 'NORTH ATLANTIC OCEAN', p: [-36, 46.5], size: 34, kind: 'sea' },
    { text: 'KUZEY AMERİKA', en: 'NORTH AMERICA', p: [-74, 52.5], size: 26, kind: 'land' },
    { text: 'AVRUPA', en: 'EUROPE', p: [2.2, 46.8], size: 24, kind: 'land' },
    { text: 'GRÖNLAND', en: 'GREENLAND', p: [-43, 63.8], size: 22, kind: 'land' },
  ],
  graticule: 10,
  scaleKm: 1000,
  focusZoom: 2.4,
};

/* ================================================= Northern Urals */

const URALS: RegionDef = {
  id: 'urals',
  name: 'KUZEY URALLAR',
  nameEn: 'NORTHERN URALS',
  kind: 'geo',
  box: [56.68, 60.35, 63.32, 62.15],
  land: [],
  rivers: [
    {
      pts: [
        [59.52, 61.87], [59.6, 61.78], [59.72, 61.68], [59.85, 61.55], [59.95, 61.45], [60.1, 61.35], [60.25, 61.25], [60.35, 61.12],
        [60.42, 60.95], [60.5, 60.8], [60.55, 60.68], [60.8, 60.55], [61.2, 60.45],
      ],
      w: 2.6,
      label: 'Lozva',
      at: 0.72,
    },
    { pts: [[59.44, 61.73], [59.55, 61.69], [59.7, 61.63], [59.82, 61.58], [59.9, 61.52], [59.96, 61.455]], w: 1.8, label: 'Auspiya', at: 0.5 },
    { pts: [[59.6, 61.1], [59.9, 60.95], [60.2, 60.82], [60.42, 60.72], [60.55, 60.68]], w: 1.6 },
    { pts: [[59.7, 61.36], [60.0, 61.29], [60.3, 61.23], [60.34, 61.2]], w: 1.4 },
    { pts: [[59.15, 62.1], [58.8, 61.9], [58.5, 61.75], [58.1, 61.8], [57.6, 61.95], [57.0, 62.0]], w: 2 },
    { pts: [[59.05, 61.2], [58.6, 61.0], [58.1, 60.9], [57.5, 60.8], [57.0, 60.75]], w: 2 },
  ],
  ridges: [
    [[59.3, 62.2], [59.38, 61.95], [59.42, 61.8], [59.36, 61.6], [59.25, 61.4], [59.15, 61.2], [59.1, 61.0], [59.05, 60.8], [59.0, 60.6], [58.95, 60.3]],
  ],
  peaks: [
    { p: [59.4, 61.88], h: 1 },
    { p: [59.46, 61.754], h: 0.9 },
    { p: [59.33, 61.58], h: 0.8 },
    { p: [59.2, 61.33], h: 0.9 },
    { p: [59.12, 61.08], h: 0.8 },
    { p: [59.06, 60.82], h: 0.9 },
  ],
  forest: true,
  labels: [
    { text: 'URAL DAĞLARI', en: 'URAL MOUNTAINS', p: [58.75, 61.2], size: 26, rotate: -84, kind: 'land' },
    { text: 'TAYGA', en: 'TAIGA', p: [61.7, 61.55], size: 24, kind: 'land' },
  ],
  graticule: 0.5,
  scaleKm: 20,
  focusZoom: 2.3,
};

/* ================================================= Wall Street, 1929 */

const WALL_STREET: RegionDef = {
  id: 'wall-street',
  name: 'WALL STREET · MANHATTAN',
  kind: 'city',
  box: [0, 0, 1, 1],
  land: [],
  water: [[[0.925, -0.05], [1.05, -0.05], [1.05, 1.05], [0.86, 1.05], [0.875, 0.8], [0.9, 0.5], [0.915, 0.2]]],
  streets: [
    { pts: [[0.105, -0.05], [0.1, 0.5], [0.085, 1.05]], w: 40, name: 'BROADWAY', at: 0.2 },
    { pts: [[0.1, 0.47], [0.93, 0.47]], w: 34, name: 'WALL STREET', at: 0.66 },
    { pts: [[0.34, -0.05], [0.34, 0.47]], w: 26, name: 'NASSAU ST.', at: 0.3 },
    { pts: [[0.34, 0.47], [0.35, 1.05]], w: 44, name: 'BROAD ST.', at: 0.62 },
    { pts: [[0.22, 0.47], [0.225, 0.86]], w: 18 },
    { pts: [[0.52, -0.05], [0.525, 1.05]], w: 24, name: 'WILLIAM ST.', at: 0.2 },
    { pts: [[0.665, -0.05], [0.64, 1.05]], w: 22, name: 'PEARL ST.', at: 0.78 },
    { pts: [[0.76, -0.05], [0.74, 1.05]], w: 22, name: 'WATER ST.', at: 0.2 },
    { pts: [[0.84, -0.05], [0.815, 1.05]], w: 18 },
    { pts: [[0.905, -0.05], [0.855, 1.05]], w: 20, name: 'SOUTH ST.', at: 0.8 },
    { pts: [[0.1, 0.3], [0.9, 0.3]], w: 22, name: 'PINE ST.', at: 0.62 },
    { pts: [[0.1, 0.14], [0.9, 0.14]], w: 20, name: 'CEDAR ST.', at: 0.62 },
    { pts: [[0.1, -0.01], [0.9, -0.01]], w: 20 },
    { pts: [[0.1, 0.64], [0.6, 0.64]], w: 20, name: 'EXCHANGE PL.', at: 0.62 },
    { pts: [[0.09, 0.8], [0.655, 0.8]], w: 22, name: 'BEAVER ST.', at: 0.62 },
    { pts: [[0.35, 0.93], [0.645, 0.93]], w: 16 },
  ],
  buildings: [
    { pts: [[0.238, 0.5], [0.318, 0.5], [0.318, 0.615], [0.238, 0.615]], kind: 'columns' },
    { pts: [[0.365, 0.495], [0.43, 0.495], [0.43, 0.565], [0.365, 0.565]], kind: 'plain' },
    { pts: [[0.365, 0.36], [0.45, 0.36], [0.45, 0.445], [0.365, 0.445]], kind: 'columns' },
    { pts: [[0.018, 0.415], [0.072, 0.415], [0.072, 0.525], [0.018, 0.525]], kind: 'church' },
  ],
  labels: [{ text: 'EAST RIVER', p: [0.962, 0.52], size: 24, rotate: -84, kind: 'sea' }],
  focusZoom: 1.9,
};

/* ================================================= The Solar System */

/** Where the Sun sits on the space map, normalized. */
export const SUN: Pt = [0.075, 0.6];
/** Default orbit radius per planet, px on the 1920-wide frame (log-ish, not to scale). */
export const ORBITS: { name: string; nameEn: string; keys: string[]; r: number; size: number; color: string; ring?: boolean }[] = [
  { name: 'Merkür', nameEn: 'Mercury', keys: ['merkür', 'merkur', 'mercury'], r: 44, size: 4, color: '#b9a99a' },
  { name: 'Venüs', nameEn: 'Venus', keys: ['venüs', 'venus'], r: 64, size: 6, color: '#e8c98f' },
  { name: 'Dünya', nameEn: 'Earth', keys: ['dünya', 'dunya', 'earth'], r: 88, size: 7, color: '#5fa8e8' },
  { name: 'Mars', nameEn: 'Mars', keys: ['mars'], r: 120, size: 5.5, color: '#d9643a' },
  { name: 'Jüpiter', nameEn: 'Jupiter', keys: ['jüpiter', 'jupiter'], r: 300, size: 19, color: '#d8b48a' },
  { name: 'Satürn', nameEn: 'Saturn', keys: ['satürn', 'saturn'], r: 520, size: 15, color: '#e3cf98', ring: true },
  { name: 'Uranüs', nameEn: 'Uranus', keys: ['uranüs', 'uranus'], r: 830, size: 11, color: '#9fdde3' },
  { name: 'Neptün', nameEn: 'Neptune', keys: ['neptün', 'neptun', 'neptune'], r: 1180, size: 11, color: '#5a7fe0' },
];

const SOLAR: RegionDef = {
  id: 'solar-system',
  name: 'GÜNEŞ SİSTEMİ',
  nameEn: 'SOLAR SYSTEM',
  kind: 'space',
  box: [0, 0, 1, 1],
  land: [],
  labels: [],
  focusZoom: 2.0,
};

const isEn = (locale?: string) => !String(locale ?? 'tr').toLowerCase().startsWith('tr');
/** The cartouche title in the script's language. */
export const regionName = (r: RegionDef, locale?: string) => (isEn(locale) && r.nameEn ? r.nameEn : r.name);
/** A map label in the script's language. */
export const labelText = (l: LabelDef, locale?: string) => (isEn(locale) && l.en ? l.en : l.text);

/** The world map with nothing filled yet (scene.geo missing): sea, pins and route only. */
const WORLD: RegionDef = {
  id: 'world',
  name: '',
  kind: 'geo',
  box: [-180, -60, 180, 80],
  land: [],
  labels: [],
  focusZoom: 2.0,
};

export const REGIONS: Record<MapRegion, RegionDef> = {
  'pacific-northwest': PNW,
  bosphorus: BOSPHORUS,
  'north-atlantic': ATLANTIC,
  urals: URALS,
  'wall-street': WALL_STREET,
  'solar-system': SOLAR,
  world: WORLD,
};

/**
 * The region a map scene draws: a hand-drawn one, or for 'world' the scene's
 * own box with the coast, borders and tinted countries lib/world-map.mjs
 * clipped into `scene.geo` (Natural Earth).
 */
export function regionOf(scene: MapScene): RegionDef {
  if (scene.region !== 'world') return REGIONS[scene.region] ?? REGIONS['north-atlantic'];
  const box = Array.isArray(scene.box) && scene.box.length === 4 && scene.box.every(Number.isFinite) && scene.box[2] > scene.box[0] && scene.box[3] > scene.box[1] ? scene.box : WORLD.box;
  const g = scene.geo;
  const wide = box[2] - box[0];
  return {
    ...WORLD,
    name: String(g?.name ?? scene.mapName ?? '').toUpperCase(),
    box,
    land: (g?.land ?? []) as Pt[][],
    borders: (g?.borders ?? []) as Pt[][],
    fills: (g?.fills ?? []) as Pt[][],
    ...(g?.flagFills?.length ? { flagFills: g.flagFills as { flag: string; rings: Pt[][] }[] } : {}),
    labels: (g?.labels ?? []).map((l) => ({ text: l.text, p: [l.lon, l.lat] as Pt, size: l.size, kind: 'land' as const })),
    graticule: g?.graticule,
    // A scale bar only where kilometres mean something (not on a hemisphere).
    scaleKm: wide <= 60 ? 1 : undefined,
    // A tinted country is the point of the map: the camera keeps it whole with its neighbours (Poland filled the frame at 2x).
    focusZoom: g?.fills?.length ? 1.3 : wide < 12 ? 1.6 : 2.0,
  };
}

/** A region point (lon/lat for geo maps, already normalized otherwise) -> normalized 0..1 of the frame. */
export function project(r: RegionDef, p: Pt): Pt {
  if (r.kind !== 'geo') return p;
  const [w, s, e, n] = r.box;
  return [(p[0] - w) / (e - w), (n - p[1]) / (n - s)];
}

/** For script authors: lat/lon -> the `{x, y}` a map scene's point takes. */
export function regionXY(region: MapRegion, lat: number, lon: number): { x: number; y: number } {
  const [x, y] = project(REGIONS[region], [lon, lat]);
  return { x: +x.toFixed(4), y: +y.toFixed(4) };
}

/** Kilometres per normalized unit of frame width (scale bars). */
export function kmPerWidth(r: RegionDef): number {
  const [w, s, e, n] = r.box;
  const lat0 = ((s + n) / 2) * (Math.PI / 180);
  return (e - w) * 111.32 * Math.cos(lat0);
}

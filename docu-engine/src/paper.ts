/*
 * Procedural paper, drawn once per render tab on a canvas and handed out as a
 * data URL (shown through Remotion's <Img>, which waits for it to decode, so
 * no frame is ever captured with the texture missing). Seeded: every tab
 * draws the identical sheet, so chunks rendered in parallel match.
 */

/** mulberry32: a tiny seeded PRNG. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const cache = new Map<string, string>();

export interface PaperOpts {
  /** Base tone of the sheet. */
  tone: string;
  /** Canvas size in px (stretched by the caller). */
  w: number;
  h: number;
  /** 0..1: brown stains, foxing and edge burn. */
  age: number;
  /** Fold creases, as fractions of the height (a broadsheet folds at 0.5). */
  folds?: number[];
  /** Coffee/water rings (off for maps: a ring reads as a mark on the chart). */
  rings?: boolean;
}

/**
 * An aged sheet: fibre noise, a few soft stains, foxing specks, darker burnt
 * edges and optional fold creases. Returns '' outside a browser.
 */
export function paperTexture(seed: string, o: PaperOpts): string {
  const key = `${seed}|${o.tone}|${o.w}x${o.h}|${o.age}|${(o.folds ?? []).join(',')}|${o.rings !== false}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = o.w;
  c.height = o.h;
  const g = c.getContext('2d');
  if (!g) return '';
  const r = rng(seed);
  const [br, bg, bb] = hex(o.tone);
  g.fillStyle = o.tone;
  g.fillRect(0, 0, o.w, o.h);

  // Large soft blotches: uneven yellowing.
  for (let i = 0; i < 14; i++) {
    const x = r() * o.w;
    const y = r() * o.h;
    const rad = (0.15 + r() * 0.35) * Math.max(o.w, o.h);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = (0.05 + r() * 0.08) * o.age;
    const dark = r() > 0.35;
    grd.addColorStop(0, dark ? `rgba(120,80,30,${a})` : `rgba(255,250,235,${a * 0.9})`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, o.w, o.h);
  }
  // A couple of water/coffee rings.
  for (let i = 0; i < (o.rings === false ? 0 : Math.round(2 * o.age)); i++) {
    const x = r() * o.w;
    const y = r() * o.h;
    const rad = (0.04 + r() * 0.06) * o.w;
    g.strokeStyle = `rgba(110,70,25,${0.08 + r() * 0.06})`;
    g.lineWidth = 2 + r() * 3;
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.85 + r() * 0.2), r() * 3, 0, Math.PI * 2);
    g.stroke();
  }
  // Fibre noise, per pixel.
  const img = g.getImageData(0, 0, o.w, o.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * 22 + (r() - 0.5) * 10;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.9));
  }
  g.putImageData(img, 0, 0);
  // Fibres.
  for (let i = 0; i < (o.w * o.h) / 900; i++) {
    const x = r() * o.w;
    const y = r() * o.h;
    const len = 3 + r() * 14;
    const a = r() * Math.PI;
    g.strokeStyle = r() > 0.5 ? `rgba(${br - 60},${bg - 60},${bb - 60},0.10)` : 'rgba(255,255,255,0.12)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // Foxing: small rusty specks.
  for (let i = 0; i < 90 * o.age; i++) {
    const x = r() * o.w;
    const y = r() * o.h;
    const rad = 0.6 + r() * 2.6;
    g.fillStyle = `rgba(130,80,35,${0.12 + r() * 0.25})`;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // Burnt, darker edges.
  const edge = Math.max(o.w, o.h) * 0.08;
  const sides: [number, number, number, number, number, number, number, number][] = [
    [0, 0, edge, 0, 0, 0, edge, o.h],
    [o.w, 0, o.w - edge, 0, o.w - edge, 0, edge, o.h],
    [0, 0, 0, edge, 0, 0, o.w, edge],
    [0, o.h, 0, o.h - edge, 0, o.h - edge, o.w, edge],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of sides) {
    const grd = g.createLinearGradient(x0, y0, x1, y1);
    grd.addColorStop(0, `rgba(110,70,30,${0.28 * o.age})`);
    grd.addColorStop(1, 'rgba(110,70,30,0)');
    g.fillStyle = grd;
    g.fillRect(rx, ry, rw, rh);
  }
  // Fold creases: a dark valley with a light ridge beside it.
  for (const fy of o.folds ?? []) {
    const y = fy * o.h;
    const grd = g.createLinearGradient(0, y - 18, 0, y + 18);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.45, 'rgba(80,55,25,0.16)');
    grd.addColorStop(0.5, 'rgba(60,40,20,0.28)');
    grd.addColorStop(0.56, 'rgba(255,255,255,0.22)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, y - 18, o.w, 36);
  }
  const url = c.toDataURL('image/jpeg', 0.9);
  cache.set(key, url);
  return url;
}

/** Deterministic PRNG for layout (greeked text, tree glyphs): same seed, same page. */
export const seededRng = rng;

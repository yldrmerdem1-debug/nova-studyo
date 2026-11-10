/*
 * World map for the `map` scene (region 'world'): any place on Earth, not only
 * the four hand-drawn regions of src/geo.ts. The outlier channels open with a
 * map in the first minute (Zimbabwe lit up, Bronze Age raids spreading, Harare
 * flying in); our four videos of Oct 2026 had none because the writer could
 * only pick pacific-northwest / bosphorus / north-atlantic / urals.
 *
 * Data: Natural Earth (public domain) via world-atlas 2.0.2 TopoJSON in
 * lib/data (50m for wide views, 10m when the box is under 30° wide).
 *
 * The pipeline writes `region: 'world'`, `box` [west, south, east, north]
 * (worldBox, 16:9 true-shape plate carrée like geo.ts) and points in that
 * box's 0..1 frame; before render `attachWorldMaps` clips the coast, the
 * shared borders and the highlighted countries to the box into `scene.geo`,
 * so the props carry only what the frame shows and the engine stays pure.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const RAD = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------- the box */

/**
 * A 16:9 box around the places that shows their real shapes (width in degrees
 * scaled by 1/cos(latitude), as geo.ts projects). `minSpan`: the smallest
 * north–south extent in degrees — one city still shows its country and coast.
 * `clusterSpan` (the pins of a place map): several places close together (a
 * valley, one city's districts) are framed on themselves, down to this extent —
 * Kartal (24 Oct 2026) squeezed five pins within 0.4° into a 7° × 18.5° box and
 * their labels sat on top of each other.
 */
export function worldBox(places, { minSpan = 7, pad = 1.8, clusterSpan = null } = {}) {
  const pts = (places || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  if (!pts.length) return null;
  let lons = pts.map((p) => p.lon);
  // Places on both sides of the date line: measure across it.
  if (Math.max(...lons) - Math.min(...lons) > 180) lons = lons.map((l) => (l < 0 ? l + 360 : l));
  const lats = pts.map((p) => p.lat);
  const lat0 = (Math.max(...lats) + Math.min(...lats)) / 2;
  const lon0 = (Math.max(...lons) + Math.min(...lons)) / 2;
  const c = Math.max(0.2, Math.cos(lat0 * RAD));
  const span = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * c);
  // The cluster fills at least a quarter of the frame; a single place keeps minSpan.
  const least = clusterSpan > 0 && pts.length > 1 ? Math.min(minSpan, Math.max(clusterSpan, span * 4)) : minSpan;
  let hs = Math.max(least, (Math.max(...lats) - Math.min(...lats)) * pad, (Math.max(...lons) - Math.min(...lons)) * c * (9 / 16) * pad);
  hs = Math.min(hs, 140);
  let ws = (hs * 16) / 9 / c;
  if (ws > 360) {
    ws = 360;
    hs = ws * c * (9 / 16);
  }
  let s = lat0 - hs / 2;
  let n = lat0 + hs / 2;
  if (n > 84) {
    s -= n - 84;
    n = 84;
  }
  if (s < -80) {
    n += -80 - s;
    s = -80;
  }
  let w = lon0 - ws / 2;
  let e = lon0 + ws / 2;
  if (lon0 > 180) {
    w -= 360;
    e -= 360;
  }
  return [r3(w), r3(s), r3(e), r3(n)];
}

/** lat/lon -> the box's normalized frame (geo.ts `project`). */
export function worldXY(box, lat, lon) {
  const [w, s, e, n] = box;
  let L = lon;
  if (L < w) L += 360;
  else if (L > e) L -= 360;
  return { x: +((L - w) / (e - w)).toFixed(4), y: +((n - lat) / (n - s)).toFixed(4) };
}

/* ------------------------------------------------------------ the data */

/*
 * DATE LINE (submarine collision, 25 Oct 2026): a ring cut at the date line jumps from 180 to -180 and back — Eurasia
 * at Chukotka (65-69°N), Wrangel, Fiji. On the flat frame each jump is a line across the whole world, and Eurasia's
 * ring closed a band of "land" from -180 to 180 between 65°N and 69°N: over Iceland's north, Norway and the open sea
 * (countryAt put Bodø, Akureyri and 67°N 10°W in Russia). The ring runs on past 180 instead, its middle kept on this
 * side; worldGeometry and countryAt also look a world away. A ring round a pole (Antarctica) closes across the world
 * on purpose and stays as it is.
 */
function unwrap(ring) {
  let d = 0;
  let moved = false;
  const out = new Array(ring.length);
  for (let j = 0; j < ring.length; j++) {
    const [x, y] = ring[j];
    if (j) {
      const prev = out[j - 1][0];
      while (x + d - prev > 180) d -= 360;
      while (x + d - prev < -180) d += 360;
    }
    if (d) moved = true;
    out[j] = d ? [x + d, y] : ring[j];
  }
  if (!moved || Math.abs(out[out.length - 1][0] - out[0][0]) > 180) return ring;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x] of out) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const mid = (lo + hi) / 2;
  const back = mid > 180 ? -360 : mid < -180 ? 360 : 0;
  return back ? out.map(([x, y]) => [x + back, y]) : out;
}

const cache = new Map();
function topo(res) {
  if (cache.has(res)) return cache.get(res);
  const t = JSON.parse(readFileSync(join(DATA, `countries-${res}.json`), 'utf8'));
  const [sx, sy] = t.transform.scale;
  const [tx, ty] = t.transform.translate;
  const arcs = t.arcs.map((a) => {
    let x = 0;
    let y = 0;
    return a.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  });
  const ringOf = (idx) => {
    const out = [];
    idx.forEach((i, k) => {
      const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      for (let j = k ? 1 : 0; j < a.length; j++) out.push(a[j]);
    });
    return unwrap(out);
  };
  const polysOf = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []).map((poly) => poly.map(ringOf));
  // An arc two countries share is a land border; one used once is coast.
  const use = new Map();
  for (const g of t.objects.countries.geometries) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    for (const poly of polys) for (const ring of poly) for (const i of ring) use.set(i < 0 ? ~i : i, (use.get(i < 0 ? ~i : i) || 0) + 1);
  }
  const borders = [...use].filter(([, n]) => n >= 2).map(([i]) => arcs[i]);
  const land = t.objects.land.geometries.flatMap(polysOf).flat();
  const countries = t.objects.countries.geometries.map((g) => ({ name: g.properties?.name || '', polys: polysOf(g) }));
  const out = { land, borders, countries };
  cache.set(res, out);
  return out;
}

/* ------------------------------------------------------- country names */

const fold = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Everyday names -> Natural Earth's. */
const ALIASES = {
  usa: 'united states of america', us: 'united states of america', 'united states': 'united states of america', america: 'united states of america', 'u s': 'united states of america',
  uk: 'united kingdom', britain: 'united kingdom', 'great britain': 'united kingdom', england: 'united kingdom', scotland: 'united kingdom', wales: 'united kingdom', 'northern ireland': 'united kingdom',
  'czech republic': 'czechia', 'ivory coast': 'cote d ivoire', drc: 'dem rep congo', 'democratic republic of the congo': 'dem rep congo', 'dr congo': 'dem rep congo',
  'republic of the congo': 'congo', 'south sudan': 's sudan', 'north macedonia': 'macedonia', 'bosnia': 'bosnia and herz', 'bosnia and herzegovina': 'bosnia and herz',
  burma: 'myanmar', 'east timor': 'timor leste', swaziland: 'eswatini', 'central african republic': 'central african rep', 'dominican republic': 'dominican rep',
  'equatorial guinea': 'eq guinea', 'western sahara': 'w sahara', uae: 'united arab emirates', 'emirates': 'united arab emirates', holland: 'netherlands', 'the netherlands': 'netherlands',
  'soviet union': 'russia', ussr: 'russia', 'russian federation': 'russia', persia: 'iran', 'korea': 'south korea', 'republic of korea': 'south korea', 'north korea': 'north korea', dprk: 'north korea',
  'gaza': 'palestine', 'west bank': 'palestine', 'cape verde': 'cabo verde', 'vatican city': 'vatican', 'turkiye': 'turkey', 'faroe islands': 'faeroe is', 'solomon islands': 'solomon is',
};

/** The Natural Earth country for a written name, or null. */
export function findCountry(name, res = '50m') {
  const k = fold(name);
  if (!k) return null;
  // A bare "Congo" is the DRC (see countriesIn); "Republic of the Congo" reaches Natural Earth's "Congo" by its alias.
  const want = k === 'congo' ? 'dem rep congo' : ALIASES[k] || k;
  const list = topo(res).countries;
  return list.find((c) => fold(c.name) === want) || null;
}

/* ---------------------------------------------- the country under a pin */

/** Even–odd ray test: is (x, y) inside the ring? */
function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const ringBox = new WeakMap();
/** A ring's [minX, minY, maxX, maxY], measured once (the rings live as long as the topology). */
function boxOf(ring) {
  let b = ringBox.get(ring);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of ring) {
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
    ringBox.set(ring, b);
  }
  return b;
}

/**
 * The Natural Earth country a place stands in (its name), or null at sea. 10m by default: Berchtesgaden and the
 * Kehlstein sit a few kilometres from the Austrian border, which only the fine borders draw where it is.
 * KARTAL (24 Oct 2026): four of the route map's five pins were in Germany, Germany fell off the map (the narration only
 * said "the Austrian border") and the map was named AUSTRIA under an Austrian flag — nothing knew which country a pin
 * stands in.
 */
export function countryAt(lat, lon, res = '10m') {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const c of topo(res).countries) {
    for (const poly of c.polys) {
      if (!poly[0]?.length) continue;
      const b = boxOf(poly[0]);
      if (lat < b[1] || lat > b[3]) continue;
      // A ring past the date line (Chukotka, Fiji) holds the place a world away.
      for (const L of [lon, lon - 360, lon + 360]) {
        if (L < b[0] || L > b[2]) continue;
        // The outer ring and its holes (Lesotho in South Africa): inside an odd number of them.
        let inside = false;
        for (const ring of poly) if (inRing(ring, L, lat)) inside = !inside;
        if (inside) return c.name;
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------ clipping */

/** Sutherland–Hodgman against an axis-aligned box. */
function clipRing(ring, [x0, y0, x1, y1]) {
  let pts = ring;
  const edges = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  for (const [inside, cut] of edges) {
    if (!pts.length) break;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const ia = inside(a);
      const ib = inside(b);
      if (ib) {
        if (!ia) out.push(cut(a, b));
        out.push(b);
      } else if (ia) out.push(cut(a, b));
    }
    pts = out;
  }
  return pts;
}

/** A polyline cut into the runs that cross the box (one point past each edge, the frame clips the rest). */
function clipLine(line, [x0, y0, x1, y1]) {
  const inBox = (p) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const runs = [];
  let cur = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i];
    if (inBox(p)) {
      if (!cur.length && i > 0) cur.push(line[i - 1]);
      cur.push(p);
    } else if (cur.length) {
      cur.push(p);
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length >= 2);
}

/** Drops points closer than `tol` to the last kept one (x already scaled by cos(lat)). */
function thin(pts, tol, c, closed) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1];
    const b = pts[i];
    if (Math.hypot((b[0] - a[0]) * c, b[1] - a[1]) >= tol || (!closed && i === pts.length - 1)) out.push(b);
  }
  return out;
}

function ringArea(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
}

const shiftRing = (ring, d) => (d ? ring.map(([x, y]) => [x + d, y]) : ring);
const round = (ring) => ring.map(([x, y]) => [r2(x), r2(y)]);

/**
 * What the frame of `box` shows: coast (land rings), shared borders, the
 * highlighted countries' rings and a label for each of them. All [lon, lat].
 */
export function worldGeometry(box, { highlight = [], flags = false } = {}) {
  const [w, s, e, n] = box;
  const wide = e - w;
  const res = wide < 30 ? '10m' : '50m';
  const T = topo(res);
  const padX = wide * 0.04;
  const padY = (n - s) * 0.04;
  const c = Math.max(0.2, Math.cos(((s + n) / 2) * RAD));
  const tol = (wide * c) / 1920 * 0.8;
  const minArea = (tol * 3) ** 2;
  // Copies of the world east/west of the date line when the box crosses it.
  const offs = [0];
  if (w < -180) offs.push(-360);
  if (e > 180) offs.push(360);
  // A ring may run on past the date line (unwrap): its copy a world away can be the one in the box.
  const rings = (list) => {
    const out = [];
    for (const d of [0, -360, 360]) {
      const cb = [w - padX - d, s - padY, e + padX - d, n + padY];
      for (const ring of list) {
        const [minX, minY, maxX, maxY] = boxOf(ring);
        if (maxX < cb[0] || minX > cb[2] || maxY < cb[1] || minY > cb[3]) continue;
        const clipped = thin(clipRing(ring, cb), tol, c, true);
        if (clipped.length >= 3 && ringArea(clipped) * c >= minArea) out.push(round(shiftRing(clipped, d)));
      }
    }
    return out;
  };
  const land = rings(T.land);
  const borders = [];
  for (const d of offs) {
    const cb = [w - padX - d, s - padY, e + padX - d, n + padY];
    for (const b of T.borders) for (const run of clipLine(b, cb)) {
      const t = thin(run, tol, c, false);
      if (t.length >= 2) borders.push(round(shiftRing(t, d)));
    }
  }
  const fills = [];
  const flagFills = [];
  const labels = [];
  const hl = [...new Set(highlight.map((h) => String(h || '').trim()).filter(Boolean))].slice(0, 6);
  hl.forEach((h) => {
    const country = findCountry(h, res);
    if (!country) return;
    const own = rings(country.polys.map((p) => p[0]));
    if (!own.length) return;
    fills.push(...own);
    const flag = flags ? flagOf(country.name) : null;
    if (flag) flagFills.push({ flag, rings: own });
    // The label sits on the biggest visible piece, sized by how wide it shows.
    const big = own.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
    const xs = big.map((p) => p[0]);
    const ys = big.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (cx < w || cx > e || cy < s || cy > n) return;
    const frac = (Math.max(...xs) - Math.min(...xs)) / wide;
    const text = String(h).toUpperCase().slice(0, 28);
    labels.push({ text, lon: r2(cx), lat: r2(cy), size: Math.round(Math.max(18, Math.min(34, 18 + frac * 60))) });
  });
  return { land, borders, fills, labels, ...(flagFills.length ? { flagFills } : {}) };
}

/** Nice graticule step: about six lines across the box. */
export function worldGraticule(box) {
  const wide = box[2] - box[0];
  return [0.5, 1, 2, 5, 10, 15, 30].find((g) => wide / g <= 8) ?? 30;
}

/*
 * FLAGS ON THE MAP (1.16.16): the small-channel breakouts paint a crisis map's countries with their own flags (Inside
 * Decoded, Iran–Saudi–Yemen: 172k on 4.2k subscribers); our world map tinted them one colour. A highlighted country
 * is drawn with its flag (flag-icons 7.5.0, MIT, docu-engine/public/flags) when the story is modern: a scene era (or
 * the script's) from 1992 on, when today's flags are the flags of the story. Older stories (1066, 1942, 1956) keep the
 * colour tint: no modern flag on a medieval or Cold War map. Disputed and unrecognised territories have no flag.
 */
let FLAGS = null;
export function flagOf(name) {
  FLAGS ??= JSON.parse(readFileSync(new URL('./data/flags.json', import.meta.url), 'utf8')).flags;
  return FLAGS[name] || null;
}
const yearIn = (v) => {
  const m = /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(String(v ?? ''));
  return m ? Number(m[1]) : null;
};
export const FLAG_FROM_YEAR = 1992;
export function flagsFit(scene, script = {}) {
  if (scene?.flags === false || script?.mapFlags === false) return false;
  const y = yearIn(scene?.era) ?? yearIn(script?.era);
  return y !== null && y >= FLAG_FROM_YEAR;
}

/*
 * A WORLD MAP SHOWS LAND (submarine collision, 25 Oct 2026): "They collided underwater in the Atlantic" got a 7° box
 * round one pin at sea, [-24, 42.5, -6, 49.5] — Galicia's tip in a corner, and the camera closed in on the pin: the
 * gate saw a dark empty sea with a dot ("kıyı çizgisi yok"). Land is measured in the frame the camera ends on (src/map.tsx
 * mapPlan closes in on the focus pin, at most 2x on a world map — src/geo.ts regionOf focusZoom: half the box round
 * it). Under LAND_MIN_SHARE the box widens round its centre, same shape, LAND_STEP at a time, up to an ocean basin
 * (LAND_MAX_SPAN degrees north–south); the pins keep their places on the Earth. A box that reaches no coast by then
 * stays as it was written.
 */
export const LAND_MIN_SHARE = 0.05;
export const LAND_MAX_SPAN = 40;
const LAND_STEP = 1.5;
/*
 * NOR ALL LAND WITHOUT A LINE (Gimli Glider, 28 Oct 2026): "north of Winnipeg: Gimli" got an 8° x 3° box inside
 * Manitoba; the camera closed in on Gimli, a frame of Canada's land with no coast and no border in it — the QA saw "an
 * empty map, only a small GIMLI label" and a viewer sees a dark blank card with two dots. A close-up that is all land
 * (over LAND_MAX_SHARE) and crossed by no border widens the same way until a coast or a border is in it.
 */
export const LAND_MAX_SHARE = 0.97;

/** Does any border line pass through `win` ([w, s, e, n])? Long straight runs (the 49th parallel) are sampled. */
function borderIn(borders, win) {
  const inside = (p) => p[0] >= win[0] && p[0] <= win[2] && p[1] >= win[1] && p[1] <= win[3];
  for (const line of borders || []) {
    for (let i = 0; i < line.length; i++) {
      if (inside(line[i])) return true;
      const q = line[i + 1];
      if (!q) continue;
      for (let t = 0.125; t < 1; t += 0.125) if (inside([line[i][0] + (q[0] - line[i][0]) * t, line[i][1] + (q[1] - line[i][1]) * t])) return true;
    }
  }
  return false;
}

/**
 * A close-up with nothing to read: open sea, or land from edge to edge with no border across it. A tinted country is
 * read on its own (the camera stops at 1.3x round it, src/geo.ts focusZoom): an Iran map with no pins keeps its box.
 */
const blankFrame = (g, win, share) => share < LAND_MIN_SHARE || (share > LAND_MAX_SHARE && !g.fills?.length && !borderIn(g.borders, win));

/** Share of `win` ([w, s, e, n]) covered by land rings (holes such as the Caspian count against it). */
function landShare(land, win) {
  let a = 0;
  for (const ring of land) {
    const c = clipRing(ring, win);
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
  }
  return Math.abs(a / 2) / ((win[2] - win[0]) * (win[3] - win[1]));
}

/** The frame the camera ends on: half the box, round the focus pin (or the pins' middle). */
function closeUp(box, points, focus) {
  const [w, s, e, n] = box;
  const list = points || [];
  const pts = list.filter((p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y)));
  const f = Number.isInteger(focus) && pts.includes(list[focus]) ? [list[focus]] : pts;
  const xs = f.map((p) => Number(p.x));
  const ys = f.map((p) => Number(p.y));
  const x = f.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0.5;
  const y = f.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0.5;
  const cx = Math.max(0.25, Math.min(0.75, x));
  const cy = Math.max(0.25, Math.min(0.75, y));
  return [w + (cx - 0.25) * (e - w), n - (cy + 0.25) * (n - s), w + (cx + 0.25) * (e - w), n - (cy - 0.25) * (n - s)];
}

/** `box` k times as wide and tall round its centre, at most LAND_MAX_SPAN tall, inside the world. */
function widen(box, k) {
  const [w, s, e, n] = box;
  const f = Math.max(1, Math.min(k, LAND_MAX_SPAN / (n - s), 360 / (e - w)));
  const cx = (w + e) / 2;
  const hs = (n - s) * f;
  const ws = (e - w) * f;
  let so = (s + n) / 2 - hs / 2;
  let no = so + hs;
  if (no > 84) {
    so -= no - 84;
    no = 84;
  }
  if (so < -80) {
    no += -80 - so;
    so = -80;
  }
  return [r3(cx - ws / 2), r3(so), r3(cx + ws / 2), r3(no)];
}

/** A map box with land in the frame the camera ends on: { box, points, k, share, was } (k = 1: as it was). */
function boxWithLand(s, geometry) {
  const box0 = s.box;
  const [w, so, e, n] = box0;
  let g = geometry(box0);
  const win0 = closeUp(box0, s.points, s.focus);
  const was = landShare(g.land, win0);
  let best = { box: box0, points: s.points, g, k: 1, share: was, blank: blankFrame(g, win0, was) };
  const at = (p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y));
  for (let k = LAND_STEP; best.blank && n - so > 0 && e - w > 0 && n - so < LAND_MAX_SPAN; k *= LAND_STEP) {
    const box = widen(box0, k);
    // The pins stay where they are on the Earth: back to lat/lon in the old box, into the new one.
    const points = (s.points || []).map((p) => (at(p) ? { ...p, ...worldXY(box, n - Number(p.y) * (n - so), w + Number(p.x) * (e - w)) } : p));
    g = geometry(box);
    const win = closeUp(box, points, s.focus);
    const share = landShare(g.land, win);
    // Only a box whose close-up does show a coast or a border: one still all sea at the cap (Midway, %0 at 5.7x) only loses the scale.
    if (!blankFrame(g, win, share)) best = { box, points, g, k: (box[3] - box[1]) / (n - so), share, blank: false };
    if (box[3] - box[1] >= LAND_MAX_SPAN - 0.01 || box[2] - box[0] >= 359.99) break;
  }
  return { ...best, was };
}

/**
 * Fills `scene.geo` on every world map scene (region 'world' with a box).
 * Pure apart from reading the bundled data; a scene whose geometry fails
 * keeps an empty sea (the pins and route still draw).
 */
export function attachWorldMaps(script, { log = () => {} } = {}) {
  if (!script?.scenes?.some((s) => s?.type === 'map' && s.region === 'world')) return script;
  const scenes = script.scenes.map((s, i) => {
    if (s?.type !== 'map' || s.region !== 'world' || !Array.isArray(s.box) || s.box.length !== 4) return s;
    try {
      const opts = { highlight: s.countries || [], flags: flagsFit(s, script) };
      const fit = boxWithLand(s, (box) => worldGeometry(box, opts));
      const g = fit.g;
      const pct = (v) => `%${Math.round(v * 100)}`;
      if (fit.k > 1) {
        const why = fit.was > LAND_MAX_SHARE ? "baştan başa kara, kıyı ya da sınır yok" : `kara ${pct(fit.was)}`;
        log(`Harita (sahne ${i + 1}): yakın kadrajda ${why} — kutu ${fit.k.toFixed(2)} kat genişledi, kıyı/sınır kadrajda (kara ${pct(fit.share)}), pinler yerinde`);
        s = { ...s, box: fit.box, points: fit.points };
      } else if (fit.share < LAND_MIN_SHARE) log(`Harita (sahne ${i + 1}): açık denizde, yakın kadrajda kara ${pct(fit.share)} — okyanus ölçeğine kadar kıyı yok, kutu olduğu gibi`);
      else if (fit.blank) log(`Harita (sahne ${i + 1}): yakın kadraj baştan başa kara — ${LAND_MAX_SPAN}° genişliğe kadar kıyı ya da sınır yok, kutu olduğu gibi`);
      // A country label never sits on a pin: the same name, or a label within ~7% of a pin, gives way to the pin.
      const [w, so, e, n] = s.box;
      const pins = (s.points || []).map((q) => ({ t: fold(q.label), x: Number(q.x), y: Number(q.y) }));
      g.labels = g.labels.filter((l) => {
        const x = (l.lon - w) / (e - w);
        const y = (n - l.lat) / (n - so);
        return !pins.some((q) => q.t === fold(l.text) || (Math.abs(q.x - x) < 0.07 && Math.abs(q.y - y) < 0.07));
      });
      return { ...s, geo: { ...g, graticule: worldGraticule(s.box), name: s.geo?.name || s.mapName || '' } };
    } catch (e) {
      log(`Dünya haritası çizilemedi (${e.message}) — sahne pinlerle kalır`);
      return s;
    }
  });
  return { ...script, scenes };
}

/* ------------------------------------------------ places named in a line */

/** Country names that are also first names or places elsewhere (Georgia, USA): never matched from narration alone. */
const AMBIGUOUS = new Set(['chad', 'jordan', 'georgia', 'guinea', 'jersey', 'guernsey', 'niue', 'nauru', 'palau', 'tonga', 'samoa', 'dominica', 'grenada', 'america', 'korea', 'congo']);
/** Abbreviations matched only in capitals. */
const CAPS = { UK: 'united kingdom', USA: 'united states of america', UAE: 'united arab emirates', DRC: 'dem rep congo', USSR: 'russia', US: 'united states of america' };

let nameIndex = null;
function names() {
  if (nameIndex) return nameIndex;
  const list = [];
  const byKey = (k) => topo('50m').countries.find((x) => fold(x.name) === k);
  for (const c of topo('50m').countries) {
    const k = fold(c.name);
    // Abbreviated Natural Earth names ("Dem. Rep. Congo", "Bosnia and Herz.") are found through the aliases only.
    if (k && !/\./.test(c.name) && !AMBIGUOUS.has(k)) list.push([c.name, c.name, false]);
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (alias.length < 4 || AMBIGUOUS.has(alias)) continue;
    const c = byKey(target);
    if (c) list.push([alias, c.name, false]);
  }
  for (const [abbr, target] of Object.entries(CAPS)) {
    const c = byKey(target);
    if (c) list.push([abbr, c.name, true]);
  }
  // Longest first: "South Sudan" before "Sudan", "United States" before "States".
  list.sort((a, b) => b[0].length - a[0].length);
  nameIndex = list;
  return list;
}

/**
 * Countries named in a line, as written there, in order: [{ said, country }]. Only capitalised
 * whole-word mentions ("Yemen", "the UK", "United States") — never "turkey dinner" or a first name.
 */
export function countriesIn(text) {
  const src = String(text || '').replace(/\[[^\]]*\]/g, ' ');
  const taken = [];
  const out = [];
  for (const [say, country, caps] of names()) {
    const esc = say.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const re = new RegExp(`(^|[^\\p{L}])(${esc})(?![\\p{L}])`, caps ? 'gu' : 'giu');
    let m;
    while ((m = re.exec(src))) {
      const at = m.index + m[1].length;
      const said = m[2];
      // A proper noun: every word capitalised but small joiners ("Bosnia and Herzegovina", "Republic of the Congo").
      if (!caps && !said.split(/\s+/).every((w) => /^\p{Lu}/u.test(w) || /^(and|of|the)$/i.test(w))) continue;
      // "US" alone is the pronoun in a capitalised headline; only "the US" is the country.
      if (said === 'US' && !/\bthe\s+$/i.test(src.slice(Math.max(0, at - 4), at))) continue;
      if (taken.some(([a, b]) => at < b && at + said.length > a)) continue;
      taken.push([at, at + said.length]);
      if (!out.some((o) => o.country === country)) out.push({ said, country, at });
    }
  }
  /*
   * BARE "CONGO" (17 Oct 2026, Ebola: the opening map painted Uganda and Kenya in their flags and left Congo blank —
   * the script says "Congo" throughout, and "Congo" alone was ambiguous): in today's narration it is the Democratic
   * Republic of the Congo (Ebola, M23, Goma, Kinshasa); the Republic of the Congo is named as such or by Brazzaville.
   */
  if (!/Brazzaville/.test(src)) {
    const drc = names().find(([, c]) => fold(c) === 'dem rep congo')?.[1];
    const re = /(^|[^\p{L}])(Congo)(?![\p{L}])/gu;
    let m;
    while (drc && (m = re.exec(src))) {
      const at = m.index + m[1].length;
      if (taken.some(([a, b]) => at < b && at + 5 > a)) continue;
      if (/Republic of (?:the )?$/i.test(src.slice(Math.max(0, at - 20), at))) continue;
      taken.push([at, at + 5]);
      if (!out.some((o) => o.country === drc)) out.push({ said: 'Congo', country: drc, at });
    }
  }
  return out.sort((a, b) => a.at - b.at).map(({ said, country }) => ({ said, country }));
}

/** Label point and extent of a country's biggest piece: { lat, lon, box: [w, s, e, n] } or null. */
export function countryCenter(name) {
  const c = findCountry(name, '50m');
  if (!c) return null;
  const big = c.polys.map((p) => p[0]).reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a), []);
  if (!big.length) return null;
  let xs = big.map((p) => p[0]);
  const ys = big.map((p) => p[1]);
  // A piece across the date line (Russia's mainland runs to Chukotka): measured east of Greenwich.
  if (Math.max(...xs) - Math.min(...xs) > 180) xs = xs.map((x) => (x < 0 ? x + 360 : x));
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  let lon = (box[0] + box[2]) / 2;
  if (lon > 180) lon -= 360;
  return { lon: r2(lon), lat: r2((box[1] + box[3]) / 2), box: box.map(r2) };
}

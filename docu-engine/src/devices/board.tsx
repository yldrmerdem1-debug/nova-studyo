import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Media } from '../fx';
import { seededRng } from '../paper';
import type { BoardScene, Genre } from '../types';
import { DevProps, GenreBg, H, SurfaceKind, TitleTag, W, clamp, drawn, ease, handLoop, resolveRef, safeBand, surfaceTexture } from './common';
import { DFONT, fitWrap } from './type';

/*
 * EVIDENCE BOARD — prints pinned one by one on a board, red string drawn from
 * pin to pin, handwritten labels on each print's strip, notes on index cards.
 * The camera holds the whole board while it fills, then travels to `focus`
 * and a marker loop closes around it. Every size is solved from the item
 * count and the text, so two items and nine items both fill the safe band.
 */

export interface BoardLook {
  surface: SurfaceKind;
  tone: string;
  print: string;
  ink: string;
  string: string;
  pins: string[];
  note: string;
  noteInk: string;
  /** Light pool over the board: colour and how much it falls off. */
  light: string;
  falloff: number;
}

export function boardLook(g: Genre): BoardLook {
  switch (g.id) {
    case 'crime':
      return { surface: 'cork', tone: '#52483e', print: '#e6e1d4', ink: '#15181c', string: '#d0241f', pins: [g.accent, '#d0241f', '#e8ecef'], note: '#f4f1e8', noteInk: '#1b2a4a', light: 'rgba(185,210,255,0.14)', falloff: 0.78 };
    case 'horror':
      return { surface: 'cork', tone: '#3b2a1e', print: '#d9d0bd', ink: '#1a0f0c', string: '#b3121c', pins: ['#8e0f16', '#d9d0bd'], note: '#cfc4ab', noteInk: '#3a0d0d', light: 'rgba(255,225,190,0.14)', falloff: 0.9 };
    case 'epic':
      return { surface: 'wood', tone: '#4a3220', print: '#e8d9b5', ink: '#2e1f0c', string: '#a31d1d', pins: ['#d9a441', '#a31d1d'], note: '#e0cda0', noteInk: '#3b1d0c', light: 'rgba(255,200,120,0.16)', falloff: 0.75 };
    case 'science':
      return { surface: 'felt', tone: '#15243a', print: '#eef6ff', ink: '#0b1830', string: g.accent2, pins: [g.accent, '#e6f4ff'], note: '#dff3ff', noteInk: '#0b1830', light: 'rgba(120,210,255,0.10)', falloff: 0.65 };
    case 'finance':
      return { surface: 'felt', tone: '#10261b', print: '#f0f5ef', ink: '#06140e', string: g.accent2, pins: [g.accent, '#e9fff3'], note: '#e9fff3', noteInk: '#06140e', light: 'rgba(120,255,190,0.08)', falloff: 0.65 };
    case 'inspire':
      return { surface: 'cork', tone: '#c89a64', print: '#fbf3e4', ink: '#3a2414', string: g.accent2, pins: ['#c9a227', g.accent2, '#fbf3e4'], note: '#fff2c9', noteInk: '#3a2414', light: 'rgba(255,220,160,0.16)', falloff: 0.5 };
    default:
      return { surface: 'cork', tone: '#b0804c', print: '#f4eee0', ink: '#1d1a17', string: '#c8201c', pins: ['#c8201c', g.accent, '#f4eee0'], note: '#f5d547', noteInk: '#1d1a17', light: 'rgba(255,225,170,0.14)', falloff: 0.58 };
  }
}

const PHOTO_W = 380;
const PAD = 18;
const STRIP = 104;
const CARD_W = 440;
const NOTE_W = 250;

interface Item {
  i: number;
  src?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ph: number;
  tilt: number;
  label: string[];
  labelSize: number;
  note?: { lines: string[]; size: number; w: number; h: number; x: number; y: number; tilt: number };
  pin: [number, number];
  box: [number, number, number, number];
}

function rowSplit(n: number): number[] {
  // Wide rows suit a 16:9 frame: up to four prints in one row, up to ten in two.
  if (n <= 4) return [n];
  const rows = n <= 10 ? 2 : 3;
  const out: number[] = [];
  let left = n;
  for (let r = rows; r > 0; r--) {
    const k = Math.ceil(left / r);
    out.push(k);
    left -= k;
  }
  return out;
}

const rot = (dx: number, dy: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
};

export function boardLayout(scene: BoardScene) {
  const items0 = (scene.items ?? []).slice(0, 12);
  const n = Math.max(1, items0.length);
  const rows = rowSplit(n);
  const notes = items0.some((it) => String(it.note ?? '').trim());
  const cellW = notes ? 650 : 540;
  const r = seededRng(`board${items0.map((i) => i.label).join('|')}`);
  const items: Item[] = [];
  let k = 0;
  const heights: number[] = [];
  const pre = items0.map((it) => {
    const pic = resolveRef(it);
    const aspect = pic.w && pic.h ? Math.min(1.45, Math.max(0.75, pic.w / pic.h)) : 1.3;
    const ph = pic.src ? Math.round(PHOTO_W / aspect) : 0;
    const w = pic.src ? PHOTO_W + 2 * PAD : CARD_W;
    const h = pic.src ? PAD + ph + STRIP : 290;
    heights.push(h);
    return { it, pic, ph, w, h };
  });
  const rowH = Math.max(...heights, 300) + (notes ? 90 : 70);
  rows.forEach((count, row) => {
    for (let c = 0; c < count; c++, k++) {
      const p = pre[k];
      if (!p) continue;
      const jitter = notes ? 16 : 34;
      const x = (c - (count - 1) / 2) * cellW + (r() - 0.5) * 2 * jitter + (rows.length > 1 ? (row % 2 ? 1 : -1) * cellW * 0.08 : 0) - (notes ? 60 : 0);
      const y = (row - (rows.length - 1) / 2) * rowH + (r() - 0.5) * 2 * (jitter * 0.7) + (count > 2 ? (c % 2 ? 22 : -18) : 0);
      const tilt = (k % 2 ? 1 : -1) * (1.2 + r() * 3.6);
      const label = String(p.it.label ?? '').trim();
      const lf = p.pic.src
        ? fitWrap(label, 'hand', { maxW: p.w - 30, maxH: STRIP - 18, lineH: 0.98, cap: 56, min: 24, maxLines: 2, balance: true })
        : fitWrap(label, 'hand', { maxW: CARD_W - 60, maxH: 190, lineH: 1.0, cap: 70, min: 28, maxLines: 3, balance: true });
      let note: Item['note'];
      const nt = String(p.it.note ?? '').trim();
      if (nt) {
        const nf = fitWrap(nt, 'hand', { maxW: NOTE_W - 36, maxH: 150, lineH: 1.02, cap: 38, min: 22, maxLines: 4, balance: true });
        const nh = Math.round(nf.lines.length * nf.size * 1.02 + 56);
        note = { lines: nf.lines, size: nf.size, w: NOTE_W, h: nh, x: x + p.w / 2 + NOTE_W / 2 - 46, y: y + 10 + (r() - 0.5) * 40, tilt: (r() - 0.5) * 9 + 3 };
      }
      const pinOff = rot(0, -p.h / 2 + 16, tilt);
      const x0 = Math.min(x - p.w / 2, note ? note.x - note.w / 2 : Infinity);
      const x1 = Math.max(x + p.w / 2, note ? note.x + note.w / 2 : -Infinity);
      const y0 = Math.min(y - p.h / 2, note ? note.y - note.h / 2 : Infinity);
      const y1 = Math.max(y + p.h / 2, note ? note.y + note.h / 2 : -Infinity);
      items.push({
        i: k,
        src: p.pic.src,
        x,
        y,
        w: p.w,
        h: p.h,
        ph: p.ph,
        tilt,
        label: lf.lines,
        labelSize: lf.size,
        note,
        pin: [x + pinOff[0], y + pinOff[1]],
        box: [x0, y0, x1, y1],
      });
    }
  });
  const bx0 = Math.min(...items.map((i) => i.box[0])) - 50;
  const by0 = Math.min(...items.map((i) => i.box[1])) - 60;
  const bx1 = Math.max(...items.map((i) => i.box[2])) + 50;
  const by1 = Math.max(...items.map((i) => i.box[3])) + 50;
  let links: [number, number][] = [];
  if (Array.isArray(scene.links)) links = scene.links.filter((l) => Array.isArray(l) && items[l[0]] && items[l[1]] && l[0] !== l[1]);
  else for (let i = 0; i + 1 < items.length; i++) links.push([i, i + 1]);
  const focus = scene.focus != null && items[scene.focus] ? scene.focus : -1;
  return { items, bounds: [bx0, by0, bx1, by1] as [number, number, number, number], links, focus };
}

/** Frame each item is pinned on. */
export function boardClock(n: number, durFrames: number, fps: number) {
  // The first print is on the board within ~0.15 s: never an empty board under its title.
  const start = Math.round(0.15 * fps);
  const step = Math.max(Math.round(0.3 * fps), Math.min(Math.round(0.95 * fps), Math.floor((durFrames * 0.52 - start) / Math.max(1, n))));
  return { start, step, pinAt: (i: number) => start + i * step, done: start + n * step + 10 };
}

/** A board with nothing on it is just the genre's background (the script checker rejects it). */
export const Board: React.FC<DevProps & { scene: BoardScene }> = (props) =>
  Array.isArray(props.scene.items) && props.scene.items.length ? <BoardInner {...props} /> : <GenreBg genre={props.genre} seed="board" />;

const BoardInner: React.FC<DevProps & { scene: BoardScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useMemo(() => boardLook(genre), [genre]);
  const lay = useMemo(() => boardLayout(scene), [scene]);
  const uid = `bd${index ?? 0}`;
  const tex = useMemo(() => surfaceTexture(`board${genre.id}`, L.surface, L.tone), [genre.id, L.surface, L.tone]);
  const clock = boardClock(lay.items.length, durFrames, fps);
  const blotches = useMemo(() => {
    const r = seededRng(`blot${genre.id}${index ?? 0}`);
    return Array.from({ length: 9 }, () => {
      const dark = r() > 0.4;
      return `radial-gradient(circle at ${(r() * 100).toFixed(1)}% ${(r() * 100).toFixed(1)}%, ${dark ? `rgba(0,0,0,${(0.1 + r() * 0.1).toFixed(2)})` : `rgba(255,240,210,${(0.05 + r() * 0.05).toFixed(2)})`} 0%, rgba(0,0,0,0) ${(6 + r() * 10).toFixed(1)}%)`;
    }).join(', ');
  }, [genre.id, index]);
  const band = safeBand(genre, 24);
  const title = String(scene.title ?? '').trim();
  const top = band.top + (title ? 76 : 0);
  const bottom = band.bottom;
  const [bx0, by0, bx1, by1] = lay.bounds;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const z0 = Math.min((W - 140) / bw, (bottom - top) / bh, lay.items.length <= 3 ? 1.22 : 1.1);
  const c0: [number, number] = [(bx0 + bx1) / 2, (by0 + by1) / 2];
  const midY = (top + bottom) / 2;
  const fi = lay.focus >= 0 ? lay.items[lay.focus] : null;
  const z1 = fi ? Math.min(1.7, Math.max(z0 * 1.25, Math.min(((bottom - top) * 0.56) / (fi.box[3] - fi.box[1]), (W * 0.5) / (fi.box[2] - fi.box[0])))) : z0 * 1.1;
  const c1: [number, number] = fi ? [(fi.box[0] + fi.box[2]) / 2, (fi.box[1] + fi.box[3]) / 2] : c0;
  const moveA = Math.min(Math.max(clock.done, Math.round(durFrames * 0.52)), durFrames - Math.round(1.3 * fps));
  const moveB = Math.min(durFrames - Math.round(0.5 * fps), moveA + Math.round(1.3 * fps));
  const m = interpolate(f, [moveA, Math.max(moveA + 1, moveB)], [0, 1], { ...clamp, easing: ease });
  const drift = interpolate(f, [0, durFrames], [0, 1], clamp);
  const z = (z0 + (z1 - z0) * m) * (1 + 0.035 * speed * drift);
  const cx = c0[0] + (c1[0] - c0[0]) * m + Math.sin(f / 53) * 8 * (1 - m) - 24 * (1 - m) * drift;
  const cy = c0[1] + (c1[1] - c0[1]) * m + Math.cos(f / 61) * 5;
  const arrived = moveB;
  const toScr = (x: number, y: number): [number, number] => [(x - cx) * z + W / 2, (y - cy) * z + midY];

  const pinDrop = (i: number) => f - clock.pinAt(i);

  /* ---- items ---- */
  const prints = lay.items.map((it) => {
    const t = pinDrop(it.i);
    if (t < 0) return null;
    const p = interpolate(t, [0, 7, 11], [0, 1.02, 1], clamp);
    const lift = (1 - Math.min(1, p)) * 60;
    const scale = 1 + (1 - Math.min(1, p)) * 0.16;
    const sh = 8 + (1 - Math.min(1, p)) * 40;
    const labP = interpolate(t, [8, 22], [0, 1], clamp);
    const dim = fi && it.i !== lay.focus ? interpolate(f, [moveA, moveB], [1, 0.62], clamp) : 1;
    return (
      <React.Fragment key={it.i}>
        <div
          style={{
            position: 'absolute',
            left: it.x - it.w / 2,
            top: it.y - it.h / 2 - lift,
            width: it.w,
            height: it.h,
            transform: `rotate(${it.tilt}deg) scale(${scale})`,
            background: it.src ? L.print : L.note === '#f5d547' ? '#f6f1e3' : L.print,
            boxShadow: `0 ${sh * 0.6}px ${sh}px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)`,
            opacity: Math.min(1, p * 3),
            filter: dim < 1 ? `brightness(${dim})` : undefined,
          }}
        >
          {it.src ? (
            <div style={{ position: 'absolute', left: PAD, top: PAD, width: PHOTO_W, height: it.ph, overflow: 'hidden', background: '#222' }}>
              <Media src={it.src} durFrames={durFrames} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%', filter: 'url(#duo) contrast(1.05)' }} />
              <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 30px rgba(0,0,0,0.35)' }} />
            </div>
          ) : (
            // An index card: a red head rule and faint blue lines.
            <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${L.string}aa, ${L.string}aa), repeating-linear-gradient(180deg, transparent 0 43px, rgba(60,90,160,0.22) 43px 45px)`, backgroundSize: '100% 2px, 100% 100%', backgroundPosition: '0 58px, 0 60px', backgroundRepeat: 'no-repeat, repeat' }} />
          )}
          <div
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              top: it.src ? PAD + it.ph + 4 : 60,
              bottom: it.src ? 4 : 20,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              fontFamily: DFONT.hand,
              fontWeight: 700,
              fontSize: it.labelSize,
              lineHeight: 0.98,
              color: L.ink,
              textAlign: 'center',
              clipPath: `inset(0 ${(1 - labP) * 100}% 0 0)`,
              transform: `rotate(${-0.6 + (it.i % 3) * 0.5}deg)`,
            }}
          >
            {it.label.map((l, k) => (
              <div key={k} style={{ whiteSpace: 'nowrap' }}>
                {l}
              </div>
            ))}
          </div>
        </div>
        {it.note ? (
          <div
            style={{
              position: 'absolute',
              left: it.note.x - it.note.w / 2,
              top: it.note.y - it.note.h / 2,
              width: it.note.w,
              height: it.note.h,
              background: L.note,
              transform: `rotate(${it.note.tilt}deg) scale(${interpolate(t, [6, 12, 16], [1.15, 0.98, 1], clamp)})`,
              opacity: interpolate(t, [6, 10], [0, 1], clamp),
              boxShadow: '0 10px 18px rgba(0,0,0,0.45)',
              padding: '34px 18px 16px',
              boxSizing: 'border-box',
              fontFamily: DFONT.hand,
              fontWeight: 500,
              fontSize: it.note.size,
              lineHeight: 1.02,
              color: L.noteInk,
              textAlign: 'left',
              filter: dim < 1 ? `brightness(${dim})` : undefined,
            }}
          >
            <div style={{ clipPath: `inset(0 ${(1 - interpolate(t, [14, 30], [0, 1], clamp)) * 100}% 0 0)` }}>
              {it.note.lines.map((l, k) => (
                <div key={k} style={{ whiteSpace: 'nowrap' }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </React.Fragment>
    );
  });

  /* ---- string ---- */
  const strings = lay.links.map(([a, b], k) => {
    const A = lay.items[a];
    const B = lay.items[b];
    const at = Math.max(clock.pinAt(a), clock.pinAt(b)) + 9 + (k % 3) * 3;
    const p = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
    if (p <= 0) return null;
    // From the pin placed first to the later one, sagging under its own weight.
    const [P, Q] = clock.pinAt(a) <= clock.pinAt(b) ? [A.pin, B.pin] : [B.pin, A.pin];
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    const sag = Math.min(90, len * 0.07);
    const mx = (P[0] + Q[0]) / 2;
    const my = (P[1] + Q[1]) / 2 + sag;
    const d = `M${P[0].toFixed(1)} ${P[1].toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${Q[0].toFixed(1)} ${Q[1].toFixed(1)}`;
    return (
      <g key={k}>
        <path d={d} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={4.5} transform="translate(3 7)" {...drawn(p)} />
        <path d={d} fill="none" stroke={L.string} strokeWidth={3.6} strokeLinecap="round" {...drawn(p)} />
        <path d={d} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={1.1} strokeDasharray="3 5" transform="translate(-0.6 -0.8)" opacity={p >= 1 ? 1 : 0} />
      </g>
    );
  });

  const pins = lay.items.map((it) => {
    const t = pinDrop(it.i);
    if (t < 9) return null;
    const pop = interpolate(t, [9, 12, 15], [1.5, 0.9, 1], clamp);
    const col = L.pins[it.i % L.pins.length];
    const notePin = it.note ? rot(0, -it.note.h / 2 + 14, it.note.tilt) : null;
    const pin = (x: number, y: number, c: string, key: string) => (
      <g key={key} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${pop})`}>
        <ellipse cx={5} cy={9} rx={12} ry={8} fill="rgba(0,0,0,0.45)" />
        <circle r={12} fill={c} />
        <circle r={12} fill={`url(#pinshade${uid})`} />
        <circle cx={-4} cy={-4} r={3.4} fill="rgba(255,255,255,0.75)" />
      </g>
    );
    return (
      <g key={it.i}>
        {pin(it.pin[0], it.pin[1] - (t < 12 ? 0 : 0), col, 'p')}
        {notePin && t >= 14 ? pin(it.note!.x + notePin[0], it.note!.y + notePin[1], L.pins[(it.i + 1) % L.pins.length], 'n') : null}
      </g>
    );
  });

  /* ---- the loop around the focus ---- */
  let loop: React.ReactNode = null;
  if (fi) {
    const p = interpolate(f, [arrived - 6, arrived + 10], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
    if (p > 0) {
      const d = handLoop(`${uid}f`, fi.x, fi.y + 6, fi.w * 0.66, fi.h * 0.62);
      loop = (
        <g>
          <path d={d} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={9} strokeLinecap="round" transform="translate(3 5)" {...drawn(p)} />
          <path d={d} fill="none" stroke={L.string} strokeWidth={7.5} strokeLinecap="round" {...drawn(p)} />
        </g>
      );
    }
  }

  // The board is larger than anything the camera can see.
  const span = 2600 / Math.max(0.3, Math.min(z0, z));
  const light = fi ? toScr(c1[0], c1[1]) : [W / 2, midY];
  const lx = 50 + ((light[0] - W / 2) / W) * 100 * m * 0.6;
  const ly = 45 + ((light[1] - midY) / H) * 100 * m * 0.6;
  const intro = interpolate(f, [0, 6], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ background: L.tone, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          transformOrigin: '0 0',
          transform: `translate(${W / 2}px, ${midY}px) scale(${z}) translate(${-cx}px, ${-cy}px)`,
          opacity: intro,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: c0[0] - span,
            top: c0[1] - span,
            width: span * 2,
            height: span * 2,
            backgroundColor: L.tone,
            backgroundImage: tex ? `url(${tex})` : undefined,
            backgroundSize: '1600px 1000px',
            backgroundPosition: `${span}px ${span}px`,
          }}
        />
        {/* Uneven tone over the tiled surface: big soft blotches, seeded, never repeating. */}
        <div style={{ position: 'absolute', left: c0[0] - span, top: c0[1] - span, width: span * 2, height: span * 2, background: blotches }} />
        {genre.pattern === 'grid' ? (
          <div
            style={{
              position: 'absolute',
              left: c0[0] - span,
              top: c0[1] - span,
              width: span * 2,
              height: span * 2,
              backgroundImage: `linear-gradient(${genre.accent}14 1px, transparent 1px), linear-gradient(90deg, ${genre.accent}14 1px, transparent 1px)`,
              backgroundSize: '80px 80px',
            }}
          />
        ) : null}
        {prints}
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
          <defs>
            <radialGradient id={`pinshade${uid}`} cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
              <stop offset="55%" stopColor="#000000" stopOpacity={0} />
              <stop offset="100%" stopColor="#000000" stopOpacity={0.5} />
            </radialGradient>
          </defs>
          {strings}
          {pins}
          {loop}
        </svg>
      </div>
      {/* The light pool: the board falls off into the dark, and at the end the light sits on the focus. */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          background: `radial-gradient(ellipse ${62 - 10 * m}% ${70 - 10 * m}% at ${lx}% ${ly}%, ${L.light} 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,${L.falloff}) 100%)`,
        }}
      />
      <TitleTag genre={genre} text={title} locale={locale} top={band.top} />
    </AbsoluteFill>
  );
};

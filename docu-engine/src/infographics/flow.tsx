import React, { useMemo } from 'react';
import { interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import type { FlowScene } from '../types';
import type { DevProps } from '../devices/common';
import { clamp } from '../devices/common';
import { DFONT, measure } from '../devices/type';
import { infoPlan, type FlowPlan } from './timing.js';
import { InfoStage, SOFT, glow, infoBand, infoTheme, prog, rgba, type InfoTheme, fitText } from './theme';

/*
 * PROCESS / NETWORK FLOW — a money trail or a chain of events. Nodes are
 * ranked left to right by their links (a long chain folds into a second row
 * that runs back, like a page); each pops in on its spoken word while the
 * arrow from its source draws itself into it, then a small packet keeps
 * travelling the drawn paths. A single end point (the destination, the
 * outcome) is set in the accent.
 */

type Pt = { x: number; y: number };
interface NodeBox {
  i: number;
  id: string;
  label: string[];
  x: number;
  y: number;
  row: number;
  col: number;
}

export function flowLayout(scene: FlowScene, th: InfoTheme, band: ReturnType<typeof infoBand>) {
  const nodes = (scene.nodes ?? []).slice(0, 10).map((n, i) => ({ i, id: String(n?.id ?? i), label: String(n?.label ?? '').trim() }));
  const idx = new Map(nodes.map((n) => [n.id, n.i]));
  const edges = (scene.edges ?? [])
    .map((e) => ({ u: idx.get(String(e?.[0])), v: idx.get(String(e?.[1])), label: String(e?.[2] ?? '').trim() }))
    .filter((e): e is { u: number; v: number; label: string } => e.u != null && e.v != null && e.u !== e.v)
    .slice(0, 14);
  const n = nodes.length;
  // Longest-path rank (bounded: a cycle cannot run away).
  const rank = new Array(n).fill(0);
  for (let it = 0; it < n; it++) {
    let moved = false;
    for (const e of edges) {
      if (rank[e.u] + 1 > rank[e.v] && rank[e.u] + 1 < n) {
        rank[e.v] = rank[e.u] + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  // Unlinked nodes keep their listed place.
  const linked = new Set(edges.flatMap((e) => [e.u, e.v]));
  if (!edges.length) nodes.forEach((nd) => (rank[nd.i] = nd.i));
  else nodes.forEach((nd) => !linked.has(nd.i) && (rank[nd.i] = Math.min(nd.i, Math.max(...rank))));
  const L = Math.max(...rank, 0) + 1;
  const rows = L > 5 ? 2 : 1;
  const perRow = Math.ceil(L / rows);
  const layers: number[][] = Array.from({ length: L }, () => []);
  nodes.forEach((nd) => layers[rank[nd.i]].push(nd.i));
  const maxInLayer = Math.max(...layers.map((l) => l.length), 1);

  const width = band.right - band.left;
  const height = band.bottom - band.top;
  const colW = width / perRow;
  const rowH = height / rows;
  const slotH = rowH / maxInLayer;
  // Labelled arrows need a gap between the cards to sit in.
  const labelled = edges.some((e) => e.label);
  /*
   * A chain (one card per step) of four or more, or with labelled arrows,
   * zig-zags: cards alternate above and below the middle, so each can be far
   * wider than its column and the arrows run diagonally with room for tags.
   */
  const zig = rows === 1 && maxInLayer === 1 && L >= 3 && (L >= 4 || labelled);
  const nodeW = zig ? Math.min(470, (2 * width - 120 * (L - 1)) / (L + 1)) : Math.min(440, colW * (labelled ? 0.66 : 0.76));
  const textW = nodeW - 44;
  const upper = th.look === 'terminal';
  const tr = { upper, trackEm: upper ? 0.04 : 0 };
  // No word is ever broken inside a card: the longest word sets the ceiling.
  const words = nodes.flatMap((nd) => nd.label.split(/\s+/)).filter(Boolean);
  const wordCap = Math.min(...words.map((w) => Math.floor(textW / Math.max(0.01, measure(w, th.labelFont, 100, tr) / 100))), 200);
  const cap = Math.max(18, Math.min(46, Math.round(slotH * 0.22), wordCap));
  const maxH = zig ? Math.min(height * 0.36, 260) - 44 : Math.min(slotH * 0.8, 260) - 40;
  const fits = nodes.map((nd) => fitText(nd.label, th.labelFont, { ...tr, maxW: textW, maxH, lineH: 1.12, cap, min: 16, maxLines: 4, balance: true }));
  const size = Math.min(...fits.map((x) => x.size), cap);
  const labels = nodes.map((nd) => fitText(nd.label, th.labelFont, { ...tr, maxW: textW, maxH, lineH: 1.12, cap: size, min: Math.min(size, 16), maxLines: 4, balance: true }).lines);
  const maxLines = Math.max(...labels.map((l) => l.length), 1);
  const nodeH = Math.max(84, maxLines * size * 1.12 + 44);
  const gapW = colW - nodeW;

  const boxes: NodeBox[] = nodes.map((nd) => {
    const r = rank[nd.i];
    const row = rows === 2 && r >= perRow ? 1 : 0;
    const k = row ? r - perRow : r;
    const col = row ? perRow - 1 - k : k;
    const layer = layers[r];
    const j = layer.indexOf(nd.i);
    if (zig) {
      // Evenly from edge to edge, alternating about the middle, far enough apart that neighbours never touch.
      const dy = Math.min(height / 2 - nodeH / 2 - 8, Math.max(nodeH / 2 + 60, 210));
      const x = band.left + nodeW / 2 + (col * (width - nodeW)) / Math.max(1, L - 1);
      const y = band.top + height / 2 + (col % 2 ? dy : -dy);
      return { i: nd.i, id: nd.id, label: labels[nd.i], x, y, row, col };
    }
    const x = band.left + colW * (col + 0.5);
    const y = band.top + rowH * row + (rowH - slotH * layer.length) / 2 + slotH * (j + 0.5);
    return { i: nd.i, id: nd.id, label: labels[nd.i], x, y, row, col };
  });
  const outs = new Array(n).fill(0);
  edges.forEach((e) => outs[e.u]++);
  const sinks = boxes.filter((b) => !outs[b.i] && linked.has(b.i));
  const emphasis = n >= 3 && sinks.length === 1 ? sinks[0].i : -1;
  return { boxes, edges, nodeW, nodeH, size, rows, emphasis, gapW: zig ? nodeW : gapW, zig };
}

/** Path of an arrow from box a to box b (bezier; elbows in the terminal look), with its end tangent. */
function route(a: NodeBox, b: NodeBox, w: number, h: number, elbow: boolean): { d: string; end: Pt; angle: number; mid: Pt; at: (t: number) => Pt } {
  let p0: Pt;
  let p3: Pt;
  let c1: Pt;
  let c2: Pt;
  if (a.row !== b.row) {
    // Folding into the next row: bottom of a to top of b.
    p0 = { x: a.x, y: a.y + h / 2 };
    p3 = { x: b.x, y: b.y - h / 2 - 6 };
    const dy = (p3.y - p0.y) * 0.55;
    c1 = { x: p0.x, y: p0.y + dy };
    c2 = { x: p3.x, y: p3.y - dy };
  } else if (a.col === b.col) {
    // Same column: an arc out to the side.
    const s = a.y < b.y ? 1 : -1;
    p0 = { x: a.x + w / 2, y: a.y + (s * h) / 4 };
    p3 = { x: b.x + w / 2 + 6, y: b.y - (s * h) / 4 };
    c1 = { x: p0.x + 110, y: p0.y };
    c2 = { x: p3.x + 110, y: p3.y };
  } else if (Math.abs(a.y - b.y) > h * 0.8) {
    // Zig-zag: out of the bottom (top) of one card, into the top (bottom) of the next, an S between.
    const s = b.y > a.y ? 1 : -1;
    const dir = b.col > a.col ? 1 : -1;
    p0 = { x: a.x + dir * w * 0.18, y: a.y + (s * h) / 2 };
    p3 = { x: b.x - dir * w * 0.18, y: b.y - (s * h) / 2 - s * 6 };
    const dy = (p3.y - p0.y) * 0.6;
    c1 = { x: p0.x, y: p0.y + dy };
    c2 = { x: p3.x, y: p3.y - dy };
  } else {
    const dir = b.col > a.col ? 1 : -1;
    p0 = { x: a.x + (dir * w) / 2, y: a.y };
    p3 = { x: b.x - (dir * w) / 2 - dir * 6, y: b.y };
    const dx = (p3.x - p0.x) * 0.5;
    c1 = { x: p0.x + dx, y: p0.y };
    c2 = { x: p3.x - dx, y: p3.y };
  }
  if (elbow) {
    const horiz = a.row === b.row && a.col !== b.col;
    const pts: Pt[] = horiz
      ? [p0, { x: (p0.x + p3.x) / 2, y: p0.y }, { x: (p0.x + p3.x) / 2, y: p3.y }, p3]
      : [p0, { x: p0.x, y: (p0.y + p3.y) / 2 }, { x: p3.x, y: (p0.y + p3.y) / 2 }, p3];
    const seg = pts.slice(1).map((q, k) => Math.hypot(q.x - pts[k].x, q.y - pts[k].y));
    const tot = seg.reduce((s, v) => s + v, 0) || 1;
    const at = (t: number): Pt => {
      let d = t * tot;
      for (let k = 0; k < seg.length; k++) {
        if (d <= seg[k] || k === seg.length - 1) {
          const u = seg[k] ? Math.min(1, d / seg[k]) : 0;
          return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * u, y: pts[k].y + (pts[k + 1].y - pts[k].y) * u };
        }
        d -= seg[k];
      }
      return p3;
    };
    const last = pts[pts.length - 2];
    return { d: `M${pts.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' L')}`, end: p3, angle: Math.atan2(p3.y - last.y, p3.x - last.x), mid: at(0.5), at };
  }
  const at = (t: number): Pt => {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
    };
  };
  return {
    d: `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`,
    end: p3,
    angle: Math.atan2(p3.y - c2.y, p3.x - c2.x),
    mid: at(0.5),
    at,
  };
}

export const Flow: React.FC<DevProps & { scene: FlowScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const th = useMemo(() => infoTheme(genre, scene), [genre, scene]);
  const title = String(scene.title ?? '').trim();
  const band = infoBand(genre, !!title);
  const plan = useMemo(() => infoPlan(scene, durFrames, fps) as FlowPlan, [scene, durFrames, fps]);
  const Lo = useMemo(() => flowLayout(scene, th, band), [scene, th, band.top, band.bottom]);
  const { boxes, edges, nodeW, nodeH, size, emphasis } = Lo;
  const upper = th.look === 'terminal';
  const look = th.look;
  const at = plan.at;

  /* ---- arrows ---- */
  const lineC = look === 'label' ? rgba(th.ink, 0.9) : th.hi;
  const lineW = look === 'label' ? 5 : look === 'terminal' ? 2 : 3;
  const arrows: React.ReactNode[] = [];
  const tags: React.ReactNode[] = [];
  edges.forEach((e, k) => {
    const a = boxes[e.u];
    const b = boxes[e.v];
    const fu = at[e.u] ?? 0;
    const fv = at[e.v] ?? 0;
    const s = fv >= fu ? Math.max(fu + 4, fv - 11) : fu + 4;
    const d = fv >= fu ? Math.max(8, fv + 1 - s) : 12;
    const p = prog(f, s, d, SOFT);
    if (p <= 0) return;
    const R = route(a, b, nodeW, nodeH, look === 'terminal');
    const into = e.v === emphasis;
    const col = into ? th.hi : lineC;
    const head = 16 + lineW * 1.6;
    const hx = R.end.x;
    const hy = R.end.y;
    const l = { x: hx - Math.cos(R.angle - 0.42) * head, y: hy - Math.sin(R.angle - 0.42) * head };
    const r = { x: hx - Math.cos(R.angle + 0.42) * head, y: hy - Math.sin(R.angle + 0.42) * head };
    const packetT = p >= 1 ? ((f - (s + d)) / Math.round(1.5 * fps) + k * 0.37) % 1 : -1;
    const pk = packetT >= 0 ? R.at(packetT) : null;
    arrows.push(
      <g key={k}>
        {look === 'label' ? <path d={R.d} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={lineW} transform="translate(0 5)" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} /> : null}
        <path
          d={R.d}
          fill="none"
          stroke={col}
          strokeWidth={lineW}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - p}
          style={look !== 'label' && !th.light ? { filter: `drop-shadow(0 0 6px ${rgba(col, 0.8)})` } : undefined}
        />
        {p > 0.92 ? <path d={`M${l.x.toFixed(1)} ${l.y.toFixed(1)} L${hx.toFixed(1)} ${hy.toFixed(1)} L${r.x.toFixed(1)} ${r.y.toFixed(1)} Z`} fill={col} stroke={col} strokeWidth={2} strokeLinejoin="round" opacity={interpolate(p, [0.92, 1], [0, 1], clamp)} /> : null}
        {pk ? <circle cx={pk.x} cy={pk.y} r={look === 'label' ? 7 : 5} fill={look === 'label' ? th.hi : '#ffffff'} opacity={0.9 * Math.sin(Math.PI * packetT)} style={look !== 'label' && !th.light ? { filter: `drop-shadow(0 0 8px ${th.hi})` } : undefined} /> : null}
      </g>,
    );
    if (e.label) {
      const tp = prog(f, s + d - 2, 10, SOFT);
      if (tp > 0) {
        // Between two cards of a row the tag lives in the gap (two lines if it must); elsewhere it may be wider.
        const room = !Lo.zig && a.row === b.row && Math.abs(a.col - b.col) === 1 ? Lo.gapW - 30 : nodeW * 0.8;
        const tw = fitText(e.label, th.labelFont, { maxW: room, maxH: 80, lineH: 1.1, cap: Math.max(20, Math.round(size * 0.7)), min: 15, maxLines: 2, balance: true, upper: look === 'terminal' });
        const ts = tw.size;
        tags.push(
          <div
            key={`t${k}`}
            style={{
              position: 'absolute',
              left: R.mid.x,
              top: R.mid.y,
              transform: `translate(-50%, -50%) scale(${0.8 + 0.2 * tp})`,
              opacity: tp,
              fontFamily: DFONT[th.labelFont],
              fontWeight: 700,
              fontSize: ts,
              lineHeight: 1.1,
              textAlign: 'center',
              padding: look === 'label' ? '7px 12px 5px' : '6px 12px',
              whiteSpace: 'nowrap',
              color: look === 'label' ? genre.labelInk : into ? th.bg : th.ink,
              background: look === 'label' ? genre.labelBg : into ? th.hi : th.light ? '#ffffff' : th.bg,
              border: look === 'label' ? 'none' : `1.5px solid ${rgba(th.hi, 0.8)}`,
              borderRadius: look === 'glow' ? 30 : 0,
              boxShadow: look === 'label' ? `0 5px 0 ${genre.accent2}` : glow(th, th.hi, 12, 0.35),
              textTransform: look === 'terminal' ? 'uppercase' : undefined,
            }}
          >
            {tw.lines.map((l, j) => (
              <div key={j}>{l}</div>
            ))}
          </div>,
        );
      }
    }
  });

  /* ---- nodes ---- */
  const nodes = boxes.map((b) => {
    const t0 = at[b.i] ?? 0;
    const pp = interpolate(f, [t0, t0 + 6, t0 + 11], [0.6, 1.06, 1], clamp);
    const op = interpolate(f, [t0, t0 + 5], [0, 1], clamp);
    if (op <= 0) return null;
    const em = b.i === emphasis;
    const tilt = look === 'label' ? (random(`fl${index ?? 0}${b.i}`) - 0.5) * 2.6 : 0;
    const no = String(b.i + 1).padStart(2, '0');
    let box: React.CSSProperties;
    let ink: string;
    if (look === 'label') {
      box = { background: em ? genre.labelBg : th.light ? '#fffaf0' : genre.paper, boxShadow: `0 8px 0 ${em ? genre.accent2 : 'rgba(0,0,0,0.38)'}, 0 20px 32px rgba(0,0,0,0.35)` };
      ink = em ? genre.labelInk : '#1d1a17';
    } else if (look === 'terminal') {
      box = { background: em ? rgba(th.hi, 0.9) : rgba(th.hi, 0.07), border: `1.5px solid ${rgba(th.hi, em ? 1 : 0.7)}`, boxShadow: glow(th, th.hi, em ? 26 : 10, em ? 0.55 : 0.25) };
      ink = em ? th.bg : th.ink;
    } else {
      box = {
        background: th.light ? 'rgba(255,255,255,0.75)' : `linear-gradient(180deg, ${rgba(th.hi, em ? 0.3 : 0.12)} 0%, rgba(0,0,0,0.35) 100%)`,
        border: `2px solid ${rgba(th.hi, em ? 1 : 0.55)}`,
        borderRadius: 16,
        boxShadow: [glow(th, th.hi, em ? 34 : 14, em ? 0.6 : 0.3), th.light ? '' : '0 16px 30px rgba(0,0,0,0.45)'].filter((x) => x && x !== 'none').join(', ') || undefined,
      };
      ink = em ? (th.light ? th.ink : '#ffffff') : th.ink;
    }
    const tagSize = Math.max(16, Math.round(size * 0.52));
    return (
      <div
        key={b.i}
        style={{
          position: 'absolute',
          left: b.x - nodeW / 2,
          top: b.y - nodeH / 2,
          width: nodeW,
          height: nodeH,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '14px 24px',
          opacity: op,
          transform: `scale(${pp}) rotate(${tilt}deg)`,
          ...box,
        }}
      >
        {/* the step number, on a tab */}
        <div
          style={{
            position: 'absolute',
            left: look === 'terminal' ? 10 : 14,
            top: look === 'label' ? -tagSize * 0.8 : -tagSize * 0.62,
            fontFamily: DFONT[look === 'terminal' ? 'plexMono' : th.numFont],
            fontWeight: 700,
            fontSize: tagSize,
            lineHeight: 1,
            padding: look === 'label' ? '5px 9px 3px' : '3px 8px',
            color: look === 'label' ? (em ? genre.labelBg : genre.labelInk) : em ? th.bg : th.hi,
            background: look === 'label' ? (em ? genre.accent2 : genre.labelBg) : em ? th.hi : th.light ? '#ffffff' : th.bg,
            border: look === 'label' ? 'none' : `1.5px solid ${rgba(th.hi, 0.8)}`,
            borderRadius: look === 'glow' ? 20 : 0,
          }}
        >
          {look === 'terminal' ? `[${no}]` : no}
        </div>
        {b.label.map((l, k) => (
          <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: look === 'terminal' ? 600 : 700, fontSize: size, lineHeight: 1.12, color: ink, whiteSpace: 'nowrap', textAlign: 'center', textTransform: look === 'terminal' ? 'uppercase' : undefined, letterSpacing: look === 'terminal' ? '0.04em' : undefined }}>
            {l}
          </div>
        ))}
      </div>
    );
  });

  return (
    <InfoStage genre={genre} th={th} seed={`flow${index ?? 0}`} durFrames={durFrames} speed={speed} title={title} locale={locale}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {arrows}
      </svg>
      {nodes}
      {tags}
    </InfoStage>
  );
};

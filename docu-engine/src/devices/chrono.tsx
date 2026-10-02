import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Genre, TimelineScene } from '../types';
import { DevProps, GenreBg, H, TitleTag, W, clamp, ease, safeBand } from './common';
import { DFONT, DevFont, fitLine, fitWrap, measure } from './type';

/*
 * TIMELINE — a time axis the camera travels along. Events light up as the
 * camera reaches them (tick, year, label), a bright line fills the axis
 * behind the camera, and on arrival at `focus` everything before it dims.
 * Horizontal for up to six events, vertical for longer lists (or `orient`).
 * Spacing follows the dates where they are numbers, but never closer than a
 * readable gap.
 */

const SH = 640;
const SV = 250;

interface Ev {
  year: string;
  label: string[];
  labelSize: number;
  yearSize: number;
  pos: number;
  /** Half the event's drawn extent ACROSS the axis direction's travel: half its width (horizontal), half its height (vertical). */
  half: number;
}

/** Nothing may be drawn closer than this to the frame edge; an event fades out across it. */
export const CHRONO_SAFE = 96;
/** The camera never pulls back further than this to keep the focus's neighbours whole. */
const Z_MIN = 0.7;
/** The end-of-shot creep (push) at speed 1, horizontal: every fit leaves room for it. */
const creepMax = (speed: number, vertical: boolean) => (1 + 0.035 * speed) * (1 + (vertical ? 0.03 : 0.015));

function yearNum(y: string | number): number | null {
  const m = String(y).match(/-?\d{1,4}/);
  return m ? Number(m[0]) : null;
}

function lookOf(g: Genre) {
  const yearFont: DevFont = g.look === 'terminal' ? 'plexMono' : g.headline;
  const labelFont: DevFont = g.look === 'terminal' ? 'plexMono' : g.body;
  return { yearFont, labelFont };
}

export function chronoLayout(scene: TimelineScene, g: Genre) {
  const raw = (scene.events ?? []).slice(0, 16);
  const n = Math.max(1, raw.length);
  const vertical = scene.orient ? scene.orient === 'vertical' : n > 6;
  const { yearFont, labelFont } = lookOf(g);
  const gap = vertical ? SV : SH;
  // Rank spacing blended with date spacing; never under 78% of the gap.
  const nums = raw.map((e) => yearNum(e.year));
  const allNum = nums.every((v) => v != null) && nums.length > 1 && nums[nums.length - 1]! !== nums[0]!;
  const pos: number[] = [];
  raw.forEach((_, i) => {
    let p = i * gap;
    if (allNum) {
      const prop = ((nums[i]! - nums[0]!) / (nums[nums.length - 1]! - nums[0]!)) * (n - 1) * gap;
      p = 0.55 * p + 0.45 * prop;
    }
    if (i > 0) p = Math.max(p, pos[i - 1] + gap * 0.78);
    pos.push(p);
  });
  const trackYear = g.look === 'glow' ? 0.08 : 0.02;
  const events: Ev[] = raw.map((e, i) => {
    const year = String(e.year ?? '').trim();
    const room = vertical ? 330 : Math.min(gap * 0.9, (i + 1 < n ? pos[i + 1] - pos[i] : gap) * 0.92);
    const yearSize = fitLine(year, yearFont, { maxW: room, cap: vertical ? 104 : 128, min: 30, trackEm: trackYear });
    const lf = fitWrap(String(e.label ?? '').trim(), labelFont, vertical ? { maxW: 900, maxH: SV * 0.66, lineH: 1.16, cap: 50, min: 22, maxLines: 3, balance: true } : { maxW: room * 0.96, maxH: 190, lineH: 1.18, cap: 42, min: 22, maxLines: 4, balance: true });
    let half: number;
    if (vertical) {
      half = Math.max(yearSize * (g.look === 'label' ? 1.4 : 1.1), lf.lines.length * lf.size * 1.18) / 2 + 10;
    } else {
      // The year card (padded in the 'label' look, 10% larger on the focus) or the widest label line.
      const yearW = measure(year, yearFont, yearSize, { trackEm: trackYear }) * 1.1 + (g.look === 'label' ? 44 : 0);
      const labelW = Math.max(0, ...lf.lines.map((l) => measure(l, labelFont, lf.size)));
      half = Math.max(yearW, labelW) / 2 + 8;
    }
    return { year, label: lf.lines, labelSize: lf.size, yearSize, pos: pos[i], half };
  });
  const focus = scene.focus != null && events[scene.focus] ? scene.focus : events.length - 1;
  return { events, vertical, focus, yearFont, labelFont, trackYear, length: pos[pos.length - 1] ?? 0 };
}

/**
 * Where the camera starts (c0) and settles (c1) on the axis, and how far it
 * pulls back by the end (zEnd). Horizontal: when every event — measured by its
 * widest line, not its dot — fits inside the safe area with the end creep, the
 * whole axis is held centred. Otherwise the shot settles on the focus with as
 * many whole neighbours as fit at >= Z_MIN; the start frames the first event's
 * left edge on the safe margin. (The old framing aimed at the focus's
 * neighbours by their dots: with 3 events, the first one's label hung off the
 * left edge on the held shot — "971", "ember night".)
 */
export function chronoCamera(L: ReturnType<typeof chronoLayout>, view: { top: number; bottom: number }, speed = 1) {
  const n = L.events.length;
  const ext = L.events.map((e) => [e.pos - e.half, e.pos + e.half] as const);
  const fpos = L.events[L.focus]?.pos ?? 0;
  if (L.vertical) {
    const viewSpan = view.bottom - view.top;
    const whole = L.length + SV * 0.9;
    const fitsAll = whole <= viewSpan;
    const first = L.events[0]?.pos ?? 0;
    const c0 = fitsAll ? L.length / 2 : first + viewSpan * 0.32;
    const c1 = fitsAll ? L.length / 2 : Math.max(c0, fpos);
    return { c0, c1, zEnd: 1, fitsAll };
  }
  const room = (W - 2 * CHRONO_SAFE) / creepMax(speed, false);
  const allL = Math.min(...ext.map((x) => x[0]));
  const allR = Math.max(...ext.map((x) => x[1]));
  if (!n || allR - allL <= room) {
    const c = n ? (allL + allR) / 2 : 0;
    return { c0: c, c1: c, zEnd: 1, fitsAll: true };
  }
  const span = (a: number, b: number) => ext[b][1] - ext[a][0];
  let lo = L.focus;
  let hi = L.focus;
  // Neighbours in, nearest first, while the shot stays at or above Z_MIN.
  for (let grown = true; grown; ) {
    grown = false;
    const cands = [lo - 1, hi + 1].filter((k) => k >= 0 && k < n).sort((a, b) => Math.abs(L.events[a].pos - fpos) - Math.abs(L.events[b].pos - fpos));
    for (const k of cands) {
      const a = Math.min(lo, k);
      const b = Math.max(hi, k);
      if (room / span(a, b) >= Z_MIN) {
        lo = a;
        hi = b;
        grown = true;
        break;
      }
    }
  }
  const zEnd = Math.min(1, room / span(lo, hi));
  const c1 = (ext[lo][0] + ext[hi][1]) / 2;
  const c0 = Math.min(c1, allL + room / 2);
  return { c0, c1, zEnd, fitsAll: false };
}

/**
 * Opacity of an event whose drawn extent [a, b] (screen px along the travel
 * axis) nears the frame edge: 1 while it is inside the safe margin, 0 before
 * any of it could leave the frame (0..size).
 */
export function edgeFade(a: number, b: number, size: number, safe = CHRONO_SAFE): number {
  const inner = Math.min(a, size - b);
  return Math.max(0, Math.min(1, inner / safe));
}

export const Chrono: React.FC<DevProps & { scene: TimelineScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useMemo(() => chronoLayout(scene, genre), [scene, genre]);
  const band = safeBand(genre, 24);
  const title = String(scene.title ?? '').trim();
  const look = genre.look;
  const V = L.vertical;
  const accent = genre.accent;
  const ink = genre.ink;
  const lit = look === 'label' ? genre.labelBg : accent;

  /* ---- camera: along the axis, from the first event to the focus ---- */
  const top = band.top + (title ? 70 : 0);
  const bottom = band.bottom;
  const fpos = L.events[L.focus]?.pos ?? 0;
  const z = 1;
  /*
   * Where the camera settles: on the focus with its neighbours whole, or the
   * whole axis when it fits (chronoCamera). Every event is measured by what
   * it draws, so no label is cut at the frame edge on the held shot.
   */
  const { c0, c1, zEnd, fitsAll } = useMemo(() => chronoCamera(L, { top, bottom }, speed), [L, top, bottom, speed]);
  const moveA = Math.round(0.35 * fps);
  const arrive = Math.max(moveA + Math.round(1.2 * fps), Math.min(durFrames - Math.round(1.3 * fps), Math.round(durFrames * 0.68)));
  const m = interpolate(f, [moveA, arrive], [0, 1], { ...clamp, easing: ease });
  const drift = interpolate(f, [0, durFrames], [0, 1], clamp);
  const cam = c0 + (c1 - c0) * m;
  const push = (1 + (zEnd - 1) * m) * (1 + 0.035 * speed * drift + (V ? 0.03 : 0.015) * interpolate(f, [arrive, durFrames], [0, 1], clamp));
  // Screen position of the axis point `p`.
  const ax = V ? Math.round(W * 0.36) : 0;
  const ay = V ? 0 : Math.round(top + (bottom - top) * 0.48);
  const scr = (p: number) => (V ? (p - cam) * z + (top + bottom) / 2 : (p - cam) * z + W / 2);
  // When the camera reveals each event: the first frame it is inside the view.
  const edge = V ? bottom - 40 : W - 180;
  const appear = L.events.map((e) => {
    for (let k = 0; k <= arrive; k += 2) {
      const mk = interpolate(k, [moveA, arrive], [0, 1], { ...clamp, easing: ease });
      const ck = c0 + (c1 - c0) * mk;
      const s = V ? (e.pos - ck) * z + (top + bottom) / 2 : (e.pos - ck) * z + W / 2;
      if (s <= edge) return Math.max(Math.round(0.2 * fps), k) + (fitsAll ? Math.round(L.events.indexOf(e) * 0.28 * fps) : 0);
    }
    return arrive;
  });
  const settled = interpolate(f, [arrive - 4, arrive + 10], [0, 1], clamp);

  /* ---- axis ---- */
  const a0 = (L.events[0]?.pos ?? 0) - (V ? 140 : 360);
  const a1 = (L.events[L.events.length - 1]?.pos ?? 0) + (V ? 160 : 360);
  const head = Math.min(a1, V ? cam + (bottom - top) * 0.5 : cam + 60);
  const axisW = look === 'label' ? 7 : look === 'terminal' ? 2 : 2.5;
  const axisIn = interpolate(f, [0, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const glow = look !== 'label' ? `drop-shadow(0 0 8px ${accent}aa)` : undefined;
  const line = (p0: number, p1: number, color: string, width: number, opacity: number, key: string) => {
    const s0 = scr(p0);
    const s1 = scr(p1);
    return V ? (
      <div key={key} style={{ position: 'absolute', left: ax - width / 2, top: Math.min(s0, s1), width, height: Math.abs(s1 - s0), background: color, opacity, filter: key === 'lit' ? glow : undefined }} />
    ) : (
      <div key={key} style={{ position: 'absolute', top: ay - width / 2, left: Math.min(s0, s1), height: width, width: Math.abs(s1 - s0), background: color, opacity, filter: key === 'lit' ? glow : undefined }} />
    );
  };
  const axisEnd = a0 + (a1 - a0) * axisIn;

  // Terminal ticks: a scale under the axis.
  let ticks: React.ReactNode = null;
  if (look === 'terminal') {
    const out: React.ReactNode[] = [];
    for (let p = Math.ceil(a0 / 40) * 40; p <= axisEnd; p += 40) {
      const s = scr(p);
      if (s < -20 || s > (V ? H : W) + 20) continue;
      const big = Math.round(p / 40) % 5 === 0;
      out.push(V ? <div key={p} style={{ position: 'absolute', left: ax - (big ? 14 : 7), top: s, width: big ? 28 : 14, height: 1, background: accent, opacity: 0.45 }} /> : <div key={p} style={{ position: 'absolute', top: ay - (big ? 14 : 7), left: s, height: big ? 28 : 14, width: 1, background: accent, opacity: 0.45 }} />);
    }
    ticks = out;
  }

  const spanCap = (txt: string | number | undefined, p: number, align: 'start' | 'end') => {
    const t = String(txt ?? '').trim();
    if (!t) return null;
    const s = scr(p);
    // The caps sit at the axis ends, often at the frame edge: like the events, they fade out before a letter is cut ("194").
    const w = measure(t, L.labelFont, 24, { trackEm: 0.14 });
    let edgeOp = 1;
    if (V) {
      const y0 = scr(fpos);
      const on = y0 + (s + (align === 'start' ? -34 : 6) - y0) * push;
      edgeOp = Math.max(0, Math.min(1, 1 + Math.min(on - top, bottom - (on + 24 * push)) / 60));
    } else {
      const on = W / 2 + (s - W / 2) * push;
      edgeOp = align === 'end' ? edgeFade(on - w * push, on, W) : edgeFade(on, on + w * push, W);
    }
    if (edgeOp <= 0) return null;
    const style: React.CSSProperties = { position: 'absolute', fontFamily: DFONT[L.labelFont], fontWeight: 600, fontSize: 24, letterSpacing: '0.14em', color: ink, opacity: 0.55 * axisIn * edgeOp, whiteSpace: 'nowrap' };
    return V ? (
      <div key={align} style={{ ...style, left: ax + 22, top: s - (align === 'start' ? 34 : -6) }}>
        {t}
      </div>
    ) : (
      <div key={align} style={{ ...style, top: ay + 22, left: s, transform: align === 'end' ? 'translateX(-100%)' : undefined }}>
        {t}
      </div>
    );
  };

  /* ---- events ---- */
  const evs = L.events.map((e, i) => {
    const t = f - appear[i];
    if (t < 0) return null;
    const s = scr(e.pos);
    if (s < -700 || s > (V ? H : W) + 700) return null;
    const pop = interpolate(t, [0, 5, 9], [0, 1.3, 1], clamp);
    const yP = interpolate(t, [2, 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const lP = interpolate(t, [7, 17], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const isF = i === L.focus;
    /*
     * Where the event is drawn after the push (scaled about the axis origin):
     * an event whose year or label nears the frame edge fades out before any
     * letter could leave the frame — a clipped "971" never reaches the screen.
     */
    const oS = V ? scr(fpos) : W / 2;
    const sOn = oS + (s - oS) * push;
    const hOn = e.half * push;
    const edgeOp = V
      ? Math.max(0, Math.min(1, 1 + Math.min(sOn - hOn - top, bottom - (sOn + hOn)) / 60))
      : edgeFade(sOn - hOn, sOn + hOn, W);
    if (edgeOp <= 0) return null;
    const dim = (isF ? 1 : i < L.focus ? 1 - 0.62 * settled : 1 - 0.4 * settled) * edgeOp;
    const grow = isF ? 1 + 0.1 * settled : 1;
    const yearColor = isF ? (look === 'label' ? genre.labelInk : accent) : look === 'label' ? genre.labelInk : look === 'terminal' ? accent : genre.titleInk ?? ink;
    const yearStyle: React.CSSProperties = {
      fontFamily: DFONT[L.yearFont],
      fontWeight: look === 'terminal' ? 600 : 700,
      fontSize: e.yearSize,
      lineHeight: 1,
      letterSpacing: `${L.trackYear}em`,
      color: yearColor,
      whiteSpace: 'nowrap',
      textShadow: look === 'glow' ? `0 0 ${isF ? 30 : 18}px ${accent}${isF ? 'aa' : '55'}, 0 3px 12px #000` : look === 'terminal' ? `0 0 14px ${accent}66` : undefined,
    };
    const yearBox =
      look === 'label' ? (
        <div style={{ display: 'inline-block', background: isF ? genre.labelBg : genre.paper, padding: '10px 20px 4px', boxShadow: `0 7px 0 ${isF ? genre.accent2 : 'rgba(0,0,0,0.35)'}`, transform: `rotate(${i % 2 ? 1.2 : -1.2}deg)` }}>
          <div style={{ ...yearStyle, color: isF ? genre.labelInk : '#1d1a17' }}>{e.year}</div>
        </div>
      ) : (
        <div style={yearStyle}>{e.year}</div>
      );
    const labelEl = (
      <div
        style={{
          fontFamily: DFONT[L.labelFont],
          fontWeight: look === 'terminal' ? 400 : 600,
          fontSize: e.labelSize,
          lineHeight: 1.18,
          color: ink,
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          textAlign: V ? 'left' : 'center',
        }}
      >
        {e.label.map((l, k) => (
          <div key={k} style={{ whiteSpace: 'nowrap' }}>
            {l}
          </div>
        ))}
      </div>
    );
    const dot = (
      <div
        style={{
          position: 'absolute',
          left: (V ? ax : s) - 13,
          top: (V ? s : ay) - 13,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: isF ? lit : look === 'label' ? ink : genre.bg,
          border: `${look === 'label' ? 0 : 3}px solid ${isF ? lit : accent}`,
          transform: `scale(${pop * grow})`,
          boxShadow: look !== 'label' ? `0 0 16px ${accent}88` : '0 3px 8px rgba(0,0,0,0.5)',
        }}
      />
    );
    const ring =
      isF && settled > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: (V ? ax : s) - 34,
            top: (V ? s : ay) - 34,
            width: 68,
            height: 68,
            borderRadius: '50%',
            border: `2px solid ${lit}`,
            opacity: 0.8 * (1 - ((f - arrive) % 40) / 40),
            transform: `scale(${0.6 + (((f - arrive) % 40) / 40) * 0.9})`,
          }}
        />
      ) : null;
    const stem = V ? null : <div style={{ position: 'absolute', left: s - 1, top: ay - 70 * yP, width: 2, height: 70 * yP, background: isF ? lit : ink, opacity: 0.6 }} />;
    return (
      <div key={i} style={{ opacity: dim }}>
        {stem}
        {ring}
        {dot}
        {V ? (
          <>
            <div style={{ position: 'absolute', right: W - ax + 44, top: s, transform: `translateY(-50%) translateX(${(1 - yP) * 30}px) scale(${grow})`, transformOrigin: '100% 50%', opacity: yP }}>
              {yearBox}
            </div>
            <div style={{ position: 'absolute', left: ax + 44, top: s, transform: `translateY(-50%) translateX(${(1 - lP) * -24}px)`, opacity: lP }}>{labelEl}</div>
          </>
        ) : (
          <>
            <div style={{ position: 'absolute', left: s, bottom: H - ay + 84, transform: `translateX(-50%) translateY(${(1 - yP) * 26}px) scale(${grow})`, transformOrigin: '50% 100%', opacity: yP }}>
              {yearBox}
            </div>
            <div style={{ position: 'absolute', left: s, top: ay + 40, transform: `translateX(-50%) translateY(${(1 - lP) * -20}px)`, opacity: lP }}>{labelEl}</div>
          </>
        )}
      </div>
    );
  });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: genre.bg }}>
      <GenreBg genre={genre} seed={`tl${index ?? 0}`} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)` }} />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: V ? `${ax}px ${scr(fpos)}px` : `${W / 2}px ${ay}px` }}>
        {line(a0, axisEnd, look === 'label' ? ink : accent, axisW, look === 'label' ? 0.35 : 0.3, 'base')}
        {ticks}
        {line(a0, Math.min(axisEnd, head), look === 'label' ? lit : accent, axisW, 1, 'lit')}
        {scene.span ? spanCap(scene.span[0], a0, 'start') : null}
        {scene.span ? spanCap(scene.span[1], a1, 'end') : null}
        {evs}
      </AbsoluteFill>
      <TitleTag genre={genre} text={title} locale={locale} top={band.top} />
    </AbsoluteFill>
  );
};

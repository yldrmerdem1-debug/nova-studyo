import React, { useMemo } from 'react';
import { Easing, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import type { StatScene } from '../types';
import type { DevProps } from '../devices/common';
import { clamp } from '../devices/common';
import { DFONT, type DevFont, measure } from '../devices/type';
import { infoPlan, parseStat, type StatPlan } from './timing.js';
import { InfoStage, SOFT, fmtNum, glow, infoBand, infoTheme, isTrLocale, prog, rgba, fitText } from './theme';

/*
 * BIG-NUMBER STAT CARD — an editorial card set flush left: an accent rule
 * draws, the figure rolls up on odometer wheels (each digit its own wheel,
 * motion-blurred while it spins) and lands on the spoken number; a label and
 * a line of context follow. A trend adds an arrow and a sparkline that draws
 * with the count. A value holding several numbers ("1 in 3") types in instead.
 */

/** The value as shown: a single number is re-set in the locale ("5,800" -> "5.800"; Turkish puts % first). */
export function statDisplay(value: string, locale: string) {
  const p = parseStat(value);
  const tr = isTrLocale(locale);
  if (p.groups !== 1 || !Number.isFinite(p.num)) return { mode: 'type' as const, text: p.text, pre: '', num: '', suf: '', n: 0, dec: 0 };
  let pre = p.pre;
  let suf = p.suf;
  if (tr && suf.trim() === '%') {
    pre = `%${pre}`;
    suf = '';
  } else if (!tr && pre.trim() === '%') {
    pre = '';
    suf = `%${suf}`;
  }
  const num = fmtNum(p.num, locale, p.decimals);
  return { mode: 'roll' as const, text: `${pre}${num}${suf}`, pre, num, suf, n: Math.round(p.num * 10 ** p.decimals), dec: p.decimals };
}

/**
 * One odometer wheel: digits 0-9-0 stacked, rolled to `pos` (0..10). The
 * window is taller than the glyph (room for its shadow) and the digits are
 * spaced by the window, so a settled wheel never shows its neighbour.
 */
const Wheel: React.FC<{ pos: number; size: number; w: number; blur: number; dim: boolean }> = ({ pos, size, w, blur, dim }) => {
  // Digits sit 1.3 em apart in a window 1.3 em tall that fades out at top and bottom (a drum seen
  // through a slot); the window is wider than the digit so a glow or hard shadow is never cut square.
  const lh = size * 1.3;
  const pad = size * 0.35;
  const fade = 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000 17%, #000 83%, rgba(0,0,0,0) 100%)';
  return (
    <span style={{ display: 'inline-block', position: 'relative', width: w, height: size, verticalAlign: 'bottom', opacity: dim ? 0.2 : 1 }}>
      <span style={{ position: 'absolute', left: -pad, top: (size - lh) / 2, width: w + 2 * pad, height: lh, overflow: 'hidden', WebkitMaskImage: fade, maskImage: fade }}>
        <span style={{ position: 'absolute', left: 0, top: 0, width: w + 2 * pad, transform: `translateY(${-pos * lh}px)` }}>
          {Array.from({ length: 11 }, (_, k) => (
            <span key={k} style={{ display: 'block', height: lh, lineHeight: `${lh}px`, textAlign: 'center', filter: blur > 0.4 ? `blur(${Math.min(4, blur)}px)` : undefined }}>
              {k % 10}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
};

/**
 * Wheel position of decimal place `p` for the running value `v`: the units
 * wheel turns continuously; every higher wheel only turns while the wheel
 * below it passes 9 -> 0 — a real odometer, readable on any frame.
 */
function wheelPos(v: number, p: number): number {
  const unit = 10 ** p;
  const d = Math.floor(v / unit) % 10;
  if (p === 0) return v % 10;
  const below = (v % unit) / unit;
  const k = Math.max(0, (below - 0.9) / 0.1);
  return d + k * k * (3 - 2 * k);
}

export const Stat: React.FC<DevProps & { scene: StatScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const th = useMemo(() => infoTheme(genre, scene), [genre, scene]);
  const band = infoBand(genre, false);
  const plan = useMemo(() => infoPlan(scene, durFrames, fps) as StatPlan, [scene, durFrames, fps]);
  const D = useMemo(() => statDisplay(scene.value, locale), [scene.value, locale]);
  const trend = scene.trend === 'up' || scene.trend === 'down' ? scene.trend : null;
  const font: DevFont = th.numFont;

  /* ---- layout: centred on its own; with a trend, a text column on the left and the sparkline on the right ---- */
  const centred = !trend;
  const x0 = centred ? band.left : band.left + 30;
  const maxW = centred ? band.right - band.left : 1010;
  const arrowK = trend ? 0.62 : 0;
  const w1 = measure(D.text, font, 100) / 100;
  const valueSize = Math.floor(Math.min(centred ? 300 : 250, (maxW - 40) / Math.max(0.5, w1 * 1.1 + arrowK + 0.1)));
  const label = String(scene.label ?? '').trim();
  const sub = String(scene.sub ?? '').trim();
  const lab = fitText(label, th.labelFont, { maxW: Math.min(maxW, centred ? 1400 : 1000), maxH: 170, lineH: 1.12, cap: centred ? 70 : 62, min: 26, maxLines: 2, balance: true });
  const sb = sub ? fitText(sub, th.labelFont, { maxW: Math.min(maxW, centred ? 1250 : 960), maxH: 110, lineH: 1.22, cap: 38, min: 20, maxLines: 2, balance: true }) : null;
  const ruleH = 40;
  const blockH = ruleH + valueSize * 1.02 + 24 + lab.lines.length * lab.size * 1.12 + (sb ? 22 + sb.lines.length * sb.size * 1.22 : 0);
  const y0 = band.top + Math.max(0, (band.bottom - band.top - blockH) / 2) - 10;
  const valueW = w1 * valueSize * 1.1;
  const textRight = x0 + Math.max(valueW + arrowK * valueSize, ...lab.lines.map((l) => measure(l, th.labelFont, lab.size)), ...(sb?.lines.map((l) => measure(l, th.labelFont, sb.size)) ?? [0]));

  /* ---- motion ---- */
  const e = prog(f, plan.start, plan.land - plan.start, Easing.bezier(0.25, 0.1, 0.1, 1));
  const eNext = prog(f + 1, plan.start, plan.land - plan.start, Easing.bezier(0.25, 0.1, 0.1, 1));
  const ruleP = prog(f, plan.lead, 16, SOFT);
  const inP = prog(f, plan.start - 4, 8, SOFT);
  const landPop = interpolate(f, [plan.land, plan.land + 4, plan.land + 12], [1, 1.045, 1], clamp);
  const flash = interpolate(f, [plan.land, plan.land + 3, plan.land + 14], [0, 0.7, 0], clamp);
  const labP = prog(f, plan.labelAt, 14, SOFT);
  const subP = prog(f, plan.subAt, 14, SOFT);
  const color = th.hi;
  const shadow = th.look === 'label' ? `0 ${Math.round(valueSize * 0.045)}px 0 ${th.hiShadow}` : glow(th, color, 40, 0.5 + 0.3 * flash);

  /* ---- the figure ---- */
  let figure: React.ReactNode;
  if (D.mode === 'roll') {
    const v = D.n * e;
    const vN = D.n * eNext;
    const digitW = measure('0', font, valueSize) * 1.02;
    const chars = [...D.num];
    const digitsTotal = chars.filter((c) => c >= '0' && c <= '9').length;
    let place = digitsTotal;
    const cols = chars.map((c, k) => {
      if (c < '0' || c > '9') return <span key={k}>{c}</span>;
      place--;
      const unit = 10 ** place;
      const pos = wheelPos(Math.max(0, v), place);
      // Only the units wheel can spin fast enough to smear.
      const spin = place === 0 ? Math.abs(vN - v) : 0;
      // A wheel above the current value is a leading zero: dim until the count reaches it.
      const dim = place > 0 && v < unit && e < 1;
      return <Wheel key={k} pos={e >= 1 ? Number(c) : pos} size={valueSize} w={digitW} blur={e >= 1 || th.look === 'label' ? 0 : Math.min(3, spin * 0.8)} dim={dim} />;
    });
    figure = (
      <>
        {/* pre: a flex row trims a span's edge spaces ("4 hours" showed as "4HOURS") */}
        {D.pre ? <span style={{ whiteSpace: 'pre' }}>{D.pre}</span> : null}
        {cols}
        {D.suf ? <span style={{ whiteSpace: 'pre' }}>{D.suf}</span> : null}
      </>
    );
  } else {
    const n = [...D.text].length;
    const shown = [...D.text].slice(0, Math.ceil(n * e)).join('');
    const cursorOn = e < 1 || Math.floor((f - plan.land) / 8) % 2 === 0;
    figure = (
      <>
        <span>{shown}</span>
        {f < plan.land + 40 && cursorOn ? <span style={{ display: 'inline-block', width: valueSize * 0.08, height: valueSize * 0.82, background: color, marginLeft: valueSize * 0.06, verticalAlign: 'baseline', transform: 'translateY(8%)' }} /> : null}
      </>
    );
  }

  /* ---- trend: arrow + sparkline ---- */
  let arrow: React.ReactNode = null;
  let spark: React.ReactNode = null;
  if (trend) {
    const up = trend === 'up';
    const tc = up ? th.hi : th.alt;
    const a = valueSize * 0.5;
    const ap = prog(f, plan.land - 6, 12, SOFT);
    arrow = (
      <svg width={a} height={a} viewBox="0 0 24 24" style={{ marginLeft: valueSize * 0.12, transform: `translateY(${(1 - ap) * (up ? 30 : -30)}px) rotate(${up ? 0 : 180}deg)`, opacity: ap, overflow: 'visible', alignSelf: 'center' }}>
        <path d="M12 2 L22 13 H15.5 V22 H8.5 V13 H2 Z" fill={tc} style={{ filter: th.look === 'label' ? `drop-shadow(0 2px 0 ${rgba('#000000', 0.4)})` : th.light ? undefined : `drop-shadow(0 0 6px ${rgba(tc, 0.8)})` }} />
      </svg>
    );
    // A stylised trend line (direction only; not data), drawn with the count, in its own panel right of the text.
    const inBox = true;
    const sx0 = Math.max(textRight + 80, 1160);
    const sx1 = band.right;
    const mid = y0 + ruleH + valueSize * 0.55;
    const sy0 = Math.max(band.top + 20, mid - 190);
    const sy1 = Math.min(band.bottom - 20, mid + 190);
    const N = 26;
    const pts = Array.from({ length: N }, (_, i) => {
      const t = i / (N - 1);
      const r = random(`st${index ?? 0}${scene.value}${i}`) - 0.5;
      const base = up ? 0.85 - 0.72 * Math.pow(t, 1.4) : 0.15 + 0.72 * Math.pow(t, 1.4);
      const y = Math.max(0.03, Math.min(0.97, base + r * 0.16 * (i === N - 1 ? 0 : 1)));
      return { x: sx0 + (sx1 - sx0) * t, y: sy0 + (sy1 - sy0) * y };
    });
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const area = `${d} L${sx1} ${sy1} L${sx0} ${sy1} Z`;
    const sp = prog(f, plan.start - 4, plan.land - plan.start + 12, Easing.inOut(Easing.cubic));
    const last = pts[N - 1];
    const gid = `spk${index ?? 0}`;
    const op = inBox ? 1 : 0.5;
    spark = (
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: op }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tc} stopOpacity={0.28} />
            <stop offset="100%" stopColor={tc} stopOpacity={0} />
          </linearGradient>
          <clipPath id={`${gid}c`}>
            <rect x={sx0 - 10} y={0} width={(sx1 - sx0 + 20) * sp} height={1080} />
          </clipPath>
        </defs>
        {/* the panel's hairlines: a quiet scale behind the line */}
        {[0, 0.5, 1].map((q) => (
          <line key={q} x1={sx0} x2={sx0 + (sx1 - sx0) * prog(f, plan.lead, 18, SOFT)} y1={sy0 + (sy1 - sy0) * q} y2={sy0 + (sy1 - sy0) * q} stroke={rgba(th.look === 'terminal' ? th.hi : th.ink, q === 1 ? 0.3 : 0.1)} strokeWidth={q === 1 ? 2 : 1} strokeDasharray={q === 1 ? undefined : '4 8'} />
        ))}
        <g clipPath={`url(#${gid}c)`}>
          <path d={area} fill={`url(#${gid})`} />
          <path d={d} fill="none" stroke={tc} strokeWidth={th.look === 'label' ? 6 : 4} strokeLinejoin="round" strokeLinecap="round" style={th.look !== 'label' && !th.light ? { filter: `drop-shadow(0 0 8px ${rgba(tc, 0.7)})` } : undefined} />
        </g>
        {sp >= 1 ? (
          <>
            <circle cx={last.x} cy={last.y} r={10} fill={tc} />
            <circle cx={last.x} cy={last.y} r={10 + 22 * ((f % 36) / 36)} fill="none" stroke={tc} strokeWidth={2.5} opacity={1 - (f % 36) / 36} />
          </>
        ) : null}
      </svg>
    );
  }

  // No accent rule over the figure (thin bars read as a template — user); the figure and its label carry it.
  const ruleEl: React.ReactNode = null;

  return (
    <InfoStage genre={genre} th={th} seed={`stat${index ?? 0}`} durFrames={durFrames} speed={speed} locale={locale} origin={centred ? '50% 50%' : `${x0}px 50%`}>
      {spark}
      <div style={{ position: 'absolute', left: x0, top: y0, width: centred ? maxW : undefined, textAlign: centred ? 'center' : 'left' }}>
        <div style={{ height: ruleH, display: 'flex', alignItems: 'flex-start', justifyContent: centred ? 'center' : 'flex-start' }}>{ruleEl}</div>
        <div
          style={{
            display: 'flex',
            justifyContent: centred ? 'center' : 'flex-start',
            alignItems: 'flex-end',
            whiteSpace: 'nowrap',
            fontFamily: DFONT[font],
            fontWeight: 700,
            fontSize: valueSize,
            lineHeight: 1,
            color,
            fontVariantNumeric: 'lining-nums tabular-nums',
            textShadow: shadow,
            opacity: inP,
            transform: `translateY(${(1 - inP) * 24}px) scale(${landPop})`,
            transformOrigin: centred ? '50% 100%' : '0% 100%',
          }}
        >
          {figure}
          {arrow}
        </div>
        <div style={{ marginTop: 24, opacity: labP, transform: `translateY(${(1 - labP) * 18}px)` }}>
          {lab.lines.map((l, k) => (
            <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: 700, fontSize: lab.size, lineHeight: 1.12, color: th.ink, whiteSpace: 'nowrap', textTransform: th.look === 'terminal' ? 'uppercase' : undefined, letterSpacing: th.look === 'terminal' ? '0.04em' : undefined, textShadow: th.light ? 'none' : '0 2px 12px rgba(0,0,0,0.6)' }}>
              {l}
            </div>
          ))}
        </div>
        {sb ? (
          <div style={{ marginTop: 22, opacity: subP * 0.78, transform: `translateY(${(1 - subP) * 14}px)`, ...(centred ? {} : { borderLeft: `3px solid ${rgba(th.hi, 0.7)}`, paddingLeft: 18 }) }}>
            {sb.lines.map((l, k) => (
              <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: 400, fontSize: sb.size, lineHeight: 1.22, color: th.ink, whiteSpace: 'nowrap' }}>
                {l}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </InfoStage>
  );
};

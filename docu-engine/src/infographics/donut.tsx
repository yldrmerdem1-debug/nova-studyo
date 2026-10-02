import React, { useMemo } from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { DonutScene } from '../types';
import type { DevProps } from '../devices/common';
import { clamp } from '../devices/common';
import { DFONT, fitLine, measure } from '../devices/type';
import { infoPlan, type DonutPlan } from './timing.js';
import { InfoStage, NumText, SOFT, glow, infoBand, infoTheme, mix, numEm, numParts, prog, rgba, type InfoTheme, fitText } from './theme';

/*
 * SHARE OF A WHOLE — a ring sweeps round slice by slice (each on its spoken
 * word), its legend row sliding in beside it; on the highlight the slice
 * pulls out of the ring, lights in the accent and its share counts up in the
 * hole. Printed look: flat stock with a hard shadow; glow: lit segments;
 * terminal: a segmented gauge with a tick ring.
 */

const DEG = Math.PI / 180;
const SWEEP = Easing.bezier(0.45, 0, 0.25, 1);

function arc(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  if (a1 - a0 <= 0.0001) return '';
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (r: number, a: number) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  if (a1 - a0 >= Math.PI * 2 - 0.0001) {
    // A full ring: two halves (an arc cannot start and end on the same point).
    const m = a0 + Math.PI;
    return `M${p(r1, a0)} A${r1} ${r1} 0 1 1 ${p(r1, m)} A${r1} ${r1} 0 1 1 ${p(r1, a0)} M${p(r0, a0)} A${r0} ${r0} 0 1 0 ${p(r0, m)} A${r0} ${r0} 0 1 0 ${p(r0, a0)} Z`;
  }
  return `M${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)} Z`;
}

/** Slice colours: the highlight in the accent, the rest a quiet ramp of the look's neutral. */
function sliceColors(th: InfoTheme, n: number, hi: number, bg: string): string[] {
  const out: string[] = [];
  const neutral = th.look === 'label' && !th.light ? '#f0e8d8' : th.ink;
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (i === hi) {
      out.push(th.hi);
      continue;
    }
    if (hi < 0 && i === 0) {
      out.push(th.hi);
      continue;
    }
    if (hi < 0 && i === 1 && th.look !== 'terminal') {
      out.push(th.alt);
      continue;
    }
    // Solid mixes toward the background (no alpha: overlapping shadows would show through).
    const t = [0.12, 0.38, 0.55, 0.68, 0.78, 0.85][Math.min(5, k++)];
    out.push(th.look === 'terminal' ? mix(th.hi, bg, 0.35 + t * 0.6) : mix(neutral, bg, t));
  }
  return out;
}

export const Donut: React.FC<DevProps & { scene: DonutScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const th = useMemo(() => infoTheme(genre, scene), [genre, scene]);
  const title = String(scene.title ?? '').trim();
  const band = infoBand(genre, !!title);
  const plan = useMemo(() => infoPlan(scene, durFrames, fps) as DonutPlan, [scene, durFrames, fps]);
  const slices = (scene.slices ?? []).slice(0, 8).map((s) => ({ label: String(s?.label ?? '').trim(), value: Math.max(0, Number(s?.value) || 0) }));
  const n = Math.max(1, slices.length);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const hiIdx = Number.isInteger(scene.highlight) && slices[scene.highlight as number] ? (scene.highlight as number) : -1;
  const pcts = slices.map((s) => (s.value / total) * 100);
  const pctDec = pcts.some((p) => p < 10 && Math.abs(p - Math.round(p)) > 0.05) ? 1 : 0;
  const bgMix = th.light ? mix(th.bg, '#ffffff', 0.1) : th.bg;
  const colors = sliceColors(th, n, hiIdx, bgMix);

  /* ---- layout ---- */
  const height = band.bottom - band.top;
  const R = Math.min(height / 2 - 18, 330);
  const cx = band.left + R + 34;
  const cy = band.top + height / 2;
  const thick = R * (th.look === 'terminal' ? 0.24 : 0.36);
  const r0 = R - thick;
  const lx = cx + R + 120;
  const lw = band.right - lx;
  const rowH = Math.min(n <= 3 ? 190 : 140, height / n);
  const pctSize = Math.max(34, Math.min(n <= 3 ? 96 : 70, Math.round(rowH * 0.5)));
  const pctW = Math.max(...slices.map((_, i) => numEm(numParts(pcts[i], '%', locale, { decimals: pctDec }), th.numFont, measure))) * pctSize * 1.1;
  const labW = lw - pctW - 72;
  const labCap = Math.max(24, Math.min(n <= 3 ? 50 : 40, Math.round(rowH * 0.3)));
  const labels = useMemo(
    () => slices.map((s) => fitText(s.label, th.labelFont, { maxW: labW, maxH: Math.max(labCap * 1.2, rowH - 18), lineH: 1.14, cap: labCap, min: 20, maxLines: 2, balance: true })),
    [JSON.stringify(slices), th.labelFont, labW, labCap, rowH],
  );
  const labSize = Math.min(...labels.map((l) => l.size));
  const legendTop = cy - (rowH * n) / 2;

  /* ---- motion ---- */
  const hl = plan.hl ?? 1e9;
  const hiP = plan.hl != null ? prog(f, plan.hl, 12, SOFT) : 0;
  const rot = interpolate(f, [plan.starts[0] ?? 0, plan.drawn + 6], [-28, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
  const gap = n > 1 ? 1.4 * DEG : 0;
  let acc = -90 * DEG;
  const paths: React.ReactNode[] = [];
  const hiPaths: React.ReactNode[] = [];
  slices.forEach((s, i) => {
    const span = (s.value / total) * Math.PI * 2;
    const a0 = acc + gap / 2;
    const a1 = acc + span - gap / 2;
    acc += span;
    const p = prog(f, plan.starts[i] ?? 0, plan.durs[i] ?? 8, SWEEP);
    if (p <= 0 || a1 <= a0) return;
    const end = a0 + (a1 - a0) * p;
    const isHi = i === hiIdx;
    const mid = (a0 + a1) / 2;
    const out = isHi ? 22 * hiP : 0;
    const grow = isHi ? 10 * hiP : 0;
    const dx = Math.cos(mid) * out;
    const dy = Math.sin(mid) * out;
    const d = arc(cx + dx, cy + dy, r0 - grow * 0.2, R + grow, a0, end);
    const fill = colors[i];
    const el = (
      <path
        key={i}
        d={d}
        fill={fill}
        opacity={hiIdx >= 0 && !isHi ? 1 - 0.35 * hiP : 1}
        style={isHi && th.look !== 'label' ? { filter: th.light ? undefined : `drop-shadow(0 0 ${14 * hiP}px ${rgba(fill, 0.7)})` } : undefined}
      />
    );
    (isHi ? hiPaths : paths).push(el);
  });

  // Terminal: the gauge's tick ring and the cut segments.
  let ticks: React.ReactNode = null;
  if (th.look === 'terminal') {
    const tp = prog(f, plan.lead, 20, SOFT);
    const list: React.ReactNode[] = [];
    for (let k = 0; k < 72; k++) {
      if (k / 72 > tp) break;
      const a = -90 * DEG + (k / 72) * Math.PI * 2;
      const big = k % 6 === 0;
      const ra = R + 18;
      const rb = R + (big ? 38 : 28);
      list.push(<line key={k} x1={cx + Math.cos(a) * ra} y1={cy + Math.sin(a) * ra} x2={cx + Math.cos(a) * rb} y2={cy + Math.sin(a) * rb} stroke={rgba(th.hi, big ? 0.6 : 0.3)} strokeWidth={big ? 2 : 1} />);
    }
    ticks = list;
  }
  const track = <circle cx={cx} cy={cy} r={(R + r0) / 2} fill="none" stroke={rgba(th.ink, th.look === 'label' ? 0.08 : 0.07)} strokeWidth={thick} opacity={prog(f, plan.lead, 12, SOFT)} />;
  const seg =
    th.look === 'terminal' ? (
      <g>
        {Array.from({ length: 90 }, (_, k) => {
          const a = (k / 90) * Math.PI * 2;
          return <line key={k} x1={cx + Math.cos(a) * (r0 - 2)} y1={cy + Math.sin(a) * (r0 - 2)} x2={cx + Math.cos(a) * (R + 14)} y2={cy + Math.sin(a) * (R + 14)} stroke={th.bg} strokeWidth={2.2} />;
        })}
      </g>
    ) : null;

  /* ---- centre ---- */
  const center = String(scene.centerLabel ?? '').trim();
  const innerW = r0 * 1.5;
  let centerEl: React.ReactNode = null;
  const cIn = prog(f, Math.min(plan.drawn, plan.hl ?? plan.drawn), 14, SOFT);
  if (center) {
    const fit = fitText(center, th.numFont, { maxW: innerW, maxH: r0 * 1.2, lineH: 1.05, cap: Math.round(r0 * 0.46), min: 22, maxLines: 3, balance: true });
    centerEl = (
      <div style={{ position: 'absolute', left: cx - innerW / 2, top: cy - (fit.lines.length * fit.size * 1.05) / 2, width: innerW, textAlign: 'center', opacity: cIn, transform: `scale(${0.85 + 0.15 * cIn})` }}>
        {fit.lines.map((l, k) => (
          <div key={k} style={{ fontFamily: DFONT[th.numFont], fontWeight: 700, fontSize: fit.size, lineHeight: 1.05, color: hiIdx >= 0 ? th.hi : th.ink, whiteSpace: 'nowrap', textShadow: glow(th, th.hi, 20, 0.5) }}>
            {l}
          </div>
        ))}
      </div>
    );
  } else if (hiIdx >= 0) {
    const cp = prog(f, hl, Math.round(0.8 * fps), Easing.out(Easing.cubic));
    const parts = numParts(pcts[hiIdx] * cp, '%', locale, { decimals: pctDec });
    const final = numParts(pcts[hiIdx], '%', locale, { decimals: pctDec });
    const size = Math.min(Math.round(r0 * 0.62), Math.floor(innerW / Math.max(0.5, numEm(final, th.numFont, measure)) / 1.04));
    const sub = labels[hiIdx]?.lines.join(' ') ?? '';
    const subSize = fitLine(sub, th.labelFont, { maxW: innerW * 0.95, cap: 30, min: 16 });
    centerEl = (
      <div style={{ position: 'absolute', left: cx - innerW / 2, width: innerW, top: cy - size * 0.62, textAlign: 'center', opacity: interpolate(f, [hl - 2, hl + 6], [0, 1], clamp) }}>
        <div style={{ textShadow: glow(th, th.hi, 26, 0.5) }}>
          <NumText p={parts} size={size} font={th.numFont} color={th.hi} />
        </div>
        <div style={{ marginTop: size * 0.12, fontFamily: DFONT[th.labelFont], fontWeight: 600, fontSize: subSize, color: th.ink, opacity: 0.8, whiteSpace: 'nowrap', textTransform: th.look === 'terminal' ? 'uppercase' : undefined }}>{sub}</div>
      </div>
    );
  }

  /* ---- legend ---- */
  const legend = slices.map((s, i) => {
    const lp = prog(f, (plan.starts[i] ?? 0) + 2, 12, SOFT);
    const isHi = i === hiIdx;
    const y = legendTop + i * rowH + rowH / 2;
    const dim = hiIdx >= 0 && !isHi ? 1 - 0.4 * hiP : 1;
    const pp = numParts(pcts[i] * prog(f, plan.starts[i] ?? 0, (plan.durs[i] ?? 8) + 6, SOFT), '%', locale, { decimals: pctDec });
    const lit = isHi && hiP > 0.3;
    return (
      <div key={i} style={{ position: 'absolute', left: lx, top: y, transform: `translate(${(1 - lp) * 30}px, -50%)`, opacity: lp * dim, display: 'flex', alignItems: 'center', height: rowH }}>
        <div
          style={{
            width: 10,
            height: Math.min(rowH * 0.62, 70),
            background: colors[i],
            marginRight: 34,
            boxShadow: th.look === 'label' ? `4px 4px 0 rgba(0,0,0,0.35)` : glow(th, colors[i], 10, 0.5),
            borderRadius: th.look === 'glow' ? 5 : 0,
          }}
        />
        <div style={{ width: pctW, textAlign: 'right', marginRight: 26, transform: lit ? `scale(${1 + 0.08 * hiP})` : undefined, transformOrigin: '100% 50%' }}>
          <NumText p={pp} size={pctSize} font={th.numFont} color={lit ? th.hi : th.ink} style={{ textShadow: lit ? glow(th, th.hi, 20, 0.5) : undefined }} />
        </div>
        <div>
          {labels[i].lines.map((l, k) => (
            <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: 600, fontSize: labSize, lineHeight: 1.14, color: lit ? th.hi : th.ink, opacity: lit ? 1 : 0.86, whiteSpace: 'nowrap', textTransform: th.look === 'terminal' ? 'uppercase' : undefined, letterSpacing: th.look === 'terminal' ? '0.05em' : undefined }}>
              {l}
            </div>
          ))}
        </div>
      </div>
    );
  });

  const shadow = th.look === 'label' ? 'drop-shadow(0 9px 0 rgba(0,0,0,0.35)) drop-shadow(0 20px 26px rgba(0,0,0,0.35))' : th.light ? undefined : 'drop-shadow(0 16px 30px rgba(0,0,0,0.45))';
  const hiShadow = th.look === 'label' ? `drop-shadow(0 9px 0 ${th.hiShadow}) drop-shadow(0 22px 26px rgba(0,0,0,0.4))` : undefined;
  return (
    <InfoStage genre={genre} th={th} seed={`donut${index ?? 0}`} durFrames={durFrames} speed={speed} title={title} locale={locale} origin={`${cx}px ${cy}px`}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {ticks}
        <g transform={`rotate(${rot} ${cx} ${cy})`}>
          {track}
          <g style={{ filter: shadow }}>{paths}</g>
          <g style={{ filter: hiShadow }}>{hiPaths}</g>
          {seg}
        </g>
        {th.look === 'glow' && !th.light ? <circle cx={cx} cy={cy} r={r0 - 12} fill="none" stroke={rgba(th.hi, 0.18)} strokeWidth={1.5} /> : null}
      </svg>
      {centerEl}
      {legend}
    </InfoStage>
  );
};

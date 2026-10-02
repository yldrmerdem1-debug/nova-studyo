import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { BarsScene } from '../types';
import type { DevProps } from '../devices/common';
import { clamp } from '../devices/common';
import { DFONT, fitLine, measure } from '../devices/type';
import { infoPlan, type BarsPlan } from './timing.js';
import { EXPO, InfoStage, NumText, SOFT, decimalsOf, glow, infoBand, infoTheme, numEm, numParts, prog, rgba, type InfoTheme, fitText } from './theme';

/*
 * COMPARISON BARS — the bars grow together from one baseline while their
 * values count up; when the narrator reaches the point of the comparison the
 * highlighted bar lights up in the accent colour, a glint runs along it and
 * the others step back. Horizontal rows (label over the bar, value riding its
 * end) for long labels or many items; columns for up to five short labels.
 */

const HEX6 = /^#[0-9a-f]{6}$/i;

interface Row {
  label: string;
  value: number;
  color?: string;
  i: number;
}

export function barsLayout(scene: BarsScene, th: InfoTheme, band: ReturnType<typeof infoBand>, locale: string) {
  let rows: Row[] = (scene.items ?? [])
    .slice(0, 10)
    .map((it, i) => ({ label: String(it?.label ?? '').trim(), value: Math.max(0, Number(it?.value) || 0), color: HEX6.test(String(it?.color ?? '')) ? it.color : undefined, i }));
  if (scene.sort) rows = [...rows].sort((a, b) => b.value - a.value);
  const n = Math.max(1, rows.length);
  const max = Math.max(1e-9, ...rows.map((r) => r.value));
  const decimals = decimalsOf(rows.map((r) => r.value));
  const compact: 'short' | false = max >= 1e6 ? 'short' : false;
  const parts = rows.map((r) => numParts(r.value, scene.unit, locale, { decimals, compact }));
  const width = band.right - band.left;
  const height = band.bottom - band.top;

  // Columns: up to five items whose labels set in two lines at a readable size.
  const slot = width / n;
  let vertical = n <= 5;
  const colLabels = rows.map((r) => fitText(r.label, th.labelFont, { maxW: slot * 0.86, maxH: 40 * 1.15 * 2, lineH: 1.15, cap: 40, min: 24, maxLines: 2, balance: true }));
  if (vertical && colLabels.some((l) => l.size < 28 || l.lines.some((x) => x.endsWith('…')))) vertical = false;
  if (vertical) {
    const labelSize = Math.min(...colLabels.map((l) => l.size));
    const labels = rows.map((r) => fitText(r.label, th.labelFont, { maxW: slot * 0.86, maxH: labelSize * 1.15 * 2, lineH: 1.15, cap: labelSize, min: labelSize, maxLines: 2, balance: true }));
    const labelH = Math.max(...labels.map((l) => l.lines.length)) * labelSize * 1.15;
    const valueSize = Math.min(88, ...parts.map((p) => Math.floor((slot * 0.9) / Math.max(0.5, numEm(p, th.numFont, measure)) / 1.14)));
    const base = band.bottom - labelH - 30;
    const colTop = band.top + valueSize * 1.3 + 12;
    const colW = Math.min(220, slot * 0.5);
    return { vertical, side: false, barX: band.left, labelW: 0, rows, parts, decimals, compact, max, n, slot, labelSize, labels, valueSize, base, colTop, colW, rowH: 0, barT: 0, labelTop: 0, lenMax: 0 };
  }
  // Rows: label over the bar, the value at the bar's end.
  const rowH = Math.min(165, height / n);
  if (rowH < 118) {
    // Many rows in a short band: labels in a right-aligned column beside the bars (up to two lines each).
    const labelW = Math.min(560, width * 0.34);
    const cap = Math.max(18, Math.min(34, Math.round(rowH * 0.34)));
    const fits = rows.map((r) => fitText(r.label, th.labelFont, { maxW: labelW, maxH: rowH * 0.92, lineH: 1.08, cap, min: 16, maxLines: 2, balance: true, upper: th.look === 'terminal' }));
    const labelSize = Math.min(...fits.map((x) => x.size));
    const labels = rows.map((r) => fitText(r.label, th.labelFont, { maxW: labelW, maxH: rowH * 0.92, lineH: 1.08, cap: labelSize, min: labelSize, maxLines: 2, balance: true, upper: th.look === 'terminal' }));
    const barT = Math.max(14, Math.round(rowH * 0.5));
    const valueSize = Math.max(20, Math.min(56, Math.round(barT * 0.95)));
    const valueW = Math.max(...parts.map((p) => numEm(p, th.numFont, measure) * valueSize * 1.14));
    const barX = band.left + labelW + 30;
    const lenMax = band.right - barX - valueW - 28;
    return { vertical, side: true, barX, labelW, rows, parts, decimals, compact, max, n, slot, labelSize, labels, valueSize, base: 0, colTop: 0, colW: 0, rowH, barT, labelTop: band.top + Math.max(0, (height - rowH * n) / 2), lenMax };
  }
  const labelCap = Math.max(22, Math.min(44, Math.round(rowH * 0.27)));
  const labelSize = Math.min(...rows.map((r) => fitLine(r.label, th.labelFont, { maxW: width * 0.96, cap: labelCap, min: 18 })));
  const barT = Math.max(16, Math.min(66, Math.round(rowH * 0.4)));
  const valueSize = Math.max(22, Math.min(64, Math.round(barT * 0.92)));
  const valueW = Math.max(...parts.map((p) => numEm(p, th.numFont, measure) * valueSize * 1.14));
  const lenMax = width - valueW - 30;
  const labels = rows.map((r) => fitText(r.label, th.labelFont, { maxW: width * 0.96, maxH: labelSize * 1.3, lineH: 1.2, cap: labelSize, min: Math.min(labelSize, 18), maxLines: 1 }));
  return { vertical, side: false, barX: band.left, labelW: 0, rows, parts, decimals, compact, max, n, slot, labelSize, labels, valueSize, base: 0, colTop: 0, colW: 0, rowH, barT, labelTop: band.top + Math.max(0, (height - rowH * n) / 2), lenMax };
}

/** One bar's fill in the genre's look (printed strip / lit gradient / hatched readout). */
function barStyle(th: InfoTheme, color: string, lit: boolean, vertical: boolean): React.CSSProperties {
  if (th.look === 'label') {
    const shadowC = lit ? th.hiShadow : 'rgba(0,0,0,0.38)';
    return {
      background: `repeating-linear-gradient(-45deg, rgba(0,0,0,0.035) 0 6px, rgba(0,0,0,0) 6px 12px), ${color}`,
      boxShadow: vertical ? `8px 0 0 ${shadowC}, 0 18px 30px rgba(0,0,0,0.3)` : `0 8px 0 ${shadowC}, 0 18px 30px rgba(0,0,0,0.3)`,
      borderRadius: 2,
    };
  }
  if (th.look === 'terminal') {
    return lit
      ? { background: color, boxShadow: glow(th, color, 24, 0.55), border: `2px solid ${color}` }
      : { background: `repeating-linear-gradient(${vertical ? '0deg' : '90deg'}, ${rgba(color, 0.6)} 0 2px, rgba(0,0,0,0) 2px 7px)`, border: `2px solid ${rgba(color, 0.9)}` };
  }
  const g = glow(th, color, 28, lit ? 0.6 : 0.2);
  return {
    background: `linear-gradient(${vertical ? '0deg' : '90deg'}, ${rgba(color, th.light ? 0.5 : 0.25)} 0%, ${rgba(color, 0.95)} 100%)`,
    boxShadow: [g !== 'none' ? g : '', th.light ? '' : '0 14px 28px rgba(0,0,0,0.35)'].filter(Boolean).join(', ') || undefined,
    borderRadius: 8,
  };
}

/** The shine that runs along a bar when it lights up. */
const Glint: React.FC<{ p: number; vertical: boolean; radius?: number | string }> = ({ p, vertical, radius }) =>
  p > -0.3 && p < 1.3 ? (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: radius }}>
      <div
        style={{
          position: 'absolute',
          ...(vertical ? { left: 0, width: '100%', top: `${(1 - p) * 100 - 16}%`, height: '26%' } : { top: 0, height: '100%', left: `${p * 100 - 16}%`, width: '26%' }),
          background: `linear-gradient(${vertical ? '0deg' : '90deg'}, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%)`,
        }}
      />
    </div>
  ) : null;

export const Bars: React.FC<DevProps & { scene: BarsScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const th = useMemo(() => infoTheme(genre, scene), [genre, scene]);
  const title = String(scene.title ?? '').trim();
  const band = infoBand(genre, !!title);
  const L = useMemo(() => barsLayout(scene, th, band, locale), [scene, th, band.top, band.bottom, locale]);
  const plan = useMemo(() => infoPlan(scene, durFrames, fps) as BarsPlan, [scene, durFrames, fps]);
  const hiIdx = Number.isInteger(scene.highlight) && (scene.items ?? [])[scene.highlight as number] ? (scene.highlight as number) : -1;
  const anyHi = hiIdx >= 0;
  const hiP = plan.hl != null ? prog(f, plan.hl, 10, SOFT) : 0;
  const upperLabels = th.look === 'terminal';

  const els: React.ReactNode[] = [];
  L.rows.forEach((r, k) => {
    const isHi = r.i === hiIdx;
    // Each bar grows (and its value counts) on its own spoken cue; a bar never named grows with the first one.
    const said = plan.hits[r.i];
    const g = prog(f, said != null ? Math.max(plan.grow, said) : plan.grow + k * 2, plan.growDur, EXPO);
    const frac = r.value / L.max;
    const dim = anyHi && !isHi ? 1 - 0.4 * hiP : 1;
    const lp = prog(f, plan.lead + k * 3, 12, SOFT);
    const shown = numParts(r.value * g, scene.unit, locale, { decimals: L.decimals, compact: L.compact, scaleFrom: r.value });
    const lit = isHi && hiP > 0;
    const valueColor = lit ? th.hi : th.ink;
    const hl = plan.hl ?? 1e9;
    const vPop = isHi ? interpolate(f, [hl, hl + 5, hl + 12], [1, 1.16, 1.08], clamp) : 1;
    // Base fill: the accent for every bar when nothing is singled out, else muted; the highlight fades up over it.
    const base = r.color ?? (anyHi ? th.muted : th.hi);
    const baseStyle = barStyle(th, base, !anyHi && th.look === 'terminal', L.vertical);
    const hiStyle = isHi ? barStyle(th, r.color ?? th.hi, true, L.vertical) : null;
    const glintP = isHi && plan.hl != null ? interpolate(f, [plan.hl + 2, plan.hl + 22], [-0.3, 1.3], clamp) : -1;
    const valueShadow = th.light ? 'none' : th.look === 'label' ? '0 4px 0 rgba(0,0,0,0.35)' : `0 0 24px ${rgba(valueColor, 0.45)}, 0 3px 12px rgba(0,0,0,0.6)`;
    const labelStyle: React.CSSProperties = {
      fontFamily: DFONT[th.labelFont],
      fontWeight: 600,
      fontSize: L.labelSize,
      color: lit && hiP > 0.5 ? th.hi : th.ink,
      whiteSpace: 'nowrap',
      textTransform: upperLabels ? 'uppercase' : undefined,
      letterSpacing: upperLabels ? '0.06em' : undefined,
      textShadow: th.light ? 'none' : '0 2px 10px rgba(0,0,0,0.6)',
    };
    const bar = (): React.ReactNode => (
      <>
        <div style={{ position: 'absolute', inset: 0, ...baseStyle }} />
        {hiStyle ? <div style={{ position: 'absolute', inset: 0, ...hiStyle, opacity: hiP }} /> : null}
        {isHi ? <Glint p={glintP} vertical={L.vertical} radius={baseStyle.borderRadius} /> : null}
      </>
    );

    if (L.vertical) {
      const cx = L.slot * (k + 0.5) + (band.left as number);
      const hMax = L.base - L.colTop;
      const h = Math.max(0, hMax * frac * g);
      const lab = L.labels[k];
      els.push(
        <div key={k} style={{ opacity: dim }}>
          <div style={{ position: 'absolute', left: cx - L.colW / 2, top: L.colTop, width: L.colW, height: hMax, background: rgba(th.ink, 0.055), borderRadius: th.look === 'glow' ? 8 : 0, opacity: lp }} />
          <div style={{ position: 'absolute', left: cx - L.colW / 2, top: L.base - h, width: L.colW, height: h }}>{bar()}</div>
          <div style={{ position: 'absolute', left: cx, top: L.base - h - 16, transform: `translate(-50%, -100%) scale(${vPop})`, transformOrigin: '50% 100%', opacity: Math.min(1, g * 3), textShadow: valueShadow }}>
            <NumText p={shown} size={L.valueSize} font={th.numFont} color={valueColor} />
          </div>
          <div style={{ position: 'absolute', left: cx - L.slot * 0.45, width: L.slot * 0.9, top: L.base + 24, textAlign: 'center', opacity: lp * (isHi || !anyHi ? 1 : 0.88), transform: `translateY(${(1 - lp) * 14}px)` }}>
            {lab.lines.map((l, j) => (
              <div key={j} style={{ ...labelStyle, lineHeight: 1.15 }}>
                {l}
              </div>
            ))}
          </div>
        </div>,
      );
      return;
    }
    const y = L.labelTop + k * L.rowH + (L.rowH - (L.labelSize * 1.25 + 8 + L.barT)) / 2;
    const barY = L.side ? L.labelTop + k * L.rowH + (L.rowH - L.barT) / 2 : y + L.labelSize * 1.25 + 8;
    const len = Math.max(0, L.lenMax * frac * g);
    const bx = L.barX;
    const labelEl = L.side ? (
      <div style={{ position: 'absolute', left: band.left, width: L.labelW, top: barY + L.barT / 2, transform: `translate(${(1 - lp) * -26}px, -50%)`, textAlign: 'right', opacity: lp * (isHi || !anyHi ? 1 : 0.88) }}>
        {L.labels[k].lines.map((l, j) => (
          <div key={j} style={{ ...labelStyle, lineHeight: 1.08 }}>
            {l}
          </div>
        ))}
      </div>
    ) : (
      <div style={{ position: 'absolute', left: band.left, top: y, ...labelStyle, lineHeight: 1.2, opacity: lp * (isHi || !anyHi ? 1 : 0.88), transform: `translateX(${(1 - lp) * -26}px)` }}>{L.labels[k].lines[0]}</div>
    );
    els.push(
      <div key={k} style={{ opacity: dim }}>
        {labelEl}
        <div style={{ position: 'absolute', left: bx, top: barY, width: L.lenMax, height: L.barT, background: rgba(th.ink, 0.055), borderRadius: th.look === 'glow' ? 8 : 0, opacity: lp }} />
        <div style={{ position: 'absolute', left: bx, top: barY, width: len, height: L.barT }}>{bar()}</div>
        <div style={{ position: 'absolute', left: bx + len + 22, top: barY + L.barT / 2, transform: `translateY(-50%) scale(${vPop})`, transformOrigin: '0% 50%', opacity: Math.min(1, g * 3), textShadow: valueShadow }}>
          <NumText p={shown} size={L.valueSize} font={th.numFont} color={valueColor} />
        </div>
      </div>,
    );
  });

  // The baseline every bar grows from.
  const axisP = prog(f, plan.lead, 14, SOFT);
  const axisC = th.look === 'label' ? th.ink : rgba(th.ink, 0.5);
  const axis = L.vertical ? (
    <div style={{ position: 'absolute', left: band.left - 10, top: L.base, width: (band.right - band.left + 20) * axisP, height: th.look === 'label' ? 6 : 2, background: axisC }} />
  ) : (
    <div style={{ position: 'absolute', left: L.barX - 16, top: L.labelTop + L.rowH * (L.side ? 0.12 : 0.3), width: th.look === 'label' ? 6 : 2, height: (L.rowH * (L.n - (L.side ? 0.24 : 0.3))) * axisP, background: axisC }} />
  );
  // Terminal: a measured scale behind the rows.
  let grid: React.ReactNode = null;
  if (th.look === 'terminal') {
    grid = L.vertical
      ? [0.25, 0.5, 0.75, 1].map((q) => <div key={q} style={{ position: 'absolute', top: L.base - (L.base - L.colTop) * q, left: band.left - 10, height: 1, width: (band.right - band.left + 20) * axisP, background: rgba(th.hi, 0.14) }} />)
      : [0.25, 0.5, 0.75, 1].map((q) => <div key={q} style={{ position: 'absolute', left: L.barX + L.lenMax * q, top: L.labelTop + L.rowH * (L.side ? 0.12 : 0.3), width: 1, height: L.rowH * (L.n - 0.3) * axisP, background: rgba(th.hi, 0.14) }} />);
  }
  return (
    <InfoStage genre={genre} th={th} seed={`bars${index ?? 0}`} durFrames={durFrames} speed={speed} title={title} locale={locale}>
      {grid}
      {axis}
      {els}
    </InfoStage>
  );
};

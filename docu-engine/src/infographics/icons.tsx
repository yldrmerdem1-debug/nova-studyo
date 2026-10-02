import React, { useMemo } from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { IconsScene, InfoIcon } from '../types';
import type { DevProps } from '../devices/common';
import { clamp } from '../devices/common';
import { DFONT, measure } from '../devices/type';
import { infoPlan, type IconsPlan } from './timing.js';
import { InfoStage, SOFT, fmtNum, glow, infoBand, infoTheme, isTrLocale, prog, rgba, fitText } from './theme';

/*
 * ICON ARRAY — "9 of 10 died": `total` pictograms laid out as large as the
 * frame allows, then the `filled` ones light up one by one (a pop each, in
 * reading order) while the big figure counts with them. Glyphs are drawn
 * here as SVG paths on a 24-unit grid — no icon fonts, no emoji.
 */

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y} H${x + w} V${y + h} H${x} Z`;

/** Pictograms on a 24x24 grid (even-odd fill: inner shapes cut windows and rims). */
export const GLYPHS: Record<InfoIcon, string> = {
  person: `${circle(12, 5.7, 3.7)} M4.8 22.6 V17.4 C4.8 13.5 8 11.3 12 11.3 C16 11.3 19.2 13.5 19.2 17.4 V22.6 Z`,
  soldier:
    `M7.3 6.6 C7.3 3.7 9.4 1.6 12 1.6 C14.6 1.6 16.7 3.7 16.7 6.6 H18 V7.9 H6 V6.6 Z ${circle(12, 9.3, 2.6)} ` +
    'M4.8 22.6 V17.9 C4.8 14.5 7.6 12.6 12 12.6 C16.4 12.6 19.2 14.5 19.2 17.9 V22.6 Z M18.3 9.6 L19.5 9.2 L22.2 22.6 H20.9 Z',
  ship: 'M1.3 14.2 H22.7 L19.6 20.6 H4.4 Z M5.8 10.2 H17.4 V13.4 H5.8 Z M8.2 4.8 H10.9 V9.4 H8.2 Z M12.4 5.8 H15.1 V9.4 H12.4 Z M4.2 21.6 H19.8 V22.6 H4.2 Z',
  plane:
    'M12 1.4 C12.9 1.4 13.4 2.5 13.4 3.8 V9.3 L21.9 13.9 V15.9 L13.4 13.4 V18.6 L16.1 20.6 V22.2 L12 21.1 L7.9 22.2 V20.6 L10.6 18.6 V13.4 L2.1 15.9 V13.9 L10.6 9.3 V3.8 C10.6 2.5 11.1 1.4 12 1.4 Z',
  coin: `${circle(12, 12, 9.8)} ${circle(12, 12, 7.6)} ${circle(12, 12, 6.3)} ${rect(11.1, 8, 1.8, 8)}`,
  house: 'M12 1.8 L22.8 11.2 H19.8 V22.2 H14.5 V15.3 H9.5 V22.2 H4.2 V11.2 H1.2 Z',
  bill: `${rect(1.2, 5.6, 21.6, 12.8)} ${rect(2.8, 7.2, 18.4, 9.6)} ${circle(12, 12, 3.3)} ${circle(5.4, 12, 1)} ${circle(18.6, 12, 1)}`,
  building:
    rect(4.6, 1.6, 14.8, 20.8) +
    ' ' +
    [4, 7.4, 10.8, 14.2]
      .flatMap((y) => [6.9, 10.9, 14.9].map((x) => rect(x, y, 2.2, 2.2)))
      .join(' ') +
    ' ' +
    rect(10.4, 18, 3.2, 4.4),
};

/** Turkish locative after a number ("10'da", "3'te", "100'de"): vowel harmony and consonant assimilation of how the number is SAID. */
export function trLocative(n: number): string {
  const s = String(Math.round(n));
  const last = Number(s[s.length - 1]);
  const tens = Number(s[s.length - 2] ?? 0);
  let word: string;
  if (s.length >= 3 && s.endsWith('00')) word = s.length >= 4 && s.endsWith('000') ? 'bin' : 'yüz';
  else if (last) word = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'][last];
  else word = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'][tens] || 'sıfır';
  const vowels = word.match(/[aeıioöuü]/g) ?? ['e'];
  const v = vowels[vowels.length - 1];
  const back = 'aıou'.includes(v);
  const hard = /[çfhkpsşt]$/.test(word);
  return `${s}'${hard ? 't' : 'd'}${back ? 'a' : 'e'}`;
}

/**
 * The grid: icons as large as the area allows (few icons get big ones), then
 * a full last row (10 = 5 x 2, not 3-3-3-1), then the wider layout.
 */
export function iconGrid(total: number, w: number, h: number) {
  const cap = total <= 3 ? 300 : total <= 6 ? 250 : total <= 12 ? 215 : 190;
  let best = { cols: total, rows: 1, cell: 0, score: -1 };
  for (let c = 1; c <= total; c++) {
    const r = Math.ceil(total / c);
    const cell = Math.min(w / c, h / r, cap);
    const orphan = total % c === 0 ? 0 : 1;
    // Size first (to the nearest 4%), then no ragged last row, then more columns than rows.
    const score = Math.round((cell / cap) * 25) * 100 - orphan * 400 + (c >= r ? 10 : 0) - Math.abs(c - r * 1.6);
    if (score > best.score) best = { cols: c, rows: r, cell, score };
  }
  return best;
}

export const Icons: React.FC<DevProps & { scene: IconsScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const th = useMemo(() => infoTheme(genre, scene), [genre, scene]);
  const band = infoBand(genre, false);
  const plan = useMemo(() => infoPlan(scene, durFrames, fps) as IconsPlan, [scene, durFrames, fps]);
  const total = plan.total;
  const filled = plan.filled;
  const glyph = GLYPHS[scene.icon as InfoIcon] ?? GLYPHS.person;
  const id = `ic${index ?? 0}`;

  /* ---- layout: the figure and label on the left, the grid on the right ---- */
  const textW = 600;
  const gx0 = band.left + textW + 90;
  const gw = band.right - gx0;
  const gh = band.bottom - band.top;
  const G = iconGrid(total, gw, gh);
  const gridW = G.cols * G.cell;
  const gridH = G.rows * G.cell;
  const ox = gx0 + (gw - gridW) / 2;
  const oy = band.top + (gh - gridH) / 2;
  const icon = G.cell * 0.8;

  /* ---- the figure ---- */
  const lit = filled ? Math.min(filled, Math.max(0, Math.floor((f - plan.fill) / Math.max(1e-6, plan.step)) + 1)) : 0;
  const litNow = plan.step > 0 ? lit : f >= plan.fill ? filled : 0;
  const tr = isTrLocale(locale);
  const big = fmtNum(litNow, locale);
  const bigFinal = fmtNum(filled, locale);
  const small = tr ? trLocative(total) : `of ${fmtNum(total, locale)}`;
  const smallW = measure(small, th.numFont, 100) / 100;
  const bigW = measure(bigFinal, th.numFont, 100) / 100;
  // Big figure + small "of 10" on one line inside the text column.
  const bigSize = Math.floor(Math.min(230, (textW - 20) / (bigW + smallW * 0.36 + 0.12)));
  const label = String(scene.label ?? '').trim();
  const lab = fitText(label, th.labelFont, { maxW: textW, maxH: gh - bigSize * 1.1 - 40, lineH: 1.14, cap: 60, min: 26, maxLines: 3, balance: true });
  const blockH = bigSize * 1.02 + 26 + lab.lines.length * lab.size * 1.14;
  const ty = band.top + (gh - blockH) / 2;
  const figIn = prog(f, plan.lead, 14, SOFT);
  const labIn = prog(f, plan.fill - 6, 14, SOFT);
  const done = interpolate(f, [plan.done, plan.done + 6, plan.done + 14], [1, 1.08, 1], clamp);

  /* ---- icons ---- */
  const off: React.ReactNode[] = [];
  const on: React.ReactNode[] = [];
  const rings: React.ReactNode[] = [];
  for (let j = 0; j < total; j++) {
    const c = j % G.cols;
    const r = Math.floor(j / G.cols);
    const x = ox + c * G.cell + (G.cell - icon) / 2;
    const y = oy + r * G.cell + (G.cell - icon) / 2;
    // The grid fades in as a diagonal wave.
    const wave = plan.grid + ((c + r) / Math.max(1, G.cols + G.rows - 2)) * Math.round(0.45 * fps);
    const a = prog(f, wave, 8, SOFT);
    if (a <= 0) continue;
    const s = icon / 24;
    const at = plan.fill + j * plan.step;
    const isFilled = j < filled && f >= at;
    const k = isFilled ? interpolate(f - at, [0, 4, 9], [0.55, 1.18, 1], clamp) : 0.86 + 0.14 * a;
    const cx = x + icon / 2;
    const cy = y + icon / 2;
    const tf = `translate(${cx} ${cy}) scale(${k}) translate(${-icon / 2} ${-icon / 2}) scale(${s})`;
    if (isFilled) {
      on.push(<use key={j} href={`#${id}`} transform={tf} />);
      if (total <= 24 && f - at < 14) {
        const rp = (f - at) / 14;
        rings.push(<circle key={`r${j}`} cx={cx} cy={cy} r={icon * (0.45 + 0.4 * rp)} fill="none" stroke={th.hi} strokeWidth={3 * (1 - rp)} opacity={0.8 * (1 - rp)} />);
      }
    } else off.push(<use key={j} href={`#${id}`} transform={tf} opacity={a} />);
  }
  const offColor = th.look === 'label' && !th.light ? rgba(genre.paper, 0.2) : rgba(th.ink, th.look === 'terminal' ? 0.14 : 0.17);
  const onFilter =
    th.look === 'label' ? `drop-shadow(0 ${Math.max(3, icon * 0.05)}px 0 ${th.hiShadow})` : th.light ? undefined : `drop-shadow(0 0 ${Math.max(6, icon * 0.08)}px ${rgba(th.hi, 0.65)})`;

  return (
    <InfoStage genre={genre} th={th} seed={`icons${index ?? 0}`} durFrames={durFrames} speed={speed} locale={locale}>
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <defs>
          <path id={id} d={glyph} fillRule="evenodd" />
        </defs>
        <g fill={offColor}>{off}</g>
        {th.look === 'terminal' ? (
          <g stroke={rgba(th.hi, 0.12)} strokeWidth={1}>
            {Array.from({ length: G.cols + 1 }, (_, c) => (
              <line key={`c${c}`} x1={ox + c * G.cell} y1={oy} x2={ox + c * G.cell} y2={oy + gridH * figIn} />
            ))}
          </g>
        ) : null}
        <g fill={th.hi} style={{ filter: onFilter }}>
          {on}
        </g>
        {rings}
      </svg>
      <div style={{ position: 'absolute', left: band.left, top: ty, width: textW, opacity: figIn, transform: `translateY(${(1 - figIn) * 20}px)` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', whiteSpace: 'nowrap', transform: `scale(${done})`, transformOrigin: '0% 80%' }}>
          {tr ? <span style={{ fontFamily: DFONT[th.numFont], fontWeight: 700, fontSize: bigSize * 0.36, color: th.ink, opacity: 0.85, marginRight: bigSize * 0.12 }}>{small}</span> : null}
          <span
            style={{
              fontFamily: DFONT[th.numFont],
              fontWeight: 700,
              fontSize: bigSize,
              lineHeight: 1,
              color: th.hi,
              fontVariantNumeric: 'lining-nums tabular-nums',
              textShadow: th.look === 'label' ? `0 ${Math.round(bigSize * 0.04)}px 0 ${th.hiShadow}` : glow(th, th.hi, 36, 0.55),
            }}
          >
            {big}
          </span>
          {!tr ? <span style={{ fontFamily: DFONT[th.numFont], fontWeight: 700, fontSize: bigSize * 0.36, color: th.ink, opacity: 0.85, marginLeft: bigSize * 0.12 }}>{small}</span> : null}
        </div>
        <div style={{ marginTop: 26, opacity: labIn, transform: `translateY(${(1 - labIn) * 16}px)` }}>
          {th.look === 'label' ? <div style={{ width: 90 * labIn, height: 7, background: th.hi, boxShadow: `0 5px 0 ${th.hiShadow}`, marginBottom: 22 }} /> : <div style={{ width: 90 * labIn, height: 3, background: th.hi, boxShadow: glow(th, th.hi, 12, 0.7), marginBottom: 22 }} />}
          {lab.lines.map((l, k) => (
            <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: 600, fontSize: lab.size, lineHeight: 1.14, color: th.ink, whiteSpace: 'nowrap', textTransform: th.look === 'terminal' ? 'uppercase' : undefined, textShadow: th.light ? 'none' : '0 2px 12px rgba(0,0,0,0.6)' }}>
              {l}
            </div>
          ))}
        </div>
      </div>
    </InfoStage>
  );
};

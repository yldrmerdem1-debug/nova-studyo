import React, { useMemo } from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ScaleScene } from '../types';
import type { DevProps } from '../devices/common';
import { clamp } from '../devices/common';
import { DFONT, fitLine, measure } from '../devices/type';
import { infoPlan, type ScalePlan } from './timing.js';
import { INOUT, InfoStage, NumText, SOFT, decimalsOf, glow, infoBand, infoTheme, numEm, numParts, prog, rgba, fitText } from './theme';

/*
 * SIZE COMPARISON — two discs whose AREAS are the two amounts. The shot opens
 * tight on the smaller one ("$5,800 found"), its figure counting up; on the
 * bigger amount the camera pulls out on a log-zoom and the second disc — so
 * large the first shrinks to a coin beside it — draws its rim and fills in,
 * its figure counting past the first. Both discs stand on one baseline.
 */

const isMoney = (u?: string) => /[$€£¥₺₿₹]|dollar|lira|euro|pound|dolar|sterlin/i.test(String(u ?? ''));

export const Scale: React.FC<DevProps & { scene: ScaleScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const th = useMemo(() => infoTheme(genre, scene), [genre, scene]);
  const title = String(scene.title ?? '').trim();
  const band = infoBand(genre, !!title);
  const plan = useMemo(() => infoPlan(scene, durFrames, fps) as ScalePlan, [scene, durFrames, fps]);
  const A = { label: String(scene.a?.label ?? '').trim(), value: Math.abs(Number(scene.a?.value) || 0) };
  const B = { label: String(scene.b?.label ?? '').trim(), value: Math.abs(Number(scene.b?.value) || 0) };
  const small = plan.smallIsA ? A : B;
  const big = plan.smallIsA ? B : A;
  const decimals = decimalsOf([A.value, B.value]);
  const compact = big.value >= 1e6 ? ('long' as const) : false;
  const money = isMoney(scene.unit);

  /* ---- the final (pulled-out) layout, in frame px ---- */
  const baseY = band.bottom - 24;
  const Rb = Math.min((band.bottom - band.top - 20) / 2, 395);
  const xb = band.right - Rb - 10;
  const yb = baseY - Rb;
  const ratio = big.value > 0 ? small.value / big.value : 1;
  const rsTrue = Rb * Math.sqrt(Math.max(0, ratio));
  const rs = Math.max(4, rsTrue);
  const gapX = Math.max(70, rs * 0.5);
  const xs = xb - Rb - gapX - rs;
  const ys = baseY - rs;

  /* ---- camera: log-zoom from the small disc to the whole ---- */
  const S0 = 230;
  const Z0 = rs >= Rb * 0.7 ? 1 : Math.max(1, S0 / rs);
  const e = prog(f, plan.zoom, plan.zoomDur, INOUT);
  const z = Math.pow(Z0, 1 - e);
  const P1 = { x: xs, y: ys };
  // Discs of similar size need no pull-out: the shot holds the final layout and the big one draws in.
  const P0 = Z0 === 1 ? P1 : { x: Math.max(band.left + 640 + S0, 1130), y: (band.top + band.bottom) / 2 + 20 };
  const P = { x: P0.x + (P1.x - P0.x) * e, y: P0.y + (P1.y - P0.y) * e };
  const toScreen = (x: number, y: number) => ({ x: P.x + (x - xs) * z, y: P.y + (y - ys) * z });
  const sS = toScreen(xs, ys);
  const bS = toScreen(xb, yb);
  const rsS = rs * z;
  const RbS = Rb * z;
  const baseS = toScreen(0, baseY).y;

  /* ---- motion ---- */
  const sIn = interpolate(f, [plan.smallIn - 2, plan.smallIn + 5, plan.smallIn + 11], [0, 1.08, 1], clamp);
  const sCount = prog(f, plan.smallIn, Math.round(0.8 * fps), Easing.out(Easing.cubic));
  const rim = prog(f, plan.zoom + plan.zoomDur * 0.12, plan.zoomDur * 0.7, SOFT);
  const bigFill = prog(f, plan.zoom + plan.zoomDur * 0.45, plan.zoomDur * 0.6, SOFT);
  const bigCount = prog(f, plan.zoom + plan.zoomDur * 0.3, plan.zoomDur * 0.7 + 6, Easing.out(Easing.cubic));
  const bigLabelIn = prog(f, plan.land - Math.round(plan.zoomDur * 0.35), 14, SOFT);
  const landPop = interpolate(f, [plan.land, plan.land + 5, plan.land + 12], [1, 1.035, 1], clamp);

  /* ---- colours ---- */
  const smallFill = th.hi;
  const bigBase = th.look === 'label' ? (th.light ? '#fffaf0' : genre.paper) : th.hi;
  const bigInk = th.look === 'label' ? '#1d1a17' : th.ink;
  const bigVal = th.look === 'label' ? genre.accent2 : th.hi;
  const shadowOff = th.look === 'label' ? 10 : 0;
  const gid = `sc${index ?? 0}`;

  const disc = (x: number, y: number, r: number, which: 'small' | 'big', op: number): React.ReactNode => {
    if (r <= 0.3 || op <= 0) return null;
    if (which === 'small') {
      return (
        <g opacity={op}>
          {th.look === 'label' ? <circle cx={x} cy={y + Math.min(shadowOff, r * 0.12)} r={r} fill={th.hiShadow} /> : null}
          <circle cx={x} cy={y} r={r} fill={th.look === 'glow' ? `url(#${gid}s)` : smallFill} style={th.look !== 'label' && !th.light && r < 900 ? { filter: `drop-shadow(0 0 ${Math.min(40, r * 0.25)}px ${rgba(th.hi, 0.6)})` } : undefined} />
          {money && r > 14 ? <circle cx={x} cy={y} r={r * 0.84} fill="none" stroke={th.look === 'label' ? rgba('#000000', 0.18) : rgba('#ffffff', 0.35)} strokeWidth={Math.max(1.5, r * 0.035)} /> : null}
        </g>
      );
    }
    const circ = 2 * Math.PI * r;
    return (
      <g>
        {th.look === 'label' ? <circle cx={x} cy={y + shadowOff} r={r} fill="rgba(0,0,0,0.35)" opacity={bigFill} /> : null}
        <circle cx={x} cy={y} r={r} fill={th.look === 'label' ? bigBase : th.look === 'terminal' ? `url(#${gid}h)` : `url(#${gid}b)`} opacity={th.look === 'label' ? bigFill : 0.35 + 0.65 * bigFill} />
        {money ? <circle cx={x} cy={y} r={r * 0.9} fill="none" stroke={th.look === 'label' ? rgba('#000000', 0.12) : rgba(th.hi, 0.3)} strokeWidth={Math.max(2, r * 0.012)} opacity={bigFill} /> : null}
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={th.look === 'label' ? th.ink : th.hi}
          strokeWidth={th.look === 'label' ? 5 : 3}
          strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={circ * (1 - rim)}
          transform={`rotate(-90 ${x} ${y})`}
          opacity={th.look === 'label' ? 0.9 * (1 - bigFill * 0.6) : 1}
          style={th.look !== 'label' && !th.light && r < 1400 ? { filter: `drop-shadow(0 0 10px ${rgba(th.hi, 0.7)})` } : undefined}
        />
      </g>
    );
  };

  /* ---- labels (screen space, never scaled with the discs) ---- */
  const smallParts = numParts(small.value * sCount, scene.unit, locale, { decimals, compact, scaleFrom: small.value });
  const smallFinal = numParts(small.value, scene.unit, locale, { decimals, compact });
  const bigParts = numParts(small.value + (big.value - small.value) * bigCount, scene.unit, locale, { decimals, compact, scaleFrom: big.value });
  const bigFinal = numParts(big.value, scene.unit, locale, { decimals, compact });

  /*
   * Small label: left of the small disc, right-aligned against it — or, when
   * the discs are close in size and the small one sits near the frame's left
   * edge, centred above it. Decided on the final layout and kept all scene.
   */
  const leftRoom = xs - rs - 34 - band.left;
  const above = leftRoom < 380;
  const sW = above ? Math.min(560, Math.max(300, 2 * (xs - band.left))) : Math.min(620, leftRoom);
  const sValSize = Math.floor(Math.min(110, sW / Math.max(0.5, numEm(smallFinal, th.numFont, measure)) / 1.06));
  const sLab = fitText(small.label, th.labelFont, { maxW: sW, maxH: 110, lineH: 1.12, cap: 44, min: 22, maxLines: 2, balance: true });
  const sBlockH = sValSize * 1.05 + 10 + sLab.lines.length * sLab.size * 1.12;
  const sRight = above ? Math.max(band.left + sW, Math.min(band.right, sS.x + sW / 2)) : sS.x - rsS - 34;
  const sTop = above
    ? Math.max(band.top, sS.y - rsS - 26 - sBlockH)
    : Math.max(band.top, Math.min(baseS - 16 - sBlockH, sS.y - sBlockH / 2));
  const sLabelOp = interpolate(f, [plan.smallIn, plan.smallIn + 8], [0, 1], clamp);

  // Big label: centred in the big disc once it is on screen.
  const bW = Rb * 1.45;
  const bValSize = Math.floor(Math.min(150, bW / Math.max(0.5, numEm(bigFinal, th.numFont, measure)) / 1.06));
  const bLab = fitText(big.label, th.labelFont, { maxW: bW * 0.92, maxH: Rb * 0.6, lineH: 1.12, cap: 46, min: 22, maxLines: 2, balance: true });
  const bBlockH = bValSize * 1.05 + 12 + bLab.lines.length * bLab.size * 1.12;
  const ratioX = small.value > 0 ? big.value / small.value : 0;
  const ratioTxt = ratioX >= 3 ? `×${Math.round(ratioX).toLocaleString(locale.toLowerCase().startsWith('tr') ? 'tr-TR' : 'en-US')}` : '';
  const ratioSize = ratioTxt ? fitLine(ratioTxt, th.numFont, { maxW: 260, cap: 56, min: 28 }) : 0;
  const ratioIn = prog(f, plan.land + 4, 12, SOFT);

  const baseLineW = th.look === 'label' ? 6 : 2;
  const baseIn = prog(f, plan.lead, 14, SOFT);
  return (
    <InfoStage genre={genre} th={th} seed={`scale${index ?? 0}`} durFrames={durFrames} speed={speed} title={title} locale={locale}>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${landPop})`, transformOrigin: `${xb}px ${baseY}px` }}>
        <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <radialGradient id={`${gid}s`} cx="38%" cy="34%" r="70%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={0.55} />
              <stop offset="35%" stopColor={th.hi} stopOpacity={1} />
              <stop offset="100%" stopColor={th.hi} stopOpacity={0.75} />
            </radialGradient>
            <radialGradient id={`${gid}b`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={th.hi} stopOpacity={0.05} />
              <stop offset="80%" stopColor={th.hi} stopOpacity={0.14} />
              <stop offset="100%" stopColor={th.hi} stopOpacity={0.32} />
            </radialGradient>
            <pattern id={`${gid}h`} width={14} height={14} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width={14} height={14} fill={rgba(th.hi, 0.06)} />
              <line x1={0} y1={0} x2={0} y2={14} stroke={rgba(th.hi, 0.22)} strokeWidth={2} />
            </pattern>
          </defs>
          {/* the ground both discs stand on */}
          <line x1={band.left - 20} y1={baseS} x2={band.left - 20 + (band.right - band.left + 40) * baseIn} y2={baseS} stroke={th.look === 'label' ? th.ink : rgba(th.ink, 0.45)} strokeWidth={baseLineW} />
          {f >= plan.zoom ? disc(bS.x, bS.y, RbS, 'big', 1) : null}
          {disc(sS.x, sS.y, rsS * sIn, 'small', Math.min(1, sIn * 2))}
          {/* a very small disc gets a ring so the eye finds it */}
          {rsTrue < 8 && e > 0.6 ? <circle cx={sS.x} cy={sS.y} r={16 + 10 * ((f % 30) / 30)} fill="none" stroke={th.hi} strokeWidth={2} opacity={0.8 * (1 - (f % 30) / 30)} /> : null}
        </svg>
        {/* small figure */}
        <div style={{ position: 'absolute', left: sRight - sW, top: sTop, width: sW, textAlign: above ? 'center' : 'right', opacity: sLabelOp }}>
          <div style={{ textShadow: th.look === 'label' ? `0 4px 0 ${th.hiShadow}` : glow(th, th.hi, 26, 0.55) }}>
            <NumText p={smallParts} size={sValSize} font={th.numFont} color={th.hi} />
          </div>
          <div style={{ marginTop: 10 }}>
            {sLab.lines.map((l, k) => (
              <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: 600, fontSize: sLab.size, lineHeight: 1.12, color: th.ink, whiteSpace: 'nowrap', textTransform: th.look === 'terminal' ? 'uppercase' : undefined, textShadow: th.light ? 'none' : '0 2px 10px rgba(0,0,0,0.6)' }}>
                {l}
              </div>
            ))}
          </div>
        </div>
        {/* big figure */}
        {bigLabelIn > 0 ? (
          <div style={{ position: 'absolute', left: bS.x - bW / 2, top: bS.y - bBlockH / 2, width: bW, textAlign: 'center', opacity: bigLabelIn, transform: `scale(${0.9 + 0.1 * bigLabelIn})` }}>
            <NumText p={bigParts} size={bValSize} font={th.numFont} color={bigVal} style={{ textShadow: th.look === 'label' ? 'none' : glow(th, th.hi, 30, 0.5) }} />
            <div style={{ marginTop: 12 }}>
              {bLab.lines.map((l, k) => (
                <div key={k} style={{ fontFamily: DFONT[th.labelFont], fontWeight: 600, fontSize: bLab.size, lineHeight: 1.12, color: bigInk, whiteSpace: 'nowrap', textTransform: th.look === 'terminal' ? 'uppercase' : undefined }}>
                  {l}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {ratioTxt && ratioIn > 0 ? (
          <div
            style={{
              position: 'absolute',
              left: bS.x - RbS * 0.72,
              top: bS.y - RbS * 0.72,
              transform: `translate(-60%, -60%) scale(${0.6 + 0.4 * ratioIn})`,
              opacity: ratioIn,
              fontFamily: DFONT[th.numFont],
              fontWeight: 700,
              fontSize: ratioSize,
              color: th.look === 'label' ? genre.labelInk : th.bg,
              background: th.look === 'label' ? genre.labelBg : th.hi,
              padding: '6px 16px 4px',
              boxShadow: th.look === 'label' ? `0 6px 0 ${genre.accent2}` : glow(th, th.hi, 20, 0.6),
              borderRadius: th.look === 'glow' ? 40 : 0,
              whiteSpace: 'nowrap',
            }}
          >
            {ratioTxt}
          </div>
        ) : null}
      </div>
    </InfoStage>
  );
};

import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, fitFont } from '../fonts';
import type { Genre, UiCardScene } from '../types';
import { useLook } from '../looks/context';
import { cueFrames, useTopic } from './context';
import { explainerTopic } from './explainer';
import { DevicePlate } from './cards';
import { MotifTexture, deviceGround, devicePicture, deviceRing, isLightLook, motifPalette } from './motifs';

/*
 * UI CARD — a real-world interface recreated as a clean card tilted in 3D
 * (MagnatesMedia's market-cap rankings with a giant arrow on the subject):
 *   ranking   numbered rows with values, the highlighted one lit, an arrow on it
 *   terminal  a CRT/teletype printout typing line by line
 *   form      a period form, fields typed in
 *   ledger    a ruled account book, figures in columns
 *   phone     a modern phone screen (stories after ~2007 only — the pipeline decides)
 * Rows appear on their spoken words; the highlight lands on its own word.
 * The card's material follows the topic motif (paper quote sheet, teletype,
 * wireless form...), so it never looks like a web page in a 1912 story.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const ease = Easing.out(Easing.cubic);

export const UiCardScn: React.FC<{ scene: UiCardScene; genre: Genre; durFrames: number; locale: string; speed: number; index?: number }> = ({ scene, genre, durFrames }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = explainerTopic(useTopic(), genre);
  // The card keeps its motif colours; a light look puts it on the motif's paper (Kartal Yuvası 950730, 29 Ekim 2026) —
  // a light variant too, even on a dark-surfaced scene genre (motifPalette reads the look itself).
  const light = isLightLook(genre);
  const look = useLook();
  const P = motifPalette(t, genre);
  const G = light ? motifPalette(t, genre, true) : P;
  const rows = (scene.rows ?? []).filter((r) => r && String(r.label ?? '').trim()).slice(0, 8);
  const n = rows.length;
  const hl = Number.isInteger(scene.highlight) && (scene.highlight as number) >= 0 && (scene.highlight as number) < n ? (scene.highlight as number) : -1;
  // A row the narration never names has no spoken frame (Infinity): it lights after the voice, near the end,
  // instead of crashing the render (ranking test: "inputRange ... [Infinity,Infinity]").
  const cues = cueFrames(
    rows.map((r) => ({ label: r.value ? `${r.label} ${r.value}` : r.label })),
    scene.wordTimes,
    durFrames,
    fps,
    { lead: 0.35, tail: 0.3, gap: 6 },
  ).map((c, i) => (Number.isFinite(c) ? c : Math.max(0, durFrames - Math.round(0.9 * fps) - (n - 1 - i) * 4)));
  const kind = scene.kind ?? 'ranking';
  const paperish = kind === 'form' || kind === 'ledger' || (kind === 'ranking' && ['ticker', 'telegraph', 'siege', 'case-file'].includes(t.motif));
  const phone = kind === 'phone';
  const terminal = kind === 'terminal';
  const cardW = phone ? 560 : 1180;
  const rowH = phone ? 92 : Math.min(96, Math.floor(620 / Math.max(1, n)));
  const enter = interpolate(f, [0, 14], [0, 1], { ...clamp, easing: ease });
  /*
   * GHOST-THEN-LIGHT: every row is on the card from the first frames, printed
   * faint, and lights on its spoken word — the card is never an empty
   * container waiting for the narration (a row the voice never names would
   * otherwise only arrive at the very end).
   */
  const ghostIn = interpolate(f, [2, 8], [0, 1], clamp);
  const GHOST = 0.32;
  // A row not yet said shows its shape only: dots, never the readable label or value (the narrator says it first).
  const mask = (t: string) => t.replace(/[^ ]/g, '·');
  const rowKey = terminal ? 'plexMono' : paperish ? P.monoKey : 'inter';
  const tilt = interpolate(f, [0, durFrames], [-16, -9], clamp);
  const tiltX = interpolate(f, [0, durFrames], [7, 4], clamp);
  // Gimli 9ff721 önce/sonra, 29 Ekim 2026: no device face is near-black — the CRT and the phone are mid-dark (luma >= 45).
  const bg = terminal ? '#25342c' : phone ? '#2c3038' : paperish ? P.paper : '#f7f7f5';
  const ink = terminal ? '#9cf2b2' : phone ? '#f2f2f2' : paperish ? P.paperInk : '#15171a';
  const font = terminal ? FONT.plexMono : paperish ? P.typed : FONT.inter;
  const hlAt = hl >= 0 ? cues[hl] : Infinity;
  // A card without a highlighted row has no highlight animation to interpolate.
  const hlP = Number.isFinite(hlAt) ? interpolate(f, [hlAt, hlAt + 10], [0, 1], { ...clamp, easing: ease }) : 0;
  const title = String(scene.title ?? '').toUpperCase();
  const tSize = title ? fitFont(title, terminal || paperish ? P.monoKey : 'inter', { maxW: cardW - 120, cap: 44, upper: true, trackEm: 0.06 }) : 0;
  return (
    <AbsoluteFill style={{ background: deviceGround(G, '40% 45%') }}>
      {/* The related picture soft behind the card (brightness 0.84, opacity 0.5; was 0.25 — a black field). */}
      <DevicePlate pic={devicePicture(scene, look)} P={G} durFrames={durFrames} />
      <MotifTexture t={t} light={light} strength={1.2} />
      <AbsoluteFill style={{ background: deviceRing(light) }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', perspective: 1600 }}>
        <div
          style={{
            position: 'relative',
            width: cardW,
            padding: phone ? '70px 34px 60px' : '46px 56px 50px',
            background: bg,
            borderRadius: phone ? 64 : terminal ? 14 : paperish ? 2 : 22,
            border: phone ? '14px solid #1d2026' : terminal ? '2px solid #1f3a28' : 'none',
            boxShadow: `0 60px 120px rgba(0,0,0,${light ? 0.25 : 0.42})${terminal ? ', inset 0 0 60px rgba(60,255,140,0.08)' : ''}`,
            transform: `translateX(${-120 + (1 - enter) * -200}px) rotateY(${tilt}deg) rotateX(${tiltX}deg)`,
            transformStyle: 'preserve-3d',
            opacity: enter,
          }}
        >
          {title ? (
            <div style={{ fontFamily: terminal || paperish ? font : FONT.inter, fontWeight: 800, fontSize: tSize, letterSpacing: '0.06em', color: ink, borderBottom: `2px solid ${ink}33`, paddingBottom: 16, marginBottom: 12 }}>
              {title}
              {scene.sub ? <div style={{ fontWeight: 400, fontSize: 22, letterSpacing: '0.14em', opacity: 0.6, marginTop: 6 }}>{scene.sub.toUpperCase()}</div> : null}
            </div>
          ) : null}
          {rows.map((r, i) => {
            const at = cues[i];
            const p = interpolate(f, [at, at + 8], [0, 1], { ...clamp, easing: ease });
            const lit = GHOST + (1 - GHOST) * p;
            const isHl = i === hl;
            // Typing finishes well inside the scene (and within ~0.6 s of the row's word when time is short).
            const lineLen = String(r.label).length + String(r.value ?? '').length;
            const per = Math.max(0.2, Math.min(1.1, (durFrames - 8 - at) / Math.max(1, lineLen), (0.6 * fps) / Math.max(1, lineLen) * 2));
            const typedN = terminal || kind === 'form' ? Math.floor((f - at) / per) + 1 : 999;
            const labelText = String(r.label);
            const valText = String(r.value ?? '');
            // Typed rows: the typed part bright over the faint full line (never a cut-off word on an empty row).
            const lab = f >= at ? labelText.slice(0, Math.max(0, typedN)) : '';
            const labRest = labelText.slice(lab.length);
            const val = f >= at ? valText.slice(0, Math.max(0, typedN - labelText.length)) : '';
            // Sized to fit its row whole — never an ellipsis.
            const valW = r.value ? 40 + valText.length * Math.min(rowH * 0.42, 42) * 0.62 : 0;
            const labSize = Math.min(rowH * 0.4, 40, fitFont(labelText, rowKey, { maxW: cardW - 112 - 36 - (kind === 'ranking' ? 80 : terminal ? 50 : 0) - valW, cap: 40, upper: false }));
            return (
              <div
                key={i}
                style={{
                  position: 'relative',
                  height: rowH,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 26,
                  padding: '0 18px',
                  borderBottom: kind === 'ledger' || paperish ? `1px solid ${ink}22` : `1px solid ${ink}14`,
                  opacity: ghostIn * (terminal || kind === 'form' ? 1 : lit),
                  transform: `translateY(${(1 - p) * 4}px)`,
                  background: isHl ? `rgba(${rgb(P.accent)},${(0.22 * hlP).toFixed(3)})` : 'transparent',
                  borderRadius: phone ? 16 : 0,
                }}
              >
                {kind === 'ranking' ? <div style={{ width: 54, fontFamily: font, fontWeight: 800, fontSize: rowH * 0.36, color: isHl && hlP > 0.5 ? P.accent : `${ink}88` }}>{i + 1}</div> : null}
                {terminal ? <div style={{ fontFamily: font, fontSize: rowH * 0.34, color: `${ink}88` }}>{'>'}</div> : null}
                <div style={{ flex: 1, fontFamily: font, fontWeight: paperish || terminal ? 400 : 600, fontSize: labSize, color: ink, whiteSpace: 'nowrap' }}>
                  {terminal || kind === 'form' ? (
                    <>
                      <span>{lab}</span>
                      <span style={{ opacity: GHOST }}>{mask(labRest)}</span>
                    </>
                  ) : (
                    p > 0.01 ? labelText : mask(labelText)
                  )}
                </div>
                {r.value ? <div style={{ fontFamily: kind === 'ranking' && !paperish ? FONT.inter : font, fontWeight: 800, fontSize: Math.min(rowH * 0.42, 42), color: isHl && hlP > 0.5 ? P.accent2 : ink, whiteSpace: 'nowrap' }}>{terminal || kind === 'form' ? (
                      <>
                        <span>{val}</span>
                        <span style={{ opacity: GHOST }}>{mask(valText.slice(val.length))}</span>
                      </>
                    ) : (
                      p > 0.01 ? r.value : mask(valText)
                    )}
                  </div> : null}
              </div>
            );
          })}
          {hl >= 0 ? (
            // The giant pointer arrow on the subject's row.
            <svg
              width={360}
              height={160}
              style={{ position: 'absolute', right: -380, top: (phone ? 70 : 46) + (title ? tSize + 40 : 0) + hl * rowH + rowH / 2 - 80, overflow: 'visible', opacity: hlP, transform: `translateX(${(1 - hlP) * 120}px)` }}
            >
              <path d="M 340 50 L 120 50 L 120 10 L 10 80 L 120 150 L 120 110 L 340 110 Z" fill={P.accent} stroke="#000000" strokeOpacity={0.35} strokeWidth={3} style={{ filter: `drop-shadow(0 10px 20px rgba(0,0,0,0.5)) drop-shadow(0 0 18px ${P.accent}88)` }} />
            </svg>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

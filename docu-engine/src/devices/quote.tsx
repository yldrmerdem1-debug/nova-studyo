import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Media } from '../fx';
import { norm, wordFrames } from '../scenes';
import type { Genre, QuoteScene } from '../types';
import { DevProps, GenreBg, H, W, clamp, resolveRef, safeBand, upper } from './common';
import { DFONT, DevFont, fitLine, fitWrap } from './type';

/*
 * QUOTE CARD — the words of a quote appear as the narrator says them (when
 * `say` contains the quote; otherwise at a reading pace), in the genre's
 * quoting voice: a serif italic for documentary and biography, a typed
 * statement for crime, carved caps for epic, a terminal line for finance.
 * A duotone portrait holds the left of the frame when there is one.
 */

interface QuoteFace {
  font: DevFont;
  weight: number;
  italic: boolean;
  cap: number;
  lineH: number;
  mark: DevFont;
}

function face(g: Genre): QuoteFace {
  switch (g.id) {
    case 'crime':
      return { font: 'elite', weight: 400, italic: false, cap: 64, lineH: 1.3, mark: 'elite' };
    case 'epic':
      return { font: 'cinzel', weight: 600, italic: false, cap: 70, lineH: 1.28, mark: 'cinzel' };
    case 'horror':
      return { font: 'crimson', weight: 400, italic: true, cap: 84, lineH: 1.18, mark: 'crimson' };
    case 'science':
      return { font: 'exo', weight: 400, italic: false, cap: 70, lineH: 1.25, mark: 'exo' };
    case 'finance':
      return { font: 'plexMono', weight: 400, italic: false, cap: 58, lineH: 1.32, mark: 'plexMono' };
    default:
      return { font: 'playfair', weight: 500, italic: true, cap: 80, lineH: 1.2, mark: 'playfair' };
  }
}

/** The quote's words' frames: on the narration when `say` holds the quote, else at a reading pace. */
function quoteFrames(scene: QuoteScene, words: string[], durFrames: number, fps: number): number[] {
  const spoken = (scene.wordTimes ?? []).filter((w) => norm(w.word));
  const Q = words.map(norm).filter(Boolean);
  if (spoken.length && Q.length) {
    const S = spoken.map((w) => norm(w.word));
    const k = Math.min(3, Q.length);
    let start = -1;
    for (let i = 0; i + k <= S.length && start < 0; i++) {
      if (Q.slice(0, k).every((q, j) => S[i + j] === q || (q.length >= 4 && S[i + j].startsWith(q.slice(0, Math.max(4, q.length - 3)))))) start = i;
    }
    if (start >= 0) return wordFrames({ text: words.join(' '), wordTimes: spoken.slice(start) }, durFrames, fps);
  }
  const lead = Math.round(0.45 * fps);
  const step = Math.max(3, Math.min(Math.round(0.28 * fps), Math.floor((durFrames * 0.55 - lead) / Math.max(1, words.length))));
  return words.map((_, i) => lead + i * step);
}

/** Opacity of a quote word not yet spoken: readable as text-to-come, clearly not yet "said". */
export const QUOTE_GHOST = 0.3;

export const Quote: React.FC<DevProps & { scene: QuoteScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const band = safeBand(genre, 30);
  const pic = resolveRef(scene);
  const hasPic = !!pic.src;
  const Fc = face(genre);
  const look = genre.look;
  // Beside a portrait the quote is set ragged-left in the right half; alone it is centred and may run larger.
  const centred = !hasPic;
  const x0 = hasPic ? 880 : 230;
  const x1 = hasPic ? W - 110 : W - 230;
  const blockW = x1 - x0;
  const who = String(scene.who ?? '').trim();
  const when = String(scene.when ?? '').trim();
  const attrH = who || when ? 120 : 0;
  const markH = centred ? 120 : 90;
  const maxH = band.bottom - band.top - attrH - markH - 20;
  const text = String(scene.quote ?? '').trim().replace(/^["“”«»']+|["“”«»']+$/g, '');
  const fit = useMemo(
    () =>
      fitWrap(text, Fc.font, {
        maxW: blockW / (Fc.italic ? 0.84 : 1),
        maxH,
        lineH: Fc.lineH,
        cap: centred ? Math.round(Fc.cap * 1.45) : Fc.cap,
        min: 26,
        balance: true,
        balanceMin: centred ? 0.6 : 0.78,
      }),
    [text, Fc.font, Fc.lineH, Fc.cap, Fc.italic, blockW, maxH, centred],
  );
  const words = fit.lines.join(' ').split(/\s+/).filter(Boolean);
  const frames = useMemo(() => quoteFrames(scene, words, durFrames, fps), [scene, words.join(' '), durFrames, fps]);
  const lastF = frames[frames.length - 1] ?? 0;
  const attrAt = Math.min(Math.round(durFrames * 0.7), lastF + 8);

  const blockH = fit.lines.length * fit.size * Fc.lineH;
  const totalH = markH + blockH + attrH;
  const y0 = band.top + Math.max(0, (band.bottom - band.top - totalH) / 2);

  const t = interpolate(f, [0, durFrames], [0, 1], clamp);
  const markP = interpolate(f, [2, 14], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const attrP = interpolate(f, [attrAt, attrAt + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  /*
   * The quote's shape is on the card within ~0.3 s of it landing — each unsaid
   * word a row of faint dots (never the readable word: the narrator says it first),
   * and each word appears as it is spoken. When the narration reaches the quote late
   * (a lead-in sentence first), the card used to hold nothing but its opening
   * mark for seconds — an empty, broken-looking frame.
   */
  const ghostIn = interpolate(f, [3, 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  let wi = 0;
  const lines = fit.lines.map((line, li) => (
    <div key={li} style={{ whiteSpace: 'nowrap', height: fit.size * Fc.lineH }}>
      {line.split(/\s+/).map((w, k) => {
        const at = frames[wi++] ?? 0;
        const p = interpolate(f, [at, at + 6], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        const dots = QUOTE_GHOST * ghostIn * (1 - p);
        return (
          <React.Fragment key={k}>
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span style={{ display: 'inline-block', opacity: p, transform: `translateY(${(1 - p) * 0.06 * fit.size}px)`, filter: p > 0.05 && p < 0.99 ? `blur(${(1 - p) * 4}px)` : undefined }}>{w}</span>
              {dots > 0.01 ? <span style={{ position: 'absolute', left: 0, top: 0, opacity: dots, whiteSpace: 'nowrap' }}>{w.replace(/\S/g, '·')}</span> : null}
            </span>
            {k < line.split(/\s+/).length - 1 ? ' ' : ''}
          </React.Fragment>
        );
      })}
    </div>
  ));

  const inkQ = look === 'terminal' ? genre.accent : genre.ink;
  const whoT = upper(who, locale);
  const whoFont: DevFont = look === 'terminal' ? 'plexMono' : genre.headline;
  const whoSize = whoT ? fitLine(whoT, whoFont, { maxW: blockW - 120, cap: 40, min: 20, trackEm: 0.14 }) : 0;
  const whenSize = when ? fitLine(when, genre.body, { maxW: blockW - 120, cap: 28, min: 18, trackEm: 0.06 }) : 0;
  const markChar = look === 'terminal' ? '>' : '“';

  return (
    <AbsoluteFill style={{ background: genre.bg, overflow: 'hidden' }}>
      <GenreBg genre={genre} seed={`q${index ?? 0}`} />
      {hasPic ? (
        <>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1010, height: H, overflow: 'hidden' }}>
            <Media
              src={pic.src}
              durFrames={durFrames}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: `${(scene.focus?.[0] ?? 0.5) * 100}% ${(scene.focus?.[1] ?? 0.3) * 100}%`,
                transform: `scale(${1.06 + 0.07 * speed * t}) translateX(${-12 * t}px)`,
                transformOrigin: `${(scene.focus?.[0] ?? 0.5) * 100}% ${(scene.focus?.[1] ?? 0.3) * 100}%`,
                filter: 'url(#duo) contrast(1.05)',
              }}
            />
          </div>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1012, height: H, background: `linear-gradient(90deg, rgba(0,0,0,0) 45%, ${genre.bg}d9 82%, ${genre.bg} 100%)` }} />
          <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, background: `linear-gradient(0deg, ${genre.bg}aa 0%, rgba(0,0,0,0) 30%)` }} />
        </>
      ) : null}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 65% at 60% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.45) 100%)' }} />
      <div style={{ position: 'absolute', left: x0, top: y0, width: blockW, textAlign: centred ? 'center' : 'left', transform: centred ? `scale(${1 + 0.03 * speed * t})` : `translateX(${-8 * t}px)`, transformOrigin: '50% 50%' }}>
        <div
          style={{
            height: markH,
            fontFamily: DFONT[Fc.mark],
            fontStyle: Fc.italic ? 'italic' : 'normal',
            fontWeight: 700,
            fontSize: look === 'terminal' ? 90 : centred ? 300 : 230,
            lineHeight: look === 'terminal' ? `${markH}px` : 1,
            color: look === 'label' ? genre.labelBg : genre.accent,
            opacity: markP,
            transform: `translateY(${(1 - markP) * 20}px)`,
            marginLeft: look === 'terminal' || centred ? 0 : -10,
            textShadow: look === 'glow' || look === 'terminal' ? `0 0 26px ${genre.accent}88` : '0 6px 0 rgba(0,0,0,0.25)',
          }}
        >
          {markChar}
        </div>
        <div
          style={{
            fontFamily: DFONT[Fc.font],
            fontStyle: Fc.italic ? 'italic' : 'normal',
            fontWeight: Fc.weight,
            fontSize: fit.size,
            lineHeight: Fc.lineH,
            color: inkQ,
            textShadow: look === 'glow' ? `0 0 22px ${genre.accent}44, 0 3px 14px #000` : '0 3px 16px rgba(0,0,0,0.7)',
          }}
        >
          {lines}
        </div>
        {who || when ? (
          <div style={{ marginTop: 34, display: 'flex', alignItems: 'center', justifyContent: centred ? 'center' : 'flex-start', gap: 22, textAlign: 'left', opacity: attrP, transform: `translateX(${(1 - attrP) * -24}px)` }}>
            <div style={{ width: 70 * attrP, height: look === 'label' ? 6 : 3, background: look === 'label' ? genre.labelBg : genre.accent, boxShadow: look !== 'label' ? `0 0 10px ${genre.accent}` : undefined }} />
            <div>
              {whoT ? (
                <div style={{ fontFamily: DFONT[whoFont], fontWeight: 700, fontSize: whoSize, letterSpacing: '0.14em', color: look === 'label' ? genre.labelBg : genre.titleInk ?? genre.ink, whiteSpace: 'nowrap', lineHeight: 1.1 }}>{whoT}</div>
              ) : null}
              {when ? <div style={{ fontFamily: DFONT[genre.body], fontWeight: 400, fontSize: whenSize, letterSpacing: '0.06em', color: genre.ink, opacity: 0.75, whiteSpace: 'nowrap', marginTop: 6 }}>{when}</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

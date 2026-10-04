/**
 * RANK CARD — a countdown item's opening card (script.format 'ranking').
 *
 * How the countdown channels that hold their viewers cut it: the item's own picture stays readable
 * behind (the viewer sees WHAT before reading it), the number lands like a hit, then the name, then
 * where and when; a rail of every rank shows how far the countdown has come. Number one gets more
 * time, a bigger number and a warm glow. No hairlines anywhere (user's rule): the rail is numerals,
 * the current rank a printed label.
 *
 *   0.00  picture fades up, pushing in
 *   0.30  the number slams (scale 1.5 → 1, a 2-frame shake)   ← CHAPTER_LAND, the hit sound
 *   0.55  the name rises word by word
 *   0.95  place · year
 *   0.70  the rail
 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, fitFont, textWidth } from '../fonts';
import { Photo, clipOf } from '../fx';
import { alpha, mix } from '../looks/color';
import type { Genre, RankCardData, TitleScene } from '../types';

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const outExpo = Easing.out(Easing.exp);
const outCubic = Easing.out(Easing.cubic);

/** "1959", "480 BC", or '' — the year as the card prints it. */
export function yearLabel(year: number | null | undefined, locale = 'en'): string {
  if (!year) return '';
  if (year < 0) return `${-year} ${locale.toLowerCase().startsWith('tr') ? 'MÖ' : 'BC'}`;
  return String(year);
}

/** The ranks of the rail, top to bottom of the countdown (total … 1). */
export function railRanks(total: number): number[] {
  return Array.from({ length: Math.max(1, total) }, (_, k) => total - k);
}

export const RankCard: React.FC<{ scene: TitleScene; genre: Genre; durFrames: number; locale: string; land: number }> = ({ scene, genre, durFrames, locale, land }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = scene.rankCard as RankCardData;
  const top = r.rank === 1;
  const ground = '#0b0a09';
  const ink = '#f6f2ea';
  const gold = '#ffd21f';
  // One countdown colour, the channel's punch yellow (thumbnails, Shorts): it survives every grade.
  const hot = gold;

  // --- the number: lands on `land`, overshoots, settles with a 2-frame shake
  const since = f - land;
  const numSize = top ? 760 : 640;
  const s = since < 0 ? 1.5 : interpolate(since, [0, 5, 9], [1.5, 0.97, 1], { ...clamp, easing: outExpo });
  const numIn = interpolate(f, [land - 3, land], [0, 1], clamp);
  const shake = since >= 0 && since < 3 ? (since % 2 ? -1 : 1) * (6 - since * 2) : 0;
  const numText = String(r.rank);
  const numW = textWidth(numText, 'anton', numSize);
  const hashSize = numSize * 0.32;
  const numLeft = 150;

  // --- the name: up to two lines, word by word
  const colX = numLeft + numW + hashSize * 0.75 + 70;
  const colW = W - colX - 150;
  const name = String(r.item || scene.title || '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  const nameSize = Math.min(top ? 132 : 116, fitFont(name, genre.headline, { maxW: colW * 1.8, cap: top ? 132 : 116, upper: true }));
  const nameStart = land + Math.round(0.25 * fps);
  const meta = [r.place, yearLabel(r.year, locale)].filter(Boolean).join('  ·  ');
  // Sized to fit the column whole (ranking test: "LE BOURGET, FRANCE – NORTH ATL…" was cut at the frame edge).
  const metaSize = meta ? Math.max(22, Math.min(40, fitFont(meta, genre.body, { maxW: colW, cap: 40, upper: true, trackEm: 0.22 }))) : 0;
  const metaIn = interpolate(f, [land + Math.round(0.65 * fps), land + Math.round(0.95 * fps)], [0, 1], { ...clamp, easing: outCubic });

  // --- the rail: every rank, the passed ones spent, this one a printed label
  const ranks = railRanks(r.total);
  const railIn = interpolate(f, [land + Math.round(0.4 * fps), land + Math.round(0.75 * fps)], [0, 1], { ...clamp, easing: outCubic });
  const railSize = 54;

  // --- ground: the item's picture, readable, a slow push; darker where the number sits
  const fadeUp = interpolate(f, [0, Math.round(0.35 * fps)], [0, 1], clamp);
  const glow = top ? interpolate(since, [0, 8, durFrames], [0, 0.55, 0.35], clamp) : 0;

  return (
    <AbsoluteFill style={{ background: ground }}>
      {scene.image || scene.video ? (
        // The item's own picture, sharp and recognisable (a blurred plate read as a dark smear), pushing in.
        <AbsoluteFill style={{ opacity: fadeUp }}>
          <Photo src={scene.image ?? ''} clip={clipOf(scene)} durFrames={durFrames + 1} push={0.1} focus={[0.62, 0.42]} imgW={(scene as { imgW?: number }).imgW} imgH={(scene as { imgH?: number }).imgH} />
        </AbsoluteFill>
      ) : null}
      {/* dark only where the number and the name sit */}
      <AbsoluteFill style={{ background: `linear-gradient(90deg, ${alpha(ground, 0.88)} 0%, ${alpha(ground, 0.62)} 34%, ${alpha(ground, 0.18)} 70%, ${alpha(ground, 0.08)} 100%)` }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 90% 80% at 60% 45%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.5) 100%)' }} />
      {top ? <AbsoluteFill style={{ background: `radial-gradient(circle at ${numLeft + numW / 2}px 52%, ${alpha(gold, glow)} 0%, ${alpha(gold, 0)} 38%)`, mixBlendMode: 'screen' }} /> : null}

      {/* the number */}
      <div
        style={{
          position: 'absolute',
          left: numLeft,
          top: H / 2 - numSize * 0.58,
          display: 'flex',
          alignItems: 'flex-start',
          transform: `translateX(${shake}px) scale(${s})`,
          transformOrigin: `${numW / 2}px ${numSize * 0.55}px`,
          opacity: numIn,
        }}
      >
        <span style={{ fontFamily: FONT.anton, fontSize: hashSize, lineHeight: 1, color: hot, marginTop: numSize * 0.12, marginRight: hashSize * 0.08, textShadow: '0 6px 30px rgba(0,0,0,0.6)' }}>#</span>
        <span
          style={{
            fontFamily: FONT.anton,
            fontSize: numSize,
            lineHeight: 1,
            color: ink,
            WebkitTextStroke: top ? `6px ${gold}` : undefined,
            textShadow: `0 14px 60px rgba(0,0,0,0.75)${top ? `, 0 0 80px ${alpha(gold, 0.45)}` : ''}`,
          }}
        >
          {numText}
        </span>
      </div>

      {/* place · year, then the name */}
      <div style={{ position: 'absolute', left: colX, top: H / 2 - nameSize * 1.25 - 70, width: colW }}>
        {meta ? (
          <div
            style={{
              fontFamily: FONT[genre.body],
              fontWeight: 700,
              fontSize: metaSize,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: mix(ink, hot, 0.35),
              textShadow: '0 2px 6px rgba(0,0,0,0.85), 0 8px 28px rgba(0,0,0,0.6)',
              opacity: metaIn,
              transform: `translateY(${(1 - metaIn) * 14}px)`,
              marginBottom: 22,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {meta}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: nameSize * 0.28, rowGap: nameSize * 0.06 }}>
          {words.map((w, k) => {
            const at = nameStart + k * 3;
            const p = interpolate(f, [at, at + 9], [0, 1], { ...clamp, easing: outExpo });
            return (
              <span key={k} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: nameSize * 0.06 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontFamily: FONT[genre.headline],
                    fontWeight: 800,
                    fontSize: nameSize,
                    lineHeight: 1.02,
                    textTransform: 'uppercase',
                    color: ink,
                    textShadow: '0 4px 10px rgba(0,0,0,0.7), 0 12px 50px rgba(0,0,0,0.6)',
                    transform: `translateY(${(1 - p) * 105}%)`,
                  }}
                >
                  {w}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* the rail: total … 1 */}
      <div style={{ position: 'absolute', left: numLeft, bottom: 96, display: 'flex', alignItems: 'center', gap: 26, opacity: railIn }}>
        {ranks.map((k) => {
          const cur = k === r.rank;
          const done = k > r.rank;
          return cur ? (
            <span key={k} style={{ fontFamily: FONT.anton, fontSize: railSize * 1.25, lineHeight: 1, color: '#0b0a09', background: hot, padding: '6px 16px 4px', transform: `scale(${interpolate(f, [land + 12, land + 20], [1.3, 1], { ...clamp, easing: outExpo })})` }}>
              {k}
            </span>
          ) : (
            <span key={k} style={{ fontFamily: FONT.anton, fontSize: railSize, lineHeight: 1, color: done ? alpha(ink, 0.28) : alpha(ink, 0.75), textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
              {k}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

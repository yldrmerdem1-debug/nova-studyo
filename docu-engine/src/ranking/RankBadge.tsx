/**
 * RANK BADGE — while a countdown item runs, a small printed label in the top-left corner: "#7" and
 * the item's name. A viewer who drops in mid-video (Shorts, chapters, a skip) knows where the
 * countdown stands; it fades in after the rank card and out before the next. No hairlines.
 */
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../fonts';
import type { Genre, RankingInfo, Scene } from '../types';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const GOLD = '#ffd21f';

/** Each item's span on the timeline: from the first scene after its card to the end of its chapter (frames). */
export function badgeSpans(placed: { scene: Scene; from: number; frames: number }[], ranking?: RankingInfo): { rank: number; item: string; from: number; to: number }[] {
  if (!ranking?.items?.length) return [];
  const out: { rank: number; item: string; from: number; to: number }[] = [];
  for (const it of ranking.items) {
    const own = placed.filter((p) => p.scene?.chapter === it.chapter && !(p.scene?.type === 'title' && (p.scene as { chapterCard?: boolean }).chapterCard));
    if (!own.length) continue;
    const from = Math.min(...own.map((p) => p.from));
    const to = Math.max(...own.map((p) => p.from + p.frames));
    if (to - from > 30) out.push({ rank: it.rank, item: it.item, from, to });
  }
  return out;
}

const Badge: React.FC<{ rank: number; item: string; len: number; top: number; genre: Genre }> = ({ rank, item, len, top, genre }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = interpolate(f, [Math.round(0.4 * fps), Math.round(0.9 * fps)], [0, 1], clamp);
  const outP = interpolate(f, [len - Math.round(0.5 * fps), len - 2], [1, 0], clamp);
  const o = Math.min(inP, outP);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 64, top, display: 'flex', alignItems: 'center', gap: 16, opacity: o * 0.92, transform: `translateX(${(1 - inP) * -16}px)` }}>
        <span style={{ fontFamily: FONT.anton, fontSize: 40, lineHeight: 1, color: '#0b0a09', background: GOLD, padding: '6px 12px 4px' }}>#{rank}</span>
        <span style={{ fontFamily: FONT[genre.body], fontWeight: 800, fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f6f2ea', textShadow: '0 2px 6px rgba(0,0,0,0.85), 0 6px 22px rgba(0,0,0,0.6)', whiteSpace: 'nowrap', maxWidth: 900, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item}
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const RankBadges: React.FC<{ placed: { scene: Scene; from: number; frames: number }[]; ranking?: RankingInfo; genre: Genre }> = ({ placed, ranking, genre }) => {
  const spans = badgeSpans(placed, ranking);
  const top = genre.letterbox ? 150 : 56;
  return (
    <>
      {spans.map((s) => (
        <Sequence key={`rk${s.rank}`} from={s.from} durationInFrames={s.to - s.from} layout="none">
          <Badge rank={s.rank} item={s.item} len={s.to - s.from} top={top} genre={genre} />
        </Sequence>
      ))}
    </>
  );
};

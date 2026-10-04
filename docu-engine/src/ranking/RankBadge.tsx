/**
 * RANK BADGE — while a countdown item runs, a small printed label in the bottom-left corner: "#7"
 * and the item's name. A viewer who drops in mid-video (Shorts, chapters, a skip) knows where the
 * countdown stands. It rides only on picture scenes: over a map, a document, a board, a card or an
 * infographic it steps aside (the ranking test's QA found the old top-left badge printed over map
 * labels, document headings and the teletype key cards). No hairlines.
 */
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from '../fonts';
import type { Genre, RankingInfo, Scene } from '../types';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const GOLD = '#ffd21f';
/** Scenes that are a picture under at most a word or a name tag: the badge may sit on them. */
const CLEAN = new Set(['photo', 'words', 'slam', 'montage', 'title']);

type Placed = { scene: Scene; from: number; frames: number };
export type BadgeSpan = { rank: number; item: string; from: number; to: number };

const clean = (s: Scene) => CLEAN.has(s?.type) && !(s?.type === 'title' && (s as { chapterCard?: boolean }).chapterCard);

/**
 * Each item's badge windows (frames): runs of consecutive picture scenes inside its chapter. Runs
 * closer than half a second are joined (no blink across a cut); a run shorter than 1.5 s is dropped.
 */
export function badgeSpans(placed: Placed[], ranking?: RankingInfo, fps = 30): BadgeSpan[] {
  if (!ranking?.items?.length) return [];
  const out: BadgeSpan[] = [];
  for (const it of ranking.items) {
    const own = placed
      .filter((p) => p.scene?.chapter === it.chapter && !(p.scene?.type === 'title' && (p.scene as { chapterCard?: boolean }).chapterCard))
      .sort((a, b) => a.from - b.from);
    const runs: { from: number; to: number }[] = [];
    for (const p of own) {
      if (!clean(p.scene)) continue;
      const last = runs[runs.length - 1];
      if (last && p.from - last.to <= Math.round(0.5 * fps)) last.to = Math.max(last.to, p.from + p.frames);
      else runs.push({ from: p.from, to: p.from + p.frames });
    }
    for (const r of runs) if (r.to - r.from >= Math.round(1.5 * fps)) out.push({ rank: it.rank, item: it.item, from: r.from, to: r.to });
  }
  return out;
}

const Badge: React.FC<{ rank: number; item: string; len: number; bottom: number; genre: Genre }> = ({ rank, item, len, bottom, genre }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = interpolate(f, [Math.round(0.25 * fps), Math.round(0.7 * fps)], [0, 1], clamp);
  const outP = interpolate(f, [len - Math.round(0.4 * fps), len - 2], [1, 0], clamp);
  const o = Math.min(inP, outP);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 64, bottom, display: 'flex', alignItems: 'center', gap: 16, opacity: o * 0.92, transform: `translateX(${(1 - inP) * -16}px)` }}>
        <span style={{ fontFamily: FONT.anton, fontSize: 40, lineHeight: 1, color: '#0b0a09', background: GOLD, padding: '6px 12px 4px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>#{rank}</span>
        <span style={{ fontFamily: FONT[genre.body], fontWeight: 800, fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f6f2ea', textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 6px 22px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', maxWidth: 760, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item}
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const RankBadges: React.FC<{ placed: Placed[]; ranking?: RankingInfo; genre: Genre }> = ({ placed, ranking, genre }) => {
  const { fps } = useVideoConfig();
  const spans = badgeSpans(placed, ranking, fps);
  const bottom = genre.letterbox ? 150 : 52;
  return (
    <>
      {spans.map((s) => (
        <Sequence key={`rk${s.rank}-${s.from}`} from={s.from} durationInFrames={s.to - s.from} layout="none">
          <Badge rank={s.rank} item={s.item} len={s.to - s.from} bottom={bottom} genre={genre} />
        </Sequence>
      ))}
    </>
  );
};

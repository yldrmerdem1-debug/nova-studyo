/**
 * CHANNEL BUG — the channel's name, small, in the top-right corner (1.16.16: every outlier channel we studied frame
 * by frame carries one palette and one corner logo; ours carried none). Nova writes `script.channel` from the
 * channel names in Settings. Like the rank badge it rides only on picture scenes: over a map, a document, a board,
 * an infographic or a chapter card it steps aside, so it never prints over map labels or headings. Quiet: ~55%
 * opacity, no box, the look's accent as one small mark.
 */
import React from 'react';
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from './fonts';
import type { Genre, Scene } from './types';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
/** Scenes that are a picture under at most a word or a name tag: the bug may sit on them. */
const CLEAN = new Set(['photo', 'words', 'slam', 'montage', 'split']);

type Placed = { scene: Scene; from: number; frames: number };
export type BugSpan = { from: number; to: number };

/** Runs of picture scenes (frames); gaps under half a second are joined, runs under 2 s dropped. */
export function channelSpans(placed: Placed[], fps = 30): BugSpan[] {
  const runs: BugSpan[] = [];
  for (const p of [...placed].sort((a, b) => a.from - b.from)) {
    if (!CLEAN.has(p.scene?.type)) continue;
    const last = runs[runs.length - 1];
    if (last && p.from - last.to <= Math.round(0.5 * fps)) last.to = Math.max(last.to, p.from + p.frames);
    else runs.push({ from: p.from, to: p.from + p.frames });
  }
  return runs.filter((r) => r.to - r.from >= Math.round(2 * fps));
}

const Bug: React.FC<{ name: string; len: number; top: number; genre: Genre }> = ({ name, len, top, genre }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const o = Math.min(interpolate(f, [0, Math.round(0.4 * fps)], [0, 1], clamp), interpolate(f, [len - Math.round(0.4 * fps), len - 1], [1, 0], clamp));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', right: 56, top, display: 'flex', alignItems: 'center', gap: 10, opacity: o * 0.55 }}>
        <span style={{ width: 10, height: 10, background: genre.accent, boxShadow: '0 1px 4px rgba(0,0,0,0.6)' }} />
        <span style={{ fontFamily: FONT[genre.body], fontWeight: 800, fontSize: 22, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f6f2ea', textShadow: '0 2px 6px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const ChannelBug: React.FC<{ name?: string; placed: Placed[]; genre: Genre }> = ({ name, placed, genre }) => {
  const { fps } = useVideoConfig();
  if (!name) return null;
  const top = genre.letterbox ? 150 : 44;
  return (
    <>
      {channelSpans(placed, fps).map((s, i) => (
        <Sequence key={`bug${i}`} from={s.from} durationInFrames={s.to - s.from}>
          <Bug name={name} len={s.to - s.from} top={top} genre={genre} />
        </Sequence>
      ))}
    </>
  );
};

import type { FontKey } from '../types';
import { fitFont } from '../fonts';
import type { Box, ThumbPic } from './types';

/* Pure layout maths for the thumbnail templates (no React). */

export const THUMB_W = 1280;
export const THUMB_H = 720;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** The subject box, sanitised; absent = a centred portrait-ish region. */
export function subjectBox(pic: ThumbPic): Box {
  const b = pic.box;
  if (!b || ![b.x, b.y, b.w, b.h].every(Number.isFinite) || b.w <= 0.02 || b.h <= 0.02) return { x: 0.2, y: 0.1, w: 0.6, h: 0.8 };
  const x = clamp(b.x, 0, 0.98);
  const y = clamp(b.y, 0, 0.98);
  return { x, y, w: clamp(b.w, 0.02, 1 - x), h: clamp(b.h, 0.02, 1 - y) };
}

export interface Placed {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where the subject landed, in frame px. */
  subject: { x: number; y: number; w: number; h: number };
}

/**
 * Scale and position a picture so its subject's centre lands on (cx, cy) with
 * the subject `subjectH` px tall (and at most `maxSubjectW` wide), while the
 * picture still covers the region `cover` (no empty edges). The cover rule wins
 * over the aim: a small or edge-hugging subject slides instead of leaving a gap.
 */
export function placePic(
  pic: ThumbPic,
  o: { cx: number; cy: number; subjectH: number; maxSubjectW?: number; cover: { x: number; y: number; w: number; h: number }; box?: Box; reach?: number; maxScale?: number },
): Placed {
  const b = o.box ?? subjectBox(pic);
  const W = Math.max(1, pic.w || 1280);
  const H = Math.max(1, pic.h || 720);
  let s = o.subjectH / (b.h * H);
  if (o.maxSubjectW) s = Math.min(s, o.maxSubjectW / (b.w * W));
  s = Math.max(s, o.cover.w / W, o.cover.h / H);
  /*
   * reach: zoom in (up to reach x) when the cover rule would stop the subject
   * short of its aim — an off-centre detail in a landscape picture otherwise
   * stays in the middle, under the words.
   */
  if (o.reach && o.reach > 1) {
    const fx = b.x + b.w / 2;
    const fy = b.y + b.h / 2;
    const need = Math.max(
      fx > 0 ? (o.cx - o.cover.x) / (fx * W) : 0,
      fx < 1 ? (o.cover.x + o.cover.w - o.cx) / ((1 - fx) * W) : 0,
      fy > 0 ? (o.cy - o.cover.y) / (fy * H) : 0,
      fy < 1 ? (o.cover.y + o.cover.h - o.cy) / ((1 - fy) * H) : 0,
    );
    s = Math.max(s, Math.min(need, s * o.reach));
  }
  // Upscaling a source far past its pixels only shows mush: at most maxScale x (unless the cover rule needs more).
  s = Math.min(s, Math.max(o.maxScale ?? 2.2, o.cover.w / W, o.cover.h / H));
  const width = W * s;
  const height = H * s;
  const sx = (b.x + b.w / 2) * width;
  const sy = (b.y + b.h / 2) * height;
  const left = clamp(o.cx - sx, o.cover.x + o.cover.w - width, o.cover.x);
  const top = clamp(o.cy - sy, o.cover.y + o.cover.h - height, o.cover.y);
  return { left, top, width, height, subject: { x: left + b.x * width, y: top + b.y * height, w: b.w * width, h: b.h * height } };
}

/** Split words into 1-3 lines and find the largest size that fits the box. */
export function fitLines(
  text: string,
  font: FontKey,
  o: { maxW: number; maxH: number; cap: number; lineHeight?: number; trackEm?: number; maxLines?: number },
): { lines: string[][]; size: number } {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: o.cap };
  const lh = o.lineHeight ?? 0.92;
  const maxLines = Math.min(o.maxLines ?? 3, words.length);
  let best: { lines: string[][]; size: number; score: number } | null = null;
  const tryPartition = (cuts: number[]) => {
    const lines: string[][] = [];
    let a = 0;
    for (const c of [...cuts, words.length]) {
      lines.push(words.slice(a, c));
      a = c;
    }
    let size = o.maxH / (lines.length * lh);
    for (const l of lines) size = Math.min(size, fitFont(l.join(' '), font, { maxW: o.maxW, cap: o.cap, upper: true, trackEm: o.trackEm ?? 0.01, min: 10 }));
    size = Math.min(size, o.cap);
    // Fewer lines read faster; a lone short word on the last line looks like a mistake.
    const lonely = lines.length > 1 && lines.at(-1)!.join(' ').length <= 2 ? 0.85 : 1;
    const score = size * (lines.length === 1 ? 1 : lines.length === 2 ? 0.98 : 0.93) * lonely;
    if (!best || score > best.score) best = { lines, size, score };
  };
  tryPartition([]);
  for (let i = 1; i < words.length && maxLines >= 2; i++) tryPartition([i]);
  for (let i = 1; i < words.length && maxLines >= 3; i++) for (let j = i + 1; j < words.length; j++) tryPartition([i, j]);
  const b = best as unknown as { lines: string[][]; size: number };
  return { lines: b.lines, size: Math.floor(b.size) };
}

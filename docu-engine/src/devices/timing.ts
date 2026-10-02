import type { Annotate, Scene } from '../types';
import { infoImpacts, INFO_TYPES } from '../infographics/timing.js';

/*
 * Timing facts about the edit devices that the rest of the engine needs
 * (impacts, flicker masks) — kept free of React and of scenes.tsx so
 * scenes.tsx can import it without a cycle.
 */

/** Edit devices plus the infographics (src/infographics): all self-moving, all dispatched by devices/index.tsx. */
export const DEVICE_TYPES = ['board', 'document', 'timeline', 'split', 'quote', ...INFO_TYPES, 'explainer', 'ui-card'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];
export const isDeviceType = (t: unknown): t is DeviceType => (DEVICE_TYPES as readonly string[]).includes(String(t));

/** Frame (scene-local) where an annotated shot freezes: `at`, default 40% of the scene, kept inside it. */
export function annotateFrame(a: Annotate, durFrames: number, fps: number): number {
  const at = Number.isFinite(a.at) ? Math.round(Number(a.at) * fps) : Math.round(durFrames * 0.4);
  return Math.max(Math.round(0.3 * fps), Math.min(durFrames - Math.round(1.2 * fps), at));
}

/** Frame the document stamp lands on. */
export const stampFrame = (durFrames: number, fps: number) => Math.max(Math.round(0.9 * fps), Math.round(durFrames * 0.3));

/** Frame the before/after wipe (or the versus divider) lands. */
export const splitLand = (mode: string | undefined, durFrames: number, fps: number) =>
  mode === 'before-after' ? Math.min(durFrames - Math.round(0.8 * fps), Math.round(Math.max(1.1 * fps, durFrames * 0.3)) + Math.round(0.55 * fps)) : Math.round(0.4 * fps);

/**
 * Where the frame physically reacts inside a device scene (punch, shake,
 * lens split) — kept light: every device carries type the viewer reads, and
 * a hard shake would blur it.
 */
export function deviceImpacts(scene: Scene, durFrames: number, fps: number): { f: number; strength: number }[] {
  if (scene.type === 'document' && scene.stamp) return [{ f: stampFrame(durFrames, fps), strength: 0.35 }];
  if (scene.type === 'split') return [{ f: splitLand(scene.mode, durFrames, fps), strength: 0.2 }];
  if (scene.type === 'photo' && scene.annotate) return [{ f: annotateFrame(scene.annotate, durFrames, fps), strength: 0.18 }];
  // Infographics: a light nudge on each landing (src/infographics/timing.js).
  if ((INFO_TYPES as readonly string[]).includes(scene.type)) return infoImpacts(scene, durFrames, fps);
  return [];
}

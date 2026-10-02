import React from 'react';
import { Composition } from 'remotion';
import { Engine, FPS, totalFrames } from './Engine';
import { SCRIPTS } from './scripts/demos';
import type { Script } from './types';
import { ThumbnailStill } from './thumbnail';

const Comp = Engine as unknown as React.FC<Record<string, unknown>>;
const frames = (props: Record<string, unknown>) => totalFrames((props as unknown as { script: Script }).script);

/**
 * `thumbnail` is the YouTube thumbnail still (src/thumbnail, rendered by lib/thumbnail.mjs
 * for Nova's packaging step).
 * `video` is what the pipeline renders: it passes the fully built script
 * (voice files, word timings, music, beats, SFX) through --props. The demo
 * compositions stay for previewing the engine without any of that.
 */
export const Root: React.FC = () => (
  <>
    <ThumbnailStill />
    <Composition
      id="video"
      component={Comp}
      defaultProps={{ script: SCRIPTS[0] } as unknown as Record<string, unknown>}
      fps={FPS}
      width={1920}
      height={1080}
      durationInFrames={totalFrames(SCRIPTS[0])}
      calculateMetadata={({ props }) => ({ durationInFrames: frames(props) })}
    />
    {SCRIPTS.map((script) => (
      <Composition
        key={script.id}
        id={script.id}
        component={Comp}
        defaultProps={{ script } as unknown as Record<string, unknown>}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={totalFrames(script)}
        calculateMetadata={({ props }) => ({ durationInFrames: frames(props) })}
      />
    ))}
  </>
);

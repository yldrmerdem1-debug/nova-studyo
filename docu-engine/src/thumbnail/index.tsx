import React from 'react';
import { Still } from 'remotion';
import { Thumbnail } from './Thumbnail';
import { THUMB_H, THUMB_W } from './geometry';

export { Thumbnail } from './Thumbnail';
export type { ThumbProps, ThumbSpec } from './types';

const DEFAULT_PROPS = {
  thumb: { layout: 'hero', text: 'Thumbnail preview', hero: { src: '', w: 1280, h: 720 } },
  brand: { genre: 'documentary', locale: 'en' },
};

/** The YouTube thumbnail still (the pipeline's packaging step renders it with renderStill). */
export const ThumbnailStill: React.FC = () => (
  <Still id="thumbnail" component={Thumbnail} width={THUMB_W} height={THUMB_H} defaultProps={DEFAULT_PROPS as unknown as Record<string, unknown>} />
);

import React from 'react';
import type { Scene } from '../types';
import type { DevProps } from '../devices/common';
import { Bars } from './bars';
import { Donut } from './donut';
import { Flow } from './flow';
import { Icons } from './icons';
import { Scale } from './scale';
import { Stat } from './stat';

export { INFO_TYPES, isInfoType, infoImpacts, infoPlan, infoSfx } from './timing.js';

/**
 * The infographics' renderer (src/infographics/*), reached through the
 * device dispatcher (devices/index.tsx). Returns null for any other type.
 */
export const InfoScn: React.FC<DevProps & { scene: Scene }> = ({ scene, ...p }) => {
  switch (scene.type) {
    case 'bars':
      return <Bars {...p} scene={scene} />;
    case 'donut':
      return <Donut {...p} scene={scene} />;
    case 'icons':
      return <Icons {...p} scene={scene} />;
    case 'scale':
      return <Scale {...p} scene={scene} />;
    case 'flow':
      return <Flow {...p} scene={scene} />;
    case 'stat':
      return <Stat {...p} scene={scene} />;
    default:
      return null;
  }
};

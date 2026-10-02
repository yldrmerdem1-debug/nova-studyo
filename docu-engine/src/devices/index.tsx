import React from 'react';
import type { Scene } from '../types';
import { Board } from './board';
import { Chrono } from './chrono';
import type { DevProps } from './common';
import { DocumentScn } from './document';
import { InfoScn } from '../infographics';
import { Quote } from './quote';
import { Split } from './split';
import { ExplainerScn } from '../topic/explainer';
import { UiCardScn } from '../topic/uicard';

export { Annotated } from './annotate';
export { DEVICE_TYPES, isDeviceType, deviceImpacts, annotateFrame } from './timing';

/**
 * The edit devices' renderer: one entry point for the engine's scene
 * dispatch. Returns null for any other scene type.
 */
export const DeviceScn: React.FC<DevProps & { scene: Scene }> = ({ scene, ...p }) => {
  switch (scene.type) {
    case 'board':
      return <Board {...p} scene={scene} />;
    case 'document':
      return <DocumentScn {...p} scene={scene} />;
    case 'timeline':
      return <Chrono {...p} scene={scene} />;
    case 'split':
      return <Split {...p} scene={scene} />;
    case 'quote':
      return <Quote {...p} scene={scene} />;
    // Infographics (src/infographics): bars, donut, icons, scale, flow, stat.
    case 'bars':
    case 'donut':
    case 'icons':
    case 'scale':
    case 'flow':
    case 'stat':
      return <InfoScn {...p} scene={scene} />;
    // The topic's signature devices (src/topic).
    case 'explainer':
      return <ExplainerScn {...p} scene={scene} />;
    case 'ui-card':
      return <UiCardScn {...p} scene={scene} />;
    default:
      return null;
  }
};

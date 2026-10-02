import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getStyleProfile} from '../src/pipeline/style-profile.js';
import {planEditorialShot} from '../src/pipeline/editorial-shots.js';
import {measureVisualQuality,longformWarnings} from '../src/pipeline/longform-quality.js';

const hook=await import('../src/pipeline/hook-pacing.js').catch(()=>({}));
const home=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const tts=JSON.parse(fs.readFileSync(path.join(home,'data/jobs/20260923-b8ae90/tts.json'),'utf8'))[0];
const anchors=[
  'Fifteen American planes went in.',
  'None came back.',
  'And they hit nothing.',
  'An hour later, three Japanese aircraft carriers were burning.',
];

test('Midway portrait Short cuts four verified hook visuals at the spoken sentence boundaries',()=>{
  assert.equal(typeof hook.planPortraitShortHook,'function');
  const job={mediaKind:'director',ratio:'9:16'};
  const segment={index:0,text:tts.text,words:tts.words,dur:tts.duration+.12};
  const plan=hook.planPortraitShortHook({job,segment,totalDurationSec:57.3,mediaCount:4,anchors});
  assert.equal(plan.count,4);
  assert.deepEqual(plan.alignment.gorselSirasi,[0,1,2,3]);
  assert.deepEqual(plan.alignment.gruplar.map(x=>Number(x.son.toFixed(3))).slice(0,3),[2.032,3.367,4.911]);
  assert.equal(hook.planPortraitShortHook({job:{...job,ratio:'16:9'},segment,totalDurationSec:57.3,mediaCount:4,anchors}),null);
  assert.equal(hook.planPortraitShortHook({job,segment,totalDurationSec:12*60,mediaCount:4,anchors}),null);
});

test('first AI Director portrait image moves and displays a legible hook immediately',()=>{
  const plan=planEditorialShot({director:true,canvas:{w:1080,h:1920},profile:getStyleProfile('belgesel'),index:0,
    beat:{id:'s0b0',dur:2.032,isVideoStart:true,media:{type:'image',editorial:{overlay:{value:'15 AIRCRAFT',label:'TORPEDO SQUADRON EIGHT',anchorQuote:anchors[0],position:'left'}}}}});
  assert.equal(plan.camera.mode,'push');
  assert.ok(plan.camera.amount>0);
  const value=plan.textBlocks.find(b=>b.role==='value');
  assert.ok(value.fontSize>=100,`opening value font ${value.fontSize}`);
  assert.ok(value.delay<=.08,`opening overlay delay ${value.delay}`);
  assert.ok(plan.textBlocks.every(b=>b.y+b.height<1920*.68));
});

test('a five-second static opening is flagged while the revised two-second opening passes',()=>{
  const old=measureVisualQuality([{dur:4.911,media:{type:'image'}},{dur:52,media:{type:'video',duration:52}}],[],{fps:30});
  const revised=measureVisualQuality([{dur:2.032,media:{type:'image'}},{dur:1.335,media:{type:'video',duration:28}},{dur:1.544,media:{type:'image'}},{dur:52,media:{type:'video',duration:52}}],[],{fps:30});
  const job={mediaKind:'director',ratio:'9:16'};
  assert.equal(old.openingStillSec,4.91);
  assert.ok(longformWarnings(old,job).some(w=>/açılış/i.test(w)));
  assert.equal(revised.openingStillSec,2.03);
  assert.ok(!longformWarnings(revised,job).some(w=>/açılış/i.test(w)));
});

test('portrait Director Shorts budget enough sentence-aligned cuts after the opening',()=>{
  assert.equal(typeof hook.targetEditorialCutSeconds,'function');
  const portrait={mediaKind:'director',ratio:'9:16',visualStyle:'editorial'};
  assert.equal(hook.targetEditorialCutSeconds(portrait,50,4.5),3.2);
  assert.equal(Math.round(6.48/hook.targetEditorialCutSeconds(portrait,50,4.5)),2);
  assert.equal(hook.targetEditorialCutSeconds({...portrait,ratio:'16:9'},50,4.5),4.5);
  assert.equal(hook.targetEditorialCutSeconds(portrait,12*60,4.5),4.5);
  assert.equal(hook.targetEditorialCutSeconds({...portrait,mediaKind:'stock'},50,4.5),4.5);
});

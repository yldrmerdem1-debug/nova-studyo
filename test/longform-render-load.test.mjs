import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-longform-render-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {RATIOS}=await import('../src/pipeline/canvas.js');
// This is a duration/concurrency workload. A small canvas keeps it fast while
// executing the same scene, transition, audio, concat and report pipeline.
RATIOS['16:9']={...RATIOS['16:9'],w:320,h:180};
const {renderAll}=await import('../src/pipeline/render.js');

const run=(args)=>execFileSync(ff,['-hide_banner','-loglevel','error',...args],{stdio:'pipe'});

test('a real 12-minute mixed-media render stays exact and writes review evidence',async()=>{
  const dir=path.join(home,'job');fs.mkdirSync(dir,{recursive:true});
  const still=path.join(home,'still.jpg'),clip=path.join(home,'clip.mp4'),voice=path.join(home,'voice.wav');
  run(['-f','lavfi','-i','testsrc2=s=320x180:r=5','-frames:v','1','-y',still]);
  run(['-f','lavfi','-i','testsrc2=s=320x180:r=5:d=6','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-an','-y',clip]);

  const sectionCount=6,perSection=24,sceneCount=sectionCount*perSection;
  const gapSeconds=(sceneCount-sectionCount)*.12+sectionCount*.70;
  const voiceDuration=(12*60-7-gapSeconds)/sceneCount;
  run(['-f','lavfi','-i',`sine=frequency=220:sample_rate=48000:duration=${voiceDuration}`,'-ar','48000','-ac','1','-y',voice]);

  const script={title:'On iki dakikalık yerel uzun video denemesi',sections:[]};
  const tts=[],media={};let index=0;
  for(let section=0;section<sectionCount;section++){
    const segments=[];
    for(let item=0;item<perSection;item++,index++){
      segments.push({text:`Yerel uzun video sahnesi ${index+1}.`,emphasis:{type:'none'},visuals:[{type:index<87?'video':'image',kind:index<87?'event':'document',query:`verified local scene ${index+1}`}]});
      tts.push({segId:`s${index}`,text:`Yerel uzun video sahnesi ${index+1}.`,duration:voiceDuration,audio:voice,words:[]});
      media[`s${index}b0`]={type:index<87?'video':'image',file:index<87?clip:still,provider:'local fixture',gorsel:3,kalite:3,videoTutarlilik:index<87?3:null,akis:index%2?'sola':'saga',sourceId:`fixture-${index}`};
    }
    script.sections.push({title:`Bölüm ${section+1}`,segments});
  }

  const logs=[];
  const result=await renderAll({id:'longform-load',theme:'belgesel',language:'tr',ratio:'16:9',visualStyle:'klasik',mediaKind:'mixed',demo:true,subtitleMode:'none',transitions:'sinematik',musicVolume:0,soundDesign:false,settingsSnapshot:{preset:'ultrafast',crf:35,fps:5,concurrency:4,cinemaGrade:false}},script,media,tts,dir,m=>logs.push(m),()=>{},{cancelled:false,add(){},remove(){},delete(){}});
  const measured=JSON.parse(execFileSync(probe.path,['-v','error','-show_entries','format=duration','-of','json',path.join(dir,'output.mp4')],{encoding:'utf8'}));
  const actual=Number(measured.format.duration),visual=JSON.parse(fs.readFileSync(path.join(dir,'visual-quality.json'))),edit=JSON.parse(fs.readFileSync(path.join(dir,'edit-plan.json')));
  assert.ok(Math.abs(result.durationSec-720)<.01,`planned ${result.durationSec}`);
  assert.ok(Math.abs(actual-720)<.25,`actual ${actual}`);
  assert.equal(edit.totalFrames,720*5);assert.equal(edit.scenes.length,144);
  assert.ok(visual.videoPercent>=59.5&&visual.videoPercent<=60.5,`video ${visual.videoPercent}%`);
  assert.equal(visual.weakSceneCount,0);assert.equal(visual.cardSceneCount,0);
  assert.ok(logs.some(line=>/Hareketli görüntü kapsamı/.test(line)));
},{timeout:240000});

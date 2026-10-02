import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-mode-render-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {getSettings,saveSettings}=await import('../src/config.js');
const {downloadPicked,candidateKey,normalizeBeatTypes}=await import('../src/pipeline/media.js');
const {imageProvider,videoProvider,generateKeyframes,animateKeyframes,styleOf}=await import('../src/pipeline/collage.js');
const {renderAll}=await import('../src/pipeline/render.js');
const {selectProductionMode}=await import('../public/production-modes.js');
const picture=path.join(home,'original.jpg'),video=path.join(home,'original.mp4'),audio=path.join(home,'voice.wav');
execFileSync(ff,['-v','error','-f','lavfi','-i','testsrc2=s=640x360','-frames:v','1','-y',picture]);
execFileSync(ff,['-v','error','-f','lavfi','-i','testsrc2=s=640x360:r=15:d=3','-c:v','libx264','-preset','ultrafast','-y',video]);
execFileSync(ff,['-v','error','-f','lavfi','-i','sine=frequency=220:duration=1.4','-y',audio]);
const settings={...getSettings(),dryRun:false,imageProvider:'fal',videoProvider:'fal',falKey:'offline-placeholder',aiHareket:false,preset:'ultrafast',crf:28,fps:15,concurrency:1,cinemaGrade:false,musicVolume:0};
saveSettings({falKey:'offline-placeholder'});
const killer={cancelled:false,add(){},remove(){},delete(){}};
let imageCalls=0,videoCalls=0;
// Exercise real downloads and encoders with local original fixtures; paid providers are stubbed.
globalThis.fetch=async url=>{
 if(!String(url).startsWith('https://fixture.invalid/'))throw Error(`Unexpected network ${new URL(url).hostname}`);
 return new Response(fs.readFileSync(String(url).endsWith('.mp4')?video:picture),{status:200});
};
imageProvider(settings).textToImage=async()=>{imageCalls++;return 'https://fixture.invalid/generated.jpg';};
imageProvider(settings).imageToImage=async()=>{imageCalls++;return 'https://fixture.invalid/generated.jpg';};
videoProvider(settings).imageToVideo=async()=>{videoCalls++;return 'https://fixture.invalid/generated.mp4';};
for(const mode of ['image','mixed','ai','kolaj','fullai'])test(`${mode}: selected media reaches a real playable video with audio`,async()=>{
 const dir=path.join(home,mode);fs.mkdirSync(dir);
 imageCalls=0;videoCalls=0;
 const job={id:`fixture-${mode}`,visualStyle:'editorial',mediaKind:'mixed',aiButce:1,collageMode:'hibrit',theme:'belgesel',language:'en',demo:true,subtitleMode:'none',transitions:'yok',musicVolume:0,soundDesign:false,settingsSnapshot:settings};
 selectProductionMode(job,mode);
 const texts=['A local original test scene.','The camera follows the evidence.','The test ends with an answer.'];
 const tts=texts.map((text,i)=>({segId:`s${i}`,text,audio,duration:1.4,words:[]}));
 let script,media;
 if(['kolaj','fullai'].includes(mode)){
  const beats=texts.map((text,i)=>({id:`b${i}`,text,concept:'A detailed original mechanical device',duration:1.4}));
  script={title:'Local mode verification',beats};
  const keyframes=await generateKeyframes(beats,path.join(dir,'frames'),{dryRun:false,settings,stil:styleOf(job),logFn:()=>{},isCancelled:()=>false,killer});
  media=await animateKeyframes(beats,keyframes,path.join(dir,'clips'),{dryRun:false,animate:true,mode:'hibrit',settings,stil:styleOf(job),logFn:()=>{},isCancelled:()=>false,killer});
  assert.equal(imageCalls,3);assert.equal(videoCalls,1);
  assert.equal(Object.values(media).filter(m=>m.type==='video').length,1);
 }else{
  script={title:'Local mode verification',sections:[{title:'Original evidence',segments:texts.map((text,i)=>({text,visuals:[{type:mode==='ai'&&i===0?'ai':i===1?'video':'image',query:`original test scene ${i}`,prompt:'An original mechanical device in a laboratory'}]}))}]};
  normalizeBeatTypes(job,script);
  const candidates={},picks={};
  for(const [i,seg] of script.sections[0].segments.entries()){
   const v=seg.visuals[0];
   candidates[candidateKey(v)]=[
    {id:`video-${i}`,type:'video',score:100,provider:'local',localPath:video,url:`https://fixture.invalid/source-${i}.mp4`,metin:v.query},
    {id:`image-${i}`,type:'image',score:100,provider:'local',url:`https://fixture.invalid/source-${i}.jpg`,metin:v.query}
   ];
   picks[`s${i}b0`]=`video-${i}`;
  }
  media=await downloadPicked(job,script,candidates,picks,path.join(dir,'media'),()=>{},()=>false,killer);
  if(mode==='image'){assert.equal(imageCalls,0);assert.ok(Object.values(media).every(m=>m.type==='image'));}
  if(mode==='mixed'){assert.equal(imageCalls,0);assert.ok(Object.values(media).some(m=>m.type==='video'));}
  if(mode==='ai'){assert.equal(imageCalls,1);assert.equal(media.s0b0.provider,'ai');}
 }
 assert.ok(Object.values(media).every(m=>m.file&&fs.existsSync(m.file)));
 const result=await renderAll(job,script,media,tts,dir,()=>{},()=>{},killer);
 const data=JSON.parse(execFileSync(probe.path,['-v','error','-show_format','-show_streams','-of','json',path.join(dir,'output.mp4')],{encoding:'utf8'}));
 assert.ok(data.streams.some(s=>s.codec_type==='audio'));assert.ok(data.streams.some(s=>s.codec_type==='video'));
 assert.ok(Number(data.format.duration)>=4.2);assert.ok(Math.abs(Number(data.format.duration)-result.durationSec)<.15);
 console.log(JSON.stringify({mode,dir,duration:data.format.duration,media:Object.values(media).map(m=>m.type),imageCalls,videoCalls}));
});

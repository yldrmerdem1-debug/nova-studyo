import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import {ProcKiller} from '../src/util.js';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-editorial-audit-'));
const {auditEditorialMedia,editorialVideoSampleTimes}=await import('../src/pipeline/editorial-audit.js');

function response(value){return {content:[{type:'text',text:JSON.stringify(value)}],usage:{input_tokens:1,output_tokens:1}};}
const verdict={puan:3,kalite:2,continuity:3,hardMismatch:false,defects:[],observation:'five successive solid-color scenes',kadraj:'manzara',odak:'orta',flow:'sabit',yer:'dogru'};

test('five samples remain ordered even for a very short clip',()=>{
 const samples=editorialVideoSampleTimes(.1);
 assert.equal(samples.length,5);assert.ok(samples.every((n,i)=>i===0||n>samples[i-1]));assert.ok(samples.at(-1)<.1);
});

test('audits a real five-frame video contact sheet through the injected model boundary',async()=>{
 const clips=[];
 for(const [i,color] of ['red','green','blue','yellow','magenta'].entries()){
  const file=path.join(home,`${i}.mp4`); clips.push(file);
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i',`color=${color}:s=320x180:d=1:r=10`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',file]);
 }
 const list=path.join(home,'five.txt');fs.writeFileSync(list,clips.map(f=>`file '${f}'`).join('\n'));
 const video=path.join(home,'five.mp4');execFileSync(ffmpeg,['-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-y',video]);
 let seen;
 const result=await auditEditorialMedia({type:'video',file:video},{narration:'Exactly five colors appear in sequence.',anchorQuote:'five colors',prompt:'five colored scenes',sourceRole:'evidence',theme:'test'}, {
  settings:{ffmpegPath:ffmpeg,ffprobePath:ffprobe.path,model:'claude-opus-test'},
  request:async(params,_log,model)=>{seen={params,model};return response(verdict);}
 });
 assert.equal(seen.model,'claude-opus-test');
 const blocks=seen.params.messages[0].content;
 const images=blocks.filter(b=>b.type==='image');assert.equal(images.length,1);
 const jpg=Buffer.from(images[0].source.data,'base64');
 const dimensions=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_streams','-of','json','pipe:0'],{input:jpg,encoding:'utf8'}));
 assert.equal(dimensions.streams[0].width,1536);assert.equal(dimensions.streams[0].height,1024);
 const pixels=execFileSync(ffmpeg,['-v','error','-i','pipe:0','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:jpg,maxBuffer:1536*1024*4});
 const rgb=([x,y])=>[pixels[(y*1536+x)*3],pixels[(y*1536+x)*3+1],pixels[(y*1536+x)*3+2]];
 const [red,green,blue,yellow,magenta]=[[256,256],[768,256],[1280,256],[256,768],[768,768]].map(rgb);
 assert.ok(red[0]>red[1]*2&&red[0]>red[2]*2);assert.ok(green[1]>green[0]&&green[1]>green[2]);assert.ok(blue[2]>blue[0]*2&&blue[2]>blue[1]*2);
 assert.ok(yellow[0]>150&&yellow[1]>150&&yellow[2]<80);assert.ok(magenta[0]>150&&magenta[2]>150&&magenta[1]<80);
 assert.match(blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n'),/5 FRAME CONTACT SHEET/);
 assert.deepEqual(result,{puan:3,kalite:2,videoTutarlilik:3,yer:'dogru',gorunen:verdict.observation,kadraj:'manzara',odak:'orta',akis:'sabit',defects:[],verified:true});
});

test('hard mismatch always forces zero and prompt preserves exact editorial context',async()=>{
 const still=path.join(home,'still.png');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=black:s=1600x900','-frames:v','1','-y',still]);
 let prompt='';
 const mismatch={...verdict,puan:3,hardMismatch:true,defects:['wrong entity'],observation:'modern car'};
 const result=await auditEditorialMedia({type:'image',file:still},{narration:'Odysseus raises his oar.',anchorQuote:'raises his oar',prompt:'ancient sailor',sourceRole:'illustration',theme:'antiquity'}, {settings:{ffmpegPath:ffmpeg,ffprobePath:ffprobe.path,model:'premium'},request:async params=>{prompt=params.messages[0].content.at(-1).text;return response(mismatch);}});
 assert.equal(result.puan,0);assert.match(prompt,/Odysseus raises his oar\./);assert.match(prompt,/raises his oar/);assert.match(prompt,/illustration/);assert.match(prompt,/artist.*later/is);
 assert.match(prompt,/vehicle identification numbers/i);assert.match(prompt,/looks staged/i);assert.match(prompt,/minor observations.*observation/i);
});

test('invalid or cancelled audits do not invent success',async()=>{
 const still=path.join(home,'cancel.png');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=white:s=20x20','-frames:v','1','-y',still]);
 await assert.rejects(()=>auditEditorialMedia({type:'image',file:still},{narration:'x'},{settings:{ffmpegPath:ffmpeg,ffprobePath:ffprobe.path,model:'premium'},isCancelled:()=>true,request:async()=>response(verdict)}),/cancelled/);
 await assert.rejects(()=>auditEditorialMedia({type:'image',file:still},{narration:'x'},{settings:{ffmpegPath:ffmpeg,ffprobePath:ffprobe.path,model:'premium'},request:async()=>response({...verdict,puan:9})}),/doğrulanamadı|schema/i);
});

test('passes a real AbortSignal from ProcKiller and observes cancellation at the request boundary',async()=>{
 const still=path.join(home,'abort.png');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=white:s=20x20','-frames:v','1','-y',still]);
 const killer=new ProcKiller();let signal;
 await assert.rejects(()=>auditEditorialMedia({type:'image',file:still},{narration:'x'},{settings:{ffmpegPath:ffmpeg,ffprobePath:ffprobe.path,model:'premium'},killer,request:async(_params,_log,_model,_usage,control)=>{signal=control.signal;killer.cancel();return response(verdict);}}),/cancelled/);
 assert.ok(signal instanceof AbortSignal);assert.equal(signal.aborted,true);
});

test('also accepts a killer carrying an AbortSignal property',async()=>{
 const still=path.join(home,'signal-property.png');execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=black:s=20x20','-frames:v','1','-y',still]);
 const controller=new AbortController();let observed;
 await auditEditorialMedia({type:'image',file:still},{narration:'x'},{settings:{ffmpegPath:ffmpeg,ffprobePath:ffprobe.path,model:'premium'},killer:{cancelled:false,signal:controller.signal,add(){},remove(){}},request:async(_params,_log,_model,_usage,control)=>{observed=control.signal;return response(verdict);}});
 assert.equal(observed,controller.signal);
});

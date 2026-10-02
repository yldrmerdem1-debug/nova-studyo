import test from 'node:test';
import assert from 'node:assert/strict';
import * as shots from '../src/pipeline/editorial-shots.js';
import {sceneAnchorQueries} from '../src/pipeline/render.js';
import {sahneHizasi} from '../src/pipeline/cumlehizasi.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
const entry=(canvas,extra={})=>({director:true,canvas,beat:{id:'a',dur:6,media:{type:'video',odak:'right',editorial:{overlay:{value:'8,7 milyon litre',label:'Pekmez',anchorQuote:'8,7 milyon litre',position:'right'}}}},...extra});
for(const canvas of [{w:1920,h:1080},{w:1080,h:1920}])test(`Director grounded typography ${canvas.w}`,()=>{
 const p=shots.planEditorialShot(entry(canvas));
 assert.equal(p.layout,'directed-overlay');assert.equal(p.textBlocks.filter(b=>b.role!=='label').flatMap(b=>b.lines).join(' '),'8,7 milyon litre');
 for(const b of p.textBlocks){assert.ok(b.x>=canvas.w*.05);assert.ok(b.x+b.width<=canvas.w*.95+1);assert.ok(b.y+b.height<canvas.h*.72);}
 assert.equal(p.overlayPosition,'left');assert.equal(p.mediaRect.width,canvas.w);
});
test('Director never invents isolated spoken numeric headline',()=>{
 const p=shots.planEditorialShot(entry({w:1920,h:1080},{beat:{dur:6},words:[{t:'1919',start:1}]}));assert.equal(p.textBlocks.length,0);
});
test('intentional adjacent data survives legacy text budget',()=>{const entries=Array.from({length:4},()=>entry({w:1920,h:1080}));assert.ok(shots.planEditorialSequence(entries).every(p=>p.textBlocks.length>=2));});
test('cinematic factual type keeps US GALLONS together, uses clear hierarchy and no caption boxes',()=>{
 const e=entry({w:1920,h:1080});e.beat.media.editorial.overlay.value='2.3 MILLION US GALLONS';
 const p=shots.planEditorialShot(e),value=p.textBlocks.find(b=>b.role==='value'),unit=p.textBlocks.find(b=>b.role==='unit');
 assert.equal(value.lines.join(' '),'2.3 MILLION');assert.equal(unit?.lines.join(' '),'US GALLONS');assert.ok(unit.fontSize<value.fontSize);assert.ok(p.textBlocks.every(b=>!b.contrast));
});
test('source continuity accounts for incoming transition handles',()=>{
 assert.equal(typeof shots.planEditorialSourceTiming,'function');
 const beats=[{media:{type:'video',file:'same'}},{media:{type:'video',file:'same'}}];
 const t=shots.planEditorialSourceTiming(beats,{slot:[90,90],a:[6],L:[96,96]},30);
 assert.equal(t[0].sourceStartFrame,0);assert.equal(t[1].sourceStartFrame,84);
});
test('curated media anchors preserve later Director shots when script visuals are empty',()=>{
 const narration='Fifteen aircraft entered. None returned. Three carriers were burning.';
 const media={s0b0:{editorial:{anchorQuote:'Fifteen aircraft entered.'}},s0b1:{editorial:{anchorQuote:'Three carriers were burning.'}}};
 const queries=sceneAnchorQueries(media,0,[],2);
 assert.deepEqual(queries,['Fifteen aircraft entered.','Three carriers were burning.']);
 const words=narration.split(/\s+/).map((t,i)=>({t,start:i*.55,end:(i+1)*.55}));
 const aligned=sahneHizasi(narration,words,2,8,2.2,queries);
 assert.deepEqual(aligned?.gorselSirasi,[0,1]);
});
test('exhaustion fails explicitly and settled animation reserves readable hold',()=>{
 assert.equal(typeof shots.resolveEditorialVideoTiming,'function');
 assert.throws(()=>shots.resolveEditorialVideoTiming({frames:180,fps:30,sourceDuration:2}),/exhaust/i);
 const t=shots.resolveEditorialVideoTiming({frames:180,fps:30,sourceDuration:8,settledAt:5.5});
 assert.equal(t.sourceStartFrame,31);assert.equal(t.movingFrames,135);assert.equal(t.holdFrames,45);
});
test('extreme portrait overlay fails visibly rather than truncating evidence',()=>{
 const e=entry({w:1080,h:1920});e.beat.media.editorial.overlay.value='123456789'.repeat(100);assert.throws(()=>shots.planEditorialShot(e),/overlay/);
});
test('portrait Director can preserve an archival frame over a matching soft background',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-portrait-'));
 const source=path.join(dir,'archive.mp4'),output=path.join(dir,'portrait.mp4');
 execFileSync(ff,['-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=1','-c:v','libx264','-y',source]);
 const canvas={w:180,h:320},media={type:'video',file:source,preserveFrame:true,editorial:{sourceRole:'evidence'}};
 const plan=shots.planEditorialShot({director:true,canvas,beat:{id:'archive',dur:.8,media}});
 assert.equal(plan.fit,'blurred-contain');
 assert.equal(shots.planEditorialShot({director:true,canvas,beat:{id:'archive-auto',dur:.8,media:{...media,preserveFrame:false}}}).fit,'cover','an audited portrait crop can fill the frame when no evidence needs full-frame preservation');
 await shots.renderEditorialShot({st:{ffmpegPath:ff,ffprobePath:probe.path,fps:30,preset:'ultrafast',concurrency:1,cinemaGrade:false},canvas,media,plan,frames:24,outFile:output,crf:28});
 const pixels=execFileSync(ff,['-v','error','-ss','0.4','-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
 const at=(10*canvas.w+canvas.w/2)*3;
 assert.ok(pixels[at]>100&&pixels[at+1]<80,'top portrait area has source-colored soft background, not an empty black bar');
});
test('landscape Director preserves a 4:3 archive without hard side bars',()=>{
 const media={type:'video',file:'period-film.webm',preserveFrame:true,editorial:{sourceRole:'evidence'}};
 const plan=shots.planEditorialShot({director:true,canvas:{w:1920,h:1080},beat:{id:'archive',dur:6,media}});
 assert.equal(plan.fit,'blurred-contain');
 const photo=shots.planEditorialShot({director:true,canvas:{w:1920,h:1080},beat:{id:'archive-photo',dur:6,media:{type:'image',file:'yorktown.jpg',preserveFrame:true,editorial:{sourceRole:'evidence'}}}});
 assert.equal(photo.fit,'blurred-contain','a full ship photograph should not get black side bars');
});
test('real FFmpeg offsets work without grading, settled frames hold and missing/exhausted Director footage fails',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-director-timing-'));
 const source=path.join(dir,'source.mp4');
 execFileSync(ff,['-v','error','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=2','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=3','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-y',source]);
 const st={ffmpegPath:ff,ffprobePath:probe.path,fps:30,preset:'ultrafast',concurrency:1,cinemaGrade:false};
 const base=shots.planEditorialShot({director:true,canvas:{w:320,h:180},beat:{id:'timing',dur:2,media:{type:'video'}}});
 const render=async(name,plan,frames=60,media={type:'video',file:source})=>{const outFile=path.join(dir,name+'.mp4');await shots.renderEditorialShot({st,canvas:{w:320,h:180},media,plan,frames,outFile,crf:18});return outFile;};
 const rgb=(f,t)=>{const b=execFileSync(ff,['-v','error','-ss',String(t),'-i',f,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);return [...b.subarray((90*320+160)*3,(90*320+160)*3+3)];};
 const a=await render('start',{...base,sourceStartFrame:0}),b=await render('offset',{...base,sourceStartFrame:60});
 const between=await render('between-keyframes',{...base,sourceStartFrame:65});
 assert.ok(rgb(a,.1)[0]>200);assert.ok(rgb(b,.1)[2]>200,'offset is applied with cinemaGrade false');
 assert.ok(rgb(between,.1)[2]>200,'seeking into a non-whole-second source frame keeps the intended excerpt');
 const held=await render('settled',{...base,settledAt:2.5},120);assert.ok(rgb(held,2.6)[2]>200);assert.deepEqual(rgb(held,2.6),rgb(held,3.8));
 const info=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',held]));assert.equal(Number(info.streams[0].nb_frames),120);
 await assert.rejects(render('exhausted',{...base,sourceStartFrame:140}),/exhausted/);
 await assert.rejects(render('missing',base,60,null),/required media unavailable/);
 for(const canvas of [{w:640,h:360},{w:360,h:640}]){
  const p=shots.planEditorialShot(entry(canvas)),outFile=path.join(dir,`overlay-${canvas.w}.mp4`);
  await shots.renderEditorialShot({st,canvas,media:{type:'video',file:source},plan:p,frames:60,outFile,crf:18});
  const jpg=path.join(dir,`overlay-${canvas.w}.jpg`);execFileSync(ff,['-v','error','-ss','1','-i',outFile,'-frames:v','1','-y',jpg]);
  const pixels=execFileSync(ff,['-v','error','-ss','1','-i',outFile,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
  let typed=0;for(let y=0;y<canvas.h*.68;y++)for(let x=0;x<canvas.w;x++){const at=(y*canvas.w+x)*3;if(pixels[at+1]>100)typed++;}assert.ok(typed>20,'native readable overlay actually rendered');
 }
 console.log(`FFmpeg proof: ${dir}`);
});

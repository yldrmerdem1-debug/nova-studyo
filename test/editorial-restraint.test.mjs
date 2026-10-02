import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {getStyleProfile} from '../src/pipeline/style-profile.js';
import * as editorial from '../src/pipeline/editorial-motion.js';
const input=(i,extra={})=>({beat:{id:`s${i}b0`,dur:5,isVideoStart:i===0,sectionTitle:'A Print With No Weather',media:{type:'image'}},words:[{t:'The study in',start:.1},{t:String(1960+i),start:1}],title:'Why Apollo 11 Bootprints Remain on the Moon',index:i,profile:getStyleProfile('belgesel'),canvas:{w:1920,h:1080},...extra});
const shot=entry=>{assert.equal(typeof editorial.planEditorialShot,'function');return editorial.planEditorialShot(entry);};
const sequence=entries=>{assert.equal(typeof editorial.planEditorialSequence,'function');return editorial.planEditorialSequence(entries);};
test('ordinary shots fill the canvas with no recurring label, quote or takeover',()=>{
 const p=shot(input(4,{words:[]}));assert.equal(p.layout,'immersive');assert.deepEqual(p.textBlocks,[]);
 assert.deepEqual(p.mediaRect,{x:0,y:0,width:1920,height:1080});assert.equal(p.takeover,null);
});
test('spoken year is a brief overlay on the source, without unspoken metadata',()=>{
 const p=shot(input(1,{beat:{id:'year',dur:6,emphasis:{value:'20 July 1969'}},words:[{t:'Apollo',start:.1},{t:'11',start:.3},{t:'landed in',start:.6},{t:'July 1969',start:1.7}]}));
 assert.equal(p.focus,'July 1969');assert.equal(p.events.find(e=>e.event==='accent').start,1.7);
 assert.ok(p.textBlocks.every(b=>b.end-b.delay<=3&&b.end<6));assert.ok(!JSON.stringify(p).includes('20 July'));assert.equal(p.mediaRect.width,1920);
});
test('sequence budgets typography, spaces overlays and never repeats a year',()=>{
 const entries=Array.from({length:24},(_,i)=>input(i));entries[14].words=[{t:'1963',start:1}];
 const plans=sequence(entries),decorated=plans.filter(p=>p.textBlocks.length);assert.ok(decorated.length<=Math.ceil(plans.length/4));assert.ok(decorated.length>=2);
 let at=0,last=-Infinity;const seen=new Set();for(const p of plans){if(p.textBlocks.length){const t=at+p.textBlocks[0].delay;assert.ok(t-last>=12);last=t;if(p.focus){assert.ok(!seen.has(p.focus));seen.add(p.focus);}}at+=p.duration;}
});
test('photo motion varies with short holds; source video and documents retain their own composition, never a frozen passage',()=>{
 const entries=Array.from({length:12},(_,i)=>input(i,{words:[]}));entries[3].beat.media={type:'video'};entries[7].beat.media={type:'image',kadraj:'belge'};
 const plans=sequence(entries),types=plans.map(p=>p.camera.mode);assert.ok(new Set(types).size>=4);assert.ok(types.filter(t=>t==='hold').length>=3);
 assert.equal(types[3],'source');assert.ok(['hold','push','pull'].includes(types[7]),types[7]);assert.equal(plans[7].fit,'contain');
 // Measured defect 20260923-8aab9f: 40 s of held archival stills. Holds stay short rests.
 let frozen=0;for(const p of plans){frozen=p.camera.mode==='hold'?frozen+p.duration:0;assert.ok(frozen<=editorial.FROZEN_HOLD_LIMIT,`frozen run ${frozen}s`);}
 for(let i=1;i<types.length;i++)if(!['hold','source'].includes(types[i]))assert.notEqual(types[i],types[i-1]);
});
test('explicit editorial camera and fit instructions are honored within restrained source rules',()=>{
 const directed=shot(input(2,{words:[],beat:{id:'directed',dur:5,media:{type:'image',editorial:{camera:'pan-right',fit:'contain',role:'archive'}}}}));
 assert.equal(directed.camera.mode,'pan-right');assert.ok(directed.camera.amount>0&&directed.camera.amount<=.06,String(directed.camera.amount));
 assert.equal(directed.fit,'contain');assert.equal(directed.role,'archive');
 const document=shot(input(3,{words:[],beat:{id:'document',dur:5,media:{type:'image',preserveFrame:true,editorial:{camera:'push',fit:'cover',role:'document'}}}}));
 assert.equal(document.camera.mode,'hold','a short document may rest');assert.equal(document.fit,'contain');
 const longDocument=shot(input(3,{words:[],beat:{id:'long-document',dur:12,media:{type:'image',preserveFrame:true}}}));
 assert.ok(['push','pull'].includes(longDocument.camera.mode)&&longDocument.camera.amount<=.06,'a long document moves slowly and stays centred');assert.equal(longDocument.fit,'contain');
 const video=shot(input(4,{words:[],beat:{id:'video',dur:5,media:{type:'video',editorial:{camera:'pull',fit:'contain'}}}}));
 assert.equal(video.camera.mode,'source');assert.equal(video.fit,'contain');
});
test('section sound events appear only at meaningful section boundaries',()=>{
 const entries=Array.from({length:5},(_,i)=>input(i,{words:[],beat:{id:`boundary${i}`,dur:4,isVideoStart:i===0,firstOfSection:i===0||i===3,sectionTitle:`Section ${i}`}}));
 const plans=sequence(entries);
 assert.equal(plans.flatMap(p=>p.events).filter(e=>e.event==='section').length,1);
 assert.equal(plans[3].events.find(e=>e.event==='section')?.start,.12);
 assert.ok(plans.filter((p,i)=>i!==3).every(p=>p.events.every(e=>e.event!=='section')));
});
test('composition and renderer revisions invalidate old cached timing and type layouts',()=>{
 assert.equal(editorial.EDITORIAL_RENDER_VERSION,9);
 assert.equal(shot(input(2,{words:[]})).version,6);
});
test('grouped and ungrouped versions of the same year share one emphasis',()=>{
 const entries=Array.from({length:8},(_,i)=>input(i,{beat:{id:`year${i}`,dur:15},words:i<2?[{t:i?'1969':'July 1969',start:1}]:[]}));
 assert.equal(sequence(entries).filter(p=>p.focus).length,1);
});
test('short typography expires above captions; long titles and untimed numbers are omitted',()=>{
 for(const [w,h] of [[1920,1080],[1080,1920],[1080,1080]]){const p=shot(input(0,{canvas:{w,h}}));assert.equal(p.layout,'opener');for(const b of p.textBlocks){assert.ok(b.lines.length<=2);assert.ok(b.y+b.height<=h*.74);assert.ok(b.x+b.width<=w);assert.ok(b.end-b.delay<=3);}}
 assert.equal(shot(input(0,{title:Array(40).fill('long').join(' '),beat:{id:'long',dur:5,isVideoStart:true}})).textBlocks.length,0);
 assert.equal(shot(input(1,{words:[{t:'1969',start:50}]})).events.length,0);
});
const frame=(out,t)=>execFileSync(ff,['-hide_banner','-loglevel','error','-ss',String(t),'-i',out,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:8*1024*1024});
const render=async(dir,p,canvas,source,frames)=>{const out=path.join(dir,`${canvas.w}-${canvas.h}-${p.beatId}.mp4`);await editorial.renderEditorialShot({st:{ffmpegPath:ff,fps:15,preset:'ultrafast',concurrency:1,cinemaGrade:false},canvas,media:{type:'image',file:source},plan:p,frames,outFile:out,crf:18,killer:{cancelled:false,add(){},remove(){},delete(){}}});return out;};
test('actual title fades away completely and full screen source survives in every ratio',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-restraint-')),source=path.join(dir,'red.png');execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0xc53c2f:s=640x360','-frames:v','1','-y',source]);
 for(const [w,h] of [[640,360],[360,640],[360,360]]){const canvas={w,h},p=shot(input(0,{canvas})),out=await render(dir,p,canvas,source,75);
 const info=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',out])).streams[0];assert.equal(Number(info.nb_frames),75);
 const early=frame(out,1),late=frame(out,4.2),white=buf=>{let n=0;for(let i=0;i<buf.length;i+=3)if(buf[i]>180&&buf[i+1]>180&&buf[i+2]>180)n++;return n;};assert.ok(white(early)>40);assert.ok(white(late)<10,'no lingering title or section band');
 for(const [x,y] of [[6,6],[w-7,6],[6,h-7],[w-7,h-7]]){const at=(y*w+x)*3;assert.ok(late[at]>150&&late[at+2]<100,'no paper frame at corners');}
 execFileSync(ff,['-hide_banner','-loglevel','error','-ss','1','-i',out,'-frames:v','1','-y',path.join(dir,`title-${w}-${h}.jpg`)]);}
 console.log(`Typography frames: ${dir}`);
});
test('document render retains both colored edges without moving crop',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-document-')),source=path.join(dir,'document.png');execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=white:s=640x360,drawbox=x=0:y=0:w=40:h=360:c=red:t=fill,drawbox=x=600:y=0:w=40:h=360:c=blue:t=fill','-frames:v','1','-y',source]);
 const canvas={w:360,h:640},p=shot(input(2,{canvas,words:[],beat:{id:'doc',dur:2,media:{type:'image',kadraj:'belge'}}})),out=await render(dir,p,canvas,source,30),a=frame(out,.2),b=frame(out,1.5),left=(320*360+8)*3,right=(320*360+351)*3;
 assert.ok(a[left]>180&&a[left+2]<80);assert.ok(a[right+2]>180&&a[right]<80);
 const mean=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;assert.ok(mean<.5,`stationary image codec tolerance, mean difference ${mean}`);
});
test('short video holds its final color instead of looping during transition padding',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-short-video-')),source=path.join(dir,'red-then-blue.mp4'),out=path.join(dir,'held.mp4');
 execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=320x180:r=15:d=1','-f','lavfi','-i','color=c=blue:s=320x180:r=15:d=0.5','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-y',source]);
 const canvas={w:320,h:180},p=shot(input(2,{canvas,words:[],beat:{id:'short-video',dur:2,media:{type:'video'}}}));p.renderLeadIn=.2;
 await editorial.renderEditorialShot({st:{ffmpegPath:ff,fps:15,preset:'ultrafast',concurrency:1,cinemaGrade:false},canvas,media:{type:'video',file:source},plan:p,frames:30,outFile:out,crf:18,killer:{cancelled:false,add(){},remove(){},delete(){}}});
 const info=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',out])).streams[0];assert.equal(Number(info.nb_frames),30);
 const first=frame(out,.1),last=frame(out,1.9),center=(buffer)=>{const i=(90*320+160)*3;return [buffer[i],buffer[i+1],buffer[i+2]];};
 const firstRgb=center(first),lastRgb=center(last),[fr,,fb]=firstRgb,[lr,,lb]=lastRgb;assert.ok(fr>150&&fb<90,'first frame stays red');assert.ok(lb>150&&lr<90,'padding clones final blue frame');
 console.log(`Short-video states: first=${firstRgb.join(',')} last=${lastRgb.join(',')} frames=${info.nb_frames}`);
});

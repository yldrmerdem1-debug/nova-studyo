import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {makeCanvas} from '../src/pipeline/canvas.js';
import {getStyleProfile} from '../src/pipeline/style-profile.js';
import {planEditorialScene,renderEditorialScene} from '../src/pipeline/editorial-motion.js';
import {buildAss} from '../src/pipeline/subtitles.js';

const words=[{t:'Apollo',start:.2},{t:'11',start:.5},{t:'landed',start:.8},{t:'in',start:1},{t:'July',start:1.2},{t:'1969,',start:1.5}];
const make=(extra={})=>planEditorialScene({beat:{id:'s0b1',dur:4,sectionTitle:'A Print With No Weather'},text:'Apollo 11 landed in July 1969.',words,title:'Why Apollo 11 Bootprints Remain on the Moon',index:1,profile:getStyleProfile('belgesel'),canvas:makeCanvas('16:9'),...extra});
test('date reveal uses the actual spoken year and word time, not an unspoken emphasis value',()=>{
 const p=make({beat:{id:'s0b1',dur:4,emphasis:{type:'stat',value:'20 July 1969'}}});
 assert.equal(p.layout,'number');assert.equal(p.focus,'1969');
 assert.equal(p.events.find(e=>e.event==='accent').start,1.5);
 assert.ok(!JSON.stringify(p).includes('20 July'));
});
test('grouped TTS date outranks a mission number and long evidence shots change composition during speech',()=>{
 const p=make({beat:{id:'s0b1',dur:9},words:[{t:'Apollo',start:.5},{t:'11',start:.9},{t:'landed',start:1.2},{t:'July 1969',start:1.7},{t:'orbital images',start:3.8},{t:'trails',start:6}]});
 assert.equal(p.focus,'July 1969');assert.equal(p.events.find(e=>e.event==='accent').start,1.7);
 assert.equal(p.takeover.start,3.8);assert.ok(p.takeover.start+p.takeover.duration<9);
});
test('portrait title and actual classic subtitle composition reserve separate areas',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-editorial-portrait-'));
 const input=path.join(dir,'source.png'),out=path.join(dir,'portrait.mp4');
 execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=s=640x360','-frames:v','1','-y',input]);
 const canvas=makeCanvas('9:16');
 const p=make({canvas,index:0,beat:{id:'portrait',dur:2,isVideoStart:true},title:'Why Apollo 11 Bootprints Still Remain on the Surface of the Moon'});
 assert.ok(p.textBlocks.every(b=>b.y+b.height<=canvas.h*.74));
 await renderEditorialScene({st:{ffmpegPath:ff,fps:15,preset:'ultrafast',concurrency:1},canvas,media:{type:'image',file:input},plan:p,frames:30,outFile:out,crf:27,killer:{cancelled:false,add(){},remove(){},delete(){}}});
 const ass=buildAss([{start:0,end:2,text:'A footprint survives where there is no rain'}],'classic',{width:1080,height:1920,editorial:true});
 assert.match(ass,/Classic,Segoe UI Semibold,64,/);assert.ok(ass.includes('\\pos(497,1478)'));fs.writeFileSync(path.join(dir,'captions.ass'),ass);
 execFileSync(ff,['-hide_banner','-loglevel','error','-ss','1.2','-i','portrait.mp4','-vf','ass=captions.ass','-frames:v','1','-y','caption-frame.jpg'],{cwd:dir});
 console.log(`Portrait QA: ${path.join(dir,'caption-frame.jpg')}`);
});
test('opener, evidence, number and immersive compositions vary while keeping text in safe bounds',()=>{
 const layouts=new Set();
 for(const ratio of ['16:9','9:16','1:1']) for(let i=0;i<5;i++) {
  const p=make({canvas:makeCanvas(ratio),index:i,words:i===1?words:[],beat:{id:`b${i}`,dur:4,isVideoStart:i===0,sectionTitle:'Source images'}});
  layouts.add(p.layout);
  for(const block of p.textBlocks) for(const line of block.lines) {
   assert.ok(line.length>0);assert.ok(block.x>=0&&block.y>=0);assert.ok(block.x+block.width<=p.width);assert.ok(block.y+block.height<=p.height*.82);
  }
 }
 assert.ok(layouts.has('opener')&&layouts.has('number')&&layouts.has('evidence')&&layouts.has('immersive'));
});
test('genre changes editorial palette and motion; missing word timing creates no false spoken-number cue',()=>{
 const doc=make(),news=make({profile:getStyleProfile('haber')});assert.notEqual(doc.palette.background,news.palette.background);
 const untimed=make({words:[]});assert.notEqual(untimed.layout,'number');assert.ok(untimed.events.every(e=>e.event!=='accent'));
 const late=make({words:[{t:'1969',start:50}]});assert.ok(late.events.every(e=>e.start<4));
});
test('real layered FFmpeg output preserves frame count and has moving composition',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-editorial-'));
 const input=path.join(dir,'source.png'),out=path.join(dir,'scene.mp4');
 execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=s=640x360','-frames:v','1','-y',input]);
 const canvas={...makeCanvas('16:9'),w:640,h:360,k:1/3,size:'640x360'};
 const p=make({canvas,index:0,beat:{id:'opening',dur:2,isVideoStart:true},title:"1969: What's left? 100% evidence"});
 await renderEditorialScene({st:{ffmpegPath:ff,fps:15,preset:'ultrafast',concurrency:1},canvas,media:{type:'image',file:input},plan:p,frames:30,outFile:out,crf:25,killer:{cancelled:false,add(){},remove(){},delete(){}}});
 const info=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',out],{encoding:'utf8'})).streams[0];
 assert.equal(Number(info.nb_frames),30);assert.equal(info.width,640);assert.equal(info.height,360);
 const sample=t=>execFileSync(ff,['-hide_banner','-loglevel','error','-ss',String(t),'-i',out,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
 assert.notDeepEqual(sample(.1),sample(1),'composition must animate');
});
test('portrait and square takeovers cover all four screen corners instead of leaving paper bands',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-editorial-cover-'));
 const input=path.join(dir,'red.png');execFileSync(ff,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0xc53c2f:s=640x360','-frames:v','1','-y',input]);
 for(const [w,h] of [[360,640],[360,360]]) {
  const canvas={...makeCanvas(h>w?'9:16':'1:1'),w,h,k:1/3},out=path.join(dir,`${w}-${h}.mp4`);
  const p=make({canvas,words:[],index:1,beat:{id:'cover',dur:2}});p.takeover={start:.35,duration:.4};
  await renderEditorialScene({st:{ffmpegPath:ff,fps:15,preset:'ultrafast',concurrency:1},canvas,media:{type:'image',file:input},plan:p,frames:30,outFile:out,crf:20,killer:{cancelled:false,add(){},remove(){},delete(){}}});
  const frame=execFileSync(ff,['-hide_banner','-loglevel','error','-ss','1.6','-i',out,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
  for(const [x,y] of [[6,6],[w-7,6],[6,h-7],[w-7,h-7]]){const i=(y*w+x)*3;assert.ok(frame[i]>150&&frame[i+2]<100,`${w}x${h} corner ${x},${y} must show source image`);}
 }
});

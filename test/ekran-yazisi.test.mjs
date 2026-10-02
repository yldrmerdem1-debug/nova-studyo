// Ekran yazısı okunurluğu — Midway (20260923-8aab9f, 20260923-b8ae90) kusurları:
//  * 26 px etiketler telefonda okunmuyordu ("4 JUNE 1942", "FATALLY DAMAGED"),
//  * "6 JUNE" tarihi dev "6" + "JUNE" birimi olarak bölünüyordu (601,8 sn),
//  * gri arşiv kâğıdı ve parlak gökyüzü üstünde yazı kayboluyordu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NOVA_HOME ||= fs.mkdtempSync(path.join(os.tmpdir(),'nova-ekran-yazisi-'));
const {planEditorialShot,overlayDate,overlayPlateNeeded,overlayFilters,renderEditorialShot,OVERLAY_TYPE}=await import('../src/pipeline/editorial-shots.js');
const {getSettings}=await import('../src/config.js');
const {run}=await import('../src/util.js');

const landscape={w:1920,h:1080},portrait={w:1080,h:1920};
const shot=(overlay,canvas=landscape,extra={})=>planEditorialShot({director:true,canvas,index:3,beat:{id:'s9b1',dur:6,media:{type:'image',editorial:{overlay}}},...extra});

test('takvim tarihi tek değer olarak kalır, sayı+birim ayrılmaya devam eder',()=>{
 assert.equal(overlayDate('6 JUNE'),true);
 assert.equal(overlayDate('7 Haziran 1942'),true);
 assert.equal(overlayDate('15 AIRCRAFT'),false);
 const date=shot({value:'6 JUNE',label:'HAMMANN SUNK',position:'left'});
 assert.deepEqual(date.textBlocks.map(b=>b.role),['value','label']);
 assert.equal(date.textBlocks[0].lines.join(' '),'6 JUNE');
 const count=shot({value:'15 AIRCRAFT',label:'TORPEDO SQUADRON EIGHT',position:'left'});
 assert.deepEqual(count.textBlocks.map(b=>b.role),['value','unit','label']);
});

test('etiketler telefonda okunacak boyutta; satırlar sırayla girer',()=>{
 const l=shot({value:'10:22 AM',label:'4 JUNE 1942',position:'right'});
 const label=l.textBlocks.find(b=>b.role==='label'),value=l.textBlocks.find(b=>b.role==='value');
 assert.ok(label.fontSize>=34,`yatay etiket ${label.fontSize}px`);
 assert.ok(value.fontSize>=80,`yatay değer ${value.fontSize}px`);
 assert.ok(label.delay>value.delay,'etiket değerden sonra gelmeli');
 const p=shot({value:'THREE CARRIERS',label:'FATALLY DAMAGED',position:'left'},portrait);
 assert.ok(p.textBlocks.find(b=>b.role==='label').fontSize>=40);
 assert.ok(OVERLAY_TYPE.portrait.label>OVERLAY_TYPE.landscape.label);
 // Uzun etiket hâlâ güvenli alana sığar, olgu kırpılmaz.
 const long=shot({value:'2.3 MILLION US GALLONS',label:'MOLASSES FROM THE PURITY DISTILLING COMPANY TANK',position:'left'});
 assert.ok(long.textBlocks.every(b=>b.y+b.height<=1080*.68));
});

test('plaka kararı teslim edilmiş karelerden ölçülen eşiklerle verilir',()=>{
 for(const ok of [{yavg:110.6,ylow:94,yhigh:129},{yavg:82.9,ylow:52,yhigh:103},{yavg:74.6,ylow:71,yhigh:80},{yavg:114.7,ylow:82,yhigh:163}])assert.equal(overlayPlateNeeded(ok),false,JSON.stringify(ok));
 for(const bad of [{yavg:158.1,ylow:138,yhigh:170},{yavg:141.2,ylow:117,yhigh:167},{yavg:163.5,ylow:136,yhigh:201},{yavg:128.1,ylow:57,yhigh:227}])assert.equal(overlayPlateNeeded(bad),true,JSON.stringify(bad));
 assert.equal(overlayPlateNeeded({}),true,'ölçülemeyen zemin güvenli tarafta kalır');
});

test('yazı kayarak girer ve olgusal yazının yanında vurgu çizgisi büyür',()=>{
 const p=shot({value:'10:22 AM',label:'4 JUNE 1942',position:'right'});
 const f=overlayFilters(p,{W:1920,H:1080,plate:false,textfile:(b,i)=>`t${b}${i}.txt`});
 assert.ok(f.filter(x=>x.startsWith('drawtext')).every(x=>/y='[\d.]+\+[\d.]+\*pow\(1-clip/.test(x)));
 assert.equal(f.filter(x=>x.startsWith('drawbox')).length,6);
 assert.ok(f.every(x=>!x.includes('box=1')),'ölçüm gerekmedikçe plaka yok');
 assert.ok(overlayFilters(p,{W:1920,H:1080,plate:true,textfile:()=>'t.txt'}).filter(x=>x.startsWith('drawtext')).every(x=>x.includes('box=1')));
});

test('parlak zeminde plaka otomatik gelir, koyu zeminde gelmez',async()=>{
 const st={...getSettings(),fps:30,crf:24,preset:'ultrafast',cinemaGrade:false};
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'ekran-yazisi-'));
 const region=async(file,t)=>{let out='';await run(st.ffmpegPath,['-ss',String(t),'-i',file,'-frames:v','1','-vf','crop=360:70:1000:295,signalstats,metadata=print','-f','null','-'],{onLine:s=>{out+=s;}});return Number(out.match(/YAVG=([\d.]+)/)[1]);};
 const results={};
 for(const [name,color] of [['bright','0xe8e6df'],['dark','0x1c2630']]){
  const image=path.join(dir,`${name}.png`),out=path.join(dir,`${name}.mp4`);
  await run(st.ffmpegPath,['-f','lavfi','-i',`color=c=${color}:s=1920x1080`,'-frames:v','1','-y',image]);
  const media={type:'image',file:image,editorial:{overlay:{value:'10:22 AM',label:'4 JUNE 1942',position:'right'}}};
  const plan=planEditorialShot({director:true,canvas:landscape,index:3,beat:{id:`s1b${name.length}`,dur:2,media}});
  plan.camera={mode:'hold',amount:0};
  await renderEditorialShot({st,canvas:landscape,media,plan,frames:60,outFile:out,killer:{cancelled:false,add(){},remove(){}}});
  results[name]=await region(out,1.6);
 }
 // Beyaz zeminde yazının arkası karartılmış olmalı; koyu zemin olduğu gibi kalır.
 assert.ok(results.bright<170,`parlak zeminde yazı alanı ${results.bright}`);
 assert.ok(results.dark<90,`koyu zemin ${results.dark}`);
});

// Tekrar önleme — 20260923-8aab9f (Midway): 94 medya kaydının 92'sinde
// "bilinçli tekrar" gerekçesi vardı; 23 planda aynı kaynak yeniden göründü.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import {auditReuse,reuseBudget,sameImage,reuseRepairBrief,REUSE_MIN_GAP_SHOTS} from '../src/pipeline/reuse-guard.js';
import {planEditorialSourceTiming,renderEditorialShot,planEditorialShot} from '../src/pipeline/editorial-shots.js';
import {DIRECTOR_LESSONS,DIRECTOR_POLICY_VERSION} from '../src/pipeline/director-policy.js';

// Midway dizisinden kısaltılmış gerçek örüntü: her karar gerekçeli "keep".
const ids=Array.from({length:40},(_,i)=>`s${i}b0`);
const source={0:'sbd-dive',3:'vt8clip',10:'hypo-room',14:'hypo-room',22:'crew-table',26:'vt8clip',31:'crew-table',36:'sbd-dive',38:'crew-table'};
const media=Object.fromEntries(ids.map((id,i)=>[id,source[i]?{type:['vt8clip'].includes(source[i])?'video':'image',sourceId:source[i],...(source[i]==='vt8clip'?{sourceStartFrame:0}:{})}:{type:'image',sourceId:`unique-${i}`}]));
const decisions=ids.map(id=>({id,action:'keep',reusePurpose:'Return to this source for this exact narrated moment'}));
const beats=ids.map(id=>({id}));

test('gerekçe alanını her karara yazmak tekrar korumasını kapatamaz',()=>{
 assert.equal(reuseBudget(87),3);assert.equal(reuseBudget(10),1);
 const {violations,allowed,budget}=auditReuse(beats,media,decisions);
 assert.equal(budget,1);
 // hypo-room 4 plan sonra: çok yakın. Sonraki uzak tekrarlardan yalnızca bütçe kadarı geçer.
 assert.deepEqual(violations.find(v=>v.id==='s14b0'),{id:'s14b0',firstId:'s10b0',reason:'ilk kullanıma çok yakın (4 plan)'});
 assert.equal(allowed.length,1);
 assert.deepEqual(violations.map(v=>v.id),['s14b0','s31b0','s36b0','s38b0']);
 assert.ok(violations.every(v=>v.reason));
 assert.match(reuseRepairBrief(violations),/s31b0 repeats s22b0/);
});

test('gerekçesiz tekrar hiç geçmez; uzun filmin görülmemiş başka anı tekrar sayılmaz',()=>{
 const plain=decisions.map(d=>({...d,reusePurpose:null}));
 const {violations,allowed}=auditReuse(beats,media,plain);
 assert.equal(allowed.length,0);assert.equal(violations.length,5);
 assert.equal(sameImage({type:'video',sourceId:'navy-map',sourceStartFrame:7500},{type:'video',sourceId:'navy-map',sourceStartFrame:9000}),false);
 assert.equal(sameImage({type:'video',sourceId:'navy-map',sourceStartFrame:7500},{type:'video',sourceId:'navy-map',sourceStartFrame:7530}),true);
 assert.equal(sameImage({type:'image',sourceId:'a'},{type:'image',sourceId:'a'}),true);
 assert.ok(REUSE_MIN_GAP_SHOTS>=6);
});

test('politika v15 tekrarı nadir tutar',()=>{
 assert.ok(DIRECTOR_POLICY_VERSION>=15);
 assert.match(DIRECTOR_LESSONS.find(x=>x.id==='intentional-reuse').rule,/leave reusePurpose null/);
});

test('aynı videonun ardışık aynı başlangıcı devam eder, zaman kodsuz tekrar başa sarmaz',()=>{
 const L={slot:[90,90,90,90,90],a:[6,0,0,0]};
 const v=(file,start)=>({media:{type:'video',file,...(start!=null?{sourceStartFrame:start}:{})}});
 // s26b1 ve s27b0: ikisi de 6750. karede başlıyordu.
 const t=planEditorialSourceTiming([v('map',6750),v('map',6750),v('x'),v('clip'),v('clip',500)],L,30);
 assert.equal(t[1].sourceStartFrame,6750+90-6);assert.equal(t[1].sourceContinuous,true);assert.equal(t[1].fallbackSourceStartFrame,6744);
 assert.equal(t[4].sourceStartFrame,500,'görülmemiş başka ana kasıtlı atlama korunur');
 // vt8clip iki kez 0. kareden başlıyordu: ikinci kullanım kaldığı yerden sürer.
 const r=planEditorialSourceTiming([v('vt'),{media:{type:'image',file:'i'}},v('vt')],L,30);
 assert.equal(r[2].sourceStartFrame,90);assert.equal(r[2].fallbackSourceStartFrame,0);
 // Devam noktası ileride kasıtlı gösterilecek anın üstüne düşmez (s27b1/s41b1: ikisi de 420. kare).
 const z=planEditorialSourceTiming([v('vt',0),{media:{type:'image',file:'i'}},v('vt'),v('x'),v('vt',95)],{slot:[90,90,90,90,90],a:[0,0,0,0]},30);
 assert.deepEqual(z.map(t=>t.sourceStartFrame),[0,0,185,0,95]);
});

test('kaynak yetmezse devam yerine özgün plana düşülür, render düşmez',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-tekrar-')),file=path.join(dir,'short.mp4'),out=path.join(dir,'out.mp4');
 execFileSync(ff,['-v','error','-f','lavfi','-i','testsrc=size=320x180:rate=15','-t','3','-pix_fmt','yuv420p','-y',file]);
 const canvas={w:320,h:180},media={type:'video',file};
 const plan={...planEditorialShot({canvas,index:2,beat:{id:'s2b0',dur:2,media}}),sourceStartFrame:40,sourceContinuous:true,fallbackSourceStartFrame:0};
 await renderEditorialShot({st:{ffmpegPath:ff,fps:15,crf:28,preset:'ultrafast',cinemaGrade:false},canvas,media,plan,frames:30,outFile:out,killer:{cancelled:false,add(){},remove(){}}});
 assert.ok(fs.statSync(out).size>1000);
 await assert.rejects(renderEditorialShot({st:{ffmpegPath:ff,fps:15,crf:28,preset:'ultrafast',cinemaGrade:false},canvas,media,plan:{...plan,fallbackSourceStartFrame:undefined},frames:30,outFile:out,killer:{cancelled:false,add(){},remove(){}}}),/exhausted/);
});

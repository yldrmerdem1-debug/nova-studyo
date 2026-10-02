// Donuk ekran yok — 20260923-8aab9f, 583–632 sn: dört arşiv fotoğrafı 9–12 sn
// boyunca tamamen sabit ("hold") kaldı, 40 saniyelik donuk bir blok oluştu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import {planEditorialSequence,renderEditorialShot,FROZEN_HOLD_LIMIT} from '../src/pipeline/editorial-shots.js';
import {longestFrozenRun,longformWarnings} from '../src/pipeline/longform-quality.js';
import {getStyleProfile} from '../src/pipeline/style-profile.js';

const canvas={w:1920,h:1080},profile=getStyleProfile('belgesel','balanced');
// Gerçek dizi: s36b1 (fotoğraf, 9 sn), s37b0/s37b1/s38b0/s38b1 (preserveFrame arşiv).
const midway=[['s36b1',9,false],['s37b0',9,true],['s37b1',12.2,true],['s38b0',9,true],['s38b1',9.4,true]]
 .map(([id,dur,preserveFrame],i)=>({director:true,canvas,profile,index:40+i,words:[],beat:{id,dur,query:id,media:{type:'image',file:'x.jpg',preserveFrame}}}));

test('Midway arşiv dizisi artık donmuyor; belgeler çerçevede kalıp yavaşça hareket ediyor',()=>{
 const plans=planEditorialSequence(midway);
 assert.ok(plans.every(p=>p.camera.mode!=='hold'),plans.map(p=>p.camera.mode).join(' '));
 for(const p of plans.slice(1)){assert.equal(p.fit,'blurred-contain');assert.ok(['push','pull'].includes(p.camera.mode));assert.ok(p.camera.amount>=.025&&p.camera.amount<=.06);}
 for(let i=2;i<plans.length;i++)assert.notEqual(plans[i].camera.mode,plans[i-1].camera.mode,'sakin hareketler yön değiştirir');
 assert.equal(longestFrozenRun(plans),0);
});

test('kısa sabit planlar birikerek donuk pasaj oluşturamaz; editörün sabit kararı korunur',()=>{
 const holds=Array.from({length:8},(_,i)=>({canvas,profile,index:5+i,words:[],beat:{id:`h${i}`,dur:3,query:`h${i}`,media:{type:'image',file:'x.jpg',editorial:{camera:'hold'}}}}));
 const plans=planEditorialSequence(holds);
 assert.ok(longestFrozenRun(plans)<=FROZEN_HOLD_LIMIT,String(longestFrozenRun(plans)));
 const user=planEditorialSequence([{canvas,profile,index:3,words:[],beat:{id:'u',dur:12,media:{type:'image',file:'x.jpg',editorial:{camera:'hold',userCamera:true}}}}]);
 assert.equal(user[0].camera.mode,'hold','kullanıcının açık kararı ezilmez');
 assert.match(longformWarnings({longestFrozenRunSec:12,durationSec:0}).join(' '),/12 saniye boyunca ekranda hiçbir şey hareket etmiyor/);
});

test('uzun belge planı gerçek render’da kıpırdar ve kenarlarını korur',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-donuk-')),source=path.join(dir,'doc.png'),out=path.join(dir,'doc.mp4');
 execFileSync(ff,['-v','error','-f','lavfi','-i','color=c=white:s=480x360,drawbox=x=0:y=0:w=30:h=360:c=red:t=fill,drawbox=x=450:y=0:w=30:h=360:c=blue:t=fill,drawgrid=w=40:h=40:c=black','-frames:v','1','-y',source]);
 const small={w:320,h:180};
 const [plan]=planEditorialSequence([{canvas:small,profile,index:4,words:[],beat:{id:'long-doc',dur:8,media:{type:'image',file:source,preserveFrame:true}}}]);
 assert.notEqual(plan.camera.mode,'hold');
 await renderEditorialShot({st:{ffmpegPath:ff,fps:15,crf:18,preset:'ultrafast',cinemaGrade:false},canvas:small,media:{type:'image',file:source,preserveFrame:true},plan,frames:120,outFile:out,killer:{cancelled:false,add(){},remove(){}}});
 const frame=t=>execFileSync(ff,['-v','error','-ss',String(t),'-i',out,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
 const a=frame(.2),b=frame(7.5);
 const mean=a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;
 assert.ok(mean>1,`kare değişmeli, ortalama fark ${mean}`);
 // Kanıtın iki kenarı hâlâ görünür (blurred-contain içinde, ortada).
 const px=(buf,x,y)=>{const i=(y*small.w+x)*3;return [buf[i],buf[i+1],buf[i+2]];};
 const row=90,cols=[...Array(small.w).keys()];
 for(const buf of [a,b]){
  assert.ok(cols.some(x=>{const [r,g,bb]=px(buf,x,row);return r>170&&g<90&&bb<90;}),'kırmızı kenar görünür');
  assert.ok(cols.some(x=>{const [r,g,bb]=px(buf,x,row);return bb>170&&r<90&&g<110;}),'mavi kenar görünür');
 }
});

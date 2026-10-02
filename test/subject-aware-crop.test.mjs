// Reconstructed from 1.5.3 crop proof: inspect decoded pixels, not filter strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {planEditorialShot,renderEditorialShot} from '../src/pipeline/editorial-shots.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-subject-crop-'));
const source=path.join(dir,'subjects.png'),video=path.join(dir,'subjects.mp4');
execFileSync(ff,['-v','error','-f','lavfi','-i','color=c=black:s=640x360,drawbox=x=90:y=100:w=65:h=160:c=red:t=fill,drawbox=x=485:y=100:w=65:h=160:c=blue:t=fill','-frames:v','1','-y',source]);
execFileSync(ff,['-v','error','-loop','1','-i',source,'-t','2','-r','15','-c:v','libx264','-pix_fmt','yuv420p','-y',video]);
const canvas={w:180,h:320};let serial=0;
async function render(media){
 const plan=planEditorialShot({canvas,beat:{id:'crop',dur:1,media},index:2,words:[]});
 const outFile=path.join(dir,`crop-${serial++}.mp4`);
 await renderEditorialShot({st:{ffmpegPath:ff,ffprobePath:probe.path,fps:15,preset:'ultrafast',concurrency:1,cinemaGrade:false},canvas,media,plan,frames:15,outFile,crf:18});
 const raw=execFileSync(ff,['-v','error','-ss','0.3','-i',outFile,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
 let red=0,blue=0;for(let i=0;i<raw.length;i+=3){if(raw[i]>150&&raw[i+1]<80&&raw[i+2]<80)red++;if(raw[i+2]>150&&raw[i]<80&&raw[i+1]<80)blue++;}
 return {red,blue,raw,plan};
}
test('portrait cover crop keeps an audited off-center subject visible in real image and video frames',async()=>{
 for(const [type,file] of [['image',source],['video',video]])for(const [position,color] of [['left','red'],['sol','red'],['right','blue'],['sağ','blue']]){
  const p=await render({type,file,odak:position,editorial:{camera:'hold'}});assert.ok(p[color]>2500,`${type} ${position} visible pixels ${p[color]}`);
 }
 const p=await render({type:'image',file:source,editorial:{subjectPosition:'right',camera:'hold'}});assert.ok(p.blue>2500);
 console.log(`Off-center subject crop proof: ${dir}`);
});
test('unspecified or centered focus retains center crop and contain preserves both document edges',async()=>{
 const absent=await render({type:'image',file:source,editorial:{camera:'hold'}});
 const center=await render({type:'image',file:source,odak:'center',editorial:{camera:'hold'}});
 assert.deepEqual(absent.raw,center.raw);assert.equal(absent.red+absent.blue,0);
 for(const kind of ['document','map']){
  const p=await render({type:'image',file:source,kind,odak:'right',preserveFrame:true,editorial:{camera:'push',fit:'cover',role:kind}});
  assert.equal(p.plan.fit,'contain');assert.equal(p.plan.camera.mode,'hold');assert.ok(p.red>500&&p.blue>500,`${kind}: ${p.red}, ${p.blue}`);
 }
});

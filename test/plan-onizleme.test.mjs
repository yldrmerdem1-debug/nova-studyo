// Tek plan önizlemesi, kesme noktası kaydırma ve klip başlangıcı seçimi.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-plan-onizleme-'));
process.env.NOVA_EMBEDDED='1';
const probe=net.createServer().listen(0,'127.0.0.1');await once(probe,'listening');process.env.NOVA_PORT=String(probe.address().port);await new Promise(r=>probe.close(r));
const shots=await import('../src/pipeline/shot-edits.js');
const {planEditorialSourceTiming,planEditorialShot}=await import('../src/pipeline/editorial-shots.js');
const {getSettings}=await import('../src/config.js');
const {run,writeJson,readJson,ffprobeDuration}=await import('../src/util.js');
const {renderAll}=await import('../src/pipeline/render.js');
const {server,shutdown}=await import('../server.js');if(!server.listening)await once(server,'listening');
const {createJob,jobDir}=await import('../src/store.js');
const ffprobe=(await import('ffprobe-static')).default;
after(async()=>{const closed=once(server,'close');shutdown();await closed;});
const st=getSettings(),ff=st.ffmpegPath;

test('kesme noktası aynı cümlede kayar, iki plan da okunur kalır; klip başlangıcı otomatiği yedekler',()=>{
 assert.deepEqual(shots.sanitizeShotEdit({roll:1.234,sourceStart:12.5}),{roll:1.23,sourceStart:12.5});
 assert.equal(shots.sanitizeShotEdit({roll:0.01}),null);
 assert.throws(()=>shots.sanitizeShotEdit({roll:4}),/±3/);
 assert.throws(()=>shots.sanitizeShotEdit({sourceStart:-1}),/Klip/);
 const beats=[{id:'s0b0',segIndex:0,dur:4,icBas:0,icSon:4},{id:'s0b1',segIndex:0,dur:3,icBas:4,icSon:7,media:{type:'video',file:'v',sourceStartFrame:300}},{id:'s1b0',segIndex:1,dur:5}];
 shots.applyShotEditsToBeats(beats,{s0b1:{roll:-5,sourceStart:20},s1b0:{roll:1}});
 assert.deepEqual(beats.map(b=>+b.dur.toFixed(2)),[1.2,5.8,5],'kısalan plan 1,2 sn altına inmez; cümle sınırı aşılmaz');
 assert.equal(+(beats[0].dur+beats[1].dur).toFixed(2),7,'cümlenin toplam süresi aynı');
 assert.equal(+beats[1].icBas.toFixed(2),1.2);
 const t=planEditorialSourceTiming(beats.slice(0,2).map(b=>({...b,media:b.media||{type:'image'}})),{slot:[36,174],a:[0]},30);
 assert.equal(t[1].sourceStartFrame,600);assert.equal(t[1].fallbackSourceStartFrame,300);
});

// Küçük gerçek iş: bir fotoğraf ve bir video planı, sesli final video.
const id='20260926-abc123',dir=jobDir(id),url=`http://127.0.0.1:${server.address().port}/api/jobs/${id}`;
async function fixture(){
 createJob({id,topic:'Önizleme',status:'done',visualStyle:'editorial',theme:'belgesel',mediaKind:'mixed',createdAt:new Date().toISOString(),usage:{},outputs:{video:'output.mp4'},settingsSnapshot:{fps:24,crf:28,preset:'ultrafast',concurrency:2}});
 const image=path.join(dir,'g.png'),video=path.join(dir,'v.mp4');
 await run(ff,['-f','lavfi','-i','color=c=0x2e4f7a:s=640x360','-frames:v','1','-y',image]);
 await run(ff,['-f','lavfi','-i','testsrc=size=640x360:rate=24','-t','20','-pix_fmt','yuv420p','-y',video]);
 await run(ff,['-f','lavfi','-i','testsrc=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=500','-t','8','-shortest','-pix_fmt','yuv420p','-c:a','aac','-y',path.join(dir,'output.mp4')]);
 writeJson(path.join(dir,'script.json'),{title:'Önizleme',sections:[{title:'A',segments:[{text:'Birinci cümle burada.',visuals:[{query:'a'},{query:'b'}]}]}]});
 writeJson(path.join(dir,'media.json'),{s0b0:{file:image,type:'image'},s0b1:{file:video,type:'video',sourceStartFrame:48}});
 const canvas={w:640,h:360},c0=planEditorialShot({canvas,index:0,beat:{id:'s0b0',dur:4,media:{type:'image',file:image}}}),c1=planEditorialShot({canvas,index:1,beat:{id:'s0b1',dur:4,media:{type:'video',file:video}}});
 c1.sourceStartFrame=48;
 writeJson(path.join(dir,'edit-plan.json'),{version:2,visualStyle:'editorial',fps:24,transitions:[{tip:'',sure:0}],scenes:[{id:'s0b0',segIndex:0,frames:96,mediaType:'image',mediaFile:image,composition:c0},{id:'s0b1',segIndex:0,frames:96,mediaType:'video',mediaFile:video,composition:c1}]});
}
const json=async(route,method='GET',body)=>{const r=await fetch(url+route,{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};

test('HTTP: taslak kararla tek plan sesli önizlenir, kesme noktası süreyi değiştirir',async()=>{
 await fixture();
 const ed=await json('/editor');assert.deepEqual(ed.data.timeline.shots[1].rollWith,{id:'s0b0',duration:4});assert.equal(ed.data.timeline.shots[1].sourceStart,2);
 const p=await json('/shot-preview/s0b0','POST',{edit:{overlay:{mode:'custom',value:'4 HAZİRAN 1942',label:'',position:'left'},camera:'push'}});
 assert.equal(p.status,200,JSON.stringify(p.data));
 const file=path.join(dir,'editor-preview',path.basename(p.data.url));
 assert.ok(Math.abs(await ffprobeDuration(ffprobe.path,file)-4)<0.2);
 const streams=(await (await import('node:child_process')).execFileSync(ffprobe.path,['-v','error','-show_entries','stream=codec_type','-of','csv=p=0',file])).toString();
 assert.match(streams,/video/);assert.match(streams,/audio/,'final videonun sesi eklenir');
 assert.equal((await fetch(`http://127.0.0.1:${server.address().port}${p.data.url}`)).status,200);
 const rolled=await json('/shot-preview/s0b1','POST',{edit:{roll:1}});
 assert.equal(rolled.status,200,JSON.stringify(rolled.data));assert.equal(rolled.data.duration,3);assert.equal(rolled.data.start,5);
 assert.equal((await fetch(url+'/preview/..%2Fjob.json')).status,400);
});

test('HTTP: klip başlangıcı kaynağa sığmıyorsa kaydedilmez; kaynak karesi JPEG döner',async()=>{
 const src=await json('/shot-source/s0b1');assert.equal(src.status,200);assert.ok(Math.abs(src.data.duration-20)<0.2);assert.equal(src.data.shotDuration,4);
 const frame=await fetch(url+'/shot-source-frame/s0b1?t=6');assert.equal(frame.status,200);assert.equal(frame.headers.get('content-type'),'image/jpeg');
 const tooLate=await json('/editor','PATCH',{shots:{s0b1:{sourceStart:18}}});assert.equal(tooLate.status,400);assert.match(tooLate.data.error,/en geç/);
 const ok=await json('/editor','PATCH',{shots:{s0b1:{sourceStart:10,roll:-1}}});assert.equal(ok.status,200,JSON.stringify(ok.data));
 assert.deepEqual(readJson(path.join(dir,'shot-edits.json')).shots.s0b1,{roll:-1,sourceStart:10});
 assert.equal((await json('/shot-source/s0b0')).data.type,'image');
 assert.equal((await fetch(url+'/shot-source-frame/s0b0?t=1')).status,400);
});

test('render: kesme noktası ve klip başlangıcı teslim edilen kurguda uygulanır, toplam süre korunur',async()=>{
 const base=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'render-')),image=path.join(base,'g.png'),video=path.join(base,'v.mp4'),audio=path.join(base,'a.wav');
 await run(ff,['-f','lavfi','-i','color=c=0x7a2e2e:s=640x360','-frames:v','1','-y',image]);
 await run(ff,['-f','lavfi','-i','testsrc=size=640x360:rate=24','-t','30','-pix_fmt','yuv420p','-y',video]);
 await run(ff,['-f','lavfi','-i','sine=frequency=400:duration=8','-ar','48000','-ac','1','-y',audio]);
 const words='Birinci cümle burada bitiyor. İkinci cümle ise burada başlıyor ve sürüyor.'.split(' ').map((t,i)=>({t,start:i*0.7,end:i*0.7+0.6}));
 const script={title:'R',sections:[{title:'A',segments:[{text:words.map(w=>w.t).join(' '),visuals:[{query:'a',type:'image'},{query:'b',type:'video'}]}]}]};
 const media={s0b0:{file:image,type:'image'},s0b1:{file:video,type:'video',sourceStartFrame:24}};
 const job=edits=>({id:'r',theme:'belgesel',language:'tr',ratio:'16:9',subtitleMode:'none',visualStyle:'editorial',transitions:'yok',mediaKind:'mixed',musicVolume:0,soundDesign:false,demo:true,recoveryDir:base,shotEdits:edits,settingsSnapshot:{...getSettings(),fps:24,crf:28,preset:'ultrafast',concurrency:2}});
 const go=async(edits,name)=>{const d=path.join(base,name);fs.mkdirSync(d);const r=await renderAll(job(edits),script,media,[{segId:'s0',duration:8,words,audio}],d,()=>{},()=>{},{cancelled:false,add(){},remove(){},delete(){}});return {r,plan:readJson(path.join(d,'edit-plan.json'))};};
 const a=await go({},'a');
 assert.equal(a.plan.scenes.length,2,'iki plan oluşmalı');
 const b=await go({s0b1:{roll:0.5,sourceStart:12}},'b');
 const fps=24,da=a.plan.scenes.map(s=>s.frames),db=b.plan.scenes.map(s=>s.frames);
 assert.equal(db[0]-da[0],12,'önceki plan 0,5 sn uzar');assert.equal(da[1]-db[1],12,'bu plan 0,5 sn kısalır');
 assert.equal(b.plan.totalFrames,a.plan.totalFrames);assert.equal(b.r.durationSec,a.r.durationSec);
 assert.equal(b.plan.scenes[1].composition.sourceStartFrame,12*fps);
});

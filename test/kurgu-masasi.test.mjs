// Kurgu masası: editörde plan başına verilen geçiş / ekran yazısı / kamera
// kararları kaydedilir, doğrulanır ve render'da gerçekten uygulanır.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-kurgu-masasi-'));
process.env.NOVA_EMBEDDED='1';
const probe=net.createServer().listen(0,'127.0.0.1');await once(probe,'listening');process.env.NOVA_PORT=String(probe.address().port);await new Promise(r=>probe.close(r));
const shots=await import('../src/pipeline/shot-edits.js');
const {planTransitions}=await import('../src/pipeline/transitions.js');
const {planEditorialShot}=await import('../src/pipeline/editorial-shots.js');
const {getSettings}=await import('../src/config.js');
const {run,writeJson,readJson}=await import('../src/util.js');
const {renderAll}=await import('../src/pipeline/render.js');
const {server,shutdown}=await import('../server.js');if(!server.listening)await once(server,'listening');
const {createJob,jobDir,getJob}=await import('../src/store.js');
after(async()=>{const closed=once(server,'close');shutdown();await closed;});
const ff=getSettings().ffmpegPath;

test('plan kararı doğrulanır; boş karar otomatiğe döner',()=>{
 assert.equal(shots.sanitizeShotEdit({camera:'auto',overlay:'auto'}),null);
 assert.deepEqual(shots.sanitizeShotEdit({transitionIn:'fadeblack'}),{transitionIn:{type:'fadeblack',duration:0.7}});
 assert.deepEqual(shots.sanitizeShotEdit({transitionIn:{type:'cut',duration:1}}),{transitionIn:{type:'cut',duration:0}});
 assert.throws(()=>shots.sanitizeShotEdit({transitionIn:{type:'fade',duration:4}}),/0,12–1,5/);
 assert.throws(()=>shots.sanitizeShotEdit({transitionIn:'explode'}),/Geçiş/);
 assert.throws(()=>shots.sanitizeShotEdit({overlay:{mode:'custom',value:''}}),/boş/);
 assert.throws(()=>shots.sanitizeShotEdit({overlay:{mode:'custom',value:'a\nb'}}),/tek satır/);
 assert.throws(()=>shots.sanitizeShotEdit({camera:'spin'}),/Kamera/);
 const merged=shots.mergeShotEdits({s0b0:{camera:'push'}},{s0b0:null,s1b0:{overlay:'off'}},new Set(['s0b0','s1b0']));
 assert.deepEqual(merged,{s1b0:{overlay:{mode:'off'}}});
 assert.throws(()=>shots.mergeShotEdits({}, {s9b0:{camera:'push'}},new Set(['s0b0'])),/Plan bulunamadı/);
});

test('geçiş kararı otomatik kurguyu ezer, gövde güvenliği korunur',()=>{
 const beats=[0,1,2].map(i=>({id:`s${i}b0`,segIndex:i,sectionIndex:0,dur:5,media:{type:'image',file:`g${i}.jpg`}}));
 const edits={s1b0:{transitionIn:{type:'fadewhite',duration:0.3}},s2b0:{transitionIn:{type:'cut',duration:0}}};
 const plan=planTransitions(beats,{theme:'belgesel',intensity:'yok',overrides:shots.transitionOverrides(beats,edits)});
 assert.deepEqual(plan[0],{tip:'fadewhite',sure:0.3},'geçişler kapalıyken bile kullanıcı kararı uygulanır');
 assert.deepEqual(plan[1],{tip:'',sure:0});
 const short=[{...beats[0],dur:.5},{...beats[1],dur:.5}];
 const safe=planTransitions(short,{intensity:'sinematik',overrides:new Map([[0,{tip:'fadeblack',sure:1.5}]])});
 assert.ok(safe[0].sure<=2*(0.5-0.34)+0.001,`kısa planda geçiş kısılmalı: ${safe[0].sure}`);
});

test('yazı kapatma, özel yazı ve kamera kararı kompozisyona işler',()=>{
 const canvas={w:1920,h:1080};
 const beat=(editorial,extra={})=>({id:'s1b0',dur:6,query:'q',media:{type:'image',kadraj:'belge',editorial},...extra});
 const words=[{t:'1942',start:.4,end:.8}];
 assert.equal(planEditorialShot({canvas,index:2,beat:beat({}),words}).layout,'number','kontrol: otomatik sayı vurgusu var');
 const off=planEditorialShot({canvas,index:2,beat:beat({overlayOff:true}),words});
 assert.equal(off.textBlocks.length,0);assert.equal(off.layout,'immersive');
 const opener=planEditorialShot({canvas,index:0,title:'Midway',beat:beat({overlayOff:true},{isVideoStart:true,sectionTitle:'Midway'})});
 assert.equal(opener.textBlocks.length,0,'açılış başlığı da kapanır');
 const b=[{id:'s1b0',media:{type:'image',kadraj:'belge',file:'x.jpg'}}];
 shots.applyShotEditsToBeats(b,{s1b0:{camera:'pan-right',overlay:{mode:'custom',value:'4 HAZİRAN 1942',label:'MIDWAY',position:'right'}}});
 const custom=planEditorialShot({canvas,index:2,beat:{...b[0],dur:6}});
 assert.equal(custom.layout,'directed-overlay');
 assert.equal(custom.textBlocks[0].lines.join(' '),'4 HAZİRAN 1942');
 assert.equal(custom.camera.mode,'pan-right','belge planında bile kullanıcı kamerası geçerli');
});

test('HTTP: plan kararları kaydedilir, render geçersizlenir, kare servis edilir',async()=>{
 const id='20260924-abcdef',dir=jobDir(id),url=`http://127.0.0.1:${server.address().port}/api/jobs/${id}`;
 createJob({id,topic:'Plan',status:'done',visualStyle:'editorial',createdAt:new Date().toISOString(),usage:{},outputs:{video:'output.mp4'}});
 const image=path.join(dir,'g.png'),audio=path.join(dir,'a.wav');
 await run(ff,['-f','lavfi','-i','color=c=navy:s=320x180','-frames:v','1','-y',image]);
 await run(ff,['-f','lavfi','-i','sine=frequency=440','-t','1','-y',audio]);
 await run(ff,['-f','lavfi','-i','testsrc=size=320x180:rate=30','-t','4','-pix_fmt','yuv420p','-y',path.join(dir,'output.mp4')]);
 writeJson(path.join(dir,'script.json'),{title:'Plan',sections:[{title:'A',segments:[{text:'Birinci cümle.',visuals:[{query:'a'}]},{text:'İkinci cümle.',visuals:[{query:'b'}]}]}]});
 writeJson(path.join(dir,'media.json'),{s0b0:{file:image,type:'image'},s1b0:{file:image,type:'image'}});
 writeJson(path.join(dir,'tts.json'),[{segId:'s0',text:'Birinci cümle.',audio,duration:1,words:[]},{segId:'s1',text:'İkinci cümle.',audio,duration:1,words:[]}]);
 const comp={width:1920,height:1080,textBlocks:[{lines:['1942'],role:'focus'}],camera:{mode:'push'},overlayPosition:null};
 writeJson(path.join(dir,'edit-plan.json'),{version:2,visualStyle:'editorial',fps:30,transitions:[{tip:'fade',sure:0.3}],scenes:[{id:'s0b0',frames:60,mediaType:'image',composition:comp},{id:'s1b0',frames:60,mediaType:'image',composition:{...comp,textBlocks:[]}}]});
 writeJson(path.join(dir,'checkpoints.json'),{render:{key:'x',value:{dir}}});
 const req=async(method,body)=>{const r=await fetch(url+'/editor',{method,headers:{'content-type':'application/json'},body:body&&JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const before=await req('GET');
 assert.equal(before.status,200);assert.equal(before.data.capabilities.canEditShots,true);
 assert.deepEqual(before.data.timeline.shots.map(s=>[s.id,s.start,s.overlay.join(' ')]),[['s0b0',0,'1942'],['s1b0',2,'']]);
 assert.deepEqual(before.data.timeline.shots[1].transitionIn,{tip:'fade',sure:0.3});
 const saved=await req('PATCH',{shots:{s1b0:{transitionIn:{type:'fadeblack',duration:0.5},overlay:{mode:'custom',value:'4 HAZİRAN 1942',label:'',position:'left'}}}});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.deepEqual(saved.data.shotEdits.s1b0.transitionIn,{type:'fadeblack',duration:0.5});
 assert.equal(readJson(path.join(dir,'shot-edits.json')).shots.s1b0.overlay.value,'4 HAZİRAN 1942');
 assert.equal(getJob(id).needsRerender,true);assert.equal(readJson(path.join(dir,'checkpoints.json')).render,undefined);
 assert.equal((await req('PATCH',{shots:{s7b0:{camera:'push'}}})).status,400,'var olmayan plan');
 assert.equal((await req('PATCH',{shots:{s0b0:{overlay:{mode:'custom',value:'W'.repeat(40),label:'',position:'left'}}}})).status,400,'sığmayan yazı render öncesinde reddedilir');
 assert.equal((await req('PATCH',{shots:{s1b0:null}})).data.shotEdits.s1b0,undefined,'otomatiğe dönüş');
 const frame=await fetch(url+'/shot-frame/s1b0');assert.equal(frame.status,200);assert.ok((await frame.arrayBuffer()).byteLength>500);
 assert.equal((await fetch(url+'/shot-frame/..%2Fjob.json')).status,400);
});

test('render: kaydedilen kararlar teslim edilen kurgu planında görünür',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'render-')),media={},tts=[];
 const colors=['0x7a2e2e','0x2e4f7a','0x2e7a44'];
 for(let i=0;i<3;i++){
  const g=path.join(dir,`g${i}.png`),a=path.join(dir,`a${i}.wav`);
  await run(ff,['-f','lavfi','-i',`color=c=${colors[i]}:s=1280x720`,'-frames:v','1','-y',g]);
  await run(ff,['-f','lavfi','-i',`sine=frequency=${300+i*100}:duration=3`,'-ar','48000','-ac','1','-y',a]);
  media[`s${i}b0`]={file:g,type:'image',provider:'test'};tts.push({segId:`s${i}`,duration:3,words:[],audio:a});
 }
 const script={title:'Plan testi',sections:[{title:'Bölüm',segments:[0,1,2].map(i=>({text:`Cümle ${i}.`,visuals:[{query:`q${i}`,type:'image'}]}))}]};
 const shotEdits={s0b0:{camera:'push',overlay:{mode:'custom',value:'4 HAZİRAN 1942',label:'MIDWAY',position:'left'}},s1b0:{transitionIn:{type:'fadewhite',duration:0.3}},s2b0:{transitionIn:{type:'cut',duration:0}}};
 const job={id:'kurgu-masasi',theme:'belgesel',language:'tr',ratio:'16:9',subtitleMode:'none',visualStyle:'editorial',transitions:'sinematik',mediaKind:'mixed',musicVolume:0,soundDesign:false,demo:true,shotEdits,settingsSnapshot:{...getSettings(),fps:24,crf:28,preset:'ultrafast',concurrency:2}};
 const logs=[];
 await renderAll(job,script,media,tts,dir,m=>logs.push(m),()=>{},{cancelled:false,add(){},remove(){},delete(){}});
 const plan=readJson(path.join(dir,'edit-plan.json'));
 assert.deepEqual(plan.transitions[0],{tip:'fadewhite',sure:0.292},'kare ızgarasına oturan beyaz flaş');
 assert.deepEqual(plan.transitions[1],{tip:'',sure:0});
 const first=plan.scenes[0].composition;
 assert.equal(first.textBlocks[0].lines.join(' '),'4 HAZİRAN 1942');assert.equal(first.camera.mode,'push');
 assert.ok(logs.some(l=>/Kurgu masası: 3 plan kararı/.test(l)));
 assert.ok(fs.statSync(path.join(dir,'output.mp4')).size>10000);
});

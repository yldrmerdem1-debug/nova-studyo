import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-modes-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {newJobFromRequest:create}=await import('../src/pipeline/index.js');
const newJobFromRequest=body=>create({topic:'Offline mode regression',...body});
const {DURATIONS,getSettings}=await import('../src/config.js');
const {styleOf,AI_STYLES,estimateCost,providerReady,animateKeyframes}=await import('../src/pipeline/collage.js');
const {normalizeBeatTypes}=await import('../src/pipeline/media.js');
globalThis.fetch=async()=>{throw Error('Unstubbed network forbidden');};
const {productionMode,isGenerated,selectProductionMode,aiAllowance,plannedAiAllowance}=await import('../public/production-modes.js');

test('all 25 button transitions round-trip through the API without stale styles or lost budgets',()=>{
 const modes=['image','mixed','ai','kolaj','fullai'];
 for(const from of modes)for(const to of modes){
  const form={visualStyle:'editorial',mediaKind:'mixed',aiButce:5,collageMode:'kapali'};
  selectProductionMode(form,from);selectProductionMode(form,to);
  const job=newJobFromRequest(form);
  assert.equal(productionMode(form),to,`${from} -> ${to} form`);
  assert.equal(productionMode(job),to,`${from} -> ${to} job`);
  assert.equal(form.aiButce,5);
  if(to!=='kolaj')assert.equal(form.visualStyle,'editorial');
  assert.equal(job.aiButce,to==='image'||isGenerated(form)?0:5);
 }
});
test('normal reserves AI for fallback, AI mode plans it, and image mode never allows it',()=>{
 for(const mediaKind of ['image','mixed','ai']){
  const job=newJobFromRequest({mediaKind,aiButce:5});
  assert.equal(plannedAiAllowance(job),mediaKind==='ai'?3:0);
  assert.equal(aiAllowance(job),mediaKind==='image'?0:5);
 }
 assert.equal(plannedAiAllowance({mediaKind:'ai',aiButce:1}),1);
 const script={sections:[{segments:[{visuals:[{type:'ai'},{type:'video'}]}]}]};
 normalizeBeatTypes({mediaKind:'mixed'},script);
 assert.deepEqual(script.sections[0].segments[0].visuals.map(v=>v.type),['image','video']);
});
test('dry-run never crosses the paid image boundary',async()=>{
 const {generateAiClips}=await import('../src/pipeline/aivideo.js');
 const {imageProvider}=await import('../src/pipeline/collage.js');
 const settings={...getSettings(),imageProvider:'fal',falKey:'offline-placeholder',dryRun:true};
 const provider=imageProvider(settings),old=provider.textToImage;let calls=0;
 provider.textToImage=async()=>{calls++;throw Error('Should not be called');};
 try{assert.deepEqual(await generateAiClips([{id:'b0',visual:{type:'ai',prompt:'A concrete original test scene'}}],1,home,()=>{},()=>false,null,{settings}),{});assert.equal(calls,0);}
 finally{provider.textToImage=old;}
});
test('missing AI provider stops a real generated job instead of silently making placeholders',async()=>{
 const store=await import('../src/store.js');
 const {resumeJob}=await import('../src/pipeline/index.js');
 const {writeJson}=await import('../src/util.js');
 const job=newJobFromRequest({mediaKind:'fullai',collageMode:'kapali'});
 job.status='error';job.demo=false;job.settingsSnapshot={dryRun:false,imageProvider:'fal',videoProvider:'fal'};
 store.createJob(job);
 writeJson(path.join(store.jobDir(job.id),'script.json'),{title:'Offline provider check',beats:[{id:'b0',text:'A concrete original test scene.',concept:'A detailed mechanical device'}]});
 resumeJob(job.id);
 for(let i=0;i<100&&['queued','running'].includes(store.getJob(job.id).status);i++)await new Promise(r=>setTimeout(r,10));
 const result=store.getJob(job.id);
 assert.equal(result.status,'error');assert.match(result.message,/sağlayıcısı eksik/);
 assert.ok(!fs.existsSync(path.join(store.jobDir(job.id),'keyframes.json')));
});

test('one minute is a normal visible duration and old IDs remain compatible',()=>{
 assert.equal(DURATIONS.test.minutes,1);assert.equal(DURATIONS.test.name,'1 dakika');
 assert.equal(newJobFromRequest({durationPreset:'test'}).durationPreset,'test');
 assert.equal(DURATIONS.detayli.minutes,12);assert.equal(DURATIONS.derin.minutes,20);
 for(const durationPreset of ['constructor','__proto__','toString'])assert.equal(newJobFromRequest({durationPreset}).durationPreset,'standart');
});
test('image-only ignores inherited AI allowances and removes AI markers',()=>{
 const job=newJobFromRequest({mediaKind:'image',aiButce:30,aiClips:20,aiFill:20});
 assert.equal(job.aiButce,0);assert.equal(job.aiClips,0);assert.equal(job.aiFill,0);
 const script={sections:[{segments:[{visuals:[{type:'ai',aiFill:true,prompt:'generated scene'},{type:'video'}]}]}]};
 normalizeBeatTypes(job,script);
 assert.ok(script.sections[0].segments[0].visuals.every(v=>v.type==='image'&&!v.aiFill));
});
test('explicit collage wins over stale Full AI state',()=>{
 const job=newJobFromRequest({visualStyle:'kolaj',mediaKind:'fullai'});
 assert.equal(styleOf(job),AI_STYLES.kolaj);
 assert.equal(styleOf({visualStyle:'kolaj',mediaKind:'fullai'}),AI_STYLES.kolaj);
 assert.equal(styleOf(newJobFromRequest({mediaKind:'fullai'})),AI_STYLES.sinematik);
});
test('image generation readiness does not require a video provider for stills',()=>{
 const s={imageProvider:'fal',falKey:'offline-placeholder',videoProvider:'kie',kieKey:''};
 assert.equal(providerReady(s,{animate:false}),true);
 assert.equal(providerReady(s,{animate:true}),false);
});
test('hybrid cost and animation select only 40 percent of scenes',async()=>{
 assert.equal(estimateCost(10,{mode:'hibrit'}).clips,1.38);
 assert.equal(estimateCost(10,{mode:'kapali'}).clips,0);
 assert.equal(estimateCost(10,{mode:'acik'}).clips,3.45);
 const {imageProvider,videoProvider}=await import('../src/pipeline/collage.js');
 const s={...getSettings(),imageProvider:'fal',videoProvider:'fal',falKey:'offline-placeholder'};
 const prov=videoProvider(s),old=prov.imageToVideo,calls=[];
 prov.imageToVideo=async(_p,url)=>{calls.push(url);throw Error('Offline failure fixture');};
 const file=path.join(home,'frame.jpg');fs.writeFileSync(file,'cached fixture');
 const beats=Array.from({length:10},(_,i)=>({id:`b${i}`,duration:2}));
 try{
  const media=await animateKeyframes(beats,beats.map(b=>({beatId:b.id,file,url:b.id})),path.join(home,'clips'),{animate:true,mode:'hibrit',dryRun:false,settings:s,logFn:()=>{},isCancelled:()=>false});
  assert.equal(calls.length,4);assert.equal(Object.keys(media).length,10);
  assert.ok(Object.values(media).every(m=>m.type==='image'),'failed video generation preserves its frame');
 }finally{prov.imageToVideo=old;}
});

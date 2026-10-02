import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-provider-review-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {saveSettings,getSettings,getJobSettings,snapshotSettings}=await import('../src/config.js');
const {imageProvider,videoProvider,providerReady,generateKeyframes,animateKeyframes,videoUretimiHazir}=await import('../src/pipeline/collage.js');
const {generateAiClips}=await import('../src/pipeline/aivideo.js');
globalThis.fetch=async()=>{throw Error('Unexpected network request in offline regression');};

test('partial collage recovery preserves local replacement without its original keyframe',async()=>{
  const file=path.join(home,'frame.jpg');fs.writeFileSync(file,'fixture');
  const cached={b0:{file,type:'image',provider:'local',localOverride:true}};
  const result=await animateKeyframes([{id:'b0'},{id:'b1'}],[{beatId:'b1',file}],path.join(home,'clips'),{dryRun:true,animate:false,cached,logFn:()=>{},isCancelled:()=>false});
  assert.deepEqual(result.b0,cached.b0);assert.ok(result.b1);
});

test('provider helpers and paid boundaries keep the job provider/model after global settings change',async()=>{
  saveSettings({dryRun:false,imageProvider:'fal',videoProvider:'fal',falImageModel:'saved-image-model',falVideoModel:'saved-video-model',falKey:'offline-placeholder'});
  const job={settingsSnapshot:snapshotSettings()};
  const fal=imageProvider();
  saveSettings({imageProvider:'kie',videoProvider:'kie',falImageModel:'different-model',falVideoModel:'different-video'});
  const settings=getJobSettings(job);
  assert.equal(imageProvider(settings),fal);assert.equal(videoProvider(settings),fal);assert.equal(providerReady(settings),true);
  const old=fal.textToImage,oldVideo=fal.imageToVideo,calls=[];
  fal.textToImage=async(_prompt,s)=>{calls.push(['image',s.falImageModel]);throw Error('offline boundary');};
  fal.imageToVideo=async(_prompt,_url,_seconds,s)=>{calls.push(['video',s.falVideoModel]);throw Error('offline boundary');};
  try {
    await assert.rejects(generateKeyframes([{id:'b0',concept:'Specific test object'}],path.join(home,'frames'),{dryRun:false,settings,logFn:()=>{},isCancelled:()=>false}),/offline boundary/);
    await generateAiClips([{id:'b0',visual:{type:'ai',prompt:'Specific test object'}}],1,path.join(home,'ai'),()=>{},()=>false,null,{settings});
    const file=path.join(home,'frame.jpg');fs.writeFileSync(file,'fixture');
    await animateKeyframes([{id:'b0',duration:2}],[{beatId:'b0',file,url:'https://offline.test/frame'}],path.join(home,'animated'),{dryRun:false,animate:true,settings,logFn:()=>{},isCancelled:()=>false});
    assert.deepEqual(calls,[['image','saved-image-model'],['image','saved-image-model'],['video','saved-video-model']]);
  } finally {fal.textToImage=old;fal.imageToVideo=oldVideo;}
});

test('video availability cache cannot transfer an unavailable model result to a different model',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(_url,opts)=>{const model=JSON.parse(opts.body).model;calls.push(model);return {json:async()=>({code:model==='offline-unavailable'?422:200})};};
  try {
    const settings={...getSettings(),imageProvider:'kie',videoProvider:'kie',kieKey:'offline-placeholder'};
    const unavailable={...settings,kieVideoModel:'offline-unavailable'};
    assert.equal(await videoUretimiHazir(()=>{},unavailable),false);
    const file=path.join(home,'frame.jpg');fs.writeFileSync(file,'fixture');
    const cached={b0:{file,type:'image',provider:'local',localOverride:true}};
    const fallback=await animateKeyframes([{id:'b0'},{id:'b1'}],[{beatId:'b1',file}],path.join(home,'fallback'),{dryRun:false,animate:true,settings:unavailable,cached,logFn:()=>{},isCancelled:()=>false});
    assert.deepEqual(fallback.b0,cached.b0);assert.ok(fallback.b1);
    assert.equal(await videoUretimiHazir(()=>{},{...settings,kieVideoModel:'offline-available'}),true);
    assert.deepEqual(calls,['offline-unavailable','offline-available']);
  } finally {globalThis.fetch=original;}
});

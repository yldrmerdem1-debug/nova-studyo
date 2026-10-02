import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-recovery-'));
process.env.NOVA_HOME=home; process.env.TEMP=home; process.env.TMP=home;
const api=await import('../src/pipeline/index.js');
const store=await import('../src/store.js');
const {writeJson,readJson}=await import('../src/util.js');
let seq=0;
function fixture(status='done') {
 const id=`20260907-${(++seq).toString(16).padStart(6,'0')}`;
 const job={id,status,stage:status,topic:'Test',theme:'belgesel',usage:{},outputs:{video:'output.mp4'}};
 store.createJob(job); const dir=store.jobDir(id);
 for(const name of ['media','tts','render']) fs.mkdirSync(path.join(dir,name),{recursive:true});
 const audio=path.join(dir,'tts','voice.wav'), img=path.join(dir,'media','image.png');
 fs.writeFileSync(audio,'audio'); fs.writeFileSync(img,Buffer.from('89504e470d0a1a0a0000000049454e44','hex'));
 fs.writeFileSync(path.join(dir,'render','partial'),'partial'); fs.writeFileSync(path.join(dir,'output.mp4'),'old final');
 writeJson(path.join(dir,'script.json'),{title:'Test',sections:[{title:'One',segments:[{text:'First.',visuals:[{type:'image',query:'one'}]},{text:'Second.',visuals:[{type:'image',query:'two'}]}]}]});
 writeJson(path.join(dir,'media.json'),{s0b0:{beatId:'s0b0',file:img,type:'image'},s1b0:{beatId:'s1b0',file:img,type:'image'}});
 writeJson(path.join(dir,'tts.json'),['First.','Second.'].map((text,i)=>({segId:`s${i}`,text,audio,duration:1,words:[{t:text,start:0,end:1}]})));
 return {id,dir,job,audio,img};
}
test('restart retains paid source artifacts',()=>{const f=fixture('running'); api.sweepStaleJobs([f.job]); assert.ok(fs.existsSync(f.audio)); assert.ok(fs.existsSync(f.img)); assert.match(store.getJob(f.id).message,/devam/i);});
test('editor API is exported and selective text invalidation preserves other voice and final',()=>{assert.equal(typeof api.saveEditorChanges,'function');const f=fixture();const r=api.saveEditorChanges(f.id,{segments:[{segId:'s0',text:'Changed.'}]});assert.equal(r.scenes[0].text,'Changed.');assert.equal(r.scenes[0].audioAvailable,false);assert.equal(r.scenes[1].audioAvailable,true);assert.equal(fs.readFileSync(path.join(f.dir,'output.mp4'),'utf8'),'old final');assert.ok(fs.existsSync(f.audio));});
test('legacy missing sources are actionable and active edit rejected',()=>{assert.equal(typeof api.getEditorData,'function');const f=fixture();fs.unlinkSync(f.audio);const r=api.getEditorData(f.id);assert.ok(r.capabilities.missingSteps.includes('voice'));assert.ok(r.capabilities.warnings.length);store.updateJob(f.id,{status:'running'});assert.throws(()=>api.saveEditorChanges(f.id,{thumbnailText:'Test'}),/çalış|aktif|sıra/i);});
test('editor validates entire patch before mutation and rejects network/nonmedia paths',()=>{const f=fixture();assert.throws(()=>api.saveEditorChanges(f.id,{segments:[{segId:'s0',text:'Changed.'},{segId:'s99',text:'Invalid'}]}));assert.equal(readJson(path.join(f.dir,'script.json')).sections[0].segments[0].text,'First.');assert.throws(()=>api.saveEditorChanges(f.id,{segments:[{segId:'s0',mediaPath:'https://example.test/a.jpg'}]}));assert.throws(()=>api.saveEditorChanges(f.id,{segments:[{segId:'s0',mediaPath:path.join(f.dir,'script.json')}]}));});
test('sweep removes only disposable render scratch on done jobs, preserves interrupted render',()=>{const a=fixture();const b=fixture('error');api.sweepIntermediate();assert.ok(fs.existsSync(a.audio));assert.ok(fs.existsSync(a.img));assert.ok(fs.existsSync(path.join(b.dir,'render','partial')));});
test('new jobs validate production options and initialize budget',()=>{const j=api.newJobFromRequest({topic:'Topic',costBudgetUsd:4.5,editIntensity:'restrained',soundDesign:false,sfxVolume:0});assert.equal(j.costBudgetUsd,4.5);assert.equal(j.usage.budgetUsd,4.5);assert.equal(j.soundDesign,false);assert.equal(j.sfxVolume,0);assert.throws(()=>api.newJobFromRequest({topic:'Topic',costBudgetUsd:-2}));});
test('serialized resume rejects duplicate and consumes intact script media voice render caches without network',async()=>{const f=fixture('error');store.updateJob(f.id,{demo:true,mediaMode:'manual',gorselDenetim:false});writeJson(path.join(f.dir,'seo.json'),{title:'Test',description:'Offline',tags:[],thumbnailText:'Test'});const {renderRevision}=await import('../src/pipeline/checkpoints.js');await renderRevision(f.dir,[readJson(path.join(f.dir,'script.json')),readJson(path.join(f.dir,'media.json')),readJson(path.join(f.dir,'tts.json')),undefined,undefined],async d=>{fs.writeFileSync(path.join(d,'output.mp4'),'cached rendered');return{durationSec:2,sectionTimes:[],thumbs:[],muzikler:[]};});let calls=0;const old=globalThis.fetch;globalThis.fetch=()=>{calls++;throw Error('Unexpected provider request');};try {api.resumeJob(f.id);assert.throws(()=>api.resumeJob(f.id),/aktif|sıra/i);assert.throws(()=>api.saveEditorChanges(f.id,{thumbnailText:'Blocked'}),/aktif|sıra/i);for(let n=0;n<100 && ['queued','running'].includes(store.getJob(f.id).status);n++) await new Promise(r=>setTimeout(r,10));assert.equal(store.getJob(f.id).status,'done',store.getJob(f.id).message);assert.equal(calls,0);assert.equal(fs.readFileSync(path.join(f.dir,'output.mp4'),'utf8'),'cached rendered');}finally{globalThis.fetch=old;api.cancelJob(f.id);}});
test('local media replacement preserves voice and unrelated scene media',()=>{const f=fixture();const r=api.saveEditorChanges(f.id,{segments:[{segId:'s0',mediaPath:f.img}]});assert.equal(r.scenes[0].audioAvailable,true);assert.equal(r.scenes[1].audioAvailable,true);assert.notEqual(r.scenes[0].media[0].file,f.img);assert.equal(r.scenes[1].media[0].file,f.img);assert.ok(fs.existsSync(r.scenes[0].media[0].file));});
test('malformed legacy script gives actionable capabilities without TypeError',()=>{const f=fixture();writeJson(path.join(f.dir,'script.json'),{sections:{bad:true}});assert.ok(api.getEditorData(f.id).capabilities.missingSteps.includes('script'));});

test('local editor lock excludes queued rendering and script mutations',async()=>{const {beginJobEdit}=await import('../src/job-locks.js');const f=fixture('error'),release=beginJobEdit(f.id);try{assert.equal(api.getEditorData(f.id).capabilities.canEdit,false);assert.throws(()=>api.resumeJob(f.id),/aktif|sıra/i);assert.throws(()=>api.rerenderJob(f.id),/aktif|sıra/i);assert.throws(()=>api.saveEditorChanges(f.id,{thumbnailText:'Locked'}),/aktif|sıra/i);}finally{release();}assert.equal(api.getEditorData(f.id).capabilities.canEdit,true);});

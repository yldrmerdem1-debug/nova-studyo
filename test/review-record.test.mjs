import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {test} from 'node:test';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-editor-review-'));
const {createJob,jobDir,updateJob}=await import('../src/store.js');const {writeJson}=await import('../src/util.js');
const {readReviewRecord,saveReviewRecord}=await import('../src/review-record.js');
const id='20260907-887766';createJob({id,status:'done'});const dir=jobDir(id);fs.writeFileSync(path.join(dir,'output.mp4'),'fixture');writeJson(path.join(dir,'script.json'),{title:'First'});
test('review is explicit, partial, and becomes stale after the source changes',()=>{
 const before=readReviewRecord(id);assert.equal(before.saved,null);const saved=saveReviewRecord(id,{revision:before.revision,checks:{opening:true,voice:false},notes:'Listen next.'});assert.equal(saved.stale,false);assert.equal(saved.saved.checks.opening,true);assert.equal(saved.saved.checks.voice,false);assert.equal(saved.saved.checks.visuals,false);
 writeJson(path.join(dir,'script.json'),{title:'Changed'});assert.equal(readReviewRecord(id).stale,true);assert.throws(()=>saveReviewRecord(id,{revision:before.revision,checks:{opening:true}}),/değişti/);
});
test('active work cannot receive an editor signoff and invalid fields do not overwrite',()=>{const before=fs.readFileSync(path.join(dir,'editor-review.json'),'utf8');updateJob(id,{status:'running'});assert.throws(()=>saveReviewRecord(id,{revision:readReviewRecord(id).revision,checks:{}}),/sürerken/);updateJob(id,{status:'done'});assert.throws(()=>saveReviewRecord(id,{revision:readReviewRecord(id).revision,checks:{imaginary:true}}),/Geçersiz/);assert.equal(fs.readFileSync(path.join(dir,'editor-review.json'),'utf8'),before);});
test('pending edits cannot be certified against an older output',()=>{
 updateJob(id,{needsRerender:true});
 try{assert.throws(()=>saveReviewRecord(id,{revision:readReviewRecord(id).revision,checks:{opening:true}}),/videoya/);}finally{updateJob(id,{needsRerender:false});}
});
test('empty output cannot be presented or certified as a completed video',()=>{
 fs.writeFileSync(path.join(dir,'output.mp4'),'');
 assert.equal(readReviewRecord(id).available,false);
 assert.throws(()=>saveReviewRecord(id,{revision:readReviewRecord(id).revision,checks:{opening:true}}),/tamamlanmış/);
});

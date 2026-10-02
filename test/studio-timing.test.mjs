import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {test} from 'node:test';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-timing-'));
const {createJob,updateJob}=await import('../src/store.js');
test('processing time accumulates retries but excludes user approval waiting',()=>{
 const id='20260907-666aaa';createJob({id,status:'queued'});const original=Date.now;let now=1000;Date.now=()=>now;
 try {updateJob(id,{status:'running'});now=4000;updateJob(id,{stage:'media'});now=6000;assert.equal(updateJob(id,{status:'awaiting_picks'}).processingMs,5000);now=66000;updateJob(id,{status:'running'});now=69000;assert.equal(updateJob(id,{status:'error'}).processingMs,8000);now=79000;updateJob(id,{status:'running'});now=83000;const done=updateJob(id,{status:'done'});assert.equal(done.processingMs,12000);assert.equal(done.activeSince,null);}finally{Date.now=original;}
});

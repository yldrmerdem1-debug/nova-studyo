import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(),'nova-publication-'));
const { createJob, jobDir, getJob } = await import('../src/store.js');
const { run } = await import('../src/util.js');
const { getSettings } = await import('../src/config.js');
const { regenerateCover, savePublicationFeedback } = await import('../src/publication.js');
const job = { id:'20260907-abcdef',status:'done',theme:'belgesel',language:'tr',topic:'Okyanusların sırrı',meta:{durationSec:3},outputs:{video:'output.mp4'} };
createJob(job);
const dir = jobDir(job.id), st=getSettings();
await run(st.ffmpegPath,['-f','lavfi','-i','testsrc2=s=640x360:r=10','-t','3','-c:v','libx264','-threads','1','-y',path.join(dir,'output.mp4')]);
test('a cover is generated from a chosen video frame and all variants persist',async()=>{
  const before=fs.statSync(path.join(dir,'output.mp4')).size;
  const result=await regenerateCover(job.id,{text:'DERİNDE NE VAR',time:1,x:0.2,y:0.7,zoom:1.2});
  assert.equal(result.thumbs.length,3);
  for(const name of [...result.thumbs,'thumbnail.jpg']) assert.ok(fs.statSync(path.join(dir,name)).size>1000);
  assert.equal(fs.statSync(path.join(dir,'output.mp4')).size,before);
  assert.equal(getJob(job.id).thumbnailText,'DERİNDE NE VAR');
});
test('invalid crops reject before replacing a saved cover',async()=>{
  const original=fs.readFileSync(path.join(dir,'thumbnail.jpg'));
  await assert.rejects(regenerateCover(job.id,{text:'YENİ KAPAK',zoom:-5}),/kadraj|zoom/i);
  assert.deepEqual(fs.readFileSync(path.join(dir,'thumbnail.jpg')),original);
});
test('manual viewer metrics validate percentages and retain recording provenance',()=>{
  const result=savePublicationFeedback(job.id,{videoUrl:'https://www.youtube.com/watch?v=example',views:1000,impressions:15000,ctr:4.3,retention30:68,notes:'Kancadan sonra harita geliyor.'});
  assert.equal(result.source,'manual');
  assert.equal(result.ctr,4.3);
  assert.throws(()=>savePublicationFeedback(job.id,{ctr:140}),/CTR/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-speech-check-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {createJob,jobDir,updateJob}=await import('../src/store.js');
const {saveSettings,getSettings}=await import('../src/config.js');
const {writeJson,run}=await import('../src/util.js');
const {beginJobEdit}=await import('../src/job-locks.js');
const {normalizeSpeech,compareSpeech,readSpeechCheck,checkSpeech}=await import('../src/speech-check.js');
saveSettings({elevenKey:'offline-test-placeholder'});
const job={id:'20260907-abcd19',status:'done',language:'tr',meta:{durationSec:1},needsRerender:false};
createJob(job);const dir=jobDir(job.id),st=getSettings();
writeJson(path.join(dir,'script.json'),{sections:[{segments:[{text:'İstanbul bugün güzel.'}]}]});
await run(st.ffmpegPath,['-f','lavfi','-i','color=s=160x90:r=5','-f','lavfi','-i','sine=frequency=440:sample_rate=16000','-t','1','-c:v','libx264','-threads','1','-c:a','aac','-y',path.join(dir,'output.mp4')]);

test('normalization handles Turkish casing, punctuation and TTS tags without inventing number equivalence',()=>{
  assert.deepEqual(normalizeSpeech("[laughs] İSTANBUL, IĞDIR! Ankara’ya 12."),['istanbul','ığdır','ankaraya','12']);
  const c=compareSpeech('Bir küçük adım.','Bir büyük adım.');assert.equal(c.comparison.editDistance,1);assert.equal(c.comparison.wordDifferenceRatio,1/3);
  assert.equal(compareSpeech('bir adım','bir küçük adım').comparison.editDistance,1);
  assert.equal(compareSpeech('bir küçük adım','bir adım').comparison.editDistance,1);
  assert.match(compareSpeech('12 yıl','on iki yıl').note,/sayı|rakam/i);
  assert.throws(()=>compareSpeech('a '.repeat(10001),'a'),/sınır/i);
});

test('only mono PCM audio is uploaded; matching report is reused; force is explicit',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,opts)=>{
    calls++;assert.equal(url,'https://api.elevenlabs.io/v1/speech-to-text');assert.equal(opts.method,'POST');
    const form=opts.body;assert.equal(form.get('model_id'),'scribe_v2');assert.equal(form.get('language_code'),'tr');assert.equal(form.get('timestamps_granularity'),'word');assert.equal(form.get('tag_audio_events'),'false');
    const audio=form.get('file');assert.match(audio.name,/\.wav$/);const bytes=Buffer.from(await audio.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(24),16000);
    assert.equal(form.has('video'),false);return new Response(JSON.stringify({text:'İstanbul bugün güzel.',words:[{text:'İstanbul',type:'word',start:0,end:0.3},{text:'bugün',type:'word',start:0.3,end:0.6},{text:'güzel',type:'word',start:0.6,end:1}]}));
  };
  try {
    assert.equal(readSpeechCheck(job.id).report,null);
    const report=await checkSpeech(job.id);assert.equal(report.comparison.editDistance,0);assert.equal(calls,1);assert.equal(readSpeechCheck(job.id).stale,false);
    assert.deepEqual(await checkSpeech(job.id),report);assert.equal(calls,1);
    await checkSpeech(job.id,{force:true});assert.equal(calls,2);
    assert.ok(!fs.readFileSync(path.join(dir,'speech-check','report.json'),'utf8').includes('offline-test-placeholder'));
    const output=path.join(dir,'output.mp4'),stat=fs.statSync(output);fs.utimesSync(output,stat.atime,new Date(stat.mtimeMs+2000));assert.equal(readSpeechCheck(job.id).stale,true);
    writeJson(path.join(dir,'script.json'),{beats:[{text:'Yeni senaryo.'}]});assert.equal(readSpeechCheck(job.id).stale,true);
    updateJob(job.id,{needsRerender:true});await assert.rejects(checkSpeech(job.id),/videoya|render/i);assert.equal(calls,2);
  } finally {globalThis.fetch=original;updateJob(job.id,{needsRerender:false});}
});

test('active/locked jobs and invalid force reject; failed provider response has no retry',async()=>{
  updateJob(job.id,{status:'running'});await assert.rejects(checkSpeech(job.id),/üretim|aktif/i);updateJob(job.id,{status:'done'});
  const release=beginJobEdit(job.id);try{await assert.rejects(checkSpeech(job.id),/işlem|düzenleme/i);}finally{release();}
  await assert.rejects(checkSpeech(job.id,{force:'yes'}),/force|yenile/i);
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('private provider error',{status:503});};
  try{await assert.rejects(checkSpeech(job.id,{force:true}),/503/);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('actual duration limit and missing credentials reject before any provider request',async()=>{
  const longJob={...job,id:'20260907-abcd20',meta:{durationSec:1}};createJob(longJob);const longDir=jobDir(longJob.id);
  writeJson(path.join(longDir,'script.json'),{sections:[{segments:[{text:'Bir test.'}]}]});
  // One compressed frame with an 1801-second presentation interval. Small file,
  // but real container duration exceeds the limit despite misleading job metadata.
  await run(st.ffmpegPath,['-f','lavfi','-i','color=s=16x16:r=1/1801','-frames:v','1','-c:v','libx264','-threads','1','-y',path.join(longDir,'output.mp4')]);
  const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected provider call');};
  try {
    await assert.rejects(checkSpeech(longJob.id),/30 dakika/);assert.equal(calls,0);
    saveSettings({elevenKey:''});assert.equal(readSpeechCheck(job.id).available,false);await assert.rejects(checkSpeech(job.id,{force:true}),/ElevenLabs anahtar/);assert.equal(calls,0);
  } finally{saveSettings({elevenKey:'offline-test-placeholder'});globalThis.fetch=original;}
});

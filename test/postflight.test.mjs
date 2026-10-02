import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-postflight-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {createJob,jobDir,updateJob}=await import('../src/store.js');
const {writeJson,readJson}=await import('../src/util.js');
const {beginJobEdit}=await import('../src/job-locks.js');
const {buildPostflight,readPostflight}=await import('../src/postflight.js');

const makeJob=(id,status='done')=>createJob({id,topic:'Offline postflight fixture',status,createdAt:new Date().toISOString(),usage:{},outputs:{}});
const writeFixture=(id)=>{
  const dir=jobDir(id), shared=path.join(dir,'shared.png'), other=path.join(dir,'other.png');
  fs.writeFileSync(shared,'identity only');fs.writeFileSync(other,'identity only');
  writeJson(path.join(dir,'script.json'),{title:'Measured fixture',sections:[{title:'Opening',segments:[
    {text:'First measured sentence.',visuals:[{type:'image',query:'first'}]},
    {text:'Second measured sentence.',visuals:[{type:'image',query:'second'}]},
    {text:'Closing measured sentence.',visuals:[{type:'image',query:'closing'}]},
  ]}]});
  writeJson(path.join(dir,'tts.json'),[
    {segId:'s0',text:'First measured sentence.',duration:1,words:[]},
    {segId:'s1',text:'Second measured sentence.',duration:1,words:[]},
    {segId:'s2',text:'Closing measured sentence.',duration:1,words:[]},
  ]);
  writeJson(path.join(dir,'edit-plan.json'),{version:1,fps:10,totalFrames:200,scenes:[
    {id:'s0b0',duration:11,frames:110},
    {id:'s1b0',duration:1,frames:10},
    {id:'s2b0',duration:8,frames:80},
  ]});
  writeJson(path.join(dir,'media.json'),{
    s0b0:{type:'image',file:shared},s1b0:{type:'image',file:shared},s2b0:{type:'image',file:other},
  });
  writeJson(path.join(dir,'sound-plan.json'),{version:1,duration:20,measured:{integratedLufs:-14.1,truePeakDb:-1.4,loudnessRange:3.2}});
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=20','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=19','-map','0:v','-map','1:a','-c:v','libx264','-preset','ultrafast','-crf','35','-pix_fmt','yuv420p','-c:a','aac','-y',path.join(dir,'output.mp4')],{stdio:'pipe'});
  return dir;
};

test('buildPostflight records measured timing defects and excludes the intentional end tail',async()=>{
  const id='20260907-a10001';makeJob(id);const dir=writeFixture(id);
  let calls=0;const oldFetch=globalThis.fetch;globalThis.fetch=()=>{calls++;throw new Error('provider call forbidden');};
  let report;try{report=await buildPostflight(id);}finally{globalThis.fetch=oldFetch;}
  assert.equal(calls,0);assert.equal(report.version,1);assert.equal(report.jobId,id);assert.equal(report.status,'ready');
  assert.ok(report.measurements.duration.formatSec>=19.9);
  assert.ok(report.measurements.duration.videoSec>=19.9);
  assert.ok(report.measurements.duration.audioSec>=18.9 && report.measurements.duration.audioSec<19.2);
  assert.ok(report.measurements.duration.avDeltaSec>.8);
  assert.deepEqual(report.measurements.coverage,{scriptSceneCount:3,ttsSceneCount:3,editSceneCount:3,ttsPercent:100,editPercent:100});
  assert.equal(report.measurements.first30Speech.speechSec,3);
  assert.ok(report.findings.some(x=>x.code==='av-duration-mismatch' && x.metric.value>.8));
  assert.ok(report.findings.some(x=>x.code==='low-opening-speech' && x.timestamp===0));
  assert.ok(report.findings.some(x=>x.code==='long-visual-hold' && x.sceneId==='s0b0' && x.timestamp===0));
  assert.ok(report.findings.some(x=>x.code==='repeated-visual-source' && x.sceneId==='s1b0' && x.timestamp===11));
  assert.ok(report.findings.some(x=>x.code==='narration-gap' && x.sceneId==='s0'));
  assert.ok(!report.findings.some(x=>x.code==='narration-gap' && x.sceneId==='s2'),'the final 7 second end-card tail is intentional');
  assert.ok(report.actions.length>0);assert.ok(/^[a-f0-9]{64}$/.test(report.sourceSignature));
  assert.ok(report.samples.length>=1 && report.samples.every(x=>/^postflight-frames\/[a-z0-9-]+\.jpg$/.test(x.artifact)));
  for(const sample of report.samples)assert.ok(fs.statSync(path.join(dir,...sample.artifact.split('/'))).size>0);
  assert.deepEqual(readJson(path.join(dir,'postflight.json')),report);
  assert.doesNotMatch(JSON.stringify(report),/listened|subjectiveScore|viewerGuarantee/i);
});

test('buildPostflight rejects active jobs and participates in the shared edit lock',async()=>{
  const active='20260907-a10002';makeJob(active,'running');
  await assert.rejects(buildPostflight(active),e=>e.statusCode===409 && /aktif|sıra|üretim/i.test(e.message));
  const locked='20260907-a10003';makeJob(locked);const release=beginJobEdit(locked);
  try{await assert.rejects(buildPostflight(locked),e=>e.statusCode===409);}finally{release();}
  assert.equal(fs.existsSync(path.join(jobDir(active),'postflight.json')),false);
});

test('a real video-only final keeps unavailable audio duration null',async()=>{
  const id='20260907-a10007';makeJob(id);const dir=jobDir(id);
  writeJson(path.join(dir,'script.json'),{sections:[{title:'Only',segments:[{text:'Measured.',visuals:[{}]}]}]});
  writeJson(path.join(dir,'tts.json'),[{segId:'s0',duration:1,words:[]}]);
  writeJson(path.join(dir,'edit-plan.json'),{scenes:[{id:'s0b0',duration:2}]});
  execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=10:d=2','-an','-c:v','libx264','-preset','ultrafast','-crf','35','-pix_fmt','yuv420p','-y',path.join(dir,'output.mp4')],{stdio:'pipe'});
  const report=await buildPostflight(id);
  assert.ok(report.measurements.duration.videoSec>=1.9);
  assert.equal(report.measurements.duration.audioSec,null);
  assert.equal(report.measurements.duration.avDeltaSec,null);
  assert.ok(report.findings.some(x=>x.code==='missing-av-stream'&&x.severity==='error'));
  assert.equal(report.status,'incomplete');
});

test('missing and malformed local inputs create actionable incomplete reports without reading external paths',async()=>{
  const id='20260907-a10004';makeJob(id);const dir=jobDir(id);
  const outside=path.join(home,'do-not-read.txt');fs.writeFileSync(outside,'secret marker');
  writeJson(path.join(dir,'script.json'),{sections:[{title:'Only',segments:[{text:'Needs a voice.',visuals:[{}]}]}]});
  writeJson(path.join(dir,'tts.json'),[{segId:'s0',duration:'NaN',audio:outside},{segId:'s9',duration:2,audio:outside}]);
  writeJson(path.join(dir,'edit-plan.json'),{scenes:[{id:'s9b0',duration:2},{id:'s0b0',duration:-20}]});
  const report=await buildPostflight(id);
  assert.equal(report.status,'incomplete');
  assert.equal(report.measurements.duration.formatSec,null);
  assert.ok(report.findings.some(x=>x.code==='missing-output' && x.severity==='error' && x.timestamp===null));
  assert.ok(report.findings.some(x=>x.code==='missing-tts-timing' && x.sceneId==='s0'));
  assert.ok(report.findings.some(x=>x.code==='missing-edit-coverage' && x.sceneId==='s0'));
  assert.ok(report.findings.some(x=>x.code==='unmatched-tts-timing' && x.sceneId==='s9'));
  assert.ok(report.actions.some(x=>x.priority==='high' && /render|üret/i.test(x.message)));
  assert.doesNotMatch(JSON.stringify(report),/secret marker|do-not-read|\\|\.\.\//);
  await assert.rejects(buildPostflight('../outside'));
});

test('readPostflight sanitizes cached data and reports when its measured inputs become stale',async()=>{
  const id='20260907-a10005';makeJob(id);const dir=writeFixture(id);await buildPostflight(id);
  const fresh=readPostflight(id);assert.equal(fresh.available,true);assert.equal(fresh.stale,false);assert.equal(fresh.report.jobId,id);
  const poisoned=readJson(path.join(dir,'postflight.json'));poisoned.samples.push({timestamp:1,sceneId:'s0',artifact:'C:\\private\\token.txt'});poisoned.untrusted={apiKey:'secret'};writeJson(path.join(dir,'postflight.json'),poisoned);
  const safe=readPostflight(id);assert.equal(safe.available,true);assert.equal(safe.report.untrusted,undefined);assert.ok(!JSON.stringify(safe).includes('private'));
  const edit=readJson(path.join(dir,'edit-plan.json'));edit.scenes[0].duration=10.5;writeJson(path.join(dir,'edit-plan.json'),edit);
  assert.equal(readPostflight(id).stale,true);
  const absent='20260907-a10006';makeJob(absent);assert.deepEqual(readPostflight(absent),{available:false,stale:false,report:null});
});

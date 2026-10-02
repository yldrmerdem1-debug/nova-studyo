import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {shotSamples,renderedShotMedia,buildDirectorShotReview,failedDirectorShotReview,shouldFallbackOpenAIShotReview,reviewOpenAIInPairs} from '../src/pipeline/director-shot-review.js';
import {safeJobFileName} from '../src/job-files.js';

const script={sections:[{title:'Harbor',segments:[
 {text:'A ship enters the harbor.',visuals:[{query:'ship entering harbor',type:'video'}]},
 {text:'The clock drifts out of sync.',visuals:[{query:'clock timing',type:'image'}]},
]}]};
const editPlan={fps:30,scenes:[
 {id:'s0b0',frames:60,mediaType:'video',sourceId:'pexels:ship'},
 {id:'s1b0',frames:60,mediaType:'image',sourceId:'ai:clock'},
]};

test('shot review samples exact encoded-frame centres and matches each narration',()=>{
 const samples=shotSamples(editPlan,script);
 assert.deepEqual(samples.map(x=>[x.id,x.frame,x.timestamp,x.narration]),[
  ['s0b0',30,1,'A ship enters the harbor.'],
  ['s1b0',90,3,'The clock drifts out of sync.'],
 ]);
 assert.deepEqual(samples.map(x=>x.reviewFrames.map(f=>[f.position,f.frame,f.timestamp])),[
  [['first',9,0.3],['middle',30,1],['last',51,1.7]],
  [['first',69,2.3],['middle',90,3],['last',111,3.7]],
 ]);
});

test('multi-cut narration uses the verified spoken moment instead of demanding the whole paragraph in every shot',()=>{
 const paragraph='The ship enters the harbor. Then the harbor clock drifts out of sync.';
 const script={sections:[{segments:[{text:paragraph,visuals:[{query:'ship',type:'video'},{query:'clock',type:'image'}]}]}]};
 const plan={fps:30,scenes:[
  {id:'s0b0',frames:60,anchorQuote:'ship enters the harbor'},
  {id:'s0b1',frames:60,anchorQuote:'harbor clock drifts out of sync'},
 ]};
 const scenes=shotSamples(plan,script);
 assert.deepEqual(scenes.map(s=>s.spokenMoment),['ship enters the harbor','harbor clock drifts out of sync']);
 assert.deepEqual(scenes.map(s=>s.narration),[paragraph,paragraph]);
});

test('rendered Director cuts map back to their spoken segment when source visuals were curated after scripting',()=>{
 const paragraph='Fifteen aircraft were lost. Later, three carriers burned.';
 const curated={sections:[{segments:[{text:paragraph,visuals:[]}]}]};
 const plan={fps:30,scenes:[
  {id:'s0b0',frames:90,anchorQuote:'Fifteen aircraft were lost.'},
  {id:'s0b1',frames:90,anchorQuote:'three carriers burned.'},
 ]};
 const scenes=shotSamples(plan,curated);
 assert.deepEqual(scenes.map(s=>s.narration),[paragraph,paragraph]);
 assert.deepEqual(scenes.map(s=>s.spokenMoment),['Fifteen aircraft were lost.','three carriers burned.']);
});

test('verified archive provenance accompanies the shot without treating an unverified claim as evidence',()=>{
 const media={
  s0b0:{provider:'archive',permissionVerified:true,eser:'Yorktown flight deck after Hiryu bomb strike',sahip:'U.S. Navy'},
  s1b0:{provider:'ai',permissionVerified:true,eser:'Imagined clock',sahip:'Generator'},
 };
 const scenes=shotSamples(editPlan,script,media);
 assert.deepEqual(scenes[0].archiveContext,{title:'Yorktown flight deck after Hiryu bomb strike',creator:'U.S. Navy'});
 assert.equal(scenes[0].visualOrigin,'verified-archive');
 assert.equal(scenes[1].archiveContext,null);
 assert.equal(scenes[1].visualOrigin,'ai-reconstruction');
});

test('final-frame provenance follows the media actually selected after sentence alignment',()=>{
 const candidates={
  s0b0:{provider:'archive',permissionVerified:true,eser:'Early launch view',sahip:'NASA'},
  s0b1:{provider:'archive',permissionVerified:true,eser:'Control room at the spoken moment',sahip:'NASA'},
 };
 const selected=renderedShotMedia([{id:'s0b0',media:candidates.s0b1}]);
 const plan={fps:30,scenes:[{id:'s0b0',frames:60,mediaType:'video',sourceId:'control-room'}]};
 const reviewed=shotSamples(plan,{sections:[{segments:[{text:'Controllers read the telemetry.'}]}]},selected);
 assert.equal(reviewed[0].archiveContext.title,'Control room at the spoken moment');
 assert.notEqual(reviewed[0].archiveContext.title,candidates.s0b0.eser);
});

test('every encoded shot receives a visible frame and a model verdict, with bad shots flagged',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-shot-review-'));
 const output=path.join(dir,'output.mp4');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-t','4','-y',output]);
 const report=await buildDirectorShotReview(output,{st:{ffmpegPath:ffmpeg,model:'fixture'},editPlan,script,
  reviewBatch:async batch=>batch.map(x=>({id:x.id,relevance:x.id==='s0b0'?3:0,quality:3,hardMismatch:x.id==='s1b0',textIssue:false,observation:x.id==='s0b0'?'Ship visible.':'Wrong clock.'}))});
 assert.equal(report.scenes.length,2);assert.equal(report.passed,false);assert.equal(report.warnings.length,1);
 assert.equal(report.scenes[0].status,'ok');assert.equal(report.scenes[1].status,'mismatch');
 for(const scene of report.scenes){
  assert.ok(fs.statSync(path.join(dir,scene.frameFile)).size>0);
  assert.deepEqual(scene.reviewFrames.map(frame=>frame.position),['first','middle','last']);
  for(const frame of scene.reviewFrames)assert.ok(fs.statSync(path.join(dir,frame.frameFile)).size>0);
 }
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'director-shot-review.json'),'utf8')).scenes.length,2);
});

test('model failure marks every affected shot unverified instead of clean',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-shot-unverified-'));
 const output=path.join(dir,'output.mp4');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=blue:s=160x90:r=30:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-t','4','-y',output]);
 const report=await buildDirectorShotReview(output,{st:{ffmpegPath:ffmpeg,model:'fixture'},editPlan,script,reviewBatch:async()=>{throw Error('rate limited');}});
 assert.equal(report.passed,false);
 assert.deepEqual(report.scenes.map(x=>x.status),['unverified','unverified']);
 assert.equal(report.warnings.length,2);
});

test('final-frame review switches to smaller OpenAI batches after a transient Anthropic outage',async()=>{
 assert.equal(shouldFallbackOpenAIShotReview(Error('Request timed out.'),{openaiKey:'configured'}),true);
 assert.equal(shouldFallbackOpenAIShotReview(Error('Connection error.'),{openaiKey:'configured'}),true);
 assert.equal(shouldFallbackOpenAIShotReview(Object.assign(Error('rate limited'),{status:429}),{openaiKey:'configured'}),true);
 assert.equal(shouldFallbackOpenAIShotReview(Error('Request timed out.'),{}),false);
 assert.equal(shouldFallbackOpenAIShotReview(Error('invalid source frame'),{openaiKey:'configured'}),false);
 const calls=[];
 const batch=Array.from({length:4},(_,i)=>({id:`s${i}b0`,reviewFrames:[{position:'middle',data:'dummy'}]}));
 const verdicts=await reviewOpenAIInPairs(batch,{openaiKey:'configured',review:async subset=>{
  calls.push(subset.map(s=>s.id));
  return subset.map(s=>({id:s.id,relevance:3,quality:3,hardMismatch:false,textIssue:false,observation:'Visible.'}));
 }});
 assert.deepEqual(calls,[['s0b0','s1b0'],['s2b0','s3b0']]);
 assert.deepEqual(verdicts.map(v=>v.id),batch.map(s=>s.id));
});

test('malformed scores are unverified, and a failed new review replaces stale prior report',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-shot-failed-'));
 fs.writeFileSync(path.join(dir,'director-shot-review.json'),JSON.stringify({passed:true,scenes:[{status:'ok'}]}));
 const failed=failedDirectorShotReview(dir,'Plan and narration no longer match.');
 assert.equal(failed.passed,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'director-shot-review.json'),'utf8')).warnings[0],'Plan and narration no longer match.');
 const output=path.join(dir,'output.mp4');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=c=green:s=160x90:r=30:d=4','-f','lavfi','-i','sine=frequency=440:duration=4','-c:v','libx264','-c:a','aac','-t','4','-y',output]);
 const report=await buildDirectorShotReview(output,{st:{ffmpegPath:ffmpeg,model:'fixture'},editPlan,script,reviewBatch:async batch=>batch.map(x=>({id:x.id,relevance:9,quality:3,hardMismatch:false,textIssue:false,observation:'good'}))});
 assert.deepEqual(report.scenes.map(x=>x.status),['unverified','unverified']);
});

test('a frame extraction failure does not advertise a broken proof image',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-shot-no-frame-'));
 const report=await buildDirectorShotReview(path.join(dir,'missing.mp4'),{st:{ffmpegPath:ffmpeg},editPlan,script});
 assert.deepEqual(report.scenes.map(x=>x.status),['unverified','unverified']);
 assert.deepEqual(report.scenes.map(x=>x.frameFile),[null,null]);
 assert.deepEqual(report.scenes.map(x=>x.reviewFrames),[null,null]);
});

test('only report and numbered proof images can be served as job files',()=>{
 assert.equal(safeJobFileName('director-shot-review.json'),true);
 assert.equal(safeJobFileName('director-shot-0001.jpg'),true);
 assert.equal(safeJobFileName('director-shot-0001-first.jpg'),true);
 assert.equal(safeJobFileName('director-shot-0001-last.jpg'),true);
 assert.equal(safeJobFileName('../director-shot-0001.jpg'),false);
 assert.equal(safeJobFileName('director-shot-anything.jpg'),false);
});

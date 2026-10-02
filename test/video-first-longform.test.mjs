import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-video-first-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;

const policy=await import('../src/pipeline/video-policy.js').catch(()=>({}));
const quality=await import('../src/pipeline/longform-quality.js').catch(()=>({}));
const transitions=await import('../src/pipeline/transitions.js');

test('Normal searches motion for eligible scenes but keeps inherently static material image-first',()=>{
 assert.equal(typeof policy.shouldSearchVideo,'function');
 const normal={mediaKind:'mixed'};
 assert.equal(policy.shouldSearchVideo(normal,{type:'image',kind:'event',query:'Apollo 11 astronauts walking'}),true);
 assert.equal(policy.shouldSearchVideo(normal,{type:'image',kind:'place',query:'Istanbul ferry crossing Bosphorus'}),true);
 for(const visual of [
  {type:'image',kind:'person',query:'Nikola Tesla portrait photograph'},
  {type:'image',kind:'document',query:'Apollo flight plan document'},
  {type:'image',kind:'generic',query:'Mediterranean map diagram'},
 ]) assert.equal(policy.shouldSearchVideo(normal,visual),false,visual.query);
 assert.equal(policy.shouldSearchVideo({mediaKind:'image'},{type:'video',kind:'event',query:'rocket launch'}),false);
});

test('a relevant video near the best still is promoted but motion never defeats relevance',()=>{
 const job={mediaKind:'mixed'},visual={type:'image',kind:'event',query:'Apollo 11 moon walk'};
 const still={id:'still',type:'image',score:120,alaka:.75,onGorsel:3,onKalite:3};
 const goodVideo={id:'good-video',type:'video',score:94,alaka:.7,onGorsel:3,onKalite:2,duration:12,width:1280};
 const badVideo={id:'bad-video',type:'video',score:150,alaka:.1,onGorsel:0,onKalite:3,duration:12,width:1920};
 assert.equal(policy.preferRelevantVideo([still,goodVideo,badVideo],job,visual)[0].id,'good-video');
 assert.equal(policy.preferRelevantVideo([still,badVideo],job,visual)[0].id,'still');
 assert.equal(policy.preferRelevantVideo([still,goodVideo],{mediaKind:'image'},visual)[0].id,'still');
});

test('motion-aware slides follow incoming flow and conflicting video motion dissolves',()=>{
 assert.equal(typeof transitions.motionAwareTransition,'function');
 const slide={tip:'smoothleft',sure:.32};
 assert.equal(transitions.motionAwareTransition(slide,{type:'image'},{type:'video',akis:'saga'},'segment').tip,'smoothright');
 assert.equal(transitions.motionAwareTransition(slide,{type:'image'},{type:'video',akis:'sola'},'segment').tip,'smoothleft');
 assert.equal(transitions.motionAwareTransition(slide,{type:'video',akis:'sola'},{type:'video',akis:'saga'},'segment').tip,'dissolve');
 assert.deepEqual(transitions.motionAwareTransition({tip:'fade',sure:.4},{type:'video',akis:'sola'},{type:'video',akis:'saga'},'section'),{tip:'fade',sure:.4});
});

test('12-minute timeline stays frame-exact and reports duration-weighted motion coverage',()=>{
 assert.equal(typeof quality.measureVisualQuality,'function');
 const beats=Array.from({length:144},(_,i)=>({id:`b${i}`,dur:5,media:{type:i<87?'video':'image',file:`source-${i%140}`,gorsel:3,videoTutarlilik:i<87?3:null}}));
 const plan=transitions.planTransitions(beats.map((b,i)=>({...b,segIndex:i,sectionIndex:Math.floor(i/24),firstOfSection:i%24===0})),{theme:'belgesel',intensity:'sinematik'});
 const layout=transitions.frameLayout(beats,plan,15);
 assert.equal(layout.toplamKare,12*60*15);
 const report=quality.measureVisualQuality(beats,plan);
 assert.equal(report.durationSec,720);assert.ok(report.videoPercent>=60&&report.videoPercent<=61);
 assert.equal(report.repeatedSourceCount,4);assert.equal(report.weakSceneCount,0);
 assert.ok(Object.hasOwn(report.transitions,'hardCut'));
 assert.deepEqual(quality.longformWarnings(report,{mediaKind:'mixed'}),[]);
 const low=quality.measureVisualQuality(beats.map((b,i)=>({...b,media:{...b.media,type:i<30?'video':'image'}})),plan);
 assert.match(quality.longformWarnings(low,{mediaKind:'mixed'})[0],/%45/);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-motion-direction-'));
const policy=await import('../src/pipeline/motion-direction.js').catch(()=>({}));
const editor=await import('../src/pipeline/automatic-editor.js');
const quality=await import('../src/pipeline/longform-quality.js');
const videos=await import('../src/pipeline/video-policy.js');
const job={mediaKind:'director',language:'en',ratio:'16:9'};
const beats=Array.from({length:10},(_,i)=>({id:`s${i}b0`,seg:{text:Array(23).fill('rowing').join(' ')},visual:{kind:'event',query:'ancient wooden ship rowing'}}));
const stills=Object.fromEntries(beats.map(b=>[b.id,{type:'image',file:`${b.id}.jpg`,provider:'ai',gorsel:3,kalite:3,verified:true}]));

test('duration-aware motion preferences are distributed and preserve evidence and user sources',()=>{
 const m=policy.motionBrief(job,beats,stills);
 assert.equal(m.durationSec,100);assert.equal(m.targetPercent,65);
 assert.ok(m.scenes.filter(s=>s.preferMotion).length>=7);
 assert.ok(m.scenes.slice(0,2).some(s=>s.preferMotion));
 const protectedBeats=beats.map(b=>({...b,visual:{...b.visual,kind:'document'}}));
 assert.equal(policy.motionBrief(job,protectedBeats,stills).targetPercent,0);
 const override=Object.fromEntries(beats.map(b=>[b.id,{...stills[b.id],localOverride:true}]));
 assert.equal(policy.motionBrief(job,beats,override).targetPercent,0);
 assert.equal(policy.motionBrief({mediaKind:'image'},beats,stills).enabled,false);
});
test('segment time is shared between its visual slots and generation uses that duration',()=>{
 const seg={text:Array(46).fill('word').join(' '),visuals:[{}, {}, {}]};
 const same=[0,1,2].map(i=>({id:`s0b${i}`,seg,visual:{kind:'event'}}));
 const m=policy.motionBrief(job,same,{});
 assert.ok(Math.abs(m.durationSec-20)<.02);
 assert.ok(m.scenes.every(s=>Math.abs(s.durationSec-20/3)<.02));
});
test('verified stock motion survives a decorative AI still decision; weak video does not',()=>{
 const beat={id:'s0b0',seg:{text:'The crew row across the sea.'},visual:{kind:'event'}};
 const raw={id:beat.id,action:'ai-image',sourceRole:'illustration',anchorQuote:'crew row across the sea',prompt:'An ancient wooden ship with rowers crossing open sea in pale morning light.'};
 const current={type:'video',file:'ship.mp4',gorsel:3,kalite:3,verified:true,videoTutarlilik:3,defects:[]};
 assert.equal(editor.validateDecision(raw,beat,job,current).action,'keep');
 assert.equal(editor.validateDecision(raw,beat,job,{...current,gorsel:1}).action,'ai-image');
});
test('one-minute director output exposes AI still dominance and long static streaks',()=>{
 const timeline=[{dur:45,media:{type:'image',file:'ai.jpg',provider:'ai'}},{dur:15,media:{type:'video',file:'clip.mp4',duration:15}}];
 const r=quality.measureVisualQuality(timeline);
 assert.equal(r.aiStillPercent,75);assert.equal(r.longestStillRunSec,45);
 assert.ok(quality.longformWarnings(r,job).some(w=>/hareketli/.test(w)));
 assert.ok(quality.longformWarnings(r,job).some(w=>/gerçek video yok/.test(w)));
 assert.deepEqual(quality.longformWarnings(r,{mediaKind:'image'}),[]);
});
test('short or frozen sources cannot inflate actual moving coverage',()=>{
 const r=quality.measureVisualQuality([{dur:20,media:{type:'video',file:'short.mp4',duration:5}},{dur:10,media:{type:'video',file:'frozen.mp4',duration:10,motionSatisfied:false}}]);
 assert.equal(r.videoSec,5);assert.ok(r.videoPercent<17);
 const exhausted=quality.measureVisualQuality([{dur:20,media:{type:'video',duration:10,sourceStartFrame:240}},{dur:10,media:{type:'image'}}]);
 assert.equal(exhausted.videoSec,2);assert.equal(exhausted.longestStillRunSec,28);
 const continuation=quality.measureVisualQuality([{dur:6,media:{type:'video',duration:10}},{dur:6,media:{type:'video',duration:10}}],[],{fps:30,sourceTiming:[{sourceStartFrame:0},{sourceStartFrame:180}]});
 assert.equal(continuation.videoSec,10);
 const diagram=quality.measureVisualQuality([{dur:20,media:{type:'video',duration:24,editorial:{settledAt:10.5}}}]);
 assert.equal(diagram.videoSec,10.5);assert.equal(diagram.longestStillRunSec,9.5);
});

test('distinct excerpts of one archival film are not counted as repeated shots',()=>{
 const shots=[0,180,360,0].map(start=>({dur:6,media:{type:'video',file:'navy-archive.webm',duration:120,sourceStartFrame:start}}));
 const report=quality.measureVisualQuality(shots,[],{fps:30});
 assert.equal(report.repeatedSourceCount,1);
});

test('AI clip capacity is limited before generation and unavailable video costs no still-image request',async()=>{
 const b={id:'s0b0',seg:{text:Array(46).fill('row').join(' ')},visual:{kind:'event'}};
 const brief=policy.motionBrief(job,[b],{});
 const assessment=policy.assessMotionPlan(brief,[{id:b.id,action:'ai-video'}],{});
 assert.equal(assessment.videoPercent,50);assert.equal(assessment.needsRepair,true);
 const audit={puan:3,kalite:3,verified:true,videoTutarlilik:3,motionSatisfied:true};
 assert.equal(editor.acceptGenerated({type:'video',duration:10},audit,job,{action:'ai-video',durationSec:20}),false);
 for(const [words,ready] of [[46,true],[12,false]]){
  const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'capacity-'));
  const text=Array(words).fill('rowing').join(' '),script={sections:[{segments:[{text,visuals:[{kind:'event',query:'rowing'}]}]}]};
  let calls=0;
  await assert.rejects(editor.runAutomaticEditor({...job,aiSupportBudgetUsd:20},script,{},dir,{}, {settings:{},plan:async()=>({scenes:[{id:'s0b0',action:'ai-video',sourceRole:'illustration',anchorQuote:text.slice(0,27),prompt:'An ancient crew in wool clothing rows a wooden vessel through rough waves.',motion:'The crew rows together while hull shape and clothing remain stable.'}]}),videoReady:async()=>ready,generate:async()=>{calls++;},review:async()=>audit}),/sahne/);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'editorial-director.json')));
  assert.equal(calls,0);assert.equal(report.estimatedReservedUsd,0);
 }
});

test('actual speech alignment protects a long first shot before generation',async()=>{
 const {directorShotDurations}=await import('../src/pipeline/director-timing.js');
 const text='The first scene takes more time. The second changes. The third ends.';
 const script={sections:[{segments:[{text,visuals:[{query:'first'},{query:'second'},{query:'third'}]}]}]};
 const durations=directorShotDurations(script,[{duration:20,words:[]}]);
 assert.ok(durations.s0b0>10); // Legacy opening card share and real closing tail included.
 assert.ok(durations.s0b1<durations.s0b0);
});

test('visual slots removed by speech timing cannot trigger paid generation or block output',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'unused-')),file=path.join(dir,'source.jpg');fs.writeFileSync(file,'fixture');
 const text='The ancient rowers approach the island.';
 const script={sections:[{segments:[{text,visuals:[{kind:'event',query:'rowers'},{kind:'event',query:'island'}]}]}]};
 const media={s0b0:{file,type:'image',gorsel:3,kalite:3,verified:true}};let calls=0;
 const result=await editor.runAutomaticEditor(job,script,media,dir,{tts:[{duration:2,words:[]}]},{settings:{},
  plan:async()=>({scenes:[{id:'s0b0',action:'keep'},{id:'s0b1',action:'ai-video',sourceRole:'illustration',anchorQuote:'rowers approach the island',prompt:'An ancient wooden ship approaches a rocky island in calm blue waters.',motion:'Oars move in unison and the ship crosses waves; hull geometry remains unchanged.'}]}),
  videoReady:async()=>false,generate:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(result.estimatedReservedUsd,0);assert.deepEqual(result.unresolved,[]);
});

test('native explanatory motion is audited as illustration, never mislabeled archival evidence',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'provenance-')),file=path.join(dir,'map.mp4');fs.writeFileSync(file,'fixture');
 let role;
 await editor.preauditExistingMedia([{id:'s0b0',seg:{text:'Troops turn inward.'},visual:{query:'turning units'}}],{s0b0:{file,type:'video',provider:'native-animation'}},dir,{settings:{},job,isCancelled:()=>false},async(_m,spec)=>{role=spec.sourceRole;return{verified:true,puan:3,kalite:3};});
 assert.equal(role,'illustration');
});
test('acting people can use clips, portrait documents stay still and rejected footage is not promoted',()=>{
 assert.equal(videos.shouldSearchVideo(job,{type:'image',kind:'person',query:'astronaut walking on moon'}),true);
 assert.equal(videos.shouldSearchVideo(job,{type:'image',kind:'person',query:'astronaut portrait photograph'}),false);
 const still={type:'image',score:120},bad={type:'video',score:130,onGorsel:3,onKalite:3,hardMismatch:true};
 assert.equal(videos.preferRelevantVideo([still,bad],job,{kind:'event'})[0],still);
});

test('standard director replans a still-only story before paid generation, keeps durations and resumes free',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'plan-'));
 const file=path.join(dir,'source.jpg');fs.writeFileSync(file,'fixture pixels');
 const text='The ancient crew row together through rolling waves as their wooden ship approaches the distant island under a pale and cloudy morning sky.';
 const script={title:'The crossing',sections:[{title:'At sea',segments:Array.from({length:10},()=>({text,visuals:[{kind:'event',type:'image',query:'ancient crew rowing wooden ship'}]}))}]};
 const media=Object.fromEntries(beats.map(b=>[b.id,{type:'image',file,provider:'ai',editorial:{sourceRole:'illustration'}}]));
 let requests=0,generated=0;
 const request=async p=>{
  requests++;
  const input=JSON.parse(p.messages[0].content),repair=!!input.motionDirection.repair;
  assert.equal(input.motionDirection.targetPercent,65);
  const result={styleBible:'Ancient wooden vessel and wool clothing.',sections:[{index:0,mood:'tension',reason:'Dangerous crossing.'}],scenes:input.scenes.map(s=>({id:s.id,action:repair?'ai-video':'keep',reason:'Show the synchronized rowing and water crossing.',anchorQuote:'The ancient crew row together through rolling waves',sourceRole:'illustration',prompt:'An ancient wooden ship with wool-clad sailors rowing together through rough open water in cloudy morning light.',motion:'The rowers move their oars in unison and waves pass the hull; ship geometry, faces and clothing stay unchanged.',camera:'hold',purpose:'reconstruction',overlay:null,reusePurpose:null}))};
  return {model:'fixture',stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(result)}],usage:{input_tokens:1,output_tokens:1}};
 };
 const audit={puan:3,kalite:3,verified:true,videoTutarlilik:3,defects:[],motionSatisfied:true};
 const deps={settings:{model:'fixture'},audit:async()=>audit,review:async()=>audit,generate:async decision=>{
  generated++;assert.equal(decision.durationSec,10); // Real narration estimate, never hardcoded six.
  return {file,type:'video',duration:decision.durationSec,provider:'ai'};
 }};
 const j={...job,aiSupportBudgetUsd:20};
 const result=await editor.runAutomaticEditor(j,script,media,dir,{request},deps);
 // Two planning batches, one motion repair, and one repeat repair: every scene
 // showed the same photograph, so the remaining keeps were repeats (reuse-guard.js).
 assert.equal(requests,4);assert.equal(generated,9);assert.ok(result.motion.videoPercent>=65);
 await editor.runAutomaticEditor(j,script,media,dir,{request},deps);
 assert.equal(requests,4);assert.equal(generated,9);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-test-'));
const {runAutomaticEditor,validateDecision,acceptGenerated}=await import('../src/pipeline/automatic-editor.js');
const text='The storage tank held 2.3 million US gallons of molasses above the streets of Boston.';
const script={title:'The flood',sections:[{title:'The tank',segments:[{text,visuals:[{query:'Boston molasses storage tank 1919',type:'image',kind:'object'}]}]}]};
const beat={id:'s0b0',seg:{text},visual:script.sections[0].segments[0].visuals[0]};
const decision=(patch={})=>({id:'s0b0',action:'ai-image',sourceRole:'illustration',purpose:'explanation',reason:'Show the physical tank and its scale.',anchorQuote:'tank held 2.3 million US gallons of molasses',prompt:'A cinematic, physically detailed 1919 steel molasses storage tank above the Boston waterfront, riveted steel, natural light, recognizable industrial scale.',camera:'hold',motion:'',overlay:{value:'2.3 MILLION US GALLONS',label:'MOLASSES',anchorQuote:'2.3 million US gallons of molasses',position:'left'},...patch});
const job=()=>({mediaKind:'director',aiSupport:'auto',aiSupportBudgetUsd:10,theme:'belgesel',ratio:'16:9'});
const audit=(patch={})=>({puan:3,kalite:3,videoTutarlilik:3,verified:true,defects:[],yer:'dogru',...patch});
function fixture(){const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'scene-')),file=path.join(dir,'tank.jpg');fs.writeFileSync(file,'test image bytes');return {dir,file,media:{s0b0:{file,type:'image',provider:'pexels',gorsel:2,kalite:3,verified:true}}};}

test('Director does not keep merely generic stock or accept missing unverified scene decisions',()=>{
 const {media}=fixture();
 assert.equal(validateDecision({id:'s0b0',action:'keep'},beat,job(),media.s0b0).action,'defer');
 assert.equal(validateDecision(null,beat,job(),{...media.s0b0,gorsel:3}).action,'defer');
 assert.equal(validateDecision({id:'s0b0',action:'keep'},beat,job(),{...media.s0b0,gorsel:3,motionSatisfied:false,editorial:{requiredMotion:'Molasses pours through the street.'}}).action,'defer');
 const d=validateDecision(decision(),beat,job(),media.s0b0);assert.equal(d.overlay.value,'2.3 MILLION US GALLONS');
 assert.equal(validateDecision(decision({action:'ai-video',motion:''}),beat,job(),media.s0b0).action,'defer');
});

test('an explicitly chosen stock shot is kept only after the Director quality audit',()=>{
 const {media}=fixture();
 const good={...media.s0b0,manualChoice:true,gorsel:3,kalite:3,videoTutarlilik:3,verified:true,defects:[],yer:'dogru'};
 assert.equal(validateDecision(decision({action:'ai-image'}),beat,job(),good).action,'keep');
 assert.equal(validateDecision(decision({action:'ai-image'}),beat,job(),{...good,gorsel:1}).action,'defer');
});
test('Director records archival footage as evidence and generic stock as illustration',async()=>{
 for(const [provider,expected] of [['archive','evidence'],['pexels','illustration']]){
  const {dir,media}=fixture();media.s0b0.provider=provider;media.s0b0.gorsel=3;
  const deps={settings:{},audit:async()=>audit(),plan:async()=>({styleBible:'',sections:[],scenes:[decision({action:'keep',sourceRole:'evidence',overlay:null})]})};
  await runAutomaticEditor(job(),script,media,dir,{},deps);
  assert.equal(media.s0b0.editorial.sourceRole,expected);
 }
});
test('Director quality acceptance requires verified coherent media and requested motion',()=>{
 assert.equal(acceptGenerated({type:'image'},audit({verified:false}),job(),decision()),false);
 assert.equal(acceptGenerated({type:'image'},audit({puan:2}),job(),decision()),false);
 assert.equal(acceptGenerated({type:'image'},audit({kalite:2}),job(),decision()),false);
 assert.equal(acceptGenerated({type:'image'},audit(),job(),decision({action:'ai-video'})),false);
 assert.equal(acceptGenerated({type:'video'},audit({videoTutarlilik:1}),job(),decision({action:'ai-video'})),false);
 assert.equal(acceptGenerated({type:'video'},audit({motionSatisfied:false}),job(),decision({action:'ai-video'})),false);
 assert.equal(acceptGenerated({type:'video'},audit(),job(),decision({action:'ai-video'})),false);
 assert.equal(acceptGenerated({type:'video'},audit({motionSatisfied:true}),job(),decision({action:'ai-video'})),true);
 assert.equal(acceptGenerated({type:'image'},audit(),job(),decision()),true);
});
test('Director runs ordinary automatic pipeline, persists composition and reuses paid results',async()=>{
 const {dir,file,media}=fixture();let calls=0,prompt='';const j=job();
 const deps={settings:{},plan:async()=>({scenes:[decision()],sections:[{index:0,mood:'tension'}],styleBible:'Cinematic 1919 industrial Boston.'}),generate:async d=>{calls++;prompt=d.fullPrompt;return {file,type:'image'};},review:async()=>audit()};
 const report=await runAutomaticEditor(j,script,media,dir,{},deps);
 assert.equal(report.enabled,true);assert.equal(report.complete,true);assert.equal(report.policyVersion,(await import('../src/pipeline/director-policy.js')).DIRECTOR_POLICY_VERSION);
 assert.equal(media.s0b0.editorial.overlay.value,'2.3 MILLION US GALLONS');assert.match(prompt,/negative space/i);
 await runAutomaticEditor(j,script,media,dir,{},deps);assert.equal(calls,1);
 assert.equal(media.s0b0.editorial.overlay.label,'MOLASSES');
});
test('required replacement failure cannot silently fall back to generic usable stock; zero budget is honored',async()=>{
 for(const budget of [0,10]){
  const {dir,file,media}=fixture();let calls=0;const j={...job(),aiSupportBudgetUsd:budget};
  const deps={settings:{},plan:async()=>({scenes:[decision()],sections:[],styleBible:''}),generate:async()=>{calls++;return {file,type:'image'};},review:async()=>audit({puan:0})};
  await assert.rejects(runAutomaticEditor(j,script,media,dir,{},deps),/sahne/);
  await assert.rejects(runAutomaticEditor(j,script,media,dir,{},deps),/sahne/);
  assert.equal(calls,budget?2:0);
 }
});
test('an uncertain Director provider call is reserved once and blocks the unsuitable scene across resume',async()=>{
 const {dir,media}=fixture();let calls=0;const deps={settings:{},plan:async()=>({scenes:[decision()],sections:[],styleBible:''}),generate:async()=>{calls++;throw Error('timeout');}};
 await assert.rejects(runAutomaticEditor(job(),script,media,dir,{},deps),/sahne/);
 await assert.rejects(runAutomaticEditor(job(),script,media,dir,{},deps),/sahne/);
 assert.equal(calls,1);
 const ledger=JSON.parse(fs.readFileSync(path.join(dir,'automatic-editor/generation-ledger.json'),'utf8'));assert.equal(ledger.estimatedReservedUsd,.08);
});

test('regular script requests use Director scene rules without forcing every number into a graphic',async()=>{
 const {runSections}=await import('../src/pipeline/script.js');const {newJobFromRequest}=await import('../src/pipeline/index.js');
 for(const mode of ['director','mixed']){
  const j={...newJobFromRequest({topic:'The molasses flood',mediaKind:mode,duration:'1',language:'en',visualStyle:'editorial'}),demo:false};let request;
  await assert.rejects(runSections(j,'Research facts',{title:'The flood',sections:[{title:'The tank',goal:'Explain scale',covers:['storage tank'],devredilen:[],rol:'kanca'}]}, {},()=>{},()=>false,{requestJSON:async value=>{request=value;throw Error('PROMPT_CAPTURE');}}),/PROMPT_CAPTURE/);
  if(mode==='director'){
   assert.match(request.system,/AI DIRECTOR POLICY/);assert.match(request.user,/AI Yönetmen/);
   assert.doesNotMatch(request.user,/bu videoda AI üretimi kapalı|ZORUNLU: metinde çarpıcı bir SAYI geçen HER segment/);
  }else assert.doesNotMatch(request.system,/AI DIRECTOR POLICY/);
 }
});

test('required movement reaches the real five-frame vision audit and a static MP4 is rejected',async()=>{
 const {execFileSync}=await import('node:child_process'),ff=(await import('ffmpeg-static')).default,probe=(await import('ffprobe-static')).default;
 const {dir,media}=fixture(),file=path.join(dir,'static.mp4');execFileSync(ff,['-v','error','-f','lavfi','-i','color=blue:s=320x180:r=30:d=3','-c:v','libx264','-y',file]);
 let visionCalls=0;const motion='Molasses pours from the broken steel tank and flows through the street; buildings remain rigid.';
 const request=async params=>{
  visionCalls++;const prompt=params.messages[0].content.filter(b=>b.type==='text').map(b=>b.text).join('\n');assert.ok(prompt.includes(motion));assert.match(prompt,/motionSatisfied/);
  return {content:[{type:'text',text:JSON.stringify({puan:3,kalite:3,continuity:3,hardMismatch:false,defects:[],observation:'No visible flow across the five frames.',kadraj:'nesne',odak:'orta',flow:'sabit',yer:'dogru',motionSatisfied:false})}],usage:{input_tokens:1,output_tokens:1}};
 };
 const deps={settings:{model:'fixture',ffmpegPath:ff,ffprobePath:probe.path},plan:async()=>({styleBible:'',sections:[],scenes:[decision({action:'ai-video',motion})]}),generate:async()=>({file,type:'video'})};
 await assert.rejects(runAutomaticEditor(job(),script,media,dir,{request},deps),/sahne/);assert.equal(visionCalls,2);
});

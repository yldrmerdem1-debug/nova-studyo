import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-auto-editor-'));
const api=await import('../src/pipeline/automatic-editor.js').catch(()=>({}));
const {aiAllowance}=await import('../public/production-modes.js');
const {newJobFromRequest}=await import('../src/pipeline/index.js');
const text='A wooden ship crosses the rough sea while the crew row toward the island.';
const script=()=>({title:'A sea journey',sections:[{title:'Leaving home',segments:[{text,visuals:[{query:'wooden ship rowing at sea',kind:'generic',type:'image'}]}]}]});
const decision=(patch={})=>({id:'s0b0',action:'ai-video',reason:'Motion explains rowing across rough water.',anchorQuote:'ship crosses the rough sea',prompt:'A wooden ancient ship crosses rough water, sailors rowing in unison, wool clothing and bronze-age equipment, wide side view, subdued daylight.',motion:'Sailors row in unison; waves pass the hull. Camera tracks alongside.',camera:'hold',sourceRole:'illustration',...patch});
const weak=()=>({'s0b0':{file:'wrong.jpg',type:'image',gorsel:0,kalite:3,provider:'pexels'}});

test('automatic support is explicit and independent of legacy scene count',()=>{
 const j=newJobFromRequest({topic:'Sea journey',mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:12,aiButce:0});
 assert.equal(j.aiSupport,'auto');assert.equal(j.aiSupportBudgetUsd,12);assert.equal(aiAllowance(j),0);
 assert.throws(()=>newJobFromRequest({topic:'x',aiSupport:'invalid'}),/AI/);
 assert.throws(()=>newJobFromRequest({topic:'x',aiSupport:'auto',aiSupportBudgetUsd:-1}),/AI/);
});
test('director validates exact narration anchors and preserves evidence/image-only choices',()=>{
 assert.equal(typeof api.validateDecision,'function');
 const beat={id:'s0b0',seg:{text},visual:{kind:'generic',query:'wooden ship'}};
 assert.equal(api.validateDecision(decision(),beat,{mediaKind:'mixed'},weak().s0b0).action,'ai-video');
 assert.equal(api.validateDecision(decision(),beat,{mediaKind:'image'},weak().s0b0).action,'keep');
 assert.equal(api.validateDecision(decision({anchorQuote:'Napoleon wins at sea'}),beat,{mediaKind:'mixed'},weak().s0b0).action,'defer');
 assert.equal(api.validateDecision(decision(),{...beat,visual:{kind:'document'}},{mediaKind:'mixed'},weak().s0b0).action,'defer');
 assert.equal(api.validateDecision(decision(),beat,{mediaKind:'mixed'},{...weak().s0b0,localOverride:true}).action,'keep');
});
test('generated output must pass relevance, quality and full video continuity',()=>{
 assert.equal(typeof api.acceptGenerated,'function');
 assert.equal(api.acceptGenerated({type:'video'},{puan:3,kalite:3,videoTutarlilik:1}),false);
 assert.equal(api.acceptGenerated({type:'image'},{puan:3,kalite:1}),false);
 assert.equal(api.acceptGenerated({type:'image'},undefined),false);
 assert.equal(api.acceptGenerated({type:'image'},{puan:3,kalite:3,yer:'baska'}),false);
 assert.equal(api.acceptGenerated({type:'video'},{puan:3,kalite:2,videoTutarlilik:3}),true);
});
test('successful assistance is cached and paid generation is not repeated on resume',async()=>{
 assert.equal(typeof api.runAutomaticEditor,'function');
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'success-'));const file=path.join(dir,'ok.jpg');fs.writeFileSync(file,Buffer.alloc(2000));
 let calls=0;const media=weak();const job={mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:10,theme:'belgesel'};
 const deps={plan:async()=>({styleBible:'Muted daylight, bronze-age maritime world.',scenes:[decision()],sections:[]}),generate:async()=>{calls++;return {file,type:'video',duration:6,provider:'ai'};},review:async()=>({puan:3,kalite:3,videoTutarlilik:3}),settings:{imageProvider:'kie',kieImageModel:'test',videoProvider:'kie',kieVideoModel:'test'}};
 await api.runAutomaticEditor(job,script(),media,dir,{},deps);await api.runAutomaticEditor(job,script(),media,dir,{},deps);
 assert.equal(calls,1);assert.equal(media.s0b0.provider,'ai');assert.equal(media.s0b0.editorial.anchorQuote,'ship crosses the rough sea');
});
test('rejected generation is retried once with feedback, then blocks rather than accepting wrong media',async()=>{
 assert.equal(typeof api.runAutomaticEditor,'function');
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'reject-'));const file=path.join(dir,'bad.jpg');fs.writeFileSync(file,Buffer.alloc(2000));let calls=0;
 const deps={plan:async()=>({styleBible:'',scenes:[decision()],sections:[]}),generate:async()=>{calls++;return {file,type:'image',provider:'ai'};},review:async()=>({puan:0,kalite:3,gorunen:'Modern car, unrelated.'}),settings:{}};
 await assert.rejects(api.runAutomaticEditor({mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:10},script(),weak(),dir,{},deps),/sahne/);
 assert.equal(calls,2);
 await assert.rejects(api.runAutomaticEditor({mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:10},script(),weak(),dir,{},deps),/sahne/);
 assert.equal(calls,2);
});
test('budget exhaustion prevents generation and uncertain paid calls are not retried',async()=>{
 assert.equal(typeof api.runAutomaticEditor,'function');
 for(const budget of [0,10]){
  const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'budget-'));let calls=0;
  const deps={plan:async()=>({styleBible:'',scenes:[decision()],sections:[]}),generate:async()=>{calls++;throw Error('timeout');},review:async()=>({puan:3,kalite:3}),settings:{}};
  const job={mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:budget};
  await assert.rejects(api.runAutomaticEditor(job,script(),weak(),dir,{},deps),/sahne/);
  await assert.rejects(api.runAutomaticEditor(job,script(),weak(),dir,{},deps),/sahne/);
  assert.equal(calls,budget?1:0);
 }
});

test('existing source preaudit caches by pixels narration model and audit version',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'preaudit-')),file=path.join(dir,'source.jpg');fs.writeFileSync(file,'first pixels');
 const beats=[{id:'s0b0',seg:{text:'First narration'},visual:{query:'ship',kind:'generic'}}],media={s0b0:{file,type:'image',provider:'pexels'}};
 let calls=0;const audit=async()=>{calls++;return {puan:2,kalite:3,videoTutarlilik:3,yer:'dogru',gorunen:'ship',kadraj:'nesne',odak:'orta',akis:'sabit',defects:[],verified:true};};
 const context={settings:{model:'premium'},usage:null,logFn:()=>{},isCancelled:()=>false};
 await api.preauditExistingMedia(beats,media,dir,context,audit);await api.preauditExistingMedia(beats,media,dir,context,audit);
 assert.equal(calls,1);assert.equal(media.s0b0.gorsel,2);
 fs.writeFileSync(file,'changed pixels');await api.preauditExistingMedia(beats,media,dir,context,audit);assert.equal(calls,2);
 beats[0].seg.text='Changed narration';await api.preauditExistingMedia(beats,media,dir,context,audit);assert.equal(calls,3);
 context.settings.model='another-premium';await api.preauditExistingMedia(beats,media,dir,context,audit);assert.equal(calls,4);
});

test('resume reaudits an already generated pending candidate without generating or reserving again',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'pending-')),file=path.join(dir,'candidate.jpg');fs.writeFileSync(file,Buffer.alloc(2000));
 let generated=0,reviews=0;const deps={plan:async()=>({styleBible:'',scenes:[decision({action:'ai-image'})],sections:[]}),generate:async()=>{generated++;return {file,type:'image',provider:'ai'};},review:async()=>{reviews++;if(reviews===1)throw Error('temporary audit outage');return {puan:3,kalite:3,videoTutarlilik:3,yer:'dogru',gorunen:'ancient ship',kadraj:'nesne',odak:'orta',akis:'sabit'};},settings:{model:'premium'}};
 const job={mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:10},media=weak();
 await assert.rejects(api.runAutomaticEditor(job,script(),media,dir,{},deps),/sahne/);
 await api.runAutomaticEditor(job,script(),media,dir,{},deps);
 assert.equal(generated,1);assert.equal(reviews,2);assert.equal(media.s0b0.provider,'ai');
 const journal=JSON.parse(fs.readFileSync(fs.readdirSync(path.join(dir,'automatic-editor')).map(n=>path.join(dir,'automatic-editor',n)).find(n=>path.basename(n).startsWith('journal-')),'utf8'));
 assert.equal(journal.estimatedReservedUsd,.08);
});

test('accepted journal media is reaudited when its file pixels change',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'identity-')),file=path.join(dir,'candidate.jpg');fs.writeFileSync(file,Buffer.alloc(2000,1));
 let generated=0,reviews=0;const deps={plan:async()=>({styleBible:'',scenes:[decision({action:'ai-image'})],sections:[]}),generate:async()=>{generated++;return {file,type:'image',provider:'ai'};},review:async()=>{reviews++;return {puan:3,kalite:3,videoTutarlilik:3,yer:'dogru',gorunen:'ship',kadraj:'nesne',odak:'orta',akis:'sabit'};},settings:{model:'premium'}};
 const job={mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:10},media=weak();await api.runAutomaticEditor(job,script(),media,dir,{},deps);
 fs.writeFileSync(file,Buffer.alloc(2000,2));await api.runAutomaticEditor(job,script(),media,dir,{},deps);
 assert.equal(generated,1);assert.equal(reviews,2);
});

test('default generated review uses the strict pixel auditor with the configured quality model',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'strict-review-')),file=path.join(dir,'candidate.png');
 execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=blue:s=320x180','-frames:v','1','-y',file]);
 let model,images=0;const request=async(params,_log,chosen)=>{model=chosen;images=params.messages[0].content.filter(b=>b.type==='image').length;return {content:[{type:'text',text:JSON.stringify({puan:3,kalite:3,continuity:3,hardMismatch:false,defects:[],observation:'ancient ship at sea',kadraj:'nesne',odak:'orta',flow:'sabit',yer:'dogru'})}],usage:{input_tokens:1,output_tokens:1}};};
 const deps={plan:async()=>({styleBible:'',scenes:[decision({action:'ai-image'})],sections:[]}),generate:async()=>({file,type:'image',provider:'ai'}),settings:{model:'quality-model',ffmpegPath:ffmpeg,ffprobePath:ffprobe.path}};
 const media=weak();await api.runAutomaticEditor({mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:10},script(),media,dir,{request},deps);
 assert.equal(model,'quality-model');assert.equal(images,1);assert.equal(media.s0b0.verified,true);
});

test('job-wide ledger keeps reservations and uncertain attempts across script signatures',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'ledger-'));let generated=0;
 const first=script(),second=script();second.title='A revised sea journey';second.sections[0].segments.push({text:'The island appears beyond the fog.',visuals:[{query:'island beyond fog',kind:'generic',type:'image'}]});
 const secondDecision={...decision(),id:'s0b1',action:'ai-image',anchorQuote:'island appears beyond the fog',prompt:'A distant rocky island appears beyond pale sea fog, viewed from an ancient wooden vessel, subdued natural daylight, historically neutral composition.'};
 let planRun=0;const deps={plan:async(_job,_script)=>({styleBible:'',sections:[],scenes:planRun++?[decision({reason:'Reworded director rationale.'}),secondDecision]:[decision()]}),generate:async()=>{generated++;throw Error('provider timeout');},review:async()=>({puan:3,kalite:3}),settings:{model:'premium'}};
 const job={mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:.08};
 deps.plan=async(_job,_script)=>({styleBible:'',sections:[],scenes:planRun++?[decision({action:'ai-image',reason:'Reworded director rationale.'}),secondDecision]:[decision({action:'ai-image'})]});
 await assert.rejects(api.runAutomaticEditor(job,first,weak(),dir,{},deps),/sahne/);
 await assert.rejects(api.runAutomaticEditor(job,second,{...weak(),s0b1:{file:'wrong2.jpg',type:'image',gorsel:0,kalite:3,provider:'pexels'}},dir,{},deps),/sahne/);
 assert.equal(generated,1);
 const ledger=JSON.parse(fs.readFileSync(path.join(dir,'automatic-editor','generation-ledger.json'),'utf8'));
 assert.equal(ledger.estimatedReservedUsd,.08);assert.equal(Object.keys(ledger.entries).length,1);
});

test('aspect ratio participates in the creative plan signature',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'ratio-signature-'));let plans=0;
 const deps={plan:async()=>{plans++;return {styleBible:'',sections:[],scenes:[decision({action:'defer'})]};},settings:{model:'premium'}};
 const base={mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:0};
 await assert.rejects(api.runAutomaticEditor({...base,ratio:'16:9'},script(),weak(),dir,{},deps),/sahne/);
 await assert.rejects(api.runAutomaticEditor({...base,ratio:'9:16'},script(),weak(),dir,{},deps),/sahne/);
 assert.equal(plans,2);
});

test('preaudit honors illustration provenance and the visual anchor quote',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'preaudit-role-')),file=path.join(dir,'ai.jpg');fs.writeFileSync(file,'generated pixels');
 const beats=[{id:'s0b0',seg:{text},visual:{query:'ship',kind:'generic',anchorQuote:'ship crosses the rough sea'}}],media={s0b0:{file,type:'image',provider:'ai',editorial:{role:'illustration'}}};let spec;
 await api.preauditExistingMedia(beats,media,dir,{job:{theme:'myth'},settings:{model:'premium'},logFn:()=>{},isCancelled:()=>false},async(_media,value)=>{spec=value;return {puan:3,kalite:3,videoTutarlilik:3,yer:'dogru',gorunen:'ship',kadraj:'nesne',odak:'orta',akis:'sabit',defects:[],verified:true};});
 assert.equal(spec.sourceRole,'illustration');assert.equal(spec.anchorQuote,'ship crosses the rough sea');
});

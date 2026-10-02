import fs from 'node:fs';
import path from 'node:path';
process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {getSettings}=await import('../src/config.js');
const {runAutomaticEditor}=await import('../src/pipeline/automatic-editor.js');
const {renderAll}=await import('../src/pipeline/render.js');
const settings=getSettings(),dir=path.join(process.env.NOVA_HOME,'quality-review/editor-upgrade-1.4/live-rehearsal');
fs.mkdirSync(dir,{recursive:true});
const old=path.join(process.env.NOVA_HOME,'data/jobs/20260908-e2a29e');
const original=JSON.parse(fs.readFileSync(path.join(old,'script.json')));
const seg=structuredClone(original.sections.flatMap(s=>s.segments)[8]);
seg.visuals=[{query:'Polyphemus cave Odysseus ancient Greek myth',type:'image',kind:'event'},{query:'Odysseus wine Nobody Cyclops cave',type:'image',kind:'event'}];
const script={title:'Odysseus: The Cave of Polyphemus',sections:[{title:'A Trap in the Cave',segments:[seg]}]};
const media=JSON.parse(fs.existsSync(path.join(dir,'media.json'))?fs.readFileSync(path.join(dir,'media.json')):'{}');
const tts=[{...JSON.parse(fs.readFileSync(path.join(old,'tts.json'))).find(t=>t.segId==='s8'),segId:'s0'}];
const job={id:'automatic-live-rehearsal',topic:script.title,theme:'belgesel',language:'en',ratio:'16:9',visualStyle:'editorial',mediaKind:'mixed',aiSupport:'auto',aiSupportBudgetUsd:15,subtitleMode:'classic',transitions:'sinematik',musicVolume:.12,soundDesign:true,settingsSnapshot:{...settings,crf:20,preset:'fast',fps:30,concurrency:2}};
const usage={model:settings.model,modelRates:settings.modelRates,budgetUsd:0};
const killer={cancelled:false,add(){},remove(){},delete(){}};
const log=m=>console.log(String(m));
try{
 const report=await runAutomaticEditor(job,script,media,dir,{usage,logFn:log,isCancelled:()=>false,killer});
 fs.writeFileSync(path.join(dir,'script.json'),JSON.stringify(script,null,2));
 const result=await renderAll(job,script,media,tts,dir,log,()=>{},killer);
 fs.writeFileSync(path.join(dir,'live-result.json'),JSON.stringify({report,result,usage},null,2));
 console.log(JSON.stringify({ok:true,output:path.join(dir,'output.mp4'),duration:result.durationSec,decisions:report.decisions.map(d=>({id:d.id,action:d.action})),warnings:result.qualityWarnings}));
}catch(e){fs.writeFileSync(path.join(dir,'live-failure.json'),JSON.stringify({message:e.message,usage},null,2));console.error(e.message);process.exitCode=1;}

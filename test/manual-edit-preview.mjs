import fs from 'node:fs';import path from 'node:path';
process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {seedBundledResources}=await import('../electron/seed-resources.js');
console.log(seedBundledResources(process.cwd(),process.env.NOVA_HOME));
const {getSettings}=await import('../src/config.js');const {renderAll}=await import('../src/pipeline/render.js');
const old=path.join(process.env.NOVA_HOME,'data/jobs/20260908-e2a29e'),dir=path.join(process.env.NOVA_HOME,'quality-review/editor-upgrade-1.4/edit-preview');fs.mkdirSync(dir,{recursive:true});
const scriptOld=JSON.parse(fs.readFileSync(path.join(old,'script.json'))),mediaOld=JSON.parse(fs.readFileSync(path.join(old,'media.json'))),ttsOld=JSON.parse(fs.readFileSync(path.join(old,'tts.json')));
const indexes=[8,9],segs=scriptOld.sections.flatMap(s=>s.segments),media={};
const script={title:'The Trap and the Escape',sections:[{title:'The Cave of Polyphemus',segments:indexes.map(i=>segs[i])}]};
const tts=indexes.map((i,n)=>({...ttsOld.find(t=>t.segId===`s${i}`),segId:`s${n}`}));
indexes.forEach((i,n)=>segs[i].visuals.forEach((v,b)=>{media[`s${n}b${b}`]={...mediaOld[`s${i}b${b}`]};}));
const direction=JSON.parse(fs.readFileSync(path.join(process.env.NOVA_HOME,'quality-review/editor-upgrade-1.4/live-rehearsal/editorial-director.json')));
const settings=getSettings();const job={id:'editor-upgrade-preview',theme:'belgesel',language:'en',ratio:'16:9',visualStyle:'editorial',mediaKind:'mixed',subtitleMode:'classic',transitions:'sinematik',musicVolume:.12,soundDesign:true,editorialPlan:{sections:direction.sections,warnings:[]},settingsSnapshot:{...settings,crf:20,preset:'fast',fps:30,concurrency:2}};
const result=await renderAll(job,script,media,tts,dir,console.log,()=>{},{cancelled:false,add(){},remove(){},delete(){}});
fs.writeFileSync(path.join(dir,'preview-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output:path.join(dir,'output.mp4'),duration:result.durationSec,warnings:result.qualityWarnings}));


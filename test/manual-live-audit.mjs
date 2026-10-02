import fs from 'node:fs';
process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {getSettings}=await import('../src/config.js');const {auditEditorialMedia}=await import('../src/pipeline/editorial-audit.js');const {ProcKiller}=await import('../src/util.js');
const settings=getSettings(),usage={model:settings.model,modelRates:settings.modelRates,budgetUsd:0};
const file=process.env.NOVA_HOME+'/data/jobs/20260908-e2a29e/media/curated/cyclops.png';
try{const result=await auditEditorialMedia({type:'image',file},{narration:'Polyphemus, a one-eyed son of Poseidon, traps the landing party behind a boulder they cannot move.',anchorQuote:'a one-eyed son of Poseidon',prompt:'Polyphemus must have exactly one eye, not two eyes. Greek myth reconstruction, Odysseus in a cave.',sourceRole:'illustration',theme:'belgesel'},{settings,usage,killer:new ProcKiller(),isCancelled:()=>false});fs.writeFileSync(process.env.NOVA_HOME+'/quality-review/editor-upgrade-1.4/live-audit.json',JSON.stringify({result,usage},null,2));console.log(JSON.stringify(result));}catch(e){console.error(e.message);process.exitCode=1;}

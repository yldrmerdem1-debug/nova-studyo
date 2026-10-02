import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {callVisionJSON} from '../llm.js';
import {ffprobeDuration,run} from '../util.js';

const KADRAJ=new Set(['yuz','manzara','belge','nesne','kalabalik']);
const ODAK=new Set(['sol','orta','sag']);
const AKIS=new Set(['sola','saga','yaklas','uzaklas','sabit','karisik','bilinmiyor']);
const YER=new Set(['dogru','belirsiz','baska','yok']);
export const EDITORIAL_AUDIT_VERSION=4;

const SCHEMA={type:'object',additionalProperties:false,properties:{
 puan:{type:'integer',minimum:0,maximum:3},
 kalite:{type:'integer',minimum:0,maximum:3},
 continuity:{type:'integer',minimum:0,maximum:3},
 hardMismatch:{type:'boolean'},
 defects:{type:'array',items:{type:'string'}},
 observation:{type:'string',minLength:1},
 kadraj:{type:'string',enum:[...KADRAJ]},
 odak:{type:'string',enum:[...ODAK]},
 flow:{type:'string',enum:[...AKIS]},
 yer:{type:'string',enum:[...YER]},
},required:['puan','kalite','continuity','hardMismatch','defects','observation','kadraj','odak','flow','yer']};

function cancelled(killer,isCancelled){return killer?.cancelled||isCancelled?.();}
function assertActive(killer,isCancelled){if(cancelled(killer,isCancelled))throw new Error('cancelled');}
const abortSignal=killer=>typeof killer?.signal==='function'?killer.signal():killer?.signal;

export function editorialVideoSampleTimes(durationSec){
 const duration=Number(durationSec);
 if(!Number.isFinite(duration)||duration<=0)throw new Error('Video süresi ölçülemedi');
 const pad=Math.min(.25,duration*.02);
 return [pad,duration*.25,duration*.5,duration*.75,duration-pad].map(n=>Number(n.toFixed(3)));
}

async function makePreview(media,settings,tmp,killer){
 const ffmpeg=settings?.ffmpegPath,ffprobe=settings?.ffprobePath;
 if(!ffmpeg||!ffprobe)throw new Error('Görsel denetim için FFmpeg ve FFprobe yolları gerekli');
 const dest=path.join(tmp,'audit.jpg');
 if(media.type!=='video'){
  await run(ffmpeg,['-v','error','-y','-i',media.file,'-frames:v','1','-vf','scale=1024:1024:force_original_aspect_ratio=decrease','-q:v','3',dest],{killer,timeoutMs:60000});
  return {dest,label:'STILL IMAGE, fit within 1024 pixels'};
 }
 const duration=await ffprobeDuration(ffprobe,media.file);
 const times=editorialVideoSampleTimes(duration);
 const args=['-v','error','-y'];
 for(const t of times)args.push('-ss',t.toFixed(3),'-i',media.file);
 const panels=times.map((_,i)=>`[${i}:v]scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:black[v${i}]`).join(';');
 args.push('-filter_complex',`${panels};[v0][v1][v2][v3][v4]xstack=inputs=5:layout=0_0|512_0|1024_0|0_512|512_512:fill=black[out]`,'-map','[out]','-frames:v','1','-q:v','3',dest);
 await run(ffmpeg,args,{killer,timeoutMs:90000});
 return {dest,label:`5 FRAME CONTACT SHEET, read left to right across the first row (3 frames), then the second row (2 frames). Chronological samples at ${times.join(', ')} seconds`};
}

function promptFor(spec,kind){
 return `Audit the actual pixels as a strict senior documentary picture editor.\nMEDIA: ${kind}\nNARRATION (exact words at this moment): ${JSON.stringify(String(spec?.narration||''))}\nANCHOR QUOTE (exact depiction moment): ${JSON.stringify(String(spec?.anchorQuote||''))}\nINTENDED DEPICTION: ${JSON.stringify(String(spec?.prompt||''))}\nSOURCE ROLE: ${JSON.stringify(String(spec?.sourceRole||'unknown'))}\nTHEME: ${JSON.stringify(String(spec?.theme||''))}\n\nJudge whether the pixels depict the narration at this exact moment, not merely the broad topic. Distinguish evidence/archival material from illustration: evidence must support the factual claim and entity; illustration may be interpretive but must not assert a false identity. Check entity, place, era, action, anatomy, impossible objects, modern intrusions, text, logos and watermarks. Legitimate archival borders, film wear, monochrome treatment, period art and plausible diegetic markings such as vehicle identification numbers are not defects by themselves. A cinematic reconstruction is not defective merely because it looks staged when the intended depiction explicitly requests a cinematic scene. Do not call an artwork the wrong era merely because the artist lived later than the depicted event. For video, inspect all five panels and score continuity across them. hardMismatch means a clearly wrong entity/place/era/action or a misleading depiction. Use defects only for visible problems material enough to reject or repair the shot; put minor observations and preferences only in observation, never defects. Return the required JSON fields.`;
}

function normalize(v){
 if(!v||![v.puan,v.kalite,v.continuity].every(n=>Number.isInteger(n)&&n>=0&&n<=3)||typeof v.hardMismatch!=='boolean'||!Array.isArray(v.defects)||!v.observation?.trim()||!KADRAJ.has(v.kadraj)||!ODAK.has(v.odak)||!AKIS.has(v.flow)||!YER.has(v.yer))throw new Error('Görsel denetim yanıtı doğrulanamadı');
 return {puan:v.hardMismatch?0:v.puan,kalite:v.kalite,videoTutarlilik:v.continuity,yer:v.yer,gorunen:v.observation.trim(),kadraj:v.kadraj,odak:v.odak,akis:v.flow,defects:v.defects.map(String),verified:true,...(typeof v.motionSatisfied==='boolean'?{motionSatisfied:v.motionSatisfied}:{})};
}

export async function auditEditorialMedia(media,spec,{settings,usage,logFn=()=>{},killer,isCancelled=()=>false,request}={}){
 assertActive(killer,isCancelled);
 if(!media?.file||!['image','video'].includes(media.type))throw new Error('Denetlenecek medya geçersiz');
 if(!settings?.model)throw new Error('Görsel denetim için kalite modeli gerekli');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'nova-editorial-audit-'));
 try{
  const preview=await makePreview(media,settings,tmp,killer);
  assertActive(killer,isCancelled);
  const schema=structuredClone(SCHEMA),requiredMotion=String(spec?.requiredMotion||'').trim();
  if(requiredMotion){schema.properties.motionSatisfied={type:'boolean'};schema.required.push('motionSatisfied');}
  const motionBrief=requiredMotion?`\nREQUIRED PHYSICAL MOTION: ${JSON.stringify(requiredMotion)}. Set motionSatisfied true ONLY if the chronological frames visibly demonstrate the requested subject action/process. A static frame encoded as video, a camera-only zoom or unrelated ambient movement does not satisfy subject action. State observed changes and any absent required movement in observation. Camera flow and subject movement are different.`:'';
  const result=await callVisionJSON({model:settings.model,system:'You are a strict editorial visual auditor. Inspect pixels, never infer absent evidence, and emit only the schema.',user:promptFor(spec,preview.label)+motionBrief,images:[{etiket:preview.label,data:fs.readFileSync(preview.dest).toString('base64'),mediaType:'image/jpeg'}],schema,maxTokens:1800,usage,logFn,isCancelled,signal:abortSignal(killer),...(request?{request}:{})});
  assertActive(killer,isCancelled);
  return normalize(result);
 }finally{
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}

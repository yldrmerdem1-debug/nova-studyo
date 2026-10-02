import {usesAutomaticEditor} from '../../public/production-modes.js';

export const MOTION_DIRECTION_VERSION=1;
const round=n=>Math.round(n*100)/100;
const protectedKind=/^(document|map|chart|diagram|screenshot)$/i;

export function verifiedMotion(m,strict=true){
 return Boolean(m?.file)&&m.type==='video'&&m.motionSatisfied!==false&&m.yer!=='baska'&&!m.hardMismatch&&!m.defects?.length&&
  Number(m.gorsel)>=(strict?3:2)&&Number(m.kalite)>=2&&Number(m.videoTutarlilik)>=2&&(!strict||m.verified===true);
}

/** Pre-TTS estimates, shared across planner batches; final render measures real times. */
export function motionBrief(job={},beats=[],media={}){
 const enabled=usesAutomaticEditor(job)&&!job.demo&&job.visualStyle!=='kolaj';
 const counts=new Map();
 for(const b of beats)counts.set(b.seg,(counts.get(b.seg)||0)+1);
 const scenes=beats.map(b=>{
  const words=String(b.seg?.text||'').match(/\S+/gu)?.length||0;
  const segmentSeconds=Number(b.seg?.duration)>0?Number(b.seg.duration):words/(job.language==='en'?2.3:2);
  const durationSec=Number.isFinite(b.slotDuration)?b.slotDuration:segmentSeconds/(counts.get(b.seg)||1),m=media[b.id];
  const protectedSource=Boolean(protectedKind.test(b.visual?.kind)||m?.preserveFrame||m?.localOverride||m?.kadraj==='belge');
  return {id:b.id,durationSec:round(durationSec),protectedSource,existingMotion:verifiedMotion(m,job.mediaKind==='director'),preferMotion:false};
 });
 const durationSec=scenes.reduce((s,x)=>s+x.durationSec,0);
 const eligibleSec=scenes.reduce((s,x)=>s+(!x.protectedSource||x.existingMotion?x.durationSec:0),0);
 const targetPercent=enabled&&durationSec?Math.min(job.mediaKind==='director'?65:55,eligibleSec/durationSec*100):0;
 const targetSec=durationSec*targetPercent/100;
 // Keep already verified footage. Distribute additional motion from the opening
 // across the entire story, rather than filling only the first eight-scene batch.
 let motionSec=0,elapsed=0;
 for(const s of scenes){
  elapsed+=s.durationSec;
  if(s.existingMotion||(!s.protectedSource&&motionSec<elapsed*targetPercent/100)){
   s.preferMotion=enabled;motionSec+=s.durationSec;
  }
 }
 for(const s of scenes)if(enabled&&motionSec<targetSec&&!s.protectedSource&&!s.preferMotion){s.preferMotion=true;motionSec+=s.durationSec;}
 return {version:MOTION_DIRECTION_VERSION,enabled,durationSec:round(durationSec),targetPercent:round(targetPercent),maxStillRunSec:durationSec<=90?12:18,scenes};
}

export function assessMotionPlan(brief,decisions=[],media={}){
 const byId=new Map(decisions.map(d=>[d.id,d]));
 let moving=0,run=0,longest=0;
 const repairIds=[];
 for(const s of brief.scenes){
  const d=byId.get(s.id),isMotion=d?.action==='ai-video'||(d?.action==='keep'&&s.existingMotion);
  const source=media[s.id];
  const capacity=d?.action==='ai-video'?10:Number.isFinite(source?.duration)?Math.max(0,source.duration-(Number(source.sourceStart)||0)):s.durationSec;
  const covered=isMotion?Math.min(s.durationSec,capacity):0;
  if(covered>0)run=0;
  moving+=covered;run+=s.durationSec-covered;longest=Math.max(longest,run);
  if(!isMotion&&!s.protectedSource&&s.preferMotion&&d?.sourceRole!=='evidence')repairIds.push(s.id);
 }
 const percent=brief.durationSec?moving/brief.durationSec*100:0;
 return {estimated:true,targetPercent:brief.targetPercent,videoPercent:round(percent),longestStillRunSec:round(longest),
  needsRepair:brief.enabled&&(percent+.5<brief.targetPercent||longest>brief.maxStillRunSec),repairIds};
}

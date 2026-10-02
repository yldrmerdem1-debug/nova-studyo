import {cumleleriBol,sahneHizasi} from './cumlehizasi.js';

const clean=value=>String(value??'').replace(/\s+/g,' ').trim();

// A portrait Short has less screen time for each distinct claim. This only
// raises the available cut budget; sentence alignment and the 2.2s minimum
// still decide whether an additional source can actually be shown.
export function targetEditorialCutSeconds(job={},totalDurationSec=Infinity,styleTarget=0){
 if(job.mediaKind==='director'&&job.ratio==='9:16'&&totalDurationSec<90&&job.visualStyle==='editorial')
  return styleTarget>0?Math.min(styleTarget,3.2):3.2;
 return styleTarget;
}

// A fast opening is safe only when each extra shot has its own verified
// narration sentence and enough time to be understood on a phone.
export function planPortraitShortHook({job={},segment={},totalDurationSec=Infinity,mediaCount=0,anchors=[]}={}){
 if(job.mediaKind!=='director'||job.ratio!=='9:16'||!(totalDurationSec<90)||segment.index!==0)return null;
 const sentences=cumleleriBol(segment.text||'').map(clean);
 const count=Math.min(4,Math.max(0,Math.floor(mediaCount)),sentences.length);
 if(count<2||!Array.isArray(anchors)||anchors.length<count)return null;
 const chosen=anchors.slice(0,count).map(clean);
 let last=-1;
 for(const quote of chosen){
  if(quote.length<8||quote.split(/\s+/).length<3)return null;
  const index=sentences.findIndex((sentence,i)=>i>last&&sentence.includes(quote));
  if(index<0)return null;
  last=index;
 }
 const minSceneSec=1.15;
 const alignment=sahneHizasi(segment.text,segment.words,count,segment.dur,minSceneSec,chosen);
 if(!alignment||alignment.gruplar.length!==count||alignment.gorselSirasi.some((source,i)=>source!==i))return null;
 return {count,minSceneSec,alignment};
}

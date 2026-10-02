import {sahneHizasi} from './cumlehizasi.js';
import {nefesPayi,KAPANIS_KUYRUGU} from './render.js';

/** Match editorial render's sentence cuts, structural pauses and ending tail.
 * Used before paid motion generation; actual render still validates every source.
 */
export function directorShotDurations(script,tts,decisions=[],media={}){
 if(!Array.isArray(tts)||!tts.length)return null;
 const byId=new Map(decisions.map(d=>[d.id,d]));
 const segments=[];let index=0;
 for(const section of script.sections||[])for(const [i,seg] of section.segments.entries()){
  const voice=tts[index];if(!voice||!Number.isFinite(voice.duration))return null;
  segments.push({seg,index,first:i===0,voice,duration:voice.duration+nefesPayi({lastOfSection:i===section.segments.length-1,emphasis:seg.emphasis,text:seg.text})});index++;
 }
 if(!segments.length)return null;
 segments.at(-1).duration+=segments.reduce((n,s)=>n+s.duration,0)<=90?1.4:KAPANIS_KUYRUGU;
 const out={};
 for(const {seg,index,first,voice,duration} of segments){
  const visuals=seg.visuals||[],n=Math.max(1,Math.min(visuals.length,Math.floor(duration/2.2)));
  const hasCard=index===0||first||(seg.emphasis&&seg.emphasis.type!=='none');
  const anchors=visuals.map((v,i)=>byId.get(`s${index}b${i}`)?.anchorQuote||media[`s${index}b${i}`]?.editorial?.anchorQuote||v.anchorQuote||v.query);
  const aligned=sahneHizasi(seg.text,voice.words,n,duration,hasCard?3.2:2.2,anchors);
  if(aligned)aligned.gruplar.forEach((g,i)=>{out[`s${index}b${aligned.gorselSirasi[i]}`]=g.dur;});
  else{
   const firstShare=n>1&&hasCard?.5:1/n;
   for(let i=0;i<n;i++)out[`s${index}b${i}`]=i===0?duration*firstShare:duration*(1-firstShare)/(n-1);
  }
 }
 return out;
}

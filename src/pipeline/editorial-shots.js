import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run,ffprobeDuration} from '../util.js';
import {videoEnc,encThreads} from '../config.js';
import {getStyleProfile} from './style-profile.js';
import ffprobe from 'ffprobe-static';

export const EDITORIAL_RENDER_VERSION=9;
export const EDITORIAL_COMPOSITION_VERSION=6;

// Where each video excerpt starts in its source. Adjacent excerpts of one file
// continue from the frame the viewer last saw (policy complete-beat). Measured
// (20260923-8aab9f): s26b1/s27b0 both started at source frame 6750, so the
// second shot replayed the first; a clip reused later without a timecode
// restarted at frame 0 and replayed its opening. Such shots now continue or
// resume instead; the original start stays as a fallback when the source is
// too short. A deliberate jump to a different, unseen moment is respected.
export function planEditorialSourceTiming(beats,layout,fps){
 let previous=null,visible=0;
 const lastEnd=new Map(),used=new Map();
 const startOf=m=>Number.isFinite(m?.sourceStartFrame)?Math.round(m.sourceStartFrame):Number.isFinite(m?.sourceStart)?Math.round(m.sourceStart*fps):null;
 // Moments the plan shows on purpose elsewhere: a resumed excerpt must not land on them.
 beats.forEach((b,i)=>{const m=b.media||{},at=startOf(m);if(m.type==='video'&&m.file&&at!==null){if(!used.has(m.file))used.set(m.file,[]);used.get(m.file).push([at,at+(layout.slot[i]||0)]);}});
 const freeFrom=(file,from,len)=>{let at=from;for(let moved=true;moved;){moved=false;for(const [a,b] of used.get(file)||[])if(at<b&&at+len>a){at=b;moved=true;}}return at;};
 return beats.map((beat,i)=>{
  const m=beat.media||{},isVideo=m.type==='video'&&Boolean(m.file),same=isVideo&&m.file===previous;
  const explicit=startOf(m);
  const slot=layout.slot[i]||0,continued=same?visible+layout.slot[i-1]:null;
  let start=explicit??0,fallback=null,continuous=false;
  if(m.userSourceStart&&explicit!==null){
   // The editor's chosen in-point wins; the automatic start is the fallback.
   const auto=Number.isFinite(m.autoSourceStartFrame)?Math.round(m.autoSourceStartFrame):Number.isFinite(m.autoSourceStart)?Math.round(m.autoSourceStart*fps):0;
   if(auto!==explicit)fallback=auto;
  }
  else if(same&&(explicit===null||(explicit<continued&&explicit+slot>visible))){start=continued;continuous=true;if(explicit!==null)fallback=explicit;}
  else if(explicit===null&&isVideo&&lastEnd.has(m.file)){start=freeFrom(m.file,lastEnd.get(m.file),slot);fallback=0;}
  visible=start;previous=isVideo?m.file:null;
  if(isVideo){lastEnd.set(m.file,start+slot);if(!used.has(m.file))used.set(m.file,[]);used.get(m.file).push([start,start+slot]);}
  const lead=i?layout.a[i-1]:0;
  return {sourceStartFrame:Math.max(0,start-lead),sourceContinuous:continuous,...(fallback!==null?{fallbackSourceStartFrame:Math.max(0,fallback-lead)}:{})};
 });
}

export function resolveEditorialVideoTiming({frames,fps,sourceDuration,sourceStartFrame=0,settledAt,sourceContinuous=false,ending=false}){
 const total=Math.floor(sourceDuration*fps+.001),N=Math.round(frames),hold=Math.ceil(1.5*fps),fade=ending?Math.ceil(.65*fps):0;
 let start=Math.max(0,Math.round(sourceStartFrame)),moving=N,holdFrames=0;
 if(!Number.isFinite(total)||total<1)throw new Error('Video source duration unavailable');
 if(Number.isFinite(settledAt)){
  const settled=Math.round(settledAt*fps);
  if(settled<0||settled>=total)throw new Error('Animation settledAt outside video source');
  // Reserve a readable completed image before any ending fade. Trim the front
  // only on a new excerpt; a continuation must preserve its timeline.
  if(N<=hold+fade)throw new Error('Animation slot too short for readable completion');
  const latest=N-hold-fade;
  if(settled+1-start>latest){if(sourceContinuous)throw new Error('Animation continuation cannot reach readable completion');start=settled+1-latest;}
  moving=Math.min(N,Math.max(1,settled+1-start));holdFrames=N-moving;
  if(holdFrames>hold+fade) {moving=N-hold-fade;holdFrames=hold+fade;}
 }
 const shortage=start+moving-total;
 // Fractional transition handles may exceed a clip by a few frames. Keep
 // this bounded; narrative-length freezes must fail and be replanned.
 if(shortage>0&&shortage<=Math.ceil(.75*fps)&&!holdFrames&&start<total){moving-=shortage;holdFrames=shortage;}
 if(start+moving>total)throw new Error(`Video source exhausted: needs ${(start+moving)/fps}s, available ${sourceDuration}s; choose a longer source or shorten this scene`);
 return {sourceStartFrame:start,movingFrames:moving,holdFrames};
}
// Display sizes at a 1080-pixel short side. Labels below ~34 px were unreadable
// on a phone (measured: 26 px "4 JUNE 1942", "FATALLY DAMAGED" in Midway).
export const OVERLAY_TYPE={
 landscape:{value:86,quantity:92,unit:48,label:36},
 portrait:{value:96,quantity:108,unit:56,label:42},
 hook:{value:148,quantity:180,unit:82,label:44},
};
const MONTHS=/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\.?$/iu;
export function overlayDate(value){
 const words=String(value??'').trim().split(/\s+/);
 // Turkish İ/I do not case-fold under a plain /i match (HAZİRAN, ARALIK).
 const month=w=>MONTHS.test(w.toLocaleLowerCase('tr'))||MONTHS.test(w.toLowerCase());
 return words.length>=2&&/^\d{1,2}$/.test(words[0])&&month(words[1]);
}
const clean=s=>String(s??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const even=n=>Math.max(2,Math.round(n/2)*2);
const accents={belgesel:'eabe59',hikaye:'e49b73',haber:'8cc7ff',analiz:'78bcf4',egitim:'91d3c0',top5:'f1ad66',vox:'f4d979'};
const em=s=>[...s].reduce((n,c)=>n+(/\s/.test(c)?.32:/[ilI1.,:;'!|]/.test(c)?.28:/[MW@%]/.test(c)?.96:/[A-Z]/.test(c)?.69:.56),0);
const normalized=s=>clean(s).match(/\b(?:18|19|20)\d{2}\b/)?.[0]||clean(s).toLocaleLowerCase('en').replace(/[.,;:]/g,'');
function block(text,canvas,role,start,end,color,preferredSize){
 const W=canvas.w,H=canvas.h,k=Math.min(W,H)/1080,width=W*(H>W?.82:.64);
 let size=(preferredSize??(role==='focus'?72:60))*k,lines=[];
 for(let attempt=0;attempt<30;attempt++){
  lines=[];let line='';for(const word of text.split(' ')){if(line&&em(`${line} ${word}`)*size>width){lines.push(line);line=word;}else line=line?`${line} ${word}`:word;}if(line)lines.push(line);
  if(lines.length<=2&&lines.every(l=>em(l)*size<=width))break;size*=.94;
 }
 if(lines.length>2||size<32*k)return null;
 return {lines,x:Math.round(W*.085),y:Math.round(H*(H>W?.62:.59)),width:Math.round(width),height:Math.round(size*1.2*lines.length),fontSize:size,lineHeight:size*1.2,role,delay:start,end,color};
}
// Still images never sit frozen. Measured (20260923-8aab9f, 583–632 s): four
// archival photos held completely still for 9–12 s each, a 40-second frozen
// block. The older Ken Burns path had already learnt this (7.9 s frozen
// block; documents move slowly but continuously). Movement now scales with
// shot length so a long still is perceptibly alive, and documents keep their
// full contained frame with only a centred, slow zoom.
export const FROZEN_HOLD_LIMIT=5;
export function stillMotion(duration,profile,{document=false}={}){
 const speed=(profile?.camera?.speed||.65)/.65,d=Math.max(.2,Number(duration)||.2);
 const [rate,min,max]=document?[.008,.025,.06]:[.012,.035,.10];
 return +Math.min(max,Math.max(min*speed,rate*d*speed)).toFixed(4);
}
function baseCamera(beat,index,profile,{canvas,director}={}){
 const media=beat.media||{},duration=Number(beat.dur)||0;
 const instruction=media.editorial&&typeof media.editorial==='object'?media.editorial:{};
 const document=/^(belge|harita|grafik|document|map|chart|diagram|screenshot)$/i.test(clean(media.kadraj||media.kind))||media.preserveFrame===true;
 const n=createHash('sha1').update(`${beat.id}|${beat.query||''}`).digest()[0];
 const calm=()=>({mode:n%2?'pull':'push',amount:stillMotion(duration,profile,{document:true}),document,calm:true});
 if(media.type==='video')return {mode:'source',amount:0,document};
 // An editor's explicit camera choice outranks every default, including hold.
 if(instruction.userCamera&&['hold','push','pull','pan-left','pan-right'].includes(instruction.camera))return {mode:instruction.camera,amount:instruction.camera==='hold'?0:stillMotion(duration,profile,{document}),document,directed:true,userHold:instruction.camera==='hold'};
 const held={mode:'hold',amount:0,document};
 if(document)return duration>FROZEN_HOLD_LIMIT?calm():held;
 if(index===0)return director&&canvas?.h>canvas?.w?{mode:'push',amount:Math.max(.055,stillMotion(duration,profile)),document:false}:duration>FROZEN_HOLD_LIMIT?calm():held;
 const requested=['hold','push','pull','pan-left','pan-right'].includes(instruction.camera)?instruction.camera:null;
 // A requested hold is a request for calm, not for a frozen frame on a long shot.
 if(requested==='hold')return duration>FROZEN_HOLD_LIMIT?{...calm(),directed:true}:{mode:'hold',amount:0,document,directed:true};
 if(requested)return {mode:requested,amount:stillMotion(duration,profile),document,directed:true};
 const choices=['hold','push','pan-left','pull','pan-right'];
 const mode=choices[n%choices.length];
 if(mode==='hold'&&duration>FROZEN_HOLD_LIMIT)return calm();
 return {mode,amount:mode==='hold'?0:stillMotion(duration,profile),document};
}

// No automatic sentence excerpts, panels, chapter bands or expanding frames.
export function planEditorialShot({beat={},words=[],title='',index=0,profile=getStyleProfile('belgesel'),canvas,director=false}){
 const duration=Math.max(.2,Number(beat.dur)||.2),camera=baseCamera(beat,index,profile,{canvas,director});
 const timed=words.filter(w=>w&&Number.isFinite(w.start)&&w.start>=0&&w.start<duration&&clean(w.t));
 const number=timed.find(w=>/(?:^|\s)(?:18|19|20)\d{2}(?:[,.;:]|$)/.test(clean(w.t)))||timed.find(w=>/^\d+(?:[.,]\d+)*(?:%|[,.;:])?$/.test(clean(w.t)));
 const palette={background:'101519',ink:'f7f5ef',accent:accents[profile.id]||accents.belgesel};
 let layout='immersive',focus='',textBlocks=[],events=[];
 const instruction=beat.media?.editorial&&typeof beat.media.editorial==='object'?beat.media.editorial:{};
 let overlayPosition=null;
 if(instruction.overlay?.value){
  const o=instruction.overlay,W=canvas.w,H=canvas.h,portrait=H>W,k=Math.min(W,H)/1080;
  const subject=clean(beat.media?.odak||instruction.subjectPosition);
  overlayPosition=['left','right','center'].includes(o.position)?o.position:'left';
  if(/^(right|sag|sağ)$/.test(subject)&&overlayPosition==='right')overlayPosition='left';
  if(/^(left|sol)$/.test(subject)&&overlayPosition==='left')overlayPosition='right';
  const width=W*(portrait?.78:.40),x=overlayPosition==='right'?W*.92-width:overlayPosition==='center'?(W-width)/2:W*.08;
  const firstPortraitHook=director&&portrait&&index===0&&beat.isVideoStart;
  let y=H*(firstPortraitHook?.07:portrait?.14:.28);
  // A calendar date is one value: "6 JUNE" split into a lone giant "6" and a
  // "JUNE" unit line read as a count (measured, Midway 601.8 s).
  const quantity=overlayDate(o.value)?null:clean(o.value).match(/^([+−±-]?\d[\d.,]*(?:\s+(?:million|billion|trillion|thousand|milyon|milyar|bin))?)\s+(.+)$/iu);
  const type=OVERLAY_TYPE[firstPortraitHook?'hook':portrait?'portrait':'landscape'];
  const rows=quantity?[['value',quantity[1],type.quantity,palette.accent],['unit',quantity[2],type.unit,palette.ink]]:[['value',o.value,type.value,palette.accent]];
  rows.push(['label',o.label,type.label,'d7dfe1']);
  let row=0;
  for(const [role,value,size,color] of rows){
   if(!clean(value))continue;
   // Rows arrive one after another, value first, so the eye reads in order.
   const b=block(clean(value),{w:width/.64,h:H},role==='value'?'focus':role,(firstPortraitHook?0:.3)+row++*(firstPortraitHook?.06:.12),duration-(firstPortraitHook?.12:.2),color,Math.max(size,role==='value'?72:60));
   if(!b)throw new Error('Director overlay cannot fit without losing factual text');
   b.fontSize=Math.min(b.fontSize,size*k);b.lineHeight=b.fontSize*1.2;
   // Reflow at the actual safe width after choosing the display size.
   b.lines=[];let line='';for(const word of clean(value).split(' ')){if(line&&em(`${line} ${word}`)*b.fontSize>width){b.lines.push(line);line=word;}else line=line?`${line} ${word}`:word;}if(line)b.lines.push(line);
   b.x=Math.round(x);b.y=Math.round(y);b.width=Math.round(width);b.height=Math.ceil(b.lines.length*b.lineHeight);b.role=role;b.contrast=false;
   if(b.y+b.height>H*.68||b.lines.some(l=>em(l)*b.fontSize>width))throw new Error('Director overlay exceeds subtitle-safe text area');
   textBlocks.push(b);y+=b.height+18*k;
  }
  layout='directed-overlay';focus=clean(o.value);events=[{beatId:beat.id,event:'accent',start:firstPortraitHook?.06:.3}];
 }else if(!instruction.overlayOff&&!director&&beat.isVideoStart&&duration>=2){
  const heading=clean(beat.sectionTitle)||(clean(title).split(' ').length<=8?clean(title):'');
  if(heading&&heading.split(' ').length<=10){const b=block(heading,canvas,'headline',.35,Math.min(3.1,duration-.3),palette.ink);if(b){layout='opener';textBlocks=[b];events=[{beatId:beat.id,event:'reveal',start:.35}];}}
 }else if(!instruction.overlayOff&&!director&&number&&number.start<duration-1.2){
  focus=clean(number.t).replace(/[,.;:]$/,'');
  const b=block(focus,canvas,'focus',number.start,Math.min(number.start+2.4,duration-.25),palette.accent);
  if(b){layout='number';textBlocks=[b];events=[{beatId:beat.id,event:'accent',start:number.start}];}
 }
 if(beat.firstOfSection&&!beat.isVideoStart)events.unshift({beatId:beat.id,event:'section',start:.12});
 const preservedEvidence=director&&beat.media?.type==='video'&&beat.media?.editorial?.sourceRole==='evidence'&&beat.media?.preserveFrame===true;
 const fit=preservedEvidence||director&&beat.media?.preserveFrame===true?'blurred-contain':camera.document
  ? 'contain'
  : ['contain','cover','blurred-contain'].includes(instruction.fit)?instruction.fit:'cover';
 return {version:EDITORIAL_COMPOSITION_VERSION,director,overlayPosition,settledAt:instruction.settledAt,beatId:beat.id,layout,width:canvas.w,height:canvas.h,duration,focus,palette,mediaRect:{x:0,y:0,width:canvas.w,height:canvas.h},takeover:null,ending:!!beat.isVideoEnd,textBlocks,events,camera,fit,role:clean(instruction.role).slice(0,80)||null};
}

export function planEditorialSequence(entries){
 const plans=entries.map(planEditorialShot),budget=Math.ceil(plans.length/4),seen=new Set();
 let used=0,offset=0,lastOverlay=-Infinity,lastCamera='',moving=0,frozen=0;
 for(const p of plans){
  if(p.textBlocks.length&&p.layout!=='directed-overlay'){
   const at=offset+p.textBlocks[0].delay,key=normalized(p.focus);
   if(used>=budget||at-lastOverlay<12||(key&&seen.has(key))){p.textBlocks=[];p.events=p.events.filter(e=>e.event==='section');p.focus='';p.layout='immersive';}
   else {used++;lastOverlay=at;if(key)seen.add(key);}
  }
  if(!p.camera.directed&&!p.camera.calm&&!['source','hold'].includes(p.camera.mode)){
   // A short rest between moves reads as rhythm; on a long shot it is a freeze.
   if(moving>=2&&p.duration<=FROZEN_HOLD_LIMIT){p.camera.mode='hold';p.camera.amount=0;}
   else if(p.camera.mode===lastCamera){p.camera.mode=p.camera.mode.startsWith('pan')?'pull':'pan-left';}
  }
  // Calm moves alternate so a run of archival stills does not creep one way.
  if(p.camera.calm&&p.camera.mode===lastCamera)p.camera.mode=p.camera.mode==='push'?'pull':'push';
  // Consecutive short holds must not add up to a frozen passage either.
  if(p.camera.mode==='hold'&&!p.camera.userHold&&frozen+p.duration>FROZEN_HOLD_LIMIT){p.camera.mode=lastCamera==='push'?'pull':'push';p.camera.amount=stillMotion(p.duration,null,{document:true});p.camera.calm=true;}
  frozen=p.camera.mode==='hold'?frozen+p.duration:0;
  moving=['hold','source'].includes(p.camera.mode)?0:moving+1;lastCamera=p.camera.mode;
  offset+=p.duration;
 }
 return plans;
}

const q=n=>Number(n).toFixed(3);
const font=()=>{
 const f=['C:/Windows/Fonts/seguisb.ttf','C:/Windows/Fonts/segoeuib.ttf','C:/Windows/Fonts/arialbd.ttf'].find(f=>fs.existsSync(f));
 if(!f)throw new Error('Editoryal kurgu yazı tipi bulunamadı.');return f.replace(':','\\:');
};
// Pixel box covering every text line of a shot, with room for the accent rule.
export function overlayRegion(blocks,W,H){
 const lines=(blocks||[]).flatMap(b=>b.lines.map((l,i)=>({x:b.x,y:b.y+i*b.lineHeight,w:em(l)*b.fontSize,h:b.lineHeight})));
 if(!lines.length)return null;
 const pad=Math.round(Math.min(W,H)/1080*28);
 const x=Math.max(0,Math.floor(Math.min(...lines.map(l=>l.x))-pad)),y=Math.max(0,Math.floor(Math.min(...lines.map(l=>l.y))-pad/2));
 const right=Math.min(W,Math.ceil(Math.max(...lines.map(l=>l.x+l.w))+pad)),bottom=Math.min(H,Math.ceil(Math.max(...lines.map(l=>l.y+l.h))+pad/2));
 return right-x>=8&&bottom-y>=8?{x,y,w:right-x,h:bottom-y}:null;
}
// Calibrated on delivered frames: gold/white type stayed readable over mean
// luma 75–115 with a narrow spread, and failed over grey archival paper
// (141–158), bright sky (163) and busy aircraft detail (spread 170).
export function overlayPlateNeeded({yavg,ylow,yhigh}={}){
 if(![yavg,ylow,yhigh].every(Number.isFinite))return true;
 return yavg>=125||yhigh-ylow>=120;
}
async function measureOverlayPlate({st,inputs,filters,region,dir,killer}){
 let out='';
 try{
  await run(st.ffmpegPath,[...inputs,'-filter_threads','1','-vf',`${filters.join(',')},crop=${region.w}:${region.h}:${region.x}:${region.y},signalstats,metadata=print`,'-frames:v','1','-f','null','-'],{cwd:dir,killer,timeoutMs:120000,onLine:s=>{if(out.length<20000)out+=s;}});
 }catch(e){if(killer?.cancelled)throw e;return true;}
 const read=k=>Number(out.match(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`))?.[1]);
 return overlayPlateNeeded({yavg:read('YAVG'),ylow:read('YLOW'),yhigh:read('YHIGH')});
}
// Type enters line by line with a short eased rise, a thin accent rule grows
// beside factual overlays, and a dark plate appears only where the measured
// picture would swallow the text.
export function overlayFilters(p,{W,H,lead=0,plate=false,textfile}){
 const k=Math.min(W,H)/1080,filters=[],blocks=p.textBlocks||[],fade=.18,rise=.42;
 const pads=blocks.map(b=>plate?b.fontSize*.22:b.contrast?Math.min(W,H)*.012:0);
 for(const [bi,b] of blocks.entries()){
  const start=lead+b.delay,end=lead+b.end;
  for(const [i,line] of b.lines.entries()){
   const name=textfile(bi,i,line),y0=b.y+i*b.lineHeight,lift=b.fontSize*.28;
   const box=plate?`box=1:boxcolor=0x0b0f14@0.7:boxborderw=${q(pads[bi])}:`:b.contrast?`box=1:boxcolor=black@0.28:boxborderw=${q(pads[bi])}:`:'';
   filters.push(`drawtext=fontfile='${font()}':textfile='${name}':expansion=none:fontsize=${q(b.fontSize)}:fontcolor=0x${b.color}:x=${b.x}:y='${q(y0)}+${q(lift)}*pow(1-clip((t-${q(start+i*.06)})/${rise},0,1),3)':${box}borderw=${q(k*2)}:bordercolor=black@0.55:shadowcolor=black@0.75:shadowx=${q(k*2)}:shadowy=${q(k*2)}:alpha='clip((t-${q(start+i*.06)})/${fade},0,1)*clip((${q(end)}-t)/${fade},0,1)'`);
  }
 }
 if(['directed-overlay','number'].includes(p.layout)&&blocks.length){
  const first=blocks[0],last=blocks.at(-1),start=lead+first.delay,end=lead+Math.max(...blocks.map(b=>b.end));
  const top=Math.round(first.y-pads[0]*.6),bottom=Math.round(last.y+last.height+pads.at(-1)*.4);
  const w=Math.max(4,Math.round(6*k)),x=Math.max(0,Math.round(Math.min(...blocks.map(b=>b.x))-Math.max(...pads)-18*k-w));
  // drawbox cannot animate its size, so the rule grows in six frame-sized steps.
  for(let s=1;s<=6;s++){
   const h=Math.max(2,Math.round((bottom-top)*s/6));
   filters.push(`drawbox=x=${x}:y=${top}:w=${w}:h=${h}:color=0x${p.palette?.accent||'eabe59'}@0.95:t=fill:enable='between(t,${q(start+(s-1)*.035)},${q(end)})'`);
  }
 }
 return filters;
}
export async function renderEditorialShot({st,canvas,media,plan:p,frames,outFile,killer,crf=st.crf,gradeF=null}){
 if(killer?.cancelled)throw new Error('cancelled');
 if(p.director&&(!media?.file||!fs.existsSync(media.file)))throw new Error(`Director scene ${p.beatId}: required media unavailable`);
 const dir=path.dirname(outFile);fs.mkdirSync(dir,{recursive:true});
 const W=canvas.w,H=canvas.h,N=Math.max(2,Math.round(frames)),fps=st.fps,lead=Number(p.renderLeadIn)||0;
 let inputs=media?.file?['-i',media.file]:['-f','lavfi','-i',`color=c=0x${p.palette.background}:s=${W}x${H}:r=${fps}`];
 let filters=[];
 let timing=null;
 if(media?.type==='video'&&media.file){
  const sourceDuration=await ffprobeDuration(st.ffprobePath||ffprobe.path,media.file);
  const timingFor=(sourceStartFrame,sourceContinuous)=>resolveEditorialVideoTiming({frames:N,fps,sourceDuration,sourceStartFrame,settledAt:p.settledAt,sourceContinuous,ending:p.ending});
  try{timing=timingFor(p.sourceStartFrame??media.sourceStartFrame??Math.round((media.sourceStart||0)*fps),p.sourceContinuous);}
  catch(e){
   // A continuation or resume that runs past the source end falls back to the
   // originally planned excerpt rather than failing the whole render.
   if(!Number.isFinite(p.fallbackSourceStartFrame))throw e;
   timing=timingFor(p.fallbackSourceStartFrame,false);
  }
  // Seek to the preceding whole second before decoding long archives. Keep the
  // remaining frame offset in trim so different excerpts retain frame accuracy.
  const seekSeconds=Math.floor(timing.sourceStartFrame/fps);
  const localStart=timing.sourceStartFrame-seekSeconds*fps;
  if(seekSeconds>0)inputs=['-ss',String(seekSeconds),'-i',media.file];
  filters.push(`fps=${fps}`,`trim=start_frame=${localStart}:end_frame=${localStart+timing.movingFrames}`,'setpts=PTS-STARTPTS');
 }
 if(p.fit==='blurred-contain'){
  const radius=Math.max(8,Math.round(Math.min(W,H)/24));
  filters.push(`split=2[soft][sharp];[soft]scale=${W}:${H}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${W}:${H},eq=brightness=-0.10:saturation=0.75,boxblur=luma_radius=${radius}:luma_power=1[back];[sharp]format=rgba,scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0[front];[back][front]overlay=0:0:format=auto`);
 }
 else if(p.fit==='contain')filters.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2`,`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x${p.palette.background}`);
 else {
  const subject=clean(media?.odak||media?.editorial?.subjectPosition).toLowerCase();
  // The subject's audited side must survive the first cover crop, before the
  // restrained camera motion. Retain breathing room instead of pinning an edge.
  const anchor=/^(sol|left)$/.test(subject)?.18:/^(sag|sağ|right)$/.test(subject)?.82:.5;
  filters.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`,`crop=${W}:${H}:(iw-ow)*${anchor}:(ih-oh)/2`);
 }
 // Measured: colorbalance after zoompan ran on every output frame and made a
 // 5 s photo take 25 s to encode. A still has one source frame, so it is
 // graded once before the move (difference to the old order: 48 dB PSNR).
 const grade=st.cinemaGrade!==false?(gradeF||'eq=contrast=1.025:saturation=1.01'):null;
 const stillGraded=media?.type==='image'&&Boolean(media.file)&&Boolean(grade);
 if(stillGraded)filters.push(grade);
 if(media?.type==='image'&&media.file){
  const mode=p.camera.mode,amount=p.camera.amount||0,progress=`on/${N-1}`,center='(iw-iw/zoom)/2';
  const z=mode==='push'?`1+${amount}*${progress}`:mode==='pull'?`1+${amount}*(1-${progress})`:mode.startsWith('pan')?String(1+amount):'1';
  const x=mode==='pan-left'?`(iw-iw/zoom)*(1-${progress})`:mode==='pan-right'?`(iw-iw/zoom)*${progress}`:center;
  // Supersampling keeps slow motion from stepping through individual pixels.
  filters.push(`scale=${even(W*1.5)}:${even(H*1.5)}`,`zoompan=z='${z}':x='${x}':y='(ih-ih/zoom)/2':d=${N}:s=${W}x${H}:fps=${fps}`);
 }else if(timing){if(timing.holdFrames)filters.push(`tpad=stop_mode=clone:stop=${timing.holdFrames}`);}
 else filters.push(`fps=${fps}`,`tpad=stop_mode=clone:stop_duration=${q(N/fps)}`);
 if(grade&&!stillGraded)filters.push(grade);
 filters.push('setsar=1');
 const files=[];
 try{
  const region=overlayRegion(p.textBlocks,W,H);
  // Measure the finished picture under the type, not the raw source: fit,
  // blur and grade all change what the viewer reads the text against.
  const plate=region&&media?.file?await measureOverlayPlate({st,inputs,filters,region,dir,killer}):false;
  filters.push(...overlayFilters(p,{W,H,lead,plate,textfile:(bi,i,line)=>{
   const name=`shot-${createHash('sha1').update(path.basename(outFile)).digest('hex').slice(0,10)}-${bi}-${i}.txt`;
   fs.writeFileSync(path.join(dir,name),line);files.push(path.join(dir,name));return name;
  }}));
  if(p.ending)filters.push(`fade=t=out:st=${q(Math.max(0,N/fps-.65))}:d=0.65`);
  filters.push('format=yuv420p');
  // Filters get the same bounded thread share as the encoder (cores ÷ parallel
  // jobs, at most 4): colour filters on video ran 3× faster with identical output.
  const filterThreads=String(Math.min(4,Math.max(1,Number(encThreads(st))||1)));
  await run(st.ffmpegPath,[...inputs,'-filter_threads',filterThreads,'-vf',filters.join(','),'-frames:v',String(N),'-r',String(fps),...videoEnc(st,crf),'-an','-y',outFile],{cwd:dir,killer});return outFile;
 }finally{for(const file of files)try{fs.unlinkSync(file);}catch{}}
}

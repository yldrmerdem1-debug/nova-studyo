import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from '../util.js';
import {videoEnc} from '../config.js';
import {getStyleProfile} from './style-profile.js';
// Keep revision-one tools readable; production uses the sequence-aware shots.
export {EDITORIAL_RENDER_VERSION,EDITORIAL_COMPOSITION_VERSION,FROZEN_HOLD_LIMIT,stillMotion,planEditorialShot,planEditorialSequence,renderEditorialShot} from './editorial-shots.js';

const palettes={
 belgesel:{background:'101a23',ink:'f4efe5',muted:'a8b7c0',accent:'eabe59',grid:'26343f',mat:'ece6db'},
 hikaye:{background:'261c22',ink:'f7e9dc',muted:'c5aaa7',accent:'e49b73',grid:'3b2930',mat:'e4cdb7'},
 haber:{background:'eef2f6',ink:'142b44',muted:'536b82',accent:'ba3347',grid:'d9e2eb',mat:'ffffff'},
 analiz:{background:'131e30',ink:'eff6ff',muted:'a3b5cc',accent:'78bcf4',grid:'24364d',mat:'dfebf7'},
 egitim:{background:'f4f0e6',ink:'163b3a',muted:'567572',accent:'167b70',grid:'e1e4d6',mat:'ffffff'},
 top5:{background:'20152d',ink:'fff2f3',muted:'ceb4d1',accent:'f1ad66',grid:'382645',mat:'f5decb'},
 vox:{background:'f2edde',ink:'26272b',muted:'646464',accent:'d06c32',grid:'e0d9c9',mat:'ffffff'},
};
const clean=s=>String(s??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const even=n=>Math.max(2,Math.round(n/2)*2);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const glyphWidth=s=>[...s].reduce((n,c)=>n+(/\s/.test(c)?.32:/[ilI1.,:;'!|]/.test(c)?.28:/[MW@%]/.test(c)?.96:/[A-Z]/.test(c)?.69:.56),0);

// Measured in conservative em widths; reduce the font before exceeding the
// allotted lines. Never truncate a title or inject an unsupported claim.
function textBlock(text,{x,y,width,height,fontSize,maxLines=4,role='body',delay=.12,color}) {
 const value=clean(text);if(!value)return null;
 let size=fontSize,lines=[];
 for(let step=0;step<55;step++) {
  lines=[];let line='';
  for(const word of value.split(' ')) {
   const next=line?`${line} ${word}`:word;
   if(line&&glyphWidth(next)*size>width){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);
  if(lines.length<=maxLines&&lines.length*size*1.2<=height&&lines.every(l=>glyphWidth(l)*size<=width))break;
  size*=.94;
 }
 return {lines,x:Math.round(x),y:Math.round(y),width:Math.floor(width),height:Math.floor(height),fontSize:+size.toFixed(2),lineHeight:+(size*1.2).toFixed(2),role,delay,color};
}

export function planEditorialScene({beat={},text='',words=[],title='',index=0,profile=getStyleProfile('belgesel'),canvas}) {
 const {w:width,h:height}=canvas,portrait=height>=width;
 const duration=Math.max(.2,Number(beat.dur)||.2);
 const timed=words.filter(w=>w&&Number.isFinite(w.start)&&w.start>=0&&w.start<duration&&clean(w.t));
 // A spoken four-digit year is more useful than the mission number in Apollo 11.
 const numberWord=timed.find(w=>/(?:^|\s)(?:18|19|20)\d{2}(?:[,.;:]|$)/.test(clean(w.t))) || timed.find(w=>/^\d+(?:[.,]\d+)*(?:%|[,.;:])?$/.test(clean(w.t)));
 const hasFocus=numberWord&&numberWord.start<duration-.55;
 const focus=hasFocus?clean(numberWord.t).replace(/[,.;:]$/,''):'';
 const layout=beat.isVideoStart?'opener':hasFocus?'number':(index%3===1||beat.firstOfSection)?'evidence':'immersive';
 const palette={...(palettes[profile.id]||palettes.belgesel)};
 const k=Math.min(width,height)/1080;
 const entry=clamp(.34/(profile.camera.speed||.65),.25,.7);
 const sceneText=clean(timed.map(w=>w.t).join(' ')||text);
 const blocks=[],push=(s,o)=>{const b=textBlock(s,o);if(b)blocks.push(b);};
 let mediaRect;
 const margin=width*.055;
 const section=clean(beat.sectionTitle);
 const events=[];
 if(layout==='immersive') {
  mediaRect={x:0,y:0,width,height};
  push(section,{x:margin,y:height*.07,width:width*.70,height:height*.06,fontSize:25*k,maxLines:1,role:'label',color:palette.ink});
 } else {
  mediaRect=portrait?{x:margin,y:height*.065,width:width-margin*2,height:height*.49}
    :{x:width*.46,y:height*.10,width:width*.50,height:height*.66};
   const area=portrait?{x:margin,y:height*.58,width:width*.89,height:height*.15}
    :{x:margin,y:height*.24,width:width*.35,height:height*.50};
  if(layout==='opener') {
   push(title||sceneText,{...area,fontSize:(portrait?68:79)*k,maxLines:portrait?3:5,role:'headline',color:palette.ink,delay:.12});
  } else if(layout==='number') {
   const focusAt=numberWord.start;
   const at=timed.indexOf(numberWord);
   const context=timed.slice(Math.max(0,at-5),at+1).map(w=>w.t).join(' ');
   push(focus,{...area,height:area.height*.48,fontSize:128*k,maxLines:2,role:'focus',delay:focusAt,color:palette.accent});
   if(context.split(/\s+/).length>=3)push(context,{...area,y:area.y+area.height*.52,height:area.height*.44,fontSize:31*k,maxLines:3,delay:focusAt+.08,color:palette.ink});
   events.push({beatId:beat.id,event:'accent',start:+focusAt.toFixed(3)});
  } else {
   // A source excerpt, not a fabricated label, takes a supporting role.
   const excerpt=(timed.slice(0,9).map(w=>w.t).join(' ')||sceneText.split(' ').slice(0,9).join(' '))+((timed.length||sceneText.split(' ').length)>9?'…':'');
   push(excerpt,{...area,fontSize:(portrait?51:54)*k,maxLines:4,role:'excerpt',color:palette.ink,delay:.24});
  }
  if(!portrait)push(section,{x:margin,y:height*.105,width:width*.36,height:height*.09,fontSize:23*k,maxLines:2,role:'label',color:palette.muted,delay:.06});
  events.unshift({beatId:beat.id,event:beat.firstOfSection&&!beat.isVideoStart?'section':'reveal',start:.12});
 }
 const takeoverWord=duration>6&&['number','evidence'].includes(layout)
   ? timed.find(w=>w.start>=Math.max(3.2,(numberWord?.start||0)+1.8)&&w.start<duration-1.4):null;
 const takeover=takeoverWord?{start:takeoverWord.start,duration:profile.id==='haber'?.35:.65}:null;
 if(takeover)events.push({beatId:beat.id,event:'reveal',start:takeover.start});
 return {version:1,beatId:beat.id,layout,width,height,duration,focus,palette,entry,takeover,ending:!!beat.isVideoEnd,mediaRect:Object.fromEntries(Object.entries(mediaRect).map(([k,v])=>[k,Math.round(v)])),textBlocks:blocks,events:events.filter(e=>e.start<duration),cameraAmount:profile.id==='haber'?.025:layout==='immersive'?.075:.04};
}

const ease=(t0,d)=>`(1-pow(1-clip((t-${t0.toFixed(3)})/${d.toFixed(3)},0,1),3))`;
function font(role) {
 const choices=role==='label'?['segoeui.ttf','arial.ttf']:['seguisb.ttf','segoeuib.ttf','arialbd.ttf'];
 const chosen=choices.map(n=>`C:/Windows/Fonts/${n}`).find(p=>fs.existsSync(p));
 if(!chosen)throw new Error('Editoryal kurgu için okunabilir sistem yazı tipi bulunamadı.');
 return chosen.replace(':','\\:');
}

export async function renderEditorialScene({st,canvas,media,plan,frames,outFile,killer,crf=st.crf,gradeF=null}) {
 if(killer?.cancelled)throw new Error('cancelled');
 const dir=path.dirname(outFile);fs.mkdirSync(dir,{recursive:true});
 const fps=st.fps,N=Math.max(2,Math.round(frames)),W=canvas.w,H=canvas.h;
 const p=plan,rect=p.mediaRect,border=p.layout==='immersive'?0:Math.max(2,Math.round(6*Math.min(W,H)/1080));
 const rw=even(rect.width),rh=even(rect.height);
 const lead=Number(p.renderLeadIn)||0;
 const q=(n)=>Number(n).toFixed(3),intro=ease(lead,p.entry);
 const take=p.takeover?ease(lead+p.takeover.start,p.takeover.duration):'0';
 const fullWidth=even(Math.max(W,H*(rw+border*2)/(rh+border*2))*1.03);
 const dx=p.layout==='immersive'?'0':`(${rect.x}+${Math.round(W*.055)}*(1-${intro}))*(1-${take})-${q((fullWidth-W)/2)}*${take}`;
 const expandedH=(rh+border*2)*fullWidth/(rw+border*2);
 const dy=p.layout==='immersive'?'0':`(${rect.y}+${Math.round(H*.025)}*(1-${intro}))*(1-${take})+${q((H-expandedH)/2)}*${take}`;
 const inputs=media?.file?(media.type==='video'?['-stream_loop','-1','-i',media.file]:['-i',media.file]):['-f','lavfi','-i',`color=c=0x${p.palette.grid}:s=${rw}x${rh}:r=${fps}`];
 const graph=[];
 let source;
 if(media?.type==='image'&&media.file) {
  const bigW=even(rw*1.6),bigH=even(rh*1.6);
  source=`scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},zoompan=z='1+${p.cameraAmount}*on/${N-1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${N}:s=${rw}x${rh}:fps=${fps}`;
 } else source=`scale=${rw}:${rh}:force_original_aspect_ratio=increase,crop=${rw}:${rh},fps=${fps},tpad=stop_mode=clone:stop_duration=${q(N/fps)}`;
 const grade=st.cinemaGrade===false?'':`,${gradeF||'eq=contrast=1.035:saturation=1.02'}`;
 graph.push(`[0:v]${source}${grade},setsar=1,format=yuv420p${border?`,pad=iw+${border*2}:ih+${border*2}:${border}:${border}:color=0x${p.palette.mat}`:''}[cell]`);
 graph.push(p.takeover?`[cell]scale=w='2*trunc((${rw+border*2}+${fullWidth-rw-border*2}*${take})/2)':h=-2:eval=frame[picture]`:'[cell]null[picture]');
 graph.push(`color=c=0x${p.palette.background}:s=${W}x${H}:r=${fps},drawgrid=w=${Math.max(32,Math.round(W/16))}:h=${Math.max(32,Math.round(W/16))}:t=1:c=0x${p.palette.grid}@0.36[paper]`);
 if(border) {
  graph.push(`[paper]drawbox=x=${rect.x+border*2}:y=${rect.y+border*3}:w=${rw+border*2}:h=${rh+border*2}:color=black@0.32:t=fill[shadow]`);
 }
 graph.push(`[${border?'shadow':'paper'}][picture]overlay=x='${dx}':y='${dy}':eval=frame:shortest=1[composed]`);
 const decorations=[];
 if(p.layout!=='immersive') {
  const lineX=Math.round(W*.055),lineY=Math.round((H>=W?H*.565:H*.205));
  decorations.push(`drawbox=x=${lineX}:y=${lineY}:w=${Math.round(W*.083)}:h=${Math.max(2,Math.round(H*.004))}:color=0x${p.palette.accent}:t=fill${p.takeover?`:enable='lt(t,${q(lead+p.takeover.start)})'`:''}`);
 } else if(p.textBlocks.length) {
  decorations.push(`drawbox=x=0:y=0:w=${W}:h=${Math.round(H*.16)}:color=black@0.38:t=fill`);
 }
 const files=[];
 try {
  for(const [bIndex,b] of p.textBlocks.entries())for(const [i,line] of b.lines.entries()) {
   const name=`ed-${createHash('sha1').update(path.basename(outFile)).digest('hex').slice(0,10)}-${bIndex}-${i}.txt`;
   const file=path.join(dir,name);fs.writeFileSync(file,line,'utf8');files.push(file);
   const start=lead+b.delay+i*(b.role==='headline'?.065:.035),move=ease(start,p.entry*.7);
   const finalY=b.y+i*b.lineHeight;
   decorations.push(`drawtext=fontfile='${font(b.role)}':textfile='${name}':expansion=none:fontsize=${q(b.fontSize)}:fontcolor=0x${b.color}:x=${b.x}:y='${q(finalY)}+${Math.round(H*.017)}*(1-${move})':alpha='${move}*(1-${take})'`);
  }
  graph.push(`[composed]${decorations.length?decorations.join(',')+',':''}${p.ending?`fade=t=out:st=${q(Math.max(0,N/fps-.65))}:d=0.65,`:''}format=yuv420p[v]`);
  await run(st.ffmpegPath,[...inputs,'-filter_complex_threads','1','-filter_complex',graph.join(';'),'-map','[v]','-frames:v',String(N),'-r',String(fps),...videoEnc(st,crf),'-an','-y',outFile],{cwd:dir,killer});
  return outFile;
 } finally {for(const file of files)try{fs.unlinkSync(file);}catch{}}
}

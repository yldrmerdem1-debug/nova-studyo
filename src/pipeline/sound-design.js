import fs from 'node:fs';
import {getStyleProfile} from './style-profile.js';
import {run} from '../util.js';

const CUES = {tick:{duration:.16,frequency:1100},pop:{duration:.24,frequency:420},bell:{duration:.65,frequency:660},'soft-hit':{duration:.48,frequency:145},'editorial-sweep':{duration:.42,frequency:310},'editorial-impact':{duration:.22,frequency:105}};
const clamp = (n,lo,hi,fallback) => Number.isFinite(Number(n)) ? Math.max(lo,Math.min(hi,Number(n))) : fallback;

const EDITORIAL_EVENTS = new Set(['reveal','accent','section']);
const EDITORIAL_POLICY = {
  belgesel:{gain:.76,section:'editorial-sweep'}, hikaye:{gain:.9,section:'editorial-sweep'},
  haber:{gain:.58,section:'editorial-impact'}, analiz:{gain:.7,section:'editorial-impact'},
  egitim:{gain:.7,section:'editorial-sweep'}, top5:{gain:1,section:'editorial-impact'},
  vox:{gain:.88,section:'editorial-sweep'},
};

function planEditorialCues(plan,beats,events,gain,profile) {
  if(!Array.isArray(events)) { plan.warnings.push('Editoryal ses olayları dizi olmadığı için yok sayıldı.'); return plan; }
  const beatIds=new Set((beats||[]).map(b=>b?.id));
  const policy=EDITORIAL_POLICY[profile.id] || EDITORIAL_POLICY.belgesel;
  const spacing=clamp(profile.sound.minSpacing*.22,1.25,4,2);
  plan.minSpacing=spacing;
  const valid=[];
  for(const item of events) {
    const start=item?.start, event=item?.event;
    if(!item || !beatIds.has(item.beatId) || !EDITORIAL_EVENTS.has(event) || typeof start!=='number' || !Number.isFinite(start) || start<0) {
      plan.warnings.push('Geçersiz editoryal ses olayı yok sayıldı.');
      continue;
    }
    const kind=event==='reveal' ? 'editorial-sweep' : event==='accent' ? 'editorial-impact' : policy.section;
    const duration=CUES[kind].duration;
    if(start+duration>plan.duration) { plan.warnings.push('Video süresini aşan editoryal ses olayı yok sayıldı.'); continue; }
    valid.push({beatId:item.beatId,event,kind,start,duration});
  }
  valid.sort((a,b)=>a.start-b.start);
  let lastEnd=-Infinity,lastStart=-Infinity;
  for(const cue of valid) {
    if(cue.start<lastEnd || cue.start-lastStart<spacing) {
      plan.warnings.push('Çakışan veya aşırı yoğun editoryal ses olayı yok sayıldı.');
      continue;
    }
    plan.cues.push({...cue,start:+cue.start.toFixed(3),gain:+clamp(gain*policy.gain,0,.3,0).toFixed(4)});
    lastStart=cue.start;lastEnd=cue.start+cue.duration;
  }
  return plan;
}

export function planSoundDesign(beats, options={}) {
  const profile = options.profile || getStyleProfile(options.theme,options.editIntensity);
  const duration = (beats || []).reduce((a,b)=>a+Math.max(0,Number(b.dur)||0),0);
  const gain = clamp(options.sfxVolume ?? .18,0,.3,.18)*profile.sound.gain;
  const plan={version:1,profile:profile.id,duration,minSpacing:profile.sound.minSpacing,enabled:options.soundDesign!==false && gain>0,cues:[],origin:'Nova Studio original deterministic synthesized percussion/tones; no samples',warnings:[]};
  if(!plan.enabled) return plan;
  if(Object.hasOwn(options,'editorialEvents')) return planEditorialCues(plan,beats,options.editorialEvents,gain,profile);
  let at=0,last=-Infinity;
  for(const [i,b] of (beats||[]).entries()) {
    const event = b.firstOfSection && i>0 ? 'chapter' : b.emphasis && ['stat','compare'].includes(b.emphasis.type) ? 'emphasis' : null;
    if(event && at-last>=plan.minSpacing) {
      const kind=profile.sound[event];
      const cueDuration=CUES[kind].duration;
      if(at+cueDuration<=duration) {
        plan.cues.push({beatId:b.id,event,kind,start:+at.toFixed(3),duration:cueDuration,gain:+gain.toFixed(4)});
        last=at;
      }
    }
    at+=Math.max(0,Number(b.dur)||0);
  }
  return plan;
}

// Original damped oscillators, with attack/release envelopes. No random noise beds.
export function synthesizeCue(kind) {
  const spec=CUES[kind];
  if(!spec) throw new Error('Bilinmeyen ses efekti; ses planını yeniden oluşturun.');
  const rate=48000,n=Math.round(spec.duration*rate),out=Buffer.alloc(44+n*2);
  out.write('RIFF');out.writeUInt32LE(36+n*2,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*2,40);
  let seed=0x4e4f5641,low=0,bass=0;
  for(let i=0;i<n;i++) {
    const t=i/rate;
    let sample;
    if(kind==='editorial-sweep') {
      // Fixed-seed noise through a moving low-pass and fixed high-pass: a short swish, never a noise bed.
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      const noise=(seed|0)/2147483648;
      const progress=t/spec.duration,cutoff=850+3600*progress*progress;
      const lowA=1-Math.exp(-2*Math.PI*cutoff/rate),bassA=1-Math.exp(-2*Math.PI*420/rate);
      low+=lowA*(noise-low);bass+=bassA*(low-bass);
      const attack=Math.min(1,t/.045),release=Math.min(1,(spec.duration-t)/.075);
      const env=(attack*attack*(3-2*attack))*(release*release*(3-2*release));
      sample=.44*env*(low-bass);
    } else if(kind==='editorial-impact') {
      const attack=Math.min(1,t/.004),release=Math.min(1,(spec.duration-t)/.035);
      const env=attack*Math.exp(-7.5*t/spec.duration)*release;
      const phase=2*Math.PI*(48*t+72*(1-Math.exp(-18*t))/18);
      sample=.42*env*(Math.sin(phase)+.16*Math.sin(phase*2));
    } else {
      const env=Math.min(1,t/.008)*Math.exp(-7*t/spec.duration)*Math.min(1,(spec.duration-t)/.025);
      const phase=2*Math.PI*spec.frequency*t;
      sample=.38*env*(Math.sin(phase)+.2*Math.sin(phase*1.997))/1.2;
    }
    out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*2);
  }
  return out;
}

// Render a sparse mono stem in bounded chunks (long videos never allocate a full PCM buffer).
export function writeSoundStem(plan,outFile) {
  const rate=48000,total=Math.ceil(plan.duration*rate),bytes=total*2;
  if(bytes>0xffffffff-36) throw new Error('Efekt ses kanalı çok uzun; videoyu bölümlere ayırın.');
  const fd=fs.openSync(outFile,'w');
  const header=Buffer.from(synthesizeCue('tick').subarray(0,44));
  header.writeUInt32LE(bytes+36,4);header.writeUInt32LE(bytes,40);
  try {
    fs.writeSync(fd,header);
    const cues=plan.cues.map(c=>({...c,sample:Math.round(c.start*rate),wav:synthesizeCue(c.kind)}));
    for(let pos=0;pos<total;pos+=rate) {
      const count=Math.min(rate,total-pos),chunk=Buffer.alloc(count*2);
      for(const c of cues) {
        const n=(c.wav.length-44)/2,from=Math.max(pos,c.sample),to=Math.min(pos+count,c.sample+n);
        for(let j=from;j<to;j++) {
          const offset=(j-pos)*2;
          const value=chunk.readInt16LE(offset)+Math.round(c.wav.readInt16LE(44+(j-c.sample)*2)*c.gain);
          chunk.writeInt16LE(Math.max(-32768,Math.min(32767,value)),offset);
        }
      }
      fs.writeSync(fd,chunk);
    }
  } finally {fs.closeSync(fd);}
  return outFile;
}

export function appendSoundMix(inputs,chain,sfxFile) {
  const index=inputs.filter(x=>x==='-i').length;
  return {inputs:[...inputs,'-i',sfxFile],chain:`${chain}[program];[${index}:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=90,lowpass=f=7000[sfx];[program][sfx]amix=inputs=2:duration=first:normalize=0`};
}

export async function measureSound(ffmpegPath,file,{killer}={}) {
  let result='';
  await run(ffmpegPath,['-i',file,'-af','loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json','-f','null','-'],{killer,onLine:s=>{result+=s; if(result.length>50000) result=result.slice(-25000);}});
  const start=result.lastIndexOf('{'),end=result.indexOf('}',start);
  if(start<0||end<0) throw new Error('Ses kalite ölçümü okunamadı; yayından önce ses seviyesini kontrol edin.');
  const raw=JSON.parse(result.slice(start,end+1));
  return {integratedLufs:Number(raw.input_i),truePeakDb:Number(raw.input_tp),loudnessRange:Number(raw.input_lra),targetTruePeakDb:-1.5};
}

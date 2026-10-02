// Manual offline showcase. Never calls providers; original input paths are read-only.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import probe from 'ffprobe-static';
const root='C:/Users/erdem/Videos/Nova Studyo';
const home=path.join(root,'quality-review/showcase-home');
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
fs.mkdirSync(home,{recursive:true});
const {renderAll}=await import('../src/pipeline/render.js');
const {RATIOS}=await import('../src/pipeline/canvas.js');
// Review excerpt only: keep full pipeline while bounding preview encoding cost.
RATIOS['16:9']={...RATIOS['16:9'],w:1280,h:720};
const {MUSIC_DIR}=await import('../src/util.js');
const source=path.join(root,'data/jobs/20260811-cc92b5');
const out=path.join(root,'quality-review/showcase/brain-interface-documentary');
fs.mkdirSync(path.join(out,'sources'),{recursive:true});
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const original=read(path.join(source,'script.json')),originalMedia=read(path.join(source,'media.json'));
const script={title:'From a Single Neuron to a Robotic Arm',sections:original.sections[0].segments.slice(0,2).map((segment,i)=>({title:i?'When intention moved a machine':'The first neural signal',segments:[{...segment,emphasis:{type:'none'},visuals:i?[segment.visuals[0],segment.visuals[2]]:[segment.visuals[0]]}]}))};
const tts=[];
for(let i=0;i<2;i++) {
  const originalAudio=path.join(source,`tts/s${i}/audio.mp3`),audio=path.join(out,`sources/voice-s${i}.mp3`);
  fs.copyFileSync(originalAudio,audio);
  const metadata=read(path.join(source,`tts/s${i}/metadata.json`));
  const words=metadata.Metadata.filter(m=>m.Type==='WordBoundary').map(m=>({t:m.Data.text.Text,start:m.Data.Offset/1e7,end:(m.Data.Offset+m.Data.Duration)/1e7}));
  const duration=Number(execFileSync(probe.path,['-v','error','-show_entries','format=duration','-of','csv=p=0',audio],{encoding:'utf8'}));
  tts.push({segId:`s${i}`,text:script.sections[i].segments[0].text,audio,duration,words});
}
const media={},credits=[];
for(const [dest,id,kadraj] of [['s0b0','s0b0','kalabalik'],['s1b0','s1b0','belge'],['s1b1','s1b2','nesne']]) {
  const m=originalMedia[id],file=path.join(out,'sources',`${dest}${path.extname(m.file)}`);fs.copyFileSync(m.file,file);
  media[dest]={...m,file,beatId:dest,kadraj,odak:'orta'};
  credits.push({id:dest,title:m.eser,creator:m.sahip,license:m.lisans,source:m.sayfa,usage:'Illustrative image; not footage of the named historical participant.'});
}
const track='yatak-notr-sofa--dyalla.mp3';fs.mkdirSync(MUSIC_DIR,{recursive:true});
fs.copyFileSync(path.join(root,'music',track),path.join(MUSIC_DIR,track));
const job={id:'showcase-brain-interface',topic:script.title,theme:'belgesel',language:'en',subtitleMode:'strip',visualStyle:'vox',transitions:'sade',mediaKind:'mixed',demo:true,kurguPlani:false,yaziModu:'vurgu',editIntensity:'balanced',soundDesign:true,sfxVolume:.18,musicVolume:.13,settingsSnapshot:{preset:'veryfast',crf:20,fps:30,concurrency:2,cinemaGrade:true,keepIntermediate:true}};
for(const [name,value] of [['script.json',script],['tts.json',tts],['media.json',media],['job.json',job]])fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const logs=[];
const result=await renderAll(job,script,media,tts,out,m=>{logs.push(m);console.log(m)},()=>{},{cancelled:false,add(){},remove(){},delete(){}});
fs.writeFileSync(path.join(out,'render.log'),logs.join('\n'));
fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({result,sourceJob:'20260811-cc92b5',sourceSegments:['s0','s1'],credits,music:{file:track,origin:'Existing local user-supplied file. Artist/name inferred from filename; licensing not independently verified.'},notice:'Offline editing excerpt using original narration. Historical claims are inherited from the saved script and were not newly fact-checked. Illustrated macaque, patent array and generic robot imagery; no unrelated Bethge portrait or AI historical reconstruction used.'},null,2));
console.log(JSON.stringify({out,result}));

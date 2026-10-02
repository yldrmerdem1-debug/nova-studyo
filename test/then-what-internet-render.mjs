import fs from 'node:fs';import path from 'node:path';process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {getJobSettings,videoEnc}=await import('../src/config.js');const {jobDir,updateJob}=await import('../src/store.js');const {run,mapLimit,writeJson,ProcKiller,ffprobeDuration}=await import('../src/util.js');
const {planEditorialShot,renderEditorialShot}=await import('../src/pipeline/editorial-shots.js');const {frameLayout,buildPieces}=await import('../src/pipeline/transitions.js');const {makeCanvas}=await import('../src/pipeline/canvas.js');const {getStyleProfile}=await import('../src/pipeline/style-profile.js');const {buildCaptions,buildAss,buildSrt}=await import('../src/pipeline/subtitles.js');
const {planSoundDesign,writeSoundStem,appendSoundMix,measureSound}=await import('../src/pipeline/sound-design.js');const {normalizeEt,kodlanmisTepeyiSinirla}=await import('../src/pipeline/loudness.js');const {muzikZinciri}=await import('../src/pipeline/muzik.js');
const {storyboard,alternatives}=await import('./then-what-internet-storyboard.mjs');
const root=path.join(process.env.NOVA_HOME,'quality-review/then-what-internet'),id=fs.readFileSync(path.join(root,'job-id.txt'),'utf8').trim(),dir=jobDir(id),render=path.join(dir,'directed-render');fs.mkdirSync(render,{recursive:true});
const job=JSON.parse(fs.readFileSync(path.join(dir,'job.json'))),{title,sections}=JSON.parse(fs.readFileSync(path.join(dir,'content.json'))),tts=JSON.parse(fs.readFileSync(path.join(dir,'tts.json')));
const st={...getJobSettings(job),fps:30,crf:18,preset:'fast',concurrency:3,cinemaGrade:true},killer=new ProcKiller(),canvas=makeCanvas('16:9'),profile=getStyleProfile('belgesel','balanced');
const log=s=>{console.log(s);fs.appendFileSync(path.join(dir,'directed-production.log'),`${new Date().toISOString()} ${s}\n`);};
const assets=JSON.parse(fs.readFileSync(path.join(dir,'stock-assets.json')));
for(const key of ['checkout','warehouse','hospital','notice','engineer'])assets[key]={file:path.join(dir,'media',key+'.png'),type:'image',provider:'codex-imagegen',permissionVerified:true,lisans:'Original AI illustration generated for this production',sahip:'OpenAI ImageGen / this production',representativeFootage:true,gorsel:3,kalite:3};
for(const key of ['g_network','g_rules','g_payments','g_72h','g_supply','g_gps','g_recovery'])assets[key]={file:path.join(dir,'media/graphics',key+'.mp4'),type:'video',duration:20,provider:'nova-diagram',permissionVerified:true,lisans:'Original production graphics',sahip:'Nova Studio',gorsel:3,kalite:3};
const fallback={...alternatives,hospital:'v20',notice:'v50',warehouse:'v10',engineer:'v28',checkout:'v3',g_network:'v24',g_rules:'engineer',g_payments:'checkout',g_72h:'v3',g_supply:'warehouse',g_gps:'v67',g_recovery:'engineer'};
const flat=[];let offset=0;for(let i=0;i<tts.length;i++){flat.push({...tts[i],offset,dur:tts[i].duration+.6+(i===tts.length-1?5:0),sectionIndex:i});offset+=flat.at(-1).dur;}const duration=offset;if(duration<660)throw Error('Minimum duration not met');
const canon=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
function anchorAt(words,quote,after){if(!quote)return 0;let stream='',ends=[];for(const w of words){stream+=canon(w.t);ends.push(stream.length);}const from=words.findIndex(w=>w.start>=after);const charFrom=from>0?ends[from-1]:0;const pos=stream.indexOf(canon(quote),charFrom);if(pos<0)throw Error('Missing anchor: '+quote);const wi=ends.findIndex(n=>n>pos);return words[wi].start;}
let beats=[];
for(let si=0;si<flat.length;si++){
 const f=flat[si];let prior=-1;const rows=storyboard[si].map(([q,key],j)=>{const start=j===0?0:anchorAt(f.words,q,prior+.01);prior=start;return {start,key,q};});
 let local=rows.map((r,j)=>({...r,dur:(rows[j+1]?.start??f.dur)-r.start}));
 // Tiny narration clauses keep the preceding related image; rapid opening cuts are intentional.
 for(let j=local.length-1;j>0;j--)if(local[j].dur<(si===0?1.1:2.8)&&local[j-1].dur+local[j].dur<12){local[j-1].dur+=local[j].dur;local.splice(j,1);}
 for(const row of local){let remaining=row.dur,start=row.start,key=row.key,firstPart=true;
  while(remaining>.01){if(beats.at(-1)?.key===key&&fallback[key])key=fallback[key];let a=assets[key];if(!a)throw Error('Asset missing: '+key);const max=Math.min(13,a.type==='video'?Math.max(2.5,a.duration-.7):13);let d=remaining;
   if(d>max){const choices=f.words.filter(w=>w.start>start+3&&w.start<=start+max);d=(choices.at(-1)?.start??(start+max))-start;}
   beats.push({id:`shot${String(beats.length).padStart(3,'0')}`,start:f.offset+start,dur:d,sectionIndex:si,sectionTitle:sections[si].label,firstOfSection:start===0,isVideoStart:beats.length===0,isVideoEnd:false,key,query:row.q,anchorQuote:row.q,media:a,firstPart});
   start+=d;remaining-=d;firstPart=false;if(remaining>.01)key=fallback[key]||key;
  }
 }
}
beats.at(-1).isVideoEnd=true;
const transitions=beats.slice(0,-1).map((b,i)=>{const next=beats[i+1];const chapter=next.firstOfSection;const concept=next.key.startsWith('g_')&&!b.key.startsWith('g_')&&i%3===0;return {tip:chapter||concept?'fade':'',sure:chapter?.5:concept?.2:0};});const layout=frameLayout(beats,transitions,30);
// Adjacent uses of the same stock take continue from the preceding source frame.
// This also keeps an incoming chapter dissolve aligned with the outgoing take.
for(let i=1;i<beats.length;i++)if(beats[i].key===beats[i-1].key&&beats[i].media.provider==='pexels'){
 const startFrame=(beats[i-1].sourceStartFrame||0)+layout.slot[i-1]+layout.onPay[i-1]-layout.onPay[i];
 if((startFrame+layout.L[i])/30>beats[i].media.duration-.1)throw Error('Continuous stock take exceeds source duration: '+beats[i].id);
 beats[i].sourceStartFrame=startFrame;
}
const words=flat.flatMap(f=>f.words.map(w=>({...w,start:f.offset+w.start,end:f.offset+w.end})));
const captions=buildCaptions(flat,'classic');fs.writeFileSync(path.join(dir,'subs.ass'),buildAss(captions,'classic',{width:1920,height:1080}));fs.writeFileSync(path.join(dir,'subs.srt'),buildSrt(flat));
writeJson(path.join(dir,'directed-edit-plan.json'),{duration,frames:layout.toplamKare,sections:flat.map((f,i)=>({title:sections[i].title,start:f.offset,duration:f.dur})),beats:beats.map(b=>({...b,media:undefined})),transitions,layout});writeJson(path.join(dir,'media.json'),Object.fromEntries(beats.map(b=>[b.id,b.media])));
writeJson(path.join(dir,'script.json'),{title,sections:sections.map((s,i)=>({title:s.title,segments:[{text:s.paragraphs.join(' '),visuals:beats.filter(b=>b.sectionIndex===i).map(b=>({query:b.query,type:b.media.type,anchorQuote:b.anchorQuote})),emphasis:{type:'none'}}]}))});writeJson(path.join(dir,'word-timeline.json'),words);
log(`DIRECTED PLAN ${beats.length} shots, ${(duration/60).toFixed(2)} minutes, ${beats.filter(b=>b.media.provider==='pexels').length} stock shots`);
if(process.argv.includes('--plan-only'))process.exit(0);
updateJob(id,{stage:'render',progress:43,message:'Then What uzun video kurgusu işleniyor'});
// Build audio while generated motion graphics are prepared independently.
const audio=path.join(render,'audio.m4a');if(!fs.existsSync(audio)){
 for(const f of flat){const dest=path.join(render,f.segId+'.wav');await run(st.ffmpegPath,['-v','error','-i',f.audio,'-af','apad','-t',f.dur.toFixed(6),'-ar','48000','-ac','1','-c:a','pcm_s16le','-y',dest],{killer});}
 fs.writeFileSync(path.join(render,'audio.txt'),flat.map(f=>`file '${f.segId}.wav'`).join('\n'));const narration=path.join(render,'narration.wav');await run(st.ffmpegPath,['-v','error','-f','concat','-safe','0','-i','audio.txt','-c','copy','-y',narration],{cwd:render,killer});
 const catalog=JSON.parse(fs.readFileSync(path.join(process.env.NOVA_HOME,'music/music-provenance.json'))),names=['Constance','Lost Time','Constance','Dark Times','Long Road Ahead'];
 const chapterPairs=[[0,1],[2,3],[4,5],[6,7],[8,9]],blocks=chapterPairs.map((indices,i)=>{const c=catalog.find(x=>x.title===names[i]);if(!c)throw Error('Verified music not found: '+names[i]);return {dosya:path.join(process.env.NOVA_HOME,'music',c.file),sure:indices.reduce((s,j)=>s+flat[j].dur,0),kazanc:c.gainDb,asama:i===0?0:i===4?3:1,credit:c};});
 // Equalize to catalog reference before a moderate bed level; narration controls ducking.
 const mz=muzikZinciri(blocks,{narration,musicVolume:.19,toplamSure:duration,profile,sectionDurations:flat.map(f=>f.dur)});
 const chain=`[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[voice][side];${mz.muzikZinciri};[mus][side]sidechaincompress=threshold=0.02:ratio=6:attack=150:release=900[bed];[voice][bed]amix=inputs=2:duration=first:normalize=0`;
 const events=beats.filter(b=>b.firstOfSection&&!b.isVideoStart).map(b=>({beatId:b.id,event:'section',start:b.start}));const sound=planSoundDesign(beats,{profile,soundDesign:true,sfxVolume:.10,editorialEvents:events});const stem=writeSoundStem(sound,path.join(render,'sfx.wav'));const mixed=appendSoundMix(mz.girdiler,chain,stem);sound.preNormalization=await normalizeEt(st.ffmpegPath,mixed.inputs,mixed.chain,audio,{killer,logFn:log});sound.peakCorrection=await kodlanmisTepeyiSinirla(st.ffmpegPath,audio,{measureFn:measureSound,killer,logFn:log});sound.measured=sound.peakCorrection.measured;sound.music=blocks.map(b=>b.credit);writeJson(path.join(dir,'sound-plan.json'),sound);log('Audio mastered '+JSON.stringify(sound.measured));
}
const clips=beats.map(b=>path.join(render,b.id+'.mp4'));let done=0;
const graphicSettles={g_network:6.7,g_rules:6.1,g_payments:6.7,g_72h:8.5,g_supply:6,g_gps:3.8,g_recovery:6.5};
const graphicTrims=[];
async function shot(b,i){const isGraphic=b.key.startsWith('g_');if(fs.existsSync(clips[i])&&fs.statSync(clips[i]).size>1000&&!(isGraphic&&process.argv.includes('--refresh-graphics'))&&!(b.sourceStartFrame&&process.argv.includes('--refresh-continuity'))){done++;return clips[i];}
 if(!fs.existsSync(b.media.file))throw Error('Awaiting graphic: '+b.media.file);
 const media={...b.media,editorial:{camera:i%4===0?'hold':i%4===1?'push':i%4===2?'pan-left':'pull'}};
 // Short returns to a diagram begin later in its animation, leaving the completed
 // relationship on screen for at least 1.5 seconds before the narration cuts away.
 if(isGraphic){
  const sourceStart=Math.max(0,graphicSettles[b.key]+1.5-b.dur),trimmed=path.join(render,b.id+'-graphic-source.mp4');
  graphicTrims.push({id:b.id,key:b.key,duration:b.dur,sourceStart,settlesAt:graphicSettles[b.key],finalStateHold:b.dur+sourceStart-graphicSettles[b.key]});
  if(sourceStart>0){await run(st.ffmpegPath,['-v','error','-ss',sourceStart.toFixed(3),'-i',media.file,'-t',(layout.L[i]/30+.1).toFixed(3),'-c:v','libx264','-preset','fast','-crf','16','-threads','2','-an','-y',trimmed],{killer});media.file=trimmed;}
 }
 const p=planEditorialShot({beat:{...b,media,sectionTitle:''},words:[],title:'',index:i,profile,canvas});p.textBlocks=[];p.events=[];p.renderLeadIn=layout.onPay[i]/30;
 if(b.firstOfSection&&!b.key.startsWith('g_'))p.textBlocks=[{lines:[sections[b.sectionIndex].label],x:118,y:110,fontSize:43,lineHeight:50,color:'f0cf86',delay:.25,end:Math.min(4.7,b.dur-.25)}];
 if(b.isVideoStart)p.textBlocks=[];
 const gradeF=b.sourceStartFrame?`trim=start_frame=${b.sourceStartFrame},setpts=PTS-STARTPTS,eq=contrast=1.025:saturation=1.01`:media.provider==='nova-diagram'?'eq=contrast=1:saturation=1':null;
 await renderEditorialShot({st,canvas,media,plan:p,frames:layout.L[i],outFile:clips[i],killer,crf:17,gradeF});done++;if(done%10===0||done===beats.length){log(`Shots ${done}/${beats.length}`);updateJob(id,{progress:45+Math.round(done/beats.length*22),message:`Sahneler ${done}/${beats.length}`});}return clips[i];}
// Stock/image shots first; graphics can finish while this independent render runs.
const order=beats.map((b,i)=>({b,i})).sort((a,b)=>Number(a.b.key.startsWith('g_'))-Number(b.b.key.startsWith('g_')));
const results=await mapLimit(order,3,async({b,i})=>{if(b.key.startsWith('g_')){const deadline=Date.now()+10*60*1000;while(!fs.existsSync(b.media.file)){if(Date.now()>deadline)throw Error('Graphic was not delivered: '+b.key);await new Promise(r=>setTimeout(r,2000));}}return await shot(b,i);});for(const r of results)if(!r.ok)throw r.error;
if(graphicTrims.length)writeJson(path.join(dir,'graphic-timing-review.json'),graphicTrims);
if(process.argv.includes('--shots-only')){log('SHOT REFRESH COMPLETE');process.exit(0);}
const pieces=await buildPieces({st,clipFiles:clips,plan:transitions,layout,outDir:path.join(render,'pieces'),killer,mapLimit,logFn:log,onProgress:(n,total)=>{if(n%20===0||n===total)log(`Transitions ${n}/${total}`);}});
await run(st.ffmpegPath,['-v','error','-f','concat','-safe','0','-i',pieces.listFile,'-c','copy','-y',path.join(render,'silent.mp4')],{killer});updateJob(id,{progress:78,message:'Altyazılı uzun video dışa aktarılıyor'});log('FINAL ENCODE');
await run(st.ffmpegPath,['-i',path.join(render,'silent.mp4'),'-i',audio,'-vf','ass=subs.ass','-map','0:v','-map','1:a',...videoEnc({...st,preset:'veryfast',crf:17,concurrency:1}),'-c:a','copy','-t',String(layout.toplamKare/30),'-movflags','+faststart','-y','output.mp4'],{cwd:dir,killer,onLine:s=>{const m=s.match(/time=(\d+):(\d+):([\d.]+)/);if(m){const t=+m[1]*3600 + +m[2]*60 + +m[3];if(Math.floor(t/60)>Math.floor((globalThis.lastTime??0)/60)){log(`Final encoded ${Math.floor(t/60)}m / ${Math.ceil(duration/60)}m`);globalThis.lastTime=t;}}}});
const measured=await measureSound(st.ffmpegPath,path.join(dir,'output.mp4'),{killer});writeJson(path.join(dir,'audio-verification.json'),measured);const actual=await ffprobeDuration(st.ffprobePath,path.join(dir,'output.mp4'));if(actual<660)throw Error('Final below minimum duration');updateJob(id,{stage:'review',progress:94,message:'Uzun video kare ve ses kontrolünde'});log('RENDER COMPLETE '+JSON.stringify({duration:actual,audio:measured}));

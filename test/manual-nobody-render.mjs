// Reproducible, artifact-specific Short; uses Nova's shot, transition and audio engines.
import fs from 'node:fs';
import path from 'node:path';
process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {getJobSettings,videoEnc}=await import('../src/config.js');
const {updateJob,jobDir}=await import('../src/store.js');
const {run,ProcKiller,mapLimit,writeJson}=await import('../src/util.js');
const {planEditorialShot,renderEditorialShot}=await import('../src/pipeline/editorial-shots.js');
const {frameLayout,buildPieces}=await import('../src/pipeline/transitions.js');
const {makeCanvas}=await import('../src/pipeline/canvas.js');
const {getStyleProfile}=await import('../src/pipeline/style-profile.js');
const {planSoundDesign,writeSoundStem,appendSoundMix,measureSound}=await import('../src/pipeline/sound-design.js');
const {normalizeEt,kodlanmisTepeyiSinirla}=await import('../src/pipeline/loudness.js');
const id='20260909-5b91c2',dir=jobDir(id),old=jobDir('20260908-e2a29e');
const job=JSON.parse(fs.readFileSync(path.join(dir,'job.json'))),voice=JSON.parse(fs.readFileSync(path.join(dir,'voice-original.json')));
const original=JSON.parse(fs.readFileSync(path.join(old,'media.json'))),render=path.join(dir,'short-render');fs.mkdirSync(render,{recursive:true});
const st={...getJobSettings(job),fps:30,preset:'fast',crf:18,concurrency:2,cinemaGrade:true};
const canvas=makeCanvas('9:16'),profile=getStyleProfile('belgesel','balanced'),killer=new ProcKiller();
const log=s=>{console.log(s);fs.appendFileSync(path.join(dir,'short-production.log'),`${new Date().toISOString()} ${s}\n`);};
const assets={};
function oldAsset(key,id){const m=original[id];if(!m?.file)throw Error(`Missing ${id}`);const file=path.join(dir,'media',key+path.extname(m.file));fs.copyFileSync(m.file,file);assets[key]={...m,file,originalJob:'20260908-e2a29e',originalBeat:id};}
oldAsset('papyrus','s1b0');oldAsset('blinding','s8b1');oldAsset('ram','s9b1');oldAsset('sea','s5b0');oldAsset('storm','s22b0');
const rower=Object.values(original).find(m=>m.file?.endsWith('rowers.png'));if(!rower)throw Error('Rowers source missing');
fs.copyFileSync(rower.file,path.join(dir,'media','rowers.png'));assets.rowers={...rower,file:path.join(dir,'media','rowers.png')};
for(const key of ['cyclops','boast','cave']){const file=path.join(dir,'media',key+'.png');if(!fs.existsSync(file))throw Error(`Missing generated ${key}`);assets[key]={file,type:'image',provider:'codex-imagegen',permissionVerified:true,lisans:'AI-generated illustration',sahip:'Generated for this production with OpenAI ImageGen',gorsel:3,kalite:3,editorial:{fit:'cover'},representativeFootage:true};}
// Word-aligned, absolute boundaries; frameLayout preserves exactly 1,800 frames.
const rows=[
 [0,'cyclops','hold'],[2.807,'boast','hold'],[5.689,'papyrus','hold'],[7.059,'cyclops','push'],
 [11.854,'cave','hold'],[15.929,'cyclops','pull'],[21.792,'blinding','hold'],[27.040,'cave','push'],
 [33.065,'ram','hold'],[36.526,'rowers','pan-right'],[39.544,'boast','push'],[44.374,'storm','source'],
 [51.838,'cyclops','hold'],[53.916,'boast','hold'],[56.378,'sea','source']
];
const beats=rows.map(([start,key,camera],i)=>({id:`s0b${i}`,start,dur:(rows[i+1]?.[0]??60)-start,query:key,isVideoStart:i===0,isVideoEnd:i===rows.length-1,media:{...assets[key],editorial:{...assets[key].editorial,camera}},key}));
const transitions=beats.slice(0,-1).map((b,i)=>({tip:[4,7,10].includes(i)?'fade':'',sure:[4,7,10].includes(i)?.267:0}));
const layout=frameLayout(beats,transitions,30);
writeJson(path.join(dir,'media.json'),Object.fromEntries(beats.map(b=>[b.id,b.media])));
writeJson(path.join(dir,'script.json'),{title:'He Escaped as Nobody. Then He Said His Name.',description:'A one-minute retelling of the Cyclops episode in Homer’s Odyssey, Book 9.',sections:[{title:'',segments:[{text:fs.readFileSync(path.join(dir,'narration.txt'),'utf8'),visuals:beats.map(b=>({query:b.key,type:b.media.type,anchorQuote:voice.words.filter(w=>w.start>=b.start&&w.start<b.start+b.dur).map(w=>w.t).join(' ')})),emphasis:{type:'none'}}]}]});
writeJson(path.join(dir,'tts.json'),[{segId:'s0',text:fs.readFileSync(path.join(dir,'narration.txt'),'utf8'),audio:voice.audioFilePath,duration:voice.duration,words:voice.words}]);
writeJson(path.join(dir,'short-edit-plan.json'),{duration:60,rows,transitions,layout,method:'Nova Studio renderEditorialShot + frameLayout/buildPieces + two-pass loudness; hand-directed shot timing and Shorts caption track'});
updateJob(id,{status:'running',stage:'render',progress:45,message:'Dikey kurgu ve geçişler hazırlanıyor'});
const clips=beats.map(b=>path.join(render,b.id+'.mp4'));
const results=await mapLimit(beats,2,async(b,i)=>{
 if(fs.existsSync(clips[i])){log(`Cached shot ${i+1}/${beats.length}`);return clips[i];}
 const p=planEditorialShot({beat:b,words:[],title:'',index:i,profile,canvas});p.textBlocks=[];p.events=[];p.renderLeadIn=layout.onPay[i]/30;
 await renderEditorialShot({st,canvas,media:b.media,plan:p,frames:layout.L[i],outFile:clips[i],killer,crf:16});
 log(`Shot ${i+1}/${beats.length}: ${b.key}`);return clips[i];
});
for(const r of results)if(!r.ok)throw r.error;
const {listFile}=await buildPieces({st,clipFiles:clips,plan:transitions,layout,outDir:path.join(render,'pieces'),killer,mapLimit,logFn:log,onProgress:(n,total)=>{if(n===total)log(`Transitions ${n}/${total}`);}});
await run(st.ffmpegPath,['-f','concat','-safe','0','-i',listFile,'-c','copy','-y',path.join(render,'silent.mp4')],{killer});
updateJob(id,{progress:76,message:'Müzik, vurgu sesleri ve altyazılar işleniyor'});
const cues=[{beatId:'s0b5',event:'accent',start:20.5},{beatId:'s0b7',event:'accent',start:30.05},{beatId:'s0b10',event:'reveal',start:41.72}];
const sound=planSoundDesign(beats,{profile,soundDesign:true,sfxVolume:.14,editorialEvents:cues});
const stem=writeSoundStem(sound,path.join(render,'sfx.wav'));
const music=JSON.parse(fs.readFileSync(path.join(process.env.NOVA_HOME,'music/music-provenance.json'))).find(m=>m.title==='Constance');
let inputs=['-i',voice.audioFilePath,'-ss','12','-i',path.join(process.env.NOVA_HOME,'music',music.file)];
// Sparse music bed rises briefly at the name reveal; continuous narration remains foreground.
let chain="[0:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=duration=60,asplit=2[n][duck];[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=60,asetpts=PTS-STARTPTS,volume=-17dB,afade=t=in:d=0.7,afade=t=out:st=58.3:d=1.7[m];[m][duck]sidechaincompress=threshold=0.02:ratio=6:attack=150:release=900[bed];[n][bed]amix=inputs=2:duration=first:normalize=0";
const mixed=appendSoundMix(inputs,chain,stem),audio=path.join(render,'audio.m4a');
sound.preNormalization=await normalizeEt(st.ffmpegPath,mixed.inputs,mixed.chain,audio,{killer,logFn:log});
sound.peakCorrection=await kodlanmisTepeyiSinirla(st.ffmpegPath,audio,{measureFn:measureSound,killer,logFn:log});sound.measured=sound.peakCorrection.measured;sound.music=music;writeJson(path.join(dir,'sound-plan.json'),sound);
const groups="The smartest trick|in the Odyssey|was a fake name.|And Odysseus ruined it|by shouting|his real one.|In Homer's story,|the Cyclops Polyphemus|traps Odysseus|and his men|inside a cave.|The giant eats|some of them.|A boulder blocks|their escape.|So Odysseus offers him|strong wine.|Asked his name,|he answers:|Nobody.|Once the giant|falls asleep,|the men blind|his single eye|with a sharpened stake.|His neighbours rush over.|Who is hurting you?|Nobody!|The other Cyclopes leave.|At dawn,|the survivors escape|hidden beneath his sheep.|They've beaten the monster.|They're sailing away.|Then Odysseus|cannot resist.|He shouts|his real name|back at the shore.|Now Polyphemus knows|exactly who to curse.|He calls on his father,|Poseidon,|to make Odysseus's journey|home a disaster.|His cleverness opened|the way out.|His pride put a god|in the way home.|Watch the full journey|on the channel.".split('|');
const norm=s=>s.toLowerCase().replace(/[^a-z0-9']/g,'');let cursor=0;
const captions=groups.map(text=>{const tokens=text.split(/\s+/),ws=voice.words.slice(cursor,cursor+tokens.length);if(tokens.some((t,i)=>norm(t)!==norm(ws[i]?.t||'')))throw Error('Caption mismatch: '+text);cursor+=tokens.length;return {text,start:ws[0].start,end:Math.min(voice.words[cursor]?.start??58.5,ws.at(-1).end+.16)};});
if(cursor!==voice.words.length)throw Error('Incomplete captions');
const assTime=t=>{const n=Math.round(t*100);return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`;};
const srtTime=t=>{const n=Math.round(t*1000);return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')},${String(n%1000).padStart(3,'0')}`;};
const assHeader=`[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Caption,Segoe UI Semibold,80,&H00F5F7FA,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,3.4,1.4,2,110,170,440,1\nStyle: Label,Segoe UI Semibold,34,&H00C7DBEA,&H000000FF,&H00202020,&H80000000,-1,0,0,0,100,100,2,0,1,1,0,8,100,160,260,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
const captionWrap=text=>{if(text.length<=19)return text;const choices=[...text.matchAll(/ /g)].map(m=>m.index);const k=choices.sort((a,b)=>Math.abs(a-text.length/2)-Math.abs(b-text.length/2))[0];return text.slice(0,k)+'\\N'+text.slice(k+1);};
let events=captions.map(c=>{const key=/^Nobody[.!]$/.test(c.text);const text=key?`{\\fs100\\c&H0059BEEA&}NOBODY${c.text.endsWith('!')?'!':'.'}`:captionWrap(c.text);return `Dialogue: 1,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,{\\fad(55,65)}${text}`;});
events.push(`Dialogue: 0,0:00:00.00,0:00:05.35,Label,,0,0,0,,THE ODYSSEY  /  BOOK IX`);
events.push(`Dialogue: 0,${assTime(21.9)},${assTime(26.8)},Label,,0,0,385,,AN ANCIENT DEPICTION`);
events.push(`Dialogue: 0,${assTime(33.12)},${assTime(36.38)},Label,,0,0,385,,HIDDEN BENEATH THE RAM`);
events.push(`Dialogue: 0,0:00:56.40,0:00:59.20,Label,,0,0,630,,{\\fs64\\c&H00F5F7FA&\\fad(120,200)}THE FULL JOURNEY\\NON THE CHANNEL`);
fs.writeFileSync(path.join(dir,'subs.ass'),assHeader+events.join('\n'));
fs.writeFileSync(path.join(dir,'subs.srt'),captions.map((c,i)=>`${i+1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'));
writeJson(path.join(dir,'short-captions.json'),captions);
await run(st.ffmpegPath,['-i',path.join(render,'silent.mp4'),'-i',audio,'-vf','ass=subs.ass','-map','0:v','-map','1:a',...videoEnc(st),'-c:a','copy','-t','60','-movflags','+faststart','-y','output.mp4'],{cwd:dir,killer});
const measured=await measureSound(st.ffmpegPath,path.join(dir,'output.mp4'),{killer});writeJson(path.join(dir,'short-audio-verification.json'),measured);
updateJob(id,{stage:'review',progress:94,message:'Video hazırlandı; kare ve ses kontrolü yapılıyor'});log('RENDER COMPLETE '+JSON.stringify(measured));

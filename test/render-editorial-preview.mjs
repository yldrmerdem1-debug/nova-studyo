// Explicit read-only access to a supplied finished job. Writes a visual proof
// beside the job, never into it. No provider requests or settings/keys are read.
import fs from 'node:fs';
import path from 'node:path';
import ff from 'ffmpeg-static';
import {execFileSync} from 'node:child_process';
import {planEditorialSequence,renderEditorialShot} from '../src/pipeline/editorial-shots.js';
import {getStyleProfile} from '../src/pipeline/style-profile.js';
import {makeCanvas} from '../src/pipeline/canvas.js';
import {buildAss,buildCaptions} from '../src/pipeline/subtitles.js';
const [source,out]=process.argv.slice(2);
if(!source||!out||path.resolve(source)===path.resolve(out))throw new Error('Supply distinct source and proof folders');
fs.mkdirSync(out,{recursive:true});
const read=n=>JSON.parse(fs.readFileSync(path.join(source,n),'utf8'));
const script=read('script.json'),tts=read('tts.json'),media=read('media.json'),edit=read('edit-plan.json');
const segments=script.sections.flatMap(s=>s.segments.map(seg=>({...seg,sectionTitle:s.title})));
const selected=edit.scenes.slice(0,3),canvas=makeCanvas('16:9'),profile=getStyleProfile('belgesel');
const local=new Map(),timeline=[],entries=[];let offset=0;
for(const [i,s] of selected.entries()) {
 const segIndex=Number(s.id.match(/^s(\d+)/)[1]),seg=segments[segIndex],voice=tts.find(t=>t.segId===`s${segIndex}`),at=local.get(segIndex)||0;
 const words=voice.words.filter(w=>w.start>=at-.001&&w.start<at+s.duration).map(w=>({...w,start:Math.max(0,w.start-at),end:Math.max(0,w.end-at)}));
 entries.push({beat:{id:s.id,dur:s.duration,isVideoStart:i===0,sectionTitle:seg.sectionTitle,media:media[s.id]},text:words.map(w=>w.t).join(' '),words,title:script.title,index:i,profile,canvas});
 timeline.push({offset,duration:s.duration,words,text:seg.text});local.set(segIndex,at+s.duration);offset+=s.duration;
}
const plans=planEditorialSequence(entries);
for(const [i,s] of selected.entries())await renderEditorialShot({st:{ffmpegPath:ff,fps:30,preset:'veryfast',concurrency:2,cinemaGrade:true},canvas,media:media[s.id],plan:plans[i],frames:s.frames,outFile:path.join(out,`${s.id}.mp4`),crf:20,killer:{cancelled:false,add(){},remove(){},delete(){}}});
fs.writeFileSync(path.join(out,'composition-plan.json'),JSON.stringify(plans,null,2));
fs.writeFileSync(path.join(out,'subs.ass'),buildAss(buildCaptions(timeline,'classic'),'classic',{width:1920,height:1080,editorial:true}));
fs.writeFileSync(path.join(out,'clips.txt'),selected.map(s=>`file '${s.id}.mp4'`).join('\n'));
execFileSync(ff,['-hide_banner','-loglevel','error','-f','concat','-safe','0','-i','clips.txt','-i',path.join(source,'output.mp4'),'-map','0:v','-map','1:a','-vf','ass=subs.ass','-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','192k','-t',offset.toFixed(3),'-movflags','+faststart','-y','preview.mp4'],{cwd:out,stdio:'pipe'});
for(const at of [1.4,5,13])execFileSync(ff,['-hide_banner','-loglevel','error','-ss',String(at),'-i',path.join(out,'preview.mp4'),'-frames:v','1','-vf','scale=1280:-1','-y',path.join(out,`frame-${at}.jpg`)]);
console.log(JSON.stringify({preview:path.join(out,'preview.mp4'),duration:offset,layouts:plans.map(p=>p.layout),audio:'Original final mix preserved for visual comparison'}));

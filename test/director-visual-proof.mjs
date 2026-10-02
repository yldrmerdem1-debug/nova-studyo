// Manual visual QA of the actual production compositor. No paid provider calls.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {planEditorialShot,renderEditorialShot} from '../src/pipeline/editorial-shots.js';
import {validateDirectorOverlay} from '../src/pipeline/director-policy.js';
const dir=process.argv[2];if(!dir)throw Error('Pass visual QA directory');
const st={ffmpegPath:ff,ffprobePath:probe.path,fps:30,preset:'fast',crf:17,concurrency:1,cinemaGrade:false};
const text='The storage tank held 2.3 million US gallons of molasses above the streets of Boston.';
const overlay=validateDirectorOverlay({value:'2.3 MILLION US GALLONS',label:'MOLASSES',anchorQuote:'2.3 million US gallons of molasses',position:'left'},text);
const results=[];
for(const [name,canvas] of [['landscape',{w:1920,h:1080}],['portrait',{w:1080,h:1920}]]){
 const media={type:'image',file:path.join(dir,`tank-${name}.png`),odak:'sag',editorial:{overlay,camera:'hold',sourceRole:'illustration'}};
 const plan=planEditorialShot({director:true,canvas,beat:{id:`tank-${name}`,dur:8,media},title:'The molasses tank'});
 const outFile=path.join(dir,`AI Yonetmen - ${name}.mp4`);
 await renderEditorialShot({st,canvas,media,plan,frames:240,outFile});
 const frame=path.join(dir,`AI Yonetmen - ${name}.jpg`);execFileSync(ff,['-v','error','-ss','2','-i',outFile,'-frames:v','1','-q:v','2','-y',frame]);
 results.push({name,canvas,outFile,frame,plan,source:'Codex ImageGen illustration; Nova production compositor'});
}
fs.writeFileSync(path.join(dir,'visual-proof.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({name,outFile,frame})=>({name,outFile,frame}))));

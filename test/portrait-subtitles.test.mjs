// Reconstructed from the 1.5.3 Cannae red/green evidence after source recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import {buildCaptions,buildAss,buildSrt} from '../src/pipeline/subtitles.js';
const texts=JSON.parse(fs.readFileSync(new URL('./fixtures/cannae-portrait-narration.json',import.meta.url),'utf8'));
let offset=0;
const timeline=texts.map(text=>{const words=text.split(/\s+/).map((t,i)=>({t:t.replace(/[.,!?]/g,''),start:i*.25,end:i*.25+.22}));const seg={text,offset,words,duration:words.length*.25};offset+=seg.duration+.2;return seg;});
const portrait={width:1080,height:1920,editorial:true};
const captions=()=>buildCaptions(timeline,'classic',portrait);

test('real Cannae narration becomes short complete phrases with original punctuation and spoken timing',()=>{
 const c=captions();assert.equal(c.map(x=>x.text).join(' '),texts.join(' '));
 assert.ok(c.every(x=>x.text.length<=32),c.map(x=>x.text).join(' | '));
 assert.ok(c.every(x=>x.text.split(/\s+/).length<=6));
 assert.ok(c.some(x=>x.text==='Rome thought it was winning.'));
 for(let i=0;i<c.length;i++){assert.ok(c[i].start<c[i].end);if(i)assert.ok(c[i-1].end<=c[i].start);}
 const starts=timeline.flatMap(s=>s.words.map(w=>s.offset+w.start));
 assert.ok(c.every(x=>starts.some(t=>Math.abs(t-x.start)<1e-8)));
});
test('a spoken Cannae date stays in one coherent caption including its era',()=>{
 assert.ok(captions().some(x=>x.text.includes('two hundred and sixteen BC')),captions().map(x=>x.text).join(' | '));
});
test('short portrait phrases keep auxiliaries with their following action',()=>{
 const bad=captions().filter(x=>/\b(?:could|had|wasn't|was|the|into|its)$/i.test(x.text));
 assert.deepEqual(bad.map(x=>x.text),[]);
});
test('portrait ASS uses readable semibold phrases above the lower and right platform interface',()=>{
 const ass=buildAss(captions(),'classic',portrait);
 assert.match(ass,/Classic,Segoe UI Semibold,64,/);assert.ok(ass.includes('\\pos(497,1478)'));
 for(const line of ass.split('\n').filter(x=>x.startsWith('Dialogue:'))){assert.ok(line.split('\\N').length<=2);assert.ok(!line.includes('\\t('));}
});
test('optional portrait layout preserves landscape, square, non-editorial, explicit word/strip modes and SRT',()=>{
 const legacy=buildCaptions(timeline,'classic');
 for(const options of [{width:1920,height:1080,editorial:true},{width:1080,height:1080,editorial:true},{width:1080,height:1920,editorial:false}])assert.deepEqual(buildCaptions(timeline,'classic',options),legacy);
 for(const mode of ['word','strip'])assert.deepEqual(buildCaptions(timeline,mode,portrait),buildCaptions(timeline,mode));
 const srt=buildSrt(timeline);assert.ok(srt.includes(legacy[0].text));assert.equal(srt.includes('\\N'),false);
 assert.notDeepEqual(captions(),legacy);
});
test('FFmpeg renders every real portrait phrase inside the lower safe area with at most two lines',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-portrait-captions-'));
 const c=captions().map((x,i)=>({...x,start:i,end:i+.95})),width=540,height=960;
 fs.writeFileSync(path.join(dir,'captions.ass'),buildAss(c,'classic',{width,height,editorial:true}));
 const raw=execFileSync(ff,['-v','error','-f','lavfi','-i',`color=c=black:s=${width}x${height}:r=1:d=${c.length}`,'-vf','ass=captions.ass','-frames:v',String(c.length),'-f','rawvideo','-pix_fmt','rgb24','-'],{cwd:dir,maxBuffer:128*1024*1024});
 const size=width*height*3;assert.equal(raw.length,c.length*size);
 for(let n=0;n<c.length;n++){
  const rows=new Set();let minX=width,maxX=0,minY=height,maxY=0,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=n*size+(y*width+x)*3;if(raw[i]>180&&raw[i+1]>180&&raw[i+2]>180){count++;rows.add(y);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
  assert.ok(count>100,c[n].text);assert.ok(minX>=width*.06&&maxX<=width*.87,`horizontal safe area: ${c[n].text} ${minX}..${maxX}`);
  assert.ok(minY>=height*.70&&maxY<=height*.84,`vertical safe area: ${c[n].text} ${minY}..${maxY}`);
  // Dots over i/j can be separated from the body by a few blank pixel rows.
  // Only the larger interline gap starts another text line.
  let lines=0,previous=-10;for(const y of rows){if(y>previous+5)lines++;previous=y;}assert.ok(lines<=2,`${lines} lines: ${c[n].text}`);
 }
 console.log(`Portrait caption pixel proof: ${dir}`);
});

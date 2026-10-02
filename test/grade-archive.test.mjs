import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {gradeFiltresi,gradeHaritasi} from '../src/pipeline/grade.js';

test('a dark lead frame cannot overexpose later bright frames of one archival film',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-grade-archive-'));
 try{
  const file=path.join(dir,'mixed-light.mp4');
  execFileSync(ffmpeg,['-v','error','-f','lavfi','-i','color=black:s=160x90:r=12:d=1.5','-f','lavfi','-i','color=white:s=160x90:r=12:d=1.5','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p','-y',file]);
  const mapLimit=async(items,_concurrency,fn)=>Promise.all(items.map(async item=>({ok:true,value:await fn(item)})));
  const filters=await gradeHaritasi([{id:'archive',src:file,video:true}],{ffmpegPath:ffmpeg,tema:'belgesel',mapLimit});
  assert.match(filters.archive,/brightness=0\.0800/);
  assert.match(gradeFiltresi({y:16,sat:0},'belgesel'),/brightness=0\.2200/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

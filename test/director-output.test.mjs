import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
const api=await import('../src/pipeline/director-output.js').catch(()=>({}));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-output-'));
const st={ffmpegPath:ff,ffprobePath:probe.path,fps:30};
function fixture(name,color,audio=true){const file=path.join(dir,name+'.mp4');execFileSync(ff,['-v','error','-f','lavfi','-i',`color=c=${color}:s=160x90:r=30:d=3`,...(audio?['-f','lavfi','-i','sine=frequency=440:duration=3']:[]),'-c:v','libx264',...(audio?['-c:a','aac']:[]),'-t','3','-y',file]);return file;}
test('final Director gate decodes complete video and audio and records verified duration',async()=>{
 assert.equal(typeof api.verifyDirectorOutput,'function');
 const report=await api.verifyDirectorOutput(fixture('good','blue'),{st,expectedDuration:3,reportFile:path.join(dir,'good.json')});
 assert.equal(report.passed,true);assert.equal(report.decoded,true);assert.equal(report.blackIntervals.length,0);assert.ok(Math.abs(report.duration-3)<.1);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'good.json'),'utf8')).passed,true);
});
test('final gate blocks silent video, wrong duration and long blank picture',async()=>{
 const good=fixture('duration','blue');
 await assert.rejects(api.verifyDirectorOutput(good,{st,expectedDuration:8}),/süre|duration/i);
 await assert.rejects(api.verifyDirectorOutput(fixture('silent','blue',false),{st,expectedDuration:3}),/ses|audio/i);
 await assert.rejects(api.verifyDirectorOutput(fixture('black','black'),{st,expectedDuration:3}),/siyah|black/i);
});

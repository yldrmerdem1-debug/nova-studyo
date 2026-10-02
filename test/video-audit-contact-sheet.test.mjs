import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-video-audit-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const audit=await import('../src/pipeline/gorseldenetim.js');

test('video audit timestamps cover early, middle and late content safely',()=>{
 assert.equal(typeof audit.videoSampleTimes,'function');
 assert.deepEqual(audit.videoSampleTimes(9),[1,4.5,8]);
 const short=audit.videoSampleTimes(1.5);
 assert.equal(short.length,3);assert.ok(short[0]>=0&&short[2]<1.5&&short[0]<short[1]&&short[1]<short[2]);
});

test('video audit preview is a real three-panel contact sheet',async()=>{
 assert.equal(typeof audit.makeAuditPreview,'function');
 const red=path.join(home,'r.mp4'),green=path.join(home,'g.mp4'),blue=path.join(home,'b.mp4'),video=path.join(home,'rgb.mp4'),dest=path.join(home,'preview.jpg');
 for(const [file,color] of [[red,'red'],[green,'green'],[blue,'blue']])execFileSync(ff,['-v','error','-f','lavfi','-i',`color=${color}:s=320x180:d=3:r=5`,'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',file]);
 const list=path.join(home,'list.txt');fs.writeFileSync(list,[red,green,blue].map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n'));
 execFileSync(ff,['-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-y',video]);
 const result=await audit.makeAuditPreview(ff,probe.path,video,'video',dest,640);
 assert.equal(result.frames,3);assert.deepEqual(result.sampleTimes,[1,4.5,8]);assert.ok(fs.statSync(dest).size>1000);
 const data=JSON.parse(execFileSync(probe.path,['-v','error','-show_streams','-of','json',dest],{encoding:'utf8'}));
 assert.equal(data.streams[0].width,1920);assert.equal(data.streams[0].height,360);
});

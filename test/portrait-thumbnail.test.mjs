import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {makeThumbnails} from '../src/pipeline/thumbnails.js';
import {getSettings} from '../src/config.js';
import {run} from '../src/util.js';

test('9:16 Shorts receive a portrait default cover with title inside the safe frame',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-portrait-cover-'));
 const st=getSettings(),source=path.join(dir,'source.jpg');
 await run(st.ffmpegPath,['-f','lavfi','-i','color=c=0x33536a:s=1080x1920','-frames:v','1','-y',source]);
 const made=await makeThumbnails({job:{theme:'belgesel',language:'en',ratio:'9:16',topic:'Fifteen Lost at Midway',thumbnailText:'15 LOST'},title:'Fifteen Lost at Midway',imageFile:source,imageFiles:[source],jobDir:dir,st,killer:null});
 assert.ok(made.includes('thumb_portrait.jpg'));
 const probe=async file=>{let output='';await run(st.ffprobePath,['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',file],{onLine:line=>output+=line});return output.trim();};
 assert.equal(await probe(path.join(dir,'thumbnail.jpg')),'1080,1920');
 assert.ok(fs.statSync(path.join(dir,'thumbnail.jpg')).size>10000);
});

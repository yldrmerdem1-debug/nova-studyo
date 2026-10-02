// Render denemelerinin ara dosyaları birikiyordu (20260913-9d5bfb: 1,8 GB).
// Temizlik yalnızca atılabilir ara dosyaları seçer; yayınlanan video korunur.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-ara-temizlik-'));
const {renderScratchDirs}=await import('../src/pipeline/index.js');

test('deneme ara dosyaları ve çıktısız başarısız denemeler seçilir, videolar korunur',()=>{
 const dir=path.join(process.env.NOVA_HOME,'job'),att=n=>path.join(dir,'attempts',n);
 const put=(f,body='x')=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,body);};
 put(path.join(dir,'output.mp4'));put(path.join(dir,'render','s0b0.mp4'));
 put(path.join(att('old-ok'),'output.mp4'));put(path.join(att('old-ok'),'render','parca','p0000.mp4'));
 put(path.join(att('failed'),'render','s0b0.mp4'));
 put(path.join(att('current'),'output.mp4'));put(path.join(att('current'),'render','audio.m4a'));
 put(path.join(dir,'previous','x','output.mp4'));put(path.join(dir,'media','s0b0.jpg'));
 fs.writeFileSync(path.join(dir,'checkpoints.json'),JSON.stringify({render:{key:'k',value:{dir:att('current')}}}));
 const chosen=renderScratchDirs(dir).map(d=>path.relative(dir,d).replace(/\\/g,'/')).sort();
 assert.deepEqual(chosen,['attempts/current/render','attempts/failed','attempts/old-ok/render','render']);
 for(const d of chosen)assert.ok(!/output\.mp4|previous|media/.test(d));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
test('retry reuses valid editing direction and scene changes invalidate only that cache',async()=>{
  const home=path.resolve(process.env.NOVA_HOME||'');assert.ok(home.includes('quality-review'));
  fs.mkdirSync(home,{recursive:true});
  const dir=fs.mkdtempSync(path.join(home,'pro-cache-'));
  const mod=await import('../src/pipeline/kurgu.js');
  assert.equal(typeof mod.cachedKurguPlani,'function','render retry must reuse paid edit direction');
  let calls=0;const planner=async()=>{calls++;return new Map([[0,{arac:'temiz',gecis:'kes'}]]);};
  const scene=[{no:0,metin:'İlk metin',sure:3}];
  const opts={cacheDir:dir,model:'offline',baslik:'Başlık',planner};
  const first=await mod.cachedKurguPlani(scene,opts);
  assert.deepEqual(await mod.cachedKurguPlani(scene,opts),first);assert.equal(calls,1);
  await mod.cachedKurguPlani([{...scene[0],metin:'Yeni metin'}],opts);assert.equal(calls,2);
  fs.writeFileSync(path.join(dir,'kurgu-plan-cache.json'),'invalid JSON');
  await mod.cachedKurguPlani(scene,opts);assert.equal(calls,3);
});

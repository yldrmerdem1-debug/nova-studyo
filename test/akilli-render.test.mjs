// Akıllı yeniden render: tek plan değişince yalnızca o plan (ve ona bağlı geçiş
// parçaları) yeniden kodlanır; değişmeyen final karelerin ücretli denetimi tekrarlanmaz.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.NOVA_HOME ||= fs.mkdtempSync(path.join(os.tmpdir(),'nova-akilli-render-'));
const {ShotCache,shotCacheKey,reviewCacheKey}=await import('../src/pipeline/shot-cache.js');
const {buildDirectorShotReview}=await import('../src/pipeline/director-shot-review.js');
const {renderAll}=await import('../src/pipeline/render.js');
const {getSettings}=await import('../src/config.js');
const {run,readJson}=await import('../src/util.js');
const ff=getSettings().ffmpegPath;
const killer={cancelled:false,add(){},remove(){},delete(){}};

test('anahtar yalnızca plan, kaynak dosya veya kodlayıcı değişince değişir',()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'key-')),file=path.join(dir,'a.png');fs.writeFileSync(file,'x');
 const base={version:9,plan:{camera:{mode:'push'}},frames:120,fps:30,canvas:{w:1920,h:1080},crf:18,grade:null,media:{type:'image',file},encoder:'[]'};
 const k=shotCacheKey(base);
 assert.equal(shotCacheKey({...base,plan:{camera:{mode:'push'}}}),k);
 assert.notEqual(shotCacheKey({...base,plan:{camera:{mode:'pull'}}}),k);
 assert.notEqual(shotCacheKey({...base,frames:121}),k);
 fs.writeFileSync(file,'changed content');assert.notEqual(shotCacheKey(base),k,'kaynak dosya değişirse önbellek geçersiz');
 const cache=new ShotCache(path.join(dir,'cache')),src=path.join(dir,'clip.mp4'),out=path.join(dir,'out.mp4');fs.writeFileSync(src,'clip');
 assert.equal(cache.restore(k,out),false);cache.store(k,src);
 const again=new ShotCache(cache.dir);assert.equal(again.restore(k,out),true);assert.equal(fs.readFileSync(out,'utf8'),'clip');
 fs.writeFileSync(path.join(cache.dir,`${'0'.repeat(40)}.mp4`),'stale');assert.equal(again.prune(),1);assert.ok(fs.existsSync(again.file(k)));
});

test('tek plan değişince yalnızca o plan yeniden kodlanır, süre birebir korunur',async()=>{
 const base=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'smart-')),media={},tts=[];
 const colors=['0x7a2e2e','0x2e4f7a','0x2e7a44','0x6a5a2a'];
 for(let i=0;i<4;i++){
  const g=path.join(base,`g${i}.png`),a=path.join(base,`a${i}.wav`);
  await run(ff,['-f','lavfi','-i',`color=c=${colors[i]}:s=1280x720`,'-frames:v','1','-y',g]);
  await run(ff,['-f','lavfi','-i',`sine=frequency=${300+i*80}:duration=2.6`,'-ar','48000','-ac','1','-y',a]);
  media[`s${i}b0`]={file:g,type:'image',provider:'test'};tts.push({segId:`s${i}`,duration:2.6,words:[],audio:a});
 }
 const script={title:'Akıllı render',sections:[{title:'A',segments:[0,1,2,3].map(i=>({text:`Cümle ${i}.`,visuals:[{query:`q${i}`,type:'image'}]}))}]};
 const job=(shotEdits={})=>({id:'smart',theme:'belgesel',language:'tr',ratio:'16:9',subtitleMode:'none',visualStyle:'editorial',transitions:'sinematik',mediaKind:'mixed',musicVolume:0,soundDesign:false,demo:true,recoveryDir:base,shotEdits,settingsSnapshot:{...getSettings(),fps:24,crf:28,preset:'ultrafast',concurrency:2}});
 const render=async(edits,name)=>{const dir=path.join(base,name),logs=[];fs.mkdirSync(dir);const r=await renderAll(job(edits),script,media,tts,dir,m=>logs.push(m),()=>{},killer);return {r,logs,line:logs.find(l=>l.startsWith('Akıllı render'))};};
 const first=await render({},'attempt1');
 assert.match(first.line,/0 parça önbellekten geldi/);
 const second=await render({},'attempt2');
 assert.match(second.line,/ 0 parça yeniden kodlandı/,second.line);
 const third=await render({s2b0:{overlay:{mode:'custom',value:'4 HAZİRAN 1942',label:'',position:'left'}}},'attempt3');
 const [hits,misses]=third.line.match(/(\d+) parça önbellekten geldi, (\d+) parça yeniden kodlandı/).slice(1).map(Number);
 assert.ok(misses>=1&&misses<=3,`değişen plan ve komşu geçiş parçaları: ${third.line}`);
 assert.ok(hits>=3,third.line);
 assert.equal(third.r.durationSec,first.r.durationSec);
 assert.equal(readJson(path.join(base,'attempt3','edit-plan.json')).scenes[2].composition.textBlocks[0].lines.join(' '),'4 HAZİRAN 1942');
});

test('değişmeyen final karelerin ücretli denetimi tekrarlanmaz',async()=>{
 const dir=fs.mkdtempSync(path.join(process.env.NOVA_HOME,'review-')),video=path.join(dir,'out.mp4');
 await run(ff,['-f','lavfi','-i','testsrc=size=320x180:rate=30','-t','4','-pix_fmt','yuv420p','-y',video]);
 const editPlan={fps:30,scenes:[{id:'s0b0',frames:60,mediaType:'image'},{id:'s1b0',frames:60,mediaType:'image'}]};
 const script={sections:[{segments:[{text:'Birinci cümle.',visuals:[{}]},{text:'İkinci cümle.',visuals:[{}]}]}]};
 let reviewed=[];const reviewBatch=async batch=>{reviewed.push(...batch.map(s=>s.id));return batch.map(s=>({id:s.id,relevance:3,quality:3,hardMismatch:false,textIssue:false,observation:'Doğru an.'}));};
 const key=(id,v='a')=>reviewCacheKey({shotKey:`${id}-${v}`,narration:id,policyVersion:15,reviewVersion:3});
 const cacheFile=path.join(dir,'shot-review-cache.json'),opts=keys=>({st:{ffmpegPath:ff},editPlan,script,dir,reviewBatch,reviewKeys:keys,cacheFile});
 await buildDirectorShotReview(video,opts([key('s0b0'),key('s1b0')]));assert.deepEqual(reviewed,['s0b0','s1b0']);
 reviewed=[];const again=await buildDirectorShotReview(video,opts([key('s0b0'),key('s1b0')]));
 assert.deepEqual(reviewed,[],'hiçbir kare yeniden gönderilmez');assert.equal(again.passed,true);assert.ok(again.scenes.every(s=>s.cached));
 reviewed=[];await buildDirectorShotReview(video,opts([key('s0b0'),key('s1b0','b')]));assert.deepEqual(reviewed,['s1b0'],'yalnızca değişen plan');
 reviewed=[];await buildDirectorShotReview(video,opts([null,null]));assert.deepEqual(reviewed,['s0b0','s1b0'],'anahtar yoksa önbellek kullanılmaz');
});

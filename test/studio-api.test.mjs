import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {test,after} from 'node:test';
process.env.NOVA_HOME=fs.mkdtempSync(path.join(os.tmpdir(),'nova-studio-api-'));
process.env.NOVA_EMBEDDED='1';
const probe=net.createServer().listen(0,'127.0.0.1');await once(probe,'listening');process.env.NOVA_PORT=String(probe.address().port);await new Promise(r=>probe.close(r));
const {server,shutdown}=await import('../server.js');if(!server.listening)await once(server,'listening');
const {createJob,jobDir,updateJob}=await import('../src/store.js');
const {writeJson,run}=await import('../src/util.js');const {getSettings}=await import('../src/config.js');
const id='20260907-aabbee',dir=jobDir(id),url=`http://127.0.0.1:${server.address().port}/api/jobs/${id}`;
createJob({id,topic:'Deneme',status:'done',createdAt:new Date().toISOString(),usage:{},outputs:{}});
const image=path.join(dir,'image.png'),audio=path.join(dir,'voice.wav');
await run(getSettings().ffmpegPath,['-f','lavfi','-i','color=c=blue:s=160x90','-frames:v','1','-y',image]);
await run(getSettings().ffmpegPath,['-f','lavfi','-i','sine=frequency=440','-t','1','-y',audio]);
writeJson(path.join(dir,'script.json'),{title:'Deneme',sections:[{title:'Başlangıç',segments:[{text:'Bu görüntünün ardında ne var?',visuals:[{query:'ocean',type:'image'}]}]}]});
writeJson(path.join(dir,'media.json'),{s0b0:{beatId:'s0b0',file:image,type:'image'}});
writeJson(path.join(dir,'tts.json'),[{segId:'s0',text:'Bu görüntünün ardında ne var?',audio,duration:1,words:[]}]);
const json=async(route,method,body)=>{const r=await fetch(url+route,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
after(async()=>{const closed=once(server,'close');shutdown();await closed;});
test('editor endpoints serve real media and narration by IDs, never arbitrary filesystem paths',async()=>{
  const r=await json('/editor','GET');assert.equal(r.status,200);assert.equal(r.data.scenes[0].text,'Bu görüntünün ardında ne var?');
  for(const route of ['/media/s0b0','/voice/s0']){const r=await fetch(url+route);assert.equal(r.status,200);assert.ok((await r.arrayBuffer()).byteLength>50);}
  const outside=path.join(process.env.NOVA_HOME,'outside.txt');fs.writeFileSync(outside,'private');writeJson(path.join(dir,'media.json'),{s0b0:{file:image,type:'image'},evil:{file:outside}});
  assert.equal((await fetch(url+'/media/evil')).status,403);assert.equal((await fetch(url+'/media/__proto__')).status,404);
});
test('binary upload is validated and can replace a scene through the HTTP editor',async()=>{
  const r=await fetch(url+'/import?name=mine.png',{method:'POST',headers:{'content-type':'application/octet-stream'},body:fs.readFileSync(image)});assert.equal(r.status,200);const asset=await r.json();
  assert.equal((await fetch(url+'/asset/'+asset.asset)).status,200);
  const result=await json('/editor','PATCH',{segments:[{segId:'s0',text:'Yeni açılış.',mediaPath:asset.mediaPath}]});assert.equal(result.status,200);assert.equal(result.data.scenes[0].text,'Yeni açılış.');assert.equal(result.data.scenes[0].audioAvailable,false);
  const bad=await fetch(url+'/import?name=bad.png',{method:'POST',headers:{'content-type':'application/octet-stream'},body:Buffer.from('not a picture')});assert.equal(bad.status,400);
});
test('publication routes store manual provenance and enforce percent and active-job guards',async()=>{
  assert.equal((await json('/feedback','POST',{ctr:4.2,videoUrl:'https://youtu.be/example'})).status,200);
  const review=await json('/review','GET');assert.equal(review.data.feedback.source,'manual');assert.equal(review.data.feedback.videoUrl,'https://youtu.be/example');assert.ok(review.data.warnings.length);
  assert.equal((await json('/feedback','POST',{retention30:101})).status,400);
  updateJob(id,{status:'running'});assert.equal((await json('/editor','PATCH',{segments:[]})).status,409);assert.equal((await json('/cover','POST',{text:'Test'})).status,409);updateJob(id,{status:'done'});
});
test('quality desk HTTP routes distinguish unavailable reports and import real CSV without overwriting history',async()=>{
 updateJob(id,{status:'done',needsRerender:false});
 for(const route of ['/postflight','/speech-check','/editor-review']){
  const result=await json(route,'GET');assert.equal(result.status,200);assert.equal(result.data.available,false);
 }
 const first=await json('/audience','POST',{filename:'studio.csv',csv:'Video,Views,Impressions,Impressions click-through rate (%)\nvideo-a,210,1000,5.2',period:'First week'});
 assert.equal(first.status,200);assert.equal(first.data.report.metrics.views,210);assert.equal(first.data.report.imports.length,1);
 const second=await json('/audience','POST',{filename:'retention.csv',csv:'elapsedVideoTimeRatio,audienceWatchRatio\n0,1\n0.5,0.7\n1,0.5',durationSec:60});
 assert.equal(second.status,200);assert.equal(second.data.report.imports.length,2);assert.equal(second.data.report.metrics.retention30,70);
 assert.equal((await json('/audience','GET')).data.manual.source,'manual');
 updateJob(id,{status:'running'});
 for(const route of ['/postflight','/speech-check','/editor-review','/audience'])assert.equal((await json(route,'POST',{})).status,409);
 updateJob(id,{status:'done'});
 assert.equal((await fetch(url+'/postflight-frame/nonexistent.jpg')).status,404);
 assert.equal((await fetch(url+'/postflight-frame/invalid.txt')).status,400);
});
test('malformed and oversized CSV request JSON returns a readable JSON error',async()=>{
 const malformed=await fetch(url+'/audience',{method:'POST',headers:{'content-type':'application/json'},body:'{"csv":'});
 assert.equal(malformed.status,400);assert.match(malformed.headers.get('content-type'),/application\/json/);assert.match((await malformed.json()).error,/JSON/);
 const oversized=await fetch(url+'/audience',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({csv:'x'.repeat(33*1024*1024),filename:'large.csv'})});
 assert.equal(oversized.status,413);assert.match(oversized.headers.get('content-type'),/application\/json/);assert.match((await oversized.json()).error,/büyük/);
});

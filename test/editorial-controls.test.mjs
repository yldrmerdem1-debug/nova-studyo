import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-editorial-controls-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
assert.ok(home.toLowerCase().includes('quality-review'));

const {saveEdits,editorData}=await import('../src/pipeline/editor.js');
const {newJobFromRequest}=await import('../src/pipeline/index.js');
const store=await import('../src/store.js');
const {writeJson,readJson}=await import('../src/util.js');

let seq=0;
test('API default uses editorial and rejects inherited catalog keys without overriding an explicit valid style',()=>{
 for(const visualStyle of [undefined,'constructor','__proto__','toString'])assert.equal(newJobFromRequest({topic:'Local fixture',visualStyle}).visualStyle,'editorial');
 assert.equal(newJobFromRequest({topic:'Local fixture',visualStyle:'klasik'}).visualStyle,'klasik');
});
function fixture(status='done') {
  const id=`20260907-${(++seq).toString(16).padStart(6,'0')}`,dir=store.jobDir(id);
  store.createJob({id,status,visualStyle:'vox',editRevision:4,needsRerender:false,costBudgetUsd:7,usage:{estimatedUsd:2,budgetUsd:7},settingsSnapshot:{model:'offline'}});
  writeJson(path.join(dir,'script.json'),{beats:[{id:'b0',text:'Korunan anlatım.',visuals:[{query:'archive'}]}]});
  writeJson(path.join(dir,'media.json'),{b0:{beatId:'b0',type:'card',provider:'archive'}});
  writeJson(path.join(dir,'tts.json'),[{segId:'s0',text:'Korunan anlatım.',audio:'voice.wav',duration:1,words:[]}]);
  writeJson(path.join(dir,'seo.json'),{title:'Korunan SEO'});
  writeJson(path.join(dir,'checkpoints.json'),{script:{key:'s'},media:{key:'m'},voice:{key:'v'},seo:{key:'o'},render:{key:'r'}});
  return {id,dir};
}

test('editor exposes the visual style catalog',()=>{
  const {id}=fixture();
  const data=editorData(id);
  assert.equal(data.job.visualStyle,'vox');
  assert.ok(data.visualStyles?.editorial);
});

test('style-only edit invalidates render while preserving paid and authored assets',()=>{
  const {id,dir}=fixture();
  const files=['script.json','media.json','tts.json','seo.json'];
  const before=Object.fromEntries(files.map(name=>[name,fs.readFileSync(path.join(dir,name))]));
  const result=saveEdits(id,{visualStyle:'editorial'},()=>false);
  assert.equal(result.job.visualStyle,'editorial');
  assert.equal(result.job.editRevision,5);
  assert.equal(result.job.needsRerender,true);
  assert.equal(result.job.costBudgetUsd,7);
  assert.deepEqual(result.job.usage,{estimatedUsd:2,budgetUsd:7});
  assert.deepEqual(result.job.settingsSnapshot,{model:'offline'});
  for(const name of files)assert.deepEqual(fs.readFileSync(path.join(dir,name)),before[name],name);
  assert.deepEqual(Object.keys(readJson(path.join(dir,'checkpoints.json'))).sort(),['media','script','seo','voice']);
  assert.equal(fs.existsSync(path.join(dir,'seo-stale.json')),false);
});

test('saving the current style is a no-op',()=>{
  const {id,dir}=fixture();
  const checkpoints=fs.readFileSync(path.join(dir,'checkpoints.json'));
  const result=saveEdits(id,{visualStyle:'vox'},()=>false);
  assert.equal(result.job.editRevision,4);
  assert.equal(result.job.needsRerender,false);
  assert.deepEqual(fs.readFileSync(path.join(dir,'checkpoints.json')),checkpoints);
});

test('invalid styles and active jobs reject before mutation',()=>{
  const {id,dir}=fixture();
  const before=fs.readFileSync(store.jobFile(id));
  const checkpointsBefore=fs.readFileSync(path.join(dir,'checkpoints.json'));
  for(const visualStyle of ['expensive-invented-style','constructor','__proto__','toString']) {
    assert.throws(()=>saveEdits(id,{visualStyle},()=>false),/görsel|stil/i);
    assert.deepEqual(fs.readFileSync(store.jobFile(id)),before);
    assert.deepEqual(fs.readFileSync(path.join(dir,'checkpoints.json')),checkpointsBefore);
  }
  assert.deepEqual(fs.readFileSync(store.jobFile(id)),before);
  store.updateJob(id,{status:'running'});
  const activeBefore=fs.readFileSync(store.jobFile(id));
  assert.throws(()=>saveEdits(id,{visualStyle:'editorial'},()=>true),/aktif|sıra/i);
  assert.deepEqual(fs.readFileSync(store.jobFile(id)),activeBefore);
  assert.ok(fs.existsSync(path.join(dir,'script.json')));
});

test('new production forms default to editorial and the editor saves style with scene changes',()=>{
  const app=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const editor=fs.readFileSync(new URL('../public/studio-editor.js',import.meta.url),'utf8');
  assert.equal((app.match(/visualStyle: "editorial"/g)||[]).length,2);
  assert.match(editor,/id="edVisualStyle"/);
  assert.match(editor,/\.\.\.\(visualStyle!==data\.job\.visualStyle\?\{visualStyle\}:\{\}\)/);
  assert.match(editor,/changes\.size\|\|shotDraft\.size\|\|regenerateSeo\|\|visualStyle!==data\.job\.visualStyle/);
  assert.match(editor,/\(changes\.size\|\|shotDraft\.size\|\|regenerateSeo\|\|tabDirty\|\|visualStyle!==data\.job\.visualStyle\)&&!confirm/);
});

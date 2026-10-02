import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const module = await import('../electron/seed-resources.js').catch(e => {
  if(e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  return {};
});
const seed = (...args) => {
  assert.equal(typeof module.seedBundledResources, 'function', 'upgrade seeding helper exists');
  return module.seedBundledResources(...args);
};
function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nova-seed-'));
  const source=path.join(root,'bundle'),home=path.join(root,'home');
  for(const base of [source,home]) for(const name of ['music','assets']) fs.mkdirSync(path.join(base,name),{recursive:true});
  return {root,source,home};
}
const put=(base,file,value)=>fs.writeFileSync(path.join(base,file),value);
const read=(base,file)=>fs.readFileSync(path.join(base,file),'utf8');

test('upgrade adds missing bundled music and nested assets without replacing user files',()=>{
  const {source,home}=fixture();
  put(source,'music/new.mp3','new music');put(source,'music/existing.mp3','bundled original');
  put(home,'music/existing.mp3','user modified');put(home,'music/user.mp3','user song');
  fs.mkdirSync(path.join(source,'assets/clips'));put(source,'assets/clips/new.mp4','clip');
  seed(source,home);seed(source,home);
  assert.equal(read(home,'music/new.mp3'),'new music');
  assert.equal(read(home,'music/existing.mp3'),'user modified');
  assert.equal(read(home,'music/user.mp3'),'user song');
  assert.equal(read(home,'assets/clips/new.mp4'),'clip');
});

test('merges array provenance, preserves user metadata, and excludes modified audio',()=>{
  const {source,home}=fixture();
  for(const name of ['new','modified','existing']) put(source,`music/${name}.mp3`,name);
  put(home,'music/modified.mp3','user replacement');
  put(home,'music/existing.mp3','existing');
  const custom={file:'existing.mp3',title:'My metadata',custom:true};
  put(home,'music/music-provenance.json',JSON.stringify([custom]));
  put(source,'music/music-provenance.json',JSON.stringify([
    {file:'C:\\review\\new.mp3',title:'New',artist:'A',sourceUrl:'https://example.com/new',licenseUrl:'https://example.com/license'},
    {file:'modified.mp3',title:'Wrong attribution'},
    {file:'existing.mp3',title:'Bundled metadata'},
    {file:'../outside.mp3',title:'Unsafe'},
  ]));
  seed(source,home);seed(source,home);
  const result=JSON.parse(read(home,'music/music-provenance.json'));
  assert.deepEqual(result[0],custom);
  assert.deepEqual(result.map(x=>x.file),['existing.mp3','new.mp3']);
  assert.equal(result[1].sourceUrl,'https://example.com/new');
});

test('invalid existing provenance is preserved while missing music is still added',()=>{
  const {source,home}=fixture();
  put(source,'music/new.mp3','new');put(source,'music/music-provenance.json','[]');
  put(home,'music/music-provenance.json','user invalid JSON');
  const result=seed(source,home);
  assert.equal(read(home,'music/music-provenance.json'),'user invalid JSON');
  assert.equal(read(home,'music/new.mp3'),'new');
  assert.ok(result.warnings.length);
});

test('does not follow source or destination directory junctions',()=>{
  const {root,source,home}=fixture();
  const outside=path.join(root,'outside');fs.mkdirSync(outside);put(outside,'secret.mp4','outside');
  fs.symlinkSync(outside,path.join(source,'assets/source-link'),'junction');
  fs.symlinkSync(outside,path.join(home,'assets/destination-link'),'junction');
  fs.mkdirSync(path.join(source,'assets/destination-link'));put(source,'assets/destination-link/new.mp4','new');
  seed(source,home);
  assert.equal(fs.existsSync(path.join(home,'assets/source-link')),false);
  assert.equal(fs.existsSync(path.join(outside,'new.mp4')),false);
  assert.equal(read(outside,'secret.mp4'),'outside');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-director-mode-'));
process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {newJobFromRequest,renderPolicyVersions}=await import('../src/pipeline/index.js');
const {DIRECTOR_POLICY_VERSION}=await import('../src/pipeline/director-policy.js');
const {DIRECTOR_SHOT_REVIEW_VERSION}=await import('../src/pipeline/director-shot-review.js');
const {normalizeBeatTypes}=await import('../src/pipeline/media.js');
const {shouldSearchVideo}=await import('../src/pipeline/video-policy.js');

test('Director request round-trips canonical media fields and every retry-sensitive form value',()=>{
 const body={topic:'Director contract',mediaKind:'director',visualStyle:'hareket',aiSupport:'off',mediaMode:'manual',
  aiButce:0,aiClips:0,aiFill:0,aiSupportBudgetUsd:0,costBudgetUsd:0,collageMode:'kapali',
  transitions:'yok',ratio:'9:16',yaziModu:'obek',gorselDenetim:false,useWebSearch:false,
  editIntensity:'restrained',soundDesign:false,sfxVolume:0,subtitleMode:'none'};
 const job=newJobFromRequest(body);
 assert.deepEqual(
  {mediaKind:job.mediaKind,visualStyle:job.visualStyle,aiSupport:job.aiSupport,mediaMode:job.mediaMode},
  {mediaKind:'director',visualStyle:'editorial',aiSupport:'auto',mediaMode:'manual'}
 );
 for(const field of ['aiButce','aiClips','aiFill','aiSupportBudgetUsd','costBudgetUsd','collageMode','transitions','ratio','yaziModu','gorselDenetim','useWebSearch','editIntensity','soundDesign','sfxVolume','subtitleMode'])
  assert.equal(job[field],body[field],field);
});

test('Director defaults to automatic choice but allows a deliberate pre-render picker',async()=>{
 const {selectProductionMode,setProductionPreference,productionMode}=await import('../public/production-modes.js');
 const form={mediaKind:'mixed',visualStyle:'editorial',aiSupport:'auto',mediaMode:'manual'};
 selectProductionMode(form,'director');
 assert.equal(productionMode(form),'director');
 assert.equal(form.mediaMode,'auto');
 assert.equal(setProductionPreference(form,'mediaMode','manual'),true);
 assert.equal(newJobFromRequest({topic:'Director review',...form}).mediaMode,'manual');
 assert.equal(newJobFromRequest({topic:'Director default',mediaKind:'director'}).mediaMode,'auto');
});

test('Director keeps moving stock and preserves reconstruction prompts for the later scene director',()=>{
 const job=newJobFromRequest({topic:'Route check',mediaKind:'director'});
 const script={sections:[{segments:[{visuals:[{type:'video',query:'workers moving steel beams'},{type:'ai',prompt:'period reconstruction'}]}]}]};
 normalizeBeatTypes(job,script);
 assert.deepEqual(script.sections[0].segments[0].visuals.map(v=>v.type),['video','image']);
 assert.equal(script.sections[0].segments[0].visuals[1].prompt,'period reconstruction');
 assert.equal(shouldSearchVideo(job,script.sections[0].segments[0].visuals[0]),true);
});

test('Director policy revision participates in the creative render cache key',()=>{
 const plan={signature:'director-plan'};
 const key=renderPolicyVersions({mediaKind:'director',visualStyle:'editorial',aiSupport:'auto',editorialPlan:plan});
 assert.ok(key.includes(`director-policy:${DIRECTOR_POLICY_VERSION}`));
 assert.ok(key.includes(`director-shot-review:${DIRECTOR_SHOT_REVIEW_VERSION}`));
 assert.ok(key.includes(plan));
 assert.equal(renderPolicyVersions({mediaKind:'mixed',visualStyle:'editorial',aiSupport:'manual'}).includes(`director-policy:${DIRECTOR_POLICY_VERSION}`),false);
});
test('Director normalizes legacy planned AI into stock discovery before scene-directed assistance',async()=>{
 const {normalizeBeatTypes}=await import('../src/pipeline/media.js');
 const script={sections:[{segments:[{visuals:[{type:'ai',query:'molasses tank',prompt:'old planned AI scene'},{type:'video',query:'harbor motion'}]}]}]};
 normalizeBeatTypes({mediaKind:'director',aiSupport:'auto'},script);
 assert.deepEqual(script.sections[0].segments[0].visuals.map(v=>v.type),['image','video']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const profileUrl = new URL('../src/pipeline/style-profile.js', import.meta.url);
const soundUrl = new URL('../src/pipeline/sound-design.js', import.meta.url);
test('all seven genres have distinct editorial, camera and audio policies', async () => {
  assert.ok(fs.existsSync(profileUrl), 'genre profile module must exist');
  const { getStyleProfile } = await import(profileUrl);
  const ps = ['belgesel','hikaye','haber','analiz','egitim','top5','vox'].map(x => getStyleProfile(x));
  assert.equal(new Set(ps.map(p => p.id)).size, 7);
  assert.equal(new Set(ps.map(p => p.hookGuidance)).size, 7);
  assert.ok(ps.every(p => p.name && p.description && p.camera.speed > 0));
  assert.ok(getStyleProfile('haber').sound.minSpacing > getStyleProfile('top5').sound.minSpacing);
  assert.ok(getStyleProfile('belgesel','subtle').camera.speed < getStyleProfile('belgesel','energetic').camera.speed);
  assert.equal(getStyleProfile('missing').id, 'belgesel');
});
test('canonical UI intensity names retain their meaning and aliases remain compatible',async()=>{
  const {getStyleProfile}=await import(profileUrl);
  const calm=getStyleProfile('belgesel','restrained'),fast=getStyleProfile('belgesel','dynamic');
  assert.ok(calm.camera.speed<fast.camera.speed);
  assert.equal(calm.intensity,'restrained');assert.equal(fast.intensity,'dynamic');
  assert.deepEqual(calm,getStyleProfile('belgesel','subtle'));
  assert.deepEqual(fast,getStyleProfile('belgesel','energetic'));
});
test('sound switch, zero gain and cue bounds preserve intentional silence', async () => {
  assert.ok(fs.existsSync(soundUrl), 'sound planner module must exist');
  const { planSoundDesign, synthesizeCue } = await import(soundUrl);
  const beats = Array.from({length:100}, (_,i) => ({id:`b${i}`,dur:1,firstOfSection:i%10===0,emphasis:{type:'stat'}}));
  assert.equal(planSoundDesign(beats,{soundDesign:false}).cues.length,0);
  assert.equal(planSoundDesign(beats,{sfxVolume:0}).cues.length,0);
  const p = planSoundDesign(beats,{theme:'top5',sfxVolume:99});
  assert.ok(p.cues.length > 0 && p.cues.length < 15);
  p.cues.forEach((c,i) => {
    assert.ok(c.start >= 0 && c.start+c.duration <= p.duration);
    assert.ok(c.gain <= .3 && c.duration <= 1);
    if(i) assert.ok(c.start - p.cues[i-1].start >= p.minSpacing);
    const wav = synthesizeCue(c.kind);
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    assert.deepEqual(wav,synthesizeCue(c.kind));
    let peak=0; for(let j=44;j<wav.length;j+=2) peak=Math.max(peak,Math.abs(wav.readInt16LE(j))/32768);
    assert.ok(peak <= .5 && peak > .05);
  });
});
test('genre transitions remain sparse, manual off wins and frame totals stay exact', async () => {
  assert.ok(fs.existsSync(profileUrl), 'genre profile module must exist');
  const {getStyleProfile} = await import(profileUrl);
  const {planTransitions,frameLayout} = await import('../src/pipeline/transitions.js');
  const beats = Array.from({length:50},(_,i)=>({id:`b${i}`,dur:1.117,segIndex:i,sectionIndex:Math.floor(i/10),firstOfSection:i%10===0}));
  for(const theme of ['belgesel','haber','top5']) {
    const profile=getStyleProfile(theme);
    const plan=planTransitions(beats,{theme,profile});
    assert.ok(plan.filter(x=>x.sure>0).length < beats.length-1);
    const f=frameLayout(beats,plan,30);
    assert.equal(f.parca.reduce((a,b)=>a+b,0),Math.round(beats.reduce((a,b)=>a+b.dur,0)*30));
    assert.ok(planTransitions(beats,{profile,intensity:'yok'}).every(x=>x.sure===0));
  }
});
test('placeholder drones are excluded and camera language follows genre', async () => {
  const {muzikPlani} = await import('../src/pipeline/muzik.js');
  assert.deepEqual(muzikPlani({theme:'haber'},[30],['yatak-notr.mp3']),[]);
  const {getStyleProfile}=await import(profileUrl);
  const {hareketSec}=await import('../src/pipeline/kamera.js');
  assert.notEqual(hareketSec('yuz','orta',0,180,30,getStyleProfile('haber')).z,hareketSec('yuz','orta',0,180,30,getStyleProfile('hikaye')).z);
});
test('a single music track still follows chapter dynamics without restarting',async()=>{
  const {muzikPlani,muzikZinciri}=await import('../src/pipeline/muzik.js');
  const {getStyleProfile}=await import(profileUrl);
  const blocks=muzikPlani({theme:'belgesel'},[30,40,30],['real-notr.wav']);
  assert.equal(blocks.length,1);
  const mixed=muzikZinciri(blocks,{narration:'voice.wav',musicVolume:.16,toplamSure:100,profile:getStyleProfile('belgesel'),sectionDurations:[30,40,30]});
  assert.match(mixed.muzikZinciri,/eval=frame/,'chapter envelope must persist even when same-track blocks merge');
  assert.equal(mixed.girdiler.filter(x=>x==='-i').length,2);
});
test('genre palette replacement still honors manual transition intensity',async()=>{
  const {getStyleProfile}=await import(profileUrl);
  const {planTransitions}=await import('../src/pipeline/transitions.js');
  const beats=[{id:'a',dur:4,sectionIndex:0},{id:'b',dur:4,sectionIndex:1,firstOfSection:true}];
  const base={profile:getStyleProfile('belgesel'),kurgu:new Map([[1,{gecis:'parlat'}]])};
  const calm=planTransitions(beats,{...base,intensity:'sade'})[0];
  const full=planTransitions(beats,{...base,intensity:'sinematik'})[0];
  assert.ok(calm.sure<full.sure,'palette replacement must retain manual scaling');
  assert.notEqual(calm.tip,'fadewhite');
});

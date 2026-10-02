import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
// Dynamic imports only after isolating HOME, TEMP and music directory.
const home=path.resolve(process.env.NOVA_HOME || '');
assert.ok(home.toLowerCase().includes('quality-review'), 'explicit isolated quality-review NOVA_HOME required');
process.env.TEMP=home; process.env.TMP=home;
fs.mkdirSync(home,{recursive:true});
const {renderAll}=await import('../src/pipeline/render.js');
const {MUSIC_DIR}=await import('../src/util.js');
const {measureSound}=await import('../src/pipeline/sound-design.js');
const run=args=>execFileSync(ff,['-hide_banner','-loglevel','error',...args],{stdio:'pipe'});
test('offline rendered output persists genre and measured sound plans and respects zero music',async()=>{
  const dir=fs.mkdtempSync(path.join(home,'pro-render-'));
  const audio=path.join(dir,'voice.wav'),picture=path.join(dir,'picture.png');
  run(['-f','lavfi','-i',"aevalsrc=0.18*(sin(2*PI*180*t)+0.3*sin(2*PI*360*t))*if(lt(mod(t\\,0.7)\\,0.48)\\,1\\,0):s=48000:d=3",'-y',audio]);
  run(['-f','lavfi','-i','testsrc2=s=640x360','-frames:v','1','-y',picture]);
  // Only write music when runtime directory resolves inside our isolated home.
  assert.ok(path.resolve(MUSIC_DIR).startsWith(home+path.sep));
  fs.mkdirSync(MUSIC_DIR,{recursive:true});
  run(['-f','lavfi','-i','aevalsrc=0.08*(sin(2*PI*220*t)+sin(2*PI*275*t)+sin(2*PI*330*t))*exp(-mod(t\\,0.5)*5):s=48000:d=5','-y',path.join(MUSIC_DIR,'original-fixture-notr.wav')]);
  const script={title:'Yerel ses ve kurgu denemesi',beats:Array.from({length:4},(_,i)=>({id:`b${i}`,text:'Yerel deneme.',concept:'test',overlayText:''}))};
  const tts=script.beats.map((b,i)=>({segId:`s${i}`,duration:3,audio,words:[]}));
  const media=Object.fromEntries(script.beats.map((b,i)=>[`s${i}b0`,{type:'image',file:picture,provider:'local original'}]));
  const killer={cancelled:false,add(){},remove(){},delete(){}};
  for(const [theme,musicVolume,soundDesign] of [['haber',0,false],['top5',.16,true],['belgesel',.16,true]]) {
    const out=path.join(dir,theme);fs.mkdirSync(out);
    const selected=theme==='belgesel'?{title:script.title,sections:script.beats.map((_,i)=>({title:`Bölüm ${i+1}`,segments:[{text:'Yerel deneme.',emphasis:{type:'none'},visuals:[{type:'image',query:'test',kind:'generic'}]}]}))}:script;
    const r=await renderAll({id:`pro-${theme}`,theme,subtitleMode:'none',transitions:'yok',demo:true,musicVolume,soundDesign,
      settingsSnapshot:{preset:'ultrafast',crf:30,fps:15,concurrency:1,cinemaGrade:false}},selected,media,tts,out,()=>{},()=>{},killer);
    assert.ok(fs.existsSync(path.join(out,'edit-plan.json')),'render must persist reviewable edit plan');
    const edit=JSON.parse(fs.readFileSync(path.join(out,'edit-plan.json')));
    const sound=JSON.parse(fs.readFileSync(path.join(out,'sound-plan.json')));
    assert.equal(edit.profile.id,theme);assert.ok(edit.transitions.every(p=>p.sure===0));
    assert.equal(edit.crf,30);assert.equal(sound.music.enabled,musicVolume>0);
    if(theme==='belgesel') assert.ok(sound.cues.length>0,'section boundaries must reach rendered SFX mix');
    const actual=JSON.parse(execFileSync(probe.path,['-v','error','-show_format','-of','json',path.join(out,'output.mp4')],{encoding:'utf8'}));
    assert.ok(Math.abs(Number(actual.format.duration)-r.durationSec)<.08);
    const measured=await measureSound(ff,path.join(out,'output.mp4'));
    assert.ok(measured.truePeakDb<=-.8 && measured.truePeakDb>=-18);
    console.log(JSON.stringify({theme,duration:actual.format.duration,measured,out}));
  }
});
test('unusable source media leaves actionable review warnings after successful fallback render',async()=>{
  const dir=fs.mkdtempSync(path.join(home,'pro-degraded-')),audio=path.join(dir,'voice.wav'),bad=path.join(dir,'broken.jpg');
  run(['-f','lavfi','-i','sine=frequency=240:duration=2','-y',audio]);fs.writeFileSync(bad,'not an image');
  const script={title:'Kaynak denemesi',sections:[{title:'Test',segments:[{text:'Kaynak denemesi.',visuals:[{type:'image',query:'Kaynak denemesi',kind:'generic'}]}]}]};
  const r=await renderAll({id:'bad-source',theme:'haber',language:'tr',demo:true,subtitleMode:'none',transitions:'yok',musicVolume:0,soundDesign:false,settingsSnapshot:{crf:30,preset:'ultrafast',fps:15,concurrency:1,cinemaGrade:false}},script,{'s0b0':{type:'image',file:bad}},[{segId:'s0',audio,duration:2,words:[]}],dir,()=>{},()=>{},{cancelled:false,add(){},remove(){},delete(){}});
  assert.ok(r.qualityWarnings.some(x=>/yedek kart/i.test(x)),'successful fallback must still require visual review');
  assert.ok(r.qualityWarnings.some(x=>/kapak/i.test(x)),'missing thumbnails must be reported for publication review');
});

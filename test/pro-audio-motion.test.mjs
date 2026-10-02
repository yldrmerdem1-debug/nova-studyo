import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
const home=path.resolve(process.env.NOVA_HOME || '');
assert.ok(home.toLowerCase().includes('quality-review'),'isolated quality-review home required');
process.env.TEMP=home;process.env.TMP=home;
const {planSoundDesign,writeSoundStem,appendSoundMix,measureSound}=await import('../src/pipeline/sound-design.js');
const {normalizeEt}=await import('../src/pipeline/loudness.js');
const {muzikZinciri}=await import('../src/pipeline/muzik.js');
const {getStyleProfile}=await import('../src/pipeline/style-profile.js');
const {kameraFiltresi}=await import('../src/pipeline/kamera.js');
const {renderScene}=await import('../src/pipeline/motion.js');
const {makeCanvas}=await import('../src/pipeline/canvas.js');
const run=args=>execFileSync(ff,['-hide_banner','-loglevel','error',...args],{stdio:'pipe'});
test('original sound stem is sparse and all genres render valid camera filters with bounded mastered peaks',async()=>{
  const dir=fs.mkdtempSync(path.join(home,'pro-stems-'));
  const voice=path.join(dir,'voice.wav'),music=path.join(dir,'music.wav');
  run(['-f','lavfi','-i','aevalsrc=0.15*(sin(2*PI*180*t)+0.3*sin(2*PI*360*t))*if(lt(mod(t\\,0.7)\\,0.48)\\,1\\,0):s=48000:d=24','-y',voice]);
  run(['-f','lavfi','-i','aevalsrc=0.018*(sin(2*PI*220*t)+sin(2*PI*275*t)+sin(2*PI*330*t))*exp(-mod(t\\,0.5)*5):s=48000:d=24','-y',music]);
  const source=path.join(dir,'source.png');run(['-f','lavfi','-i','testsrc2=s=640x360','-frames:v','1','-y',source]);
  const summaries=[];
  for(const theme of ['belgesel','hikaye','haber','analiz','egitim','top5','vox']) {
    const profile=getStyleProfile(theme);
    const p=planSoundDesign(Array.from({length:12},(_,i)=>({id:`b${i}`,dur:2,firstOfSection:i%3===0,emphasis:{type:'stat'}})),{profile});
    assert.ok(p.cues.length>0);
    const stem=writeSoundStem(p,path.join(dir,`${theme}-sfx.wav`));
    const samples=fs.readFileSync(stem);let active=0,peak=0;
    for(let i=44;i<samples.length;i+=2){const a=Math.abs(samples.readInt16LE(i));if(a>10)active++;peak=Math.max(peak,a);}
    assert.ok(active/((samples.length-44)/2)<.06);assert.ok(peak/32768<.12);
    const musicMix=muzikZinciri([{dosya:music,sure:24,asama:0}],{narration:voice,musicVolume:1,toplamSure:24,profile,sectionDurations:[8,8,8]});
    const mix=appendSoundMix(musicMix.girdiler, `${musicMix.muzikZinciri};[0:a]aformat=sample_rates=48000:channel_layouts=stereo[voice];[voice][mus]amix=inputs=2:duration=first:normalize=0`,stem);
    const audio=path.join(dir,`${theme}.m4a`);
    await normalizeEt(ff,mix.inputs,mix.chain,audio);
    const measured=await measureSound(ff,audio);
    assert.ok(measured.truePeakDb<=-.8);assert.ok(Math.abs(measured.integratedLufs+14)<1);
    // Real renderer's camera chain, every genre, at small local fixture size.
    const video=path.join(dir,`${theme}-motion.mp4`);
    run(['-i',source,'-vf',kameraFiltresi('yuz','orta',0,60,30,{w:640,h:360},profile),'-frames:v','60','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-y',video]);
    const duration=Number(execFileSync(probe.path,['-v','error','-show_entries','format=duration','-of','csv=p=0',video],{encoding:'utf8'}));
    assert.ok(Math.abs(duration-2)<.04);
    summaries.push({theme,cues:p.cues.length,measured,video});
  }
  const K=makeCanvas('16:9');K.w=640;K.h=360;K.genis='scale=896:504';
  await renderScene({st:{ffmpegPath:ff,fps:30,crf:30,preset:'ultrafast',concurrency:1},kanvas:K,arkaplan:{tur:'gorsel',src:source,grade:false},frames:60,outFile:path.join(dir,'cinematic.mp4'),profile:getStyleProfile('hikaye')});
  fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(summaries,null,2));
  console.log(JSON.stringify({dir,summaries}));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import ff from 'ffmpeg-static';
import probe from 'ffprobe-static';
import {planSoundDesign,synthesizeCue,writeSoundStem} from '../src/pipeline/sound-design.js';

const beats=[{id:'opening',dur:3},{id:'evidence',dur:4},{id:'close',dur:3}];

test('editorial cues follow validated visual events and stay sparse',()=>{
  const events=[
    {beatId:'opening',event:'reveal',start:.25},
    {beatId:'opening',event:'accent',start:.3}, // too close to the reveal
    {beatId:'evidence',event:'accent',start:4.2},
    {beatId:'close',event:'section',start:8.7},
    {beatId:'missing',event:'accent',start:5},
    {beatId:'close',event:'unknown',start:9},
    {beatId:'close',event:'accent',start:'7'},
    {beatId:'close',event:'accent',start:10.1},
    {beatId:'close',event:'accent',start:Number.NaN},
  ];
  const plan=planSoundDesign(beats,{theme:'top5',sfxVolume:.2,editorialEvents:events});
  assert.deepEqual(plan.cues.map(c=>[c.beatId,c.event,c.start]),[
    ['opening','reveal',.25],['evidence','accent',4.2],['close','section',8.7],
  ]);
  assert.ok(plan.cues.every(c=>['editorial-sweep','editorial-impact'].includes(c.kind)));
  assert.ok(plan.cues.every(c=>c.start>=0 && c.start+c.duration<=plan.duration));
  plan.cues.forEach((cue,i)=>{
    assert.ok(cue.gain>0 && cue.gain<=.3);
    if(i) assert.ok(cue.start>=plan.cues[i-1].start+plan.cues[i-1].duration);
  });
  assert.ok(plan.warnings.length>=4);
});

test('editorial policy is genre-aware, deterministic, and honors silence controls',()=>{
  const events=[{beatId:'opening',event:'reveal',start:.4},{beatId:'evidence',event:'accent',start:5}];
  const news=planSoundDesign(beats,{theme:'haber',editorialEvents:events});
  const story=planSoundDesign(beats,{theme:'hikaye',editorialEvents:events});
  assert.notDeepEqual(news.cues.map(c=>[c.kind,c.gain]),story.cues.map(c=>[c.kind,c.gain]));
  assert.deepEqual(news,planSoundDesign(beats,{theme:'haber',editorialEvents:events}));
  assert.equal(planSoundDesign(beats,{soundDesign:false,editorialEvents:events}).cues.length,0);
  assert.equal(planSoundDesign(beats,{sfxVolume:0,editorialEvents:events}).cues.length,0);
  assert.equal(planSoundDesign(beats,{editorialEvents:[]}).cues.length,0);
});

test('editorial transients render a real bounded WAV stem',()=>{
  const plan=planSoundDesign(beats,{theme:'analiz',sfxVolume:.2,editorialEvents:[
    {beatId:'opening',event:'reveal',start:.2},{beatId:'evidence',event:'accent',start:5.5},
  ]});
  for(const cue of plan.cues){
    const wav=synthesizeCue(cue.kind);
    assert.equal(wav.toString('ascii',0,4),'RIFF');
    let peak=0;for(let i=44;i<wav.length;i+=2) peak=Math.max(peak,Math.abs(wav.readInt16LE(i))/32768);
    assert.ok(peak>.05 && peak<=.5);
  }
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nova-editorial-audio-'));
  const file=writeSoundStem(plan,path.join(dir,'editorial.wav'));
  const duration=Number(execFileSync(probe.path,['-v','error','-show_entries','format=duration','-of','csv=p=0',file],{encoding:'utf8'}));
  assert.ok(Math.abs(duration-plan.duration)<.001);
  const measured=spawnSync(ff,['-hide_banner','-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8'});
  assert.equal(measured.status,0);
  const peak=/max_volume:\s*(-?[\d.]+) dB/.exec(measured.stderr);
  assert.ok(peak,'FFmpeg must report a real peak');
  assert.ok(Number(peak[1])<=-12 && Number(peak[1])>-60,'stem peak must be audible and leave mix headroom');
});

test('legacy cue waveforms remain byte-for-byte compatible',()=>{
  const expected={
    tick:'81a3782de14b0f9b525381be5ebb1cb4283f844ee24c0c08fd8e0f1ee8bc41d1',
    pop:'d173d52a5d0d3280f49eb1eefcd6c15dc0d7bbfe8b0268e9811e93010f3430b3',
    bell:'217c72b3e497cf05068cb49b0ffbcd23b3596c3af56915e3fb06dae393483b52',
    'soft-hit':'a6434f6b526a0e8c6c79ac0d05a2b546699e823439be767a8e35a16c34e1ca0c',
  };
  for(const [kind,hash] of Object.entries(expected)) {
    assert.equal(crypto.createHash('sha256').update(synthesizeCue(kind)).digest('hex'),hash);
  }
});

test('editorial sweep is a deterministic band-limited swish and impact stays low and brief',()=>{
  const sweep=synthesizeCue('editorial-sweep'),impact=synthesizeCue('editorial-impact');
  assert.deepEqual(sweep,synthesizeCue('editorial-sweep'));
  assert.equal((sweep.length-44)/2,Math.round(.42*48000));
  assert.equal((impact.length-44)/2,Math.round(.22*48000));
  const edgePeak=(wav,from,to)=>{let p=0;for(let i=from;i<to;i++)p=Math.max(p,Math.abs(wav.readInt16LE(44+i*2)));return p/32768;};
  assert.ok(edgePeak(sweep,0,100)<.03,'swish must attack smoothly');
  assert.ok(edgePeak(sweep,Math.round(.42*48000)-100,Math.round(.42*48000))<.03,'swish must release smoothly');
  assert.ok(edgePeak(impact,Math.round(.18*48000),Math.round(.22*48000))<.04,'impact tail must decay quickly');
});

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as pipeline from './pipeline/index.js';
import { jobDir, getJob } from './store.js';
import { readJson } from './util.js';
import { importAsset, importedAsset, regenerateCover, publicationReview, savePublicationFeedback } from './publication.js';
import {readReviewRecord,saveReviewRecord} from './review-record.js';

export const studioRouter = express.Router({ mergeParams:true });
studioRouter.use((req,res,next) => {
  if (!/^\d{8}-[a-f0-9]{6}$/.test(req.params.id || '')) return res.status(400).json({error:'Geçersiz iş kimliği.'});
  if (!getJob(req.params.id)) return res.status(404).json({error:'İş bulunamadı.'});
  next();
});
const action = fn => async (req,res,next) => { try { res.json(await fn(req)); } catch(e) { next(e); } };
// A cancelled job may still be unwinding provider requests. Check the running
// worker registry too, before a quality/import writer acquires its local lock.
studioRouter.use(['/editor-review','/postflight','/audience','/speech-check'],(req,res,next)=>{
  try {if(req.method==='POST')pipeline.assertJobInactive(req.params.id);next();}catch(e){next(e);}
});
studioRouter.get('/editor', action(req => pipeline.getEditorData(req.params.id)));
studioRouter.patch('/editor', action(async req => {
  // A chosen clip in-point must fit its real source before it is saved.
  const shots=req.body?.shots;
  if(shots&&typeof shots==='object'){
    const {validateSourceStart}=await import('./shot-preview.js');
    for(const [beat,edit] of Object.entries(shots))if(edit&&Number.isFinite(Number(edit.sourceStart))&&edit.sourceStart!==null)await validateSourceStart(req.params.id,beat,Number(edit.sourceStart));
  }
  return pipeline.saveEditorChanges(req.params.id,req.body);
}));
studioRouter.post('/shot-preview/:beat', action(async req => {
  pipeline.assertJobInactive(req.params.id);
  return (await import('./shot-preview.js')).previewShot(req.params.id,req.params.beat,req.body?.edit);
}));
studioRouter.get('/shot-source/:beat', action(async req => (await import('./shot-preview.js')).shotSource(req.params.id,req.params.beat)));
studioRouter.get('/shot-source-frame/:beat', async (req,res,next) => {
  try {res.setHeader('Cache-Control','private, max-age=3600');res.sendFile(scopedFile(req.params.id,await (await import('./shot-preview.js')).shotSourceFrame(req.params.id,req.params.beat,req.query.t)));} catch(e){next(e);}
});
studioRouter.get('/preview/:name', (req,res,next) => {
  try {if(!/^s\d{1,4}b\d{1,2}-[0-9a-f]{16}\.mp4$/.test(req.params.name)){const e=new Error('Geçersiz önizleme.');e.statusCode=400;throw e;}res.sendFile(scopedFile(req.params.id,path.join(jobDir(req.params.id),'editor-preview',req.params.name)));} catch(e){next(e);}
});
studioRouter.post('/resume', action(req => ({job:pipeline.resumeJob(req.params.id)})));
studioRouter.post('/rerender', action(req => ({job:pipeline.rerenderJob(req.params.id)})));
studioRouter.post('/patch', action(req => ({job:pipeline.patchJob(req.params.id, req.body?.scenes)})));
studioRouter.get('/review', action(req => publicationReview(req.params.id)));
studioRouter.get('/editor-review', action(req => readReviewRecord(req.params.id)));
studioRouter.post('/editor-review', action(req => saveReviewRecord(req.params.id,req.body)));
studioRouter.get('/postflight', action(async req => (await import('./postflight.js')).readPostflight(req.params.id)));
studioRouter.post('/postflight', action(async req => (await import('./postflight.js')).buildPostflight(req.params.id)));
studioRouter.get('/audience', action(async req => (await import('./audience.js')).audienceReport(req.params.id)));
studioRouter.post('/audience', action(async req => (await import('./audience.js')).importAudience(req.params.id,req.body)));
studioRouter.get('/speech-check', action(async req => (await import('./speech-check.js')).readSpeechCheck(req.params.id)));
studioRouter.post('/speech-check', action(async req => (await import('./speech-check.js')).checkSpeech(req.params.id,{force:req.body?.force===true})));
studioRouter.post('/feedback', action(req => savePublicationFeedback(req.params.id,req.body)));
studioRouter.post('/cover', action(req => regenerateCover(req.params.id,req.body)));
studioRouter.post('/import', express.raw({type:['application/octet-stream','image/*','video/*'],limit:'128mb'}), action(req => importAsset(req.params.id,String(req.query.name || ''),req.body)));

function scopedFile(id,file) {
  if (!file || !fs.existsSync(file)) { const e=new Error('Önizleme dosyası bulunamadı.'); e.statusCode=404; throw e; }
  const root=fs.realpathSync(jobDir(id))+path.sep, real=fs.realpathSync(file);
  if (!real.toLowerCase().startsWith(root.toLowerCase())) { const e=new Error('Önizleme bu işe ait değil.');e.statusCode=403;throw e; }
  return real;
}
studioRouter.get('/asset/:name', (req,res,next) => { try {res.sendFile(importedAsset(req.params.id,req.params.name));} catch(e){next(e);} });
studioRouter.get('/postflight-frame/:name',(req,res,next)=>{
  try {if(!/^[a-zA-Z0-9_.-]{1,100}\.jpg$/.test(req.params.name)){const e=new Error('Geçersiz örnek kare.');e.statusCode=400;throw e;}res.sendFile(scopedFile(req.params.id,path.join(jobDir(req.params.id),'postflight-frames',req.params.name)));}catch(e){next(e);}
});
// A still from the delivered video at the middle of one shot, for the shot list.
studioRouter.get('/shot-frame/:beat', async (req,res,next) => {
  try {
    if(!/^s\d{1,4}b\d{1,2}$/.test(req.params.beat)){const e=new Error('Geçersiz plan.');e.statusCode=400;throw e;}
    const dir=jobDir(req.params.id),video=path.join(dir,'output.mp4'),plan=readJson(path.join(dir,'edit-plan.json'));
    const i=plan?.scenes?.findIndex(s=>s.id===req.params.beat);
    if(!fs.existsSync(video)||!(i>=0)){const e=new Error('Plan karesi bulunamadı.');e.statusCode=404;throw e;}
    const start=plan.scenes.slice(0,i).reduce((t,s)=>t+s.frames/plan.fps,0),dur=plan.scenes[i].frames/plan.fps;
    const out=path.join(dir,'editor-frames',`${req.params.beat}-${Math.round(fs.statSync(video).mtimeMs)}.jpg`);
    if(!fs.existsSync(out)){
      fs.mkdirSync(path.dirname(out),{recursive:true});
      const {getSettings}=await import('./config.js');const {run}=await import('./util.js');
      await run(getSettings().ffmpegPath,['-ss',(start+Math.min(dur*.6,dur-.1)).toFixed(3),'-i',video,'-frames:v','1','-vf','scale=480:-2','-q:v','4','-y',out],{timeoutMs:30000});
    }
    res.setHeader('Cache-Control','private, max-age=86400');res.sendFile(scopedFile(req.params.id,out));
  } catch(e){next(e);}
});
studioRouter.get('/media/:beat', (req,res,next) => {
  try { const media=readJson(path.join(jobDir(req.params.id),'media.json'),{}); const entry=Object.hasOwn(media,req.params.beat) ? media[req.params.beat] : null; res.sendFile(scopedFile(req.params.id,entry?.file)); } catch(e){next(e);}
});
studioRouter.get('/voice/:seg', (req,res,next) => {
  try { const tts=readJson(path.join(jobDir(req.params.id),'tts.json'),[]);const entry=tts.find(t=>t.segId===req.params.seg);res.sendFile(scopedFile(req.params.id,entry?.audio)); } catch(e){next(e);}
});
studioRouter.use((e,req,res,next) => {
  if(res.headersSent) return next(e);
  res.status(e.statusCode || e.status || 400).json({error:e.type==='entity.too.large' ? 'Dosya en fazla 128 MB olabilir.' : e.message || 'İşlem tamamlanamadı.'});
});

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJson, writeJson } from '../util.js';
import { getSettings, VISUAL_STYLES } from '../config.js';
import { settingsPatch } from '../settings-input.js';
import { getJob, updateJob, jobDir, publicJob } from '../store.js';
import { scriptScenes, validScript, validMedia, validVoice, invalidateCheckpoints } from './checkpoints.js';
import {prepareAiFailureRetry} from './ai-retry.js';
import {readShotEdits,mergeShotEdits,writeShotEdits,SHOT_CAMERAS,SHOT_TRANSITIONS} from './shot-edits.js';
import {planEditorialShot} from './editorial-shots.js';

// Timeline of the delivered video, read from its edit plan: what each shot
// shows now and which transition enters it. Shot decisions refer to these ids.
function shotTimeline(dir,script,job){
  const plan=readJson(path.join(dir,'edit-plan.json'));
  if(!Array.isArray(plan?.scenes)||!Number(plan.fps))return null;
  const texts=scriptScenes(script).map(s=>s.segment.text||'');
  let t=0;const shown=[];
  const shots=plan.scenes.map((s,i)=>{
    const c=s.composition||{},start=t;t+=(Number(s.frames)||0)/plan.fps;
    const seg=Number(String(s.id).match(/^s(\d+)b/)?.[1]);
    const tr=i>0?plan.transitions?.[i-1]:null;
    // Aynı fotoğraf ya da aynı videonun aynı anı daha önce gösterildiyse işaretle.
    const from=Number(c.sourceStartFrame)||0,earlier=s.sourceId?shown.find(x=>x.src===s.sourceId&&(s.mediaType!=='video'||Math.abs(x.from-from)<2*plan.fps)):null;
    if(s.sourceId)shown.push({src:s.sourceId,from,id:s.id});
    return {id:s.id,index:i,start:+start.toFixed(3),duration:+((Number(s.frames)||0)/plan.fps).toFixed(3),mediaType:s.mediaType,
      narration:Number.isInteger(seg)?String(texts[seg]||'').slice(0,240):'',
      overlay:(c.textBlocks||[]).map(b=>(b.lines||[]).join(' ')).filter(Boolean),overlayPosition:c.overlayPosition||null,
      camera:c.camera?.mode||null,repeatOf:earlier?.id||null,segIndex:Number.isInteger(s.segIndex)?s.segIndex:seg,
      // Kesme noktası yalnızca aynı cümlenin önceki planıyla kaydırılabilir.
      rollWith:i>0&&(plan.scenes[i-1].segIndex??Number(String(plan.scenes[i-1].id).match(/^s(\d+)b/)?.[1]))===(Number.isInteger(s.segIndex)?s.segIndex:seg)?{id:plan.scenes[i-1].id,duration:+((Number(plan.scenes[i-1].frames)||0)/plan.fps).toFixed(3)}:null,
      sourceStart:s.mediaType==='video'?+((Number(c.sourceStartFrame)||0)/plan.fps).toFixed(2):null,transitionIn:tr?{tip:tr.tip||'',sure:Number(tr.sure)||0}:null};
  });
  return {editorial:plan.visualStyle==='editorial',fps:plan.fps,width:plan.scenes[0]?.composition?.width||null,height:plan.scenes[0]?.composition?.height||null,shots};
}

export function editorError(message, statusCode = 400) { const e = new Error(message); e.statusCode = statusCode; return e; }
export function requireInactive(jobId, active = () => false) {
  const job = getJob(jobId);
  if (!job) throw editorError('İş bulunamadı.', 404);
  if (active(jobId) || ['running', 'queued', 'awaiting_picks', 'awaiting_cost'].includes(job.status)) throw editorError('İş aktif veya sırada. Düzenlemek için durmasını bekleyin.', 409);
  return job;
}
export function editorData(jobId, active = () => false) {
  const job = getJob(jobId); if (!job) throw editorError('İş bulunamadı.', 404);
  if (job.mediaKind === 'docu') throw editorError('Sinematik Belgesel işlerinde sahne editörü kullanılmaz: kurgu docu-script.json içinde. Değişiklik için işi yeniden oluşturun veya senaryoyu JSON olarak yükleyin.', 409);
  const dir = jobDir(jobId), script = readJson(path.join(dir, 'script.json'));
  const media = readJson(path.join(dir, 'media.json'), {}), tts = readJson(path.join(dir, 'tts.json'), []);
  const scenes = scriptScenes(script).map(s => ({
    segId:s.segId, sectionIndex:s.sectionIndex, segmentIndex:s.segmentIndex, text:s.segment.text,
    visuals:s.segment.visuals || (s.segment.visual ? [s.segment.visual] : []),
    media:s.beatIds.map(beatId => ({ beatId, ...media[beatId], available:validMedia(media[beatId]) })),
    audioAvailable:validVoice(tts.find(t => t?.segId === s.segId), s.segment.ses || s.segment.text),
  }));
  const missingSteps = [];
  if (!validScript(script)) missingSteps.push('script');
  if (scenes.some(s => s.media.some(m => !m.available))) missingSteps.push('media');
  if (scenes.some(s => !s.audioAvailable)) missingSteps.push('voice');
  const inactive = !active(jobId) && !['running','queued','awaiting_picks','awaiting_cost'].includes(job.status);
  const timeline=shotTimeline(dir,script,job);
  return { job:publicJob(job), script, scenes, timeline, shotEdits:readShotEdits(dir), shotOptions:{cameras:SHOT_CAMERAS,transitions:Object.fromEntries(Object.entries(SHOT_TRANSITIONS).map(([k,v])=>[k,{name:v.name,duration:v.sure}]))}, visualStyles:VISUAL_STYLES, capabilities:{ canEditShots:inactive&&!!timeline, canAdjustBudget:inactive, canEdit:inactive && validScript(script), canResume:inactive && ['error','cancelled','interrupted'].includes(job.status), canRerender:inactive && validScript(script), missingSteps,
    warnings:missingSteps.map(stage => ({script:'Senaryo eksik; devam etmek için yeniden üretilecek.', media:'Bazı kaynak görseller eksik; yalnızca eksik görseller yeniden alınacak. Ücretli üretim gerekebilir.',voice:'Bazı sahnelerin sesi eksik veya değişmiş; yalnızca bu sesler yeniden üretilecek. Ücretli ses sağlayıcısı kullanılıyorsa ücret doğabilir.'})[stage]) } };
}
function localMedia(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /^[/\\]{2}|^[a-z]+:\/\//i.test(file) || file.includes('\0')) throw editorError('Yerel bir görsel/video dosyasının tam yolunu seçin.');
  const ext = path.extname(file).toLowerCase();
  if (!['.jpg','.jpeg','.png','.webp','.mp4','.mov','.webm'].includes(ext)) throw editorError('Desteklenen biçimler: JPG, PNG, WebP, MP4, MOV, WebM.');
  let stat; try { stat=fs.statSync(file); } catch { throw editorError('Seçilen medya dosyası bulunamadı.'); }
  if (!stat.isFile() || stat.size < 12 || stat.size > 2 * 1024 ** 3) throw editorError('Medya geçersiz, boş veya 2 GB sınırından büyük.');
  const fd=fs.openSync(file,'r'), bytes=Buffer.alloc(16); try { fs.readSync(fd,bytes,0,16,0); } finally { fs.closeSync(fd); }
  const type=['.mp4','.mov','.webm'].includes(ext) ? 'video':'image';
  const valid = (['.jpg','.jpeg'].includes(ext) && bytes[0]===255 && bytes[1]===216) || (ext==='.png' && bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))) || (ext==='.webp' && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') || (['.mp4','.mov'].includes(ext) && bytes.toString('ascii',4,8)==='ftyp') || (ext==='.webm' && bytes.subarray(0,4).equals(Buffer.from('1a45dfa3','hex')));
  if (!valid) throw editorError('Dosyanın içeriği seçilen medya biçimiyle eşleşmiyor.');
  const resolved=fs.realpathSync(file);
  if(/^[/\\]{2}/.test(resolved)) throw editorError('Ağ klasörü yerine yerel bir dosya seçin.');
  return { file:resolved, ext,type };
}
export function saveEdits(jobId, patch, active) {
  const job=requireInactive(jobId,active), dir=jobDir(jobId);
  if (job.mediaKind === 'docu') throw editorError('Sinematik Belgesel işlerinde sahne editörü kullanılmaz: kurgu docu-script.json içinde. Değişiklik için işi yeniden oluşturun veya senaryoyu JSON olarak yükleyin.', 409);
  if (!patch || typeof patch!=='object' || Array.isArray(patch)) throw editorError('Düzenleme verisi geçersiz.');
  for (const key of Object.keys(patch)) if (!['segments','thumbnailText','guidance','regenerateSeo','costBudgetUsd','aiSupportBudgetUsd','refreshModelRates','visualStyle','retryAiFailures','shots'].includes(key)) throw editorError(`Bilinmeyen düzenleme alanı: ${key}`);
  if(patch.retryAiFailures!==undefined&&typeof patch.retryAiFailures!=='boolean')throw editorError('AI yeniden deneme seçimi geçersiz.');
  if(patch.retryAiFailures===true&&job.aiSupport!=='auto')throw editorError('AI yeniden deneme yalnızca otomatik AI destekli işlerde kullanılabilir.');
  if(patch.aiSupportBudgetUsd!==undefined&&(typeof patch.aiSupportBudgetUsd!=='number'||!Number.isFinite(patch.aiSupportBudgetUsd)||patch.aiSupportBudgetUsd<0||patch.aiSupportBudgetUsd>10000))throw editorError('AI destek bütçesi 0–10000 USD arasında olmalı.');
  if (patch.visualStyle !== undefined && (typeof patch.visualStyle !== 'string' || !Object.hasOwn(VISUAL_STYLES,patch.visualStyle))) throw editorError('Görsel stil geçersiz.');
  if (patch.costBudgetUsd !== undefined && (typeof patch.costBudgetUsd !== 'number' || !Number.isFinite(patch.costBudgetUsd) || patch.costBudgetUsd < 0 || patch.costBudgetUsd > 10000)) throw editorError('Model bütçesi 0–10000 USD arasında bir sayı olmalı; 0 sınırı kapatır.');
  if (patch.refreshModelRates !== undefined && typeof patch.refreshModelRates !== 'boolean') throw editorError('Model fiyatlarını yenileme seçimi geçersiz.');
  let refreshedRates;
  if (patch.refreshModelRates === true) {
    try { refreshedRates = settingsPatch({modelRates:getSettings().modelRates || {}}).modelRates; }
    catch { throw editorError('Güncel model fiyatları geçersiz. Önce Ayarlar bölümündeki fiyatları düzeltin.'); }
  }
  const budgetChanged = patch.costBudgetUsd !== undefined || patch.aiSupportBudgetUsd !== undefined || refreshedRates !== undefined;
  const budgetPatch = budgetChanged ? {
    ...(patch.aiSupportBudgetUsd !== undefined ? {aiSupportBudgetUsd:patch.aiSupportBudgetUsd} : {}),
    ...(patch.costBudgetUsd !== undefined ? {costBudgetUsd:patch.costBudgetUsd} : {}),
    usage:{...(job.usage || {}), ...(patch.costBudgetUsd !== undefined ? {budgetUsd:patch.costBudgetUsd} : {}), ...(refreshedRates !== undefined ? {modelRates:structuredClone(refreshedRates)} : {})},
    ...(refreshedRates !== undefined ? {settingsSnapshot:{...(job.settingsSnapshot || {}),modelRates:structuredClone(refreshedRates)}} : {}),
  } : {};
  const script=readJson(path.join(dir,'script.json'));
  const needsScript = (Array.isArray(patch.segments) && patch.segments.length > 0) || patch.thumbnailText !== undefined || patch.guidance !== undefined || patch.regenerateSeo === true;
  if (!validScript(script) && needsScript) throw editorError('Senaryo bulunamadı; önce işe devam edin.');
  const scenes=scriptScenes(script), byId=new Map(scenes.map(s=>[s.segId,s])), seen=new Set();
  if (patch.segments !== undefined && !Array.isArray(patch.segments)) throw editorError('Sahneler liste olmalı.');
  const changes=(patch.segments || []).map(p=>{
    if (!p || !byId.has(p.segId) || seen.has(p.segId)) throw editorError('Sahne kimliği geçersiz veya tekrarlanmış.'); seen.add(p.segId);
    for(const k of Object.keys(p)) if(!['segId','text','mediaPath'].includes(k)) throw editorError('Bilinmeyen sahne alanı.');
    if (p.text!==undefined && (typeof p.text!=='string' || !p.text.trim() || p.text.length>5000)) throw editorError('Sahne metni 1–5000 karakter olmalı.');
    return {scene:byId.get(p.segId),text:p.text?.trim(),media:p.mediaPath!==undefined ? localMedia(p.mediaPath):null};
  });
  for(const [key,max] of [['thumbnailText',120],['guidance',1000]]) if(patch[key]!==undefined && (typeof patch[key]!=='string' || patch[key].length>max)) throw editorError(`${key} en fazla ${max} karakter olmalı.`);
  if(patch.regenerateSeo!==undefined && typeof patch.regenerateSeo!=='boolean') throw editorError('SEO yenileme seçimi geçersiz.');
  let aiRetry;
  if(patch.retryAiFailures===true){try{aiRetry=prepareAiFailureRetry(dir);}catch(e){throw editorError(e.message);}}
  let shotsChanged=false,nextShots=null;
  if(patch.shots!==undefined){
    const timeline=shotTimeline(dir,script,job);
    if(!timeline)throw editorError('Plan düzenlemesi için önce videonun bir kez render edilmesi gerekiyor.');
    const current=readShotEdits(dir);
    try{nextShots=mergeShotEdits(current,patch.shots,new Set(timeline.shots.map(s=>s.id)));}catch(e){throw editorError(e.message);}
    // A custom overlay must fit the subtitle-safe area now, not fail mid-render.
    const canvas={w:timeline.width||1920,h:timeline.height||1080};
    for(const [id,e] of Object.entries(nextShots)){
      if(e.overlay?.mode!=='custom'||JSON.stringify(e.overlay)===JSON.stringify(current[id]?.overlay))continue;
      const index=timeline.shots.findIndex(x=>x.id===id);
      try{planEditorialShot({director:true,canvas,index,beat:{id,dur:Math.max(2,timeline.shots[index]?.duration||6),isVideoStart:index===0,media:{type:'image',editorial:{overlay:e.overlay}}}});}
      catch{throw editorError(`${id}: ekran yazısı güvenli alana sığmıyor; daha kısa yazın.`);}
    }
    shotsChanged=JSON.stringify(current)!==JSON.stringify(nextShots);
  }
  let textChanged=false,mediaChanged=false;
  const media=readJson(path.join(dir,'media.json'),{});
  for(const c of changes) {
    if(c.text!==undefined && c.text!==c.scene.segment.text) { c.scene.segment.text=c.text; delete c.scene.segment.ses; textChanged=true; }
    if(c.media) {
      const dest=path.join(dir,'media','edits',`${c.scene.segId}-${crypto.randomBytes(6).toString('hex')}${c.media.ext}`);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(c.media.file,dest);
      for(const beatId of c.scene.beatIds) media[beatId]={beatId,file:dest,type:c.media.type,provider:'local',lisans:'Kullanıcı sağladı — yayın hakkını doğrulayın',sahip:'',sayfa:'',localOverride:true};
      mediaChanged=true;
    }
  }
  const styleChanged=patch.visualStyle!==undefined && patch.visualStyle!==job.visualStyle;
  const changed=shotsChanged || textChanged || mediaChanged || styleChanged || patch.thumbnailText!==undefined || patch.guidance!==undefined || patch.regenerateSeo===true;
  if (changed) {
    if(textChanged) writeJson(path.join(dir,'script.json'),script); if(mediaChanged) writeJson(path.join(dir,'media.json'),media); if(shotsChanged) writeShotEdits(dir,nextShots);
    const invalid=['render']; if(textChanged || patch.regenerateSeo===true || patch.guidance!==undefined) invalid.push('seo');
    invalidateCheckpoints(dir,invalid);
    if(invalid.includes('seo')) writeJson(path.join(dir,'seo-stale.json'),{reason:'editor',at:new Date().toISOString()});
    updateJob(jobId,{ ...budgetPatch, ...(styleChanged ? {visualStyle:patch.visualStyle}:{}), ...(patch.thumbnailText!==undefined ? {thumbnailText:patch.thumbnailText.trim(),thumbnailTextEdited:true}:{}), ...(patch.guidance!==undefined ? {guidance:patch.guidance.trim()}:{}), editRevision:(job.editRevision || 0)+1, needsRerender:true, message:'Değişiklikler kaydedildi. Yeni videoyu oluşturmak için yeniden render başlatın.' });
  } else if (budgetChanged) updateJob(jobId,{...budgetPatch,message:'Model bütçesi/fiyatları kaydedildi. Devam et ile eksik aşamaları yeniden deneyebilirsiniz; önceki belirsiz kullanım kayıtları korunur.'});
  if(aiRetry){aiRetry.commit();updateJob(jobId,{message:aiRetry.count?`${aiRetry.count} başarısız AI üretimi yeniden denemeye açıldı. Önceki rezervler korunuyor; Devam et ile ek ücret oluşabilir.`:'Yeniden denemeye açılacak başarısız AI üretimi yok; mevcut adaylar Devam et ile denetlenebilir.'});}
  return editorData(jobId,active);
}

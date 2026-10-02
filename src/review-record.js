import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {getJob,jobDir} from './store.js';
import {readJson,writeJson} from './util.js';
import {isJobEditing} from './job-locks.js';

export const REVIEW_CHECKS=['opening','evidence','visuals','voice','music','captions'];
const error=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
export function reviewRevision(id) {
  const job=getJob(id);if(!job)throw error('İş bulunamadı.',404);
  const dir=jobDir(id),video=path.join(dir,'output.mp4');
  let stat;try{stat=fs.statSync(video);}catch{return null;}
  if(!stat.isFile() || stat.size===0)return null;
  const script=readJson(path.join(dir,'script.json'),null);
  return crypto.createHash('sha256').update(JSON.stringify([stat.size,stat.mtimeMs,script,job.editRevision||0])).digest('hex');
}
export function readReviewRecord(id) {
  const revision=reviewRevision(id),saved=readJson(path.join(jobDir(id),'editor-review.json'),null);
  return {revision,saved,stale:!!saved&&saved.revision!==revision,available:!!revision};
}
export function saveReviewRecord(id,body={}) {
  const job=getJob(id);if(!job)throw error('İş bulunamadı.',404);
  if(isJobEditing(id)||['running','queued','awaiting_picks','awaiting_cost'].includes(job.status))throw error('İş sürerken inceleme kaydedilemez.',409);
  if(job.needsRerender)throw error('Önce kaydedilen değişiklikleri videoya işleyin.',409);
  const revision=reviewRevision(id);if(!revision)throw error('İnceleme için tamamlanmış video gerekir.');
  if(body.revision!==revision)throw error('Video veya senaryo değişti. Güncel sürümü inceleyip tekrar kaydedin.',409);
  if(!body.checks||typeof body.checks!=='object'||Array.isArray(body.checks))throw error('İnceleme seçimleri geçersiz.');
  for(const key of Object.keys(body.checks))if(!REVIEW_CHECKS.includes(key)||typeof body.checks[key]!=='boolean')throw error('Geçersiz inceleme alanı.');
  if(body.notes!==undefined&&(typeof body.notes!=='string'||body.notes.length>4000))throw error('İnceleme notu en fazla 4000 karakter olabilir.');
  const saved={revision,checks:Object.fromEntries(REVIEW_CHECKS.map(k=>[k,body.checks[k]===true])),notes:body.notes||'',source:'editor',recordedAt:new Date().toISOString()};
  writeJson(path.join(jobDir(id),'editor-review.json'),saved);return readReviewRecord(id);
}

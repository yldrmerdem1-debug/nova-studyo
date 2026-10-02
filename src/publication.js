import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getJob, updateJob, jobDir } from './store.js';
import { getJobSettings } from './config.js';
import { publicationAudit } from './pipeline/engagement.js';
import { beginJobEdit, isJobEditing } from './job-locks.js';
import { readJson, writeJson, run } from './util.js';
import { makeThumbnails } from './pipeline/thumbnails.js';

const active = new Set(['running','queued','awaiting_picks','awaiting_cost']);
function editable(id) {
  const job = getJob(id);
  if (!job) throw Object.assign(new Error('Video bulunamadı.'),{statusCode:404});
  if(isJobEditing(id)) throw Object.assign(new Error('Bu işin düzenleme işlemi sürüyor.'),{statusCode:409});
  if (active.has(job.status)) throw Object.assign(new Error('Üretim bitince düzenleyebilirsiniz.'),{statusCode:409});
  return job;
}
export function importedAsset(id,name) {
  if (!/^[a-f0-9]{24}\.(png|jpg|jpeg|webp|mp4|mov|webm)$/i.test(String(name))) throw new Error('Geçersiz medya kimliği.');
  const root = path.join(jobDir(id),'imports');
  const file = path.join(root,name);
  if (!fs.existsSync(file)) throw Object.assign(new Error('Yüklenen medya bulunamadı.'),{statusCode:404});
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep)) throw new Error('Medya klasör dışında.');
  return file;
}
export async function importAsset(id,name,bytes) {
  editable(id);
  const ext=path.extname(String(name)).toLowerCase();
  if (!['.png','.jpg','.jpeg','.webp','.mp4','.mov','.webm'].includes(ext) || !Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Bir resim veya MP4/MOV/WebM dosyası seçin.');
  const asset=crypto.randomBytes(12).toString('hex')+ext;
  const dir=path.join(jobDir(id),'imports');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,asset);fs.writeFileSync(file,bytes);
  const release=beginJobEdit(id);
  try { await run(getJobSettings(getJob(id)).ffmpegPath,['-hide_banner','-v','error','-i',file,'-map','0:v:0','-frames:v','1','-f','null','-'],{timeoutMs:30000}); }
  catch { fs.unlinkSync(file);throw new Error('Dosyada okunabilir bir görüntü bulunamadı.'); }
  finally {release();}
  return {asset,mediaPath:file,type:['.mp4','.mov','.webm'].includes(ext)?'video':'image'};
}
export async function regenerateCover(id,body={}) {
  const job=editable(id);
  const text=String(body.text??job.thumbnailText??'').trim();
  if(!text || text.length>60 || text.split(/\s+/).length>4) throw new Error('Kapak yazısı 1–4 kelime ve en fazla 60 karakter olmalı.');
  const values={x:body.x??0.5,y:body.y??0.5,zoom:body.zoom??1,time:body.time??0};
  for(const [key,value] of Object.entries(values)) if(typeof value!=='number'||!Number.isFinite(value)) throw new Error('Geçersiz kadraj değeri: '+key);
  if(values.x<0||values.x>1||values.y<0||values.y>1||values.zoom<1||values.zoom>3||values.time<0||values.time>Math.max(1,job.meta?.durationSec??86400)) throw new Error('Kadraj veya kare zamanı sınır dışında.');
  const dir=jobDir(id), st=getJobSettings(job);
  const source=body.asset ? importedAsset(id,body.asset) : path.join(dir,'output.mp4');
  if(!fs.existsSync(source)) throw new Error('Kapak için bir görsel yükleyin veya önce videoyu tamamlayın.');
  const temp=path.join(dir,'cover-drafts',crypto.randomBytes(8).toString('hex'));
  fs.mkdirSync(temp,{recursive:true});const release=beginJobEdit(id);
  try {
    const picture=path.join(temp,'source.jpg');
    const crop=`scale=1280:720:force_original_aspect_ratio=increase,scale=ceil(iw*${values.zoom}/2)*2:ceil(ih*${values.zoom}/2)*2,crop=1280:720:(iw-ow)*${values.x}:(ih-oh)*${values.y},setsar=1`;
    const seek=body.asset && /\.(png|jpe?g|webp)$/i.test(source)?[]:['-ss',String(values.time)];
    await run(st.ffmpegPath,[...seek,'-i',source,'-vf',crop,'-frames:v','1','-q:v','2','-y',picture],{timeoutMs:60000});
    const thumbs=await makeThumbnails({job:{...job,thumbnailText:text},title:job.meta?.title||job.topic,imageFile:picture,jobDir:temp,st});
    if(thumbs.length!==3) throw new Error('Üç kapak tasarımı üretilemedi; önceki kapak korundu.');
    // Publish only after all FFmpeg steps succeeded; default cover is replaced last.
    for(const name of [...thumbs,'thumbnail.jpg']) { const target=path.join(dir,name);fs.copyFileSync(path.join(temp,name),target+'.new');fs.renameSync(target+'.new',target); }
    const recipe={text,...values,asset:body.asset||null,updatedAt:new Date().toISOString()};
    writeJson(path.join(dir,'cover.json'),recipe);
    updateJob(id,{thumbnailText:text,thumbnailTextEdited:true,outputs:{...job.outputs,thumbnail:'thumbnail.jpg',thumbs}});
    return {thumbs,recipe};
  } finally {release();}
}
export function savePublicationFeedback(id,body={}) {
  editable(id);
  const out={source:'manual',recordedAt:new Date().toISOString()};
  for(const [key,label,max] of [['views','İzlenme',1e12],['impressions','Gösterim',1e12],['ctr','CTR',100],['retention30','İlk 30 saniye tutma',100],['averageViewed','Ortalama izlenme',100]]) {
    if(body[key]===undefined||body[key]===null||body[key]==='') continue;
    const n=Number(body[key]);if(!Number.isFinite(n)||n<0||n>max)throw new Error(label+' değeri geçersiz.');out[key]=n;
  }
  if(body.videoUrl) { let url;try{url=new URL(body.videoUrl);}catch{throw new Error('Geçerli bir YouTube adresi girin.');} if(url.protocol!=='https:'||!['youtube.com','www.youtube.com','youtu.be','m.youtube.com'].includes(url.hostname))throw new Error('Geçerli bir YouTube adresi girin.');out.videoUrl=url.href; }
  out.notes=String(body.notes||'').slice(0,2000);
  writeJson(path.join(jobDir(id),'publication.json'),out);updateJob(id,{publication:out});return out;
}
export function publicationReview(id) {
  const job=getJob(id);if(!job)throw Object.assign(new Error('Video bulunamadı.'),{statusCode:404});
  const dir=jobDir(id),rawScript=readJson(path.join(dir,'script.json'));
  const script=Array.isArray(rawScript?.beats)?{...rawScript,sections:[{title:rawScript.title,segments:rawScript.beats}]}:rawScript;
  const seo=readJson(path.join(dir,'seo.json'),{}),media=readJson(path.join(dir,'media.json'),{});
  const research=fs.existsSync(path.join(dir,'research.md'))?fs.readFileSync(path.join(dir,'research.md'),'utf8'):'';
  const sources=[...new Set(research.match(/https?:\/\/[^\s<>"\])]+/g)||[])];
  const opening=script?.sections?.[0]?.segments?.[0]?.text||'';
  const warnings=[];
  if(!sources.length)warnings.push('Araştırmanın kaynak bağlantıları eksik; yayın öncesi doğrulayın.');
  if(!seo.titles?.length)warnings.push('Başlık seçenekleri eksik. SEO yeniden üretilebilir.');
  if(!seo.pinnedComment)warnings.push('Sabitlenecek etkileşim sorusu eksik.');
  if(/^(merhaba|hoş geld|hello|welcome)/i.test(opening))warnings.push('Açılış selamlamayla başlıyor; ilk cümlede konunun somut vaadini verin.');
  const uncertain=Object.values(media).filter(m=>m.file&&!['ai','yerel','local','user'].includes(m.provider)&&(!m.lisans||/serbest|unknown/i.test(m.lisans))).length;
  if(uncertain)warnings.push(`${uncertain} görselin kesin lisans kaydı kontrol edilmeli.`);
  const audit=publicationAudit(script,seo);
  return {opening,titles:seo.titles||[],thumbnailText:job.thumbnailText||seo.thumbnailText||'',sources,audit,warnings:[...new Set([...warnings,...audit.warnings.map(w=>w.message),...(Array.isArray(job.qualityWarnings)?job.qualityWarnings:[])])],feedback:readJson(path.join(dir,'publication.json'),{}),cover:readJson(path.join(dir,'cover.json'),{}),hasVideo:fs.existsSync(path.join(dir,'output.mp4'))};
}

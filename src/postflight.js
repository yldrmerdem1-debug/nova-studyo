import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {getJob,jobDir} from './store.js';
import {readJson,writeJson} from './util.js';
import {beginJobEdit} from './job-locks.js';
import {scriptScenes} from './pipeline/checkpoints.js';

const require=createRequire(import.meta.url);
const ACTIVE=new Set(['running','queued','awaiting_picks','awaiting_cost']);
const END_TAIL_SEC=7;
const LONG_HOLD_SEC=10;
const AV_MISMATCH_SEC=.25;
const GAP_SEC=1;

const finite=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))?Number(value):null;
const round=(value,digits=3)=>finite(value)!==null ? +Number(value).toFixed(digits) : null;
const error=(message,statusCode)=>Object.assign(new Error(message),{statusCode});
const text=(value,max=320)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);

function bundled(kind) {
  try {
    let file=kind==='ffmpeg' ? require('ffmpeg-static') : require('ffprobe-static').path;
    if(typeof file!=='string') return kind;
    file=file.replace(`app.asar${path.sep}`,`app.asar.unpacked${path.sep}`);
    return file;
  } catch { return kind; }
}

function command(program,args,{timeoutMs=60000}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(program,args,{windowsHide:true});let stdout='',stderr='',settled=false;
    const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{};if(!settled){settled=true;reject(new Error('Yerel medya ölçümü zaman aşımına uğradı.'));}},timeoutMs);
    child.stdout.on('data',d=>{stdout+=d;if(stdout.length>2_000_000)stdout=stdout.slice(-1_000_000);});
    child.stderr.on('data',d=>{stderr+=d;if(stderr.length>40_000)stderr=stderr.slice(-20_000);});
    child.on('error',e=>{clearTimeout(timer);if(!settled){settled=true;reject(e);}});
    child.on('close',code=>{clearTimeout(timer);if(settled)return;settled=true;code===0?resolve(stdout):reject(new Error(`Yerel medya ölçümü tamamlanamadı (${code}): ${stderr.slice(-500)}`));});
  });
}

async function probe(file) {
  const raw=await command(bundled('ffprobe'),['-v','error','-show_entries','format=duration:stream=codec_type,duration','-of','json',file]);
  const data=JSON.parse(raw), streams=Array.isArray(data.streams)?data.streams:[];
  const longest=kind=>{
    const values=streams.filter(s=>s?.codec_type===kind).map(s=>finite(s.duration)).filter(Number.isFinite);
    return values.length?Math.max(...values):null;
  };
  return {formatSec:round(finite(data.format?.duration)),videoSec:round(longest('video')),audioSec:round(longest('audio'))};
}

function sourceSignature(dir) {
  const hash=crypto.createHash('sha256');
  for(const name of ['output.mp4','script.json','tts.json','edit-plan.json','media.json','visual-quality.json','sound-plan.json']) {
    const file=path.join(dir,name);hash.update(`${name}\0`);
    try {
      const stat=fs.statSync(file);hash.update(`${stat.size}:${stat.mtimeMs}\0`);
      if(name.endsWith('.json')) hash.update(fs.readFileSync(file));
    } catch { hash.update('missing\0'); }
  }
  return hash.digest('hex');
}

function finding(code,severity,message,{timestamp=null,sceneId=null,name,value,unit,threshold}={}) {
  const metric={name,value,unit};if(Number.isFinite(threshold))metric.threshold=threshold;
  return {code,timestamp:Number.isFinite(timestamp)?round(Math.max(0,timestamp)):null,sceneId:sceneId?text(sceneId,80):null,severity,message:text(message),metric};
}

function action(code,priority,message,{timestamp,sceneId}={}) {
  const out={code,priority,message:text(message)};
  if(sceneId)out.sceneId=text(sceneId,80);if(Number.isFinite(timestamp))out.timestamp=round(Math.max(0,timestamp));
  return out;
}

function addAction(actions,item) {
  if(!actions.some(x=>x.code===item.code && (x.sceneId||null)===(item.sceneId||null)))actions.push(item);
}

function mediaIdentity(entry) {
  if(!entry || typeof entry!=='object')return null;
  for(const key of ['file','source','url','page']) {
    if(typeof entry[key]==='string' && entry[key].trim())return `${key}:${entry[key].trim().replaceAll('\\','/').toLowerCase()}`;
  }
  return null;
}

function sceneSegmentId(sceneId,sceneLookup) {
  if(sceneLookup.has(sceneId))return sceneLookup.get(sceneId);
  const match=/^(s\d+)b\d+/.exec(sceneId);return match?.[1]||null;
}

function unionDuration(intervals,start,end) {
  const clipped=intervals.map(([a,b])=>[Math.max(start,a),Math.min(end,b)]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  let total=0,lastStart=null,lastEnd=null;
  for(const [a,b] of clipped){if(lastStart===null){lastStart=a;lastEnd=b;}else if(a<=lastEnd){lastEnd=Math.max(lastEnd,b);}else{total+=lastEnd-lastStart;lastStart=a;lastEnd=b;}}
  return total+(lastStart===null?0:lastEnd-lastStart);
}

function safeCode(value){const out=text(value,80).toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');return out||'finding';}
function safeMetric(raw) {
  if(!raw || typeof raw!=='object')return {name:'unknown',value:0,unit:'count'};
  const value=finite(raw.value),out={name:safeCode(raw.name),value:value??0,unit:text(raw.unit,30)||'count'};
  const threshold=finite(raw.threshold);if(threshold!==null)out.threshold=threshold;return out;
}

function sanitizeReport(raw,expectedId) {
  if(!raw || typeof raw!=='object')return null;
  const jobId=text(raw.jobId,32);if(jobId!==expectedId)return null;
  const duration=raw.measurements?.duration||{},opening=raw.measurements?.first30Speech||{},visuals=raw.measurements?.visuals||{},coverage=raw.measurements?.coverage||{};
  const report={
    version:1,jobId,generatedAt:Number.isFinite(Date.parse(raw.generatedAt))?new Date(raw.generatedAt).toISOString():new Date(0).toISOString(),
    status:raw.status==='ready'?'ready':'incomplete',sourceSignature:/^[a-f0-9]{64}$/.test(raw.sourceSignature||'')?raw.sourceSignature:'',
    measurements:{
      duration:{formatSec:finite(duration.formatSec),videoSec:finite(duration.videoSec),audioSec:finite(duration.audioSec),avDeltaSec:finite(duration.avDeltaSec)},
      first30Speech:{windowSec:round(finite(opening.windowSec)||0),speechSec:round(finite(opening.speechSec)||0),silenceSec:round(finite(opening.silenceSec)||0),coveragePercent:round(finite(opening.coveragePercent)||0,1)},
      visuals:{sceneCount:Math.max(0,Math.trunc(finite(visuals.sceneCount)||0)),videoSceneCount:Math.max(0,Math.trunc(finite(visuals.videoSceneCount)||0)),videoSec:round(finite(visuals.videoSec)||0),videoPercent:round(finite(visuals.videoPercent)||0,1),weakSceneCount:Math.max(0,Math.trunc(finite(visuals.weakSceneCount)||0)),cardSceneCount:Math.max(0,Math.trunc(finite(visuals.cardSceneCount)||0)),longHoldCount:Math.max(0,Math.trunc(finite(visuals.longHoldCount)||0)),repeatedSourceCount:Math.max(0,Math.trunc(finite(visuals.repeatedSourceCount)||0)),maxHoldSec:round(finite(visuals.maxHoldSec)||0)},
      coverage:{scriptSceneCount:Math.max(0,Math.trunc(finite(coverage.scriptSceneCount)||0)),ttsSceneCount:Math.max(0,Math.trunc(finite(coverage.ttsSceneCount)||0)),editSceneCount:Math.max(0,Math.trunc(finite(coverage.editSceneCount)||0)),ttsPercent:round(finite(coverage.ttsPercent)||0,1),editPercent:round(finite(coverage.editPercent)||0,1)},
    },findings:[],actions:[],samples:[],
  };
  for(const item of Array.isArray(raw.findings)?raw.findings.slice(0,500):[]) {
    if(!item || !['info','warning','error'].includes(item.severity))continue;
    report.findings.push({code:safeCode(item.code),timestamp:finite(item.timestamp)!==null?round(Math.max(0,Number(item.timestamp))):null,sceneId:item.sceneId?text(item.sceneId,80):null,severity:item.severity,message:text(item.message),metric:safeMetric(item.metric)});
  }
  for(const item of Array.isArray(raw.actions)?raw.actions.slice(0,200):[]) {
    if(!item || !['high','medium','low'].includes(item.priority))continue;
    const clean={code:safeCode(item.code),priority:item.priority,message:text(item.message)};
    if(item.sceneId)clean.sceneId=text(item.sceneId,80);if(finite(item.timestamp)!==null)clean.timestamp=round(Math.max(0,Number(item.timestamp)));
    report.actions.push(clean);
  }
  for(const item of Array.isArray(raw.samples)?raw.samples.slice(0,12):[]) {
    if(!item || !/^postflight-frames\/[a-z0-9-]+\.jpg$/.test(item.artifact||''))continue;
    report.samples.push({timestamp:finite(item.timestamp)!==null?round(Math.max(0,Number(item.timestamp))):0,sceneId:item.sceneId?text(item.sceneId,80):null,artifact:item.artifact});
  }
  return report;
}

async function makeSamples(dir,output,candidates,duration) {
  const samples=[],seen=new Set(),folder=path.join(dir,'postflight-frames');
  for(const candidate of candidates) {
    if(samples.length>=4)break;
    const timestamp=Math.max(0,Math.min((finite(duration)||0)-.05,finite(candidate.timestamp)||0));
    if(timestamp<0 || !Number.isFinite(timestamp))continue;
    const scene=safeCode(candidate.sceneId||candidate.code),key=`${scene}-${Math.round(timestamp*1000)}`;if(seen.has(key))continue;seen.add(key);
    fs.mkdirSync(folder,{recursive:true});const name=`${key}.jpg`,target=path.join(folder,name);
    try {
      await command(bundled('ffmpeg'),['-hide_banner','-loglevel','error','-ss',timestamp.toFixed(3),'-i',output,'-frames:v','1','-vf','scale=480:-2','-q:v','4','-y',target],{timeoutMs:45000});
      if(fs.statSync(target).size>0)samples.push({timestamp:round(timestamp),sceneId:candidate.sceneId||null,artifact:`postflight-frames/${name}`});
    } catch { /* Samples support review but never replace the measurements. */ }
  }
  return samples;
}

export function readPostflight(id) {
  const dir=jobDir(id),raw=readJson(path.join(dir,'postflight.json'));
  if(!raw)return {available:false,stale:false,report:null};
  const report=sanitizeReport(raw,id);if(!report)return {available:false,stale:false,report:null};
  return {available:true,stale:!report.sourceSignature || report.sourceSignature!==sourceSignature(dir),report};
}

export async function buildPostflight(id) {
  let job=getJob(id);if(!job)throw error('İş bulunamadı.',404);
  if(ACTIVE.has(job.status))throw error('Üretim aktif veya sırada; kalite raporu üretim tamamlandıktan sonra hazırlanabilir.',409);
  let release;
  try {
    release=beginJobEdit(id);job=getJob(id);
    if(!job)throw error('İş bulunamadı.',404);
    if(ACTIVE.has(job.status))throw error('Üretim aktif veya sırada; kalite raporu üretim tamamlandıktan sonra hazırlanabilir.',409);
    const dir=jobDir(id),output=path.join(dir,'output.mp4'),findings=[],actions=[],sampleCandidates=[];
    const script=readJson(path.join(dir,'script.json')),ttsRaw=readJson(path.join(dir,'tts.json')),editRaw=readJson(path.join(dir,'edit-plan.json')),media=readJson(path.join(dir,'media.json'),{});
    const scenes=scriptScenes(script),tts=Array.isArray(ttsRaw)?ttsRaw:[],editInput=Array.isArray(editRaw?.scenes)?editRaw.scenes:[];
    const edit=[];let at=0,invalidEdit=0;
    for(const item of editInput){const duration=finite(item?.duration);if(typeof item?.id!=='string'||!Number.isFinite(duration)||duration<=0){invalidEdit++;continue;}const mediaEntry=media&&typeof media==='object'&&Object.hasOwn(media,item.id)?media[item.id]:null;edit.push({id:item.id,duration,start:at,end:at+duration,mediaType:text(item.mediaType||mediaEntry?.type,20)||'card',relevance:finite(item.relevance??mediaEntry?.gorsel),videoConsistency:finite(item.videoConsistency??mediaEntry?.videoTutarlilik)});at+=duration;}
    let incomplete=false,durations={formatSec:null,videoSec:null,audioSec:null,avDeltaSec:null};
    if(!fs.existsSync(output)) {
      incomplete=true;findings.push(finding('missing-output','error','Final video bulunamadığı için süre ölçümü yapılamadı.',{name:'outputAvailable',value:0,unit:'boolean',threshold:1}));
      addAction(actions,action('render-output','high','Final videoyu render edin, ardından kalite raporunu yeniden oluşturun.'));
    } else {
      try {
        durations=await probe(output);if(durations.videoSec===null||durations.audioSec===null){incomplete=true;findings.push(finding('missing-av-stream','error','Final videoda ölçülebilir ses ve görüntü akışlarının ikisi birden bulunamadı.',{name:'measuredStreams',value:Number(durations.videoSec!==null)+Number(durations.audioSec!==null),unit:'streams',threshold:2}));addAction(actions,action('rerender-av','high','Final videoyu hem ses hem görüntü akışıyla yeniden render edin.'));}
        if(durations.videoSec!==null&&durations.audioSec!==null){durations.avDeltaSec=round(durations.videoSec-durations.audioSec);if(Math.abs(durations.avDeltaSec)>AV_MISMATCH_SEC){findings.push(finding('av-duration-mismatch','warning',`Görüntü ve ses süreleri arasında ${Math.abs(durations.avDeltaSec).toFixed(2)} saniye fark ölçüldü.`,{timestamp:Math.min(durations.videoSec,durations.audioSec),name:'avDeltaSec',value:durations.avDeltaSec,unit:'seconds',threshold:AV_MISMATCH_SEC}));addAction(actions,action('align-av','high','Final ses ve görüntü akışlarının bitişlerini hizalayarak yeniden render edin.'));}}
      } catch(e) {incomplete=true;findings.push(finding('probe-failed','error','Final video FFprobe ile ölçülemedi.',{name:'probeSucceeded',value:0,unit:'boolean',threshold:1}));addAction(actions,action('repair-output','high','Final video dosyasını doğrulayın veya yeniden render edin.'));}
    }
    if(!scenes.length){incomplete=true;findings.push(finding('missing-script','error','Ölçülebilir senaryo sahnesi bulunamadı.',{name:'scriptSceneCount',value:0,unit:'scenes',threshold:1}));addAction(actions,action('restore-script','high','Senaryo verisini geri yükleyin veya üretimi senaryo aşamasından sürdürün.'));}
    const expected=new Set(scenes.map(s=>s.segId)),ttsBy=new Map();
    for(const item of tts){if(expected.has(item?.segId)&&finite(item.duration)>0&&!ttsBy.has(item.segId))ttsBy.set(item.segId,{...item,duration:Number(item.duration)});}
    for(const item of tts)if(typeof item?.segId==='string'&&!expected.has(item.segId)){findings.push(finding('unmatched-tts-timing','warning',`${item.segId} TTS kaydı senaryoda bir sahneyle eşleşmiyor.`,{sceneId:item.segId,name:'matchedScriptScene',value:0,unit:'boolean',threshold:1}));addAction(actions,action('remove-orphan-tts','low','Senaryo ile eşleşmeyen TTS önbelleğini üretim hattından yeniden oluşturun.',{sceneId:item.segId}));}
    for(const scene of scenes)if(!ttsBy.has(scene.segId)){incomplete=true;findings.push(finding('missing-tts-timing','error',`${scene.segId} için geçerli TTS süresi bulunamadı.`,{sceneId:scene.segId,name:'ttsTimingAvailable',value:0,unit:'boolean',threshold:1}));addAction(actions,action('restore-tts','high','Eksik seslendirmeyi üretin ve zamanlamayı yeniden ölçün.',{sceneId:scene.segId}));}
    if(!edit.length){incomplete=true;findings.push(finding('missing-edit-timing','error','Geçerli kurgu sahnesi süresi bulunamadı.',{name:'editSceneCount',value:0,unit:'scenes',threshold:1}));addAction(actions,action('rerender-edit-plan','high','Kurgu planını yeniden oluşturup videoyu render edin.'));}
    else if(invalidEdit){incomplete=true;findings.push(finding('invalid-edit-timing','error',`${invalidEdit} kurgu sahnesinin süresi geçersiz olduğu için ölçüme katılmadı.`,{name:'invalidEditSceneCount',value:invalidEdit,unit:'scenes',threshold:0}));addAction(actions,action('repair-edit-plan','high','Geçersiz kurgu planını yeniden oluşturarak raporu yenileyin.'));}
    const beatToSegment=new Map();for(const scene of scenes)for(const beatId of scene.beatIds)beatToSegment.set(beatId,scene.segId);
    const grouped=new Map();for(const item of edit){const segId=sceneSegmentId(item.id,beatToSegment);if(segId&&expected.has(segId)){const current=grouped.get(segId)||[];current.push(item);grouped.set(segId,current);}}
    if(edit.length)for(const scene of scenes)if(!grouped.has(scene.segId)){incomplete=true;findings.push(finding('missing-edit-coverage','error',`${scene.segId} için kurgu zamanlaması bulunamadı.`,{sceneId:scene.segId,name:'editTimingAvailable',value:0,unit:'boolean',threshold:1}));addAction(actions,action('restore-edit-coverage','high','Eksik sahnenin kurgu planını yeniden oluşturup videoyu render edin.',{sceneId:scene.segId}));}
    const represented=scenes.filter(s=>grouped.has(s.segId)).length;
    const intervals=[];let fallbackAt=0;
    for(const [index,scene] of scenes.entries()) {
      const items=grouped.get(scene.segId),voice=ttsBy.get(scene.segId);
      const start=items?.length?items[0].start:fallbackAt,end=items?.length?items[items.length-1].end:start+(voice?.duration||0);
      if(voice){intervals.push([start,start+voice.duration]);fallbackAt=end;const tail=index===scenes.length-1&&!Array.isArray(script?.beats)?END_TAIL_SEC:0;const gap=Math.max(0,end-start-voice.duration-tail);if(gap>GAP_SEC){const timestamp=start+voice.duration;findings.push(finding('narration-gap','warning',`${scene.segId} sonrasında ${gap.toFixed(2)} saniye açıklanamayan sessiz aralık ölçüldü.`,{timestamp,sceneId:scene.segId,name:'narrationGapSec',value:round(gap),unit:'seconds',threshold:GAP_SEC}));addAction(actions,action('review-narration-gap','medium','Bu sahnedeki seslendirme kuyruğunu ve kurgu süresini kontrol edin.',{timestamp,sceneId:scene.segId}));sampleCandidates.push({code:'narration-gap',timestamp,sceneId:scene.segId});}const over=voice.duration-(end-start);if(items?.length&&over>AV_MISMATCH_SEC){findings.push(finding('tts-overrun','error',`${scene.segId} seslendirmesi planlanan sahne süresini ${over.toFixed(2)} saniye aşıyor.`,{timestamp:end,sceneId:scene.segId,name:'ttsOverrunSec',value:round(over),unit:'seconds',threshold:AV_MISMATCH_SEC}));incomplete=true;}}
    }
    let longHoldCount=0,maxHoldSec=0,repeatedSourceCount=0,videoSceneCount=0,videoSec=0,weakSceneCount=0,cardSceneCount=0;const identities=new Map();
    for(const item of edit){maxHoldSec=Math.max(maxHoldSec,item.duration);if(item.mediaType==='video'){videoSceneCount++;videoSec+=item.duration;if(Number.isFinite(item.videoConsistency)&&item.videoConsistency<=1){findings.push(finding('inconsistent-video','warning',`${item.id} videosu baştan sona aynı konuyu sürdürmüyor.`,{timestamp:item.start,sceneId:item.id,name:'videoConsistency',value:item.videoConsistency,unit:'score',threshold:2}));addAction(actions,action('replace-inconsistent-video','high','Bu klibi anlatımla baştan sona uyuşan bir video veya doğrulanmış görselle değiştirin.',{timestamp:item.start,sceneId:item.id}));sampleCandidates.push({code:'inconsistent-video',timestamp:item.start+item.duration/2,sceneId:item.id});}}else if(item.mediaType==='card')cardSceneCount++;if(Number.isFinite(item.relevance)&&item.relevance<2)weakSceneCount++;if(item.duration>=LONG_HOLD_SEC){longHoldCount++;findings.push(finding('long-visual-hold','warning',`${item.id} görüntüsü ${item.duration.toFixed(2)} saniye kesintisiz ekranda kalıyor.`,{timestamp:item.start,sceneId:item.id,name:'visualHoldSec',value:round(item.duration),unit:'seconds',threshold:LONG_HOLD_SEC}));addAction(actions,action('shorten-visual-hold','medium','Bu sahneye yeni bir kaynak görüntü veya anlamlı bir kesme ekleyin.',{timestamp:item.start,sceneId:item.id}));sampleCandidates.push({code:'long-visual-hold',timestamp:item.start+item.duration/2,sceneId:item.id});}
      const entry=media && typeof media==='object' && Object.hasOwn(media,item.id)?media[item.id]:null,identity=mediaIdentity(entry);if(identity){const prior=identities.get(identity)||[];prior.push(item);identities.set(identity,prior);}}
    for(const occurrences of identities.values())if(occurrences.length>1)for(const item of occurrences.slice(1)){repeatedSourceCount++;findings.push(finding('repeated-visual-source','warning','Aynı kaynak görüntü kurgu içinde yeniden kullanılıyor.',{timestamp:item.start,sceneId:item.id,name:'visualSourceOccurrences',value:occurrences.length,unit:'scenes',threshold:1}));addAction(actions,action('replace-repeated-visual','medium','Tekrarlanan sahne için farklı bir kaynak görüntü seçin.',{timestamp:item.start,sceneId:item.id}));sampleCandidates.push({code:'repeated-visual-source',timestamp:item.start,sceneId:item.id});}
    const videoPercent=at>0?round(videoSec/at*100,1):0;
    if(at>=8*60&&['mixed','ai'].includes(job.mediaKind)&&videoPercent<45){findings.push(finding('low-video-coverage','warning',`Uzun videoda doğrulanmış hareketli görüntü oranı %${videoPercent}; hedef en az %45.`,{timestamp:0,name:'videoPercent',value:videoPercent,unit:'percent',threshold:45}));addAction(actions,action('increase-relevant-video','medium','Alakasız klip eklemeden uygun olay, mekân ve süreç sahnelerinde doğrulanmış video kullanımını artırın.',{timestamp:0}));}
    const measuredWindow=Math.min(30,durations.formatSec??durations.videoSec??at);const speech=unionDuration(intervals,0,measuredWindow),opening={windowSec:round(measuredWindow),speechSec:round(speech),silenceSec:round(Math.max(0,measuredWindow-speech)),coveragePercent:measuredWindow>0?round(speech/measuredWindow*100,1):0};
    if(measuredWindow>0&&ttsBy.size&&opening.coveragePercent<65){findings.push(finding('low-opening-speech','warning',`İlk ${measuredWindow.toFixed(1)} saniyenin ${opening.coveragePercent.toFixed(1)}% bölümünde TTS zamanlamasıyla eşleşen anlatım var.`,{timestamp:0,name:'openingSpeechPercent',value:opening.coveragePercent,unit:'percent',threshold:65}));addAction(actions,action('tighten-opening','medium','Açılıştaki açıklanamayan boşlukları ve uzun görsel beklemelerini kontrol edin.',{timestamp:0}));}
    const percent=(count,total)=>total?round(count/total*100,1):0;
    const report={version:1,jobId:id,generatedAt:new Date().toISOString(),status:incomplete?'incomplete':'ready',sourceSignature:sourceSignature(dir),measurements:{duration:durations,first30Speech:opening,visuals:{sceneCount:edit.length,videoSceneCount,videoSec:round(videoSec),videoPercent,weakSceneCount,cardSceneCount,longHoldCount,repeatedSourceCount,maxHoldSec:round(maxHoldSec)},coverage:{scriptSceneCount:scenes.length,ttsSceneCount:ttsBy.size,editSceneCount:edit.length,ttsPercent:percent(ttsBy.size,scenes.length),editPercent:percent(represented,scenes.length)}},findings,actions,samples:[]};
    if(fs.existsSync(output))report.samples=await makeSamples(dir,output,sampleCandidates,durations.videoSec??durations.formatSec??at);
    const safe=sanitizeReport(report,id);writeJson(path.join(dir,'postflight.json'),safe);return safe;
  } finally {release?.();}
}

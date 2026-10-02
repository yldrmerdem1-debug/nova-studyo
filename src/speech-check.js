import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getJob, jobDir } from './store.js';
import { getJobSettings } from './config.js';
import { beginJobEdit, isJobEditing } from './job-locks.js';
import { readJson, writeJson, run } from './util.js';

const MODEL='scribe_v2', MAX_SECONDS=1800, MAX_AUDIO=64*1024*1024, MAX_TEXT=200000, MAX_WORDS=10000;
const ACTIVE=new Set(['running','queued','awaiting_picks','awaiting_cost']);
const error=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const clean=text=>String(text||'').replace(/\[[^\]\n]{1,24}\]/g,' ').replace(/\s+/g,' ').trim();
const NOTE='Bu otomatik yazıya döküm karşılaştırmasıdır; ses dinlenmiş veya telaffuz doğrulanmış sayılmaz. Olası farklar konuşma tanıma hatasından da kaynaklanabilir. Rakam/sayıların yazıyla gösterimi ve özel adlar kesin telaffuz hatası değildir; işaretli yerleri videodan dinleyerek kontrol edin.';

export function normalizeSpeech(text,language='tr') {
  if(typeof text!=='string'||text.length>MAX_TEXT) throw error('Konuşma metni 200.000 karakter sınırını aşıyor veya geçersiz.');
  const words=clean(text).normalize('NFKC').toLocaleLowerCase(language==='en'?'en':'tr').replace(/['’‘]/g,'').match(/[\p{L}\p{N}]+/gu)||[];
  if(words.length>MAX_WORDS) throw error('Konuşma karşılaştırması 10.000 kelime sınırını aşıyor.');
  return words;
}

// Exact word edit distance with two rows: O(min(n,m)) memory, bounded inputs.
function distance(a,b) {
  if(a.length<b.length) [a,b]=[b,a];
  let previous=Uint32Array.from({length:b.length+1},(_,i)=>i),current=new Uint32Array(b.length+1);
  for(let i=1;i<=a.length;i++) {
    current[0]=i;
    for(let j=1;j<=b.length;j++) current[j]=Math.min(previous[j]+1,current[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));
    [previous,current]=[current,previous];
  }
  return previous[b.length];
}

export function compareSpeech(expectedText,transcript,{language='tr',words=[]}={}) {
  const expected=normalizeSpeech(expectedText,language),recognized=normalizeSpeech(transcript,language);
  const editDistance=distance(expected,recognized),findings=[];
  const timed=[];
  for(const word of Array.isArray(words)?words.slice(0,MAX_WORDS*2):[]) {
    if(word?.type!=='word'||typeof word.text!=='string'||word.text.length>1000) continue;
    for(const token of normalizeSpeech(word.text,language)) timed.push({token,start:word.start});
  }
  // Locations are conservative local resynchronization hints, not a claim that
  // the transcriber knows which word was pronounced incorrectly.
  let i=0,j=0;
  while((i<expected.length||j<recognized.length)&&findings.length<24) {
    if(expected[i]!==undefined&&expected[i]===recognized[j]) {i++;j++;continue;}
    let di=1,dj=1,best=Infinity;
    for(let x=0;x<=8&&i+x<expected.length;x++) for(let y=0;y<=8&&j+y<recognized.length;y++) {
      if(x+y===0||x+y>=best)continue;
      if(expected[i+x]===recognized[j+y]&&(expected[i+x+1]===recognized[j+y+1]||i+x+1===expected.length||j+y+1===recognized.length)) {di=x;dj=y;best=x+y;}
    }
    if(i>=expected.length)di=0;if(j>=recognized.length)dj=0;
    const hint={message:'Olası metin/ses farkı; tanıyıcı yanılmış olabilir. Bu bölümü dinleyerek doğrulayın.',expected:expected.slice(i,i+Math.max(di,1)).join(' '),recognized:recognized.slice(j,j+Math.max(dj,1)).join(' ')};
    if(timed[j]?.token===recognized[j]&&Number.isFinite(timed[j].start)&&timed[j].start>=0&&timed[j].start<=MAX_SECONDS)hint.timestamp=timed[j].start;
    findings.push(hint);i+=di;j+=dj;
  }
  return {comparison:{expectedWords:expected.length,recognizedWords:recognized.length,editDistance,wordDifferenceRatio:editDistance/Math.max(1,expected.length)},findings,note:NOTE};
}

function source(id) {
  const dir=jobDir(id),job=getJob(id);if(!job)throw error('Video bulunamadı.',404);
  const output=path.join(dir,'output.mp4'),scriptFile=path.join(dir,'script.json');
  let stat;try{stat=fs.statSync(output);}catch{return{dir,job,signature:null,expectedText:''};}
  if(!stat.isFile()||!stat.size)return{dir,job,signature:null,expectedText:''};
  if(fs.existsSync(scriptFile)&&fs.statSync(scriptFile).size>2*1024*1024)throw error('Senaryo dosyası konuşma denetimi sınırını aşıyor.');
  const script=readJson(scriptFile),segments=Array.isArray(script?.beats)?script.beats:(script?.sections||[]).flatMap(s=>s?.segments||[]);
  const expectedText=segments.map(s=>clean(s?.text)).join(' ').trim();
  normalizeSpeech(expectedText,job.language);
  const signature=crypto.createHash('sha256').update(JSON.stringify([MODEL,stat.size,stat.mtimeMs,stat.ctimeMs,expectedText,job.language])).digest('hex');
  return{dir,job,output,signature,expectedText};
}

export function readSpeechCheck(id) {
  const current=source(id),report=readJson(path.join(current.dir,'speech-check','report.json'));
  return {available:!!(current.signature&&current.expectedText&&!ACTIVE.has(current.job.status)&&!isJobEditing(id)&&!current.job.needsRerender&&getJobSettings(current.job).elevenKey),stale:!!report&&(report.signature!==current.signature||!!current.job.needsRerender),report:report||null};
}

async function responseJson(response) {
  const reader=response.body?.getReader();if(!reader)throw error('Konuşma tanıyıcı boş yanıt döndürdü.');
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw error('Konuşma tanıyıcı yanıtı 4 MB sınırını aştı.');}chunks.push(Buffer.from(value));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error('Konuşma tanıyıcı yanıtı okunamadı; otomatik ücretli tekrar yapılmadı.');}
}

export async function checkSpeech(id,options={}) {
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='force')||(options.force!==undefined&&typeof options.force!=='boolean'))throw error('Yenileme (force) seçimi geçersiz.');
  const current=source(id),{job,dir,output,signature,expectedText}=current;
  if(ACTIVE.has(job.status))throw error('Aktif üretim bitince konuşma denetimi yapılabilir.',409);
  if(isJobEditing(id))throw error('Bu işte başka bir düzenleme işlemi sürüyor.',409);
  if(job.needsRerender)throw error('Senaryo değişti; önce değişiklikleri videoya işleyin (yeniden render).',409);
  if(!signature||!expectedText)throw error('Konuşma denetimi için tamamlanmış video ve senaryo gerekli.');
  const reportFile=path.join(dir,'speech-check','report.json'),cached=readJson(reportFile);
  if(!options.force&&cached?.signature===signature)return cached;
  const st=getJobSettings(job);if(!st.elevenKey)throw error('Konuşma denetimi için Ayarlar bölümünde ElevenLabs anahtarını ekleyin.');
  const release=beginJobEdit(id);
  try {
    let durationText='';
    await run(st.ffprobePath,['-v','error','-show_entries','format=duration','-of','csv=p=0',output],{timeoutMs:30000,onLine:s=>{durationText=(durationText+s).slice(-4096);}});
    const duration=Number(durationText.trim());
    if(!Number.isFinite(duration)||duration<0.1||duration>MAX_SECONDS)throw error('Konuşma denetimi 0,1 saniye–30 dakika arası videoları destekliyor.');
    const work=path.join(dir,'speech-check');fs.mkdirSync(work,{recursive:true});const wav=path.join(work,'final-audio.wav');
    await run(st.ffmpegPath,['-hide_banner','-v','error','-i',output,'-map','0:a:0','-vn','-t',String(MAX_SECONDS+0.1),'-ac','1','-ar','16000','-c:a','pcm_s16le','-y',wav],{timeoutMs:120000});
    const audioStat=fs.statSync(wav);if(audioStat.size<44||audioStat.size>MAX_AUDIO)throw error('Çıkarılan ses boş veya 64 MB sınırını aşıyor.');
    const form=new FormData();form.set('model_id',MODEL);form.set('file',new Blob([fs.readFileSync(wav)],{type:'audio/wav'}),'final-audio.wav');
    form.set('timestamps_granularity','word');form.set('tag_audio_events','false');form.set('language_code',job.language==='en'?'en':'tr');
    let response;
    try{response=await fetch('https://api.elevenlabs.io/v1/speech-to-text',{method:'POST',headers:{'xi-api-key':st.elevenKey},body:form,signal:AbortSignal.timeout(180000)});}catch{throw error('Konuşma denetimi bağlantısı kesildi veya zaman aşımına uğradı. Sağlayıcı isteği işlemiş olabilir; ücretli tekrar otomatik yapılmadı.');}
    if(!response.ok){await response.body?.cancel();throw error(`Konuşma denetimi sağlayıcı hatası (HTTP ${response.status}); ücretli tekrar otomatik yapılmadı.`,502);}
    const data=await responseJson(response);if(typeof data.text!=='string'||!data.text.trim())throw error('Konuşma tanıyıcı anlamlı metin döndürmedi. Sesi videodan kontrol edin.');
    const compared=compareSpeech(expectedText,data.text,{language:job.language,words:data.words});
    if(source(id).signature!==signature||getJob(id)?.needsRerender)throw error('Video veya senaryo denetim sırasında değişti; sonuç bu sürüme kaydedilmedi.',409);
    const report={jobId:id,checkedAt:new Date().toISOString(),source:'elevenlabs-scribe',model:MODEL,signature,expectedText,transcript:data.text,...compared};
    writeJson(reportFile,report);return report;
  } finally {release();}
}

import path from 'node:path';
import {run,writeJson} from '../util.js';
import {DIRECTOR_POLICY_VERSION} from './director-policy.js';

/** Inspect the actual encoded file before the revision can be published. */
export async function verifyDirectorOutput(file,{st,expectedDuration,reportFile=path.join(path.dirname(file),'director-output-check.json'),killer,logFn=()=>{}}={}){
 const report={version:1,policyVersion:DIRECTOR_POLICY_VERSION,passed:false,decoded:false,blackIntervals:[],checkedAt:new Date().toISOString()};
 try{
  if(killer?.cancelled)throw Error('cancelled');
  let probe='';
  await run(st.ffprobePath,['-v','error','-show_entries','format=duration:stream=codec_type,duration,width,height','-of','json',file],{killer,onLine:s=>{probe+=s;}});
  const info=JSON.parse(probe),video=info.streams?.find(s=>s.codec_type==='video'),audio=info.streams?.find(s=>s.codec_type==='audio');
  report.duration=Number(info.format?.duration);report.width=video?.width;report.height=video?.height;
  if(!video||!audio)throw Error('AI Yönetmen final denetimi: görüntü veya ses akışı eksik.');
  const duration=report.duration,tolerance=Math.max(.25,3/(st.fps||30));
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(expectedDuration)||Math.abs(duration-expectedDuration)>tolerance||Number(audio.duration)<expectedDuration-tolerance||Number(video.duration)<expectedDuration-tolerance)throw Error('AI Yönetmen final denetimi: görüntü/ses süresi kurgu planıyla uyuşmuyor.');
  logFn('AI Yönetmen: final dosyasının tüm görüntü ve sesi çözülüyor, boş siyah aralıklar kontrol ediliyor...');
  let scan='';
  await run(st.ffmpegPath,['-hide_banner','-v','info','-xerror','-i',file,'-map','0:v:0','-map','0:a:0','-vf','scale=160:90,blackdetect=d=1:pix_th=0.02:pic_th=0.995','-f','null','-'],{killer,onLine:s=>{scan+=s;if(scan.length>200000)scan=scan.slice(-100000);}});
  report.decoded=true;
  report.blackIntervals=[...scan.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2]),duration:Number(m[3])}));
  const unexpected=report.blackIntervals.filter(b=>Math.min(duration-.75,b.end)-Math.max(.15,b.start)>=1);
  if(unexpected.length)throw Error(`AI Yönetmen final denetimi: ${unexpected.length} uzun siyah görüntü aralığı bulundu; yayın çıktısı onaylanmadı.`);
  report.passed=true;writeJson(reportFile,report);return report;
 }catch(e){report.error=killer?.cancelled?'cancelled':e.message;writeJson(reportFile,report);throw e;}
}

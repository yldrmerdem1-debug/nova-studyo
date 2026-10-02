const round=(n,d=2)=>Number(Number(n||0).toFixed(d));

export function measureVisualQuality(beats = [], transitions = [], {fps=30,sourceTiming=[]} = {}) {
  const durationSec=beats.reduce((n,b)=>n+Math.max(0,Number(b.dur)||0),0);
  const movingSeconds=beats.map((b,i)=>{
    const m=b.media||{},duration=Math.max(0,Number(b.dur)||0);
    const startFrame=sourceTiming[i]?.sourceStartFrame??m.sourceStartFrame;
    const start=Number.isFinite(startFrame)?startFrame/fps:Number(m.sourceStart)||0;
    const settled=m.editorial?.settledAt;
    const motionEnd=Number.isFinite(settled)?Math.min(Number.isFinite(m.duration)?m.duration:Infinity,settled):m.duration;
    const available=Number.isFinite(motionEnd)?Math.max(0,motionEnd-start):duration;
    return m.type==='video'&&m.motionSatisfied!==false?Math.min(duration,available):0;
  });
  const videoSec=movingSeconds.reduce((a,b)=>a+b,0);
  let stillRun=0,longestStillRunSec=0,aiStillSec=0,openingStillSec=0,openingMoving=false;
  const seen=new Set(),seenVideo=new Map();let repeatedSourceCount=0,weakSceneCount=0,cardSceneCount=0,verifiedSceneCount=0;
  for(const [i,b] of beats.entries()){
    const m=b.media||{};
    const dur=Math.max(0,Number(b.dur)||0);
    if(!openingMoving){if(movingSeconds[i]>0)openingMoving=true;else openingStillSec+=dur;}
    if(movingSeconds[i]>0)stillRun=0;
    stillRun+=dur-movingSeconds[i];longestStillRunSec=Math.max(longestStillRunSec,stillRun);
    if(m.type==='image'&&(m.provider==='ai'||m.editorial?.sourceRole==='illustration'))aiStillSec+=dur;
    if(!m.file)cardSceneCount++;
    if(Number.isFinite(m.gorsel)){verifiedSceneCount++;if(m.gorsel<2)weakSceneCount++;}
    const id=m.sourceId||m.kaynakId||m.file;
    if(id&&m.type==='video'){
      // One long archive film can supply many distinct moving shots. Judge
      // repeated footage by overlapping source intervals, not its filename.
      const startFrame=sourceTiming[i]?.sourceStartFrame??m.sourceStartFrame;
      const start=Number.isFinite(startFrame)?startFrame/fps:Number(m.sourceStart)||0;
      const length=movingSeconds[i]||dur;
      const previous=seenVideo.get(id)||[];
      if((seen.has(id)&&!previous.length)||previous.some(([a,b])=>Math.max(0,Math.min(b,start+length)-Math.max(a,start))>=Math.min(b-a,length)*.5))repeatedSourceCount++;
      previous.push([start,start+length]);seenVideo.set(id,previous);seen.add(id);
    }else if(id){if(seen.has(id))repeatedSourceCount++;else seen.add(id);}
  }
  const kinds={hardCut:0};
  for(const t of transitions){const k=t?.sure>0?(t.tip||'effect'):'hardCut';kinds[k]=(kinds[k]||0)+1;}
  return {
    version:2,durationSec:round(durationSec),videoSec:round(videoSec),
    aiStillSec:round(aiStillSec),aiStillPercent:durationSec?round(aiStillSec/durationSec*100,1):0,longestStillRunSec:round(longestStillRunSec),openingStillSec:round(openingStillSec),
    videoPercent:durationSec?round(videoSec/durationSec*100,1):0,
    sceneCount:beats.length,verifiedSceneCount,weakSceneCount,cardSceneCount,repeatedSourceCount,
    transitions:kinds,
  };
}

// Seconds of screen where nothing moves at all: a held still or card, as
// composed by the editorial planner. Source video and moving stills reset it.
export function longestFrozenRun(plans = []) {
  let run=0,longest=0;
  for(const p of plans){run=p?.camera?.mode==='hold'?run+(Number(p.duration)||0):0;longest=Math.max(longest,run);}
  return round(longest);
}

export function longformWarnings(report, job = {}) {
  if (!report) return [];
  const warnings=[];
  const director=job.mediaKind==='director',motionMode=['mixed','ai','director'].includes(job.mediaKind);
  const target=director?65:45;
  if(director&&job.ratio==='9:16'&&report.durationSec<90&&report.openingStillSec>3)
    warnings.push(`Açılışta ${report.openingStillSec} saniye hareketli kaynak olmadan geçiyor; ilk cümleleri doğrulanmış ayrı görsellerle ve erken okunur yazıyla yeniden kurgulayın.`);
  if (motionMode && (director||report.durationSec>=8*60) && report.videoPercent<target)
    warnings.push(`Videoda hareketli görüntü oranı %${report.videoPercent}; ${director?'AI Yönetmen':'Normal/AI görselli'} hedefi %${target}. Alakasız klip zorlanmadı; belge ağırlıklı sahneleri ve kaynak seçimini inceleyin.`);
  if(Number(report.longestFrozenRunSec)>6)
    warnings.push(`${report.longestFrozenRunSec} saniye boyunca ekranda hiçbir şey hareket etmiyor; fotoğraflara yavaş kamera hareketi verin veya planı bölün.`);
  const stillLimit=report.durationSec<=90?12:18;
  if(director&&report.longestStillRunSec>stillLimit)
    warnings.push(`${report.longestStillRunSec} saniye boyunca gerçek video yok, yalnızca fotoğraflar var (fotoğraflar donmuyor, kamera hareketiyle akıyor); araya ilgili bir video ya da anlamlı açıklayıcı animasyon koyarak ritmi çeşitlendirin.`);
  if(report.durationSec<8*60)return warnings;
  if(report.weakSceneCount>0)warnings.push(`${report.weakSceneCount} sahnenin görsel alaka puanı 2'nin altında; yayın öncesi değiştirin.`);
  if(report.repeatedSourceCount>Math.max(2,Math.floor(report.sceneCount*.05)))
    warnings.push(`${report.repeatedSourceCount} sahnede aynı kaynak tekrar ediyor; uzun videoda görsel çeşitliliğini artırın.`);
  return warnings;
}

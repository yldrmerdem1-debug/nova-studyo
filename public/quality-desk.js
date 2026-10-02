/* Yerel ölçümler, açık editör kayıtları ve gerçek CSV sonuçları. */
window.NovaQualityDesk = (() => {
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=(v,d=1)=>typeof v==='number'&&Number.isFinite(v)?v.toLocaleString('tr-TR',{maximumFractionDigits:d}):'—';
  const date=v=>v?new Date(v).toLocaleString('tr-TR'):'—';
  const stamp=v=>Number.isFinite(v)?`${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`:'—';
  const notice=s=>`<p class="editor-notice">${esc(s)}</p>`;
  const checks=[['opening','Açılışın vaadi ve ilk 30 saniye'],['evidence','Olgular ve kaynaklarla uyum'],['visuals','Görüntü seçimi, kesmeler ve geçişler'],['voice','Anlatım, telaffuz ve kesilmeyen cümleler'],['music','Müzik / efekt dengesi ve konuşmanın anlaşılması'],['captions','Altyazı zamanlaması ve okunabilirlik']];
  const metrics=[['views','İzlenme',''],['impressions','Gösterim',''],['ctr','Tıklanma oranı','%'],['averageViewed','Ortalama izlenen','%'],['retention30','30. saniyede tutma','%'],['averageViewDurationSec','Ortalama izlenme süresi',' sn'],['watchTimeHours','İzlenme süresi',' saat'],['subscribers','Abone değişimi','']];
  function cards(entries) {return `<div class="quality-metrics">${entries.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;}
  function metricCards(values={}) {return cards(metrics.filter(([k])=>values[k]!=null).map(([k,t,u])=>[t,num(values[k])+u]));}
  function setup(host,toast) {
    let busy=false;
    return async fn=>{
      if(busy)return;busy=true;
      const controls=[...host.querySelectorAll('button,input,textarea')].map(c=>[c,c.disabled]);
      controls.forEach(([c])=>c.disabled=true);
      const status=host.querySelector('[data-quality-status]');if(status)status.textContent='İşlem sürüyor…';
      try {await fn();if(status?.isConnected)status.textContent='İşlem tamamlandı.';}
      catch(err){if(status?.isConnected)status.textContent=err.message;toast(err.message,true);}
      finally{busy=false;controls.forEach(([c,disabled])=>{if(c.isConnected)c.disabled=disabled;});}
    };
  }
  function seekButtons(host) {
    host.querySelectorAll('[data-seek]').forEach(b=>b.onclick=()=>{
      const video=host.querySelector('video');if(!video)return;
      video.currentTime=Number(b.dataset.seek);video.play().catch(()=>{});video.scrollIntoView({block:'nearest'});
    });
  }
  const timeButton=t=>Number.isFinite(t)?`<button class="btn quality-time" data-seek="${t}">${stamp(t)}</button>`:'';
  function postflightHTML(state,base) {
    if(!state?.report)return '<p class="muted">Henüz yerel ölçüm yapılmadı. Görüntü ve ses sürelerini, kurgu aralıklarını ve kaynak tekrarlarını kontrol et.</p>';
    const r=state.report,m=r.measurements||{},d=m.duration||{},v=m.visuals||{},c=m.coverage||{},s=m.first30Speech||{};
    return `${state.stale?notice('Bu ölçüm eski sürüme ait. Güncel video için yeniden çalıştır.'):''}
      <p class="muted">${esc(date(r.generatedAt))} · ${r.status==='ready'?'Ölçümler tamamlandı':'Bazı ölçümler eksik'}</p>
      ${cards([['Video süresi',num(d.videoSec)+' sn'],['Hareketli görüntü oranı',num(v.videoPercent)+'%'],['Ses / görüntü süre farkı',num(d.avDeltaSec,3)+' sn'],['İlk 30 sn anlatım kapsamı',num(s.coveragePercent)+'%'],['Ses / kurgu kapsamı',num(c.ttsPercent)+'% / '+num(c.editPercent)+'%'],['Zayıf görsel sahne',num(v.weakSceneCount,0)],['Uzun görüntü beklemeleri',num(v.longHoldCount,0)],['Tekrarlanan kaynak',num(v.repeatedSourceCount,0)]])}
      <p class="muted">Anlatım kapsamı seslendirme zaman çizelgesinden hesaplanır. Bu ölçümler içerik doğruluğunu veya izleyici ilgisini puanlamaz.</p>
      <ul class="quality-findings">${(r.findings||[]).map(f=>`<li class="quality-${esc(f.severity)}">${timeButton(f.timestamp)}${esc(f.message)}${f.sceneId?` <small>${esc(f.sceneId)}</small>`:''}</li>`).join('')||'<li>Ölçülen kurallarda bulgu yok.</li>'}</ul>
      ${(r.actions||[]).length?`<details><summary>Önerilen kontroller (${r.actions.length})</summary><ul>${r.actions.map(a=>`<li>${esc(a.message)}</li>`).join('')}</ul></details>`:''}
      <div class="quality-samples">${(r.samples||[]).map(s=>`<button data-seek="${Number(s.timestamp)||0}" aria-label="${stamp(s.timestamp)} anını oynat"><img loading="lazy" src="${base}/postflight-frame/${encodeURIComponent(String(s.artifact).split('/').pop())}?v=${encodeURIComponent(r.generatedAt)}" alt="${stamp(s.timestamp)} örnek karesi"/><span>${stamp(s.timestamp)}</span></button>`).join('')}</div>`;
  }
  function speechHTML(state) {
    if(!state?.report)return '<p class="muted">Henüz konuşma karşılaştırması yok. Çalıştırıldığında final videonun sesi ElevenLabs’e gönderilir. Aynı sürümün kayıtlı sonucu tekrar ücretli çağrı yapmadan açılır.</p>';
    const r=state.report,c=r.comparison||{};
    return `${state.stale?notice('Konuşma karşılaştırması eski sürüme ait.'):''}<p class="muted">${esc(date(r.checkedAt))} · ${esc(r.model)}</p>
      ${cards([['Senaryo kelimesi',num(c.expectedWords,0)],['Tanınan kelime',num(c.recognizedWords,0)],['Sözcük farkı',num(c.wordDifferenceRatio*100)+'%']])}
      <p class="editor-notice">${esc(r.note)}</p><ul class="quality-findings">${(r.findings||[]).map(f=>`<li>${timeButton(f.timestamp)}<span>Metin: “${esc(f.expected)}” · Tanınan: “${esc(f.recognized)}”</span></li>`).join('')||'<li>Sözcük karşılaştırmasında fark bulunmadı.</li>'}</ul>
      <details><summary>Tanınan konuşma metni</summary><p>${esc(r.transcript)}</p></details>`;
  }
  function directorShotHTML(report,base) {
    if(!report?.scenes?.length)return report?.warnings?.length?`<p class="editor-notice">${esc(report.warnings.join(' '))}</p>`:'<p class="muted">Bu üretimde final kesme raporu yok. Yeni AI Yönetmen videolarında her kesmenin baş, orta ve son karesi burada gösterilir.</p>';
    const scenes=report.scenes;
    const flagged=scenes.filter(scene=>scene.status!=='ok').length;
    const labels={ok:'Uygun',mismatch:'Anlatımla uyuşmuyor',warning:'Gözden geçir',unverified:'Doğrulanamadı'};
    const media={video:'Video',image:'Görsel',card:'Grafik'};
    return `<p class="muted">${scenes.length} final kesme · ${flagged} sahne işaretli. Kesmenin baş, orta ve son kareleri birlikte denetlendi; örnek kareler hareketin tamamını veya tarihsel doğruluğu tek başına kanıtlamaz.</p>
      <div class="director-shot-grid">${scenes.map(scene=>{
        const status=Object.hasOwn(labels,scene.status)?scene.status:'unverified';
        const proof=/^director-shot-\d{4}\.jpg$/.test(String(scene.frameFile||''))?`${base}/file/${encodeURIComponent(scene.frameFile)}?v=${encodeURIComponent(report.generatedAt||'')}`:'';
        const frames=Array.isArray(scene.reviewFrames)?scene.reviewFrames.filter(frame=>['first','middle','last'].includes(frame?.position)&&/^director-shot-\d{4}(?:-(?:first|last))?\.jpg$/.test(String(frame?.frameFile||''))):[];
        const frameStrip=frames.length===3?`<details class="director-shot-extra"><summary>Baş · Orta · Son kareler</summary><div class="director-shot-strip">${frames.map(frame=>{
          const src=`${base}/file/${encodeURIComponent(frame.frameFile)}?v=${encodeURIComponent(report.generatedAt||'')}`;
          const label={first:'Baş',middle:'Orta',last:'Son'}[frame.position];
          return `<a href="${src}" target="_blank" rel="noopener"><img loading="lazy" src="${src}" alt="${esc(scene.id)} ${label.toLowerCase()} karesi"/><span>${label}</span></a>`;
        }).join('')}</div></details>`:'';
        const seconds=Number(scene.timestamp);
        const observation=scene.reason||scene.observation||'';
        return `<article class="director-shot-card director-shot-${status}">
          <div class="director-shot-proof">${proof?`<img loading="lazy" src="${proof}" alt="${esc(scene.id)} kesmesinin final video karesi"/>`:'<span>Kare yok</span>'}</div>
          <div class="director-shot-body"><div class="director-shot-meta"><strong>${esc(scene.id)}</strong><span>${esc(media[scene.mediaType]||scene.mediaType||'Sahne')}</span><span class="director-shot-status">${labels[status]}</span></div>${frameStrip}
          ${scene.spokenMoment?`<p><strong>Bu kesmenin anlatımı:</strong> ${esc(scene.spokenMoment)}</p><details><summary>Paragrafın tamamı</summary><p>${esc(scene.narration||'')}</p></details>`:`<p>${esc(scene.narration||'Anlatım bulunamadı.')}</p>`}
          ${observation?`<p class="muted">${esc(observation)}</p>`:''}
          ${Number.isFinite(seconds)?`<button class="btn quality-time" data-seek="${seconds}">${stamp(seconds)} anına git</button>`:''}</div></article>`;
      }).join('')}</div>`;
  }
  async function quality(host,{id,api,toast,job,onSaved}) {
    const base=`/api/jobs/${id}`;host.innerHTML='<p role="status">Kalite kayıtları açılıyor…</p>';
    const requests=['postflight','speech-check','editor-review'].map(k=>api(`${base}/${k}`));
    if(job.mediaKind==='director')requests.push(api(`${base}/file/director-shot-review.json`).catch(e=>{if(e.message==='HTTP 404')return null;throw e;}));
    const loaded=await Promise.allSettled(requests);
    if(!host.isConnected)return;
    let [post,speech,review]=loaded.map(r=>r.status==='fulfilled'?r.value:null);
    const directorShots=loaded[3]?.status==='fulfilled'?loaded[3].value:null;
    const errors=loaded.filter(r=>r.status==='rejected').map(r=>r.reason.message);
    const active=['running','queued','awaiting_picks','awaiting_cost'].includes(job.status),pending=job.needsRerender;
    const saved=review?.stale?null:review?.saved;
    host.innerHTML=`<div class="quality-desk">${errors.map(notice).join('')}${pending?notice('Kaydedilmiş sahne değişiklikleri henüz videoya işlenmedi. İncelemeden önce videoya işle.'):''}
      <div class="quality-opening"><div><h3>Videoyu kontrol et</h3><p class="muted">Önce ilk 30 saniyeyi, ardından işaretli anları izle ve dinle.</p>${review?.available?`<video id="qualityVideo" controls preload="metadata" src="${base}/file/output.mp4?v=${encodeURIComponent(review.revision)}"></video><button class="btn" data-seek="0">Açılışı oynat</button>`:'<p class="muted">Tamamlanmış video henüz yok.</p>'}</div>
      <section><h3>İnceleme kaydım</h3>${review?.stale?notice('Video veya senaryo değişti; eski işaretler güncel inceleme sayılmıyor.'):''}<p class="muted">Yalnızca gerçekten kontrol ettiğin alanları işaretle. Otomatik ölçümler bu seçimleri doldurmaz.</p>
      ${checks.map(([k,t])=>`<label class="quality-check"><input type="checkbox" data-review="${k}" ${saved?.checks?.[k]?'checked':''}/> ${esc(t)}</label>`).join('')}
      <label class="field-label" for="qualityNotes">İnceleme notları</label><textarea id="qualityNotes" rows="3" maxlength="4000">${esc(saved?.notes||'')}</textarea><button id="qualitySave" class="btn primary" ${!review?.available||active||pending?'disabled':''}>İncelemeyi kaydet</button><p id="qualitySaved" class="muted">${saved?'Kayıt: '+esc(date(saved.recordedAt)):''}</p></section></div>
      <p data-quality-status role="status" aria-live="polite"></p>
      ${job.mediaKind==='director'?`<section class="quality-section"><h3>AI Yönetmen · final kesmeler</h3>${directorShotHTML(directorShots,base)}</section>`:''}
      <section class="quality-section"><div class="quality-section-head"><h3>Yerel görüntü ve ses ölçümleri</h3><button id="qualityMeasure" class="btn" ${active||pending?'disabled':''}>Ölçümleri çalıştır</button></div><div id="qualityMeasurements">${postflightHTML(post,base)}</div></section>
      <section class="quality-section"><div class="quality-section-head"><h3>Konuşma / senaryo karşılaştırması</h3><button id="qualitySpeech" class="btn" ${!review?.available||active||pending?'disabled':''}>Konuşmayı karşılaştır · ElevenLabs ücreti doğabilir</button></div><div id="qualitySpeechResult">${speechHTML(speech)}</div></section></div>`;
    const request=setup(host,toast);
    host.querySelector('#qualityMeasure').onclick=()=>request(async()=>{const report=await api(`${base}/postflight`,{method:'POST'});if(!host.isConnected)return;post={report,stale:false};host.querySelector('#qualityMeasurements').innerHTML=postflightHTML(post,base);seekButtons(host);});
    host.querySelector('#qualitySpeech').onclick=()=>request(async()=>{const report=await api(`${base}/speech-check`,{method:'POST'});if(!host.isConnected)return;speech={report,stale:false};host.querySelector('#qualitySpeechResult').innerHTML=speechHTML(speech);seekButtons(host);});
    host.querySelector('#qualitySave').onclick=()=>request(async()=>{const selected=Object.fromEntries([...host.querySelectorAll('[data-review]')].map(x=>[x.dataset.review,x.checked]));review=await api(`${base}/editor-review`,{method:'POST',body:{revision:review.revision,checks:selected,notes:host.querySelector('#qualityNotes').value}});if(host.isConnected){host.querySelector('#qualitySaved').textContent='Kayıt: '+date(review.saved.recordedAt);onSaved?.();}toast('İnceleme kaydedildi.');});
    seekButtons(host);
  }
  function retentionChart(retention) {
    const points=retention?.points||[];if(!points.length)return '<p class="muted">Dosyada izleyici tutma eğrisi yok.</p>';
    const seconds=points.every(p=>Number.isFinite(p.elapsedSec)),axis=p=>seconds?p.elapsedSec:p.elapsedRatio*100;
    const maxX=Math.max(1,...points.map(axis)),maxY=Math.max(1,...points.map(p=>p.audienceWatchRatio));
    const xy=p=>`${50+axis(p)/maxX*640},${200-p.audienceWatchRatio/maxY*170}`;
    return `<figure class="quality-retention"><svg viewBox="0 0 720 245" role="img" aria-label="CSV’den alınan izleyici tutma eğrisi"><path d="M50 25 V200 H695" fill="none" stroke="currentColor" opacity=".4"/><text x="4" y="32">${num(maxY*100,0)}%</text><text x="14" y="205">0%</text><text x="50" y="228">0</text><text x="615" y="228">${num(maxX)}${seconds?' sn':'%'}</text><polyline points="${points.map(xy).join(' ')}" fill="none" stroke="#7dcab6" stroke-width="3"/>${points.length<=300?points.map(p=>`<circle cx="${xy(p).split(',')[0]}" cy="${xy(p).split(',')[1]}" r="3" fill="#7dcab6"><title>${num(axis(p))}${seconds?' sn':'%'}: ${num(p.audienceWatchRatio*100)}%</title></circle>`).join(''):''}</svg><figcaption>Zaman: ${seconds?'saniye':'video süresinin yüzdesi'} · Değerler içe aktarılan dosyadan. ${retention.retention30?.method==='linear-interpolation'?'30. saniye değeri iki ölçüm arasından hesaplandı.':''}</figcaption></figure>`;
  }
  const periodText=p=>typeof p==='string'?p:p?.start?`${p.start} – ${p.end}`:'Dönem belirtilmedi';
  function audienceHTML(r) {
    return `<h3>Son içe aktarım</h3>${r.latest?`<p class="muted">${esc(r.latest.filename)} · ${esc(periodText(r.latest.period))} · ${esc(date(r.latest.importedAt))}</p>${metricCards(r.metrics)}${retentionChart(r.retention)}`:'<p class="editor-notice">Henüz gerçek CSV verisi eklenmedi. Gösterim, tıklanma ve izleyici tutma sonuçları burada görünecek.</p>'}
      ${(r.suggestions||[]).map(notice).join('')}<details><summary>Verinin kapsamı</summary><ul>${(r.caveats||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ul><p>Dosyada bulunmayan ölçümler: ${esc((r.unavailable||[]).map(k=>metrics.find(m=>m[0]===k)?.[1]||({audienceRetentionCurve:'İzleyici tutma eğrisi'}[k])||k).join(', '))||'Yok'}</p></details>
      ${r.manual?`<details><summary>Elle girilen sonuçlar · ${esc(date(r.manual.recordedAt))}</summary>${metricCards(r.manual)}<p>${esc(r.manual.notes||'')}</p></details>`:''}
      <h3>İçe aktarım geçmişi (${r.imports.length})</h3><div class="quality-history">${[...r.imports].reverse().map(i=>`<details><summary>${esc(periodText(i.period))} · ${esc(i.filename)} · ${esc(date(i.importedAt))}</summary><p>Video: ${esc(i.videoId||'Dosyada belirtilmemiş')}</p>${metricCards(i.metrics)}${retentionChart(i.retention)}</details>`).join('')||'<p class="muted">İçe aktarımlar önceki kayıtları koruyarak eklenir.</p>'}</div>`;
  }
  async function audience(host,{id,api,toast,job,onSaved}) {
    const base=`/api/jobs/${id}`;host.innerHTML='<p role="status">İzleyici kayıtları açılıyor…</p>';
    let report;try{report=await api(`${base}/audience`);}catch(err){if(host.isConnected)host.innerHTML=notice(err.message);return;}
    if(!host.isConnected)return;
    const active=['running','queued','awaiting_picks','awaiting_cost'].includes(job.status);
    host.innerHTML=`<div class="quality-desk"><section class="quality-import"><h3>YouTube Studio CSV’sini içe aktar</h3><p class="muted">Studio → Analytics → Gelişmiş mod bölümünden raporu CSV olarak dışa aktar; ZIP içindeki CSV dosyasını seç. Tutma eğrisi ayrı bir dışa aktarımda bulunabilir. Kanal bağlantısı tek başına özel Analytics verilerine erişim sağlamaz.</p>
      <label class="field-label" for="audienceCsv">CSV dosyası · en fazla 5 MB</label><input id="audienceCsv" type="file" accept=".csv,text/csv"/>
      <div class="quality-import-fields"><label>Video kimliği (çok videolu dosyada gerekli)<input id="audienceVideo" type="text" maxlength="64" placeholder="YouTube video kimliği"/></label><label>Video süresi (saniye, dosyada yoksa)<input id="audienceDuration" type="number" min="0.1" step="0.01" placeholder="Örn. 62.4"/></label><label>Ölçüm dönemi<input id="audiencePeriod" type="text" maxlength="200" placeholder="Örn. İlk 7 gün"/></label></div>
      <button id="audienceImport" class="btn primary" ${active?'disabled':''}>CSV’yi içe aktar</button><p data-quality-status role="status" aria-live="polite"></p></section><section id="audienceResults">${audienceHTML(report)}</section></div>`;
    const request=setup(host,toast);
    host.querySelector('#audienceImport').onclick=()=>request(async()=>{
      const file=host.querySelector('#audienceCsv').files[0];if(!file)throw new Error('Önce bir CSV dosyası seç.');if(file.size>5*1024*1024)throw new Error('CSV en fazla 5 MB olabilir.');
      const body={csv:await file.text(),filename:file.name};
      const videoId=host.querySelector('#audienceVideo').value.trim(),duration=host.querySelector('#audienceDuration').value,period=host.querySelector('#audiencePeriod').value.trim();
      if(videoId)body.videoId=videoId;if(duration)body.durationSec=Number(duration);if(period)body.period=period;
      const result=await api(`${base}/audience`,{method:'POST',body});if(!host.isConnected)return;report=result.report;host.querySelector('#audienceResults').innerHTML=audienceHTML(report);onSaved?.();toast('Gerçek izleyici verisi geçmişe eklendi.');
    });
  }
  return {quality,audience,directorShotHTML};
})();

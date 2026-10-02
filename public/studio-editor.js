/* Sahne, kapak ve yayın masası. Sağlayıcılara doğrudan istek göndermez. */
window.NovaEditor = (() => {
  const e = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function open(id,{api,modal,closeModal,toast,onChange}) {
    let data=await api(`/api/jobs/${id}/editor`), review=await api(`/api/jobs/${id}/review`), tab=data.timeline?'shots':'scenes';
    const changes=new Map(), shotDraft=new Map(); let shotFilter='all'; let coverAsset=review.cover?.asset || null, busy=false, regenerateSeo=false, visualStyle=data.job.visualStyle;
    let editorElement=null,tabDirty=false;
    const base=`/api/jobs/${id}`;
    const request=async(fn) => { if(busy)return;busy=true;const controls=[...document.querySelectorAll('#novaEditor button,#novaEditor input,#novaEditor textarea,#novaEditor select')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);try {await fn();}catch(err){toast(err.message,true);}finally{busy=false;controls.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});} };
    const upload=async file=>{
      if(!file) return null;
      if(file.size>128*1024*1024) throw new Error('Dosya en fazla 128 MB olabilir.');
      const r=await fetch(`${base}/import?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;
    };
    const save=async()=>{
      if(changes.size||shotDraft.size||regenerateSeo||visualStyle!==data.job.visualStyle){data=await api(`${base}/editor`,{method:'PATCH',body:{segments:[...changes.values()],regenerateSeo,...(shotDraft.size?{shots:Object.fromEntries(shotDraft)}:{}),...(visualStyle!==data.job.visualStyle?{visualStyle}:{})}});changes.clear();shotDraft.clear();regenerateSeo=false;visualStyle=data.job.visualStyle;review=await api(`${base}/review`);onChange?.(data.job);}
    };
    // Planlar: teslim edilen videonun her planı için giren geçiş, ekran yazısı ve
    // kamera kararı. Kararlar özgün medyayı değiştirmez; "Otomatik" geri alır.
    // Kaydet ve videoya işle otomasyonu: açıkken tek düğme kaydeder ve render'ı sıraya alır.
    let autoRender=true;try{autoRender=localStorage.getItem('nova.autoRender')!=='0';}catch{}
    const autoToggle=()=>`<label class="auto-render"><input type="checkbox" data-autorender ${autoRender?'checked':''}/> Kaydedince videoya otomatik işle</label>`;
    const bindAuto=host=>host.querySelectorAll('[data-autorender]').forEach(x=>x.onchange=()=>{autoRender=x.checked;try{localStorage.setItem('nova.autoRender',autoRender?'1':'0');}catch{}draw();});
    const tc=sec=>{sec=Math.max(0,sec||0);return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;};
    const shotEdit=id=>shotDraft.has(id)?shotDraft.get(id):(data.shotEdits?.[id]||null);
    const setShot=(id,patch)=>{
      const cur={...(shotEdit(id)||{})};
      for(const [k,v] of Object.entries(patch)){if(v===undefined||v==='auto')delete cur[k];else cur[k]=v;}
      const next=Object.keys(cur).length?cur:null,saved=data.shotEdits?.[id]||null;
      if(JSON.stringify(next)===JSON.stringify(saved))shotDraft.delete(id);else shotDraft.set(id,next);
      const st=document.querySelector('#edState');if(st)st.textContent=shotDraft.size?`${shotDraft.size} planda kaydedilmemiş karar var.`:'Kaydedilmemiş plan kararı yok.';
      const n=document.querySelector('#shPending');if(n)n.textContent=shotDraft.size?`${shotDraft.size} değişiklik`:'';
    };
    const sec=v=>`${Number(v||0).toFixed(1).replace('.',',')} sn`;
    const signed=v=>`${v>0?'+':''}${sec(v)}`;
    // Kesme noktası: aynı cümlenin önceki planıyla sınır; iki plan da en az 1,2 sn kalır.
    const rollControl=(sh,e,can)=>{
      const lo=-Math.min(3,Math.max(0,sh.rollWith.duration-1.2)),hi=Math.min(3,Math.max(0,sh.duration-1.2)),v=e.roll||0;
      return `<div class="shot-roll"><label>Kesme noktası <b data-rollv>${signed(v)}</b><input data-f="roll" type="range" min="${lo.toFixed(1)}" max="${hi.toFixed(1)}" step="0.1" value="${v}" ${!can?'disabled':''}/></label><p class="muted">Sağa: bu plan daha geç başlar, önceki plan (${e_(sh.rollWith.id)}) uzar. Sola: önceki plan kısalır. Konuşma senkronu değişmez.</p></div>`;
    };
    function drawShots(host){
      const tl=data.timeline,c=data.capabilities,opt=data.shotOptions||{cameras:{},transitions:{}},can=c.canEditShots;
      const trName=t=>!t||!t.sure?'Sert kesme':`${opt.transitions[t.tip]?.name||t.tip} ${String(t.sure).replace('.',',')} sn`;
      const filters=[['all','Tümü'],['text','Yazılı'],['trans','Geçişli'],['repeat','Tekrarlar'],['edited','Değiştirdiklerim']];
      const visible=tl.shots.filter(sh=>{const e=shotEdit(sh.id);return shotFilter==='all'||(shotFilter==='text'&&(sh.overlay.length||e?.overlay?.mode==='custom'))||(shotFilter==='trans'&&(sh.transitionIn?.sure>0||e?.transitionIn))||(shotFilter==='repeat'&&sh.repeatOf)||(shotFilter==='edited'&&e);});
      host.innerHTML=`<div class="shot-toolbar"><p class="muted">Her planın <b>girişteki geçişini</b>, <b>ekran yazısını</b> ve fotoğraflarda <b>kamera hareketini</b> seç. Kaydedince “Kaydet ve videoya işle” ile yeni video üretilir; mevcut video o bitene kadar korunur.</p>${tl.editorial?'':'<p class="editor-notice">Bu video Editoryal kurgu stilinde değil: geçiş kararları uygulanır, ekran yazısı ve kamera kararları yalnızca Editoryal stilde işlenir.</p>'}
        <video id="shPlayer" class="shot-player" controls preload="metadata" playsinline src="/api/jobs/${encodeURIComponent(id)}/file/output.mp4"></video>
        <div class="shot-filters">${filters.map(([k,t])=>`<button class="chip ${shotFilter===k?'sel':''}" data-shfilter="${k}">${t}</button>`).join('')}<span class="muted" id="shCount">${visible.length}/${tl.shots.length} plan</span></div></div>
        <div class="shot-list">${visible.map(sh=>{const e=shotEdit(sh.id)||{},ov=e.overlay||null,tr=e.transitionIn||null,isVideo=sh.mediaType==='video',dirty=shotDraft.has(sh.id);
          return `<article class="shot-card ${e&&Object.keys(e).length?'edited':''}" data-shot="${e_(sh.id)}">
          <button class="shot-thumb ${tl.height>tl.width?'portrait':''}" data-play="${sh.start}" title="Bu plandan oynat"><img loading="lazy" src="${base}/shot-frame/${encodeURIComponent(sh.id)}" alt="Plan ${sh.index+1} karesi"/><span>${tc(sh.start)} · ${String(sh.duration.toFixed(1)).replace('.',',')} sn</span><i>▶</i></button>
          <div class="shot-body"><div class="shot-title"><b>Plan ${sh.index+1}</b><span class="muted">${isVideo?'Video':sh.mediaType==='image'?'Fotoğraf':'Kart'} · ${e_(sh.id)}</span>${sh.repeatOf?`<em class="shot-badge repeat" title="Bu görüntü daha önce ${e_(sh.repeatOf)} planında gösterildi">tekrar · ${e_(sh.repeatOf)}</em>`:''}${dirty?'<em class="shot-badge">kaydedilmedi</em>':Object.keys(e).length?'<em class="shot-badge done">düzenlendi</em>':''}</div>
          ${sh.narration?`<p class="shot-narr">${e_(sh.narration)}</p>`:''}
          <p class="shot-now muted">Şu an: ${sh.index?`giriş ${e_(trName(sh.transitionIn))}`:'video açılışı'} · ${sh.overlay.length?`yazı “${e_(sh.overlay.join(' · '))}”`:'ekran yazısı yok'}${sh.camera&&sh.camera!=='source'?` · kamera ${e_(opt.cameras[sh.camera]||sh.camera)}`:''}</p>
          <div class="shot-controls">
           <label>Giriş geçişi<select data-f="transition" ${!can||!sh.index?'disabled':''}><option value="auto">Otomatik</option>${Object.entries(opt.transitions).map(([k,t])=>`<option value="${k}" ${tr?.type===k?'selected':''}>${e_(t.name)}</option>`).join('')}</select></label>
           <label>Süre (sn)<input data-f="duration" type="number" min="0.12" max="1.5" step="0.05" value="${tr&&tr.type!=='cut'?tr.duration:''}" placeholder="—" ${!can||!tr||tr.type==='cut'?'disabled':''}/></label>
           <label>Kamera<select data-f="camera" ${!can||isVideo||!tl.editorial?'disabled':''}><option value="auto">${isVideo?'Kaynak hareketi':'Otomatik'}</option>${Object.entries(opt.cameras).map(([k,n])=>`<option value="${k}" ${e.camera===k?'selected':''}>${e_(n)}</option>`).join('')}</select></label>
           <label>Ekran yazısı<select data-f="overlay" ${!can||!tl.editorial?'disabled':''}><option value="auto">Otomatik</option><option value="off" ${ov?.mode==='off'?'selected':''}>Kapalı</option><option value="custom" ${ov?.mode==='custom'?'selected':''}>Özel yazı</option></select></label>
          </div>
          ${ov?.mode==='custom'?`<div class="shot-overlay"><label>Ana yazı<input data-f="ovValue" maxlength="40" value="${e_(ov.value)}" placeholder="örn. 4 HAZİRAN 1942" ${!can?'disabled':''}/></label><label>Alt etiket<input data-f="ovLabel" maxlength="60" value="${e_(ov.label||'')}" placeholder="isteğe bağlı" ${!can?'disabled':''}/></label><label>Konum<select data-f="ovPos" ${!can?'disabled':''}>${[['left','Sol'],['right','Sağ'],['center','Orta']].map(([k,t])=>`<option value="${k}" ${ov.position===k?'selected':''}>${t}</option>`).join('')}</select></label><p class="muted">Rakam ve birimi anlatımdakiyle birebir yaz; ekranda söylenmeyen bilgi durmasın.</p></div>`:''}
          ${sh.rollWith?rollControl(sh,e,can):''}
          ${isVideo&&tl.editorial?`<details class="shot-source" data-source><summary>Klip başlangıcı · ${Number.isFinite(e.sourceStart)?`seçilen ${sec(e.sourceStart)}`:`otomatik (${sec(sh.sourceStart??0)})`}</summary><div class="shot-source-body muted">Kaynak bilgisi yükleniyor…</div></details>`:''}
          ${tl.editorial?`<div class="shot-preview-row"><button class="btn" data-preview ${!can?'disabled':''}>▶ Bu planı önizle</button><span class="muted" data-preview-state></span></div><div data-preview-box></div>`:''}
          ${Object.keys(e).length?`<button class="btn shot-reset" data-reset ${!can?'disabled':''}>Otomatiğe dön</button>`:''}
          </div></article>`;}).join('')||'<p class="muted">Bu filtrede plan yok.</p>'}</div>
        <div class="shot-actionbar"><span id="shPending" class="muted">${shotDraft.size?`${shotDraft.size} değişiklik`:''}</span>${autoToggle()}<button class="btn" id="shSave" ${autoRender?'hidden':''} ${!c.canEdit&&!can?'disabled':''}>Kaydet</button><button class="btn primary" id="shRender" ${!c.canRerender?'disabled':''}>Kaydet ve videoya işle</button></div>`;
      const player=host.querySelector('#shPlayer');
      host.querySelectorAll('[data-shfilter]').forEach(b=>b.onclick=()=>{shotFilter=b.dataset.shfilter;drawShots(host);});
      host.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>{player.currentTime=Number(b.dataset.play)+.05;player.scrollIntoView({behavior:'smooth',block:'center'});player.play().catch(()=>{});});
      host.querySelectorAll('.shot-card').forEach(card=>{
        const sid=card.dataset.shot,val=f=>card.querySelector(`[data-f="${f}"]`)?.value;
        const redraw=()=>{const y=host.closest('.modal')?.scrollTop;drawShots(host);const m=host.closest('.modal');if(m&&y!=null)m.scrollTop=y;};
        card.querySelector('[data-f="transition"]').onchange=x=>{const t=x.target.value;setShot(sid,{transitionIn:t==='auto'?'auto':{type:t,duration:t==='cut'?0:opt.transitions[t].duration}});redraw();};
        card.querySelector('[data-f="duration"]').onchange=x=>{const cur=shotEdit(sid)?.transitionIn;if(!cur)return;const d=Math.min(1.5,Math.max(.12,Number(x.target.value)||opt.transitions[cur.type].duration));setShot(sid,{transitionIn:{...cur,duration:d}});x.target.value=d;};
        card.querySelector('[data-f="camera"]').onchange=x=>setShot(sid,{camera:x.target.value});
        card.querySelector('[data-f="overlay"]').onchange=x=>{const m=x.target.value,cur=tl.shots.find(s=>s.id===sid);setShot(sid,{overlay:m==='auto'?'auto':m==='off'?{mode:'off'}:{mode:'custom',value:(shotEdit(sid)?.overlay?.value)||cur.overlay[0]||'',label:(shotEdit(sid)?.overlay?.label)||cur.overlay.slice(1).join(' ')||'',position:cur.overlayPosition||'left'}});redraw();};
        const ovSync=()=>setShot(sid,{overlay:{mode:'custom',value:val('ovValue')||'',label:val('ovLabel')||'',position:val('ovPos')||'left'}});
        ['ovValue','ovLabel','ovPos'].forEach(k=>{const el=card.querySelector(`[data-f="${k}"]`);if(el)el[k==='ovPos'?'onchange':'oninput']=ovSync;});
        const roll=card.querySelector('[data-f="roll"]');
        if(roll){roll.oninput=()=>{card.querySelector('[data-rollv]').textContent=signed(Number(roll.value));};roll.onchange=()=>setShot(sid,{roll:Number(roll.value)||'auto'});}
        const src=card.querySelector('[data-source]');
        src?.addEventListener('toggle',async()=>{
          if(!src.open||src.dataset.loaded)return;src.dataset.loaded='1';const body=src.querySelector('.shot-source-body');
          try{
            const info=await api(`${base}/shot-source/${encodeURIComponent(sid)}`);
            const max=Math.max(0,(info.duration||0)-info.shotDuration-.5),cur=Math.min(shotEdit(sid)?.sourceStart??info.start,max);
            const frame=t=>`${base}/shot-source-frame/${encodeURIComponent(sid)}?t=${Number(t).toFixed(1)}`;
            body.classList.remove('muted');
            body.innerHTML=`<img data-srcframe alt="Kaynak karesi" src="${frame(cur)}"/><label>Başlangıç <b data-srcv>${sec(cur)}</b> · kaynak ${Math.round(info.duration||0)} sn<input data-f="source" type="range" min="0" max="${max.toFixed(1)}" step="0.1" value="${cur}" ${!can?'disabled':''}/></label><button class="btn" data-srcauto ${!can?'disabled':''}>Otomatik başlangıca dön</button><p class="muted">Plan ${sec(info.shotDuration)} sürer; kaydırıcı kaynağın sonuna taşmayacak şekilde sınırlıdır.</p>`;
            const range=body.querySelector('[data-f="source"]'),img=body.querySelector('[data-srcframe]');let timer;
            range.oninput=()=>{body.querySelector('[data-srcv]').textContent=sec(Number(range.value));clearTimeout(timer);timer=setTimeout(()=>{img.src=frame(range.value);},250);};
            range.onchange=()=>setShot(sid,{sourceStart:Number(range.value)});
            body.querySelector('[data-srcauto]').onclick=()=>{setShot(sid,{sourceStart:'auto'});range.value=Math.min(info.start,max);range.oninput();};
          }catch(err){body.textContent=err.message;}
        });
        card.querySelector('[data-preview]')?.addEventListener('click',async ev=>{
          const btn=ev.currentTarget,state=card.querySelector('[data-preview-state]'),box=card.querySelector('[data-preview-box]');
          btn.disabled=true;state.textContent='Plan kodlanıyor…';
          try{
            const r=await api(`${base}/shot-preview/${encodeURIComponent(sid)}`,{method:'POST',body:{edit:shotEdit(sid)}});
            box.innerHTML=`<video class="shot-preview-video ${tl.height>tl.width?'portrait':''}" controls autoplay playsinline src="${r.url}"></video>`;
            state.textContent=shotDraft.has(sid)?'Önizleme · kaydedilmemiş karar':'Önizleme';
          }catch(err){state.textContent=err.message;}finally{btn.disabled=!can;}
        });
        card.querySelector('[data-reset]')?.addEventListener('click',()=>{shotDraft.set(sid,null);if(!data.shotEdits?.[sid])shotDraft.delete(sid);setShot(sid,{});redraw();});
      });
      const invalid=()=>[...shotDraft.entries()].find(([,v])=>v?.overlay?.mode==='custom'&&!v.overlay.value.trim());
      bindAuto(host);
      host.querySelector('#shSave').onclick=()=>request(async()=>{const bad=invalid();if(bad)throw new Error(`Plan ${bad[0]}: özel ekran yazısı boş olamaz.`);await save();toast('Plan kararları kaydedildi.');draw();});
      host.querySelector('#shRender').onclick=()=>request(async()=>{const bad=invalid();if(bad)throw new Error(`Plan ${bad[0]}: özel ekran yazısı boş olamaz.`);await save();const r=await api(`${base}/rerender`,{method:'POST'});onChange?.(r.job);closeModal();toast('Düzenlenen video sıraya alındı.');});
    }
    const e_=e;
    function draw() {
      if(editorElement && !editorElement.isConnected)return;
      const c=data.capabilities;
      modal(`<div id="novaEditor" class="nova-editor"><div class="editor-head"><div><h2>Kurgu ve yayın masası</h2><p>${e(data.job.meta?.title || data.job.topic)}</p></div><button class="btn" id="edClose">Kapat</button></div>
        <div class="editor-tabs">${[...(data.timeline?[['shots','Planlar · geçiş ve yazı']]:[]),['scenes','Sahneler ve ses'],['cover','Kapak'],['quality','Kalite kontrolü'],['publish','Yayın paketi'],['audience','İzleyici verisi']].map(([k,t])=>`<button class="btn ${tab===k?'primary':''}" data-edtab="${k}">${t}</button>`).join('')}</div>
        <div id="edBody"></div><div class="editor-footer"><span id="edState" class="muted">${data.job.needsRerender?'Kaydedilen değişikliklerin videoya işlenmesi gerekiyor.':'Kaynaklar üzerinden düzenle; mevcut video yeniden render bitene kadar korunur.'}</span></div></div>`);
      editorElement=document.querySelector('#novaEditor');
      tabDirty=false;
      editorElement.addEventListener('input',()=>{tabDirty=true;});
      document.querySelector('#edClose').onclick=()=>{if(busy)return;if((changes.size||shotDraft.size||regenerateSeo||tabDirty||visualStyle!==data.job.visualStyle)&&!confirm('Kaydedilmemiş değişiklikler kapatılsın mı?'))return;closeModal();};
      document.querySelectorAll('[data-edtab]').forEach(b=>b.onclick=()=>{if(b.dataset.edtab===tab)return;if(tabDirty&&tab!=='shots'&&!confirm('Bu sekmede kaydedilmemiş değişiklikler var. Sekme değiştirilsin mi?'))return;tab=b.dataset.edtab;draw();});
      const host=document.querySelector('#edBody');
      if(tab==='shots') { drawShots(host); } else if(tab==='scenes') {
        host.innerHTML=`${c.warnings.map(w=>`<p class="editor-notice">${e(w)}</p>`).join('')}<label class="field-label" for="edVisualStyle">Görsel dil</label><select id="edVisualStyle" ${!c.canEdit?'disabled':''}>${visualStyle&&!data.visualStyles?.[visualStyle]?`<option value="${e(visualStyle)}" selected>Eski kayıt (${e(visualStyle)})</option>`:''}${Object.entries(data.visualStyles||{}).map(([key,style])=>`<option value="${e(key)}" ${key===visualStyle?'selected':''}>${e(style.name||key)}</option>`).join('')}</select><p class="muted">Stil değişikliği metni, sesi ve kaynak medyayı korur; yalnızca videoyu yeniden işler.</p><p class="muted">İlk sahne merak uyandırmalı; kapanış açılışın cevabını vermeli. Metin değişince yalnızca ilgili ses yeniden üretilir. Görsel değişimi bu sahnenin tüm görsel adımlarına uygulanır.</p>
          <div class="editor-actions">${autoToggle()}<button class="btn" id="edSave" ${autoRender?'hidden':''} ${!c.canEdit?'disabled':''}>Değişiklikleri kaydet</button><button class="btn primary" id="edRender" ${!c.canRerender?'disabled':''}>Kaydet ve videoya işle</button>${c.canResume?'<button class="btn" id="edResume">Kaldığı yerden devam et</button>':''}</div>
          <div class="editor-scenes">${data.scenes.map((s,i)=>`<article class="editor-scene"><div class="editor-scene-title"><b>${i===0?'Açılış kancası':i===data.scenes.length-1?'Kapanış':'Sahne '+(i+1)}</b><span class="muted">${e(s.segId)}</span></div><textarea data-text="${e(s.segId)}" rows="5" maxlength="5000" ${!c.canEdit?'disabled':''}>${e(changes.get(s.segId)?.text??s.text)}</textarea>
          <div class="editor-media">${s.media.filter(m=>m.available && m.file).map(m=>m.type==='video'?`<video controls preload="none" src="${base}/media/${encodeURIComponent(m.beatId)}"></video>`:`<img loading="lazy" src="${base}/media/${encodeURIComponent(m.beatId)}" alt="Sahne görseli"/>`).join('')||'<span class="muted">Kaynak görsel henüz yok.</span>'}</div>
          ${s.audioAvailable?`<audio controls preload="none" src="${base}/voice/${encodeURIComponent(s.segId)}"></audio>`:'<p class="muted">Ses yeniden üretilecek.</p>'}<label class="editor-file">Görsel / video değiştir<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" data-upload="${e(s.segId)}" ${!c.canEdit?'disabled':''}/></label><span class="muted" data-upload-state="${e(s.segId)}">${changes.get(s.segId)?.mediaPath?'Yeni görsel hazır; kaydetmeyi bekliyor.':''}</span></article>`).join('')}</div>`;
        host.querySelectorAll('[data-text]').forEach(x=>x.oninput=()=>{const k=x.dataset.text;changes.set(k,{...changes.get(k),segId:k,text:x.value});document.querySelector('#edState').textContent='Kaydedilmemiş değişiklikler var.';});
        host.querySelector('#edVisualStyle').onchange=x=>{visualStyle=x.target.value;tabDirty=true;document.querySelector('#edState').textContent='Kaydedilmemiş stil değişikliği var.';};
        host.querySelectorAll('[data-upload]').forEach(x=>x.onchange=()=>request(async()=>{const a=await upload(x.files[0]);if(!a)return;const k=x.dataset.upload;changes.set(k,{...changes.get(k),segId:k,mediaPath:a.mediaPath});host.querySelector(`[data-upload-state="${k}"]`).textContent='Yeni görsel hazır; kaydetmeyi bekliyor.';}));
        host.querySelector('.editor-actions').insertAdjacentHTML('afterend',`<label class="editor-file"><input type="checkbox" id="edSeo" ${regenerateSeo?'checked':''} ${!c.canEdit?'disabled':''}/> Videoya işlerken SEO paketini yeniden üret · sağlayıcı ücreti doğabilir</label>`);
        host.insertAdjacentHTML('afterbegin',`<details class="editor-budget"><summary>Bu işin harcama eşiği ve model fiyatları</summary><p class="muted">Metin modeli için yeni istekten önce kontrol edilen tahmini eşik. 0 kapatır. Görsel, ses ve arama araçlarının ücretlerini kapsamaz; son istek eşiği aşabilir.</p><label class="field-label" for="edBudget">Metin modeli eşiği ($)</label><input id="edBudget" type="number" min="0" step="0.5" value="${data.job.costBudgetUsd??0}"/>${data.job.aiSupport==='auto'?`<label class="field-label" for="edAiBudget">AI görsel/video tahmini rezervi ($)</label><input id="edAiBudget" type="number" min="0" max="10000" value="${data.job.aiSupportBudgetUsd??20}"/><p class="muted">0 yeni AI üretimini durdurur. Sağlayıcının gerçek faturası farklı olabilir.</p>`:''}<label class="editor-file"><input type="checkbox" id="edRates"/> Ayarlar’daki model fiyatlarını bu işe uygula</label><button class="btn" id="edBudgetSave" ${!c.canAdjustBudget?'disabled':''}>Bütçe ayarını güncelle</button></details>`);
        if(data.job.aiSupport==='auto')host.querySelector('#edBudgetSave').insertAdjacentHTML('beforebegin',`<label class="editor-file"><input type="checkbox" id="edRetryAi" ${!c.canAdjustBudget?'disabled':''}/> Başarısız AI üretimlerini yeniden dene (ek ücret oluşabilir)</label><p class="muted">Kaydetmek başarısız denemeleri yeniden açar; önceki harcamalar ve kabul edilen görseller korunur. Üretimi başlatmak için ardından Devam et veya Videoya işle seçeneğini kullan.</p>`);
        host.querySelector('#edBudgetSave').onclick=()=>request(async()=>{const retry=host.querySelector('#edRetryAi')?.checked===true;data=await api(`${base}/editor`,{method:'PATCH',body:{...(host.querySelector('#edAiBudget')?{aiSupportBudgetUsd:Number(host.querySelector('#edAiBudget').value)}:{}),...(retry?{retryAiFailures:true}:{}),costBudgetUsd:Number(host.querySelector('#edBudget').value),refreshModelRates:host.querySelector('#edRates').checked}});onChange?.(data.job);toast(retry?data.job.message:'İşin bütçe ayarı güncellendi.');draw();});
        host.querySelector('#edSeo').onchange=x=>{regenerateSeo=x.target.checked;};
        bindAuto(host);
        host.querySelector('#edSave').onclick=()=>request(async()=>{await save();toast('Sahne değişiklikleri kaydedildi.');draw();});
        host.querySelector('#edRender').onclick=()=>request(async()=>{await save();const r=await api(`${base}/rerender`,{method:'POST'});onChange?.(r.job);closeModal();toast('Düzenlenen video sıraya alındı. Eksik kaynaklar gerekirse yeniden üretilecek.');});
        host.querySelector('#edResume')?.addEventListener('click',()=>request(async()=>{await save();const r=await api(`${base}/resume`,{method:'POST'});onChange?.(r.job);closeModal();toast('Kayıtlı aşamalardan devam ediyor.');}));
      } else if(tab==='quality'||tab==='audience') {
        window.NovaQualityDesk[tab](host,{id,api,toast,job:data.job,onSaved:()=>{if(host.isConnected)tabDirty=false;}});
      } else if(tab==='cover') {
        const r=review.cover || {};
        host.innerHTML=`<div class="editor-cover-grid"><div><h3>Kapak kompozisyonu</h3><label class="field-label">Kısa kapak metni · 1–4 kelime</label><input id="ecText" maxlength="60" value="${e(r.text || review.thumbnailText || '')}"/><label class="field-label">Videodan kare · saniye</label><input id="ecTime" type="number" min="0" max="${data.job.meta?.durationSec||86400}" step="0.1" value="${r.time||0}"/><label class="editor-file">Veya kendi görselini seç<input id="ecUpload" type="file" accept="image/jpeg,image/png,image/webp"/></label><p id="ecAsset" class="muted">${coverAsset?'Yüklenen kapak görseli kullanılacak.':'Videodan seçilen kare kullanılacak.'}</p><button class="btn" id="ecReset">Videodan kare kullan</button>${[['X','Yatay konum',r.x??.5,0,1,.01],['Y','Dikey konum',r.y??.5,0,1,.01],['Zoom','Yakınlık',r.zoom??1,1,3,.05]].map(([k,label,v,min,max,step])=>`<label class="field-label">${label}</label><input id="ec${k}" type="range" min="${min}" max="${max}" step="${step}" value="${v}"/>`).join('')}<button class="btn primary" id="ecGenerate">Üç kapak tasarımını üret</button><p class="muted">Kapak videodaki vaadi doğru yansıtmalı. Konum ve yakınlık yeni tasarımlara uygulanır.</p></div><div><h3>Mobil boyutta kontrol</h3><div id="ecResults">${['thumb_a.jpg','thumb_b.jpg','thumb_c.jpg'].map(name=>`<div class="editor-cover-result"><img src="${base}/file/${name}?v=${Date.now()}" alt="Kapak tasarımı"/><button class="btn" data-cover="${name}">Varsayılan yap</button></div>`).join('')}</div></div></div>`;
        host.querySelector('#ecUpload').onchange=()=>request(async()=>{const a=await upload(host.querySelector('#ecUpload').files[0]);if(a){coverAsset=a.asset;host.querySelector('#ecAsset').textContent='Yeni görsel yüklendi; tasarımları üret.';}});
        host.querySelector('#ecReset').onclick=()=>{coverAsset=null;tabDirty=true;host.querySelector('#ecAsset').textContent='Videodan seçilen kare kullanılacak.';};
        host.querySelector('#ecGenerate').onclick=()=>request(async()=>{await api(`${base}/cover`,{method:'POST',body:{text:host.querySelector('#ecText').value,time:+host.querySelector('#ecTime').value,x:+host.querySelector('#ecX').value,y:+host.querySelector('#ecY').value,zoom:+host.querySelector('#ecZoom').value,...(coverAsset?{asset:coverAsset}:{})}});review=await api(`${base}/review`);data=await api(`${base}/editor`);onChange?.(data.job);toast('Üç kapak hazır.');draw();});
        host.querySelectorAll('[data-cover]').forEach(b=>b.onclick=()=>request(async()=>{await api(`${base}/thumbnail`,{method:'POST',body:{name:b.dataset.cover}});toast('Varsayılan kapak seçildi.');}));
      } else {
        const f=review.feedback||{};
        host.innerHTML=`<div class="editor-cover-grid"><div><h3>Yayın öncesi kontrol</h3><p class="editor-notice">Bu kontroller izlenme tahmini değildir. Açılış, başlık ve kapak aynı vaadi taşımalı; video bu vaadin karşılığını vermeli.</p><label class="field-label">İlk sahne</label><blockquote>${e(review.opening||'Henüz senaryo yok.')}</blockquote><h4>Başlık seçenekleri</h4><ol>${(review.titles||[]).map(t=>`<li>${e(typeof t==='string'?t:t.title||t.baslik||'')}</li>`).join('')}</ol>${(review.warnings||[]).map(w=>`<p class="editor-notice">${e(typeof w==='string'?w:w.message)}</p>`).join('')}<details><summary>Kaynaklar (${review.sources.length})</summary>${review.sources.map(s=>`<p><a href="${e(s)}" target="_blank" rel="noopener noreferrer">${e(s)}</a></p>`).join('')}</details><div class="editor-actions"><a class="btn" href="${base}/file/seo.md?dl=1">SEO paketini indir</a><a class="btn" href="${base}/file/edit-plan.json?dl=1">Kurgu planı</a><a class="btn" href="${base}/file/sound-plan.json?dl=1">Ses raporu</a></div></div><div><h3>Gerçek yayın sonuçları</h3><p class="muted">YouTube Studio verilerini elle gir. Otomatik kanal bağlantısı yok. Aynı videoda yaptığın başlık / kapak değişikliğini notlara ekle.</p><label class="field-label">YouTube bağlantısı</label><input id="efUrl" type="url" value="${e(f.videoUrl||'')}"/>${[['views','İzlenme'],['impressions','Gösterim'],['ctr','Tıklanma oranı (%)'],['retention30','İlk 30 saniyede kalan (%)'],['averageViewed','Ortalama izlenen (%)']].map(([k,label])=>`<label class="field-label">${label}</label><input data-metric="${k}" type="number" min="0" ${['views','impressions'].includes(k)?'':'max="100"'} step="any" value="${f[k]??''}"/>`).join('')}<label class="field-label">Değişiklik ve sonuç notları</label><textarea id="efNotes" rows="4" maxlength="2000">${e(f.notes||'')}</textarea><button class="btn primary" id="efSave">Sonuçları kaydet</button><p class="muted">${f.recordedAt?'Son kayıt: '+e(new Date(f.recordedAt).toLocaleString('tr-TR')):''}</p></div></div>`;
        host.querySelector('#efSave').onclick=()=>request(async()=>{const body={videoUrl:host.querySelector('#efUrl').value,notes:host.querySelector('#efNotes').value};host.querySelectorAll('[data-metric]').forEach(x=>{if(x.value!=='')body[x.dataset.metric]=Number(x.value);});await api(`${base}/feedback`,{method:'POST',body});review=await api(`${base}/review`);toast('Yayın sonuçları kaydedildi.');draw();});
      }
      host.querySelectorAll('label.field-label').forEach((label,i)=>{const input=label.nextElementSibling;if(input&&['INPUT','TEXTAREA','SELECT'].includes(input.tagName)){input.id ||= `editorField${i}`;label.htmlFor=input.id;}});
    }
    draw();
  }
  return {open};
})();

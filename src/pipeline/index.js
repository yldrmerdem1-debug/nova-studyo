import fs from "node:fs";
import { aiAllowance, usesAutomaticEditor } from '../../public/production-modes.js';
import path from "node:path";
import { getSettings, getJobSettings, snapshotSettings, DURATIONS, VISUAL_STYLES } from "../config.js";
import { newId, writeJson, readJson, ProcKiller } from "../util.js";
import { createJob, updateJob, getJob, jobDir, log, loadAllJobs, publicJob } from "../store.js";
import { runResearch, runOutline, runSections, runCollageScript, planSections, yeniGorselAcilari } from "./script.js";
import { generateKeyframes, animateKeyframes, estimateCost, acceptanceReport, providerReady, styleOf } from "./collage.js";
import { canvasOf, RATIOS } from "./canvas.js";
import { kucukleriPerdele } from "./kucukgorsel.js";
import { gatherCandidates, autoPick, konuKisisiniGoster, downloadPicked, normalizeBeatTypes, flattenBeats, yedekAdayIndir, acilardanIndir } from "./media.js";
import { gorselleriDenetle, adaylariDenetle, adaylariSirala, GORSEL_ESIGI, ARKA_GORSEL_ESIGI, ARKA_KALITE_ESIGI, KESIK_KALITE_ESIGI } from "./gorseldenetim.js";
import { sahneIstemleri } from "./aiistem.js";
// AI KURTARMA BUNU ÇAĞIRIYOR. Import yoktu ve her işte sessizce
// "AI kurtarma atlandı: generateAiClips is not defined" yazıp geçiliyordu
// (20260817-b05a7a günlüğünde ölçüldü) — kullanıcı AI bütçesi 20 verdiği hâlde
// arşivin kurtaramadığı 8 sahneye hiç dokunulmadı. Kaynağı regex'le tarayan
// testler eksik import'u göremez; bkz. test/import-butunlugu.test.mjs.
import { generateAiClips } from "./aivideo.js";
import { synthesizeAll } from "./voice.js";
import { renderAll } from "./render.js";
import { EDITORIAL_RENDER_VERSION } from './editorial-shots.js';
import {runAutomaticEditor,AUTOMATIC_EDITOR_VERSION} from './automatic-editor.js';
import {DIRECTOR_POLICY_VERSION} from './director-policy.js';
import {DIRECTOR_SHOT_REVIEW_VERSION} from './director-shot-review.js';
import {ensureEditorialCoverage} from './editorial-coverage.js';
import { runSeo, renderSeoMarkdown } from "./seo.js";
import { runDocuJob, DOCU_ENGINE_VERSION } from "./docu.js";
import { olcumEkle, tempoOzeti } from "./tempo.js";

import { fileAvailable, validScript, validMedia, scriptScenes, checkpoint, readCheckpoint, renderRevision, publishRevision, creativeSettings, invalidateCheckpoints } from "./checkpoints.js";
import { editorData, saveEdits, requireInactive, editorError } from "./editor.js";
import {recordDirectorPicks,verifyDirectorChoices} from './director-picks.js';
import { readShotEdits } from './shot-edits.js';
// Plan kararları yalnızca varsa render anahtarına girer: kararı olmayan eski
// işlerin kayıtlı render'ı geçersiz sayılmasın.
const shotEditKey = (shots) => Object.keys(shots).length ? [{ shotEdits: shots }] : [];
import { isJobEditing } from "../job-locks.js";
const activeJob = (id) => isJobEditing(id) || killers.has(id) || queue.some(q => q.jobId === id);
export function getEditorData(id) { return editorData(id,activeJob); }
export function assertJobInactive(id) { return requireInactive(id,activeJob); }
export function saveEditorChanges(id,patch) { return saveEdits(id,patch,activeJob); }
function queueExisting(id, resumeOnly) {
  const j=requireInactive(id,activeJob);
  if(resumeOnly && !['error','cancelled','interrupted'].includes(j.status)) throw editorError('Bu iş devam ettirilebilir durumda değil.',409);
  if(!resumeOnly && !validScript(readJson(path.join(jobDir(id),'script.json')))) throw editorError('Senaryo eksik. Önce işe devam edin.');
  const job=updateJob(id,{status:'queued',stage:'queued',message:'Kayıtlı kaynaklardan devam etmek için sırada'});
  queue.push({jobId:id,from:'resume'}); setImmediate(tick); return publicJob(job);
}
export function resumeJob(id) { return queueExisting(id,true); }
export function rerenderJob(id) {
  const job=queueExisting(id,false);
  // Sinematik Belgesel "Yeniden render / eksikleri tamamla": kayıtlı render
  // anahtarı değişmediyse aynı dosya anında geri dönerdi. Render kaydı silinir;
  // görsel, ses ve müzik motorun önbelleğinden gelir, yalnızca eksikler üretilir.
  // (Kuyruğa alma setImmediate ile — iş bu satırdan önce başlamaz.)
  if(job.mediaKind==='docu') invalidateCheckpoints(jobDir(id),['render']);
  return job;
}
async function cachedVoice(job,script,dir,logFn,isCancelled) {
  const file=path.join(dir,'tts.json'); const cached=readJson(file,[]);
  const entries=new Map(cached.filter(Boolean).map(t=>[t.segId,t]));
  const result=await synthesizeAll(job,script,path.join(dir,'tts'),logFn,isCancelled,{cached,onResult(t){ entries.set(t.segId,t); writeJson(file,[...entries.values()]); }});
  writeJson(file,result); checkpoint(dir,'voice',scriptScenes(script).map(s=>s.segment.ses || s.segment.text),result); return result;
}
async function cachedSeo(job,script,usage,logFn,dir) {
  const key=[script,job.guidance];
  const stale=fs.existsSync(path.join(dir,'seo-stale.json'));
  const old=readCheckpoint(dir,'seo',key) || (!stale && readJson(path.join(dir,'seo.json')));
  if(old && !old.incomplete) return old;
  const seo=await runSeo(job,script,usage,logFn,job.mediaKind==="docu"?{model:getSettings().docuFastModel||"claude-sonnet-5-5"}:{}); writeJson(path.join(dir,'seo.json'),seo); checkpoint(dir,'seo',key,seo);
  if(stale) fs.unlinkSync(path.join(dir,'seo-stale.json')); return seo;
}
const killers = new Map(); // jobId -> ProcKiller
const queue = []; // {jobId, from}
let working = false;

export function renderPolicyVersions(job={}) {
  return [
    ...(job.visualStyle==='editorial'?[EDITORIAL_RENDER_VERSION]:[]),
    ...(usesAutomaticEditor(job)?[AUTOMATIC_EDITOR_VERSION,job.editorialPlan]:[]),
    ...(job.mediaKind==='director'?[`director-policy:${DIRECTOR_POLICY_VERSION}`]:[]),
    ...(job.mediaKind==='director'?[`director-shot-review:${DIRECTOR_SHOT_REVIEW_VERSION}`]:[]),
    ...(job.mediaKind==='docu'?[DOCU_ENGINE_VERSION]:[]),
  ];
}

export function newJobFromRequest(body) {
  const st = getSettings();
  if(body.aiSupport!==undefined&&!['manual','auto','off'].includes(body.aiSupport))throw editorError('AI desteği seçimi geçersiz.');
  if(body.aiSupportBudgetUsd!==undefined&&(!Number.isFinite(Number(body.aiSupportBudgetUsd))||Number(body.aiSupportBudgetUsd)<0||Number(body.aiSupportBudgetUsd)>10000))throw editorError('AI destek bütçesi 0–10000 USD arasında olmalı.');
  const budget=body.costBudgetUsd == null || body.costBudgetUsd === '' ? null : Number(body.costBudgetUsd);
  if(budget!==null && (!Number.isFinite(budget) || budget<0 || budget>10000)) throw editorError('Harcama sınırı 0–10000 USD arasında olmalı.');
  if(body.sfxVolume!==undefined && (!Number.isFinite(Number(body.sfxVolume)) || Number(body.sfxVolume)<0 || Number(body.sfxVolume)>0.5)) throw editorError('Efekt ses düzeyi 0–0.5 arasında olmalı.');
  if(body.soundDesign!==undefined && typeof body.soundDesign!=="boolean") throw editorError("Ses tasarımı seçimi geçersiz.");
  if(body.editIntensity!==undefined && !["restrained","balanced","dynamic"].includes(body.editIntensity)) throw editorError("Kurgu yoğunluğu geçersiz.");
  const demo = st.demoMode || !st.anthropicKey;
  const job = {
    id: newId(),
    createdAt: new Date().toISOString(),
    topic: String(body.topic || "").trim().slice(0, 200),
    guidance: String(body.guidance || "").trim().slice(0, 1000),
    theme: body.theme || "belgesel",
    tone: body.tone || "varsayilan",
    language: body.language === "en" ? "en" : "tr",
    voiceId: body.voiceId || (body.language === "en" ? "en-US-GuyNeural" : "tr-TR-AhmetNeural"),
    elevenVoiceId: body.elevenVoiceId || "",
    durationPreset: Object.hasOwn(DURATIONS,body.durationPreset) ? body.durationPreset : "detayli",
    visualStyle: body.mediaKind === 'director' ? 'editorial' : Object.hasOwn(VISUAL_STYLES,body.visualStyle) ? body.visualStyle : "editorial",
    collageMode: ["kapali", "hibrit", "acik"].includes(body.collageMode) ? body.collageMode : "hibrit",
    // Ana ekrandaki üretim modu:
    //   image  = sadece fotoğraf (video yok, en ucuz)
    //   mixed  = stok video + fotoğraf, arşiv yetmezse AI doldurur
    //   ai     = üstüne senaryonun işaretlediği AI sahneler
    //   fullai = her sahne AI ile üretilir (pahalı, kullanıcı bilerek seçer)
    mediaKind: (() => {
      const k = ["image", "mixed", "ai", "director", "fullai", "docu"].includes(body.mediaKind) ? body.mediaKind : "mixed";
      // Hareketli kolaj kesikleri FOTOĞRAFTAN üretiyor (cutout.js maskesi videoya
      // uygulanamaz). Video seçilirse sahneler öğesiz kalırdı — burada zorlanır.
      return !["director", "fullai", "docu"].includes(k) && body.visualStyle === "hareket" ? "image" : k;
    })(),
    // AI GÖRSEL BÜTÇESİ — TEK SAYI.
    //
    // Eskiden iki ayrı ayar vardı (aiClips = senaryonun planladığı, aiFill =
    // arşiv çuvallayınca acil yedek) ve arayüzde iki ayrı yerde soruluyordu.
    // Kullanıcı haklı olarak "aynı şeyi iki kez soruyor" dedi: pratikte ikisi
    // de aynı soruyu soruyor — "en fazla kaç AI görsel üretilsin".
    //
    // Artık tek bütçe: senaryo bir kısmını planlar, kalanı arşivin yetmediği
    // sahnelere gider, TOPLAM bu sayıyı aşmaz. Elle yazılabilir (0-30).
    // Eski istemciler hâlâ aiClips/aiFill gönderirse büyüğü alınır.
    aiButce: Math.max(0, Math.min(30, parseInt(
      body.aiButce ?? Math.max(parseInt(body.aiClips) || 0, parseInt(body.aiFill) || 0)) || 0)),
    aiSupport: body.mediaKind === 'director' ? 'auto' : ['manual','auto','off'].includes(body.aiSupport)?body.aiSupport:'manual',
    aiSupportBudgetUsd: body.aiSupportBudgetUsd===undefined?20:Number(body.aiSupportBudgetUsd),
    aiClips: Math.max(0, Math.min(20, parseInt(body.aiClips) || 0)), // eski alan — geriye uyum
    // "Gerektiğinde AI": arşivin yetmediği kesmeler için tavan. 0 = hiç kullanma.
    // || 0 kullanılıyor: parseInt(undefined) NaN döner ve ?? NaN'ı yakalamaz —
    // alan gönderilmediğinde aiFill NaN olup boşluk doldurma sessizce kapanıyordu.
    aiFill: Math.max(0, Math.min(20, parseInt(body.aiFill) || 0)),
    // Geçiş yoğunluğu: yok | sade | sinematik
    transitions: ["yok", "sade", "sinematik"].includes(body.transitions) ? body.transitions : "sinematik",
    // EKRANDAKİ YAZI DÜZENİ (hareket/sinema dilleri):
    //   vurgu  = yalnızca vuruş (sayı/isim/tarih). Deşifre YOK — o altyazının işi.
    //   obek   = öbek bir bütün hâlde belirir (kelime kelime değil)
    //   kelime = kelime kelime kurulur (Reels dili; uzun videoda bekleme hissi verir)
    // Varsayılan "vurgu": ekranda akan deşifre metni anlatıcıyı tekrar ediyordu ve
    // uzun cümleler anlamsız parçalara bölünüyordu ("biçiminde iki bin beş").
    yaziModu: ["vurgu", "obek", "kelime"].includes(body.yaziModu) ? body.yaziModu : "vurgu",
    // GÖRSEL İÇERİK DENETİMİ: indirilen fotoğraf gerçekten sorguyu karşılıyor mu?
    // Varsayılan AÇIK. Kapatılırsa alaka yalnızca sağlayıcının yazdığı başlıktan
    // tahmin edilir ve o eksen doğruyla yanlışı ayıramıyor (ölçüldü: isabetli
    // Everest 0,264 — alakasız tatil fotoğrafı 0,260). Küçük modelle yapılır.
    gorselDenetim: body.gorselDenetim !== false && !demo,
    // En-boy oranı: 16:9 (YouTube) | 9:16 (Shorts/Reels) | 1:1
    ratio: RATIOS[body.ratio] ? body.ratio : "16:9",
    subtitleMode: ["classic", "word", "none"].includes(body.subtitleMode) ? body.subtitleMode : "classic",
    mediaMode: body.mediaMode === "manual" ? "manual" : "auto",
    useWebSearch: !!body.useWebSearch && !demo,
    demo,
    status: "queued",
    stage: "queued",
    progress: 0,
    message: "Sırada bekliyor",
    settingsSnapshot: snapshotSettings(),
    editIntensity: ["restrained","balanced","dynamic"].includes(body.editIntensity) ? body.editIntensity : st.editIntensity,
    soundDesign: body.soundDesign === undefined ? st.soundDesign : body.soundDesign !== false,
    sfxVolume: body.sfxVolume === undefined ? st.sfxVolume : Number(body.sfxVolume),
    costBudgetUsd: budget,
    usage: { budgetUsd: budget, model: st.model, modelRates: st.modelRates },
    outputs: {},
  };
  job.aiButce = aiAllowance(job);
  // Sinematik Belgesel görsel kaynağı: "archive" (arşiv ağırlıklı, varsayılan) | "ai" (sadece AI).
  if (job.mediaKind === "docu") job.docuSource = body.docuSource === "ai" ? "ai" : "archive";
  // Sinematik motor yalnız 16:9 üretir (görsel boyutları, yerleşim, kompozisyon hepsi 1920x1080).
  // Altyazı videoya gömülmez; motor ayrıca subs.srt yazar.
  // Tema paneli docu'da gizli ama formun varsayılanı "vox": araştırma istemine
  // "Video formatı: Vox / Açıklayıcı" gizlice giriyordu. Belgeselin dilini stil belirler.
  if (job.mediaKind === "docu") { job.ratio = "16:9"; job.subtitleMode = "none"; job.theme = "belgesel"; }
  // Sinematik Belgesel: kurgu stili elle seçilebilir; boşsa Claude hikâyeye göre seçer.
  if (job.mediaKind === "docu" && ["documentary", "crime", "epic", "science", "inspire", "finance", "horror"].includes(body.docuGenre)) job.docuGenre = body.docuGenre;
  // Sıralama (geri sayım): aynı belgesel motoru, senaryo N'den 1'e maddeler (docu-script.js rankingPlan); görsel dili Claude seçer.
  if (job.mediaKind === "docu" && ["ranking", "news"].includes(body.docuFormat)) job.docuFormat = body.docuFormat;
  // Sinematik Belgesel: hazır sahne senaryosu (örnek video / içe aktarılan JSON) ile başlatılabilir.
  if (job.mediaKind === "docu" && Array.isArray(body.docuScript?.scenes) && body.docuScript.scenes.length) {
    const { id: sourceId, ...seed } = body.docuScript;
    // Aynı senaryo aynı görsel tohumu ve ses dokusunu korusun (örnek video birebir yeniden üretilebilsin).
    seed.seedKey ??= typeof sourceId === "string" && sourceId ? sourceId.slice(0, 80) : undefined;
    job.docuSeed = seed;
    job.topic ||= String(seed.title || "Sinematik belgesel").slice(0, 200);
  }
  if (job.mediaKind === 'image') { job.aiClips = 0; job.aiFill = 0; }
  if (job.visualStyle === 'kolaj') job.mediaKind = 'mixed';
  if (!job.topic) throw new Error("Konu boş olamaz.");
  return job;
}

export function enqueue(job, from = "start") {
  if (activeJob(job.id) || getJob(job.id)) throw editorError("İş zaten aktif veya kayıtlı; devam işlemini kullanın.",409);
  createJob(job);
  queue.push({ jobId: job.id, from });
  setImmediate(tick);
}

export function approveCost(jobId, approved) {
  const job = getJob(jobId);
  if (!job || job.status !== "awaiting_cost") throw new Error("Bu iş maliyet onayı beklemiyor.");
  if (!approved) {
    updateJob(jobId, { status: "cancelled", stage: "cancelled", message: "Maliyet onaylanmadı" });
    return;
  }
  updateJob(jobId, { status: "queued", message: "Onaylandı, üretim sırada", costApproved: true });
  queue.unshift({ jobId, from: "afterCost" });
  tick();
}

export function continueAfterPicks(jobId, picks) {
  const job = getJob(jobId);
  if (!job || job.status !== "awaiting_picks") throw new Error("Bu iş seçim beklemiyor.");
  const dir=jobDir(jobId);
  if(job.mediaKind==='director'){
    const reviewed=recordDirectorPicks(readJson(path.join(dir,'script.json')),readJson(path.join(dir,'candidates.json'),{}),readJson(path.join(dir,'picks.json'),{}),picks);
    writeJson(path.join(dir,'picks.json'),reviewed.picks);
    writeJson(path.join(dir,'manual-choices.json'),reviewed.changed);
  }else writeJson(path.join(dir, "picks.json"), picks);
  updateJob(jobId, { status: "queued", message: "Seçimler alındı, sırada", picksApproved:true });
  queue.unshift({ jobId, from: "afterPicks" });
  tick();
}

export function cancelJob(jobId) {
  const idx = queue.findIndex((q) => q.jobId === jobId);
  if (idx >= 0) queue.splice(idx, 1);
  killers.get(jobId)?.cancel();
  const j = getJob(jobId);
  if (j && !["done", "error"].includes(j.status)) {
    updateJob(jobId, { status: "cancelled", stage: "cancelled", message: "İptal edildi" });
  }
}

/** İptalden sonra ffmpeg süreçlerinin dosyaları bırakmasını bekle (silmeden önce şart). */
export async function awaitJobStopped(jobId, timeoutMs = 4000) {
  await killers.get(jobId)?.settled(timeoutMs);
}

/** Uygulama kapanışında tüm alt süreçleri kes — yoksa ffmpeg arkada çalışmaya devam eder. */
export function killAll() {
  for (const k of killers.values()) { try { k.cancel(); } catch {} }
  killers.clear();
  queue.length = 0;
}

export function queueSnapshot() {
  return queue.map((q) => q.jobId);
}

async function tick() {
  if (working) return;
  const item = queue.shift();
  if (!item) return;
  working = true;
  try {
    await runJob(item.jobId, item.from);
  } catch (e) {
    console.error("runJob hata:", e);
  } finally {
    working = false;
    setImmediate(tick);
  }
}

function stagePatch(id, stage, progress, message) {
  updateJob(id, { status: "running", stage, progress: Math.round(progress), message });
  log(id, message);
}

/**
 * Render ara dosyalarını sil (klipler, wav'lar, concat listeleri).
 * Ölçüldü: 10 dk'lık bir işte 215 MB ara dosya, 82 MB çıktı — %65 israf.
 * Ayarlardan keepIntermediate ile kapatılabilir (hata ayıklama için).
 */
// Disposable render scratch of a job. Measured (2026-09-26): every render
// attempt kept its own render/ folder (clips, pieces, WAVs: 90–735 MB each) and
// failed attempts without an output stayed forever — about 3.9 GB across jobs.
// The published video, the current checkpoint attempt's output, previous/
// backups, source media and segment audio are never touched.
export function renderScratchDirs(dir) {
  const out = [path.join(dir, 'render')];
  const current = readJson(path.join(dir, 'checkpoints.json'), {})?.render?.value?.dir;
  let attempts = [];
  try { attempts = fs.readdirSync(path.join(dir, 'attempts'), { withFileTypes: true }).filter((e) => e.isDirectory()); } catch {}
  for (const e of attempts) {
    const a = path.join(dir, 'attempts', e.name);
    const isCurrent = current && path.resolve(current) === path.resolve(a);
    if (!isCurrent && !fs.existsSync(path.join(a, 'output.mp4'))) out.push(a);   // failed attempt
    else out.push(path.join(a, 'render'));
  }
  return out.filter((d) => fs.existsSync(d));
}

function cleanupIntermediate(jobId, dir) {
  if (getSettings().keepIntermediate) return;
  // Only disposable render scratch may be removed. Source media and segment
  // audio remain available for recovery and future scene edits.
  let bytes = 0;
  for (const d of renderScratchDirs(dir)) {
    try {
      if (!fs.existsSync(d)) continue;
      for (const f of fs.readdirSync(d, { recursive: true })) {
        try {
          const st = fs.statSync(path.join(d, f));
          if (st.isFile()) bytes += st.size;
        } catch {}
      }
      fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {}
  }
  if (bytes > 1e6) log(jobId, `Ara dosyalar temizlendi (${Math.round(bytes / 1048576)} MB geri kazanıldı)`);
}

async function runJob(jobId, from) {
  let job = getJob(jobId);
  if (!job || job.status === "cancelled") return;
  const dir = jobDir(jobId);
  const killer = new ProcKiller();
  killers.set(jobId, killer);
  const isCancelled = () => killer.cancelled || getJob(jobId)?.status === "cancelled";
  // job.usage'a GERİ BAĞLANIYOR. Eskiden `job.usage || {}` yazıyordu ve sayaç
  // yoksa job'a bağlı olmayan yeni bir nesne doğuyordu; media.js gibi yalnızca
  // `job` alan adımlar token harcamasını hiçbir yere yazamıyordu.
  const usage = job.usage || (job.usage = {});

  const saveUsage = () => updateJob(jobId, { usage });

  try {
    let research, outline, script, candidates, picks, media, tts;
    // Tam-AI modu kolaj hattını kullanır — çapa kare mekanizması (sahneler arası
    // stil/karakter tutarlılığı) ve maliyet onayı zaten orada. Fark sadece görsel
    // dilde: kolaj kâğıt estetiği, fullai fotogerçekçi sinema (bkz. collage.js).
    const isCollage = job.visualStyle === "kolaj" || job.mediaKind === "fullai";

    // ================= SİNEMATİK BELGESEL (docu-engine) =================
    if (job.mediaKind === "docu") {
      // 1-2 saatlik iş gözetimsiz koşuyor: Windows boşta uykusu CPU yüküne değil
      // kullanıcı girdisine bakar, pilde render yarıda kalıyordu. Electron kabuğu
      // __novaBusy'yi sağlar (tarayıcı modunda yok, sessizce geçilir).
      try { globalThis.__novaBusy?.(true); } catch {}
      try {
        await runDocuJob({ jobId, job, dir, from, usage, saveUsage, isCancelled, killer, stagePatch, cachedSeo });
      } finally {
        try { globalThis.__novaBusy?.(false); } catch {}
      }
      return;
    }

    // ================= ÜRETİLMİŞ GÖRSEL AKIŞI (ses-önce) =================
    if (isCollage) {
      await runCollageJob({ jobId, job, dir, from, usage, saveUsage, isCancelled, killer });
      return;
    }

    const savedScript = readJson(path.join(dir, "script.json"));
    if (validScript(savedScript)) {
      research = fs.existsSync(path.join(dir,"research.md")) ? fs.readFileSync(path.join(dir, "research.md"), "utf8") : "";
      script = readJson(path.join(dir, "script.json"));
      candidates = readJson(path.join(dir, "candidates.json"));
      picks = readJson(path.join(dir, "picks.json"));
      // script.json, gatherCandidates tür normalizasyonundan ÖNCE yazılıyor;
      // candidates.json anahtarları ise normalize edilmiş türle ("...||image")
      // kuruluyor. Devam yolunda normalize etmezsek candidateKey "...||video"
      // üretir, aday listesi bulunamaz ve beat yedek kola düşer.
      // Ölçüldü: beat'lerin %37'si kendi aday listesini bu yüzden kaybediyordu.
      normalizeBeatTypes(job, script);
      const savedMedia=readJson(path.join(dir,"media.json"),{});
      const allMediaSaved=scriptScenes(script).every(s=>s.beatIds.every(id=>validMedia(savedMedia[id])));
      if(allMediaSaved) { candidates ||= {}; picks ||= {}; }
      if (!candidates) { candidates=await gatherCandidates(job,script,(m)=>log(jobId,m),isCancelled); writeJson(path.join(dir,"candidates.json"),candidates); }
      if (!picks) { picks=autoPick(script,candidates,job); writeJson(path.join(dir,"picks.json"),picks); }
      if(job.mediaMode === "manual" && !allMediaSaved && !job.picksApproved && from !== "afterPicks") { updateJob(jobId,{status:"awaiting_picks",stage:"picks",message:"Kaynaklar korundu. Görsel seçiminizi onaylayın."}); return; }
    } else {
      // 1) ARAŞTIRMA
      stagePatch(jobId, "research", 2, job.demo ? "Demo modu: araştırma atlanıyor" : "Araştırma yapılıyor...");
      research = fs.existsSync(path.join(dir,"research.md")) ? fs.readFileSync(path.join(dir,"research.md"),"utf8") : await runResearch(job, usage, (m) => log(jobId, m));
      fs.writeFileSync(path.join(dir, "research.md"), research, "utf8");
      saveUsage();
      if (isCancelled()) return;

      // 2) SENARYO
      stagePatch(jobId, "script", 10, "Senaryo yazılıyor...");
      outline = readJson(path.join(dir,"outline.json")) || await runOutline(job, research, usage, (m) => log(jobId, m));
      writeJson(path.join(dir,"outline.json"),outline);
      const sectionKey=[outline,research,creativeSettings(job.settingsSnapshot)];
      const partialSections=readCheckpoint(dir,"sections",sectionKey) || [];
      script = await runSections(job, research, outline, usage, (m) => log(jobId, m), isCancelled, { cached:partialSections, onSection(i,s) { partialSections[i]=s; checkpoint(dir,"sections",sectionKey,partialSections); saveUsage(); } });
      ensureEditorialCoverage(job,script);
      const segCount = script.sections.reduce((a, s) => a + s.segments.length, 0);
      writeJson(path.join(dir, "script.json"), script);
      checkpoint(dir,"script",[job.topic,job.guidance],script);
      updateJob(jobId, { meta: { title: script.title, sections: script.sections.length, segments: segCount }, usage });
      log(jobId, `Senaryo hazır: "${script.title}" — ${script.sections.length} bölüm, ${segCount} segment`);
      if (isCancelled()) return;

      // 3) MEDYA ARAMA
      stagePatch(jobId, "media", 24, "Medya adayları toplanıyor...");
      candidates = await gatherCandidates(job, script, (m) => log(jobId, m), isCancelled);
      writeJson(path.join(dir, "candidates.json"), candidates);
      if (isCancelled()) return;

      // GÖRSELE BAKARAK ÖN SIRALAMA — her iki yolda da autoPick'ten ÖNCE.
      //
      // autoPick listenin ilkini alıyor ve liste METİN örtüşmesine göre sıralı.
      // Metin, görselin ne gösterdiğini bilemez. Ölçüldü (Baba Vanga videosu,
      // 2026-08-09): kadının yüzünü gösteren tek görsel sıralamada 9.'ydu,
      // birinci sırada mezar taşı vardı — video, anlattığı kadını hiç
      // göstermedi. Küçük resme bakan bu tur, aynı sorguda onu 1. sıraya
      // çıkarıyor (ölçüldü: alaka 3, "siyah örtülü yaşlı bir kadının yüzü").
      //
      // Manuel seçimden de ÖNCE çalışır ki kullanıcının önüne gelen varsayılan
      // seçim de doğru olsun.
      if (job.gorselDenetim !== false && !isCancelled()) {
        try {
          // Ön sıralamada adaylar SORGUYA göre gruplu; cümle sorgu üzerinden
          // bağlanıyor ki burada da ölçüt anlatılan olsun (bkz. gorseldenetim).
          const sorguCumlesi = {};
          for (const b of flattenBeats(script)) {
            const q = b.visual?.query || "";
            if (q && !sorguCumlesi[q]) sorguCumlesi[q] = b.seg?.text || "";
          }
          await adaylariSirala(candidates, { logFn: (m) => log(jobId, m), isCancelled, usage, sorguCumlesi });
          writeJson(path.join(dir, "candidates.json"), candidates);
          saveUsage();
        } catch (e) {
          if (isCancelled()) return;
          log(jobId, `Ön sıralama atlandı: ${String(e.message).slice(0, 120)}`);
        }
      }

      if (job.mediaMode === "manual") {
        const auto = autoPick(script, candidates, job);
        writeJson(path.join(dir, "picks.json"), auto);

        // SEÇİM EKRANI İÇİN ÖN DENETİM.
        // Görselleri dizmek yetmiyor; hangisinin YANLIŞ olduğu da görünmeli.
        if (job.gorselDenetim !== false) {
          try {
            // Ön sıralama zaten ilk adayların GÖRSELİNE baktı ve puanları
            // adayın üstüne yazdı. Aynı görselleri bir daha modele sormak
            // parayı iki kez harcamak olur — hazır puan varsa o kullanılır,
            // yalnızca eksik kalanlar (indirilemeyen aday) sorulur.
            const puanlar = {};
            const secilenler = [];
            const secimCumlesi = {};
            for (const b of flattenBeats(script)) {
              secimCumlesi[b.id] = b.seg?.text || "";
              const c = (candidates[`${b.visual.query}||${b.visual.type}`] || []).find((x) => x.id === auto[b.id]);
              if (!c) continue;
              if (Number.isFinite(c.onGorsel)) {
                puanlar[b.id] = { puan: c.onGorsel, kalite: c.onKalite, gorunen: c.onGorunen || "" };
              } else {
                secilenler.push({ beatId: b.id, url: c.thumb || c.url, sorgu: b.visual.query });
              }
            }
            if (secilenler.length) {
              Object.assign(puanlar, await adaylariDenetle(secilenler,
                { logFn: (m) => log(jobId, m), isCancelled, usage, cumleler: secimCumlesi }));
            }
            writeJson(path.join(dir, "denetim.json"), puanlar);
            saveUsage();
            const sorunlu = Object.values(puanlar).filter((p) =>
              p.puan < GORSEL_ESIGI || (Number.isFinite(p.kalite) && p.kalite < KESIK_KALITE_ESIGI)).length;
            log(jobId, sorunlu
              ? `${sorunlu} görselde sorun var (konu ya da kadraj) — seçim ekranında işaretlendi.`
              : "Tüm görseller konu ve kadraj olarak uygun bulundu.");
          } catch (e) {
            if (isCancelled()) return;
            log(jobId, `Ön denetim atlandı: ${String(e.message).slice(0, 120)}`);
          }
        }

        updateJob(jobId, {
          status: "awaiting_picks", stage: "picks", progress: 34,
          message: "Görsel seçiminizi bekliyor — Stüdyo'dan seçin",
        });
        log(jobId, "Medya adayları hazır. Görselleri inceleyip onaylayın.");
        return; // kullanıcı onayı sonrası devam edecek
      }
      // Ön sıralama yukarıda, manuel daldan da ÖNCE çalıştı.
      picks = autoPick(script, candidates, job);
      // Her sahne kendi başına karar veriyor; hiçbiri "konunun kişisi ekranda
      // görünsün" diye bakmıyor. Ölçüldü: kadının yüzü bir üretimde 4 sahnede
      // çıktı, diğerinde HİÇ çıkmadı — oysa havuzda 3/3 puanla duruyordu.
      konuKisisiniGoster(job, script, candidates, picks, { logFn: (m) => log(jobId, m) });
      writeJson(path.join(dir, "picks.json"), picks);
    }

    job = getJob(jobId);

    const manualChoices=job.mediaKind==='director'?readJson(path.join(dir,'manual-choices.json'),{}):{};
    const cachedMedia=readJson(path.join(dir,"media.json"),{});
    const completeMedia=scriptScenes(script).every(s=>s.beatIds.every(id=>validMedia(cachedMedia[id])));
    if(completeMedia) { media=cachedMedia; if(job.mediaKind==='director')verifyDirectorChoices(media,manualChoices); log(jobId,"Medya önbellekten alındı; yeni üretim yapılmadı."); } else {
    // 4) MEDYA İNDİRME
    stagePatch(jobId, "media", 36, "Seçilen medya indiriliyor...");
    media = await downloadPicked(job, script, candidates, picks, path.join(dir, "media"), (m) => log(jobId, m), isCancelled, killer, { cached:cachedMedia, manualChoices, onResult(m) { cachedMedia[m.beatId]=m; writeJson(path.join(dir,"media.json"),cachedMedia); } });
    if(job.mediaKind==='director')verifyDirectorChoices(media,manualChoices);
    // KÜÇÜK GÖRSELİ DENETİMDEN ÖNCE PERDELE. Denetim ekranda GÖRÜNECEK hâli
    // puanlamalı. Ölçüldü: 220x314'lük ham dosyaya bakan model "bulanık ve
    // düşük çözünürlük" deyip kadraja 1 verdi; oysa perdelenmiş hâli tam
    // ekranda temiz duruyor.
    try {
      const k0 = canvasOf(job);
      await kucukleriPerdele(media, {
        ffmpegPath: getSettings().ffmpegPath, w: k0.w, h: k0.h, killer,
        logFn: (m) => log(jobId, m),
      });
    } catch (e) {
      if (isCancelled()) return;
      log(jobId, `Küçük görsel perdeleme atlandı: ${String(e.message).slice(0, 100)}`);
    }
    writeJson(path.join(dir, "media.json"), media);
    if (isCancelled()) return;

    // 4b) GÖRSEL DENETİMİ — indirilen fotoğraf gerçekten ne gösteriyor?
    // Sağlayıcı başlığı yalan söyleyebiliyor: "submersible" etiketli bahçe
    // pompası, "kathy ... portrait" etiketli kedi. Metin ekseninde doğru ile
    // yanlış ayrılamıyor (ölçüldü), o yüzden görsele bakılıyor. Küçük modelle
    // yapılır; başarısız olursa iş durmaz, sadece denetimsiz devam eder.
    if (job.gorselDenetim !== false) {
      try {
        const sorgular = {};
        // DENETİMİN ASIL ÖLÇÜTÜ: o an seslendirmede söylenen cümle.
        //
        // Ölçüldü (20260811-c2e50d): denetim seçilen 26 görselin 22'sine
        // "tam uyumlu" dedi, ama bitmiş videoda bağımsız ölçüm %45 isabet
        // buldu. Fark, denetimin görseli SORGUYLA karşılaştırmasındandı —
        // izleyici ise CÜMLEYİ duyuyor. Sorgu "Neuralink N1 implant" olup
        // gelen fotoğraf bir implantsa denetim haklı olarak "uyumlu" der;
        // ama o an "zihin kontrolünü unut" cümlesi okunuyorsa ekrandaki şey
        // izleyici için alakasızdır. Cümle artık denetime de veriliyor.
        const cumleler = {};
        for (const b of flattenBeats(script)) {
          sorgular[b.id] = b.visual?.query || "";
          cumleler[b.id] = b.seg?.text || "";
        }
        const mediaDir = path.join(dir, "media");
        const dislanan = {};    // beatId -> denenip elenen aday id'leri
        const uygula = (puanlar) => {
          for (const [beatId, p] of Object.entries(puanlar)) {
            if (media[beatId]) {
              media[beatId].gorsel = p.puan;
              media[beatId].kalite = p.kalite;
              media[beatId].gorunen = p.gorunen;
              // Kamera hareketi bu iki alandan seçiliyor (kamera.js). Boş
              // gelirse eskisi korunur: yedek turda alan düşerse hareket
              // sessizce genele dönmesin.
              if (p.kadraj) media[beatId].kadraj = p.kadraj;
              if (p.odak) media[beatId].odak = p.odak;
              if (p.akis) media[beatId].akis = p.akis;
              if (Number.isFinite(p.videoTutarlilik)) media[beatId].videoTutarlilik = p.videoTutarlilik;
              // Yer kararı da saklanır: hangi görselin yeri doğrulanamadığı
              // sonradan ölçülebilsin (bkz. gorseldenetim.js YER_KARARLARI).
              if (p.yer) media[beatId].yer = p.yer;
            }
          }
        };

        // ÖN SIRALAMANIN PUANI İKİNCİ BİR OY OLARAK TAŞINIYOR.
        //
        // Ön sıralama zaten bu görsele bakıp puan verdi (c.onGorsel). Ölçüldü
        // (20260815-07e514, 62 sahne): iki bakış 31 kez aynı, 18 kez daha
        // düşük, 13 kez daha yüksek puan verdi — yani kararın yarısı gürültü.
        // Gürültüye bakıp yedek indirmek ve AI parası harcamak yanlış; iki oy
        // çelişince denetim üçüncüsünü soruyor ve ortancayı alıyor.
        const onPuanlar = {};
        for (const b of flattenBeats(script)) {
          const c = (candidates[`${b.visual.query}||${b.visual.type}`] || [])
            .find((x) => x.id === picks[b.id]);
          if (c && Number.isFinite(c.onGorsel)) {
            onPuanlar[b.id] = { puan: c.onGorsel, kalite: c.onKalite };
          }
        }
        uygula(await gorselleriDenetle(media, sorgular,
          { logFn: (m) => log(jobId, m), isCancelled, usage, cumleler, onPuanlar }));

        // ELEME YETMEZ, DEĞİŞTİR. Ölçüldü: gerçek bir işte 23 görselin 14'ü
        // denetimden kalıyor. Hepsini atmak videoyu çıplak bırakır; onun yerine
        // sıradaki aday indirilip yeniden bakılır. İki tur — üçüncüde iyileşme
        // ölçülemeyecek kadar azalıyor ve her tur ücretli bir istek demek.
        for (let tur = 1; tur <= 2; tur++) {
          if (isCancelled()) return;
          // Yedek aranacaklar: konuyla ilgisiz OLANLAR + konusu doğru ama tam
          // ekran kullanılamayacak kadar kötü kadrajlı olanlar (bkz. termal
          // monitör vakası: alaka 3, kalite 1).
          const kalanlar = Object.values(media).filter((m) => m?.file && !m.manualChoice &&
            // ÜCRETLİ ÜRETİLEN AI GÖRSELİ ARŞİVLE DEĞİŞTİRME.
            //
            // Ölçüldü (20260812-a8190c): AI bütçesi 3 istendi, 2 sahne AI'ya
            // işaretlendi, ikisi de üretildi ve ödendi — sonra biri (s6b2)
            // yedek turunda bir Pexels fotoğrafıyla değiştirildi. Videoda
            // yalnızca 1 AI görsel kaldı.
            //
            // Bu iki yönden yanlış: AI zaten "arşivde karşılığı yok" denildiği
            // için üretiliyor, yerine arşiv koymak üretme sebebini iptal
            // ediyor; üstelik üretilen görselin parası çöpe gidiyor.
            m.provider !== "ai" && (
              (Number.isFinite(m.gorsel) && m.gorsel < GORSEL_ESIGI) ||
              (Number.isFinite(m.kalite) && m.kalite < ARKA_KALITE_ESIGI)));
          if (!kalanlar.length) break;
          for (const m of kalanlar) {
            (dislanan[m.beatId] ||= new Set()).add(m.adayId);
          }
          log(jobId, `${kalanlar.length} görsel konuyla ilgisiz bulundu — ${tur}. tur yedek aranıyor...`);
          const yeni = await yedekAdayIndir(job, script, candidates, kalanlar.map((m) => m.beatId),
            mediaDir, dislanan, (m) => log(jobId, m), killer);
          if (!Object.keys(yeni).length) break;

          const yeniPuan = await gorselleriDenetle(yeni, sorgular, { logFn: () => {}, isCancelled, usage, cumleler });
          let iyilesen = 0;
          for (const [beatId, kayit] of Object.entries(yeni)) {
            const p = yeniPuan[beatId];
            const eski = media[beatId];
            // Yalnızca GERÇEKTEN daha iyiyse değiştir — yoksa eskisi kalsın.
            // Kullanılamaz kadraj (kalite 0) alakası yüksek olsa bile yerine
            // geçemez; sıralama önce alakaya, eşitlikte kaliteye bakar.
            const yeniIyi = p && p.kalite >= ARKA_KALITE_ESIGI &&
              (p.puan > (eski?.gorsel ?? -1) ||
               (p.puan === (eski?.gorsel ?? -1) && p.kalite > (eski?.kalite ?? -1)));
            if (yeniIyi) {
              // kadraj/odak kamera hareketini seçiyor (kamera.js) — yeni
              // görselin kendi değerleri taşınmalı, eskisininki değil.
              media[beatId] = { ...kayit, gorsel: p.puan, kalite: p.kalite, gorunen: p.gorunen,
                kadraj: p.kadraj || "", odak: p.odak || "", yer: p.yer || "", akis:p.akis||'', videoTutarlilik:p.videoTutarlilik };
              iyilesen++;
            }
          }
          log(jobId, `${tur}. tur: ${iyilesen} görsel daha uygunuyla değiştirildi.`);
          if (!iyilesen) break;
        }

        // SON ÇARE — YENİ AÇI. Yukarıdaki turlar AYNI sorgunun sıradaki adayını
        // deniyor; sorgunun kendisi umutsuzsa (konu arşivde yok) hepsi aynı
        // alakasız havuzdan geliyor. Ölçüldü: "Bulgarian mystic blind woman
        // 1970s" 31 aday getirdi, 17'si kurum kaynaklıydı ama en iyi alaka
        // 0,183 — hepsi gözü bağlı stok model. Burada modele sorulup HAVUZ
        // değiştiriliyor, yalnızca sıra değil.
        if (!isCancelled()) {
          const umutsuz = Object.values(media).filter((m) => m?.file && !m.manualChoice && (
            (Number.isFinite(m.gorsel) && m.gorsel < GORSEL_ESIGI) ||
            (Number.isFinite(m.kalite) && m.kalite < ARKA_KALITE_ESIGI)));
          if (umutsuz.length) {
            const beatMetni = {};
            for (const b of flattenBeats(script)) beatMetni[b.id] = b.seg?.text || "";
            log(jobId, `${umutsuz.length} sahne hâlâ görselsiz — yeni arama açıları isteniyor...`);
            const acilar = await yeniGorselAcilari(job, umutsuz.map((m) => ({
              beatId: m.beatId, metin: beatMetni[m.beatId], sorgu: m.anaSorgu || m.sorgu, gorunen: m.gorunen,
            })), usage, (s) => log(jobId, s));
            saveUsage();
            if (Object.keys(acilar).length) {
              const yeni = await acilardanIndir(job, script, acilar, mediaDir, (s) => log(jobId, s), killer);
              // CÜMLE BURAYA DA VERİLİYOR. Verilmiyordu: yeni açıdan inen
              // görsel yalnızca YENİ SORGUYA göre puanlanıyordu. Sorgu zaten
              // "başka bir açı" olduğu için ona uyması kolaydır — ölçüt yine
              // izleyicinin o an duyduğu cümle olmalı. Aynı kusur ana denetimde
              // ölçülmüştü: sorgu ekseninde 26 görselin 22'si "uyumlu"yken
              // bitmiş videoda isabet %45 çıkmıştı.
              const yeniPuan = await gorselleriDenetle(yeni, Object.fromEntries(
                Object.entries(yeni).map(([id, k]) => [id, k.sorgu])),
                { logFn: () => {}, isCancelled, usage, cumleler });
              let kurtarilan = 0;
              for (const [beatId, kayit] of Object.entries(yeni)) {
                const p = yeniPuan[beatId];
                const eski = media[beatId];
                // Yeni açı ancak GERÇEKTEN kullanılabilirse geçer — yoksa
                // sahneyi bir kötüden başka bir kötüyle değiştirmiş oluruz.
                if (p && p.puan >= ARKA_GORSEL_ESIGI && p.kalite >= ARKA_KALITE_ESIGI &&
                    (p.puan > (eski?.gorsel ?? -1) || p.kalite > (eski?.kalite ?? -1))) {
                  // kadraj/odak kamera hareketini seçiyor (kamera.js) — yeni
              // görselin kendi değerleri taşınmalı, eskisininki değil.
              media[beatId] = { ...kayit, gorsel: p.puan, kalite: p.kalite, gorunen: p.gorunen,
                kadraj: p.kadraj || "", odak: p.odak || "", yer: p.yer || "", akis:p.akis||'', videoTutarlilik:p.videoTutarlilik };
                  kurtarilan++;
                }
              }
              log(jobId, `Yeni açı: ${kurtarilan}/${umutsuz.length} sahne kurtarıldı.`);
              saveUsage();
            }
          }
        }

        // SON KURTARMA: HÂLÂ ZAYIF OLAN SAHNELERİ AI ÜRETSİN.
        //
        // ÖLÇÜLEN KUSUR (20260814-a46ab2): denetim 34 görseli alakasız buldu,
        // yedek turları 23'ünü değiştirdi, geri kalanı OLDUĞU GİBİ kaldı.
        // Bitmiş videoda görsel isabeti %54 çıktı. AI ise yalnızca indirmeden
        // ÖNCE devreye giriyordu ("bu sorgunun havuzu zayıf" diye, o işte tek
        // bir sahne) — denetimin İNDİRDİKTEN SONRA yakaladığı başarısızlıklar
        // AI'ya hiç ulaşmıyordu.
        //
        // Oysa AI'nın varlık sebebi tam bu: arşivde karşılığı olmayan sahne.
        // "Arşiv alakasız bir şey getirdi" de arşivin başarısızlığıdır.
        //
        // Bütçe KESİN sınır: kullanıcının girdiği sayıdan bir tane bile fazla
        // üretilmez, çünkü her görsel para.
        if (!isCancelled() && aiAllowance(job) > 0) {
          const beatMetni2 = {};
          for (const b of flattenBeats(script)) beatMetni2[b.id] = b;

          // İKİ TUR.
          //
          // Tur 1: arşivin kurtaramadığı sahneler.
          // Tur 2: tur 1'de ÜRETİLEN ama yine zayıf kalan AI görselleri, bu kez
          //        "şunu üretme" bilgisiyle farklı bir açıdan.
          //
          // Neden gerekti: AI görselleri kör noktaydı — üretiliyor, denetleniyor,
          // zayıf çıksa bile olduğu gibi videoya giriyordu. Ölçüldü
          // (20260815-07e514): 13 AI görselin 4'ü eşiğin altındaydı ve hiçbiri
          // yeniden denenmedi. Bir sahne EN ÇOK iki kez üretilir; üçüncüsü aynı
          // yere üst üste para harcamak olurdu.
          const AI_EN_COK_TUR = 2;
          for (let tur = 1; tur <= AI_EN_COK_TUR; tur++) {
            if (isCancelled()) break;
            const uretilmis = Object.values(media).filter((m) => m?.provider === "ai").length;
            const kalanButce = Math.max(0, job.aiButce - uretilmis);
            const zayifKalan = Object.values(media).filter((m) => m?.file &&
              Number.isFinite(m.gorsel) && m.gorsel < GORSEL_ESIGI &&
              (m.provider !== "ai" || (m.aiTur || 0) < AI_EN_COK_TUR));
            if (!zayifKalan.length) break;
            if (kalanButce <= 0) {
              log(jobId, `${zayifKalan.length} sahne hâlâ zayıf ama AI bütçesi doldu ` +
                `(${job.aiButce}). Bütçeyi artırmak bu sahneleri düzeltir.`);
              break;
            }
            // ÖNCELİK: hiç denenmemiş sahneler, sonra en kötü puanlılar.
            // Bir kez AI'ya verilip yine tutturamamış sahneyi tekrar denemek,
            // hiç denenmemiş bir sahneyi kurtarmaktan daha düşük ihtimalli.
            const secilen = zayifKalan
              .sort((a, b) => (a.provider === "ai") - (b.provider === "ai")
                || (a.gorsel ?? 9) - (b.gorsel ?? 9))
              .slice(0, kalanButce);

            // İSTEMLERİ MODELE YAZDIR — arama sorgusundan kurma.
            // Sebebi ve ölçümü aiistem.js'in başında.
            const istemler = await sahneIstemleri(secilen.map((m) => ({
              id: m.beatId,
              cumle: cumleler[m.beatId] || beatMetni2[m.beatId]?.seg?.text || "",
              sorgu: beatMetni2[m.beatId]?.visual?.query || m.anaSorgu || m.sorgu || "",
              // Tur 2'de: önceki denemenin denetimde ne göründüğü. Model aynı
              // fikri tekrar yazmasın diye veriliyor.
              kacin: m.provider === "ai" ? m.gorunen : "",
            })), { usage, logFn: (t) => log(jobId, t) });

            const istek = secilen.map((m) => ({
              id: m.beatId, duration: 5, visual: { type:"ai", prompt: istemler[m.beatId] || "" },
            })).filter((x) => x.visual.prompt);
            if (!istek.length) break;

            log(jobId, tur === 1
              ? `${zayifKalan.length} sahne arşivden kurtarılamadı — ` +
                `${istek.length} tanesi AI ile üretiliyor (kalan bütçe ${kalanButce}).`
              : `${istek.length} sahne ilk AI denemesinde de tutmadı — ` +
                `farklı açıyla yeniden üretiliyor (kalan bütçe ${kalanButce}).`);
            try {
              const rescueDir=path.join(mediaDir,`rescue-${Date.now()}-${tur}`);
              const aiYeni = await generateAiClips(istek, istek.length, rescueDir,
                (m) => log(jobId, m), isCancelled, killer, {settings:getJobSettings(job)});
              const aiPuan = await gorselleriDenetle(aiYeni, sorgular,
                { logFn: () => {}, isCancelled, usage, cumleler });
              let duzelen = 0;
              for (const [beatId, kayit] of Object.entries(aiYeni || {})) {
                const p = aiPuan[beatId];
                const eski = media[beatId];
                // AI da kötü çıkabilir — yalnızca GERÇEKTEN daha iyiyse geçsin,
                // yoksa parayı harcayıp görüntüyü de bozmuş oluruz.
                if (p && p.puan > (eski?.gorsel ?? -1)) {
                  // beatId ve sorgu MUTLAKA taşınmalı: generateAiClips yalnızca
                  // {file, type, provider} döndürüyor, oysa medya kaydının geri
                  // kalanı bu alanlara bakıyor. Özellikle render.js tam ekran
                  // arka planı seçerken `b.media?.beatId` okuyor — eksik olsa
                  // sessizce null'a düşer ve arka plan mantığı bozulurdu.
                  media[beatId] = {
                    ...kayit,
                    beatId,
                    provider: "ai",
                    // Kaçıncı turda üretildiği: aynı sahneye üçüncü kez para
                    // harcanmasını bu alan engelliyor.
                    aiTur: tur,
                    sorgu: eski?.sorgu || beatMetni2[beatId]?.visual?.query || "",
                    anaSorgu: eski?.anaSorgu || eski?.sorgu || "",
                    gorsel: p.puan, kalite: p.kalite, gorunen: p.gorunen,
                    // Kamera hareketi bu iki alandan seçiliyor (kamera.js).
                    kadraj: p.kadraj || "", odak: p.odak || "", yer: p.yer || "",
                  };
                  duzelen++;
                } else if (eski?.provider === "ai") {
                  // Yeni deneme daha iyi değil: eskisi kalıyor ama TUR İŞARETİ
                  // yükseltiliyor, yoksa aynı sahne sonraki turda yine seçilir.
                  eski.aiTur = tur;
                }
              }
              log(jobId, `AI kurtarma (tur ${tur}): ${duzelen}/${istek.length} sahne düzeldi.`);
              saveUsage();
            } catch (e) {
              if (isCancelled()) return;
              log(jobId, `AI kurtarma atlandı: ${String(e.message).slice(0, 110)}`);
              break;
            }
          }
        }

        // KÜÇÜK AMA DOĞRU GÖRSELİ SUNULABİLİR HALE GETİR. Denetimden GEÇEN
        // görseller üzerinde çalışır: elenecek bir görseli işlemek boşuna.
        // (Baba Vanga'nın 220x314'lük gerçek fotoğrafı bu yoldan geçiyor.)
        try {
          const k = canvasOf(job);
          await kucukleriPerdele(media, {
            ffmpegPath: getSettings().ffmpegPath, w: k.w, h: k.h, killer,
            logFn: (m) => log(jobId, m),
          });
        } catch (e) {
          if (isCancelled()) return;
          log(jobId, `Küçük görsel perdeleme atlandı: ${String(e.message).slice(0, 100)}`);
        }

        const bakilanlar = Object.values(media).filter((m) => Number.isFinite(m.gorsel));
        const iyi = bakilanlar.filter((m) => m.gorsel >= GORSEL_ESIGI).length;
        const kotu = bakilanlar.filter((m) => m.gorsel < ARKA_GORSEL_ESIGI).length;
        const zayif = bakilanlar.length - iyi - kotu;
        const kadrajZayif = bakilanlar.filter((m) =>
          Number.isFinite(m.kalite) && m.kalite < KESIK_KALITE_ESIGI).length;
        log(jobId, `Görsel içerik denetimi bitti: ${iyi} görsel tam uyumlu, ${zayif} zayıf ` +
          `(yalnızca tam ekran arka plan olarak kullanılır), ${kotu} tanesi hiç kullanılmayacak.` +
          (kadrajZayif ? ` ${kadrajZayif} görsel kadraj olarak zayıf — köşe öğesi olarak kullanılmayacak.` : ""));
        writeJson(path.join(dir, "media.json"), media);
        saveUsage();
      } catch (e) {
        if (isCancelled()) return;
        log(jobId, `Görsel denetimi atlandı: ${String(e.message).slice(0, 140)}`);
      }
    }
    if (isCancelled()) return;

    }
    writeJson(path.join(dir,"media.json"),media);
    checkpoint(dir,"media",scriptScenes(script).map(s=>s.beatIds),media);
    // 5) SESLENDİRME
    stagePatch(jobId, "voice", 42, "Seslendirme üretiliyor...");
    tts = await cachedVoice(job, script, dir, (m) => log(jobId, m), isCancelled);
    const speech = tts.reduce((a, t) => a + t.duration, 0);
    log(jobId, `Seslendirme tamam: ${Math.floor(Math.round(speech) / 60)} dk ${Math.round(speech) % 60} sn konuşma`);
    const editorialReport=await runAutomaticEditor(job,script,media,dir,{usage,logFn:m=>log(jobId,m),isCancelled,killer,tts});
    if(editorialReport.enabled){updateJob(jobId,{editorialPlan:editorialReport});saveUsage();checkpoint(dir,'media',scriptScenes(script).map(s=>s.beatIds),media);}

    // TEMPO KALİBRASYONU. Gerçek konuşma hızı burada ölçülüp kaydediliyor;
    // sonraki işlerin kelime bütçesi buna göre hesaplanıyor. Sabit varsayım
    // ("3 dakika" isteyip 4 dk 31 sn video almak) böyle kapanıyor.
    try {
      const kelime = tts.reduce((a, t) => a + String(t.text || "").split(/\s+/).filter(Boolean).length, 0);
      const sesId = job.elevenVoiceId || job.voiceId;
      const hedefDk = DURATIONS[job.durationPreset]?.minutes || 0;
      const butce = planSections(job).totalWords;
      const olculen = olcumEkle({ lang: job.language, sesId, kelime, saniye: speech, butce, dakika: hedefDk });
      if (olculen) {
        const sapma = hedefDk ? Math.round((speech / 60 / hedefDk) * 100) : 0;
        const o = tempoOzeti(job.language, sesId, hedefDk);
        log(jobId, `Tempo: ${olculen.ham.toFixed(0)} kelime/dk konuşma, ` +
          `senaryo bütçenin %${Math.round((kelime / butce) * 100)}'ini yazdı` +
          (hedefDk ? ` — süre hedefin %${sapma}'i` : "") +
          ` (${o.ornek} ölçüm, sonraki işte ${o.wpm.toFixed(0)} kullanılacak)`);
      }
    } catch { /* kalibrasyon işi durdurmaz */ }
    if (isCancelled()) return;

    // 6) SEO (render sırasında değil önce — thumbnailText render'da kullanılacak)
    stagePatch(jobId, "seo", 52, "SEO paketi üretiliyor...");
    // SEO İSTEĞE BAĞLIDIR — VİDEOYU DÜŞÜREMEZ.
    //
    // Ölçüldü (20260809-8674dc): araştırma, senaryo, medya ve seslendirme
    // bitmiş, hepsi ödenmişti; iş tam bu adımda API hatasıyla çöktü ve neredeyse
    // hazır olan video çöpe gitti. SEO paketi başlık/açıklama/etiket üretir —
    // videonun kendisi onsuz da tamamlanır, kullanıcı sonradan da alabilir.
    let seo;
    try {
      seo = await cachedSeo(job, script, usage, (m) => log(jobId, m), dir);
    } catch (e) {
      if (isCancelled()) return;
      log(jobId, `SEO paketi üretilemedi (${String(e.message).slice(0, 90)}) — video üretimi sürüyor, ` +
        `başlık ve açıklamayı sonradan üretebilirsiniz.`);
      seo = { title: script.title || job.topic, description: "", tags: [], thumbnailText: "", incomplete:true };
    }
    saveUsage();
    if(job.thumbnailTextEdited) seo={...seo,thumbnailText:job.thumbnailText};
    job = updateJob(jobId, { thumbnailText: job.thumbnailTextEdited ? job.thumbnailText : seo.thumbnailText });
    if (isCancelled()) return;

    // 7) RENDER
    stagePatch(jobId, "render", 55, "Render başladı...");
    let lastP = -1;
    const shotEdits = readShotEdits(dir);
    const rendered = await renderRevision(dir,[script,media,tts,job.editRevision,creativeSettings(job.settingsSnapshot),...renderPolicyVersions(job),...shotEditKey(shotEdits)], (renderDir) => renderAll(
      { ...job, recoveryDir:dir, shotEdits }, script, media, tts, renderDir,
      (m) => log(jobId, m),
      (p) => {
        const rp = Math.round(Math.min(91, p));
        if (rp !== lastP) { lastP = rp; updateJob(jobId, { progress: rp }); }
      },
      killer
    ), isCancelled);
    const { durationSec, sectionTimes, thumbs, muzikler } = rendered;
    if (isCancelled()) return;

    // 8) SEO dosyası + bitiş
    stagePatch(jobId, "finalize", 95, "Çıktılar yazılıyor...");
    const seoMd = renderSeoMarkdown(job, script, seo, sectionTimes, durationSec, media, muzikler);
    fs.writeFileSync(path.join(rendered.dir, "seo.md"), seoMd, "utf8");
    publishRevision(dir,rendered);
    writeJson(path.join(dir, "seo.json"), seo);

    const outputs = {
      reviewArtifacts: rendered.reviewArtifacts || [],
      video: "output.mp4",
      thumbnail: fs.existsSync(path.join(dir, "thumbnail.jpg")) ? "thumbnail.jpg" : null,
      thumbs: (thumbs || []).filter((t) => fs.existsSync(path.join(dir, t))),
      seo: "seo.md",
      srt: "subs.srt",
    };
    cleanupIntermediate(jobId, dir);
    try { const n = pruneShotCaches(); if (n) log(jobId, `${n} eski işin akıllı render önbelleği temizlendi (son ${SHOT_CACHE_KEEP} iş tutulur).`); } catch {}
    updateJob(jobId, {
      status: "done", stage: "done", progress: 100,
      message: seo.incomplete || rendered.qualityWarnings?.length ? "Video üretildi; yayın öncesi inceleme gerekli." : "Hazır 🎉", outputs, usage, needsRerender:false, needsReview:!!seo.incomplete || !!rendered.qualityWarnings?.length, quality:rendered.quality, qualityWarnings:rendered.qualityWarnings || [],
      meta: { ...(getJob(jobId).meta || {}), durationSec, title: script.title },
    });
    log(jobId, `Video hazır: ${Math.floor(durationSec / 60)} dk ${Math.round(durationSec % 60)} sn`);
  } catch (e) {
    if (String(e.message).includes("cancelled") || isCancelled()) {
      updateJob(jobId, { status: "cancelled", stage: "cancelled", message: "İptal edildi" });
    } else {
      console.error(`[${jobId}]`, e);
      updateJob(jobId, { status: "error", stage: "error", message: `Hata: ${e.message}`.slice(0, 400) });
      log(jobId, `HATA: ${e.message}`);
    }
  } finally {
    saveUsage();
    // Hata/iptalde de ara dosyalar temizlensin — yoksa disk yarım render'larla dolar.
    // (İş "awaiting_picks"/"awaiting_cost"ta beklerken temizleme: devam edecek.)
    // SADECE BASARILI ISTE temizle. Hata/iptalde ara dosyalar kalsin ki hem
    // hata ayiklanabilsin hem de kaldigi yerden devam edilebilsin (olculdu: bir is
    // %59'da kesildiginde render/ klasorunde 6 saglam klip vardi, silinmisti).
    const st = getJob(jobId)?.status;
    if (st === "done") cleanupIntermediate(jobId, dir);
    killers.delete(jobId);
  }
}

/**
 * KOLAJ akışı — spec sırası:
 *   senaryo(beat) → seslendirme(süreleri belirler) → [maliyet onayı]
 *   → keyframe → animasyon → montaj
 */
async function runCollageJob({ jobId, job, dir, from, usage, saveUsage, isCancelled, killer }) {
  const log2 = (m) => log(jobId, m);
  let script, tts;

  script=readJson(path.join(dir,"script.json"));
  if(!validScript(script)) {
    stagePatch(jobId,"research",3,job.demo ? "Demo modu" : "Araştırma yapılıyor...");
    const rf=path.join(dir,"research.md");
    const research=fs.existsSync(rf) ? fs.readFileSync(rf,"utf8") : job.demo ? "" : await runResearch(job,usage,log2);
    fs.writeFileSync(rf,research,"utf8"); saveUsage(); if(isCancelled()) return;
    stagePatch(jobId,"script",12,"Kolaj senaryosu yazılıyor...");
    script=await runCollageScript(job,research,usage,log2); writeJson(path.join(dir,"script.json"),script);
    checkpoint(dir,"script",[job.topic,job.guidance],script);
    updateJob(jobId,{meta:{title:script.title,beats:script.beats.length},usage});
  }
  if(isCancelled()) return;
  const cachedCollage=readJson(path.join(dir,"media.json"),{});
  const completeCollage=script.beats.every(b=>validMedia(cachedCollage[b.id]));
  const settings=getJobSettings(job);
  if (!completeCollage && !settings.dryRun && !providerReady(settings,{animate:job.collageMode!=='kapali'})) {
    throw new Error('AI üretim sağlayıcısı eksik. Seçili kare/animasyon modu için Ayarlar’daki sağlayıcı anahtarlarını tamamlayın veya yalnızca deneme için Dry-run açın.');
  }
  stagePatch(jobId,"voice",26,"Eksik seslendirmeler tamamlanıyor...");
  const ttsScript={sections:[{title:"",segments:script.beats.map(b=>({text:b.text}))}]};
  tts=await cachedVoice(job,ttsScript,dir,log2,isCancelled);
  if(isCancelled()) return;
  if(!completeCollage && !settings.dryRun && !job.costApproved) {
    const cost=estimateCost(script.beats.length,{mode:job.collageMode});writeJson(path.join(dir,"cost.json"),cost);
    updateJob(jobId,{status:"awaiting_cost",stage:"cost",progress:32,message:`Onay bekliyor: ${script.beats.length} beat ≈ $${cost.total}`,cost});return;
  }

  job = getJob(jobId);
  const st = getJobSettings(job);
  const dryRun = !!st.dryRun;
  const animate = job.collageMode !== "kapali";

  // beat'lere süreleri bağla
  const beats = script.beats.map((b, i) => ({ ...b, duration: (tts[i]?.duration || 3) + 0.12 }));

  // 5) KEYFRAME
  stagePatch(jobId, "keyframe", 38, dryRun ? "Keyframe'ler üretiliyor (dry-run)..." : "Keyframe'ler üretiliyor...");
  // Görsel dil: fullai → fotogerçekçi sinema, kolaj → kâğıt kolaj
  const stil = styleOf(job);
  const kanvas = canvasOf(job);
  log2(`Görsel dil: ${stil.ad} · ${kanvas.ad} ${kanvas.ratio} (${kanvas.size})`);
  const frameFile=path.join(dir,"keyframes.json"); const frameCache=readJson(frameFile,[]);
  const frameMap=new Map(frameCache.map(k=>[k.beatId,k]));
  const keyframes = completeCollage ? frameCache : await generateKeyframes(beats.filter(b=>!validMedia(cachedCollage[b.id]) || frameMap.has(b.id)), path.join(dir, "keyframes"), {
    dryRun, logFn: log2, isCancelled, killer, stil, kanvas, cached:frameCache, settings:st,
    onResult(k) { frameMap.set(k.beatId,k); writeJson(frameFile,[...frameMap.values()]); },
  });
  if(!completeCollage) writeJson(frameFile,keyframes);
  if (isCancelled()) return;

  // 6) ANİMASYON
  stagePatch(jobId, "animate", 48, animate ? "Klipler canlandırılıyor..." : "Kapalı mod: animasyon atlanıyor");
  const media = completeCollage ? cachedCollage : await animateKeyframes(beats, keyframes, path.join(dir, "clips"), {
    dryRun, animate, mode:job.collageMode, logFn: log2, isCancelled, killer, stil, kanvas, cached:cachedCollage, settings:st,
    onResult(m) { cachedCollage[m.beatId]=m; writeJson(path.join(dir,"media.json"),cachedCollage); },
  });
  writeJson(path.join(dir, "media.json"), media);
  if (isCancelled()) return;

  // kabul kriterleri
  const report = acceptanceReport(beats, media);
  for (const r of report) log2(`${r.ok ? "✓" : "✗"} ${r.label}`);
  writeJson(path.join(dir, "acceptance.json"), report);

  // 7) SEO
  stagePatch(jobId, "seo", 52, "SEO paketi üretiliyor...");
  const seoScript = { title: script.title, sections: [{ title: "", segments: beats.map((b) => ({ text: b.text })) }] };
  let seo;
  try { seo = await cachedSeo(job,seoScript,usage,log2,dir); } catch(e) { if(isCancelled()) return; log2(`SEO tamamlanamadı: ${e.message}`); seo={title:script.title,description:"",tags:[],thumbnailText:"",incomplete:true}; }
  saveUsage();
  if(job.thumbnailTextEdited) seo={...seo,thumbnailText:job.thumbnailText};
  job = updateJob(jobId, { thumbnailText: job.thumbnailTextEdited ? job.thumbnailText : seo.thumbnailText });
  if (isCancelled()) return;

  // 8) MONTAJ
  stagePatch(jobId, "render", 55, "Montaj başladı...");
  let lastP = -1;
  const shotEdits = readShotEdits(dir);
  const rendered = await renderRevision(dir,[script,media,tts,job.editRevision,creativeSettings(job.settingsSnapshot),...renderPolicyVersions(job),...shotEditKey(shotEdits)],(renderDir) => renderAll(
    { ...job, recoveryDir:dir, shotEdits, subtitleMode: job.subtitleMode === "none" ? "none" : "strip" },
    script, media, tts, renderDir, log2,
    (p) => { const rp = Math.round(Math.min(91, p)); if (rp !== lastP) { lastP = rp; updateJob(jobId, { progress: rp }); } },
    killer
  ),isCancelled);
  const { durationSec, sectionTimes, thumbs, muzikler } = rendered;
  if (isCancelled()) return;

  // 9) ÇIKTILAR
  stagePatch(jobId, "finalize", 95, "Çıktılar yazılıyor...");
  fs.writeFileSync(path.join(rendered.dir, "seo.md"), renderSeoMarkdown(job, script, seo, sectionTimes, durationSec, media, muzikler), "utf8");
  publishRevision(dir,rendered);
  writeJson(path.join(dir, "seo.json"), seo);
  cleanupIntermediate(jobId, dir);
  updateJob(jobId, {
    status: "done", stage: "done", progress: 100, message: seo.incomplete || rendered.qualityWarnings?.length ? "Video üretildi; yayın öncesi inceleme gerekli." : "Hazır 🎉", usage, needsRerender:false, needsReview:!!seo.incomplete || !!rendered.qualityWarnings?.length, quality:rendered.quality, qualityWarnings:rendered.qualityWarnings || [],
    outputs: {
      video: "output.mp4",
      thumbnail: fs.existsSync(path.join(dir, "thumbnail.jpg")) ? "thumbnail.jpg" : null,
      thumbs: (thumbs || []).filter((t) => fs.existsSync(path.join(dir, t))),
      seo: "seo.md", srt: "subs.srt",
    },
    meta: { ...(getJob(jobId).meta || {}), durationSec, title: script.title },
  });
  log2(`Video hazır: ${Math.floor(durationSec / 60)} dk ${Math.round(durationSec % 60)} sn, ${beats.length} beat`);
}

/**
 * Remove disposable render scratch from completed jobs only. Preserve sources,
 * interrupted work, completed revisions and preceding final outputs.
 * @returns {{jobs:number, mb:number}}
 */
// Akıllı render önbelleği uzun videoda ~600 MB tutar. Yalnızca en son render
// edilen birkaç işte saklanır; daha eski işlerinki kendiliğinden silinir.
export const SHOT_CACHE_KEEP = 3;
export function pruneShotCaches(keep = SHOT_CACHE_KEEP) {
  const caches = [];
  for (const j of loadAllJobs()) {
    if (activeJob(j.id)) continue;
    let d; try { d = path.join(jobDir(j.id), 'shot-cache'); } catch { continue; }
    try { caches.push({ d, t: fs.statSync(d).mtimeMs }); } catch {}
  }
  caches.sort((a, b) => b.t - a.t);
  let removed = 0;
  for (const c of caches.slice(keep)) { try { fs.rmSync(c.d, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); removed++; } catch {} }
  return removed;
}

export function sweepIntermediate() {
  let jobs = 0, before = 0;
  for (const j of loadAllJobs()) {
    if (j.status !== "done" || activeJob(j.id)) continue;
    let dir;
    try { dir = jobDir(j.id); } catch { continue; }
    let had = 0;
    for (const d of [...renderScratchDirs(dir), path.join(dir, 'shot-cache')]) {   // shot-cache: akıllı render önbelleği, gerekirse yeniden oluşur
      if (!fs.existsSync(d)) continue;
      try {
        for (const f of fs.readdirSync(d, { recursive: true })) {
          try { const st = fs.statSync(path.join(d, f)); if (st.isFile()) had += st.size; } catch {}
        }
        fs.rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      } catch {}
    }
    if (had > 0) { jobs++; before += had; }
  }
  return { jobs, mb: Math.round(before / 1048576) };
}

// Mark interrupted jobs without deleting any recoverable artifacts.
export function sweepStaleJobs(jobs) {
  for (const j of jobs) {
    if (["running", "queued"].includes(j.status)) {
      updateJob(j.id, { status: "error", stage: "error", message: "Uygulama kapandığı için yarıda kaldı. Kaynaklar korundu; Devam et ile eksik adımdan sürdürün." });

    }
  }
}

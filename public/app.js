/* Nova Stüdyo — ön yüz */
import {productionMode, isGenerated, isDocu, aiAllowance, selectProductionMode, animationCount, usesAutomaticEditor, restoreProductionForm, setProductionPreference} from './production-modes.js';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** A channel's own voice in the narrator list (server: /api/eleven-voices `channel`). */
const CHANNEL_VOICE_TR = { epic: "🏛 Tarih", news: "📰 Gündem", finance: "💹 Finans" };
/** A library narrator cloned this often is on many other channels (podcast, Oct 2026: "Brian 40.000 kanalda"). */
const COMMON_VOICE_USES = 20000;
/** Options for a channel's voice in Settings: the account's own voices (★) first, then the rest. */
// Kanalın seçili sesi stil düğmesinin yanında görünür (kanal sahibi, 29 Ekim 2026: "her kanalın sesini yanında göster,
// seçtiğimiz unutmayalım"). Ses ayarlardaki docuStyleVoices'tan; adı ElevenLabs listesinden (yüklenmediyse kısaltılmış kimlik).
// Kanal seslerinin kökeni (24 Ekim 2026'da yeni ElevenLabs hesabına klonlandı): adın yanında hangi sesin klonu olduğu.
const KANAL_SES_KOKENI = { s7KFkBv0nrs6EIRE1GDy: "Quentin klonu", u9E4FBbWILPZakBNST5d: "Daniel klonu", QCi5Cmzx0lbdL1Z3VhF3: "Michael C. Vincent klonu" };
function kanalSesEtiketi(k) {
  const id = state.settings?.docuStyleVoices?.[k];
  if (!CHANNEL_VOICE_TR[k]) return "";
  if (!id) return `<span class="voice-tag" style="display:block;font-size:11px;opacity:.75;margin-top:2px">🎙 ses seçilmedi</span>`;
  const v = (state.elevenVoices || []).find((x) => x.id === id);
  const ad = (v ? v.name.split(" - ")[0] : null) ? `${v.name.split(" - ")[0]}${KANAL_SES_KOKENI[id] ? ` (${KANAL_SES_KOKENI[id]})` : ""}` : (state.elevenVoices?.length ? `hesapta yok (${id.slice(0, 6)})` : id.slice(0, 6) + "…");
  return `<span class="voice-tag" style="display:block;font-size:11px;opacity:.85;margin-top:2px" title="Kanal sesi: ${esc(id)} — Ayarlar'dan değiştirilir">🎙 ${esc(ad)}</span>`;
}

function channelVoiceOptions(cur = "") {
  const list = state.elevenVoices || [];
  const opt = (v) => `<option value="${esc(v.id)}" ${v.id === cur ? "selected" : ""}>${v.own ? "★ " : ""}${esc(v.name.split(" - ")[0])}${v.own ? " · sana özel" : ""}</option>`;
  const known = list.some((v) => v.id === cur);
  return [
    `<option value="" ${cur ? "" : "selected"}>— seçilmedi —</option>`,
    cur && !known ? `<option value="${esc(cur)}" selected>${list.length ? "hesapta bulunamadı" : "yükleniyor…"} (${esc(cur.slice(0, 6))})</option>` : "",
    ...list.filter((v) => v.own).map(opt),
    ...list.filter((v) => !v.own).map(opt),
  ].join("");
}

const state = {
  settings: null,
  presets: null,
  jobs: new Map(),
  queue: [],
  page: "studio",
  form: {
    topic: "", guidance: "", theme: "vox", tone: "varsayilan", language: "tr",
    voiceId: "tr-TR-AhmetNeural", durationPreset: "detayli", subtitleMode: "classic",
    mediaMode: "manual", useWebSearch: true, visualStyle: "editorial", collageMode: "hibrit", mediaKind: "mixed",
    aiButce: 3, aiClips: 3, aiFill: 3, aiSupport: 'auto', aiSupportBudgetUsd: 20, transitions: "sinematik", ratio: "16:9", yaziModu: "vurgu", gorselDenetim: true,
  },
  logs: new Map(), // jobId -> [lines]
  sesCalan: null, // ses önizlemesinde aynı anda tek Audio çalsın
  openPanel: null, // formda açık tarif paneli ("theme"|"visual"|...|"all"|null) — API'ye gitmez
  formRefresh: null, // form ekrandayken kısmi çizim fonksiyonu, değilse null
  pickerData: null, // {job, script, candidates, picks}
  showForm: false, // iş çalışırken kullanıcı formu açtıysa
  health: null, // {ffmpeg, node, ffmpegPath, code}
  elevenVoicesError: null,
};

// ---------- yardımcılar ----------
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
// Ağ hatası veren tıklama işleyicilerinin çoğunda try/catch yok; sessiz başarısızlık
// yerine kullanıcı en azından sebebi görsün.
window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason?.message || String(e.reason || "");
  if (m) toast(m.slice(0, 200), true);
});

function toast(msg, isErr = false) {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast" + (isErr ? " err" : ""); t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 3600);
}
function fmtDur(sec) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m} dk ${s} sn`;
}
function modal(html) {
  $("#modalBox").innerHTML = html;
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; $("#modalBox").innerHTML = ""; }
$("#modal").addEventListener("click", (e) => {
  if(e.target.id !== 'modal')return;
  const editorClose=$('#novaEditor #edClose');
  if(editorClose)editorClose.click(); // respects unsaved edits and busy/disabled state
  else closeModal();
});

// Form paneli Esc ile kapanır. Dinleyici BİR KEZ kurulur — renderForm içinde kurulsaydı
// her çizimde birikir ve form ekranda değilken ölü DOM'a yazıp hata fırlatırdı.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !state.openPanel) return;
  state.openPanel = null;
  if (state.page === "studio" && $("#fRecipe")) state.formRefresh?.();
});

function activeJob() {
  const jobs = [...state.jobs.values()];
  return jobs.find((j) => j.status === "running") ||
    jobs.find((j) => j.status === "awaiting_cost") ||
    jobs.find((j) => j.status === "awaiting_picks") ||
    jobs.find((j) => j.status === "queued");
}

// ---------- başlangıç ----------
async function boot() {
  const data = await api("/api/state");
  state.settings = data.settings;
  state.presets = data.presets;
  state.queue = data.queue;
  data.jobs.forEach((j) => state.jobs.set(j.id, j));
  const h = await api("/api/health").catch(() => ({ ffmpeg: false, code: "SUNUCU_YANIT_YOK" }));
  state.health = h;
  renderSidebarStatus(h);
  const es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "job") {
      state.jobs.set(msg.job.id, msg.job);
      onJobUpdate(msg.job);
    } else if (msg.type === "log") {
      const arr = state.logs.get(msg.jobId) || [];
      arr.push({ t: new Date(), line: msg.line });
      if (arr.length > 400) arr.shift();
      state.logs.set(msg.jobId, arr);
      appendLog(msg.jobId, msg.line);
    } else if (msg.type === "jobDeleted") {
      state.jobs.delete(msg.jobId);
      render();
    }
  };
  window.addEventListener("hashchange", () => { state.page = location.hash.slice(1) || "studio"; render(); });
  state.page = location.hash.slice(1) || "studio";
  render();
}

function renderSidebarStatus(h) {
  $("#dotFfmpeg").className = "dot " + (h.ffmpeg ? "ok" : "bad");
  $("#stFfmpeg").textContent = h.ffmpeg ? "hazır" : "YOK";
  const key = state.settings.hasAnthropicKey;
  $("#dotKey").className = "dot " + (key ? "ok" : "warn");
  $("#stKey").textContent = key ? "bağlı" : "anahtar yok";
  const demo = state.settings.demoMode || !key;
  $("#dotMode").className = "dot " + (demo ? "warn" : "ok");
  $("#stMode").textContent = demo ? "DEMO" : "üretim";
  krediGoster();
}

/**
 * CANLI KREDİ. Üretime başlamadan önce elde ne olduğu görünsün — kota bitince
 * iş yarıda ölüyor ve o ana kadarki senaryo/görsel masrafı boşa gidiyordu.
 * Kalan miktar kadar "kaç videoya yeter" da yazılır; ham sayı tek başına
 * bir şey ifade etmiyor.
 */
async function krediGoster() {
  try {
    const c = await api("/api/credits");
    state.krediler = c;
    if (c.eleven) {
      // Rozet Sinematik Belgesel'e göre (12 dk'lık belgeselin gerçek ihtiyacı: ses +
      // gerekiyorsa müzik/ortam/efekt). Eski sayı yalnızca 8 dk anlatımı sayıyordu.
      const docu = Number.isFinite(c.eleven.docuVideolar);
      const n = docu ? c.eleven.docuVideolar : c.eleven.videolar;
      $("#rowEleven").hidden = false;
      $("#dotEleven").className = "dot " + (n < 1 ? "bad" : n < 3 ? "warn" : "ok");
      $("#stEleven").textContent = `${Math.round(c.eleven.left / 1000)}k · ~${n} ${docu ? "belgesel" : "video"}`;
      $("#rowEleven").title = `ElevenLabs ${c.eleven.tier} — ${c.eleven.used.toLocaleString("tr-TR")} / ` +
        `${c.eleven.limit.toLocaleString("tr-TR")} karakter kullanıldı` +
        (docu ? `\n12 dk Sinematik Belgesel ≈ ${c.eleven.docuPerVideo.toLocaleString("tr-TR")} kredi → ~${c.eleven.docuVideolar} video` +
          `\nKlasik mod (8 dk, ElevenLabs anlatım) → ~${c.eleven.videolar} video` : "");
    }
    if (c.kie) {
      const az = c.kie.gorsel < 10;
      $("#rowKie").hidden = false;
      $("#dotKie").className = "dot " + (az ? "warn" : "ok");
      $("#stKie").textContent = `${c.kie.kredi} · ~${c.kie.gorsel} görsel`;
      $("#rowKie").title = `Kie AI — ${c.kie.kredi} kredi (1 görsel ≈ 4 kredi)`;
    }
  } catch { /* kredi bilgisi alınamadıysa satırlar gizli kalır, iş etkilenmez */ }
}

function onJobUpdate(job) {
  const running = [...state.jobs.values()].some((j) => ["running", "awaiting_picks", "awaiting_cost"].includes(j.status));
  $("#liveBadge").hidden = !running;
  const qn = [...state.jobs.values()].filter((j) => j.status === "queued").length;
  $("#queueCount").hidden = qn === 0;
  $("#queueCount").textContent = qn;
  if (state.page === "studio") {
    // Kullanıcı yeni video formunu açtıysa altından çekip almayalım (yazdığı metin gider)
    if (state.showForm) return;
    const shownId = $("#main").dataset.jobId;
    if (shownId === job.id) updatePipelineView(job);
    else if (!shownId || ["running", "awaiting_cost", "awaiting_picks", "queued"].includes(job.status)) render();
  } else if (["queue", "library"].includes(state.page)) render();
}

// ---------- sayfa yönlendirme ----------
function render() {
  $$(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.page === state.page));
  const main = $("#main");
  main.dataset.jobId = "";
  state.formRefresh = null; // eski formun kapanışları ölü DOM'a yazmasın
  if (state.page !== "studio") state.openPanel = null; // sekme değişince panel kapansın
  if (state.page === "studio") {
    const j = state.showForm ? null : activeJob();
    if (j) renderPipeline(main, j);
    else renderForm(main);
  } else if (state.page === "queue") renderQueue(main);
  else if (state.page === "library") renderLibrary(main);
  else if (state.page === "gundem") renderGundem(main);
  else if (state.page === "settings") renderSettings(main);
}

/** Türkçe ~5,9 karakter/kelime; TR 140 kelime/dk, EN 155. */
function estimatedChars(minutes, lang) {
  const wpm = lang === "tr" ? 140 : 155;
  const perWord = lang === "tr" ? 6.4 : 5.6;
  return Math.round(minutes * wpm * perWord);
}

/**
 * Sinematik Belgesel'in ElevenLabs ihtiyacı (kredi). src/pipeline/docu-script.js
 * docuElevenEstimate'in İKİZİ — biri değişirse öbürü de. Eskiden yalnızca anlatım
 * sayılıyordu; müzik (ElevenLabs bestesi seçiliyse), ortam sesi ve efekt havuzu
 * (ses kütüphanesi yoksa) formda görünmüyordu.
 */
function docuElevenEstimate(minutes, lang, { musicSource = "library", libraryReady = true } = {}) {
  const l = lang === "en" ? "en" : "tr";
  const wpm = l === "en" ? 140 : 120;
  const voice = Math.round(minutes * wpm * 1.07 * (l === "en" ? 7.2 : 8.4));
  const sec = minutes * 60 * 1.1;
  const parts = Math.max(1, Math.ceil(sec / 240));
  const music = musicSource === "eleven" || !libraryReady ? Math.round(((sec + 3 + 2 * (parts - 1)) / 60) * 2500) : 0;
  const ambience = libraryReady ? 0 : Math.round(((minutes * wpm) / 9) * 0.83 * 5.5 * 40);
  const sfx = libraryReady ? 0 : 1300;
  return { voice, music, ambience, sfx, total: voice + music + ambience + sfx };
}
/** Formdaki seçime göre docu ihtiyacı: hazır senaryoda sahne sayısından, yoksa süreden. */
function docuNeedFor(f, p) {
  const s = state.settings;
  const hazir = f.docuScript?.scenes?.length;
  const minutes = hazir ? Math.max(0.5, hazir * 4.5 / 60) : (p.durations[f.durationPreset]?.minutes || 8);
  const est = docuElevenEstimate(minutes, f.language, { musicSource: s.docuMusicSource || "library", libraryReady: s.audioLibrary?.ready !== false });
  if (!hazir) return est;
  // Hazır senaryoda anlatım sayılabilir: satır + motorun eklediği duygu etiketi.
  const voice = f.docuScript.scenes.reduce((n, sc) => n + (sc.say ? String(sc.say).length + (/^\s*\[/.test(sc.say) ? 0 : 10) : 0), 0);
  return { ...est, voice, total: est.total - est.voice + voice };
}
function quotaNeed(f, p) {
  return isDocu(f) ? docuNeedFor(f, p).total : estimatedChars(p.durations[f.durationPreset]?.minutes || 8, f.language);
}

/** ElevenLabs kota durumu — video seçilen süreye sığıyor mu? */
function voiceQuotaNote(f, p) {
  const s = state.settings;
  // Sinematik Belgesel her zaman ElevenLabs kullanır (ses ayarından bağımsız) ve Edge'e düşmez.
  const eleven = isDocu(f) ? s.hasElevenKey : (s.ttsProvider === "eleven" && s.hasElevenKey);
  if (!eleven) return "";
  const q = state.elevenQuota;
  if (!q) return "";
  const need = quotaNeed(f, p);
  const fits = need <= q.left;
  const blocked = state.elevenBlocked
    ? ` · ${state.elevenBlocked} kütüphane sesi ücretsiz planda API'den kullanılamadığı için gizlendi`
    : "";
  const d = isDocu(f) ? docuNeedFor(f, p) : null;
  const kirilim = d
    ? ` (ses ${d.voice.toLocaleString("tr-TR")}${d.music ? ` + müzik ${d.music.toLocaleString("tr-TR")}` : ""}${d.ambience ? ` + ortam ${d.ambience.toLocaleString("tr-TR")}` : ""}${d.sfx ? ` + efekt ${d.sfx.toLocaleString("tr-TR")}` : ""})`
    : "";
  return `<div class="quota ${fits ? "" : "bad"}">
    <b>${q.tier}</b> plan · kalan <b>${q.left.toLocaleString("tr-TR")}</b> / ${q.limit.toLocaleString("tr-TR")} karakter${blocked}
    <div style="margin-top:5px">Bu video ~<b>${need.toLocaleString("tr-TR")}</b> ${d ? "kredi" : "karakter"} kullanır${kirilim} — ${
      fits
        ? `sığıyor ✓ (sonra ${(q.left - need).toLocaleString("tr-TR")} kalır)`
        : isDocu(f)
          ? `<b>YETMİYOR</b> — Sinematik Belgesel yalnızca ElevenLabs ile seslendirilir; iş, görsellere para harcamadan önce krediyi denetler ve yetmiyorsa durur. Daha kısa süre seç, müziği kütüphaneden al (Ayarlar) veya kredi yükle.`
          : `<b>YETMİYOR</b> — bu video otomatik olarak <b>Edge TTS</b> ile seslendirilir (ücretsiz, sınırsız). ElevenLabs sesi istiyorsan daha kısa süre seç veya planı yükselt.`
    }</div>
  </div>`;
}

// ---------- form ----------
/** state.form'un başlangıç değerleriyle birebir aynı (satır 12-16) — ↺ bunu kullanır. */
const FORM_DEFAULTS = {
  theme: "vox", tone: "varsayilan", language: "tr", voiceId: "tr-TR-AhmetNeural",
  durationPreset: "detayli", subtitleMode: "classic", mediaMode: "manual",
  useWebSearch: true, visualStyle: "editorial", collageMode: "hibrit", mediaKind: "mixed",
  aiButce: 3, aiClips: 3, aiFill: 3, aiSupport: 'auto', aiSupportBudgetUsd: 20, transitions: "sinematik", ratio: "16:9", yaziModu: "vurgu", gorselDenetim: true,
};
const PANELS = {
  theme:  { k: "TEMA",    t: "Tema",                s: "Videonun anlatım formatı" },
  visual: { k: "GÖRSEL",  t: "Görsel dil",          s: "Kesme temposu, ekran grafikleri ve üretilen sahneler" },
  tone:   { k: "TON",     t: "Ton",                 s: "Anlatıcının üslubu" },
  dur:    { k: "SÜRE",    t: "Süre",                s: "Hedef uzunluk — maliyeti ve ses kotasını belirler" },
  voice:  { k: "SES",     t: "Dil ve seslendirme",  s: "Video dili ve anlatıcı sesi" },
  subs:   { k: "ALTYAZI", t: "Altyazı",             s: "Ekrandaki yazı biçimi" },
  prod:   { k: "ÜRETİM",  t: "Üretim seçenekleri",  s: "Görsellerin nasıl seçileceği ve araştırma kaynağı" },
};
const PANEL_ORDER = ["theme", "visual", "tone", "dur", "voice", "subs", "prod"];
/** Sinematik Belgesel tema/görsel dil/altyazı/üretimi kendi stilinden alır — sadece işe yarayanlar. */
const DOCU_PANELS = ["tone", "dur", "voice"];
const SUBS_LABEL = { classic: "Klasik", word: "Kelime kelime", none: "Kapalı" };
const COLLAGE_LABEL = { kapali: "sade", hibrit: "hibrit", acik: "tam animasyon" };
const TRANS_LABEL = { sinematik: "Sinematik", sade: "Sade geçiş", yok: "Sert kesme" };
const RATIO_ROZET = { "16:9": "YouTube", "9:16": "Shorts", "1:1": "Feed" };
/** src/config.js THEME_ACCENT ile aynı — sunucu presets'te göndermiyor, sadece görsel. */
const THEME_TINT = {
  vox: "#FFD23F", belgesel: "#FFC02E", haber: "#FF3B30", top5: "#22D3EE",
  analiz: "#34E3B0", egitim: "#4EA1FF", hikaye: "#B07CFF",
};

/** AI sahne için görsel sağlayıcı anahtarı var mı? */
function imgProviderReady() {
  const s = state.settings;
  return s.imageProvider === "kie" ? !!s.hasKieKey
    : s.imageProvider === "openai" ? !!s.hasOpenaiKey
    : s.imageProvider === "higgs" ? !!s.hasHiggsKey : !!s.hasFalKey;
}
/** Kolaj için hem görsel hem video sağlayıcısı gerekiyor. */
function genProviderReady(f) {
  const s = state.settings;
  const has = { kie: !!s.hasKieKey, fal: !!s.hasFalKey, higgs: !!s.hasHiggsKey, openai: !!s.hasOpenaiKey };
  return !!has[s.imageProvider] && (f.collageMode === 'kapali' || !!has[s.videoProvider || s.imageProvider]);
}
/** Panel KAPALIYKEN de görünmesi gereken uyarılar (dry-run, eksik anahtar). */
function productionWarnings(f) {
  if (isDocu(f)) {
    // Sinematik motorun deneme modu yok: Dry-run açık olsa da görsel/ses gerçekten üretilir.
    return state.settings.dryRun
      ? ['🧪 <b>Dry-run bu moda uygulanmaz</b> — Sinematik Belgesel görselleri (GPT Image) ve ses/müziği (ElevenLabs) gerçekten üretir ve ücretlidir.']
      : [];
  }
  const generative = isGenerated(f) || aiAllowance(f) > 0 || usesAutomaticEditor(f);
  if (!generative) return [];
  const ready = isGenerated(f) ? genProviderReady(f) : imgProviderReady();
  if (state.settings.dryRun) return ['🧪 <b>Dry-run açık</b> — ücretli görsel/animasyon üretimi yapılmaz; Kolaj ve Tam AI yerel deneme kareleri kullanır.'];
  if (!ready) {
    return [`<b>Sağlayıcı anahtarı eksik</b> — ${isGenerated(f) ? 'bu üretim modu başlatılamaz' : f.aiSupport==='auto'?'AI gereken sahneler doğrulanamazsa üretim durur':'AI sahneler üretilemez, arşiv adayları kullanılır'}. Ayarlar'dan seçili sağlayıcıyı tamamlayın.`];
  }
  if (state.settings.dryRun) {
    return [`🧪 <b>Dry-run açık</b> — görseller yerel yer tutucularla üretilir, ücret alınmaz.
      Gerçek üretim için Ayarlar'dan Dry-run'ı kapatın.`];
  }
  return [];
}
/** voiceQuotaNote'un ikizi: kota bu videoya yetiyor mu? (şerit rozeti + #fNotes için) */
function voiceQuotaFits(f, p) {
  const s = state.settings, q = state.elevenQuota;
  const eleven = isDocu(f) ? s.hasElevenKey : (s.ttsProvider === "eleven" && s.hasElevenKey);
  if (!eleven || !q) return true;
  return quotaNeed(f, p) <= q.left;
}

function renderForm(main) {
  const p = state.presets, f = state.form;
  const demo = state.settings.demoMode || !state.settings.hasAnthropicKey;
  // Sinematik Belgesel ses ayarından bağımsız olarak ElevenLabs kullanır; mod değişince yeniden değerlendirilir.
  const useEleven = () => state.settings.hasElevenKey && (state.settings.ttsProvider === "eleven" || isDocu(state.form));
  const busy = activeJob();
  const noFfmpeg = state.health && state.health.ffmpeg === false;

  // Dil ↔ ses eşleşmesi. Eski kodda (171-172) her çizimde koşulsuz çalışıyordu ve
  // öyle KALMALI: ElevenLabs kotası yetmeyince Edge TTS'e düşülüyor, o an voiceId
  // dili tutmuyorsa yanlış dilde seslendirme yapılır.
  const edgeVoices = () => {
    const list = Object.entries(p.voices).filter(([, v]) => v.lang === state.form.language);
    if (!list.find(([id]) => id === state.form.voiceId)) state.form.voiceId = list[0]?.[0];
    // ELEVENLABS SESİ DE DİLİ TUTMALI.
    //
    // Eskiden yalnızca Edge sesi düzeltiliyordu. Dil İngilizce'ye çevrildiğinde
    // ElevenLabs sesi Türkçe'de kalıyordu ve şeritte "SES EN · Caglayan Zorlu"
    // yazıyordu — İngilizce metin, İstanbul aksanlı bir sese okutuluyordu.
    // Kullanıcının "İngilizce seçtim Türkçe anlatım çıktı" şikâyetinin bir
    // ayağı buydu. Her sesin labels.language alanı var, ona bakılıyor.
    elevenVoiceDiliTut();
    return list;
  };

  /** Seçili ElevenLabs sesi videonun dilinde değilse, o dilden ilkine geç. */
  function elevenVoiceDiliTut() {
    const l = state.elevenVoices;
    if (!Array.isArray(l) || !l.length) return;          // liste henüz gelmediyse dokunma
    const dil = state.form.language === "en" ? "en" : "tr";
    const uygun = l.filter((v) => (v.labels?.language || "").toLowerCase().startsWith(dil));
    if (!uygun.length) return;                            // o dilde ses yoksa seçimi bozma
    const simdiki = l.find((v) => v.id === state.form.elevenVoiceId);
    const simdikiDil = (simdiki?.labels?.language || "").toLowerCase();
    if (simdiki && simdikiDil.startsWith(dil)) return;    // zaten doğru dilde
    // Sinematik Belgesel kendi anlatıcısını (Musa/George) kullanır: ses kendiliğinden seçilmez;
    // yanlış dilde bir seçim varsa temizlenir ki motorun varsayılanı devreye girsin.
    if (isDocu(state.form) && state.settings.ttsProvider !== "eleven") {
      if (simdiki) delete state.form.elevenVoiceId;
      return;
    }
    state.form.elevenVoiceId = uygun[0].id;
  }
  edgeVoices();

  main.innerHTML = `
    ${noFfmpeg ? `<div class="banner bad"><b>FFmpeg çalışmıyor — video render edilemez.</b>
      Aranan yol: <code>${esc(state.health.ffmpegPath || "ffmpeg")}</code>${state.health.code ? ` (${esc(state.health.code)})` : ""}.
      Ayarlar'dan doğru yolu girin veya ffmpeg.org'dan kurup PATH'e ekleyin.</div>` : ""}
    ${busy ? `<div class="banner">Bir üretim sürüyor — bu video kuyruğa eklenir.
      <button class="btn tiny" id="fBackToJob">Çalışan işe dön</button></div>` : ""}

    <header class="page-head">
      <div>
        <div class="page-title">Yeni video</div>
        <div class="page-sub">Konuyu yaz, türünü seç — gerisini Nova halleder.</div>
      </div>
      ${demo ? '<span class="head-pill warn" title="Gerçek senaryo için Ayarlar\'dan Claude API anahtarı ekleyin">DEMO MODU</span>' : ""}
    </header>

    <div class="card hero" id="fHero">
      <div class="step-label"><span class="step-no">1</span><label for="fTopic">Konu</label></div>
      <div class="hero-row">
        <input id="fTopic" class="hero-input" autocomplete="off"
               placeholder="Ne anlatalım? örn. Nikola Tesla'nın hayatı, Bermuda Şeytan Üçgeni…"
               value="${esc(f.topic)}" />
        <button class="btn primary big" id="fGo">Videoyu oluştur →</button>
      </div>

      <div class="hero-meta">
        <button type="button" class="linkish" id="fGuideBtn"
                aria-expanded="${f.guidance ? "true" : "false"}" aria-controls="fGuideWrap">
          <span class="linkish-plus">＋</span> Yön ver <span class="muted">(isteğe bağlı)</span>
        </button>
        <span class="muted est" id="fEst"></span>
      </div>

      <div id="fGuideWrap" ${f.guidance ? "" : "hidden"}>
        <textarea id="fGuidance" placeholder="Senaryo belirli bir yöne odaklansın mı? örn. 'rekabete odaklan', 'finansal tarafı öne çıkar'">${esc(f.guidance)}</textarea>
      </div>

      <div class="modes" id="fModes"></div>
      <details class="advanced" id="fAdvanced">
      <summary>Gelişmiş ayarlar</summary>
      <div class="editor-form-options">
        <label>Kurgu yoğunluğu<select id="fIntensity">${[['restrained','Sade'],['balanced','Dengeli'],['dynamic','Dinamik']].map(([v,t])=>`<option value="${v}" ${(f.editIntensity||state.settings.editIntensity||'balanced')===v?'selected':''}>${t}</option>`).join('')}</select></label>
        <label>Ses efektleri<select id="fSound"><option value="1" ${(f.soundDesign??state.settings.soundDesign)!==false?'selected':''}>Türe ve sahneye uygun</option><option value="0" ${(f.soundDesign??state.settings.soundDesign)===false?'selected':''}>Kapalı</option></select></label>
        <label>Metin modeli harcama eşiği ($)<input id="fBudget" type="number" min="0" step="0.5" value="${f.costBudgetUsd||0}" /></label>
      </div><p class="hint">Tempo, kamera ve müzik seçilen içerik türüne uyarlanır. Harcama eşiği 0 ise kapalıdır; tanımlı fiyatlarla yeni metin isteğinden önce kontrol edilir. Görsel ve ses sağlayıcısı ücretleri ayrıca hesaplanır.</p>
      </details>

      <div class="step-label step-3"><span class="step-no">3</span>Tarif <span class="step-hint">tıkla, değiştir</span></div>
      <div class="recipe" id="fRecipe"></div>
      <div class="panel" id="fPanel" hidden></div>
    </div>

    <div id="fNotes"></div>
    <div id="fRecent"></div>`;

  // Form kompaktlaştıktan sonra ekranın alt yarısı bomboş kalıyordu. Son videoları
  // buraya koymak hem boşluğu anlamlı dolduruyor hem de en sık yapılan işi (son
  // videoyu izlemek/açmak) Kütüphane'ye gitmeden bir tık uzağa getiriyor.
  function paintRecent() {
    const box = $("#fRecent");
    if (!box) return;
    const son = [...state.jobs.values()]
      .filter((j) => j.status === "done" && j.outputs?.thumbnail)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 4);
    if (!son.length) { box.innerHTML = ""; return; }
    box.innerHTML = `
      <div class="recent-head">
        <span>SON VİDEOLAR</span>
        <a href="#library" class="linkish">Tümü →</a>
      </div>
      <div class="recent-grid">
        ${son.map((j) => `
          <button type="button" class="recent-card" data-play="${esc(j.id)}" title="${esc(j.meta?.title || j.topic)}">
            <img src="/api/jobs/${esc(j.id)}/file/thumbnail.jpg" loading="lazy" alt="" />
            <span class="recent-title">${esc(j.meta?.title || j.topic)}</span>
            <span class="recent-meta">${fmtDur(j.meta?.durationSec)} · ${new Date(j.createdAt).toLocaleDateString("tr-TR")}</span>
          </button>`).join("")}
      </div>`;
    box.querySelectorAll("[data-play]").forEach((el) => {
      el.addEventListener("click", () => {
        const j = state.jobs.get(el.dataset.play);
        modal(`<h3>${esc(j?.meta?.title || j?.topic || "")}</h3>
          <video controls autoplay src="/api/jobs/${esc(el.dataset.play)}/file/output.mp4"></video>`);
      });
    });
  }

  // ---------- küçük HTML üreticileri ----------
  const sec = (label, html, hint, wide) =>
    `<div class="panel-sec${wide ? " wide" : ""}"><label class="field-label">${label}</label>${html}${
      hint ? `<div class="hint">${hint}</div>` : ""}</div>`;

  const cards = (obj, cur, id) => `<div class="opt-grid" id="${id}">${
    Object.entries(obj || {}).map(([k, v]) => `
      <div class="opt-card ${cur === k ? "sel" : ""}" data-k="${esc(k)}" title="${esc(v.desc || "")}">
        <div class="accent-bar"></div><b>${esc(v.name)}</b><small>${esc(v.desc || "")}</small>
      </div>`).join("")}</div>`;

  // label ve badge çağrı yerinde kaçırılır (bazıları kasıtlı HTML içerir)
  const chips = (arr, cur, id) => `<div class="chips" id="${id}">${
    arr.map(([k, label, badge]) =>
      `<div class="chip ${String(cur) === String(k) ? "sel" : ""}" data-k="${esc(k)}">${
        badge ? `<span class="badge">${esc(badge)}</span>` : ""}${label}</div>`).join("")}</div>`;

  function voiceLabel() {
    if (useEleven()) {
      const v = (state.elevenVoices || []).find((x) => x.id === f.elevenVoiceId);
      // Sinematik Belgesel ses seçilmemişse motorun varsayılan anlatıcısını kullanır.
      if (!v && isDocu(f) && !f.elevenVoiceId) return "Brian (varsayılan)";
      return v ? v.name : (state.elevenVoicesError ? "liste alınamadı" : "yükleniyor…");
    }
    return (p.voices[f.voiceId]?.name || "—").split(" — ")[0];
  }
  /**
   * Ses listesi — açılır liste yerine tek tek dinlenebilen satırlar.
   * Açılır listede sesi duymak için önce seçmek gerekiyordu; burada seçmeden dinlenir.
   */
  function voiceBlock() {
    let satirlar;
    if (useEleven()) {
      // Hata kutusu yalnızca ElevenLabs listesi gösterilirken: Sinematik Belgesel'de alınamayan
      // liste, Edge sesli diğer modlarda ses seçimini gizlemesin.
      if (state.elevenVoicesError) {
        return `<div class="quota bad"><b>ElevenLabs ses listesi alınamadı:</b> ${esc(state.elevenVoicesError)}
          <button class="btn tiny" id="fVoiceRetry" style="margin-left:8px">Tekrar dene</button></div>`;
      }
      const list = state.elevenVoices || [];
      if (!list.length) return `<div class="hint">ElevenLabs sesleri yükleniyor…</div>`;
      // Every voice can be heard reading the same documentary line, performed by the voice director, on v3 and on v4.
      const lang = f.language === "en" ? "en" : "tr";
      // v4-verified voices first — the account's, then the library's — and the v2-era premades last
      // (they read on v4 but were never tuned for it).
      // The channel's own voice (Voice Design / clone) leads, named by its channel: "🏛 Tarih kanalının sesi".
      const mine = (v) => ({
        deger: "el:" + v.id,
        secili: f.elevenVoiceId === v.id,
        ad: v.channel ? `${CHANNEL_VOICE_TR[v.channel]} kanalının sesi — ${v.name.split(" · ").pop()}` : v.name.split(" - ")[0],
        alt: [
          v.own ? "sana özel ses · başka hiçbir kanalda yok" : v.v4 ? "v4 sesi" : "Brian · kanalın anlatıcısı",
          v.own ? "v4" : v.labels?.accent, v.own ? "" : v.labels?.description,
        ].filter(Boolean).join(" · "),
        onizleme: v.preview || "",
        v4: `/api/eleven-sample/${v.id}?model=eleven_v4&lang=${lang}`,
      });
      const lib = (state.elevenLibrary || []).filter((v) => !v.labels?.language || v.labels.language.startsWith(lang)).map((v) => ({
        deger: "lib:" + v.id,
        secili: false,
        ad: v.name.split(" - ")[0],
        alt: ["v4 sesi · kütüphane (seçince hesaba eklenir)", v.labels?.accent, v.labels?.description, v.uses ? `${Math.round(v.uses / 1000)}B kullanım` : "",
          v.uses >= COMMON_VOICE_USES ? "⚠ çok yaygın: birçok kanal bu sesi kullanıyor" : ""].filter(Boolean).join(" · "),
        onizleme: v.preview || "",
      }));
      satirlar = [...list.filter((v) => v.v4).map(mine), ...lib, ...list.filter((v) => !v.v4).map(mine)];
    } else {
      satirlar = edgeVoices().map(([id, v]) => ({
        deger: id,
        secili: f.voiceId === id,
        ad: v.name.split(" — ")[0],
        alt: v.name.split(" — ")[1] || "",
        onizleme: `/api/voice-preview/${id}`,
      }));
    }
    return `
      <div class="voice-list" id="fVoiceList">
        ${satirlar.map((s) => `
          <div class="voice ${s.secili ? "sel" : ""}" data-voice="${esc(s.deger)}">
            <span class="voice-tik">${s.secili ? "✓" : ""}</span>
            <span class="voice-ad">${esc(s.ad)}${s.alt ? `<small>${esc(s.alt)}</small>` : ""}</span>
            <button type="button" class="voice-play" data-play-voice="${esc(s.onizleme)}" data-label="▶"
                    title="Bu sesi dinle">▶</button>
            ${s.v4 ? `<button type="button" class="voice-play" data-play-voice="${esc(s.v4)}" data-label="v4" title="Bir belgesel cümlesi, ses yönetmeninin tonlamasıyla, Eleven v4">v4</button>` : ""}
          </div>`).join("")}
      </div>
      ${voiceQuotaNote(f, p)}`;
  }
  function collageHint() {
    if (!state.settings.dryRun && !genProviderReady(f))
      return "<b style='color:var(--warn)'>Sağlayıcı anahtarı eksik</b> — bu mod için gerekli görsel/video sağlayıcısını Ayarlar'dan tamamlayın.";
    // Animasyon adımı sağlayıcıya bağlı ve her zaman açık olmuyor; üretilemezse
    // sahne durağan kareye düşüyor (iş durmuyor) ve klip ücreti alınmıyor.
    // Bunu önceden söylemek, "hareketli olacak sandım" sürprizini önlüyor.
    const anim = state.form.collageMode !== "kapali"
      ? " Animasyon sağlayıcıda kullanılamıyorsa sahne <b>durağan kareye düşer</b> ve klip ücreti alınmaz."
      : "";
    return (state.settings.dryRun
      ? "🧪 <b>Dry-run açık</b> — üretim yerel yer tutucularla yapılır, ücret yok. Gerçek üretim için Ayarlar'dan Dry-run'ı kapatın."
      : "Ücretli adımdan önce maliyet dökümü gösterilip onayınız istenecek.") + anim;
  }
  /**
   * AI GÖRSEL SAYISI — elle yazılır.
   *
   * Eskiden iki ayrı ayar ve sabit seçenekler vardı (3/5/8/12). Kullanıcı
   * "aynı şeyi iki yerde soruyor" dedi, haklıydı: ikisi de aynı soruyu
   * soruyordu. Tek kutu, istediğin sayıyı yaz. Hazır düğmeler yanında dursun
   * ki tek tıkla da seçilebilsin.
   */
  function aiSayiKutusu(f) {
    if(f.aiSupport==='auto')return `<label class="field-label" for="fAiSupportBudget">TAHMİNİ AI ÜRETİM BÜTÇESİ (USD)</label><input type="number" id="fAiSupportBudget" min="0" max="10000" step="1" value="${Number(f.aiSupportBudgetUsd??20)}" /><div class="hint">Görsel sayısı belirlemezsin. Editör sahneye göre görsel veya video seçer. Bu tahmini rezerv sınırıdır; sağlayıcı faturası farklı olabilir. 0, yeni AI üretimine bütçe ayırmaz.</div>`;
    if(f.aiSupport==='off')return 'AI üretimi kapalı; arşiv kaynakları kullanılır.';
    const v = Math.max(0, Math.min(30, parseInt(f.aiButce ?? f.aiClips ?? 0) || 0));
    const hazir = [0, 3, 5, 10, 15, 20]
      .map((n) => `<button type="button" class="aihaz ${n === v ? "sel" : ""}" data-aihaz="${n}">${n === 0 ? "Yok" : n}</button>`)
      .join("");
    return `<div class="ai-sayi">
      <input type="number" id="fAiButce" min="0" max="30" step="1" value="${v}" inputmode="numeric" />
      <span class="ai-sayi-et">görsel · en fazla <b>$${(v * 0.04 * 1.15).toFixed(2)}</b></span>
      <span class="ai-hazir">${hazir}</span>
    </div>`;
  }

  function aiHint() {
    if(f.aiSupport==='auto')return 'Alakasız veya eksik kaynakları düzeltir; AI ile daha iyi anlatılacak canlandırmaları seçer. İyi arşivi korur. Her sonuç anlatımla denetlenir; doğrulanamayan sahne varsa final durdurulur. Görsel ve video erişimi seçili sağlayıcının anahtarına ve kredisine bağlıdır.';
    if(f.aiSupport==='off')return '';
    if (productionMode(f) === 'mixed') return 'Yalnızca arşivin karşılayamadığı sahneler AI ile tamamlanır. 0 seçersen AI kullanılmaz. Bu sayı toplam görsel üst sınırıdır.';
    return `<b>Senaryo yazılırken</b> planlanır: gerçek görüntüsü <b>olmayan</b> anlar için
      (tarihi canlandırma, soyut kavram, imkânsız kamera açısı).
      Nereye koyacağını senaryo modeli seçer, gerisi arşiv görüntüsüyle dolar.
      <i>Tek bütçe: bir kısmını senaryo planlar, kalanı arşivin çuvalladığı sahnelere gider. Toplam bu sayıyı aşmaz — arşiv yeterse hiç harcanmaz.</i>
      Üretilen şey <b>durağan görsel</b>; montajda yumuşak zoom alır. Görsel başı ~$0,05.${
        imgProviderReady() ? "" : " <b style='color:var(--warn)'>Sağlayıcı anahtarı yok — Ayarlar'dan ekleyin, yoksa bu adım atlanır.</b>"}`;
  }

  // ---------- panel gövdeleri ----------
  function panelBody(id, wide) {
    switch (id) {
      case "theme":
        return sec("TEMA", cards(p.themes, f.theme, "fThemes"), "", wide);
      case "visual":
        // Rozet etiketten ÖNCE çiziliyor ve küçük — uzun açıklama oraya sığmıyor,
        // kısa platform adı konur, ayrıntı ipucu satırında verilir.
        return sec("EN-BOY ORANI", chips(
            Object.entries(p.ratios || {}).map(([k, v]) => [k, `${v.ad} ${k}`, RATIO_ROZET[k] || ""]),
            f.ratio || "16:9", "fRatio"),
            "Dikey ve karede alt bant platform arayüzüne bırakılır; öğeler oraya konmaz.") +
          (productionMode(f) === 'director'
            ? sec("AI YÖNETMEN", `<b>Editoryal görsel dil · otomatik AI desteği · otomatik kaynak seçimi</b>${aiSayiKutusu(f)}`,
                "AI Yönetmen bu üç ayarı sahne bazlı yönetir. Başka bir görsel dil veya elle seçim için önce farklı bir üretim modu seç.", wide)
            : sec("GÖRSEL DİL", cards(p.visualStyles, f.visualStyle, "fStyles"), "", wide) +
          // Kinetik yazıyı yalnızca hareket yolu çiziyor (sinema + hareketli kolaj).
          // Bayrağa bakılıyor, isme değil — yeni bir dil eklenirse kendiliğinden gelsin.
          (p.visualStyles?.[f.visualStyle]?.hareket === true
            ? sec("EKRANDAKİ YAZI", chips([
                ["vurgu", "✨ Sadece vurgu"],
                ["obek", "Öbek öbek"],
                ["kelime", "Kelime kelime"],
              ], f.yaziModu || "vurgu", "fYazi"),
              "Anlatıcı zaten konuşuyor — ekrana onun kopyasını basmak dikkati böler. " +
              "<b>Sadece vurgu</b> her sahnede tek bir sayıyı/kelimeyi büyük gösterir. " +
              "Öbek öbek anlamlı gruplar hâlinde, kelime kelime ise tek tek yazar.")
            : "") +
          (isGenerated(f)
            ? sec("KOLAJ ÜRETİM MODU", chips([
                ["kapali", "Kapalı — sadece kareler (ucuz)"],
                ["hibrit", "Hibrit — önerilen"],
                ["acik", "Açık — her sahne animasyonlu"],
              ], f.collageMode, "fCollage"), collageHint(), wide)
            : productionMode(f) === 'image' ? sec('SADECE GÖRSEL', 'Bu mod yalnızca arşiv fotoğrafları kullanır. AI bütçesi uygulanmaz.', '', wide)
            : sec("AI DESTEĞİ", chips([['auto','✨ Otomatik — sahneye göre'],['manual','Sayıyı ben seçeyim'],['off','Kapalı']],f.aiSupport||'manual','fAiSupport')+aiSayiKutusu(f), aiHint(), wide)));
      case "tone":  // p.tones değerleri DÜZ METİN (server.js:41 → v.name)
        return sec("TON", chips(Object.entries(p.tones).map(([k, v]) => [k, esc(v)]), f.tone, "fTones"));
      case "dur":
        return sec("SÜRE", chips(Object.entries(p.durations).map(([k, v]) => [k, esc(v.name), v.badge]),
          f.durationPreset, "fDur"),
          isDocu(f)
            ? "Sinematik Belgesel süreyi <b>en az</b> hedef olarak alır: senaryo ~%7 payla yazılır, bölüm kartları ve kapanış eklenir (10 dk → ~10,7-11 dk). Senaryo kısa kalırsa görsel ve ses parası harcanmadan durur."
            : "Hedef süredir; son uzunluk seslendirmeye göre değişebilir. Süre, senaryo maliyetini ve seslendirme karakter sayısını belirler.");
      case "voice":
        return sec("VİDEO DİLİ", chips([["tr", "🇹🇷 Türkçe"], ["en", "🇬🇧 İngilizce"]], f.language, "fLang")) +
          sec(`SES${useEleven() ? " · <span style='color:var(--accent2)'>ElevenLabs</span>" : ""}`, voiceBlock());
      case "subs":
        return sec("ALTYAZI", chips([["classic", "Klasik"], ["word", "Kelime kelime"], ["none", "Kapalı"]],
          f.subtitleMode, "fSubs"),
          "Kelime kelime altyazı kısa dikkat süreli izleyicide tutma oranını artırır.");
      case "prod":
        return sec("GEÇİŞLER", chips([
            ["sinematik", "🎞️ Sinematik"],
            ["sade", "Sade"],
            ["yok", "Sert kesme"],
          ], f.transitions || "sinematik", "fTrans"),
          "Kesmeler arası çözülme/kaydırma. Temaya göre seçilir; vurgu anlarında " +
          "kasten sert kesilir. Render süresini yaklaşık iki katına çıkarır.") +

          // GÖRSEL SEÇİM MODU buradan KALDIRILDI — artık ana ekranda "GÖRSELLER"
          // satırında duruyor (👁 Önce bana göster / ⚡ Sen hallet). Aynı ayarın
          // iki yerde olması hangisinin geçerli olduğunu belirsizleştiriyordu.
          sec("GÖRSEL İÇERİK DENETİMİ", chips([["1", "👁️ Açık — önerilen"], ["0", "Kapalı"]],
            f.gorselDenetim === false ? "0" : "1", "fGorselDenetim"),
            "İndirilen her fotoğrafa <b>bakılır</b> ve konuyla ilgisi ölçülür; " +
            "ilgisiz çıkanın yerine yenisi aranır. Bu olmadan alaka yalnızca sitenin " +
            "yazdığı başlıktan tahmin edilir ve o yolla doğru ile yanlış ayrılamıyor " +
            "(&quot;submersible&quot; etiketli bahçe pompası, &quot;kathy&quot; etiketli kedi). " +
            "Küçük model kullanılır, iş başına birkaç kuruş.") +
          sec("ARAŞTIRMA", chips([["1", "🌐 Web araması açık"], ["0", "Model bilgisiyle"]],
            f.useWebSearch ? "1" : "0", "fWeb"),
            "Web araması güncel konularda doğruluğu artırır (küçük ek maliyet).");
      case "all":
        return (isDocu(f) ? DOCU_PANELS : PANEL_ORDER).map((k) => panelBody(k, k === "theme" || k === "visual")).join("");
      default: return "";
    }
  }

  // ---------- tarif şeridi ----------
  // Şerit TEK SATIRDA kalmalı — ikinci satıra taşınca "kırık" görünüyor. Bu yüzden
  // değerler kısaltılır: parantez içi, " / " sonrası ve ses adının niteleyicileri atılır.
  const kisalt = (s) => String(s || "—")
    .replace(/\s*\(.*?\)\s*/g, "")   // "Varsayılan (tema sesi)" → "Varsayılan"
    .split(" / ")[0]                  // "Vox / Açıklayıcı" → "Vox"
    .split(" - ")[0]                  // "Bella - Professional, Bright" → "Bella"
    .split(" — ")[0]
    .trim() || "—";

  function recipeItems() {
    const vsName = kisalt(p.visualStyles?.[f.visualStyle]?.name);
    // "TEMA Vox · GÖRSEL Vox" ikilemesi hata gibi görünüyor — çakışırsa temayı
    // tam adıyla yaz ("Vox / Açıklayıcı"), böylece iki parça birbirinden ayrılır.
    const themeFull = String(p.themes[f.theme]?.name || "—").replace(/\s*\(.*?\)\s*/g, "").trim();
    const themeShort = kisalt(p.themes[f.theme]?.name);
    const themeName = themeShort === vsName ? themeFull : themeShort;
    const extra = isGenerated(f)
      ? (COLLAGE_LABEL[f.collageMode] || f.collageMode)
      : (productionMode(f)==='director' ? 'AI Yönetmen' : usesAutomaticEditor(f) ? 'otomatik AI desteği' : aiAllowance(f) ? `en fazla ${aiAllowance(f)} AI` : "");
    const genWarn = productionWarnings(f).length > 0;
    // Sinematik Belgesel temayı, görsel dili, altyazıyı ve geçişleri kendi stilinden alır —
    // bu çipler orada hiçbir şey değiştirmiyordu, sadece kalabalık yapıyordu.
    if (isDocu(f)) return [
      ["tone",  kisalt(p.tones[f.tone]), false],
      ["dur",   p.durations[f.durationPreset]?.badge || "—", false],
      ["voice", `${f.language === "tr" ? "TR" : "EN"} · ${kisalt(voiceLabel())}`, !voiceQuotaFits(f, p)],
    ];
    return [
      ["theme",  themeName, false],
      // Oran görsel dilin ayrılmaz parçası — ayrı chip şeride sığmıyor, buraya katıldı
      ["visual", (f.ratio && f.ratio !== "16:9" ? f.ratio + " " : "") + vsName + (extra ? ` + ${extra}` : ""), genWarn],
      ["tone",   kisalt(p.tones[f.tone]), false],
      ["dur",    p.durations[f.durationPreset]?.badge || "—", false],
      ["voice",  `${f.language === "tr" ? "TR" : "EN"} · ${kisalt(voiceLabel())}`, !voiceQuotaFits(f, p)],
      ["subs",   SUBS_LABEL[f.subtitleMode] || "—", false],
      // Geçiş ayrı bir chip olarak sığmıyor (şerit 1280px'de zaten taşıyor) —
      // görsel etkisi en yüksek ayar olduğu için ÜRETİM chip'inin başına alındı.
      ["prod",   TRANS_LABEL[f.transitions || "sinematik"] +
                 (f.useWebSearch ? " · web" : " · websiz") +
                 (f.mediaMode === "manual" ? " · elle" : ""), false],
    ];
  }
  // Ana ekrandaki üç üretim modu. Kullanıcının kafasındaki soru bu: videoda ne olsun?
  // visualStyle (kesme temposu) ile karıştırılmasın diye ayrı bir alan.
  // Ana ekrandaki üretim modları.
  //
  // Dört tanesi `mediaKind` (medya NEREDEN gelir), Kolaj ise `visualStyle`
  // ayarlıyor — ayrı bir üretim hattı. Kullanıcı bu ayrımı bilmek zorunda
  // kalmasın diye hepsi tek satırda; hangisinin video hangisinin görsel
  // getirdiği `etiket` ile açıkça yazıyor.
  const MODES = [
    { k: "image", ikon: "🖼", ad: "Sadece görsel", etiket: "FOTOĞRAF", kisa: "Arşiv fotoğrafları, kamera hareketiyle", uygula: { mediaKind: "image" },
      alt: "Yalnızca arşiv fotoğrafı. Kurgu stiline uygun kamera ve geçişler. AI üretimi ve kaynak video yok." },
    { k: "mixed", ikon: "🎬", ad: "Normal", etiket: "VİDEO + FOTOĞRAF", kisa: "Arşiv video + fotoğraf", uygula: { mediaKind: "mixed" },
      alt: "Arşiv video + fotoğraf. AI bütçesi açıksa yalnızca arşivin yetmediği sahneler AI ile tamamlanır." },
    { k: "ai", ikon: "✨", ad: "AI görselli", etiket: "VİDEO + AI", kisa: "Arşiv + gerektiğinde AI sahne", uygula: { mediaKind: "ai" },
      alt: "Arşiv video + fotoğraf ve sahneye uygun AI desteği. Otomatik editör veya elle sahne sayısı seçilebilir." },
    { k: "director", ikon: "🎞️", ad: "AI Yönetmen", etiket: "SİNEMATİK KURGU", kisa: "Klip öncelikli sinematik kurgu", uygula: { mediaKind: "director" },
      alt: "İlgili video kliplerine öncelik verir; uzun fotoğraf dizilerini dengeler, eksik aksiyonu denetlenen AI videoyla tamamlar. Kurgu, müzik ve ölçülü yazı anlatıya uyar; tarihî belgeler korunur." },
    { k: "kolaj", ikon: "🎨", ad: "Kolaj", etiket: "AI ÜRETİMİ", kisa: "Kâğıt-kolaj AI kareleri", uygula: { visualStyle: "kolaj" },
      alt: "Arşiv hiç kullanılmaz. Her sahne kâğıt-kolaj karesi; ilk kare çapa olur, hepsi aynı dilde durur." },
    { k: "fullai", ikon: "🤖", ad: "Tam AI", etiket: "AI ÜRETİMİ", kisa: "Her sahne fotogerçekçi AI", uygula: { mediaKind: "fullai" },
      alt: "Kolajla aynı hat, fotogerçekçi sinema dili. Her sahne üretilir. En pahalısı." },
    { k: "docu", ikon: "🎥", ad: "Sinematik Belgesel", etiket: "MAGNATES TARZI", uygula: { mediaKind: "docu" },
      alt: "Vuruşa kesilen soğuk açılış, tutarlı karakterler, kişinin arkasına geçen yazılar, duyguya göre bestelenen müzik, fısıltıdan dramatiğe tonlamalı anlatım, sahneye özel ortam sesleri. ElevenLabs + OpenAI (GPT Image) ister; Replicate isteğe bağlı (derinlik katmanları)." },
  ];

  /** Kolaj alt modları — kare mi, hareketli mi. Fiyat farkı buradan çıkıyor. */
  const KOLAJ_MODLARI = [
    { k: "kapali", ad: "Sadece kare", hareket: false },
    { k: "hibrit", ad: "Hibrit", hareket: "kismi" },
    { k: "acik", ad: "Hareketli", hareket: true },
  ];
  const KOLAJ_KARE = 0.04 * 1.15;   // keyframe başına
  const KOLAJ_KLIP = 0.30 * 1.15;   // animasyon başına

  /** Kolaj sahne sayısı: 1 beat ≈ 1 cümle ≈ 3,5 sn */
  const kolajSahne = () => Math.round(((p.durations[f.durationPreset]?.minutes || 8) * 60) / 3.5);

  function kolajMaliyet(mod) {
    const n = kolajSahne();
    return n * KOLAJ_KARE + animationCount(n,mod) * KOLAJ_KLIP;
  }

  /** Sinematik Belgesel kurgu stilleri — kimlikler docu-engine/src/genres.ts ile aynı. */
  const DOCU_STILLER = [
    ["", "✨ Otomatik", "hikâyeye göre Claude seçer"],
    ["documentary", "Belgesel", "sıcak arşiv, marka/insan hikâyesi"],
    ["crime", "Suç / Gizem", "soğuk mavi, delil kartları, daktilo"],
    ["epic", "Epik Tarih", "bronz-altın, savaş davulları, koro"],
    ["science", "Bilim / Uzay", "lacivert-camgöbeği, ambient synth"],
    ["inspire", "Biyografi / İlham", "sıcak ışık, piyano ve yaylılar"],
    ["finance", "Finans", "yeşil-siyah veri gerilimi"],
    ["horror", "Korku", "karanlık, kan kırmızısı"],
    // Bir format: geri sayım (N'den 1'e), sıra kartları; görsel/ses dilini konuya göre Claude seçer.
    ["ranking", "Sıralama", "geri sayım: 10'dan 1'e maddeler, dev sıra kartları; görsel dili konuya göre seçilir"],
    // Bir format: son 1-3 günün büyük, kafa karıştıran olayı — web araştırması, iddialar kaynağıyla, telifli haber görüntüsü yok.
    ["news", "Gündem", "son günlerin büyük olayı: doğrulanan ve iddia edilen ayrı, kaynaklı; web araştırmalı"],
  ];
  /** The ranking chip is a format, the others a style: one or the other is lit. */
  const FORMATS = ["ranking", "news"];
  const stilSecili = (k) => (FORMATS.includes(k) ? f.docuFormat === k : !FORMATS.includes(f.docuFormat) && (f.docuGenre || "") === k);
  /** Yüklü hazır senaryo varsa tahminler onun sahnelerinden yapılır, süre ayarından değil. */
  const docuHazir = () => (f.docuScript?.scenes?.length ? f.docuScript.scenes : null);
  /** Sinematik Belgesel: ~9 kelime/sahne, 120 kelime/dk (docu-script.js DOCU_WPM ile aynı). */
  const docuSahne = () => docuHazir()?.length
    ?? Math.max(8, Math.round(((p.durations[f.durationPreset]?.minutes || 8) * (f.language === "en" ? 140 : 120)) / 9));
  /** Arşivde aranacak sahne sayısı (docu-archive.js ARCHIVE_TYPES ile aynı türler). */
  const docuArsivSahne = () => {
    if (f.docuSource === "ai") return 0;
    const hazir = docuHazir();
    if (hazir) return hazir.filter((s) => s.source === "archive" && s.search && ["photo", "title", "words", "slam"].includes(s.type)).length;
    return Math.round(docuSahne() * 0.7);
  };
  // Ölçüldü (GPT Image 2, orta kalite): görsel $0,042, referanslı karakter sahnesi $0,054.
  // Arşiv sahnesi: ücretsiz fotoğraf + görme denetimi (~$0,01/sahne, gpt-4.1); bulunamazsa AI'a düşer.
  const docuMaliyet = () => {
    const arsiv = docuArsivSahne();
    const aiGorsel = (docuSahne() - arsiv) + (docuHazir() ? docuHazir().reduce((n, s) => n + (s.imagePrompts?.length || 0), 0) : 6);
    return aiGorsel * 0.048 + arsiv * 0.01 + 0.1;
  };

  /** Ekranda hangi kutu seçili görünecek. Kolaj mediaKind değil, visualStyle. */
  const aktifMod = () => productionMode(f);

  /** AI sahne başı ortalama maliyet (keyframe + animasyon + yeniden üretim payı). */
  // AI sahne artık DURAĞAN GÖRSEL: kare $0,04. Animasyon ($0,30) sağlayıcıda
  // kullanılabilir video modeli olmadığı için varsayılan dışı bırakıldı.
  const AI_SAHNE = 0.04 * 1.15;

  /** Boşluk doldurma sadece stok tabanlı modlarda anlamlı. */
  // Tek bütçe: mod fark etmeksizin kullanıcının yazdığı sayı geçerli.
  const aiFillEtkin = () => aiAllowance(f);

  function paintModes() {
    const kutu = $("#fModes");
    if (!kutu) return;
    const cur = aktifMod();
    // Hero, seçili modun rengine bürünür (Sinematik Belgesel: amber-kızıl).
    $("#fHero")?.setAttribute("data-mode", cur);
    const kartlar = MODES.filter((m) => m.k !== "docu").map((m) => {
      const sec = cur === m.k;
      let ek = "";
      if (sec && m.k === "mixed" && aiFillEtkin() > 0)
        ek = `<span class="mode-ek">gerekirse ≤${aiFillEtkin()} sahne</span>`;
      if (sec && m.k === "ai")
        ek = `<span class="mode-ek">en fazla ${aiAllowance(f)} sahne · ~$${(aiAllowance(f) * AI_SAHNE).toFixed(2)}</span>`;
      if(sec&&m.k!=='director'&&usesAutomaticEditor(f))ek='<span class="mode-ek">otomatik AI görsel + video desteği</span>';
      if(sec&&m.k==='director')ek='<span class="mode-ek">sahneye göre arşiv + gerektiğinde AI</span>';
      if (sec && m.k === "fullai")
        ek = `<span class="mode-ek">~$${kolajMaliyet(f.collageMode || 'hibrit').toFixed(2)}</span>`;
      if (sec && m.k === "kolaj")
        ek = `<span class="mode-ek">~$${kolajMaliyet(f.collageMode || "hibrit").toFixed(2)}</span>`;
      if (sec && m.k === "docu")
        ek = `<span class="mode-ek">~${docuSahne()} sahne · görseller ~$${docuMaliyet().toFixed(2)}</span>`;
      return `<button type="button" class="mode ${sec ? "sel" : ""}" data-mode="${m.k}" title="${esc(m.alt)}">
        <span class="mode-ikon">${m.ikon}</span>
        <span class="mode-ad">${m.ad}</span>
        <span class="mode-kisa">${sec && ek ? ek : m.kisa}</span>
      </button>`;
    }).join("");
    const docuSec = cur === "docu";
    // Vitrin kartı: Nova'nın en güçlü üretimi ayrı renkte, ayrı ağırlıkta durur.
    const vitrin = `<button type="button" class="feature-card ${docuSec ? "sel" : ""}" data-mode="docu">
      <span class="fc-art" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="fc-top"><span class="fc-badge">YENİ · YOUTUBE BELGESELİ</span><span class="fc-state">${docuSec ? "✓ Seçili" : "Seç"}</span></span>
      <span class="fc-title">Sinematik Belgesel</span>
      <span class="fc-desc">Gerçek arşiv fotoğrafları, tutarlı karakterler, duyguya göre bestelenen müzik ve fısıltıdan dramatiğe tonlamalı anlatım. YouTube'a hazır belgesel kurgusu.</span>
      <span class="fc-tags"><span>Vuruşa kesilen açılış</span><span>Arşiv + GPT Image</span><span>7 kurgu stili</span><span>ElevenLabs v3</span></span>
      <span class="fc-meta">~${docuSahne()} sahne · görseller ~$${docuMaliyet().toFixed(2)}</span>
    </button>`;
    const secMode = MODES.find((m) => m.k === cur && m.k !== "docu");
    const modAciklama = secMode ? `<div class="mode-desc"><b>${secMode.ad}:</b> ${secMode.alt}</div>` : "";

    // Kolaj seçiliyken alt modu HEMEN ALTTA göster — asıl fiyat farkı burada,
    // panele girmeden görünmesi gerekiyor.
    let altSatir = "";
    if (isGenerated(f)) {
      const secili = f.collageMode || "hibrit";
      altSatir = `<div class="mode-alt-satir">
        <span class="mode-alt-baslik">${cur === 'kolaj' ? 'KOLAJ' : 'TAM AI'}</span>
        ${KOLAJ_MODLARI.map((km) => `
          <button type="button" class="kchip ${km.k === secili ? "sel" : ""}" data-kolaj="${km.k}">
            <b>${km.ad}</b>
            <small>${km.hareket === true ? "her sahne oynar" : km.hareket === "kismi" ? "bazı sahneler oynar" : "durağan kare + zoom"}</small>
            <em>~$${kolajMaliyet(km.k).toFixed(2)}</em>
          </button>`).join("")}
      </div>`;
    }
    // GÖRSEL ONAYI ana ekranda durur — "Tüm ayarlar"ın içinde gömülüyken kimse
    // bulamıyordu. Üretimin en kritik kararı bu: senaryo yazıldıktan sonra
    // durup görselleri gösterir, onaylanınca render başlar.
    const onay = f.mediaMode === "manual";
    const onaySatir = `<div class="mode-alt-satir">
      <span class="mode-alt-baslik">GÖRSELLER</span>
      <button type="button" class="kchip ${onay ? "sel" : ""}" data-onay="manual">
        <b>👁 Önce bana göster</b>
        <small>senaryo hazır olunca durur, arşiv adaylarını gösterir</small>
        <em>onaydan sonra indirme ve varsa AI üretimi başlar</em>
      </button>
      <button type="button" class="kchip ${onay ? "" : "sel"}" data-onay="auto">
        <b>⚡ Sen hallet</b>
        <small>durmadan üretir</small>
        <em>en hızlı</em>
      </button>
    </div>`;
    const generatedNote = '<div class="mode-alt-satir">AI üretiminden önce maliyet onayı istenir. Üretim sonrası görselleri editörde inceleyebilirsin. Dry-run yalnızca denemedir.</div>';
    const directorNote = '<div class="mode-alt-satir"><b>AI Yönetmen:</b> kaynakları otomatik önerir. Önce bana göster seçilirse klipleri üretimden önce değiştirebilirsin; seçtiğin klip denetimden geçmezse iş durur.</div>';
    const hazir = f.docuScript?.scenes?.length;
    const seg = (label, items) => `<div class="opt-row"><span class="opt-label">${label}</span><div class="seg">${items}</div></div>`;
    const docuNote = `<div class="docu-opts">
      ${seg("Senaryo", `
        <button type="button" class="seg-btn ${hazir ? "" : "sel"}" data-docu="yaz"><b>Konudan yaz</b><small>araştırma + kurgu otomatik</small></button>
        <button type="button" class="seg-btn" data-docu="ornek"><b>Örnek video</b><small>vitrin senaryosu</small></button>
        <button type="button" class="seg-btn ${hazir ? "sel" : ""}" data-docu="yukle"><b>JSON yükle</b><small>${hazir ? `${esc(f.docuScript.title || "adsız")} · ${hazir} sahne` : "hazır sahne senaryosu"}</small></button>
        <input type="file" id="fDocuFile" accept=".json,application/json" hidden />`)}
      ${seg("Görseller", `
        <button type="button" class="seg-btn ${(f.docuSource || "archive") === "archive" ? "sel" : ""}" data-kaynak="archive"><b>Arşiv ağırlıklı</b><small>gerçek fotoğraf, eksikler AI</small></button>
        <button type="button" class="seg-btn ${f.docuSource === "ai" ? "sel" : ""}" data-kaynak="ai"><b>Sadece AI</b><small>efsane, fotoğraf öncesi dönem</small></button>`)}
      <div class="opt-row"><span class="opt-label">Stil</span><div class="style-grid">${DOCU_STILLER.map(([k, ad, alt]) => `<button type="button" class="style-chip ${stilSecili(k) ? "sel" : ""}" data-stil="${k}" title="${esc(alt)}"><span class="sw sw-${k || "auto"}"></span>${ad.replace(/^✨ /, "")}${kanalSesEtiketi(k)}</button>`).join("")}</div></div>
      ${stilSecili("epic") ? seg("Tarih sekmesi", `
        <button type="button" class="seg-btn ${f.docuMapMode === "haritali" ? "" : "sel"}" data-harita="klasik"><b>Klasik</b><small>harita yalnızca yer hikâyenin parçasıysa</small></button>
        <button type="button" class="seg-btn ${f.docuMapMode === "haritali" ? "sel" : ""}" data-harita="haritali"><b>🗺 Haritalı anlatım <span class="new-badge">SON GÜNCELLEME</span></b><small>her yer dünya haritasında: ülke boyanır, rota çizilir; videoda 3-5 harita</small></button>`) : ""}
      <div class="opt-row"><span class="opt-label">Seri</span><div class="seg"><input type="text" id="fDocuSeries" maxlength="90" placeholder="isteğe bağlı · örn. Myths That Turned Out To Be True" value="${esc(f.docuSeries || "")}" style="flex:1;min-width:0" /><small class="muted" style="align-self:center">tek başlık şablonu, her videoda yeni bölüm <span class="new-badge">SON GÜNCELLEME</span></small></div></div>
      <p class="docu-foot">Görseller önce arşivden, eksikler GPT Image ile · anlatım ElevenLabs v3 · ${(state.settings.docuMusicSource || "library") === "eleven" ? "müzik ElevenLabs bestesi" : "müzik ve efektler lisanslı ses kütüphanesinden"}${state.settings.audioLibrary && !state.settings.audioLibrary.ready ? ' <b style="color:var(--warn)">(kütüphane bulunamadı — ElevenLabs\'e düşer)</b>' : ""} · 16:9 video + .srt altyazı</p>
    </div>`;
    kutu.innerHTML = `
      <div class="step-label"><span class="step-no">2</span>Video türü</div>
      ${vitrin}
      <div class="modes-sub">veya klasik modlar</div>
      <div class="modes-grid">${kartlar}</div>
      ${modAciklama}${altSatir}${isDocu(f) ? docuNote : isGenerated(f) ? generatedNote : (productionMode(f)==='director' ? directorNote : '')+onaySatir}`;

    kutu.querySelector("#fDocuSeries")?.addEventListener("input", (e) => {
      const v = e.target.value.trim();
      if (v) state.form.docuSeries = v; else delete state.form.docuSeries;
    });
    kutu.querySelectorAll("[data-harita]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.harita === "haritali") state.form.docuMapMode = "haritali";
      else delete state.form.docuMapMode;
      refresh();
    }));
    kutu.querySelectorAll("[data-kaynak]").forEach((b) => b.addEventListener("click", () => {
      state.form.docuSource = b.dataset.kaynak;
      refresh();
    }));
    kutu.querySelectorAll("[data-stil]").forEach((b) => b.addEventListener("click", () => {
      if (["ranking", "news"].includes(b.dataset.stil)) { state.form.docuFormat = b.dataset.stil; delete state.form.docuGenre; }
      else {
        delete state.form.docuFormat;
        if (b.dataset.stil) state.form.docuGenre = b.dataset.stil; else delete state.form.docuGenre;
      }
      // Haritalı anlatım Epik Tarih'in sekmesi: başka stile geçince kapanır.
      if (b.dataset.stil !== "epic") delete state.form.docuMapMode;
      // Kanalın sesi: stil seçilince ayarlardaki sesi (tarih Brian, gündem David, finans Michael) — hesapta varsa.
      const kanalSesi = state.settings?.docuStyleVoices?.[b.dataset.stil];
      if (kanalSesi && (state.elevenVoices || []).some((v) => v.id === kanalSesi)) state.form.elevenVoiceId = kanalSesi;
      refresh();
    }));
    kutu.querySelectorAll("[data-docu]").forEach((b) => b.addEventListener("click", async () => {
      const ne = b.dataset.docu;
      if (ne === "yaz") { delete state.form.docuScript; return refresh(); }
      if (ne === "yukle") return $("#fDocuFile").click();
      try {
        const d = await api("/api/docu/sample");
        state.form.docuScript = d;
        if (!state.form.topic?.trim()) state.form.topic = d.title || "Sinematik belgesel";
        $("#fTopic").value = state.form.topic;
        toast("Örnek senaryo yüklendi — Üret'e bas");
      } catch (e) { toast(e.message, true); }
      refresh();
    }));
    $("#fDocuFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!Array.isArray(d?.scenes) || !d.scenes.length) throw new Error("Bu dosyada sahne (scenes) yok");
        state.form.docuScript = d;
        if (!state.form.topic?.trim()) state.form.topic = d.title || file.name.replace(/\.json$/i, "");
        $("#fTopic").value = state.form.topic;
        toast(`Senaryo yüklendi: ${d.scenes.length} sahne`);
      } catch (err) { toast("Senaryo okunamadı: " + err.message, true); }
      refresh();
    });
    kutu.querySelectorAll("[data-onay]").forEach((b) =>
      b.addEventListener("click", () => { setProductionPreference(state.form,'mediaMode',b.dataset.onay); refresh(); }));

    kutu.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => {
        const m = MODES.find((x) => x.k === b.dataset.mode);
        if (!m) return;
        // Kolaj visualStyle, diğerleri mediaKind ayarlıyor — kutudan çıkarken
        // eski değerin takılı kalmaması için ikisi de tutarlı hale getirilir.
        selectProductionMode(state.form,m.k);
        // Sinematik Belgesel ElevenLabs sesleriyle çalışır: liste henüz yüklenmediyse formu yeniden kur (yükleme orada başlar).
        if (m.k === "docu" && state.settings.hasElevenKey && !state.elevenVoices && !state.elevenVoicesError) {
          saveFormInputs();   // yeniden çizim yoğunluk/ses/bütçe kutularındaki kaydedilmemiş değerleri silmesin
          return renderForm(main);
        }
        refresh();
      }));
    kutu.querySelectorAll("[data-kolaj]").forEach((b) =>
      b.addEventListener("click", () => { state.form.collageMode = b.dataset.kolaj; refresh(); }));
  }

  /** Tam-AI modunda kaç sahne üretileceğinin kaba tahmini (süreye bağlı). */
  function tahminiSahne() {
    const dk = p.durations[f.durationPreset]?.minutes || 8;
    return Math.round((dk * 60) / 5.5); // ~5,5 sn'lik sahneler
  }

  function paintTint() {
    $("#fHero").style.setProperty("--tint", isDocu(f) ? "#f5a524" : (THEME_TINT[f.theme] || "#22d3ee"));
  }
  function paintRecipe() {
    const changed = Object.keys(FORM_DEFAULTS).some((k) => f[k] !== FORM_DEFAULTS[k]);
    $("#fRecipe").innerHTML =
      `<span class="recipe-label">TARİF</span>` +
      recipeItems().map(([id, val, warn]) => `
        <button type="button" class="rcp${state.openPanel === id ? " open" : ""}${warn ? " warn" : ""}"
                data-panel="${id}" title="${esc(PANELS[id].t)} — ${esc(PANELS[id].s)}">
          <span class="rcp-k">${PANELS[id].k}</span><span class="rcp-v">${esc(val)}</span>
        </button>`).join("") +
      (changed ? `<button type="button" class="rcp rcp-reset" data-panel="reset"
                    title="Tüm ayarları varsayılana döndür">↺ Sıfırla</button>` : "") +
      `<button type="button" class="rcp rcp-all${state.openPanel === "all" ? " open" : ""}"
               data-panel="all">Tüm ayarlar ▾</button>`;
  }
  function paintPanel() {
    const box = $("#fPanel");
    // Belgesele geçince açık kalmış tema/altyazı paneli orada işe yaramaz — kapat.
    if (isDocu(f) && state.openPanel && state.openPanel !== "all" && !DOCU_PANELS.includes(state.openPanel)) state.openPanel = null;
    const id = state.openPanel;
    if (!id) { box.hidden = true; box.innerHTML = ""; return; }
    const all = id === "all";
    box.hidden = false;
    box.innerHTML = `
      <div class="panel-head">
        <div><b>${all ? "Tüm ayarlar" : esc(PANELS[id].t)}</b>
          <span class="panel-sub">${all ? (isDocu(f) ? "Ton, süre ve ses — gerisini belgesel stili belirler" : "Yedi grubun tamamı tek blokta") : esc(PANELS[id].s)}</span></div>
        <button class="icon-btn" id="fPanelClose" title="Kapat (Esc)">✕</button>
      </div>
      <div class="panel-body${all ? " cols" : ""}">${panelBody(id)}</div>`;

    // Sadece çip içeren ve birden fazla bölümü olan paneller yan yana dizilir.
    // Yoksa iki minik çip grubu 900px'e yayılıp panel bomboş görünüyordu.
    // Kart (opt-grid) içeren paneller tam genişlik kalmalı — kartlar daralmasın.
    if (!all) {
      const gövde = box.querySelector(".panel-body");
      const bölümler = gövde.querySelectorAll(".panel-sec");
      if (bölümler.length > 1 && !gövde.querySelector(".opt-grid")) gövde.classList.add("split");
    }

    $("#fPanelClose").addEventListener("click", () => {
      state.openPanel = null; paintRecipe(); paintPanel();
    });
    bindPanel();
  }
  /** Panel KAPALIYKEN de görünmesi gereken her şey burada. */
  function paintNotes() {
    const out = [];
    if (!voiceQuotaFits(f, p)) out.push(voiceQuotaNote(f, p));
    productionWarnings(f).forEach((m) => out.push(`<div class="banner warn">${m}</div>`));
    $("#fNotes").innerHTML = out.join("");
  }
  function refresh() { paintTint(); paintModes(); paintRecipe(); paintPanel(); paintNotes(); paintRecent(); updateEstimate(); }

  function bindPanel() {
    const B = (sel, key, map = (x) => x, after) => {
      const el = $(sel); if (!el) return;
      el.addEventListener("click", (e) => {
        const c = e.target.closest("[data-k]"); if (!c) return;
        if (!setProductionPreference(state.form,key,map(c.dataset.k))) return;
        if (after) after();
        refresh();                                  // panel AÇIK kalır — karşılaştırma yapılabilsin
      });
    };
    B("#fThemes", "theme");
    // map için undefined geçilmeli — null varsayılanı devreye sokmaz ve map(...) patlar
    B("#fStyles", "visualStyle", undefined, () => {
      // Hareketli kolaj kesikleri fotoğraftan üretiyor — video modu anlamsız
      if (state.form.visualStyle === "hareket") selectProductionMode(state.form,"image");
    });
    B("#fYazi", "yaziModu");
    B("#fCollage", "collageMode");
    B('#fAiSupport','aiSupport');
    $('#fAiSupportBudget')?.addEventListener('change',e=>{state.form.aiSupportBudgetUsd=Math.max(0,Math.min(10000,Number(e.target.value)||0));refresh();});
    B("#fTones", "tone");
    B("#fLang", "language", (x) => x, edgeVoices);   // dil değişti → ses dili tutsun
    B("#fDur", "durationPreset");
    B("#fSubs", "subtitleMode");
    // #fMedia kaldırıldı — mediaMode artık ana ekrandaki [data-onay] satırından
    // ayarlanıyor (bkz. onaySatir).
    B("#fWeb", "useWebSearch", (x) => x === "1");
    B("#fGorselDenetim", "gorselDenetim", (x) => x === "1");
    // AI GÖRSEL SAYISI — elle yazılan kutu + hazır düğmeler, tek alan (aiButce).
    const aiKutu = $("#fAiButce");
    if (aiKutu) {
      const yaz = (n) => {
        const v = Math.max(0, Math.min(30, parseInt(n, 10) || 0));
        state.form.aiButce = v;
        // Eski alanlar geriye uyum için aynı değere çekiliyor; sunucu zaten
        // aiButce'yi öncelikli okuyor ama eski kayıtlar tutarsız kalmasın.
        state.form.aiClips = v;
        state.form.aiFill = v;
        paintRecipe(); paintNotes(); updateEstimate();
      };
      aiKutu.addEventListener("input", (e) => yaz(e.target.value));
      aiKutu.addEventListener("change", (e) => { yaz(e.target.value); paintPanel(); });
      aiKutu.closest(".ai-sayi")?.querySelectorAll("[data-aihaz]").forEach((b) =>
        b.addEventListener("click", () => { aiKutu.value = b.dataset.aihaz; yaz(b.dataset.aihaz); paintPanel(); }));
    }
    B("#fTrans", "transitions");
    B("#fRatio", "ratio");

    const liste = $("#fVoiceList");
    if (liste) {
      // Satıra tıkla = seç. Sadece işaretleri güncelle — tüm listeyi yeniden
      // çizersek çalan ses kesilir ve kaydırma konumu başa döner.
      liste.addEventListener("click", (e) => {
        if (e.target.closest("[data-play-voice]")) return; // ▶ ayrı ele alınır
        const satir = e.target.closest("[data-voice]");
        if (!satir) return;
        const v = satir.dataset.voice;
        // A library narrator: added to the user's ElevenLabs voices on this click, then selected.
        if (v.startsWith("lib:")) {
          const lib = (state.elevenLibrary || []).find((x) => x.id === v.slice(4));
          if (!lib) return;
          toast(`${lib.name.split(" - ")[0]} hesabına ekleniyor…`);
          api("/api/eleven-voices/add", { method: "POST", body: { voiceId: lib.id, publicOwnerId: lib.publicOwnerId, name: lib.name } })
            .then((r) => {
              state.form.elevenVoiceId = r.voiceId;
              state.elevenVoices = null;
              toast(`${lib.name.split(" - ")[0]} eklendi ve seçildi ✓`);
              renderForm(main);
            })
            .catch((err) => toast(`Ses eklenemedi: ${err.message || err}`, true));
          return;
        }
        if (v.startsWith("el:")) state.form.elevenVoiceId = v.slice(3);
        else state.form.voiceId = v;
        liste.querySelectorAll("[data-voice]").forEach((el) => {
          const bu = el === satir;
          el.classList.toggle("sel", bu);
          el.querySelector(".voice-tik").textContent = bu ? "✓" : "";
        });
        paintRecipe();
        paintNotes();
      });

      liste.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-play-voice]");
        if (!btn) return;
        e.stopPropagation();
        const src = btn.dataset.playVoice;
        if (!src) return toast("Bu ses için önizleme yok", true);
        // Aynı anda tek ses çalsın
        if (state.sesCalan) { try { state.sesCalan.pause(); } catch {} }
        liste.querySelectorAll(".voice-play").forEach((b) => (b.textContent = b.dataset.label || "▶"));
        const a = new Audio(src);
        state.sesCalan = a;
        const label = btn.dataset.label || "▶";
        // A v3/v4 sample is synthesised on first play (a few seconds).
        btn.textContent = label === "▶" ? "⏸" : "…";
        a.addEventListener("playing", () => { btn.textContent = "⏸"; });
        a.addEventListener("ended", () => { btn.textContent = label; });
        a.play().catch(() => { btn.textContent = label; toast("Ses önizleme başarısız", true); });
      });
    }
    $("#fVoiceRetry")?.addEventListener("click", () => {
      state.elevenVoicesError = null; state.elevenVoices = null; renderForm(main);
    });
  }

  // ---------- şerit tıklamaları (tek delege dinleyici) ----------
  $("#fRecipe").addEventListener("click", (e) => {
    const b = e.target.closest("[data-panel]"); if (!b) return;
    const id = b.dataset.panel;
    if (id === "reset") {
      Object.assign(state.form, FORM_DEFAULTS);
      edgeVoices();                                  // ↺ sonrası TR · Jenny gibi bozuk durum oluşmasın
      state.openPanel = null;
    } else {
      state.openPanel = state.openPanel === id ? null : id;
    }
    refresh();
  });

  // ---------- kahraman alanı ----------
  $("#fGuideBtn").addEventListener("click", () => {
    const w = $("#fGuideWrap");
    w.hidden = !w.hidden;
    $("#fGuideBtn").setAttribute("aria-expanded", String(!w.hidden));
    if (!w.hidden) $("#fGuidance").focus();
  });
  $("#fTopic").addEventListener("input", (e) => { state.form.topic = e.target.value; });
  $("#fGuidance").addEventListener("input", (e) => { state.form.guidance = e.target.value; });
  $("#fTopic").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); startJob(); }
  });
  $("#fGo").addEventListener("click", startJob);
  $("#fBackToJob")?.addEventListener("click", () => { state.showForm = false; render(); });

  // ---------- ElevenLabs ses listesi + kota (mantık aynı, tam çizim yerine kısmi) ----------
  if (useEleven() && !state.elevenVoices && !state.elevenVoicesError) {
    api("/api/eleven-voices").then((d) => {
      state.elevenVoices = d.voices || [];
      state.elevenLibrary = d.library || [];
      state.elevenQuota = d.quota || null;
      state.elevenBlocked = d.blocked || 0;
      state.elevenVoicesError = null;
      // Liste ilk kez geldiğinde: seçim yoksa videonun DİLİNE uyan ilk sesi al.
      // Eskiden körlemesine listenin ilki alınıyordu — İngilizce video için
      // Türkçe ses seçiliyordu (liste Türkçe seslerle başlıyor).
      if (state.elevenVoices.length && !state.form.elevenVoiceId && state.settings.ttsProvider === "eleven") {
        const dil = state.form.language === "en" ? "en" : "tr";
        const uygun = state.elevenVoices.filter((v) => (v.labels?.language || "").toLowerCase().startsWith(dil));
        state.form.elevenVoiceId = (uygun[0] || state.elevenVoices[0]).id;
      }
      if (state.page === "studio" && $("#fRecipe")) {
        // Kullanıcı tam o an ses listesini açtıysa select'i altından çekme
        paintRecipe(); paintNotes(); updateEstimate();
        if (state.openPanel === "voice") paintPanel();  // liste dolunca panel tazelensin
        // Stil düğmelerindeki kanal sesi adı (kanalSesEtiketi) liste gelince adıyla yazılsın.
        if (typeof paintModes === "function") { try { paintModes(); } catch {} }
      }
    }).catch((e) => {
      // Boş dizi "yüklendi ama boş" demek olurdu ve bir daha denenmezdi.
      state.elevenVoices = null;
      state.elevenVoicesError = e.message || "Ses listesi alınamadı";
      if (state.page === "studio" && $("#fRecipe")) { paintRecipe(); paintPanel(); paintNotes(); }
    });
  }

  state.formRefresh = refresh;   // modül düzeyindeki Esc dinleyicisi bunu çağırır
  refresh();
  if (!f.topic) $("#fTopic").focus();

  function saveFormInputs() {
    state.form.topic = $("#fTopic")?.value ?? state.form.topic;
    state.form.guidance = $("#fGuidance")?.value ?? state.form.guidance;
    state.form.editIntensity = $("#fIntensity")?.value || state.settings.editIntensity || 'balanced';
    state.form.soundDesign = $("#fSound")?.value !== '0';
    state.form.costBudgetUsd = Number($("#fBudget")?.value || 0);
  }
  function updateEstimate() {
    // Sinematik Belgesel'in demo yolu yok: görsel ve ses her durumda gerçekten üretilir, maliyet her zaman gösterilir.
    if(demo && !isDocu(f)){$('#fEst').textContent='Demo modu — API maliyeti yok';return;}
    const hazirSure = isDocu(f) && docuHazir();
    const min = hazirSure ? Math.max(0.5, docuHazir().length * 4.5 / 60) : (p.durations[f.durationPreset]?.minutes || 8);
    const estIn = min * 11000, estOut = min * 1900;
    const rate=state.settings.modelRates?.[state.settings.model];
    // Hazır senaryoda Claude senaryo yazmaz (yalnızca SEO); metin maliyeti düşer.
    const claudeYazar = !isDocu(f) || (!docuHazir() && state.settings.hasAnthropicKey);
    const script = rate && claudeYazar ? (estIn * rate.input + estOut * rate.output) / 1e6 : 0;
    const parts = [];
    // Diğer modlar demo'da yukarıda döndü; buraya demo ile yalnızca Sinematik Belgesel gelir ve
    // o Claude'u demo modundan bağımsız kullanır (claudeYazar anahtarı zaten kontrol ediyor).
    let total = script;
    if (claudeYazar) parts.push(rate ? `metin modeli ~$${script.toFixed(2)} (kaba tahmin)` : 'metin modeli fiyatı tanımsız');

    // Süre iki ayrı parçadan: yerel render (geçişler burayı iki katına çıkarır)
    // ve uzak AI üretimi (sağlayıcıda geçer, geçişten etkilenmez).
    let render = Math.max(2, Math.round(min * 1.1));
    let uzak = 0;

    let docuKredi = 0;
    if (isDocu(f)) {
      const g = docuMaliyet();
      total += g;
      const arsiv = docuArsivSahne();
      const need = docuNeedFor(f, p);
      docuKredi = need.total;
      parts.push(`${docuSahne()} sinematik sahne, görseller ~$${g.toFixed(2)} (${f.docuSource === "ai" ? "hepsi AI" : `${arsiv} sahne arşivde aranır, gerisi AI`}, GPT Image) + ElevenLabs ~${need.total.toLocaleString("tr-TR")} kredi (ses ${need.voice.toLocaleString("tr-TR")}${need.music ? `, müzik ${need.music.toLocaleString("tr-TR")}` : ""}${need.ambience ? `, ortam ${need.ambience.toLocaleString("tr-TR")}` : ""}${need.sfx ? `, efekt ${need.sfx.toLocaleString("tr-TR")}` : ""})`);
      // Görsel üretimi + arşiv araması (sahne başı ~0,15 dk) + ses karışımı ve mastering (~3 dk).
      uzak += docuSahne() * 0.15 + arsiv * 0.15 + 3;
      // Ölçüldü: 74 sn'lik Apollo 13 videosu ~4 dk render (dizüstü, GPU açık) ≈ video dakikası başına 3,5 dk.
      render = Math.max(3, min * 3.5);
    } else if (isGenerated(f)) {
      // Kolaj ayrı hat: stok arama yok, her cümle için üretilmiş kare
      const n = kolajSahne();
      const mod = f.collageMode || "hibrit";
      const kolaj = kolajMaliyet(mod);
      total += kolaj;
      const etiket = mod === "acik" ? "hareketli" : mod === "hibrit" ? "hibrit" : "sadece kare";
      parts.push(`${n} ${aktifMod()==='kolaj'?'kolaj':'AI'} sahnesi (${etiket}) ~$${kolaj.toFixed(2)}`);
      uzak += n * (mod === "acik" ? 0.5 : mod === "hibrit" ? 0.25 : 0.12);
    } else if(usesAutomaticEditor(f)) {
      parts.push(`otomatik AI için $${Number(f.aiSupportBudgetUsd??20).toFixed(2)} tahmini rezerv; gerçek kullanım ayrıca`);
    } else {
      const tavan = aiFillEtkin() * AI_SAHNE;
      if (tavan > 0) { total += tavan; parts.push(`AI: toplam en fazla ${aiFillEtkin()} görsel ~$${tavan.toFixed(2)}`); uzak += aiFillEtkin()*1.4; }
    }
    // Geçişler ikinci bir kodlama turu ekliyor (ölçüldü: ~1,9×)
    // Sinematik Belgesel geçişleri kendi render'ında (Remotion) yapar; ffmpeg geçiş turu yok.
    if (!isDocu(f) && (f.transitions || "sinematik") !== "yok") render *= 1.9;
    // Hareket modu: sahne başına çok katmanlı kompozit + kesik üretimi
    if (f.visualStyle === "hareket") render *= 1.5;
    const dur = render + uzak;

    // Kısa satır göz önünde, dökümün tamamı üstüne gelince (title) — uzun satır formu kalabalıklaştırıyordu.
    const est = $("#fEst");
    est.textContent = total === 0 && !parts.length
      ? "Demo modu — API maliyeti yok"
      : `Tahmini ~$${total.toFixed(2)}${isDocu(f) ? ` + ~${Math.round(docuKredi / 1000)}k ElevenLabs kredisi` : ""} · ~${Math.round(dur)} dk`;
    est.title = parts.length ? `Bilinen kalemler: ${parts.join(" + ")}. Süre: ~${Math.round(dur)} dk` : "";
  }

  async function startJob() {
    saveFormInputs();
    if (!state.form.topic.trim()) { $("#fTopic").focus(); return toast("Önce bir konu yaz", true); }
    if (isGenerated(state.form) && !state.settings.dryRun && !genProviderReady(state.form)) return toast('Seçili üretim modu için sağlayıcı anahtarları eksik. Ayarlar’dan tamamlayın.',true);
    if (isDocu(state.form)) {
      const eksik = [!state.settings.hasAnthropicKey && !state.form.docuScript?.scenes?.length && "Anthropic", !state.settings.hasElevenKey && "ElevenLabs", !state.settings.hasOpenaiKey && !state.settings.hasReplicateKey && "OpenAI (GPT Image)"].filter(Boolean);
      if (eksik.length) return toast(`Sinematik Belgesel için anahtar eksik: ${eksik.join(", ")}. Ayarlar’dan ekleyin.`, true);
    }
    // Sinematik Belgesel ses seçilmemişse varsayılan anlatıcıyı (Musa/George) kullanır.
    if (!isDocu(state.form) && state.settings.ttsProvider === "eleven" && state.settings.hasElevenKey && !state.form.elevenVoiceId) {
      return toast("ElevenLabs sesi seçilmedi — listeyi yenileyin veya Ayarlar'dan Edge TTS'e geçin.", true);
    }
    $("#fGo").disabled = true;
    try {
      await api("/api/jobs", { method: "POST", body: state.form });
      state.showForm = false;
      state.openPanel = null;
      toast("Üretim kuyruğa alındı 🎬");
      render();
    } catch (e) {
      toast(e.message, true);
      $("#fGo").disabled = false;
    }
  }
}

// ---------- pipeline görünümü ----------
const STAGES_STOCK = [
  ["research", "ARAŞTIRMA"], ["script", "SENARYO"], ["media", "MEDYA"], ["picks", "SEÇİM"],
  ["voice", "SES"], ["seo", "SEO"], ["render", "RENDER"], ["done", "HAZIR"],
];
const STAGES_COLLAGE = [
  ["research", "ARAŞTIRMA"], ["script", "BEAT'LER"], ["voice", "SES"], ["cost", "ONAY"],
  ["keyframe", "KAREler"], ["animate", "ANİMASYON"], ["render", "MONTAJ"], ["done", "HAZIR"],
];
const STAGES_DOCU = [
  ["research", "ARAŞTIRMA"], ["script", "KURGU"], ["seo", "SEO"], ["media", "GÖRSELLER"],
  ["voice", "SES"], ["music", "MÜZİK"], ["render", "RENDER"], ["done", "HAZIR"],
];
const stagesFor = (job) => (job?.mediaKind === "docu" ? STAGES_DOCU : job?.visualStyle === "kolaj" ? STAGES_COLLAGE : STAGES_STOCK);

function renderPipeline(main, job) {
  main.dataset.jobId = job.id;
  main.innerHTML = `
    <div class="page-title">Yeni video oluştur</div>
    <div class="page-sub">Pipeline canlı çalışıyor — bu sayfadan ayrılabilirsin, arka planda devam eder.</div>
    <div class="card">
      <div class="pipe-head">
        <div class="pipe-topic">${esc(job.topic)}</div>
        <div class="progress-outer"><div class="progress-inner" id="pBar" style="width:${job.progress || 0}%"></div></div>
        <b id="pPct">${job.progress || 0}%</b>
        <button class="btn" id="pNew" title="Kuyruğa ikinci bir video ekle">+ Yeni video</button>
        <button class="btn danger" id="pCancel">Durdur</button>
      </div>
      <div class="stages" id="pStages"></div>
      <div class="muted" id="pMsg" style="margin-bottom:10px">${esc(job.message || "")}</div>
      <div id="pPicker"></div>
      <div class="logbox" id="pLog"></div>
    </div>`;
  // Çalışan iş varken forma dönüş yolu — yoksa kuyruğa ikinci video eklenemiyordu
  $("#pNew").addEventListener("click", () => { state.showForm = true; render(); });
  $("#pCancel").addEventListener("click", async () => {
    if (!confirm("Bu üretimi durdurmak istediğine emin misin?")) return;
    try {
      await api(`/api/jobs/${job.id}/cancel`, { method: "POST" });
      toast("İptal edildi");
      render();
    } catch (e) { toast(e.message, true); }
  });
  const logs = state.logs.get(job.id) || [];
  const box = $("#pLog");
  box.innerHTML = logs.map((l) => `<div><span class="t">${l.t.toTimeString().slice(0, 8)}</span>${esc(l.line)}</div>`).join("");
  box.scrollTop = box.scrollHeight;
  updatePipelineView(job);
  if (job.status === "awaiting_picks") loadPicker(job.id);
}

function updatePipelineView(job) {
  if ($("#main").dataset.jobId !== job.id) return;
  $("#pBar") && ($("#pBar").style.width = (job.progress || 0) + "%");
  $("#pPct") && ($("#pPct").textContent = (job.progress || 0) + "%");
  $("#pMsg") && ($("#pMsg").textContent = job.message || "");
  const stEl = $("#pStages");
  if (stEl) {
    const STAGES = stagesFor(job);
    const order = STAGES.map(([k]) => k);
    let curIdx = order.indexOf(job.stage);
    if (job.stage === "finalize") curIdx = order.indexOf("render");
    if (job.status === "done") curIdx = order.length - 1;
    stEl.innerHTML = STAGES.map(([k, label], i) => {
      const cls = i < curIdx || job.status === "done" ? "done" : i === curIdx ? "now" : "";
      const icon = cls === "done" ? "✓" : i + 1;
      return `<div class="stage ${cls}"><div class="bubble">${icon}</div><small>${label}</small></div>${i < STAGES.length - 1 ? '<div class="stage-line"></div>' : ""}`;
    }).join("");
  }
  if (job.status === "awaiting_cost") renderCostGate(job);
  if (job.status === "awaiting_picks" && !state.pickerData) loadPicker(job.id);
  // #pPicker hem seçici hem maliyet onayı kutusunu barındırır — ikisini de korumalıyız,
  // yoksa onay ekranı çizildiği anda siliniyordu.
  if (!["awaiting_picks", "awaiting_cost"].includes(job.status)) {
    const pk = $("#pPicker");
    if (pk && pk.innerHTML) { pk.innerHTML = ""; pk.dataset.gate = ""; state.pickerData = null; }
  }
  if (job.status === "done") {
    toast("Video hazır! Kütüphane'de 🎉");
    setTimeout(() => { if (state.page === "studio") { state.pickerData = null; render(); } }, 1200);
  } else if (["error", "cancelled"].includes(job.status)) {
    // Hata ekranı kendiliğinden kaybolmasın — mesaj ve log okunabilir kalsın.
    if (job.status === "error") toast(job.message || "İş hata verdi", true);
    renderJobEnd(job);
  }
}

/** Hata/iptal sonrası pipeline görünümünde kalıcı bilgi kutusu + çıkış düğmeleri. */
function renderJobEnd(job) {
  const host = $("#pPicker");
  if (!host || host.dataset.ended === job.id) return;
  host.dataset.ended = job.id;
  const bad = job.status === "error";
  host.innerHTML = `
    <div class="jobend ${bad ? "bad" : ""}">
      <div class="jobend-head">${bad ? "⚠️ İş hata verdi" : "İş iptal edildi"}</div>
      ${bad ? `<div class="jobend-msg">${esc(job.message || "")}</div>` : ""}
      <div class="row" style="margin-top:12px; gap:8px">
        <button class="btn primary" id="jeRetry">Kaldığı yerden devam et</button>
        <button class="btn" id="jeClose">Yeni video formuna dön</button>
      </div>
    </div>`;
  $("#jeClose")?.addEventListener("click", () => { state.pickerData = null; state.page = "studio"; render(); });
  $("#jeRetry")?.addEventListener("click", async () => {
    const b = $("#jeRetry");
    b.disabled = true;
    try {
      Object.assign(state.form, {
        topic: job.topic || state.form.topic, guidance: job.guidance || "",
        theme: job.theme, tone: job.tone, language: job.language,
        durationPreset: job.durationPreset,
      });
      restoreProductionForm(state.form,job);
      await api(`/api/jobs/${job.id}/resume`, { method: "POST" });
      state.pickerData = null;
      toast("Kaydedilen aşamalardan devam ediyor.");
      render();
    } catch (e) {
      toast(e.message, true);
      b.disabled = false;
    }
  });
}

function appendLog(jobId, line) {
  if ($("#main").dataset.jobId !== jobId) return;
  const box = $("#pLog");
  if (!box) return;
  const d = document.createElement("div");
  d.innerHTML = `<span class="t">${new Date().toTimeString().slice(0, 8)}</span>${esc(line)}`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

// ---------- maliyet onayı (kolaj) ----------
function renderCostGate(job) {
  const el = $("#pPicker");
  if (!el || el.dataset.gate === job.id) return;
  const c = job.cost || {};
  el.dataset.gate = job.id;
  el.innerHTML = `
    <div class="cost-gate">
      <div class="cost-head">💳 Ücretli üretim onayı bekliyor</div>
      <table class="cost-table">
        <tr><td>${c.beats} keyframe × $${c.perKeyframe}</td><td>$${c.keyframes}</td></tr>
        <tr><td>${c.clips > 0 ? `${c.beats} animasyon klibi × $${c.perClip}` : "Animasyon (kapalı mod)"}</td><td>$${c.clips}</td></tr>
        <tr class="cost-total"><td>Toplam (%15 yeniden üretim payı dahil)</td><td>$${c.total}</td></tr>
      </table>
      <div class="row" style="margin-top:14px; gap:10px">
        <button class="btn primary" id="costYes">Onayla ve üret ($${c.total})</button>
        <button class="btn danger" id="costNo">Vazgeç</button>
      </div>
    </div>`;
  $("#costYes").addEventListener("click", async () => {
    $("#costYes").disabled = true;
    try {
      await api(`/api/jobs/${job.id}/cost`, { method: "POST", body: { approved: true } });
      el.innerHTML = ""; el.dataset.gate = "";
      toast("Onaylandı, üretim başlıyor 🚀");
    } catch (e) {
      toast(e.message, true);
      const b = $("#costYes");
      if (b) b.disabled = false; // istek başarısız oldu — kullanıcı tekrar deneyebilsin
    }
  });
  $("#costNo").addEventListener("click", async () => {
    await api(`/api/jobs/${job.id}/cost`, { method: "POST", body: { approved: false } });
    el.innerHTML = ""; el.dataset.gate = "";
    toast("İptal edildi");
  });
}

// ---------- medya seçici ----------
async function loadPicker(jobId) {
  try {
    const data = await api(`/api/jobs/${jobId}/candidates`);
    state.pickerData = data;
    renderPicker();
  } catch (e) { toast(e.message, true); }
}

function candById(candidates, key, id) {
  return (candidates[key] || []).find((c) => c.id === id);
}

/**
 * Seçim ekranındaki medya kutusu. Fotoğraf düz <img>, VİDEO ise oynatılabilir.
 *
 * Kapak karesine bakıp karar vermek yanıltıyor: stok klibin ilk karesi çoğu zaman
 * konuyu göstermiyor (hatta siyah olabiliyor). Üstüne gelince sessiz oynar.
 * preload="none" — fare değmeden tek bayt inmez; 26 klibi birden indirmek
 * hem yavaş hem gereksiz.
 */
function medyaKutusu(c, sinif) {
  if (!c) return `<div class="${sinif} empty">aday yok</div>`;
  if (c.type !== "video") {
    return `<img class="${sinif}" src="${esc(c.thumb || c.url)}" loading="lazy" onerror="this.style.opacity=.15"/>`;
  }
  return `<video class="${sinif} vid" ${c.thumb ? `poster="${esc(c.thumb)}"` : ""}
    src="${esc(c.url)}" muted loop playsinline preload="none"></video>
    <span class="oynat" aria-hidden="true">▶</span>`;
}

/**
 * Fare üstündeyken oynat, çekilince durdur — aynı anda tek klip çalar.
 * ▶ rozetinin görünürlüğü CSS sınıfı yerine DOĞRUDAN ayarlanıyor: sınıf tabanlı
 * kural bu kabukta uygulanmıyordu (sınıf elemana geçiyor, seçici eşleşiyor, ama
 * hesaplanan opaklık değişmiyor). Doğrudan stil hem kesin hem tek satır.
 */
function videoOnizlemeBagla(kok) {
  const hepsi = [...kok.querySelectorAll("video.vid")];
  const durdur = (v) => {
    v.pause(); v.currentTime = 0;
    const r = v.parentElement?.querySelector(".oynat");
    if (r) r.style.opacity = "1";
  };
  hepsi.forEach((v) => {
    const kap = v.parentElement;
    if (!kap) return;
    kap.addEventListener("mouseenter", () => {
      hepsi.forEach((o) => { if (o !== v) durdur(o); });
      v.play().catch(() => {});           // otomatik oynatma engellenirse sessizce geç
      const r = kap.querySelector(".oynat");
      if (r) r.style.opacity = "0";
    });
    kap.addEventListener("mouseleave", () => durdur(v));
  });
}

function renderPicker() {
  const el = $("#pPicker");
  if (!el || !state.pickerData) return;
  const { script, candidates, picks } = state.pickerData;
  const denetim = state.pickerData.denetim || {};
  if (!script) return;
  // Ön denetim rozeti: modelin fotoğrafa BAKIP verdiği puan (0-3) ve ne gördüğü.
  // Amaç, kullanıcının 26 görseli tek tek incelemek zorunda kalmaması — sorunlu
  // olanlar işaretli gelir, gerisine bakmadan geçebilir.
  const ROZET = {
    3: { i: "✓", s: "ok",   t: "Tam isabet" },
    2: { i: "✓", s: "ok",   t: "Uygun" },
    1: { i: "!", s: "warn", t: "Zayıf — konuyla ilgisi yüzeysel" },
    0: { i: "✕", s: "bad",  t: "İlgisiz — değiştirilmeli" },
  };
  // Kalite AYRI bir eksen: "konusu doğru mu" ile "ekranda iyi durur mu" farklı
  // sorular. Konusu birebir doğru ama yarısı karanlık boş oda olan bir kare
  // videoya girmişti; kullanıcı seçim ekranında bunu göremiyordu.
  const KALITE = {
    1: { t: "Kadraj zayıf — yarısı boş, bulanık ya da ekrandan çekilmiş" },
    0: { t: "Tam ekran kullanılamaz" },
  };
  const rozet = (beatId) => {
    const d = denetim[beatId];
    if (!d || !Number.isFinite(d.puan)) return "";
    const r = ROZET[d.puan] || ROZET[1];
    const alaka = `<span class="dn dn-${r.s}" title="${esc(r.t)}: ${esc(d.gorunen || "")}">${r.i} ${d.puan}/3</span>`;
    const k = Number.isFinite(d.kalite) && d.kalite < 2 ? KALITE[d.kalite] || KALITE[1] : null;
    return alaka + (k ? `<span class="dn dn-warn" title="${esc(k.t)}">◐ kadraj ${d.kalite}/3</span>` : "");
  };
  const visualsOf = (seg) => (Array.isArray(seg.visuals) && seg.visuals.length ? seg.visuals : seg.visual ? [seg.visual] : []);
  const emphLabel = (e) => {
    if (!e || e.type === "none") return "";
    if (e.type === "stat") return `<span class="emph-pill">📊 ${esc(e.value)}</span>`;
    if (e.type === "keyword") return `<span class="emph-pill">💬 ${esc(e.value)}</span>`;
    if (e.type === "compare") return `<span class="emph-pill">📈 ${e.items.length} barlı grafik</span>`;
    return "";
  };
  let idx = 0;
  const sections = script.sections.map((sec, si) => {
    const segs = sec.segments.map((seg) => {
      const segIndex = idx++;
      const cards = visualsOf(seg).map((v, bi) => {
        const beatId = `s${segIndex}b${bi}`;
        const key = `${v.query}||${v.type}`;
        const chosen = candById(candidates, key, picks[beatId]);
        const d = denetim[beatId];
        const sorunlu = d && ((Number.isFinite(d.puan) && d.puan < 2) ||
                              (Number.isFinite(d.kalite) && d.kalite < 2));
        const thumb = chosen
          ? `<div class="seg-media-wrap">${medyaKutusu(chosen, "seg-thumb")}<span class="type-badge">${chosen.type === "video" ? "🎬" : "🖼"} ${esc(chosen.provider)}</span>${rozet(beatId)}</div>`
          : `<div class="seg-thumb empty">aday yok</div>`;
        return `<div class="seg-card${sorunlu ? " sorunlu" : ""}" data-seg="${beatId}" data-key="${esc(key)}">
          ${thumb}
          <div class="seg-info"><div class="q">${bi + 1}. kesme · ${esc(v.query)}</div>
          ${d?.gorunen ? `<div class="gorunen">👁 ${esc(d.gorunen)}</div>` : ""}</div>
        </div>`;
      }).join("");
      return `<div class="seg-row">
        <div class="seg-narr">${esc(seg.text)} ${emphLabel(seg.emphasis)}</div>
        <div class="seg-grid">${cards}</div>
      </div>`;
    }).join("");
    return `<div class="section-block"><h3>${si + 1}. ${esc(sec.title)}</h3>${segs}</div>`;
  }).join("");

  // Özet: kullanıcı 26 karta tek tek bakmasın, kaçının sorunlu olduğunu görsün.
  const puanlar = Object.values(denetim).filter((d) => Number.isFinite(d?.puan));
  const kotu = puanlar.filter((d) => d.puan < 2 ||
    (Number.isFinite(d.kalite) && d.kalite < 2)).length;
  const ozet = puanlar.length
    ? (kotu
        ? `<span class="dn dn-warn">${kotu} görselde sorun var (konu ya da kadraj)</span>
           <span class="muted">— işaretli kartlara tıklayıp değiştir, gerisi hazır.</span>`
        : `<span class="dn dn-ok">${puanlar.length} görselin hepsi konu ve kadraj olarak uygun</span>
           <span class="muted">— istersen yine de değiştirebilirsin.</span>`)
    : `<span class="muted">Karta tıklayıp alternatif seç. Hazır olunca onayla.</span>`;

  el.innerHTML = `
    <div class="picker-toolbar">
      <b style="color:var(--warn)">🖐️ Görsel seçimi bekleniyor</b>
      ${ozet}
      <span class="grow"></span>
      ${kotu ? `<button class="btn" id="pkOnlyBad">Sorunluları göster (${kotu})</button>` : ""}
      <button class="btn primary" id="pkApprove">Onayla ve render et →</button>
    </div>
    <div id="pkList" style="max-height:46vh; overflow-y:auto; padding-right:6px; margin-bottom:14px">${sections}</div>`;

  $("#pkOnlyBad")?.addEventListener("click", (e) => {
    const acik = e.target.dataset.on === "1";
    e.target.dataset.on = acik ? "" : "1";
    e.target.textContent = acik ? `Sorunluları göster (${kotu})` : "Hepsini göster";
    el.querySelectorAll(".seg-row").forEach((row) => {
      row.style.display = acik || row.querySelector(".seg-card.sorunlu") ? "" : "none";
    });
  });

  el.querySelectorAll(".seg-card").forEach((card) => {
    card.addEventListener("click", () => openCandModal(card.dataset.seg, card.dataset.key));
  });
  videoOnizlemeBagla(el);
  $("#pkApprove").addEventListener("click", async () => {
    $("#pkApprove").disabled = true;
    try {
      await api(`/api/jobs/${state.pickerData.job.id}/picks`, { method: "POST", body: { picks: state.pickerData.picks } });
      state.pickerData = null;
      toast("Seçimler onaylandı, render başlıyor 🚀");
    } catch (e) { toast(e.message, true); } finally { const b = $("#pkApprove"); if (b) b.disabled = false; }
  });
}

function openCandModal(segId, key) {
  const { candidates, picks } = state.pickerData;
  // Alternatifler ALAKA sırasına dizilir. Ham sıra sağlayıcının döndürdüğü sıraydı
  // ve en alakalı aday çoğu zaman aşağıda kalıyordu.
  const cands = [...(candidates[key] || [])].sort((a, b) => (b.alaka ?? 0) - (a.alaka ?? 0));
  const d = state.pickerData.denetim?.[segId];
  modal(`
    <h3>Görsel seç <span class="muted" style="font-size:12px">— ${esc(key.split("||")[0])}</span></h3>
    ${d && d.puan < 2 ? `<div class="dn dn-warn" style="margin-bottom:10px">Şu anki seçim: ${esc(d.gorunen || "")} — konuyla ilgisi zayıf.</div>` : ""}
    <div class="cand-grid">
      ${cands.map((c) => `
        <div class="cand ${picks[segId] === c.id ? "sel" : ""}" data-id="${c.id}">
          ${medyaKutusu(c, "cand-media")}
          <span class="src">${c.type === "video" ? "🎬" : "🖼"} ${esc(c.provider)} · ${c.width || "?"}px${
            c.type === "video" && c.duration ? ` · ${Math.round(c.duration)}sn` : ""}</span>
        </div>`).join("") || '<div class="muted">Aday bulunamadı — bu segment için otomatik kart üretilecek.</div>'}
    </div>
    <div class="row" style="margin-top:14px; justify-content:space-between; align-items:center;">
      <span class="muted" style="font-size:11.5px">Videoların üstüne gelince oynar. Tıklayınca seçilir.</span>
      <button class="btn" onclick="document.getElementById('modal').hidden=true">Kapat</button>
    </div>
  `);
  videoOnizlemeBagla($("#modalBox"));
  $$("#modalBox .cand").forEach((c) => {
    c.addEventListener("click", () => {
      state.pickerData.picks[segId] = c.dataset.id;
      closeModal();
      renderPicker();
    });
  });
}

// ---------- kuyruk ----------
function renderQueue(main) {
  const jobs = [...state.jobs.values()].filter((j) => ["queued", "running", "awaiting_picks", "awaiting_cost"].includes(j.status));
  main.innerHTML = `
    <div class="page-title">Kuyruk</div>
    <div class="page-sub">Bekleyen ve çalışan üretimler. Sıradaki iş öncekisi bitince otomatik başlar.</div>
    <div class="card" style="padding:6px 6px">
      ${jobs.length ? jobs.map((j) => `
        <div class="qrow">
          <span class="qstatus qs-${j.status}">${{ queued: "SIRADA", running: "ÇALIŞIYOR", awaiting_picks: "SEÇİM BEKLİYOR", awaiting_cost: "ONAY BEKLİYOR" }[j.status] || j.status}</span>
          <b class="grow">${esc(j.topic)}</b>
          <span class="muted">${esc(j.message || "")}</span>
          <button class="btn danger" data-id="${j.id}">İptal</button>
        </div>`).join("") : '<div class="qrow muted">Kuyruk boş. Stüdyo\'dan yeni üretim başlat.</div>'}
    </div>`;
  $$(".qrow .btn.danger", main).forEach((b) => b.addEventListener("click", async () => {
    await api(`/api/jobs/${b.dataset.id}/cancel`, { method: "POST" });
    render();
  }));
}

// ---------- kütüphane ----------
/** Shorts açılış kalıpları (1.16.16, src/pipeline/growth-lessons.js SHORT_HOOK_PATTERNS). */
const SHORT_PATTERN_TR = { result: "sonuç başta", contradiction: "ters köşe", strange: "garip görüntü", question: "izleyicinin sorusu", compare: "karşılaştırma" };
/** Shorts paneli: bitmiş belgeselden dikey Shorts çıkarır, öncekileri listeler (oynat, başlık/açıklama kopyala, indir). */
async function openShorts(id) {
  const j = state.jobs.get(id);
  const title = j?.meta?.title || j?.topic || "";
  const card = (s) => `
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column">
      <video controls preload="metadata" src="/api/jobs/${id}/short/${esc(s.name)}" style="width:100%; aspect-ratio:9/16; max-height:520px; background:#000"></video>
      <div style="padding:10px; display:grid; gap:6px; font-size:12.5px">
        ${s.hook ? `<div><b>Kanca:</b> ${esc(s.hook)}</div>` : ""}
        ${s.pattern ? `<div><b>Açılış kalıbı:</b> ${esc(SHORT_PATTERN_TR[s.pattern] || s.pattern)}${s.screen ? ` · ekranda "${esc(s.screen)}"` : ""}${s.reopenedFrom ? ' · <span class="muted">yenilenmiş açılış</span>' : ""}</div>` : ""}
        <div><b>Başlık:</b> ${esc(s.title || title)}</div>
        ${s.description ? `<div class="muted">${esc(s.description)}</div>` : ""}
        <div class="muted">${fmtDur((s.end || 0) - (s.start || 0))} · ${s.mode === "teaser" ? "yeni teaser (uzun videoya yönlendirir)" : `uzun videonun ${fmtDur(s.start || 0)} anından kesit`}</div>
        <div class="row" style="gap:6px">
          <button class="btn" style="padding:5px 9px;font-size:11.5px" data-copyshort="${esc(s.name)}">Başlık + açıklama kopyala</button>
          <a class="btn" style="padding:5px 9px;font-size:11.5px" href="/api/jobs/${id}/short/${esc(s.name)}?dl=1">⬇ MP4</a>
          ${s.mode === "pictures" ? `<button class="btn" style="padding:5px 9px;font-size:11.5px" data-reopen="${esc(s.name)}" title="Studio'da kaydırıp geçen oranı kötüyse: aynı hikâye, yeni ilk 3 saniye (başka kalıp)">🔁 Yalnızca açılışı değiştir</button>` : ""}
        </div>
      </div>
    </div>`;
  const draw = (shorts, busy) => {
    modal(`<h3>Shorts <span class="muted" style="font-size:12px">— ${esc(title)}</span>
        <button class="btn primary" id="shortNew" style="float:right" ${busy ? "disabled" : ""}>${busy ? "Hazırlanıyor… (1-2 dk)" : "+ Yeni Shorts çıkar"}</button></h3>
      <p class="muted" style="font-size:12.5px">Uzun videoya yönlendiren yeni bir fragman: Claude yeni metin yazar, aynı anlatıcı seslendirir, videonun en çarpıcı anlarından montaj yapılır; dikey 1080x1920, kanca etiketi, büyük altyazı, sonda kapakla izle kartı. Her basışta farklı bir teaser.</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px">
        ${shorts.length ? shorts.map(card).join("") : '<div class="muted">Henüz Shorts yok.</div>'}
      </div>`);
    $$("#modalBox [data-copyshort]").forEach((x) => x.addEventListener("click", () => {
      const s = shorts.find((k) => k.name === x.dataset.copyshort);
      navigator.clipboard.writeText(`${s.title || title}\n\n${s.description || ""}\n\n#Shorts`);
      toast("Kopyalandı");
    }));
    const make = async (body) => {
      draw(shorts, true);
      try {
        await api(`/api/jobs/${id}/shorts`, { method: "POST", ...(body ? { body } : {}) });
        toast("Shorts hazır ✓");
      } catch (e) {
        toast(`Shorts çıkarılamadı: ${e.message || e}`);
      }
      const r = await api(`/api/jobs/${id}/shorts`);
      draw(r.shorts || [], r.busy);
    };
    $("#shortNew")?.addEventListener("click", () => make());
    $$("#modalBox [data-reopen]").forEach((x) => x.addEventListener("click", () => make({ reopen: x.dataset.reopen })));
  };
  const r = await api(`/api/jobs/${id}/shorts`);
  draw(r.shorts || [], r.busy);
}

/**
 * Bağımsız Shorts: konu yaz → araştırma, plan, gerçek görseller ya da AI, açılış ve uygun cümleler
 * hareketli (Replicate), kütüphaneden müzik. Açılış türü, format, başlık kalıbı ve görünüm boş
 * bırakılırsa kanal tekdüzeleşmesin diye sırayla döner.
 */
/**
 * GÜNDEM RADARI: Google'ın şu an en çok aranan konuları; "Değerlendir" ile kanallara uygun, büyük,
 * taze ve kafa karıştıran olanlar — Nepal ölçüsüyle büyüklük (16,7 bin aboneli kanalın 4 milyon
 * izlenen açıklama videosu), başlık, açı ve videonun asla söylememesi gereken şey. Bir konu tek
 * tıkla Gündem belgeseli ya da bağımsız Shorts olarak başlar.
 */
async function renderGundem(main) {
  const geo = state.gundemGeo || "US";
  main.innerHTML = `
    <div class="page-title">Gündem Radarı</div>
    <div class="page-sub">Şu an en çok aranan konular. Ölçü: Nepal seli — 16,7 bin aboneli bir kanalın "Explained" videosu 1 ayda 4 milyon izlendi; zamanlama ve bilgi karmaşası kaliteden önce gelir.
      <span class="row" style="gap:6px; float:right">
        ${["US", "GB", "TR"].map((g) => `<button class="btn ${g === geo ? "primary" : ""}" data-geo="${g}">${g}</button>`).join("")}
        <button class="btn primary" id="gEval">🧠 Kanallara göre değerlendir</button>
      </span></div>
    <div id="gPicks"></div>
    <div class="card" id="gList" style="padding:10px"><div class="muted">Yükleniyor…</div></div>`;
  $$("[data-geo]", main).forEach((b) => b.addEventListener("click", () => { state.gundemGeo = b.dataset.geo; renderGundem(main); }));
  const picksBox = $("#gPicks", main);
  const drawPicks = (r) => {
    const big = (p) => (p.vsBenchmark != null ? `<b style="color:${p.vsBenchmark >= 1 ? "var(--ok, #2ecc71)" : "var(--muted)"}">Nepal'in ${p.vsBenchmark >= 1 ? `${p.vsBenchmark.toFixed(1)} katı` : `%${Math.round(p.vsBenchmark * 100)}'i`}</b>${p.rising ? " ↑" : ""}` : "");
    picksBox.innerHTML = `<div class="card" style="padding:12px; margin-bottom:12px">
      <b>Kanallara uygun konular</b> <span class="muted" style="font-size:12px">— büyüklük ${r.benchmark?.term ? `"${esc(r.benchmark.term)}"` : "Nepal"} zirvesine göre (Google Trends, ${r.benchmark?.measuredOn === "web" ? "web araması — YouTube ölçümü alınamadı" : "YouTube araması"}, son 90 gün)</span>
      ${(r.picks || []).map((p, k) => `
        <div style="border-top:1px solid var(--border); padding:10px 0; display:grid; gap:4px">
          <div><b>${esc(p.title)}</b> <span class="muted">· ${esc(p.channel)} · ${esc(p.freshness)} · karmaşa ${p.confusion}/5 · büyüklük ${p.bigness}/5 · açıklama boşluğu ${p.explainerGap ?? "?"}/5 · ${esc({ escalating: "büyüyor", unfolding: "sürüyor", "one-off": "tek seferlik" }[p.arc] || "")}</span> ${big(p)}</div>
          ${p.gate ? `<div style="font-size:12.5px">${p.gate.pass ? `<b style="color:var(--ok, #2ecc71)">✅ Kapıdan geçti</b> <span class="muted">(puan ${p.gate.score})</span>` : `<b style="color:var(--warn)">⛔ Kapıdan geçmedi:</b> ${p.gate.fails.map(esc).join(" · ")}`}${p.gate.titleErrors?.length ? ` <span class="muted">· başlık düzelecek: soru olmalı</span>` : ""}</div>` : ""}
          <div class="muted" style="font-size:12.5px">${esc(p.story)} — <i>${esc(p.question)}</i></div>
          <div style="font-size:12.5px">${esc(p.angle)}</div>
          <div style="font-size:12px"><b>Kapak:</b> ${esc(p.thumbnail)} · <b style="color:var(--warn)">Asla söyleme:</b> ${esc(p.neverSay)}</div>
          <div class="row" style="gap:6px"><button class="btn primary" data-docu="${k}">🎬 Gündem belgeseli başlat</button><button class="btn" data-short="${k}">📱 Shorts başlat</button></div>
        </div>`).join("") || '<div class="muted">Uygun konu bulunamadı.</div>'}
    </div>`;
    $$("[data-docu]", picksBox).forEach((b) => b.addEventListener("click", () => {
      const p = r.picks[+b.dataset.docu];
      Object.assign(state.form, {
        mediaKind: "docu", docuSource: "archive", docuFormat: "news", language: "en", topic: p.title,
        guidance: `${p.angle}\n\nThe question millions are asking: ${p.question}\nWhat happened: ${p.story}\nThumbnail line: ${p.thumbnail}\nNEVER claim: ${p.neverSay}`,
      });
      delete state.form.docuGenre;
      // Haber kanalının sesi (ayarlardaki docuStyleVoices.news) ve uzun süre: gündem videosu da kısa çıkmasın.
      const haberSesi = state.settings?.docuStyleVoices?.news;
      if (haberSesi && (state.elevenVoices || []).some((v) => v.id === haberSesi)) state.form.elevenVoiceId = haberSesi;
      if (["test", "kisa", "standart"].includes(state.form.durationPreset)) state.form.durationPreset = "detayli";
      state.showForm = true;
      location.hash = "#studio";
      toast("Gündem belgeseli formu dolduruldu — haber kanalının sesi seçildi, başlatabilirsiniz");
    }));
    $$("[data-short]", picksBox).forEach((b) => b.addEventListener("click", () => {
      const p = r.picks[+b.dataset.short];
      openStandaloneShorts({ topic: p.title, angle: `${p.story} ${p.angle} Never claim: ${p.neverSay}` });
    }));
  };
  if (state.gundemPicks) drawPicks(state.gundemPicks);
  $("#gEval", main).addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Değerlendiriliyor… (~30 sn)";
    try {
      state.gundemPicks = await api("/api/trends/evaluate", { method: "POST", body: { geos: [geo, ...(geo === "US" ? ["GB"] : ["US"])] } });
      drawPicks(state.gundemPicks);
    } catch (err) {
      toast(`Değerlendirilemedi: ${err.message || err}`, true);
    }
    e.target.disabled = false;
    e.target.textContent = "🧠 Kanallara göre değerlendir";
  });
  try {
    const r = await api(`/api/trends?geo=${geo}`);
    $("#gList", main).innerHTML = `<b>Şu an trend (${esc(r.geo)})</b>${r.items.map((i) => `
      <div style="border-top:1px solid var(--border); padding:7px 0; font-size:12.5px">
        <b>${esc(i.title)}</b> <span class="muted">· ${esc(i.traffic || "")} arama</span>
        ${i.news.slice(0, 2).map((n) => `<div class="muted">↳ <a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a> (${esc(n.source)})</div>`).join("")}
      </div>`).join("")}`;
  } catch (err) {
    $("#gList", main).innerHTML = `<div class="muted">Gündem alınamadı: ${esc(err.message || String(err))}</div>`;
  }
}

async function openStandaloneShorts(prefill = {}) {
  const OPEN = [["", "Açılış: otomatik (sırayla)"], ["triple", "Üç kelime"], ["question", "Soru"], ["number", "Şok sayı"], ["quote", "Alıntı"], ["statement", "Tek cümle tespit"]];
  const FORMAT = [["", "Format: otomatik"], ["story", "Hikâye"], ["facts", "Gerçekler listesi"]];
  const TITLE = [["", "Başlık kalıbı: otomatik (sırayla)"], ["who", "…Who … (kim)"], ["nobody", "Nobody Knows Why"], ["why", "Why …?"], ["secret", "… Hid a Secret"], ["true", "… And It Was True"], ["then", "… Then …"], ["facts", "N Facts About …"]];
  const LOOK = [["", "Görünüm: otomatik (konuya göre)"], ["punch", "Punch"], ["dossier", "Dosya"], ["empire", "İmparatorluk"], ["ledger", "Defter"], ["noir", "Noir"], ["clean", "Temiz"], ["editorial", "Editoryal"], ["tabloid", "Tabloid"]];
  const sel = (id, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select>`;
  let timer = null;
  const card = (s) => `
    <div style="background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column">
      <video controls preload="metadata" src="/api/shorts/${esc(s.slug)}/video?v=${Math.round(s.at || 0)}" style="width:100%; aspect-ratio:9/16; max-height:480px; background:#000"></video>
      <div style="padding:10px; display:grid; gap:6px; font-size:12.5px">
        <div><b>${esc(s.title || s.topic)}</b></div>
        ${(s.titles || []).filter((t) => t !== s.title).map((t) => `<div class="muted">• ${esc(t)}</div>`).join("")}
        <div class="muted">${esc(s.look || "")} · ${esc(s.opening || "")} · ${s.motionClips ? `${s.motionClips} hareketli sahne` : "durağan"}</div>
        <div class="row" style="gap:6px">
          <button class="btn" style="padding:5px 9px;font-size:11.5px" data-copystandalone="${esc(s.slug)}">Başlık + açıklama + künye</button>
          <a class="btn" style="padding:5px 9px;font-size:11.5px" href="/api/shorts/${esc(s.slug)}/video?dl=1">⬇ MP4</a>
        </div>
      </div>
    </div>`;
  const draw = (r) => {
    const shorts = r.shorts || [];
    const busy = r.busy || [];
    modal(`<h3>Bağımsız Shorts</h3>
      <p class="muted" style="font-size:12.5px">Kendi konusunda dikey Shorts. Claude konuyu araştırır, merak boşluklu başlık ve döngülü metin yazar; gerçek kişi/yer/belge Commons ve arşivden, olmayanı AI; açılış ve uygun sahneler Replicate ile gerçek harekete döner (Ayarlar: Replicate anahtarı). Gerçek kişi fotoğrafı ve belge asla canlandırılmaz.</p>
      <div class="card" style="display:grid; gap:8px; padding:12px">
        <input id="ssTopic" placeholder="Konu (ör. The Great Molasses Flood, Boston 1919)" value="${esc(prefill.topic || "")}"/>
        <input id="ssAngle" placeholder="Açı (isteğe bağlı): neyin anlatılacağı, vurgulanacak gerçekler" value="${esc(prefill.angle || "")}"/>
        <div class="row" style="gap:8px; flex-wrap:wrap">${sel("ssOpening", OPEN)} ${sel("ssFormat", FORMAT)} ${sel("ssTitle", TITLE)} ${sel("ssLook", LOOK)} ${sel("ssVoice", [["", "Anlatıcı: Brian (varsayılan)"], ...(state.elevenVoices || []).map((v) => [v.id, "Anlatıcı: " + v.name.split(" - ")[0]])])}
          <button class="btn primary" id="ssGo">Üret</button></div>
      </div>
      ${busy.map((b) => `<div class="card" style="padding:10px; margin-top:8px"><b>Hazırlanıyor:</b> ${esc(b.topic)}<div class="muted" style="font-size:11.5px; white-space:pre-wrap">${esc(b.log.join("\n"))}</div></div>`).join("")}
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; margin-top:12px">
        ${shorts.length ? shorts.map(card).join("") : '<div class="muted">Henüz bağımsız Shorts yok.</div>'}
      </div>`);
    $$("#modalBox [data-copystandalone]").forEach((x) => x.addEventListener("click", () => {
      const s = shorts.find((k) => k.slug === x.dataset.copystandalone);
      navigator.clipboard.writeText([s.title, "", s.description, "", s.credits || ""].join("\n").trim());
      toast("Kopyalandı");
    }));
    $("#ssGo")?.addEventListener("click", async () => {
      const topic = $("#ssTopic").value.trim();
      if (topic.length < 4) return toast("Konu yazın");
      try {
        const g = await api("/api/shorts", { method: "POST", body: { topic, angle: $("#ssAngle").value.trim(), opening: $("#ssOpening").value, format: $("#ssFormat").value, titlePattern: $("#ssTitle").value, look: $("#ssLook").value, voiceId: $("#ssVoice").value } });
        toast(`Başladı: açılış ${g.opening}, başlık ${g.titlePattern}, görünüm ${g.look}`);
      } catch (e) {
        toast(`Başlatılamadı: ${e.message || e}`);
      }
      refresh();
    });
    clearTimeout(timer);
    // While something is being made the panel follows it (until the modal is closed).
    if (busy.length) timer = setTimeout(() => { if ($("#modalBox #ssTopic")) refresh(); }, 6000);
  };
  // The narrator list (the same ElevenLabs voices as the studio form).
  if (!state.elevenVoices) await api("/api/eleven-voices").then((v) => { state.elevenVoices = v.voices || []; state.elevenLibrary = v.library || []; }).catch(() => {});
  const refresh = async () => draw(await api("/api/shorts"));
  refresh();
}

function renderLibrary(main) {
  const jobs = [...state.jobs.values()].filter((j) => ["done", "error", "cancelled", "interrupted", "needs_review"].includes(j.status));
  main.innerHTML = `
    <div class="page-title">Kütüphane</div>
    <div class="page-sub">Tüm renderlar data/jobs klasörüne kaydedilir. Videoya tıklayıp izleyebilir veya MP4'ü indirebilirsin.
      <button class="btn primary" id="standaloneShorts" style="float:right" title="Uzun videoya bağlı olmayan, kendi konusunda dikey Shorts: araştırma, merak boşluklu başlık, gerçek görseller, açılışı hareketli (Replicate).">📱 Bağımsız Shorts</button></div>
    <div class="lib-grid">
      ${jobs.length ? jobs.map((j) => {
        const done = !!j.outputs?.video;
        const thumb = done && j.outputs?.thumbnail
          ? `<img class="lib-thumb" src="/api/jobs/${j.id}/file/thumbnail.jpg" data-play="${j.id}" loading="lazy"/>`
          : `<div class="lib-thumb" style="display:grid;place-items:center;color:var(--muted)">${done ? "🎬" : j.status === "error" ? "⚠️ " + esc((j.message || "").slice(0, 60)) : "iptal"}</div>`;
        return `<div class="lib-card">
          ${thumb}
          <div class="lib-body">
            <div class="lib-title">${esc(j.meta?.title || j.topic)}</div>
            ${j.processingMs?`<div class="lib-meta">Ölçülen işleme süresi: ${fmtDur(j.processingMs/1000)}</div>`:''}
            ${j.mediaKind === "docu"
              ? (j.qualityWarnings?.length ? `<div class="editor-notice docu-warn"><b>İnceleme önerilir</b><ul>${j.qualityWarnings.slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join("")}${j.qualityWarnings.length > 4 ? `<li>+${j.qualityWarnings.length - 4} uyarı daha</li>` : ""}</ul></div>` : "")
              : (j.needsReview ? '<p class="editor-notice">Yayın öncesi inceleme gerekli · Kurgu ve yayın ekranını aç.</p>' : "")}
            ${j.usage?.requests?`<div class="lib-meta">Tahmini metin modeli maliyeti: ${Number.isFinite(j.usage.estimatedUsd)?'$'+j.usage.estimatedUsd.toFixed(3):'bilinmiyor'} ${j.usage.estimateComplete===true?'':'· bilinen fiyatların ara toplamı; eksik maliyet olabilir'}</div>`:''}
            <div class="lib-meta">${fmtDur(j.meta?.durationSec)} · ${new Date(j.createdAt).toLocaleDateString("tr-TR")} · ${j.usage?.outputTokens ? `<span class="usage-pill">${Math.round((j.usage.inputTokens || 0) / 1000)}k→${Math.round(j.usage.outputTokens / 1000)}k token</span>` : (j.demo ? "demo" : "")}</div>
            <div class="lib-actions">
              <button class="btn primary" data-editor="${j.id}">Kurgu ve yayın</button>
              ${done ? `
                <button class="btn" data-play="${j.id}">▶ Oynat</button>
                <a class="btn" href="/api/jobs/${j.id}/file/output.mp4?dl=1">⬇ MP4</a>
                ${j.outputs?.thumbs?.length ? `<button class="btn" data-thumbs="${j.id}">🖼 Kapaklar</button>` : ""}
                <button class="btn" data-seo="${j.id}">SEO</button>
                ${j.outputs?.package ? `<button class="btn" data-pkg="${j.id}">YouTube paketi</button>` : ""}
                ${j.mediaKind === "docu" && j.status === "done" ? `<button class="btn" data-shorts="${j.id}" title="Bu belgeselin en güçlü 40-58 saniyesinden dikey YouTube Shorts: kancalı başlık, büyük altyazı, kanal kartı.">📱 Shorts</button>` : ""}
                ${j.mediaKind === "docu" && j.status === "done" ? `<button class="btn" data-repkg="${j.id}" title="Kapak sahneleri: işin kapak-kutusu klasöründeki LISTE.txt tariflerini ChatGPT'de üret, 01.png / 02.png olarak oraya koy; bu düğme kapakları ve başlıkları o sahnelerle yeniden kurar.">🖼 Kapakları yenile</button>` : ""}
                <button class="btn" data-folder="${j.id}">📁</button>` : ""}
              ${j.mediaKind === "docu" && done && j.status === "done" ? `<button class="btn" data-docu-rerender="${j.id}" title="Motor veya ses kütüphanesi güncellendiyse ya da bazı görseller/sesler eksik kaldıysa: kayıtlı görsel, ses ve müzik yeniden ödenmez, yalnızca eksikler üretilir ve video yeniden render edilir.">↻ Yeniden render / eksikleri tamamla</button>` : ""}
              <button class="btn danger" data-del="${j.id}">Sil</button>
            </div>
          </div>
        </div>`;
      }).join("") : '<div class="muted">Henüz tamamlanan video yok.</div>'}
    </div>`;

  $("#standaloneShorts", main)?.addEventListener("click", () => openStandaloneShorts());
  $$("[data-play]", main).forEach((b) => b.addEventListener("click", () => {
    modal(`<h3>${esc(state.jobs.get(b.dataset.play)?.meta?.title || "")}</h3>
      <video controls autoplay src="/api/jobs/${b.dataset.play}/file/output.mp4"></video>`);
  }));
  $$("[data-editor]",main).forEach(b=>b.addEventListener('click',()=>window.NovaEditor.open(b.dataset.editor,{api,modal,closeModal,toast,onChange:job=>{state.jobs.set(job.id,job);render();}})));
  $$("[data-thumbs]", main).forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.thumbs;
    const j = state.jobs.get(id);
    const names = { "thumb_a.jpg": "Sinematik", "thumb_b.jpg": "Renk Paneli", "thumb_c.jpg": "Çerçeve" };
    modal(`<h3>Kapak tasarımları <span class="muted" style="font-size:12px">— beğendiğini varsayılan yap veya indir</span></h3>
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px">
        ${(j.outputs.thumbs || []).map((t) => `
          <div style="background:var(--bg2); border:1px solid var(--border); border-radius:12px; overflow:hidden">
            <img src="/api/jobs/${id}/file/${t}?v=${Date.now()}" style="width:100%; display:block" />
            <div class="row" style="padding:9px; justify-content:space-between">
              <b style="font-size:12.5px">${esc(j.outputs.thumbLabels?.[t] || names[t] || t)}</b>
              <span class="row" style="gap:6px">
                <a class="btn" style="padding:5px 9px;font-size:11.5px" href="/api/jobs/${id}/file/${t}?dl=1">⬇</a>
                <button class="btn" style="padding:5px 9px;font-size:11.5px" data-setthumb="${t}">Varsayılan yap</button>
              </span>
            </div>
          </div>`).join("")}
      </div>`);
    $$("#modalBox [data-setthumb]").forEach((x) => x.addEventListener("click", async () => {
      await api(`/api/jobs/${id}/thumbnail`, { method: "POST", body: { name: x.dataset.setthumb } });
      toast("Varsayılan kapak güncellendi ✓");
      closeModal();
      render();
    }));
  }));
  $$("[data-seo]", main).forEach((b) => b.addEventListener("click", async () => {
    const res = await fetch(`/api/jobs/${b.dataset.seo}/file/seo.md`);
    const text = await res.text();
    modal(`<h3>SEO Paketi <button class="btn" style="float:right" id="seoCopy">Kopyala</button></h3><pre>${esc(text)}</pre>`);
    $("#seoCopy").addEventListener("click", () => { navigator.clipboard.writeText(text); toast("Kopyalandı"); });
  }));
  $$("[data-pkg]", main).forEach((b) => b.addEventListener("click", async () => {
    const res = await fetch(`/api/jobs/${b.dataset.pkg}/file/package.md`);
    const text = await res.text();
    modal(`<h3>YouTube paketi <button class="btn" style="float:right" id="pkgCopy">Kopyala</button></h3><pre>${esc(text)}</pre>`);
    $("#pkgCopy").addEventListener("click", () => { navigator.clipboard.writeText(text); toast("Kopyalandı"); });
  }));
  $$("[data-folder]", main).forEach((b) => b.addEventListener("click", () => api(`/api/jobs/${b.dataset.folder}/open-folder`, { method: "POST" })));
  $("[data-shorts]", main).forEach((b) => b.addEventListener("click", () => openShorts(b.dataset.shorts)));
  $("[data-repkg]", main).forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    toast("Kapaklar yenileniyor (kapak-kutusu sahneleriyle)...");
    try {
      const r = await api(`/api/jobs/${b.dataset.repkg}/package`, { method: "POST" });
      if (r?.error) throw new Error(r.error);
      toast(`Kapaklar hazır: ${(r.thumbs || []).length} kapak`);
      try { const j = await api(`/api/jobs/${b.dataset.repkg}`); if (j?.id) state.jobs.set(j.id, j); } catch {}
      render();
    } catch (e) {
      toast(String(e?.message || e), true);
    } finally {
      b.disabled = false;
    }
  }));
  $$("[data-docu-rerender]", main).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Video yeniden render edilsin mi?\nKayıtlı görsel, ses ve müzik yeniden ödenmez; yalnızca eksik kalanlar üretilir.")) return;
    b.disabled = true;
    try {
      const r = await api(`/api/jobs/${b.dataset.docuRerender}/rerender`, { method: "POST" });
      if (r?.job) state.jobs.set(r.job.id, r.job);
      toast("Yeniden render kuyruğa alındı");
      render();
    } catch (e) { toast(e.message, true); b.disabled = false; }
  }));
  $$("[data-del]", main).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Bu video ve tüm dosyaları silinsin mi?")) return;
    await api(`/api/jobs/${b.dataset.del}`, { method: "DELETE" });
    render();
  }));
}

// ---------- ayarlar ----------
/**
 * Tek tip anahtar satırı: durum rozeti + parola alanı + gerçek "Test et" düğmesi.
 * "Kayıtlı" olması çalıştığı anlamına gelmiyor — test düğmesi sağlayıcının en ucuz
 * salt-okunur ucuna gerçek bir istek atar, hiçbiri üretim tetiklemez.
 */
function keyRow({ id, which, label, has, need, hint, placeholder }) {
  const rozet = has
    ? `· <span style="color:var(--accent2)">kayıtlı ✓</span>`
    : (need ? `· <span style="color:var(--warn)">gerekli</span>` : `· <span class="muted">yok</span>`);
  return `
    <label class="field-label">${label} ${rozet}</label>
    <div class="row key-row">
      <input type="password" id="${id}" class="grow" autocomplete="off"
             placeholder="${has ? "•••••••• (değiştirmek için yeni anahtar gir)" : esc(placeholder || "")}" />
      <button class="btn" data-testkey="${which}" ${has ? "" : "disabled"} title="Anahtarı sağlayıcıya sorarak doğrula">Test et</button>
    </div>
    <div class="key-result" id="kr-${which}"></div>
    ${hint ? `<div class="hint">${hint}</div>` : ""}`;
}

function renderSettings(main) {
  const s = state.settings;
  main.innerHTML = `
    <div class="page-title">Ayarlar</div>
    <div class="page-sub">Anahtarlar bu bilgisayarda saklanır ve yalnızca seçtiğin sağlayıcıya yapılan API isteklerinde kullanılır.</div>
    ${state.health ? `<div class="banner ${state.health.ffmpeg ? "ok" : "bad"}">
      ${state.health.ffmpeg ? "✓ FFmpeg çalışıyor" : "✗ FFmpeg çalışmıyor"} —
      <code>${esc(state.health.ffmpegPath || "ffmpeg")}</code>
      ${state.health.code ? ` (${esc(state.health.code)})` : ""} · Node ${esc(state.health.node || "")}
    </div>
    ${state.health.home ? `<div class="banner">📁 Çalışma klasörü: <code>${esc(state.health.home)}</code>
      <span class="muted">— videolar, müzik ve ayarlar burada</span></div>` : ""}` : ""}
    <div class="card">
      <div class="settings-grid">
        <div class="full">
          ${keyRow({
            id: "sAnthropic", which: "anthropic", label: "ANTHROPIC API ANAHTARI",
            has: s.hasAnthropicKey, need: true, placeholder: "sk-ant-...",
            hint: "console.anthropic.com → API Keys. Senaryo, araştırma ve SEO için gerekli.",
          })}
        </div>
        <div>
          <label class="field-label">MODEL</label>
          <input id="sModel" value="${esc(s.model)}" />
          <div class="hint">Sağlayıcı hesabında erişebildiğin model kimliğini yaz. Fiyatını aşağıya ekleyebilirsin; yedek modele geçilirse onun kullanımı ayrıca kaydedilir.</div>
        </div>
        <div>
          <label class="field-label">DEMO MODU</label>
          <div class="chips" id="sDemo">
            <div class="chip ${s.demoMode ? "sel" : ""}" data-k="1">Açık (anahtarsız test)</div>
            <div class="chip ${!s.demoMode ? "sel" : ""}" data-k="0">Kapalı</div>
          </div>
        </div>
        <div>${keyRow({ id: "sPexels", which: "pexels", label: "PEXELS API",
          has: s.hasPexelsKey, placeholder: "pexels.com/api — ücretsiz",
          hint: "Stok video ve fotoğraf." })}</div>
        <div>${keyRow({ id: "sPixabay", which: "pixabay", label: "PIXABAY API",
          has: s.hasPixabayKey, placeholder: "pixabay.com/api/docs — ücretsiz",
          hint: "Stok video ve fotoğraf." })}</div>
        <div>${keyRow({ id: "sUnsplash", which: "unsplash", label: "UNSPLASH API",
          has: s.hasUnsplashKey, placeholder: "unsplash.com/developers — ücretsiz",
          hint: "Yüksek estetikli fotoğraf (atmosfer sahneleri)." })}</div>
        <div>${keyRow({ id: "sEuropeana", which: "europeana", label: "EUROPEANA API",
          has: s.hasEuropeanaKey, placeholder: "pro.europeana.eu/get-api — ücretsiz",
          hint: "Avrupa müze ve arşivleri — tarihî konular. Yalnızca ticari kullanıma açık eserler alınır." })}</div>
        <div class="hint" style="align-self:end; padding-bottom:6px">
          🛰 <b>NASA arşivi</b> anahtarsız çalışıyor, hep açık — bilim ve yer bilimleri konularında en güçlü kaynak.
        </div>
        <div>${keyRow({ id: "sEleven", which: "eleven", label: "ELEVENLABS API",
          has: s.hasElevenKey, placeholder: "elevenlabs.io",
          hint: "Premium seslendirme. Test kalan kotanı da gösterir." })}</div>
        <div>${keyRow({ id: "sReplicate", which: "replicate", label: "REPLICATE API",
          has: s.hasReplicateKey, placeholder: "replicate.com/account/api-tokens",
          hint: "Shorts hareketi (resimden video), Sinematik Belgesel 2.5D derinlik katmanları (yazı kişinin arkasına geçer); OpenAI anahtarı yoksa FLUX ile görsel üretimi." })}</div>
        <div>${keyRow({ id: "sKling", which: "kling", label: "KLING API",
          has: s.hasKlingKey, placeholder: "klingai.com → API → API Key",
          hint: "Resimden video, doğrudan Kling (Replicate'in yerine geçer). Açılış Kling 3.0 1080p, açılış dışı hareket Kling 2.5 Turbo 720p. Test kalan birimi gösterir." })}</div>
        <div>
          <label class="field-label">SHORTS HAREKETİ (${s.hasKlingKey ? "KLING" : "REPLICATE"})</label>
          <label class="row" style="gap:8px; font-size:13px"><input type="checkbox" id="sShortsMotion" ${s.shortsMotion !== false ? "checked" : ""}/> Açılış ve uygun sahneler gerçek harekete dönsün</label>
          <div class="row" style="gap:8px; margin-top:6px">
            <input id="sShortsMotionMax" type="number" min="0" max="20" value="${Number.isFinite(+s.shortsMotionMax) ? +s.shortsMotionMax : 4}" style="width:80px" title="Shorts başına en çok hareketli sahne"/>
            <input id="sRepVid" value="${esc(s.replicateVideoModel || "kwaivgi/kling-v2.5-turbo-pro")}" placeholder="kwaivgi/kling-v2.5-turbo-pro"/>
          </div>
          <label class="row" style="gap:8px; font-size:13px; margin-top:6px"><input type="checkbox" id="sDocuOpenMotion" ${s.docuOpeningMotion !== false ? "checked" : ""}/> Uzun video açılışı: gerçek klibi yoksa en çok 2 sahne hareketli</label>
          <label class="row" style="gap:8px; font-size:13px"><input type="checkbox" id="sDocuDepth" ${s.docuDepthLayers === true ? "checked" : ""}/> Uzun video 2.5D derinlik katmanları (sahne başına ücretli)</label>
          <div class="hint">Shorts başına en çok sahne ve (Kling anahtarı yoksa) Replicate modeli. Kling varsa açılış cümleleri Kling 3.0, kalanı 2.5 Turbo; klip cümle kadar (saniye başı ödenir). Gerçek kişi fotoğrafı ve belge asla canlandırılmaz.</div>
        </div>
        <div class="full" style="border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <b style="font-size:13px">🎥 Sinematik Belgesel — müzik ve ses</b>
          <div class="hint">Anlatım her zaman ElevenLabs v3 ile. Müzik ve efektler lisanslı ses kütüphanesinden kurgulanırsa ElevenLabs kredisi yalnızca anlatıma gider.</div>
        </div>
        <div>
          <label class="field-label">SENARİST</label>
          <select id="sDocuWriter">${[["claude-opus-5-5","Opus 5.5 · plan Opus, bölümler Sonnet"],["gpt-6.1-sol","GPT 6.1 · plan ve bölümler GPT"]].map(([v,l])=>`<option value="${v}" ${(s.docuWriterModel||"claude-opus-5-5")===v?"selected":""}>${l}</option>`).join("")}</select>
          <label class="field-label" style="margin-top:10px">AI GÖRSELLERİ</label>
          <select id="sDocuImageProvider">${[["openai","OpenAI API (GPT Image) · otomatik"],["manual","ChatGPT'de elle · API kredisi yok"],["replicate","Replicate (FLUX)"]].map(([v,l])=>`<option value="${v}" ${(s.docuImageProvider||"openai")===v?"selected":""}>${l}</option>`).join("")}</select>
          <div class="hint">"ChatGPT'de elle": Nova eksik görselleri işin klasöründe gorsel-kutusu/LISTE.txt'e numaralı yazar ve durur; ChatGPT'de üretip 01.png, 02.png… diye bırakınca "Kaldığı yerden devam et". OpenAI bakiyesi biterse de kendiliğinden bu kutuya geçer.</div>
          <div class="hint">Belgesel senaryosunu kim yazsın. Kurgu, sanat yönetmeni ve konu kimliği her durumda Opus 5.5; araştırma ve genel işler GPT 6.1; görsel analiz gpt-6-luna (OpenAI hata verirse Claude devralır).</div>
        </div>
        <div>
          <label class="field-label">ANLATIM SESİ (ELEVENLABS)</label>
          <div class="row" style="gap:8px; flex-wrap:wrap">
            <span class="hint" style="margin:0">Belgesel</span> <select id="sDocuVoiceModel">${[["eleven_v4","Eleven v4 · ses yönetmeni"],["eleven_v4_turbo","Eleven v4 Turbo · hızlı"]].map(([v,l])=>`<option value="${v}" ${(s.docuVoiceModel||"eleven_v4")===v?"selected":""}>${l}</option>`).join("")}</select>
            <span class="hint" style="margin:0">Shorts</span> <select id="sShortsVoiceModel">${[["eleven_v4","Eleven v4 · ses yönetmeni"],["eleven_v4_turbo","Eleven v4 Turbo · hızlı"]].map(([v,l])=>`<option value="${v}" ${(s.docuShortsVoiceModel||"eleven_v4")===v?"selected":""}>${l}</option>`).join("")}</select>
          </div>
          <div class="row" style="gap:8px; flex-wrap:wrap; margin-top:8px">
            <span class="hint" style="margin:0">Okuma hızı <span class="new-badge">SON GÜNCELLEME</span></span> <select id="sDocuVoiceSpeed">${[[1,"1,0x · kapalı"],[1.05,"1,05x"],[1.1,"1,1x · önerilen"],[1.15,"1,15x"]].map(([v,l])=>`<option value="${v}" ${Number(s.docuVoiceSpeed ?? 1.1)===v?"selected":""}>${l}</option>`).join("")}</select>
          </div>
          <div class="hint">Tutmuş anlatıcılar dakikada ~157-165 kelime konuşuyor, bizimkiler ~115-125. Yeni satırlar bu hızda okunur; önceden ödenmiş sesler yeniden ödenmez. Fısıltı ve yavaş yönlendirmeli satırlar hep 1,0x.</div>
          <div class="hint">Yalnızca Eleven v4: her satır bir ses sanatçısı gibi yönetilir — açılış alçak ve sakin, vurucu cümle kararlı, soru meraklı, ifşa nefes tutarak, bölüm sonu yumuşak; duyguya göre ince kararlılık ve satırlar arası doğal geçiş. Yazarın kendi yönlendirmesi ([whispers] gibi) her zaman önce gelir.</div>
        </div>
        <div>
          <label class="field-label">KANAL ADLARI (KÖŞE DAMGASI) <span class="new-badge">SON GÜNCELLEME</span></label>
          <div class="row" style="gap:8px; flex-wrap:wrap">
            ${[["epic","Tarih"],["news","Gündem"],["finance","Finans"]].map(([k,l])=>`<span class="hint" style="margin:0">${l}</span> <input type="text" id="sChan_${k}" maxlength="32" value="${esc(s.docuChannelNames?.[k] || "")}" placeholder="kanal adı" style="width:150px" />`).join("")}
          </div>
          <div class="hint">Videonun sağ üst köşesinde küçük kanal adı (tutmuş kanalların hepsinde var). Haritada, belgede ve bölüm kartında kenara çekilir. Boş bırakılan kanalda damga yok; ad yalnızca yeni işlere işlenir.</div>
        </div>
        <div>
          <label class="field-label">KANAL SESLERİ <span class="new-badge">SON GÜNCELLEME</span></label>
          <div class="row" style="gap:8px; flex-wrap:wrap">
            ${Object.entries(CHANNEL_VOICE_TR).map(([k, l]) => `<span class="hint" style="margin:0">${l}</span> <select id="sVoice_${k}" style="width:230px">${channelVoiceOptions(s.docuStyleVoices?.[k])}</select>`).join("")}
          </div>
          <div class="hint">Stüdyoda stil seçilince o kanalın sesi kendiliğinden seçilir. ★ sana özel sesler bu hesapta ElevenLabs Voice Design ile üretildi, başka hiçbir kanalda yok — ElevenLabs Ses Kütüphanesi'nde paylaşma. Yalnızca yeni işler etkilenir; eski işin sesi değişmez.</div>
        </div>
        <div>
          <label class="field-label">BELGESEL MÜZİĞİ</label>
          <div class="chips" id="sDocuMusic">
            <div class="chip ${(s.docuMusicSource || "library") === "library" ? "sel" : ""}" data-k="library">Ses kütüphanesi · kredi harcamaz</div>
            <div class="chip ${s.docuMusicSource === "eleven" ? "sel" : ""}" data-k="eleven">ElevenLabs bestesi · ~2.500 kredi/dk</div>
          </div>
          <div class="hint">Kütüphane: lisanslı parçalar sahnelerin duygusuna göre kesilir, künyesi SEO açıklamasına yazılır. ElevenLabs: her videoya özel beste; 12 dk'lık belgeselde ~30 bin kredi.</div>
        </div>
        <div>
          <label class="field-label">SES KÜTÜPHANESİ KLASÖRÜ</label>
          <input id="sAudioLib" value="${esc(s.audioLibraryDir || "")}" placeholder="${esc(s.audioLibrary?.defaultDir || "")}" />
          <div class="hint">${s.audioLibrary?.ready
            ? `✓ ${s.audioLibrary.tracks} parça · ${s.audioLibrary.sfx} efekt hazır.`
            : `<b style="color:var(--warn)">✗ library.json bulunamadı</b> — müzik ve efektler ElevenLabs'e düşer.`} Boş bırakırsan varsayılan klasör kullanılır.</div>
        </div>
        <div class="full" style="border-top:1px solid var(--border); padding-top:14px; margin-top:4px">
          <b style="font-size:13px">🎨 AI görsel ve video sağlayıcıları</b>
          <div class="hint">Kolaj, tam AI ve etkinleştirdiğin AI sahneleri için kullanılır. Sağlayıcı üretimleri hesabının tarifesine göre ücretlenir.</div>
        </div>
        <div>
          <label class="field-label">KEYFRAME (GÖRSEL) SAĞLAYICISI</label>
          <div class="chips" id="sImgProv">
            <div class="chip ${s.imageProvider === "openai" ? "sel" : ""}" data-k="openai">OpenAI · GPT Image</div>
            <div class="chip ${s.imageProvider === "kie" ? "sel" : ""}" data-k="kie">Kie AI</div>
            <div class="chip ${s.imageProvider === "fal" ? "sel" : ""}" data-k="fal">fal.ai</div>
            <div class="chip ${s.imageProvider === "higgs" ? "sel" : ""}" data-k="higgs">Higgsfield</div>
          </div>
          <div class="hint">OpenAI yüksek kaliteli görseller üretir; ayrı API anahtarı ve API bakiyesi gerekir. Hareketli video için sağdaki sağlayıcı kullanılır.</div>
        </div>
        <div>
          <label class="field-label">ANİMASYON (VİDEO) SAĞLAYICISI</label>
          <div class="chips" id="sVidProv">
            <div class="chip ${(s.videoProvider || s.imageProvider) === "kie" ? "sel" : ""}" data-k="kie">Kie AI</div>
            <div class="chip ${(s.videoProvider || s.imageProvider) === "fal" ? "sel" : ""}" data-k="fal">fal.ai</div>
            <div class="chip ${(s.videoProvider || s.imageProvider) === "higgs" ? "sel" : ""}" data-k="higgs">Higgsfield</div>
          </div>
          <div class="hint">API erişimi ve kullanım ücreti sağlayıcı hesabının planına bağlıdır; abonelik otomatik olarak ücretsiz API üretimi anlamına gelmez.</div>
        </div>
        <div>${keyRow({ id: "sOpenai", which: "openai", label: "OPENAI API ANAHTARI",
          has: s.hasOpenaiKey, placeholder: "OpenAI API anahtarı", hint: "ChatGPT aboneliğinden ayrı API kullanımıdır. Anahtar tarayıcıya geri gönderilmez." })}</div>
        <div><label class="field-label">OPENAI — GÖRSEL MODELİ</label><input id="sOpenaiImg" value="${esc(s.openaiImageModel || 'gpt-image-2')}" /></div>
        <div>${keyRow({ id: "sKie", which: "kie", label: "KIE AI ANAHTARI",
          has: s.hasKieKey, placeholder: "kie.ai → API Key" })}</div>
        <div>${keyRow({ id: "sHiggs", which: "higgs", label: "HIGGSFIELD ANAHTARI",
          has: s.hasHiggsKey, placeholder: "higgsfield.ai → API" })}</div>
        <div>${keyRow({ id: "sFal", which: "fal", label: "FAL.AI ANAHTARI",
          has: s.hasFalKey, placeholder: "fal.ai/dashboard/keys" })}</div>
        <div>
          <label class="field-label">HIGGSFIELD — GÖRSEL MODELİ</label>
          <input type="text" id="sHiggsImg" value="${esc(s.higgsImageModel || "")}" />
        </div>
        <div class="full">
          <label class="field-label">DRY-RUN (ücretsiz yerel üretim)</label>
          <div class="chips" id="sDry">
            <div class="chip ${s.dryRun ? "sel" : ""}" data-k="1">Açık — ücret yok</div>
            <div class="chip ${!s.dryRun ? "sel" : ""}" data-k="0">Kapalı — gerçek üretim</div>
          </div>
        </div>
        <div>
          <label class="field-label">KIE — GÖRSEL MODELİ</label>
          <input type="text" id="sKieImg" value="${esc(s.kieImageModel || "")}" />
        </div>
        <div>
          <label class="field-label">KIE — VİDEO MODELİ</label>
          <input type="text" id="sKieVid" value="${esc(s.kieVideoModel || "")}" />
        </div>
        <div>
          <label class="field-label">FAL — KEYFRAME (text-to-image)</label>
          <input type="text" id="sFalImg" value="${esc(s.falImageModel || "")}" />
        </div>
        <div>
          <label class="field-label">FAL — STİL KİLİDİ (image-to-image)</label>
          <input type="text" id="sFalEdit" value="${esc(s.falImageEditModel || "")}" />
        </div>
        <div class="full">
          <label class="field-label">FAL — ANİMASYON (image-to-video)</label>
          <input type="text" id="sFalVid" value="${esc(s.falVideoModel || "")}" />
        </div>
        <div>
          <label class="field-label">SES SAĞLAYICI</label>
          <select id="sTts">
            <option value="edge" ${s.ttsProvider === "edge" ? "selected" : ""}>Edge TTS (ücretsiz, önerilen)</option>
            <option value="eleven" ${s.ttsProvider === "eleven" ? "selected" : ""}>ElevenLabs (anahtar gerekli)</option>
          </select>
        </div>
        <div>
          <label class="field-label">FPS</label>
          <select id="sFps">${[24, 30, 60].map((f) => `<option ${s.fps === f ? "selected" : ""}>${f}</option>`).join("")}</select>
        </div>
        <div>
          <label class="field-label">RENDER KALİTESİ</label>
          <select id="sQuality">${[['hizli','Hızlı'],['dengeli','Dengeli'],['kalite','Yüksek kalite'],['custom','Özel CRF']].map(([v,t])=>`<option value="${v}" ${s.renderQuality===v?'selected':''}>${t}</option>`).join('')}</select>
          <label class="field-label">CRF · düşük değer daha kaliteli</label>
          <input type="number" id="sCrf" min="14" max="30" value="${s.crf}" />
        </div>
        <div>
          <label class="field-label">MÜZİK SES DÜZEYİ (0 - 0.5)</label>
          <input type="number" id="sMusic" min="0" max="0.5" step="0.02" value="${s.musicVolume}" />
          <div class="hint">Fon müziği için <b>music/</b> klasörüne mp3 at — anlatım sırasında otomatik kısılır.</div>
        </div>
        <div><label class="field-label">KURGU YOĞUNLUĞU</label><select id="sIntensity">${[['restrained','Sade'],['balanced','Dengeli'],['dynamic','Dinamik']].map(([v,t])=>`<option value="${v}" ${(s.editIntensity||'balanced')===v?'selected':''}>${t}</option>`).join('')}</select></div>
        <div><label class="field-label">SES TASARIMI</label><select id="sSound"><option value="1" ${s.soundDesign!==false?'selected':''}>Açık</option><option value="0" ${s.soundDesign===false?'selected':''}>Kapalı</option></select><label class="field-label">EFEKT SESİ (0–0.5)</label><input id="sSfx" type="number" min="0" max="0.5" step="0.01" value="${s.sfxVolume??.18}"/></div>
        <div class="full"><label class="field-label">MODEL FİYATLARI · 1 MİLYON TOKEN BAŞINA USD</label><p class="hint">Kullandığın hesabın fiyatlarını gir. Tanımsız modellerin maliyeti bilinmiyor olarak gösterilir. Her satır: model adı, giriş, çıkış, önbellek okuma, önbellek yazma.</p><textarea id="sRates" rows="4" placeholder="model-adi, 3, 15, 0.3, 3.75">${esc(Object.entries(s.modelRates||{}).map(([m,r])=>[m,r.input,r.output,r.cacheRead??'',r.cacheWrite??''].join(', ')).join('\n'))}</textarea></div>
        <div>
          <label class="field-label">PARALEL RENDER</label>
          <input type="number" id="sConc" min="1" max="12" value="${s.concurrency}" />
        </div>
        <div>
          <label class="field-label">SİNEMATİK GÖRÜNÜM (renk + vinyet)</label>
          <div class="chips" id="sCine">
            <div class="chip ${s.cinemaGrade !== false ? "sel" : ""}" data-k="1">Açık</div>
            <div class="chip ${s.cinemaGrade === false ? "sel" : ""}" data-k="0">Kapalı</div>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top:22px; justify-content:flex-end;">
        <button class="btn primary big" id="sSave">Kaydet</button>
        <button class="btn" id="sTestAll" title="Kayıtlı tüm anahtarları sağlayıcılara sorarak doğrula">🔑 Anahtarları test et</button>
        <button class="btn" id="sSweep" title="Bitmiş işlerin geçici render dosyalarını temizler; düzenleme kaynaklarını korur">🧹 Geçici dosyaları temizle</button>
      </div>
    </div>`;

  let demoSel = s.demoMode;
  $('#sCrf').addEventListener('input',()=>{$('#sQuality').value='custom';});
  $("#sDemo").addEventListener("click", (e) => {
    const c = e.target.closest("[data-k]"); if (!c) return;
    demoSel = c.dataset.k === "1";
    $$("#sDemo .chip").forEach((x) => x.classList.toggle("sel", x.dataset.k === (demoSel ? "1" : "0")));
  });
  let cineSel = s.cinemaGrade !== false;
  $("#sCine").addEventListener("click", (e) => {
    const c = e.target.closest("[data-k]"); if (!c) return;
    cineSel = c.dataset.k === "1";
    $$("#sCine .chip").forEach((x) => x.classList.toggle("sel", x.dataset.k === (cineSel ? "1" : "0")));
  });
  let drySel = s.dryRun !== false;
  $("#sDry").addEventListener("click", (e) => {
    const c = e.target.closest("[data-k]"); if (!c) return;
    drySel = c.dataset.k === "1";
    $$("#sDry .chip").forEach((x) => x.classList.toggle("sel", x.dataset.k === (drySel ? "1" : "0")));
  });
  // Kanal sesleri: liste henüz gelmediyse arka planda alınır, yalnızca açılır listeler doldurulur (yazılanlar silinmez).
  if (!state.elevenVoices && s.hasElevenKey) {
    api("/api/eleven-voices").then((v) => {
      state.elevenVoices = v.voices || [];
      state.elevenLibrary = v.library || [];
      for (const k of Object.keys(CHANNEL_VOICE_TR)) {
        const box = $("#sVoice_" + k);
        if (box) box.innerHTML = channelVoiceOptions(box.value);
      }
    }).catch(() => {});
  }
  let docuMusicSel = s.docuMusicSource || "library";
  $("#sDocuMusic").addEventListener("click", (e) => {
    const c = e.target.closest("[data-k]"); if (!c) return;
    docuMusicSel = c.dataset.k;
    $$("#sDocuMusic .chip").forEach((x) => x.classList.toggle("sel", x.dataset.k === docuMusicSel));
  });
  let imgProvSel = s.imageProvider || "kie";
  let vidProvSel = s.videoProvider || s.imageProvider || "kie";
  $("#sImgProv").addEventListener("click", (e) => {
    const c = e.target.closest("[data-k]"); if (!c) return;
    imgProvSel = c.dataset.k;
    $$("#sImgProv .chip").forEach((x) => x.classList.toggle("sel", x.dataset.k === imgProvSel));
  });
  $("#sVidProv").addEventListener("click", (e) => {
    const c = e.target.closest("[data-k]"); if (!c) return;
    vidProvSel = c.dataset.k;
    $$("#sVidProv .chip").forEach((x) => x.classList.toggle("sel", x.dataset.k === vidProvSel));
  });
  $("#sSave").addEventListener("click", async () => {
    const patch = {
      model: $("#sModel").value, ttsProvider: $("#sTts").value,
      fps: +$("#sFps").value, crf: +$("#sCrf").value,
      renderQuality:$('#sQuality').value,editIntensity:$('#sIntensity').value,soundDesign:$('#sSound').value==='1',sfxVolume:Number($('#sSfx').value),
      musicVolume: +$("#sMusic").value, concurrency: +$("#sConc").value,
      demoMode: demoSel, cinemaGrade: cineSel, dryRun: drySel,
      imageProvider: imgProvSel, videoProvider: vidProvSel,
      openaiImageModel: $("#sOpenaiImg").value.trim(),
      falImageModel: $("#sFalImg").value.trim(),
      falImageEditModel: $("#sFalEdit").value.trim(),
      falVideoModel: $("#sFalVid").value.trim(),
      kieImageModel: $("#sKieImg").value.trim(),
      kieVideoModel: $("#sKieVid").value.trim(),
      higgsImageModel: $("#sHiggsImg").value.trim(),
      docuMusicSource: docuMusicSel,
      audioLibraryDir: $("#sAudioLib").value.trim(),
      shortsMotion: $("#sShortsMotion").checked,
      docuVoiceModel: $("#sDocuVoiceModel").value,
      docuVoiceSpeed: Number($("#sDocuVoiceSpeed").value) || 1,
      docuChannelNames: Object.fromEntries(["epic", "news", "finance"].map((k) => [k, $("#sChan_" + k).value.trim()])),
      docuStyleVoices: Object.fromEntries(["epic", "news", "finance"].map((k) => [k, $("#sVoice_" + k)?.value ?? s.docuStyleVoices?.[k] ?? ""])),
      docuWriterModel: $("#sDocuWriter").value,
      docuImageProvider: $("#sDocuImageProvider").value,
      docuShortsVoiceModel: $("#sShortsVoiceModel").value,
      docuOpeningMotion: $("#sDocuOpenMotion").checked,
      docuDepthLayers: $("#sDocuDepth").checked,
      shortsMotionMax: Number($("#sShortsMotionMax").value) || 0,
      replicateVideoModel: $("#sRepVid").value.trim(),
    };
    for (const [id, key] of [["sOpenai", "openaiKey"], ["sAnthropic", "anthropicKey"], ["sPexels", "pexelsKey"], ["sPixabay", "pixabayKey"], ["sUnsplash", "unsplashKey"], ["sEuropeana", "europeanaKey"], ["sEleven", "elevenKey"], ["sReplicate", "replicateKey"], ["sKling", "klingKey"], ["sFal", "falKey"], ["sKie", "kieKey"], ["sHiggs", "higgsKey"]]) {
      const v = $("#" + id).value.trim();
      if (v) patch[key] = v;
    }
    const btn = $("#sSave");
    btn.disabled = true;
    try {
      patch.modelRates=Object.create(null);
      for(const line of $('#sRates').value.split('\n').filter(x=>x.trim())) {const [name,input,output,cacheRead,cacheWrite,...extra]=line.split(',').map(x=>x.trim());if(!name||!input||!output||extra.length)throw new Error('Model fiyatı satırı: model, giriş, çıkış, önbellek okuma, önbellek yazma');patch.modelRates[name]={input:Number(input),output:Number(output),...(cacheRead?{cacheRead:Number(cacheRead)}:{}),...(cacheWrite?{cacheWrite:Number(cacheWrite)}:{})};}
      const res = await api("/api/settings", { method: "POST", body: patch });
      state.settings = res.settings;
      state.elevenVoices = null; // sağlayıcı/anahtar değişmiş olabilir → liste yenilensin
      state.elevenVoicesError = null;
      state.health = await api("/api/health").catch(() => state.health);
      renderSidebarStatus(state.health || { ffmpeg: false });
      toast("Ayarlar kaydedildi ✓");
      renderSettings(main);
    } catch (e) {
      toast(e.message, true);
      btn.disabled = false;
    }
  });

  /** Tek anahtarı sağlayıcıya sorarak doğrula ve sonucu satırın altına yaz. */
  async function testKey(which, btn) {
    const kutu = $("#kr-" + which);
    if (!kutu) return false;
    const eski = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = "..."; }
    kutu.className = "key-result calisiyor";
    kutu.textContent = "sağlayıcıya soruluyor…";
    try {
      const r = await api(`/api/test-key/${which}`, { method: "POST" });
      kutu.className = "key-result " + (r.ok ? "iyi" : "kotu");
      kutu.textContent = (r.ok ? "✓ " : "✗ ") + r.bilgi;
      return r.ok;
    } catch (e) {
      kutu.className = "key-result kotu";
      kutu.textContent = "✗ " + e.message;
      return false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = eski; }
    }
  }

  $$("[data-testkey]", main).forEach((b) =>
    b.addEventListener("click", () => testKey(b.dataset.testkey, b)));

  $("#sTestAll").addEventListener("click", async () => {
    const btn = $("#sTestAll");
    const hepsi = $$("[data-testkey]", main).filter((b) => !b.disabled);
    if (!hepsi.length) return toast("Test edilecek kayıtlı anahtar yok", true);
    btn.disabled = true;
    const eski = btn.textContent;
    btn.textContent = "test ediliyor...";
    const sonuclar = await Promise.all(hepsi.map((b) => testKey(b.dataset.testkey, b)));
    const iyi = sonuclar.filter(Boolean).length;
    btn.textContent = eski;
    btn.disabled = false;
    toast(iyi === sonuclar.length
      ? `${iyi} anahtarın hepsi çalışıyor ✓`
      : `${iyi}/${sonuclar.length} anahtar çalışıyor — kırmızı olanlara bak`, iyi !== sonuclar.length);
  });

  $("#sSweep").addEventListener("click", async () => {
    if (!confirm("Bitmiş işlerin geçici render dosyaları temizlenecek.\nVideolar, kapaklar ve düzenleme kaynakları korunur.\n\nDevam edilsin mi?")) return;
    const btn = $("#sSweep");
    btn.disabled = true;
    try {
      const r = await api("/api/maintenance/sweep", { method: "POST" });
      toast(r.mb > 0 ? `${r.mb} MB geri kazanıldı (${r.jobs} iş) 🧹` : "Temizlenecek ara dosya yok ✓");
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- fikirler ----------
$("#ideasTab").addEventListener("click", () => ($("#ideasDrawer").hidden = false));
$("#ideasClose").addEventListener("click", () => ($("#ideasDrawer").hidden = true));
$("#ideasGo").addEventListener("click", generateIdeas);
$("#ideasNiche").addEventListener("keydown", (e) => e.key === "Enter" && generateIdeas());

async function generateIdeas() {
  const niche = $("#ideasNiche").value.trim();
  if (!niche) return toast("Önce niş yaz", true);
  $("#ideasList").innerHTML = '<div class="muted">Fikirler üretiliyor...</div>';
  try {
    const data = await api("/api/ideas", { method: "POST", body: { niche } });
    $("#ideasList").innerHTML = data.ideas.map((i, n) => `
      <div class="idea-card">
        ${i.series ? `<small class="muted">Seri: ${esc(i.series)}</small>` : ""}
        <b>${esc(i.title)}</b>
        <p>${esc(i.hook)}</p>
        <button class="btn" data-n="${n}">🎬 Bunu üret</button>
      </div>`).join("");
    $$("#ideasList .btn").forEach((b) => b.addEventListener("click", () => {
      const idea = data.ideas[+b.dataset.n];
      state.form.topic = idea.title;
      state.form.theme = idea.theme || "belgesel";
      state.form.durationPreset = idea.durationPreset || "detayli";
      if (idea.series) state.form.docuSeries = idea.series; else delete state.form.docuSeries;
      $("#ideasDrawer").hidden = true;
      location.hash = "#studio";
      state.page = "studio"; render();
      toast("Fikir forma aktarıldı");
    }));
  } catch (e) {
    $("#ideasList").innerHTML = `<div class="muted">Hata: ${esc(e.message)}</div>`;
  }
}

boot().catch((e) => toast("Başlatılamadı: " + e.message, true));

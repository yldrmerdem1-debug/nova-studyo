import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { DATA_DIR, readJson, writeJson } from "./util.js";
import { varsayilanWpm } from "./pipeline/tempo.js";

const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const require = createRequire(import.meta.url);

/**
 * ffmpeg/ffprobe yolu. Son kullanıcının makinesinde PATH'te ffmpeg olmayabilir;
 * paketle birlikte gelen ikilileri kullan. asar içinde çalıştırılamayacağı için
 * electron-builder bunları asarUnpack ile app.asar.unpacked altına açar.
 */
function bundledBin(kind) {
  try {
    let p = kind === "ffmpeg"
      ? require("ffmpeg-static")
      : require("ffprobe-static").path;
    if (typeof p !== "string") return null;
    p = p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

export const DEFAULT_SETTINGS = {
  anthropicKey: "",
  model: "claude-opus-5-5",
  useWebSearch: true,
  pexelsKey: "",
  pixabayKey: "",
  unsplashKey: "",
  // Europeana: Avrupa müze/arşivleri. NASA anahtar İSTEMİYOR (images-api
  // herkese açık), o yüzden burada yalnızca Europeana var.
  europeanaKey: "",
  elevenKey: "",
  // Sinematik Belgesel modu: görseller (flux, tutarlı karakter, derinlik katmanları) Replicate'ten.
  replicateKey: "",
  // Shorts hareketi: resimden videoya (Replicate). Açılış cümleleri her zaman, sonra uygun
  // (AI ya da kişisiz arşiv) cümleler tavana kadar canlanır; gerçek kişi fotoğrafı ve belge
  // asla (yüz bozulur, belge sahtelenir). Klip başına ~5 sn.
  shortsMotion: true,
  shortsMotionMax: 4,
  // Uzun video: açılışta gerçek klibi olmayan en çok 2 hareketli AI sahnesi resimden videoya.
  docuOpeningMotion: true,
  // Sinematik Belgesel ve Shorts anlatım modeli. eleven_v4: ses yönetmeni her satırı tonlar
  // (açılış alçak ve sakin, vurucu satır kararlı, soru meraklı, bölüm sonu yumuşak; duyguya göre
  // sürekli kararlılık; satırlar arası bağlam). eleven_v3: eski okuma ve önbellekteki sesler.
  docuVoiceModel: "eleven_v4",
  docuShortsVoiceModel: "eleven_v4",
  // Uzun video 2.5D derinlik katmanları (kişi kesme + silme): sahne başına ücretli Replicate çağrısı.
  docuDepthLayers: false,
  replicateVideoModel: "kwaivgi/kling-v2.5-turbo-pro",
  // Sinematik Belgesel ses kütüphanesi (library.json: lisanslı müzik + efekt/ortam
  // sesleri). Boş = <veri klasörü>/audio-library. Makineye özel bir yol olduğu için
  // işin ayar kopyasına girmez (SNAPSHOT_KEYS).
  audioLibraryDir: "",
  // Belgesel müziği: "library" = kütüphanedeki parçalardan kurgulanır (ElevenLabs
  // kredisi harcamaz) · "eleven" = her videoya ElevenLabs ile özel beste
  // (dakikada ~900-2.500 kredi; 10 dk'lık videoda sesin 2-3 katı).
  docuMusicSource: "library",
  // Sinematik Belgesel: video (iş) başına Claude harcama tavanı, tahmini $ (bütün çalıştırmalar
  // toplamı). Aşılınca isteğe bağlı adımlar (QA görme denetimi, otomatik düzeltme yeniden
  // seçimi, dönem denetiminin 2. turu) atlanır; zorunlu adımlar biter. 0 = tavan yok.
  docuMaxClaudeUsd: 4,
  ttsProvider: "edge", // edge | eleven
  // ElevenLabs modeli. Ölçüldü (2026-08-07, canlı API): her ikisi de Türkçe
  // destekliyor ve /with-timestamps ile kelime zamanı döndürüyor — yani ekran
  // yazısı ve altyazı senkronu ikisinde de çalışır.
  //   eleven_multilingual_v2 → uzun anlatımda oturmuş, öngörülebilir. VARSAYILAN.
  //   eleven_v3              → en yeni, daha ifadeli; belgesel için bazen fazla oyunculu.
  elevenModel: "eleven_multilingual_v2",
  // Ses karakteri. ElevenLabs varsayılanları gönderilmiyordu; belgesel anlatımı
  // için istikrar biraz yüksek tutulur (cümleden cümleye ton kaymasın).
  elevenStability: 0.45,
  elevenSimilarity: 0.75,
  elevenStyle: 0.0,          // 0 = sakin anlatım; yükseldikçe dramatize eder
  elevenSpeakerBoost: true,
  elevenSpeed: 1.0,          // 0,9 ağır belgesel · 1,1 tempolu. Ölçüldü: ±%20 süre
  // Sayı/tarih okuma. "on" = "10935" → "ten thousand nine hundred thirty-five".
  // Varsayılan "auto" ham rakamı bırakıyordu; belgesel sayı dolu olduğu için açık.
  // Kelime zamanları `alignment`tan geldiği için ekrandaki yazı senaryo metnini
  // korur — yalnızca SES değişir.
  elevenNormalize: "on",     // on | auto | off
  // Kolaj modu: keyframe + animasyon üretimi (ayrı sağlayıcı seçilebilir)
  imageProvider: "kie", // kie | fal | higgs | openai
  videoProvider: "kie", // kie | fal | higgs
  openaiKey: "",
  openaiImageModel: "gpt-image-2",
  higgsKey: "",
  higgsImageModel: "flux",
  higgsVideoModel: "",
  falKey: "",
  falImageModel: "fal-ai/bytedance/seedream/v4/text-to-image",
  falImageEditModel: "fal-ai/bytedance/seedream/v4/edit",
  falVideoModel: "fal-ai/bytedance/seedance/v1/pro/image-to-video",
  kieKey: "",
  kieImageModel: "nano-banana-2",
  // Ölçüldü (2026-08-07, canlı API): "veo3-fast" Kie tarafından TANINMIYOR
  // ("model name is not supported") — yani animasyon adımı her klipte sessizce
  // patlıyordu. Bu hesapta tanınan tek video modeli sora-2; şu an sağlayıcıda
  // duraklatılmış durumda. Doğru adı yazıyoruz ki açıldığında çalışsın.
  kieVideoModel: "sora-2-image-to-video",
  dryRun: true, // varsayılan: ücretsiz yerel üretim
  fps: 30,
  width: 1920,
  height: 1080,
  crf: 20,
  preset: "veryfast",
  renderQuality: "dengeli", // hizli | dengeli | kalite — crf/preset'i belirler
  musicVolume: 0.16,
  ffmpegPath: bundledBin("ffmpeg") || "ffmpeg",
  ffprobePath: bundledBin("ffprobe") || "ffprobe",
  cinemaGrade: true,
  keepIntermediate: true, // sahne düzenleme ve kaldığı yerden devam için kaynakları koru
  soundDesign: true,
  sfxVolume: 0.18,
  editIntensity: "balanced",
  modelRates: {}, // hesap/model fiyatları kullanıcı tarafından USD / milyon token olarak girilir
  demoMode: false,
  // Ölçüldü: cpus/2 ile sahne aşaması 242 sn, cpus-2 ile 134 sn (%45 hızlı).
  //
  // DÜZELTME 1: buradaki eski gerekçe — "ffmpeg tek klipte tek çekirdek
  // kullanıyor" — YANLIŞTI. x264 kendi başına bırakılınca çekirdek sayısı
  // kadar iş parçacığı açar; 10 paralel kodlama 120 iş parçacığı demekti ve
  // bellek tükenip 25 kesmenin hepsi düştü (bkz. encThreads). Paralellik
  // sayısı doğru, eksik olan iş parçacığı tavanıydı — o da videoEnc'te verildi.
  //
  // DÜZELTME 2 — cpus−2'den cpus/2'ye çekildi. İş parçacığı tavanından SONRA
  // bile ffmpeg aynı gün ÜÇ ayrı işte 0xC0000005 (erişim ihlali) ile çöktü:
  // iki kez geçiş, bir kez kesme aşamasında (20260812-798d89, 84 kesmenin
  // 72'si bittikten sonra). Çökmelerin kök sebebi bulunamadı — yerelde aynı
  // paralellikte defalarca sorunsuz koşuldu, yani aralıklı bir durum.
  //
  // Kök sebep bilinmiyorken doğru davranış baskıyı azaltmak: 12 çekirdekte
  // 10 yerine 6 süreç. Render ~%25 uzuyor, ama çöküp 81 dakikayı baştan
  // yapmaktan kıyaslanamaz derecede iyi. Kullanıcı bunu ayarlardan
  // değiştirebiliyor. Ayrıca her aşamada kurtarma yolu var, bu yalnızca
  // çökme OLASILIĞINI düşürüyor.
  concurrency: Math.max(2, Math.round(os.cpus().length / 2)),
};

let settings = { ...DEFAULT_SETTINGS, ...(readJson(SETTINGS_FILE, {}) || {}) };

// GÖÇ: artık geçersiz olan sağlayıcı model adları.
// "veo3-fast" Kie tarafından tanınmıyor ("model name is not supported") ve
// kayıtlı ayara yazılmış olduğu için varsayılanı düzeltmek yetmiyordu —
// animasyon adımı her klipte sessizce patlıyordu. Kayıtlı değer bunlardan
// biriyse geçerli varsayılana çekilir.
const OLU_VIDEO_MODELLERI = new Set(["veo3-fast", "veo3", "veo3.1", "google/veo-3"]);
if (OLU_VIDEO_MODELLERI.has(settings.kieVideoModel)) {
  settings.kieVideoModel = DEFAULT_SETTINGS.kieVideoModel;
}

// Kayıtlı ffmpeg yolu paketle gelen ikiliyi gölgelemesin. İki durum var:
//  1) çıplak "ffmpeg"/"ffprobe" → PATH'e bağımlı, son kullanıcıda çalışmayabilir
//  2) başka bir makinedeki/eski kurulumdaki mutlak yol → artık mevcut değil
// İkisinde de gömülü ikiliye dön.
for (const [key, kind] of [["ffmpegPath", "ffmpeg"], ["ffprobePath", "ffprobe"]]) {
  const fallback = DEFAULT_SETTINGS[key];
  if (fallback === kind) continue; // gömülü ikili yok, elde bir şey yok
  const cur = settings[key];
  const stale = cur === kind || (path.isAbsolute(cur || "") && !fs.existsSync(cur));
  if (stale) settings[key] = fallback;
}

/**
 * Render kalite kademeleri. x264'te "preset" hızı, "crf" kaliteyi belirler;
 * ikisi bağımsız. Eski varsayılan veryfast/crf20 hızı seçiyordu — kalite
 * isteyen kullanıcı artık kademeyi yükseltebiliyor.
 */
export const RENDER_QUALITIES = {
  hizli: { ad: "Hızlı", preset: "veryfast", crf: 20, aciklama: "En kısa render — deneme videoları için" },
  dengeli: { ad: "Dengeli", preset: "medium", crf: 18, aciklama: "Belirgin daha temiz görüntü, ~2× render süresi" },
  kalite: { ad: "En yüksek", preset: "slow", crf: 16, aciklama: "Yayın kalitesi, ~4× render süresi" },
};

/**
 * ORTAK VİDEO KODLAYICI AYARLARI.
 *
 * Final tur artık altyazı kapalıyken `-c:v copy` yapıyor (36,7 sn → 0,3 sn),
 * dolayısıyla GOP ve renk etiketleri KLİPLERE girmeli — final turda eklenirse
 * kopyalanan akışta hiç bulunmaz.
 *
 *  -g / -keyint_min / -sc_threshold : sabit 2 sn'lik GOP. YouTube'un yeniden
 *      kodlaması sahne kesmelerinde bozulmasın diye.
 *  bt709 etiketleri : yoksa oynatıcılar renk uzayını tahmin ediyor ve renk kayıyor.
 */
/**
 * Kodlama başına x264 iş parçacığı sayısı.
 *
 * ÖLÇÜLEN KUSUR (20260811-130aa9): render "25 kesme (10 paralel)" diyerek
 * başladı ve 25 kesmenin HEPSİ düştü — her biri şu hatayla:
 *   x264 [error]: malloc of size 11619264 failed
 *   Generic error in an external library   (ffmpeg AVERROR_EXTERNAL)
 * Hepsi yedek karta düştü, sonra final kodlama da aynı yerde çöktü.
 *
 * Sebep çarpım: `concurrency` = çekirdek − 2 = 10 paralel ffmpeg, ve ffmpeg
 * kendi başına bırakıldığında x264'e çekirdek sayısı kadar (12) iş parçacığı
 * açıyor. 10 × 12 = 120 kodlayıcı iş parçacığı ve her biri 1080p kare/lookahead
 * tamponu ayırıyor. 15,7 GB'lık makinede bellek bitiyor.
 *
 * Yeniden üretildi: aynı ffmpeg ile TEK kodlama sorunsuz (çıkış 0), 10 paralel
 * kodlamada üç süreç aynı malloc hatasını verdi.
 *
 * Çözüm bölüşme: toplam iş parçacığı çekirdek sayısını aşmasın. Böylece hem
 * bellek düşüyor hem de aşırı bağlam değiştirme kalkıyor.
 */
export function encThreads(st) {
  const cekirdek = Math.max(1, os.cpus().length);
  const paralel = Math.max(1, st?.concurrency || 1);
  return String(Math.max(1, Math.floor(cekirdek / paralel)));
}

export function videoEnc(st, crf = st.crf) {
  return [
    "-c:v", "libx264", "-preset", st.preset, "-crf", String(crf),
    // İş parçacığı sınırı ŞART: sınırsız bırakılınca 10 paralel kodlama
    // 120 iş parçacığı açıp belleği tüketiyor (bkz. encThreads).
    "-threads", encThreads(st),
    "-pix_fmt", "yuv420p",
    "-g", String(st.fps * 2), "-keyint_min", String(st.fps * 2), "-sc_threshold", "0",
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
  ];
}

export function getSettings() {
  // Kalite kademesi crf/preset'i EZER — kullanıcı iki yerden çelişkili ayar
  // yapamasın diye tek kaynak burası.
  const q = RENDER_QUALITIES[settings.renderQuality];
  return q ? { ...settings, preset: q.preset, crf: q.crf } : settings;
}

export function saveSettings(patch) {
  if (("crf" in patch || "preset" in patch) && !("renderQuality" in patch)) patch = { ...patch, renderQuality: "custom" };
  settings = { ...settings, ...patch };
  writeJson(SETTINGS_FILE, settings);
  return settings;
}

export function publicSettings() {
  const s = { ...getSettings() };
  s.hasAnthropicKey = !!s.anthropicKey;
  s.hasPexelsKey = !!s.pexelsKey;
  s.hasPixabayKey = !!s.pixabayKey;
  s.hasUnsplashKey = !!s.unsplashKey;
  s.hasEuropeanaKey = !!s.europeanaKey;
  s.hasElevenKey = !!s.elevenKey;
  s.hasFalKey = !!s.falKey;
  s.hasKieKey = !!s.kieKey;
  s.hasHiggsKey = !!s.higgsKey;
  s.hasOpenaiKey = !!s.openaiKey;
  s.hasReplicateKey = !!s.replicateKey;
  delete s.anthropicKey; delete s.pexelsKey; delete s.pixabayKey; delete s.elevenKey; delete s.unsplashKey;
  delete s.falKey; delete s.kieKey; delete s.higgsKey; delete s.openaiKey; delete s.europeanaKey; delete s.replicateKey;
  const lib = audioLibraryInfo(s);
  s.audioLibrary = { dir: lib.dir, defaultDir: audioLibraryDir({}), ready: lib.ready, tracks: lib.tracks, sfx: lib.sfx };
  return s;
}

/** Sinematik Belgesel ses kütüphanesinin klasörü (ayar boşsa veri klasörünün altı). */
export function audioLibraryDir(st = getSettings()) {
  return String(st?.audioLibraryDir || "").trim() || path.join(DATA_DIR, "audio-library");
}

// library.json yüzlerce KB olabilir ve /api/state sık çağrılıyor: değişmedikçe yeniden okunmaz.
const libCache = new Map();
/**
 * Kütüphanenin durumu. `version` library.json içeriğinin özeti: kütüphane
 * değişince (yeni parça, yeniden etiketleme) belgesel yeniden render edilir.
 */
export function audioLibraryInfo(st = getSettings()) {
  const dir = audioLibraryDir(st);
  const file = path.join(dir, "library.json");
  let stat = null;
  try { stat = fs.statSync(file); } catch {}
  if (!stat) return { dir, ready: false, version: "none", tracks: 0, sfx: 0 };
  const hit = libCache.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.info;
  let info = { dir, ready: false, version: "unreadable", tracks: 0, sfx: 0 };
  try {
    const buf = fs.readFileSync(file);
    const j = JSON.parse(buf.toString("utf8"));
    const tracks = Array.isArray(j.music) ? j.music.length : 0;
    const sfx = Array.isArray(j.sfx) ? j.sfx.length : 0;
    info = { dir, ready: tracks > 0 || sfx > 0, version: crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16), tracks, sfx };
  } catch {}
  libCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, info });
  return info;
}

const SNAPSHOT_KEYS = Object.keys(DEFAULT_SETTINGS).filter(k => !/Key$/.test(k) && !['ffmpegPath','ffprobePath','keepIntermediate','audioLibraryDir'].includes(k));
export function snapshotSettings() {
  const current = getSettings();
  return JSON.parse(JSON.stringify(Object.fromEntries(SNAPSHOT_KEYS.map(k => [k, current[k]]))));
}
export function getJobSettings(job) {
  const saved = job?.settingsSnapshot || {};
  const safe = Object.fromEntries(SNAPSHOT_KEYS.filter(k => Object.hasOwn(saved,k)).map(k => [k,saved[k]]));
  return { ...getSettings(), ...safe };
}

// ---------- content presets ----------

export const THEMES = {
  vox: {
    name: "Vox / Açıklayıcı",
    desc: "Hızlı tempolu, veri odaklı — ekranda grafikler",
    style:
      "Vox tarzı açıklayıcı gazetecilik. 'Şunu fark ettiniz mi?' diye başla, bir bilmece kur ve adım adım çöz. " +
      "Her iddiayı somut bir sayıyla destekle. Kısa, vurucu cümleler; ara sıra tek kelimelik vurgu cümleleri kullan. " +
      "İzleyiciye 'siz' diye hitap et, karmaşık şeyleri günlük benzetmelerle anlat.",
  },
  belgesel: {
    name: "Belgesel",
    desc: "Sinematik, ölçülü, anlatı odaklı",
    style: "Sinematik belgesel anlatımı. Sahneler kur, gerilim inşa et, insan hikâyesine odaklan. Tarihler ve olgular kesin olsun.",
  },
  haber: {
    name: "Haber / Güncel",
    desc: "Haber-yorum tarzı — net, hızlı, bağlam veren",
    style: "Haber-analiz tarzı. Ne oldu, neden önemli, arka plan ne, sırada ne var. Net cümleler, güçlü bağlam.",
  },
  top5: {
    name: "En İyiler Listesi",
    desc: "Enerjik geri sayım — büyük vaatler, canlı",
    style: "Geri sayım formatı (örn. Top 5/10). Her madde kendi mini hikâyesi olan bir bölüm. Sıralamayı merak ettir, en iyiyi sona sakla.",
  },
  analiz: {
    name: "Analiz / Derin İnceleme",
    desc: "Veri odaklı, sakin akıl yürütme, istatistikler",
    style: "Derin analiz. Sayılar, karşılaştırmalar, neden-sonuç zincirleri. İddiaları kanıtla destekle, karşı argümanları da ele al.",
  },
  egitim: {
    name: "Eğitim",
    desc: "Anlaşılır anlatım — net, adım adım",
    style: "Öğretici anlatım. Basitten karmaşığa adım adım ilerle, örneklerle ve benzetmelerle somutlaştır, ara özetler ver.",
  },
  hikaye: {
    name: "Hikâye Anlatımı",
    desc: "Sürükleyici kurgu — karakter, çatışma, çözüm",
    style: "Güçlü hikâye kurgusu: kanca, yükselen gerilim, doruk, çözüm. Karakterlerin motivasyonlarını hissettir.",
  },
};

export const TONES = {
  varsayilan: { name: "Varsayılan (tema sesi)", prompt: "" },
  egitici: { name: "Eğitici", prompt: "Ton: öğretici, sabırlı, net." },
  // MİZAH TONLARI SOMUT TARİF EDİLİR — tek satırlık "esprili ol" işe yaramıyor.
  //
  // Ölçüldü (20260812-af4f58, ton "komik" seçili): metin baştan sona kuru bir
  // fizik dersi çıktı — "International Atomic Time, maintained by the Bureau
  // International des Poids et Mesures at Sèvres outside Paris, averages
  // hundreds of cesium clocks". Tek bir espri yok.
  //
  // Üç sebep vardı: (1) ton tek satırdı ve sekiz satırlık istemin içinde
  // kayboluyordu, (2) kanal yönlendirmesi onu iptal edebiliyordu, (3) çapa
  // kuralı ("her cümlede gösterilebilir bir şey olsun") yoğun olgu cümlesine
  // itiyor ve mizahla çekişiyordu.
  //
  // Çözüm üçünü birden karşılıyor: mizah AYRI bir şaka cümlesi değil, olgu
  // cümlesinin İÇİNDE yaşar. Böylece hem komik olur hem çapa korunur.
  komik: {
    name: "Komik / Mizahi",
    prompt: [
      "TON: KOMİK. Bu bir zorunluluk, süs değil — metin gerçekten güldürmeli.",
      "Mizah AYRI şaka cümlesi olarak değil, OLGU CÜMLESİNİN İÇİNDE yaşar:",
      "- Absürt rakamı gündelik bir şeyle kıyasla: '820 bin metreküp gaz — altı",
      "  olimpik havuz, ama nefes almak istemeyeceğin cinsten.'",
      "- Kurulumu yap, sonra tek kelimeyle indir: '...ve sonuç tam bir felaket.",
      "  Yani hayır, değil. Neredeyse hiçbir şey olmuyor.'",
      "- Küçümseyerek söyle: dünyanın en büyük olayını 'hafif bir esinti' diye geç.",
      "- Ciddi ağızla saçmalığı kaydet: bilimsel terimi absürt konuya ciddiyetle uygula.",
      "İki kural: espri OLGUYU bozmayacak (rakamlar gerçek kalacak) ve her",
      "bölümde en az iki yerde güldürecek. Kelime oyunu ve 'komik ses efekti'",
      "tarifi yazma — mizah cümlenin kendisinden çıksın.",
    ].join("\n"),
  },
  alayci: {
    name: "Alaycı",
    prompt: [
      "TON: ALAYCI. İnce iğneleme, ama zeki ve kanıtlı — bağırmadan.",
      "Alay OLGUYA dayansın: çelişkiyi göster, yorumu izleyiciye bırak.",
      "'Şirket güvenliği önemsediğini açıkladı. Aynı yıl bütçesini yarıya indirdi.'",
      "Hakaret ve genelleme yok; keskinlik ayrıntıdan gelir.",
    ].join("\n"),
  },
  karamizah: {
    name: "Kara Mizah",
    prompt: [
      "TON: KARA MİZAH. Ciddi konuda kuru, keskin espri — acıyı küçümsemeden.",
      "Espriyi olgunun soğukluğundan çıkar, kurbanla dalga geçmeden.",
      "Kurulum ciddi, iniş kuru olsun; abartılı ünlem ve şaka kalıbı kullanma.",
    ].join("\n"),
  },
  dramatik: { name: "Dramatik", prompt: "Ton: dramatik ve yoğun; duygusal vurgular güçlü." },
  sohbet: { name: "Sohbet Havasında", prompt: "Ton: samimi sohbet; izleyiciye arkadaşça hitap et." },
  ilham: { name: "İlham Verici", prompt: "Ton: ilham verici, yükselen enerji, motive edici kapanışlar." },
  gizemli: { name: "Gizemli", prompt: "Ton: gizemli ve merak uyandıran; soruları yavaş yavaş cevapla." },
  arastirmaci: { name: "Araştırmacı", prompt: "Ton: araştırmacı gazeteci; kanıt odaklı, sorgulayan." },
  coskulu: { name: "Coşkulu", prompt: "Ton: yüksek enerji, heyecanlı, tempolu." },
};

export const DURATIONS = {
  test: { name: "1 dakika", minutes: 1, badge: "1 dk" },
  kisa: { name: "Kısa", minutes: 3, badge: "3 dk" },
  standart: { name: "Standart", minutes: 8, badge: "8 dk" },
  uzunformat: { name: "Uzun Format", minutes: 10, badge: "10 dk" },
  detayli: { name: "Detaylı", minutes: 12, badge: "12 dk" },
  derin: { name: "Derinlemesine", minutes: 20, badge: "20 dk" },
  uzun: { name: "Uzun Metraj", minutes: 30, badge: "30 dk" },
};

export const VOICES = {
  "tr-TR-AhmetNeural": { name: "Ahmet — TR Erkek", lang: "tr", provider: "edge" },
  "tr-TR-EmelNeural": { name: "Emel — TR Kadın", lang: "tr", provider: "edge" },
  "en-US-GuyNeural": { name: "Guy — US Erkek (otoriter)", lang: "en", provider: "edge" },
  "en-US-JennyNeural": { name: "Jenny — US Kadın (sıcak)", lang: "en", provider: "edge" },
  "en-US-ChristopherNeural": { name: "Christopher — US Erkek (derin)", lang: "en", provider: "edge" },
  "en-GB-RyanNeural": { name: "Ryan — UK Erkek (belgesel)", lang: "en", provider: "edge" },
  "en-GB-SoniaNeural": { name: "Sonia — UK Kadın", lang: "en", provider: "edge" },
  "en-AU-WilliamNeural": { name: "William — AU Erkek", lang: "en", provider: "edge" },
};

// tone → TTS prosody
/**
 * TON → SESLENDİRME. Hem hız hem PERDE.
 *
 * Eskiden yalnızca `rate` vardı: komik ton için tek fark "%6 daha hızlı"ydı.
 * Metin komik yazılsa bile düz perdeyle okununca espri ölüyordu — kullanıcı
 * sordu: "ses ayarı da verildi mi, komik anlatılıyor mu".
 *
 * Perde (pitch) eklendi. Yükseltmek hafiflik ve şaşkınlık, alçaltmak ağırlık
 * ve tehdit duygusu veriyor. Değerler ölçülü: ±%10'un üstünde Edge sesi
 * metalikleşiyor ve doğallık kayboluyor.
 */
export const TONE_PROSODY = {
  varsayilan: { rate: "+2%", pitch: "+0%" },
  egitici: { rate: "-2%", pitch: "+0%" },
  // Komik: belirgin şekilde hızlı ve tiz — hafif, tempolu, şaşırmış anlatım.
  komik: { rate: "+8%", pitch: "+6%" },
  // Alaycı: normal hız, hafif tiz — iğneleme burun kıvırmayla gelir.
  alayci: { rate: "+2%", pitch: "+3%" },
  // Kara mizah: yavaş ve pes — kuru espri soğuklukla çalışır.
  karamizah: { rate: "-3%", pitch: "-4%" },
  dramatik: { rate: "-6%", pitch: "-5%" },
  sohbet: { rate: "+4%", pitch: "+2%" },
  ilham: { rate: "+2%", pitch: "+3%" },
  gizemli: { rate: "-8%", pitch: "-6%" },
  arastirmaci: { rate: "+0%", pitch: "+0%" },
  coskulu: { rate: "+10%", pitch: "+6%" },
};

/**
 * TON → ELEVENLABS ses ayarları.
 *
 * ElevenLabs'te ton HİÇ kullanılmıyordu: her videoda `stability 0.45,
 * style 0` sabit gidiyordu ve `style: 0` en düz okuma demek. Yani komik
 * seçilse bile ElevenLabs sesi belgesel ağzıyla okuyordu.
 *
 * stability düşük = cümleden cümleye daha çok tonlama değişimi (canlı ama
 * oynak), yüksek = istikrarlı (sakin ama düz). style yüksek = abartılı
 * ifade; 0,5 üstü ElevenLabs'te bozulma ve hızlanma yapabiliyor, o yüzden
 * tavan 0,45'te tutuldu.
 */
/**
 * TON → ELEVENLABS v3 SES ETİKETLERİ.
 *
 * ElevenLabs v3, metnin içine konan `[laughs]` gibi etiketleri OYNUYOR —
 * okumuyor. Kullanıcı üç örneği dinleyip etiketli olanı seçti.
 *
 * Doğal durması için kural sayıda: etiket seyrek olmalı. Her cümlede gülen
 * bir anlatıcı sinir bozucu; espri de değerini kaybediyor.
 *
 * Etiketi olmayan tonlar v2'de kalır — v3 `stability`/`style` desteklemiyor
 * (model listesinde yalnızca "tts" yazıyor), o yüzden ton→ses eşlemesi
 * orada çalışmaz. Yani model seçimi tona göre yapılır.
 */
export const TONE_ETIKET = {
  komik: ["laughs", "chuckles", "sarcastic", "sighs"],
  alayci: ["sarcastic", "scoffs", "sighs"],
  karamizah: ["sighs", "sarcastic"],
  coskulu: ["excited", "laughs"],
};

/** Ses etiketlerini metinden ayıkla — ekrana ve altyazıya asla girmemeli. */
export function etiketleriAyikla(metin) {
  return String(metin || "")
    .replace(/\[[^\]\n]{1,24}\]/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export const TONE_ELEVEN = {
  varsayilan: { stability: 0.45, style: 0.05 },
  egitici: { stability: 0.60, style: 0.00 },
  komik: { stability: 0.30, style: 0.45 },
  alayci: { stability: 0.35, style: 0.35 },
  karamizah: { stability: 0.45, style: 0.20 },
  dramatik: { stability: 0.35, style: 0.40 },
  sohbet: { stability: 0.40, style: 0.25 },
  ilham: { stability: 0.40, style: 0.30 },
  gizemli: { stability: 0.50, style: 0.15 },
  arastirmaci: { stability: 0.55, style: 0.05 },
  coskulu: { stability: 0.25, style: 0.45 },
};

// Kaba konuşma hızı — YALNIZCA kesik TTS yakalamak için alt sınır hesabında
// kullanılır (voice.js/minAcceptableDuration, 0,45 katsayılı geniş pay var).
// Senaryo kelime bütçesi buradan DEĞİL tempo.js/tahminWpm'den gelir; orası
// ses başına ölçüm biriktirip öğreniyor.
//
// Eski değerler (tr 140 / en 155) ölçümle uyuşmuyordu: 22 bitmiş işte Türkçe
// ortancası 110 çıktı. Tek kaynak olsun diye tempo.js'ten okunuyor.
export function wordsPerMinute(lang) {
  return varsayilanWpm(lang);
}

// görsel stil: kesme temposu + ekran grafikleri
export const VISUAL_STYLES = {
  editorial: {
    name: "Editoryal kurgu",
    desc: "Görüntü ağırlıklı akış, çeşitli kadraj hareketleri ve seyrek tarih/sayı vurguları",
    beats: 4,
    graphics: true,
    editorial: true,
    hedefKesme: 4.5,
  },
  kolaj: {
    name: "Kolaj (üretilmiş)",
    desc: "Her cümleye özel kağıt-kolaj kavram grafiği — stok görsel yok",
    beats: 1,
    graphics: false,
    generative: true,
  },
  sinema: {
    name: "Sinematik hareket",
    desc: "Görsel ekranı kaplar; üstünde köşelerde öğeler ve kelime kelime kurulan yazı",
    // Arka plan = b0 (tam ekran), b1/b2 = üstteki çerçeveli öğeler
    beats: 3,
    graphics: false,
    hareket: true,
    tamEkran: true,
  },
  hareket: {
    name: "Hareketli kolaj",
    desc: "Her cümle çok katmanlı sahne: öğeler ayrı ayrı girer, yazı kelime kelime kurulur",
    // beats=3 → senaryo cümle başına 3 görsel sorgusu yazar; kesme listesinde
    // bunlar TEK sahnede birleşir (kahraman + 2 destek), bkz. render.js.
    beats: 3,
    graphics: false,
    hareket: true,
  },
  klasik: {
    name: "Klasik",
    desc: "Segment başına tek görsel, sakin Ken Burns",
    beats: 1,
    graphics: false,
  },
  vox: {
    name: "Vox (hızlı kesme + grafik)",
    desc: "3-4 sn'de bir kesme, ekranda dev rakamlar ve barlar",
    // beats 3 -> 4 (ÖLÇÜMLE). Bitmiş videoda (20260817-b05a7a) ortalama plan
    // 8,95 saniye çıktı, oysa stilin kendi tanımı 3-4 saniye. Sebep sahne
    // sayısının SÜREDEN değil bu sayıdan gelmesiydi: 19 saniyelik ortalama
    // segment 3 sahneye bölününce sahne başına 6,4 saniye düşüyor, hizalama
    // ve medya eksiği de araya girince 8,95'e çıkıyordu.
    //
    // render.js artık süreye göre sahne açıyor (hedefKesme) ama tavanı MEVCUT
    // MEDYA belirliyor: segment başına 3 görsel indiriliyorsa 4. sahne
    // açılamaz. O yüzden senaryonun istediği görsel sayısı da artıyor.
    //
    // MALİYET: segment başına bir görsel daha demek, 35 segmentlik videoda
    // ~35 ek indirme ve ~35 ek denetim karesi (küçük modelle birkaç kuruş).
    beats: 4,
    graphics: true,
    // Hedef plan süresi (sn). render.js sahne sayısını buradan hesaplıyor.
    hedefKesme: 4.5,
  },
  dinamik: {
    name: "Dinamik",
    desc: "Hızlı kesme, grafik yok",
    beats: 2,
    graphics: false,
    hedefKesme: 5.5,
  },
};

// tema → vurgu rengi (kapaklar + bölüm kartları)
export const THEME_ACCENT = {
  vox: "0xFFD23F",
  belgesel: "0xFFC02E",
  haber: "0xFF3B30",
  top5: "0x22D3EE",
  analiz: "0x34E3B0",
  egitim: "0x4EA1FF",
  hikaye: "0xB07CFF",
};

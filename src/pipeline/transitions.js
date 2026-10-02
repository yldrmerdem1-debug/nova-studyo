// GERÇEK GEÇİŞLER — süre-nötr xfade motoru.
//
// Neden ayrı modül: eski kurgu `concat -c copy` ile birleşiyordu, yani kesmeler
// arasında SIFIR geçiş vardı (sadece video başında/sonunda fade). Gerçek bir
// crossfade iki klibin aynı anda görünmesini gerektirir, bu da stream copy ile
// mümkün değil.
//
// TASARIM — "parça" yöntemi. Her kesme kendi slot süresinden biraz UZUN render
// edilir (komşu geçişlerin yarısı kadar taşma payı), sonra her kesme için tek bir
// ffmpeg çağrısıyla "geçiş + gövde" parçası üretilir:
//
//   parça_i = xfade( kesme_{i-1}'in son D_{i-1} saniyesi , kesme_i[0 .. L_i - D_i] )
//
// xfade offset=0 ile çıktı uzunluğu = ikinci girdinin uzunluğu. Toplam süre
// matematiksel olarak Σd_i'ye eşit çıkar (aşağıda ispatlı), yani SES SENKRONU
// BOZULMAZ — eski kurguyla birebir aynı uzunluk.
//
//   L_i          = D_{i-1}/2 + d_i + D_i/2      (kesmenin render uzunluğu)
//   |parça_0|    = L_0 - D_0        = d_0 - D_0/2
//   |parça_i|    = L_i - D_i        = D_{i-1}/2 + d_i - D_i/2
//   Σ|parça|     = Σd_i                          ✔ süre nötr
//
// Her parça bağımsız → hepsi paralel üretilir. Girdiler kısa olduğu için
// tek tek çağrılar hızlıdır; devasa tek filter_complex zincirinin bellek
// riskine girmez.

import fs from "node:fs";
import path from "node:path";
import { run } from "../util.js";
import { videoEnc, encThreads } from "../config.js";
import { GECIS_HARITASI } from "./kurgu.js";
import { pieceCacheKey } from "./shot-cache.js";

/** Geçiş yoğunluğu — kullanıcı ayarı. */
export const INTENSITIES = {
  yok: { ad: "Yok (sert kesme)", carpan: 0 },
  sade: { ad: "Sade", carpan: 0.62 },
  sinematik: { ad: "Sinematik", carpan: 1 },
};

/** Gövdesi bu süreden kısa kalacaksa geçiş kısılır — kesme görünmeden geçmesin. */
const MIN_GOVDE = 0.34;
/** Bu süreden kısa geçiş göze zaten çarpmıyor; sert kesme daha temiz durur. */
const MIN_GECIS = 0.12;

const YATAY_AKIS = new Set(['sola','saga']);
function sourceRole(media={}){
  const explicit=media?.editorial?.sourceRole||media?.sourceRole;
  if(explicit==='evidence'||explicit==='illustration')return explicit;
  return media?.illustration===true||['ai','codex-imagegen','native-animation'].includes(media?.provider)?'illustration':null;
}
export function motionAwareTransition(transition, previousMedia = {}, nextMedia = {}, boundary = 'beat') {
  const out={...transition};
  if(boundary==='section' || !out.sure || !/smooth|slide|wipe/.test(out.tip||'')) return out;
  const a=previousMedia?.akis,b=nextMedia?.akis;
  if(previousMedia?.type==='video'&&nextMedia?.type==='video'&&YATAY_AKIS.has(a)&&YATAY_AKIS.has(b)&&a!==b){out.tip='dissolve';return out;}
  if(b==='saga')out.tip='smoothright';
  else if(b==='sola')out.tip='smoothleft';
  return out;
}

// ---------------------------------------------------------------- katalog
//
// Sınır türleri:
//   beat    — aynı cümlenin görselleri arası (en sık, en sade olmalı)
//   segment — sonraki cümle, aynı bölüm
//   section — yeni bölüm/başlık (en belirgin)
//
// Her tema kendi dilini konuşur: belgesel yavaş çözülür, haber sert kayar,
// hikâye siyaha düşer. Aynı geçişin arka arkaya gelmemesi için varyant listesi.

const KATALOG = {
  belgesel: {
    beat: [["fade", 0.30]],
    segment: [["fade", 0.46], ["dissolve", 0.44]],
    section: [["fadeblack", 0.80], ["fade", 0.66]],
  },
  vox: {
    beat: [["fade", 0.20], ["smoothleft", 0.24]],
    segment: [["smoothleft", 0.32], ["smoothright", 0.32], ["fade", 0.28]],
    section: [["wipeleft", 0.46], ["circleopen", 0.56], ["smoothup", 0.46]],
  },
  haber: {
    beat: [["fade", 0.16]],
    segment: [["slideleft", 0.26], ["fade", 0.22]],
    section: [["wiperight", 0.40], ["fadewhite", 0.34]],
  },
  top5: {
    beat: [["fade", 0.20]],
    segment: [["slideup", 0.30], ["smoothleft", 0.30]],
    section: [["circleopen", 0.54], ["wipeup", 0.44]],
  },
  analiz: {
    beat: [["fade", 0.24]],
    segment: [["fade", 0.36], ["smoothright", 0.34]],
    section: [["fadeblack", 0.62], ["circleopen", 0.54]],
  },
  egitim: {
    beat: [["fade", 0.26]],
    segment: [["fade", 0.40], ["smoothleft", 0.36]],
    section: [["wipeleft", 0.50], ["fade", 0.56]],
  },
  hikaye: {
    beat: [["fade", 0.35]],
    segment: [["fade", 0.52], ["dissolve", 0.50]],
    section: [["fadeblack", 0.92], ["circleclose", 0.70]],
  },
};

/** Üretilmiş (AI/kolaj) klipler kendi içinde zaten hareketli — yumuşak çözülme yakışır. */
const KATALOG_URETILMIS = {
  beat: [["dissolve", 0.34], ["fade", 0.32]],
  segment: [["fade", 0.48], ["dissolve", 0.46]],
  section: [["fadeblack", 0.78], ["circleopen", 0.60]],
};

function sabitHash(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * İki kesme arasındaki sınırın türü.
 * @returns "beat" | "segment" | "section"
 */
function sinirTuru(a, b) {
  if (!a || !b) return "beat";
  if (b.firstOfSection || a.sectionIndex !== b.sectionIndex) return "section";
  if (a.segIndex !== b.segIndex) return "segment";
  return "beat";
}

/**
 * Geçiş planı üretir: beats[i] ile beats[i+1] arası için { tip, sure }.
 * Uzunluk = beats.length - 1. sure=0 → sert kesme.
 *
 * @param beats   render.js'in kesme listesi ({id, segIndex, sectionIndex, firstOfSection, dur, emphasis, media})
 * @param opts    { theme, intensity, uretilmis }
 */
export function planTransitions(beats, { theme = "belgesel", intensity = "sinematik", uretilmis = false, kurgu = null, profile = null, director = false, overrides = null } = {}) {
  const carpan = (INTENSITIES[intensity] || INTENSITIES.sinematik).carpan;
  const kat = uretilmis && !profile ? KATALOG_URETILMIS : (KATALOG[profile?.id || theme] || KATALOG.belgesel);
  const n = beats.length;
  const plan = [];

  for (let i = 0; i < n - 1; i++) {
    const a = beats[i], b = beats[i + 1];
    let tip = "", sure = 0;

    if (carpan > 0) {
      // KURGU PLANI VARSA NİYETİ O SÖYLER.
      //
      // Katalogdan seçim sabit karma ile yapılıyordu: içerikten bağımsız, keyfî.
      // Model tüm sahneleri birden gördüğü için hangi sınırın ne hak ettiğini
      // bilebiliyor — "burada beyaz flaş, çünkü şaşırtıcı sayı geliyor" gibi.
      // Kod yine güvenliği garanti eder (aşağıdaki kısaltma turu).
      const niyet = kurgu?.get(i + 1)?.gecis;
      if (niyet && GECIS_HARITASI[niyet]) {
        tip = GECIS_HARITASI[niyet].tip;
        sure = GECIS_HARITASI[niyet].sure * carpan;
      } else {
        const tur = sinirTuru(a, b);
        const secenek = kat[tur] || kat.beat;
        const [t, d] = secenek[sabitHash(b.id + tur) % secenek.length];
        tip = t;
        sure = d * carpan;
      }

      // VURGU = SERT KESME. Ekrana dev rakam/grafik basılan kesmeye yumuşak
      // geçilirse vuruş dağılıyor; kurgu dilinde bu an kesilir.
      //
      // TEK İSTİSNA: kurgu planı o sınıra bilerek "parlat" (beyaz flaş) dediyse.
      // Flaş vuruşu dağıtmaz, TERSİNE altını çizer — ifşa anının klasik dili.
      // Süresi zaten kısa (0,28 sn), uzarsa darbe olmaktan çıkacağı için
      // katalog değerinden fazlasına izin verilmez.
      // AMA BÖLÜM VE SEGMENT SINIRINDA DEĞİL.
      //
      // ÖLÇÜLEN KUSUR (20260817-b05a7a): kural sınır TÜRÜNE bakmıyordu.
      // Vurgusu olan 29 segment sınırının hepsi sert kesmeye çevrildi; geçiş
      // planı "sert×29" çıktı ve bağımsız sahne tespiti tam 29 sert kesme
      // buldu. Daha kötüsü BÖLÜM sınırlarında da çalıştı: dört bölüm
      // geçişinin üçü sıradan sert kesme oldu ve temanın tanımladığı
      // fadeblack (0,80 sn) videoda SIFIR kez göründü.
      //
      // Bölüm sınırı, kurgu dilinde vurgudan daha büyük bir olaydır: izleyici
      // orada "yeni bir başlık başlıyor" bilgisini geçişin kendisinden alır.
      // Vuruşu korumak için sert kesme yalnızca BEAT sınırında uygulanır —
      // grafiğin kendi animasyonu zaten vuruşu taşıyor.
      const flasIstendi = niyet === "parlat";
      const beatSiniri = sinirTuru(a, b) === "beat";
      if (beatSiniri && b.emphasis && b.emphasis.type && b.emphasis.type !== "none" && !flasIstendi) sure = 0;
      // Yedek kart (medya inmemiş) — üstüne bindirmek çamur gibi duruyor.
      if (a.media?.type === "card" || b.media?.type === "card") sure = 0;
      if (profile) {
        const boundary = sinirTuru(a,b);
        const palette = (kat[boundary] || kat.beat).map(x=>x[0]);
        // Preserve intentional hard cuts; prevent model directions overriding genre palette.
        if(sure > 0 && !palette.includes(tip)) {
          [tip,sure] = (kat[boundary] || kat.beat)[0];
          sure *= carpan;
        }
        if(boundary !== 'section' && (sabitHash(`${i}:${b.id}:density`) % 1000)/1000 >= profile.transitions.density) sure=0;
        sure *= profile.transitions.duration;
      }
    }
    ({tip,sure}=motionAwareTransition({tip,sure},a.media,b.media,sinirTuru(a,b)));
    // AYNI KAYNAĞIN İKİ PARÇASI ARASINDA ÇÖZÜLME YOK.
    //
    // Ölçüldü (20260923-8aab9f, 12,3 sn ve 60,9 sn): aynı harita videosunun
    // ardışık iki parçası çözülmeyle bağlanınca uçaklar ve "ENTERPRISE VB-6"
    // kartı iki kat göründü — çift pozlama. Aynı çekimin devamı düz kesilir
    // (akış kesintisiz görünür); bölüm sınırında ise siyaha iniş korunur ki
    // yeni başlık yine hissedilsin.
    if (sure > 0 && a.media?.file && a.media.file === b.media?.file) {
      if (sinirTuru(a, b) === 'section') { tip = 'fadeblack'; sure = Math.min(Math.max(sure, 0.4), 0.6); }
      else { tip = ''; sure = 0; }
    }
    if(director&&sure>0){
      const from=sourceRole(a.media),to=sourceRole(b.media);
      if(from&&to&&from!==to){
        if(sinirTuru(a,b)==='section'){tip='fadeblack';sure=Math.min(sure,.45);}
        else {tip='';sure=0;}
      }
    }
    // Editörde verilen karar otomatik kurguyu ezer; yalnızca aşağıdaki
    // gövde güvenliği (kesmenin görünür kalması) hâlâ uygulanır.
    const karar = overrides?.get(i);
    if (karar) { tip = karar.tip; sure = karar.sure; }
    plan.push({ tip, sure });
  }

  // --- kısalt: gövdesi kalmayan kesme olmasın ---
  // Kesme i'nin görünür gövdesi = d_i - D_{i-1}/2 - D_i/2. Bu MIN_GOVDE'nin
  // altına inerse komşu geçişler orantılı kısılır; hâlâ inmiyorsa sert kesme.
  for (let tur = 0; tur < 3; tur++) {
    let degisti = false;
    for (let i = 0; i < n; i++) {
      const onceki = i > 0 ? plan[i - 1].sure : 0;
      const sonraki = i < n - 1 ? plan[i].sure : 0;
      const govde = beats[i].dur - onceki / 2 - sonraki / 2;
      if (govde >= MIN_GOVDE) continue;
      const fazla = MIN_GOVDE - govde;
      const toplam = onceki + sonraki;
      if (toplam <= 0) continue;
      if (i > 0) plan[i - 1].sure = Math.max(0, onceki - (2 * fazla * onceki) / toplam);
      if (i < n - 1) plan[i].sure = Math.max(0, sonraki - (2 * fazla * sonraki) / toplam);
      degisti = true;
    }
    if (!degisti) break;
  }

  // Göze çarpmayacak kadar kısalanları sert kesmeye çevir (boşuna encode etme)
  for (const p of plan) {
    if (p.sure < MIN_GECIS) { p.sure = 0; p.tip = ""; }
    else p.sure = +p.sure.toFixed(3);
  }
  return plan;
}

/**
 * KARE DÜZENİ — bütün kesim noktalarını tamsayı kareye oturtur.
 *
 * Saniyeyle çalışmak yetmiyor: ffmpeg her parçayı tam kareye yuvarlıyor ve
 * yuvarlama hataları birikiyor (10 kesmede 0,17 sn ölçüldü → 130 kesmede ~2 sn
 * ses kayması). Burada slot sınırları MUTLAK zamandan yuvarlanır, süreler
 * farkla bulunur; böylece hata birikmez ve toplam TAM olarak Σd_i'ye eşit olur.
 *
 *   n_i  = slot uzunluğu (kare)          — T_{i+1} - T_i
 *   g_i  = i/i+1 sınırındaki geçiş (kare)
 *   a_i  = g_i'nin kesme i'den aldığı pay, b_i = kesme i+1'den aldığı pay
 *   L_i  = kesmenin render uzunluğu      = n_i + b_i + a_{i-1}
 *   p_i  = parçanın uzunluğu             = L_i - g_i = n_i + a_{i-1} - a_i
 *   Σp_i = Σn_i  (teleskopik — TAM eşit)
 */
export function frameLayout(beats, plan, fps) {
  const n = beats.length;

  // slot sınırları: mutlak zamandan tek seferde yuvarla → birikimli hata yok
  const T = [0];
  let acc = 0;
  for (const b of beats) { acc += b.dur; T.push(Math.round(acc * fps)); }
  const slot = beats.map((_, i) => Math.max(1, T[i + 1] - T[i]));

  const g = plan.map((p) => Math.max(0, Math.round(p.sure * fps)));
  const a = g.map((x) => Math.floor(x / 2));
  const b = g.map((x, i) => x - a[i]);

  // Kare seviyesinde güvenlik: gövde (n_i - b_{i-1} - a_i) en az 1 kare kalmalı.
  // Saniye seviyesindeki kısaltma yuvarlamadan sonra yetmezse burada kısılır.
  for (let tur = 0; tur < 4; tur++) {
    let degisti = false;
    for (let i = 0; i < n; i++) {
      const once = i > 0 ? b[i - 1] : 0;
      const sonra = i < n - 1 ? a[i] : 0;
      let fazla = once + sonra - (slot[i] - 1);
      if (fazla <= 0) continue;
      degisti = true;
      // Büyük olandan kırp; ikisi de sıfırlanana kadar
      while (fazla > 0 && (once > 0 || sonra > 0)) {
        if (i > 0 && b[i - 1] >= (i < n - 1 ? a[i] : 0) && b[i - 1] > 0) {
          g[i - 1]--; b[i - 1]--; if (g[i - 1] < 0) g[i - 1] = 0;
        } else if (i < n - 1 && a[i] > 0) {
          g[i]--; a[i]--; if (g[i] < 0) g[i] = 0;
        } else break;
        fazla--;
      }
    }
    if (!degisti) break;
  }
  // Çok kısalan geçişleri sert kesmeye çevir (2 kare altı zaten görünmez)
  for (let i = 0; i < g.length; i++) {
    if (g[i] < 2) { g[i] = 0; a[i] = 0; b[i] = 0; plan[i].sure = 0; plan[i].tip = ""; }
    else plan[i].sure = +(g[i] / fps).toFixed(3);
  }

  const L = beats.map((_, i) => slot[i] + (i < n - 1 ? b[i] : 0) + (i > 0 ? a[i - 1] : 0));
  const parca = beats.map((_, i) => L[i] - (i < n - 1 ? g[i] : 0));
  const onPay = beats.map((_, i) => (i > 0 ? b[i - 1] : 0));

  return { slot, g, a, b, L, parca, onPay, toplamKare: T[n] };
}

/**
 * Kesme i'nin render uzunluğu (saniye). render.js her kesmeyi BU uzunlukta
 * üretmeli — kare sayısı frameLayout().L'den birebir gelir.
 */
export function clipLengths(beats, plan, fps) {
  const { L } = frameLayout(beats, plan, fps);
  return L.map((f) => +(f / fps).toFixed(4));
}

/**
 * Kesme i'nin kendi zamanında, slot'un başladığı an (taşma payı, saniye).
 * Grafik bindirmeleri bu kadar erken başlar — vurgu ve ilk kesmede 0'dır.
 */
export function clipOffsets(beats, plan, fps) {
  const { onPay } = frameLayout(beats, plan, fps);
  return onPay.map((f) => +(f / fps).toFixed(4));
}

/**
 * Parçaları üretip concat listesini yazar.
 *
 * Tüm kesim noktaları KARE cinsinden verilir (trim=start_frame/end_frame,
 * -frames:v). Saniye kullanılırsa ffmpeg her parçayı ayrı ayrı yuvarlıyor ve
 * hata birikerek sesi kaydırıyor.
 *
 * @param clipFiles  kesme dosyaları (layout.L kare uzunluğunda render edilmiş)
 * @param plan       planTransitions çıktısı (frameLayout'tan geçmiş olmalı)
 * @param layout     frameLayout çıktısı
 */
export async function buildPieces({ st, clipFiles, plan, layout, outDir, killer, mapLimit, onProgress, logFn, cache = null, cacheKeys = null }) {
  fs.mkdirSync(outDir, { recursive: true });
  const n = clipFiles.length;
  const fps = st.fps;
  const { g, L, parca } = layout;
  // İŞ PARÇACIĞI TAVANI BURADA DA ŞART.
  //
  // Ölçüldü (20260811-cc92b5): kesme aşaması iş parçacığı tavanıyla 26/26
  // başarılı geçtikten sonra iş "Geçişler: 6/26" satırında ffmpeg çıkış kodu
  // 4294967284 (= -12, ENOMEM) ile öldü. Sebep aynı: bu dosya kodlayıcı
  // argümanlarını ELLE kuruyor ve videoEnc()'i atlıyordu, yani tavan yoktu.
  //
  // Üstelik geçiş kesmeden AĞIR: her iş İKİ klip çözüp bir kodlama yapıyor.
  // 10 paralel × sınırsız iş parçacığı burada daha çabuk tükeniyor.
  const enc = ["-c:v", "libx264", "-preset", st.preset, "-crf", String(st.crf),
    "-threads", encThreads(st), "-an", "-r", String(fps)];

  const isler = clipFiles.map((file, i) => ({ i, file }));
  let bitti = 0;

  const parcaUret = async ({ i, file }, sayacaEkle = true) => {
    if (killer?.cancelled) throw new Error("cancelled");
    const girenKare = i > 0 ? g[i - 1] : 0;   // bu kesmeye GİREN geçiş (kare)
    const girenTip = i > 0 ? plan[i - 1].tip : "";
    const parcaKare = parca[i];               // üretilecek parçanın kare sayısı
    const out = path.join(outDir, `p${String(i).padStart(4, "0")}.mp4`);

    if (girenKare <= 0 && parcaKare >= L[i]) {
      // İki yanı da sert kesme → parça zaten kesmenin kendisi. Yeniden kodlamak
      // hem zaman hem jenerasyon kaybı; dosyayı olduğu gibi kullan.
      if (sayacaEkle) { bitti++; onProgress?.(bitti, n); }
      return file;
    }
    // Akıllı yeniden render: iki komşu klip ve geçiş aynıysa parça da aynıdır.
    const pkey = cache && cacheKeys?.[i] && (girenKare <= 0 || cacheKeys[i - 1])
      ? pieceCacheKey({ previousKey: girenKare > 0 ? cacheKeys[i - 1] : null, key: cacheKeys[i], transition: { tip: girenTip, frames: girenKare }, frames: parcaKare, previousFrames: i > 0 ? L[i - 1] : 0, encoder: enc })
      : null;
    if (pkey && cache.restore(pkey, out)) {
      if (sayacaEkle) { bitti++; onProgress?.(bitti, n); }
      return out;
    }
    if (girenKare <= 0) {
      // Sert kesme (veya ilk kesme): sadece kırp.
      await run(st.ffmpegPath, [
        "-i", file, "-vf", "setsar=1,format=yuv420p",
        "-frames:v", String(parcaKare), ...enc, "-y", out,
      ], { killer });
    } else {
      // Geçiş: önceki kesmenin son girenKare karesi bu kesmenin başıyla çözülür.
      const oncekiBas = L[i - 1] - girenKare;
      await run(st.ffmpegPath, [
        "-i", clipFiles[i - 1], "-i", file,
        "-filter_complex",
        `[0:v]trim=start_frame=${oncekiBas}:end_frame=${L[i - 1]},setpts=PTS-STARTPTS,setsar=1[a];` +
        `[1:v]trim=start_frame=0:end_frame=${parcaKare},setpts=PTS-STARTPTS,setsar=1[b];` +
        `[a][b]xfade=transition=${girenTip}:duration=${(girenKare / fps).toFixed(4)}:offset=0,format=yuv420p[v]`,
        "-map", "[v]", "-frames:v", String(parcaKare), ...enc, "-y", out,
      ], { killer });
    }
    if (pkey) cache.store(pkey, out);
    if (sayacaEkle) { bitti++; onProgress?.(bitti, n); }
    return out;
  };

  const sonuc = await mapLimit(isler, st.concurrency, (is) => parcaUret(is));

  // TEK BİR ÇÖKME 25 DAKİKALIK İŞİ ÖLDÜRMESİN.
  //
  // Ölçülen kusur (20260811-cfc49f): geçiş parçası p0001'i yazan ffmpeg
  // 0xC0000005 (erişim ihlali) ile çöktü ve `if (!r.ok) throw r.error` bütün
  // işi düşürdü — araştırma, senaryo, medya, seslendirme, 26 kesme, hepsi
  // çöpe. Diskte kalan p0001.mp4 yarım: "moov atom not found".
  //
  // Çökme paralellik sayısının basit bir fonksiyonu DEĞİL: aynı kliplerle
  // aynı makinede 10 paralel × 1 iş parçacığı yerelde 10/10 başarılı geçti.
  // Yani "sayıyı düşür" tek başına doğru cevap değil; asıl eksik, kesme
  // aşamasında olan ama burada olmayan KURTARMA YOLU.
  //
  // Düşen parça paralel yük olmadan, tek başına bir kez daha denenir.
  const dosyalar = [];
  for (let k = 0; k < sonuc.length; k++) {
    const r = sonuc[k];
    if (r.ok) { dosyalar.push(r.value); continue; }
    if (killer?.cancelled) throw r.error;
    logFn?.(`Geçiş parçası ${k + 1}/${n} düştü (${String(r.error?.message || "").slice(0, 60)}) — ` +
      `paralel yük olmadan tekrar deneniyor...`);
    dosyalar.push(await parcaUret(isler[k], false));
  }
  // SIRALAMA YOK: mapLimit sonuçları girdi sırasında döndürür. Ada göre sıralamak
  // yanlış olurdu — sert kesme kısayolunda parça, render klasöründeki özgün kesme
  // dosyasının kendisi oluyor (p0000 adlandırmasına uymuyor).
  const listFile = path.join(outDir, "pieces.txt");
  // Mutlak yol + ileri eğik çizgi: parçalar iki ayrı klasörde olabiliyor ve
  // concat demuxer'ı Windows'ta ters eğik çizgiyi tırnak içinde kaçış sanıyor.
  fs.writeFileSync(
    listFile,
    dosyalar.map((f) => `file '${path.resolve(f).replace(/\\/g, "/")}'`).join("\n"),
    "utf8"
  );
  return { listFile, gecisSayisi: plan.filter((p) => p.sure > 0).length };
}

/** Kullanıcıya gösterilecek özet: hangi geçişten kaç tane. */
export function planOzet(plan) {
  const sayac = {};
  let sert = 0;
  for (const p of plan) {
    if (!p.sure) { sert++; continue; }
    sayac[p.tip] = (sayac[p.tip] || 0) + 1;
  }
  const parcalar = Object.entries(sayac).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`);
  if (sert) parcalar.push(`sert×${sert}`);
  return parcalar.join(", ") || "yok";
}

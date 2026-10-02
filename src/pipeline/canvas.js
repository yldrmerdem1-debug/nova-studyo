// KANVAS — çözünürlüğün ve en-boy oranının TEK kaynağı.
//
// Önceden 1920×1080 beş dosyada 26 yerde sabit kodluydu; dikey (Shorts/Reels)
// çıktı imkânsızdı. Buradaki nesne hem ham ölçüleri hem de ffmpeg filtrelerinin
// ihtiyaç duyduğu hazır parçaları verir, böylece çağrı yerlerinde aritmetik
// tekrarlanmaz ve yeni bir oran eklemek tek satır olur.

/** Desteklenen oranlar. Anahtar hem arayüzde hem job.ratio'da kullanılır. */
export const RATIOS = {
  "16:9": { ad: "Yatay", alt: "YouTube uzun video", w: 1920, h: 1080 },
  "9:16": { ad: "Dikey", alt: "Shorts / Reels / TikTok", w: 1080, h: 1920 },
  "1:1": { ad: "Kare", alt: "Feed gönderisi", w: 1080, h: 1080 },
};

/** x264 yuv420p çift sayı ister; tek boyut "width not divisible by 2" ile patlar. */
const cift = (n) => Math.round(n / 2) * 2;

/**
 * @param {string} ratio  RATIOS anahtarı
 * @returns kanvas: ölçüler + hazır ffmpeg filtre parçaları
 */
export function makeCanvas(ratio) {
  const r = RATIOS[ratio] || RATIOS["16:9"];
  const w = r.w, h = r.h;
  // Ken Burns için fazladan çözünürlük: kaynak kanvastan büyük ölçeklenir ki
  // zoom/pan sırasında kenarlarda boşluk açılmasın.
  const g14w = cift(w * 1.4), g14h = cift(h * 1.4);   // fotoğraf (geniş gezinme)
  const g11w = cift(w * 1.1), g11h = cift(h * 1.1);   // video/punch (dar gezinme)

  return {
    ratio: RATIOS[ratio] ? ratio : "16:9",
    ad: r.ad,
    w, h,
    dikey: h > w,
    kare: h === w,
    size: `${w}x${h}`,

    /** Kaynağı kanvasa doldur, taşanı kırp. */
    fit: `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
    /** Fotoğraf için geniş gezinme alanı (Ken Burns öncesi). */
    genis: `scale=${g14w}:${g14h}:force_original_aspect_ratio=increase,crop=${g14w}:${g14h}`,
    /** Video/punch için hafif büyütme. */
    yakin: `scale=${g11w}:${g11h},crop=${w}:${h}`,
    /** Düz renk kaynağı. */
    renk: (c) => `color=c=${c}:s=${w}x${h}`,
    /** Tam ekran dolgu kutusu. */
    dolgu: (c) => `drawbox=x=0:y=0:w=${w}:h=${h}:color=${c}:t=fill`,
    /** zoompan çıkış boyutu eki. */
    zp: (fps) => `:s=${w}x${h}:fps=${fps}`,

    /**
     * Grafik ölçek katsayısı. Yazı boyutları ve kenar boşlukları 1080p yatay
     * için ayarlanmıştı; kısa kenara göre ölçeklenince dikeyde de aynı fiziksel
     * okunabilirlik korunuyor (telefonda daha büyük görünür — istenen bu).
     */
    k: Math.min(w, h) / 1080,

    /** AI sağlayıcılarına gönderilecek biçimler (her biri farklı istiyor). */
    saglayici: {
      oran: RATIOS[ratio] ? ratio : "16:9",   // kie: aspect_ratio
      w, h,                                    // fal image_size, higgs width/height
      cozunurluk: "1080p",                     // fal video: kısa kenar
    },
  };
}

/** İşten kanvas üret. job.ratio yoksa yatay. */
export function canvasOf(job) {
  return makeCanvas(job?.ratio);
}

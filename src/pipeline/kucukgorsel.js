// KÜÇÜK GÖRSELİ TAM EKRAN PERDEYE OTURT.
//
// NEDEN VAR. Bazı görseller küçük olmalarına rağmen sahnenin TEK doğru
// karşılığıdır. Ölçülmüş vaka (2026-08-09): Baba Vanga'nın yüzünün serbest
// lisanslı hiçbir fotoğrafı yok; Wikipedia maddesinin kapağındaki gerçek
// fotoğrafı ise 220x314. Eski boyut süzgeci onu eliyordu ve video, anlattığı
// kadını hiç göstermiyordu — kullanıcının asıl şikâyeti buydu.
//
// Ama 220 pikseli 1920'ye ham büyütmek de olmaz: 8,7 katlık büyütme lapa gibi
// görünür ve ucuz durur. Belgeselcilerin standart çözümü şu: aynı görselin
// BULANIK ve KOYULTULMUŞ büyütmesi arka perde olur, keskin orijinal onun
// üstünde ortalanır. Arşiv fotoğrafının küçüklüğü böylece kusur değil,
// bilinçli bir sunum olur.
//
// Render'a hiç dokunmadan çalışır: indirilen dosyanın yerine kanvas boyutunda
// yeni bir dosya konur, Ken Burns ve derecelendirme aynen devam eder.
import fs from "node:fs";
import path from "node:path";
import { run } from "../util.js";

/** Keskin orijinalin kaplayacağı yükseklik oranı — kenarda perde kalsın. */
const IC_ORAN = 0.82;

/**
 * Tek görseli perdeye oturt.
 * @returns yeni dosya yolu (başarısızsa null — çağıran eskisini kullanır)
 */
export async function perdeyeOturt(ffmpegPath, girdi, cikis, { w = 1920, h = 1080, killer } = {}) {
  const ic = Math.round(h * IC_ORAN);
  // split: aynı görselden iki kol. Biri kanvası dolduracak kadar büyütülüp
  // bulanıklaştırılır ve karartılır; diğeri lanczos ile keskin ölçeklenip
  // ortaya bindirilir. -2 genişlik: en-boy oranı korunur, çift sayıya yuvarlanır.
  const filtre =
    `[0:v]split=2[perde][on];` +
    `[perde]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},` +
    `boxblur=luma_radius=min(h\\,w)/24:luma_power=2,eq=brightness=-0.14:saturation=0.85[pb];` +
    `[on]scale=-2:${ic}:flags=lanczos[ok];` +
    `[pb][ok]overlay=(W-w)/2:(H-h)/2`;
  await run(ffmpegPath, ["-y", "-i", girdi, "-filter_complex", filtre,
    "-frames:v", "1", "-q:v", "2", cikis], { timeoutMs: 60000, killer });
  return fs.existsSync(cikis) && fs.statSync(cikis).size > 0 ? cikis : null;
}

/**
 * media kayıtlarındaki `kucuk` işaretli görselleri perdeye oturt.
 * Kayıtları YERİNDE günceller; kaç tanesinin işlendiğini döndürür.
 */
export async function kucukleriPerdele(media, { ffmpegPath, w = 1920, h = 1080, killer, logFn = () => {} } = {}) {
  // `perdelendi` işareti tekrar işlemeyi engeller: bu işlev boru hattında iki
  // kez çağrılıyor (indirmeden hemen sonra ve yedek turlarından sonra), çünkü
  // yedek yoldan gelen görsel ilk çağrıyı kaçırıyor.
  const hedef = Object.values(media).filter((m) => m?.kucuk && m.file && m.type === "image" && !m.perdelendi);
  if (!hedef.length) return 0;
  let sayi = 0;
  for (const m of hedef) {
    const cikis = path.join(path.dirname(m.file),
      path.basename(m.file, path.extname(m.file)) + "_perde.jpg");
    try {
      const yeni = await perdeyeOturt(ffmpegPath, m.file, cikis, { w, h, killer });
      // Başarısızlıkta eski dosya korunur: küçük ama DOĞRU görsel, hiç
      // görselsiz kalmaktan iyidir.
      if (yeni) { m.file = yeni; m.perdelendi = true; sayi++; }
    } catch (e) {
      logFn(`Küçük görsel perdelenemedi (${m.beatId}): ${String(e.message).slice(0, 60)}`);
    }
  }
  if (sayi) logFn(`${sayi} küçük arşiv görseli tam ekran perdeye oturtuldu.`);
  return sayi;
}

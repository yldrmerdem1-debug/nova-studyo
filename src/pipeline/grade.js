// RENK DERECELENDİRME — kaynakları tek bir görsel dile oturtur.
//
// Sorun: stok görseller 5-6 farklı siteden geliyor ve her biri farklı ışıkta,
// farklı beyaz ayarında, farklı doygunlukta. Tüm hatta tek sabit değer vardı
// (`eq=contrast=1.04:saturation=1.08`), yani parlak bir plaj fotoğrafı ile
// karanlık bir arşiv karesi aynı işlemi görüyordu. Ölçüldü: bir videonun
// kareleri arasında ortalama parlaklık 128,6 birim yayılıyordu (std 40,1) —
// izleyici bunu "birbirine yapıştırılmış" olarak okuyor.
//
// Çözüm: her kaynak için TEK KARE ölçülüp (signalstats) o karenin kendi
// istatistiğine göre hedefe çekilir. Hareketli kaynağın tek erken karesi bütün
// dosyayı temsil etmeyebileceği için parlaklık müdahalesi ayrıca sınırlanır.
// Kaynak başına bir ffmpeg çağrısı; klip render'ı zaten o dosyayı okuyacağı
// için ek maliyet küçük.

import { run } from "../util.js";

/**
 * Tema paletleri. Hedefler YUV Y (parlaklık) ve doygunluk cinsinden.
 *
 *  yHedef  : ortalama parlaklık (0-255). Belgesel biraz koyu, eğitim daha açık.
 *  doyum   : doygunluk çarpanı tabanı
 *  sicaklik: negatif = soğuk/mavi, pozitif = sıcak/amber
 */
export const PALET = {
  belgesel: { yHedef: 108, doyum: 1.06, sicaklik: -0.02, kontrast: 1.08 },
  hikaye:   { yHedef: 104, doyum: 1.10, sicaklik: +0.04, kontrast: 1.10 },
  haber:    { yHedef: 118, doyum: 1.02, sicaklik: 0.00,  kontrast: 1.05 },
  analiz:   { yHedef: 116, doyum: 1.04, sicaklik: -0.03, kontrast: 1.06 },
  vox:      { yHedef: 120, doyum: 1.14, sicaklik: +0.02, kontrast: 1.09 },
  egitim:   { yHedef: 124, doyum: 1.08, sicaklik: +0.01, kontrast: 1.04 },
  top5:     { yHedef: 118, doyum: 1.16, sicaklik: +0.03, kontrast: 1.10 },
};

/** Sayıyı aralığa sıkıştır. */
const kis = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Kaynağın tek karesini ölç.
 *
 * signalstats YAVGyani ortalama parlaklığı, SATAVG ortalama doygunluğu verir.
 * Video için ilk saniyeden bir kare alınır (ilk kare çoğu klipte siyah fade).
 *
 * @returns { y, sat } veya null (ölçülemezse derecelendirme atlanır)
 */
export async function olc(src, { ffmpegPath, video = false, killer } = {}) {
  try {
    const { spawnSync } = await import("node:child_process");
    const args = video
      ? ["-ss", "1.0", "-i", src, "-frames:v", "1", "-vf", "signalstats,metadata=print", "-f", "null", "-"]
      : ["-i", src, "-frames:v", "1", "-vf", "signalstats,metadata=print", "-f", "null", "-"];
    // Ana süreçte eşzamanlı (25 Ekim 2026): takılan ffmpeg bütün uygulamayı dondururdu. Tek kare ölçümü 60 sn'de
    // SIGKILL ile kesilir; zaman aşımında yarım çıktı ölçüm sayılmaz → sabit temel derecelendirme.
    const r = spawnSync(ffmpegPath, ["-nostdin", ...args], { encoding: "utf8", windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
    if (r.error) return null;
    const t = (r.stderr || "") + (r.stdout || "");
    const al = (k) => {
      const m = t.match(new RegExp(`lavfi\\.signalstats\\.${k}=([\\d.]+)`));
      return m ? parseFloat(m[1]) : null;
    };
    const y = al("YAVG"), sat = al("SATAVG");
    return Number.isFinite(y) ? { y, sat: Number.isFinite(sat) ? sat : null } : null;
  } catch {
    return null;
  }
}

/**
 * Ölçüme göre filtre zinciri üret.
 *
 * Düzeltme SINIRLIDIR: fotoğrafta parlaklık en fazla ±%22, videoda ±%8;
 * doygunluk ±%25 oynatılır.
 * Sınırsız bırakmak karanlık bir gece çekimini gündüze çeviriyor ve fotoğrafın
 * kendi niyetini bozuyor — amaç kaynakları YAKINLAŞTIRMAK, aynılaştırmak değil.
 *
 * @param olcum  olc() çıktısı (null ise sabit temel derecelendirme döner)
 * @param tema   PALET anahtarı
 */
export function gradeFiltresi(olcum, tema = "belgesel", {video=false} = {}) {
  const p = PALET[tema] || PALET.belgesel;
  if (!olcum) {
    // Ölçüm yoksa eski sabit davranış — hiç derecelendirmemekten iyi
    return `eq=contrast=${p.kontrast}:saturation=${p.doyum}`;
  }

  // Parlaklık: hedefe doğru çek ama tamamen eşitleme
  const fark = p.yHedef - olcum.y;
  // A video source can cross from darkness to sunlit paper or faces within
  // one selected excerpt. The source-wide probe must not lift every later
  // frame by 56 luma levels because its 1-second sample happened to be dark.
  const sinir=video?0.08:0.22;
  const parlaklik = kis(fark / 255 * 0.75, -sinir, sinir);

  // Doygunluk: ölçülen doygunluk düşükse yükselt, yüksekse bastır
  let doyum = p.doyum;
  if (Number.isFinite(olcum.sat) && olcum.sat > 0) {
    const hedefSat = 78;   // deneysel: stok fotoğrafların makul ortalaması
    doyum = kis(p.doyum * Math.sqrt(hedefSat / olcum.sat), p.doyum * 0.75, p.doyum * 1.25);
  }

  const parcalar = [
    `eq=contrast=${p.kontrast.toFixed(3)}:saturation=${doyum.toFixed(3)}:brightness=${parlaklik.toFixed(4)}`,
  ];
  // Sıcaklık: mavi/amber dengesi. colorbalance gölgeler ve ışıklarda ayrı çalışır;
  // sadece orta tonlara dokunmak doğal duruyor.
  if (Math.abs(p.sicaklik) > 0.005) {
    const s = p.sicaklik;
    parcalar.push(`colorbalance=rm=${s.toFixed(3)}:bm=${(-s).toFixed(3)}`);
  }
  return parcalar.join(",");
}

/**
 * Bir işteki tüm kaynakları ölç ve beat kimliğine göre filtre haritası döndür.
 *
 * @param girdiler [{ id, src, video }]
 * @returns { [id]: "eq=...,colorbalance=..." }
 */
export async function gradeHaritasi(girdiler, { ffmpegPath, tema, mapLimit, concurrency = 4, killer, logFn } = {}) {
  const out = {};
  if (!girdiler?.length) return out;
  let olculen = 0;
  const sonuc = await mapLimit(girdiler, concurrency, async (g) => {
    if (killer?.cancelled) throw new Error("cancelled");
    const o = await olc(g.src, { ffmpegPath, video: g.video, killer });
    if (o) olculen++;
    return { id: g.id, filtre: gradeFiltresi(o, tema, {video:g.video}), y: o?.y ?? null };
  });
  const parlakliklar = [];
  for (const r of sonuc) {
    if (!r.ok) continue;
    out[r.value.id] = r.value.filtre;
    if (Number.isFinite(r.value.y)) parlakliklar.push(r.value.y);
  }
  if (logFn && parlakliklar.length > 1) {
    const ort = parlakliklar.reduce((a, b) => a + b, 0) / parlakliklar.length;
    const std = Math.sqrt(parlakliklar.reduce((a, b) => a + (b - ort) ** 2, 0) / parlakliklar.length);
    logFn(`Renk derecelendirme: ${olculen}/${girdiler.length} kaynak ölçüldü (parlaklık dağılımı ±${std.toFixed(0)} → hedefe çekiliyor).`);
  }
  return out;
}

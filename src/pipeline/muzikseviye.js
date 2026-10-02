// YATAK PARÇALARI AYNI SEVİYEYE ÇEK.
//
// NEDEN GEREKLİ (ölçüm): kurulumla gelen dört yatağın gücü -30,5 / -30,2 /
// -28,8 / -29,7 LUFS — hepsi beraber hazırlandığı için 1,7 dB içinde. Ses
// karışımı bu seviyeye göre ayarlı (musicVolume 0,16).
//
// Kullanıcı music/ klasörüne dışarıdan parça atınca bu varsayım kırılıyor:
// YouTube Audio Library ve Pixabay parçaları tipik olarak -14 ile -18 LUFS,
// yani mevcut yataklardan 12-16 dB GÜRÜLTÜLÜ. Olduğu gibi karışıma girerse
// müzik anlatımın üstüne çıkar ve video kullanılamaz hâle gelir.
//
// NEDEN loudnorm DEĞİL: filtre zincirinde tek geçişli loudnorm dinamik kip
// çalışıyor, yani yatağa sıkıştırma uyguluyor ve konuşma altında pompalama
// duyuluyor. Bunun yerine parça bir kez ÖLÇÜLÜP sabit kazanç uygulanıyor:
// dinamiğe hiç dokunulmuyor, ölçüm de dosya başına bir defa yapılıp
// önbelleğe yazılıyor.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, run } from "../util.js";

/**
 * Yatakların oturacağı hedef.
 *
 * -30'DAN -24'E ÇIKARILDI (ÖLÇÜMLE). Eski değer kurulumla gelen dört parçanın
 * ortalamasıydı — ama o dördü müzik bile değildi, üretilmiş sub-bas drone'du
 * (bkz. muzik.js YER_TUTUCU). Yani hedef, duyulmayan bir şeye göre ayarlanmıştı.
 *
 * Bitmiş videoda üç bağımsız yoldan ölçüldü (20260817-b05a7a):
 *   anlatımın RMS'i                       -17,2 dB
 *   duraklamalarda ölçülen müzik tabanı   -36 ile -51 dB
 * Yani konuşmanın olmadığı anlarda bile müzik 19-34 dB altta kalıyor; telefon
 * ve laptop hoparlöründe hiç duyulmuyor. Videoda beş ayrı parça kullanılmasına
 * rağmen izleyici için ortada müzik yok.
 *
 * Belgesel yatağı, kimsenin konuşmadığı anda konuşmanın 12-18 dB altında
 * olmalı. +6 dB bunu karşılıyor. Daha agresif bir sıçrama (-19, yani +11 dB)
 * denenmedi: ducking zaten konuşma sırasında ~6 dB kısıyor ve fazlası
 * anlatımı örtme riski taşıyor. Sonraki videoda duraklama seviyesi yeniden
 * ölçülecek; hedef duraklamada -24…-26 LUFS.
 *
 * NOT: musicVolume (config.js) ile BİRLİKTE yükseltilmemeli — ikisi çarpışır.
 */
export const HEDEF_LUFS = -24;
// Bozuk ölçüm karışımı uçurmasın diye kazanç sınırları (dB).
//
// Taban -24: kullanıcının indirdiği altı YouTube Audio Library parçası -9,5
// ile -14,4 LUFS arasında ölçüldü. En gürültülüsü (Clocks, -9,5) hedefe
// inmek için -20,5 dB istiyor; eski -20 tavanı onu 0,5 dB yukarıda
// bırakıyordu. -24 ile -6 LUFS'a kadar masterlanmış parçalar da tam oturuyor.
export const EN_AZ_KAZANC = -24;
export const EN_COK_KAZANC = 12;

const ONBELLEK = path.join(DATA_DIR, "muzik-seviye.json");

/** Ölçülen güçten uygulanacak sabit kazanç (dB). Ölçüm yoksa 0 — dokunma. */
export function kazancHesapla(lufs, hedef = HEDEF_LUFS) {
  if (!Number.isFinite(lufs) || lufs < -70) return 0;
  const ham = hedef - lufs;
  return Math.round(Math.min(EN_COK_KAZANC, Math.max(EN_AZ_KAZANC, ham)) * 10) / 10;
}

/** Dosyanın kimliği: yol + boyut + değişme zamanı. İçerik değişirse yeniden ölçülür. */
function kimlik(dosya) {
  try {
    const s = fs.statSync(dosya);
    return `${path.basename(dosya)}|${s.size}|${Math.round(s.mtimeMs)}`;
  } catch { return null; }
}

function onbellekOku() {
  try { return JSON.parse(fs.readFileSync(ONBELLEK, "utf8")); } catch { return {}; }
}
function onbellekYaz(o) {
  try { fs.writeFileSync(ONBELLEK, JSON.stringify(o, null, 2), "utf8"); } catch {}
}

/** Tek dosyanın bütünleşik gücü (LUFS). Ölçülemezse null. */
export async function guctuOl(ffmpegPath, dosya, opts = {}) {
  let lufs = null;
  try {
    await run(ffmpegPath, ["-i", dosya, "-af", "ebur128=framelog=quiet", "-f", "null", "-"], {
      timeoutMs: 180000, ...opts,
      onLine: (s) => {
        const m = String(s).match(/I:\s*(-?[\d.]+)\s*LUFS/);
        if (m) lufs = parseFloat(m[1]);
      },
    });
  } catch { return null; }
  return Number.isFinite(lufs) ? lufs : null;
}

/**
 * Verilen yatakların kazançlarını döndür: { dosyaYolu: kazancDb }.
 *
 * Ölçüm dosya başına BİR kez yapılıp önbelleğe yazılıyor; sonraki videolarda
 * ölçüm yok. Ölçüm başarısız olursa o parça kazançsız geçer (0 dB) — akış
 * kırılmaz, sadece o parça eskisi gibi davranır.
 */
export async function kazanclariHesapla(ffmpegPath, dosyalar, { logFn = () => {}, killer } = {}) {
  const benzersiz = [...new Set(dosyalar || [])];
  const onbellek = onbellekOku();
  const sonuc = {};
  let olculen = 0;

  for (const d of benzersiz) {
    const k = kimlik(d);
    if (k && Number.isFinite(onbellek[k])) { sonuc[d] = kazancHesapla(onbellek[k]); continue; }
    const lufs = await guctuOl(ffmpegPath, d, { killer });
    if (lufs === null) { sonuc[d] = 0; continue; }
    if (k) onbellek[k] = lufs;
    sonuc[d] = kazancHesapla(lufs);
    olculen++;
  }

  if (olculen) {
    onbellekYaz(onbellek);
    logFn(`${olculen} yeni yatak parçası ölçüldü ve seviyesi ${HEDEF_LUFS} LUFS'a çekildi.`);
  }
  const duzeltilen = benzersiz.filter((d) => Math.abs(sonuc[d]) >= 1);
  if (duzeltilen.length) {
    logFn("Seviye düzeltmesi: " +
      duzeltilen.map((d) => `${path.basename(d)} ${sonuc[d] > 0 ? "+" : ""}${sonuc[d]} dB`).join(", "));
  }
  return sonuc;
}

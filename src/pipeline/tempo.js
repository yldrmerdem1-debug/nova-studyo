// KONUŞMA TEMPOSU — hedef süreyi tutturmak için.
//
// SORUN. config.js'te sabit bir varsayım vardı: Türkçe 140 kelime/dakika.
// Bitmiş 22 işte ölçüldüğünde gerçek değer bambaşka çıktı:
//
//   ön ayar        n    gerçek wpm (ortanca)
//   test           5    109,4
//   kisa          12    109,4
//   uzunformat     2    117,1
//   TR toplam     18    109,9
//
// Yani senaryo bütçesi %27 fazla kelimeyle hesaplanıyordu. Sonuç: "3 dakika"
// istenen video 4 dk 31 sn çıkıyordu (hedefin %151'i). Ön ayarlar arasında
// hızın kararlı olması (109-117), farkın açılış/kapanış kartı payından değil
// doğrudan yanlış varsayımdan geldiğini gösteriyor.
//
// Senaryonun kendisi bütçeye UYUYOR (kısa formatta ortanca %97) — sorun
// bütçenin yanlış hesaplanmasıydı.
//
// NEDEN SABİT YETMİYOR. Tempo sese, dile ve ElevenLabs'in `speed` ayarına göre
// değişiyor; üçü de kullanıcı tarafından değiştirilebiliyor. O yüzden ölçülen
// değerler biriktiriliyor ve yeterli örnek olunca ortanca kullanılıyor.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../util.js";

// Test bu dosyayı geçici bir yola alabilsin diye ortam değişkeniyle
// değiştirilebilir. Aksi hâlde testler kullanıcının gerçek kalibrasyonunu
// kirletirdi ve bozuk ölçümler kalıcı olarak süre hesabını şaşırtırdı.
const DOSYA = process.env.NOVA_TEMPO_DOSYA || path.join(DATA_DIR, "tempo.json");

/** Anahtar başına en fazla kaç ölçüm saklanır (eski işler yeniyi gölgelemesin). */
const PENCERE = 12;

/** Kaç ölçümden sonra öğrenilen değere güvenilir. Altındaysa sabit kullanılır. */
export const YETER_ORNEK = 3;

// ÜÇ UZUNLUK BANDI. Çok kısa işler ayrı bir rejim: bütçe küçüldükçe model
// bütçenin ÜSTÜNE çıkıyor (taban etkisi). Ölçüldü — 1 dakikalık işlerde
// bütçe uyumu TR %98 ama EN %156. Bu ölçümler 3 dakikalık işlerin
// kalibrasyonuna karışırsa ikisini de bozar, o yüzden ayrı anahtarda tutulur.
const MINI_ESIGI = 1.5;   // dakika; bu değerin ALTI "mini" (deneme videoları)
const UZUN_ESIGI = 3;     // dakika; bu değerin ÜSTÜ uzun format

function band(dakika) {
  if (dakika > UZUN_ESIGI) return "uzun";
  return dakika <= MINI_ESIGI ? "mini" : "kisa";
}

/**
 * Belirleyici olan ham konuşma hızı DEĞİL, "etkin katsayı" = wpm / bütçe uyumu.
 * Hedefi tutturan sayı budur; yalnızca hıza bakmak uzun formatta ve İngilizcede
 * yanlış yöne götürüyor.
 *
 *   TR kisa (n=12)  wpm 109 · uyum %97   -> etkin 113   (ölçüm güçlü)
 *   TR uzun (n=1)   wpm 119 · uyum %85   -> etkin 140   (eski değerle aynı)
 *   EN kisa (n=1)   wpm 157 · uyum %108  -> etkin 146
 *   EN mini (n=1)   wpm 184 · uyum %156  -> etkin 118   (taban etkisi)
 *
 * EN için bir ara bu değer 165'e çıkarılmıştı — hız ölçümüne bakılıp bütçe
 * uyumu atlandığı için YANLIŞ yöndeydi; 3 dakikalık örnekte süreyi %106'dan
 * %113'e çıkarıyordu. 146 aynı örneği tam %100'e oturtuyor.
 */
export const VARSAYILAN = {
  mini: { tr: 110, en: 146 },   // TR'de taban etkisi ölçülmedi, kısa ile aynı
  kisa: { tr: 110, en: 146 },
    // UZUN FORMAT YENİDEN KALİBRE EDİLDİ. 140 değeri senaryonun bütçenin %85'ini
  // yazdığı ESKİ davranışa göre doğruydu — eksiklik yüksek katsayıyı
  // dengeliyordu. Segment sayısı artık kesin dille isteniyor ve canlı ölçümde
  // uyum %96'ya çıktı (8/8 segment, 336/350 kelime). Denge bozulunca 140 ile
  // 10 dakikalık video %115'e çıkıyor. Ölçülen hız 117 wpm ile doğru katsayı:
  //   117 / 0,96 = 122
  uzun: { tr: 122, en: 155 },   // EN uzun formatta hâlâ ölçüm yok
};

export function varsayilanWpm(lang, dakika = 0) {
  const grup = VARSAYILAN[band(dakika)];
  return grup[lang] || grup.tr;
}

// Anahtar uzunluk bandını da taşır: farklı rejimlerin ölçümleri karışmamalı.
const anahtar = (lang, sesId, dakika) =>
  `${lang || "tr"}|${sesId || "-"}|${band(dakika)}`;

function oku() {
  try {
    const o = JSON.parse(fs.readFileSync(DOSYA, "utf8"));
    return o && typeof o === "object" ? o : {};
  } catch { return {}; }
}

function yaz(o) {
  try {
    fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
    fs.writeFileSync(DOSYA, JSON.stringify(o, null, 2), "utf8");
  } catch { /* kalibrasyon yazılamazsa iş durmaz */ }
}

export function ortanca(a) {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Bitmiş bir işten ölçüm ekle.
 * @param kelime toplam kelime
 * @param saniye toplam konuşma süresi
 */
export function olcumEkle({ lang, sesId, kelime, saniye, butce, dakika }) {
  // Anlamsız ölçümleri hiç kaydetme: çok kısa iş ya da bozuk süre kalibrasyonu
  // kalıcı olarak zehirler.
  if (!(kelime > 40) || !(saniye > 20)) return null;

  // ÖLÇÜLEN DEĞER "etkin wpm": bütçeye kaç kelime yazıldığını da içerir.
  // Yalnızca konuşma hızını öğrenmek yetmiyordu — uzun formatta senaryo
  // bütçenin %85'ini yazıyor ve hedefi asıl kaçıran bu.
  //   etkin_wpm = wpm / uyum = (kelime/dk) / (kelime/bütçe) = bütçe / dk
  // Bütçe bilinmiyorsa ham hıza düşülür.
  const dk = saniye / 60;
  const hamWpm = kelime / dk;
  const deger = butce > 0 ? butce / dk : hamWpm;

  // Fiziksel olarak imkânsız değerler (kesik ses, bozuk süre) elenir.
  if (!Number.isFinite(deger) || deger < 50 || deger > 300) return null;

  const o = oku();
  const k = anahtar(lang, sesId, dakika);
  const dizi = Array.isArray(o[k]) ? o[k] : [];
  dizi.push(Math.round(deger * 10) / 10);
  o[k] = dizi.slice(-PENCERE);
  yaz(o);
  return { etkin: deger, ham: hamWpm };
}

/**
 * Bu dil+ses+uzunluk grubu için kelime bütçesi katsayısı.
 * Yeterli ölçüm yoksa ölçülmüş varsayılana düşer.
 */
export function tahminWpm(lang, sesId, dakika = 0) {
  const o = oku();
  const dizi = o[anahtar(lang, sesId, dakika)];
  if (Array.isArray(dizi) && dizi.length >= YETER_ORNEK) {
    const m = ortanca(dizi);
    // Öğrenilen değer de akla yatkın aralıkta olmalı.
    if (m >= 50 && m <= 300) return m;
  }
  return varsayilanWpm(lang, dakika);
}

/** Arayüz/günlük için: bu ses için kaç ölçüm var, tahmin ne? */
export function tempoOzeti(lang, sesId, dakika = 0) {
  const dizi = oku()[anahtar(lang, sesId, dakika)] || [];
  return {
    ornek: dizi.length,
    wpm: tahminWpm(lang, sesId, dakika),
    ogrenildi: dizi.length >= YETER_ORNEK,
  };
}

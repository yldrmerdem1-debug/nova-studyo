// ARŞİV ÖNCELİKLİ GÖRSEL (Sinematik Belgesel, docuSource: "archive")
//
// Gerçek kişi, yer, belge ve olaylar gerçek fotoğrafla gösterilir; AI yalnızca
// fotoğrafı olmayan anlarda devreye girer. Senaryo her sahne için `source`
// ("archive" | "ai") ve arşiv için İngilizce `search` sorgusu yazar.
//
// Sahne başına akış:
//   1. Nova'nın arşiv araması (Wikimedia, Wikipedia, LoC, NASA, Met, Openverse,
//      Pexels, Pixabay, Unsplash — lisansı uygun olmayanlar zaten elenir)
//   2. En iyi 4 aday küçük resim olarak bir görme modeline TEK istekte gösterilir:
//      "hangisi bu sahneyi doğru gösteriyor?" — yanlış kişi/yer/dönem elenir.
//      (Truva belgeselinde ölçüldü: metin eşleşmesi Florida'daki bir mezarlığı
//      Truva diye seçmişti; bu yüzden karar görselin kendisine bakılarak verilir.)
//   3. Seçilen tam çözünürlükte indirilir ve motorun public klasörüne konur;
//      künye (eser, sahip, lisans, kaynak) SEO açıklamasına girer. Piksel boyutu
//      (imgW/imgH) sahneye yazılır: motor dikey portreleri ve küçük taramaları
//      kırpıp büyütmek yerine çerçeveli gösterebilsin.
//   Hiçbir aday uymazsa sahne kendi imagePrompt'uyla AI'a düşer.
//
// BİR FOTOĞRAF, BİR VİDEODA BİR KEZ. İki katman:
//   - photoKey (media.js): aynı dosyanın adres biçimleri (Commons ?utm, thumb,
//     Wikipedia, Openverse) tek anahtar.
//   - dHash: aynı fotoğrafın BAŞKA sitedeki kopyası (NASA ↔ Commons, Flickr ↔
//     Openverse) — adresler benzemese de küçültülmüş görüntü aynı.
//
// HAREKETLİ GÖRÜNTÜ ÖNCE (sahnede `media: "video"`). Belgesel çoğunlukla hareketli
// görüntüyle anlatılır; fotoğraf yalnızca görüntüsü olamayan yerde. Bu sahnelerde:
//   1. Aynı `search` bir görüntü sorgusu olarak aranır: Nova'nın araması (Pexels,
//      Pixabay, Wikimedia, Archive.org videoları) + kamu malı arşiv koleksiyonları
//      (Universal Newsreel, Prelinger, NASA, FedFlix — yalnızca lisansı kayıtlı olanlar)
//      ve süresi/boyutu bilinen Commons videoları.
//   2. En iyi 4 aday görme modeline gösterilir. Uzun klipten (haber filmi) tek kare
//      yanıltıcıdır — açılış kartı gösterir: klibin boyunca 4 ya da 9 karelik bir ızgara
//      yapılır ve model hem klibi hem de sahneye uyan BÖLÜMÜ seçer.
//   3. Seçilen klibin o bölümü (en çok ~40 sn) indirilir, H.264/30fps/sessiz olarak
//      kodlanır; bir durağan karesi `image` olur (kolaj, bölüm kartı, ödünç alma,
//      kapak için). Sahneye video/videoStart/videoDur/videoW/videoH yazılır.
//   Uygun klip yoksa sahne yukarıdaki fotoğraf akışına düşer, o da yoksa AI'a.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readJson, writeJson, downloadFile, run, fetchJson } from "../util.js";
import { searchQuery, photoKey, kapaliSaglayicilar, geciciSaglayiciHatasi } from "./media.js";
import { selectedProvenance, commonsMetadata, permissionUsable } from "./provenance.js";
import { callVisionJSON } from "../llm.js";

const ARCHIVE_TYPES = new Set(["photo", "title", "words", "slam", "headline", "document", "quote"]);
const ADAY = 4;
/** Algısal kopyalar elendiğinde görme modeline yine 4 aday gidebilsin diye fazladan alınan. */
const ADAY_YEDEK = 3;
/**
 * Seçim kuralları değişince eski "uygun yok" kararları yeniden denensin.
 * 5: isim kartındaki kişi ana konu mu; eşit doğru adaylarda büyük olan.
 */
const PICK_VERSION = 5;
/** Başlık ve slam: fotoğraf tam ekran, üstünde dev yazı — bu kısa kenarın altı pikselli görünür. */
const TAM_EKRAN_TIPLER = new Set(["title", "slam"]);
const TAM_EKRAN_EN_AZ = 380;
/** Odak noktası taşıyabilen sahneler (types.ts: PhotoScene.focus, WordsScene.focus). */
const ODAK_TIPLER = new Set(["photo", "words"]);
/** Bu en/boy oranının altı (dikey ya da kareye yakın) 16:9'a kırpılınca baş/çene gider. */
const DIKEY_ORAN = 1.3;
/**
 * Kaydedilen görselin tavanı. Eskiden yalnızca genişlik 2560'la sınırlanıyordu;
 * 3000x5000'lik dikey bir tarama 2560x4266 olarak kalıyor, render belleğini
 * boşuna şişiriyordu. Uzun kenar da sınırlı; küçük görsel büyütülmez.
 */
const OLCEK = "scale='min(2560,iw)':'min(2880,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
/** Algısal özet için 9x8 gri küçültme (dHash). */
const OZET_VF = "scale=9:8:flags=area,format=gray";
/** CC BY "değişiklikleri belirt" şartı: sinematik motor fotoğrafa ne yapıyor. */
const DOCU_MODS = "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi.";

/**
 * Numaralı özel ad çakışması: aranan "Apollo 13" iken başlığı "Apollo 17 Command
 * Module" olan fotoğraf. Görme modeli (ölçüldü, Apollo 13 testi) başlıkta bunu
 * görüp yine de seçti; bu yüzden karar modele bırakılmaz, aday baştan elenir.
 */
const MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|oca|şub|nis|haz|tem|ağu|eyl|eki|kas|ara)/i;
export function numberedNameConflict(search, title) {
  const t = String(title || "");
  // Yalnızca "ad + 1-3 haneli numara" (Apollo 13, Voyager 2, Boeing 747). Yıllar ve
  // tarihler ("April 1970", "launch 1970") kural dışı: aynı olayın başka bir tarihte
  // çekilmiş fotoğrafı yanlış değildir.
  for (const m of String(search || "").matchAll(/\b([A-Za-zÇĞİÖŞÜçğıöşü]{3,})[\s-]+(\d{1,3})\b(?!\d)/g)) {
    const word = m[1];
    const num = m[2];
    if (MONTH.test(word)) continue;
    const other = new RegExp(`\\b${word}[\\s-]*(\\d{1,3})\\b(?!\\d)`, "gi");
    for (const x of t.matchAll(other)) if (x[1] !== num) return true;
  }
  return false;
}
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const stripTags = (t) => String(t || "").replace(/\[[^\]]*\]\s*/g, "").trim();
const uyku = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------- algısal özet (dHash) ----------

/**
 * 9x8 gri pikselden 64 bitlik fark özeti: her satırda komşu iki pikselden
 * soldaki daha parlak mı? Yeniden kodlamaya, boyutlandırmaya ve hafif renk
 * farkına dayanıklı; aynı fotoğrafın iki kopyası birkaç bit, iki farklı
 * fotoğraf ~30 bit ayrışır. 16 haneli onaltılık metin döner.
 */
export function dHashFromGray(buf) {
  if (!buf || buf.length < 72) return null;
  let hex = "";
  for (let r = 0; r < 8; r++) {
    let bayt = 0;
    for (let c = 0; c < 8; c++) bayt = (bayt << 1) | (buf[r * 9 + c] > buf[r * 9 + c + 1] ? 1 : 0);
    hex += bayt.toString(16).padStart(2, "0");
  }
  return hex;
}
const bitSay = (x) => { let n = 0; for (; x; x >>= 1) n += x & 1; return n; };
export function hashFark(a, b) {
  let d = 0;
  for (let i = 0; i < 16; i += 2) d += bitSay(parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16));
  return d;
}
/** Aynı fotoğraf sayılan en çok bit farkı (64 bitte). */
const DHASH_ESIK = 6;
/**
 * Düz, bilgisiz özet (siyah gökyüzü, boş kâğıt, düz gradyan): iki FARKLI
 * fotoğraf aynı özeti verebilir. Bunlar karşılaştırılmaz — yanlışlıkla
 * "kopya" deyip doğru fotoğrafı elemektense adres kontrolüyle yetinilir.
 */
function bilgili(h) {
  let n = 0;
  for (let i = 0; i < 16; i += 2) n += bitSay(parseInt(h.slice(i, i + 2), 16));
  return n >= 8 && n <= 56;
}
export function ayniFotograf(a, b) {
  return !!(a && b && bilgili(a) && bilgili(b) && hashFark(a, b) <= DHASH_ESIK);
}

/** JPEG/PNG başlığından piksel boyutu — ffprobe'a ayrı süreç açmadan. */
export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }                                   // dolgu baytı
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; }  // uzunluksuz işaretler
    // SOF0..SOF15 (C4 DHT, C8 JPG, CC DAC hariç): yükseklik, sonra genişlik
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

async function dosyaOzeti(ffmpeg, file, out) {
  try {
    await run(ffmpeg, ["-y", "-i", file, "-frames:v", "1", "-vf", OZET_VF, "-f", "rawvideo", out], { timeoutMs: 30000 });
    return dHashFromGray(fs.readFileSync(out));
  } catch { return null; }
}

// ---------- görme kararı ----------

const PICK_SCHEMA = {
  type: "object",
  properties: {
    choice: { type: "integer", description: "Seçilen adayın numarası (1..N). Hiçbiri uygun değilse 0." },
    reason: { type: "string", description: "Tek cümle gerekçe" },
    namedPersonIsMainSubject: {
      type: "boolean",
      description: "İsim kartındaki kişi seçilen fotoğrafın açık ana konusu mu (yüzü görünür)? İsim kartı yoksa ya da seçim 0 ise true.",
    },
  },
  required: ["choice", "reason", "namedPersonIsMainSubject"],
  additionalProperties: false,
};

/** Video adayları için: seçimle birlikte klibin hangi bölümünün sahneye uyduğu. */
const VIDEO_PICK_SCHEMA = {
  ...PICK_SCHEMA,
  properties: {
    ...PICK_SCHEMA.properties,
    segment: {
      type: "integer",
      description: "Seçilen aday bir kare IZGARASI ise sahneye en uygun karenin numarası (soldan sağa, yukarıdan aşağıya 1..N). Izgara değilse ya da seçim 0 ise 1.",
    },
  },
  required: [...PICK_SCHEMA.required, "segment"],
};
const PICK_SCHEMA_FOTO = PICK_SCHEMA;

/** Adaylar VİDEO ise istemin sonuna eklenen kurallar. */
function videoPromptLines(scene) {
  return [
    ``,
    `DİKKAT: Adaylar fotoğraf değil, VİDEO KLİPLERİ. Her aday ya klibin tek bir karesi ya da klibin boyunca alınmış kareler IZGARASIDIR (etikette yazar; kareler soldan sağa, yukarıdan aşağıya 1, 2, 3…).`,
    `İki şeyi birlikte değerlendir: (1) konu ve DÖNEM doğru mu — yukarıdaki kurallar aynen geçerli; (2) görüntü sinematik bir belgeselde tam ekran KULLANILABİLİR mi.`,
    `Şunlar olan klibi SEÇME: görüntüye gömülü altyazı ya da yazı, filigran, kanal/haber logosu, haber bandı, ekran grafiği; dikey (portre) kadraj; çoğu karesi siyah, jenerik ya da başlık kartı olan klip; bölünmüş ekran, montaj efekti.`,
    ...(scene.source === "stock" ? [`Stok klipte kameraya bakıp konuşan, poz veren ya da reklam gibi gülümseyen insan OLMASIN; modern nesneler dönemle çelişmesin.`] : []),
    `Izgaralı adayda klibin bir kısmı konuya uyuyorsa klip kullanılabilir: "segment" alanına o karenin numarasını yaz (sahne oradan başlayacak). Uyan kare yoksa o adayı seçme.`,
    `Hiçbir klip uymuyorsa 0 döndür — o zaman sahne için fotoğraf aranır; yanlış görüntü göstermek fotoğrafa dönmekten KÖTÜDÜR.`,
  ];
}

/**
 * Hikâyenin dönemi (anlatımda geçen yıllardan). Stok karede "modern jet, cam kokpit,
 * bayraklı gösteri paraşütçüsü" 1971 hikâyesine sızıyordu: seçici yılı bilmiyordu.
 */
export function hikayeDonemi(script) {
  if (script?.era) return String(script.era);
  const yillar = [];
  // Anlatım yılları yazıyla söyler ("bin dokuz yüz yetmiş bir"): rakamlı yıl arama sorgularında,
  // ekran yazılarında ve yıl sayaçlarında (counter year) durur.
  for (const s of script?.scenes || []) {
    const metin = [s.say, s.search, s.text, s.title, s.kicker, s.caption, s.role, ...(s.imagePrompts || []).map((p) => p?.search)].filter(Boolean).join(" ");
    // 1000 öncesi değil: "1453" tanınmıyordu (1500+ arıyordu) ve 1453 videosu dönem kurallarının hiçbirini almadı.
    for (const m of String(metin).matchAll(/\b(1\d\d\d|20[0-2]\d)\b/g)) yillar.push(+m[1]);
    // Ekrana basılan yıl sayacı hikâyenin kendi yılıdır; arama sorgusundaki tablo/eser yılı değil: 5 kat ağırlık.
    if (s.type === "counter" && (s.year || (Number.isInteger(s.to) && s.to >= 1000 && s.to <= 2029 && !s.prefix && !s.suffix))) yillar.push(s.to, s.to, s.to, s.to, s.to);
  }
  if (!yillar.length) return "";
  yillar.sort((a, b) => a - b);
  // Ana dönem: yılların ortancası; aralık ilk-son ("1971 (anlatım 1971–2016 arası)").
  const orta = yillar[Math.floor(yillar.length / 2)];
  return `${orta}${yillar[0] !== yillar.at(-1) ? ` (anlatım ${yillar[0]}–${yillar.at(-1)} arası)` : ""}`;
}
/**
 * Hikâyenin ana yılı (hikayeDonemi metninin ilk yılı) ya da null. 100–2099 ve MÖ/BC yılları (negatif):
 * yalnızca 1500+ tanındığında "1453 (Bizans ve Osmanlı…)" null dönüyor, dönem denetimi ve
 * KESİN RET kuralları sessizce atlanıyordu (1453: NY silueti, cruise gemisi, futbol taraftarı).
 */
export function donemYili(donem) {
  const s = String(donem || "");
  const mo = s.match(/\b(\d{1,4})\s*(?:BC|BCE|B\.C\.|MÖ|M\.Ö\.)/i) || s.match(/(?:MÖ|M\.Ö\.)\s*(\d{1,4})\b/i);
  if (mo) return -Number(mo[1]);
  const m = s.match(/\b([1-9]\d{2,3})\b/);
  return m && +m[1] <= 2099 ? +m[1] : null;
}
/** Fotoğraf (1839) ve sanayi öncesi: bu yıldan önceki hikâyede "dönemsiz" sayılan çok şey dönem dışıdır. */
export const SANAYI_ONCESI_SINIRI = 1850;
/**
 * Sanayi/fotoğraf öncesi hikâye için ek KESİN RET satırları (seçici ve dönem denetimi ortak).
 * 1453 QA: cruise gemisi, bayraklı modern yelkenli, yürüyüşçü, futbol taraftarı, Paskalya yumurtası,
 * kızılhaç sandığı, 19. yy üniformalı canlandırma, tropik orman, Venedik ara sokağı, 1870'ler fotoğrafı.
 */
export function sanayiOncesiSatirlari(yil) {
  if (yil == null || yil >= SANAYI_ONCESI_SINIRI) return [];
  return [
    `SANAYİ VE FOTOĞRAF ÖNCESİ (hikâye ${yil}): şunlar da KESİN RET:`,
    `- insan görünen her gerçek FOTOĞRAF ya da video (kalabalık, işçi, turist, yürüyüşçü, taraftar, asker): o insanlar bugünün insanıdır — yalnızca tablo, gravür, minyatür, mozaik, el yazması ya da yüzü/kıyafeti seçilmeyen silüet uygundur`,
    `- ${yil}'den yüzyıllar sonraki dönem fotoğrafı (1850–1950 arası siyah-beyaz şehir/liman fotoğrafı dahil): buharlı/çelik gemi, tramvay, telgraf direği görünür`,
    `- motorlu, çelik ya da beyaz gövdeli gemi, cruise gemisi, liman vinci; bayrak dizili, motorlu ya da turistik REPLİKA yelkenli`,
    `- elektrik ışığı, elektrik direği/teli, asfalt yol, beton, cam, plastik, basılı ambalaj, boyalı Paskalya yumurtası, kızılhaç işareti (1863 sonrası)`,
    `- başka bir yüzyılın üniforması ya da silahı (19. yy topçu canlandırması 15. yy hikâyesinde dönem dışıdır)`,
    `- bugünün turistik sokağı, restore edilmiş surun önündeki modern şehir, modern iç mekân`,
    `Dönemsiz görüntü (deniz, gökyüzü, ateş, mum, taş duvar yakın çekimi) ancak anlatılan YERE de uyuyorsa serbest: Akdeniz/Avrupa hikâyesinde tropik orman, palmiye, muson yağmuru yanlış yerdir.`,
  ];
}
/** Bu yıldan önceki hikâyede modern taşıt, marka ve şehir silueti KESİN ret; araç/uçak/şehir aramalarında kurum arşivi önce. */
export const ESKI_DONEM_SINIRI = 1990;
/**
 * Arama bir taşıt, uçak, havalimanı, şehir ya da iç mekân mı? Stok sitelerinde bunların
 * neredeyse hepsi bugünün görüntüsü (Cooper QA: Ryanair/Jetstar logolu jetler, cam
 * gökdelen manzaralı yatak odası).
 */
export function modernRiskli(q) {
  return /\b(air ?plane|aeroplane|plane|aircraft|airliner|jet|jetliner|airport|airfield|runway|tarmac|terminal|hangar|cockpit|cabin|flight|boeing|airline|car|cars|automobile|truck|traffic|highway|freeway|street|road|taxi|bus|train|subway|city|skyline|downtown|cityscape|skyscraper|building|office|bedroom|hotel|apartment|kitchen|living room|bar|diner|phone|computer|screen|tv|television|police|ambulance|fuel|gas station)s?\b/i.test(String(q || ""));
}
export function donemSatirlari(donem) {
  if (!donem) return [];
  const yil = donemYili(donem);
  const satirlar = [
    ``,
    `HİKÂYENİN DÖNEMİ: ${donem}. Karede o döneme AİT OLMAYAN insan yapımı bir şey varsa SEÇME: modern yolcu uçağı (kanat ucu kıvrımı, yeni boyalar, cam ekranlı kokpit), akıllı telefon, düz ekran, LED, modern araba, modern kıyafet, spor/gösteri paraşütçüsü, bayrak ya da marka taşıyan modern ekipman. Doğa, hava, gökyüzü, deniz, orman gibi dönemsiz görüntüler serbest.`,
  ];
  if (yil && yil < ESKI_DONEM_SINIRI) {
    satirlar.push(
      `KESİN RET (hikâye ${yil}; bunlardan BİRİ bile görünüyorsa aday 0 puan, konusu ne kadar uygun olursa olsun):`,
      `- okunabilen ya da tanınan havayolu LOGOSU veya BOYASI (Ryanair, Jetstar, easyJet, Emirates, Southwest, Lufthansa'nın bugünkü boyası vb.) — logo seçilmez, dönemin havayolu olsa bile bugünkü boyası dönem dışıdır`,
      `- modern uçak tipi: iki motorlu dar gövde jetler (A320 ailesi, 737 NG/MAX, 787, A350, bölgesel jetler), kanat ucu winglet'i, cam kokpit ekranları; ${yil} civarının uçakları üç/dört motorlu ve winglet'sizdir (727, 707, DC-8, DC-9, pervaneliler)`,
      `- modern araba, kamyon, havalimanı araçları (yuvarlak hatlı gövde, LED far, reflektif yelekli ekipler), yakıt tankerinin bugünkü tasarımı`,
      `- akıllı telefon, dizüstü, düz/LED ekran, LED tabela ya da LED sokak lambası`,
      `- cam cepheli gökdelen silueti, bugünkü şehir manzarası, modern minimalist iç mekân (yatak odası, otel, ofis)`,
      ...sanayiOncesiSatirlari(yil),
      `Emin değilsen o adayı SEÇME — dönem dışı bir kare, AI canlandırmasına dönmekten KÖTÜDÜR. Yalnızca dönemsiz görüntü (doğa, gökyüzü, yağmur, orman, deniz) ya da açıkça o döneme ait kare uygundur.`,
    );
  }
  return satirlar;
}
/** Stok siteleri: bugünün görüntüsü. Kurum arşivleri (Archive.org kamu malı, Wikimedia, NASA, LoC…) dönem görüntüsü verir. */
const STOK_SAGLAYICI = new Set(["pexels", "pixabay", "mixkit", "unsplash", "openverse"]);
/**
 * Eski dönem (1990 öncesi) hikâyede taşıt/uçak/şehir aramasında adaylar arşiv önce sıralanır —
 * stok sahnesi de olsa. Sıra içi korunur; hiç arşiv adayı yoksa liste aynen kalır.
 */
/*
 * SANAYİ ÖNCESİ STOK KURALI. 1453'te dönem denetimi stok sitelerinin karelerini bir bir reddetti
 * (Pexels 15/33, Unsplash 6/8, Mixkit 5/15: modern İstanbul, restore surlar, canlandırmacılar,
 * kruvaziyer, futbol taraftarı, Vietnam bayrağı); AI kareleri 0/29. 1850 öncesi bir hikâyede bugünün
 * fotoğrafı yalnızca ZAMANSIZ bir şeyi gösterebilir (deniz, gök, ateş, hava, gece, sade doğa); insan,
 * şehir, ordu, gemi, yapı için stok adayı hiç aranmaz/seçilmez — kurum arşivi (tablo, gravür) ya da AI.
 */
const ZAMANSIZ = /\b(sea|ocean|waves?|water|river|lake|sky|clouds?|storm|thunder|lightning|rain|snow|ice|frost|fog|mist|wind|fire|flames?|embers?|smoke|candles?|candlelight|moon|stars?|sunrise|sunset|dawn|dusk|night|forest|trees?|leaves|grass|field|mountains?|desert|sand|deniz|okyanus|dalga|nehir|gökyüzü|bulut|fırtına|şimşek|yağmur|kar|buz|sis|rüzgar|ateş|alev|kor|duman|mum|ay|yıldız|gün doğumu|gün batımı|şafak|gece|orman|ağaç|çimen|dağ|çöl|kum)\b/iu;
const ZAMANLI = /\b(people|person|man|men|woman|women|child|soldiers?|army|troops|crowd|city|street|ships?|boats?|harbou?r|port|buildings?|walls?|castle|fortress|tower|town|village|market|cannons?|horses?|cart|church|mosque|palace|insan|adam|kadın|çocuk|asker|ordu|kalabalık|şehir|sokak|gemi|tekne|liman|bina|sur|kale|kule|köy|pazar|araba|kilise|cami|saray|süvari)\b/iu;
export function zamansizKare(scene) {
  const t = `${scene?.search || ""} ${scene?.imagePrompt || ""}`;
  return ZAMANSIZ.test(t) && !ZAMANLI.test(t);
}
/** 1850 öncesi hikâyede zamansız olmayan sahne için stok sitesi adayları atılır (sadece kurum arşivi kalır). */
export function sanayiOncesiAdaylar(liste, scene, yil) {
  if (yil == null || yil >= SANAYI_ONCESI_SINIRI || zamansizKare(scene)) return liste;
  return liste.filter((c) => !STOK_SAGLAYICI.has(c?.provider) || c?.provider === "openverse");
}

export function arsivOnce(liste, { eski = false, riskli = false } = {}) {
  if (!eski || !riskli) return liste;
  const arsiv = liste.filter((c) => !STOK_SAGLAYICI.has(c?.provider));
  return arsiv.length ? [...arsiv, ...liste.filter((c) => STOK_SAGLAYICI.has(c?.provider))] : liste;
}

function pickPrompt(scene, n, video = false, donem = "") {
  const satirlar = [pickPromptBase(scene, n), ...donemSatirlari(donem)].join("\n");
  return video ? [satirlar, ...videoPromptLines(scene)].join("\n") : satirlar;
}

function pickPromptBase(scene, n) {
  if (scene.source === "stock") {
    // Genel atmosfer karesi (yağmurlu cam, fırtınalı deniz): kimlik değil, his ve dönem uyumu önemli.
    return [
      `Bir YouTube belgeselinde bir atmosfer/ara plan karesi seçiyorsun (stok fotoğraf).`,
      `Anlatıcı: "${stripTags(scene.say)}"`,
      `İstenen görüntü: ${scene.search}${scene.imagePrompt ? ` — tarif: ${scene.imagePrompt}` : ""}`,
      ``,
      `${n} aday var (Aday 1..${n}). Sahneye en SİNEMATİK ve en uygun olanı seç: ruh hâli, ışık, kompozisyon.`,
      `Şunlar UYGUNSUZ, seçme: dönemle çelişen modern nesneler (1900'ler anlatılırken akıllı telefon, modern araba, LED), gülümseyen poz vermiş "stok" insanlar, filigran/logo/yazı, illüstrasyon ya da 3D render, bulanık/küçük kareler.`,
      `Birden çok aday eşitse piksel boyutu büyük ve yatay olanı seç. Hiçbiri uymuyorsa 0 döndür.`,
      `Bu sahnede isim kartı yok: namedPersonIsMainSubject=true döndür.`,
    ].join("\n");
  }
  const ad = scene.name ? `"${scene.name}"${scene.role ? ` (${scene.role})` : ""}` : "";
  return [
    `Bir YouTube belgeselinde şu sahne için gerçek arşiv fotoğrafı seçiyorsun.`,
    `Anlatıcı: "${stripTags(scene.say)}"`,
    `Aranan görüntü: ${scene.search}`,
    ``,
    `${n} aday var (Aday 1..${n}). Asıl soru: bu fotoğraf anlatılan KİŞİYİ, YERİ, NESNEYİ ya da OLAYI gerçekten gösteriyor mu?`,
    `Kıyafet, poz, açı, renk gibi ayrıntıların hayal ettiğinden farklı olması SORUN DEĞİL — doğru konunun gerçek fotoğrafı her zaman AI canlandırmasından iyidir.`,
    `Şunlar UYGUNSUZ, seçme:`,
    `- yanlış kişi, yanlış yer, yanlış dönem ya da sadece "benzer türden" başka bir şey (başka bir kazı alanı, başka bir roket, başka bir saray)`,
    `- başlığında BAŞKA bir özel ad geçen fotoğraf (aranan Apollo 13 iken "Apollo 11", "Eagle", "Apollo 8"; aranan kişi yerine başka biri) — başlık, fotoğrafın ne olduğunun kanıtıdır`,
    `- büyük filigran, logo, üstüne basılmış yazı; ekran görüntüsü, grafik, harita (sahne harita istemiyorsa)`,
    `- çok bulanık, çok küçük, anlaşılmayan kare`,
    // Video 16:9 ve tam ekran: iki doğru aday arasında küçük tarama büyütülünce bulanıklaşır.
    `Birden çok aday konuyu EŞİT derecede doğru gösteriyorsa piksel boyutu BÜYÜK olanı seç (boyutlar aday etiketlerinde); o da eşitse yatay kadrajlı olanı — video 16:9 ve tam ekran gösterilecek.`,
    ...(ad ? [
      ``,
      `Bu fotoğrafın altına İSİM KARTI basılacak: ${ad}.`,
      `Bu kişi fotoğrafın açık ANA KONUSU olmalı ve yüzü görünmeli. Doğru adaylar arasında o kişinin yüzü net olanı tercih et.`,
      `Seçtiğin karede kişi kalabalığın/grubun içinde, arka planda ya da küçük kalıyorsa (ya da kare bir mekânı/nesneyi gösteriyorsa) namedPersonIsMainSubject=false döndür — fotoğraf yine kullanılır ama isim kartı kaldırılır.`,
    ] : [`Bu sahnede isim kartı yok: namedPersonIsMainSubject=true döndür.`]),
    `Hiçbiri gerçekten uymuyorsa 0 döndür — yanlış fotoğraf göstermek, AI ile canlandırmaktan KÖTÜDÜR.`,
  ].join("\n");
}

/** Görme kararı: OpenAI anahtarı varsa onunla (Anthropic kredisi bittiğinde de çalışır), yoksa Claude ile. */
async function visionPick(scene, thumbs, { settings, usage, logFn, titles = [], sizes = [], video = null }) {
  const prompt = pickPrompt(scene, thumbs.length, !!video, settings._donem || "");
  const PICK_SCHEMA = video ? VIDEO_PICK_SCHEMA : PICK_SCHEMA_FOTO;
  const label = (i) => {
    const [w, h] = sizes[i] || [];
    const boyut = w > 0 && h > 0 ? ` (${w}×${h} px)` : "";
    const sure = video?.durations?.[i] > 0 ? `, ${Math.round(video.durations[i])} sn` : "";
    const izgara = video?.grids?.[i] > 1 ? `, ${video.grids[i]} karelik ızgara` : ", tek kare";
    return `Aday ${i + 1}${boyut}${video ? ` [video${sure}${izgara}]` : ""}${titles[i] ? ` — arşiv başlığı: "${String(titles[i]).slice(0, 140)}"` : ""}:`;
  };
  // Seçici: Claude (Sonnet 5.5) varsayılan — Anthropic anahtarı yoksa ya da ayarda
  // docuPicker "openai" seçildiyse OpenAI (GPT-6).
  const claudeIle = settings.docuPicker ? settings.docuPicker === "claude" : !!settings.anthropicKey;
  if (claudeIle && settings.anthropicKey) {
    try {
      return await callVisionJSON({
        system: "Sen titiz bir belgesel görsel editörüsün. Yalnızca istenen JSON'u döndür.",
        user: prompt,
        schema: PICK_SCHEMA,
        images: thumbs.map((t, i) => ({ etiket: label(i), data: t.toString("base64"), mediaType: "image/jpeg" })),
        // Gerçek kişi/olay: Sonnet 5.5. Stok (genel atmosfer): çağıran Haiku koyar.
        model: settings.claudeVisionModel || "claude-sonnet-5-5",
        maxTokens: 2000,
        usage,
        logFn,
      });
    } catch (e) {
      // Kredi bittiyse: sessizce AI'a düşmek yerine durulur (resolveArchive yakalar).
      if (/credit balance is too low|insufficient credit|billing/i.test(String(e?.message || ""))) throw new Error("Claude görme: kota/kredi bitti (Anthropic)");
      throw e;
    }
  }
  if (settings.openaiKey) {
    const content = [{ type: "input_text", text: prompt }];
    thumbs.forEach((t, i) => {
      content.push({ type: "input_text", text: label(i) });
      // Video ızgarasında 9 küçük kare var: "low" (512 px) onları okunmaz yapar.
      content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${t.toString("base64")}`, detail: video ? "auto" : "low" });
    });
    const DENEME = 5;
    const geriCekil = (attempt) => 3000 * attempt + Math.random() * 1000;
    // Arşiv (kimlik önemli): gpt-6-sol. Stok için çağıran settings'e gpt-6-luna koyar.
    // (gpt-4.1-mini Apollo 13 testinde başlığında "Apollo 17" yazan fotoğrafı seçmişti:
    // gerçek kişi/olayda ucuz model kullanılmaz.)
    const model = settings.openaiVisionModel || "gpt-6-sol";
    // Düşünen modeller (gpt-5*, gpt-6*) çıktı bütçesini önce düşünmeye harcar: 300 token
    // boş yanıt döndürürdü. Kısa bir seçim için düşünme "low" yeter.
    let dusunen = /^(gpt-[56]|o\d)/.test(model);
    for (let attempt = 1; attempt <= DENEME; attempt++) {
      let r;
      try {
        r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${settings.openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            store: false,
            input: [{ role: "user", content }],
            text: { format: { type: "json_schema", name: "archive_pick", strict: true, schema: PICK_SCHEMA } },
            ...(dusunen ? { reasoning: { effort: "low" }, max_output_tokens: 3000 } : { max_output_tokens: 300 }),
          }),
          signal: AbortSignal.timeout(120000),
        });
      } catch (e) {
        // Ağ hatası (fetch failed, bağlantı sıfırlandı, zaman aşımı) geçicidir. Eskiden
        // yalnızca HTTP durumu yeniden deneniyordu; atılan hata döngüden doğrudan
        // kaçıyor ve sahne tek bir kopmada AI'a düşüyordu.
        if (attempt >= DENEME) throw e;
        await uyku(geriCekil(attempt));
        continue;
      }
      if (r.status === 429 || r.status >= 500) {
        const govde = await r.text().catch(() => "");
        // Kota/kredi bitti: beklemek düzeltmez, her sahnede 4 kez beklemek boşa zaman.
        if (/insufficient_quota|quota_exceeded|billing_hard_limit/i.test(govde)) throw new Error(`OpenAI görme: kota/kredi bitti (${r.status})`);
        const ra = Number(r.headers.get("retry-after"));
        await uyku(ra > 0 ? Math.min(ra * 1000, 60000) : geriCekil(attempt));
        continue;
      }
      const j = await r.json();
      // Model "reasoning" alanını tanımıyorsa (düşünmeyen model) bir kez onsuz dene.
      if (r.status === 400 && dusunen && /reasoning/i.test(JSON.stringify(j))) {
        dusunen = false;
        continue;
      }
      if (!r.ok) throw new Error(`OpenAI görme ${r.status}: ${JSON.stringify(j).slice(0, 200)}`);
      const text = j.output_text ?? j.output?.flatMap((o) => o.content || []).find((c) => c.type === "output_text")?.text;
      return JSON.parse(text);
    }
    throw new Error("OpenAI görme: yanıt alınamadı");
  }
  return callVisionJSON({
    system: "Sen titiz bir belgesel görsel editörüsün. Yalnızca istenen JSON'u döndür.",
    user: prompt,
    schema: PICK_SCHEMA,
    images: thumbs.map((t, i) => ({ etiket: label(i), data: t.toString("base64"), mediaType: "image/jpeg" })),
    usage,
    logFn,
  });
}

/**
 * Arşiv sunucuları (özellikle Wikimedia) seri isteklerde 429 döndürüyor: bekleyip yeniden dene.
 * Ağ kopmaları da geçicidir: undici "fetch failed", zaman aşımında "aborted", UND_ERR_*.
 */
async function fetchWithRetry(url, dest, opts) {
  for (let attempt = 1; ; attempt++) {
    try { return await downloadFile(url, dest, opts); } catch (e) {
      if (attempt >= 4 || !/429|5\d\d|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|aborted|UND_ERR/i.test(String(e.message))) throw e;
      await uyku(2500 * attempt + Math.random() * 1000);
    }
  }
}

/**
 * İkinci arama: ilk sorgu uygun aday vermezse özel isimlere indirgenmiş sade sorgu
 * ("Gene Kranz flight director Apollo 13" → "Gene Kranz Apollo"). Arşiv başlıkları
 * genelde yalnızca isimleri taşıyor; uzun sorgu alaka eşiğini gereksizce yükseltiyor.
 */
export function simplerQuery(q) {
  const words = String(q).split(/\s+/).filter((w) => w && !/^\d+$/.test(w));
  const cap = (w) => /^[A-ZÇĞİÖŞÜ]/.test(w);
  // Bir kişi adıyla başlıyorsa (iki büyük harfli kelime) ad + varsa bağlam özel adı; yoksa ilk üç anlamlı kelime.
  const out = cap(words[0]) && cap(words[1] || "") && !/^(Apollo|NASA|USS)$/.test(words[0])
    ? words.filter(cap).slice(0, 3).join(" ")
    : words.slice(0, 3).join(" ");
  return out && out !== q ? out : null;
}

/** Küçük resim (görme modeli için) ve algısal özet — tek ffmpeg çağrısı, iki çıktı. */
async function thumbOf(c, tmp, ffmpeg, sceneKey, download) {
  // Sahneye özel ad: iki işçi aynı adayı aynı anda indirip aynı dosyaya yazmasın.
  const id = `${sceneKey}-${hash(c.url)}`;
  const raw = path.join(tmp, `${id}.bin`);
  const jpg = path.join(tmp, `${id}.jpg`);
  const gri = path.join(tmp, `${id}.gray`);
  await download(c.thumb || c.url, raw, { timeoutMs: 25000, expect: "image" });
  await run(ffmpeg, [
    "-y", "-i", raw,
    "-frames:v", "1", "-vf", "scale=512:512:force_original_aspect_ratio=decrease", "-q:v", "5", jpg,
    "-frames:v", "1", "-vf", OZET_VF, "-f", "rawvideo", gri,
  ], { timeoutMs: 45000 });
  return { buf: fs.readFileSync(jpg), dhash: dHashFromGray(fs.readFileSync(gri)) };
}

// ---------- hareketli görüntü (media: "video") ----------

/** Seçim kuralları değişince eski "uygun klip yok" kararları yeniden denensin. */
const VIDEO_PICK_VERSION = 1;
/** Süresi bundan kısa klip ızgarasız (sağlayıcının önizleme karesiyle) gösterilir: tek çekimdir. */
const KISA_KLIP = 45;
/** Bundan kısa klip sahneyi taşımaz. */
const EN_KISA_KLIP = 3;
/** Kaydedilen parça: seçilen andan önce biraz pay, toplam en çok bu kadar saniye (disk). */
const KLIP_PENCERE = 40;
const KLIP_ONCE_PAY = 2;
/** İndirme tavanı; büyük dosyada yalnızca gereken parça ffmpeg ile uzaktan çekilir. */
const KLIP_EN_BUYUK = 200 * 1024 * 1024;
const KLIP_INDIRME_MS = 4 * 60 * 1000;
/** Bundan uzun kaynakta (saniye) dosya indirilmez, gereken bölüm uzaktan okunur. */
const UZUN_KAYNAK = 120;
const KLIP_UA = "NovaStudio/1.0 (kisisel video araci; iletisim: local)";
/**
 * Klip indirmelerinin kimliği. upload.wikimedia.org iletişim bilgisi (URL ya da e-posta)
 * taşımayan kimliğe medya dosyasında 429 veriyor (ölçüldü: aynı istek, kimlikte bir URL
 * olunca 206). Ayarlarda `httpUserAgent` verilirse o kullanılır.
 */
let klipUA = KLIP_UA;
/** CC BY "değişiklikleri belirt" şartı: video klibe ne yapılıyor. */
const DOCU_VIDEO_MODS = "Video düzeninde bir bölümü kullanıldı (kısaltıldı), ses kaldırıldı; kadraj ve yeniden boyutlandırma, renk tonlama (duotone), film greni ve üst yazı eklendi.";
/**
 * Kamu malı hareketli görüntü koleksiyonları (Archive.org). Genel Archive.org araması
 * lisanssız kullanıcı yüklemeleri döndürüyor (ölçüldü: "Wall Street 1929" → propaganda
 * kopyaları, TV kayıtları); bu koleksiyonlarda öğe lisansı kayıtlı (Universal Newsreel'de
 * 611 öğenin 595'i kamu malı işaretli).
 */
const IA_KOLEKSIYON = "(universal_newsreels OR prelinger OR nasa OR FedFlix)";

/** Tek bir ffmpeg'e aynı anda açılan uzak (HTTP) okuma sayısı sınırı — sunucular ve bellek için. */
function sinirlayici(n) {
  let aktif = 0;
  const kuyruk = [];
  const birak = () => { aktif--; kuyruk.shift()?.(); };
  return async (fn) => {
    if (aktif >= n) await new Promise((ok) => kuyruk.push(ok));
    aktif++;
    try { return await fn(); } finally { birak(); }
  };
}

const uzakMi = (u) => /^https?:\/\//i.test(String(u || ""));
const uzakArg = (u) => (uzakMi(u) ? ["-user_agent", klipUA, "-rw_timeout", "30000000"] : []);

/**
 * ffmpeg'in bir girdi hakkında söyledikleri (süre, görüntü boyutu). ffprobe paketle
 * gelmeyebiliyor; `ffmpeg -i` çıktı dosyası olmadan 1 ile çıkar, bu yüzden run() değil.
 */
export function ffBilgiCoz(metin) {
  const t = String(metin || "");
  const d = t.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const v = t.match(/Stream #[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b(?:\s*\[SAR (\d+):(\d+))?/);
  const dur = d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0;
  let w = v ? +v[1] : 0;
  const h = v ? +v[2] : 0;
  // Anamorfik SD (720x480, SAR 8:9 vb.): ekranda görünen genişlik.
  if (v?.[3] && v?.[4] && +v[3] > 0 && +v[4] > 0) w = Math.round((w * +v[3]) / +v[4]);
  return { dur: Number.isFinite(dur) ? dur : 0, w, h };
}
function ffBilgi(ffmpeg, girdi, timeoutMs = 30000) {
  return new Promise((ok) => {
    let err = "";
    let p;
    try { p = spawn(ffmpeg, ["-hide_banner", ...uzakArg(girdi), "-i", girdi], { windowsHide: true }); } catch { return ok({ dur: 0, w: 0, h: 0 }); }
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, timeoutMs);
    p.stderr.on("data", (d) => { if (err.length < 60000) err += d.toString(); });
    p.on("error", () => { clearTimeout(t); ok({ dur: 0, w: 0, h: 0 }); });
    p.on("close", () => { clearTimeout(t); ok(ffBilgiCoz(err)); });
  });
}

/** Archive.org öğe lisans URI'si → künyenin ve izin kontrolünün anladığı etiket. */
export function iaLisans(uri) {
  const u = String(uri || "");
  if (!u) return "";
  if (/publicdomain\/zero/i.test(u)) return "CC0";
  if (/publicdomain/i.test(u)) return "Public domain";
  const m = u.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/i);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : "";
}
/** "443.68" ya da "7:23" / "0:07:23" biçimindeki süre. */
function iaSure(x) {
  const s = String(x ?? "").trim();
  if (!s) return 0;
  if (s.includes(":")) return s.split(":").reduce((a, p) => a * 60 + (parseFloat(p) || 0), 0);
  return parseFloat(s) || 0;
}

/** Archive.org: yalnızca kamu malı koleksiyonlar, öğe lisansı kayıtlı olanlar. */
async function searchIaFootage(query) {
  const q = encodeURIComponent(`(${query}) AND mediatype:(movies) AND collection:${IA_KOLEKSIYON}`);
  const data = await fetchJson(
    `https://archive.org/advancedsearch.php?q=${q}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=licenseurl&rows=8&page=1&output=json`,
    { timeoutMs: 15000 },
  );
  const docs = (data?.response?.docs || []).filter((d) => iaLisans(d.licenseurl));
  const out = [];
  await Promise.all(docs.slice(0, 5).map(async (d, sira) => {
    let meta;
    try { meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`, { timeoutMs: 15000 }); } catch { return; }
    const m = meta?.metadata || {};
    const lisansUrl = String(Array.isArray(m.licenseurl) ? m.licenseurl[0] : m.licenseurl || d.licenseurl || "");
    const lisans = iaLisans(lisansUrl);
    if (!lisans) return;
    const dosyalar = (meta?.files || []).filter((f) => /\.(mp4|ogv|webm)$/i.test(f.name || "") && (parseInt(f.size) || 0) > 3e5);
    // Tercih: tam çözünürlüklü H.264 türevi (640x480) > 512kb (320x240) > Ogg. Büyük olan önce.
    const puan = (f) => (/\.mp4$/i.test(f.name) ? 2 : 0) + (/512kb/i.test(f.name) ? -1 : 0) + ((parseInt(f.width) || 0) >= 600 ? 2 : 0);
    dosyalar.sort((a, b) => puan(b) - puan(a) || (parseInt(b.size) || 0) - (parseInt(a.size) || 0));
    const f = dosyalar[0];
    if (!f) return;
    const sahip = String(Array.isArray(m.creator) ? m.creator.join(", ") : m.creator || "").slice(0, 200);
    out.push({
      provider: "archive", type: "video", sira,
      url: `https://archive.org/download/${encodeURIComponent(d.identifier)}/${encodeURIComponent(f.name)}`,
      thumb: `https://archive.org/services/img/${encodeURIComponent(d.identifier)}`,
      width: parseInt(f.width) || 640, height: parseInt(f.height) || 480,
      duration: iaSure(f.length) || undefined, bytes: parseInt(f.size) || undefined,
      lisans, lisansUrl, sahip, eser: String(m.title || d.title || "").slice(0, 140),
      sayfa: `https://archive.org/details/${d.identifier}`,
    });
  }));
  return out.sort((a, b) => a.sira - b.sira);
}

/** Commons videoları — süre ve dosya boyutuyla (media.js'in aramasında ikisi yok). */
async function searchCommonsFootage(query) {
  const data = await fetchJson(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(query + " filetype:video")}&gsrnamespace=6&gsrlimit=10` +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=640&format=json&origin=*`,
  );
  return Object.values(data?.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => (p.imageinfo?.[0] ? { ...p.imageinfo[0], _baslik: p.title } : null))
    .filter((ii) => ii && /video\/(webm|ogg|mp4)|application\/ogg/.test(ii.mime || "") && (ii.width || 0) >= 480)
    .map((ii, sira) => ({
      ...commonsMetadata(ii, ii._baslik || ""),
      provider: "wikimedia", type: "video", sira,
      url: ii.url, thumb: ii.thumburl || "",
      width: ii.width || 0, height: ii.height || 0,
      duration: ii.duration || undefined, bytes: ii.size || undefined,
    }));
}

/** Nova'nın aramasına ek kaynaklar (yalnızca gerçek çalıştırmada; testler deps ile verir). */
async function ekGoruntuKaynaklari(q, hataSay) {
  // Yalnızca GEÇİCİ hata (429/5xx/ağ) "karar verilemedi" sayılır; 4xx bir cevaptır.
  const say = (p) => p.catch((e) => { if (geciciSaglayiciHatasi(e)) hataSay.n++; return []; });
  const [ia, commons] = await Promise.all([say(searchIaFootage(q)), say(searchCommonsFootage(q))]);
  return [...ia, ...commons];
}

/**
 * Aday kümesini sırala: gerçek olay (archive) sahnesinde kurum arşivi önce, atmosfer
 * (stock) sahnesinde stok siteleri önce; kaynaklar dönüşümlü ki 4 aday tek siteden olmasın.
 */
export function klipSirala(liste, source, { eski = false, riskli = false } = {}) {
  const stok = new Set(["pexels", "pixabay", "mixkit"]);
  // 1990 öncesi hikâyede taşıt/uçak/şehir klibi: stok sahnesinde de arşiv (Archive.org, Commons, NASA) önce.
  const stokOnce = source === "stock" && !(eski && riskli);
  const once = (c) => (stokOnce ? stok.has(c.provider) : !stok.has(c.provider));
  const gruplar = new Map();
  for (const c of liste) {
    const g = `${once(c) ? 0 : 1}|${c.provider}`;
    if (!gruplar.has(g)) gruplar.set(g, []);
    gruplar.get(g).push(c);
  }
  const out = [];
  for (const katman of ["0", "1"]) {
    const gl = [...gruplar.entries()].filter(([g]) => g.startsWith(katman + "|")).map(([, l]) => l);
    for (let i = 0; gl.some((l) => i < l.length); i++) for (const l of gl) if (i < l.length) out.push(l[i]);
  }
  return out;
}

/** Aynı klibin başka dosya/çözünürlüğü (Pexels HD/SD, Archive.org mp4/ogv): sayfası aynıdır. */
const sayfaAnahtari = (c) => (c?.sayfa ? `sayfa:${photoKey(c.sayfa)}` : null);

// ---------- seçici hafızası (aynı karar iki kez ödenmez) ----------
//
// Ölçüldü (1929 belgeseli, 20260930-70cef2): 1.044 Sonnet isteğinin ~%75'i AYNI "uygun yok"
// kararlarının yeniden ödenmesiydi. "Uygun yok" yalnızca hiçbir arşiv sağlayıcısı geçici hata
// vermediyse önbelleğe yazılıyordu; 5 işçiyle Wikimedia/Archive.org 429'u neredeyse her sahnede
// olduğundan kayıt düşmüyor, her arşiv geçişinde (dönem denetimi, QA düzeltmesi, devam) aynı
// adaylar görme modeline yeniden gösteriliyordu — bir sahne 10 kez.
// Hafıza (docu-archive.json, "m-<anahtar>" / "m-v-<anahtar>"):
//   bad:  bu sahne için "uygun değil" denmiş adaylar (photoKey → zaman). Aynı aday bu sahneye
//         bir daha gösterilmez; pencerede yeni aday kalmazsa model hiç çağrılmaz.
//   sets: aynı aday kümesine verilmiş karar (seçilen aday, segment) — klip indirilemezse ya da
//         iş yarıda kalırsa yeniden sorulmaz.
// Seçim kuralları (PICK_VERSION) ya da hikâyenin dönemi değişince hafıza geçersiz olur.
export const KARAR_SURESI_MS = 14 * 24 * 3600e3;
const KUME_TAVANI = 8;
/** Sahne anahtarının (key ya da "v-"+key) seçici hafızası anahtarı. */
export const pickMemoKey = (cacheKey) => `m-${cacheKey}`;
const adayAnahtarlari = (a) => [photoKey(a.url), sayfaAnahtari(a)].filter(Boolean);
/**
 * Önbellekteki bir seçimi geçersiz sayar (QA/dönem denetimi reddi): kayıt silinir, seçilen
 * kaynak (adres + sayfa) o sahnenin "uygun değil" listesine girer, kayıtlı küme kararları düşer.
 * Yeniden seçim böylece aynı kaynağı ikinci kez seçip AI'a düşmez, sıradaki adaya bakar.
 * @returns kayıt silindiyse true
 */
export function forgetCachedPick(cache, cacheKey, now = Date.now()) {
  const h = cache?.[cacheKey];
  const mk = pickMemoKey(cacheKey);
  const m = cache[mk] && typeof cache[mk] === "object" ? cache[mk] : { v: cacheKey.startsWith("v-") ? VIDEO_PICK_VERSION : PICK_VERSION, d: null, bad: {}, sets: {} };
  m.bad ||= {};
  m.sets = {};
  // Klipte sayfa da: aynı klibin başka dosyası (HD/SD) aynı sayfadadır. Fotoğrafta sayfa
  // paylaşılabilir (müze nesnesinin başka görünüşleri), yalnızca dosya adresi.
  if (h?.url) for (const k of cacheKey.startsWith("v-") ? adayAnahtarlari(h) : [photoKey(h.url)]) m.bad[k] = now;
  cache[mk] = m;
  if (!(cacheKey in cache)) return false;
  delete cache[cacheKey];
  return true;
}

/** Izgarada karelerin kaynaktaki anları: başlangıç ve bitiş jeneriklerinden uzak, eşit aralıklı. */
export function izgaraAnlari(dur, n) {
  return Array.from({ length: n }, (_, k) => +(dur * (0.08 + (0.84 * (k + 0.5)) / n)).toFixed(2));
}
/**
 * Seçilen anın çevresinde kaydedilecek parça. Döner: kaynakta nereden başlanacağı (ss),
 * kaç saniye (t) ve sahnenin dosya İÇİNDE nereden başlayacağı (videoStart).
 */
export function klipPenceresi(an, dur) {
  const a = Math.max(0, Number(an) || 0);
  const ss = Math.max(0, a - KLIP_ONCE_PAY);
  const t = dur > 0 ? Math.max(0.5, Math.min(KLIP_PENCERE, dur - ss)) : KLIP_PENCERE;
  return { ss: +ss.toFixed(2), t: +t.toFixed(2), videoStart: +(a - ss).toFixed(2) };
}
/** Izgarasız klipte başlangıç: kısa klip baştan; uzun klipte (haber filmi) açılış jeneriği atlanır. */
export function varsayilanAn(dur) {
  return dur > KISA_KLIP ? +Math.min(dur * 0.12, 30).toFixed(2) : 0;
}

/**
 * Ogg/WebM'de girdi tarafı atlama ara kareye düşebiliyor: çözücü anahtar kareye kadar
 * yeşil/bloklu çöp üretiyor (ölçüldü: Commons'taki Apollo 11 .ogv, 30. saniyeden kesilen
 * klibin ilk karesi tamamen bozuk). Bu kaplarda biraz önceden girilir, fazlası çıktı
 * tarafında (çözülüp) atılır — arada bir anahtar kare olur. MP4 zaten doğru atlar.
 */
const KESIN_ATLAMAZ = /\.(ogv|ogg|oga|webm|mkv)$/i;
const ONDEN_GIR = 8;
export function atlamaArg(url, t) {
  const a = Math.max(0, Number(t) || 0);
  if (!(a > 0)) return { girdi: [], cikti: [] };
  const yol = String(url || "").split(/[?#]/)[0];
  if (!KESIN_ATLAMAZ.test(yol)) return { girdi: ["-ss", String(+a.toFixed(3))], cikti: [] };
  const pay = Math.min(a, ONDEN_GIR);
  return { girdi: a - pay > 0 ? ["-ss", String(+(a - pay).toFixed(3))] : [], cikti: ["-ss", String(+pay.toFixed(3))] };
}

const KARE_VF = (w, h) => `scale='if(gt(sar,0),trunc(iw*sar/2)*2,iw)':ih,setsar=1,scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

/** Klibin t anındaki kare (uzaktan: ffmpeg yalnızca gereken baytları okur). */
async function kareAl(ffmpeg, girdi, t, out, w, h, url = girdi) {
  const at = atlamaArg(url, t);
  await run(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", ...at.girdi, ...uzakArg(girdi), "-i", girdi,
    ...at.cikti, "-frames:v", "1", "-vf", KARE_VF(w, h), "-q:v", "3", out,
  ], { timeoutMs: 60000 });
  if (!fs.existsSync(out) || fs.statSync(out).size < 500) throw new Error("kare alınamadı");
}

/**
 * Görme modeline gösterilecek önizleme. Kısa klip: sağlayıcının önizleme karesi (yoksa
 * klibin ortasından bir kare). Uzun klip: boyunca 4 (≤150 sn) ya da 9 karelik ızgara.
 * @returns {{buf, dhash, times:number[]|null, dur:number, grid:number}}
 */
async function klipOnizleme(c, { tmp, ffmpeg, key, download, girdi, uzak }) {
  const id = `${key}-v${hash(c.url)}`;
  let dur = c.duration > 0 ? c.duration : 0;
  const uzun = !(dur > 0 && dur <= KISA_KLIP);
  if (uzun) {
    try {
      if (!dur) dur = (await uzak(() => ffBilgi(ffmpeg, girdi(c.url)))).dur;
      if (dur > KISA_KLIP) {
        const n = dur > 150 ? 9 : 4;
        const kol = n === 9 ? 3 : 2;
        const [w, h] = n === 9 ? [320, 180] : [480, 270];
        const times = izgaraAnlari(dur, n);
        const kareler = await Promise.all(times.map(async (t, k) => {
          const f = path.join(tmp, `${id}-k${k}.jpg`);
          try { await uzak(() => kareAl(ffmpeg, girdi(c.url), t, f, w, h, c.url)); return f; } catch { return null; }
        }));
        const iyi = kareler.filter(Boolean).length;
        if (iyi >= Math.ceil(n / 2)) {
          // Alınamayan kare siyah kalır; numaralar anlarla eşleşik kalsın diye yer tutulur.
          const siyah = path.join(tmp, `${id}-siyah.jpg`);
          if (iyi < n) await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=black:s=${w}x${h}`, "-frames:v", "1", siyah], { timeoutMs: 20000 });
          const girdiler = kareler.flatMap((f) => ["-i", f || siyah]);
          const yer = Array.from({ length: n }, (_, k) => `${(k % kol) * w}_${Math.floor(k / kol) * h}`).join("|");
          const jpg = path.join(tmp, `${id}-izgara.jpg`);
          const gri = path.join(tmp, `${id}-izgara.gray`);
          await run(ffmpeg, [
            "-y", "-hide_banner", "-loglevel", "error", ...girdiler,
            "-filter_complex", `${kareler.map((_, k) => `[${k}:v]`).join("")}xstack=inputs=${n}:layout=${yer}[o]`,
            "-map", "[o]", "-frames:v", "1", "-q:v", "4", jpg,
          ], { timeoutMs: 45000 });
          await run(ffmpeg, ["-y", "-i", jpg, "-frames:v", "1", "-vf", OZET_VF, "-f", "rawvideo", gri], { timeoutMs: 30000 });
          return { buf: fs.readFileSync(jpg), dhash: dHashFromGray(fs.readFileSync(gri)), times, dur, grid: n };
        }
      }
    } catch { /* ızgara olmadı: tek kareye düş */ }
  }
  if (c.thumb) {
    try { return { ...(await thumbOf(c, tmp, ffmpeg, key, download)), times: null, dur, grid: 1 }; } catch { /* aşağıda klipten kare */ }
  }
  const f = path.join(tmp, `${id}-tek.jpg`);
  await uzak(() => kareAl(ffmpeg, girdi(c.url), dur > 2 ? +(dur / 2).toFixed(2) : 0.5, f, 512, 288, c.url));
  return { buf: fs.readFileSync(f), dhash: await dosyaOzeti(ffmpeg, f, `${f}.gray`), times: null, dur, grid: 1 };
}

/**
 * Varsayılan video indirici: akışla diske, boyut ve süre tavanlı; geçici ağ hatasında
 * yeniden dener. Tavan aşılırsa `buyuk` işaretli hata atar (çağıran uzaktan parça çeker).
 */
async function videoIndir(url, dest, { timeoutMs = KLIP_INDIRME_MS, maxBytes = KLIP_EN_BUYUK } = {}) {
  for (let attempt = 1; ; attempt++) {
    const ctrl = new AbortController();
    let sureDoldu = false;
    const timer = setTimeout(() => { sureDoldu = true; ctrl.abort(); }, timeoutMs);
    let out = null;
    try {
      const res = await fetch(url, { headers: { "User-Agent": klipUA }, signal: ctrl.signal, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const len = Number(res.headers.get("content-length")) || 0;
      if (len > maxBytes) { ctrl.abort(); throw Object.assign(new Error("video dosyası çok büyük"), { buyuk: true }); }
      out = fs.createWriteStream(dest);
      let n = 0;
      for await (const parca of res.body) {
        n += parca.length;
        if (n > maxBytes) { ctrl.abort(); throw Object.assign(new Error("video dosyası çok büyük"), { buyuk: true }); }
        if (!out.write(parca)) await once(out, "drain");
      }
      out.end();
      await once(out, "close");
      out = null;
      if (n < 10000) throw new Error("video dosyası çok küçük/bozuk");
      return n;
    } catch (e) {
      if (out) { out.destroy(); out = null; }
      try { fs.rmSync(dest, { force: true }); } catch {}
      if (sureDoldu) throw Object.assign(new Error("video indirme süresi doldu"), { buyuk: true });
      if (e.buyuk || attempt >= 3 || !/429|5\d\d|ETIMEDOUT|ECONNRESET|EAI_AGAIN|fetch failed|aborted|terminated|UND_ERR/i.test(String(e.message))) throw e;
      await uyku(2500 * attempt + Math.random() * 1000);
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Sahne klibi: H.264 yuv420p, 30 fps, en çok 1920x1080, ses yok, hızlı başlangıç. */
const KLIP_VF = [
  "bwdif=deint=interlaced",
  "scale='if(gt(sar,0),trunc(iw*sar/2)*2,iw)':ih", "setsar=1",
  "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
  "fps=30", "format=yuv420p",
].join(",");

const alan = (a) => (a.width || 0) * (a.height || 0);
/** Bildirilen boyutu tam ekran metin sahnesi için fazla küçük mü? (Boyut bilinmiyorsa hayır.) */
const tamEkranaKucuk = (a) => a.kucuk === true || (a.width > 0 && a.height > 0 && Math.min(a.width, a.height) < TAM_EKRAN_EN_AZ);

/*
 * ATMOSFER KLİBİ (uzun video). Kullanıcı: "videolara hareketli bir şeyler koymak lazım ... uzun
 * videolarda stok videolardan koyarsın". Senaryonun AI'a bıraktığı atmosfer sahneleri (deniz, sis,
 * gökyüzü, orman, ateş, mum...) önce gerçek stok/arşiv KLİBİ arar (Pexels, Pixabay, Archive.org,
 * Commons; seçici yine görüntüye bakıp dönemi yargılar). Klip yoksa sahne AI resmi olarak kalır —
 * stok FOTOĞRAFINA düşmez (modern bir fotoğraf AI resminden kötüdür).
 * 1950 öncesi hikâyede yalnızca insansız doğa: modern sokak, kıyafet ve araç dönem hatasıdır.
 */
const DOGA = ["sea", "ocean", "waves", "wave", "surf", "storm", "fog", "mist", "rain", "snow", "sky", "clouds", "cloud", "sunset", "sunrise", "dusk", "dawn", "stars", "forest", "jungle", "trees", "desert", "dunes", "river", "lake", "mountains", "mountain", "fire", "flames", "smoke", "embers", "candle", "candlelight", "lantern", "wind", "grass", "field", "horizon", "ice", "glacier", "waterfall", "lightning", "moon", "night"];
const MODERN = ["city", "street", "traffic", "airport", "runway", "aircraft", "airplane", "plane", "highway", "skyline", "office", "crowd", "harbour", "harbor", "port"];
/** Time-of-day words colour a query but are never the subject ("a city street at night" is not night footage). */
const ZAMAN = new Set(["night", "dusk", "dawn", "sunset", "sunrise", "moon"]);
const INSAN = /\b(man|men|woman|women|people|person|crowd|soldiers?|sailors?|figures?|keepers?|pilots?|child(ren)?|boy|girl|face|portrait|hands?|crew|officers?|explorers?|riders?|silhouette)\b/i;
const ATMOS_TIPLER = new Set(["photo", "words"]);

/** Senaryonun atmosfer sahnelerini klip denemesine çevirir (yerinde); kaç sahne çevrildiğini döndürür. */
export function atmosphereFootage(script, { max = 30, year = null } = {}) {
  const y = Number.isFinite(+year) && year ? +year : script?.era ? donemYili(String(script.era)) : null;
  const eski = !y || y < 1950;
  const sozluk = eski ? DOGA : [...DOGA, ...MODERN];
  let n = 0;
  for (const s of script?.scenes || []) {
    if (n >= max) break;
    if (!ATMOS_TIPLER.has(s.type) || s.media === "video" || s.video || s.image || !s.imagePrompt) continue;
    if (s.cast?.length || s.name || s.annotate || s.imagePrompts?.length || s.images?.length || s.bg || s.layers || s.depth) continue;
    const p = String(s.imagePrompt).toLowerCase();
    if (eski && INSAN.test(p)) continue;
    // The SUBJECT must be the nature (the first words after the shot type): "a cockpit panel ... over the ocean" is not sea footage.
    const ozne = p.replace(/^(extreme |medium |wide |tight |high angle |low angle |aerial |overhead |slow )*(close-up|shot|view|angle|over|of|on|an?|the|empty|place:|\s)*/g, "").split(/[,.;:]/)[0].split(/\s+/).slice(0, 7);
    if (eski && ozne.some((w) => MODERN.includes(w))) continue;
    const kelimeler = [...new Set(ozne)].filter((w) => sozluk.includes(w));
    if (!kelimeler.some((w) => !ZAMAN.has(w))) continue;
    // An archive/stock scene keeps its normal photo fallback: it only tries footage first.
    if (s.source === "archive" || s.source === "stock") {
      s.media = "video";
      n++;
      continue;
    }
    if (s.source && s.source !== "ai") continue;
    s._atmos = { source: s.source || "ai", search: s.search || "" };
    s.source = "stock";
    s.media = "video";
    s.videoOnly = true;
    s.search = kelimeler.slice(0, 4).join(" ");
    n++;
  }
  return n;
}

/*
 * AÇILIŞ HAREKETİ (uzun video). Kullanıcı: "uzun videoda açılışta olabilir, tüm açılışlarda değil
 * ama uyumluysa ... hem stok hem çok gerekirse buradan üretilebilir". Önce gerçek klip (arşiv/stok);
 * açılışın ilk sahnelerinden gerçek klibi OLMAYAN, hareket eden bir şeyi (deniz, ateş, kalabalık,
 * buhar...) gösteren AI resmi en çok iki tane motor tarafından resimden videoya çevrilir
 * (produce.mjs openingMotion). Kişi, belge, yazı kartı asla.
 */
const HAREKET = /\b(sea|ocean|waves?|surf|storm|fire|flames?|smoke|fog|mist|rain|snow|blizzard|crowds?|march(?:ing)?|charg(?:e|ing)|battle|train|locomotive|steam|ships?|sails?|river|waterfall|clouds?|horses?|cavalry|banners?|flags?|candles?|lanterns?|explosions?|dust|wind|torrent)\b/i;
export function openingMotionTargets(script, { max = 2, within = 6 } = {}) {
  let n = 0;
  const scenes = script?.scenes || [];
  for (let i = 0; i < Math.min(within, scenes.length) && n < max; i++) {
    const s = scenes[i];
    if ((s.chapter ?? 0) !== 0) break;
    if (!["photo", "words"].includes(s.type) || s.video || s.archived || !s.imagePrompt) continue;
    if (s.cast?.length || s.name || s.bg || s.images?.length || s.imagePrompts?.length || s.annotate) continue;
    if (!HAREKET.test(s.imagePrompt)) continue;
    s.aiMotion = true;
    n++;
  }
  return n;
}

/**
 * @param deps yalnızca testler için: {search, pick, download, downloadVideo, footageSearch,
 *        input} — ağ ve ücretli görme çağrısı yerine sahte uygulamalar. footageSearch(q)
 *        ek görüntü kaynakları (varsayılan: Archive.org kamu malı koleksiyonları + Commons;
 *        deps.search verilmişse hiç); input(url) ffmpeg'in okuyacağı yer (varsayılan: url).
 * @param onProgress (bitti, toplam) — her sahne sonrası; uzun videoda arşiv adımı
 *        dakikalar sürüyor, ilerleme görünmeli.
 * @returns {{script, credits}} script: sahnelere `image` (+ imgW/imgH) yerleştirilmiş kopya;
 *          credits: künye kayıtları (beatId -> {provider, lisans, sahip, eser, sayfa, file})
 * @param rejected dönem denetiminin (docu-era-audit.js) reddettiği kaynak/sayfa adresleri: aday
 *        listelerinden ve önbellekteki kayıtlı seçimlerden düşülür (bütün sahnelerde).
 * @param aiOnly dönem denetiminin iki kez reddettiği sahne/kareler (sahne indeksi ya da "i-mk"):
 *        hiç aranmaz (seçici ücreti yok), AI görseline kalır (docu-era-audit.js ERA_AI_AFTER).
 */
export async function resolveArchive(docu, { dir, publicDir, buildPrefix, settings, usage, logFn = () => {}, isCancelled = () => false, onProgress = () => {}, deps = {}, rejected = null, aiOnly = null }) {
  const reddedilen = new Set([...(rejected || [])].filter(Boolean).map((u) => photoKey(u)));
  const yalnizAi = new Set([...(aiOnly || [])].map(String));
  const reddedildi = (u) => reddedilen.size > 0 && !!u && reddedilen.has(photoKey(u));
  const search = deps.search || searchQuery;
  const pick = deps.pick || visionPick;
  const download = deps.download || fetchWithRetry;
  const downloadVideo = deps.downloadVideo || deps.download || videoIndir;
  const footageSearch = deps.footageSearch || (deps.search ? null : ekGoruntuKaynaklari);
  const girdi = deps.input || ((u) => u);
  klipUA = String(settings?.httpUserAgent || "").trim() || KLIP_UA;
  const cacheFile = path.join(dir, "docu-archive.json");
  const cache = readJson(cacheFile, {}) || {};
  const script = structuredClone(docu);
  const donem = hikayeDonemi(script);
  const hikayeYili = donemYili(donem);
  // 1990 öncesi hikâye: taşıt/uçak/şehir aramasında arşiv adayları önce, stok seçiminde de ucuz model yok.
  const eski = (donemYili(donem) ?? 9999) < ESKI_DONEM_SINIRI;
  // Bir geri sayımın maddeleri farklı dönemlerden: her maddenin sahneleri kendi dönemini taşır (scene.era, docu.js).
  const donemOf = (sc) => (sc?.era ? String(sc.era) : donem);
  const yilOf = (sc) => (sc?.era ? donemYili(String(sc.era)) : hikayeYili);
  const eskiOf = (sc) => (yilOf(sc) ?? 9999) < ESKI_DONEM_SINIRI;
  const credits = {};
  // Seçici hafızası (yukarıda açıklama): sahne + tür başına reddedilen adaylar ve küme kararları.
  const simdi = Date.now();
  const hafizalar = new Map();
  const hafiza = (cacheKey, surum) => {
    const mk = pickMemoKey(cacheKey);
    if (hafizalar.has(mk)) return hafizalar.get(mk);
    let m = cache[mk];
    if (!m || typeof m !== "object" || m.v !== surum || (m.d != null && m.d !== donem)) m = { v: surum, d: donem, bad: {}, sets: {} };
    m.d = donem;
    m.bad = Object.fromEntries(Object.entries(m.bad || {}).filter(([, t]) => simdi - t < KARAR_SURESI_MS));
    m.sets = Object.fromEntries(Object.entries(m.sets || {}).filter(([, s]) => simdi - (s?.at || 0) < KARAR_SURESI_MS));
    hafizalar.set(mk, m);
    return m;
  };
  const hafizaYaz = (cacheKey, m) => {
    const ks = Object.keys(m.sets);
    if (ks.length > KUME_TAVANI) for (const k of ks.sort((a, b) => m.sets[a].at - m.sets[b].at).slice(0, ks.length - KUME_TAVANI)) delete m.sets[k];
    cache[pickMemoKey(cacheKey)] = m;
    writeJson(cacheFile, cache);
  };
  const reddedilmisAday = (m, a) => adayAnahtarlari(a).some((k) => m.bad[k]);
  const kumeAnahtari = (liste, video) => hash(`${video ? "v" : "p"}|${liste.map((a) => photoKey(a.url)).join("\n")}`);
  let kayittanKarar = 0;
  /**
   * Görme kararı, hafızalı: aynı aday kümesine daha önce verilmiş karar yeniden ödenmez.
   * "Uygun değil" kararında gösterilen adayların hepsi sahnenin ret listesine girer.
   */
  const hafizaliSecim = async (cacheKey, surum, liste, video, sor) => {
    const m = hafiza(cacheKey, surum);
    const kume = kumeAnahtari(liste, video);
    const k = m.sets[kume];
    if (k) {
      const sira = k.c ? liste.findIndex((a) => photoKey(a.url) === k.c) + 1 : 0;
      if (!k.c || sira > 0) {
        kayittanKarar++;
        return { choice: sira, reason: k.r || "", namedPersonIsMainSubject: k.nm !== false, segment: k.seg || 1, kayittan: true };
      }
    }
    const karar = await sor();
    const secim = Math.trunc(Number(karar?.choice) || 0);
    const c = liste[secim - 1];
    if (c) m.sets[kume] = { c: photoKey(c.url), r: String(karar.reason || "").slice(0, 300), nm: karar.namedPersonIsMainSubject !== false, seg: Math.max(1, Math.trunc(Number(karar.segment) || 1)), at: Date.now() };
    else for (const a of liste) m.bad[photoKey(a.url)] = Date.now();
    hafizaYaz(cacheKey, m);
    return karar;
  };
  // Aynı arama + aynı anlatım iki sahnede geçerse ikisi aynı önbellek yuvasını
  // paylaşıp aynı fotoğrafı alıyordu: sonraki geçişler sıra ekiyle ayrı yuva alır
  // (ilk geçişin anahtarı değişmez, eski önbellekler geçerli kalır).
  const gecis = new Map();
  // Montaj kareleri de gerçek fotoğraf olabilir: her kare kendi sahnesi gibi aranır,
  // bulunan dosya karenin `image` alanına yazılır (motor o kareyi AI ile üretmez).
  // Montaj dışındaki sahnelerin ek kareleri (kolaj) yalnızca hareketli görüntü isterse
  // (media:"video") aranır; fotoğraf kareleri eskisi gibi AI ile üretilir.
  const montajKareleri = script.scenes.flatMap((s, i) => (s.imagePrompts || []).map((p, k) =>
    p && typeof p === "object" && (p.source === "archive" || p.source === "stock") && p.search && (s.type === "montage" || p.media === "video")
      ? { s: { type: "photo", source: p.source, search: p.search, say: s.say, mood: s.mood, imagePrompt: p.prompt, ...(p.media ? { media: p.media } : {}), _kare: p }, i: `${i}-m${k}` }
      : null).filter(Boolean));
  const targets = [...script.scenes.map((s, i) => ({ s, i })), ...montajKareleri]
    .filter(({ s }) => (s.source === "archive" || s.source === "stock") && s.search && ARCHIVE_TYPES.has(s.type))
    .map((t) => {
      const temel = hash(`${t.s.search}|${stripTags(t.s.say)}`);
      const n = gecis.get(temel) || 0;
      gecis.set(temel, n + 1);
      const key = n ? hash(`${temel}#${n}`) : temel;
      // Hareketli görüntü kararı ayrı yuvada: aynı sahnenin eski fotoğraf kararı
      // (senaryo sonradan media:"video" aldıysa) klip aramasını engellemesin.
      return { ...t, key, klip: t.s.media === "video", vkey: `v-${key}` };
    });
  if (!targets.length) return { script, credits };
  const klipSayisi = targets.filter((t) => t.klip).length;
  logFn(`Arşiv taranıyor: ${targets.length} sahne gerçek görüntü istiyor${klipSayisi ? ` (${klipSayisi} tanesi önce hareketli görüntü)` : ""}`);
  fs.mkdirSync(path.join(publicDir, buildPrefix), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-docu-arsiv-"));
  const ffmpeg = settings.ffmpegPath || "ffmpeg";

  // Bu videoda kullanılan/ayrılan fotoğraflar: photoKey -> dHash (bilinmiyorsa null).
  const ayrilan = new Map();
  const ozetKullanildi = (dh) => { if (!dh) return false; for (const h of ayrilan.values()) if (ayniFotograf(h, dh)) return true; return false; };
  const kullanildi = (pk, dh) => ayrilan.has(pk) || ozetKullanildi(dh);
  const ayir = (pk, dh) => ayrilan.set(pk, dh || null);
  const birak = (pk) => ayrilan.delete(pk);

  const indir = async (url, key) => {
    const raw = path.join(tmp, `full-${key}.bin`);
    await download(url, raw, { timeoutMs: 60000, expect: "image" });
    const rel = `${buildPrefix}/arch-${key}.jpg`;
    const hedef = path.join(publicDir, rel);
    await run(ffmpeg, ["-y", "-i", raw, "-frames:v", "1", "-vf", OLCEK, "-q:v", "2", hedef], { timeoutMs: 60000 });
    // Piksel boyutu KAYDEDİLEN dosyadan: render bunu görecek (EXIF döndürmesi ve tavan uygulanmış hali).
    const b = imageSize(fs.readFileSync(hedef));
    return { file: rel, ...(b ? { imgW: b.w, imgH: b.h } : {}) };
  };

  // Aynı sorgu (farklı sahnelerde) tek kez aranır: uzun videoda paralel yazılan
  // bölümler aynı kişi/yer için aynı `search`'ü tekrar tekrar yazıyor.
  const aramalar = new Map();
  const ara = (q) => {
    const k = q.trim().toLowerCase().replace(/\s+/g, " ");
    if (!aramalar.has(k)) {
      const p = (async () => { const hs = { n: 0 }; const list = await search(q, "image", "photo", true, false, hs); return { list, n: hs.n }; })();
      aramalar.set(k, p);
      // Kaynak hatası olan sonuç saklanmaz: sonraki sahne aynı sorguyu yeniden sorar.
      p.then((r) => { if (r.n > 0) aramalar.delete(k); }, () => aramalar.delete(k));
    }
    return aramalar.get(k);
  };

  // Görüntü araması: Nova'nın araması (video istenerek) + ek kaynaklar; yalnızca video adaylar.
  const klipAramalari = new Map();
  const araKlip = (q, source, sc = null) => {
    const k = `${source}|${sc?.era ? `${sc.era}|` : ""}${q.trim().toLowerCase().replace(/\s+/g, " ")}`;
    if (!klipAramalari.has(k)) {
      const p = (async () => {
        const hs = { n: 0 };
        const [ana, ek] = await Promise.all([
          // Tür: gerçek olayda kurum arşivi, atmosferde stok sitesi puanlanır (media.js score).
          Promise.resolve(search(q, "video", source === "stock" ? "generic" : "event", false, true, hs)).catch(() => { hs.n++; return []; }),
          footageSearch ? Promise.resolve(footageSearch(q, hs)).catch(() => { hs.n++; return []; }) : [],
        ]);
        const list = klipSirala(sanayiOncesiAdaylar([...(ek || []), ...(ana || [])].filter((c) => c?.type === "video"), { search: q }, yilOf(sc)), source, { eski: eskiOf(sc), riskli: modernRiskli(q) });
        return { list, n: hs.n };
      })();
      klipAramalari.set(k, p);
      p.then((r) => { if (r.n > 0) klipAramalari.delete(k); }, () => klipAramalari.delete(k));
    }
    return klipAramalari.get(k);
  };
  // Aynı anda açık uzak ffmpeg okuması (ızgara kareleri) sınırı. upload.wikimedia.org
  // eşzamanlı aralık isteklerine 429 veriyor (ölçüldü): ona ayrı, dar bir sınır.
  const uzakGenel = sinirlayici(8);
  const uzakWiki = sinirlayici(2);
  const uzakFor = (u) => (/wikimedia\.org/i.test(String(u)) ? uzakWiki : uzakGenel);

  /**
   * Seçilen klibin `an` (kaynaktaki saniye) çevresini indirip sahne klibine çevirir,
   * durağan karesini çıkarır. Dosyalar kalıcı adlarına ancak tamamlanınca taşınır.
   */
  const klipIndir = async (url, an, kaynakSure, key) => {
    const { ss, t, videoStart: vs } = klipPenceresi(an, kaynakSure);
    const rel = `${buildPrefix}/clip-${key}.mp4`;
    const still = `${buildPrefix}/clip-${key}.jpg`;
    const hedef = path.join(publicDir, rel);
    const gecici = path.join(publicDir, `${rel}.tmp.mp4`);
    // Atlama biçimi kaynağın ADRESİNE göre (indirilen kopya .bin adıyla durur).
    const at = atlamaArg(url, ss);
    const kodla = (kaynak) => run(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error",
      ...at.girdi, ...uzakArg(kaynak), "-i", kaynak, ...at.cikti, "-t", String(t),
      "-map", "0:v:0", "-an", "-sn", "-dn", "-vf", KLIP_VF,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", "-threads", "2", gecici,
    ], { timeoutMs: 5 * 60 * 1000 });
    const raw = path.join(tmp, `klip-${key}.bin`);
    const indirVeKodla = async () => {
      await downloadVideo(url, raw, { timeoutMs: KLIP_INDIRME_MS, maxBytes: KLIP_EN_BUYUK, expect: "video" });
      try { await kodla(raw); } finally { try { fs.rmSync(raw, { force: true }); } catch {} }
    };
    // Hız sınırı (429) ve sunucu hatası geçicidir: bekleyip iki kez daha dene.
    const uzaktanKodla = async () => {
      for (let deneme = 1; ; deneme++) {
        try { return await uzakFor(url)(() => kodla(girdi(url))); } catch (e) {
          if (isCancelled() || deneme >= 3 || !/\b(429|5\d\d)\b|Too Many Requests|Server returned 5|4XX Client Error/i.test(String(e?.message))) throw e;
          await uyku(6000 * deneme + Math.random() * 2000);
        }
      }
    };
    // Ogg/WebM uzaktan atlamada kırılgan (ölçüldü: Commons .ogv'de aralık okuması "Stream ends
    // prematurely" ile kesildi): tavan içindeyse önce indirilir.
    if (kaynakSure > UZUN_KAYNAK && !KESIN_ATLAMAZ.test(String(url).split(/[?#]/)[0])) {
      // Uzun MP4 kaynak (7-45 dakikalık haber filmi): 40 saniye için bütün dosyayı
      // indirmek israf — ffmpeg yalnızca o bölümün baytlarını okur.
      // (Ölçüldü: 443 sn'lik 42 MB Universal Newsreel, tam indirme 36 sn sürdü.)
      try { await uzaktanKodla(); } catch (e) {
        if (isCancelled()) throw e;
        await indirVeKodla();
      }
    } else {
      try { await indirVeKodla(); } catch (e) {
        // Çok büyük ya da yavaş dosya: yalnızca gereken parça uzaktan çekilir.
        if (!e?.buyuk && !/büyük|too large|süresi doldu/i.test(String(e?.message))) throw e;
        await uzaktanKodla();
      }
    }
    const b = await ffBilgi(ffmpeg, gecici);
    if (!(b.dur >= 1.5) || !(b.w > 0 && b.h > 0)) { try { fs.rmSync(gecici, { force: true }); } catch {} throw new Error("klip kodlanamadı (süre/boyut okunamadı)"); }
    if (b.w < b.h) { try { fs.rmSync(gecici, { force: true }); } catch {} throw Object.assign(new Error("klip dikey"), { dikey: true }); }
    fs.renameSync(gecici, hedef);
    const videoStart = +Math.min(vs, Math.max(0, b.dur - 1)).toFixed(2);
    await run(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error", "-ss", String(Math.min(videoStart + 0.4, Math.max(0, b.dur - 0.1)).toFixed(2)), "-i", hedef,
      "-frames:v", "1", "-q:v", "2", path.join(publicDir, still),
    ], { timeoutMs: 60000 });
    const d = imageSize(fs.readFileSync(path.join(publicDir, still)));
    return {
      video: rel, videoStart, videoDur: +b.dur.toFixed(2), videoW: b.w, videoH: b.h,
      file: still, ...(d ? { imgW: d.w, imgH: d.h } : {}),
      kaynakAn: +(Number(an) || 0).toFixed(2), kaynakSure: kaynakSure > 0 ? +kaynakSure.toFixed(2) : 0,
    };
  };
  const klipDosyalariVar = (h) => !!(h?.video && h.file && fs.existsSync(path.join(publicDir, h.video)) && fs.existsSync(path.join(publicDir, h.file)));

  /**
   * Bir sahne için klip ara, seç, indir. Döner: {hit, failed, raced}. hit null = uygun klip yok.
   * Ayrılan klip (photoKey + sayfa anahtarı) hata olursa bırakılır.
   */
  const klipBul = async (s, key) => {
    let failed = false;
    let raced = false;
    let karar = null;
    let ayrilanlar = [];
    try {
      const onizBellek = new Map();
      const sorgular = [s.search, simplerQuery(s.search)].filter(Boolean);
      for (let qi = 0, yarisTekrari = 0; qi < sorgular.length; qi++) {
        if (isCancelled()) throw new Error("cancelled");
        const { list, n } = await araKlip(sorgular[qi], s.source, s);
        if (n > 0) failed = true;
        const listede = new Set();
        const adaylar = list
          .filter((a) => a.url && uzakMi(a.url) && a.provider !== "yerel" && permissionUsable(a) && !reddedildi(a.url) && !reddedildi(a.sayfa))
          .filter((a) => !(a.width > 0 && a.height > 0 && a.width < a.height))          // dikey klip
          .filter((a) => !(a.duration > 0 && a.duration < EN_KISA_KLIP))
          .filter((a) => !ayrilan.has(photoKey(a.url)) && !(sayfaAnahtari(a) && ayrilan.has(sayfaAnahtari(a))))
          .filter((a) => {
            const ks = [photoKey(a.url), sayfaAnahtari(a)].filter(Boolean);
            if (ks.some((k) => listede.has(k))) return false;
            ks.forEach((k) => listede.add(k));
            return true;
          })
          .filter((a) => !numberedNameConflict(s.search, a.eser || a.metin))
          .slice(0, ADAY + ADAY_YEDEK);
        // Bu sahne için daha önce "uygun değil" denmiş klipler yeniden gösterilmez (önizleme
        // indirmesi de yapılmaz); penceredekilerin hepsi öyleyse bu sorgu için karar zaten verilmiş.
        const hm = hafiza(`v-${key}`, VIDEO_PICK_VERSION);
        const yeni = adaylar.filter((a) => !reddedilmisAday(hm, a));
        if (adaylar.length && !yeni.length) {
          karar ||= { choice: 0, reason: "adaylar önceki denemede uygun bulunmadı (kayıtlı karar, yeniden sorulmadı)", kayittan: true };
          kayittanKarar++;
          continue;
        }
        adaylar.splice(0, adaylar.length, ...yeni);
        const ok = [];
        const onizler = [];
        let indirilemedi = 0;
        // Önizlemeler paralel (uzun klipte ızgara karelerini uzaktan çekmek saniyeler sürer).
        for (let i = 0; i < adaylar.length && ok.length < ADAY;) {
          const parti = adaylar.slice(i, i + (ADAY - ok.length));
          i += parti.length;
          const sonuc = await Promise.all(parti.map(async (a) => {
            const tk = photoKey(a.url);
            if (onizBellek.has(tk)) return onizBellek.get(tk);
            try {
              const o = await klipOnizleme(a, { tmp, ffmpeg, key, download, girdi, uzak: uzakFor(a.url) });
              onizBellek.set(tk, o);
              return o;
            } catch { indirilemedi++; return null; }
          }));
          parti.forEach((a, j) => {
            const o = sonuc[j];
            if (!o || ok.length >= ADAY) return;
            if (ozetKullanildi(o.dhash)) return;
            if (onizler.some((x) => ayniFotograf(x.dhash, o.dhash))) return;
            ok.push(a);
            onizler.push(o);
          });
        }
        if (!ok.length && indirilemedi) failed = true;
        if (!ok.length) continue;
        // Stok KLİPTE de Sonnet: araç, kokpit, kıyafet gibi dönem hatalarını Haiku kaçırıyordu (Cooper: modern jetler).
        const secimAyari = { ...settings, _donem: donemOf(s) };
        karar = await hafizaliSecim(`v-${key}`, VIDEO_PICK_VERSION, ok, true, () => pick(s, onizler.map((o) => o.buf), {
          settings: secimAyari, usage, logFn,
          titles: ok.map((a) => a.eser || a.metin || ""),
          sizes: ok.map((a) => [a.width || 0, a.height || 0]),
          video: { grids: onizler.map((o) => o.grid), durations: onizler.map((o) => o.dur || 0) },
        }));
        const secim = Math.trunc(Number(karar?.choice) || 0);
        const c = ok[secim - 1] ?? null;
        const o = c ? onizler[secim - 1] : null;
        raced = false;
        if (!c) continue;
        const anahtarlar = [photoKey(c.url), sayfaAnahtari(c)].filter(Boolean);
        if (anahtarlar.some((k) => ayrilan.has(k)) || ozetKullanildi(o.dhash)) {
          raced = true;
          if (yarisTekrari++ < 1) qi--;
          continue;
        }
        ayir(anahtarlar[0], o.dhash);
        if (anahtarlar[1]) ayir(anahtarlar[1], null);
        ayrilanlar = anahtarlar;
        // Izgarada seçilen kare → kaynaktaki an; ızgarasızsa varsayılan.
        const seg = Math.max(1, Math.trunc(Number(karar?.segment) || 1));
        const an = o.times?.length ? o.times[Math.min(seg, o.times.length) - 1] : varsayilanAn(o.dur);
        try {
          const dosya = await klipIndir(c.url, an, o.dur, key);
          const hit = {
            ...selectedProvenance(c), tur: "video", url: c.url, provider: c.provider, lisans: c.lisans || "", sahip: c.sahip || "", eser: c.eser || c.metin || "",
            sayfa: c.sayfa || "", neden: karar.reason || "", modifications: DOCU_VIDEO_MODS, ...dosya,
          };
          if (o.dhash) hit.dhash = o.dhash;
          if (s.name) hit.namedMain = karar.namedPersonIsMainSubject !== false;
          return { hit, failed: false, raced: false };
        } catch (e) {
          if (isCancelled() || String(e.message).includes("cancelled")) throw e;
          ayrilanlar.forEach(birak);
          ayrilanlar = [];
          logFn(`Seçilen klip indirilemedi/kodlanamadı ("${s.search}": ${String(e.message).slice(0, 100)}); fotoğrafa bakılacak, sonraki denemede yeniden aranacak`);
          return { hit: null, failed: true, raced: false };
        }
      }
      if (raced) logFn(`"${s.search}" için seçilen klip başka bir sahneye gitti; bu sefer fotoğrafa bakılacak`);
      else if (karar) logFn(`Uygun hareketli görüntü yok, fotoğrafa bakılacak: "${s.search}" (${karar.reason || ""})`);
      return { hit: null, failed, raced };
    } catch (e) {
      ayrilanlar.forEach(birak);
      throw e;
    }
  };

  let found = 0;
  let aiyaBirakilan = 0;
  let klipBulundu = 0;
  let done = 0;
  const workers = [];
  try {
    // ÖNBELLEKTEKİ SEÇİMLER SIRAYLA AYRILIR. Eski önbellekte aynı fotoğraf iki
    // sahneye farklı adresle yazılmış olabilir (adres tekrarı düzeltilmeden önce):
    // ilk sahne tutar, sonraki yeniden aranır. Eski kayıtlara özet ve boyut eklenir.
    let degisti = false;
    for (const t of targets) {
      const { s, key, vkey } = t;
      // AI'a bırakılan sahnenin kayıtlı seçimi ayrılmaz: o fotoğraf/klip başka sahneye gidebilir.
      if (yalnizAi.has(String(t.i))) continue;
      // Kayıtlı klip: klip ayrılır; sahnenin eski fotoğraf kararı ayrılmaz (klip kullanılacak).
      // Dönem denetiminin reddettiği kayıtlı seçim (klip ya da fotoğraf): yeniden aranır.
      if (cache[vkey]?.video && (reddedildi(cache[vkey].url) || reddedildi(cache[vkey].sayfa))) { delete cache[vkey]; degisti = true; }
      if (cache[key]?.file && (reddedildi(cache[key].url) || reddedildi(cache[key].sayfa))) { delete cache[key]; degisti = true; }
      const vh = t.klip ? cache[vkey] : null;
      if (vh?.video) {
        const ks = [photoKey(vh.url || vh.video), sayfaAnahtari(vh)].filter(Boolean);
        if (ks.some((k) => ayrilan.has(k)) || ozetKullanildi(vh.dhash)) {
          logFn(`Aynı klip önbellekte iki sahneye yazılmış; "${s.search}" için yeniden aranacak`);
          delete cache[vkey];
          degisti = true;
        } else {
          ayir(ks[0], vh.dhash);
          if (ks[1]) ayir(ks[1], null);
          t.fotoAyrilmadi = true;
          continue;
        }
      }
      const h = cache[key];
      if (!h?.file) continue;
      // Kayıtlı bir seçim sonradan eklenen kurala takılıyorsa (başka görev numarası) yeniden seçilir.
      if (numberedNameConflict(s.search, h.eser)) { delete cache[key]; degisti = true; continue; }
      const dosya = path.join(publicDir, h.file);
      if (fs.existsSync(dosya)) {
        if (!h.dhash) {
          const dh = await dosyaOzeti(ffmpeg, dosya, path.join(tmp, `seed-${key}.gray`));
          if (dh) { h.dhash = dh; degisti = true; }
        }
        if (!(h.imgW && h.imgH)) {
          const b = imageSize(fs.readFileSync(dosya));
          if (b) { h.imgW = b.w; h.imgH = b.h; degisti = true; }
        }
      }
      const pk = photoKey(h.url || h.file);
      if (kullanildi(pk, h.dhash)) {
        logFn(`Aynı fotoğraf önbellekte iki sahneye yazılmış; "${s.search}" için yeniden aranacak`);
        delete cache[key];
        degisti = true;
        continue;
      }
      ayir(pk, h.dhash);
    }
    if (degisti) writeJson(cacheFile, cache);

    let next = 0;
    // 5 işçi: klip önizleme+indirme ağ beklemesiyle geçiyor; 3 işçide 128 sahne ~40 dk sürüyordu.
    for (let w = 0; w < 5; w++) workers.push((async () => {
      while (next < targets.length) {
        const t = targets[next++];
        const { s, i, key } = t;
        if (isCancelled()) throw new Error("cancelled");
        const ilerle0 = () => { done++; try { onProgress(done, targets.length); } catch {} };
        if (yalnizAi.has(String(i))) {
          // Dönem denetimi bu sahneyi iki kez reddetti: arşiv dönem görüntüsü vermiyor, aranmaz.
          aiyaBirakilan++;
          if (s.name) { delete s.name; delete s.role; }
          ilerle0();
          continue;
        }
        const ilerle = () => {
          done++;
          try { onProgress(done, targets.length); } catch {}
          if (done % 10 === 0 && done < targets.length) logFn(`Arşiv ${done}/${targets.length}: ${found} sahne gerçek görüntüyle (${klipBulundu} hareketli)`);
        };
        if (t.klip) {
          let vhit = cache[t.vkey];
          if (vhit === null || (vhit?.none && vhit.v !== VIDEO_PICK_VERSION)) vhit = undefined;
          // Kayıtlı klip ama dosyası yok (klasör temizlenmiş): kaynaktan AYNI bölüm yeniden
          // çekilir; seçim ve künye belli, görme modeline yeniden sorulmaz.
          if (vhit?.video && !klipDosyalariVar(vhit)) {
            try {
              vhit = { ...vhit, ...(await klipIndir(vhit.url, vhit.kaynakAn, vhit.kaynakSure, key)) };
              cache[t.vkey] = vhit;
              writeJson(cacheFile, cache);
            } catch (e) {
              if (isCancelled()) throw new Error("cancelled");
              [photoKey(vhit.url || vhit.video), sayfaAnahtari(vhit)].filter(Boolean).forEach((k) => birak(k));
              logFn(`Kayıtlı klip yeniden indirilemedi ("${s.search}": ${String(e.message).slice(0, 100)}); yeniden aranacak`);
              vhit = undefined;
            }
          }
          if (vhit === undefined) {
            let r = { hit: null, failed: true, raced: false };
            try {
              r = await klipBul(s, key);
            } catch (e) {
              if (isCancelled() || String(e.message).includes("cancelled")) throw new Error("cancelled");
              if (/kota\/kredi bitti/.test(String(e.message))) {
                const kim = /Anthropic/.test(String(e.message)) ? "Anthropic (Claude)" : "OpenAI";
                throw new Error(`Arşiv seçimi durdu: ${kim} kredisi bitti.` + " Kredi yükleyip \"Kaldığı yerden devam et\" deyin — bulunan görüntüler korunur, eksik sahneler AI'a çevrilmez.");
              }
              logFn(`Görüntü araması başarısız (${String(e.message).slice(0, 100)}), sahne için fotoğrafa bakılıyor; sonraki denemede yeniden aranacak`);
            }
            vhit = r.hit;
            // Fotoğraf yolundaki kural: yalnızca temiz bir karar "uygun klip yok" diye kaydedilir.
            if (!isCancelled() && (vhit?.video || (!r.failed && !r.raced))) {
              cache[t.vkey] = vhit ?? { none: true, v: VIDEO_PICK_VERSION };
              writeJson(cacheFile, cache);
            }
          }
          if (vhit?.video && klipDosyalariVar(vhit)) {
            s.video = vhit.video;
            s.videoStart = vhit.videoStart || 0;
            s.videoDur = vhit.videoDur;
            s.videoW = vhit.videoW;
            s.videoH = vhit.videoH;
            s.image = vhit.file;
            s.archived = true;
            if (vhit.imgW > 0 && vhit.imgH > 0) { s.imgW = vhit.imgW; s.imgH = vhit.imgH; }
            if (s.name && vhit.namedMain === false) {
              logFn(`"${s.name}" seçilen klibin ana konusu değil — klip kalıyor, isim kartı kaldırıldı`);
              delete s.name;
              delete s.role;
            }
            // Künye fotoğraftakiyle aynı alanlar; dosya klibin kendisi. İç alanlar künyeye girmez.
            const { dhash: _o, namedMain: _n, tur: _t, video: _v, videoStart: _vs, videoDur: _vd, videoW: _vw, videoH: _vh, imgW: _iw, imgH: _ih, kaynakAn: _ka, kaynakSure: _ks, file: _f, ...kayit } = vhit;
            credits[`scene-${i}`] = { ...selectedProvenance(kayit), ...kayit, modifications: kayit.modifications || DOCU_VIDEO_MODS, file: vhit.video, type: "video" };
            found++;
            klipBulundu++;
            ilerle();
            continue;
          }
        }
        // Atmosfer denemesi (atmosphereFootage): klip yoksa stok fotoğrafa değil, eski AI resmine döner.
        if (s.videoOnly) {
          const o = s._atmos || { source: "ai", search: "" };
          s.source = o.source;
          if (o.search) s.search = o.search;
          else delete s.search;
          delete s.media;
          delete s.videoOnly;
          delete s._atmos;
          ilerle();
          continue;
        }
        // Klibi önbellekten ayrılan ama klibi artık kullanılamayan sahne: fotoğrafı şimdi ayrılır.
        if (t.fotoAyrilmadi) {
          t.fotoAyrilmadi = false;
          const h = cache[key];
          if (h?.file) {
            const pk = photoKey(h.url || h.file);
            if (kullanildi(pk, h.dhash)) delete cache[key];
            else ayir(pk, h.dhash);
          }
        }
        let hit = cache[key];
        if (hit === null || (hit?.none && hit.v !== PICK_VERSION)) hit = undefined;
        // Seçim önbellekte ama dosya yok (klasör temizlenmiş): adresinden yeniden
        // indirilir. Seçim ve künye belli; görme modeline yeniden sorulmaz. Eskiden
        // bu durumda sahne sessizce AI'a düşüyordu.
        if (hit?.file && !fs.existsSync(path.join(publicDir, hit.file))) {
          try {
            hit = { ...hit, ...(await indir(hit.url, key)) };
            cache[key] = hit;
            writeJson(cacheFile, cache);
          } catch {
            if (isCancelled()) throw new Error("cancelled");
            birak(photoKey(hit.url || hit.file));
            hit = undefined;
          }
        }
        if (hit === undefined) {
          // Yalnızca GERÇEK bir karar önbelleğe "uygun yok" diye yazılır. Ağ/hız
          // sınırı hatası bir karar değildir: kaydedilmez, işe devam edilince yeniden denenir.
          let failed = false;
          let raced = false;
          let reserved = null;
          try {
            hit = null;
            let karar = null;
            let c = null;
            let cOzet = null;
            const tamEkran = TAM_EKRAN_TIPLER.has(s.type);
            // Aynı sahnenin yeniden denemesinde küçük resimler tekrar indirilmesin.
            const thumbBellek = new Map();
            const sorgular = [s.search, simplerQuery(s.search)].filter(Boolean);
            // Yarışı kaybeden sahne (seçtiği fotoğrafı başka işçi o an ayırdı) AYNI
            // listeyi bir kez daha görür: sıradaki doğru aday çoğu zaman oradadır. Eskiden
            // doğrudan sade sorguya geçiyor, o da yoksa sahne ücretli AI görseline düşüyordu.
            for (let qi = 0, yarisTekrari = 0; qi < sorgular.length; qi++) {
              const q = sorgular[qi];
              if (isCancelled()) throw new Error("cancelled");
              // Sağlayıcı hataları (hız sınırı, ağ) "sonuç yok" ile karışmasın: sayılır.
              const { list, n } = await ara(q);
              if (n > 0) failed = true;
              const listede = new Set();
              // 1990 öncesi hikâyede uçak/araç/şehir karesi: kurum arşivi adayları stok sitelerinden önce.
              // 1850 öncesi hikâyede zamansız olmayan kare: stok sitesi adayı yok (sanayiOncesiAdaylar).
              const adaylar = arsivOnce(sanayiOncesiAdaylar(list, s, yilOf(s)), { eski: eskiOf(s), riskli: modernRiskli(q) })
                .filter((a) => a.type !== "video" && a.url && !ayrilan.has(photoKey(a.url)) && !reddedildi(a.url) && !reddedildi(a.sayfa))
                // Aynı dosyanın iki adresi aynı listede: küçük resmi iki kez indirmeye gerek yok.
                .filter((a) => { const k = photoKey(a.url); if (listede.has(k)) return false; listede.add(k); return true; })
                .filter((a) => !numberedNameConflict(s.search, a.eser || a.metin))
                // Başlık/slam'da fotoğraf tam ekran: küçük tarama pikselli görünür.
                .filter((a) => !tamEkran || !tamEkranaKucuk(a))
                .slice(0, ADAY + ADAY_YEDEK);
              // Bu sahne için daha önce "uygun değil" denmiş fotoğraflar yeniden gösterilmez (sade
              // sorgu çoğu zaman aynı adayları getirir); hepsi öyleyse bu sorgunun kararı zaten var.
              const hm = hafiza(key, PICK_VERSION);
              const yeniler = adaylar.filter((a) => !reddedilmisAday(hm, a));
              if (adaylar.length && !yeniler.length) {
                karar ||= { choice: 0, reason: "adaylar önceki denemede uygun bulunmadı (kayıtlı karar, yeniden sorulmadı)", kayittan: true };
                kayittanKarar++;
                continue;
              }
              adaylar.splice(0, adaylar.length, ...yeniler);
              const thumbs = [];
              const ok = [];
              let indirilemedi = 0;
              for (const a of adaylar) {
                if (ok.length >= ADAY) break;
                const tk = photoKey(a.url);
                let t = thumbBellek.get(tk);
                if (!t) {
                  try { t = await thumbOf(a, tmp, ffmpeg, key, download); } catch { indirilemedi++; continue; }
                  thumbBellek.set(tk, t);
                }
                // Başka sahnede kullanılan fotoğrafın başka sitedeki kopyası.
                if (ozetKullanildi(t.dhash)) continue;
                // Aynı listede aynı fotoğrafın iki kopyası: büyük olan kalır.
                const esi = thumbs.findIndex((x) => ayniFotograf(x.dhash, t.dhash));
                if (esi >= 0) { if (alan(a) > alan(ok[esi])) { ok[esi] = a; thumbs[esi] = t; } continue; }
                ok.push(a);
                thumbs.push(t);
              }
              if (!ok.length && indirilemedi) failed = true;
              if (!ok.length) continue;
              // Stok (genel atmosfer) sahnesinde kimlik riski yok: ucuz model yeter — ama 1990 öncesi
              // hikâyede değil: Haiku Ryanair logolu jeti 1971'e koymuştu (Cooper QA). Orada tam model.
              // Gerçek kişi/olay (archive) sahnesinde gpt-4.1 kalır — mini yanlış görevi seçmişti.
              const secimAyari = s.source === "stock" && !eskiOf(s) ? { ...settings, _donem: donemOf(s), openaiVisionModel: settings.openaiStockVisionModel || "gpt-6-luna", claudeVisionModel: settings.claudeStockVisionModel || "claude-haiku-4-5-20251001" } : { ...settings, _donem: donemOf(s) };
              karar = await hafizaliSecim(key, PICK_VERSION, ok, false, () => pick(s, thumbs.map((t) => t.buf), {
                settings: secimAyari, usage, logFn,
                titles: ok.map((a) => a.eser || a.metin || ""),
                sizes: ok.map((a) => [a.width || 0, a.height || 0]),
              }));
              const secim = Math.trunc(Number(karar?.choice) || 0);
              c = ok[secim - 1] ?? null;
              cOzet = c ? thumbs[secim - 1].dhash : null;
              raced = false;
              // Paralel işçiler aynı fotoğrafı (ya da başka sitedeki kopyasını) seçmesin: seçildiği anda ayır.
              if (c && kullanildi(photoKey(c.url), cOzet)) {
                c = null;
                raced = true;
                if (yarisTekrari++ < 1) qi--; // aynı sorgu, kalan adaylarla bir kez daha
                continue;
              }
              if (c) { reserved = photoKey(c.url); ayir(reserved, cOzet); break; }
            }
            if (!c) {
              if (raced) logFn(`"${s.search}" için seçilen fotoğraf başka bir sahneye gitti; bu sefer AI ile canlandırılacak, sonraki denemede yeniden aranacak`);
              else if (karar) logFn(`Arşivde uygun fotoğraf yok, AI ile canlandırılacak: "${s.search}" (${karar.reason || ""})`);
              else if (!failed) logFn(`Arşivde aday bulunamadı, AI ile canlandırılacak: "${s.search}"`);
            }
            if (c) {
              const dosya = await indir(c.url, key);
              hit = { ...selectedProvenance(c), url: c.url, provider: c.provider, lisans: c.lisans, sahip: c.sahip, eser: c.eser, sayfa: c.sayfa, neden: karar.reason, modifications: DOCU_MODS, ...dosya };
              if (cOzet) hit.dhash = cOzet;
              // İsim kartı bu seçimde ANA KONU değilse fotoğraf kalır, kart kalkar (aşağıda).
              if (s.name) hit.namedMain = karar.namedPersonIsMainSubject !== false;
            }
          } catch (e) {
            if (isCancelled() || String(e.message).includes("cancelled")) throw new Error("cancelled");
            // Kredi bittiyse her sahne sessizce ÜCRETLİ AI görseline düşerdi (bir videoda 160 görsel).
            // Durup haber vermek doğru olan: kredi yüklenince iş kaldığı yerden sürer.
            if (/kota\/kredi bitti/.test(String(e.message))) {
              if (reserved) birak(reserved);
              const kim = /Anthropic/.test(String(e.message)) ? "Anthropic (Claude)" : "OpenAI";
              throw new Error(`Arşiv seçimi durdu: ${kim} kredisi bitti.` + " Kredi yükleyip \"Kaldığı yerden devam et\" deyin — bulunan fotoğraflar korunur, eksik sahneler AI'a çevrilmez.");
            }
            logFn(`Arşiv araması başarısız (${String(e.message).slice(0, 100)}), sahne bu sefer AI'a düşüyor; sonraki denemede yeniden aranacak`);
            if (reserved) birak(reserved);
            failed = true;
            hit = null;
          }
          // Bulunan fotoğraf her zaman kaydedilir. "Uygun yok" yalnızca temiz bir kararsa:
          // hata, kaybedilen yarış (başka sahne aynı fotoğrafı aldı) ya da iptal kaydedilmez.
          if (!isCancelled() && (hit?.file || (!failed && !raced))) {
            cache[key] = hit ?? { none: true, v: PICK_VERSION };
            writeJson(cacheFile, cache);
          }
        }
        if (hit?.file && fs.existsSync(path.join(publicDir, hit.file))) {
          s.image = hit.file;
          s.archived = true;
          if (hit.imgW > 0 && hit.imgH > 0) {
            s.imgW = hit.imgW;
            s.imgH = hit.imgH;
            // Dikey/kareye yakın arşiv fotoğrafında kamera yüzün olduğu üst üçte bire
            // yönelsin; merkez kırpma başı kesiyordu. Senaryo odak verdiyse ona dokunulmaz.
            if (ODAK_TIPLER.has(s.type) && !s.focus && hit.imgW / hit.imgH < DIKEY_ORAN) s.focus = [0.5, 0.3];
          }
          if (s.name && hit.namedMain === false) {
            // Kalabalık ya da mekân fotoğrafının altına bir kişinin adını yazmak, izleyiciye
            // yanlış kişiyi gösterir. Fotoğraf doğru sahneye ait: kalır, kart kalkar.
            logFn(`"${s.name}" seçilen fotoğrafın ana konusu değil — fotoğraf kalıyor, isim kartı kaldırıldı`);
            delete s.name;
            delete s.role;
          }
          // Önbellekten gelen eski kayıtlarda da künye eksiksiz olsun. İç alanlar künyeye girmez.
          const { dhash: _o, namedMain: _n, ...kayit } = hit;
          credits[`scene-${i}`] = { ...selectedProvenance(kayit), ...kayit, modifications: kayit.modifications || DOCU_MODS, file: kayit.file };
          found++;
        } else if (s.name) {
          // Gerçek bir kişinin sahnesi AI canlandırmasına düştü: AI yüzünün altına
          // gerçek bir isim yazmak izleyiciyi yanıltır. İsim kartı kalkar, anlatım kalır.
          logFn(`"${s.name}" için gerçek fotoğraf yok — AI sahnesinde isim kartı gösterilmeyecek`);
          delete s.name;
          delete s.role;
        }
        ilerle();
      }
    })());
    await Promise.all(workers);
  } finally {
    // Bir işçi hata verince diğerleri hâlâ tmp'ye yazıyor olabilir: silmeden önce hepsini bekle.
    await Promise.allSettled(workers);
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  // Montaj kareleri: bulunan fotoğraf karenin kendisine yazılır, yardımcı alan temizlenir.
  for (const { s } of targets) {
    if (!s._kare) continue;
    if (s.image) Object.assign(s._kare, { image: s.image, ...(s.imgW ? { imgW: s.imgW, imgH: s.imgH } : {}) });
    // Kareye klip bulunduysa motor onu scene.clips[] içinde images[] ile hizalı oynatır.
    if (s.video) Object.assign(s._kare, { video: s.video, videoStart: s.videoStart, videoDur: s.videoDur, videoW: s.videoW, videoH: s.videoH });
    delete s._kare;
  }
  for (const k of kapaliSaglayicilar()) logFn(`Not: ${k.ad} arşivi erişimi reddetti (${k.neden}); bu oturumda o kaynak atlanıyor`);
  if (aiyaBirakilan) logFn(`Arşiv: ${aiyaBirakilan} sahne/kare dönem denetiminde iki kez reddedildiği için aranmadı — dönemine sadık notla AI görseli`);
  if (kayittanKarar) logFn(`Arşiv seçici: ${kayittanKarar} karar kayıttan (aynı adaylar yeniden ödenmedi)`);
  if (klipSayisi) logFn(`Hareketli görüntü: ${klipBulundu}/${klipSayisi} sahne arşiv/stok klibiyle`);
  logFn(`Arşiv/stok: ${found}/${targets.length} görsel gerçek görüntüyle (${klipBulundu} klip, ${found - klipBulundu} fotoğraf), kalanı AI ile`);
  return { script, credits };
}

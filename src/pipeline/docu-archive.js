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
import { readJson, writeJson, downloadFile, run, fetchJson, UA } from "../util.js";
import { searchQuery, photoKey, photoTwinKey, tekFotoSayfasi, kapaliSaglayicilar, geciciSaglayiciHatasi, markMonoSource } from "./media.js";
import { selectedProvenance, commonsKey, commonsMetadata, permissionUsable } from "./provenance.js";
import { callVisionJSON } from "../llm.js";
import { pickInbox } from "./docu-pick-inbox.js";

const ARCHIVE_TYPES = new Set(["photo", "title", "words", "slam", "headline", "document", "quote"]);
/**
 * A file the script names (`commons: "File:..."`) is also fetched for a split's own side and a counter's picture:
 * neither is searched, but skipping a NAMED real photo sent both to AI (Panama, Oct 2026: the Sagaing bridge split
 * and the USGS La Tronosa map counter came back as AI stills).
 */
const NAMED_TYPES = new Set([...ARCHIVE_TYPES, "split", "counter"]);
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
/*
 * BAŞKA ÜLKENİN KLİBİ — stok sitesinin başlığı/slug'ı hikâyede geçmeyen bir ülkeyi, şehri ya da o ülkeye özgü bir
 * bayramı söylüyorsa aday baştan elenir (Panama depremi, Ekim 2026: "Mulino sakin olun dedi" cümlesinin altına
 * "indian-festival-ganesha-festival" klibi, Hindistan bayraklarıyla girdi; seçicinin kredisi yoktu, fark eden olmadı).
 * Gruplar: hikâyede grubun herhangi bir sözcüğü geçiyorsa o ülkenin klibi serbesttir.
 */
// "|" separates the group's names; a name may be two words ("costa rica", "new york") and matches only whole.
const PLACE_GROUPS = [
  "india|indian|hindu|ganesha|ganesh|diwali|holi|mumbai|delhi|kolkata|bangalore|jaipur|varanasi|kerala",
  "china|chinese|beijing|shanghai|shenzhen|guangzhou",
  "japan|japanese|tokyo|kyoto|osaka",
  "korea|korean|seoul|busan",
  "thailand|thai|bangkok|phuket",
  "vietnam|vietnamese|hanoi|saigon",
  "indonesia|indonesian|bali|jakarta|malino",
  "philippines|filipino|manila",
  "hawaii|hawaiian|waikiki|honolulu",
  "mexico|mexican|cancun|guadalajara",
  "brazil|brazilian|sao paulo",
  "costa rica|costa rican|alajuela",
  "guatemala|guatemalan", "honduras", "nicaragua", "el salvador", "cuba|cuban|havana", "jamaica|jamaican",
  "colombia|colombian|bogota|medellin|cali|pereira|cartagena",
  "venezuela|venezuelan|caracas", "ecuador|ecuadorian|quito", "peru|peruvian|lima|cusco", "chile|chilean",
  "argentina|argentinian|buenos aires", "bolivia", "uruguay", "paraguay",
  "panama|panamanian",
  "france|french|paris", "italy|italian|rome|roman|venice|milan|florence", "spain|spanish|madrid|barcelona",
  "germany|german|berlin|munich", "britain|british|england|london|scotland|scottish", "ireland|irish|dublin",
  "portugal|portuguese|lisbon", "netherlands|dutch|amsterdam", "greece|greek|athens", "turkey|turkish|istanbul|ankara",
  "russia|russian|moscow", "ukraine|ukrainian|kyiv|kiev", "poland|polish|warsaw", "czech|prague", "hungary|budapest",
  "austria|vienna", "switzerland|swiss|zurich", "sweden|swedish|stockholm", "norway|norwegian|oslo",
  "egypt|egyptian|cairo", "morocco|moroccan|marrakech", "dubai|uae|emirates|abu dhabi", "saudi arabia|saudi|riyadh|mecca",
  "israel|israeli|jerusalem|tel aviv", "iran|iranian|tehran", "iraq|baghdad", "pakistan|karachi|lahore",
  "bangladesh|dhaka", "nepal|kathmandu", "sri lanka", "maldives", "singapore", "hong kong", "taiwan|taipei",
  "australia|australian|sydney|melbourne", "new zealand|auckland", "canada|canadian|toronto|vancouver|montreal",
  "new york|manhattan|brooklyn|nypd", "los angeles|hollywood|lapd",
  // Fransa videosu (21 Ekim 2026, izleyici notu): Paris isyanı anlatılırken 2020 Minneapolis (George Floyd) yangını, BLM
  // tabelalı ABD yürüyüşü girdi. ABD başlıkları/şehirleri: hikâye Amerika'yı anmıyorsa elenir ("us" zamir olduğu için yok).
  "united states|america|american|usa|minneapolis|minnesota|st paul|saint paul|ferguson|baltimore|kenosha|louisville|seattle|atlanta|houston|texas|california|florida|denver|philadelphia|detroit|boston|black lives matter|blm",
  "policia|carabineros|guardia civil", "san francisco", "las vegas", "chicago", "miami",
  "nigeria|lagos", "kenya|nairobi", "south africa|cape town|johannesburg",
].map((g) => g.split("|"));
const placeNorm = (t) => ` ${String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, " ").trim()} `;
const groupHits = (text, g) => g.some((name) => text.includes(` ${name} `));
/** Hikâyenin (başlık, bölümler, anlatım, arama, alt yazılar) söylediği ülke gruplarının indisleri. */
export function storyPlaceGroups(text) {
  const t = placeNorm(text);
  const out = new Set();
  PLACE_GROUPS.forEach((g, i) => { if (groupHits(t, g)) out.add(i); });
  return out;
}
/** Adayın başlığı hikâyede olmayan bir ülke grubunu söylüyor mu? */
export function foreignPlaceConflict(storyGroups, title) {
  const t = placeNorm(title);
  if (t.trim() === "") return false;
  return PLACE_GROUPS.some((g, i) => !storyGroups.has(i) && groupHits(t, g));
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

/** Seçicinin bildirdiği yüz konumu [x, y] (0-1); geçersizse null. */
export const yuzOf = (k) => (Number.isFinite(k?.faceX) && Number.isFinite(k?.faceY) && k.faceX >= 0 && k.faceX <= 1 && k.faceY >= 0 && k.faceY <= 1 ? [+k.faceX.toFixed(2), +k.faceY.toFixed(2)] : null);

const PICK_SCHEMA = {
  type: "object",
  properties: {
    choice: { type: "integer", description: "Seçilen adayın numarası (1..N). Hiçbiri uygun değilse 0." },
    reason: { type: "string", description: "Tek cümle gerekçe" },
    namedPersonIsMainSubject: {
      type: "boolean",
      description: "İsim kartındaki kişi seçilen fotoğrafın açık ana konusu mu (yüzü görünür)? İsim kartı yoksa ya da seçim 0 ise true.",
    },
    faceX: { type: "number", description: "İsim kartı varsa: seçilen fotoğrafta o kişinin yüzünün YATAY konumu, 0 (sol kenar) – 1 (sağ kenar). Yoksa 0.5." },
    faceY: { type: "number", description: "İsim kartı varsa: seçilen fotoğrafta o kişinin yüzünün DİKEY konumu, 0 (üst kenar) – 1 (alt kenar). Yoksa 0.35." },
  },
  required: ["choice", "reason", "namedPersonIsMainSubject", "faceX", "faceY"],
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
 * Aynı resim/klip birbirinden uzak sahnelerde tekrar ediyor mu (Yom Kippur: geçiş fotoğrafı 3 kez, aynı Kissinger
 * portresi 2 kez; Ekim 2026 kare incelemesi). Yan yana sahneler (aynı anın devamı), önceki-kare zeminleri ve
 * son 3 sahnedeki bilinçli kapanış dönüşü sayılmaz. → [{ file, scenes: [i, j, …] }]
 */
export function duplicatePictures(scenes = []) {
  const uses = new Map();
  scenes.forEach((s, i) => {
    if (!s || s.bg === "prev" || s.heldBg) return;
    const file = s.video || s.image;
    if (!file) return;
    if (!uses.has(file)) uses.set(file, []);
    uses.get(file).push(i);
  });
  const tail = scenes.length - 3;
  const out = [];
  for (const [file, idx] of uses) {
    const far = idx.filter((i, k) => k > 0 && i - idx[k - 1] > 1 && i < tail);
    if (far.length) out.push({ file, scenes: idx });
  }
  return out;
}

/** Tahmini sahne süresi (sn): yazarın dur'u ya da anlatım (2,6 kelime/sn) + nefes. */
const sceneSec = (s) => Math.max(Number(s?.dur) || 0, String(s?.say || "").replace(/\[[^\]]*\]/g, " ").trim().split(/\s+/).filter(Boolean).length / 2.6 + 0.4);
const CARD_TYPES = new Set(["board", "flow", "stat", "icons", "bars", "donut", "scale", "document", "timeline", "quote", "map", "split", "explainer", "ui-card", "chart"]);
/**
 * Aynı resim art arda sahnelerde ekranda uzun kalıyor mu (önceki-kare zinciri ya da aynı dosya)? Panama (Ekim 2026):
 * bir sahne karta dönünce zincir kaydı, aynı sokak klibi üç sahne ~25 sn, aynı USGS haritası ~21 sn kaldı.
 * → [{ file, scenes: [i…], sec }] (en az 3 sahne ya da maxSec'ten uzun).
 */
export function longHolds(scenes = [], { maxSec = 15 } = {}) {
  const out = [];
  let cur = null;
  // Gerçek görüntünün sürdüğü satırlar (footage-hold.js, en çok 30 sn) bekleyen kare değildir: klip oynamaya devam eder.
  const close = () => { if (cur && !(cur.moving && cur.sec <= 32) && cur.scenes.length >= 2 && (cur.scenes.length >= 3 || cur.sec > maxSec)) out.push({ file: cur.file, scenes: cur.scenes, sec: +cur.sec.toFixed(1) }); cur = null; };
  scenes.forEach((s, i) => {
    if (!s || CARD_TYPES.has(s.type)) { close(); return; }
    const own = s.bg === "prev" || s.heldBg ? null : s.video || s.image || null;
    if (cur && (own === null || own === cur.file)) { cur.scenes.push(i); cur.sec += sceneSec(s); return; }
    close();
    if (own) cur = { file: own, scenes: [i], sec: sceneSec(s), moving: !!s.video };
  });
  close();
  return out;
}

/* ================================================================ yazı yüzde, ad başkasının resminde */

/*
 * YAZI YÜZÜN ÜSTÜNE BİNMEZ, AD BAŞKASININ RESMİNE YAZILMAZ (26 Ekim 2026 işleri; kare incelemesi 27 Ekim):
 *  - Lula (haber, 20261026-29db03): 0:13'te kancanın başlığı "HOW BRAZIL REALLY VOTED" Lula'nın resmî portresinde
 *    ağzının üstündeydi (künye "Foto oficial de Luiz Inácio Lula da Silva"); 4:17'de "52" anahtar kelimesi Flávio
 *    Bolsonaro'nun yüzünün ortasında (künye "Entrevistas Diversas - Senador Flávio Bolsonaro"). Ön izleme kapısı başlığı
 *    altı turda da "text_on_face" buldu; düzeltmesi ("other-style") yalnızca yazı stilini değiştirdi, yazı kadrajın
 *    ortasında kaldı. Shorts'ta kural 10 Ekim'den beri vardı (docu-shorts.js lowOverFaces), uzun videoda yoktu.
 *  - Çernobil (tarih, 20261026-24122a): 0:54'te "Their names were Oleksiy Ananenko…" satırının dev "ANANENKO"su önceki
 *    sahnenin AI kontrol odası resmindeki BAŞKA adamların yüzlerindeydi — izleyici onları Ananenko sanar. Kapı
 *    "wrong_face" buldu ama düzeltmesi satırın AI istemine not yazmaktı: satır önceki karenin resmini taşıyordu, değişmedi.
 * Kural (ücretsiz, deterministik; docu.js finishEngineDocu her planda, kapının yamalarından sonra uygular):
 *  - resim yüz gösteriyor mu: isim kartı, seçicinin yüz konumu (künyede face), derinlik/cast, künye başlığında senaryodaki
 *    bir kişinin adı, tarifte insan sözcüğü (AI istemi ya da stok künyesi; Shorts'un FACE_LOOK'unun uzun video hâli);
 *  - yüzlü resmin üstündeki büyük yazı (anahtar kelime, vuruş, başlık, yazı kartı) textAt "low" alır, yüz karenin alt
 *    yarısındaysa "top" — motor bloğu alt üçte bire indirir ve bir boy küçültür (docu-engine/src/looks/text.tsx band);
 *  - ekrandaki AD (isim kartı, anahtar kelime, vuruş kelimesi, fotoğraf altyazısı) yalnızca o kişiyi gerçekten gösteren
 *    resmin üstünde durur: sahnenin gerçek resmi ve künyesi o kişiyi adlandırıyor ya da seçici o isim kartıyla yüzü
 *    doğruladı (künyede face). AI resmi gerçek bir kişiyi göstermez. Değilse isim kartı o kişinin ilk uygun fotoğraf
 *    sahnesine taşınır (yoksa kalkar); kart ve vuruş yazısız kalır (adı anlatım söyler), altyazı kalkar.
 */
/** Yüzlü resmin tarif sözcükleri (docu-shorts.js FACE_LOOK'un uzun video hâli; Commons künyeleri Portekizce/İspanyolca da). */
const YUZ_TARIFI = /\b(portraits?|faces?|headshot|man|men|woman|women|boys?|girls?|child|children|persons?|president|senator|senador|deputy|deputado|minister|ministro|governor|governador|mayor|prefeito|king|queen|emperor|sultan|general|admiral|officers?|soldiers?|engineers?|workers?|technicians?|operators?|scientists?|doctors?|nurses?|pilots?|divers?|firefighters?|policem[ae]n|crew|staff|preacher|pastor|priest|wife|husband|mother|father|singer|actor|host|anchor|politician|candidate|leader|supporters?|protesters?|voters?|smiling|speaking|interview|entrevistas?|foto oficial|retrato|official (?:photo|portrait))\b/i;
/** Uzak çekim: yüzler küçük — yakın/orta çekim ya da yüz sözcüğü yoksa yazı yerinde kalır. */
const UZAK_CEKIM = /\b(wide|aerial|distant|far away|silhouettes?|from above|bird'?s-eye|drone|skyline)\b/i;
const YAKIN_CEKIM = /\b(portraits?|faces?|headshot|close-?up|medium|tight|interview|entrevistas?|foto oficial|retrato)\b/i;
/*
 * Künyede unvan sözcüğü çoğu kez bir yerin ya da şeyin adıdır (inceleme, 27 Ekim 2026): Suudi–Husi 20261011-3c27b1'in
 * kanca başlığı (sahne 2) "King Khalid International Airport" künyesi yüzünden, "general aviation" künyeleri de aynı
 * yüzden alt üçte bire iniyordu. Arşiv künyesinde king/queen/general ancak portre/yakın çekim sözcüğüyle yüz sayılır
 * (AI isteminde "a king on his throne" bir kişidir, değişmez).
 */
const KUNYE_UNVAN = /\b(?:kings?|queens?|general)\b/gi;
/**
 * Tarif yüzün GÖRÜNMEDİĞİNİ söylüyor: kimse yok, "no faces" (AI istemleri yüzü bilerek saklar), silüet, arkadan, ya da
 * yalnızca el/parmak/nesne yakın çekimi (Lula: "Close-up of a voter's finger pressing the keypad").
 */
const YUZ_YOK = /\b(empty|nobody|no one|no (?:visible |readable )?(?:people|persons?|faces?|figures?|humans?|crowds?)|deserted|unoccupied|faceless|silhouettes?|silhouetted|from behind|back to (?:the )?camera|faces? (?:in shadow|hidden|obscured|turned away)|vazio|vazia)\b/i;
const DETAY = /\b(?:close-?up|detail(?: shot)?|macro) of (?:[\p{L}'’]+\s+){0,3}?(?:hands?|fingers?|keypad|keyboard|screen|documents?|papers?|page|ballots?|dials?|gauges?|buttons?|coins?|bills?|cash|maps?|letters?|boots?|feet)\b/iu;
/** Yüz karenin bu yüksekliğinin altındaysa yazı üst banda çıkar. */
export const FACE_LOW_Y = 0.62;

const KIRIL = { а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", є: "ye", ё: "e", ж: "zh", з: "z", и: "i", і: "i", ї: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
/** Ad karşılaştırması: küçük harf, Kiril → Latin ("Ананенко" → "ananenko"), aksansız, yalnızca harf/rakam sözcükleri. */
export function adNorm(t) {
  return String(t || "").toLowerCase().replace(/[Ѐ-ӿ]/g, (c) => KIRIL[c] ?? c).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
const AD_EKI = new Set(["da", "de", "do", "dos", "das", "di", "du", "del", "della", "van", "von", "der", "den", "ter", "bin", "ibn", "al", "el", "la", "le", "y", "e"]);
/** Ad önündeki unvanlar (docu-engine/lib/produce.mjs TITLE_UPPER'ın aynası; motor uygulamanın dışında, içe aktarılamaz). */
const UNVAN = new Set(["Vice President", "Prime Minister", "Senator", "Sen", "President", "Minister", "Governor", "Mayor", "Judge", "Justice", "Chancellor", "King", "Queen", "Prince", "Princess", "Emperor", "Empress", "Tsar", "Czar", "Pope", "Cardinal", "Archbishop", "Bishop", "General", "Admiral", "Colonel", "Col", "Captain", "Capt", "Lieutenant", "Lt", "Sergeant", "Sgt", "Commander", "Marshal", "Sheriff", "Detective", "Dr", "Doctor", "Professor", "Prof", "Rev", "Reverend", "Mr", "Mrs", "Ms", "Sir", "Dame", "Lord", "Lady", "Ayatollah", "Sheikh", "Sultan", "Rabbi", "Imam"].flatMap((t) => t.toLowerCase().split(" ")));
/*
 * Ad olmayan parçalar (unvan, yaş, sıradan sözcük): "ananenko_young" → yalnızca "ananenko". produce.mjs NAME_STOP'un aynası
 * (inceleme, 27 Ekim 2026): "Judge Robert Potter" (Bakker 20261006-af567d) "judge"ı, "Bill"/"Will"/"Grace"/"Hope" gibi
 * adlar sıradan sözcüğü ad parçası yapıyordu — ekrandaki "JUDGE" ya da "WILL" o kişinin adı sanılıp kalkabilirdi.
 */
const AD_DISI = new Set([
  ...UNVAN, "senior", "junior", "father", "mother", "young", "old", "older", "elder",
  ..."the a an and or but so then now yet still in on at of for from by with to into after before when while during since until as his her their its our my your this that these those there here what who whom why how where which it he she they we you saint st jr sr ii iii iv remember meanwhile however today tonight yesterday tomorrow later earlier".split(" "),
  ..."january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday".split(" "),
  ..."court house senate congress parliament assembly building tower palace square street avenue road bridge river lake mountain station airport hospital university college school church cathedral museum bank exchange market office department ministry committee council commission agency bureau police army navy force party group company corporation inc ltd llc fund foundation institute center centre hall plant reactor unit prison jail federal national supreme state city county republic kingdom union united states new north south east west central great royal international world global times post journal news daily magazine tribune herald press gazette globe portrait motors electric staff will hope grace faith joy bill".split(" "),
]);
/*
 * ÜLKE ADI KİŞİNİN AD PARÇASI DEĞİLDİR (inceleme, 27 Ekim 2026; sıradaki İsrail 2026 seçim videosu): "Israel Katz" isim
 * kartı "israel"i Savunma Bakanı'nın ad parçası yapıyordu (anlatım "Israel"i tek başına da söylediği için ilk adı da
 * sayılıyordu) — "ISRAEL" vuruşu başkasının resminde Katz'ın adı sanılıp siliniyor, AI notunda "Israel votes on Tuesday"
 * "The person votes…" oluyordu. Katz "katz"la tanınır. Ad dizisine katılması engellenmez: "Defense Minister Israel Katz"
 * bütünüyle "the person" olur. Halkın adı da kişi değildir: "israeli_voter" cast anahtarı "Israeli"yi, "tel_aviv_protester"
 * "Aviv"i kişi yapıyordu (peopleNames). produce.mjs PLACE_NAMES ve docu-script.js PLACE_WORDS ile AYNI.
 */
const YER_ADI = new Set("israel israeli israelis gaza palestine palestinian palestinians iran iranian iranians iraq iraqi syria syrian lebanon lebanese egypt egyptian yemen yemeni saudi saudis arabia arab arabs qatar qatari oman turkey turkiye turkish russia russian russians ukraine ukrainian ukrainians belarus china chinese taiwan japan japanese korea korean india pakistan pakistani afghanistan afghan america american americans britain british england scotland ireland irish france germany italy italian spain spanish portugal europe european africa african asia brazil brazilian argentina mexico mexican canada canadian venezuela venezuelan cuba cuban hungary hungarian poland polish soviet jewish muslim houthi houthis idf jerusalem tel aviv moscow beijing tehran kyiv kiev hamas hezbollah kremlin".split(" "));
const adParcalari = (ad) => adNorm(ad).split(" ").filter((w) => w.length >= 4 && !AD_DISI.has(w) && !AD_EKI.has(w) && !YER_ADI.has(w));
/** Bir kişinin adı mı ("Bartl Wimmer", "Luiz Inácio Lula da Silva"); kurum ("SEC Office of Inspector General") değil. Virgül/parantez öncesi. */
function kisiAdi(t, { tek = false } = {}) {
  const ad = String(t || "").split(/[,(;:—–]/)[0].trim();
  const parca = ad.split(/\s+/).filter(Boolean);
  if (!parca.length || parca.length > 6 || (!tek && parca.length < 2) || !/^\p{Lu}/u.test(parca[0])) return null;
  return parca.every((w) => AD_EKI.has(w) || /^\p{Lu}[\p{L}'’.-]*$/u.test(w)) ? ad : null;
}

/**
 * Senaryodaki gerçek kişiler: isim kartları (`name`), alıntıların sahipleri (`who`, kişi adıysa) ve anlatımda hep büyük
 * harfle geçen cast anahtarları ("ananenko_young" → Ananenko; "firefighter" anlatımda küçük harfle geçer, kişi değil).
 * YÖNETMENİN (arşivden önceki) senaryosu verilir: AI'a düşen sahnenin kartı arşivde silinir, kişi yine bilinir.
 * `ilkAd`: anlatım kişiyi yalnızca ilk adıyla da anıyor ("Harold marched north", "Napoleon") — künyede ilk adı tek başına
 * da onu adlandırır (namesIn kunye).
 * → [{ ad, parcalar: ["oleksiy", "ananenko"], ilkAd? }]
 */
export function peopleNames(script) {
  const out = new Map();
  const add = (ad) => {
    const parcalar = adParcalari(ad);
    const k = parcalar.join(" ");
    if (parcalar.length && !out.has(k)) out.set(k, { ad: String(ad).trim(), parcalar });
  };
  const scenes = script?.scenes || [];
  for (const s of scenes) {
    const kart = kisiAdi(s?.name, { tek: true });
    if (kart) add(kart);
    for (const w of [s?.who, s?.speaker]) { const ad = kisiAdi(w); if (ad) add(ad); }
  }
  const buyuk = new Set();
  const kucuk = new Set();
  for (const m of scenes.map((s) => String(s?.say || "")).join(" ").matchAll(/\p{L}+/gu)) (/^\p{Lu}/u.test(m[0]) ? buyuk : kucuk).add(adNorm(m[0]));
  // Cast anahtarı yalnızca kartı/alıntısı olmayan kişi için ("ananenko" zaten "Oleksiy Ananenko"nun parçası).
  const bilinen = () => new Set([...out.values()].flatMap((p) => p.parcalar));
  for (const k of Object.keys(script?.cast || {})) {
    for (const w of adParcalari(k.replace(/[_-]+/g, " "))) if (buyuk.has(w) && !kucuk.has(w) && !bilinen().has(w)) add(w[0].toUpperCase() + w.slice(1));
  }
  // Tek başına geçen büyük harfli sözcükler: ardından büyük harfli bir söz gelmiyor ("Harold had been waiting" evet;
  // "Imre Nagy", "Imre Sinkovits" hayır — Imre orada yalnızca ilk ad).
  const anlatim = scenes.map((s) => String(s?.say || "")).join(" \n ").normalize("NFC");
  const tekBasina = new Set([...anlatim.matchAll(/\p{Lu}\p{L}*(?!\p{L})(?![ \t]+\p{Lu})/gu)].map((m) => iskelet(adNorm(m[0]))));
  return [...out.values()].map((p) => (p.parcalar.length > 1 && tekBasina.has(iskelet(p.parcalar[0])) ? { ...p, ilkAd: true } : p));
}

/**
 * Harf çevirisi farkı ad farkı değildir: Commons künyesi "Ананенко Олексій" / "Борис Баранов", senaryo "Oleksiy Ananenko" /
 * "Borys Baranov". İskelet: y/iy/ій → i, kh → h, çift harf tek ("oleksiy" ~ "oleksii" → "oleksi", "borys" ~ "boris").
 */
const iskelet = (w) => w.replace(/kh/g, "h").replace(/iy|ij|yi|ii/g, "i").replace(/y/g, "i").replace(/(.)\1+/g, "$1");
const sozler = (t) => new Set(adNorm(t).split(" ").filter(Boolean).map(iskelet));

/*
 * ORTAK İLK AD BAŞKA KİŞİ DEĞİLDİR (inceleme, 27 Ekim 2026): ad parçalarından herhangi biri yetiyordu. Macaristan
 * 20261011-a5d8bf'te parlamento fotoğrafının stok etiketi "…, imre steindl" (binanın mimarı) Imre Nagy sayıldı, yazı
 * boşuna alt üçte bire indi; "Imre Nagy portrait.jpg" Imre Sinkovits'i de getirdi; Çernobil 20261026-24122a'da "Boris
 * Shcherbina" kartı Borys Baranov'u da sayıyordu (iskelet borys ~ boris) — Baranov'un yanlış resimdeki kartı fotoğrafına
 * taşınacağına "kartı zaten var" diye siliniyordu.
 *  - Aynı parçaları paylaşanlardan DAHA ÇOK parçası eşleşen kişi kalır ("Boris Shcherbina" → yalnızca Shcherbina).
 *  - kunye (Commons başlığı, stok etiketi, resmin kimliği): yalnızca ilk ad yetmez — soyadı ya da ilk ad dışındaki bir
 *    parça gerekir ("Lula" Luiz Inácio Lula da Silva'yı adlandırır), meğer anlatım kişiyi ilk adıyla anıyor olsun
 *    (ilkAd: "Bayeux Tapestry scene57 Harold death" Harold'dır).
 */
/** Metinde adı geçen kişiler (ad parçası tam sözcük olarak geçiyor; en iyi eşleşen kişi, künyede soyadı). */
export function namesIn(text, people = [], { kunye = false } = {}) {
  const toks = sozler(text);
  const hits = people.map((p) => ({ p, w: [...new Set(p.parcalar.map(iskelet))].filter((w) => toks.has(w)) })).filter((h) => h.w.length);
  const best = hits.filter((h) => !hits.some((o) => o.w.length > h.w.length && h.w.every((w) => o.w.includes(w))));
  return best.filter((h) => !kunye || h.p.parcalar.length < 2 || h.p.ilkAd || h.w.some((w) => w !== iskelet(h.p.parcalar[0]))).map((h) => h.p);
}

/*
 * GERÇEK AD AI İSTEMİNE GİTMEZ (inceleme, 27 Ekim 2026; Lula 20261026-29db03): ön izleme kapısı AI karesini yeniden
 * ürettirirken isteme anlatımı ekliyordu ("it must plainly show what the narration says: His opponent was Senator Flávio
 * Bolsonaro, of the PL, Jair Bolsonaro's eldest son.") — motor yüzü gizlese de gerçek kişinin adı görüntü modeline
 * gidiyordu. Anlatımdaki gerçek kişi adları önündeki unvanla birlikte "the person" olur, iyelik eki kalır: "His opponent
 * was the person, of the PL, the person's eldest son." Adsız anlatım aynen kalır (istem, dolayısıyla önbellek anahtarı).
 */
/*
 * İnceleme (27 Ekim 2026, gerçek işlerin anlatımı ve sıradaki İsrail videosu):
 *  - Cümle sonu dizinin sonudur: "…strikes on the Houthis. Trump declined." "…on the person declined." oluyor, "No reopening
 *    date for King Khalid. No word on…" iki cümleyi birleştiriyordu (Suudi–Husi 20261011-3c27b1). Baş harf ("Bernard L.
 *    Madoff") ve unvan kısaltması ("Dr.", "Adm.") cümle bitirmez.
 *  - Kısaltma (IMF, CEO, ECB) ad değildir: cast anahtarı "imf_chief" (20261015-3c14ff) anlatımdaki her "IMF"yi
 *    "the person" yapıyordu ("The person traced $1.4 trillion…").
 *  - Tireli ad ve "al-" önekli ad adın parçasıdır: "Ben-Gvir", "Baharav-Miara" hiç eşleşmiyordu; "Coalition spokesman
 *    the person al-Maliki" adın yarısını görüntü modeline bırakıyordu.
 */
const AD_SOZU = String.raw`(?:(?:al|el|ad|an|ar|as|ash|at|az|abu|abd|bin|ibn)[-‐])?\p{Lu}[\p{L}\p{M}'’.-]*`;
const AD_DIZISI = new RegExp(String.raw`(?<![\p{L}\p{M}'’-])${AD_SOZU}(?:[ \t]+(?:(?:da|de|do|dos|das|di|du|del|della|van|von|der|den|ter|bin|ibn|al|el|la|le)[ \t]+)?${AD_SOZU})*`, "gu");
const KISALTMA = new Set(["mr", "mrs", "ms", "dr", "prof", "rev", "sen", "rep", "gov", "gen", "adm", "col", "capt", "cpt", "lt", "sgt", "cmdr", "flt", "st", "jr", "sr", "mt", "ft", "vs"]);
/** Metindeki gerçek kişi adlarını (names: realCast, isim kartları; cast anahtarı da olur) "the person" yapar. */
export function hideNames(text, names = []) {
  const t = String(text || "").normalize("NFC");
  const parcalar = new Set((names || []).flatMap((n) => adNorm(String(n).replace(/_+/g, " ")).split(" "))
    .filter((w) => w.length >= 3 && !AD_DISI.has(w) && !AD_EKI.has(w) && !YER_ADI.has(w) && !/^\d+$/.test(w)).map(iskelet));
  if (!parcalar.size) return t;
  const yalin = (w) => w.replace(/(?:['’]s)?\.?$/u, "");
  const kok = (w) => adNorm(yalin(w));
  const var_ = (k) => parcalar.has(k) || (k.length > 3 && k.endsWith("s") && parcalar.has(k.slice(0, -1)));
  const adMi = (w) => {
    if (!/\p{Ll}/u.test(yalin(w))) return false;
    const k = kok(w).split(" ").filter((x) => x && !AD_EKI.has(x)).map(iskelet);
    return k.length > 0 && (k.some((x) => x.length >= 4 && var_(x)) || k.every(var_));
  };
  const cumleSonu = (w) => /\.$/u.test(w) && !/^(?:\p{Lu}\.)+$/u.test(w) && !KISALTMA.has(adNorm(w));
  return t.replace(AD_DIZISI, (butun) => {
    const p = butun.split(/([ \t]+)/);
    const parca = [];
    for (let k = 0, from = 0; k < p.length; k += 2) {
      if (k < p.length - 1 && !cumleSonu(p[k])) continue;
      parca.push(gizle(p.slice(from, k + 1).join("")));
      if (k + 1 < p.length) parca.push(p[k + 1]);
      from = k + 2;
    }
    return parca.join("");
  }).replace(/\b(?:(the)|an?)\s+the person/gi, (m, the) => (the ? `${the} person` : `${m[0] === "A" ? "A" : "a"} person`))
    .replace(/(^|[.!?]\s+)the person/g, "$1The person");
  function gizle(dizi) {
    const p = dizi.split(/([ \t]+)/); // çift: sözcük, tek: boşluk
    const soz = p.filter((_, k) => k % 2 === 0);
    const ad = soz.map(adMi);
    if (!ad.includes(true)) return dizi;
    const iyelik = (k) => /['’]s\.?$/u.test(soz[k]);
    // Adın önündeki unvan ve adın parçası olabilecek büyük harfli sözcükler ("Luiz Inácio" Lula'nın), sıradan sözcük değil
    // ("When", "Monday"); başkasının iyeliği ("Brazil's President Lula") dizinin dışında kalır.
    const katilir = (k) => AD_EKI.has(soz[k]) || UNVAN.has(kok(soz[k])) || !AD_DISI.has(kok(soz[k]));
    let a = ad.indexOf(true);
    let b = ad.lastIndexOf(true);
    while (a > 0 && !iyelik(a - 1) && katilir(a - 1)) a--;
    while (b < soz.length - 1 && !iyelik(b) && katilir(b + 1) && !UNVAN.has(kok(soz[b + 1]))) b++;
    // Başkasının iyeliğinden sonraki unvan dizide kalır: "Brazil's President the person".
    while (a < b && a > 0 && iyelik(a - 1) && UNVAN.has(kok(soz[a]))) a++;
    while (b > a && AD_EKI.has(soz[b])) b--;
    while (a < b && AD_EKI.has(soz[a])) a++;
    const ek = soz[b].match(/(?:['’]s)?\.?$/u)[0];
    return `${p.slice(0, 2 * a).join("")}the person${ek}${p.slice(2 * b + 1).join("")}`;
  }
}

/** Sahnenin künyesi: dosyasıyla eşleşen (ses klibi araya girince scene-N kayar), yoksa scene-i (docu.js sceneCredit). */
function kunyeOf(credits, s, i) {
  const file = s?.video || s?.image;
  return (file && Object.values(credits || {}).find((c) => c?.file === file)) || credits?.[`scene-${i}`] || null;
}

/** Kendi resmi olan sahne (motorun AI ürettiği dahil: imagePrompt ve bg yok; montajın kareleri). */
const resimli = (p) => !!p && !p.bg && !p.heldBg && !!(p.image || p.video || p.imagePrompt || (p.type === "montage" && (p.images?.length || p.imagePrompts?.length)));

/**
 * Yazının altındaki resmin sahnesi: kendi resmi, ya da bg "prev"/"next" ise motorun tuttuğu komşu resim (lib/produce.mjs
 * ile aynı arama: önceki/sonraki resimli sahne; "next" bulamazsa önceki). → { s, i, held } | null
 */
export function pictureOf(scenes = [], i) {
  const s = scenes[i];
  if (!s) return null;
  const back = () => { for (let j = i - 1; j >= 0; j--) if (resimli(scenes[j])) return { s: scenes[j], i: j, held: true }; return null; };
  if (s.bg === "next") {
    for (let j = i + 1; j < scenes.length; j++) if (resimli(scenes[j])) return { s: scenes[j], i: j, held: true };
    return back();
  }
  if (s.bg === "prev" || s.heldBg) return back();
  return resimli(s) ? { s, i, held: false } : null;
}

/**
 * Resmin kimliği (adların arandığı metin): yalnızca GERÇEK resimde — doğrulanmış isim kartı, künye başlığı/sayfası, ve
 * seçici isim kartıyla yüzü doğruladıysa (künyede face) aranan sorgu. AI resmi kimseyi göstermez: boş.
 */
function resimKimligi(p, c) {
  if (!p?.archived) return "";
  let sayfa = String(c?.sayfa || "");
  try { sayfa = decodeURIComponent(sayfa); } catch {}
  return [p.name, c?.eser, sayfa, Array.isArray(c?.face) ? p.search : ""].filter(Boolean).join(" ");
}

/** Gösterilen adların parçalarının hepsi resmin kimliğinde mi? Eksik kalan kişiler. */
function adlarResimdeDegil(shown, kimlik, people) {
  const s = sozler(shown);
  const k = sozler(kimlik);
  return people.filter((p) => {
    const gorunen = p.parcalar.map(iskelet).filter((w) => s.has(w));
    return gorunen.length > 0 && !gorunen.every((w) => k.has(w));
  });
}

/**
 * Resimde (yazının altında) yüz var mı → { at: [x, y] | null } | null. Derinlik katmanlı resimde motor yazıyı kişinin boş
 * tarafına zaten koyar: null.
 */
export function pictureFace(p, c, people = []) {
  if (!p || p.layers) return null;
  const at = Array.isArray(c?.face) ? c.face : p.name && Array.isArray(p.focus) ? p.focus : null;
  if (p.name || at) return { at };
  // Gerçek resimde tarif künyedir (Commons başlığı, stok açıklaması); AI resminde istemin kendisi.
  const tarif = p.archived ? String(c?.eser || c?.metin || "") : String(p.imagePrompt || "");
  if (YUZ_YOK.test(tarif) || DETAY.test(tarif)) return null;
  if (p.depth || p.cast?.length) return { at: null };
  if (p.archived && namesIn([c?.eser, c?.sayfa].join(" "), people, { kunye: true }).length) return { at: null };
  if (!YUZ_TARIFI.test(p.archived && !YAKIN_CEKIM.test(tarif) ? tarif.replace(KUNYE_UNVAN, " ") : tarif)) return null;
  if (UZAK_CEKIM.test(tarif) && !YAKIN_CEKIM.test(tarif)) return null;
  return { at: null };
}

/** Ekranda AD taşıyabilen yazı: isim kartı, kartın anahtar kelimesi (anahtar modda sözü), vuruş kelimesi, altyazı. */
export function shownName(s) {
  if (!s) return "";
  if (s.type === "photo") return [s.name, s.caption].filter(Boolean).join(" ");
  if (s.type === "words") return s.textMode === "none" ? "" : s.textMode === "key" ? String(s.keyword || s.text || "") : String(s.keyword || "");
  if (s.type === "slam") return [s.word, s.sub].filter(Boolean).join(" ");
  return "";
}

/*
 * AD YALNIZCA BAŞKASINI GÖSTEREN RESİMDEN KALKAR (inceleme, 27 Ekim 2026): kural adı "o kişi olmayan" her resimden
 * kaldırıyordu. Bakker 20261006-af567d sahne 11 "a young singer named Tammy Faye LaValley" karlı bir Michigan sokağının AI
 * resminde, Hastings 20261010-989df5 sahne 66 "not where Harold had been waiting" denizin stok görüntüsünde ("view of the
 * horizon in the sea while a sailboat") bütün yazısını kaybetti — o karelerde kimse yanlış tanıtılmıyordu. Ad artık
 * yalnızca resim bir yüz/kişi gösteriyorsa (pictureFace; derinlik katmanlı resim de kendi tarifiyle) ya da ne gösterdiği
 * bilinmiyorsa (künyesiz arşiv resmi, istemsiz resim) kalkar. Kişisiz istem, kişisiz Commons/stok başlığı yazıyı korur.
 */
function kisiYaDaBilinmez(pic, c, people) {
  const p = pic.s;
  if (pictureFace(p.layers ? { ...p, layers: undefined } : p, c, people)) return true;
  return !String(p.archived ? c?.eser || c?.metin || "" : p.imagePrompt || "").trim();
}

const BUYUK_YAZI = (s) => (s?.type === "words" && s.textMode !== "none" && !!(s.text || s.keyword))
  || (s?.type === "slam" && !!s.word)
  || (s?.type === "title" && !s.chapterCard && !s.rankCard && !!(s.title || s.kicker));

/**
 * KURALI UYGULAR (yerinde; saf — dosya, ağ, model yok). `people`: peopleNames(yönetmenin senaryosu).
 * `names` false (AI modu: yüzler cast portresi, kartın altına motor "canlandırma" yazar) ise yalnızca yazı yüzden iner.
 * → { low, top, dropped: [{scene, ad, what}], moved: [{from, to, ad}], keep: [sahne] }
 */
export function faceSafeText(scenes = [], { credits = {}, people = [], names = true, logFn = () => {} } = {}) {
  const rep = { low: 0, top: 0, dropped: [], moved: [], keep: [] };
  const kunye = (i) => kunyeOf(credits, scenes[i], i);
  const kimlik = (pic) => (pic ? resimKimligi(pic.s, kunye(pic.i)) : "");
  if (names && people.length) {
    // 1) İsim kartı: yalnızca kendi gerçek resminde ve o kişiyi gösteriyorsa. Değilse kişinin ilk doğrulanmış fotoğrafına.
    scenes.forEach((s, i) => {
      if (s?.type !== "photo" || !s.name) return;
      const own = !s.bg && !s.heldBg && s.archived ? { s, i } : null;
      const c = own ? kunye(i) : null;
      const kim = namesIn(s.name, people);
      if (own && (Array.isArray(c?.face) || !adlarResimdeDegil(s.name, resimKimligi(s, c), kim).length)) return;
      const { name: ad, role } = s;
      delete s.name;
      delete s.role;
      if (!kim.length) { rep.dropped.push({ scene: i, ad, what: "isim kartı" }); return; }
      const taken = scenes.some((x) => x?.name && namesIn(x.name, people).some((p) => kim.includes(p)));
      const j = taken ? -1 : scenes.findIndex((x, k) => k !== i && x?.type === "photo" && !x.name && x.archived && !x.bg && !x.heldBg
        && !adlarResimdeDegil(ad, resimKimligi(x, kunye(k)), kim).length && namesIn(resimKimligi(x, kunye(k)), kim, { kunye: true }).length);
      if (j >= 0) {
        Object.assign(scenes[j], { name: ad, ...(role ? { role } : {}) });
        rep.moved.push({ from: i, to: j, ad });
      } else rep.dropped.push({ scene: i, ad, what: "isim kartı" });
    });
    // 2) Kart/vuruş/altyazıdaki ad: altındaki resim o kişi değilse yazı kalkar (anlatım adı söyler).
    scenes.forEach((s, i) => {
      if (!s || !["photo", "words", "slam"].includes(s.type)) return;
      const yazi = s.type === "photo" ? String(s.caption || "") : shownName(s);
      const kim = namesIn(yazi, people);
      if (!kim.length) return;
      const pic = pictureOf(scenes, i);
      if (!pic) return; // düz zemindeki ad kimsenin yüzünde değil
      const eksik = adlarResimdeDegil(yazi, kimlik(pic), kim);
      if (!eksik.length) {
        // Doğru kişinin resmindeki ad: ara plan (başka resim) altına girmesin.
        if (s.type === "words" && s.textMode === "key" && !pic.held && !s.noInserts) { s.noInserts = true; rep.keep.push(i); }
        return;
      }
      // Resimde kimse yoksa ad kimseyi yanlış tanıtmaz: yazı kalır (kisiYaDaBilinmez).
      if (!kisiYaDaBilinmez(pic, kunye(pic.i), people)) return;
      const ad = eksik.map((p) => p.ad).join(", ");
      if (s.type === "photo") { delete s.caption; rep.dropped.push({ scene: i, ad, what: "altyazı" }); return; }
      if (s.type === "slam") {
        const word = s.word;
        delete s.word; delete s.sub; delete s.at;
        Object.assign(s, { type: "words", text: word, textMode: "none" });
        rep.dropped.push({ scene: i, ad, what: "vuruş" });
        return;
      }
      s.textMode = "none";
      rep.dropped.push({ scene: i, ad, what: "yazı kartı" });
    });
  }
  // 3) Yüzlü resmin üstündeki büyük yazı alt üçte bire (yüz alttaysa üst banda).
  scenes.forEach((s, i) => {
    if (!BUYUK_YAZI(s) || s.layers || s.textAt) return;
    const pic = pictureOf(scenes, i);
    if (!pic) return;
    const yuz = pictureFace(pic.s, kunye(pic.i), people);
    if (!yuz) return;
    s.textAt = yuz.at && yuz.at[1] >= FACE_LOW_Y ? "top" : "low";
    rep[s.textAt]++;
  });
  if (rep.low || rep.top) logFn(`Yazı yüzden iniyor: ${rep.low + rep.top} sahnede büyük yazı yüzlü resmin ${rep.top ? `alt üçte birinde (${rep.low}) ya da üst bandında (${rep.top})` : "alt üçte birinde"}`);
  for (const m of rep.moved) logFn(`İsim kartı "${m.ad}" sahne ${m.from + 1}'in resmi o kişi değil — kişinin gerçek fotoğrafına (sahne ${m.to + 1}) taşındı`);
  for (const d of rep.dropped) logFn(`Ad başka kişinin resminde: sahne ${d.scene + 1} ${d.what} ("${String(d.ad).slice(0, 60)}") kaldırıldı — resim o kişiyi göstermiyor`);
  return rep;
}

/**
 * KANCADA TAM EKRAN — başlıktan önceki (en çok ilk 20 sn) düşük çözünürlüklü GERÇEK görüntü motorda küçük bir kutu
 * olarak kalıyordu (Panama, Ekim 2026: Pereira deprem anı 792x720, ilk 4 sn ekranın ortasında pul gibi). Kancada
 * gerçek anın büyüklüğü netlikten önemlidir: 16:9 kırpılıp 1920x1080'e büyütülür. Dikey kaynak (kırpınca yarısı
 * gider) ve 640 px altı aday değildir. → hedef sahne indisleri.
 */
export function hookFillTargets(scenes = [], { withinSec = 20 } = {}) {
  const out = [];
  let t = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (!s || s.type === "title" || t > withinSec) break;
    const w = Number(s.videoW) || 0, h = Number(s.videoH) || 0;
    if (s.video && s.archived && w >= 640 && h > 0 && w / h >= 1 && (w < 1280 || h < 720)) out.push(i);
    t += sceneSec(s);
  }
  return out;
}
/** hookFillTargets'ı uygular: kırpılmış/büyütülmüş kopya `-fill.mp4` + karesi; sahnenin video alanları ona döner. */
export async function fillHookFootage(scenes, { publicDir, ffmpeg = "ffmpeg", logFn = () => {}, runner = run } = {}) {
  let n = 0;
  for (const i of hookFillTargets(scenes)) {
    const s = scenes[i];
    const src = path.join(publicDir, s.video);
    if (!fs.existsSync(src)) continue;
    const rel = s.video.replace(/\.[a-z0-9]+$/i, "") + "-fill.mp4";
    const out = path.join(publicDir, rel);
    const still = rel.replace(/\.mp4$/, ".jpg");
    try {
      if (!fs.existsSync(out)) {
        const w = s.videoW, h = s.videoH;
        const ch = Math.min(h, Math.round((w * 9) / 16 / 2) * 2);
        const cw = Math.min(w, Math.round((ch * 16) / 9 / 2) * 2);
        await runner(ffmpeg, ["-nostdin", "-y", "-v", "error", "-i", src, "-an", "-vf", `crop=${cw}:${ch}:(iw-${cw})/2:(ih-${ch})/2,scale=1920:1080:flags=lanczos,unsharp=5:5:0.6,setsar=1,fps=30`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2", out]);
        await runner(ffmpeg, ["-nostdin", "-y", "-v", "error", "-ss", "0.5", "-i", out, "-frames:v", "1", "-q:v", "2", path.join(publicDir, still)]);
      }
      Object.assign(s, { video: rel, image: still, videoW: 1920, videoH: 1080, imgW: 1920, imgH: 1080, fit: "cover" });
      n++;
    } catch (e) {
      logFn(`Kanca görüntüsü büyütülemedi (sahne ${i + 1}): ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  if (n) logFn(`Kanca: ${n} düşük çözünürlüklü gerçek görüntü tam ekrana büyütüldü`);
  return n;
}

/*
 * SAYAÇ YIL MI, ÖLÇÜ MÜ? (Kartal Yuvası, 24 Ekim 2026): "The house stood at 1,834 meters" sayacı (to 1834, etiket
 * "METERS ABOVE SEA LEVEL") yıl sayıldı, 5 kat ağırlıkla. 2026 haberinin ilk bölümü "1834 dönemi", hikâye "1939" oldu;
 * dönem denetimi binanın bugünkü 25 gerçek fotoğrafını "dönem dışı" diye reddetti, AI istemlerine "1834'te elektrik
 * ışığı yok" yazıldı. Sayaç yalnızca açıkça yılsa (s.year) ya da etiketi/anlatımı bir ölçü söylemiyorsa yıldır; yıl
 * binlik ayırıcıyla yazılmaz ("1,834").
 */
const OLCU = /\b(met(?:er|re)s?|feet|foot|ft|km|kilomet\w*|miles?|tons?|tonnes?|kg|kilos?|people|men|women|soldiers|troops|workers|crew|sailors|euros?|dollars?|pounds?|percent|altitude|above sea|sea level|deep|depth|high|height|long|wide|horsepower|rounds?|votes?|seats?|cases|deaths|dead)\b|%|€|\$|£/i;
export function counterYear(s) {
  if (s?.type !== "counter") return null;
  const to = Number(s.to);
  if (s.year) return Number.isFinite(to) ? to : null;
  if (!(Number.isInteger(to) && to >= 1000 && to <= 2029) || s.prefix || s.suffix || s.unit) return null;
  if (OLCU.test(`${s.label || ""} ${s.kicker || ""} ${s.caption || ""}`)) return null;
  const said = String(s.say || "");
  if (said.includes(to.toLocaleString("en-US"))) return null;
  const after = new RegExp(`\\b${to}\\b\\s*(\\S+(?:\\s+\\S+)?)`).exec(said);
  if (after && OLCU.test(after[1])) return null;
  return to;
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
    const sy = counterYear(s);
    if (sy) yillar.push(sy, sy, sy, sy, sy);
  }
  if (!yillar.length) return "";
  yillar.sort((a, b) => a - b);
  // Ana dönem: yılların ortancası; aralık ilk-son ("1971 (anlatım 1971–2016 arası)").
  const orta = yillar[Math.floor(yillar.length / 2)];
  return `${orta}${yillar[0] !== yillar.at(-1) ? ` (anlatım ${yillar[0]}–${yillar.at(-1)} arası)` : ""}`;
}
/** A scene's own years (digits in its search/text fields; a year counter 5×). */
function sahneYillari(s) {
  const yillar = [];
  const metin = [s.say, s.search, s.text, s.title, s.kicker, s.caption, s.role, ...(s.imagePrompts || []).map((p) => p?.search)].filter(Boolean).join(" ");
  for (const m of String(metin).matchAll(/\b(1\d\d\d|20[0-2]\d)\b/g)) yillar.push(+m[1]);
  const sy = counterYear(s);
  if (sy) yillar.push(sy, sy, sy, sy, sy);
  return yillar;
}
/** Bundan geniş (yıl) hikâye tek dönemle yargılanmaz. */
export const GENIS_HIKAYE_YIL = 150;
/**
 * Yüzyıllara yayılan hikâyede her sahnenin kendi dönemi (scene.era). Tek ortanca yıl yanlıştı: Kara
 * Ölüm (1338–2026) "1911" çıktı ve 2026 laboratuvar sahnesinin modern fotoğrafları "1911 ile
 * çelişiyor" diye reddedildi. Sahne kendi yılını taşıyorsa o; yoksa bölümünün dönemi; yılı hiç
 * geçmeyen bölüm, hikâye bugüne uzanıyorsa (ya da haber formatıysa) bugün. Geri sayım (her madde
 * kendi yılı), senaryonun kendi `era`sı ve elle verilmiş sahne `era`sı dokunulmaz.
 *
 * KARTAL YUVASI (24 Ekim 2026, haber): 7. bölüm 1952'yi (açılış yılı sayacı) anınca yılsız bütün satırları 1952 oldu — "The history
 * itself was told elsewhere" (1999'da açılan Dokumentation Obersalzberg) ve "Nobody has said what survived" (2026).
 * Dönem denetimi merkezin doğru fotoğrafını "modern cam bina" diye reddetti. Haberde planın arka plan bölümleri
 * (`background`: bölüm indeksleri, backgroundChapters) biliniyorsa yılsız satır tarihî yılı YALNIZCA arka plan
 * bölümünde alır; öteki bölümlerde bugündür. Rakamla yıl taşıyan satır her yerde kendi yılını alır.
 */
export function sceneEras(script, { now = new Date().getFullYear(), news = false, background = null } = {}) {
  if (!script?.scenes?.length || script.era || script.format === "ranking") return script;
  const all = script.scenes.flatMap(sahneYillari).sort((a, b) => a - b);
  const genis = all.length > 0 && all.at(-1) - all[0] >= GENIS_HIKAYE_YIL;
  if (!genis && !news) return script;
  const bugune = news || (all.length > 0 && all.at(-1) >= now - 5);
  const arkaPlan = news && Array.isArray(background) ? new Set(background.map(Number)) : null;
  const bolum = new Map();
  for (const s of script.scenes) {
    if (bolum.has(s.chapter)) continue;
    if (arkaPlan && !arkaPlan.has(Number(s.chapter))) { bolum.set(s.chapter, String(now)); continue; }
    const own = script.scenes.filter((x) => x.chapter === s.chapter);
    // Bugünde geçen bölüm geçmişe tek cümleyle döner ("1979'da da öyle denmişti"): o tek yıl bölümün
    // dönemi değildir. Yıl taşıyan sahne azsa (%15'ten az) bölüm bugündür; o sahne kendi yılını alır.
    // Planın arka plan bölümü bunu sormaz: bölümün kendisi geçmiştir.
    const yilli = own.filter((x) => sahneYillari(x).length).length;
    const d = bugune && !arkaPlan && yilli < own.length * 0.15 ? "" : hikayeDonemi({ scenes: own });
    bolum.set(s.chapter, d ? String(donemYili(d)) : bugune ? String(now) : "");
  }
  let n = 0;
  const scenes = script.scenes.map((s) => {
    if (s.era) return s;
    const own = sahneYillari(s).sort((a, b) => a - b);
    const era = own.length ? String(own[Math.floor(own.length / 2)]) : bolum.get(s.chapter);
    if (!era) return s;
    n++;
    return { ...s, era };
  });
  return n ? { ...script, scenes } : script;
}
/**
 * Haber planının arka plan bölümleri (docu-bible.json `value.chapters[i].background`, plan editörü dahil) → sahne
 * bölüm indeksleri. Plan haber planı değilse (alan yok) ya da bölüm sayısı senaryoya uymuyorsa null: bilinmiyor.
 */
export function backgroundChapters(bible, script = null) {
  const ch = bible?.chapters;
  if (!Array.isArray(ch) || !ch.some((c) => typeof c?.background === "boolean")) return null;
  if (Array.isArray(script?.chapters) && script.chapters.length !== ch.length) return null;
  return ch.flatMap((c, i) => (c?.background === true ? [i] : []));
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

function pickPrompt(scene, n, video = false, donem = "", konu = "") {
  // Hikâyenin adı: seçici satırı tek başına görüyordu ("police at the gates" → herhangi bir ülkenin polisi).
  const yer = konu ? [`Bu videonun hikâyesi: "${konu}". Kare bu hikâyenin geçtiği ülkeden/yerden olmalı (anlatıcı başka bir ülkeyi anmıyorsa).`] : [];
  const satirlar = [pickPromptBase(scene, n), ...yer, ...donemSatirlari(donem)].join("\n");
  return video ? [satirlar, ...videoPromptLines(scene)].join("\n") : satirlar;
}

/*
 * KAREDEKİ YAZI VE YER DE KANITTIR (17 Ekim 2026, Ebola ilk render'ı): seçici Ebola aşısı anlatılırken "COVID" yazan
 * şişeleri, Ebola ölüm oranı anlatılırken arka plandaki TV'de başka bir haber (CNN, Suudi cinayeti) akan haber odasını
 * ve Doğu Kongo anlatılırken karlı bir Alp köyünü seçti. Fotoğrafın içinde okunan yazı ve görünen coğrafya da konuyu
 * söyler.
 */
export const SCENE_TRUTH_LINES = [
  "karede OKUNAN yazı başka bir konuyu söylüyorsa uygunsuz: ekranında başka bir haber akan TV/monitör (haber bandı, yayın), başka bir hastalığın, ürünün ya da ülkenin adını taşıyan etiket/tabela/şişe (Ebola anlatılırken 'COVID' yazan aşı şişeleri)",
  "karedeki coğrafya ve iklim anlatılan yerle çelişiyorsa uygunsuz (Orta Afrika anlatılırken karlı dağ, Alp köyü, Avrupa tarlası; çöl anlatılırken orman)",
  // Fransa videosu (21 Ekim 2026, izleyici notu): Fransız okul kapısı anlatılırken "POLICIA" yazılı polis, Fransız
  // istihbaratı anlatılırken NYPD araçları, République anlatılırken Amerikan K-9 Crown Victoria, Avrupa okulları
  // anlatılırken Arapça yazılı yıkık oda; çenesi kırılan çocuğun "pipetle beslendiği" satırında kokteyl bardağı.
  "karede BAŞKA bir ülkenin polisi, üniforması, polis aracı, bayrağı, tabelası ya da yazısı görünüyorsa uygunsuz — anlatıcı o ülkeyi anmıyorsa (Fransa anlatılırken 'POLICIA', 'NYPD', Amerikan polis arabası ya da K-9 aracı, ABD protesto tabelaları; Avrupa anlatılırken Arapça yazılı duvar). Hikâye bir ülkede geçiyorsa insanlar, araçlar ve yazılar o ülkenin olmalı",
  "satırın DUYGUSU korunur ve söz kelimesi kelimesine resmedilmez: trajik ya da acı bir satırda bar, kokteyl, parti, yemek, tatil karesi uygunsuz ('ameliyattan sonra yalnızca pipetle beslenebildi' satırına kokteyl bardağındaki pipet değil; hastane, ameliyat sonrası bakım ya da o çocuğun hikâyesine ait bir kare)",
  // Gimli Glider (28 Ekim 2026): "emekliliğe yakın yorgun bir uçak değildi" satırına seçici, uçağın 2008'de Mojave'de
  // depoda çekilmiş fotoğrafını koydu ("2008 anlatım aralığında" diye) — doğru uçak, yanlış an.
  // Husi–Suudi haberi (28 Ekim 2026): 10:27'deki bölüm kartı Husilerin sloganını ("Amerika'ya ölüm, İsrail'e ölüm,
  // Yahudilere lanet") tam ekran gösterdi — reklam dostu değil, anlatım da onu okumuyordu.
  "karede OKUNAN nefret ya da ölüm sloganı (\"Death to America\", \"Curse on the Jews\", bir grubu hedef alan pankart) uygunsuz: reklam dostu değil ve anlatıcı onu okumuyor; hareketin kendisi bayrak, kalabalık ya da lideriyle gösterilir",
  "kare satırın anlattığı ANI göstermeli: satır bir şeyi yeni, genç ya da ilk hâliyle anlatıyorsa yıllar sonraki (emekli, depoda, yıkık, yaşlanmış) hâlinin fotoğrafı uygunsuz; satır sonunu anlatıyorsa ilk günlerinin fotoğrafı da öyle — hikâyenin başka bir yılı 'anlatım aralığında' diye kabul edilmez",
];

function pickPromptBase(scene, n) {
  if (scene.source === "stock") {
    // Genel atmosfer karesi (yağmurlu cam, fırtınalı deniz): kimlik değil, his ve dönem uyumu önemli.
    return [
      `Bir YouTube belgeselinde bir atmosfer/ara plan karesi seçiyorsun (stok fotoğraf).`,
      `Anlatıcı: "${stripTags(scene.say)}"`,
      `İstenen görüntü: ${scene.search}${scene.imagePrompt ? ` — tarif: ${scene.imagePrompt}` : ""}`,
      ``,
      `${n} aday var (Aday 1..${n}). Sahneye en SİNEMATİK ve en uygun olanı seç: ruh hâli, ışık, kompozisyon.`,
      // Bakker (Ekim 2026): "para sayan eller" her finans videosuna uyar, bu hikâyeye değil.
      `Önce anlatıcının söylediği şeyi GÖSTEREN aday (söylenen nesne, eylem, yer); yalnızca havası benzeyen jenerik kare (para sayan eller, boş koridor, gökyüzü, şehir silüeti) ancak hiçbiri göstermiyorsa.`,
      `Şunlar UYGUNSUZ, seçme: dönemle çelişen modern nesneler (1900'ler anlatılırken akıllı telefon, modern araba, LED), gülümseyen poz vermiş "stok" insanlar, filigran/logo/yazı, illüstrasyon ya da 3D render, bulanık/küçük kareler.`,
      ...SCENE_TRUTH_LINES,
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
    ...SCENE_TRUTH_LINES.map((l) => `- ${l}`),
    // Video 16:9 ve tam ekran: iki doğru aday arasında küçük tarama büyütülünce bulanıklaşır.
    `Birden çok aday konuyu EŞİT derecede doğru gösteriyorsa piksel boyutu BÜYÜK olanı seç (boyutlar aday etiketlerinde); o da eşitse yatay kadrajlı olanı — video 16:9 ve tam ekran gösterilecek.`,
    ...(ad ? [
      ``,
      `Bu fotoğrafın altına İSİM KARTI basılacak: ${ad}.`,
      `Bu kişi fotoğrafın açık ANA KONUSU olmalı ve yüzü görünmeli. Doğru adaylar arasında o kişinin yüzü net olanı tercih et.`,
      `Seçtiğin karede kişi kalabalığın/grubun içinde, arka planda ya da küçük kalıyorsa (ya da kare bir mekânı/nesneyi gösteriyorsa) namedPersonIsMainSubject=false döndür — fotoğraf yine kullanılır ama isim kartı kaldırılır.`,
      `Seçtiğin fotoğrafta bu kişinin YÜZÜNÜN konumunu ver: faceX (0 sol – 1 sağ), faceY (0 üst – 1 alt). Fotoğraf 16:9 kadraja kırpılınca kamera oraya yönelir; yüz kadraj dışında kalmaz.`,
    ] : [`Bu sahnede isim kartı yok: namedPersonIsMainSubject=true, faceX=0.5, faceY=0.35 döndür.`]),
    `Hiçbiri gerçekten uymuyorsa 0 döndür — yanlış fotoğraf göstermek, AI ile canlandırmaktan KÖTÜDÜR.`,
  ].join("\n");
}

/** Görme kararı: OpenAI anahtarı varsa onunla (Anthropic kredisi bittiğinde de çalışır), yoksa Claude ile. */
/** Exported for the picker A/B test (scratchpad vision-ab); the pipeline calls it through `pick`. */
export async function visionPick(scene, thumbs, { settings, usage, logFn, titles = [], sizes = [], video = null }) {
  const prompt = pickPrompt(scene, thumbs.length, !!video, settings._donem || "", settings._konu || "");
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
  // Görsel analiz modeli (settings.visionModel, varsayılan gpt-6-luna) GPT ise seçici OpenAI'den; Claude ise Claude'dan.
  const gorselGpt = /^gpt-/.test(String(settings.visionModel || "")) && !!settings.openaiKey;
  const claudeIle = settings.docuPicker ? settings.docuPicker === "claude" : !gorselGpt && !!settings.anthropicKey;
  if (claudeIle && settings.anthropicKey) {
    try {
      return await callVisionJSON({
        system: "Sen titiz bir belgesel görsel editörüsün. Yalnızca istenen JSON'u döndür.",
        user: prompt,
        schema: PICK_SCHEMA,
        images: thumbs.map((t, i) => ({ etiket: label(i), data: t.toString("base64"), mediaType: "image/jpeg" })),
        // Gerçek kişi/olay: Opus 5.5 — kimlik, yüz, dönem burada belirlenir (Bakker'ın "şaheser" görsellerini
        // Opus kontakt sayfalarından seçmişti; Nova Sonnet'le seçiyordu). Stok (atmosfer): çağıran Sonnet 5.5 koyar.
        model: settings.claudeVisionModel || "claude-opus-5-5",
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
      // Video ızgarasında 9 küçük kare var: "low" (512 px) onları okunmaz yapar. Fotoğrafta da "high": 512 px'te
      // yüz, üniforma, tabela, başlık okunmuyordu — kimlik seçimi kör yapılıyordu.
      content.push({ type: "input_image", image_url: `data:image/jpeg;base64,${t.toString("base64")}`, detail: video ? "auto" : settings.openaiVisionDetail || "high" });
    });
    const DENEME = 5;
    const geriCekil = (attempt) => 3000 * attempt + Math.random() * 1000;
    // Arşiv (kimlik önemli): gpt-6-sol. Stok için çağıran settings'e gpt-6-luna koyar.
    // (gpt-4.1-mini Apollo 13 testinde başlığında "Apollo 17" yazan fotoğrafı seçmişti:
    // gerçek kişi/olayda ucuz model kullanılmaz.)
    const model = settings.openaiVisionModel || (gorselGpt ? settings.visionModel : "gpt-6-sol");
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
  // "al-Houthi", "el-Sisi", "bin-Salman" are surnames. Houthi–Saudi news, 28 Oct 2026: the lowercase particle
  // dropped the surname ("Mohammed Ali al-Houthi Sanaa" → "Mohammed Ali Sanaa"), and the name card fell to AI.
  const cap = (w) => /^[A-ZÇĞİÖŞÜ]/.test(w) || /^(?:al|el|ad|an|ar|as|ash|at|az|bin|ibn|abu|abd)-[A-ZÇĞİÖŞÜ]/.test(w);
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
const KLIP_UA = UA;
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
 * Bir fotoğraf adayının "uygun değil" anahtarları: dosya adresi; tek fotoğraflık stok sayfasında (Pixabay, Pexels,
 * Unsplash) sayfası da — Pixabay'in imzalı dosya adresi her aramada değişir, sayfası değişmez (media.js stablePhotoRefs).
 */
const fotoAnahtarlari = (a) => (tekFotoSayfasi(a) ? adayAnahtarlari(a) : [photoKey(a.url)]);
/** Aday kümesindeki kimlik (küme kararı, seçilen aday): tek fotoğraflık stok sayfasında sayfa, değilse dosya adresi. */
const adayKimligi = (a) => (tekFotoSayfasi(a) ? sayfaAnahtari(a) : photoKey(a.url));
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
  // paylaşılabilir (müze nesnesinin başka görünüşleri), yalnızca dosya adresi — tek fotoğraflık stok sayfası hariç.
  if (h?.url) for (const k of cacheKey.startsWith("v-") ? adayAnahtarlari(h) : fotoAnahtarlari(h)) m.bad[k] = now;
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
// Word forms count: "snowy Siberia at dusk", "foggy harbour", "a test tube cracks", "flickering light" (Black Death
// opening: "snowy" missed "snow" and no opening scene moved). But "window" is not wind: wind\w* sent a café still
// lit through a window to Kling as a climax shot (Panama, Oct 2026).
const HAREKET = /\b(sea|ocean|waves?|surf|storm\w*|fire|flames?|smok\w*|fog\w*|mist\w*|rain\w*|snow\w*|blizzard|crowds?|march(?:ing)?|charg(?:e|ing)|battle|train|locomotive|steam\w*|ships?|sails?|river|waterfall|clouds?|horses?|cavalry|banners?|flags?|candles?|lanterns?|explosions?|dust\w*|wind(?:s|y|blown|swept)?|torrent|crack(?:s|ing)?|shatter\w*|spill\w*|flicker\w*|sirens?|blue lights?|taiga)\b/i;
/**
 * Doruk hareketi: açılıştan sonra, hikâyenin en gergin anlarından en çok `max` AI karesi resimden videoya
 * (ucuz model; motor scene.aiMotion === "climax" görünce Kling 2.5 Turbo 720p ister). Seçim: gerçek klibi ya da
 * arşiv fotoğrafı olmayan, kişi/isim kartı taşımayan, hareket edebilecek bir şey gösteren (deniz, duman, kalabalık…)
 * tension/dread/triumph sahneleri, en yüksek yoğunluklu bölümlerden; aynı bölümden ikisi değil.
 */
export function climaxMotionTargets(script, { max = 2, intensity = [] } = {}) {
  const scenes = script?.scenes || [];
  const cands = scenes
    .map((s, i) => ({ s, i, ch: s.chapter ?? 0 }))
    .filter(({ s, ch }) => ch > 0 && !s.aiMotion && ["photo", "words"].includes(s.type) && !s.video && !s.archived && s.imagePrompt
      && !s.cast?.length && !s.name && !s.bg && !s.images?.length && !s.imagePrompts?.length && !s.annotate
      && ["tension", "dread", "triumph"].includes(s.mood) && HAREKET.test(s.imagePrompt))
    .sort((a, b) => (Number(intensity[b.ch]) || 0) - (Number(intensity[a.ch]) || 0) || b.ch - a.ch || a.i - b.i);
  const used = new Set();
  let n = 0;
  for (const c of cands) {
    if (n >= max) break;
    if (used.has(c.ch)) continue;
    c.s.aiMotion = "climax";
    used.add(c.ch);
    n++;
  }
  return n;
}

export function openingMotionTargets(script, { max = 2, within = 6 } = {}) {
  let n = 0;
  const scenes = script?.scenes || [];
  for (let i = 0; i < Math.min(within, scenes.length) && n < max; i++) {
    const s = scenes[i];
    if ((s.chapter ?? 0) !== 0) break;
    // The title's backdrop plays a clip too (Backdrop clip): the film's first still is the one that should move.
    if (!["photo", "words", "title"].includes(s.type) || s.video || s.archived || !s.imagePrompt) continue;
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
/**
 * A Commons file the script names exactly ("File:Stena Impero 2019-07-21 02.jpg"): fetched straight from
 * the Commons API, no search and no picker, only when its licence is usable (the same rule as every
 * archive pick). Saved like an archive pick (2560 px ceiling). Returns { file, imgW, imgH, credit },
 * { reason } when the file exists but cannot be used, or null when there is no such file.
 */
export async function commonsFile(title, { publicDir, buildPrefix, ffmpeg = "ffmpeg", deps = {} }) {
  const t = String(title || "").trim().replace(/^(File|Image):/i, "");
  if (!t) return null;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + t)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=2560&format=json`;
  const data = await (deps.fetchJson || fetchJson)(api, { timeoutMs: 20000, deneme: 4 });
  const page = Object.values(data?.query?.pages || {}).find((p) => p.imageinfo?.[0]);
  if (!page) return null;
  const ii = page.imageinfo[0];
  if (ii.mime && !/^image\/(jpeg|png|webp|tiff|gif)/i.test(ii.mime)) return { reason: `görsel değil (${ii.mime})` };
  const meta = commonsMetadata(ii, page.title);
  if (!meta.permissionVerified) return { reason: `lisans uygun değil (${meta.lisans || "belirsiz"})` };
  const url = ii.thumburl || ii.url;
  const rel = `${buildPrefix}/cm-${hash(page.title)}.jpg`;
  const hedef = path.join(publicDir, rel);
  if (!fs.existsSync(hedef)) {
    fs.mkdirSync(path.dirname(hedef), { recursive: true });
    const raw = `${hedef}.bin`;
    await (deps.download || downloadFile)(url, raw, { timeoutMs: 60000, expect: "image" });
    try { await (deps.run || run)(ffmpeg, ["-y", "-i", raw, "-frames:v", "1", "-vf", OLCEK, "-q:v", "2", hedef], { timeoutMs: 60000 }); } finally { fs.rmSync(raw, { force: true }); }
  }
  const b = fs.existsSync(hedef) ? imageSize(fs.readFileSync(hedef)) : null;
  const kayit = { provider: "wikimedia", url, sourceUrl: url, ...meta, file: rel };
  return { file: rel, ...(b ? { imgW: b.w, imgH: b.h } : {}), credit: { ...selectedProvenance(kayit), ...kayit, modifications: DOCU_MODS } };
}

export async function resolveArchive(docu, { dir, publicDir, buildPrefix, settings, usage, logFn = () => {}, isCancelled = () => false, onProgress = () => {}, deps = {}, rejected = null, aiOnly = null }) {
  const reddedilen = new Set([...(rejected || [])].filter(Boolean).map((u) => photoKey(u)));
  const yalnizAi = new Set([...(aiOnly || [])].map(String));
  const reddedildi = (u) => reddedilen.size > 0 && !!u && reddedilen.has(photoKey(u));
  const search = deps.search || searchQuery;
  /*
   * SEÇİM KUTUSU (docu-pick-inbox.js): an answered set is taken from the box; when the picker's credit runs out the
   * remaining sets go to the box as contact sheets instead of stopping the job, and the pass ends asking for them.
   * On by default (Ayarlar: docuManualPick=false turns it off); a test passing its own picker turns it on explicitly.
   */
  const inboxOn = dir && (settings?.docuManualPick === true || (settings?.docuManualPick !== false && !deps.pick));
  const inbox = inboxOn ? (deps.pickInbox || pickInbox)(dir, { ffmpeg: settings?.ffmpegPath || "ffmpeg" }) : null;
  const basePick = deps.pick || visionPick;
  let manualPicks = false;
  const pick = async (scene, thumbs, opts = {}) => {
    const k = inbox ? inbox.keyOf(scene, opts) : null;
    if (inbox?.answered(k)) return inbox.answer(k);
    if (!manualPicks) {
      try {
        return await basePick(scene, thumbs, opts);
      } catch (e) {
        if (!inbox || !/kota\/kredi bitti/.test(String(e?.message || ""))) throw e;
        manualPicks = true;
        logFn(`Arşiv seçicisinin kredisi bitti (${String(e.message).split(":")[0]}): kalan seçimler seçim kutusuna yazılıyor`);
      }
    }
    inbox.ask(k, scene, thumbs, opts);
    throw Object.assign(new Error("elle seçim bekleniyor"), { manualPick: true });
  };
  const download = deps.download || fetchWithRetry;
  const downloadVideo = deps.downloadVideo || deps.download || videoIndir;
  const footageSearch = deps.footageSearch || (deps.search ? null : ekGoruntuKaynaklari);
  const girdi = deps.input || ((u) => u);
  // Hikâyenin söylediği ülkeler: başka ülkenin stok klibi/fotoğrafı aday listesine girmez (foreignPlaceConflict).
  const placeGroups = storyPlaceGroups([docu?.title, ...(docu?.chapters || []).map((c) => (typeof c === "string" ? c : c?.title)), ...(docu?.scenes || []).map((x) => [x?.say, x?.search, x?.caption, x?.text, x?.title].filter(Boolean).join(" "))].filter(Boolean).join(" "));
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
  const kumeAnahtari = (liste, video) => hash(`${video ? "v" : "p"}|${liste.map(adayKimligi).join("\n")}`);
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
      const sira = k.c ? liste.findIndex((a) => adayKimligi(a) === k.c) + 1 : 0;
      if (!k.c || sira > 0) {
        kayittanKarar++;
        return { choice: sira, reason: k.r || "", namedPersonIsMainSubject: k.nm !== false, segment: k.seg || 1, ...(Array.isArray(k.f) ? { faceX: k.f[0], faceY: k.f[1] } : {}), kayittan: true };
      }
    }
    const karar = await sor();
    const secim = Math.trunc(Number(karar?.choice) || 0);
    const c = liste[secim - 1];
    if (c) m.sets[kume] = { c: adayKimligi(c), r: String(karar.reason || "").slice(0, 300), nm: karar.namedPersonIsMainSubject !== false, seg: Math.max(1, Math.trunc(Number(karar.segment) || 1)), at: Date.now(), ...(yuzOf(karar) ? { f: yuzOf(karar) } : {}) };
    else for (const a of liste) for (const k of video ? adayAnahtarlari(a) : fotoAnahtarlari(a)) m.bad[k] = Date.now();
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
  /*
   * ADIYLA COMMONS (Ekim 2026: Hürmüz, Irkutsk, Yom Kippur, Nvidia videoları elle böyle yapıldı). Güncel bir
   * olayda doğru kare çoğu zaman Commons'ta adıyla bellidir: ABD Donanması/DVIDS, hükümet ve ajans
   * fotoğrafları. Senaryo `commons: "File:..."` yazdıysa arama ve (ücretli) seçici atlanır, o dosya alınır.
   * Dosya yoksa ya da lisansı uygun değilse sahne her zamanki aramasına düşer. Aynı dosya ikinci bir
   * sahneye verilmez (Yom Kippur: kanal geçişi fotoğrafı üç sahnede tekrar ediyordu).
   */
  const adiyla = new Set();
  const adiylaDosya = new Set();
  for (let i = 0; i < script.scenes.length; i++) {
    const s = script.scenes[i];
    const ad = String(s.commons || "").trim();
    if (!ad || !NAMED_TYPES.has(s.type) || yalnizAi.has(String(i))) continue;
    // Gimli Glider (28 Ekim 2026): "(cropped)" kopyası ayrı dosya sayılıyordu, Toronto fotoğrafı iki sahneye gitti.
    const k = commonsKey(ad);
    if (adiylaDosya.has(k)) { logFn(`Commons dosyası ikinci kez istendi, bu sahne arama yapacak: ${ad}`); continue; }
    try {
      const got = await commonsFile(ad, { publicDir, buildPrefix, ffmpeg: settings.ffmpegPath || "ffmpeg", deps });
      if (!got?.file) { logFn(`Commons dosyası kullanılamadı (${got?.reason || "yok"}), sahne aranacak: ${ad}`); continue; }
      if (reddedildi(got.credit?.url) || reddedildi(got.credit?.sayfa)) { logFn(`Commons dosyası daha önce reddedildi, sahne aranacak: ${ad}`); continue; }
      s.image = got.file;
      s.archived = true;
      // Gimli 9ff721 önce/sonra, 29 Ekim 2026: gerçekten siyah-beyaz kaynak işaretlenir (motor ona soluk notu verebilir);
      // renkli Commons fotoğrafı bölümün mono/duotone notuyla griye boyanmaz. Diskteki dosya ölçülür, indirme yok.
      markMonoSource(s, path.join(publicDir, got.file), { ffmpeg: settings.ffmpegPath || "ffmpeg" });
      if (got.imgW > 0 && got.imgH > 0) {
        s.imgW = got.imgW;
        s.imgH = got.imgH;
        if (ODAK_TIPLER.has(s.type) && !s.focus && got.imgW / got.imgH < DIKEY_ORAN) s.focus = [0.5, 0.3];
      }
      credits[`scene-${i}`] = got.credit;
      adiyla.add(i);
      adiylaDosya.add(k);
    } catch (e) {
      if (isCancelled()) throw new Error("cancelled");
      logFn(`Commons dosyası alınamadı (${String(e?.message || e).slice(0, 80)}), sahne aranacak: ${ad}`);
    }
  }
  if (adiyla.size) logFn(`Senaryonun adıyla istediği ${adiyla.size} Commons dosyası doğrudan alındı (arama ve seçici yok)`);
  const targets = [...script.scenes.map((s, i) => ({ s, i })), ...montajKareleri]
    .filter(({ i }) => !adiyla.has(i))
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
  // Adıyla alınan Commons dosyaları da bu videoda kullanıldı. Kartal Yuvası (24 Ekim 2026): yalnızca adiylaDosya'ya
  // yazılıyordu; dosyayı ikinci kez isteyen sahnenin araması aynı fotoğrafı (Openverse/upload adresiyle) yeniden seçti,
  // üç fotoğraf iki kez ekrana geldi. Künyenin sayfası da anahtar: thumb adresi upload adresiyle eşleşmeyebilir.
  // Gimli Glider (28 Ekim 2026): the by-name file was reserved without its picture hash and without its Flickr id, so
  // the search took the Flickr copy of the same photo for the title card. Both are reserved now.
  for (const i of adiyla) {
    const c = credits[`scene-${i}`];
    const img = script.scenes[i]?.image;
    const dh = img && fs.existsSync(path.join(publicDir, img)) ? await dosyaOzeti(ffmpeg, path.join(publicDir, img), path.join(tmp, `adiyla-${i}.gray`)) : null;
    for (const k of [photoKey(c?.url), photoKey(c?.sayfa), sayfaAnahtari(c), photoTwinKey(c?.eser, c?.url, c?.sayfa)]) if (k) ayir(k, dh);
  }
  const ikizKullanildi = (x) => { const k = photoTwinKey(x?.eser, x?.url, x?.sayfa); return !!k && ayrilan.has(k); };
  const ikiziAyir = (x, dh) => { const k = photoTwinKey(x?.eser, x?.url, x?.sayfa); if (k) ayir(k, dh); };

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
          .filter((a) => !foreignPlaceConflict(placeGroups, `${a.eser || ''} ${a.metin || ''} ${a.sayfa || ''}`))
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
        const secimAyari = { ...settings, _donem: donemOf(s), _konu: docu?.title || "" };
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
      if (kullanildi(pk, h.dhash) || ikizKullanildi(h)) {
        logFn(`Aynı fotoğraf önbellekte iki sahneye yazılmış; "${s.search}" için yeniden aranacak`);
        delete cache[key];
        degisti = true;
        continue;
      }
      ayir(pk, h.dhash);
      ikiziAyir(h, h.dhash);
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
              if (!e?.manualPick) logFn(`Görüntü araması başarısız (${String(e.message).slice(0, 100)}), sahne için fotoğrafa bakılıyor; sonraki denemede yeniden aranacak`);
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
            // Klibin afişi ölçülür (siyah-beyaz arşiv filmi → scene.monoSource; Gimli 9ff721, 29 Ekim 2026).
            markMonoSource(s, path.join(publicDir, vhit.file || vhit.video), { ffmpeg });
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
            // A name card also searches the person's name alone: Commons files are titled by the name, and a place word
            // ("Mohammed Ali al-Houthi Sanaa", "Tommy Pigott State Department spokesperson") keeps them out of the results.
            const sorgular = [...new Set([s.search, simplerQuery(s.search), s.name ? String(s.name).trim() : null].filter(Boolean))];
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
                .filter((a) => a.type !== "video" && a.url && !ayrilan.has(photoKey(a.url)) && !ikizKullanildi(a) && !reddedildi(a.url) && !reddedildi(a.sayfa))
                // Aynı dosyanın iki adresi aynı listede: küçük resmi iki kez indirmeye gerek yok.
                .filter((a) => { const k = photoKey(a.url); if (listede.has(k)) return false; listede.add(k); return true; })
                .filter((a) => !numberedNameConflict(s.search, a.eser || a.metin))
                .filter((a) => !foreignPlaceConflict(placeGroups, `${a.eser || ''} ${a.metin || ''} ${a.sayfa || ''}`))
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
              // Stok (genel atmosfer) sahnesinde kimlik riski yok: Sonnet 5.5 yeter (Haiku 4.5 kaldırıldı, kanal
              // sahibi Ekim 2026) — ama 1990 öncesi hikâyede değil: Haiku Ryanair logolu jeti 1971'e koymuştu
              // (Cooper QA). Orada ve gerçek kişi/olay (archive) sahnesinde tam model (Opus 5.5 / ayardaki).
              const secimAyari = s.source === "stock" && !eskiOf(s) ? { ...settings, _donem: donemOf(s), _konu: docu?.title || "", openaiVisionModel: settings.openaiStockVisionModel || "gpt-6-luna", claudeVisionModel: settings.claudeStockVisionModel || "claude-sonnet-5-5" } : { ...settings, _donem: donemOf(s), _konu: docu?.title || "" };
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
              if (c && (kullanildi(photoKey(c.url), cOzet) || ikizKullanildi(c))) {
                c = null;
                raced = true;
                if (yarisTekrari++ < 1) qi--; // aynı sorgu, kalan adaylarla bir kez daha
                continue;
              }
              if (c) { reserved = photoKey(c.url); ayir(reserved, cOzet); ikiziAyir(c, cOzet); break; }
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
              if (s.name && yuzOf(karar)) hit.face = yuzOf(karar);
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
            if (!e?.manualPick) logFn(`Arşiv araması başarısız (${String(e.message).slice(0, 100)}), sahne bu sefer AI'a düşüyor; sonraki denemede yeniden aranacak`);
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
          // Gerçekten siyah-beyaz arşiv fotoğrafı → scene.monoSource (Gimli 9ff721 önce/sonra, 29 Ekim 2026); renkli kalır renkli.
          markMonoSource(s, path.join(publicDir, hit.file), { ffmpeg });
          if (hit.imgW > 0 && hit.imgH > 0) {
            s.imgW = hit.imgW;
            s.imgH = hit.imgH;
            // Dikey/kareye yakın arşiv fotoğrafında kamera yüzün olduğu üst üçte bire
            // yönelsin; merkez kırpma başı kesiyordu. Senaryo odak verdiyse ona dokunulmaz.
            // İsim kartında kamera kişinin YÜZÜNE yönelir (seçicinin bildirdiği konum): Yom Kippur'da Sadat'ın
            // 1971 fotoğrafı yalnızca başının üstü görünecek şekilde kırpılmıştı.
            if (ODAK_TIPLER.has(s.type) && !s.focus && s.name && Array.isArray(hit.face)) s.focus = hit.face;
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
  // Seçim kutusu: kredisi biten seçicinin bıraktığı kümeler — geçiş "bitti" sayılmaz (docu-archive-done.json yazılmaz),
  // bulunanlar kayıtlı kalır; seçimler yazılıp devam edilince yalnızca bekleyen sahneler yeniden sorulur.
  if (inbox?.pendingCount()) {
    const n = inbox.writeList();
    throw Object.assign(new Error(`${n} arşiv seçimi bekleniyor (seçicinin kredisi yok) — ${inbox.files.list} içindeki kümelerin sayfalarına bakıp ${inbox.files.answers} dosyasına aday numaralarını yaz ve "Kaldığı yerden devam et". Bulunan ${Object.keys(credits).length} gerçek görsel korunuyor.`), { manualPicks: n });
  }
  return { script, credits };
}

// SANAT YÖNETMENİ (Sinematik Belgesel)
//
// Kurgu yönetmeninin kardeşi: kurgu yönetmeni "bu an hangi cihazı hak ediyor"
// sorusunu, sanat yönetmeni "bu video NASIL GÖRÜNMELİ" sorusunu cevaplar:
//   - script.look = {variant}: türün görünüm varyantı (docu-engine/looks-catalog.json;
//     dosya yoksa aşağıdaki yedek liste). Aynı türün SON 3 videosundan farklı olmak
//     zorunda: <NOVA_HOME>/data/docu-look-history.json.
//   - script.chapterLooks[]: bölüm başına renk yolculuğu (sıcak → soğuk suç anı →
//     kırmızı doruk), bölümün temel renk derecelendirmesi ve arka plan zemini.
//   - sahne başına: textStyle (yazı sahneleri), backdrop (resmin üstünde olmayan
//     yazı/sayaç/grafik/alıntı/zaman çizelgesi), grade (resimli sahneler), fx, transition.
//
// ÇEŞİTLİLİK KURALLARI (kodla uygulanır — model ne önerirse önersin plan onarılır):
//   - Videoda 4-6 yazı stili; iki ardışık yazı sahnesi aynı stili taşımaz; hiçbir
//     stil yazı sahnelerinin %35'inden fazla değildir. lower-third (editoryal bilgi yazısı)
//     yalnızca isim/yer/tarih/sayı taşıyan satıra konur.
//   - EKRAN YAZISI KARARI (caption → sahnenin textMode'u): anlatımı tekrarlayan bir words
//     satırı yalnızca bilgi (isim, yer, tarih/saat, sayı), gerçek alıntı ya da vurgu taşıyorsa
//     tam yazılır; uzun bir yankı satırı yalnızca anahtar kelimesine (key) iner; hiçbir şey
//     taşımayan dolgu satırı yazısız temiz görüntü olur (none). say/zamanlama DEĞİŞMEZ.
//   - BÜYÜK YAZI BOŞ ZEMİNDE DURMAZ: resimsiz yazı/sayaç/alıntı sahnesinin zemini 'related'
//     (en yakın ilgili resim/klip, karartılmış ve kayan) — resim yoksa motor dönem dokusu
//     (gazete, film kapısı, defter) koyar. Düz solid/gradient yalnızca sessizlik anında
//     (enerji 1, videoda en çok 2).
//   - Sayaçlar (counterStyle): ardışık iki sayaç aynı çizimi taşımaz; 3+ sayaçta en az 3 çeşit;
//     photo yalnızca önünde resim varsa; borsa şeridi/gazete/mekanik sayaç döneme göre.
//   - Geçişler: 3-4 türlük palet + en çok 3 nadir vurgu; aynı süslü geçiş art arda gelmez.
//   - Efekt sahnelerin en çok %35'inde; aynı efekt art arda gelmez; sert efektler
//     (glitch, shake, chroma, film-burn) yalnızca gerilim/ifşa anlarında ve 45 sn'de en çok bir.
//   - Bölüm içinde en çok 2 renk derecelendirmesi; açık/renkli zeminler videoda birkaç kez.
//   - Döneme uygun (vhs yalnızca 1980-90'lar, kodachrome 1950-70'ler, sepya/siyanotip
//     1930 öncesi, 1400'lerde neon/glitch yok) ve duyguya uygun (sakin/hüzünlü sahneye
//     yumuşak dokunuş).
//   - `say`, sıra, süre, cihazlar, kaynaklar ve `bg` DEĞİŞMEZ; yalnızca görünüm alanları eklenir.
//
// Plan Claude Opus 5.5 ile tek çağrıda (yapılandırılmış JSON) kurulur, senaryo
// özetine göre iş klasöründe önbelleğe alınır. Anahtar/kredi yoksa ya da çağrı
// başarısızsa BELİRLEYİCİ yedek planlayıcı aynı kurallarla planlar (tohum:
// script.seedKey || script.id + geçmiş dosyası) — videolar yine birbirinden farklı olur.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { callJSON } from "../llm.js";
import { readJson, writeJson, DATA_DIR, ROOT } from "../util.js";
import { stripTags } from "./docu-script.js";
import { sceneTimes } from "./docu-edit-director.js";
import { checkOpening, chooseOpening, openingChoices, openingPrompt } from "./docu-opening.js";

export const ART_VERSION = "art-director-5";
export const ART_MODEL = "claude-opus-5-5";

/* ================================================================ sözleşme (render ajanlarıyla ORTAK) */

export const TEXT_STYLES = ["box", "underline", "marker", "outline", "stack", "serif", "typewriter", "cutout", "glitch", "lower-third", "neon", "stamp", "lyric", "kinetic", "motif"];
/** 'motif' (konunun kendi yazı dili, src/topic/caption.tsx) yalnızca konu kimliğinden gelir: sanat yönetmeni seçmez. */
export const TOPIC_ONLY_TEXT = new Set(["motif"]);
/** Vurgu yazı stilleri (lyric/kinetic): 4-6'lık palete sayılmaz; videoda toplam en çok 3, yalnızca kanca/alıntı/zirve. */
export const ACCENT_TEXT = new Set(["lyric", "kinetic"]);
export const REGULAR_TEXT = TEXT_STYLES.filter((s) => !ACCENT_TEXT.has(s) && s !== "motif");
/**
 * SLAM ve montaj kanca sözcükleri yalnızca VURUCU stillerle (kalın/büyük gösterim; motorun
 * StyledSlam'inde ortalanmış 190-280 px). serif/typewriter/lower-third/underline/marker/lyric
 * bir slam'i küçük ve ince gösterir — yasak. Sıra = vuruş gücü tercihi.
 */
export const IMPACT_TEXT = ["kinetic", "stamp", "box", "outline", "stack", "glitch", "neon", "cutout"];
export const SLAM_FORBIDDEN = new Set(["serif", "typewriter", "lower-third", "underline", "marker", "lyric"]);
/** Slam'in vuruşa oturan efekti (tercih sırası; aynı efekt art arda gelmesin diye dönüşümlü). */
export const HIT_FX = ["flash-frame", "shake", "flare", "vignette-pulse", "chroma"];
/** Slam'e giriş: keskin geçişler (ağır olanlar ve match hariç). */
export const SHARP_TRANSITIONS = new Set(["flash", "zoom", "whip", "glitch", "spin-blur", "split-wipe", "pixel", "slide", "film-burn"]);
export const isImpactScene = (s) => !!s && (s.type === "slam" || (s.type === "montage" && !!s.text));
export const BACKDROP_KINDS = ["solid", "gradient", "paper", "blueprint", "halftone", "blur", "split-color", "texture", "related", "era"];
/** Büyük yazının zemin türleri: ilgili resim ya da dönem dokusu (motor da uygular: src/looks/resolve.ts). */
export const RELATED_BACKDROPS = new Set(["related", "era"]);
/** Düz zeminler: yalnızca sessizlik anında (enerji 1), videoda en çok SILENCE_BEATS_MAX. */
export const SILENCE_BACKDROPS = new Set(["solid", "gradient"]);
export const SILENCE_BEATS_MAX = 2;
/** Yazısı/rakamı BÜYÜK sahneler (resimsizse zemini 'related'): words, slam, title, counter, quote. */
export const BIG_TEXT_TYPES = new Set(["words", "slam", "title", "counter", "quote"]);
export const ERA_TEXTURES = ["newsprint", "film", "ledger"];
export const GRADES = ["duotone", "mono", "color", "warm", "cool", "teal-orange", "sepia", "cyanotype", "bleach", "kodachrome", "vhs", "selective"];
/** 'selective' (siyah-beyaz + konunun TEK rengi) yalnızca konu kimliği isterse: serbest seçimde yok. */
export const TOPIC_ONLY_GRADES = new Set(["selective"]);
export const FX_KINDS = ["light-leak", "film-burn", "flare", "chroma", "glitch", "zoom-blur", "parallax", "speed-ramp", "halftone", "vhs", "dust", "flash-frame", "rack-focus", "shake", "vignette-pulse", "scan-lines", "bokeh", "push-in", "dolly-zoom", "tilt-reveal"];
export const TRANSITIONS = ["cut", "flash", "zoom", "glitch", "blackout", "whip", "leak", "film-burn", "ink", "paper-tear", "slide", "iris", "match", "pixel", "light-sweep", "dip-color", "spin-blur", "split-wipe"];
/** Resimli sahnenin (foto/klip) kamera hareketi ve kadraja oturtma biçimi. */
export const CAMERAS = ["static", "drift", "push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "detail-punch", "parallax", "handheld", "rack-focus"];
export const FITS = ["cover", "contain", "smart"];
/**
 * Sayaç sahnesinin çizimi (docu-engine src/looks/catalog.ts COUNTER_STYLES →
 * looks-catalog.json counterStyles): özgün kutu, çıplak dev rakam, mekanik sayaç
 * tamburları, önceki resmin üstünde, borsa şeridi, gazete kupürü, dış hatlı rakam.
 */
export const COUNTER_STYLES = ["box", "bare", "odometer", "photo", "ticker", "newsprint", "outline"];
/** Katalogla aynı (test denetler): taklit ettiği nesnenin var olduğu ilk yıl, türler, resim ihtiyacı. */
export const COUNTER_INFO = {
  odometer: { fromYear: 1900 },
  photo: { needsPicture: true },
  ticker: { fromYear: 1867, genres: ["finance"] },
  newsprint: { fromYear: 1800, genres: ["documentary", "finance", "crime", "epic", "inspire", "horror"] },
};
/** Katalogda görünümün listesi yoksa: açık (kâğıt) görünümler çıplak rakamla, koyular kutuyla açar. */
const COUNTERS_DARK = ["box", "bare", "outline", "photo", "odometer", "newsprint", "ticker"];
const COUNTERS_LIGHT = ["bare", "newsprint", "outline", "photo", "box", "odometer", "ticker"];

/* ================================================================ kurallar */

export const RULES = {
  textStylesMin: 4,
  textStylesMax: 6,
  textStyleShare: 0.35,
  paletteMin: 3,
  paletteMax: 4,
  accentUses: 3,
  fxShare: 0.35,
  strongFxGapSec: 45,
  gradesPerChapter: 2,
  lightBackdropsMin: 3,
  historyWindow: 3,
  /** lyric/kinetic toplam tavanı ve "kanca" süresi (sn). */
  accentTextMax: 3,
  hookSec: 40,
  /** Bu süre içindeki ilk slam/words sahnesi kanca: kinetic. */
  hookKineticSec: 30,
  /** Durağan (static/drift) resimli sahne payı: hedef ~%32, kabul aralığı. */
  stillTarget: 0.29,
  stillMin: 0.25,
  stillMax: 0.33,
  /** Alt sınırlar (model bir kategoriyi boş bırakırsa yedek planlayıcı doldurur). */
  minStyledShare: 0.25,
  minPictureFxShare: 0.22,
  /** Aynı kamera en çok bu kadar ardışık resimli sahnede. */
  cameraRun: 2,
  /** detail-punch / parallax vurguları arası en kısa aralık (sn). */
  cameraAccentGapSec: 40,
  /** Tempo: en çok bu kadar ardışık yüksek enerjili (>=4) sahne; ardından nefes (1). */
  energyRunMax: 3,
  /** Video geneli enerji dağılımı hedefi ve kabul aralıkları (düşük 1-2 / orta 3 / yüksek 4-5). */
  energyTarget: { low: 0.4, mid: 0.35, high: 0.25 },
  energyRange: { low: [0.3, 0.5], mid: [0.25, 0.45], high: [0.15, 0.32] },
  /** Bu kadar sahneden kısa bölüm dalga kuralından muaf. */
  chapterWaveMin: 6,
  /** 3+ sayaçlı videoda en az bu kadar farklı sayaç çizimi (ardışık iki sayaç asla aynı değil). */
  counterStylesMin: 3,
  /** (eski) lower-third alt sınırı — artık bilgi taşıyan satır şartı geçerli (infoLine). */
  lowerThirdMinWords: 4,
  /** Ekran yazısı: bu kadar kelimeden uzun, bilgi taşımayan yankı satırı yalnızca anahtar kelimesine iner. */
  captionFullMaxWords: 6,
  /** Önceki yazı kartından bu kadar sn içinde gelen düz (bilgisiz) satır anahtar kelimeye iner. */
  captionGapSec: 5,
};
/** Yazı sahnesinin kelime sayısı (lower-third kuralı). */
const wordsIn = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;
/* ================================================================ ekran yazısı (caption) sınıflandırıcısı */

/*
 * Bir words satırı sesin ötesinde ne taşıyor? Motorun aynısı (docu-engine
 * src/looks/resolve.ts lineHasInfo): rakam, ay adı, sayı sözcüğü, saat/gün,
 * cümle başında olmayan büyük harfli ad (yer/kişi); ayrıca gerçek alıntı ve
 * anahtar kelimenin gücü. Netflix/HBO belgeselleri bilgi yazısını yalnızca
 * isim/yer/tarih/rakam için koyar; anlatılan cümleyi ekrana kopyalamak amatörce.
 */
const CAP_MONTHS = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?|ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/i;
const CAP_NUMBERS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|percent|dozen|dollars?|cents?|pounds?|francs?|marks|lira|euros?|guineas?|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar|yüzde)\b/i;
const CAP_TIME = /(\b\d{1,2}[:.]\d{2}\b|\b[ap]\.m\.|\bo'clock\b|\bmidnight\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|pazartesi|salı|çarşamba|perşembe|cuma|cumartesi)\b)/i;
const CAP_NOT_NAMES = new Set(["I", "A", "An", "The", "And", "But", "Or", "So", "Then", "Now", "It", "He", "She", "They", "We", "You", "His", "Her", "Their", "Its", "This", "That", "These", "Those", "In", "On", "At", "By", "For", "Of", "To", "With", "From", "When", "Where", "Why", "How", "What", "Who", "If", "As", "No", "Not", "One", "Every", "All", "Most", "Some", "Even", "Only", "Just", "Still", "Yet", "Miss", "Mr", "Mrs", "Bu", "Şu", "O", "Ve", "Ama", "Bir", "Her", "Hiç"]);
/** Anahtar kelime olamayacak kadar genel sözcükler (vurgulanınca hiçbir şey söylemez). */
const WEAK_KEYS = new Set(["thing", "things", "something", "nothing", "everything", "anything", "really", "very", "much", "many", "some", "this", "that", "there", "here", "then", "were", "was", "been", "have", "just", "even", "still", "only", "also", "again", "every", "never", "always", "everyone", "anyone", "someone", "nobody", "would", "could", "should", "what", "when", "where", "which", "while", "about", "bir", "şey", "her", "hiç", "çok", "daha", "gibi", "kadar"]);
const capWords = (t) => String(t || "").split(/\s+/).filter(Boolean);
const bareWord = (w) => String(w || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, "").replace(/'s$/, "");

/**
 * Satırın taşıdıkları: {number, date, time, names, quote, info, keyword, keyStrong, words}.
 * info = sesin ötesinde bilgi (sayı/tarih/saat/ad) — editoryal bilgi yazısının tek konusu.
 */
export function captionFacts(s) {
  const text = String(s?.text || "");
  const say = stripTags(s?.say || "");
  const toks = capWords(text);
  const number = /\d/.test(text) || CAP_NUMBERS.test(text);
  const date = CAP_MONTHS.test(text) || /\b1[5-9]\d\d\b|\b20\d\d\b/.test(text);
  const time = CAP_TIME.test(text);
  const names = [];
  for (let i = 1; i < toks.length; i++) {
    const w = bareWord(toks[i]);
    if (w.length < 2 || !/^\p{Lu}/u.test(w) || CAP_NOT_NAMES.has(w) || /[.!?:…]$/.test(toks[i - 1])) continue;
    names.push(w);
  }
  // Gerçek alıntı: tırnak içinde söz ya da "X says/said: ..." / "... : <söz>" biçimi.
  // ...ya da anlatımda iki noktadan sonra gelen söz ekrandaki yazının ta kendisi ("Lamont tells the press: There has been...").
  const flat = (x) => String(x || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const afterColon = say.includes(":") ? flat(say.slice(say.indexOf(":") + 1)) : "";
  const quote = isQuoteLike(s) || /\b(said|says|wrote|writes|replied|declares?|declared|told|asked|snapped|warned|dedi|yazdı|diyor)\b[^.]*:/i.test(say) || (!!afterColon && toks.length >= 3 && afterColon.startsWith(flat(text).split(" ").slice(0, 3).join(" ")));
  const kw = bareWord(s?.keyword || "");
  const inText = !!kw && toks.some((w) => bareWord(w).toLowerCase() === kw.toLowerCase());
  // Sayı ya da kısaltma olan anahtar ("only ONE boat", "SOS") kısa da olsa güçlüdür ve bilgidir.
  const keyNumber = inText && (/^\d/.test(kw) || /^(one|two|three|four|five|six|seven|eight|nine|ten|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)$/i.test(kw));
  const keyStrong = inText && (keyNumber || /^\p{Lu}{2,}$/u.test(kw) || (kw.length >= 4 && !WEAK_KEYS.has(kw.toLowerCase())));
  const num = number || keyNumber;
  return { number: num, date, time, names, quote, info: num || date || time || names.length > 0, keyword: inText ? kw : null, keyStrong, words: toks.length };
}
/** Satır bilgi taşıyor mu (sayı, tarih/saat, ad)? lower-third (editoryal bilgi yazısı) yalnızca bunlara. */
export const infoLine = (s) => s?.type === "words" && captionFacts(s).info;
/** lower-third bu yazı sahnesine olmaz: words sahnesi bilgi (isim/yer/tarih/sayı) taşımıyor. (Eski adıyla.) */
export const shortLine = (s) => s?.type === "words" && !captionFacts(s).info;
export const CAPTION_MODES = ["full", "key", "none"];

/**
 * Bir words sahnesinin ekran yazısı kararı (deterministik): 'full' satırın tamamı
 * (anahtar kelime vurgulu), 'key' yalnızca anahtar kelime (büyük, söylendiği karede),
 * 'none' yazısız temiz görüntü. Bilgi/alıntı → full; bilinçli vurgu (enerji 4-5) →
 * full; kısa ve güçlü anahtarlı satır → full; uzun yankı satırı → key; anahtarı
 * olmayan dolgu → none (resim yoksa full: motor bir vurgu kelimesi seçer). Önceki
 * yazı kartının hemen ardından gelen düz satır tam yazılmaz (key / none).
 * @returns {{mode: 'full'|'key'|'none', why: string}}
 */
export function captionDecision(s, { energy, gapSec = Infinity, pictured = true, hook = false } = {}) {
  const f = captionFacts(s);
  if (f.info) return { mode: "full", why: "bilgi" };
  if (f.quote) return { mode: "full", why: "alıntı" };
  if (hook) return { mode: "full", why: "kanca" };
  if (f.keyStrong) {
    if (energy >= 4) return { mode: "full", why: "vurgu" };
    if (gapSec < RULES.captionGapSec) return { mode: "key", why: "art arda yazı" };
    return f.words <= RULES.captionFullMaxWords ? { mode: "full", why: "kısa vurgu" } : { mode: "key", why: "yankı satırı" };
  }
  if (!pictured) return { mode: "full", why: "resimsiz" };
  return { mode: "none", why: "dolgu" };
}
/** Zirve (enerji 4-5) olabilecek an: gerilim/ifşa/zafer duygusu ya da slam/montaj — sakin/hüzünlü değil. */
const PEAK_MOODS = new Set(["reveal", "tension", "triumph"]);
/** Enerjiye göre sahne içi kesme yoğunluğu (render: hold = tek kesintisiz çekim, rapid = 3-4 hızlı ara kesme). */
export const paceOf = (e) => (e <= 1 ? "hold" : e >= 5 ? "rapid" : e === 4 ? "quick" : "normal");
export const PACES = ["hold", "normal", "quick", "rapid"];
/** Enerjiye göre izinli kameralar (1 durağan, 3 yavaş itme/kaydırma, 5 hızlı itme/detay/omuz). */
const ENERGY_CAM = {
  1: ["static", "drift"],
  2: ["static", "drift", "push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "rack-focus", "parallax"],
  3: ["drift", "push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "rack-focus", "parallax"],
  4: ["push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "rack-focus", "detail-punch", "handheld", "parallax"],
  5: ["push-in", "detail-punch", "handheld", "pan-left", "pan-right", "rack-focus"],
};
export const cameraEnergyOk = (e, cam) => !Number.isInteger(e) || (ENERGY_CAM[e] || []).includes(cam);
const STILL_CAMS = new Set(["static", "drift"]);
const ACCENT_CAMS = new Set(["detail-punch", "parallax"]);
const PAN_CAMS = new Set(["pan-left", "pan-right"]);
const TILT_CAMS = new Set(["tilt-up", "tilt-down"]);
/** Belge, tarama, yazılı resim: bütünü görünsün (contain), kamera sakin. */
const TEXTUAL_PIC = /\b(document|letter|report|telegram|teletype|newspaper|front page|headline|memo|note|ledger|sketch|composite|map|poster|sign|certificate|passport|ticket|page|scan|manuscript|typed|handwrit|diagram|chart|blueprint|belge|mektup|rapor|gazete|manşet|harita|eskiz|not)\b/i;
export const STRONG_FX = new Set(["glitch", "shake", "chroma", "film-burn"]);
/** Sert efektlerin izinli olduğu duygular. */
const STRONG_MOODS = new Set(["tension", "reveal"]);
/** Yumuşak dokunuş isteyen duygular. */
export const GENTLE_MOODS = new Set(["calm", "sad"]);
const GENTLE_FX = new Set(["vignette-pulse", "dust", "bokeh", "light-leak", "rack-focus", "push-in", "parallax", "tilt-reveal"]);
/** Sakin/hüzünlü sahneye konmayan yüksek sesli yazı stilleri ve geçişler. */
const LOUD_TEXT = new Set(["stamp", "glitch", "cutout", "neon"]);
const LOUD_TRANSITIONS = new Set(["glitch", "whip", "flash", "spin-blur", "pixel", "film-burn", "zoom", "split-wipe", "paper-tear"]);
/** Karartma bir noktadır: yalnızca bağlam sınırında (duygu/hikâye değişimi). */
export const HEAVY_TRANSITIONS = new Set(["blackout", "ink", "paper-tear", "iris", "dip-color"]);
/** Yalnızca iki resim arasında (effects-catalog: needsPictures). */
export const NEEDS_PICTURES = new Set(["match"]);
/** Resmi olan sahne ister. */
const PICTURE_FX = new Set(["parallax", "rack-focus", "push-in", "dolly-zoom", "tilt-reveal", "zoom-blur", "halftone", "speed-ramp", "bokeh"]);
/** Dijital/elektronik görünüm: 1950 öncesi hikâyede yok (finans/bilim 1900 sonrası istisna). */
const DIGITAL = { textStyle: new Set(["neon", "glitch"]), fx: new Set(["glitch", "chroma", "scan-lines"]), transition: new Set(["glitch", "pixel"]) };

const HEX = /^#[0-9a-f]{6}$/i;
const isInt = (v) => Number.isInteger(v);

/* ================================================================ dönem */

/** script.era → {start, end} (yıllar); okunamazsa null (günümüz varsayılır). */
export function eraRange(era) {
  const ys = [...String(era || "").matchAll(/\b(1[0-9]\d\d|20\d\d)\b/g)].map((m) => +m[1]);
  if (!ys.length) {
    const c = String(era || "").match(/\b(\d{1,2})(?:st|nd|rd|th|\.)?\s*(?:century|yüzyıl)/i);
    if (c) { const s = (+c[1] - 1) * 100; return { start: s, end: s + 99 }; }
    return null;
  }
  return { start: Math.min(...ys), end: Math.max(...ys) };
}
const overlaps = (r, a, b) => !!r && r.start <= b && r.end >= a;

/** Bir değer bu dönem/tür için uygun mu? kind: textStyle | grade | fx | transition. */
export function eraAllows(kind, value, era, genre) {
  const full = typeof era === "object" && era !== null && "start" in era ? era : eraRange(era);
  // Hikâyenin kendi dönemi: ilk yıldan en çok 30 yıl ("1912 (enkaz 1985'te)" 1980'ler hikâyesi değildir).
  const r = full && { start: full.start, end: Math.min(full.end, full.start + 30) };
  if (value === "vhs") return overlaps(r, 1978, 1999);
  if (value === "kodachrome" && kind === "grade") return overlaps(r, 1950, 1979);
  if ((value === "sepia" || value === "cyanotype") && kind === "grade") return !!r && r.start < 1930;
  if (DIGITAL[kind]?.has(value)) {
    if (!r) return true;
    if (r.end < 1900) return false;
    return r.start >= 1950 || r.end >= 1975;
  }
  if (kind === "textStyle" && value === "typewriter") return !r || r.end >= 1870;
  // Sayaç çizimleri taklit ettikleri nesneyle yaşıt: 1453'te borsa şeridi, 1700'de gazete yok.
  if (kind === "counterStyle") {
    const y = COUNTER_INFO[value]?.fromYear;
    if (y && r && r.end < y) return false;
    const gs = COUNTER_INFO[value]?.genres;
    return !gs || !genre || gs.includes(genre);
  }
  return true;
}

/* ================================================================ görünüm kataloğu */

const G = (id, genres, o) => ({ id, genres, ...o });
/** Yedek liste: docu-engine/looks-catalog.json yokken (ya da bu tür için boşken). */
export const STUB_LOOKS = [
  // suç
  G("case-file", ["crime"], { textStyles: ["typewriter", "stamp", "marker", "box", "underline", "lower-third", "cutout"], transitions: ["blackout", "flash", "paper-tear", "slide", "dip-color"], grades: ["bleach", "cool", "mono", "duotone", "kodachrome"], backdrops: ["paper", "texture", "solid", "halftone"], fx: ["dust", "push-in", "flash-frame", "rack-focus", "halftone"], accent: "#f2c318", light: "#efe6d2", dark: "#0b0f14" }),
  G("night-desk", ["crime", "horror"], { textStyles: ["outline", "lower-third", "serif", "box", "glitch", "underline"], transitions: ["whip", "light-sweep", "blackout", "zoom", "leak"], grades: ["teal-orange", "cool", "mono", "bleach"], backdrops: ["gradient", "blur", "solid", "blueprint"], fx: ["rack-focus", "bokeh", "push-in", "scan-lines", "vignette-pulse"], accent: "#4fc3f7", light: "#dfe9f2", dark: "#0a1320" }),
  G("tabloid", ["crime", "finance"], { textStyles: ["cutout", "stamp", "stack", "marker", "box", "serif"], transitions: ["flash", "paper-tear", "whip", "split-wipe", "ink"], grades: ["kodachrome", "duotone", "warm", "bleach", "sepia"], backdrops: ["halftone", "split-color", "paper", "solid"], fx: ["halftone", "flash-frame", "zoom-blur", "shake", "dust"], accent: "#e63946", light: "#f4efe4", dark: "#141010" }),
  G("cold-evidence", ["crime", "science", "documentary"], { textStyles: ["serif", "underline", "typewriter", "outline", "lower-third", "marker"], transitions: ["dip-color", "iris", "blackout", "match", "slide"], grades: ["cool", "mono", "cyanotype", "bleach", "color"], backdrops: ["blueprint", "solid", "gradient", "paper"], fx: ["rack-focus", "tilt-reveal", "vignette-pulse", "dust", "parallax"], accent: "#9bd1e5", light: "#e8eef2", dark: "#0d1418" }),
  G("noir-red", ["crime", "horror"], { textStyles: ["stack", "outline", "stamp", "serif", "box", "typewriter"], transitions: ["blackout", "film-burn", "zoom", "iris", "flash"], grades: ["mono", "duotone", "bleach", "warm"], backdrops: ["solid", "split-color", "texture", "gradient"], fx: ["film-burn", "vignette-pulse", "dolly-zoom", "dust", "shake"], accent: "#d62828", light: "#f1ece6", dark: "#0a0a0a" }),
  // belgesel
  G("archive-gold", ["documentary", "inspire"], { textStyles: ["box", "serif", "underline", "typewriter", "lower-third", "stamp"], transitions: ["flash", "leak", "dip-color", "slide", "blackout"], grades: ["warm", "sepia", "color", "duotone", "kodachrome"], backdrops: ["paper", "texture", "gradient", "solid"], fx: ["dust", "light-leak", "push-in", "parallax", "tilt-reveal"], accent: "#f2c230", light: "#f3ead6", dark: "#2a1810" }),
  G("field-journal", ["documentary", "science", "epic"], { textStyles: ["typewriter", "serif", "marker", "lower-third", "underline", "outline"], transitions: ["slide", "ink", "leak", "iris", "match"], grades: ["color", "warm", "sepia", "cyanotype", "cool"], backdrops: ["paper", "blueprint", "texture", "solid"], fx: ["parallax", "tilt-reveal", "dust", "rack-focus", "light-leak"], accent: "#e07a2f", light: "#f1e7d0", dark: "#1d1a14" }),
  G("newsreel", ["documentary", "finance", "epic"], { textStyles: ["stack", "stamp", "box", "serif", "outline", "typewriter"], transitions: ["flash", "whip", "iris", "blackout", "film-burn"], grades: ["mono", "sepia", "bleach", "duotone", "kodachrome"], backdrops: ["halftone", "paper", "solid", "split-color"], fx: ["dust", "flash-frame", "film-burn", "halftone", "push-in"], accent: "#f4f1de", light: "#ece6d6", dark: "#121212" }),
  G("museum", ["documentary", "epic", "inspire"], { textStyles: ["serif", "lower-third", "underline", "outline", "stack", "marker"], transitions: ["dip-color", "light-sweep", "slide", "leak", "match"], grades: ["color", "warm", "teal-orange", "bleach", "duotone"], backdrops: ["solid", "gradient", "paper", "texture"], fx: ["rack-focus", "bokeh", "tilt-reveal", "parallax", "light-leak"], accent: "#c9a227", light: "#f5f1e8", dark: "#15181c" }),
  // finans
  G("ticker", ["finance", "science"], { textStyles: ["box", "lower-third", "outline", "glitch", "stack", "typewriter"], transitions: ["glitch", "slide", "pixel", "split-wipe", "flash"], grades: ["cool", "teal-orange", "duotone", "color", "vhs"], backdrops: ["blueprint", "solid", "gradient", "split-color"], fx: ["scan-lines", "chroma", "push-in", "zoom-blur", "flash-frame"], accent: "#19e07a", light: "#e6f4ec", dark: "#06140e" }),
  G("broadsheet", ["finance", "documentary"], { textStyles: ["serif", "stamp", "underline", "stack", "marker", "typewriter"], transitions: ["paper-tear", "slide", "flash", "ink", "blackout"], grades: ["sepia", "mono", "bleach", "warm", "duotone"], backdrops: ["paper", "halftone", "solid", "texture"], fx: ["halftone", "dust", "tilt-reveal", "flash-frame", "push-in"], accent: "#b5121b", light: "#f2ecdf", dark: "#161412" }),
  G("crash-red", ["finance", "crime"], { textStyles: ["stack", "cutout", "box", "outline", "stamp", "lower-third"], transitions: ["flash", "zoom", "split-wipe", "blackout", "whip"], grades: ["bleach", "duotone", "cool", "mono", "kodachrome"], backdrops: ["split-color", "solid", "gradient", "halftone"], fx: ["shake", "zoom-blur", "flash-frame", "vignette-pulse", "push-in"], accent: "#ff3b30", light: "#f6ecea", dark: "#120708" }),
  // korku
  G("found-footage", ["horror", "science"], { textStyles: ["typewriter", "lower-third", "glitch", "outline", "box", "underline"], transitions: ["glitch", "blackout", "pixel", "flash", "dip-color"], grades: ["vhs", "mono", "cool", "bleach", "duotone"], backdrops: ["solid", "blur", "texture", "gradient"], fx: ["scan-lines", "vhs", "chroma", "shake", "vignette-pulse"], accent: "#c1121f", light: "#e9e4dc", dark: "#0b0706" }),
  G("frost", ["horror", "documentary"], { textStyles: ["serif", "outline", "typewriter", "underline", "lower-third", "stack"], transitions: ["dip-color", "blackout", "iris", "leak", "slide"], grades: ["cool", "cyanotype", "mono", "bleach", "color"], backdrops: ["gradient", "solid", "blur", "paper"], fx: ["vignette-pulse", "rack-focus", "dust", "push-in", "dolly-zoom"], accent: "#a8dadc", light: "#e8f1f2", dark: "#070c10" }),
  G("occult", ["horror", "epic"], { textStyles: ["serif", "stamp", "stack", "outline", "marker", "cutout"], transitions: ["film-burn", "ink", "blackout", "iris", "match"], grades: ["sepia", "duotone", "warm", "mono", "bleach"], backdrops: ["texture", "paper", "solid", "split-color"], fx: ["film-burn", "dust", "vignette-pulse", "flare", "dolly-zoom"], accent: "#e85d04", light: "#efe3cf", dark: "#0e0906" }),
  // destan
  G("chronicle", ["epic", "documentary"], { textStyles: ["serif", "stack", "outline", "lower-third", "underline", "stamp"], transitions: ["zoom", "leak", "ink", "dip-color", "blackout"], grades: ["warm", "teal-orange", "sepia", "duotone", "color"], backdrops: ["paper", "texture", "gradient", "solid"], fx: ["flare", "light-leak", "parallax", "push-in", "dust"], accent: "#d9a441", light: "#f2e6cc", dark: "#1a1109" }),
  G("war-banner", ["epic"], { textStyles: ["stack", "stamp", "outline", "serif", "cutout", "box"], transitions: ["whip", "flash", "zoom", "film-burn", "blackout"], grades: ["bleach", "teal-orange", "warm", "mono", "duotone"], backdrops: ["split-color", "texture", "solid", "gradient"], fx: ["shake", "flare", "zoom-blur", "dolly-zoom", "film-burn"], accent: "#b3261e", light: "#efe2cf", dark: "#140b07" }),
  G("mosaic", ["epic", "inspire"], { textStyles: ["serif", "marker", "underline", "outline", "lower-third", "stack"], transitions: ["ink", "slide", "iris", "leak", "light-sweep"], grades: ["color", "warm", "duotone", "sepia", "teal-orange"], backdrops: ["texture", "paper", "gradient", "split-color"], fx: ["light-leak", "tilt-reveal", "parallax", "bokeh", "dust"], accent: "#2a9d8f", light: "#f1ead9", dark: "#10131a" }),
  // bilim
  G("mission-control", ["science", "finance"], { textStyles: ["lower-third", "box", "typewriter", "outline", "neon", "stack"], transitions: ["slide", "pixel", "light-sweep", "zoom", "dip-color"], grades: ["teal-orange", "cool", "color", "vhs", "kodachrome"], backdrops: ["blueprint", "gradient", "solid", "split-color"], fx: ["scan-lines", "push-in", "flare", "zoom-blur", "rack-focus"], accent: "#38d9ff", light: "#e3f3f8", dark: "#030814" }),
  G("deep-space", ["science", "horror"], { textStyles: ["outline", "serif", "neon", "lower-third", "stack", "underline"], transitions: ["leak", "light-sweep", "iris", "dip-color", "zoom"], grades: ["cool", "color", "teal-orange", "duotone", "bleach"], backdrops: ["gradient", "blur", "solid", "texture"], fx: ["bokeh", "flare", "parallax", "light-leak", "dolly-zoom"], accent: "#9d7cff", light: "#ecebf7", dark: "#05040d" }),
  G("aurora", ["science", "inspire"], { textStyles: ["serif", "underline", "outline", "lower-third", "stack", "marker"], transitions: ["leak", "dip-color", "light-sweep", "slide", "match"], grades: ["color", "cool", "teal-orange", "warm", "duotone"], backdrops: ["gradient", "solid", "paper", "blur"], fx: ["light-leak", "bokeh", "parallax", "tilt-reveal", "flare"], accent: "#52e3a4", light: "#e9f6f0", dark: "#07121a" }),
  // ilham
  G("golden-hour", ["inspire", "documentary"], { textStyles: ["serif", "underline", "stack", "lower-third", "marker", "outline"], transitions: ["leak", "light-sweep", "dip-color", "slide", "flash"], grades: ["warm", "color", "kodachrome", "sepia", "teal-orange"], backdrops: ["gradient", "paper", "solid", "texture"], fx: ["light-leak", "flare", "bokeh", "push-in", "parallax"], accent: "#ffb347", light: "#fbf0dc", dark: "#1c1410" }),
  G("notebook", ["inspire", "science"], { textStyles: ["marker", "typewriter", "underline", "serif", "cutout", "lower-third"], transitions: ["paper-tear", "slide", "ink", "iris", "leak"], grades: ["color", "warm", "sepia", "cyanotype", "duotone"], backdrops: ["paper", "blueprint", "texture", "split-color"], fx: ["tilt-reveal", "dust", "halftone", "parallax", "light-leak"], accent: "#3a86ff", light: "#f7f3ea", dark: "#141821" }),
  G("poster", ["inspire", "epic", "finance"], { textStyles: ["stack", "cutout", "outline", "box", "serif", "stamp"], transitions: ["split-wipe", "slide", "flash", "zoom", "iris"], grades: ["duotone", "color", "bleach", "teal-orange", "warm"], backdrops: ["split-color", "halftone", "solid", "gradient"], fx: ["halftone", "zoom-blur", "flare", "push-in", "flash-frame"], accent: "#ff6b35", light: "#f6efe3", dark: "#161216" }),
];
const GENERIC = STUB_LOOKS.find((l) => l.id === "archive-gold");
/** Görünümün kamera kişiliği: katalogda yoksa kimliğinden türetilen 4 gözde hareket. */
export function lookCameras(look) {
  if (Array.isArray(look?.camera) && look.camera.length) return look.camera;
  const moves = CAMERAS.filter((c) => !STILL_CAMS.has(c) && c !== "handheld");
  return [...moves].sort((a, b) => hash01(`${look?.id}|cam|${a}`) - hash01(`${look?.id}|cam|${b}`)).slice(0, 4);
}

/** Motor klasörü (docu.js docuEngineDir ile aynı; döngüsel içe aktarmayı önlemek için kopya). */
function engineDir() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, "docu-engine");
  if (packaged && fs.existsSync(path.join(packaged, "bin", "nova-run.mjs"))) return packaged;
  return path.join(ROOT, "docu-engine");
}

const strs = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v) : typeof v === "string" ? [v] : [])
  .map((x) => (typeof x === "string" ? x : x?.id || x?.kind || x?.name || x?.variant))
  .filter((x) => typeof x === "string");
const only = (list, allowed) => [...new Set(strs(list).filter((x) => allowed.includes(x)))];
const hexOr = (v, d) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d);

/** looks-catalog.json'u (biçimi ne olursa olsun) {id, genres, textStyles, ...} listesine çevirir. */
export function normalizeLooks(raw) {
  const out = [];
  const add = (o, hint) => {
    if (!o || typeof o !== "object") return;
    const id = o.variant || o.id || o.name;
    if (typeof id !== "string" || !id) return;
    const genres = strs(o.genres || o.genre || hint);
    // Kataloğun vermediği (geçiş, efekt, ek stil) kişilik: türün yedek görünümlerinden kimliğe göre biri.
    const stubs = STUB_LOOKS.filter((l) => genres.some((g) => l.genres.includes(g)));
    const base = stubs.length ? stubs[Math.floor(hash01(`${id}|base`) * stubs.length)] : GENERIC;
    const pal = o.palette && typeof o.palette === "object" ? o.palette : {};
    const lead = (keys, allowed) => {
      for (const k of keys) { const v = only(k.split(".").reduce((a, p) => a?.[p], o), allowed); if (v.length) return v; }
      return [];
    };
    const merged = (keys, allowed, dflt) => [...new Set([...lead(keys, allowed), ...dflt.filter((x) => allowed.includes(x))])];
    const leadText = lead(["textStyles", "text", "typography.styles", "type"], TEXT_STYLES);
    const isLight = o.light === true;
    out.push({
      id, genres,
      leadText, leadGrade: lead(["grade", "grades"], GRADES)[0] || null,
      textStyles: merged(["textStyles", "text", "typography.styles", "type"], REGULAR_TEXT, base.textStyles),
      transitions: merged(["transitions", "transition"], TRANSITIONS.filter((t) => t !== "cut"), base.transitions),
      grades: merged(["grades", "grade"], GRADES, base.grades),
      backdrops: merged(["backdrops", "backdrop"], BACKDROP_KINDS, base.backdrops),
      fx: merged(["fx", "effects"], FX_KINDS, base.fx),
      camera: merged(["camera", "cameras", "cameraMoves"], CAMERAS, lookCameras({ id })),
      counterStyles: merged(["counterStyles", "counters"], COUNTER_STYLES, isLight ? COUNTERS_LIGHT : COUNTERS_DARK),
      accent: hexOr(o.accent || pal.accent, base.accent),
      light: hexOr(o.lightColor || pal.light || pal.paper || (isLight ? pal.bg : null), base.light),
      dark: hexOr(o.dark || (isLight ? pal.ink : pal.bg) || pal.dark, base.dark),
      original: o.original === true,
      description: typeof o.description === "string" ? o.description.slice(0, 160) : undefined,
      suits: typeof o.suits === "string" ? o.suits.slice(0, 120) : undefined,
    });
  };
  const walk = (v, hint) => {
    if (Array.isArray(v)) v.forEach((o) => add(o, hint));
    else if (v && typeof v === "object") for (const [k, o] of Object.entries(v)) add(o && typeof o === "object" && !o.id && !o.variant ? { ...o, id: k } : o, hint);
  };
  // {genre: [variant, ...]} biçimi (docu-engine/looks-catalog.json "variants")
  const byGenre = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(Array.isArray);
  if (Array.isArray(raw)) walk(raw);
  else if (raw && typeof raw === "object") {
    if (raw.looks) walk(raw.looks);
    else if (byGenre(raw.variants)) for (const [g, v] of Object.entries(raw.variants)) walk(v, g);
    else if (raw.variants) walk(raw.variants);
    else if (raw.genres && typeof raw.genres === "object" && !Array.isArray(raw.genres)) for (const [g, v] of Object.entries(raw.genres)) walk(v, g);
    else for (const [g, v] of Object.entries(raw)) if (Array.isArray(v) || (v && typeof v === "object")) walk(v, g);
  }
  return out;
}

/** effects-catalog.json: listelediği türler sözleşmeyle kesişir (boşsa kısıt yok). */
export function catalogKinds(raw) {
  const res = {};
  if (!raw || typeof raw !== "object") return res;
  const keys = { fx: ["fx", "effects", "fxKinds"], transition: ["transitions", "transitionKinds"], textStyle: ["textStyles", "text"], grade: ["grades"], backdrop: ["backdrops", "backdropKinds"] };
  const contract = { fx: FX_KINDS, transition: TRANSITIONS, textStyle: TEXT_STYLES, grade: GRADES, backdrop: BACKDROP_KINDS };
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.items) ? raw.items : null;
  for (const [cat, ks] of Object.entries(keys)) {
    let found = [];
    for (const k of ks) if (raw[k]) found = found.concat(only(raw[k], contract[cat]));
    if (list) found = found.concat(only(list.filter((o) => o && [o.type, o.category, o.kind === cat ? cat : null].includes(cat)), contract[cat]));
    if (found.length) res[cat] = new Set(found);
  }
  return res;
}

/** Katalogları çalışma anında okur (dosya henüz yoksa yedek liste). */
export function loadCatalogs(dir = engineDir()) {
  const looksRaw = readJson(path.join(dir, "looks-catalog.json"), null);
  const effectsRaw = readJson(path.join(dir, "effects-catalog.json"), null);
  const looks = looksRaw ? normalizeLooks(looksRaw) : [];
  // Tür uygunluğu: kataloğun her kaydı hangi türlere uyar ("all" ya da liste).
  const genreKinds = {};
  const addG = (cat, list, contract) => {
    if (!Array.isArray(list)) return;
    const m = new Map();
    for (const o of list) if (o && typeof o.id === "string" && contract.includes(o.id)) m.set(o.id, o.genres === "all" || !Array.isArray(o.genres) ? "all" : o.genres);
    if (m.size) genreKinds[cat] = m;
  };
  addG("textStyle", looksRaw?.textStyles, TEXT_STYLES);
  addG("backdrop", looksRaw?.backdrops, BACKDROP_KINDS);
  addG("grade", looksRaw?.grades, GRADES);
  addG("counterStyle", looksRaw?.counterStyles, COUNTER_STYLES);
  addG("fx", effectsRaw?.scene?.fx, FX_KINDS);
  addG("transition", effectsRaw?.transitions, TRANSITIONS);
  const kinds = { ...catalogKinds(looksRaw), ...catalogKinds(effectsRaw) };
  for (const [cat, key, contract] of [["fx", "fx", FX_KINDS], ["camera", "camera", CAMERAS], ["fit", "fit", FITS]]) {
    const v = only(effectsRaw?.scene?.[key], contract);
    if (v.length) kinds[cat] = new Set(v);
  }
  return { looks: looks.length ? looks : STUB_LOOKS, kinds, genreKinds, source: looks.length ? "catalog" : "stub" };
}

/** Görünüm hikâyenin dönemine uyuyor mu (öncü rengi ve en az bir öncü yazı stili)? */
function lookFitsEra(look, ctx) {
  if (look.leadGrade && !ctx.allowed.grade.includes(look.leadGrade)) return false;
  const lead = (look.leadText || []).filter((s) => !ACCENT_TEXT.has(s));
  return !lead.length || lead.some((s) => ctx.allowed.textStyle.includes(s));
}

/**
 * Bu video için seçilebilir görünümler: türün (ve döneme uyan) varyantları, türün son 3
 * videosunda kullanılanlar hariç. Özgün (tekdüzelik şikâyeti olan) görünüm en sona.
 */
export function openLooks(script, catalogs, history) {
  const ctx = artContext(script, catalogs);
  const genreLooks = catalogs.looks.filter((l) => l.genres.includes(ctx.genre));
  const all = genreLooks.length ? genreLooks : catalogs.looks;
  const fit = all.filter((l) => lookFitsEra(l, ctx));
  const pool = fit.length >= 2 ? fit : all;
  const recent = recentFor(history, ctx.genre, script.id);
  const blockN = Math.min(RULES.historyWindow, Math.max(0, pool.length - 1));
  const blocked = new Set(recent.slice(0, blockN).map((e) => e.variant));
  return { pool, open: pool.filter((l) => !blocked.has(l.id)), recent, ctx };
}

/* ================================================================ geçmiş */

export const defaultHistoryFile = () => path.join(DATA_DIR, "docu-look-history.json");
export function readHistory(file) {
  const h = readJson(file, []);
  const list = Array.isArray(h) ? h : Array.isArray(h?.entries) ? h.entries : [];
  return list.filter((e) => e && typeof e.variant === "string");
}
/** Aynı türün son N videosu (aynı video — yeniden planlama — hariç), en yeni önce. */
export function recentFor(history, genre, id, n = RULES.historyWindow) {
  return history.filter((e) => e.genre === genre && (!id || e.id !== id)).slice(-n).reverse();
}
export function recordHistory(file, entry) {
  const list = readHistory(file).filter((e) => !(entry.id && e.id === entry.id));
  list.push(entry);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, list.slice(-300));
}

/* ================================================================ yardımcılar */

function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const fp = (s) => crypto.createHash("sha1").update(stripTags(s?.say || "")).digest("hex").slice(0, 10);
const lum = (hex) => {
  if (!HEX.test(hex || "")) return 0;
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
/** Açık/renkli zemin mi (koyu tema dışı)? */
export const isLightBackdrop = (b) => !!b && (b.kind === "paper" || b.tone === "light" || (b.kind === "era" && b.variant !== "film" && b.tone !== "dark") || lum(b.color) > 0.55);
const moodOf = (s) => s?.mood || "curious";
const chOf = (s) => s?.chapter ?? 0;
const isCard = (s) => s?.type === "title" && s.chapterCard;
const DEVICE_TYPES = new Set(["headline", "map", "board", "document", "timeline", "split", "quote"]);

/** Sahnenin KENDİ resmi (önceki kareyi taşımıyor). */
export function ownPicture(s) {
  if (!s || s.bg === "prev" || s.bg === "next") return false;
  return !!(s.image || s.imagePrompt || s.search || s.video || s.images?.length || s.imagePrompts?.length);
}
export const isTextScene = (s) => !!s && !isCard(s) && (["words", "slam", "title"].includes(s.type) || (s.type === "montage" && !!s.text));
export function isBackdropScene(s) {
  if (!s || isCard(s)) return false;
  if (["quote", "timeline"].includes(s.type)) return s.bg !== "prev" && s.bg !== "next";
  if (["counter", "chart", "words", "slam", "title"].includes(s.type)) return !ownPicture(s) && s.bg !== "prev" && s.bg !== "next";
  return false;
}
export const isGradeScene = (s) => !!s && !isCard(s) && (s.type === "photo" || s.type === "montage" || (["words", "slam", "title"].includes(s.type) && ownPicture(s)));
const isVideo = (s) => s?.media === "video" || !!s?.video;
function fxFits(s, k) {
  if (!s || isCard(s)) return false;
  if (PICTURE_FX.has(k) && !(ownPicture(s) && !DEVICE_TYPES.has(s.type))) return false;
  if (k === "speed-ramp" && !isVideo(s)) return false;
  return true;
}

/** Sahne ekranda bir resim gösteriyor mu (kendi resmi ya da önceki kare)? */
const showsPicture = (s) => ownPicture(s) || s?.bg === "prev" || s?.bg === "next";
/** 'photo' sayaç önceki resmin üstüne konur: önündeki iki sahneden biri (sayaç olmayan) resim göstermeli (motor: counterPicture). */
export const counterPicOk = (S, i) => [S[i - 1], S[i - 2]].some((p) => p && p.type !== "counter" && showsPicture(p));
/** Duygu ya da hikâye dönüşü (ağır geçişin tek yeri): bölüm/duygu değişimi, slam/sayaç/grafik/başlığa giriş, montajdan çıkış. */
const isTurn = (p, s) => chOf(s) !== chOf(p) || moodOf(s) !== moodOf(p) || ["slam", "counter", "chart", "title"].includes(s.type) || p.type === "montage";/** Anlatımda/yazıda gerçek bir alıntı (tırnak içinde söz) var mı? */
export const isQuoteLike = (s) => /["“”«»][^"“”«»]{6,}["“”«»]/.test(`${stripTags(s?.say || "")} ${s?.text || ""}`);
/** lyric/kinetic bu sahneye konabilir mi: kanca (ilk ~40 sn), gerçek alıntı ya da zirve (>=4); sakin/hüzünlü değil. */
export const accentTextEligible = (s, start, energy) => !!s && !GENTLE_MOODS.has(moodOf(s)) && ((Number.isFinite(start) && start < RULES.hookSec) || isQuoteLike(s) || energy >= 4);
export const peakEligible = (s) => !!s && !isCard(s) && (s.type === "slam" || (!GENTLE_MOODS.has(moodOf(s)) && (PEAK_MOODS.has(moodOf(s)) || s.type === "montage")));
/** Kanca: ilk ~30 sn içindeki ilk (sakin/hüzünlü olmayan) slam ya da words sahnesi; yoksa -1. */
export function hookIndex(scenes, starts) {
  for (let i = 0; i < scenes.length; i++) {
    if (!(starts[i] < RULES.hookKineticSec)) break;
    const s = scenes[i];
    if ((s.type === "slam" || s.type === "words") && isTextScene(s) && !GENTLE_MOODS.has(moodOf(s))) return i;
  }
  return -1;
}

/** Resmin en/boy oranı (arşivden sonra bilinir), yoksa null. */
export const aspectOf = (s) => (Number(s?.imgW) > 0 && Number(s?.imgH) > 0 ? s.imgW / s.imgH : Number(s?.videoW) > 0 && Number(s?.videoH) > 0 ? s.videoW / s.videoH : null);
/** Belge/tarama/yazılı resim mi (sorgu, istem, alt yazı)? */
export const isTextualPicture = (s) => TEXTUAL_PIC.test([s?.search, s?.imagePrompt, s?.caption].filter(Boolean).join(" "));
/** Kamera bu sahneye (oran ve duygu) uyuyor mu? */
function cameraFits(s, cam) {
  if (cam === "handheld" && moodOf(s) !== "tension") return false;
  const a = aspectOf(s);
  if (a !== null && a > 1.9 && !(PAN_CAMS.has(cam) || STILL_CAMS.has(cam))) return false;
  return true;
}
/** Uzun kamera dizisi: i'de `cam` olursa aynı kamera cameraRun'dan fazla ardışık resimli sahnede mi olur? */
function breaksRun(cams, order, k, cam) {
  let run = 1;
  for (let j = k - 1; j >= 0 && cams[order[j]] === cam; j--) run++;
  for (let j = k + 1; j < order.length && cams[order[j]] === cam; j++) run++;
  return run > RULES.cameraRun;
}

/**
 * Konu kimliği (docu-topic-bible.js → script.topic): sanat yönetmeni ona UYAR — görünüm
 * varyantı tercihi, yazı stili ailesi, bağlayıcı renk derecelendirmesi, vurgu rengi ve zeminler.
 * İncil sunumda/motifte kazanır; çeşitlilik kuralları yine geçerli.
 */
export function topicOf(script) {
  const t = script?.topic;
  if (!t || typeof t !== "object" || !t.motif) return null;
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  return {
    motif: t.motif,
    textStyles: arr(t.textStyles),
    grade: typeof t.grade === "string" ? t.grade : null,
    backdrops: arr(t.backdrops),
    variants: arr(t.variants),
    accent: HEX.test(t.accent || "") ? t.accent.toLowerCase() : null,
    opening: typeof t.opening === "string" ? t.opening : null,
    eraTexture: typeof t.eraTexture === "string" ? t.eraTexture : null,
  };
}

function artContext(script, catalogs) {
  const scenes = script.scenes || [];
  const { starts, total } = sceneTimes(script);
  const era = eraRange(script.era);
  const genre = script.genre || "documentary";
  const nCh = Math.max(Array.isArray(script.chapters) ? script.chapters.length : 0, ...scenes.map((s) => chOf(s) + 1), 1);
  const kinds = catalogs?.kinds || {};
  const gk = catalogs?.genreKinds || {};
  const genreOk = (cat, v) => {
    if (cat === "transition" && v === "cut") return true;
    const m = gk[cat];
    if (!m) return true;
    const g = m.get(v);
    return g === "all" || (Array.isArray(g) && g.includes(genre));
  };
  const allow = (cat, list) => list.filter((v) => eraAllows(cat, v, era, genre) && genreOk(cat, v) && (!kinds[cat] || kinds[cat].has(v) || (cat === "transition" && v === "cut")));
  const topic = topicOf(script);
  const allowed = {
    textStyle: allow("textStyle", TEXT_STYLES).filter((x) => !TOPIC_ONLY_TEXT.has(x)),
    backdrop: allow("backdrop", BACKDROP_KINDS),
    grade: allow("grade", GRADES).filter((g) => !TOPIC_ONLY_GRADES.has(g) || topic?.grade === g),
    fx: allow("fx", FX_KINDS),
    transition: allow("transition", TRANSITIONS),
    counterStyle: allow("counterStyle", COUNTER_STYLES),
  };
  if (!allowed.grade.length) allowed.grade = ["color"];
  if (!allowed.counterStyle.length) allowed.counterStyle = ["box"];
  if (!allowed.backdrop.length) allowed.backdrop = ["solid"];
  const idx = (f) => scenes.map((s, i) => (f(s) ? i : -1)).filter((i) => i >= 0);
  return {
    script, scenes, n: scenes.length, starts, total, era, genre, nCh, allowed, topic,
    text: idx(isTextScene), backdrop: idx(isBackdropScene), grade: idx(isGradeScene), counter: idx((s) => s?.type === "counter"),
    seed: String(script.seedKey || script.id || script.title || "docu"),
  };
}

/* ================================================================ plan denetimi (sert kurallar) */

export const textCap = (nText) => Math.max(1, Math.floor(RULES.textStyleShare * nText));
export const fxCap = (n) => Math.floor(RULES.fxShare * n);

/**
 * Planın kuralları çiğneyip çiğnemediği: ihlal listesi (boş = temiz).
 * `plan` = applyArtPlan'ın uyguladığı biçim ya da sahnelere yazılmış senaryo.
 */
export function checkPlan(script, { catalogs, history = null } = {}) {
  const ctx = artContext(script, catalogs);
  const S = ctx.scenes;
  const v = [];
  const bad = (m) => v.push(m);
  const { allowed } = ctx;
  // yazı stilleri
  const tIdx = ctx.text;
  const counts = {};
  let prev = null;
  let accentN = 0;
  for (const i of tIdx) {
    const st = S[i].textStyle;
    if (!st) { bad(`#${i}: yazı sahnesinin stili yok`); prev = null; continue; }
    if (!allowed.textStyle.includes(st)) bad(`#${i}: yazı stili ${st} bu dönem/katalog için geçersiz`);
    if (st === prev) bad(`#${i}: ardışık yazı sahnesi aynı stil (${st})`);
    if (GENTLE_MOODS.has(moodOf(S[i])) && LOUD_TEXT.has(st) && S[i].type !== "slam") bad(`#${i}: ${moodOf(S[i])} sahnede sert yazı stili ${st}`);
    if (st === "lower-third" && shortLine(S[i])) bad(`#${i}: lower-third bilgi (isim/yer/tarih/sayı) taşımayan satırda`);
    if (ACCENT_TEXT.has(st)) {
      accentN++;
      if (ACCENT_TEXT.has(prev)) bad(`#${i}: vurgu yazısı (${st}) ardışık`);
      if (!accentTextEligible(S[i], ctx.starts[i], S[i].energy)) bad(`#${i}: vurgu yazısı ${st} kanca/alıntı/zirve dışında (${moodOf(S[i])}, enerji ${S[i].energy})`);
    } else counts[st] = (counts[st] || 0) + 1;
    prev = st;
  }
  if (accentN > RULES.accentTextMax) bad(`vurgu yazısı (lyric/kinetic) ${accentN} > ${RULES.accentTextMax}`);
  const distinct = Object.keys(counts).length;
  const regularN = Object.values(counts).reduce((a, c) => a + c, 0);
  if (regularN) {
    const need = Math.min(RULES.textStylesMin, regularN, allowed.textStyle.filter((s) => !ACCENT_TEXT.has(s)).length);
    if (distinct < need) bad(`yazı stili sayısı ${distinct} < ${need}`);
    if (distinct > RULES.textStylesMax) bad(`yazı stili sayısı ${distinct} > ${RULES.textStylesMax}`);
    const cap = textCap(tIdx.length);
    for (const [k, c] of Object.entries(counts)) if (c > cap) bad(`yazı stili ${k} ${c}/${tIdx.length} sahnede (tavan ${cap})`);
  }
  S.forEach((s, i) => { if (s.textStyle && !tIdx.includes(i)) bad(`#${i}: yazı sahnesi olmayan sahnede textStyle`); });
  // sayaç çizimleri: ardışık iki sayaç aynı değil, 3+ sayaçta en az 3 çeşit, döneme/türe uygun, photo'nun önünde resim
  let prevC = null;
  const cUsed = new Set();
  let cN = 0;
  for (const i of ctx.counter) {
    const st = S[i].counterStyle;
    if (!st) { prevC = null; continue; }
    cN++;
    if (!allowed.counterStyle.includes(st)) bad(`#${i}: sayaç stili ${st} bu dönem/tür için geçersiz`);
    if (st === prevC) bad(`#${i}: ardışık sayaç aynı stil (${st})`);
    if (st === "photo" && !counterPicOk(S, i)) bad(`#${i}: photo sayacın önünde resim yok`);
    cUsed.add(st);
    prevC = st;
  }
  const cNeed = Math.min(RULES.counterStylesMin, allowed.counterStyle.length);
  if (cN >= 3 && cUsed.size < cNeed) bad(`sayaç stili sayısı ${cUsed.size} < ${cNeed}`);
  S.forEach((s, i) => { if (s.counterStyle && s.type !== "counter") bad(`#${i}: sayaç olmayan sahnede counterStyle`); });
  // geçişler
  const trCount = {};
  let lastTr = null;
  S.forEach((s, i) => {
    const t = s.transition;
    if (!t) return;
    if (!allowed.transition.includes(t)) bad(`#${i}: geçiş ${t} geçersiz`);
    if (t === "cut") return;
    if (t === lastTr) bad(`#${i}: aynı geçiş art arda (${t})`);
    if (NEEDS_PICTURES.has(t) && !(i > 0 && showsPicture(S[i - 1]) && showsPicture(s))) bad(`#${i}: ${t} geçişi iki resim arasında olmalı`);
    if (HEAVY_TRANSITIONS.has(t) && i > 0 && !isTurn(S[i - 1], s)) bad(`#${i}: ağır geçiş ${t} duygu/hikâye dönüşü olmayan kesmede`);
    if (GENTLE_MOODS.has(moodOf(s)) && LOUD_TRANSITIONS.has(t) && s.type !== "slam") bad(`#${i}: ${moodOf(s)} sahneye sert geçiş ${t}`);
    trCount[t] = (trCount[t] || 0) + 1;
    lastTr = t;
  });
  const byUse = Object.entries(trCount).sort((a, b) => b[1] - a[1]);
  const accentUses = byUse.slice(RULES.paletteMax).reduce((a, [, c]) => a + c, 0);
  if (accentUses > RULES.accentUses) bad(`paletin dışında ${accentUses} geçiş (tavan ${RULES.accentUses})`);
  const styled = byUse.reduce((a, [, c]) => a + c, 0);
  if (styled >= 8 && byUse.length < RULES.paletteMin) bad(`geçiş paleti ${byUse.length} tür (< ${RULES.paletteMin})`);
  {
    const elig = S.map((s, i) => i).filter((i) => i > 0 && !isCard(S[i]) && (S[i].type === "slam" || (S[i].energy >= 3 && chOf(S[i]) === chOf(S[i - 1]))));
    const st = elig.filter((i) => S[i].transition && S[i].transition !== "cut").length;
    if (elig.length >= 12 && st / elig.length < RULES.minStyledShare) bad(`süslü geçiş az: ${st}/${elig.length} uygun sınır (en az %${RULES.minStyledShare * 100})`);
  }
  if (tIdx.length >= 4 && allowed.textStyle.some((x) => IMPACT_TEXT.includes(x)) && !tIdx.some((i) => IMPACT_TEXT.includes(S[i].textStyle))) bad("yazı paletinde vurucu stil yok (box/kinetic/stamp/outline/stack...)");
  // efektler
  const fxScenes = S.map((s, i) => (Array.isArray(s.fx) && s.fx.length ? i : -1)).filter((i) => i >= 0);
  if (fxScenes.length > fxCap(ctx.n)) bad(`efektli sahne ${fxScenes.length} > tavan ${fxCap(ctx.n)}`);
  {
    const picsFx = ctx.grade;
    const withFx = picsFx.filter((i) => S[i].fx?.length).length;
    if (picsFx.length >= 10 && withFx / picsFx.length < RULES.minPictureFxShare) bad(`resimli sahnelerde efekt az: ${withFx}/${picsFx.length} (en az %${RULES.minPictureFxShare * 100})`);
  }
  let prevFx = null;
  let lastStrongAt = -Infinity;
  for (const i of fxScenes) {
    const s = S[i];
    const f = s.fx;
    if (new Set(f).size !== f.length) bad(`#${i}: aynı efekt iki kez`);
    for (const k of f) {
      if (!allowed.fx.includes(k)) bad(`#${i}: efekt ${k} geçersiz`);
      if (!fxFits(s, k)) bad(`#${i}: efekt ${k} bu sahneye uymuyor (resim/klip yok)`);
      if (prevFx && prevFx.includes(k)) bad(`#${i}: aynı efekt art arda (${k})`);
      if (GENTLE_MOODS.has(moodOf(s)) && !GENTLE_FX.has(k) && !(s.type === "slam" && HIT_FX.includes(k))) bad(`#${i}: ${moodOf(s)} sahnede sert efekt ${k}`);
      if (STRONG_FX.has(k)) {
        if (!STRONG_MOODS.has(moodOf(s))) bad(`#${i}: sert efekt ${k} gerilim/ifşa anı değil (${moodOf(s)})`);
        if (ctx.starts[i] - lastStrongAt < RULES.strongFxGapSec) bad(`#${i}: sert efekt önceki sertten ${Math.round(ctx.starts[i] - lastStrongAt)} sn sonra`);
        lastStrongAt = ctx.starts[i];
      }
    }
    prevFx = f;
  }
  // renk derecelendirmesi
  const chGrades = {};
  S.forEach((s, i) => {
    if (!s.grade) return;
    if (!isGradeScene(s)) bad(`#${i}: resimsiz sahnede grade`);
    if (!allowed.grade.includes(s.grade)) bad(`#${i}: grade ${s.grade} bu dönem için geçersiz`);
    (chGrades[chOf(s)] ||= new Set()).add(s.grade);
  });
  (script.chapterLooks || []).forEach((c, k) => {
    if (c?.grade) {
      if (!allowed.grade.includes(c.grade)) bad(`bölüm ${k + 1}: grade ${c.grade} bu dönem için geçersiz`);
      (chGrades[k] ||= new Set()).add(c.grade);
    }
    if (c?.accent && !HEX.test(c.accent)) bad(`bölüm ${k + 1}: accent ${c.accent} geçersiz`);
    if (c?.backdrop && !BACKDROP_KINDS.includes(c.backdrop.kind)) bad(`bölüm ${k + 1}: backdrop geçersiz`);
  });
  for (const [c, set] of Object.entries(chGrades)) if (set.size > RULES.gradesPerChapter) bad(`bölüm ${+c + 1}: ${set.size} farklı grade (${[...set].join(", ")})`);
  // kamera ve kadraj
  const pics = ctx.grade;
  const cams = {};
  let still = 0;
  let lastAccent = -Infinity;
  S.forEach((s, i) => {
    if ((s.camera || s.fit) && !isGradeScene(s)) bad(`#${i}: resimsiz sahnede camera/fit`);
    if (s.fit && !FITS.includes(s.fit)) bad(`#${i}: fit ${s.fit} geçersiz`);
  });
  pics.forEach((i, k) => {
    const s = S[i];
    const cam = s.camera;
    if (!cam) { bad(`#${i}: resimli sahnenin kamerası yok`); return; }
    cams[i] = cam;
    if (!CAMERAS.includes(cam)) bad(`#${i}: kamera ${cam} geçersiz`);
    if (STILL_CAMS.has(cam)) still++;
    if (k >= RULES.cameraRun && pics.slice(k - RULES.cameraRun, k).every((j) => S[j].camera === cam)) bad(`#${i}: aynı kamera (${cam}) ${RULES.cameraRun + 1} ardışık resimli sahnede`);
    if (cam === "handheld" && moodOf(s) !== "tension") bad(`#${i}: handheld yalnızca gerilim anında (${moodOf(s)})`);
    if (ACCENT_CAMS.has(cam)) {
      if (ctx.starts[i] - lastAccent < RULES.cameraAccentGapSec) bad(`#${i}: kamera vurgusu ${cam} öncekinden ${Math.round(ctx.starts[i] - lastAccent)} sn sonra`);
      lastAccent = ctx.starts[i];
    }
    const a = aspectOf(s);
    if (a !== null && a > 1.9 && !(PAN_CAMS.has(cam) || STILL_CAMS.has(cam))) bad(`#${i}: geniş resim (${a.toFixed(2)}) kaydırma ister, ${cam} değil`);
    if (a !== null && a < 1 && !(TILT_CAMS.has(cam) || STILL_CAMS.has(cam)) && s.fit !== "contain") bad(`#${i}: dikey resim (${a.toFixed(2)}) tilt ya da contain ister`);
    if (isTextualPicture(s) && s.fit !== "contain") bad(`#${i}: belge/yazılı resim contain ister`);
    if (Array.isArray(s.fx) && s.fx.includes(cam)) bad(`#${i}: kamera ${cam} efekt olarak da verilmiş`);
  });
  // tempo (enerji dalgası)
  const E = S.map((s) => (isCard(s) ? null : s.energy));
  const own = S.map((s, i) => (isCard(s) ? -1 : i)).filter((i) => i >= 0);
  let runHi = 0;
  for (const i of own) {
    const s = S[i];
    const e = E[i];
    if (!isInt(e) || e < 1 || e > 5) { bad(`#${i}: enerji yok/geçersiz (${e})`); runHi = 0; continue; }
    if (s.pace !== paceOf(e)) bad(`#${i}: pace ${s.pace} enerji ${e} ile uyuşmuyor (${paceOf(e)})`);
    runHi = e >= 4 ? runHi + 1 : 0;
    if (runHi > RULES.energyRunMax) bad(`#${i}: ${runHi} ardışık yüksek enerjili sahne (tavan ${RULES.energyRunMax})`);
    if (e >= 4 && !peakEligible(s)) bad(`#${i}: zirve (${e}) gerilim/ifşa/slam/montaj anında değil (${s.type} ${moodOf(s)})`);
    const prevE = i > 0 ? E[i - 1] : null;
    if (isInt(prevE) && prevE >= 4 && e < 4) {
      if (e !== 1) bad(`#${i}: zirveden sonra nefes yok (enerji ${e})`);
      if (s.camera && s.camera !== "static") bad(`#${i}: nefes sahnesi durağan kamera ister (${s.camera})`);
      if (s.transition && s.transition !== "cut") bad(`#${i}: nefes sahnesine süslü geçiş (${s.transition})`);
    }
    if (e <= 2 && Array.isArray(s.fx) && s.fx.length) bad(`#${i}: düşük enerjide (${e}) efekt`);
    if (e < 5 && (s.fx || []).some((k) => STRONG_FX.has(k))) bad(`#${i}: sert efekt yalnızca enerji 5'te (${e})`);
    if (e <= 2 && s.transition && s.transition !== "cut") bad(`#${i}: düşük enerjiye (${e}) süslü geçiş ${s.transition}`);
    if (s.camera && !cameraEnergyOk(e, s.camera)) bad(`#${i}: kamera ${s.camera} enerji ${e} ile uyuşmuyor`);
  }
  // slam ve kanca: vurucu stil, enerji 5, vuruş efekti, keskin giriş; kanca kinetic
  let prevSlam = null;
  for (const i of own) {
    const s = S[i];
    if (isImpactScene(s) && s.textStyle && (!IMPACT_TEXT.includes(s.textStyle) || SLAM_FORBIDDEN.has(s.textStyle))) bad(`#${i}: ${s.type} vurucu olmayan stil ${s.textStyle} (küçük/ince görünür)`);
    if (s.type !== "slam") continue;
    if (prevSlam && s.textStyle && s.textStyle === prevSlam.textStyle) bad(`#${i}: ardışık iki slam aynı vurucu stil (${s.textStyle})`);
    prevSlam = s;
    if (s.energy !== 5) bad(`#${i}: slam enerjisi ${s.energy} (5 olmalı)`);
    if (!(s.fx || []).some((k) => HIT_FX.includes(k))) bad(`#${i}: slam vuruş efekti yok (${(s.fx || []).join(",") || "-"})`);
    if (i > 0 && !SHARP_TRANSITIONS.has(s.transition)) bad(`#${i}: slam'e keskin geçiş yok (${s.transition})`);
  }
  const hk = allowed.textStyle.includes("kinetic") ? hookIndex(S, ctx.starts) : -1;
  if (hk >= 0 && S[hk].textStyle !== "kinetic") bad(`#${hk}: kanca (ilk ${RULES.hookKineticSec} sn) kinetic değil (${S[hk].textStyle})`);
  if (own.length >= 20 && own.every((i) => isInt(E[i]))) {
    const share = (f) => own.filter((i) => f(E[i])).length / own.length;
    const sh = { low: share((e) => e <= 2), mid: share((e) => e === 3), high: share((e) => e >= 4) };
    for (const k of ["low", "mid", "high"]) {
      const [lo, hi] = RULES.energyRange[k];
      if (sh[k] < lo || sh[k] > hi) bad(`enerji dağılımı: ${k} %${Math.round(sh[k] * 100)} (aralık %${lo * 100}-${hi * 100})`);
    }
  }
  for (let c = 0; c < ctx.nCh; c++) {
    const ci = own.filter((i) => chOf(S[i]) === c);
    if (ci.length < RULES.chapterWaveMin) continue;
    if (!ci.some((i, k) => k > 0 && E[i] <= 2 && E[ci[k - 1]] <= 2 && ci[k - 1] === i - 1)) bad(`bölüm ${c + 1}: düşük enerjili (<=2) bir soluklanma bölümü yok`);
    if (ci.some((i) => peakEligible(S[i])) && !ci.some((i) => E[i] >= 4)) bad(`bölüm ${c + 1}: zirve (>=4) yok`);
  }
  if (pics.length >= 6) {
    const share = still / pics.length;
    if (share < RULES.stillMin || share > RULES.stillMax) bad(`durağan kamera payı %${Math.round(share * 100)} (hedef %${Math.round(RULES.stillMin * 100)}-${Math.round(RULES.stillMax * 100)})`);
  }
  // ekran yazısı kararı (words)
  S.forEach((s, i) => {
    if (s.textMode === undefined) return;
    if (s.type !== "words") { bad(`#${i}: words olmayan sahnede textMode`); return; }
    if (!CAPTION_MODES.includes(s.textMode)) { bad(`#${i}: textMode ${s.textMode} geçersiz`); return; }
    const f = captionFacts(s);
    if (s.textMode === "none" && (f.info || f.quote)) bad(`#${i}: bilgi/alıntı taşıyan satır yazısız bırakılmış`);
    if (s.textMode === "none" && !showsPicture(s)) bad(`#${i}: resimsiz sahne yazısız bırakılmış`);
    if (s.textMode === "key" && !f.keyword) bad(`#${i}: key yazısı için anahtar kelime yok`);
  });
  // zeminler: büyük yazı boş zeminde durmaz (related/era; düz zemin yalnızca sessizlik anı)
  let silenceN = 0;
  S.forEach((s, i) => {
    const b = s.backdrop;
    if (!b || !BIG_TEXT_TYPES.has(s.type) || !isBackdropScene(s)) return;
    if (SILENCE_BACKDROPS.has(b.kind)) {
      if (s.energy !== 1 || !(s.silence === true || GENTLE_MOODS.has(moodOf(s)))) bad(`#${i}: büyük yazı düz zeminde (${b.kind}) — yalnızca sessizlik anı (enerji 1, sakin/hüzünlü)`);
      else if (++silenceN > SILENCE_BEATS_MAX) bad(`#${i}: düz zeminli sessizlik anı ${silenceN} > ${SILENCE_BEATS_MAX}`);
    } else if (!RELATED_BACKDROPS.has(b.kind)) bad(`#${i}: büyük yazı boş zeminde (${b.kind}) — ilgili resim (related) ya da dönem dokusu (era) olmalı`);
    if (b.kind === "era" && b.variant !== undefined && !ERA_TEXTURES.includes(b.variant)) bad(`#${i}: era dokusu ${b.variant} geçersiz`);
  });
  let light = 0;
  S.forEach((s, i) => {
    const b = s.backdrop;
    if (!b) return;
    if (!isBackdropScene(s)) bad(`#${i}: resmin üstündeki sahnede backdrop`);
    if (!allowed.backdrop.includes(b.kind)) bad(`#${i}: backdrop ${b.kind} geçersiz`);
    for (const k of ["color", "color2"]) if (b[k] !== undefined && !HEX.test(b[k])) bad(`#${i}: backdrop ${k} geçersiz`);
    if (isLightBackdrop(b)) light++;
  });
  const needLight = Math.min(RULES.lightBackdropsMin, ctx.backdrop.length);
  if (light < needLight) bad(`açık/renkli zemin ${light} < ${needLight} (hepsi koyu)`);
  // açılış (script.opening): uygun tür, dönem, kanal genelinde son 2 videodan farklı (docu-opening.js)
  for (const m of checkOpening(script, { history, eraStart: ctx.era?.start ?? null })) bad(m);
  return v;
}

/* ================================================================ planlayıcı */

const INTENSITY = { calm: 0, sad: 0.2, curious: 0.35, triumph: 0.5, tension: 0.7, dread: 0.8, reveal: 0.9 };
const WARMTH = { calm: 1, triumph: 1, curious: 0.3, sad: -0.6, tension: -0.5, dread: -1, reveal: 0 };
const FAMILY_ACCENTS = {
  warm: ["#f2a93b", "#e8c170", "#ffb347", "#f4d35e", "#e9a45b"],
  cold: ["#5fa8d3", "#8ecae6", "#7a9cc6", "#9bb7d4", "#6fb1c8"],
  dread: ["#8fb3a0", "#7d8ca3", "#a3b18a", "#94a3b8"],
  sad: ["#9aa5b8", "#b8a9c9", "#a7b4c2"],
  climax: ["#e63946", "#d62828", "#ff3b30", "#c1121f"],
};
const FAMILY_GRADES = {
  warm: ["warm", "kodachrome", "sepia", "color", "teal-orange"],
  cold: ["cool", "cyanotype", "mono", "bleach", "teal-orange"],
  dread: ["mono", "bleach", "cool", "duotone", "vhs"],
  sad: ["mono", "cool", "sepia", "color"],
  climax: ["bleach", "duotone", "teal-orange", "mono", "vhs"],
};
const ROLE_TEXT = {
  slam: ["stamp", "cutout", "stack", "outline", "glitch", "neon", "box"],
  title: ["serif", "stack", "outline", "typewriter", "lower-third"],
  montage: ["typewriter", "stack", "outline", "box", "lower-third"],
};
const MOOD_TEXT = {
  tension: ["box", "marker", "typewriter", "cutout", "glitch", "underline"],
  dread: ["typewriter", "outline", "serif", "box", "glitch", "lower-third"],
  reveal: ["stamp", "outline", "stack", "neon", "marker", "cutout"],
  curious: ["underline", "marker", "lower-third", "box", "typewriter", "serif"],
  calm: ["serif", "underline", "lower-third", "typewriter", "outline"],
  sad: ["serif", "underline", "lower-third", "typewriter", "outline"],
  triumph: ["stack", "outline", "neon", "serif", "marker"],
};
const MOOD_FX = {
  tension: ["push-in", "zoom-blur", "rack-focus", "shake", "chroma", "flash-frame", "vignette-pulse", "speed-ramp", "dolly-zoom", "scan-lines"],
  reveal: ["dolly-zoom", "flash-frame", "flare", "glitch", "film-burn", "push-in", "zoom-blur", "chroma"],
  dread: ["vignette-pulse", "dust", "rack-focus", "push-in", "scan-lines", "halftone", "tilt-reveal", "vhs"],
  curious: ["parallax", "tilt-reveal", "push-in", "light-leak", "halftone", "rack-focus", "dust"],
  calm: ["light-leak", "bokeh", "parallax", "dust", "tilt-reveal", "rack-focus"],
  sad: ["vignette-pulse", "dust", "rack-focus", "bokeh", "push-in"],
  triumph: ["flare", "light-leak", "bokeh", "push-in", "tilt-reveal", "parallax"],
};
const MOOD_CAM = {
  tension: ["push-in", "handheld", "detail-punch", "rack-focus", "pan-left", "pan-right", "pull-out"],
  reveal: ["push-in", "pull-out", "detail-punch", "rack-focus", "tilt-down"],
  dread: ["push-in", "tilt-down", "pull-out", "rack-focus", "pan-right"],
  curious: ["pan-left", "pan-right", "tilt-up", "parallax", "pull-out", "push-in"],
  calm: ["pull-out", "tilt-up", "pan-left", "push-in", "parallax"],
  sad: ["pull-out", "push-in", "tilt-down", "pan-right"],
  triumph: ["tilt-up", "pull-out", "parallax", "pan-left", "push-in"],
};
const FX_WEIGHT = { reveal: 0.65, tension: 0.4, dread: 0.35, triumph: 0.35, curious: 0.2, calm: 0.15, sad: 0.15 };

function makeBackdrop(kind, accent, look, light) {
  const L = look.light, D = look.dark;
  switch (kind) {
    case "paper": return { kind, color: L };
    case "blueprint": return { kind, color: "#123a5e", color2: "#d8e8f5" };
    case "halftone": return light ? { kind, color: L, color2: accent } : { kind, color: D, color2: accent };
    case "split-color": return light ? { kind, color: L, color2: accent } : { kind, color: accent, color2: D };
    case "gradient": return light ? { kind, color: L, color2: accent } : { kind, color: D, color2: accent };
    case "blur": return { kind };
    case "related": return light ? { kind, tone: "light", color: L } : { kind, tone: "dark", color: D };
    case "era": return light ? { kind, tone: "light" } : { kind, tone: "dark", variant: "film" };
    case "texture": return { kind, color: light ? L : D };
    default: return { kind: "solid", color: light ? L : D };
  }
}

const MOOD_ENERGY = { calm: 1, sad: 1.2, curious: 2, dread: 2.9, tension: 3.3, triumph: 3.3, reveal: 4 };
const TYPE_ENERGY = { slam: 1.2, montage: 1.2, counter: 0.3, title: -0.3, board: -0.3, document: -0.3, timeline: -0.4, map: -0.3, quote: -0.2 };

/**
 * Enerji dalgası (1-5, bölüm kartı null). Puan = duygu + tip + bölüm içi konum (başta
 * anlatım, sonda yükseliş) + tohum; model önerisi varsa sıralamayı o belirler. Sonra
 * kurallar: zirve yalnızca uygun anda, en çok 3 ardışık, her zirveden sonra nefes (1),
 * her bölümde bir zirve ve iki sahnelik soluklanma, video geneli ~%40/%35/%25.
 */
export function planEnergy(ctx, { prop = null, rnd, climax = -1 } = {}) {
  const S = ctx.scenes;
  const own = S.map((s, i) => (isCard(s) ? -1 : i)).filter((i) => i >= 0);
  const N = own.length;
  const E = S.map(() => null);
  if (!N) return E;
  const chList = {};
  for (const i of own) (chList[chOf(S[i])] ||= []).push(i);
  const score = {};
  for (const i of own) {
    const s = S[i];
    const list = chList[chOf(s)];
    const pos = list.length > 1 ? list.indexOf(i) / (list.length - 1) : 0.5;
    const wave = pos < 0.15 ? -1 : pos < 0.35 ? -0.3 : pos < 0.7 ? 0.2 : 0.6;
    const base = (MOOD_ENERGY[moodOf(s)] ?? 2) + (TYPE_ENERGY[s.type] ?? 0) + wave + (i === 0 ? 1 : 0) + (isTextualPicture(s) ? -0.4 : 0) + (chOf(s) === climax ? 0.3 : 0);
    const pe = prop?.scenes?.[i]?.energy;
    score[i] = isInt(pe) && pe >= 1 && pe <= 5 ? pe * 1.2 + base * 0.3 + rnd(`en${i}`) * 0.2 : base + rnd(`en${i}`) * 0.8;
  }
  const hi = new Set();
  const runWith = (i) => {
    let r = 1;
    for (let j = i - 1; j >= 0 && hi.has(j); j--) r++;
    for (let j = i + 1; j < S.length && hi.has(j); j++) r++;
    return r;
  };
  const canHi = (i) => peakEligible(S[i]) && !hi.has(i) && runWith(i) <= RULES.energyRunMax;
  // her slam bir vuruştur: enerji 5 (önce yerleşir)
  const isSlam = (i) => S[i]?.type === "slam";
  for (const i of own) if (isSlam(i) && canHi(i)) hi.add(i);
  // her (yeterince uzun) bölümün en güçlü uygun anı zirve olur
  for (const list of Object.values(chList)) {
    const best = list.filter(canHi).sort((a, b) => score[b] - score[a])[0];
    if (best !== undefined && (list.length >= RULES.chapterWaveMin || score[best] >= 4)) hi.add(best);
  }
  const targetHi = Math.round(RULES.energyTarget.high * N);
  for (const i of [...own].sort((a, b) => score[b] - score[a])) {
    if (hi.size >= targetHi) break;
    if (canHi(i)) hi.add(i);
  }
  // Nefes resimleri (hepsi static) resim sırasında üçlü dizi kurmasın: aradaki zirve bırakılır.
  const picOrder = own.filter((i) => isGradeScene(S[i]));
  const breathsNow = () => new Set(own.filter((i) => !hi.has(i) && hi.has(i - 1)));
  for (let guard = 0; guard < 40; guard++) {
    const br = breathsNow();
    let fixed = false;
    for (let k = 2; k < picOrder.length && !fixed; k++) {
      const tri = [picOrder[k - 2], picOrder[k - 1], picOrder[k]];
      if (!tri.every((x) => br.has(x))) continue;
      // zirvesi bırakılabilecek (bölümünde başka zirve kalan) nefesi seç
      for (const b of [tri[1], tri[2], tri[0]]) {
        const run = [];
        for (let j = b - 1; hi.has(j); j--) run.push(j);
        if (run.some(isSlam)) continue; // slam vuruşu bırakılmaz
        const c = chOf(S[b - 1]);
        if ([...hi].some((x) => chOf(S[x]) === c && !run.includes(x))) { run.forEach((x) => hi.delete(x)); fixed = true; break; }
      }
      if (!fixed) for (const b of tri) {
        const run = [];
        for (let j = b - 1; hi.has(j); j--) run.push(j);
        if (run.length && !run.some(isSlam)) { run.forEach((x) => hi.delete(x)); fixed = true; break; }
      }
    }
    if (!fixed) break;
  }
  const breath = breathsNow();
  const low = new Set(breath);
  const rest = own.filter((i) => !hi.has(i) && !breath.has(i)).sort((a, b) => score[a] - score[b]);
  for (const i of rest) { if (low.size >= Math.round(RULES.energyTarget.low * N)) break; low.add(i); }
  // her bölümde en az iki ardışık düşük sahne (soluklanma); bulunan çiftler korunur
  const keep = new Set();
  for (const list of Object.values(chList)) {
    if (list.length < RULES.chapterWaveMin) continue;
    const k0 = list.findIndex((i, k) => k > 0 && low.has(i) && low.has(list[k - 1]) && list[k - 1] === i - 1);
    if (k0 > 0) { keep.add(list[k0]); keep.add(list[k0 - 1]); continue; }
    let best = null;
    for (let k = 1; k < list.length; k++) {
      const a = list[k - 1], b = list[k];
      if (b !== a + 1 || hi.has(a) || hi.has(b)) continue;
      const sc = score[a] + score[b] - (low.has(a) || low.has(b) ? 5 : 0);
      if (!best || sc < best.sc) best = { a, b, sc };
    }
    if (!best) continue;
    const added = [best.a, best.b].filter((x) => !low.has(x));
    added.forEach((x) => low.add(x));
    keep.add(best.a); keep.add(best.b);
    // dağılım korunsun: en yüksek puanlı, nefes olmayan başka bir düşük sahne orta olur
    for (const _ of added) {
      const give = [...low].filter((x) => !breath.has(x) && !keep.has(x)).sort((x, y) => score[y] - score[x])[0];
      if (give !== undefined && low.size > Math.round(RULES.energyTarget.low * N)) low.delete(give);
    }
  }
  // seviyeler: zirve dizisinin tepesi (ifşa/slam/montaj/doruk bölümü) 5, diğer zirveler 4;
  // nefes 1; düşükler sakin/hüzünlü ise 1 (resimli 1'ler durağan payını aşmasın), değilse 2.
  const pics = own.filter((i) => isGradeScene(S[i]));
  const maxOnePics = Math.floor(0.27 * pics.length);
  let onePics = pics.filter((i) => breath.has(i)).length;
  for (const i of own) {
    if (hi.has(i)) {
      let a = i, b = i;
      while (hi.has(a - 1)) a--;
      while (hi.has(b + 1)) b++;
      let apex = a;
      for (let j = a; j <= b; j++) if (score[j] > score[apex]) apex = j;
      const s = S[i];
      const strong = moodOf(s) === "reveal" || s.type === "slam" || s.type === "montage" || chOf(s) === climax;
      const pe = prop?.scenes?.[i]?.energy;
      E[i] = isSlam(i) ? 5 : isInt(pe) && pe >= 4 && pe <= 5 ? pe : i === apex && strong ? 5 : 4;
    } else if (breath.has(i)) E[i] = 1;
    else if (low.has(i)) {
      const pe = prop?.scenes?.[i]?.energy;
      const wantOne = isInt(pe) ? pe === 1 : GENTLE_MOODS.has(moodOf(S[i])) && rnd(`e1${i}`) < 0.6;
      const pic = isGradeScene(S[i]);
      if (wantOne && (!pic || onePics < maxOnePics)) { E[i] = 1; if (pic) onePics++; } else E[i] = 2;
    } else E[i] = 3;
  }
  return E;
}

/**
 * Kuralları sağlayan planı kurar. `prop` (model önerisi) verilirse her öneri kurala
 * uyuyorsa kabul edilir, uymuyorsa yerine belirleyici seçim yapılır. Öneri yoksa
 * tamamen belirleyici (tohum + geçmiş).
 */
export function buildPlan(script, { prop = null, history = [], catalogs = loadCatalogs() } = {}) {
  const ctx = artContext(script, catalogs);
  const { scenes: S, n, allowed, genre, seed } = ctx;
  const rnd = (tag) => hash01(`${seed}|${tag}`);
  const byRnd = (list, tag) => [...list].sort((a, b) => rnd(`${tag}|${a}`) - rnd(`${tag}|${b}`));
  const notes = [];

  // 1) Görünüm varyantı: türün son 3 videosundan farklı.
  const { pool, open, recent } = openLooks(script, catalogs, history);
  const lastUse = (id) => { const k = history.map((e) => e.genre === genre && e.variant).lastIndexOf(id); return k; };
  let look = prop?.variant && open.find((l) => l.id === prop.variant);
  if (prop?.variant && !look) notes.push(`model görünümü ${prop.variant} reddedildi (son videolarda kullanıldı, döneme uymuyor ya da yok)`);
  const T = ctx.topic;
  if (!look && T) {
    // Konunun önerdiği varyantlar (sırayla), yoksa yazı ailesiyle en çok örtüşen açık görünüm.
    look = T.variants.map((id) => open.find((l) => l.id === id && !l.original)).find(Boolean) || null;
    if (!look && T.textStyles.length) {
      const fit = (l) => l.textStyles.filter((x) => T.textStyles.includes(x)).length + (T.grade && l.grades.includes(T.grade) ? 1 : 0);
      const best = [...open].filter((l) => !l.original).sort((a, b) => fit(b) - fit(a) || rnd(`tlook|${a.id}`) - rnd(`tlook|${b.id}`))[0];
      if (best && fit(best) >= 2) look = best;
    }
    if (look) notes.push(`konu kimliği (${T.motif}) görünümü seçti: ${look.id}`);
  }
  if (!look) {
    // özgün görünüm (tekdüzelik şikâyeti) yalnızca başka seçenek yoksa
    const ranked = [...open].sort((a, b) => (a.original ? 1 : 0) - (b.original ? 1 : 0) || lastUse(a.id) - lastUse(b.id) || rnd(`look|${a.id}`) - rnd(`look|${b.id}`));
    const never = ranked.filter((l) => lastUse(l.id) < 0 && !l.original);
    look = (never.length ? byRnd(never.map((l) => l.id), "look").map((id) => never.find((l) => l.id === id)) : ranked)[0] || pool[0];
  }
  const recentStyles = new Map();
  for (const e of recent) for (const s of e.textStyles || []) recentStyles.set(s, (recentStyles.get(s) || 0) + 1);
  const recentTr = new Map();
  for (const e of recent) for (const s of e.transitions || []) recentTr.set(s, (recentTr.get(s) || 0) + 1);

  // 2) Yazı stili kümesi (4-6, en az 3'ü yumuşak).
  const nT = ctx.text.length;
  const cap = textCap(nT);
  const regAllowed = allowed.textStyle.filter((s) => !ACCENT_TEXT.has(s));
  const accAllowed = allowed.textStyle.filter((s) => ACCENT_TEXT.has(s));
  const topicLeads = (ctx.topic?.textStyles || []).filter((s) => regAllowed.includes(s) && !ACCENT_TEXT.has(s));
  const leads = [...new Set([...topicLeads.slice(0, 4), ...(look.leadText || []).filter((s) => regAllowed.includes(s))])];
  const lookStyles = look.textStyles.filter((s) => regAllowed.includes(s) && !leads.includes(s));
  const needSet = Math.min(RULES.textStylesMax, Math.max(RULES.textStylesMin, Math.ceil(nT / cap)));
  let textSet = [];
  const propSet = only(prop?.textStyles, regAllowed);
  // Konu kimliğinin yazı ailesi bağlayıcıdır: modelin kümesi onun en az üçünü taşımıyorsa kabul edilmez.
  const topicOk = (set) => topicLeads.length < 3 || set.filter((x) => topicLeads.includes(x)).length >= 3;
  if (propSet.length >= Math.min(RULES.textStylesMin, regAllowed.length) && propSet.length <= RULES.textStylesMax && topicOk(propSet)) textSet = propSet;
  else {
    const size = Math.min(regAllowed.length, Math.max(needSet, RULES.textStylesMin + Math.floor(rnd("tsize") * 2)));
    // görünümün imza stilleri önce, sonra son videolarda az kullanılanlar
    const ranked = [...lookStyles].sort((a, b) => (recentStyles.get(a) || 0) - (recentStyles.get(b) || 0) || rnd(`ts|${a}`) - rnd(`ts|${b}`));
    textSet = [...leads, ...ranked].slice(0, size);
    for (const s of byRnd(regAllowed, "tsx")) if (textSet.length < size && !textSet.includes(s)) textSet.push(s);
  }
  const gentleSet = () => textSet.filter((s) => !LOUD_TEXT.has(s));
  for (const s of byRnd(regAllowed.filter((x) => !LOUD_TEXT.has(x)), "tsg")) {
    if (gentleSet().length >= Math.min(3, textSet.length)) break;
    if (textSet.includes(s)) continue;
    const loud = textSet.findIndex((x) => LOUD_TEXT.has(x));
    if (loud >= 0 && textSet.length >= RULES.textStylesMax) textSet.splice(loud, 1, s);
    else textSet.push(s);
  }
  textSet = textSet.slice(0, RULES.textStylesMax);

  // 3) Geçiş paleti (3-4 süslü tür, en az biri yumuşak) + nadir vurgular.
  const trAllowed = allowed.transition.filter((t) => t !== "cut");
  let palette = only(prop?.transitions, trAllowed);
  if (palette.length < RULES.paletteMin || palette.length > RULES.paletteMax) {
    const size = RULES.paletteMin + (rnd("psize") < 0.5 ? 0 : 1);
    const lookTr = look.transitions.filter((t) => trAllowed.includes(t));
    palette = [...lookTr].sort((a, b) => (recentTr.get(a) || 0) - (recentTr.get(b) || 0) || rnd(`tr|${a}`) - rnd(`tr|${b}`)).slice(0, size);
    for (const t of byRnd(trAllowed, "trx")) if (palette.length < size && !palette.includes(t)) palette.push(t);
  }
  if (!palette.some((t) => !LOUD_TRANSITIONS.has(t) && !HEAVY_TRANSITIONS.has(t))) {
    const soft = byRnd(trAllowed.filter((t) => !LOUD_TRANSITIONS.has(t) && !HEAVY_TRANSITIONS.has(t)), "trs")[0];
    if (soft) palette[palette.length >= RULES.paletteMax ? palette.length - 1 : palette.length] = soft;
  }
  // Slam'ler keskin bir girişle gelir: paletin en az iki keskin türü olsun (art arda iki slam aynı geçişi almasın).
  const hasSlams = S.some((s) => s.type === "slam");
  const sharpAllowed = trAllowed.filter((t) => SHARP_TRANSITIONS.has(t));
  if (hasSlams) {
    const isSoft = (t) => !LOUD_TRANSITIONS.has(t) && !HEAVY_TRANSITIONS.has(t);
    for (const t of byRnd(sharpAllowed.filter((x) => !palette.includes(x)), "trsharp")) {
      if (palette.filter((x) => SHARP_TRANSITIONS.has(x)).length >= Math.min(2, sharpAllowed.length)) break;
      if (palette.length < RULES.paletteMax) { palette.push(t); continue; }
      const softN = palette.filter(isSoft).length;
      const k = palette.findIndex((x) => !SHARP_TRANSITIONS.has(x) && !(isSoft(x) && softN <= 1));
      if (k >= 0) palette[k] = t;
    }
  }
  let accents = only(prop?.accents, trAllowed).filter((t) => !palette.includes(t)).slice(0, 3);
  if (!accents.length) accents = byRnd(trAllowed.filter((t) => !palette.includes(t)), "acc").slice(0, 2);

  // 4) Bölüm renk yolculuğu.
  const C = ctx.nCh;
  const chStats = Array.from({ length: C }, (_, c) => {
    const ms = S.filter((s) => chOf(s) === c && !isCard(s)).map(moodOf);
    const m = ms.length || 1;
    const share = (x) => ms.filter((y) => y === x).length / m;
    return { intensity: ms.reduce((a, x) => a + (INTENSITY[x] ?? 0.4), 0) / m, warmth: ms.reduce((a, x) => a + (WARMTH[x] ?? 0), 0) / m, reveal: share("reveal"), dread: share("dread"), sad: share("sad"), n: ms.length };
  });
  let climax = -1;
  if (C >= 3) {
    let best = -1;
    for (let c = Math.floor(C * 0.4); c < C; c++) { const sc = chStats[c].intensity + 0.3 * chStats[c].reveal; if (sc > best) { best = sc; climax = c; } }
  }
  const families = chStats.map((st, c) => {
    if (c === climax) return "climax";
    if (st.warmth > 0.25) return "warm";
    if (st.sad > 0.3 && st.intensity < 0.45) return "sad";
    if (st.warmth < -0.35) return st.dread > 0.3 ? "dread" : "cold";
    return "neutral";
  });
  const propCh = Array.isArray(prop?.chapterLooks) ? prop.chapterLooks : [];
  const chapterLooks = [];
  const secondGrade = [];
  for (let c = 0; c < C; c++) {
    const fam = families[c];
    const prevL = chapterLooks[c - 1];
    const pc = propCh.find((x) => x?.chapter === c + 1) || (propCh.every((x) => !isInt(x?.chapter)) ? propCh[c] : null);
    let accent = hexOr(pc?.accent, null);
    if (!accent && ctx.topic?.accent && (c === 0 || fam === "neutral")) accent = ctx.topic.accent;
    if (!accent) {
      const opts = fam === "neutral" ? [look.accent, ...FAMILY_ACCENTS.warm.slice(0, 1), ...FAMILY_ACCENTS.cold.slice(0, 1)] : FAMILY_ACCENTS[fam];
      accent = (c === 0 && fam === "neutral") ? look.accent : byRnd(opts.filter((a) => a !== prevL?.accent), `acc${c}`)[0] || look.accent;
    }
    const lookGrades = look.grades.filter((g) => allowed.grade.includes(g));
    // Konu kimliğinin bağlayıcı derecelendirmesi bütün bölümlerin tabanı (en sert anlar ikincil alabilir).
    const tGrade = ctx.topic?.grade && allowed.grade.includes(ctx.topic.grade) ? ctx.topic.grade : null;
    let grade = tGrade || (pc?.grade && allowed.grade.includes(pc.grade) ? pc.grade : null);
    if (!grade) {
      const famG = fam === "neutral" ? lookGrades : (FAMILY_GRADES[fam] || []).filter((g) => allowed.grade.includes(g));
      const pref = famG.filter((g) => lookGrades.includes(g));
      const list = (pref.length ? pref : famG.length ? famG : lookGrades.length ? lookGrades : allowed.grade).filter((g) => g !== prevL?.grade);
      grade = byRnd(list.length ? list : allowed.grade, `grade${c}`)[0] || "color";
    }
    let backdrop = null;
    if (pc?.backdrop && allowed.backdrop.includes(pc.backdrop.kind)) {
      backdrop = { kind: pc.backdrop.kind };
      for (const k of ["color", "color2"]) if (HEX.test(pc.backdrop[k] || "")) backdrop[k] = pc.backdrop[k].toLowerCase();
    }
    if (!backdrop) {
      const kinds = [...(ctx.topic?.backdrops || []), ...look.backdrops].filter((k, j, a) => a.indexOf(k) === j && allowed.backdrop.includes(k) && k !== "blur" && !RELATED_BACKDROPS.has(k) && k !== prevL?.backdrop?.kind);
      const kind = byRnd(kinds.length ? kinds : allowed.backdrop, `bd${c}`)[0];
      backdrop = makeBackdrop(kind, accent, look, (fam === "warm" || fam === "neutral") && rnd(`bdl${c}`) < 0.35);
    }
    chapterLooks.push({ accent, grade, backdrop });
    const others = lookGrades.filter((g) => g !== grade);
    secondGrade.push(byRnd(others.length ? others : allowed.grade.filter((g) => g !== grade), `g2${c}`)[0] || null);
  }

  const out = S.map(() => ({}));
  const P = (i) => (prop?.scenes && prop.scenes[i]) || {};

  // 4b) Tempo: bölüm başına dalga — anlatım düşük (1-2), yükseliş (3), zirve (4-5),
  // her zirvenin hemen ardından NEFES (1). Enerji diğer bütün seçimleri sürer.
  const E = planEnergy(ctx, { prop, rnd, climax });
  S.forEach((s, i) => { if (E[i] !== null) { out[i].energy = E[i]; out[i].pace = paceOf(E[i]); } });
  const breathAt = (i) => i > 0 && E[i] === 1 && E[i - 1] >= 4;

  // 5) Yazı stilleri: sırayla, kurallara uyan öneri kabul; yoksa rol/duygu/denge puanı.
  // Slam ve montaj sözcükleri yalnızca VURUCU stillerle; ardışık iki slam aynı stili almaz.
  // Kanca (ilk ~30 sn'deki ilk slam/words) kinetic — vurgu bütçesinden sayılır.
  const tList = ctx.text;
  const accentText = [];
  const impactReg = IMPACT_TEXT.filter((s) => regAllowed.includes(s));
  if (tList.length) {
    // kümede vurucu stil: slam/montaj varsa en az üç (ardışık slam'ler dönüşümlü), yoksa en az bir (önce yumuşak olanlar: box/outline/stack)
    const needImpact = Math.min(tList.some((i) => isImpactScene(S[i])) ? 3 : 1, impactReg.length);
    for (const s of [...impactReg].sort((a, b) => (LOUD_TEXT.has(a) ? 1 : 0) - (LOUD_TEXT.has(b) ? 1 : 0) || rnd(`imp|${a}`) - rnd(`imp|${b}`))) {
      if (textSet.filter((x) => impactReg.includes(x)).length >= needImpact) break;
      if (textSet.includes(s)) continue;
      if (textSet.length < RULES.textStylesMax) textSet.push(s);
      else {
        const k = textSet.map((x, j) => j).reverse().find((j) => !impactReg.includes(textSet[j]) && !leads.includes(textSet[j]) && (LOUD_TEXT.has(textSet[j]) || textSet.filter((y) => !LOUD_TEXT.has(y)).length > 3));
        if (k !== undefined) textSet[k] = s;
      }
    }
  }
  const hook = accAllowed.includes("kinetic") ? hookIndex(S, ctx.starts) : -1;
  if (hook >= 0) { out[hook].textStyle = "kinetic"; accentText.push(hook); }
  const counts = {};
  let prevSt = null;
  let prevSlamSt = null;
  for (const i of tList) {
    const s = S[i];
    if (i === hook) { prevSt = "kinetic"; if (s.type === "slam") prevSlamSt = "kinetic"; continue; }
    const gentle = GENTLE_MOODS.has(moodOf(s));
    const impact = isImpactScene(s);
    const isSl = s.type === "slam";
    // slam'ler duygudan bağımsız vurucudur (sakin bir slam de büyük ve kalın); montaj sakinse sert stil yok
    const ok = (st, capOn = true) => textSet.includes(st) && st !== prevSt && (!capOn || (counts[st] || 0) < cap)
      && (impact ? impactReg.includes(st) && !(isSl && st === prevSlamSt) && !(!isSl && gentle && LOUD_TEXT.has(st)) : !(gentle && LOUD_TEXT.has(st))) && !(st === "lower-third" && shortLine(s));
    let st = P(i).textStyle && ok(P(i).textStyle) ? P(i).textStyle : null;
    if (!st && !prop?.scenes) {
      // hazır senaryonun kendi (geçerli) stili de bir öneridir
      if (s.textStyle && ok(s.textStyle)) st = s.textStyle;
    }
    if (!st) {
      let cands = textSet.filter((x) => ok(x));
      if (!cands.length && textSet.length < RULES.textStylesMax) {
        const pool = impact ? impactReg : regAllowed;
        const extra = byRnd(pool.filter((x) => !textSet.includes(x) && x !== prevSt && !(isSl && x === prevSlamSt) && !(gentle && !isSl && LOUD_TEXT.has(x)) && !(x === "lower-third" && shortLine(s))), `tadd${i}`)[0];
        if (extra) { textSet.push(extra); cands = [extra]; }
      }
      if (!cands.length) cands = textSet.filter((x) => ok(x, false));
      if (!cands.length && impact && accAllowed.includes("kinetic") && accentText.length < RULES.accentTextMax && !ACCENT_TEXT.has(prevSt) && prevSlamSt !== "kinetic" && accentTextEligible(s, ctx.starts[i], E[i])) {
        out[i].textStyle = "kinetic"; accentText.push(i); prevSt = "kinetic"; if (isSl) prevSlamSt = "kinetic";
        continue;
      }
      if (!cands.length && impact) cands = impactReg.filter((x) => x !== prevSt && !(isSl && x === prevSlamSt));
      const role = impact ? IMPACT_TEXT : ROLE_TEXT[s.type] || MOOD_TEXT[moodOf(s)] || [];
      const moodPref = impact ? [] : MOOD_TEXT[moodOf(s)] || [];
      const score = (x) => (role.includes(x) ? 1 - role.indexOf(x) * 0.08 : 0) + (moodPref.includes(x) ? 0.4 : 0) + (1 - (counts[x] || 0) / cap) * 0.9 + rnd(`t${i}|${x}`) * 0.6;
      st = cands.sort((a, b) => score(b) - score(a))[0] || null;
    }
    if (st) { out[i].textStyle = st; counts[st] = (counts[st] || 0) + 1; if (!textSet.includes(st)) textSet.push(st); }
    prevSt = st;
    if (isSl) prevSlamSt = st;
  }
  // kullanılmayan küme stili: komşularıyla çakışmayan bir (vurucu olmayan) sahneye yerleştir; olmazsa kümeden çıkar
  for (const st of [...textSet]) {
    if (counts[st]) continue;
    for (const k of byRnd(tList.map((_, k) => k), `fill${st}`)) {
      const i = tList[k];
      const cur = out[i].textStyle;
      if (!cur || ACCENT_TEXT.has(cur) || isImpactScene(S[i]) || (counts[cur] || 0) <= 1) continue;
      if (GENTLE_MOODS.has(moodOf(S[i])) && LOUD_TEXT.has(st)) continue;
      if (st === "lower-third" && shortLine(S[i])) continue;
      if (out[tList[k - 1]]?.textStyle === st || out[tList[k + 1]]?.textStyle === st) continue;
      out[i].textStyle = st; counts[cur]--; counts[st] = 1;
      break;
    }
  }
  textSet = textSet.filter((s) => counts[s]);

  // 5b) Vurgu yazıları (lyric/kinetic): toplam en çok 3 (kanca dahil); yalnızca kanca (ilk ~40 sn),
  // gerçek alıntı ya da zirve (enerji >= 4); ardışık değil; sakin/hüzünlüde değil. Palete sayılmaz.
  // Slam/montaj yalnızca kinetic alabilir (lyric bir slam'i küçültür).
  if (accAllowed.length && tList.length) {
    const eligible = (i) => i !== hook && accentTextEligible(S[i], ctx.starts[i], E[i]);
    const propAcc = (i) => (ACCENT_TEXT.has(P(i).textStyle) && accAllowed.includes(P(i).textStyle) && !(isImpactScene(S[i]) && P(i).textStyle === "lyric") ? P(i).textStyle : null);
    const want = prop?.scenes ? Math.min(RULES.accentTextMax, accentText.length + tList.filter((i) => i !== hook && propAcc(i)).length) : Math.min(RULES.accentTextMax, accentText.length + 1 + Math.floor(rnd("accN") * 2));
    const score = (i) => (propAcc(i) ? 10 : 0) + (E[i] >= 5 ? 1 : E[i] >= 4 ? 0.6 : 0) + (isQuoteLike(S[i]) ? 1.5 : 0) + (ctx.starts[i] < RULES.hookSec ? 0.7 : 0) + rnd(`acct${i}`);
    const order = tList.map((i, k) => ({ i, k })).filter(({ i }) => eligible(i) && (!prop?.scenes || propAcc(i))).sort((a, b) => score(b.i) - score(a.i));
    const slamList = tList.filter((i) => S[i].type === "slam");
    for (const { i, k } of order) {
      if (accentText.length >= want) break;
      const cur = out[i].textStyle;
      if (!cur || ACCENT_TEXT.has(cur) || (counts[cur] || 0) <= 1) continue;
      if (ACCENT_TEXT.has(out[tList[k - 1]]?.textStyle) || ACCENT_TEXT.has(out[tList[k + 1]]?.textStyle)) continue;
      const usedAcc = accentText.map((j) => out[j].textStyle);
      // alıntı → lyric (satır kelime kelime ekranı doldurur); slam/montaj/zirve 5 → kinetic; kanca ya da 4 → bu videoda henüz kullanılmayan
      const pref = isImpactScene(S[i]) ? "kinetic" : isQuoteLike(S[i]) ? "lyric" : E[i] >= 5 && !usedAcc.includes("kinetic") ? "kinetic" : ["lyric", "kinetic"].sort((a, b) => (usedAcc.includes(a) ? 1 : 0) - (usedAcc.includes(b) ? 1 : 0) || rnd(`accs${i}|${a}`) - rnd(`accs${i}|${b}`))[0];
      const st = propAcc(i) || (accAllowed.includes(pref) ? pref : accAllowed[0]);
      if (isImpactScene(S[i]) && !IMPACT_TEXT.includes(st)) continue;
      if (S[i].type === "slam") {
        const sk = slamList.indexOf(i);
        if (out[slamList[sk - 1]]?.textStyle === st || out[slamList[sk + 1]]?.textStyle === st) continue;
      }
      out[i].textStyle = st;
      counts[cur]--;
      accentText.push(i);
    }
  }

  // 5b2) Ekran yazısı kararı (words): bilgi/alıntı/vurgu tam; uzun yankı → anahtar kelime;
  // dolgu → yazısız temiz görüntü. Model önerisi ('caption') yalnızca kurala uyuyorsa geçer.
  {
    let lastText = -Infinity;
    for (let i = 0; i < n; i++) {
      const s = S[i];
      if (isCard(s)) continue;
      const at = ctx.starts[i] ?? 0;
      if (s.type === "slam" || s.type === "title" || (s.type === "montage" && s.text)) { lastText = at; continue; }
      if (s.type !== "words") continue;
      const pictured = showsPicture(s);
      const auto = captionDecision(s, { energy: E[i], gapSec: at - lastText, pictured, hook: i === hook || ACCENT_TEXT.has(out[i].textStyle) });
      const f = captionFacts(s);
      const pc = P(i).caption;
      const okP = CAPTION_MODES.includes(pc) && !(pc === "none" && (f.info || f.quote || !pictured || i === hook)) && !(pc === "key" && !f.keyword);
      const mode = okP ? pc : auto.mode;
      out[i].textMode = mode;
      // Bilgi yazısının küçük başlığı: satırdaki tarih/yıl (yoksa motor bölüm adını koyar).
      if (mode !== "none" && out[i].textStyle === "lower-third") {
        const d = String(s.text || "").match(/\b((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(st|nd|rd|th)?,? \d{4}|\d{4})\b/i);
        if (d) out[i].kicker = d[1].toUpperCase();
      }
      if (mode !== "none") lastText = at;
    }
    // lower-third yalnızca tam yazılan bilgi satırında: yazısız/anahtar satırda editoryal yazı olmaz
    for (const i of ctx.text) if (out[i].textStyle === "lower-third" && S[i].type === "words" && out[i].textMode !== "full") {
      const alt = textSet.find((x) => x !== "lower-third" && x !== out[ctx.text[ctx.text.indexOf(i) - 1]]?.textStyle && x !== out[ctx.text[ctx.text.indexOf(i) + 1]]?.textStyle && !(GENTLE_MOODS.has(moodOf(S[i])) && LOUD_TEXT.has(x)));
      if (alt) { counts["lower-third"]--; counts[alt] = (counts[alt] || 0) + 1; out[i].textStyle = alt; }
    }
  }

  // 5c) Sayaç çizimleri: görünümün listesi (döneme/türe uyanlar), ardışık iki sayaç aynı değil,
  // her bölüm listenin başka yerinden başlar, en az kullanılan önce; photo yalnızca önünde resim varsa.
  const cAllowed = allowed.counterStyle;
  const cPal = (look.counterStyles || []).filter((x) => cAllowed.includes(x));
  const cList = cPal.length ? cPal : cAllowed;
  const cOrder = [cList[0], ...byRnd(cList.slice(1), "corder")];
  const cUse = {};
  const cInCh = {};
  let prevC = null;
  const cOk = (i, x, prevX) => !!x && cAllowed.includes(x) && x !== prevX && (x !== "photo" || counterPicOk(S, i));
  for (const i of ctx.counter) {
    const s = S[i];
    const ch = chOf(s);
    const k = cInCh[ch] || 0;
    cInCh[ch] = k + 1;
    let st = cOk(i, P(i).counterStyle, prevC) ? P(i).counterStyle : !prop?.scenes && cOk(i, s.counterStyle, prevC) ? s.counterStyle : null;
    if (!st) {
      const start = (ch + k) % cOrder.length;
      const ring = [...cOrder.slice(start), ...cOrder.slice(0, start)].filter((x) => cOk(i, x, prevC));
      st = ring.reduce((b, x) => ((cUse[x] || 0) < (cUse[b] || 0) ? x : b), ring[0]) || null;
    }
    if (st) { out[i].counterStyle = st; cUse[st] = (cUse[st] || 0) + 1; }
    prevC = st;
  }
  // Model iki çizimi dönüşümlü verdiyse (A B A B): eksik çeşit, komşularıyla çakışmayan bir sayaca.
  const cNeed = Math.min(RULES.counterStylesMin, cAllowed.length);
  if (ctx.counter.length >= 3) {
    for (const x of [...cOrder, ...cAllowed]) {
      if (Object.values(cUse).filter(Boolean).length >= cNeed) break;
      if (cUse[x]) continue;
      const cs = ctx.counter;
      for (const k of byRnd(cs.map((_, k) => k), `cfill${x}`)) {
        const i = cs[k];
        const cur = out[i].counterStyle;
        if (!cur || (cUse[cur] || 0) <= 1) continue;
        if (out[cs[k - 1]]?.counterStyle === x || out[cs[k + 1]]?.counterStyle === x) continue;
        if (x === "photo" && !counterPicOk(S, i)) continue;
        out[i].counterStyle = x;
        cUse[cur]--;
        cUse[x] = 1;
        break;
      }
    }
  }

  // 6) Zeminler. Büyük yazı (words/slam/title/counter/quote) boş zeminde durmaz: 'related' —
  // motor en yakın ilgili resmi/klibi karartıp kaydırarak koyar (yoksa dönem dokusu). Düz
  // solid/gradient yalnızca modelin seçtiği sessizlik anında (enerji 1, en çok 2); ton
  // (açık kâğıda yıkanmış / koyu) bölümün ve görünümün tonunu izler.
  let prevBd = null;
  let silenceUsed = 0;
  for (const i of ctx.backdrop) {
    const s = S[i];
    const pb = P(i).backdrop;
    let b = null;
    if (BIG_TEXT_TYPES.has(s.type)) {
      const cl = chapterLooks[chOf(s)] || chapterLooks[0];
      const lightTone = pb?.tone ? pb.tone === "light" : pb?.kind === "paper" || isLightBackdrop(pb) || (!pb && (isLightBackdrop(cl.backdrop) || rnd(`bl${i}`) < (["calm", "curious", "triumph", "sad"].includes(moodOf(s)) ? 0.3 : 0.1)));
      if (pb && SILENCE_BACKDROPS.has(pb.kind) && allowed.backdrop.includes(pb.kind) && E[i] === 1 && (s.silence === true || GENTLE_MOODS.has(moodOf(s))) && silenceUsed < SILENCE_BEATS_MAX) {
        b = { kind: pb.kind };
        for (const k of ["color", "color2"]) if (HEX.test(pb[k] || "")) b[k] = pb[k].toLowerCase();
        silenceUsed++;
      } else if (pb?.kind === "era" && allowed.backdrop.includes("era")) {
        b = { kind: "era", ...(ERA_TEXTURES.includes(pb.variant) ? { variant: pb.variant } : {}), ...(pb.tone === "light" || pb.tone === "dark" ? { tone: pb.tone } : {}) };
      } else b = makeBackdrop("related", cl.accent, look, lightTone);
      out[i].backdrop = b;
      prevBd = b.kind;
      continue;
    }
    if (pb && allowed.backdrop.includes(pb.kind) && !RELATED_BACKDROPS.has(pb.kind)) {
      b = { kind: pb.kind };
      for (const k of ["color", "color2"]) if (HEX.test(pb[k] || "")) b[k] = pb[k].toLowerCase();
    }
    if (!b) {
      const cl = chapterLooks[chOf(s)] || chapterLooks[0];
      const m = moodOf(s);
      const light = rnd(`bl${i}`) < (["calm", "curious", "triumph", "sad"].includes(m) ? 0.4 : 0.15);
      const kinds = [cl.backdrop.kind, ...(ctx.topic?.backdrops || []), ...look.backdrops].filter((k, j, a) => a.indexOf(k) === j && allowed.backdrop.includes(k) && k !== "blur" && !RELATED_BACKDROPS.has(k) && k !== prevBd);
      const kind = rnd(`bk${i}`) < 0.45 && kinds.includes(cl.backdrop.kind) ? cl.backdrop.kind : byRnd(kinds.length ? kinds : allowed.backdrop, `bk${i}`)[0];
      b = kind === cl.backdrop.kind && !light ? { ...cl.backdrop } : makeBackdrop(kind, cl.accent, look, light);
    }
    out[i].backdrop = b;
    prevBd = b.kind;
  }
  const lightN = () => ctx.backdrop.filter((i) => isLightBackdrop(out[i].backdrop)).length;
  const needLight = Math.min(RULES.lightBackdropsMin, ctx.backdrop.length);
  if (lightN() < needLight) {
    const order = { calm: 0, curious: 1, triumph: 2, sad: 3, tension: 4, reveal: 5, dread: 6 };
    const darks = ctx.backdrop.filter((i) => !isLightBackdrop(out[i].backdrop)).sort((a, b) => (order[moodOf(S[a])] ?? 4) - (order[moodOf(S[b])] ?? 4) || rnd(`lf${a}`) - rnd(`lf${b}`));
    // birbirinden uzak olanlar önce: aynı yere yığılmasın
    const picked = [];
    for (const i of darks) if (picked.every((j) => Math.abs(j - i) > 6)) picked.push(i);
    for (const i of [...picked, ...darks]) {
      if (lightN() >= needLight) break;
      if (isLightBackdrop(out[i].backdrop)) continue;
      const cl = chapterLooks[chOf(S[i])] || chapterLooks[0];
      if (BIG_TEXT_TYPES.has(S[i].type)) {
        if (SILENCE_BACKDROPS.has(out[i].backdrop.kind)) continue;
        out[i].backdrop = out[i].backdrop.kind === "era" ? { ...out[i].backdrop, tone: "light", variant: undefined } : makeBackdrop("related", cl.accent, look, true);
        if (out[i].backdrop.variant === undefined) delete out[i].backdrop.variant;
        continue;
      }
      const kind = allowed.backdrop.includes("paper") && rnd(`lk${i}`) < 0.6 ? "paper" : allowed.backdrop.includes("solid") ? "solid" : out[i].backdrop.kind;
      out[i].backdrop = kind === "paper" ? makeBackdrop("paper", cl.accent, look, true) : { kind, color: look.light };
    }
  }

  // 7) Renk derecelendirmesi: bölüm tabanı + en çok bir ikincil.
  const chSet = chapterLooks.map((c) => new Set([c.grade]));
  for (const i of ctx.grade) {
    const s = S[i];
    const c = chOf(s);
    const cl = chapterLooks[c] || chapterLooks[0];
    const set = chSet[c] || (chSet[c] = new Set([cl.grade]));
    const pg = P(i).grade;
    let g = null;
    if (pg && allowed.grade.includes(pg) && (set.has(pg) || set.size < RULES.gradesPerChapter)) g = pg;
    if (!g) {
      const second = secondGrade[c];
      g = second && ["dread", "reveal", "sad"].includes(moodOf(s)) && rnd(`g${i}`) < 0.35 && (set.has(second) || set.size < RULES.gradesPerChapter) ? second : cl.grade;
    }
    set.add(g);
    out[i].grade = g;
  }

  // 7b) Kamera ve kadraj: ~%32 durağan (belge, yazılı resim, duygusal an), gerisi
  // duyguya ve orana göre hareket; aynı kamera 3 ardışık resimde yok; vurgular seyrek.
  const pics = ctx.grade;
  const favCams = lookCameras(look);
  const recentCam = new Map();
  for (const e of recent) for (const c of e.cameras || []) recentCam.set(c, (recentCam.get(c) || 0) + 1);
  const camArr = {};
  const camUse = {};
  const stillScore = (i) => {
    const s = S[i];
    const m = moodOf(s);
    return (isTextualPicture(s) ? 1.2 : 0) + (GENTLE_MOODS.has(m) ? 0.6 : 0) + (m === "dread" ? 0.15 : 0) + (s.type === "montage" ? -0.6 : 0) + (m === "tension" || m === "reveal" ? -0.2 : 0) + rnd(`still${i}`) * 0.5;
  };
  // Enerji 1 resimler durağan (nefes: static); pay dolmazsa enerji 2 (static/drift) ve 3 (drift) eklenir.
  const forcedStill = pics.filter((i) => E[i] === 1);
  const stillPick = new Set([...forcedStill, ...pics.filter((i) => E[i] === 2 || E[i] === 3).sort((a, b) => (E[a] - E[b]) || stillScore(b) - stillScore(a)).slice(0, Math.max(0, Math.round(RULES.stillTarget * pics.length) - forcedStill.length))]);
  let lastCamAccent = -Infinity;
  const camOk = (i, k, cam) => CAMERAS.includes(cam) && cameraFits(S[i], cam) && cameraEnergyOk(E[i], cam) && (!breathAt(i) || cam === "static") && !breaksRun(camArr, pics, k, cam) && !(ACCENT_CAMS.has(cam) && ctx.starts[i] - lastCamAccent < RULES.cameraAccentGapSec);
  for (const i of pics) if (breathAt(i)) camArr[i] = "static";
  pics.forEach((i, k) => {
    const s = S[i];
    const m = moodOf(s);
    if (breathAt(i)) { camUse.static = (camUse.static || 0) + 1; return; }
    let cam = null;
    const pc = P(i).camera;
    if (prop?.scenes && pc && camOk(i, k, pc)) cam = pc;
    else if (!prop?.scenes && s.camera && camOk(i, k, s.camera)) cam = s.camera;
    if (!cam && stillPick.has(i)) {
      const first = isTextualPicture(s) || rnd(`st${i}`) < 0.5 ? "static" : "drift";
      cam = [first, first === "static" ? "drift" : "static"].find((c) => camOk(i, k, c)) || null;
    }
    if (!cam) {
      const a = aspectOf(s);
      const moodC = (MOOD_CAM[m] || MOOD_CAM.curious).filter((c) => camOk(i, k, c) && !STILL_CAMS.has(c));
      const cands = moodC.length ? moodC : (ENERGY_CAM[E[i]] || CAMERAS).filter((c) => camOk(i, k, c) && !STILL_CAMS.has(c));
      const fast = new Set(["push-in", "detail-punch", "handheld"]);
      const score = (c) => (favCams.includes(c) ? 0.5 : 0) - (camUse[c] || 0) * 0.06 - (recentCam.get(c) || 0) * 0.15 + rnd(`cam${i}|${c}`)
        + (a !== null && a > 1.9 && PAN_CAMS.has(c) ? 1 : 0) + (a !== null && a < 1 && TILT_CAMS.has(c) ? 1 : 0) - (ACCENT_CAMS.has(c) ? 0.3 : 0)
        + (E[i] >= 5 && fast.has(c) ? 0.8 : 0) + (E[i] === 3 && (c === "push-in" || PAN_CAMS.has(c)) ? 0.3 : 0);
      cam = cands.sort((x, y) => score(y) - score(x))[0] || ["drift", "static"].find((c) => camOk(i, k, c)) || (ENERGY_CAM[E[i]] || ["static"]).find((c) => cameraEnergyOk(E[i], c) && cameraFits(s, c) && !breaksRun(camArr, pics, k, c)) || (ENERGY_CAM[E[i]] || ["static"])[0];
    }
    camArr[i] = cam;
    camUse[cam] = (camUse[cam] || 0) + 1;
    if (ACCENT_CAMS.has(cam)) lastCamAccent = ctx.starts[i];
  });
  // Pay onarımı (model önerisi çok hareketli ya da çok durağan olabilir).
  const stillN = () => pics.filter((i) => STILL_CAMS.has(camArr[i])).length;
  const kOf = new Map(pics.map((i, k) => [i, k]));
  if (pics.length >= 6) {
    for (const i of [...pics].sort((a, b) => stillScore(b) - stillScore(a))) {
      if (stillN() >= Math.ceil(RULES.stillMin * pics.length)) break;
      if (STILL_CAMS.has(camArr[i]) || E[i] >= 4) continue;
      const k = kOf.get(i);
      const old = camArr[i];
      delete camArr[i];
      const c = ["static", "drift"].find((x) => cameraEnergyOk(E[i], x) && !breaksRun(camArr, pics, k, x));
      camArr[i] = c || old;
    }
    for (const i of [...pics].sort((a, b) => stillScore(a) - stillScore(b))) {
      if (stillN() <= Math.floor(RULES.stillMax * pics.length)) break;
      if (!STILL_CAMS.has(camArr[i]) || isTextualPicture(S[i]) || E[i] <= 1) continue;
      const k = kOf.get(i);
      const old = camArr[i];
      delete camArr[i];
      const c = [...(MOOD_CAM[moodOf(S[i])] || MOOD_CAM.curious), ...(ENERGY_CAM[E[i]] || [])].filter((x) => !STILL_CAMS.has(x) && !ACCENT_CAMS.has(x) && cameraEnergyOk(E[i], x) && cameraFits(S[i], x) && !breaksRun(camArr, pics, k, x))[0];
      camArr[i] = c || old;
    }
  }
  // Nefes durağanı (static) üçlü dizi kurarsa nefes olmayan komşusu değişir.
  for (let k = 2; k < pics.length; k++) {
    const tri = [pics[k - 2], pics[k - 1], pics[k]];
    if (!(camArr[tri[0]] === camArr[tri[1]] && camArr[tri[1]] === camArr[tri[2]])) continue;
    for (const i of tri.filter((x) => !breathAt(x)).sort((a, b) => E[b] - E[a])) {
      const kk = kOf.get(i);
      const old = camArr[i];
      delete camArr[i];
      const alt = [...(STILL_CAMS.has(old) ? ["drift", "static"] : []), ...(ENERGY_CAM[E[i]] || CAMERAS)].find((x) => x !== old && cameraEnergyOk(E[i], x) && cameraFits(S[i], x) && !ACCENT_CAMS.has(x) && !breaksRun(camArr, pics, kk, x));
      camArr[i] = alt || old;
      if (alt) break;
    }
  }
  for (const i of pics) {
    const s = S[i];
    out[i].camera = camArr[i];
    const a = aspectOf(s);
    const pf = P(i).fit;
    out[i].fit = isTextualPicture(s) || (a !== null && a < 1 && !TILT_CAMS.has(camArr[i]) && !STILL_CAMS.has(camArr[i])) ? "contain" : FITS.includes(pf) ? pf : "smart";
  }

  // 8) Efektler.
  const maxFx = fxCap(n);
  const lookFx = new Set(look.fx);
  const fxUse = {};
  // Yedek seçim her zaman kurulur: model efekt önermediyse (ya da çok az önerdiyse) boşluk bununla dolar.
  const fxTarget = Math.min(maxFx, Math.round(n * (0.25 + 0.06 * rnd("fxshare"))));
  const fbChosen = S.map((s, i) => ({ i, sc: (isCard(s) || !(E[i] >= 3) ? -9 : 0) + (FX_WEIGHT[moodOf(s)] ?? 0.2) + (E[i] - 3) * 0.25 + (isGradeScene(s) ? 0.25 : 0) + rnd(`fx${i}`) * 0.6 + (i === 0 ? 0.3 : 0) })).filter((x) => x.sc > -5)
    .sort((a, b) => b.sc - a.sc).slice(0, fxTarget).map((x) => x.i);
  const propFxIdx = prop?.scenes ? S.map((_, i) => i).filter((i) => Array.isArray(P(i).fx) && P(i).fx.length && E[i] >= 3) : [];
  let chosen = prop?.scenes && propFxIdx.length >= Math.round(n * 0.2) ? propFxIdx : [...new Set([...propFxIdx, ...fbChosen])].slice(0, Math.max(fxTarget, propFxIdx.length));
  chosen.sort((a, b) => a - b);
  // Her slam vuruşa oturan bir efekt alır (flash-frame; art arda gelirse shake/flare/vignette-pulse...).
  const slamIdx = S.map((s, i) => (s.type === "slam" && !isCard(s) ? i : -1)).filter((i) => i >= 0);
  chosen = [...new Set([...slamIdx, ...chosen.filter((i) => !slamIdx.includes(i)).slice(0, Math.max(0, chosen.length - slamIdx.length))])].sort((a, b) => a - b);
  let prevFx = [];
  let lastStrong = -Infinity;
  let fxCount = 0;
  let slamsLeft = slamIdx.length;
  let prevFxAt = -1;
  let lastSlamHit = null;
  for (const i of chosen) {
    const s = S[i];
    const m = moodOf(s);
    if (s.type === "slam") {
      slamsLeft--;
      const okHit = (k) => allowed.fx.includes(k) && fxFits(s, k) && !prevFx.includes(k) && k !== out[i].camera
        && !(STRONG_FX.has(k) && (!STRONG_MOODS.has(m) || E[i] < 5 || ctx.starts[i] - lastStrong < RULES.strongFxGapSec));
      const pk = only(P(i).fx, HIT_FX).find(okHit);
      // flash-frame ile shake (gerilim/ifşa slam'inde, 45 sn kuralı izin verirse) dönüşümlü
      const hitOrder = lastSlamHit === "flash-frame" ? ["shake", ...HIT_FX.filter((x) => x !== "shake")] : HIT_FX;
      let k = pk || hitOrder.find(okHit);
      if (!k && prevFxAt >= 0) {
        // vuruş önce gelir: önceki efektli sahneden çakışan türü al
        k = HIT_FX.find((x) => allowed.fx.includes(x) && fxFits(s, x) && x !== out[i].camera && !STRONG_FX.has(x));
        if (k) {
          const rest = (out[prevFxAt].fx || []).filter((x) => x !== k);
          if (rest.length) out[prevFxAt].fx = rest; else { delete out[prevFxAt].fx; fxCount--; }
        }
      }
      if (!k) continue;
      lastSlamHit = k;
      prevFxAt = i;
      out[i].fx = [k];
      fxUse[k] = (fxUse[k] || 0) + 1;
      if (STRONG_FX.has(k)) lastStrong = ctx.starts[i];
      prevFx = [k];
      fxCount++;
      continue;
    }
    if (fxCount >= maxFx - slamsLeft) continue;
    const okFx = (k) => allowed.fx.includes(k) && fxFits(s, k) && !prevFx.includes(k) && k !== out[i].camera && !(GENTLE_MOODS.has(m) && !GENTLE_FX.has(k))
      && !(STRONG_FX.has(k) && (!STRONG_MOODS.has(m) || E[i] < 5 || ctx.starts[i] - lastStrong < RULES.strongFxGapSec));
    let list = [];
    if (only(P(i).fx, FX_KINDS).length) {
      for (const k of only(P(i).fx, FX_KINDS)) {
        if (list.length >= 2) break;
        if (okFx(k) && !(STRONG_FX.has(k) && list.some((x) => STRONG_FX.has(x)))) list.push(k);
      }
    } else {
      const cands = (MOOD_FX[m] || MOOD_FX.curious).filter(okFx);
      const score = (k) => (lookFx.has(k) ? 0.5 : 0) - (fxUse[k] || 0) * 0.25 + rnd(`fk${i}|${k}`) + (E[i] >= 5 && STRONG_FX.has(k) ? 0.4 : 0) + (E[i] === 3 && GENTLE_FX.has(k) ? 0.3 : 0);
      const first = cands.sort((a, b) => score(b) - score(a))[0];
      if (first) {
        list.push(first);
        if (rnd(`fx2${i}`) < 0.2) {
          const second = cands.filter((k) => k !== first && !STRONG_FX.has(k) && !(STRONG_FX.has(first) && STRONG_FX.has(k)) && !(PICTURE_FX.has(first) && PICTURE_FX.has(k)))[0];
          if (second) list.push(second);
        }
      }
    }
    if (!list.length) continue;
    out[i].fx = list;
    for (const k of list) fxUse[k] = (fxUse[k] || 0) + 1;
    if (list.some((k) => STRONG_FX.has(k))) lastStrong = ctx.starts[i];
    prevFx = list;
    prevFxAt = i;
    fxCount++;
  }
  // Alt sınır: resimli sahnelerin en az %22'si efektli (komşu efektlerle çakışmadan, sert efekt yok).
  {
    const picsAll = ctx.grade;
    const need = picsAll.length >= 10 ? Math.ceil(RULES.minPictureFxShare * picsAll.length) : 0;
    const fxNear = (i, dir) => { for (let j = i + dir; j >= 0 && j < n; j += dir) if (out[j].fx?.length) return out[j].fx; return []; };
    let have = picsAll.filter((i) => out[i].fx?.length).length;
    const cand = picsAll.filter((i) => !out[i].fx?.length && E[i] >= 3).sort((a, b) => (E[b] - E[a]) || rnd(`fxu${a}`) - rnd(`fxu${b}`));
    for (const i of cand) {
      if (have >= need || fxCount >= maxFx) break;
      const s = S[i];
      const m = moodOf(s);
      const near = [...fxNear(i, -1), ...fxNear(i, 1)];
      const k = (MOOD_FX[m] || MOOD_FX.curious).filter((x) => allowed.fx.includes(x) && fxFits(s, x) && !STRONG_FX.has(x) && !near.includes(x) && x !== out[i].camera && !(GENTLE_MOODS.has(m) && !GENTLE_FX.has(x)))
        .sort((a, b) => (fxUse[a] || 0) - (fxUse[b] || 0) || rnd(`fxk${i}|${a}`) - rnd(`fxk${i}|${b}`))[0];
      if (!k) continue;
      out[i].fx = [k];
      fxUse[k] = (fxUse[k] || 0) + 1;
      have++;
      fxCount++;
    }
  }

  // 9) Geçişler: sınırlarda süslü, iç kesmelerin çoğu düz; aynı süslü tür art arda yok.
  const cutShare = 0.6 + 0.12 * rnd("cutshare");
  let accentUsed = 0;
  let lastAccentAt = -Infinity;
  let lastTr = null;
  let acc = rnd("tracc") * 0.5;
  const trUse = {};
  const boundaries = S.map((s, i) => {
    if (!i) return null;
    const p = S[i - 1];
    return { chapter: chOf(s) !== chOf(p), story: ["slam", "counter", "chart", "title"].includes(s.type) || p.type === "montage", mood: moodOf(s) !== moodOf(p) };
  });
  const forced = boundaries.filter((b, i) => b && !b.chapter && (b.story || b.mood) && E[i] >= 3).length;
  const free = boundaries.filter((b, i) => b && !b.chapter && !b.story && !b.mood && E[i] >= 3).length;
  const pFree = free ? Math.min(0.9, Math.max(0, (Math.round((1 - cutShare) * Math.max(0, n - 1)) - forced) / free)) : 0;
  let climaxAccent = false;
  // Süslenebilir sınırlar: enerji >= 3, bölüm başı değil (slam her zaman).
  const trEligible = (i) => i > 0 && !isCard(S[i]) && (S[i].type === "slam" || (E[i] >= 3 && !boundaries[i].chapter));
  // Modelin "düz kesme"lerine yalnızca planı yeterince süslü geçiş içeriyorsa güvenilir (boş/eksik palet kabul edilmez).
  const eligN = S.filter((_, i) => trEligible(i)).length;
  const propStyled = prop?.scenes ? S.filter((_, i) => trEligible(i) && P(i).transition && P(i).transition !== "cut" && trAllowed.includes(P(i).transition)).length : 0;
  const trustCuts = !prop?.scenes || (eligN && propStyled / eligN >= RULES.minStyledShare);
  S.forEach((s, i) => {
    if (!i) { out[i].transition = "cut"; return; }
    const b = boundaries[i];
    const m = moodOf(s);
    const gentle = GENTLE_MOODS.has(m);
    const okTr = (t, heavyOk) => t && trAllowed.includes(t) && t !== lastTr && !(gentle && LOUD_TRANSITIONS.has(t)) && ((heavyOk && isTurn(S[i - 1], s)) || !HEAVY_TRANSITIONS.has(t)) && (!NEEDS_PICTURES.has(t) || (showsPicture(S[i - 1]) && showsPicture(s)));
    const pt = prop?.scenes ? P(i).transition : s.transition;
    let t = null;
    if (s.type === "slam") {
      // slam'e keskin giriş (duygudan bağımsız); palet ya da vurgu bütçesi
      const okS = (x) => !!x && SHARP_TRANSITIONS.has(x) && trAllowed.includes(x) && x !== lastTr;
      if (okS(pt) && palette.includes(pt)) t = pt;
      if (!t) t = palette.filter(okS).sort((a, c) => (trUse[a] || 0) - (trUse[c] || 0) || rnd(`sl${i}|${a}`) - rnd(`sl${i}|${c}`))[0] || null;
      if (!t && accentUsed < RULES.accentUses) {
        t = (okS(pt) ? pt : null) || byRnd(accents.filter(okS), `sla${i}`)[0] || byRnd(trAllowed.filter(okS), `slx${i}`)[0] || null;
        if (t) { if (!accents.includes(t)) accents.push(t); accentUsed++; lastAccentAt = ctx.starts[i]; }
      }
      out[i].transition = t || "cut";
      if (t) { lastTr = t; trUse[t] = (trUse[t] || 0) + 1; }
      return;
    }
    if ((pt === "cut" && trustCuts) || !(E[i] >= 3)) t = "cut"; // düşük enerji (ve nefes) düz kesmeyle girer
    else if (pt && okTr(pt, true)) {
      if (palette.includes(pt)) t = pt;
      else if (accentUsed < RULES.accentUses && (accents.includes(pt) || accents.length < 3)) { t = pt; if (!accents.includes(pt)) accents.push(pt); accentUsed++; lastAccentAt = ctx.starts[i]; }
    }
    if (!t) {
      let want;
      if (b.chapter) want = "cut"; // bölüm kartı motorun imzasını taşır; ilk kare "başla" der
      else if (b.story || b.mood) want = "draw";
      else { acc += pFree; const thr = 0.4 + rnd(`tj${i}`) * 0.6; if (acc >= thr) { acc -= 1; want = "light"; } else want = "cut"; }
      if (prop?.scenes && trustCuts && pt === undefined && want !== "cut") want = "cut";
      if (want === "cut") t = "cut";
      else {
        const moment = (m === "reveal" && b.mood) || (chOf(s) === climax && !climaxAccent && (m === "reveal" || m === "tension") && b.mood);
        const accOk = moment && accentUsed < RULES.accentUses && ctx.starts[i] - lastAccentAt > 90 && !prop?.scenes;
        const aCand = accOk ? byRnd(accents.filter((x) => okTr(x, want === "draw")), `ta${i}`)[0] : null;
        if (aCand) { t = aCand; accentUsed++; lastAccentAt = ctx.starts[i]; if (chOf(s) === climax) climaxAccent = true; }
        else {
          const cands = palette.filter((x) => okTr(x, want === "draw"));
          const sharp = (x) => (E[i] >= 4 ? (LOUD_TRANSITIONS.has(x) ? -0.6 : 0) : LOUD_TRANSITIONS.has(x) ? 0.4 : 0);
          t = cands.sort((a, c) => ((trUse[a] || 0) - (trUse[c] || 0)) * 0.3 + sharp(a) - sharp(c) + rnd(`tp${i}|${a}`) - rnd(`tp${i}|${c}`))[0] || "cut";
        }
      }
    }
    out[i].transition = t;
    if (t !== "cut") { lastTr = t; trUse[t] = (trUse[t] || 0) + 1; }
  });
  // Alt sınır: süslenebilir sınırların en az %25'i süslü; paletin en az 3 türü kullanılmış.
  {
    const styledNear = (i, dir) => { for (let j = i + dir; j > 0 && j < n; j += dir) if (out[j].transition && out[j].transition !== "cut") return out[j].transition; return null; };
    const okAt = (i, x) => {
      const s = S[i];
      const gentle = GENTLE_MOODS.has(moodOf(s));
      return trAllowed.includes(x) && x !== styledNear(i, -1) && x !== styledNear(i, 1) && !(gentle && LOUD_TRANSITIONS.has(x))
        && (!HEAVY_TRANSITIONS.has(x) || isTurn(S[i - 1], s)) && (!NEEDS_PICTURES.has(x) || (showsPicture(S[i - 1]) && showsPicture(s)));
    };
    const styledN = () => S.filter((_, i) => trEligible(i) && out[i].transition && out[i].transition !== "cut").length;
    const need = Math.ceil(RULES.minStyledShare * eligN);
    const cand = S.map((_, i) => i).filter((i) => trEligible(i) && out[i].transition === "cut")
      .sort((a, b) => (isTurn(S[b - 1], S[b]) ? 1 : 0) - (isTurn(S[a - 1], S[a]) ? 1 : 0) || E[b] - E[a] || rnd(`tru${a}`) - rnd(`tru${b}`));
    for (const i of cand) {
      if (styledN() >= need) break;
      const usedKinds = palette.filter((x) => trUse[x]);
      const k = palette.filter((x) => okAt(i, x)).sort((a, c) => (usedKinds.includes(a) ? 1 : 0) - (usedKinds.includes(c) ? 1 : 0) || (trUse[a] || 0) - (trUse[c] || 0) || rnd(`trk${i}|${a}`) - rnd(`trk${i}|${c}`))[0];
      if (!k) continue;
      out[i].transition = k;
      trUse[k] = (trUse[k] || 0) + 1;
    }
    // paletin en az üç türü sahnede
    for (const x of palette) {
      if (palette.filter((y) => trUse[y]).length >= Math.min(RULES.paletteMin, palette.length)) break;
      if (trUse[x]) continue;
      const i = S.map((_, j) => j).filter((j) => trEligible(j) && S[j].type !== "slam" && out[j].transition !== "cut" && (trUse[out[j].transition] || 0) > 1 && okAt(j, x))[0]
        ?? S.map((_, j) => j).filter((j) => trEligible(j) && out[j].transition === "cut" && okAt(j, x))[0];
      if (i === undefined) continue;
      const old = out[i].transition;
      if (old && old !== "cut") trUse[old]--;
      out[i].transition = x;
      trUse[x] = (trUse[x] || 0) + 1;
    }
  }

  const usedTr = Object.keys(trUse);
  return {
    version: ART_VERSION,
    look: { variant: look.id },
    ...(() => {
      // Açılış türü (docu-opening.js): modelin önerisi uygunsa, değilse belirleyici seçim; son 2 videoda olmayan.
      // Konu kimliğinin açılış tercihi (docu-topic-bible.js) modelin önerisi yoksa öneri sayılır; uygunluk yine denetlenir.

      const o = chooseOpening(script, { prop: { kind: prop?.opening ?? ctx.topic?.opening ?? undefined, hook: prop?.openingHook }, history, seed, eraStart: ctx.era?.start ?? null });
      notes.push(...o.notes);
      return o.kind ? { opening: { kind: o.kind, ...(o.hook ? { hook: o.hook } : {}) } } : {};
    })(),
    chapterLooks,
    palette: { textStyles: textSet, accentText: [...new Set(accentText.map((i) => out[i].textStyle))], transitions: palette.filter((t) => trUse[t]), accents: accents.filter((t) => trUse[t] && !palette.includes(t)), counterStyles: cOrder.filter((x) => cUse[x]) },
    scenes: out.map((f, i) => ({ i, say: fp(S[i]), ...f })).filter((x) => Object.keys(x).length > 2),
    notes,
    _usedTransitions: usedTr,
  };
}

/* ================================================================ uygulama */

const ART_FIELDS = ["textStyle", "backdrop", "grade", "fx", "transition", "camera", "fit", "energy", "pace", "counterStyle", "textMode", "kicker"];

/**
 * Planı senaryoya uygular (yeni senaryo döner; girdi değişmez). Sahne eşleşmesi
 * indeks + anlatım parmak izi ile; sonradan uygun olmayan alan (ör. arşiv adımı bir
 * yazı sahnesine resim verdiyse zemin) atlanır. `bg`, `say`, kaynaklar dokunulmaz.
 */
export function applyArtPlan(script, plan, { logFn = () => {} } = {}) {
  if (!plan?.scenes || !script?.scenes?.length) return script;
  const scenes = script.scenes.map((s) => {
    if (!ART_FIELDS.some((k) => k in s)) return s;
    const c = { ...s };
    for (const k of ART_FIELDS) if (k !== "transition") delete c[k];
    return c;
  });
  const own = scenes.map((s, i) => (isCard(s) ? null : i)).filter((i) => i !== null);
  const fps = own.map((i) => fp(scenes[i]));
  let skipped = 0;
  for (const e of plan.scenes) {
    let k = isInt(e.i) && fps[e.i] === e.say ? e.i : -1;
    if (k < 0) k = fps.indexOf(e.say);
    if (k < 0) { skipped++; continue; }
    const i = own[k];
    const s = { ...scenes[i] };
    if (e.textStyle && isTextScene(s)) s.textStyle = e.textStyle;
    if (e.counterStyle && s.type === "counter") s.counterStyle = e.counterStyle;
    if (e.textMode && s.type === "words" && CAPTION_MODES.includes(e.textMode)) s.textMode = e.textMode;
    if (e.kicker && s.type === "words") s.kicker = e.kicker;
    if (e.backdrop && isBackdropScene(s)) s.backdrop = { ...e.backdrop };
    if (e.grade && isGradeScene(s)) s.grade = e.grade;
    if (Array.isArray(e.fx)) { const f = e.fx.filter((x) => fxFits(s, x)); if (f.length) s.fx = f; }
    if (e.transition) s.transition = e.transition;
    if (e.camera && isGradeScene(s)) s.camera = e.camera;
    if (e.fit && isGradeScene(s)) s.fit = e.fit;
    if (isInt(e.energy) && !isCard(s)) { s.energy = e.energy; s.pace = paceOf(e.energy); }
    if (Array.isArray(s.fx) && s.camera) { const f = s.fx.filter((x) => x !== s.camera); if (f.length) s.fx = f; else delete s.fx; }
    scenes[i] = s;
  }
  // Arşivden sonra resmin oranı bilinir: geniş resim kaydırılır, dikey resim sığdırılır.
  const pics = scenes.map((s, i) => (isGradeScene(s) && s.camera ? i : -1)).filter((i) => i >= 0);
  const camArr = Object.fromEntries(pics.map((i) => [i, scenes[i].camera]));
  let refit = 0;
  pics.forEach((i, k) => {
    const s = scenes[i];
    const a = aspectOf(s);
    if (a === null) return;
    if (a > 1.9 && !(PAN_CAMS.has(s.camera) || STILL_CAMS.has(s.camera))) {
      delete camArr[i];
      const c = ["pan-left", "pan-right", "drift", "static"].sort((x, y) => hash01(`${i}|${x}`) - hash01(`${i}|${y}`)).sort((x, y) => (PAN_CAMS.has(y) ? 1 : 0) - (PAN_CAMS.has(x) ? 1 : 0)).find((x) => cameraEnergyOk(s.energy, x) && !breaksRun(camArr, pics, k, x)) || (s.energy >= 3 ? "pan-left" : "static");
      camArr[i] = c;
      scenes[i] = { ...s, camera: c };
      refit++;
    } else if (a < 1 && !(TILT_CAMS.has(s.camera) || STILL_CAMS.has(s.camera)) && s.fit !== "contain") {
      scenes[i] = { ...s, fit: "contain" };
      refit++;
    }
  });
  if (refit) logFn(`Sanat yönetmeni: ${refit} sahnenin kamerası/kadrajı resmin oranına göre düzeltildi`);
  // Yazısız karar resim ister: arşiv/AI bir words sahnesine resim veremediyse yazı geri gelir.
  scenes.forEach((s, i) => { if (s.type === "words" && s.textMode === "none" && !(s.image || s.video || s.layers || s.bg === "prev" || s.bg === "next" || s.imagePrompt || s.search)) scenes[i] = { ...s, textMode: "full" }; });
  if (skipped) logFn(`Sanat yönetmeni: ${skipped} sahne kararı eşleşmedi (senaryo değişmiş) — atlandı`);
    // Motorun betik düzeyi alanları (effects-catalog: transitionPalette, fxPalette, fxDensity) — sahnelerin açık seçimleriyle tutarlı.
  const own2 = scenes.filter((s) => !isCard(s));
  const extra = {
    transitionPalette: [...(plan.palette?.transitions || []), ...(plan.palette?.accents || [])],
    fxPalette: [...new Set(own2.flatMap((s) => s.fx || []))],
    fxDensity: +(own2.filter((s) => s.fx?.length).length / Math.max(1, own2.length)).toFixed(2),
  };
  return { ...script, scenes, look: { ...plan.look }, chapterLooks: plan.chapterLooks.map((c) => ({ ...c, ...(c.backdrop ? { backdrop: { ...c.backdrop } } : {}) })), ...extra, ...(plan.opening?.kind ? { opening: { kind: plan.opening.kind, ...(plan.opening.hook ? { hook: plan.opening.hook } : {}) } } : {}) };
}

/* ================================================================ LLM planı */

const BACKDROP_SCHEMA = {
  type: "object",
  properties: { kind: { type: "string", enum: BACKDROP_KINDS }, color: { type: "string", description: "#rrggbb" }, color2: { type: "string", description: "#rrggbb" }, tone: { type: "string", enum: ["light", "dark"], description: "related/era: paper-washed or dark" }, variant: { type: "string", enum: ERA_TEXTURES, description: "era only" } },
  required: ["kind"],
  additionalProperties: false,
};
export function planSchema(variants, allowed, openings = []) {
  return {
    type: "object",
    properties: {
      variant: { type: "string", enum: variants },
      ...(openings.length ? { opening: { type: "string", enum: openings, description: "how this video opens (the scenes before the title)" }, openingHook: { type: "string", enum: ["impact", "cinematic", "quiet"], description: "how hard the opening hook lands, from the story tone" } } : {}),
      textStyles: { type: "array", items: { type: "string", enum: allowed.textStyle }, description: "4-6 styles this video uses" },
      transitions: { type: "array", items: { type: "string", enum: allowed.transition.filter((t) => t !== "cut") }, description: "palette: 3-4 kinds" },
      accents: { type: "array", items: { type: "string", enum: allowed.transition.filter((t) => t !== "cut") }, description: "rare accent kinds, used at most 3 times in total" },
      chapterLooks: {
        type: "array",
        items: {
          type: "object",
          properties: { chapter: { type: "integer", description: "1-based, as ch1 in the scene list" }, accent: { type: "string", description: "#rrggbb" }, grade: { type: "string", enum: allowed.grade }, backdrop: BACKDROP_SCHEMA, why: { type: "string" } },
          required: ["chapter", "accent", "grade", "backdrop"],
          additionalProperties: false,
        },
      },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene: { type: "integer" },
            textStyle: { type: "string", enum: allowed.textStyle },
            backdrop: BACKDROP_SCHEMA,
            grade: { type: "string", enum: allowed.grade },
            fx: { type: "array", items: { type: "string", enum: allowed.fx } },
            transition: { type: "string", enum: allowed.transition },
            camera: { type: "string", enum: CAMERAS },
            fit: { type: "string", enum: FITS },
            counterStyle: { type: "string", enum: allowed.counterStyle || COUNTER_STYLES, description: "counter scenes {C} only" },
            caption: { type: "string", enum: CAPTION_MODES, description: "words scenes {W} only: full | key | none" },
            energy: { type: "integer", enum: [1, 2, 3, 4, 5], description: "pacing 1-5" },
          },
          required: ["scene"],
          additionalProperties: false,
        },
      },
    },
    required: ["variant", "textStyles", "transitions", "accents", "chapterLooks", "scenes"],
    additionalProperties: false,
  };
}

const clock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

export function artPrompt(script, { looks, allowed, recent, openings = null }) {
  const op = openingPrompt(openings);
  const ctx = artContext(script, null);
  const lines = ctx.scenes.map((s, i) => {
    const cf = s.type === "words" ? captionFacts(s) : null;
    const f = [isTextScene(s) ? "T" : "", isBackdropScene(s) ? "B" : "", isGradeScene(s) ? "G" : "", isTextualPicture(s) ? "D" : "", s.type === "counter" ? (counterPicOk(ctx.scenes, i) ? "C+" : "C") : "", cf ? (cf.info ? "W+" : cf.quote ? "Wq" : "W") : ""].join("");
    const pic = s.bg === "prev" ? "prev-pic" : isVideo(s) ? "video" : ownPicture(s) ? "pic" : "no-pic";
    return `#${i} [ch${chOf(s) + 1} ${clock(ctx.starts[i])}] ${s.type} ${moodOf(s)} ${pic}${f ? ` {${f}}` : ""} | ${stripTags(s.say).slice(0, 110)}${cf ? ` || on screen: "${String(s.text || "").slice(0, 60)}"${cf.keyword ? ` key "${cf.keyword}"` : ""}` : ""}`;
  }).join("\n");
  const system = [
    "You are the ART DIRECTOR of a premium YouTube documentary channel (the visual polish of Netflix docs, LEMMiNO, MagnatesMedia, Johnny Harris).",
    "Viewers complain the videos look monotonous: the same yellow keyword box, the same dark theme, the same effects. Your job: give THIS video its own look, and within it a rhythm of treatments that follows the story so nothing repeats enough to bore.",
    "",
    "YOU DECIDE:",
    "- variant: one look from the candidate list (the ones used by the last videos of this genre are already excluded).",
    "- textStyles: the 4-6 regular text styles this video uses (the look's own styles lead). Accent styles lyric (whole line fills the screen word by word) and kinetic (each word slams in on its spoken frame) are NOT part of these 4-6: use them on at most 3 text scenes in total, only on the hook (first ~40 s), a real quote, or a peak (energy 4-5), never on two consecutive text scenes and never on calm/sad scenes. transitions: a palette of 3-4 transition kinds. accents: 1-3 rare kinds for the biggest moments (≤3 uses in total).",
    "- chapterLooks: for EVERY chapter an accent colour (#rrggbb), a base grade and a backdrop — a colour journey that follows the story (e.g. warm at the start, cold when the crime happens, red at the climax, a soft resolve).",
    "- scenes: for each scene: textStyle on {T} scenes (text scenes — every one needs a style), backdrop on {B} scenes (text/counter/chart/quote/timeline not over a picture), grade on {G} scenes (photo/video), fx (0-2 effects), transition (INTO the scene; 'cut' is the default and most cuts should be plain); on {G} scenes also camera and fit.",
    "- camera: static | drift | push-in | pull-out | pan-left | pan-right | tilt-up | tilt-down | detail-punch | parallax | handheld | rack-focus. fit: cover | contain | smart (default smart).",
    "- edit grammar (the engine enforces it, so choose within it): in a grave story (war, death, collapse, crime) never light leaks, glitch, pixel, spin or split wipes, chroma, bokeh, VHS, flares. Loud devices — whip, zoom punch, slide, flash, zoom-blur, shake, speed-ramp, dolly-zoom — are accents: only on an impact (energy 4-5, a slam, a reveal) or a chapter turn, about once per chapter; dolly-zoom at most once per film, on dread. A sad, calm or held beat opens on a cut or a fade to black, and its camera holds, drifts or pushes in slowly; handheld belongs to action.",
    `- counterStyle on {C} scenes (counters) — how the figure is drawn: box (the look's original label box), bare (huge bare numeral + thin rule + small caps label), odometer (mechanical rolling digit drums), photo (the figure over the previous scene's darkened picture — only on {C+} scenes), ticker (stock-ticker paper tape, finance), newsprint (a newspaper clipping), outline (giant outlined numeral flooding with colour). Prefer the look's own counter list; match the moment (ticker for prices/volumes, odometer for money piling up, photo when the number is about the place just shown, newsprint for "the papers reported").`,
    "",
    "HARD RULES (code enforces them; anything that breaks one is replaced):",
    `- Never the same text style on two consecutive text scenes; no style on more than 35% of text scenes. lower-third only on {W+} info lines (name, place, date/time, number).`,
    `- Counters: never the same counterStyle on two consecutive counters; with 3+ counters use at least ${RULES.counterStylesMin} different ones; photo only on {C+}.`,
    `- Transitions: only the palette + accents; never the same non-cut transition twice in a row; roughly 60-70% plain cuts; heavy transitions (blackout, ink, paper-tear, iris, dip-color) only where mood or story turns; match only between two pictures.`,
    `- fx on at most 35% of scenes (aim for ~25%), never the same effect on two consecutive effect scenes; strong effects (glitch, shake, chroma, film-burn) only on tension/reveal moments and at most one per 45 s. Picture effects (parallax, rack-focus, push-in, dolly-zoom, tilt-reveal, zoom-blur, halftone, bokeh) only on scenes with their own picture; speed-ramp only on video.`,
    `- At most 2 different grades per chapter (the chapter grade + one accent grade for its hardest moments).`,
    `- BIG TEXT NEVER SITS ON AN EMPTY GROUND (viewers complained). Every {B} words/slam/title/counter/quote gets backdrop 'related' (the engine lays the nearest related picture or clip behind it, heavily darkened, drifting with depth blur; a clip plays slowed) with tone 'dark' or 'light' (washed into the look's paper) — or 'era' (newsprint / film gate / ledger texture) when the story is about paper, money or film. Plain 'solid'/'gradient' ONLY for a deliberate silence beat (energy 1, a calm/sad hush), at most ${SILENCE_BEATS_MAX} per video. paper/blueprint/halftone/split-color/texture are for charts and timelines. Use the light tone at least 3 times on curious/calm/triumph moments.`,
    `- ON-SCREEN TEXT ONLY WHEN IT ADDS SOMETHING (caption on {W} words scenes): the voice already says the line. full = the line on screen, its key word emphasised (for {W+} lines carrying a name, place, date/time or number, {Wq} real quotes, short punchy lines, deliberate peaks); key = only the key word, big, landing on its spoken frame (long lines that would just echo the narration); none = no text, a clean picture shot (filler lines with no key word — never on {W+}/{Wq}). Keep a Cooper-like rhythm of emphasis (a designed text moment every ~15-25 s), never a plain sentence copied under the picture. lower-third is the editorial info super (small-caps kicker, hairline, serif line): ONLY on {W+} lines.`,
    `- calm/sad scenes get gentle treatments only (serif/underline/lower-third/typewriter text, soft fx like light-leak/dust/bokeh/rack-focus, soft transitions like leak/dip-color/iris/slide).`,
    `- Camera: ~30-35% of picture scenes static or drift (documents, text-heavy pictures, emotional beats); never the same camera on 3 consecutive picture scenes; detail-punch and parallax are accents (at most one per ~40 s); handheld only on tension/chase moments; wide pictures pan, tall ones tilt or fit contain; {D} pictures (documents, scans, pictures with text) always fit contain with a calm camera. Never repeat the camera move as an fx.`,
    `- SLAMS ARE THE PUNCH viewers love: every slam gets an IMPACT text style (kinetic, stamp, box, outline, stack, glitch, neon, cutout — never serif, typewriter, lower-third, underline, marker or lyric, which render a slam small and thin), rotating so two consecutive slams never share a style; energy 5; a hit-timed fx (flash-frame, or shake/flare/vignette-pulse/chroma when the previous effect was flash-frame); and a sharp transition in (flash, zoom, whip, glitch, spin-blur, split-wipe, pixel, slide, film-burn). Montage hook words also use impact styles. THE HOOK: the first slam or words scene within the first 30 s is kinetic (it counts toward the 3 lyric/kinetic accents).`,
    `- PACING: give EVERY scene an energy 1-5 forming a wave per chapter: exposition low (1-2), build (3), peak (4-5 — only on tension/reveal/triumph moments, slams, montages), and right after every peak a BREATH scene with energy 1 (a held quiet frame: static camera, no fx, cut). Never more than 3 consecutive scenes at 4+. Every chapter needs a peak and a low stretch of 2+ scenes. Whole video ~40% low (1-2), 35% mid (3), 25% high (4-5).`,
    `- Energy drives everything: energy 1 → static/drift camera; 2 → calm moves; 3 → slow push/pan; 4-5 → fast push, detail-punch, handheld (tension only). No fx at 1-2; strong fx only at 5. Low energy (1-2) enters with a plain cut; peaks get the sharper transitions.`,
    `- Era: the enum lists are already filtered to what fits this story's era (no VHS outside the 80s-90s, no neon in medieval epics, etc.).`,
    "- Never change narration, order, timing, devices or sources — you only choose the look.",
    ...op.system,
  ].join("\n");
  const user = [
    `Documentary: "${script.title || ""}" · genre: ${script.genre || "documentary"} · era: ${script.era || "unknown"} · ${ctx.n} scenes · ~${clock(ctx.total)}`,
    `Chapters: ${(script.chapters || []).map((c, i) => `${i + 1}. ${typeof c === "string" ? c : c?.title}`).join(" · ")}`,
    ctx.topic ? `TOPIC IDENTITY (binding — the topic designer already decided; keep the video consistent with it): motif ${ctx.topic.motif}; text family ${ctx.topic.textStyles.join("/") || "-"} (your 4-6 text styles must include at least 3 of these); base photo grade ${ctx.topic.grade || "-"} for every chapter (one accent grade per chapter at most); accent ${ctx.topic.accent || "-"} for the first chapter; preferred grounds ${ctx.topic.backdrops.join("/") || "-"}; preferred looks ${ctx.topic.variants.join("/") || "-"}. Chapter cards, wipes, photo presentation and the signature explainers are drawn by the topic motif — do not fight it with loud transitions.` : "",
    recent.length ? `Last videos of this genre used: ${recent.map((e) => `${e.variant} (text: ${(e.textStyles || []).join("/")}; transitions: ${(e.transitions || []).join("/")})`).join(" | ")} — make this one feel different.` : "",
    "",
    ...op.user,
    "CANDIDATE LOOKS:",
    ...looks.map((l) => `- ${l.id}${l.original ? " (the ORIGINAL look viewers find monotonous — only if nothing else fits)" : ""}: text ${l.textStyles.filter((x) => allowed.textStyle.includes(x)).join("/")}; transitions ${l.transitions.filter((x) => allowed.transition.includes(x)).join("/")}; grades ${l.grades.filter((x) => allowed.grade.includes(x)).join("/")}; backdrops ${l.backdrops.join("/")}; fx ${l.fx.filter((x) => allowed.fx.includes(x)).join("/")}; camera ${lookCameras(l).join("/")}; counters ${(l.counterStyles || COUNTERS_DARK).filter((x) => (allowed.counterStyle || COUNTER_STYLES).includes(x)).join("/")}; accent ${l.accent}, light ${l.light}, dark ${l.dark}${l.description ? ` — ${l.description}` : ""}${l.suits ? ` Suits: ${l.suits}.` : ""}`),
    "",
    "SCENES (#n [chapter time] type mood picture {T=text, B=backdrop, G=grade, D=document picture, C=counter, C+=counter with a picture just before, W=words line, W+=words line carrying info, Wq=quote} | narration || on-screen text):",
    lines,
    "",
    "Return the plan. List every scene with at least its transition.",
  ].filter((x) => x !== "").join("\n");
  return { system, user };
}

/** Modelin cevabını buildPlan'ın öneri biçimine çevirir. */
function proposalOf(res, n) {
  const scenes = {};
  for (const e of Array.isArray(res?.scenes) ? res.scenes : []) {
    if (!isInt(e?.scene) || e.scene < 0 || e.scene >= n || scenes[e.scene]) continue;
    scenes[e.scene] = e;
  }
  return { opening: res?.opening, openingHook: res?.openingHook, variant: res?.variant, textStyles: res?.textStyles, transitions: res?.transitions, accents: res?.accents, chapterLooks: res?.chapterLooks, scenes };
}

/** Senaryonun özeti: aynı senaryo için plan bir kez kurulur (yedek plan da kayıtlı: devamda aynı görünüm). */
export function artKey(script, model = ART_MODEL, catalogs = null) {
  const scenes = (script.scenes || []).map((s) => {
    const { voice, voiceDur, wordTimes, image, imgW, imgH, video, videoStart, videoDur, videoW, videoH, archived, layers, heldBg, textStyle, backdrop, grade, fx, camera, fit, counterStyle, textMode, kicker, ...rest } = s;
    return rest;
  });
  const cat = catalogs ? [catalogs.source, catalogs.looks.map((l) => l.id), Object.fromEntries(Object.entries(catalogs.kinds || {}).map(([k, v]) => [k, [...v]]))] : null;
  // Konu kimliği planı değiştirir; yoksa anahtar eskisiyle aynı (kayıtlı planlar geçerli kalır).
  const topic = topicOf(script);
  return crypto.createHash("sha1").update(JSON.stringify([ART_VERSION, model, cat, script.id || "", script.seedKey || "", script.genre, script.era || "", script.chapters || [], script.locale || "", scenes, ...(topic ? [topic] : [])])).digest("hex");
}

const noCredit = (e) => /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(String(e?.message || e));

/** Planın en çok kullandığı 3 hareketli kamera (geçmiş için: sonraki videolar farklı hareket etsin). */
export function topCameras(plan) {
  const c = {};
  for (const e of plan.scenes) if (e.camera && !STILL_CAMS.has(e.camera)) c[e.camera] = (c[e.camera] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
}

/** Plan özeti (günlük ve önizleme için). */
export function summarizePlan(script, plan) {
  const cnt = (arr) => arr.reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {});
  const S = plan.scenes;
  const txt = cnt(S.filter((e) => e.textStyle).map((e) => e.textStyle));
  const tr = cnt(S.filter((e) => e.transition && e.transition !== "cut").map((e) => e.transition));
  const cuts = S.filter((e) => e.transition === "cut").length;
  const fx = cnt(S.flatMap((e) => e.fx || []));
  const fxScenes = S.filter((e) => e.fx?.length).length;
  const bds = S.filter((e) => e.backdrop);
  const light = bds.filter((e) => isLightBackdrop(e.backdrop)).length;
  const cam = cnt(S.filter((e) => e.camera).map((e) => e.camera));
  const camN = S.filter((e) => e.camera).length;
  const fmt = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(", ");
  return [
    `görünüm: ${plan.look.variant} · yazı stilleri [${plan.palette.textStyles.join(", ")}] · geçiş paleti [${plan.palette.transitions.join(", ")}]${plan.palette.accents.length ? ` + vurgu [${plan.palette.accents.join(", ")}]` : ""}`,
    `yazı: ${fmt(txt)}`,
    ...(S.some((e) => e.counterStyle) ? [`sayaç: ${S.filter((e) => e.counterStyle).map((e) => e.counterStyle).join(" → ")}`] : []),
    ...(S.some((e) => e.textMode) ? [`ekran yazısı: ${fmt(cnt(S.filter((e) => e.textMode).map((e) => e.textMode)))}`] : []),
    (() => {
      const en = S.filter((e) => isInt(e.energy));
      const pct = (f) => Math.round((en.filter(f).length / Math.max(1, en.length)) * 100);
      const wave = en.map((e) => e.energy).join("");
      return `tempo: düşük %${pct((e) => e.energy <= 2)} · orta %${pct((e) => e.energy === 3)} · yüksek %${pct((e) => e.energy >= 4)} · nefes ${en.filter((e, k) => k > 0 && e.energy === 1 && en[k - 1].energy >= 4).length} · pace ${fmt(cnt(en.map((e) => e.pace)))}\n  dalga: ${wave}`;
    })(),
    `geçiş: ${cuts} düz kesme · ${fmt(tr)}`,
    `efekt: ${fxScenes}/${script.scenes.length} sahne · ${fmt(fx)}`,
    `kamera: ${camN} resimli sahne, durağan %${Math.round((((cam.static || 0) + (cam.drift || 0)) / Math.max(1, camN)) * 100)}, contain ${S.filter((e) => e.fit === "contain").length} · ${fmt(cam)}`,
    `zemin: ${bds.length} sahne (${light} açık/renkli) · ${fmt(cnt(bds.map((e) => e.backdrop.kind)))}`,
    `bölümler: ${plan.chapterLooks.map((c, k) => `${k + 1}:${c.accent}/${c.grade}/${c.backdrop?.kind}`).join("  ")}`,
    `açılış: ${plan.opening?.kind ? `${plan.opening.kind} · kanca ${plan.opening.hook || "tür varsayılanı"}` : "klasik (montaj + başlık)"}`,
  ];
}

/**
 * SANAT YÖNETMENİ. Yeni bir senaryo ve değişiklik listesi döndürür; girdiyi değiştirmez.
 * @param opts.cacheFile   plan önbelleği (iş klasöründe) — aynı senaryo için yeniden kurulmaz
 * @param opts.historyFile görünüm geçmişi (varsayılan <NOVA_HOME>/data/docu-look-history.json)
 * @param opts.llm         test için callJSON yerine; `false` = modeli hiç çağırma (yedek planlayıcı)
 * @param opts.recordHistory false = geçmişe yazma (önizleme)
 * @returns {{script, changes, plan, mode: 'llm'|'fallback', cached, violations, skipped?}}
 */
export async function artDirect(script, { settings = {}, usage, logFn = () => {}, model, cacheFile = null, llm = callJSON, isCancelled = () => false, historyFile = defaultHistoryFile(), catalogs = null, recordHistory: record = true } = {}) {
  if (!script?.scenes?.length) return { script, changes: [], plan: null, mode: "none", cached: false, violations: [] };
  const cats = catalogs || loadCatalogs();
  const mdl = model || settings.docuArtDirectorModel || settings.docuDirectorModel || ART_MODEL;
  const key = artKey(script, mdl, cats);
  const cached = cacheFile ? readJson(cacheFile, null) : null;
  let plan = null;
  let mode = "fallback";
  let skipped;
  let fromCache = false;
  const history = readHistory(historyFile);
  if (cached?.key === key && cached.plan?.scenes) {
    plan = cached.plan;
    mode = cached.mode || "fallback";
    fromCache = true;
  } else {
    let prop = null;
    const { open, recent, ctx } = openLooks(script, cats, history);
    if (llm === false) skipped = "disabled";
    else if (!settings.anthropicKey && llm === callJSON) skipped = "no-key";
    else {
      const openings = openingChoices(script, history, ctx.era?.start ?? null);
      const { system, user } = artPrompt(script, { looks: open, allowed: ctx.allowed, recent, openings });
      try {
        const res = await llm({ system, user, schema: planSchema(open.map((l) => l.id), ctx.allowed, openings.open), maxTokens: 24000, usage, logFn, model: mdl, isCancelled });
        prop = proposalOf(res, ctx.n);
        mode = "llm";
      } catch (e) {
        if (e?.message === "cancelled" || isCancelled()) throw e;
        skipped = noCredit(e) ? "no-credit" : "error";
        logFn(`Sanat yönetmeni modeli kullanılamadı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 160)}) — belirleyici yedek planlayıcı devrede`);
      }
    }
    if (skipped === "no-key") logFn("Sanat yönetmeni: Anthropic anahtarı yok — belirleyici yedek planlayıcı devrede");
    plan = buildPlan(script, { prop, history, catalogs: cats });
    delete plan._usedTransitions;
    // A fallback forced by an empty balance or a passing error is not the film's look: kept out of the
    // cache and the channel history, so the resume after a top-up asks the model again (ranking test, 1.16).
    const transient = skipped === "no-credit" || skipped === "error";
    if (cacheFile && !transient) writeJson(cacheFile, { key, version: ART_VERSION, model: mdl, mode, savedAt: new Date().toISOString(), plan });
    if (record && historyFile && !transient) {
      try {
        recordHistory(historyFile, { id: script.id || script.seedKey || null, genre: ctx.genre, variant: plan.look.variant, textStyles: plan.palette.textStyles, transitions: plan.palette.transitions, cameras: topCameras(plan), opening: plan.opening?.kind || null, at: new Date().toISOString() });
      } catch (e) { logFn(`Görünüm geçmişi yazılamadı: ${String(e?.message || e).slice(0, 120)}`); }
    }
  }
  const out = applyArtPlan(script, plan, { logFn });
  const violations = checkPlan(out, { catalogs: cats, history });
  logFn(`Sanat yönetmeni${fromCache ? " (kayıttan)" : ""} [${mode === "llm" ? "Opus" : "yedek planlayıcı"}]: ${summarizePlan(script, plan)[0]}`);
  for (const l of summarizePlan(script, plan).slice(1)) logFn(`  ${l}`);
  for (const nt of plan.notes || []) logFn(`  not: ${nt}`);
  if (violations.length) logFn(`  Kural uyarısı (${violations.length}): ${violations.slice(0, 5).join("; ")}`);
  const changes = plan.scenes.map((e) => ({ scene: e.i, ...Object.fromEntries(ART_FIELDS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]])) }));
  return { script: out, changes, plan, mode, cached: fromCache, violations, ...(skipped ? { skipped } : {}) };
}

// SİNEMATİK BELGESEL SENARYOSU — docu-engine'in sahne dili için.
//
// Stok akışının senaryosu "bölüm → segment → görsel sorgusu" üretir; bu mod ise
// doğrudan KURGU yazar: her sahne bir çekim tipi (montaj, başlık, sayaç, fotoğraf,
// vurgu kelimesi, grafik), bir duygu (müziği, sesi ve rengi o belirler), bir
// ElevenLabs v3 performans satırı ve bir görsel tarifidir. Motor (docu-engine)
// bu dosyayı olduğu gibi üretir.
//
// Adımlar:
//   1) "kutsal kitap": tür, görsel dil, karakterler, bölümler VE uzun form omurgası
//      (merkez soru, vaat, açık döngüler, bölüm kancaları, gerilim eğrisi).
//   2) bölümler SIRAYLA yazılır: her yazar bir öncekinin son satırlarını ve
//      anlatılmış olguları görür (paralel yazımda bölümler birbirini tekrar
//      ediyor, uç uca eklenmiyordu). Her bölüm doğrulanınca diske yazılır;
//      çöküş/iptal sonrası devam, yazılmış bölümleri yeniden ödemez.
//   3) kısa kalan bölümler mevcut JSON'larıyla birlikte "uzat" istenerek büyütülür.
//   4) video geneli son geçiş: kotalar (slam, sessizlik, isim kartı), tekrar eden
//      görsel/arama, kapanış sahnesi.
// Kodla düzeltilebilen her hata (yanlış yerdeki montaj, bilinmeyen karakter,
// ekli slam kelimesi...) modele geri gönderilmez, burada düzeltilir: llm.js
// yeniden denemede önceki yanıtı göstermiyor, yani her ret tamamen YENİ bir
// bölüm demekti ve denemeler birbirine yakınsamıyordu.
import crypto from "node:crypto";
import path from "node:path";
import { TONES, DURATIONS } from "../config.js";
import { callJSON } from "../llm.js";
import { readJson, writeJson } from "../util.js";

/** Efektif anlatım hızı (kelime/dk) — v3 duraklamaları ve sahne nefesleri dahil. Ölçüldü: 80 kelime → 39 sn. */
export const DOCU_WPM = { tr: 120, en: 140 };
/**
 * Plan payı. "10 dk" isteği tam 10:00'a nişan alıyordu ve model kelime hedefini
 * hep biraz altında tuttuğu için video 10 dakikanın altında kalıyordu. %7 pay +
 * bölüm kartları + kapanış ≈ 10,7-11,2 dk.
 */
export const DOCU_HEADROOM = 1.07;
/**
 * Süre TAHMİNİ için saniye/kelime. Ölçülen v3 hızı 0,49-0,505 sn/kelime (TR,
 * belgesel.json: 68 kelime → 34,3 sn ses); tahmin bilerek DÜŞÜK tutulur: kapı
 * "kısa" tarafında yanılsın, kısa bir senaryoyu asla ücretli adıma geçirmesin.
 */
export const DOCU_SEC_PER_WORD = { tr: 0.47, en: 0.41 };
/** Motor her sesli sahneye sesten sonra 0,4 sn nefes bırakır (Engine.place). */
const SCENE_PAD = 0.4;
/** Motorun her bölüm değişiminde eklediği bölüm kartının süresi (sn). */
export const CHAPTER_CARD_SEC = 2.8;
/** v3 performans etiketleri dahil karakter/kelime. Ölçüldü: apollo13 8,59 · kasikci 8,43 · belgesel 8,03. */
export const DOCU_CHARS_PER_WORD = { tr: 8.4, en: 7.2 };
/** ElevenLabs müzik kredisi/dk. Ölçülmedi: fiyat sayfası 900 diyor; kötü durum varsayılır. */
export const ELEVEN_MUSIC_PER_MIN = 2500;
/** Sahne başı ortam sesi: 40 kredi/sn (sound-generation, süre verildiğinde). */
const AMBIENCE_PER_SEC = 40;
/** Bir türün efekt havuzu ilk kez üretilirken (7 tür × ~4 varyant). */
const SFX_POOL_CREDITS = 1300;
/** Senaryo istemleri değişince eski bölüm kayıtları geçersizleşsin. */
export const DOCU_PROMPT_VERSION = "docu-writer-3";
/** Bölüm bu oranın altında kalırsa "N kelime daha ekle" ile geri çevrilir. */
const MIN_CHAPTER_RATIO = 0.9;
/** Toplam bu oranın altındaysa en kısa bölümler uzatılır. */
const EXTEND_BELOW = 0.97;
/** Ücretli adımlardan önce: tahmini süre ≥ hedef × bu oran olmalı (tahmin zaten düşük tutuluyor). */
export const LENGTH_GATE = 1.02;

/**
 * Kurgu stilleri (docu-engine/src/genres.ts ile aynı kimlikler). Her biri kendi
 * renk dünyası, fontu, geçiş dili, müziği ve efekt dokusuyla gelir; Claude
 * hikâyeye bakıp seçer. `write` bloğu YAZARIN dilini belirler: yedi stil
 * eskiden yalnızca motorda (renk, müzik) ayrışıyordu, metin hepsinde aynı
 * suç-montajı kalıbıyla yazılıyordu.
 *   openers   ilk sahnenin olabileceği tipler (soğuk açılış)
 *   remap     türe yabancı duygu → yerine geçen (müziği o seçer)
 *   lastAllows remap'e rağmen SON bölümde serbest olanlar (suçta çözümün zaferi)
 */
export const DOCU_GENRES = [
  {
    id: "documentary", ad: "Belgesel", when: "iş/marka/insan hikâyesi, sıcak arşiv belgeseli (MagnatesMedia)",
    write: {
      openers: ["montage"],
      coldOpen: "Montaj: 5-7 makro detay müziğin vuruşuna kesilir, fısıltıyla; son kelime kanca (kırmızı düşer). Hemen ardından title, sonra vaat.",
      stance: "Sıcak, hafif ironik, iş ve insan riskini anlatan anlatıcı: paranın, kararın, egonun bedelini göster. Kahraman yok, kararlar var.",
      tags: ["[curious]", "[warmly]", "[dramatic]", "[serious]", "[whispers]"],
      moods: "ana duygular curious · tension · reveal; calm ve sad teneffüs, triumph yalnızca büyük kazanç anında",
      mix: "kolaj fotoğraflar (kişi, belge, bina), para ve ölçek için counter, dönüm noktasında slam; words yalnızca kilit cümlede",
      remap: {},
    },
  },
  {
    id: "crime", ad: "Suç / Gizem", when: "cinayet, soygun, dolandırıcılık, kayıp, çözülmemiş dosya; soğuk mavi-gri, delil kartları, daktilo",
    write: {
      openers: ["photo", "words", "montage"],
      coldOpen: "Tek bir delil üzerinde yavaş açılış: photo ya da words, fısıltıyla (boş bir duvar, kilitli bir kapı, bir saat). Hız değil gerginlik; istersen kısa bir montaj.",
      stance: "Soğuk, kesin, zaman damgalı: saati ve tarihi söyler ('Pazartesi. Sabah yedi yirmi.'). Yargılamaz, kanıtı gösterir; şüpheyi izleyiciye bırakır.",
      tags: ["[quietly]", "[serious]", "[whispers]", "[slowly]"],
      moods: "ana duygular tension · dread · reveal; calm nadir; triumph YALNIZCA son bölümdeki çözümde",
      mix: "delil fotoğrafları, tarih/saat damgalı words, isim kartlı arşiv portreleri; slam itiraf veya ifşa anında",
      remap: { triumph: "reveal" },
      lastAllows: ["triumph"],
    },
  },
  {
    id: "epic", ad: "Epik Tarih / Savaş", when: "imparatorluk, savaş, fetih, kuşatma, büyük tarihî figürler; bronz-altın, savaş davulları, koro",
    write: {
      openers: ["title", "photo", "montage"],
      coldOpen: "Yavaş, geniş açılış: ufuk, sur, ordu; bir ilan gibi tek cümle ('[slowly] Bin yıllık surlar... yirmi bir yaşında bir sultan...'), davullar. Başlık erken gelir.",
      stance: "Görkemli ve ölçülü, tarihçi ağzı; kısa hükümler. Kahramanlaştırmadan büyüklüğü ve bedelini hissettir.",
      tags: ["[slowly]", "[confident]", "[dramatic]", "[serious]"],
      moods: "ana duygular tension · triumph · sad; reveal dönüm anında; curious yalnızca açılışta",
      mix: "geniş planlar, harita ve tablo arşivleri, ordu/gemi/asker sayıları için counter (yıl sayacı yapma, yılı söyle), dönüm noktasında slam",
      remap: {},
    },
  },
  {
    id: "science", ad: "Bilim / Uzay", when: "uzay, fizik, keşif, teknoloji, doğa bilimleri; lacivert-camgöbeği, ambient synth, hayranlık",
    write: {
      openers: ["counter", "words", "montage"],
      coldOpen: "Ölçeğin çarpıcılığıyla aç: tek bir sayı (counter: mesafe, yaş, hız) ya da tek cümle words; istersen kısa montaj.",
      stance: "Hayranlık ve berraklık: zor fikri tek somut benzetmeyle anlat, abartma. Merakı büyüt, korkutma.",
      tags: ["[curious]", "[excited]", "[softly]", "[warmly]"],
      moods: "ana duygular curious · calm · reveal · triumph; tehdit yerine tension",
      mix: "chart (araştırmadaki gerçek seri), counter (ölçek), NASA/ESA arşiv fotoğrafları; words kısa tanımlar için",
      remap: { dread: "tension" },
    },
  },
  {
    id: "inspire", ad: "Biyografi / İlham", when: "bir insanın yükselişi, azim, başarı, dönüm noktaları; sıcak ışık, piyano ve yaylılar, umut",
    write: {
      openers: ["photo", "words"],
      coldOpen: "Bir portre ve tek, sessiz bir satır ('[softly] Uçağı kendi yaptı... uçtuğu için ceza aldı.'). Montaj yok.",
      stance: "Samimi ve yakın: kişinin bedelini ve iç sesini anlat, başarıyı değil yolculuğu. Övgü sıfatı yok; sahne ve karar var.",
      tags: ["[warmly]", "[softly]", "[sad]", "[confident]"],
      moods: "yay: sad → tension → triumph; calm teneffüs; dread yerine tension",
      mix: "photo (aile, çocukluk, belge), alıntı gibi kısa words, zafer anında slam",
      remap: { dread: "tension" },
    },
  },
  {
    id: "finance", ad: "Finans", when: "borsa, kriz, para, şirket çöküşü; yeşil-siyah veri gerilimi",
    write: {
      openers: ["counter", "words", "montage"],
      coldOpen: "Bir rakamla aç (counter: '381 puan', sonra '41'), ya da manşet gibi tek bir words.",
      stance: "Keskin analist: neden-sonuç, kim kazandı kim kaybetti; her iddiayı bir rakam taşır. Duygu rakamın içinden gelir.",
      tags: ["[serious]", "[confident]", "[dramatic]", "[quietly]"],
      moods: "ana duygular tension · reveal · dread; triumph yalnızca kazananlar için",
      mix: "chart (gerçek fiyat serisi), counter, manşet words; photo borsa, kalabalık, belge",
      remap: {},
    },
  },
  {
    id: "horror", ad: "Korku", when: "lanet, perili yer, doğaüstü, gerçek dehşet olayları; karanlık, kan kırmızısı, siyah geçişler",
    write: {
      openers: ["words", "photo"],
      coldOpen: "Yavaş ve sessiz inşa: boş bir mekân (photo) ya da tek satır words, [whispers]. HIZLI MONTAJ YOK.",
      stance: "Kısık ve ölçülü: asla bağırmaz, gösterilmeyeni hissettirir. Kan ve ceset değil; iz, gölge, boş yer, tarih damgası.",
      tags: ["[whispers]", "[quietly]", "[slowly]", "[serious]"],
      moods: "ana duygular dread · tension · sad; zafer yok (ifşa reveal ile)",
      mix: "boş mekânlar, siluetler, tarih damgalı words, eski belgeler",
      remap: { triumph: "reveal" },
    },
  },
];
const genreOf = (id) => DOCU_GENRES.find((g) => g.id === id) || DOCU_GENRES[0];

const MOODS = ["curious", "calm", "tension", "dread", "reveal", "sad", "triumph"];
const TYPES = ["montage", "title", "counter", "words", "photo", "slam", "chart", "headline", "map", "board", "document", "timeline", "split", "quote"];
/** Kurgu cihazları (motorun yeni sahne tipleri): docu-edit-director.js aynı kurallarla doğrular. */
const DEVICE_SCENE_TYPES = ["headline", "map", "board", "document", "timeline", "split", "quote"];
/** Yazarın kullanabildiği harita bölgeleri (docu-engine/src/geo.ts; yalnızca coğrafi olanlar — yer enlem/boylamla verilir). */
const WRITER_MAP_REGIONS = ["pacific-northwest", "bosphorus", "north-atlantic", "urals"];
const TRANSITIONS = ["", "cut", "flash", "zoom", "glitch", "blackout", "whip", "leak"];
/** Motorun v3 satırına etiket yoksa eklediği duygu etiketi (produce.mjs MOOD_TAG ile aynı). */
const MOOD_TAG = { curious: "[curious]", calm: "[warmly]", tension: "[quietly]", dread: "[whispers]", reveal: "[dramatic]", sad: "[sad]", triumph: "[confident]" };

const langOf = (job) => (job?.language === "en" ? "en" : "tr");

export function docuPlan(job) {
  const minutes = DURATIONS[job.durationPreset]?.minutes || 8;
  const wpm = DOCU_WPM[job.language] || DOCU_WPM.tr;
  // Kelime payla planlanır; sahne sayısı PAYSIZ kelimeden: sahne = görsel parası,
  // fazladan kelime satırları uzatarak sığar.
  const words = Math.round(minutes * wpm * DOCU_HEADROOM);
  const chapters = minutes <= 1.5 ? 1 : Math.max(2, Math.min(16, Math.round(minutes / 1.6)));
  // Sahne başına ~9 kelime ≈ 4-5 sn: referans kurgularda "her saniye bir şey olur" temposu.
  const scenes = Math.max(8, Math.round((minutes * wpm) / 9));
  if (job.docuFormat === "ranking") return rankingPlan({ minutes, words, scenes });
  const scenesPerChapter = Math.round(scenes / chapters);
  const range = [Math.max(4, Math.round(scenesPerChapter * 0.85)), Math.max(6, Math.round(scenesPerChapter * 1.15))];
  return {
    minutes, words, chapters, scenes,
    wordsPerChapter: Math.round(words / chapters),
    scenesPerChapter,
    scenesRange: range,
    secondsPerChapter: Math.round((minutes * 60) / chapters),
    chapterWords: Array.from({ length: chapters }, () => Math.round(words / chapters)),
    chapterScenes: Array.from({ length: chapters }, () => range),
    ...(job.docuFormat === "news" ? { news: true } : {}),
  };
}

/**
 * RANKING (countdown) plan: chapter 1 is the intro (cold open, the ranking's criterion, the promise
 * of number one), then one chapter per item from N down to 1. Number one is the longest (x1.5), the
 * intro the shortest (~9% of the words). 5 items up to 6 min, 7 up to 10, then 10.
 */
export function rankingItems(minutes) {
  return minutes <= 6 ? 5 : minutes <= 10 ? 7 : 10;
}

function rankingPlan({ minutes, words, scenes }) {
  const items = rankingItems(minutes);
  const chapters = items + 1;
  // A countdown's intro is 30-45 s: the cold open, the criterion, the promise of number one.
  const intro = Math.max(60, Math.min(110, Math.round(words * 0.05)));
  const unit = (words - intro) / (items - 1 + 1.5);
  const chapterWords = [intro, ...Array.from({ length: items }, (_, k) => Math.round(k === items - 1 ? unit * 1.5 : unit))];
  const perWord = scenes / words;
  const chapterScenes = chapterWords.map((w) => {
    const s = w * perWord;
    return [Math.max(3, Math.round(s * 0.85)), Math.max(4, Math.round(s * 1.15))];
  });
  return {
    minutes, words, chapters, scenes, items, ranking: true,
    wordsPerChapter: Math.round(unit),
    scenesPerChapter: Math.round(unit * perWord),
    scenesRange: chapterScenes[1],
    secondsPerChapter: Math.round((minutes * 60) / chapters),
    chapterWords,
    chapterScenes,
  };
}

function bibleSchema(plan) {
  const base = docuBibleSchema(plan);
  if (!plan.ranking) return base;
  // Countdown: chapter 1 is the intro (rank 0), then ranks N..1; every item names where and when it happened.
  const ch = base.properties.chapters.items;
  ch.properties = {
    ...ch.properties,
    rank: { type: "integer", description: `Maddenin sırası: bölüm 1 GİRİŞ (0), sonra ${plan.items}'dan 1'e azalan (${plan.items}, ${plan.items - 1}, … 1)` },
    item: { type: "string", description: "Maddenin kısa adı, sıra kartında büyük yazılır (video dilinde, 2-6 kelime). Giriş için videonun konusu." },
    place: { type: "string", description: "Nerede (video dilinde, kısa: 'Ural Dağları, SSCB'). Giriş için boş." },
    year: { type: "integer", description: "Maddenin ana yılı (MÖ ise negatif). Giriş için 0." },
    whyHere: { type: "string", description: "Neden bu sırada: ölçüte göre bir üstünden neden daha az, bir altından neden daha çok (1 cümle). Giriş için ölçütün kendisi." },
  };
  ch.required = [...ch.required, "rank", "item", "place", "year", "whyHere"];
  base.properties.criterion = { type: "string", description: "Sıralamanın ölçütü, ölçülebilir ve savunulabilir (video dilinde, 1 cümle): 'bugün hâlâ ne kadar az şey bildiğimize göre'" };
  base.required = [...base.required, "criterion"];
  return base;
}

function docuBibleSchema(plan) {
  const long = plan.minutes >= 8;
  return {
    type: "object",
    properties: {
      title: { type: "string", description: "Videonun başlığı (video dilinde, merak uyandıran)" },
      genre: { type: "string", enum: DOCU_GENRES.map((g) => g.id), description: "Kurgu stili — hikâyenin RUHUNA en uyan: " + DOCU_GENRES.map((g) => `${g.id} = ${g.when}`).join("; ") },
      visualStyle: { type: "string", description: "İNGİLİZCE, tek cümle: tüm görsellerin ortak dili (dönem, film stoğu, ışık, lens). Örn: 'Authentic 1970s Istanbul documentary photograph, grainy Kodak Tri-X black and white film, natural available light, candid, archival print texture.'" },
      centralQuestion: { type: "string", description: "Videonun MERKEZ SORUSU (video dilinde, tek soru cümlesi). İzleyici cevabı için sonuna kadar kalır; son bölüm cevaplar." },
      stakes: { type: "string", description: "Ne kaybedilebilirdi, neden önemli (video dilinde, 1 cümle)" },
      promise: { type: "string", description: "İlk 30 saniyede anlatıcının söyleyeceği VAAT: izleyici sonunda neyi anlayacak (video dilinde, 1 cümle, 'bu videoda' kalıbı OLMADAN)" },
      hookWord: { type: "string", description: "Soğuk açılışın kanca kelimesi/ifadesi (video dilinde, 1-3 kelime); son bölüm ona geri döner" },
      openLoops: {
        type: "array",
        description: "Açık döngüler: erken kurulan, sonraki bir bölümde cevaplanan merak soruları (bölüm numaraları 1'den başlar, setupChapter < payoffChapter)",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Merak sorusu (video dilinde)" },
            setupChapter: { type: "integer", description: "Kurulduğu bölüm (1'den başlar)" },
            payoffChapter: { type: "integer", description: "Cevaplandığı bölüm (setupChapter'dan büyük)" },
          },
          required: ["text", "setupChapter", "payoffChapter"],
          additionalProperties: false,
        },
      },
      cast: {
        type: "array",
        description: long
          ? "Tekrar görünen kişiler (0-8). Tutarlılık için her birinin TEK bir referans portresi üretilecek. Aynı kişi on yıllar içinde değişiyorsa her dönemi AYRI anahtar yap (hasan_young, hasan_old), her biri kendi yaşıyla."
          : "Tekrar görünen kişiler (0-4). Tutarlılık için her birinin TEK bir referans portresi üretilecek.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "kısa latin anahtar, küçük harf: hasan, nermin, ceo, hasan_old" },
            description: { type: "string", description: "İNGİLİZCE görünüş tarifi: yaş, dönem, saç, bıyık, kıyafet. GERÇEK İSİM YAZMA — yüzü tarif et." },
          },
          required: ["key", "description"],
          additionalProperties: false,
        },
      },
      chapters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Bölüm başlığı (ekranda bölüm kartı + YouTube bölüm işareti; kısa, video dilinde)" },
            goal: { type: "string", description: "Bu bölümün anlatı hedefi ve duygusal yayı, 1-2 cümle" },
            covers: { type: "array", items: { type: "string" }, description: "Bu bölümde işlenecek somut olgular (2-5); başka bölümde tekrar etmez" },
            hookIn: { type: "string", description: "Bölümün ilk cümlesinin kancası: izleyiciyi neyle içeri çekeceği" },
            turn: { type: "string", description: "Bölüm içindeki dönüm noktası (müzik/duygu burada değişir)" },
            cliffhanger: { type: "string", description: "Bölüm sonunda bırakılan merak; son bölümde akılda kalan kapanış fikri" },
            intensity: { type: "integer", enum: [1, 2, 3, 4, 5], description: "Gerilim düzeyi 1-5; eğri yükselir, zirve son üçte birde" },
            midpoint: { type: "boolean", description: "Yalnızca ortadaki BİR bölüm true: hikâyenin yönünü değiştiren büyük ifşa" },
          },
          required: ["title", "goal", "covers", "hookIn", "turn", "cliffhanger", "intensity", "midpoint"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "genre", "visualStyle", "centralQuestion", "stakes", "promise", "hookWord", "openLoops", "cast", "chapters"],
    additionalProperties: false,
  };
}

const SHOT = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    cast: { type: "array", items: { type: "string" } },
  },
  required: ["prompt", "cast"],
  additionalProperties: false,
};

const SCENES_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: TYPES },
          mood: { type: "string", enum: MOODS },
          say: { type: "string", description: "Anlatıcının bu sahnedeki satırı (video dilinde), başında İngilizce v4 yönlendirmesi olabilir: [whispers], [quiet, tense] ..." },
          dur: { type: "number", description: "Sahnenin en kısa süresi (sn). Ses daha uzunsa sahne uzar." },
          imagePrompt: { type: "string", description: "İNGİLİZCE çekim tarifi (montage/counter/chart dışında zorunlu)" },
          cast: { type: "array", items: { type: "string" }, description: "Bu karede görünen karakter anahtarları" },
          depth: { type: "boolean", description: "Karede TEK kişi net ve orta planda ise true (2.5D derinlik, yazı kişinin arkasına geçer)" },
          sound: { type: "string", description: "İNGİLİZCE ortam sesi: 'rain on a window, distant thunder'. Aynı mekânda ardışık sahnelerde AYNI metin. Müzik/konuşma yazma." },
          transition: { type: "string", enum: TRANSITIONS, description: "Boş = motor seçer" },
          silence: { type: "boolean", description: "Müzik bu sahnede tamamen çekilsin (yalnızca son bölümde, en fazla 1 kez)" },
          riser: { type: "boolean", description: "Bu sahneye yükselen gerilim sesiyle girilsin (slam ve montaj için)" },
          kicker: { type: "string" }, title: { type: "string" },
          word: { type: "string", description: "slam: say'deki bir kelimenin eklerle birlikte AYNISI" }, sub: { type: "string" },
          from: { type: "number" }, to: { type: "number" }, label: { type: "string" }, prefix: { type: "string" }, suffix: { type: "string" }, decimals: { type: "number" },
          year: { type: "boolean", description: "counter: sayı bir YIL ise true (1453) — binlik ayırıcı olmadan gösterilir" },
          name: { type: "string" }, role: { type: "string" }, caption: { type: "string" },
          text: { type: "string", description: "words: ekrana yazılacak cümle (say'in kelimeleri, aynı sırayla). montage: say içinde AYNEN geçen 2-4 anahtar kelime, sonuncusu kanca" },
          keyword: { type: "string", description: "words: vurgulanacak tek kelime, text içinde aynen geçmeli — satırın en güçlü içerik kelimesi (isim/sayı/kavram)" },
          points: { type: "array", items: { type: "number" }, description: "chart: 4-12 gerçek veri noktası" },
          imagePrompts: { type: "array", items: SHOT, description: "montage: 5-7 çekim; photo: 0-1 ek belge/detay kartı" },
          fullBleed: { type: "boolean" },
          source: { type: "string", enum: ["archive", "stock", "ai"], description: "Görselin kaynağı: archive = gerçek arşiv fotoğrafı, stock = ücretsiz genel atmosfer fotoğrafı, ai = üretilir (en fazla ~15)" },
          bg: { type: "string", enum: ["prev"], description: "words/slam: yeni görsel yerine önceki sahnenin fotoğrafı" },
          search: { type: "string", description: "source=archive ise İNGİLİZCE arşiv arama sorgusu: özel isim + yer + yıl ('Apollo 13 crew 1970 portrait', 'Topkapi Palace treasury'). 3-6 kelime." },
          // ---- kurgu cihazları (SAHNE DİLİ'ndeki KURGU CİHAZLARI) ----
          paper: { type: "string", description: "headline: gazetenin adı (THE OREGONIAN)" },
          headline: { type: "string", description: "headline: manşet, gazetenin dilinde, 2-8 kelime" },
          date: { type: "string", description: "headline: gazetedeki tarih satırı" },
          translation: { type: "string", description: "headline: yabancı dildeki manşetin video dilinde çevirisi" },
          region: { type: "string", enum: WRITER_MAP_REGIONS, description: "map: harita bölgesi" },
          places: {
            type: "array",
            description: "map: 1-6 yer, GERÇEK enlem/boylamla (kod karedeki konuma çevirir)",
            items: { type: "object", properties: { label: { type: "string" }, lat: { type: "number" }, lon: { type: "number" } }, required: ["label", "lat", "lon"], additionalProperties: false },
          },
          route: { type: "array", items: { type: "integer" }, description: "map: rota, places indeksleri sırayla" },
          line: { type: "string", enum: ["route", "barrier"] },
          focus: { type: "integer", description: "map/board/timeline: kameranın yaklaşacağı öğenin indeksi" },
          items: {
            type: "array",
            description: "board: 2-6 kişi/ipucu",
            items: { type: "object", properties: { fromScene: { type: "integer", description: "BU BÖLÜMDE daha önceki, o kişiyi/yeri gösteren sahnenin sırası (0'dan)" }, label: { type: "string" }, note: { type: "string" } }, required: ["label"], additionalProperties: false },
          },
          links: { type: "array", items: { type: "array", items: { type: "integer" } }, description: "board: bağlanan öğe çiftleri [[0,1]]" },
          doc: {
            type: "object",
            description: "document: ekrana dizilen belge",
            properties: { kind: { type: "string", enum: ["fbi-teletype", "letter", "report", "telegram", "ledger"] }, heading: { type: "string" }, lines: { type: "array", items: { type: "string" } } },
            required: ["kind", "lines"],
            additionalProperties: false,
          },
          highlight: { type: "string", description: "document: doc.lines içinde AYNEN geçen, vurgulanacak ifade" },
          redact: { type: "array", items: { type: "string" }, description: "document: karartılacak ifadeler (doc.lines içinde aynen)" },
          stamp: { type: "string", description: "document: kısa damga (GİZLİ)" },
          events: {
            type: "array",
            description: "timeline: 3-7 olay, yıllar anlatımda geçen yıllar",
            items: { type: "object", properties: { year: { type: "integer" }, label: { type: "string" } }, required: ["year", "label"], additionalProperties: false },
          },
          left: { type: "object", properties: { fromScene: { type: "integer" }, label: { type: "string" } }, required: ["label"], additionalProperties: false },
          right: { type: "object", properties: { fromScene: { type: "integer" }, label: { type: "string" } }, required: ["label"], additionalProperties: false },
          mode: { type: "string", enum: ["versus", "before-after"] },
          quote: { type: "string", description: "quote: say içinde AYNEN geçen alıntı" },
          who: { type: "string", description: "quote: alıntının sahibi" },
          when: { type: "string" },
          fromScene: { type: "integer", description: "quote: BU BÖLÜMDE daha önceki, konuşanı gösteren sahnenin sırası (0'dan)" },
          annotate: {
            type: "object",
            description: "photo (archive): fotoğraftaki kişiyi/ayrıntıyı çemberle işaretle",
            properties: { label: { type: "string" }, target: { type: "string", description: "İNGİLİZCE: işaretlenecek şey ('the man in the dark raincoat')" } },
            required: ["label", "target"],
            additionalProperties: false,
          },
        },
        required: ["type", "mood", "say", "dur"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
};


const langName = (l) => (l === "en" ? "English" : "Türkçe");

/**
 * Sabit editör talimatı. job.theme BİLEREK okunmuyor: arayüz docu'da tema
 * panelini gizliyor ama formun varsayılanı "vox" idi, yani her belgesele
 * gizlice "'Şunu fark ettiniz mi?' diye başla, izleyiciye 'siz' de" yazılıyordu.
 * Belgeselin dilini tür (genreBrief) belirler.
 */
function editorBrief(job) {
  const tone = TONES[job.tone] || TONES.varsayilan;
  return [
    "Sen MagnatesMedia, Johnny Harris, LEMMiNO ve Netflix belgeselleri düzeyinde uzun biçimli YouTube belgeselleri yazan ve KURGULAYAN bir senarist-editörsün.",
    "Metni değil, izleyicinin ne GÖRECEĞİNİ, ne DUYACAĞINI ve ne HİSSEDECEĞİNİ yazıyorsun: her sahne bir çekim.",
    `Video dili: ${langName(job.language)}. Anlatıcı satırları (say), ekran yazıları (title, kicker, word, sub, text, label, name, role, caption) bu dilde.`,
    "Görsel tarifleri (imagePrompt, imagePrompts, visualStyle, cast description) ve ortam sesleri (sound) İNGİLİZCE.",
    job.guidance ? `Kanal sahibinin isteği: ${job.guidance}` : "",
    tone.prompt,
    "Olgular doğru olsun: tarih ve sayıları araştırma dosyasından al, uydurma. Emin olmadığın rakamı sayaç ya da grafik yapma.",
    "Anlatıma ASLA 'abone ol', 'beğen', 'bu videoda göreceğiz' yazma.",
  ].filter(Boolean).join("\n");
}

/** Türe özgü yazım dili — bölüm sisteminin sabit (önbelleğe alınan) kısmına girer. */
export function genreBrief(genreId) {
  const g = genreOf(genreId);
  const w = g.write;
  const remap = Object.entries(w.remap || {}).map(([a, b]) => `${a} yerine ${b}`).join(", ");
  return [
    `KURGU STİLİ: ${g.ad} (${g.id}) — ${g.when}.`,
    `Soğuk açılış: ${w.coldOpen} İlk sahne tipi: ${w.openers.join(" / ")}.`,
    `Anlatıcı: ${w.stance}`,
    `v3 etiket paleti (ağırlıkla bunlar): ${w.tags.join(" ")}`,
    `Duygular: ${w.moods}${remap ? ` (${remap})` : ""}.`,
    `Çekim karışımı: ${w.mix}.`,
  ].join("\n");
}

/** Görsel kaynağı kuralı — seçilen moda göre senaryo yazarına verilir. */
export function sourceRule(job) {
  if ((job.docuSource || "archive") === "ai") {
    return [
      "GÖRSEL KAYNAĞI: SADECE AI. Her sahnede source \"ai\"; arşiv sorgusu yazma.",
      "- Gerçek kişilerin yüzü üretilmiş olacak: isim kartını (name/role) seyrek kullan; rolün yanına motor '— canlandırma' ekler.",
    ].join("\n");
  }
  return [
    "GÖRSEL KAYNAĞI: ARŞİV AĞIRLIKLI. Gerçek hikâyede izleyici gerçek fotoğrafa inanır; AI yalnızca fotoğrafı olamayacak anlar için.",
    "- source \"archive\": GERÇEK kişi (portre), gerçek yer/bina, gerçek nesne/belge, gerçek olayın fotoğrafı. search = özel isim + yer + yıl, İngilizce, 3-6 kelime ('Gene Kranz mission control 1970', 'Apollo 13 service module damage'). Genel kavram arama ('sad man', 'money'). Aynı sorguyu videoda ikiden fazla yazma.",
    "- source \"stock\": GENEL atmosfer/ara plan (yağmurlu cam, fırtınalı deniz, karlı orman, eski gazete, şehir ışıkları). search = stok sitesinin bulacağı 2-4 düz İngilizce kelime ('rain window night', 'stormy sea'). Ücretsiz gerçek fotoğraf (Pexels/Pixabay/Unsplash).",
    "- bg \"prev\": words ve slam sahneleri çoğunlukla YENİ görsel istemez — yazı bir önceki fotoğrafın üstüne gelir; imagePrompt yazma. Profesyonel kurguda her cümleye yeni kare kesilmez.",
    "- source \"ai\": YALNIZCA fotoğrafı OLAMAYACAK ve stokla da gösterilemeyecek an (o gece uçaktan atlayan adam, fotoğraf öncesi dönemde bir an, iç dünya). Videoda EN FAZLA ~15 AI görsel, montaj kareleri dahil.",
    // Çok uzun videoda hep aynı kişi/yer sorgusu zayıf aday getiriyordu: genel kareler stoktan gelir.
    "- Dağılım: gerçek kişi/yer/olay → archive, genel atmosfer → stock, yazı/slam → bg prev, kalan birkaç an → ai. Fotoğraf çağından önceki konularda (1800 öncesi) archive'ı müze tabloları, minyatürler, gravürler ve haritalar için kullan ('Ottoman palace 17th century painting').",
    "- archive ve stock sahnelerde de imagePrompt yaz: uygun fotoğraf çıkmazsa sahne onunla AI'a düşer (motorun AI tavanı aşılırsa önceki fotoğrafa).",
    "- montage kareleri de gerçek olabilir: imagePrompts girdisini {\"prompt\":\"...\",\"source\":\"archive\"|\"stock\",\"search\":\"...\"} yaz; gerçek karşılığı olamayan kare düz metin (AI) kalır.",
    "- name/role (isim kartı) yalnızca source \"archive\" sahnelerde: AI'ın çizdiği yüzün altına gerçek bir kişinin adı yazılmaz.",
  ].join("\n");
}

const SCENE_GRAMMAR = `SAHNE DİLİ (motorun bildiği çekimler):
- montage: soğuk açılış cihazı; yalnızca videonun İLK sahnesi olabilir (tür montajla açılıyorsa). 5-7 kısa çekim müziğin vuruşuna kesilir; text = say içinde AYNEN geçen 2-4 anahtar kelime (aynı sırayla), sonuncusu kanca (ekrana kırmızı ve büyük düşer). say kısa: "[whispers] Bir tarif... Bir sokak... [dramatic] Ve bir ihanet." imagePromptlar makro detaylar, gölgeler, gözler — hikâyenin parçaları, sırrı vermeden.
- title: YALNIZCA ilk bölümde, videonun adı (kicker küçük üst yazı + title iki-üç kelime), ilk 4 sahnenin içinde. Bölüm kartlarını ("BÖLÜM 2" + bölüm adı) motor kendisi ekler: bölüm kartı ya da ikinci bir title YAZMA.
- counter: büyük bir sayı sayarak yükselir (from→to, label). Yalnızca araştırmadaki gerçek ve çarpıcı rakamlar; aynı sayıyı iki kez sayaç yapma. Sayı bir YIL ise year:true. imagePrompt yazma.
- words: bir cümle kelime kelime anlatıcıyla ekrana gelir, keyword vurgulanır. text = say'in kelimeleri AYNEN ve AYNI SIRAYLA (tamamı ya da say'den sıralı bir anahtar ifade); keyword text'te AYNEN geçen tek kelime — satırın en güçlü İÇERİK kelimesi (isim, sayı, kavram; 'something/thing/very' gibi boş kelime değil). Arkada bir görsel (imagePrompt). Ekran yazısı sesin ötesinde bir şey katmalı: isim, yer, tarih/saat, sayı, gerçek alıntı ya da bölümün kilit kavramı; anlatıcının söylediği sıradan bir ifadeyi ekrana kopyalama (sanat yönetmeni böyle dolgu satırları yazısız görüntüye çevirir).
- photo: bir kişi veya belge. name/role yalnızca kişinin videodaki İLK görünüşünde (alt yazı kartı), caption kısa bir yargı ("Tek kuruş almadı"). imagePrompts ile 1 ek belge/detay kartı eklenebilir.
- slam: dönüm noktası. Nefes → tek kelime (word) çarpar. word, say'deki bir kelimenin eklerle birlikte AYNISIDIR ("ihanete" diyorsan word "ihanete", "Enron'un" diyorsan "Enron'un"); genelde cümlenin son kelimesi. riser:true. Bölüm başına en fazla 1.
- chart: araştırmadaki GERÇEK bir veri serisi (4-12 nokta; points, title, prefix/suffix, from/to etiketleri). Uydurma seri yok. imagePrompt yazma.

KURGU CİHAZLARI (seyrek ve yerinde: yalnızca anlatım gerçekten o cihazı istiyorsa). İki cihaz arasında en az 35-45 sn; aynı cihaz art arda iki kez gelmez; 12 dk'lık videoda toplam 12-20 (bölüm başına 1-3). Olgular yalnızca araştırmadan ve anlatımdan: uydurma isim, tarih, alıntı, belge metni YOK. Her cihaz sahnesine de imagePrompt yaz (cihaz geçersiz sayılırsa sahne onunla fotoğrafa döner). İsim kartı taşıyan sahne cihaz olmaz.
- headline: basın tepkisi — gazete manşeti. paper, headline (gazetenin dilinde 2-8 kelime), date, translation (video dilinde). Yalnızca anlatım basından/manşetten söz ediyorsa.
- map: yer ve rota. region (pacific-northwest, bosphorus, north-atlantic, urals — hikâyenin yeri bunların içindeyse), places [{label, lat, lon}] GERÇEK koordinatlarla, route (indeksler), focus. Etiketler anlatımda geçen yer adları.
- board: dedektif panosu — şüpheliler, kişiler, olası açıklamalar birbirine bağlanır. items [{label, note?, fromScene?}], links [[0,1]]. fromScene: bu bölümde DAHA ÖNCEKİ, o kişiyi gerçekten gösteren sahnenin sırası (0'dan); emin değilsen yazma.
- split: iki şey karşı karşıya ya da önce/sonra. left/right {label, fromScene?}, mode versus | before-after.
- document: kilit bir belge/ifade/telgraf. doc {kind: fbi-teletype | letter | report | telegram | ledger, heading, lines: anlatımdaki olgulardan 2-6 kısa belge satırı}, highlight (satırlarda AYNEN geçen), redact, stamp.
- timeline: yıllara yayılan olaylar. events [{year, label}] 3-7 olay; her yıl anlatımda GEÇEN bir yıl.
- quote: gerçek bir alıntı kartı. say satırı alıntıyı içerir ve quote = o sözler AYNEN (kelimesi kelimesine); who = söyleyen, when. Alıntı uydurma.
- annotate (photo sahnesinin alanı, source archive): "bu adam / bu ayrıntı" anı. annotate {label: kısa etiket (anlatımda geçen), target: İNGİLİZCE işaretlenecek şey}. Konum fotoğraf seçildikten sonra bulunur; bulunamazsa işaret kalkar.

TEMPO: bir sahne = bir düşünce = 5-14 kelime ≈ 3-6 sn. Uzun paragraf YOK; bir cümle iki sahneye bölünebilir. Arka arkaya aynı tip en fazla 2 kez; words bir bölümün yarısını geçmesin.
UZUN FORM: izleyici her 60-90 saniyede yeni bir kanca almalı — bir soru, bir ifşa, bir sayı, bir slam ya da açık bir döngünün hatırlatılması. Bilgiyi sırayla sayma: merak kur, geciktir, sonra ver. Her bölüm bir öncekinden daha büyük bir bedel ya da soru açar.

DUYGU (mood) MÜZİĞİN İŞARETİDİR: müzik bölümleri mood'dan kurulur. Bir duyguyu 5-10 sahne (20-60 sn) KORU, yalnızca bölümün dönüm noktasında (turn) değiştir; bölüm başına en fazla 3-4 değişim. Satır satır duygu farkını v3 etiketiyle ver, mood'u değiştirerek değil.
curious merak · calm sıcak · tension gerilim · dread tehdit · reveal ifşa · sad hüzün · triumph zafer.

SES PERFORMANSI (ElevenLabs v4 — bir ses sanatçısını yönetiyorsun): say satırının başına İngilizce köşeli YÖNLENDİRME koy. Tek etiket ([whispers] [sighs] [exhales] [curious] [excited] [sarcastic]) ya da kısa tarif ("[low, hushed voice]", "[quiet, tense]", "[slowly, with weight]", "[softly, with sorrow]", "[firmly]", "[warm, unhurried]"). Yönlendirme satırın İŞLEVİNİ oynatır: açılış alçak ve sakin; ifşa yavaş ve ağırlıklı; tehdit fısıltıya yakın; vurucu kısa cümle kararlı (asla fısıltı değil); soru merakla; bölüm sonu yumuşak. Her satıra etiket koyma: aynı renk ardışık satırlarda bir kez yeter (ses satırdan satıra taşır); yönlendirmesiz satırı sistem sahnenin duygusuyla tamamlar. Ses efekti etiketi ([gunshot] [explosion] [applause]) ASLA.
"..." gerçek bir duraklamadır: ifşadan önce nefes tut ("And that recipe... one night... [slowly, with weight] was stolen."). Çok nadir, tek kelimeyi BÜYÜK HARFLE vurgula. Etiket dışında köşeli parantez, emoji, madde işareti yok.

GÖRSEL: imagePrompt İNGİLİZCE, somut bir çekim: çekim ölçeği + özne + eylem + ışık. Çekimleri ÇEŞİTLE: extreme close-up (eller, gözler, nesne), detail (belge, para, alet), wide (sokak, bina, kalabalık), silhouette, high angle, over-the-shoulder, empty place (kimsenin olmadığı mekân). Aynı kareyi videoda iki kez isteme.
Karakter görünüyorsa cast'a anahtarını yaz ve istemde "the man"/"the woman" de; GERÇEK İSİM, yazı, tabela, logo, ekran metni isteme (görselde okunur yazı OLMAYACAK). Stil tarifi yazma, sistem ekler.
Şiddeti GÖSTERME, ima et: gölgeler, geride kalan nesneler, polis şeridi, boş oda; kan, yara, ceset yok.
depth:true yalnızca karede tek kişi orta planda net görünüyorsa. Kalabalık, makro, boş mekân → depth yok.
sound: sahnenin mekân sesi (İngilizce, kısa): "busy 1970s street, distant tram bell", "silent kitchen, buzzing bulb, clock ticking". Aynı mekândaki ardışık sahnelerde AYNI sound metni (ortam sesi sahneler boyunca sürer). Sayaç, grafik ve slam'de gerekmez.
silence: müzik tamamen çekilir. Yalnızca SON bölümde, en fazla 1 kez, en ağır duygu anında.`;

/* ============================================================== ortak yardımcılar */

export const stripTags = (t) => String(t || "").replace(/\[[^\]]*\]\s*/g, "").replace(/\s+/g, " ").trim();

/**
 * Motorla ORTAK kelime eşleyici (docu-engine/src/scenes.tsx norm ile aynı olmalı):
 * slam kelimesi ve vurgu kelimesi sese bu anahtarla bağlanır. Doğrulama
 * eskiden alt-dize arıyordu ("ihanet" ⊂ "ihanete"), motor tam kelime istiyordu;
 * doğrulamadan geçen vuruş render'da sabit 1,0 sn'ye düşüyordu.
 */
// Same token rule as docu-engine/src/scenes.tsx norm(): the validator must accept exactly the words the engine will find.
export const norm = (w) => String(w || "").normalize("NFC").toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]/gu, "");
/** Ekrandaki biçimiyle kelimeler (etiketsiz, noktalaması yalnız kelimeden ibaret olanlar hariç). */
const displayTokens = (t) => stripTags(t).split(/\s+/).filter((x) => norm(x));
const tokens = (t) => displayTokens(t).map(norm);
/** Baştaki/sondaki noktalamayı at, iç kesme işaretini koru ("Enron'un"). */
const bare = (tok) => String(tok || "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
export const countWords = (say) => displayTokens(say).length;
const sceneWords = (scenes) => (scenes || []).reduce((n, s) => n + countWords(s.say), 0);

function inOrder(sub, all) {
  let j = 0;
  for (const t of all) if (j < sub.length && t === sub[j]) j++;
  return j === sub.length;
}

/** Bir sahnenin tahmini ekran süresi (sn): motorun max(dur, ses + 0,4) kuralı, ses hızı düşük tahminle. */
export function estSceneSeconds(s, lang = "tr") {
  const w = countWords(s.say);
  const voice = w ? w * (DOCU_SEC_PER_WORD[lang] || DOCU_SEC_PER_WORD.tr) + SCENE_PAD : 0;
  const montage = s.type === "montage" ? (s.imagePrompts?.length || 0) * 0.42 + 1.2 : 0;
  return Math.max(Number(s.dur) || 0, voice, montage);
}

/** Tahmini video süresi (sn): sahneler + motorun eklediği bölüm kartları. */
export function estimateDocuSeconds(docu, lang) {
  const l = lang || (/^en/i.test(docu?.locale || "") ? "en" : "tr");
  const scenes = (docu?.scenes || []).filter((s) => !s.chapterCard);
  let sec = scenes.reduce((a, s) => a + estSceneSeconds(s, l), 0);
  let changes = 0;
  for (let i = 1; i < scenes.length; i++) if ((scenes[i].chapter ?? 0) !== (scenes[i - 1].chapter ?? 0)) changes++;
  sec += changes * CHAPTER_CARD_SEC;
  return sec;
}

/** Senaryonun uzunluk karnesi: ücretli adımdan önce kapı, sonra kalite uyarısı bunu okur. */
export function docuScriptStats(docu, job) {
  const lang = job?.language ? langOf(job) : /^en/i.test(docu?.locale || "") ? "en" : "tr";
  const scenes = (docu?.scenes || []).filter((s) => !s.chapterCard);
  const estSeconds = estimateDocuSeconds(docu, lang);
  return {
    targetMinutes: DURATIONS[job?.durationPreset]?.minutes || 8,
    plannedWords: docu?.stats?.plannedWords ?? docuPlan(job || {}).words,
    actualWords: sceneWords(scenes),
    scenes: scenes.length,
    estSeconds: Math.round(estSeconds),
    estMinutes: Math.round((estSeconds / 60) * 100) / 100,
  };
}

/** Motorun v3'e gönderdiği satırın aynısı (produce.mjs performance): etiketler de kredi harcar. */
function performanceText(s, v3 = true) {
  const say = String(s.say || "");
  if (!v3) return stripTags(say);
  return /^\s*\[/.test(say) ? say : `${MOOD_TAG[s.mood] || ""} ${say}`.trim();
}

/**
 * ElevenLabs kredi ihtiyacı (bir senaryo için). Ses her zaman ElevenLabs'ten;
 * müzik ve efekt/ortam sesi yalnızca ses kütüphanesi yoksa ya da müzik
 * kaynağı "eleven" seçildiyse. Önceden hesaplanmış kısımlar (önbellekteki
 * ses satırları, bestelenmiş müzik) düşülür — yeniden render boşuna durmasın.
 */
export function docuElevenNeed(docu, { musicSource = "library", libraryReady = true, sfxPoolReady = false, voiceCachedFraction = 0, musicCached = false } = {}) {
  const lang = /^en/i.test(docu?.locale || "") ? "en" : "tr";
  const scenes = (docu?.scenes || []).filter((s) => !s.chapterCard);
  const v3 = !docu?.voiceModel || /v[34]/.test(docu.voiceModel);
  const chars = scenes.reduce((n, s) => n + (s.say ? performanceText(s, v3).length : 0), 0);
  const voice = Math.round(chars * Math.max(0, 1 - voiceCachedFraction));
  const sec = estimateDocuSeconds(docu, lang);
  const parts = Math.max(1, Math.ceil(sec / 240));
  const elevenMusic = musicSource === "eleven" || !libraryReady;
  const music = elevenMusic && !musicCached ? Math.round(((sec + 3 + 2 * (parts - 1)) / 60) * ELEVEN_MUSIC_PER_MIN) : 0;
  const ambience = libraryReady ? 0 : Math.round(scenes.filter((s) => s.sound).reduce((a, s) => a + Math.min(22, Math.max(1, estSceneSeconds(s, lang) + 1)) * AMBIENCE_PER_SEC, 0));
  const sfx = libraryReady || sfxPoolReady ? 0 : SFX_POOL_CREDITS;
  return { voice, music, ambience, sfx, total: voice + music + ambience + sfx };
}

/**
 * Senaryo yokken (form, kredi rozeti) dakikadan kaba ElevenLabs ihtiyacı.
 * public/app.js docuElevenEstimate bunun ikizi — biri değişirse öbürü de.
 */
export function docuElevenEstimate(minutes, lang = "tr", { musicSource = "library", libraryReady = true } = {}) {
  const l = lang === "en" ? "en" : "tr";
  const words = minutes * DOCU_WPM[l] * DOCU_HEADROOM;
  const voice = Math.round(words * DOCU_CHARS_PER_WORD[l]);
  const sec = minutes * 60 * 1.1;
  const parts = Math.max(1, Math.ceil(sec / 240));
  const music = musicSource === "eleven" || !libraryReady ? Math.round(((sec + 3 + 2 * (parts - 1)) / 60) * ELEVEN_MUSIC_PER_MIN) : 0;
  // Ölçüldü (plan): ~10,8 dk'da ~110 ortam sesi × ~5,5 sn × 40 kredi.
  const ambience = libraryReady ? 0 : Math.round(((minutes * DOCU_WPM[l]) / 9) * 0.83 * 5.5 * AMBIENCE_PER_SEC);
  const sfx = libraryReady ? 0 : SFX_POOL_CREDITS;
  return { voice, music, ambience, sfx, total: voice + music + ambience + sfx };
}

/**
 * Bölüm kartlarını motor ekler (produce.mjs, her bölüm değişiminde, sese
 * gerek yok). Senaryo dosyasında durmamalılar: hazır bir senaryo (ör. motorun
 * props çıktısından) kartlı gelirse motor ikinci kez ekler.
 */
export function stripChapterCards(docu) {
  if (!docu?.scenes?.some((s) => s?.chapterCard)) return docu;
  return { ...docu, scenes: docu.scenes.filter((s) => !s?.chapterCard) };
}

/** Aynı kişi ≠ aynı yazım: "Gene Kranz", "gene  kranz", "Gêne Kranz" tek kişi. */
const nameKey = (n) => String(n || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();

/**
 * İsim kartı her kişi için bir kez: bölümler ayrı yazıldığı için her bölüm
 * kişiyi yeniden tanıtıyordu ve motor name olan her karede alt yazı basıyor.
 * Arşiv çözümünden SONRA da çağrılır (docu.js): ilk sağ kalan (arşivli) görünüş
 * kartı taşır.
 */
export function dedupeNameCards(scenes) {
  const seen = new Set();
  let removed = 0;
  for (const s of scenes || []) {
    if (!s?.name) continue;
    const k = nameKey(s.name);
    if (!k) { delete s.name; delete s.role; continue; }
    if (seen.has(k)) { delete s.name; delete s.role; removed++; }
    else seen.add(k);
  }
  return removed;
}

/* ============================================================== bölüm düzeltici */

/** Slam kelimesini sesteki kelimeye bağla. false → eşleşme yok (sahne words'e çevrilir). */
function fixSlamWord(s) {
  const disp = displayTokens(s.say);
  const toks = disp.map(norm);
  const wt = tokens(s.word);
  if (!wt.length) return false;
  const seqAt = (want, match) => {
    for (let k = 0; k + want.length <= toks.length; k++) if (want.every((w, j) => match(toks[k + j], w, j))) return k;
    return -1;
  };
  // 1) birebir (tek ya da çok kelime)
  if (seqAt(wt, (a, b) => a === b) >= 0) return true;
  // 2) Türkçe ek: "ihanet" → sesteki "ihanete". Kısa kökler yanlış yakalar (ve → vergi).
  if (wt.length === 1 && wt[0].length >= 4) {
    const k = toks.findIndex((t) => t.startsWith(wt[0]));
    if (k >= 0) { s.word = bare(disp[k]); return true; }
  }
  if (wt.length > 1) {
    const k = seqAt(wt, (a, b, j) => (j === wt.length - 1 ? a.startsWith(b) : a === b));
    if (k >= 0) { s.word = disp.slice(k, k + wt.length).map(bare).join(" "); return true; }
  }
  return false;
}

/** Ekrandaki words cümlesi sesle aynı sırada olmalı; vurgu kelimesi onun içinde. */
function fixWordsSync(s) {
  if (!String(s.text || "").trim() || !inOrder(tokens(s.text), tokens(s.say)) || !tokens(s.text).length) s.text = stripTags(s.say);
  if (s.keyword) {
    const kt = tokens(s.keyword);
    const tt = tokens(s.text);
    if (kt.length !== 1 || !tt.includes(kt[0])) {
      const k = kt.length === 1 && kt[0].length >= 4 ? tt.findIndex((t) => t.startsWith(kt[0])) : -1;
      if (k >= 0) s.keyword = bare(displayTokens(s.text)[k]);
      else delete s.keyword;
    }
  }
}

/** Montaj yazısının her kelimesi seste geçmeli (kelime kelime sese düşer). */
function fixMontageText(s) {
  if (!s.text) return;
  // ı→i on both sides: English words cased under tr rules ("AIRLINE" → "aırlıne") still match.
  const fold = (w) => w.replace(/ı/g, "i");
  const said = new Set(tokens(s.say).map(fold));
  const keep = displayTokens(s.text).filter((t) => said.has(fold(norm(t)))).map(bare).filter(Boolean);
  if (keep.length >= 2) { s.text = keep.slice(0, 4).join(" "); return; }
  // Seste geçen en uzun 3 kelime, konuşma sırasıyla; son sözcük kanca.
  const disp = displayTokens(s.say).map(bare).filter((t) => t.length >= 3);
  if (disp.length < 2) { delete s.text; return; }
  const pick = new Set([...disp.keys()].sort((a, b) => disp[b].length - disp[a].length).slice(0, 2));
  pick.add(disp.length - 1);
  s.text = [...pick].sort((a, b) => a - b).map((k) => disp[k]).join(" ");
}

/**
 * words sahnesinin ekran yazısı olarak satırın ANAHTAR ifadesi: tam cümle her
 * seferinde ekranı doldurur. Sesteki bitişik bir parça (tercihen son yan cümle)
 * seçilir; motor kelimeleri sırayla eşlediği için alt dizi sese bağlı kalır.
 */
function keyPhrase(say) {
  const full = stripTags(say);
  const clauses = full.split(/(?<=[,;:—–…])\s+|(?<=[.!?])\s+/).map((c) => c.trim()).filter((c) => displayTokens(c).length);
  const fit = clauses.filter((c) => { const n = displayTokens(c).length; return n >= 2 && n <= 8; });
  if (fit.length) return fit.at(-1);
  const all = displayTokens(full);
  return all.length <= 12 ? full : all.slice(-6).join(" ");
}

/** Fotoğrafı words'e çevir (anahtar ifade + en uzun kelime vurgulu). */
function toWords(s) {
  s.type = "words";
  s.text = keyPhrase(s.say);
  const toks = displayTokens(s.text).map(bare).filter((t) => t.length >= 4);
  if (toks.length) s.keyword = toks.reduce((a, b) => (b.length >= a.length ? b : a));
  // depth kalır: words derinlikli karede yazıyı kişinin yanına yerleştirir.
  for (const k of ["imagePrompts", "caption", "name", "role"]) delete s[k];
}

/**
 * Tek düze fotoğraf koşusu: arşiv belgeselinde 3 fotoğraf art arda doğal, 6-8
 * fotoğraf (hiç yazı, sayı, vurgu yok) izleyiciyi düşürür. Her 4. ardışık
 * fotoğraf (isim kartı yoksa ve satırı yeterince uzunsa) words olur.
 */
function breakPhotoRuns(scenes) {
  let run = 0;
  for (const s of scenes) {
    if (s?.type !== "photo" || s.outro) { run = 0; continue; }
    run++;
    if (run >= 4 && !s.name && s.imagePrompt && countWords(s.say) >= 4) { toWords(s); run = 0; }
  }
}

/** Tahmini başlangıç saniyesi (bölüm içinde; kapı ve uyarılar için). */
const startOf = (scenes, idx, lang) => scenes.slice(0, idx).reduce((a, s) => a + estSceneSeconds(s, lang), 0);

/**
 * İlk bölümde video başlığı ~20 sn içinde olmalı. Eksikse ya da çok geç geldiyse
 * yeniden yazdırmak yerine (llm.js yeniden denemede önceki yanıtı göstermiyor,
 * yani yepyeni bir bölüm demek) açılışın 2-4. sahnelerinden biri başlık olur.
 */
function placeVideoTitle(scenes, { videoTitle = "", lang = "tr" } = {}) {
  const t = scenes.findIndex((s) => s?.type === "title");
  if (t >= 0 && (t <= 3 || startOf(scenes, t, lang) <= 25)) return;
  const late = t >= 0 ? scenes[t] : null;
  const title = String(late?.title || videoTitle || "").trim();
  if (!title) return;
  const cands = [1, 2, 3].filter((k) => ["photo", "words"].includes(scenes[k]?.type) && scenes[k].imagePrompt && !scenes[k].name);
  const k = cands.find((c) => scenes[c].type === "photo") ?? cands[0];
  if (k === undefined) return;
  const s = scenes[k];
  s.type = "title";
  s.title = title;
  if (late?.kicker) s.kicker = late.kicker;
  for (const x of ["text", "keyword", "word", "sub", "caption", "name", "role", "imagePrompts"]) delete s[x];
  if (late) toPhoto(late);
}

function toPhoto(s) {
  const first = s.imagePrompts?.[0];
  let extra = s.imagePrompts || [];
  if (!s.imagePrompt && first) {
    // Montajın ilk çekimi ana kare olur; kalanlardan biri ek kart.
    s.imagePrompt = typeof first === "string" ? first : first.prompt;
    if (!s.cast?.length && first?.cast?.length) s.cast = first.cast;
    extra = extra.slice(1);
  }
  s.imagePrompts = extra.slice(0, 1);
  s.type = "photo";
  for (const k of ["text", "keyword", "kicker", "title", "word", "sub"]) delete s[k];
}

/**
 * Duygu koşuları: müzik bölümleri mood'dan kuruluyor; her sahnede değişen
 * mood (ölçüldü: 17 sahnede 16 koşu) 240 sn'lik müzikte 50-60 bölüm demekti,
 * API sınırını aşıp tek prompt'a düşüyordu. 20 sn'den kısa koşu komşusuna
 * katılır, bölüm başına en fazla 4 değişim. Açılış sahnesi ve silence sahneleri
 * kilitli (kendi duyguları anlamlı).
 */
export function mergeMoodRuns(scenes, { lang = "tr", minSec = 20, maxChanges = 4, locked = () => false } = {}) {
  for (let guard = 0; guard < scenes.length * 2; guard++) {
    const runs = [];
    scenes.forEach((s, i) => {
      const sec = estSceneSeconds(s, lang);
      const last = runs.at(-1);
      if (last && last.mood === s.mood) { last.to = i; last.sec += sec; last.locked ||= locked(s, i); }
      else runs.push({ mood: s.mood, from: i, to: i, sec, locked: locked(s, i) });
    });
    if (runs.length <= 1) return;
    const tooMany = runs.length - 1 > maxChanges;
    const cands = runs.map((r, k) => ({ r, k })).filter(({ r }) => !r.locked && (r.sec < minSec || tooMany));
    if (!cands.length) return;
    const { r, k } = cands.reduce((a, b) => (b.r.sec < a.r.sec ? b : a));
    const prev = runs[k - 1], next = runs[k + 1];
    const into = !prev ? next : !next ? prev : next.sec > prev.sec ? next : prev;
    for (let i = r.from; i <= r.to; i++) scenes[i].mood = into.mood;
  }
}

/**
 * Bölüm çıktısını yerinde düzelt — yalnızca kodla kesin düzeltilebilenler.
 * Şemaya uygun kalır (bölüm dosyası uzatma adımında modele geri gösteriliyor).
 */
export function normalizeScenes(scenes, { castKeys = [], archive = true, first = false, last = false, genre = "documentary", lang = "tr", videoTitle = "" } = {}) {
  const g = genreOf(genre);
  const remap = { ...(g.write.remap || {}) };
  if (last) for (const m of g.write.lastAllows || []) delete remap[m];
  const known = new Set(castKeys);
  // Montaj yalnızca montajla açılan stillerde ve yalnızca videonun ilk sahnesi:
  // korku/biyografi montajla açılırsa ilk çekimi fotoğraf olur (yeniden yazım yok).
  const montageOpens = first && g.write.openers.includes("montage");
  scenes.forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    if (Array.isArray(s.cast)) s.cast = s.cast.filter((k) => known.has(k));
    for (const p of s.imagePrompts || []) if (p && Array.isArray(p.cast)) p.cast = p.cast.filter((k) => known.has(k));
    if (s.type === "montage" && !(montageOpens && i === 0)) toPhoto(s);
    // Tek video başlığı: ilk bölümün İLK title'ı. Sonrakiler (ve diğer bölümlerdekiler) fotoğrafa.
    if (s.type === "title" && (!first || scenes.slice(0, i).some((x) => x?.type === "title"))) toPhoto(s);
    if (["title", "words", "photo", "slam"].includes(s.type) && !s.imagePrompt && s.imagePrompts?.[0]) {
      const p = s.imagePrompts[0];
      s.imagePrompt = typeof p === "string" ? p : p.prompt;
    }
    if (!archive) { if (s.source === "archive" || s.source === "stock") s.source = "ai"; delete s.search; }
    else {
      if (s.type === "montage" && (s.source === "archive" || s.source === "stock")) s.source = "ai";
      if ((s.source === "archive" || s.source === "stock") && !String(s.search || "").trim()) s.source = "ai";
      if ((s.name || s.role) && s.source !== "archive") { delete s.name; delete s.role; }
    }
    if (remap[s.mood]) s.mood = remap[s.mood];
    if (s.type === "slam" && !fixSlamWord(s)) {
      // Kelime seste yok: vuruş sabit zamana düşerdi. Cümle ekrana gelsin, son kelime vurgulansın.
      s.type = "words";
      s.text = stripTags(s.say);
      s.keyword = bare(displayTokens(s.say).at(-1));
      for (const k of ["word", "sub", "riser"]) delete s[k];
    }
    if (s.type === "words") fixWordsSync(s);
    if (s.type === "montage") fixMontageText(s);
  });
  if (first) placeVideoTitle(scenes, { videoTitle, lang });
  breakPhotoRuns(scenes);
  // Ardışık 3+ words: ortadakiler fotoğrafa (tam cümle ekranda üst üste yorar).
  for (let i = 1; i < scenes.length - 1; i++) {
    if (scenes[i - 1]?.type === "words" && scenes[i]?.type === "words" && scenes[i + 1]?.type === "words") toPhoto(scenes[i]);
  }
  const words = scenes.filter((s) => s?.type === "words");
  for (const s of words.filter((x) => !x.keyword).concat(words.filter((x) => x.keyword))) {
    if (scenes.filter((x) => x?.type === "words").length <= Math.ceil(scenes.length / 2)) break;
    toPhoto(s);
  }
  mergeMoodRuns(scenes, { lang, locked: (s, i) => !!s.silence || (first && i === 0) });
  fillImagePrompts(scenes);
  return scenes;
}

/**
 * A text or title scene the writer left without imagePrompt borrows its nearest neighbour's (its
 * backdrop shows the same subject); with no neighbour, the line itself becomes the prompt. Without
 * this every chapter of a long video paid for a repair round trip (Napoleon: 8 of 8 chapters,
 * "words için imagePrompt gerekli").
 */
export function fillImagePrompts(scenes) {
  const needs = (s) => ["title", "words", "photo", "slam"].includes(s?.type) && !(s.type === "title" && s.chapterCard === true) && !String(s.imagePrompt || "").trim();
  scenes.forEach((s, i) => {
    if (!needs(s)) return;
    for (let d = 1; d < scenes.length; d++) {
      const n = [scenes[i - d], scenes[i + d]].find((x) => x && String(x.imagePrompt || "").trim() && x.type !== "montage");
      if (n) {
        s.imagePrompt = n.imagePrompt;
        return;
      }
    }
    const line = stripTags(s.say || s.text || s.title || "").trim();
    if (line) s.imagePrompt = `${line} — cinematic, era-accurate, no text`;
  });
  return scenes;
}

/** Kodla düzeltilemeyen, motoru bozan hatalar — yalnızca bunlar yeniden yazdırır. */
function hardErrors(scenes, { first = false, genre = "documentary", lang = "tr" } = {}) {
  const errors = [];
  if (!scenes.length) errors.push("sahne yok");
  scenes.forEach((s, i) => {
    const at = `scenes[${i}]`;
    const chapterCard = s?.type === "title" && s.chapterCard === true;
    if (!chapterCard && !stripTags(s?.say)) errors.push(`${at}.say boş`);
    if (["title", "words", "photo", "slam"].includes(s?.type) && !chapterCard && !s.imagePrompt) errors.push(`${at}: ${s.type} için imagePrompt gerekli`);
    if (s?.type === "montage" && (s.imagePrompts?.length || 0) < 4) errors.push(`${at}: montage en az 4 imagePrompts ister`);
    if (s?.type === "counter" && !Number.isFinite(s.to)) errors.push(`${at}: counter için to sayısı gerekli`);
    if (s?.type === "chart" && (!Array.isArray(s.points) || s.points.length < 3)) errors.push(`${at}: chart için en az 3 nokta`);
    if (s?.type === "title" && !String(s.title || "").trim()) errors.push(`${at}: title için title gerekli`);
  });
  if (first && scenes.length) {
    const openers = genreOf(genre).write.openers;
    if (!openers.includes(scenes[0]?.type)) errors.push(`videonun ilk sahnesi ${openers.join(" veya ")} olmalı (soğuk açılış)`);
    const t = scenes.findIndex((s) => s?.type === "title" && !s.chapterCard);
    if (t < 0 || (t > 3 && startOf(scenes, t, lang) > 25)) errors.push("ilk dört sahneden biri title (videonun adı) olmalı");
  }
  return errors;
}

/**
 * Doğrula (önce düzelt). Hazır senaryolardaki bölüm kartları (type title,
 * chapterCard:true) sessiz olabilir; başka hiçbir sahne sessiz olamaz.
 * @returns hata listesi (boş = geçerli); `parsed.scenes` yerinde düzeltilir.
 */
export function validateScenes(parsed, ctx = {}) {
  const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
  normalizeScenes(scenes.filter((s) => !s?.chapterCard), ctx);
  return hardErrors(scenes, ctx);
}

/** Boş alanları at, sayıları sayı yap: motor boş string'i "var" sayar. */
export function cleanScene(s, chapter, { maxDur = 12 } = {}) {
  const out = { chapter };
  for (const [k, v] of Object.entries(s)) {
    if (v === "" || v === null || v === undefined) continue;
    if (Array.isArray(v) && !v.length) continue;
    if (v === false && ["depth", "silence", "riser", "fullBleed", "year"].includes(k)) continue;
    out[k] = v;
  }
  if (out.transition === "") delete out.transition;
  out.dur = Math.max(1.2, Math.min(maxDur, Number(out.dur) || 3));
  if (out.imagePrompts) {
    out.imagePrompts = out.imagePrompts.map((p) => (typeof p === "string" ? p : p.cast?.length ? { prompt: p.prompt, cast: p.cast } : p.prompt));
  }
  return out;
}

/**
 * Yazar cihazların `fromScene` alanını BÖLÜM içindeki sıraya göre yazar (bölümler ayrı
 * yazılıyor); motor ve yönetmen videonun geneline göre okur. Bölüm ofseti eklenir;
 * kendisi ya da sonrası olan referans silinir (docu-edit-director yine doğrular).
 */
export function globalizeRefs(s, offset, local) {
  if (!DEVICE_SCENE_TYPES.includes(s?.type)) return s;
  const fix = (o) => {
    if (!o || !Number.isInteger(o.fromScene)) return o;
    if (o.fromScene < 0 || o.fromScene >= local) { const { fromScene, ...rest } = o; return rest; }
    return { ...o, fromScene: o.fromScene + offset };
  };
  const out = fix(s);
  if (Array.isArray(out.items)) out.items = out.items.map(fix);
  if (out.left) out.left = fix(out.left);
  if (out.right) out.right = fix(out.right);
  return out;
}

/* ============================================================== video geneli son geçiş */

function sceneStarts(scenes, lang) {
  const starts = [];
  let t = 0;
  scenes.forEach((s, i) => {
    if (i > 0 && (s.chapter ?? 0) !== (scenes[i - 1].chapter ?? 0)) t += CHAPTER_CARD_SEC;
    starts.push(t);
    t += estSceneSeconds(s, lang);
  });
  return { starts, total: t };
}

/** Başka bir sahneden görsel ödünç alır (tekrar gibi görünmesin diye farklı çekim ister). */
function borrowPrompt(scenes, i) {
  for (let d = 1; d < scenes.length; d++) {
    for (const j of [i - d, i + d]) {
      const p = scenes[j]?.imagePrompt;
      if (p) return { prompt: `${p}, different angle, extreme close-up detail`, cast: scenes[j].cast };
    }
  }
  return null;
}

/**
 * Video geneli kotalar: bölümler ayrı yazıldığı için her bölüm kendi
 * slam'ini, sessizliğini, isim kartını ve sayacını koyuyordu.
 *   silence: son sahne + ikinci yarıdaki en güçlü (sad/reveal) bir an
 *   slam: en fazla ceil(dk/1.5), aralarında ≥45 sn; fazlası words olur
 *   counter: aynı sayı ikinci kez sayılmaz
 *   isim kartı: kişi başına ilk görünüş
 */
export function enforceGlobalQuotas(scenes, { minutes = 8, lang = "tr", intensity = [] } = {}) {
  const notes = [];
  const { starts, total } = sceneStarts(scenes, lang);
  // SESSİZLİK
  const silent = scenes.map((s, i) => (s.silence ? i : -1)).filter((i) => i >= 0);
  if (silent.length) {
    const keep = new Set();
    const lastIdx = scenes.length - 1;
    if (scenes[lastIdx]?.silence) keep.add(lastIdx);
    const strong = silent
      .filter((i) => i !== lastIdx && starts[i] >= total / 2 && ["sad", "reveal"].includes(scenes[i].mood))
      .sort((a, b) => (intensity[scenes[b].chapter ?? 0] || 0) - (intensity[scenes[a].chapter ?? 0] || 0) || b - a)[0];
    if (strong !== undefined) keep.add(strong);
    for (const i of silent) if (!keep.has(i)) delete scenes[i].silence;
    if (silent.length > keep.size) notes.push(`${silent.length - keep.size} sessizlik kaldırıldı`);
  }
  // SLAM
  const cap = Math.max(1, Math.ceil(minutes / 1.5));
  let kept = 0, lastAt = -Infinity, demoted = 0;
  scenes.forEach((s, i) => {
    if (s.type !== "slam") return;
    if (kept < cap && starts[i] - lastAt >= 45) { kept++; lastAt = starts[i]; return; }
    s.type = "words";
    s.text = stripTags(s.say);
    const k = tokens(s.text).indexOf(norm(s.word));
    s.keyword = bare(displayTokens(s.text)[k >= 0 ? k : displayTokens(s.text).length - 1]);
    for (const x of ["word", "sub", "riser", "at"]) delete s[x];
    demoted++;
  });
  if (demoted) notes.push(`${demoted} slam words'e çevrildi (en fazla ${cap}, aralarında ≥45 sn)`);
  // SAYAÇ tekrarı
  const counted = new Set();
  let dup = 0;
  scenes.forEach((s, i) => {
    if (s.type !== "counter") return;
    const k = `${s.to}|${s.prefix || ""}|${s.suffix || ""}`;
    if (!counted.has(k)) { counted.add(k); return; }
    const b = borrowPrompt(scenes, i);
    s.type = "words";
    s.text = stripTags(s.say);
    if (b) { s.imagePrompt = b.prompt; if (b.cast?.length) s.cast = b.cast; }
    for (const x of ["from", "to", "label", "prefix", "suffix", "decimals", "year"]) delete s[x];
    dup++;
  });
  if (dup) notes.push(`${dup} tekrar eden sayaç words'e çevrildi`);
  const names = dedupeNameCards(scenes);
  if (names) notes.push(`${names} tekrar eden isim kartı kaldırıldı`);
  return notes;
}

const STOP = new Set(["a", "an", "the", "of", "in", "on", "at", "with", "and", "to", "from", "by", "for", "his", "her", "their", "its", "is", "are", "into", "over", "under", "behind", "near", "one", "two", "very", "man", "woman"]);
const VARIATIONS = [
  "different angle: high-angle wide shot",
  "different angle: low-angle close-up, shallow depth of field",
  "seen from behind, over-the-shoulder",
  "extreme close-up detail of hands and objects",
  "wide establishing shot from far away",
  "different time of day: night, practical lights",
];

/**
 * Aynı istem aynı önbellek dosyasına gider (motor istem+karakter+stil
 * özetiyle saklıyor): iki bölümde "empty office at night" aynı kareyi iki kez
 * gösteriyordu. Benzerlik ≥0,6 ise sonrakine farklı bir çekim eklenir.
 */
export function varyDuplicatePrompts(scenes, castKeys = []) {
  const cast = new Set(castKeys);
  const bag = (p) => new Set(String(p || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w) && !cast.has(w)));
  const seen = [];
  let varied = 0;
  scenes.forEach((s, i) => {
    if (!s.imagePrompt) return;
    const b = bag(s.imagePrompt);
    const clash = seen.some((o) => {
      let inter = 0;
      for (const w of b) if (o.has(w)) inter++;
      const union = b.size + o.size - inter;
      return union > 0 && inter / union >= 0.6;
    });
    if (clash) { s.imagePrompt = `${s.imagePrompt}, ${VARIATIONS[i % VARIATIONS.length]}`; varied++; }
    seen.push(bag(s.imagePrompt));
  });
  return varied;
}

/**
 * Aynı arşiv sorgusu her seferinde bir arama + görme seçimi harcıyor ve
 * ikinci, üçüncü seferde daha zayıf aday getiriyordu. İlk ikisi kalır, gerisi AI.
 */
export function collapseArchiveSearches(scenes, keepN = 2) {
  const count = new Map();
  let moved = 0;
  for (const s of scenes) {
    if (s.source !== "archive" || !s.search) continue;
    const k = tokens(s.search).sort().join(" ");
    const n = (count.get(k) || 0) + 1;
    count.set(k, n);
    if (n > keepN) { s.source = "ai"; delete s.search; delete s.name; delete s.role; moved++; }
  }
  return moved;
}

/**
 * Bölümler arası tekrar: iki farklı bölümde geçen 4 kelimelik ortak dizi
 * (aynı olgu, aynı kalıp geçiş cümlesi). Yalnızca uyarı — düzeltmek bir
 * editör çağrısı ister, ama kalite karnesinde görünmeli.
 */
export function crossChapterRepeats(scenes, { minCount = 3 } = {}) {
  const where = new Map();
  for (const s of scenes) {
    const t = tokens(s.say).filter((w) => w.length > 2);
    for (let k = 0; k + 4 <= t.length; k++) {
      const g = t.slice(k, k + 4).join(" ");
      if (!where.has(g)) where.set(g, new Set());
      where.get(g).add(s.chapter ?? 0);
    }
  }
  const repeated = [...where].filter(([, ch]) => ch.size > 1).map(([g]) => g);
  return repeated.length >= minCount ? repeated : [];
}

/** Araştırmada geçen sayılar (biçim toleranslı: 2.224 · 2224 · 13,8 milyar · 4 bin). */
function researchNumbers(research) {
  const out = new Set();
  const MULT = { bin: 1e3, thousand: 1e3, milyon: 1e6, million: 1e6, milyar: 1e9, billion: 1e9, trilyon: 1e12, trillion: 1e12 };
  const re = /(\d[\d.,]*)\s*(bin|thousand|milyon|million|milyar|billion|trilyon|trillion)?/gi;
  for (const m of String(research || "").matchAll(re)) {
    const raw = m[1].replace(/[.,]$/, "");
    const cands = [Number(raw.replace(/[.,]/g, "")), Number(raw.replace(/\./g, "").replace(",", ".")), Number(raw.replace(/,/g, ""))];
    const mult = MULT[(m[2] || "").toLowerCase()] || 1;
    for (const c of cands) if (Number.isFinite(c)) { out.add(c); out.add(Math.round(c * mult)); }
  }
  return out;
}

/**
 * Sayaç ve grafik rakamları araştırmada var mı? Yok diye silinmez (araştırma
 * rakamı yazıyla vermiş olabilir); inceleme karnesine yazılır ki yayından önce
 * kontrol edilsin.
 */
export function unverifiedNumbers(scenes, research) {
  if (!String(research || "").trim()) return [];
  const known = researchNumbers(research);
  const has = (v) => known.has(v) || [...known].some((k) => k && Math.abs(k - v) / Math.abs(k) < 0.005);
  const out = [];
  scenes.forEach((s, i) => {
    if (s.type === "counter" && Number.isFinite(s.to) && s.to >= 10 && !has(s.to)) out.push(`sahne ${i + 1}: sayaç ${s.to}`);
    if (s.type === "chart" && Array.isArray(s.points) && s.points.filter((p) => !has(p)).length > s.points.length / 2) out.push(`sahne ${i + 1}: grafik "${s.title || ""}"`);
  });
  return out;
}

/** Yıl sayacı: "1453" binlik ayırıcıyla "1.453" görünüyordu. */
function markYears(scenes) {
  for (const s of scenes) {
    if (s.type !== "counter" || s.year || s.prefix || s.suffix || s.decimals) continue;
    const to = Number(s.to);
    if (!Number.isInteger(to) || to < 1000 || to > 2100) continue;
    const said = new RegExp(`${to}\\s*('|’)?\\s*(yıl|yılı|yılında|yılının|senesi|de|da|te|ta)\\b|\\bin ${to}\\b`, "i");
    // "Yıl", "Kuruluş yılı" evet; "Yıllık ciro" hayır.
    if (/(^|\s)(y[ıi]l[ıi]?|year|tarih|date)($|\s)/i.test(String(s.label || "").trim()) || said.test(stripTags(s.say))) s.year = true;
  }
}

/**
 * Video geneli son geçiş (düzleştirilmiş sahneler üzerinde).
 * @returns notlar (günlüğe ve senaryo istatistiğine yazılır)
 */
export function finalizeScenes(scenes, { job, plan, castKeys = [], intensity = [] }) {
  const lang = langOf(job);
  const notes = enforceGlobalQuotas(scenes, { minutes: plan.minutes, lang, intensity });
  if ((job.docuSource || "archive") === "archive") {
    const moved = collapseArchiveSearches(scenes);
    if (moved) notes.push(`${moved} tekrar eden arşiv sorgusu AI'a çevrildi`);
  } else {
    // AI modunda yüz çizilmiş: gerçek adın altına bunun bir canlandırma olduğu yazılır.
    const tag = lang === "en" ? "depiction" : "canlandırma";
    for (const s of scenes) if (s.name && !new RegExp(tag, "i").test(s.role || "")) s.role = s.role ? `${s.role} — ${tag}` : tag;
  }
  markYears(scenes);
  // KAPANIŞ: YouTube bitiş ekranı son 5-20 sn'yi kaplar; son cümle onun altında kalmasın.
  const lastS = scenes.at(-1);
  if (lastS && plan.minutes >= 5) {
    const outro = ["photo", "words"].includes(lastS.type) && (Number(lastS.dur) || 0) >= 10;
    if (!outro) {
      const base = [...scenes].reverse().find((s) => s.imagePrompt);
      if (base) {
        scenes.push({
          chapter: lastS.chapter, type: "photo", mood: ["sad", "calm", "triumph"].includes(lastS.mood) ? lastS.mood : "calm",
          dur: 12, imagePrompt: `${base.imagePrompt}, wide and still, the place emptied, quiet closing shot`,
          ...(base.cast?.length ? { cast: base.cast } : {}), ...(lastS.sound ? { sound: lastS.sound } : {}),
          source: "ai", fullBleed: true, outro: true,
        });
        notes.push("sessiz kapanış sahnesi eklendi (bitiş ekranı için)");
      }
    }
  }
  const varied = varyDuplicatePrompts(scenes, castKeys);
  if (varied) notes.push(`${varied} benzer görsel istemi çeşitlendirildi`);
  return notes;
}

/**
 * Yeniden kanca aralıkları: izleyici her 60-90 sn'de yeni bir kancaya çarpmalı
 * (bölüm kartı, slam, sayaç, grafik, başlık, ifşa duygusuna geçiş, sessizlik).
 * Sahne sırası kodla değiştirilemez; uzun boşluklar inceleme karnesine yazılır.
 * @returns [{at, gap}] (sn, tahmini zamanlarla)
 */
export function rehookGaps(scenes, { lang = "tr", maxGap = 100 } = {}) {
  if (!scenes?.length) return [];
  const { starts, total } = sceneStarts(scenes, lang);
  const events = [0];
  scenes.forEach((s, i) => {
    const card = i > 0 && (s.chapter ?? 0) !== (scenes[i - 1].chapter ?? 0);
    const reveal = s.mood === "reveal" && i > 0 && scenes[i - 1].mood !== "reveal";
    if (card) events.push(starts[i] - CHAPTER_CARD_SEC);
    else if (reveal || s.silence || ["slam", "counter", "chart", "title", "montage"].includes(s.type)) events.push(starts[i]);
  });
  // Son kancadan videonun sonuna kadar olan kuyruk da sayılır (kapanış sahnesi dahil).
  events.push(total);
  const out = [];
  for (let k = 1; k < events.length; k++) if (events[k] - events[k - 1] > maxGap) out.push({ at: events[k - 1], gap: events[k] - events[k - 1] });
  return out;
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/**
 * İlk 30 saniye sözleşmesi (tahmini zamanlarla): kanca ~8 sn, başlık ~20 sn,
 * vaat ~30 sn içinde. Sahneler yeniden sıralanamayacağı için yalnızca uyarı.
 */
export function hookWarnings(scenes, bible = {}, lang = "tr") {
  const out = [];
  if (!scenes.length) return out;
  const { starts } = sceneStarts(scenes, lang);
  const first = estSceneSeconds(scenes[0], lang);
  if (first > 10) out.push(`Soğuk açılış uzun: ~${Math.round(first)} sn (kanca ~8 sn içinde düşmeli)`);
  const t = scenes.findIndex((s) => s.type === "title");
  if (t >= 0 && starts[t] > 22) out.push(`Video başlığı geç geliyor: ~${Math.round(starts[t])}. saniye (hedef ≤ 20 sn)`);
  const want = tokens(bible.promise).filter((w) => w.length > 3);
  if (want.length) {
    const early = new Set(scenes.filter((_, i) => starts[i] < 32).flatMap((s) => tokens(s.say)));
    const hit = want.filter((w) => early.has(w) || [...early].some((e) => e.length > 4 && (e.startsWith(w.slice(0, 5)) || w.startsWith(e.slice(0, 5))))).length;
    if (hit / want.length < 0.4) out.push("Vaat ilk 30 saniyede açıkça söylenmiyor");
  }
  return out;
}

/* ============================================================== araştırma ve kalıcılık */

/**
 * Yazarlara araştırmanın TAMAMI gider. Eskiden bölüm yazarı ilk 9.000
 * karakteri görüyordu; ölçülen 12 dk'lık araştırmalarda "Az bilinen detaylar
 * (hook malzemesi)" 9,2-11,8 bin karakterde başlıyordu — vurucu anların
 * malzemesi hiçbir yazara ulaşmıyordu. Yalnızca sondaki makine-okur kaynak
 * JSON'u atılır (başlıkları kalır).
 */
export function researchForWriters(research) {
  const text = String(research || "");
  const k = text.search(/\n#{1,3}\s*Kaynak kayıtları\s*\n/);
  let head = (k < 0 ? text : text.slice(0, k)).trim();
  if (k >= 0) {
    try {
      const list = JSON.parse(text.slice(k).replace(/^\s*#{1,3}\s*Kaynak kayıtları\s*\n/, ""));
      const titles = [...new Set((Array.isArray(list) ? list : []).map((c) => String(c?.title || "").trim()).filter(Boolean))];
      if (titles.length) head += `\n\n## Kaynaklar\n${titles.slice(0, 40).map((t) => `- ${t}`).join("\n")}`;
    } catch { /* bozuk kaynak bloğu: metin yine gider */ }
  }
  // Emniyet tavanı (~25k token); 32k token'lık araştırma bile altında kalır.
  return head.length > 90000 ? head.slice(0, 90000) : head;
}

const sha1 = (v) => crypto.createHash("sha1").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

/**
 * Kutsal kitap ve bölümler iş klasörüne yazılır (docu-bible.json,
 * docu-ch-{i}.json). Anahtar işin senaryoyu belirleyen her alanını taşır:
 * değişen bir iş eski bölümü yeniden kullanmaz.
 */
function scriptStore(dir, key) {
  const file = (name) => (dir ? path.join(dir, name) : null);
  const get = (name, k) => {
    const f = file(name);
    const saved = f ? readJson(f) : null;
    return saved?.key === k ? saved.value : null;
  };
  const put = (name, k, value) => { const f = file(name); if (f) writeJson(f, { key: k, savedAt: new Date().toISOString(), value }); };
  return {
    bible: () => get("docu-bible.json", key),
    putBible: (b) => put("docu-bible.json", key, b),
    chapter: (i, bibleKey) => get(`docu-ch-${i}.json`, sha1([key, bibleKey, i])),
    putChapter: (i, bibleKey, v) => put(`docu-ch-${i}.json`, sha1([key, bibleKey, i]), v),
  };
}

/**
 * Eşzamanlı işçi havuzu. Bir işçi hata verince YENİ iş başlatılmaz; uçuştaki
 * (parası ödenmiş) istekler bitip kaydedilir, sonra ilk gerçek hata fırlatılır.
 * Uçuştaki isteklere "iptal" yayılmıyor: llm.js iptali yanıttan SONRA da
 * kontrol ediyor ve ödenmiş sonucu çöpe atardı.
 */
async function runPool(items, conc, fn, isCancelled) {
  let next = 0;
  let failed = false;
  const errors = [];
  const worker = async () => {
    while (!failed && next < items.length) {
      if (isCancelled()) { failed = true; errors.push(new Error("cancelled")); break; }
      const idx = next++;
      try { await fn(items[idx], idx); } catch (e) { failed = true; errors.push(e); }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.max(1, Math.min(conc, items.length)) }, worker));
  if (errors.length) throw errors.find((e) => e?.message !== "cancelled") || errors[0];
}

/* ============================================================== senaryo yazımı */

/**
 * The countdown's structure, as the top channels of the format cut it: a cold open on a chilling
 * moment that is NOT number one, the criterion in one line, number one promised and withheld;
 * every item a mini-story that opens on its single most arresting fact, says once why it sits
 * where it sits, and hands over to the next with a bigger promise; each item bigger than the last.
 */
export function rankingBibleRules(plan) {
  const N = plan.items;
  return [
    `GERİ SAYIM VİDEOSU: TAM ${N} madde + giriş. Bölüm 1 = GİRİŞ (rank 0). Bölüm 2…${N + 1} = maddeler, sırası ${N}'dan 1'e (rank ${N}, ${N - 1}, … 1). Bölüm 2 = #${N}, son bölüm = #1.`,
    "- criterion: sıralamanın ölçütü, ölçülebilir ve savunulabilir. Sıra bu ölçüte göre; izleyici 'neden bu sırada' diye itiraz edemesin.",
    "- MADDELER: araştırmadaki en şaşırtıcı, doğrulanabilir ve görsel olarak en zengin olaylar. İki madde aynı hikâye olmasın; yer ve dönem çeşitlensin. Her maddenin item (kısa ad), place, year, whyHere alanları dolu.",
    "- TIRMANIŞ: her madde bir öncekinden büyük; intensity sırayla yükselir (giriş 3, #N 2-3, … #1 5). #1 tartışmasız en güçlüsü ve kendi içinde ek bir dönüşü var.",
    `- GİRİŞ (rank 0, ~${plan.chapterWords[0]} kelime, 30-45 sn): listenin ORTASINDAN bir maddenin en ürpertici anıyla soğuk açılış (asla #1 değil), sonra ölçüt tek cümleyle, sonra #1'in vaadi ('ve bir numara... hâlâ'): #1 ASLA açıklanmaz. Kısa ve vurucu.`,
    "- HER MADDE bir mini hikâye: hookIn = maddenin en çarpıcı tek olgusu (ilk cümle); goal = mekân → ne oldu → kimsenin beklemediği ayrıntı → neden bu sırada (whyHere bir kez söylenir); turn = o ayrıntı; cliffhanger = bir sonraki maddeye köprü (daha büyüğünün vaadi). Her 2-3 maddede bir #1'e gönderme ('ama hiçbiri bir numarayla kıyaslanamaz').",
    "- openLoops: giriş #1'in sorusunu kurar (payoffChapter = son bölüm); 1-2 döngü de maddeler arası kurulur.",
    "- visualStyle: maddeler farklı dönemlerden; ortak dil DÖNEMSİZ olsun (ışık, renk derecelendirmesi, lens, doku), belirli bir film stoğu ya da yıl YAZMA. Dönemi her sahnenin kendi imagePrompt'u söyler.",
    "- midpoint: ortadaki bir madde (sıralamanın ortası) beklenmedik bir yön değişikliği getirir.",
    `- title: listenin başlığı, sayı başlıkta ('${N} … That …' / '${N} … ki …'), merak uyandıran. chapters[].title = maddenin adı (YouTube bölüm işareti '#sıra ad' olarak yazılır); giriş için kısa bir başlık.`,
  ];
}

/*
 * NEWS EXPLAINER ("Gündem"): a big, fresh story the world is confused about, explained within days
 * (Oct 2026 — a 16k-subscriber channel's "Nepal Floods 2026 Explained" took 4M views; the Siberian
 * plague-lab death: "Kara Ölüm geri mi döndü?"). The film wins by being the one source that separates
 * what is confirmed from what is claimed — never by being louder than the headlines.
 */
export function newsBibleRules() {
  return [
    "GÜNDEM AÇIKLAYICI (breaking-news explainer): son 1-3 günün büyük ve kafa karıştıran olayı. Video, manşetlerin vermediği NET resmi verir.",
    "- centralQuestion: milyonların kafasındaki tek soru (\"Kara Ölüm geri mi döndü?\" gibi); son bölüm onu dürüstçe cevaplar: ne biliniyor, ne bilinmiyor, ne olursa tehlikeli olur.",
    "- Yapı: 1) soğuk açılış — çelişkiyi tek cümlede ver (iki versiyon, iki iddia: 'Bir tüp kırıldı. Ya da Rusya'ya göre kırılmadı.'); 2) ne oldu, saat saat; 3) iki (ya da daha çok) versiyon, her biri KAYNAĞIYLA; 4) arka plan: bu neden önemli, ne kadar tehlikeli, gerçek bilim/olgu; 5) tarih: neden kimse resmî açıklamaya güvenmiyor (emsaller); 6) dürüst cevap ve sıradaki işaret.",
    "- DOĞRULUK: doğrulanmamış hiçbir şeyi olgu gibi söyleme. Her iddia atfedilir ('yetkililere göre', 'yerel bir site isimsiz kaynaklara dayanarak'). Sayılar araştırmadaki kaynakla birebir. Panik ya da 'salgın başladı' gibi doğrulanmamış hüküm YOK; korkuyu değil bilgiyi büyüt.",
    "- Özel kişiler (kurban, şüpheli) isimle anılmaz; ölüm ve acı saygıyla.",
    "- title: merak boşluklu ve dürüst (\"The Black Death Never Disappeared\", \"What Really Happened at …\"); konu adı + 'explained' tek başına değil.",
    "- GÖRSEL: yayıncı kuruluşların haber görüntüsü ASLA (telif). Gerçek ve serbest kaynaklar önce (resmî kurum fotoğrafları, kamu malı arşiv, Commons, tarihî tablolar), sonra gerçek stok video; AI yalnızca kameranın görmediği an için, gerçek kişinin yüzü asla.",
  ];
}

/** The news explainer's per-chapter rules. */
export function newsChapterRules({ i, n }) {
  if (i === 0) return ["SOĞUK AÇILIŞ (GÜNDEM): ilk cümle çelişkinin kendisi; ilk 8 sn içinde olayın ne olduğu ve neden herkesin konuştuğu belli olsun. Abartma: ilk cümle doğru olmalı."];
  if (i === n - 1) return ["SON BÖLÜM (GÜNDEM): dürüst cevap — kesin olan, belirsiz olan, neyin değişmesi gerektiği (izlenecek işaret). Korkutma da yatıştırma da: kanıt ne diyorsa o."];
  return ["Bu bölümdeki her iddia kaynağıyla; versiyonlar karışmasın. Bir tarih ya da sayı söylendiğinde araştırmadaki değerle birebir."];
}

/** The countdown's per-chapter rules (intro, an item, number one). */
export function rankingChapterRules({ i, n, ch, bible }) {
  const next = bible.chapters[i + 1];
  if (i === 0) {
    return [
      "GİRİŞ (GERİ SAYIM): soğuk açılış listenin ORTASINDAN bir maddenin en ürpertici anıyla (asla #1). Sonra sıralamanın ölçütü tek cümleyle:",
      `  "${bible.criterion}"`,
      "Sonra #1'in vaadi: ne olduğunu ASLA söyleme, yalnızca neden en üstte olduğunu sezdir. Bu bölüm kısa ve vurucu; maddelerin olgularını burada harcama (açılış anı dışında).",
    ];
  }
  const rules = [
    `Neden bu sırada (bölümün son üçte birinde, BİR kez, doğal bir cümleyle): ${ch.whyHere}`,
    "Yalnızca bu maddeyi anlat: başka maddelerin olaylarını anlatma (köprü cümlesi hariç).",
    `Her imagePrompt ve archive search bu maddenin YILINI ve YERİNİ açıkça taşır (${[ch.year ? (ch.year < 0 ? `${-ch.year} BC` : ch.year) : "", ch.place].filter(Boolean).join(", ") || "maddenin dönemi"}): görseller maddeden maddeye dönem değiştirir.`,
  ];
  if (i < n - 1) {
    rules.push(`Son sahne KÖPRÜ: sıradaki madde (#${next?.rank}) bundan da büyük; adını ya da olayını verme, merak bırak.${(n - 1 - i) % 3 === 0 ? " Bu köprüde #1'e de gönderme yap ('ama hiçbiri bir numarayla kıyaslanamaz' gibi, kendi cümlenle)." : ""}`);
  } else {
    rules.push("BİR NUMARA: listenin tartışmasız en güçlü maddesi; kendi içinde ek bir dönüş taşır. Sonunda girişteki açılış anına ve ölçüte dön, listeyi tek cümleyle bağla; son satır kısa ve sakin.");
  }
  return rules;
}

/** Ranks in order: the intro 0, then N..1 — the model's numbering is not trusted. */
export function fixRanking(b, plan) {
  if (!plan?.ranking) return;
  (b.chapters || []).forEach((c, i) => {
    c.rank = i === 0 ? 0 : plan.items - i + 1;
    if (i === 0) c.year = 0;
  });
}

function fixBible(b, n) {
  const seen = new Set();
  b.cast = (b.cast || []).map((c) => ({ ...c, key: String(c.key || "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") }))
    .filter((c) => c.key && !seen.has(c.key) && seen.add(c.key));
  const chapters = b.chapters || [];
  // Açık döngüler: geçersiz numaralı olanlar atılır (kurulmadan cevaplanan soru olmaz).
  b.openLoops = (b.openLoops || []).filter((l) => Number.isInteger(l.setupChapter) && Number.isInteger(l.payoffChapter) && l.setupChapter >= 1 && l.payoffChapter <= n && l.setupChapter < l.payoffChapter);
  if (n < 3) { for (const c of chapters) c.midpoint = false; return; }
  // Orta nokta: tek bir bölüm, %45-60 civarı.
  const frac = (i) => (i + 0.5) / n;
  const marked = chapters.map((c, i) => (c.midpoint ? i : -1)).filter((i) => i >= 0);
  const ok = marked.filter((i) => frac(i) >= 0.35 && frac(i) <= 0.7).sort((a, b) => Math.abs(frac(a) - 0.52) - Math.abs(frac(b) - 0.52));
  const mid = ok[0] ?? chapters.map((_, i) => i).sort((a, b) => Math.abs(frac(a) - 0.52) - Math.abs(frac(b) - 0.52))[0];
  chapters.forEach((c, i) => { c.midpoint = i === mid; });
  // Gerilim zirvesi son üçte birde olmalı: müzik ve anlatım tırmanışı buna göre kurulur.
  const tail = Math.floor((n * 2) / 3);
  const max = Math.max(...chapters.map((c) => c.intensity || 1));
  const tailMax = Math.max(...chapters.slice(tail).map((c) => c.intensity || 1));
  if (tailMax < max) chapters[Math.max(tail, n - 2)].intensity = max;
}

function storyBlock({ job, bible, research }) {
  const loops = (bible.openLoops || []).map((l) => `- "${l.text}" (kur: bölüm ${l.setupChapter}, cevapla: bölüm ${l.payoffChapter})`).join("\n");
  const outline = bible.chapters.map((c, i) => [
    `${i + 1}. ${Number.isInteger(c.rank) ? (c.rank ? `#${c.rank} ${c.item} (${[c.place, c.year || ""].filter(Boolean).join(", ")}) · ` : "GİRİŞ · ") : ""}${c.title}${c.midpoint ? " [ORTA NOKTA]" : ""} — yoğunluk ${c.intensity}/5${c.whyHere ? ` · neden bu sırada: ${c.whyHere}` : ""}`,
    `   hedef: ${c.goal}`,
    `   olgular: ${c.covers.join("; ")}`,
    `   giriş kancası: ${c.hookIn} · dönüm: ${c.turn} · bölüm sonu: ${c.cliffhanger}`,
  ].join("\n")).join("\n");
  const cast = bible.cast.length ? bible.cast.map((c) => `- ${c.key}: ${c.description}`).join("\n") : "(tekrar eden karakter yok)";
  return [
    `KONU: "${job.topic}"`,
    "",
    `ARAŞTIRMA DOSYASI (olgular, tarihler ve sayılar YALNIZCA buradan):\n${research}`,
    "",
    `BAŞLIK: "${bible.title}" · TÜR: ${bible.genre}`,
    `GÖRSEL DİL: ${bible.visualStyle}`,
    bible.criterion ? `GERİ SAYIM — SIRALAMA ÖLÇÜTÜ: ${bible.criterion}` : "",
    `MERKEZ SORU: ${bible.centralQuestion}`,
    `RİSK: ${bible.stakes}`,
    `VAAT (ilk 30 sn): ${bible.promise}`,
    `KANCA: ${bible.hookWord}`,
    loops ? `AÇIK DÖNGÜLER:\n${loops}` : "",
    "",
    `BÖLÜM PLANI:\n${outline}`,
    "",
    `KARAKTERLER:\n${cast}`,
  ].filter((x) => x !== "").join("\n");
}

function chapterPrompt({ i, bible, plan, written, lang }) {
  const n = bible.chapters.length;
  const ch = bible.chapters[i];
  const first = i === 0, last = i === n - 1;
  const g = genreOf(bible.genre);
  const [lo, hi] = plan.chapterScenes?.[i] ?? plan.scenesRange;
  const target = plan.chapterWords?.[i] ?? plan.wordsPerChapter;
  const min = Math.round(target * MIN_CHAPTER_RATIO);
  const loops = bible.openLoops || [];
  const setup = loops.filter((l) => l.setupChapter === i + 1).map((l) => l.text);
  const payoff = loops.filter((l) => l.payoffChapter === i + 1).map((l) => l.text);
  const open = loops.filter((l) => l.setupChapter < i + 1 && l.payoffChapter > i + 1).map((l) => l.text);
  const before = bible.chapters.slice(0, i).flatMap((c) => c.covers);
  const after = bible.chapters.slice(i + 1).flatMap((c) => c.covers);
  const prev = written[i - 1];
  // Uzatmada bölümün kendi vuruşları "kullanılmış" sayılmaz.
  const used = written.filter((_, k) => k !== i).flat().flatMap((s) => [
    s.type === "counter" ? `sayaç ${s.prefix || ""}${s.to}${s.suffix || ""}${s.label ? ` (${s.label})` : ""}` : null,
    s.type === "slam" ? `slam "${s.word}"` : null,
    s.type === "chart" ? `grafik "${s.title || ""}"` : null,
  ]).filter(Boolean);
  const opener = written[0]?.[0];
  return [
    `ŞİMDİ SADECE BÖLÜM ${i + 1}/${n}: "${ch.title}"`,
    `Hedef: ${ch.goal}`,
    `İşlenecek olgular: ${ch.covers.join("; ")}`,
    `Giriş kancası (bölümün ilk satırı bunu yapar): ${ch.hookIn}`,
    `Dönüm noktası (mood yalnızca burada değişir): ${ch.turn}`,
    last ? `Kapanış fikri: ${ch.cliffhanger}` : `Bölüm sonu (son sahne bunu bırakır, bir sonraki bölüme merak): ${ch.cliffhanger}`,
    `Yoğunluk: ${ch.intensity}/5${ch.midpoint ? " — ORTA NOKTA: hikâyenin yönünü değiştiren büyük ifşa bu bölümde" : ""}.`,
    setup.length ? `Bu bölümde KUR (cevaplama): ${setup.join(" · ")}` : "",
    payoff.length ? `Bu bölümde CEVAPLA: ${payoff.join(" · ")}` : "",
    open.length ? `Açık kalan sorular (hatırlat, cevaplama — yeniden kanca): ${open.join(" · ")}` : "",
    "",
    `UZUNLUK (ZORUNLU): toplam ${target} kelime anlatım (etiketler hariç, en az ${min}); ${lo}-${hi} sahne. Kelime hedefi sahne sayısından önemlidir: sahneler az kalırsa satırları uzat.`,
    first
      ? `AÇILIŞ (ilk 30 sn): ilk sahne ${g.write.openers.join(" veya ")} — ${g.write.coldOpen} Kanca ("${bible.hookWord}") ilk ~8 sn içinde düşsün. İlk 4 sahneden biri title: videonun adı "${bible.title}" (~20 sn içinde). Vaadi ("${bible.promise}") ilk ~30 sn içinde, yani anlatımın ilk ~55 kelimesinde söyle; merkez soruyu sezdir: "${bible.centralQuestion}".`
      : plan.ranking
        ? `MADDE #${ch.rank}: ${ch.item}${ch.place ? ` — ${ch.place}` : ""}${ch.year ? `, ${ch.year < 0 ? `MÖ ${-ch.year}` : ch.year}` : ""}. Sıra kartını (dev #${ch.rank}, maddenin adı, yer ve yıl) motor koyar: anlatıcı sıra numarasını ve maddenin başlığını SÖYLEMEZ, title sahnesi yazma. İlk satır doğrudan maddenin en çarpıcı olgusu.`
        : `Bölüm kartını ("BÖLÜM ${i + 1} — ${ch.title}") motor koyar: anlatıcı bölüm başlığını söylemez, title sahnesi yazma. İlk satır giriş kancasını yapar.`,
    ...(plan.ranking ? rankingChapterRules({ i, n, ch, bible }) : []),
    ...(plan.news ? newsChapterRules({ i, n }) : []),
    last
      ? `SON BÖLÜM: merkez soruyu ("${bible.centralQuestion}") açıkça cevapla, açık döngüleri kapat ve soğuk açılışa geri dön (kanca: "${bible.hookWord}"${opener ? `; açılış satırı: "${stripTags(opener.say)}"` : ""}). Son sahne sakin bir kapanış: photo veya words, dur 12-15, 3-8 kelimelik kısa bir satır; müzik onun altında çözülür. silence en fazla 1 kez, en ağır duygu anında.`
      : "Bu bölümde silence YOK; slam en fazla 1.",
    before.length ? `ÖNCEKİ BÖLÜMLERDE ANLATILDI (tekrar etme, gerekirse tek kelimeyle an): ${before.join("; ")}` : "",
    used.length ? `Kullanılmış vuruşlar (tekrarlama): ${used.join("; ")}` : "",
    after.length ? `SONRAKİ BÖLÜMLERİN OLGULARI (şimdiden verme): ${after.join("; ")}` : "",
    prev?.length ? `ÖNCEKİ BÖLÜMÜN SON SATIRLARI (kaldığı yerden, aynı cümleyi tekrarlamadan devam et):\n${prev.slice(-3).map((s) => `- ${stripTags(s.say)}`).join("\n")}` : "",
    !first && opener ? `Soğuk açılış (bölüm 1) böyleydi: "${stripTags(opener.say)}"${opener.text ? ` · ekrandaki kanca: "${opener.text}"` : ""}` : "",
    lang === "en" ? "Write every on-screen text and narration in English." : "",
  ].filter(Boolean).join("\n");
}

/**
 * @param opts.dir          iş klasörü — kutsal kitap ve bölümler buraya yazılır (devam için)
 * @param opts.isCancelled  kullanıcının iptali; bölümler arasında ve isteklerde denetlenir
 * @param opts.llm          test için callJSON yerine geçer
 * @param opts.eleven       {musicSource, libraryReady} — kredi tahmini için
 * @returns docu-engine Script (id = job.id). `stats` uzunluk karnesini taşır.
 */
export async function runDocuScript(job, research, usage, logFn, opts = {}) {
  // chapterModel: bölümleri yazan model (Sonnet 5.5). Hikâye planı (bible) ayarlardaki modelle (Opus 5.5) — ruh planda.
  // bibleModel: hikâye planını yazan model (Senarist ayarı; boşsa ayarlardaki ana model).
  const { dir = null, isCancelled = () => false, llm = callJSON, eleven = {}, chapterModel = null, bibleModel = null } = opts;
  const plan = docuPlan(job);
  /** This chapter's word target (the ranking's intro is short and its number one long). */
  const cw = (i) => plan.chapterWords?.[i] ?? plan.wordsPerChapter;
  const lang = langOf(job);
  const archive = (job.docuSource || "archive") === "archive";
  const fullResearch = researchForWriters(research);
  const guard = () => { if (isCancelled()) throw new Error("cancelled"); };
  const warnings = [];
  logFn(`Sinematik senaryo planı: ${plan.chapters} bölüm, ${plan.scenesRange[0] * plan.chapters}-${plan.scenesRange[1] * plan.chapters} sahne, ${plan.words} kelime (hedef ${plan.minutes} dk + %${Math.round((DOCU_HEADROOM - 1) * 100)} pay)`);

  const key = sha1([DOCU_PROMPT_VERSION, job.topic, job.guidance || "", job.durationPreset, job.docuGenre || "", job.docuSource || "archive", job.docuFormat || "", lang, job.tone || "", sha1(fullResearch)]);
  const store = scriptStore(dir, key);

  // 1) KUTSAL KİTAP
  let bible = store.bible();
  if (bible) logFn("Senaryo planı (kutsal kitap) kayıttan alındı");
  else {
    guard();
    const n = plan.chapters;
    bible = await llm({
      ...(bibleModel ? { model: bibleModel } : {}),
      system: [editorBrief(job), job.docuGenre ? genreBrief(job.docuGenre) : ""].filter(Boolean).join("\n\n"),
      user: [
        `Konu: "${job.topic}"`,
        "",
        `ARAŞTIRMA DOSYASI:\n${fullResearch}`,
        "",
        `Bu belgeselin "kutsal kitabını" çıkar: başlık, tür (genre), görsel dil (visualStyle), tekrar görünen karakterler (cast) ve TAM ${n} bölüm.`,
        `SÜRE: ${plan.minutes} dk; bölüm başı ~${plan.secondsPerChapter} sn (~${plan.wordsPerChapter} kelime anlatım).`,
        ...(plan.ranking ? rankingBibleRules(plan) : []),
        ...(plan.news ? newsBibleRules() : []),
        plan.ranking ? "Aşağıdaki uzun form kuralları her MADDENİN içinde de geçerli:" : "",
        "UZUN FORM YAPISI (MagnatesMedia / Netflix belgesel kurgusu):",
        "- centralQuestion: videonun taşıdığı tek büyük soru; izleyici cevabı için sonuna kadar kalır, SON bölüm cevaplar.",
        "- stakes: ne kaybedilebilirdi, neden önemli. promise: ilk 30 sn içinde söylenecek vaat. hookWord: soğuk açılışın kancası; son bölüm ona geri döner.",
        `- openLoops: ${n >= 3 ? "3-5" : "0-2"} açık döngü — erken bir bölümde kurulan, SONRAKİ bir bölümde cevaplanan merak soruları (bölüm numaraları 1'den başlar). Videonun "yeniden kanca" omurgası bunlar: izleyici her 60-90 sn'de bir soruya ya da cevaba çarpmalı.`,
        "- Her bölüm: hookIn (ilk cümlenin kancası), turn (bölüm içindeki dönüm; müzik/duygu yalnızca burada değişir), cliffhanger (bölüm sonunda bırakılan merak; son bölümde akılda kalan kapanış fikri), intensity 1-5 (gerilim eğrisi yükselir, zirve son üçte birde), midpoint (yalnızca ortadaki BİR bölüm true: %45-60 civarında hikâyenin yönünü değiştiren büyük ifşa).",
        "- Tırmanış: her bölüm bir öncekinden daha büyük bir bedel ya da soru açar; son bölüm hepsini öder ve açılışa geri döner.",
        "- covers çakışmasın: her somut olgu tek bir bölüme ait.",
        job.docuGenre ? `genre MUTLAKA "${job.docuGenre}" olacak (kanal sahibi seçti); görsel dili de bu stile göre kur.` : "Önce hikâyenin ruhuna göre genre seç (yalnızca konu türüne göre değil: bir tarih hikâyesi aslında bir suç dosyası ya da bir insanın yükselişi olabilir).",
        "Görsel dil hem döneme hem stile uysun: 1600ler için yağlı boya tablo, 1970ler için grenli film fotoğrafı, suç için soğuk flaşlı delil fotoğrafı, uzay için NASA arşivi ve teleskop görüntüsü, biyografi için sıcak aile fotoğrafı.",
      ].join("\n"),
      schema: bibleSchema(plan),
      maxTokens: 16000,
      // Yapı planı en önemli karar: yüksek efor. llm.js bunu output_config.effort'a
      // taşıdığında etkin; taşımadığı sürece yok sayılır (zararsız).
      effort: "high",
      usage,
      logFn,
      isCancelled,
      validate: (b) => {
        const errors = [];
        if (b.chapters?.length !== n) errors.push(`tam ${n} bölüm gerekli, ${b.chapters?.length} geldi`);
        if (job.docuGenre && b.genre !== job.docuGenre) errors.push(`genre "${job.docuGenre}" olmalı`);
        if (!errors.length) {
          fixRanking(b, plan);
          fixBible(b, n);
          if (n >= 3 && b.openLoops.length < 2) errors.push("openLoops: en az 2 geçerli açık döngü gerekli (1 ≤ setupChapter < payoffChapter ≤ bölüm sayısı)");
        }
        return errors;
      },
    });
    store.putBible(bible);
  }
  const bibleKey = sha1(bible);
  const castKeys = bible.cast.map((c) => c.key);
  const genre = bible.genre;
  const n = bible.chapters.length;
  // Sistem = sabit talimatlar + araştırma/plan (önbellek işaretli): her bölüm ve
  // her uzatma aynı önekle başlar, yalnızca bölüme özel satırlar değişir.
  const system = [
    { type: "text", text: [editorBrief(job), SCENE_GRAMMAR, genreBrief(genre), sourceRule(job)].join("\n\n") },
    { type: "text", text: storyBlock({ job, bible, research: fullResearch }), cache_control: { type: "ephemeral" } },
  ];
  const ctxOf = (i) => ({ castKeys, archive, first: i === 0, last: i === n - 1, genre, lang, index: i, videoTitle: bible.title });

  /** Bölüm çağrısı: düzeltip doğrular; yalnızca kelime eksiği kalırsa en iyi deneme kabul edilir, uzatma adımı tamamlar. */
  const callChapter = async ({ i, user, target, min, label }) => {
    let best = null;
    const validate = (p) => {
      const scenes = Array.isArray(p?.scenes) ? p.scenes : [];
      const errors = validateScenes({ scenes }, ctxOf(i));
      if (errors.length) return errors;
      const words = sceneWords(scenes);
      if (!best || words > best.words) best = { scenes: structuredClone(scenes), words };
      return words < min ? [`bölüm ${i + 1}: ${words}/${target} kelime — ${target - words} kelime daha ekle`] : [];
    };
    try {
      const res = await llm({ system, user, schema: SCENES_SCHEMA, maxTokens: 24000, effort: "high", usage, logFn, isCancelled, validate, ...(chapterModel ? { model: chapterModel } : {}) });
      return { scenes: res.scenes, words: sceneWords(res.scenes) };
    } catch (e) {
      if (e?.message === "cancelled" || isCancelled() || !best) throw e;
      logFn(`${label}: kelime hedefi tutmadı (${best.words}/${target}); uzatma adımına bırakıldı`);
      return best;
    }
  };

  // 2) BÖLÜMLER — sırayla: her yazar öncekinin gerçek son satırlarını görür.
  const written = [];
  for (let i = 0; i < n; i++) {
    guard();
    let ch = store.chapter(i, bibleKey);
    if (ch) logFn(`Bölüm ${i + 1}/${n} kayıttan alındı (${ch.words} kelime)`);
    else {
      logFn(`Bölüm ${i + 1}/${n} kurgulanıyor: ${bible.chapters[i].title}`);
      ch = await callChapter({
        i, user: chapterPrompt({ i, bible, plan, written, lang }),
        target: cw(i), min: Math.round(cw(i) * MIN_CHAPTER_RATIO), label: `Bölüm ${i + 1}`,
      });
      store.putChapter(i, bibleKey, ch);
    }
    written.push(ch.scenes);
  }

  // 3) UZATMA — toplam hedefin altındaysa en kısa bölümler mevcut JSON'larıyla uzatılır.
  for (let round = 1; round <= 2; round++) {
    const words = written.map(sceneWords);
    const total = words.reduce((a, b) => a + b, 0);
    if (total >= plan.words * EXTEND_BELOW) break;
    let deficit = plan.words - total;
    const order = words.map((w, i) => i).sort((a, b) => words[a] - words[b]);
    const jobs = [];
    for (const i of order) {
      if (deficit <= 0) break;
      // En kısa bölüm önce; bir bölüme en fazla yarım bölüm eklenir (şişirme değil, tamamlama).
      const want = Math.max(cw(i) - words[i], Math.ceil(cw(i) * 0.12), Math.ceil(deficit / Math.max(1, order.length - jobs.length)));
      const add = Math.min(want, Math.ceil(cw(i) * 0.6));
      jobs.push({ i, add });
      deficit -= add;
    }
    logFn(`Senaryo kısa: ${total}/${plan.words} kelime — ${jobs.length} bölüm uzatılıyor (tur ${round})`);
    await runPool(jobs, 3, async ({ i, add }) => {
      const target = words[i] + add;
      const res = await callChapter({
        i,
        target,
        min: Math.round(words[i] + add * 0.85),
        label: `Bölüm ${i + 1} uzatma`,
        user: [
          chapterPrompt({ i, bible, plan, written, lang }),
          "",
          `BU BÖLÜM YAZILDI AMA KISA: ${words[i]} kelime. UZAT: en az ${add} kelime daha ekle (toplam ~${target} kelime).`,
          "Var olan sahneleri ve sırasını koru; araştırmadaki bu bölüme ait somut ayrıntılarla yeni sahneler ekle ya da satırları genişlet. Aynı kurallar geçerli. Tüm bölümü (bütün sahneleriyle) döndür.",
          `MEVCUT BÖLÜM JSON:\n${JSON.stringify({ scenes: written[i] })}`,
        ].join("\n"),
      });
      if (res.words > words[i]) {
        written[i] = res.scenes;
        store.putChapter(i, bibleKey, res);
      }
    }, isCancelled);
  }
  guard();

  // 4) VİDEO GENELİ SON GEÇİŞ
  // Cihazların fromScene'i bölüm içi sıradır (bölümler ayrı yazılır): videonun geneline çevrilir.
  const offsets = written.map((_, c) => written.slice(0, c).reduce((a, sc) => a + sc.length, 0));
  const scenes = written.flatMap((sc, c) => sc.map((s, k) => globalizeRefs(cleanScene(s, c, { maxDur: c === n - 1 && k === sc.length - 1 ? 20 : 12 }), offsets[c], k)));
  const notes = finalizeScenes(scenes, { job, plan, castKeys, intensity: bible.chapters.map((c) => c.intensity) });
  if (notes.length) logFn(`Son düzenleme: ${notes.join("; ")}`);
  const short = written.map((sc, i) => [i, sceneWords(sc)]).filter(([i, w]) => w < cw(i) * 0.75);
  for (const [i, w] of short) warnings.push(`Bölüm ${i + 1} kısa kaldı (${w}/${cw(i)} kelime)`);
  const repeats = crossChapterRepeats(scenes);
  if (repeats.length) warnings.push(`Bölümler arası tekrar eden ifadeler: ${repeats.slice(0, 4).map((g) => `"${g}"`).join(", ")}`);
  const unverified = unverifiedNumbers(scenes, fullResearch);
  if (unverified.length) warnings.push(`Araştırmada bulunamayan rakamlar (yayından önce doğrula): ${unverified.slice(0, 6).join("; ")}`);
  warnings.push(...hookWarnings(scenes, bible, lang));
  const gaps = rehookGaps(scenes, { lang });
  if (gaps.length) warnings.push(`Uzun kancasız aralık (yeni kanca her 60-90 sn): ${gaps.slice(0, 3).map((g) => `~${Math.round(g.gap)} sn, ${clock(g.at)} sonrası`).join("; ")}`);

  const script = {
    id: job.id,
    title: bible.title,
    genre,
    locale: lang === "en" ? "en-US" : "tr-TR",
    visualStyle: bible.visualStyle,
    cast: Object.fromEntries(bible.cast.map((c) => [c.key, c.description])),
    // A countdown's chapters read "#7 The Dyatlov Pass" in YouTube's chapter list; the rank card draws them from `ranking`.
    chapters: bible.chapters.map((c) => (plan.ranking && c.rank ? `#${c.rank} ${c.item || c.title}` : c.title)),
    story: { centralQuestion: bible.centralQuestion, stakes: bible.stakes, promise: bible.promise, hookWord: bible.hookWord, openLoops: bible.openLoops },
    ...(plan.ranking
      ? {
          format: "ranking",
          ranking: {
            criterion: bible.criterion,
            total: plan.items,
            items: bible.chapters.map((c, i) => ({ chapter: i, rank: c.rank, item: c.item || c.title, place: c.place || "", year: c.year || null })).filter((x) => x.rank > 0),
          },
        }
      : {}),
    scenes,
  };
  const st = docuScriptStats(script, job);
  const need = docuElevenNeed(script, eleven);
  script.stats = {
    promptVersion: DOCU_PROMPT_VERSION,
    targetMinutes: plan.minutes,
    plannedWords: plan.words,
    actualWords: st.actualWords,
    estMinutes: st.estMinutes,
    estElevenCredits: need.total,
    ...(warnings.length ? { warnings } : {}),
  };
  logFn(`Senaryo hazır: ${scenes.length} sahne, ${st.actualWords}/${plan.words} kelime (~${st.estMinutes.toFixed(1)} dk, bölüm kartları dahil) · ElevenLabs ~${need.total.toLocaleString("tr-TR")} kredi`);
  return script;
}

/** Nova'nın ortak adımlarının (devam, SEO, editör) okuduğu biçim. */
export function novaView(docu) {
  const titles = docu.chapters?.length ? docu.chapters : [docu.title || ""];
  return {
    title: docu.title,
    mode: "docu",
    sections: titles.map((title, c) => ({
      title,
      segments: docu.scenes.filter((s) => !s.chapterCard && (s.chapter ?? 0) === c && stripTags(s.say)).map((s) => ({ text: stripTags(s.say) })),
    })).filter((s) => s.segments.length),
  };
}

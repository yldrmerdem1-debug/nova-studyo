import { engagementInstructions } from "./engagement.js";
import { plannedAiAllowance } from '../../public/production-modes.js';
import { directorPrompt } from './director-policy.js';
import { callJSON, callText } from "../llm.js";
import { THEMES, TONES, DURATIONS, VISUAL_STYLES, TONE_ETIKET, etiketleriAyikla } from "../config.js";
import { tahminWpm } from "./tempo.js";
import { demoResearch, demoScript } from "../demo.js";
import { mapLimit } from "../util.js";
import { somutCapaVar, cumleleriBol } from "./cumlehizasi.js";
import { docuPlan } from "./docu-script.js";

const OUTLINE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Videonun çalışma başlığı" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Bölüm başlığı (YouTube chapter olarak da kullanılacak, kısa)" },
          goal: { type: "string", description: "Bu bölümün anlatı hedefi, 1-2 cümle" },
          // TEKRAR ÖNLEME. Bölümler ayrı ayrı yazıldığı için aynı olgu birden çok
          // bölümde anlatılıyordu (canlı testte 4 olgu tekrarlandı). Her bölüm
          // NEYİ kapsadığını ve NEYİ başka bölüme bıraktığını yazınca, bölüm
          // yazarken bu bilgi bağlama giriyor ve tekrar kalkıyor.
          covers: {
            type: "array",
            items: { type: "string" },
            description: "Bu bölümün İŞLEYECEĞİ somut olgular/olaylar (2-5 madde, kısa)",
          },
          devredilen: {
            type: "array",
            items: { type: "string" },
            description: "Bu bölümde DEĞİNİLMEYECEK, başka bölüme bırakılan konular (0-3 madde)",
          },
          rol: {
            type: "string",
            enum: ["kanca", "kurulum", "gelisme", "doruk", "kapanis"],
            description: "Bölümün anlatıdaki rolü",
          },
        },
        required: ["title", "goal", "covers", "devredilen", "rol"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "sections"],
  additionalProperties: false,
};

/**
 * Bölüm bu oranın altında kalırsa bir kez daha istenir.
 *
 * Ölçüldü: aynı 10 dakikalık istekte bir iş bölüm başına 4 segment / 100 kelime,
 * başkası 12 segment / 300 kelime üretti. Segment başına kelime ikisinde de ~25
 * olduğu için süreyi doğrudan segment SAYISI belirliyor ve model onu tutmuyor.
 * Sonuç: 10 dk hedefli iki videodan biri 3 dk 23 sn, diğeri 10 dk 3 sn.
 *
 * Eşik 0,70: normal sapmayı (%85-100) tetiklemeyecek kadar gevşek, gerçek
 * başarısızlığı (%28) kesin yakalayacak kadar sıkı.
 */
const BOLUM_ALT_SINIR = 0.70;

/**
 * Bir bölümün cümlelerinin en az bu kadarında gösterilebilir somut bir şey
 * olmalı; altında kalırsa bölüm somutlaştırılmak üzere yeniden yazdırılır.
 *
 * 0,55'TEN 0,30'A İNDİRİLDİ — ÖLÇÜMLE.
 *
 * Eski gerekçe iki videoluk bir karşılaştırmaydı: "çapa %58 → isabet %62,
 * çapa %32 → isabet %54, ikisi birlikte hareket ediyor". İki nokta ilişki
 * kanıtlamaz. Üç bitmiş işte SEGMENT düzeyinde ölçüldüğünde ilişki çıkmadı —
 * görsel zaten segment başına aranıyor, cümle başına değil:
 *
 *   iş           çapasız segment    çapasız seg. isabeti   çapalı seg. isabeti
 *   07e514            %14              %100 / tam %40         %79 / tam %42
 *   a46ab2            %17               %83 / tam %67         %88 / tam %54
 *   af4f58            %17               %83 / tam %50         %76 / tam %54
 *
 * Yani hiç çapası olmayan segmentler, çapalı olanlar kadar (kimi işte daha da)
 * isabetli görsel alıyor. Arama + yeni açı + AI zinciri farkı kapatıyor.
 *
 * Buna karşılık maliyet gerçekti: gerçek işlerin bölüm oranları %19-58
 * aralığında, yani 0,55 eşiği HER İŞTE bölümlerin 4-5'ini yeniden yazdırıyordu.
 * Her tetiklenme 32.000 tavanlı bir model çağrısı. Ölçülebilir bir karşılığı
 * olmayan bu vergi kaldırıldı.
 *
 * 0,30 yalnızca gerçekten kırık bölümü yakalar (ölçülen en düşük: %19).
 * YÜKSELTMEDEN ÖNCE ÖLÇ: yukarıdaki tablo tahminle değiştirilirse kullanıcı
 * karşılığı olmayan bir bedel öder.
 */
const CAPA_ALT_SINIR = 0.30;

const VISUAL_PROPS = {
  query: { type: "string", description: "Görsel arama sorgusu — HER ZAMAN İngilizce, 2-5 kelime, spesifik" },
  type: {
    type: "string",
    enum: ["image", "video", "ai"],
    description: "image: arşiv fotoğrafı | video: stok b-roll | ai: yapay zekâyla üretilecek sahne",
  },
  kind: { type: "string", enum: ["person", "place", "event", "object", "generic"], description: "Sorgunun türü" },
  // VEKİL SORGULAR — konunun kendisi arşivde yoksa.
  //
  // Gerçek vaka: Baba Vanga. Yüzünün serbest lisanslı fotoğrafı YOK (1996'da
  // öldü, fotoğrafları hâlâ telifli). "Bulgarian mystic blind woman 1970s"
  // sorgusu 25 aday getirdi ve HEPSİ alakasız stok çıktı (gözü bağlı modeller,
  // sisli kadın fotoğrafları). O sahneler düz renk zemine düşüyordu.
  //
  // Oysa çevresi fazlasıyla belgelenmiş ve serbest: Rupite'deki evi, mezarı,
  // yaptırdığı kilise, Petriç kasabası, Kojuh dağı. Bu bağlantıyı kurabilecek
  // tek yer senaryo aşaması — model konuyu biliyor, arama motoru bilmiyor.
  vekil: {
    type: "array",
    items: { type: "string" },
    description:
      "Asıl sorgu arşivde bulunamazsa denenecek 2 YEDEK İngilizce sorgu. " +
      "Aynı şeyi başka kelimeyle değil, BAŞKA BİR AÇIDAN sor.\n" +
      "KİŞİLER İÇİN ÖNCELİK SIRASI (üstteki daha çok işe yarar):\n" +
      "1) HEYKEL/BÜST/ANIT — kamuya açık yerdedir, fotoğrafı genelde serbest lisanslı " +
      "('Nikola Tesla statue', 'Ataturk monument')\n" +
      "2) ESKİ GRAVÜR/TABLO/ÇİZİM — 1900 öncesi eserlerin telifi bitmiştir, arşivlerde " +
      "boldur ('Leidenfrost 18th century engraving', 'Newton portrait painting')\n" +
      "3) MEZAR/PLAKET/MÜZE — 'Vanga grave Rupite'\n" +
      "4) EVİ/DOĞDUĞU KASABA/YAŞADIĞI YER — 'Rupite Bulgaria village'\n" +
      "5) DÖNEMİN NESNESİ, olayın geçtiği coğrafya\n" +
      "Örnek: 'Baba Vanga portrait' için ['Vanga grave Rupite', 'Petrich Bulgaria town'].\n" +
      "Yakın dönem kişilerinde ve telifli figürlerde bu alan KRİTİK: yüzlerinin " +
      "serbest lisanslı fotoğrafı çoğu zaman YOKTUR, ama heykeli ya da mezarı vardır.",
  },
  prompt: {
    type: "string",
    description:
      "SADECE type='ai' ise doldur: üretilecek sahnenin İNGİLİZCE sinematik tarifi (1-2 cümle, kamera hareketi + ışık + atmosfer). Diğer türlerde boş string.",
  },
};

const EMPHASIS_SCHEMA = {
  type: "object",
  description: "Bu segmentte ekrana basılacak grafik. Çoğu segmentte type='none' olmalı.",
  properties: {
    type: {
      type: "string",
      enum: ["none", "stat", "keyword", "compare"],
      description: "none: grafik yok | stat: tek dev rakam | keyword: dev vurgu ifadesi | compare: karşılaştırma barları",
    },
    value: { type: "string", description: "stat için sayı (örn '4,7 milyar'), keyword için 2-4 kelimelik ifade. Diğer türlerde boş string." },
    label: { type: "string", description: "stat'ın altına yazılacak kısa açıklama (örn 'günlük aktif kullanıcı'). Diğer türlerde boş string." },
    items: {
      type: "array",
      description: "compare için 2-4 kalem. Diğer türlerde boş dizi.",
      items: {
        type: "object",
        properties: {
          label: { type: "string", description: "Kalem adı, en fazla 20 karakter" },
          value: { type: "number", description: "Sayısal değer (barlar buna göre ölçeklenir)" },
        },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["type", "value", "label", "items"],
  additionalProperties: false,
};

// ---------------------------------------------------------------- KOLAJ modu

const COLLAGE_SCHEMA = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      description: "Her beat = TEK cümle + o cümlenin tek somut kavramı",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Seslendirilecek TEK cümle, 6-14 kelime. Kısa, vurucu, konuşma dili.",
          },
          concept: {
            type: "string",
            description:
              "Bu cümlenin TEK somut kavramının İNGİLİZCE grafik tarifi (1 cümle). " +
              "Kesilmiş kağıt parçaları gibi düşün: 'a vintage brain engraving cutout with dark dots accumulating inside, a red upward arrow'. " +
              "İnsan yok ya da minicik. Sahne değil, KAVRAM. Stil tarifi YAZMA (sistem ekler). Yazı/rakam isteme.",
          },
          overlayText: {
            type: "string",
            description:
              "Ekrana yakılacak KISA Türkçe vurgu (en fazla 3 kelime veya bir sayı — örn '17 SAAT', 'MİKRO UYKU'). " +
              "Bu beat'te vurgulanacak bir şey yoksa boş string. Beat'lerin en fazla yarısında dolu olsun.",
          },
        },
        required: ["text", "concept", "overlayText"],
        additionalProperties: false,
      },
    },
  },
  required: ["beats"],
  additionalProperties: false,
};

function collageSystem(job) {
  const theme = THEMES[job.theme] || THEMES.vox;
  const tone = TONES[job.tone] || TONES.varsayilan;
  return [
    `Sen "Vox tarzı" kolaj belgesel videoları yazan bir senaristsin.`,
    `Video dili: ${langName(job.language)}. TÜM seslendirme metinleri bu dilde.`,
    `Format: ${theme.name}. ${theme.style}`,
    engagementInstructions(job),
    tone.prompt,
    job.guidance ? `Kanal sahibinin özel isteği: ${job.guidance}` : "",
    ``,
    `BU FORMATIN KURALLARI:`,
    `- Metin BEAT'lere bölünür. Her beat TEK cümledir ve ekranda TEK kavram gösterir.`,
    `- İlk beat bir KANCA olmalı: soru ya da şaşırtıcı iddia. ("Bu geceden sonra bir daha hiç uyumasan ne olurdu?" gibi)`,
    `- Sonra adım adım ilerle: her beat bir önceki üzerine somut bilgi koysun.`,
    `- Sayı kullan. Somut, doğrulanabilir sayılar bu formatın belkemiği.`,
    `- Cümleler kısa. Sıfat yığma, laf kalabalığı yok.`,
    `- Kapanış tek cümlelik güçlü bir çıkarım olsun.`,
  ].filter(Boolean).join("\n");
}

export async function runCollageScript(job, research, usage, logFn) {
  const minutes = DURATIONS[job.durationPreset]?.minutes || 3;
  const beatCount = Math.max(6, Math.min(120, Math.round(minutes * 17))); // ~3,5 sn/beat
  logFn(`Kolaj senaryosu yazılıyor (~${beatCount} beat)...`);

  if (job.demo) {
    return demoCollage(job.topic, job.language, beatCount);
  }

  const out = await callJSON({
    system: collageSystem(job),
    user: [
      `Konu: "${job.topic}"`,
      research ? `\nARAŞTIRMA DOSYASI:\n${research.slice(0, 12000)}` : "",
      ``,
      `Bu konuda tam ${beatCount} beat'lik bir video senaryosu yaz.`,
      `Toplam seslendirme süresi ~${minutes} dakika olacak, yani her beat ~3,5 saniye.`,
      ``,
      `Her beat için:`,
      `1) text: TEK cümle (${langName(job.language)}), 6-14 kelime`,
      `2) concept: o cümlenin tek somut kavramının İNGİLİZCE grafik tarifi`,
      `3) overlayText: ekrana yakılacak kısa Türkçe vurgu ya da boş string`,
      ``,
      `concept ÖRNEKLERİ (uyku konusu için):`,
      `- "a small empty bed cutout under a large crescent moon and stars, a blank red stamp in the corner"`,
      `- "a vintage brain engraving cutout with dark dots accumulating inside, a red upward arrow beside it"`,
      `- "a coffee cup cutout with a red X over a small clock, halftone steam rising"`,
      `Dikkat: concept'te ASLA yazı/rakam/harf isteme — yazılar montajda eklenir.`,
      `Sayı vurgusu gerekiyorsa şekil iste (kırmızı damga, çubuk, ok) ve rakamı overlayText'e yaz.`,
    ].filter(Boolean).join("\n"),
    schema: COLLAGE_SCHEMA,
    maxTokens: 32000,
    usage,
    logFn,
  });

  const beats = (out.beats || [])
    .filter((b) => b && b.text && b.concept)
    .map((b, i) => ({
      id: `b${i}`,
      text: String(b.text).trim(),
      concept: String(b.concept).trim(),
      overlayText: String(b.overlayText || "").trim().slice(0, 28),
    }));
  if (!beats.length) throw new Error("Kolaj senaryosu boş döndü.");
  logFn(`Senaryo hazır: ${beats.length} beat, ${beats.filter((b) => b.overlayText).length} ekran yazısı`);
  return { title: job.topic, beats };
}

function demoCollage(topic, lang, beatCount) {
  const tr = lang === "tr";
  const beats = Array.from({ length: Math.min(beatCount, 14) }, (_, i) => ({
    id: `b${i}`,
    text: tr
      ? i === 0
        ? `${topic} hakkında bildiğiniz her şey eksik olabilir.`
        : `Bu ${i + 1}. beat: demo modunda kısa bir örnek cümle seslendiriliyor.`
      : i === 0
        ? `Everything you know about ${topic} might be incomplete.`
        : `This is beat ${i + 1}: a short placeholder sentence in demo mode.`,
    concept: `a paper cutout illustration representing ${topic}, a red geometric accent shape`,
    overlayText: i % 3 === 1 ? (tr ? `${(i + 1) * 7} SAAT` : `${(i + 1) * 7} HOURS`) : "",
  }));
  return { title: tr ? `${topic} (Demo Kolaj)` : `${topic} (Demo Collage)`, beats };
}

function sectionSchema(beats, aiBudget = 0) {
  const visualDesc =
    beats > 1
      ? `Bu segment için ${beats} görsel (sırayla gösterilecek kesme). Sorgular tekrar edebilir; farklı açılardan aynı konu olabilir.`
      : "Bu segment için tek görsel (dizide 1 eleman).";
  return {
    type: "object",
    properties: {
      segments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "Seslendirilecek metin, 35-55 kelime, akıcı konuşma dili" },
            visuals: {
              type: "array",
              description: visualDesc,
              items: { type: "object", properties: VISUAL_PROPS, required: ["query", "type", "kind", "prompt", "vekil"], additionalProperties: false },
            },
            emphasis: EMPHASIS_SCHEMA,
          },
          required: ["text", "visuals", "emphasis"],
          additionalProperties: false,
        },
      },
    },
    required: ["segments"],
    additionalProperties: false,
  };
}

function langName(lang) { return lang === "tr" ? "Türkçe" : "İngilizce"; }

function baseSystem(job) {
  const theme = THEMES[job.theme] || THEMES.belgesel;
  const tone = TONES[job.tone] || TONES.varsayilan;
  return [
    `Sen milyonlarca izlenme alan YouTube kanalları için uzun metraj video senaryoları yazan usta bir senaristsin.`,
    `Video dili: ${langName(job.language)}. Senaryo metinlerinin TAMAMI bu dilde olmalı.`,
    `Format: ${theme.name}. ${theme.style}`,
    engagementInstructions(job),
    directorPrompt(job,{planning:false}),
    job.guidance ? `Kanal sahibinin özel isteği: ${job.guidance}` : "",
    // TON, KANAL İSTEĞİNDEN SONRA GELİR.
    //
    // Ölçüldü (20260812-af4f58): ton "komik" seçiliydi ama metin baştan sona
    // kuru bir fizik dersi çıktı, tek espri yok. İki sebep: ton tek satırdı ve
    // sekiz satırın ORTASINDA kayboluyordu; üstelik hemen ardından gelen kanal
    // isteği onu iptal edebiliyordu (o işte "konuyu tamamen ciddiye al"
    // yazılmıştı ve mizah tamamen silindi).
    //
    // Sıra ters çevrildi: kanal isteği önce, SEÇİLEN TON sonra. İkisi
    // çelişirse kullanıcının arayüzden seçtiği ton kazanır.
    tone.prompt,
    // "abone ol" anlatımdan tamamen çıkarıldı: seslendirmenin içinde geçen çağrı
    // izleyiciyi düşürüyor ve videoyu amatörleştiriyor. Çağrı artık açıklamada
    // ve sabit yorumda (seo.js) duruyor.
    `İzleyici tutma kuralları: ilk 15 saniyede güçlü bir kanca at; her bölümün sonunda bir sonraki bölüme merak bırak; somut detay ve sayı kullan; klişelerden ("bu videoda göreceğiz") kaçın. Anlatım metnine ASLA "abone ol", "beğen", "yorum yap" YAZMA.`,
    `Seslendirme metni yazıyorsun: sesli okunacak. Madde işareti, parantez, kaynak künyesi, sahne yönergesi YAZMA — sadece akıcı anlatı cümleleri.`,
  ].filter(Boolean).join("\n");
}

/**
 * Sinematik Belgesel araştırması uzunlukla ölçeklenir. Sabit "10-15 olgu,
 * 3-5 hook" 13 bölümlük 20 dk'lık bir belgesele 26-65 olgu ve ~12 yeniden
 * kanca gerekirken yetmiyordu: bölümler aynı olguları tekrar ediyor ya da
 * yazar uyduruyordu; grafik sahneleri için gerçek veri serisi hiç istenmiyordu.
 */
export function docuResearchLines(job) {
  const minutes = DURATIONS[job.durationPreset]?.minutes || 8;
  if (job.docuFormat === "ranking") return rankingResearchLines(job, minutes);
  const { chapters } = docuPlan(job);
  const facts = Math.max(15, chapters * 4);
  const hooks = Math.max(5, chapters);
  const dataHeavy = ["finance", "science"].includes(job.docuGenre) ||
    /borsa|ekonomi|kriz|enflasyon|piyasa|fiyat|nüfus|gelir|milyar|şirket|iklim|sıcaklık|uzay|rekor|stock|market|econom|price|population|revenue|climate|space/i.test(`${job.topic} ${job.guidance || ""}`);
  return [
    `Video formatı: Sinematik belgesel (uzun biçimli YouTube belgeseli), hedef süre ~${minutes} dakika, ~${chapters} bölüm.`,
    ``,
    `Şunları çıkar:`,
    `1) En çarpıcı ${facts}+ olgu (tarih/sayı ile, doğruluğundan emin olduklarını yaz). Birbirinden ayrı olsunlar: her biri farklı bir bölüme malzeme olabilmeli.`,
    `2) KESİN TARİHLİ kronoloji: gün/ay/yıl (biliniyorsa saat) ile olayların sırası`,
    `3) Az bilinen ${hooks}+ detay ("hook" malzemesi: şaşırtan, sahnelenebilir, merak uyandıran anlar)`,
    `4) Yaygın yanlış bilinenler`,
    `5) Kilit kişiler: ad, rol, olaylar sırasındaki yaşı ve görünüşü; fotoğrafı bilinen kişiler için fotoğrafın yaklaşık yılı`,
    `6) ${dataHeavy ? "2-4" : "Varsa 1-3"} GERÇEK veri serisi (yıl → değer, birimiyle ve kaynağıyla, en az 4 nokta): grafiğe dönüşecek. Tahmini ya da uydurma seri yazma; yoksa "seri yok" de.`,
    `7) Ölçek rakamları (sayaç malzemesi): tek başına akılda kalan sayılar, birimiyle`,
  ];
}

/**
 * A countdown needs a POOL, not one story: more candidates than places (the writer keeps the
 * strongest), each with its own where/when, hard facts, the one detail that stops a viewer, and a
 * measure for the ranking's criterion — so the order can be defended.
 */
export function rankingResearchLines(job, minutes) {
  const { items } = docuPlan(job);
  const pool = Math.ceil(items * 1.6);
  return [
    `Video formatı: GERİ SAYIM (sıralama) belgeseli, hedef süre ~${minutes} dakika, ${items} madde (${items}'dan 1'e).`,
    ``,
    `Şunları çıkar:`,
    `1) Konuya uyan EN AZ ${pool} aday madde (yazar en güçlü ${items}'unu seçecek). Birbirinden ayrı olaylar; yer ve dönem çeşitli olsun. Her aday için:`,
    `   - ad, YER, KESİN TARİH (gün/ay/yıl, biliniyorsa)`,
    `   - ne oldu: 4-6 doğrulanmış somut olgu (tarih/sayı ile)`,
    `   - izleyiciyi durduracak TEK ayrıntı (az bilinen, sahnelenebilir)`,
    `   - kilit kişiler (ad, rol, yaş) ve fotoğrafı/arşiv görüntüsü bilinenler`,
    `   - bugün hâlâ bilinmeyen / tartışılan ne`,
    `   - kaynaklar`,
    `2) Bir SIRALAMA ÖLÇÜTÜ önerisi (ölçülebilir, savunulabilir) ve adayların bu ölçüte göre önerilen sırası, her biri için tek cümlelik gerekçe.`,
    `3) Yaygın yanlış bilinenler (her aday için varsa).`,
    `4) Ölçek rakamları (sayaç malzemesi): tek başına akılda kalan sayılar, birimiyle.`,
  ];
}

export async function runResearch(job, usage, logFn, opts = {}) {
  if (job.demo) return demoResearch(job.topic, job.language);
  const wantWeb = job.useWebSearch;
  logFn(wantWeb ? "Web araştırması yapılıyor..." : "Konu bilgisi derleniyor...");
  const text = await callText({
    ...(opts.model ? { model: opts.model } : {}),
    system: `Sen titiz bir araştırmacısın. Bir YouTube senaristinin kullanacağı araştırma dosyası hazırlıyorsun. Türkçe yaz.`,
    user: [
      `Konu: "${job.topic}"`,
      job.guidance ? `Odak: ${job.guidance}` : "",
      ...(job.mediaKind === "docu" ? docuResearchLines(job) : [
        `Video formatı: ${THEMES[job.theme]?.name || "Belgesel"}, hedef süre ~${DURATIONS[job.durationPreset]?.minutes || 8} dakika.`,
        ``,
        `Şunları çıkar:`,
        `1) En çarpıcı 10-15 olgu (tarih/sayı ile, doğruluğundan emin olduklarını yaz)`,
        `2) Kronoloji veya mantıksal yapı önerisi`,
        `3) Az bilinen 3-5 detay ("hook" malzemesi)`,
        `4) Yaygın yanlış bilinenler`,
      ]),
      wantWeb ? `Güncel gelişmeleri web aramasıyla doğrula. Her önemli iddianın yanında kaynak başlığı ve TAM URL bağlantısını ver. Tarih/sayı, yayın tarihi ve belirsizlikleri kaydet; kaynak olmayan bilgiyi açıkça doğrulanmamış işaretle.` : ``,
      `Markdown formatında, öz ve yoğun yaz.`,
    ].filter(Boolean).join("\n"),
    webSearch: wantWeb,
    // Opus 5'te DÜŞÜNME de aynı max_tokens bütçesinden yiyor. Varsayılan 16.000
    // ile araştırma isteği tavana çarpıyordu ve iş "token sınırına takıldı"
    // diyerek %2'de ölüyordu (ölçüldü, iki ayrı işte). Bütçe senaryo çağrısıyla
    // aynı seviyeye çekildi; ayrıca kesilse bile eldekiyle devam ediliyor.
    maxTokens: 32000,
    usage,
    logFn,
  });
  return text;
}

/**
 * Bir segmentin hedeflenen anlatım süresi (saniye) — kurgu temposunu bu belirler.
 * Segment render'da 2-4 sahneye bölünüyor, yani 22 sn'lik segment sahne başına
 * ~7 sn demek; bitmiş videolarda iyi duran tempo bu.
 */
const SEGMENT_SANIYE = 22;

/** Altında YouTube bölüm işaretinin anlamı kalmayan süre (dk). */
const BOLUM_TABANI_SURESI = 2.5;
/**
 * Model bir segmenti bundan kısa yazmıyor (ölçüldü: 21 gerçek işte segment
 * başına 23-25 kelime, hedef uzunluktan bağımsız olarak).
 */
const EN_AZ_SEGMENT_KELIME = 23;

export function planSections(job) {
  const minutes = DURATIONS[job.durationPreset]?.minutes || 8;
  // Kelime bütçesi ÖLÇÜLEN tempoya göre. Sabit 140 wpm varsayımı Türkçede
  // gerçekte 110 çıkıyordu; "3 dakika" istenen video 4 dk 31 sn oluyordu
  // (hedefin %151'i). Ayrıntı ve ölçüm tablosu: tempo.js
  const totalWords = Math.round(minutes * tahminWpm(job.language, job.elevenVoiceId || job.voiceId, minutes));

  // BÖLÜM SAYISI. Taban 3'tü: YouTube bölüm işaretleri 3 damgadan az olunca
  // hiç görünmüyor. Ama kısa videoda bu taban YAPISAL OLARAK ULAŞILAMAZ bir
  // hedef yaratıyordu — 1 dakikalık video için 3 bölüm x 2 segment = 6 segment
  // zorunlu, segment başına taban 23 kelime ile en az 138 kelime = 1,25 dk.
  // Yani "1 dakika" isteyip en iyi ihtimalle 1 dk 15 sn alıyordun ve hiçbir
  // prompt bunu düzeltemezdi. Ölçülen İngilizce örneği tam buraya oturuyordu
  // (%124). Kısa videoda bölüm işareti zaten anlamsız, taban kaldırıldı.
  const sectionCount = minutes >= BOLUM_TABANI_SURESI
    ? Math.max(3, Math.min(14, Math.round(minutes / 2.4)))
    : Math.max(1, Math.round(minutes / 0.6));

  const wordsPerSection = Math.round(totalWords / sectionCount);

  // SEGMENT SAYISI TEMPODAN GELİR, BÜTÇEDEN DEĞİL.
  //
  // Eskiden `wordsPerSection / 45` idi; yani kelime bütçesine bağlıydı. Bütçeyi
  // 420'den 330'a çektiğimde bölüm başına segment sessizce 3'ten 2'ye düştü —
  // aynı süre daha az sahneye bölünüyor, sahneler uzuyor, tempo yavaşlıyor.
  // Süre hedefini düzeltirken kurguyu bozmak istemem.
  //
  // Segment, izleyicinin konu/görsel değişimi beklediği aralıktır: ~22 saniye.
  // Kelime karşılığı dile göre değişir, o yüzden tempodan hesaplanıyor.
  const wpm = totalWords / minutes;
  const wordsPerSegment = Math.max(20, Math.round((SEGMENT_SANIYE / 60) * wpm));
  const segPerSection = Math.max(2, Math.round(wordsPerSection / wordsPerSegment));
  // Bu yapının üretebileceği EN KISA metin. Hedeften büyükse hedef tutmaz.
  const enAzKelime = sectionCount * segPerSection * EN_AZ_SEGMENT_KELIME;
  return { minutes, totalWords, sectionCount, wordsPerSection, segPerSection, enAzKelime };
}

export async function runOutline(job, research, usage, logFn) {
  if (job.demo) return null; // demo modda outline'a gerek yok
  const plan = planSections(job);
  logFn(`Video planı çıkarılıyor (${plan.sectionCount} bölüm, ~${plan.totalWords} kelime)...`);
  const outline = await callJSON({
    system: baseSystem(job),
    user: [
      `Konu: "${job.topic}"`,
      ``,
      `ARAŞTIRMA DOSYASI:\n${research.slice(0, 14000)}`,
      ``,
      `Bu video için tam ${plan.sectionCount} bölümlük bir plan çıkar.`,
      `İlk bölüm mutlaka izleyiciyi yakalayan bir giriş (hook + vaat), son bölüm güçlü bir kapanış/sonuç olsun.`,
      `Bölüm başlıkları ${langName(job.language)} olsun ve YouTube chapter olarak kullanılabilecek kadar kısa olsun.`,
      // Ölçüldü (20260814-a46ab2): başlıklar boş döndü, yedek "Bölüm 1..5"
      // yazdı ve İNGİLİZCE videonun kartlarında Türkçe numaralar göründü.
      // Kartın işi izleyiciyi bir sonraki aşamaya odaklamak; numara bunu yapmaz.
      `Başlık O BÖLÜMÜN NE ANLATTIĞINI söylesin — "Bölüm 1", "Part 2", "Giriş" gibi`,
      `numara ya da genel etiket YAZMA. Başlığı okuyan biri o bölümde ne göreceğini`,
      `bilmeli ("Gazın Anatomisi", "Hazine İki Kez Çalınıyor"). 2-5 kelime.`,
      ``,
      `İŞ BÖLÜMÜ — bu en önemli kısım:`,
      `Her bölüm için "covers" alanına o bölümün işleyeceği SOMUT olguları yaz`,
      `(olay, tarih, kişi, sayı). "devredilen" alanına ise o bölümde geçmemesi`,
      `gereken, başka bölüme ait konuları yaz.`,
      `Bölümler ayrı ayrı yazılacak; bu iki alan olmadan aynı olgu üç bölümde birden`,
      `anlatılıyor ve video kendini tekrar ediyor. Hiçbir olgu iki bölümün covers`,
      `listesinde birden bulunmasın.`,
      `"rol" alanı: ilk bölüm "kanca", son bölüm "kapanis", aralarda kurulum/gelisme/doruk.`,
    ].join("\n"),
    schema: OUTLINE_SCHEMA,
    // Ana hat da tavanını AÇIKÇA versin: düşünme bütçeden yiyor ve bu çağrı
    // bölüm başına covers/devredilen/rol üretiyor, yani uzun videoda çıktısı
    // büyüyor. Varsayılana bırakılırsa senaryo çağrısıyla aynı tuzağa düşer.
    maxTokens: 32000,
    usage,
    logFn,
  });
  // SARMALAYICI ADINA GÜVENME — gerçek bir işi düşürdü.
  //
  // Bu hesapta yapılandırılmış çıktı ZORLANMIYOR (llm.js structuredOutputsBroken).
  // Model şemayı okuyup içeriği doğru üretse bile dış anahtarı kendince
  // adlandırabiliyor. Ölçüldü (20260809-e6f503): `outline.sections` undefined
  // geldi ve iş "Cannot read properties of undefined (reading 'slice')" ile
  // araştırma parası harcandıktan sonra çöktü. Aynı tuzak aynı gün üç ayrı
  // yerde görüldü ("duzeltmeler" -> "queries", "sonuclar" -> düz dizi).
  const bolumler = diziBul(outline, "sections", "bolumler", "chapters");
  if (!bolumler?.length) throw new Error("Plan üretilemedi: bölüm listesi boş döndü.");
  // bölüm sayısını plana sabitle
  outline.sections = bolumler.slice(0, plan.sectionCount);
  return outline;
}

export async function runSections(job, research, outline, usage, logFn, isCancelled, { cached = [], onSection = () => {}, requestJSON = callJSON } = {}) {
  if (job.demo) {
    const plan = planSections(job);
    const st = VISUAL_STYLES[job.visualStyle] || VISUAL_STYLES.klasik;
    return demoScript(job.topic, job.language, plan.minutes, st.beats, st.graphics);
  }
  const plan = planSections(job);
  // Tek kaynak planSections: segment sayısı hem yapısal tabanı hem prompt'u
  // belirliyor, iki yerde ayrı hesaplanırsa sessizce ayrışırlar.
  const segPerSection = plan.segPerSection;
  // Yapı hedefin üstünde bir tabana sahipse kullanıcıya SÖYLE — sessizce uzun
  // video üretip "hedef tutmadı" dedirtme.
  if (plan.enAzKelime > plan.totalWords * 1.05) {
    logFn(`Not: ${plan.minutes} dakikalık hedef için yapı en az ${plan.enAzKelime} kelime üretiyor ` +
      `(${plan.totalWords} kelime bütçesine karşılık) — video hedeften biraz uzun çıkabilir.`);
  }
  const sections = outline.sections;
  const style = VISUAL_STYLES[job.visualStyle] || VISUAL_STYLES.klasik;
  // AI sahne bütçesini bölümlere dağıt (her bölüm en fazla kaç AI sahne isteyebilir)
  // Senaryonun planlayacağı AI sahne sayısı TEK bütçeden gelir. Tamamını
  // senaryoya vermiyoruz: bir kısmı arşivin çuvalladığı sahnelere kalsın diye
  // üçte iki tavan konuyor. Kalan pay downloadPicked içinde kurtarmaya gider.
  const aiPlanli = plannedAiAllowance(job);

  logFn(`${sections.length} bölüm yazılıyor (paralel, ${style.name} görsel dili)...`);
  let done = 0;
  const results = await mapLimit(sections, 3, async (sec, idx) => {
    const aiBudget = Math.floor(aiPlanli/sections.length) + (idx < aiPlanli % sections.length ? 1 : 0);
    const schema = sectionSchema(style.beats, aiBudget);
    if (isCancelled()) throw new Error("cancelled");
    if (cached[idx]?.segments?.length && cached[idx].segments.every(s => String(s.text || '').trim().length > 10)) {
      done++;
      logFn(`Bölüm ${idx + 1}/${sections.length} kayıtlı senaryodan kullanılıyor.`);
      return structuredClone(cached[idx]);
    }
    const prev = idx > 0 ? sections[idx - 1] : null;
    const next = idx < sections.length - 1 ? sections[idx + 1] : null;
    const out = await requestJSON({
      system: baseSystem(job),
      user: [
        `Video başlığı: ${outline.title}`,
        `ARAŞTIRMA DOSYASI:\n${research.slice(0, 12000)}`,
        ``,
        `TÜM PLAN: ${sections.map((s, i) => `${i + 1}. ${s.title}`).join(" | ")}`,
        ``,
        `ŞİMDİ SADECE ŞU BÖLÜMÜ YAZ → Bölüm ${idx + 1}/${sections.length}: "${sec.title}"`,
        `Bölüm hedefi: ${sec.goal}`,
        // TEKRAR ÖNLEME: bölümler ayrı çağrılarda yazıldığı için model diğer
        // bölümlerde ne anlatıldığını bilmiyor ve aynı olguyu tekrar ediyordu.
        sec.covers?.length ? `BU BÖLÜMDE İŞLENECEK OLGULAR: ${sec.covers.join(" · ")}` : "",
        sec.devredilen?.length
          ? `BU BÖLÜMDE GEÇMEYECEK (başka bölüme ait): ${sec.devredilen.join(" · ")}`
          : "",
        // Diğer bölümlerin kapsamı da bağlama girsin — çakışmayı model kendisi görsün
        sections.length > 1
          ? `DİĞER BÖLÜMLERİN KAPSAMI (bunlara GİRME):\n` + sections
              .map((s, i) => (i === idx || !s.covers?.length ? null : `  ${i + 1}. ${s.title}: ${s.covers.join(", ")}`))
              .filter(Boolean).join("\n")
          : "",
        prev
          ? `Önceki bölüm: "${prev.title}" (oradan akıcı geçiş yap, tekrar etme)`
          : [
              // KANCA. İzleyicinin kalıp kalmayacağına ilk 15 saniyede karar
              // verdiği ölçülmüş bir gerçek; buraya özel talimat olmadan model
              // "Bu videoda ... ele alacağız" klişesiyle açıyordu.
              `Bu videonun AÇILIŞI — İLK 15 SANİYE KRİTİK:`,
              `1. cümle: doğrudan sahnenin içine düş. Çarpıcı bir olgu, rakam ya da`,
              `   görüntü. "Bu videoda", "Merhaba", "Hoş geldiniz" YASAK.`,
              `2. cümle: bir GERİLİM kur — cevaplanmamış bir soru ya da çelişki.`,
              `3. cümle: izleyiciye ne kazanacağını söyle ama cevabı VERME.`,
              `Kanca somut olsun: soyut giriş ("insanlık hep merak etmiştir") işe yaramaz.`,
            ].join("\n"),
        next
          ? `Sonraki bölüm: "${next.title}" (sonunda ona merak bırak)`
          : `Bu videonun KAPANIŞI: yankı bırakan bir tespit ya da çarpıcı bir soruyla güçlü bitir. Abone/beğeni çağrısı YAZMA.`,
        ``,
        `Bölümü ${segPerSection} segmente böl. Her segment için:`,
        `1) 35-55 kelimelik seslendirme metni (${langName(job.language)})`,
        // SES ETİKETLERİ — yalnızca destekleyen tonlarda.
        //
        // ElevenLabs v3 metindeki [laughs] gibi etiketleri OYNUYOR (ölçüldü,
        // kullanıcı üç örneği dinleyip etiketliyi seçti). Etiket ekrana ya da
        // altyazıya sızmıyor: senaryo kurulunca ayrılıyor (sesEtiketleriniAyir).
        //
        // SAYI SINIRI DOĞALLIK İÇİN ŞART. Her cümlede gülen anlatıcı sinir
        // bozucu olur ve espri değerini kaybeder; etiket ancak seyrek olduğunda
        // "gerçekten güldü" etkisi yapıyor.
        ...(TONE_ETIKET[job.tone] ? [
          `   SES ETİKETİ: anlatıcının nasıl seslendireceğini gösteren etiket`,
          `   koyabilirsin. İzin verilenler: ${TONE_ETIKET[job.tone].map((e) => `[${e}]`).join(" ")}`,
          `   KURAL — SEYREK OLACAK: bu bölümün TAMAMINDA en fazla 2 etiket.`,
          `   Yalnızca gerçekten işleyen yere koy: espri indikten SONRA ya da`,
          `   absürt bir rakamın hemen ardına. Her segmente koyma.`,
          `   Etiketi cümlenin içine yaz: "...the atmosphere shrugs. [laughs] And that's"`,
          `   Listede olmayan etiket UYDURMA.`,
        ] : []),
        // ÇAPA CÜMLE DÜZEYİNDE ARANIR — SEGMENT DÜZEYİNDE DEĞİL.
        //
        // Ölçüldü (üç İngilizce video): görsel isabeti %41-45'te takıldı ve
        // denetimin gerekçesi hep aynıydı — "anlatılan cümle soyut, felsefi".
        //
        // Kural önce "her SEGMENTTE somut bir şey olsun" diye yazılmıştı ve
        // hiçbir işe yaramadı: ölçüldü, üç videoda da segment düzeyinde çapa
        // oranı zaten %100'dü. Segment 35-55 kelime, içinde 2-4 cümle var;
        // bir yerinde rakam geçince "çapalı" sayılıyor. Oysa görsel, TEK BİR
        // CÜMLENİN okunduğu ana denk geliyor.
        //
        // Aynı videolarda CÜMLE düzeyinde oran %31-47 çıktı — ölçülen görsel
        // isabetiyle (%41-45) neredeyse birebir. Tavan burası.
        //
        // Yorum yasak değil; yorum videoyu videodan fazlası yapan şey.
        // Kural şu: yorum kendi başına bir cümle olarak HAVADA durmasın,
        // somut sahneyle AYNI cümlede birleşsin.
        `   ÇAPA KURALI — CÜMLE CÜMLE: her cümlede gösterilebilir bir şey olsun.`,
        `   Gösterilebilir = adıyla bir kişi, bir yer, bir kurum, bir belge,`,
        `   bir cihaz/nesne, ya da tarihi verilen bir olay.`,
        `   Yorumu AYRI bir cümle yapma — somut sahneyle aynı cümlede birleştir.`,
        `   YANLIŞ → DOĞRU:`,
        `     "Sayılar acımasız. Ölçek her şeyi değiştirir."`,
        `       → "2024'te Utah dizisi 1024 elektrot taşıyordu; sekiz milyar insana`,
        `          takmak bir ameliyathanenin yüz yıl durmadan çalışması demek."`,
        `     "Asıl tehlike daha sıradan."`,
        `       → "Facebook 2021'de beyin-bilgisayar programını kapatıp aynı ekibi`,
        `          bilek bandına geçirdi — tehlike ameliyathanede değil, bilekte."`,
        `   Bölümün SON cümlesi soyut olabilir; tek istisna odur.`,
        `2) visuals: ${style.beats} adet görsel. Her biri İNGİLİZCE arama sorgusu (2-5 kelime, spesifik — örn. "Nikola Tesla portrait 1890", "new york skyline 1980s").`,
        style.beats > 1
          ? `   Görseller anlatımın akışını takip etsin: metnin başında neyden bahsediliyorsa ilk görsel o olsun, sonra sırayla. Aynı sorguyu tekrar edebilirsin — sistem farklı fotoğraf seçer.`
          : ``,
        `   GÖZLE GÖRÜLÜR HAREKET varsa type=video tercih et: gerçek olay, çalışan makine, yolculuk, kalabalık, doğa, şehir veya süreç.`,
        `   Portre, belge, harita, grafik, gazete, mektup ve belirli bir tarihî fotoğraf için type=image kullan.`,
        `   Hareket sırf dekor olmasın: video sorgusu o cümlede anlatılan özel olay/yer/eylemin adını taşımalı.`,
        // ANLATILAN ŞEYİ GÖSTER — jenerik metafor değil.
        //
        // Ölçüldü (Baba Vanga videosu): 27 görsel sorgusunun 9'u jenerik
        // metafordu — "vintage typewriter manuscript pages", "archive index
        // cards drawer", "dust storm rural field", "blind woman hands braille".
        // Boru hattı bunları sadakatle buldu ve 27 sahnenin 12'si stok fotoğrafla
        // doldu: izleyici Bilimler Akademisi beklerken kart katalogu gördü.
        // Sorun aramada değil, SORGUNUN KENDİSİNDEYDİ.
        `   SORGULAR ANLATILAN ŞEYİN ADINI TAŞIMALI — kavramın jenerik resmini DEĞİL.`,
        `   Metinde bir kişi, kurum, yer, belge ya da olay geçiyorsa sorgu onun ÖZEL ADINI içersin.`,
        `   YANLIŞ → DOĞRU örnekleri:`,
        `     "vintage typewriter manuscript pages"  →  "Bulgarian Academy of Sciences building"`,
        `     "archive index cards drawer"           →  "Suggestology Institute Sofia"`,
        `     "blind woman hands braille"            →  "Zemun school for the blind 1920s"`,
        `     "orthodox church fresco wall"          →  "Sveta Petka Bulgarska church Rupite interior"`,
        `     "newspaper headlines clipping wall"    →  "Bulgarian communist era newspaper Rabotnichesko Delo"`,
        `   Sorguların EN AZ dörtte üçü özel ad (kişi/yer/kurum/eser/yıl) içermeli.`,
        `   Jenerik atmosfer sorgusu ancak metin gerçekten soyut bir şeyden söz ediyorsa kullanılabilir.`,
        // KELİME TETİKLİ KESME — kurgudaki adıyla "literalism".
        //
        // Cümlede geçen HER isme kesmek videoyu anahtar kelime slayt gösterisine
        // çevirir. Gerçek vaka (osuruk videosu): konu gaz hacmiyken cümlede
        // "uçak" geçtiği için uçak fotoğrafı geldi ve denetim buna 3 verdi —
        // çünkü denetim "cümlede geçen şeyi gösteriyor mu" diye soruyor.
        // Aynı kusurdan doğan başka sorgular: "skyscraper business district",
        // "signing insurance contract pen" — ikisi de sahnenin konusundan değil,
        // cümlede geçen bir kelimeden doğmuş.
        //
        // Ayrım, ismin CÜMLENİN VURGUSU mu yoksa yan unsur mu olduğu.
        `   SORGU SAHNENİN KONUSUNU İZLESİN — cümlede geçen her ismi DEĞİL.`,
        `   Bir isim yalnızca ölçü birimi ya da benzetme olarak geçiyorsa ona sorgu AÇMA;`,
        `   sahnenin asıl konusunda kal. Ancak o benzetme cümlenin VURGUSU ise sorgu onun olur.`,
        `   YANLIŞ → DOĞRU:`,
        `     "...bir uçağın taksi yaparken yaktığı yakıt kadar" (konu: bağırsak gazı)`,
        `       → sorgu "airplane" DEĞİL; sahne hâlâ gazı anlatıyor.`,
        `     "413.000 metreküp — iki Hindenburg eder" (vurgu BU benzetme)`,
        `       → sorgu "Hindenburg disaster 1937" DOĞRU; rakamın karşılığı o.`,
        `   Ölçüt: o ismi ekranda görmezse izleyici bir şey kaybeder mi? Hayırsa kesme.`,
        `   Bir konuyu gösteremiyorsan jenerik resmine kaçma — vekil alanına o konunun`,
        `   somut bir izini yaz (bkz. aşağıdaki vekil kuralları).`,
        // VEKİL SORGU. Ölçüldü (Baba Vanga): serbest lisanslı fotoğrafı yok,
        // "Bulgarian mystic blind woman 1970s" 25 alakasız stok aday getirdi ve
        // o sahneler boş kaldı. Oysa Rupite'deki evi, mezarı, Petriç kasabası
        // arşivde serbest lisansla duruyor. Bu bağı ancak konuyu BİLEN model
        // kurabilir — arama motoru kuramaz.
        `   vekil: her görsel için 2 YEDEK İngilizce sorgu yaz. Asıl sorgu arşivde bulunamazsa bunlar denenecek.`,
        `   Vekil, aynı şeyin eşanlamlısı DEĞİL, aynı konunun BAŞKA BİR AÇISI olmalı.`,
        `   KİŞİ sorgularında şu sırayla dene — üsttekiler serbest arşivde çok daha bol:`,
        `     1) heykel / büst / anıt  (fotoğrafının lisansı ayrıca doğrulanmalı)`,
        `     2) eski gravür / tablo / çizim  (1900 öncesi eserlerin telifi bitmiştir)`,
        `     3) mezar / plaket / müze  4) evi / doğduğu kasaba  5) dönemin nesnesi, coğrafya`,
        `   Örnek — "Baba Vanga portrait" için: ["Vanga grave Rupite", "Petrich Bulgaria town"].`,
        `   Yakın dönem kişileri ve telifli figürlerde bu alan kritik: yüzlerinin serbest`,
        `   fotoğrafı çoğu zaman YOKTUR, ama heykeli, mezarı ya da eski bir gravürü vardır.`,
        job.mediaKind==='director'
          ? `   AI Yönetmen: burada gerçek stok/arşiv araması için type="image" veya "video" ve sahneye özgü sorgu yaz. AI kapalı değil; sonraki yönetmen aşaması gereken canlandırma, açıklayıcı görsel ve anlamlı hareketi sahne bazında üretir. Alakasız bir nesne veya genel stokla asıl olayı geçiştirme. Sayı önemliyse anlatımda değerini VE birimini açık, doğru ve birlikte kullan.`
          : aiBudget > 0
          ? `   AI SAHNE: Bu bölümde en fazla ${aiBudget} görsel için type="ai" kullanabilirsin — ama SADECE gerçek arşiv görüntüsü BULUNAMAYACAK sahneler için: tarihi canlandırma, soyut kavramın görselleştirilmesi, imkânsız kamera açısı, gelecek senaryosu, mikroskobik/kozmik ölçek. type="ai" seçersen prompt alanına sahnenin İngilizce sinematik tarifini yaz (kamera hareketi, ışık, atmosfer). Gerçek fotoğrafı/videosu olan hiçbir şey için AI kullanma.`
          : `   type="ai" KULLANMA (bu videoda AI üretimi kapalı).`,
        // emphasis HER GÖRSEL DİLDE istenir. Eskiden grafik kapalıyken modele
        // "hepsinde type=none" deniyordu; sonuçta alan boş kalıyor ve sessizce
        // ÜÇ yol birden kapanıyordu: (a) transitions.js'in vurguda sert kesme
        // kuralı hiç tetiklenmiyor (232 saniyede sıfır sert kesme ölçüldü),
        // (b) kinetik yazının altın kelimesi metinden tahmin ediliyor,
        // (c) ses tarafında vurgu bilgisi hiç oluşmuyor.
        // Grafik kapalıyken sadece "compare" (bar çizimi) devre dışı kalır.
        job.mediaKind==='director'
          ? `3) emphasis: çoğu segmentte type="none", value/label boş, items boş dizi. Yalnız gerçekten önemli bir veri için type="stat" ve value alanında anlatımdaki tam değer + birim, label alanında kısa bağlam kullan. Her sayı için grafik veya tek kelimelik başlık zorlama. Görsel yönetmen sahnenin üzerine gereken temiz açıklamayı ayrıca yerleştirecek; düz kart, silindir, bar grafiği veya her sahnede yinelenen yazı düzeni tasarlama.`
          : style.graphics
          ? [
              `3) emphasis: ekrana basılacak grafik.`,
              `   - Metinde çarpıcı BİR SAYI geçiyorsa → type="stat", value=sayı (örn "4,7 milyar"), label=neyin sayısı olduğu (kısa).`,
              `   - Metnin özeti tek bir vurucu ifadeyse → type="keyword", value=2-4 kelime (büyük harfe çevrilecek).`,
              `   - Metin iki veya daha fazla şeyi sayıyla kıyaslıyorsa → type="compare", items=[{label,value}] (2-4 kalem).`,
              `   - Bunların hiçbiri yoksa → type="none" ve value/label boş string, items boş dizi.`,
              // ALT SINIR — ölçülen kusur.
              //
              // Buradaki tek kural "en fazla yarısında grafik olsun"du: bir ÜST
              // sınır, alt sınır yok. Model bunu "az kullan" diye okudu ve
              // ölçüldü (20260814-a46ab2): çarpıcı rakam geçen 19 segmentin
              // yalnızca 6'sında grafik vardı (%32). Yani "413.000 metreküp",
              // "495 ton", "+99 dB" okunurken ekranda dönen stok video vardı.
              // Bu rakamlar videonun en güçlü anları; ekranda patlamaları gerek.
              //
              // Üst sınır KALDIRILDI, yerine içeriğe bağlı kural geldi: sayı
              // varsa grafik var, yoksa yok. Uydurma yasağı aynen duruyor.
              `   ZORUNLU: metinde çarpıcı bir SAYI geçen HER segmentte type="stat" olsun.`,
              `   Bu sayılar videonun en güçlü anları — ekranda görünmezlerse izleyici kaçırır.`,
              `   Çarpıcı sayı = büyük miktar, oran, tarih aralığı, ölçüm ya da para tutarı.`,
              `   Sayı yoksa zorlama; grafiği ancak metinde GERÇEKTEN geçen bir sayı/ifade`,
              `   için kullan — UYDURMA. Aynı sayıyı iki segmentte tekrar ekrana basma.`,
            ].join("\n")
          : [
              `3) emphasis: o segmentin VURUŞU — ekranda büyük puntoyla tek başına duracak.`,
              `   - Metinde çarpıcı BİR SAYI geçiyorsa → type="stat", value=sayı (örn "11 kilometre"), label boş.`,
              `   - Değilse, cümlenin ağırlık merkezi olan kelimeyi seç → type="keyword", value=TEK KELİME.`,
              `     Bu kelime cümlenin SON kelimesi ya da sonuna yakın olmalı; ekranda gövdenin`,
              `     devamı gibi okunacak ("... on bir kilometre" → "KİLOMETRE"). Bağlaç/edat seçme.`,
              `   - Segment kısaysa veya vurgulanacak bir şey yoksa → type="none".`,
              `   type="compare" KULLANMA (bu görsel dilde bar grafiği çizilmiyor).`,
              `   Her bölümde en az bir segmentte vuruş olsun; hepsinde olmak zorunda değil.`,
            ].join("\n"),
        `UZUNLUK — BU KURAL KESİN:`,
        `Bu bölüm TAM ${segPerSection} segment olacak ve TOPLAM ~${plan.wordsPerSection} kelime tutacak.`,
        `Yani her segment ortalama ${Math.round(plan.wordsPerSection / segPerSection)} kelime.`,
        `Segment sayısını azaltma; konu biterse daha ayrıntılı anlat.`,
      ].filter(Boolean).join("\n"),
      schema,
      // Opus 5'te DÜŞÜNME de aynı max_tokens bütçesinden yiyor ve BU çağrının
      // istemi dosyadaki en uzunu (görsel dili kuralları, vekil sorgu örnekleri,
      // diğer bölümlerin kapsamı, uzunluk sözleşmesi). Araştırma ve ana hat
      // çağrıları bu yüzden 32.000'e çıkarılmıştı ama burası atlanmış: çağrı
      // maxTokens hiç vermeyip callJSON'un 16.000 varsayılanına düşüyordu.
      // Ölçüldü (20260811-3ca6c1, 3 dakikalık İngilizce iş): %10'da
      // "Yanıt token sınırına takıldı" ile TÜM İŞ öldü. JSON yanıtı serbest
      // metin gibi yarısından kesilip kullanılamıyor, o yüzden tavan şart.
      maxTokens: 32000,
      usage,
      logFn,
    });

    // UZUNLUK DENETİMİ. Model istenen segment sayısını tutmuyor: aynı 10
    // dakikalık istekte bir iş bölüm başına 4, başkası 12 segment üretti
    // (ölçüldü). Segment başına kelime ikisinde de ~25 olduğu için videonun
    // süresini doğrudan bu belirliyor — 392 kelime / 3 dk 23 sn ile
    // 1192 kelime / 10 dk 3 sn arasındaki fark buradan geliyordu.
    // Kısa kalan bölüm bir kez daha, eksiği söylenerek istenir.
    let segmentler = normalizeSegments(diziBul(out, "segments", "segmentler"), style.beats);
    const say = (liste) => liste.reduce((a, s) =>
      a + String(s.text || "").split(/\s+/).filter(Boolean).length, 0);
    let kelime = say(segmentler);

    // BOŞ GELMEK İLE KISA GELMEK AYNI ŞEY DEĞİL.
    //
    // Ölçüldü — aynı gün üç ayrı işte bölümler METİNSİZ döndü (0 kelime).
    // Eski kod ikisini de "kısa kaldı" sayıp tek bir "öncekini GENİŞLET"
    // isteği gönderiyordu ve o isteğin içine boş satırlar koyuyordu:
    //
    //     Önceki metin (genişletilecek):
    //     1.
    //     2.
    //     3.
    //
    // Model bu bağlamda çoğu zaman yine boş döndürüyor, sistem de eldekini
    // kabul edip devam ediyordu. Sonuç: iş ya seslendirmede çöküyor ya da
    // (doğrulama eklendikten sonra) senaryo aşamasında duruyor — her iki
    // durumda da bir araştırma+senaryo turu ödenmiş oluyor.
    //
    // Artık: boşsa SIFIRDAN yaz denir (genişlet değil) ve bir kez daha hak
    // verilir; yalnızca kısaysa eski davranış korunur (tek deneme yetiyordu).
    for (let deneme = 1; deneme <= 2; deneme++) {
      if (kelime >= plan.wordsPerSection * BOLUM_ALT_SINIR) break;
      const bos = kelime === 0;
      // Kısa kalma tek denemeyle düzeliyordu; ikinci tur yalnızca BOŞ vakaya.
      if (deneme === 2 && !bos) break;
      logFn(bos
        ? `Bölüm ${idx + 1} METİNSİZ döndü — ${deneme}. kez, sıfırdan yazılması isteniyor...`
        : `Bölüm ${idx + 1} kısa kaldı (${kelime}/${plan.wordsPerSection} kelime) — yeniden isteniyor...`);
      try {
        const tekrar = await requestJSON({
          system: baseSystem(job),
          user: bos
            // SIFIRDAN yazma isteği: önceki (boş) metin HİÇ gösterilmiyor.
            ? `Bu bölümün SESLENDİRME METNİNİ yaz. Önceki denemede "text" alanları ` +
              `boş geldi — her segmentin text alanı DOLU olmak zorunda.\n\n` +
              `Bölüm ${idx + 1}/${sections.length}: "${sec.title}"\nHedef: ${sec.goal}\n` +
              (sec.covers?.length ? `İşlenecek olgular: ${sec.covers.join(" · ")}\n` : "") +
              `\nGEREKEN: TAM ${segPerSection} segment. Her segmentin "text" alanında ` +
              `${Math.round(plan.wordsPerSection / segPerSection)} kelimelik ${langName(job.language)} ` +
              `anlatım metni olacak. Toplam ${plan.wordsPerSection} kelime.\n` +
              `Boş "text" alanı BIRAKMA.`
            : `Aşağıdaki bölümü YENİDEN yaz — öncekinde uzunluk tutmadı.\n\n` +
              `Bölüm ${idx + 1}/${sections.length}: "${sec.title}"\nHedef: ${sec.goal}\n` +
              (sec.covers?.length ? `İşlenecek olgular: ${sec.covers.join(" · ")}\n` : "") +
              `\nÖNCEKİ DENEME ${segmentler.length} segment ve ${kelime} kelimeydi.\n` +
              `GEREKEN: TAM ${segPerSection} segment, TOPLAM ${plan.wordsPerSection} kelime ` +
              `(segment başına ~${Math.round(plan.wordsPerSection / segPerSection)} kelime).\n` +
              `Aynı olguları anlat ama YETERİNCE AYRINTILI yaz. Segment sayısını eksiltme.\n\n` +
              `Önceki metin (genişletilecek):\n` +
              segmentler.map((s, i) => `${i + 1}. ${s.text}`).join("\n"),
          // Bu ONARIM çağrısı: ilk deneme zaten tutmadı, tavana da çarpıp
          // bölümü büsbütün kaybetmeyelim.
          schema, maxTokens: 32000, usage, logFn,
        });
        const yeni = normalizeSegments(diziBul(tekrar, "segments", "segmentler"), style.beats);
        // Yalnızca GERÇEKTEN daha uzunsa al — ikinci deneme daha da kısa
        // gelirse eldekini korumak gerekir.
        if (say(yeni) > kelime) { segmentler = yeni; kelime = say(yeni); }
      } catch (e) {
        logFn(`Bölüm ${idx + 1} yeniden yazılamadı, eldeki kullanılıyor.`);
        break;
      }
    }

    // ÇAPA DENETİMİ — bölüm bazında, ve DÜZELTMELİ.
    //
    // ÖLÇÜLEN KUSUR (20260814-a46ab2): çapa oranı %32'de kaldı ve bitmiş
    // videoda görsel isabeti %54 çıktı. Kusurun dağılımı ölçüldü — 75 görselin
    // 39'u (%52) şu kategorideydi: "görsel konuyla ilgili ama o an okunan
    // cümlenin gösterilecek karşılığı yok". Arşivin boş kaldığı sahne SIFIRDI.
    // Yani darboğaz arama, sıralama ya da AI değil; SENARYONUN kendisi.
    //
    // Çapa kuralı istemde vardı ama yalnızca tavsiyeydi ve model uymadı.
    // Burada ölçülüp uyulmadığında bölüm YENİDEN yazdırılıyor.
    //
    // Karşılaştırma: beyin çipi videosunda çapa %58 → isabet %62; bu videoda
    // çapa %32 → isabet %54. İkisi birlikte hareket ediyor.
    const capaOrani = (segs) => {
      const c = segs.flatMap((s) => cumleleriBol(String(s?.text || "")))
        .map((x) => (typeof x === "string" ? x : x?.metin || ""))
        .filter((x) => x.split(/\s+/).filter(Boolean).length >= 3);
      if (!c.length) return 1;
      return c.filter((x) => somutCapaVar(x)).length / c.length;
    };
    let oran = capaOrani(segmentler);
    if (oran < CAPA_ALT_SINIR && kelime > 0) {
      logFn(`Bölüm ${idx + 1} soyut kaldı (cümlelerin %${Math.round(oran * 100)}'inde gösterilecek bir şey var) — somutlaştırılıyor...`);
      try {
        const somut = await requestJSON({
          system: baseSystem(job),
          user: [
            `Aşağıdaki bölümü YENİDEN yaz. Olguları ve uzunluğu KORU, yalnızca`,
            `cümleleri gösterilebilir hâle getir.`,
            ``,
            `SORUN: cümlelerin çoğunda ekranda gösterilebilecek somut bir şey yok.`,
            `Belgesel görüntüsü ancak adı geçen bir kişi, yer, kurum, belge, cihaz`,
            `ya da tarihi verilen bir olay varsa bulunabiliyor.`,
            ``,
            `KURAL: her cümlede gösterilebilir bir şey olsun. Yorumu ayrı cümle`,
            `yapma — somut sahneyle AYNI cümlede birleştir.`,
            `Bölümün SON cümlesi soyut kalabilir.`,
            ``,
            `Bölüm ${idx + 1}/${sections.length}: "${sec.title}"`,
            sec.covers?.length ? `İşlenecek olgular: ${sec.covers.join(" · ")}` : "",
            `TAM ${segPerSection} segment, toplam ~${plan.wordsPerSection} kelime.`,
            `Olguları DEĞİŞTİRME; rakamlar ve adlar aynı kalsın.`,
            ``,
            `Önceki metin:`,
            segmentler.map((s, i) => `${i + 1}. ${s.text}`).join("\n"),
          ].filter(Boolean).join("\n"),
          schema, maxTokens: 32000, usage, logFn,
        });
        const yeni = normalizeSegments(diziBul(somut, "segments", "segmentler"), style.beats);
        const yeniOran = capaOrani(yeni);
        const yeniKelime = say(yeni);
        // Yalnızca GERÇEKTEN daha somutsa ve uzunluk çökmediyse al. Aksi hâlde
        // elde iyi bir metin varken kötüsüyle değiştirmiş oluruz.
        if (yeniOran > oran && yeniKelime >= kelime * 0.8) {
          segmentler = yeni; kelime = yeniKelime;
          logFn(`Bölüm ${idx + 1} somutlaştı: %${Math.round(oran * 100)} → %${Math.round(yeniOran * 100)}`);
          oran = yeniOran;
        } else {
          logFn(`Bölüm ${idx + 1}: somutlaştırma iyileştirmedi (%${Math.round(yeniOran * 100)}), eldeki korunuyor.`);
        }
      } catch (e) {
        logFn(`Bölüm ${idx + 1} somutlaştırılamadı: ${String(e.message).slice(0, 80)}`);
      }
    }

    done++;
    logFn(`Bölüm ${idx + 1}/${sections.length} yazıldı: ${sec.title} (${segmentler.length} segment, ${kelime} kelime, çapa %${Math.round(oran * 100)})`);
    const completedSection = { title: sec.title, segments: segmentler };
    if (segmentler.length && segmentler.every(s => String(s.text || '').trim().length > 10)) await onSection(idx, completedSection);
    return completedSection;
  });

  const failed = results.filter((r) => !r.ok);
  if (failed.length) throw failed[0].error;

  let script = { title: outline.title, sections: results.map((r) => r.value) };
  // Bölümler paralel yazıldığı için tekrar ve dil pürüzleri ancak burada görülür
  script = await redaksiyon(job, script, usage, logFn, requestJSON, isCancelled);
  if (isCancelled()) throw new Error('cancelled');
  // Redaksiyon METNİ düzeltir; bu geçiş GÖRSEL SORGULARINI düzeltir. Sırası
  // önemli: redaksiyon cümleleri değiştirebiliyor, sorgular ona göre denetlenmeli.
  script = await sorgulariOnar(job, script, usage, logFn);
  sesEtiketleriniAyir(script, job, logFn);
  senaryoyuDogrula(script, job);
  capaOraniniBildir(script, logFn);
  bolumBasliklariniBildir(script, logFn);
  return script;
}

/**
 * SES ETİKETLERİNİ METİNDEN AYIR — tek nokta.
 *
 * ElevenLabs v3, metnin içindeki `[laughs]` gibi etiketleri OYNUYOR. Ama o
 * etiket ekrana ya da altyazıya girerse felaket: izleyici "[laughs]" yazısını
 * okur. Ölçüldü — v3 hizalamasında etiket karakterleri aynen dönüyor, yani
 * altyazı onu olduğu gibi basardı.
 *
 * Çözüm tek yerde: senaryo kurulur kurulmaz her segment ikiye ayrılıyor.
 *   seg.ses  = etiketli hâli, YALNIZCA seslendirmeye gider
 *   seg.text = temiz hâli, ekranda/altyazıda/ölçümde kullanılan tek metin
 * Böylece aşağıdaki hiçbir adım (kelime sayımı, çapa ölçümü, tipografi,
 * altyazı) etiketi görmüyor ve tek tek temizlemeye gerek kalmıyor.
 */
export function sesEtiketleriniAyir(script, job, logFn = () => {}) {
  let sayi = 0;
  for (const sec of script?.sections || []) {
    for (const seg of sec?.segments || []) {
      const ham = String(seg?.text || "");
      if (!/\[[^\]\n]{1,24}\]/.test(ham)) continue;
      seg.ses = ham;                       // seslendirme bunu okur
      seg.text = etiketleriAyikla(ham);    // geri kalan her şey bunu görür
      sayi += (ham.match(/\[[^\]\n]{1,24}\]/g) || []).length;
    }
  }
  if (sayi) logFn(`${sayi} ses etiketi ayrıldı (seslendirmeye gider, ekrana yazılmaz).`);
  return sayi;
}

/**
 * SEGMENTLERİN KAÇINDA GÖSTERİLEBİLİR BİR ÇAPA VAR — ölç ve söyle.
 *
 * Neden ölçülüyor: görsel isabeti üç ayrı İngilizce videoda %41-45'te takıldı
 * ve denetimin gerekçeleri hep aynıydı — "anlatılan cümle soyut, felsefi".
 * Darboğaz medya katmanında değil, senaryonun gösterilecek bir şey
 * vermemesindeydi. İstemdeki çapa kuralının işe yarayıp yaramadığı ancak
 * iş başına ölçülürse görülür; yoksa bir sonraki kişi yine tahmin yürütür.
 *
 * Bilerek YALNIZCA RAPOR: senaryoyu burada reddetmek, araştırma ve yazım
 * parası harcanmışken işi öldürmek olur. Sayı düşükse video yine çıkar,
 * ama neden zayıf olacağı önceden bilinir.
 */
/**
 * BÖLÜM BAŞLIKLARI EKRANDA ANLAM TAŞIYOR MU — sessiz kalmasın.
 *
 * Ölçülen kusur (20260814-a46ab2): beş bölümün beşi de "Bölüm 1..5" olarak
 * kaldı. Video İngilizceydi. Bölüm kartının işlevi izleyicinin beynini bir
 * sonraki aşamaya odaklamaktır — numara bunu yapmaz, sadece yer kaplar.
 * Aynı başlıklar YouTube açıklamasındaki chapter damgalarına da yazılıyor.
 *
 * @returns anlamlı başlık oranı (0..1), bölüm yoksa null
 */
export function bolumBasliklariniBildir(script, logFn = () => {}) {
  const bolumler = script?.sections || [];
  if (!bolumler.length) return null;
  const anlamli = bolumler.filter((s) => anlamliBolumBasligi(s?.title)).length;
  const oran = anlamli / bolumler.length;
  if (anlamli < bolumler.length) {
    logFn(`DİKKAT: ${bolumler.length - anlamli}/${bolumler.length} bölüm başlığı ` +
      `yer tutucu kaldı ("Bölüm 3" gibi). Ekrandaki bölüm kartları ve YouTube ` +
      `chapter damgaları bu adları kullanıyor — izleyiciye hiçbir şey söylemezler.`);
  }
  return oran;
}

export function capaOraniniBildir(script, logFn = () => {}) {
  const segler = (script?.sections || []).flatMap((s) => s?.segments || []);
  if (!segler.length) return null;
  // CÜMLE cümle ölçülür. Segment düzeyi işe yaramıyor: üç videoda da %100
  // çıktı (segmentte bir yerde rakam geçmesi yetiyor) ama görsel tek bir
  // cümlenin okunduğu ana denk geliyor. Aynı videolarda cümle düzeyi %31-47.
  const cumleler = segler.flatMap((g) => cumleleriBol(String(g?.text || "")))
    .map((c) => (typeof c === "string" ? c : c?.metin || ""))
    .filter((c) => c.split(/\s+/).filter(Boolean).length >= 3);
  if (!cumleler.length) return null;
  const capali = cumleler.filter((c) => somutCapaVar(c));
  const oran = capali.length / cumleler.length;
  logFn(`Çapa denetimi: ${capali.length}/${cumleler.length} cümlede gösterilebilir somut bir şey var ` +
    `(%${Math.round(oran * 100)}).`);
  if (oran < 0.6) {
    logFn(`DİKKAT: cümlelerin %${Math.round((1 - oran) * 100)}'i soyut — o anlarda arşivde karşılık ` +
      `yoktur; görseller anlatılanla zayıf eşleşir ve bir kısmı tipografiye döner.`);
  }
  return oran;
}

/**
 * METİNSİZ SENARYO MEDYAYA GEÇMESİN.
 *
 * Ölçüldü (20260809-3d2ca5): model 9 segmentin 9'unu metinsiz döndürdü.
 * Mevcut denetim bunu GÖRDÜ ("Bölüm 2 kısa kaldı 0/107 kelime"), bir kez
 * yeniden istedi, yine 0 geldi — ve iş yine de devam etti. 11 dakika medya
 * arandı, görseller indirildi, denetimden geçirildi ve iş ancak SESLENDİRME
 * aşamasında "Cannot read properties of undefined (reading 'split')" ile
 * çöktü. Harcanan para ve süre tamamen boşa gitti.
 *
 * Anlatımı olmayan bir senaryo video olamaz. Burada, hiçbir şey harcanmadan
 * ve anlaşılır bir mesajla durur.
 */
export function senaryoyuDogrula(script, job = null) {
  const segler = (script?.sections || []).flatMap((s) => s?.segments || []);
  if (!segler.length) throw new Error("Senaryo boş döndü: hiç segment üretilemedi.");
  const bos = segler.filter((s) => String(s?.text || "").trim().length <= 10);
  // TEK BİR metinsiz segment bile yeter. İlk sürümde eşik "yarıdan fazlası
  // dolu olsun"du ve 9 segmentin 3'ü boş geçti: iş medyayı indirdi, sonra
  // seslendirmede çöktü. Sessiz sahne zaten yayınlanamaz.
  if (bos.length) {
    throw new Error(
      `Senaryo eksik döndü: ${segler.length} segmentin ${bos.length} tanesinde anlatım metni yok. ` +
      `Üretim burada durduruldu (medya ve seslendirme için harcama yapılmadı). Lütfen tekrar deneyin.`);
  }
  // SENARYO İSTENEN DİLDE Mİ?
  //
  // Kullanıcı "İngilizce seçtim, Türkçe anlatım çıktı" dedi ve haklıydı: hiçbir
  // yerde bu kontrol edilmiyordu. Yanlış dilde bir senaryo videoya kadar gidip
  // medya + seslendirme + render parası harcandıktan sonra fark ediliyor.
  //
  // Ölçüt harf: ğ ş ı İ Türkçeye özgüdür, İngilizcede hiç geçmez. Metnin
  // %0,5'inden fazlası bu harflerse metin Türkçedir. Özel adlar tek tük
  // Türkçe harf taşıyabileceği için oran eşiği var, varlık kontrolü değil.
  const metinHepsi = segler.map((s) => s.text).join(" ");
  const trHarf = (metinHepsi.match(/[ğşıİĞŞ]/g) || []).length;
  const oran = trHarf / Math.max(1, metinHepsi.length);
  const beklenenTr = (job?.language || "tr") !== "en";
  // ASCII Turkish also occurs in model output. Require several function words
  // and clear dominance over English markers, so isolated names stay valid.
  const words = metinHepsi.toLocaleLowerCase('tr').match(/[\p{L}]+/gu) || [];
  const trWords = new Set(['bu','bir','ve','icin','için','ama','bunun','olarak','olan','degil','değil','ile','gibi','nasil','nasıl','cunku','çünkü','daha','kadar']);
  const enWords = new Set(['the','a','an','and','of','to','in','on','with','for','is','are','was','were','this','that','it','its','not','no','from','by','will','do','does','why','how']);
  const trCount=words.filter(w=>trWords.has(w)).length,enCount=words.filter(w=>enWords.has(w)).length;
  const clearlyTurkish=trCount>=3 && trCount>enCount*1.5 && trCount/Math.max(1,words.length)>.12;
  if (!beklenenTr && (oran > 0.005 || clearlyTurkish)) {
    throw new Error(
      `Senaryo YANLIŞ DİLDE geldi: İngilizce istendi ama metin Türkçe. ` +
      `Üretim burada durduruldu (medya ve seslendirme için harcama yapılmadı). Lütfen tekrar deneyin.`);
  }
  if (beklenenTr && trHarf === 0 && metinHepsi.length > 400) {
    throw new Error(
      `Senaryo YANLIŞ DİLDE geldi: Türkçe istendi ama metinde tek bir Türkçe harf yok. ` +
      `Üretim burada durduruldu (medya ve seslendirme için harcama yapılmadı). Lütfen tekrar deneyin.`);
  }

  // BAŞLIK EKSİKSE KONUDAN DOLDUR. Ölçüldü: model başlığı da farklı bir
  // anahtarla döndürdüğünde video adı ve bölüm adları "undefined" oluyordu —
  // ekrandaki bölüm kartlarına ve SEO paketine kadar sızıyor.
  if (!String(script.title || "").trim() && job?.topic) script.title = String(job.topic).slice(0, 120);
  (script.sections || []).forEach((s, i) => {
    if (!String(s?.title || "").trim()) s.title = bolumBasligiTuret(s, i, job);
  });
  return script;
}

/** Numaralı yer tutucu başlık — hangi dilde olursa olsun. */
const YER_TUTUCU_BASLIK = /^\s*(bölüm|bolum|section|chapter|part|kısım|kisim)\s*\d+\s*$/i;

/** Bir başlık ekranda anlam taşıyor mu? */
export function anlamliBolumBasligi(baslik) {
  const t = String(baslik || "").trim();
  return t.length >= 3 && !YER_TUTUCU_BASLIK.test(t);
}

/**
 * BAŞLIK GELMEDİYSE İÇERİKTEN TÜRET — numara yazma.
 *
 * ÖLÇÜLEN KUSUR (20260814-a46ab2): model bölüm başlıklarını boş döndürdü ve
 * buradaki yedek hepsine `Bölüm 1..5` yazdı. Video İNGİLİZCEYDİ; ekrandaki
 * bölüm kartlarında ve YouTube açıklamasındaki chapter damgalarında Türkçe
 * "Bölüm 1" göründü.
 *
 * Kartın işlevi izleyicinin beynini bir sonraki aşamaya odaklamaktır;
 * "Bölüm 1" bunu yapmaz, yalnızca yer kaplar. Bölümün kendi `goal`/`covers`
 * alanı zaten o bölümün ne anlattığını yazıyor — başlık oradan çıkar.
 * Numaraya ancak ikisi de boşsa düşülür ve o zaman VİDEONUN DİLİNDE yazılır.
 */
export function bolumBasligiTuret(sec, i, job) {
  const kaynak = String(sec?.goal || "").trim() ||
    (Array.isArray(sec?.covers) ? sec.covers[0] : "") || "";
  const temiz = String(kaynak).replace(/\s+/g, " ").trim();
  if (temiz.length >= 3) {
    // İlk cümle/ilk beş kelime: chapter damgası olacağı için kısa kalmalı.
    const ilk = temiz.split(/[.;:!?]/)[0].split(/\s+/).slice(0, 5).join(" ");
    if (ilk.length >= 3) return ilk.slice(0, 60);
  }
  return (job?.language === "tr" ? "Bölüm " : "Part ") + (i + 1);
}

/**
 * REDAKSİYON — bölümler yazıldıktan sonra TEK geçiş.
 *
 * Bölümler paralel çağrılarda yazılıyor; hiçbiri diğerinin metnini görmüyor.
 * Sonuç: aynı olgu farklı kelimelerle tekrar ediliyor (canlı testte bir video
 * amiral hikâyesini iki bölümde anlattı), sayılar bölümler arası sapıyor,
 * Türkçe'de çeviri kokan devrik cümleler kalıyor.
 *
 * Tek bir çağrıda üçü birden düzeltilir — ayrı ayrı çağrı yapmak hem pahalı
 * hem de bir düzeltme diğerini bozabiliyor. SADECE metin değişir; segment
 * sayısı, visuals ve emphasis alanlarına dokunulmaz (render zaman çizelgesi
 * onlara bağlı).
 */
export async function redaksiyon(job, script, usage, logFn, requestJSON = callJSON, isCancelled = () => false) {
  if (isCancelled()) throw new Error('cancelled');
  if (job.demo) return script;
  const segler = [];
  script.sections.forEach((sec, si) =>
    sec.segments.forEach((seg, gi) => segler.push({ id: `${si}.${gi}`, text: seg.text })));
  if (segler.length < 2) return script;

  const english = job.language === 'en';
  logFn(`Redaksiyon: tekrar, sayı tutarlılığı ve ${english ? 'İngilizce' : 'Türkçe'} kontrolü...`);
  const SEMA = {
    type: "object",
    properties: {
      duzeltmeler: {
        type: "array",
        description: "SADECE değiştirilmesi gereken segmentler. Sorunsuz olanları LİSTELEME.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Segment kimliği (verilen listeden birebir)" },
            yeni: { type: "string", description: "Düzeltilmiş metin — kelime sayısı yaklaşık aynı kalsın" },
            neden: { type: "string", enum: ["tekrar", "sayi", "dil"] },
          },
          required: ["id", "yeni", "neden"],
          additionalProperties: false,
        },
      },
    },
    required: ["duzeltmeler"],
    additionalProperties: false,
  };

  try {
    const out = await requestJSON({
      system:
        (english ? `You proofread English video narration. Keep every correction in English. Do not translate the narration. ` : `Sen Türkçe video metinlerini son okumadan geçiren bir redaktörsün. `) +
        `Metnin tonunu ve uzunluğunu KORUYARAK sadece kusurları düzeltirsin.`,
      user: [
        `Aşağıda bir videonun tüm seslendirme segmentleri sırayla veriliyor.`,
        `Üç şeyi ara ve SADECE bulduklarını düzelt:`,
        `1) TEKRAR: aynı olgu/olay/sayı birden fazla segmentte anlatılmış.`,
        `   Sonrakini kısalt ya da farklı bir açıya çevir; ilkini bırak.`,
        `2) SAYI TUTARSIZLIĞI: aynı büyüklük farklı segmentlerde farklı verilmiş.`,
        `   Bu geçişte kaynak kaydı yok: hangi sayının doğru olduğunu TAHMİN ETME. Sayıları koru, tutarsızlığı kesinlik iddiasına dönüştürme.`,
        english
          ? `3) LANGUAGE: correct awkward phrasing and repetitive wording in natural spoken English. Do not translate to another language.`
          : `3) DİL: devrik cümle, çeviri kokan yapı, "-mekte/-makta" yığılması ve tekrarları doğal konuşma Türkçesiyle düzelt.`,
        ``,
        `KURALLAR:`,
        `- Sorunsuz segmentleri LİSTELEME. Düzeltme yoksa boş dizi dön.`,
        `- Kelime sayısını yaklaşık koru (±%15) — seslendirme süresi buna bağlı.`,
        `- Olguları DEĞİŞTİRME, sadece ifadeyi düzelt.`,
        ``,
        `SEGMENTLER:`,
        ...segler.map((s) => `[${s.id}] ${s.text}`),
      ].join("\n"),
      schema: SEMA,
      maxTokens: 16000,
      usage,
      logFn,
    });

    const harita = new Map((out.duzeltmeler || []).map((d) => [String(d.id), d]));
    if (isCancelled()) throw new Error('cancelled');
    if (!harita.size) { logFn("Redaksiyon: düzeltilecek bir şey bulunmadı."); return script; }

    let uygulanan = 0;
    const sayac = { tekrar: 0, sayi: 0, dil: 0 };
    script.sections.forEach((sec, si) =>
      sec.segments.forEach((seg, gi) => {
        const d = harita.get(`${si}.${gi}`);
        if (!d?.yeni) return;
        // Uzunluk sapması büyükse UYGULAMA — süre hesabı ve altyazı bozulur
        const oran = d.yeni.split(/\s+/).length / Math.max(1, seg.text.split(/\s+/).length);
        if (oran < 0.7 || oran > 1.35) return;
        const numbers = text => JSON.stringify(String(text).match(/\d+(?:[.,]\d+)*/g)||[]);
        if(numbers(d.yeni)!==numbers(seg.text)) {
          logFn(`Redaksiyon: ${si}.${gi} düzeltmesi sayısal bilgiyi değiştirdi; özgün metin korundu.`);
          return;
        }
        try {
          senaryoyuDogrula({sections:[{segments:[{text:d.yeni}]}]},job);
        } catch {
          logFn(`Redaksiyon: ${si}.${gi} düzeltmesi dil/metin kontrolünü geçmedi; özgün metin korundu.`);
          return;
        }
        seg.text = d.yeni.trim();
        uygulanan++; sayac[d.neden] = (sayac[d.neden] || 0) + 1;
      }));
    logFn(`Redaksiyon: ${uygulanan} segment düzeltildi (tekrar ${sayac.tekrar}, sayı ${sayac.sayi}, dil ${sayac.dil}).`);
  } catch (e) {
    if (isCancelled() || e.message === 'cancelled') throw new Error('cancelled');
    // Redaksiyon lüks bir adım; patlarsa videoyu düşürme
    logFn(`Redaksiyon atlandı: ${String(e.message).slice(0, 120)}`);
  }
  return script;
}

/** Model çıktısını güvene al: visuals dizisi dolu, emphasis tutarlı olsun. */
/**
 * MODELİN DÖNDÜRDÜĞÜ NESNEDEN DİZİYİ BUL — anahtar adına güvenmeden.
 *
 * Bu hesapta yapılandırılmış çıktı zorlanmıyor (llm.js structuredOutputsBroken).
 * Model şemayı okuyup içeriği doğru üretse bile dış anahtarı kendince
 * adlandırabiliyor. Aynı gün üç ayrı yerde görüldü: "sections" undefined gelip
 * gerçek bir işi çökertti, "duzeltmeler" yerine "queries" geldi ve 19 düzeltme
 * sessizce düştü, "sonuclar" yerine düz dizi geldi.
 *
 * Önce beklenen adlar denenir; bulunamazsa nesnedeki İLK dizi alınır.
 */
export function diziBul(nesne, ...adlar) {
  if (Array.isArray(nesne)) return nesne;
  if (!nesne || typeof nesne !== "object") return [];
  for (const a of adlar) if (Array.isArray(nesne[a])) return nesne[a];
  return Object.values(nesne).find((v) => Array.isArray(v)) || [];
}

export function normalizeSegments(segments, beats = 1) {
  return (segments || []).map((seg) => {
    let visuals = Array.isArray(seg.visuals) ? seg.visuals.filter((v) => v && v.query) : [];
    if (!visuals.length && seg.visual?.query) visuals = [seg.visual]; // eski şema uyumu
    if (!visuals.length) visuals = [{ query: "abstract background", type: "video", kind: "generic", prompt: "" }];
    visuals = visuals.slice(0, Math.max(1, beats)).map((v) => ({
      query: v.query,
      // AI istenmiş ama prompt boşsa stok videoya düş
      type: v.type === "ai" && !(v.prompt || "").trim() ? "video" : v.type || "image",
      kind: v.kind || "generic",
      prompt: (v.prompt || "").trim(),
      // Vekil sorgular: model vermezse boş dizi — arama tarafı zaten kısaltma
      // yoluna düşüyor. Asıl sorguyla aynı olanlar ve çöp kısa dizgeler atılır.
      vekil: (Array.isArray(v.vekil) ? v.vekil : [])
        .map((x) => String(x || "").trim())
        .filter((x) => x.length > 2 && x.toLowerCase() !== String(v.query || "").toLowerCase())
        .slice(0, 2),
    }));
    const e = seg.emphasis || {};
    let emphasis = { type: "none", value: "", label: "", items: [] };
    if (e.type === "stat" && e.value) emphasis = { type: "stat", value: e.value, label: e.label || "", items: [] };
    else if (e.type === "keyword" && e.value) emphasis = { type: "keyword", value: e.value, label: "", items: [] };
    else if (e.type === "compare" && Array.isArray(e.items) && e.items.length >= 2) {
      const items = e.items.filter((it) => it && it.label && isFinite(+it.value)).slice(0, 4);
      if (items.length >= 2) emphasis = { type: "compare", value: "", label: "", items };
    }
    // ALAN ADI DA DEĞİŞEBİLİYOR — sarmalayıcı adı gibi.
    // Ölçüldü (20260809-3d2ca5): 9 segmentin 9'u metinsiz geldi, iş ses
    // aşamasına kadar ilerledi ve orada çöktü — medya için harcanan 11 dakika
    // ve para boşa gitti. Anlatım metni birkaç makul ad altında aranır.
    const metin = String(seg.text ?? seg.narration ?? seg.metin ?? seg.anlatim ?? seg.content ?? "").trim();
    return { text: metin, visuals, emphasis };
  });
}

/**
 * YENİ GÖRSEL AÇILARI — arşivde karşılığı çıkmayan sahneler için son çare.
 *
 * Boru hattı önce sorguyu kısaltıyor, sonra senaryodaki vekil sorguları
 * deniyor. İkisi de tutmazsa sahne düz zemine düşüyordu. Burada modele
 * SORUN YAŞAYAN sahneler toplu hâlde verilip yeni arama açıları isteniyor —
 * model artık neyin bulunamadığını da biliyor, ilk turdan daha iyi tahmin eder.
 *
 * TEK ÇAĞRI: sahne başına sormak hem pahalı hem tutarsız olurdu.
 *
 * @param sorunlular [{beatId, metin, sorgu, gorunen}]
 * @returns {beatId: [q1, q2]}
 */
export async function yeniGorselAcilari(job, sorunlular, usage, logFn) {
  if (!sorunlular?.length || job.demo) return {};
  const SEMA = {
    type: "object",
    properties: {
      sahneler: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Sahnenin beatId değeri, verildiği gibi" },
            sorgular: {
              type: "array", items: { type: "string" },
              description: "2 yeni İNGİLİZCE arama sorgusu",
            },
          },
          required: ["id", "sorgular"],
        },
      },
    },
    required: ["sahneler"],
  };

  const liste = sorunlular.slice(0, 24).map((s) =>
    `- id: ${s.beatId}\n  anlatım: "${String(s.metin || "").slice(0, 150)}"\n` +
    `  denenen sorgu: "${s.sorgu}"` +
    (s.gorunen ? `\n  gelen görsel şuydu (YANLIŞ): "${s.gorunen}"` : "")).join("\n");

  const out = await callJSON({
    system:
      `Sen bir belgesel yapımında arşiv araştırmacısısın. Aşağıdaki sahneler için ` +
      `aranan görseller ARŞİVDE BULUNAMADI ya da alakasız çıktı.\n\n` +
      `Görevin: her sahne için 2 YENİ İngilizce arama sorgusu yazmak.\n\n` +
      `KURALLAR:\n` +
      `- Aynı şeyi eşanlamlıyla tekrar SORMA. Denenen sorgu zaten başarısız oldu.\n` +
      `- BAŞKA BİR AÇI bul. KİŞİ ise şu sırayla dene — üsttekiler serbest arşivde bol:\n` +
      `  1) heykel/büst/anıt  2) eski gravür/tablo (tarihî eser; lisansı ayrıca doğrulanmalı)\n` +
      `  3) mezar/plaket/müze  4) evi/kasabası  5) dönemin nesnesi, coğrafya\n` +
      `- Serbest lisanslı arşivlerde (Wikimedia, Europeana, NASA) GERÇEKTEN bulunma\n` +
      `  ihtimali yüksek şeyler iste. Yakın dönem ünlülerin fotoğrafı genelde telifli\n` +
      `  ve arşivde YOKTUR — onun yerine çevresini iste.\n` +
      // ŞİRKET / ÜRÜN / CİHAZ — ölçülen en büyük ikinci kusur kümesi.
      //
      // 20260815-07e514'te havuzu tamamen boş kalan sahnelerin çoğu buydu:
      // "Illumina NovaSeq X sequencer" (gelen: yanıp sönen ampuller),
      // "AstraZeneca headquarters Cambridge building" (jenerik cephe),
      // "Regeneron Tarrytown New York headquarters" (kurumsal etkinlik),
      // "Loudoun County Virginia data centers aerial" (basın toplantısı).
      // Ücretsiz arşivde bu kurumların ve cihazların fotoğrafı YOK ve olmayacak.
      // Marka adını atıp NESNENİN KENDİSİNİ istemek işe yarıyor.
      `- ŞİRKET, ÜRÜN ya da CİHAZ adı geçiyorsa MARKA ADINI AT, nesnenin kendisini\n` +
      `  iste. Serbest arşivde marka yoktur, ama o türden bir makine/bina vardır:\n` +
      `  "Illumina NovaSeq X sequencer" -> ["DNA sequencing machine laboratory",\n` +
      `  "genomics laboratory equipment"]\n` +
      `  "AstraZeneca headquarters Cambridge" -> ["modern pharmaceutical research campus",\n` +
      `  "glass laboratory building exterior"]\n` +
      `  "Loudoun County data centers aerial" -> ["data center server hall",\n` +
      `  "server racks rows datacenter"]\n` +
      // SOYUT SORGU — kelimeleri her şeye uyan, hiçbir şeyi göstermeyen sorgular.
      // Ölçüldü: "scientific paper printed page" (en iyi aday 0), "skyscraper
      // business district" (1), "signing insurance contract pen" (1). Havuz doluydu
      // ama hiçbiri anlatılanı göstermiyordu, çünkü sorgu bir SAHNE tarif etmiyor.
      `- SORGU SOYUTSA somut, çekilebilir bir sahneye çevir. "scientific paper\n` +
      `  printed page" gibi bir sorgu her şeye uyar, hiçbir şeyi göstermez.\n` +
      `  Anlatımdaki asıl olayı kim/nerede/ne yapıyor olarak sor:\n` +
      `  "scientific paper printed page" -> ["researcher reading journal desk",\n` +
      `  "university library reading room"]\n` +
      `- 2-4 kelime, spesifik, İngilizce.\n\n` +
      `Örnek: "Bulgarian mystic blind woman 1970s" bulunamadıysa →\n` +
      `["Rupite Bulgaria village", "Petrich Bulgaria town"]`,
    user: `Sorunlu sahneler:\n${liste}\n\n` +
      `Tam olarak şu biçimde döndür:\n` +
      `{"sahneler":[{"id":"<verilen id>","sorgular":["<yeni sorgu 1>","<yeni sorgu 2>"]}, ...]}\n` +
      `Her sahne için bir kayıt olmalı.`,
    schema: SEMA, maxTokens: 4000, usage, logFn,
  });

  const kayitlar = Array.isArray(out) ? out : (out?.sahneler || []);
  const acilar = {};
  const gecerli = new Set(sorunlular.map((s) => s.beatId));
  for (const k of kayitlar) {
    if (!gecerli.has(k?.id)) continue;
    const q = (Array.isArray(k.sorgular) ? k.sorgular : [])
      .map((x) => String(x || "").trim())
      .filter((x) => x.length > 2)
      .slice(0, 2);
    if (q.length) acilar[k.id] = q;
  }
  return acilar;
}

/**
 * SORGU ONARIMI — sorgu, ait olduğu CÜMLEDEKİ şeyi adıyla istemeli.
 *
 * NEDEN VAR. Bitmiş videoda kare kare ölçüldü (20260809-a4daff): 20 sahnenin
 * 14'ü o anda söylenen şeyi gösteriyordu, 6'sı göstermiyordu. Altısının da
 * sebebi AYNI ve seçim aşamasında değil: senaryo o cümle için zaten yanlış
 * şeyi istemişti.
 *
 *   cümle "1942'de Dimitar Gushterov ile evlendi"  -> sorgu "Petrich town 1940s"
 *   cümle "Arnavut devlet ajansı ATA bile kapıldı" -> sorgu "news agency wire"
 *   cümle "ne imzalı tek sayfa bıraktı"            -> sorgu "old house"
 *
 * Kesme doğru anda, görsel doğru sahnede — ama istenen şey cümleyle ilgisiz.
 * Bu geçiş, cümlesinde karşılığı olmayan sorguları modele yeniden yazdırıyor.
 *
 * Ucuz: iş başına tek çağrı, yalnızca SORUNLU sorgular gönderilir. Hiç sorunlu
 * yoksa çağrı bile yapılmaz.
 */

// Cümle ile sorgunun paylaşabileceği tek şey: ÖZEL ADLAR ve YILLAR.
// (Anlatım Türkçe, sorgular İngilizce.) Türkçe harfler ASCII'ye indirilir ki
// "Petriç" ile "Petrich" eşleşsin — ölçülmüş bir tuzak.
const TR_ASCII_S = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const asciileS = (s) => String(s).toLowerCase().replace(/[çğıöşüâîû]/g, (c) => TR_ASCII_S[c] || c);

function ozelAdKokleri(metin, ilkKelimeAtla = false) {
  const out = new Set();
  const parcalar = String(metin || "").split(/[^\wçğıöşüâîûÇĞİÖŞÜ]+/).filter(Boolean);
  const kesmeliBas = /^[A-ZÇĞİÖŞÜ][\wçğıöşüâîû]*'/.test(String(metin || "").trimStart());
  parcalar.forEach((ham, i) => {
    if (/^\d{3,4}$/.test(ham)) { out.add(ham); return; }
    if (ilkKelimeAtla && i === 0 && !kesmeliBas) return;
    if (ham.length < 4 || !/^[A-ZÇĞİÖŞÜ]/.test(ham)) return;
    out.add(asciileS(ham.split("'")[0]).slice(0, 6));
  });
  return out;
}

function kokOrtusuyor(a, b) {
  for (const x of a) for (const y of b) if (x.startsWith(y) || y.startsWith(x)) return true;
  return false;
}

/** Segmentin cümleleri — script.js içinde bağımsız, hafif bölme. */
function segmentCumleleri(metin) {
  return String(metin || "").split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => s.length > 12);
}

const ONARIM_SEMA = {
  type: "object",
  properties: {
    duzeltmeler: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Onarılacak sorgunun kimliği (verilen listeden)" },
          query: { type: "string", description: "Yeni İngilizce arama sorgusu" },
        },
        required: ["id", "query"],
      },
    },
  },
  required: ["duzeltmeler"],
};

export async function sorgulariOnar(job, script, usage, logFn = () => {}) {
  const sorunlu = [];
  for (let si = 0; si < script.sections.length; si++) {
    const sec = script.sections[si];
    for (let gi = 0; gi < sec.segments.length; gi++) {
      const seg = sec.segments[gi];
      const cumleler = segmentCumleleri(seg.text);
      if (!cumleler.length) continue;
      const cumleKok = cumleler.map((c) => ozelAdKokleri(c, true));
      (seg.visuals || []).forEach((v, vi) => {
        if (!v?.query) return;
        const qk = ozelAdKokleri(v.query);
        // Sorgunun bu segmentteki HERHANGİ bir cümleyle ortak özel adı var mı?
        if (cumleKok.some((ck) => kokOrtusuyor(ck, qk))) return;
        // Yoksa: bu sorgu segmentteki hiçbir şeyi adıyla istemiyor.
        // Hangi cümleye ait olduğu sırayla tahmin edilir.
        const kendi = cumleler[Math.min(vi, cumleler.length - 1)];
        sorunlu.push({ id: `${si}.${gi}.${vi}`, si, gi, vi, cumle: kendi, eski: v.query });
      });
    }
  }
  if (!sorunlu.length) { logFn("Sorgu denetimi: tüm görsel sorguları anlatımdaki bir şeyi adıyla istiyor."); return script; }

  logFn(`Sorgu denetimi: ${sorunlu.length} sorgu anlattığı cümledeki hiçbir şeyi adıyla istemiyor — yeniden yazılıyor...`);
  const liste = sorunlu.map((s) =>
    `${s.id}\n  CÜMLE: ${s.cumle}\n  MEVCUT SORGU: ${s.eski}`).join("\n\n");
  try {
    const out = await callJSON({
      system:
`Sen bir belgesel yapımında görsel araştırmacısısın.
Sana Türkçe anlatım cümleleri ve onlar için yazılmış İngilizce arama sorguları veriliyor.
Sorun: mevcut sorgular cümledeki HİÇBİR ŞEYİ ADIYLA istemiyor, kavramın jenerik
resmini istiyor. İzleyici cümleyi duyup ekranda alakasız bir şey görüyor.

Her sorguyu YENİDEN YAZ. Kural tek:
SORGU, O CÜMLEDE GEÇEN SOMUT BİR ŞEYİ ADIYLA İSTEMELİ —
kişi adı, yer adı, kurum adı, eser adı, olay adı ya da yıl.

Gerçek örnekler (ölçülmüş hatalar ve doğrusu):
  CÜMLE: "1942'de Dimitar Gushterov ile evlendi."
    kötü: "Petrich town 1940s"        iyi: "Dimitar Gushterov 1942 wedding photograph"
  CÜMLE: "Arnavut devlet ajansı ATA bile bu akıma kapıldı."
    kötü: "news agency wire service"  iyi: "Albanian Telegraphic Agency ATA Tirana"
  CÜMLE: "Zemun'daki körler okuluna verildi."
    kötü: "blind woman hands braille" iyi: "Zemun school for the blind Belgrade 1920s"

Cümlede hiç özel ad yoksa, cümlenin anlattığı SOMUT OLAYI/NESNEYİ tarif et;
soyut kavram ("umut", "kader", "gizem") arama sorgusu olamaz.
Sorgular İngilizce, 3-6 kelime, tırnaksız.`,
      user: `Şu sorguları yeniden yaz:\n\n${liste}\n\n` +
        `Her biri için id ve yeni query dondur.`,
      schema: ONARIM_SEMA,
      usage,
      maxTokens: 2000,
    });
    // SARMALAYICI ADINA GÜVENME. Bu hesapta yapılandırılmış çıktı zorlanmıyor;
    // model şemayı okuyup içeriği doğru üretse bile dış anahtarı kendince
    // adlandırabiliyor. Ölçüldü: id'ler birebir doğruydu ama liste
    // "duzeltmeler" yerine "queries" altında geldi ve 19 düzeltmenin 19'u
    // sessizce düştü. Diziyi nerede olursa olsun bul.
    const dizi = diziBul(out, "duzeltmeler", "queries", "corrections", "results");
    const harita = new Map(dizi
      .filter((d) => d && (d.id ?? d.no) != null)
      .map((d) => [String(d.id ?? d.no), String(d.query || d.sorgu || d.yeni || "").trim()]));
    let uygulanan = 0;
    for (const s of sorunlu) {
      const yeni = harita.get(s.id);
      if (!yeni || yeni.length < 4) continue;
      const v = script.sections[s.si]?.segments[s.gi]?.visuals?.[s.vi];
      if (!v) continue;
      v.query = yeni.slice(0, 90);
      uygulanan++;
    }
    logFn(`Sorgu denetimi: ${uygulanan}/${sorunlu.length} sorgu anlatılan şeyin adını taşıyacak şekilde düzeltildi.`);
  } catch (e) {
    // Onarım lüks bir adım; patlarsa videoyu düşürme.
    logFn(`Sorgu onarımı atlandı: ${String(e.message).slice(0, 100)}`);
  }
  return script;
}

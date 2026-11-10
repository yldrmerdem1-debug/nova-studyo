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
import { bibleGrowthLines, editGrowthLines, endGrowthLines, hookGrowthLines, middleGrowthLines, nicheOf, voiceGrowthLines, voiceStyleOf, backstageLines, spokenFix, roundAboutScene, honestyLines, spineLines } from "./growth-lessons.js";
import { readJson, writeJson, DATA_DIR } from "../util.js";
import { hookCandidates, hookPromptLines, hookById, readHookHistory, recordHook } from "./docu-hooks.js";
import { editorialPass, removeScenes, trimToWords } from "./docu-editor-pass.js";
import { scriptLint, stripLeakSentences, stripHookPreamble, hookContext } from "./docu-lint.js";
import { reviewPlan } from "./docu-plan-editor.js";
import { likeAskLines, readRhetoricHistory, recordRhetoric, rhetoricLines, rhetoricPlan, sensitiveTopic } from "./docu-rhetoric.js";
import { catalogQueries, commonsCatalogFor, catalogPromptBlock } from "./docu-commons-catalog.js";
import { numbersIn, spokenHas } from "./docu-edit-director.js";

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
export const DOCU_PROMPT_VERSION = "docu-writer-4";
/** Bölüm bu oranın altında kalırsa "N kelime daha ekle" ile geri çevrilir. */
const MIN_CHAPTER_RATIO = 0.9;
/** Toplam bu oranın altındaysa en kısa bölümler uzatılır. */
const EXTEND_BELOW = 0.97;
/**
 * ÜST SINIR (Fransa borcu, 24 Ekim 2026): senaryo 1997/1798 kelimeyle (~15,6 dk) geldi; kılavuz "Target 11-13 minutes",
 * kurgu karnesi "süre 14.9 dk (hedef 11-14)" dedi ve render başladı, video 14:55 çıktı. Kısa senaryo uzatılıyordu, uzunu
 * hiçbir adım kısaltmıyordu.
 * 25 Ekim denetimi: kırpma hedefi planın %105'iydi (1888 kelime) — o işin gerçek temposunda (1997 kelime → 895 sn film)
 * ~14,1 dk, hem kılavuzun hem karnenin üstünde; kırpmayı da yalnızca modelin uyması taşıyordu. Tavan artık DAKİKADAN
 * gelir (lengthLimits): kılavuzun üst sınırı, yoksa planın süresi + payı + %5; ölçülen film temposuyla kelimeye çevrilir.
 * Son okumadan sonra hâlâ TRIM_SLACK'ten uzunsa kod en zayıf satırları çıkarır (docu-editor-pass.js trimToWords).
 */
const PLAN_MAX = 1.05;
const TRIM_SLACK = 1.05;
/**
 * Ölçülen FİLM temposu (kelime/dk): VOICE_SPEED 1.1 okuma, en çok 1.15x sıkılaştırma (docu-engine/lib/pace.mjs), bölüm
 * kartları, nefesler ve tutuşlar dahil. en, 1.16.16 tempo kuralından sonra: Fransa borcu 1997 kelime / 14:55 = 134,
 * Hürmüz 1998 / 13:45 = 145, Fransa isyanları 1986 / 13:49 = 144, Kartal Yuvası 1855 / 12:47 = 145. Sesi ölçülmemiş işte
 * tavan en YAVAŞ sesle de tutmalı: 134 (ölçülen kanal sesleri DOCU_STYLE_WPM). tr henüz ölçülmedi: planın hızı.
 */
export const DOCU_FILM_WPM = { tr: DOCU_WPM.tr, en: 134 };

/**
 * GÖRSEL DİL KONU TAŞIMAZ (26 Ekim 2026, 2009 denizaltı çarpışması, 20261024-373aaf). visualStyle her AI isteğine
 * eklenir; yazar "…documentary photograph of North Atlantic nuclear submarines and their bases, cold steel-grey…"
 * yazdı ve "Whitehall'da taş bir hükümet binası" istemi denizaltı üssü çizdi (WHITEHALL etiketi altında), AI kareleri
 * birbirinin aynısı denizaltı siluetlerine döndü. "photograph/photo/footage/image of …" konusu cümleden atılır;
 * ışık, lens, renk, doku kalır. Yalnızca yeni yazılan senaryoya uygulanır (eski işlerin görsel önbelleği bozulmaz).
 */
export function lookOnly(style) {
  const s = String(style || "").trim();
  if (!s) return s;
  return s
    .replace(/\b(photographs?|photos?|photography|images?|stills?|footage|pictures?|shots?)\s+(?:of|showing|depicting|featuring)\s+[^,.;:]+/gi, "$1")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * GÖRSEL DİL KARANLIK DEĞİL (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: son 7 videoda ortalama
 * parlaklık 52-75, doygunluk 2,5-7,5, karelerin %21-39'u parlaklık 40'ın altında; kanal sahibi "her video siyah,
 * karanlık, aynı" dedi; en iyi video Panama doğal renkte 88/10,2). visualStyle her AI isteğine eklenir: "deep shadows",
 * "low-key", "noir", "moody", "harsh flash against black", "green-black" her kareyi karartıyordu. Bu kelimeler planda
 * kodla atılır (yalnızca yeni plan: kayıtlı planın görsel önbelleği bozulmaz); motor istek metnini ayrıca temizler.
 */
export const LOOK_FORBIDDEN = [
  { label: "deep shadows", re: /\bdeep\s+(?:black\s+)?shadows?\b/i },
  { label: "low-key", re: /\blow[- ]key\b/i },
  { label: "noir", re: /\bnoir\b/i },
  { label: "moody", re: /\bmood(?:y|ily)\b/i },
  { label: "harsh … against … black", re: /\bharsh\b[^,.;]*\bagainst\b[^,.;]*\bblack\b/i },
  { label: "green-black", re: /\bgreen[- ]black\b/i },
  { label: "crushed blacks", re: /\bcrushed\s+blacks?\b/i },
  { label: "underexposed", re: /\bunder-?exposed\b/i },
];
/** The forbidden dark-look phrases a visualStyle carries (labels of LOOK_FORBIDDEN), [] when it is clean. */
export function darkLookWords(style) {
  const s = String(style || "");
  return LOOK_FORBIDDEN.filter((f) => f.re.test(s)).map((f) => f.label);
}
/** Single dark adjectives: taken out of the head clause ("Moody noir documentary photograph" keeps "documentary photograph"). */
const LOOK_ADJ = /\s*\b(?:mood(?:y|ily)|noir|low[- ]key|green[- ]black|under-?exposed)\b\s*/gi;
/**
 * visualStyle without its dark-look phrases: every clause (between commas/semicolons) that carries one goes, the head
 * clause of the first sentence only loses the words (it names the medium). Everything else stays word for word.
 */
export function brightLook(style) {
  const s = String(style || "").trim();
  if (!darkLookWords(s).length) return s;
  const bad = (c) => LOOK_FORBIDDEN.some((f) => f.re.test(c));
  const out = s.split(/(?<=\.)\s+/).map((sentence, si) => {
    const end = /\.$/.test(sentence) ? "." : "";
    const clauses = (end ? sentence.slice(0, -1) : sentence).split(/\s*[,;]\s*/);
    const kept = clauses.map((c, ci) => (si === 0 && ci === 0 && bad(c) ? c.replace(LOOK_ADJ, " ").replace(/\s{2,}/g, " ").trim() : c)).filter((c) => c && !bad(c));
    if (kept.length && si === 0) kept[0] = kept[0].replace(/^\p{Ll}/u, (ch) => ch.toUpperCase());
    return kept.length ? `${kept.join(", ")}${end}` : "";
  });
  return out.filter(Boolean).join(" ").trim();
}

/*
 * KARANLIK İSTEM ORANI (aynı ölçüm, 29 Ekim 2026): görsel istemlerin çoğu "at night", "dimly lit", "in shadow",
 * "silhouette" diyordu, anlatım geceyi söylemediği hâlde. İstem karanlık sayılır: koyu ışık kelimesi taşıyorsa ve
 * sahnenin anlatımı gece/akşam/karanlık demiyorsa ("dark suit", "dark hull" gibi renk adları sayılmaz).
 */
const DARK_PROMPT = /\b(?:dark(?!\s+(?:suits?|uniforms?|coats?|raincoats?|jackets?|blazers?|dress(?:es)?|hair(?:ed)?|skin(?:ned)?|eyes|wood(?:en)?|navy|blue|green|red|gr[ae]y|brown|hull|ink|paint(?:ed)?)\b)|darkness|darkened|dim(?:ly)?(?:[- ]lit)?|shadow(?:s|y|ed)?|low[- ]key|noir|moody|gloom(?:y)?|murky|pitch[- ]black|unlit|night(?:time)?|midnight|dusk|twilight|silhouett\w*|candle-?lit)\b/i;
const NIGHT_SAID = /(?<![\p{L}\p{N}])(?:night|nights|tonight|midnight|evening|dusk|dark|darkness|blackout|sunset|gece|akşam|karanlık|gün batımı|alacakaranlık)/iu;
const SILHOUETTE = /silhouett|siluet|silüet/i;
/** Over this share of a chapter's image prompts dark (and the narration not saying so), the chapter is rewritten. */
export const DARK_PROMPT_SHARE = 0.3;
/** Silhouettes per video (the real-person rule asks for backs and distance, not silhouettes). */
export const SILHOUETTE_CAP = 5;
/** Light of the image prompts: how many, which are dark without the narration saying so, how many silhouettes. */
export function promptLight(scenes = []) {
  const out = { total: 0, dark: [], silhouettes: 0, share: 0 };
  scenes.forEach((s, i) => {
    if (!s || s.chapterCard) return;
    const said = NIGHT_SAID.test(stripTags(s.say));
    const extra = Array.isArray(s.imagePrompts) ? s.imagePrompts.map((p) => (typeof p === "string" ? p : p?.prompt)) : [];
    for (const p of [s.imagePrompt, ...extra]) {
      if (typeof p !== "string" || !p.trim()) continue;
      out.total++;
      if (SILHOUETTE.test(p)) out.silhouettes++;
      if (!said && DARK_PROMPT.test(p)) out.dark.push({ scene: i, prompt: p });
    }
  });
  out.share = out.total ? out.dark.length / out.total : 0;
  return out;
}
/** Writer errors for one chapter's prompts: more than 30 % dark (at least 4 prompts), or more than `silhouettes`. */
export function promptLightErrors(scenes = [], { chapter = null, silhouettes = 2 } = {}) {
  const l = promptLight(scenes);
  const where = chapter == null ? "" : `bölüm ${chapter + 1}: `;
  const errors = [];
  if (l.total >= 4 && l.share > DARK_PROMPT_SHARE) {
    errors.push(`${where}görsel istemlerin %${Math.round(l.share * 100)}'i karanlık (gece/loş/gölge/silüet) ama anlatım bunu söylemiyor — en az %60'ı gün ışığında ya da aydınlık iç mekânda, iyi pozlanmış ve doğal renkli olsun; şunları sahnenin gerçek saatinin ışığıyla yeniden yaz: ${l.dark.slice(0, 4).map((d) => `#${d.scene + 1} "${d.prompt.slice(0, 70)}"`).join("; ")}`);
  }
  if (l.silhouettes > silhouettes) errors.push(`${where}${l.silhouettes} silüet istemi (en çok ${silhouettes}): gerçek kişiyi arkadan ya da uzaktan, ellerinden ya da mekânından göster`);
  return errors;
}
/**
 * KANAL SESİNİN KENDİ TEMPOSU (25 Ekim 2026 gözden geçirme): tek tavan en yavaş sesle (finans, 134) hesaplanınca Kartal
 * Yuvası (gündem 20261024-950730: 1855 kelime = 12:47, "Target 11-13 minutes" içinde) 1742'ye kırpılacaktı. Tempo sesin ve
 * stilin ölçüsü; stil işten belli (docuFormat news → gündem sesi, docuGenre epic/finance → tarih/finans sesi; ayarlar
 * docuStyleVoices). Her stilin EN YAVAŞ ölçümü (job.log "tahmini süre" + docu-script.json konuşulan kelime, karnenin sayımı):
 *   news    Hürmüz 8a1eca 1998/825,1 sn = 145 · Fransa isyanları 37f9d2 1986/829,2 = 144 · Ebola 1e3f09 2019/855,9 = 142 ·
 *           Kartal Yuvası 950730 1855/766,7 = 145 → 142
 *   epic    denizaltı 373aaf 1972/837,6 = 141
 *   finance Fransa borcu 48ae2d 1997/895,3 = 134
 * Ölçülmemiş stil (belgesel, suç, bilim, geri sayım…), kanal sesi dışında bir ses ya da tr: DOCU_FILM_WPM (en yavaş ölçülen).
 */
export const DOCU_STYLE_WPM = { news: 142, epic: 141, finance: 134 };
const PACE_OF = { news: "gündem sesi", epic: "tarih sesi", finance: "finans sesi" };
/** İşin kanal sesi (ayarlar docuStyleVoices anahtarı): gündem → news, epik tarih → epic, finans → finance; yoksa null. */
export function voiceStyleKey(job = {}) {
  if (job.docuFormat === "news") return "news";
  return job.docuFormat !== "ranking" && ["epic", "finance"].includes(job.docuGenre) ? job.docuGenre : null;
}
/** Film temposunun ölçüldüğü okuma hızı (ayarlar docuVoiceSpeed). */
const MEASURED_VOICE_SPEED = 1.1;
/** Kurgu karnesinin süre tavanı (docu-engine/lib/edit-scorecard.mjs SCORE_TARGETS.maxMinutes ile aynı). */
export const SCORECARD_MAX_MIN = 14;
/**
 * UZUN VİDEO TABANI (kanal kuralı: "≥ ~1.700 kelime, asla 10 dk altı"): 10 dk ve üstü video ~1.700 kelimenin altına
 * kırpılmaz (en; ölçülen en hızlı tempoda, 145 kelime/dk, 11,7 dk). tr aynı süre, planın hızıyla. Planı geçmez: 10 dk'lık
 * istek kendi planıyla tabandır.
 */
export const LONG_FLOOR = { minutes: 10, words: 1700 };
/** Kırpılan senaryo ücretli adım kapısında (docu.js assertLongEnough) "kısa" kalmasın: tahminin bu payla üstünde. */
const GATE_MARGIN = 1.03;

/** Kılavuzdaki süre aralığı: "Target 11-13 minutes" → {min: 11, max: 13}, "under 14 min" → {min: 0, max: 14}. Tek sayı ("12-minute", "12+ minutes", "3 dakika 44 saniye") ve bir parçanın süresi ("the first 1-2 minutes", "2-3 minutes per chapter") üst sınır değildir → null. */
export function guidanceMinutes(guidance) {
  const t = String(guidance || "");
  const unit = String.raw`\s*(?:min(?:ute)?s?\b|dk\b|dakika)`;
  // Bir PARÇANIN süresi videonun süresi değildir ("the first 1-2 minutes", "2-3 minutes per chapter", "keep the hook under
  // 1 min"): tavan sanılırsa 12 dk'lık senaryo uzun video tabanına kırpılırdı. Atlanır, sıradaki aralığa bakılır.
  const whole = (m) => !PART_BEFORE.test(t.slice(0, m.index)) && !PART_AFTER.test(t.slice(m.index + m[0].length));
  for (const r of t.matchAll(new RegExp(String.raw`\b(\d{1,2})\s*(?:-|–|—|to|and|ile)\s*(\d{1,2})${unit}`, "gi"))) {
    if (+r[1] >= 1 && +r[1] <= +r[2] && +r[2] <= 60 && whole(r)) return { min: +r[1], max: +r[2] };
  }
  for (const u of t.matchAll(new RegExp(String.raw`\b(?:under|up to|at most|no more than|max(?:imum)?|en (?:çok|fazla))\s*(\d{1,2})${unit}`, "gi"))) {
    if (+u[1] >= 1 && +u[1] <= 60 && whole(u)) return { min: 0, max: +u[1] };
  }
  return null;
}
const PART_BEFORE = /(?<![\p{L}\p{N}])(?:first|opening|intro|hook|each|every|per|chapter\p{L}*|section\p{L}*|segment\p{L}*|ilk|her|bölüm\p{L}*|açılış\p{L}*|kanca\p{L}*)(?![\p{L}\p{N}])[^.,;!?\n]{0,20}$/iu;
const PART_AFTER = /^\s*(?:long\s+)?(?:per|each|apiece|a (?:chapter|section|segment)|for (?:the |each |every )?(?:opening|intro|hook|chapter|section|segment))(?![\p{L}\p{N}])/iu;

/**
 * Senaryonun uzunluk sınırları (kelime). maxWords: kılavuzun üst sınırı (yoksa planın süresi + payı + %5) × işin sesinin
 * ölçülen film temposu; karne tavanını geçmez (süresi tavandan uzun bir istek hariç). minWords: uzun video tabanı ve —
 * sahneler verilirse — ücretli adım kapısı. maxWords hiçbir zaman minWords'ün altında değildir.
 * voiceSpeed: ayarlar docuVoiceSpeed (tempo onunla ölçeklenir). styleVoices: ayarlar docuStyleVoices — verilirse ve iş o
 * stilin kanal sesiyle okunmuyorsa (job.elevenVoiceId başka) tempo bilinmiyor sayılır: en yavaş ölçülen.
 */
export function lengthLimits(job = {}, plan, { scenes = null, voiceSpeed = MEASURED_VOICE_SPEED, styleVoices = null } = {}) {
  const lang = langOf(job);
  const key = lang === "en" ? voiceStyleKey(job) : null;
  const own = !!key && !(styleVoices?.[key] && job.elevenVoiceId !== styleVoices[key]);
  const wpm = (own ? DOCU_STYLE_WPM[key] : DOCU_FILM_WPM[lang]) * ((Number(voiceSpeed) || MEASURED_VOICE_SPEED) / MEASURED_VOICE_SPEED);
  const g = guidanceMinutes(job.guidance);
  let maxMinutes = g?.max ?? plan.minutes * DOCU_HEADROOM * PLAN_MAX;
  // Karne tavanı (≤ 14 dk) kendi süresi tavandan kısa her istekte geçerli: 20 dk'lık bir istek 14 dk'ya inmez.
  if (plan.minutes < SCORECARD_MAX_MIN) maxMinutes = Math.min(maxMinutes, SCORECARD_MAX_MIN);
  let minWords = plan.minutes >= LONG_FLOOR.minutes ? Math.min(plan.words, Math.round((LONG_FLOOR.words * DOCU_WPM[lang]) / DOCU_WPM.en)) : 0;
  if (scenes?.length) {
    // Kapı tahmini sahneyle birlikte azalır: kırpılan senaryonun tahmini hedef × LENGTH_GATE'in altına inmesin, yoksa iş
    // "Senaryo kısa" diye durur ve her devam aynı kırpmayı yeniden yapar.
    const st = docuScriptStats({ scenes }, job);
    if (st.estSeconds > 0) minWords = Math.max(minWords, Math.ceil(((st.actualWords * st.targetMinutes * 60 * LENGTH_GATE) / st.estSeconds) * GATE_MARGIN));
  }
  return {
    maxWords: Math.max(Math.round(maxMinutes * wpm), minWords),
    minWords,
    maxMinutes: Math.round(maxMinutes * 10) / 10,
    wpm: Math.round(wpm),
    from: g ? "kılavuz" : "plan",
    pace: own ? PACE_OF[key] : lang === "en" ? "ölçülmemiş ses, en yavaş" : "tr, planın hızı",
  };
}
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
 *   accent    türün renk vurgusu (grafik, kart, geçiş) — yazara GİTMEZ. Gimli 20261028-9ff721 / Kartal Yuvası 950730,
 *             29 Ekim 2026: son 7 videoda ortalama parlaklık 52-75, doygunluk 2,5-7,5; "soğuk mavi-gri", "yeşil-siyah",
 *             "karanlık, siyah geçişler" gibi palet kelimeleri `when` içinden visualStyle'a sızıp her kareyi karartıyordu.
 *             `when` yalnızca konuyu ve sesi anlatır; fotoğrafın ışığı ve rengi sahnenin gerçek yerinden ve saatinden gelir.
 */
/** Slam word cards: at most one per SLAM_EVERY_MIN minutes, SLAM_GAP_SEC apart. */
export const SLAM_EVERY_MIN = 3;
export const SLAM_GAP_SEC = 90;

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
    id: "crime", ad: "Suç / Gizem", when: "cinayet, soygun, dolandırıcılık, kayıp, çözülmemiş dosya; delil kartları, daktilo", accent: "soğuk mavi-gri",
    write: {
      openers: ["photo", "words", "montage"],
      coldOpen: "Tek bir delil üzerinde sert açılış: delilin gerçek fotoğrafı ve hikâyenin en tuhaf olgusu tek kısa cümlede (boş bir duvar, kilitli bir kapı, bir saat). Gerginlik ondan SONRA yavaşlayarak kurulur; ilk 10 sn fısıltısız.",
      stance: "Soğuk, kesin, zaman damgalı: saati ve tarihi söyler ('Pazartesi. Sabah yedi yirmi.'). Yargılamaz, kanıtı gösterir; şüpheyi izleyiciye bırakır.",
      tags: ["[quietly]", "[serious]", "[whispers]", "[slowly]"],
      moods: "ana duygular tension · dread · reveal; calm nadir; triumph YALNIZCA son bölümdeki çözümde",
      mix: "delil fotoğrafları, tarih/saat damgalı words, isim kartlı arşiv portreleri; slam itiraf veya ifşa anında",
      remap: { triumph: "reveal" },
      lastAllows: ["triumph"],
    },
  },
  {
    id: "epic", ad: "Epik Tarih / Savaş", when: "imparatorluk, savaş, fetih, kuşatma, büyük tarihî figürler; savaş davulları, koro", accent: "bronz-altın",
    write: {
      openers: ["title", "photo", "montage"],
      coldOpen: "Olayın İLK ANI, saatiyle ve tarihiyle ('Saat ikiyi gösterirken, 6 Ekim 1973'te, sirenler çalmaya başladı' — Yom Kippur videosu, kanal sahibi: 'mükemmel'): o günün sessizliği, ardından iki cephede saldırı. Ya da geniş ama sert: ufuk, sur, ordu ve bir ilan gibi tek cümle ('Bin yıllık surlar. Yirmi bir yaşında bir sultan.'), davullar — [slowly] ilk 10 sn'de değil (Napolyon'un yavaş sis açılışı ilk 40 sn'de izleyicinin %85'ini kaybetti). Konunun adı ilk 30 sn'de, başlık ~20 sn'de gelir.",
      stance: "Görkemli ve ölçülü, tarihçi ağzı; kısa hükümler. Kahramanlaştırmadan büyüklüğü ve bedelini hissettir.",
      tags: ["[slowly]", "[confident]", "[dramatic]", "[serious]"],
      moods: "ana duygular tension · triumph · sad; reveal dönüm anında; curious yalnızca açılışta",
      mix: "geniş planlar, harita ve tablo arşivleri, ordu/gemi/asker sayıları için counter (yıl sayacı yapma, yılı söyle), dönüm noktasında slam. Yom Kippur videosunun kalıbı (kanal sahibi 'mükemmel' dedi): baştan sona GERÇEK dönem fotoğrafları (Commons katalogundan adıyla); bir kişi ilk göründüğünde isim kartı, rolü yıllarıyla ('President of Egypt, 1970–1981'); yeni bir yere ya da güne geçen arşiv fotoğrafına kısa basılı etiket caption 'YER · TARİH' ('BAR LEV LINE · 1970', 'MOUNT HERMON · OCTOBER 1973'; her 4-6 sahnede bir, anlatımı tekrar etmez, bilgi ekler); iki tarafın gücü bars ile (1.200 tank / 180 tank); kritik günlerin akışı timeline ile; liderin gerçek sözü bir kez quote kartıyla; bedel (kayıplar) bars ile; kapanış açılıştaki tarihe döner (savaş 6 Ekim'de başladı, sekiz yıl sonra yine 6 Ekim'de bitti)",
      remap: {},
    },
  },
  {
    id: "science", ad: "Bilim / Uzay", when: "uzay, fizik, keşif, teknoloji, doğa bilimleri; ambient synth, hayranlık", accent: "lacivert-camgöbeği",
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
    id: "inspire", ad: "Biyografi / İlham", when: "bir insanın yükselişi, azim, başarı, dönüm noktaları; piyano ve yaylılar, umut", accent: "sıcak ışık",
    write: {
      openers: ["photo", "words"],
      coldOpen: "Bir portre ve tek, çarpıcı bir satır ('Uçağı kendi yaptı... uçtuğu için ceza aldı.'), fısıltısız; yumuşaklık sonraki sahnelerde. Montaj yok.",
      stance: "Samimi ve yakın: kişinin bedelini ve iç sesini anlat, başarıyı değil yolculuğu. Övgü sıfatı yok; sahne ve karar var.",
      tags: ["[warmly]", "[softly]", "[sad]", "[confident]"],
      moods: "yay: sad → tension → triumph; calm teneffüs; dread yerine tension",
      mix: "photo (aile, çocukluk, belge), alıntı gibi kısa words, zafer anında slam",
      remap: { dread: "tension" },
    },
  },
  {
    id: "finance", ad: "Finans", when: "borsa, kriz, para, şirket çöküşü; veri gerilimi", accent: "veri grafiklerinde amber vurgu",
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
    id: "horror", ad: "Korku", when: "lanet, perili yer, doğaüstü, gerçek dehşet olayları; sert geçişler", accent: "kan kırmızısı vurgu",
    write: {
      openers: ["words", "photo"],
      coldOpen: "Sessiz inşa ama ilk satır sert: boş bir mekânın gerçek fotoğrafı ve hikâyenin en ürpertici olgusu tek kısa cümlede; [whispers] ilk 10 sn'den sonra. HIZLI MONTAJ YOK — onun yerine kısa, ayrı sahneler.",
      stance: "Kısık ve ölçülü: asla bağırmaz, gösterilmeyeni hissettirir. Kan ve ceset değil; iz, geride kalan nesne, boş yer, tarih damgası.",
      tags: ["[whispers]", "[quietly]", "[slowly]", "[serious]"],
      moods: "ana duygular dread · tension · sad; zafer yok (ifşa reveal ile)",
      mix: "boş mekânlar (gün ışığında da ürpertir), geride kalan nesneler, tarih damgalı words, eski belgeler; silüet yalnızca anlatım söylüyorsa",
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
// 1.16.16: "world" = dünyanın her yeri (Natural Earth; çerçeve yerlere göre kurulur). Eski dört bölge elle çizilmiş özel haritalar.
const WRITER_MAP_REGIONS = ["world", "pacific-northwest", "bosphorus", "north-atlantic", "urals"];
const TRANSITIONS = ["", "cut", "flash", "zoom", "glitch", "blackout", "whip", "leak"];
/** Motorun v3 satırına etiket yoksa eklediği duygu etiketi (produce.mjs MOOD_TAG ile aynı). */
const MOOD_TAG = { curious: "[curious]", calm: "[warmly]", tension: "[quietly]", dread: "[whispers]", reveal: "[dramatic]", sad: "[sad]", triumph: "[confident]" };

const langOf = (job) => (job?.language === "en" ? "en" : "tr");

/*
 * AÇILIŞ BÜTÇESİ (22 Ekim 2026 yazım denetimi): her bölüme eşit kelime veriliyordu (15 dk'da 225) ve %90 tabanıyla
 * soğuk açılış en az ~85 sn olmak zorundaydı; model boşluğu vaat listesi, meta cümle ("As I record this…"), "First, the
 * basics" ve fragmanlarla doldurdu — Fransa'da 0:20-0:50 arasında izleyicinin dörtte biri gitti. Açılış bölümü ~55 sn.
 */
export const OPENING_WORDS = 140;
export function openingBudget(words, chapters, range) {
  const even = Math.round(words / chapters);
  const chapterWords = Array.from({ length: chapters }, () => even);
  const chapterScenes = Array.from({ length: chapters }, () => range);
  if (chapters < 3 || even <= OPENING_WORDS) return { chapterWords, chapterScenes };
  const moved = even - OPENING_WORDS;
  chapterWords[0] = OPENING_WORDS;
  const each = Math.floor(moved / (chapters - 1));
  for (let i = 1; i < chapters; i++) chapterWords[i] += each + (i - 1 < moved - each * (chapters - 1) ? 1 : 0);
  const ratio = OPENING_WORDS / even;
  // The cold open keeps its short, fast lines: scenes scale less than words.
  chapterScenes[0] = [Math.max(5, Math.round(range[0] * Math.sqrt(ratio))), Math.max(7, Math.round(range[1] * Math.sqrt(ratio)))];
  return { chapterWords, chapterScenes };
}

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
  const { chapterWords, chapterScenes } = openingBudget(words, chapters, range);
  return {
    minutes, words, chapters, scenes,
    wordsPerChapter: Math.round(words / chapters),
    scenesPerChapter,
    scenesRange: range,
    secondsPerChapter: Math.round((minutes * 60) / chapters),
    chapterWords,
    chapterScenes,
    ...(job.docuFormat === "news" ? { news: true } : {}),
    ...(job.docuMapMode === "haritali" ? { maps: true } : {}),
    // 1.16.16 orta/son dersleri: finans kapanışı "izlenecek işaretler" alır, seri bir sonraki bölüme işaret eder.
    ...(job.docuGenre === "finance" ? { finance: true } : {}),
    ...(job.docuGenre === "science" ? { explain: true } : {}),
    ...(job.docuSeries ? { series: job.docuSeries } : {}),
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

/** The writer picks one of the offered opening logics (docu-hooks.js). */
function withOpeningLogic(schema, cands) {
  if (!cands?.length) return schema;
  return {
    ...schema,
    properties: { ...schema.properties, openingLogic: { type: "string", enum: cands.map((h) => h.id), description: "Seçilen giriş mantığının id'si (GİRİŞ MANTIĞI listesinden, konunun tonuna en uygun olan)" } },
    required: [...(schema.required || []), "openingLogic"],
  };
}

/** Bölüm 1'in açılış talimatı: seçilen giriş mantığı; yoksa (eski plan) türün varsayılan açılışı. */
export function openingRule(bible, g) {
  const h = hookById(bible?.openingLogic);
  if (!h) return `ilk sahne ${g.write.openers.join(" veya ")} — ${g.write.coldOpen}`;
  return `GİRİŞ MANTIĞI "${h.ad}": ${h.how} (Türün varsayılan açılışını değil BUNU uygula; ilk sahne tipi bu mantığa uyan ${[...new Set([...g.write.openers, "photo", "words"])].join(" / ")}.)`;
}

/** A news chapter that tells events from before the news week (root causes, earlier weeks) — at most ~60-75 s. */
export const BACKGROUND_WORDS = 170;
function bibleSchema(plan) {
  const base = docuBibleSchema(plan);
  if (plan.news) {
    // Fransa videosu (22 Ekim 2026, izlenme eğrisi): 2. bölüm Eylül'e döndü ve 1:47 sürdü — izleyicinin üçte biri
    // orada gitti (%45 → %30). Arka plan bölümü işaretlenir; kod yerini ve bütçesini sınırlar.
    const ch = base.properties.chapters.items;
    ch.properties = { ...ch.properties, background: { type: "boolean", description: "true: bu bölüm haber haftasından ÖNCEKİ olayları anlatıyor (kök nedenler, haftalar önceki gelişmeler). Videoda en çok BİR tane; 2. bölüm asla; en çok ~60-75 sn." } };
    ch.required = [...ch.required, "background"];
  }
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
      visualStyle: { type: "string", description: "İNGİLİZCE, tek cümle: TEK BİR KARENİN ortak dili (dönem, film stoğu, ışık, lens, renk, doku) — her görsel isteğine eklenir. KONU YAZMA: kişi, gemi, bina, yer, nesne adı yok ('photograph of submarines and their bases' her kareyi denizaltıya çevirir; konuyu her sahnenin imagePrompt'u söyler). Kurguyu anlatma ('intercut with archival prints', 'mixed with', 'collage' YAZMA: görsel üretici kolaj yapar). PARLAK, İYİ POZLANMIŞ, DOĞAL RENKLİ fotoğraf; siyah-beyaz ya da sepya yalnızca hikâye renkli filmden önceyse (1940 öncesi). Işığı sahnenin gerçek yeri ve saati belirler, visualStyle karanlık bir ruh hâli dayatmaz. YASAK: 'deep shadows', 'deep black shadows', 'low-key', 'noir', 'moody', 'harsh … against … black', 'green-black' (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: bu kelimelerle videolar parlaklık 52-56, doygunluk 2,5-6 ölçüldü, kanal sahibi 'hepsi siyah, karanlık, aynı' dedi). Örn: 'Authentic 1970s documentary photograph, Kodak Ektachrome colour film, bright natural daylight, well exposed, candid, fine grain, archival print texture.'" },
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
            title: { type: "string", description: "Bölüm başlığı (ekranda bölüm kartı + YouTube bölüm işareti; kısa, video dilinde). Tercihen bir MERAK KARTI: bölümün cevapladığı soru ya da cesur iddia ('The Numbers Don't Match', 'Who Was Really in Charge?')" },
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

/** Split tarafının resmi: kurgu yönetmeni iki tarafı da fromScene'siz split'i atar (docu-edit-director.js buildDevice). */
const SPLIT_REF = "split: BU BÖLÜMDE daha önceki, bu tarafı gösteren sahnenin sırası (0'dan) — iki taraftan EN AZ BİRİNDE şart";
export const SCENES_SCHEMA = {
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
          // The picture's source fields sit right after it: nearly every scene uses them, and the API's wire
          // schema keeps the first-declared optional fields in the grammar (structured-output.js wireSchema).
          source: { type: "string", enum: ["archive", "stock", "ai"], description: "Görselin kaynağı: archive = gerçek arşiv fotoğrafı, stock = ücretsiz genel atmosfer fotoğrafı, ai = üretilir (en fazla ~15)" },
          bg: { type: "string", enum: ["prev"], description: "words/slam: yeni görsel yerine önceki sahnenin fotoğrafı" },
          search: { type: "string", description: "source=archive ise İNGİLİZCE arşiv arama sorgusu: özel isim + yer + yıl ('Apollo 13 crew 1970 portrait', 'Topkapi Palace treasury'). 3-6 kelime. Her sorgu hikâyenin ÜLKESİNİ/ŞEHRİNİ taşır ('French police Paris school gate', 'police' değil) ve satırdaki tek bir nesne kelimesini değil anın kendisini arar ('eat through a straw' → 'hospital patient after jaw surgery', 'straw' değil)." },
          commons: { type: "string", description: "source=archive ve tam adını BİLDİĞİN bir Wikimedia Commons dosyası bu anı gösteriyorsa: 'File:...' (ör. 'File:Stena Impero 2019-07-21 02.jpg'). Emin değilsen boş bırak; search yine dolu olsun." },
          depth: { type: "boolean", description: "Karede TEK kişi net ve orta planda ise true (2.5D derinlik, yazı kişinin arkasına geçer)" },
          sound: { type: "string", description: "İNGİLİZCE ortam sesi: 'rain on a window, distant thunder'. Aynı mekânda ardışık sahnelerde AYNI metin. Müzik/konuşma yazma." },
          transition: { type: "string", enum: TRANSITIONS, description: "Boş = motor seçer" },
          silence: { type: "boolean", description: "Müzik bu sahnede tamamen çekilsin (yalnızca son bölümde, en fazla 1 kez)" },
          riser: { type: "boolean", description: "Bu sahneye yükselen gerilim sesiyle girilsin (slam ve montaj için)" },
          kicker: { type: "string" }, title: { type: "string" },
          word: { type: "string", description: "slam: say'deki bir kelimenin eklerle birlikte AYNISI" }, sub: { type: "string" },
          // counter: sayı; chart: ilk/son noktanın etiketi ("Aug", "2014") — sceneEnds() ikisini türüne çevirir.
          from: { type: ["number", "string"], description: "counter: başlangıç sayısı; chart: ilk noktanın etiketi (yıl/ay)" },
          to: { type: ["number", "string"], description: "counter: hedef sayı; chart: son noktanın etiketi (yıl/ay)" },
          label: { type: "string" }, prefix: { type: "string" }, suffix: { type: "string" }, decimals: { type: "number" },
          year: { type: "boolean", description: "counter: sayı bir YIL ise true (1453) — binlik ayırıcı olmadan gösterilir" },
          name: { type: "string" }, role: { type: "string" }, caption: { type: "string" },
          text: { type: "string", description: "words: ekrana yazılacak cümle (say'in kelimeleri, aynı sırayla). montage: say içinde AYNEN geçen 2-4 anahtar kelime, sonuncusu kanca" },
          keyword: { type: "string", description: "words: vurgulanacak tek kelime, text içinde aynen geçmeli — satırın en güçlü içerik kelimesi (isim/sayı/kavram)" },
          points: { type: "array", items: { type: "number" }, description: "chart: 4-12 gerçek veri noktası" },
          imagePrompts: { type: "array", items: SHOT, description: "montage: 5-7 çekim; photo: 0-1 ek belge/detay kartı" },
          fullBleed: { type: "boolean" },
          // ---- kurgu cihazları (SAHNE DİLİ'ndeki KURGU CİHAZLARI) ----
          paper: { type: "string", description: "headline: gazetenin adı (THE OREGONIAN)" },
          headline: { type: "string", description: "headline: manşet, gazetenin dilinde, 2-8 kelime" },
          date: { type: "string", description: "headline: gazetedeki tarih satırı" },
          translation: { type: "string", description: "headline: yabancı dildeki manşetin video dilinde çevirisi" },
          region: { type: "string", enum: WRITER_MAP_REGIONS, description: "map: harita — \"world\" dünyanın her yeri (çoğu zaman bu); diğerleri elle çizilmiş özel bölgeler" },
          countries: { type: "array", items: { type: "string" }, description: "map (world): boyanacak ülkeler, anlatımda geçen adlarıyla (en çok 4)" },
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
          left: { type: "object", properties: { fromScene: { type: "integer", description: SPLIT_REF }, label: { type: "string" } }, required: ["label"], additionalProperties: false },
          right: { type: "object", properties: { fromScene: { type: "integer", description: SPLIT_REF }, label: { type: "string" } }, required: ["label"], additionalProperties: false },
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
    "- source \"stock\": GENEL atmosfer/ara plan (yağmurlu cam, fırtınalı deniz, karlı orman, eski gazete, şehir ışıkları). search = stok sitesinin bulacağı 2-4 düz İngilizce kelime ('rain on window', 'stormy sea'). Ücretsiz gerçek fotoğraf (Pexels/Pixabay/Unsplash).",
    "- bg \"prev\": words ve slam sahneleri çoğunlukla YENİ görsel istemez — yazı bir önceki fotoğrafın üstüne gelir; imagePrompt yazma. Profesyonel kurguda her cümleye yeni kare kesilmez.",
    "- source \"ai\": YALNIZCA fotoğrafı OLAMAYACAK ve stokla da gösterilemeyecek an (o gece uçaktan atlayan adam, fotoğraf öncesi dönemde bir an, iç dünya). Videoda EN FAZLA ~15 AI görsel, montaj kareleri dahil.",
    // Çok uzun videoda hep aynı kişi/yer sorgusu zayıf aday getiriyordu: genel kareler stoktan gelir.
    "- Dağılım: gerçek kişi/yer/olay → archive, genel atmosfer → stock, yazı/slam → bg prev, kalan birkaç an → ai. Fotoğraf çağından önceki konularda (1800 öncesi) archive'ı müze tabloları, minyatürler, gravürler ve haritalar için kullan ('Ottoman palace 17th century painting').",
    "- archive ve stock sahnelerde de imagePrompt yaz: uygun fotoğraf çıkmazsa sahne onunla AI'a düşer (motorun AI tavanı aşılırsa önceki fotoğrafa).",
    "- montage kareleri de gerçek olabilir: imagePrompts girdisini {\"prompt\":\"...\",\"source\":\"archive\"|\"stock\",\"search\":\"...\"} yaz; gerçek karşılığı olamayan kare düz metin (AI) kalır.",
    "- name/role (isim kartı) yalnızca source \"archive\" sahnelerde: AI'ın çizdiği yüzün altına gerçek bir kişinin adı yazılmaz.",
    // Ekim 2026 (Hürmüz, Irkutsk, Yom Kippur, Nvidia): en iyi videolarda karelerin çoğu Commons'tan ADIYLA seçildi.
    "- commons: güncel olaylarda (ABD Donanması/DVIDS, hükümet, ajans, NASA fotoğrafı) ve ünlü tarihî fotoğraflarda doğru kare çoğu zaman Commons'ta adıyla bellidir. Tam dosya adını biliyorsan commons alanına 'File:...' yaz: seçici atlanır, o dosya lisansı kontrol edilerek alınır. Bilmiyorsan uydurma; search her zaman dolu kalsın (dosya yoksa onunla aranır). Aynı dosyayı iki sahneye yazma: ikinci sahne arama yapar.",
  ].join("\n");
}

const SCENE_GRAMMAR = `SAHNE DİLİ (motorun bildiği çekimler):
- montage: soğuk açılış cihazı; yalnızca videonun İLK sahnesi olabilir (tür montajla açılıyorsa). 5-7 kısa çekim müziğin vuruşuna kesilir; text = say içinde AYNEN geçen 2-4 anahtar kelime (aynı sırayla), sonuncusu kanca (ekrana kırmızı ve büyük düşer). say kısa: "[whispers] Bir tarif... Bir sokak... [dramatic] Ve bir ihanet." imagePromptlar makro detaylar, eller, nesneler, yerler — hikâyenin parçaları, sırrı vermeden; gün ışığında ya da aydınlık iç mekânda (gece yalnızca anlatım geceyi söylüyorsa).
- title: YALNIZCA ilk bölümde, videonun adı (kicker küçük üst yazı + title iki-üç kelime), ilk 4 sahnenin içinde. Bölüm kartlarını ("BÖLÜM 2" + bölüm adı) motor kendisi ekler: bölüm kartı ya da ikinci bir title YAZMA.
- counter: büyük bir sayı sayarak yükselir (from→to, label). Yalnızca araştırmadaki gerçek ve çarpıcı rakamlar; aynı sayıyı iki kez sayaç yapma. Sayı bir YIL ise year:true. imagePrompt yazma.
- words: bir cümle kelime kelime anlatıcıyla ekrana gelir, keyword vurgulanır. text = say'in kelimeleri AYNEN ve AYNI SIRAYLA (tamamı ya da say'den sıralı bir anahtar ifade); keyword text'te AYNEN geçen tek kelime — satırın en güçlü İÇERİK kelimesi (isim, sayı, kavram; 'something/thing/very' gibi boş kelime değil). Arkada bir görsel (imagePrompt). Ekran yazısı sesin ötesinde bir şey katmalı: isim, yer, tarih/saat, sayı, gerçek alıntı ya da bölümün kilit kavramı; anlatıcının söylediği sıradan bir ifadeyi ekrana kopyalama (sanat yönetmeni böyle dolgu satırları yazısız görüntüye çevirir).
- photo: bir kişi veya belge. name/role yalnızca kişinin videodaki İLK görünüşünde (alt yazı kartı), caption kısa bir yargı ("Tek kuruş almadı"). imagePrompts ile 1 ek belge/detay kartı eklenebilir.
- slam: dönüm noktası. Nefes → tek kelime (word) çarpar. word, say'deki bir kelimenin eklerle birlikte AYNISIDIR ("ihanete" diyorsan word "ihanete", "Enron'un" diyorsan "Enron'un"); genelde cümlenin son kelimesi. riser:true. Bölüm başına en fazla 1.
- chart: araştırmadaki GERÇEK bir veri serisi (4-12 nokta; points, title, prefix/suffix, from/to etiketleri). Uydurma seri yok. imagePrompt yazma.

KURGU CİHAZLARI (seyrek ve yerinde: yalnızca anlatım gerçekten o cihazı istiyorsa). İki cihaz arasında en az 35-45 sn; aynı cihaz art arda iki kez gelmez; 12 dk'lık videoda toplam 12-20 (bölüm başına 1-3). Olgular yalnızca araştırmadan ve anlatımdan: uydurma isim, tarih, alıntı, belge metni YOK. Her cihaz sahnesine de imagePrompt yaz (cihaz geçersiz sayılırsa sahne onunla fotoğrafa döner). İsim kartı taşıyan sahne cihaz olmaz.
- headline: basın tepkisi — gazete manşeti. paper, headline (gazetenin dilinde 2-8 kelime), date, translation (video dilinde). Yalnızca anlatım basından/manşetten söz ediyorsa.
- map: yer ve rota — DÜNYANIN HER YERİ. region "world" (gerçek dünya haritası; çerçeve yerlere göre kendiliğinden kurulur) — yalnızca hikâye tam olarak elle çizilmiş bir bölgedeyse pacific-northwest, bosphorus, north-atlantic, urals. places [{label, lat, lon}] GERÇEK koordinatlarla (1-6), route (indeksler), focus, countries (world: boyanacak ülkeler, anlatımda geçen adlarıyla). Etiketler anlatımda AYNEN geçen yer adları (geçmeyen yer haritadan düşer). Yer adı geçen her bölümde bir harita düşün: tutmuş kanallar ilk dakikada 1-3 harita gösteriyor.
- board: dedektif panosu — şüpheliler, kişiler, olası açıklamalar birbirine bağlanır. items [{label, note?, fromScene?}], links [[0,1]]. fromScene: bu bölümde DAHA ÖNCEKİ, o kişiyi gerçekten gösteren sahnenin sırası (0'dan); emin değilsen yazma.
- split: iki RESİMLİ şey karşı karşıya ya da önce/sonra. left/right {label, fromScene}, mode versus | before-after. EN AZ BİR tarafta fromScene ŞART: bu bölümde DAHA ÖNCEKİ, o şeyi gerçekten gösteren sahnenin sırası (0'dan); fromScene'siz taraf bu sahnenin kendi resmini gösterir (imagePrompt o tarafı çizsin). İki tarafı da fromScene'siz split kod tarafından atılır. Etiketler anlatımda geçen kelimeler. İki SAYININ kıyası split DEĞİLDİR: sayıları satırda söyle, kıyas kartını (bars/scale) kurgu yönetmeni koyar (Fransa borcu, 24 Ekim 2026: "France · 5.04%" / "Italy · about 4.5%" gibi beş resimsiz split düz fotoğrafa döndü).
- document: kilit bir belge/ifade/telgraf. doc {kind: fbi-teletype | letter | report | telegram | ledger, heading, lines: anlatımdaki olgulardan 2-6 kısa belge satırı}, highlight (satırlarda AYNEN geçen), redact, stamp.
- timeline: yıllara yayılan olaylar. events [{year, label}] 3-7 olay; her yıl anlatımda GEÇEN bir yıl.
- quote: gerçek bir alıntı kartı. say satırı alıntıyı içerir ve quote = o sözler AYNEN (kelimesi kelimesine); who = söyleyen, when. Alıntı uydurma.
- annotate (photo sahnesinin alanı, source archive): "bu adam / bu ayrıntı" anı. annotate {label: kısa etiket (anlatımda geçen), target: İNGİLİZCE işaretlenecek şey}. Konum fotoğraf seçildikten sonra bulunur; bulunamazsa işaret kalkar.

TEMPO: bir sahne = bir düşünce = 5-14 kelime ≈ 3-6 sn. Uzun paragraf YOK; bir cümle iki sahneye bölünebilir. Arka arkaya aynı tip en fazla 2 kez; words yalnızca bilgi taşıyan satıra (sayı, isim, yer, tarih, alıntı), bölüm başına en çok 2 — bilgisiz satır photo.
UZUN FORM: izleyici her 60-90 saniyede yeni bir kanca almalı — bir soru, bir ifşa, bir sayı, bir slam ya da açık bir döngünün hatırlatılması. Bilgiyi sırayla sayma: merak kur, geciktir, sonra ver. Her bölüm bir öncekinden daha büyük bir bedel ya da soru açar.

DUYGU (mood) MÜZİĞİN İŞARETİDİR: müzik bölümleri mood'dan kurulur. Bir duyguyu 5-10 sahne (20-60 sn) KORU, yalnızca bölümün dönüm noktasında (turn) değiştir; bölüm başına en fazla 3-4 değişim. Satır satır duygu farkını v3 etiketiyle ver, mood'u değiştirerek değil.
curious merak · calm sıcak · tension gerilim · dread tehdit · reveal ifşa · sad hüzün · triumph zafer.

SES PERFORMANSI (ElevenLabs v4 — bir ses sanatçısını yönetiyorsun): say satırının başına İngilizce köşeli YÖNLENDİRME koy. Tek etiket ([whispers] [sighs] [exhales] [curious] [excited] [sarcastic]) ya da kısa tarif ("[low, hushed voice]", "[quiet, tense]", "[slowly, with weight]", "[softly, with sorrow]", "[firmly]", "[warm, unhurried]"). Yönlendirme satırın İŞLEVİNİ oynatır: açılış alçak ve sakin; ifşa yavaş ve ağırlıklı; tehdit fısıltıya yakın; vurucu kısa cümle kararlı (asla fısıltı değil); soru merakla; bölüm sonu yumuşak. Her satıra etiket koyma: aynı renk ardışık satırlarda bir kez yeter (ses satırdan satıra taşır); yönlendirmesiz satırı sistem sahnenin duygusuyla tamamlar. ANLATICININ VARSAYILAN SESİ NET VE GÜÇLÜDÜR: kısık/fısıltı/yavaş renkler ([quietly] [whispers] [low, hushed voice] [softly] [slowly]) bir EFEKTTİR — bölümde en fazla 1-2 satır (açılış, ifşa, bölüm sonu), filmde en fazla bir [whispers]; satırların çoğu yönlendirmesiz ya da [serious] [firmly] [curious] olsun (ses yönetmeni fazlasını siler). Ses efekti etiketi ([gunshot] [explosion] [applause]) ASLA.
"..." gerçek bir duraklamadır: ifşadan önce nefes tut ("And that recipe... one night... [slowly, with weight] was stolen."). Çok nadir, tek kelimeyi BÜYÜK HARFLE vurgula. Etiket dışında köşeli parantez, emoji, madde işareti yok.

GÖRSEL: imagePrompt İNGİLİZCE, somut bir çekim: çekim ölçeği + özne + eylem + ışık. Çekimleri ÇEŞİTLE: extreme close-up (eller, gözler, nesne), detail (belge, para, alet), wide (sokak, bina, kalabalık), medium shot, high angle, over-the-shoulder, empty place (kimsenin olmadığı mekân). Aynı kareyi videoda iki kez isteme.
IŞIK sahnenin GERÇEK yerinden ve saatinden gelir: gündüz olan olay gün ışığında, iç mekân lambalarla ve pencereden gelen ışıkla aydınlık, iyi pozlanmış ve doğal renkli. İstemlerin EN AZ %60'ı gün ışığında ya da aydınlık iç mekânda olsun; gece, alacakaranlık ve silüet YALNIZCA anlatım o anı öyle söylüyorsa (videoda en fazla 5 silüet). 'dark', 'dimly lit', 'shadowy', 'deep shadows', 'low-key', 'moody', 'noir', 'murky' yazma — gerilimi ışık değil olgu taşır (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: karelerin %21-39'u neredeyse siyah ölçüldü; en iyi video Panama doğal renkte parlaklık 88).
Karakter görünüyorsa cast'a anahtarını yaz ve istemde "the man"/"the woman" de; GERÇEK İSİM, yazı, tabela, logo, ekran metni isteme (görselde okunur yazı OLMAYACAK). Stil tarifi yazma, sistem ekler.
Kurum, ordu, polis ya da kalabalık karesinde ÜLKEYİ ve ŞEHRİ istemde yaz ("the chamber of the Egyptian House of Representatives in Cairo, lawmakers in dark suits", "Saudi soldiers at a border post"): yer adı yoksa model başka bir ülkenin bayrağını, armasını ve kıyafetini çizer (Husi-Suudi haberi, 28 Ekim 2026: "a large parliament chamber" Mısır meclisi diye İran bayraklı, Körfez kıyafetli geldi).
Hikâyenin kendi aracı (uçak, gemi, tren, roket) karede görünüyorsa TİPİNİ ve ayırt edici biçimini istemde yaz ("a twin-engine Boeing 767-200, two engines, no upper-deck hump"); "a widebody airliner" gibi genel ad başka bir tip çizdirir. Kişiler hikâyenin BAŞKA bir mekânındaysa o mekânı adıyla yaz ("air traffic controllers at a radar console in a ground control room"); "in a dark room" yazılırsa model kişileri bir önceki karelerin mekânına koyar (Gimli Glider, 28 Ekim 2026: ilk kare 767 yerine dört motorlu 747 geldi; yerdeki kontrolörlerin karton cetveli kokpitte, pilot üniformalı birinin elinde çizildi).
Anlatımda ADI GEÇEN gerçek bir kişiyi (cast'ta olsun olmasın: oğulları, rakibi, yargıcı) AI karesinde YÜZÜYLE isteme — arşivde fotoğrafı çıkmazsa sahne AI'a düşer ve uydurma yüz gerçek kişinin yerine geçer: onu arkadan, uzaktan, elleriyle ya da bulunduğu mekânla anlat; tekrar görünüyorsa cast'a yaz. Gazete ön sayfası, manşet, dergi kapağı, okunur yazılı belge ya da afiş AI'a İSTENMEZ (sahte belge olur): gerçek manşet headline cihazıdır; AI karesi en fazla katlanmış, yazısı okunmayan bir gazete yığınıdır.
Şiddeti GÖSTERME, ima et: geride kalan nesneler, polis şeridi, boş oda, olay yerinin ertesi sabahki hâli; kan, yara, ceset yok.
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
    targetMinutes: DURATIONS[job?.durationPreset]?.minutes || 12,
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
 * YAS SATIRI (27 Ekim 2026, müzik denetimi): ölüm ve kayıp söyleyen satırın duygusu 'sad' olur ve kilitlenir.
 * Çernobil (20261026-24122a) 146 sahnede 0 'sad' taşıdı: "Borys Baranov died of a heart attack" (9:28) tension'dı,
 * In Battery'nin (sad 0) altına düştü; Hastings'te "William is dead" zafer kokan Defying Gravity'nin altındaydı. Yazar
 * bazen 'sad' yazıyor ama 1-2 sahnelik yas anı mergeMoodRuns'ta komşu gerilime katılıp siliniyordu.
 * Ortak sözleşme (motorun müzik seçicisi ve karışım aynı iki ifadeyi kullanır): GRIEF gerçek bir ölüm/kayıp, NOT_GRIEF
 * olumsuzlanmış ya da sıfır kayıp ("no one in Panama has been reported killed", "no injuries") — önce o bakılır.
 */
export const GRIEF = /\b(died|dies|dying|killed|kills|dead|deaths?|death toll|funeral|buried|burial|mourn\w*|victims?|perished|executed|suicide|lost (?:his|her|their) li(?:fe|ves)|never (?:came|come) home)\b/i;
export const NOT_GRIEF = /\b(no|not|never|nobody|no one|none|without|zero)\b[^.!?]{0,40}\b(killed|died|dead|deaths?|injur\w*|casualt\w*|victims?)\b/i;
/**
 * Olmuş bir ölüm değil (27 Ekim 2026 incelemesi): soru ("was anyone actually killed?" — Fransa), koşul ("If your bank
 * dies, your money dies with it." — 1929), efsane/iddia ("The legend calls them suicide divers" — Çernobil'in 11 yas
 * isabetinin 7'si efsaneyi çürüten girişteydi). Motorda (audio-director GRIEF_UNREAL, timeline.js) aynı liste.
 */
export const GRIEF_UNREAL = /\?\s*$|\b(if|unless|whether|legend\w*|myths?|mythical|rumou?r\w*|hoax|invented|fabricated|supposedly|claimed|alleged\w*)\b/i;
/** "Not one of the eight musicians survived" (Titanic): kurtulan yok = yas satırı. Motorda NO_SURVIVOR aynı. */
export const NO_SURVIVOR = /\b(not one|none|no one|nobody|did not|didn't|never|not a single)\b[^.!?]{0,40}\bsurviv\w*/i;
/**
 * Satır gerçek bir ölümü/kaybı söylüyor mu: cümle cümle (noktalı virgül, ", but" ve ayraç tirelerinde de bölünür) bakılır,
 * olumsuzlama yalnızca kendi cümlesini düşürür: "Two men — not three — died." yastır; bütün metne bakınca "not … died"
 * eşleşip kaçıyordu. Bütün metne bakan tüketicinin (motorun yedek ifadesi) yas dediği her satırı bu da yas sayar.
 */
export function griefLine(say) {
  return stripTags(say).split(/(?<=[.!?…])\s+|;\s*|,\s+but\s+|\s+[—–]\s+/i).some((t) => ((GRIEF.test(t) && !NOT_GRIEF.test(t)) || NO_SURVIVOR.test(t)) && !GRIEF_UNREAL.test(t.trim()));
}

/**
 * Duygu koşuları: müzik bölümleri mood'dan kuruluyor; her sahnede değişen
 * mood (ölçüldü: 17 sahnede 16 koşu) 240 sn'lik müzikte 50-60 bölüm demekti,
 * API sınırını aşıp tek prompt'a düşüyordu. 20 sn'den kısa koşu komşusuna
 * katılır, bölüm başına en fazla 4 değişim. Açılış sahnesi, silence sahneleri
 * ve yas satırları (griefLine) kilitli (kendi duyguları anlamlı).
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
  // Yas kilidi (griefLine): ölüm/kayıp satırı 'sad', birleştirme onu komşu gerilime katmaz. scene.grief motora kadar
  // taşınır (müzik seçicisi ve karışım okur; eski senaryolar için aynı ifadeyi kendileri de uygular).
  for (const s of scenes) {
    if (!s || typeof s !== "object" || !griefLine(s.say)) continue;
    s.grief = true;
    s.mood = "sad";
  }
  mergeMoodRuns(scenes, { lang, locked: (s, i) => !!s.silence || s.grief === true || (first && i === 0) });
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
function hardErrors(scenes, { first = false, genre = "documentary", lang = "tr", aiCap = null } = {}) {
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
  // AI TAVANI (Hastings, Ekim 2026): yazar "videoda en fazla ~15 AI" kuralını okuyup bölüm başına 6-13 AI sahne
  // yazdı; motor tavanı aşan sahneleri önceki fotoğrafa düşürür → uzun bekleyen kareler, az gerçek görsel.
  if (aiCap != null) {
    const ai = scenes.filter((s) => s?.source === "ai" && !s.chapterCard).length;
    if (ai > aiCap) errors.push(`bu bölümde ${ai} AI görseli var, en fazla ${aiCap} (videoda toplam ~15): gerçek arşiv (archive: Bayeux Halısı gibi dönem eseri, müze tablosu, yerin fotoğrafı), stok (stock: deniz, sis, tarla, nehir gibi dönemle çelişmeyen doğa) ya da words/slam için bg "prev" kullan`);
  }
  return errors;
}

/**
 * from/to TÜRÜNE GÖRE (16 Ekim 2026, Ebola gündem videosu): yazara chart'ın from/to'su eksen etiketi diye anlatılıyor,
 * şema ise sayı diyordu — "$.scenes[16].from: beklenen tür number, gelen string" üç denemede de, iş durdu. Motorda
 * counter'ınki sayı, chart'ınki etiket (types.ts). counter: "9,144" / "~4,400+" → sayı; chart: etiket metni.
 * @returns sayıya çevrilemeyen counter için hata (birim/etiket suffix veya label alanına).
 */
export function sceneEnds(scenes) {
  const errors = [];
  (scenes || []).forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    for (const k of ["from", "to"]) {
      if (s[k] == null) continue;
      if (s.type === "chart") s[k] = String(s[k]);
      else if (s.type === "counter" && typeof s[k] === "string") {
        const t = s[k].replace(/[\s,_]/g, "").replace(/^[~≈+]+|\++$/g, "");
        if (/^-?\d+(\.\d+)?$/.test(t)) s[k] = Number(t);
        else errors.push(`sahne ${i + 1}: counter ${k} yalnızca sayı olmalı ("${s[k].slice(0, 30)}"); birim ve açıklama suffix/label alanına`);
      }
    }
  });
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
 * MÜZİK SESSİZLİĞİ BÜTÇESİ (27 Ekim 2026, müzik denetimi): 11 videoda duygu dorucunda tek bir sessizlik vardı (Hastings
 * 13:12, Harold'ın ölümü); öteki 5 sessizliğin hepsi kapanış satırıydı, Çernobil'de hiç yoktu. 16 alıntı sahnesinin 15'i
 * her anlatım gibi kısılmış müziğin altındaydı. Artık ~5 dakikada bir bilinçli sessizlik (13 dk → 3), aralarında ≥120 sn;
 * önce yas satırları (griefLine), sonra yazarın kendi sad/reveal sessizliği, sonra gerçek alıntılar (quote + who), en son
 * kapanış satırı. Kancanın ilk 60 sn'si müziksiz kalmaz.
 * Yas satırları arasında somut olan önce: adı geçen kişi ya da sayı ve tam cümle. Söylenti/efsane anlatan satır (HEARSAY)
 * yine 'sad' kalır ama sessizlik almaz: Çernobil'in eski sırasıyla üç sessizlik "invented death tolls," (yarım cümle),
 * "the legend of their deaths" ve "back to the legend once more" satırlarına düşüyordu; "Borys Baranov died" ve "Thirty
 * deaths" boş kalıyordu.
 */
export const SILENCE_EVERY_MIN = 5;
export const SILENCE_GAP_SEC = 120;
const SILENCE_HOOK_SEC = 60;
const HEARSAY = /\b(legends?|legendary|myths?|mythical|rumou?rs?|rumou?red|invented|supposedly|allegedly|conjured|hoax|falsely)\b/i;
/**
 * Bir tarafın bildirdiği sayım: yas kalır ama sessizlik almaz — Suudi haberinde "Colonel al-Nazili, reported 260 Houthi
 * fighters killed" ve "GACA reported twelve people killed" iki sessizliği yiyordu (27 Ekim 2026 incelemesi).
 */
const REPORTED = /\b(reported|reports|according to|claimed|claims|said)\b/i;
const COUNTED = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|dozens?)\b/i;
/** Cümle içinde büyük harfle başlayan kelime (cümle başı değil): bir kişinin/yerin adı. */
const NAMED = /[\p{Ll},;]\s+\p{Lu}\p{Ll}{2,}/u;
/** Birinci ağızdan alıntı ("us" yok: alıntıdaki "US" ülke adıdır). */
const TESTIMONY = /\b(i|i'm|i've|i'd|me|my|mine|we|we're|we've|our)\b/i;

/**
 * Video geneli kotalar: bölümler ayrı yazıldığı için her bölüm kendi
 * slam'ini, sessizliğini, isim kartını ve sayacını koyuyordu.
 *   silence: en fazla ceil(dk/5), aralarında ≥120 sn — yas satırı > yazarın sad/reveal anı > gerçek alıntı > kapanış
 *   slam: en fazla ceil(dk/1.5), aralarında ≥45 sn; fazlası words olur
 *   counter: aynı sayı ikinci kez sayılmaz
 *   isim kartı: kişi başına ilk görünüş
 */
export function enforceGlobalQuotas(scenes, { minutes = 8, lang = "tr", intensity = [] } = {}) {
  const notes = [];
  const { starts } = sceneStarts(scenes, lang);
  // SESSİZLİK
  {
    const lastIdx = scenes.length - 1;
    // Gerçek alıntı: quote + who, ve ya bir tanıklık (birinci ağızdan: "I was ordered to go there, so I went.") ya da
    // duygulu bir an (sad/reveal/calm). Resmî açıklama sessizlik almaz: Kartal Yuvası'nda "the damage is certainly in the
    // millions" alıntısı yazarın kapanış sessizliğini 2 dakika yakınlıktan düşürüyordu.
    const realQuote = (s) => s.type === "quote" && !!String(s.quote || "").trim() && !!String(s.who || "").trim()
      && (["sad", "reveal", "calm"].includes(s.mood) || TESTIMONY.test(String(s.quote)));
    // 0 yas · 1 yazarın sad/reveal sessizliği · 2 gerçek alıntı · 3 kapanış satırının sessizliği · -1 aday değil
    const rank = (s, i) => {
      const text = stripTags(s.say);
      if (s.chapterCard || !text) return -1;
      if ((s.grief === true || griefLine(s.say)) && !HEARSAY.test(text) && !REPORTED.test(text)) return 0;
      if (s.silence && i !== lastIdx && ["sad", "reveal"].includes(s.mood)) return 1;
      if (realQuote(s)) return 2;
      return s.silence && i === lastIdx ? 3 : -1;
    };
    // Aynı sırada: yazarın kendi seçtiği an (Hastings 13:12, Harold'ın ölümü: 11 videodaki tek doruk sessizliği) >
    // somut (ad/sayı) ve tam cümle > tam cümle > yarım cümle; sonra bölümün yoğunluğu, sonra geç olan.
    const weight = (s) => {
      const text = stripTags(s.say);
      const whole = /[.!?…]["'”’)]?$/.test(text);
      return s.silence ? -1 : whole && (COUNTED.test(text) || NAMED.test(text)) ? 0 : whole ? 1 : 2;
    };
    const cands = scenes.map((s, i) => ({ i, r: rank(s, i), w: weight(s) }))
      .filter(({ i, r }) => r >= 0 && starts[i] >= SILENCE_HOOK_SEC)
      .sort((a, b) => a.r - b.r || a.w - b.w || (intensity[scenes[b.i].chapter ?? 0] || 0) - (intensity[scenes[a.i].chapter ?? 0] || 0) || b.i - a.i);
    const budget = Math.max(1, Math.ceil(minutes / SILENCE_EVERY_MIN));
    const keep = [];
    for (const { i } of cands) {
      if (keep.length >= budget) break;
      if (keep.some((k) => Math.abs(starts[k] - starts[i]) < SILENCE_GAP_SEC)) continue;
      keep.push(i);
    }
    let removed = 0, added = 0;
    scenes.forEach((s, i) => {
      if (keep.includes(i)) { if (!s.silence) { s.silence = true; added++; } }
      else if (s.silence) { delete s.silence; removed++; }
    });
    if (added) notes.push(`${added} yas/alıntı satırında müzik susuyor`);
    if (removed) notes.push(`${removed} sessizlik kaldırıldı`);
  }
  // SLAM
  // One slam per ~3 minutes, 90 s apart (Oct 2026, user: "heryere vuruculuğu kesip uyumlu editler koymamız lazım").
  const cap = Math.max(1, Math.ceil(minutes / SLAM_EVERY_MIN));
  let kept = 0, lastAt = -Infinity, demoted = 0;
  scenes.forEach((s, i) => {
    if (s.type !== "slam") return;
    if (kept < cap && starts[i] - lastAt >= SLAM_GAP_SEC) { kept++; lastAt = starts[i]; return; }
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
// person: yalnızca karede insan varsa · close/wide: çekim ölçeği · sky: günün saati (su altında, gece karesinde ve zaten
// gündüz olan karede anlamsız).
const VARIATIONS = [
  { text: "different angle: high-angle wide shot", wide: true },
  { text: "different angle: low-angle close-up, shallow depth of field", close: true },
  { text: "seen from behind, over-the-shoulder", person: true },
  { text: "extreme close-up detail of hands and objects", close: true, person: true },
  { text: "wide establishing shot from far away", wide: true },
  // Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026 (parlaklık 52-56): "night, practical lights" her tekrar
  // eden istemi geceye çeviriyordu. Gün değişirse gündüze doğru değişir.
  { text: "different time of day: bright morning daylight", sky: true },
];
const PERSON_IN = /\b(man|woman|men|women|people|person|crowd|crew|sailors?|soldiers?|officers?|figure|admiral|minister|worker|workers|hands?|faces?|boy|girl|child|children)\b/i;
const WIDE_IN = /\b(wide|establishing|aerial|panoram\w*|long (?:telephoto )?shot|underwater)\b/i;
const CLOSE_IN = /\b(close-up|close up|closeup|macro|detail)\b/i;
const NO_SKY_IN = /\b(underwater|under water|seabed|night|dusk|dawn|sunset|sunrise|midnight|daylight|morning|midday|noon)\b/i;
/** The variations that fit a prompt: none contradicts its framing or adds people it does not have. */
const variationsFor = (p) => VARIATIONS.filter((v) => !(v.person && !PERSON_IN.test(p)) && !(v.close && WIDE_IN.test(p)) && !(v.wide && CLOSE_IN.test(p) && !WIDE_IN.test(p)) && !(v.sky && NO_SKY_IN.test(p)));

/**
 * Aynı istem aynı önbellek dosyasına gider (motor istem+karakter+stil
 * özetiyle saklıyor): iki bölümde "empty office at night" aynı kareyi iki kez
 * gösteriyordu. Benzerlik ≥0,6 ise sonrakine farklı bir çekim eklenir.
 * DENİZALTI (24 Ekim 2026): ek çekim istemin konusuna bakmadan sahne sırasıyla seçiliyordu — "Wide underwater shot of two
 * dark submarine silhouettes…, extreme close-up detail of hands and objects", bir slamde "French ballistic missile
 * submarine… near Brest, extreme close-up detail of hands and objects". Ek yalnızca istemin çekim ölçeğiyle çelişmeyen,
 * karede olmayan insanı eklemeyen çeşitlemelerden seçilir.
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
    const pool = clash ? variationsFor(s.imagePrompt) : [];
    if (pool.length) { s.imagePrompt = `${s.imagePrompt}, ${pool[i % pool.length].text}`; varied++; }
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
/**
 * EKRANDAKİ SAYI = ANLATICININ SÖYLEDİĞİ. Irkutsk videosunda (Ekim 2026) anlatıcı "nearly two hundred" derken sayaç
 * 189 gösterdi; kanal sahibi: "200 diyor 189 çıkıyor". Sayacın rakamı satırda söylenmiyorsa ve satırda %20 yakın bir
 * rakam söyleniyorsa sayaç o rakamı gösterir (motor onu söylendiği kelimeye oturtur). Yıl sayaçları ve hiç rakam
 * söylenmeyen satırlar olduğu gibi kalır. Dönen: düzeltilen sayaç sayısı.
 */
export function alignCountersToSpeech(scenes, lang = "tr") {
  let n = 0;
  for (const s of scenes || []) {
    if (s?.type !== "counter" || s.year || !Number.isFinite(Number(s.to))) continue;
    const to = Number(s.to);
    const nums = numbersIn(stripTags(s.say), lang === "en" ? "en" : "tr").filter((x) => x > 0);
    if (!nums.length || spokenHas(nums, to)) continue;
    const near = nums.map((x) => ({ x, d: Math.abs(x - to) / Math.max(Math.abs(to), 1e-9) })).filter((c) => c.d <= 0.2).sort((a, b) => a.d - b.d)[0];
    if (!near) continue;
    s.to = near.x;
    if (Number.isInteger(near.x)) delete s.decimals;
    n++;
  }
  return n;
}

export function finalizeScenes(scenes, { job, plan, castKeys = [], intensity = [] }) {
  const lang = langOf(job);
  const notes = enforceGlobalQuotas(scenes, { minutes: plan.minutes, lang, intensity });
  const said = alignCountersToSpeech(scenes, lang);
  if (said) notes.push(`${said} sayaç anlatımda söylenen rakama eşitlendi`);
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
    // Yazarın kendi kapanışı da kapanıştır (Fransa borcu, 24 Ekim 2026): işaretsiz kalınca kurgu yönetmeni 13 sn'lik son
    // fotoğrafı bitiş ekranı öğelerinin altında bir "5%" sayacına çevirdi.
    if (outro) lastS.outro = true;
    else {
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
  const quotes = dropRepeatedQuotes(scenes);
  if (quotes) notes.push(`${quotes} tekrar eden alıntı çıkarıldı (alıntı en çok iki kez: açılış ve kapanış)`);
  const cards = capTextCards(scenes);
  if (cards) notes.push(`${cards} açıklama yazı kartı fotoğrafa çevrildi (yazı kartı ≤ %${Math.round(TEXT_CARD_MAX * 100)})`);
  return notes;
}

/**
 * AYNI ALINTI EN ÇOK İKİ KEZ (16 Ekim 2026, Ebola: DSÖ'nün "It is not known whether Ervebo may be protective…"
 * cümlesi açılışta, ortada ve kapanışta üç quote sahnesi oldu): 8 kelimelik ortak dizisi olan quote sahnelerinden ilki
 * ve sonuncusu kalır (açılış + kapanışa dönüş), aradakiler çıkar.
 */
export function dropRepeatedQuotes(scenes) {
  const grams = (s) => {
    const t = tokens(s.say).filter((w) => w.length > 1);
    const g = new Set();
    for (let k = 0; k + 8 <= t.length; k++) g.add(t.slice(k, k + 8).join(" "));
    return g;
  };
  const quotes = scenes.map((s, i) => ({ i, g: s?.type === "quote" ? grams(s) : null })).filter((x) => x.g?.size);
  const drop = new Set();
  for (const a of quotes) {
    const group = quotes.filter((b) => b === a || [...b.g].some((x) => a.g.has(x)));
    if (group.length >= 3) group.slice(1, -1).forEach((b) => drop.add(b.i));
  }
  return removeScenes(scenes, drop);
}

/*
 * YAZI KARTI ≤ %15 (kurgu karnesi hedefi; Ebola %20 çıktı, elle 9 açıklama kartı fotoğrafa çevrildi): fazlası varsa
 * KENDİ görseli olan, sayı taşımayan, vurgu yönlendirmesi ([slowly, with weight], [firmly]…) ve ifşa duygusu olmayan
 * words sahneleri — en uzun metinliden başlayarak — fotoğraf olur. Açılış ve son üç sahne, slam ve kendi resmi
 * olmayan (bg "prev") kartlar kalır.
 */
export const TEXT_CARD_MAX = 0.15;
const isTextCardScene = (s) => s?.type === "slam" || (s?.type === "words" && s.textMode !== "none");
const NUMBER_WORDS = /\b(?:hundred|thousand|million|billion|trillion|percent|half|third|quarter|twice|\w+teenth|\w+tieth|one in \w+)\b/i;
const EMPHASIS_TAG = /\[(?:slowly|firmly|whispers?|quiet|dramatic|with weight)[^\]]*\]/i;
export function capTextCards(scenes, max = TEXT_CARD_MAX) {
  const story = scenes.filter((s) => !(s?.type === "title" && s.chapterCard));
  let over = story.filter(isTextCardScene).length - Math.floor(story.length * max);
  if (over <= 0) return 0;
  const n = scenes.length;
  const cands = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.type === "words" && s.textMode !== "none" && i > 0 && i < n - 3 && s.bg !== "prev" && s.imagePrompt && !s.cta
      && !/\d/.test(`${s.text || ""} ${s.keyword || ""}`) && !NUMBER_WORDS.test(String(s.text || "")) && !EMPHASIS_TAG.test(String(s.say || "")) && s.mood !== "reveal")
    .sort((a, b) => String(b.s.text || "").length - String(a.s.text || "").length);
  let moved = 0;
  for (const { s } of cands) {
    if (over <= 0) break;
    s.type = "photo";
    delete s.text;
    delete s.keyword;
    over--;
    moved++;
  }
  return moved;
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

// Önce tam saniyeye yuvarlanır: 539,6 sn "9:00"dır, "8:60" değil (Fransa borcu, 24 Ekim 2026: kancasız aralık uyarısı).
export const clock = (sec) => { const t = Math.round(sec); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };

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
  // Araştırmacının kendi "Yapım notları / Prodüksiyon notları / Süre planı" bölümü yazara gitmez (22 Ekim 2026 denetimi:
  // Fransa araştırmasının "Açılış 0:45; tetikleyici ve önceki haftalar 2:00" süre planı bible'a aynen 2. bölüm oldu ve
  // izleyicinin üçte biri orada gitti). Yapıyı plan ve kurallar kurar; araştırma yalnızca olgu taşır.
  head = stripProductionNotes(head);
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
// (no \b after Turkish letters: "notları" ends in ı, which JS regex treats as a non-word character)
const PRODUCTION_NOTES = /^#{1,3}\s*(?:\d+[a-z]?\.\s*)?(?:yap[ıi]m notlar[ıi]|prod[üu]ksiyon notlar[ıi]|s[üu]re plan[ıi]|production notes|video notes)(?=\s|$|[(:])/i;
/** Drops the researcher's own production-notes sections (until the next heading of the same or higher level). */
export function stripProductionNotes(md) {
  const lines = String(md || "").split("\n");
  const out = [];
  let skip = 0;
  for (const l of lines) {
    const h = l.match(/^(#{1,3})\s/);
    if (h && skip && h[1].length <= skip) skip = 0;
    if (!skip && PRODUCTION_NOTES.test(l)) { skip = h ? h[1].length : 2; continue; }
    if (!skip) out.push(l);
  }
  return out.join("\n").trim();
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
    // Fransa videosu (22 Ekim 2026): "sırayla" okunup hikâye Eylül'deki kök nedenden başlatıldı; kancadan hemen sonra
    // 1:47'lik arka plan bölümünde izleyicinin üçte biri gitti. Haber BU HAFTADAN anlatılır.
    "- Yapı: 1) soğuk açılış — çelişkiyi tek cümlede ver (iki versiyon, iki iddia: 'Bir tüp kırıldı. Ya da Rusya'ya göre kırılmadı.'); 2) ne oldu — BU HAFTANIN olayları, neden-sonuçla; kancadan sonraki bölüm asla haftalar öncesine dönmez, kök neden (haftalar önce olan) ayrı ve kısa bir bölümde, en çok ~60-75 sn ve bugünkü bir olayın NEDENİ olarak bağlanır ('That anger had been building for a month. It started in a classroom.'); en eskiden başlayıp takvim yaprağı çevirme; 3) iki (ya da daha çok) versiyon, her biri KAYNAĞIYLA; 4) arka plan: bu neden önemli, ne kadar tehlikeli, gerçek bilim/olgu; 5) tarih: en çok BİR emsal, 60-90 sn, hemen bugüne dönülür (veba videosu 2. dakikada 1338'e gitti ve izleyici orada çıktı); 6) dürüst cevap ve sıradaki işaret.",
    "- DOĞRULUK: doğrulanmamış hiçbir şeyi olgu gibi söyleme — doğrulanamayanı hiç söyleme. Kaynak yalnızca hikâyenin merkezindeki tartışmalı ya da çarpıcı iddiada söylenir (bölümde en çok 2 kez: 'Saudi Arabia says… The Houthis deny it.'); her cümleyi atfetme, kaynak çekişmesi ve tarih farkı anlatma. Sayılar araştırmadaki kaynakla birebir. Panik ya da 'salgın başladı' gibi doğrulanmamış hüküm YOK; korkuyu değil bilgiyi büyüt.",
    "- Özel kişiler (kurban, şüpheli) isimle anılmaz; ölüm ve acı saygıyla.",
    "- title: merak boşluklu ve dürüst (\"The Black Death Never Disappeared\", \"What Really Happened at …\"); konu adı + 'explained' tek başına değil.",
    "- GÖRSEL: yayıncı kuruluşların haber görüntüsü ASLA (telif). Gerçek ve serbest kaynaklar önce (resmî kurum fotoğrafları, kamu malı arşiv, Commons, tarihî tablolar), sonra gerçek stok video; AI yalnızca kameranın görmediği an için, gerçek kişinin yüzü asla.",
  ];
}

/**
 * What the chapter writer has to see of the chapters before it: the whole narration so far, the opening's own question
 * and promise lines (so a callback quotes them, not an invented one), and where in the video this chapter starts.
 */
export function soFarBlock(chapters = [], wpm = 150) {
  if (!chapters.length) return "";
  const lines = chapters.map((sc, k) => `— Bölüm ${k + 1}: ${sc.map((s) => stripTags(s.say)).filter(Boolean).join(" ")}`);
  const opening = (chapters[0] || []).map((s) => stripTags(s.say)).filter((t) => /\?|by the end|you'll know|you will know/i.test(t));
  const words = chapters.flat().reduce((n, s) => n + (stripTags(s.say).match(/[\p{L}\p{N}'’]+/gu) || []).length, 0);
  const at = (words / wpm) * 60;
  return [
    `BU BÖLÜM videonun ~${Math.floor(at / 60)}:${String(Math.floor(at % 60)).padStart(2, "0")}'ında başlıyor.`,
    ...(opening.length ? [`AÇILIŞTAKİ SORU/VAAT (geri çağırırken bunları AYNEN an): ${opening.map((t) => `"${t}"`).join(" ")}`] : []),
    "ŞİMDİYE KADAR YAZILAN ANLATIM (hiçbir olguyu, benzetmeyi ya da cümleyi tekrarlama; kaldığı yerden devam et):",
    ...lines,
  ].join("\n");
}

/** Lint kinds the editor gets a focused second look at when they survive the first read. */
export const SECOND_ROUND_KINDS = new Set(["leak", "unit", "count", "meta", "template", "unsupported", "quote", "absolute", "relative-time", "vague-source", "abstract", "hook-number", "hook-modern"]);

/** News plan: at most one background chapter, never the 2nd (the minute after the hook), never the last. */
export function newsBackgroundErrors(chapters = []) {
  const bg = chapters.map((c, i) => (c?.background ? i : -1)).filter((i) => i >= 0);
  const e = [];
  if (bg.includes(1)) e.push("chapters[1].background: kancadan sonraki bölüm arka plan olamaz — bu haftanın olaylarıyla devam et, kök nedeni sonra ve kısa anlat");
  if (bg.length > 1) e.push(`en çok BİR arka plan bölümü (gelen ${bg.length})`);
  if (chapters.length > 2 && bg.includes(chapters.length - 1)) e.push("son bölüm arka plan olamaz");
  return e;
}
/** The background chapter gets ~60-75 s; its words go to the news-week chapters (total kept). → words moved */
export function budgetBackground(plan, chapters = []) {
  if (!Array.isArray(plan?.chapterWords)) return 0;
  const bg = chapters.map((c, i) => (c?.background ? i : -1)).filter((i) => i >= 0 && plan.chapterWords[i] > BACKGROUND_WORDS);
  if (!bg.length) return 0;
  const rest = plan.chapterWords.map((_, i) => i).filter((i) => !bg.includes(i));
  if (!rest.length) return 0;
  let moved = 0;
  for (const i of bg) {
    const ratio = BACKGROUND_WORDS / plan.chapterWords[i];
    moved += plan.chapterWords[i] - BACKGROUND_WORDS;
    plan.chapterWords[i] = BACKGROUND_WORDS;
    // Fewer words, fewer scenes (a short chapter of many tiny lines reads like a list).
    if (Array.isArray(plan.chapterScenes?.[i])) plan.chapterScenes[i] = [Math.max(3, Math.round(plan.chapterScenes[i][0] * ratio)), Math.max(4, Math.round(plan.chapterScenes[i][1] * ratio))];
  }
  const each = Math.floor(moved / rest.length);
  rest.forEach((i, k) => { plan.chapterWords[i] += each + (k < moved - each * rest.length ? 1 : 0); });
  return moved;
}

/** The news explainer's per-chapter rules. */
/** Döngü defteri: en az bir açık döngü videonun ikinci yarısında (bölüm ≥ %55) cevaplanır. */
export const lateLoopPayoff = (loops = [], n = 0) => (loops || []).some((l) => Number.isInteger(l?.payoffChapter) && l.payoffChapter >= Math.ceil(n * 0.55));

export function newsChapterRules({ i, n }) {
  if (i === 0) return ["SOĞUK AÇILIŞ (GÜNDEM): ilk cümle çelişkinin kendisi; ilk 8 sn içinde olayın ne olduğu ve neden herkesin konuştuğu belli olsun. Abartma: ilk cümle doğru olmalı."];
  if (i === n - 1) return ["SON BÖLÜM (GÜNDEM): dürüst cevap — kesin olan, belirsiz olan, neyin değişmesi gerektiği (izlenecek işaret). Korkutma da yatıştırma da: kanıt ne diyorsa o."];
  return ["Versiyonlar karışmasın: tartışmalı iddiada kim ne diyor açık olsun (bölümde en çok 2 kaynak adı), gerisi düz anlatım. Bir tarih ya da sayı söylendiğinde araştırmadaki değerle birebir; kaynakların birbirini doğrulamaması anlatılmaz."];
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

function chapterPrompt({ i, bible, plan, written, lang, catalog = null, aiCap = null }) {
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
    ...(first ? hookGrowthLines({ news: !!plan.news }) : []),
    ...editGrowthLines({ maps: !!plan.maps }),
    ...voiceGrowthLines({ style: voiceStyleOf(plan) }), ...honestyLines({ news: !!plan.news }),
    `ŞİMDİ SADECE BÖLÜM ${i + 1}/${n}: "${ch.title}"`,
    `Hedef: ${ch.goal}`,
    `İşlenecek olgular: ${ch.covers.join("; ")}`,
    `Giriş kancası (bölümün ilk satırı bunu yapar): ${ch.hookIn}`,
    `Dönüm noktası (mood yalnızca burada değişir): ${ch.turn}`,
    last ? `Kapanış fikri: ${ch.cliffhanger}` : `Bölüm sonu (son sahne bunu bırakır, bir sonraki bölüme merak): ${ch.cliffhanger}`,
    `Yoğunluk: ${ch.intensity}/5${ch.midpoint ? " — ORTA NOKTA: hikâyenin yönünü değiştiren büyük ifşa bu bölümde" : ""}.`,
    setup.length ? `Bu bölümde KUR (cevaplama): ${setup.join(" · ")}` : "",
    payoff.length ? `Bu bölümde CEVAPLA: ${payoff.join(" · ")} — cevabı ADIYLA geri çağırarak ver ('Remember the question we started with?', 'This is where we came in.').` : "",
    open.length ? `Açık kalan sorular (hatırlat, cevaplama — yeniden kanca): ${open.join(" · ")}` : "",
    "",
    // Macar Devrimi (Ekim 2026): tavan yalnızca doğrulamadaydı — bölümler 10, 6, 4 AI sahnesiyle gelip her biri ayrı bir
    // ücretli onarım turu yedi. Tavan yazara baştan söylenir.
    aiCap != null ? `GÖRSEL KAYNAĞI (ZORUNLU): bu bölümde EN FAZLA ${aiCap} sahne source "ai" olabilir (videoda toplam ~${AI_PER_VIDEO}). Gerisi gerçek arşiv (archive: dönemin fotoğrafı, belge, eser, yerin kendisi), stok (stock: dönemle çelişmeyen doğa/doku) ya da words/slam için bg "prev". Atmosfer satırları da önce stok/arşivle çözülür.` : "",
    `UZUNLUK (ZORUNLU): toplam ${target} kelime anlatım (etiketler hariç, en az ${min}); ${lo}-${hi} sahne. Kelime hedefi sahne sayısından önemlidir: sahneler az kalırsa satırları uzat.`,
    first
      ? `AÇILIŞ (ilk 30 sn): ${openingRule(bible, g)} KONU NETLİĞİ (zorunlu): izleyici konuyu ilk 10 saniyede anlar — konunun adı (başlıktaki/aramadaki anahtar ifade) ilk 1-2 cümlede söylenir; kanca bu konunun KENDİ en çarpıcı, doğrulanmış olgusudur, başka bir hikâye gibi açılmaz. Bir sahneyle/insanla açılıyorsa o sahne bu konunun içinden olur ve en geç ~15 sn'de konunun adına bağlanır. Bilinen/çok aranan bir konuda ilk dakika: şu an ne oluyor + izleyiciye neden dokunuyor + bu video neyi cevaplıyor. Kanca ("${bible.hookWord}") ilk ~8 sn içinde düşsün. KANCA ÇARPICI KALIR (MagnatesMedia, LEMMiNO, ColdFusion, Moon, Ekim 2026 incelemesi): ilk satır bu hikâyenin gerçek bir ANI, SÖZÜ ya da RAKAMI — düz bir tanım cümlesi değil; vaat TEK cümledir ve hemen ardından henüz söylenmemiş en güçlü olgu gelir (fragman listesi, ikinci vaat, özet yok — 22 Ekim 2026: Fransa açılışı vaat + meta + 'basics' ile 90 sn'ye uzadı, izleyicinin dörtte biri gitti); ilk bölümde hikâye bir İNSANLA ve onu tanıtan tek tuhaf/insani ayrıntıyla başlar. İlk 4 sahneden biri title: videonun adı "${bible.title}" (~20 sn içinde). Vaadi ("${bible.promise}") ilk ~30 sn içinde, yani anlatımın ilk ~55 kelimesinde söyle; merkez soruyu sezdir: "${bible.centralQuestion}". İZLENME VERİSİ (kanalın kendi YouTube grafikleri, Ekim 2026): uzun videolar izleyicinin %70-85'ini ilk 20-40 sn'de kaybediyor, sonrası düz gidiyor; en kötüsü yavaş/fısıltılı atmosfer açılışı (Napolyon "[slowly] Midsummer, 1812. A river in Lithuania..." → ~40 sn'de %85 gitti). Bu yüzden giriş mantığı ne olursa olsun: İLK SAHNE (ilk 3 sn) videonun EN çarpıcı GERÇEK görseli (arşiv fotoğrafı/klibi) + videonun en sert satırı; ilk 10 sn'de [slowly]/[whispers]/[softly] etiketi yok; ilk ~30 sn'deki her sahne tek kısa cümle (≤ ~12 kelime, 2-4 sn) — resim sık değişsin; kapakta kullanılacak görsel ya da sözcük ilk 5 sn'de görünsün.`
      : plan.ranking
        ? `MADDE #${ch.rank}: ${ch.item}${ch.place ? ` — ${ch.place}` : ""}${ch.year ? `, ${ch.year < 0 ? `MÖ ${-ch.year}` : ch.year}` : ""}. Sıra kartını (dev #${ch.rank}, maddenin adı, yer ve yıl) motor koyar: anlatıcı sıra numarasını ve maddenin başlığını SÖYLEMEZ, title sahnesi yazma. İlk satır doğrudan maddenin en çarpıcı olgusu.`
        : `Bölüm kartını ("BÖLÜM ${i + 1} — ${ch.title}") motor koyar: anlatıcı bölüm başlığını söylemez, title sahnesi yazma. İlk satır giriş kancasını yapar.`,
    ...(plan.ranking ? rankingChapterRules({ i, n, ch, bible }) : []),
    ...(plan.news ? newsChapterRules({ i, n }) : []),
    ...(plan.news && ch.background ? [`ARKA PLAN BÖLÜMÜ (haber haftasından önce): EN ÇOK ~${BACKGROUND_WORDS} kelime (~60-75 sn). İlk cümle bugünkü bir olayı geçmişe bağlar ('That anger did not start on Saturday. It started in a classroom in September.'); her geçmiş olay bugünkü sonucuyla söylenir; tarih sayımı ve liste yok; son cümle hikâyeyi bu haftaya geri getirir.`] : []),
    ...(plan.ranking ? [] : spineLines({ news: !!plan.news, story: voiceStyleOf(plan) === "story", first, last })),
    ...(!first && !last && ch.midpoint ? middleGrowthLines() : []),
    ...(last && !plan.ranking ? endGrowthLines({ news: !!plan.news, finance: !!plan.finance, series: plan.series || "" }) : []),
    last
      ? `SON BÖLÜM: merkez soruyu ("${bible.centralQuestion}") açıkça cevapla, açık döngüleri kapat ve soğuk açılışa geri dön (kanca: "${bible.hookWord}"${opener ? `; açılış satırı: "${stripTags(opener.say)}"` : ""}). Son sahne sakin bir kapanış: photo veya words, dur 12-15, 3-8 kelimelik kısa bir satır; müzik onun altında çözülür. silence en fazla 1 kez, en ağır duygu anında.`
      : "Bu bölümde silence YOK; slam en fazla 1.",
    before.length ? `ÖNCEKİ BÖLÜMLERDE ANLATILDI (tekrar etme, gerekirse tek kelimeyle an): ${before.join("; ")}` : "",
    used.length ? `Kullanılmış vuruşlar (tekrarlama): ${used.join("; ")}` : "",
    after.length ? `SONRAKİ BÖLÜMLERİN OLGULARI (şimdiden verme): ${after.join("; ")}` : "",
    // 22 Ekim 2026 denetimi: yazar önceki bölümlerden yalnızca son 3 satırı görüyordu — bölümler arası tekrarlar ("…a
    // miracle" üç kez) ve açılıştaki gerçek soruyu bilmeden yazılan geri çağırmalar buradan çıktı. Artık bütün metin.
    !first ? soFarBlock(written.slice(0, i)) : "",
    prev?.length ? `ÖNCEKİ BÖLÜMÜN SON SATIRLARI (kaldığı yerden, aynı cümleyi tekrarlamadan devam et):\n${prev.slice(-3).map((s) => `- ${stripTags(s.say)}`).join("\n")}` : "",
    !first && opener ? `Soğuk açılış (bölüm 1) böyleydi: "${stripTags(opener.say)}"${opener.text ? ` · ekrandaki kanca: "${opener.text}"` : ""}` : "",
    ...rhetoricLines(bible.rhetoric, i, n),
    catalog?.length ? catalogPromptBlock(catalog, ch) : "",
    lang === "en" ? "Write every on-screen text and narration in English." : "",
  ].filter(Boolean).join("\n");
}

/*
 * GERÇEK KİŞİLER LİSTESİ (realCast) — Madoff (20261026-27b4d8) ve Lula (20261026-29db03), 26 Ekim 2026. Motor
 * (docu-engine/lib/produce.mjs hideRealFace) gerçek bir kişinin AI karesinde yüzü gizler, ama realCast'ı hiçbir adım
 * yazmıyordu: yalnızca arşiv sahnesine cast'lanan kişi "gerçek" sayılıyordu. "[quietly] On December 10, 2008, Madoff told
 * his sons, Mark and Andrew, the truth." satırının ardındaki "Mark Madoff Andrew Madoff 2008" araması AI'a düştü ve iki
 * oğul uydurma yüzle çizildi (gorsel-kutusu #6); Lula'da cast boştu, Lula ve Bolsonaro'lara benzemeyen adamlar çizildi.
 * Senaryo bitince kod realCast'ı yazar: gerçek cast anahtarları (arşive cast'lanan ya da aramada/isim kartında adıyla
 * geçen) ve anlatımda adı geçen gerçek kişiler — isim kartı, alıntı sahibi, unvan ("Senator Flávio Bolsonaro"),
 * akrabalık ("his sons, Mark and Andrew", "Jair Bolsonaro's eldest son"), portre araması ("Harry Markopolos 2009
 * portrait"). Kurallar produce.mjs realPeople ile AYNI tutulur (motor eski senaryolarda kendisi de çıkarır); motor
 * uygulamanın dışında kurulu (resources/docu-engine), buradan içe aktarılamaz — docu-edit-director.js'teki dünya
 * haritası notu. Kurum ("World Health Organization") ve yer ("King Fahd Airport") kişi sayılmaz.
 */
const foldName = (s) => String(s ?? "").normalize("NFD").replace(/\p{M}+/gu, "");
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME_WORD = String.raw`\p{Lu}(?:['’]\p{Lu})?[\p{L}-]*\p{Ll}[\p{L}-]*`;
const NAME_PARTICLE = String.raw`(?:da|de|do|dos|das|del|della|di|du|van|von|der|den|ter|le|la|bin|ibn|al|el)`;
const NAME_RUN = String.raw`${NAME_WORD}(?:\s+(?:${NAME_PARTICLE}\s+)?${NAME_WORD}){0,3}`;
const L_EDGE = String.raw`(?<![\p{L}\p{N}])`;
const R_EDGE = String.raw`(?![\p{L}\p{N}])`;
const TITLES_UPPER = ["Vice President", "Prime Minister", "Senator", "Sen", "President", "Minister", "Governor", "Mayor", "Judge", "Justice", "Chancellor", "King", "Queen", "Prince", "Princess", "Emperor", "Empress", "Tsar", "Czar", "Pope", "Cardinal", "Archbishop", "Bishop", "General", "Admiral", "Colonel", "Col", "Captain", "Capt", "Lieutenant", "Lt", "Sergeant", "Sgt", "Commander", "Marshal", "Sheriff", "Detective", "Dr", "Doctor", "Professor", "Prof", "Rev", "Reverend", "Mr", "Mrs", "Ms", "Sir", "Dame", "Lord", "Lady", "Ayatollah", "Sheikh", "Sultan", "Rabbi", "Imam"];
const TITLES_LOWER = ["vice president", "prime minister", "senator", "president", "minister", "governor", "mayor", "judge", "chancellor"];
// Yalnızca kısaltma noktayla biter: "Dr. Legasov" — "Justice. Words the conquerors brought" (Hastings) ad değildir.
const TITLE_ABBRS = new Set(["Sen", "Col", "Capt", "Lt", "Sgt", "Dr", "Prof", "Rev", "Mr", "Mrs", "Ms"]);
const PERSON_TITLE = String.raw`(?:${[...TITLES_UPPER, ...TITLES_LOWER].map((t) => `${reEsc(t)}${TITLE_ABBRS.has(t) ? String.raw`\.?` : ""}`).join("|")})`;
// Ülke adı kişi adının parçası değildir (inceleme, 27 Ekim 2026; sıradaki İsrail 2026 seçim videosu): "Defense Minister Israel
// Katz" "Israel"i ad sözcüğü yapıyordu, "Israel's sons and daughters" / "Gaza's children" yeri kişi. produce.mjs PLACE_NAMES
// ile AYNI (docu-archive.js YER_ADI da).
const PLACE_WORDS = "israel israeli israelis gaza palestine palestinian palestinians iran iranian iranians iraq iraqi syria syrian lebanon lebanese egypt egyptian yemen yemeni saudi saudis arabia arab arabs qatar qatari oman turkey turkiye turkish russia russian russians ukraine ukrainian ukrainians belarus china chinese taiwan japan japanese korea korean india pakistan pakistani afghanistan afghan america american americans britain british england scotland ireland irish france germany italy italian spain spanish portugal europe european africa african asia brazil brazilian argentina mexico mexican canada canadian venezuela venezuelan cuba cuban hungary hungarian poland polish soviet jewish muslim houthi houthis idf jerusalem tel aviv moscow beijing tehran kyiv kiev hamas hezbollah kremlin".split(" ");
const PLACE_SET = new Set(PLACE_WORDS);
const NAME_STOPS = new Set([
  ...PLACE_WORDS,
  ...TITLES_UPPER.flatMap((t) => t.toLowerCase().split(" ")),
  ..."the a an and or but so then now yet still in on at of for from by with to into after before when while during since until as his her their its our my your this that these those there here what who whom why how where which it he she they we you mr mrs ms sir dame lord lady saint st jr sr ii iii iv remember meanwhile however today tonight yesterday tomorrow later earlier".split(" "),
  ..."january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday".split(" "),
  ..."court house senate congress parliament assembly building tower palace square street avenue road bridge river lake mountain station airport hospital university college school church cathedral museum bank exchange market office department ministry committee council commission agency bureau police army navy force party group company corporation inc ltd llc fund foundation institute center centre hall plant reactor unit prison jail federal national supreme state city county republic kingdom union united states new old north south east west central great royal international world global times post journal news daily magazine tribune herald press gazette globe portrait motors electric staff will hope grace faith joy bill".split(" "),
]);
const KIN_WORDS = String.raw`(?:sons?|daughters?|wife|husband|widow|brothers?|sisters?|father|mother|parents|children|nephew|niece|grandson|granddaughter|cousin|lawyer|attorney|deputy|aide|assistant|partner|accountant|secretary)`;
// İyelik ("X's …") yalnızca AİLE sözcüğüyle (inceleme, 27 Ekim 2026; sıradaki İsrail 2026 seçim videosu): "Israel's attorney
// general", "Brazil's deputy foreign minister", "Apple's lawyer" ülkeyi/şirketi "gerçek kişi" yapıyordu. "Madoff's sons"
// (20261026-27b4d8) yine Madoff. "his lawyer, Ira Sorkin" (üçüncü kalıp) iş sözcüklerini korur. produce.mjs FAMILY ile AYNI.
const FAMILY_WORDS = String.raw`(?:sons?|daughters?|wife|wives|husband|widow|widower|brothers?|sisters?|father|mother|parents|children|nephews?|nieces?|grandsons?|granddaughters?|grandchildren|cousins?|stepsons?|stepdaughters?)`;
const NAME_CUES = [
  new RegExp(String.raw`${L_EDGE}${PERSON_TITLE}\s+(?:Sir\s+)?(${NAME_RUN})`, "gu"),
  new RegExp(String.raw`${L_EDGE}(${NAME_RUN})['’]s\s+(?:\p{Ll}+\s+){0,2}${FAMILY_WORDS}${R_EDGE}`, "gu"),
  new RegExp(String.raw`${L_EDGE}(?:[Hh]is|[Hh]er|[Tt]heir)\s+(?:\p{Ll}+\s+){0,2}${KIN_WORDS},?\s+(${NAME_RUN})(?:\s*(?:,|and|&)\s*(${NAME_RUN}))?`, "gu"),
];
const SITTER = new RegExp(String.raw`^\s*(?:${PERSON_TITLE}\s+)?(${NAME_WORD}\s+(?:${NAME_PARTICLE}\s+)?${NAME_WORD})${R_EDGE}(?=.*\bportrait\b)`, "u");
const READS_AS_PERSON = new RegExp(String.raw`^(?:${PERSON_TITLE}\s+)?(?:${NAME_WORD}|\p{Lu}\.|${NAME_PARTICLE})(?:\s+(?:${NAME_WORD}|\p{Lu}\.|${NAME_PARTICLE})){0,5}$`, "u");
const NOT_A_PERSON = /\b(?:agency|organi[sz]ation|association|institute|committee|council|commission|ministry|department|office|bureau|service|authority|administration|court|bank|fund|group|company|corporation|foundation|university|airport|party|police|army|navy|union|network|news|times|post|journal|press|international|national|federal|world)\b/i;
const CAST_ROLE_WORD = /^(?:young|younger|old|older|elder|early|late|jr|sr|senior|junior|child|children|teen|adult|middle|aged?|man|men|woman|women|boy|girl|\d+s?|student|officer|crs|police|policeman|guard|soldier|worker|firefighter|fireman|nurse|doctor|farmer|priest|monk|knight|ceo|lawyer|judge|investor|trader|banker|clerk|driver|pilot|diver|engineer|miner|sailor|survivor|witness|victim|mother|father|son|daughter|wife|husband|protester|rioter|villager|peasant|merchant|agent|detective|reporter|journalist|official|minister|president|general|admiral|captain|narrator|host|crowd|operator|scientist|analyst|examiner|regulator|executive)$/;
const personWords = (n) => (foldName(n).match(new RegExp(NAME_WORD, "gu")) ?? []).filter((w) => w.length >= 3 && !NAME_STOPS.has(w.toLowerCase()));
const isPersonName = (n) => personWords(n).length > 0 && !NOT_A_PERSON.test(foldName(n));

/** Real people of a finished script: real cast keys first, then the real people the narration names (realCast). */
export function realCastOf(script) {
  const cast = script?.cast ?? {};
  const scenes = script?.scenes ?? [];
  const names = new Set();
  for (const s of scenes) {
    for (const v of [s.name, s.who]) {
      const n = String(v ?? "").split(/[,(]/)[0].trim();
      if (n && READS_AS_PERSON.test(n) && isPersonName(n)) names.add(n);
    }
    for (const t of [stripTags(s.say), s.text, s.caption]) {
      for (const re of NAME_CUES) for (const m of String(t ?? "").matchAll(re)) for (const n of m.slice(1)) if (n && isPersonName(n)) names.add(n);
    }
    const sitter = typeof s.search === "string" ? s.search.match(SITTER)?.[1] : null;
    if (sitter && isPersonName(sitter) && personWords(sitter).length === 2) names.add(sitter);
  }
  // A cast member is real when cast on an archive scene, or searched/carded by name ("Harry Markopolos 2009 portrait").
  const evidence = foldName([...scenes.flatMap((s) => [s.search, s.commons]), ...names].filter((x) => typeof x === "string").join(" \n "));
  // Yer ya da halk adı anahtarda ad değildir ("israeli_voter", "tel_aviv_protester", "idf_soldier"; produce.mjs ile AYNI).
  const keyWords = (k) => k.split("_").filter((w) => w.length >= 3 && !CAST_ROLE_WORD.test(w) && !PLACE_SET.has(w));
  const asWritten = (w) => new RegExp(`${L_EDGE}${w[0].toUpperCase()}${[...w.slice(1)].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : reEsc(c))).join("")}${R_EDGE}`, "u");
  const keys = Object.keys(cast).filter((k) => scenes.some((s) => (s.archived || s.source === "archive") && (s.cast || []).includes(k)) || keyWords(k).some((w) => asWritten(w).test(evidence)));
  return [...keys, ...[...names].filter((n) => !cast[n])];
}

/**
 * @param opts.dir          iş klasörü — kutsal kitap ve bölümler buraya yazılır (devam için)
 * @param opts.isCancelled  kullanıcının iptali; bölümler arasında ve isteklerde denetlenir
 * @param opts.llm          test için callJSON yerine geçer
 * @param opts.eleven       {musicSource, libraryReady} — kredi tahmini için
 * @returns docu-engine Script (id = job.id). `stats` uzunluk karnesini taşır.
 */
/** How many AI pictures an archive documentary may carry in all (the writer prompt says ~15; the engine caps the rest). */
export const AI_PER_VIDEO = 15;

export async function runDocuScript(job, research, usage, logFn, opts = {}) {
  // chapterModel: bölümleri yazan model (Sonnet 5.5). Hikâye planı (bible) ayarlardaki modelle (Opus 5.5) — ruh planda.
  // bibleModel: hikâye planını yazan model (Senarist ayarı; boşsa ayarlardaki ana model).
  // voiceSpeed: ayarların docuVoiceSpeed'i — süre tavanı ölçülen film temposunu bu hızla ölçekler (yoksa ölçülen 1.1).
  // styleVoices: ayarların docuStyleVoices'u — tavan işin kanal sesinin temposuyla; iş başka sesle okunuyorsa en yavaşıyla.
  const { dir = null, isCancelled = () => false, llm = callJSON, eleven = {}, chapterModel = null, bibleModel = null, commonsCatalog = true, voiceSpeed, styleVoices = null } = opts;
  const plan = docuPlan(job);
  /** This chapter's word target (the ranking's intro is short and its number one long). */
  const cw = (i) => plan.chapterWords?.[i] ?? plan.wordsPerChapter;
  const lang = langOf(job);
  const archive = (job.docuSource || "archive") === "archive";
  const fullResearch = researchForWriters(research);
  const guard = () => { if (isCancelled()) throw new Error("cancelled"); };
  const warnings = [];
  logFn(`Sinematik senaryo planı: ${plan.chapters} bölüm, ${plan.scenesRange[0] * plan.chapters}-${plan.scenesRange[1] * plan.chapters} sahne, ${plan.words} kelime (hedef ${plan.minutes} dk + %${Math.round((DOCU_HEADROOM - 1) * 100)} pay)`);

  const key = sha1([DOCU_PROMPT_VERSION, job.topic, job.guidance || "", job.durationPreset, job.docuGenre || "", job.docuSource || "archive", job.docuFormat || "", lang, job.tone || "", sha1(fullResearch), job.docuMapMode || "", ...(job.docuSeries ? [job.docuSeries] : [])]);
  const store = scriptStore(dir, key);

  // 1) KUTSAL KİTAP
  // The plan's own rules (chapter count, genre, loops, news background) — the writer's plan and the plan editor's
  // corrected plan both pass through them.
  const bibleErrors = (b) => {
    const n = plan.chapters;
    const errors = [];
    if (b.chapters?.length !== n) errors.push(`tam ${n} bölüm gerekli, ${b.chapters?.length} geldi`);
    if (job.docuGenre && b.genre !== job.docuGenre) errors.push(`genre "${job.docuGenre}" olmalı`);
    // Karanlık görsel dil kodla düzelir, plan yeniden yazdırılmaz (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026).
    const darkLook = darkLookWords(b.visualStyle);
    if (darkLook.length) {
      b.visualStyle = brightLook(b.visualStyle);
      logFn(`Görsel dil denetimi: karanlık ifadeler atıldı (${darkLook.join(", ")}) → "${String(b.visualStyle).slice(0, 160)}"`);
    }
    if (!errors.length) {
      fixRanking(b, plan);
      fixBible(b, n);
      if (n >= 3 && b.openLoops.length < 2) errors.push("openLoops: en az 2 geçerli açık döngü gerekli (1 ≤ setupChapter < payoffChapter ≤ bölüm sayısı)");
      else if (n >= 4 && !lateLoopPayoff(b.openLoops, n)) errors.push(`openLoops: en az bir döngü videonun ikinci yarısında cevaplanmalı (payoffChapter ≥ ${Math.ceil(n * 0.55)})`);
      if (plan.news) errors.push(...newsBackgroundErrors(b.chapters));
    }
    return errors;
  };
  let bible = store.bible();
  if (bible) logFn("Senaryo planı (kutsal kitap) kayıttan alındı");
  else {
    guard();
    const n = plan.chapters;
    // Giriş mantığı: konunun tonuna uyan, kanalda son kullanılmamış adaylar (docu-hooks.js).
    const hookTone = plan.news ? "news" : plan.ranking ? "ranking" : job.docuGenre || "documentary";
    const hookCands = hookCandidates({ tone: hookTone, topic: job.topic, history: readHookHistory(opts.hookDir ?? DATA_DIR) });
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
        ...hookPromptLines(hookCands),
        ...bibleGrowthLines(nicheOf({ genre: job.docuGenre, format: plan.news ? "news" : "", topic: job.topic })),
        ...hookGrowthLines({ news: !!plan.news }),
        ...(job.docuSeries ? [`SERİ: bu video "${job.docuSeries}" serisinin bir bölümü — başlık bu şablonun kalıbında, açılış serinin vaadini ilk 15 saniyede verir.`] : []),
        ...editGrowthLines({ maps: !!plan.maps }),
        ...voiceGrowthLines({ style: voiceStyleOf(plan) }), ...honestyLines({ news: !!plan.news }),
        "UZUN FORM YAPISI (MagnatesMedia / Netflix belgesel kurgusu):",
        "- centralQuestion: videonun taşıdığı tek büyük soru; izleyici cevabı için sonuna kadar kalır, SON bölüm cevaplar.",
        "- stakes: ne kaybedilebilirdi, neden önemli. promise: ilk 30 sn içinde söylenecek vaat. hookWord: soğuk açılışın kancası; son bölüm ona geri döner.",
        `- openLoops: ${n >= 3 ? "3-5" : "0-2"} açık döngü — erken bir bölümde kurulan, SONRAKİ bir bölümde cevaplanan merak soruları (bölüm numaraları 1'den başlar). Videonun "yeniden kanca" omurgası bunlar: izleyici her 60-90 sn'de bir soruya ya da cevaba çarpmalı — çoğunlukla bir OLAY olarak ('And within minutes of take-off, the first link broke.'), soru cümlesi olarak değil (tutmuşlar dakikada ~0,3 soru soruyor; videoda en çok 4-6 soru cümlesi).`,
        // 20 Ekim 2026 derin inceleme: Hidden History kancada açtığı 3 vaadi videonun ikinci yarısında adıyla geri çağırarak
        // ödüyor ("Remember the promise…"); ilk bölümlerde harcanan vaat izleyiciyi tutmuyor.
        n >= 4 ? `- DÖNGÜ DEFTERİ: kancada açılan vaat ve döngülerden EN AZ BİRİ videonun ikinci yarısında cevaplanır (payoffChapter ≥ ${Math.ceil(n * 0.55)}); cevap bölümü onu adıyla geri çağırır.` : "",
        "- Bölüm başlığı (title) bir MERAK KARTI olabilir: bölümün cevapladığı soru ya da cesur iddia ('The Numbers Don't Match', 'Who Was Really in Charge?'). Kart anlatıcıdan önce ekrana gelir; bu bilerek konulmuş bir merak kartıdır (Weird History'nin 3 zirvesinden 2'si anlatıcıdan önce gelen iddia kartı).",
        "- Her bölüm: hookIn (ilk cümlenin kancası), turn (bölüm içindeki dönüm; müzik/duygu yalnızca burada değişir), cliffhanger (bölüm sonunda bırakılan merak — bir olay ya da yeni bir olgu, her bölümde aynı teaser cümlesi değil: 'Whether it mattered was another question' gibi kalıp videoda en çok bir kez; son bölümde akılda kalan kapanış fikri), intensity 1-5 (gerilim eğrisi yükselir, zirve son üçte birde), midpoint (yalnızca ortadaki BİR bölüm true: %45-60 civarında hikâyenin yönünü değiştiren büyük ifşa).",
        "- Tırmanış: her bölüm bir öncekinden daha büyük bir bedel ya da soru açar; son bölüm hepsini öder ve açılışa geri döner.",
        "- covers çakışmasın: her somut olgu tek bir bölüme ait.",
        job.docuGenre ? `genre MUTLAKA "${job.docuGenre}" olacak (kanal sahibi seçti); görsel dili de bu stile göre kur.` : "Önce hikâyenin ruhuna göre genre seç (yalnızca konu türüne göre değil: bir tarih hikâyesi aslında bir suç dosyası ya da bir insanın yükselişi olabilir).",
        "Görsel dil hem döneme hem stile uysun: 1600ler için yağlı boya tablo, 1970ler için grenli renkli film fotoğrafı, suç için net ve iyi aydınlatılmış delil fotoğrafı, uzay için NASA arşivi ve teleskop görüntüsü, biyografi için sıcak aile fotoğrafı.",
        // Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: 7 videonun 7'si karanlık ve neredeyse renksizdi.
        "Görsel dil KARANLIK DEĞİL: parlak, iyi pozlanmış, doğal renkli fotoğraf (renkli filmden önceki dönem — 1940 öncesi — siyah-beyaz/sepya olabilir). Türün renk vurgusu (soğuk, altın, kırmızı) grafik ve kartlarda motorun işi; visualStyle'a palet ya da ruh hâli ('moody', 'noir', 'low-key', 'deep shadows', 'green-black') yazma.",
      ].join("\n"),
      schema: withOpeningLogic(bibleSchema(plan), hookCands),
      maxTokens: 16000,
      // Yapı planı en önemli karar: yüksek efor. llm.js bunu output_config.effort'a
      // taşıdığında etkin; taşımadığı sürece yok sayılır (zararsız).
      effort: "high",
      usage,
      logFn,
      isCancelled,
      validate: (b) => bibleErrors(b),
    });
    // PLAN EDİTÖRÜ (docu-plan-editor.js, 22 Ekim 2026): bölümler yazılmadan önce plan izleyici koltuğundan okunur —
    // açılış tek vaatle ~55 sn mi, 2. bölüm bu haftadan mı, zirveden sonra olay mı geliyor, plandaki olgular araştırmada
    // var mı. Düzeltilmiş plan bütün plan kurallarından geçmezse özgünü kalır. Çökerse plan olduğu gibi devam eder.
    if (opts.planEditor !== false) {
      try {
        guard();
        const reviewFile = dir ? path.join(dir, "docu-plan-review.json") : null;
        const pr = await reviewPlan({
          bible, plan, research: fullResearch, llm, model: bibleModel || chapterModel, usage, logFn, isCancelled, lang,
          check: (b) => bibleErrors(b),
          cache: reviewFile ? { get: (k) => { const c = readJson(reviewFile, null); return c?.key === k ? c.res : null; }, put: (k, res) => writeJson(reviewFile, { key: k, res, savedAt: new Date().toISOString() }) } : null,
        });
        bible = pr.bible;
        logFn(`Plan editörü${pr.cached ? " (kayıttan)" : ""}: ${pr.applied.length} düzeltme${pr.rejected.length ? `, ${pr.rejected.length} reddedildi` : ""}${pr.verdict ? ` — ${pr.verdict.slice(0, 200)}` : ""}`);
        for (const p of pr.applied.slice(0, 8)) logFn(`  · bölüm ${p.chapter} ${p.field}: ${String(p.reason || "").slice(0, 110)}`);
      } catch (e) {
        if (e?.message === "cancelled" || isCancelled()) throw e;
        logFn(`Plan editörü yapılamadı (${String(e?.message || e).slice(0, 140)}); plan olduğu gibi devam ediyor`);
      }
    }
    if (!hookById(bible.openingLogic)) bible.openingLogic = hookCands[0]?.id;
    recordHook(opts.hookDir ?? DATA_DIR, { id: bible.openingLogic, topic: job.topic, tone: hookTone });
    // Vuruculuk + tek izleyici çağrısı (docu-rhetoric.js). Yalnızca YENİ planda: kayıtlı bir plana alan eklemek
    // bölümlerin önbellek anahtarını değiştirir ve devam eden işi baştan yazdırırdı.
    bible.rhetoric = rhetoricPlan({ topic: job.topic, chapters: bible.chapters.length, history: readRhetoricHistory(opts.hookDir ?? DATA_DIR), sensitive: sensitiveTopic(job.topic, job.guidance) });
    recordRhetoric(opts.hookDir ?? DATA_DIR, { topic: job.topic, punches: bible.rhetoric.perChapter.flat(), cta: bible.rhetoric.cta, ctaPlace: bible.rhetoric.ctaPlace });
    store.putBible(bible);
  }
  if (plan.news) {
    const moved = budgetBackground(plan, bible.chapters);
    if (moved) logFn(`Arka plan bölümü kısaltıldı: ${moved} kelime bu haftanın bölümlerine verildi (arka plan ≤ ~${BACKGROUND_WORDS} kelime)`);
  }
  const bibleKey = sha1(bible);
  // Commons katalogu (docu-commons-catalog.js): gerçek hikâyede senarist sahnelere Commons'ta GERÇEKTEN var olan
  // dosyaları adıyla seçer — Yom Kippur videosunun yolu. Ücretsiz API; ağ yoksa katalog boş kalır, iş sürer.
  let catalog = [];
  if (archive && commonsCatalog) {
    try {
      const queries = catalogQueries({ topic: job.topic, title: bible.title, research: fullResearch });
      catalog = await commonsCatalogFor({ dir, queries, logFn, isCancelled });
      if (catalog.length) logFn(`Commons katalogu: ${catalog.length} gerçek dosya (${queries.length} arama) — senarist sahnelere adıyla seçecek`);
    } catch (e) {
      if (e?.message === "cancelled" || isCancelled()) throw e;
      logFn(`Commons katalogu kurulamadı (${String(e?.message || e).slice(0, 80)}); sahneler her zamanki gibi aranacak`);
    }
  }
  const castKeys = bible.cast.map((c) => c.key);
  const genre = bible.genre;
  const n = bible.chapters.length;
  // Sistem = sabit talimatlar + araştırma/plan (önbellek işaretli): her bölüm ve
  // her uzatma aynı önekle başlar, yalnızca bölüme özel satırlar değişir.
  const system = [
    { type: "text", text: [editorBrief(job), SCENE_GRAMMAR, genreBrief(genre), sourceRule(job)].join("\n\n") },
    { type: "text", text: storyBlock({ job, bible, research: fullResearch }), cache_control: { type: "ephemeral" } },
  ];
  // Arşiv modunda bölüm başına AI tavanı: videoda ~15 AI görseli bölümlere paylaştırılır (en az 2).
  const aiCap = archive ? Math.max(2, Math.ceil(AI_PER_VIDEO / n) + 1) : null;
  const ctxOf = (i) => ({ castKeys, archive, first: i === 0, last: i === n - 1, genre, lang, index: i, videoTitle: bible.title, aiCap });

  /** Bölüm çağrısı: düzeltip doğrular; yalnızca kelime eksiği kalırsa en iyi deneme kabul edilir, uzatma adımı tamamlar. */
  const callChapter = async ({ i, user, target, min, label }) => {
    let best = null;
    const validate = (p) => {
      const scenes = Array.isArray(p?.scenes) ? p.scenes : [];
      // 1.16.16 okunuş: kısaltılmış birim ve kuruşlu para yazıyla (yalnızca yeni bölüm; sayaç/grafik rakamına dokunulmaz).
      for (const s of scenes) if (s?.say && !["counter", "stat", "bars", "chart", "scale"].includes(s.type)) { s.say = spokenFix(s.say); roundAboutScene(s); }
      const errors = [...sceneEnds(scenes), ...validateScenes({ scenes }, ctxOf(i))];
      // 1.16.16 kamera arkası yok: araştırma sürecini anlatan satır bölümü geçirmez (El Niño: "not in our original research file").
      const backstage = backstageLines(scenes);
      // 1.16.16 hassas konu: salgın/felaket/toplu ölümde beğeni-abone ricası bölümü geçirmez (Ebola: "…a like helps").
      const asks = bible.rhetoric?.sensitive ? likeAskLines(scenes) : [];
      if (asks.length) errors.push(`hassas konu (ölüm/hastalık/felaket): beğeni/abone isteme, bu satırı çıkar: "${asks[0].slice(0, 90)}"`);
      if (backstage.length) errors.push(`anlatım kamera arkasını anlatıyor (araştırma dosyası/brief/kaynaklarımız/doğrulama süreci izleyiciye okunmaz; doğrulanamayan bilgiyi hiç yazma): ${backstage.slice(0, 3).map((t) => `"${t.slice(0, 90)}"`).join("; ")}`);
      if (errors.length) return errors;
      const words = sceneWords(scenes);
      if (!best || words > best.words) best = { scenes: structuredClone(scenes), words };
      // Işık denetimi en iyi denemeden SONRA: üç turda da karanlık kalırsa bölüm yine geçer (iş durmaz), uyarı yazılır.
      // Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: karelerin %21-39'u neredeyse siyahtı.
      const dark = promptLightErrors(scenes, { chapter: i });
      return [...(words < min ? [`bölüm ${i + 1}: ${words}/${target} kelime — ${target - words} kelime daha ekle`] : []), ...dark];
    };
    try {
      const res = await llm({ system, user, schema: SCENES_SCHEMA, maxTokens: 24000, effort: "high", usage, logFn, isCancelled, validate, ...(chapterModel ? { model: chapterModel } : {}) });
      return { scenes: res.scenes, words: sceneWords(res.scenes) };
    } catch (e) {
      if (e?.message === "cancelled" || isCancelled() || !best) throw e;
      logFn(`${label}: kelime hedefi tutmadı (${best.words}/${target}); uzatma adımına bırakıldı${promptLightErrors(best.scenes, { chapter: i }).length ? " (görsel istemler hâlâ karanlık; video sonunda uyarı)" : ""}`);
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
        i, user: chapterPrompt({ i, bible, plan, written, lang, catalog, aiCap }),
        target: cw(i), min: Math.round(cw(i) * MIN_CHAPTER_RATIO), label: `Bölüm ${i + 1}`,
      });
      store.putChapter(i, bibleKey, ch);
    }
    written.push(ch.scenes);
  }

  // 3) UZATMA — toplam hedefin altındaysa en kısa bölümler mevcut JSON'larıyla uzatılır.
  // Hedef süre tavanını geçmez (25 Ekim 2026 gözden geçirme): kılavuzlu 12 dk'lık işte plan (1798) tavanın (1742) üstünde;
  // 1700 kelimelik, zaten 12,7 dk'lık senaryo 1798'e doğru ücretli uzatma alıp sonra son okumada kırpılıyordu. Tavan
  // planın altındaysa uzatma tabanda (uzun video, ücretli adım kapısı) durur; istenen ekler toplamı tavanı aşmaz.
  for (let round = 1; round <= 2; round++) {
    const words = written.map(sceneWords);
    const total = words.reduce((a, b) => a + b, 0);
    const lim = lengthLimits(job, plan, { scenes: written.flatMap((sc, c) => sc.map((s) => ({ ...s, chapter: c }))), voiceSpeed, styleVoices });
    const goal = Math.min(plan.words, lim.maxWords);
    const stop = goal < plan.words ? Math.max(goal * EXTEND_BELOW, lim.minWords) : plan.words * EXTEND_BELOW;
    if (total >= stop) break;
    let deficit = goal - total;
    let room = lim.maxWords - total;
    const order = words.map((w, i) => i).sort((a, b) => words[a] - words[b]);
    const jobs = [];
    for (const i of order) {
      if (deficit <= 0 || room <= 0) break;
      // En kısa bölüm önce; bir bölüme en fazla yarım bölüm eklenir (şişirme değil, tamamlama).
      const want = Math.max(cw(i) - words[i], Math.ceil(cw(i) * 0.12), Math.ceil(deficit / Math.max(1, order.length - jobs.length)));
      const add = Math.min(want, Math.ceil(cw(i) * 0.6), room);
      // Tavanın kıstığı kırıntı ek (bölümün en az ekinden kısa) için bütün bölüm ücretle yeniden yazdırılmaz: önceki ekler
      // toplamı eşiğe zaten taşıyorsa durulur (gözden geçirme: "en az 8 kelime daha ekle" diye bir bölüm çağrısı gidiyordu).
      if (add < Math.ceil(cw(i) * 0.12) && goal - deficit >= stop) break;
      jobs.push({ i, add });
      deficit -= add;
      room -= add;
    }
    logFn(`Senaryo kısa: ${total}/${goal} kelime${goal < plan.words ? ` (plan ${plan.words}; süre tavanı ${lim.maxMinutes} dk)` : ""} — ${jobs.length} bölüm uzatılıyor (tur ${round})`);
    await runPool(jobs, 3, async ({ i, add }) => {
      const target = words[i] + add;
      const res = await callChapter({
        i,
        target,
        min: Math.round(words[i] + add * 0.85),
        label: `Bölüm ${i + 1} uzatma`,
        user: [
          chapterPrompt({ i, bible, plan, written, lang, catalog, aiCap }),
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
  // SON OKUMA (docu-editor-pass.js): bütün videoyu bir editör okur — mantık, adil kıyas, art arda tekrar, riskli isim,
  // yanlış kesinlik, boşta kalan bağ, ton. Çökerse senaryo olduğu gibi devam eder.
  // Uzun senaryoda (lengthLimits) aynı okuma en düşük değerli satırları çıkarıp birleştirerek maxWords'e indirir.
  const spoken = sceneWords(scenes);
  const limits = lengthLimits(job, plan, { scenes, voiceSpeed, styleVoices });
  const maxWords = spoken > limits.maxWords ? limits.maxWords : null;
  // Uzun video tabanı editöre yalnızca kırpılan senaryoda gider: normal senaryoda tabanı eskisi gibi planın %90'ı (10 dk'lık
  // istekte taban planın kendisidir; her yerde uygulanınca planındaki senaryonun hiçbir çıkarması geçmiyordu).
  const floor = maxWords ? limits.minWords : 0;
  // Editörün çıkarmak isteyip çıkarma sayısına/tabana takılan satırları: kodun kırpması önce bunlara bakar.
  const spare = new Set();
  if (maxWords) logFn(`Senaryo uzun: ${spoken}/${plan.words} kelime — son okuma ~${maxWords} kelimeye kırpıyor (tavan ${limits.maxMinutes} dk, ${limits.from}; film temposu ${limits.wpm} kelime/dk, ${limits.pace})`);
  try {
    guard();
    const edKey = sha1(["son-okuma-2", JSON.stringify(scenes.map((s) => [s.type, s.say ?? "", s.text ?? ""])), ...(maxWords ? [maxWords] : [])]);
    const edFile = dir ? path.join(dir, "docu-son-okuma-cache.json") : null;
    const edCache = edFile ? readJson(edFile, null) : null;
    const ed = await editorialPass({
      scenes, research: fullResearch, job, llm, usage, logFn, isCancelled, model: bibleModel || chapterModel,
      minWords: Math.max(Math.round(plan.words * 0.9), floor), ...(maxWords ? { maxWords } : {}), sensitive: !!bible.rhetoric?.sensitive,
      writeLog: (out) => { if (dir) writeJson(path.join(dir, "son-okuma.json"), out); },
      cachedEdits: edCache?.key === edKey ? edCache.edits : null,
      onEdits: (edits) => { if (edFile) writeJson(edFile, { key: edKey, edits }); },
    });
    for (const s of ed.spare || []) spare.add(s);
    if (ed.applied.length || ed.rejected.length) {
      logFn(`Son okuma: ${ed.applied.length} düzeltme${ed.rejected.length ? `, ${ed.rejected.length} öneri reddedildi` : ""} — ${ed.applied.slice(0, 5).map((e) => `#${e.scene} ${e.action === "drop" ? "çıkarıldı" : e.kind}: ${String(e.reason || "").slice(0, 70)}`).join("; ")}`);
    }
  } catch (e) {
    if (e?.message === "cancelled" || isCancelled()) throw e;
    logFn(`Son okuma yapılamadı (${String(e?.message || e).slice(0, 140)}); senaryo olduğu gibi devam ediyor`);
  }
  // SON OKUMA 2. TUR (22 Ekim 2026 denetimi: kod bulguları yalnızca uyarıya düşüyor, ses parası yine ödeniyordu). Ağır
  // bulgular (araştırmada olmayan saat/sayı/alıntı, kesin iddia, göreli zaman, kopya köprü, meta, olgusuz blok…)
  // birinci turdan sonra da duruyorsa editör YALNIZCA onlara bakar. Kalanlar uyarıya yazılır.
  try {
    guard();
    const left = scriptLint(scenes, { research: fullResearch, hook: hookContext({ job, title: bible?.title || "" }) }).filter((x) => SECOND_ROUND_KINDS.has(x.kind));
    if (left.length) {
      const key2 = sha1(["son-okuma-tur2-1", JSON.stringify(scenes.map((s) => [s.type, s.say ?? "", s.text ?? ""]))]);
      const f2 = dir ? path.join(dir, "docu-son-okuma-2-cache.json") : null;
      const c2 = f2 ? readJson(f2, null) : null;
      const ed2 = await editorialPass({
        scenes, research: fullResearch, job, llm, usage, logFn, isCancelled, model: bibleModel || chapterModel, focus: true,
        minWords: Math.max(Math.round(plan.words * 0.88), floor), sensitive: !!bible.rhetoric?.sensitive,
        writeLog: (out) => { if (dir) writeJson(path.join(dir, "son-okuma-2.json"), out); },
        cachedEdits: c2?.key === key2 ? c2.edits : null,
        onEdits: (edits) => { if (f2) writeJson(f2, { key: key2, edits }); },
      });
      for (const s of ed2.spare || []) spare.add(s);
      logFn(`Son okuma 2. tur: ${left.length} kalan bulgu → ${ed2.applied.length} düzeltme${ed2.rejected.length ? `, ${ed2.rejected.length} reddedildi` : ""}`);
    }
  } catch (e) {
    if (e?.message === "cancelled" || isCancelled()) throw e;
    logFn(`Son okuma 2. tur yapılamadı (${String(e?.message || e).slice(0, 140)})`);
  }
  // UZUNLUK KURALI (25 Ekim 2026 denetimi): okumalardan sonra hâlâ tavanın %5'inden uzunsa kod en zayıf satırları çıkarır
  // — kanca, izleyici çağrısı, kapanış ve bölümün tek satırı kalır; uzun video tabanının (limits.minWords) altına inmez.
  // Önce editörün çıkarmak istediği satırlar (spare); vuruş ve tema cümlesi kodun kendi seçimiyle kesilmez.
  const long = sceneWords(scenes);
  if (long > limits.maxWords * TRIM_SLACK) {
    const cut = trimToWords(scenes, limits.maxWords, { minWords: limits.minWords, prefer: spare });
    const marked = cut.dropped.filter((d) => d.marked).length;
    logFn(`Senaryo hâlâ uzun: ${long}/${limits.maxWords} kelime — kod en zayıf ${cut.dropped.length} satırı çıkardı → ${sceneWords(scenes)} kelime${cut.dropped.length ? ` (${cut.dropped.slice(0, 4).map((d) => `#${d.scene} "${d.say.slice(0, 50)}"`).join("; ")}${cut.dropped.length > 4 ? "; …" : ""})` : ""}${marked ? `; ${marked} satırı editör çıkarmak istemişti` : ""}`);
    // Kodun kesimi yeniden yazmaz: akış yayından önce bir kez okunsun.
    if (cut.dropped.length) warnings.push(`Uzunluk kuralı: kod ${cut.dropped.length} satırı çıkardı (${long} → ${sceneWords(scenes)} kelime, tavan ${limits.maxWords}) — geçişleri oku: ${cut.dropped.slice(0, 6).map((d) => `"${d.say.slice(0, 60)}"`).join("; ")}`);
  }
  // Kodun bulduğu kusurlar (docu-lint.js) son okumadan sonra da duruyorsa: yapım notu cümlesi kesilir (yalnızca nottan
  // ibaret satır çıkar); kalanlar (birim, sayım, kapanış) yayından önce görülsün diye uyarıya yazılır.
  const leaked = stripLeakSentences(scenes);
  // 27 Ekim 2026 izlenme eğrileri: ilk 30 sn'deki önsöz ve ilk dakikadaki süreç cümlesi editörden sonra da kaldıysa kod keser.
  const preamble = stripHookPreamble(scenes);
  if (preamble) logFn(`Açılış denetimi: ${preamble} satırdan önsöz/süreç cümlesi çıkarıldı`);
  if (leaked || preamble) {
    const empty = new Set(scenes.map((s, k) => (!stripTags(s.say) && ["photo", "words", "quote", "slam"].includes(s.type) ? k : -1)).filter((k) => k >= 0));
    removeScenes(scenes, empty);
    logFn(`Senaryo denetimi: ${leaked} satırdan yapım notu çıkarıldı${empty.size ? ` (${empty.size} satır tamamen nottu, çıkarıldı)` : ""}`);
  }
  for (const f of scriptLint(scenes, { research: fullResearch, hook: hookContext({ job, title: bible?.title || "" }) }).filter((x) => x.kind !== "leak")) warnings.push(`Senaryo denetimi #${f.scene + 1} [${f.kind}]: ${f.detail}`);
  const short = written.map((sc, i) => [i, sceneWords(sc)]).filter(([i, w]) => w < cw(i) * 0.75);
  for (const [i, w] of short) warnings.push(`Bölüm ${i + 1} kısa kaldı (${w}/${cw(i)} kelime)`);
  if (sceneWords(scenes) > limits.maxWords * TRIM_SLACK) warnings.push(`Senaryo uzun kaldı: ${sceneWords(scenes)}/${plan.words} kelime (kırpma hedefi ${limits.maxWords}; kurgu karnesi en çok ${SCORECARD_MAX_MIN} dk)`);
  const repeats = crossChapterRepeats(scenes);
  if (repeats.length) warnings.push(`Bölümler arası tekrar eden ifadeler: ${repeats.slice(0, 4).map((g) => `"${g}"`).join(", ")}`);
  const unverified = unverifiedNumbers(scenes, fullResearch);
  if (unverified.length) warnings.push(`Araştırmada bulunamayan rakamlar (yayından önce doğrula): ${unverified.slice(0, 6).join("; ")}`);
  warnings.push(...hookWarnings(scenes, bible, lang));
  const gaps = rehookGaps(scenes, { lang });
  if (gaps.length) warnings.push(`Uzun kancasız aralık (yeni kanca her 60-90 sn): ${gaps.slice(0, 3).map((g) => `~${Math.round(g.gap)} sn, ${clock(g.at)} sonrası`).join("; ")}`);
  // Görsel ışık (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026): ölçüm her zaman yazılır, hedef dışı uyarı olur.
  const light = promptLight(scenes);
  logFn(`Görsel ışık denetimi: ${light.dark.length}/${light.total} istem karanlık (%${Math.round(light.share * 100)}, hedef ≤%${Math.round(DARK_PROMPT_SHARE * 100)}), ${light.silhouettes} silüet (en çok ${SILHOUETTE_CAP})`);
  if (light.share > DARK_PROMPT_SHARE) warnings.push(`Görsel istemlerin %${Math.round(light.share * 100)}'i karanlık (anlatım geceyi söylemiyor): ${light.dark.slice(0, 4).map((d) => `#${d.scene + 1} "${d.prompt.slice(0, 60)}"`).join("; ")}`);
  if (light.silhouettes > SILHOUETTE_CAP) warnings.push(`${light.silhouettes} silüet istemi (videoda en çok ${SILHOUETTE_CAP})`);

  const script = {
    id: job.id,
    title: bible.title,
    genre,
    locale: lang === "en" ? "en-US" : "tr-TR",
    visualStyle: lookOnly(bible.visualStyle),
    cast: Object.fromEntries(bible.cast.map((c) => [c.key, c.description])),
    // A countdown's chapters read "#7 The Dyatlov Pass" in YouTube's chapter list; the rank card draws them from `ranking`.
    chapters: bible.chapters.map((c) => (plan.ranking && c.rank ? `#${c.rank} ${c.item || c.title}` : c.title)),
    story: { centralQuestion: bible.centralQuestion, stakes: bible.stakes, promise: bible.promise, hookWord: bible.hookWord, openLoops: bible.openLoops },
    ...(bible.rhetoric?.sensitive ? { sensitive: true } : {}),
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
  // Gerçek kişiler (realCastOf): motor onların AI karesinde yüzü gizler. Arşiv adımı fotoğrafı çıkmayan sahnenin isim
  // kartını siler ("Harry Markopolos" için gerçek fotoğraf yok); liste burada, kartlar dururken yazılır.
  const realCast = realCastOf(script);
  if (realCast.length) {
    script.realCast = realCast;
    logFn(`Gerçek kişiler (AI karelerinde yüzleri gizlenecek): ${realCast.join(", ")}`);
  }
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

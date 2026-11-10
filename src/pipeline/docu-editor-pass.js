// SON OKUMA — bütün senaryoyu bir editör gibi okur ve güvenli satır düzeltmeleri yapar.
//
// 16 Ekim 2026, Ebola gündem videosu: render'dan önce senaryoyu elle okuduk ve 10 düzeltme yaptık (hantal açılış
// cümlesi, "a vaccine needs nobody's trust" mantık hatası, 70.000 dozu 5 milyon yerinden edilmiş kişiyle kıyaslama,
// Kenya yolculuğunun art arda üç kez anlatılması, tek ikincil kaynakta geçen yetkili adı, "about 81,124", boşta kalan
// "Until then"…). Kullanıcı: "Nova bunları kendi de görebilmeli". Bölüm yazarı kendi bölümünü görür; bu okuma bütün
// videoyu görür. Model satır önerir, kod denetler: yeni sayı ve olgu eklenemez, yapı sahneleri (harita, grafik,
// manşet, başlık) değişmez, sayacın satırı sayısını söylemeye devam eder, kelime hedefi korunur. Okuma çökerse
// senaryo olduğu gibi devam eder.
import { numbersIn as spokenNumbers, spokenHas } from "./docu-edit-director.js";
import { scriptLint, unitErrors, numbersInText, concreteLine, templateCopies, hookContext } from "./docu-lint.js";
import { isAudienceAsk } from "./docu-rhetoric.js";

/** Satırı düzeltilebilen ve çıkarılabilen sahne tipleri. */
const EDITABLE = new Set(["photo", "words", "quote", "slam", "split", "board", "counter"]);
const DROPPABLE = new Set(["photo", "words", "quote", "slam"]);
// 20 Ekim 2026: kodun bulduğu dört kusur (docu-lint.js) da editöre gider — leak/unit/count/callback.
// 22 Ekim 2026 (yazım denetimi + profesyonel yazım araştırması): kopyalanan örnek cümle, araştırmada olmayan iddia,
// isimsiz kaynak ve kulağa yazılmamış noktalama da editöre gider.
export const EDIT_KINDS = ["clunky", "logic", "unfair-compare", "retold", "risky-name", "false-precision", "dangling", "tone", "leak", "unit", "count", "callback", "meta", "abstract", "template", "unsupported", "quote", "absolute", "relative-time", "vague-source", "ear"];
// Kodun bulguları (~10-25) + editörün kendi düzeltmeleri sığsın diye tavan 15'ten 30'a çıktı.
const MAX_EDITS = 30;
const MAX_DROPS = 10;
// UZUN SENARYO (Fransa borcu, 24 Ekim 2026: 1997/1798 kelime, video 14:55): kırpma ~110 kelime ister, 10 çıkarma
// yetmez. maxWords gelince çıkarma tavanı yükselir; düzeltme tavanı da aynı kadar, kod bulgularının düzeltmeleri sığsın.
const TRIM_MAX_DROPS = 25;
/** Kinds whose fix may bring in a number the research really carries (never an invented one). */
const RESEARCH_NUMBER_KINDS = new Set(["abstract", "unsupported", "vague-source"]);

export const EDITOR_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "integer", description: "satır numarası (#)" },
          action: { type: "string", enum: ["rewrite", "drop"] },
          kind: { type: "string", enum: EDIT_KINDS },
          say: { type: "string", description: "rewrite: satırın yeni hâli (video dilinde, v4 yönlendirmesi korunur)" },
          text: { type: "string", description: "rewrite + words: ekrana yazılacak kısım, yeni satırın kelimeleri aynı sırayla" },
          reason: { type: "string", description: "Türkçe, tek cümle" },
        },
        required: ["scene", "action", "kind", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["edits"],
  additionalProperties: false,
};

const strip = (t) => String(t || "").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
const words = (t) => strip(t).toLowerCase().match(/[\p{L}\p{N}'’]+/gu) || [];
const numbersIn = (t) => (strip(t).match(/\d[\d,.]*\d|\d/g) || []).map((x) => Number(x.replace(/,/g, ""))).filter(Number.isFinite);
const inOrder = (needle, hay) => {
  const h = words(hay);
  let k = 0;
  for (const w of words(needle)) {
    while (k < h.length && h[k] !== w) k++;
    if (k++ >= h.length) return false;
  }
  return words(needle).length > 0;
};
// Uzunluk docu-script.js countWords ve motorun spokenWords'ü gibi sayılır (boşlukla ayrılan kelime): minWords/maxWords
// orada bu sayımla hesaplanıyor; words() "€3.6"yı ve "ten-year"ı iki sayıyordu (Fransa: 2050'ye 1997).
const spokenCount = (t) => strip(t).split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const sceneWordCount = (scenes) => scenes.reduce((n, s) => n + spokenCount(s?.say), 0);

/**
 * Sahneleri yerinde çıkarır; cihazların (split/board) genel fromScene'i kaymaya göre düzeltilir, çıkan sahneye
 * bakan bağ silinir.
 */
export function removeScenes(scenes, drop) {
  if (!drop?.size) return 0;
  const shift = (k) => { let d = 0; for (const x of drop) if (x < k) d++; return k - d; };
  const fix = (o) => {
    if (!o || !Number.isInteger(o.fromScene)) return;
    if (drop.has(o.fromScene)) delete o.fromScene;
    else o.fromScene = shift(o.fromScene);
  };
  for (const s of scenes) {
    fix(s);
    for (const it of Array.isArray(s?.items) ? s.items : []) fix(it);
    fix(s?.left);
    fix(s?.right);
  }
  const keep = scenes.filter((_, i) => !drop.has(i));
  scenes.splice(0, scenes.length, ...keep);
  return drop.size;
}

/** Yeni satırdaki her sayı eski satırda vardı ya da onun yuvarlanmışı (%2 içinde): son okuma sayı uyduramaz. */
function numbersKept(oldSay, newSay) {
  const old = numbersIn(oldSay);
  return numbersIn(newSay).every((n) => old.some((o) => o === n || (o > 0 && Math.abs(o - n) / o <= 0.02)));
}

/**
 * Önerilen düzeltmeleri denetleyip uygular (yerinde). Satır düzeltmeleri önce, çıkarmalar sonra (sıra kaymasın).
 * @returns {{applied: object[], rejected: object[]}}
 */
export function applyEditorEdits(scenes, edits, { minWords = 0, maxWords = 0, lang = "en", research = "" } = {}) {
  const applied = [];
  const rejected = [];
  const seen = new Set();
  const n = scenes.length;
  const maxDrops = maxWords > 0 ? Math.max(MAX_DROPS, TRIM_MAX_DROPS) : MAX_DROPS;
  const maxEdits = MAX_EDITS + maxDrops - MAX_DROPS;
  // Birim düzeltmesi yeni bir sayı getirebilir — yalnızca kodun hesapladığı doğru değer ("40 °C" → "104 °F").
  // Turkish research files write 2.300 for 2,300: read them as the same number.
  const researchNumbers = numbersInText(research);
  const unitFix = new Map();
  for (const u of unitErrors(scenes)) unitFix.set(u.scene, [...(unitFix.get(u.scene) || []), u.expected]);
  // spare: editör çıkarmak istedi, yalnızca çıkarma sayısı ya da kelime tabanı engelledi — kodun kırpması önce buna bakar.
  const no = (e, why, spare = false) => rejected.push({ ...e, why, ...(spare ? { spare: true } : {}) });
  const drops = [];
  for (const e of (Array.isArray(edits) ? edits : []).slice(0, maxEdits)) {
    const i = e?.scene;
    const s = Number.isInteger(i) ? scenes[i] : null;
    if (!s) { no(e, "satır yok"); continue; }
    if (seen.has(i)) { no(e, "aynı satıra ikinci düzeltme"); continue; }
    /*
     * İZLEYİCİ ÇAĞRISI KORUNUR (25 Ekim 2026, kanal sahibi: "like abone falan isteme niye girmemiş"): üç videoda da son
     * okuma kancadaki beğen-abone-yorum üçlüsünü "meta, hikâyeyi frenliyor" diye sildi — çağrı işareti (s.cta) bu
     * geçişten SONRA konduğu için koruma görmüyordu. Çağrı satırı çıkarılmaz; yeniden yazılırsa çağrısı kalmalı.
     */
    if (isAudienceAsk(s.say) && (e.action === "drop" || !isAudienceAsk(e.say))) { no(e, "izleyici çağrısı (beğen/abone/Hype/yorum) çıkarılmaz"); continue; }
    if (e.action === "drop") {
      if (!DROPPABLE.has(s.type)) { no(e, `${s.type} sahnesi çıkarılmaz`); continue; }
      if (i === 0 || i >= n - 2 || s.outro || s.cta) { no(e, "açılış, kapanış ya da çağrı sahnesi çıkarılmaz"); continue; }
      if (drops.length >= maxDrops) { no(e, `en çok ${maxDrops} çıkarma`, true); continue; }
      seen.add(i);
      drops.push(e);
      continue;
    }
    if (e.action !== "rewrite") { no(e, "bilinmeyen işlem"); continue; }
    if (!EDITABLE.has(s.type)) { no(e, `${s.type} sahnesinin satırı değişmez`); continue; }
    const say = String(e.say || "").trim();
    if (!strip(say)) { no(e, "boş satır"); continue; }
    if (words(say).length > words(s.say).length * 1.5 + 6) { no(e, "satır çok uzadı"); continue; }
    // An abstract run is fixed with a fact from the research (a number the research really carries), never an invented one.
    const allowed = e.kind === "unit" ? (unitFix.get(i) || []) : RESEARCH_NUMBER_KINDS.has(e.kind) ? researchNumbers : [];
    if (!numbersKept(`${s.say} ${allowed.map((x) => Math.round(x)).join(" ")} ${allowed.join(" ")}`, say)) { no(e, "yeni sayı eklenemez"); continue; }
    // Sayaç: satır değişebilir ama sayacın sayısı yine söylenmeli (sayı söylendiği an ekrana düşer).
    if (s.type === "counter" && !spokenHas(spokenNumbers(say, lang), Number(s.to))) { no(e, "sayacın sayısı yeni satırda söylenmiyor"); continue; }
    if (s.type === "slam" && s.word && !words(say).includes(String(s.word).toLowerCase())) { no(e, "slam kelimesi yeni satırda yok"); continue; }
    let text = s.text;
    if (s.type === "words" && s.textMode !== "none") {
      const fullLine = text && words(text).join(" ") === words(s.say).join(" ");
      if (text && !fullLine && inOrder(text, say)) { /* eski ekran yazısı yeni satırda duruyor */ }
      else if (fullLine) text = strip(say);
      else if (e.text && inOrder(e.text, say)) text = strip(e.text);
      else if (words(say).length <= 14) text = strip(say);
      else { no(e, "ekran yazısı yeni satıra uymuyor"); continue; }
    }
    seen.add(i);
    applied.push({ ...e, before: s.say });
    s.say = say;
    if (s.type === "words" && text !== undefined) {
      s.text = text;
      if (s.keyword && !strip(text).toLowerCase().includes(String(s.keyword).toLowerCase())) {
        // Sayı vurgusu sayıda kalır ("81,124" → "81,000"); yoksa satırın en uzun kelimesi.
        const num = /\d/.test(s.keyword) && strip(text).match(/\d[\d,.]*\d|\d/);
        s.keyword = num ? num[0] : words(text).sort((a, b) => b.length - a.length)[0];
      }
    }
  }
  // Çıkarmalar: kelime hedefinin altına düşürmez.
  let total = sceneWordCount(scenes);
  const drop = new Set();
  for (const e of drops) {
    const w = spokenCount(scenes[e.scene].say);
    if (total - w < minWords) { no(e, "kelime hedefinin altına düşer", true); continue; }
    total -= w;
    drop.add(e.scene);
    applied.push({ ...e, before: scenes[e.scene].say });
  }
  removeScenes(scenes, drop);
  return { applied, rejected };
}

/*
 * UZUNLUK KIRPMASI (Fransa borcu 20261024-48ae2d, 25 Ekim 2026 denetimi): son okumaya "en çok N kelime" deniyordu ama
 * kırpmayı yalnızca modelin uyması taşıyordu; senaryo 1997 kelimeyle kaldı, video 14:55 çıktı. Son okumadan sonra hâlâ
 * uzunsa (docu-script.js) kod en zayıf satırları çıkarır. Yalnızca photo/words satırı; kanca (ilk bölüm, ilk 60 sn),
 * izleyici çağrısı, kapanış (son bölüm: merkez sorunun cevabı ve açılışa dönen son satır), bölümün ilk ve son satırı
 * (bölüm kancası, cliffhanger; bölümün tek satırı da böylece), yeniden kanca sorusu, isim kartı, bir cihazın resmini
 * aldığı satır, sorunun cevabı ve sonraki satırın "That/This/It…" diye bağlandığı satır kalır. En zayıf önce: köprü kalıbı (template), olgusuz yorum (uzun olgusuz dizidekiler önce; tanım
 * satırı değil), yeni sayı/isim taşımayan satır; yeni olgu taşıyan satır en son.
 * 25 Ekim gerçek senaryo denemesi (373aaf, 37f9d2, 950730, 8a1eca): dürüstlük/kanıt kaydı, iki sahneye bölünmüş cümlenin
 * yarıları da kalır; art arda iki satır çıkmaz — pasaj silinmez, incelir.
 */
const TRIM_TYPES = new Set(["photo", "words"]);
const HOOK_SEC = 60;
// "Like two people edging through a pitch-black house…" benzetmesi de önceki satıra yaslanır (denizaltı 20261024-373aaf #61).
const BACK_REF = /^(?:that|this|these|those|it|its|it's|which|such|like|bu|bunu|bunun|buna|bunlar|şu|o|onu|onun)\b/i;
const DEFINES = /\b(?:is|are) called\b|\bmeans\b|\bstands for\b|\brefers to\b|\bdenir\b|\bdemektir\b|\banlamına gelir\b/i;
/**
 * Dürüstlük çerçevesi ("That's an upper bound, not a forecast."): sayının kaydı düşerse iddia olduğundan kesin duyulur.
 * Yazarın kendi kalıpları da (growth-lessons honestyLines): "it has not been confirmed", "The Houthis deny it", "what we
 * still don't know", kanıt kaydı ("No independent evidence has been made public…", "the cause has not been established" —
 * Fransa isyanları #96/#76) ve canlandırma notu ("No camera recorded it, so this is a reconstruction…" — denizaltı #59).
 */
const HEDGE = /(?<![\p{L}\p{N}])(?:not a forecast|upper bound|lower bound|estimat\p{L}*|projections?|\p{L}*confirm\p{L}*|(?:not|never) (?:yet )?(?:been )?(?:established|proven|verified|published|made public|disclosed)|unverified|unproven|unclear|evidence|open question|nobody knows|(?:don['’]t|do not) know|den(?:y|ies|ied)|disput\p{L}*|alleged\p{L}*|reconstruct\p{L}*|tahmin\p{L}*|doğrula\p{L}*|kanıt\p{L}*|belirsiz\p{L}*|bilinmiyor|yalanla\p{L}*|canlandırma\p{L}*)(?![\p{L}\p{N}])/iu;
/** Satırdaki sayılar (birimiyle: "1%" ≠ "1") ve isimler (cümle başı olmayan büyük harfli kelime). */
const factsOf = (say) => [
  ...(strip(say).match(/\S*\d\S*/g) || []).map((x) => x.replace(/^[("“]+|[.,;:!?)"”’]+$/gu, "")),
  ...strip(say).split(/(?<=[.!?])\s+/).flatMap((sent) => sent.split(/\s+/).slice(1).filter((w) => /^\p{Lu}/u.test(w) && !/^I(?:'|’|$)/.test(w)))
    .map((w) => w.replace(/['’]s$/u, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()),
];
/**
 * Cümle satırda bitiyor mu. Yazar bir cümleyi iki sahneye böler ("Then, at the end of September, in Val-d'Oise," /
 * "a fourteen-year-old boy was hit in the face." — Fransa isyanları #27-28; Kartal #55-56 "…went from subject of the
 * investigation" / "to clear indications."): yarısı çıkarsa öbürü yarım cümle kalır, ikisi de kırpılmaz.
 */
const SENTENCE_END = /[.!?…]["”’)]*$/u;
/*
 * VURUŞ VE TEMA CÜMLESİ (25 Ekim 2026 gözden geçirme, denizaltı 20261024-373aaf): kodun kırpması olgusuz satırı "yorum"
 * sayıp ilk keser; ama yazara istenen vuruşlar (docu-rhetoric.js PUNCHES) ve tema cümlesi (growth-lessons TEMA CÜMLESİ,
 * GÜNDELİK BENZETME) de olgu taşımaz: #52 "No sound to hear. No route to check. No warning.", #106 "Undetectable is the
 * whole job description of a missile submarine." Kod bunları kendi seçimiyle kesmez — olgu taşısalar da (Fransa borcu #109
 * "…the answer landed. No downgrade." "yeni olgu yok" diye düşüyordu); editör çıkarmak isterse kendisi çıkarır.
 * Biçimden tanınır: kısa vuruş cümlesi (≤ 3 kelime: "No downgrade.", "Gone."), baştan tekrar ("No… No…", "Every…, every…",
 * "Being… Being…"), X değil Y ("not a head-on crash, but…", "a scale, not a bill", "weren't arriving… They were…"),
 * benzetme ("Like a torch…", "read like a bank statement", "Think of…", "closer to archaeology than combat"), tez ("the
 * whole point/job", "The real risk", "that is the problem"). Köprü kalıbı (template) bu korumayı almaz.
 */
const PUNCH_STOP = "the|a|an|and|but|or|so|then|it|its|he|she|they|we|you|i|his|her|their|our|your|my|him|them|us|this|that|these|those|there";
const PUNCH_REPEAT = new RegExp(String.raw`(?:^|[.!?…,;:]\s+|\b(?:and|or)\s+)(?!(?:${PUNCH_STOP})(?![\p{L}\p{N}]))(\p{L}[\p{L}'’-]*)(?![\p{L}\p{N}])[^.!?…]*?(?:[.!?…,;:]\s+|\b(?:and|or)\s+)\1(?![\p{L}\p{N}])`, "iu");
const PUNCH_CONTRAST = /\bnot\b[^.!?…]*\bbut\b|,\s*(?:but\s+)?not\b|(?:\bnot\b|\bnever\b|n['’]t\b)[^.!?…]*[.!?…]\s+(?:but\s+)?(?:it|they|this|that|he|she|we|you)\b|\b(?:less|more|closer to|rather)\s+(?!than\b)[^.!?…]*\bthan\b/iu;
const PUNCH_ANALOGY = /(?:^|[,;:]\s*)(?:like\s+(?!and\b)|think of\b)|\b(?:is|was|are|were|it['’]s|works?|worked|reads?|sounds?|sounded|looks?|looked|feels?|felt|seems?|seemed) (?:just |a bit |almost |more |much )?like\b|\bas (?:if|though)\b/iu;
const PUNCH_THESIS = /\bthe whole (?:point|story|job|game|idea|problem|question|reason|thing)\b|\bthe real (?:reason|risk|question|story|problem|cost|danger|answer|test)\b|\b(?:that|this|which)(?:['’]s| is) the (?:problem|point|catch|answer|rule|story)\b|\bthe (?:rule|catch|lesson) is\b|\bboth (?:are|were) true\b/iu;
const tokens = (t) => t.match(/[\p{L}\p{N}'’]+/gu) || [];
function punchLine(say) {
  const t = strip(say);
  const sentences = t.split(/(?<=[.!?…])\s+/u);
  // Kısa vuruş: satırın kendisi ya da uzun cümleden SONRA gelen cümle ≤ 3 kelime ("…the answer landed. No downgrade.").
  if (tokens(t).length <= 3 || sentences.slice(1).some((x) => tokens(x).length <= 3)) return true;
  return PUNCH_REPEAT.test(t) || PUNCH_CONTRAST.test(t) || PUNCH_ANALOGY.test(t) || PUNCH_THESIS.test(t);
}

/**
 * Kırpılabilecek satırlar, en zayıf önce. tier -1 editörün çıkarmak istediği (prefer) · 0 köprü kalıbı · 1 olgusuz yorum ·
 * 2 yeni olgu yok · 3 yeni olgu. Vuruş/tema cümlesi (köprü kalıbı değilse) aday değildir.
 * @param prefer  sahne nesneleri (editorialPass spare): korumalardan geçerlerse önce kesilir (vuruş satırı yine kalır)
 * @returns {{scene: number, tier: number, words: number}[]}
 */
export function trimCandidates(scenes, { prefer = null } = {}) {
  const marked = new Set(prefer || []);
  const spoken = scenes.map((s, i) => (strip(s?.say) ? i : -1)).filter((i) => i >= 0);
  const ending = new Set(spoken.slice(-2));
  const lastChapter = Math.max(0, ...scenes.map((s) => s?.chapter ?? 0));
  // Bölüm kancası ve cliffhanger: her bölümün ilk ve son konuşulan satırı.
  const edges = new Set(spoken.filter((i, k) => (scenes[i].chapter ?? 0) !== (scenes[spoken[k - 1]]?.chapter ?? -1) || (scenes[i].chapter ?? 0) !== (scenes[spoken[k + 1]]?.chapter ?? -1)));
  const pictured = new Set();
  for (const s of scenes) for (const o of [s, s?.left, s?.right, ...(Array.isArray(s?.items) ? s.items : [])]) if (Number.isInteger(o?.fromScene)) pictured.add(o.fromScene);
  const template = new Set(templateCopies(scenes).map((x) => x.scene));
  // Olgusuz dizinin uzunluğu (art arda olgusuz konuşulan satır): uzun dizi önce incelir.
  const run = new Map();
  for (let k = 0; k < spoken.length;) {
    let e = k;
    while (e < spoken.length && !concreteLine(scenes[spoken[e]].say)) e++;
    for (let j = k; j < e; j++) run.set(spoken[j], e - k);
    k = Math.max(e, k + 1);
  }
  // Bölünmüş cümlenin iki yarısı: cümlesi bitmeyen satır ve ondan sonraki satır.
  const halves = new Set(spoken.flatMap((i, k) => (SENTENCE_END.test(strip(scenes[i].say)) ? [] : [i, spoken[k + 1]])));
  const seen = new Set();
  const out = [];
  let said = 0;
  scenes.forEach((s, i) => {
    // Kanca saati editörün gördüğü [m:ss] ile aynı sayımla.
    const at = (said / EDITOR_WPM) * 60;
    said += words_(s?.say);
    const w = spokenCount(s?.say);
    const facts = w ? factsOf(s.say) : [];
    const fresh = facts.some((f) => !seen.has(f));
    for (const f of facts) seen.add(f);
    if (!w || !TRIM_TYPES.has(s.type) || s.chapterCard || s.outro || s.cta || s.name || isAudienceAsk(s.say)) return;
    if ((s.chapter ?? 0) === 0 || at < HOOK_SEC || (s.chapter ?? 0) === lastChapter || ending.has(i) || edges.has(i) || pictured.has(i) || halves.has(i) || /\?/.test(s.say) || HEDGE.test(strip(s.say))) return;
    if (!template.has(i) && punchLine(s.say)) return;
    const tier = marked.has(s) ? -1 : template.has(i) ? 0 : !concreteLine(s.say) && !DEFINES.test(strip(s.say)) ? 1 : facts.length && !fresh ? 2 : 3;
    out.push({ scene: i, tier, words: w, run: run.get(i) || 0 });
  });
  return out.sort((a, b) => a.tier - b.tier || b.run - a.run || b.words - a.words || a.scene - b.scene).map(({ scene, tier, words: n }) => ({ scene, tier, words: n }));
}

/**
 * Senaryoyu en zayıf satırları çıkararak maxWords'e indirir (yerinde); minWords'ün altına inmez. Kural modele kalmaz.
 * prefer: editörün çıkarmak istediği sahneler (editorialPass spare) önce gelir; dropped'ta marked: true.
 * @returns {{dropped: {scene: number, words: number, say: string, marked?: true}[], words: number}} scene: kırpmadan önceki sıra
 */
export function trimToWords(scenes, maxWords, { minWords = 0, prefer = null } = {}) {
  let total = sceneWordCount(scenes);
  const dropped = [];
  if (!(maxWords > 0) || total <= maxWords) return { dropped, words: total };
  const spoken = scenes.map((s, i) => (strip(s?.say) ? i : -1)).filter((i) => i >= 0);
  const drop = new Set();
  const near = (i, dir) => {
    for (let k = spoken.indexOf(i) + dir; k >= 0 && k < spoken.length; k += dir) if (!drop.has(spoken[k])) return strip(scenes[spoken[k]].say);
    return "";
  };
  for (const c of trimCandidates(scenes, { prefer })) {
    if (total <= maxWords) break;
    const s = scenes[c.scene];
    if (total - c.words < minWords) continue;
    // Pasaj silinmez, incelir: art arda iki satır çıkmaz (denizaltı 20261024-373aaf: aktif/pasif sonar anlatımının beş
    // satırı #39-43 birden düşüyordu; Fransa #131-133 #128'deki sorunun cevabıyla birlikte gidiyordu).
    const k = spoken.indexOf(c.scene);
    if (drop.has(spoken[k - 1]) || drop.has(spoken[k + 1])) continue;
    // Bağı kopmasın: sonraki satır buna "That/This/It…" diye bağlanıyorsa ya da bu satır önceki sorunun cevabıysa kalır.
    if (BACK_REF.test(near(c.scene, 1)) || /[?:]$/.test(near(c.scene, -1))) continue;
    drop.add(c.scene);
    total -= c.words;
    dropped.push({ scene: c.scene, words: c.words, say: strip(s.say), ...(c.tier < 0 ? { marked: true } : {}) });
  }
  removeScenes(scenes, drop);
  return { dropped, words: total };
}

/** Editörün sistem metni: Ebola'nın elle yapılan son okumasından çıkan liste, örnekleriyle. */
export function editorBrief({ lang = "en", sensitive = false } = {}) {
  return [
    "Sen bir belgesel/haber kanalının baş editörüsün. Render'dan önce senaryonun SON okumasını yapıyorsun: bütün videoyu baştan sona oku ve yalnızca gerçekten sorunlu satırları düzelt. İyi satıra dokunma; çoğu senaryoda 0-12 düzeltme yeter, hiç sorun yoksa boş liste döndür.",
    `Video dili: ${lang === "en" ? "İngilizce" : "Türkçe"} — yeni satırlar bu dilde. Satırın başındaki [serious], [softly] gibi v4 yönlendirmesini koru.`,
    "Araştırmada OLMAYAN hiçbir olgu, sayı, isim ya da kaynak ekleme; satırın anlamını değiştirme. Yalnızca abstract/unsupported/vague-source bulgusunu düzeltirken ARAŞTIRMADA geçen bir olgu, sayı ya da kurum adı kullanılabilir (kod araştırmada olmayan sayıyı reddeder). Harita, sayaç, grafik, manşet ve başlık sahneleri listede yok sayılır.",
    "BAK (örnekler gerçek bir videonun son okumasından):",
    "1) clunky — tek nefeste okunmayan, öznesi geç gelen cümle: \"On the main vaccine against the Ebola outbreak in Congo, the World Health Organization's key words are: not known.\" → \"The World Health Organization's verdict on the vaccine now being used against Congo's Ebola outbreak comes down to two words: not known.\"",
    "2) logic — cümle kendisiyle ya da hikâyeyle çelişiyor: \"So the response is pinning its hopes on a tool that needs nobody's trust\" (aşı da güven ister; aşı şüphesi hikâyenin parçası) → \"So the response is also pinning its hopes on a vaccine, built for a different virus.\"",
    "3) unfair-compare — sayı kendi türü olmayan bir şeyle kıyaslanıyor: \"Seventy thousand doses sounds like a lot, until you set it against more than five million displaced people.\" (aşı temaslılara ve sağlık çalışanlarına yapılır) → \"Seventy thousand doses are now in play, for a virus they were never designed for.\"",
    "4) retold — aynı olgu art arda sahnelerde yeniden anlatılıyor (Kenya'ya giden yolcu üç sahnede üç kez): fazlasını drop et ya da kısalt.",
    "5) risky-name — bir yetkilinin adı araştırmada yalnızca bir kez ya da yalnızca ikincil kaynakta geçiyor: adı çıkar, unvanı kalsın (\"WHO incident manager Catherine Swallwood has raised concern\" → \"The WHO's incident manager in Congo has raised concern\").",
    "6) false-precision — yaklaşıklık sözüyle kesin sayı: \"about 81,124 people\" → \"more than 81,000 people\".",
    "7) dangling — 'Until then', 'it', 'that', 'this' önceki satırda neye bağlandığı belli değil: \"Until then, protection rests on old tools\" (önceki satır başka konu) → \"Until the trial reports, protection rests on old tools\".",
    sensitive
      ? "8) tone — HASSAS KONU (ölüm, hastalık, felaket): şakacı, reklam gibi ya da beğeni/abone isteyen satır yeniden yazılır ya da drop edilir; acı anlatıldıktan hemen sonra izleyiciden bir şey istenmez."
      : "8) tone — konunun ağırlığına uymayan şakacı ya da reklam gibi satır.",
    // 20 Ekim 2026: derin inceleme (39 tutmuş video) ve Fransa videomuzdaki kusurlar; kod bulur, editör düzeltir.
    "9) leak — seslendirmeye yapım notu sızmış ('The human cost line belongs here.', 'It should not be illustrated as a battle.'): notu çıkar, satır hikâyeyi anlatsın; satır yalnızca nottan ibaretse drop.",
    "10) unit — birim dönüşümü yanlış ('40 degrees Celsius, or about 34.8 Fahrenheit'): OTOMATİK BULGU'daki doğru değerle düzelt ya da dönüşümü çıkar.",
    "11) count — söylenen sayı alıntıyla tutmuyor ('said four words: we lost control' — üç kelime): sayıyı düzelt ya da sayıyı hiç söyleme ('said it plainly: we lost control').",
    "12) callback — kapanış açılışa dönmüyor: son satırı, açılıştaki imgeyi, sözü ya da soruyu yeni anlamıyla bir kez daha söyleyecek biçimde yeniden yaz (yeni olgu yok; genel ahlak dersi yok).",
    "13) meta — ilk dakikada süreç cümlesi ('As I record this, the numbers are still changing. So I'll keep three things apart…'): kancayı frenler; drop et ya da hikâyenin bir olgusuna çevir.",
    "14) abstract — art arda 5+ satır olgusuz yorum ('But the government's account is not the only one.', 'Others point to anger…', 'Rights groups have accused…'): izleyici burada gider (Fransa: zirveden sonra kalanların yarısı). En az bir satırı ARAŞTIRMADAKİ somut bir olguyla yeniden yaz (kim, ne yaptı, kaç, nerede — yalnızca araştırmada geçen sayı) ya da fazlasını drop et.",
    "15) template — talimatlardan birebir kopyalanmış örnek ya da bilgi taşımayan köprü cümle ('First, the basics.', 'But here's the thing.', 'And here's where it gets uncomfortable.', 'Let's dive in.'): bu hikâyenin bir olgusuyla yeniden yaz; bilgi taşımıyorsa drop.",
    "16) unsupported — anlatımdaki saat ya da sayı araştırmada yok ('at 5:53' — X'teki saat damgası, saat dilimi belirsiz): araştırmadaki değerle yaz ya da sayıyı/saati çıkar ('On Monday evening, Paris police posted…').",
    "17) quote — alıntı araştırmada geçmiyor: araştırmadaki sözle değiştir ya da alıntıyı kaldırıp aktararak söyle.",
    "18) absolute — 'the only', 'for the first time', 'never before' gibi kesin iddia araştırmada açıkça yok ('the only death officially on record' — araştırmada başka bir ölüm daha bildiriliyor): yumuşat ve kaynağına bağla ('the only death Paris police have confirmed').",
    "19) relative-time — 'four days away', 'tomorrow', 'tonight' yayından sonra yanlış olur: mutlak gün ve tarihle yaz ('on Saturday, October 24th').",
    "20) vague-source — isimsiz kaynak ('Rights groups have accused…', 'Reports say…', 'Experts believe…'): araştırmadaki kurumun ADIYLA ve iddiadan ÖNCE söyle ('Amnesty International says…'); araştırmada isim yoksa satırı olguya çevir ya da drop.",
    "21) ear — noktalı virgül, parantez, 'respectively', 'the former/latter': iki kısa cümleye böl, parantezi cümleye çevir.",
    "OTOMATİK BULGULAR listesindeki her madde (kod buldu) MUTLAKA ele alınır: düzelt ya da drop et. Yalnızca unsupported/quote/absolute bulgusunda araştırma iddiayı AÇIKÇA destekliyorsa (aynı olgu başka biçimde yazılmış) satırı olduğu gibi bırakabilirsin.",
    "Satırların başındaki [m:ss] tahmini süredir: ilk 60 saniyede (kanca) yavaşlatan, tekrar eden, liste gibi vaat veren satır en ağır kusurdur.",
    "drop yalnızca photo/words/quote/slam satırında; açılışı ve son iki satırı çıkarma. words satırını değiştirirsen 'text' ekrana yazılacak kısmı (yeni satırın kelimeleri, aynı sırayla) içersin. 'reason' Türkçe tek cümle.",
  ].join("\n");
}

/** Numaralı senaryo + araştırma: editör satırları # ile anar. */
const EDITOR_WPM = 150;
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
export function editorUser({ scenes, research = "", focus = false, maxWords = 0, hook = null }) {
  let words = 0;
  const lines = scenes.map((s, i) => {
    const kind = EDITABLE.has(s.type) ? s.type : `${s.type}, dokunma`;
    const shown = s.type === "words" && s.text ? ` {ekranda: ${s.text}}` : "";
    const at = clock((words / EDITOR_WPM) * 60);
    words += words_(s.say);
    return `#${i} [${at}] [${kind}] (bölüm ${(s.chapter ?? 0) + 1}) ${String(s.say || "").replace(/\s+/g, " ")}${shown}`;
  });
  const found = scriptLint(scenes, { research, hook });
  // Uzun senaryo (docu-script.js lengthLimits): editöre kaç kelime kırpacağı ve kodun en zayıf bulduğu satırlar söylenir.
  const total = sceneWordCount(scenes);
  const over = maxWords > 0 && total > maxWords;
  const weak = over ? trimCandidates(scenes).filter((c) => c.tier < 3).slice(0, 30) : [];
  return [
    `SENARYO (${scenes.length} satır):`, ...lines, "",
    ...(found.length ? ["OTOMATİK BULGULAR (kod buldu — her biri MUTLAKA ele alınır, kind aynen):", ...found.map((f) => `- #${f.scene} [${f.kind}] ${f.detail}`), ""] : []),
    ...(focus ? ["BU İKİNCİ TUR: yalnızca OTOMATİK BULGULAR listesindeki satırlara dokun; başka düzeltme önerme.", ""] : []),
    ...(over ? [
      `UZUNLUK (ZORUNLU): senaryo ${total} kelime, en çok ${maxWords} olmalı — en az ${total - maxWords} kelime kırp: tekrar eden, olgusuz, köprü satırlarını drop et ya da iki satırı birleştirip kısalt (rewrite). Kanca (ilk 60 sn), izleyici çağrısı (beğen/abone/yorum), sayaç/harita/cihaz satırları ve son iki satır kalır.`,
      ...(weak.length ? [`Yeterince kırpmazsan kod en zayıf satırları kendisi çıkarır. En zayıf adaylar (kod sıraladı: köprü, olgusuz yorum, yeni olgu taşımayan satır — önce bunlara bak): ${weak.map((c) => `#${c.scene}`).join(", ")}`] : []),
      "",
    ] : []),
    "ARAŞTIRMA (isim ve olgu kontrolü için):", String(research).slice(0, 30000),
  ].join("\n");
}
const words_ = (t) => (String(t || "").replace(/\[[^\]]*\]/g, " ").match(/[\p{L}\p{N}'’]+/gu) || []).length;

/**
 * Son okuma: model düzeltme önerir, applyEditorEdits denetleyip uygular. Kayıt `son-okuma.json` (iş klasöründe).
 * cachedEdits: aynı senaryonun önceki okuması — model yeniden çağrılmaz (biten senaryo bedavaya yeniden kurulur).
 * @returns {{applied: object[], rejected: object[]}}
 */
export async function editorialPass({ scenes, research, job = {}, llm, usage, logFn, isCancelled, model, minWords = 0, maxWords = 0, sensitive = false, writeLog = null, cachedEdits = null, onEdits = null, focus = false }) {
  const lang = job.language === "en" ? "en" : "tr";
  const res = Array.isArray(cachedEdits) ? { edits: cachedEdits } : await llm({
    system: editorBrief({ lang, sensitive }),
    user: editorUser({ scenes, research, focus, maxWords, hook: hookContext({ job }) }),
    schema: EDITOR_SCHEMA,
    maxTokens: 8000,
    usage,
    logFn,
    isCancelled,
    ...(model ? { model } : {}),
  });
  if (!Array.isArray(cachedEdits)) onEdits?.(Array.isArray(res?.edits) ? res.edits : []);
  const before = scenes.slice();
  const out = applyEditorEdits(scenes, res?.edits, { minWords, maxWords, lang, research });
  writeLog?.(out);
  // Çıkarılmak istenip sınıra takılan satırlar (sahnenin kendisi: sıra çıkarmalarla kayar) — kodun kırpması için.
  return { ...out, spare: out.rejected.filter((e) => e.spare).map((e) => before[e.scene]).filter((s) => s && scenes.includes(s)) };
}

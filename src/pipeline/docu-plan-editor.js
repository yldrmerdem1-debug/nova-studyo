// PLAN EDİTÖRÜ — bölümler yazılmadan ÖNCE, bütün videonun planını izleyici koltuğundan okur ve düzeltir.
//
// 22 Ekim 2026. Kanal sahibi: "en iyi videoları analiz ettik, nie böyle oldu… yazım iyi olmalı". Fransa videosunun
// izlenme eğrisi ve yazım denetimi: kusurların hepsi PLANDA doğdu — bible "üç parçalı vaat + dürüstlük çerçevesi"
// istedi (0:20-0:50 arası izleyicinin dörtte biri gitti), 2. bölümü Eylül'e ayırdı (%45 → %30), zirvenin hemen ardına
// "versiyonlar/tepkiler" bölümü koydu (%27 → %15) ve hookIn/cliffhanger alanlarına araştırmada olmayan olgular yazdı
// ("four words", "at 5:53"). Bölüm yazarları planı sadakatle uyguladı. Profesyonel ekipler de taslaktan önce vuruş
// planını (beat sheet) izleyici gözüyle denetliyor (Paddy Galloway, Film Booth, Colin & Samir, MrBeast yapım notu).
//
// Model yalnızca belirli alanları değiştirebilir; kod her yamayı denetler ve plan yine bütün kurallardan geçmezse
// özgün plan kalır. Kayıt docu-plan-review.json (aynı plan için yeniden ödenmez).
import crypto from "node:crypto";
import { claimErrors, countErrors } from "./docu-lint.js";

const sha1 = (x) => crypto.createHash("sha1").update(JSON.stringify(x)).digest("hex");
export const PLAN_FIELDS = ["title", "goal", "covers", "hookIn", "turn", "cliffhanger", "background"];
const WPM = 150;
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

export const PLAN_REVIEW_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", description: "Türkçe, 1-3 cümle: plan izleyiciyi nerede kaybederdi, ne değişti" },
    promise: { type: "string", description: "Gerekiyorsa yeni vaat: TEK cümle, ≤20 kelime, video dilinde; değişmiyorsa boş" },
    patches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          chapter: { type: "integer", description: "1'den başlayan bölüm numarası" },
          field: { type: "string", enum: PLAN_FIELDS },
          text: { type: "string", description: "Yeni değer. covers için olgular ' | ' ile ayrılır; background için 'true' ya da 'false'" },
          reason: { type: "string", description: "Türkçe tek cümle: hangi kontrol maddesi" },
        },
        required: ["chapter", "field", "text", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdict", "promise", "patches"],
  additionalProperties: false,
};

/** The checklist the plan editor reads (our own retention curves + the pro writing study, Oct 2026). */
export function planChecklist({ news = false } = {}) {
  return [
    "KONTROL LİSTESİ (her madde gerçek veriden: kendi izlenme eğrilerimiz + profesyonel yazım araştırması, Ekim 2026):",
    "1) AÇILIŞ (~55 sn): an/çelişki → izleyicinin sorusu → TEK cümlelik vaat → henüz söylenmemiş en güçlü olgu. Açılış bölümünün goal/covers'ında ikinci-üçüncü vaat, 'dürüstlük çerçevesi', 'ne biliniyor/ne bilinmiyor' ayrımı, oryantasyon/özet, fragman listesi VARSA çıkar (Fransa: 0:20-0:50 arasında izleyicinin dörtte biri tam bunlarda gitti; Film Booth: 'söyleyeceğini söylemek kanca değildir').",
    `2) 2. BÖLÜM (~0:55'ten itibaren) ${news ? "BU HAFTANIN olaylarıyla" : "hikâyenin ilk sahnesiyle"} devam eder; haftalar/yıllar öncesine, biyografiye, kurum tarihine dönmez (Fransa: 2. bölüm Eylül'e döndü, %45 → %30).`,
    `3) ARKA PLAN en çok BİR bölüm, ~60-75 sn, kancadan sonraki bölüm asla; bugünkü bir olayın NEDENİ olarak bağlanır ve 'which brings us back to…' ile çıkar${news ? " (background=true işaretlenir)" : ""}.`,
    "4) BUT/THEREFORE: her bölüm bir öncekinin SONUCU ('so', 'which meant') ya da ona İTİRAZ ('but') olarak açılır; 've sonra / bir de' ile dizilmiş bölümler yeniden sıralanır ya da birleştirilir (Parker & Stone).",
    "5) ZİRVEDEN SONRA: en büyük ifşa/itiraf/sayının hemen ardından gelen bölüm yeni bir OLAY ya da SONUÇla açılır; 'versiyonlar / tepkiler / analiz / kim ne diyor' tek başına bir bölüm olamaz — o iddialar olayların içine, isimli kaynağıyla serpiştirilir (Fransa: zirveden sonraki yorum bloğunda kalanların yarısı gitti).",
    "6) Her bölümün hookIn'i SOMUT ve YENİ: bir isim, sayı, saat ya da yer taşıyan olay. 'Now let's look at…', 'To understand X we have to go back…' gibi giriş yasak. Her bölüm bir öncekinden büyük bahis ya da sonuç taşır.",
    "7) VAAT ve DÖNGÜLER: vaat edilen her şey araştırmada GERÇEKTEN cevaplanabiliyor olmalı (cevabı araştırmada olmayan vaat çıkarılır); aynı anda en çok iki açık döngü; en az biri videonun ikinci yarısında ödenir; başlığın vaadi ilk 30 sn'de karşılanır.",
    "8) OLGULAR: goal/covers/hookIn/turn/cliffhanger alanlarındaki her sayı, saat, alıntı ve 'only/first/never' iddiası araştırmada AYNEN geçmeli; geçmiyorsa çıkar ya da araştırmadakiyle değiştir (Fransa: 'four words', 'at 5:53', 'the only death' planda doğdu). Göreli zaman ('four days away', 'tomorrow') yok; mutlak gün/tarih.",
    "9) BELİRSİZLİK tek yerde: bilinmeyenler kapanışa yakın tek bir 'what we still don't know' anında toplanır; her bölüme 'henüz bilinmiyor' serpiştirilmez.",
    "10) KAPANIŞ: açılış sorusunun düz cevabı, açılıştaki imgeye/söze dönüş" + (news ? ", izlenecek 2-3 somut ve tarihli işaret" : "") + "; genel ders kuyruğu yok.",
    "11) Bölüm başlığı (title) bir merak kartı: bölümün cevapladığı soru ya da cesur iddia.",
    "YAPMA: yeni olgu uydurma; bölüm sayısını, sırasını ya da numarasını değiştirme (yalnızca alanları düzelt); iyi alana dokunma. Sorun yoksa patches boş.",
  ];
}

/** The plan as the editor reads it: every chapter with its estimated start time. */
export function planView(bible, plan) {
  let words = 0;
  const lines = (bible.chapters || []).map((c, i) => {
    const at = clock((words / WPM) * 60);
    words += plan?.chapterWords?.[i] ?? plan?.wordsPerChapter ?? 0;
    return [
      `${i + 1}. [~${at}] ${c.title}${c.midpoint ? " [ORTA NOKTA]" : ""}${c.background ? " [ARKA PLAN]" : ""} (yoğunluk ${c.intensity})`,
      `   goal: ${c.goal}`,
      `   covers: ${(c.covers || []).join(" | ")}`,
      `   hookIn: ${c.hookIn}`,
      `   turn: ${c.turn}`,
      `   cliffhanger: ${c.cliffhanger}`,
    ].join("\n");
  });
  const loops = (bible.openLoops || []).map((l) => `- "${l.text}" (kur ${l.setupChapter}, öde ${l.payoffChapter})`).join("\n");
  return [
    `Başlık: ${bible.title}`,
    `Merkez soru: ${bible.centralQuestion}`,
    `Vaat: ${bible.promise}`,
    `Kanca: ${bible.hookWord}`,
    "Bölümler:",
    ...lines,
    "Açık döngüler:",
    loops || "-",
  ].join("\n");
}

/** Facts in the plan's own fields the research does not carry (the same check the narration gets). */
export function planClaimErrors(bible, research) {
  const pseudo = [];
  (bible.chapters || []).forEach((c, i) => {
    for (const f of ["hookIn", "turn", "cliffhanger", "goal"]) if (c?.[f]) pseudo.push({ say: c[f], ch: i + 1, f });
    for (const x of c?.covers || []) pseudo.push({ say: x, ch: i + 1, f: "covers" });
  });
  if (bible.promise) pseudo.push({ say: bible.promise, ch: 1, f: "promise" });
  // "said four words: we lost control" was born in the France plan's hookIn — the stated count is checked here too.
  const counts = countErrors(pseudo).map((x) => ({ scene: x.scene, kind: "count", detail: `"${x.word}" deniyor ama alıntı ${x.actual} kelime ("${x.quote}")` }));
  return [...claimErrors(pseudo, research), ...counts].map((e) => ({ ...e, chapter: pseudo[e.scene].ch, field: pseudo[e.scene].f, text: pseudo[e.scene].say }));
}

/** Applies the editor's patches to a copy of the plan; only known fields of existing chapters change. */
export function applyPlanPatches(bible, res) {
  const b = JSON.parse(JSON.stringify(bible));
  const applied = [];
  const rejected = [];
  for (const p of Array.isArray(res?.patches) ? res.patches : []) {
    const c = b.chapters?.[(p?.chapter ?? 0) - 1];
    if (!c || !PLAN_FIELDS.includes(p?.field)) { rejected.push({ ...p, why: "bölüm ya da alan yok" }); continue; }
    const t = String(p.text ?? "").trim();
    if (p.field === "background") { c.background = /^(true|evet|yes)$/i.test(t); applied.push(p); continue; }
    if (p.field === "covers") {
      const list = t.split("|").map((x) => x.trim()).filter(Boolean);
      if (list.length < 1 || list.length > 6) { rejected.push({ ...p, why: "covers 1-6 olgu olmalı" }); continue; }
      c.covers = list;
      applied.push(p);
      continue;
    }
    if (!t) { rejected.push({ ...p, why: "boş değer" }); continue; }
    c[p.field] = t;
    applied.push(p);
  }
  const promise = String(res?.promise || "").trim();
  if (promise && promise.split(/\s+/).length <= 28) b.promise = promise;
  return { bible: b, applied, rejected };
}

/**
 * Reviews the plan before any chapter is written. `check(b)` → errors (the plan's own validation: chapter count,
 * loops, news background rules); a reviewed plan that fails it is thrown away and the original stays.
 * @returns {{bible, applied, rejected, verdict, cached}}
 */
export async function reviewPlan({ bible, plan, research = "", llm, model, usage, logFn = () => {}, isCancelled = () => false, check = () => [], cache = null, lang = "en" }) {
  const key = sha1(["plan-review-1", bible, plan?.chapterWords || null]);
  let res = cache?.get?.(key) || null;
  const cached = !!res;
  const claims = planClaimErrors(bible, research);
  if (!res) {
    res = await llm({
      system: [
        "Sen bir YouTube belgesel/haber kanalının baş yapımcısı ve yazı editörüsün. Bölümler yazılmadan ÖNCE videonun planını (vuruş planı) izleyici koltuğundan okuyorsun: her bölümün tahmini başlangıç saatine bak ve 'bu dakikada izleyiciyi tutan yeni OLAY ne?' diye sor.",
        `Video dili: ${lang === "en" ? "İngilizce" : "Türkçe"} — yeni alan değerleri bu dilde (reason Türkçe).`,
        ...planChecklist({ news: !!plan?.news }),
      ].join("\n"),
      user: [
        "PLAN:",
        planView(bible, plan),
        "",
        ...(claims.length ? ["KODUN BULDUĞU OLGU SORUNLARI (araştırmayla tutmuyor — MUTLAKA düzelt):", ...claims.map((c) => `- bölüm ${c.chapter} ${c.field}: ${c.detail} ("${String(c.text).slice(0, 120)}")`), ""] : []),
        "ARAŞTIRMA (olgu kontrolü için):",
        String(research).slice(0, 30000),
      ].join("\n"),
      schema: PLAN_REVIEW_SCHEMA,
      maxTokens: 6000,
      usage,
      logFn,
      isCancelled,
      ...(model ? { model } : {}),
    });
    cache?.put?.(key, res);
  }
  const out = applyPlanPatches(bible, res);
  const errors = check(out.bible);
  if (errors.length) {
    logFn(`Plan editörü: düzeltilmiş plan kurallardan geçmedi (${errors.slice(0, 2).join("; ")}) — özgün plan kaldı`);
    return { bible, applied: [], rejected: out.applied, verdict: res?.verdict || "", cached };
  }
  return { ...out, verdict: res?.verdict || "", cached };
}

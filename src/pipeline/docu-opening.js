// AÇILIŞ ÇEŞİTLİLİĞİ (Sinematik Belgesel) — script.opening = { kind }
//
// Her video aynı iskeletle açılıyordu (hızlı montaj + vurucu sözcükler + başlık
// kartı). Motor (docu-engine/src/opening) aynı açılış sahnelerine altı farklı
// İŞLEM uygulayabilir; anlatım, süre, sıra ve kaynaklar DEĞİŞMEZ, yeni bilgi
// uydurulmaz (tarih, saat, alıntı, yer adı yalnızca anlatımdan / sahne alanlarından):
//   headlines   kanca sözcükleri gazete manşeti kupürleri olarak resimlerin üstüne düşer
//   timestamps  tarih/saat geçen her vuruşa daktiloyla yazılan büyük zaman damgası, tıklayan kadran
//   cold-open   ağır renk + sinema bantları + "ileriden bir an" hissi; başlığa sert kesme (+ geri sarma yazısı)
//   evidence    açılış resimleri tek tek panoya iğnelenir, kırmızı ip, sonra başlık
//   map-dive    bölge haritası hikâyenin yerine dalarak açar (senaryoda harita bölgesi varsa)
//   quote       açılışta gerçek bir alıntı varsa: siyah ekranda yalnızca o sözler, bir sessizlik, sonra vuruş
//
// Uygunluk motorun kendi kuralıyla hesaplanır (docu-engine/src/opening/plan.js — tek doğruluk
// kaynağı; motor aynı dosyayla çizer). Sanat yönetmeni (docu-art-director.js) türü seçer:
// Opus önerirse uygunsa o, değilse belirleyici yedek seçim; kanal genelinde son 2 videonun
// açılışı TEKRARLANMAZ (<NOVA_HOME>/data/docu-look-history.json, `opening` alanı).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { ROOT } from "../util.js";

/** Motor klasörü (docu.js docuEngineDir ile aynı; döngüsel içe aktarmayı önlemek için kopya). */
function engineDir() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, "docu-engine");
  if (packaged && fs.existsSync(path.join(packaged, "bin", "nova-run.mjs"))) return packaged;
  return path.join(ROOT, "docu-engine");
}

/** Motorun açılış planlayıcısı; okunamazsa (eski motor) açılış seçilmez — bugünkü açılış. */
const PLAN = await import(pathToFileURL(path.join(engineDir(), "src", "opening", "plan.js")).href).catch(() => null);

export const OPENING_KINDS = PLAN?.OPENING_KINDS ? [...PLAN.OPENING_KINDS] : ["headlines", "timestamps", "cold-open", "evidence", "map-dive", "quote"];
export const openingAvailable = () => !!PLAN;
/** How hard the hook lands: a slam with hit and flash, a dramatic cinematic reveal, or a quiet wonder (no hit, no flash). */
export const HOOK_STYLES = PLAN?.HOOK_STYLES ? [...PLAN.HOOK_STYLES] : ["impact", "cinematic", "quiet"];

/** Kanca şiddeti: modelin önerisi geçerliyse o; değilse türün varsayılanı (suç/korku/finans çöküşü sert, belgesel/destan sinematik, bilim/biyografi sessiz merak). */
export function chooseHook(script, prop) {
  if (HOOK_STYLES.includes(prop)) return prop;
  if (!PLAN?.hookStyle) return null;
  const { opening, ...rest } = script || {};
  return PLAN.hookStyle(rest);
}

export const OPENING_RULES = {
  /** Kanal genelinde son N videonun açılış türü tekrarlanmaz. */
  window: 2,
  /** Gazete manşeti bu yıldan önceki hikâyeye konmaz (1453 kuşatmasında gazete yok). */
  newspaperFrom: 1780,
};

/** Tür uyumu (yüksek = daha uygun); yedek seçimin ağırlığı ve modele ipucu. */
export const OPENING_FIT = {
  headlines: { finance: 3, crime: 2.5, documentary: 2.5, inspire: 2, science: 1.5, horror: 1.5, epic: 1 },
  timestamps: { crime: 3, horror: 3, documentary: 2.5, science: 2, finance: 2, epic: 1.5, inspire: 1.5 },
  "cold-open": { horror: 3, crime: 3, epic: 2.5, documentary: 2, science: 2, inspire: 2, finance: 1.5 },
  evidence: { crime: 3, horror: 2.5, finance: 2, documentary: 1.5, inspire: 1.2, science: 1, epic: 0.8 },
  "map-dive": { epic: 3, documentary: 2.5, science: 2, horror: 2, crime: 2, inspire: 1.5, finance: 1.2 },
  quote: { inspire: 3, documentary: 2.5, epic: 2.5, horror: 2.5, crime: 2.5, finance: 2, science: 2 },
  // Klasik açılış (hızlı montaj + patlayan kanca kelimeleri + başlık): seçeneklerden biri, diğerleriyle eşit ağırlıkta.
  montage: { documentary: 2.5, crime: 2.5, finance: 2.5, epic: 2.5, inspire: 2.5, horror: 2, science: 2 },
};

export const OPENING_DESC = {
  headlines: "the hook words / slams / lines land as rapid newspaper headline clippings over the archive pictures",
  timestamps: "each opening beat with a date or time gets a big typed time stamp (e.g. NOV 24, 1971 · 8:13 PM) with a ticking clock dial",
  "cold-open": "a flash-forward feel: heavier grade, 2.35 letterbox, flash cuts, then a hard cut to the title card (with a short rewind caption when the script rewinds)",
  evidence: "the opening pictures are pinned one by one onto an evidence board joined by red string, then the title",
  "map-dive": "the video opens on the region map diving toward the story's place, then plunges into the footage",
  quote: "the beat holding a real quotation becomes a black screen with only those words lighting up as spoken, a beat of silence, then the hit",
  montage: "the classic opening: a fast montage of the strongest pictures with the hook words slammed in one by one (printed labels), then the big title card",
};

/** Kanal genelinde son N videonun açılışları (aynı video — yeniden planlama — hariç), en yeni önce. */
export function recentOpenings(history, id, n = OPENING_RULES.window) {
  return (Array.isArray(history) ? history : []).filter((e) => !id || e.id !== id).slice(-n).reverse().map((e) => e.opening || null);
}

/**
 * Bu senaryo için açılış seçenekleri: motorun uygunluk kararı + dönem kapısı, ve
 * geçmişin engelledikleri. `open` = seçilebilenler.
 */
export function openingChoices(script, history = [], eraStart = null) {
  const id = script?.id || script?.seedKey || null;
  const eligibility = {};
  if (!PLAN) {
    for (const k of OPENING_KINDS) eligibility[k] = { ok: false, why: "engine has no opening planner" };
    return { eligibility, blocked: [], open: [] };
  }
  const el = PLAN.openingEligibility(script);
  for (const k of OPENING_KINDS) {
    eligibility[k] = { ...(el[k] || { ok: false, why: "unknown" }) };
    if (k === "headlines" && eligibility[k].ok && Number.isFinite(eraStart) && eraStart < OPENING_RULES.newspaperFrom) eligibility[k] = { ok: false, why: `no newspapers in ${eraStart}` };
  }
  const blocked = [...new Set(recentOpenings(history, id).filter(Boolean))];
  const open = OPENING_KINDS.filter((k) => eligibility[k].ok && !blocked.includes(k));
  return { eligibility, blocked, open };
}

const hash01 = (s) => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16) / 0xffffffff;

/**
 * Açılış türü: modelin önerisi uygun ve son videolarda yoksa o; değilse tür uyumu,
 * az kullanılmışlık ve tohuma göre belirleyici seçim. Uygun tür yoksa null (bugünkü açılış).
 */
export function chooseOpening(script, { prop = null, history = [], seed = "", eraStart = null } = {}) {
  const notes = [];
  const { eligibility, blocked, open } = openingChoices(script, history, eraStart);
  const want = typeof prop === "string" ? prop : prop?.kind;
  const hook = chooseHook(script, typeof prop === "object" ? prop?.hook : null);
  if (want) {
    if (open.includes(want)) return { kind: want, hook, notes, eligibility, blocked };
    notes.push(`model açılışı ${want} reddedildi (${!OPENING_KINDS.includes(want) ? "bilinmiyor" : blocked.includes(want) ? "son videolarda kullanıldı" : eligibility[want]?.why || "uygun değil"})`);
  }
  if (!open.length) return { kind: null, hook: null, notes, eligibility, blocked };
  const genre = script?.genre || "documentary";
  const used = new Map();
  for (const e of (Array.isArray(history) ? history : []).slice(-6)) if (e?.opening) used.set(e.opening, (used.get(e.opening) || 0) + 1);
  const score = (k) => (OPENING_FIT[k]?.[genre] ?? 1.5) * (0.75 + 0.5 * hash01(`${seed}|opening|${k}`)) - 0.6 * (used.get(k) || 0);
  const kind = [...open].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
  return { kind, hook, notes, eligibility, blocked };
}

/** Kural denetimi: geçersiz/uygunsuz tür, dönem dışı gazete, son 2 videonun açılışı. */
export function checkOpening(script, { history = null, eraStart = null } = {}) {
  const v = [];
  const kind = script?.opening?.kind;
  if (script?.opening == null) return v;
  if (!OPENING_KINDS.includes(kind)) {
    v.push(`açılış türü geçersiz (${kind})`);
    return v;
  }
  if (script.opening.hook !== undefined && !HOOK_STYLES.includes(script.opening.hook)) v.push(`açılış kancası geçersiz (${script.opening.hook})`);
  if (!PLAN) return v;
  const { eligibility, blocked } = openingChoices(script, history || [], eraStart);
  if (!eligibility[kind]?.ok) v.push(`açılış ${kind} bu senaryoya uygun değil: ${eligibility[kind]?.why}`);
  if (history && blocked.includes(kind)) v.push(`açılış ${kind} son ${OPENING_RULES.window} videoda kullanıldı`);
  return v;
}

/** Modele açılış bölümü (sistem + kullanıcı satırları). */
export function openingPrompt(choices) {
  if (!choices?.open?.length) return { system: [], user: [] };
  const system = [
    "",
    "OPENING: also choose `opening` — HOW this video opens. Pick the treatment for the scenes before the title that fits THIS hook. Every video opens differently; `montage` (the classic fast montage + slammed hook words, then the title) is one option among the others, never in two videos in a row. It never changes narration, timing or order and only shows dates, quotes, places and words that are already in the opening.",
    ...choices.open.map((k) => `- ${k}: ${OPENING_DESC[k]}`),
    "Every opening starts on a HOOK in its first 2-4 s (the first punch the narrator says, landing on the spoken word). Also choose `openingHook` — how hard it lands, from THIS story's tone and the first scenes' mood and energy: impact (slam, hit and white flash — mystery, crime, a crash, horror), cinematic (dramatic but composed: type easing out of a soft bloom, a swell, no flash — big history, disasters told with gravity), quiet (wonder: words rising softly over a held picture, no hit, no flash — science, exploration, a life story).",
  ];
  const user = [
    `OPENING candidates (eligible for this script, not used by the last ${OPENING_RULES.window} videos): ${choices.open.map((k) => `${k} [${choices.eligibility[k].why}]`).join(" · ")}`,
  ];
  if (choices.blocked.length) user.push(`(Recent videos opened with: ${choices.blocked.join(", ")} — not allowed.)`);
  return { system, user };
}

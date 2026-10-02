// KURGU YÖNETMENİ (Sinematik Belgesel)
//
// Senaryo yazıldıktan (ya da hazır senaryo yüklendikten) sonra, arşiv adımından
// ÖNCE bütün senaryoyu okur ve her anın hangi kurgu cihazını hak ettiğine karar
// verir — üst düzey bir belgesel editörü gibi: şüpheliler karşılaştırılıyorsa pano
// (board) ya da bölünmüş ekran (split), kilit bir belge/ifade varsa belge (document),
// yıllara yayılan tarihler varsa zaman çizelgesi (timeline), anlatımda gerçek bir
// alıntı varsa alıntı kartı (quote), arşiv fotoğrafında "bu adam / bu ayrıntı" anı
// varsa işaretleme (annotate), rota/yer varsa harita (map), basın tepkisi varsa
// gazete manşeti (headline).
//
// KURALLAR (kodla uygulanır — modelin her önerisi doğrulanır, geçersiz olan atılır):
//   - `say`, sahne sırası, sahne sayısı, bölümler ve süre alanları DEĞİŞMEZ; yalnızca
//     anlatımı cihaza uyan bir sahnenin görseli (type + cihaz alanları) değişir.
//   - Cihazlar arası en az ~35 sn; aynı cihaz tipi art arda iki kez gelmez; 12 dk'lık
//     videoda toplam ~12-20 cihaz (var olan headline/map dahil).
//   - Olgular yalnızca senaryodan: alıntı kartının metni `say` içinde AYNEN geçmeli,
//     zaman çizelgesindeki yıllar senaryoda geçmeli, pano/harita etiketleri anlatımda
//     geçmeli. `fromScene` yalnızca doğru kişiyi/yeri gösteren ÖNCEKİ bir sahneye.
//   - İsim kartı taşıyan sahne (kişinin ilk görünüşü) başka cihaza çevrilmez.
//
// Plan Claude Opus 5.5 ile (yapılandırılmış JSON), senaryo özetine göre önbelleğe
// alınır (aynı senaryo için iki kez ödenmez). Anthropic kredisi yoksa ya da çağrı
// başarısızsa iş YÖNETMENSİZ devam eder — üretim asla bu adımda durmaz.
//
// Annotate koordinatları: yönetmen arşivden önce çalışır ve fotoğrafı henüz görmez;
// işaretlenecek şeyi (`target`, İngilizce) yazar. Arşivden sonra `placeAnnotations`
// seçilen gerçek fotoğrafta onu bir görme çağrısıyla bulur (x, y, r). Bulunamazsa,
// sahne AI'a düştüyse ya da çağrı başarısızsa işaret kaldırılır: kör işaret yok.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { callJSON, callVisionJSON } from "../llm.js";
import { readJson, writeJson, run } from "../util.js";
import { stripTags, norm, estSceneSeconds, CHAPTER_CARD_SEC } from "./docu-script.js";

/** Kurallar ya da istem değişince önbellekteki planlar yeniden kurulsun. */
export const DIRECTOR_VERSION = "edit-director-1";
export const DIRECTOR_MODEL = "claude-opus-5-5";
export const ANNOTATE_MODEL = "claude-sonnet-5-5";

/**
 * İnfografikler (docu-engine/src/infographics): veri anları. Her sayı ve etiket
 * anlatımdan gelir — sahnenin (ya da komşusunun) `say` satırında geçmeyen sayı reddedilir.
 */
export const INFO_TYPES = ["bars", "donut", "icons", "scale", "flow", "stat"];
export const INFO_ICONS = ["person", "ship", "plane", "coin", "house", "soldier", "bill", "building"];
const TRENDS = ["up", "down"];
/** Kendi sahne tipi olan cihazlar; annotate bir foto sahnesinin alanıdır. */
export const DEVICE_TYPES = ["headline", "map", "board", "document", "timeline", "split", "quote", ...INFO_TYPES];
export const DEVICES = [...DEVICE_TYPES, "annotate"];
const DOC_KINDS = ["fbi-teletype", "letter", "report", "telegram", "ledger"];
const SPLIT_MODES = ["versus", "before-after"];

/**
 * Motorun çizebildiği haritalar (docu-engine/src/geo.ts REGIONS.box ile AYNI —
 * test bunu dosyadan okuyup karşılaştırır). geo: [batı, güney, doğu, kuzey];
 * city/space: 0..1 çerçeve (yerleşimi bilinmediği için yönetmen/yazar kullanmaz).
 */
export const MAP_REGIONS = {
  "pacific-northwest": { kind: "geo", box: [-135.3, 37.2, -104.8, 49.6] },
  bosphorus: { kind: "geo", box: [28.86, 40.985, 29.143, 41.105] },
  "north-atlantic": { kind: "geo", box: [-80, 32.7, 12, 66.3] },
  urals: { kind: "geo", box: [56.68, 60.35, 63.32, 62.15] },
  "wall-street": { kind: "city", box: [0, 0, 1, 1] },
  "solar-system": { kind: "space", box: [0, 0, 1, 1] },
};
export const GEO_REGIONS = Object.keys(MAP_REGIONS).filter((k) => MAP_REGIONS[k].kind === "geo");

/** geo.ts regionXY ile aynı doğrusal izdüşüm. */
export function regionXY(region, lat, lon) {
  const r = MAP_REGIONS[region];
  if (!r || r.kind !== "geo") return null;
  const [w, s, e, n] = r.box;
  return { x: +((lon - w) / (e - w)).toFixed(4), y: +((n - lat) / (n - s)).toFixed(4) };
}

/** Cihazlar arası en kısa aralık (sn) ve 12 dakikalık videoda tavan. */
export const MIN_GAP_SEC = 35;
export const MAX_DEVICES = 20;
/** Görseli değiştirilebilecek sahneler (sayaç, grafik, slam, başlık, montaj zaten birer cihaz). */
const CONVERTIBLE = new Set(["photo", "words"]);
/** Cihaz görsel alanları: görselsiz cihaza çevrilen sahneden atılır. */
const PICTURE_FIELDS = ["imagePrompt", "imagePrompts", "cast", "source", "search", "media", "image", "images", "clips", "imgW", "imgH", "video", "videoStart", "videoDur", "videoW", "videoH", "heldBg", "archived", "layers", "depth", "focus", "bg", "fullBleed", "natural"];
/** Eski tipe özgü alanlar: her dönüşümde atılır. */
const TYPE_FIELDS = ["text", "keyword", "word", "sub", "from", "to", "label", "prefix", "suffix", "decimals", "year", "points", "name", "role", "caption", "kicker", "title", "at",
  "paper", "headline", "date", "translation", "region", "places", "route", "line", "items", "links", "doc", "highlight", "redact", "stamp", "events", "span", "left", "right", "mode", "quote", "who", "when", "fromScene",
  "unit", "sort", "slices", "centerLabel", "total", "filled", "icon", "a", "b", "nodes", "edges", "value", "trend"];

/* ================================================================ metin yardımcıları */

const STOP = new Set([
  "bir", "bu", "şu", "o", "ve", "ile", "de", "da", "ki", "mi", "ne", "için", "gibi", "kadar", "daha", "çok", "en", "her", "hiç", "ama", "sonra", "önce", "olan", "oldu", "olarak", "diye", "değil", "var", "yok",
  "the", "a", "an", "of", "in", "on", "at", "to", "and", "or", "for", "with", "by", "from", "is", "was", "were", "his", "her", "their", "its", "that", "this", "as",
]);
const toks = (t) => stripTags(t).split(/[\s\-–—/]+/).map(norm).filter(Boolean);
const content = (t) => toks(t).filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w));
/** Türkçe ekler için kök eşleşmesi: "merdivende" ↔ "merdiven", "Cooper'ın" ↔ "Cooper". */
function stemMatch(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 4 || /^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  const k = Math.min(n, 5);
  return a.slice(0, k) === b.slice(0, k);
}
/** Metnin içerik kelimelerinin en az `share` kadarı derlemde geçiyor mu? */
export function grounded(text, corpus, share = 0.5) {
  const cw = content(text);
  if (!cw.length) return false;
  const hits = cw.filter((w) => corpus.some((c) => stemMatch(w, c))).length;
  return hits >= Math.max(1, Math.ceil(cw.length * share - 1e-9));
}
/** `sub` (alıntı) `all` (anlatım) içinde bitişik ve aynı sırayla mı? */
export function containsPhrase(all, sub) {
  const a = toks(all), b = toks(sub);
  if (!b.length || b.length > a.length) return false;
  outer: for (let i = 0; i + b.length <= a.length; i++) {
    for (let j = 0; j < b.length; j++) if (a[i + j] !== b[j]) continue outer;
    return true;
  }
  return false;
}
const str = (v, max) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s && [...s].length <= max ? s : "";
};
const isInt = (v) => Number.isInteger(v);
const clock = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/* ================================================================ yıllar */

const TR_NUM = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90, yüz: 100, bin: 1000 };
const EN_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, oh: 0 };
const TR_WORDS = Object.keys(TR_NUM).sort((a, b) => b.length - a.length);

function trWord(tok) {
  if (TR_NUM[tok] !== undefined) return { v: TR_NUM[tok], suffix: false };
  const w = TR_WORDS.find((x) => tok.startsWith(x) && tok.length - x.length <= 5);
  return w ? { v: TR_NUM[w], suffix: true, w } : null;
}
function combine(vals) {
  let total = 0, cur = 0;
  for (const v of vals) {
    if (v === 1000) { total += (cur || 1) * 1000; cur = 0; }
    else if (v === 100) cur = (cur || 1) * 100;
    else cur += v;
  }
  return total + cur;
}
/** Anlatımda geçen yıllar: rakamla (1971) ve yazıyla ("bin dokuz yüz yetmiş bir", "nineteen seventy-one"). */
export function yearsIn(text) {
  const out = new Set();
  const raw = stripTags(text);
  for (const m of raw.matchAll(/\b(1[1-9]\d\d|20\d\d)\b/g)) out.add(+m[1]);
  // Noktalama bir sayıyı bitirir ("elli iki. Bin dokuz yüz…" iki ayrı yıl): "|" sınır işareti.
  const t = raw.replace(/[,.;:!?()…]+/g, " | ").split(/[\s\-–—"'’“”]+/).map((w) => (w === "|" ? w : norm(w))).filter(Boolean);
  // Türkçe
  for (let i = 0; i < t.length; i++) {
    const run = [];
    let hasBin = false;
    for (let j = i; j < t.length; j++) {
      const w = t[j] === "|" ? null : trWord(t[j]);
      if (!w || (w.v === 1000 && hasBin)) break;
      run.push(w.v);
      if (w.v === 1000) hasBin = true;
      if (w.suffix) break;
    }
    if (hasBin && run.length >= 2) {
      const y = combine(run);
      if (y >= 1100 && y <= 2100) out.add(y);
    }
  }
  // İngilizce: "nineteen seventy one", "eighteen eighty-four", "two thousand ten"
  for (let i = 0; i < t.length; i++) {
    const run = [];
    for (let j = i; j < t.length && EN_NUM[t[j]] !== undefined; j++) run.push(EN_NUM[t[j]]);
    if (run.length < 2) continue;
    let y = 0;
    if (run.includes(1000)) y = combine(run.filter((v) => v !== 0));
    else if (run[0] >= 11 && run[0] <= 20 && run[1] !== 1000) y = run[1] === 100 ? run[0] * 100 + combine(run.slice(2)) : run[0] * 100 + combine(run.slice(1));
    if (y >= 1100 && y <= 2100) out.add(y);
  }
  return out;
}

/* ================================================================ sayılar (infografikler) */

const EN_ALL = { ...EN_NUM, zero: 0, million: 1e6, billion: 1e9, trillion: 1e12 };
delete EN_ALL.oh;
const TR_ALL = { ...TR_NUM, sıfır: 0, milyon: 1e6, milyar: 1e9, trilyon: 1e12 };
const TR_ALL_KEYS = Object.keys(TR_ALL).sort((a, b) => b.length - a.length);
/** Sayının alabileceği Türkçe ekler: "dokuzu", "üçte", "onda", "binde". */
const TR_NUM_SUFFIX = new Set(["i", "ı", "u", "ü", "a", "e", "yi", "yı", "yu", "yü", "ya", "ye", "si", "sı", "su", "sü", "in", "ın", "un", "ün", "nin", "nın", "nun", "nün", "de", "da", "te", "ta", "den", "dan", "ten", "tan", "le", "la", "lik", "lık", "luk", "lük", "ler", "lar", "er", "ar", "şer", "şar", "inci", "ıncı", "uncu", "üncü", "nci", "ncı", "ncu", "ncü"]);
const MULT_WORDS = { thousand: 1e3, bin: 1e3, million: 1e6, milyon: 1e6, billion: 1e9, milyar: 1e9, trillion: 1e12, trilyon: 1e12 };
const MULT_LETTERS = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12 };

function numberWord(w, tr) {
  if (w === "yüzde" || w === "percent") return null;
  if (EN_ALL[w] !== undefined) return { v: EN_ALL[w], end: false };
  if (!tr) return null;
  if (TR_ALL[w] !== undefined) return { v: TR_ALL[w], end: false };
  const k = TR_ALL_KEYS.find((x) => w.startsWith(x) && TR_NUM_SUFFIX.has(w.slice(x.length)));
  return k ? { v: TR_ALL[k], end: true } : null;
}
/** "5,800" · "5.800" · "13,8" · "38%" → aday değerler (binlik ayırıcı ya da ondalık). */
function digitCands(raw) {
  const m = String(raw).match(/\d[\d.,]*/);
  if (!m) return [];
  const s = m[0].replace(/[.,]+$/, "");
  const out = new Set();
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    out.add(Number(s.replace(/[.,]/g, "")));
    if (/^\d{1,3}[.,]\d{3}$/.test(s)) out.add(Number(s.replace(",", ".")));
  } else if (/^\d+[.,]\d+$/.test(s)) out.add(Number(s.replace(",", ".")));
  else out.add(Number(s.replace(/[.,]/g, "")));
  return [...out].filter(Number.isFinite);
}
/**
 * Anlatımda SÖYLENEN sayılar: rakamla ("$5,800", "13,8 milyar", "38%") ve yazıyla
 * ("two hundred thousand", "onda dokuzu", "iki yüz bin"). Çarpanlı olanlar hem ham hem
 * çarpılmış değeri verir (13,8 ve 13,8e9) — infografik hangisini yazarsa yazsın eşleşir.
 * Türkçe sayı kelimeleri yalnızca Türkçe videoda ("on" İngilizcede edattır).
 */
export function numbersIn(text, lang = "tr") {
  const tr = lang !== "en";
  const raw = stripTags(text).split(/\s+/).filter(Boolean);
  const out = [];
  const stops = (k) => /[.,;:!?…)"”]$/.test(raw[k] || "");
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i];
    if (/\d/.test(tok)) {
      const base = digitCands(tok);
      if (!base.length) continue;
      const letters = tok.replace(/.*\d/, "").replace(/[^a-z]/gi, "").toLowerCase();
      const nextW = norm(raw[i + 1] || "");
      const mult = MULT_LETTERS[letters] || (!stops(i) && MULT_WORDS[nextW]) || 1;
      out.push(...base, ...(mult > 1 ? base.map((b) => b * mult) : []));
      continue;
    }
    const parts = tok.split(/[-‐–—]/).map(norm).filter(Boolean);
    if (!parts.length) continue;
    const run = [];
    let j = i;
    let ended = false;
    // Tire ile bitişik yazılmış sayı ("twenty-one") tek sözcükte birden çok parça.
    const wordsAt = (k) => raw[k].split(/[-‐–—]/).map(norm).filter(Boolean);
    while (!ended && j < raw.length) {
      const ws = j === i ? parts : wordsAt(j);
      if (j > i && ws.length === 1 && ws[0] === "and" && raw[j + 1] && numberWord(norm(raw[j + 1]), tr)) { j++; continue; }
      const vals = ws.map((w) => numberWord(w, tr));
      if (!vals.length || vals.some((x) => !x)) break;
      for (const x of vals) run.push(x.v);
      ended = vals.some((x) => x.end) || stops(j);
      j++;
    }
    if (!run.length) continue;
    if (run.length === 1 && run[0] >= 1000) { i = j - 1; continue; }
    out.push(combine(run));
    if (i > 0 && ["a", "bir"].includes(norm(raw[i - 1])) && run[0] >= 100) out.push(combine([1, ...run]));
    i = j - 1;
  }
  return out;
}
/** `v` anlatımdaki sayılardan biri mi (%1 tolerans: "yaklaşık 5.800" ile 5.796 aynı olgu). */
export const spokenHas = (nums, v) => Number.isFinite(v) && nums.some((x) => Math.abs(x - v) <= Math.max(Math.abs(v) * 0.01, 1e-9));
/** Bir metnin içindeki rakam grupları ("$5,800", "1 in 3" → [5800], [1, 3]). */
const digitGroups = (t) => [...String(t || "").matchAll(/\d[\d.,]*\d|\d/g)].map((m) => digitCands(m[0]));

/* ================================================================ senaryo bağlamı */

const langOfScript = (script) => (/^en/i.test(script?.locale || "") ? "en" : "tr");
const isCard = (s) => s?.type === "title" && s.chapterCard;
/** Sahnenin bir cihaz olup olmadığı (var olan headline/map dahil). */
export function deviceOf(s) {
  if (!s) return null;
  if (DEVICE_TYPES.includes(s.type)) return s.type;
  if (s.annotate) return "annotate";
  return null;
}
const sceneText = (s) => [s.say, s.name, s.role, s.caption, s.text, s.title, s.kicker, s.label, s.search, s.imagePrompt, s.headline, s.translation, s.quote, s.who, ...(s.cast || [])].filter(Boolean).join(" ");
/** Sahnenin bir resmi var mı (fromScene hedefi olabilir mi)? */
function hasPicture(s) {
  if (!s || isCard(s) || s.bg === "prev" || s.heldBg) return false;
  if (!["photo", "words", "slam", "title", "headline", "quote", "document"].includes(s.type)) return false;
  return !!(s.imagePrompt || s.search || s.image || s.video);
}

/** Tahmini sahne başlangıçları (sn): motorun max(dur, ses) kuralı + bölüm kartları. */
export function sceneTimes(script) {
  const lang = langOfScript(script);
  const starts = [];
  let t = 0;
  script.scenes.forEach((s, i) => {
    if (i > 0 && (s.chapter ?? 0) !== (script.scenes[i - 1].chapter ?? 0)) t += CHAPTER_CARD_SEC;
    starts.push(t);
    t += Number(s.voiceDur) > 0 ? Math.max(Number(s.dur) || 0, s.voiceDur + 0.4) : estSceneSeconds(s, lang);
  });
  return { starts, total: t };
}

function makeCtx(script) {
  const scenes = script.scenes;
  const { starts, total } = sceneTimes(script);
  const tokLists = scenes.map((s) => toks(sceneText(s)));
  const head = toks([script.title, ...(script.chapters || []).map((c) => (typeof c === "string" ? c : c?.title)), script.era, ...Object.keys(script.cast || {})].filter(Boolean).join(" "));
  const upTo = [];
  let acc = [...head];
  for (let i = 0; i < scenes.length; i++) { acc = acc.concat(tokLists[i]); upTo.push(acc); }
  const years = new Set();
  for (const s of scenes) {
    for (const y of yearsIn([s.say, s.search, s.text, s.title, s.kicker, s.caption, s.label, s.date, s.headline].filter(Boolean).join(" "))) years.add(y);
    if (s.type === "counter" && s.year && isInt(s.to)) years.add(s.to);
  }
  for (const y of yearsIn([script.era, script.title].filter(Boolean).join(" "))) years.add(y);
  return {
    script, scenes, starts, total, years,
    all: upTo.at(-1) || head,
    upTo: (i) => upTo[Math.min(i, upTo.length - 1)] || head,
    win: (i, a, b) => scenes.slice(Math.max(0, i - a), i + b + 1).flatMap((s) => toks(s.say)),
    sceneToks: (i) => tokLists[i] || [],
  };
}

/* ================================================================ cihaz doğrulama */

const PRESS = /gazete|manşet|basın|haber(ler|i)|muhabir|newspaper|headline|press|reporter|front page|editorial/i;

/**
 * Bir öneriyi (yönetmen yaması ya da senaryodaki cihaz) doğrular ve sahnenin yeni
 * hâlini kurar. Geçersizse `{error}` döner — neden, günlüğe yazılır.
 * `final(i)` referans kontrolü için sahnenin SON hâlini verir.
 */
export function buildDevice(p, i, ctx, final = (k) => ctx.scenes[k]) {
  const s = ctx.scenes[i];
  const say = stripTags(s?.say);
  const bad = (error) => ({ error });
  if (!s || isCard(s)) return bad("sahne yok");
  const device = p.device;
  if (!DEVICES.includes(device)) return bad(`bilinmeyen cihaz ${device}`);
  const refOk = (ref, label) => {
    if (ref === undefined || ref === null) return true;
    if (!isInt(ref) || ref < 0 || ref >= i) return false;
    const r = final(ref);
    if (!hasPicture(r)) return false;
    return !label || grounded(label, toks(sceneText(r)), 0.34);
  };

  if (device === "annotate") {
    if (s.type !== "photo") return bad("annotate yalnızca photo sahnesinde");
    if (!((s.source === "archive" || s.source === "stock") && s.search) && !s.image) return bad("annotate gerçek bir fotoğraf ister (arşiv)");
    const label = str(p.label, 28);
    const target = str(p.target, 100);
    if (!label || !grounded(label, ctx.sceneToks(i), 0.5)) return bad("annotate etiketi anlatımda geçmiyor");
    if (!target && !(Number.isFinite(p.x) && Number.isFinite(p.y))) return bad("annotate hedefi yok");
    const a = { label, ...(target ? { target } : {}) };
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return bad("annotate koordinatı 0..1 dışında");
      a.x = p.x; a.y = p.y;
      if (Number.isFinite(p.r)) a.r = Math.max(0.03, Math.min(0.4, p.r));
    }
    if (p.arrow === true) a.arrow = true;
    if (Number.isFinite(p.at) && p.at >= 0) a.at = +p.at.toFixed(2);
    else if (p.atWord) {
      const w = toks(say);
      const k = w.findIndex((x) => stemMatch(x, norm(p.atWord)));
      if (k >= 0) a.at = +((k / Math.max(1, w.length)) * estSceneSeconds(s, langOfScript(ctx.script)) * 0.9).toFixed(2);
    }
    return { scene: { ...s, annotate: a }, keepPicture: true };
  }

  const f = {};
  let keepPicture = false;
  if (device === "quote") {
    const quote = str(p.quote, 240);
    const who = str(p.who, 60);
    if (!quote || toks(quote).length < 3) return bad("alıntı çok kısa");
    if (!containsPhrase(say, quote)) return bad("alıntı metni anlatımda aynen geçmiyor");
    if (!who || !grounded(who, ctx.upTo(i), 0.5)) return bad("alıntının sahibi senaryoda geçmiyor");
    if (!refOk(p.fromScene, who)) return bad("fromScene alıntının sahibini göstermiyor");
    Object.assign(f, { quote, who });
    const when = str(p.when, 40);
    if (when) f.when = when;
    if (isInt(p.fromScene)) f.fromScene = p.fromScene;
    else keepPicture = true;
  } else if (device === "headline") {
    const paper = str(p.paper, 40), headline = str(p.headline, 90);
    if (!paper || !headline || toks(headline).length < 2 || toks(headline).length > 10) return bad("manşet eksik");
    const pressy = PRESS.test(ctx.scenes.slice(Math.max(0, i - 2), i + 2).map((x) => x.say).join(" "));
    const tr = str(p.translation, 140);
    if (!pressy && !grounded(tr || headline, ctx.win(i, 3, 1), 0.5)) return bad("manşet anlatıma dayanmıyor (basın anı yok)");
    const date = str(p.date, 32);
    if (date) {
      const ys = yearsIn(date);
      if ([...ys].some((y) => !ctx.years.has(y))) return bad("manşet tarihi senaryoda geçmiyor");
    }
    Object.assign(f, { paper, headline });
    if (date) f.date = date;
    const sub = str(p.sub, 120);
    if (sub) f.sub = sub;
    if (tr) f.translation = tr;
    keepPicture = true;
  } else if (device === "map") {
    const region = p.region;
    const reg = MAP_REGIONS[region];
    if (!reg) return bad("bilinmeyen harita bölgesi");
    const src = Array.isArray(p.places) ? p.places : Array.isArray(p.points) ? p.points : [];
    if (src.length < 1 || src.length > 6) return bad("harita 1-6 yer ister");
    const points = [];
    for (const q of src) {
      const label = str(q?.label, 32);
      if (!label) return bad("harita etiketi yok");
      let xy = null;
      if (Number.isFinite(q.lat) && Number.isFinite(q.lon)) xy = regionXY(region, q.lat, q.lon);
      else if (Number.isFinite(q.x) && Number.isFinite(q.y) && (reg.kind !== "geo" || p._trusted)) xy = { x: q.x, y: q.y };
      if (!xy) return bad("harita noktası konumsuz");
      if (xy.x < 0.02 || xy.x > 0.98 || xy.y < 0.02 || xy.y > 0.98) return bad(`"${label}" haritanın dışında`);
      if (!p._trusted && !grounded(label, ctx.win(i, 3, 2), 0.5)) return bad(`"${label}" anlatımda geçmiyor`);
      points.push({ label, x: xy.x, y: xy.y });
    }
    f.region = region;
    f.points = points;
    if (Array.isArray(p.route)) {
      const r = p.route.filter((k) => isInt(k) && k >= 0 && k < points.length);
      if (r.length >= 2 && new Set(r).size === r.length) f.route = r;
    }
    if (p.line === "barrier" || p.line === "route") f.line = p.line;
    if (isInt(p.focus) && p.focus >= 0 && p.focus < points.length) f.focus = p.focus;
    const title = str(p.title, 32);
    if (title) f.title = title;
  } else if (device === "board") {
    const items = Array.isArray(p.items) ? p.items : [];
    if (items.length < 2 || items.length > 6) return bad("pano 2-6 öğe ister");
    f.items = [];
    for (const it of items) {
      const label = str(it?.label, 28);
      if (!label || !grounded(label, ctx.upTo(i + 1), 0.5)) return bad(`pano öğesi "${it?.label}" senaryoda geçmiyor`);
      if (!refOk(it.fromScene, label)) return bad(`pano öğesi "${label}": fromScene doğru kişiyi/yeri göstermiyor`);
      const o = { label };
      if (isInt(it.fromScene)) o.fromScene = it.fromScene;
      const note = str(it.note, 44);
      if (note) o.note = note;
      f.items.push(o);
    }
    if (Array.isArray(p.links)) {
      const links = p.links.filter((l) => Array.isArray(l) && l.length === 2 && l.every((k) => isInt(k) && k >= 0 && k < f.items.length) && l[0] !== l[1]);
      if (links.length) f.links = links.slice(0, 8);
    }
    if (isInt(p.focus) && p.focus >= 0 && p.focus < f.items.length) f.focus = p.focus;
    const title = str(p.title, 32);
    if (title) f.title = title;
  } else if (device === "document") {
    const d = p.doc;
    if (d && typeof d === "object") {
      if (!DOC_KINDS.includes(d.kind)) return bad("bilinmeyen belge türü");
      const lines = (Array.isArray(d.lines) ? d.lines : []).map((l) => str(l, 80)).filter(Boolean);
      if (!lines.length || lines.length > 8) return bad("belge 1-8 satır ister");
      if (!grounded(lines.join(" "), ctx.win(i, 3, 1).concat(ctx.sceneToks(i)), 0.6)) return bad("belge satırları anlatıma dayanmıyor");
      f.doc = { kind: d.kind, lines };
      const heading = str(d.heading, 50);
      if (heading) f.doc.heading = heading;
      // Turkish case rules (as before), or English ones: "Airline" must be found in "AIRLINE" (tr lowercases I to ı).
      const inLines = (x) => lines.some((l) => l.toLocaleLowerCase("tr-TR").includes(x.toLocaleLowerCase("tr-TR")) || l.toLocaleLowerCase("en-US").includes(x.toLocaleLowerCase("en-US")));
      const hl = str(p.highlight, 70);
      if (hl) { if (!inLines(hl)) return bad("vurgulanan ifade belgede yok"); f.highlight = hl; }
      if (Array.isArray(p.redact)) {
        const red = p.redact.map((x) => str(x, 60)).filter(Boolean);
        if (red.some((x) => !inLines(x))) return bad("karartılan ifade belgede yok");
        if (red.length) f.redact = red.slice(0, 4);
      }
    } else if (p.useImage && ((s.source === "archive" && s.search) || s.image)) {
      keepPicture = true;
    } else return bad("belge ne metin ne de gerçek bir tarama taşıyor");
    const stamp = str(p.stamp, 20);
    if (stamp) {
      if (!grounded(stamp, ctx.win(i, 4, 1), 0.5) && !/^(gizli|çokgizli|kişiyeözel|secret|topsecret|confidential|classified|kapandı|closed|urgent|acil|delil|evidence)$/.test(norm(stamp))) return bad("damga anlatıma dayanmıyor");
      f.stamp = stamp;
    }
  } else if (device === "timeline") {
    const evs = Array.isArray(p.events) ? p.events : [];
    if (evs.length < 3 || evs.length > 7) return bad("zaman çizelgesi 3-7 olay ister");
    const events = [];
    for (const e of evs) {
      const label = str(e?.label, 34);
      if (!isInt(e?.year) || !label) return bad("zaman çizelgesi olayı eksik");
      if (!ctx.years.has(e.year)) return bad(`${e.year} yılı senaryoda geçmiyor`);
      if (!grounded(label, ctx.all, 0.5)) return bad(`"${label}" senaryoda geçmiyor`);
      events.push({ year: e.year, label });
    }
    events.sort((a, b) => a.year - b.year);
    if (new Set(events.map((e) => `${e.year}|${e.label}`)).size !== events.length) return bad("tekrar eden olay");
    f.events = events;
    if (isInt(p.focus) && p.focus >= 0 && p.focus < events.length) f.focus = p.focus;
    if (Array.isArray(p.span) && p.span.length === 2 && p.span.every(isInt) && p.span[0] < p.span[1]) f.span = p.span;
  } else if (device === "split") {
    const side = (x) => {
      if (!x || typeof x !== "object") return null;
      const label = str(x.label, 28);
      if (label && !grounded(label, ctx.upTo(i + 1), 0.5)) return null;
      if (!refOk(x.fromScene, label)) return null;
      if (!isInt(x.fromScene) && !label) return null;
      return { ...(isInt(x.fromScene) ? { fromScene: x.fromScene } : {}), ...(label ? { label } : {}) };
    };
    const left = side(p.left), right = side(p.right);
    if (!left || !right) return bad("bölünmüş ekranın bir tarafı geçersiz (etiket senaryoda yok ya da fromScene yanlış)");
    if (isInt(left.fromScene) && left.fromScene === right.fromScene) return bad("iki taraf aynı sahne");
    Object.assign(f, { left, right, mode: SPLIT_MODES.includes(p.mode) ? p.mode : "versus" });
  } else if (INFO_TYPES.includes(device)) {
    const r = buildInfo(p, i, ctx);
    if (r.error) return bad(r.error);
    Object.assign(f, r.fields);
  }

  // Yeni sahne: anlatım, süre, bölüm, geçiş, ses aynen; eski tipin alanları atılır.
  const out = { ...s };
  for (const k of TYPE_FIELDS) delete out[k];
  if (!keepPicture) for (const k of PICTURE_FIELDS) delete out[k];
  else for (const k of ["imagePrompts", "images", "clips", "depth", "layers", "fullBleed", "natural"]) delete out[k];
  delete out.annotate;
  Object.assign(out, { type: device }, f);
  return { scene: out, keepPicture };
}

/**
 * İnfografik alanlarını doğrular ve kurar. Veri UYDURULAMAZ: her sayı sahnenin ya da
 * komşusunun (bir önceki / sonraki) anlatımında söylenmiş olmalı (rakamla ya da yazıyla),
 * her etiket anlatıma dayanmalı. Tek istisnalar: pastanın "geri kalanı" dilimi (100 ya da
 * söylenen toplamdan çıkan) ve yüzdeyle söylenen piktogram ("yüzde 90" → 10'da 9).
 * @returns {{fields?: object, error?: string}}
 */
export function buildInfo(p, i, ctx) {
  const device = p.device;
  const lang = langOfScript(ctx.script);
  const near = ctx.scenes.slice(Math.max(0, i - 1), i + 2).map((x) => x?.say || "").join(" ");
  const nums = numbersIn(near, lang);
  const words = ctx.win(i, 2, 1).concat(ctx.sceneToks(i));
  const bad = (error) => ({ error });
  const said = (v) => spokenHas(nums, Number(v));
  const labelOk = (l) => grounded(l, words, 0.5);
  const digitsOk = (t) => digitGroups(t).every((c) => c.some((v) => said(v)));
  const hiIdx = isInt(p.highlightIndex) ? p.highlightIndex : isInt(p.highlight) ? p.highlight : null;
  const f = {};
  const unit = str(p.unit, 14);
  const title = str(p.title, 40);
  switch (device) {
    case "bars": {
      const items = Array.isArray(p.items) ? p.items : [];
      if (items.length < 2 || items.length > 8) return bad("bars 2-8 öğe ister");
      f.items = [];
      for (const it of items) {
        const label = str(it?.label, 40);
        const value = Number(it?.value);
        if (!label || it?.value === undefined || it?.value === null || !Number.isFinite(value) || value < 0) return bad("bars öğesi label ve sayı (>= 0) ister");
        if (!labelOk(label)) return bad(`bars etiketi "${label}" anlatımda geçmiyor`);
        if (!said(value)) return bad(`bars değeri ${value} anlatımda geçmiyor (uydurma veri)`);
        const o = { label, value };
        if (/^#[0-9a-f]{6}$/i.test(String(it?.color || ""))) o.color = it.color;
        f.items.push(o);
      }
      if (f.items.every((x) => x.value === 0)) return bad("bars değerlerinin hepsi sıfır");
      if (unit) f.unit = unit;
      if (hiIdx != null && hiIdx >= 0 && hiIdx < f.items.length) f.highlight = hiIdx;
      if (p.sort === true) f.sort = true;
      break;
    }
    case "donut": {
      const slices = Array.isArray(p.slices) ? p.slices : [];
      if (slices.length < 2 || slices.length > 6) return bad("donut 2-6 dilim ister");
      f.slices = [];
      for (const sl of slices) {
        const label = str(sl?.label, 36);
        const value = Number(sl?.value);
        if (!label || !Number.isFinite(value) || value <= 0) return bad("donut dilimi label ve pozitif sayı ister");
        if (!labelOk(label)) return bad(`donut etiketi "${label}" anlatımda geçmiyor`);
        f.slices.push({ label, value });
      }
      const unsaid = f.slices.map((s, k) => (said(s.value) ? -1 : k)).filter((k) => k >= 0);
      if (unsaid.length > 1) return bad(`donut değerleri anlatımda geçmiyor (uydurma veri): ${unsaid.map((k) => f.slices[k].value).join(", ")}`);
      if (unsaid.length === 1) {
        // "Geri kalanı": 100'den ya da söylenen toplamdan çıkan dilim.
        const v = f.slices[unsaid[0]].value;
        const rest = f.slices.reduce((a, s) => a + s.value, 0) - v;
        if (![100, ...nums].some((t) => t > rest && Math.abs(t - rest - v) <= Math.max(1e-9, 0.01 * t))) return bad(`donut değeri ${v} anlatımda geçmiyor ve kalanı da değil (uydurma veri)`);
      }
      const center = str(p.centerLabel, 24);
      if (center) {
        if (/\d/.test(center) ? !digitsOk(center) : !labelOk(center)) return bad("donut centerLabel anlatımda geçmiyor");
        f.centerLabel = center;
      }
      if (hiIdx != null && hiIdx >= 0 && hiIdx < f.slices.length) f.highlight = hiIdx;
      break;
    }
    case "icons": {
      const total = Number(p.total);
      const filled = Number(p.filled);
      if (!isInt(total) || total < 2 || total > 100 || !isInt(filled) || filled < 1 || filled > total) return bad("icons: total 2-100, filled 1..total tam sayı olmalı");
      if (!INFO_ICONS.includes(p.icon)) return bad(`icons: icon ${INFO_ICONS.join("|")} olmalı`);
      const label = str(p.label, 60);
      if (!label || !labelOk(label)) return bad("icons etiketi anlatımda geçmiyor");
      const pct = (filled / total) * 100;
      if (!((said(filled) && said(total)) || (Number.isInteger(Math.round(pct * 10) / 10) && said(pct) && [2, 4, 5, 10, 20, 25, 50, 100].includes(total))))
        return bad(`icons: ${filled}/${total} anlatımda geçmiyor (uydurma veri)`);
      Object.assign(f, { total, filled, icon: p.icon, label });
      break;
    }
    case "scale": {
      const side = (x) => {
        const label = str(x?.label, 40);
        const value = Number(x?.value);
        if (!label || !Number.isFinite(value) || value <= 0) return { error: "scale: a ve b label ve pozitif sayı ister" };
        if (!labelOk(label)) return { error: `scale etiketi "${label}" anlatımda geçmiyor` };
        if (!said(value)) return { error: `scale değeri ${value} anlatımda geçmiyor (uydurma veri)` };
        return { v: { label, value } };
      };
      const a = side(p.a);
      const b = side(p.b);
      if (a.error || b.error) return bad(a.error || b.error);
      const hi = Math.max(a.v.value, b.v.value);
      const lo = Math.min(a.v.value, b.v.value);
      if (hi / lo < 1.5) return bad("scale: iki değer arasında gösterilecek ölçek farkı yok (< 1.5x)");
      Object.assign(f, { a: a.v, b: b.v });
      if (unit) f.unit = unit;
      break;
    }
    case "flow": {
      const nodes = Array.isArray(p.nodes) ? p.nodes : [];
      if (nodes.length < 3 || nodes.length > 7) return bad("flow 3-7 düğüm ister");
      f.nodes = [];
      const ids = new Set();
      for (const nd of nodes) {
        const id = str(nd?.id, 24);
        const label = str(nd?.label, 36);
        if (!id || !label || ids.has(id)) return bad("flow düğümü benzersiz id ve label ister");
        if (!labelOk(label)) return bad(`flow düğümü "${label}" anlatımda geçmiyor`);
        ids.add(id);
        f.nodes.push({ id, label });
      }
      const edges = Array.isArray(p.edges) ? p.edges : [];
      f.edges = [];
      const seenE = new Set();
      for (const e of edges) {
        if (!Array.isArray(e) || e.length < 2) return bad("flow kenarı [from, to, label?] olmalı");
        const [a, b] = [String(e[0]), String(e[1])];
        if (!ids.has(a) || !ids.has(b) || a === b) return bad(`flow kenarı geçersiz: ${JSON.stringify(e)}`);
        if (seenE.has(`${a}>${b}`)) continue;
        seenE.add(`${a}>${b}`);
        const label = e[2] == null ? "" : str(e[2], 24);
        if (label && (/\d/.test(label) ? !digitsOk(label) : !labelOk(label))) return bad(`flow ok etiketi "${label}" anlatımda geçmiyor`);
        f.edges.push(label ? [a, b, label] : [a, b]);
      }
      if (f.edges.length < 2 || f.edges.length > 10) return bad("flow 2-10 kenar ister");
      const linked = new Set(f.edges.flatMap((e) => [e[0], e[1]]));
      if (f.nodes.some((n) => !linked.has(n.id))) return bad("flow: bağlantısız düğüm var");
      break;
    }
    case "stat": {
      const value = str(p.value, 18);
      if (!value || !/\d/.test(value)) return bad("stat value rakam içermeli (\"$5,800\", \"38%\", \"1 in 3\")");
      if (!digitsOk(value)) return bad(`stat değeri "${value}" anlatımda geçmiyor (uydurma veri)`);
      const label = str(p.label, 60);
      if (!label || !labelOk(label)) return bad("stat etiketi anlatımda geçmiyor");
      Object.assign(f, { value, label });
      const sub = str(p.sub, 90);
      if (sub) {
        if (!digitsOk(sub) || !grounded(sub, words, 0.34)) return bad("stat alt satırı anlatıma dayanmıyor");
        f.sub = sub;
      }
      if (TRENDS.includes(p.trend)) f.trend = p.trend;
      break;
    }
    default:
      return bad(`bilinmeyen infografik ${device}`);
  }
  if (title && !["icons", "stat"].includes(device)) {
    // Başlık editoryaldir; ama içinde sayı varsa o sayı da söylenmiş olmalı.
    if (/\d/.test(title) && !digitsOk(title)) return bad(`başlıktaki sayı anlatımda geçmiyor: "${title}"`);
    f.title = title;
  }
  return { fields: f };
}

/* ================================================================ kurallar (video geneli) */

/** Videonun cihaz tavanı: 12 dk'da 20, kısa videoda orantılı. */
export function deviceBudget(totalSec) {
  return Math.max(3, Math.min(MAX_DEVICES, Math.round(totalSec / 36)));
}

/**
 * Önerileri öncelik sırasıyla kabul eder: aralık, art arda aynı tip ve tavan
 * kuralları; sonra referansları sahnelerin SON hâline göre yeniden doğrular.
 * @returns {{scenes, accepted:[{scene, device, reason}], rejected:[{scene, device, why}]}}
 */
export function applyPatches(script, patches, { minGap = MIN_GAP_SEC } = {}) {
  const ctx = makeCtx(script);
  const n = ctx.scenes.length;
  const budget = deviceBudget(ctx.total);
  const rejected = [];
  // Var olan cihazlar (değiştirilmeyecek sahnelerde) yerinde kalır.
  const existing = ctx.scenes.map((s, i) => ({ i, d: deviceOf(s) })).filter((x) => x.d);
  const cand = [];
  const seen = new Set();
  for (const p of patches || []) {
    const i = p?.scene;
    const why = (w) => rejected.push({ scene: i, device: p?.device, why: w });
    if (!isInt(i) || i < 0 || i >= n) { why("sahne numarası geçersiz"); continue; }
    if (seen.has(i)) { why("aynı sahneye ikinci öneri"); continue; }
    const s = ctx.scenes[i];
    if (i === 0) { why("soğuk açılışa dokunulmaz"); continue; }
    if (deviceOf(s)) { why("sahne zaten bir cihaz"); continue; }
    if (p.device !== "annotate" && !CONVERTIBLE.has(s.type)) { why(`${s.type} sahnesi çevrilmez`); continue; }
    if (p.device !== "annotate" && (s.name || s.role)) { why("isim kartı taşıyan sahne çevrilmez"); continue; }
    if (s.outro) { why("kapanış sahnesi"); continue; }
    const built = buildDevice(p, i, ctx);
    if (built.error) { why(built.error); continue; }
    seen.add(i);
    cand.push({ i, p, built, prio: isInt(p.priority) ? p.priority : 2 });
  }
  cand.sort((a, b) => a.prio - b.prio || a.i - b.i);

  let accepted = [];
  const fits = (c, list) => {
    const all = [...existing, ...list.map((x) => ({ i: x.i, d: x.p.device }))].sort((a, b) => a.i - b.i);
    if (all.length + 1 > budget) return "cihaz tavanı doldu";
    const t = ctx.starts[c.i];
    for (const o of all) if (Math.abs(ctx.starts[o.i] - t) < minGap) return `başka bir cihaza ${Math.round(Math.abs(ctx.starts[o.i] - t))} sn yakın`;
    const prev = [...all].reverse().find((o) => o.i < c.i);
    const next = all.find((o) => o.i > c.i);
    if (prev?.d === c.p.device || next?.d === c.p.device) return "aynı cihaz art arda";
    return null;
  };
  for (const c of cand) {
    const no = fits(c, accepted);
    if (no) rejected.push({ scene: c.i, device: c.p.device, why: no });
    else accepted.push(c);
  }
  // Referanslar son hâle göre: öncesi başka bir cihaza çevrildiyse resmi kalmamış olabilir.
  for (let guard = 0; guard < 50; guard++) {
    const byI = new Map(accepted.map((c) => [c.i, c.built.scene]));
    const final = (k) => byI.get(k) || ctx.scenes[k];
    const dropped = accepted.filter((c) => buildDevice(c.p, c.i, ctx, final).error);
    // Art arda aynı tip, düşürmelerden sonra da korunur.
    const order = [...existing.map((x) => ({ ...x, own: false })), ...accepted.filter((c) => !dropped.includes(c)).map((c) => ({ i: c.i, d: c.p.device, own: c }))].sort((a, b) => a.i - b.i);
    for (let k = 1; k < order.length; k++) if (order[k].d === order[k - 1].d && order[k].own && !dropped.includes(order[k].own)) dropped.push(order[k].own);
    if (!dropped.length) break;
    for (const c of dropped) rejected.push({ scene: c.i, device: c.p.device, why: buildDevice(c.p, c.i, ctx, final).error || "aynı cihaz art arda" });
    accepted = accepted.filter((c) => !dropped.includes(c));
  }
  const scenes = ctx.scenes.map((s) => s);
  for (const c of accepted) scenes[c.i] = c.built.scene;
  return {
    scenes,
    accepted: accepted.sort((a, b) => a.i - b.i).map((c) => ({ scene: c.i, from: ctx.scenes[c.i].type, device: c.p.device, reason: str(c.p.reason, 200), at: +ctx.starts[c.i].toFixed(1) })),
    rejected,
    budget,
  };
}

/* ================================================================ senaryodaki cihazlar */

/** Cihaz sahnesinin kendi alanlarını yama biçimine çevirir (doğrulayıcı aynı olsun). */
function patchOf(s) {
  const d = deviceOf(s);
  if (d === "annotate") return { device: "annotate", ...s.annotate };
  const p = { device: d };
  for (const k of ["paper", "headline", "date", "sub", "translation", "region", "places", "points", "route", "line", "focus", "title", "items", "links", "doc", "highlight", "redact", "stamp", "events", "span", "left", "right", "mode", "quote", "who", "when", "fromScene",
    "unit", "sort", "slices", "centerLabel", "total", "filled", "icon", "a", "b", "nodes", "edges", "value", "label", "trend"]) if (s[k] !== undefined) p[k] = s[k];
  // İnfografiklerde highlight bir indekstir (yamada highlightIndex).
  if (INFO_TYPES.includes(d) && isInt(s.highlight)) { p.highlightIndex = s.highlight; delete p.highlight; }
  if (s.type === "document" && !s.doc) p.useImage = true;
  return p;
}

/** Geçersiz cihaz sahnesinin güvenli karşılığı: resmi varsa fotoğraf, yoksa önceki karenin üstünde yazı. */
function fallbackScene(s) {
  const out = { ...s };
  for (const k of TYPE_FIELDS) delete out[k];
  delete out.annotate;
  if (s.imagePrompt || s.search || s.image) return { ...out, type: "photo" };
  const text = stripTags(s.say).split(/\s+/).slice(-8).join(" ");
  return { ...out, type: "words", text, bg: "prev" };
}

/**
 * Senaryonun KENDİ cihazlarını (Claude yazarı ya da elle yazılmış hazır senaryo)
 * aynı kurallarla denetler: yazar harita için lat/lon verir (burada karedeki x/y'ye
 * çevrilir), alıntı `say`'de geçmeli, fromScene önceki doğru sahneyi göstermeli.
 * Geçersiz cihaz fotoğrafa/yazıya döner; ücretsiz ve belirleyici.
 * Hazır senaryonun var olan headline/map sahnelerine (points ile) dokunulmaz.
 */
export function sanitizeDevices(script, { logFn = () => {} } = {}) {
  if (!script?.scenes?.length) return { script, fixed: [] };
  const ctx = makeCtx(script);
  const scenes = [...ctx.scenes];
  const fixed = [];
  const final = (k) => scenes[k];
  scenes.forEach((s, i) => {
    const d = deviceOf(s);
    if (!d) return;
    // Elle yerleştirilmiş klasik cihazlar (koordinatlı harita, manşet) olduğu gibi kalır.
    if (d === "map" && Array.isArray(s.points) && !s.places && s.points.every((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y))) return;
    if (d === "headline" && s.paper && s.headline) return;
    if (d === "annotate" && Number.isFinite(s.annotate?.x) && Number.isFinite(s.annotate?.y) && s.annotate?.label) return;
    const b = buildDevice({ ...patchOf(s), _trusted: false }, i, ctx, final);
    if (b.error) {
      scenes[i] = d === "annotate" ? (({ annotate, ...rest }) => rest)(s) : fallbackScene(s);
      fixed.push({ scene: i, device: d, why: b.error });
    } else {
      // Bölüm kartı ya da süre alanları yama ile değişmez; kurulan sahne yalnızca cihaz alanlarını düzeltir.
      scenes[i] = d === "annotate" ? b.scene : { ...b.scene };
    }
  });
  for (const f of fixed) logFn(`Senaryodaki ${f.device} cihazı geçersiz (sahne ${f.scene + 1}: ${f.why}) — sahne sade görsele döndü`);
  return { script: fixed.length || scenes.some((x, i) => x !== ctx.scenes[i]) ? { ...script, scenes } : script, fixed };
}

/* ================================================================ LLM planı */

const PLACE = {
  type: "object",
  properties: { label: { type: "string" }, lat: { type: "number" }, lon: { type: "number" } },
  required: ["label", "lat", "lon"],
  additionalProperties: false,
};
const INFO_PAIR = {
  type: "object",
  properties: { label: { type: "string" }, value: { type: "number" } },
  required: ["label", "value"],
  additionalProperties: false,
};
const REF = {
  type: "object",
  properties: { fromScene: { type: "integer" }, label: { type: "string" } },
  required: ["label"],
  additionalProperties: false,
};
export const PLAN_SCHEMA = {
  type: "object",
  properties: {
    patches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "integer", description: "Sahne numarası (listede # ile)" },
          device: { type: "string", enum: DEVICES },
          priority: { type: "integer", description: "1 = hikâye için şart, 2 = güçlü, 3 = iyi olur" },
          reason: { type: "string", description: "Bir cümle: bu an neden bu cihazı hak ediyor" },
          paper: { type: "string" }, headline: { type: "string" }, date: { type: "string" }, sub: { type: "string" }, translation: { type: "string" },
          region: { type: "string", enum: GEO_REGIONS },
          places: { type: "array", items: PLACE, description: "map: gerçek enlem/boylam" },
          route: { type: "array", items: { type: "integer" } },
          line: { type: "string", enum: ["route", "barrier"] },
          focus: { type: "integer" },
          title: { type: "string" },
          items: {
            type: "array",
            description: "board: {fromScene?, label, note?} · bars: {label, value, color?}",
            items: { type: "object", properties: { fromScene: { type: "integer" }, label: { type: "string" }, note: { type: "string" }, value: { type: "number" }, color: { type: "string" } }, required: ["label"], additionalProperties: false },
          },
          unit: { type: "string", description: "bars/scale: birim — '$', '€', '₺', '%', ' people', ' kişi'" },
          sort: { type: "boolean", description: "bars: büyükten küçüğe sırala" },
          highlightIndex: { type: "integer", description: "bars/donut: vurgulanan öğe/dilim indeksi (0'dan)" },
          slices: { type: "array", items: INFO_PAIR, description: "donut: {label, value}" },
          centerLabel: { type: "string", description: "donut: halkanın ortasındaki kısa yazı (anlatımdan)" },
          total: { type: "integer", description: "icons: toplam simge (2-100)" },
          filled: { type: "integer", description: "icons: yanan simge (1..total)" },
          icon: { type: "string", enum: INFO_ICONS },
          a: INFO_PAIR, b: INFO_PAIR,
          nodes: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" } }, required: ["id", "label"], additionalProperties: false } },
          edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "flow: [from id, to id, label?]" },
          value: { type: "string", description: "stat: söylendiği gibi büyük sayı — \"$5,800\", \"38%\", \"1 in 3\"" },
          trend: { type: "string", enum: TRENDS },
          links: { type: "array", items: { type: "array", items: { type: "integer" } } },
          doc: {
            type: "object",
            properties: { kind: { type: "string", enum: DOC_KINDS }, heading: { type: "string" }, lines: { type: "array", items: { type: "string" } } },
            required: ["kind", "lines"],
            additionalProperties: false,
          },
          useImage: { type: "boolean", description: "document: sahnenin kendi arşiv taraması belgeyi gösteriyor" },
          highlight: { type: "string" }, redact: { type: "array", items: { type: "string" } }, stamp: { type: "string" },
          events: {
            type: "array",
            items: { type: "object", properties: { year: { type: "integer" }, label: { type: "string" } }, required: ["year", "label"], additionalProperties: false },
          },
          left: REF, right: REF,
          mode: { type: "string", enum: SPLIT_MODES },
          quote: { type: "string" }, who: { type: "string" }, when: { type: "string" },
          fromScene: { type: "integer" },
          label: { type: "string", description: "annotate: kısa işaret etiketi (video dilinde) · icons/stat: sayının neyi saydığı" },
          target: { type: "string", description: "annotate: fotoğrafta işaretlenecek şey, İNGİLİZCE ('the man in the dark suit at left')" },
          atWord: { type: "string", description: "annotate: işaretin belireceği, say'deki kelime" },
          arrow: { type: "boolean" },
        },
        required: ["scene", "device", "priority", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["patches"],
  additionalProperties: false,
};

/** Modelin gördüğü sahne listesi: bir satır = bir sahne. */
export function sceneListing(script) {
  const { starts } = sceneTimes(script);
  const searches = new Map();
  for (const s of script.scenes) if (s.search) searches.set(s.search, (searches.get(s.search) || 0) + 1);
  return script.scenes.map((s, i) => {
    const d = deviceOf(s);
    const src = s.bg === "prev" ? "önceki-kare" : s.source === "archive" || s.source === "stock" ? `${s.source}${s.media === "video" ? "-klip" : ""}` : s.imagePrompt ? "AI" : "-";
    const flags = [];
    if (d) flags.push(`CİHAZ:${d}`);
    if (s.name) flags.push(`isim:${s.name}`);
    if (s.search && searches.get(s.search) > 1) flags.push("tekrar-sorgu");
    // Bir veri anı: yıl olmayan bir sayı söyleniyor (infografik adayı).
    if (!d && numbersIn(s.say, langOfScript(script)).some((v) => v >= 10 && !(Number.isInteger(v) && v >= 1100 && v <= 2100))) flags.push("sayı");
    if (i === 0 || !(CONVERTIBLE.has(s.type) || s.type === "photo") || s.outro) flags.push("dokunma");
    const what = s.type === "counter" ? ` ${s.prefix || ""}${s.to}${s.suffix || ""} ${s.label || ""}` : s.type === "headline" ? ` "${s.headline}"` : s.type === "map" ? ` ${s.region}` : "";
    return `#${i} [b${(s.chapter ?? 0) + 1} ${clock(starts[i])}] ${s.type}${what} · ${src}${s.search ? ` "${s.search}"` : ""}${flags.length ? ` {${flags.join(", ")}}` : ""} | ${stripTags(s.say)}`;
  }).join("\n");
}

function planPrompt(script) {
  const { total } = sceneTimes(script);
  const budget = deviceBudget(total);
  const existing = script.scenes.filter((s) => deviceOf(s)).length;
  const system = [
    "Sen MagnatesMedia, LEMMiNO ve Netflix belgesellerinde çalışmış üst düzey bir KURGU YÖNETMENİSİN.",
    "Bir belgeselin sahne listesini okuyup her anın hangi kurgu cihazını HAK ETTİĞİNE karar veriyorsun. Cihaz süs değildir: izleyicinin hikâyeyi daha iyi anlamasını sağlamayan cihaz koyma.",
    "",
    "CİHAZLAR:",
    "- board: dedektif panosu — şüpheliler/kişiler/ipuçları birbirine bağlanır. items[{fromScene?, label, note?}], links[[a,b]] (öğe indeksleri). Şüpheliler, olası açıklamalar, bir ağ anlatılırken.",
    "- split: iki şey karşı karşıya ya da önce/sonra. left/right{fromScene?, label}, mode versus|before-after.",
    "- document: kilit belge/ifade/telgraf/rapor ekranda. doc{kind: fbi-teletype|letter|report|telegram|ledger, heading?, lines[]} — satırlar anlatımdaki olgulardan, belge diliyle kısa; highlight = satırlardan birinde AYNEN geçen ifade; redact = karartılacak ifadeler (satırlarda aynen); stamp kısa damga. Sahnenin kendi arşiv sorgusu gerçek bir belge taramasıysa doc yerine useImage:true.",
    "- timeline: yıllara yayılan olaylar. events[{year, label}] 3-7 olay; yıllar senaryoda GEÇMELİ.",
    "- quote: gerçek bir alıntı kartı. quote = sahnenin say satırında AYNEN geçen sözler (kelimesi kelimesine, aynı sırayla), who = söyleyen (senaryoda geçen kişi), when? kısa. Anlatımda alıntı yoksa quote KOYMA; alıntı uydurma.",
    "- annotate: arşiv fotoğrafında 'bu adam / bu ayrıntı' anı — yalnızca archive/stock kaynaklı photo sahnesinde. label kısa etiket (anlatımda geçen), target İngilizce işaretlenecek şey, atWord işaretin belireceği kelime.",
    `- map: yer/rota. region yalnızca: ${GEO_REGIONS.join(", ")} — hikâyenin yeri bu bölgelerin içindeyse. places[{label, lat, lon}] gerçek koordinatlar, route nokta indeksleri, focus.`,
    "- headline: basın tepkisi — gazete manşeti. paper, headline (gazetenin dilinde, 2-8 kelime), date, translation (video dilinde). Yalnızca anlatım basından/manşetten söz ediyorsa ya da manşet anlatılan olayı birebir veriyorsa.",
    "",
    "İNFOGRAFİKLER (veri anları — anlatım SAYI söylüyorsa; {sayı} işaretli sahneler adaydır). Her sayı ve etiket o sahnenin ya da komşusunun say satırında GEÇMELİ (rakamla ya da yazıyla); sayı UYDURMA, yuvarlama, hesaplama yok — kod doğrular, uymayanı atar:",
    "- bars: iki-sekiz şeyin aynı ölçüdeki karşılaştırması (\"fidye 200.000, bulunan 5.800, ödül 25.000\"). items[{label, value}] (value SAYI), unit ('$', '%', ' people' …), highlightIndex = hikâyenin asıl vurguladığı öğe, sort:true sıralı liste için, title? kısa.",
    "- donut: bir bütünün payları (\"2.223 kişiden 1.517'si öldü, 706'sı kurtuldu\", \"yüzde 62 / 38\"). slices[{label, value}] 2-6; yalnızca bir dilim söylenmemiş 'geri kalanı' olabilir (100'den ya da söylenen toplamdan). highlightIndex, centerLabel? (anlatımdan kısa: \"1,517 lost\").",
    `- icons: \"10'da 9\", \"her 3 kişiden 1'i\" oranı — total (2-100) simgeden filled tanesi yanar. icon: ${INFO_ICONS.join("|")} (kimi/neyi saydığına en yakın), label = yanan simgelerin ne olduğu (\"passengers never came home\"). total ve filled anlatımda geçmeli (ya da \"yüzde 90\" → 10'da 9).`,
    "- scale: iki MİKTARIN büyüklük farkı (en az 1,5 kat; \"$5,800 bulundu, fidye $200,000\"). a{label, value}, b{label, value}, unit, title?. Küçükten büyüğe yakınlaşan çekim; fark ne kadar büyükse o kadar etkili.",
    "- flow: süreç / para izi / olay zinciri / ağ (\"banka → Cooper → nehir\"). nodes[{id, label}] 3-7 (etiketler anlatımdan, kısa), edges[[from, to, label?]] 2-10 (ok etiketi kısa: \"$200,000\", \"wired\"), title?.",
    "- stat: TEK büyük sayı + bağlamı (\"$5,800\", \"38%\", \"1 in 3\"). value = söylendiği gibi (rakamla yaz, dil biçimiyle), label = neyi ifade ettiği, sub? tek satır bağlam (anlatımdan), trend up|down yalnızca anlatım artış/düşüş diyorsa.",
    "Seçim: iki+ değer kıyaslanıyorsa bars (büyüklük farkı çarpıcıysa scale), pay/oran söyleniyorsa donut ya da icons (\"X'te Y\" → icons), adım adım akış → flow, tek çarpıcı sayı → stat. Var olan counter/chart sahnelerine dokunma; infografikler de cihaz sayılır (aralık ve tavan kuralları geçerli).",
    "",
    "KURALLAR:",
    "- Anlatım (say), sahne sırası, sayısı ve süresi DEĞİŞMEZ. Yalnızca {dokunma} işareti OLMAYAN sahnelerin görselini cihaza çevirirsin; anlatımı o cihaza gerçekten uyan sahneyi seç.",
    `- Aralık: iki cihaz arasında en az 35-45 sn. Aynı cihaz tipi art arda iki kez gelmez. Toplam cihaz (var olan ${existing} dahil) en fazla ${budget}.`,
    "- Tercih: şu an AI görseline düşen ya da aynı resmi tekrar eden (önceki-kare, tekrar-sorgu) anlar; bilgi yoğun anlar (tarih dizisi, iki kişi, belge, rota).",
    "- Olgular YALNIZCA senaryodan: senaryoda olmayan isim, tarih, yer, alıntı, belge metni yazma.",
    "- fromScene: yalnızca ÖNCEKİ bir sahne, ve o kişiyi/yeri gerçekten gösteren sahne (numarası listede). Emin değilsen fromScene verme, yalnızca label yaz.",
    "- Etiketler ve kısa metinler video dilinde; target İngilizce.",
    `- En fazla ${Math.min(30, budget + 8)} öneri; priority ile sırala (1 en önemli). Kod her öneriyi doğrular, kurala uymayanı atar.`,
  ].join("\n");
  const user = [
    `Belgesel: "${script.title || ""}" · stil: ${script.genre || "documentary"} · dil: ${langOfScript(script) === "en" ? "English" : "Türkçe"}${script.era ? ` · dönem: ${script.era}` : ""}`,
    `Bölümler: ${(script.chapters || []).map((c, i) => `${i + 1}. ${typeof c === "string" ? c : c?.title}`).join(" · ")}`,
    `Tahmini süre: ${clock(sceneTimes(script).total)}`,
    "",
    "SAHNELER (#numara [bölüm dakika] tip · görsel kaynağı \"arşiv sorgusu\" {işaretler} | anlatım):",
    sceneListing(script),
    "",
    "Hangi anlar hangi cihazı hak ediyor? Yalnızca öneri listesini döndür.",
  ].join("\n");
  return { system, user };
}

/** Senaryonun özeti: aynı senaryo için plan bir kez ödenir. */
export function scriptKey(script, model = DIRECTOR_MODEL) {
  const scenes = (script.scenes || []).map((s) => {
    const { voice, voiceDur, wordTimes, image, imgW, imgH, video, videoStart, videoDur, videoW, videoH, archived, layers, heldBg, ...rest } = s;
    return rest;
  });
  return crypto.createHash("sha1").update(JSON.stringify([DIRECTOR_VERSION, model, script.genre, script.era || "", script.chapters || [], script.locale || "", scenes])).digest("hex");
}

const noCredit = (e) => /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(String(e?.message || e));

/**
 * KURGU YÖNETMENİ. Yeni bir senaryo ve değişiklik listesi döndürür; girdiyi değiştirmez.
 * @param opts.cacheFile  plan önbelleği (iş klasöründe) — aynı senaryo için yeniden ödenmez
 * @param opts.llm        test için callJSON yerine
 * @returns {{script, changes, rejected, skipped?: string, cached?: boolean}}
 */
export async function directEdit(script, { settings = {}, usage, logFn = () => {}, model, cacheFile = null, llm = callJSON, isCancelled = () => false } = {}) {
  const base = sanitizeDevices(script, { logFn }).script;
  const mdl = model || settings.docuDirectorModel || DIRECTOR_MODEL;
  const key = scriptKey(script, mdl);
  const cached = cacheFile ? readJson(cacheFile, null) : null;
  let patches = null;
  let fromCache = false;
  if (cached?.key === key && Array.isArray(cached.patches)) {
    patches = cached.patches;
    fromCache = true;
  } else {
    if (!settings.anthropicKey && llm === callJSON) {
      logFn("Kurgu yönetmeni atlandı: Anthropic anahtarı yok (senaryo kendi cihazlarıyla devam ediyor)");
      return { script: base, changes: [], rejected: [], skipped: "no-key" };
    }
    const { system, user } = planPrompt(base);
    try {
      const res = await llm({ system, user, schema: PLAN_SCHEMA, maxTokens: 16000, usage, logFn, model: mdl, isCancelled });
      patches = Array.isArray(res?.patches) ? res.patches : [];
    } catch (e) {
      if (e?.message === "cancelled" || isCancelled()) throw e;
      logFn(`Kurgu yönetmeni atlandı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 160)}) — video yönetmen önerileri olmadan sürüyor`);
      return { script: base, changes: [], rejected: [], skipped: noCredit(e) ? "no-credit" : "error" };
    }
    if (cacheFile) writeJson(cacheFile, { key, version: DIRECTOR_VERSION, model: mdl, savedAt: new Date().toISOString(), patches });
  }
  const r = applyPatches(base, patches);
  const out = { ...base, scenes: r.scenes };
  const counts = {};
  for (const c of r.accepted) counts[c.device] = (counts[c.device] || 0) + 1;
  const total = out.scenes.filter((s) => deviceOf(s)).length;
  logFn(`Kurgu yönetmeni${fromCache ? " (kayıttan)" : ""}: ${patches.length} öneri, ${r.accepted.length} kabul${r.accepted.length ? ` (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")})` : ""}, ${r.rejected.length} ret · videoda toplam ${total} cihaz (tavan ${r.budget})`);
  for (const c of r.accepted) logFn(`  + sahne ${c.scene + 1} [${clock(c.at)}] ${c.from} → ${c.device}${c.reason ? `: ${c.reason}` : ""}`);
  const why = {};
  for (const x of r.rejected) why[x.why] = (why[x.why] || 0) + 1;
  if (r.rejected.length) logFn(`  Reddedilenler: ${Object.entries(why).slice(0, 6).map(([k, v]) => `${v}× ${k}`).join("; ")}`);
  return { script: out, changes: r.accepted, rejected: r.rejected, cached: fromCache };
}

/* ================================================================ annotate yerleşimi (arşivden sonra) */

const ANNOTATE_SCHEMA = {
  type: "object",
  properties: {
    marks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "Görsel numarası" },
          found: { type: "boolean" },
          x: { type: "number", description: "Hedefin merkezi, 0..1 soldan sağa" },
          y: { type: "number", description: "Hedefin merkezi, 0..1 yukarıdan aşağıya" },
          r: { type: "number", description: "Hedefi saran çemberin yarıçapı, görsel genişliğinin oranı (0.03-0.4)" },
        },
        required: ["n", "found", "x", "y", "r"],
        additionalProperties: false,
      },
    },
  },
  required: ["marks"],
  additionalProperties: false,
};

/**
 * Yönetmenin (ya da yazarın) koyduğu `annotate {label, target}` işaretlerini seçilen
 * gerçek fotoğrafta bulur: x, y (0..1, fotoğrafın kendi çerçevesinde — `focus` gibi)
 * ve r (fotoğraf genişliğinin oranı). Önbellekli. Fotoğrafsız/AI/klip sahnesinde,
 * bulunamazsa ya da çağrı başarısızsa işaret kaldırılır.
 * @returns {{script, placed, dropped}}
 */
export async function placeAnnotations(script, { publicDir, cacheFile = null, settings = {}, usage, logFn = () => {}, llm = callVisionJSON, model, ffmpeg, isCancelled = () => false } = {}) {
  const scenes = script.scenes.map((s) => s);
  const todo = [];
  let dropped = 0;
  scenes.forEach((s, i) => {
    const a = s.annotate;
    if (!a) return;
    if (Number.isFinite(a.x) && Number.isFinite(a.y)) { if (a.target) { const { target, ...rest } = a; scenes[i] = { ...s, annotate: rest }; } return; }
    const file = s.image && publicDir ? path.join(publicDir, s.image) : null;
    if (!s.archived || s.video || !file || !fs.existsSync(file) || !a.target) {
      const { annotate, ...rest } = s;
      scenes[i] = rest;
      dropped++;
      return;
    }
    todo.push({ i, file, key: `${s.image}|${a.target}|${a.label}` });
  });
  if (!todo.length) {
    if (dropped) logFn(`${dropped} işaret kaldırıldı (sahnede gerçek fotoğraf yok)`);
    return { script: dropped ? { ...script, scenes } : script, placed: 0, dropped };
  }
  const cache = (cacheFile && readJson(cacheFile, {})) || {};
  const ask = todo.filter((t) => !cache[t.key]);
  if (ask.length) {
    const canCall = llm !== callVisionJSON || settings.anthropicKey;
    if (!canCall) logFn("İşaretler yerleştirilemedi: Anthropic anahtarı yok");
    else {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-annotate-"));
      try {
        for (let k = 0; k < ask.length; k += 6) {
          if (isCancelled()) throw new Error("cancelled");
          const part = ask.slice(k, k + 6);
          const images = [];
          for (const [j, t] of part.entries()) {
            let data;
            try {
              const small = path.join(tmp, `a${k + j}.jpg`);
              await run(ffmpeg || settings.ffmpegPath || "ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", t.file, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "3", small], { timeoutMs: 60000 });
              data = fs.readFileSync(small).toString("base64");
            } catch { data = null; }
            if (data) images.push({ etiket: `Görsel ${j + 1}: işaretlenecek → ${scenes[t.i].annotate.target} (etiket: "${scenes[t.i].annotate.label}")`, data, mediaType: "image/jpeg" });
            else images.push(null);
          }
          const ok = images.filter(Boolean);
          if (!ok.length) continue;
          try {
            const res = await llm({
              system: "Sen titiz bir belgesel görsel editörüsün. Yalnızca istenen JSON'u döndür.",
              user: [
                "Her görselde etiketinde yazan şeyi bul. Birden çok aday varsa en belirgin olanı seç.",
                "x, y: hedefin merkezi (0..1, görselin kendi çerçevesinde). r: hedefi saran çemberin yarıçapı, görsel genişliğinin oranı.",
                "Hedef görselde açıkça yoksa ya da emin değilsen found=false döndür (x=y=r=0) — yanlış yeri işaretlemek hiç işaretlememekten KÖTÜDÜR.",
                `Görsel numaraları: ${images.map((im, j) => (im ? j + 1 : null)).filter(Boolean).join(", ")}.`,
              ].join("\n"),
              schema: ANNOTATE_SCHEMA,
              images: ok,
              model: model || settings.docuAnnotateModel || ANNOTATE_MODEL,
              maxTokens: 3000,
              usage,
              logFn,
              isCancelled,
            });
            for (const m of res?.marks || []) {
              const t = part[m.n - 1];
              if (!t || !images[m.n - 1]) continue;
              const good = m.found && m.x > 0 && m.x < 1 && m.y > 0 && m.y < 1 && m.r > 0;
              cache[t.key] = good ? { x: +m.x.toFixed(3), y: +m.y.toFixed(3), r: +Math.max(0.03, Math.min(0.4, m.r)).toFixed(3) } : { none: true };
            }
            // Gösterilip yanıtta hiç anılmayan görsel de bir karardır ("bulunamadı"): kaydedilmezse
            // her çalıştırmada (devam, yeniden render) aynı görsel yeniden ödenirdi.
            part.forEach((t, j) => { if (images[j] && !cache[t.key]) cache[t.key] = { none: true }; });
            if (cacheFile) writeJson(cacheFile, cache);
          } catch (e) {
            if (e?.message === "cancelled" || isCancelled()) throw e;
            logFn(`İşaret yerleştirme atlandı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 140)})`);
            break;
          }
        }
      } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      }
    }
  }
  let placed = 0;
  for (const t of todo) {
    const s = scenes[t.i];
    const c = cache[t.key];
    const { target, ...a } = s.annotate;
    if (c && !c.none) {
      scenes[t.i] = { ...s, annotate: { ...a, x: c.x, y: c.y, r: c.r }, ...(s.focus ? {} : { focus: [c.x, c.y] }) };
      placed++;
    } else {
      const { annotate, ...rest } = s;
      scenes[t.i] = rest;
      dropped++;
    }
  }
  logFn(`İşaretler: ${placed} yerleştirildi${dropped ? `, ${dropped} kaldırıldı (hedef bulunamadı ya da gerçek fotoğraf yok)` : ""}`);
  return { script: { ...script, scenes }, placed, dropped };
}

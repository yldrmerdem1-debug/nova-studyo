// YOUTUBE PAKETİ (belgesel): 3 kapak + 5 başlık — render ve kalite denetiminden SONRA.
//
// Hedef, üst düzey İngilizce belgesel kanallarının (MagnatesMedia, LEMMiNO, Johnny
// Harris, ColdFusion, Wendover) tıklanma dili: tek güçlü odak (yüz ya da ikonik nesne),
// sert kontrast, başlığı TEKRARLAMAYAN ve merak EKLEYEN en çok 4 büyük kelime, net bir
// duygu, telefonda (320x180) okunur yazı; kanal kimliği (videonun görünüm varyantı) sabit,
// her kapak farklı.
//
// Akış:
//   1. adaylar     videonun KENDİ görselleri (engine props / engine-script sahneleri,
//                  künye): gerçek arşiv > AI kare > stok; yüz/nesne ipuçları, çözünürlük
//   2. görme       Sonnet 5.5, TEK çağrı: ~12 aday küçük boyutta → kapak potansiyeli,
//                  özne kutusu, işaretlenecek ayrıntı, duygu
//   3. plan        Opus 5.5, TEK çağrı (yapılandırılmış JSON): 5 başlık + 3 kapak
//                  (görsel, şablon, 2-4 kelime, vurgu, renk rolü, kırpma)
//   4. çizim       docu-engine `thumbnail` kompozisyonu (renderStill, 1280x720, tek tek)
//   5. okunurluk   320x180 küçültme + Sonnet 5.5 TEK çağrı; geçemeyen kapak belirleyici
//                  düzeltmeyle (büyük yazı, koyu zemin, az kelime) yeniden çizilir
//   6. çıktı       thumbnails/thumb-1..3.jpg (+ -small), titles.json, package.md;
//                  arayüz için thumb_a..c.jpg ve (kullanıcı seçmediyse) thumbnail.jpg
//
// Her model çağrısı temiz düşer: anahtar/kredi yoksa ya da hata olursa belirleyici
// yedek (en iyi gerçek fotoğraf + seo.json başlığı, tek kapak). Plan iş klasörüne
// kaydedilir (docu-package.json): aynı video için yeniden ödeme yapılmaz.
import { unpaidTitleWords, storyAnchor, titleAnchorErrors, thumbNames, thumbNamesStory } from "./docu-lint.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { callJSON, callVisionJSON } from "../llm.js";
import { ownDataLines } from "./growth-lessons.js";
import { newsTitleErrors } from "./trend-radar.js";
import { autoFullThumbs, fullThumbFiles, fullThumbPrompt, sceneCandidates, sceneFiles, writeFullInbox } from "./thumb-scenes.js";
import { openAIImagesProvider } from "./openai-images.js";
import { readJson, writeJson, run, DATA_DIR, ROOT } from "../util.js";

export const PACKAGE_VERSION = "docu-package-2";
export const PLAN_MODEL = "claude-opus-5-5";
export const VISION_MODEL = "claude-sonnet-5-5";
export const LAYOUTS = ["hero", "split", "circle", "number", "document"];
export const GRADES = ["natural", "mono", "cold", "warm", "duo"];
export const ACCENT_ROLES = ["accent", "red", "label"];
export const TITLE_MAX = 60;
const MAX_CANDIDATES = 12;
const STOCK = new Set(["pixabay", "pexels", "unsplash", "mixkit", "coverr", "videvo"]);
/** Tahmini fiyat ($/M token) — yalnızca rapor için; fatura değildir. */
const PRICE = { "claude-opus-5-5": [4, 20], "claude-opus-5": [5, 25], "claude-sonnet-5-5": [2, 10], "claude-sonnet-5": [2, 10], "claude-haiku-4-5-20251001": [1, 5] };

const noCredit = (e) => /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(String(e?.message || e));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (x, d) => (Number.isFinite(+x) ? +x : d);
const stripTags = (s) => String(s ?? "").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

/* ================================================================ görsel boyutu */

/** JPEG/PNG/WebP başlığından piksel boyutu (dosyanın tamamını çözmeden). */
export function imageSize(file) {
  let buf;
  try {
    const fd = fs.openSync(file, "r");
    buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    buf = buf.subarray(0, n);
  } catch { return null; }
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length > 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/* ================================================================ 1. adaylar */

/** Sahnedeki (ve cihaz öğelerindeki) her resim yolu, bağlam metniyle. */
function imageRefs(node, depth = 0, out = []) {
  if (!node || typeof node !== "object" || depth > 4) return out;
  if (Array.isArray(node)) { for (const x of node) imageRefs(x, depth + 1, out); return out; }
  if (typeof node.image === "string" && /\.(jpe?g|png|webp)$/i.test(node.image) && !/\.lift\./i.test(node.image)) {
    out.push({ rel: node.image, ctx: [node.prompt, node.search, node.caption, node.label, node.title].filter((x) => typeof x === "string").join(" · ") });
  }
  for (const [k, v] of Object.entries(node)) if (k !== "image" && v && typeof v === "object") imageRefs(v, depth + 1, out);
  return out;
}

const FACE = /\b(portrait|face|faces|sketch|composite|mugshot|headshot|close-?up of (?:a|an|the|his|her) (?:man|woman|face)|man in|woman in|pilot|agent|suspect|hijacker|inventor|founder|ceo|king|queen|emperor|general|president)\b/i;
const ICONIC = /\b(money|bills|banknotes?|cash|ticket|note|letter|telegram|document|file|report|parachute|tie|evidence|map|weapon|gun|ring|crown|rocket|ship|wreck|plane|aircraft|jet|stair|airstair|skull|bottle|chip|coin|gold|diamond)\b/i;

/**
 * Videonun kendi görsellerinden kapak adayları (dosyası diskte olanlar).
 * @param script  motorun çizdiği senaryo (props) ya da engine-script
 * @param credits künye: {scene-N: {provider, eser, file, imgW, imgH}}
 * @returns [{rel, abs, kind, provider, source, scene, ctx, w, h, prescore}]
 */
export function collectCandidates({ script, credits = {}, publicDir }) {
  const byFile = new Map();
  for (const c of Object.values(credits || {})) if (c?.file) byFile.set(c.file, c);
  const scenes = Array.isArray(script?.scenes) ? script.scenes : [];
  const seen = new Map();
  scenes.forEach((s, i) => {
    if (!s || (s.type === "title" && s.chapterCard)) return;
    const sceneCtx = [stripTags(s.say), s.text, s.caption, s.title, s.kicker, s.search, s.imagePrompt].filter((x) => typeof x === "string" && x.trim()).join(" · ");
    for (const r of imageRefs(s)) {
      if (seen.has(r.rel)) continue;
      const abs = path.join(publicDir, r.rel);
      if (!fs.existsSync(abs)) continue;
      const base = path.basename(r.rel);
      const credit = byFile.get(r.rel) || byFile.get(r.rel.replace(/\.jpg$/i, ".mp4")) || null;
      const provider = String(credit?.provider || "").toLowerCase();
      let kind;
      if (/^img-/.test(base)) kind = "ai";
      else if (/^clip-/.test(base)) kind = provider && !STOCK.has(provider) ? "archive-clip" : "stock-clip";
      else kind = provider && STOCK.has(provider) ? "stock" : "archive";
      const size = imageSize(abs) || (credit?.imgW ? { w: credit.imgW, h: credit.imgH } : null) || (s.imgW && s.image === r.rel ? { w: s.imgW, h: s.imgH } : null);
      if (!size?.w || !size?.h) continue;
      seen.set(r.rel, {
        rel: r.rel, abs, kind, provider: provider || (kind === "ai" ? "ai" : ""),
        source: String(credit?.eser || "").slice(0, 90), scene: i,
        // The person a name card says this picture shows (the fallback must not sell someone else's face).
        ...(s.name && s.image === r.rel ? { person: String(s.name).slice(0, 60) } : {}),
        ctx: `${r.ctx ? `${r.ctx} · ` : ""}${sceneCtx}`.slice(0, 260),
        w: size.w, h: size.h,
      });
    }
  });
  const n = scenes.length || 1;
  const out = [...seen.values()];
  for (const c of out) c.prescore = prescore(c, n);
  return out.sort((a, b) => b.prescore - a.prescore);
}

/** Ücretsiz ön sıralama: gerçek arşiv, yüz/ikonik nesne ipucu, çözünürlük, açılış. */
export function prescore(c, sceneCount = 100) {
  const base = { archive: 6, ai: 4, "archive-clip": 3, stock: 2, "stock-clip": 1 }[c.kind] ?? 1;
  const text = `${c.source} ${c.ctx}`;
  let s = base;
  if (FACE.test(text)) s += 3;
  if (ICONIC.test(text)) s += 1.5;
  const short = Math.min(c.w, c.h);
  if (short < 360) s -= 4;
  else if (short < 560) s -= 1.2;
  else if (short >= 1000) s += 0.5;
  if (c.scene < sceneCount * 0.08) s += 0.8;
  return +s.toFixed(2);
}

/** Çeşitli ~12 aday: gerçek arşiv öncelikli; AI ≤ 4, stok ≤ 2, klip karesi ≤ 2. */
export function shortlist(cands, max = MAX_CANDIDATES) {
  const caps = { ai: 4, stock: 2, "stock-clip": 1, "archive-clip": 2 };
  const used = {};
  const out = [];
  for (const c of cands) {
    if (out.length >= max) break;
    const cap = caps[c.kind];
    if (cap !== undefined && (used[c.kind] || 0) >= cap) continue;
    used[c.kind] = (used[c.kind] || 0) + 1;
    out.push(c);
  }
  // Kotadan artan yer kalırsa en iyi kalanlar.
  for (const c of cands) { if (out.length >= max) break; if (!out.includes(c)) out.push(c); }
  return out.map((c, i) => ({ ...c, id: `c${i + 1}` }));
}

/*
 * KUSURLU RESİM KAPAĞA GİRMEZ. ÖLÇÜLEN KUSUR (20261024-950730, Kartal Yuvası): kalite denetimi sahne 87'deki Hitler
 * portresine "bozuk ve yapay görünüyor: gözlük, kırmızı noktalar ve plastik yüz dokusu" dedi (ai_look; çerçeve camındaki
 * yansıma). Paket qa.json'u hiç okumuyordu: aynı resim 2. kapak oldu, thumb_b.jpg'de ikinci, hayalet bir yüz var.
 * Yalnızca resmin kendisini suçlayan türler (docu-qa.js QA_KINDS) sayılır; yazı, kırpma ve tekrar videonun kurgusudur,
 * kapak kendi yazısını ve kırpmasını yapar.
 */
const PICTURE_FLAWS = new Set(["ai_look", "broken", "mismatch", "wrong_face", "anachronism"]);

/**
 * Denetim bulgularının gösterdiği resim dosyaları.
 * @param qa      {issues:[{scene, kind}]} — qa.json ya da ön izleme raporu (`scene`: engine-script indeksi, bölüm kartı yok)
 * @param scenes  engine-script sahneleri ya da props'un bölüm kartsız sahneleri (aynı indeks; null sahne atlanır)
 * @param o.except bu sahnelerin bulgusu sayılmaz (görseli rapordan sonra değişti)
 * @returns {Set<string>} public/ altındaki yollar (adayların `rel`i)
 */
export function qaFlaggedFiles(qa, scenes = [], { except = [] } = {}) {
  const out = new Set();
  for (const x of qa?.issues || []) {
    if (!PICTURE_FLAWS.has(x?.kind) || !Number.isInteger(x.scene) || except.includes(x.scene)) continue;
    const s = scenes[x.scene];
    for (const r of imageRefs(s)) out.add(r.rel);
    if (typeof s?.image === "string") out.add(s.image.replace(/\.lift(\.\w+)$/i, "$1"));
  }
  return out;
}

/**
 * Kapak adayları: kapak sahneleri + videonun kendi görselleri, render sonrası denetimin (qa.json) ve ön izlemenin son
 * turunun (docu-preview-fixes.json `last`) kusurlu bulduğu resimler çıkarılmış. Son turdan sonra değiştirilen sahneler
 * (`changed`) sayılmaz: o bulgu artık videoda olmayan bir resme ait. Hepsi kusurluysa süzülmemiş liste (paket kapaksız kalmaz).
 */
export function packageCandidates({ jobDir, script, engineScript = null, credits = {}, publicDir, logFn = () => {} }) {
  const all = [...sceneCandidates({ jobDir, publicDir, sizeOf: imageSize }), ...collectCandidates({ script, credits, publicDir })];
  // Denetimin gördüğü resim props'takidir (docu.js qaScriptOf: props sahnesi engine-script'in üstüne). Motorun ürettiği
  // AI resmi ve klibin durağan karesi yalnızca props'ta: iki görünüşe de bakılır. Ödünç/tutulan kare (heldBg, borrowed,
  // bg "prev") o sahnenin kendi resmi değildir, bulgusu komşunun resmini elemez.
  const mine = (s) => (s?.heldBg || s?.borrowed || s?.bg === "prev" ? null : s);
  const own = (script?.scenes || []).filter((s) => !(s?.type === "title" && s.chapterCard)).map(mine);
  const eng = (engineScript?.scenes || []).map(mine);
  const views = eng.length ? [eng, ...(own.length === eng.length ? [own] : [])] : [own];
  const flagged = new Set();
  const flag = (report, o) => { for (const scenes of views) for (const f of qaFlaggedFiles(report, scenes, o)) flagged.add(f); };
  flag(readJson(path.join(jobDir, "qa.json"), null));
  const pv = readJson(path.join(jobDir, "docu-preview-fixes.json"), null);
  flag(pv?.last, { except: Array.isArray(pv?.changed) ? pv.changed : [] });
  const clean = all.filter((c) => !flagged.has(c.rel));
  if (clean.length && clean.length < all.length) logFn(`Kapak adayları: kalite denetiminin kusurlu bulduğu ${all.length - clean.length} görsel çıkarıldı (${all.filter((c) => flagged.has(c.rel)).map((c) => path.basename(c.rel)).slice(0, 4).join(", ")})`);
  return clean.length ? clean : all;
}

/* ================================================================ 2. görme sıralaması */

const BOX = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" } }, required: ["x", "y", "w", "h"], additionalProperties: false };
const RANK_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "number", description: "0-10 thumbnail potential" },
          subject: { type: "string", enum: ["face", "object", "document", "place", "scene", "none"] },
          emotion: { type: "string" },
          box: BOX,
          hasDetail: { type: "boolean" },
          detail: BOX,
          description: { type: "string" },
          issues: { type: "array", items: { type: "string", enum: ["watermark", "text_overlay", "low_quality", "busy", "tiny_subject", "anachronism", "generic"] } },
        },
        required: ["id", "score", "subject", "emotion", "box", "hasDetail", "detail", "description", "issues"],
        additionalProperties: false,
      },
    },
  },
  required: ["candidates"],
  additionalProperties: false,
};

const normBox = (b, fallback = { x: 0.2, y: 0.1, w: 0.6, h: 0.8 }) => {
  if (!b || ![b.x, b.y, b.w, b.h].every((v) => Number.isFinite(+v))) return fallback;
  // Model bazen 0-100 ölçeğinde verir.
  const k = [b.x, b.y, b.w, b.h].some((v) => +v > 1.5) ? 100 : 1;
  const x = clamp(+b.x / k, 0, 0.98), y = clamp(+b.y / k, 0, 0.98);
  const w = clamp(+b.w / k, 0.02, 1 - x), h = clamp(+b.h / k, 0.02, 1 - y);
  return w * h < 0.0009 ? fallback : { x: +x.toFixed(3), y: +y.toFixed(3), w: +w.toFixed(3), h: +h.toFixed(3) };
};

async function smallCopy(ff, src, dest, w = 512) {
  await run(ff, ["-v", "error", "-y", "-i", src, "-vf", `scale='min(${w},iw)':-2:flags=lanczos`, "-frames:v", "1", "-q:v", "4", dest], { timeoutMs: 60000 });
  return dest;
}

async function visionRank(cands, { llm, model, usage, logFn, ff, tmp, isCancelled }) {
  const images = [];
  for (const c of cands) {
    const f = await smallCopy(ff, c.abs, path.join(tmp, `${c.id}.jpg`));
    images.push({ etiket: `${c.id} — ${c.kind === "ai" ? "AI still from the video" : c.kind.includes("clip") ? "frame of a film clip used in the video" : c.kind === "stock" ? "stock photo" : "real archive photo"}${c.source ? ` ("${c.source}")` : ""}`, data: fs.readFileSync(f).toString("base64"), mediaType: "image/jpeg" });
  }
  const res = await llm({
    system: "You are the thumbnail picture editor of a top documentary YouTube channel. Judge pictures only by what is visible. Return only the requested JSON.",
    user: [
      `These ${cands.length} pictures come from one documentary. Rate each one's potential as the HERO picture of a YouTube thumbnail (1280x720, seen at phone size 320x180).`,
      `A great hero: ONE strong focal subject — a face (eyes readable) or an iconic object — big, sharp, high contrast, a clear emotion, room for 2-4 big words beside it. Weak: busy scenes, tiny subjects, watermarks or baked-in text, blur, generic stock look.`,
      `For each id give: score 0-10; subject kind; the emotion it carries (one word); box = the main subject's bounding box normalised 0-1 (x,y = top-left corner, w,h = size) — for a face include the head and a little of the shoulders; hasDetail + detail = one small, specific region worth circling in red (a name on a ticket, a serial number, a stain) — if none, hasDetail false and detail = box; a short description (≤ 15 words); issues.`,
      `Context per picture:`,
      ...cands.map((c) => `${c.id}: ${c.ctx.slice(0, 180)}`),
    ].join("\n"),
    schema: RANK_SCHEMA,
    images,
    model,
    maxTokens: 6000,
    usage,
    logFn,
    isCancelled,
  });
  const by = new Map((res?.candidates || []).map((r) => [String(r.id), r]));
  return cands.map((c) => {
    const r = by.get(c.id);
    if (!r) return { ...c, vision: null };
    const box = normBox(r.box);
    return {
      ...c,
      vision: {
        score: clamp(num(r.score, 0), 0, 10), subject: r.subject, emotion: String(r.emotion || "").slice(0, 24),
        box, detail: r.hasDetail ? normBox(r.detail, box) : null, description: String(r.description || "").slice(0, 140),
        issues: Array.isArray(r.issues) ? r.issues.slice(0, 5) : [],
      },
    };
  });
}

/** Görme puanı + ön puan: sıralamanın son hâli. */
export function rankScore(c) {
  const v = c.vision;
  if (!v) return c.prescore;
  const pen = (v.issues || []).reduce((a, x) => a + ({ watermark: 3, text_overlay: 1.5, low_quality: 2, tiny_subject: 2, anachronism: 2, busy: 1, generic: 1 }[x] || 0), 0);
  const real = c.kind === "archive" || c.kind === "archive-clip" ? 1 : 0;
  return +(v.score * 1.5 + c.prescore * 0.35 + real - pen).toFixed(2);
}

/* ================================================================ 3. plan (Opus) */

const PLAN_SCHEMA = (ids) => ({
  type: "object",
  properties: {
    titles: {
      type: "array",
      items: { type: "object", properties: { text: { type: "string" }, angle: { type: "string" } }, required: ["text", "angle"], additionalProperties: false },
    },
    scenes: { type: "array", items: { type: "string" }, description: "One AI thumbnail scene per thumbnail, same order (English, 25-45 words each, the scene only — Nova adds the thumbnail's words)" },
    thumbnails: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hero: { type: "string", enum: ids },
          layout: { type: "string", enum: LAYOUTS },
          text: { type: "string" },
          highlight: { type: "integer" },
          tag: { type: "string" },
          number: { type: "string" },
          second: { type: "string", enum: ["", ...ids] },
          labels: { type: "array", items: { type: "string" } },
          accent: { type: "string", enum: ACCENT_ROLES },
          grade: { type: "string", enum: GRADES },
          side: { type: "string", enum: ["left", "right"] },
          zoom: { type: "number" },
          emotion: { type: "string" },
          titleIndex: { type: "integer" },
          why: { type: "string" },
        },
        required: ["hero", "layout", "text", "highlight", "tag", "number", "second", "labels", "accent", "grade", "side", "zoom", "emotion", "titleIndex", "why"],
        additionalProperties: false,
      },
    },
    recommended: { type: "integer" },
  },
  required: ["titles", "thumbnails", "recommended", "scenes"],
  additionalProperties: false,
});

const wordsOf = (s) => String(s ?? "").trim().split(/\s+/).filter(Boolean);
/**
 * Kapak yazısının kelimeleri ([kelime, modelin yazısındaki sırası]): tırnaklar ve tek başına duran işaretler ("/", "—")
 * düşer. İstemin örnekleri satırları " / " ile ayırıyor ('IRAN–USA WAR / WHY SAUDI?'); "/" kelime sayılınca 4 kelimelik
 * yazı 5 sayıldı, plan üç denemede reddedildi ve paket tek kapaklı yedeğe düştü (18 Ekim 2026, Hürmüz). Satırları
 * kapak çizici kendisi böler (fitLines), "/" ekrana basılmaz.
 */
const coverWords = (s) => wordsOf(String(s ?? "").replace(/["“”]/g, "")).map((w, i) => [w, i]).filter(([w]) => /[\p{L}\p{N}]/u.test(w));
const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "and", "or", "is", "was", "he", "she", "it", "his", "her", "who", "what", "why", "how", "did", "do", "that", "this", "for", "with", "at", "by", "from", "into"]);
const content = (s) => wordsOf(String(s).toLowerCase().replace(/[^\p{L}\p{N}\s$]/gu, " ")).filter((w) => !STOP.has(w));

/** BÜYÜK HARF başlık mı? (FBI, USA gibi kısaltmalar serbest) */
export function isAllCaps(t) {
  const ws = wordsOf(t).filter((w) => /\p{L}{3,}/u.test(w));
  if (ws.length < 2) return false;
  const caps = ws.filter((w) => w === w.toLocaleUpperCase("en-US") && w !== w.toLocaleLowerCase("en-US"));
  return caps.length / ws.length > 0.5;
}
const ACRONYMS = new Set(["FBI", "CIA", "KGB", "NSA", "USA", "US", "UK", "USSR", "EU", "UN", "NATO", "NASA", "DNA", "CEO", "AI", "UFO", "WWII", "WWI", "NYPD", "LAPD", "IRS", "SEC", "IPO", "TV", "D.B."]);
const titleCase = (t) => t.split(/(\s+)/).map((w) => {
  const core = w.replace(/[^\p{L}.]/gu, "");
  if (ACRONYMS.has(core) || ACRONYMS.has(core.replace(/\.$/, ""))) return w;
  return w.toLocaleLowerCase("en-US").replace(/(^|[:(\-"“])(\p{L})/u, (m, a, b) => a + b.toLocaleUpperCase("en-US"));
}).join("");

/** Opus çıktısının sert kuralları — ihlal modele onarım için geri gider. */
export function planErrors(plan, { ids, min = 3, scenes = null, anchor = null, news = false, cands = null }) {
  const e = [];
  const titles = Array.isArray(plan?.titles) ? plan.titles : [];
  if (titles.length < 5) e.push(`5 başlık gerekli (gelen ${titles.length})`);
  // 27 Ekim 2026 Lula: "Lula Wins Fourth Term: From 2.3M Behind to 4.4M Ahead" ilk gün 92 gösterim — sonuç özeti haber kanallarının araması.
  if (news) {
    const recaps = titles.filter((t) => newsTitleErrors(t?.text).length);
    if (recaps.length > 1) e.push(`haber başlıklarından en az 4'ü soru sormalı; sonuç özeti olanlar: ${recaps.map((t) => `"${t.text}"`).join(", ")} — ${newsTitleErrors(recaps[0].text)[0].split(": ").slice(1).join(": ")}`);
  }
  titles.forEach((t, i) => {
    const s = String(t?.text || "").trim();
    if ([...s].length > TITLE_MAX) e.push(`titles[${i}] ${[...s].length} karakter (≤ ${TITLE_MAX})`);
    if (isAllCaps(s)) e.push(`titles[${i}] BÜYÜK HARF olmamalı`);
    // 26 Ekim 2026 denizaltı videosu: "HMS Vanguard Was 'Probably a Container,' Said France" — konu belli değildi.
    for (const x of titleAnchorErrors(s, anchor)) e.push(`titles[${i}] ${x}`);
    // 20 Ekim 2026 derin inceleme: Built Beyond "…Calling It a Scam" — videoda dolandırıcılık yok. Başlığın iddiası anlatımda ödenmeli.
    if (scenes?.length) for (const w of unpaidTitleWords(s, scenes)) e.push(`titles[${i}] "${w}" videoda ödenmiyor (anlatımda geçmiyor): başlık videonun kanıtladığını söylesin`);
  });
  const th = Array.isArray(plan?.thumbnails) ? plan.thumbnails : [];
  if (th.length < min) e.push(`${min} kapak gerekli (gelen ${th.length})`);
  th.forEach((t, i) => {
    if (!ids.includes(t?.hero)) e.push(`thumbnails[${i}].hero geçersiz`);
    const n = coverWords(t?.text).length + (t?.layout === "number" && t?.number ? 1 : 0);
    if (n < 1 || n > 4) e.push(`thumbnails[${i}] yazı ${n} kelime (1-4, sayı dahil)`);
    if (t?.layout === "number" && !String(t?.number || "").trim()) e.push(`thumbnails[${i}] number şablonu sayı ister`);
  });
  if (th.length >= 3 && new Set(th.map((t) => t?.layout)).size < Math.min(3, th.length)) e.push("kapaklar farklı şablon kullanmalı");
  e.push(...thumbStoryErrors(th, { scenes, anchor, cands }));
  return e;
}

/**
 * 27 Ekim 2026, kanalların tıklama oranları: kazanan kapaklar konunun adını söyledi ("PARIS UNDER CURFEW" France'ın A/B
 * testini aldı, Panama'nın etiketleri "7.4 COLOMBIA / 7.7 PANAMA" %4,9); adı söylemeyenler kaybetti ("19 DAYS. ONE CROWN"
 * %1,3, "FOR ONE CRATER" %1,7, "$116B IN ONE YEAR" %2,5). Fransa borcunun kapağı adı geçmeyen bir bakanın sakin portresiydi: %1,1.
 *   - her kapağın sözleri (yazı, sayı, etiketler, rozet) anlatımda geçen bir özel adı ya da olayın yılını taşır;
 *   - bir yüz kapağın kahramanıysa o yüz hikâyenin kendi adıyla anılan öznesidir (başlığın/konunun adı fotoğrafın künyesinde).
 * Countdown ve dizi kendi kalıbında kalır (anchor yok).
 */
const OFFICIAL_FACE = /\b(official|minister|politician|president|chancellor|senator|governor|spokes(?:man|woman|person)|in a (?:dark )?suit|suit and tie|at a (?:podium|lectern)|press conference|headshot)\b/i;
export function thumbStoryErrors(thumbnails = [], { scenes = null, anchor = null, cands = null } = {}) {
  const e = [];
  if (!anchor) return e;
  const names = scenes?.length ? thumbNames(scenes, anchor) : [];
  const byId = new Map((cands || []).map((c) => [c.id, c]));
  thumbnails.forEach((t, i) => {
    const said = [t?.text, t?.number, t?.tag, ...(Array.isArray(t?.labels) ? t.labels : [])].filter(Boolean).join(" ");
    if (names.length && !thumbNamesStory(said, names)) e.push(`thumbnails[${i}] yazısı konuyu adlandırmıyor ("${said.slice(0, 40)}") — sözlerde olayın, yerin ya da kişinin adı ya da yılı olsun (${names.slice(0, 6).join(", ")}): 'PARIS UNDER CURFEW' kazandı, '19 DAYS. ONE CROWN' %1,3 aldı`);
    const c = byId.get(t?.hero);
    if (c && (c.person || c.vision?.subject === "face")) {
      const named = (s) => anchor.names.some((n) => n.length >= 3 && !/^\d+$/.test(n) && String(s || "").toLowerCase().includes(n));
      // The name card says who it is (Bakker video: Falwell's face under "JIM BAKKER"); without one, an official's portrait
      // the story never names (the minister on France's debt) — never the subject's own picture (D.B. Cooper's sketch).
      const wrong = c.person ? !named(c.person) : OFFICIAL_FACE.test(`${c.vision?.description || ""} ${c.source || ""}`) && !named(`${c.source || ""} ${c.ctx || ""} ${c.vision?.description || ""}`);
      if (wrong) e.push(`thumbnails[${i}].hero bir yüz ama hikâyenin adıyla anılan öznesi değil ("${String(c.person || c.source || c.vision?.description || "").slice(0, 50)}") — tanınmayan bir yetkilinin portresi tıklatmaz (Fransa borcu %1,1): olayın sahnesini ya da başlıktaki kişinin fotoğrafını seç`);
    }
  });
  return e;
}

function storyBrief(script, docu, seo, maxLines = 40) {
  const scenes = (script?.scenes || []).filter((s) => !(s?.type === "title" && s.chapterCard));
  const said = scenes.map((s, i) => ({ i, t: stripTags(s.say), mood: s.mood })).filter((x) => x.t);
  const pick = new Set();
  said.slice(0, 12).forEach((x) => pick.add(x.i));
  said.filter((x) => ["reveal", "dread", "triumph"].includes(x.mood)).slice(0, 16).forEach((x) => pick.add(x.i));
  said.slice(-6).forEach((x) => pick.add(x.i));
  const lines = said.filter((x) => pick.has(x.i)).slice(0, maxLines).map((x) => `- ${x.t.slice(0, 220)}`);
  return [
    `Title (working): ${docu?.title || script?.title || ""}`,
    docu?.era ? `Era: ${docu.era}` : "",
    Array.isArray(docu?.chapters || script?.chapters) ? `Chapters: ${(docu?.chapters || script.chapters).map((c) => (typeof c === "string" ? c : c?.title)).filter(Boolean).join(" | ")}` : "",
    `Key narration (hook, reveals, ending):`,
    ...lines,
    seo?.titles?.length ? `SEO draft titles: ${seo.titles.join(" | ")}` : "",
    seo?.thumbnailText ? `SEO draft thumbnail words: ${seo.thumbnailText}` : "",
    seo?.description ? `SEO description opening: ${String(seo.description).split("\n").slice(0, 2).join(" ")}` : "",
  ].filter(Boolean).join("\n");
}

/**
 * The story name + year every title must open with (storyAnchor), or null where the title shape is fixed elsewhere:
 * a countdown opens with its count, a series with its template.
 */
export function packageAnchor({ topic, script, docu, brand = {} }) {
  if ((docu?.format ?? script?.format) === "ranking" || brand.series) return null;
  const a = storyAnchor({ topic, title: docu?.title || script?.title || "", era: docu?.era || "" });
  return a.names.length ? a : null;
}

function anchorLines(anchor) {
  if (!anchor) return [];
  const y = anchor.year;
  return [`   TITLE RULE (the channel owner, Oct 2026 — overrides the examples above): EVERY title opens with the story's plain name${y ? ` and its year ${y}` : ""}, so a stranger knows at once what the video is about; the angle comes after a colon. Shapes: "${y ? `The ${y} <event>: <angle>` : "<Name>: <angle>"}", "<Name>${y ? ` (${y})` : ""}: <angle>". The first word (after "The") is one of the story's names: ${anchor.names.slice(0, 8).join(", ")}${y ? `; ${y} stands before the colon` : ""}. No quotes in a title (a quote belongs in the description), no teaser openers that hide the subject ("Why…", "How…", "The Night…", "Neither…", "Nobody…"). The five titles differ in the angle after the colon.`];
}

async function planPackage(cands, { llm, model, usage, logFn, script, docu, seo, brand, language, isCancelled, anchor = null, news = false }) {
  const ids = cands.map((c) => c.id);
  const lang = language === "tr" ? "Turkish" : "English";
  const candLines = cands.map((c) => {
    const v = c.vision;
    const kind = { archive: "REAL archive photo", "archive-clip": "REAL archive film frame", ai: "AI still (illustrative)", stock: "stock photo", "stock-clip": "stock film frame", scene: "THUMBNAIL SCENE (drawn for the thumbnail: the story's most dramatic moment, room left for words)" }[c.kind];
    return `${c.id}: ${kind}${c.source ? ` "${c.source}"` : ""}, ${c.w}x${c.h}` + (v ? ` · vision ${v.score}/10 · ${v.subject} · ${v.emotion} · ${v.description}${v.detail ? " · has a circle-able detail" : ""}${v.issues?.length ? ` · issues: ${v.issues.join(",")}` : ""}` : "") + ` · context: ${c.ctx.slice(0, 140)}`;
  });
  const user = [
    `VIDEO (${lang}; ${brand.genre || "documentary"} channel, look "${brand.variant || "original"}"):`,
    storyBrief(script, docu, seo),
    ``,
    `CANDIDATE HERO PICTURES (all from the video itself; prefer REAL photos of the actual people/objects over AI stills; never an AI still presented as a real person's face if a real one exists):`,
    ...candLines,
    ``,
    `TEMPLATES:`,
    `- hero: the subject big on one side (feathered "cut-out", rim glow), 2-4 huge words on the dark side. Best for a face or one iconic object.`,
    `- split: before/after on a slanted seam: hero on the left, "second" on the right, labels = [leftLabel, rightLabel] (e.g. ["1971","2026"], ["Plan","Reality"]); words across the bottom.`,
    `- circle: the whole picture with ONE detail ringed in red and an arrow from the words. Needs a candidate with a circle-able detail.`,
    `- number: one huge figure ("$200,000", "52 YEARS" — put it in "number", ≤ 10 characters) + 1-3 words under it, subject beside it.`,
    `- document: the picture as a tilted evidence print with a red stamp ("tag", e.g. UNSOLVED / CLASSIFIED — must be literally true), words on printed labels. Best for tickets, letters, files, notes.`,
    ``,
    `WRITE:`,
    `1) 5 titles in ${lang}, each ≤ ${TITLE_MAX} characters: curiosity + specificity (a concrete name, number, object or stake), the way MagnatesMedia, LEMMiNO, Johnny Harris, ColdFusion and Wendover title videos. Five DIFFERENT angles (e.g. mystery question, specific detail, character, stakes/consequence, contrarian). No clickbait lies: every promise must be answered by the video above. Title Case or sentence case, never ALL CAPS (acronyms like FBI are fine), no emoji, no trailing period.`,
    `   CHANNEL DATA (Oct 2026): long videos are watched well by those who click (Panama 5:54 avg, the 1929 crash 64%) but get almost no clicks; the titles that won named the story plainly ('Panama's 7.7 Earthquake: Why Wasn't It Worse?' 5.0% CTR, 'Apollo 13: How Three Men Survived…'), the vague ones lost ('…Will the US Join?', 1.3-2% CTR). So at least 4 of the 5 titles carry the searchable name of the story — the person, place or event a viewer would type into YouTube search — within their first 45 characters, and the title you pair with the recommended thumbnail is understood by someone who has never heard of the story.`,
    `   OUTLIERS IN OUR NICHES (Oct 2026, 30 channels, videos at 2.5-68x their channel's median): a FAMOUS name or place + ONE surprising, concrete angle wins — history: 'The Miserable Reality Of Life On The Mayflower' 12.8x, 'Why Is Japan So Rich?' 7.7x, 'How Alexander the Great Fooled Darius at Gaugamela' 8x, 'Year 536 Was the Worst Year to Be Alive'; news: 'I went to Greenland, here's why the US wants it' 13x, 'How a US B2 Bomber Bombed Afghanistan from Missouri' 16x, 'Russia is Running Out of People'; finance: 'J.P. Morgan Documentary: How One Man Financed America' 12x, 'Rockefeller: The World's First Billionaire' 9x, 'Fried Chicken Wars: The Fall of KFC in America', 'GoPro Is Going Bankrupt?'. Obscure names, poetic or vague titles lose. Write titles of this shape.`,
    `   ${ownDataLines()[0]}`,
    ...anchorLines(anchor),
    ...(brand.series ? [`   SERIES: this video is an episode of the channel's series "${brand.series}" (small-channel breakouts, Oct 2026: every one runs ONE title template as a series). At least 2 of the 5 titles follow that template's exact shape with this episode's name in it; recommend one of them.`] : []),
    `2) 3 thumbnails, each with a DIFFERENT template and, when the candidates allow, a different hero picture. For each: text = 2-4 big words (the "number" template: number + 1-3 words) that make the SUBJECT recognisable on their own AND add one curiosity — a name, place, war or object the viewer knows plus the open question ('IRAN–USA WAR / WHY SAUDI?', 'SEALED SINCE 1945', 'HE MADE MILLIONS / NOW CAN'T PAY RENT'); the title's key name may appear, never the whole title; never cryptic fragments that only make sense after watching ('NO. THEN: WE MAY', '4 SINCE 1950', '100% NEVER BEFORE'); highlight = index of the one word drawn in the accent colour (-1 none); tag = optional small chip or stamp (≤ 3 words, "" if none); second/labels only for split ("" / [] otherwise); number only for the number template ("" otherwise); accent = colour of the highlighted word and chip (accent = the channel's signature colour, red = alarm red, label = the channel's label colour); grade = picture treatment (natural colour, mono = hard black-and-white, cold, warm, duo = the channel's duotone); side = where the words go (the subject goes to the other side; pick the side the subject does NOT face); zoom = subject size (1 = default crop, 1.3 = tighter, 0.8 = looser); emotion = the one feeling the thumbnail sells; why = one short sentence.`,
    `4) scenes = ONE prompt per thumbnail, in the same order (English, 25-45 words each) for the AI-drawn thumbnail scene behind that thumbnail's words, the way the small-channel breakouts do it: the story's single most dramatic or mysterious MOMENT as one photorealistic picture — a place or object with a human for scale (a sealed bunker door and one explorer), a map of the countries in a crisis with their flags, the machine or ship in the decisive second. Period-correct, one focal subject on the right half, empty space on the left for the words, no text in the scene description (Nova adds the thumbnail's own words, the key word in yellow — ChatGPT draws the whole thumbnail; on the Hormuz video this beat our composited cover). Never a real person's likeness (their real photo comes from the candidates). When THUMBNAIL SCENE candidates are listed above, prefer one of them as the recommended hero unless a famous real face IS the story.`,
    `3) recommended = index of the thumbnail you would publish first. Prefer, for the recommended one, a hero picture the video shows in its first seconds (the earliest candidates in the narration order): the viewer who clicks must see the thumbnail's promise within 5 s or leaves (the channel's own retention data, Oct 2026).`,
    `SMALL-CHANNEL BREAKOUTS (Oct 2026: channels of 100-10k subscribers whose ONE video hit 100k-3.5M while its siblings, same voice and quality, stayed at hundreds): the hit's thumbnail shows the SCENE of the story — a sealed bunker door with a man for scale, a war map with the countries' flags, the famous person's face at the moment of ruin — and names the subject in plain words; our own thumbnails of the same months were stylish but cryptic and an unknown official's face (El Niño 0.8% CTR; our Saudi–Houthi video got 14 views where 'IRAN–USA WAR / WHY SAUDI?' on a flag map got 172k on the same story). A war or crisis between countries: a map with their flags. A famous person: their face, big. A place or object: the place itself, dramatic, with a human for scale.
    Rules for the thumbnails: one focal subject, huge contrast, ≤ 4 words readable at 320x180, a clear emotion, consistent channel branding (same fonts/colours come from the look automatically) but each thumbnail visibly different.`,
    `What wins clicks on this channel (the owner's taste): the punch style — 2-4 words in two short lines, the second line the payoff ("70 SHIPS. / ONE HILL."), one giant number when the story has one ("21" beside the face of the man who was 21), and the most IMPOSSIBLE or shocking picture in the video (a ship on top of a hill, a face at the moment of ruin) rather than a calm portrait. A real face, big, beats a crowd. Use circle only when the ringed detail is unmistakable; never ring a person the words are not about.`,
    // Owner's rule (Oct 2026): Google Ads refused a plague thumbnail saying "IT NEVER LEFT"; neutral curiosity passes.
    `Advertiser-friendly (the channel is monetised): no fear or panic claims, no graphic injury, no "outbreak/it's back/it never left" alarm about disease, war or disaster, no claim the video does not prove. Neutral curiosity sells and passes ad review: "WHAT HAPPENED?", "THE WAR NO ONE SAW COMING", "19 DAYS", "100 IN. 7 OUT.". The text must be true of the picture: never "THIS LAB" over a stock lab that is not the lab in the story.`,
    ...((docu?.format ?? script?.format) === "ranking" ? rankingPackageLines(docu?.ranking ? docu : script) : []),
    ...(news ? newsPackageLines() : []),
    ...(anchor ? [`THUMBNAIL WORDS NAME THE STORY (hard rule, checked; the channel's own CTR, Oct 2026): "PARIS UNDER CURFEW" won France's A/B test and Panama's labels "7.4 COLOMBIA / 7.7 PANAMA" got 4.9%; words that named nothing lost ("19 DAYS. ONE CROWN" 1.3%, "FOR ONE CRATER" 1.7%, "$116B IN ONE YEAR" 2.5%). Every thumbnail's words (text, number, labels or tag) carry a name or year a stranger knows — one of: ${thumbNames((script?.scenes || []), anchor).slice(0, 8).join(", ") || anchor.names.slice(0, 6).join(", ")}. A face as hero ONLY when it is the story's own named subject; never a calm portrait of an official the title does not name (France's debt: a minister's portrait, 1.1%) — show the event instead.`] : []),
  ].join("\n");
  return llm({
    system: `You are the packaging lead (titles + thumbnails) of a top English-language documentary YouTube channel. You maximise honest click-through rate. Output ${lang} text. Return only the requested JSON.`,
    user,
    schema: PLAN_SCHEMA(ids),
    validate: (p) => planErrors(p, { ids, min: Math.min(3, cands.length), scenes: (script?.scenes || []).filter((x) => !(x?.type === "title" && x.chapterCard)), anchor, news, cands }),
    model,
    maxTokens: 16000,
    usage,
    logFn,
    isCancelled,
  });
}

/**
 * A news explainer is found by the question, never by the result: the broadcasters own "Lula wins" within
 * hours (CNN, Bloomberg, ABC, France 24, AFP on 26 Oct 2026); our winners asked why.
 */
export function newsPackageLines() {
  return [
    ``,
    `THIS VIDEO IS A NEWS EXPLAINER. On YouTube the result of a news story ("Lula Wins Fourth Term", "Iran Says Tankers Hit Mines") belongs to CNN, Bloomberg, ABC, France 24 and AFP within hours; a small channel is found by the QUESTION their clips leave open.`,
    `- At least 4 of the 5 titles: <the place or event by its searchable name> (+ one concrete number): Why/How/What …? — the channel's winners: "Panama's 7.7 Earthquake: Why Wasn't It Worse?" (4.9% CTR, 7:11 average view), "France Under Curfew: What Really Set Off the Riots?" (3,527 impressions). The loser: "Lula Wins Fourth Term: From 2.3M Behind to 4.4M Ahead" (a recap, 92 impressions on day one).`,
    `- Thumbnails show the event itself (the streets, the damage, the map of the countries with their flags), never a calm portrait of an official.`,
  ];
}

/**
 * A countdown packages differently: the count is in the title, the thumbnail sells number one
 * without naming it (its most shocking picture, "#1" huge), never the whole list.
 */
export function rankingPackageLines(script) {
  const n = script.ranking?.total || script.ranking?.items?.length || 10;
  const one = (script.ranking?.items || []).find((x) => x.rank === 1);
  return [
    ``,
    `THIS VIDEO IS A COUNTDOWN (${n} items, number ${n} to number 1; criterion: ${script.ranking?.criterion || "see the story"}).`,
    `- Titles: at least 3 of the 5 carry the count as a numeral at the start ("${n} …", e.g. "${n} Disappearances Nobody Can Explain"); the others may tease number one. Never reveal number one in a title.`,
    `- Thumbnails: sell NUMBER ONE without naming it: its most shocking picture${one ? ` (number one is "${one.item}")` : ""} with "#1" as the giant number (number template, number "#1", words that add dread/curiosity), or a ringed detail from it. One thumbnail may show "${n}" huge with the strongest picture of the list. Never a collage of many items, never all the ranks.`,
  ];
}

/* ================================================================ plan → kapak spesifikasyonu */

/** Başlıklar: kırp, BÜYÜK HARF'i düzelt, tekrarları at, 5'e tamamla (seo.json'dan). */
export function sanitizeTitles(list, fallback = [], anchor = null) {
  const out = [];
  const seen = new Set();
  const add = (text, angle, from) => {
    let t = String(text ?? "").replace(/\s+/g, " ").replace(/[.。]+$/, "").trim();
    if (!t) return;
    if (isAllCaps(t)) t = titleCase(t);
    if ([...t].length > TITLE_MAX) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ text: t, angle: String(angle || "").slice(0, 40), chars: [...t].length, from });
  };
  for (const t of list || []) add(t?.text ?? t, t?.angle, "plan");
  // Yedek (seo.json) başlıklarından adı başta olanlar öne: yedek paket ilk başlığı önerir.
  const named = (t) => !titleAnchorErrors(t, anchor).length;
  const fb = [...(fallback || [])].sort((a, b) => Number(named(b)) - Number(named(a)));
  for (const t of fb) if (out.length < 5) add(t, "", "seo");
  return out.slice(0, 5);
}

/** Opus'un kapak kararı → kompozisyonun beklediği spesifikasyon (+ ekip için künye). */
export function specFromPlan(t, byId, i) {
  const c = byId.get(t.hero);
  if (!c) return null;
  const layout = LAYOUTS.includes(t.layout) ? t.layout : "hero";
  const kept = coverWords(t.text);
  const number = layout === "number" ? String(t.number || "").trim().slice(0, 12) : "";
  const maxWords = number ? 3 : 4;
  const ws = kept.slice(0, maxWords).map(([w]) => w);
  // The model's highlight counts its own words (with any "/"): the same word after the marks are dropped.
  const hi = Number.isInteger(t.highlight) ? kept.findIndex(([, i]) => i === t.highlight) : -1;
  const pic = (x) => ({ src: `pk/${x.id}${path.extname(x.rel).toLowerCase() || ".jpg"}`, w: x.w, h: x.h, box: x.vision?.box, ...(x.vision?.detail ? { detail: x.vision.detail } : {}) });
  const second = layout === "split" && t.second && byId.get(t.second) && t.second !== t.hero ? byId.get(t.second) : null;
  const spec = {
    layout: layout === "number" && !number ? "hero" : layout,
    text: ws.join(" "),
    highlight: hi >= 0 && hi < ws.length ? hi : -1,
    ...(String(t.tag || "").trim() ? { tag: wordsOf(t.tag).slice(0, 3).join(" ") } : {}),
    ...(number ? { number } : {}),
    accentRole: ACCENT_ROLES.includes(t.accent) ? t.accent : "accent",
    grade: GRADES.includes(t.grade) ? t.grade : "natural",
    side: t.side === "right" ? "right" : "left",
    zoom: +clamp(num(t.zoom, 1), 0.7, 1.8).toFixed(2),
    hero: pic(c),
    ...(second ? { second: pic(second) } : {}),
    ...(layout === "split" ? { labels: [String(t.labels?.[0] || "").slice(0, 14), String(t.labels?.[1] || "").slice(0, 14)] } : {}),
  };
  return { spec, meta: { n: i + 1, heroId: c.id, heroFile: c.rel, heroKind: c.kind, heroSource: c.source, secondFile: second?.rel || null, emotion: String(t.emotion || "").slice(0, 30), why: String(t.why || "").slice(0, 200), titleIndex: Number.isInteger(t.titleIndex) ? t.titleIndex : 0 } };
}

/** Başlığın öznesi: iki noktadan önceki büyük harfli sözcükler ("Jim Bakker: …" → jim, bakker). */
export function subjectWords(title) {
  const head = String(title || "").split(/[:\-–—?!|]/)[0];
  return [...new Set((head.match(/\p{Lu}[\p{L}'’]{2,}/gu) || []).map((w) => w.toLowerCase().replace(/['’]s$/, "")).filter((w) => !SUBJECT_STOP.has(w)))];
}
const SUBJECT_STOP = new Set(["the", "why", "how", "what", "who", "when", "where", "inside", "story", "this", "that", "and", "was", "wasn't", "its", "real", "true", "untold", "secret", "last", "first"]);

/**
 * Kredi/anahtar yoksa: başlığın öznesini gösteren en iyi gerçek fotoğraf + seo başlığı, tek kapak.
 * İsim kartı başka birini söyleyen portre asla seçilmez: Bakker videosunda (Ekim 2026) yedek, Jerry Falwell'in
 * yüzünü "JIM BAKKER" yazısıyla kapağa koymuştu.
 */
export function fallbackPlan(cands, { seo, docu }) {
  const subj = subjectWords(docu?.title || (seo?.titles || []).find(Boolean) || "");
  const hits = (c) => subj.filter((w) => `${c.person || ""} ${c.source || ""} ${c.ctx || ""}`.toLowerCase().includes(w)).length;
  const wrongFace = (c) => !!(c.person && subj.length && !subj.some((w) => c.person.toLowerCase().includes(w)));
  const pool = cands.filter((c) => !wrongFace(c));
  // A named portrait of the subject leads; a mention of the subject in a picture's context only breaks ties
  // (D.B. Cooper's composite sketch still beats "Money stolen by D. B. Cooper").
  const score = (c) => rankScore(c) + 1.5 * Math.min(1, hits(c)) + (c.person ? 3 : 0);
  const ranked = [...(pool.length ? pool : cands)].sort((a, b) => score(b) - score(a));
  const hero = ranked.find((c) => c.kind === "archive") || ranked.find((c) => c.kind === "archive-clip") || ranked[0];
  const title = (seo?.titles || []).find(Boolean) || docu?.title || "";
  let text = String(seo?.thumbnailText || "").trim();
  if (!text) text = wordsOf(String(title).split(/[:\-–—?!]/)[0]).slice(0, 3).join(" ");
  const ws = wordsOf(text).slice(0, 4);
  return {
    titles: [{ text: title, angle: "seo" }],
    thumbnails: hero ? [{ hero: hero.id, layout: "hero", text: ws.join(" "), highlight: ws.length - 1, tag: "", number: "", second: "", labels: [], accent: "accent", grade: "natural", side: "left", zoom: 1, emotion: "", titleIndex: 0, why: "fallback" }] : [],
    recommended: 0,
  };
}

/* ================================================================ 4. çizim (motor) */

function engineDirDefault() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, "docu-engine");
  if (packaged && fs.existsSync(path.join(packaged, "bin", "nova-thumbs.mjs"))) return packaged;
  return path.join(ROOT, "docu-engine");
}

/** Süreç ağacını kes: Remotion'ın Chrome'u kapak çizicinin torunudur (docu.js killTree ile aynı). */
function killTree(p) {
  if (process.platform === "win32" && p.pid) {
    try { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }).on("error", () => {}); } catch {}
  }
  try { p.kill("SIGKILL"); } catch {}
}

/**
 * Motorun kapak çizicisini alt süreçte çalıştırır (Electron ikilisi düz Node gibi,
 * düşük öncelik, tek tarayıcı, tek tek). Remotion'ın Chrome'u Nova'nın render
 * çalışma klasöründeki önbellekten gelir (docu.js ile aynı yer).
 *
 * Söz her durumda bir kez bağlanır (25 Ekim 2026, 20261024-373aaf ön izleme kapısı 48 dk durdu; aday 4): yalnızca
 * 'close' beklenirdi ve bekçi yalnızca doğrudan çocuğu öldürürdü. Borunun ucunu tutan bir torun (Chrome) kalırsa
 * 'close' hiç gelmez, iş sonsuza dek beklerdi. Şimdi: 'exit'ten `exitGraceMs` sonra hâlâ 'close' yoksa borular
 * kapatılıp sonuç verilir; takılmada bütün ağaç kesilir ve söz doğrudan reddedilir; logFn fırlatsa da dinleyici düşmez.
 */
export function renderWithEngine({ items, props = null, assets, workDir, bundleDir, killer, logFn = () => {}, stallMs = 10 * 60 * 1000, exitGraceMs = 15000 }) {
  const engine = engineDirDefault();
  const runtime = DATA_DIR.length > 100 ? path.join(os.tmpdir(), "nova-docu-runtime") : path.join(DATA_DIR, "docu-runtime");
  fs.mkdirSync(runtime, { recursive: true });
  const pkg = path.join(runtime, "package.json");
  if (!fs.existsSync(pkg)) fs.writeFileSync(pkg, '{"private":true}\n');
  fs.mkdirSync(workDir, { recursive: true });
  const spec = path.join(workDir, "thumbs-spec.json");
  // `props`: shared by every item without its own (the preview's one script, a frame per scene).
  writeJson(spec, { items, assets, workDir, ...(props ? { props } : {}), ...(bundleDir ? { bundleDir } : {}) });
  return new Promise((resolve, reject) => {
    if (killer?.cancelled) return reject(new Error("cancelled"));
    const p = spawn(process.execPath, [path.join(engine, "bin", "nova-thumbs.mjs"), spec], {
      cwd: runtime, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    killer?.add(p);
    p.stdout.setEncoding("utf8");
    p.stderr.setEncoding("utf8");
    let buf = "", errTail = "", done = null, failure = null;
    let timer = null, grace = null, settled = false, exited = false;
    const settle = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      fn(v);
    };
    const finish = (code) => {
      if (killer?.cancelled) return settle(reject, new Error("cancelled"));
      if (code === 0 && done) return settle(resolve, { files: done.files || [], failed: done.failed || [] });
      settle(reject, new Error(`kapak çizici: ${failure?.msg || errTail.trim().split("\n").slice(-2).join(" ") || `çıkış kodu ${code}`}`.slice(0, 400)));
    };
    // Bekçi yalnızca çocuk yaşarken kurulur: bittikten sonra gelen veri, PID'si başka sürece geçmiş olabilecek bir ağacı kesmesin.
    const arm = () => {
      clearTimeout(timer);
      if (settled || exited) return;
      timer = setTimeout(() => {
        killTree(p);
        const wait = stallMs >= 60000 ? `${Math.round(stallMs / 60000)} dakika` : `${Math.round(stallMs / 1000)} sn`;
        settle(reject, killer?.cancelled ? new Error("cancelled") : new Error(`kapak çizici: ${wait} yanıt vermedi ve durduruldu`));
      }, stallMs);
      timer.unref?.();
    };
    arm();
    p.stdout.on("data", (d) => {
      arm();
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        // Günlük yazılamasa da (job.json EPERM) olay akışı sürer: buradan fırlayan hata ana sürece düşerdi.
        if (ev?.type === "log") { try { logFn(ev.msg); } catch {} }
        else if (ev?.type === "done") done = ev;
        else if (ev?.type === "error") failure = ev;
      }
    });
    p.stderr.on("data", (d) => { arm(); errTail = (errTail + d).slice(-1500); });
    p.on("error", (e) => settle(reject, e));
    p.on("exit", (code) => {
      exited = true;
      clearTimeout(timer);
      // 'close' boruların da kapanmasını bekler; torun Chrome stdout/stderr'i miras alıp açık tutarsa hiç gelmez.
      grace = setTimeout(() => {
        try { p.stdout.destroy(); } catch {}
        try { p.stderr.destroy(); } catch {}
        finish(code);
      }, exitGraceMs);
      grace.unref?.();
    });
    p.on("close", (code) => finish(code));
  });
}

/* ================================================================ 5. okunurluk */

const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    thumbnails: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          readText: { type: "string" },
          readable: { type: "boolean" },
          subjectClear: { type: "boolean" },
          score: { type: "number" },
          fixes: { type: "array", items: { type: "string", enum: ["bigger_text", "darker_background", "fewer_words", "tighter_crop", "looser_crop", "flip_side"] } },
          note: { type: "string" },
        },
        required: ["n", "readText", "readable", "subjectClear", "score", "fixes", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["thumbnails"],
  additionalProperties: false,
};

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}$]+/gu, "");

/** Model okuduğu metni doğru okudu mu (harf farkı hoşgörüsüyle)? */
export function textMatches(expected, read) {
  const a = norm(expected), b = norm(read);
  if (!a) return true;
  if (!b) return false;
  if (b.includes(a) || a.includes(b) && b.length >= a.length * 0.8) return true;
  // Basit karakter örtüşmesi (O/0, l/I karışıklıkları)
  let same = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
  return same / a.length >= 0.85;
}

/** Okunurluk sonucuna göre belirleyici düzeltme. */
export function fixSpec(spec, v) {
  const s = structuredClone(spec);
  const fixes = new Set(v?.fixes || []);
  if (!v?.readable || fixes.has("bigger_text")) s.textScale = +clamp((s.textScale || 1) * 1.2, 1, 1.4).toFixed(2);
  if (!v?.readable || fixes.has("darker_background")) s.scrim = +clamp((s.scrim || 0) + 0.5, 0, 1).toFixed(2);
  if (fixes.has("fewer_words")) {
    const ws = wordsOf(s.text);
    if (ws.length > 2) {
      // Vurgulu kelime kalır; en kısa (genelde bağlaç) kelime düşer.
      let drop = -1, len = 1e9;
      ws.forEach((w, i) => { if (i !== s.highlight && w.length < len) { len = w.length; drop = i; } });
      if (drop >= 0) {
        ws.splice(drop, 1);
        if (s.highlight > drop) s.highlight -= 1;
        s.text = ws.join(" ");
      }
    }
  }
  if (!v?.subjectClear || fixes.has("tighter_crop")) s.zoom = +clamp((s.zoom || 1) * 1.2, 0.7, 2).toFixed(2);
  else if (fixes.has("looser_crop")) s.zoom = +clamp((s.zoom || 1) * 0.85, 0.6, 2).toFixed(2);
  if (fixes.has("flip_side")) s.side = s.side === "right" ? "left" : "right";
  return s;
}

async function verifyLegibility(entries, { llm, model, usage, logFn, isCancelled }) {
  const res = await llm({
    system: "You check YouTube thumbnails the way a viewer scrolling a phone feed sees them. Be strict. Return only the requested JSON.",
    user: [
      `Each image is a YouTube thumbnail shown at REAL phone-feed size (320x180 pixels). For each (n = its number):`,
      `readText = the big words exactly as you can read them at this size ("" if you cannot); readable = the big words are instantly legible; subjectClear = one focal subject is instantly recognisable; score 0-10 as a click-worthy thumbnail; fixes = what would make it work (empty if fine); note ≤ 12 words.`,
      `Intended big words: ${entries.map((e) => `#${e.n}: "${[e.spec.number, e.spec.text].filter(Boolean).join(" ")}"`).join(" · ")}`,
    ].join("\n"),
    schema: VERIFY_SCHEMA,
    images: entries.map((e) => ({ etiket: `#${e.n}`, data: fs.readFileSync(e.small).toString("base64"), mediaType: "image/jpeg" })),
    model,
    maxTokens: 3000,
    usage,
    logFn,
    isCancelled,
  });
  const by = new Map((res?.thumbnails || []).map((t) => [t.n, t]));
  return entries.map((e) => {
    const v = by.get(e.n);
    if (!v) return { n: e.n, checked: false };
    const want = [e.spec.number, e.spec.text].filter(Boolean).join(" ");
    const pass = !!v.readable && textMatches(want, v.readText) && num(v.score, 0) >= 6;
    return { n: e.n, checked: true, pass, readText: String(v.readText || "").slice(0, 80), readable: !!v.readable, subjectClear: !!v.subjectClear, score: num(v.score, 0), fixes: v.fixes || [], note: String(v.note || "").slice(0, 120) };
  });
}

/* ================================================================ 6. çıktı */

/** seo.md'deki kopyala-yapıştır açıklaması (bölümler ve künye dahil); yoksa seo.json'unki. */
export function publishedDescription(jobDir, seo) {
  try {
    // Elle kaydedilen CRLF seo.md'de blok bulunamıyor, paket seo.json'un künyesiz, bölümsüz açıklamasına düşüyordu.
    const md = fs.readFileSync(path.join(jobDir, "seo.md"), "utf8").replace(/\r\n/g, "\n");
    const m = md.match(/##[^\n]*(?:Açıklama|Description)[^\n]*\n(?:[^\n]*\n)*?```\n([\s\S]*?)```/);
    if (m) return m[1].trim();
  } catch {}
  return String(seo?.description || "").replace("{BOLUMLER}", "").trim();
}

/**
 * seo.md'nin yayıncıya notları: kopyala-yapıştır bloğunun altındaki "**Yayın öncesi kontrol (görsel|müzik):**"
 * maddeleri ve 5.000 karakter uyarısı. Kullanıcının açtığı dosya package.md ("Baslik ve Aciklama.md"); yalnızca
 * blok taşınınca kliplerin "Permission not verified" ve müziğin "origin/license not verified" notları yalnızca
 * seo.md'de kalıyordu (25 Ekim 2026).
 */
export function publisherChecks(jobDir) {
  let md = "";
  try { md = fs.readFileSync(path.join(jobDir, "seo.md"), "utf8"); } catch { return []; }
  md = md.replace(/\r\n/g, "\n").replace(/```[\s\S]*?```/g, ""); // izleyici metni not sayılmaz; elle kaydedilen CRLF de okunur
  const out = [];
  const uyari = md.match(/^\*\*Uyarı:\*\*\s*(.+)$/m);
  if (uyari) out.push(`Açıklama: ${uyari[1].trim()}`);
  for (const [, grup, maddeler] of md.matchAll(/^\*\*Yayın öncesi kontrol \(([^)\n]+)\):\*\*\n((?:- [^\n]*(?:\n|$))+)/gm)) {
    const ad = grup.charAt(0).toLocaleUpperCase("tr") + grup.slice(1);
    for (const m of maddeler.split("\n")) if (m.startsWith("- ")) out.push(`${ad}: ${m.slice(2).trim()}`);
  }
  return out;
}

export function renderPackageMarkdown({ titles, thumbs, recommended, seo, description, checks = [], mode, cost }) {
  const rec = thumbs[recommended] || thumbs[0];
  return [
    `# YouTube paketi`,
    ``,
    rec ? `**Önerilen:** kapak ${rec.n} + başlık "${titles[rec.titleIndex]?.text || titles[0]?.text || ""}"` : "",
    mode === "fallback" ? `> Model kullanılamadı — belirleyici yedek paket (tek kapak, seo.json başlıkları).` : "",
    ``,
    `## Başlıklar`,
    ...titles.map((t, i) => `${i + 1}. ${t.text}  _(${t.chars} karakter${t.angle ? ` · ${t.angle}` : ""})_`),
    ``,
    `## Kapaklar`,
    ...thumbs.map((t) => `- **thumb-${t.n}.jpg** — ${t.layout}: "${[t.number, t.text].filter(Boolean).join(" ")}" · başlık ${t.titleIndex + 1} ile · görsel: ${t.heroKind}${t.heroSource ? ` (${t.heroSource})` : ""}${t.legibility?.checked ? ` · 320x180 okunurluk: ${t.legibility.pass ? "geçti" : `düzeltildi (${t.legibility.readText || "okunamadı"})`}` : ""}${t.why ? `\n  ${t.why}` : ""}`),
    ``,
    `## Açıklama (kopyala-yapıştır)`,
    "```",
    description || "",
    "```",
    ``,
    // Yayıncının: bloğun dışında, ayrı başlıkla (seo.md'deki gibi hemen altında).
    ...(checks?.length ? [`## Yayın öncesi kontrol`, `Açıklamaya girmez; yayından önce bunlara bak:`, ...checks.map((c) => `- ${c}`), ``] : []),
    ...(seo?.tags?.length ? [`## Etiketler`, "```", seo.tags.join(", "), "```", ``] : []),
    ...(String(seo?.pinnedComment || "").trim() ? [`## Sabitlenecek yorum`, `> ${seo.pinnedComment}`, ``] : []),
    // İzlenme verisi (Ekim 2026): Short izleyicisinin uzun videoya geçtiği tek yol "İlgili video" bağlantısı.
    `## Yayın kontrol listesi`,
    `- Short'u yükleyince "İlgili video" alanına bu uzun videoyu bağla (YouTube Studio → İçerik → Shorts → Short'un kalemi → Ayrıntılar → İlgili video).`,
    `- Kapaktaki görsel ya da sözcük videonun ilk 5 sn'sinde görünüyor mu? (Tıklayan izleyici vaadi hemen görmezse ilk 30 sn'de çıkıyor.)`,
    // Kanal analizi (Ekim 2026): reklam görüntülemeleri uzun videoların %57-69'u ve 0:42-1:47 izleniyor; organik izleyici
    // 4-6 dk. Kapak tıklaması (en iyi %4,1 sayı kapağı) ve organik erişim asıl darboğaz.
    ...(thumbs.length > 1 ? [`- ${thumbs.length} kapağın hepsini Studio'nun "Test ve karşılaştır" özelliğiyle yükle (Ayrıntılar → Küçük resim → Test ve karşılaştır); YouTube izlenme süresine göre kazananı seçer.`] : []),
    `- Bitiş ekranı: kanalın organikte en uzun izlenen videosu + abone ol. Videoyu konusunun/döneminin oynatma listesine ekle.`,
    `- Yayından 48 saat sonra Studio → Analiz → Kitle tutma: ilk 30 sn'deki düşüşe bak — trafik kaynağından reklamı çıkararak (reklam izleyicisi organik tutmayı gizler).`,
    ``,
    ...(cost ? [`_Tahmini model maliyeti: $${cost.usd.toFixed(3)} (${cost.calls} çağrı; fatura değildir)_`] : []),
  ].filter((x) => x !== "").join("\n").replace(/\n## /g, "\n\n## ");
}

function costOf(u) {
  let usd = 0, calls = 0;
  for (const [m, e] of Object.entries(u?.byModel || {})) {
    const [pi, po] = PRICE[m] || PRICE["claude-opus-5-5"];
    usd += ((e.inputTokens || 0) * pi + (e.outputTokens || 0) * po) / 1e6;
    calls += e.requests || 0;
  }
  return { usd: +usd.toFixed(4), calls };
}

/** Paket çağrılarının kullanımını işin kullanımına ekler (sumUsage'ın biçimiyle). */
function mergeUsage(target, src) {
  if (!target || !src?.byModel) return;
  target.byModel ||= {};
  for (const [m, e] of Object.entries(src.byModel)) {
    const t = (target.byModel[m] ||= {});
    for (const [k, v] of Object.entries(e)) if (typeof v === "number") t[k] = (t[k] || 0) + v;
  }
  for (const k of ["requests", "inputTokens", "outputTokens", "uncachedInputTokens", "cacheReadTokens", "cacheWriteTokens", "estimatedUsd", "unpricedRequests"]) {
    if (typeof src[k] === "number") target[k] = (target[k] || 0) + src[k];
  }
}

function copyAtomic(src, dest) {
  const tmp = `${dest}.tmp-${process.pid}`;
  fs.copyFileSync(src, tmp);
  fs.renameSync(tmp, dest);
}

/* ================================================================ ana giriş */

/**
 * Bitmiş bir belgesel işi için YouTube paketi.
 * @param o.jobDir      iş klasörü (output.mp4, seo.json, docu/…)
 * @param o.job         iş kaydı (language, id)
 * @param o.settings    getJobSettings(job)
 * @param o.llm         test için callJSON yerine (plan)
 * @param o.visionLlm   test için callVisionJSON yerine (sıralama + okunurluk)
 * @param o.render      test için motor çizici yerine: ({items, assets, workDir}) => {files, failed}
 * @param o.force       kayıtlı planı yok say (yeniden öder)
 * @returns {{titles, thumbs, recommended, mode, outputs:{thumbs:string[], thumbLabels:object}, cost}}
 */
export async function runDocuPackage({ jobDir, job = {}, settings = {}, usage = null, logFn = () => {}, llm = callJSON, visionLlm = callVisionJSON, render = renderWithEngine, isCancelled = () => false, killer, force = false, bundleDir, ffmpeg, rerun = false } = {}) {
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  const workDir = path.join(jobDir, "docu");
  const id = job.id || path.basename(jobDir);
  const props = readJson(path.join(workDir, `${id}.props.json`), null)?.script;
  const engineScript = readJson(path.join(workDir, "engine-script.json"), null);
  const script = props?.scenes?.length ? props : engineScript;
  if (!script?.scenes?.length) throw new Error("paket: motor senaryosu bulunamadı (docu/engine-script.json)");
  const docu = readJson(path.join(jobDir, "docu-script.json"), null) || engineScript || script;
  const seo = readJson(path.join(jobDir, "seo.json"), {}) || {};
  const credits = readJson(path.join(jobDir, "docu-archive-done.json"), null)?.credits || {};
  const publicDir = path.join(workDir, "public");
  const brand = { genre: script.genre || docu.genre || "documentary", variant: script.look?.variant || engineScript?.look?.variant || "", locale: script.locale || (job.language === "tr" ? "tr" : "en"), ...(job.docuSeries ? { series: job.docuSeries } : {}) };
  const language = job.language || (String(brand.locale).startsWith("tr") ? "tr" : "en");
  const anchor = packageAnchor({ topic: job.topic, script, docu, brand });

  // Kapak sahneleri (thumb-scenes.js): kutuda çizilmiş sahne varsa adayların başında. Denetimin kusurlu bulduğu resim aday olmaz.
  const all = packageCandidates({ jobDir, script, engineScript, credits, publicDir, logFn });
  if (!all.length) throw new Error("paket: videoda kapak için görsel bulunamadı");
  let cands = shortlist(all);
  const cacheFile = path.join(jobDir, "docu-package.json");
  const key = hash(JSON.stringify([PACKAGE_VERSION, seo.titles, seo.thumbnailText, docu.title, cands.map((c) => c.rel), brand]));
  const cache = !force ? readJson(cacheFile, null) : null;
  const saved = cache?.key === key ? cache : null;
  // The package made before a "Kapakları yenile" (force). Houthi–Saudi news, 28 Oct 2026: the refresh's plan call
  // failed, the deterministic fallback replaced 3 covers and 5 written titles with one cover and seo.json titles,
  // and the three ChatGPT covers in the box mapped onto that one. A failed refresh now keeps the plan it had.
  const prior = force ? readJson(cacheFile, null) : null;
  const u = {};
  const hasKey = !!settings.anthropicKey || llm !== callJSON || visionLlm !== callVisionJSON;
  const notes = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-pkg-"));
  let mode = "llm";
  // Kredi bittiyse sonraki çağrılar denenmez (ücretsiz 400 de olsa günlüğü kirletir).
  let creditGone = false;
  let visionRan = false;
  try {
    /* ---- 2. görme sıralaması ---- */
    if (saved?.vision) { visionRan = true; cands = cands.map((c) => ({ ...c, vision: saved.vision[c.rel] ?? null })); }
    else if (hasKey && settings.docuPackageVision !== false) {
      try {
        logFn(`Kapak adayları görme modeline gösteriliyor (${cands.length} görsel)...`);
        cands = await visionRank(cands, { llm: visionLlm, model: settings.docuPackageVisionModel || settings.visionModel || VISION_MODEL, usage: u, logFn, ff, tmp, isCancelled });
        visionRan = true;
      } catch (e) {
        if (isCancelled()) throw e;
        if (noCredit(e)) creditGone = true;
        notes.push(`görme sıralaması yapılamadı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 120)})`);
        logFn(`Kapak adayları görmesiz sıralanıyor: ${notes.at(-1)}`);
      }
    }
    cands = cands.map((c) => ({ ...c, rank: rankScore(c) })).sort((a, b) => b.rank - a.rank);
    const byId = new Map(cands.map((c) => [c.id, c]));

    /* ---- 3. plan ---- */
    let plan = saved?.plan || null;
    if (!plan && hasKey && !creditGone) {
      try {
        logFn("Başlık ve kapak planı yazılıyor (Opus)...");
        plan = await planPackage(cands, { llm, model: settings.docuPackageModel || PLAN_MODEL, usage: u, logFn, script, docu, seo, brand, language, isCancelled, anchor, news: job.docuFormat === "news" });
      } catch (e) {
        if (isCancelled()) throw e;
        if (noCredit(e)) creditGone = true;
        notes.push(`başlık/kapak planı yazılamadı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 160)})`);
        logFn(`YouTube paketi belirleyici yedekle sürüyor: ${notes.at(-1)}`);
      }
    }
    if (!plan && prior?.plan && prior.mode !== "fallback") {
      plan = prior.plan;
      logFn("YouTube paketi: yeni plan yazılamadı — önceki başlık ve kapak planı korunuyor, yalnız kapaklar yenileniyor");
    }
    if (!plan) {
      plan = fallbackPlan(cands, { seo, docu });
      mode = "fallback";
      logFn("YouTube paketi belirleyici yedekle hazırlanıyor: en iyi gerçek fotoğraf + seo.json başlığı, tek kapak");
    }
    const titles = sanitizeTitles(plan.titles, [...(seo.titles || []), docu.title].filter(Boolean), anchor);
    let entries = (plan.thumbnails || []).slice(0, 3).map((t, i) => specFromPlan(t, byId, i)).filter(Boolean);
    if (!entries.length) {
      plan = fallbackPlan(cands, { seo, docu });
      mode = "fallback";
      entries = plan.thumbnails.map((t, i) => specFromPlan(t, byId, i)).filter(Boolean);
    }
    entries.forEach((e, i) => { e.meta.n = i + 1; if (e.meta.titleIndex >= titles.length || e.meta.titleIndex < 0) e.meta.titleIndex = 0; });
    const recommended = clamp(Number.isInteger(plan.recommended) ? plan.recommended : 0, 0, Math.max(0, entries.length - 1));
    if (saved?.specs?.length === entries.length && !force) saved.specs.forEach((s, i) => { if (s) entries[i].spec = s; });

    // TAM GPT KAPAĞI (thumb-scenes.js, Hürmüz 20 Ekim 2026): her kapak için yazısı içinde ChatGPT tarifi. Kutuda
    // kapak varsa onlar kapağın KENDİSİDİR; yoksa OpenAI kredisiyle hemen çizilir, kredi yoksa LISTE.txt'ye yazılır.
    let gptFiles = fullThumbFiles(jobDir);
    if (!gptFiles.length && mode === "llm" && Array.isArray(plan.scenes) && plan.scenes.length && !sceneFiles(jobDir).length && settings.docuThumbScenes !== false) {
      const gptPrompts = entries.map((e, i) => fullThumbPrompt({
        scene: plan.scenes[i] || plan.scenes[0],
        text: [e.spec.number, e.spec.text].filter(Boolean).join(" "),
        key: e.spec.highlight >= 0 ? String(e.spec.text).split(/\s+/)[e.spec.highlight] : "",
        tag: e.spec.tag || "",
      }));
      const list = writeFullInbox(jobDir, gptPrompts, { title: docu.title || "" });
      const made = await autoFullThumbs({ jobDir, prompts: gptPrompts, settings, textToImage: openAIImagesProvider.textToImage.bind(openAIImagesProvider), logFn });
      gptFiles = fullThumbFiles(jobDir);
      if (!made && list) logFn(`GPT kapak tarifleri hazır: ${list} — ChatGPT'de üretip 01.png/02.png/03.png olarak koy, sonra "Kapakları yenile"`);
    }

    /* ---- 4. çizim ---- */
    const outDir = path.join(jobDir, "thumbnails");
    fs.mkdirSync(outDir, { recursive: true });
    const assets = {};
    for (const e of entries) for (const p of [e.spec.hero, e.spec.second].filter(Boolean)) {
      const c = cands.find((x) => p.src === `pk/${x.id}${path.extname(x.rel).toLowerCase() || ".jpg"}`);
      if (c) assets[p.src] = c.abs;
    }
    const propsOf = (spec) => ({ thumb: spec, brand, script: { genre: brand.genre, ...(brand.variant ? { look: { variant: brand.variant } } : {}), locale: brand.locale, scenes: [] } });
    const drawn = new Map();
    const draw = async (list) => {
      const items = list.map((e) => ({ props: propsOf(e.spec), out: path.join(outDir, `thumb-${e.meta.n}.jpg`) }));
      const res = await render({ items, assets, workDir: path.join(tmp, "render"), bundleDir, killer, logFn });
      for (const e of list) {
        const f = path.join(outDir, `thumb-${e.meta.n}.jpg`);
        if ((res.files || []).includes(f) || (res.files || []).some((x) => path.resolve(x) === path.resolve(f))) {
          const small = path.join(outDir, `thumb-${e.meta.n}-small.jpg`);
          await run(ff, ["-v", "error", "-y", "-i", f, "-vf", "scale=320:180:flags=lanczos", "-q:v", "3", small], { timeoutMs: 60000 });
          drawn.set(e.meta.n, { file: f, small });
        }
      }
      for (const x of res.failed || []) notes.push(`kapak çizilemedi: ${path.basename(x.out)} (${String(x.error).slice(0, 100)})`);
    };
    // GPT kapakları kutudan: 1280x720'ye getirilir, motorda çizilmez, üstüne yazı basılmaz.
    for (const [i, file] of gptFiles.entries()) {
      const e = entries[i];
      if (!e) break;
      const f = path.join(outDir, `thumb-${e.meta.n}.jpg`);
      const small = path.join(outDir, `thumb-${e.meta.n}-small.jpg`);
      try {
        await run(ff, ["-v", "error", "-y", "-i", file, "-vf", "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720", "-q:v", "2", f], { timeoutMs: 60000 });
        await run(ff, ["-v", "error", "-y", "-i", f, "-vf", "scale=320:180:flags=lanczos", "-q:v", "3", small], { timeoutMs: 60000 });
        drawn.set(e.meta.n, { file: f, small });
        e.gpt = true;
        e.spec = { ...e.spec, layout: "gpt" };
      } catch (err) {
        notes.push(`GPT kapağı alınamadı: ${path.basename(file)} (${String(err?.message || err).slice(0, 100)})`);
      }
    }
    if (gptFiles.length) logFn(`Kapaklar kapak-kutusundan (GPT): ${entries.filter((e) => e.gpt).length}`);
    const toDraw = entries.filter((e) => !e.gpt);
    if (toDraw.length) {
      logFn(`Kapaklar çiziliyor (${toDraw.length})...`);
      await draw(toDraw);
    }
    if (isCancelled()) throw new Error("cancelled");

    /* ---- 5. okunurluk ---- */
    let verify = saved?.verify && saved.specs?.length === entries.length ? saved.verify : null;
    const toCheck = entries.filter((e) => drawn.has(e.meta.n) && !e.gpt).map((e) => ({ n: e.meta.n, spec: e.spec, small: drawn.get(e.meta.n).small }));
    if (!verify && hasKey && !creditGone && toCheck.length && settings.docuPackageVerify !== false) {
      try {
        logFn("Kapaklar 320x180'de okunurluk için denetleniyor...");
        verify = await verifyLegibility(toCheck, { llm: visionLlm, model: settings.docuPackageVisionModel || settings.visionModel || VISION_MODEL, usage: u, logFn, isCancelled });
        const failing = entries.filter((e) => verify.find((v) => v.n === e.meta.n && v.checked && !v.pass));
        if (failing.length) {
          for (const e of failing) e.spec = fixSpec(e.spec, verify.find((v) => v.n === e.meta.n));
          logFn(`${failing.length} kapak küçük boyutta zayıf okundu — büyütülüp yeniden çiziliyor (${failing.map((e) => `#${e.meta.n}`).join(", ")})`);
          await draw(failing);
          for (const e of failing) { const v = verify.find((x) => x.n === e.meta.n); v.fixed = true; }
        }
      } catch (e) {
        if (isCancelled()) throw e;
        if (noCredit(e)) creditGone = true;
        notes.push(`okunurluk denetimi yapılamadı (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 120)})`);
        logFn(`Okunurluk denetimi atlandı: ${notes.at(-1)}`);
      }
    }

    /* ---- 6. çıktı ---- */
    const thumbs = entries.filter((e) => drawn.has(e.meta.n)).map((e) => ({
      ...e.meta, file: `thumbnails/thumb-${e.meta.n}.jpg`, small: `thumbnails/thumb-${e.meta.n}-small.jpg`,
      layout: e.spec.layout, text: e.spec.text, number: e.spec.number || "", tag: e.spec.tag || "",
      legibility: verify?.find((v) => v.n === e.meta.n) || null, spec: e.spec,
    }));
    mergeUsage(usage, u);
    const cost = costOf(u);
    const recIdx = clamp(thumbs.findIndex((t) => t.n === entries[recommended]?.meta.n), 0, Math.max(0, thumbs.length - 1));
    const titlesJson = {
      version: PACKAGE_VERSION, createdAt: new Date().toISOString(), mode, brand,
      recommended: thumbs.length ? { thumbnail: thumbs[recIdx].file, title: titles[thumbs[recIdx].titleIndex]?.text || titles[0]?.text || "" } : { thumbnail: null, title: titles[0]?.text || "" },
      titles,
      thumbnails: thumbs.map(({ spec, ...t }) => ({ ...t, pairedTitle: titles[t.titleIndex]?.text || "" })),
      candidates: cands.map((c) => ({ id: c.id, file: c.rel, kind: c.kind, source: c.source, prescore: c.prescore, rank: c.rank, vision: c.vision || null })),
      notes, cost,
    };
    writeJson(path.join(jobDir, "titles.json"), titlesJson);
    fs.writeFileSync(path.join(jobDir, "package.md"), renderPackageMarkdown({ titles, thumbs, recommended: recIdx, seo, description: publishedDescription(jobDir, seo), checks: publisherChecks(jobDir), mode, cost }), "utf8");
    writeJson(cacheFile, {
      key, version: PACKAGE_VERSION, mode, savedAt: new Date().toISOString(),
      // Yalnızca modelin gerçekten ürettiği kaydedilir: yedek plan, kredi gelince yeniden denensin.
      vision: visionRan ? Object.fromEntries(cands.map((c) => [c.rel, c.vision || null])) : null,
      plan: mode === "llm" ? plan : null, verify: mode === "llm" ? verify : null, specs: mode === "llm" ? entries.map((e) => e.spec) : null,
    });

    // Arayüz: kapak seçici thumb_a..c.jpg'yi tanır; seçilmiş bir kapak yoksa önerilen varsayılan olur.
    const letters = ["a", "b", "c"];
    const uiThumbs = [];
    const labels = {};
    thumbs.slice(0, 3).forEach((t, i) => {
      const name = `thumb_${letters[i]}.jpg`;
      copyAtomic(path.join(jobDir, t.file), path.join(jobDir, name));
      uiThumbs.push(name);
      labels[name] = `${i + 1}. ${{ hero: "Kahraman", split: "Önce/sonra", circle: "Daire", number: "Sayı", document: "Belge", gpt: "GPT kapağı" }[t.layout] || t.layout}: ${[t.number, t.text].filter(Boolean).join(" ")}`;
    });
    const cover = readJson(path.join(jobDir, "cover.json"), null);
    if (thumbs.length && !cover?.selected) copyAtomic(path.join(jobDir, thumbs[recIdx].file), path.join(jobDir, "thumbnail.jpg"));
    logFn(`YouTube paketi hazır: ${thumbs.length} kapak, ${titles.length} başlık${mode === "fallback" ? " (yedek)" : ""} · tahmini $${cost.usd.toFixed(3)}`);
    return { titles, thumbs, recommended: recIdx, mode, notes, cost, outputs: { thumbs: uiThumbs, thumbLabels: labels } };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

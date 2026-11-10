// OTOMATİK KALİTE DENETİMİ (Sinematik Belgesel, render'dan sonra)
//
// Bir editörün teslimden önce videoyu baştan sona izlemesi gibi:
//   1. ÜCRETSİZ ffmpeg denetimleri — tek kod çözme geçişinde: ses yüksekliği
//      (hedef -14 LUFS), uzun sessizlik, siyah kare, donmuş görüntü. Aynı geçiş
//      her sahnenin ortasından ve ~20 sn'de bir fazladan bir kare çıkarır.
//   2. Aynı çekimin kısa arayla tekrarı: karelerin algısal özetiyle (dHash), ücretsiz.
//   3. Kareler 4x3 kontak sayfalarına dizilir ve bir görme modeline (Claude Sonnet 5.5)
//      toplu gösterilir — istek başına 6 sayfa, 12 dk'lık videoda ~3-4 istek:
//      yazı taşması/kesilmesi, boş/siyah/bozuk kare, anlatımla açıkça uyuşmayan
//      görsel, dönem hatası (script.era), yakın tekrar, çirkin kırpma.
// Çıktı: qa.json {issues:[{scene, time, kind, detail, fix, severity}]} ve kısa Türkçe
// özet (işin kalite uyarılarına girer). `fix`: "repick" (o sahnenin arşiv seçimi
// geçersiz sayılır), "rerender", "edit-text", "remaster", "device-fallback" (içeriği yanlış cihaz sade görsele
// döner), "review".
//
// Görme çağrısı başarısız olursa (kredi yok, ağ) yalnızca ffmpeg denetimleri raporlanır;
// denetimin kendisi çökse bile video yine teslim edilir (çağıran yakalar).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { callVisionJSON } from "../llm.js";
import { readJson, writeJson, run } from "../util.js";
import { dHashFromGray, ayniFotograf, forgetCachedPick } from "./docu-archive.js";
import { photoKey, stablePhotoRefs } from "./media.js";

export const QA_VERSION = "docu-qa-2";
// Opus 5.5 (Ekim 2026, kanal sahibi: "Nova benden iyi çıkarmalı"): Sonnet 20 sn'de bir kareye bakıyordu, yanlış yüzü ve
// kancadaki jenerik stoğu kaçırıyordu.
export const QA_MODEL = "claude-opus-5-5";
const FPS = 30;
/** Kontak sayfası: 4x3 kare, her biri 480x270. */
const COLS = 4, ROWS = 3, PER_SHEET = COLS * ROWS, TILE_W = 480, TILE_H = 270;
const SHEETS_PER_CALL = 6;
const EXTRA_EVERY = 20;
const MAX_FRAMES = 420;
export const LOUDNESS_TARGET = -14;
const REPEAT_WINDOW = 30;

export const QA_KINDS = ["text_overflow", "broken", "mismatch", "anachronism", "repeat", "bad_crop", "wrong_face", "generic", "text_on_face", "ai_look"];
const KIND_TR = {
  text_overflow: "yazı taşması", broken: "bozuk/boş kare", mismatch: "anlatımla uyuşmayan görsel", anachronism: "dönem hatası",
  repeat: "tekrar eden görsel", bad_crop: "kötü kırpma", wrong_face: "yanlış yüz", generic: "kancada jenerik kare", text_on_face: "yüzün üstünde yazı", ai_look: "belli olan AI görseli",
  too_short: "kısa video", hook_slow: "yavaş kanca", hook_not_real: "kanca gerçek görselle açılmıyor", long_hold: "uzun bekleyen kare", cta: "izleyici çağrısı", end_screen: "bitiş ekranı alanında yazı", ai_share: "kancada AI görsel oranı", text_flash: "çok kısa görünen yazı", black: "siyah kare", freeze: "donmuş görüntü", silence: "uzun sessizlik", loudness: "ses yüksekliği",
  too_dark: "karanlık görünüş", desaturated: "renksiz görünüş",
};

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const stripTags = (t) => String(t || "").replace(/\[[^\]]*\]\s*/g, "").replace(/\s+/g, " ").trim();
const isCard = (s) => s?.type === "title" && s.chapterCard;
const noCredit = (e) => /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(String(e?.message || e));

/* ================================================================ zaman çizelgesi */

/** Motor yerleşimi yoksa yaklaşık: sahne = max(dur, ses + 0,4 sn). */
export function approxPlacement(script, fps = FPS) {
  let from = 0;
  return script.scenes.map((s) => {
    const sec = Math.max(Number(s.dur) || 0, Number(s.voiceDur) > 0 ? s.voiceDur + 0.4 : 0, 0.5);
    const frames = Math.round(sec * fps);
    const p = { from, frames };
    from += frames;
    return p;
  });
}

/**
 * Sahne satırları: render sırası (motorun eklediği bölüm kartları dahil) ve senaryo
 * sırası (`scene`: engine-script.json indeksi; bölüm kartında null).
 */
export function sceneRows(script, placed, fps = FPS) {
  const pl = placed?.length === script.scenes.length ? placed : approxPlacement(script, fps);
  let src = 0;
  return script.scenes.map((s, r) => {
    const start = pl[r].from / fps;
    const end = (pl[r].from + pl[r].frames) / fps;
    const scene = isCard(s) ? null : src++;
    return { r, scene, start, end, s };
  });
}

/** Denetlenecek anlar: her sahnenin ortası + ~20 sn'de bir fazladan kare. */
export function sampleTimes(rows, duration) {
  const list = rows.map((x) => ({ t: (x.start + x.end) / 2, row: x, mid: true }));
  for (let t = EXTRA_EVERY / 2; t < duration - 0.5; t += EXTRA_EVERY) {
    if (list.some((x) => Math.abs(x.t - t) < 4)) continue;
    const row = rows.find((x) => t >= x.start && t < x.end) || rows.at(-1);
    list.push({ t, row, mid: false });
  }
  list.sort((a, b) => a.t - b.t);
  const out = [];
  for (const x of list) if (x.t < duration - 0.05 && !(out.length && x.t - out.at(-1).t < 0.5)) out.push(x);
  if (out.length <= MAX_FRAMES) return out;
  // Çok uzun videoda: sahne ortaları öncelikli, fazladan kareler seyrekleşir.
  const mids = out.filter((x) => x.mid);
  const step = mids.length / MAX_FRAMES;
  return step > 1 ? Array.from({ length: MAX_FRAMES }, (_, k) => mids[Math.floor(k * step)]) : [...mids, ...out.filter((x) => !x.mid).slice(0, MAX_FRAMES - mids.length)].sort((a, b) => a.t - b.t);
}

/**
 * İZLEYİCİNİN GİTTİĞİ YERE GÖRE ÖRNEKLEME (Ekim 2026, kanal verisi: izleyici ilk 20-40 sn'de gidiyor, kalan
 * organik izleyici 4-6 dk izliyor). İlk 60 sn saniyede bir kare (kanca: her kesim, her yazı); 1-6. dk her sahnenin
 * ortası + uzun sahnenin çeyrekleri + 10 sn'de bir; sonrası sahne ortası + 20 sn'de bir; her bölüm geçişinin ilk
 * saniyesi. Sınır aşılırsa önce fazladan kareler seyrekleşir; kanca ve bölüm geçişi korunur.
 */
export const HOOK_SEC = 60;
export const CORE_END_SEC = 360;
const PRIORITY = { hook: 0, chapter: 1, mid: 2, quarter: 3, extra: 4 };
export function retentionTimes(rows, duration, { max = MAX_FRAMES } = {}) {
  const rowAt = (t) => rows.find((x) => t >= x.start && t < x.end) || rows.at(-1);
  const pts = [];
  const push = (t, row, tag) => { if (row && t >= 0 && t < duration - 0.05) pts.push({ t: +t.toFixed(2), row, mid: tag === "mid", tag }); };
  for (const x of rows) push((x.start + x.end) / 2, x, "mid");
  for (let t = 0.5; t < Math.min(HOOK_SEC, duration); t += 1) push(t, rowAt(t), "hook");
  for (const x of rows) {
    const len = x.end - x.start;
    if (x.start >= HOOK_SEC && x.start < CORE_END_SEC && len >= 5) { push(x.start + len * 0.25, x, "quarter"); push(x.start + len * 0.75, x, "quarter"); }
  }
  for (let t = HOOK_SEC + 5; t < Math.min(CORE_END_SEC, duration); t += 10) push(t, rowAt(t), "extra");
  for (let t = CORE_END_SEC + 10; t < duration; t += EXTRA_EVERY) push(t, rowAt(t), "extra");
  rows.forEach((x, i) => { if (isCard(x.s) && rows[i + 1]) push(rows[i + 1].start + 0.6, rows[i + 1], "chapter"); });
  // ≥0,5 sn arayla; çakışmada önceliği yüksek olan (ve sahne ortası) kalır.
  pts.sort((a, b) => a.t - b.t || PRIORITY[a.tag] - PRIORITY[b.tag]);
  let out = [];
  for (const p of pts) {
    const last = out.at(-1);
    if (!last || p.t - last.t >= 0.5) { out.push(p); continue; }
    if (PRIORITY[p.tag] < PRIORITY[last.tag] || (p.mid && !last.mid)) out[out.length - 1] = { ...p, mid: p.mid || last.mid };
  }
  for (const tag of ["extra", "quarter", "mid"]) {
    if (out.length <= max) break;
    const over = out.length - max;
    const these = out.filter((p) => p.tag === tag);
    const drop = new Set(these.length <= over ? these : Array.from({ length: over }, (_, k) => these[Math.floor((k * these.length) / over)]));
    out = out.filter((p) => !drop.has(p));
  }
  return out.slice(0, max);
}

/* ================================================================ ffmpeg */

/** ffmpeg çıktısını (stderr) toplayarak çalıştırır. */
async function ffmpegText(ffmpeg, args, timeoutMs, killer) {
  let text = "";
  await run(ffmpeg, args, { timeoutMs, killer, onLine: (d) => { text += d; } });
  return text;
}

/** blackdetect / freezedetect / silencedetect / ebur128 günlüğünü ayrıştırır. */
export function parseDetect(text) {
  const num = (re, s) => { const m = s.match(re); return m ? +m[1] : null; };
  const black = [];
  for (const m of text.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g)) black.push({ start: +m[1], end: +m[2], dur: +m[3] });
  const freeze = [];
  let fs0 = null;
  for (const line of text.split(/\r?\n/)) {
    const a = num(/freeze_start:\s*([\d.]+)/, line);
    if (a !== null) fs0 = a;
    const e = num(/freeze_end:\s*([\d.]+)/, line);
    if (e !== null && fs0 !== null) { freeze.push({ start: fs0, end: e, dur: +(e - fs0).toFixed(2) }); fs0 = null; }
  }
  const silence = [];
  let ss = null;
  for (const line of text.split(/\r?\n/)) {
    const a = num(/silence_start:\s*(-?[\d.]+)/, line);
    if (a !== null) ss = Math.max(0, a);
    const m = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (m) { silence.push({ start: ss ?? +m[1] - +m[2], end: +m[1], dur: +m[2] }); ss = null; }
  }
  // ebur128 özeti en sonda: "Integrated loudness: I: -14.1 LUFS" ... "True peak: Peak: -1.0 dBFS"
  let integrated = null, truePeak = null;
  const sum = text.lastIndexOf("Integrated loudness");
  if (sum >= 0) {
    const tail = text.slice(sum);
    integrated = num(/I:\s*(-?[\d.]+|-inf)\s*LUFS/, tail);
    const tp = tail.indexOf("True peak");
    if (tp >= 0) truePeak = num(/Peak:\s*(-?[\d.]+)\s*dBFS/, tail.slice(tp));
  }
  return { black, freeze, silence, integrated, truePeak, openSilence: ss };
}

/**
 * Tek geçiş: görüntüde siyah/donma tespiti + örnek karelerin çıkarılması, seste
 * sessizlik + ebur128. Ses akışı yoksa yalnızca görüntü.
 */
async function analysePass(video, times, tmp, ffmpeg, killer) {
  const frames = [...new Set(times.map((x) => Math.max(0, Math.round(x.t * FPS))))];
  const expr = frames.map((n) => `eq(n\\,${n})`).join("+");
  const vf = `scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=decrease,pad=${TILE_W}:${TILE_H}:(ow-iw)/2:(oh-ih)/2,setsar=1,blackdetect=d=0.8:pix_th=0.02:pic_th=0.99,freezedetect=n=0.003:d=5,select='${expr}'`;
  const vOut = ["-map", "0:v:0", "-vf", vf, "-vsync", "vfr", "-q:v", "4", path.join(tmp, "f_%04d.jpg")];
  const aOut = ["-map", "0:a:0", "-af", "silencedetect=n=-50dB:d=2.5,ebur128=peak=true:framelog=verbose", "-f", "null", "-"];
  const base = ["-hide_banner", "-nostats", "-loglevel", "info", "-y", "-i", video];
  let text;
  try { text = await ffmpegText(ffmpeg, [...base, ...vOut, ...aOut], 40 * 60 * 1000, killer); } catch (e) {
    if (e?.message === "cancelled") throw e;
    for (const f of fs.readdirSync(tmp)) if (/^f_\d+\.jpg$/.test(f)) fs.rmSync(path.join(tmp, f), { force: true });
    text = await ffmpegText(ffmpeg, [...base, ...vOut], 40 * 60 * 1000, killer);
    text += "\n[qa] ses akışı okunamadı";
  }
  const files = fs.readdirSync(tmp).filter((f) => /^f_\d+\.jpg$/.test(f)).sort();
  return { text, files, frames };
}

/**
 * Yakın tekrar: REPEAT_WINDOW içinde aynı kare (dHash). Render sonrası denetim ve ön izleme kapısı AYNI kuralı kullanır
 * (18 Ekim 2026, Hürmüz: ön izleme bu kontrolü yapmadığı için render sonrası denetim tekrar eden klibi bulup ikinci
 * render'a yol açtı). got: [{t, row, mid}], hashes: frameHashes çıktısı → issue listesi.
 */
export function nearRepeats(got, hashes) {
  const out = [];
  const picture = (s) => s && !isCard(s) && ["photo", "words", "slam"].includes(s.type) && s.bg !== "prev" && !s.heldBg;
  // A picture shown as a card on the film's backdrop (print presentation, a square or strip fitted whole): two
  // different pictures share most of the frame — the Hastings Great Court and Aelfgyva cards were "the same frame"
  // and the false repeat sent the auto-fix to re-pick (and lose) the finished archive pass. Those frames are judged
  // by their FILE (farRepeats above), not by the frame hash.
  const flaggedRepeat = new Set();
  got.forEach((a, i) => {
    if (!a.mid || !picture(a.row.s) || !hashes[i]?.hash || hashes[i].luma < 25) return;
    for (let j = i + 1; j < got.length; j++) {
      const b = got[j];
      if (b.t - a.t > REPEAT_WINDOW) break;
      if (!b.mid || b.row.r === a.row.r || !picture(b.row.s) || !hashes[j]?.hash || hashes[j].luma < 25) continue;
      // Aynı resmi bilerek taşıyan komşu (ör. klibin durağan karesi) sayılmaz.
      if (b.row.r === a.row.r + 1 && b.row.s.image && b.row.s.image === a.row.s.image && !b.row.s.video) continue;
      if (!sameFrameCandidate(a.row.s, b.row.s)) continue;
      if (!ayniFotograf(hashes[i].hash, hashes[j].hash) || flaggedRepeat.has(b.row.r)) continue;
      flaggedRepeat.add(b.row.r);
      out.push({ scene: b.row.scene, time: +b.t.toFixed(2), kind: "repeat", severity: "medium", detail: `Sahne ${a.row.scene === null ? "-" : a.row.scene + 1} ile aynı kare (${Math.round(b.t - a.t)} sn arayla)`, fix: fixFor("repeat", b.row.s), source: "dhash" });
    }
  });
  return out;
}

/** Karelerin 9x8 gri özeti (tek ffmpeg çağrısı) → dHash + ortalama parlaklık. */
export async function frameHashes(tmp, count, ffmpeg) {
  if (!count) return [];
  const out = path.join(tmp, "hash.gray");
  await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-start_number", "1", "-i", path.join(tmp, "f_%04d.jpg"), "-vf", "scale=9:8:flags=area,format=gray", "-f", "rawvideo", out], { timeoutMs: 5 * 60 * 1000 });
  const buf = fs.readFileSync(out);
  return Array.from({ length: count }, (_, k) => {
    const b = buf.subarray(k * 72, k * 72 + 72);
    if (b.length < 72) return { hash: null, luma: 0 };
    return { hash: dHashFromGray(b), luma: b.reduce((a, v) => a + v, 0) / 72 };
  });
}

/* ================================================================ görünüş ölçümü */

/*
 * GÖRÜNÜŞ ÖLÇÜMÜ (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: luma 52-56, doygunluk 2,5-6; son 7 videoda
 * luma 52-75, doygunluk 2,5-7,5, karelerin %21-39'u luma < 40 — kanal sahibi: "her video siyah, karanlık, birbirinin aynı").
 * Hiçbir denetim parlaklığa ve renge bakmıyordu; en iyi video Panama ('color' notu) luma 88, doygunluk 10,2 ölçtü. Render
 * sonrası denetim ve ön izleme kapısı zaten çıkardıkları karelerden (f_0001.jpg…) ortalama parlaklık, ortalama doygunluk ve
 * karanlık kare payını ölçer — ffmpeg signalstats'in YAVG/SATAVG'ı ile aynı ölçek (TV aralığı, kroma büyüklüğü √(U²+V²)).
 * Hedef ≥75 / ≥8 / ≤%15; altında kalite uyarısı (render sonrası) ve too_dark / desaturated bulgusu (ön izleme).
 */
export const LOOK_TARGET = { luma: 75, sat: 8, darkShare: 0.15, darkLuma: 40 };
/** Ölçüm karesi: 128x72 (signalstats ile ±0,5 içinde; kroma ortalaması doygunluğu bastırmasın diye çok küçültülmez). */
const LOOK_W = 128, LOOK_H = 72;
const dec1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");

/**
 * Karelerin görünüşü (saf): frames = [{yavg, satavg, scene?}] (signalstats ölçeği) →
 * {frames, luma, sat, darkShare, ok, low, darkScenes, greyScenes, line}. low: hedefin altındaki ölçüler
 * ("luma" | "sat" | "dark"); darkScenes/greyScenes: en çok koyu / gri karesi olan sahneler (0 tabanlı, en çok 6).
 * Ölçülebilir kare yoksa ok = null (uyarı da bulgu da yok).
 */
export function lookStats(frames, target = LOOK_TARGET) {
  const T = { ...LOOK_TARGET, ...(target || {}) };
  const list = (frames || []).filter((f) => Number.isFinite(f?.yavg) && Number.isFinite(f?.satavg));
  if (!list.length) return { frames: 0, luma: null, sat: null, darkShare: null, ok: null, low: [], darkScenes: [], greyScenes: [], line: "Görünüş: ölçülemedi (kare yok)" };
  const n = list.length;
  const luma = list.reduce((a, f) => a + f.yavg, 0) / n;
  const sat = list.reduce((a, f) => a + f.satavg, 0) / n;
  const dark = list.filter((f) => f.yavg < T.darkLuma);
  const darkShare = dark.length / n;
  const low = [];
  if (luma < T.luma) low.push("luma");
  if (sat < T.sat) low.push("sat");
  if (darkShare > T.darkShare) low.push("dark");
  const top = (xs) => {
    const by = new Map();
    for (const f of xs) if (Number.isInteger(f.scene)) by.set(f.scene, (by.get(f.scene) || 0) + 1);
    return [...by.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 6).map(([sc]) => sc);
  };
  const line = `Görünüş: parlaklık ${Math.round(luma)}, doygunluk ${dec1(sat)}, karanlık kare %${Math.round(darkShare * 100)} — hedef ≥${T.luma}/≥${T.sat}/≤%${Math.round(T.darkShare * 100)}`;
  return {
    frames: n, luma: +luma.toFixed(1), sat: +sat.toFixed(1), darkShare: +darkShare.toFixed(3), ok: !low.length, low,
    darkScenes: top(dark), greyScenes: top(list.filter((f) => f.satavg < T.sat / 2)), line,
  };
}

const sceneList = (xs) => (xs?.length ? ` (en çok: sahne ${xs.map((v) => v + 1).join(", ")})` : "");
/** Görünüşün düzeltme önerileri (somut: hangi düğme). Ön izleme bulgusu ve render sonrası uyarı aynı metni söyler. */
export const LOOK_FIX = {
  too_dark: "bölümlerin temel notu renkli olsun (color/warm/cool/teal-orange/kodachrome), vinyet ≤0,35, letterbox kapalı, ilgili zemin ve bölüm kartı açık; AI istemleri gündüz ya da aydınlık iç mekân, gece/siluet yalnızca anlatım söylüyorsa",
  desaturated: "soluk not (selective/mono/duotone/sepia/cyanotype/bleach) yalnızca bir vurgu bölümünde ve resimli sahnelerin ≤%15'inde, temel not renkli; arşiv fotoğrafı/klibi soluk nota sokulmasın (monoSource değilse)",
};

/**
 * Görünüş bulguları (saf, ön izleme kapısı): too_dark (parlaklık düşük ya da karanlık kare payı yüksek) ve desaturated
 * (doygunluk düşük). Videonun tamamına ait (scene null): sahne düzeltme planına girmez, raporlanır ve kapıyı "temiz"
 * saymaz; detay somut öneriyi taşır.
 */
export function lookFindings(look, target = LOOK_TARGET) {
  if (!look || look.ok !== false) return [];
  const T = { ...LOOK_TARGET, ...(target || {}) };
  const out = [];
  const low = new Set(look.low || []);
  if (low.has("luma") || low.has("dark")) {
    const bits = [low.has("luma") ? `parlaklık ${Math.round(look.luma)} (hedef ≥${T.luma})` : "", low.has("dark") ? `karanlık kare %${Math.round(look.darkShare * 100)} (hedef ≤%${Math.round(T.darkShare * 100)})` : ""].filter(Boolean).join(", ");
    out.push({ scene: null, time: 0, kind: "too_dark", severity: look.luma < T.luma - 15 || look.darkShare > T.darkShare * 2 ? "high" : "medium", detail: `Video çok karanlık: ${bits}${sceneList(look.darkScenes)} — öneri: ${LOOK_FIX.too_dark}`, fix: "review", source: "look" });
  }
  if (low.has("sat")) {
    out.push({ scene: null, time: 0, kind: "desaturated", severity: look.sat < T.sat * 0.6 ? "high" : "medium", detail: `Video renksiz/siyah-beyaz: doygunluk ${dec1(look.sat)} (hedef ≥${T.sat})${sceneList(look.greyScenes)} — öneri: ${LOOK_FIX.desaturated}`, fix: "review", source: "look" });
  }
  return out;
}

/** Render sonrası kalite uyarısı (saf): hedefin altındaki görünüş için ölçüm satırı + öneri; hedefteyse null. */
export function lookWarning(look) {
  if (!look || look.ok !== false) return null;
  const low = new Set(look.low || []);
  const tips = [low.has("luma") || low.has("dark") ? LOOK_FIX.too_dark : "", low.has("sat") ? LOOK_FIX.desaturated : ""].filter(Boolean);
  return `${look.line} — öneri: ${tips.join("; ")}`;
}

/**
 * Karelerin görünüş ölçüsü (tek ffmpeg çağrısı, ücretsiz): tmp/f_%04d.jpg → 128x72 yuv444p (JPEG tam aralığı → TV aralığı,
 * render edilen mp4'ün signalstats ölçeği) → [{yavg, satavg}]. Okunamayan kare {yavg: null} (lookStats saymaz).
 */
export async function frameLook(tmp, count, ffmpeg) {
  if (!count) return [];
  const out = path.join(tmp, "look.yuv");
  await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-start_number", "1", "-i", path.join(tmp, "f_%04d.jpg"), "-frames:v", String(count), "-vf", `scale=${LOOK_W}:${LOOK_H}:flags=area:in_range=full:out_range=tv,format=yuv444p`, "-f", "rawvideo", out], { timeoutMs: 5 * 60 * 1000 });
  const buf = fs.readFileSync(out);
  const P = LOOK_W * LOOK_H;
  return Array.from({ length: count }, (_, k) => {
    const f = buf.subarray(k * 3 * P, (k + 1) * 3 * P);
    if (f.length < 3 * P) return { yavg: null, satavg: null };
    let y = 0, s = 0;
    for (let i = 0; i < P; i++) {
      y += f[i];
      const u = f[P + i] - 128, v = f[2 * P + i] - 128;
      s += Math.sqrt(u * u + v * v);
    }
    return { yavg: y / P, satavg: s / P };
  });
}

/** 12 karelik kontak sayfaları. */
async function contactSheets(tmp, count, ffmpeg) {
  const sheets = [];
  for (let s = 0; s * PER_SHEET < count; s++) {
    const out = path.join(tmp, `sheet_${s}.jpg`);
    const first = s * PER_SHEET + 1;
    const n = Math.min(PER_SHEET, count - s * PER_SHEET);
    await run(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error", "-start_number", String(first), "-i", path.join(tmp, "f_%04d.jpg"),
      "-frames:v", "1", "-vf", `tile=${COLS}x${ROWS}:padding=6:margin=4:color=white`, "-q:v", "4", out,
    ], { timeoutMs: 2 * 60 * 1000 });
    sheets.push({ file: out, from: first, to: first + n - 1 });
  }
  return sheets;
}

/* ================================================================ görme denetimi */

const QA_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          frame: { type: "integer", description: "Kare numarası (#)" },
          kind: { type: "string", enum: QA_KINDS },
          severity: { type: "string", enum: ["low", "medium", "high"] },
          detail: { type: "string", description: "Kısa Türkçe açıklama: ne yanlış" },
        },
        required: ["frame", "kind", "severity", "detail"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
};

const DEVICE_TR = { headline: "gazete manşeti", map: "harita", board: "dedektif panosu", document: "belge", timeline: "zaman çizelgesi", split: "bölünmüş ekran", quote: "alıntı kartı", counter: "sayaç", chart: "grafik", montage: "montaj", slam: "tek kelime vuruşu", title: "başlık", words: "ekrana gelen cümle", photo: "fotoğraf/görüntü", explainer: "adım adım açıklayıcı şema (konunun motifiyle çizilir; resim yok, kasıtlı)", "ui-card": "arayüz kartı (eğik kart; resim yok, kasıtlı)" };

/*
 * Yazı uygulaması da söylenir (France, 20 Ekim 2026): kapı "yazı yok" deyince sahne yazısız resme geçti (textMode none),
 * ama denetçiye yine "ekrana gelen cümle" dendi — yazısız kare iki turda da "bozuk" sayıldı, render sonrası da.
 */
const WORDS_TR = { key: "anahtar kelime kartı (yalnızca bir-iki kelime, kasıtlı)", none: "yazısız görüntü (anlatım resimle taşınır; yazı yok, kasıtlı)" };

function frameLine(k, x) {
  const s = x.row.s;
  const kind = isCard(s) ? "BÖLÜM KARTI" : (s.type === "words" && WORDS_TR[s.textMode]) || DEVICE_TR[s.type] || s.type;
  // Ara plan karesi (x.ins): sahnenin arşiv fotoğrafı değil, üstüne kesilen AI ara planı görünüyor.
  const src = isCard(s) ? "" : x.ins !== undefined ? " [ara plan: AI görseli]" : s.archived ? (s.video ? " [arşiv klibi]" : " [arşiv fotoğrafı]") : s.bg === "prev" ? " [önceki kare]" : s.image || s.imagePrompt ? " [AI görseli]" : "";
  const ann = s.annotate ? ` (işaret: ${s.annotate.label})` : "";
  // Ekrandaki ad söylenir (Çernobil, 26 Ekim 2026: "ANANENKO" başka adamların resmindeydi): denetçi adın o kişi olup olmadığına bakar.
  // Yazı kartının anahtar kelimesi yazı görünen HER modda söylenir (inceleme, 27 Ekim 2026: Çernobil sahne 12 textMode "full"dü).
  const ad = isCard(s) ? "" : s.name ? ` (isim kartı: ${String(s.name).slice(0, 40)})` : s.type === "words" && s.textMode !== "none" && s.keyword ? ` (ekrandaki söz: ${String(s.keyword).slice(0, 30)})` : "";
  const say = stripTags(s.say);
  return `#${k} ${clock(x.t)}${x.t < HOOK_SEC ? " [KANCA]" : ""} sahne ${x.row.scene === null ? "-" : x.row.scene + 1} · ${kind}${src}${ann}${ad}${say ? ` — "${say.length > 110 ? `${say.slice(0, 107)}…` : say}"` : ""}`;
}

/*
 * AYNI FOTOĞRAF, BAŞKA DOSYA ADI (Kartal Yuvası, 24 Ekim 2026): adıyla alınan Commons dosyası cm-*.jpg, aramadaki kopyası
 * arch-*.jpg olarak kaydedildi (docu-archive-done.json scene-12 / scene-79): aynı kare iki kez ekrana geldi ama dosya yolu
 * farklı olduğu için tekrar sayılmadı.
 * Künye verilirse resmin dosyasıyla eşleşen künyenin kalıcı adresleri (stablePhotoRefs; Commons dosya sayfası da tek
 * fotoğraftır) photoKey ile anahtar olur. Müze sayfası birden çok görünüş taşır: anahtar değil. Künye dosyadan bulunur
 * (docu.js sceneCredit gibi: ses klibi araya girince scene-N sırası kayar; motorun açtığı karanlık resim .lift.jpg olur).
 * Klibin künyesi klibin dosyasını taşır (aynı videonun başka anı başka çekim): klip sahnesinde dosya yolu kalır.
 */
const imageStem = (f) => String(f || "").replace(/\\/g, "/").replace(/(?:\.lift)?\.jpe?g$/i, "");
function photoKeysByFile(credits) {
  const out = new Map();
  for (const c of Object.values(credits || {})) {
    if (!c?.file || c.type === "video") continue;
    const page = c.sayfa ? photoKey(c.sayfa) : "";
    out.set(imageStem(c.file), [...stablePhotoRefs(c).map(photoKey), ...(page.startsWith("wikimedia:") ? [page] : [])].filter(Boolean));
  }
  return out;
}

/**
 * Aynı resmin uzak tekrarları: [{row, first, count}] — ikinci ve sonraki kullanımlar. Bölüm kartı,
 * önceki kareyi taşıyan yazı sahnesi ve videonun son sahnesinin açılış karesine dönüşü (kapanış) sayılmaz.
 * credits (arşiv künyeleri, docu-archive-done.json `credits`; isteğe bağlı): aynı fotoğrafın başka adla kaydedilmiş
 * kopyası da tekrardır.
 */
export function farRepeats(rows, { minGap = REPEAT_WINDOW, credits = null } = {}) {
  const own = (rows || []).filter((x) => x?.s && !isCard(x.s) && x.s.image && !x.s.heldBg && x.s.bg !== "prev");
  const last = own.at(-1);
  const byFile = photoKeysByFile(credits);
  const seen = new Map();
  const out = [];
  for (const x of own) {
    const ks = [String(x.s.image), ...(byFile.get(imageStem(x.s.image)) || [])];
    const prev = ks.map((k) => seen.get(k)).find(Boolean);
    if (!prev) { const e = { first: x, n: 1, lastRow: x }; for (const k of ks) seen.set(k, e); continue; }
    for (const k of ks) if (!seen.has(k)) seen.set(k, prev);
    prev.n++;
    const gap = x.start - prev.lastRow.start;
    // Kapanış: son sahne açılışın (ilk dakika) resmine bir kez döner — bilinçli çerçeve.
    const bookend = x === last && prev.n === 2 && prev.first.start < 60;
    if (gap >= minGap && !bookend) out.push({ row: x, first: prev.first, count: prev.n });
    prev.lastRow = x;
  }
  return out;
}

function visionPrompt(script, batchLines, { preRender = false } = {}) {
  return [
    preRender
      ? `Bir YouTube belgeselini RENDER'DAN ÖNCE denetliyorsun ("${script.title || ""}"${script.era ? `, hikâyenin dönemi: ${script.era}` : ""}): her sahnenin oturmuş anından bir ön izleme karesi — yazılar tamamen görünmüş, görsel yerinde. Burada yakalanan her sorun render'dan önce düzeltilir.`
      : `Bir YouTube belgeselinin render edilmiş videosunu teslimden önce denetliyorsun ("${script.title || ""}"${script.era ? `, hikâyenin dönemi: ${script.era}` : ""}).`,
    "Görseller kontak sayfaları: her sayfada 12 kare, soldan sağa ve yukarıdan aşağıya; kare numaraları sayfa etiketinde. Her karenin zamanı, sahnesi ve o an söylenen anlatım aşağıda.",
    "",
    "YALNIZCA açık sorunları bildir (emin değilsen bildirme):",
    "- text_overflow: ekrandaki yazı kare dışına taşıyor, kesiliyor, üst üste biniyor ya da okunamıyor.",
    "- broken: boş, tamamen siyah/gri, bozuk, yarım yüklenmiş kare ya da yer tutucu/yedek kart. Gece/karanlık çekimler (yağmurlu gece, karanlık orman, silüet) BİLEREK karanlıktır: içinde seçilebilir bir şey varsa bozuk sayma.",
    "- mismatch: görsel anlatımla AÇIKÇA uyuşmuyor (yanlış kişi, yer, nesne, olay). Atmosfer/ara plan kareleri serbesttir.",
    "- anachronism: hikâyenin dönemine ait olmayan insan yapımı şey (modern uçak/araba/telefon/ekran/kıyafet).",
    "- repeat: aynı çekim/fotoğraf kısa arayla (birkaç kare içinde) yeniden görünüyor (aynı sahnenin fazladan karesi ve bölüm kartının arkasındaki resim sayılmaz).",
    "- bad_crop: yüz/baş kesilmiş, konu kadrajın dışında kalmış, aşırı büyütülmüş pikselli tarama. İSİM KARTI (alt yazıda kişi adı) olan karede o kişinin yüzü kadrajda değilse (yalnızca başının üstü, gövdesi ya da arkadaki dekor görünüyorsa) bad_crop, high.",
    "Stilize grafikler BİLEREK böyledir, onları bozuk sayma: bölüm kartı (\"BÖLÜM n\"), sayaç, grafik, harita, gazete manşeti, dedektif panosu, belge, zaman çizelgesi, alıntı kartı, bölünmüş ekran; film greni, duotone renk, vinyet, ışık sızması, siyaha geçiş.",
    // "bir bina" çıktı (inceleme, 27 Ekim 2026): yerin gerçek fotoğrafındaki ad yazısı (Hastings 20261010-989df5, Battle Abbey
    // üstünde "WHERE HAROLD FELL") wrong_face sayılsaydı kendi arşiv resmi yeniden seçilir, PICK_AI_AFTER'dan sonra AI'a düşerdi.
    "- wrong_face: ekranda bir kişinin adı (isim kartı) var ya da anlatım belirli bir kişiyi söylüyor ama karedeki yüz BAŞKA biri (ör. 'JIM BAKKER' yazısı Jerry Falwell'in yüzünde). Ekrandaki büyük AD (isim kartı, tek kelime, altyazı) o kişiyi göstermeyen bir resmin üstündeyse — başka insanlar, AI'ın çizdiği yabancılar — o da wrong_face (ör. 'ANANENKO' yazısı kontrol odasındaki başka mühendislerin üstünde). İnsan göstermeyen bir yerin fotoğrafındaki ad (ör. Battle Abbey üstünde 'WHERE HAROLD FELL') wrong_face değildir.",
    "- generic: [KANCA] işaretli karede anlatım belirli bir kişi/yer/olay söylüyor ama kare jenerik stok (para sayan eller, boş koridor, gökyüzü, şehir silüeti, klavye): izleyici ilk saniyelerde kimin hikâyesi olduğunu görmeli. KANCA dışındaki atmosfer kareleri serbest.",
    "- text_on_face: ekrandaki büyük yazı (başlık, tek kelime, rakam, yazı kartı) bir yüzün gözlerini, burnunu ya da ağzını kapatıyor.",
    "- ai_look: gerçek bir olay anlatılırken kare belli ki yapay zekâ üretimi ve göze batıyor (bozuk el/parmak, anlamsız yazı, plastik yüz, eriyen nesne).",
    "[KANCA] işaretli kareler videonun ilk 60 saniyesi: izleyicinin çoğu burada gidiyor, orada daha titiz ol (göze batan her sorun high).",
    "severity: high = izleyici hemen fark eder/yanıltıcı, medium = belirgin, low = küçük.",
    "",
    "KARELER:",
    ...batchLines,
  ].join("\n");
}

/* ================================================================ sorun birleştirme */

const FIX_OF = { text_overflow: "edit-text", broken: "rerender", black: "rerender", freeze: "rerender", silence: "rerender", loudness: "remaster" };
function fixFor(kind, s) {
  if (["mismatch", "anachronism", "repeat", "bad_crop", "wrong_face", "generic"].includes(kind)) return s?.archived ? "repick" : "review";
  if (kind === "text_on_face") return "edit-text";
  if ((kind === "broken" || kind === "black" || kind === "freeze") && s?.archived && s.video) return "repick";
  return FIX_OF[kind] || "review";
}
const SEV = { low: 0, medium: 1, high: 2 };

/**
 * Render sonrası denetim.
 * @param video   output.mp4
 * @param script  motorun çizdiği senaryo (props: bölüm kartları dahil) ya da engine-script
 * @param placed  [{from, frames}] (30 fps) sahne yerleşimi; yoksa yaklaşık
 * @param llm     test için callVisionJSON yerine
 * @param outFile qa.json yolu (verilirse yazılır)
 * @param cacheFile görme kararlarının önbelleği (iş klasöründe): aynı kontak sayfaları + istem
 *        (aynı video, yarıda kalan denetim, değişmeyen render parçaları) yeniden ödenmez
 * @param skipVision verilirse görme modeli çağrılmaz, nedeni raporlanır (ör. "budget": Claude tavanı doldu)
 * @param credits arşiv künyeleri (isteğe bağlı): uzak tekrar başka adla kaydedilmiş aynı fotoğrafı da bulur
 * @returns {{version, issues, summary, warnings, loudness, frames, sheets, vision, fixable}}
 */
export async function qaVideo({ video, script, placed, settings = {}, usage, logFn = () => {}, ffmpeg, outFile = null, cacheFile = null, skipVision = null, llm = callVisionJSON, model, isCancelled = () => false, killer, durationSec, sample = retentionTimes, extraIssues = [], credits = null } = {}) {
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  const rows = sceneRows(script, placed);
  const duration = durationSec || rows.at(-1)?.end || 0;
  const times = sample(rows, duration);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-docu-qa-"));
  const issues = [];
  const add = (x) => issues.push(x);
  const rowAt = (t) => rows.find((x) => t >= x.start && t < x.end) || rows.at(-1);
  let vision = { calls: 0, frames: 0, skipped: null };
  let loudness = null;
  let look = null;
  try {
    const t0 = Date.now();
    const { text, files, frames } = await analysePass(video, times, tmp, ff, killer);
    if (isCancelled()) throw new Error("cancelled");
    const det = parseDetect(text);
    // Anlar artan sırada ve ≥0,5 sn arayla (kare numaraları benzersiz): k. çıktı k. an.
    // Video beklenenden kısaysa sondaki anların karesi çıkmaz.
    const got = times.slice(0, Math.min(files.length, frames.length));
    logFn(`Kalite denetimi: ${got.length} kare örneklendi (${Math.round((Date.now() - t0) / 1000)} sn)`);

    /* ---- ses ---- */
    if (det.integrated !== null) {
      loudness = { integrated: det.integrated, truePeak: det.truePeak, target: LOUDNESS_TARGET };
      if (Math.abs(det.integrated - LOUDNESS_TARGET) > 1.5) add({ scene: null, time: 0, kind: "loudness", severity: Math.abs(det.integrated - LOUDNESS_TARGET) > 3 ? "high" : "medium", detail: `Ses yüksekliği ${det.integrated.toFixed(1)} LUFS (hedef ${LOUDNESS_TARGET})`, source: "ffmpeg" });
      if (det.truePeak !== null && det.truePeak > -0.5) add({ scene: null, time: 0, kind: "loudness", severity: "medium", detail: `Tepe seviyesi ${det.truePeak.toFixed(1)} dBTP (kırpılma riski)`, source: "ffmpeg" });
    }
    const silences = [...det.silence];
    if (det.openSilence !== null && duration - det.openSilence >= 2.5) silences.push({ start: det.openSilence, end: duration, dur: duration - det.openSilence });
    for (const x of silences) {
      // Videonun son 3 sn'si (kapanış) ve bilinçli "silence" sahneleri hariç.
      if (x.dur < 2.5 || x.start >= duration - 3) continue;
      const row = rowAt(x.start + 0.1);
      if (row?.s?.silence && x.dur < 6) continue;
      add({ scene: row?.scene ?? null, time: +x.start.toFixed(2), kind: "silence", severity: x.dur >= 5 ? "high" : "medium", detail: `${x.dur.toFixed(1)} sn sessizlik`, source: "ffmpeg" });
    }
    /* ---- görüntü ---- */
    for (const b of det.black) {
      if (b.start < 0.3 || b.end > duration - 0.6) continue;
      const row = rowAt(b.start + b.dur / 2);
      add({ scene: row?.scene ?? null, time: +b.start.toFixed(2), kind: "black", severity: b.dur >= 1.5 ? "high" : "medium", detail: `${b.dur.toFixed(1)} sn siyah kare`, fix: fixFor("black", row?.s), source: "ffmpeg" });
    }
    for (const f of det.freeze) {
      const row = rowAt(f.start + 0.1);
      if (!row || f.dur < 5) continue;
      add({ scene: row.scene, time: +f.start.toFixed(2), kind: "freeze", severity: f.dur >= 8 ? "high" : "medium", detail: `${f.dur.toFixed(1)} sn donmuş görüntü`, fix: fixFor("freeze", row.s), source: "ffmpeg" });
    }

    /* ---- uzak tekrar (senaryodan, ücretsiz) ----
     * Aynı resim DOSYASI dakikalar arayla yeniden: Nvidia videosunda (Ekim 2026) Nasdaq fotoğrafı beş sahnede
     * kullanılmıştı; dHash penceresi yalnızca yakın tekrarı görüyordu. Açılış karesine son sahnede dönmek serbest.
     */
    for (const x of farRepeats(rows, { credits })) add({ scene: x.row.scene, time: +x.row.start.toFixed(2), kind: "repeat", severity: x.count >= 3 ? "high" : "medium", detail: `Aynı fotoğraf ${x.count}. kez (ilk: sahne ${x.first.scene === null ? "-" : x.first.scene + 1}, ${Math.round(x.row.start - x.first.start)} sn önce)`, fix: fixFor("repeat", x.row.s), source: "script" });

    /* ---- yakın tekrar (dHash, ücretsiz) ---- */
    let hashes = [];
    try { hashes = await frameHashes(tmp, got.length, ff); } catch (e) { logFn(`Kare özeti çıkarılamadı: ${String(e.message).slice(0, 120)}`); }
    for (const x of nearRepeats(got, hashes)) add(x);

    /* ---- görünüş: parlaklık / doygunluk / karanlık kare (aynı kareler, ücretsiz) ----
     * Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Ekim 2026: luma 52-56, doygunluk 2,5-6 hiçbir denetimde görünmedi.
     * Ölçüm satırı her zaman günlüğe yazılır; hedefin altındaysa kalite uyarısı (qaWarnings).
     */
    try {
      const lf = await frameLook(tmp, got.length, ff);
      look = lookStats(lf.map((f, k) => ({ ...f, scene: got[k]?.row?.scene ?? null })));
      logFn(look.line);
    } catch (e) { logFn(`Görünüş ölçülemedi: ${String(e?.message || e).slice(0, 120)}`); }

    /* ---- görme modeli ---- */
    const seen = await judgeFrames({ tmp, got, script, settings, llm, model, usage, logFn, isCancelled, cacheFile, ff, skipVision });
    vision = seen.vision;
    // Cihazın tekrarı yalnızca bildirilir ("review"): aynı sahnenin senaryo/dHash tekrarı (repick) birleştirmede ezilmez.
    for (const x of seen.issues) if (!(x.device && x.kind === "repeat" && issues.some((i) => i.scene === x.scene && i.kind === "repeat"))) add(x);
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  return finishQa({ issues, extraIssues, duration, loudness, look, times, vision, outFile, logFn });
}

/*
 * İÇERİĞİ YANLIŞ CİHAZ (Kartal Yuvası, 25 Ekim 2026): stilize cihazlarda yalnızca taşma ve bozukluk sayılıyordu. Görme
 * denetimi iki kapı turunda da Almanya'daki Berchtesgaden'i Avusturya bayrağının içinde gösteren haritayı, "BERGHOF: HIS
 * HOME" panelinde Berghof olmayan bölünmüş ekranı, render sonrası da haritayı (high) ve uydurma "CNN" gazetesini buldu —
 * hepsi atıldı: ne düzeltildi ne kullanıcıya söylendi. İçerik taşıyan cihazda uyuşmazlık, yanlış yüz ve AI görünümü stil
 * değil içerik hatasıdır; düzeltmesi cihazın sade görsele dönmesi (docu-preview.js "device-fallback"). Tekrar bildirilir
 * ama düzeltilmez: bölünmüş ekranın paneli önceki sahnenin resmini bilerek taşır (fromScene). Kırpma, dönem ve jenerik
 * bu cihazlarda yine anlamsız; sayaç, grafik, şema gibi cihazlarda da yalnızca taşma ve bozukluk kalır.
 */
export const CONTENT_DEVICES = new Set(["map", "split", "headline", "document", "quote", "board"]);
const DEVICE_KINDS = new Set(["mismatch", "wrong_face", "ai_look", "repeat"]);

/** Modelin bir bulgusu → denetim sorunu; x = got[k] ({t, row}). Sayılmayan bulguda null. */
export function visionIssue(it, x) {
  const s = x?.row?.s;
  if (!s || !QA_KINDS.includes(it?.kind)) return null;
  // Stilize cihazlarda "uyuşmazlık/kırpma" anlamsız: yalnızca taşma ve bozukluk — içerik taşıyan cihazın içerik hatası hariç.
  const styl = isCard(s) || !["photo", "words", "slam", "title", "montage"].includes(s.type);
  const device = styl && !isCard(s) && CONTENT_DEVICES.has(s.type) && DEVICE_KINDS.has(it.kind);
  if (styl && !device && !["text_overflow", "broken"].includes(it.kind)) return null;
  const fix = device ? (it.kind === "repeat" ? "review" : "device-fallback") : fixFor(it.kind, s);
  return { scene: x.row.scene, time: +x.t.toFixed(2), kind: it.kind, severity: SEV[it.severity] !== undefined ? it.severity : "medium", detail: String(it.detail || "").slice(0, 200), fix, source: "vision", ...(device ? { device: true } : {}) };
}

/**
 * GÖRME DENETİMİ — render sonrası denetim ve render öncesi ön izleme (docu-preview.js) ortak: `tmp` içindeki
 * f_0001.jpg… kareleri 12'lik kontak sayfalarına dizip modele sorar; got[k] = {t, row} (k+1. kare). Kararlar
 * kontak sayfası + istem başına önbellekte (cacheFile): aynı sayfa iki kez ödenmez.
 * @returns {{issues: object[], vision: {calls, frames, cached, sheets, skipped}}}
 */
export async function judgeFrames({ tmp, got, script, settings = {}, llm = callVisionJSON, model, usage, logFn = () => {}, isCancelled = () => false, cacheFile = null, ff = "ffmpeg", skipVision = null, preRender = false }) {
  const issues = [];
  const add = (x) => issues.push(x);
  const vision = { calls: 0, frames: 0, skipped: null };
  const canCall = !skipVision && settings.docuQaVision !== false && (llm !== callVisionJSON || settings.anthropicKey);
  if (!canCall) vision.skipped = skipVision || (settings.docuQaVision === false ? "disabled" : "no-key");
  else if (got.length) {
    {
      const sheets = await contactSheets(tmp, got.length, ff);
      const memo = (cacheFile && readJson(cacheFile, null)) || {};
      if (memo.version !== QA_VERSION) { memo.version = QA_VERSION; memo.calls = {}; }
      memo.calls ||= {};
      vision.cached = 0;
      for (let k = 0; k < sheets.length; k += SHEETS_PER_CALL) {
        if (isCancelled()) throw new Error("cancelled");
        const part = sheets.slice(k, k + SHEETS_PER_CALL);
        const lines = [];
        for (const sh of part) for (let n = sh.from; n <= sh.to; n++) lines.push(frameLine(n, got[n - 1]));
        try {
          const mdl = model || settings.docuQaModel || QA_MODEL;
          const prompt = visionPrompt(script, lines, { preRender });
          const imgs = part.map((sh) => ({ etiket: `Kontak sayfası: kareler #${sh.from}–#${sh.to}`, data: fs.readFileSync(sh.file).toString("base64"), mediaType: "image/jpeg" }));
          const ck = crypto.createHash("sha1").update(JSON.stringify([mdl, prompt, imgs.map((im) => [im.etiket, crypto.createHash("sha1").update(im.data).digest("hex")])])).digest("hex");
          const hit = memo.calls[ck];
          const res = hit ? { issues: hit.issues } : await llm({
            system: "Sen titiz bir belgesel kurgu denetçisisin. Yalnızca istenen JSON'u döndür.",
            user: prompt,
            schema: QA_SCHEMA,
            images: imgs,
            model: mdl,
            maxTokens: 4000,
            usage,
            logFn,
            isCancelled,
          });
          if (hit) vision.cached++;
          else {
            vision.calls++;
            memo.calls[ck] = { at: new Date().toISOString(), issues: Array.isArray(res?.issues) ? res.issues : [] };
            // Eski kararlar sınırlı: son 60 istek.
            const ks = Object.keys(memo.calls);
            if (ks.length > 60) for (const eski of ks.sort((a, b) => String(memo.calls[a].at).localeCompare(String(memo.calls[b].at))).slice(0, ks.length - 60)) delete memo.calls[eski];
            if (cacheFile) writeJson(cacheFile, memo);
          }
          vision.frames += lines.length;
          for (const it of res?.issues || []) {
            const x = visionIssue(it, got[it.frame - 1]);
            if (x) add(x);
          }
        } catch (e) {
          if (e?.message === "cancelled" || isCancelled()) throw e;
          vision.skipped = noCredit(e) ? "no-credit" : "error";
          logFn(`Görsel kalite denetimi durdu (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 140)}) — yalnızca ses/görüntü ölçümleri raporlanıyor`);
          break;
        }
      }
      vision.sheets = sheets.length;
    }
  }
  return { issues, vision };
}

/** Bulguları birleştirir (aynı sahne + tür: en ağırı), özetler ve qa.json'a yazar. */
function finishQa({ issues, extraIssues, duration, loudness, look = null, times, vision, outFile, logFn }) {
  // Zaman çizelgesi eleştirmeninin bulguları (docu-critic.js, ücretsiz) aynı listeye girer.
  for (const x of extraIssues || []) if (x?.kind) issues.push(x);
  // Aynı sahne + aynı tür: en ağır olan kalır.
  const merged = new Map();
  for (const x of issues) {
    const k = `${x.scene ?? `t${Math.round(x.time)}`}|${x.kind}`;
    const prev = merged.get(k);
    if (!prev || SEV[x.severity] > SEV[prev.severity]) merged.set(k, { ...x, fix: x.fix || FIX_OF[x.kind] || "review" });
  }
  const list = [...merged.values()].sort((a, b) => a.time - b.time);
  const result = {
    version: QA_VERSION,
    checkedAt: new Date().toISOString(),
    durationSec: +duration.toFixed(2),
    loudness,
    // Görünüş ölçüsü (lookStats): {frames, luma, sat, darkShare, ok, low, darkScenes, greyScenes, line}; ölçülemediyse null.
    look,
    frames: times.length,
    vision,
    issues: list,
    fixable: qaFixPlan({ issues: list }),
  };
  result.summary = qaSummary(result);
  result.warnings = qaWarnings(result);
  if (outFile) writeJson(outFile, result);
  logFn(result.summary);
  return result;
}

/* ================================================================ özet */

/** Kısa Türkçe özet (tek satır). */
export function qaSummary(qa) {
  const list = qa.issues || [];
  const lufs = qa.loudness?.integrated;
  const ses = Number.isFinite(lufs) ? ` · ses ${lufs.toFixed(1).replace(".", ",")} LUFS` : "";
  const gorme = qa.vision?.skipped ? ` (görsel denetim yapılmadı: ${{ "no-key": "Anthropic anahtarı yok", "no-credit": "Anthropic kredisi yok", disabled: "kapalı", error: "hata", budget: "bu videonun Claude harcama tavanı doldu" }[qa.vision.skipped] || qa.vision.skipped})` : "";
  if (!list.length) return `Otomatik kalite denetimi: sorun bulunmadı${ses}${gorme}.`;
  const by = {};
  for (const x of list) (by[x.kind] ||= []).push(x);
  const parts = Object.entries(by).map(([k, xs]) => {
    const sc = [...new Set(xs.map((x) => x.scene).filter((v) => v !== null))].slice(0, 5).map((v) => v + 1);
    return `${xs.length} ${KIND_TR[k] || k}${sc.length ? ` (sahne ${sc.join(", ")}${xs.length > 5 ? "…" : ""})` : ""}`;
  });
  return `Otomatik kalite denetimi: ${list.length} sorun — ${parts.join("; ")}${ses}${gorme}.`;
}

/** İşin kalite uyarılarına girecek satırlar: özet + en ağır birkaç sorun. */
export function qaWarnings(qa) {
  // Görünüş hedefin altındaysa (Gimli / Kartal Yuvası, 29 Ekim 2026) sorun listesi boş olsa da uyarı olur.
  const look = lookWarning(qa.look);
  const tail = look ? [look] : [];
  const list = (qa.issues || []).filter((x) => x.severity !== "low");
  if (!list.length) return [...(qa.vision?.skipped && qa.vision.skipped !== "disabled" ? [qaSummary(qa)] : []), ...tail];
  const top = [...list].sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.time - b.time).slice(0, 5);
  return [qaSummary(qa), ...top.map((x) => `QA ${clock(x.time)}${x.scene !== null ? ` sahne ${x.scene + 1}` : ""}: ${KIND_TR[x.kind] || x.kind} — ${x.detail}${x.fix && x.fix !== "review" ? ` (öneri: ${x.fix})` : ""}`), ...tail];
}

/** Otomatik düzeltmeye girecek sahneler: "repick" + en az orta ağırlık. En çok 12. */
export function qaFixPlan(qa, max = 12) {
  const out = [];
  for (const x of qa.issues || []) {
    if (x.fix !== "repick" || x.scene === null || SEV[x.severity] < 1 || out.some((o) => o.scene === x.scene)) continue;
    out.push({ scene: x.scene, kind: x.kind, detail: x.detail });
  }
  return out.slice(0, max);
}

/* ================================================================ otomatik düzeltme yardımcıları */

// docu-archive.js resolveArchive'daki önbellek anahtarıyla AYNI türetme (değişirse test yakalar).
export const ARCHIVE_TYPES = new Set(["photo", "title", "words", "slam", "headline", "document", "quote"]);
const aHash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const aStrip = (t) => String(t || "").replace(/\[[^\]]*\]\s*/g, "").trim();

/** Arşiv önbelleğinde sahnelerin anahtarları: [{i, key, vkey}] (montaj kareleri hariç). */
export function archiveKeys(docu) {
  const scenes = docu.scenes || [];
  const frames = scenes.flatMap((s, i) => (s.imagePrompts || []).map((p, k) =>
    p && typeof p === "object" && (p.source === "archive" || p.source === "stock") && p.search && (s.type === "montage" || p.media === "video")
      ? { s: { type: "photo", source: p.source, search: p.search, say: s.say }, i: `${i}-m${k}` } : null).filter(Boolean));
  const seen = new Map();
  return [...scenes.map((s, i) => ({ s, i })), ...frames]
    .filter(({ s }) => (s.source === "archive" || s.source === "stock") && s.search && ARCHIVE_TYPES.has(s.type))
    .map(({ s, i }) => {
      const temel = aHash(`${s.search}|${aStrip(s.say)}`);
      const n = seen.get(temel) || 0;
      seen.set(temel, n + 1);
      const key = n ? aHash(`${temel}#${n}`) : temel;
      return { i, key, vkey: `v-${key}` };
    });
}

/**
 * QA'nın "repick" dediği sahnelerin arşiv/klip kararlarını önbellekten siler; bir
 * sonraki arşiv geçişi yalnızca bunları yeniden arar (diğerleri önbellekten, ücretsiz).
 * @returns silinen kayıt sayısı
 */
/** A picture shown as a card on the backdrop (print presentation, a square or strip fitted whole). */
export const cardedFrame = (s) => !!s?.present || (s?.imgW > 0 && s?.imgH > 0 && s.fit !== "cover" && (s.imgW / s.imgH < 1.45 || s.imgW / s.imgH > 2.3));
/** May two frames be "the same picture" by their hash? Two different cards share the backdrop: only the same file counts. */
export const sameFrameCandidate = (a, b) => !((cardedFrame(a) || cardedFrame(b)) && a?.image !== b?.image);

export function invalidateArchivePicks(dir, docu, sceneIdxs) {
  const file = path.join(dir, "docu-archive.json");
  const cache = readJson(file, null);
  if (!cache) return 0;
  const want = new Set(sceneIdxs);
  let n = 0;
  for (const t of archiveKeys(docu)) {
    if (!want.has(t.i)) continue;
    // Kayıt silinir; seçilen kaynak o sahnenin "uygun değil" listesine girer (yeniden seçim ona dönmez).
    for (const k of [t.key, t.vkey]) if (forgetCachedPick(cache, k)) n++;
  }
  writeJson(file, cache);
  try { fs.rmSync(path.join(dir, "docu-archive-done.json"), { force: true }); } catch {}
  return n;
}

/**
 * Reddedilen kaynak yeniden seçildiyse (aynı fotoğraf/klip adresi) sahne AI görseline
 * düşer: aynı yanlış kareyi ikinci kez göstermek, canlandırmadan kötüdür. Yerinde değişir.
 * @param fixes {scenes: {[i]: {rejected: [url]}}}
 * @returns AI'a düşürülen sahne sayısı
 */
/**
 * Arşivde artık aranmayacak sahneler: ön izleme kapısı aynı sahnede PICK_AI_AFTER kez yanlış kare buldu (France,
 * 20 Ekim 2026: okul kapısı polisi için önce Filipin, sonra Sırp, sonra ABD polisi geldi; her yeniden seçim yeni bir
 * yanlış kareydi). Sahne anlatımla güçlendirilmiş istemle AI görseline kalır; arşiv seçicisi o sahneye para harcamaz.
 */
export const PICK_AI_AFTER = 2;
export const qaAiOnly = (fixes) => Object.entries(fixes?.scenes || {}).filter(([, f]) => f?.ai).map(([k]) => +k);

export function applyQaRejections(docu, credits, fixes, logFn = () => {}) {
  let n = 0;
  for (const [k, f] of Object.entries(fixes?.scenes || {})) {
    const i = +k;
    const s = docu.scenes[i];
    const c = credits?.[`scene-${i}`];
    // Aynı kaynak: aynı dosya ya da (tek fotoğraflık stok sayfasında) aynı sayfa — Pixabay'in dosya adresi her aramada değişir.
    const own = new Set(stablePhotoRefs(c).map(photoKey));
    if (!s?.archived || !c || !(f.ai || (f.rejected || []).some((u) => u && own.has(photoKey(u))))) continue;
    for (const x of ["image", "imgW", "imgH", "video", "videoStart", "videoDur", "videoW", "videoH", "archived", "focus", "name", "role"]) delete s[x];
    delete credits[`scene-${i}`];
    n++;
    logFn(f.ai ? `Sahne ${i + 1}: arşiv ${PICK_AI_AFTER} kez yanlış kare verdi — sahne AI görseline çevrildi` : `Sahne ${i + 1}: kalite denetiminin reddettiği kaynak yeniden seçildi — sahne AI görseline çevrildi`);
  }
  return n;
}

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
// geçersiz sayılır), "rerender", "edit-text", "remaster", "review".
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

export const QA_VERSION = "docu-qa-1";
export const QA_MODEL = "claude-sonnet-5-5";
const FPS = 30;
/** Kontak sayfası: 4x3 kare, her biri 480x270. */
const COLS = 4, ROWS = 3, PER_SHEET = COLS * ROWS, TILE_W = 480, TILE_H = 270;
const SHEETS_PER_CALL = 6;
const EXTRA_EVERY = 20;
const MAX_FRAMES = 420;
export const LOUDNESS_TARGET = -14;
const REPEAT_WINDOW = 30;

export const QA_KINDS = ["text_overflow", "broken", "mismatch", "anachronism", "repeat", "bad_crop"];
const KIND_TR = {
  text_overflow: "yazı taşması", broken: "bozuk/boş kare", mismatch: "anlatımla uyuşmayan görsel", anachronism: "dönem hatası",
  repeat: "yakın tekrar", bad_crop: "kötü kırpma", black: "siyah kare", freeze: "donmuş görüntü", silence: "uzun sessizlik", loudness: "ses yüksekliği",
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

/** Karelerin 9x8 gri özeti (tek ffmpeg çağrısı) → dHash + ortalama parlaklık. */
async function frameHashes(tmp, count, ffmpeg) {
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

function frameLine(k, x) {
  const s = x.row.s;
  const kind = isCard(s) ? "BÖLÜM KARTI" : DEVICE_TR[s.type] || s.type;
  const src = isCard(s) ? "" : s.archived ? (s.video ? " [arşiv klibi]" : " [arşiv fotoğrafı]") : s.bg === "prev" ? " [önceki kare]" : s.image || s.imagePrompt ? " [AI görseli]" : "";
  const ann = s.annotate ? ` (işaret: ${s.annotate.label})` : "";
  const say = stripTags(s.say);
  return `#${k} ${clock(x.t)} sahne ${x.row.scene === null ? "-" : x.row.scene + 1} · ${kind}${src}${ann}${say ? ` — "${say.length > 110 ? `${say.slice(0, 107)}…` : say}"` : ""}`;
}

function visionPrompt(script, batchLines) {
  return [
    `Bir YouTube belgeselinin render edilmiş videosunu teslimden önce denetliyorsun ("${script.title || ""}"${script.era ? `, hikâyenin dönemi: ${script.era}` : ""}).`,
    "Görseller kontak sayfaları: her sayfada 12 kare, soldan sağa ve yukarıdan aşağıya; kare numaraları sayfa etiketinde. Her karenin zamanı, sahnesi ve o an söylenen anlatım aşağıda.",
    "",
    "YALNIZCA açık sorunları bildir (emin değilsen bildirme):",
    "- text_overflow: ekrandaki yazı kare dışına taşıyor, kesiliyor, üst üste biniyor ya da okunamıyor.",
    "- broken: boş, tamamen siyah/gri, bozuk, yarım yüklenmiş kare ya da yer tutucu/yedek kart. Gece/karanlık çekimler (yağmurlu gece, karanlık orman, silüet) BİLEREK karanlıktır: içinde seçilebilir bir şey varsa bozuk sayma.",
    "- mismatch: görsel anlatımla AÇIKÇA uyuşmuyor (yanlış kişi, yer, nesne, olay). Atmosfer/ara plan kareleri serbesttir.",
    "- anachronism: hikâyenin dönemine ait olmayan insan yapımı şey (modern uçak/araba/telefon/ekran/kıyafet).",
    "- repeat: aynı çekim/fotoğraf kısa arayla (birkaç kare içinde) yeniden görünüyor (aynı sahnenin fazladan karesi ve bölüm kartının arkasındaki resim sayılmaz).",
    "- bad_crop: yüz/baş kesilmiş, konu kadrajın dışında kalmış, aşırı büyütülmüş pikselli tarama.",
    "Stilize grafikler BİLEREK böyledir, onları bozuk sayma: bölüm kartı (\"BÖLÜM n\"), sayaç, grafik, harita, gazete manşeti, dedektif panosu, belge, zaman çizelgesi, alıntı kartı, bölünmüş ekran; film greni, duotone renk, vinyet, ışık sızması, siyaha geçiş.",
    "severity: high = izleyici hemen fark eder/yanıltıcı, medium = belirgin, low = küçük.",
    "",
    "KARELER:",
    ...batchLines,
  ].join("\n");
}

/* ================================================================ sorun birleştirme */

const FIX_OF = { text_overflow: "edit-text", broken: "rerender", black: "rerender", freeze: "rerender", silence: "rerender", loudness: "remaster" };
function fixFor(kind, s) {
  if (["mismatch", "anachronism", "repeat", "bad_crop"].includes(kind)) return s?.archived ? "repick" : "review";
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
 * @returns {{version, issues, summary, warnings, loudness, frames, sheets, vision, fixable}}
 */
export async function qaVideo({ video, script, placed, settings = {}, usage, logFn = () => {}, ffmpeg, outFile = null, cacheFile = null, skipVision = null, llm = callVisionJSON, model, isCancelled = () => false, killer, durationSec } = {}) {
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  const rows = sceneRows(script, placed);
  const duration = durationSec || rows.at(-1)?.end || 0;
  const times = sampleTimes(rows, duration);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-docu-qa-"));
  const issues = [];
  const add = (x) => issues.push(x);
  const rowAt = (t) => rows.find((x) => t >= x.start && t < x.end) || rows.at(-1);
  let vision = { calls: 0, frames: 0, skipped: null };
  let loudness = null;
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

    /* ---- yakın tekrar (dHash, ücretsiz) ---- */
    let hashes = [];
    try { hashes = await frameHashes(tmp, got.length, ff); } catch (e) { logFn(`Kare özeti çıkarılamadı: ${String(e.message).slice(0, 120)}`); }
    const picture = (s) => s && !isCard(s) && ["photo", "words", "slam"].includes(s.type) && s.bg !== "prev" && !s.heldBg;
    const flaggedRepeat = new Set();
    got.forEach((a, i) => {
      if (!a.mid || !picture(a.row.s) || !hashes[i]?.hash || hashes[i].luma < 25) return;
      for (let j = i + 1; j < got.length; j++) {
        const b = got[j];
        if (b.t - a.t > REPEAT_WINDOW) break;
        if (!b.mid || b.row.r === a.row.r || !picture(b.row.s) || !hashes[j]?.hash || hashes[j].luma < 25) continue;
        // Aynı resmi bilerek taşıyan komşu (ör. klibin durağan karesi) sayılmaz.
        if (b.row.r === a.row.r + 1 && b.row.s.image && b.row.s.image === a.row.s.image && !b.row.s.video) continue;
        if (!ayniFotograf(hashes[i].hash, hashes[j].hash) || flaggedRepeat.has(b.row.r)) continue;
        flaggedRepeat.add(b.row.r);
        add({ scene: b.row.scene, time: +b.t.toFixed(2), kind: "repeat", severity: "medium", detail: `Sahne ${a.row.scene === null ? "-" : a.row.scene + 1} ile aynı kare (${Math.round(b.t - a.t)} sn arayla)`, fix: fixFor("repeat", b.row.s), source: "dhash" });
      }
    });

    /* ---- görme modeli ---- */
    const canCall = !skipVision && settings.docuQaVision !== false && (llm !== callVisionJSON || settings.anthropicKey);
    if (!canCall) vision.skipped = skipVision || (settings.docuQaVision === false ? "disabled" : "no-key");
    else if (got.length) {
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
          const prompt = visionPrompt(script, lines);
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
            const x = got[it.frame - 1];
            if (!x || !QA_KINDS.includes(it.kind)) continue;
            // Stilize cihazlarda "uyuşmazlık/kırpma" anlamsız: yalnızca taşma ve bozukluk.
            const styl = isCard(x.row.s) || !["photo", "words", "slam", "title", "montage"].includes(x.row.s.type);
            if (styl && !["text_overflow", "broken"].includes(it.kind)) continue;
            add({ scene: x.row.scene, time: +x.t.toFixed(2), kind: it.kind, severity: SEV[it.severity] !== undefined ? it.severity : "medium", detail: String(it.detail || "").slice(0, 200), fix: fixFor(it.kind, x.row.s), source: "vision" });
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
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }

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
  const list = (qa.issues || []).filter((x) => x.severity !== "low");
  if (!list.length) return qa.vision?.skipped && qa.vision.skipped !== "disabled" ? [qaSummary(qa)] : [];
  const top = [...list].sort((a, b) => SEV[b.severity] - SEV[a.severity] || a.time - b.time).slice(0, 5);
  return [qaSummary(qa), ...top.map((x) => `QA ${clock(x.time)}${x.scene !== null ? ` sahne ${x.scene + 1}` : ""}: ${KIND_TR[x.kind] || x.kind} — ${x.detail}${x.fix && x.fix !== "review" ? ` (öneri: ${x.fix})` : ""}`)];
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
export function applyQaRejections(docu, credits, fixes, logFn = () => {}) {
  let n = 0;
  for (const [k, f] of Object.entries(fixes?.scenes || {})) {
    const i = +k;
    const s = docu.scenes[i];
    const c = credits?.[`scene-${i}`];
    if (!s?.archived || !c || !(f.rejected || []).some((u) => u && u === c.url)) continue;
    for (const x of ["image", "imgW", "imgH", "video", "videoStart", "videoDur", "videoW", "videoH", "archived", "focus", "name", "role"]) delete s[x];
    delete credits[`scene-${i}`];
    n++;
    logFn(`Sahne ${i + 1}: kalite denetiminin reddettiği kaynak yeniden seçildi — sahne AI görseline çevrildi`);
  }
  return n;
}

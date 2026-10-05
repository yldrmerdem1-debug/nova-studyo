// RESİMDEN VİDEO (Replicate) — Shorts'ta durağan bir resmi ~5 sn'lik gerçek harekete çevirir:
// dalga vurur, sis akar, kalabalık kıpırdar, kamera yavaşça ilerler. Varsayılan model Kling 2.5
// Turbo Pro (dikey resim → dikey klip); ayardan değiştirilebilir (replicateVideoModel).
//
// Akış: resim 9:16'ya kırpılıp küçültülür → Replicate Files API'ye yüklenir → tahmin açılır →
// bitene kadar sorulur (Replicate'in istediği aralıkla) → mp4 indirilir. Aynı resim + hareket
// tarifi + model bir kez ödenir (önbellek: <dir>/<hash>.mp4).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const API = "https://api.replicate.com/v1";
export const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v2.5-turbo-pro";

/** Modelin girdi alanları: başlangıç resmi, süre ve olumsuz tarif her modelde başka adla. */
export function videoInput(model, { image, prompt, negative = "", duration = 5 }) {
  const m = String(model || DEFAULT_VIDEO_MODEL);
  if (/kling/.test(m)) return { start_image: image, prompt, duration: duration > 7 ? 10 : 5, negative_prompt: negative, ...(/v2\.1$/.test(m) ? { mode: "pro" } : {}) };
  if (/seedance/.test(m)) return { image, prompt, duration: duration > 7 ? 10 : 5, resolution: "1080p", camera_fixed: false };
  if (/hailuo/.test(m)) return { first_frame_image: image, prompt, duration: 6, resolution: "1080p", prompt_optimizer: false };
  if (/veo/.test(m)) return { image, prompt, duration: 8, resolution: "1080p", aspect_ratio: "9:16", generate_audio: false, ...(negative ? { negative_prompt: negative } : {}) };
  if (/wan/.test(m)) return { image, prompt, resolution: "720p", num_frames: 81, frames_per_second: 16, interpolate_output: true };
  return { image, prompt };
}

/** Her hareketli planın ortak yasakları: yazı, yüz bozulması, sarsıntı, çizgi film. */
export const MOTION_NEGATIVE = "text, captions, subtitles, watermark, logo, morphing, warping faces, distorted hands, extra limbs, flicker, fast camera shake, zoom burst, cartoon, anime, CGI look, modern objects";

/**
 * Bir cümlenin resmine hareket tarifi: sahnedeki doğal hareket + tek, yavaş bir kamera hareketi.
 * `motion` (plan yazdıysa) önce gelir; yoksa resim tarifinden çıkarılır.
 */
export function motionPrompt({ motion = "", picture = "", say = "", opening = false } = {}) {
  const what = String(motion || "").trim() || `${String(picture || say).trim().replace(/\.$/, "")}; natural subtle movement in the scene (cloth, smoke, water, light, people breathing and shifting)`;
  const cam = opening ? "a slow, deliberate cinematic push-in" : "one slow, steady camera move";
  return `${what}. ${cam}. Realistic physics, photographic, period-accurate, the same lighting and grade as the first frame, no new objects or people appear, faces stay stable.`;
}

const sha = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 16);

/** Başlangıç resmi: 9:16 pencere, en fazla 1080x1920, JPEG — yükleme küçük, kadraj doğru. */
export function startFrame(ffmpeg, abs, crop) {
  const tmp = path.join(os.tmpdir(), `nova-i2v-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`);
  const vf = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=1080:1920:flags=lanczos` : "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920";
  const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-i", abs, "-vf", vf, "-frames:v", "1", "-q:v", "3", tmp], { encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(tmp)) throw new Error(`başlangıç karesi hazırlanamadı: ${String(r.stderr).slice(-200)}`);
  return tmp;
}

async function upload(file, key, fetchFn) {
  const form = new FormData();
  form.append("content", new Blob([fs.readFileSync(file)], { type: "image/jpeg" }), path.basename(file));
  const r = await fetchFn(`${API}/files`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  if (r.status === 401 || r.status === 403) throw new Error("Replicate anahtarı geçersiz");
  if (!r.ok) throw new Error(`Replicate dosya yükleme HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const url = j?.urls?.get;
  if (!url) throw new Error("Replicate dosya adresi dönmedi");
  return url;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Bir resmi hareketli klibe çevirir. Dönen: { file, w, h, dur } (mp4, sessiz kullanılır).
 * Önbellekteyse istek atılmaz. Bakiye bitince `quota: true` hatası (çağıran durur, sessizce
 * durağana düşmez — kullanıcı bilsin).
 */
export async function imageToVideo({ abs, crop = null, prompt, negative = MOTION_NEGATIVE, duration = 5, dir, settings = {}, ffmpeg = "ffmpeg", logFn = () => {}, fetchFn = (...a) => fetch(...a), timeoutMs = 12 * 60e3, cachedOnly = false }) {
  const key = settings.replicateKey;
  if (!key) throw new Error("Replicate anahtarı yok — Ayarlar'dan ekleyin");
  const model = settings.replicateVideoModel || DEFAULT_VIDEO_MODEL;
  fs.mkdirSync(dir, { recursive: true });
  const frame = startFrame(ffmpeg, abs, crop);
  try {
    const id = sha([fs.readFileSync(frame).toString("base64"), prompt, negative, model, duration].join("|"));
    const out = path.join(dir, `i2v-${id}.mp4`);
    if (fs.existsSync(out) && fs.statSync(out).size > 10000) return { file: out, ...probe(ffmpeg, out), cached: true };
    // After an empty-balance answer only clips already paid for are used (no more requests, no rate-limit waits).
    if (cachedOnly) return null;
    const image = await upload(frame, key, fetchFn);
    const input = videoInput(model, { image, prompt, negative, duration });
    let p = null;
    // A low-balance account gets ~6 requests a minute (and a long video's depth layers share them): wait up to 6 min.
    const until = Date.now() + 6 * 60e3;
    for (let attempt = 0; Date.now() < until && !p; attempt++) {
      const r = await fetchFn(`${API}/models/${model}/predictions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
      if (r.status === 402) throw Object.assign(new Error("Replicate bakiyesi yetersiz (402) — replicate.com/account/billing"), { quota: true });
      if (r.status === 429) {
        const wait = Math.min(60, Number((await r.json().catch(() => ({})))?.retry_after) || 10);
        logFn(`Replicate hız sınırı, ${wait} sn bekleniyor`);
        await sleep(wait * 1000);
        continue;
      }
      if (!r.ok) throw new Error(`Replicate ${model} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
      p = await r.json();
    }
    if (!p) throw new Error(`Replicate ${model}: istek kabul edilmedi (hız sınırı)`);
    const started = Date.now();
    while (!["succeeded", "failed", "canceled"].includes(p.status)) {
      if (Date.now() - started > timeoutMs) throw new Error(`Replicate ${model}: zaman aşımı`);
      await sleep(4000);
      const r = await fetchFn(p.urls.get, { headers: { Authorization: `Bearer ${key}` } });
      if (r.ok) p = await r.json();
    }
    if (p.status !== "succeeded") {
      const msg = String(p.error || p.status);
      throw Object.assign(new Error(`Replicate ${model}: ${msg.slice(0, 200)}`), { moderation: /sensitive|nsfw|safety|flagged/i.test(msg) });
    }
    const url = Array.isArray(p.output) ? p.output[0] : p.output;
    const r = await fetchFn(url);
    if (!r.ok) throw new Error(`Replicate klibi indirilemedi (${r.status})`);
    const tmp = `${out}.part`;
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    fs.renameSync(tmp, out);
    logFn(`Replicate klip hazır (${((Date.now() - started) / 1000).toFixed(0)} sn): ${path.basename(out)}`);
    return { file: out, ...probe(ffmpeg, out), cached: false };
  } finally {
    fs.rmSync(frame, { force: true });
  }
}

/** Klibin boyutu ve süresi (ffmpeg -i çıktısından). */
export function probe(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const s = String(r.stderr || "");
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(s);
  const z = /, (\d{2,5})x(\d{2,5})[, ]/.exec(s);
  return { dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, w: z ? +z[1] : 0, h: z ? +z[2] : 0 };
}

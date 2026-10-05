// RESİMDEN VİDEO (Kling, doğrudan API) — replicate-video.js'in imageToVideo'suyla aynı arayüz.
// Açılış (Shorts'un ilk cümleleri, belgeselin açılışı) Kling 3.0 1080p: izleyici orada tutulur ya da
// kaydırır. Açılış dışı hareket ucuz Kling 2.5 Turbo 720p (fiyat/performans). İstemci motorla ortak:
// docu-engine/lib/kling.mjs (paketli uygulamada resources/docu-engine).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startFrame, probe, MOTION_NEGATIVE } from "./replicate-video.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let client = null;
/** The engine's Kling client (one implementation for the engine and Nova). */
export async function klingClient() {
  if (client) return client;
  const packaged = process.resourcesPath && path.join(process.resourcesPath, "docu-engine", "lib", "kling.mjs");
  const file = packaged && fs.existsSync(packaged) ? packaged : path.join(ROOT, "docu-engine", "lib", "kling.mjs");
  client = await import(pathToFileURL(file).href);
  return client;
}

/** Which Kling model and resolution a clip gets: openings the best, the rest the cheap one. */
export function klingPlan({ opening = false, settings = {} } = {}) {
  return opening
    ? { model: settings.klingOpeningModel || "kling-3.0", resolution: settings.klingOpeningResolution || "1080p" }
    : { model: settings.klingModel || "kling-2.5-turbo", resolution: settings.klingResolution || "720p" };
}

const sha = (x) => crypto.createHash("sha1").update(x).digest("hex").slice(0, 16);

/**
 * Bir resmi hareketli klibe çevirir (Kling). Dönen: { file, w, h, dur, cached }. Önbellekteyse istek
 * atılmaz; paket bitince `quota: true` hatası (çağıran kalan cümleleri durağan bırakır).
 */
export async function klingImageToVideo({ abs, crop = null, prompt, negative = MOTION_NEGATIVE, duration = 5, opening = false, dir, settings = {}, ffmpeg = "ffmpeg", logFn = () => {}, fetchFn = (...a) => fetch(...a), cachedOnly = false }) {
  const key = settings.klingKey;
  if (!key) throw new Error("Kling anahtarı yok — Ayarlar'dan ekleyin");
  const { model, resolution } = klingPlan({ opening, settings });
  const kling = await klingClient();
  const secs = kling.klingDuration(duration, model);
  fs.mkdirSync(dir, { recursive: true });
  const frame = startFrame(ffmpeg, abs, crop);
  try {
    const b64 = fs.readFileSync(frame).toString("base64");
    const id = sha([b64, prompt, negative, model, resolution, secs].join("|"));
    const out = path.join(dir, `kling-${id}.mp4`);
    if (fs.existsSync(out) && fs.statSync(out).size > 10000) return { file: out, ...probe(ffmpeg, out), cached: true };
    if (cachedOnly) return null;
    logFn(`Kling: ${path.basename(abs)} → ${model} ${resolution}, ${secs} sn`);
    const buf = await kling.klingImageToVideo({ key, image: b64, prompt, negative, duration: secs, resolution, model, taskId: `nova-${id}`, fetchFn, logFn });
    const tmp = `${out}.part`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, out);
    return { file: out, ...probe(ffmpeg, out), cached: false };
  } finally {
    fs.rmSync(frame, { force: true });
  }
}

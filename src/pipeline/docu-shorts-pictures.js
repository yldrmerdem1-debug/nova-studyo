// SHORTS — PICTURE MODE. The teaser is its own production, not a cut-down: every sentence gets a full
// screen vertical picture from the documentary's own picture archive (archive photos, paintings, AI
// stills, footage), cropped on its subject, with a slow camera; a sentence nothing fits gets a new
// vertical picture. Numbers land as big type on the picture when they are said, never as a dark card.
// User (1453 Short): "görüntüleri illa yapılan videodan seçmek zorunda değil, shorts videosu da
// kaliteli olmalı ... saçma sapan görseller yine gelmiş".
//
//   pictureAssets(jobDir)                         -> every usable picture of the job (deduplicated)
//   describePictures({ assets, cacheFile, ... })  -> what each one really shows (vision), cached
//   planPictureTeaser({ cues, title, catalog, ... })
//   renderPictureTeaser({ segments, ... })
import { dropSellBeats, shortGrowthLines, shortHookLines, shortOpeningPlan } from "./growth-lessons.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callJSON, callVisionJSON } from "../llm.js";
import { openAIImagesProvider } from "./openai-images.js";
import { commonsFile, donemYili, hikayeDonemi } from "./docu-archive.js";
import { subjectWords } from "./docu-package.js";
import { fetchJson } from "../util.js";
import { SHORT_LOOKS, flashColour, pictureFilter } from "./docu-shorts-looks.js";
import { ATIF_ISTER, TOPLU, cut, klipMi, klipSahibi, kutuKunyesi, saglayiciAdi, yazarAdi } from "./kunye.js";

/** One Short is one ffmpeg encode: cap x264 below the core count (test/kodlayici-bellek: no uncapped libx264), leave two cores for the machine. */
const SHORT_THREADS = String(Math.max(2, os.cpus().length - 2));

/**
 * UPLOAD-SIZE CEILING (Oct 25 Kartal Short: CRF alone let grainy fire footage reach 83 Mbps — 580 MB for 56 s, a slow
 * upload; the France Shorts were 8.6 Mbps). The VBV cap only trims such peaks: an ordinary Short encodes as before.
 * Every Short encode carries it (test/shorts-bitrate).
 */
export const SHORT_VBV = ["-maxrate", "16M", "-bufsize", "32M"];

/**
 * Every ffmpeg call here runs synchronously in Nova's main process: a hung one froze the whole app (25 Oct 2026,
 * 48 min). Probes/stills get a minute, a Short encode the same ceiling as docu-shorts.js; -nostdin, no console window.
 */
const PIC_PROBE_MS = 60 * 1000;
const PIC_ENCODE_MS = 45 * 60 * 1000;

const W = 1080;
const H = 1920;
const STILL = /\.(jpe?g|png|webp)$/i;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function propsOf(jobDir) {
  const dir = path.join(jobDir, "docu");
  const f = fs.readdirSync(dir).find((x) => x.endsWith(".props.json"));
  return f ? readJson(path.join(dir, f), null) : null;
}

/** Every picture the documentary used (stills and footage), once each, with what the script said under it. */
export function pictureAssets(jobDir) {
  const props = propsOf(jobDir);
  const scenes = props?.script?.scenes || [];
  const pub = path.join(jobDir, "docu", "public");
  // The long video's archive credits by file: a CC BY photo the Short reuses is credited in the Short too.
  const credits = new Map(Object.values(readJson(path.join(jobDir, "docu-archive-done.json"), {})?.credits || {}).filter((c) => c?.file).map((c) => [c.file, c]));
  // Source clips (source-clips.js) are credited after that file is written: their picks carry the title and channel.
  // Kartal Shorts (Oct 2026): both showed two YouTube clips (src-85b69b3639, src-8d26c0370b) and credited neither.
  for (const p of readJson(path.join(jobDir, "docu-source-clips.json"), {})?.picks || []) {
    const c = sourceClipCredit(p);
    for (const f of [p?.video, p?.image]) if (c && f && !credits.has(f)) credits.set(f, c);
  }
  // Photos put in the picture inbox by hand: their credits are in gorsel-kutusu/KUNYE.txt (kunye.js kutuKunyesi).
  // Kartal (24 Oct 2026): two CC BY / BY-SA Commons photos went in that way; a Short showing one owes the same credit.
  // Only a line whose photo is in the inbox (NN.png/.jpg/.jpeg/.webp, the engine's inbox files), as docu.js
  // withInboxCredits and inbox-commons.js inboxCredits check: needed.json names the AI still, and a slot never filled
  // by hand gets the AI picture later — that picture is never credited to the line's Commons author.
  try {
    const kutu = path.join(jobDir, "gorsel-kutusu");
    const placed = new Set(fs.readdirSync(kutu).filter((f) => STILL.test(f)).map((f) => f.replace(STILL, "")));
    for (const [k, c] of Object.entries(kutuKunyesi(fs.readFileSync(path.join(kutu, "KUNYE.txt"), "utf8"), readJson(path.join(kutu, "needed.json"), {})))) {
      if (placed.has(String(Number(k.slice("inbox-".length))).padStart(2, "0")) && !credits.has(c.file)) credits.set(c.file, c);
    }
  } catch {}
  const seen = new Set();
  const out = [];
  const add = (a) => {
    if (seen.has(a.rel)) {
      // Shown again under a later line (the fire chapter after the 1938 one): the picture belongs to that time too.
      const had = out.find((x) => x.rel === a.rel);
      if (had && a.era && (donemYili(a.era) ?? -Infinity) > (donemYili(had.era) ?? -Infinity)) had.era = a.era;
      return;
    }
    const abs = path.join(pub, a.rel);
    if (!fs.existsSync(abs)) return;
    seen.add(a.rel);
    out.push({ ...a, abs, id: `p${out.length + 1}`, ...(credits.has(a.rel) ? { credit: credits.get(a.rel) } : {}) });
  };
  scenes.forEach((s, i) => {
    const say = String(s.say || "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    // The scene's own era (sceneEras: a news story's present-day chapters are this year), so fitsPeriod can tell.
    const era = s.era != null && String(s.era).trim() ? { era: String(s.era).trim() } : {};
    if (s.video && /\.mp4$/i.test(s.video)) {
      add({ rel: s.video, kind: "clip", still: s.image && STILL.test(s.image) ? path.join(pub, s.image) : null, clipStart: Number(s.videoStart) || 0, clipDur: Number(s.videoDur) || 0, srcW: s.videoW || 1920, srcH: s.videoH || 1080, scene: i, say, source: pictureSource(s, s.video), ...era });
    }
    for (const rel of [s.image, ...(Array.isArray(s.images) ? s.images : [])]) {
      if (!rel || !STILL.test(rel) || /\.lift\./.test(rel) || /\/clip-/.test(rel)) continue;
      // The Commons file name ("Jim Bakker 1977") says what a real photo shows when the vision catalogue cannot.
      const name = /\/cm-/.test(rel) ? String(s.commons || "").replace(/^(File|Image):/i, "").replace(/\.[a-z]{2,4}$/i, "").replace(/_/g, " ").trim() : "";
      const had = out.find((x) => x.rel === rel);
      if (had && name && !had.name) had.name = name;
      add({ rel, kind: "still", srcW: s.imgW || 0, srcH: s.imgH || 0, scene: i, say, prompt: /\/img-/.test(rel) ? s.imagePrompt || "" : "", source: pictureSource(s, rel), ...(name ? { name } : {}), ...era });
    }
  });
  return out;
}

/** A source clip's credit, as source-clips.js writes it into the long video's credits (applySourcePicks). */
function sourceClipCredit(p) {
  if (!p?.video || !(p.title || p.channel)) return null;
  return { provider: /youtube\.com|youtu\.be/i.test(p.url || "") ? "youtube" : "social", eser: p.title || "", kanal: p.channel || "", url: p.url || "", sayfa: p.url || "", file: p.video, type: "video" };
}

/**
 * Where a picture comes from: "real" (a Commons/archive photo, real footage, an eyewitness clip), "stock"
 * (generic stock footage: hands, money, corridors) or "ai" (an AI still or its AI motion clip).
 * The file name decides first (an AI still under a stock scene stays AI), then the scene's source.
 */
export function pictureSource(scene = {}, rel = "") {
  const r = String(rel || "");
  // cg-: a ChatGPT still from the image inbox (AI); real-: a real event clip/photo placed by hand (Panama: the
  // Pereira CCTV of the Colombia quake was counted as stock, the ChatGPT seismograph as real).
  if (/(^|\/)(img|i2v|new|kling|cg)-/.test(r)) return "ai";
  if (/(^|\/)(cm|arch|ew|real)-/.test(r)) return "real";
  if (/^hand\/clip-\d+\./.test(r)) return "stock";
  if (scene?.source === "ai" || scene?.source === "stock") return scene.source;
  return "real";
}

/** How many of the title's subject words a picture names: its description counts double, the narration over it once. */
export function subjectHits(a, subj) {
  const has = (t, w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(String(t || ""));
  return subj.reduce((n, w) => n + (has(a?.what, w) ? 2 : 0) + (has(a?.say, w) ? 1 : 0), 0);
}

/** A real picture that shows the story itself (the person/place the title names). */
export function onSubject(a, subj) {
  return !!a && a.source === "real" && !a.textHeavy && sharpEnough(a) && subj.length > 0 && subjectHits(a, subj) > 0;
}

/** A still under 720 px tall turns blotchy at 1920 (= SHORT_MIN_PICTURE_H, docu-short-standalone.js): "Jim Bakker 1977" is 362 px. Unknown size passes. */
export const SHARP_MIN_H = 720;
export function sharpEnough(a) {
  return a?.kind === "clip" || !a?.srcH || a.srcH >= SHARP_MIN_H;
}

/**
 * THE HOOK PICTURE IS THE STORY. The first picture of a Short is a REAL picture of the person/place the
 * title names, and the opening's pictures are never AI-made while a real one of the story is free.
 * Bakker Short (Oct 2026): it opened on stock hands counting cash, a stock hotel corridor and an AI hotel
 * tower; Bakker himself came on the fourth cut. User: "başa saçma sapan AI video gelince bir hissiyat tuhaf
 * oluyor, tam konuyu dibinden vuracak görsel veya video olmalı; para sayıyor, nasıl kanca bu".
 * `opening` = how many beats are the opening fragments (3).
 */
export function hookOnSubject(beats, catalog, title, opening = 3) {
  const subj = subjectWords(title);
  if (!beats.length || !subj.length) return beats;
  const used = () => new Set(beats.map((b) => b.asset?.rel).filter(Boolean));
  const near = (a, k) => [k - 1, k + 1].some((j) => beats[j]?.asset?.rel === a.rel);
  // The first picture may be a portrait the body comes back to (twice is allowed, never on neighbouring beats).
  const best = (k) => {
    const u = used();
    return catalog
      .filter((a) => onSubject(a, subj) && !near(a, k) && (k === 0 || !u.has(a.rel)))
      .sort((a, b) => Number(u.has(a.rel)) - Number(u.has(b.rel)) || subjectHits(b, subj) - subjectHits(a, subj) || b.quality - a.quality)[0];
  };
  const set = (b, a) => {
    b.asset = a;
    delete b.newPrompt;
  };
  // A REAL picture the planner chose for the first fragment stays (Saudi-Houthi Short, Oct 2026: "One airport." over
  // Saudia jets at King Khalid was swapped for a US Navy jet whose narration happened to name Riyadh). Only stock, AI
  // or a missing picture is replaced.
  if (beats[0].asset?.source !== "real" && !onSubject(beats[0].asset, subj)) {
    const a = best(0);
    if (a) set(beats[0], a);
  }
  for (let k = 1; k < Math.min(opening, beats.length); k++) {
    const b = beats[k];
    if (b.asset && b.asset.source !== "ai") continue;
    const a = best(k);
    if (a) set(b, a);
  }
  return beats;
}

/**
 * Real pictures of the subject from Wikimedia Commons, when the documentary's archive has fewer than `want`:
 * a File: search for the title's subject ("Jim Bakker"), only files whose name carries the subject's last
 * word, fetched through commonsFile (licence checked, credit kept). Bakker (Oct 2026): the long video never
 * used "Jim Bakker 1977.png" or "HeritageUSASign.jpg", so the Short had nothing real of him to open on.
 * Returns new assets { rel, kind: "still", source: "real", credit, ... } for describePictures.
 */
export async function subjectTopUp({ jobDir, title, assets, want = 3, max = 4, ffmpeg = "ffmpeg", deps = {}, logFn = () => {} }) {
  // Two subject words ("jim bakker", "panama earthquake"): one word alone ("panama") brings any photo of a country.
  const subj = subjectWords(title).slice(0, 2);
  if (subj.length < 2) return [];
  const named = (t) => subj.every((w) => new RegExp(`\\b${w}`, "i").test(String(t || "").replace(/_/g, " ")));
  const have = assets.filter((a) => a.source === "real" && !a.textHeavy && named(a.what)).length;
  if (have >= want) return [];
  const query = subj.join(" ");
  const api = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=20&format=json`;
  let titles = [];
  try {
    const data = await (deps.fetchJson || fetchJson)(api, { timeoutMs: 20000, deneme: 3 });
    titles = (data?.query?.search || []).map((r) => String(r.title || "")).filter((t) => /\.(jpe?g|png|tiff?|webp)$/i.test(t) && named(t));
  } catch (e) {
    logFn(`Shorts: Commons konu araması atlandı (${String(e?.message || e).slice(0, 80)})`);
    return [];
  }
  const publicDir = path.join(jobDir, "docu", "public");
  const seen = new Set(assets.map((a) => a.rel));
  const out = [];
  for (const t of titles) {
    if (out.length >= max) break;
    try {
      const r = await (deps.commonsFile || commonsFile)(t, { publicDir, buildPrefix: `build/${path.basename(jobDir)}`, ffmpeg, deps });
      if (!r?.file || seen.has(r.file) || (r.imgH && r.imgH < SHARP_MIN_H)) continue;
      seen.add(r.file);
      const name = t.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_+/g, " ");
      out.push({ rel: r.file, abs: path.join(publicDir, r.file), kind: "still", srcW: r.imgW || 0, srcH: r.imgH || 0, say: name, source: "real", credit: r.credit, id: `c${out.length + 1}` });
    } catch (e) {
      logFn(`Shorts: ${t} alınamadı (${String(e?.message || e).slice(0, 60)})`);
    }
  }
  if (out.length) logFn(`Shorts: Commons'tan ${out.length} gerçek konu görseli eklendi (${query})`);
  return out;
}

/**
 * Stock that asks for no credit (kunye.js TOPLU, and Mixkit): by its provider, or by a licence named after it
 * ("Pexels License"). Listed, they crowd out the owed ones.
 */
const NO_CREDIT_STOCK = new Set([...TOPLU, "mixkit"]);
const noCreditStock = (w) => NO_CREDIT_STOCK.has(String(w || "").toLowerCase());
const PUBLIC_DOMAIN = /^(?:public\s*domain|PD|CC0|PDM|kamu\s*malı)/i;
const foldCredit = (t) => String(t || "").normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/** A credit's title as a viewer reads it: no "File:", no ".jpg", a long stock caption cut at a word (kunye.js cut). */
export function creditTitle(t, max = 48) {
  return cut(String(t || "").replace(/^(?:File|Image):/i, "").replace(/\.(?:jpe?g|png|tiff?|webp|gif|svg)$/i, "").replace(/_/g, " ").replace(/\s+/g, " ").trim(), max);
}

/**
 * A credit's author without Commons' junk ("Unknown Unknown", a "File:" name, an uploader note, a signature's time
 * stamp), cleaned as the long video's description cleans it (kunye.js yazarAdi): a derivative work keeps both names
 * ("Jonovision82 / Georgfotoart") and a long name is never cut — the CC BY-SA credit is the name itself.
 */
export function creditAuthor(t) {
  return yazarAdi({ sahip: t }, { tr: false });
}

/**
 * "Photos: Tammy Faye Messner, Darwin Bell, CC BY 2.0, Wikimedia Commons" for the Short's description: the pictures
 * it shows whose licence asks for attribution (public domain / CC0 need none and would only crowd it out).
 * Bakker Short (Oct 2026): Tammy Faye's CC BY 2.0 photo went out with no credit.
 * Kartal and France Shorts (Oct 2026): every line ended "Wikimedia Commons" — Pexels, Unsplash, Pixabay and Openverse
 * photos too ("a burning wood, Lay-Z Owl, Pexels License, Wikimedia Commons", "100 euro bill, khawkins04, BY 2.0,
 * Wikimedia Commons"), with "Barnier Portrait.jpg" and "Unknown Unknown", and the YouTube clips went uncredited. Now
 * the provider names its own source, stock that needs no credit stays out, and a source clip gets a "Videos:" line.
 * Author, provider and the clip's channel are written by kunye.js's own rules (yazarAdi, saglayiciAdi, klipSahibi),
 * so the Short credits a picture in the same words as the long video ("obersalzberggeist on YouTube").
 */
export function shortCredits(assets) {
  const photos = new Map();
  const videos = new Map();
  for (const a of assets || []) {
    const c = a?.credit;
    if (!c) continue;
    if (klipMi(c)) {
      // A social clip's channel already names its site ("@citizen on TikTok", source-clips.js).
      const key = c.url || c.eser || a.rel;
      const title = creditTitle(c.eser || a.say, 72);
      const who = klipSahibi(c, { tr: false });
      if (!videos.has(key)) videos.set(key, title ? `"${title}" (${who})` : who);
      continue;
    }
    const lic = String(c.lisans || "").trim();
    // ATIF_ISTER: the licences that ask for the author's name (Openverse writes CC BY as a bare "BY 2.0").
    if (noCreditStock(c.provider) || noCreditStock(lic.match(/^\w+/)?.[0]) || PUBLIC_DOMAIN.test(lic) || !ATIF_ISTER.test(lic)) continue;
    const title = creditTitle(c.eser || a.say);
    const author = yazarAdi(c, { tr: false });
    const licence = /^BY\b/i.test(lic) ? `CC ${lic}` : lic;
    // An Openverse copy of a Commons file is the same photo: credited once.
    const key = [title, author, licence].map(foldCredit).join("|");
    if (!photos.has(key)) photos.set(key, [title, author, licence, saglayiciAdi(c.provider) || "Wikimedia Commons"].filter(Boolean).join(", "));
  }
  return [photos.size ? `Photos: ${[...photos.values()].join("; ")}` : "", videos.size ? `Videos: ${[...videos.values()].join("; ")}` : ""].filter(Boolean).join("\n");
}

function thumbB64(ffmpeg, file, w = 448) {
  const tmp = path.join(os.tmpdir(), `nova-pic-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`);
  const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-q:v", "5", tmp], { windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  if (r.status !== 0 || !fs.existsSync(tmp)) return null;
  const b = fs.readFileSync(tmp).toString("base64");
  fs.rmSync(tmp, { force: true });
  return b;
}

function sizeOf(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  const m = String(r.stderr || "").match(/, (\d{2,5})x(\d{2,5})[, ]/);
  return m ? { w: +m[1], h: +m[2] } : null;
}

/**
 * Mean brightness (0-255) of the darkest of n frames in [start, start+dur] of a clip, or null. The vision
 * catalogue sees one frame; the 1929 Short's trading-floor footage turned into a black shoulder after it.
 */
export function darkestFrame(ffmpeg, file, start, dur, n = 6) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", String(Math.max(0, start)), "-t", String(dur), "-i", file, "-vf", `fps=${(n / Math.max(0.5, dur)).toFixed(3)},scale=32:18,format=gray`, "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 24, windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  const buf = r.stdout;
  if (r.status !== 0 || !buf || buf.length < 576) return null;
  let min = 255;
  for (let k = 0; k + 576 <= buf.length; k += 576) {
    let sum = 0;
    for (let i = k; i < k + 576; i++) sum += buf[i];
    min = Math.min(min, sum / 576);
  }
  return min;
}

/** Footage this dark at any moment of its window reads as a black screen on a phone. */
export const DARK_CLIP = 32;

/** Mean brightness (0-255) of a still, or null. */
export function meanLuma(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", "scale=32:18,format=gray", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 20, windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  const b = r.stdout;
  if (r.status !== 0 || !b || b.length < 576) return null;
  let s = 0;
  for (let i = 0; i < 576; i++) s += b[i];
  return s / 576;
}

/**
 * Mean colourfulness (0-255) of a still or a clip's first frame, or null: per pixel the spread of its R, G and B
 * (max - min) at 32x18. A black-and-white or sepia archive photo stays under MONO_CHROMA; a colour photo is well over it.
 */
export function meanChroma(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", "scale=32:18,format=rgb24", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 20, windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  return chromaOf(r.status === 0 ? r.stdout : null);
}
/** Mean R/G/B spread of raw rgb24 pixels (meanChroma's arithmetic), or null under one 32x18 frame. */
export function chromaOf(buf) {
  if (!buf || buf.length < 576 * 3) return null;
  let s = 0;
  for (let i = 0; i < 576 * 3; i += 3) s += Math.max(buf[i], buf[i + 1], buf[i + 2]) - Math.min(buf[i], buf[i + 1], buf[i + 2]);
  return s / 576;
}
export const MONO_CHROMA = 14;
const MONO_WHAT = /\b(?:black[- ]and[- ]white|black & white|b&w|monochrome|sepia|gr[ae]yscale|tintype|daguerreotype)\b/i;
/**
 * Is the Short's real archive black-and-white? Its real (not AI) pictures decide: a picture flagged `mono`, described
 * as black-and-white by the vision catalogue, or measured under MONO_CHROMA (`measure(a)` -> chroma or null; at most
 * 24 measured). True when at least 3 are known and 60 % of them are monochrome. Was a year range (1850-1954) in
 * newPictureStyle: Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026 — grey new pictures among colour photos.
 */
export function archiveIsMono(catalog = [], { measure = () => null } = {}) {
  let known = 0;
  let mono = 0;
  let measured = 0;
  for (const a of catalog) {
    if (!a || a.generated || a.source === "ai" || a.source === "stock") continue;
    let m = a.mono === true ? true : a.mono === false ? false : MONO_WHAT.test(String(a.what || "")) ? true : null;
    if (m == null && measured < 24) {
      measured++;
      const c = measure(a);
      if (Number.isFinite(c)) m = c < MONO_CHROMA;
    }
    if (m == null) continue;
    known++;
    if (m) mono++;
  }
  return known >= 3 && mono / known >= 0.6;
}

/**
 * The blurred copy behind a picture fitted whole (and behind the end card). Was brightness -0.18 to -0.28,
 * saturation 0.75-0.8: Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026 — the frame around every eyewitness
 * card read as a black, grey band on a phone.
 */
export const BLUR_FILL = "eq=brightness=-0.12:saturation=0.95";

/**
 * A gamma lift for a dark still, before the look's grade: a dark AI picture under Noir's contrast and
 * vignette went black on a phone (the Dancing Plague Short's "red shoes"). Null when it is bright enough.
 * Floor 72 -> 85 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: mean luma 52-56; target mid luma ~88).
 */
export const DARK_LIFT_FLOOR = 85;
export function darkLift(luma, floor = DARK_LIFT_FLOOR) {
  if (luma == null || luma >= floor) return null;
  return `eq=gamma=${Math.min(1.7, 1 + (floor - luma) / 80).toFixed(2)}`;
}

const DESC_SCHEMA = {
  type: "object",
  properties: {
    pictures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "the picture's number as labelled" },
          what: { type: "string", description: "What it really shows, concrete, max 18 words: who/what, action, place, era cues (painting, photo, engraving...)" },
          textHeavy: { type: "boolean", description: "true when it is mostly text, a diagram, a chart, a document or a title card" },
          modern: { type: "boolean", description: "true when it is a present-day photo or footage: colour digital image, drone/aerial shot, modern clothes, cars, buildings, a reenactment" },
          quality: { type: "integer", description: "1-5: how striking it would be full screen on a phone (faces, action, drama, light = high; empty, murky, generic = low)" },
          x: { type: "number", description: "main subject box, left edge 0-1" },
          y: { type: "number", description: "main subject box, top edge 0-1" },
          w: { type: "number", description: "main subject box width 0-1" },
          h: { type: "number", description: "main subject box height 0-1" },
        },
        required: ["n", "what", "textHeavy", "modern", "quality", "x", "y", "w", "h"],
        additionalProperties: false,
      },
    },
  },
  required: ["pictures"],
  additionalProperties: false,
};

/**
 * What each picture really shows (the script's prompt or search query is not what the archive found),
 * whether it is a text card, how striking it is and where its subject sits — seen by a vision model,
 * 6 at a time, cached per job.
 */
export async function describePictures({ assets, cacheFile, ffmpeg = "ffmpeg", llm = callVisionJSON, settings = {}, usage = null, logFn = () => {} }) {
  const cache = readJson(cacheFile, {});
  const todo = assets.filter((a) => !cache[a.rel]);
  if (todo.length) logFn(`Shorts: ${todo.length} görsel inceleniyor (görüntü modeli)...`);
  for (let k = 0; k < todo.length; k += 6) {
    const batch = todo.slice(k, k + 6).map((a) => ({ a, b64: thumbB64(ffmpeg, a.kind === "clip" ? a.still || a.abs : a.abs) })).filter((x) => x.b64);
    if (!batch.length) continue;
    try {
      const res = await llm({
        system: "You catalogue the pictures of a history documentary for its vertical Short. Be literal and precise. Return only the JSON.",
        user: `Describe each of the ${batch.length} pictures above (numbered 1-${batch.length}).`,
        images: batch.map((x, i) => ({ etiket: `Picture ${i + 1}:`, data: x.b64, mediaType: "image/jpeg" })),
        schema: DESC_SCHEMA,
        model: settings.docuShortsVisionModel || settings.visionModel || "claude-sonnet-5-5",
        maxTokens: 2500,
        usage,
        logFn,
      });
      for (const p of res?.pictures || []) {
        const x = batch[(Number(p.n) || 0) - 1];
        if (!x) continue;
        const c = (v) => Math.max(0, Math.min(1, Number(v) || 0));
        cache[x.a.rel] = { what: String(p.what || "").slice(0, 160), textHeavy: !!p.textHeavy, modern: !!p.modern, quality: Math.max(1, Math.min(5, Number(p.quality) || 3)), box: { x: c(p.x), y: c(p.y), w: c(p.w) || 1, h: c(p.h) || 1 } };
      }
      fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1), "utf8");
    } catch (e) {
      logFn(`Shorts: görsel inceleme atlandı (${String(e?.message || e).slice(0, 120)})`);
    }
  }
  // A real photo the vision step missed stays, described by its Commons name: before, it silently left the
  // catalogue — the Bakker Short never saw "Jim Bakker 1977" or "HeritageUSASign" and opened on stock cash.
  const out = assets.map((a) => ({ ...a, ...(cache[a.rel] || {}) }));
  const named = out.filter((a) => !a.what && a.source === "real" && a.name);
  for (const a of named) Object.assign(a, { what: `Real photo: ${a.name}`, textHeavy: false, modern: false, quality: 3, box: { x: 0.2, y: 0.1, w: 0.6, h: 0.7 } });
  const lost = out.filter((a) => !a.what);
  if (named.length) logFn(`Shorts: ${named.length} gerçek fotoğraf görüntü modeli olmadan Commons adıyla kataloğa alındı`);
  if (lost.length) logFn(`Shorts: UYARI ${lost.length} görsel tanımlanamadı, katalog dışında (${lost.filter((a) => a.source === "real").length} gerçek)`);
  return out.filter((a) => a.what);
}

/** The story's main year (script.era, else the years in the narration), or null. */
export function storyYear(jobDir) {
  return donemYili(hikayeDonemi(propsOf(jobDir)?.script || {}));
}

// 1929 Short: "modern color photo" of the NYSE facade, drone footage of a desert plateau and a cliff
// stood in for a 1929 story. Words the vision catalogue uses for a present-day picture.
const MODERN_LOOK = /\bmodern\b|\bcontemporary\b|present[- ]day|\bdrone\b/i;
// A colour photo gives a picture away only before colour photography was common: in a 1987 story (Bakker Short,
// Oct 2026) it threw out Tammy Faye and Reagan with Falwell, and the opening fell back to an AI picture.
const COLOUR_LOOK = /\bcolou?r (?:photo|photograph|footage|shot|film|image|video)/i;
const COLOUR_COMMON = 1960;

/** A picture that belongs on screen in a story of this year: no present-day pictures before 1990. */
export function periodFit(a, year) {
  if (year == null || year >= 1990) return true;
  return !a.modern && !MODERN_LOOK.test(a.what || "") && !(year < COLOUR_COMMON && COLOUR_LOOK.test(a.what || ""));
}

/**
 * periodFit by the picture's own time as well: a picture the long video showed under a later line (its scene's era,
 * pictureAssets) belongs to that time too. Kartal (news, 25 Oct 2026): one median year, 1952, took 68 of 92 pictures
 * out — the fire, today's house, the marble-fireplace clip — and the Shorts reused a bonfire and Bormann's portrait.
 * A scene's era only ever widens the story's year: eras are guesses (Kartal's 1999 history centre sat under "1952").
 */
export function fitsPeriod(a, year) {
  const own = donemYili(a?.era);
  return periodFit(a, own != null && year != null && own > year ? own : year);
}

/** Words that say what a picture must show: no filler, no style words of a new-picture prompt ("black-and-white photo style"). */
const PLAIN_WORDS = new Set(["that", "this", "these", "those", "with", "from", "into", "onto", "upon", "then", "than", "they", "them", "their", "there", "were", "have", "been", "being", "which", "what", "when", "where", "while", "about", "after", "before", "over", "under", "only", "also", "more", "most", "very", "every", "each", "just", "came", "gave", "made", "took", "went", "said", "would", "could", "should", "still", "even", "much", "many", "some", "through", "straight", "itself", "black", "white", "photo", "photograph", "photographic", "style", "scene", "image", "picture", "vertical", "composition", "cinematic", "natural", "light", "lighting", "detail", "dramatic", "film", "grain", "archival", "historical", "vintage", "accurate", "anonymous", "figure", "seen", "behind", "silhouette", "recognisable", "recognizable", "face", "large", "small", "shot", "view", "close", "wide", "inside", "outside", "year", "years", "time", "times"]);
const contentWords = (t) => [...new Set(String(t || "").toLowerCase().replace(/['’]s\b/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !PLAIN_WORDS.has(w) && !/^\d/.test(w)).map((w) => w.replace(/(?:es|s)$/, "")).filter((w) => w.length > 3))];
const PORTRAIT_LOOK = /\bportrait\b|\bheadshot\b/i;

/**
 * A picture that may stand under a sentence: never a portrait of someone it does not name (the planner's person, else
 * the capitalised names of the sentence, not its first word).
 */
export function mayShow(beat, a) {
  if (!PORTRAIT_LOOK.test(a?.what || "")) return true;
  const names = beat?.person ? [beat.person] : String(beat?.say || "").split(/\s+/).slice(1).map((w) => w.replace(/[^\p{L}'’-]/gu, "").replace(/['’]s$/, "")).filter((w) => /^\p{Lu}\p{L}{3,}$/u.test(w));
  return names.some((n) => portraitFor(n, [a]));
}

/**
 * THE SPARE PICTURE SHOWS THE SENTENCE. A beat the archive could not picture and no new picture could be made for gets
 * the unused picture whose description (twice) and narration (once) share the most words with its sentence and its
 * newPrompt; never a portrait of someone the sentence does not name. Nothing related -> null: the beat keeps the
 * previous beat's picture (another crop). Kartal Shorts (25 Oct 2026, OpenAI credit out): the highest-rated spares
 * went out in order — a bonfire under "the road climbs 800 meters through five tunnels", Bormann's portrait under
 * "Galeazzo Ciano came up as a guest", burnt village ruins under "Mussolini gave it a marble fireplace".
 * `opening`: an opening fragment keeps its old fallback (the best real or stock picture), it has no beat before it.
 * `needed`: no picture before it may follow (fillBeatPictures): nothing related gives the best spare it may show.
 */
export function spareFor(beat, spare, { opening = false, needed = false } = {}) {
  const words = contentWords(`${beat?.say || ""} ${beat?.newPrompt || ""}`);
  const hit = (t, w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(String(t || ""));
  const score = (a) => words.reduce((n, w) => n + (hit(a.what, w) ? 2 : 0) + (hit(a.say, w) ? 1 : 0), 0);
  const pool = (spare || []).filter((a) => mayShow(beat, a));
  const best = pool.map((a) => ({ a, s: score(a) })).filter((x) => x.s >= 2).sort((x, y) => y.s - x.s || y.a.quality - x.a.quality)[0]?.a;
  if (opening) {
    const real = pool.filter((a) => a.source !== "ai");
    if (best && (best.source !== "ai" || !real.length)) return best;
    return real.sort((x, y) => score(y) - score(x) || y.quality - x.quality)[0] || pool[0] || null;
  }
  return best || (needed && pool[0]) || null;
}

/** Pictures that show a person: their archive portrait (named in the description, or under narration naming them). */
export function portraitFor(name, catalog) {
  const surname = String(name || "").trim().split(/\s+/).filter((w) => w.length > 2).at(-1);
  if (!surname) return null;
  const re = new RegExp(`\\b${surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const person = /\b(portrait|man|woman|face|men|figure|president|king|sultan|emperor|general)\b/i;
  return catalog
    .filter((a) => !a.textHeavy && (re.test(a.what || "") || (re.test(a.say || "") && person.test(a.what || ""))))
    .sort((a, b) => Number(re.test(b.what || "")) - Number(re.test(a.what || "")) || b.quality - a.quality)[0] || null;
}

/**
 * A new-picture prompt with the real person taken out: an anonymous figure, never a likeness. Seen from behind or at a
 * distance, not "in silhouette" (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: silhouettes were black figures).
 */
export function anonymise(prompt, name) {
  let p = String(prompt || "");
  for (const w of String(name || "").split(/\s+/).filter((x) => x.length > 2)) p = p.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}('s)?\\b`, "gi"), "a man");
  return `${p.replace(/\ba man(?:\s+a man)+/gi, "a man")}. An anonymous figure seen from behind or at a distance, no recognisable face`;
}

/**
 * A SHORT'S NUMBERS ARE THE NARRATION'S (Kartal Short 1, 25 Oct 2026). Research and the long video: "Hitler visited the
 * house on at least 14 documented occasions", "That road alone cost 30 million Reichsmarks". The Short: "he visited it
 * only fourteen times", its title "Cost 30 Million Reichsmarks for 14 Visits", its cover "30 MILLION / REICHSMARKS. /
 * 14 VISITS." — the qualifier gone, the road's cost made the house's (target: 0 fact slips). The planner is told the
 * rule, and shortClaimLint checks it for free: every number of a line (digits or words) is one the narration says;
 * where the narration hedges it (at least, about, documented…) the line keeps a hedge; "X alone" keeps X.
 */
export const CLAIM_RULE = "every number keeps its qualifier and the thing it belongs to exactly as the narration has them, in the beats, the title and the cover alike: 'at least 14 documented visits' never becomes 'only 14 visits', 'about 500 rooms' keeps 'about', and 'that road alone cost 30 million' stays the road's cost, never the house's. Use only numbers the narration says";

const NUMBER_WORD = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUMBER_SCALE = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const NUMBER_SUFFIX = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 };
/** A hedge right before the number ("on at least 14", "Roughly €249 million"). */
const HEDGE_BEFORE = /(?:^|\s)(?:at least|at most|about|around|nearly|almost|roughly|approximately|more than|over|up to|some|estimated|fewer than|less than|under|as many as|as much as|close to|upwards of|reportedly|perhaps|possibly)$/;
/** A hedge next to it on either side ("14 documented occasions", "Fourteen is the documented minimum"). */
const HEDGE_NEAR = /^(?:documented|recorded|reportedly|officially|confirmed|known|estimated|minimum)$/;
const MONTH = /^(?:jan(?:uary)?|feb(?:ruary)?|march|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)$/;

const claimSentences = (text) => String(text || "").replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).filter(Boolean);

/** The numbers of one sentence: { v, pct, year, day, i, j (token span), shown, hedge, owner }. */
function sentenceNumbers(sentence) {
  const raw = sentence.split(/\s+/).filter(Boolean);
  const tok = raw.map((r) => r.replace(/^[("'“‘[]+|[)"'”’\].,;:!?…]+$/g, ""));
  const low = tok.map((t) => t.toLowerCase().replace(/['’]s$/, ""));
  const stops = (k) => /[,;:]["”’)]?$/.test(raw[k] || "");
  const isWord = (w) => !!w && w.split("-").every((p) => p in NUMBER_WORD || p in NUMBER_SCALE);
  const out = [];
  for (let i = 0; i < tok.length; i++) {
    let v = null, j = i, approx = false, plus = false;
    const d = tok[i].match(/^([~≈])?[$€£¥]?(\d[\d,]*(?:\.\d+)?)(%|\+|k|m|bn|b)?$/i);
    if (d) {
      v = parseFloat(d[2].replace(/,/g, "")) * (NUMBER_SUFFIX[String(d[3] || "").toLowerCase()] || 1);
      approx = !!d[1];
      plus = d[3] === "+";
      if (!stops(i) && NUMBER_SCALE[low[i + 1]] >= 1e3) v *= NUMBER_SCALE[low[++j]];
    } else if (low[i] === "half" && low[i + 1] === "a" && NUMBER_SCALE[low[i + 2]] >= 1e3) {
      v = NUMBER_SCALE[low[i + 2]] / 2;
      j = i + 2;
    } else if (isWord(low[i]) || ((low[i] === "a" || low[i] === "an") && low[i + 1] in NUMBER_SCALE)) {
      // "one hundred and eighty-five thousand", "thirty-five point eight billion", "a million"
      let total = 0, cur = low[i] === "a" || low[i] === "an" ? 1 : 0;
      for (let k = cur ? i + 1 : i; k < tok.length; k++) {
        if (k > i && low[k] === "and" && isWord(low[k + 1]) && !stops(k - 1)) continue;
        if (k > i && low[k] === "point" && NUMBER_WORD[low[k + 1]] < 10 && !stops(k - 1)) {
          let frac = "";
          while (NUMBER_WORD[low[k + 1]] < 10) frac += NUMBER_WORD[low[++k]];
          cur += Number(`0.${frac}`);
          j = k;
          continue;
        }
        if (!isWord(low[k]) || (k > i && stops(k - 1))) break;
        for (const p of low[k].split("-")) {
          if (p in NUMBER_WORD) cur += NUMBER_WORD[p];
          else if (p === "hundred") cur = (cur || 1) * 100;
          else {
            total += (cur || 1) * NUMBER_SCALE[p];
            cur = 0;
          }
        }
        j = k;
      }
      v = total + cur;
    }
    if (v == null) continue;
    const pct = /%$/.test(tok[i]) || low[j + 1] === "percent" || (low[j + 1] === "per" && low[j + 2] === "cent");
    const year = !pct && Number.isInteger(v) && v >= 1000 && v <= 2099 && /^\d{4}$/.test(tok[i]);
    // A day of the month is a date, not an amount: "On 23 October, officials confirmed" hedges nothing about the 23.
    const day = !pct && Number.isInteger(v) && v <= 31 && (MONTH.test(low[i - 1] || "") || MONTH.test(low[j + 1] || ""));
    const before = low.slice(Math.max(0, i - 3), i);
    const after = low.slice(j + 1, j + 4);
    const hedge = approx || plus || HEDGE_BEFORE.test(before.join(" ")) || [...before, ...after].some((w) => HEDGE_NEAR.test(w)) || /^or (?:more|so)\b/.test(after.join(" "));
    const lead = low.slice(Math.max(0, i - 4), i);
    const alone = lead.lastIndexOf("alone");
    out.push({ v: Number(v.toPrecision(6)), pct, year, day, i, j, shown: raw.slice(i, j + 1).join(" ").replace(/[.,;:!?…]+$/, ""), hedge, owner: alone > 0 ? lead[alone - 1] : null });
    i = j;
  }
  return out;
}

/**
 * Lines of a Short ([{ id, text }]) whose numbers the narration does not say this way:
 * [{ id, text, problems: [{ number, problem }] }]. Years and days of the month are only looked up; numbers under 10 (not percentages) are
 * too common to tell apart ("one in five", "two words").
 */
export function shortClaimLint({ lines, narration }) {
  const said = new Map();
  for (const s of claimSentences(narration)) {
    for (const n of sentenceNumbers(s)) {
      const key = `${n.v}${n.pct ? "%" : ""}`;
      if (!said.has(key)) said.set(key, []);
      said.get(key).push({ ...n, s });
    }
  }
  const flags = [];
  for (const { id, text } of lines || []) {
    const problems = new Map();
    for (const s of claimSentences(text)) {
      for (const n of sentenceNumbers(s)) {
        if ((!n.pct && n.v < 10) || problems.has(n.shown)) continue;
        const src = said.get(`${n.v}${n.pct ? "%" : ""}`);
        if (!src) {
          problems.set(n.shown, `${n.shown}: the narration never says this number`);
          continue;
        }
        if (n.year || n.day) continue;
        const named = (m) => !m.owner || new RegExp(`\\b(?:${m.owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|alone\\b)`, "i").test(s);
        if (src.some((m) => (!m.hedge || n.hedge) && named(m))) continue;
        const m = src[0];
        const why = [m.hedge && !n.hedge ? "hedges it" : "", named(m) ? "" : `gives it to the ${m.owner}`].filter(Boolean).join(" and ");
        problems.set(n.shown, `${n.shown}: the narration ${why} ("${m.s}")`);
      }
    }
    if (problems.size) flags.push({ id, text, problems: [...problems].map(([number, problem]) => ({ number, problem })) });
  }
  return flags;
}

const CLAIM_FIX_SCHEMA = {
  type: "object",
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string", description: "the line's id as given" }, text: { type: "string", description: "the corrected line (unchanged when it is right)" } },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["lines"],
  additionalProperties: false,
};

/** The Short's lines that state facts: title, hook label, opening screen text, cover, every beat. */
function claimLines(plan) {
  return [
    { id: "title", text: plan.title },
    { id: "hook", text: plan.hook },
    { id: "screen", text: plan.screen },
    { id: "cover", text: (plan.cover || []).join(" / ") },
    ...(plan.beats || []).map((b, k) => ({ id: `beat ${k + 1}`, text: b.say })),
  ].filter((l) => String(l.text || "").trim());
}

/**
 * The claim lint on a planned picture Short, and ONE repair call for the lines it flags (offending lines + the
 * narration's sentence). A fix is taken only when it fits its place (a beat stays one sentence and keeps its slammed
 * word, the cover 1-3 short lines) and leaves fewer problems; what is left is logged. Never fails the Short.
 */
export async function checkShortClaims({ plan, cues, llm = callJSON, settings = {}, usage = null, logFn = () => {} }) {
  const narration = (cues || []).map((c) => c.t).join(" ");
  const flags = shortClaimLint({ lines: claimLines(plan), narration });
  if (!flags.length) return { flags, fixed: 0 };
  logFn(`Shorts: ${flags.length} satırda sayı anlatımdan farklı (${flags.map((f) => f.id).join(", ")}); tek onarım isteniyor`);
  const beatOf = (id) => plan.beats?.[Number(/^beat (\d+)$/.exec(id)?.[1]) - 1];
  let res = null;
  try {
    res = await llm({
      system: "You check the numbers of a YouTube Short against the documentary it was cut from. Return only the requested JSON.",
      user: [
        "These lines of a Short state numbers differently from the documentary's narration. Rewrite each one so its numbers say exactly what the narration says:",
        `- ${CLAIM_RULE}`,
        "- change as few words as possible; a number the narration never says is replaced by the narration's own number or left out",
        "- a beat stays ONE spoken sentence of about the same length; the title stays under 70 characters; the cover stays 2-3 lines of at most 12 characters, written 'LINE / LINE / LINE' (a short hedge fits: '14+ VISITS', '~€249M')",
        "- a line that is already right comes back unchanged",
        "",
        ...flags.map((f) => {
          const slam = beatOf(f.id)?.slam;
          return `${f.id}: "${f.text}"${slam ? ` (keep the word "${slam.toLowerCase()}")` : ""}\n  ${f.problems.map((p) => p.problem).join("\n  ")}`;
        }),
      ].join("\n"),
      schema: CLAIM_FIX_SCHEMA,
      model: settings.docuShortsModel || "claude-sonnet-5-5",
      maxTokens: 1500,
      usage,
      logFn,
    });
  } catch (e) {
    logFn(`Shorts: sayı onarımı yapılamadı (${String(e?.message || e).slice(0, 120)})`);
  }
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const sentences = (t) => (t.match(/[.!?]+(?=\s|$)/g) || []).length;
  const bare = (w) => String(w || "").replace(/[^\p{L}\p{N}'-]/gu, "").toUpperCase();
  let fixed = 0;
  for (const f of flags) {
    const text = clean((res?.lines || []).find((l) => l?.id === f.id)?.text);
    if (!text || text === f.text) continue;
    const b = beatOf(f.id);
    const cover = text.split("/").map((l) => clean(l).toUpperCase()).filter(Boolean);
    const fits = b
      ? text.length <= f.text.length * 1.6 + 20 && sentences(text) <= Math.max(1, sentences(f.text)) && (!b.slam || text.split(/\s+/).some((w) => bare(w) === bare(b.slam)))
      : f.id === "cover" ? cover.length >= 1 && cover.length <= 3 && cover.every((l) => l.length <= 16) : text.length <= (f.id === "title" ? 100 : 60);
    const left = shortClaimLint({ lines: [{ id: f.id, text }], narration })[0]?.problems.length || 0;
    if (!fits || left >= f.problems.length) continue;
    if (b) {
      b.say = text;
      // The figure printed big on the picture is the old line's: a number the fixed line no longer says goes with it.
      const says = new Set(claimSentences(text).flatMap((s) => sentenceNumbers(s)).map((n) => n.v));
      if (b.figure && claimSentences(b.figure).flatMap((s) => sentenceNumbers(s)).some((n) => !says.has(n.v))) Object.assign(b, { figure: "", figureWord: "" });
    } else if (f.id === "cover") plan.cover = cover;
    else plan[f.id] = text;
    Object.assign(f, { fixed: text, left });
    fixed++;
  }
  if (fixed) logFn(`Shorts: sayı onarımı — ${fixed}/${flags.length} satır anlatıma uyduruldu`);
  const still = flags.filter((f) => !f.fixed || f.left);
  if (still.length) logFn(`UYARI: Shorts sayısı anlatımdan farklı kaldı — ${still.map((f) => `${f.id}: "${(f.fixed || f.text).slice(0, 80)}"`).join("; ")}`);
  return { flags, fixed };
}

/** How the planner sees a picture's source. */
const SOURCE_TAG = { real: "REAL", stock: "STOCK", ai: "AI" };

const PIC_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "Label at the top during the opening, 3-6 words, ALL CAPS, naming the story" },
    opening: {
      type: "object",
      properties: {
        say: { type: "string", description: "ONE plain sentence of 10-20 words naming who/what, where/when and the stake (never cryptic fragments)" },
        words: { type: "array", items: { type: "string" }, description: "At most ONE word from the sentence, copied as spoken: its key number or name, slammed when said" },
        pictures: { type: "array", items: { type: "string" }, description: "1-3 picture ids (p12); the FIRST is a REAL picture of the story's subject and is shown while the sentence is said" },
        pattern: { type: "string", enum: ["result", "contradiction", "strange", "question", "compare"], description: "The hook pattern this opening uses (see SHORTS KANCASI)" },
        screen: { type: "string", description: "At most 4 words on screen from the first frame that COMPLETE the sentence with proof (a number, a fact), never repeat it: '$100,000', '538K IN 7 DAYS'; empty if none" },
      },
      required: ["say", "words", "pictures", "pattern", "screen"],
      additionalProperties: false,
    },
    beats: {
      type: "array",
      description: "7-10 beats after the opening, in order; their sentences are the rest of the narration",
      items: {
        type: "object",
        properties: {
          say: { type: "string", description: "ONE spoken sentence, 6-16 words" },
          picture: { type: "string", description: "id of the catalogue picture that SHOWS what this sentence is about, or \"new\"" },
          newPrompt: { type: "string", description: "Only when picture is \"new\": an image prompt for a NEW vertical (9:16) picture of exactly what the sentence says — era-accurate, cinematic light, no text, no modern objects, no real person; else empty" },
          person: { type: "string", description: "Full name of the real person this sentence is about (named or meant), else empty" },
          figure: { type: "string", description: "When the sentence says a striking number or date: how it is printed big on screen ('4,773', '8 METERS', '1453'); else empty" },
          figureWord: { type: "string", description: "The first spoken word of that number ('four', 'eight', 'fourteen'); else empty" },
        },
        required: ["say", "picture", "newPrompt", "person", "figure", "figureWord"],
        additionalProperties: false,
      },
    },
    title: { type: "string", description: "YouTube Shorts title, max 70 chars, no hashtags: a FAMOUS name or place + ONE surprising concrete fact or question, the shape of the niche's outliers ('How Alexander the Great Fooled Darius at Gaugamela', 'Maus Tank: 207-Ton Monster That Had to Swim', 'Why Canada is Way Further South Than You Think', 'How This Vandal Made $200 Million by Spray Painting an Office') — never poetic or cryptic" },
    description: { type: "string", description: "2-3 sentences that send viewers to the full documentary" },
    hashtags: { type: "array", items: { type: "string" }, description: "2-3 topic hashtags without #shorts, only names, places or years that appear in THIS Short ('Falklands', 'Vulcan', '1982') — never tags from other videos" },
    cover: {
      type: "array",
      items: { type: "string" },
      description: "The Short's vertical cover text over its hook picture: 2-3 very short lines (max 12 characters each), its sharpest number or contrast, read in one second on a phone — e.g. ['159,903', 'STAYS SOLD.', '500 ROOMS.'] or ['7.7', 'PANAMA', 'SO FAR: ZERO']. Neutral and factual (no fear words)",
    },
  },
  required: ["hook", "opening", "beats", "title", "description", "hashtags", "cover"],
  additionalProperties: false,
};

/** Claude: the teaser's words, and for every sentence the picture that shows it. */
/*
 * SAME STORY, NEW OPENING (1.16.16, Shorts hook lesson: "Studio'da kaydırıp geçen oranı kötüyse içeriği değil, ilk 3
 * saniyeyi değiştirip yeni bir Shorts deneyin"). `reopen` = an earlier Short's { beats: [say…], pattern }: its beats
 * are kept word for word (their pictures re-picked), only the opening is new, with another pattern.
 */
export function reopenLines(reopen) {
  if (!reopen?.beats?.length) return [];
  return [
    `- SAME STORY, NEW OPENING: an earlier Short of this video lost viewers in its first seconds. Keep its beats exactly, in this order, word for word (copy each as a beat's say; pick each one's picture again): ${reopen.beats.map((s, i) => `${i + 1}) "${s}"`).join(" ")}`,
    `- write only a NEW opening: ${reopen.pattern ? `another pattern than "${reopen.pattern}"` : "another pattern than before"}, another first picture, another first sentence; the hook label, title and cover may change to fit the new opening.`,
  ];
}

// `newsStory`: a story told today (docuFormat "news", judged by no single year). Year null alone cannot tell it from a
// history story whose narration names no year: a caller that does not say counts year null as news (makePictureTeaser).
export async function planPictureTeaser({ cues, title = "", catalog: all, year = null, newsStory = year == null, previous = [], reopen = null, llm = callJSON, settings = {}, usage = null, logFn = () => {}, maxNew = 3 }) {
  const story = cues.map((c) => c.t).join(" ").replace(/\s+/g, " ").slice(0, 14000);
  const catalog = all.filter((a) => fitsPeriod(a, year) && sharpEnough(a));
  if (all.some((a) => !sharpEnough(a))) logFn(`Shorts: ${all.filter((a) => !sharpEnough(a)).length} küçük görsel (<${SHARP_MIN_H} px) dikeyde lekeli olur, plandan çıkarıldı`);
  const modern = all.filter((a) => !fitsPeriod(a, year)).length;
  if (modern) logFn(`Shorts: ${modern} günümüz görseli ${year} hikâyesinden çıkarıldı`);
  const pics = catalog
    .filter((a) => !a.textHeavy)
    .map((a) => `${a.id} · ${a.kind === "clip" ? "footage" : "still"} · ${SOURCE_TAG[a.source] || "REAL"} · q${a.quality} · ${a.what}${a.say ? ` · narration over it: "${a.say.slice(0, 90)}"` : ""}`)
    .join("\n");
  const res = await llm({
    system: "You write and picture-edit YouTube Shorts for a documentary channel: each Short tells ONE angle of the channel's long video completely, on its own. Return only the requested JSON.",
    user: [
      `The full documentary: "${title}". Its narration:`,
      story,
      "",
      "Its picture archive (id · kind · REAL = a real photo/footage of the story, STOCK = generic stock footage, AI = AI-made · q = how striking full screen, 1-5 · what it shows):",
      pics,
      "",
      "Write a NEW vertical Short (105-140 words of narration, 45-55 s) that tells ONE angle of this story completely and on its own — the viewer gets the answer:",
      ...shortGrowthLines(),
      ...shortHookLines({ previousPatterns: [...previous.map((p) => p.pattern), ...(reopen?.pattern ? [reopen.pattern] : [])] }),
      ...reopenLines(reopen),
      "- the opening is the hook and must be understood in ONE hearing by a viewer who has never heard of this story: ONE plain spoken sentence of 10-20 words (or, for the compare pattern, three short parts) that names WHO or WHAT, WHERE or WHEN, and the stake or twist ('In 1066, England's king won the battle of his life, and nineteen days later he was dead.' / 'Saudi Arabia's main airport was hit three times in five days, and now Washington may join the war.'). NEVER cryptic fragments ('One airport. Eight countries. And two words.', 'One death.') — channel data, Oct 2026: Shorts lost ~40% of viewers in the first 12 seconds when the opening did not say what the story was. Put at most ONE word of it in words: the key number or name (for the contradiction pattern: the negation word), slammed when said. A serious story (real deaths, an unconfirmed news event, a tragedy) never slams fear words like DEATH or KILLER",
      "- THE HOOK PICTURE IS THE STORY: the first fragment's picture is a REAL picture of the person or place the title names (their photo, the real place, the real event), so the viewer knows in one second whose story this is; the opening's three pictures are REAL, never AI, and never generic STOCK (hands counting money, corridors, skylines) while a REAL picture of the story exists. AI pictures only later, for what nothing real shows",
      ...(previous.length ? [`- this video already has ${previous.length} Short(s); yours must take a DIFFERENT angle — another moment, another person or number, another opening sentence and first picture, another title. Already made: ${previous.map((p) => `"${p.title}" (opens: "${p.opening.slice(0, 90)}")`).join("; ")}`] : []),
      "- then 3-5 of the most striking, concrete moments on that angle (numbers, names, reversals), each raising the stakes",
      "- give the ANSWER: a Short that withholds it to sell the long video loses (deep study, Oct 2026: GoPro's standalone Short 8M views vs its long video 235k; Epic History's teaser clips 0.07-0.11x its subscribers)",
      "- last beat: the strongest result or the hardest detail ('total destruction', 'they beat each other with clubs'), worded so it loops back to the opening sentence and a replay flows on. NO call to the full documentary in the narration ('the full story is on the channel', 'watch the full video', 'link below'): the Short's related-video field and description carry the link. Optional, after that line: ONE reasoned subscribe line of at most 10 words ('If you want the next one explained, subscribe.')",
      "- plain spoken English, short sentences, no hashtags, emojis or stage directions",
      "- EVERY sentence gets ONE picture that shows exactly what it says: the person it names (never someone else), the object, the place, the event. Prefer q4-q5 pictures with faces, action, fire, crowds, ships, armies. Never a picture of something the sentence does not talk about",
      "- never picture a figure of speech literally: a 'plateau', a 'cliff', a 'storm', a 'bloodbath', a 'bubble' are words, not landscapes — show the person who said it or the real thing that happened (the crowd, the trading floor, the ruined man)",
      // A news story is told today: its present-day pictures are the story (Kartal, Oct 2026). A history story whose
      // narration names no year (`newsStory: false`, year null) keeps the line, without a year, as before.
      ...(newsStory ? [] : [`- every picture must belong to the story's time${year != null ? ` (${year < 0 ? `${-year} BC` : year})` : ""}: no present-day photos or footage`]),
      "- a real person the sentence is about gets THEIR archive portrait (find it by the description or by the narration over it); a portrait may come back once when the story returns to that person; otherwise never the same picture twice",
      `- if nothing in the archive shows a sentence, use "new" and write newPrompt (at most ${maxNew} new pictures in the whole Short) — only for scenes without a real, named person: places, objects, crowds, anonymous figures; never a likeness of a real person`,
      "- a sentence with a striking number or date: put it in figure (it is printed big on the picture when said) — but never on a close portrait of a person: the number is printed mid-frame and would sit on the face (Yeltsin, Oct 2026); the narration says it there.",
      `- ${CLAIM_RULE}`,
    ].join("\n"),
    schema: PIC_SCHEMA,
    model: settings.docuShortsModel || "claude-sonnet-5-5",
    // The full plan (opening, 7-10 beats, cover, title) ran past 3500 tokens on both Kartal Shorts (Oct 2026): every
    // Short paid the large request twice (llm.js retries with a doubled budget).
    maxTokens: 6000,
    usage,
    logFn,
  });
  const byId = new Map(catalog.map((a) => [a.id, a]));
  const uses = new Map();
  let news = 0;
  let prev = null;
  // A picture once; a person's portrait twice (the story returns to them), never on two beats in a row.
  const free = (a, person) => a && a.id !== prev && (uses.get(a.id) || 0) < (person ? 2 : 1);
  const take = (a) => {
    uses.set(a.id, (uses.get(a.id) || 0) + 1);
    prev = a.id;
    return { asset: a };
  };
  const pick = (id, prompt, person = "") => {
    const a = byId.get(id);
    if (free(a, person)) return take(a);
    // A real person is never generated: their archive portrait, else an anonymous figure.
    const face = person && portraitFor(person, catalog);
    if (free(face, person)) return take(face);
    prev = null;
    if (prompt && news < maxNew) {
      news++;
      return { newPrompt: person ? anonymise(prompt, person) : prompt };
    }
    return null;
  };
  const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
  const op = res?.opening || {};
  const frags = (clean(op.say).match(/[^.!?]+[.!?]+["”']?/g) || []).map((f) => f.trim());
  const slamOf = (w) => String(w || "").replace(/[^\p{L}\p{N}'-]/gu, "").toUpperCase();
  // NEVER A SILENT OPENING (Saudi-Houthi Short, Oct 2026): "In September: no. In October: we may." is two fragments,
  // and the whole opening — its narration too — vanished; the Short began mid-story. Not three fragments: the opening
  // is kept as one beat over its first picture, its last planned word slammed.
  const opening = frags.length === 3
    ? frags.map((say, k) => ({ say, slam: slamOf(op.words?.[k]), ...(pick(op.pictures?.[k]) || {}) }))
    : clean(op.say) ? [{ say: clean(op.say), slam: slamOf([...(op.words || [])].reverse().find(Boolean)), ...(pick(op.pictures?.[0]) || {}) }] : [];
  if (frags.length !== 3 && clean(op.say)) logFn(`Shorts: açılış üç parça değil (${frags.length}); tek vuruş olarak korundu`);
  // Same story, new opening: the kept beats' words win over a reworded copy (their pictures are the planner's).
  const kept = reopen?.beats?.length && (res?.beats || []).length === reopen.beats.length ? reopen.beats : null;
  if (reopen?.beats?.length && !kept) logFn(`Shorts: açılış yenilendi ama vuruş sayısı değişti (${(res?.beats || []).length}/${reopen.beats.length}); planlayıcının vuruşları kullanılıyor`);
  // Same story, new opening: the kept beats stay word for word (an earlier Short); only a new plan is filtered.
  const withSay = (res?.beats || []).map((b, i) => ({ ...b, say: kept ? kept[i] : b.say }));
  const planned = kept ? withSay : dropSellBeats(withSay);
  if (planned.length < (res?.beats || []).length) logFn(`Shorts: uzun videoya çağıran ${(res?.beats || []).length - planned.length} vuruş çıkarıldı (bağlantı İlgili video alanında)`);
  const beats = planned.map((b) => ({ say: clean(b.say), figure: clean(b.figure), figureWord: clean(b.figureWord), person: clean(b.person), ...(pick(b.picture === "new" ? "" : b.picture, clean(b.newPrompt), clean(b.person)) || {}) })).filter((b) => b.say);
  if (beats.length < 3) throw new Error("teaser planı eksik");
  const cover = (Array.isArray(res.cover) ? res.cover : []).map((l) => clean(l).toUpperCase().slice(0, 16)).filter(Boolean).slice(0, 3);
  const hookPlan = shortOpeningPlan(op, opening);
  return { hook: clean(res.hook), beats: hookOnSubject([...opening, ...beats], catalog, title, opening.length), title: clean(res.title), description: clean(res.description), hashtags: Array.isArray(res.hashtags) ? res.hashtags : [], cover, openingLen: opening.length, ...hookPlan };
}

/*
 * SHORTS'UN YENİ AI KARESİ DE SAHTE BELGE VE UYDURMA YÜZ ÇİZMEZ (27 Ekim 2026 kare incelemesi; 1. tur yalnızca uzun
 * videonun AI karelerini düzeltti). Çernobil'de (20261026-24122a) "the New York Post announced…" satırının AI karesi
 * anlamsız manşetli ("NTD THE BLENS") sahte bir gazete ön sayfasıydı; Madoff'ta (20261026-27b4d8) adı geçen iki oğul
 * uydurma yüzle çizildi. Shorts'un yeni dikey görseli bu kurallardan geçmiyordu: planlayıcının newPrompt'u bir ön sayfa
 * ya da adı geçen kişiyi yüzüyle isteseydi istem aynen OpenAI'a giderdi. Artık istem motorun stillPrompt'undan geçer
 * (docu-engine/lib/produce.mjs: noPrintedRecord + hideNamedFaces — uzun videonun AI kareleriyle AYNI kod): ön sayfa,
 * manşet, dergi kapağı ya da yayın adı katlanmış, yazısı okunmayan bir gazete yığını olur; cümlenin andığı gerçek kişi
 * (named) karede görünüyorsa arkadan ya da siluetle çizilir. Böyle bir istem yoksa istem eskisiyle birebir aynı.
 * Motor uygulamanın dışında kurulu (resources/docu-engine): statik import asar içinde çözülüp sunucuyu açtırmıyordu
 * (docu-edit-director.js dünya haritası notu); kling-video.js gibi çalışma anında, ilk yeni görselde yüklenir.
 * Yüklenemezse görsel istenmez (denetlenmemiş istem gitmez); cümle arşivden uyan görseli alır (fillBeatPictures).
 */
const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let engineStill = null;
function engineStillPrompt() {
  if (!engineStill) {
    const packaged = process.resourcesPath && path.join(process.resourcesPath, "docu-engine", "lib", "produce.mjs");
    const file = packaged && fs.existsSync(packaged) ? packaged : path.join(ENGINE_ROOT, "docu-engine", "lib", "produce.mjs");
    engineStill = import(pathToFileURL(file).href).then((m) => m.stillPrompt);
  }
  return engineStill;
}

/** The request text of a new vertical picture: the engine's still rules (no printed record, named faces hidden), then the frame. */
export async function verticalPicturePrompt(prompt, { style = "", named = [] } = {}) {
  const stillPrompt = await engineStillPrompt();
  return `${stillPrompt(String(prompt ?? ""), { named })}. ${style} Vertical 9:16 composition, the subject large in the frame, cinematic natural light, photographic detail, no text, no captions, no borders.`;
}

/** A new vertical picture for a sentence the archive cannot show (OpenAI GPT Image, 864x1536). `named`: real people the sentence names. */
export async function newVerticalPicture({ prompt, dir, settings, style = "", named = [] }) {
  const full = await verticalPicturePrompt(prompt, { style, named });
  const url = await openAIImagesProvider.textToImage(full, { ...settings, kanvasW: W, kanvasH: H });
  const m = /^data:[^;]+;base64,(.+)$/.exec(url || "");
  if (!m) throw new Error("görsel üretilemedi");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`);
  fs.writeFileSync(file, Buffer.from(m[1], "base64"));
  return file;
}

/** The 9:16 window of a w x h picture around its subject box (pixels), never outside the picture. */
/** The closest a Short cuts into a picture: 1400 px tall, so the 1920 px frame enlarges it at most ~1.4x. */
export const ZOOM_MIN_H = 1400;

export function verticalCrop(w, h, box = { x: 0, y: 0, w: 1, h: 1 }) {
  // A small subject in a big picture (the Kremlin along the bottom of a 4000 px night shot) is cut
  // closer instead of from the full height, which left two thirds of the Short empty sky. Only as far
  // as the picture stays sharp: the cut is never under 1400 px tall (at most ~1.4x enlarged).
  const bh = Math.max(0.05, Math.min(1, box.h ?? 1));
  const zoomH = Math.round(h * Math.min(1, bh * 1.4));
  const zoomed = zoomH < h && h > ZOOM_MIN_H;
  let ch = zoomed ? Math.max(ZOOM_MIN_H, zoomH) : h;
  let cw = Math.round((ch * 9) / 16);
  if (cw > w) {
    cw = w;
    ch = Math.min(h, Math.round((w * 16) / 9));
  }
  const cx = (box.x + box.w / 2) * w;
  // A face or a figure sits in the upper part of the frame, where the eye goes first.
  const cy = zoomed ? (box.y + bh / 2) * h : (box.y + Math.min(box.h, 0.5) * 0.45) * h;
  const x = Math.round(Math.max(0, Math.min(w - cw, cx - cw / 2)));
  const y = Math.round(Math.max(0, Math.min(h - ch, cy - ch * (zoomed ? 0.5 : 0.38))));
  return { x, y, w: cw - (cw % 2), h: ch - (ch % 2) };
}

/**
 * Vertical teaser render: every segment is a full-screen 9:16 picture (a slow push in or out toward its
 * subject, light grain, a soft vignette) or a 9:16 window of footage; then the cover end card.
 * Sound as before: the new narration, the film's music under it, a hit on each slammed word, a whoosh on
 * the later cuts, -14 LUFS.
 */
/** A clip that carries its source's label in the frame (eyewitness, ew-): shown whole, never zoomed or cut closer. */
export const labelled = (rel) => /(^|\/)ew-/.test(String(rel || ""));

/**
 * SHORTS COVER (kanal sahibi, Ekim 2026: "shortsların da kapaklarını yapmalısın"). A vertical 1080x1920 cover: the
 * Short's hook picture (a real picture of the story — hookOnSubject) cut 9:16 on its subject in the Short's look,
 * a dark fade at the bottom, and 2-3 short lines in the look's type: the first big in the key colour, the rest in
 * ink, the last in the key colour again. An eyewitness picture keeps its source label (cut from the top).
 */
export function coverLines(lines, hook = "") {
  const clean = (Array.isArray(lines) ? lines : []).map((l) => String(l || "").toUpperCase().trim()).filter(Boolean).slice(0, 3);
  if (clean.length) return clean;
  const words = String(hook || "").toUpperCase().split(/\s+/).filter(Boolean);
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(" "), words.slice(half).join(" ")].filter(Boolean);
}

export function shortCoverAss(lines, lookId = "punch") {
  const L = SHORT_LOOKS[lookId] || SHORT_LOOKS.punch;
  const c = (hex) => `&H00${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
  const size = (t, k) => (k === 0 ? (t.length <= 6 ? 330 : t.length <= 9 ? 230 : 170) : t.length <= 10 ? 150 : 120);
  const ys = lines.length === 3 ? [1290, 1520, 1690] : [1430, 1660];
  const ev = lines.map((t, k) => {
    const col = k === 0 || k === lines.length - 1 ? L.key : L.ink;
    return `Dialogue: 0,0:00:00.00,0:00:01.00,Cover,,0,0,0,,{\\an2\\pos(540,${ys[k] ?? 1700})\\fs${size(t, k)}\\c${c(col)}&\\3c&H000000&\\bord${k === 0 ? 10 : 7}\\shad0}${t.replace(/[{}\\]/g, "")}`;
  });
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Cover,${L.slamFont || L.font},150,${c(L.ink)},${c(L.ink)},&H00000000,&H00000000,1,0,0,0,100,100,2,0,1,8,0,2,60,60,0,1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...ev, "",
  ].join("\n");
}

/** Black bars baked into a still (a phone clip's pillarbox): ffmpeg cropdetect's answer, or the whole frame. */
export function blackBorders(picture, srcW, srcH, ffmpeg = "ffmpeg") {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-loop", "1", "-t", "0.2", "-i", picture, "-vf", "cropdetect=limit=24:round=2:reset=0", "-f", "null", "-"], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  const m = [...String(r.stderr || "").matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  if (!m) return { x: 0, y: 0, w: srcW, h: srcH };
  const [w, h, x, y] = m.slice(1).map(Number);
  // only a thin bar is a bar; a dark picture is not trimmed into a sliver
  return w >= srcW * 0.8 && h >= srcH * 0.8 ? { x, y, w, h } : { x: 0, y: 0, w: srcW, h: srcH };
}

export function renderShortCover({ picture, srcW, srcH, box, rel = "", lines, look = "punch", out, ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts" }) {
  const b = blackBorders(picture, srcW, srcH, ffmpeg);
  const v = verticalCrop(b.w, b.h, labelled(rel) ? { x: 0, y: 0, w: 1, h: 1 } : box || { x: 0, y: 0, w: 1, h: 1 });
  const c = { ...v, x: v.x + b.x, y: v.y + b.y };
  const ass = out.replace(/\.jpe?g$/i, ".cover.ass");
  fs.writeFileSync(ass, shortCoverAss(lines, look), "utf8");
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const vf = [
    `[0:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${H}:flags=lanczos,setsar=1,${pictureFilter(look).replace(/,noise=[^,]*/, "")}[pic]`,
    // Clamp alpha explicitly: gradient interpolation outside its endpoints blacked out the upper subject.
    `color=c=black:s=${W}x${H}:d=0.04,format=rgba,geq=r=0:g=0:b=0:a='224*clip((Y-${H / 2})/${H / 2},0,1)'[fade]`,
    `[pic][fade]overlay=0:0:format=auto,subtitles='${esc(ass)}':fontsdir='${esc(fontsDir)}'[v]`,
  ].join(";");
  const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-i", picture, "-filter_complex", vf, "-map", "[v]", "-frames:v", "1", "-q:v", "2", out], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  if (r.status !== 0) throw new Error(`Shorts kapağı çizilemedi: ${String(r.stderr || "").slice(-300)}`);
  return out;
}

/** The cover as the Short's very first frame (1/30 s), so it can be picked as the thumbnail in the YouTube app. */
export function prependCoverFrame({ video, cover, out, ffmpeg = "ffmpeg" }) {
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-loop", "1", "-framerate", "30", "-t", (1 / 30).toFixed(4), "-i", cover, "-i", video,
    "-filter_complex", `[0:v]scale=${W}:${H},setsar=1,format=yuv420p,fps=30[c];[1:v]setsar=1,format=yuv420p,fps=30[m];[c][m]concat=n=2:v=1:a=0[v];[1:a]adelay=33|33[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-threads", SHORT_THREADS, "-preset", "medium", "-crf", "19", ...SHORT_VBV, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
  const r = spawnSync(ffmpeg, ["-nostdin", ...args], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: PIC_ENCODE_MS });
  if (r.status !== 0) throw new Error(`Kapak karesi eklenemedi: ${String(r.stderr || "").slice(-300)}`);
  return out;
}

/** A still at least this long gets a punch-in cut. */
export const PUNCH_MIN_DUR = 2.8;

/**
 * PUNCH-IN (Oct 2026 study: the top channels change the picture every ~1.5 s in a hook; a Short held one picture
 * per sentence, 3-5 s). A still of PUNCH_MIN_DUR s or more becomes two shots: the first 55 % as framed, then a hard
 * cut ~1.35x closer on the same subject. Only when the closer cut is really closer (a big enough picture —
 * verticalCrop never goes under 1400 px, so it stays sharp); clips and small pictures are left alone.
 */
/**
 * THE FIRST SECOND MOVES (1.16.16, Shorts hook lesson: "ilk saniyede bir şey hareket etsin — bir zoom, bir kesim, bir
 * yazı"; the best-kept Short had 3 cuts in its first 1.5 s). A one-sentence opening held its picture ~2.5-3 s before
 * the punch cut: the opening still (≥ HOOK_PUNCH_MIN s) is cut closer at HOOK_CUT_AT instead of at 55 %.
 */
export const HOOK_CUT_AT = 1.2;
export const HOOK_PUNCH_MIN = 2.0;

export function punchInSegments(segments) {
  const out = [];
  for (const [k, g] of (segments || []).entries()) {
    const first = k === 0;
    // An eyewitness clip (ew-) is never cut closer: its source label sits at the frame's edge.
    if (g?.kind !== "still" || !(g.dur >= (first ? HOOK_PUNCH_MIN : PUNCH_MIN_DUR)) || !g.srcW || !g.srcH || g.punch || labelled(g.rel)) { out.push(g); continue; }
    const b = g.box || { x: 0, y: 0, w: 1, h: 1 };
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const bw = b.w / 1.35, bh = b.h / 1.35;
    const box2 = { x: Math.max(0, Math.min(1 - bw, cx - bw / 2)), y: Math.max(0, Math.min(1 - bh, cy - bh / 2)), w: bw, h: bh };
    const c1 = verticalCrop(g.srcW, g.srcH, b);
    const c2 = verticalCrop(g.srcW, g.srcH, box2);
    if (c2.h > c1.h * 0.85) { out.push(g); continue; }
    const d1 = +(first ? Math.min(HOOK_CUT_AT, g.dur * 0.55) : g.dur * 0.55).toFixed(3);
    out.push({ ...g, dur: d1 }, { ...g, dur: +(g.dur - d1).toFixed(3), box: box2, punch: true });
  }
  return out;
}

/**
 * Segment lengths on the 30 fps frame grid: every cut lands on round(start·fps) of the running total, so the
 * captions and slams (absolute narration times in the ASS) never drift a frame off their picture. Before
 * (Bakker Short, Oct 2026) each segment was trimmed in seconds, the leftovers piled up and "FOREVER" flashed
 * over the corridor before its own picture and faded over the next one ("bir şey geliyor hızlıca kayboluyor").
 */
export function frameGrid(segments, fps = 30) {
  let t = 0;
  let at = 0;
  return (segments || []).map((g) => {
    t += g.dur;
    const frames = Math.max(2, Math.round(t * fps) - at);
    at += frames;
    return { ...g, frames, dur: frames / fps };
  });
}

/** Start time of every segment on the frame grid (and the end of the last one). */
export function gridCuts(segments, fps = 30) {
  const out = [0];
  let f = 0;
  for (const g of frameGrid(segments, fps)) out.push((f += g.frames) / fps);
  return out;
}

/**
 * PHONE FOOTAGE FITS (kanal sahibi, Panama Short, Oct 2026: "bazı görüntüler ekrana sığmıyor telefon falan… ölçek
 * önemli"). A 428x854 eyewitness clip from a compilation was cut to 9:16 and stretched 2.5x: its own black bars and
 * rounded corners showed, "BAY VIEW" lost its "BA", and it went soft. An eyewitness clip, a small portrait picture or
 * one narrower than 9:16 is FITTED instead: its bars trimmed, the whole frame as a card near the top (its label clear
 * of the hook line), over a blurred, darkened copy of itself. Landscape and big pictures still fill the screen.
 */
export const FIT_TOP = 70;
export function fitsWhole(g) {
  if (!g) return false;
  if (labelled(g.rel)) return true;
  const w = Number(g.srcW) || 0, h = Number(g.srcH) || 0;
  if (!w || !h || h < w) return false;
  // Narrower than the screen (filling cuts its ends), or so small that filling blows it up past FIT_MAX_UP.
  if (w / h < 9 / 16 - 0.01) return true;
  return H / verticalCrop(w, h).h > FIT_MAX_UP;
}
export const FIT_MAX_UP = 2.2;

/** The fitted card's size: inside 92 % of the width and the height below FIT_TOP, never more than 2.2x enlarged. */
export function fitCard(w, h) {
  const s = Math.min((W * 0.92) / w, (H - FIT_TOP - 150) / h, FIT_MAX_UP);
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  return { w: even(w * s), h: even(h * s), x: Math.round((W - even(w * s)) / 2), y: FIT_TOP };
}

/** Black bars of a clip (over its window) or a still: cropdetect, kept only when it trims a thin edge. */
export function clipBorders(file, srcW, srcH, { start = 0, dur = 2, ffmpeg = "ffmpeg" } = {}) {
  if (!/\.(mp4|mov|webm|mkv|m4v)$/i.test(String(file))) return blackBorders(file, srcW, srcH, ffmpeg);
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-ss", String(start), "-t", String(Math.max(0.5, dur)), "-i", file, "-vf", "cropdetect=limit=24:round=2:reset=0", "-an", "-f", "null", "-"], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: PIC_PROBE_MS });
  const m = [...String(r.stderr || "").matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  if (!m) return { x: 0, y: 0, w: srcW, h: srcH };
  const [w, h, x, y] = m.slice(1).map(Number);
  return w >= srcW * 0.8 && h >= srcH * 0.8 && w <= srcW && h <= srcH ? { x, y, w, h } : { x: 0, y: 0, w: srcW, h: srcH };
}

export function renderPictureTeaser({ segments: given, voiceFile, musicFile, thumbFile, assFile, out, total, sfx = {}, slamAt = [], ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts", look: lookId = null, musicStart = 0, musicGain = 0.22 }) {
  const segments = frameGrid(punchInSegments(given));
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  const parts = [];
  // The Short's look (docu-shorts-looks.js): its grade, grain and vignette, its camera speed, its flash.
  const L = lookId ? SHORT_LOOKS[lookId] : null;
  const pz = L?.push ?? 0.07;
  const flash = lookId ? flashColour(lookId) : "white";
  segments.forEach((g, i) => {
    const frames = g.frames;
    const c = verticalCrop(g.srcW, g.srcH, g.box);
    // No push on an eyewitness still: a 7 % zoom cut "Impresionantes" to "presionantes" (Panama Short, Oct 2026).
    const push = labelled(g.rel) ? "1" : i % 2 ? `${(1 + pz).toFixed(3)}-${pz}*on/${frames}` : `1+${pz}*on/${frames}`;
    const lift = g.kind === "clip" ? null : darkLift(meanLuma(ffmpeg, g.abs));
    const look = `${lift ? `${lift},` : ""}${lookId ? pictureFilter(lookId) : "eq=contrast=1.05:saturation=0.93,noise=alls=6:allf=t,vignette=angle=PI/5"}`;
    if (fitsWhole(g)) {
      const b = clipBorders(g.abs, g.srcW, g.srcH, { start: g.kind === "clip" ? g.clipStart : 0, dur: g.dur, ffmpeg });
      const card = fitCard(b.w, b.h);
      if (g.kind === "clip") args.push("-ss", g.clipStart.toFixed(2), "-t", (g.dur + 0.1).toFixed(2), "-i", g.abs);
      else args.push("-loop", "1", "-framerate", "30", "-t", (g.dur + 0.1).toFixed(2), "-i", g.abs);
      parts.push(
        `[${i}:v]crop=${b.w}:${b.h}:${b.x}:${b.y},fps=30,setsar=1,split[fa${i}][fb${i}]`,
        `[fa${i}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=40,${BLUR_FILL}[bg${i}]`,
        `[fb${i}]scale=${card.w}:${card.h}:flags=lanczos,setsar=1[fg${i}]`,
        `[bg${i}][fg${i}]overlay=${card.x}:${card.y},${look},tpad=stop_mode=clone:stop_duration=${g.dur.toFixed(3)},trim=end_frame=${frames},setpts=PTS-STARTPTS,setsar=1[s${i}]`,
      );
    } else if (g.kind === "clip") {
      args.push("-ss", g.clipStart.toFixed(2), "-t", (g.dur + 0.1).toFixed(2), "-i", g.abs);
      // A clip shorter than its sentence (an AI clip is 5 or 10 s) holds its last frame.
      parts.push(`[${i}:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${H}:flags=lanczos,fps=30,setsar=1,${look},tpad=stop_mode=clone:stop_duration=${g.dur.toFixed(3)},trim=end_frame=${frames},setpts=PTS-STARTPTS,setsar=1[s${i}]`);
    } else {
      args.push("-loop", "1", "-framerate", "30", "-t", (g.dur + 0.1).toFixed(2), "-i", g.abs);
      parts.push(`[${i}:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${Math.round(W * 1.1)}:${Math.round(H * 1.1)}:flags=lanczos,setsar=1,zoompan=z='${push}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,${look},trim=end_frame=${frames},setpts=PTS-STARTPTS,setsar=1[s${i}]`);
    }
  });
  const n = segments.length;
  const endDur = Math.max(1.5, total - segments.reduce((a, g) => a + g.dur, 0));
  // A standalone Short has no film to send to: no cover card, the last picture holds to the end.
  const hasEnd = !!thumbFile && fs.existsSync(thumbFile);
  if (hasEnd) args.push("-loop", "1", "-t", endDur.toFixed(2), "-i", thumbFile);
  else args.push("-f", "lavfi", "-t", "0.1", "-i", "color=c=black:s=16x16:r=30");
  args.push("-i", voiceFile);
  let next = n + 2;
  let musicIn = null;
  if (musicFile) {
    args.push("-i", musicFile);
    musicIn = next++;
  }
  const sfxIn = {};
  for (const k of ["whoosh", "hit"]) {
    if (sfx[k] && fs.existsSync(sfx[k])) {
      args.push("-i", sfx[k]);
      sfxIn[k] = next++;
    }
  }
  // End card: the cover fitted across the width over its own blurred copy.
  if (hasEnd) {
    parts.push(`[${n}:v]fps=30,setsar=1,split[ea][eb]`, `[ea]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=30,${BLUR_FILL}[eg]`, `[eb]scale=${W - 60}:-2[et]`, `[eg][et]overlay=(W-w)/2:(H-h)/2,setpts=PTS-STARTPTS,setsar=1[endc]`);
    parts.push(`${segments.map((_, i) => `[s${i}]`).join("")}[endc]concat=n=${n + 1}:v=1:a=0[cat]`);
  } else {
    parts.push(`[${n}:v]nullsink`);
    parts.push(`${segments.map((_, i) => `[s${i}]`).join("")}concat=n=${n}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${Math.max(0, endDur).toFixed(2)}[cat]`);
  }
  parts.push(`[cat]subtitles='${esc(assFile)}':fontsdir='${esc(fontsDir)}',fade=t=in:d=0.18:color=${flash},fade=t=out:st=${(total - 0.4).toFixed(2)}:d=0.4,format=yuv420p[v]`);
  const mix = ["[vo]"];
  parts.push(`[${n + 1}:a]apad,atrim=0:${total.toFixed(2)},volume=1.0[vo]`);
  if (musicIn != null) {
    parts.push(`[${musicIn}:a]atrim=${musicStart.toFixed(2)}:${(musicStart + total).toFixed(2)},asetpts=PTS-STARTPTS,volume=${musicGain},afade=t=in:d=0.4,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[mus]`);
    mix.push("[mus]");
  }
  const cuts = [];
  let t = 0;
  // A punch-in is a cut inside the same picture: no whoosh on it (one whoosh per new picture, as before).
  const quiet = new Set();
  segments.forEach((g, k) => {
    t += g.dur;
    cuts.push(t);
    if (segments[k + 1]?.punch) quiet.add(cuts.length - 1);
  });
  const openEnd = slamAt.length ? slamAt.at(-1) + 0.3 : 0;
  const whooshAt = cuts.slice(0, -1).filter((c, k) => c > openEnd && !quiet.has(k)).map((c) => Math.max(0, c - 0.28));
  const hitAt = [...(slamAt.length ? slamAt : [0]), ...(hasEnd ? [cuts.at(-1)] : [])];
  const place = (inIdx, times, gain, tag) => {
    if (inIdx == null || !times.length) return;
    parts.push(`[${inIdx}:a]volume=${gain},asplit=${times.length}${times.map((_, k) => `[${tag}${k}]`).join("")}`);
    times.forEach((at, k) => {
      const ms = Math.round(at * 1000);
      parts.push(`[${tag}${k}]adelay=${ms}|${ms},apad,atrim=0:${total.toFixed(2)}[${tag}o${k}]`);
      mix.push(`[${tag}o${k}]`);
    });
  };
  place(sfxIn.whoosh, whooshAt, 0.28, "w");
  place(sfxIn.hit, hitAt, 0.5, "h");
  parts.push(`${mix.join("")}amix=inputs=${mix.length}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
  args.push("-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[aout]", "-t", total.toFixed(2), "-c:v", "libx264", "-threads", SHORT_THREADS, "-preset", "medium", "-crf", "18", ...SHORT_VBV, "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out);
  const r = spawnSync(ffmpeg, ["-nostdin", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true, killSignal: "SIGKILL", timeout: PIC_ENCODE_MS });
  if (r.status !== 0) throw new Error(`Shorts render başarısız: ${String(r.stderr || r.error?.message || "").slice(-600)}`);
  return out;
}

export { sizeOf };

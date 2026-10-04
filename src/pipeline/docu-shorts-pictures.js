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
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { callJSON, callVisionJSON } from "../llm.js";
import { openAIImagesProvider } from "./openai-images.js";
import { donemYili, hikayeDonemi } from "./docu-archive.js";
import { SHORT_LOOKS, flashColour, pictureFilter } from "./docu-shorts-looks.js";

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
  const seen = new Set();
  const out = [];
  const add = (a) => {
    if (seen.has(a.rel)) return;
    const abs = path.join(pub, a.rel);
    if (!fs.existsSync(abs)) return;
    seen.add(a.rel);
    out.push({ ...a, abs, id: `p${out.length + 1}` });
  };
  scenes.forEach((s, i) => {
    const say = String(s.say || "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
    if (s.video && /\.mp4$/i.test(s.video)) {
      add({ rel: s.video, kind: "clip", still: s.image && STILL.test(s.image) ? path.join(pub, s.image) : null, clipStart: Number(s.videoStart) || 0, clipDur: Number(s.videoDur) || 0, srcW: s.videoW || 1920, srcH: s.videoH || 1080, scene: i, say });
    }
    for (const rel of [s.image, ...(Array.isArray(s.images) ? s.images : [])]) {
      if (!rel || !STILL.test(rel) || /\.lift\./.test(rel) || /\/clip-/.test(rel)) continue;
      add({ rel, kind: "still", srcW: s.imgW || 0, srcH: s.imgH || 0, scene: i, say, prompt: /\/img-/.test(rel) ? s.imagePrompt || "" : "" });
    }
  });
  return out;
}

function thumbB64(ffmpeg, file, w = 448) {
  const tmp = path.join(os.tmpdir(), `nova-pic-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", `scale=${w}:-2`, "-q:v", "5", tmp]);
  if (r.status !== 0 || !fs.existsSync(tmp)) return null;
  const b = fs.readFileSync(tmp).toString("base64");
  fs.rmSync(tmp, { force: true });
  return b;
}

function sizeOf(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = String(r.stderr || "").match(/, (\d{2,5})x(\d{2,5})[, ]/);
  return m ? { w: +m[1], h: +m[2] } : null;
}

/**
 * Mean brightness (0-255) of the darkest of n frames in [start, start+dur] of a clip, or null. The vision
 * catalogue sees one frame; the 1929 Short's trading-floor footage turned into a black shoulder after it.
 */
export function darkestFrame(ffmpeg, file, start, dur, n = 6) {
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(Math.max(0, start)), "-t", String(dur), "-i", file, "-vf", `fps=${(n / Math.max(0.5, dur)).toFixed(3)},scale=32:18,format=gray`, "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 24 });
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
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", "scale=32:18,format=gray", "-f", "rawvideo", "pipe:1"], { maxBuffer: 1 << 20 });
  const b = r.stdout;
  if (r.status !== 0 || !b || b.length < 576) return null;
  let s = 0;
  for (let i = 0; i < 576; i++) s += b[i];
  return s / 576;
}

/**
 * A gamma lift for a dark still, before the look's grade: a dark AI picture under Noir's contrast and
 * vignette went black on a phone (the Dancing Plague Short's "red shoes"). Null when it is bright enough.
 */
export function darkLift(luma, floor = 72) {
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
        model: settings.docuShortsVisionModel || "claude-sonnet-5-5",
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
  return assets.map((a) => ({ ...a, ...(cache[a.rel] || {}) })).filter((a) => a.what);
}

/** The story's main year (script.era, else the years in the narration), or null. */
export function storyYear(jobDir) {
  return donemYili(hikayeDonemi(propsOf(jobDir)?.script || {}));
}

// 1929 Short: "modern color photo" of the NYSE facade, drone footage of a desert plateau and a cliff
// stood in for a 1929 story. Words the vision catalogue uses for a present-day picture.
const MODERN_LOOK = /\bmodern\b|\bcontemporary\b|present[- ]day|\bdrone\b|\bcolou?r (?:photo|photograph|footage|shot|film|image|video)/i;

/** A picture that belongs on screen in a story of this year: no present-day pictures before 1990. */
export function periodFit(a, year) {
  if (year == null || year >= 1990) return true;
  return !a.modern && !MODERN_LOOK.test(a.what || "");
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

/** A new-picture prompt with the real person taken out: an anonymous figure, never a likeness. */
export function anonymise(prompt, name) {
  let p = String(prompt || "");
  for (const w of String(name || "").split(/\s+/).filter((x) => x.length > 2)) p = p.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}('s)?\\b`, "gi"), "a man");
  return `${p.replace(/\ba man(?:\s+a man)+/gi, "a man")}. An anonymous figure seen from behind or in silhouette, no recognisable face`;
}

const PIC_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "Label at the top during the opening, 3-6 words, ALL CAPS, naming the story" },
    opening: {
      type: "object",
      properties: {
        say: { type: "string", description: "Exactly three fragments, each ending with a full stop, each naming one concrete thing of the story, the third the twist: 'One chain. One hill. And a sultan of twenty-one.'" },
        words: { type: "array", items: { type: "string" }, description: "Exactly 3 words, one per fragment, copied as spoken, slammed on screen when said" },
        pictures: { type: "array", items: { type: "string" }, description: "Exactly 3 picture ids (p12), one per fragment, each SHOWING that fragment's thing" },
      },
      required: ["say", "words", "pictures"],
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
    title: { type: "string", description: "YouTube Shorts title, max 70 chars, no hashtags" },
    description: { type: "string", description: "2-3 sentences that send viewers to the full documentary" },
  },
  required: ["hook", "opening", "beats", "title", "description"],
  additionalProperties: false,
};

/** Claude: the teaser's words, and for every sentence the picture that shows it. */
export async function planPictureTeaser({ cues, title = "", catalog: all, year = null, llm = callJSON, settings = {}, usage = null, logFn = () => {}, maxNew = 3 }) {
  const story = cues.map((c) => c.t).join(" ").replace(/\s+/g, " ").slice(0, 14000);
  const catalog = all.filter((a) => periodFit(a, year));
  if (catalog.length < all.length) logFn(`Shorts: ${all.length - catalog.length} günümüz görseli ${year} hikâyesinden çıkarıldı`);
  const pics = catalog
    .filter((a) => !a.textHeavy)
    .map((a) => `${a.id} · ${a.kind === "clip" ? "footage" : "still"} · q${a.quality} · ${a.what}${a.say ? ` · narration over it: "${a.say.slice(0, 90)}"` : ""}`)
    .join("\n");
  const res = await llm({
    system: "You write and picture-edit YouTube Shorts that sell a full-length history documentary on the same channel. Return only the requested JSON.",
    user: [
      `The full documentary: "${title}". Its narration:`,
      story,
      "",
      "Its picture archive (id · kind · q = how striking full screen, 1-5 · what it shows):",
      pics,
      "",
      "Write a NEW vertical Short (105-140 words of narration, 45-55 s) whose only job is to make the viewer watch the full documentary:",
      "- the opening is the hook: three short spoken fragments with a rhythm ('A recipe. A street. And a betrayal.'), each naming one concrete thing of this story, the third the twist; each fragment gets the picture of that thing",
      "- then 3-5 of the most striking, concrete moments (numbers, names, reversals), each raising the stakes; never give away the ending; the last beat calls to the full documentary on the channel",
      "- plain spoken English, short sentences, no hashtags, emojis or stage directions",
      "- EVERY sentence gets ONE picture that shows exactly what it says: the person it names (never someone else), the object, the place, the event. Prefer q4-q5 pictures with faces, action, fire, crowds, ships, armies. Never a picture of something the sentence does not talk about",
      "- never picture a figure of speech literally: a 'plateau', a 'cliff', a 'storm', a 'bloodbath', a 'bubble' are words, not landscapes — show the person who said it or the real thing that happened (the crowd, the trading floor, the ruined man)",
      `- every picture must belong to the story's time${year != null ? ` (${year < 0 ? `${-year} BC` : year})` : ""}: no present-day photos or footage`,
      "- a real person the sentence is about gets THEIR archive portrait (find it by the description or by the narration over it); a portrait may come back once when the story returns to that person; otherwise never the same picture twice",
      `- if nothing in the archive shows a sentence, use "new" and write newPrompt (at most ${maxNew} new pictures in the whole Short) — only for scenes without a real, named person: places, objects, crowds, anonymous figures; never a likeness of a real person`,
      "- a sentence with a striking number or date: put it in figure (it is printed big on the picture when said)",
    ].join("\n"),
    schema: PIC_SCHEMA,
    model: settings.docuShortsModel || "claude-sonnet-5-5",
    maxTokens: 3500,
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
  const opening = frags.length === 3 ? frags.map((say, k) => ({ say, slam: String(op.words?.[k] || "").replace(/[^\p{L}\p{N}'-]/gu, "").toUpperCase(), ...(pick(op.pictures?.[k]) || {}) })) : [];
  const beats = (res?.beats || []).map((b) => ({ say: clean(b.say), figure: clean(b.figure), figureWord: clean(b.figureWord), person: clean(b.person), ...(pick(b.picture === "new" ? "" : b.picture, clean(b.newPrompt), clean(b.person)) || {}) })).filter((b) => b.say);
  if (beats.length < 3) throw new Error("teaser planı eksik");
  return { hook: clean(res.hook), beats: [...opening, ...beats], title: clean(res.title), description: clean(res.description) };
}

/** A new vertical picture for a sentence the archive cannot show (OpenAI GPT Image, 864x1536). */
export async function newVerticalPicture({ prompt, dir, settings, style = "" }) {
  const full = `${prompt}. ${style} Vertical 9:16 composition, the subject large in the frame, cinematic natural light, photographic detail, no text, no captions, no borders.`;
  const url = await openAIImagesProvider.textToImage(full, { ...settings, kanvasW: W, kanvasH: H });
  const m = /^data:[^;]+;base64,(.+)$/.exec(url || "");
  if (!m) throw new Error("görsel üretilemedi");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.jpg`);
  fs.writeFileSync(file, Buffer.from(m[1], "base64"));
  return file;
}

/** The 9:16 window of a w x h picture around its subject box (pixels), never outside the picture. */
export function verticalCrop(w, h, box = { x: 0, y: 0, w: 1, h: 1 }) {
  let cw = Math.round((h * 9) / 16);
  let ch = h;
  if (cw > w) {
    cw = w;
    ch = Math.min(h, Math.round((w * 16) / 9));
  }
  const cx = (box.x + box.w / 2) * w;
  // A face or a figure sits in the upper part of the frame, where the eye goes first.
  const cy = (box.y + Math.min(box.h, 0.5) * 0.45) * h;
  const x = Math.round(Math.max(0, Math.min(w - cw, cx - cw / 2)));
  const y = Math.round(Math.max(0, Math.min(h - ch, cy - ch * 0.38)));
  return { x, y, w: cw - (cw % 2), h: ch - (ch % 2) };
}

/**
 * Vertical teaser render: every segment is a full-screen 9:16 picture (a slow push in or out toward its
 * subject, light grain, a soft vignette) or a 9:16 window of footage; then the cover end card.
 * Sound as before: the new narration, the film's music under it, a hit on each slammed word, a whoosh on
 * the later cuts, -14 LUFS.
 */
export function renderPictureTeaser({ segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx = {}, slamAt = [], ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts", look: lookId = null, musicStart = 0, musicGain = 0.22 }) {
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  const parts = [];
  // The Short's look (docu-shorts-looks.js): its grade, grain and vignette, its camera speed, its flash.
  const L = lookId ? SHORT_LOOKS[lookId] : null;
  const pz = L?.push ?? 0.07;
  const flash = lookId ? flashColour(lookId) : "white";
  segments.forEach((g, i) => {
    const frames = Math.max(2, Math.round(g.dur * 30));
    const c = verticalCrop(g.srcW, g.srcH, g.box);
    const push = i % 2 ? `${(1 + pz).toFixed(3)}-${pz}*on/${frames}` : `1+${pz}*on/${frames}`;
    const lift = g.kind === "clip" ? null : darkLift(meanLuma(ffmpeg, g.abs));
    const look = `${lift ? `${lift},` : ""}${lookId ? pictureFilter(lookId) : "eq=contrast=1.05:saturation=0.93,noise=alls=6:allf=t,vignette=angle=PI/5"}`;
    if (g.kind === "clip") {
      args.push("-ss", g.clipStart.toFixed(2), "-t", (g.dur + 0.1).toFixed(2), "-i", g.abs);
      parts.push(`[${i}:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${H}:flags=lanczos,fps=30,setsar=1,${look},trim=0:${g.dur.toFixed(3)},setpts=PTS-STARTPTS,setsar=1[s${i}]`);
    } else {
      args.push("-loop", "1", "-framerate", "30", "-t", (g.dur + 0.1).toFixed(2), "-i", g.abs);
      parts.push(`[${i}:v]crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${Math.round(W * 1.1)}:${Math.round(H * 1.1)}:flags=lanczos,setsar=1,zoompan=z='${push}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30,${look},trim=0:${g.dur.toFixed(3)},setpts=PTS-STARTPTS,setsar=1[s${i}]`);
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
    parts.push(`[${n}:v]fps=30,setsar=1,split[ea][eb]`, `[ea]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=30,eq=brightness=-0.25[eg]`, `[eb]scale=${W - 60}:-2[et]`, `[eg][et]overlay=(W-w)/2:(H-h)/2,setpts=PTS-STARTPTS,setsar=1[endc]`);
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
  for (const g of segments) {
    t += g.dur;
    cuts.push(t);
  }
  const openEnd = slamAt.length ? slamAt.at(-1) + 0.3 : 0;
  const whooshAt = cuts.slice(0, -1).filter((c) => c > openEnd).map((c) => Math.max(0, c - 0.28));
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
  args.push("-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[aout]", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out);
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Shorts render başarısız: ${String(r.stderr || r.error?.message || "").slice(-600)}`);
  return out;
}

export { sizeOf };

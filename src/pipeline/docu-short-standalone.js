// STANDALONE SHORTS — a vertical Short on its own subject, not a teaser of a long video.
//
// User (Oct 2026): "5-10 shorts çıkar, farklı konulardan ... sadece 1 tanesi yönlendirmeli olacak, o da
// uzun videodan çıkacak; kalan 9'u da izlenecek konseptte olsun ... şu an piyasada ünlü olan konu
// neyse onu baz al". And: every Short its own look and its own kind of opening.
//
//   research (web)  →  plan (Claude: words, opening, one picture per sentence)
//   →  pictures: the real person / place / document from the archive (docu-archive.js, the long
//      video's own searcher, period rules and picker), a new vertical AI picture only where no real,
//      identifiable person is shown
//   →  voice (ElevenLabs)  →  music + hits from the audio library  →  render in the Short's look.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { callJSON, callText } from "../llm.js";
import { resolveArchive } from "./docu-archive.js";
import { describePictures, newVerticalPicture, renderPictureTeaser, sizeOf } from "./docu-shorts-pictures.js";
import { beatStarts, buildTeaserAss, newPictureStyle, numberEnd, shortVoiceText, slamTimes, slamWord, speakTeaser } from "./docu-shorts.js";
import { OPENINGS, SHORT_LOOKS, pickLook } from "./docu-shorts-looks.js";
import { kunyeUret } from "./kunye.js";
import { commonsMetadata } from "./provenance.js";
import { animateSegments, motionDir } from "./docu-shorts-motion.js";

const GENRES = ["documentary", "crime", "epic", "finance", "science", "inspire", "horror"];
const MOODS = ["curious", "tension", "dread", "sad", "triumph", "reveal", "calm"];

const PIC = {
  type: "object",
  properties: {
    source: { type: "string", enum: ["archive", "ai"], description: "archive = a REAL photo, painting, document or object exists and must be found; ai = no real photo exists or no identifiable real person is shown" },
    search: { type: "string", description: "archive: English archive search query, proper name + place + year, 3-6 words ('Vasili Arkhipov portrait', 'Boston molasses flood 1919'); else empty" },
    prompt: { type: "string", description: "English picture description of exactly this sentence's moment, era-accurate, vertical composition; NEVER a real person's face (anonymous figures only); used when the archive has nothing" },
    person: { type: "string", description: "the real person this picture shows, full name, or empty" },
    motion: { type: "string", description: "how this picture MOVES when it is animated (5 s): the natural motion in the scene and one slow camera move ('fog rolls over the wet cobbles, a lantern sways, slow push-in'); empty for a real person's photograph or a document (never animated)" },
    commons: { type: "string", description: "archive only: the exact Wikimedia Commons file title if you know it ('File:Cottingley Fairies 1.jpg'), else empty" },
  },
  required: ["source", "search", "prompt", "person", "motion", "commons"],
  additionalProperties: false,
};

const SCHEMA = {
  type: "object",
  properties: {
    titles: { type: "array", items: { type: "string" }, description: "3 different curiosity-gap titles (see the title rule), max 60 chars each" },
    title: { type: "string", description: "the strongest of the 3 titles" },
    description: { type: "string", description: "one line that deepens the hook + at most 3 hashtags (#shorts, #history and one topic tag)" },
    hook: { type: "string", description: "3-6 word label shown at the top after the opening, ALL CAPS" },
    genre: { type: "string", enum: GENRES, description: "the subject's spirit: crime = mystery/unsolved/case, epic = war/empire/battle, finance = money/markets, science = discovery/space/what-if, inspire = a life, horror = dark/paranormal, documentary = bizarre/everyday history" },
    mood: { type: "string", enum: MOODS },
    year: { type: "integer", description: "the story's main year (negative = BC), 0 if none" },
    opening: {
      type: "object",
      properties: {
        say: { type: "string", description: "the opening as spoken (see the opening rule)" },
        words: { type: "array", items: { type: "string" }, description: "triple: exactly 3 words, one per fragment, copied as spoken; number: the number as printed ('21,000'); otherwise the one key word" },
        who: { type: "string", description: "quote: who said it (name, year); otherwise empty" },
        pictures: { type: "array", items: PIC, description: "triple: 3 pictures, one per fragment; otherwise 1" },
      },
      required: ["say", "words", "who", "pictures"],
      additionalProperties: false,
    },
    beats: {
      type: "array",
      description: "6-9 beats after the opening, in order",
      items: {
        type: "object",
        properties: {
          say: { type: "string", description: "ONE spoken sentence, 6-16 words" },
          picture: PIC,
          figure: { type: "string", description: "a striking number or date in this sentence as printed big ('21,000 GALLONS'); else empty" },
          figureWord: { type: "string", description: "the first spoken word of that number; else empty" },
        },
        required: ["say", "picture", "figure", "figureWord"],
        additionalProperties: false,
      },
    },
  },
  required: ["titles", "title", "description", "hook", "genre", "mood", "year", "opening", "beats"],
  additionalProperties: false,
};

const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

/*
 * What the Shorts that hold viewers do (YouTube search, Oct 2026): "Bizarre punishments from Ancient
 * Rome (Part three)" 43M, "Crazy Facts About Queen Cleopatra" 21M, "Normal Photos With Disturbing
 * Backstory" 5.1M, "She Sold Poison as Beauty Products…" 318K — while the same subjects titled by their
 * name and hashtags ("The mystery of the Dancing Plague of 1518 #history #shorts") sat at 19-106 views.
 * The subject does not sell; the gap does. Title patterns rotate like the looks, so the channel's
 * words never fall into one formula either.
 */
export const TITLE_PATTERNS = {
  who: "The [person or role] Who [did the unexpected thing] — ('The Doctor Who Saved Lives in Auschwitz')",
  nobody: "[A number] [people or things] [did something impossible]. Nobody Knows Why.",
  why: "Why [the strange fact]? — a real question the Short answers",
  secret: "This [ordinary thing] Hid a [dark or strange] Secret",
  true: "[A claim that sounds false]… And It Was True",
  then: "[Someone] Did [X]. Then [the twist].",
  facts: "[N] [Adjective] Facts About [subject] — a list Short, numbered, the strongest last",
};

/** The Short's shape: one story told forward, or a quick list of 3-5 linked facts (the strongest last). */
export const SHORT_FORMATS = {
  story: "ONE story told forward: the strangest moment first, then how it happened, the detail nobody knows, the payoff.",
  facts: "a LIST of 3-5 separate, linked facts or cases about the subject, each 2 short sentences with its own picture, rising in shock, the strongest last; a series can follow (say nothing like 'part one' aloud).",
};
const hash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 10);

/** Verified facts for the Short (web search): a short, sourced research note. */
export async function researchShort({ topic, angle = "", settings = {}, usage = null, logFn = () => {}, call = callText }) {
  return call({
    system: "You are a meticulous researcher preparing facts for a 50-second YouTube Short. English. Only verifiable facts.",
    user: [
      `Subject: "${topic}"${angle ? ` — angle: ${angle}` : ""}`,
      "Give 10-14 verified facts with exact dates, numbers and names; the single most surprising detail; what is myth vs fact; the real people involved and whether photographs/paintings of them exist; and the sources (title + URL).",
      "If the subject is recent news, give the latest confirmed facts with their dates. Mark anything uncertain. Under 600 words.",
    ].join("\n"),
    webSearch: true,
    maxTokens: 24000,
    usage,
    logFn,
    ...(settings.docuFastModel ? { model: settings.docuFastModel } : {}),
  });
}

/** Claude: the Short's narration, its opening and one picture per sentence. */
export async function planShort({ topic, angle = "", research, opening = "triple", format = "story", titlePattern = "who", llm = callJSON, settings = {}, usage = null, logFn = () => {} }) {
  const plan = await llm({
    system: "You write and picture-edit viral, accurate YouTube Shorts for an English history/mystery/finance channel. Return only the requested JSON.",
    user: [
      `SUBJECT: "${topic}"${angle ? ` — angle: ${angle}` : ""}`,
      "",
      "RESEARCH (facts only from here):",
      research,
      "",
      "Write a 45-55 s vertical Short (115-140 words of narration in total) that people watch to the end and share:",
      `- SHAPE: ${SHORT_FORMATS[format] || SHORT_FORMATS.story}`,
      `- OPENING (${opening}): ${OPENINGS[opening] || OPENINGS.triple}. No context first: the first spoken words ARE the strangest concrete fact of the subject. It lands in the first 2 seconds and stops the scroll.`,
      "- then 6-9 sentences: rising stakes, concrete numbers, names and one detail nobody knows; the last sentence is a payoff or twist that rewards watching (never 'follow for more').",
      "- LOOP: the last sentence leads naturally back into the first (a viewer who keeps watching hears the opening again and it still makes sense).",
      `- TITLE: never the subject's name alone, never hashtags. Pattern for this Short: ${TITLE_PATTERNS[titlePattern] || TITLE_PATTERNS.who}. Write 3 titles (two in this pattern, one free), each a curiosity gap the Short closes, max 60 characters, true to the facts; pick the strongest as title.`,
      "- HOOK label (on screen after the opening): 3-6 words that ADD to the title, never repeat it.",
      "- plain spoken English, short sentences, no hashtags, emojis or stage directions in the narration.",
      "- EVERY sentence gets ONE picture that shows exactly what it says. A real person, place, ship, building, document or object that was photographed or painted: source archive with a precise search. Only where no real picture can exist (before photography, a reconstruction, an anonymous moment): source ai, never showing a real person's face.",
      "- before photography the archive still has the period's own pictures: paintings, engravings, woodcuts, chronicles, maps of the event or the place (Brueghel's drawing of the 1564 dancers for a dancing mania) — search for those before choosing ai.",
      "- never a modern book cover, a museum label or a modern scholar's portrait as a picture: show what the sentence is about.",
      "- never picture a figure of speech literally; theories are said as theories, attributed.",
      "- a sentence with a striking number or date: put it in figure (it is printed big when said).",
      "- MOTION: every picture except a real person's photograph or a document gets a motion line — what moves in it (smoke, water, crowds, flames, cloth, light) plus one slow camera move. The opening pictures are animated first: make them pictures with strong natural movement.",
    ].join("\n"),
    schema: SCHEMA,
    model: settings.docuShortsModel || "claude-sonnet-5-5",
    maxTokens: 6000,
    usage,
    logFn,
  });
  if (!(plan?.beats?.length >= 4)) throw new Error("Shorts planı eksik");
  return plan;
}

/** The opening as beats: three slammed fragments, or one line (question / statement / quote / number). */
export function openingAsBeats(plan, kind) {
  const op = plan.opening || {};
  const say = clean(op.say);
  const frags = (say.match(/[^.!?]+[.!?]+["”']?/g) || []).map((f) => f.trim());
  if (kind === "triple" && frags.length === 3) {
    return frags.map((f, k) => ({ say: f, slam: slamWord(f, op.words?.[k]), picture: op.pictures?.[k] || op.pictures?.[0] }));
  }
  if (kind === "number") return [{ say, slam: clean(op.words?.[0] || "").toUpperCase(), picture: op.pictures?.[0] }];
  return [{ say, open: { kind, key: clean(op.words?.[0] || ""), who: clean(op.who) }, picture: op.pictures?.[0] }];
}

/** A track for the Short from the audio library: its mood, a serious register for a serious story, never game music. */
export function pickShortMusic(lib, { mood = "curious", genre = "documentary", seed = "" } = {}) {
  const grave = ["crime", "epic", "horror"].includes(genre) || ["dread", "sad", "tension"].includes(mood);
  const ok = (lib?.music || []).filter((t) => {
    const g = t.tags || {};
    if (g.gameLike || g.vocals === "lyrics") return false;
    if (grave && g.register && !["grave", "dramatic"].includes(g.register)) return false;
    return (g.moodFit?.[mood] ?? 0) >= 0.6;
  });
  if (!ok.length) return null;
  const t = ok[parseInt(hash(seed), 16) % ok.length];
  // Start where the track has found its feet (its energy first reaches -12 dB), so the Short opens on music.
  const e = Array.isArray(t.energy) ? t.energy : [];
  const start = Math.max(0, e.findIndex((v) => v >= -12));
  return { track: t, start: start > 0 && start < (Number(t.duration) || 0) - 60 ? start : 0 };
}

/**
 * A Commons file the plan names exactly ("File:Cottingley Fairies 1.jpg"): fetched straight from the
 * Commons API (no picker), only when its licence is usable; 2000 px wide. Returns { rel, credit } or null.
 */
export async function commonsPicture(title, { publicDir, fetchFn = (...a) => fetch(...a) } = {}) {
  const t = clean(title).replace(/^(File|Image):/i, "");
  if (!t) return null;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + t)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=2000&format=json&origin=*`;
  const ua = { headers: { "User-Agent": "NovaStudyo/1.16 (documentary shorts; contact via app)" } };
  const r = await fetchFn(api, ua);
  if (!r.ok) return null;
  const page = Object.values((await r.json())?.query?.pages || {}).find((p) => p.imageinfo?.[0]);
  if (!page) return null;
  const ii = page.imageinfo[0];
  const meta = commonsMetadata(ii, page.title);
  if (!meta.permissionVerified) return null;
  const url = ii.thumburl || ii.url;
  const rel = `build/s/commons-${hash(page.title)}.jpg`;
  const abs = path.join(publicDir, rel);
  if (!fs.existsSync(abs)) {
    const img = await fetchFn(url, ua);
    if (!img.ok) return null;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(await img.arrayBuffer()));
  }
  return { rel, credit: { provider: "wikimedia", file: rel, url, sourceUrl: url, ...meta } };
}

/**
 * Make one standalone Short.
 * @returns meta {file, title, description, credits, look, opening, ...}
 */
export async function makeStandaloneShort({
  topic, angle = "", opening = "triple", format = "story", titlePattern = "who", look: lookIn = null, recentLooks = [], dir, settings = {}, usage = null, logFn = () => {},
  ffmpeg, libraryRoot, llm = callJSON, research: researchIn = null, speak = speakTeaser, newPicture = newVerticalPicture, voiceId = null,
}) {
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  fs.mkdirSync(dir, { recursive: true });
  const save = (name, data) => fs.writeFileSync(path.join(dir, name), typeof data === "string" ? data : JSON.stringify(data, null, 2), "utf8");
  const read = (name) => { try { return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")); } catch { return null; } };

  // 1) research + plan (kept: a re-run pays for neither)
  let research = researchIn || (fs.existsSync(path.join(dir, "research.md")) ? fs.readFileSync(path.join(dir, "research.md"), "utf8") : null);
  if (!research) {
    logFn(`Shorts araştırması: ${topic}`);
    research = await researchShort({ topic, angle, settings, usage, logFn });
    save("research.md", research);
  }
  let plan = read("plan.json");
  if (!plan) {
    logFn("Shorts planı yazılıyor...");
    plan = await planShort({ topic, angle, research, opening, format, titlePattern, llm, settings, usage, logFn });
    save("plan.json", plan);
  }
  const look = lookIn && SHORT_LOOKS[lookIn] ? lookIn : pickLook({ genre: plan.genre, recent: recentLooks, seed: parseInt(hash(topic), 16) });
  const beats = [...openingAsBeats(plan, opening), ...plan.beats.map((b) => ({ say: clean(b.say), picture: b.picture, figure: clean(b.figure), figureWord: clean(b.figureWord) }))].filter((b) => b.say);

  // 2) pictures: archive for the real, AI for the rest (never a real person's likeness)
  const publicDir = path.join(dir, "public");
  const era = plan.year ? (plan.year < 0 ? `${-plan.year} BC` : String(plan.year)) : "";
  const mini = {
    id: hash(topic),
    era,
    scenes: beats.map((b) => ({ type: "photo", say: b.say, source: b.picture?.source === "archive" ? "archive" : "ai", search: clean(b.picture?.search), imagePrompt: clean(b.picture?.prompt) })),
  };
  let credits = {};
  // A Commons file named exactly in the plan is taken as is (licence checked) — no picker needed.
  const fixed = {};
  for (let k = 0; k < beats.length; k++) {
    const c = beats[k].picture?.source === "archive" ? clean(beats[k].picture?.commons) : "";
    if (!c) continue;
    try {
      const got = await commonsPicture(c, { publicDir });
      if (got) {
        fixed[k] = got.rel;
        credits[got.rel] = got.credit;
        mini.scenes[k].source = "fixed";
      } else logFn(`Shorts: Commons dosyası kullanılamadı (yok ya da lisansı uygun değil): ${c}`);
    } catch (e) {
      logFn(`Shorts: Commons dosyası alınamadı: ${c} (${String(e?.message || e).slice(0, 80)})`);
    }
  }
  let found = mini;
  if (mini.scenes.some((s) => s.source === "archive" && s.search)) {
    logFn(`Shorts: ${mini.scenes.filter((s) => s.source === "archive").length} gerçek görsel arşivde aranıyor...`);
    try {
      const r = await resolveArchive(mini, { dir, publicDir, buildPrefix: "build/s", settings, usage, logFn });
      found = r.script;
      credits = { ...credits, ...r.credits };
    } catch (e) {
      // No picker (Claude credit, network): those sentences get new, anonymous AI pictures instead.
      logFn(`Shorts: arşiv seçimi yapılamadı, o cümlelere yeni görsel (${String(e?.message || e).slice(0, 100)})`);
    }
  }
  for (const [k, rel] of Object.entries(fixed)) found.scenes[k] = { ...found.scenes[k], image: rel };
  const assets = [];
  let aiCount = 0;
  for (let k = 0; k < beats.length; k++) {
    const sc = found.scenes[k];
    const b = beats[k];
    if (sc?.image && fs.existsSync(path.join(publicDir, sc.image))) {
      const abs = path.join(publicDir, sc.image);
      const z = sizeOf(ff, abs);
      assets.push({ abs, rel: sc.image, kind: "still", srcW: z?.w || 0, srcH: z?.h || 0, say: b.say, archive: true });
      continue;
    }
    // No real picture: a new vertical one — an anonymous figure if the sentence is about a real person.
    const person = clean(b.picture?.person);
    let prompt = clean(b.picture?.prompt) || b.say;
    if (person) prompt = `${prompt.replace(new RegExp(person.split(/\s+/).filter((w) => w.length > 2).join("|"), "gi"), "a man")}. An anonymous figure seen from behind or in silhouette, no recognisable face`;
    const cached = path.join(dir, "new", `ai-${k}-${hash(prompt)}.jpg`);
    let abs = fs.existsSync(cached) ? cached : null;
    // A rate limit (429: a long video rendering alongside) waits and tries again; other errors give up.
    for (let attempt = 0; !abs && attempt < 6; attempt++) {
      try {
        logFn(`Shorts: yeni dikey görsel — ${prompt.slice(0, 70)}${attempt ? ` (deneme ${attempt + 1})` : ""}`);
        const made = await newPicture({ prompt, dir: path.join(dir, "new"), settings, style: newPictureStyle(plan.year || null, plan.genre) });
        fs.renameSync(made, cached);
        abs = cached;
      } catch (e) {
        const msg = String(e?.message || e);
        logFn(`Shorts: görsel üretilemedi (${msg.slice(0, 100)})`);
        // An empty balance answers 429 too: no point waiting, the Short stops and says so.
        if (/quota|credit|billing/i.test(msg) || e?.quota) throw Object.assign(new Error("OpenAI kredisi bitti — görsel üretilemiyor"), { quota: true });
        if (!/429|rate/i.test(msg)) break;
        await new Promise((r) => setTimeout(r, 20000 * (attempt + 1)));
      }
    }
    if (abs) {
      aiCount++;
      assets.push({ abs, kind: "still", srcW: 864, srcH: 1536, box: { x: 0.2, y: 0.15, w: 0.6, h: 0.6 }, say: b.say, generated: true });
    } else assets.push(assets.at(-1) || null);
  }
  if (assets.some((a) => !a)) throw new Error("Shorts: bazı cümlelerin görseli yok");
  // Where the subject sits in each archive picture (the 9:16 crop is centred on it).
  const real = assets.filter((a) => a.archive && !a.box);
  if (real.length) {
    let cat = [];
    try {
      cat = await describePictures({ assets: real.map((a, i) => ({ ...a, id: `p${i + 1}`, rel: a.rel })), cacheFile: path.join(dir, "pictures.json"), ffmpeg: ff, settings, usage, logFn });
    } catch (e) {
      logFn(`Shorts: özne kutuları bulunamadı, ortalanmış kadraj (${String(e?.message || e).slice(0, 80)})`);
    }
    for (const c of cat) {
      const a = real.find((x) => x.rel === c.rel);
      if (a) a.box = c.box;
    }
    for (const a of real) a.box ||= { x: 0.2, y: 0.08, w: 0.6, h: 0.7 };
  }

  // 3) voice
  const text = beats.map((b) => b.say).join(" ");
  const voiceFile = path.join(dir, "voice.mp3");
  let words = read("words.json");
  const voiceModel = settings.docuShortsVoiceModel === "eleven_v4_turbo" ? "eleven_v4_turbo" : "eleven_v4";
  const narrator = voiceId || settings.docuEnVoiceId || "nPczCjzI2devNBz1zQrb";
  // The performance is part of the take: a new model re-voices the Short (same words or not).
  if (!words || !fs.existsSync(voiceFile) || read("voice-text.json")?.text !== text || (read("voice-text.json")?.model || "eleven_v3") !== voiceModel || (read("voice-text.json")?.voice || "nPczCjzI2devNBz1zQrb") !== narrator) {
    logFn(`Shorts: seslendiriliyor (${text.length} karakter)...`);
    const tts = await speak({ text: await shortVoiceText(beats, { mood: plan.mood, model: voiceModel }), voiceId: narrator, key: settings.elevenKey, model: voiceModel });
    fs.writeFileSync(voiceFile, tts.audio);
    words = tts.words;
    save("words.json", words);
    save("voice-text.json", { text, model: voiceModel, voice: narrator });
  }

  // 4) timing: one picture per sentence, slams and figures on their spoken words
  const starts = beatStarts(beats, words);
  const voiceEnd = words.at(-1).e;
  const segments = beats.map((b, k) => {
    const s = k === 0 ? 0 : starts[k];
    const e = k + 1 < beats.length ? starts[k + 1] : voiceEnd + 0.9;
    const a = assets[k];
    return {
      abs: a.abs, kind: "still", srcW: a.srcW, srcH: a.srcH, box: a.box || { x: 0, y: 0, w: 1, h: 1 }, dur: Math.max(0.6, e - s), beat: k, generated: !!a.generated,
      // What the motion pass needs: a real person's photo never moves; an archive picture moves only when the plan said how.
      person: !!(a.archive && clean(b.picture?.person)), motion: clean(b.picture?.motion), picturePrompt: clean(b.picture?.prompt), say: b.say,
    };
  });
  const total = +(voiceEnd + 0.9).toFixed(2);
  const slams = slamTimes(beats, words);
  const figures = [];
  let off = 0;
  beats.forEach((b, k) => {
    const from = off;
    off += b.say.length + 1;
    if (!b.figure) return;
    const bare = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    let i = words.findIndex((w) => w.at >= from && w.at < off && bare(w.w) === bare(b.figureWord));
    if (i < 0) i = words.findIndex((w) => w.at >= from && /\d/.test(w.w));
    if (i < 0) return;
    const said = words[numberEnd(words, i)];
    const end = k + 1 < beats.length ? starts[k + 1] : voiceEnd;
    figures.push({ text: b.figure.toUpperCase(), s: said.s, e: Math.max(said.s + 0.8, Math.min(end - 0.05, said.s + 1.8)) });
  });
  const open = beats[0].open ? { text: beats[0].say, key: beats[0].open.key, who: beats[0].open.who, s: 0.05, e: Math.max(1.2, (starts[1] ?? voiceEnd) - 0.05) } : null;
  const assFile = path.join(dir, "short.ass");
  fs.writeFileSync(assFile, buildTeaserAss({ words, hook: plan.hook, slams, figures, hookFor: 3.2, voiceEnd: voiceEnd + 0.4, total, endCard: "", look, opening: open }), "utf8");

  // 5) music + hits from the audio library
  let musicFile = null;
  let musicStart = 0;
  const sfx = {};
  try {
    const lib = JSON.parse(fs.readFileSync(path.join(libraryRoot, "library.json"), "utf8"));
    const m = pickShortMusic(lib, { mood: plan.mood, genre: plan.genre, seed: topic });
    if (m) {
      musicFile = path.join(libraryRoot, m.track.file);
      musicStart = m.start;
    }
    const pickSfx = (kind) => (lib.sfx || []).filter((x) => x.kind === kind).sort((a, b) => (a.intensity ?? 3) - (b.intensity ?? 3))[look === "noir" || look === "dossier" ? 0 : 1];
    for (const k of ["whoosh", "hit"]) {
      const x = pickSfx(k);
      if (x) sfx[k] = path.join(libraryRoot, x.file);
    }
  } catch (e) {
    logFn(`Shorts: ses kütüphanesi okunamadı (${String(e?.message || e).slice(0, 80)})`);
  }

  // 6) motion: the opening sentences and the eligible rest become real movement (Replicate)
  const openN = openingAsBeats(plan, opening).length;
  const moving = await animateSegments(segments, { opening: Math.max(3, openN), settings, dir: motionDir(dir), ffmpeg: ff, logFn });
  const clips = moving.filter((g) => g.animated).length;

  // 7) render
  const out = path.join(dir, "short.mp4");
  logFn(`Shorts: ${segments.length} görsel (${clips} hareketli), ${total.toFixed(1)} sn, görünüm ${SHORT_LOOKS[look].name}, açılış ${opening}`);
  renderPictureTeaser({ segments: moving, voiceFile, musicFile, thumbFile: null, assFile, out, total, sfx, slamAt: slams.map((s) => s.s), ffmpeg: ff, look, musicStart, musicGain: 0.2 });

  // 8) credits for the description
  const media = { ...credits };
  if (aiCount) media.ai = { provider: "ai", file: "ai", all: aiCount === assets.length };
  const kunye = kunyeUret(media, { dil: "en" });
  const meta = { file: out, topic, look, opening, format, titlePattern, title: clean(plan.title), titles: (plan.titles || []).map(clean), description: clean(plan.description), hook: plan.hook, genre: plan.genre, mood: plan.mood, narration: text, credits: kunye.metin || "", aiPictures: aiCount, archivePictures: assets.length - aiCount, motionClips: clips, motionQuota: !!moving.quota, beats: beats.map((b, k) => ({ say: b.say, picture: assets[k].generated ? "ai" : assets[k].rel })) };
  save("short.json", meta);
  logFn(`Shorts hazır: ${out}`);
  return meta;
}

// SHORTS — bitmiş bir belgeselden dikey (1080x1920) YouTube Shorts: uzun videoya YÖNLENDİREN
// yeni bir fragman (teaser). Kullanıcı: "videodan kesit seçmesin, videoya yönlendiren yeni video yapsın".
//
// Claude yeni bir 45-55 sn'lik metin yazar (kanca, 3-5 çarpıcı an, cevabı vermeden bırakma,
// "full documentary" çağrısı) ve her cümleye uzun videodan uygun bir an seçer; aynı anlatıcı
// sesiyle (ElevenLabs) seslendirilir; görüntü o anlardan hızlı bir montaj, altında videonun
// müziği; üstte basılı etiket kanca, kelime kelime altyazı, sonda kapakla "izle" kartı.
// ElevenLabs anahtarı/kredisi yoksa yedek: uzun videonun en güçlü 40-58 sn'lik kesiti.
//
//   import { makeDocuShort } from "./docu-shorts.js"
//   await makeDocuShort({ jobDir, settings, logFn })  -> { file, mode: "teaser"|"cut", hook, title, description, ... }
import { dropSellBeats, nicheOf, shortGrowthLines, shortHashtags, shortHookLines, shortOpeningPlan } from "./growth-lessons.js";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { callJSON } from "../llm.js";
import { animateSegments, motionDir } from "./docu-shorts-motion.js";
import { SHORT_LOOKS, inkTag, keyTag, lookStyles, pickLook, slamTags } from "./docu-shorts-looks.js";
import { BLUR_FILL, DARK_CLIP, FIT_TOP, SHORT_VBV, archiveIsMono, checkShortClaims, darkestFrame, meanChroma, describePictures, fitCard, fitsPeriod, fitsWhole, gridCuts, mayShow, newVerticalPicture, pictureAssets, planPictureTeaser, prependCoverFrame, renderPictureTeaser, renderShortCover, coverLines, sharpEnough, shortCredits, sizeOf, spareFor, storyYear, subjectTopUp, verticalCrop } from "./docu-shorts-pictures.js";
import { adNorm, namesIn, peopleNames, pictureFace } from "./docu-archive.js";

/** One Short is one ffmpeg encode: cap x264 below the core count (test/kodlayici-bellek: no uncapped libx264), leave two cores for the machine. */
const SHORT_THREADS = String(Math.max(2, os.cpus().length - 2));

/**
 * Every ffmpeg of this file runs with a time limit, no console window and no stdin (-nostdin): a spawnSync here blocks
 * the whole app while it waits. One synchronous call that never came back (an error box, no ffmpeg) froze job
 * 20261024-373aaf for 48 min (25 Oct 2026); a hung ffmpeg here would do the same, so it now stops and the Short fails
 * clearly. An encode gets room: a picture Short's render + cover took 6-25 min on this PC (job logs 15-25 Oct), so a
 * few minutes would kill healthy renders. A probe takes seconds.
 */
export const SHORT_ENCODE_MS = 45 * 60 * 1000;
export const SHORT_PROBE_MS = 60 * 1000;

/** Why an ffmpeg call failed: a time limit says so, else ffmpeg's own last words. */
export function ffmpegWhy(r, limitMs, n = 400) {
  if (r?.error?.code === "ETIMEDOUT") return `ffmpeg ${limitMs >= 60000 ? `${Math.round(limitMs / 60000)} dk` : `${Math.round(limitMs / 1000)} sn`} içinde bitmedi (takıldı), durduruldu`;
  return String(r?.stderr || r?.error?.message || "").slice(-n);
}

export const SHORT_MIN = 40;
export const SHORT_MAX = 58;
const W = 1080;
const H = 1920;

/** SRT -> [{ s, e, t }] (saniye). */
export function parseSrt(text) {
  return String(text || "")
    .split(/\r?\n\r?\n/)
    .map((b) => {
      const l = b.trim().split(/\r?\n/);
      const i = l.findIndex((x) => /-->/.test(x));
      if (i < 0) return null;
      const m = l[i].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!m) return null;
      const s = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
      const e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
      const t = l.slice(i + 1).join(" ").replace(/\s+/g, " ").trim();
      return t ? { s, e, t } : null;
    })
    .filter(Boolean);
}

/** Bir cümle bitişinde (. ! ?) biten, [min,max] süreli pencere: başlangıçtan itibaren. */
export function windowFrom(cues, startIdx, { min = SHORT_MIN, max = SHORT_MAX } = {}) {
  const start = cues[startIdx]?.s;
  if (start == null) return null;
  let best = null;
  for (let j = startIdx; j < cues.length; j++) {
    const dur = cues[j].e - start;
    if (dur > max) break;
    if (dur >= min && /[.!?…"”]$/.test(cues[j].t)) best = j;
  }
  if (best == null) {
    for (let j = startIdx; j < cues.length && cues[j].e - start <= max; j++) best = j;
  }
  return best == null ? null : { start, end: cues[best].e, from: startIdx, to: best };
}

/** Kredisiz yedek: belgeselin açılışı zaten bir kanca olarak kurgulanır. */
export function fallbackWindow(cues, opts) {
  return windowFrom(cues, 0, opts);
}

const PICK_SCHEMA = {
  type: "object",
  properties: {
    startLine: { type: "integer", description: "Index of the first transcript line of the Short" },
    endLine: { type: "integer", description: "Index of the last transcript line of the Short" },
    hook: { type: "string", description: "On-screen hook label for the top of the Short, 2-6 words, ALL CAPS, curiosity not clickbait" },
    title: { type: "string", description: "YouTube Shorts title, max 70 chars, no hashtags: a FAMOUS name or place + ONE surprising concrete fact or question ('How Alexander the Great Fooled Darius at Gaugamela'), never poetic or cryptic" },
    description: { type: "string", description: "2-3 sentence Shorts description that points to the full documentary" },
    hashtags: { type: "array", items: { type: "string" }, description: "2-3 topic hashtags without #shorts, only names, places or years that appear in THIS Short ('Falklands', 'Vulcan', '1982') — never tags from other videos" },
    why: { type: "string" },
  },
  required: ["startLine", "endLine", "hook", "title", "description", "hashtags", "why"],
  additionalProperties: false,
};

/**
 * Claude, numaralı transkriptten Shorts'u seçer: ilk cümlesi kanca olan, tek başına anlaşılan,
 * merak/ödül veren 40-58 sn. Seçim sınır dışıysa ya da çağrı düşerse açılış kullanılır.
 */
export async function pickShortWindow({ cues, title = "", llm = callJSON, settings = {}, usage = null, logFn = () => {} }) {
  const lines = cues.map((c, i) => `${i} [${c.s.toFixed(1)}-${c.e.toFixed(1)}] ${c.t}`).join("\n");
  try {
    const res = await llm({
      system: "You are the Shorts editor of a top documentary YouTube channel. You cut 40-58 second vertical Shorts from finished long videos. Return only the requested JSON.",
      user: [
        `Long video: "${title}". Its narration, one numbered line per subtitle (seconds):`,
        lines,
        "",
        `Pick ONE continuous stretch for a YouTube Short, ${SHORT_MIN}-${SHORT_MAX} seconds long:`,
        "- the first line must work as a hook on its own (a shocking fact, a question, a reversal) — no setup that needs earlier context",
        "- understandable without the rest of the video; ends on a payoff or a cliffhanger line, never mid-thought",
        "- prefer the most surprising, concrete, quotable moment over the general intro",
        "- the last line should end a sentence",
      ].join("\n"),
      schema: PICK_SCHEMA,
      model: settings.docuShortsModel || "claude-sonnet-5-5",
      maxTokens: 1500,
      usage,
      logFn,
    });
    const a = Math.max(0, Math.min(cues.length - 1, Number(res?.startLine)));
    const b = Math.max(a, Math.min(cues.length - 1, Number(res?.endLine)));
    const dur = cues[b].e - cues[a].s;
    if (Number.isFinite(dur) && dur >= SHORT_MIN - 6 && dur <= SHORT_MAX + 4) {
      return { start: cues[a].s, end: Math.min(cues[b].e, cues[a].s + SHORT_MAX + 4), from: a, to: b, hook: String(res.hook || "").trim(), title: String(res.title || "").trim(), description: String(res.description || "").trim(), hashtags: Array.isArray(res.hashtags) ? res.hashtags : [], why: res.why, mode: "llm" };
    }
    logFn(`Shorts: seçilen bölüm ${dur.toFixed(1)} sn — sınır dışı, açılış kullanılıyor`);
  } catch (e) {
    logFn(`Shorts: bölüm seçimi yapılamadı (${String(e?.message || e).slice(0, 120)}), açılış kullanılıyor`);
  }
  const w = fallbackWindow(cues);
  return w ? { ...w, hook: "", title: "", description: "", mode: "fallback" } : null;
}

const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const assText = (s) => String(s).replace(/[{}\\]/g, "").replace(/\n/g, " ");

/**
 * ASS altyazı: üstte kanca etiketi (basılı etiket kutusu), altta 1-3 kelimelik büyük parçalar
 * (cue süresi harf sayısına göre bölünür), sonda kanal kartı. Zamanlar Shorts başına göre.
 */
export function buildShortAss({ cues, start, end, hook = "", endCard = "FULL DOCUMENTARY ON THE CHANNEL", accent = "&H0000D4FF" }) {
  const dur = end - start;
  const head = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // Altyazı: kalın beyaz, kalın siyah kontur — telefonda her zeminde okunur.
    "Style: Cap,Impact,118,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,1,0,1,9,4,2,60,60,300,1",
    // Kanca: basılı etiket (opak kutu), hafif yamuk.
    `Style: Hook,Impact,84,&H00111111,&H00111111,${accent},&H00000000,0,0,0,0,100,100,1,-2.5,3,22,0,8,90,90,250,1`,
    // Açılış: anlatıcının söylediği üç kelime, söylendiği anda ortaya basılı etiket olarak çakılır.
    `Style: Slam,Impact,150,&H00111111,&H00111111,${accent},&H00000000,0,0,0,0,100,100,2,-3,3,30,0,5,60,60,0,1`,
    `Style: End,Impact,64,&H00111111,&H00111111,${accent},&H00000000,0,0,0,0,100,100,1,0,3,18,0,2,90,90,520,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const ev = [];
  if (hook) ev.push(`Dialogue: 1,${assTime(0.15)},${assTime(Math.max(0.2, dur - 2.6))},Hook,,0,0,0,,{\\fad(120,200)}${assText(hook.toUpperCase())}`);
  for (const c of cues) {
    const a = Math.max(start, c.s);
    const b = Math.min(end, c.e);
    if (b - a < 0.15) continue;
    const words = c.t.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; ) {
      const n = words[i].length > 8 || words.length - i <= 2 ? Math.min(2, words.length - i) : 3;
      chunks.push(words.slice(i, i + n).join(" "));
      i += n;
    }
    const total = chunks.reduce((n, w) => n + w.length + 2, 0);
    let t = c.s;
    for (const w of chunks) {
      const len = ((c.e - c.s) * (w.length + 2)) / total;
      const s0 = Math.max(t, start);
      const s1 = Math.min(t + len, end);
      if (s1 - s0 > 0.06) ev.push(`Dialogue: 0,${assTime(s0 - start)},${assTime(s1 - start)},Cap,,0,0,0,,{\\fscx112\\fscy112\\t(0,90,\\fscx100\\fscy100)}${assText(w.toUpperCase())}`);
      t += len;
    }
  }
  ev.push(`Dialogue: 2,${assTime(Math.max(0, dur - 2.4))},${assTime(dur)},End,,0,0,0,,{\\fad(150,0)}${assText(endCard)}`);
  return [...head, ...ev, ""].join("\n");
}

/** ffmpeg: dikey kurgu + altyazı + ses geçişleri. */
export function renderShort({ video, start, end, assFile, out, ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts" }) {
  const dur = end - start;
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const fg = 1.0; // ortadaki görüntü tam genişlikte: yatay kare hiç kırpılmaz (yazılar/sahneler kesilmesin)
  const fgW = Math.round((W * fg) / 2) * 2;
  const fgH = Math.round((fgW * 9) / 16 / 2) * 2;
  const vf = [
    `[0:v]split[a][b]`,
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28,${BLUR_FILL}[bg]`,
    `[b]scale=${fgW}:${fgH},crop=${W}:${fgH}[fg]`,
    `[bg][fg]overlay=0:(H-h)/2-40,subtitles='${esc(assFile)}':fontsdir='${esc(fontsDir)}',fade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5,format=yuv420p[v]`,
  ].join(";");
  const af = `afade=t=in:d=0.25,afade=t=out:st=${(dur - 0.8).toFixed(2)}:d=0.8`;
  const args = ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-ss", start.toFixed(2), "-t", dur.toFixed(2), "-i", video, "-filter_complex", vf, "-map", "[v]", "-map", "0:a?", "-af", af, "-c:v", "libx264", "-threads", SHORT_THREADS, "-preset", "medium", "-crf", "19", ...SHORT_VBV, "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true, killSignal: "SIGKILL", timeout: SHORT_ENCODE_MS });
  if (r.status !== 0) throw new Error(`Shorts render başarısız: ${ffmpegWhy(r, SHORT_ENCODE_MS, 400)}`);
  return out;
}

/* ================================================================ TEASER */

export const TEASER_WORDS = [105, 140];
const TEASER_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "On-screen label at the top for the rest of the Short, 3-6 words, ALL CAPS, naming the story: e.g. 'THE NIGHT AN EMPIRE FELL'" },
    opening: {
      type: "object",
      description: "The first spoken line, before the beats: ONE clear sentence that says who or what, where or when, and the stake — understood in one hearing",
      properties: {
        say: { type: "string", description: "ONE plain sentence of 10-20 words naming who/what, where/when and the stake: 'In 1066, England's king won the battle of his life, and nineteen days later he was dead.'" },
        words: { type: "array", items: { type: "string" }, description: "At most ONE word from the sentence, copied as spoken: its key number or name, slammed on screen when said" },
        lines: { type: "array", items: { type: "integer" }, description: "Exactly 3 transcript line indices, one per fragment, whose {screen} shows that fragment's thing" },
        pattern: { type: "string", enum: ["result", "contradiction", "strange", "question", "compare"], description: "The hook pattern this opening uses (see SHORTS KANCASI)" },
        screen: { type: "string", description: "At most 4 words on screen from the first frame that COMPLETE the sentence with proof (a number, a fact), never repeat it; empty if none" },
      },
      required: ["say", "words", "lines", "pattern", "screen"],
      additionalProperties: false,
    },
    beats: {
      type: "array",
      description: "8-12 narration beats in order; their 'say' lines together are the whole Short's narration",
      items: {
        type: "object",
        properties: {
          say: { type: "string", description: "ONE spoken English sentence of 6-16 words" },
          line: { type: "integer", description: "Index of the transcript line whose MOMENT of the long video stays on screen for this whole sentence; its {screen} must show exactly what the sentence is about" },
          more: { type: "array", items: { type: "integer" }, description: "Usually empty. Only for a sentence of 12+ words: one more line whose screen shows the SAME subject, cut in for the second half" },
        },
        required: ["say", "line", "more"],
        additionalProperties: false,
      },
    },
    title: { type: "string", description: "YouTube Shorts title, max 70 chars, no hashtags" },
    description: { type: "string", description: "2-3 sentences that send viewers to the full documentary" },
    hashtags: { type: "array", items: { type: "string" }, description: "2-3 topic hashtags without #shorts, only names, places or years that appear in THIS Short ('Falklands', 'Vulcan', '1982') — never tags from other videos" },
  },
  required: ["hook", "opening", "beats", "title", "description", "hashtags"],
  additionalProperties: false,
};

/** Claude: uzun videoya yönlendiren yeni Shorts metni + her cümlenin altındaki an. */
export async function planTeaser({ cues, title = "", screens = [], llm = callJSON, settings = {}, usage = null, logFn = () => {} }) {
  // Each line also says what the long video SHOWS at that moment, so a beat about Babson gets Babson, not Fisher.
  const lines = cues.map((c, i) => `${i} [${Math.floor(c.s / 60)}:${String(Math.floor(c.s % 60)).padStart(2, "0")}] ${c.t}${screens[i] ? `  {screen: ${screens[i]}}` : ""}`).join("\n");
  const res = await llm({
    system: "You write YouTube Shorts for a documentary channel: each Short tells ONE angle of the channel's long video completely, on its own. Return only the requested JSON.",
    user: [
      `The full documentary: "${title}". Its whole narration, one numbered line per subtitle:`,
      lines,
      "",
      `Write a NEW vertical Short (${TEASER_WORDS[0]}-${TEASER_WORDS[1]} words of narration, about 45-55 seconds) that tells ONE angle of this story completely and on its own — the viewer gets the answer:`,
      ...shortGrowthLines(),
      ...shortHookLines(),
      "- the opening is the hook and must be understood in ONE hearing by a viewer who has never heard of this story: ONE plain spoken sentence of 10-20 words that names WHO or WHAT, WHERE or WHEN, and the stake or twist ('In 1066, England's king won the battle of his life, and nineteen days later he was dead.' / 'Saudi Arabia's main airport was hit three times in five days, and now Washington may join the war.'). NEVER cryptic fragments ('One airport. Eight countries. And two words.', 'One death.') — channel data, Oct 2026: Shorts lost ~40% of viewers in the first 12 seconds when the opening did not say what the story was. Put at most ONE word of it in words: the key number or name, slammed when said. A serious story (real deaths, an unconfirmed news event, a tragedy) never slams fear words like DEATH or KILLER",
      "- then the beats: 3-5 of the documentary's most striking, concrete moments on that angle (numbers, names, reversals), each one raising the stakes",
      "- give the ANSWER: a Short that withholds it to sell the long video loses (deep study, Oct 2026: GoPro's standalone Short 8M views vs its long video 235k; Epic History's teaser clips 0.07-0.11x its subscribers)",
      "- last beat: the strongest result or the hardest detail ('total destruction', 'they beat each other with clubs'), worded so it loops back to the opening sentence and a replay flows on. NO call to the full documentary in the narration ('the full story is on the channel', 'watch the full video', 'link below'): the Short's related-video field and description carry the link. Optional, after that line: ONE reasoned subscribe line of at most 10 words ('If you want the next one explained, subscribe.')",
      "- plain spoken English, short sentences, no hashtags, no emojis, no stage directions",
      "- each beat is ONE sentence with ONE picture: the picture stays on screen for the whole sentence and the cut lands when the next sentence starts, so what the viewer sees always matches what they hear",
      "- {screen: ...} tells what the long video shows at that line; pick the line whose screen shows exactly the sentence's subject: the person it names (never another person's portrait), the number it says, the object, the place, the event",
      "- prefer lines with a striking, readable picture (a face, a number on screen, a map, a headline, a crowd, fire); avoid title cards and empty backgrounds",
      "- \"more\" stays empty unless the sentence has 12+ words; then one more line showing the same subject",
      "- beats use different, far-apart parts of the video; never two beats on the same or neighbouring lines",
    ].join("\n"),
    schema: TEASER_SCHEMA,
    model: settings.docuShortsModel || "claude-sonnet-5-5",
    maxTokens: 2500,
    usage,
    logFn,
  });
  const clampL = (x) => Math.max(0, Math.min(cues.length - 1, Number(x) || 0));
  const beats = (res?.beats || [])
    .map((b) => ({ say: String(b.say || "").replace(/\s+/g, " ").trim(), line: clampL(b.line), more: (Array.isArray(b.more) ? b.more : []).slice(0, 1).map(clampL) }))
    .filter((b) => b.say);
  const sold = dropSellBeats(beats);
  if (sold.length < beats.length) { logFn(`Shorts: uzun videoya çağıran ${beats.length - sold.length} vuruş çıkarıldı (bağlantı İlgili video alanında)`); beats.splice(0, beats.length, ...sold); }
  if (beats.length < 3) throw new Error("teaser planı eksik");
  const opening = openingBeats(res?.opening, clampL);
  const hookPlan = shortOpeningPlan(res?.opening, opening);
  return { hook: String(res.hook || "").trim(), beats: [...opening, ...beats], title: String(res.title || "").trim(), description: String(res.description || "").trim(), hashtags: Array.isArray(res.hashtags) ? res.hashtags : [], openingLen: opening.length, ...hookPlan };
}

/**
 * Açılış: "Seventy ships. One hill. And one night." -> üç kısa vuruş; her biri kendi
 * görüntüsünde, işaretli kelimesi (slam) anlatıcı söylediği anda ekrana çakılır.
 * Kullanıcı: "bir tarif, bir sokak, bir ihanet — onların kanca mantığı iyiydi".
 */
export function openingBeats(opening, clampL = (x) => Number(x) || 0) {
  const say = String(opening?.say || "").replace(/\s+/g, " ").trim();
  if (!say) return [];
  const frags = (say.match(/[^.!?]+[.!?]+["”']?/g) || []).map((f) => f.trim()).filter(Boolean);
  const lines = (Array.isArray(opening.lines) ? opening.lines : []).map(clampL);
  const words = Array.isArray(opening.words) ? opening.words : [];
  if (frags.length !== 3) return [{ say, line: lines[0] ?? 0, more: [], ...(words.length ? { slam: slamWord(say, words[words.length - 1]) } : {}) }];
  return frags.map((f, k) => ({ say: f, line: lines[k] ?? lines[0] ?? 0, more: [], slam: slamWord(f, words[k]) }));
}

const bare = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");
const FILLER = new Set(["a", "an", "and", "the", "one", "of", "that", "to", "in", "on", "it", "was", "his", "her", "their", "its"]);

/**
 * The fragment's spoken word to slam: the planned one if it is really in the fragment, else its last real word.
 * A number said with "percent" slams as "45%" (Gimli Short 20261028-9ff721: "about 45 percent of the fuel" slammed a bare "45").
 */
export function slamWord(fragment, wanted) {
  const spoken = String(fragment).split(/\s+/).map(bare).filter(Boolean);
  const at = wanted ? spoken.indexOf(bare(wanted)) : -1;
  const pct = (i) => /^\d+$/.test(spoken[i]) && (spoken[i + 1] === "percent" || (spoken[i + 1] === "per" && spoken[i + 2] === "cent"));
  if (at >= 0) return (pct(at) ? `${spoken[at]}%` : spoken[at]).toUpperCase();
  return ([...spoken].reverse().find((w) => !FILLER.has(w)) || spoken.at(-1) || "").toUpperCase();
}

/** Each beat's start in the voice (word timestamps), from its position in the joined narration. */
export function beatStarts(beats, words) {
  let off = 0;
  return beats.map((b) => {
    const at = off;
    off += b.say.length + 1;
    return (words.find((w) => w.at >= at) ?? words.at(-1)).s;
  });
}

/** Slam words timed to the moment the narrator says them; each holds until the next beat starts. */
export function slamTimes(beats, words) {
  const starts = beatStarts(beats, words);
  const out = [];
  let off = 0;
  beats.forEach((b, k) => {
    const from = off;
    off += b.say.length + 1;
    if (!b.slam) return;
    const said = words.find((w) => w.at >= from && w.at < off && bare(w.w) === bare(b.slam));
    const end = k + 1 < beats.length ? starts[k + 1] : words.at(-1).e;
    out.push({ text: b.slam, s: Math.max(0, (said ?? words.find((w) => w.at >= from) ?? words[0]).s - 0.04), e: end, beat: k });
  });
  return out;
}

/** Where the top label sits over an eyewitness clip: under the clip's own source label (~0-280 px of the frame). */
export const HOOK_BELOW_LABEL_Y = 340;

/** The full frame for an eyewitness clip (ew-): its source label sits at the top and is never cropped away. */
export function eyewitnessBox(rel) {
  return /(^|\/)ew-/.test(String(rel || "")) ? { x: 0, y: 0, w: 1, h: 1 } : null;
}

/** Where a slam sits over a face: the lower third, under the eyes (the opening has no captions there). */
export const SLAM_LOW_Y = 0.73;
const FACE_LOOK = /\b(portrait|face|faces|smiling|preacher|president|pastor|wife|husband|man|woman|king|queen|sultan|emperor|general|singer|actor|host)\b/i;

/**
 * Marks the slams whose picture shows a person (the beat names one, or the picture's description is a face). `g.face`:
 * the long video's rule (docu-archive.js pictureFace via shortFace — a verified name card or face, a Commons title that
 * names one of the story's people, a person in the picture's description), set by makePictureTeaser.
 */
export function lowOverFaces(slams, segments, beats = []) {
  return slams.map((m) => {
    const g = segments[m.beat];
    const face = !!(beats[m.beat]?.person || g?.person === true || g?.face === true || FACE_LOOK.test(String(g?.what || "")));
    return face ? { ...m, low: true } : m;
  });
}

/* ================================================== yazı yüzde değil, ad yalnızca o kişinin resminde (Shorts) */

/*
 * SHORTS'TA DA YAZI YÜZDE DEĞİL, AD BAŞKASININ RESMİNDE DEĞİL (26 Ekim 2026 işleri; kare incelemesi 27 Ekim 2026).
 * Uzun videonun kuralı 1. turda geldi (docu-archive.js faceSafeText); Shorts aynı kusurları taşıyordu:
 *  - Lula Short 1 (20261026-29db03, short-202610260443): ekran yazısı "LULA: 51.78%" (üst etiket, Hook stili \an8,
 *    250-470 px) 6.4-9.8 sn'de Lula'nın resmî portresinde (arch-55d80b1f357a, baş karenin 0.07-0.51'i) alnının
 *    üstündeydi. lowOverFaces yalnızca vuruş kelimesini indiriyordu; etiket hep tepedeydi.
 *  - Çernobil Short 2 ve 3 (20261026-24122a, short-202610260833 / -0845): "AND BORYS BARANOV", "ENGINEERS, ANANENKO"
 *    altyazıları kontrol odasındaki iki AI adamın (img-e312d23c0d1d) üstündeydi — izleyici onları Baranov ve Ananenko
 *    sanır. Ananenko'nun kendi fotoğrafı (arch-4ff13f535523, "Ананенко Олексій Михайлович") katalogdaydı.
 * Kural (ücretsiz, deterministik; yalnızca resimli Short, makePictureTeaser):
 *  - resim yüz gösteriyor mu: docu-archive.js pictureFace (uzun videonun isim kartı/yüz konumu, Commons başlığında hikâyenin
 *    bir kişisi, AI isteminde insan) + görüntü kataloğunun tarifi (pictures.json "what") aynı kuralla — shortFace;
 *  - üst etiket (kanca ve ekran yazısı) yüzü üst bantta olan resmin üstünde yüzün altına iner (HOOK_UNDER_FACE_Y);
 *    o anda söylenen rakam (figure) orayı alır, etiket o arada çekilir;
 *  - ekrandaki AD (açılış vuruşu, etiket, altyazı öbeği) yalnızca o kişinin resminde: resmin kimliği (Commons başlığı,
 *    uzun videonun isim kartı, yüzü doğrulanmış arama) o adı taşımıyorsa ve resimde bir yüz varsa, cümle o kişiyi
 *    gösteren gerçek fotoğrafa geçer (katalogda varsa); yoksa vuruş düşer, etiket o resmin üstünde gösterilmez, o adı
 *    taşıyan altyazı öbeği gösterilmez — adı anlatıcı söyler. Yüzsüz resimdeki (bina, harita, kalabalık) ad kalır.
 *  - Ad tetiği SOYADDIR (adın ilk parçası değil): sıradaki İsrail seçim haberinde "Israel Katz" bir kişi olabilir,
 *    ülke adı "Israel" her altyazıyı silmesin. Soyadı cümlede geçince ilk ad da ("PLANT ENGINEERS OLEKSIY") sayılır.
 */
/** Where the top label goes when the picture's face is in the upper band: under the face, above the lower-third slam. */
export const HOOK_UNDER_FACE_Y = 1066;
/** A face whose centre is above this (share of the frame height) sits under the top label band (250-470 px). */
export const FACE_UPPER_Y = 0.45;
/**
 * A crowd is nobody in particular: a name over a rally crowd is no name over someone else's face. Not "a crowded control
 * panel" (Chernobyl img-e312d23c0d1d: two men at it), nor one man speaking to a crowd.
 */
const CROWD_LOOK = /\b(crowds?|throngs?|masses|protesters|demonstrators|marchers|supporters|voters|queues?|audiences?|spectators|onlookers)\b(?!['’]s\b)/i;
const ONE_FACE = /\b(?:a|an|one)\s+(?:[\w-]+\s+){0,3}?(?:man|woman|boy|girl|person|figure|politician|candidate|speaker|leader|president|minister)\b|\b(?:portrait|close-?up|headshot)\b/i;

const realPicture = (a) => !!a && !a.generated && a.source !== "ai";
const ownSceneOf = (a, scene) => (scene && a && (scene.image === a.rel || scene.video === a.rel) ? scene : null);

/**
 * The people of the Short: the film's and the writer's script (name cards, quote authors, cast) and the planner's `person`
 * lines — a full name only (two words or more): a one-word answer may be a group ("Houthis"), not a person.
 */
export function shortPeople(scripts = [], names = []) {
  const list = scripts.filter(Boolean);
  const full = names.map((n) => String(n || "").trim()).filter((n) => n.split(/\s+/).length >= 2);
  return peopleNames({
    scenes: [...list.flatMap((s) => s.scenes || []), ...full.map((name) => ({ name }))],
    cast: Object.assign({}, ...list.map((s) => s.cast || {})),
  });
}

const surnames = (p) => (p.parcalar.length > 1 ? p.parcalar.slice(1) : p.parcalar);
const hasPart = (text, w) => namesIn(text, [{ ad: w, parcalar: [w] }]).length > 0;
/*
 * İNCELEME (27 Ekim 2026; sıradaki İsrail seçim haberi): soyadı bir yerin ya da şeyin adının içinde de geçer — "Israel
 * annexed the Golan Heights" Yair Golan sayılıyor, cümlenin askerler resmi Golan'ın portresine geçiyordu. Soyadından
 * hemen sonra yer/kurum sözcüğü gelen ("Golan Heights", "Trump Tower", "Nobel Prize") kişiyi anmaz. Küçük harfli
 * anlatımda ad büyük harfle yazılır: "the city gates" Bill Gates değildir (BÜYÜK HARFLİ etiket ve vuruşta bu ayrım yok).
 */
const PLACE_AFTER = /(?<![\p{L}\p{M}'’-])\p{L}[\p{L}\p{M}-]*\s+(?=(?:heights|hills?|valley|straits?|sea|river|lake|bay|gulf|islands?|peninsula|mountains?|desert|plateau|ridge|street|avenue|boulevard|road|square|plaza|park|bridge|towers?|dam|canal|airport|station|stadium|arena|cent(?:er|re)|hall|prize|foundation|institute|university|college|school|hospital|museum|memorial|doctrine|accords?)\b)/giu;
/** A name part on the picture's identity: one of its words, or inside a run-together file name ("Irvingfisher.jpg"). */
const onIdentity = (identity, w) => hasPart(identity, w) || adNorm(identity).replace(/\s+/g, "").includes(w);

/** The people a text names by a surname (or a one-part name): "Israel's attorney general" names no "Israel Katz". */
export function namedBy(text, people = []) {
  let t = String(text || "").replace(PLACE_AFTER, " ");
  if (/\p{Ll}/u.test(t)) t = (t.match(/\p{Lu}[\p{L}\p{M}'’.-]*/gu) || []).join(" ");
  return people.filter((p) => namesIn(t, [{ ...p, parcalar: surnames(p) }]).length > 0);
}

/**
 * Of `named`, those the text shows by a name part (first name too) that the picture's identity does not carry. A part
 * inside a run-together Commons file name counts as carried (Crash of 1929, 20260930-70cef2: "Irvingfisher.jpg" is
 * Irving Fisher — his own portrait was swapped for a photo of him with his son).
 */
export function notOnPicture(text, identity, named = []) {
  return named.filter((p) => {
    const seen = p.parcalar.filter((w) => hasPart(text, w));
    return seen.length > 0 && !seen.every((w) => onIdentity(identity, w));
  });
}

/** The picture is that person: its identity names them, and every part of the name the text shows. */
const showsWho = (identity, p, text) => namesIn(identity, [p]).length > 0 && !notOnPicture(text, identity, [p]).length;
/** The picture already is that person (a run-together file name too): no swap, no name hidden there. */
const isWho = (identity, p, text) => p.parcalar.some((w) => onIdentity(identity, w)) && !notOnPicture(text, identity, [p]).length;
/** The sentence says the surname as a person's name: capitalised, not "the Golan" / "the Netanyahu government". */
function saidAsName(say, p) {
  const ws = String(say || "").match(/[\p{L}\p{M}'’-]+/gu) || [];
  return ws.some((x, i) => /^\p{Lu}/u.test(x) && !/^(?:the|a|an)$/i.test(ws[i - 1] || "") && surnames(p).some((w) => hasPart(x, w)));
}

/**
 * Who a Short's picture is known to be, by name (docu-archive.js resimKimligi, not exported — mirrored): its Commons
 * title, the long video's name card and its search when the picker checked the face (credit.face), the credited title
 * of a fetched photo or a source clip. An AI or stock picture shows nobody by name: "".
 */
export function shortIdentity(a, scene = null) {
  if (!realPicture(a)) return "";
  const c = a.credit || {};
  let sayfa = String(c.sayfa || "");
  try { sayfa = decodeURIComponent(sayfa); } catch {}
  const own = ownSceneOf(a, scene);
  const card = own?.archived ? own : null;
  return [card?.name, a.name, c.eser, sayfa, card && Array.isArray(c.face) ? card.search : ""].filter(Boolean).join(" ");
}

/**
 * Does a Short's picture show a face → { at: [x, y] in the picture | null } | null. The long video's pictureFace on the
 * picture's own scene and credit, then on the vision catalogue's description (what the Short really shows).
 * `people` adds "a Commons title naming one of the story's people" (placement only, not the name check).
 */
export function shortFace(a, scene = null, people = []) {
  if (!a) return null;
  const real = realPicture(a);
  const own = ownSceneOf(a, scene);
  const p = {
    archived: real,
    imagePrompt: real ? "" : String(a.prompt || a.what || ""),
    ...(real && own?.name ? { name: own.name, focus: own.focus } : {}),
    ...(own?.depth ? { depth: own.depth } : {}),
    ...(own?.cast?.length ? { cast: own.cast } : {}),
  };
  const c = real ? { ...(a.credit || {}), eser: a.credit?.eser || a.name || "" } : null;
  return pictureFace(p, c, people) || pictureFace({ imagePrompt: String(a.what || "") }, null, people);
}

/** A face a name could be read onto: not a crowd unless the long video verified the face (name card, picker's face). */
export function nameFace(a, scene = null) {
  const f = shortFace(a, scene);
  if (!f) return false;
  const what = String(a?.what || "");
  return !!f.at || !!(realPicture(a) && ownSceneOf(a, scene)?.name) || !CROWD_LOOK.test(what) || ONE_FACE.test(what);
}

/**
 * Where a picture's face lands in the 1080x1920 frame (share of its height): the render's own crop (verticalCrop, or the
 * fitted card of a phone clip). Unknown spot: the top quarter of the vision's subject box (a portrait's head).
 */
export function faceInFrame(g, at = null) {
  const box = g?.box || { x: 0, y: 0, w: 1, h: 1 };
  const fy = Array.isArray(at) ? at[1] : (box.y ?? 0) + Math.min(box.h ?? 1, 1) * 0.25;
  const w = Number(g?.srcW) || 0;
  const h = Number(g?.srcH) || 0;
  if (!w || !h) return fy;
  if (fitsWhole(g)) return (FIT_TOP + fy * fitCard(w, h).h) / H;
  const c = verticalCrop(w, h, box);
  return Math.max(0, Math.min(1, (fy * h - c.y) / c.h));
}

/** A segment that shows a face carries it: face, and faceY — where it lands in the frame (lowOverFaces, labelPlace). */
export function withFace(g, a, scene = null, people = []) {
  const f = shortFace(a, scene, people);
  return f ? { ...g, face: true, faceY: +faceInFrame(g, f.at).toFixed(3) } : g;
}

/** Where the top label sits over a picture: under an eyewitness clip's own source label, under a face in the upper band, else the style's top (null). */
export function labelPlace(g, { underHook = false } = {}) {
  if (eyewitnessBox(g?.rel)) return HOOK_BELOW_LABEL_Y;
  if (g?.face && g.faceY != null && g.faceY < FACE_UPPER_Y) return HOOK_UNDER_FACE_Y;
  return underHook ? HOOK_BELOW_LABEL_Y : null;
}

/** buildTeaserAss's `pictures`: per segment its time, label place, a face a name could be read onto, its identity, its sentence's people. */
export function labelPictures({ segments = [], beats = [], cuts = [], total = 0, people = [], sceneOf = () => null, underHook = false } = {}) {
  return segments.map((g, k) => {
    const a = beats[k]?.asset;
    return { s: cuts[k], e: k + 1 < segments.length ? cuts[k + 1] : total, y: labelPlace(g, { underHook }), face: nameFace(a, sceneOf(a)), identity: shortIdentity(a, sceneOf(a)), named: namedBy(beats[k]?.say, people) };
  });
}

/**
 * A sentence that names someone over another face gets that person's own photo (a real picture whose identity is them,
 * not on the beat before or after, at most twice in the Short), unless the picture already is one of the people it
 * names. One of the story's time first; else their later photo all the same — the person, not the period, is what the
 * name needs (Chernobyl: Ananenko's only photo is a later colour portrait, the long video showed it under his name card).
 * Still wrong: its slam is dropped (captions and the label: buildTeaserAss).
 * `sceneOf(asset)`: the asset's scene in the film's props. → { swapped: [{ beat, from, to, who }], slams: [{ beat, slam }] }
 */
export function namesOnOwnPictures(beats = [], { catalog = [], people = [], sceneOf = () => null, year = null, logFn = () => {} } = {}) {
  const rep = { swapped: [], slams: [] };
  if (!people.length) return rep;
  const id = (a) => shortIdentity(a, sceneOf(a));
  beats.forEach((b, k) => {
    const named = namedBy(b.say, people);
    if (!b.asset || !named.length || !nameFace(b.asset, sceneOf(b.asset))) return;
    if (!named.some((p) => isWho(id(b.asset), p, b.say))) {
      /*
       * İNCELEME (27 Ekim 2026): resmi değiştirmek yazıyı gizlemekten büyük bir müdahale, kanıt ister. Aynı soyadlı iki
       * kişide ("Netanyahu answered…", planlayıcının kişisi Benjamin Netanyahu) ilk bulunan alınıyordu ve en kaliteli
       * "Netanyahu" fotoğrafı seçiliyordu: Sara Netanyahu'nun portresi. Artık kişi planlayıcının kişisine en çok uyan
       * kişidir; aday fotoğrafın kimliği en çok O kişiyi adlandırmalı; ve resim yalnızca cümle onu kişi olarak anıyorsa
       * değişir (planlayıcının kişisi, tam ad, vuruş kelimesi ya da büyük harfli soyadı) — "Israeli troops on the Golan"
       * Yair Golan'ın portresine geçmez, yalnızca yazıdaki ad gizlenir.
       */
      const planned = b.person ? namesIn(b.person, named)[0] : null;
      const who = planned || named[0];
      const sure = !!planned || who.parcalar.length < 2 || who.parcalar.filter((w) => hasPart(b.say, w)).length >= 2
        || (!!b.slam && namedBy(b.slam, [who]).length > 0) || saidAsName(b.say, who);
      const uses = (x) => beats.filter((y) => y.asset === x).length;
      const own = !sure ? null : catalog
        .filter((x) => x !== b.asset && realPicture(x) && !x.textHeavy && sharpEnough(x) && shortFace(x, sceneOf(x))
          && showsWho(id(x), who, b.say) && namesIn(id(x), people, { kunye: true }).includes(who)
          && beats[k - 1]?.asset !== x && beats[k + 1]?.asset !== x && uses(x) < 2)
        .sort((x, y) => Number(fitsPeriod(y, year)) - Number(fitsPeriod(x, year)) || Number(Array.isArray(y.credit?.face)) - Number(Array.isArray(x.credit?.face)) || (y.quality || 0) - (x.quality || 0))[0];
      if (own) {
        rep.swapped.push({ beat: k, from: b.asset.rel || "new", to: own.rel, who: who.ad });
        logFn(`Shorts: "${b.say.slice(0, 60)}" ${who.ad} adını başkasının yüzünde gösteriyordu — kendi fotoğrafına geçti (${path.basename(String(own.rel))})`);
        b.asset = own;
      }
    }
    if (b.slam && nameFace(b.asset, sceneOf(b.asset)) && notOnPicture(b.slam, id(b.asset), named).length) {
      rep.slams.push({ beat: k, slam: b.slam });
      logFn(`Shorts: açılış vuruşu "${b.slam}" başkasının resminde — yazı düştü, adı anlatıcı söylüyor`);
      b.slam = "";
    }
  });
  return rep;
}

/**
 * The top label's pieces over its pictures (`pictures`: one { s, e, y, face, identity } per picture, makePictureTeaser):
 * each at its picture's place (y: under a face, under an eyewitness source label; null = the style's top band), never
 * over a face that is not the person the label names, and — moved down to the figures' band — out of the way of a figure
 * said there. Without `pictures`: one piece at `y` (hookY), as before.
 */
export function labelPieces(s, e, text, { pictures = null, people = [], y = null, figures = [], slams = [] } = {}) {
  if (!pictures?.length) return [{ s, e, y }];
  const named = namedBy(text, people);
  const down = (v) => v != null && v > H * 0.4;
  const raw = [];
  for (const p of pictures) {
    const a = Math.max(s, p.s);
    const b = Math.min(e, p.e);
    if (b <= a || (named.length && p.face && notOnPicture(text, p.identity, named).length)) continue;
    raw.push({ s: a, e: b, y: p.y ?? y });
  }
  const touch = (x, z) => Math.abs(x.e - z.s) < 0.005;
  // No jumping at every cut: a short stay at the top (under 1.2 s) between moved pieces stays down with them, unless a
  // mid-frame slam is there (Lula Short 3: crowd, man, 0.9 s voting machine, family — top, down, top, down).
  raw.forEach((p, k) => {
    if (p.y != null || p.e - p.s >= 1.2 || slams.some((m) => !m.low && m.s < p.e && m.e > p.s)) return;
    const n = [raw[k - 1] && touch(raw[k - 1], p) ? raw[k - 1] : null, raw[k + 1] && touch(p, raw[k + 1]) ? raw[k + 1] : null].find((x) => x && down(x.y));
    if (n) p.y = n.y;
  });
  // Down in the figures' band, a figure said there takes the place: the label steps aside meanwhile.
  const cut = raw.flatMap((p) => {
    if (!down(p.y)) return [p];
    let spans = [[p.s, p.e]];
    for (const f of figures) spans = spans.flatMap(([x, z]) => (f.s < z && f.e > x ? [[x, f.s], [f.e, z]] : [[x, z]])).filter(([x, z]) => z > x);
    return spans.map(([x, z]) => ({ s: x, e: z, y: p.y }));
  });
  raw.splice(0, raw.length, ...cut);
  // A sliver (the label starts a frame before a cut, Lula Short 1: 1.85 s vs the cut at 1.867 s) takes the place of the
  // piece it touches, never a jump of its own; touching pieces at one place are one event.
  raw.forEach((p, k) => {
    if (p.e - p.s >= 0.15) return;
    const n = raw[k + 1] && touch(p, raw[k + 1]) && raw[k + 1].e - raw[k + 1].s >= 0.15 ? raw[k + 1] : raw[k - 1] && touch(raw[k - 1], p) ? raw[k - 1] : null;
    if (n) p.y = n.y;
  });
  const out = [];
  for (const p of raw) {
    const last = out.at(-1);
    if (last && last.y === p.y && touch(last, p)) last.e = p.e;
    else out.push({ ...p });
  }
  // A piece under a second (left between a hidden picture or a figure and the label's end) would only flash — the Bakker
  // Short's "bir şey geliyor hızlıca kayboluyor" — and is left out. A label that short all along stays as it was.
  return out.filter((p) => p.e - p.s >= 1 || (Math.abs(p.s - s) < 0.005 && Math.abs(p.e - e) < 0.005));
}

/**
 * Text that pops in from a bigger scale gets its lines by hand (\N, with \q2 on the event): libass wraps by the
 * scaled width, so the line broke differently during the pop and jumped when it settled (Bakker Short, Oct 2026).
 */
export function fixedLines(text, max = 14) {
  const lines = [];
  for (const w of String(text || "").split(" ").filter(Boolean)) {
    if (lines.length && `${lines.at(-1)} ${w}`.length <= max) lines[lines.length - 1] += ` ${w}`;
    else lines.push(w);
  }
  return lines.join("\\N");
}

/**
 * A slam lives inside its own picture: from the first frame of its beat's cut to half a frame before the next
 * cut (cuts = gridCuts of the beats, the frames the render cuts on). The -0.04 s lead and the next beat's
 * start put "FOREVER" over the corridor for a frame, over "NIGHTS" for one, and faded it over the Bakker
 * photo (Bakker Short, Oct 2026: "bir şey geliyor hızlıca kayboluyor").
 */
export function snapSlams(slams, cuts, fps = 30) {
  const half = 0.5 / fps;
  return slams.map((m) => {
    if (m.beat == null || cuts[m.beat] == null) return m;
    const s = Math.max(m.s, cuts[m.beat] - half);
    const e = cuts[m.beat + 1] != null ? Math.min(m.e, cuts[m.beat + 1] - half) : m.e;
    // Milliseconds rounded inward (start up, end down): never back over the half-frame margin.
    return { ...m, s: Math.ceil(s * 1000) / 1000, e: Math.floor(Math.max(s + 1 / fps, e) * 1000) / 1000 };
  });
}

/**
 * The Short's narration as performed (Eleven v4): every beat directed by the long video's voice
 * director (docu-engine/lib/voice-director.mjs) — the opening low and steady, slams firm, questions
 * curious, the colour of the Short's mood without a tag on every line. Tags only, never a changed
 * word: speakTeaser drops them from the timings, so beat/slam/figure offsets stay those of the plain text.
 */
export async function shortVoiceText(beats, { mood = "curious", model = "eleven_v4" } = {}) {
  const plain = beats.map((b) => b.say).join(" ");
  if (!/eleven_v[34]/.test(String(model))) return plain;
  try {
    const { docuEngineDir } = await import("./docu.js");
    const { pathToFileURL } = await import("node:url");
    const { directLines } = await import(pathToFileURL(path.join(docuEngineDir(), "lib", "voice-director.mjs")).href);
    const d = directLines(beats.map((b) => ({ say: b.say, mood, type: b.slam ? "slam" : "photo", chapter: 0 })), { model, punctuation: false });
    return d.map((x) => x.text).join(" ");
  } catch {
    return plain;
  }
}

/** Alignment without the tag spans (and the space after each): offsets match the untagged text again. */
function untag(a) {
  const out = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
  let inTag = false;
  let skip = false;
  a.characters.forEach((ch, i) => {
    if (ch === "[") inTag = true;
    if (inTag) {
      if (ch === "]") { inTag = false; skip = true; }
      return;
    }
    if (skip && /\s/.test(ch)) { skip = false; return; }
    skip = false;
    out.characters.push(ch);
    out.character_start_times_seconds.push(a.character_start_times_seconds[i]);
    out.character_end_times_seconds.push(a.character_end_times_seconds[i]);
  });
  return out;
}

/** ElevenLabs: metin -> mp3 + kelime zamanları (with-timestamps), uzun videonun anlatıcısıyla. */
export async function speakTeaser({ text, voiceId, key, model = "eleven_v4", fetchImpl = fetch, language = "en" }) {
  const voice_settings = /eleven_v4/.test(model) ? { stability: 0.45, similarity_boost: 0.8 } : model === "eleven_v3" ? { stability: 0.5 } : { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true };
  // The Short's language is enforced like the long video's (Panama, Oct 2026: lines full of Spanish place names drifted
  // into Spanish); a model that rejects language_code is asked again without it.
  const send = (lang) => fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: model, voice_settings, ...(lang ? { language_code: lang } : {}) }),
    signal: AbortSignal.timeout(180_000),
  });
  let r = await send(language || null);
  if (!r.ok && language && r.status >= 400 && r.status < 500) {
    const why = await r.text();
    if (!/language/i.test(why)) throw Object.assign(new Error(`ElevenLabs ${r.status}: ${why.slice(0, 200)}`), { status: r.status });
    r = await send(null);
  }
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
  const j = await r.json();
  const a = untag(j.alignment || j.normalized_alignment);
  const words = [];
  let cur = "";
  let s0 = null;
  let e0 = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push({ w: cur, s: s0, e: e0, at: i - cur.length });
      cur = "";
      s0 = null;
    } else {
      if (s0 === null) s0 = a.character_start_times_seconds[i];
      e0 = a.character_end_times_seconds[i];
      cur += ch;
    }
  });
  if (cur) words.push({ w: cur, s: s0, e: e0, at: a.characters.length - cur.length });
  return { audio: Buffer.from(j.audio_base64, "base64"), words, dur: a.character_end_times_seconds.at(-1) };
}

/** Rakam, para ve isim gibi vurgu kelimeleri (cümle başı büyük harfi sayılmaz). */
export function isKeyWord(w, prev) {
  const bare = String(w).replace(/[^\p{L}\p{N}$%,.]/gu, "");
  if (/[\d$%]/.test(bare)) return true;
  // Yazıyla okunan sayılar ve büyüklükler de vurgulanır (anlatıcı "fourteen billion" der, rakam yazmaz).
  const plain = String(w).toLowerCase().replace(/[^a-z-]/g, "");
  if (/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|millions|billion|billions|trillion|percent|half|double|triple)(-[a-z]+)?$/.test(plain)) return true;
  const sentenceStart = !prev || /[.!?…]["”']?$/.test(prev);
  return !sentenceStart && /^\p{Lu}[\p{L}'’.-]{2,}/u.test(bare);
}

// Short phrases use the actual speech time, rather than switching every 2-3 words.
// The existing 118px caption style needs a compact two-line text budget.
function teaserPhrases(words) {
  const chunks = [];
  const sentenceEnd = /[.!?…]["'”’)]*$/;
  const dangling = /^(a|an|the|and|or|but|at|by|for|from|in|of|on|to|with|could|would|should|will|ve|bir|ile|için)$/i;
  // A quantity is one unit: "half | a dozen hospitals" read as "a dozen" (12) on its own line — wrong number.
  const bare = (w) => String(w || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const magnitude = /^(dozen|dozens|hundred|hundreds|thousand|thousands|million|millions|billion|billions|trillion|trillions|percent)$/;
  const splitsQuantity = (a, b) => !/[,.;:!?]$/.test(String(a)) && (magnitude.test(bare(b)) || (bare(a) === "half" && /^(a|an)$/.test(bare(b))));
  for (let begin = 0; begin < words.length;) {
    let end = begin + 1;
    while (end < words.length && !sentenceEnd.test(words[end - 1].w)) end++;
    const costs = new Map([[end, 0]]), next = new Map();
    for (let i = end - 1; i >= begin; i--) {
      let text = '', best = Infinity;
      for (let j = i; j < Math.min(end, i + 6); j++) {
        text += (text ? ' ' : '') + words[j].w;
        if (j > i && text.length > 32) break;
        const stop = j + 1;
        const finish = stop < words.length ? Math.min(words[stop].s, words[j].e + 0.6) : words[j].e + 0.3;
        const duration = finish - words[i].s;
        const score = 10 + (text.length - 24) ** 2 / 32
          + (j === i ? 45 : 0) + Math.max(0, 1.15 - duration) * 120
          + Math.max(0, duration - 2.8) * 15
          + (stop < end && dangling.test(words[j].w) ? 25 : 0)
          + (stop < end && splitsQuantity(words[j].w, words[stop].w) ? 80 : 0)
          - (/[,;:]$/.test(words[j].w) ? 4 : 0) + costs.get(stop);
        if (score < best) { best = score; next.set(i, stop); }
      }
      costs.set(i, best);
    }
    for (let i = begin; i < end;) {
      const stop = next.get(i);
      chunks.push({ words: words.slice(i, stop), previous: words[i - 1], next: words[stop] });
      i = stop;
    }
    begin = end;
  }
  return chunks;
}

/**
 * Kelime zamanlarından sabit altyazı öbekleri (vurgu kelimeleri sarı) + kanca + kapaklı izle kartı.
 * `pictures` (resimli Short): her resmin { s, e, y, face, identity, named } — üst etiket resmin yerinde (labelPieces),
 * başkasının yüzündeki adı taşıyan altyazı öbeği gösterilmez (`named`: o cümlenin soyadıyla andığı kişiler).
 */
export function buildTeaserAss({ words, hook = "", slams = [], figures = [], hookFor = null, voiceEnd, total, endCard = "FULL DOCUMENTARY ON THE CHANNEL", look = "punch", opening = null, likeText = "LIKE  •  SUBSCRIBE", hookY = null, screen = null, pictures = null, people = [], logFn = () => {} }) {
  // The look (docu-shorts-looks.js) sets every style: type, keyword colour, how a slam lands.
  const L = SHORT_LOOKS[look] || SHORT_LOOKS.punch;
  const head = buildShortAss({ cues: [], start: 0, end: total, hook: "", endCard: "" }).split("\n").filter((l) => !l.startsWith("Dialogue:") && !l.startsWith("Style:"));
  const at = head.indexOf("[V4+ Styles]");
  // A Short has no spoken ask: its end card carries it, and a LIKE • SUBSCRIBE plate pops a beat after the card
  // (owner, Oct 2026: the call on screen exactly when it is asked, short). White on a dark plate, under the card.
  const likeStyle = "Style: Like,Impact,58,&H00FFFFFF,&H00FFFFFF,&H00141414,&H00000000,0,0,0,0,100,100,2,0,3,16,0,2,90,90,430,1";
  const lines = [...head.slice(0, at + 2), ...lookStyles(look), likeStyle, ...head.slice(at + 2)];
  const ev = [];
  const sTag = slamTags(look);
  // Açılış: anlatıcının üç kelimesi ("ships", "hill", "night") tam söylendiği anda ortaya çakılır,
  // her biri kendi görüntüsünün üstünde; açılış bitince kanca üstte etiket olarak kalır.
  // Over a face the word drops to the lower third (low): mid-frame it sat on Tammy Faye's eyes (Bakker Short, Oct 2026).
  slams.forEach((m) => ev.push(`Dialogue: 3,${assTime(m.s)},${assTime(m.e)},Slam,,0,0,0,,${m.low ? `{\\an5\\pos(${W / 2},${Math.round(H * SLAM_LOW_Y)})}` : ""}${sTag}${assText(m.text)}`));
  // A question / statement / quote opening: the whole line set big while it is said, its key word in the look's colour.
  if (opening?.text) {
    const key = String(opening.key || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const txt = assText(L.upper ? opening.text.toUpperCase() : opening.text)
      .split(" ")
      .map((w) => (key && w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === key ? `${keyTag(look)}${w}${inkTag(look)}` : w))
      .join(" ");
    ev.push(`Dialogue: 3,${assTime(opening.s)},${assTime(opening.e)},Open,,0,0,0,,{\\an5\\pos(${W / 2},${H * 0.42})\\fad(160,120)}${txt}${opening.who ? `\\N{\\fs44\\i0}— ${assText(opening.who)}` : ""}`);
  }
  const openEnd = Math.max(slams.length ? slams.at(-1).e : 0, opening?.e ?? 0);
  // The hook label follows the screen text, never over it (picture Shorts): they are on two layers, and libass only
  // keeps events of one layer apart. When the opening's last fragment had no slam, openEnd came before the screen text
  // ended and both labels printed over each other at the top (Lula Short 1, 27 Oct 2026: 1.85-5.35 s; Short 3: 6.05-8.07 s).
  const hookFrom = pictures?.length && screen?.text ? Math.max(openEnd, Math.max(0.8, screen.e ?? openEnd)) : openEnd;
  // hookFor: the label stays only that long after the opening (a picture Short is not covered by it all along).
  const hookEnd = hookFor != null ? Math.min(voiceEnd + 0.2, hookFrom + hookFor) : voiceEnd + 0.2;
  // A fade, never a scale-in: libass wraps a scaled line again — the label showed on two lines for 4 frames,
  // then snapped to one (Bakker Short, Oct 2026).
  // hookY: under an eyewitness clip the label moves below the source's own label, never over it (Panama Short).
  // `pictures`: the label in pieces, each at its picture's place — under a face in the upper band, not over someone
  // else's face when it names a person (Lula Short 1, 27 Oct 2026: "LULA: 51.78%" on Lula's forehead). A piece fades in
  // only at the label's start and out only at its end; between pictures it cuts with the picture. A placed piece takes
  // the event's MarginV (the Hook style is top-aligned, \an8) rather than \pos, so libass still keeps it clear of others.
  const labelAt = (y) => (y && !pictures?.length ? `\\an8\\pos(${W / 2},${y})` : "");
  const marginV = (y) => (y && pictures?.length ? Math.round(y) : 0);
  // The label's first piece always fades in, also when it starts after a hidden picture or a figure (never a pop-in).
  const fad = (p, s, e, fi, fo, first = false) => {
    const i = first || Math.abs(p.s - s) < 0.005 ? fi : 0;
    const o = Math.abs(p.e - e) < 0.005 ? fo : 0;
    return i || o ? `\\fad(${i},${o})` : "";
  };
  const placed = { pictures, people, y: hookY, figures, slams };
  // İNCELEME (27 Ekim 2026): a figure said in the label's time takes its place under a face (labelPieces), and the label
  // kept only what was left: Constantinople Shorts (20261002-508aca) 1.03 s of 3.5, popping in after "1,123" — the flash
  // the Bakker Short was criticised for ("bir şey geliyor hızlıca kayboluyor") —, Crash of 1929 (20260930-70cef2) 1.45 s,
  // Lula Short 3 (20261026-29db03) none at all. The label now gets the time the figures took back after them.
  const kept = (ps) => ps.reduce((n, p) => n + p.e - p.s, 0);
  let hookTo = hookEnd;
  let hookPieces = hook ? labelPieces(hookFrom, hookTo, hook, placed) : [];
  if (hook && pictures?.length && figures.length) {
    const lost = kept(labelPieces(hookFrom, hookTo, hook, { ...placed, figures: [] })) - kept(hookPieces);
    const to = Math.min(voiceEnd + 0.2, hookTo + lost);
    const more = lost > 0.05 && to > hookTo ? labelPieces(hookFrom, to, hook, placed) : hookPieces;
    if (kept(more) > kept(hookPieces)) [hookTo, hookPieces] = [to, more];
  }
  hookPieces.forEach((p, k) => ev.push(`Dialogue: 1,${assTime(p.s)},${assTime(p.e)},Hook,,0,0,${marginV(p.y)},,{${labelAt(p.y)}${fad(p, hookFrom, hookTo, 160, 250, k === 0)}}${assText(hook.toUpperCase())}`));
  // The hook's proof (1.16.16, "söz merak ettirir, yazı kanıt verir"): ≤4 words from the FIRST frame to the end of the
  // opening, where the label later sits — the first frame is never an empty picture. No fade-in: it is there at once.
  if (screen?.text) {
    const s0 = Math.max(0, screen.s ?? 0);
    const e0 = Math.max(0.8, screen.e ?? openEnd);
    for (const p of labelPieces(s0, e0, screen.text, placed)) ev.push(`Dialogue: 2,${assTime(p.s)},${assTime(p.e)},Hook,,0,0,${marginV(p.y)},,{${labelAt(p.y)}\\fscx118\\fscy118${fad(p, s0, e0, 0, 200)}}${assText(screen.text)}`);
  }
  // A striking number lands big on the picture when it is said ("4,773"), never as a dark card — in the lower
  // middle, above the captions: faces and subjects sit in the upper half of a vertical picture.
  // Its lines are set by hand (\q2 + fixedLines): libass wraps by the scaled width, a pop from 160 % broke a figure differently.
  figures.forEach((m) => ev.push(`Dialogue: 3,${assTime(m.s)},${assTime(m.e)},Fig,,0,0,0,,{\\q2\\an5\\pos(${W / 2},1230)\\fscx160\\fscy160\\t(0,110,\\fscx100\\fscy100)\\fad(0,150)}${fixedLines(assText(m.text), 12)}`));
  // Açılışta alt yazı yok: çakılan kelime zaten ekranda (aynı sözü iki kez yazmak yankı olur).
  let i = words.findIndex((w) => w.s >= openEnd - 0.05);
  if (i < 0) i = words.length;
  // A caption that names someone over another face is not shown: the narrator says the name (Chernobyl Shorts, 27 Oct
  // 2026: "AND BORYS BARANOV" over two AI men in a control room). The pictures it overlaps decide, by their sentences' names.
  const hidden = [];
  for (const phrase of teaserPhrases(words.slice(i))) {
    const chunk = phrase.words;
    const s = Math.max(openEnd, chunk[0].s);
    const e = phrase.next ? Math.min(phrase.next.s, chunk.at(-1).e + 0.6) : chunk.at(-1).e + 0.3;
    if (pictures?.length) {
      const here = pictures.filter((p) => p.s < e - 0.05 && p.e > s + 0.05);
      const named = [...new Set(here.flatMap((p) => p.named || []))];
      const plain = chunk.map((c) => c.w).join(" ");
      if (named.length && here.some((p) => p.face && notOnPicture(plain, p.identity, named).length)) {
        hidden.push(plain);
        continue;
      }
    }
    const txt = chunk
      .map((c, k) => {
        const w = assText(L.upper ? c.w.toUpperCase() : c.w);
        return isKeyWord(c.w, (k ? chunk[k - 1] : phrase.previous || words[i - 1])?.w) ? `${keyTag(look)}${w}${inkTag(look)}` : w;
      })
      .join(" ");
    ev.push(`Dialogue: 0,${assTime(s)},${assTime(e)},Cap,,0,0,0,,${txt}`);
  }
  if (hidden.length) logFn(`Shorts: ${hidden.length} altyazı öbeği adı başkasının yüzünde gösterecekti, gösterilmedi (${hidden.map((t) => `"${t}"`).join(", ").slice(0, 160)})`);
  if (endCard) ev.push(`Dialogue: 2,${assTime(voiceEnd + 0.3)},${assTime(total)},End,,0,0,0,,{\\q2\\fscx125\\fscy125\\t(0,160,\\fscx100\\fscy100)}${fixedLines(assText(endCard), 18)}`);
  if (endCard && likeText && total - (voiceEnd + 0.7) >= 0.8) ev.push(`Dialogue: 2,${assTime(voiceEnd + 0.7)},${assTime(total)},Like,,0,0,0,,{\\fscx55\\fscy55\\t(0,140,\\fscx112\\fscy112)\\t(140,260,\\fscx100\\fscy100)}${assText(likeText)}`);
  return [...lines.filter(Boolean), ...ev, ""].join("\n");
}

/**
 * Montaj: her parça uzun videonun bir anı (sessiz, yavaş yakınlaşma/uzaklaşma), sonda kapak kartı;
 * dikey düzen + altyazı + açılışta beyaz flaş. Ses: yeni anlatım + videonun müziği (alçak) +
 * kesmelerde whoosh, kancada ve son kartta vuruş; -14 LUFS.
 */
export function renderTeaser({ video, segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx = {}, slamAt = [], ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts" }) {
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const args = ["-nostdin", "-y", "-hide_banner", "-loglevel", "error"];
  segments.forEach((g) => args.push("-ss", g.src.toFixed(2), "-t", ((g.dur - (g.hold || 0)) / (g.speed || 1) + 0.05).toFixed(2), "-i", video));
  const n = segments.length;
  const endDur = Math.max(1.5, total - segments.reduce((a, g) => a + g.dur, 0));
  args.push("-loop", "1", "-t", endDur.toFixed(2), "-i", thumbFile, "-i", voiceFile);
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
  const parts = segments.map((g, i) => {
    const frames = Math.max(2, Math.round(g.dur * 30));
    // Her kesme yön değiştirir: içeri / dışarı yavaş kamera (Shorts'ta durağan kare yok).
    // Hafif kamera (en fazla %4): daha fazlası kenardaki yazıları keser.
    const z = i % 2 ? `1.04-0.04*on/${frames}` : `1+0.04*on/${frames}`;
    // speed > 1: the scene is shorter than the sentence, so its footage plays slower to cover it.
    // hold > 0: the picture ends before the sentence does, so its last frame stays (never the next scene).
    const slow = ((g.speed || 1) > 1.001 ? `setpts=${(g.speed).toFixed(3)}*(PTS-STARTPTS),` : "") + ((g.hold || 0) > 0.02 ? `tpad=stop_mode=clone:stop_duration=${(g.hold + 0.1).toFixed(2)},` : "");
    return `[${i}:v]${slow}scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,trim=0:${g.dur.toFixed(3)},setpts=PTS-STARTPTS[s${i}]`;
  });
  // Kapak kartı: dikey kırpmada kenarları kesilmesin diye kapak orta %80'e sığdırılır, etrafı bulanık kopyası.
  parts.push(`[${n}:v]fps=30,setsar=1,split[ea][eb]`, `[ea]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=24,${BLUR_FILL}[eg]`, `[eb]scale=1500:-2[et]`, `[eg][et]overlay=(W-w)/2:(H-h)/2,setpts=PTS-STARTPTS[endc]`);
  parts.push(`${segments.map((_, i) => `[s${i}]`).join("")}[endc]concat=n=${n + 1}:v=1:a=0[cat]`);
  const fg = 1.0; // tam genişlik: uzun videonun yatay karesi dikeyde kırpılmaz
  const fgW = Math.round((W * fg) / 2) * 2;
  const fgH = Math.round((fgW * 9) / 16 / 2) * 2;
  parts.push(`[cat]split[a][b]`, `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28,${BLUR_FILL}[bg]`, `[b]scale=${fgW}:${fgH},crop=${W}:${fgH}[fgv]`);
  parts.push(`[bg][fgv]overlay=0:(H-h)/2-40,subtitles='${esc(assFile)}':fontsdir='${esc(fontsDir)}',fade=t=in:d=0.18:color=white,fade=t=out:st=${(total - 0.4).toFixed(2)}:d=0.4,format=yuv420p[v]`);
  const vi = n + 1;
  const mix = ["[vo]"];
  parts.push(`[${vi}:a]apad,atrim=0:${total.toFixed(2)},volume=1.0[vo]`);
  if (musicIn != null) {
    parts.push(`[${musicIn}:a]atrim=0:${total.toFixed(2)},asetpts=PTS-STARTPTS,volume=0.22,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[mus]`);
    mix.push("[mus]");
  }
  // Kesme anları (parçaların sınırları) ve vuruşlar.
  const cuts = [];
  let t = 0;
  for (const g of segments) {
    t += g.dur;
    cuts.push(t);
  }
  // Açılışta her çakılan kelimeye bir vuruş; whoosh yalnızca açılıştan sonraki kesmelerde.
  const openEnd = slamAt.length ? slamAt.at(-1) + 0.3 : 0;
  const whooshAt = cuts.slice(0, -1).filter((c) => c > openEnd).map((c) => Math.max(0, c - 0.28));
  const hitAt = [...(slamAt.length ? slamAt : [0]), cuts.at(-1)];
  const place = (inIdx, times, gain, tag) => {
    if (inIdx == null || !times.length) return;
    parts.push(`[${inIdx}:a]volume=${gain},asplit=${times.length}${times.map((_, k) => `[${tag}${k}]`).join("")}`);
    times.forEach((at, k) => {
      const ms = Math.round(at * 1000);
      parts.push(`[${tag}${k}]adelay=${ms}|${ms},apad,atrim=0:${total.toFixed(2)}[${tag}o${k}]`);
      mix.push(`[${tag}o${k}]`);
    });
  };
  place(sfxIn.whoosh, whooshAt, 0.32, "w");
  place(sfxIn.hit, hitAt, 0.55, "h");
  parts.push(`${mix.join("")}amix=inputs=${mix.length}:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`);
  args.push("-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[aout]", "-t", total.toFixed(2), "-c:v", "libx264", "-threads", SHORT_THREADS, "-preset", "medium", "-crf", "19", ...SHORT_VBV, "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out);
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true, killSignal: "SIGKILL", timeout: SHORT_ENCODE_MS });
  if (r.status !== 0) throw new Error(`Teaser render başarısız: ${ffmpegWhy(r, SHORT_ENCODE_MS, 500)}`);
  return out;
}

export const TEASER_SHOT_MAX = 6;
export const TEASER_STRETCH_MAX = 1.6;

/**
 * Her altyazı satırının uzun videodaki SAHNE penceresi: aynı sahneye düşen ardışık satırlar
 * tek pencere. Sahne bilinmiyorsa satırın kendisi ile bir sonraki satır arası.
 */
export function sceneWindows(cues, sceneIdx = []) {
  return cues.map((c, i) => {
    const k = sceneIdx[i];
    if (k == null || k < 0) return { s: c.s, e: cues[i + 1]?.s ?? c.e + 0.5 };
    let a = i;
    while (a > 0 && sceneIdx[a - 1] === k) a--;
    let b = i;
    while (b + 1 < cues.length && sceneIdx[b + 1] === k) b++;
    return { s: cues[a].s, e: cues[b + 1]?.s ?? cues[b].e + 0.5 };
  });
}

/**
 * Cümle aralıkları (kelime zamanlarından) -> montaj parçaları. Bir cümle = bir görüntü: kesme
 * cümle değişirken gelir. Görüntü uzun videodaki o sahnenin içinden alınır (sahne geçişleri
 * hariç); sahne cümleden kısaysa en fazla 1,6x ağırlaştırılır, yetmezse "more" satırına geçilir.
 * Kullanıcı: "anlatılanla görsel çok saçma hızlı geçiyor".
 */
export function teaserSegments({ beats, words, cues, videoDur, windows = sceneWindows(cues), tail = 0.45, shotMax = TEASER_SHOT_MAX, stretchMax = TEASER_STRETCH_MAX }) {
  const beatStart = beatStarts(beats, words);
  const voiceEnd = words.at(-1).e;
  // The scene's usable footage: past the transition into it, before the transition out.
  const usable = (line) => {
    const w = windows[line] || { s: cues[line].s, e: cues[line].e };
    const a = w.s + 0.25;
    return { a, b: Math.max(a + 0.5, w.e - 0.25) };
  };
  const shot = (line, dur, beat) => {
    const { a, b } = usable(line);
    const len = b - a;
    const speed = dur <= len ? 1 : Math.min(stretchMax, dur / len);
    const need = dur / speed;
    // Start just before the narrated line, but keep the whole shot inside its scene.
    let src = need <= len ? Math.min(Math.max(a, cues[line].s - 0.3), b - need) : a;
    src = Math.max(0, Math.min(src, videoDur - need - 0.1));
    return { src: +src.toFixed(3), dur, speed: +speed.toFixed(3), beat, line };
  };
  const out = [];
  beats.forEach((b, k) => {
    const s = k === 0 ? 0 : beatStart[k];
    const e = k + 1 < beats.length ? beatStart[k + 1] : voiceEnd + tail;
    let left = Math.max(0.8, e - s);
    const lines = [b.line, ...(b.more || [])].filter((x, i, all) => all.indexOf(x) === i);
    for (let i = 0; left > 0.01; i++) {
      const line = lines[Math.min(i, lines.length - 1)];
      const last = i >= lines.length - 1;
      const { a, b: end } = usable(line);
      // The last picture takes the rest of the sentence; an earlier one only what its scene can hold.
      let dur = last ? left : Math.min(left, shotMax, (end - a) * stretchMax);
      if (left - dur < 1.2) dur = left; // never leave a sliver of a shot
      out.push(shot(line, dur, k));
      left -= dur;
    }
  });
  return out;
}

/**
 * The stretch of the long video around `anchor` that still shows the same picture: frames are
 * compared (32x18 grey) with the anchor frame, and a wipe, push or cut to another scene shows up
 * as a large difference. Subtitle times alone are not enough: a scene often hands over to the
 * next one a moment before the next line is spoken.
 */
export function sameShotSpan({ video, ffmpeg = "ffmpeg", anchor, before = 3, after = 7, fps = 10, threshold = 26 }) {
  const t0 = Math.max(0, anchor - before);
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-loglevel", "error", "-ss", t0.toFixed(2), "-t", (anchor - t0 + after).toFixed(2), "-i", video, "-an", "-vf", `fps=${fps},scale=32:18,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 64 * 1024 * 1024, windowsHide: true, killSignal: "SIGKILL", timeout: SHORT_PROBE_MS });
  const px = 32 * 18;
  const buf = r.stdout;
  const n = buf ? Math.floor(buf.length / px) : 0;
  if (r.status !== 0 || n < 2) return null;
  const at = Math.min(n - 1, Math.max(0, Math.round((anchor - t0) * fps)));
  const diff = (i) => {
    let d = 0;
    for (let k = 0; k < px; k++) d += Math.abs(buf[i * px + k] - buf[at * px + k]);
    return d / px;
  };
  let a = at;
  while (a > 0 && diff(a - 1) < threshold) a--;
  let b = at;
  while (b < n - 1 && diff(b + 1) < threshold) b++;
  return { s: t0 + a / fps, e: t0 + (b + 1) / fps };
}

/**
 * Keeps every shot on its own picture: the footage is placed inside the span that still shows the
 * line's picture; a span shorter than the shot plays slower (up to 2x) and then holds its last frame.
 */
export function fitShotToSpan(seg, span, slowMax = 2) {
  if (!span) return seg;
  const s = span.s + 0.05;
  const avail = Math.max(0.3, span.e - 0.08 - s);
  if (avail >= seg.dur) return { ...seg, src: +Math.min(Math.max(seg.src, s), span.e - 0.08 - seg.dur).toFixed(3), speed: 1, hold: 0 };
  const speed = Math.min(slowMax, seg.dur / avail);
  return { ...seg, src: +s.toFixed(3), speed: +speed.toFixed(3), hold: +Math.max(0, seg.dur - avail * speed).toFixed(3) };
}

/** What the long video shows under each subtitle line (from its props): portrait name, counter, headline, chart... */
export function screenOf(sc) {
  if (!sc) return "";
  const short = (t, n = 70) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
  switch (sc.type) {
    case "counter": return `counter ${sc.prefix || ""}${sc.to ?? ""}${sc.suffix || ""} ${short(sc.label, 40)}`.trim();
    case "stat": return `big number ${short(sc.value, 20)} ${short(sc.label, 40)}`;
    case "chart": return `chart: ${short(sc.title, 50)}`;
    case "headline": return `newspaper headline: ${short(sc.headline, 60)}`;
    case "map": return `map of ${short(sc.region, 30)}`;
    case "quote": return `quote card: ${short(sc.quote, 50)}`;
    case "title": return `title card: ${short(sc.title || sc.kicker, 50)}`;
    default: {
      const who = sc.name ? `portrait of ${sc.name}` : "";
      // A generated picture is what its prompt says; an archive one is best described by its caption or query.
      const ai = /\/img-[0-9a-f]+\./.test(String(sc.image || ""));
      const what = short(ai ? sc.imagePrompt || sc.caption || sc.search : sc.caption || sc.search || sc.imagePrompt, 70);
      return [who, what].filter(Boolean).join(" — ") || sc.type || "";
    }
  }
}
/** Each subtitle line's scene in the long video's props (-1 when it cannot be matched). */
export function sceneIndexFor(scenes, cues) {
  const norm = (x) => String(x || "").toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const says = scenes.map((s) => norm(s.say));
  let from = 0;
  return cues.map((c) => {
    const key = norm(c.t).split(" ").slice(0, 5).join(" ");
    if (!key) return -1;
    let i = says.findIndex((t, k) => k >= from && t.includes(key));
    if (i < 0) i = says.findIndex((t) => t.includes(key));
    if (i < 0) return -1;
    from = i;
    return i;
  });
}

function propsScript(jobDir) {
  try {
    const dir = path.join(jobDir, "docu");
    return JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".props.json"))), "utf8")).script || null;
  } catch {
    return null;
  }
}

function propsScenes(jobDir) {
  return propsScript(jobDir)?.scenes || [];
}

export function screensFor(jobDir, cues) {
  const scenes = propsScenes(jobDir);
  if (!scenes.length) return [];
  // A picture swapped by hand (docu-scene-overrides.json) no longer matches the scene's prompt or
  // query: describe it only if the override says what it shows, else mark it unknown.
  let overrides = [];
  try {
    overrides = JSON.parse(fs.readFileSync(path.join(jobDir, "docu-scene-overrides.json"), "utf8")).filter((o) => o?.match && (o.set?.image || o.set?.video));
  } catch {}
  return sceneIndexFor(scenes, cues).map((i) => {
    if (i < 0) return "";
    const o = overrides.find((x) => String(scenes[i].say || "").includes(x.match));
    if (o) return o.set.desc ? String(o.set.desc).slice(0, 80) : "(picture replaced, content unknown: do not pick)";
    return screenOf(scenes[i]);
  });
}

/**
 * A slammed word must be on screen: when the planned line's screen does not mention it (e.g.
 * CHAIN over a picture of walls), move that beat to the nearest line whose screen does.
 */
export function fixSlamLines(beats, screens) {
  return beats.map((b) => {
    if (!b.slam || !screens.length) return b;
    const stem = b.slam.toLowerCase().replace(/(es|s)$/, "");
    if (stem.length < 3) return b;
    const has = (i) => new RegExp(`\\b${stem}`, "i").test(screens[i] || "");
    if (has(b.line)) return b;
    let best = -1;
    screens.forEach((_, i) => {
      if (has(i) && (best < 0 || Math.abs(i - b.line) < Math.abs(best - b.line))) best = i;
    });
    return best < 0 ? b : { ...b, line: best };
  });
}

function videoDuration(ffmpeg, file) {
  const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-i", file], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: SHORT_PROBE_MS });
  const m = String(r.stderr || "").match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  // A probe that hung is no 0-second video (every shot would come from its first seconds): the teaser fails clearly.
  if (!m && r.error?.code === "ETIMEDOUT") throw new Error(`video süresi okunamadı: ${ffmpegWhy(r, SHORT_PROBE_MS)}`);
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
}

/** Bir işin son videosundan Shorts: yeni teaser (yedek: kesit); shorts/ klasörüne yazar. */
export async function makeDocuShort(opts = {}) {
  const { jobDir, settings = {}, logFn = () => {} } = opts;
  let job = {};
  try {
    job = JSON.parse(fs.readFileSync(path.join(jobDir, "job.json"), "utf8"));
  } catch {}
  if (settings.elevenKey && opts.mode !== "cut") {
    // Picture Short first (full-screen vertical pictures); the long video's moments if the archive is too thin.
    if (opts.mode !== "moments") {
      try {
        return await makePictureTeaser({ ...opts, job });
      } catch (e) {
        logFn(`Shorts: görsel teaser yapılamadı (${String(e?.message || e).slice(0, 160)}), uzun videonun anlarıyla yapılıyor`);
      }
    }
    try {
      return await makeDocuTeaser({ ...opts, job });
    } catch (e) {
      logFn(`Shorts: teaser yapılamadı (${String(e?.message || e).slice(0, 160)}), kesit Shorts'a dönülüyor`);
    }
  }
  return makeDocuCut(opts);
}

const NUM_WORD = /^(?:\d[\d,.]*%?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|point|half)$/;
const NUM_UNIT = /^(?:percent|per|cent|dollars?|pounds?|francs?|marks?|metres?|meters?|miles?|kilometres?|kilometers?|feet|tons?|degrees?)$/;

/** Index of the last spoken word of the number starting at words[i] ("two hundred and five dollars" -> "dollars"). */
export function numberEnd(words, i) {
  const bare = (k) => String(words[k]?.w || "").toLowerCase().replace(/[^\p{L}\p{N}%.,]/gu, "").replace(/[.,]+$/, "");
  const ends = (k) => /[.!?;:,]["”']?$/.test(String(words[k]?.w || "").trim());
  let j = i;
  while (!ends(j) && j + 1 < words.length) {
    const n = bare(j + 1);
    if (NUM_WORD.test(n) || (n === "and" && NUM_WORD.test(bare(j + 2)))) j++;
    else break;
  }
  // The unit belongs to the figure ("12.8%" lands on "percent").
  while (!ends(j) && j + 1 < words.length && NUM_UNIT.test(bare(j + 1))) j++;
  return j;
}

/**
 * How a new picture must look to sit among the archive of a story set in `year`. `mono`: the Short's own real archive
 * pictures are black-and-white (archiveIsMono, measured or flagged) — only then is the new one asked in black and white.
 * Was every story from 1850 to 1954 by year range (Gimli 20261028-9ff721 / Kartal Yuvası 950730, 29 Oct 2026: the
 * Shorts came out grey among colour archive photos; the channel's videos measured saturation 2.5-7.5). A photograph of
 * the time is otherwise asked in natural colour, bright and well exposed; before photography, painterly.
 */
export function newPictureStyle(year, genre = "", { mono = false } = {}) {
  if (year == null || year >= 1990) return genre === "epic" ? "Era-accurate historical scene." : "";
  const era = year < 0 ? `${-year} BC` : String(year);
  if (year < 1850) return `Era-accurate scene of ${era}, painterly historical look.`;
  return `Era-accurate scene of ${era}, ${mono === true ? "a black-and-white archival photograph of the time, bright and well exposed, clear midtones, film grain" : "a natural colour photograph of the time, bright and well exposed, fine film grain"}.`;
}

/** Teaser in picture mode (docu-shorts-pictures.js): every sentence its own full-screen vertical picture. */
/** The Short's cover (renderShortCover) from its first picture; a clip gives its first frame. Never fails the Short. */
export function shortCover({ seg, lines, look, dir, stamp, ff, out, logFn = () => {} }) {
  if (!seg || !lines?.length) return null;
  try {
    let picture = seg.abs;
    let { srcW, srcH } = seg;
    if (seg.kind === "clip") {
      picture = path.join(dir, `short-${stamp}-cover-src.jpg`);
      const r = spawnSync(ff, ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", "-ss", String(seg.clipStart || 0), "-i", seg.abs, "-frames:v", "1", "-q:v", "2", picture], { encoding: "utf8", windowsHide: true, killSignal: "SIGKILL", timeout: SHORT_PROBE_MS });
      if (r.status !== 0) throw new Error(ffmpegWhy(r, SHORT_PROBE_MS, 200));
    }
    const file = renderShortCover({ picture, srcW, srcH, box: seg.box, rel: seg.rel, lines, look, out: path.join(dir, `short-${stamp}-cover.jpg`), ffmpeg: ff });
    const tmp = out.replace(/\.mp4$/, ".nocover.mp4");
    fs.renameSync(out, tmp);
    try {
      prependCoverFrame({ video: tmp, cover: file, out, ffmpeg: ff });
      fs.rmSync(tmp, { force: true });
    } catch (e) {
      fs.renameSync(tmp, out);
      throw e;
    }
    logFn(`Shorts kapağı: ${path.basename(file)} (${lines.join(" / ")})`);
    return { file, lines };
  } catch (e) {
    logFn(`UYARI: Shorts kapağı yapılamadı: ${e.message}`);
    return null;
  }
}

/** The earlier Shorts of a video (newest first): their title, hook and opening, so a new one takes another angle. */
export function earlierShorts(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => /^short-\d{12}\.json$/.test(f)).sort().reverse().slice(0, 4).map((f) => {
      const m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      return { title: String(m.title || ""), hook: String(m.hook || ""), opening: String(m.beats?.[0]?.say || ""), pattern: String(m.pattern || "") };
    }).filter((p) => p.title || p.opening);
  } catch {
    return [];
  }
}

/**
 * An earlier Short to re-open (same story, new first 3 seconds): its beats after the opening and its pattern.
 * Older Shorts have no openingLen: their opening is the leading beats with a slam word.
 */
export function reopenOf(dir, name) {
  const stem = String(name || "").replace(/\.(mp4|json)$/i, "");
  if (!/^short-\d{12}$/.test(stem)) return null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, `${stem}.json`), "utf8"));
    const all = Array.isArray(m.beats) ? m.beats : [];
    let n = Number.isInteger(m.openingLen) ? m.openingLen : 0;
    if (!Number.isInteger(m.openingLen)) while (n < all.length && n < 3 && all[n]?.slam) n++;
    const beats = all.slice(Math.max(1, n)).map((b) => String(b?.say || "").trim()).filter(Boolean);
    return beats.length >= 3 ? { beats, pattern: String(m.pattern || "") } : null;
  } catch {
    return null;
  }
}

/**
 * Pictures for the beats the planner left without one: a new vertical picture for a newPrompt, else the unused archive
 * picture that shows the sentence (spareFor), else nothing (the beat keeps the previous beat's picture).
 * An empty OpenAI balance answers every later call the same: after the first credit error no new picture is asked
 * for (Kartal, 25 Oct 2026: five "429 credit_balance_exhausted" in a row, one per beat).
 */
export async function fillBeatPictures({ beats, catalog, year = null, settings = {}, genre = "", mono = false, dir, newPicture = newVerticalPicture, people = [], logFn = () => {} }) {
  const used = new Set(beats.filter((b) => b.asset).map((b) => b.asset.rel));
  const spare = catalog.filter((a) => !a.textHeavy && !used.has(a.rel) && fitsPeriod(a, year)).sort((a, b) => b.quality - a.quality);
  let noOpenAI = false;
  for (const [k, b] of beats.entries()) {
    if (b.asset) continue;
    if (b.newPrompt && settings.openaiKey && !noOpenAI) {
      try {
        logFn(`Shorts: yeni dikey görsel üretiliyor — ${b.newPrompt.slice(0, 70)}`);
        // The real people the sentence names: a person in the new picture is drawn from behind (newVerticalPicture,
        // the long video's stillPrompt) — 27 Oct 2026, the Madoff sons' invented faces were the long video's lesson.
        const named = [...new Set([...namedBy(b.say, people).map((p) => p.ad), ...(b.person ? [b.person] : [])])];
        const abs = await newPicture({ prompt: b.newPrompt, dir: path.join(dir, "new"), settings, style: newPictureStyle(year, genre, { mono }), named });
        b.asset = { abs, kind: "still", srcW: 864, srcH: 1536, box: { x: 0.2, y: 0.15, w: 0.6, h: 0.6 }, what: b.newPrompt, generated: true };
        continue;
      } catch (e) {
        const msg = String(e?.message || e);
        logFn(`Shorts: yeni görsel üretilemedi (${msg.slice(0, 100)})`);
        if (e?.quota || /quota|credit|billing/i.test(msg)) {
          noOpenAI = true;
          logFn("Shorts: OpenAI kredisi bitti — kalan cümlelere yeni görsel istenmiyor, arşivden anlatılana uyan seçiliyor");
        }
      }
    }
    // An opening fragment never falls back to an AI picture while a real or stock one is spare (hookOnSubject). Nor is
    // a beat left empty when no picture before it may follow: the first beat (makePictureTeaser's catalog[0] can be a
    // text page) or one after someone else's portrait (Bormann's under "Galeazzo Ciano came up as a guest").
    const prev = beats.slice(0, k).filter((x) => x.asset).at(-1)?.asset;
    const a = spareFor(b, spare, { opening: b.slam != null && k < 3, needed: !prev || !mayShow(b, prev) });
    if (a) {
      spare.splice(spare.indexOf(a), 1);
      b.asset = a;
    } else if (prev) logFn(`Shorts: "${b.say.slice(0, 60)}" için uyan görsel yok — önceki cümlenin görseli sürüyor`);
  }
  return beats;
}

export async function makePictureTeaser(opts = {}) {
  const { jobDir, job = {}, settings = {}, usage = null, logFn = () => {}, llm, visionLlm, ffmpeg, title: titleIn, speak = speakTeaser, newPicture = newVerticalPicture, look: lookIn = null, deps = {} } = opts;
  const last = latestOutput(jobDir);
  if (!last?.v || !fs.existsSync(last.s)) throw new Error("bitmiş video/altyazı bulunamadı");
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  // The teaser dresses like its film: the long video's genre picks the look (docu-shorts-looks.js), not one yellow for all.
  let filmGenre = job.docuGenre || "documentary";
  try {
    const pf = fs.readdirSync(path.join(jobDir, "docu")).find((f) => f.endsWith(".props.json"));
    filmGenre = JSON.parse(fs.readFileSync(path.join(jobDir, "docu", pf), "utf8")).script?.genre || filmGenre;
  } catch {}
  const look = pickLook({ genre: filmGenre, want: lookIn });
  const cues = parseSrt(fs.readFileSync(last.s, "utf8"));
  const title = titleIn || job.meta?.title || job.topic || "";
  const dir = path.join(jobDir, "shorts");
  fs.mkdirSync(dir, { recursive: true });
  const assets = pictureAssets(jobDir);
  if (assets.length < 10) throw new Error(`arşivde yeterli görsel yok (${assets.length})`);
  const describe = (list) => describePictures({ assets: list, cacheFile: path.join(dir, "pictures.json"), ffmpeg: ff, ...(visionLlm ? { llm: visionLlm } : {}), settings, usage, logFn });
  let catalog = await describe(assets);
  // The hook picture is the story (hookOnSubject): too few real pictures of the subject -> Commons by name.
  const extra = await (deps.subjectTopUp || subjectTopUp)({ jobDir, title, assets: catalog, ffmpeg: ff, logFn });
  if (extra.length) catalog = await describe([...assets, ...extra]);
  if (catalog.filter((a) => !a.textHeavy).length < 8) throw new Error("kullanılabilir görsel az");
  logFn("Shorts: teaser metni ve görselleri planlanıyor...");
  // A news story is told today: never judged by one historic median year (Kartal, Oct 2026: a 2026 fire became a
  // "1952 story" and 68 of 92 pictures — the fire, today's house — left the Short). Its pictures keep their own era.
  const year = job.docuFormat === "news" ? null : storyYear(jobDir);
  // MORE SHORTS, NEW ANGLES (channel data, Oct 2026: Shorts bring ~80% of views; a long video gets 2-3 Shorts): the
  // earlier Shorts of this video are handed to the planner, which must open on another moment and another picture.
  const previous = earlierShorts(dir);
  const reopen = reopenOf(dir, opts.reopen);
  if (opts.reopen && !reopen) logFn(`Shorts: açılışı yenilenecek Short bulunamadı (${opts.reopen}); yeni Short yapılıyor`);
  if (reopen) logFn(`Shorts: aynı hikâye, yeni açılış (${reopen.beats.length} vuruş korunuyor, eski kalıp: ${reopen.pattern || "?"})`);
  // The planner is told the format: year null alone is a news story or a history story whose narration names no year,
  // and only the news story drops the "no present-day photos" line (a yearless history Short keeps it, as before).
  const plan = await (deps.planPictureTeaser || planPictureTeaser)({ cues, title, catalog, year, newsStory: job.docuFormat === "news", previous, reopen, ...(llm ? { llm } : {}), settings, usage, logFn });
  // Its numbers as the narration says them (qualifiers, owners) before a word is voiced: free lint, at most one repair.
  await checkShortClaims({ plan, cues, ...(llm ? { llm } : {}), settings, usage, logFn });
  const text = plan.beats.map((b) => b.say).join(" ");
  logFn(`Shorts: seslendiriliyor (${text.length} karakter)...`);
  const voiceId = job.elevenVoiceId || settings.docuEnVoiceId || "nPczCjzI2devNBz1zQrb";
  const voiceModel = settings.docuShortsVoiceModel === "eleven_v4_turbo" ? "eleven_v4_turbo" : "eleven_v4";
  const tts = await speak({ text: await shortVoiceText(plan.beats, { mood: "tension", model: voiceModel }), voiceId, key: settings.elevenKey, model: voiceModel });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const voiceFile = path.join(dir, `short-${stamp}.voice.mp3`);
  fs.writeFileSync(voiceFile, tts.audio);
  fs.writeFileSync(path.join(dir, `short-${stamp}.words.json`), JSON.stringify(tts.words), "utf8");

  // The story's people (name cards, quote authors, cast of the film and the writer's script; the planner's persons) and
  // each picture's scene in the film: who a picture is, whether it shows a face (shortIdentity / shortFace).
  const filmScript = propsScript(jobDir);
  let writerScript = null;
  try {
    writerScript = JSON.parse(fs.readFileSync(path.join(jobDir, "docu-script.json"), "utf8"));
  } catch {}
  const people = shortPeople([filmScript, writerScript], plan.beats.map((b) => b.person));
  const sceneOf = (a) => (Number.isInteger(a?.scene) ? filmScript?.scenes?.[a.scene] ?? null : null);

  // Pictures: the planned archive picture, a new vertical one where the archive has nothing, else the unused one that shows the sentence.
  // A new picture is black-and-white only when the Short's real archive pictures are (measured, not by year range).
  const mono = year != null && year < 1990 && archiveIsMono(catalog, { measure: (a) => meanChroma(ff, a.kind === "clip" ? a.still || a.abs : a.abs) });
  if (year != null && year < 1990) logFn(`Shorts: arşiv ${mono ? "siyah-beyaz" : "renkli"} — yeni görseller ${mono ? "siyah-beyaz" : "doğal renkte"} istenecek`);
  await fillBeatPictures({ beats: plan.beats, catalog, year, settings, genre: job.docuGenre, mono, dir, newPicture, people, logFn });
  const sized = (a) => {
    if (a && (!a.srcW || !a.srcH)) {
      const z = sizeOf(ff, a.abs);
      if (z) Object.assign(a, { srcW: z.w, srcH: z.h });
    }
  };
  plan.beats.forEach((b, k) => {
    if (!b.asset) b.asset = plan.beats[k - 1]?.asset ?? catalog[0];
    sized(b.asset);
  });
  // A name only on that person's picture: their own photo where the catalogue has it, else the slam goes (27 Oct 2026).
  const nameFixes = namesOnOwnPictures(plan.beats, { catalog, people, sceneOf, year, logFn });
  for (const x of nameFixes.swapped) sized(plan.beats[x.beat].asset);

  const words = tts.words;
  const starts = beatStarts(plan.beats, words);
  const voiceEnd = words.at(-1).e;
  const segments = plan.beats.map((b, k) => {
    const s = k === 0 ? 0 : starts[k];
    const e = k + 1 < plan.beats.length ? starts[k + 1] : voiceEnd + 0.45;
    const a = b.asset;
    const dur = Math.max(0.6, e - s);
    // Footage too short for its sentence, or going dark inside its window, holds its still frame instead.
    let clipOk = a.kind === "clip" && a.clipDur - 0.5 >= dur;
    if (clipOk && a.still) {
      const dark = darkestFrame(ff, a.abs, (a.clipStart || 0) + 0.5, dur);
      if (dark != null && dark < DARK_CLIP) {
        clipOk = false;
        logFn(`Shorts: ${path.basename(a.abs)} bu pencerede kararıyor (${dark.toFixed(0)}), sabit karesi kullanılıyor`);
      }
    }
    // A film's own AI still (img-…) or a new vertical picture may move (docu-shorts-motion.js); archive photos never.
    const aiStill = !!a.generated || String(a.rel || "").includes("/img-");
    // A clip that falls back to its still is cropped by the STILL's size: a Kling clip (1764x1176) over its
    // 1536x1024 AI still asked for a 662x1176 window and the whole Short failed (Bakker, Oct 2026).
    const still = !clipOk && a.kind === "clip" && a.still ? a.still : null;
    const z = still ? sizeOf(ff, still) : null;
    // An eyewitness clip (ew-) carries its source's label at the top: the crop starts at the top so the credit
    // stays on screen (Panama, Oct 2026: the subject box cut "Impresionantes videos de terremoto de Panamá" off).
    const box = eyewitnessBox(a.rel) || a.box || { x: 0, y: 0, w: 1, h: 1 };
    const g = { abs: still || a.abs, kind: clipOk ? "clip" : "still", clipStart: (a.clipStart || 0) + 0.5, srcW: z?.w || a.srcW, srcH: z?.h || a.srcH, box, dur, beat: k, what: a.what, rel: a.rel, generated: aiStill, picturePrompt: a.prompt || a.what || "", say: b.say };
    // A face (the long video's pictureFace): the slam drops to the lower third, the top label goes under the face.
    return withFace(g, a, sceneOf(a), people);
  });
  const total = +(voiceEnd + 0.45 + 2.6).toFixed(2);
  // Slams inside their own pictures, on the frame grid the render cuts on (frameGrid).
  const slams = lowOverFaces(snapSlams(slamTimes(plan.beats, words), gridCuts(segments)), segments, plan.beats);
  // Figures: when the whole number has been said ("two hundred and FIVE dollars"), held ~1.8 s (never into the next sentence).
  const figures = [];
  let off = 0;
  plan.beats.forEach((b, k) => {
    const from = off;
    off += b.say.length + 1;
    if (!b.figure) return;
    const bare = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    let i = words.findIndex((w) => w.at >= from && w.at < off && bare(w.w) === bare(b.figureWord));
    if (i < 0) i = words.findIndex((w) => w.at >= from && /\d/.test(w.w));
    if (i < 0) return;
    const said = words[numberEnd(words, i)];
    const end = k + 1 < plan.beats.length ? starts[k + 1] : voiceEnd;
    figures.push({ text: b.figure.toUpperCase(), s: said.s, e: Math.max(said.s + 0.8, Math.min(end - 0.05, said.s + 1.8)) });
  });
  const assFile = path.join(dir, `short-${stamp}.ass`);
  // The top label shows for 3.5 s after the opening: over an eyewitness clip it sits below the clip's source label.
  const cutsAt = gridCuts(segments);
  const openEndAt = slams.length ? slams.at(-1).e : 0;
  // The opening's screen text stays from frame 0 until the first beat after the opening starts.
  const screen = plan.screen ? { text: plan.screen, s: 0, e: plan.openingLen && starts[plan.openingLen] != null ? starts[plan.openingLen] : openEndAt || 2.5 } : null;
  // The hook label follows the screen text (buildTeaserAss hookFrom).
  const hookAt = screen ? Math.max(openEndAt, 0.8, screen.e) : openEndAt;
  const underHook = segments.some((g, k) => eyewitnessBox(g.rel) && cutsAt[k] < hookAt + 3.5 && cutsAt[k + 1] > hookAt);
  // Each picture: where the top label sits over it, whether a name could be read onto a face there, who it is, and
  // whom its sentence names (labelPictures → buildTeaserAss).
  const pictures = labelPictures({ segments, beats: plan.beats, cuts: cutsAt, total, people, sceneOf, underHook });
  fs.writeFileSync(assFile, buildTeaserAss({ words, hook: plan.hook, slams, figures, hookFor: 3.5, voiceEnd: voiceEnd + 0.45, total, look, screen, pictures, people, logFn }), "utf8");

  let musicFile = null;
  const sfx = {};
  try {
    const props = JSON.parse(fs.readFileSync(fs.readdirSync(path.join(jobDir, "docu")).map((f) => path.join(jobDir, "docu", f)).find((f) => f.endsWith(".props.json")), "utf8"));
    const m = props.script?.music && path.join(jobDir, "docu", "public", props.script.music);
    if (m && fs.existsSync(m)) musicFile = m;
    const pub = (rel) => rel && path.join(jobDir, "docu", "public", rel);
    sfx.whoosh = pub(props.script?.sfxFiles?.whoosh?.[1] ?? props.script?.sfxFiles?.whoosh?.[0]);
    sfx.hit = pub(props.script?.sfxFiles?.hit?.[1] ?? props.script?.sfxFiles?.hit?.[0]);
  } catch {}
  let thumbFile = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(jobDir, "titles.json"), "utf8"));
    const t = pkg.recommended?.thumbnail && path.join(jobDir, pkg.recommended.thumbnail);
    if (t && fs.existsSync(t)) thumbFile = t;
  } catch {}
  thumbFile ||= [path.join(jobDir, "thumbnail.jpg"), path.join(path.dirname(last.v), "thumbnail.jpg")].find((f) => fs.existsSync(f));
  if (!thumbFile) throw new Error("kapak bulunamadı");
  const out = path.join(dir, `short-${stamp}.mp4`);
  // Motion: the opening fragments first, then the eligible rest (Replicate image-to-video).
  const moving = await animateSegments(segments, { opening: 3, settings, dir: motionDir(dir), ffmpeg: ff, logFn });
  logFn(`Shorts: ${segments.length} dikey görsel (${moving.filter((g) => g.animated).length} hareketli), ${total.toFixed(1)} sn render ediliyor...`);
  renderPictureTeaser({ segments: moving, voiceFile, musicFile, thumbFile, assFile, out, total, sfx, slamAt: slams.map((m) => m.s), ffmpeg: ff, look });
  // The Short's own vertical cover from its hook picture, and the same cover as its first frame (pickable in the app).
  const cover = shortCover({ seg: segments[0], lines: coverLines(plan.cover, plan.hook), look, dir, stamp, ff, out, logFn });
  // A Commons photo fetched for the Short (subjectTopUp) carries its licence: credited in the Short's own description.
  const credits = shortCredits(plan.beats.map((b) => b.asset));
  const tags = shortHashtags({ tags: plan.hashtags, title: plan.title, description: plan.description, narration: text, niche: nicheOf({ genre: job.docuGenre, format: job.docuFormat, topic: job.topic }) });
  const meta = { file: out, mode: "pictures", hook: plan.hook, pattern: plan.pattern || "", screen: plan.screen || "", openingLen: plan.openingLen ?? null, ...(reopen ? { reopenedFrom: String(opts.reopen).replace(/\.(mp4|json)$/i, "") } : {}), cover: cover?.file || null, coverLines: cover?.lines || null, slams, figures, ...(nameFixes.swapped.length || nameFixes.slams.length ? { nameFixes } : {}), title: plan.title, hashtags: tags, description: [plan.description, credits, tags.join(" ")].filter(Boolean).join("\n\n"), narration: text, beats: plan.beats.map((b) => ({ say: b.say, slam: b.slam, figure: b.figure, picture: b.asset?.rel || (b.asset?.generated ? "new" : null), what: b.asset?.what })), segments, start: 0, end: total, source: last.v };
  fs.writeFileSync(path.join(dir, `short-${stamp}.json`), JSON.stringify(meta, null, 2), "utf8");
  logFn(`Shorts hazır: ${out}`);
  return meta;
}

function latestOutput(jobDir) {
  const attempts = path.join(jobDir, "attempts");
  const outs = [];
  try {
    for (const d of fs.readdirSync(attempts)) {
      const v = path.join(attempts, d, "output.mp4");
      if (fs.existsSync(v)) outs.push({ v, s: path.join(attempts, d, "subs.srt"), t: fs.statSync(v).mtimeMs });
    }
  } catch {}
  outs.sort((a, b) => b.t - a.t);
  return outs[0];
}

/** Yeni teaser: plan (Claude) -> ses (ElevenLabs) -> montaj (ffmpeg). */
export async function makeDocuTeaser({ jobDir, job = {}, settings = {}, usage = null, logFn = () => {}, llm = callJSON, ffmpeg, title: titleIn, speak = speakTeaser } = {}) {
  const last = latestOutput(jobDir);
  if (!last?.v || !fs.existsSync(last.s)) throw new Error("bitmiş video/altyazı bulunamadı");
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  const cues = parseSrt(fs.readFileSync(last.s, "utf8"));
  const title = titleIn || job.meta?.title || job.topic || "";
  logFn("Shorts: teaser metni yazılıyor...");
  const screens = screensFor(jobDir, cues);
  const plan = await planTeaser({ cues, title, screens, llm, settings, usage, logFn });
  plan.beats = fixSlamLines(plan.beats, screens);
  const text = plan.beats.map((b) => b.say).join(" ");
  logFn(`Shorts: seslendiriliyor (${text.length} karakter)...`);
  const voiceId = job.elevenVoiceId || settings.docuEnVoiceId || "nPczCjzI2devNBz1zQrb";
  const voiceModel = settings.docuShortsVoiceModel === "eleven_v4_turbo" ? "eleven_v4_turbo" : "eleven_v4";
  const tts = await speak({ text: await shortVoiceText(plan.beats, { mood: "tension", model: voiceModel }), voiceId, key: settings.elevenKey, model: voiceModel });
  const dir = path.join(jobDir, "shorts");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const voiceFile = path.join(dir, `short-${stamp}.voice.mp3`);
  fs.writeFileSync(voiceFile, tts.audio);
  fs.writeFileSync(path.join(dir, `short-${stamp}.words.json`), JSON.stringify(tts.words), "utf8");
  const videoDur = videoDuration(ff, last.v);
  const windows = sceneWindows(cues, sceneIndexFor(propsScenes(jobDir), cues));
  const segments = teaserSegments({ beats: plan.beats, words: tts.words, cues, videoDur, windows }).map((g) =>
    fitShotToSpan(g, sameShotSpan({ video: last.v, ffmpeg: ff, anchor: Math.min(cues[g.line].e - 0.1, cues[g.line].s + 0.5) })),
  );
  const voiceEnd = tts.words.at(-1).e;
  const total = +(voiceEnd + 0.45 + 2.6).toFixed(2);
  const slams = slamTimes(plan.beats, tts.words);
  const assFile = path.join(dir, `short-${stamp}.ass`);
  const tStarts = beatStarts(plan.beats, tts.words);
  const screen = plan.screen ? { text: plan.screen, s: 0, e: plan.openingLen && tStarts[plan.openingLen] != null ? tStarts[plan.openingLen] : 2.5 } : null;
  fs.writeFileSync(assFile, buildTeaserAss({ words: tts.words, hook: plan.hook, slams, voiceEnd: voiceEnd + 0.45, total, screen }), "utf8");
  // Videonun kendi müziği (açılış parçası) ve kapağı.
  let musicFile = null;
  const sfx = {};
  try {
    const props = JSON.parse(fs.readFileSync(fs.readdirSync(path.join(jobDir, "docu")).map((f) => path.join(jobDir, "docu", f)).find((f) => f.endsWith(".props.json")), "utf8"));
    const m = props.script?.music && path.join(jobDir, "docu", "public", props.script.music);
    if (m && fs.existsSync(m)) musicFile = m;
    const pub = (rel) => rel && path.join(jobDir, "docu", "public", rel);
    sfx.whoosh = pub(props.script?.sfxFiles?.whoosh?.[1] ?? props.script?.sfxFiles?.whoosh?.[0]);
    sfx.hit = pub(props.script?.sfxFiles?.hit?.[1] ?? props.script?.sfxFiles?.hit?.[0]);
  } catch {}
  let thumbFile = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(jobDir, "titles.json"), "utf8"));
    const t = pkg.recommended?.thumbnail && path.join(jobDir, pkg.recommended.thumbnail);
    if (t && fs.existsSync(t)) thumbFile = t;
  } catch {}
  thumbFile ||= [path.join(jobDir, "thumbnail.jpg"), path.join(path.dirname(last.v), "thumbnail.jpg")].find((f) => fs.existsSync(f));
  if (!thumbFile) throw new Error("kapak bulunamadı");
  const out = path.join(dir, `short-${stamp}.mp4`);
  logFn(`Shorts: ${segments.length} anlık montaj, ${total.toFixed(1)} sn render ediliyor...`);
  renderTeaser({ video: last.v, segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx, slamAt: slams.map((m) => m.s), ffmpeg: ff });
  const tags = shortHashtags({ tags: plan.hashtags, title: plan.title, description: plan.description, narration: text, niche: nicheOf({ genre: job.docuGenre, format: job.docuFormat, topic: job.topic }) });
  const meta = { file: out, mode: "teaser", hook: plan.hook, pattern: plan.pattern || "", screen: plan.screen || "", slams, title: plan.title, hashtags: tags, description: [plan.description, tags.join(" ")].filter(Boolean).join("\n\n"), narration: text, beats: plan.beats, segments, start: 0, end: total, source: last.v };
  fs.writeFileSync(path.join(dir, `short-${stamp}.json`), JSON.stringify(meta, null, 2), "utf8");
  logFn(`Shorts hazır: ${out}`);
  return meta;
}

/** Yedek (ElevenLabs yoksa): uzun videonun en güçlü 40-58 sn'lik kesiti. */
export async function makeDocuCut({ jobDir, settings = {}, usage = null, logFn = () => {}, llm = callJSON, ffmpeg, video: videoIn, srt: srtIn, title: titleIn } = {}) {
  const attempts = path.join(jobDir, "attempts");
  const outs = [];
  try {
    for (const d of fs.readdirSync(attempts)) {
      const v = path.join(attempts, d, "output.mp4");
      if (fs.existsSync(v)) outs.push({ v, s: path.join(attempts, d, "subs.srt"), t: fs.statSync(v).mtimeMs });
    }
  } catch {}
  outs.sort((a, b) => b.t - a.t);
  const video = videoIn || outs[0]?.v;
  const srt = srtIn || outs[0]?.s;
  if (!video || !fs.existsSync(video)) throw new Error("Shorts: bitmiş video bulunamadı");
  if (!srt || !fs.existsSync(srt)) throw new Error("Shorts: altyazı (subs.srt) bulunamadı");
  const cues = parseSrt(fs.readFileSync(srt, "utf8"));
  if (cues.length < 4) throw new Error("Shorts: altyazı çok kısa");
  let title = titleIn || "";
  try {
    title ||= JSON.parse(fs.readFileSync(path.join(jobDir, "job.json"), "utf8")).topic || "";
  } catch {}
  logFn("Shorts: en güçlü bölüm seçiliyor...");
  const pick = await pickShortWindow({ cues, title, llm, settings, usage, logFn });
  if (!pick) throw new Error("Shorts: uygun bölüm bulunamadı");
  const dir = path.join(jobDir, "shorts");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const assFile = path.join(dir, `short-${stamp}.ass`);
  fs.writeFileSync(assFile, buildShortAss({ cues, start: pick.start, end: pick.end, hook: pick.hook }), "utf8");
  const out = path.join(dir, `short-${stamp}.mp4`);
  logFn(`Shorts: ${pick.start.toFixed(1)}-${pick.end.toFixed(1)} sn (${(pick.end - pick.start).toFixed(1)} sn) dikey render ediliyor...`);
  renderShort({ video, start: pick.start, end: pick.end, assFile, out, ffmpeg: ffmpeg || settings.ffmpegPath || "ffmpeg" });
  const tags = shortHashtags({ tags: pick.hashtags, title: pick.title, description: pick.description });
  const meta = { file: out, start: pick.start, end: pick.end, hook: pick.hook, title: pick.title, hashtags: tags, description: [pick.description, tags.join(" ")].filter(Boolean).join("\n\n"), why: pick.why, mode: pick.mode, source: video };
  fs.writeFileSync(path.join(dir, `short-${stamp}.json`), JSON.stringify(meta, null, 2), "utf8");
  logFn(`Shorts hazır: ${out}`);
  return meta;
}

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
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { callJSON } from "../llm.js";
import { describePictures, newVerticalPicture, pictureAssets, planPictureTeaser, renderPictureTeaser, sizeOf } from "./docu-shorts-pictures.js";

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
    title: { type: "string", description: "YouTube Shorts title, max 70 chars, no hashtags" },
    description: { type: "string", description: "2-3 sentence Shorts description that points to the full documentary" },
    why: { type: "string" },
  },
  required: ["startLine", "endLine", "hook", "title", "description", "why"],
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
      return { start: cues[a].s, end: Math.min(cues[b].e, cues[a].s + SHORT_MAX + 4), from: a, to: b, hook: String(res.hook || "").trim(), title: String(res.title || "").trim(), description: String(res.description || "").trim(), why: res.why, mode: "llm" };
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
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28,eq=brightness=-0.18:saturation=0.8[bg]`,
    `[b]scale=${fgW}:${fgH},crop=${W}:${fgH}[fg]`,
    `[bg][fg]overlay=0:(H-h)/2-40,subtitles='${esc(assFile)}':fontsdir='${esc(fontsDir)}',fade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5,format=yuv420p[v]`,
  ].join(";");
  const af = `afade=t=in:d=0.25,afade=t=out:st=${(dur - 0.8).toFixed(2)}:d=0.8`;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-ss", start.toFixed(2), "-t", dur.toFixed(2), "-i", video, "-filter_complex", vf, "-map", "[v]", "-map", "0:a?", "-af", af, "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out];
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Shorts render başarısız: ${String(r.stderr || r.error?.message || "").slice(-400)}`);
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
      description: "The first spoken line, before the beats: three short fragments with a rhythm, each naming one concrete thing from the story, the last one the twist",
      properties: {
        say: { type: "string", description: "Exactly three fragments, each ending with a full stop: 'Seventy ships. One hill. And one night that ended an empire.' / 'One crash. One word. And a hero in handcuffs.'" },
        words: { type: "array", items: { type: "string" }, description: "Exactly 3 words, one from each fragment, copied exactly as spoken (e.g. ships, hill, night): each is slammed big on screen at the moment the narrator says it" },
        lines: { type: "array", items: { type: "integer" }, description: "Exactly 3 transcript line indices, one per fragment, whose {screen} shows that fragment's thing" },
      },
      required: ["say", "words", "lines"],
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
  },
  required: ["hook", "opening", "beats", "title", "description"],
  additionalProperties: false,
};

/** Claude: uzun videoya yönlendiren yeni Shorts metni + her cümlenin altındaki an. */
export async function planTeaser({ cues, title = "", screens = [], llm = callJSON, settings = {}, usage = null, logFn = () => {} }) {
  // Each line also says what the long video SHOWS at that moment, so a beat about Babson gets Babson, not Fisher.
  const lines = cues.map((c, i) => `${i} [${Math.floor(c.s / 60)}:${String(Math.floor(c.s % 60)).padStart(2, "0")}] ${c.t}${screens[i] ? `  {screen: ${screens[i]}}` : ""}`).join("\n");
  const res = await llm({
    system: "You write YouTube Shorts that sell a full-length documentary on the same channel. Return only the requested JSON.",
    user: [
      `The full documentary: "${title}". Its whole narration, one numbered line per subtitle:`,
      lines,
      "",
      `Write a NEW vertical Short (${TEASER_WORDS[0]}-${TEASER_WORDS[1]} words of narration, about 45-55 seconds) whose only job is to make the viewer watch the full documentary:`,
      "- the opening is the hook: three short spoken fragments with a rhythm, like 'A recipe. A street. And a betrayal.' — each names one concrete thing from THIS story (an object, a place, a number, a person), the third is the twist; its three words are slammed on screen exactly as the narrator says them, each over a picture of that thing, so they must be words the viewer instantly connects to the story",
      "- then the beats: 3-5 of the documentary's most striking, concrete moments (numbers, names, reversals), each one raising the stakes",
      "- never give away the ending or the answer; tease it",
      "- last beat: a short call to the full documentary on the channel (e.g. 'The full story is on the channel.')",
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
  if (beats.length < 3) throw new Error("teaser planı eksik");
  return { hook: String(res.hook || "").trim(), beats: [...openingBeats(res?.opening, clampL), ...beats], title: String(res.title || "").trim(), description: String(res.description || "").trim() };
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
  if (frags.length !== 3) return [{ say, line: lines[0] ?? 0, more: [] }];
  return frags.map((f, k) => ({ say: f, line: lines[k] ?? lines[0] ?? 0, more: [], slam: slamWord(f, words[k]) }));
}

const bare = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}$%]/gu, "");
const FILLER = new Set(["a", "an", "and", "the", "one", "of", "that", "to", "in", "on", "it", "was", "his", "her", "their", "its"]);

/** The fragment's spoken word to slam: the planned one if it is really in the fragment, else its last real word. */
export function slamWord(fragment, wanted) {
  const spoken = String(fragment).split(/\s+/).map(bare).filter(Boolean);
  if (wanted && spoken.includes(bare(wanted))) return bare(wanted).toUpperCase();
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
    out.push({ text: b.slam, s: Math.max(0, (said ?? words.find((w) => w.at >= from) ?? words[0]).s - 0.04), e: end });
  });
  return out;
}

/** ElevenLabs: metin -> mp3 + kelime zamanları (with-timestamps), uzun videonun anlatıcısıyla. */
export async function speakTeaser({ text, voiceId, key, model = "eleven_v3", fetchImpl = fetch }) {
  const body = { text, model_id: model, voice_settings: model === "eleven_v3" ? { stability: 0.5 } : { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true } };
  const r = await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
  const j = await r.json();
  const a = j.alignment || j.normalized_alignment;
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

/** Kelime zamanlarından altyazı (2-3 kelimelik parçalar, vurgu kelimeleri sarı) + kanca + kapaklı izle kartı. */
export function buildTeaserAss({ words, hook = "", slams = [], figures = [], hookFor = null, voiceEnd, total, endCard = "FULL DOCUMENTARY ON THE CHANNEL" }) {
  const lines = buildShortAss({ cues: [], start: 0, end: total, hook: "", endCard: "" }).split("\n").filter((l) => !l.startsWith("Dialogue:"));
  const ev = [];
  // Açılış: anlatıcının üç kelimesi ("ships", "hill", "night") tam söylendiği anda ortaya çakılır,
  // her biri kendi görüntüsünün üstünde; açılış bitince kanca üstte etiket olarak kalır.
  slams.forEach((m) => ev.push(`Dialogue: 3,${assTime(m.s)},${assTime(m.e)},Slam,,0,0,0,,{\\fscx150\\fscy150\\t(0,90,\\fscx100\\fscy100)\\fad(0,80)}${assText(m.text)}`));
  const openEnd = slams.length ? slams.at(-1).e : 0;
  // hookFor: the label stays only that long after the opening (a picture Short is not covered by it all along).
  const hookEnd = hookFor != null ? Math.min(voiceEnd + 0.2, openEnd + hookFor) : voiceEnd + 0.2;
  if (hook) ev.push(`Dialogue: 1,${assTime(openEnd)},${assTime(hookEnd)},Hook,,0,0,0,,{\\fscx125\\fscy125\\t(0,160,\\fscx100\\fscy100)\\fad(0,250)}${assText(hook.toUpperCase())}`);
  // A striking number lands big on the picture when it is said ("4,773"), never as a dark card.
  figures.forEach((m) => ev.push(`Dialogue: 3,${assTime(m.s)},${assTime(m.e)},Slam,,0,0,0,,{\\an5\\pos(${W / 2},760)\\fscx160\\fscy160\\t(0,110,\\fscx100\\fscy100)\\fad(0,150)}${assText(m.text)}`));
  // Açılışta alt yazı yok: çakılan kelime zaten ekranda (aynı sözü iki kez yazmak yankı olur).
  let i = words.findIndex((w) => w.s >= openEnd - 0.05);
  if (i < 0) i = words.length;
  while (i < words.length) {
    const n = words[i].w.length > 8 || words.length - i <= 2 ? Math.min(2, words.length - i) : 3;
    const chunk = words.slice(i, i + n);
    const s = chunk[0].s;
    const e = i + n < words.length ? Math.min(words[i + n].s, chunk.at(-1).e + 0.6) : chunk.at(-1).e + 0.3;
    const txt = chunk
      .map((c, k) => {
        const w = assText(c.w.toUpperCase());
        return isKeyWord(c.w, (k ? chunk[k - 1] : words[i - 1])?.w) ? `{\\c&H00D4FF&}${w}{\\c&HFFFFFF&}` : w;
      })
      .join(" ");
    ev.push(`Dialogue: 0,${assTime(s)},${assTime(Math.max(e, s + 0.12))},Cap,,0,0,0,,{\\fscx116\\fscy116\\t(0,80,\\fscx100\\fscy100)}${txt}`);
    i += n;
  }
  ev.push(`Dialogue: 2,${assTime(voiceEnd + 0.3)},${assTime(total)},End,,0,0,0,,{\\fscx125\\fscy125\\t(0,160,\\fscx100\\fscy100)}${assText(endCard)}`);
  return [...lines.filter(Boolean), ...ev, ""].join("\n");
}

/**
 * Montaj: her parça uzun videonun bir anı (sessiz, yavaş yakınlaşma/uzaklaşma), sonda kapak kartı;
 * dikey düzen + altyazı + açılışta beyaz flaş. Ses: yeni anlatım + videonun müziği (alçak) +
 * kesmelerde whoosh, kancada ve son kartta vuruş; -14 LUFS.
 */
export function renderTeaser({ video, segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx = {}, slamAt = [], ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts" }) {
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
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
  parts.push(`[${n}:v]fps=30,setsar=1,split[ea][eb]`, `[ea]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=24,eq=brightness=-0.25[eg]`, `[eb]scale=1500:-2[et]`, `[eg][et]overlay=(W-w)/2:(H-h)/2,setpts=PTS-STARTPTS[endc]`);
  parts.push(`${segments.map((_, i) => `[s${i}]`).join("")}[endc]concat=n=${n + 1}:v=1:a=0[cat]`);
  const fg = 1.0; // tam genişlik: uzun videonun yatay karesi dikeyde kırpılmaz
  const fgW = Math.round((W * fg) / 2) * 2;
  const fgH = Math.round((fgW * 9) / 16 / 2) * 2;
  parts.push(`[cat]split[a][b]`, `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28,eq=brightness=-0.2:saturation=0.8[bg]`, `[b]scale=${fgW}:${fgH},crop=${W}:${fgH}[fgv]`);
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
  args.push("-filter_complex", parts.join(";"), "-map", "[v]", "-map", "[aout]", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", out);
  const r = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Teaser render başarısız: ${String(r.stderr || r.error?.message || "").slice(-500)}`);
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
  const r = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", t0.toFixed(2), "-t", (anchor - t0 + after).toFixed(2), "-i", video, "-an", "-vf", `fps=${fps},scale=32:18,format=gray`, "-f", "rawvideo", "-"], { maxBuffer: 64 * 1024 * 1024 });
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

function propsScenes(jobDir) {
  try {
    const dir = path.join(jobDir, "docu");
    const props = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".props.json"))), "utf8"));
    return props.script?.scenes || [];
  } catch {
    return [];
  }
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
  const r = spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" });
  const m = String(r.stderr || "").match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
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

/** Teaser in picture mode (docu-shorts-pictures.js): every sentence its own full-screen vertical picture. */
export async function makePictureTeaser({ jobDir, job = {}, settings = {}, usage = null, logFn = () => {}, llm, visionLlm, ffmpeg, title: titleIn, speak = speakTeaser, newPicture = newVerticalPicture } = {}) {
  const last = latestOutput(jobDir);
  if (!last?.v || !fs.existsSync(last.s)) throw new Error("bitmiş video/altyazı bulunamadı");
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  const cues = parseSrt(fs.readFileSync(last.s, "utf8"));
  const title = titleIn || job.meta?.title || job.topic || "";
  const dir = path.join(jobDir, "shorts");
  fs.mkdirSync(dir, { recursive: true });
  const assets = pictureAssets(jobDir);
  if (assets.length < 10) throw new Error(`arşivde yeterli görsel yok (${assets.length})`);
  const catalog = await describePictures({ assets, cacheFile: path.join(dir, "pictures.json"), ffmpeg: ff, ...(visionLlm ? { llm: visionLlm } : {}), settings, usage, logFn });
  if (catalog.filter((a) => !a.textHeavy).length < 8) throw new Error("kullanılabilir görsel az");
  logFn("Shorts: teaser metni ve görselleri planlanıyor...");
  const plan = await planPictureTeaser({ cues, title, catalog, ...(llm ? { llm } : {}), settings, usage, logFn });
  const text = plan.beats.map((b) => b.say).join(" ");
  logFn(`Shorts: seslendiriliyor (${text.length} karakter)...`);
  const voiceId = job.elevenVoiceId || settings.docuEnVoiceId || "nPczCjzI2devNBz1zQrb";
  const tts = await speak({ text, voiceId, key: settings.elevenKey, model: settings.docuShortsVoiceModel || "eleven_v3" });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const voiceFile = path.join(dir, `short-${stamp}.voice.mp3`);
  fs.writeFileSync(voiceFile, tts.audio);
  fs.writeFileSync(path.join(dir, `short-${stamp}.words.json`), JSON.stringify(tts.words), "utf8");

  // Pictures: the planned archive picture, a new vertical one where the archive has nothing, else the best unused.
  const used = new Set(plan.beats.filter((b) => b.asset).map((b) => b.asset.rel));
  const spare = catalog.filter((a) => !a.textHeavy && !used.has(a.rel)).sort((a, b) => b.quality - a.quality);
  for (const b of plan.beats) {
    if (b.asset) continue;
    if (b.newPrompt && settings.openaiKey) {
      try {
        logFn(`Shorts: yeni dikey görsel üretiliyor — ${b.newPrompt.slice(0, 70)}`);
        const abs = await newPicture({ prompt: b.newPrompt, dir: path.join(dir, "new"), settings, style: job.docuGenre === "epic" ? "Era-accurate historical scene." : "" });
        b.asset = { abs, kind: "still", srcW: 864, srcH: 1536, box: { x: 0.2, y: 0.15, w: 0.6, h: 0.6 }, what: b.newPrompt, generated: true };
        continue;
      } catch (e) {
        logFn(`Shorts: yeni görsel üretilemedi (${String(e?.message || e).slice(0, 100)})`);
      }
    }
    b.asset = spare.shift();
  }
  plan.beats.forEach((b, k) => {
    if (!b.asset) b.asset = plan.beats[k - 1]?.asset ?? catalog[0];
    const a = b.asset;
    if (!a.srcW || !a.srcH) {
      const z = sizeOf(ff, a.abs);
      if (z) Object.assign(a, { srcW: z.w, srcH: z.h });
    }
  });

  const words = tts.words;
  const starts = beatStarts(plan.beats, words);
  const voiceEnd = words.at(-1).e;
  const segments = plan.beats.map((b, k) => {
    const s = k === 0 ? 0 : starts[k];
    const e = k + 1 < plan.beats.length ? starts[k + 1] : voiceEnd + 0.45;
    const a = b.asset;
    const dur = Math.max(0.6, e - s);
    // Footage too short for its sentence holds its still frame instead.
    const clipOk = a.kind === "clip" && a.clipDur - 0.5 >= dur;
    return { abs: clipOk || a.kind !== "clip" ? a.abs : a.still || a.abs, kind: clipOk ? "clip" : "still", clipStart: (a.clipStart || 0) + 0.5, srcW: a.srcW, srcH: a.srcH, box: a.box || { x: 0, y: 0, w: 1, h: 1 }, dur, beat: k, what: a.what, rel: a.rel, generated: !!a.generated };
  });
  const total = +(voiceEnd + 0.45 + 2.6).toFixed(2);
  const slams = slamTimes(plan.beats, words);
  // Figures: on the first spoken word of the number, held ~1.8 s (never into the next sentence).
  const figures = [];
  let off = 0;
  plan.beats.forEach((b, k) => {
    const from = off;
    off += b.say.length + 1;
    if (!b.figure) return;
    const bare = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const said = words.find((w) => w.at >= from && w.at < off && bare(w.w) === bare(b.figureWord)) ?? words.find((w) => w.at >= from && /\d/.test(w.w));
    if (!said) return;
    const end = k + 1 < plan.beats.length ? starts[k + 1] : voiceEnd;
    figures.push({ text: b.figure.toUpperCase(), s: said.s, e: Math.min(end - 0.05, said.s + 1.8) });
  });
  const assFile = path.join(dir, `short-${stamp}.ass`);
  fs.writeFileSync(assFile, buildTeaserAss({ words, hook: plan.hook, slams, figures, hookFor: 3.5, voiceEnd: voiceEnd + 0.45, total }), "utf8");

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
  logFn(`Shorts: ${segments.length} dikey görsel, ${total.toFixed(1)} sn render ediliyor...`);
  renderPictureTeaser({ segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx, slamAt: slams.map((m) => m.s), ffmpeg: ff });
  const meta = { file: out, mode: "pictures", hook: plan.hook, slams, figures, title: plan.title, description: plan.description, narration: text, beats: plan.beats.map((b) => ({ say: b.say, slam: b.slam, figure: b.figure, picture: b.asset?.rel || (b.asset?.generated ? "new" : null), what: b.asset?.what })), segments, start: 0, end: total, source: last.v };
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
  const tts = await speak({ text, voiceId, key: settings.elevenKey, model: settings.docuShortsVoiceModel || "eleven_v3" });
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
  fs.writeFileSync(assFile, buildTeaserAss({ words: tts.words, hook: plan.hook, slams, voiceEnd: voiceEnd + 0.45, total }), "utf8");
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
  const meta = { file: out, mode: "teaser", hook: plan.hook, slams, title: plan.title, description: plan.description, narration: text, beats: plan.beats, segments, start: 0, end: total, source: last.v };
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
  const meta = { file: out, start: pick.start, end: pick.end, hook: pick.hook, title: pick.title, description: pick.description, why: pick.why, mode: pick.mode, source: video };
  fs.writeFileSync(path.join(dir, `short-${stamp}.json`), JSON.stringify(meta, null, 2), "utf8");
  logFn(`Shorts hazır: ${out}`);
  return meta;
}

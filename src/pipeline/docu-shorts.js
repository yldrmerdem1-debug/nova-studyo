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
    // Açılış patlaması: ortada büyük sarı etiket kelimeler (ilk videoların imza kancası).
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
    hook: { type: "string", description: "On-screen hook label at the top, 2-5 words, ALL CAPS" },
    slams: { type: "array", items: { type: "string" }, description: "Exactly 3 single punchy words (ALL CAPS, from the story) slammed one by one in the first 1.5 seconds, like a movie trailer: e.g. CRASH / GREED / WAR" },
    beats: {
      type: "array",
      description: "5-8 narration beats in order; their 'say' lines together are the whole Short's narration",
      items: {
        type: "object",
        properties: {
          say: { type: "string", description: "One spoken English sentence (or two short ones) for this beat" },
          line: { type: "integer", description: "Index of the transcript line whose MOMENT of the long video is shown first under this beat (the picture must match what is said)" },
          more: { type: "array", items: { type: "integer" }, description: "1-2 more transcript line indices whose moments are cut in under the same beat (fast cutting: a new picture every 1.5-3 s)" },
        },
        required: ["say", "line", "more"],
        additionalProperties: false,
      },
    },
    title: { type: "string", description: "YouTube Shorts title, max 70 chars, no hashtags" },
    description: { type: "string", description: "2-3 sentences that send viewers to the full documentary" },
  },
  required: ["hook", "slams", "beats", "title", "description"],
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
      "- beat 1 is the hook: the single most shocking fact or a question the viewer cannot leave unanswered — within the first 2 seconds",
      "- then 3-5 of the documentary's most striking, concrete moments (numbers, names, reversals), fast, each one raising the stakes",
      "- never give away the ending or the answer; tease it",
      "- last beat: a short call to the full documentary on the channel (e.g. 'The full story is on the channel.')",
      "- plain spoken English, short sentences, no hashtags, no emojis, no stage directions",
      "- {screen: ...} tells what the long video shows at that line; a beat that names a person, a place, a number or a headline must use moments whose screen shows exactly that (never another person's portrait)",
      "- for each beat pick the transcript line whose moment in the long video best SHOWS what the beat says, plus 1-2 more moments (\"more\") that also fit it — the Short cuts to a new picture every 1.5-3 seconds; prefer moments with a striking picture (a face, a number on screen, a headline, a crowd)",
      "- beats use different, far-apart parts of the video; never two beats on neighbouring lines",
    ].join("\n"),
    schema: TEASER_SCHEMA,
    model: settings.docuShortsModel || "claude-sonnet-5-5",
    maxTokens: 2500,
    usage,
    logFn,
  });
  const beats = (res?.beats || [])
    .map((b) => {
      const clampL = (x) => Math.max(0, Math.min(cues.length - 1, Number(x) || 0));
      return { say: String(b.say || "").replace(/\s+/g, " ").trim(), line: clampL(b.line), more: (Array.isArray(b.more) ? b.more : []).slice(0, 3).map(clampL) };
    })
    .filter((b) => b.say);
  if (beats.length < 3) throw new Error("teaser planı eksik");
  const slams = (Array.isArray(res.slams) ? res.slams : []).map((w) => String(w || "").replace(/[^\p{L}\p{N}$%'-]/gu, "").toUpperCase()).filter(Boolean).slice(0, 3);
  return { hook: String(res.hook || "").trim(), slams, beats, title: String(res.title || "").trim(), description: String(res.description || "").trim() };
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
export function buildTeaserAss({ words, hook = "", slams = [], voiceEnd, total, endCard = "FULL DOCUMENTARY ON THE CHANNEL" }) {
  const lines = buildShortAss({ cues: [], start: 0, end: total, hook: "", endCard: "" }).split("\n").filter((l) => !l.startsWith("Dialogue:"));
  const ev = [];
  // Açılış: 3 kelime sırayla ortaya çakılır (0,5 sn arayla), sonra kanca üstte kalır.
  const slamEnd = slams.length ? slams.length * 0.5 : 0;
  slams.forEach((w, k) => ev.push(`Dialogue: 3,${assTime(k * 0.5)},${assTime(k * 0.5 + 0.5)},Slam,,0,0,0,,{\\fscx150\\fscy150\\t(0,90,\\fscx100\\fscy100)}${assText(w)}`));
  if (hook) ev.push(`Dialogue: 1,${assTime(slamEnd)},${assTime(voiceEnd + 0.2)},Hook,,0,0,0,,{\\fscx135\\fscy135\\t(0,180,\\fscx100\\fscy100)}${assText(hook.toUpperCase())}`);
  for (let i = 0; i < words.length; ) {
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
export function renderTeaser({ video, segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx = {}, ffmpeg = "ffmpeg", fontsDir = "C:/Windows/Fonts" }) {
  const esc = (p) => String(p).replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  segments.forEach((g) => args.push("-ss", g.src.toFixed(2), "-t", (g.dur + 0.05).toFixed(2), "-i", video));
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
    return `[${i}:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=30,setsar=1,zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=30,trim=0:${g.dur.toFixed(3)},setpts=PTS-STARTPTS[s${i}]`;
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
  const whooshAt = cuts.slice(0, -1).map((c) => Math.max(0, c - 0.28));
  const hitAt = [0, cuts.at(-1)];
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

export const TEASER_SHOT_MAX = 2.6;

/**
 * Cümle aralıkları (kelime zamanlarından) -> montaj parçaları. Her cümle, seçilen anlarıyla
 * (line + more; eksikse yakındaki altyazı satırları) 1,5-2,6 sn'lik parçalara bölünür.
 */
export function teaserSegments({ beats, words, cues, videoDur, tail = 0.45, shotMax = TEASER_SHOT_MAX }) {
  let off = 0;
  const starts = beats.map((b) => {
    const at = off;
    off += b.say.length + 1;
    return at;
  });
  const beatStart = starts.map((at) => (words.find((w) => w.at >= at) ?? words.at(-1)).s);
  const voiceEnd = words.at(-1).e;
  const out = [];
  beats.forEach((b, k) => {
    const s = k === 0 ? 0 : beatStart[k];
    const e = k + 1 < beats.length ? beatStart[k + 1] : voiceEnd + tail;
    const D = Math.max(0.8, e - s);
    const n = Math.max(1, Math.min(4, Math.ceil(D / shotMax)));
    const moments = [b.line, ...(b.more || [])];
    for (let j = 1; moments.length < n; j++) moments.push(Math.min(cues.length - 1, b.line + 2 * j));
    for (let i = 0; i < n; i++) {
      const dur = D / n;
      const c = cues[moments[i]];
      const src = Math.max(0, Math.min(c.s + 0.2, Math.max(0, videoDur - dur - 0.1)));
      out.push({ src, dur, beat: k });
    }
  });
  return out;
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
      const what = short(sc.caption || sc.search || sc.imagePrompt, 70);
      return [who, what].filter(Boolean).join(" — ") || sc.type || "";
    }
  }
}
export function screensFor(jobDir, cues) {
  try {
    const dir = path.join(jobDir, "docu");
    const props = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".props.json"))), "utf8"));
    const scenes = props.script?.scenes || [];
    const norm = (x) => String(x || "").toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    const says = scenes.map((s) => norm(s.say));
    let from = 0;
    return cues.map((c) => {
      const key = norm(c.t).split(" ").slice(0, 5).join(" ");
      if (!key) return "";
      let i = says.findIndex((t, k) => k >= from && t.includes(key));
      if (i < 0) i = says.findIndex((t) => t.includes(key));
      if (i < 0) return "";
      from = i;
      return screenOf(scenes[i]);
    });
  } catch {
    return [];
  }
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
    try {
      return await makeDocuTeaser({ ...opts, job });
    } catch (e) {
      logFn(`Shorts: teaser yapılamadı (${String(e?.message || e).slice(0, 160)}), kesit Shorts'a dönülüyor`);
    }
  }
  return makeDocuCut(opts);
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
  const plan = await planTeaser({ cues, title, screens: screensFor(jobDir, cues), llm, settings, usage, logFn });
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
  const segments = teaserSegments({ beats: plan.beats, words: tts.words, cues, videoDur });
  const voiceEnd = tts.words.at(-1).e;
  const total = +(voiceEnd + 0.45 + 2.6).toFixed(2);
  const assFile = path.join(dir, `short-${stamp}.ass`);
  fs.writeFileSync(assFile, buildTeaserAss({ words: tts.words, hook: plan.hook, slams: plan.slams, voiceEnd: voiceEnd + 0.45, total }), "utf8");
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
  renderTeaser({ video: last.v, segments, voiceFile, musicFile, thumbFile, assFile, out, total, sfx, ffmpeg: ff });
  const meta = { file: out, mode: "teaser", hook: plan.hook, title: plan.title, description: plan.description, narration: text, beats: plan.beats, segments, start: 0, end: total, source: last.v };
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

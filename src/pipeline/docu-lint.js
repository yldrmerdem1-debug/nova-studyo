// SENARYO DENETİMİ — kodla, ücretsiz; seslendirmeden ÖNCE (son okumaya bulgu olarak gider).
//
// 20 Ekim 2026. Kaynaklar: derin inceleme (39 tutmuş video satır satır, RAPOR.md §9) ve kendi Fransa videomuz.
//   leak   — seslendirmeye yapım notu sızmış: Frontline Echoes "The human cost line belongs here", Inside Decoded
//            "It should not be illustrated as…". İzleyici yazarın talimatını dinliyor.
//   unit   — birim dönüşümü yanlış: Weird History 536 "°C → 34.8 °F" hatası yorumlarda zirve yaptı ama güveni yaktı.
//   count  — söylenen sayı alıntıyla tutmuyor: Fransa videomuz "said four words: we lost control" (üç kelime).
//   callback — kapanış açılışa dönmüyor: 536'nın "ders" kuyruğunda izleyici %1'e indi; tutmuşların çoğu son cümlede
//            açılıştaki imgeye/soruya dönüyor.
//   title  — başlığın iddiası videoda ödenmiyor: Built Beyond "…Scam" — videoda dolandırıcılık yok.
//   template — kurallardaki örnek cümle senaryoya birebir girmiş (22 Ekim 2026 denetimi: 132 örnek, "First, the basics",
//            "Here's where it gets uncomfortable").
//   unsupported / quote / absolute / relative-time — anlatımdaki iddia araştırmayla tutmuyor (Fransa: "at 5:53", "the
//            only death officially on record", "Saturday is four days away").
import { numbersIn } from "./docu-edit-director.js";
import { hookGrowthLines, voiceGrowthLines, honestyLines, spineLines, middleGrowthLines, editGrowthLines } from "./growth-lessons.js";
import { PUNCHES } from "./docu-rhetoric.js";

const strip = (t) => String(t || "").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
const wordsOf = (t) => strip(t).toLowerCase().match(/[\p{L}\p{N}'’]+/gu) || [];

/* ---------------------------------------------------------------- template */
// Bridges that carry no information and that our own rules once handed out as examples.
// 22 Ekim 2026 araştırması (Film Booth, MrBeast notu, Videomaker, UT "throat-clearing"): önsöz ve görüntüyü anlatan kalıplar.
const FILLER_BRIDGES = ["here's where it gets uncomfortable", "but here's the thing", "here's what's actually going on", "and that is the problem", "first, the basics", "first, a quick orientation", "as i record this", "let's dive in", "let's dive into", "it's important to note", "it is important to note", "now let's look at", "here you can see", "as you can see here", "without further ado", "in this video we'll", "in this video i'll", "to wrap up", "to sum up", "in conclusion"];

/* ---------------------------------------------------------------- source & ear */
// Atıf önde ve isimli (The News Manual: dinleyici önce kimin konuştuğunu bilmeli); isimsiz "critics/experts say" yok.
const VAGUE_SOURCE = /\b(rights groups|critics|experts|observers|analysts|some (?:people|say|argue)|others (?:point|say|argue)|many (?:people )?(?:say|believe)|reports (?:say|suggest)|sources say)\b/i;
/** Lines that hang a claim on an unnamed source. → [{scene, say, match}] */
export function vagueSources(scenes = []) {
  const out = [];
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    const m = t.match(VAGUE_SOURCE);
    // A named group in the same line ("Amnesty and other rights groups") is fine.
    if (m && !/\b(Amnesty|Human Rights Watch|HRW|Reuters|AP|BBC|CNN|AFP|UN|WHO|[A-Z][a-z]+ (?:Institute|Foundation|Council|League|Ministry|University))\b/.test(t)) out.push({ scene: i, say: t, match: m[0] });
  });
  return out;
}
/** Written-for-the-eye punctuation the voice cannot say: semicolons, parentheses, "respectively", "the former/latter". */
export function earErrors(scenes = []) {
  const out = [];
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    const m = t.match(/;|\([^)]*\)|\brespectively\b|\bthe (?:former|latter)\b/i);
    if (m) out.push({ scene: i, say: t, match: m[0] });
  });
  return out;
}
const norm = (t) => strip(t).toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const SHINGLE = 6;
let ruleShingles = null;
/** 6-word windows of every rule text the writer reads (examples included). */
function rulesShingleSet() {
  if (ruleShingles) return ruleShingles;
  const texts = [
    ...hookGrowthLines({ news: true }), ...hookGrowthLines({ news: false }),
    ...["story", "news", "host"].flatMap((style) => voiceGrowthLines({ style })),
    ...honestyLines({ news: true }), ...spineLines({ news: true, story: true, last: true }), ...middleGrowthLines(),
    // endGrowthLines left out: its signposts ('back to the question we started with') are meant to be said.
    ...editGrowthLines({ maps: true }),
    ...PUNCHES.map((p) => p.example),
  ];
  ruleShingles = new Set();
  for (const t of texts) {
    const w = norm(t).split(" ");
    for (let i = 0; i + SHINGLE <= w.length; i++) ruleShingles.add(w.slice(i, i + SHINGLE).join(" "));
  }
  return ruleShingles;
}
/** Narration lines that copy a rule's example sentence (or a filler bridge). → [{scene, say, match}] */
export function templateCopies(scenes = []) {
  const set = rulesShingleSet();
  const out = [];
  scenes.forEach((s, i) => {
    const t = norm(s?.say);
    if (!t) return;
    const bridge = FILLER_BRIDGES.find((b) => t.includes(norm(b)));
    if (bridge) { out.push({ scene: i, say: strip(s.say), match: bridge }); return; }
    const w = t.split(" ");
    for (let k = 0; k + SHINGLE <= w.length; k++) {
      const g = w.slice(k, k + SHINGLE).join(" ");
      if (set.has(g)) { out.push({ scene: i, say: strip(s.say), match: g }); return; }
    }
  });
  return out;
}

/* ---------------------------------------------------------------- claims */
// Both "550,000" (English) and "550.000" / "4,5" (Turkish research files) are read as the same numbers.
const numsOf = (t) => (String(t || "").match(/\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/g) || []).map((x) => {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(x)) return Number(x.replace(/[.,]/g, ""));
  return Number(x.replace(",", "."));
}).filter(Number.isFinite);
/** Every number in a text, English or Turkish separators ("550,000" = "550.000"). */
export const numbersInText = (t) => numsOf(t);
/** Claims in the narration the research does not carry. → [{scene, kind, detail}] */
export function claimErrors(scenes = [], research = "") {
  const R = String(research || "");
  if (!R.trim()) return [];
  const rNums = new Set(numsOf(R));
  const rNorm = ` ${norm(R)} `;
  const rWords = new Set(rNorm.split(" "));
  const hasNum = (v) => rNums.has(v) || [...rNums].some((k) => k && Math.abs(k - v) / Math.abs(k) < 0.01);
  const out = [];
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    if (!t) return;
    // A clock time must be the research's own (as written, or the same hour on the 12/24-hour clock).
    for (const m of t.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
      const h = Number(m[1]), min = m[2];
      const forms = [`${h}:${min}`, `${String(h).padStart(2, "0")}:${min}`, `${h + 12}:${min}`, `${h > 12 ? h - 12 : h}:${min}`];
      if (!forms.some((f) => R.includes(f))) out.push({ scene: i, kind: "unsupported", detail: `saat "${m[0]}" araştırmada yok — saati çıkar ya da araştırmadaki saatle yaz` });
      else if (!R.includes(m[0]) && !R.includes(`${String(h).padStart(2, "0")}:${min}`)) out.push({ scene: i, kind: "unsupported", detail: `saat "${m[0]}" araştırmada başka biçimde (12/24 saat ya da saat dilimi belirsiz) — saati çıkar ya da "in the evening" de` });
    }
    // Digits (not years, not small counts) the research never mentions.
    const bad = numsOf(t.replace(/\b\d{1,2}:\d{2}\b/g, " ")).filter((v) => v >= 10 && !(Number.isInteger(v) && v >= 1500 && v <= 2100) && !hasNum(v));
    if (bad.length) out.push({ scene: i, kind: "unsupported", detail: `sayı araştırmada yok: ${bad.slice(0, 3).join(", ")} — araştırmadaki değerle düzelt ya da sayıyı çıkar` });
    // A quote must be in the research (word for word, or at least every content word of it).
    const q = (t.match(/["“]([^"”]{8,200})["”]/) || t.match(/\b(?:said|says|wrote|told [^:]{1,30}):\s*([^.?!]{8,200})/i) || [])[1];
    if (q) {
      const nq = norm(q);
      const content = nq.split(" ").filter((w) => w.length > 3);
      if (!rNorm.includes(` ${nq} `) && !(content.length && content.every((w) => rWords.has(w)))) out.push({ scene: i, kind: "quote", detail: `alıntı araştırmada yok: "${q.slice(0, 60)}" — araştırmadaki sözle değiştir ya da alıntıyı kaldırıp aktararak söyle` });
    }
    const abs = t.match(/\b(the only (?!way|thing|question|real|one\b|time\b|reason\b)[a-z]+|only one [a-z]+|for the first time|never before|no other [a-z]+)\b/i);
    if (abs && !rNorm.includes(` ${norm(abs[0])} `)) out.push({ scene: i, kind: "absolute", detail: `kesin iddia "${abs[0]}" araştırmada böyle geçmiyor — araştırma açıkça söylemiyorsa yumuşat ('the only death confirmed so far by Paris police')` });
    const rel = t.match(/\b([a-z]+ days? (?:away|from now)|tomorrow|tonight|last night|yesterday)\b/i);
    if (rel) out.push({ scene: i, kind: "relative-time", detail: `"${rel[0]}" yayından sonra yanlış olur (video haftalarca izlenir) — mutlak gün/tarihle yaz ('on Saturday, October 24th')` });
  });
  return out;
}

/* ---------------------------------------------------------------- leak */
const LEAK = [
  /\bline (?:belongs|goes) here\b/i,
  /\bbelongs (?:here|in this (?:section|chapter|scene))\b/i,
  /\b(?:should|must) not be (?:illustrated|shown|depicted|visuali[sz]ed|pictured)\b/i,
  /\b(?:illustrate|visuali[sz]e|show) (?:this|it|that) (?:with|as|using) (?:a |an |the )?(?:map|graphic|chart|stock|archive|clip|photo)/i,
  /\bb-?roll\b/i,
  /\bcut to (?:black|the map|a map|archive|footage|the graphic|a graphic)\b/i,
  /\b(?:lower[- ]third|title card|chapter card|on-?screen text)\b/i,
  /\b(?:narrator|voice-?over|VO|SFX|music cue|transition)\s*:/i,
  /\b(?:scene|beat) \d+\s*[:\-—]/i,
  /\b(?:insert|add) (?:a |an |the )?(?:map|graphic|chart|clip|counter|caption) here\b/i,
];
/** Narration lines that read a production note aloud. → [{scene, say, match}] */
export function instructionLeaks(scenes = []) {
  const out = [];
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    if (!t) return;
    const re = LEAK.find((r) => r.test(t));
    if (re) out.push({ scene: i, say: t, match: t.match(re)[0] });
  });
  return out;
}
/**
 * Deterministic fallback after the editor: the sentence carrying the note is cut out of the line; a line that is
 * nothing but the note is emptied (the caller drops it). → how many lines changed.
 */
export function stripLeakSentences(scenes = []) {
  let n = 0;
  for (const s of scenes) {
    const t = String(s?.say || "");
    if (!LEAK.some((r) => r.test(strip(t)))) continue;
    const parts = t.match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g) || [t];
    const kept = parts.filter((p) => !LEAK.some((r) => r.test(strip(p))));
    s.say = kept.join("").replace(/\s+/g, " ").trim();
    n++;
  }
  return n;
}

/* ---------------------------------------------------------------- unit */
// [unit A regex, unit B regex, A→B], both directions are checked.
const UNITS = [
  { name: "°C→°F", a: /(?:°\s?C\b|degrees? (?:Celsius|centigrade)\b)/i, b: /(?:°\s?F\b|degrees? Fahrenheit\b|Fahrenheit\b)/i, f: (c) => (c * 9) / 5 + 32, abs: 2, rel: 0.03 },
  { name: "km→mi", a: /\b(?:km|kilomet(?:er|re)s?)\b/i, b: /\b(?:mi|miles?)\b/i, f: (x) => x * 0.621371, abs: 0.6, rel: 0.07 },
  { name: "kg→lb", a: /\b(?:kg|kilo(?:gram)?s?)\b/i, b: /\b(?:lbs?|pounds?)\b/i, f: (x) => x * 2.20462, abs: 0.6, rel: 0.07 },
  { name: "m→ft", a: /\b(?:met(?:er|re)s?)\b/i, b: /\b(?:feet|foot|ft)\b/i, f: (x) => x * 3.28084, abs: 0.6, rel: 0.07 },
  { name: "l→gal", a: /\b(?:lit(?:er|re)s?)\b/i, b: /\b(?:gallons?)\b/i, f: (x) => x * 0.264172, abs: 0.3, rel: 0.08 },
];
// The second quantity is a conversion of the first only when it is joined like one: "(", ", or about", "— roughly".
const JOIN = /^[\s,]*(?:\(|or\b|—|–|-|which is\b|that's\b|about\b|around\b|roughly\b|nearly\b|almost\b|some\b)[\s\w,]{0,14}$/i;
const NUM_CHUNK = String.raw`((?:-?\d[\d,.]*|(?:minus |negative )?(?:[a-z]+[\s-]){0,5}[a-z]+)\s*(?:thousand|million|billion)?)\s*`;
const valuesIn = (chunk) => {
  const t = String(chunk || "").replace(/\bminus\b|\bnegative\b/gi, "-");
  const neg = /^\s*-/.test(t);
  const v = numbersIn(t.replace(/^\s*-\s*/, ""), "en").filter(Number.isFinite);
  return neg ? v.map((x) => -x) : v;
};
const close = (want, got, u) => Math.abs(want - got) <= Math.max(u.abs, Math.abs(want) * u.rel);

/** "40 °C (104 °F)" pairs that do not convert. → [{scene, say, kind, said, expected}] */
export function unitErrors(scenes = []) {
  const out = [];
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    if (!/\d|celsius|fahrenheit|kilomet|mile|kilo|pound|met(?:er|re)|feet|lit(?:er|re)|gallon/i.test(t)) return;
    for (const u of UNITS) {
      for (const [x, y, conv] of [[u.a, u.b, u.f], [u.b, u.a, (v) => brute(u.f, v)]]) {
        const re = new RegExp(NUM_CHUNK + x.source + String.raw`([^.;]{0,30}?)` + NUM_CHUNK + y.source, "gi");
        for (const m of t.matchAll(re)) {
          if (!JOIN.test(m[2])) continue;
          let A = valuesIn(m[1]);
          const B = valuesIn(m[3]);
          // "minus 40 °C": the sign sits before the captured number.
          if (/(?:minus|negative|-)\s*$/i.test(t.slice(Math.max(0, m.index - 10), m.index)) && A.every((a) => a >= 0)) A = A.map((a) => -a);
          if (!A.length || !B.length) continue;
          if (A.some((a) => B.some((b) => close(conv(a), b, u)))) continue;
          out.push({ scene: i, say: t, kind: u.name, said: m[0].trim(), expected: Math.round(conv(A.at(-1)) * 10) / 10 });
        }
      }
    }
  });
  return out;
}
// Inverse of a monotonic conversion (B→A), by bisection — keeps one table for both directions.
function brute(f, y) {
  let lo = -1e12, hi = 1e12;
  for (let k = 0; k < 200; k++) { const mid = (lo + hi) / 2; if (f(mid) < y) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/* ---------------------------------------------------------------- count */
const SMALL = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const COUNT = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})[\s-]+words?\b/i;
const quoteAfterColon = (t) => { const k = t.indexOf(":"); return k >= 0 ? t.slice(k + 1) : null; };
const quoted = (t) => (t.match(/["“]([^"”]{2,120})["”]/) || [])[1] || null;
const firstSentence = (t) => (String(t || "").match(/^[^.!?]+/) || [""])[0];
/** "said four words: we lost control" — the stated count against the words actually quoted. */
export function countErrors(scenes = []) {
  const out = [];
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    const m = t.match(COUNT);
    if (!m) return;
    const said = SMALL[m[1].toLowerCase()] ?? Number(m[1]);
    const after = t.slice(m.index + m[0].length);
    let q = quoteAfterColon(after) ?? quoted(after);
    if (q == null) {
      // "an admission, four words long" … next line: "…and said: we lost control."
      const next = strip(scenes[i + 1]?.say);
      q = quoteAfterColon(next) ?? quoted(next);
    }
    if (q == null) return;
    const n = wordsOf(firstSentence(q)).length;
    if (n && n !== said) out.push({ scene: i, say: t, said, word: m[0], actual: n, quote: firstSentence(q).trim() });
  });
  return out;
}

/* ---------------------------------------------------------------- callback */
const STOP = new Set("the a an and or but of to in on at for with from by as is was were are be been this that these those it its it's he she they we you i his her their our your who what when where why how not no so then than there here just only also into over after before about which would could should will can has have had do did does one two three said says".split(" "));
const content = (t) => wordsOf(t).filter((w) => w.length > 3 && !STOP.has(w));
/** Does the ending return to the opening? Shared content words between the first 3 and the last 3 spoken lines. */
export function closingCallback(scenes = []) {
  const spoken = scenes.filter((s) => strip(s?.say));
  if (spoken.length < 8) return { ok: true, shared: [] };
  const open = new Set(spoken.slice(0, 3).flatMap((s) => content(s.say)));
  const shared = [...new Set(spoken.slice(-3).flatMap((s) => content(s.say)).filter((w) => open.has(w)))];
  return { ok: shared.length > 0, shared };
}

/* ---------------------------------------------------------------- title */
// Loaded claim words a title may only carry when the narration pays them off (stem match).
const CLAIMS = ["scam", "fraud", "collapse", "bankrupt", "bankruptcy", "banned", "secret", "cover-up", "coverup", "lie", "lied", "lies", "hoax", "fake", "illegal", "crime", "murder", "murdered", "poison", "poisoned", "conspiracy", "exposed", "leaked", "dead", "dies", "died", "killed", "war", "invasion", "nuclear", "crash", "crashed", "failed", "failure", "disaster", "cursed", "haunted", "forbidden", "censored"];
const stem = (w) => w.toLowerCase().replace(/[’']s$/, "").replace(/ies$/, "y").replace(/(?:ed|es|ing|s)$/, "").replace(/e$/, "");
// "bankruptcy" is paid by "bankrupt", "collapse" by "collapsed": a shared stem of 4+ letters counts.
const paidBy = (c, said) => said.has(c) || (c.length >= 4 && [...said].some((s) => s.length >= 4 && (s.startsWith(c) || c.startsWith(s))));
/** Claim words in a title that the narration never says. → [word] */
export function unpaidTitleWords(title, scenes = []) {
  const said = new Set(scenes.flatMap((s) => wordsOf(s?.say)).map(stem));
  const own = (String(title || "").match(/[\p{L}'’-]+/gu) || []).map((w) => w.toLowerCase());
  return [...new Set(own.filter((w) => CLAIMS.includes(w) && !paidBy(stem(w), said)))];
}

/* ---------------------------------------------------------------- title anchor */
// 26 Ekim 2026, denizaltı videosu (tarih kanalı): önerilen başlık "HMS Vanguard Was 'Probably a Container,' Said France",
// diğerleri "Two Nuclear Submarines Collided in 2009. Neither Heard It", "Why Two Allied Nuclear Subs Couldn't Hear Each
// Other". Kullanıcı: "videonun ne olduğu belli olsun". Kural: her başlık olayın ADIYLA başlar (yılı biliniyorsa başında
// yılı da var), açı iki noktadan sonra gelir; alıntı başlık ve konuyu saklayan gizem açılışı yok.
const TITLE_YEAR = /\b(1\d{3}|20\d{2})\b/;
// Başlıkta tırnak içinde bir söz: "…" ya da boşluktan sonra açılan 'Probably a Container,' (France's gibi iyelik sayılmaz).
const TITLE_QUOTE = /["“”«»„]|(?:^|[\s(—–-])['‘][^'’]{2,}['’](?=$|[\s,.:;!?)])/u;
const NAME_STOP = new Set(["the", "a", "an", "why", "how", "what", "who", "whom", "whose", "when", "where", "which", "inside", "story", "this", "that", "these", "those", "and", "or", "but", "was", "were", "is", "are", "be", "its", "it", "his", "her", "their", "they", "he", "she", "we", "you", "i", "our", "real", "true", "untold", "secret", "last", "first", "just", "really", "actually", "now", "still", "ever", "never", "nobody", "neither", "nothing", "everyone", "everything", "someone", "night", "day", "man", "woman", "men", "people", "did", "does", "do", "can", "could", "would", "will", "not"]);
const LEAD_SKIP = new Set(["the", "a", "an"]);
const nameKey = (w) => String(w).toLowerCase().replace(/['’]s$/, "").replace(/[^\p{L}\p{N}]/gu, "").replace(/(?<=\p{L}{3})s$/u, "");

/**
 * The story's name words and year, from the job topic and the working title (the part before ":" / "?" / "." —
 * "HMS Vanguard and Le Triomphant: The Night…" → hms, vanguard, triomphant). Year = the first year written there or
 * in the era ("2009", "1066"); none for a story without one (news of this week names no year).
 */
export function storyAnchor({ topic = "", title = "", era = "" } = {}) {
  const words = (list) => [...new Set(list.flatMap((h) => String(h || "").match(/\p{Lu}[\p{L}'’.]{1,}/gu) || []).map(nameKey).filter((w) => w.length >= 2 && !NAME_STOP.has(w)))];
  let names = words([title, topic].map((s) => String(s || "").split(/[:?!|]|\.\s|\s[-–—]\s/)[0]));
  // "1066: The 19 Days That Changed England" — the head is only the year; the names come from the rest.
  if (!names.length) names = words([title, topic]);
  const year = [topic, title, era].map((s) => String(s || "").match(TITLE_YEAR)?.[1]).find(Boolean) || null;
  return { names, year };
}

/** What keeps a title from naming its story: quotes, a lead word that is not the story's name, the year missing up front. */
export function titleAnchorErrors(title, anchor) {
  const t = String(title || "").trim();
  const e = [];
  if (TITLE_QUOTE.test(t)) e.push("alıntı başlık olmaz: olayın adını yaz, alıntı açıklamaya kalsın");
  if (!anchor?.names?.length) return e;
  const toks = (t.match(/[\p{L}\p{N}'’.€$£%]+/gu) || []).map(nameKey).filter((w) => w && !LEAD_SKIP.has(w));
  // The year itself may open the title when it is the event's name ("1066: …").
  const yearFirst = !!anchor.year && toks[0] === anchor.year;
  const lead = toks.find((w) => !/^\d+$/.test(w));
  if (!yearFirst && (!lead || !anchor.names.includes(lead))) e.push(`olayın adıyla başlamalı (${anchor.names.slice(0, 6).join(", ")}); açı iki noktadan sonra`);
  if (anchor.year) {
    const head = t.includes(":") ? t.split(":")[0] : t.slice(0, 45);
    if (!head.includes(anchor.year)) e.push(`yıl (${anchor.year}) başlığın başında olmalı`);
  }
  return e;
}

/* ---------------------------------------------------------------- meta */
// 21 Ekim 2026, Fransa videosu izleyici notu: 0:30'da "As I record this… I'll keep three things apart" kancayı frenledi.
const META = /\b(as I record this|as I write this|I'm going to keep|I'll keep (?:three|two|these) things|keep (?:three|two) things (?:apart|separate)|in this video,? (?:I|we)(?:'ll| will)|before we (?:begin|start),? (?:a|one) (?:note|word))\b/i;
const HOOK_WORDS = 150;
/** Process talk ("As I record this…") inside the first ~60 s. → [{scene, say, match}] */
export function metaInHook(scenes = []) {
  const out = [];
  let words = 0;
  scenes.forEach((s, i) => {
    if (words >= HOOK_WORDS) return;
    const t = strip(s?.say);
    const m = t.match(META);
    if (m) out.push({ scene: i, say: t, match: m[0] });
    words += wordsOf(t).length;
  });
  return out;
}

/* ---------------------------------------------------------------- hook (first 30 s) */
// 27 Ekim 2026, kanalların izlenme eğrileri (Studio): kaçış 0:10-0:30 arasında.
//   Panama %85 (0:30): ilk 15 sn'de rakamlı çelişki — "a magnitude 7.4 … more than a hundred people died … A 7.7 … no one".
//   Bakker %65: tarih + karar + "thirty-seven years later, to the day". Hormuz mayınlar %67.
//   France %55: 0:21'de üç maddelik vaat ("…what actually set this off, exactly what the curfews … cover, and which of the
//   numbers … can be trusted"), 0:32'de süreç cümlesi. Hastings %20: "Nineteen days." "October 2026. A queue outside the
//   British Museum…" — hikâye ancak 0:33'te başladı.
// Tek kısa vaat serbest: yazım çizelgesi (growth-lessons) onu ister, tutmuş küçük kanallar da yapar. Liste vaat, ikinci
// vaat ve "stay with me / let's dive in" türü önsöz yasak.
const HOOK_30S = 75; // ~30 s at the channel's ~150 words a minute
const HOOK_15S = 40; // ~15 s
const PROMISE = /\b(by the end(?: of (?:this|the) (?:video|film|story|episode))?|you(?:'ll| will)(?: also| even| finally)? (?:know|learn|see|understand|find out)|here'?s what you(?:'ll| will))\b/i;
const PREAMBLE = /\b(stay (?:with me|tuned)|stick around|let me (?:explain|walk you through)|before we (?:begin|start|dive in|get into)|let'?s (?:dive|get) (?:in|into|started)|without further ado)\b/i;
const sentencesOf = (t) => String(t || "").match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g) || [];

/** A promise that is a list (2+ items after the promise words) or runs past ~22 words. */
export function listPromise(sentence) {
  const t = strip(sentence);
  const m = t.match(PROMISE);
  if (!m) return false;
  const after = t.slice(m.index + m[0].length);
  return wordsOf(t).length > 22 || (after.match(/,/g) || []).length >= 2 || /,\s*(?:and|or)\s+(?:which|what|why|how|who|exactly)\b/i.test(after);
}

/** What the opening rules need to know about the job: news has no modern-detour rule; a story pegged to this year neither. */
export function hookContext({ job = {}, title = "", thisYear = new Date().getFullYear() } = {}) {
  const storyYear = storyAnchor({ topic: job.topic, title }).year;
  const peg = new RegExp(`\\b${thisYear}\\b`).test(`${job.topic || ""} ${title}`);
  return { news: job.docuFormat === "news", storyYear, thisYear, peg };
}

/** The first ~30 s: list or second promise, preamble, no number in ~15 s, a history film opening on today. → [{scene, kind, detail}] */
export function hookErrors(scenes = [], ctx = {}) {
  const out = [];
  const early = [];
  let words = 0, promises = 0, numbered = false, first = -1;
  scenes.forEach((s, i) => {
    const t = strip(s?.say);
    if (!t || words >= HOOK_30S) return;
    if (first < 0) first = i;
    for (const sent of sentencesOf(t)) {
      if (words >= HOOK_30S) break;
      const x = strip(sent);
      if (words < HOOK_15S && (/\d/.test(x) || NUMBER_WORDS.test(x))) numbered = true;
      early.push({ i, sent: x });
      if (PROMISE.test(x)) {
        promises++;
        if (listPromise(x)) out.push({ scene: i, kind: "meta", detail: `ilk 30 sn'de liste vaat: "${x.slice(0, 120)}" — TEK kısa vaat bırak (en çok ~20 kelime, tek madde: 'By the end, you'll know why …'); Fransa'da üç maddelik vaatten sonra izleyicinin %45'i 0:30'da gitmişti` });
        else if (promises > 1) out.push({ scene: i, kind: "meta", detail: `ilk 30 sn'de ikinci vaat: "${x.slice(0, 100)}" — açılışta TEK vaat olur; çıkar ya da olguya çevir` });
      }
      const pre = x.match(PREAMBLE);
      if (pre) out.push({ scene: i, kind: "meta", detail: `ilk 30 sn'de önsöz: "${pre[0]}" — kancayı frenliyor; cümleyi çıkar, hikâyenin olgusuyla devam et` });
      words += wordsOf(x).length;
    }
  });
  if (first >= 0 && !numbered) out.push({ scene: first, kind: "hook-number", detail: `ilk ~15 sn'de tek bir sayı yok — açılış rakamlı bir çelişkiyle açılsın (Panama, 0:30'da %85: "Two months ago, a magnitude 7.4 earthquake shook Colombia. More than a hundred people died. … A 7.7. … no one … has been reported killed"); araştırmadaki en çarpıcı sayıyı ilk iki cümleye al` });
  if (!ctx.news && !ctx.peg && ctx.storyYear && ctx.thisYear && Number(ctx.storyYear) < ctx.thisYear - 1) {
    const now = new RegExp(`\\b(${ctx.thisYear}|today|this week|this month|right now|these days|nowadays)\\b`, "i");
    const hit = early.find((x) => now.test(x.sent));
    if (hit) out.push({ scene: hit.i, kind: "hook-modern", detail: `tarih filmi ilk 30 sn'de bugüne sapıyor: "${hit.sent.slice(0, 110)}" — açılış ${ctx.storyYear}'deki ANLA başlasın, bugün sonra gelir (Hastings "October 2026. A queue outside the British Museum…" ile açıldı; 0:30'da izleyicinin %80'i gitmişti)` });
  }
  return out;
}

/**
 * Deterministic fallback after the editor: a preamble sentence in the first ~30 s and a process sentence in the first
 * ~60 s ("As I record this…") are cut; the one short promise stays. → how many lines changed (an emptied line is dropped by the caller).
 */
export function stripHookPreamble(scenes = []) {
  let n = 0, words = 0;
  for (const s of scenes) {
    const t = String(s?.say || "");
    if (!strip(t)) continue;
    if (words >= HOOK_WORDS) break;
    const at = words;
    words += wordsOf(t).length;
    const parts = sentencesOf(t);
    let w = at;
    const kept = parts.filter((p) => { const x = strip(p); const cut = (w < HOOK_30S && PREAMBLE.test(x)) || (META.test(x) && !PROMISE.test(x)); w += wordsOf(x).length; return !cut; });
    if (kept.length === parts.length) continue;
    s.say = kept.join("").replace(/\s+/g, " ").trim();
    n++;
  }
  return n;
}

/* ---------------------------------------------------------------- thumbnail names */
const CALENDAR = /^(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/;
/**
 * The names a thumbnail may carry, most used first: proper names the narration says mid-sentence at least twice (people,
 * places, events — "Paris", "Harold", "Hormuz") plus the story's year. 27 Ekim 2026: the kapak words that named nothing lost.
 */
export function thumbNames(scenes = [], anchor = null) {
  // A word is a name when the narration capitalises it mid-sentence at least once; then every capitalised use counts.
  const mid = new Set(), count = new Map();
  const sents = (scenes || []).flatMap((s) => strip(s?.say).split(/(?<=[.!?…])\s+/));
  const caps = (w) => /^\p{Lu}[\p{L}\p{N}'’.-]*/u.test(w) && !/^I(?:'|’|$)/.test(w);
  const ok = (k) => k.length >= 2 && !NAME_STOP.has(k) && !CALENDAR.test(k);
  for (const sent of sents) for (const w of sent.split(/\s+/).slice(1)) if (caps(w) && ok(nameKey(w))) mid.add(nameKey(w));
  for (const sent of sents) for (const w of sent.split(/\s+/)) { const k = nameKey(w); if (caps(w) && mid.has(k)) count.set(k, (count.get(k) || 0) + 1); }
  const names = [...count].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return anchor?.year && !names.includes(anchor.year) ? [anchor.year, ...names] : names;
}
/** Does a thumbnail's words (text, number, labels, tag) carry one of those names? */
export function thumbNamesStory(words, names = []) {
  const keys = (String(words || "").match(/[\p{L}\p{N}'’.€$£%]+/gu) || []).map(nameKey);
  return keys.some((k) => names.includes(k));
}

/* ---------------------------------------------------------------- abstract */
// 22 Ekim 2026, Fransa izlenme eğrisi: zirveden sonra 6:50-8:14 arası olgusuz yorum bloğu ("the government's account is
// not the only one", "Others point to anger…", "Rights groups have accused…") — kalan izleyicinin yarısı gitti. Akan
// orta kısım (1:49-6:17, %30'da düz) her satırda bir isim, sayı ya da tarih taşıyordu.
// "one" is left out: "not the only one", "no one" are pronouns, not facts.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|dozen|percent)\b/i;
const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|yesterday|tonight|today)\b/;
/** Does a line carry a fact the eye can hold: a number, a date/day, a name or place, or a quote? */
export function concreteLine(say) {
  const t = strip(say);
  if (!t) return true;
  if (/\d/.test(t) || NUMBER_WORDS.test(t) || MONTHS.test(t) || /["“”]|:\s*\S/.test(t)) return true;
  // A capitalised word that is not the first word of a sentence (and not "I") is a name or a place.
  return t.split(/(?<=[.!?])\s+/).some((sent) => sent.split(/\s+/).slice(1).some((w) => /^[A-ZÀ-Ý][\p{L}'’-]+/u.test(w) && !/^I(?:'|’|$)/.test(w)));
}
export const ABSTRACT_RUN = 5;
/** Runs of ABSTRACT_RUN+ spoken lines in a row with no fact in them. → [{from, to}] */
export function abstractRuns(scenes = [], min = ABSTRACT_RUN) {
  const out = [];
  let start = -1;
  const close = (end) => { if (start >= 0 && end - start >= min) out.push({ from: start, to: end - 1 }); start = -1; };
  scenes.forEach((s, i) => {
    if (!strip(s?.say)) return;
    if (concreteLine(s.say)) close(i);
    else if (start < 0) start = i;
  });
  close(scenes.length);
  return out;
}

/* ---------------------------------------------------------------- all */
/** Everything the editor must fix before the voice is paid. → [{scene, kind, detail}] */
export function scriptLint(scenes = [], { research = "", hook = null } = {}) {
  const out = [];
  if (hook) out.push(...hookErrors(scenes, hook));
  for (const x of templateCopies(scenes).slice(0, 8)) out.push({ scene: x.scene, kind: "template", detail: `talimattaki örnek/köprü cümle birebir girmiş ("${x.match}") — bu hikâyenin olgusuyla yeniden yaz ya da (bilgi taşımıyorsa) drop et` });
  out.push(...claimErrors(scenes, research).slice(0, 12));
  for (const x of vagueSources(scenes).slice(0, 4)) out.push({ scene: x.scene, kind: "vague-source", detail: `isimsiz kaynak ("${x.match}") — araştırmadaki kurumun ADIYLA ve iddiadan ÖNCE söyle ('Amnesty International says…'); araştırmada isim yoksa satırı olguya çevir ya da drop et` });
  for (const x of earErrors(scenes).slice(0, 6)) out.push({ scene: x.scene, kind: "ear", detail: `kulağa yazılmamış ("${x.match}") — noktalı virgül/parantez/'respectively' yok: iki kısa cümleye böl` });
  for (const x of metaInHook(scenes)) out.push({ scene: x.scene, kind: "meta", detail: `ilk dakikada süreç cümlesi: "${x.match}" — kancayı frenliyor; satırı çıkar ya da hikâyenin bir olgusuna çevir (dürüstlük gerekiyorsa ilk bölümden sonra tek kısa cümle)` });
  for (const x of instructionLeaks(scenes)) out.push({ scene: x.scene, kind: "leak", detail: `yapım notu seslendirmede: "${x.match}" — cümleyi çıkar, satır hikâyeyi anlatsın` });
  for (const x of unitErrors(scenes)) out.push({ scene: x.scene, kind: "unit", detail: `birim dönüşümü yanlış (${x.kind}): "${x.said}" — doğrusu ~${x.expected}; düzelt ya da dönüşümü çıkar` });
  for (const x of countErrors(scenes)) out.push({ scene: x.scene, kind: "count", detail: `"${x.word}" deniyor ama alıntı ${x.actual} kelime ("${x.quote}") — sayıyı düzelt ya da çıkar` });
  const cb = closingCallback(scenes);
  if (!cb.ok) {
    const last = scenes.map((s, i) => [s, i]).filter(([s]) => strip(s?.say)).at(-1)?.[1];
    if (last != null) out.push({ scene: last, kind: "callback", detail: "kapanış açılışa dönmüyor: son satır açılıştaki imgeyi, sözü ya da soruyu yeni anlamıyla bir kez daha söylesin (yeni olgu eklemeden)" });
  }
  // The four longest fact-free runs (older scripts carry up to 9; the editor fixes the worst first).
  const runs = abstractRuns(scenes).sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, 4).sort((a, b) => a.from - b.from);
  for (const r of runs) out.push({ scene: r.from, kind: "abstract", detail: `#${r.from}-#${r.to}: ${r.to - r.from + 1} satır üst üste olgusuz yorum (isim, sayı, tarih, yer yok) — izleyici burada gider. Satırlardan en az birini araştırmadaki SOMUT bir olguyla yeniden yaz (kim, ne, kaç, nerede) ya da fazlasını drop et` });
  return out;
}

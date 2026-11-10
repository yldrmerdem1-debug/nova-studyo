// SÜRE TAVANI GERÇEK (Fransa borcu 20261024-48ae2d — 25 Ekim 2026 denetimi).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 20261024-48ae2d): job.json "Target 11-13 minutes", plan 1798 kelime (12 dk + %7);
//   senaryo 1997 kelime, log 21:28:21 "tahmini süre: 895.3 sn", kurgu karnesi "14.9 dk · 134 kelime/dk — süre 14.9 dk
//   (hedef 11-14)", video 14:55. İlk düzeltmenin kırpma hedefi plan × 1,05 = 1888 kelimeydi: o işin gerçek temposunda
//   (1997 kelime / 895,3 sn) 1888 kelime = 846 sn ≈ 14,1 dk — kılavuzun da karnenin de üstünde; kırpmayı da yalnızca
//   modelin uyması taşıyordu (son okuma kırpmazsa yalnızca uyarı). Artık tavan kılavuzun üst sınırı × ölçülen film
//   temposu (13 × 134 = 1742), okumadan sonra %5'ten uzunsa kod en zayıf satırları çıkarır; kanca, çağrı, kapanış,
//   bölümün tek satırı ve uzun video tabanı (~1.700 kelime) korunur.
// SES BAŞINA TEMPO (25 Ekim 2026, 2. gözden geçirme): tek tavan en yavaş sesle (finans, 134) hesaplanıyordu; Kartal Yuvası
//   (gündem 20261024-950730: 1855 kelime = 12:47, "Target 11-13 minutes" içinde) 1742'ye kırpılacaktı. Tavan artık işin
//   kanal sesinin ölçülen temposuyla (gündem 142, tarih 141, finans 134; bilinmeyen ses 134). Uzatma da tavanı aşmaz:
//   kılavuzlu 12 dk'lık işte plan (1798) tavanın (1742) üstünde, 1700 kelimelik senaryo 1798'e doğru uzatma ödüyordu.
// Ağ YOK; model sahte (bölümler hedefin üstünde yazılır, son okuma ya hiç kırpmaz ya kısmen kırpar), ücretli çağrı yok.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sure-tavani-"));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const DS = await import("../src/pipeline/docu-script.js");
const P = await import("../src/pipeline/docu-editor-pass.js");
const { SCORE_TARGETS } = await import("../docu-engine/lib/edit-scorecard.mjs");

const france = { id: "20261024-48ae2d", language: "en", durationPreset: "detayli", docuGenre: "finance", guidance: "English ONLY: narration, graphics, captions. Target 11-13 minutes. Finance explainer for a general audience." };
/** Fransa'nın gerçek temposu: 1997 kelime → 895,3 sn film (job.log "tahmini süre: 895.3 sn", karne 134 kelime/dk). */
const franceMinutes = (words) => (words * (895.3 / 1997)) / 60;

test("guidance minutes: a range's upper bound or an explicit 'under N'; a single number is not a cap", () => {
  assert.deepEqual(DS.guidanceMinutes(france.guidance), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("News explainer; target 11-13 minutes"), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("aim for 11–13 min"), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("between 10 and 12 minutes long"), { min: 10, max: 12 });
  assert.deepEqual(DS.guidanceMinutes("Hedef 11-13 dakika."), { min: 11, max: 13 });
  assert.deepEqual(DS.guidanceMinutes("keep it under 14 min"), { min: 0, max: 14 });
  assert.deepEqual(DS.guidanceMinutes("en çok 12 dk olsun"), { min: 0, max: 12 });
  // Gerçek kılavuzlardaki tek sayılar hedef üst sınırı değil.
  for (const g of ["English history channel, 12-minute documentary", "Long video, 12+ minutes", "izleyici 3 dakika 44 saniye içeride kalmış", "140–165 spoken English words", "", undefined]) {
    assert.equal(DS.guidanceMinutes(g), null, String(g));
  }
});

test("the cap is minutes × the measured film pace: France 11-13 min → 1742 words (13 min at its real pace), never the old 1888", () => {
  const plan = DS.docuPlan(france);
  assert.equal(plan.words, 1798);
  const lim = DS.lengthLimits(france, plan);
  assert.deepEqual(lim, { maxWords: 1742, minWords: 1700, maxMinutes: 13, wpm: 134, from: "kılavuz", pace: "finans sesi" });
  assert.ok(franceMinutes(lim.maxWords) <= 13.05, `${franceMinutes(lim.maxWords)} dk`);
  assert.ok(franceMinutes(Math.round(plan.words * 1.05)) > 14, "the old plan × 1.05 target was over the scorecard cap at this pace");
  // Ölçülen tempo: 1997 kelime / 14:55 ≈ 134 kelime/dk.
  assert.equal(Math.round(1997 / (895 / 60)), DS.DOCU_FILM_WPM.en);
  // Karnenin tavanı motorla aynı sayı.
  assert.equal(DS.SCORECARD_MAX_MIN, SCORE_TARGETS.maxMinutes);
  // Kılavuz tavanın üstünü isterse karne tavanı kalır (14 × 134).
  assert.equal(DS.lengthLimits({ ...france, guidance: "Target 15-18 minutes" }, plan).maxWords, 14 * 134);
  // Daha yavaş okuma hızı (docuVoiceSpeed 1.0) tavanı indirir.
  assert.ok(DS.lengthLimits(france, plan, { voiceSpeed: 1.0 }).maxWords < lim.maxWords);
});

/** Ölçülen işler (1.16.16 tempo kuralından sonra): konuşulan kelime (docu-script.json) ve job.log "tahmini süre" (sn). */
const MEASURED = {
  news: [["Hürmüz 8a1eca", 1998, 825.1], ["Fransa isyanları 37f9d2", 1986, 829.2], ["Ebola 1e3f09", 2019, 855.9], ["Kartal Yuvası 950730", 1855, 766.7]],
  epic: [["denizaltı 373aaf", 1972, 837.6]],
  finance: [["Fransa borcu 48ae2d", 1997, 895.3]],
};
const guided = { language: "en", durationPreset: "detayli", guidance: "English ONLY. Target 11-13 minutes." };
const styleJob = { news: { ...guided, docuFormat: "news" }, epic: { ...guided, docuGenre: "epic" }, finance: { ...guided, docuGenre: "finance" } };

test("the cap uses the job's own voice: every measured job's cap lands inside 11-13 min at its own real pace", () => {
  for (const [style, jobs] of Object.entries(MEASURED)) {
    const job = styleJob[style];
    const lim = DS.lengthLimits(job, DS.docuPlan(job));
    assert.equal(lim.wpm, DS.DOCU_STYLE_WPM[style], style);
    for (const [name, words, sec] of jobs) {
      const min = (lim.maxWords * (sec / words)) / 60;
      // ≤ the guidance's 13 min, and not cut toward the long floor (the old single 134 gave Hürmüz and Kartal ~12.0 min).
      assert.ok(min <= 13.05 && min >= 12.4, `${name}: ${lim.maxWords} words = ${min.toFixed(2)} min at its pace`);
    }
    // Each style's pace is its slowest measured job (rounded): the cap holds for every voice of that style.
    assert.equal(DS.DOCU_STYLE_WPM[style], Math.min(...jobs.map(([, w, s]) => Math.round(w / (s / 60)))), style);
  }
  // Kartal Yuvası (1855 words, 12:47): no code cut any more (1742 before).
  const eagle = DS.lengthLimits(styleJob.news, DS.docuPlan(styleJob.news));
  assert.equal(eagle.maxWords, 13 * 142);
  assert.equal(eagle.pace, "gündem sesi");
  assert.ok(1855 <= eagle.maxWords * 1.05, "inside the code cut's 5% slack");
  assert.equal(DS.lengthLimits(styleJob.epic, DS.docuPlan(styleJob.epic)).maxWords, 13 * 141);
  assert.equal(DS.lengthLimits(styleJob.finance, DS.docuPlan(styleJob.finance)).maxWords, 1742);
});

test("an unknown pace falls back to the slowest measured: other styles, a countdown, another voice, Turkish", () => {
  const plan = DS.docuPlan(guided);
  for (const job of [guided, { ...guided, docuGenre: "crime" }, { ...guided, docuGenre: "documentary" }, { ...guided, docuGenre: "epic", docuFormat: "ranking" }]) {
    const lim = DS.lengthLimits(job, plan);
    assert.equal(lim.wpm, DS.DOCU_FILM_WPM.en, JSON.stringify(job));
    assert.equal(lim.pace, "ölçülmemiş ses, en yavaş");
  }
  // The style's pace belongs to its channel voice (settings docuStyleVoices): another voice, or the engine default, is unknown.
  const styleVoices = { epic: "s7KFkBv0nrs6EIRE1GDy", news: "u9E4FBbWILPZakBNST5d", finance: "QCi5Cmzx0lbdL1Z3VhF3" };
  assert.equal(DS.lengthLimits({ ...styleJob.news, elevenVoiceId: styleVoices.news }, plan, { styleVoices }).wpm, 142);
  assert.equal(DS.lengthLimits({ ...styleJob.news, elevenVoiceId: "nPczCjzI2devNBz1zQrb" }, plan, { styleVoices }).wpm, 134);
  assert.equal(DS.lengthLimits(styleJob.news, plan, { styleVoices }).wpm, 134, "no voice on the job → the engine default voice");
  assert.equal(DS.lengthLimits({ ...styleJob.epic, elevenVoiceId: "x" }, plan, { styleVoices: { news: "u9E4FBbWILPZakBNST5d" } }).wpm, 141, "no channel voice set for the style: its pace");
  // The read speed scales it (docuVoiceSpeed 1.0 → 142 × 1/1.1).
  assert.equal(DS.lengthLimits(styleJob.news, plan, { voiceSpeed: 1.0 }).wpm, Math.round((142 * 1.0) / 1.1));
  // Turkish is not measured yet: the plan's pace, whatever the style.
  const tr = { language: "tr", durationPreset: "detayli", docuGenre: "epic", guidance: "Hedef 11-13 dakika." };
  assert.deepEqual([DS.lengthLimits(tr, DS.docuPlan(tr)).wpm, DS.lengthLimits(tr, DS.docuPlan(tr)).pace], [120, "tr, planın hızı"]);
});

test("normal case: without guidance the cap is the plan's minutes + headroom + 5%, so a script on its plan is never cut", () => {
  const job = { ...france, guidance: "" };
  const plan = DS.docuPlan(job);
  const lim = DS.lengthLimits(job, plan);
  assert.equal(lim.from, "plan");
  assert.equal(lim.maxMinutes, 13.5);
  assert.equal(lim.maxWords, Math.round(12 * 1.07 * 1.05 * 134));
  assert.ok(lim.maxWords >= plan.words, `${lim.maxWords} ≥ ${plan.words}`);
  // A 20-minute request is not squeezed into the 14-minute scorecard cap.
  const deep = { ...job, durationPreset: "derin" };
  assert.ok(DS.lengthLimits(deep, DS.docuPlan(deep)).maxMinutes > 20);
  // Turkish keeps the plan's pace.
  const tr = { language: "tr", durationPreset: "uzunformat" };
  assert.equal(DS.lengthLimits(tr, DS.docuPlan(tr)).maxWords, Math.round(10 * 1.07 * 1.05 * 120));
});

test("long-video floor: never under ~1,700 words (a 10-minute request: its own plan); never under the paid-step gate", () => {
  const plan = DS.docuPlan(france);
  // "Target 6-8 minutes" on a 12-minute long video: the floor wins.
  const low = DS.lengthLimits({ ...france, guidance: "Target 6-8 minutes" }, plan);
  assert.equal(low.maxWords, 1700);
  assert.equal(low.minWords, 1700);
  assert.ok(1700 / 145 >= 10, "1,700 words stay over 10 minutes even at the fastest measured pace (145 wpm)");
  const ten = { language: "en", durationPreset: "uzunformat" };
  assert.equal(DS.lengthLimits(ten, DS.docuPlan(ten)).minWords, DS.docuPlan(ten).words);
  assert.equal(DS.lengthLimits({ language: "en", durationPreset: "kisa" }, DS.docuPlan({ language: "en", durationPreset: "kisa" })).minWords, 0);
  // An 8-minute request told "Target 4-5 minutes": the cut stops where docu.js assertLongEnough would stop the job.
  const job = { language: "en", durationPreset: "standart", guidance: "Target 4-5 minutes" };
  const scenes = Array.from({ length: 120 }, (_, k) => ({ type: "photo", chapter: Math.floor(k / 24), say: `[serious] ${Array.from({ length: 10 }, (_, j) => `w${k}x${j}`).join(" ")}.`, dur: 3 }));
  const lim = DS.lengthLimits(job, DS.docuPlan(job), { scenes });
  assert.ok(lim.maxWords > 5 * 134, JSON.stringify(lim));
  const kept = scenes.slice(0, Math.ceil(lim.maxWords / 10));
  const st = DS.docuScriptStats({ scenes: kept }, job);
  assert.ok(st.estMinutes >= st.targetMinutes * DS.LENGTH_GATE, JSON.stringify(st));
});

/* ---------------------------------------------------------------- the code's cut */
/** A small explainer: hook chapter, CTA, fact lines, fact-free commentary, a bridge, a question, a hedge, a device, an ending. */
const LINES = {
  cta: "[serious] If this helps, hit like and subscribe, then stay with me for the rest of it.",
  early: "and so the quiet story kept on moving the way it always does here.", // starts inside the first 60 s (hook)
  interest: "Interest cost Paris €59 billion in 2025, more than the defence budget.", // new fact
  grey: "and the quiet story kept on moving all through the long and grey year.", // fact-free
  nobody: "and nobody in the room ever wanted to say what everyone already knew.", // fact-free, the next line leans on it
  thatIsWhy: "That is why Moody's cut France to Aa3 on 24 October 2026.", // new fact, starts "That is why"
  question: "So why did the bill keep growing every single year after that?", // re-hook question
  answer: "and the answer was hiding in plain sight, in the bond market itself.", // answers the question
  lenders: "Lenders wanted 3.5% by then, more than Italy.", // chapter 2's last line (cliffhanger)
  only: "and a long way from the cameras the money kept on quietly draining away.", // chapter 3's only line
  hedge: "That's an upper bound, not a forecast, and it may never come to pass.", // honesty frame
  retold: "In 2025 France owed €3.6 trillion, the same figure the opening gave.", // no new number or name
  bridge: "But here's the thing, the bond market had already made up its mind.", // template bridge
  pictured: "and the quiet story moved on again, slowly, into a much colder winter.", // the split's picture
  fitch: "Fitch cut France to AA- in 2025, then held it there.", // new fact
  closing: "and the quiet ending kept on coming back to the same old question here.",
  callback: "On 1 October 2026 the bill arrived; on 1 October 2027 it will arrive again.",
};
function script() {
  const sc = [];
  const add = (chapter, say) => sc.push({ type: "photo", chapter, say, dur: 3 });
  for (let k = 0; k < 8; k++) add(0, `In 2026 France owed €3.6 trillion, and line ${k} of the cold open says so.`);
  for (const k of ["cta", "early", "interest", "grey", "nobody", "thatIsWhy", "question", "answer", "lenders"]) add(1, LINES[k]);
  add(2, LINES.only);
  for (const k of ["hedge", "retold", "bridge", "pictured", "fitch"]) add(3, LINES[k]);
  const pic = sc.findIndex((s) => s.say === LINES.pictured);
  sc.push({ type: "split", chapter: 3, say: "Two numbers, one market.", left: { fromScene: pic, label: "France · 3.5%" }, right: { label: "Italy · 3.4%" }, dur: 4 });
  add(4, LINES.closing);
  add(4, LINES.callback);
  return sc;
}
const at = (scenes, key) => scenes.findIndex((s) => s.say === LINES[key]);
const spoken = (scenes) => scenes.reduce((n, s) => n + DS.countWords(s.say), 0);

test("trimCandidates: weakest first (bridge, fact-free commentary, retold fact, new fact); protected lines are never offered", () => {
  const scenes = script();
  const cands = P.trimCandidates(scenes);
  const rank = (key) => cands.findIndex((c) => c.scene === at(scenes, key));
  assert.equal(cands[0].scene, at(scenes, "bridge"), JSON.stringify(cands));
  for (const key of ["cta", "early", "question", "lenders", "only", "hedge", "pictured", "closing", "callback"]) assert.equal(rank(key), -1, `${key} is protected`);
  for (let k = 0; k < 8; k++) assert.ok(!cands.some((c) => c.scene === k), `hook line ${k} is protected`);
  assert.ok(!cands.some((c) => scenes[c.scene].type === "split"), "devices are never dropped here");
  assert.ok(rank("grey") > 0 && rank("grey") < rank("retold"), "fact-free commentary before a retold fact");
  assert.ok(rank("retold") < rank("interest") && rank("retold") < rank("fitch"), "a new fact goes last");
});

test("trimToWords: drops the weakest lines to the cap; keeps a question's answer and a line the next one leans on", () => {
  const scenes = script();
  const total = spoken(scenes);
  const cap = total - 30;
  const cut = P.trimToWords(scenes, cap, { minWords: 0 });
  assert.ok(spoken(scenes) <= cap, `${spoken(scenes)} ≤ ${cap}`);
  assert.equal(cut.words, spoken(scenes));
  // bridge (13) + "grey" (14), then: "nobody" (the next line leans on it) and "answer" are skipped; the retold fact sits
  // next to the dropped bridge and "interest" next to "grey" (a passage thins, it is not deleted), so "thatIsWhy" goes.
  assert.ok(P.trimCandidates(script()).some((c) => c.scene === at(script(), "answer")), "the answer is offered, then kept for its question");
  assert.deepEqual(cut.dropped.map((d) => d.say), [LINES.bridge, LINES.grey, LINES.thatIsWhy].map((t) => DS.stripTags(t)));
  for (const key of ["cta", "early", "interest", "nobody", "retold", "question", "answer", "lenders", "only", "hedge", "pictured", "fitch", "closing", "callback"]) assert.ok(at(scenes, key) >= 0, key);
  assert.ok(scenes.slice(0, 8).every((s) => /cold open/.test(s.say)), "the hook is untouched");
  // the split still points at its picture after the shift
  const split = scenes.find((s) => s.type === "split");
  assert.equal(scenes[split.left.fromScene].say, LINES.pictured);
});

test("trimToWords: the floor (minWords) holds, and a script already under the cap is untouched", () => {
  const scenes = script();
  const total = spoken(scenes);
  const cut = P.trimToWords(scenes, total - 200, { minWords: total - 20 });
  assert.deepEqual(cut.dropped.map((d) => d.say), [DS.stripTags(LINES.bridge)], "only the bridge fits above the floor");
  assert.equal(cut.words, total - 13);
  const same = script();
  assert.deepEqual(P.trimToWords(same, total, { minWords: 0 }), { dropped: [], words: total });
  assert.deepEqual(same, script());
});

test("the editor is told the cut and shown the code's weakest lines", () => {
  const scenes = script();
  const total = spoken(scenes);
  const u = P.editorUser({ scenes, research: "r", maxWords: total - 40 });
  assert.ok(u.includes(`UZUNLUK (ZORUNLU): senaryo ${total} kelime, en çok ${total - 40} olmalı — en az 40 kelime kırp`), u);
  assert.match(u, new RegExp(`Yeterince kırpmazsan kod en zayıf satırları kendisi çıkarır\\. En zayıf adaylar \\(kod sıraladı.*\\): #${at(scenes, "bridge")}, `));
  assert.ok(!P.editorUser({ scenes, research: "r" }).includes("En zayıf adaylar"));
});

/* ---------------------------------------------------------------- runDocuScript with a stubbed editor */
const targetOf = (o) => Number(/toplam (\d+) kelime anlatım/.exec(o.user)?.[1] || 100);
/** A letters-only tag per line ("zbyc"): tells lines apart without adding a number or a name. */
const tag = (i, k) => `z${[i, k].map((n) => n.toString(26).split("").map((d) => String.fromCharCode(97 + parseInt(d, 26))).join("")).join("y")}`;
/** Plan, chapters (asked words × over, lines of 10 words) and a final read that drops `drop(user)` lines. */
function fakeModel(over, { lead = "", drop = () => [], uniq = false } = {}) {
  const calls = [];
  const llm = async (o) => {
    calls.push(o);
    if (o.schema?.properties?.edits) return { edits: drop(o.user).map((scene) => ({ scene, action: "drop", kind: "retold", reason: "uzunluk" })) };
    if (o.schema?.properties?.patches) return { verdict: "", promise: "", patches: [] };
    if (!o.schema?.properties?.scenes) {
      const n = Number(o.user.match(/TAM (\d+) bölüm/)[1]);
      return {
        title: "Sahte Belgesel", genre: "documentary", visualStyle: "Grainy film photograph.", centralQuestion: "Neden?", stakes: "Her şey.", promise: "Cevabı göreceğiz.", hookWord: "anahtar",
        openLoops: [{ text: "Kim?", setupChapter: 1, payoffChapter: n }, { text: "Nasıl?", setupChapter: 2, payoffChapter: n }],
        cast: [{ key: "hasan_usta", description: "a man in his 40s" }],
        chapters: Array.from({ length: n }, (_, i) => ({ title: `Bölüm ${i + 1}`, goal: "g", covers: [`olgu ${i}`], hookIn: "h", turn: "t", cliffhanger: "c", intensity: i === 0 ? 5 : 2, midpoint: i === 2 })),
      };
    }
    const i = Number(o.user.match(/BÖLÜM (\d+)\/\d+/)[1]) - 1;
    const scenes = i === 0
      ? [{ type: "montage", mood: "tension", say: "[whispers] Bir anahtar... bir dolap.", dur: 4, imagePrompts: [1, 2, 3, 4, 5].map((k) => ({ prompt: `macro ${k}`, cast: [] })), text: "anahtar dolap", source: "ai" },
        { type: "title", mood: "tension", say: "[curious] Kilitli dolabın hikâyesi.", dur: 3, title: "Kilitli Dolap", kicker: "Bir", imagePrompt: "the man at the door", cast: ["hasan_usta"], source: "ai" }]
      : [];
    let left = Math.round(targetOf(o) * over) - scenes.reduce((n, s) => n + DS.countWords(s.say), 0);
    for (let k = 0; left > 0; k++) {
      const n = Math.min(10, left);
      const head = `${lead}${uniq ? `${tag(i, k)} ` : ""}`;
      const line = `[serious] ${head}${Array.from({ length: n - head.split(" ").filter(Boolean).length }, (_, j) => `kelime${j}`).join(" ")}.`;
      scenes.push({ type: k % 3 === 1 ? "words" : "photo", mood: "tension", say: line, dur: 3, imagePrompt: `chapter ${i} unique shot number ${k}`, source: "ai", ...(k % 3 === 1 ? { text: DS.stripTags(line) } : {}) });
      left -= n;
    }
    const parsed = { scenes };
    const errors = o.validate?.(parsed) || [];
    if (errors.length) throw new Error(errors.join("; "));
    return parsed;
  };
  return { llm, calls };
}
const job = { id: "j1", topic: "Kilitli dolap", durationPreset: "uzunformat", language: "tr", docuSource: "ai" };
const spokenOf = (script) => script.scenes.reduce((n, s) => n + DS.countWords(s.say), 0);

test("enforcement: the final read cuts nothing → code drops the weakest lines to the cap, no extra paid call", async () => {
  const logs = [];
  const { llm, calls } = fakeModel(1.25);
  const script = await DS.runDocuScript(job, "araştırma", {}, (m) => logs.push(m), { llm, hookDir: home, dir: fs.mkdtempSync(path.join(home, "j-")) });
  const plan = DS.docuPlan(job);
  const cap = DS.lengthLimits(job, plan).maxWords;
  assert.equal(cap, 1348);
  assert.ok(logs.some((m) => new RegExp(`^Senaryo hâlâ uzun: \\d+/${cap} kelime — kod en zayıf \\d+ satırı çıkardı → \\d+ kelime`).test(m)), logs.join("\n"));
  assert.ok(spokenOf(script) <= cap && spokenOf(script) >= plan.words, `${spokenOf(script)}`);
  assert.equal(script.stats.actualWords, spokenOf(script));
  assert.ok(script.stats.warnings.some((w) => w.startsWith("Uzunluk kuralı: kod ")), JSON.stringify(script.stats.warnings));
  assert.ok(!script.stats.warnings.some((w) => w.startsWith("Senaryo uzun kaldı")));
  assert.equal(calls.filter((c) => c.schema?.properties?.edits && /UZUNLUK/.test(c.user)).length, 1, "only the one final read is told to cut");
  // hook, ending and every chapter survive
  assert.match(script.scenes[0].say, /Bir anahtar/);
  assert.equal(new Set(script.scenes.map((s) => s.chapter)).size, plan.chapters);
});

test("enforcement: a final read that cuts to within 5% of the cap is trusted; the code does not cut further", async () => {
  const logs = [];
  const plan = DS.docuPlan(job);
  const cap = DS.lengthLimits(job, plan).maxWords;
  // The stub editor drops 10-word photo lines from the middle chapters until the script is ~3% over the cap.
  const drop = (user) => {
    const total = Number(/senaryo (\d+) kelime, en çok/.exec(user)?.[1] || 0);
    if (!total) return [];
    const rows = [...user.matchAll(/^#(\d+) \[[^\]]+\] \[photo\] \(bölüm (\d+)\)/gm)].map((m) => ({ i: +m[1], ch: +m[2] })).filter((r) => r.ch > 1 && r.ch < plan.chapters);
    const need = Math.ceil((total - cap * 1.03) / 10);
    return rows.slice(0, need).map((r) => r.i);
  };
  const { llm } = fakeModel(1.2, { drop });
  const script = await DS.runDocuScript(job, "araştırma", {}, (m) => logs.push(m), { llm, hookDir: home });
  const w = spokenOf(script);
  assert.ok(w > cap && w <= cap * 1.05, `${w} vs ${cap}`);
  assert.ok(!logs.some((m) => /^Senaryo hâlâ uzun/.test(m)), logs.join("\n"));
  assert.ok(!(script.stats.warnings || []).some((w2) => /Senaryo uzun kaldı|Uzunluk kuralı/.test(w2)));
});

test("a script the code cannot cut safely (every line leans on the one before) is reported, not mangled", async () => {
  const { llm } = fakeModel(1.25, { lead: "Bu " });
  const script = await DS.runDocuScript(job, "araştırma", {}, () => {}, { llm, hookDir: home });
  const plan = DS.docuPlan(job);
  const cap = DS.lengthLimits(job, plan).maxWords;
  assert.ok(script.stats.warnings.some((w) => w.startsWith(`Senaryo uzun kaldı: ${script.stats.actualWords}/${plan.words} kelime (kırpma hedefi ${cap}; kurgu karnesi en çok 14 dk)`)), JSON.stringify(script.stats.warnings));
});

test("the code cut takes the lines the editor wanted dropped first: its drops over the 25-drop cap", async () => {
  const plan = DS.docuPlan(job);
  const cap = DS.lengthLimits(job, plan).maxWords;
  let all = [];
  let wanted = [];
  // The stub editor asks for 40 drops (every other middle line, never a chapter's first or last): 25 go through, 15 are left.
  const drop = (user) => {
    if (!/UZUNLUK \(ZORUNLU\)/.test(user)) return [];
    const rows = [...user.matchAll(/^#(\d+) \[[^\]]+\] \[(?:photo|words)\] \(bölüm (\d+)\) \[serious\] (z\w+)/gm)].map((m) => ({ i: +m[1], ch: +m[2], tag: m[3] }));
    all = rows.map((r) => r.tag);
    const mid = rows.filter((r) => r.ch > 1 && r.ch < plan.chapters);
    const pick = mid.filter((r, k) => k % 2 === 0 && mid[k - 1]?.ch === r.ch && mid[k + 1]?.ch === r.ch).slice(0, 40);
    wanted = pick.map((r) => r.tag);
    return pick.map((r) => r.i);
  };
  const logs = [];
  const { llm } = fakeModel(1.33, { drop, uniq: true });
  const script = await DS.runDocuScript(job, "araştırma", {}, (m) => logs.push(m), { llm, hookDir: home });
  assert.equal(wanted.length, 40);
  const left = new Set(script.scenes.map((s) => DS.stripTags(s.say).split(" ")[0]));
  const [applied, spare] = [wanted.slice(0, 25), wanted.slice(25)];
  assert.ok(applied.every((t) => !left.has(t)), "the editor's first 25 drops went through");
  const byCode = all.filter((t) => !left.has(t) && !applied.includes(t));
  assert.ok(byCode.length > 0 && spareCount(logs) === byCode.length, logs.join("\n"));
  assert.deepEqual(byCode.filter((t) => !spare.includes(t)), [], "every line the code cut was one the editor wanted dropped");
  assert.ok(spokenOf(script) <= cap, `${spokenOf(script)} ≤ ${cap}`);
});
const spareCount = (logs) => Number(/; (\d+) satırı editör çıkarmak istemişti$/.exec(logs.find((m) => /^Senaryo hâlâ uzun/.test(m)) || "")?.[1] || 0);

/* ---------------------------------------------------------------- the extension never aims past the cap */
const enJob = { id: "j-en", topic: "Locked cabinet", durationPreset: "detayli", language: "en", docuSource: "ai", guidance: "English ONLY. Target 11-13 minutes." };
/** Chapters at ratio(i) × their target; an extension writes exactly the asked total ("toplam ~N kelime"). */
function extendModel(ratio) {
  const calls = [];
  const base = fakeModel(1).llm;
  const llm = async (o) => {
    calls.push(o);
    if (!o.schema?.properties?.scenes) return base(o);
    const i = Number(o.user.match(/BÖLÜM (\d+)\/\d+/)[1]) - 1;
    const ask = /UZAT: en az \d+ kelime daha ekle \(toplam ~(\d+) kelime\)/.exec(o.user);
    const words = ask ? Number(ask[1]) : Math.round(targetOf(o) * ratio(i));
    const scenes = i === 0
      ? [{ type: "montage", mood: "tension", say: "[whispers] A key... a cabinet.", dur: 4, imagePrompts: [1, 2, 3, 4, 5].map((k) => ({ prompt: `macro ${k}`, cast: [] })), text: "key cabinet", source: "ai" },
        { type: "title", mood: "tension", say: "[curious] The locked cabinet.", dur: 3, title: "The Locked Cabinet", kicker: "One", imagePrompt: "the man at the door", cast: ["hasan_usta"], source: "ai" }]
      : [];
    for (let left = words - scenes.reduce((n, s) => n + DS.countWords(s.say), 0), k = 0; left > 0; k++, left -= 10) {
      scenes.push({ type: "photo", mood: "tension", say: `[serious] ${Array.from({ length: Math.min(10, left) }, (_, j) => `kelime${j}`).join(" ")}.`, dur: 3, imagePrompt: `chapter ${i} unique shot number ${k}`, source: "ai" });
    }
    const errors = o.validate?.({ scenes }) || [];
    if (errors.length) throw new Error(errors.join("; "));
    return { scenes };
  };
  return { llm, calls };
}

test("extension: a guided 12-minute script already inside the cap (95% of the plan, ~12.7 min) pays for no extension", async () => {
  const plan = DS.docuPlan(enJob);
  const lim = DS.lengthLimits(enJob, plan);
  assert.ok(plan.words > lim.maxWords, `plan ${plan.words} > cap ${lim.maxWords}`);
  const logs = [];
  const { llm, calls } = extendModel(() => 0.95);
  const script = await DS.runDocuScript(enJob, "research", {}, (m) => logs.push(m), { llm, hookDir: home });
  assert.equal(calls.filter((c) => /UZAT:/.test(c.user)).length, 0, logs.join("\n"));
  assert.ok(!logs.some((m) => /^Senaryo (kısa|uzun)/.test(m)), logs.join("\n"));
  assert.ok(script.stats.actualWords >= lim.minWords && script.stats.actualWords <= lim.maxWords, `${script.stats.actualWords}`);
});

test("extension: a short guided script is extended toward the cap, never past it", async () => {
  const plan = DS.docuPlan(enJob);
  const cap = DS.lengthLimits(enJob, plan).maxWords;
  const logs = [];
  const { llm, calls } = extendModel((i) => (i === 2 ? 0.5 : 0.92));
  const script = await DS.runDocuScript(enJob, "research", {}, (m) => logs.push(m), { llm, hookDir: home });
  const first = logs.find((m) => /^Senaryo kısa: /.test(m));
  assert.match(first, new RegExp(`^Senaryo kısa: \\d+/${cap} kelime \\(plan ${plan.words}; süre tavanı 13 dk\\) — \\d+ bölüm uzatılıyor \\(tur 1\\)$`));
  const before = Number(/^Senaryo kısa: (\d+)\//.exec(first)[1]);
  const asked = calls.filter((c) => /UZAT:/.test(c.user)).map((c) => Number(/UZAT: en az (\d+) kelime/.exec(c.user)[1]));
  assert.ok(asked.length >= 1);
  assert.ok(before + asked.reduce((a, b) => a + b, 0) <= cap, `${before} + ${asked.join(" + ")} ≤ ${cap}`);
  assert.ok(script.stats.actualWords <= cap && !logs.some((m) => /^Senaryo uzun/.test(m)), `${script.stats.actualWords}`);
});

test("extension: no paid chapter rewrite for a sliver the cap leaves once the earlier asks reach the stop", async () => {
  // 1640 words: asks 17 + 48 + 29 already reach the 1700 stop; the cap then left 8 words for a fourth chapter call.
  const plan = DS.docuPlan(enJob);
  const lim = DS.lengthLimits(enJob, plan);
  const { llm, calls } = extendModel((i) => (i === 1 ? 0.8 : 0.93));
  const script = await DS.runDocuScript(enJob, "research", {}, () => {}, { llm, hookDir: home });
  const asks = calls.filter((c) => /UZAT:/.test(c.user)).map((c) => ({ i: Number(/BÖLÜM (\d+)\/\d+/.exec(c.user)[1]) - 1, add: Number(/UZAT: en az (\d+) kelime/.exec(c.user)[1]) }));
  assert.ok(asks.length >= 2, JSON.stringify(asks));
  for (const a of asks) assert.ok(a.add >= Math.ceil(plan.chapterWords[a.i] * 0.12), `chapter ${a.i + 1} was asked for only ${a.add} words: ${JSON.stringify(asks)}`);
  assert.ok(script.stats.actualWords >= lim.minWords && script.stats.actualWords <= lim.maxWords, `${script.stats.actualWords}`);
});

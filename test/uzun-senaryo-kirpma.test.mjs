// UZUN SENARYO KIRPILIR (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: job.json kılavuzu "Target 11-13 minutes"; log 18:21:13 plan 1798 kelime, 18:35:55 "Senaryo hazır: 159
//   sahne, 1997/1798 kelime (~15.6 dk ...)"; 21:33:34 kurgu karnesi "hedef dışı: süre 14.9 dk (hedef 11-14)" ve hemen
//   ardından "render başlıyor"; video 14:55 teslim edildi. docu-script.js kısa senaryoyu uzatıyordu (EXTEND_BELOW), uzunu
//   hiçbir adım kısaltmıyordu: son okumaya yalnızca minWords gidiyordu, karne de yalnızca yazıyordu.
// Ağ YOK; model sahte (bölümler hedefin %25 üstünde yazılır), ücretli çağrı yok.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kirpma-"));
process.env.NOVA_HOME = home;
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const DS = await import("../src/pipeline/docu-script.js");
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const say = (n) => `[serious] ${Array.from({ length: n }, (_, k) => `kelime${k}`).join(" ")}.`;
const targetOf = (o) => Number(/toplam (\d+) kelime anlatım/.exec(o.user)?.[1] || 100);
/** docu-mode.test.mjs'deki sahte modelin kısası: plan, bölümler (istenen kelime × over) ve boş son okuma. */
function fakeModel(over) {
  const calls = [];
  const llm = async (o) => {
    calls.push(o);
    if (o.schema?.properties?.edits) return { edits: [] };
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
      const line = say(n);
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

// 25 Ekim denetimi: plan × 1,05 (1888) o işin gerçek temposunda ~14,1 dk'ydı; tavan artık dakikadan (sure-tavani-kirpma).
// 2. gözden geçirme: tempo işin kanal sesinden — finans 134, gündem 142 (Kartal Yuvası 1855 kelime = 12:47 kırpılmaz).
test("the cut target: France (11-13 min guidance) → 1742 words, not 1888; a script on its plan is left alone", () => {
  const france = { language: "en", durationPreset: "detayli", docuGenre: "finance", guidance: "Target 11-13 minutes." };
  const plan = DS.docuPlan(france);
  assert.equal(DS.lengthLimits(france, plan).maxWords, 1742, "France: 1997/1798 words → cut to 13 min × 134 wpm (finance voice)");
  assert.ok(DS.lengthLimits(france, plan).maxWords < Math.round(plan.words * 1.05));
  const eagle = { language: "en", durationPreset: "detayli", docuFormat: "news", guidance: "Target 11-13 minutes." };
  assert.ok(DS.lengthLimits(eagle, plan).maxWords * 1.05 >= 1855, "Eagle's Nest (news voice, 12:47) is not code-cut");
  const plain = { ...france, guidance: "" };
  assert.ok(DS.lengthLimits(plain, DS.docuPlan(plain)).maxWords >= 1798, "no guidance: an on-plan script is not cut");
});

test("an overlong script goes to the final read with maxWords; left long, the code cuts it to the cap", async () => {
  const logs = [];
  const { llm, calls } = fakeModel(1.25);
  const script = await DS.runDocuScript(job, "araştırma", {}, (m) => logs.push(m), { llm, hookDir: home, dir: fs.mkdtempSync(path.join(home, "j-")) });
  const plan = DS.docuPlan(job);
  const cap = DS.lengthLimits(job, plan).maxWords;
  assert.ok(logs.some((m) => new RegExp(`^Senaryo uzun: \\d+/${plan.words} kelime — son okuma ~${cap} kelimeye kırpıyor \\(tavan 11\\.2 dk, plan; film temposu 120 kelime/dk, tr, planın hızı\\)$`).test(m)), logs.join("\n"));
  assert.equal(calls.filter((c) => c.schema?.properties?.edits).length, 1, "one final read (it carries the cut)");
  assert.match(calls.find((c) => c.schema?.properties?.edits).user, new RegExp(`UZUNLUK \\(ZORUNLU\\): senaryo \\d+ kelime, en çok ${cap} olmalı`), "the editor is told how far to cut");
  // The read cut nothing (fake): the code cut it, and says so; a script the code cannot cut is still reported (sure-tavani-kirpma).
  assert.ok(script.stats.actualWords <= cap, `${script.stats.actualWords} ≤ ${cap}`);
  assert.ok(script.stats.warnings.some((w) => w.startsWith("Uzunluk kuralı: kod ")), JSON.stringify(script.stats.warnings));
  // The final read is told the cap (docu-editor-pass.js editorialPass({ maxWords })), and its cache key carries it.
  const src = read("src/pipeline/docu-script.js");
  assert.match(src, /const floor = maxWords \? limits\.minWords : 0;/);
  assert.match(src, /minWords: Math\.max\(Math\.round\(plan\.words \* 0\.9\), floor\), \.\.\.\(maxWords \? \{ maxWords \} : \{\}\)/);
  assert.match(src, /const edKey = sha1\(\["son-okuma-2", .*\.\.\.\(maxWords \? \[maxWords\] : \[\]\)\]\)/);
});

test("normal case: a script on its word target is not cut and gets no length warning", async () => {
  const logs = [];
  const { llm } = fakeModel(1);
  const script = await DS.runDocuScript(job, "araştırma", {}, (m) => logs.push(m), { llm, hookDir: home });
  assert.ok(!logs.some((m) => /Senaryo uzun/.test(m)), logs.join("\n"));
  assert.ok(!(script.stats.warnings || []).some((w) => /Senaryo uzun/.test(w)));
});

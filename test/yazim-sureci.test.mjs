// YAZIM SÜRECİ (22 Ekim 2026). Kanal sahibi: "en iyi videoları analiz ettik, nie böyle oldu… yazım iyi olmalı". Fransa
// videosunun izlenme eğrisi + yazım hattı denetimi + profesyonel yazım araştırması: plan editörü, açılış bütçesi,
// araştırmanın yapım notları, yazarın bütün metni görmesi, iddia/kopya/isimsiz kaynak denetimi, son okumanın 2. turu.
import test from "node:test";
import assert from "node:assert/strict";
import * as DS from "../src/pipeline/docu-script.js";
import { applyPlanPatches, planClaimErrors, reviewPlan, planView, planChecklist, PLAN_REVIEW_SCHEMA } from "../src/pipeline/docu-plan-editor.js";
import { claimErrors, templateCopies, vagueSources, earErrors, scriptLint } from "../src/pipeline/docu-lint.js";
import { applyEditorEdits, editorUser } from "../src/pipeline/docu-editor-pass.js";

const S = (...lines) => lines.map((say) => ({ type: "photo", say }));
const bible = (extra = {}) => ({
  title: "France Under Curfew", centralQuestion: "What set it off?", promise: "By the end, you'll know three things.", hookWord: "miracle",
  openLoops: [{ text: "Was anyone killed?", setupChapter: 1, payoffChapter: 4 }],
  chapters: [
    { title: "A Miracle", goal: "Open on the PM's sentence, then the three-part promise and the honesty frame", covers: ["PM said no one was killed", "Narrator frame: established vs unknown"], hookIn: "Paris on Saturday night", turn: "a death is reported", cliffhanger: "it started in a classroom", intensity: 4, midpoint: false, background: false },
    { title: "Forty Degrees", goal: "September school protests", covers: ["Créteil, 18 September"], hookIn: "a classroom at forty degrees", turn: "a boy is hit", cliffhanger: "a national day", intensity: 3, midpoint: false, background: true },
    { title: "We Lost Control", goal: "the admission", covers: ["Nuñez said four words: we lost control", "Paris police posted the order at 5:53"], hookIn: "four words", turn: "resignation refused", cliffhanger: "versions", intensity: 5, midpoint: true, background: false },
    { title: "Saturday", goal: "what to watch", covers: ["new Yellow Vests call"], hookIn: "Saturday is four days away", turn: "x", cliffhanger: "y", intensity: 4, midpoint: false, background: false },
  ],
  ...extra,
});
const RESEARCH = "Nuñez: \"Yes, Saturday, in certain large cities, we lost control.\" Paris Emniyeti ~17:53 (X'teki saat damgası). 550.000 katılımcı. Lecornu: \"no one was killed, and that is a miracle.\"";

test("research: the researcher's production notes and time plan never reach the writers", () => {
  const r = "## 1. KRONOLOJİ\nOlay.\n## Yapım notları (video için, tamamı İngilizce)\nAçılış 0:45; tetikleyici ve önceki haftalar 2:00\n### Başlık önerileri\nX\n## 9. Kaynaklar\n- A\n## 10. Prodüksiyon notları (video dili)\nY";
  const w = DS.researchForWriters(r);
  assert.ok(w.includes("KRONOLOJİ") && w.includes("Kaynaklar"));
  assert.ok(!/Yapım notları|önceki haftalar 2:00|Başlık önerileri|Prodüksiyon notları/.test(w), w);
});

test("plan: the opening chapter gets ~55 s; the rest keeps the total", () => {
  const p = DS.docuPlan({ durationPreset: "detayli", language: "en", docuFormat: "news" });
  assert.equal(p.chapterWords[0], DS.OPENING_WORDS);
  assert.ok(Math.abs(p.chapterWords.reduce((a, b) => a + b, 0) - Math.round(p.words / p.chapters) * p.chapters) <= 2);
  assert.ok(p.chapterWords[1] > p.chapterWords[0]);
});

test("plan editor: patches only known fields, re-checks the plan, and sees the plan's own false facts", async () => {
  const b = bible();
  const claims = planClaimErrors(b, RESEARCH);
  assert.ok(claims.some((c) => c.chapter === 3 && /5:53/.test(c.detail)), JSON.stringify(claims));
  assert.ok(claims.some((c) => c.chapter === 4 && c.kind === "relative-time"));
  const out = applyPlanPatches(b, { promise: "By the end, you'll know why the state didn't see it coming.", patches: [
    { chapter: 1, field: "goal", text: "Open on the PM's sentence and the heart-attack death; one promise; then the strongest new fact", reason: "1" },
    { chapter: 2, field: "background", text: "false", reason: "2" },
    { chapter: 3, field: "covers", text: "Nuñez on public radio: we lost control | the resignation offer", reason: "8" },
    { chapter: 9, field: "goal", text: "x", reason: "yok" },
    { chapter: 1, field: "midpoint", text: "true", reason: "izinsiz alan" },
  ] });
  assert.equal(out.applied.length, 3);
  assert.equal(out.rejected.length, 2);
  assert.equal(out.bible.chapters[1].background, false);
  assert.deepEqual(out.bible.chapters[2].covers, ["Nuñez on public radio: we lost control", "the resignation offer"]);
  assert.match(out.bible.promise, /didn't see it coming/);
  assert.equal(b.chapters[1].background, true, "the original plan is never mutated");
  // The reviewed plan must pass the plan's own rules, else the original stays.
  const calls = [];
  const llm = async (o) => { calls.push(o); return { verdict: "2. bölüm arka plandı", promise: "", patches: [{ chapter: 2, field: "background", text: "true", reason: "x" }, { chapter: 3, field: "background", text: "true", reason: "x" }] }; };
  const r = await reviewPlan({ bible: b, plan: { news: true, chapterWords: [140, 260, 260, 260] }, research: RESEARCH, llm, check: (x) => DS.newsBackgroundErrors(x.chapters) });
  assert.equal(r.bible, b, "a plan that breaks the rules is thrown away");
  assert.equal(calls[0].schema, PLAN_REVIEW_SCHEMA);
  assert.match(calls[0].user, /\[~0:00\][\s\S]*\[~0:56\]/, "every chapter carries its start time");
  assert.match(calls[0].user, /KODUN BULDUĞU OLGU SORUNLARI[\s\S]*5:53/);
  assert.match(calls[0].system, /AÇILIŞ \(~55 sn\)[\s\S]*ZİRVEDEN SONRA[\s\S]*OLGULAR/);
  assert.ok(planChecklist({ news: true }).join("\n").includes("BU HAFTANIN"));
  assert.match(planView(b, { chapterWords: [140, 260, 260, 260] }), /\[ARKA PLAN\]/);
});

test("writer: every chapter sees the whole narration so far, the opening's own question, and its start time", () => {
  const block = DS.soFarBlock([S("Paris burned on Saturday.", "So how did France get here?", "By the end, you'll know why."), S("It began in a classroom.")]);
  assert.match(block, /BU BÖLÜM videonun ~0:\d\d'ında başlıyor/);
  assert.match(block, /AÇILIŞTAKİ SORU\/VAAT[\s\S]*"So how did France get here\?"[\s\S]*"By the end, you'll know why\."/);
  assert.match(block, /— Bölüm 1: Paris burned on Saturday\.[\s\S]*— Bölüm 2: It began in a classroom\./);
});

test("lint: claims the research does not carry — clock time, number, quote, absolute, relative time", () => {
  const R = "Lecornu: \"no one was killed, and that is a miracle.\" ~550.000 katılımcı (İçişleri), 2.300 gözaltı. Saat 17:53.";
  const kinds = (lines) => claimErrors(S(...lines), R).map((x) => x.kind);
  assert.deepEqual(kinds(["Paris police posted the order at 5:53."]), ["unsupported"], "the same minute but which clock?");
  assert.deepEqual(kinds(["Police detained more than 2,300 people and 550,000 marched."]), [], "Turkish 550.000 is the same number");
  assert.deepEqual(kinds(["Police counted 4,700 arrests."]), ["unsupported"]);
  assert.deepEqual(kinds(["The PM said: no one was killed, and that is a miracle."]), []);
  assert.deepEqual(kinds(["The PM said: the state has total control of Paris."]), ["quote"]);
  assert.deepEqual(kinds(["It is still the only death officially on record."]), ["absolute"]);
  assert.deepEqual(kinds(["But that account is not the only one."]), [], "a pronoun, not a claim");
  assert.deepEqual(kinds(["Saturday is four days away."]), ["relative-time"]);
});

test("lint: copied rule examples and filler bridges, unnamed sources, eye punctuation", () => {
  const t = templateCopies(S("First, the basics. Saturday was a protest day.", "And here's where it gets uncomfortable.", "Let's dive in.", "Police fired tear gas at 9 p.m."));
  assert.deepEqual(t.map((x) => x.scene), [0, 1, 2]);
  assert.deepEqual(vagueSources(S("Rights groups have accused police of force.", "Amnesty and other rights groups say so.", "Reports say it was a grenade.")).map((x) => x.scene), [0, 2]);
  assert.deepEqual(earErrors(S("He came; he left.", "The two (Paris and Lille) closed.", "Plain line.")).map((x) => x.scene), [0, 1]);
  const all = scriptLint(S("First, the basics.", "Rights groups say so."), { research: "x" }).map((x) => x.kind);
  assert.ok(all.includes("template") && all.includes("vague-source"));
});

test("son okuma: lines carry their time; an unsupported number is fixed only with a research number", () => {
  const u = editorUser({ scenes: S("A".repeat(10), "Police counted 4,700 arrests."), research: "2.300 gözaltı" });
  assert.match(u, /#0 \[0:00\] \[photo\]/);
  assert.match(u, /OTOMATİK BULGULAR[\s\S]*\[unsupported\]/);
  const ok = applyEditorEdits(S("x", "Police counted 4,700 arrests."), [{ scene: 1, action: "rewrite", kind: "unsupported", say: "Police counted more than 2,300 arrests.", reason: "araştırma" }], { research: "2.300 gözaltı" });
  assert.equal(ok.applied.length, 1);
  const no = applyEditorEdits(S("x", "Police counted 4,700 arrests."), [{ scene: 1, action: "rewrite", kind: "clunky", say: "Police counted more than 2,300 arrests.", reason: "x" }], { research: "2.300 gözaltı" });
  assert.equal(no.applied.length, 0, "only the fact-fix kinds may bring a research number");
  assert.ok(DS.SECOND_ROUND_KINDS.has("unsupported") && DS.SECOND_ROUND_KINDS.has("template") && !DS.SECOND_ROUND_KINDS.has("ear"));
});

// DERİN İNCELEME KURALLARI (20-21 Ekim 2026). 39 tutmuş video satır satır okundu (quality-review/deep-study-20261019/
// RAPOR.md §9) ve kanal sahibi "hepsini ekle önerdiğin gibi yap" dedi. Ardından Fransa videosunun izleyici notları geldi
// (yazı kesilmesi, yanlış ülke fotoğrafları, eski gazete şablonu, 19 kez çıkan tahta, kancadaki meta cümle).
import test from "node:test";
import assert from "node:assert/strict";
import { CTAS, HOOK_CTA_MAX_WORDS, rhetoricLines, sensitiveTopic } from "../src/pipeline/docu-rhetoric.js";
import { critiqueTimeline, CRITIC } from "../src/pipeline/docu-critic.js";
import { spineLines, SHORT_SELL_LINE, dropSellBeats, shortGrowthLines, VOICE_STYLES } from "../src/pipeline/growth-lessons.js";
import { lateLoopPayoff } from "../src/pipeline/docu-script.js";
import { scriptLint, instructionLeaks, stripLeakSentences, unitErrors, countErrors, closingCallback, unpaidTitleWords, metaInHook } from "../src/pipeline/docu-lint.js";
import { applyEditorEdits, EDIT_KINDS } from "../src/pipeline/docu-editor-pass.js";
import { storyPlaceGroups, foreignPlaceConflict, SCENE_TRUTH_LINES } from "../src/pipeline/docu-archive.js";
import { wordCut, keepExplainerWindow, EXPLAINER_SCENES, EXPLAINER_SPAN } from "../src/pipeline/docu-topic-bible.js";
import { peakCards, PEAK_CARDS_MIN } from "../src/pipeline/docu-edit-director.js";
import * as P from "../src/pipeline/docu-package.js";
import { DESIGNED_BACKDROPS, DESIGNED_TEXT_MAX } from "../src/pipeline/docu-art-director.js";

const S = (...lines) => lines.map((say) => ({ type: "photo", say }));
const wc = (t) => t.split(/\s+/).filter(Boolean).length;

test("CTA: the trio after the hook is short, reasoned, and followed by the strongest beat", () => {
  const hook = CTAS.filter((c) => c.place === "hook");
  assert.ok(hook.length >= 5);
  for (const c of hook) {
    assert.ok(wc(c.example) <= HOOK_CTA_MAX_WORDS, `${c.id}: ${wc(c.example)} words`);
    assert.match(c.example, /\blike\b/i);
    assert.match(c.example, /subscribe/i);
    assert.match(c.example, /comment/i);
    assert.match(c.example, /\b(if|so)\b/i, `${c.id} gives a reason`);
  }
  const lines = rhetoricLines({ perChapter: [[]], cta: hook[0].id, ctaPlace: "hook", ctaChapter: 0 }, 0, 6).join("\n");
  assert.match(lines, /GEREKÇELİ/);
  assert.match(lines, /EN GÜÇLÜ vuruş/);
  assert.match(lines, new RegExp(`EN ÇOK ${HOOK_CTA_MAX_WORDS} kelime`));
});

test("critic: a CTA scene longer than ~8 s is flagged", () => {
  const scenes = [{ type: "photo", image: "build/j/cm-1.jpg", archived: true, say: "Hook." }, { type: "photo", image: "build/j/cm-2.jpg", archived: true, say: "Like, subscribe and comment.", cta: "like" }, { type: "photo", image: "build/j/cm-3.jpg", archived: true, say: "End.", cta: "comment" }];
  let f = 0;
  const placed = [12, 12, 600].map((s) => { const p = { from: f, frames: s * 30 }; f += p.frames; return p; });
  const issues = critiqueTimeline({ scenes }, placed);
  assert.ok(issues.some((x) => x.kind === "cta" && /sürüyor/.test(x.detail)), JSON.stringify(issues));
  assert.equal(CRITIC.ctaMaxSec, 8.5);
});

test("spine: re-hook, familiar equivalent, news sub-question/domino, history loop ledger", () => {
  const news = spineLines({ news: true, first: false, last: true }).join("\n");
  assert.match(news, /YENİDEN KANCA/);
  assert.match(news, /TANIDIK KARŞILIK/);
  assert.match(news, /ALT SORUYLA/);
  assert.match(news, /DOMİNO/);
  assert.match(news, /ZİNCİRİ KAPAT/);
  const story = spineLines({ story: true }).join("\n");
  assert.match(story, /DÖNGÜ DEFTERİ/);
  assert.doesNotMatch(story, /DOMİNO/);
  assert.equal(lateLoopPayoff([{ payoffChapter: 3 }], 8), false);
  assert.equal(lateLoopPayoff([{ payoffChapter: 3 }, { payoffChapter: 6 }], 8), true);
});

test("honesty frame: no process talk in the first minute, at most 2 'I'", () => {
  const news = VOICE_STYLES.news.join("\n");
  assert.match(news, /İLK DAKİKADA YOK/);
  assert.match(news, /EN ÇOK 2 'I'/);
  const hits = metaInHook(S("This is Paris on Saturday night.", "As I record this, the numbers are still changing.", "So I'll keep three things apart."));
  assert.deepEqual(hits.map((h) => h.scene), [1, 2]);
  const late = [...S(...Array.from({ length: 30 }, () => "Ten words of plain narration about the riots in France tonight.")), ...S("As I record this, nothing has changed.")];
  assert.equal(metaInHook(late).length, 0, "after ~60 s it is allowed");
});

test("lint: production notes leaking into narration are found and cut", () => {
  const sc = S("The human cost line belongs here.", "Then the city hall burned. It should not be illustrated as a battle.", "Budgets were cut to 2% in 2019.");
  assert.deepEqual(instructionLeaks(sc).map((x) => x.scene), [0, 1]);
  assert.equal(stripLeakSentences(sc), 2);
  assert.equal(sc[0].say, "");
  assert.equal(sc[1].say, "Then the city hall burned.");
  assert.equal(sc[2].say, "Budgets were cut to 2% in 2019.");
});

test("lint: unit conversions are checked both ways (536's °C → 34.8 °F)", () => {
  const bad = unitErrors(S("It reached 40 degrees Celsius, or about 34.8 degrees Fahrenheit."));
  assert.equal(bad.length, 1);
  assert.equal(bad[0].expected, 104);
  assert.equal(unitErrors(S("Temperatures fell to minus 40 °C, or about -40 °F.", "The ship sailed 100 km (62 miles) east.", "a hundred kilometres, or about sixty miles.", "It is 3 miles from the border and 5 kilometres from the sea.")).length, 0);
});

test("lint: 'said four words: we lost control' is caught (it is three)", () => {
  const sc = S("It was an admission, four words long, from the man in charge.", "On Sunday he went on public radio and said four words: we lost control.");
  const c = countErrors(sc);
  assert.deepEqual(c.map((x) => [x.scene, x.said, x.actual]), [[0, 4, 3], [1, 4, 3]]);
  assert.equal(countErrors(S("He said three words: we lost control.")).length, 0);
});

test("lint: the ending returns to the opening; titles pay their claims", () => {
  const open = S("This is Paris on Saturday night.", "The Prime Minister called it a miracle.", "Police reported one death.", "a", "b", "c");
  assert.equal(closingCallback([...open, ...S("History teaches us.", "Change is constant.", "We must remember.")]).ok, false);
  assert.equal(closingCallback([...open, ...S("So was it a miracle?", "Saturday will tell.", "Paris is waiting.")]).ok, true);
  assert.deepEqual(unpaidTitleWords("China's Steel Replacement Just Failed — Engineers Are Calling It a Scam", S("The project failed in 2024.")), ["scam"]);
  assert.deepEqual(unpaidTitleWords("AirAsia Bankruptcy Explained", S("They went bankrupt.")), []);
  const kinds = scriptLint([...S("It reached 40 degrees Celsius, or about 34.8 degrees Fahrenheit."), ...S("said four words: we lost control.")]).map((x) => x.kind);
  assert.ok(kinds.includes("unit") && kinds.includes("count"));
});

test("son okuma: lint kinds exist; a unit fix may bring only the computed value", () => {
  for (const k of ["leak", "unit", "count", "callback", "meta"]) assert.ok(EDIT_KINDS.includes(k), k);
  const sc = S("It reached 40 degrees Celsius, or about 34.8 degrees Fahrenheit.", "Another line.");
  const ok = applyEditorEdits(sc, [{ scene: 0, action: "rewrite", kind: "unit", say: "It reached 40 degrees Celsius, or about 104 degrees Fahrenheit.", reason: "birim" }]);
  assert.equal(ok.applied.length, 1);
  const sc2 = S("It reached 40 degrees Celsius, or about 34.8 degrees Fahrenheit.", "Another line.");
  const no = applyEditorEdits(sc2, [{ scene: 0, action: "rewrite", kind: "unit", say: "It reached 40 degrees Celsius, or about 120 degrees Fahrenheit.", reason: "birim" }]);
  assert.equal(no.applied.length, 0);
});

test("package: a title whose claim the video never makes goes back for repair", () => {
  const ids = ["c1", "c2", "c3"];
  const plan = {
    titles: ["France Under Curfew: What Set It Off?", "France Riots: 550,000 Marched", "The Curfew Explained", "Paris Riots: A Cover-Up?", "We Lost Control"].map((text) => ({ text })),
    thumbnails: [{ hero: "c1", text: "PARIS UNDER CURFEW", layout: "a" }, { hero: "c2", text: "550,000 MARCHED", layout: "b" }, { hero: "c3", text: "2005 AGAIN?", layout: "c" }],
  };
  const scenes = S("Paris is under curfew after riots.", "We lost control, the minister said.");
  const e = P.planErrors(plan, { ids, scenes }).join(" | ");
  assert.match(e, /titles\[3\] "cover-up" videoda ödenmiyor/);
  assert.doesNotMatch(P.planErrors(plan, { ids }).join(" | "), /ödenmiyor/, "without the narration nothing is checked");
});

test("Shorts: a standalone story with the answer, no call to the full documentary", () => {
  const g = shortGrowthLines().join("\n");
  assert.match(g, /BAĞIMSIZ HİKÂYE/);
  assert.match(g, /CEVABI VERİR/);
  assert.match(g, /AÇILIŞ CÜMLESİNE DÖNER/);
  assert.ok(SHORT_SELL_LINE.test("Who drove it is still argued over; the full documentary separates fact from guesswork."));
  assert.ok(SHORT_SELL_LINE.test("The full story is on our channel."));
  assert.equal(SHORT_SELL_LINE.test("Ships crossed in the Channel at night."), false);
  assert.equal(dropSellBeats([{ say: "a" }, { say: "b" }, { say: "c" }, { say: "Link below for the long version." }]).length, 3);
  assert.equal(dropSellBeats([{ say: "a" }, { say: "Watch the full video." }], 3).length, 2, "never below the minimum");
});

test("pictures: a US photo never stands in for France; the picker sees the story and the line's mood", () => {
  const g = storyPlaceGroups("France Under Curfew Paris police, the US Embassy's advice, Lille, Belgium, Italy");
  assert.ok(foreignPlaceConflict(g, "A man stands on a burned out car in the Lake St area of Minneapolis, Minnesota"));
  assert.ok(foreignPlaceConflict(g, "Black Lives Matter protest march"));
  assert.equal(foreignPlaceConflict(g, "Paris riots, 17 October 2026 - Police line"), false);
  assert.equal(foreignPlaceConflict(storyPlaceGroups("How America bombed Iran"), "Minneapolis protest"), false);
  const truth = SCENE_TRUTH_LINES.join("\n");
  assert.match(truth, /POLICIA/);
  assert.match(truth, /kokteyl/);
});

test("topic bible: labels are cut at a word, a board stays on one moment", () => {
  assert.equal(wordCut("From a hot classroom to a burning city hall", 40), "From a hot classroom to a burning city");
  assert.equal(wordCut("eleven at night to six in the morning", 24), "eleven at night to six");
  assert.equal(wordCut("Supercalifragilistic", 8), "Supercalifragilistic");
  const steps = [24, 28, 40, 51, 57].map((scene) => ({ label: `s${scene}`, scene }));
  assert.deepEqual(keepExplainerWindow(steps).map((s) => s.scene), [24, 28], "the France board 24→57 stops inside its window");
  const near = [10, 10, 11, 12, 13].map((scene) => ({ label: `s${scene}`, scene }));
  assert.deepEqual(keepExplainerWindow(near).map((s) => s.scene), [10, 10, 11, 12, 13]);
  const callback = [58, 110, 163].map((scene) => ({ label: `decision ${scene}`, scene }));
  assert.equal(keepExplainerWindow(callback).length, 3, "a 3-step callback board may return across the video");
  assert.equal(EXPLAINER_SCENES, 5);
  assert.equal(EXPLAINER_SPAN, 6);
});

test("edit director: peak cards are counted; designed card surfaces are capped", () => {
  assert.equal(PEAK_CARDS_MIN, 3);
  assert.equal(peakCards([{ type: "bars" }, { type: "icons" }, { type: "map", places: [1, 2] }, { type: "map", places: [1, 2, 3] }, { type: "photo" }]), 3);
  assert.ok(DESIGNED_BACKDROPS.has("paper") && DESIGNED_BACKDROPS.has("texture"));
  assert.equal(DESIGNED_TEXT_MAX, 4);
});

test("sensitive topics: only real tragedies skip the ask; riots, war and political crises keep the trio", () => {
  assert.equal(sensitiveTopic("What Is Actually Happening in France Right Now? The Riots, the Curfews", "Do not say the cause, culprits or death toll are settled"), false);
  assert.equal(sensitiveTopic("The US vs. Iran War Explained", "victims and refugees"), false);
  assert.equal(sensitiveTopic("Police shooting sparks protests"), false);
  assert.ok(sensitiveTopic("The Ebola Outbreak in Congo"));
  assert.ok(sensitiveTopic("Panama's 7.7 Earthquake"));
  assert.ok(sensitiveTopic("A mass shooting in Texas"));
  assert.ok(sensitiveTopic("The terror attack in Nice"));
});

// 22 Ekim 2026 — Fransa izlenme eğrisinin dersleri: kancadan sonra arka plan bölümü (%45 → %30), zirveden sonra olgusuz yorum (%27 → %15).
test("news plan: no background chapter after the hook; one at most; it gets ~60-75 s", async () => {
  const { newsBackgroundErrors, budgetBackground, BACKGROUND_WORDS } = await import("../src/pipeline/docu-script.js");
  const ch = (bg) => bg.map((b) => ({ background: b }));
  assert.match(newsBackgroundErrors(ch([false, true, false, false])).join(" "), /chapters\[1\]/);
  assert.match(newsBackgroundErrors(ch([false, false, true, true, false])).join(" "), /en çok BİR/);
  assert.match(newsBackgroundErrors(ch([false, false, false, true])).join(" "), /son bölüm/);
  assert.deepEqual(newsBackgroundErrors(ch([false, false, true, false, false])), []);
  const plan = { chapterWords: [250, 250, 250, 250], chapterScenes: Array.from({ length: 4 }, () => [17, 23]) };
  const moved = budgetBackground(plan, ch([false, false, true, false]));
  assert.equal(moved, 250 - BACKGROUND_WORDS);
  assert.equal(plan.chapterWords[2], BACKGROUND_WORDS);
  assert.equal(plan.chapterWords.reduce((a, b) => a + b, 0), 1000, "total words kept");
  assert.ok(plan.chapterScenes[2][1] < 23 && plan.chapterScenes[0][1] === 23, "fewer scenes only in the background chapter");
});

test("writer: the minute after the peak is concrete; fact-free runs go to the editor with research numbers allowed", async () => {
  const { abstractRuns, concreteLine } = await import("../src/pipeline/docu-lint.js");
  assert.match(spineLines({ news: true }).join("\n"), /ZİRVEDEN SONRA SOMUT/);
  assert.equal(concreteLine("But the government's account of the violence is not the only one."), false);
  assert.equal(concreteLine("On Monday morning, the Élysée answered Nuñez."), true);
  assert.equal(concreteLine("Police had prepared for around 200,000 people."), true);
  const france = S("With a presidential election about six months away, that failure is political.", "But the government's account of the violence is not the only one.", "No independent evidence has been made public tying the destruction to the ultra-left.", "Others point to anger over living costs and public services.", "Rights groups have accused police of disproportionate force this autumn.", "The minister rejects that, saying the response was proportionate.", "On Monday evening, Paris police posted an order.");
  assert.deepEqual(abstractRuns(france), [{ from: 1, to: 5 }]);
  assert.ok(scriptLint(france).some((x) => x.kind === "abstract" && x.scene === 1));
  assert.ok(EDIT_KINDS.includes("abstract"));
  const research = "Interior Ministry: 2,300 detained; about 3,000 businesses damaged.";
  const ok = applyEditorEdits(S(...france.map((s) => s.say)), [{ scene: 3, action: "rewrite", kind: "abstract", say: "Others point to anger over living costs, and to about 3,000 damaged businesses.", reason: "olgu" }], { research });
  assert.equal(ok.applied.length, 1, JSON.stringify(ok.rejected));
  const no = applyEditorEdits(S(...france.map((s) => s.say)), [{ scene: 3, action: "rewrite", kind: "abstract", say: "Others point to anger over living costs, and to 4,700 damaged businesses.", reason: "uydurma" }], { research });
  assert.equal(no.applied.length, 0, "a number the research does not carry is refused");
});

// 22 Ekim 2026 — kanal sahibi: "hype da istenebilir… arada söylemeli ve animasyonu da gözükmeli".
test("hype: one short, always-true line about a third in; its scene gets the Hype button; never on a sensitive topic", async () => {
  const R = await import("../src/pipeline/docu-rhetoric.js");
  const plan = R.rhetoricPlan({ topic: "France Under Curfew", chapters: 8 });
  assert.equal(plan.hypeChapter, 3);
  const line = R.rhetoricLines(plan, 3, 8).join("\n");
  assert.match(line, /HYPE ÇAĞRISI \(videoda TEK KEZ/);
  assert.equal(R.rhetoricLines(plan, 2, 8).some((l) => /HYPE ÇAĞRISI/.test(l)), false);
  for (const a of R.HYPE_ASKS) {
    assert.ok(a.split(/\s+/).length <= R.HYPE_MAX_WORDS, a);
    assert.match(a, /\bHype\b/);
    assert.match(a, /first week/i, "true after the first week too");
  }
  const sens = R.rhetoricPlan({ topic: "Ebola outbreak", chapters: 8, sensitive: true });
  assert.equal(R.rhetoricLines(sens, 3, 8).some((l) => /HYPE ÇAĞRISI/.test(l)), false);
  const sc = [{ say: "Like, subscribe, and tell me in the comments." }, { say: "If you're watching this in its first week, tap Hype." }, { say: "Tell me in the comments below." }];
  R.markCtaScenes(sc);
  assert.deepEqual(sc.map((s) => s.cta), ["like", "hype", "comment"]);
});

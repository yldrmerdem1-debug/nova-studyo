// NEVER A SILENT OPENING (Saudi-Houthi Short, Oct 2026): the planned opening "In September: no. In October: we may."
// had two fragments, not three, and the whole opening — narration and slams — was dropped without a word; the Short
// began mid-story on "Riyadh's main airport". Now a non-three opening is kept as one beat, and the log says so.
import test from "node:test";
import assert from "node:assert/strict";
import { planPictureTeaser } from "../src/pipeline/docu-shorts-pictures.js";

const pic = (id, what) => ({ id, rel: `build/j/arch-${id}00000000000.jpg`, source: "real", what, quality: 4, kind: "still", textHeavy: false, srcW: 2000, srcH: 1400 });
const catalog = [pic("p1", "Saudia jets at King Khalid airport"), pic("p2", "Donald Trump portrait"), pic("p3", "The White House"), pic("p4", "Riyadh skyline"), pic("p5", "Pentagon aerial")];
const plan = (say) => async () => ({
  hook: "RIYADH",
  opening: { say, words: ["September", "October", "may"], pictures: ["p1", "p2", "p3"] },
  beats: [
    { say: "Riyadh's main airport was hit three times in five days.", picture: "p4", newPrompt: "", person: "", figure: "", figureWord: "" },
    { say: "One of them was an American citizen.", picture: "p3", newPrompt: "", person: "", figure: "", figureWord: "" },
    { say: "The full story is on the channel.", picture: "p5", newPrompt: "", person: "", figure: "", figureWord: "" },
  ],
  title: "t", description: "d", cover: ["NO", "WE MAY"],
});

test("a two-fragment opening stays as one spoken beat over its first picture, its last word slammed", async () => {
  const logs = [];
  const p = await planPictureTeaser({ cues: [{ t: "story" }], title: "Riyadh", catalog, llm: plan("In September: no. In October: we may."), logFn: (m) => logs.push(m) });
  assert.equal(p.beats[0].say, "In September: no. In October: we may.");
  assert.equal(p.beats[0].slam, "MAY");
  assert.equal(p.beats[0].asset.id, "p1");
  assert.equal(p.beats[1].say, "Riyadh's main airport was hit three times in five days.");
  assert.ok(logs.some((m) => /açılış üç parça değil \(2\)/.test(m)));
});

test("a three-fragment opening is still three slammed beats", async () => {
  const p = await planPictureTeaser({ cues: [{ t: "story" }], title: "Riyadh", catalog, llm: plan("One airport. Eight countries. And two words: we may.") });
  assert.deepEqual(p.beats.slice(0, 3).map((b) => b.slam), ["SEPTEMBER", "OCTOBER", "MAY"]);
  assert.equal(p.beats.length, 6);
});

test("the planner's REAL first picture stays; only stock, AI or none is swapped for an on-subject one", async () => {
  const { hookOnSubject } = await import("../src/pipeline/docu-shorts-pictures.js");
  const jets = { ...catalog[0], what: "Saudia jets at King Khalid airport" };
  const navy = { id: "p9", rel: "build/j/arch-p9.jpg", source: "real", what: "US Navy jet on a carrier", say: "Riyadh and Hurais were hit", quality: 5, kind: "still", srcH: 1400 };
  const beats = [{ say: "One airport.", asset: jets }, { say: "x.", asset: catalog[1] }];
  hookOnSubject(beats, [navy, jets], "The War That Just Reached Riyadh", 1);
  assert.equal(beats[0].asset.id, "p1", "the Saudia jets stay");
  const stock = [{ say: "One airport.", asset: { ...jets, source: "stock" } }];
  hookOnSubject(stock, [navy], "The War That Just Reached Riyadh", 1);
  assert.equal(stock[0].asset.id, "p9", "stock is still replaced by a real on-subject picture");
});

test("Shorts open with ONE clear sentence that names the story (Oct 2026 channel data: cryptic fragments lost ~40% in 12 s)", async () => {
  const fs = await import("node:fs");
  for (const f of ["../src/pipeline/docu-shorts.js", "../src/pipeline/docu-shorts-pictures.js"]) {
    const src = fs.readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /NEVER cryptic fragments/, f);
    assert.doesNotMatch(src, /Exactly three fragments/, f);
  }
  const { openingBeats } = await import("../src/pipeline/docu-shorts.js");
  const one = openingBeats({ say: "In 1066, England's king won the battle of his life, and nineteen days later he was dead.", words: ["nineteen"], lines: [4] });
  assert.equal(one.length, 1);
  assert.equal(one[0].slam, "NINETEEN");
  assert.equal(one[0].line, 4);
});

test("a second Short of the same video is told the earlier ones and must take a new angle; titles name the story plainly", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { earlierShorts } = await import("../src/pipeline/docu-shorts.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-"));
  fs.writeFileSync(path.join(dir, "short-202610120101.json"), JSON.stringify({ title: "Trump Said No", hook: "FROM NO", beats: [{ say: "In September, the answer was no." }] }));
  // 1.16.16: the earlier Short's hook pattern comes along (a new Short opens with another one); "" for older Shorts.
  assert.deepEqual(earlierShorts(dir), [{ title: "Trump Said No", hook: "FROM NO", opening: "In September, the answer was no.", pattern: "" }]);
  let prompt = "";
  const llm = async ({ user }) => { prompt = user; return { hook: "H", opening: { say: "Riyadh's airport was hit three times in five days.", words: ["three"], pictures: ["p1"] }, beats: [1, 2, 3].map((k) => ({ say: `Beat number ${k} of the story.`, picture: `p${k + 1}`, newPrompt: "", person: "", figure: "", figureWord: "" })), title: "t", description: "d", cover: [] }; };
  await planPictureTeaser({ cues: [{ t: "story" }], title: "Riyadh", catalog, previous: earlierShorts(dir), llm });
  assert.match(prompt, /DIFFERENT angle[\s\S]*Trump Said No/);
  assert.match(fs.readFileSync(new URL("../src/pipeline/docu-package.js", import.meta.url), "utf8"), /searchable name of the story/);
});

test("titles follow the niche outliers: famous name + one surprising concrete angle (Oct 2026 study of 30 channels)", async () => {
  const fs = await import("node:fs");
  assert.match(fs.readFileSync(new URL("../src/pipeline/docu-package.js", import.meta.url), "utf8"), /OUTLIERS IN OUR NICHES/);
  assert.match(fs.readFileSync(new URL("../src/pipeline/docu-shorts-pictures.js", import.meta.url), "utf8"), /FAMOUS name or place \+ ONE surprising concrete fact/);
});

test("growth lessons feed the writer's bible and the topic ideas: famous name + one surprising angle, real outliers per niche", async () => {
  const fs = await import("node:fs");
  const g = await import("../src/pipeline/growth-lessons.js");
  assert.equal(g.nicheOf({ format: "news" }), "news");
  assert.equal(g.nicheOf({ genre: "finance" }), "finance");
  assert.equal(g.nicheOf({ topic: "1066: The 19 Days" }), "history");
  assert.match(g.bibleGrowthLines("finance").join("\n"), /J\.P\. Morgan/);
  assert.match(g.ideaGrowthLines().join("\n"), /Mayflower[\s\S]*Greenland[\s\S]*Rockefeller/);
  assert.match(fs.readFileSync(new URL("../src/pipeline/docu-script.js", import.meta.url), "utf8"), /\.\.\.bibleGrowthLines\(nicheOf\(/);
  assert.match(fs.readFileSync(new URL("../server.js", import.meta.url), "utf8"), /ideaGrowthLines\(\)/);
});

test("transcript study of 38 outliers feeds the writer's opening (chapter 1 + bible) and both Shorts planners", async () => {
  const fs = await import("node:fs");
  const g = await import("../src/pipeline/growth-lessons.js");
  // 1.16.16: the question + promise window is 30-45 s (small-channel breakouts give a three-part promise there).
  assert.match(g.hookGrowthLines().join("\n"), /TEK SOMUT ŞEY[\s\S]*20 saniye[\s\S]*AÇILIŞ ÇİZELGESİ[\s\S]*tanıdık bir ölçüye/);
  // 1.16.19: the last line is the strongest result and loops back to the opening (deep study, Oct 2026).
  assert.match(g.shortGrowthLines().join("\n"), /So what happened\?[\s\S]*AÇILIŞ CÜMLESİNE DÖNER/);
  const ds = fs.readFileSync(new URL("../src/pipeline/docu-script.js", import.meta.url), "utf8");
  assert.match(ds, /\.\.\.\(first \? hookGrowthLines\(\{ news: !!plan\.news \}\) : \[\]\)/);
  assert.match(ds, /\.\.\.hookGrowthLines\(\{ news: !!plan\.news \}\),/);
  for (const f of ["docu-shorts.js", "docu-shorts-pictures.js"]) assert.match(fs.readFileSync(new URL(`../src/pipeline/${f}`, import.meta.url), "utf8"), /\.\.\.shortGrowthLines\(\),/);
});

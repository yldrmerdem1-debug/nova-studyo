// SESLE UYUM (Ekim 2026, kullanıcı): "heryere vuruculuğu kesip tam uyumlu editler koymamız lazım; sayılar anlatılıyor,
// ardışık o anda ekranda adamın dediği gibi sıralanmalı, dediği gitmeli, sesle uyumlu olmalı."
// 1) A line with several numbers shows them as a tally, each on its own spoken word; 2) bar items reveal in spoken
// order; 3) fewer slams, hits, shakes and flashes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tallyItems, spokenOf, spokenNumbers, cueIndexFrom } from "../docu-engine/src/infographics/timing.js";

const wt = (s, step = 0.4) => s.split(" ").map((w, k) => ({ word: w, t: +(k * step).toFixed(2) }));
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("a line with two or more numbers becomes a tally, each number with the words after it, on its own word", () => {
  assert.deepEqual(tallyItems(wt("By his count, 324 targets. 100 aircraft.")), [
    { t: 1.2, text: "324", label: "targets" },
    { t: 2, text: "100", label: "aircraft" },
  ]);
  const list = tallyItems(wt("Four Saudis. Two Bangladeshis. One each from Jordan, Palestine, Syria, Sudan and Egypt."));
  assert.deepEqual(list.map((x) => [x.text, x.label]), [["4", "Saudis"], ["2", "Bangladeshis"], ["1", "each from Jordan"]]);
  assert.ok(list[0].t < list[1].t && list[1].t < list[2].t, "in the order said");
});

test("years are dates, not a tally; one number stays a normal counter; a number that ends its sentence has no label", () => {
  assert.deepEqual(tallyItems(wt("In 2017 a missile flew toward King Khalid. In 2018 another.")), []);
  assert.deepEqual(tallyItems(wt("By his count, 324 high-value targets were struck.")), []);
  const brent = tallyItems(wt("Reuters put Brent at $109.29. The Hill, a 105.66 close."));
  assert.equal(brent[0].text, "$109.29");
  assert.equal(brent[0].label, "");
  assert.equal(brent[1].label, "close");
});

test("spoken numbers carry their end token, so a multiplier word stays in the printed number", () => {
  const sp = spokenOf(wt("About 2.4 million barrels and 300 ships."));
  const nums = spokenNumbers(sp);
  assert.equal(nums[0].e - nums[0].i, 2);
  assert.equal(tallyItems(wt("About 2.4 million barrels, and 300 ships."))[0].text, "2.4 million");
});

test("bar items are cued in spoken order: three items worth 1 land on three different 'one's", () => {
  const sp = spokenOf(wt("One from Jordan, one from Syria, one from Egypt."));
  const nums = spokenNumbers(sp);
  let from = 0;
  const ks = ["Jordan", "Syria", "Egypt"].map((label) => {
    const k = cueIndexFrom(sp, nums, { value: 1 }, from);
    from = k + 1;
    return k;
  });
  assert.deepEqual(ks, [0, 3, 6]);
  const timing = src("../docu-engine/src/infographics/timing.js");
  assert.match(timing, /cueIndexFrom\(sp, nums, \{ label: it\?\.label, value: it\?\.value \}, from\)/, "bars use the moving cursor");
  assert.match(src("../docu-engine/src/infographics/bars.tsx"), /said != null \? Math\.max\(plan\.lead, said - 4\)/, "a bar's label waits for its cue");
});

test("the engine renders a tally for such a counter, started on its first number, without a punch", () => {
  const scenes = src("../docu-engine/src/scenes.tsx");
  assert.match(scenes, /if \(tally\.length >= 2\) return <TallyCounter/);
  assert.match(scenes, /scene\.type === 'counter' && tallyItems\(.*\)\.length < 2/, "no counter punch for a tally");
  assert.match(src("../docu-engine/src/opening/timing.ts"), /if \(tally\.length >= 2\) return fr\(tally\[0\]\.t, fps\)/);
  assert.match(src("../docu-engine/src/Engine.tsx"), /\(d, w\) => <Counter \{\.\.\.common\} durFrames=\{d\} scene=\{s\} offset=\{w\} \/>/);
});

test("less pounding: slams every ~3 min 90 s apart, story hits 20 s apart, impacts halved, loud fx caps halved, one optional punch device per chapter", async () => {
  const { SLAM_EVERY_MIN, SLAM_GAP_SEC } = await import("../src/pipeline/docu-script.js");
  assert.equal(SLAM_EVERY_MIN, 3);
  assert.equal(SLAM_GAP_SEC, 90);
  assert.match(src("../docu-engine/src/timeline.js"), /storyHitGap: 20/);
  assert.match(src("../docu-engine/src/Engine.tsx"), /export const IMPACT_SCALE = 0\.5;/);
  assert.match(src("../docu-engine/lib/edit-grammar.mjs"), /grave: \{ 'flash-frame': 2, shake: 1/);
  const { rhetoricPlan, rhetoricLines } = await import("../src/pipeline/docu-rhetoric.js");
  const plan = rhetoricPlan({ topic: "x", chapters: 6 });
  assert.ok(plan.perChapter.every((p) => p.length <= 1));
  assert.match(rhetoricLines(plan, 0, 6).join("\n"), /EN FAZLA BİR KEZ/);
});

test("one figure with a detail is not a tally: the numbers must sit in separate clauses", () => {
  assert.deepEqual(tallyItems(wt("Two hundred thousand dollars in twenty dollar bills.")), []);
  assert.equal(tallyItems(wt("324 targets. 100 aircraft.")).length, 2);
});

test("El Niño line: a date and a name's number are not a tally, and a tally needs the scene's own number", () => {
  const line = wt("On 9 October, AFP cited Copernicus: a September Niño 3.4 average of 29.70 degrees.");
  assert.deepEqual(tallyItems(line, { to: 29.7 }), [], "falls back to the normal 29.7 counter");
  const iom = tallyItems(wt("The IOM appealed for 110 million dollars, to protect 4.9 million people."), { to: 4.9 });
  assert.deepEqual(iom.map((x) => [x.text, x.label]), [["110 million", "dollars"], ["4.9 million", "people"]]);
  assert.deepEqual(tallyItems(wt("324 targets. 100 aircraft."), { to: 7 }), [], "the scene's number is not in the list");
  assert.equal(tallyItems(wt("Boeing 737 jets. 40 of them, grounded.")).length, 0, "a model number is part of a name");
});

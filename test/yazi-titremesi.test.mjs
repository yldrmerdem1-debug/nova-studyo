// Shorts text flicker (Bakker Short, Oct 2026; user: "yazılarda bir bozukluk var, bir şey geliyor hızlıca
// kayboluyor"): segments were trimmed in seconds so the cuts drifted against the ASS times; "FOREVER" showed a
// frame over the corridor, a frame over "NIGHTS" and faded over the next picture; the hook label popped in from
// 125 % and libass wrapped it on two lines for 4 frames before it snapped to one.
import test from "node:test";
import assert from "node:assert/strict";
import { frameGrid, gridCuts } from "../src/pipeline/docu-shorts-pictures.js";
import { fixedLines, snapSlams } from "../src/pipeline/docu-shorts.js";

test("frame grid: every cut lands on round(start·30) of the running total, the total is kept", () => {
  const durs = [1.234, 1.171, 0.913, 3.517, 2.2];
  const g = frameGrid(durs.map((dur) => ({ dur })));
  let t = 0;
  let f = 0;
  g.forEach((x, k) => {
    t += durs[k];
    f += x.frames;
    assert.ok(Number.isInteger(x.frames));
    assert.equal(f, Math.round(t * 30), `cut ${k} on the grid`);
    assert.equal(x.dur, x.frames / 30);
  });
  assert.deepEqual(gridCuts(durs.map((dur) => ({ dur }))).map((c) => Math.round(c * 30)), [0, 37, 72, 100, 205, 271]);
});

test("frame grid: a punch-in split inside a beat leaves the beat cuts where they were", () => {
  const whole = gridCuts([{ dur: 1.17 }, { dur: 3.6 }, { dur: 1.4 }]);
  const split = gridCuts([{ dur: 1.17 }, { dur: 1.98 }, { dur: 1.62 }, { dur: 1.4 }]);
  assert.equal(split[1], whole[1]);
  assert.equal(split[3], whole[2]);
  assert.equal(split[4], whole[3]);
});

test("slams stay inside their own picture: no lead over the previous one, no overlap, no fade over the next", () => {
  // Bakker: "One thousand dollars. Three nights a year. Forever." — FOREVER is the first word of its beat.
  const cuts = gridCuts([{ dur: 1.62 }, { dur: 1.45 }, { dur: 1.03 }, { dur: 4.2 }]);
  const raw = [
    { text: "THOUSAND", s: 0.31, e: 1.62, beat: 0 },
    { text: "NIGHTS", s: 2.38, e: 3.07, beat: 1 },
    { text: "FOREVER", s: 3.03, e: 4.1, beat: 2 },
  ];
  const out = snapSlams(raw, cuts);
  const half = 0.5 / 30;
  out.forEach((m, k) => {
    assert.ok(m.s >= cuts[m.beat] - half - 1e-9, `${m.text} starts on its own picture`);
    assert.ok(m.e <= cuts[m.beat + 1] - half + 1e-9, `${m.text} is gone before the next picture`);
    if (k) assert.ok(m.s >= out[k - 1].e, `${m.text} never on top of ${out[k - 1].text}`);
  });
  assert.equal(out[0].s, 0.31, "a slam said later in its beat keeps its spoken time");
  // Every frame on the 30 fps grid: the frame at a cut shows the new slam, the frame before shows the old one.
  const at = (t) => out.filter((m) => m.s <= t && t < m.e).map((m) => m.text);
  assert.deepEqual(at(cuts[2]), ["FOREVER"]);
  assert.deepEqual(at(cuts[2] - 1 / 30), ["NIGHTS"]);
  assert.deepEqual(at(cuts[3]), []);
});

test("fixed lines: popping text is broken by hand so the scale-in cannot re-wrap it", () => {
  assert.equal(fixedLines("FULL DOCUMENTARY ON THE CHANNEL", 18), "FULL DOCUMENTARY\\NON THE CHANNEL");
  assert.equal(fixedLines("60 OXEN", 12), "60 OXEN");
  assert.equal(fixedLines("$158 MILLION DOLLARS", 12), "$158 MILLION\\NDOLLARS");
});

test("a slam over a face drops to the lower third; over a corridor it stays mid-frame", async () => {
  const { buildTeaserAss, lowOverFaces } = await import("../src/pipeline/docu-shorts.js");
  const slams = lowOverFaces(
    [{ text: "NIGHTS", s: 1, e: 2, beat: 0 }, { text: "FOREVER", s: 2, e: 3, beat: 1 }],
    [{ what: "A long warm hotel corridor" }, { what: "Colour photo of Tammy Faye Bakker smiling" }],
    [{}, {}],
  );
  assert.deepEqual(slams.map((m) => !!m.low), [false, true]);
  const words = [{ w: "Nights.", s: 1, e: 1.5, at: 0 }, { w: "Forever.", s: 2, e: 2.6, at: 8 }];
  const ass = buildTeaserAss({ words, slams, voiceEnd: 2.6, total: 4, endCard: "" });
  assert.ok(ass.includes("Slam,,0,0,0,,{\\an5\\pos(540,1402)}{"), "FOREVER in the lower third");
  assert.match(ass, /Slam,,0,0,0,,\{\\fscx[^}]*\}NIGHTS/);
});

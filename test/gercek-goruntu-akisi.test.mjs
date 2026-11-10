// GERÇEK GÖRÜNTÜ AKSIN (28 Ekim 2026, kanal sahibi: "koyduğun videolardaki videolar sanki çok hızlı geçiliyor… anlatım
// kısmına tam uyuyorsa 30 sn'likte koyulabilir… o kısımda geçiş hataları, duygu hataları var").
// Ölçülen: Husi–Suudi haberi (20261028-59b606) 12 klip, her biri yalnız kendi satırında 3,8-8 sn; 17 sn'lik klip 6 sn'de
// kesildi; kaynak klipler en çok 8 sn indiriliyordu. Ras Tanura klibinden başlık kartına "whip", Bloomberg klibine "match".
// Ağ, ffmpeg ve model YOK.
import test from "node:test";
import assert from "node:assert/strict";
import { holdFootage, footageHold, isCallToAction, newNamedThing, HOLD_LIMITS } from "../src/pipeline/footage-hold.js";
import { applySourcePicks, eventWindow, planSourceMoments, sourceCandidates, wantFor, withinShare } from "../src/pipeline/source-clips.js";
import { longHolds } from "../src/pipeline/docu-archive.js";
import { applyEditGrammar } from "../docu-engine/lib/edit-grammar.mjs";

const clip = (o = {}) => ({ type: "photo", chapter: 3, mood: "tension", dur: 6, say: "A fire was reported near Ras Tanura on the Gulf coast.", source: "archive", video: "build/x/clip-1.mp4", videoStart: 0, videoDur: 20, archived: true, image: "build/x/clip-1.jpg", ...o });
const line = (say, o = {}) => ({ type: "photo", chapter: 3, mood: "tension", dur: 5, say, imagePrompt: "Wide shot of smoke over storage tanks at night", ...o });
// Önce 30 sn'lik bir açılış: tutma kancada değil.
const lead = { type: "photo", chapter: 2, mood: "curious", dur: 30, say: "Long before the strike, the terminal was quiet.", imagePrompt: "x" };

test("the footage keeps playing under the next plain lines of the same moment, up to its length", () => {
  const script = { scenes: [lead, clip(), line("The fire burned for hours on the coast."), line("Smoke rose over the tanks all night."), line("Nobody inside said a word.")] };
  const logs = [];
  const r = holdFootage(script, { logFn: (m) => logs.push(m) });
  assert.deepEqual(r.held.map((h) => h.lines), [[2, 3]], logs.join("\n"));
  for (const j of [2, 3]) {
    const s = r.script.scenes[j];
    assert.equal(s.bg, "prev");
    assert.equal(s.imagePrompt, undefined, "no AI picture of its own");
    assert.equal(s.heldFootage, 1);
    assert.equal(s.transition, "cut");
  }
  assert.ok(r.held[0].sec <= 20.5, "never longer than the footage in hand");
  assert.ok(r.script.scenes[4].imagePrompt, "past the footage the line keeps its own picture");
  assert.ok(logs.some((m) => /Gerçek görüntü sürüyor: sahne 2/.test(m)));
});

test("it stops at a real photo, a name card, a call to action, a new chapter, a mood flip or a new named thing", () => {
  const stop = (n) => footageHold([lead, clip(), n], 1).lines.length;
  assert.equal(stop(line("The fire burned on.", { archived: true, image: "build/x/arch.jpg" })), 0, "its own real photo");
  assert.equal(stop(line("The fire burned on.", { name: "Turki al-Maliki" })), 0, "a name card");
  assert.equal(stop(line("Watching in its first week? A Hype from you helps this reach new viewers.")), 0, "call to action");
  assert.equal(stop(line("The fire burned on.", { chapter: 4 })), 0, "new chapter");
  assert.equal(stop(line("The fire burned on.", { mood: "triumph" })), 0, "dark to light");
  assert.equal(stop(line("The fire burned on.", { mood: "reveal" })), 1, "neutral sits with either side");
  assert.equal(stop(line("That same day, the US State Department ordered staff to leave.")), 0, "a new named thing needs its own picture");
  assert.equal(stop(line("On 21 October, debris killed two workers.")), 0, "a new date");
  assert.equal(stop({ type: "map", chapter: 3, dur: 5, say: "The fire burned on." }), 0, "a device draws its own picture");
});

test("the source planner's span decides the content; the structure rules still hold", () => {
  const scenes = [lead, clip({ holdSpan: 2 }), line("Saudi Aramco said crews were working."), line("Riyadh gave no figure."), line("Smoke rose again.")];
  const r = holdFootage({ scenes });
  assert.deepEqual(r.held[0].lines, [2, 3], "span 2: two lines held even though they name Aramco and Riyadh");
  assert.equal(r.script.scenes[1].holdSpan, undefined, "the planner's mark is not left on the scene");
  assert.equal(footageHold([lead, clip(), line("Then Egypt joined.", { cta: "hype" })], 1, { span: 3 }).lines.length, 0, "never across a call to action");
});

test("in the hook a clip holds at most 8 seconds; anywhere else at most 30", () => {
  const scenes = [clip({ chapter: 0, dur: 4, videoDur: 40 }), line("The fire burned for hours.", { chapter: 0, dur: 3 }), line("Smoke rose over the tanks.", { chapter: 0, dur: 3 })];
  const r = footageHold(scenes, 0, { avail: 40, startSec: 0 });
  assert.ok(r.sec <= HOLD_LIMITS.hookMaxSec, `hook hold ${r.sec}`);
  const long = [lead, clip({ dur: 8, videoDur: 60 }), ...Array.from({ length: 6 }, () => line("The fire burned on and on.", { dur: 6 }))];
  assert.ok(footageHold(long, 1, { avail: 60, startSec: 30 }).sec <= HOLD_LIMITS.maxSec);
});

test("whip, flash and match into or out of real footage become a cut; dip-color stays", () => {
  const scenes = [lead, clip({ transition: "whip" }), { type: "title", chapter: 3, dur: 3, say: "Then came the answer.", transition: "match" }, { type: "photo", chapter: 4, dur: 4, say: "A new chapter.", transition: "dip-color", imagePrompt: "y" }];
  const r = holdFootage({ scenes });
  assert.equal(r.script.scenes[1].transition, "cut", "into the footage");
  assert.equal(r.script.scenes[2].transition, "cut", "out of the footage");
  assert.equal(r.script.scenes[3].transition, "dip-color", "not next to footage");
  assert.equal(r.edges, 2);
});

test("the engine's edit grammar keeps only cut/blackout/dip-color next to real footage", () => {
  const script = { scenes: [
    { type: "photo", chapter: 0, mood: "tension", dur: 4, say: "This is Ras Tanura.", video: "build/x/src-1.mp4", sourceLabel: "Video: X · 2026", archived: true },
    { type: "title", chapter: 0, mood: "tension", dur: 4, say: "Yemen's Houthis said a missile hit it.", transition: "whip" },
    { type: "photo", chapter: 0, mood: "tension", dur: 4, say: "Smoke rose.", heldFootage: 0, transition: "flash" },
  ] };
  applyEditGrammar(script, { gravity: "open" });
  assert.equal(script.scenes[1].transition, "cut");
  assert.equal(script.scenes[2].transition, "cut");
});

test("a long source moment is downloaded long enough for its held lines", () => {
  const scenes = [lead, clip({ video: undefined, videoDur: undefined, archived: false, image: undefined, imagePrompt: "z" }), line("The fire burned for hours on the coast.", { dur: 7 }), line("Smoke rose over the tanks all night.", { dur: 7 })];
  const m = { scene: 1, kind: "event", span: 2 };
  const want = wantFor(scenes, m);
  assert.ok(want >= 19 && want <= HOLD_LIMITS.maxSec, `want ${want}`);
  assert.equal(wantFor(scenes, { scene: 1, kind: "event" }), 6, "without a span: the line's own length");
  const win = eventWindow({ duration: 120 }, { want, cap: HOLD_LIMITS.maxSec });
  assert.ok(win.end - win.start >= 19, JSON.stringify(win));
  const short = eventWindow({ duration: 120 }, { want });
  assert.ok(Math.abs(short.end - short.start - 8) < 0.02, "the old 8 s cap without a hold");
  // Pay: uzun an kendi uzunluğuyla yer.
  const picked = withinShare([{ scene: 1, want: 30 }, { scene: 5, want: 30 }, { scene: 9 }], 200, 6, {});
  assert.deepEqual(picked.map((m) => m.scene), [1, 9], "a 200 s video at 18% (36 s) has room for one 30 s moment and one short one");
});

test("the planner is asked for the span, a call to action is no candidate, and the pick carries the span", async () => {
  const script = { title: "T", scenes: [lead, line("A fire was reported near Ras Tanura."), line("Smoke rose all night."), { type: "photo", chapter: 3, dur: 4, say: "If you're watching this in its first week, tap Hype.", imagePrompt: "q" }] };
  assert.ok(!sourceCandidates(script).some(({ i }) => i === 3), "call to action is not a footage candidate");
  let asked = "";
  const llm = async ({ user, schema }) => {
    asked = user;
    assert.ok(schema.properties.moments.items.required.includes("span"));
    return { moments: [{ scene: 1, kind: "event", query: "Ras Tanura fire", who: "", quote: "", why: "", year: 2026, span: 9 }] };
  };
  const out = await planSourceMoments(script, { llm });
  assert.match(asked, /span \(event\)/);
  assert.equal(out[0].span, HOLD_LIMITS.maxLines, "clamped");
  const { script: s2 } = applySourcePicks(script, {}, [{ scene: 1, kind: "event", video: "build/x/src-a.mp4", dur: 18, w: 1280, h: 720, label: "Video: X · 2026", span: 1, url: "https://www.youtube.com/watch?v=abcdefghijk", title: "t", channel: "c" }], {});
  assert.equal(s2.scenes[1].holdSpan, 1);
  assert.ok(isCallToAction({ say: "Tell me in the comments which one you think." }));
  assert.equal(newNamedThing("The fire burned on.", "A fire was reported"), null);
});

test("a run of held footage is not reported as a long-held picture", () => {
  const scenes = [clip({ dur: 8 }), { type: "photo", dur: 8, bg: "prev", say: "a" }, { type: "photo", dur: 8, bg: "prev", say: "b" }];
  assert.equal(longHolds(scenes).length, 0);
  const still = [{ type: "photo", dur: 8, image: "build/x/a.jpg", say: "a" }, { type: "photo", dur: 8, bg: "prev", say: "b" }, { type: "photo", dur: 8, bg: "prev", say: "c" }];
  assert.equal(longHolds(still).length, 1, "a still is");
});

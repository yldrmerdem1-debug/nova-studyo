// UZUN VİDEO ELEŞTİRMENİ (Ekim 2026, kanal sahibi: "Nova benden iyi çıkarmalı — uzun video önemli").
// Zaman çizelgesi katmanı (docu-critic.js), izleyici verisine göre örnekleme (docu-qa.js retentionTimes),
// uzun bekleyen kareye ara plan (docu-engine/lib/inserts.mjs) ve Opus yazar/seçici varsayılanları.
import test from "node:test";
import assert from "node:assert/strict";
import { critiqueTimeline, stillShots } from "../src/pipeline/docu-critic.js";
import { retentionTimes, sceneRows, QA_MODEL, QA_KINDS } from "../src/pipeline/docu-qa.js";
import { docuWriters } from "../src/pipeline/docu.js";

const at = (secs) => {
  let f = 0;
  return secs.map((s) => {
    const p = { from: f, frames: Math.round(s * 30) };
    f += p.frames;
    return p;
  });
};

test("timeline critic: short video, slow hook, AI opener, long chained hold, CTA twice, text flash, end-screen card", () => {
  const scenes = [
    { type: "photo", image: "build/j/img-1.jpg", source: "ai", say: "Opening." }, // 7 s still in the hook, AI opener
    { type: "photo", image: "build/j/cm-1.jpg", archived: true, say: "The real man.", inserts: [{ at: 2 }] }, // 6 s, cut at 2 s
    { type: "words", text: "BOOM", say: "Boom." }, // 0.5 s text flash
    { type: "photo", video: "build/j/clip-1.mp4", image: "build/j/clip-1.jpg", source: "stock", say: "Footage moves." }, // 20 s clip
    { type: "photo", image: "build/j/cm-2.jpg", archived: true, say: "A long calm line.", cta: "like" },
    { type: "words", bg: "prev", say: "Still the same picture.", cta: "like" },
    { type: "words", bg: "prev", say: "And again." },
    { type: "title", chapterCard: true, title: "Chapter 2" },
    { type: "stat", say: "Ninety percent." },
  ];
  const placed = at([7, 6, 0.5, 20, 8, 6, 5, 3, 10]);
  const issues = critiqueTimeline({ scenes }, placed);
  const kinds = issues.map((x) => x.kind);
  assert.ok(kinds.includes("too_short"));
  assert.equal(issues.find((x) => x.kind === "too_short").severity, "high");
  const slow = issues.filter((x) => x.kind === "hook_slow");
  assert.deepEqual(slow.map((x) => x.scene), [0], "the 7 s still is slow; the 6 s photo cut at 2 s is not");
  assert.ok(issues.some((x) => x.kind === "hook_not_real" && x.scene === 0));
  const hold = issues.find((x) => x.kind === "long_hold");
  assert.ok(hold && /19 sn/.test(hold.detail), JSON.stringify(hold));
  assert.ok(issues.some((x) => x.kind === "cta" && /2 kez/.test(x.detail)));
  assert.ok(issues.some((x) => x.kind === "cta" && /yorum sorusu yok/.test(x.detail)));
  assert.ok(issues.some((x) => x.kind === "text_flash" && x.scene === 2));
  assert.ok(issues.some((x) => x.kind === "end_screen" && x.scene === 7), JSON.stringify(issues.filter((x) => x.kind === "end_screen")));
  for (const x of issues) for (const k of ["scene", "time", "kind", "severity", "detail", "fix", "source"]) assert.ok(k in x, k);
});

test("timeline critic: a clean 12-minute film with one like/subscribe/comment trio right after the hook and a closing question raises nothing", () => {
  const scenes = [];
  const secs = [];
  for (let i = 0; i < 180; i++) {
    scenes.push({ type: "photo", image: `build/j/cm-${i}.jpg`, archived: true, say: `Line ${i}.`, ...(i === 6 ? { cta: "like" } : {}), ...(i === 175 ? { cta: "comment" } : {}) });
    secs.push(4);
  }
  assert.deepEqual(critiqueTimeline({ scenes }, at(secs)), []);
});

test("still shots: footage and cards break a shot, held-background lines extend it, inserts cut it", () => {
  const scenes = [
    { type: "photo", image: "a.jpg" },
    { type: "words", bg: "prev" },
    { type: "photo", video: "v.mp4", image: "v.jpg" },
    { type: "photo", image: "b.jpg", inserts: [{ at: 1 }, { at: 3 }] },
    { type: "stat" },
  ];
  const rows = sceneRows({ scenes }, at([4, 4, 5, 6, 3]));
  const sh = stillShots(rows);
  assert.deepEqual(sh.map((s) => s.sec), [8, 1, 2, 3]);
});

test("retention sampling: every second of the first minute, the first second of each chapter, the cap keeps the hook", () => {
  const scenes = [];
  const secs = [];
  for (let i = 0; i < 120; i++) {
    scenes.push(i % 30 === 29 ? { type: "title", chapterCard: true } : { type: "photo", image: `x${i}.jpg` });
    secs.push(6);
  }
  const rows = sceneRows({ scenes }, at(secs));
  const t = retentionTimes(rows, 720);
  const hook = t.filter((x) => x.t < 60);
  assert.ok(hook.length >= 55, `hook frames ${hook.length}`);
  assert.ok(t.some((x) => x.tag === "chapter" && Math.abs(x.t - (30 * 6 + 0.6)) < 0.01));
  for (let k = 1; k < t.length; k++) assert.ok(t[k].t - t[k - 1].t >= 0.5 - 1e-9);
  const capped = retentionTimes(rows, 720, { max: 100 });
  assert.equal(capped.length, 100);
  assert.ok(capped.filter((x) => x.t < 60).length >= 55, "the cap thins the rest, never the hook");
});

test("the critic's eye is Opus 5.5 and knows the new defects; the narration is written by Opus 5.5", () => {
  assert.equal(QA_MODEL, "claude-opus-5-5");
  for (const k of ["wrong_face", "generic", "text_on_face", "ai_look"]) assert.ok(QA_KINDS.includes(k), k);
  assert.equal(docuWriters({}).chapterModel, "claude-opus-5-5");
  assert.equal(docuWriters({ docuChapterModel: "claude-sonnet-5-5" }).chapterModel, "claude-sonnet-5-5", "the setting still wins");
});

test("a calm still line of 8 s or more gets a cutaway wherever it sits; a person's line never does", async () => {
  const I = await import("../docu-engine/lib/inserts.mjs");
  const wt = (n, step = 0.4) => Array.from({ length: n }, (_, k) => ({ word: k % 2 ? "harbour" : "quietly", t: +(k * step).toFixed(2) }));
  const filler = { type: "photo", dur: 120, say: "x" };
  const calm = { type: "photo", image: "c.jpg", imagePrompt: "A quiet harbour at night", energy: 3, say: "The harbour waited quietly through the long winter night.", voiceDur: 9, wordTimes: wt(22) };
  const person = { ...calm, name: "Someone" };
  const plan = I.planInserts({ scenes: [filler, calm, person] });
  assert.deepEqual(plan.map((p) => p.i), [1]);
  assert.equal(plan[0].at.length, 2, "a 9 s line gets two cutaways");
});

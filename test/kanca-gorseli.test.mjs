// THE HOOK PICTURE IS THE STORY (Bakker Short, Oct 2026): the Short opened on stock hands counting cash, a
// stock hotel corridor and an AI hotel tower; Bakker himself came on the fourth cut. User: "başa saçma sapan
// AI video gelince bir hissiyat tuhaf oluyor, tam konuyu dibinden vuracak görsel veya video olmalı".
import test from "node:test";
import assert from "node:assert/strict";
import { hookOnSubject, pictureSource, planPictureTeaser, shortCredits, subjectTopUp } from "../src/pipeline/docu-shorts-pictures.js";

const pic = (id, rel, source, what, extra = {}) => ({ id, rel, source, what, quality: 4, kind: "still", textHeavy: false, ...extra });
const money = pic("p1", "hand/clip-5466769.mp4", "stock", "Close-up of hands counting a thick stack of US dollar bills", { kind: "clip" });
const corridor = pic("p2", "hand/clip-15201618.mp4", "stock", "A long warm hotel corridor with rows of identical doors", { kind: "clip" });
const tower = pic("p3", "build/j/i2v-ef1edcdc37cc.mp4", "ai", "A grand hotel tower glowing gold at night above fountains (animated)", { kind: "clip", quality: 5 });
const young = pic("p4", "build/j/cm-1ad36afe4971.jpg", "real", "Black and white 1975 newspaper photo of young preacher Jim Bakker at a microphone with puppets");
const tammy = pic("p5", "build/j/cm-bd3aefd3580f.jpg", "real", "Colour photo of Tammy Faye Bakker smiling (2004)");
const tv = pic("c1", "build/j/cm-aaaaaaaaaaaa.jpg", "real", "Jim Bakker on his TV show set in 1977, smiling at the camera", { quality: 5 });
const stage = pic("c2", "build/j/cm-bbbbbbbbbbbb.jpg", "real", "Jim Bakker and Tammy Faye on the PTL Club stage, 1986");
const title = "Jim Bakker's $1,000 Promise";

test("picture source: AI stills and their motion clips, real Commons/archive/eyewitness, numbered stock clips", () => {
  assert.equal(pictureSource({ source: "stock" }, "build/j/img-0c453ef11f41.jpg"), "ai");
  assert.equal(pictureSource({ source: "ai" }, "build/j/i2v-ef1edcdc37cc.mp4"), "ai");
  assert.equal(pictureSource({ source: "ai" }, "build/j/cm-1ad36afe4971.jpg"), "real");
  assert.equal(pictureSource({}, "hand/clip-5466769.mp4"), "stock");
  assert.equal(pictureSource({ source: "stock" }, "hand/ew-road.mp4"), "real");
  assert.equal(pictureSource({ source: "stock" }, "build/j/clip-ab12cd34.mp4"), "stock");
  assert.equal(pictureSource({ source: "archive" }, "build/j/clip-ab12cd34.mp4"), "real");
  assert.equal(pictureSource({ source: "stock" }, "hand/real-pereira-full.mp4"), "real", "a real event clip placed by hand");
  assert.equal(pictureSource({}, "hand/cg-seismometer.jpg"), "ai", "a ChatGPT inbox still");
});

test("Bakker hook: the first picture becomes a real photo of Bakker, the AI tower in the opening too; stock that is not AI stays", () => {
  const beats = [
    { say: "One thousand dollars.", slam: "THOUSAND", asset: money },
    { say: "Three nights a year.", slam: "NIGHTS", asset: corridor },
    { say: "Forever.", slam: "FOREVER", asset: tower },
    { say: "TV preacher Jim Bakker sold that promise in 1984.", asset: young },
    { say: "His wife Tammy Faye sang.", asset: tammy },
  ];
  hookOnSubject(beats, [money, corridor, tower, young, tammy, tv, stage], title, 3);
  assert.equal(beats[0].asset.source, "real");
  assert.match(beats[0].asset.what, /Jim Bakker/);
  // An unused picture of him first (the 1977 TV still), the 1975 photo stays on its own beat.
  assert.equal(beats[0].asset.rel, tv.rel);
  assert.equal(beats[1].asset.rel, corridor.rel, "stock that is not AI is left to the planner");
  assert.equal(beats[2].asset.rel, stage.rel, "no AI clip in the opening while a real picture of the story is free");
  assert.equal(beats[3].asset.rel, young.rel);
  // Nothing real of the story left free: the AI picture stays rather than a doubled photo.
  const lean = [{ say: "a.", asset: money }, { say: "b.", asset: corridor }, { say: "c.", asset: tower }, { say: "d.", asset: young }];
  hookOnSubject(lean, [money, corridor, tower, young, tv], title, 3);
  assert.equal(lean[0].asset.rel, tv.rel);
  assert.equal(lean[2].asset.rel, tower.rel);
});

test("Bakker hook: with only the one portrait, it may open the Short and come back later, never on neighbouring beats", () => {
  const beats = [
    { say: "One thousand dollars.", asset: money },
    { say: "Three nights a year.", asset: corridor },
    { say: "Forever.", asset: corridor },
    { say: "TV preacher Jim Bakker sold that promise.", asset: young },
  ];
  hookOnSubject(beats, [money, corridor, young], title, 3);
  assert.equal(beats[0].asset.rel, young.rel);
  const two = [{ say: "A.", asset: money }, { say: "B.", asset: young }];
  hookOnSubject(two, [money, young], title, 3);
  assert.equal(two[0].asset.rel, money.rel, "the portrait is on the next beat: not doubled side by side");
});

test("a Short whose first picture already is the story is left alone; no subject in the title, nothing changes", () => {
  const beats = [{ say: "x.", asset: young }, { say: "y.", asset: money }];
  hookOnSubject(beats, [young, tv, money], title, 3);
  assert.equal(beats[0].asset.rel, young.rel);
  const plain = [{ say: "x.", asset: money }];
  hookOnSubject(plain, [young], "why it happened", 3);
  assert.equal(plain[0].asset.rel, money.rel);
});

test("planPictureTeaser applies the hook rule and tells the planner each picture's source", async () => {
  let prompt = "";
  const llm = async ({ user }) => {
    prompt = user;
    return {
      hook: "JIM BAKKER'S $1,000 PROMISE",
      opening: { say: "One thousand dollars. Three nights a year. Forever.", words: ["thousand", "nights", "Forever"], pictures: ["p1", "p2", "p3"] },
      beats: [
        { say: "TV preacher Jim Bakker sold that promise in 1984.", picture: "p4", newPrompt: "", person: "Jim Bakker", figure: "", figureWord: "" },
        { say: "His wife Tammy Faye cried on air for donations.", picture: "p5", newPrompt: "", person: "Tammy Faye Bakker", figure: "", figureWord: "" },
        { say: "The full story is on the channel.", picture: "c1", newPrompt: "", person: "", figure: "", figureWord: "" },
      ],
      title: "t",
      description: "d",
    };
  };
  const plan = await planPictureTeaser({ cues: [{ s: 0, e: 1, t: "Jim Bakker." }], title, catalog: [money, corridor, tower, young, tammy, tv], llm });
  assert.match(prompt, /p1 · footage · STOCK · /);
  assert.match(prompt, /p3 · footage · AI · /);
  assert.match(prompt, /p4 · still · REAL · /);
  assert.match(prompt, /THE HOOK PICTURE IS THE STORY/);
  assert.equal(plan.beats[0].asset.source, "real");
  assert.match(plan.beats[0].asset.what, /Jim Bakker/);
});

test("subject top-up: too few real pictures of the subject -> Commons files named after BOTH subject words, licence-checked", async () => {
  const asked = [];
  const deps = {
    fetchJson: async (url) => {
      asked.push(url);
      return { query: { search: [{ title: "File:Jim Bakker 1977.png" }, { title: "File:Jim Baker talks with Bill Brafford.jpg" }, { title: "File:Rev. Jim Bakker of Charlotte (1975).jpg" }, { title: "File:Jim Bakker sermon.ogv" }, { title: "File:HeritageUSASign.jpg" }] } };
    },
    commonsFile: async (t) => (/1977/.test(t) ? { file: "build/job-1/cm-111111111111.jpg", imgW: 1200, imgH: 900, credit: { eser: "Jim Bakker 1977.png", sahip: "PTL Network", lisans: "Public domain" } } : /1975/.test(t) ? { file: young.rel, credit: {} } : null),
  };
  const out = await subjectTopUp({ jobDir: "D:/x/job-1", title, assets: [money, young, tammy], deps });
  assert.match(decodeURIComponent(asked[0]), /srsearch=jim bakker/);
  assert.deepEqual(out.map((a) => a.rel), ["build/job-1/cm-111111111111.jpg"], "Baker (not Bakker), video files and the one already in the archive are skipped");
  assert.equal(out[0].source, "real");
  // Public domain needs no line; a CC BY photo (Tammy Faye, Darwin Bell) is credited in the Short.
  assert.equal(shortCredits(out), "");
  const tammyCc = { rel: "build/j/cm-4d6fb202c079.jpg", credit: { eser: "Tammy Faye Messner.jpg", sahip: "Darwin Bell", lisans: "CC BY 2.0" } };
  // No provider (a Commons top-up): Wikimedia Commons; the file name without ".jpg" (test/shorts-kunye).
  assert.equal(shortCredits([...out, tammyCc, tammyCc]), "Photos: Tammy Faye Messner, Darwin Bell, CC BY 2.0, Wikimedia Commons");
  // Enough real pictures of him already: no search at all.
  asked.length = 0;
  const many = [young, tv, { ...tv, rel: "x/cm-2.jpg" }];
  assert.deepEqual(await subjectTopUp({ jobDir: "D:/x/job-1", title, assets: many, deps }), []);
  assert.equal(asked.length, 0);
  // One subject word ("Panama") would bring any photo of a country: no search.
  assert.deepEqual(await subjectTopUp({ jobDir: "D:/x/job-1", title: "why panama shook", assets: [], deps }), []);
});

test("a real photo the vision step misses stays in the catalogue under its Commons name; others still drop out", async () => {
  const { describePictures } = await import("../src/pipeline/docu-shorts-pictures.js");
  const os = await import("node:os");
  const path = await import("node:path");
  const cacheFile = path.join(os.tmpdir(), `nova-kanca-${process.pid}.json`);
  const logs = [];
  const out = await describePictures({
    assets: [
      { rel: "build/j/cm-7622a53ab988.jpg", abs: "Z:/yok/a.jpg", kind: "still", source: "real", name: "Jim Bakker 1977" },
      { rel: "build/j/img-1.jpg", abs: "Z:/yok/b.jpg", kind: "still", source: "ai" },
    ],
    cacheFile,
    ffmpeg: "Z:/yok/ffmpeg.exe",
    llm: async () => {
      throw new Error("no vision");
    },
    logFn: (m) => logs.push(m),
  });
  assert.deepEqual(out.map((a) => a.what), ["Real photo: Jim Bakker 1977"]);
  assert.ok(logs.some((m) => /UYARI 1 görsel/.test(m)));
});

test("the hook never takes a real photo too small for a vertical frame (under 720 px it turns blotchy at 1920)", () => {
  const tiny = pic("c9", "build/j/cm-7622a53ab988.jpg", "real", "Real photo: Jim Bakker 1977", { srcH: 362, srcW: 466, quality: 5 });
  const sharp = { ...young, srcH: 1386, srcW: 1008 };
  const beats = [{ say: "One thousand dollars.", asset: money }, { say: "b.", asset: corridor }];
  hookOnSubject(beats, [money, corridor, tiny, sharp], title, 3);
  assert.equal(beats[0].asset.rel, sharp.rel);
});

test("period: a colour photo fits a 1987 story, not a 1929 one; modern/drone pictures never before 1990", async () => {
  const { periodFit } = await import("../src/pipeline/docu-shorts-pictures.js");
  const tammy2 = { what: "Colour photo of Tammy Faye Bakker smiling" };
  assert.equal(periodFit(tammy2, 1987), true);
  assert.equal(periodFit({ what: "modern color photo of the NYSE facade" }, 1929), false);
  assert.equal(periodFit({ what: "Colour photo of a trading floor" }, 1929), false);
  assert.equal(periodFit({ what: "drone footage of a plateau" }, 1987), false);
});

test("an eyewitness clip keeps its source label: the vertical crop starts at the top of the frame", async () => {
  const { eyewitnessBox } = await import("../src/pipeline/docu-shorts.js");
  const { verticalCrop } = await import("../src/pipeline/docu-shorts-pictures.js");
  assert.deepEqual(eyewitnessBox("hand/ew-road.mp4"), { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(eyewitnessBox("hand/clip-1.mp4"), null);
  assert.equal(verticalCrop(428, 854, eyewitnessBox("hand/ew-road.mp4")).y, 0);
});

test("over an eyewitness clip the top label moves below the clip's source label", async () => {
  const { buildTeaserAss, HOOK_BELOW_LABEL_Y } = await import("../src/pipeline/docu-shorts.js");
  const words = [{ w: "Roads.", s: 0.2, e: 0.6, at: 0 }, { w: "On", s: 1.2, e: 1.4, at: 7 }];
  const low = buildTeaserAss({ words, hook: "PANAMA'S 7.7 EARTHQUAKE", slams: [{ text: "ROADS", s: 0.2, e: 1, beat: 0 }], voiceEnd: 2, total: 4, endCard: "", hookY: HOOK_BELOW_LABEL_Y });
  assert.ok(low.includes(`Hook,,0,0,0,,{\\an8\\pos(540,${HOOK_BELOW_LABEL_Y})\\fad(160,250)}`));
  const plain = buildTeaserAss({ words, hook: "X", slams: [{ text: "ROADS", s: 0.2, e: 1, beat: 0 }], voiceEnd: 2, total: 4, endCard: "" });
  assert.ok(plain.includes("Hook,,0,0,0,,{\\fad(160,250)}X"));
});

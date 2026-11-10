// KAPANIŞ VE BİTİŞ EKRANI (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: job.log 18:37:13 ve 21:24:09 "+ sahne 159 [15:20] photo → stat": kurgu yönetmeni yazarın 13 sn'lik
//   kapanış fotoğrafını ("That 5% is the price of room.") bir "5%" kartına çevirdi; props'ta son sahne (165) 13 sn'lik
//   bir counter, qa.json sahne 158 (t=882.13) end_screen "Son 20 sn'de yazılı kart (counter)". finalizeScenes yazarın
//   ≥10 sn'lik son photo/words sahnesini kapanış SAYIYOR ama `outro` işaretini yalnızca kendi eklediği sahneye koyuyordu;
//   yönetmen yalnızca s.outro'yu koruyordu.
// Ağ YOK; satırlar işin kendi docu-script.json'ından.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kapanis-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const DS = await import("../src/pipeline/docu-script.js");
const D = await import("../src/pipeline/docu-edit-director.js");

const plan = DS.docuPlan({ durationPreset: "uzunformat", language: "en" });
const LAST = { type: "photo", chapter: 1, mood: "calm", say: "That 5% is the price of room.", dur: 13, imagePrompt: "Paris rooftops at dusk, still", voiceDur: 2.2 };
/** 28 five-second lines + the writer's own 13 s closing photo (sahne 158): ~153 s, the last 20 s from ~133 s. */
function script({ outro = true } = {}) {
  const scenes = Array.from({ length: 28 }, (_, i) => ({ type: "photo", chapter: i < 14 ? 0 : 1, mood: "curious", say: `Line ${i} of the story about the French budget.`, dur: 3, voiceDur: 4.6, imagePrompt: `shot ${i}` }));
  scenes[5] = { ...scenes[5], say: "Italy now pays less to borrow." };
  scenes[10] = { ...scenes[10], say: "About 200 emergency workers were sent up the mountain that night." };
  scenes[26] = { ...scenes[26], say: "[quietly] France isn't broke. It has simply run out of room, and every month of deadlock makes that room smaller." };
  scenes.push({ ...LAST, ...(outro ? { outro: true } : {}) });
  return { title: "France's Debt", locale: "en-US", chapters: ["A", "B"], scenes };
}

test("the writer's own long closing shot is marked as the closer (no second closing shot is pushed)", () => {
  const scenes = [
    { chapter: 0, type: "photo", mood: "curious", say: "[serious] Twelve months, three governments.", dur: 4, imagePrompt: "Matignon gate" },
    { chapter: 0, type: "photo", mood: "calm", say: "France isn't broke.", dur: 5, imagePrompt: "Paris" },
    { ...LAST, chapter: 0 },
  ];
  const notes = DS.finalizeScenes(scenes, { job: { language: "en", docuSource: "ai" }, plan });
  assert.equal(scenes.length, 3, "no extra scene");
  assert.equal(scenes.at(-1).outro, true);
  assert.equal(scenes.at(-1).say, LAST.say, "the closer keeps its line");
  assert.ok(!notes.some((n) => /kapanış sahnesi eklendi/.test(n)));
  // Unchanged: a short last line still gets the quiet closing shot appended (and only that one is the closer).
  const short = [{ chapter: 0, type: "photo", mood: "calm", say: "The end.", dur: 6, imagePrompt: "Paris" }];
  DS.finalizeScenes(short, { job: { language: "en", docuSource: "ai" }, plan });
  assert.equal(short.length, 2);
  assert.ok(!short[0].outro && short[1].outro && !short[1].say);
});

test("the edit director never turns the closer, or a scene under the end screen, into a card", () => {
  const stat = (scene) => ({ scene, device: "stat", priority: 1, reason: "x", value: "5%", label: "price of room" });
  const marked = D.applyPatches(script(), [stat(28)]);
  assert.equal(marked.accepted.length, 0);
  assert.equal(marked.rejected[0].why, "kapanış sahnesi");
  // An old docu-script.json (closer without the flag, like the France job's): the end-screen window still guards it.
  const old = D.applyPatches(script({ outro: false }), [stat(28), { ...stat(27), value: "5%", label: "room" }]);
  assert.equal(old.accepted.length, 0, JSON.stringify(old.rejected));
  assert.ok(old.rejected.every((r) => /bitiş ekranı \(son 20 sn\)/.test(r.why)), JSON.stringify(old.rejected));
  // Normal case: a number card well before the end is accepted as before.
  const mid = D.applyPatches(script(), [{ scene: 10, device: "stat", priority: 1, reason: "x", value: "200", label: "emergency workers" }]);
  assert.deepEqual(mid.accepted.map((a) => a.scene), [10], JSON.stringify(mid.rejected));
});

test("the map guarantee and the director's scene list keep the end-screen window too", () => {
  const s = script({ outro: false });
  const ends = D.sceneTimes(s);
  assert.ok(ends.starts[26] > ends.total - D.END_SCREEN_SEC - 5, "fixture: scene 26 ends under the end screen");
  const maps = D.ensureMaps(s);
  assert.deepEqual(maps.added.map((a) => a.scene), [5], `Italy at 0:25 is mapped, France under the end screen is not: ${JSON.stringify(maps.added)}`);
  const listing = D.sceneListing(s).split("\n");
  assert.match(listing[28], /dokunma/);
  assert.match(listing[27], /dokunma/);
  assert.doesNotMatch(listing[10], /dokunma/);
});

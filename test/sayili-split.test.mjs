// SAYILI SPLIT (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: job.log 18:36:13 (ve 21:24:09) beş "Senaryodaki split cihazı geçersiz" satırı — sahne 12 ve 98 "iki
//   tarafında da resim yok (fromScene)", 31, 131 ve 150 "etiket senaryoda yok". Beşi de yalnızca etiketli versus split:
//   sahne 11 left "France · 5.04%" / right "Italy · about 4.5%", yedek imagePrompt "Two trading screens..." — qa.json
//   sahne 11 (t=51.5, kanca) generic + ai_look. Yazar istemi (docu-script.js SAHNE DİLİ) ve şema fromScene'i isteğe bağlı
//   bırakıyordu, doğrulayıcı (docu-edit-director.js buildDevice) iki çıplak tarafı reddediyordu: sözleşme tutmuyordu.
// Ağ YOK; sahneler işin kendi docu-script.json'ından.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sayili-split-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const DS = await import("../src/pipeline/docu-script.js");
const D = await import("../src/pipeline/docu-edit-director.js");
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// docu-script.json sahne 9-13 ve 96-98 (sırası ve anlatımı aynen).
const fransa = () => ({
  title: "France's Debt", locale: "en-US",
  scenes: [
    { type: "photo", chapter: 0, say: "Put simply, the state owes more than everything France produces in a whole year.", dur: 5, imagePrompt: "French ministry facade" },
    { type: "photo", chapter: 0, say: "In 2011, France was a euro crisis rescuer.", dur: 4, imagePrompt: "Euro summit 2011" },
    { type: "split", chapter: 0, say: "Same currency, yet France now pays more than Italy and Greece.", left: { label: "France · 5.04%" }, right: { label: "Italy · about 4.5%" }, mode: "versus", dur: 5, imagePrompt: "Two trading screens side by side in a dark office, green numbers" },
    { type: "photo", chapter: 0, say: "And that pile isn't standing still.", dur: 3, imagePrompt: "stack of paper" },
    { type: "photo", chapter: 1, say: "That gap is called the spread, and it's the clearest way to read what lenders really think.", dur: 5, imagePrompt: "bond trader screens" },
    { type: "split", chapter: 1, say: "Germany paid about 3.32% for ten-year money, while France paid more than 5%.", left: { label: "GERMANY · ~3.32%" }, right: { label: "FRANCE · ~5%" }, mode: "versus", dur: 5, imagePrompt: "Two empty government building facades side by side under grey sky" },
    { type: "photo", chapter: 1, say: "A year earlier this looked calm: in 2025, France borrowed at about 3.4% on average.", dur: 5, imagePrompt: "Paris skyline" },
  ],
});

test("the writer's split contract matches the validator: at least one side needs fromScene, two numbers are not a split", () => {
  const src = read("src/pipeline/docu-script.js");
  const line = src.split("\n").find((l) => l.startsWith("- split:"));
  assert.match(line, /EN AZ BİR tarafta fromScene ŞART/, line);
  assert.match(line, /İki SAYININ kıyası split DEĞİLDİR/);
  for (const side of ["left", "right"]) assert.match(DS.SCENES_SCHEMA.properties.scenes.items.properties[side].properties.fromScene.description, /EN AZ BİRİNDE şart/);
  // ...and the validator still refuses two bare sides (the rule the prompt now states).
  assert.match(read("src/pipeline/docu-edit-director.js"), /if \(bare\.length > 1\) return bad\("bölünmüş ekranın iki tarafında da resim yok \(fromScene\)"\)/);
});

test("a bare split of two spoken numbers becomes a two-bar card; numbers nobody says still fall back to the photo", () => {
  const logs = [];
  const out = D.sanitizeDevices(fransa(), { logFn: (m) => logs.push(m) }).script.scenes;
  const bars = out[5];
  assert.equal(bars.type, "bars", logs.join("\n"));
  assert.deepEqual(bars.items, [{ label: "GERMANY", value: 3.32 }, { label: "FRANCE", value: 5 }]);
  assert.equal(bars.unit, "%");
  assert.ok(!bars.left && !bars.right && !bars.imagePrompt, "split and picture fields are dropped");
  assert.equal(bars.say, fransa().scenes[5].say, "the narration never changes");
  assert.ok(logs.some((m) => /sahne 6: .*— iki çubuklu bars kartına çevrildi/.test(m)), logs.join("\n"));
  // Hook scene 11: 5.04% and 4.5% are not said in the line or its neighbours — no invented figure on screen.
  assert.equal(out[2].type, "photo");
  assert.ok(logs.some((m) => /split cihazı geçersiz \(sahne 3: .*sahne sade görsele döndü/.test(m)), logs.join("\n"));
});

test("normal case: a split with a picture on one side stays a split; a numbered split with mixed units is not guessed", () => {
  const s = fransa();
  s.scenes[4] = { ...s.scenes[4], imagePrompt: "German finance ministry building in Berlin" };
  s.scenes[5] = { ...s.scenes[5], left: { label: "GERMANY · ~3.32%", fromScene: 4 } };
  const kept = D.sanitizeDevices(s).script.scenes[5];
  assert.equal(kept.type, "split");
  assert.equal(kept.left.fromScene, 4);
  const mixed = fransa();
  mixed.scenes[5] = { ...mixed.scenes[5], right: { label: "FRANCE · €5" } };
  assert.equal(D.sanitizeDevices(mixed).script.scenes[5].type, "photo");
});

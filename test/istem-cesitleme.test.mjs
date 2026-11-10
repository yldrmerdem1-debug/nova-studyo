// BENZER İSTEMİN ÇEŞİTLEMESİ (2009 denizaltı çarpışması 20261024-373aaf — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: log 05:47:54 "13 benzer görsel istemi çeşitlendirildi"; eklenen çekim istemin konusuna bakmadan sahne
//   sırasıyla (i % 6) seçiliyordu. engine-script.json sahne 154: "Wide underwater shot of two dark submarine silhouettes
//   far apart ..., extreme close-up detail of hands and objects"; sahne 64 (slam): "French ballistic missile submarine on
//   the surface near Brest ..., extreme close-up detail of hands and objects"; bir başkası "... different time of day:
//   night, practical lights" (su altında). Çelişkili istemler OpenAI'da üretiliyordu (16:28:51).
// Ağ YOK; istemler işin kendi docu-script.json'ından.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-istem-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const DS = await import("../src/pipeline/docu-script.js");

/** `prompts[k]` at scene index k (scenes without a picture in between keep the real positions). */
const at = (pairs) => {
  const scenes = Array.from({ length: Math.max(...pairs.map(([k]) => k)) + 1 }, () => ({ type: "slam", say: "x", bg: "prev" }));
  for (const [k, p] of pairs) scenes[k] = { type: "photo", say: "x", imagePrompt: p };
  return scenes;
};
const PEOPLE = /hands|over-the-shoulder|seen from behind/i;

test("a wide underwater shot never gets a close-up, hands or a time of day added", () => {
  const wide = "Wide underwater shot of two dark submarine silhouettes far apart in murky black water";
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const scenes = at([[0, wide], [k, wide.replace("black water", "blue-black water")]]);
    assert.equal(DS.varyDuplicatePrompts(scenes), 1, `position ${k}`);
    const p = scenes[k].imagePrompt;
    assert.ok(p.startsWith(wide.replace("black water", "blue-black water")), p);
    assert.doesNotMatch(p, PEOPLE, p);
    assert.doesNotMatch(p, /close-up/, p);
    assert.doesNotMatch(p, /time of day/, p);
  }
});

test("the Brest slam (scene 63, i % 6 = 3) no longer asks for hands on a submarine", () => {
  const brest = "French ballistic missile submarine on the surface near Brest, dark hull and tall sail, grey harbour water, overcast light";
  const scenes = at([[62, brest], [63, brest]]);
  assert.equal(DS.varyDuplicatePrompts(scenes), 1);
  assert.doesNotMatch(scenes[63].imagePrompt, PEOPLE, scenes[63].imagePrompt);
  assert.notEqual(scenes[63].imagePrompt, brest, "still varied: the same prompt would reuse the same cached still");
});

test("a close-up is not pushed out to a wide shot; a prompt with people keeps the old rotation", () => {
  const close = "Close-up of the dark sail of a British missile submarine against a stormy sky, rain streaking the steel";
  const c = at([[0, close], [4, close]]);
  DS.varyDuplicatePrompts(c);
  assert.doesNotMatch(c[4].imagePrompt, /wide/, c[4].imagePrompt);
  // Normal case: a person, no framing word, daytime — every variation fits, picked as before by the scene index.
  const crew = "Sailors in headsets leaning toward green-glowing consoles in a sonar compartment";
  const expect = ["different angle: high-angle wide shot", "different angle: low-angle close-up, shallow depth of field", "seen from behind, over-the-shoulder", "extreme close-up detail of hands and objects", "wide establishing shot from far away", "different time of day: bright morning daylight"];
  // 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, parlaklık 52-56): gün değişirse gündüze değişir, geceye değil.
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const s = at([[0, crew], [k, crew]]);
    DS.varyDuplicatePrompts(s);
    assert.equal(s[k].imagePrompt, `${crew}, ${expect[k % 6]}`);
  }
});

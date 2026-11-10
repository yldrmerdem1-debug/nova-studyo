// CANLANDIRMA KLİBİ (inceleme, 28 Ekim 2026): Gimli 20261028-9ff721'in kancası "Havacılık Kazaları" kanalının Mayday
// canlandırmasıyla açıldı (karede o programın Türkçe "Robert Pearson" isim kartı ve vesikalığı), sahne 110 da doğrudan
// "Mayday: Air Disaster" kanalındandı. İkisi de "Video: kanal · yıl" künyesiyle gerçek olay görüntüsü gibi durdu.
// Ağ, ffmpeg ve model YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DRAMATIZED, lookVerdict, rankSearch } from "../src/pipeline/source-clips.js";

const entry = (o) => ({ id: "abcdefghijk", duration: 300, title: "Gimli Glider Air Canada 143 landing", channel: "Plane Spotter", ...o });

test("docudrama channels and titles are no footage candidates", () => {
  const q = "Gimli Glider Air Canada 143 landing";
  assert.equal(rankSearch([entry({ channel: "Mayday: Air Disaster" })], q).length, 0, "the series' own channel");
  assert.equal(rankSearch([entry({ title: "Gimli Glider Air Canada 143 landing | Mayday" })], q).length, 0, "a reupload titled with the series");
  assert.equal(rankSearch([entry({ title: "Gimli Glider Air Canada 143 landing reconstruction" })], q).length, 0, "a reconstruction");
  assert.equal(rankSearch([entry({})], q).length, 1, "real footage still passes");
  for (const s of ["Air Crash Investigation", "National Geographic", "Smithsonian Channel", "Seconds From Disaster", "dramatized"]) assert.ok(DRAMATIZED.test(s), s);
  for (const s of ["Dave Pacer", "walkbyfeet", "Gimli Glider AC 604 landing in Vancouver", "Discovering Gimli"]) assert.ok(!DRAMATIZED.test(s), s);
});

test("the frame check rejects an acted reconstruction for the whole video", async () => {
  const jpg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "canl-")), "f.jpg");
  fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  let asked = null;
  const visionLlm = async ({ user, schema }) => {
    asked = { user, schema };
    return { fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: false, textCover: 4, aiMade: false, reenactment: true, why: "actor captain in a rebuilt cockpit with a name strap" };
  };
  const v = await lookVerdict({ jpgAbs: jpg, say: "This Boeing 767 left Montreal with a fuel sheet reading 22,300.", kind: "event", year: 1983 }, { visionLlm });
  assert.equal(v.ok, false);
  assert.equal(v.retry, false, "another moment of the same video is the same docudrama");
  assert.match(v.reason, /canlandırma/);
  assert.ok(asked.schema.required.includes("reenactment"), "the flag is required, a skipped field must not read as real");
  assert.match(asked.user, /reenactment=true/);
  assert.match(asked.user, /name strap with a portrait/);
  const real = await lookVerdict({ jpgAbs: jpg, say: "x", kind: "event" }, { visionLlm: async () => ({ fits: true, anchorOrStudio: false, agencyLabel: false, bigBakedText: false, graphic: false, textCover: 0, aiMade: false, reenactment: false, why: "" }) });
  assert.equal(real.ok, true);
});

// SAAT BİÇİMİ (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: job.log 23:36:22 ve job.json qualityWarnings: "Uzun kancasız aralık (yeni kanca her 60-90 sn): ~102 sn,
//   8:60 sonrası". docu-script.js clock saniyeyi dakikadan ayrı yuvarlıyordu (539,6 sn → "8:60"); aynı kalıp sanat
//   yönetmeninin sahne listesinde de vardı. Kullanıcının yeri bulmak için okuduğu uyarıda yanlış zaman.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-saat-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DS = await import("../src/pipeline/docu-script.js");
const A = await import("../src/pipeline/docu-art-director.js");

test("the writer's warning clock rounds to whole seconds first: 539.6 s is 9:00, never 8:60", () => {
  assert.equal(DS.clock(539.6), "9:00");
  assert.equal(DS.clock(59.5), "1:00");
  assert.equal(DS.clock(61.2), "1:01");
  assert.equal(DS.clock(0), "0:00");
});

test("the art director's scene list: a scene starting at 539.6 s reads 09:00", () => {
  const scenes = [
    { type: "photo", chapter: 0, mood: "curious", say: "One long line.", dur: 0, voiceDur: 539.2, imagePrompt: "x" },
    { type: "photo", chapter: 0, mood: "calm", say: "The next line.", dur: 0, voiceDur: 3, imagePrompt: "y" },
  ];
  const looks = A.loadCatalogs().looks.filter((l) => l.genres.includes("documentary"));
  const { user } = A.artPrompt({ title: "t", genre: "documentary", chapters: ["A"], scenes }, { looks, allowed: { textStyle: A.REGULAR_TEXT, transition: A.TRANSITIONS, grade: A.GRADES, fx: A.FX_KINDS, counterStyle: A.COUNTER_STYLES }, recent: [] });
  assert.match(user, /#1 \[ch1 09:00\]/);
  assert.doesNotMatch(user, /:60\b/);
});

test("no scene clock of the writer, the edit director or the art director rounds the seconds apart from the minutes", () => {
  const files = ["src/pipeline/docu-script.js", "src/pipeline/docu-edit-director.js", "src/pipeline/docu-art-director.js"];
  const bad = files.filter((f) => /Math\.round\(\s*\w+\s*%\s*60\s*\)/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(bad, []);
});

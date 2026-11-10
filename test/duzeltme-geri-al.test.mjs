// DÜZELTME GERİ ALINIR (Hastings, Ekim 2026): otomatik düzeltme turu 2 sahneyi yeniden seçmek için bitmiş arşiv
// geçişini (elle denetlenmiş 115 görsel) sildi; seçici 0 kredide hemen durdu ve çıkarken render parçaları da silindi.
// Başarısız tur artık işi tura girmeden önceki haline döndürür.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { restoreAfterFailedFix } from "../src/pipeline/docu.js";
import { invalidateArchivePicks } from "../src/pipeline/docu-qa.js";

test("a failed fix round writes back the archive pass, the pick cache and the fix record", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geri-al-"));
  const done = { key: "abc", script: { scenes: [{ say: "x", image: "build/a.jpg", archived: true }] }, credits: { "scene-0": { url: "u" } } };
  const cache = { k1: { file: "build/a.jpg", url: "u" } };
  fs.writeFileSync(path.join(dir, "docu-archive-done.json"), JSON.stringify(done));
  fs.writeFileSync(path.join(dir, "docu-archive.json"), JSON.stringify(cache));
  const keep = { "docu-archive-done.json": done, "docu-archive.json": cache, "docu-qa-fixes.json": null };
  // what the round does before the picker fails
  fs.rmSync(path.join(dir, "docu-archive-done.json"));
  fs.writeFileSync(path.join(dir, "docu-archive.json"), JSON.stringify({ "m-k1": { bad: { u: 1 } } }));
  fs.writeFileSync(path.join(dir, "docu-qa-fixes.json"), JSON.stringify({ round: 1 }));
  const back = restoreAfterFailedFix(dir, keep);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "docu-archive-done.json"), "utf8")), done);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "docu-archive.json"), "utf8")), cache);
  assert.equal(fs.existsSync(path.join(dir, "docu-qa-fixes.json")), false, "no fix record before → none after");
  assert.match(back, /docu-archive-done\.json/);
});

test("invalidateArchivePicks still drops the pass (the round needs a fresh one) — the restore is what brings it back", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "geri-al-"));
  fs.writeFileSync(path.join(dir, "docu-archive.json"), JSON.stringify({}));
  fs.writeFileSync(path.join(dir, "docu-archive-done.json"), JSON.stringify({ key: "k" }));
  invalidateArchivePicks(dir, { scenes: [] }, [0]);
  assert.equal(fs.existsSync(path.join(dir, "docu-archive-done.json")), false);
  restoreAfterFailedFix(dir, { "docu-archive-done.json": { key: "k" } });
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "docu-archive-done.json"), "utf8")).key, "k");
});

test("the failure path no longer drops the render chunks", () => {
  const src = fs.readFileSync(new URL("../src/pipeline/docu.js", import.meta.url), "utf8");
  const block = src.slice(src.indexOf("Otomatik düzeltme tamamlanamadı"), src.indexOf("Otomatik düzeltme tamamlanamadı") + 500);
  assert.ok(!/dropRenderChunks/.test(block.split("break;")[0]), block);
  assert.match(block, /restoreAfterFailedFix/);
});

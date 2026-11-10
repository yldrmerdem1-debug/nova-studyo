// BUGÜNÜN KONUSU, ARKA PLAN BÖLÜMÜ VE SÜRE YAZISI (docu.js).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası denetimi): docu.js "konu bu yılı ya da geçen yılı anıyor" denetimini
// new RegExp(`\b${y}\b`) ile yapıyordu; şablon dizgide `\b` geri silme karakteridir (U+0008), denetim hiç eşleşmedi.
// Haber işinde fark etmedi (docuFormat news zaten bugün); "October 2026" diyen haber dışı konu bugün sayılmıyordu.
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası 20261024-950730, haber): 7. bölüm 1952'yi anınca yılsız bütün satırları
// 1952 oldu ("The history itself was told elsewhere", "Nobody has said what survived"); dönem denetimi merkezin doğru
// fotoğrafını "modern cam bina" diye reddetti. docu-archive.js sceneEras planın arka plan bölümlerini artık alıyor, ama
// docu.js docu-bible.json'u ona vermedikçe düzeltme etkisizdi.
// ÖLÇÜLEN KUSUR (WP-F): süre yazısı Math.floor(sn / 60) + Math.round(sn % 60) idi; 59,6 sn "0 dk 60 sn" yazıyordu.
// Ağ YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-yil-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { mentionsThisYear, durationLabel } = await import("../src/pipeline/docu.js");
const { sceneEras, backgroundChapters } = await import("../src/pipeline/docu-archive.js");
const { readJson, writeJson } = await import("../src/util.js");
const d = fs.readFileSync(path.join(ROOT, "src", "pipeline", "docu.js"), "utf8");

test("a topic that names this year or last year is today's story; other years and longer numbers are not", () => {
  assert.equal(mentionsThisYear("Hitler's Eagle's Nest fire, October 2026", 2026), true);
  assert.equal(mentionsThisYear("France's debt: what changed in 2025", 2026), true);
  assert.equal(mentionsThisYear("The 1936 Olympics", 2026), false);
  assert.equal(mentionsThisYear("Order 120265 was signed", 2026), false, "a year inside a longer number");
  assert.equal(mentionsThisYear("", 2026), false);
  assert.ok(d.includes('const today = job.docuFormat === "news" || mentionsThisYear(`${job.topic || ""} ${job.guidance || ""}`, thisYear);'));
});

test("no RegExp built from a template literal with a single-backslash escape (it becomes a control character or a plain letter)", () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]));
  const bad = [];
  for (const root of ["src", path.join("docu-engine", "lib"), path.join("docu-engine", "bin"), path.join("docu-engine", "src")]) {
    if (!fs.existsSync(path.join(ROOT, root))) continue;
    for (const f of walk(path.join(ROOT, root)).filter((x) => /\.(m?js|tsx?)$/.test(x))) {
      fs.readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        if (/RegExp\(`[^`]*(?<!\\)\\[bdswBDSW]/.test(l)) bad.push(`${path.relative(ROOT, f)}:${i + 1}`);
      });
    }
  }
  assert.deepEqual(bad, []);
});

test("Kartal: docu.js hands the plan's background chapters to sceneEras — a yearless line outside the background chapter is today", () => {
  assert.ok(d.includes('const planBible = readJson(path.join(dir, "docu-bible.json"), null)?.value;'));
  assert.ok(d.includes("const withEras = sceneEras(docu, { news: today, now: thisYear, background: backgroundChapters(planBible, docu) });"));
  // docu-script.js scriptStore'un yazdığı biçim: { key, savedAt, value }.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yil-bible-"));
  writeJson(path.join(dir, "docu-bible.json"), { key: "k", savedAt: "2026-10-24T00:00:00Z", value: { chapters: [{ title: "Fire", background: false }, { title: "Memory", background: false }, { title: "Built 1938", background: true }] } });
  const docu = { title: "Eagle's Nest", chapters: ["Fire", "Memory", "Built 1938"], scenes: [
    { chapter: 0, type: "photo", say: "Nobody has said what survived." },
    { chapter: 1, type: "photo", say: "It opened to visitors in 1952." },
    { chapter: 1, type: "photo", say: "The history itself was told elsewhere." },
    { chapter: 2, type: "photo", say: "Bormann ordered it built in 1937." },
    { chapter: 2, type: "photo", say: "Workers blasted the road into the rock." },
  ] };
  // docu.js'nin satırlarıyla aynı.
  const planBible = readJson(path.join(dir, "docu-bible.json"), null)?.value;
  const out = sceneEras(docu, { news: true, now: 2026, background: backgroundChapters(planBible, docu) });
  assert.deepEqual(out.scenes.map((s) => s.era), ["2026", "1952", "2026", "1937", "1937"]);
});

test("duration text rounds first: 59.6 s is 1 dk 0 sn, not 0 dk 60 sn", () => {
  assert.equal(durationLabel(59.6), "1 dk 0 sn");
  assert.equal(durationLabel(767.4), "12 dk 47 sn");
  assert.equal(durationLabel(719.5), "12 dk 0 sn");
  assert.equal(durationLabel(undefined), "0 dk 0 sn");
  assert.doesNotMatch(d, /Math\.round\(durationSec % 60\)/);
  assert.ok(d.includes("Video hazır: ${durationLabel(durationSec)}") && d.includes("Video hedeften kısa: ${durationLabel(durationSec)}"));
});

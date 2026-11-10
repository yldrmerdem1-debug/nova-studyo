// COMMONS KATALOĞU — Yom Kippur videosunun yolu: konunun Commons arşivi taranır, senarist sahnelere
// GERÇEKTEN var olan, lisansı uygun, yüksek çözünürlüklü dosyaları adıyla seçer. Ağ yok: Commons sahte.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { catalogQueries, buildCommonsCatalog, catalogForChapter, catalogPromptBlock, commonsCatalogFor } from "../src/pipeline/docu-commons-catalog.js";

const research = `On October 6, 1973, Egypt and Syria attacked Israel. The Egyptian army crossed the Suez Canal and overran the Bar Lev Line.
On the Golan Heights, the 7th Armored Brigade fought in the Valley of Tears. Golda Meir met Moshe Dayan. Anwar Sadat expelled Soviet advisers.
The Bar Lev Line fell. Golda Meir resigned. The Suez Canal crossing. Anwar Sadat at Camp David. Golan Heights battles. Moshe Dayan.`;

const page = (title, w, h, lic = "Public domain", extra = {}) => ({
  title, index: 1,
  imageinfo: [{ width: w, height: h, mime: "image/jpeg", descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    extmetadata: { LicenseShortName: { value: lic }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" }, Artist: { value: "IDF Spokesperson" }, ImageDescription: { value: `<b>${title}</b> description` }, DateTimeOriginal: { value: "1973-10-08" }, ...extra } }],
});

test("sorgular: konu + araştırmada tekrar eden özel isimler, baştaki 'On the' atılır", () => {
  const q = catalogQueries({ topic: "Yom Kippur War", research });
  assert.equal(q[0], "Yom Kippur War");
  for (const want of ["Golan Heights", "Bar Lev Line", "Suez Canal", "Golda Meir", "Anwar Sadat", "Moshe Dayan"]) assert.ok(q.includes(want), want);
  assert.ok(!q.some((x) => /^(On|the)\b/.test(x)), q.join(" | "));
});

test("katalog: küçük, lisansı uygun olmayan, svg ve tekrar dosyalar girmez", async () => {
  const calls = [];
  const fetchJsonFn = async (url) => {
    calls.push(url);
    return { query: { pages: {
      1: page("File:Shot tanks in Golan Heights.jpg", 8947, 5906),
      2: page("File:Small scan 1973.jpg", 550, 309),
      3: page("File:NC photo.jpg", 3000, 2000, "CC BY-NC 2.0"),
      4: { title: "File:Map.svg", imageinfo: [{ width: 2000, height: 2000, mime: "image/svg+xml" }] },
    } } };
  };
  const cat = await buildCommonsCatalog({ queries: ["Golan Heights", "Yom Kippur War"], fetchJsonFn });
  assert.equal(calls.filter((u) => !/srnamespace=14/.test(u)).length, 2, "one keyword search per query (category lookups aside)");
  assert.deepEqual(cat.map((e) => e.file), ["File:Shot tanks in Golan Heights.jpg"], "tekrar ve uygunsuzlar elenir");
  assert.equal(cat[0].date, "1973");
  assert.match(cat[0].desc, /description/);
});

test("bölüm: en ilgili dosyalar önce; istem bloğu uydurmayı ve tekrar kullanmayı yasaklar", () => {
  const cat = [
    { file: "File:C-5 Galaxy.jpg", w: 3656, h: 2496, desc: "airlift aircraft", q: "Operation Nickel Grass" },
    { file: "File:Shot tanks in Golan Heights.jpg", w: 8947, h: 5906, date: "1973", desc: "tank on the Golan", q: "Golan Heights" },
  ];
  const ch = { title: "The Valley of Tears", goal: "tank battle on the Golan", covers: ["7th Armored Brigade on the Golan Heights"] };
  assert.equal(catalogForChapter(cat, ch)[0].file, "File:Shot tanks in Golan Heights.jpg");
  const block = catalogPromptBlock(cat, ch);
  assert.match(block, /GERÇEKTEN var olan/);
  assert.match(block, /uydurma/);
  assert.match(block, /Aynı dosyayı iki sahneye yazma/);
  assert.equal(catalogPromptBlock([], ch), "");
});

test("katalog işin klasöründe saklanır: aynı sorgularla yeniden taranmaz", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "katalog-"));
  let n = 0;
  const fetchJsonFn = async (url) => { if (!/srnamespace=14/.test(url)) n++; return { query: { pages: { 1: page("File:Golda Meir2.jpg", 2466, 3533) } } }; };
  const a = await commonsCatalogFor({ dir, queries: ["Golda Meir"], fetchJsonFn });
  const b = await commonsCatalogFor({ dir, queries: ["Golda Meir"], fetchJsonFn });
  assert.equal(n, 1);
  assert.deepEqual(a, b);
});

test("ağ hatası işi durdurmaz: o sorgu boş kalır", async () => {
  const log = [];
  const cat = await buildCommonsCatalog({ queries: ["Golan Heights"], fetchJsonFn: async () => { throw new Error("ETIMEDOUT"); }, logFn: (m) => log.push(m) });
  assert.deepEqual(cat, []);
  assert.ok(log.some((m) => /aranamadı/.test(m)));
});

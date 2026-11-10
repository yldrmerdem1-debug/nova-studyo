// COMMONS DİZİSİ (Hastings, Ekim 2026): Bayeux Duvar Halısı'nın 58 sahnesi Commons'ta tek tek, numarasıyla var
// ("Bayeux Tapestry Scene 23 (cropped).png"). Katalog konunun ilk 20 sonucunu alıyordu: 15 Halı dosyası, ikisi
// 64000x1464 şerit. Senarist ancak 6 sahneyi adıyla yazabildi, kalan 40 sahneye seçici hep aynı 6 kareyi sundu.
// Artık numaralı bir dizi görülünce dizi ayrıca ve derin aranır; 3,2:1'den uzun şeritler katalogdan çıkar.
import test from "node:test";
import assert from "node:assert/strict";
import { ASPECT_MAX, SERIES, buildCommonsCatalog, catalogEntry, catalogPromptBlock } from "../src/pipeline/docu-commons-catalog.js";

const page = (title, w, h, index = 0) => ({
  title,
  index,
  imageinfo: [{ width: w, height: h, mime: title.endsWith(".png") ? "image/png" : "image/jpeg", url: "https://upload.wikimedia.org/x", descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`, extmetadata: { LicenseShortName: { value: "CC BY-SA 3.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" }, Artist: { value: "Myrabella" }, ImageDescription: { value: title } } }],
});

test("a numbered series is recognised: Scene 23, scene57, Plate 8, folio 12 — not an ordinary name", () => {
  for (const t of ["File:Bayeux Tapestry Scene 23 (cropped).png", "File:Bayeux Tapestry scene57 Harold death.jpg", "File:Stothard Bayeux 33 34 Plate 8.jpg", "File:Book of Kells folio 12.jpg"]) assert.ok(SERIES.test(t), t);
  for (const t of ["File:Battle Abbey gatehouse.jpg", "File:Senlac Hill 2010.jpg", "File:Scenery of Sussex.jpg"]) assert.ok(!SERIES.test(t), t);
});

test("a panorama strip is not a documentary still: 64000x1464 and 16646x3544 are dropped, a 2:1 scene stays", () => {
  assert.equal(ASPECT_MAX, 3.2);
  const ok = (w, h) => catalogEntry(page("File:x.jpg", w, h), "q") !== null;
  assert.equal(ok(64000, 1464), false);
  assert.equal(ok(16646, 3544), false);
  assert.equal(ok(1464, 6000), false, "a tall strip either");
  assert.equal(ok(7267, 3590), true);
  assert.equal(ok(2948, 2568), true);
});

test("when a query's hits are a numbered series, the series is searched again, deeper, and its pieces join the catalog", async () => {
  const asked = [];
  const fetchJsonFn = async (url) => {
    const q = decodeURIComponent(url.match(/gsrsearch=([^&]+)/)[1]);
    const limit = Number(url.match(/gsrlimit=(\d+)/)[1]);
    asked.push({ q, limit });
    if (q === "Bayeux Tapestry scene filetype:bitmap") {
      return { query: { pages: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, page(`File:Bayeux Tapestry Scene ${String(i + 1).padStart(2, "0")} (cropped).png`, 5000, 3600, i)])) } };
    }
    if (q === "Bayeux Tapestry filetype:bitmap") {
      return { query: { pages: {
        a: page("File:Bayeux Tapestry scene57 Harold death.jpg", 2948, 2568, 0),
        b: page("File:Bayeux Tapestry scene43 banquet Odo.jpg", 2297, 2472, 1),
        c: page("File:Bayeux Tapestry scene1 EDWARD REX.jpg", 2075, 2274, 2),
        d: page("File:Tapisserie de Bayeux, p1.jpg", 64000, 1464, 3),
      } } };
    }
    return { query: { pages: { z: page("File:Battle Abbey gatehouse.jpg", 2848, 4288, 0) } } };
  };
  const logs = [];
  const cat = await buildCommonsCatalog({ queries: ["Bayeux Tapestry", "Battle Abbey"], fetchJsonFn, logFn: (m) => logs.push(m) });
  assert.ok(asked.some((a) => a.q === "Bayeux Tapestry scene filetype:bitmap" && a.limit === 50), JSON.stringify(asked));
  const files = cat.map((e) => e.file);
  assert.ok(files.includes("File:Bayeux Tapestry Scene 23 (cropped).png"));
  assert.ok(files.includes("File:Bayeux Tapestry scene57 Harold death.jpg"));
  assert.ok(!files.includes("File:Tapisserie de Bayeux, p1.jpg"), "the 64000-px strip is out");
  assert.ok(files.includes("File:Battle Abbey gatehouse.jpg"), "the next query still runs");
  assert.equal(files.length, new Set(files.map((f) => f.toLowerCase())).size, "no duplicates");
  assert.ok(logs.some((m) => /numaralı bir dizi \(scene\)/.test(m)));
  // an ordinary query is not searched twice
  assert.equal(asked.filter((a) => /^Battle Abbey/.test(a.q)).length, 1);
});

test("the series may go past the catalog cap (the pieces are the point), but only by seriesExtra", async () => {
  const fetchJsonFn = async (url) => {
    const q = decodeURIComponent(url.match(/gsrsearch=([^&]+)/)[1]);
    const n = q.includes("scene") ? 50 : 5;
    return { query: { pages: Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, page(`File:Work ${q.includes("scene") ? "deep" : "top"} scene ${i + 1}.jpg`, 3000, 2000, i)])) } };
  };
  const cat = await buildCommonsCatalog({ queries: ["Work"], fetchJsonFn, max: 5, seriesExtra: 10 });
  assert.equal(cat.length, 15);
});

test("the writer is told to give each scene of a numbered work its own numbered piece", () => {
  const block = catalogPromptBlock([{ file: "File:Bayeux Tapestry Scene 23 (cropped).png", w: 6715, h: 3800, date: "", desc: "", q: "Bayeux Tapestry" }], { title: "The oath" });
  assert.match(block, /NUMARALI parçaları/);
});

test("a Turkish research file gives English-usable queries: no flags, no suffixes, no Turkish common words", async () => {
  const { catalogQueries } = await import("../src/pipeline/docu-commons-catalog.js");
  const research = "**[DOĞRULANMAMIŞ]** Nagy'ın idamı. Nagy'ın gömülmesi. Bölüm 2. Bölüm 3. Sovyet tankları. Sovyet birlikleri. Macar öğrenciler. Macar işçiler. Radyo binası. Radyo kuşatması. Wikipedia'ya göre. Wikipedia kaynağı. Imre Nagy konuştu. Imre Nagy idam edildi. Kilián Barracks. Kilián Barracks.";
  const q = catalogQueries({ topic: "1956: The 12 Days", research });
  for (const bad of ["DOĞRULANMAMIŞ", "Bölüm", "Sovyet", "Macar", "Radyo", "Wikipedia", "Nagy'ın"]) assert.ok(!q.some((x) => x === bad || x.startsWith(bad + " ")), `${bad} in ${q}`);
  assert.ok(q.includes("Imre Nagy"), q.join(" | "));
  assert.ok(q.includes("Kilián Barracks"), q.join(" | "));
});

test("the topic's own Commons category is searched deep (deepcategory) and its files join the catalog", async () => {
  const asked = [];
  const fetchJsonFn = async (url) => {
    const u = decodeURIComponent(url);
    asked.push(u);
    if (/srnamespace=14/.test(u)) return { query: { search: [{ title: "Category:1956 births" }, { title: "Category:Hungarian Revolution of 1956" }] } };
    if (/deepcategory:"Hungarian Revolution of 1956"/.test(u)) return { query: { pages: { a: page("File:Budapest 1956, Kilián laktanya. Fortepan 24653.jpg", 2400, 1600, 0), b: page("File:Stalin statue head, 1956 Fortepan 24797.jpg", 1800, 1300, 1) } } };
    return { query: { pages: {} } };
  };
  const logs = [];
  const cat = await buildCommonsCatalog({ queries: ["Hungarian Revolution of 1956"], fetchJsonFn, logFn: (m) => logs.push(m) });
  assert.ok(cat.some((e) => /Fortepan 24797/.test(e.file)), cat.map((e) => e.file).join(" | "));
  assert.ok(!asked.some((u) => /deepcategory:"1956 births"/.test(u)), "a category not about the query is skipped");
  assert.ok(logs.some((m) => /kategorisinden 2 dosya/.test(m)));
});

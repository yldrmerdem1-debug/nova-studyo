// GIMLI GLIDER (28 Ekim 2026, iş 20261028-9ff721): olayın kendi fotoğrafları Commons'ta vardı — uçak Gimli'de burnu
// yerde (File:Gimli Glider.jpg, 728x505, 1983), FAA'nın inişten sonraki karesi (612x501), C-GAUN Mart 1983'te
// (1008x664) ve Ocak 1985'te (1024x641). Katalog 900 px altını attı; senarist yalnız 1984 Toronto fotoğrafını bildi
// ve onu dört sahneye yazdı. "(cropped)" kopyası ayrı dosya sayıldı: aynı fotoğraf 0. ve 33. sahnede, görsel kutusu
// da 41. yuvaya ("onarılıp hizmete döndü") yine onu koydu. Seçici "emekliliğe yakın yorgun bir uçak değildi"
// satırına uçağın 2008'de Mojave'de depoda çekilmiş fotoğrafını verdi.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commonsKey } from "../src/pipeline/provenance.js";
import { buildCommonsCatalog, catalogEntry } from "../src/pipeline/docu-commons-catalog.js";
import { fillInboxFromCommons, usedCommonsKeys } from "../src/pipeline/inbox-commons.js";
import { SCENE_TRUTH_LINES } from "../src/pipeline/docu-archive.js";

const TORONTO = 'File:C-GAUN 604 Boeing 767-233 Air Canada, the "Gimli Glider", Toronto, July 14 1984. (5530418110).jpg';
const TORONTO_CROP = 'File:C-GAUN 604 Boeing 767-233 Air Canada, the "Gimli Glider", Toronto, July 14 1984. (5530418110) (cropped).jpg';
const MIAMI = "File:8ci - Air Canada Boeing 767-233; C-GAUN@MIA;24.01.1998 (4931709366).jpg";

const page = (title, w, h, date, index = 1) => ({
  title,
  index,
  imageinfo: [{
    width: w,
    height: h,
    mime: "image/jpeg",
    url: `https://upload.wikimedia.org/o/${index}`,
    thumburl: `https://upload.wikimedia.org/t/${index}`,
    descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
    extmetadata: { LicenseShortName: { value: "CC BY-SA 3.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/3.0" }, Artist: { value: "Someone" }, ...(date ? { DateTimeOriginal: { value: date } } : {}) },
  }],
});

test("a photo and its (cropped) copy are one file", () => {
  assert.equal(commonsKey(TORONTO), commonsKey(TORONTO_CROP));
  assert.equal(commonsKey("File:Gimli_Glider.jpg"), commonsKey("Gimli Glider.jpg"));
  assert.notEqual(commonsKey(TORONTO), commonsKey(MIAMI));
});

test("a small scan dated before 2000 stays in the catalog; a small modern photo does not", () => {
  assert.ok(catalogEntry(page("File:Gimli Glider.jpg", 728, 505, "1983"), "Gimli Glider"), "the 1983 photo of the jet at Gimli");
  assert.ok(catalogEntry(page("File:Air Canada Flight 143 after emergency landing 2.jpg", 612, 501, "1983-07-23"), "Gimli Glider"));
  assert.ok(catalogEntry(page("File:Boeing 767-233, Air Canada AN0078557.jpg", 1024, 641, "26 January 1985"), "C-GAUN"));
  assert.equal(catalogEntry(page("File:Gimli harbour.jpg", 728, 505, "2015"), "Gimli"), null, "a small 2015 photo is still too small");
  assert.equal(catalogEntry(page("File:Undated.jpg", 728, 505, null), "Gimli"), null, "no date, no exception");
  assert.equal(catalogEntry(page("File:Tiny 1983.jpg", 400, 300, "1983"), "Gimli"), null, "under 480 px even an old scan is out");
});

test("the catalog keeps one of a photo and its (cropped) copy", async () => {
  const pages = [page(TORONTO, 2560, 1578, "1984", 1), page(TORONTO_CROP, 2560, 1480, "1984", 2), page("File:Gimli Glider.jpg", 728, 505, "1983", 3)];
  const fetchJsonFn = async () => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [i + 1, p])) } });
  const cat = await buildCommonsCatalog({ queries: ["Gimli Glider"], fetchJsonFn, categoryQueries: 0 });
  const files = cat.map((e) => e.file);
  assert.equal(files.filter((f) => commonsKey(f) === commonsKey(TORONTO)).length, 1, files.join(" | "));
  assert.ok(files.includes("File:Gimli Glider.jpg"), files.join(" | "));
});

function job() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gimli-"));
  fs.mkdirSync(path.join(dir, "gorsel-kutusu"));
  const prompt = "Wide shot of a white Boeing 767 in Air Canada colours on a sunny airport apron in 1984, crisp summer light.";
  fs.writeFileSync(path.join(dir, "gorsel-kutusu", "needed.json"), JSON.stringify({ items: [{ n: 41, file: "build/x/img-41.jpg", prompt }] }));
  const scenes = [
    { type: "photo", say: "This Boeing 767 left Montreal with a fuel sheet reading 22,300.", source: "archive", commons: TORONTO_CROP, image: "build/x/cm-1.jpg", archived: true },
    { type: "photo", say: "[confident] C-GAUN was repaired and returned to service.", source: "archive", imagePrompt: prompt },
  ];
  fs.writeFileSync(path.join(dir, "docu-script.json"), JSON.stringify({ scenes }));
  fs.writeFileSync(path.join(dir, "docu-archive-done.json"), JSON.stringify({ script: { scenes }, credits: { "scene-0": { provider: "wikimedia", eser: TORONTO_CROP.replace(/^File:/, "") } } }));
  return dir;
}

test("the inbox fill does not put a photo the video already shows into another slot", async () => {
  const dir = job();
  assert.ok(usedCommonsKeys(dir).has(commonsKey(TORONTO)), "the archived scene's photo counts as shown");
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
  const pages = [page(TORONTO, 2560, 1578, "1984", 1), page(MIAMI, 4866, 3222, "1998", 2)];
  const fetchImpl = async (u) => {
    if (u.startsWith("https://commons.wikimedia.org/w/api.php")) return { ok: true, json: async () => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [i + 1, p])) } }) };
    return { ok: true, status: 200, arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length) };
  };
  let offered = [];
  const logs = [];
  await fillInboxFromCommons({
    jobDir: dir,
    llm: async () => ({ scenes: [{ n: 41, queries: ["C-GAUN Air Canada"] }] }),
    visionLlm: async ({ images }) => { offered = images.map((x) => x.etiket); return { pick: 1 }; },
    fetchImpl,
    ffmpeg: path.join(os.tmpdir(), "nova-ffmpeg-yok", "ffmpeg.exe"),
    logFn: (m) => logs.push(m),
  });
  assert.ok(offered.length >= 1, logs.join("\n"));
  assert.ok(!offered.some((t) => t.includes("Toronto")), offered.join(" | "));
  assert.ok(offered.some((t) => t.includes("C-GAUN@MIA")), offered.join(" | "));
  assert.ok(logs.some((m) => /videoda zaten var/.test(m)), logs.join("\n"));
});

test("the picker is told the photo must show the line's moment, not a later year of the same thing", () => {
  assert.ok(SCENE_TRUTH_LINES.some((l) => /ANI/.test(l) && /emekli/.test(l) && /anlatım aralığında/.test(l)));
});

// Husi-Suudi haberi 20261028-59b606 (~10:27): sarkha sloganı yazılı bölüm kartı (reklam uygunluğu).
test("the picker is told a readable hate or death slogan is no picture for a scene", () => {
  assert.ok(SCENE_TRUTH_LINES.some((l) => /Death to America/.test(l) && /reklam dostu değil/.test(l)));
});

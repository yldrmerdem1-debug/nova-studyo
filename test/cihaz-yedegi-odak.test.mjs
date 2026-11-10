// CİHAZ YEDEĞİ VE ODAK (Kartal Yuvası yangını 20261024-950730 — 25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: ön izleme kapısı ve render sonrası görme denetimi sahne 17'nin haritasını içerik hatasıyla buldu
//   (Almanya'daki yerler AUSTRIA başlıklı haritada); düzeltmesi "device-fallback" — sahne sade görsele döner. Kapı bunun
//   için senaryo denetiminin yedeğini (fallbackScene) kullanır, ama fonksiyon dışa açık değildi. Ayrıca haritanın
//   focus'u bir nokta indeksidir (engine-script.json sahne 17: focus: 4); TYPE_FIELDS focus'u atmadığı için harita
//   photo/words olunca 4 sayısı Backdrop/Photo'ya gidiyordu, onlar focus[0]/focus[1] okur (fx.tsx fc[0]) — aynı gizli
//   kusur sanitizeDevices'ta da vardı. Artık yedek sahnede yalnızca [x, y] biçimli focus kalır.
// Ağ YOK; sahne işin kendi docu/engine-script.json'ından.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-cihaz-yedegi-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const D = await import("../src/pipeline/docu-edit-director.js");

// engine-script.json sahne 17 (resimsiz dünya haritası, focus bir nokta indeksi).
const MAP17 = { type: "map", chapter: 1, say: "The route runs from Berchtesgaden, past the Obersalzberg, up toward the Kehlstein, close to the Austrian border near Salzburg.", region: "world", box: [3.597, 44.24, 22.102, 51.24], points: [{ label: "Traunstein", x: 0.4889, y: 0.4816 }, { label: "Salzburg", x: 0.5111, y: 0.4901 }, { label: "Berchtesgaden", x: 0.5083, y: 0.5155 }, { label: "Obersalzberg", x: 0.5105, y: 0.5158 }, { label: "Kehlstein", x: 0.5104, y: 0.5183 }], countries: ["Austria"], route: [2, 3, 4], line: "route", focus: 4, mapName: "Austria", dur: 7, voiceDur: 6.6 };

test("fallbackScene is exported for the preview gate's device-fallback", () => {
  assert.equal(typeof D.fallbackScene, "function");
});

test("the job's map (focus: 4) falls back without a numeric focus and without its map fields", () => {
  const out = D.fallbackScene(MAP17);
  assert.equal(out.type, "words", "no picture source: words over the previous frame");
  assert.equal(out.bg, "prev");
  assert.ok(!("focus" in out), `a point index never reaches Backdrop/Photo: ${JSON.stringify(out.focus)}`);
  for (const k of ["region", "box", "points", "countries", "route", "line", "mapName"]) assert.ok(!(k in out), `${k} dropped`);
  assert.equal(out.say, MAP17.say, "the narration never changes");
  assert.equal(out.voiceDur, MAP17.voiceDur);
  assert.equal(MAP17.focus, 4, "the input scene is not mutated");
  // A map with a picture source becomes a photo — again without the index.
  const photo = D.fallbackScene({ ...MAP17, imagePrompt: "Alpine road to the Kehlstein in autumn" });
  assert.equal(photo.type, "photo");
  assert.ok(!("focus" in photo));
});

test("normal case: a picture's own [x, y] focus stays on the fallback photo", () => {
  const out = D.fallbackScene({ type: "quote", chapter: 0, say: "He said nothing that night.", quote: "Never again", who: "Nobody", image: "build/j/img-1.jpg", focus: [0.3, 0.4], dur: 4 });
  assert.equal(out.type, "photo");
  assert.deepEqual(out.focus, [0.3, 0.4]);
  assert.ok(!out.quote && !out.who);
});

test("sanitizeDevices: an invalid writer map with a focus index falls back without it", () => {
  const script = {
    title: "Eagle's Nest", locale: "en-US", chapters: ["A", "B"],
    scenes: [
      { type: "photo", chapter: 0, say: "On Friday night, smoke rose above the mountain.", dur: 5, imagePrompt: "smoke over alpine ridge" },
      { type: "photo", chapter: 0, say: "By Saturday, it was almost completely destroyed.", dur: 4, imagePrompt: "burnt ruins" },
      { type: "map", chapter: 1, say: "Firefighters drove up the narrow road through the night.", region: "world", places: [{ label: "Atlantis", lat: 47.6, lon: 13.04 }, { label: "Lemuria", lat: 47.63, lon: 13.0 }], focus: 1, imagePrompt: "fire trucks on a mountain road at night", dur: 5 },
      { type: "photo", chapter: 1, say: "Nobody was hurt.", dur: 3, imagePrompt: "empty road at dawn" },
    ],
  };
  const logs = [];
  const { script: out, fixed } = D.sanitizeDevices(script, { logFn: (m) => logs.push(m) });
  assert.deepEqual(fixed.map((f) => f.scene), [2], logs.join("\n"));
  const s = out.scenes[2];
  assert.equal(s.type, "photo");
  assert.ok(!("focus" in s), `focus index dropped: ${JSON.stringify(s.focus)}`);
  assert.ok(!s.places && !s.region);
  assert.ok(logs.some((m) => /Senaryodaki map cihazı geçersiz \(sahne 3: .*sahne sade görsele döndü/.test(m)), logs.join("\n"));
});

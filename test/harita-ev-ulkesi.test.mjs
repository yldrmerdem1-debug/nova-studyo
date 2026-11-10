// HARİTANIN EV ÜLKESİ (Kartal Yuvası 20261024-950730 — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: docu-script.json sahne 17 (1:16) rota haritası — places Traunstein / Salzburg / Berchtesgaden /
//   Obersalzberg / Kehlstein, countries ["Germany", "Austria"], focus Kehlstein. Pencerede (sahne 14-19) anlatım hiç
//   "Germany" demiyor, yalnızca "close to the Austrian border near Salzburg": sanitizeDevices Almanya'yı düşürdü ve
//   props sahne 18 countries ["Austria"], mapName "Austria", flagFills [at] oldu. on-izleme/sheet_1.jpg: AUSTRIA çipi,
//   kırmızı-beyaz-kırmızı dolgu ve bütün Alman pinleri onun üstünde; render sonrası QA (kare 72-74, high): "Berchtesgaden,
//   Obersalzberg ve Kehlstein Avusturya içindeymiş gibi". Beş yer 0,4° içinde, worldBox (minSpan 7) onları 7° × 18,5°
//   kutuya (3.597, 44.24, 22.102, 51.24) sıkıştırdı: etiketler üst üste (qa.json sahne 17 text_overflow).
// Ağ YOK; anlatım ve yerler işin kendi docu-script.json'ından.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harita-ev-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const W = await import("../docu-engine/lib/world-map.mjs");
const D = await import("../src/pipeline/docu-edit-director.js");

const PLACES = [
  { label: "Traunstein", lat: 47.8686, lon: 12.6433 },
  { label: "Salzburg", lat: 47.8095, lon: 13.055 },
  { label: "Berchtesgaden", lat: 47.6314, lon: 13.0026 },
  { label: "Obersalzberg", lat: 47.6297, lon: 13.0436 },
  { label: "Kehlstein", lat: 47.6122, lon: 13.0417 },
];
// docu-script.json sahne 14-19, aynen (sahne 17 = harita).
const kartal = (map = {}) => ({
  title: "Eagle's Nest", locale: "en-US", era: "2026",
  scenes: [
    { type: "slam", chapter: 0, say: "police stopped a man on a motorcycle.", dur: 3, imagePrompt: "Night shot of a lone motorcycle headlamp on a dark mountain road" },
    { type: "words", chapter: 1, say: "[serious] Around 9:15 pm on Friday, according to police, the alarm reached the control center in Traunstein.", dur: 5, imagePrompt: "Medium shot of a dim emergency dispatch room at night" },
    { type: "photo", chapter: 1, say: "Crews heading up the mountain didn't need directions. They could already see the flames.", dur: 5, imagePrompt: "Wide shot from behind a firefighter standing beside a fire truck" },
    { type: "map", chapter: 1, say: "The route runs from Berchtesgaden, past the Obersalzberg, up toward the Kehlstein, close to the Austrian border near Salzburg.", region: "world", places: PLACES, countries: ["Germany", "Austria"], focus: 4, route: [2, 3, 4], line: "route", dur: 7, imagePrompt: "High angle view of dark Bavarian Alps at night", ...map },
    { type: "photo", chapter: 1, say: "Police say that when firefighters arrived, the building was completely engulfed in flames.", dur: 5, imagePrompt: "Wide night shot of a stone mountain house on a rocky peak" },
    { type: "photo", chapter: 1, say: "So crews weren't arriving at a fire just starting. They were arriving at a building already lost.", dur: 6, imagePrompt: "Medium shot of flames pouring out of the windows of a stone house" },
  ],
});

test("countryAt: the country a pin stands in (fine borders a few km from the Austrian border), null at sea", () => {
  assert.deepEqual(PLACES.map((q) => W.countryAt(q.lat, q.lon)), ["Germany", "Austria", "Germany", "Germany", "Germany"]);
  assert.equal(W.countryAt(47.61, 13.04), "Germany", "Kehlstein");
  assert.equal(W.countryAt(47.81, 13.06), "Austria", "Salzburg");
  assert.equal(W.countryAt(-29.31, 27.48), "Lesotho", "a country inside another is not its hole's neighbour");
  assert.equal(W.countryAt(26.57, 56.25), null, "Strait of Hormuz: at sea");
  assert.equal(W.countryAt(NaN, 13), null);
});

test("Kartal route map: Germany (the focus pin's country) stays and names the map; Austria stays beside it", () => {
  const logs = [];
  const m = D.sanitizeDevices(kartal(), { logFn: (x) => logs.push(x) }).script.scenes[3];
  assert.equal(m.type, "map", logs.join("\n"));
  assert.deepEqual(m.countries, ["Germany", "Austria"], "the narration never says Germany, but the focus (Kehlstein) and every pin but Salzburg stand in it");
  assert.equal(m.mapName, "Germany", "never AUSTRIA over German places");
  assert.equal(m.focus, 4);
  const geo = W.attachWorldMaps({ ...kartal(), scenes: [m] }).scenes[0].geo;
  assert.deepEqual(geo.flagFills.map((f) => f.flag), ["de", "at"], "2026 story: both flags, the home country first");
  assert.equal(geo.name, "Germany");
  // Only a neighbour listed (Austria): no unlisted country is added, and the map is named after the focus place —
  // never AUSTRIA over the German pins (the tight frame shows them outside the tinted neighbour).
  const n = D.sanitizeDevices(kartal({ countries: ["Austria"] })).script.scenes[3];
  assert.deepEqual(n.countries, ["Austria"]);
  assert.equal(n.mapName, "Kehlstein");
  const swapped = D.sanitizeDevices(kartal({ countries: ["Austria", "Germany"] })).script.scenes[3];
  assert.deepEqual(swapped.countries, ["Austria", "Germany"]);
  assert.equal(swapped.mapName, "Kehlstein", "the first tinted country holds no focus pin: the place names the map");
});

test("contested borders: the pin's Natural Earth country is never tinted or named unless the writer listed it", () => {
  // Natural Earth (de facto) draws Jerusalem's usual coordinates in "Palestine" and Sevastopol in "Russia": an Israel or
  // Ukraine story must not get a PALESTINE / RUSSIA map chip and flag the writer never asked for.
  const one = (say, places, countries) => D.sanitizeDevices({
    title: "News", locale: "en-US", era: "2026",
    scenes: [
      { type: "photo", say: "Tension rose again this week.", dur: 4, imagePrompt: "street" },
      { type: "map", say, region: "world", places, countries, focus: 0, dur: 5, imagePrompt: "x" },
      { type: "photo", say: "Officials met late into the night.", dur: 4, imagePrompt: "room" },
    ],
  }).script.scenes[1];
  assert.equal(W.countryAt(31.7683, 35.2137), "Palestine", "fixture: the data's own border");
  assert.equal(W.countryAt(44.6, 33.52), "Russia", "fixture: the data's own border");
  const jer = one("Police in Jerusalem and Tel Aviv raised the alert across Israel.", [{ label: "Jerusalem", lat: 31.7683, lon: 35.2137 }, { label: "Tel Aviv", lat: 32.08, lon: 34.78 }], ["Israel"]);
  assert.deepEqual(jer.countries, ["Israel"]);
  assert.equal(jer.mapName, "Jerusalem");
  const sev = one("The drones hit Sevastopol, far from Kyiv, in Ukraine.", [{ label: "Sevastopol", lat: 44.6, lon: 33.52 }, { label: "Kyiv", lat: 50.45, lon: 30.52 }], ["Ukraine"]);
  assert.deepEqual(sev.countries, ["Ukraine"]);
  assert.equal(sev.mapName, "Sevastopol");
  // Normal case: the focus pin stands in the first tinted country — named after it, as before.
  const fr = one("The strike spread from Paris to Lyon, across France and into Germany.", [{ label: "Paris", lat: 48.85, lon: 2.35 }, { label: "Lyon", lat: 45.76, lon: 4.84 }], ["France", "Germany"]);
  assert.deepEqual(fr.countries, ["France", "Germany"]);
  assert.equal(fr.mapName, "France");
});

test("a cluster of pins is framed on itself (1.5° not 7°): the five places spread over the frame instead of one spot", () => {
  const m = D.sanitizeDevices(kartal()).script.scenes[3];
  const [w, s, e, n] = m.box;
  assert.ok(n - s <= 2 && e - w <= 5, `box ${m.box} (was 3.597,44.24,22.102,51.24)`);
  assert.ok(m.points.every((p) => p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98), "every pin inside the frame");
  const xs = m.points.map((p) => p.x), ys = m.points.map((p) => p.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.08 && Math.max(...ys) - Math.min(...ys) > 0.12, "spread out (was 2% × 4% of the frame)");
  // Normal case unchanged: one city keeps its country and coast (7°), and worldBox without clusterSpan is as before.
  const one = W.worldBox([{ lat: 47.16, lon: 19.49 }], { clusterSpan: D.CLUSTER_SPAN });
  assert.equal(+(one[3] - one[1]).toFixed(3), 7);
  assert.deepEqual(W.worldBox(PLACES).map((v) => +v.toFixed(3)), [3.597, 44.24, 22.102, 51.24], "the engine's default box is the old one");
  const wide = [{ lat: 15.35, lon: 44.2 }, { lat: 24.7, lon: 46.7 }];
  assert.deepEqual(W.worldBox(wide, { clusterSpan: D.CLUSTER_SPAN }), W.worldBox(wide), "places far apart: same box as before");
});

test("normal maps keep their name: an untinted map is named after its focus place, a sea map after its first country", () => {
  const plain = D.sanitizeDevices(kartal({ countries: [] })).script.scenes[3];
  assert.equal(plain.countries, undefined, "no tint was asked: none is added");
  assert.equal(plain.mapName, "Kehlstein");
  const sea = {
    title: "Hormuz", locale: "en-US",
    scenes: [
      { type: "photo", say: "Tankers slowed down off Iran.", dur: 4, imagePrompt: "tanker at sea" },
      { type: "map", say: "The Strait of Hormuz sits between Iran and Oman.", region: "world", places: [{ label: "Strait of Hormuz", lat: 26.57, lon: 56.25 }], countries: ["Iran", "Oman"], dur: 5, imagePrompt: "sea" },
      { type: "photo", say: "A fifth of the world's oil passes here.", dur: 4, imagePrompt: "oil tanker" },
    ],
  };
  const m = D.sanitizeDevices(sea).script.scenes[1];
  assert.deepEqual(m.countries, ["Iran", "Oman"]);
  assert.equal(m.mapName, "Iran", "a pin at sea: the first tinted country, as before");
});

// HARİTADA KARA GÖRÜNÜR (denizaltı çarpışması 20261024-373aaf — 25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 20261024-373aaf): engine-script.json sahne 4 "They collided underwater in the Atlantic,
//   on the night of 3 to 4 February 2009." — region world, box [-23.957, 42.5, -6.043, 49.5], tek pin "Atlantic"
//   (0.5, 0.5), ülke yok. Kutudaki tek kara köşedeki Galiçya ucu (%2,5); kamera pine 2x yaklaşınca yakın kadrajda kara
//   %0. on-izleme/f_0005.jpg: koyu boş deniz ve bir nokta; kapı (tur 1, sahne 5, broken): "Harita neredeyse boş: kıyı
//   çizgisi yok, yalnızca 'ATLANTIC' etiketi ve nokta var".
// AYNI DOSYADA, TARİH ÇİZGİSİ: Avrasya halkası Çukotka'da 180 → -180 atlıyordu. Düz çizimde bu atlayış dünyayı boydan
//   boya kesen bir çizgi; halka 65-69°K arasında sahte bir kara kuşağı kapatıyordu: Rusya boyalı İzlanda haritasında
//   RUSSIA etiketi ve dolgusu, Fiji boyalı La Paz haritasında FIJI; countryAt Kiruna'yı, Rovaniemi'yi ve 67°K 10°B açık
//   denizi "Russia" sayıyordu.
// Ağ YOK; kutular ve pinler işin kendi engine-script.json'ından. Kara, haritanın kodundan bağımsız ölçülür (countryAt ızgarası).
import test from "node:test";
import assert from "node:assert/strict";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const W = await import("../docu-engine/lib/world-map.mjs");

const ATLANTIC = { chapter: 0, type: "map", say: "They collided underwater in the Atlantic, on the night of 3 to 4 February 2009.", dur: 5, region: "world", box: [-23.957, 42.5, -6.043, 49.5], points: [{ label: "Atlantic", x: 0.5, y: 0.5 }], focus: 0, mapName: "Atlantic" };
const BREST_FASLANE = { chapter: 3, type: "map", say: "Between Brest and Faslane lay open ocean, and Vanguard was still out in it.", dur: 5, region: "world", box: [-24.717, 45.318, 15.407, 59.142], points: [{ label: "Brest", x: 0.5041, y: 0.7778 }, { label: "Faslane", x: 0.4959, y: 0.2222 }], focus: 1, mapName: "Faslane" };
const ILE_LONGUE = { chapter: 1, type: "map", say: "Île Longue, across the water from Brest, is home to France's missile submarines.", dur: 5, region: "world", box: [-13.863, 44.85, 4.863, 51.85], points: [{ label: "Brest", x: 0.5005, y: 0.4943 }, { label: "Île Longue", x: 0.4995, y: 0.5057 }], countries: ["France"], focus: 1, mapName: "France" };

const latLon = (box, p) => [box[3] - p.y * (box[3] - box[1]), box[0] + p.x * (box[2] - box[0])];
/** Land under a grid over the frame the camera ends on (half the box round the pin), by Natural Earth's countries. */
function landSeen(box, p) {
  const [w, s, e, n] = box;
  const cx = Math.max(0.25, Math.min(0.75, p.x));
  const cy = Math.max(0.25, Math.min(0.75, p.y));
  let hit = 0;
  let all = 0;
  for (let i = 0; i < 24; i++) for (let j = 0; j < 14; j++) {
    const x = cx - 0.25 + ((i + 0.5) / 24) * 0.5;
    const y = cy - 0.25 + ((j + 0.5) / 14) * 0.5;
    all++;
    if (W.countryAt(n - y * (n - s), w + x * (e - w), "50m")) hit++;
  }
  return hit / all;
}

test("open-sea map: the box widens round its centre until coasts are in the close-up; the pins stay on the Earth", () => {
  assert.equal(landSeen(ATLANTIC.box, ATLANTIC.points[0]), 0, "the job's frame: no land where the camera ends");
  const ship = { label: "Ship", x: 0.2, y: 0.3 };
  const logs = [];
  const m = W.attachWorldMaps({ era: "2009", scenes: [{ ...ATLANTIC, points: [...ATLANTIC.points, ship] }] }, { log: (x) => logs.push(x) }).scenes[0];
  const [w0, s0, e0, n0] = ATLANTIC.box;
  const [w, s, e, n] = m.box;
  assert.ok(n - s > (n0 - s0) * 2 && n - s <= W.LAND_MAX_SPAN + 0.01, `wider, at most an ocean basin: ${m.box}`);
  assert.ok(Math.abs((w + e) / 2 - (w0 + e0) / 2) < 0.01 && Math.abs((s + n) / 2 - (s0 + n0) / 2) < 0.01, "round the same centre");
  assert.ok(Math.abs((e - w) / (n - s) - (e0 - w0) / (n0 - s0)) < 0.01, "same shape (16:9 true shape)");
  for (const [k, p] of m.points.entries()) {
    const was = latLon(ATLANTIC.box, k ? ship : ATLANTIC.points[0]);
    const now = latLon(m.box, p);
    assert.ok(Math.abs(now[0] - was[0]) < 0.01 && Math.abs(now[1] - was[1]) < 0.01, `${p.label}: same place ${was} -> ${now}`);
  }
  assert.deepEqual(m.points[0], { label: "Atlantic", x: 0.5, y: 0.5 }, "a pin in the centre stays in the centre");
  assert.ok(landSeen(m.box, m.points[0]) >= W.LAND_MIN_SHARE, `coasts where the camera ends: ${landSeen(m.box, m.points[0])}`);
  assert.ok(m.geo.land.length > 10 && m.geo.graticule > 0, "the coast of the new box is drawn");
  assert.ok(logs.some((l) => /genişledi/.test(l)), logs.join("\n"));
  // Idempotent: the widened map already shows land.
  const again = W.attachWorldMaps({ scenes: [m] }).scenes[0];
  assert.deepEqual(again.box, m.box);
  assert.deepEqual(again.points, m.points);
});

test("coastal maps keep their box and pins (Brest–Faslane, Île Longue)", () => {
  const logs = [];
  const out = W.attachWorldMaps({ era: "2009", scenes: [BREST_FASLANE, ILE_LONGUE, { type: "photo", say: "x" }] }, { log: (x) => logs.push(x) }).scenes;
  assert.deepEqual(out[0].box, BREST_FASLANE.box);
  assert.deepEqual(out[0].points, BREST_FASLANE.points);
  assert.deepEqual(out[1].box, ILE_LONGUE.box);
  assert.deepEqual(out[1].points, ILE_LONGUE.points);
  assert.ok(out[0].geo.land.length > 20 && out[1].geo.fills.length > 0);
  assert.deepEqual(logs, []);
});

test("nothing within an ocean basin (Point Nemo): the box stays as it was, and the log says so", () => {
  const box = W.worldBox([{ lat: -48.88, lon: -123.39 }]);
  const logs = [];
  const m = W.attachWorldMaps({ scenes: [{ type: "map", region: "world", box, points: [{ label: "Point Nemo", ...W.worldXY(box, -48.88, -123.39) }], focus: 0 }] }, { log: (x) => logs.push(x) }).scenes[0];
  assert.deepEqual(m.box, box);
  assert.ok(logs.some((l) => /kıyı yok/.test(l)), logs.join("\n"));
});

// İNCELEMEDE (25 Ekim 2026): kıyı bulamayan kutu da büyüyordu — Midway tek pin, yakın kadrajda kara %0 → kutu 5,71 kat
//   (40°) ve günlük "kıyılar kadrajda (kara %0)"; St Helena %1 ile 5,71 kat. Pinsiz ama focus'lu harita (yalnızca
//   countries) closeUp'ta points[focus] ile çöküyor, "Dünya haritası çizilemedi" deyip kıyısız kalıyordu.
test("a box that reaches no coast by the cap stays as written; a map with a focus and no pins still draws", () => {
  for (const [name, lat, lon] of [["Midway", 28.21, -177.37], ["St Helena", -15.96, -5.71]]) {
    const box = W.worldBox([{ lat, lon }]);
    const logs = [];
    const m = W.attachWorldMaps({ scenes: [{ type: "map", region: "world", box, points: [{ label: name, ...W.worldXY(box, lat, lon) }], focus: 0 }] }, { log: (x) => logs.push(x) }).scenes[0];
    assert.deepEqual(m.box, box, `${name}: ${m.box}`);
    assert.ok(logs.some((l) => /kıyı yok/.test(l)) && !logs.some((l) => /genişledi/.test(l)), `${name}: ${logs.join(" | ")}`);
  }
  const box = W.worldBox([{ lat: 32.4, lon: 53.7 }]);
  const logs = [];
  const iran = W.attachWorldMaps({ scenes: [{ type: "map", region: "world", box, countries: ["Iran"], focus: 0 }] }, { log: (x) => logs.push(x) }).scenes[0];
  assert.ok(iran.geo?.land.length > 0 && iran.geo.fills.length > 0, logs.join(" | "));
  assert.deepEqual(iran.box, box);
});

test("date line: no band of land at 65-69°N, the country under a pin is its own", () => {
  assert.equal(W.countryAt(67.85, 20.22), "Sweden", "Kiruna");
  assert.equal(W.countryAt(66.5, 25.7), "Finland", "Rovaniemi");
  assert.equal(W.countryAt(67, -10), null, "Norwegian Sea");
  assert.equal(W.countryAt(66.5, -175), "Russia", "Chukotka east of the date line");
  assert.equal(W.countryAt(66, 172), "Russia", "Chukotka west of it");
  assert.equal(W.countryAt(-16.85, -179.95), "Fiji", "Taveuni, across the date line");
  const iceland = W.worldGeometry([-30, 62, -10, 68], { highlight: ["Russia"] });
  assert.equal(iceland.fills.length, 0, "Russia is not over Iceland");
  assert.deepEqual(iceland.labels, []);
  assert.equal(W.worldGeometry([-75, -20, -60, -13], { highlight: ["Fiji"] }).fills.length, 0, "nor Fiji over Bolivia");
  // Across the date line both sides still draw.
  const bering = W.worldGeometry([-190, 55, -150, 75], { highlight: ["Russia", "United States of America"] });
  assert.deepEqual(bering.labels.map((l) => l.text).sort(), ["RUSSIA", "UNITED STATES OF AMERICA"]);
  assert.ok(bering.fills.some((r) => r.some(([x]) => x < -180)) && bering.fills.some((r) => r.some(([x]) => x > -170)), "Chukotka west of -180 and Alaska");
  const asia = W.countryCenter("Russia");
  assert.ok(asia.lon > 60 && asia.lon < 140, `Russia's label point stays in Russia: ${asia.lon}`);
});

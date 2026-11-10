// ÇİZGİSİZ KARA HARİTASI (Gimli Glider 20261028-9ff721 — 28 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: engine-script.json sahne 93 "The answer was in Quintal's memory, north of Winnipeg: Gimli." — region
//   world, box [-101.15, 48.805, -93.03, 51.725], pinler Winnipeg ve Gimli, ülke yok. Kutunun tek çizgisi en alttaki 49.
//   paralel sınırı; kamera Gimli'ye yaklaşınca kadraj baştan başa Manitoba toprağı, kıyı da sınır da yok. Videoda 8:49'da
//   koyu boş bir kart ve iki nokta; kalite denetimi: "Harita karesi neredeyse tamamen boş; yalnızca köşede küçük 'GIMLI'
//   etiketi var". Ağ YOK; kutu ve pinler işin kendi engine-script.json'ından.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const W = await import("../docu-engine/lib/world-map.mjs");

const GIMLI = { chapter: 5, type: "map", say: "The answer was in Quintal's memory, north of Winnipeg: Gimli.", dur: 5, region: "world", box: [-101.15, 48.805, -93.03, 51.725], points: [{ label: "Winnipeg", x: 0.4938, y: 0.625 }, { label: "Gimli", x: 0.5062, y: 0.375 }], focus: 1, mapName: "Gimli" };
const CANADA = { chapter: 0, type: "map", say: "Sixty-one passengers, eight crew, Montreal to Edmonton via Ottawa.", dur: 4, region: "world", box: [-129.516, 36.167, -57.804, 62.463], points: [{ label: "Montreal", x: 0.7778, y: 0.6462 }, { label: "Ottawa", x: 0.7509, y: 0.6519 }, { label: "Red Lake", x: 0.498, y: 0.4333 }, { label: "Edmonton", x: 0.2222, y: 0.3481 }], focus: 2, countries: ["Canada"], route: [0, 1, 2, 3], mapName: "Canada" };

const latLon = (box, p) => [box[3] - p.y * (box[3] - box[1]), box[0] + p.x * (box[2] - box[0])];

test("a close-up that is land from edge to edge widens until a border crosses it; the pins stay on the Earth", () => {
  const logs = [];
  const out = W.attachWorldMaps({ scenes: [GIMLI] }, { log: (m) => logs.push(m) }).scenes[0];
  assert.ok(out.box[3] - out.box[1] > GIMLI.box[3] - GIMLI.box[1], `box ${out.box}`);
  assert.ok(out.box[1] < 49 && out.box[3] > 50.65, "the 49th parallel and Gimli both inside");
  for (const [i, p] of out.points.entries()) {
    const [la, lo] = latLon(out.box, p);
    const [la0, lo0] = latLon(GIMLI.box, GIMLI.points[i]);
    assert.ok(Math.abs(la - la0) < 0.02 && Math.abs(lo - lo0) < 0.02, `${p.label} moved`);
  }
  assert.ok(out.geo.borders.length > 0);
  assert.ok(logs.some((m) => /baştan başa kara/.test(m)), logs.join("\n"));
});

test("a map that already shows coasts and borders keeps its box", () => {
  const out = W.attachWorldMaps({ scenes: [CANADA] }).scenes[0];
  assert.deepEqual(out.box, CANADA.box);
  assert.equal(W.LAND_MAX_SHARE, 0.97);
});

// ARACIN TİPİ VE MEKÂNIN ADI İSTEMDE (Gimli Glider, 28 Ekim 2026, 20261028-9ff721): "Silhouette of a widebody airliner
// climbing into a darkening sky" Air Canada'nın 767'si için yazılmıştı; ChatGPT dört motorlu, kamburlu bir 747 çizdi.
// "Close-up of hands pressing a plain cardboard strip against a glowing green circular radar scope in a dark room"
// Winnipeg'deki kontrolörler içindi; kare kokpitte, çizgili pilot üniformalı birinin elinde geldi. Yazar talimatı:
// hikâyenin aracı tipini ve biçimini, başka bir mekândaki kişiler o mekânın adını taşır.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the writer is told to name the story's vehicle type and the setting of people elsewhere", () => {
  const ds = fs.readFileSync(new URL("../src/pipeline/docu-script.js", import.meta.url), "utf8");
  assert.match(ds, /Hikâyenin kendi aracı \(uçak, gemi, tren, roket\) karede görünüyorsa TİPİNİ/);
  assert.match(ds, /a twin-engine Boeing 767-200, two engines, no upper-deck hump/);
  assert.match(ds, /air traffic controllers at a radar console in a ground control room/);
  // With the other picture rules: after the country rule, before the violence rule.
  assert.ok(ds.indexOf("TİPİNİ ve ayırt edici") > ds.indexOf("ÜLKEYİ ve ŞEHRİ"));
  assert.ok(ds.indexOf("TİPİNİ ve ayırt edici") < ds.indexOf("Şiddeti GÖSTERME"));
});

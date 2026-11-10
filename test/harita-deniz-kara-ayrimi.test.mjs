// DENİZ VE KARA İKİ AYRI TON (denizaltı çarpışması 20261024-373aaf — 25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 20261024-373aaf): engine-script.json sahne 74 "Between Brest and Faslane lay open ocean"
//   — kutu Britanya + Fransa, props'ta geo 52 kara halkası, 36 sınır: kara çiziliyordu. Videonun haritası konu kimliğinin
//   'grid' çizelgesi (script.topic.map, imperial-purple, bölüm 3 aksanı #d94a3a): deniz #04070c, kara #0c131b, oran
//   1,08:1 — iki ülke denizle aynı siyah, onları yalnızca ince kırmızı kıyı çizgisi ayırıyordu. on-izleme/f_0081.jpg
//   (kapı, high): "Harita yüklenmemiş: yalnızca boş bej vinyet zemin ve soluk 'FASLANE'/'BREST' etiketleri" — karede
//   kara 253/249/238, deniz 251/244/218. Aynı beyazdan kreme elips f_0034'te (sahne 29, "aşırı pozlanmış"), düz bej
//   f_0144'te (sahne 131): üçünde de kapının karesi sahnenin SON karesi (son kelime + 14 kare sahneyi aşıyor), kesmede
//   kare boyu bir örtü; altındaki haritada kara ile deniz zaten tek tondu. Her koyu çizelge 1,1-1,2:1 (uydu 1,16);
//   açık görünümün denizi (bg ile aksan %16) bölüm aksanıyla kâğıda 1,17:1'e kadar yaklaşıyordu; 188 tema/aksan
//   çiftinde kıyı çizgisi karaya ya da denize 3:1 tutmuyordu.
// Remotion ÇİZİLMEZ: map.tsx docu-engine'in kendi esbuild'iyle tek modül olarak derlenir; remotion/react ve çizim
//   modülleri boş vekil, renk ve görünüm modülleri gerçek.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../docu-engine/src/", import.meta.url));
const esbuild = createRequire(new URL("../docu-engine/package.json", import.meta.url))("esbuild");
// Real: the chart's theme and the colour/look modules it reads. Everything else map.tsx imports draws, and is a stub.
const REAL = new Set(["./map.tsx", "./genres", "./looks/color", "./looks/variants"]);
const built = await esbuild.build({
  stdin: { contents: "export * from './map.tsx'; export { GENRES } from './genres'; export { VARIANTS, applyVariant } from './looks/variants'; export { contrast, lum } from './looks/color';", resolveDir: SRC, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (a.kind === "entry-point" || REAL.has(a.path) ? undefined : { path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "module.exports = new Proxy({}, { get: (_, k) => (k === '__esModule' ? false : () => null) });", loader: "js" }));
    },
  }],
});
const M = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const { contrast, lum } = M;

// The submarine film's eight chapter accents, and a few more a chapter look can bring (deep navy, oxblood, white, black).
const ACCENTS = [undefined, "#3fe0c5", "#5aa9e6", "#2f6fb0", "#d94a3a", "#e3b341", "#f08a3c", "#9b5de5", "#8fb8c9", "#1f3a5f", "#5c0d04", "#ffffff", "#000000"];
const STYLES = [undefined, "grid", "paper", "satellite"];
const genre = (id, variant, style, accent) => {
  const base = M.GENRES[id];
  return { ...M.applyVariant(base, M.VARIANTS.find((v) => v.id === variant)), ...(style ? { mapStyle: style } : {}), ...(accent ? { accent } : {}) };
};

test("every chart: sea and land two tones, the coast a line against both", () => {
  assert.ok(M.MAP_LAND_CONTRAST >= 1.3, "the rule is the engine's own constant");
  let n = 0;
  const bad = [];
  for (const id of Object.keys(M.GENRES)) {
    for (const variant of [undefined, ...M.VARIANTS.filter((v) => v.genre === id).map((v) => v.id)]) {
      for (const style of STYLES) for (const accent of ACCENTS) {
        const T = M.mapTheme(genre(id, variant, style, accent));
        n++;
        const sl = contrast(T.sea, T.land);
        const cs = contrast(T.coast, T.sea);
        const cl = contrast(T.coast, T.land);
        if (sl < M.MAP_LAND_CONTRAST || cs < M.MAP_MARK_CONTRAST || cl < M.MAP_MARK_CONTRAST) bad.push(`${id}/${variant}/${style ?? "look"}/${accent ?? "-"}: sea ${T.sea} land ${T.land} ${sl.toFixed(2)}, coast ${T.coast} ${cs.toFixed(2)}/${cl.toFixed(2)}`);
      }
    }
  }
  assert.ok(n > 1500, `all themes checked (${n})`);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} of ${n} themes`);
});

test("the submarine film's chart (imperial-purple, topic 'grid', chapter 3 red): land lifts off the sea, the chart stays dark", () => {
  const T = M.mapTheme(genre("epic", "imperial-purple", "grid", "#d94a3a"));
  assert.ok(contrast(T.sea, T.land) >= M.MAP_LAND_CONTRAST, `${T.sea} / ${T.land}`);
  assert.equal(T.sea, "#04070c", "a dark chart keeps its sea; the land gives way");
  assert.ok(lum(T.land) < 0.05, `the land is still a dark slate: ${T.land}`);
  assert.equal(T.coast, "#d94a3a", "the chapter's red coast already reads on both");
  // A street map keeps its plan: land, streets and blocks move together, in the same order.
  assert.ok(lum(T.land) < lum(T.street) && lum(T.street) < lum(T.building), `${T.land} < ${T.street} < ${T.building}`);
});

test("a light look keeps its paper land; the sea gives way", () => {
  const T = M.mapTheme(genre("finance", "clean-white-editorial", undefined, "#3fe0c5"));
  assert.ok(contrast(T.sea, T.land) >= M.MAP_LAND_CONTRAST, `${T.sea} / ${T.land}`);
  assert.equal(T.land, "#ffffff");
  assert.ok(lum(T.sea) > 0.5, `still a pale sea: ${T.sea}`);
});

test("charts already apart are not touched (epic paper chart, documentary vintage)", () => {
  const epic = M.mapTheme(genre("epic", undefined));
  assert.deepEqual([epic.sea, epic.land, epic.coast], ["#9b9d80", "#e0c995", "#3f2b14"]);
  const doc = M.mapTheme(genre("documentary", undefined));
  assert.deepEqual([doc.sea, doc.land, doc.coast], ["#a9b4a2", "#ecdfbd", "#4a3520"]);
});

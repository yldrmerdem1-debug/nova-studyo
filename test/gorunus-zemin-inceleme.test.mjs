// Görünüş — zeminler, inceleme turu (29 Ekim 2026). Gimli 9ff721 önce/sonra: şema ve bölüm kartı zemini neredeyse siyah.
// İki uygulayıcının bıraktığı boşluklar: (1) openingFilter artık sarmalayıcıya hiçbir şey vermiyordu ama Engine soğuk
// açılış derecelendirmesini resim ruh haline eklemiyordu (soğuk açılış derecesi tamamen kaybolmuştu); (2) açıklayıcı /
// UI kartı / kendi resmi olmayan bölüm kartı için görünüş hiçbir ilgili resim taşımıyordu (DevicePlate boş kalıyordu).
// Ağ yok, ffmpeg yok, model yok: looks/resolve.ts esbuild ile paketlenir (React/remotion vekil), .tsx kaynağı okunur.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../docu-engine/src/", import.meta.url));
const read = (rel) => fs.readFileSync(SRC + rel, "utf8");
const esbuild = createRequire(new URL("../docu-engine/package.json", import.meta.url))("esbuild");

const STUB = [
  "const deep = () => new Proxy(function () { return deep(); }, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : deep()) });",
  "export default deep();",
  "export const jsx = deep(), jsxs = deep(), Fragment = deep(), AbsoluteFill = deep(), Easing = deep(), interpolate = deep(), useCurrentFrame = deep(), useVideoConfig = deep(), random = deep(), FONT = deep(), ELITE = deep(), MOTIF_FACES = deep(), TYPED_MOTIFS = deep(), h01 = deep(), morse = deep(), rng = deep(), useMemo = deep();",
].join("\n");
const REAL = ["./looks/resolve", "./catalog", "./color", "./counters", "./looks/variants", "./genres", "./looks/grades.tsx", "./looks/color"];
const built = await esbuild.build({
  stdin: { contents: "export * from './looks/resolve'; export { GENRES } from './genres';", resolveDir: SRC, loader: "ts" },
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => (a.kind === "entry-point" || REAL.some((r) => a.path === r || a.path.endsWith(r)) ? undefined : { path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
    },
  }],
});
const L = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

const photo = (o = {}) => ({ type: "photo", image: "a.jpg", say: "The Gimli runway at dusk.", chapter: 0, ...o });

test("devicePlateSource: açıklayıcı / UI kartı / resimsiz bölüm kartı yakındaki ilgili resmi alır; kendi resmi olan almaz", () => {
  const scenes = [
    photo({ image: "runway.jpg" }),
    { type: "explainer", say: "The fuel sum on the Gimli runway.", chapter: 0 },
    { type: "ui-card", say: "The gauge read zero.", chapter: 0 },
    { type: "title", chapterCard: true, title: "A RUNWAY FROM MEMORY", chapter: 0 },
    { type: "title", chapterCard: true, title: "OWN", image: "own.jpg", chapter: 0 },
    { type: "words", text: "Then silence.", say: "Then silence.", chapter: 0 },
  ];
  assert.equal(L.devicePlateSource(scenes, 1)?.image, "runway.jpg", "açıklayıcı ilgili resmi alır");
  assert.equal(L.devicePlateSource(scenes, 2)?.image, "runway.jpg", "UI kartı ilgili resmi alır");
  assert.equal(L.devicePlateSource(scenes, 3)?.image, "runway.jpg", "resimsiz bölüm kartı ilgili resmi alır");
  assert.equal(L.devicePlateSource(scenes, 4), undefined, "kendi resmi olan kart kendi resmini kullanır");
  assert.equal(L.devicePlateSource(scenes, 5), undefined, "başka sahne türü dokunulmaz");
  assert.equal(L.devicePlateSource(scenes, 1)?.from, undefined, "görünüşe yalnız resim alanları geçer");
  assert.equal(L.devicePlateSource([{ type: "explainer", say: "x", chapter: 0 }], 0), undefined, "resim yoksa plaka yok");
});

test("sceneLooks: cihaz sahnesinin görünüşü ilgili resmi taşır, yüzeyi değişmez; sayaç 'photo' resmi önceliklidir", () => {
  const g = L.GENRES.crime;
  assert.ok(g, "crime türü bulunmalı");
  const script = { id: "gimli", genre: "crime", chapters: ["A"], scenes: [photo({ image: "runway.jpg" }), { type: "explainer", say: "The fuel sum on the Gimli runway.", chapter: 0 }] };
  const looks = L.sceneLooks(script, g);
  assert.equal(looks[1].picture?.image, "runway.jpg");
  assert.equal(looks[1].surface, "dark", "cihazın yüzeyi eskisi gibi");
  assert.equal(looks[0].picture, undefined, "fotoğraf sahnesine plaka resmi eklenmez");
});

test("Engine: soğuk açılış derecesi resim ruh haline eklenir (withOpeningPictureFilter), sarmalayıcı filtresi boş kalır", () => {
  const eng = read("Engine.tsx");
  assert.match(eng, /const pictureMood = withOpeningPictureFilter\(off\.has\('grade'\) \? '' : moodFilter\(mood\.grade\), opening, p\.index\);/);
  assert.match(eng, /withOpeningPictureFilter,[\s\S]*?\} from '\.\/opening';/);
  assert.match(eng, /Gimli 9ff721 önce\/sonra, 29 Ekim 2026/);
});

test("düz bölüm kartı (scenes.tsx) kendi resmi yoksa görünüşün ilgili resmini plaka yapar", () => {
  const sc = read("scenes.tsx");
  const card = sc.slice(sc.indexOf("const ChapterCard: React.FC"), sc.indexOf("const ChapterCard: React.FC") + 12000);
  assert.match(card, /const cardPic = scene\.image \|\| scene\.video \? scene : lookPic/);
  assert.match(card, /\{cardPic \? \(/);
  assert.match(card, /src=\{cardPic\.image \?\? ''\}/);
});

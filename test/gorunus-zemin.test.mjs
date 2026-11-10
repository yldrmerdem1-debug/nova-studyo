// Görünüş — zeminler (29 Ekim 2026). Gimli 9ff721 önce/sonra: şema ve bölüm kartı zemini neredeyse siyah. 1. turda
// fotoğraflar renklendi (doygunluk 2,2 -> 14,0) ama parlaklık yalnız 48 -> 66, karanlık kare %44 -> %25 kaldı: telemetri
// şeması ('THE 1.77 FUEL SUM') #05070d üstünde, bölüm kartları siyah-kahverengi, 'framed' fotoğraf boş lacivert bir
// alanda 0.7 siyah halkayla. Bu dosya kuralı kilitler: karanlık görünüşte cihaz/kart zemini ORTA-KOYU (luma >= 45),
// ilgili resim yumuşak plaka (parlaklık >= 0.8, opaklık >= 0.45), siyah halka <= 0.3; açık görünüşte her cihaz açık
// motif paletini KENDİLİĞİNDEN alır; soğuk açılış derecelendirmesi yazıya değmez.
// Ağ yok, ffmpeg yok, model yok: motifs.tsx esbuild ile paketlenir (React/remotion/fontlar vekil), diğer .tsx okunur.
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
  "export const jsx = deep(), jsxs = deep(), Fragment = deep(), AbsoluteFill = deep(), interpolate = deep(), useCurrentFrame = deep(), useMemo = deep(), FONT = deep(), ELITE = deep(), MOTIF_FACES = deep(), TYPED_MOTIFS = deep(), h01 = deep(), morse = deep(), rng = deep();",
].join("\n");
const REAL = ["./topic/motifs.tsx", "../looks/color", "../looks/variants"];
const built = await esbuild.build({
  stdin: {
    contents:
      "export * from './topic/motifs.tsx'; export { contrast, isLight } from './looks/color'; export { isLightVariant } from './looks/variants';",
    resolveDir: SRC,
    loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      const real = (p) => p === "./looks/color" || p === "./looks/variants" || REAL.some((r) => p === r || p.endsWith(r));
      b.onResolve({ filter: /.*/ }, (a) => (a.kind === "entry-point" || real(a.path) ? undefined : { path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
    },
  }],
});
const M = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

const MOTIFS = ["cipher", "telegraph", "ticker", "telemetry", "electric", "case-file", "expedition", "siege"];
const topic = (motif, extra = {}) => ({ topic: { motif, ...extra }, motif, seed: "t", locale: "en-US" });
const DARK = { id: "documentary", light: false };

/* ---------------------------------------------------------------- yardımcı */

test("groundLuma: Rec.601 0-255; eşik 45; açık-koyu ayrımı", () => {
  assert.equal(M.DEVICE_GROUND_MIN_LUMA, 45);
  assert.equal(M.groundLuma("#000000"), 0);
  assert.ok(Math.abs(M.groundLuma("#ffffff") - 255) < 1e-9);
  assert.ok(M.groundLuma("#2b313b") >= 45 && M.groundLuma("#3a3128") >= 45, "görevdeki örnek orta-koyular");
  assert.ok(M.groundLuma("#05070d") < 10, "eski telemetri zemini");
  assert.ok(Number.isNaN(M.groundLuma("red")));
  assert.ok(M.groundLuma(M.liftGround("#05070d", "#dfe7f2")) >= 45, "kaldırılan zemin eşiği geçer");
  assert.equal(M.liftGround("#45362a", "#e6d3ab"), "#45362a", "eşik üstü renk değişmez");
});

/* ---------------------------------------------------------------- motif zeminleri */

test("her motifin TABAN zemini (ground + ground2) karanlık görünüşte luma >= 45 ama hâlâ koyu", () => {
  for (const m of MOTIFS) {
    const b = M.motifBase(m);
    for (const k of ["ground", "ground2"]) {
      const y = M.groundLuma(b[k]);
      assert.ok(y >= M.DEVICE_GROUND_MIN_LUMA, `${m}.${k} ${b[k]} luma ${y.toFixed(1)} < 45`);
      assert.ok(!M.isLight(b[k]) && y <= 110, `${m}.${k} ${b[k]} koyu görünüşte orta-koyu kalır (${y.toFixed(1)})`);
    }
  }
});

test("karanlık palet: zemin >= 45, mürekkep/sönük/vurgular zeminde okunur; konu vurgusu zemini karartmaz", () => {
  for (const m of MOTIFS) {
    const P = M.motifPalette(topic(m), DARK);
    assert.equal(P.light, false, m);
    assert.ok(M.groundLuma(P.ground) >= 45 && M.groundLuma(P.ground2) >= 45, `${m}: ${P.ground}/${P.ground2}`);
    assert.ok(M.contrast(P.ink, P.ground) >= 4.5, `${m} mürekkep ${P.ink}`);
    assert.ok(M.contrast(P.dim, P.ground) >= 3, `${m} sönük ${P.dim}`);
    assert.ok(M.contrast(P.accent, P.ground) >= 3 && M.contrast(P.accent2, P.ground) >= 3, `${m} vurgu ${P.accent}/${P.accent2}`);
    const dark = M.motifPalette(topic(m, { accent: "#101010", accent2: "#0a0a0a" }), DARK);
    assert.ok(M.contrast(dark.accent, dark.ground) >= 3, `${m}: koyu konu vurgusu okunur hale itilir`);
    assert.ok(M.groundLuma(dark.ground) >= 45, `${m}: zemin konu vurgusundan etkilenmez`);
  }
});

test("açık görünüş: palet KENDİLİĞİNDEN açık (genre.light ya da açık varyant); darkMotifPalette gece sürümünü zorlar", () => {
  assert.equal(M.isLightVariant("salmon-paper"), true);
  assert.equal(M.isLightLook({ light: true }), true);
  assert.equal(M.isLightLook({ light: false, variant: "salmon-paper" }), true, "koyu yüzeyli sahne türü, açık varyant");
  assert.equal(M.isLightLook({ light: false, variant: "evidence-yellow" }), false);
  assert.equal(M.isLightLook(null), false);
  for (const m of MOTIFS) {
    for (const g of [{ id: "documentary", light: true }, { id: "documentary", light: false, variant: "salmon-paper" }]) {
      const P = M.motifPalette(topic(m), g); // light parametresi YOK: görünüş karar verir
      assert.equal(P.light, true, `${m} ${JSON.stringify(g)}`);
      assert.ok(M.isLight(P.ground) && M.isLight(P.ground2), `${m}: açık zemin ${P.ground}/${P.ground2}`);
      assert.ok(M.contrast(P.ink, P.ground) >= 4.5, `${m}: koyu mürekkep okunur`);
      assert.ok(M.contrast(P.accent, P.ground) >= 3, `${m}: vurgu kâğıtta okunur`);
    }
    const N = M.darkMotifPalette(topic(m), { id: "documentary", light: true, variant: "salmon-paper" });
    assert.equal(N.light, false, `${m}: zorlanan gece sürümü`);
    assert.ok(M.groundLuma(N.ground) >= 45);
  }
});

/* ---------------------------------------------------------------- plaka, halka */

test("plaka sabitleri: parlaklık >= 0.8, opaklık >= 0.45, halka <= 0.3; ilgili resim seçimi", () => {
  assert.ok(M.DEVICE_PLATE.brightness >= 0.8 && M.DEVICE_PLATE.opacity >= 0.45, JSON.stringify(M.DEVICE_PLATE));
  assert.ok(M.DEVICE_PLATE.ring <= 0.3 && M.DEVICE_PLATE.lightRing <= M.DEVICE_PLATE.ring);
  assert.ok(M.PRESENT_PLATE.brightness >= 0.8 && M.PRESENT_PLATE.ring <= 0.3 && M.PRESENT_PLATE.lightRing <= 0.3);
  for (const s of [M.deviceRing(false), M.deviceRing(true), M.deviceRing(false, 0.9)]) {
    const a = Math.max(...[...s.matchAll(/rgba\(0,0,0,([\d.]+)\)/g)].map((x) => Number(x[1])));
    assert.ok(a <= 0.3, `halka ${s}`);
  }
  assert.match(M.typeScrim({ ground: "#2f3947" }, 0.55), /^radial-gradient\(/, "yazının arkasında yerel geçiş");
  assert.deepEqual(M.devicePicture({ image: "a.jpg" }, null), { image: "a.jpg", video: undefined, videoStart: undefined, videoDur: undefined, videoW: undefined, videoH: undefined });
  assert.equal(M.devicePicture({ video: "c.mp4", videoStart: 2 }).video, "c.mp4");
  assert.equal(M.devicePicture({ images: ["m.jpg"] }).image, "m.jpg");
  assert.deepEqual(M.devicePicture({ type: "explainer" }, { picture: { image: "rel.jpg" } }), { image: "rel.jpg" }, "sahnenin resmi yoksa görünüşün ilgili resmi");
  assert.equal(M.devicePicture({ type: "explainer" }, {}), undefined);
});

/* ---------------------------------------------------------------- kaynak: cihazlar */

test("motifPalette görünüşü kendi okur; hiçbir çağıran 'false' geçmez; perde de otomatik", () => {
  const motifs = read("topic/motifs.tsx");
  assert.ok(motifs.includes("light = light || isLightLook(g);"));
  assert.ok(motifs.includes("Gimli 9ff721 önce/sonra, 29 Ekim 2026: şema ve bölüm kartı zemini neredeyse siyah"));
  for (const f of ["cards", "explainer", "diagram", "caption", "icons", "uicard", "presentation", "index"]) {
    const src = read(`topic/${f}.tsx`);
    assert.ok(!/motifPalette\([^)]*,\s*false\)/.test(src), `${f}.tsx motifPalette(..., false)`);
  }
  assert.ok(read("topic/index.tsx").includes("const P = motifPalette(t, genre);"), "TopicWipe");
  assert.ok(read("topic/icons.tsx").includes("const P = motifPalette(t, genre);"), "ikonlar paleti okur");
  for (const f of ["explainer", "uicard", "presentation"]) assert.ok(read(`topic/${f}.tsx`).includes("const light = isLightLook(genre);"), f);
});

test("şema, kart ve altyazı: elle yazılmış gece zeminleri yok; plaka cihazın arkasında", () => {
  const ex = read("topic/explainer.tsx");
  for (const bad of ["#2a1d10", "#12202c"]) assert.ok(!ex.includes(bad), `explainer ${bad}`);
  assert.ok(ex.includes("<DevicePlate pic={pic} P={P} durFrames={durFrames} />") && ex.includes("deviceGround(P"), "açıklayıcı plakası ve zemini");
  const dg = read("topic/diagram.tsx");
  for (const bad of ["#0d1a2c", "rgba(3,6,12,0.85)", 'fill="#0e1a24"', "#191715"]) assert.ok(!dg.includes(bad), `diagram ${bad}`);
  const ui = read("topic/uicard.tsx");
  for (const bad of ["dim={light ? 0.9 : 0.25}", "'#0b120d'", "'#0f1114'", "rgba(0,0,0,0.7)"]) assert.ok(!ui.includes(bad), `uicard ${bad}`);
  assert.ok(ui.includes("<DevicePlate pic={devicePicture(scene, look)} P={G} durFrames={durFrames} />"));
  const cards = read("topic/cards.tsx");
  for (const bad of ["'#0b0c0b'", "'#161714'", "#050505", "rgba(0,0,0,0.75)", "rgba(0,0,0,0.8)"]) assert.ok(!cards.includes(bad), `cards ${bad}`);
  assert.ok(cards.includes("const pic = devicePicture(scene, look);"), "bölüm kartı ilgili resmi görünüşten de alır");
  assert.ok(cards.includes("dim={DEVICE_PLATE.brightness}") && cards.includes("opacity = DEVICE_PLATE.opacity"));
  const cap = read("topic/caption.tsx");
  for (const bad of ["rgba(3,6,12", "rgba(15,16,18", "'#e8eef8'", "rgba(6,12,18"]) assert.ok(!cap.includes(bad), `caption ${bad}`);
  const ic = read("topic/icons.tsx");
  assert.ok(!ic.includes("rgba(0,0,0,0.62)"), "ikon havuzu 0.62 siyah değil");
});

test("sunum: çerçevenin çevresi fotoğrafın kendi plakası (parlaklık >= 0.8), halka <= 0.3, çerçeve büyük", () => {
  const src = read("topic/presentation.tsx");
  for (const bad of ["rgba(0,0,0,0.7) 90%", "background: light ? P.ground2 : '#000'", "dim={0.22}", "dim={light ? 0.9 : 0.3}", "dim={light ? 0.9 : 0.34}", "rgba(10,9,8,0.82)", "background: '#0c0a08'", "background: '#1b140c'"]) {
    assert.ok(!src.includes(bad), `presentation ${bad}`);
  }
  assert.ok(src.includes("dim={PRESENT_PLATE.brightness}"), "sunum plakası PRESENT_PLATE parlaklığında");
  const box = /export const FRAMED_BOX = \{ w: (\d+), h: (\d+) \}/.exec(src);
  assert.ok(box && Number(box[1]) >= 1200 && Number(box[2]) >= 760, `çerçeve ${box?.[0]}`);
  // Her dört sunum da plakayı çizer (lightbox, print, film-frame, framed).
  assert.ok((src.match(/\{plate\(/g) ?? []).length >= 4, "dört sunum da fotoğrafın plakası üstünde");
});

/* ---------------------------------------------------------------- soğuk açılış */

test("soğuk açılış derecelendirmesi yalnız resme: openingFilter sarmalayıcıya hiçbir şey vermez", () => {
  const src = read("opening/index.tsx");
  const wrap = src.slice(src.indexOf("export function openingFilter"), src.indexOf("export function openingPictureFilter"));
  assert.ok(wrap.includes("return undefined;") && !wrap.includes("COLD_GRADE"), "sarmalayıcı filtresi yok");
  const pic = src.slice(src.indexOf("export function openingPictureFilter"), src.indexOf("export function withOpeningPictureFilter"));
  assert.ok(pic.includes("m.op.kind !== 'cold-open'") && pic.includes("COLD_GRADE"), "resim katmanı için soğuk derecelendirme");
  assert.ok(src.includes("return [mood, openingPictureFilter(m, index)].filter(Boolean).join(' ');"));
  // Bekleyen sayacın tuttuğu resim: kenar en çok 0.3, merkez yerel.
  assert.ok(src.includes("Math.min(0.3, scrim * 0.5)") && !src.includes("Math.min(0.9, scrim + 0.3)"));
});

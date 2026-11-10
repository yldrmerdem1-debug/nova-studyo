// Görünüş — motor (29 Ekim 2026). Gimli 20261028-9ff721 / Kartal Yuvası 950730 ve son yedi video: ortalama parlaklık
// 52-75, doygunluk 2,5-7,5, karelerin %21-39'u luma < 40 ("her video siyah, karanlık, birbirinin aynı"). En iyi video
// Panama ('color' derecelendirme) 88 / 10,2 ölçtü. Bu dosya motorun yeni görünüş kuralını kilitler: renk varsayılan,
// gerçek arşiv fotoğrafı rengini korur, vinyet tavanı, letterbox isteğe bağlı, ruh hali yalnız resme, yumuşak seçici
// renk, açık bölüm kartları ve motif paletleri, bölüm kartı geçişi videonun kendi paletinden.
// Ağ yok, ffmpeg yok, model yok: saf TS modülleri esbuild ile paketlenir (React/remotion vekil), .tsx kaynağı okunur.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../docu-engine/src/", import.meta.url));
const read = (rel) => fs.readFileSync(SRC + rel, "utf8");
const esbuild = createRequire(new URL("../docu-engine/package.json", import.meta.url))("esbuild");

// Çizen her şey (react, remotion, fontlar) vekil; seçilen modüller gerçek.
const STUB = [
  "const deep = () => new Proxy(function () { return deep(); }, { get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : deep()) });",
  "export default deep();",
  "export const jsx = deep(), jsxs = deep(), Fragment = deep(), AbsoluteFill = deep(), Easing = deep(), interpolate = deep(), useCurrentFrame = deep(), useVideoConfig = deep(), random = deep(), FONT = deep(), ELITE = deep(), MOTIF_FACES = deep(), TYPED_MOTIFS = deep(), h01 = deep(), morse = deep(), rng = deep(), useMemo = deep();",
].join("\n");
async function load(entry, real) {
  const built = await esbuild.build({
    stdin: { contents: entry, resolveDir: SRC, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", jsx: "automatic", logLevel: "silent",
    plugins: [{
      name: "stub",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => (a.kind === "entry-point" || real.some((r) => a.path === r || a.path.endsWith(r)) ? undefined : { path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: STUB, loader: "js" }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
}

// Saf modüller gerçek: renk derecelendirme kararı, varyantlar, türler.
const PURE = ["./looks/resolve", "./catalog", "./color", "./counters", "./looks/variants", "./genres", "./looks/grades.tsx", "./looks/color"];
const L = await load(
  "export * from './looks/resolve'; export { VARIANTS, applyVariant, variantFor, isLightVariant } from './looks/variants'; export { GENRES } from './genres'; export { gradeFilter, applyGrade, NO_GRADE_FILTER } from './looks/grades.tsx'; export { contrast, isLight } from './looks/color';",
  PURE,
);
const M = await load("export { lightMotifColours } from './topic/motifs.tsx';", ["./topic/motifs.tsx", "../looks/color"]);

const genreOf = (id, variant) => L.applyVariant(L.GENRES[id], L.variantFor(id, variant));
const photo = (o = {}) => ({ type: "photo", image: "a.jpg", say: "x", chapter: 0, ...o });

/* ---------------------------------------------------------------- renk varsayılan */

test("derecelendirme: son çare 'color', asla 'duotone'; bölüm seçimi geçer; varyantın renksiz varsayılanı taban değil", () => {
  const plain = { ...L.GENRES.crime };
  assert.equal(L.FALLBACK_GRADE, "color");
  assert.equal(L.sceneGrade(photo(), {}, plain), "color", "hiçbir şey yoksa renk");
  assert.equal(L.sceneGrade(photo(), { grade: "cool" }, plain), "cool", "bölümün renkli derecelendirmesi");
  assert.equal(L.sceneGrade(photo(), { grade: "selective" }, plain), "selective", "AI resmi: bölümün vurgusu (tek bölüm, sanat yönetmeni seçer)");
  // Varyantların renksiz varsayılanları (mono, duotone, bleach, cyanotype) bütün videonun tabanı olmaz.
  for (const v of L.VARIANTS) {
    const g = genreOf(v.genre, v.id);
    const got = L.sceneGrade(photo(), {}, g, 1990);
    assert.ok(!L.DESATURATING_GRADES.has(got), `${v.id}: ${v.grade} -> ${got}`);
    if (!L.DESATURATING_GRADES.has(v.grade)) assert.equal(got, v.grade, `${v.id}: renkli varyant kendi derecelendirmesini korur`);
  }
  // Renkli film öncesi (1940'tan önce) sepya taban serbest; sonrası değil.
  const sepia = genreOf("epic", "war-map-sepia");
  assert.equal(L.sceneGrade(photo(), {}, sepia, 1912), "sepia");
  assert.equal(L.sceneGrade(photo(), {}, sepia, 1969), "color");
  assert.equal(L.sceneGrade(photo(), {}, genreOf("documentary", "swiss-editorial"), 1912), "color", "mono taban 1912'de de yok");
});

test("gerçek arşiv fotoğrafı/klibi renksiz derecelendirmeyi miras almaz (monoSource ya da sahnenin kendi seçimi hariç)", () => {
  const g = { ...L.GENRES.documentary, grade: "mono" };
  for (const grade of ["selective", "mono", "duotone", "sepia", "cyanotype", "bleach"]) {
    assert.equal(L.sceneGrade(photo({ archived: true }), { grade }, g), "color", `arşiv + bölüm ${grade}`);
    assert.equal(L.sceneGrade(photo({ video: "c.mp4", sourceLabel: "Video: X · Oct 2026" }), { grade }, g), "color", `kaynak klip + bölüm ${grade}`);
    assert.equal(L.sceneGrade(photo({ archived: true, monoSource: true }), { grade }, g), grade, `siyah-beyaz kaynak işaretli: ${grade}`);
    assert.equal(L.sceneGrade(photo({ archived: true, grade }), { grade: "warm" }, g), grade, `plan bu sahneye ${grade} dedi`);
  }
  assert.equal(L.sceneGrade(photo({ archived: true }), { grade: "teal-orange" }, g), "teal-orange", "renkli bölüm derecelendirmesi arşive de geçer");
  assert.ok(L.isArchivePicture({ archived: true }) && L.isArchivePicture({ sourceLabel: "x" }) && !L.isArchivePicture({ image: "ai.png" }));
});

test("sceneLooks: Kartal Yuvası düzeni — selective bölümde arşiv renkli, AI resmi vurguda; tabansız video renkli", () => {
  const genre = genreOf("crime", "evidence-yellow"); // orijinal: grade 'duotone'
  const script = {
    id: "kartal", genre: "crime", era: "1945", look: { variant: "evidence-yellow" },
    chapters: ["A", "B"], chapterLooks: [null, { grade: "selective" }],
    scenes: [photo({ chapter: 0 }), photo({ chapter: 0, archived: true }), photo({ chapter: 1, archived: true }), photo({ chapter: 1 }), { type: "words", text: "Then it burned.", say: "Then it burned.", chapter: 1 }],
  };
  const grades = L.sceneLooks(script, genre).map((x) => x.grade);
  assert.deepEqual(grades.slice(0, 4), ["color", "color", "color", "selective"]);
  assert.ok(!grades.includes("duotone"), grades.join(","));
});

test("derecesiz resim: NO_GRADE_FILTER doğal renk, url(#duo) değil; Media görünüş bağlamı yoksa renk çizer", () => {
  assert.equal(L.NO_GRADE_FILTER, "contrast(1.06) saturate(1.05)");
  assert.equal(L.gradeFilter(undefined), L.NO_GRADE_FILTER);
  assert.equal(L.applyGrade("url(#duo) blur(2px)", undefined), "contrast(1.06) saturate(1.05) blur(2px)");
  assert.equal(L.applyGrade("url(#duo)", "color"), "contrast(1.06) saturate(1.1)");
  assert.equal(L.applyGrade("url(#duo)", "duotone"), "url(#duo)", "açıkça seçilen duotone kalır");
  const fx = read("fx.tsx");
  assert.ok(fx.includes("const grade = look === DEFAULT_LOOK ? undefined : look.grade;"), "Media: bağlamsız = derecesiz");
  assert.ok(fx.includes("gradeFilter(look === DEFAULT_LOOK ? undefined : look.grade)"), "LayeredPhoto da");
});

/* ---------------------------------------------------------------- vinyet, letterbox */

test("vinyet: tavan 0.35; tür ve varyant değerleri 0.4'ü aşmaz", () => {
  assert.equal(L.VIGNETTE_MAX, 0.35);
  assert.equal(L.globalVignette(0.9), 0.35);
  assert.equal(L.globalVignette(0.12), 0.12);
  assert.equal(L.globalVignette(undefined), 0);
  for (const [id, g] of Object.entries(L.GENRES)) assert.ok(g.vignette <= 0.4, `${id}: ${g.vignette}`);
  for (const v of L.VARIANTS) if (v.set.vignette != null) assert.ok(v.set.vignette <= 0.4 && v.set.vignette >= 0.1 - 1e-9, `${v.id}: ${v.set.vignette}`);
  const fx = read("fx.tsx");
  assert.ok(fx.includes("const k = globalVignette(strength);"), "Vignette bileşeni de sınırlar");
  assert.ok(read("Engine.tsx").includes("<Vignette strength={globalVignette(genre.vignette)} />"));
});

test("letterbox: yalnız script.letterbox === true; resolveGenre düzen bayrağını da kapatır (soğuk açılış kendi çubuklarını çizer)", () => {
  assert.equal(L.wantsLetterbox({}), false);
  assert.equal(L.wantsLetterbox({ letterbox: "yes" }), false);
  assert.equal(L.wantsLetterbox(null), false);
  assert.equal(L.wantsLetterbox({ letterbox: true }), true);
  const eng = read("Engine.tsx");
  const rg = eng.slice(eng.indexOf("export function resolveGenre"), eng.indexOf("export interface Placed"));
  assert.ok(rg.includes("letterbox: wantsLetterbox(script as { letterbox?: unknown })"), "tür çözümü");
  assert.ok(eng.includes("{genre.letterbox && !off.has('letterbox') ? <Letterbox animate={false} /> : null}"));
  assert.ok(read("opening/index.tsx").includes("{ ...genre, letterbox: true }"), "soğuk açılış çubukları kendi işi");
});

/* ---------------------------------------------------------------- ruh hali */

test("ruh hali filtresi yalnız resim katmanında ve yumuşak: dread .9/.97, sad .85/.97, tension .97/.99", () => {
  const moods = JSON.parse(read("moods.json"));
  const want = { dread: [0.9, 0.97], sad: [0.85, 0.97], tension: [0.97, 0.99] };
  for (const [m, [sat, br]] of Object.entries(want)) {
    assert.equal(moods[m].grade.saturate, sat, `${m} saturate`);
    assert.equal(moods[m].grade.brightness, br, `${m} brightness`);
  }
  for (const [m, x] of Object.entries(moods)) {
    assert.ok(x.grade.saturate >= 0.85 && x.grade.brightness >= 0.97, `${m}: ${JSON.stringify(x.grade)}`);
    assert.ok(Math.abs(x.grade.hue) <= 5, `${m}: hue ${x.grade.hue}`);
  }
  assert.equal(L.moodFilter(moods.curious.grade), "", "nötr ruh hali filtre eklemez");
  assert.equal(L.moodFilter(moods.dread.grade), "saturate(0.9) brightness(0.97) hue-rotate(-4deg)");
  const eng = read("Engine.tsx");
  assert.ok(!eng.includes("off.has('grade') ? '' : grade, opFilter"), "sahne sarmalayıcısında ruh hali filtresi yok");
  assert.ok(eng.includes("filter: opFilter || undefined }}"), "sarmalayıcıda yalnız açılışın filtresi");
  assert.match(eng, /<PictureMoodContext\.Provider value=\{pictureMood\}>\s*<FxStack/);
  const fx = read("fx.tsx");
  assert.ok(fx.includes("export const PictureMoodContext = React.createContext<string>('');"));
  const media = fx.slice(fx.indexOf("export const Media"), fx.indexOf("export const SoftPlate"));
  assert.ok(media.includes("useContext(PictureMoodContext)") && media.includes("withMood(graded, mood)"), "Media ruh halini resme ekler");
});

/* ---------------------------------------------------------------- seçici renk, ilgili zemin, soğuk açılış */

test("seçici renk yumuşadı: ten gri kalır, güçlü kırmızı renkli, gri ortalar 0.34", () => {
  const src = read("topic/index.tsx");
  const m = /export const SELECTIVE_MASK = '([-\d.]+) ([-\d.]+) ([-\d.]+) 0 ([-\d.]+)';/.exec(src);
  assert.ok(m, "SELECTIVE_MASK");
  const [r, g, b, o] = m.slice(1).map(Number);
  assert.ok(r <= 8 && r >= 7, `eğim yumuşak: ${r} (eski 12)`);
  assert.ok(o > -4.8 && o <= -2.4, `eşik: ${o}`);
  const a = ([R, G, B]) => r * R + g * G + b * B + o;
  for (const skin of [[0.95, 0.65, 0.55], [0.85, 0.65, 0.55], [0.6, 0.4, 0.3], [0.8, 0.55, 0.45]]) assert.ok(a(skin) <= 0.05, `ten ${skin}: ${a(skin)}`);
  for (const hot of [[1, 0, 0], [0.9, 0.15, 0.15], [1, 0.55, 0.1], [0.75, 0.3, 0.25]]) assert.ok(a(hot) >= 1, `renk ${hot}: ${a(hot)}`);
  const grey = /export const SELECTIVE_GREY = '([^']+)';/.exec(src)[1].split(" ").map(Number);
  assert.equal(grey[2], 0.34);
  assert.ok(src.includes("values={`0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${SELECTIVE_MASK}`}"));
  assert.ok(!src.includes("12 -6 -6 0 -4.8"));
});

test("ilgili zemin: parlaklık 0.8, doygunluk 1, çarpma 0.15, merkez 0.22 / kenar 0.42; açık ton renkli", () => {
  const src = read("looks/backdrops.tsx");
  assert.ok(src.includes("export const RELATED_DIM = { brightness: 0.8, saturate: 1, multiply: 0.15, centre: 0.22, mid: 0.16, edge: 0.42 } as const;"));
  assert.ok(src.includes("brightness(${RELATED_DIM.brightness}) saturate(${RELATED_DIM.saturate})"));
  assert.ok(src.includes("opacity: RELATED_DIM.multiply, mixBlendMode: 'multiply'"));
  assert.ok(!src.includes("layer('url(#duo) grayscale(1)") && src.includes("{layer(RELATED_LIGHT_FILTER, {"), "açık ton artık gri değil");
  assert.ok(!src.includes("brightness(0.58)") && !src.includes("rgba(0,0,0,0.62)"));
  const light = /export const RELATED_LIGHT_FILTER = '([^']+)';/.exec(src)[1];
  assert.ok(!light.includes("grayscale"), light);
  const sat = Number(/saturate\(([\d.]+)\)/.exec(light)[1]);
  assert.ok(sat >= 0.6 && sat <= 1, `açık ton doygunluğu ${sat}`);
});

test("soğuk açılış derecelendirmesi rengi bırakır: contrast(1.1) saturate(0.9) brightness(1)", () => {
  assert.ok(read("opening/layers.tsx").includes("export const COLD_GRADE = 'contrast(1.1) saturate(0.9) brightness(1)';"));
});

/* ---------------------------------------------------------------- bölüm kartı, motif paletleri */

test("bölüm kartı görünüşü izler: açık varyantta kâğıt zemin; plaka ~0.8, karartma ~0.15, siyah halka ≤ 0.3", () => {
  const src = read("topic/cards.tsx");
  assert.ok(!src.includes("const light = false;"), "kart artık hep karanlık değil");
  assert.ok(src.includes("const light = genre.light === true || isLightVariant(genre.variant);"));
  assert.ok(src.includes("const P = motifPalette(t, genre, light);"));
  const plate = /export const CARD_PLATE = \{ opacity: ([\d.]+), dim: ([\d.]+), ring: ([\d.]+), lightRing: ([\d.]+)/.exec(src);
  assert.ok(plate, "CARD_PLATE");
  const [op, dim, ring, lightRing] = plate.slice(1).map(Number);
  assert.ok(op >= 0.75 && op <= 0.85, `plaka ${op}`);
  assert.ok(dim <= 0.2, `karartma ${dim}`);
  assert.ok(ring <= 0.3 && lightRing <= ring, `halka ${ring}/${lightRing}`);
  assert.ok(src.includes("dim={1 - CARD_PLATE.dim}"), "SoftPlate parlaklığı 1 - karartma");
  assert.ok(!src.includes("rgba(0,0,0,0.6) 100%)' }} />"), "eski 0.6 siyah halka yok");
  assert.equal(L.isLightVariant("salmon-paper"), true);
  assert.equal(L.isLightVariant("evidence-yellow"), false);
  assert.equal(L.isLightVariant(undefined), false);
  assert.equal(L.isLightVariant("yok-boyle-bir-varyant"), false);
});

test("motif paletinin açık sürümü: kâğıt zemin, koyu mürekkep okunur, vurgular zeminde okunur", () => {
  const dark = { ground: "#0c121a", ground2: "#06090e", paper: "#ece3cc", paperInk: "#2a2219", ink: "#efe8d6", dim: "#8e9aa6", accent: "#ffb547", accent2: "#e2563b" };
  const c = M.lightMotifColours(dark);
  assert.ok(L.isLight(c.ground) && L.isLight(c.ground2), `zemin ${c.ground}/${c.ground2}`);
  assert.ok(L.contrast(c.ink, c.ground) >= 4.5, `mürekkep ${c.ink}`);
  assert.ok(L.contrast(c.accent, c.ground) >= 3 && L.contrast(c.accent2, c.ground) >= 3, `vurgu ${c.accent}/${c.accent2}`);
  const motifs = read("topic/motifs.tsx");
  assert.ok(motifs.includes("export function motifPalette(t: TopicCtx, g: Genre, light = false): MotifPalette {"));
  assert.ok(motifs.includes("...(light ? lightMotifColours(colours) : {}),"));
  // Açık görünüş bağlantıları: açıklayıcı, arayüz kartı, sunum, harita.
  assert.ok(read("topic/explainer.tsx").includes("const P = motifPalette(t, genre, light);"));
  assert.ok(read("topic/uicard.tsx").includes("const G = light ? motifPalette(t, genre, true) : P;"));
  assert.ok(read("topic/presentation.tsx").includes("const P = motifPalette(t, genre, light);"));
  assert.ok(read("map.tsx").includes("if (g.light && g.mapStyle !== 'paper') return { ...lookTheme(g),"), "açık görünüşte gece haritası yok");
});

/* ---------------------------------------------------------------- bölüm kartı geçişi */

test("bölüm kartı geçişi videonun kendi paletinden; karartma ya da kesme imza olmaz", () => {
  assert.equal(L.chapterSignature(["blackout", "whip", "flash"], "blackout"), "whip");
  assert.equal(L.chapterSignature(["cut", "blackout"], "blackout"), "blackout", "palette uygun tür yoksa türün kendi imzası");
  assert.equal(L.chapterSignature([], "flash"), "flash");
  assert.equal(L.chapterSignature(undefined, "leak"), "leak");
  const eng = read("Engine.tsx");
  const place = eng.slice(eng.indexOf("export function place"), eng.indexOf("export function totalFrames"));
  assert.ok(place.includes("chapterSignature(ownPalette, genre.transition)"));
  assert.ok(place.includes("legacyPool: TRANSITION_SET[genre.id] ?? TRANSITION_SET.documentary, signature });"));
});

// GÖRÜNÜŞ: İSTEMLER PARLAK, İYİ POZLANMIŞ, DOĞAL RENKLİ KARE İSTER.
//
// ÖLÇÜLEN KUSUR (29 Ekim 2026, son 7 video, ffmpeg signalstats): ortalama parlaklık 52-75, doygunluk 2,5-7,5, karelerin
// %21-39'u parlaklık 40'ın altında (Gimli 20261028-9ff721 / Kartal Yuvası 950730 en karanlıkları: 52-56 / 2,5-6). Kanal
// sahibi: "her video siyah, karanlık, aynı". En iyi video Panama (doğal renk) 88 / 10,2 ölçüldü.
// İstem tarafındaki kökler: visualStyle şema örneği siyah-beyaz Tri-X; türlerin `when` metnindeki palet kelimeleri
// ("soğuk mavi-gri", "yeşil-siyah", "karanlık, siyah geçişler") visualStyle'a sızıyordu; SAHNE DİLİ silüet/gölge/gece
// öneriyordu; çeşitleme "night, practical lights" ekliyordu; gerçek kişi "in silhouette" çiziliyordu; karanlık kare 62
// parlaklığa kadar açılmıyordu; Shorts 1850-1954 her hikâyeyi siyah-beyaz istiyor, Noir/Dossier görünüşleri rengi
// siliyor, bulanık dolgu -0,28 parlaklıkla kararıyordu.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as DS from "../src/pipeline/docu-script.js";
import { exposedStyle, styleFor, EXPOSURE, EXPOSURE_MONO, hideRealFace, HIDDEN_FACE, LIFT_FLOOR, liftGamma } from "../docu-engine/lib/produce.mjs";
import { newPictureStyle } from "../src/pipeline/docu-shorts.js";
import { archiveIsMono, chromaOf, MONO_CHROMA, darkLift, DARK_LIFT_FLOOR, BLUR_FILL, anonymise } from "../src/pipeline/docu-shorts-pictures.js";
import { SHORT_LOOKS, lookSaturation, MIN_LOOK_SATURATION, pictureFilter } from "../src/pipeline/docu-shorts-looks.js";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const SCRIPT_SRC = read("src/pipeline/docu-script.js");

/* ------------------------------------------------------------------ yazarın gördüğü metin */

test("tür metni (when) palet ve karanlık kelimesi taşımaz; renk vurgusu yazara gitmeyen accent alanında", () => {
  const PALETTE = /mavi-gri|yeşil-siyah|bronz-altın|lacivert-camgöbeği|karanlık|siyah geçiş|kan kırmızısı|sıcak ışık/i;
  for (const g of DS.DOCU_GENRES) {
    assert.doesNotMatch(g.when, PALETTE, `${g.id}: ${g.when}`);
    assert.doesNotMatch(DS.genreBrief(g.id), PALETTE, `${g.id}: genreBrief yazara palet veriyor`);
    if (g.accent) assert.ok(!DS.genreBrief(g.id).includes(g.accent), `${g.id}: accent yazara gitmemeli`);
  }
  const by = Object.fromEntries(DS.DOCU_GENRES.map((g) => [g.id, g]));
  assert.equal(by.crime.accent, "soğuk mavi-gri");
  assert.equal(by.epic.accent, "bronz-altın");
  assert.doesNotMatch(by.finance.accent, /yeşil|siyah/, "yeşil-siyah kanalda yasak (Ledger dersi)");
  assert.doesNotMatch(by.horror.write.mix, /^boş mekânlar, siluetler/, "korku karışımı silüet önermiyor");
  assert.doesNotMatch(by.horror.write.stance, /gölge/);
});

test("visualStyle şeması renkli örnek verir, karanlık kelimeleri yasaklar; plan kuralı karanlık dil istemez", () => {
  assert.doesNotMatch(SCRIPT_SRC, /Tri-X black and white film, natural available light/, "eski siyah-beyaz örnek gitti");
  assert.match(SCRIPT_SRC, /Örn: 'Authentic 1970s documentary photograph, Kodak Ektachrome colour film, bright natural daylight, well exposed/);
  for (const w of ["'deep shadows'", "'deep black shadows'", "'low-key'", "'noir'", "'moody'", "'harsh … against … black'", "'green-black'"]) {
    assert.ok(SCRIPT_SRC.includes(w), `yasak listesi: ${w}`);
  }
  assert.match(SCRIPT_SRC, /PARLAK, İYİ POZLANMIŞ, DOĞAL RENKLİ fotoğraf; siyah-beyaz ya da sepya yalnızca hikâye renkli filmden önceyse \(1940 öncesi\)/);
  assert.doesNotMatch(SCRIPT_SRC, /suç için soğuk flaşlı delil fotoğrafı/);
  assert.match(SCRIPT_SRC, /Görsel dil KARANLIK DEĞİL/);
  // Her kural adını onu öğreten videodan alır.
  assert.match(SCRIPT_SRC, /Gimli 20261028-9ff721 \/ Kartal Yuvası 950730, 29 Ekim 2026/);
});

test("SAHNE DİLİ: gündüz çoğunluğu, silüet tavanı; montaj ve şiddet gölge istemez; gerçek kişi silüetle anlatılmaz", () => {
  const grammar = SCRIPT_SRC.slice(SCRIPT_SRC.indexOf("const SCENE_GRAMMAR"), SCRIPT_SRC.indexOf("/* ============================================================== ortak yardımcılar"));
  assert.ok(grammar.length > 1000);
  assert.doesNotMatch(grammar, /gölgeler, gözler/);
  assert.doesNotMatch(grammar, /ima et: gölgeler/);
  assert.doesNotMatch(grammar, /siluetle/);
  assert.doesNotMatch(grammar, /wide \(sokak, bina, kalabalık\), silhouette,/, "çekim listesi silüet önermiyor");
  assert.match(grammar, /EN AZ %60'ı gün ışığında ya da aydınlık iç mekânda/);
  assert.match(grammar, /videoda en fazla 5 silüet/);
  assert.match(grammar, /YALNIZCA anlatım o anı öyle söylüyorsa/);
  assert.match(grammar, /onu arkadan, uzaktan, elleriyle/);
});

test("çeşitleme geceye değil gündüze çevirir; zaten gündüz olan istem saat eki almaz", () => {
  // Kişisiz, çerçevesiz istemde dört çeşitleme uyar; sırası sahne indeksiyle (7 % 4 = 3: günün saati).
  const scenes = (p) => [{ type: "photo", say: "x", imagePrompt: p }, ...Array.from({ length: 6 }, () => ({ type: "slam", say: "x", bg: "prev" })), { type: "photo", say: "x", imagePrompt: p }];
  const s = scenes("A clerk counting coins at a wooden bank counter");
  DS.varyDuplicatePrompts(s);
  assert.equal(s[7].imagePrompt, "A clerk counting coins at a wooden bank counter, different time of day: bright morning daylight");
  const day = scenes("A clerk counting coins at a wooden bank counter in morning light");
  DS.varyDuplicatePrompts(day);
  assert.doesNotMatch(day[7].imagePrompt, /time of day/);
  assert.doesNotMatch(SCRIPT_SRC, /text: "different time of day: night/);
});

/* ------------------------------------------------------------------ görsel dil denetimi */

test("karanlık görsel dil: yasak ifadeler bulunur; taşıyan yan cümle düşer, ana ad kalır", () => {
  // 2009 denizaltı (20261024-373aaf) planının gerçek visualStyle'ı.
  const sub = "Authentic late-2000s naval documentary photograph, cold steel-grey sea light, long telephoto lens, high contrast with deep shadows, subtle film grain, archival press-print texture.";
  assert.deepEqual(DS.darkLookWords(sub), ["deep shadows"]);
  assert.equal(DS.brightLook(sub), "Authentic late-2000s naval documentary photograph, cold steel-grey sea light, long telephoto lens, subtle film grain, archival press-print texture.");
  assert.equal(DS.brightLook("Moody noir documentary photograph, 35mm lens, fine grain."), "Documentary photograph, 35mm lens, fine grain.");
  assert.equal(DS.brightLook("Evidence photograph, harsh flash against a black backdrop, green-black data glow, 50mm lens."), "Evidence photograph, 50mm lens.");
  assert.deepEqual(DS.darkLookWords("Low-key interior; deep black shadows"), ["deep shadows", "low-key"]);
  const ok = "Authentic 1970s documentary photograph, Kodak Ektachrome colour film, bright natural daylight, well exposed, candid.";
  assert.deepEqual(DS.darkLookWords(ok), []);
  assert.equal(DS.brightLook(ok), ok);
  assert.equal(DS.brightLook(""), "");
});

test("plan doğrulaması karanlık görsel dili kodla düzeltir (yeniden yazdırmaz); bölüm doğrulaması karanlık istemleri geri yollar", () => {
  const bible = SCRIPT_SRC.slice(SCRIPT_SRC.indexOf("const bibleErrors = (b) => {"), SCRIPT_SRC.indexOf("let bible = store.bible();"));
  assert.match(bible, /const darkLook = darkLookWords\(b\.visualStyle\);/);
  assert.match(bible, /b\.visualStyle = brightLook\(b\.visualStyle\);/);
  assert.doesNotMatch(bible, /errors\.push\([^)]*darkLook/, "karanlık dil planı durdurmaz");
  const chapter = SCRIPT_SRC.slice(SCRIPT_SRC.indexOf("const callChapter = async"), SCRIPT_SRC.indexOf("// 2) BÖLÜMLER"));
  // En iyi deneme önce kaydedilir: üç turda da karanlık kalırsa iş durmaz.
  assert.ok(chapter.indexOf("best = { scenes: structuredClone(scenes), words }") < chapter.indexOf("promptLightErrors(scenes, { chapter: i })"));
  assert.match(SCRIPT_SRC, /logFn\(`Görsel ışık denetimi: \$\{light\.dark\.length\}\/\$\{light\.total\} istem karanlık/);
});

test("karanlık istem oranı: anlatım geceyi söylüyorsa gece serbest, renk adı ('dark suits') sayılmaz", () => {
  const scenes = [
    { type: "photo", say: "The vault opened at nine.", imagePrompt: "Dimly lit bank vault, deep shadows" },
    { type: "photo", say: "Clerks waited.", imagePrompt: "Bank clerks in dark suits at a counter, morning light through tall windows" },
    { type: "photo", say: "That night, the guards changed.", imagePrompt: "Two guards at a gate at night, street lamps" },
    { type: "photo", say: "Bir adam bekledi.", imagePrompt: "Silhouette of a man against a window" },
    { type: "montage", say: "x", imagePrompts: ["Macro of a key in a lock", { prompt: "A murky corridor", source: "stock" }] },
    { chapterCard: true, imagePrompt: "Dark card" },
  ];
  const l = DS.promptLight(scenes);
  assert.equal(l.total, 6);
  assert.deepEqual(l.dark.map((d) => d.prompt), ["Dimly lit bank vault, deep shadows", "Silhouette of a man against a window", "A murky corridor"]);
  assert.equal(l.silhouettes, 1);
  assert.equal(l.share, 0.5);
  const errs = DS.promptLightErrors(scenes, { chapter: 2 });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /^bölüm 3: görsel istemlerin %50'i karanlık/);
  assert.match(errs[0], /en az %60'ı gün ışığında/);
  // %30 ve altı, ya da 4'ten az istem: hata yok.
  assert.deepEqual(DS.promptLightErrors(scenes.slice(1, 3)), []);
  const bright = Array.from({ length: 7 }, (_, i) => ({ type: "photo", say: "x", imagePrompt: `Sunlit street number ${i}` }));
  bright.push({ type: "photo", say: "x", imagePrompt: "A shadowy hall" }, { type: "photo", say: "x", imagePrompt: "A hall at dusk" });
  assert.deepEqual(DS.promptLightErrors(bright), [], "2/9 = %22");
  const sil = Array.from({ length: 3 }, () => ({ type: "photo", say: "night", imagePrompt: "Silhouette of the man at night" }));
  assert.match(DS.promptLightErrors(sil).join(), /3 silüet istemi \(en çok 2\)/);
  assert.equal(DS.DARK_PROMPT_SHARE, 0.3);
  assert.equal(DS.SILHOUETTE_CAP, 5);
});

/* ------------------------------------------------------------------ motor: istek metni, yüz, açma */

test("istek metni: karanlık yan cümleler düşer, pozlama istenir; siyah-beyaz stil renk değil orta ton ister", () => {
  const kartalLike = "Sober documentary photograph, low-key lighting, deep shadows, 35mm lens. No readable text or lettering anywhere, no logos, no modern objects.";
  const s = exposedStyle(kartalLike);
  assert.equal(s, `Sober documentary photograph, 35mm lens. No readable text or lettering anywhere, no logos, no modern objects. ${EXPOSURE}`);
  assert.equal(EXPOSURE, "Bright, well-exposed, natural colour.");
  const bw = exposedStyle("Authentic 1920s press photograph, black and white glass plate, fine grain.");
  assert.ok(bw.endsWith(EXPOSURE_MONO), bw);
  assert.doesNotMatch(bw, /natural colour/);
  const already = "Bright documentary photograph, well-exposed daylight.";
  assert.equal(exposedStyle(already), already, "pozlama iki kez istenmez");
  assert.equal(exposedStyle(""), "");
  // Bugünün sahnesi de pozlanır.
  assert.match(styleFor(kartalLike, 2026), /no logos\. Bright, well-exposed, natural colour\. Set in 2026:/);
  // Anahtar ham STYLE'da kalır: yalnızca styleFor istek metnini değiştirir.
  const src = read("docu-engine/lib/produce.mjs");
  assert.match(src, /export function styleFor\(style, year\) \{\n  const s = exposedStyle\(style\);/);
  assert.match(src, /const baseKey = hash\(`\$\{OAI_KEYS \? 'oai\|' : ''\}img\|\$\{prompt\}\|\$\{people\}\|\$\{STYLE\}`\);/);
});

test("gerçek kişinin yüzü arkadan ya da uzaktan gizlenir, silüetle değil", () => {
  assert.equal(HIDDEN_FACE, "seen from behind or at a distance, face not visible");
  assert.doesNotMatch(HIDDEN_FACE, /silhouette/);
  assert.equal(hideRealFace("Medium shot of the man at a desk in a bright office", ["x"]), "Medium shot of the man at a desk in a bright office, seen from behind or at a distance, face not visible");
  assert.equal(hideRealFace("The man walking away, seen from behind", ["x"]), "The man walking away, seen from behind", "zaten gizliyse ek yok");
  assert.doesNotMatch(anonymise("Galeazzo Ciano at a lodge window", "Galeazzo Ciano"), /silhouette/);
  assert.match(anonymise("Galeazzo Ciano at a lodge window", "Galeazzo Ciano"), /seen from behind or at a distance, no recognisable face$/);
});

test("karanlık kare 85 parlaklığa kadar açılır (eskiden 62)", () => {
  assert.equal(LIFT_FLOOR, 85);
  assert.equal(liftGamma(85), 1);
  assert.equal(liftGamma(120), 1);
  assert.equal(liftGamma(70), 1.27);
  assert.equal(liftGamma(30), 1.9, "tavan 1.9");
  assert.equal(liftGamma(NaN), 1);
  const src = read("docu-engine/lib/produce.mjs");
  const body = src.slice(src.indexOf("function liftIfDark(file)"), src.indexOf("function liftIfDark(file)") + 900);
  assert.match(body, /if \(yavg >= LIFT_FLOOR \|\| liftGamma\(yavg\) < 1\.02\) return file;/);
  assert.doesNotMatch(body, /\b62\b/);
});

/* ------------------------------------------------------------------ Shorts */

test("Shorts yeni görseli siyah-beyaz yalnızca arşivi siyah-beyazsa; yoksa dönemin doğal renkli fotoğrafı", () => {
  assert.match(newPictureStyle(1929, "", { mono: true }), /black-and-white archival photograph of the time, bright and well exposed/);
  assert.equal(newPictureStyle(1929), "Era-accurate scene of 1929, a natural colour photograph of the time, bright and well exposed, fine film grain.");
  assert.match(newPictureStyle(1973), /natural colour photograph/, "1955-1989 artık 'painterly' değil");
  assert.match(newPictureStyle(1453), /painterly historical look/);
  assert.equal(newPictureStyle(2026), "");
  assert.equal(newPictureStyle(null, "epic"), "Era-accurate historical scene.");
  const src = read("src/pipeline/docu-shorts.js");
  assert.match(src, /style: newPictureStyle\(year, genre, \{ mono \}\)/);
  assert.match(src, /const mono = year != null && year < 1990 && archiveIsMono\(catalog, \{ measure:/);
});

test("arşivin siyah-beyazlığı: işaret, katalog tarifi ya da ölçüm; AI ve stok sayılmaz", () => {
  const real = (what, extra = {}) => ({ source: "real", what, ...extra });
  assert.equal(archiveIsMono([real("Black-and-white photo of a trading floor"), real("Sepia portrait of a banker"), real("Monochrome street, 1929")]), true);
  assert.equal(archiveIsMono([real("Crowd on Wall Street"), real("A banker"), real("A ticker")], { measure: () => 40 }), false);
  assert.equal(archiveIsMono([real("a"), real("b"), real("c"), real("d")], { measure: (a) => (a.what === "d" ? 40 : 5) }), true, "3/4 ölçülen mono");
  assert.equal(archiveIsMono([real("Black-and-white photo"), real("Black-and-white photo")]), false, "3'ten az bilinen: renkli varsay");
  const ai = { source: "ai", generated: true, what: "black-and-white AI still" };
  assert.equal(archiveIsMono([ai, ai, ai, { source: "stock", what: "black and white stock" }]), false);
  assert.equal(archiveIsMono([real("x", { mono: true }), real("y", { mono: true }), real("z", { mono: false })]), true);
  // Ölçüm aritmetiği: gri piksel 0, doygun kırmızı 255.
  const px = (r, g, b) => Buffer.from(Array.from({ length: 576 }, () => [r, g, b]).flat());
  assert.equal(chromaOf(px(120, 120, 120)), 0);
  assert.equal(chromaOf(px(255, 0, 0)), 255);
  assert.ok(chromaOf(px(130, 118, 100)) > MONO_CHROMA, "sıcak renkli kare eşiğin üstünde");
  assert.ok(chromaOf(px(124, 120, 113)) < MONO_CHROMA, "sepya eşiğin altında");
  assert.equal(chromaOf(Buffer.alloc(10)), null);
});

test("Shorts görünüşleri rengi korur (doygunluk ≥ 0.85, hue=s=0 yok); bulanık dolgu ve karanlık açma aydınlık", () => {
  for (const id of Object.keys(SHORT_LOOKS)) {
    assert.ok(lookSaturation(id) >= MIN_LOOK_SATURATION, `${id}: ${SHORT_LOOKS[id].grade}`);
    assert.doesNotMatch(pictureFilter(id), /hue=s=0/);
  }
  assert.equal(lookSaturation("noir") >= 0.85 && lookSaturation("dossier") >= 0.85, true);
  assert.equal(BLUR_FILL, "eq=brightness=-0.12:saturation=0.95");
  for (const f of ["src/pipeline/docu-shorts.js", "src/pipeline/docu-shorts-pictures.js"]) {
    const src = read(f);
    assert.doesNotMatch(src, /gblur=sigma=\d+,eq=brightness=-0\.(?:2|18|25|28)/, `${f}: eski karanlık dolgu`);
    assert.match(src, /gblur=sigma=\d+,\$\{BLUR_FILL\}/);
  }
  assert.equal(DARK_LIFT_FLOOR, 85);
  assert.equal(darkLift(80), "eq=gamma=1.06");
  assert.equal(darkLift(86), null);
  assert.equal(darkLift(null), null);
});

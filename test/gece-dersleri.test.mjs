// GECE DERSLERİ (Hastings teslimi, Ekim 2026):
// 1) 43 atıf zorunlu görsel, "yalnızca zorunlular" kipinde bile 20.197 karakterlik açıklama yaptı — YouTube 5.000'de
//    keser. Son kip: lisans başına tek satır, hiçbir zorunlu atıf düşmez.
// 2) Kalite denetiminin "aynı kare" uyarısı, aynı koyu zemin üstünde kart olarak duran İKİ FARKLI fotoğrafı eşleştirdi;
//    sahte tekrar otomatik düzeltmeyi tetikledi ve bitmiş arşiv geçişi kaybedildi. Kartlar dosyasıyla yargılanır.
import test from "node:test";
import assert from "node:assert/strict";
import { kunyeUret } from "../src/pipeline/kunye.js";
import { cardedFrame, sameFrameCandidate } from "../src/pipeline/docu-qa.js";

const cc = (i, extra = {}) => ({
  file: `build/x/cm-${i}.jpg`, provider: "wikimedia", lisans: i % 3 ? "CC BY-SA 3.0" : "CC BY 2.0",
  sahip: `Photographer Number ${i}`, eser: `Bayeux Tapestry Scene ${i} (cropped) with a rather long descriptive file name.png`,
  sayfa: `https://commons.wikimedia.org/wiki/File:X_${i}.jpg`, lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0",
  sahipUrl: `https://commons.wikimedia.org/wiki/User:P${i}`, modifications: "x", permissionVerified: true, ...extra,
});

test("45 required credits fit YouTube's 5,000 characters, every one still named with its author and licence", () => {
  const media = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`s${i}`, cc(i + 1)]));
  media.pd = { file: "build/x/pd.jpg", provider: "wikimedia", lisans: "Public domain", eser: "Old map", sayfa: "https://x/pd", permissionVerified: true };
  media.ai = { file: "build/x/img-1.jpg", provider: "ai" };
  const full = kunyeUret(media, { dil: "en", mandatoryOnly: true }).metin;
  const g = kunyeUret(media, { dil: "en", grouped: true });
  assert.ok(full.length > 5000, `the old last fit was ${full.length}`);
  assert.ok(g.metin.length < 4300, `grouped: ${g.metin.length}`);
  assert.equal(g.zorunlu, 45);
  for (let i = 1; i <= 45; i++) assert.ok(g.metin.includes(`(Photographer Number ${i})`), `author ${i}`);
  assert.match(g.metin, /• CC BY-SA 3\.0 \(Wikimedia Commons\): /);
  assert.match(g.metin, /• CC BY 2\.0 \(Wikimedia Commons\): /);
  assert.match(g.metin, /public domain/);
  assert.match(g.metin, /Some scenes were generated with AI/);
  assert.match(g.metin, /…"/, "a very long file name is cut at a word");
});

test("a reuse note written into the author field becomes the author's name", () => {
  const media = { a: cc(1, { sahip: "This image is a work by Tsvetomira Zaharieva. When reusing, please credit me as: Tsvetomira Zaharieva or plain © cwet4e . I would appreciate being notified…" }) };
  assert.match(kunyeUret(media, { dil: "en", grouped: true }).metin, /\(Tsvetomira Zaharieva\)/);
});

test("the description builder falls back to the grouped credits when even the required-only list is too long", async () => {
  const { renderSeoMarkdown } = await import("../src/pipeline/seo.js");
  const media = Object.fromEntries(Array.from({ length: 45 }, (_, i) => [`s${i}`, cc(i + 1)]));
  const md = renderSeoMarkdown({ language: "en", topic: "1066" }, { title: "1066" }, { description: "A story.", titles: ["1066"], tags: [] }, [{ start: 0, title: "Start" }], 900, media);
  const block = md.split("```")[1];
  assert.ok(block.length <= 5000, `copy-paste block ${block.length}`);
  assert.ok(!/Uyarı:.*5\.000/.test(md), "no over-the-limit warning left");
});

test("a medieval scene's picture request names what did not exist yet; modern scenes get nothing", async () => {
  const { periodNegative, yearOfEra } = await import("../docu-engine/lib/period.mjs");
  assert.equal(yearOfEra("1066"), 1066);
  assert.equal(yearOfEra("c. 1066 AD"), 1066);
  assert.equal(yearOfEra("44 BC"), -44);
  assert.equal(yearOfEra(""), null);
  const m = periodNegative(1066);
  for (const w of ["spyglasses", "eyeglasses", "printed books", "guns", "clocks"]) assert.ok(m.includes(w), w);
  assert.match(periodNegative(1520), /telescopes/);
  assert.ok(!/guns/.test(periodNegative(1520)), "1520 had guns");
  assert.equal(periodNegative(1966), "");
  assert.equal(periodNegative(null), "");
  assert.match(periodNegative(-44), /by 44 BC/);
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");
  assert.ok(/const baseKey = hash\(`[^`]*\$\{STYLE\}`\)/.test(src) && !/baseKey = hash\([^)]*period/.test(src), "the cache key is unchanged");
  // The request text carries the scene's style (styleFor(STYLE, year), Eagle's Nest fire, Oct 2026) and its period.
  assert.equal((src.match(/\$\{style\}\$\{period\} Wide 16:9/g) || []).length, 5, "every request text carries it");
});

test("the writer is told the AI cap before it writes a chapter, not only after (each refusal was a paid repair)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/pipeline/docu-script.js", import.meta.url), "utf8");
  assert.match(src, /function chapterPrompt\(\{[^}]*aiCap = null \}\)/);
  assert.equal((src.match(/chapterPrompt\(\{ i, bible, plan, written, lang, catalog, aiCap \}\)/g) || []).length, 2, "both calls pass it");
  assert.match(src, /GÖRSEL KAYNAĞI \(ZORUNLU\): bu bölümde EN FAZLA \$\{aiCap\} sahne source \\"ai\\"|GÖRSEL KAYNAĞI \(ZORUNLU\): bu bölümde EN FAZLA \$\{aiCap\} sahne source "ai"/);
});

test("two different pictures shown as cards are not 'the same frame' by hash; the same file still is", () => {
  const greatCourt = { type: "photo", image: "a.jpg", imgW: 2560, imgH: 2512, fit: "smart" };
  const aelfgyva = { type: "photo", image: "b.jpg", imgW: 2560, imgH: 2674, fit: "smart", present: "print" };
  const strip = { type: "photo", image: "c.jpg", imgW: 2560, imgH: 812, fit: "smart" };
  const wide = { type: "photo", image: "d.jpg", imgW: 2560, imgH: 1440 };
  const wide2 = { type: "photo", image: "e.jpg", imgW: 1920, imgH: 1080 };
  assert.equal(cardedFrame(greatCourt), true);
  assert.equal(cardedFrame(strip), true);
  assert.equal(cardedFrame(wide), false);
  assert.equal(sameFrameCandidate(greatCourt, aelfgyva), false);
  assert.equal(sameFrameCandidate(strip, wide), false);
  assert.equal(sameFrameCandidate(wide, wide2), true, "two full-frame pictures are still compared by hash");
  assert.equal(sameFrameCandidate(aelfgyva, { ...aelfgyva }), true, "the same card twice is a real repeat");
});

test("a number written as text where the schema wants a number is read as that number; anything vaguer stays text", async () => {
  const { coerceNumbers, validateSchema } = await import("../src/structured-output.js");
  const schema = { type: "object", properties: { scenes: { type: "array", items: { type: "object", properties: { from: { type: "number" }, to: { type: "number" }, label: { type: "string" }, n: { type: "integer" } } } } } };
  const got = coerceNumbers({ scenes: [{ from: "0", to: "41,000,000,000", label: "41", n: "3" }, { from: " 12.5 ", to: "1,5", n: "2.5" }, { from: "R$ 41bn", to: 7 }] }, schema);
  assert.deepEqual(got.scenes[0], { from: 0, to: 41000000000, label: "41", n: 3 }, "a string label stays a string");
  assert.equal(got.scenes[1].from, 12.5);
  assert.equal(got.scenes[1].to, "1,5", "a comma decimal is ambiguous: left alone");
  assert.equal(got.scenes[1].n, "2.5", "not an integer: left alone");
  assert.equal(got.scenes[2].from, "R$ 41bn");
  assert.equal(validateSchema(got.scenes[0], schema.properties.scenes.items).length, 0);
  assert.ok(validateSchema(got.scenes[2], schema.properties.scenes.items).length > 0, "a real mistake still fails");
  const fs = await import("node:fs");
  assert.match(fs.readFileSync(new URL("../src/llm.js", import.meta.url), "utf8"), /coerceNumbers\((?:extractJson\(textOf\(resp\)\)|back\.value), schema\)/);
});

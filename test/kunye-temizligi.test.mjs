// KÜNYE TEMİZLİĞİ (Kartal Yuvası 20261024-950730, Fransa borcu 20261024-48ae2d — 24-25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: İngilizce açıklamanın görsel künyesinde
//   - yazar yerine Commons'un yazar alanındaki çöp: "(Unknown Unknown)", "(The original uploader was Florian S. at
//     German…)", tartışma imzası "(Mario Becker - Project-B-WW 15:56, 16. Sep.…)" ve türev eserde dosya adı
//     "(File:View of Kehlstein and Kehlsteinhaus from…)" — 48 karakterde kesilince iki gerçek ad (Jonovision82,
//     Georgfotoart) da düştü;
//   - aynı Commons dosyası iki kez: Wikimedia'dan "Kehlsteinhaus zepředu" ve Openverse'ten "File:Kehlsteinhaus zepředu";
//   - "wikipedia" sağlayıcısı ham yazıldı, "CC BY 4.0 (wikipedia)" ayrı grup açtı;
//   - Fransa: "Lecornu … (cropped)" ile "(cropped 2)" aynı metne kesildi, aynı atıf iki kez basılmış gibi göründü;
//   - görsel kutusuna elle konan iki CC BY / CC BY-SA fotoğrafın atfı (gorsel-kutusu/KUNYE.txt) hiç okunmadı.
// Kayıtlar işin docu-archive-done.json'undan alındı (kısaltılarak).
import test from "node:test";
import assert from "node:assert/strict";
import { kunyeUret, yazarAdi, saglayiciAdi, kutuKunyesi } from "../src/pipeline/kunye.js";
import { permissionUsable } from "../src/pipeline/provenance.js";

const MODS = "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi.";
const rec = (o) => ({ modifications: MODS, permissionVerified: true, ...o });
// scene-12 ve scene-79: aynı dosya, iki sağlayıcı, iki farklı sayfa adresi.
const zepreduCommons = rec({ provider: "wikimedia", lisans: "CC BY 2.5", sahip: "Ondřej Žváček", eser: "Kehlsteinhaus zepředu.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_zep%C5%99edu.jpg", lisansUrl: "https://creativecommons.org/licenses/by/2.5", file: "build/x/cm-1f2c309dc85c.jpg" });
const zepreduOpenverse = rec({ provider: "openverse", lisans: "BY 2.5", sahip: "Ondřej Žváček", eser: "File:Kehlsteinhaus zepředu.jpg", sayfa: "https://commons.wikimedia.org/w/index.php?curid=15731027", lisansUrl: "https://creativecommons.org/licenses/by/2.5", file: "build/x/arch-bbd33ab1ca64.jpg" });
const traunstein = rec({ provider: "wikipedia", lisans: "CC BY-SA 2.0 de", sahip: "Mario Becker - Project-B-WW 15:56, 16. Sep. 2007 (CEST)", eser: "Traunstein 032.JPG", sayfa: "https://commons.wikimedia.org/wiki/File:Traunstein_032.JPG", lisansUrl: "https://creativecommons.org/licenses/by-sa/2.0/de/deed.en", file: "build/x/arch-5f3728950203.jpg" });
const bormann = rec({ provider: "wikipedia", lisans: "CC BY-SA 3.0 de", sahip: "Unknown Unknown", attribution: "Bundesarchiv, Bild 183-R14128A / CC-BY-SA 3.0", eser: "Bundesarchiv Bild 183-R14128A, Martin Bormann (3x4 cropped) (2).jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Bundesarchiv_Bild_183-R14128A,_Martin_Bormann_(3x4_cropped)_(2).jpg", lisansUrl: "https://creativecommons.org/licenses/by-sa/3.0/de/deed.en", file: "build/x/arch-71a28f504e0d.jpg" });
const florian = rec({ provider: "wikimedia", lisans: "CC BY-SA 3.0", sahip: "The original uploader was Florian S. at German Wikipedia .", eser: "Kehlsteinhaus 280605 008", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_280605_008.jpg", lisansUrl: "http://creativecommons.org/licenses/by-sa/3.0/", file: "build/x/arch-306baf0ec319.jpg" });
const viewB = rec({ provider: "openverse", lisans: "BY-SA 4.0", sahip: "File:View of Kehlstein and Kehlsteinhaus from Almbachklamm Trail.jpg: Jonovision82 derivative work: Georgfotoart", eser: "View of Kehlstein and Kehlsteinhaus from Almbachklamm Trail b", sayfa: "https://commons.wikimedia.org/w/index.php?curid=157087534", lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0/", file: "build/x/arch-417448a86022.jpg" });
const view = rec({ provider: "openverse", lisans: "BY-SA 4.0", sahip: "Jonovision82", eser: "View of Kehlstein and Kehlsteinhaus from Almbachklamm Trail", sayfa: "https://commons.wikimedia.org/w/index.php?curid=105213453", lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0/", file: "build/x/arch-7a90761430f1.jpg" });
const anil = rec({ provider: "wikipedia", lisans: "CC BY 4.0", sahip: "Anil Öztas", attribution: "© Anil Öztas", eser: "Berchtesgaden (DE), Dokumentation Obersalzberg -- 2024 -- 0411.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Berchtesgaden_(DE),_Dokumentation_Obersalzberg_--_2024_--_0411.jpg", lisansUrl: "https://creativecommons.org/licenses/by/4.0", file: "build/x/arch-01070488eb92.jpg" });
const lecornu = (n, tail, file) => rec({ provider: "wikipedia", lisans: "CC BY-SA 4.0", sahip: "© Patrice Normand/Leextra via opale", eser: `Portrait officiel de Sébastien Lecornu - Ministre des Armées (${tail}).jpg`, sayfa: `https://commons.wikimedia.org/wiki/File:Portrait_officiel_${n}.jpg`, lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0", file });
const kartal = { "scene-12": zepreduCommons, "scene-44": traunstein, "scene-74": bormann, "scene-79": zepreduOpenverse, "scene-84": viewB, "scene-102": florian, "scene-116": anil, "scene-136": view };

test("the same Commons file from Wikimedia and Openverse is credited once, in both description modes", () => {
  for (const opts of [{ dil: "en", grouped: true }, { dil: "en" }, { dil: "en", mandatoryOnly: true }]) {
    const k = kunyeUret(kartal, opts);
    assert.equal((k.metin.match(/Kehlsteinhaus zep/g) || []).length, 1, JSON.stringify(opts));
    assert.ok(!/File:/.test(k.metin.replace(/https?:\/\/\S+/g, "")), "no 'File:' prefix outside a link");
  }
  assert.equal(kunyeUret(kartal, { dil: "en", grouped: true }).zorunlu, 7, "eight records, one duplicate");
  // Different files that only share a title stay apart: the two "View of Kehlstein…" are a photo and its derivative.
  assert.match(kunyeUret(kartal, { dil: "en", grouped: true }).metin, /Jonovision82\)/);
});

test("author fields become the author's name: no 'Unknown', no uploader sentence, no signature time, both names of a derivative", () => {
  const g = kunyeUret(kartal, { dil: "en", grouped: true }).metin;
  for (const junk of [/Unknown/, /original uploader/, /15:56/, /\(CEST\)/, /File:View/]) assert.doesNotMatch(g, junk);
  assert.match(g, /"Traunstein 032" \(Mario Becker - Project-B-WW\)/);
  assert.match(g, /"Kehlsteinhaus 280605 008" \(Florian S\.\)/);
  assert.match(g, /\(Jonovision82 \/ Georgfotoart\)/, "a derivative work credits the original author and the editor");
  assert.match(g, /\(Bundesarchiv, Bild 183-R14128A \/ CC-BY-SA 3\.0\)/, "no author name: the licensor's own attribution line");
  assert.match(g, /\(Anil Öztas\)/);
  // The same rules in the long list (it printed m.sahip raw).
  assert.match(kunyeUret(kartal, { dil: "en" }).metin, /— Mario Becker - Project-B-WW, CC BY-SA 2\.0 de/);
  // Edge cases of the helper.
  assert.equal(yazarAdi({ sahip: "Unknown author Unknown author" }, { tr: false }), "author unspecified");
  assert.equal(yazarAdi({ sahip: "Unknown Unknown" }), "eser sahibi belirtilmemiş");
  assert.equal(yazarAdi({ sahip: "File:Some photo.jpg" }, { tr: false }), "author unspecified");
  assert.equal(yazarAdi({ sahip: "File:Old map.png: Jane Roe" }), "Jane Roe");
  assert.equal(yazarAdi({ sahip: "Ada Lovelace 12:34, 5 March 2010 (UTC)" }), "Ada Lovelace");
  assert.equal(yazarAdi({ sahip: "Jane Doe" }), "Jane Doe", "a normal name is untouched");
  assert.equal(yazarAdi({ sahip: "Image: John Smith" }), "Image: John Smith", "only a file name is dropped, never the author's own line");
  assert.equal(yazarAdi({ sahip: "Unknown photographer" }), "Unknown photographer");
  assert.equal(yazarAdi({ sahip: "https://commons.wikimedia.org/wiki/User:Werudolf" }), "Werudolf");
});

test("Wikipedia article pictures are Wikimedia Commons files: no raw '(wikipedia)' group", () => {
  const g = kunyeUret(kartal, { dil: "en", grouped: true }).metin;
  assert.doesNotMatch(g, /\(wikipedia\)/);
  assert.match(g, /• CC BY 4\.0 \(Wikimedia Commons\): "Berchtesgaden \(DE\), Dokumentation…" \(Anil Öztas\)/);
  assert.doesNotMatch(kunyeUret({ a: traunstein }, { dil: "en" }).metin, /\(wikipedia\)/);
  assert.equal(saglayiciAdi("wikipedia"), "Wikimedia Commons");
  assert.equal(saglayiciAdi("youtube"), "YouTube");
  assert.equal(saglayiciAdi("flickr"), "flickr");
});

test("two crops whose cut titles collide keep their whole names; ordinary long titles are still cut", () => {
  const g = kunyeUret({ a: lecornu(1, "cropped", "build/y/a.jpg"), b: lecornu(2, "cropped 2", "build/y/b.jpg"), c: anil }, { dil: "en", grouped: true }).metin;
  assert.match(g, /"Portrait officiel de Sébastien Lecornu - Ministre des Armées \(cropped\)"/);
  assert.match(g, /"Portrait officiel de Sébastien Lecornu - Ministre des Armées \(cropped 2\)"/);
  assert.match(g, /"Berchtesgaden \(DE\), Dokumentation…"/, "no collision, still cut at a word");
  const v = kunyeUret(kartal, { dil: "en", grouped: true }).metin;
  assert.match(v, /"View of Kehlstein and Kehlsteinhaus from Almbachklamm Trail b" \(Jonovision82 \/ Georgfotoart\); "View of Kehlstein and Kehlsteinhaus from Almbachklamm Trail" \(Jonovision82\)/);
});

test("picture-inbox credits (gorsel-kutusu/KUNYE.txt) become credit records with licence links", () => {
  // The Kartal job's own KUNYE.txt, including the run-together AI line.
  const txt = [
    "01 Michael Lucan / Wikimedia Commons, CC BY-SA 3.0 de — https://commons.wikimedia.org/wiki/File:2016-02-02_Joachim_Herrmann_0617.JPG",
    "02 Wolfgang Manousek from Dormagen, Germany / Wikimedia Commons, CC BY 2.0 — https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_Obersalzberg_Bavaria_Germany_2004.jpg",
    "03 AI görseli (ChatGPT) — Bavyera polis barikatı",
    "04 AI görseli (ChatGPT) — gece polis barikatı05 AI görseli (ChatGPT)",
    "07 Somebody / Wikimedia Commons, CC BY 4.0 — https://commons.wikimedia.org/wiki/File:Not_needed.jpg",
  ].join("\r\n");
  const needed = { items: [1, 2, 3, 4, 5].map((n) => ({ n, file: `build/20261024-950730/img-${n}.jpg`, prompt: "x" })) };
  const k = kutuKunyesi(txt, needed);
  assert.deepEqual(Object.keys(k), ["inbox-01", "inbox-02"], "AI lines and numbers without a needed still are skipped");
  assert.equal(k["inbox-01"].file, "build/20261024-950730/img-1.jpg");
  assert.equal(k["inbox-01"].sahip, "Michael Lucan");
  assert.equal(k["inbox-01"].lisans, "CC BY-SA 3.0 de");
  assert.equal(k["inbox-01"].lisansUrl, "https://creativecommons.org/licenses/by-sa/3.0/de/");
  assert.equal(k["inbox-01"].eser, "2016-02-02 Joachim Herrmann 0617.JPG");
  assert.equal(k["inbox-02"].sahip, "Wolfgang Manousek from Dormagen, Germany", "a comma inside the author name is kept");
  assert.equal(k["inbox-02"].lisansUrl, "https://creativecommons.org/licenses/by/2.0/");
  for (const r of Object.values(k)) assert.equal(permissionUsable(r), true, "author + licence link + page: no publisher warning");
  const g = kunyeUret({ ...k, ai: { provider: "ai", file: "ai" } }, { dil: "en", grouped: true });
  assert.match(g.metin, /\(Michael Lucan\)/);
  assert.match(g.metin, /\(Wolfgang Manousek from Dormagen, Germany\)/);
  assert.equal(g.warnings.length, 0);
  assert.match(kunyeUret(k, { dil: "en" }).metin, /Changes: Cropped and resized for video; camera motion, colour toning, film grain/, "its Turkish change note prints in English");
  assert.deepEqual(kutuKunyesi("", needed), {});
  assert.deepEqual(kutuKunyesi(txt, null), {});
});

// KÜNYE ORTAK KURALLARI (Kartal Yuvası 20261024-950730 Shorts, 25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: Shorts künyesi (docu-shorts-pictures.js) uzun videonun künyesini kendi kopyalarıyla yeniden
// yazıyordu (PROVIDER_NAME, NO_CREDIT_*, OWES_CREDIT, creditTitle, creditAuthor); Openverse ve Commons'tan gelen
// "Kehlsteinhaus zepředu" iki kez, "Unknown Unknown" ve "File:…" yazar diye basıldı. Kurallar kunye.js'de bir kez
// yazılır ve dışa açılır. Aynı eseri birleştiren anahtar a-z0-9 dışını atıyordu: Kiril/Yunan adlı iki AYRI eser
// (aynı yazar, aynı lisans) boş adla tek anahtara düşüp ikincinin zorunlu atfı siliniyordu (İrkutsk türü konular).
// Uzantısı .svg olan Commons haritası ile uzantısız Openverse kopyası ise birleşmiyordu.
import test from "node:test";
import assert from "node:assert/strict";
import { kunyeUret, yazarAdi, cut, ATIF_ISTER, TOPLU, SAGLAYICI_ADI, saglayiciAdi } from "../src/pipeline/kunye.js";

const MODS = "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi.";
const rec = (o) => ({ modifications: MODS, permissionVerified: true, lisansUrl: "https://creativecommons.org/licenses/by-sa/4.0/", ...o });
const MODES = [{ dil: "en", grouped: true }, { dil: "en" }, { dil: "en", mandatoryOnly: true }, { dil: "tr", grouped: true }];

test("two different works with Cyrillic or Greek names by one author both keep their required credit", () => {
  const media = {
    a: rec({ provider: "wikimedia", lisans: "CC BY-SA 4.0", sahip: "Владимир Иванов", eser: "Иркутск, вид на Ангару.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:A.jpg", file: "build/x/a.jpg" }),
    b: rec({ provider: "wikimedia", lisans: "CC BY-SA 4.0", sahip: "Владимир Иванов", eser: "Драматический театр.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:B.jpg", file: "build/x/b.jpg" }),
    c: rec({ provider: "wikimedia", lisans: "CC BY-SA 4.0", sahip: "Νίκος Παπαδόπουλος", eser: "Ακρόπολη.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:C.jpg", file: "build/x/c.jpg" }),
    d: rec({ provider: "wikimedia", lisans: "CC BY-SA 4.0", sahip: "Νίκος Παπαδόπουλος", eser: "Παρθενώνας.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:D.jpg", file: "build/x/d.jpg" }),
  };
  for (const opts of MODES) {
    const k = kunyeUret(media, opts);
    for (const t of ["Иркутск, вид на Ангару", "Драматический театр", "Ακρόπολη", "Παρθενώνας"]) assert.ok(k.metin.includes(t), `${t} ${JSON.stringify(opts)}`);
    assert.equal(k.zorunlu, 4, JSON.stringify(opts));
  }
  // The same Cyrillic file from Commons and Openverse is still one work.
  const twice = { ...media, e: rec({ provider: "openverse", lisans: "BY-SA 4.0", sahip: "Владимир Иванов", eser: "File:Иркутск, вид на Ангару.jpg", sayfa: "https://commons.wikimedia.org/w/index.php?curid=1", file: "build/x/e.jpg" }) };
  for (const opts of MODES) assert.equal((kunyeUret(twice, opts).metin.match(/Иркутск, вид/g) || []).length, 1, JSON.stringify(opts));
});

test("an Openverse copy without the extension, or with 'Image:', is the same Commons file", () => {
  const commons = rec({ provider: "wikimedia", lisans: "CC BY-SA 3.0", sahip: "Kmusser", eser: "Angara river map.svg", sayfa: "https://commons.wikimedia.org/wiki/File:Angara_river_map.svg", file: "build/x/m1.png" });
  const openverse = rec({ provider: "openverse", lisans: "BY-SA 3.0", sahip: "Kmusser", eser: "File:Angara river map", sayfa: "https://commons.wikimedia.org/w/index.php?curid=2", file: "build/x/m2.png" });
  const image = rec({ provider: "openverse", lisans: "BY-SA 3.0", sahip: "Kmusser", eser: "Image:Angara river map.svg", sayfa: "https://commons.wikimedia.org/w/index.php?curid=3", file: "build/x/m3.png" });
  for (const opts of MODES) {
    const k = kunyeUret({ a: commons, b: openverse, c: image }, opts);
    assert.equal((k.metin.match(/Angara river map/g) || []).length, 1, JSON.stringify(opts));
    assert.doesNotMatch(k.metin.replace(/https?:\/\/\S+/g, ""), /File:|Image:/);
  }
  // A different author under the same name is a different photo (Openverse's Flickr "IMG_…" names): both credited.
  const flickr = (sahip, n) => rec({ provider: "openverse", lisans: "BY 2.0", sahip, eser: "IMG_1234", sayfa: `https://www.flickr.com/photos/${n}/1234`, file: `build/x/f${n}.jpg` });
  const g = kunyeUret({ a: flickr("Jane Roe", 1), b: flickr("John Poe", 2) }, { dil: "en", grouped: true }).metin;
  assert.match(g, /\(Jane Roe\)/);
  assert.match(g, /\(John Poe\)/);
});

test("author fields: Unknown, a file name, an uploader note and a signature (with its talk link) become a name", () => {
  const en = (sahip, extra = {}) => yazarAdi({ sahip, ...extra }, { tr: false });
  assert.equal(en("Unknown Unknown"), "author unspecified");
  assert.equal(en("unknown"), "author unspecified");
  assert.equal(en("File:Kehlsteinhaus 1.jpg"), "author unspecified");
  assert.equal(en("Image:Old scan.jpg"), "author unspecified");
  assert.equal(en("The original uploader was Florian S. at German Wikipedia ."), "Florian S.");
  assert.equal(en("Mario Becker - Project-B-WW 15:56, 16. Sep. 2007 (CEST)"), "Mario Becker - Project-B-WW");
  assert.equal(en("Ada Lovelace (talk) 12:34, 5 March 2010 (UTC)"), "Ada Lovelace", "the talk link before the time stamp goes too");
  assert.equal(en("Ada Lovelace (talk)"), "Ada Lovelace");
  assert.equal(en("Unknown Unknown", { attribution: "Bundesarchiv, Bild 183-R14128A / CC-BY-SA 3.0" }), "Bundesarchiv, Bild 183-R14128A / CC-BY-SA 3.0");
  assert.equal(en("Jane Doe 1:2 Studio"), "Jane Doe 1:2 Studio", "a name with digits is untouched");
  const g = kunyeUret({ a: rec({ provider: "wikimedia", lisans: "CC BY 2.0", sahip: "Ada Lovelace (talk) 12:34, 5 March 2010 (UTC)", eser: "Engine.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Engine.jpg", file: "build/x/e.jpg" }) }, { dil: "en", grouped: true }).metin;
  assert.match(g, /"Engine" \(Ada Lovelace\)/);
});

test("the shared rules are exported unchanged, so the Shorts credits can import them", () => {
  for (const l of ["BY 2.0", "CC BY-SA 4.0", "CC BY-SA 2.0 de", "GFDL", "FAL"]) assert.ok(ATIF_ISTER.test(l), l);
  for (const l of ["CC0 1.0", "Public domain", "Pexels License", "Pixabay Content License"]) assert.ok(!ATIF_ISTER.test(l), l);
  assert.deepEqual([...TOPLU].sort(), ["pexels", "pixabay", "unsplash"]);
  assert.equal(SAGLAYICI_ADI.wikipedia, "Wikimedia Commons");
  assert.equal(SAGLAYICI_ADI.openverse, "Openverse");
  assert.equal(saglayiciAdi("wikimedia"), SAGLAYICI_ADI.wikimedia);
  // cut() is the grouped list's old inline cut, byte for byte (titles at 48, authors at 50).
  const old = (s, n) => (s.length > n ? s.slice(0, n - 2).replace(/\s+\S*$/, "") + "…" : s);
  for (const s of ["Short title", "Berchtesgaden (DE), Dokumentation Obersalzberg -- 2024 -- 0411", "x".repeat(48), "x".repeat(49), "Portrait officiel de Sébastien Lecornu - Ministre des Armées (cropped)"]) {
    assert.equal(cut(s), old(s, 48), s);
    assert.equal(cut(s, 50), old(s, 50), s);
  }
  assert.equal(cut(undefined), "");
  assert.equal(cut(null), "");
  // The grouped list still cuts a very long author at 50.
  const long = "Bundesministerium für Verteidigung Fotoarchiv Abteilung Presse und Öffentlichkeit";
  const g = kunyeUret({ a: rec({ provider: "wikimedia", lisans: "CC BY 3.0", sahip: long, eser: "Bunker.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Bunker.jpg", file: "build/x/b.jpg" }) }, { dil: "en", grouped: true }).metin;
  assert.ok(g.includes(`(${old(long, 50)})`), g);
});

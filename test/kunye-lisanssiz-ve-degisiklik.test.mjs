// ÖLÇÜLEN KUSUR (25 Ekim 2026, künye 1. tur incelemesi — Kartal Yuvası 20261024-950730 / Fransa 20261024-48ae2d sonrası):
//   1) İngilizce açıklamada lisansı olmayan kayıt izleyiciye iç not ve Türkçe olarak gidiyordu: media.js'nin kendi klasör
//      klibi '• "Untitled work" — author unspecified, Permission not verified (kendi arşivi)', editor.js'nin elle konan
//      dosyası '… Kullanıcı sağladı — yayın hakkını doğrulayın (local)'. Gruplu künyede ikisi de "public domain" sayıldı.
//      Artık bloğa girmezler, yayıncının "Yayın öncesi kontrol" listesine düşerler.
//   2) Aynı eseri birleştiren ikinci anahtar (ad + lisans + yazar) bir Flickr kullanıcısının iki ayrı "IMG_1234.jpg"sini
//      tek eser saydı; gruplanmamış kiplerde ikincinin Source bağlantısı düştü. Ad yalnızca Commons'ta tektir.
//      Gerçek iş: 20261024-373aaf'nin iki "Vanguard & Tug" fotoğrafı (Ste_Jones, BY 2.0, ayrı Flickr sayfaları).
//   3) Düzenleme kaydı olmayan CC BY eser gruplanmamış blokta hiç değişiklik notu almıyordu; CC BY değişikliğin
//      belirtilmesini ister ve Nova her resmi kırpıp renklendirir.
// Ağ YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kunye-lisanssiz-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { kunyeUret } = await import("../src/pipeline/kunye.js");
const { renderSeoMarkdown } = await import("../src/pipeline/seo.js");

const GENEL = "Video düzeninde yeniden boyutlandırma/kadraj; seçilen kurguya göre hareket ve renk düzenlemesi uygulanabilir.";
// media.js searchLocalAssets → seçilen kayıt (selectedProvenance + boş lisans alanları).
const yerel = { beatId: "b1", file: "C:\\Nova\\assets\\drone-istanbul.mp4", type: "video", provider: "yerel", lisans: "", sahip: "", eser: "", sayfa: "", sourceUrl: "file://C:\\Nova\\assets\\drone-istanbul.mp4", modifications: GENEL, permissionVerified: true };
// editor.js: bir sahnenin bütün vuruşları aynı dosyayı alır.
const elle = (beatId, file) => ({ beatId, file, type: "video", provider: "local", lisans: "Kullanıcı sağladı — yayın hakkını doğrulayın", sahip: "", sayfa: "", localOverride: true });
const own = { b1: yerel, b2: elle("b2", "D:\\job\\media\\edits\\seg-3-ab12cd.mp4"), b3: elle("b3", "D:\\job\\media\\edits\\seg-3-ab12cd.mp4"), b4: elle("b4", "D:\\job\\media\\edits\\seg-7-ef3401.mp4") };
const archive = { file: "build/x/a.jpg", provider: "archive" };
const cc = { file: "build/x/cc.jpg", provider: "wikimedia", lisans: "CC BY 4.0", sahip: "Ada Author", eser: "Lava lake.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Lava_lake.jpg", lisansUrl: "https://creativecommons.org/licenses/by/4.0/", modifications: GENEL };
const pd = { file: "build/x/pd.jpg", provider: "wikimedia", lisans: "Public domain", sahip: "US Navy", eser: "Yorktown.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Yorktown.jpg", modifications: GENEL };
const INTERNAL = /Untitled work|author unspecified|Permission not verified|kendi arşivi|\((?:local|yerel)\)|Kullanıcı|doğrula|[çğışÇĞİŞ]/;

test("English: a record with no licence, or the editor's user-supplied file, is a publisher note, never a credit", () => {
  const media = { ...own, archive, cc };
  for (const opts of [{ dil: "en" }, { dil: "en", compact: true }, { dil: "en", mandatoryOnly: true }, { dil: "en", grouped: true }]) {
    const k = kunyeUret(media, opts), tag = JSON.stringify(opts);
    assert.doesNotMatch(k.metin, INTERNAL, tag);
    assert.match(k.metin, /Lava lake/, `${tag}: the real credit stays`);
    assert.doesNotMatch(k.metin, /public domain/, `${tag}: no licence is not public domain`);
    assert.deepEqual(k.warnings.filter((w) => /^No licence recorded/.test(w)), [
      "No licence recorded: drone-istanbul.mp4. Confirm the publishing rights; it is left out of the credits.",
      "No licence recorded: seg-3-ab12cd.mp4. Confirm the publishing rights; it is left out of the credits.",
      "No licence recorded: seg-7-ef3401.mp4. Confirm the publishing rights; it is left out of the credits.",
    ], `${tag}: one note per file, the two user files kept apart`);
    assert.equal(k.warnings.filter((w) => /^Permission not verified: archive/i.test(w)).length, 1, `${tag}: the unverified record is still told`);
    assert.equal(k.zorunlu, 1, tag);
  }
  // Only such records: nothing to credit.
  assert.equal(kunyeUret(own, { dil: "en" }).metin, "");
  // A real public-domain picture still gets its sentence; the Turkish grouped text claims no "kamu malı" for own files.
  assert.match(kunyeUret({ ...own, cc, pd }, { dil: "en", grouped: true }).metin, /The other archive images are public domain/);
  const trg = kunyeUret({ ...own, cc }, { grouped: true });
  assert.doesNotMatch(trg.metin, /kamu malı/);
  assert.match(trg.warnings.join("\n"), /Lisans kaydı yok: seg-7-ef3401\.mp4/);
});

test("the English seo.md block is clean and the own files are listed under 'Yayın öncesi kontrol (görsel)'", () => {
  const md = renderSeoMarkdown({ language: "en", topic: "Istanbul" }, { title: "Istanbul" }, { description: "A city.\n\n{BOLUMLER}", titles: ["Istanbul"], tags: ["Istanbul"] }, [{ start: 0, title: "Start" }], 700, { ...own, cc });
  const block = md.match(/## Açıklama[^\n]*\n```\n([\s\S]*?)\n```/)[1];
  assert.doesNotMatch(block, INTERNAL);
  assert.match(block, /• "Lava lake\.jpg" — Ada Author, CC BY 4\.0 \(Wikimedia Commons\)/);
  assert.match(md.slice(md.indexOf(block) + block.length), /\*\*Yayın öncesi kontrol \(görsel\):\*\*\n- No licence recorded: drone-istanbul\.mp4/);
});

test("two photos of one Flickr user with the same file name are two works, each with its Source link", () => {
  const flickr = (n) => ({ provider: "openverse", lisans: "BY 2.0", sahip: "Jane Roe", eser: "IMG_1234.jpg", sayfa: `https://www.flickr.com/photos/janeroe/${n}/`, lisansUrl: "https://creativecommons.org/licenses/by/2.0/", file: `build/x/f${n}.jpg`, modifications: GENEL });
  const media = { a: flickr(111), b: flickr(222), c: { ...flickr(111), file: "build/x/f111-again.jpg" } };
  for (const opts of [{ dil: "en" }, { dil: "en", mandatoryOnly: true }, { dil: "tr" }]) {
    const k = kunyeUret(media, opts), tag = JSON.stringify(opts);
    assert.match(k.metin, /flickr\.com\/photos\/janeroe\/111\//, tag);
    assert.match(k.metin, /flickr\.com\/photos\/janeroe\/222\//, `${tag}: the second photo's Source link`);
    assert.equal((k.metin.match(/janeroe\/111\//g) || []).length, 1, `${tag}: the same page twice is still one work`);
    assert.equal(k.zorunlu, 2, tag);
  }
  const g = kunyeUret(media, { dil: "en", grouped: true });
  assert.equal(g.zorunlu, 2);
  assert.equal((g.metin.match(/"IMG_1234" \(Jane Roe\)/g) || []).length, 2);
  // İş 20261024-373aaf (denizaltı çarpışması), sahne 144 ve 145: aynı Flickr kullanıcısının iki "Vanguard & Tug"u.
  const tug = (id, f) => ({ provider: "openverse", eser: "Vanguard & Tug", sahip: "Ste_Jones", lisans: "BY 2.0", lisansUrl: "https://creativecommons.org/licenses/by/2.0/", sayfa: `https://www.flickr.com/photos/62358861@N06/${id}`, file: `build/20261024-373aaf/arch-${f}.jpg`, modifications: GENEL });
  const vanguard = kunyeUret({ "scene-144": tug(5894703538, "2c2db2493801"), "scene-145": tug(5894695852, "e433aaa60aad") }, { dil: "en" });
  assert.equal(vanguard.zorunlu, 2);
  for (const id of [5894703538, 5894695852]) assert.match(vanguard.metin, new RegExp(`Source: https://www\\.flickr\\.com/photos/62358861@N06/${id}`));
  // The same Commons file from Wikimedia and Openverse (Kartal scene-12/79: thumb vs upload link, wiki/File vs curid page) stays one.
  const commons = { provider: "wikimedia", lisans: "CC BY 2.5", sahip: "Ondřej Žváček", eser: "Kehlsteinhaus zepředu.jpg", url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Kehlsteinhaus_zep%C5%99edu.jpg/3840px-Kehlsteinhaus_zep%C5%99edu.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_zep%C5%99edu.jpg", lisansUrl: "https://creativecommons.org/licenses/by/2.5", file: "build/x/cm-1.jpg", modifications: GENEL };
  const openverse = { ...commons, provider: "openverse", lisans: "BY 2.5", eser: "File:Kehlsteinhaus zepředu.jpg", url: "https://upload.wikimedia.org/wikipedia/commons/3/32/Kehlsteinhaus_zep%C5%99edu.jpg", sayfa: "https://commons.wikimedia.org/w/index.php?curid=15731027", file: "build/x/arch-2.jpg" };
  for (const opts of [{ dil: "en" }, { dil: "en", grouped: true }]) assert.equal((kunyeUret({ a: commons, b: openverse }, opts).metin.match(/Kehlsteinhaus zep/g) || []).length, 1, JSON.stringify(opts));
});

test("an attribution-required work without a recorded change note gets the general one; a public-domain work does not", () => {
  const bare = { ...cc, modifications: undefined };
  for (const opts of [{ dil: "en" }, { dil: "en", compact: true }, { dil: "en", mandatoryOnly: true }]) {
    const k = kunyeUret({ bare }, opts);
    assert.match(k.metin, /\n  Changes: Resized and cropped for video; motion and colour edits may be applied to fit the cut\.$/, JSON.stringify(opts));
    assert.match(k.warnings.join("\n"), /Changes not recorded \(1 works\)/, "the publisher still knows it was not recorded");
  }
  assert.match(kunyeUret({ bare }).metin, /\n  Düzenleme: Video düzeninde yeniden boyutlandırma\/kadraj/);
  for (const lisans of ["CC BY-SA 3.0", "BY 2.0", "GFDL"]) assert.match(kunyeUret({ bare: { ...bare, lisans } }, { dil: "en" }).metin, /Changes: Resized and cropped/, lisans);
  // Not owed: a public-domain picture prints no change note it was never asked for.
  assert.doesNotMatch(kunyeUret({ pd: { ...pd, modifications: undefined } }, { dil: "en" }).metin, /Changes:/);
  // A recorded note is printed as recorded, never replaced.
  assert.match(kunyeUret({ k: { ...cc, modifications: "Kırpma ve renk düzenlemesi" } }).metin, /Düzenleme: Kırpma ve renk düzenlemesi$/);
});

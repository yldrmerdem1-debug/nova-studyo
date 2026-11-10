// COMMONS KÜNYESİNDE SAHİP (Husi-Suudi haberi, 28 Ekim 2026): "File:2026. Yahya Saree.jpg" dosyasının Artist alanı
// "You may select the license of your choice." — açıklama bunu sahip diye bastı ("2026. Yahya Saree" (You may select
// the license of your choice.)). Asıl atıf "Tasnim News Agency" yalnızca Attribution alanında. Boş ya da kalıp Artist
// Attribution'a yer bırakır; gerçek bir Artist olduğu gibi kalır.
import test from "node:test";
import assert from "node:assert/strict";
import { commonsAuthor, commonsMetadata } from "../src/pipeline/provenance.js";

const SAREE = {
  Artist: { value: "You may select the license of your choice." },
  Attribution: { value: "Tasnim News Agency" },
  LicenseShortName: { value: "CC BY 4.0" },
  LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0" },
};

test("a boilerplate or empty Artist yields to Attribution; a real Artist stays", () => {
  assert.equal(commonsAuthor(SAREE), "Tasnim News Agency");
  assert.equal(commonsAuthor({ Attribution: { value: "Aden TV" } }), "Aden TV");
  assert.equal(commonsAuthor({ Artist: { value: '<a href="https://x">Ciacho5</a>' }, Attribution: { value: "Ciacho5 / Wikimedia" } }), "Ciacho5");
  assert.equal(commonsAuthor({ Artist: { value: "Unknown author" } }), "Unknown author", "nothing better to give");
  assert.equal(commonsAuthor(), "");
});

test("the Saree photo's credit names Tasnim and stays usable", () => {
  const m = commonsMetadata({ extmetadata: SAREE, descriptionurl: "https://commons.wikimedia.org/wiki/File:2026._Yahya_Saree.jpg" }, "File:2026. Yahya Saree.jpg");
  assert.equal(m.sahip, "Tasnim News Agency");
  assert.equal(m.permissionVerified, true);
});

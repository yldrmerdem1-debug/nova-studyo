// KURUMUN ÜLKESİ İSTEMDE (Husi-Suudi haberi, 28 Ekim 2026, 20261028-59b606): "Wide shot of a large parliament chamber with
// tiered seats under chandeliers" Mısır meclisinin 26 Ekim oturumu için yazılmıştı; ülke adı yoktu ve ChatGPT İran
// bayraklı bir salon, Körfez kıyafetli bir milletvekili çizdi. Yazar talimatı: kurum/ordu/polis/kalabalık karesi ülkeyi
// ve şehri taşır.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the writer is told to name the country and city of an institution, army or crowd shot", () => {
  const ds = fs.readFileSync(new URL("../src/pipeline/docu-script.js", import.meta.url), "utf8");
  assert.match(ds, /Kurum, ordu, polis ya da kalabalık karesinde ÜLKEYİ ve ŞEHRİ istemde yaz/);
  assert.match(ds, /the chamber of the Egyptian House of Representatives in Cairo/);
  // It sits with the other picture rules, next to the real-name and readable-text rule.
  assert.ok(ds.indexOf("ÜLKEYİ ve ŞEHRİ") > ds.indexOf("GÖRSEL: imagePrompt İNGİLİZCE"));
  assert.ok(ds.indexOf("ÜLKEYİ ve ŞEHRİ") < ds.indexOf("Şiddeti GÖSTERME"));
});

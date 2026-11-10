// SON OKUMA UZUN SENARYOYU KIRPAR (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: senaryo 1997/1798 kelimeyle geldi (~15.6 dk), kurgu karnesi "süre 14.9 dk (hedef 11-14)" dedi, video
//   14:55 teslim edildi. docu-script.js artık uzun senaryoda editorialPass'e maxWords (trimTarget) veriyor; son okuma onu
//   tanımıyordu: editöre kaç kelime kırpacağı söylenmiyordu, çıkarma tavanı da 10'du (~110 kelimelik kırpmaya yetmez).
// Ağ YOK; model sahte, ücretli çağrı yok.
import test from "node:test";
import assert from "node:assert/strict";

const P = await import("../src/pipeline/docu-editor-pass.js");

const say = (k) => `[serious] ${Array.from({ length: 10 }, (_, j) => `kelime${k}x${j}`).join(" ")}.`;
/** n satır, her biri 10 kelime: toplam 10 × n. */
const lines = (n) => Array.from({ length: n }, (_, k) => ({ type: "photo", say: say(k), chapter: 0 }));
const drops = (from, count) => Array.from({ length: count }, (_, k) => ({ scene: from + k, action: "drop", kind: "retold", reason: "tekrar" }));

test("editorUser: an overlong script carries the UZUNLUK order with its numbers, before the research", () => {
  const u = P.editorUser({ scenes: lines(32), research: "araştırma metni", maxWords: 200 });
  assert.ok(u.includes("UZUNLUK (ZORUNLU): senaryo 320 kelime, en çok 200 olmalı — en az 120 kelime kırp: tekrar eden, olgusuz, köprü satırlarını drop et ya da iki satırı birleştirip kısalt (rewrite)."), u.slice(-900));
  assert.ok(u.includes("Kanca (ilk 60 sn), izleyici çağrısı (beğen/abone/yorum), sayaç/harita/cihaz satırları ve son iki satır kalır."));
  assert.ok(u.indexOf("UZUNLUK") < u.indexOf("ARAŞTIRMA (isim ve olgu kontrolü için):"), "the order comes before the research");
  // normal case: no maxWords, or a script already within it — the prompt is unchanged
  const plain = P.editorUser({ scenes: lines(32), research: "araştırma metni" });
  assert.ok(!plain.includes("UZUNLUK"));
  assert.equal(P.editorUser({ scenes: lines(32), research: "araştırma metni", maxWords: 320 }), plain);
});

test("applyEditorEdits: with maxWords the drop cap rises from 10 to 25; the minWords floor still holds", () => {
  const trim = P.applyEditorEdits(lines(32), drops(2, 15), { minWords: 100, maxWords: 200, lang: "en" });
  assert.equal(trim.applied.length, 15, JSON.stringify(trim.rejected));
  const many = P.applyEditorEdits(lines(40), drops(2, 30), { minWords: 0, maxWords: 100, lang: "en" });
  assert.equal(many.applied.length, 25);
  assert.ok(many.rejected.every((e) => e.why === "en çok 25 çıkarma"));
  // normal case: 10 drops at most
  const plain = P.applyEditorEdits(lines(32), drops(2, 15), { minWords: 100, lang: "en" });
  assert.equal(plain.applied.length, 10);
  assert.deepEqual([...new Set(plain.rejected.map((e) => e.why))], ["en çok 10 çıkarma"]);
  // floor: 320 words, minWords 250 → only 7 lines of 10 words can go
  const floor = P.applyEditorEdits(lines(32), drops(2, 15), { minWords: 250, maxWords: 200, lang: "en" });
  assert.equal(floor.applied.length, 7);
  assert.ok(floor.rejected.every((e) => e.why === "kelime hedefinin altına düşer"));
});

test("applyEditorEdits: while trimming, 30 code-finding rewrites do not crowd out the drops", () => {
  const rewrites = Array.from({ length: 30 }, (_, k) => ({ scene: 1 + k, action: "rewrite", kind: "clunky", say: "[serious] yeni ve kısa bir satır.", reason: "akış" }));
  const edits = [...rewrites, ...drops(31, 12)];
  const trim = P.applyEditorEdits(lines(50), edits, { minWords: 0, maxWords: 300, lang: "en" });
  assert.equal(trim.applied.filter((e) => e.action === "drop").length, 12);
  assert.equal(trim.applied.filter((e) => e.action === "rewrite").length, 30);
  // normal case: the edit cap stays 30
  const plain = P.applyEditorEdits(lines(50), edits, { minWords: 0, lang: "en" });
  assert.equal(plain.applied.length, 30);
  assert.equal(plain.applied.filter((e) => e.action === "drop").length, 0);
});

test("editorialPass forwards maxWords to the prompt and to the checks", async () => {
  let asked = null;
  const llm = async (req) => { asked = req; return { edits: drops(2, 15) }; };
  const scenes = lines(32);
  const out = await P.editorialPass({ scenes, research: "r", job: { language: "en" }, llm, minWords: 100, maxWords: 200 });
  assert.match(asked.user, /UZUNLUK \(ZORUNLU\): senaryo 320 kelime, en çok 200 olmalı — en az 120 kelime kırp/);
  assert.equal(out.applied.length, 15);
  assert.equal(scenes.length, 17);
  // the cached read applies with the same cap
  const again = await P.editorialPass({ scenes: lines(32), research: "r", job: { language: "en" }, llm: async () => { throw Error("no call"); }, minWords: 100, maxWords: 200, cachedEdits: drops(2, 15) });
  assert.equal(again.applied.length, 15);
  // normal case: no maxWords → no order, 10 drops
  const plainScenes = lines(32);
  const plain = await P.editorialPass({ scenes: plainScenes, research: "r", job: { language: "en" }, llm, minWords: 100 });
  assert.ok(!asked.user.includes("UZUNLUK"));
  assert.equal(plain.applied.length, 10);
});

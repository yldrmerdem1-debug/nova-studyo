// GERÇEK KİŞİNİN AI KARESİ: "YÜZ GÖRÜNMESİN" DEYİP ARDINDAN YÜZÜ TARİF ETMEK YOK.
//
// ÖLÇÜLEN KUSUR (24-25 Ekim 2026, 2009 denizaltı çarpışması, 20261024-373aaf): Amiral Band'in gerçek fotoğrafı
// bulunamadı, sahneleri AI'a gitti. gorsel-kutusu/needed.json #29: "Formal portrait of the man, a senior naval admiral
// ... steady direct gaze, plain dark background, seen from behind or in silhouette, face not visible. The person in
// the shot: ... clean-shaven, lined face with a steady direct gaze ... formal official portrait lighting." — #30 de
// aynı. hideRealFace yalnızca sona "face not visible" ekliyordu; yazarın "Formal portrait / direct gaze / Close-up of
// the man" çerçevesi önde kaldı, describe() de kişinin YÜZ tarifini ekledi. OpenAI'ın 16:33'te verdiği sahne 88 karesi
// kişisiz bir denizaltıydı ("That day, Admiral Sir Jonathon Band spoke." satırının altında).
//
// Kural: gerçek kişinin AI karesinde yüz isteyen çerçeve arkaya çevrilir, kişinin tarifinden yüzle ilgili her parça
// düşer (bodyOnly): yaş, üniforma, ortam kalır.
// 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, parlaklık 52-56): gizleme eki artık "seen from behind
// or at a distance, face not visible" — "in silhouette" gerçek kişiyi siyah bir figüre çeviriyordu (produce.mjs HIDDEN_FACE).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hideRealFace, bodyOnly } from "../docu-engine/lib/produce.mjs";

// Gerçek iş (engine-script.json cast + sahne 87/88/89 istemleri).
const BAND = "Senior Royal Navy admiral in his late fifties, around 2009, short neatly combed grey hair, clean-shaven, lined face with a steady direct gaze, dark navy blue admiral's uniform with gold sleeve rings, medal ribbons and white shirt with black tie, formal official portrait lighting.";
const MORIN = "French government minister in his late forties, around 2009, short dark brown hair receding slightly at the temples, clean-shaven, rounded face, rimless composed expression, dark tailored suit, white shirt and muted tie, photographed at a ministry podium with French tricolour behind.";
const S87 = "Formal portrait of the man, a senior naval admiral in dark navy uniform with gold sleeve rings, steady direct gaze, plain dark background";
const S88 = "Medium shot of the man in admiral's uniform standing at a lectern in a wood-panelled room, cameras blurred in the foreground";
const S89 = "Close-up of the man in admiral's uniform mid-sentence, microphones in front of him, cool press light";
const FACE = /\bgaze\b|clean-shaven|lined face|\bportrait of\b|grey hair|close-up of the man/i;

test("Band'in portre satırı: istem + kişi tarifi yüzü gizler, yüzü hiç tarif etmez", () => {
  const shot = `${hideRealFace(S87, ["band"])}. The person in the shot: ${bodyOnly(BAND)}.`;
  assert.match(shot, /face not visible/);
  assert.match(shot, /face not shown/);
  assert.ok(!FACE.test(shot), shot);
  assert.match(shot, /^Back view of the man, a senior naval admiral in dark navy uniform with gold sleeve rings, plain dark background, seen from behind or at a distance, face not visible\./);
  // Kişinin yüz dışı her şeyi kalır: kim olduğu, yılı, üniforması.
  for (const keep of ["Senior Royal Navy admiral in his late fifties", "around 2009", "gold sleeve rings", "black tie"]) assert.ok(shot.includes(keep), keep);
});

test("yakın plan arkadan çekime döner; yüz çerçevesi olmayan istem eskisiyle aynı kalır (önbellek anahtarı değişmez)", () => {
  const s89 = hideRealFace(S89, ["band"]);
  assert.match(s89, /^View from behind of the man in admiral's uniform mid-sentence/);
  assert.ok(!FACE.test(s89), s89);
  assert.equal(hideRealFace(S88, ["band"]), `${S88}, seen from behind or at a distance, face not visible`);
  // Gerçek kişi yoksa ya da istem yüzü zaten gizliyorsa hiçbir şey değişmez.
  assert.equal(hideRealFace(S87, []), S87);
  assert.equal(hideRealFace("Silhouette of the admiral at a window, formal portrait lighting", ["band"]), "Silhouette of the admiral at a window, formal portrait lighting");
  const look = hideRealFace("A woman facing the camera with a calm expression, close-up of her face", ["x"]);
  assert.ok(!/facing the camera|calm expression|close-up of her face/.test(look), look);
  // Yüzsüz yakın plan ("the man's hands") istendiği gibi kalır; "the man's face" başın arkasına döner; "her gaze fixed
  // on …" ifadesi bütünüyle düşer ("her fixed on the horizon" kalmaz).
  assert.equal(hideRealFace("Close-up of the man's hands gripping a lectern", ["band"]), "Close-up of the man's hands gripping a lectern, seen from behind or at a distance, face not visible");
  assert.match(hideRealFace("Close-up of the man's face lit by a desk lamp", ["band"]), /^The back of the man's head lit by a desk lamp, seen from behind/);
  assert.equal(hideRealFace("Close-up of the woman, her gaze fixed on the horizon, standing at the bow", ["x"]), "View from behind of the woman, standing at the bow, seen from behind or at a distance, face not visible");
});

test("bodyOnly: yüz parçaları düşer, kıyafet ve ortam kalır; 'brown' gibi kelimeler yüz sayılmaz", () => {
  const m = bodyOnly(MORIN);
  assert.equal(m, "French government minister in his late forties, around 2009, dark tailored suit, white shirt and muted tie, photographed at a ministry podium with French tricolour behind, face not shown");
  assert.equal(bodyOnly("A farmer in a brown coat, grey beard, holding a lantern"), "A farmer in a brown coat, holding a lantern, face not shown");
  // Virgülsüz tarifte yalnızca yüzlü "with" parçası düşer, kişi kalır.
  assert.equal(bodyOnly("A tall man in his sixties with a grey beard wearing a dark suit"), "A tall man in his sixties, face not shown");
  assert.equal(bodyOnly(""), "face not shown");
});

test("motor: gerçek kişinin tarifi her istekte bodyOnly'den geçer (describe ve FLUX Kontext'in 'Also in the shot')", () => {
  const src = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");
  assert.match(src, /const castText = \(n\) => \(REAL\.has\(n\) \? bodyOnly\(script\.cast\[n\]\) : script\.cast\[n\]\);/);
  assert.match(src, /const describe = \(names\) => [^\n]*names\.map\(castText\)\.join\('; '\)/);
  assert.match(src, /Also in the shot: \$\{castText\(n\)\}\./);
  assert.ok(src.indexOf("const REAL = new Set(") < src.indexOf("const castText = "), "REAL, tarif kurulmadan önce belli");
  assert.match(src, /const shown = hideRealFace\(prompt, cast\.filter\(\(n\) => REAL\.has\(n\)\)\);/);
});

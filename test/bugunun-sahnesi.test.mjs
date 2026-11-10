// BUGÜNÜN SAHNESİ BUGÜNÜN ARACIYLA ÇİZİLİR — "NO MODERN OBJECTS" YALNIZCA ESKİ SAHNELERDE.
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası yangını, 20261024-950730): motor her AI görsel isteğinin sonuna
// "no logos, no modern objects." ekliyordu — 2026'daki polis barikatlarına, motosiklete, itfaiye araçlarına da
// (gorsel-kutusu/LISTE.txt 22-29, hepsi era "2026"). Ön izleme 1. tur: sahne 6 "police had detained a man" için
// "meşaleli atlılar ve paltolu bir adam"; sahne 28 "1980'lerden kalma Amerikan polis arabası". Yeniden üretim turu ve
// kutu görseli harcandı.
//
// Kural: sahnenin yılı 1990 ve sonrasıysa istek "no modern objects" taşımaz, o yılın araç/üniforma/ekipmanını ister
// (styleFor). Yalnızca istek metni: önbellek anahtarları düz STYLE ile kalır, yapılmış görseller yeniden ödenmez.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { styleFor, PRESENT_FROM, EXPOSURE } from "../docu-engine/lib/produce.mjs";
import { yearOfEra } from "../docu-engine/lib/period.mjs";

// Kartal'ın gerçek visualStyle'ı + motorun eki (produce.mjs STYLE).
const KARTAL = "Sober documentary photograph with a cold blue-gray grade, natural overcast alpine daylight or real night firelight, 35mm lens, fine film grain, evidentiary realism, no people's faces in close-up. No readable text or lettering anywhere, no logos, no modern objects.";

test("2026 sahnesi 'no modern objects' istemez, kendi yılının araç ve üniformasını ister", () => {
  const s = styleFor(KARTAL, yearOfEra("2026"));
  assert.ok(!/no modern objects/i.test(s), s);
  assert.match(s, /Set in 2026: vehicles, uniforms and equipment as they look in 2026\./);
  // Geri kalan kurallar yerinde: yazı yok, logo yok, görsel dil aynı.
  assert.ok(s.includes("No readable text or lettering anywhere, no logos."), s);
  assert.ok(s.startsWith("Sober documentary photograph with a cold blue-gray grade"));
  assert.ok(!/\.\s*\./.test(s), "çift nokta kalmıyor");
});

// 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, parlaklık 52-56): her yılın isteği artık pozlama da ister
// (exposedStyle, yalnızca istek metni): eski sahnede STYLE + "Bright, well-exposed, natural colour."
const OLD = `${KARTAL} ${EXPOSURE}`;
test("eski ya da yılı bilinmeyen sahnede STYLE olduğu gibi kalır, yalnızca pozlama eklenir (Hastings, 1939, 1980'ler)", () => {
  for (const era of ["1066", "1939", "1952", "1980s", "", undefined]) assert.equal(styleFor(KARTAL, yearOfEra(era)), OLD, `era ${era}`);
  assert.equal(PRESENT_FROM, 1990);
  assert.equal(styleFor(KARTAL, 1989), OLD);
  assert.ok(!/no modern objects/.test(styleFor(KARTAL, 1990)), "1990'dan itibaren bugünün sahnesi");
  assert.equal(styleFor(KARTAL, NaN), OLD);
});

test("yazarın visualStyle'ı da 'no modern objects' derse o da düşer, cümle bozulmaz", () => {
  const s = styleFor("Grainy news photo, no modern objects, 35mm lens. No readable text or lettering anywhere, no logos, no modern objects.", 2009);
  assert.ok(!/modern objects/.test(s), s);
  assert.ok(s.startsWith("Grainy news photo, 35mm lens. No readable text"), s);
});

test("motor: anahtar düz STYLE ile, istek metni sahnenin yılına göre (styleFor) kurulur", () => {
  const src = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");
  const has = (re, why) => assert.ok(re.test(src), why);
  // Anahtarlar değişmedi: sahne, referans portre, FLUX yedeği ve tavan sayımı hâlâ STYLE'ı karıyor.
  has(/const baseKey = hash\(`\$\{OAI_KEYS \? 'oai\|' : ''\}img\|\$\{prompt\}\|\$\{people\}\|\$\{STYLE\}`\);/, "sahne anahtarı");
  has(/const key = hash\(`ref\|\$\{IMG\}\|\$\{name\}\|\$\{desc\}\|\$\{STYLE\}`\);/, "referans portre anahtarı");
  has(/hash\(`flux-fallback\|\$\{prompt\}\|.*\|\$\{STYLE\}`\)\}\.jpg/, "FLUX yedeği anahtarı");
  has(/img-\$\{hash\(`\$\{OAI_KEYS \? 'oai\|' : ''\}img\|\$\{prompt\}\|\$\{people\}\|\$\{STYLE\}`\)\}\.jpg/, "aiCached aynı anahtarı sayıyor");
  assert.ok(!/hash\([^)\n]*\$\{style\}/.test(src), "sahne stili hiçbir anahtara girmiyor");
  // İstek metinleri: beş görsel isteği (kutu, OpenAI, FLUX Kontext, FLUX, FLUX yedeği) sahnenin stilini taşır.
  assert.equal((src.match(/\$\{style\}\$\{period\} Wide 16:9/g) || []).length, 5);
  assert.equal((src.match(/\$\{STYLE\}\$\{period\}/g) || []).length, 0, "düz STYLE artık hiçbir isteğe eklenmiyor");
  // promptYear: istemin kendi yılı önce gelir (period.mjs); bu test onu bilmiyordu ve kendi başına kırıktı.
  has(/const year = (?:promptYear\(prompt\) \?\? )?yearOfEra\(script\.scenes\[i\]\?\.era \?\? script\.era\);\s*\n\s*const period = periodNegative\(year\);\s*\n\s*const style = styleFor\(STYLE, year\);/, "safeImage sahnenin yılını okur");
  has(/sceneImage\(shown, cast, period, style\)/, "ilk istek");
  has(/sceneImage\(soft, cast, period, style\)/, "yumuşatılmış istek");
  has(/fluxFallback\(soft, cast, period, style\)/, "FLUX yedeği");
  // Referans portre de kişinin ilk sahnesinin yılıyla istenir (2026 itfaiyecisi 1950'lerin itfaiyecisi olmaz).
  has(/clear face\. \$\{style\}`/, "referans portre isteği");
});

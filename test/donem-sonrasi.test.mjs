// DÖNEMDEN SONRASI (Gimli Glider, 28 Ekim 2026, 20261028-9ff721): hikâye 1983 ("anlatım 1971–2008 arası"). "C-GAUN was
// repaired and returned to service" satırındaki 1998 Miami fotoğrafı ve "riding the same jet into retirement"
// satırındaki 2008 Mojave fotoğrafı "1983'ten sonraki boya" diye reddedildi; ikincisi iki ret sonunda AI'a kilitlendi.
// Satırlar yıl yazmıyordu ama olaydan sonrasını anlatıyordu. Denetim ve yakından onay bunu biliyor.
import test from "node:test";
import assert from "node:assert/strict";
import { AFTERMATH_LINE, confirmPrompt, eraPrompt } from "../src/pipeline/docu-era-audit.js";

test("the era audit and its close-up check let an aftermath line show the later years", () => {
  assert.match(AFTERMATH_LINE, /hizmete döndü/);
  assert.match(AFTERMATH_LINE, /emekliye ayrıldı/);
  assert.ok(eraPrompt({ title: "Gimli", era: "1983 (anlatım 1971–2008 arası)", year: 1983, lines: [] }).includes(AFTERMATH_LINE));
  assert.ok(confirmPrompt({ era: "1983 (anlatım 1971–2008 arası)", year: 1983, lines: [] }).includes(AFTERMATH_LINE));
});

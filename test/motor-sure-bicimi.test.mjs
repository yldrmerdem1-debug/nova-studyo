// MOTORUN "dk sn" BİÇİMİ DE ÖNCE SANİYEYE YUVARLAR (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: job.log 23:36:22 qualityWarnings "~102 sn, 8:60 sonrası" — docu-script.js clock saniyeyi dakikadan ayrı
//   yuvarlıyordu (539,6 sn → "8:60"); saat-bicimi.test.mjs yazarın, kurgu ve sanat yönetmeninin saatlerini kilitliyor.
//   Aynı kalıp motorun fmtMin'inde de vardı (produce.mjs): "Seslendirilmiş video kısa: …" hatası, render süresi,
//   "render tahmini süresi" ve "kalan ~" satırları. Hesap: 119,6 sn → "1 dk 60 sn", 599,7 sn → "9 dk 60 sn".
//
// Kural: fmtMin önce tam saniyeye yuvarlar, sonra dakika/saniyeye böler; saniye hiçbir zaman 60 yazılmaz.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(ROOT, "docu-engine/lib/produce.mjs"), "utf8");
// fmtMin dışa açık değil: tanımını kaynaktan alıp tek başına çalıştırıyoruz (motoru yüklemeden, render yok).
const def = SRC.match(/^const fmtMin = (.+);$/m);
const fmtMin = def && new Function(`return (${def[1]});`)();

test("fmtMin rounds to whole seconds before splitting: 119.6 s is '2 dk 0 sn', never '1 dk 60 sn'", () => {
  assert.ok(fmtMin, "produce.mjs içinde tek satırlık fmtMin tanımı bulunamadı");
  assert.equal(fmtMin(119.6), "2 dk 0 sn");
  assert.equal(fmtMin(599.7), "10 dk 0 sn");
  assert.equal(fmtMin(59.5), "1 dk 0 sn");
  assert.equal(fmtMin(61.2), "1 dk 1 sn");
  assert.equal(fmtMin(600), "10 dk 0 sn");
  assert.equal(fmtMin(0), "0 dk 0 sn");
});

test("fmtMin never prints 60 seconds over a sweep of fractional durations", () => {
  for (let s = 0; s < 1500; s += 0.1) assert.doesNotMatch(fmtMin(s), / 60 sn$/, `fmtMin(${s.toFixed(1)})`);
});

test("no clock in the engine rounds the seconds apart from the minutes", () => {
  assert.doesNotMatch(SRC, /Math\.round\(\s*\w+\s*%\s*60\s*\)/);
});

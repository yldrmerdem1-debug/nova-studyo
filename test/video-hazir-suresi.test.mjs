// "VİDEO HAZIR" SATIRI DA ÖNCE SANİYEYE YUVARLAR (Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: job.log 23:36:22 qualityWarnings "~102 sn, 8:60 sonrası" — docu-script.js clock saniyeyi dakikadan ayrı
//   yuvarlıyordu (539,6 sn → "8:60"); saat-bicimi.test.mjs ve motor-sure-bicimi.test.mjs onları kilitliyor. Aynı kalıp
//   src/pipeline/index.js'in iki "Video hazır: … dk … sn" log satırında da vardı (klasik ve director işi bitişi):
//   599,7 sn → "9 dk 60 sn", 119,6 sn → "1 dk 60 sn".
//
// Kural: süre önce tam saniyeye yuvarlanır, sonra dakika/saniyeye bölünür (866. satırdaki "Seslendirme tamam" gibi);
//   saniye hiçbir zaman 60 yazılmaz.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(ROOT, "src/pipeline/index.js"), "utf8");
// Satırlar bir işin sonunda çalışıyor: şablonu kaynaktan alıp tek başına değerlendiriyoruz (iş/render yok).
const sablonlar = [...SRC.matchAll(/`(Video hazır: [^`]*)`/g)].map((m) => m[1]);
const yaz = (tpl, durationSec) => new Function("durationSec", "beats", `return \`${tpl}\`;`)(durationSec, { length: 12 });

test("both 'Video hazır' log lines are found in index.js", () => {
  assert.equal(sablonlar.length, 2, "index.js içinde iki 'Video hazır:' satırı bekleniyordu");
});

test("'Video hazır' rounds to whole seconds before splitting: 599.7 s is '10 dk 0 sn', never '9 dk 60 sn'", () => {
  for (const tpl of sablonlar) {
    assert.match(yaz(tpl, 599.7), /^Video hazır: 10 dk 0 sn\b/);
    assert.match(yaz(tpl, 119.6), /^Video hazır: 2 dk 0 sn\b/);
    assert.match(yaz(tpl, 59.5), /^Video hazır: 1 dk 0 sn\b/);
    assert.match(yaz(tpl, 61.2), /^Video hazır: 1 dk 1 sn\b/);
    assert.match(yaz(tpl, 0), /^Video hazır: 0 dk 0 sn\b/);
  }
  assert.equal(yaz(sablonlar[1], 61.2), "Video hazır: 1 dk 1 sn, 12 beat");
});

test("'Video hazır' never prints 60 seconds over a sweep of fractional durations", () => {
  for (const tpl of sablonlar) for (let s = 0; s < 1500; s += 0.1) assert.doesNotMatch(yaz(tpl, s), / 60 sn\b/, `${tpl} @ ${s.toFixed(1)}`);
});

test("no clock in index.js rounds the seconds apart from the minutes", () => {
  assert.doesNotMatch(SRC, /Math\.round\(\s*\w+\s*%\s*60\s*\)/);
});

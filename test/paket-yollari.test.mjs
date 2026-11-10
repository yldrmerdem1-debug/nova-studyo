// 1.16.16 — PAKETLİ UYGULAMADA MOTOR YOLU (16 Ekim 2026, ilk kurulum açılmadı): src/pipeline/docu-edit-director.js
// harita kodunu "../../docu-engine/lib/world-map.mjs" diye sabit yoldan import ediyordu. Kurulu uygulamada src/ app.asar
// içinde, motor ise resources/docu-engine'de durur: sunucu "Cannot find module …\app.asar\docu-engine\lib\world-map.mjs"
// ile açılmadı, pencere "Error" gösterdi. Geliştirme klasöründe yol tuttuğu için bütün testler geçiyordu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(f.name)) files.push(p);
  }
})(path.join(ROOT, 'src'));
files.push(path.join(ROOT, 'server.js'));

test('uygulama kodu motoru asla göreli yoldan import etmez (paketli uygulamada motor app.asar dışında)', () => {
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\(\s*)["'`]([^"'`]*docu-engine[^"'`]*)["'`]/g)) bad.push(`${path.relative(ROOT, f)}: ${m[1]}`);
  }
  assert.deepEqual(bad, [], 'motor modülü process.resourcesPath/docu-engine üzerinden çözülmeli (bkz. kling-video.js, docu-edit-director.js)');
});

test('harita ve zaman çizelgesi paketli yola önce bakar', () => {
  const ed = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu-edit-director.js'), 'utf8');
  assert.ok(ed.includes('process.resourcesPath && path.join(process.resourcesPath, "docu-engine", "lib", "world-map.mjs")'));
  const gate = fs.readFileSync(path.join(ROOT, 'src', 'pipeline', 'docu-design-gate.js'), 'utf8');
  assert.ok(gate.includes('process.resourcesPath && path.join(process.resourcesPath, "docu-engine", "src", "timeline.js")'));
});

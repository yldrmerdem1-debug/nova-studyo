// YAMA RENDER (El Niño haberi, Ekim 2026): 3:36'da tek bir yanlış sayı kartı vardı; motor düzeltmesi paketi
// değiştirdiği için Nova'da yeniden render 8 parçanın hepsini (2 saat) baştan çizecekti. Artık yalnızca o sahnenin
// parçası yeni motorla çizilir; diğer parçalar ve ses son render'ın dosyalarından aynen alınır.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("the engine finds last render's chunks by content-only keys and reuses every chunk that does not touch a patched scene", () => {
  const p = src("../docu-engine/lib/produce.mjs");
  assert.match(p, /vb: chunkKey\(\{ script, placed, chunk: c, bundle: 'patch'/);
  assert.match(p, /const touched = patchScenes\.some\(\(i\) => i >= c\.a - 1 && i <= c\.b \+ 1\)/);
  assert.match(p, /writeAtomic\(MANIFEST, JSON\.stringify/);
  assert.match(p, /patchScenes: o\.patchScenes \?\? null/);
  assert.match(p, /if \(o\.keepChunks !== false \|\| degraded\) rendered\.prune\(\);/, "chunks are kept so a patch is possible");
});

test("Nova: POST /api/jobs/:id/patch {scenes} → patchJob → spec.patchScenes, used once", async () => {
  assert.match(src("../src/studio-api.js"), /studioRouter\.post\('\/patch', action\(req => \(\{job:pipeline\.patchJob\(req\.params\.id, req\.body\?\.scenes\)\}\)\)\);/);
  assert.match(src("../src/pipeline/index.js"), /export function patchJob\(id, scenes\)/);
  const d = src("../src/pipeline/docu.js");
  assert.match(d, /patchScenes: Array\.isArray\(job\.patchScenes\) && job\.patchScenes\.length \? job\.patchScenes : null/);
  assert.match(d, /updateJob\(jobId, \{ patchScenes: null \}\)/);
  assert.match(src("../docu-engine/bin/nova-run.mjs"), /patchScenes: Array\.isArray\(spec\.patchScenes\)/);
});

test("before rendering, the engine logs every number the video will print (counters and tallies)", () => {
  assert.match(src("../docu-engine/lib/produce.mjs"), /log\(`ekrandaki sayılar: \$\{shown\.join\(' \| '\)\}`\)/);
});

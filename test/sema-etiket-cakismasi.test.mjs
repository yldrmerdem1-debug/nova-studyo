// ŞEMA ETİKETLERİ ÇAKIŞMAZ (inceleme, 28 Ekim 2026): Gimli 20261028-9ff721 sahne 59, telemetri şeması 6 adım. Uzay
// aracı ucunda adımlar ~190 px aralıklı, 300 px'lik etiketler aynı tarafta: "EVERY FIGURE AGREED" ile "1.77 WAS POUNDS
// PER LITRE" üst üste bindi ("FIGU1.77"); ön izleme kapısı iki turda düzeltemedi, kalite denetimi de yakaladı.
// Ağ, ffmpeg ve model YOK; şemanın yerleşimi kaynağından ve aynı eğri hesabından.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../docu-engine/src/topic/diagram.tsx", import.meta.url), "utf8");

// diagram.tsx Telemetry: A Dünya, C kontrol, B uzay aracı; adımlar t = 0.14 … 0.86.
const A = [300, 760], C = [930, 300], B = [1630, 430];
const qpt = (t) => [(1 - t) ** 2 * A[0] + 2 * (1 - t) * t * C[0] + t * t * B[0], (1 - t) ** 2 * A[1] + 2 * (1 - t) * t * C[1] + t * t * B[1]];
const tAt = (i, n) => 0.14 + (0.72 * i) / Math.max(1, n - 1);
const W = 300;

test("crowded telemetry steps alternate their labels above and below the path", () => {
  assert.match(src, /const LABEL_W = 300;/);
  assert.match(src, /const crowded = pts\.some\(\(p, i\) => i > 0 && Math\.abs\(p\[0\] - pts\[i - 1\]\[0\]\) < LABEL_W \+ 12\)/);
  assert.match(src, /const below = crowded \? i % 2 === 0 : y < 560;/);
  assert.match(src, /const labelW = Math\.min\(LABEL_W, sameSide - 12\);/);
  assert.match(src, /w=\{labelW\}/);
  for (let n = 2; n <= 8; n++) {
    const pts = Array.from({ length: n }, (_, i) => qpt(tAt(i, n)));
    const crowded = pts.some((p, i) => i > 0 && Math.abs(p[0] - pts[i - 1][0]) < W + 12);
    const sameSide = crowded ? Math.min(...pts.slice(2).map((p, i) => Math.abs(p[0] - pts[i][0]))) : Infinity;
    const w = Math.min(W, sameSide - 12);
    assert.ok(w >= 200, `${n} steps: labels shrink to ${w} px`);
    const side = pts.map(([, y], i) => (crowded ? i % 2 === 0 : y < 560));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (side[i] !== side[j]) continue;
      assert.ok(Math.abs(pts[i][0] - pts[j][0]) >= w, `${n} steps: labels ${i + 1} and ${j + 1} collide (${Math.round(Math.abs(pts[i][0] - pts[j][0]))} px < ${w})`);
    }
  }
});

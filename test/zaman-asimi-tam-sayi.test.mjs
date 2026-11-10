// ALT SÜREÇ ZAMAN AŞIMI TAM SAYI OLMALI.
//
// ÖLÇÜLEN KUSUR (26 Ekim 2026, Çernobil, 20261026-24122a): 1.16.25'te süreye
// göre ölçeklenen ffmpeg zaman aşımı (ffDeadline: 180 sn + süre×1000) kesirli
// çıktı — 22.960 kare / 30 = 765,33 sn → 945333,33 ms. Node spawnSync bunu
// reddetti ("The value of "timeout" is out of range. It must be an unsigned
// integer"); iş, render'ın tamamı bittikten sonra ses birleştirmede düştü.
// Lula (810,1 sn) tesadüfen tam sayı verdiği için geçmişti.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ffDeadline } from '../docu-engine/lib/produce.mjs';

test('ffDeadline her süre için tam sayı ms verir', () => {
  for (const s of [765.3333333, 22960 / 30, 810.1, 0.5, 1 / 3, 1199.99, 5000]) {
    const ms = ffDeadline(s);
    assert.ok(Number.isInteger(ms) && ms > 0, `${s} sn → ${ms}`);
  }
  assert.ok(Number.isInteger(ffDeadline(0)) && Number.isInteger(ffDeadline(undefined)));
});

test('ffDeadline değeri spawnSync tarafından kabul ediliyor', () => {
  const r = spawnSync(process.execPath, ['-e', '0'], { timeout: ffDeadline(22960 / 30) });
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.status, 0);
});

test('motorda süreden hesaplanan zaman aşımı yuvarlanıyor', () => {
  for (const f of ['produce.mjs', 'audio-director.mjs', 'sound-craft.mjs', 'pace.mjs']) {
    const src = fs.readFileSync(new URL(`../docu-engine/lib/${f}`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/timeout:\s*([^,}\n]+)/g)) {
      const e = m[1].trim();
      if (/^[A-Z_0-9]+$|^\d[\d_]*$|^ffDeadline\(|^Math\.(ceil|round|floor)\(|^o\.timeout$|^true$/.test(e)) continue;
      assert.fail(`${f}: yuvarlanmamış zaman aşımı "${e}"`);
    }
  }
});

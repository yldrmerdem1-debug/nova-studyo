// ARA PLAN + KOLAJ PANOSU — kolaj türlerinde (suç, finans...) bazı fotoğraflar panoya baskı olarak konur ve
// pano ara planları (inserts) HİÇ çizmez. Irkutsk yeniden yapımında (Ekim 2026) üç ara planlı 28 sn'lik satır
// tek bir küçük baskı olarak durdu. Kural: ara planı olan, tam kadraja uygun satır panoya gitmez; panoda
// kalacak küçük/dikey baskıya ise ara plan üretilmez (parası ödenip hiç görünmezdi).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isLowResStill } from "../docu-engine/src/effects/variety.js";

const scenes = fs.readFileSync(new URL("../docu-engine/src/scenes.tsx", import.meta.url), "utf8");
const produce = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");

test("ara planı olan tam kadraj satır panoya gitmez", () => {
  const body = scenes.slice(scenes.indexOf("const collageOn"), scenes.indexOf("export interface Impact"));
  assert.match(body, /s\.inserts\?\.length/, "collageOn ara planları hesaba katmalı");
});

test("panoda kalacak küçük baskıya ara plan üretilmez", () => {
  assert.match(produce, /boardOnly/);
  assert.match(produce, /plan\.filter\(\(p\) => !boardOnly\(/);
});

test("küçük/dikey baskı ölçüsü: 2400x1600 tam kadraj, 651x867 baskı", () => {
  assert.equal(isLowResStill(2400, 1600), false);
  assert.equal(isLowResStill(651, 867), true);
});

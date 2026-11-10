// BAŞLIK KARTINDA ARA PLAN — başlık durur, altındaki resim değişir (anahtar kelime kartı gibi).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): kancadaki bölüm kartı olmayan başlık
// ("It Burned Down in One Night", 6,2 sn, arşiv resmi üstünde) dört ön izleme turunda da "yavaş kanca" diye raporlandı;
// motorun başlık bileşeni (PlainTitle) scene.inserts'ı hiç çizmiyordu — satıra ara plan konsa bile ekranda aynı kare
// kalırdı. Kural: resmi olan, derinlik katmanı olmayan başlık ara planlarını resmin üstünde, yazının altında çizer
// (Words anahtar kelime kartıyla aynı: InsertShots + karartma). Statik kontrol; render ve ffmpeg YOK.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const scenes = fs.readFileSync(new URL("../docu-engine/src/scenes.tsx", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../docu-engine/src/types.ts", import.meta.url), "utf8");
const plainTitle = scenes.slice(scenes.indexOf("const PlainTitle"), scenes.indexOf("const ChapterCard"));

test("başlık kartı ara planları çizer: resim var, katman yok", () => {
  assert.ok(plainTitle.length > 0, "PlainTitle bulunmalı");
  assert.match(plainTitle, /scene\.image && !scene\.layers && scene\.inserts\?\.length \? \(/, "resim + katmansız başlıkta koşullu");
  assert.match(plainTitle, /<InsertShots scene=\{scene\} durFrames=\{durFrames\} \/>/);
});

test("ara plan resmin üstünde, yazının altında; üstünde karartma", () => {
  const backdrop = plainTitle.indexOf("<Backdrop");
  const shots = plainTitle.indexOf("<InsertShots");
  const scrim = plainTitle.indexOf("background: 'rgba(0,0,0,0.36)'");
  const text = plainTitle.indexOf("<StyledTitle");
  assert.ok(backdrop >= 0 && shots > backdrop, "başlığın kendi resminden sonra");
  assert.ok(scrim > shots, "ara planın üstünde karartma (yazı okunur kalır)");
  assert.ok(text > scrim, "yazıdan önce: başlık ara planın üstünde durur");
});

test("başlık sahnesi ara plan taşıyabilir (SceneBase.inserts)", () => {
  const base = types.slice(types.indexOf("interface SceneBase"), types.indexOf("export interface TitleScene"));
  assert.match(base, /inserts\?: InsertShot\[\];/);
  assert.match(types, /export interface TitleScene extends SceneBase/);
});

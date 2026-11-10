// KANAL SESİ ETİKETİ (29 Ekim 2026, kanal sahibi: "her kanalın sesini yanında göster, seçtiğimiz unutmayalım").
// Stil düğmeleri (Tarih / Gündem / Finans) altında ayarlardaki kanal sesinin adı ve kökeni yazar. Kaynak metinden denetlenir.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

test("each channel style button shows its configured voice and where it came from", () => {
  assert.match(app, /function kanalSesEtiketi\(k\)/);
  assert.match(app, /state\.settings\?\.docuStyleVoices\?\.\[k\]/, "the voice comes from settings.docuStyleVoices");
  assert.match(app, /\$\{ad\.replace\(\/\^✨ \/, ""\)\}\$\{kanalSesEtiketi\(k\)\}<\/button>/, "label sits inside the style chip");
  assert.match(app, /🎙 ses seçilmedi/, "a channel without a voice says so");
  for (const id of ["s7KFkBv0nrs6EIRE1GDy", "u9E4FBbWILPZakBNST5d", "QCi5Cmzx0lbdL1Z3VhF3"]) assert.ok(app.includes(id), id);
  assert.match(app, /paintModes\(\)/, "the row repaints when the voice list arrives");
});

// Gimli 9ff721 önce/sonra, 29 Ekim 2026: renk notu temel oldu, ama scene.monoSource hiçbir adımda yazılmıyordu —
// motor (looks/resolve.ts sceneGrade) gerçekten siyah-beyaz bir arşiv kaynağını tanıyamıyordu. Artık arşiv/Commons/
// görsel kutusu fotoğrafı ve kaynak klip afişi diskte ölçülür; yalnızca gerçekten gri olan işaretlenir, ölçüm hatası
// bayraksız (renkli) bırakır. ffmpeg'siz: saf yardımcılar ve kaynak metni.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const media = await import("../src/pipeline/media.js");
const { applySourcePicks } = await import("../src/pipeline/source-clips.js");

const stats = (satavg, sathigh, satmax) => `[Parsed_metadata_2 @ 0x1] frame:0    pts:0
[Parsed_metadata_2 @ 0x1] lavfi.signalstats.YAVG=101.2
[Parsed_metadata_2 @ 0x1] lavfi.signalstats.SATMIN=0
[Parsed_metadata_2 @ 0x1] lavfi.signalstats.SATAVG=${satavg}
[Parsed_metadata_2 @ 0x1] lavfi.signalstats.SATHIGH=${sathigh}
[Parsed_metadata_2 @ 0x1] lavfi.signalstats.SATMAX=${satmax}
[Parsed_metadata_2 @ 0x1] lavfi.signalstats.HUEMED=0`;

test("isMonochrome: gri fotoğraf mono; renkli, sepya ve 'gri zeminde küçük renkli uçak' renkli kalır", () => {
  const { isMonochrome, MONO_SAT_MAX } = media;
  assert.equal(MONO_SAT_MAX, 4);
  assert.equal(isMonochrome({ satavg: 0.67, sathigh: 1, satmax: 1 }), true, "gri");
  assert.equal(isMonochrome({ satavg: 3.2, sathigh: 6, satmax: 20 }), true, "hafif sıcak kaymalı s/b tarama");
  assert.equal(isMonochrome({ satavg: 124.7, sathigh: 137, satmax: 144 }), false, "renkli");
  assert.equal(isMonochrome({ satavg: 19.9, sathigh: 33, satmax: 34 }), false, "sepya kendi rengiyle kalır");
  assert.equal(isMonochrome({ satavg: 1.43, sathigh: 1, satmax: 135 }), false, "gri pist + kırmızı uçak");
  assert.equal(isMonochrome({ satavg: 3.5, sathigh: 14 }), false, "doygun %10 eşiği yüksek");
  assert.equal(isMonochrome({ satavg: 4 }), false, "eşik dahil değil");
  assert.equal(isMonochrome({ satavg: 2 }), true, "yalnız ortalama bilinirse ortalama karar verir");
  for (const bad of [null, undefined, {}, { satavg: NaN }, { satavg: -1 }, { satavg: null }, "x", 0]) assert.equal(isMonochrome(bad), false, `ölçüm yok: ${String(bad)}`);
});

test("parseSatStats: signalstats metadata çıktısını okur, SATAVG yoksa null", () => {
  assert.deepEqual(media.parseSatStats(stats(0.666667, 1, 1)), { satavg: 0.666667, sathigh: 1, satmax: 1 });
  assert.equal(media.parseSatStats("Error opening input file"), null);
  assert.equal(media.parseSatStats(""), null);
  assert.deepEqual(media.parseSatStats("lavfi.signalstats.SATAVG=2.5"), { satavg: 2.5 });
});

test("markMonoSource: mono → bayrak; renkli/ölçülemeyen/hata → bayrak silinir (eski resmin bayrağı kalmaz)", () => {
  const { markMonoSource } = media;
  const s1 = {};
  assert.equal(markMonoSource(s1, "a.jpg", { measure: () => ({ satavg: 1, sathigh: 2, satmax: 5 }) }), true);
  assert.equal(s1.monoSource, true);
  const s2 = { monoSource: true };
  assert.equal(markMonoSource(s2, "b.jpg", { measure: () => ({ satavg: 60, sathigh: 90, satmax: 120 }) }), false);
  assert.equal("monoSource" in s2, false);
  const s3 = { monoSource: true };
  assert.equal(markMonoSource(s3, "c.jpg", { measure: () => null }), null);
  assert.equal("monoSource" in s3, false);
  const s4 = {};
  assert.equal(markMonoSource(s4, "d.jpg", { measure: () => { throw new Error("ffmpeg yok"); } }), null);
  assert.equal("monoSource" in s4, false);
  assert.equal(markMonoSource(null, "e.jpg"), null);
});

test("measureSaturation: olmayan dosya ffmpeg çalıştırmadan null (yeniden indirme/ücret yok)", () => {
  assert.equal(media.measureSaturation(path.join(root, "test", "__yok__.jpg"), { ffmpeg: "__ffmpeg_yok__" }), null);
  assert.equal(media.measureSaturation("", {}), null);
});

test("motor aynası: produce.mjs eşikleri ve monoFromSignalstats uygulamayla aynı karar verir", async () => {
  const eng = await import("../docu-engine/lib/produce.mjs");
  assert.equal(eng.MONO_SAT_MAX, media.MONO_SAT_MAX);
  assert.equal(eng.MONO_SAT_HIGH_MAX, media.MONO_SAT_HIGH_MAX);
  assert.equal(eng.MONO_SAT_PEAK_MAX, media.MONO_SAT_PEAK_MAX);
  for (const [a, h, m] of [[0.67, 1, 1], [124.7, 137, 144], [19.9, 33, 34], [1.43, 1, 135], [3.2, 6, 20], [3.9, 10, 10]]) {
    const txt = stats(a, h, m);
    assert.equal(eng.monoFromSignalstats(txt), media.isMonochrome(media.parseSatStats(txt)), `SATAVG ${a}`);
  }
  assert.equal(eng.monoFromSignalstats("no stats"), null);
});

test("applySourcePicks: klibin kendi ölçümü karar verir; yerine geçilen fotoğrafın bayrağı klibe geçmez", () => {
  const script = { scenes: [
    { type: "photo", say: "The plane glided.", image: "b/photo.jpg", archived: true, monoSource: true },
    { type: "photo", say: "Crowds watched.", image: "b/p2.jpg" },
    { type: "photo", say: "He said it." },
  ] };
  const base = { videoStart: 0, dur: 4, w: 1280, h: 720, label: "CBC · 1983", url: "https://www.youtube.com/watch?v=x", channel: "CBC", uploadDate: "20200101", year: 1983 };
  const picks = [
    { ...base, kind: "event", scene: 0, video: "b/src-a.mp4", image: "b/src-a.jpg", id: "a" },
    { ...base, kind: "event", scene: 1, video: "b/src-b.mp4", image: "b/src-b.jpg", id: "b" },
    { ...base, kind: "voice", scene: 2, video: "b/src-c.mp4", image: "b/src-c.jpg", wav: "b/src-c.wav", quote: "We made it.", id: "c" },
  ];
  const mono = (p) => p.id === "b" || p.id === "c";
  const { script: out } = applySourcePicks(script, {}, picks, { mono });
  const byVideo = (v) => out.scenes.find((s) => s.video === v);
  assert.equal("monoSource" in byVideo("b/src-a.mp4"), false, "renkli klip fotoğrafın mono bayrağını almaz");
  assert.equal(byVideo("b/src-b.mp4").monoSource, true, "s/b klip işaretlenir");
  assert.equal(byVideo("b/src-c.mp4").monoSource, true, "s/b ses klibi işaretlenir");
  // Ölçüm patlarsa bayrak konmaz; varsayılan (ölçüm verilmezse) hiç bayrak yok.
  const { script: out2 } = applySourcePicks(script, {}, picks, { mono: () => { throw new Error("x"); } });
  assert.equal(out2.scenes.some((s) => s.video && s.monoSource), false);
  const { script: out3 } = applySourcePicks(script, {}, picks);
  assert.equal(out3.scenes.some((s) => s.video && s.monoSource), false);
});

test("hat bağlantıları: arşiv, Commons adıyla, klip afişi, görsel kutusu ve motorun ödünç klibi bayrağı yazar", () => {
  const arc = read("src/pipeline/docu-archive.js");
  assert.match(arc, /markMonoSource\(s, path\.join\(publicDir, got\.file\)/, "adıyla Commons");
  assert.match(arc, /markMonoSource\(s, path\.join\(publicDir, vhit\.file \|\| vhit\.video\)/, "arşiv klibi afişi");
  assert.match(arc, /markMonoSource\(s, path\.join\(publicDir, hit\.file\)/, "arşiv fotoğrafı");
  const inbox = read("src/pipeline/inbox-commons.js");
  assert.match(inbox, /markMonoSource\(s, dest, \{ ffmpeg \}\)/, "görsel kutusundan arşiv kaydına giren portre");
  const clips = read("src/pipeline/source-clips.js");
  assert.match(clips, /isMonochrome\(measureSaturation\(path\.join\(publicDir, p\.image \|\| p\.video/, "kaynak klip afişi");
  const prod = read("docu-engine/lib/produce.mjs");
  assert.match(prod, /scene\.monoSource === undefined[\s\S]{0,600}monoFromSignalstats\(out\) === true/, "eski iş: motor ölçer");
  assert.match(prod, /donor\.monoSource === true\) sc\.monoSource = true/, "ödünç klip bayrağı taşır");
  for (const t of [arc, inbox, clips, prod]) assert.match(t, /Gimli 9ff721/, "ders yorumda adıyla");
});

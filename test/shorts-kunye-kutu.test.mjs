// SHORT KÜNYESİ UZUN VİDEONUN KURALLARIYLA YAZILIR (Kartal Yuvası 20261024-950730, Fransa borcu 20261024-48ae2d — 24-25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: (1) Kartal'da iki CC BY / CC BY-SA Commons fotoğrafı (Michael Lucan, Wolfgang Manousek) görsel kutusuna
//   elle kondu, atıfları gorsel-kutusu/KUNYE.txt'deydi; Short künyesi yalnız docu-archive-done.json ile kaynak klipleri
//   okuyordu, kutu fotoğrafını gösteren Short onu anmazdı. (2) Short künyesinin yazar/sağlayıcı/klip sahibi kuralları
//   kunye.js'ninkinin kopyasıydı: türev eserin yazar alanı ("File:… .jpg: Jonovision82 derivative work: Georgfotoart")
//   "author unspecified" oldu (iki gerçek ad düştü), uzun ad 50 karakterde kesildi, sosyal medya klibi
//   "(@citizen on TikTok, tiktok.com)" diye iki kez site adı yazdı. (3) Shorts planlayıcısı her Short'ta bir kez
//   max_tokens'a takıldı (04:51:29, 05:05:14): büyük Sonnet isteği iki kez ödendi.
// Kural: kutu fotoğrafının künyesi kutuKunyesi ile okunur (arşiv künyesi varsa o kalır); yazar yazarAdi, sağlayıcı
//   saglayiciAdi, klip sahibi klipSahibi ile yazılır; planlayıcı isteği ≥ 5000 token bütçeyle gider. Ağ YOK, model YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { creditAuthor, pictureAssets, planPictureTeaser, shortCredits } = await import("../src/pipeline/docu-shorts-pictures.js");

test("Kartal: a hand-placed inbox photo is credited from gorsel-kutusu/KUNYE.txt; the archive's own credit wins", () => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-short-kutu-"));
  const pub = path.join(jobDir, "docu", "public", "build", "j");
  fs.mkdirSync(pub, { recursive: true });
  const kutu = path.join(jobDir, "gorsel-kutusu");
  fs.mkdirSync(kutu);
  for (const f of ["img-1.jpg", "img-2.jpg", "img-3.jpg"]) fs.writeFileSync(path.join(pub, f), "x");
  fs.writeFileSync(path.join(jobDir, "docu", "j.props.json"), JSON.stringify({ script: { scenes: [
    { say: "Bavaria's interior minister came to the scene.", image: "build/j/img-1.jpg" },
    { say: "The house on the Kehlstein.", image: "build/j/img-2.jpg" },
    { say: "Police closed the road.", image: "build/j/img-3.jpg" },
  ] } }));
  fs.writeFileSync(path.join(kutu, "needed.json"), JSON.stringify({ items: [1, 2, 3].map((n) => ({ n, file: `build/j/img-${n}.jpg`, prompt: "x" })) }));
  // The photos as Kartal's inbox held them (01.jpg, 02.jpg by hand, 03.png from ChatGPT): a KUNYE line counts only so.
  for (const f of ["01.jpg", "02.jpg", "03.png"]) fs.writeFileSync(path.join(kutu, f), "x");
  fs.writeFileSync(path.join(kutu, "KUNYE.txt"), [
    "01 Michael Lucan / Wikimedia Commons, CC BY-SA 3.0 de — https://commons.wikimedia.org/wiki/File:2016-02-02_Joachim_Herrmann_0617.JPG",
    "02 Wolfgang Manousek from Dormagen, Germany / Wikimedia Commons, CC BY 2.0 — https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_Obersalzberg_Bavaria_Germany_2004.jpg",
    "03 AI görseli (ChatGPT) — Bavyera polis barikatı",
  ].join("\r\n"));
  // A Commons photo inbox-commons.js already recorded in the archive keeps that record.
  fs.writeFileSync(path.join(jobDir, "docu-archive-done.json"), JSON.stringify({ credits: { "scene-1": { file: "build/j/img-2.jpg", provider: "wikimedia", eser: "Kehlsteinhaus 2004.jpg", sahip: "W. Manousek", lisans: "CC BY 2.0" } } }));
  const assets = pictureAssets(jobDir);
  assert.equal(assets.find((a) => a.rel === "build/j/img-1.jpg")?.credit?.sahip, "Michael Lucan");
  assert.equal(assets.find((a) => a.rel === "build/j/img-2.jpg")?.credit?.sahip, "W. Manousek", "the archive's credit is not overwritten");
  assert.equal(assets.find((a) => a.rel === "build/j/img-3.jpg")?.credit, undefined, "an AI line of KUNYE.txt is no credit");
  assert.equal(
    shortCredits(assets),
    "Photos: 2016-02-02 Joachim Herrmann 0617, Michael Lucan, CC BY-SA 3.0 de, Wikimedia Commons; Kehlsteinhaus 2004, W. Manousek, CC BY 2.0, Wikimedia Commons",
  );
  // No inbox (most jobs): nothing changes, nothing throws.
  fs.rmSync(kutu, { recursive: true, force: true });
  assert.equal(pictureAssets(jobDir).find((a) => a.rel === "build/j/img-1.jpg")?.credit, undefined);
  fs.rmSync(jobDir, { recursive: true, force: true });
});

test("France/Kartal: author, provider and clip owner are written by kunye.js's rules", () => {
  // Stock asks for no credit: no line, and never "Wikimedia Commons".
  const stock = shortCredits([{ rel: "a", credit: { provider: "pexels", lisans: "Pexels License", eser: "a burning wood", sahip: "Lay-Z Owl" } }]);
  assert.equal(stock, "");
  assert.doesNotMatch(stock, /Wikimedia Commons/);
  // A derivative work keeps both real names; a long name is never cut (the CC BY-SA credit is the name).
  assert.equal(creditAuthor("File:View of Kehlstein and Kehlsteinhaus from the Rossfeld Trail.jpg: Jonovision82 derivative work: Georgfotoart"), "Jonovision82 / Georgfotoart");
  const long = "Bundesarchiv, Bild 183-R14128A / Unknown photographer / CC-BY-SA 3.0";
  assert.equal(creditAuthor(long), long);
  assert.match(
    shortCredits([{ rel: "d", credit: { provider: "wikimedia", eser: "Kehlstein Trail.jpg", sahip: "File:View of Kehlstein.jpg: Jonovision82 derivative work: Georgfotoart", lisans: "CC BY-SA 3.0" } }]),
    /^Photos: Kehlstein Trail, Jonovision82 \/ Georgfotoart, CC BY-SA 3\.0, Wikimedia Commons$/,
  );
  // No author at all: the licensor's attribution line, as in the long video's description.
  assert.match(shortCredits([{ rel: "b", credit: { provider: "wikipedia", eser: "Bormann.jpg", sahip: "Unknown Unknown", attribution: "Bundesarchiv, Bild 183-R14128A / CC-BY-SA 3.0", lisans: "CC BY-SA 3.0 de" } }]), /Bormann, Bundesarchiv, Bild 183-R14128A \/ CC-BY-SA 3\.0, CC BY-SA 3\.0 de, Wikimedia Commons/);
  // A YouTube clip names its channel the way the long video does; one with no title is the channel alone.
  assert.equal(
    shortCredits([{ rel: "v.mp4", credit: { provider: "youtube", eser: "Kehlsteinhaus fire", kanal: "Billy Cosgrave", url: "https://www.youtube.com/watch?v=x1" } }]),
    'Videos: "Kehlsteinhaus fire" (Billy Cosgrave on YouTube)',
  );
  assert.equal(shortCredits([{ rel: "w.mp4", credit: { provider: "youtube", kanal: "Billy Cosgrave", url: "https://youtu.be/x2" } }]), "Videos: Billy Cosgrave on YouTube");
});

test("Kartal Shorts: the picture planner asks with room for the whole plan (no paid max_tokens retry)", async () => {
  let asked = null;
  await assert.rejects(
    planPictureTeaser({
      cues: [{ s: 0, e: 3, t: "The house on the Kehlstein burned in October." }],
      title: "Eagle's Nest fire",
      catalog: [{ id: "p1", rel: "a.jpg", kind: "still", source: "real", quality: 4, what: "the Kehlsteinhaus", srcH: 1080 }],
      llm: async (p) => {
        asked = p;
        throw Error("stop");
      },
    }),
    /stop/,
  );
  assert.ok(asked?.maxTokens >= 5000, `maxTokens ${asked?.maxTokens}`);
});

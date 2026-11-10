// SHORT KÜNYESİ KAYNAĞINI DOĞRU ANAR (Kartal Yuvası 20261024-950730, Fransa borcu 20261024-48ae2d — 24-25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: teslim edilen "Short n baslik.txt"lerde (shorts/short-*.json description) her fotoğraf
//   "…, Wikimedia Commons" ile bitti: "a burning wood, Lay-Z Owl, Pexels License, Wikimedia Commons", "Eiffel tower …,
//   Maxim Klimashin, Unsplash License, Wikimedia Commons", "man, sign, paper, write, … signa, Maximilianovich, Pixabay
//   Content License, Wikimedia Commons" (docu-archive-done.json'da provider pexels/unsplash/pixabay), "100 euro bill,
//   khawkins04, BY 2.0, Wikimedia Commons" (provider openverse, "CC" yok). Dosya adları uzantılı ("Barnier
//   Portrait.jpg"), yazar "Unknown Unknown", Pexels başlığı kelime ortasında kesik ("…in Paris, sh"). İki Kartal Short'u
//   da src-85b69b3639 (obersalzberggeist) ve src-8d26c0370b (War in the Margins) YouTube kliplerini gösterdi, hiçbirini
//   anmadı: künyeler yalnız docu-archive-done.json'dan okunuyordu, kaynak klip künyeleri ondan sonra ekleniyor.
// Kural: atıf isteyen lisans (BY/GFDL/FAL) kendi sağlayıcısıyla anılır, atıf istemeyen stok yazılmaz, başlık/yazar
//   temizlenir, kaynak klip docu-source-clips.json'dan "Videos:" satırına girer. Ağ YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { creditAuthor, creditTitle, pictureAssets, shortCredits } = await import("../src/pipeline/docu-shorts-pictures.js");

test("France Short 2: stock needs no line, an Openverse photo names Openverse and its CC licence", () => {
  assert.equal(
    shortCredits([
      { rel: "a", credit: { eser: "Bank", sahip: "X", lisans: "Pexels License", provider: "pexels" } },
      { rel: "b", credit: { eser: "100 euro bill", sahip: "k", lisans: "BY 2.0", provider: "openverse" } },
    ]),
    "Photos: 100 euro bill, k, CC BY 2.0, Openverse",
  );
  const stock = [
    { rel: "p", credit: { provider: "pexels", eser: "a burning wood", sahip: "Lay-Z Owl", lisans: "Pexels License" } },
    { rel: "u", credit: { provider: "unsplash", eser: "Eiffel tower visible over paris rooftops", sahip: "Maxim Klimashin", lisans: "Unsplash License" } },
    { rel: "x", credit: { provider: "pixabay", eser: "man, sign, paper, write, document", sahip: "Maximilianovich", lisans: "Pixabay Content License" } },
    { rel: "m", credit: { provider: "mixkit", eser: "mountainous area in the alps", sahip: "Mixkit", lisans: "Mixkit Stock Video Free License" } },
    { rel: "d", credit: { provider: "wikimedia", eser: "Kehlstein Mountain.JPG", sahip: "DennisPeeters", lisans: "Public domain" } },
  ];
  assert.equal(shortCredits(stock), "", "no credit owed: no Photos line at all");
});

test("Kartal/France: file names lose their extension, Commons junk authors are cleaned, a copy is credited once", () => {
  const out = shortCredits([
    { rel: "c.jpg", credit: { provider: "wikimedia", eser: "Barnier Portrait.jpg", sahip: "Florian David Pm", lisans: "CC BY-SA 4.0" } },
    { rel: "bormann.jpg", credit: { provider: "wikipedia", eser: "Bundesarchiv Bild 183-R14128A, Martin Bormann (3x4 cropped) (2).jpg", sahip: "Unknown Unknown", lisans: "CC BY-SA 3.0 de" } },
    { rel: "cm.jpg", credit: { provider: "wikimedia", eser: "Kehlsteinhaus zepředu", sahip: "Ondřej Žváček", lisans: "CC BY 2.5" } },
    { rel: "ov.jpg", credit: { provider: "openverse", eser: "File:Kehlsteinhaus zepředu", sahip: "Ondřej Žváček", lisans: "BY 2.5" } },
  ]);
  assert.match(out, /Barnier Portrait, Florian David Pm, CC BY-SA 4\.0, Wikimedia Commons/);
  assert.doesNotMatch(out, /\.jpg/);
  assert.match(out, /Bundesarchiv Bild 183-R14128A, Martin Bormann…, author unspecified, CC BY-SA 3\.0 de, Wikimedia Commons/);
  assert.equal(out.match(/Kehlsteinhaus zepředu/g).length, 1, "the Openverse copy of the Commons file");
  assert.equal(creditAuthor("Mario Becker - Project-B-WW 15:56, 16. Sep. 2008 (CEST)"), "Mario Becker - Project-B-WW");
  assert.equal(creditAuthor("The original uploader was Florian S. at German Wikipedia."), "Florian S.");
  assert.equal(creditAuthor("File:View of Kehlstein and Kehlsteinhaus from the Rossfeld.jpg"), "author unspecified");
  assert.equal(creditTitle("Stunning capture of the Palais Bourbon by the Seine River in Paris, showing"), "Stunning capture of the Palais Bourbon by the…", "cut at a word, never 'sh'");
});

test("Kartal: a source clip the Short shows is credited by title and channel from docu-source-clips.json", () => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-short-kunye-"));
  const pub = path.join(jobDir, "docu", "public", "build", "j", "src");
  fs.mkdirSync(pub, { recursive: true });
  const video = "build/j/src/src-85b69b3639.mp4";
  const still = "build/j/src/src-85b69b3639.jpg";
  for (const rel of [video, still, "build/j/cm-a.jpg"]) fs.writeFileSync(path.join(jobDir, "docu", "public", rel), "x");
  fs.writeFileSync(path.join(jobDir, "docu", "j.props.json"), JSON.stringify({ script: { scenes: [
    { say: "An elevator shaft cut 124 meters into the rock.", video, image: still, videoDur: 5 },
    { say: "Seen from the east.", image: "build/j/cm-a.jpg" },
  ] } }));
  fs.writeFileSync(path.join(jobDir, "docu-archive-done.json"), JSON.stringify({ credits: { 1: { file: "build/j/cm-a.jpg", provider: "wikimedia", eser: "Kehlsteinhaus von Osten.jpg", sahip: "Werudolf", lisans: "CC BY-SA 3.0" } } }));
  fs.writeFileSync(path.join(jobDir, "docu-source-clips.json"), JSON.stringify({ picks: [{ scene: 0, kind: "event", video, image: still, title: "Surfing on Hitler's Elevator in the Kehlsteinhaus", channel: "obersalzberggeist", url: "https://www.youtube.com/watch?v=rTXdYptyCWE" }] }));
  const assets = pictureAssets(jobDir);
  assert.equal(assets.find((a) => a.rel === video)?.credit?.provider, "youtube");
  assert.equal(assets.find((a) => a.rel === still)?.credit?.kanal, "obersalzberggeist", "the clip's still frame too");
  assert.equal(
    shortCredits(assets),
    'Photos: Kehlsteinhaus von Osten, Werudolf, CC BY-SA 3.0, Wikimedia Commons\nVideos: "Surfing on Hitler\'s Elevator in the Kehlsteinhaus" (obersalzberggeist on YouTube)',
  );
  fs.rmSync(jobDir, { recursive: true, force: true });
  // A social clip names its site: source-clips.js writes its channel as "@citizen on TikTok" (kunye.js klipSahibi).
  assert.equal(shortCredits([{ rel: "s", credit: { provider: "social", eser: "Limoges City Hall on fire", kanal: "@citizen on TikTok", url: "https://www.tiktok.com/@citizen/video/1" } }]), 'Videos: "Limoges City Hall on fire" (@citizen on TikTok)');
});

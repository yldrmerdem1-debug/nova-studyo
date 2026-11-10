// AÇIKLAMANIN KÜNYESİ: MÜZİĞİN KAYNAĞI VE GÖRSEL KUTUSUNUN FOTOĞRAFLARI (docu.js bağlantısı).
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası 20261024-950730 ve Fransa borcu 20261024-48ae2d): package.md'nin İngilizce
// müzik bölümünde her parçanın altında Türkçe "YouTube Ses Kitaplığı — atıf gerekmez" (Kartal 3 parça: Broken Promise,
// Palindrome, Standoff; Fransa 6 parça). props.json musicCues `source: 'youtube-audio-library'` taşıyordu; docu.js müzik
// listesini kurarken `source`u düşürüyordu. Teslim edilen YUKLEME dosyaları ancak elle düzeltilerek temiz çıktı.
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası): görsel kutusuna elle konan iki CC BY / CC BY-SA Commons fotoğrafının atfı
// (gorsel-kutusu/KUNYE.txt: Michael Lucan, Wolfgang Manousek) açıklamaya hiç girmedi, elle eklendi. Commons dolgusunun
// (inbox-commons.js) docu-archive-done.json'a yazdığı künye de aynı çalıştırmada açıklamaya girmiyordu: credits arşiv
// geçişinden kalmaydı, dolgu ondan sonra koşuyor.
// ÖLÇÜLEN KUSUR (25 Ekim 2026, inceleme): dolgu artık ön izleme kapısında koşuyor; kapının sonraki yeniden seçimi
// (docu-qa.js invalidateArchivePicks) docu-archive-done.json'u bütünüyle siliyordu. Commons dolgusunun künyesi yalnızca
// orada: kutunun fotoğrafı videoda kalırken CC BY atfı açıklamadan, Short'tan ve paketten düşerdi.
// Ağ YOK; kayıtlar işin kendi dosyalarının biçiminde (kısaltılarak).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kunye-bag-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { seoMusicList, withInboxCredits, forgetArchivePicks } = await import("../src/pipeline/docu.js");
const { muzikKunyesi } = await import("../src/pipeline/kunye.js");
const { renderSeoMarkdown } = await import("../src/pipeline/seo.js");
const d = fs.readFileSync(new URL("../src/pipeline/docu.js", import.meta.url), "utf8");

// produce.mjs'nin musicCues kaydı (Kartal Yuvası props.json), olduğu gibi.
const cues = [
  { title: "Standoff", artist: "Density & Time", license: "YouTube Ses Kitaplığı — atıf gerekmez", file: "standoff-49a0fd.mp3", source: "youtube-audio-library" },
  { title: "Broken Promise", artist: "Jimena Contreras", license: "YouTube Ses Kitaplığı — atıf gerekmez", file: "broken-promise-f335cc.mp3", source: "youtube-audio-library" },
  { title: "Sad Trio", artist: "Kevin MacLeod", license: "\"Sad Trio\" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0", file: "sad-trio-69695d.mp3", source: "incompetech", sourceUrl: "https://incompetech.com", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
  { title: "" },
];
const MODS = "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama, film greni ve üst yazı eklendi.";
const blockOf = (md) => md.match(/## Açıklama[^\n]*\n```\n([\s\S]*?)\n```/)[1];

test("the music list keeps each cue's source, so the English description credits the library in English, once", () => {
  const list = seoMusicList(cues);
  assert.equal(list.length, 3, "a cue without a title is not a track");
  assert.deepEqual(list[0], { file: "standoff-49a0fd.mp3", title: "Standoff", artist: "Density & Time", license: "YouTube Ses Kitaplığı — atıf gerekmez", source: "youtube-audio-library", sourceUrl: undefined, licenseUrl: undefined });
  assert.equal(seoMusicList([{ title: "Level", artist: "X" }])[0].file, "Level--X.mp3");
  const m = muzikKunyesi(list, { dil: "en" }).metin;
  assert.doesNotMatch(m, /Kitaplığı|atıf/);
  assert.equal((m.match(/YouTube Audio Library/g) || []).length, 1);
  assert.match(m, /"Sad Trio" — Kevin MacLeod/, "the CC BY track still carries its credit");
  // docu.js açıklamayı bu listeyle yazar.
  assert.match(d, /source: c\.source/);
  assert.ok(d.includes("const muzikler = seoMusicList(rendered.musicCues);"));
});

function job() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kunye-kutu-"));
  fs.mkdirSync(path.join(dir, "gorsel-kutusu"));
  fs.writeFileSync(path.join(dir, "gorsel-kutusu", "needed.json"), JSON.stringify({ items: [1, 2, 3].map((n) => ({ n, file: `build/20261024-950730/img-${n}.jpg` })) }));
  fs.writeFileSync(path.join(dir, "gorsel-kutusu", "KUNYE.txt"), [
    "01 Michael Lucan / Wikimedia Commons, CC BY-SA 3.0 de — https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_2.JPG",
    "02 Wolfgang Manousek / Wikimedia Commons, CC BY 2.0 — https://commons.wikimedia.org/wiki/File:Eagle%27s_Nest_tunnel.jpg",
    "03 Someone Else / Wikimedia Commons, CC BY 4.0 — https://commons.wikimedia.org/wiki/File:Not_placed.jpg",
  ].join("\n"));
  // Kutuda olan fotoğraflar: 01 (Commons dolgusu) ve 02 (elle). 03'ün satırı var, fotoğrafı yok.
  for (const f of ["01.jpg", "02.png"]) fs.writeFileSync(path.join(dir, "gorsel-kutusu", f), "x");
  // Commons dolgusu 01'i bu çalıştırmada doldurdu: künyesi docu-archive-done.json'da, arşiv geçişinin credits'inde yok.
  const filled = { provider: "wikimedia", eser: "Kehlsteinhaus 2004.jpg", sahip: "Commons Person", lisans: "CC BY-SA 4.0", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_2004.jpg", url: "https://upload.wikimedia.org/k.jpg", file: "build/20261024-950730/img-1.jpg", permissionVerified: true, modifications: MODS };
  const arch = { provider: "wikipedia", file: "build/20261024-950730/arch-a797af3dc45b.jpg", lisans: "Public domain", eser: "Kehlstein Mountain.JPG", sahip: "DennisPeeters" };
  fs.writeFileSync(path.join(dir, "docu-archive-done.json"), JSON.stringify({ key: "k", script: { scenes: [] }, credits: { "scene-3": arch, "inbox-01": filled } }));
  return { dir, credits: { "scene-3": arch, ai: { provider: "ai", file: "ai", all: false } } };
}

test("picture-inbox photos reach the description: the Commons fill's credit and the hand-placed ones from KUNYE.txt; an existing credit is never overwritten", () => {
  const { dir, credits } = job();
  const before = JSON.stringify(credits);
  const all = withInboxCredits(dir, credits);
  assert.equal(JSON.stringify(credits), before, "the job's credits are not changed");
  assert.equal(all["inbox-01"].sahip, "Commons Person", "the Commons fill written after the archive pass");
  assert.equal(all["elle-inbox-02"].sahip, "Wolfgang Manousek");
  assert.equal(Object.values(all).filter((c) => c.file === "build/20261024-950730/img-1.jpg").length, 1, "KUNYE.txt 01 does not double the Commons credit of the same file");
  assert.ok(!Object.values(all).some((c) => c.file === "build/20261024-950730/img-3.jpg"), "a KUNYE.txt line whose photo is not in the inbox credits nothing");
  assert.equal(all["scene-3"], credits["scene-3"]);
  const md = renderSeoMarkdown({ language: "en", topic: "Eagle's Nest" }, { title: "Eagle's Nest" }, { description: "The Eagle's Nest burned.\n\n{BOLUMLER}", titles: ["Eagle's Nest"], tags: [] }, [{ start: 0, title: "Spared" }], 767, all, seoMusicList(cues));
  const block = blockOf(md);
  assert.match(block, /Commons Person, CC BY-SA 4\.0/);
  assert.match(block, /Wolfgang Manousek, CC BY 2\.0/);
  assert.match(block, /License: https:\/\/creativecommons\.org\/licenses\/by\/2\.0\//);
  assert.doesNotMatch(block, /Michael Lucan/, "the hand line for a slot Commons already filled is skipped");
  // Kutusu olmayan iş: künye olduğu gibi.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "kunye-bos-"));
  assert.deepEqual(withInboxCredits(bare, credits), credits);
  assert.ok(d.includes("renderSeoMarkdown(job, script, seo, sectionTimes, durationSec, withInboxCredits(dir, credits),"), "docu.js writes seo.md (and so package.md) with them");
});

test("a gate repick drops the archive pass but keeps the inbox credits, and the next pass carries them", () => {
  const { dir } = job();
  const doneFile = path.join(dir, "docu-archive-done.json");
  fs.writeFileSync(path.join(dir, "docu-archive.json"), JSON.stringify({}));
  forgetArchivePicks(dir, { scenes: [] }, [3]);
  const left = JSON.parse(fs.readFileSync(doneFile, "utf8"));
  assert.deepEqual(Object.keys(left.credits), ["inbox-01"], "only the inbox credits stay; the pass itself is redone");
  assert.equal(left.key, "k");
  assert.equal(left.script, undefined, "no script: prepareEngineDocu runs the archive pass again");
  assert.equal(withInboxCredits(dir, { "scene-3": { file: "build/x.jpg" } })["inbox-01"].sahip, "Commons Person");
  // Kutu künyesi olmayan iş: kayıt eskisi gibi silinir; önbellek yoksa hiçbir şeye dokunulmaz.
  fs.writeFileSync(doneFile, JSON.stringify({ key: "k", script: { scenes: [] }, credits: { "scene-0": { file: "a.jpg" } } }));
  forgetArchivePicks(dir, { scenes: [] }, [0]);
  assert.equal(fs.existsSync(doneFile), false);
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), "kunye-onbelleksiz-"));
  const full = { key: "k", script: { scenes: [] }, credits: { "scene-0": { file: "a.jpg" }, "inbox-01": { file: "b.png" } } };
  fs.writeFileSync(path.join(bare, "docu-archive-done.json"), JSON.stringify(full));
  assert.equal(forgetArchivePicks(bare, { scenes: [] }, [0]), 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(bare, "docu-archive-done.json"), "utf8")), full);
  // docu.js: iki yeniden seçim de bu yoldan; yeni geçiş aynı senaryonun kutu künyelerini kendi kaydına yazar.
  assert.equal((d.match(/forgetArchivePicks\(dir, directed, /g) || []).length, 2, "preview gate + post-render fix");
  assert.equal((d.match(/invalidateArchivePicks\(/g) || []).length, 1, "only inside forgetArchivePicks");
  // Kayıt dönem denetiminde de silinir (docu-era-audit.js): okunan kutu künyeleri çalıştırma boyunca tutulur.
  const prep = d.slice(d.indexOf("const inboxKept = {};"), d.indexOf("ed = stripChapterCards(structuredClone(ed));"));
  assert.ok(prep.includes("if (!prev?.key || prev.key === docKey) Object.assign(inboxKept, inboxOnly(prev?.credits));"), "read with every pass record of this script");
  assert.ok(prep.includes("writeJson(doneFile, { key: docKey, script: ed, credits: { ...inboxKept, ...credits } });"), "and written back with the new pass");
});

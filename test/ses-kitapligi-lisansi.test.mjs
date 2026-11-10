// SES KİTAPLIĞI LİSANSI İNGİLİZCE (Kartal Yuvası 20261024-950730, Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: İngilizce açıklamada her müzik parçasının altına Türkçe "YouTube Ses Kitaplığı — atıf gerekmez"
//   basıldı. O satırı docu-engine/scripts/audio-library.mjs ingest-music yazıyordu: her YouTube Audio Library
//   parçasının library.json'daki `license` alanı Türkçeydi ve ses yönetmeninin ipucundan (license: t.license) olduğu
//   gibi açıklamaya gidiyordu. Künye (kunye.js muzikKunyesi) artık kitaplığı lisansından da tanıyor; yeni alınan
//   parçalar da İngilizce lisansla yazılıyor. Eski library.json kayıtları (Türkçe) yeniden yazılmadan geçerli kalır.
// Ağ YOK, ffmpeg YOK: yalnızca lisans metni ve künye.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ses-lisans-"));
process.env.NOVA_HOME = tmp;
process.env.NOVA_AUDIO_LIB = path.join(tmp, "audio-library");
process.env.NOVA_FFMPEG = "ffmpeg-yok"; // içe aktarırken ffmpeg-static aranmasın; hiçbir şey çalıştırılmıyor
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { musicLicense } = await import("../docu-engine/scripts/audio-library.mjs");
const { muzikKunyesi } = await import("../src/pipeline/kunye.js");

const YENI = "YouTube Audio Library — no attribution required";
const ESKI = "YouTube Ses Kitaplığı — atıf gerekmez";

test("ingest-music writes the YouTube Audio Library licence in English", () => {
  assert.equal(musicLicense("youtube-audio-library"), YENI);
  assert.doesNotMatch(musicLicense("youtube-audio-library"), /atıf|Kitaplığı|[çğıöşü]/i);
  assert.equal(musicLicense("mixkit"), "", "any other source stays without a licence, as before");
  assert.equal(musicLicense(undefined), "");
  const src = fs.readFileSync(new URL("../docu-engine/scripts/audio-library.mjs", import.meta.url), "utf8");
  assert.match(src, /license: musicLicense\(source\)/, "ingestMusic uses the rule, not its own literal");
  assert.doesNotMatch(src, /license:[^,\n]*Ses Kitaplığı/, "the Turkish licence is no longer written for new tracks");
});

test("the description folds the new licence into the library line, in both languages", () => {
  // docu.js's music list has no `source`: the licence alone must tell.
  const track = { title: "Standoff", artist: "Density & Time", license: musicLicense("youtube-audio-library"), file: "standoff-49a0fd.mp3" };
  assert.equal(muzikKunyesi([track], { dil: "en" }).metin, "Music: YouTube Audio Library");
  assert.equal(muzikKunyesi([track]).metin, "Müzik: YouTube Ses Kitaplığı");
  const owed = { title: "Hymn", artist: "B. Writer", license: "YouTube Audio Library — attribution required: \"Hymn\" by B. Writer", file: "hymn.mp3" };
  const en = muzikKunyesi([track, owed], { dil: "en" }).metin;
  assert.match(en, /• "Hymn" — B\. Writer/);
  assert.match(en, /• Other tracks: YouTube Audio Library$/);
  assert.doesNotMatch(en, /Standoff|no attribution required|atıf|Kitaplığı/);
});

test("older library.json entries (Turkish licence) still read as the library", () => {
  const old = { title: "Broken Promise", artist: "Jimena Contreras", license: ESKI, file: "broken-promise-f335cc.mp3" };
  assert.equal(muzikKunyesi([old], { dil: "en" }).metin, "Music: YouTube Audio Library");
  assert.equal(muzikKunyesi([old, { ...old, title: "Calm", file: "calm-1a2b3c.mp3", license: YENI }], { dil: "en" }).metin, "Music: YouTube Audio Library");
});

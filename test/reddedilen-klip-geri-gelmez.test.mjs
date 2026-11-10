// REDDEDİLEN KLİP KAYITTAN GERİ GELMEZ (docu.js bağlantısı).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası 20261024-950730): ön izleme 1-4. turların hepsi sahne 0'ı "generic" buldu
// ("This is the Kehlsteinhaus" üstünde yalnızca kaya ve çalı; 3. turda severity high). docu-qa-fixes.json scenes.0:
// rejected ["https://www.youtube.com/watch?v=nOmymsR6H9c"], tries 4, ai true. Günlük 02:25:52, 02:26:34, 02:27:12: "1 sahne
// arşivde tekrar tekrar yanlış kare verdiği için AI görseline geçiyor", hemen ardından her seferinde "Kaynak video: sahne 1
// olay görüntüsü — Video: Billy Cosgrave · Oct 2019". docu.js ret listesini kaynak video adımına hiç vermiyordu
// (attachSourceClips, kayıtlı docu-source-clips.json seçimlerini olduğu gibi yeniden uyguladı).
// Ayrıca: ön izlemenin yeniden seçimi künyeyi motor senaryosunun sırasıyla arıyordu (scene-N); ses klibi araya girince
// sonraki sahnelerde bir sonraki sahnenin kaynağı reddediliyordu.
// Ağ YOK; seçimler ve künye kaydı işin kendi dosyalarının biçiminde.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-klip-ret-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { sceneCredit } = await import("../src/pipeline/docu.js");
const { applySourcePicks } = await import("../src/pipeline/source-clips.js");
const { stablePhotoRefs } = await import("../src/pipeline/media.js");
const d = fs.readFileSync(new URL("../src/pipeline/docu.js", import.meta.url), "utf8");

const URL_ = "https://www.youtube.com/watch?v=nOmymsR6H9c";
const drone = { scene: 0, kind: "event", id: "nOmymsR6H9c", url: URL_, title: "Kehlsteinhaus - Eagle's Nest from above || Drone", channel: "Billy Cosgrave", label: "Video: Billy Cosgrave · Oct 2019", video: "build/20261024-950730/src/src-84d564d9c6.mp4", dur: 6, w: 1920, h: 1080 };
const hook = () => ({ title: "Eagle's Nest", scenes: [
  { type: "photo", say: "This is the Kehlsteinhaus.", imagePrompt: "The stone Kehlsteinhaus on its ridge", commons: "File:Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg", dur: 4 },
  { type: "photo", say: "Hitler's mountain house.", imagePrompt: "x", dur: 4 },
] });

test("docu.js passes every rejected URL (QA/preview fixes + era fixes) to the source-clip step, by address not by scene number", () => {
  const call = d.indexOf("await attachSourceClips(ed,");
  assert.ok(call > 0);
  assert.ok(d.slice(call, call + 600).includes("rejected,"), "the call carries the list");
  assert.ok(d.slice(call - 400, call).includes("const rejected = [...Object.values(readFixes()?.scenes || {}).flatMap((x) => x.rejected || []), ...eraRejectedUrls(readEraFixes(dir), era)];"));
  // Ön izlemenin yeniden seçimi künyeyi sahnenin dosyasıyla bulur; sıra yedeği yönetmenin sırası (ses-klibi-sahne-sirasi.test.mjs).
  assert.ok(d.includes("const c = sceneCredit(credits, engineDocu.scenes[f.scene], at);"));
  assert.ok(d.includes("const at = toDirected[f.scene];"));
});

test("Kartal: the preview gate rejects the drone clip, and the next round leaves scene 1 on its own picture", () => {
  // Tur 1: kayıtlı seçim sahne 0'a konur; künye sahnenin klip dosyasıyla.
  const credits = {};
  const r1 = applySourcePicks(hook(), credits, [drone]);
  assert.equal(r1.script.scenes[0].video, drone.video);
  // Ön izleme "generic" dedi: docu.js'nin yolu — künye → stablePhotoRefs → docu-qa-fixes.json scenes[0].rejected.
  const c = sceneCredit(credits, r1.script.scenes[0], 0);
  const fixes = { scenes: { 0: { rejected: [...new Set(stablePhotoRefs(c))], tries: 1, kind: "generic" } } };
  assert.ok(fixes.scenes[0].rejected.includes(URL_));
  // Tur 2: docu.js'nin kurduğu liste (dönem kaydı yok).
  const rejected = [...Object.values(fixes.scenes).flatMap((x) => x.rejected || [])];
  const logs = [];
  const r2 = applySourcePicks(hook(), {}, [drone], { rejected, logFn: (m) => logs.push(m) });
  assert.equal(r2.script.scenes[0].video, undefined, "the clip is not put back");
  assert.equal(r2.script.scenes[0].imagePrompt, "The stone Kehlsteinhaus on its ridge", "the scene keeps its own picture");
  assert.equal(r2.added.length, 0);
  assert.ok(logs.some((m) => /sahne 1 reddedilmiş klip atlandı/.test(m)));
});

test("sceneCredit: after a voice clip is inserted, the engine scene's credit is found by its file, not by the shifted index", () => {
  const credits = {
    "scene-0": { provider: "wikimedia", url: "https://upload.wikimedia.org/a.jpg", file: "build/j/arch-a.jpg" },
    "scene-1": { provider: "wikimedia", url: "https://upload.wikimedia.org/b.jpg", file: "build/j/arch-b.jpg" },
  };
  const script = { scenes: [
    { type: "photo", say: "He spoke.", image: "build/j/arch-a.jpg", archived: true, dur: 4 },
    { type: "photo", say: "Then the fire.", image: "build/j/arch-b.jpg", archived: true, dur: 4 },
  ] };
  const voice = { scene: 0, kind: "voice", id: "vvvvvvvvvvv", url: "https://www.youtube.com/watch?v=vvvvvvvvvvv", title: "Speech", channel: "C", label: "Video: C", video: "build/j/src/v.mp4", wav: "build/j/src/v.wav", dur: 3, w: 1280, h: 720, quote: "We will." };
  const { script: eng } = applySourcePicks(script, credits, [voice]);
  assert.equal(eng.scenes.length, 3, "the voice clip is a new scene after scene 0");
  // Motor sırasında sahne 2 = eski sahne 1: sıra anahtarı (scene-2) yok, dosya eşleşmesi doğru kaydı verir.
  assert.equal(sceneCredit(credits, eng.scenes[2], 2).url, "https://upload.wikimedia.org/b.jpg");
  assert.equal(sceneCredit(credits, eng.scenes[1], 1).url, voice.url, "the voice clip's own credit");
  // Sıra anahtarı yalnızca yedek: dosyası künyede olmayan sahne.
  assert.equal(sceneCredit(credits, { type: "photo" }, 0).url, "https://upload.wikimedia.org/a.jpg");
  assert.equal(sceneCredit({}, eng.scenes[0], 0), undefined);
});

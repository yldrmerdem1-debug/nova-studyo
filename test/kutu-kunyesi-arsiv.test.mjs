// ELLE KONAN KUTU FOTOĞRAFININ ATFI ARŞİV KÜNYESİNE (Kartal Yuvası 20261024-950730 — 24-25 Ekim 2026).
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası 950730): AI görsel kredisi bitti, Commons doldurması "0 görsel" koydu; iki
// CC BY / CC BY-SA Commons fotoğrafı (Michael Lucan — Joachim Herrmann, Wolfgang Manousek — Kehlsteinhaus 2004) görsel
// kutusuna elle kondu, atıfları gorsel-kutusu/KUNYE.txt'ye yazıldı. Nova o dosyayı okumuyordu: uzun açıklama da Short
// da iki fotoğrafı anmadı, atıflar açıklamaya elle eklendi. Nova'nın kendi Commons seçimi de docu-archive-done.json'a
// arşiv adımından SONRA yazılıyor; aynı çalışmanın künyesi (docu.js credits) onu da görmüyordu.
//
// KURAL: inboxCredits KUNYE.txt'nin her satırını Nova'nın kendi seçimiyle aynı kayıt olarak (inbox-NN, still dosyasıyla)
// docu-archive-done.json'a yazar ve kutunun bütün atıflarını döndürür (uzun açıklamanın künyesine katılır); Nova'nın
// kutu turu (fillInboxFromCommons) önce onu çalıştırır. Fotoğrafı
// kutuda olmayan satır yazılmaz; aynı stilin Nova'ya ait kaydı (Commons seçimi, arşiv kaydı) kalır; okunamayan dosyanın
// üstüne yazılmaz. Ağ YOK, model YOK, ffmpeg YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { fillInboxFromCommons, inboxCredits } = await import("../src/pipeline/inbox-commons.js");
const { kunyeUret } = await import("../src/pipeline/kunye.js");
const { pictureAssets, shortCredits } = await import("../src/pipeline/docu-shorts-pictures.js");

// Kartal'ın KUNYE.txt'si (bitişik yazılmış AI satırı dahil) ve needed.json'u, kısaltılarak.
const KUNYE = [
  "01 Michael Lucan / Wikimedia Commons, CC BY-SA 3.0 de — https://commons.wikimedia.org/wiki/File:2016-02-02_Joachim_Herrmann_0617.JPG",
  "02 Wolfgang Manousek from Dormagen, Germany / Wikimedia Commons, CC BY 2.0 — https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_Obersalzberg_Bavaria_Germany_2004.jpg",
  "03 AI görseli (ChatGPT) — Bavyera polis barikatı",
  "04 AI görseli (ChatGPT) — gece polis barikatı05 AI görseli (ChatGPT)",
].join("\r\n");
const FILE = (n) => `build/20261024-950730/img-${n}.jpg`;
// fillInboxFromCommons'ın kendi seçimine yazdığı düzenleme notu.
const NOVA_MODS = "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama, film greni ve üst yazı eklendi.";
const novaPick = (n) => ({ provider: "wikimedia", eser: "Kehlsteinhaus 2019.jpg", sahip: "Someone", lisans: "CC BY 4.0", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_2019.jpg", url: "https://upload.wikimedia.org/o/1", file: FILE(n), permissionVerified: true, modifications: NOVA_MODS });
const ZEPREDU = { provider: "wikimedia", lisans: "CC BY 2.5", sahip: "Ondřej Žváček", eser: "Kehlsteinhaus zepředu.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_zep%C5%99edu.jpg", lisansUrl: "https://creativecommons.org/licenses/by/2.5", file: "build/20261024-950730/cm-1f2c309dc85c.jpg", permissionVerified: true, modifications: NOVA_MODS };

function kartalJob({ done = { key: "k1", script: { scenes: [{ say: "x" }] }, credits: { "scene-12": ZEPREDU } }, dropped = ["01.jpg", "02.jpg", "03.png", "04.png"], kunye = KUNYE } = {}) {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kutu-kunye-"));
  const kutu = path.join(job, "gorsel-kutusu");
  fs.mkdirSync(kutu);
  fs.writeFileSync(path.join(kutu, "needed.json"), JSON.stringify({ items: [1, 2, 3, 4, 5].map((n) => ({ n, file: FILE(n), prompt: "x" })) }));
  for (const f of dropped) fs.writeFileSync(path.join(kutu, f), "x");
  if (kunye != null) fs.writeFileSync(path.join(kutu, "KUNYE.txt"), kunye);
  if (done != null) fs.writeFileSync(path.join(job, "docu-archive-done.json"), typeof done === "string" ? done : JSON.stringify(done));
  return job;
}
const doneOf = (job) => JSON.parse(fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8"));

test("Kartal: the two hand-placed Commons photos become archive credits in the shape of Nova's own pick; the long description credits them", () => {
  const job = kartalJob();
  const logs = [];
  const got = inboxCredits({ jobDir: job, logFn: (m) => logs.push(m) });
  assert.deepEqual(Object.keys(got), ["inbox-01", "inbox-02"], "AI lines are no credit");
  const r = got["inbox-01"];
  for (const k of Object.keys(novaPick(1)).filter((k) => k !== "url")) assert.ok(k in r, `field ${k} of Nova's own pick`);
  assert.equal(r.provider, "wikimedia");
  assert.equal(r.file, FILE(1), "keyed by the still the engine made from 01.jpg");
  assert.equal(r.sahip, "Michael Lucan");
  assert.equal(r.eser, "2016-02-02 Joachim Herrmann 0617.JPG");
  assert.equal(r.lisansUrl, "https://creativecommons.org/licenses/by-sa/3.0/de/");
  assert.equal(r.permissionVerified, true, "author + licence link + page");
  assert.equal(r.modifications, NOVA_MODS);
  assert.equal(got["inbox-02"].sahip, "Wolfgang Manousek from Dormagen, Germany");
  // The archive pass around them is untouched: its key (docu.js reuses the pass) and its own records stay.
  const d = doneOf(job);
  assert.equal(d.key, "k1");
  assert.deepEqual(d.script, { scenes: [{ say: "x" }] });
  assert.deepEqual(d.credits["scene-12"], ZEPREDU);
  assert.deepEqual(d.credits["inbox-01"], r);
  assert.ok(logs.includes("görsel kutusu: elle konan 2 fotoğrafın atfı KUNYE.txt'den künyeye yazıldı (01, 02)"), logs.join("\n"));
  // The long description (renderSeoMarkdown → kunyeUret) with the job's credits plus the returned ones.
  const credits = { "scene-12": ZEPREDU, ...got, ai: { provider: "ai", file: "ai" } };
  const g = kunyeUret(credits, { dil: "en", grouped: true });
  assert.match(g.metin, /CC BY-SA 3\.0 de \(Wikimedia Commons\): "2016-02-02 Joachim Herrmann 0617" \(Michael Lucan\)/);
  assert.match(g.metin, /CC BY 2\.0 \(Wikimedia Commons\): "Kehlsteinhaus Obersalzberg Bavaria Germany 2004" \(Wolfgang Manousek from Dormagen, Germany\)/);
  assert.equal(g.warnings.length, 0);
  assert.match(kunyeUret(credits, { dil: "en" }).metin, /"2016-02-02 Joachim Herrmann 0617\.JPG" — Michael Lucan, CC BY-SA 3\.0 de \(Wikimedia Commons\)/);
  fs.rmSync(job, { recursive: true, force: true });
});

test("Nova's own inbox round (fillInboxFromCommons) records the hand-placed photos too, with no search for a filled slot", async () => {
  const job = kartalJob({ dropped: ["01.jpg", "02.jpg", "03.png", "04.png", "05.png"] });
  let asked = 0;
  const n = await fillInboxFromCommons({ jobDir: job, llm: async () => { asked++; return { scenes: [] }; }, visionLlm: async () => { asked++; return { pick: 0 }; }, fetchImpl: async () => { throw new Error("no network in tests"); }, ffmpeg: path.join(os.tmpdir(), "nova-ffmpeg-yok", "ffmpeg.exe") });
  assert.equal(n, 0);
  assert.equal(asked, 0);
  assert.deepEqual(Object.keys(doneOf(job).credits), ["scene-12", "inbox-01", "inbox-02"]);
  fs.rmSync(job, { recursive: true, force: true });
});

test("the Short credits the hand-placed photo from docu-archive-done.json, by its file", () => {
  const job = kartalJob();
  inboxCredits({ jobDir: job });
  // KUNYE.txt gone: the credit now comes from the archive file alone.
  fs.rmSync(path.join(job, "gorsel-kutusu", "KUNYE.txt"));
  const pub = path.join(job, "docu", "public");
  fs.mkdirSync(path.join(pub, "build", "20261024-950730"), { recursive: true });
  for (const n of [1, 3]) fs.writeFileSync(path.join(pub, FILE(n)), "x");
  fs.writeFileSync(path.join(job, "docu", "20261024-950730.props.json"), JSON.stringify({ script: { scenes: [
    { say: "Bavaria's interior minister came to the scene.", image: FILE(1) },
    { say: "Police closed the road.", image: FILE(3) },
  ] } }));
  const assets = pictureAssets(job);
  assert.equal(assets.find((a) => a.rel === FILE(1))?.credit?.sahip, "Michael Lucan");
  assert.equal(assets.find((a) => a.rel === FILE(3))?.credit, undefined);
  assert.equal(shortCredits(assets), "Photos: 2016-02-02 Joachim Herrmann 0617, Michael Lucan, CC BY-SA 3.0 de, Wikimedia Commons");
  fs.rmSync(job, { recursive: true, force: true });
});

test("a second run writes nothing; a line whose photo is not in the inbox is not credited; a corrected line updates its record", () => {
  const job = kartalJob({ dropped: ["01.jpg", "02.jpg"], kunye: `${KUNYE}\r\n05 Somebody / Wikimedia Commons, CC BY 4.0 — https://commons.wikimedia.org/wiki/File:Barricade.jpg` });
  const logs = [];
  const got = inboxCredits({ jobDir: job, logFn: (m) => logs.push(m) });
  assert.deepEqual(Object.keys(got), ["inbox-01", "inbox-02"], "05 has a line but no photo in the inbox");
  assert.ok(logs.includes("görsel kutusu: KUNYE.txt satırının fotoğrafı kutuda yok (05) — atfı yazılmadı"), logs.join("\n"));
  const before = fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8");
  logs.length = 0;
  assert.deepEqual(inboxCredits({ jobDir: job, logFn: (m) => logs.push(m) }), got);
  assert.equal(fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8"), before);
  assert.ok(!logs.some((m) => /yazıldı/.test(m)), "nothing new, nothing written");
  // The person fixes the author's name: the record from KUNYE.txt follows the file.
  fs.writeFileSync(path.join(job, "gorsel-kutusu", "KUNYE.txt"), KUNYE.replace("Wolfgang Manousek from Dormagen, Germany", "Wolfgang Manousek"));
  assert.equal(inboxCredits({ jobDir: job, logFn: (m) => logs.push(m) })["inbox-02"].sahip, "Wolfgang Manousek");
  assert.ok(logs.includes("görsel kutusu: elle konan 1 fotoğrafın atfı KUNYE.txt'den künyeye yazıldı (02)"), logs.join("\n"));
  fs.rmSync(job, { recursive: true, force: true });
});

test("Nova's own record of the still wins: its Commons pick (it carries the url) and an archive record of the same file; the pick comes back too", () => {
  const scene3 = { provider: "wikimedia", eser: "Kehlsteinhaus 2004.jpg", sahip: "W. Manousek", lisans: "CC BY 2.0", file: FILE(2) };
  const job = kartalJob({ done: { key: "k1", credits: { "inbox-01": novaPick(1), "scene-3": scene3 } } });
  const before = fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8");
  const got = inboxCredits({ jobDir: job });
  assert.deepEqual(got, { "inbox-01": novaPick(1) }, "Nova's pick is returned (the job's credits lack it), no inbox-02 beside scene-3");
  assert.equal(fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8"), before);
  fs.rmSync(job, { recursive: true, force: true });
});

test("no KUNYE.txt or no inbox: nothing written; an unreadable archive file is never overwritten; a job with no archive file gets one", () => {
  // Most jobs: no inbox at all — nothing happens, nothing throws, no file appears.
  const plain = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kutu-kunye-"));
  assert.deepEqual(inboxCredits({ jobDir: plain }), {});
  assert.ok(!fs.existsSync(path.join(plain, "docu-archive-done.json")));
  // Photos dropped by hand without a KUNYE.txt: no credit is made up.
  const bare = kartalJob({ kunye: null });
  const before = fs.readFileSync(path.join(bare, "docu-archive-done.json"), "utf8");
  assert.deepEqual(inboxCredits({ jobDir: bare }), {});
  assert.equal(fs.readFileSync(path.join(bare, "docu-archive-done.json"), "utf8"), before);
  // A half-written archive file is the archive pass: left as it is, the credits are still returned for the description.
  const broken = kartalJob({ done: '{"key":"k1","script":{"scen' });
  assert.deepEqual(Object.keys(inboxCredits({ jobDir: broken })), ["inbox-01", "inbox-02"]);
  assert.equal(fs.readFileSync(path.join(broken, "docu-archive-done.json"), "utf8"), '{"key":"k1","script":{"scen');
  // An AI-only job has no archive pass: the file is started with the inbox credits (pictureAssets reads it).
  const aiOnly = kartalJob({ done: null });
  inboxCredits({ jobDir: aiOnly });
  assert.deepEqual(Object.keys(doneOf(aiOnly)), ["credits"]);
  assert.deepEqual(Object.keys(doneOf(aiOnly).credits), ["inbox-01", "inbox-02"]);
  for (const d of [plain, bare, broken, aiOnly]) fs.rmSync(d, { recursive: true, force: true });
});

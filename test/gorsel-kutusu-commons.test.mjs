// GÖRSEL KUTUSU → COMMONS: OKUNAMAYAN KÜÇÜK RESİM, DÖNEM DIŞI FOTOĞRAF, SESSİZ DÜŞEN SAHNE.
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası 950730): "eksikler Wikimedia Commons'tan … dolduruluyor" → 15 sn sonra
// 400 "Could not process image" → "0 görsel Commons'tan kondu" → iş 7 saat durdu, kutu elle dolduruldu (Herrmann ve
// Kehlsteinhaus'un Commons'ta serbest fotoğrafı vardı). Dört sahneden yalnız birinin hatası günlükte; kalanlar sessiz.
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Fransa borcu 48ae2d): iki kez 400 "specified using the image/jpeg media type" — her
// küçük resim image/jpeg diye gidiyordu, PNG aslının küçük resmi PNG'dir; iki sahne `catch {}` ile düştü. Konan tek
// fotoğraf 1934 Stavisky davası ("8-1-34, au Palais…") — 2025-2026 hikâyesinin "your savings and your loans"
// sahnesine; seçici yalnız anlatımı görüyordu, dönemi değil. QA render'dan sonra "1930'lar sepya, konuyla ilgisiz" dedi.
//
// DÜZELTME: küçük resim baytlarından türü bilinir (HTML/429 gövdesi gönderilmez), seçiciye istenen kare ve sahnenin
// dönemi söylenir, bugünkü bir sahneye ondan 30 yıldan eski tarihli fotoğraf aday bile olmaz, resim hatasında adaylar
// tek tek sorulur, her sahnenin sonucu günlüğe yazılır, elle konan 01.jpg dolu sayılır. Kapı/render ortak kural:
// inboxWaitAction (kutu beklemesi "kapı çalışmadı" değildir; kredi bitmişse önce Commons).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commonsCandidates, fillInboxFromCommons, inboxWaitAction, mediaTypeOf, tooOldFor } from "../src/pipeline/inbox-commons.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const HTML = Buffer.from("<!DOCTYPE html><html><body>Too many requests</body></html>");
// Fransa borcu needed.json n=20 ve docu-script.json sahnesi, olduğu gibi (sahnenin era alanı yok, dönem stil cümlesinde).
const PROMPT = "Wide shot of a Paris bank branch on a quiet street corner in overcast morning light, a pedestrian passing the window. Contemporary 2025-2026 French financial photojournalism, crisp digital press photograph, cool overcast Paris daylight mixed with green-on-black trading-screen glow, 35mm lens, natural contrast, realistic and unstaged. No readable text or lettering anywhere, no logos, no modern objects. Wide 16:9 cinematic documentary still.";
const SCENE = { chapter: 7, type: "photo", say: "[confident] Now the practical part: your savings and your loans.", source: "archive", imagePrompt: "Wide shot of a Paris bank branch on a quiet street corner in overcast morning light, a pedestrian passing the window" };
const STAVISKY = "8-1-34, au Palais (de justice, de g. à d.) MM. (Eugène) Montet, Bohé (i.e. Paul Boé, du Crédit Agricole et de la France Mutualiste, entendus dans l'affaire Stavisky) - btv1b532911974.jpg";

function jobWith(items, scenes = [SCENE]) {
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kutu-commons-"));
  fs.mkdirSync(path.join(job, "gorsel-kutusu"));
  fs.writeFileSync(path.join(job, "gorsel-kutusu", "needed.json"), JSON.stringify({ items }));
  fs.writeFileSync(path.join(job, "docu-script.json"), JSON.stringify({ scenes }));
  fs.writeFileSync(path.join(job, "docu-archive-done.json"), JSON.stringify({ credits: {} }));
  return job;
}
const page = (title, date, index) => ({ title: `File:${title}`, index, imageinfo: [{ width: 2400, height: 1600, url: `https://upload.wikimedia.org/o/${index}`, thumburl: `https://upload.wikimedia.org/t/${index}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${index}`, extmetadata: { LicenseShortName: { value: "Public domain" }, Artist: { value: "Someone" }, ...(date ? { DateTimeOriginal: { value: date } } : {}) } }] });
/** Commons API + küçük resimler: thumbs[i] = { status, body }. Hangi küçük resmin istendiği kaydedilir. */
function commons(pages, thumbs) {
  const asked = [];
  const fetchImpl = async (u) => {
    if (u.startsWith("https://commons.wikimedia.org/w/api.php")) return { ok: true, json: async () => ({ query: { pages: Object.fromEntries(pages.map((p, i) => [i + 1, p])) } }) };
    const i = Number(u.split("/").pop());
    asked.push(i);
    const t = thumbs[i] || { status: 404, body: HTML };
    return { ok: t.status === 200, status: t.status, arrayBuffer: async () => t.body.buffer.slice(t.body.byteOffset, t.body.byteOffset + t.body.length) };
  };
  return { fetchImpl, asked };
}
/** Anthropic API gibi: söylenen tür baytlarla uyuşmazsa 400. */
const apiChecks = (images) => {
  for (const im of images) if (mediaTypeOf(Buffer.from(im.data, "base64")) !== im.mediaType) throw Object.assign(new Error(`400 messages.0.content.1.image.source.base64: The image was specified using the ${im.mediaType} media type, but the image appears to be a different image`), { status: 400 });
};
const llm = async () => ({ scenes: [{ n: 20, queries: ["Paris bank branch"] }] });
const NO_FFMPEG = path.join(os.tmpdir(), "nova-ffmpeg-yok", "ffmpeg.exe");

test("the type comes from the bytes: JPEG, PNG, GIF, WEBP; an HTML error page or an empty body is not a picture", () => {
  assert.equal(mediaTypeOf(JPEG), "image/jpeg");
  assert.equal(mediaTypeOf(PNG), "image/png");
  assert.equal(mediaTypeOf(Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00")), "image/gif");
  assert.equal(mediaTypeOf(Buffer.from("RIFF\x10\x00\x00\x00WEBPVP8 ")), "image/webp");
  assert.equal(mediaTypeOf(HTML), null);
  assert.equal(mediaTypeOf(Buffer.alloc(8)), null);
  assert.equal(mediaTypeOf(null), null);
});

test("era guard: a 1934 photo is not a 2025-2026 scene; a 2004 photo of the building is fine for 2026; history is untouched", () => {
  assert.equal(tooOldFor(1934, { start: 2025, end: 2026 }), true);
  assert.equal(tooOldFor(2004, { start: 2026, end: 2026 }), false, "Kartal: the user's own Kehlsteinhaus pick");
  assert.equal(tooOldFor(1934, { start: 1939, end: 1945 }), false);
  assert.equal(tooOldFor(1890, { start: 1939, end: 1945 }), false, "only present-day stories");
  assert.equal(tooOldFor(null, { start: 2025, end: 2026 }), false, "an undated photo is the picker's call");
  assert.equal(tooOldFor(1934, null), false);
});

test("a candidate carries the photo's own date (DateTimeOriginal), not the upload date", async () => {
  const { fetchImpl } = commons([page("Stavisky.jpg", '<time class="dtstart" datetime="1934-01-08">8 January 1934</time>', 1), page("Agence.jpg", null, 2), page("Bank.jpg", "circa 1930s", 3)], {});
  const c = await commonsCandidates("Paris bank", { fetchImpl });
  assert.deepEqual(c.map((x) => x.year), [1934, null, 1930]);
});

test("France debt slot 20: the 1934 Stavisky photo never competes, HTML bodies are never sent, the PNG goes as image/png with the wanted picture and era", async () => {
  const job = jobWith([{ n: 20, file: "build/20261024-48ae2d/img-c5b5d1186b11.jpg", prompt: PROMPT }]);
  const { fetchImpl, asked } = commons(
    [page(STAVISKY, "1934", 1), page("Agence bancaire Paris 403.jpg", "2021-03-02", 2), page("Agence bancaire Paris 429.jpg", "2022", 3), page("Crédit Lyonnais agence Paris 2019.png", "2019-05-04", 4)],
    { 1: { status: 200, body: JPEG }, 2: { status: 403, body: HTML }, 3: { status: 200, body: HTML }, 4: { status: 200, body: PNG } },
  );
  const seen = [];
  const visionLlm = async ({ user, images }) => {
    apiChecks(images);
    seen.push({ user, images });
    return { pick: 1 };
  };
  const logs = [];
  const n = await fillInboxFromCommons({ jobDir: job, llm, visionLlm, fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m) });
  assert.ok(!asked.includes(1), "the 1934 photo is not even downloaded");
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].images.map((x) => x.mediaType), ["image/png"], "403 page and the HTML body with status 200 are dropped");
  assert.match(seen[0].images[0].etiket, /Crédit Lyonnais agence Paris 2019\.png \(dated 2019\)/);
  assert.match(seen[0].user, /Wanted picture: "Wide shot of a Paris bank branch on a quiet street corner/);
  assert.match(seen[0].user, /set in 2025-2026: a photo plainly from another era/);
  assert.match(seen[0].user, /Narration: "Now the practical part: your savings and your loans\."/);
  // ffmpeg yok: seçim doğru adaya düştü, dönüştürme günlüğe yazıldı, sahte künye yok.
  assert.equal(n, 0);
  assert.ok(logs.some((m) => m === "görsel kutusu 20: seçilen fotoğraf dönüştürülemedi (Crédit Lyonnais agence Paris 2019.png)"), logs.join("\n"));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8")).credits, {});
});

test("only old photos found: the slot says so instead of disappearing", async () => {
  const job = jobWith([{ n: 20, file: "build/x/img-20.jpg", prompt: PROMPT }]);
  const { fetchImpl } = commons([page(STAVISKY, "1934", 1)], { 1: { status: 200, body: JPEG } });
  let calls = 0;
  const logs = [];
  const n = await fillInboxFromCommons({ jobDir: job, llm, visionLlm: async () => ({ pick: ++calls }), fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m) });
  assert.equal(n, 0);
  assert.equal(calls, 0);
  assert.ok(logs.includes("görsel kutusu 20: Commons'ta aday yok (Paris bank branch) — 1 aday 2025-2026 sahnesi için fazla eski (1934)"), logs.join("\n"));
});

test("Kartal: one picture the API cannot read no longer loses the slot — the error is logged and each candidate is asked alone", async () => {
  const job = jobWith([{ n: 2, file: "build/20261024-950730/img-0151dc1ffedb.jpg", prompt: "Back view of a stone mountain house among rocks under a pale overcast sky, quiet and empty. Sober documentary photograph." }], [{ say: "Should Bavaria rebuild it as it stood, or leave the ruin on the peak?", imagePrompt: "Back view of a stone mountain house among rocks under a pale overcast sky, quiet and empty", era: "2026" }]);
  const BAD = Buffer.concat([JPEG, Buffer.from("cmyk")]);
  const { fetchImpl } = commons([page("Kehlsteinhaus cmyk scan.jpg", null, 1), page("Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg", "2004", 2)], { 1: { status: 200, body: BAD }, 2: { status: 200, body: JPEG } });
  const badB64 = BAD.toString("base64");
  const sets = [], users = [];
  const visionLlm = async ({ user, images }) => {
    sets.push(images.length);
    users.push(user);
    if (images.some((x) => x.data === badB64)) throw Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Could not process image"}}'), { status: 400 });
    return { pick: 1 };
  };
  const logs = [];
  await fillInboxFromCommons({ jobDir: job, llm: async () => ({ scenes: [{ n: 2, queries: ["Kehlsteinhaus"] }] }), visionLlm, fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m) });
  assert.deepEqual(sets, [2, 1, 1], "both together, then the unreadable one alone, then the good one alone");
  assert.ok(users.every((u) => /set in 2026:/.test(u)), "the scene's own era, not a year from the prompt");
  assert.ok(logs.some((m) => /^görsel kutusu 02: seçim yapılamadı \(.*Could not process image/.test(m)), logs.join("\n"));
  assert.ok(logs.includes("görsel kutusu 02: seçilen fotoğraf dönüştürülemedi (Kehlsteinhaus Obersalzberg Bavaria Germany 2004.jpg)"), "the readable 2004 photo was picked");
});

test("a non-image error (no credit) is logged once and not retried per picture; a refusal is logged too", async () => {
  const mk = () => jobWith([{ n: 20, file: "build/x/img-20.jpg", prompt: PROMPT }]);
  const pages = [page("Agence A.jpg", "2020", 1), page("Agence B.jpg", "2021", 2)];
  const thumbs = { 1: { status: 200, body: JPEG }, 2: { status: 200, body: JPEG } };
  let calls = 0;
  const logs = [];
  await fillInboxFromCommons({ jobDir: mk(), llm, visionLlm: async () => { calls++; throw new Error("400 Your credit balance is too low to access the Anthropic API"); }, fetchImpl: commons(pages, thumbs).fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m) });
  assert.equal(calls, 1);
  assert.ok(logs.some((m) => /^görsel kutusu 20: seçim yapılamadı \(400 Your credit balance/.test(m)));
  await fillInboxFromCommons({ jobDir: mk(), llm, visionLlm: async () => ({ pick: 0 }), fetchImpl: commons(pages, thumbs).fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m) });
  assert.ok(logs.includes("görsel kutusu 20: 2 adaydan hiçbiri satıra uymadı"));
});

// Houthi–Saudi news, 28 Oct 2026 (20261028-59b606), slot 09: the two scenes' imagePrompts as written.
const RIYADH = { type: "photo", say: "Riyadh heard explosions, and phones buzzed with shelter alerts.", imagePrompt: "Extreme close-up of a hand holding a smartphone in a dark bedroom, the screen glowing bright white on the fingers, no readable text, curtains lit faintly by city light", era: "2026" };
const HOUTHI = { type: "photo", say: "Mohammed Ali al-Houthi, of the group's political bureau, answered on Telegram.", imagePrompt: "Extreme close-up of a hand holding a smartphone in a dark room, screen glow on the fingers, no readable text", name: "Mohammed Ali al-Houthi", role: "Member, Houthi political bureau", era: "2026" };
const STYLE = ". Contemporary photojournalistic documentary photograph, natural harsh Gulf daylight. Set in 2026. Wide 16:9 cinematic documentary still.";

test("Houthi slot 09: the scene is matched on its whole prompt, not the first 50 characters, and a name card searches the person", async () => {
  const job = jobWith([{ n: 9, file: "build/x/img-09.jpg", prompt: HOUTHI.imagePrompt + STYLE }], [RIYADH, HOUTHI]);
  const { sceneOf } = await import("../src/pipeline/inbox-commons.js");
  assert.equal(sceneOf(job, HOUTHI.imagePrompt + STYLE).name, "Mohammed Ali al-Houthi");
  assert.equal(sceneOf(job, RIYADH.imagePrompt + STYLE).say, RIYADH.say);
  const portrait = { title: "File:Muhammad Ali Al Houthi.png", index: 1, imageinfo: [{ width: 869, height: 548, url: "https://upload.wikimedia.org/o/1", thumburl: "https://upload.wikimedia.org/t/1", descriptionurl: "https://commons.wikimedia.org/wiki/File:1", extmetadata: { LicenseShortName: { value: "CC BY 3.0" }, Artist: { value: "Aden TV" } } }] };
  const queries = [];
  const base = commons([portrait], { 1: { status: 200, body: PNG } });
  const fetchImpl = async (u, o) => {
    if (u.startsWith("https://commons.wikimedia.org/w/api.php")) queries.push(decodeURIComponent(u.match(/gsrsearch=([^&]+)/)[1]));
    return base.fetchImpl(u, o);
  };
  let planUser = "", visionUser = "";
  const logs = [];
  await fillInboxFromCommons({
    jobDir: job,
    llm: async ({ user }) => { planUser = user; return { scenes: [{ n: 9, queries: ["Houthi political bureau Telegram"] }] }; },
    visionLlm: async ({ user }) => { visionUser = user; return { pick: 1 }; },
    fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m),
  });
  assert.match(planUser, /narration: "Mohammed Ali al-Houthi, of the group's political bureau, answered on Telegram\."/);
  assert.match(planUser, /NAME CARD for Mohammed Ali al-Houthi \(Member, Houthi political bureau\)/);
  assert.equal(queries[0], "Mohammed Ali al-Houthi filetype:bitmap", "the name is searched first even when the writer forgot it");
  assert.match(visionUser, /name card for Mohammed Ali al-Houthi.*skyline or object under a person's name is 0/);
  assert.ok(logs.includes("görsel kutusu 09: seçilen fotoğraf dönüştürülemedi (Muhammad Ali Al Houthi.png)"), "the 869 px portrait reached the picker: " + logs.join("\n"));
});

test("Houthi slot 09: the picked portrait goes into the archive record (name card back, credited as scene-N), not the AI slot", async () => {
  const { pictureSize } = await import("../src/pipeline/inbox-commons.js");
  // JPEG with a SOF0 header: 869x548, the size of the real Commons still.
  const SOF = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x24, 0x03, 0x65, 0x03]), Buffer.alloc(24)]);
  assert.deepEqual(pictureSize(SOF), { w: 869, h: 548 });
  assert.deepEqual(pictureSize(Buffer.concat([PNG, Buffer.from([0, 0, 3, 0x65, 0, 0, 2, 0x24])])), { w: 869, h: 548 });
  const job = jobWith([{ n: 9, file: "build/20261028-59b606/img-ca8c2210e8da.jpg", prompt: HOUTHI.imagePrompt + STYLE }], [RIYADH, HOUTHI]);
  // The archive pass as it stood: the card already dropped ("no real photo"), the scene not archived.
  const { name, role, ...dropped } = HOUTHI;
  fs.writeFileSync(path.join(job, "docu-archive-done.json"), JSON.stringify({ key: "k", script: { scenes: [{ ...RIYADH }, dropped] }, credits: {} }));
  const portrait = { title: "File:Muhammad Ali Al Houthi.jpg", index: 1, imageinfo: [{ width: 869, height: 548, url: "https://upload.wikimedia.org/o/1", thumburl: "https://upload.wikimedia.org/t/1", descriptionurl: "https://commons.wikimedia.org/wiki/File:1", extmetadata: { LicenseShortName: { value: "CC BY 3.0" }, Artist: { value: "Aden TV" } } }] };
  const { fetchImpl } = commons([portrait], { 1: { status: 200, body: SOF } });
  const logs = [];
  const n = await fillInboxFromCommons({ jobDir: job, llm: async () => ({ scenes: [{ n: 9, queries: ["Mohammed Ali al-Houthi"] }] }), visionLlm: async () => ({ pick: 1 }), fetchImpl, ffmpeg: NO_FFMPEG, logFn: (m) => logs.push(m) });
  assert.equal(n, 1);
  const d = JSON.parse(fs.readFileSync(path.join(job, "docu-archive-done.json"), "utf8"));
  const s = d.script.scenes[1];
  assert.equal(s.archived, true);
  assert.equal(s.name, "Mohammed Ali al-Houthi");
  assert.equal(s.role, "Member, Houthi political bureau");
  assert.deepEqual([s.imgW, s.imgH], [869, 548]);
  assert.match(s.image, /^build\/20261028-59b606\/arch-cm-09-/);
  assert.ok(fs.existsSync(path.join(job, "docu", "public", s.image)), "the photo is where the engine reads archived pictures");
  assert.equal(d.credits["scene-1"].eser, "Muhammad Ali Al Houthi.jpg");
  assert.equal(d.credits["scene-1"].lisans, "CC BY 3.0");
  assert.ok(!d.script.scenes[0].archived, "the Riyadh scene is untouched");
  assert.ok(!fs.existsSync(path.join(job, "gorsel-kutusu", "09.png")), "no AI-slot copy for the gate to call an AI face");
  assert.ok(logs.some((m) => /görsel kutusu 09: Mohammed Ali al-Houthi isim kartı ← Commons: Muhammad Ali Al Houthi\.jpg/.test(m)), logs.join("\n"));
});

test("an ordinary scene still asks for 1200 px", async () => {
  const small = { title: "File:Small.jpg", index: 1, imageinfo: [{ width: 869, height: 548, url: "u", thumburl: "t", descriptionurl: "d", extmetadata: { LicenseShortName: { value: "CC BY 3.0" } } }] };
  const { fetchImpl } = commons([small], {});
  assert.equal((await commonsCandidates("x", { fetchImpl })).length, 0);
  assert.equal((await commonsCandidates("x", { fetchImpl, minWidth: 800 })).length, 1);
});

test("a still the user dropped by hand as 01.jpg is a filled slot (the engine takes jpg/jpeg/webp too)", async () => {
  const job = jobWith([{ n: 1, file: "build/x/img-1.jpg", prompt: PROMPT }]);
  fs.writeFileSync(path.join(job, "gorsel-kutusu", "01.jpg"), JPEG);
  let asked = 0;
  const n = await fillInboxFromCommons({ jobDir: job, llm: async () => { asked++; return { scenes: [] }; }, visionLlm: async () => ({ pick: 1 }), fetchImpl: async () => { throw new Error("no network in tests"); }, ffmpeg: NO_FFMPEG });
  assert.equal(n, 0);
  assert.equal(asked, 0, "no Commons search, no false credit for a picture the user chose");
});

test("inboxWaitAction: the inbox wait is not a gate failure; with no AI credit Commons comes first, manual stops with the engine's message", () => {
  const wait = new Error("Sinematik motor: 4 görsel ChatGPT'den bekleniyor — C:\\jobs\\20261024-950730\\gorsel-kutusu\\LISTE.txt içindeki tarifleri ChatGPT'de üret …");
  assert.equal(inboxWaitAction(wait, {}), "commons");
  assert.equal(inboxWaitAction(wait, { docuImageProvider: "openai" }), "commons");
  assert.equal(inboxWaitAction(wait, { docuImageProvider: "manual" }), "inbox");
  assert.equal(inboxWaitAction(wait, {}, { commonsTried: true }), "inbox", "one Commons round per stop");
  assert.equal(inboxWaitAction(new Error("Timed out after 30000 ms while trying to connect to the browser"), {}), null);
  assert.equal(inboxWaitAction(null, {}), null);
});
